// Verify the unified color bar toggle: both source bars off, tints/icons untouched.
import { connect, openTab, targets } from "./cdp.js";
const extId = process.argv[2];
const ext = async (expr) => {
  const tab = await openTab(`chrome-extension://${extId}/popup/popup.html`);
  await new Promise(r => setTimeout(r, 500));
  const c = await connect(tab.webSocketDebuggerUrl);
  await c.send("Runtime.enable");
  const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  c.close();
  await fetch(`http://127.0.0.1:9333/json/close/${tab.id}`);
  return r.result.value;
};
let page = (await targets()).find(t => t.type === "page" && t.url.includes("kick.com"));
if (!page) page = await openTab("about:blank");
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (expr) => {
  const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.exceptionDetails ? "ERR " + r.exceptionDetails.text : r.result.value;
};
await ext(`chrome.storage.sync.set({ enabled: true, twitchChannel: {}, showTimestamps: true, showBadges: true, tintTwitch: true, tintKick: true, colorBar: true, kickIcon: true, kickBadges: true })`);
await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
for (let i = 0; i < 60; i += 1) {
  const ok = await ev(`(() => { const p = document.getElementById('ktw-pane'); return p && p.querySelectorAll('.ktw-row.ktw-from-kick').length > 3 && p.querySelectorAll('.ktw-row.ktw-from-twitch').length > 0; })()`);
  if (ok) break;
  await new Promise(r => setTimeout(r, 500));
}
await new Promise(r => setTimeout(r, 4000));
const read = () => ev(`(() => {
  const p = document.getElementById('ktw-pane');
  if (!p) return "no pane";
  const k = p.querySelector('.ktw-row.ktw-from-kick');
  const t = p.querySelector('.ktw-row.ktw-from-twitch');
  return JSON.stringify({
    cls: p.className,
    kickShadow: k ? getComputedStyle(k).boxShadow : null,
    twitchShadow: t ? getComputedStyle(t).boxShadow : null,
    kickBg: k ? getComputedStyle(k).backgroundImage.slice(0, 55) : null,
    twitchBg: t ? getComputedStyle(t).backgroundImage.slice(0, 55) : null,
    kickIcons: p.querySelectorAll('.ktw-row.ktw-from-kick .ktw-kick-icon').length,
    twitchIcons: p.querySelectorAll('.ktw-row.ktw-from-twitch .ktw-twitch-icon').length,
  });
})()`);
console.log("bars-on", await read());
const s = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_bar_on.png", Buffer.from(s.data, "base64"));
await ext(`chrome.storage.sync.set({ colorBar: false })`);
await new Promise(r => setTimeout(r, 1200));
console.log("bars-off", await read());
const s2 = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_bar_off.png", Buffer.from(s2.data, "base64"));
await ext(`chrome.storage.sync.set({ colorBar: true })`);
await new Promise(r => setTimeout(r, 1000));
console.log("bars-restored", await read());
await c.send("Page.reload");
await new Promise(r => setTimeout(r, 4500));
await ext(`chrome.storage.sync.set({ colorBar: false })`);
await new Promise(r => setTimeout(r, 1200));
console.log("bars-off-after-reload", await read());
await ext(`chrome.storage.sync.set({ colorBar: true })`);
await new Promise(r => setTimeout(r, 800));
c.close();
