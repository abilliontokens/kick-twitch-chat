// Service worker: resolves Twitch's global badge images (set/version -> CDN URL)
// because content scripts cannot make cross-origin requests to the GQL endpoint.
// Channel-specific badges (subscriber/founder/...) have per-channel artwork that
// needs OAuth, so the renderer falls back to compact text pills for those.
const BADGE_CACHE_KEY = "ktwTwitchBadges";
const BADGE_TTL = 24 * 60 * 60 * 1000;
const GQL_URL = "https://gql.twitch.tv/gql";
const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const SEVEN_TV_TTL = 60 * 60 * 1000;
const SEVEN_TV_GLOBAL = "https://7tv.io/v3/emote-sets/global";

function trimEmoteSet(list) {
  const entries = [];
  for (const emote of list || []) {
    const data = emote && emote.data;
    if (!data || !data.id) continue;
    const flags = (Number(emote.flags) || 0) | (Number(data.flags) || 0);
    const names = new Set([emote.name, data.name].filter(Boolean));
    for (const name of names) entries.push([String(name), String(data.id), flags]);
  }
  return entries;
}

async function sevenTVPart(key, url) {
  const cacheKey = `ktw7tv:${key}`;
  const cached = await chrome.storage.local.get(cacheKey);
  const hit = cached[cacheKey];
  if (hit && hit.at && Date.now() - hit.at < SEVEN_TV_TTL && Array.isArray(hit.entries)) {
    return hit.entries;
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`7TV ${key}: HTTP ${response.status}`);
  const json = await response.json();
  const list = key === "global" ? json.emotes : json.emote_set && json.emote_set.emotes;
  const entries = trimEmoteSet(list);
  await chrome.storage.local.set({ [cacheKey]: { at: Date.now(), entries } });
  await pruneSevenTVCache();
  return entries;
}

async function pruneSevenTVCache() {
  const all = await chrome.storage.local.get(null);
  const cached = Object.entries(all)
    .filter(([key]) => key.startsWith("ktw7tv:"))
    .map(([key, value]) => [key, (value && value.at) || 0]);
  if (cached.length <= 30) return;
  cached.sort((a, b) => a[1] - b[1]);
  await chrome.storage.local.remove(cached.slice(0, cached.length - 30).map(([key]) => key));
}

let pusherConfigCache = { at: 0, value: null };

async function kickPusherConfig() {
  if (pusherConfigCache.value && Date.now() - pusherConfigCache.at < 30 * 60 * 1000) {
    return pusherConfigCache.value;
  }
  const res = await fetch("https://web.kick.com/api/v1/realtime/connection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-platform": "web",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client: { id: crypto.randomUUID(), type: "web" },
      capabilities: { accepted_providers: [{ provider: "pusher" }] },
    }),
  });
  if (!res.ok) throw new Error(`Kick realtime HTTP ${res.status}`);
  const json = await res.json();
  const connection = ((json.data && json.data.connections) || []).find(
    (c) => c.provider === "pusher" && c.credentials && c.credentials.app_key,
  );
  if (!connection) throw new Error("Kick returned no Pusher provider");
  const value = {
    appKey: connection.credentials.app_key,
    cluster: connection.credentials.cluster || "us2",
  };
  pusherConfigCache = { at: Date.now(), value };
  return value;
}

async function kickChannelInfo(slug) {
  const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kick channel HTTP ${res.status}`);
  const json = await res.json();
  const channel = json && json.data && json.data.id ? json.data : json;
  const chatroom = (channel && channel.chatroom) || (json && json.chatroom) || null;
  const userId = channel ? channel.user_id || (channel.user && channel.user.id) : null;
  return {
    chatId: chatroom ? Number(chatroom.id || chatroom.chat_id) : null,
    userId: userId ? String(userId) : null,
    slug: (channel && channel.slug) || slug,
  };
}

async function kickHistory(chatId, cursor) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`https://web.kick.com/api/v1/chat/${Number(chatId)}/history${query}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kick history HTTP ${res.status}`);
  const json = await res.json();
  const data = (json && json.data) || json || {};
  const list = data.messages || [];
  return { messages: Array.isArray(list) ? list : [], cursor: data.cursor || null };
}

async function loadSevenTV({ kickUserId, twitchUserId }) {
  const jobs = [sevenTVPart("global", SEVEN_TV_GLOBAL).catch(() => [])];
  const keys = [];
  if (kickUserId) {
    keys.push("kick");
    jobs.push(
      sevenTVPart(`kick:${kickUserId}`, `https://7tv.io/v3/users/kick/${kickUserId}`).catch(() => []),
    );
  }
  if (twitchUserId) {
    keys.push("twitch");
    jobs.push(
      sevenTVPart(`twitch:${twitchUserId}`, `https://7tv.io/v3/users/twitch/${twitchUserId}`).catch(
        () => [],
      ),
    );
  }
  const [global, ...rest] = await Promise.all(jobs);
  const payload = { global };
  keys.forEach((key, index) => {
    payload[key] = rest[index];
  });
  return payload;
}

async function fetchBadges() {
  const cached = await chrome.storage.local.get(BADGE_CACHE_KEY);
  const entry = cached[BADGE_CACHE_KEY];
  if (entry && entry.map && Date.now() - entry.at < BADGE_TTL) return entry.map;

  const response = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Client-ID": GQL_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "query{ badges{ setID version imageURL(size:DOUBLE) title } }",
    }),
  });
  if (!response.ok) throw new Error(`GQL HTTP ${response.status}`);
  const json = await response.json();
  const list = json && json.data && json.data.badges;
  if (!Array.isArray(list)) throw new Error("GQL returned no badges");

  const map = {};
  for (const badge of list) {
    if (!badge || !badge.setID || !badge.version || !badge.imageURL) continue;
    map[`${badge.setID}/${badge.version}`] = {
      url: badge.imageURL,
      title: badge.title || badge.setID,
    };
  }
  await chrome.storage.local.set({ [BADGE_CACHE_KEY]: { at: Date.now(), map } });
  return map;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return undefined;
  if (message.type === "ktw:twitch-badges") {
    fetchBadges()
      .then((map) => sendResponse({ ok: true, map }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
  if (message.type === "ktw:kick-pusher-config") {
    kickPusherConfig()
      .then((config) => sendResponse({ ok: true, ...config }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
  if (message.type === "ktw:kick-info") {
    kickChannelInfo(message.slug)
      .then((info) => sendResponse({ ok: true, info }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
  if (message.type === "ktw:kick-history" || message.type === "ktw:kick-history-page") {
    kickHistory(message.chatId, message.cursor)
      .then((page) => sendResponse({ ok: true, messages: page.messages, cursor: page.cursor }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
  if (message.type === "ktw:7tv") {
    loadSevenTV({
      kickUserId: message.kickUserId || null,
      twitchUserId: message.twitchUserId || null,
    })
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
  return undefined;
});

