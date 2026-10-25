// Drive the real Chrome instance: open a Kick chat page and report whether the
// merged pane mounted and both feeds are rendering live messages.
import { connect, targets } from "./cdp.js";

const url = process.argv[2] || "https://kick.com/popout/xqc/chat";
const waitMs = Number(process.argv[3] || 45000);

const page = (await targets()).find(
  (t) => t.type === "page" && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://"),
);
if (!page) throw new Error("no page target");

const c = await connect(page.webSocketDebuggerUrl);
const consoleLines = [];
const requests = [];
const sockets = [];
await c.send("Runtime.enable");
await c.send("Log.enable");
await c.send("Page.enable");
await c.send("Network.enable");
c.on("Runtime.consoleAPICalled", (p) => {
  const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
  if (/ktw|error|fail|blocked|CORS|realtime/i.test(text)) {
    consoleLines.push(`${p.type}: ${text}`.slice(0, 400));
  }
});
c.on("Runtime.exceptionThrown", (p) => {
  consoleLines.push(`EXCEPTION: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`.slice(0, 500));
});
c.on("Log.entryAdded", (p) => {
  if (p.entry.level === "error" || /ktw|realtime/i.test(p.entry.text)) {
    consoleLines.push(`LOG ${p.entry.level}: ${p.entry.text}`.slice(0, 400));
  }
});
c.on("Network.requestWillBeSent", (p) => {
  if (/web\.kick\.com\/api\/v1\/realtime|kick\.com\/api\/v2\/channels/i.test(p.request.url)) {
    requests.push(`${p.request.method} ${p.request.url}`.slice(0, 220));
  }
});
c.on("Network.webSocketCreated", (p) => sockets.push(`WS ${p.url}`.slice(0, 220)));
c.on("Network.webSocketFrameError", (p) => sockets.push(`WS ERROR ${p.errorMessage}`.slice(0, 300)));
c.on("Network.loadingFailed", (p) => {
  if (p.type === "Fetch" || p.type === "XHR") consoleLines.push(`NET FAIL ${p.errorText}`.slice(0, 200));
});

await c.send("Page.navigate", { url });

const deadline = Date.now() + waitMs;
let last = null;
let ready = false;
const history = [];
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 700));
  try {
    const res = await c.send("Runtime.evaluate", {
      expression: `(() => {
        const p = document.getElementById('ktw-pane');
        if (!p) return JSON.stringify({ pane: false, url: location.href });
        const st = {};
        for (const n of p.querySelectorAll('.ktw-status')) st[n.dataset.who] = n.dataset.state;
        return JSON.stringify({
          pane: true,
          kickState: st.kick, twitchState: st.twitch,
          kick: p.querySelectorAll('.ktw-row[data-src="kick"]').length,
          twitch: p.querySelectorAll('.ktw-row.ktw-from-twitch').length,
          icons: p.querySelectorAll('.ktw-row.ktw-from-twitch .ktw-twitch-icon').length,
          native: document.querySelectorAll('#chatroom-messages [data-index]').length,
          url: location.href,
        });
      })()`,
      returnByValue: true,
    });
    const info = JSON.parse(res.result.value);
    if (JSON.stringify(info) !== last) {
      history.push(info);
      last = JSON.stringify(info);
    }
    if (info.pane && info.twitch > 0 && info.icons > 0 && info.kick > 0 && info.kickState === "live") {
      if (!ready) {
        ready = true;
        const settleUntil = Date.now() + 12000;
        while (Date.now() < settleUntil) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      break;
    }
  } catch (err) {
    consoleLines.push(`eval error ${String(err).slice(0, 160)}`);
  }
}

const detail = await c.send("Runtime.evaluate", {
  expression: `(() => {
    const p = document.getElementById('ktw-pane');
    if (!p) return JSON.stringify({ pane: false, url: location.href, body: document.body.innerText.slice(0, 400) });
    const rows = [...p.querySelectorAll('.ktw-row')];
    return JSON.stringify({
      pane: true,
      h: p.getBoundingClientRect().height,
      statuses: [...p.querySelectorAll('.ktw-status')].map(n => ({ who: n.dataset.who, state: n.dataset.state, title: n.title })),
      kick: rows.filter(r => r.dataset.src === 'kick').length,
      twitchMsgs: rows.filter(r => r.classList.contains('ktw-from-twitch')).length,
      twitchIcons: p.querySelectorAll('.ktw-row.ktw-from-twitch .ktw-twitch-icon').length,
      twitchBadgeImgs: p.querySelectorAll('.ktw-row.ktw-from-twitch .ktw-badge-img').length,
      kickBadgeImgs: p.querySelectorAll('.ktw-row[data-src="kick"] .ktw-badge-img').length,
      emoteImgs: p.querySelectorAll('.ktw-emote').length,
      sevenTV: p.querySelectorAll('.ktw-7tv-emote').length,
      sevenTVZero: p.querySelectorAll('.ktw-7tv-zero-width').length,
      twitchBadges7tv: p.querySelectorAll('.ktw-row.ktw-from-twitch .ktw-7tv-emote').length,
      kickBadges7tv: p.querySelectorAll('.ktw-row[data-src="kick"] .ktw-7tv-emote').length,
      samples: rows.filter(r => r.classList.contains('ktw-from-twitch')).slice(-3).map(r => r.innerText),
      nativeRows: document.querySelectorAll('#chatroom-messages [data-index]').length,
    });
  })()`,
  returnByValue: true,
});
console.log("READY", ready);
console.log("STATES", JSON.stringify(history));
console.log("DETAIL", detail.result.value);
console.log("REQUESTS", JSON.stringify([...new Set(requests)]));
console.log("SOCKETS", JSON.stringify([...new Set(sockets)]));
console.log("CONSOLE", JSON.stringify(consoleLines.slice(0, 15)));

const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research/shot.png", Buffer.from(shot.data, "base64"));
c.close();
process.exit(ready ? 0 : 1);
