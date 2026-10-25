// Verify the in-pane display settings persist across reloads.
import { connect, targets } from "./cdp.js";

const page = (await targets()).find((t) => t.type === "page");
const c = await connect(page.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Page.enable");
const ev = async (expression) => {
  const res = await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) return "ERR: " + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
};
const waitPane = async () => {
  for (let i = 0; i < 40; i += 1) {
    const ok = await ev(`(() => { const p = document.getElementById('ktw-pane'); return p && p.querySelectorAll('.ktw-row').length > 5 ? true : false; })()`);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

await c.send("Page.navigate", { url: "https://kick.com/popout/xqc/chat" });
console.log("pane", await waitPane());

const before = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  document.querySelector('.ktw-settings-btn').click();
  const menu = p.querySelector('.ktw-menu');
  return JSON.stringify({ cls: p.className, menuHidden: menu.hidden, ts: menu.querySelector('[data-setting="showTimestamps"]').checked, badges: menu.querySelector('[data-setting="showBadges"]').checked });
})()`);
console.log("before", before);

const afterOff = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  p.querySelector('.ktw-menu [data-setting="showTimestamps"]').click();
  return JSON.stringify({ cls: p.className, ts: p.querySelector('.ktw-menu [data-setting="showTimestamps"]').checked, visibleTs: p.querySelectorAll('.ktw-ts').length });
})()`);
console.log("after-off", afterOff);
const shot = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research/shot_settings.png", Buffer.from(shot.data, "base64"));

await c.send("Page.reload");
await new Promise((r) => setTimeout(r, 4000));
const rs = await ev("document.readyState");
console.log("readyState", rs, "pane-after-reload", await waitPane());
const persisted = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  const menu = p.querySelector('.ktw-menu');
  return JSON.stringify({ cls: p.className, ts: menu.querySelector('[data-setting="showTimestamps"]').checked, tsHidden: getComputedStyle(p.querySelector('.ktw-ts')).display });
})()`);
console.log("persisted", persisted);

const restored = await ev(`(() => {
  const p = document.getElementById('ktw-pane');
  p.querySelector('.ktw-menu [data-setting="showTimestamps"]').click();
  return JSON.stringify({ cls: p.className, checked: p.querySelector('.ktw-menu [data-setting="showTimestamps"]').checked });
})()`);
console.log("restored", restored);
await new Promise((r) => setTimeout(r, 500));
c.close();
