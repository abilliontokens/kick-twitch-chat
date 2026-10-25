import { connect, openTab, targets } from "./cdp.js";
const extId = process.argv[2];
const t = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise(r => setTimeout(r, 600));
let c = await connect(t.webSocketDebuggerUrl);
await c.send("Runtime.enable");
const res = await c.send("Runtime.evaluate", { expression: `chrome.runtime.sendMessage({type:"ktw:test-kick-ws"})`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(res.result.value));
c.close(); await fetch(`http://127.0.0.1:9333/json/close/${t.id}`);
