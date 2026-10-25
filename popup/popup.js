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

const $ = (id) => document.getElementById(id);

let currentSlug = null;

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

async function saveMapping(slug, value) {
  const settings = await readSettings();
  const map = { ...settings.twitchChannel };
  if (!value || value === slug) delete map[slug];
  else map[slug] = value;
  await chrome.storage.sync.set({ twitchChannel: map });
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
    hint.textContent = "Open a Kick channel or popout chat to use this extension.";
    return;
  }

  currentSlug = info.slug || null;
  if (info.slug) {
    $("kick-name").textContent = `#${info.slug}`;
    $("twitch-name").textContent = info.twitchSlug ? `#${info.twitchSlug}` : "not linked";
    paintDot($("kick-dot"), info.kick);
    paintDot($("twitch-dot"), info.twitch);
    $("twitch-input").value = (settings.twitchChannel || {})[info.slug] || "";
    hint.textContent = info.mounted
      ? "Merged chat is mounted in this tab."
      : "Chat is enabled; waiting for the Kick chat column to appear.";
  } else {
    $("kick-name").textContent = "—";
    $("twitch-name").textContent = "—";
    paintDot($("kick-dot"), "idle");
    paintDot($("twitch-dot"), "idle");
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
  await saveMapping(currentSlug, value);
  $("twitch-input").value = value === currentSlug ? "" : value;
  await refresh();
  setTimeout(render, 200);
});

$("reset").addEventListener("click", async () => {
  if (!currentSlug) return;
  $("twitch-input").value = "";
  await saveMapping(currentSlug, "");
  await refresh();
  setTimeout(render, 200);
});

$("refresh").addEventListener("click", async () => {
  await refresh();
  setTimeout(render, 400);
});

render();
