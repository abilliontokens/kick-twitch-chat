// Twitch orchestrator: mounts the merged pane inside Twitch chat and feeds it
// with Twitch IRC plus the mapped Kick channel. Kick's realtime WebSocket only
// accepts kick.com origins, so on Twitch the Kick side is polled through the
// service worker every 800 ms. Cursor-based history pagination walks backwards
// to close gaps larger than the newest 25-message page.
(() => {
  const KTW = window.KTW;
  if (!KTW) return;
  if (window.top !== window) return;

  const DEFAULTS = {
    enabled: true,
    twitchChannel: {},
    kickByTwitch: {},
    showTimestamps: true,
    showBadges: true,
    tintTwitch: true,
    tintKick: true,
    colorBar: true,
    kickIcon: true,
    kickBadges: true,
  };
  const RESERVED = new Set([
    "about", "advertise", "bits", "channel", "collections", "creatorcamp", "dashboard",
    "developer", "directory", "downloads", "drops", "embed", "events", "following", "friends",
    "inventory", "jobs", "legal", "messages", "moderator", "notifications", "partner",
    "payments", "popout", "press", "prime", "privacy", "p", "redeem", "schedule", "search",
    "security", "settings", "store", "subscriptions", "team", "terms", "turbo", "videos",
    "wallet",
  ]);
  const POLL_LIVE_MS = 30000;
  const POLL_FALLBACK_MS = 5000;

  let settings = { ...DEFAULTS };
  let pane = null;
  let twitch = null;
  let active = null;
  let generation = 0;
  let lastPath = location.pathname;
  let statusState = { kick: "idle", twitch: "idle" };
  let twitchNotified = false;
  let observer = null;
  let mountQueued = false;
  let kickTimer = null;
  let kickSeen = new Set();
  let kickThroughTs = 0;
  let kickFloorTs = 0;
  let kickFailures = 0;
  let pollDelay = POLL_FALLBACK_MS;
  let pusher = null;
  let pusherLive = false;
  let lastHistoryOkAt = 0;
  let sevenTVIds = { kickUserId: null, twitchUserId: null };
  let sevenTVTimer = null;

  function cleanSlug(value) {
    if (!value) return null;
    const slug = String(value).trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(slug)) return null;
    if (RESERVED.has(slug)) return null;
    return slug;
  }

  function parseTwitchChannel(pathname) {
    const parts = pathname
      .split("/")
      .filter(Boolean)
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      });
    if (!parts.length) return null;
    if (["popout", "embed", "moderator"].includes(parts[0])) return cleanSlug(parts[1]);
    return cleanSlug(parts[0]);
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(DEFAULTS);
      return {
        enabled: stored.enabled !== false,
        twitchChannel: stored.twitchChannel && typeof stored.twitchChannel === "object" ? stored.twitchChannel : {},
        kickByTwitch: stored.kickByTwitch && typeof stored.kickByTwitch === "object" ? stored.kickByTwitch : {},
        showTimestamps: stored.showTimestamps !== false,
        showBadges: stored.showBadges !== false,
        tintTwitch: stored.tintTwitch !== false,
        tintKick: stored.tintKick !== false,
        colorBar: (stored.colorBar !== undefined ? stored.colorBar : stored.kickMarker) !== false,
        kickIcon: stored.kickIcon !== false,
        kickBadges: stored.kickBadges !== false,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  async function loadBadgeMap() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "ktw:twitch-badges" });
      if (response && response.ok && response.map) KTW.setTwitchBadges(response.map);
    } catch {
      /* badges fall back to text pills */
    }
  }

  function findHost() {
    const scrollers = [...document.querySelectorAll('[data-a-target="chat-scroller"]')];
    const visible = scrollers.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && node.offsetParent !== null;
    });
    const scroller = visible || scrollers[0];
    if (!scroller) return null;
    const host = scroller.parentElement;
    if (!host) return null;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    return host;
  }

  function ensureMounted() {
    if (!pane) return false;
    const host = findHost();
    if (!host) return false;
    return pane.mount(host);
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(() => {
      mountQueued = false;
      ensureMounted();
    });
  }

  function setStatus(who, state, detail) {
    statusState[who] = state;
    if (pane) pane.setStatus(who, state, detail || "");
  }

  function requestSevenTV() {
    if (!pane) return;
    if (!sevenTVIds.kickUserId && !sevenTVIds.twitchUserId) return;
    clearTimeout(sevenTVTimer);
    const myGeneration = generation;
    sevenTVTimer = setTimeout(async () => {
      const payload = await KTW.loadSevenTV({ ...sevenTVIds });
      if (myGeneration !== generation || !payload || !pane) return;
      pane.refreshEmotes();
    }, 250);
  }

  function teardown() {
    generation += 1;
    if (twitch) twitch.stop();
    twitch = null;
    if (pusher) pusher.stop();
    pusher = null;
    pusherLive = false;
    lastHistoryOkAt = 0;
    clearTimeout(kickTimer);
    kickTimer = null;
    clearTimeout(sevenTVTimer);
    sevenTVTimer = null;
    kickSeen = new Set();
    kickThroughTs = 0;
    kickFloorTs = 0;
    kickFailures = 0;
    pollDelay = POLL_FALLBACK_MS;
    sevenTVIds = { kickUserId: null, twitchUserId: null };
    if (KTW.resetSevenTVChannels) KTW.resetSevenTVChannels();
    if (pane) pane.unmount();
    for (const stray of document.querySelectorAll("#ktw-pane")) stray.remove();
    pane = null;
    active = null;
    twitchNotified = false;
    statusState = { kick: "idle", twitch: "idle" };
  }

  function startPane(twitchSlug, kickSlug) {
    pane = new KTW.ChatPane({
      onNativeModeChange: () => {},
      onAppearanceChange: (partial) => {
        settings = { ...settings, ...partial };
        if (pane) pane.setAppearance(settings);
        chrome.storage.sync.set(partial).catch(() => {});
      },
    });
    pane.setChannel({ kickSlug, twitchSlug });
    pane.setAppearance(settings);
    setStatus("kick", "connecting");
    setStatus("twitch", "connecting");
    ensureMounted();
  }

  async function kickBatch(chatId, maxPages = 8, initial = false) {
    const gap = await KTW.collectKickGap({
      chatId,
      seen: kickSeen,
      throughTs: kickThroughTs,
      floorTs: kickFloorTs,
      maxPages,
    });
    // The first load intentionally stops after maxPages without connecting to
    // timestamp zero. Anchor coverage at the newest fetched message so later
    // polls do not walk history again.
    kickThroughTs = initial ? gap.observedNewestTs || Date.now() : gap.newestTs;
    if (!gap.messages.length) return 0;
    for (const msg of gap.messages) {
      if (msg.id) kickSeen.add(msg.id);
    }
    if (pane) pane.addBackfill(gap.messages, settings);
    if (kickSeen.size > 8000) kickSeen = new Set();
    return gap.messages.length;
  }

  function startKickPolling(chatId, myGeneration) {
    const poll = async () => {
      if (myGeneration !== generation || !active) return;
      try {
        const added = await kickBatch(chatId, pusherLive ? 2 : 6);
        kickFailures = 0;
        pollDelay = POLL_FALLBACK_MS;
        if (added > 0) {
          lastHistoryOkAt = Date.now();
          if (!pusherLive) setStatus("kick", "live");
        } else if (!pusherLive && !lastHistoryOkAt) {
          setStatus("kick", "connecting");
        }
      } catch (err) {
        kickFailures += 1;
        pollDelay = Math.min(30000, Math.max(POLL_FALLBACK_MS, pollDelay * 2));
        if (!pusherLive && kickFailures >= 2) {
          setStatus("kick", "error", String(err && err.message ? err.message : err));
        }
      }
      if (myGeneration !== generation || !active) return;
      kickTimer = setTimeout(poll, pusherLive ? POLL_LIVE_MS : pollDelay);
    };
    kickTimer = setTimeout(poll, POLL_FALLBACK_MS);
  }

  function describeKickSystem(eventName, data) {
    if (!data || typeof data !== "object") return null;
    const name = data.username || (data.user && data.user.username) || data.gifter_username;
    if (eventName === "App\\Events\\SubscriptionEvent") return name ? `${name} subscribed` : null;
    if (eventName === "App\\Events\\GiftedSubscriptionsEvent") {
      const count =
        (Array.isArray(data.gifted_usernames) && data.gifted_usernames.length) || data.quantity || 1;
      return `${name || "Someone"} gifted ${count} subscription${count === 1 ? "" : "s"}`;
    }
    return null;
  }

  async function startFeeds(twitchSlug, kickSlug, myGeneration) {
    twitch = new KTW.TwitchChat({
      channel: twitchSlug,
      onStatus: (state, detail) => {
        setStatus("twitch", state, detail);
        if (state === "live" && !twitchNotified && pane) {
          twitchNotified = true;
          pane.system({ src: "twitch", text: `Twitch chat connected — #${twitchSlug}` });
        }
        if (state === "error" && detail && pane) {
          pane.system({ src: "twitch", text: `Twitch: ${detail}` });
        }
      },
      onRoomId: (roomId) => {
        if (myGeneration !== generation) return;
        sevenTVIds.twitchUserId = roomId;
        requestSevenTV();
      },
      onMessage: (msg) => {
        if (myGeneration !== generation || !pane) return;
        pane.add(msg, settings);
      },
      onSystem: (entry) => {
        if (myGeneration !== generation || !pane) return;
        if (entry && entry.text) pane.system(entry);
      },
      onDelete: (id) => {
        if (myGeneration !== generation || !pane) return;
        pane.removeMessage("twitch", id);
      },
      onClear: ({ user }) => {
        if (myGeneration !== generation || !pane) return;
        if (user) pane.removeUser("twitch", user);
        else {
          pane.clearSource("twitch");
          pane.system({ src: "twitch", text: "Twitch chat was cleared" });
        }
      },
    });
    twitch.start();

    let info = null;
    try {
      const response = await chrome.runtime.sendMessage({ type: "ktw:kick-info", slug: kickSlug });
      if (response && response.ok) info = response.info;
    } catch {
      info = null;
    }
    if (myGeneration !== generation) return;
    if (!info || !info.chatId) {
      setStatus("kick", "error", "Kick channel not found");
      if (pane) pane.system({ src: "kick", text: `Could not find Kick channel #${kickSlug}` });
      return;
    }
    active.chatId = info.chatId;
    sevenTVIds.kickUserId = info.userId;
    requestSevenTV();

    try {
      const seeded = await kickBatch(info.chatId, 2, true);
      if (seeded > 0) lastHistoryOkAt = Date.now();
    } catch {
      /* history is optional; Pusher is the primary feed */
    }
    if (myGeneration !== generation) return;

    pusher = new KTW.KickPusher({
      chatId: info.chatId,
      onStatus: (state, detail) => {
        if (myGeneration !== generation) return;
        pusherLive = state === "live";
        if (state === "live") {
          kickFailures = 0;
          setStatus("kick", "live");
        } else if (state === "error") {
          if (Date.now() - lastHistoryOkAt > 15000) setStatus("kick", "error", detail);
        } else if (!lastHistoryOkAt) {
          setStatus("kick", "connecting");
        }
      },
      onMessage: (msg) => {
        if (myGeneration !== generation || !pane) return;
        setStatus("kick", "live");
        pane.add(msg, settings);
      },
      onDelete: (id) => {
        if (myGeneration !== generation || !pane) return;
        pane.removeMessage("kick", id);
      },
      onClear: () => {
        if (myGeneration !== generation || !pane) return;
        pane.clearSource("kick");
        pane.system({ src: "kick", text: "Kick chat was cleared" });
      },
      onSystem: (eventName, data) => {
        if (myGeneration !== generation || !pane) return;
        const text = describeKickSystem(eventName, data);
        if (text) pane.system({ src: "kick", text });
      },
    });
    pusher.start();
    startKickPolling(info.chatId, myGeneration);
  }

  function route(force) {
    const twitchSlug = parseTwitchChannel(location.pathname);
    lastPath = location.pathname;
    if (!settings.enabled || !twitchSlug) {
      teardown();
      return;
    }
    const mapped = settings.kickByTwitch && settings.kickByTwitch[twitchSlug];
    const kickSlug = cleanSlug(mapped) || twitchSlug;
    if (!force && active && active.twitchSlug === twitchSlug) {
      ensureMounted();
      return;
    }
    teardown();
    const myGeneration = generation;
    active = { twitchSlug, kickSlug, chatId: null, startedAt: Date.now() };
    kickFloorTs = active.startedAt - 5 * 60 * 1000;
    startPane(twitchSlug, kickSlug);
    startFeeds(twitchSlug, kickSlug, myGeneration).catch((err) => {
      if (myGeneration !== generation || !pane) return;
      pane.system({ src: "kick", text: `Kick: ${err && err.message ? err.message : err}` });
    });
  }

  function startObservers() {
    observer = new MutationObserver(() => queueMount());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => {
      if (location.pathname !== lastPath) {
        route(false);
        return;
      }
      ensureMounted();
    }, 700);
  }

  function applyLiveSettings() {
    if (!settings.enabled) {
      teardown();
      return;
    }
    if (!active) {
      route(false);
      return;
    }
    if (pane) {
      pane.setAppearance(settings);
      const mapped = settings.kickByTwitch && settings.kickByTwitch[active.twitchSlug];
      const wanted = cleanSlug(mapped) || active.twitchSlug;
      if (wanted !== active.kickSlug) {
        route(true);
        return;
      }
    }
    ensureMounted();
  }

  async function boot() {
    settings = await loadSettings();
    await loadBadgeMap();
    route(false);
    startObservers();

    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area !== "sync") return;
      loadSettings().then((next) => {
        settings = next;
        applyLiveSettings();
      });
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return undefined;
      if (message.type === "ktw:status") {
        sendResponse({
          ok: true,
          host: "twitch",
          enabled: settings.enabled,
          channel: active ? active.twitchSlug : null,
          twitchSlug: active ? active.twitchSlug : null,
          kickSlug: active ? active.kickSlug : null,
          chatId: active ? active.chatId : null,
          mounted: Boolean(pane && pane.mounted),
          kick: statusState.kick,
          twitch: statusState.twitch,
        });
        return undefined;
      }
      if (message.type === "ktw:refresh") {
        route(true);
        sendResponse({ ok: true });
        return undefined;
      }
      return undefined;
    });
  }

  boot();
})();
