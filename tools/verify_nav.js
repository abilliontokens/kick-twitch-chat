// Verify the Native toggle and client-side navigation to another Kick channel.
import { connect, targets } from "./cdp.js";

const page = (await targets()).find(
  (t) => t.type === "page" && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://"),
);
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");

async function evaluate(expression) {
  const res = await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
}

async function shot(name) {
  const s = await c.send("Page.captureScreenshot", { format: "png" });
  await Bun.write(`research/${name}.png`, Buffer.from(s.data, "base64"));
}

async function waitFor(expression, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = await evaluate(expression).catch(() => null);
    if (value) return value;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

await c.send("Page.navigate", { url: "https://kick.com/xqc" });
const ready = await waitFor(`(() => {
  const p = document.getElementById('ktw-pane');
  if (!p) return null;
  const states = [...p.querySelectorAll('.ktw-status')].map(n => n.dataset.state);
  const rows = p.querySelectorAll('.ktw-row').length;
  return rows > 20 && states.every(s => s === 'live') ? { rows, states } : null;
})()`);
console.log("ready", JSON.stringify(ready));

const toggle1 = await evaluate(`(() => {
  document.querySelector('.ktw-toggle').click();
  const p = document.getElementById('ktw-pane');
  return JSON.stringify({ cls: p.className, list: getComputedStyle(p.querySelector('.ktw-list')).display, nativeVisible: getComputedStyle(document.querySelector('#chatroom-messages')).visibility, rows: p.querySelectorAll('.ktw-row').length });
})()`);
console.log("native-on", toggle1);
await shot("shot_native");

await evaluate(`document.querySelector('.ktw-toggle').click()`);
await new Promise((r) => setTimeout(r, 400));
const toggle2 = await evaluate(`(() => {
  const p = document.getElementById('ktw-pane');
  return JSON.stringify({ cls: p.className, list: getComputedStyle(p.querySelector('.ktw-list')).display });
})()`);
console.log("native-off", toggle2);

const clicked = await evaluate(`(() => {
  const link = [...document.querySelectorAll('a[href="/schlump"]')].find(a => a.getBoundingClientRect().width > 0);
  if (!link) return false;
  link.click();
  return true;
})()`);
console.log("clicked schlump", clicked);

const nav = await waitFor(`(() => {
  if (!location.pathname.includes('schlump')) return null;
  const p = document.getElementById('ktw-pane');
  if (!p) return null;
  const chan = p.querySelector('.ktw-channel');
  const states = [...p.querySelectorAll('.ktw-status')].map(n => n.dataset.state);
  return { url: location.pathname, chan: chan && chan.textContent, states, rows: p.querySelectorAll('.ktw-row').length };
})()`, 40000);
console.log("nav", JSON.stringify(nav));
await new Promise((r) => setTimeout(r, 6000));
const after = await evaluate(`(() => {
  const p = document.getElementById('ktw-pane');
  if (!p) return JSON.stringify({ pane: false, url: location.href });
  return JSON.stringify({
    url: location.pathname,
    chan: p.querySelector('.ktw-channel').textContent,
    states: [...p.querySelectorAll('.ktw-status')].map(n => ({ who: n.dataset.who, state: n.dataset.state })),
    kick: p.querySelectorAll('.ktw-row[data-src="kick"]').length,
    twitch: p.querySelectorAll('.ktw-row.ktw-from-twitch').length,
    sevenTV: p.querySelectorAll('.ktw-7tv-emote').length,
    firstRows: [...p.querySelectorAll('.ktw-row')].slice(0, 3).map(r => r.innerText.slice(0, 60)),
  });
})()`);
console.log("after", after);
await shot("shot_schlump");
c.close();
