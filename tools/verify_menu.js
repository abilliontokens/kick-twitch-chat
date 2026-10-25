import { connect, targets, openTab } from "./cdp.js";
let page = (await targets()).find(t => t.type === "page" && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://"));
if (!page) page = await openTab("about:blank");
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable"); await c.send("Page.enable");
const ev = async (e) => { const r = await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? "ERR " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };
await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
for (let i = 0; i < 60; i++) { if (await ev(`!!document.getElementById('ktw-pane') && document.querySelectorAll('#ktw-pane .ktw-row').length > 5`)) break; await new Promise(r => setTimeout(r, 500)); }
await new Promise(r => setTimeout(r, 3000));
const open = await ev(`(() => {
  document.querySelector('.ktw-settings-btn').click();
  const m = document.querySelector('#ktw-pane .ktw-menu');
  const r = m.getBoundingClientRect();
  return JSON.stringify({
    hidden: m.hidden,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    head: m.querySelector('.ktw-menu-head span').textContent,
    close: !!m.querySelector('.ktw-menu-close'),
    groups: m.querySelectorAll('.ktw-menu-group').length,
    labels: [...m.querySelectorAll('label > span')].map(x => x.textContent),
    checked: [...m.querySelectorAll('input')].map(x => x.dataset.setting + '=' + x.checked),
    switches: [...m.querySelectorAll('input')].map(x => { const cs = getComputedStyle(x); return { w: cs.width, h: cs.height, radius: cs.borderRadius, appearance: cs.appearance }; }),
    bg: getComputedStyle(m).backgroundImage.slice(0, 60),
  });
})()`);
console.log("OPEN", open);
const s = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research_menu.png", Buffer.from(s.data, "base64"));
const toggled = await ev(`(() => { const p=document.getElementById('ktw-pane'); p.querySelector('.ktw-menu input[data-setting="tintTwitch"]').click(); return JSON.stringify({ cls:p.className, checked:p.querySelector('.ktw-menu input[data-setting="tintTwitch"]').checked }); })()`);
console.log("TOGGLE", toggled);
await ev(`document.querySelector('#ktw-pane .ktw-menu input[data-setting="tintTwitch"]').click()`);
const closed = await ev(`(() => { document.querySelector('#ktw-pane .ktw-menu-close').click(); return document.querySelector('#ktw-pane .ktw-menu').hidden; })()`);
console.log("CLOSED", closed);
const outside = await ev(`(() => { document.querySelector('.ktw-settings-btn').click(); document.querySelector('#ktw-pane .ktw-list').click(); return document.querySelector('#ktw-pane .ktw-menu').hidden; })()`);
console.log("OUTSIDE", outside);
c.close();
