// Message rendering: turns normalized Kick/Twitch messages into chat rows that
// visually match Kick chat. Twitch rows carry the Twitch glyph in a left gutter
// so they are identifiable at a glance.
(() => {
  const KTW = (window.KTW = window.KTW || {});
  const TWITCH_ICON =
    "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z";
  const KICK_ICON =
    "M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z";
  const KICK_BADGE_LABELS = {
    broadcaster: "HOST",
    moderator: "MOD",
    vip: "VIP",
    verified: "VERIFIED",
    subscriber: "SUB",
    founder: "FOUNDER",
    staff: "STAFF",
    og: "OG",
  };
  const TWITCH_BADGE_LABELS = {
    broadcaster: "HOST",
    moderator: "MOD",
    vip: "VIP",
    staff: "STAFF",
    admin: "ADMIN",
    "global-mod": "GMOD",
    turbo: "TURBO",
    premium: "PRIME",
    prime: "PRIME",
    "sub-gifter": "GIFTER",
    "sub-gift-leader": "GIFTER",
    founder: "FOUNDER",
    "bits-leader": "BITS",
    subscriber: "SUB",
  };

  const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  KTW.setTwitchBadges = function setTwitchBadges(map) {
    KTW.twitchBadges = map && typeof map === "object" ? map : {};
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function twitchIcon() {
    const wrap = el("span", "ktw-twitch-icon");
    wrap.setAttribute("aria-label", "Twitch");
    wrap.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${TWITCH_ICON}"/></svg>`;
    return wrap;
  }

  function kickIcon() {
    const wrap = el("span", "ktw-kick-icon");
    wrap.setAttribute("aria-label", "Kick");
    wrap.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false"><path fill="currentColor" d="${KICK_ICON}"/></svg>`;
    return wrap;
  }

  function pill(label, title, kind) {
    const badge = el("span", `ktw-badge ktw-badge-${kind || "text"}`, label);
    if (title) badge.title = title;
    return badge;
  }

  function kickLegacyBadge(badge) {
    const type = String(badge.type || "").toLowerCase();
    const label = KICK_BADGE_LABELS[type] || String(badge.text || type || "?").toUpperCase();
    if (!label) return null;
    const count = badge.count && type === "subscriber" ? ` ${badge.count}` : "";
    return pill(label + count, badge.text || label, type);
  }

  function twitchBadge(badge) {
    const map = KTW.twitchBadges || {};
    const known = map[`${badge.set}/${badge.version}`];
    if (known && known.url) {
      const img = document.createElement("img");
      img.className = "ktw-badge-img";
      img.src = known.url;
      img.alt = known.title || badge.set;
      img.title = known.title || badge.set;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      return img;
    }
    const label =
      TWITCH_BADGE_LABELS[badge.set] || String(badge.set || "").toUpperCase().slice(0, 8);
    if (!label) return null;
    return pill(label, `${badge.set}/${badge.version}`, badge.set);
  }

  function kickBadges(user) {
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    const v2 = (user.badgesV2 || []).slice().sort((a, b) => {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    for (const badge of v2) {
      if (!badge || !badge.image_url) continue;
      const name = String(badge.name || "").toLowerCase();
      seen.add(name);
      const img = document.createElement("img");
      img.className = "ktw-badge-img";
      img.src = badge.image_url;
      const level = badge.metadata && badge.metadata.level ? ` ${badge.metadata.level}` : "";
      const title = (badge.name || "badge") + level;
      img.alt = title;
      img.title = title;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      fragment.appendChild(img);
    }
    for (const badge of user.badges || []) {
      const type = String(badge.type || "").toLowerCase();
      if (seen.has(type)) continue;
      const node = kickLegacyBadge(badge);
      if (node) fragment.appendChild(node);
    }
    return fragment;
  }

  function twitchBadges(user) {
    const fragment = document.createDocumentFragment();
    for (const badge of user.badges || []) {
      const node = twitchBadge(badge);
      if (node) fragment.appendChild(node);
    }
    if (user.bits) {
      fragment.appendChild(pill(`◆ ${user.bits}`, `${user.bits} bits`, "bits"));
    }
    return fragment;
  }

  function emoteImage(url, name) {
    const img = document.createElement("img");
    img.className = "ktw-emote";
    img.src = url;
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    return img;
  }

  function appendWords(container, text, source) {
    if (!text) return;
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        container.appendChild(document.createTextNode(part));
        continue;
      }
      const emote = KTW.sevenTVEmote ? KTW.sevenTVEmote(part, source) : null;
      container.appendChild(emote || document.createTextNode(part));
    }
  }

  function kickText(container, content) {
    const re = /\[emote:(\d+):([^\]]*)\]/g;
    let last = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      appendWords(container, content.slice(last, match.index), "kick");
      container.appendChild(
        emoteImage(`https://files.kick.com/emotes/${encodeURIComponent(match[1])}/fullsize`, match[2]),
      );
      last = re.lastIndex;
    }
    appendWords(container, content.slice(last), "kick");
  }

  function twitchText(container, text, emotes) {
    let cursor = 0;
    for (const emote of emotes || []) {
      if (emote.start < cursor || emote.end < emote.start) continue;
      appendWords(container, text.slice(cursor, emote.start), "twitch");
      const name = text.slice(emote.start, emote.end + 1);
      container.appendChild(
        emoteImage(
          `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emote.id)}/default/dark/2.0`,
          name,
        ),
      );
      cursor = emote.end + 1;
    }
    appendWords(container, text.slice(cursor), "twitch");
  }

  KTW.renderMessageText = function renderMessageText(msg) {
    const fragment = document.createDocumentFragment();
    if (msg.src === "twitch") twitchText(fragment, msg.text || "", msg.emotes);
    else kickText(fragment, msg.content || "");
    return fragment;
  };

  function userLink(msg) {
    const link = document.createElement("a");
    link.className = "ktw-user";
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = msg.user.name;
    link.title = msg.user.name;
    link.style.color = msg.user.color || (msg.src === "twitch" ? "#bf94ff" : "");
    link.href =
      msg.src === "twitch"
        ? `https://www.twitch.tv/${encodeURIComponent(msg.user.login || msg.user.name)}`
        : `https://kick.com/${encodeURIComponent(msg.user.slug || msg.user.name)}`;
    return link;
  }

  function replyLine(reply) {
    const line = el("div", "ktw-reply");
    line.appendChild(el("span", "ktw-reply-user", `@${reply.user}`));
    line.appendChild(document.createTextNode(reply.text || ""));
    return line;
  }

  KTW.buildMessageRow = function buildMessageRow(msg, settings) {
    const row = el("div", "ktw-row");
    row.dataset.src = msg.src;
    if (msg.id) row.dataset.msgId = msg.id;
    if (msg.src === "twitch") row.classList.add("ktw-from-twitch");
    else row.classList.add("ktw-from-kick");
    if (msg.bits) row.classList.add("ktw-has-bits");
    if (msg.first) row.classList.add("ktw-first-msg");
    if (msg.action) row.classList.add("ktw-action");

    const gutter = el("div", "ktw-gutter");
    gutter.appendChild(msg.src === "twitch" ? twitchIcon() : kickIcon());
    row.appendChild(gutter);

    const main = el("div", "ktw-main");
    if (msg.reply) main.appendChild(replyLine(msg.reply));

    const line = el("div", "ktw-line");
    if (settings.showTimestamps) {
      line.appendChild(el("span", "ktw-ts", timeFormat.format(new Date(msg.ts))));
    }
    if (settings.showBadges) {
      const badges = el("span", "ktw-badges");
      badges.appendChild(msg.src === "twitch" ? twitchBadges(msg.user) : kickBadges(msg.user));
      line.appendChild(badges);
    }
    line.appendChild(userLink(msg));
    line.appendChild(el("span", "ktw-sep", ": "));
    const body = el("span", "ktw-text");
    body.appendChild(KTW.renderMessageText(msg));
    line.appendChild(body);
    main.appendChild(line);
    row.appendChild(main);
    return row;
  };

  KTW.buildSystemRow = function buildSystemRow(entry) {
    const row = el("div", "ktw-row ktw-system");
    row.dataset.src = entry.src || "system";
    const gutter = el("div", "ktw-gutter");
    if (entry.src === "twitch") gutter.appendChild(twitchIcon());
    else if (entry.src === "kick") gutter.appendChild(kickIcon());
    row.appendChild(gutter);
    const main = el("div", "ktw-main");
    main.appendChild(el("span", "ktw-system-text", entry.text || ""));
    row.appendChild(main);
    return row;
  };
})();
