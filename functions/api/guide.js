// 指导价：GET → { <市场>: { sell: 比例, buy: 比例, n: { sell, buy } } }，比例 = 最近 30 笔真实成交价 ÷ 当时 DEX 市价的中位数（页面再乘当前市价）
import { SEED, median } from "../../lib/guide.js";

const KEYS = ["ailgns", "lgns", "plgns", "glgns"];
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, out = {};
  for (const k of KEYS) {
    const g = (kv && (await kv.get("gp:" + k, "json"))) || SEED[k];
    if (!g) continue;
    out[k] = { n: { sell: (g.sell || []).length, buy: (g.buy || []).length } };
    for (const s of ["sell", "buy"]) if ((g[s] || []).length >= 5) out[k][s] = median(g[s]); // 不到 5 笔不算，页面退回按 DEX 推算
  }
  return Response.json(out, { headers: { "cache-control": "public, max-age=60" } });
}
