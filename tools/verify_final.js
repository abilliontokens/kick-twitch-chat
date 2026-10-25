// Final end-to-end check: defaults restored, both feeds live, popup action opens.
import { connect, openTab, targets } from "./cdp.js";

const extId = process.argv[2];
const defaults = { enabled: true, twitchChannel: {}, showTimestamps: true, showBadges: true, tintTwitch: true, tintKick: true, colorBar: true, kickIcon: true, kickBadges: true };

const extTab = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise((r) => setTimeout(r, 600));
let c = await connect(extTab.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Runtime.evaluate", { expression: `chrome.storage.sync.set(${JSON.stringify(defaults)})`, awaitPromise: true, returnByValue: true });
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${extTab.id}`);

let page = (await targets()).find((t) => t.type === "page" && t.url.includes("kick.com"));
if (!page) page = await openTab("about:blank");
c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (expression) => {
  const res = await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) return "ERR " + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
};
await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });

let snapshot = null;
for (let i = 0; i < 60; i += 1) {
  await new Promise((r) => setTimeout(r, 700));
  const info = await ev(`(() => {
    const p = document.getElementById('ktw-pane');
    if (!p) return JSON.stringify({ pane: false });
    return JSON.stringify({
      pane: true,
      cls: p.className,
      states: [...p.querySelectorAll('.ktw-status')].map(n => n.dataset.who + ':' + n.dataset.state),
      kick: p.querySelectorAll('.ktw-from-kick').length,
      twitch: p.querySelectorAll('.ktw-from-twitch').length,
      icons: p.querySelectorAll('.ktw-from-twitch .ktw-twitch-icon').length,
      sevenTV: p.querySelectorAll('.ktw-7tv-emote').length,
      badges: p.querySelectorAll('.ktw-badge-img').length,
      emotes: p.querySelectorAll('.ktw-emote').length,
      following: p.querySelector('.ktw-jump').hidden,
    });
  })()`);
  snapshot = JSON.parse(info);
  if (snapshot.pane && snapshot.kick > 5 && snapshot.twitch > 5 && snapshot.sevenTV > 0) break;
}
console.log("final", JSON.stringify(snapshot));
const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research/shot_final.png", Buffer.from(shot.data, "base64"));
const tabId = page.id;
c.close();

const version = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json());
const browser = await connect(version.webSocketDebuggerUrl);
try {
  const res = await browser.send("Extensions.triggerAction", { id: extId, targetId: tabId });
  console.log("triggerAction", JSON.stringify(res || {}));
} catch (err) {
  console.log("triggerAction failed", String(err).slice(0, 200));
}
browser.close();
await new Promise((r) => setTimeout(r, 1200));
const after = await targets();
const popupTarget = after.find((t) => t.url.includes("/popup/popup.html"));
console.log("popup target", popupTarget ? `${popupTarget.type} ${popupTarget.url}` : "none");
if (popupTarget) {
  const pc = await connect(popupTarget.webSocketDebuggerUrl);
  await pc.send("Page.enable");
  const ps = await pc.send("Page.captureScreenshot", { format: "png" });
  await Bun.write("research/shot_popup_live.png", Buffer.from(ps.data, "base64"));
  const body = await pc.send("Runtime.evaluate", { expression: "document.body.innerText.slice(0,400)", returnByValue: true });
  console.log("popup text", JSON.stringify(body.result.value));
  pc.close();
}
