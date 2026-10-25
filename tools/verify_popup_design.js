import { connect, targets, openTab } from "./cdp.js";
const extId = process.argv[2];
const defaults = { enabled: true, twitchChannel: {}, kickByTwitch: {}, showTimestamps: true, showBadges: true, tintTwitch: true, tintKick: true, colorBar: true, kickIcon: true, kickBadges: true };

// 1. reset settings + reload Twitch tab so content scripts re-inject
let page = (await targets()).find(t => t.type === "page" && t.url.includes("twitch.tv"));
if (!page) page = await openTab("about:blank");
let c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
await c.send("Page.navigate", { url: "https://www.twitch.tv/popout/xqc/chat?popout=" });
await new Promise(r => setTimeout(r, 7000));
const ev = async (e) => { const r = await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? "ERR " + r.exceptionDetails.text : r.result.value; };
const twitchTabId = page.id;
c.close();

// 2. set defaults via extension page
let t = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise(r => setTimeout(r, 500));
c = await connect(t.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Runtime.evaluate", { expression: `chrome.storage.sync.set(${JSON.stringify(defaults)})`, awaitPromise: true, returnByValue: true });
c.close(); await fetch(`http://127.0.0.1:9333/json/close/${t.id}`);

// 3. activate the Twitch tab and open the real action popup
const version = await fetch("http://127.0.0.1:9333/json/version").then(r => r.json());
const browser = await connect(version.webSocketDebuggerUrl);
await browser.send("Target.setDiscoverTargets", { discover: true, filter: [{ type: "tab" }] });
await new Promise(r => setTimeout(r, 400));
const tabs = await browser.send("Target.getTargets", { filter: [{ type: "tab" }] });
const tab = tabs.targetInfos.find(x => x.url.includes("twitch.tv"));
if (tab) {
  await browser.send("Target.activateTarget", { targetId: tab.targetId });
  await new Promise(r => setTimeout(r, 400));
  await browser.send("Extensions.triggerAction", { id: extId, targetId: tab.targetId }).catch(e => console.log("trigger", String(e)));
}
browser.close();
await new Promise(r => setTimeout(r, 1200));
const popup = (await targets()).find(x => x.url.includes("/popup/popup.html"));
if (!popup) { console.log("no popup"); process.exit(1); }
c = await connect(popup.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
const info = await c.send("Runtime.evaluate", { expression: `JSON.stringify({
  text: document.body.innerText.slice(0, 500),
  switches: [...document.querySelectorAll('.row-switch input')].map(i => ({ id: i.id, checked: i.checked, w: getComputedStyle(i).width, h: getComputedStyle(i).height, bg: getComputedStyle(i).backgroundColor })),
  hero: getComputedStyle(document.querySelector('.switch .track')).backgroundColor,
  label: document.getElementById('mapping-label').textContent,
})`, returnByValue: true });
console.log("POPUP", info.result.value);
const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_popup_new.png", Buffer.from(shot.data, "base64"));
const toggled = await c.send("Runtime.evaluate", { expression: `(() => { const i=document.getElementById('timestamps'); i.click(); return i.checked; })()`, returnByValue: true });
await new Promise(r => setTimeout(r, 500));
const stored = await c.send("Runtime.evaluate", { expression: `chrome.storage.sync.get('showTimestamps').then(x => JSON.stringify(x))`, awaitPromise: true, returnByValue: true });
console.log("TOGGLE", toggled.result.value, "STORED", stored.result.value);
await c.send("Runtime.evaluate", { expression: `document.getElementById('timestamps').click()` });
c.close(); await fetch(`http://127.0.0.1:9333/json/close/${popup.id}`);

// 4. mini menu screenshot with defaults
page = (await targets()).find(x => x.type === "page" && x.url.includes("twitch.tv"));
c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
for (let i = 0; i < 30; i++) { if (await ev(`!!document.getElementById('ktw-pane')`)) break; await new Promise(r => setTimeout(r, 400)); }
await new Promise(r => setTimeout(r, 1500));
const menu = await ev(`(() => { document.querySelector('.ktw-settings-btn').click(); const m=document.querySelector('#ktw-pane .ktw-menu'); return JSON.stringify({ hidden:m.hidden, checked:[...m.querySelectorAll('input')].map(i=>i.dataset.setting+'='+i.checked) }); })()`);
console.log("MENU", menu);
const ms = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_menu_new.png", Buffer.from(ms.data, "base64"));
c.close();
