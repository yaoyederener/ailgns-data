// 💱 AiLGNS 现价（交易对储备量）：预言家页每几秒要一次。以前每个访客自己打公共 RPC，人多就把节点打挂；
// 现在服务器读一次、边缘缓存 5 秒，几千人同时在线也只有每个边缘每 5 秒一次读链（扩容第一档，2026-11-08）
import { RPCS } from "../../lib/teamlib.js";
const PAIR = "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0";
export async function onRequestGet(ctx) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/px");
  const hit = await cache.match(ck); if (hit) return hit;
  let r = null, err = "";
  for (let k = 0; k < RPCS.length * 2 && !r; k++) {
    try {
      const x = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: PAIR, data: "0x0902f1ac" }, "latest"] }) });
      const j = await x.json(); if (j.result && j.result.length > 130) r = j.result; else err = (j.error && j.error.message) || "rpc";
    } catch (e) { err = String(e.message || e); }
  }
  if (!r) return Response.json({ error: err || "读链失败" }, { status: 502, headers: { "cache-control": "no-store" } });
  const w = r.slice(2), ail = BigInt("0x" + w.slice(0, 64)), dai = BigInt("0x" + w.slice(64, 128));
  const res = Response.json({ r, px: Number((dai * 1000000n) / ail) / 1e6, at: Date.now() }, { headers: { "cache-control": "public, max-age=5" } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
