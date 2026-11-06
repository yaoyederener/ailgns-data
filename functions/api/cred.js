// 🏅 信誉标志：按这个钱包在本站 OTC 的累计成交（挂单被吃 + 自己吃单都算）算等级。GET ?a=0x..,0x..（最多 40 个）→ { "0x..": { vol, n, lv } }
// 等级（站长 2026-11-07 定）：0 新手 <1,000 DAI · 1 常客 ≥1,000 DAI 或 ≥5 笔 · 2 信誉商家 ≥10,000 DAI 且 ≥20 笔 · 3 金牌商家 ≥100,000 DAI 且 ≥50 笔 · 4 至尊商家 ≥1,000,000 DAI
export const CRED = [["新手", 0, 0], ["常客", 1000, 5], ["信誉商家", 10000, 20], ["金牌商家", 100000, 50], ["至尊商家", 1000000, 100]];
export function credLevel(vol, n) { let lv = 0; for (let i = 1; i < CRED.length; i++) { const [, v, c] = CRED[i]; if (i === 1 ? (vol >= v || n >= c) : (vol >= v && n >= c)) lv = i; } return lv; }
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return Response.json({});
  const as = [...new Set(String(new URL(ctx.request.url).searchParams.get("a") || "").toLowerCase().split(",").filter((x) => /^0x[0-9a-f]{40}$/.test(x)))].slice(0, 40);
  const recs = await Promise.all(as.map((a) => kv.get("otct:" + a, "json")));
  const out = {};
  as.forEach((a, i) => { const r = recs[i] || {}; const vol = Number(r.vol || 0), n = Number(r.n || 0); out[a] = { vol: Math.round(vol), n, lv: credLevel(vol, n) }; });
  return Response.json(out, { headers: { "cache-control": "public, max-age=60" } });
}
