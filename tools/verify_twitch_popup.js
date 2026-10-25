import { connect, openTab, targets } from "./cdp.js";
const extId = process.argv[2];
const version = await fetch("http://127.0.0.1:9333/json/version").then(r => r.json());
const browser = await connect(version.webSocketDebuggerUrl);
await browser.send("Target.setDiscoverTargets", { discover: true, filter: [{ type: "tab" }] });
await new Promise(r => setTimeout(r, 500));
const tabs = await browser.send("Target.getTargets", { filter: [{ type: "tab" }] });
const tab = tabs.targetInfos.find(t => t.url.includes("twitch.tv"));
console.log("tab", tab && tab.url);
if (tab) {
  await browser.send("Extensions.triggerAction", { id: extId, targetId: tab.targetId }).catch(e => console.log("trigger err", String(e)));
}
browser.close();
await new Promise(r => setTimeout(r, 1200));
const popup = (await targets()).find(t => t.url.includes("/popup/popup.html"));
if (!popup) { console.log("no popup"); process.exit(1); }
const c = await connect(popup.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
const text = await c.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
console.log("POPUP TEXT\n" + text.result.value.slice(0, 700));
const vals = await c.send("Runtime.evaluate", { expression: `JSON.stringify({ label: document.getElementById('mapping-label').textContent, hint: document.getElementById('mapping-hint').textContent, input: document.getElementById('twitch-input').value, kick: document.getElementById('kick-name').textContent, twitch: document.getElementById('twitch-name').textContent })`, returnByValue: true });
console.log("VALUES", vals.result.value);
const s = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_twitch_popup.png", Buffer.from(s.data, "base64"));
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${popup.id}`);
