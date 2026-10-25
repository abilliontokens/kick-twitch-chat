import { connect, openTab, targets } from "./cdp.js";
let page = (await targets()).find(t => t.type === "page" && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://"));
if (!page) page = await openTab("about:blank");
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (e) => {
  const r = await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return "ERR " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await c.send("Page.navigate", { url: "https://www.twitch.tv/popout/xqc/chat?popout=" });
await new Promise(r => setTimeout(r, 9000));
const info = await ev(`JSON.stringify({
  url: location.href,
  ready: document.readyState,
  hasScroller: !!document.querySelector('[data-a-target="chat-scroller"]'),
  hasContainer: !!document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]'),
  hasSimplebar: !!document.querySelector('.simplebar-scroll-content'),
  hasInput: !!document.querySelector('[data-a-target="chat-input"]'),
  lines: document.querySelectorAll('[data-a-target="chat-line-message"]').length,
  body: document.body.innerText.slice(0, 250)
})`);
console.log(info);
const geom = await ev(`(() => {
  function g(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 140), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, parent: el.parentElement ? { tag: el.parentElement.tagName, id: el.parentElement.id, cls: String(el.parentElement.className).slice(0, 100) } : null };
  }
  return JSON.stringify({
    scroller: g(document.querySelector('[data-a-target="chat-scroller"]')),
    container: g(document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]')),
    simplebarContent: g(document.querySelector('.simplebar-content')),
    input: g(document.querySelector('[data-a-target="chat-input"]'))
  });
})()`);
console.log(geom);
const html = await ev(`(() => { const e = document.querySelector('[data-a-target="chat-scroller"]'); return e ? e.outerHTML.slice(0, 2500) : 'none'; })()`);
console.log(html);
c.close();
