import { targets } from "./cdp.js";
import { evalIn } from "./cdp.js";
const page = (await targets()).find(t => t.type === "page" && t.url.includes("twitch.tv"));
if (!page) { console.log("no twitch page"); process.exit(1); }
console.log(await evalIn(page, `(() => {
  const s = document.querySelector('[data-a-target="chat-scroller"]');
  const p = s && s.parentElement;
  const gp = p && p.parentElement;
  const g = (e) => { if(!e) return null; const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return { tag:e.tagName, id:e.id, cls:String(e.className).slice(0,90), rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, pos:cs.position, overflow:cs.overflow, kids:e.children.length }; };
  return JSON.stringify({ scroller:g(s), parent:g(p), grand:g(gp), input:g(document.querySelector('[data-a-target="chat-input"]')) });
})()`));
