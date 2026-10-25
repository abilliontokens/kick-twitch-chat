// Verify channel mapping and the global enable switch.
import { connect, openTab, targets } from "./cdp.js";

const extId = process.argv[2];
const base = { enabled: true, twitchChannel: {}, showTimestamps: true, showBadges: true, tintTwitch: true, tintKick: true, colorBar: true };

async function withExt(fn) {
  const tab = await openTab(`chrome-extension://${extId}/popup/popup.html`);
  await new Promise((r) => setTimeout(r, 600));
  const c = await connect(tab.webSocketDebuggerUrl);
  await c.send("Runtime.enable");
  const ev = async (expression) => (await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
  const out = await fn(ev);
  c.close();
  await fetch(`http://127.0.0.1:9333/json/close/${tab.id}`);
  return out;
}

await withExt(async (ev) => {
  await ev(`chrome.storage.sync.set(${JSON.stringify({ ...base, twitchChannel: { xqc: "shroud" } })})`);
  return null;
});

const page = (await targets()).find((t) => t.type === "page" && t.url.includes("kick.com"));
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (expression) => {
  const res = await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) return "ERR " + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
};

await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
for (let i = 0; i < 40; i += 1) {
  const ok = await ev(`(() => { const p = document.getElementById('ktw-pane'); return p && p.querySelectorAll('.ktw-row').length > 5 ? true : false; })()`);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 8000));
const mapped = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  return JSON.stringify({ chan: p.querySelector('.ktw-channel').textContent, href: p.querySelector('.ktw-channel').getAttribute('href'), states: [...p.querySelectorAll('.ktw-status')].map(n => n.dataset.who + ':' + n.dataset.state), twitch: p.querySelectorAll('.ktw-from-twitch').length });
})()`);
console.log("mapped", mapped);

const cacheKeys = await withExt(async (ev) => ev(`chrome.storage.local.get(null).then(k => Object.keys(k).filter(x => x.startsWith('ktw7tv:twitch')))`));
console.log("twitch 7tv cache keys", JSON.stringify(cacheKeys));

await withExt(async (ev) => ev(`chrome.storage.sync.set({ enabled: false })`));
await new Promise((r) => setTimeout(r, 1500));
const disabled = await ev(`(() => ({ pane: !!document.getElementById('ktw-pane'), native: document.querySelectorAll('#chatroom-messages [data-index]').length }))()`);
console.log("disabled", JSON.stringify(disabled));

await withExt(async (ev) => ev(`chrome.storage.sync.set({ enabled: true })`));
await new Promise((r) => setTimeout(r, 3000));
const reenabled = await ev(`(() => { const p = document.getElementById('ktw-pane'); return JSON.stringify({ pane: !!p, rows: p ? p.querySelectorAll('.ktw-row').length : 0 }); })()`);
console.log("reenabled", reenabled);

await withExt(async (ev) => ev(`chrome.storage.sync.set(${JSON.stringify(base)})`));
c.close();
