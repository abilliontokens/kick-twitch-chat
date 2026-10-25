import { connect, targets } from "./cdp.js";
const t = (await targets()).find(x => x.type === "page" && x.url.includes("/popup/popup.html"));
if (!t) { console.log("no popup target"); process.exit(1); }
const c = await connect(t.webSocketDebuggerUrl);
await c.send("Page.enable");
await c.send("Runtime.enable");
await new Promise(r => setTimeout(r, 500));
const body = await c.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
console.log(body.result.value);
const s = await c.send("Page.captureScreenshot", { format: "png" });
await Bun.write("research/shot_popup_live.png", Buffer.from(s.data, "base64"));
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${t.id}`);
