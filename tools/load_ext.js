// Close Chrome, relaunch with the unsafe-extension-debugging flag, and load the
// unpacked extension through the CDP Extensions domain (the supported path on
// Chrome 137+, where --load-extension was removed).
import { connect, targets } from "./cdp.js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = "D:\\ktw-profile";
const EXT = "D:\\kick_twitch";

async function closeBrowser() {
  try {
    const version = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json());
    const c = await connect(version.webSocketDebuggerUrl);
    await c.send("Browser.close").catch(() => {});
    c.close();
  } catch {
    /* not running */
  }
  await new Promise((r) => setTimeout(r, 1500));
}

async function launch() {
  if (process.env.SKIP_LAUNCH === "1") return;
  const args = [
    `--user-data-dir=${PROFILE}`,
    "--remote-debugging-port=9333",
    "--enable-unsafe-extension-debugging",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,950",
    "about:blank",
  ];
  const ps = `Start-Process -FilePath '${CHROME}' -ArgumentList ${args
    .map((a) => `'${a}'`)
    .join(",")}`;
  const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", ps], { stdout: "inherit", stderr: "inherit" });
  await proc.exited;
  for (let i = 0; i < 30; i += 1) {
    try {
      const v = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json());
      if (v.webSocketDebuggerUrl) return v;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Chrome did not expose CDP");
}

async function loadExtension() {
  const version = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json());
  const c = await connect(version.webSocketDebuggerUrl);
  const existing = await c.send("Extensions.getExtensions").catch((e) => ({ error: String(e) }));
  const already = existing && existing.extensions
    ? existing.extensions.find((e) => e.path && e.path.toLowerCase() === EXT.toLowerCase())
    : null;
  let result;
  if (already) {
    result = { id: already.id, note: "already loaded" };
  } else {
    result = await c.send("Extensions.loadUnpacked", { path: EXT });
  }
  c.close();
  return result;
}

if (process.env.ONLY_LOAD !== "1") await closeBrowser();
const version = await launch();
console.log("browser", version.Browser);
const loaded = await loadExtension();
console.log("extension", JSON.stringify(loaded));
const list = await targets();
console.log("targets", list.map((t) => `${t.type}:${t.url.slice(0, 70)}`));
