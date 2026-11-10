// 🏅 商家认证：按上周在本站 OTC 的成交名次分配、每周一轮换（规则在 lib/cred.js）。GET ?a=0x..,0x..（最多 40 个）→ { "0x..": { vol 累计, n, lv, wk: {r 上周名次, vol 上周成交, n}, king } }
// king=1 表示上周贡献王（7 天有效）；week 是本周一日期，players 是上周有成交的人数
import { ensureWeek, OFFICIAL_MM } from "../../lib/cred.js";
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return Response.json({});
  const as = [...new Set(String(new URL(ctx.request.url).searchParams.get("a") || "").toLowerCase().split(",").filter((x) => /^0x[0-9a-f]{40}$/.test(x)))].slice(0, 40);
  const [w, recs] = await Promise.all([ensureWeek(kv), Promise.all(as.map((a) => kv.get("otct:" + a, "json")))]);
  const out = { week: w.week, players: w.n };
  const kb = (await kv.get("or:kingbadge", "json")) || { until: "", a: [] }, today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), kings = kb.until >= today ? new Set(kb.a || []) : new Set(); // 🏆 上周贡献王徽章
  as.forEach((a, i) => { const r = recs[i] || {}; out[a] = { vol: Math.round(Number(r.vol || 0)), n: Number(r.n || 0), lv: w.lv[a] || 0, wk: w.rank[a] || null, king: kings.has(a) ? 1 : 0, mm: OFFICIAL_MM[a] ? 1 : 0 }; });
  return Response.json(out, { headers: { "cache-control": "public, max-age=60" } });
}
