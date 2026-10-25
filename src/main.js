// Orchestrator: resolves the current Kick channel, mounts the merged pane,
// starts the Kick and Twitch feeds, and keeps everything alive across Kick's
// client-side navigation and re-renders.
(() => {
  const KTW = window.KTW;
  if (!KTW) return;
  if (window.top !== window) return;

  const DEFAULTS = {
    enabled: true,
    twitchChannel: {},
    showTimestamps: true,
    showBadges: true,
    tintTwitch: true,
    tintKick: true,
    colorBar: true,
    kickIcon: true,
    kickBadges: true,
  };
  const RESERVED = new Set([
    "about", "api", "browse", "categories", "category", "channel", "chat", "clips", "clip",
    "communities", "create", "creator-dashboard", "dashboard", "discover", "drops", "embed",
    "events", "following", "help", "leaderboard", "login", "messages", "mute", "notifications",
    "popout", "privacy", "redeem", "rewards", "search", "settings", "sign-up", "signup", "store",
    "stream", "subscriptions", "support", "terms", "user", "video", "vod", "wallet",
  ]);

  let settings = { ...DEFAULTS };
  let pane = null;
  let kick = null;
  let twitch = null;
  let active = null;
  let generation = 0;
  let lastPath = location.pathname;
  let statusState = { kick: "idle", twitch: "idle" };
  let twitchNotified = false;
  let observer = null;
  let mountQueued = false;
  let sevenTVIds = { kickUserId: null, twitchUserId: null };
  let sevenTVTimer = null;

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

  function parseKickSlug(pathname) {
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
    if (parts[0] === "popout" || parts[0] === "embed") {
      return cleanSlug(parts[1]);
    }
    const first = parts[0].toLowerCase();
    if (RESERVED.has(first)) return null;
    return cleanSlug(parts[0]);
  }

  function cleanSlug(value) {
    if (!value) return null;
    const slug = String(value).trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(slug)) return null;
    if (RESERVED.has(slug)) return null;
    return slug;
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(DEFAULTS);
      return {
        enabled: stored.enabled !== false,
        twitchChannel:
          stored.twitchChannel && typeof stored.twitchChannel === "object"
            ? stored.twitchChannel
            : {},
        showTimestamps: stored.showTimestamps !== false,
        showBadges: stored.showBadges !== false,
        tintTwitch: stored.tintTwitch !== false,
        tintKick: stored.tintKick !== false,
        colorBar:
          (stored.colorBar !== undefined ? stored.colorBar : stored.kickMarker) !== false,
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
      /* badge images are optional; text badges remain */
    }
  }

  function findHost() {
    const all = [...document.querySelectorAll("#chatroom-messages")];
    const visible = all.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && node.offsetParent !== null;
    });
    const messages = visible || all[0];
    if (messages && messages.parentElement) return messages.parentElement;
    const chatroom = document.querySelector("#channel-chatroom");
    if (chatroom) {
      const wrapper = chatroom.querySelector(
        ".relative.shrink.grow.overflow-hidden, [class*='overflow-hidden']",
      );
      if (wrapper) return wrapper;
    }
    return null;
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

  function twitchChannelFor(slug) {
    const map = settings.twitchChannel || {};
    const mapped = map[slug];
    return cleanSlug(mapped) || slug;
  }

  function teardown() {
    generation += 1;
    if (kick) kick.stop();
    if (twitch) twitch.stop();
    kick = null;
    twitch = null;
    if (pane) pane.unmount();
    for (const stray of document.querySelectorAll("#ktw-pane")) stray.remove();
    pane = null;
    active = null;
    twitchNotified = false;
    statusState = { kick: "idle", twitch: "idle" };
    sevenTVIds = { kickUserId: null, twitchUserId: null };
    clearTimeout(sevenTVTimer);
    sevenTVTimer = null;
    if (KTW.resetSevenTVChannels) KTW.resetSevenTVChannels();
  }

  function startPane(slug, twitchSlug) {
    pane = new KTW.ChatPane({
      onNativeModeChange: () => {},
      onAppearanceChange: (partial) => {
        settings = { ...settings, ...partial };
        if (pane) pane.setAppearance(settings);
        chrome.storage.sync.set(partial).catch(() => {});
      },
    });
    pane.setChannel({ kickSlug: slug, twitchSlug });
    pane.setAppearance(settings);
    setStatus("kick", "connecting");
    setStatus("twitch", "connecting");
    ensureMounted();
  }

  async function startFeeds(slug, twitchSlug, myGeneration) {
    // Twitch does not depend on Kick's chat id; start it right away.
    twitch = new KTW.TwitchChat({
      channel: twitchSlug,
      onStatus: (state, detail) => {
        setStatus("twitch", state, detail);
        if (state === "live" && !twitchNotified && pane) {
          twitchNotified = true;
          pane.system({
            src: "twitch",
            text: `Twitch chat connected — #${twitchSlug}`,
          });
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

    const channelInfo = await KTW.fetchKickChannelInfo(slug).catch(() => null);
    if (myGeneration !== generation) return;
    const chatId = channelInfo && channelInfo.chatId;
    if (!chatId) {
      setStatus("kick", "error", "chat id not found");
      if (pane) {
        pane.system({
          src: "kick",
          text: `Could not resolve Kick chat room for #${slug}`,
        });
      }
      return;
    }
    active.chatId = chatId;
    sevenTVIds.kickUserId = channelInfo.userId;
    requestSevenTV();

    const history = await KTW.fetchKickHistory(chatId).catch(() => []);
    if (myGeneration !== generation) return;
    if (pane && history.length) pane.addMany(history, settings);

    kick = new KTW.KickChat({
      chatId,
      onStatus: (state, detail) => {
        setStatus("kick", state, detail);
      },
      onMessage: (msg) => {
        if (myGeneration !== generation || !pane) return;
        // Drop anything already seeded from history.
        if (msg.ts < active.startedAt - 10 * 60 * 1000) return;
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
    if (myGeneration !== generation) return;
    kick.start();
  }

  function describeKickSystem(eventName, data) {
    if (!data || typeof data !== "object") return null;
    const name = data.username || (data.user && data.user.username) || data.gifter_username;
    switch (eventName) {
      case "App\\Events\\SubscriptionEvent":
        return name ? `${name} subscribed` : null;
      case "App\\Events\\GiftedSubscriptionsEvent": {
        const count =
          (Array.isArray(data.gifted_usernames) && data.gifted_usernames.length) ||
          data.quantity ||
          1;
        return `${name || "Someone"} gifted ${count} subscription${count === 1 ? "" : "s"}`;
      }
      default:
        return null;
    }
  }

  function route(force) {
    const slug = parseKickSlug(location.pathname);
    lastPath = location.pathname;
    if (!settings.enabled || !slug) {
      teardown();
      return;
    }
    if (!force && active && active.slug === slug) {
      ensureMounted();
      return;
    }
    teardown();
    const twitchSlug = twitchChannelFor(slug);
    const myGeneration = generation;
    active = { slug, twitchSlug, chatId: null, startedAt: Date.now() };
    startPane(slug, twitchSlug);
    startFeeds(slug, twitchSlug, myGeneration).catch((err) => {
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
      const wanted = twitchChannelFor(active.slug);
      if (wanted !== active.twitchSlug) {
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

    chrome.storage.onChanged.addListener((changes, area) => {
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
          enabled: settings.enabled,
          slug: active ? active.slug : null,
          twitchSlug: active ? active.twitchSlug : null,
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
