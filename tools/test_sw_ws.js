import { connect, openTab, targets } from "./cdp.js";
const extId = process.argv[2];
const t = await openTab(`chrome-extension://${extId}/popup/popup.html`);
await new Promise(r => setTimeout(r, 600));
let c = await connect(t.webSocketDebuggerUrl);
await c.send("Runtime.enable");
await c.send("Runtime.evaluate", { expression: `chrome.runtime.sendMessage({type:"ktw:twitch-badges"})`, awaitPromise: true, returnByValue: true });
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${t.id}`);
await new Promise(r => setTimeout(r, 800));
const list = await targets();
console.log(list.map(x => `${x.type} ${x.url.slice(0,80)}`).join("\n"));
const sw = list.find(x => x.type === "service_worker" && x.url.includes(extId));
if (!sw) { console.log("no SW target"); process.exit(1); }
const sc = await connect(sw.webSocketDebuggerUrl);
await sc.send("Runtime.enable");
const res = await sc.send("Runtime.evaluate", {
  expression: `(async () => {
    const url = "wss://realtime.us-west-2.platform.kick.com/connection/websocket";
    return await new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        const ws = new WebSocket(url);
        const t = setTimeout(() => { try{ws.close();}catch(e){} done("timeout"); }, 7000);
        ws.onopen = () => { clearTimeout(t); ws.send(JSON.stringify({ id: 1, connect: { token: "invalid" } })); };
        ws.onmessage = (ev) => { clearTimeout(t); done("OPEN message:" + String(ev.data).slice(0, 200)); try{ws.close();}catch(e){} };
        ws.onerror = () => { clearTimeout(t); done("ERROR"); };
        ws.onclose = (ev) => { clearTimeout(t); done("CLOSE " + ev.code + " " + ev.reason); };
      } catch (e) { done("THROW " + String(e)); }
    });
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("SW result:", res.result.value);
sc.close();
