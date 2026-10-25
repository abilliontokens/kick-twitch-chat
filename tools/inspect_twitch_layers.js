import { targets } from "./cdp.js";
import { evalIn } from "./cdp.js";
const page = (await targets()).find(t => t.type === "page" && t.url.includes("twitch.tv"));
console.log(await evalIn(page, `(() => {
  const p = document.getElementById('ktw-pane');
  const bar = p && p.querySelector('.ktw-bar');
  const br = bar && bar.getBoundingClientRect();
  const hit = br ? document.elementFromPoint(br.x + 60, br.y + 12) : null;
  const scroller = document.querySelector('[data-a-target="chat-scroller"]');
  const host = scroller && scroller.parentElement;
  const chain = [];
  let e = p;
  for (let i = 0; i < 7 && e; i++) {
    const cs = getComputedStyle(e);
    chain.push({ tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 70), pos: cs.position, z: cs.zIndex, overflow: cs.overflow, transform: cs.transform !== 'none' });
    e = e.parentElement;
  }
  return JSON.stringify({
    pane: p ? { z: getComputedStyle(p).zIndex, rect: p.getBoundingClientRect().toJSON() } : null,
    bar: br ? { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) } : null,
    hit: hit ? { tag: hit.tagName, cls: String(hit.className).slice(0,100), text: (hit.innerText||'').slice(0,60) } : null,
    chain,
    hostKids: host ? [...host.children].map(k => ({ tag:k.tagName, cls:String(k.className).slice(0,80), z:getComputedStyle(k).zIndex, pos:getComputedStyle(k).position })) : null
  }, null, 1);
})()`));
