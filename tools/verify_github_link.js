import { connect, openTab, targets } from "./cdp.js";
const extId = process.argv[2];
const popup = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise(r => setTimeout(r, 800));
let c = await connect(popup.webSocketDebuggerUrl);
await c.send("Runtime.enable");
const pop = await c.send("Runtime.evaluate", { expression: `(() => { const a = document.querySelector('.repo-line a'); return a ? JSON.stringify({ text: a.textContent, href: a.href, target: a.target }) : 'missing'; })()`, returnByValue: true });
console.log("popup", pop.result.value);
const ps = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_github_popup.png", Buffer.from(ps.data, "base64"));
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${popup.id}`);

let page = (await targets()).find(t => t.type === "page" && t.url.includes("kick.com"));
if (!page) page = await openTab("about:blank");
c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (expr) => (await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
for (let i = 0; i < 60; i++) {
  if (await ev(`!!document.getElementById('ktw-pane')`)) break;
  await new Promise(r => setTimeout(r, 500));
}
await new Promise(r => setTimeout(r, 1500));
const menu = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  if (!p) return 'no pane';
  document.querySelector('.ktw-settings-btn').click();
  const a = p.querySelector('.ktw-menu .ktw-repo-link');
  return a ? JSON.stringify({ text: a.textContent, href: a.href, target: a.target }) : 'missing';
})()`);
console.log("gear", menu);
const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_github_gear.png", Buffer.from(shot.data, "base64"));
c.close();
