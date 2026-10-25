import { connect, targets, openTab } from "./cdp.js";
const extId = process.argv[2];
async function openPopupOn(urlPart) {
  const version = await fetch("http://127.0.0.1:9333/json/version").then(r => r.json());
  const browser = await connect(version.webSocketDebuggerUrl);
  await browser.send("Target.setDiscoverTargets", { discover: true, filter: [{ type: "tab" }] });
  await new Promise(r => setTimeout(r, 400));
  const tabs = await browser.send("Target.getTargets", { filter: [{ type: "tab" }] });
  const tab = tabs.targetInfos.find(t => t.url.includes(urlPart));
  if (tab) {
    await browser.send("Target.activateTarget", { targetId: tab.targetId }).catch(() => {});
    await new Promise(r => setTimeout(r, 400));
    await browser.send("Extensions.triggerAction", { id: extId, targetId: tab.targetId }).catch(() => {});
  }
  browser.close();
  await new Promise(r => setTimeout(r, 1000));
  return (await targets()).find(t => t.url.includes("/popup/popup.html"));
}
const popup = await openPopupOn("twitch.tv");
if (!popup) { console.log("no popup"); process.exit(1); }
const c = await connect(popup.webSocketDebuggerUrl);
await c.send("Runtime.enable");
const ev = async (e) => { const r = await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? "ERR " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };
console.log("before", await ev(`chrome.storage.sync.get('kickByTwitch').then(x => JSON.stringify(x))`));
console.log("save", await ev(`(() => { const i=document.getElementById('twitch-input'); i.value='schlump'; document.getElementById('mapping').requestSubmit(); return 'submitted'; })()`));
await new Promise(r => setTimeout(r, 2200));
console.log("after save", await ev(`chrome.storage.sync.get('kickByTwitch').then(x => JSON.stringify(x))`));
console.log("status", await ev(`chrome.tabs.query({active:true,currentWindow:true}).then(([t]) => chrome.tabs.sendMessage(t.id, {type:'ktw:status'})).then(x => JSON.stringify(x))`));
console.log("reset", await ev(`(() => { document.getElementById('reset').click(); return 'reset'; })()`));
await new Promise(r => setTimeout(r, 1800));
console.log("after reset", await ev(`chrome.storage.sync.get('kickByTwitch').then(x => JSON.stringify(x))`));
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${popup.id}`);
