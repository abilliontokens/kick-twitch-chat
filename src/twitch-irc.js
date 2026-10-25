// Twitch chat transport: anonymous read-only IRC over WebSocket.
// Twitch allows reading any channel's chat with a `justinfan*` nick and no
// OAuth token. Requesting the tags capability gives us display names, colors,
// badges, emotes, reply context and bits.
(() => {
  const KTW = (window.KTW = window.KTW || {});
  const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
  const PALETTE = [
    "#FF0000", "#0000FF", "#00FF00", "#B22222", "#FF7F50", "#9ACD32", "#FF4500",
    "#2E8B57", "#DAA520", "#D2691E", "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2",
    "#00FF7F",
  ];

  function unescapeTag(value) {
    return value.replace(/\\([s:rn\\])/g, (_, ch) => {
      switch (ch) {
        case "s":
          return " ";
        case ":":
          return ";";
        case "r":
          return "\r";
        case "n":
          return "\n";
        case "\\":
          return "\\";
        default:
          return ch;
      }
    });
  }

  function parseTags(raw) {
    const tags = {};
    if (!raw) return tags;
    for (const pair of raw.split(";")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq < 0) {
        tags[pair] = "";
      } else {
        tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
      }
    }
    return tags;
  }

  function parseLine(line) {
    let rest = line;
    let tags = {};
    if (rest.startsWith("@")) {
      const space = rest.indexOf(" ");
      if (space < 0) return null;
      tags = parseTags(rest.slice(1, space));
      rest = rest.slice(space + 1);
    }
    let prefix = null;
    if (rest.startsWith(":")) {
      const space = rest.indexOf(" ");
      if (space < 0) return null;
      prefix = rest.slice(1, space);
      rest = rest.slice(space + 1);
    }
    let trailing = null;
    const trailingAt = rest.indexOf(" :");
    if (trailingAt >= 0) {
      trailing = rest.slice(trailingAt + 2);
      rest = rest.slice(0, trailingAt);
    }
    const parts = rest.split(" ").filter(Boolean);
    if (!parts.length) return null;
    return { tags, prefix, command: parts[0], params: parts.slice(1), trailing };
  }

  function loginFromPrefix(prefix) {
    if (!prefix) return "";
    const bang = prefix.indexOf("!");
    return bang > 0 ? prefix.slice(0, bang) : prefix;
  }

  function colorFor(login) {
    let hash = 0;
    for (let i = 0; i < login.length; i += 1) {
      hash = (hash * 31 + login.charCodeAt(i)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
  }

  function parseBadges(raw) {
    if (!raw) return [];
    return raw
      .split(",")
      .map((entry) => {
        const slash = entry.indexOf("/");
        if (slash < 0) return null;
        return { set: entry.slice(0, slash), version: entry.slice(slash + 1) };
      })
      .filter(Boolean);
  }

  function parseEmotes(raw) {
    if (!raw) return [];
    const out = [];
    for (const group of raw.split("/")) {
      const parts = group.split(":");
      if (parts.length !== 2) continue;
      const id = parts[0];
      for (const range of parts[1].split(",")) {
        const [start, end] = range.split("-").map(Number);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        out.push({ id, start, end });
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  function normalizePrivmsg(tags, login, text) {
    const name = tags["display-name"] || login || "unknown";
    const badges = parseBadges(tags.badges);
    const hasBadge = (set) => badges.some((b) => b.set === set);
    const reply =
      tags["reply-parent-display-name"] && tags["reply-parent-msg-body"]
        ? {
            user: tags["reply-parent-display-name"],
            text: tags["reply-parent-msg-body"],
          }
        : null;
    let body = text || "";
    let action = false;
    if (body.startsWith("\u0001ACTION ") && body.endsWith("\u0001")) {
      action = true;
      body = body.slice(8, -1);
    }
    return {
      src: "twitch",
      id: tags.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Number(tags["tmi-sent-ts"]) || Date.now(),
      user: {
        name,
        login: login || String(name).toLowerCase(),
        color: tags.color || colorFor(login || name),
        badges,
        isBroadcaster: hasBadge("broadcaster"),
        isMod: tags.mod === "1" || hasBadge("moderator"),
        isVip: hasBadge("vip"),
        isSub: tags.subscriber === "1" || hasBadge("subscriber"),
        subMonths: (tags["badge-info"] || "").match(/subscriber\/(\d+)/)?.[1] || null,
      },
      text: body,
      emotes: parseEmotes(tags.emotes),
      reply,
      bits: Number(tags.bits) || 0,
      first: tags["first-msg"] === "1",
      action,
    };
  }

  class TwitchChat {
    constructor({ channel, onMessage, onSystem, onDelete, onClear, onStatus, onRoomId }) {
      this.channel = String(channel || "").toLowerCase();
      this.onMessage = onMessage;
      this.onSystem = onSystem || (() => {});
      this.onDelete = onDelete || (() => {});
      this.onClear = onClear || (() => {});
      this.onStatus = onStatus || (() => {});
      this.onRoomId = onRoomId || (() => {});
      this.stopped = true;
      this.ws = null;
      this.retry = 0;
      this.pingTimer = null;
      this.reconnectTimer = null;
    }

    start() {
      this.stopped = false;
      this.onStatus("connecting");
      this.loop();
    }

    stop() {
      this.stopped = true;
      clearInterval(this.pingTimer);
      clearTimeout(this.reconnectTimer);
      this.pingTimer = null;
      this.reconnectTimer = null;
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* noop */
        }
        this.ws = null;
      }
    }

    async loop() {
      while (!this.stopped) {
        try {
          await this.connectOnce();
          this.retry = 0;
        } catch (err) {
          if (this.stopped) return;
          this.onStatus("error", String(err && err.message ? err.message : err));
        }
        if (this.stopped) return;
        const delay = Math.min(30000, 1000 * 2 ** this.retry++);
        await new Promise((resolve) => {
          this.reconnectTimer = setTimeout(resolve, delay);
        });
      }
    }

    connectOnce() {
      return new Promise((resolve) => {
        if (!this.channel) {
          this.onStatus("error", "no Twitch channel");
          resolve();
          return;
        }
        const ws = new WebSocket(IRC_URL);
        this.ws = ws;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearInterval(this.pingTimer);
          this.pingTimer = null;
          try {
            ws.close();
          } catch {
            /* noop */
          }
          if (this.ws === ws) this.ws = null;
          resolve();
        };

        ws.addEventListener("open", () => {
          const nick = `justinfan${Math.floor(10000 + Math.random() * 90000)}`;
          ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
          ws.send("PASS SCHMOOPIIE");
          ws.send(`NICK ${nick}`);
          ws.send(`JOIN #${this.channel}`);
          this.onStatus("connecting");
          clearInterval(this.pingTimer);
          this.pingTimer = setInterval(() => {
            try {
              ws.send("PING :tmi.twitch.tv");
            } catch {
              /* noop */
            }
          }, 120000);
        });

        ws.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          for (const line of event.data.split("\r\n")) {
            if (!line) continue;
            this.handleLine(line, ws);
            if (settled) return;
          }
        });

        ws.addEventListener("close", () => {
          if (!this.stopped) this.onStatus("connecting");
          finish();
        });
        ws.addEventListener("error", () => finish());
      });
    }

    handleLine(line, ws) {
      if (line.startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
        return;
      }
      const parsed = parseLine(line);
      if (!parsed) return;
      const { tags, prefix, command, trailing } = parsed;

      switch (command) {
        case "001":
          this.onStatus("live");
          break;
        case "JOIN":
          if (loginFromPrefix(prefix) && loginFromPrefix(prefix).startsWith("justinfan")) {
            this.onStatus("live");
          }
          break;
        case "PRIVMSG": {
          if (!trailing) return;
          const login = loginFromPrefix(prefix);
          this.onMessage(normalizePrivmsg(tags, login, trailing));
          break;
        }
        case "ROOMSTATE":
          if (tags["room-id"]) this.onRoomId(String(tags["room-id"]));
          break;
        case "USERNOTICE":
          this.onSystem({
            src: "twitch",
            id: tags.id || null,
            ts: Number(tags["tmi-sent-ts"]) || Date.now(),
            kind: tags["msg-id"] || "notice",
            text: tags["system-msg"] || "",
            user: { name: tags["display-name"] || "Twitch" },
          });
          break;
        case "CLEARCHAT":
          if (trailing) this.onClear({ user: trailing });
          else this.onClear({ user: null });
          break;
        case "CLEARMSG":
          if (tags["target-msg-id"]) this.onDelete(tags["target-msg-id"]);
          break;
        case "NOTICE":
          if (trailing && /channel|error|banned|suspended/i.test(trailing)) {
            this.onStatus("error", trailing);
          }
          break;
        case "RECONNECT":
          try {
            ws.close();
          } catch {
            /* noop */
          }
          break;
        default:
          break;
      }
    }
  }

  KTW.TwitchChat = TwitchChat;
})();
