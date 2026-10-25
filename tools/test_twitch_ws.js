import { targets } from "./cdp.js";
import { evalIn } from "./cdp.js";
const page = (await targets()).find(t => t.type === "page" && t.url.includes("twitch.tv"));
if (!page) { console.log("no twitch tab"); process.exit(1); }
const out = await evalIn(page, `(async () => {
  const url = "wss://realtime.us-west-2.platform.kick.com/connection/websocket";
  return await new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const ws = new WebSocket(url);
      const t = setTimeout(() => { try { ws.close(); } catch (e) {} done("timeout"); }, 6000);
      ws.onopen = () => { clearTimeout(t); ws.send(JSON.stringify({ id: 1, connect: { token: "invalid" } })); };
      ws.onmessage = (ev) => { clearTimeout(t); done("OPEN message:" + String(ev.data).slice(0, 160)); try{ws.close();}catch(e){} };
      ws.onerror = () => { clearTimeout(t); done("ERROR"); };
      ws.onclose = (ev) => { clearTimeout(t); done("CLOSE " + ev.code + " " + ev.reason); };
    } catch (e) { done("THROW " + String(e)); }
  });
})()`);
console.log(out);
