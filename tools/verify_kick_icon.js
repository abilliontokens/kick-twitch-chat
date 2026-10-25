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
  const ki = p.querySelector('.ktw-row.ktw-from-kick .ktw-kick-icon');
  const ti = p.querySelector('.ktw-row.ktw-from-twitch .ktw-twitch-icon');
  const kb = p.querySelector('.ktw-row.ktw-from-kick');
  return JSON.stringify({
    cls: p.className,
    kickIcons: p.querySelectorAll('.ktw-row.ktw-from-kick .ktw-kick-icon').length,
    twitchIcons: p.querySelectorAll('.ktw-row.ktw-from-twitch .ktw-twitch-icon').length,
    kickIconDisplay: ki ? getComputedStyle(ki).display : null,
    twitchIconDisplay: ti ? getComputedStyle(ti).display : null,
    kickBar: kb ? getComputedStyle(kb).boxShadow : null,
  });
})()`);
console.log("default", await read());
const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_shot_icon.png", Buffer.from(shot.data, "base64"));
await ext(`chrome.storage.sync.set({ kickIcon: false })`);
await new Promise(r => setTimeout(r, 1200));
console.log("icon-off", await read());
await ext(`chrome.storage.sync.set({ kickIcon: true })`);
await new Promise(r => setTimeout(r, 1200));
console.log("icon-on", await read());
await c.send("Page.reload");
await new Promise(r => setTimeout(r, 4500));
await ext(`chrome.storage.sync.set({ kickIcon: false, colorBar: true, tintKick: true, tintTwitch: true, showTimestamps: true, showBadges: true, kickBadges: true })`);
await new Promise(r => setTimeout(r, 1200));
console.log("persist-off-after-reload", await read());
await ext(`chrome.storage.sync.set({ kickIcon: true })`);
await new Promise(r => setTimeout(r, 800));
c.close();
