import { connect, openTab } from "./cdp.js";
const extId = process.argv[2];
const tab = await openTab("chrome://extensions-internals");
await new Promise(r => setTimeout(r, 800));
const c = await connect(tab.webSocketDebuggerUrl);
await c.send("Runtime.enable");
const res = await c.send("Runtime.evaluate", {
  expression: `(() => {
    const data = JSON.parse(document.body.innerText);
    const e = data.find(x => x.id === ${JSON.stringify(extId)});
    if (!e) return 'not found';
    return JSON.stringify({
      name: e.name, version: e.version, location: e.location, state: e.state,
      disable_reasons: e.disable_reasons, manifest_errors: e.manifest_errors,
      install_warnings: e.install_warnings, permissions: e.permissions && e.permissions.active && e.permissions.active,
    });
  })()`,
  returnByValue: true,
});
console.log(res.result.value);
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${tab.id}`);
