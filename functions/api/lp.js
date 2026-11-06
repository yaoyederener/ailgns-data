// 💧 做市返佣接口
//   GET ?a=<地址>   → { rules, me: { today, total, paid, pending, days: [...] }, board: { today: [...], week: [...] } }
//   GET            → 只给 rules + board
import { LP } from "../../lib/lp.js";
import { bjDay } from "../../lib/stats.js";
const json = (o) => Response.json(o, { headers: { "cache-control": "no-store" } });
const addDay = (day, n) => new Date(Date.parse(day + "T12:00:00+08:00") + n * 86400e3).toISOString().slice(0, 10);
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" });
  const u = new URL(ctx.request.url), a = String(u.searchParams.get("a") || "").toLowerCase(), today = bjDay();
  const days = [today, addDay(today, -1), addDay(today, -2), addDay(today, -3), addDay(today, -4), addDay(today, -5), addDay(today, -6)];
  const dd = await Promise.all(days.map((d) => kv.get("lp:d:" + d, "json")));
  const sum = (list) => { const m = {}; list.forEach((d) => { if (!d) return; Object.keys(d).forEach((k) => { const x = m[k] || (m[k] = { a: k, dai: 0, n: 0, rb: 0 }); x.dai += d[k].dai; x.n += d[k].n; x.rb += d[k].rb; }); }); return Object.values(m).sort((x, y) => y.rb - x.rb).slice(0, 20); };
  const out = { rules: LP, board: { today: sum([dd[0]]), week: sum(dd) }, today };
  if (/^0x[0-9a-f]{40}$/.test(a)) {
    const tot = (await kv.get("lp:tot:" + a, "json")) || { dai: 0, n: 0, rb: 0, paid: 0 };
    const paidList = (await kv.get("lp:pay:" + a, "json")) || []; // keeper 每次打款追加 { day, amt, tx }
    out.me = { today: (dd[0] && dd[0][a]) || { dai: 0, n: 0, rb: 0 }, total: tot, paid: paidList, pending: Math.max(0, tot.rb - (tot.paid || 0)), days: days.map((d, i) => ({ d, x: (dd[i] && dd[i][a]) || null })).filter((x) => x.x) };
  }
  return json(out);
}
