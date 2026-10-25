import { connect, openTab, targets } from "./cdp.js";
const extId = process.argv[2];
let page = (await targets()).find(t => t.type === "page" && (t.url.includes("twitch.tv") || t.url === "about:blank"));
if (!page) page = await openTab("about:blank");
const c = await connect(page.webSocketDebuggerUrl);
const lines = [];
await c.send("Runtime.enable"); await c.send("Page.enable"); await c.send("Network.enable"); await c.send("Log.enable");
c.on("Runtime.consoleAPICalled", p => { const t=(p.args||[]).map(a=>a.value??a.description??"").join(" "); if (/ktw|error|blocked|cors|realtime|kick/i.test(t)) lines.push(`${p.type}: ${t}`.slice(0,300)); });
c.on("Runtime.exceptionThrown", p => lines.push("EXC: " + (p.exceptionDetails?.exception?.description||p.exceptionDetails?.text||"").slice(0,300)));
c.on("Log.entryAdded", p => { if (p.entry.level === "error") lines.push("LOG: " + p.entry.text.slice(0,250)); });
const reqs = [];
c.on("Network.requestWillBeSent", p => { if (/kick\.com\/api|web\.kick\.com/.test(p.request.url)) reqs.push(p.request.method + " " + p.request.url.slice(0,130)); });
const ev = async (e) => { const r = await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? "ERR " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };
await c.send("Page.navigate", { url: "https://www.twitch.tv/popout/xqc/chat?popout=" });
for (let i = 0; i < 70; i++) {
  const ok = await ev(`(() => { const p=document.getElementById('ktw-pane'); return p && p.querySelectorAll('.ktw-row').length > 5; })()`);
  if (ok) break;
  await new Promise(r => setTimeout(r, 500));
}
await new Promise(r => setTimeout(r, 8000));
const detail = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  if (!p) return JSON.stringify({ pane:false, url:location.href, body:document.body.innerText.slice(0,200) });
  const r = p.getBoundingClientRect();
  return JSON.stringify({
    pane: true,
    rect: { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) },
    cls: p.className,
    states: [...p.querySelectorAll('.ktw-status')].map(n => n.dataset.who + ':' + n.dataset.state),
    kick: p.querySelectorAll('.ktw-row.ktw-from-kick').length,
    twitch: p.querySelectorAll('.ktw-row.ktw-from-twitch').length,
    kickIcons: p.querySelectorAll('.ktw-row.ktw-from-kick .ktw-kick-icon').length,
    twitchIcons: p.querySelectorAll('.ktw-row.ktw-from-twitch .ktw-twitch-icon').length,
    sevenTV: p.querySelectorAll('.ktw-7tv-emote').length,
    badges: p.querySelectorAll('.ktw-badge-img').length,
    samplesKick: [...p.querySelectorAll('.ktw-row.ktw-from-kick')].slice(-2).map(x=>x.innerText.slice(0,80)),
    samplesTwitch: [...p.querySelectorAll('.ktw-row.ktw-from-twitch')].slice(-2).map(x=>x.innerText.slice(0,80)),
  });
})()`);
console.log("DETAIL", detail);
console.log("REQS", JSON.stringify([...new Set(reqs)].slice(0,8)));
console.log("CONSOLE", JSON.stringify(lines.slice(0,10)));
const s = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_twitch.png", Buffer.from(s.data, "base64"));
const native = await ev(`(() => { const p=document.getElementById('ktw-pane'); const b=p.querySelector('.ktw-toggle'); b.click(); return JSON.stringify({ cls:p.className, list:getComputedStyle(p.querySelector('.ktw-list')).display }); })()`);
console.log("NATIVE", native);
await ev(`document.querySelector('.ktw-toggle').click()`);
c.close();
