import { targets } from "./cdp.js";
import { evalIn } from "./cdp.js";
const page = (await targets()).find(t => t.type === "page" && t.url.includes("twitch.tv"));
console.log(await evalIn(page, `(() => {
  const promo = document.querySelector('.highlight');
  const chain = [];
  let e = promo;
  for (let i = 0; i < 8 && e; i++) {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    chain.push({ tag: e.tagName, cls: String(e.className).slice(0, 80), pos: cs.position, z: cs.zIndex, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
    e = e.parentElement;
  }
  return JSON.stringify(chain, null, 1);
})()`));
