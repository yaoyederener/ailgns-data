// AiLGNS 荣耀榜（OTC 成交大户排行）：和会员卡「OTC 累计成交」同一口径，单笔满 50 DAI 才算
// GET ?board=total|month [&me=0x…] → { board, ym, end, top: [{ a, vol, n, tier }]（前 50）, me?: { rank, vol, gap, tier, tierGap, nextTier }, hof }
// GET ?ticker=1 → { badges: { 地址: 总榜名次 }, top3, mtop3, ev, ym, end }  全站徽章 + 顶部播报用
import { nmTop as nmTopOf } from "../../lib/nmtop.js";
import { heldNow, ownFlagsOf } from "../../lib/oracle.js";
import { loadTotal, loadMonth, ranked, tierOf, TIERS, ymOf, nextMonthStart, hallOfFame, rankEvents, nameMap, namedOk } from "../../lib/honor.js";

const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const json = (o, cache) => Response.json(o, { headers: { "cache-control": cache ? "public, max-age=60, s-maxage=60" : "no-store" } });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const u = new URL(ctx.request.url), ym = ymOf(Date.now()), end = nextMonthStart(ym);
  const [total, month] = await Promise.all([loadTotal(kv), loadMonth(kv, ym)]);
  // 上榜必须有本站域名（站长 2026-11-20）：先按成交排好，再把钱包里没有域名的拿掉
  const rawT = ranked(total), rawM = ranked(month), me = (u.searchParams.get("me") || "").toLowerCase();
  const nm = await nameMap(kv, Array.from(new Set(rawT.concat(rawM).map(([a]) => a))), ownFlagsOf(kv), isAddr(me) ? [me] : []), ok = namedOk(nm);
  const allT = rawT.filter(([a]) => ok(a)), allM = rawM.filter(([a]) => ok(a));
  const ev = await rankEvents(kv, ym, allM, ok);
  const row = ([a, v], i) => ({ a, vol: Math.round(v[0]), n: v[1], tier: tierOf(i + 1) });

  if (u.searchParams.get("ticker")) {
    const badges = {};
    allT.slice(0, 50).forEach(([a], i) => { badges[a] = i + 1; });
    // 顶部播报和预言家页面一样：显示奖池里实际留出的钱（DAI + AiLGNS 按现价）
    const [orPoolV, orLast] = await Promise.all([heldNow().catch(() => 0), kv.get("or:last", "json")]), orPool = { pool: orPoolV };
    const or = { pool: (orPool && orPool.pool) || 0, last: orLast ? { day: orLast.day, px: orLast.px, sc: orLast.sc || 1000, c: orLast.closest && { name: orLast.closest.name, amt: orLast.closest.amt, diff: orLast.closest.diff }, j: orLast.jackpot.winners.map((w) => w.name), each: orLast.jackpot.each, at: orLast.at } : null };
    let nmTop = null;
    try { nmTop = await nmTopOf(kv); } catch (e) { nmTop = null; }
    return json({ badges, top3: allT.slice(0, 3).map(row), mtop3: allM.slice(0, 3).map(row), ev, ym, end, or, nmTop }, true);
  }

  const board = u.searchParams.get("board") === "month" ? "month" : "total", all = board === "month" ? allM : allT;
  const out = { board, ym, end, top: all.slice(0, 50).map(row), hof: await hallOfFame(kv, ym, async (list) => { const m2 = await nameMap(kv, list.slice(0, 60).map(([a]) => a), ownFlagsOf(kv)), k2 = namedOk(m2); return list.filter(([a]) => k2(a)); }), ev, mil: allT.filter(([, v]) => v[0] >= 1e6).map(([a, v]) => ({ a, vol: Math.round(v[0]) })) };
  if (isAddr(me)) {
    const raw = (board === "month" ? rawM : rawT).find(([a]) => a === me), noName = !!raw && !ok(me); /* 有成交但钱包里没有域名：不上榜，页面提示去注册 */
    const i = all.findIndex(([a]) => a === me), vol = i < 0 ? (raw ? raw[1][0] : 0) : all[i][1][0], rank = i + 1;
    // 离上一名还差多少；离下一个段位（该段位最后一名）还差多少
    const gap = i > 0 ? Math.ceil(all[i - 1][1][0] - vol) + 1 : i === 0 ? 0 : Math.ceil(all.length >= 50 ? all[49][1][0] - vol + 1 : 50);
    const t = tierOf(rank), nt = t === 0 ? -1 : t < 0 ? TIERS.length - 1 : t - 1;
    let tierGap = 0;
    if (nt >= 0) { const last = all[TIERS[nt][0] - 1]; tierGap = last ? Math.max(1, Math.ceil(last[1][0] - vol) + 1) : (vol >= 50 ? 0 : 50); }
    out.me = { rank: i < 0 ? 0 : rank, vol: Math.round(vol), gap, tier: t, nextTier: nt, tierGap };
    if (noName) out.me.noName = 1;
  }
  return json(out, !isAddr(me));
}
