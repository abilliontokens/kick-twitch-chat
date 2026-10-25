// Verify tint settings, the Kick marker toggle, persistence, and popup layout.
import { connect, openTab, targets } from "./cdp.js";

const extId = process.argv[2];
const settings = { enabled: true, twitchChannel: {}, showTimestamps: true, showBadges: true, tintTwitch: true, tintKick: true, colorBar: true };

const extTab = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise((r) => setTimeout(r, 800));
let c = await connect(extTab.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Runtime.evaluate", {
  expression: `chrome.storage.sync.set(${JSON.stringify(settings)})`,
  awaitPromise: true,
  returnByValue: true,
});
const popupShot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research/shot_popup.png", Buffer.from(popupShot.data, "base64"));
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${extTab.id}`);

const page = (await targets()).find((t) => t.type === "page" && t.url.includes("kick.com"));
c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (expression) => {
  const res = await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) return "ERR " + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
};
await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
for (let i = 0; i < 40; i += 1) {
  const ok = await ev(`(() => { const p = document.getElementById('ktw-pane'); return p && p.querySelectorAll('.ktw-row.ktw-from-twitch').length > 0 ? true : false; })()`);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 5000));

const state = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  const tw = p.querySelector('.ktw-row.ktw-from-twitch');
  const kk = p.querySelector('.ktw-row.ktw-from-kick');
  const css = (n) => n ? { bg: getComputedStyle(n).backgroundImage.slice(0, 90), shadow: getComputedStyle(n).boxShadow } : null;
  return JSON.stringify({ cls: p.className, tw: css(tw), kk: css(kk), twitch: p.querySelectorAll('.ktw-from-twitch').length, kick: p.querySelectorAll('.ktw-from-kick').length });
})()`);
console.log("state", state);
const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research/shot_tints.png", Buffer.from(shot.data, "base64"));

const off = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  document.querySelector('.ktw-settings-btn').click();
  p.querySelector('.ktw-menu [data-setting="colorBar"]').click();
  const kk = p.querySelector('.ktw-row.ktw-from-kick');
  const tw = p.querySelector('.ktw-row.ktw-from-twitch');
  return JSON.stringify({ cls: p.className, kickShadow: kk ? getComputedStyle(kk).boxShadow : null, twitchShadow: tw ? getComputedStyle(tw).boxShadow : null });
})()`);
console.log("marker-off", off);

await c.send("Page.reload");
await new Promise((r) => setTimeout(r, 5000));
const persisted = await ev(`(() => { const p = document.getElementById('ktw-pane'); return p ? p.className : 'no pane'; })()`);
console.log("persisted", persisted);
const restored = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  document.querySelector('.ktw-settings-btn').click();
  p.querySelector('.ktw-menu [data-setting="colorBar"]').click();
  return p.className;
})()`);
console.log("restored", restored);
c.close();
