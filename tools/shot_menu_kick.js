import { connect, targets, openTab } from "./cdp.js";
let page = (await targets()).find(t => t.type === "page" && t.url.includes("kick.com"));
if (!page) page = await openTab("https://kick.com/popout/xqc/chat");
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
const ev = async (e) => (await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
for (let i = 0; i < 60; i++) { if (await ev(`!!document.getElementById('ktw-pane') && document.querySelectorAll('#ktw-pane .ktw-row').length > 5`)) break; await new Promise(r => setTimeout(r, 500)); }
await new Promise(r => setTimeout(r, 2500));
console.log(await ev(`(() => { document.querySelector('.ktw-settings-btn').click(); const m=document.querySelector('#ktw-pane .ktw-menu'); return JSON.stringify({ menu:!!m, checked:[...m.querySelectorAll('input')].map(i=>i.dataset.setting+'='+i.checked) }); })()`));
const s = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_menu_kick.png", Buffer.from(s.data, "base64"));
c.close();
