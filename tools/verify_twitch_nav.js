import { connect, targets, openTab } from "./cdp.js";

let page = (await targets()).find((t) => t.type === "page" && t.url.includes("twitch.tv"));
if (!page) page = await openTab("about:blank");
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (e) => {
  const r = await c.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return "ERR " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await c.send("Page.navigate", { url: "https://www.twitch.tv/xqc" });
for (let i = 0; i < 80; i += 1) {
  if (await ev(`!!document.getElementById('ktw-pane') && document.querySelectorAll('#ktw-pane .ktw-row').length > 3`)) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 2500));
console.log(
  "BEFORE",
  await ev(`(() => {
    const p = document.getElementById('ktw-pane');
    if (!p) return 'no pane';
    const r = p.getBoundingClientRect();
    return JSON.stringify({
      url: location.pathname,
      twitch: p.querySelector('.ktw-channel').textContent,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      rows: p.querySelectorAll('.ktw-row').length,
      panes: document.querySelectorAll('#ktw-pane').length,
    });
  })()`),
);

const clicked = await ev(`(() => {
  const links = [...document.querySelectorAll('a[href^="/"]')].filter((a) => {
    const h = a.getAttribute('href') || '';
    if (h === location.pathname) return false;
    if (h.length < 3 || h.slice(1).includes('/')) return false;
    if (h === '/directory' || h === '/videos' || h === '/settings') return false;
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!links.length) return null;
  const a = links[0];
  const href = a.getAttribute('href');
  a.click();
  return href;
})()`);
console.log("CLICKED", clicked);

let after = null;
for (let i = 0; i < 30; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  const info = await ev(`(() => {
    const p = document.getElementById('ktw-pane');
    if (!p) return null;
    return JSON.stringify({
      url: location.pathname,
      twitch: p.querySelector('.ktw-channel').textContent,
      rows: p.querySelectorAll('.ktw-row').length,
      panes: document.querySelectorAll('#ktw-pane').length,
      states: [...p.querySelectorAll('.ktw-status')].map((n) => n.dataset.state),
    });
  })()`);
  after = info ? JSON.parse(info) : null;
  if (after && after.url !== "/xqc" && after.rows > 2) break;
}
console.log("AFTER", JSON.stringify(after));
c.close();
