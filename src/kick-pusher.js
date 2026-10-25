// Kick's Pusher transport. The Centrifugo gateway only accepts kick.com
// origins, so on Twitch (and as a redundant feed on Kick) we subscribe to the
// same public chat channel through Kick's Pusher app. The app key/cluster are
// resolved from Kick's realtime bootstrap with a pusher-only capability list.
(() => {
  const KTW = (window.KTW = window.KTW || {});
  const FALLBACK_CONFIG = { appKey: "34bf7a0ff419a2a775b9", cluster: "us2" };
  const IS_KICK_HOST = /(^|\.)kick\.com$/i.test(location.hostname);
  const CONFIG_TTL = 30 * 60 * 1000;

  let configCache = null;

  async function requestConfig() {
    if (IS_KICK_HOST) {
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
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Kick realtime HTTP ${res.status}`);
      const json = await res.json();
      const connection = ((json.data && json.data.connections) || []).find(
        (c) => c.provider === "pusher" && c.credentials && c.credentials.app_key,
      );
      if (!connection) throw new Error("Kick returned no Pusher provider");
      return {
        appKey: connection.credentials.app_key,
        cluster: connection.credentials.cluster || "us2",
      };
    }
    const res = await chrome.runtime.sendMessage({ type: "ktw:kick-pusher-config" });
    if (!res || !res.ok) throw new Error((res && res.error) || "Pusher config unavailable");
    return { appKey: res.appKey, cluster: res.cluster || "us2" };
  }

  async function getConfig() {
    if (configCache && Date.now() - configCache.at < CONFIG_TTL) return configCache.value;
    try {
      const value = await requestConfig();
      configCache = { at: Date.now(), value };
      return value;
    } catch {
      return FALLBACK_CONFIG;
    }
  }

  function pusherUrl({ appKey, cluster }) {
    return `wss://ws-${cluster}.pusher.com/app/${encodeURIComponent(
      appKey,
    )}?protocol=7&client=js&version=8.4.0&flash=false`;
  }

  class KickPusher {
    constructor({ chatId, onMessage, onSystem, onDelete, onClear, onStatus }) {
      this.chatId = Number(chatId);
      this.channel = `chatrooms.${this.chatId}.v2`;
      this.onMessage = onMessage;
      this.onSystem = onSystem || (() => {});
      this.onDelete = onDelete || (() => {});
      this.onClear = onClear || (() => {});
      this.onStatus = onStatus || (() => {});
      this.stopped = true;
      this.ws = null;
      this.retry = 0;
      this.timer = null;
    }

    start() {
      this.stopped = false;
      this.onStatus("connecting");
      this.loop();
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.timer);
      this.timer = null;
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
          this.timer = setTimeout(resolve, delay);
        });
      }
    }

    async connectOnce() {
      const config = await getConfig();
      await new Promise((resolve) => {
        let settled = false;
        let subscribed = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(guard);
          try {
            ws.close();
          } catch {
            /* noop */
          }
          if (this.ws === ws) this.ws = null;
          resolve();
        };
        const ws = new WebSocket(pusherUrl(config));
        this.ws = ws;
        const guard = setTimeout(() => {
          if (!subscribed) finish();
        }, 12000);

        ws.addEventListener("open", () => {
          this.onStatus("connecting");
        });

        ws.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          let frame;
          try {
            frame = JSON.parse(event.data);
          } catch {
            return;
          }
          const name = frame.event || "";
          if (name === "pusher:connection_established") {
            ws.send(
              JSON.stringify({
                event: "pusher:subscribe",
                data: { channel: this.channel },
              }),
            );
            return;
          }
          if (name === "pusher_internal:subscription_succeeded") {
            subscribed = true;
            clearTimeout(guard);
            this.onStatus("live");
            return;
          }
          if (name === "pusher:ping") {
            ws.send(JSON.stringify({ event: "pusher:pong", data: {} }));
            return;
          }
          if (name === "pusher:error") {
            configCache = null;
          }
          if (
            name === "pusher:error" ||
            name === "pusher_internal:subscription_error" ||
            name === "pusher:subscription_error"
          ) {
            const detail =
              frame.data && typeof frame.data === "object"
                ? frame.data.message || frame.data.error
                : frame.data;
            this.onStatus("error", String(detail || "Pusher error"));
            finish();
            return;
          }
          if (name === "App\\Events\\ChatMessageEvent") {
            let payload = frame.data;
            if (typeof payload === "string") {
              try {
                payload = JSON.parse(payload);
              } catch {
                return;
              }
            }
            if (payload && payload.sender) this.onMessage(KTW.normalizeKickMessage(payload));
            return;
          }
          if (name === "App\\Events\\ChatMessageDeletedEvent") {
            let payload = frame.data;
            if (typeof payload === "string") {
              try {
                payload = JSON.parse(payload);
              } catch {
                return;
              }
            }
            if (payload) this.onDelete(payload.id || payload.message_id || payload.messageId);
            return;
          }
          if (name === "App\\Events\\ChatroomClearChatMessagesEvent") {
            this.onClear();
            return;
          }
          if (name.startsWith("App\\Events\\")) {
            let payload = frame.data;
            if (typeof payload === "string") {
              try {
                payload = JSON.parse(payload);
              } catch {
                payload = null;
              }
            }
            this.onSystem(name, payload);
          }
        });

        ws.addEventListener("close", () => {
          if (!this.stopped) this.onStatus(subscribed ? "connecting" : "error");
          finish();
        });
        ws.addEventListener("error", () => finish());
      });
    }
  }

  KTW.KickPusher = KickPusher;
})();
