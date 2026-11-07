// 🏅 信誉标志：按这个钱包在本站 OTC 的累计成交（挂单被吃 + 自己吃单都算）算等级。GET ?a=0x..,0x..（最多 40 个）→ { "0x..": { vol, n, lv } }
// 等级定义在 lib/cred.js（7 级商家体系，2026-11-08）；返回里 king=1 表示上周贡献王（7 天有效）
import { CRED, credLevel } from "../../lib/cred.js";
export { CRED, credLevel };
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return Response.json({});
  const as = [...new Set(String(new URL(ctx.request.url).searchParams.get("a") || "").toLowerCase().split(",").filter((x) => /^0x[0-9a-f]{40}$/.test(x)))].slice(0, 40);
  const recs = await Promise.all(as.map((a) => kv.get("otct:" + a, "json")));
  const out = {};
  const kb = (await kv.get("or:kingbadge", "json")) || { until: "", a: [] }, today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), kings = kb.until >= today ? new Set(kb.a || []) : new Set(); // 🏆 上周贡献王：周日结算后挂 7 天
  as.forEach((a, i) => { const r = recs[i] || {}; const vol = Number(r.vol || 0), n = Number(r.n || 0); out[a] = { vol: Math.round(vol), n, lv: credLevel(vol, n), king: kings.has(a) ? 1 : 0 }; });
  return Response.json(out, { headers: { "cache-control": "public, max-age=60" } });
}
