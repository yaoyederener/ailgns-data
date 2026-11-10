// 💧 做市返佣接口
//   GET ?a=<地址>   → { rules, me: { today, total, paid, pending, days: [...] }, board: { today: [...], week: [...] } }
//   GET            → 只给 rules + board
import { LP, rateOf, avgLiqOf, scarceSide } from "../../lib/lp.js";
import { MARKETS, book } from "./otc-watch.js";
import { bjDay } from "../../lib/stats.js";
const json = (o) => Response.json(o, { headers: { "cache-control": "no-store" } });
const addDay = (day, n) => new Date(Date.parse(day + "T12:00:00+08:00") + n * 86400e3).toISOString().slice(0, 10);
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" });
  const u = new URL(ctx.request.url), a = String(u.searchParams.get("a") || "").toLowerCase(), today = bjDay();
  const days = [today, addDay(today, -1), addDay(today, -2), addDay(today, -3), addDay(today, -4), addDay(today, -5), addDay(today, -6)];
  let [dd, ll, side] = await Promise.all([Promise.all(days.map((d) => kv.get("lp:d:" + d, "json"))), Promise.all(days.map((d) => kv.get("lp:liq:" + d, "json"))), kv.get("lp:side", "json")]);
  // 站长 2026-11-09：「现在该挂哪边」要实时——lp:side 超过 45 秒就按最新盘口现算并写回 KV（记账用的也是这份，页面和记账永远一致）
  if (!side || Date.now() - (side.at || 0) > 45e3) {
    try { const os = await book(MARKETS[0], Math.floor(Date.now() / 1000)); side = { ...scarceSide(os), at: Date.now() }; ctx.waitUntil(kv.put("lp:side", JSON.stringify(side), { expirationTtl: 3600 })); } catch (e) { /* 盘口读不到就用旧的 */ }
  }
  // 11-10 起按档位现算：某天某人返佣 = 计入成交 cdai × 1% × 当天日均挂单资金对应的比例；旧日子用记录里的 rb
  const rbOf = (i, k, x) => { if (days[i] < LP.RULES_FROM) return x.rb || 0; const rate = rateOf(avgLiqOf(ll[i], k)); return Math.round((x.cdai || 0) * LP.FEE * rate * 1e6) / 1e6; };
  const sum = (idx) => { const m = {}; idx.forEach((i) => { const d = dd[i]; if (!d) return; Object.keys(d).forEach((k) => { const x = m[k] || (m[k] = { a: k, dai: 0, n: 0, cdai: 0, rb: 0 }); x.dai += d[k].dai; x.n += d[k].n; x.cdai += days[i] < LP.RULES_FROM ? d[k].dai : (d[k].cdai || 0); x.rb += rbOf(i, k, d[k]); }); }); return Object.values(m).sort((x, y) => y.rb - x.rb).slice(0, 20); };
  const out = { rules: LP, board: { today: sum([0]), week: sum(days.map((_, i) => i)) }, today, side: side || { side: "both", bd: 0, ad: 0 } };
  if (/^0x[0-9a-f]{40}$/.test(a)) {
    const tot = (await kv.get("lp:tot:" + a, "json")) || { dai: 0, n: 0, rb: 0, paid: 0 };
    const paidList = (await kv.get("lp:pay:" + a, "json")) || []; // keeper 每次打款追加 { day, amt, tx }
    const dayRows = days.map((d, i) => { const x = dd[i] && dd[i][a]; return x ? { d, x: { ...x, cdai: d < LP.RULES_FROM ? x.dai : (x.cdai || 0), rb: rbOf(i, a, x), liq: Math.round(avgLiqOf(ll[i], a)), rate: d >= LP.RULES_FROM ? rateOf(avgLiqOf(ll[i], a)) : LP.SHARE } } : null; }).filter(Boolean);
    const liqToday = avgLiqOf(ll[0], a), todayRow = dayRows.find((r) => r.d === today);
    const rb7 = dayRows.reduce((s, r) => s + r.x.rb, 0); // 新规则下 lp:tot.rb 不再累加，累计 = 近 7 天现算 + 旧记录
    out.me = { today: todayRow ? todayRow.x : { dai: 0, n: 0, cdai: 0, rb: 0, liq: Math.round(liqToday), rate: rateOf(liqToday) }, total: { ...tot, rb: Math.max(tot.rb || 0, rb7) }, paid: paidList, pending: Math.max(0, Math.max(tot.rb || 0, rb7) - (tot.paid || 0)), days: dayRows,
      liq: { avg: Math.round(liqToday), rate: rateOf(liqToday), next: LP.TIERS.slice().reverse().find((t) => t[0] > liqToday) || null } };
  }
  return json(out);
}
