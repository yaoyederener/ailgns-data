// ⚡ 秒到通道（第三方 GaleBridge）的体检：核对它公开清单里的合约地址、币、限额。页面 gale.js 每次打开秒到通道先问这里，通过了才让客户发交易。
// 为什么要有：2026-11-21 页面改成本站自己的简体卡片、直接调 GaleBridge 的合约（它自己的小窗只有繁体 / 英文）。那是它没有公开写明的接法，
// 所以每次先看它官方接入文档里给的清单（galebridge.net/api/v1/integration/networks）：合约地址还是本站登记的那个、币还在、限额和每笔固定费是多少。
// 对不上就返回 ok: false，页面不让走（宁可拦）。它哪天换了合约，这里会先拦住，再由人核对后改 GALE。
// 链上的实时情况（目标链的钱够不够、最近实际收多少、有没有存了没付的单）由页面自己读链：公共节点会限流服务器，不限普通访客。
// 只读公开数据，不带任何客户信息；结果在边缘缓存 5 分钟。
const GALE = { "6714": "0xd1a5c8492ed1773ca0f1a97abad71afb122a750a", "137": "0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "56": "0xc615f91a31791f1bf4ac7f7fdc60525bf1804186" };
const SRC = { DAI: "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", USDT: "0xdfb6a28bc6dc51fed17c27c880f2c66cdd040a3e" }; // Anubis 上能付出的币
const DST = { // 能到账的币：链、地址
  PD: ["137", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"], PU: ["137", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
  BU: ["56", "0x55d398326f99059ff775485246999027b3197955"], BD: ["56", "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3"]
};
// 纯计算（方便单独测）：拿它的清单核对，返回 { ok, why, lim, fix }
export function verify(nets) {
  const out = { ok: false, why: "", lim: {}, fix: {} };
  if (!Array.isArray(nets)) { out.why = "list"; return out; }
  const net = (c) => nets.find((n) => n && String(n.chainId) === c), tok = (c, a) => ((net(c) || {}).tokens || []).find((t) => t && String(t.address).toLowerCase() === a);
  for (const c of Object.keys(GALE)) if (!net(c) || String(net(c).contractAddress).toLowerCase() !== GALE[c]) { out.why = "contract"; return out; }
  for (const s of Object.keys(SRC)) { const t = tok("6714", SRC[s]); if (!t) { out.why = "token"; return out; } out.lim[s] = [Number(t.minAmount) || 10, Number(t.maxAmount) || 50000]; }
  for (const k of Object.keys(DST)) { const t = tok(DST[k][0], DST[k][1]); if (!t) { out.why = "token"; return out; } const f = Number(t.fixedCost); out.fix[k] = f >= 0 && f < 50 ? f : 0.1; }
  out.ok = true;
  return out;
}
export async function onRequestGet(ctx) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/gale?v=2");
  try { const hit = await cache.match(ck); if (hit) return hit; } catch (e) { /* 没缓存就现查 */ }
  let body;
  try {
    const r = await fetch("https://galebridge.net/api/v1/integration/networks", { headers: { accept: "application/json" } });
    body = verify(await r.json());
  } catch (e) { body = { ok: false, why: "list", lim: {}, fix: {} }; }
  body.at = Date.now();
  const res = Response.json(body, { headers: { "cache-control": "public, max-age=" + (body.ok ? 300 : 20) } });
  try { ctx.waitUntil(cache.put(ck, res.clone())); } catch (e) { /* 存不了缓存不影响返回 */ }
  return res;
}
