// 7TV emotes. The merged pane replaces Kick's native message list, so the 7TV
// browser extension (which scans Kick's own DOM) can no longer inject emotes.
// We resolve 7TV sets directly: global set + the Kick/Twitch channel sets.
// Channel sets win over global ones. Entries are [name, emoteId, flags].
(() => {
  const KTW = (window.KTW = window.KTW || {});
  const ZERO_WIDTH = 256;

  KTW.sevenTVMaps = { kick: new Map(), twitch: new Map() };
  const rawSets = { global: [], kick: [], twitch: [] };

  function toMap(entries) {
    const map = new Map();
    if (!Array.isArray(entries)) return map;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [name, id, flags] = entry;
      if (!name || !id) continue;
      map.set(String(name), { id: String(id), flags: Number(flags) || 0 });
    }
    return map;
  }

  function merge(base, extra) {
    const map = new Map(extra);
    for (const [name, value] of base) map.set(name, value);
    return map;
  }

  KTW.applySevenTV = function applySevenTV(payload) {
    if (!payload) return;
    // Partial responses (e.g. Kick set first, Twitch set later) must not wipe
    // the other platform's already-loaded channel emotes.
    for (const key of ["global", "kick", "twitch"]) {
      if (Array.isArray(payload[key])) rawSets[key] = payload[key];
    }
    const global = toMap(rawSets.global);
    KTW.sevenTVMaps = {
      kick: merge(toMap(rawSets.kick), global),
      twitch: merge(toMap(rawSets.twitch), global),
    };
  };

  KTW.sevenTVEmote = function sevenTVEmote(name, source) {
    const map = KTW.sevenTVMaps[source === "twitch" ? "twitch" : "kick"];
    const emote = map && map.get(name);
    if (!emote) return null;
    const img = document.createElement("img");
    img.className = "ktw-emote ktw-7tv-emote";
    img.src = `https://cdn.7tv.app/emote/${encodeURIComponent(emote.id)}/2x.webp`;
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    if ((emote.flags & ZERO_WIDTH) === 0) return img;

    // Zero-width emotes are painted on top of the preceding emote.
    img.classList.add("ktw-7tv-zero-width");
    const wrap = document.createElement("span");
    wrap.className = "ktw-zw";
    wrap.appendChild(img);
    return wrap;
  };

  KTW.resetSevenTVChannels = function resetSevenTVChannels() {
    rawSets.kick = [];
    rawSets.twitch = [];
    const global = toMap(rawSets.global);
    KTW.sevenTVMaps = {
      kick: merge(new Map(), global),
      twitch: merge(new Map(), global),
    };
  };

  KTW.loadSevenTV = async function loadSevenTV({ kickUserId, twitchUserId }) {
    if (!kickUserId && !twitchUserId) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "ktw:7tv",
        kickUserId: kickUserId || null,
        twitchUserId: twitchUserId || null,
      });
      if (!response || !response.ok) return null;
      KTW.applySevenTV(response);
      return response;
    } catch {
      return null;
    }
  };
})();
