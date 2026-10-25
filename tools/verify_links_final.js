import { connect, openTab, targets } from "./cdp.js";
const extId = process.argv[2];
const popup = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise(r => setTimeout(r, 700));
let c = await connect(popup.webSocketDebuggerUrl);
await c.send("Runtime.enable");
const p = await c.send("Runtime.evaluate", { expression: `(() => { const a=document.querySelector('.repo-line a'); return a ? a.href : 'missing popup link'; })()`, returnByValue: true });
console.log("popup", p.result.value);
c.close(); await fetch(`http://127.0.0.1:9333/json/close/${popup.id}`);

let page = (await targets()).find(t => t.type === "page" && t.url.includes("kick.com"));
if (!page) page = await openTab("about:blank");
c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
const ev = async (e) => (await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
for (let i = 0; i < 50; i++) { if (await ev(`!!document.getElementById('ktw-pane')`)) break; await new Promise(r=>setTimeout(r,500)); }
await new Promise(r => setTimeout(r, 1200));
const gear = await ev(`(() => { const p=document.getElementById('ktw-pane'); if(!p) return 'no pane'; document.querySelector('.ktw-settings-btn').click(); return JSON.stringify({ menu: !!p.querySelector('.ktw-menu'), repoLink: !!p.querySelector('.ktw-menu .ktw-repo-link') }); })()`);
console.log("gear", gear);
c.close();
