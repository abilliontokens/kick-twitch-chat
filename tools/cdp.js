// Minimal CDP helper for verifying the unpacked extension in a real Chrome.
const BASE = process.env.CDP_BASE || "http://127.0.0.1:9333";

export async function openTab(url) {
  const res = await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!res.ok) throw new Error(`new tab failed ${res.status}`);
  const tab = await res.json();
  return tab;
}

export async function targets() {
  const res = await fetch(`${BASE}/json/list`);
  return res.json();
}

export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const eventHandlers = new Map();
    ws.addEventListener("open", () => resolve(api));
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
        return;
      }
      const handler = eventHandlers.get(msg.method);
      if (handler) handler(msg.params);
    });
    const api = {
      on(method, cb) {
        eventHandlers.set(method, cb);
      },
      send(method, params = {}) {
        const msgId = ++id;
        return new Promise((res, rej) => {
          pending.set(msgId, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id: msgId, method, params }));
        });
      },
      close() {
        ws.close();
      },
    };
  });
}

export async function evalIn(tab, expression, awaitPromise = true) {
  const c = await connect(tab.webSocketDebuggerUrl);
  await c.send("Runtime.enable");
  const result = await c.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  c.close();
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "eval failed");
  }
  return result.result.value;
}

export async function screenshot(tab, path) {
  const c = await connect(tab.webSocketDebuggerUrl);
  await c.send("Page.enable");
  const shot = await c.send("Page.captureScreenshot", { format: "png" });
  await Bun.write(path, Buffer.from(shot.data, "base64"));
  c.close();
}
