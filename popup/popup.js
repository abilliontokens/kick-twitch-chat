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

const $ = (id) => document.getElementById(id);

let currentSlug = null;
let currentHost = "kick";

function cleanSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_]{1,40}$/.test(slug) ? slug : "";
}

function paintDot(node, state) {
  node.className = "dot";
  if (node.id === "twitch-dot") node.classList.add("twitch");
  if (state === "live") node.classList.add("live");
  else if (state === "connecting") node.classList.add("pending");
  else if (state === "error") node.classList.add("error");
}

async function readSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return {
    enabled: stored.enabled !== false,
    twitchChannel:
      stored.twitchChannel && typeof stored.twitchChannel === "object"
        ? stored.twitchChannel
        : {},
    kickByTwitch:
      stored.kickByTwitch && typeof stored.kickByTwitch === "object"
        ? stored.kickByTwitch
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
}

async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0].id : null;
}

async function status() {
  const tabId = await activeTabId();
  if (tabId == null) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "ktw:status" });
  } catch {
    return null;
  }
}

async function saveMapping(host, channel, value) {
  const settings = await readSettings();
  const key = host === "twitch" ? "kickByTwitch" : "twitchChannel";
  const map = { ...settings[key] };
  if (!value || value === channel) delete map[channel];
  else map[channel] = value;
  await chrome.storage.sync.set({ [key]: map });
}

async function refresh() {
  const tabId = await activeTabId();
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ktw:refresh" });
  } catch {
    /* content script not present */
  }
}

async function render() {
  const settings = await readSettings();
  $("enabled").checked = settings.enabled;
  $("timestamps").checked = settings.showTimestamps;
  $("badges").checked = settings.showBadges;
  $("tint-twitch").checked = settings.tintTwitch;
  $("tint-kick").checked = settings.tintKick;
  $("color-bar").checked = settings.colorBar;
  $("kick-icon").checked = settings.kickIcon;
  $("kick-badges").checked = settings.kickBadges;

  const info = await status();
  const hint = $("page-hint");
  if (!info || !info.ok) {
    currentSlug = null;
    $("kick-name").textContent = "—";
    $("twitch-name").textContent = "—";
    paintDot($("kick-dot"), "idle");
    paintDot($("twitch-dot"), "idle");
    hint.hidden = false;
    hint.textContent = "Open a Kick channel or popout chat to use this extension.";
    return;
  }

  const isTwitch = info.host === "twitch";
  currentSlug = info.channel || info.slug || null;
  currentHost = isTwitch ? "twitch" : "kick";
  if (currentSlug) {
    $("kick-name").textContent = info.kickSlug ? `#${info.kickSlug}` : "not linked";
    $("twitch-name").textContent = info.twitchSlug ? `#${info.twitchSlug}` : "not linked";
    paintDot($("kick-dot"), info.kick);
    paintDot($("twitch-dot"), info.twitch);
    $("mapping-label").textContent = isTwitch
      ? "Kick channel for this Twitch channel"
      : "Twitch channel for this Kick channel";
    $("mapping-hint").textContent = isTwitch
      ? "Defaults to the Twitch channel name."
      : "Defaults to the Kick channel name.";
    const map = isTwitch ? settings.kickByTwitch : settings.twitchChannel;
    $("twitch-input").value = (map || {})[currentSlug] || "";
    hint.hidden = Boolean(info.mounted);
    hint.textContent = info.mounted
      ? ""
      : "Chat is enabled; waiting for the chat column to appear.";
  } else {
    $("kick-name").textContent = "—";
    $("twitch-name").textContent = "—";
    paintDot($("kick-dot"), "idle");
    paintDot($("twitch-dot"), "idle");
    hint.hidden = false;
    hint.textContent = "This Kick page has no channel chat.";
  }
}

$("enabled").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ enabled: event.target.checked });
  await refresh();
  setTimeout(render, 150);
});

$("timestamps").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ showTimestamps: event.target.checked });
});

$("badges").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ showBadges: event.target.checked });
});

$("tint-twitch").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ tintTwitch: event.target.checked });
});

$("tint-kick").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ tintKick: event.target.checked });
});

$("color-bar").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ colorBar: event.target.checked });
});

$("kick-icon").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ kickIcon: event.target.checked });
});

$("kick-badges").addEventListener("change", async (event) => {
  await chrome.storage.sync.set({ kickBadges: event.target.checked });
});

$("mapping").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentSlug) return;
  const value = cleanSlug($("twitch-input").value);
  await saveMapping(currentHost, currentSlug, value);
  $("twitch-input").value = value === currentSlug ? "" : value;
  await refresh();
  setTimeout(render, 200);
});

$("reset").addEventListener("click", async () => {
  if (!currentSlug) return;
  $("twitch-input").value = "";
  await saveMapping(currentHost, currentSlug, "");
  await refresh();
  setTimeout(render, 200);
});

$("refresh").addEventListener("click", async () => {
  await refresh();
  setTimeout(render, 400);
});

render();
