// Kick chat transport.
// Kick serves chat through a Centrifugo "realtime" gateway. Guests can open a
// connection and subscribe to a chatroom channel without any account: the
// connection token is minted for an anonymous client id and the channel token
// is empty. The endpoints below are the same ones kick.com's own web client uses.
(() => {
  const KTW = (window.KTW = window.KTW || {});
  const API = "https://web.kick.com/api/v1/realtime";
  const HEADERS = {
    "Content-Type": "application/json",
    "x-app-platform": "web",
    Accept: "application/json",
  };
  const CHATROOM_CHANNEL = (chatId) => `chatrooms.${chatId}.v2`;

  async function post(path, body) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Kick realtime ${path}: HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.data && json.data.error) throw new Error(String(json.data.error));
    return json;
  }

  function log(...args) {
    try {
      console.debug("[ktw]", ...args);
    } catch {
      /* noop */
    }
  }

  function normalizeMessage(raw) {
    const sender = raw.sender || {};
    const identity = sender.identity || {};
    let metadata = raw.metadata;
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }
    let reply = null;
    if (metadata && metadata.original_message && metadata.original_sender) {
      reply = {
        user: metadata.original_sender.username || "",
        text: metadata.original_message.content || "",
      };
    }
    return {
      src: "kick",
      id: raw.id || null,
      ts: Date.parse(raw.created_at) || Date.now(),
      user: {
        name: sender.username || "unknown",
        slug: sender.slug || "",
        color: identity.color || null,
        badgesV2: Array.isArray(identity.badges_v2) ? identity.badges_v2 : [],
        badges: Array.isArray(identity.badges) ? identity.badges : [],
      },
      content: typeof raw.content === "string" ? raw.content : "",
      reply,
    };
  }

  class KickChat {
    constructor({ chatId, onMessage, onSystem, onDelete, onClear, onStatus }) {
      this.chatId = chatId;
      this.channel = CHATROOM_CHANNEL(chatId);
      this.onMessage = onMessage;
      this.onSystem = onSystem || (() => {});
      this.onDelete = onDelete || (() => {});
      this.onClear = onClear || (() => {});
      this.onStatus = onStatus || (() => {});
      this.clientId = crypto.randomUUID();
      this.stopped = false;
      this.ws = null;
      this.retry = 0;
      this.reconnectTimer = null;
      this.pingTimer = null;
    }

    start() {
      this.stopped = false;
      this.onStatus("connecting");
      this.loop();
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.reconnectTimer);
      clearInterval(this.pingTimer);
      this.reconnectTimer = null;
      this.pingTimer = null;
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* already closed */
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

    async connectOnce() {
      const conn = await post("/connection", {
        client: { id: this.clientId, type: "web" },
        capabilities: { accepted_providers: [{ provider: "pusher" }, { provider: "centrifugo" }] },
      });
      const candidates = (conn.data && conn.data.connections) || [];
      const target = candidates.find(
        (c) => c.provider === "centrifugo" && c.credentials && c.credentials.url,
      ) || candidates.find((c) => c.credentials && c.credentials.url);
      if (!target) throw new Error("Kick realtime returned no websocket endpoint");

      const [auth, channelAuth] = await Promise.all([
        post("/auth/connection", { client_id: this.clientId }),
        post("/auth/channel", { channel: this.channel }).catch(() => ({ data: { token: "" } })),
      ]);
      const token = auth && auth.data && auth.data.token;
      if (!token) throw new Error("Kick realtime returned no connection token");
      const channelToken = (channelAuth && channelAuth.data && channelAuth.data.token) || "";

      await new Promise((resolve) => {
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

        const ws = new WebSocket(target.credentials.url);
        this.ws = ws;
        ws.binaryType = "arraybuffer";

        ws.addEventListener("open", () => {
          log("ws open", target.credentials.url);
          ws.send(JSON.stringify({ id: 1, connect: { token } }));
          clearInterval(this.pingTimer);
          this.pingTimer = setInterval(() => {
            try {
              ws.send("{}");
            } catch {
              /* noop */
            }
          }, 20000);
        });

        ws.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          let frame;
          try {
            frame = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!frame || typeof frame !== "object") return;

          if (frame.id === 1) {
            if (frame.error) {
              log("connect error", JSON.stringify(frame.error));
              this.onStatus("error", String(frame.error.message || "connect failed"));
              finish();
              return;
            }
            log("connected", JSON.stringify(frame.connect || {}).slice(0, 120));
            ws.send(
              JSON.stringify({ id: 2, subscribe: { channel: this.channel, token: channelToken } }),
            );
            return;
          }
          if (frame.id === 2) {
            if (frame.error) {
              log("subscribe error", JSON.stringify(frame.error));
              this.onStatus("error", String(frame.error.message || "subscribe failed"));
            } else {
              log("subscribed", this.channel);
              this.onStatus("live");
            }
            return;
          }
          if (frame.push) {
            this.onStatus("live");
            this.handlePush(frame.push);
            return;
          }
          if (frame.disconnect) {
            log("disconnect", JSON.stringify(frame.disconnect).slice(0, 160));
            this.onStatus("connecting");
            finish();
            return;
          }
          if (frame.id === undefined && frame.push === undefined) {
            // Centrifugo application-level ping/pong.
            try {
              ws.send("{}");
            } catch {
              /* noop */
            }
          }
        });

        ws.addEventListener("close", (event) => {
          log("ws close", event.code, event.reason);
          if (!this.stopped) this.onStatus("connecting");
          finish();
        });
        ws.addEventListener("error", () => finish());
      });
    }

    handlePush(push) {
      const pub = push && push.pub;
      if (!pub) return;
      let payload = pub.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      const eventName = payload.event || (pub.tags && pub.tags.event) || "";
      let data = payload.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          data = null;
        }
      }

      switch (eventName) {
        case "App\\Events\\ChatMessageEvent":
          if (data && data.sender) this.onMessage(normalizeMessage(data));
          break;
        case "App\\Events\\ChatMessageDeletedEvent":
          if (data) this.onDelete(data.id || data.message_id || data.messageId);
          break;
        case "App\\Events\\ChatroomClearChatMessagesEvent":
          this.onClear();
          break;
        default:
          this.onSystem(eventName, data);
          break;
      }
    }
  }

  KTW.KickChat = KickChat;
  KTW.normalizeKickMessage = normalizeMessage;

  KTW.fetchKickChannelInfo = async function fetchKickChannelInfo(slug) {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const channel = json && json.data && json.data.id ? json.data : json;
    const chatroom =
      (channel && channel.chatroom) || (json && json.chatroom) || null;
    const chatId = chatroom && (chatroom.id || chatroom.chat_id);
    const userId = channel && (channel.user_id || (channel.user && channel.user.id));
    return {
      chatId: chatId ? Number(chatId) : null,
      userId: userId ? String(userId) : null,
      slug: (channel && channel.slug) || slug,
    };
  };

  KTW.fetchKickHistory = async function fetchKickHistory(chatId) {
    const res = await fetch(`https://web.kick.com/api/v1/chat/${chatId}/history`, {
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    const list =
      (json && json.data && json.data.messages) || (json && json.messages) || [];
    if (!Array.isArray(list)) return [];
    // The endpoint returns newest first; the pane renders oldest first.
    return list
      .slice()
      .reverse()
      .map(normalizeMessage)
      .filter((m) => m.id);
  };
})();
