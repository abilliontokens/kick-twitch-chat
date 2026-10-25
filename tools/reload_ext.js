// Reload the unpacked extension through CDP (uninstall + loadUnpacked) so code
// edits are picked up without touching the Chrome UI.
const EXT = "D:\\kick_twitch";
const version = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json());
const { connect } = await import("./cdp.js");
const c = await connect(version.webSocketDebuggerUrl);
const current = await c.send("Extensions.getExtensions");
for (const ext of current.extensions || []) {
  if (ext.path && ext.path.toLowerCase() === EXT.toLowerCase()) {
    console.log("uninstalling", ext.id);
    await c.send("Extensions.uninstall", { id: ext.id }).catch((e) => console.log("uninstall", String(e)));
  }
}
const loaded = await c.send("Extensions.loadUnpacked", { path: EXT });
console.log("loaded", JSON.stringify(loaded));
c.close();
