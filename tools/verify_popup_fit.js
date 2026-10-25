import { connect, targets, openTab } from "./cdp.js";
const extId = process.argv[2];
const defaults = { enabled: true, twitchChannel: {}, kickByTwitch: {}, showTimestamps: true, showBadges: true, tintTwitch: true, tintKick: true, colorBar: true, kickIcon: true, kickBadges: true };

// reset + reload twitch content scripts
let page = (await targets()).find(t => t.type === "page" && t.url.includes("twitch.tv"));
if (!page) page = await openTab("about:blank");
let c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
await c.send("Page.navigate", { url: "https://www.twitch.tv/popout/xqc/chat?popout=" });
await new Promise(r => setTimeout(r, 6500));
c.close();

let t = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise(r => setTimeout(r, 500));
c = await connect(t.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Runtime.evaluate", { expression: `chrome.storage.sync.set(${JSON.stringify(defaults)})`, awaitPromise: true, returnByValue: true });
c.close(); await fetch(`http://127.0.0.1:9333/json/close/${t.id}`);
await new Promise(r => setTimeout(r, 800));

// open real popup on the twitch tab
const version = await fetch("http://127.0.0.1:9333/json/version").then(r => r.json());
const browser = await connect(version.webSocketDebuggerUrl);
await browser.send("Target.setDiscoverTargets", { discover: true, filter: [{ type: "tab" }] });
await new Promise(r => setTimeout(r, 400));
const tabs = await browser.send("Target.getTargets", { filter: [{ type: "tab" }] });
const tab = tabs.targetInfos.find(x => x.url.includes("twitch.tv"));
if (tab) {
  await browser.send("Target.activateTarget", { targetId: tab.targetId });
  await new Promise(r => setTimeout(r, 300));
  await browser.send("Extensions.triggerAction", { id: extId, targetId: tab.targetId }).catch(() => {});
}
browser.close();
await new Promise(r => setTimeout(r, 1200));
const popup = (await targets()).find(x => x.url.includes("/popup/popup.html"));
if (!popup) { console.log("no popup"); process.exit(1); }
c = await connect(popup.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
const fit = await c.send("Runtime.evaluate", { expression: `JSON.stringify({
  inner: window.innerHeight,
  bodyH: document.body.scrollHeight,
  docH: document.documentElement.scrollHeight,
  scrollable: document.documentElement.scrollHeight > window.innerHeight + 2,
  switches: [...document.querySelectorAll('.row-switch input')].map(i => i.id + '=' + i.checked),
  displayRows: document.querySelectorAll('.panel-group.grid2').length,
})`, returnByValue: true });
console.log("FIT", fit.result.value);
const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_popup_final.png", Buffer.from(shot.data, "base64"));
c.close(); await fetch(`http://127.0.0.1:9333/json/close/${popup.id}`);

// menu check
page = (await targets()).find(x => x.type === "page" && x.url.includes("twitch.tv"));
c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
const ev = async (e) => (await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
for (let i = 0; i < 30; i++) { if (await ev(`!!document.getElementById('ktw-pane')`)) break; await new Promise(r => setTimeout(r, 400)); }
await new Promise(r => setTimeout(r, 1500));
console.log("MENU", await ev(`(() => { document.querySelector('.ktw-settings-btn').click(); const m=document.querySelector('#ktw-pane .ktw-menu'); return JSON.stringify({ checked:[...m.querySelectorAll('input')].map(i=>i.dataset.setting+'='+i.checked), h:Math.round(m.getBoundingClientRect().height) }); })()`));
const ms = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_menu_final.png", Buffer.from(ms.data, "base64"));
c.close();
