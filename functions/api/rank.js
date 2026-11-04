// AiLGNS 荣耀榜（OTC 成交大户排行）：和会员卡「OTC 累计成交」同一口径，单笔满 50 DAI 才算
// GET ?board=total|month [&me=0x…] → { board, ym, end, top: [{ a, vol, n, tier }]（前 50）, me?: { rank, vol, gap, tier, tierGap, nextTier }, hof }
// GET ?ticker=1 → { badges: { 地址: 总榜名次 }, top3, mtop3, ev, ym, end }  全站徽章 + 顶部播报用
import { nmTop as nmTopOf } from "../../lib/nmtop.js";
import { poolNow, priceMilli } from "../../lib/oracle.js";
import { loadTotal, loadMonth, ranked, tierOf, TIERS, ymOf, nextMonthStart, hallOfFame, rankEvents } from "../../lib/honor.js";

const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const json = (o, cache) => Response.json(o, { headers: { "cache-control": cache ? "public, max-age=60, s-maxage=60" : "no-store" } });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const u = new URL(ctx.request.url), ym = ymOf(Date.now()), end = nextMonthStart(ym);
  const [total, month] = await Promise.all([loadTotal(kv), loadMonth(kv, ym)]);
  const allT = ranked(total), allM = ranked(month);
  const ev = await rankEvents(kv, ym, allM);
  const row = ([a, v], i) => ({ a, vol: Math.round(v[0]), n: v[1], tier: tierOf(i + 1) });

  if (u.searchParams.get("ticker")) {
    const badges = {};
    allT.slice(0, 50).forEach(([a], i) => { badges[a] = i + 1; });
    // 顶部播报和预言家页面一样：显示奖池里实际留出的钱（DAI + AiLGNS 按现价）
    const held = async () => {
      const st = await fetch("https://raw.githubusercontent.com/yaoyederener/monita/main/data/oracle_prize.json", { cf: { cacheTtl: 60 } }).then((r) => r.json()), px = await priceMilli();
      const big = (x) => Number(BigInt(x || "0") / 10n ** 12n) / 1e6;
      return Math.floor((big(st.held) + big(st.held_ail) * px.raw) * 100) / 100;
    };
    const [orPoolV, orLast] = await Promise.all([held().catch(() => poolNow(kv)), kv.get("or:last", "json")]), orPool = { pool: orPoolV };
    const or = { pool: (orPool && orPool.pool) || 0, last: orLast ? { day: orLast.day, px: orLast.px, c: orLast.closest && { name: orLast.closest.name, amt: orLast.closest.amt, diff: orLast.closest.diff }, j: orLast.jackpot.winners.map((w) => w.name), each: orLast.jackpot.each, at: orLast.at } : null };
    let nmTop = null;
    try { nmTop = await nmTopOf(kv); } catch (e) { nmTop = null; }
    return json({ badges, top3: allT.slice(0, 3).map(row), mtop3: allM.slice(0, 3).map(row), ev, ym, end, or, nmTop }, true);
  }

  const board = u.searchParams.get("board") === "month" ? "month" : "total", all = board === "month" ? allM : allT;
  const out = { board, ym, end, top: all.slice(0, 50).map(row), hof: await hallOfFame(kv, ym), ev, mil: allT.filter(([, v]) => v[0] >= 1e6).map(([a, v]) => ({ a, vol: Math.round(v[0]) })) };
  const me = (u.searchParams.get("me") || "").toLowerCase();
  if (isAddr(me)) {
    const i = all.findIndex(([a]) => a === me), vol = i < 0 ? 0 : all[i][1][0], rank = i + 1;
    // 离上一名还差多少；离下一个段位（该段位最后一名）还差多少
    const gap = i > 0 ? Math.ceil(all[i - 1][1][0] - vol) + 1 : i === 0 ? 0 : Math.ceil(all.length >= 50 ? all[49][1][0] - vol + 1 : 50);
    const t = tierOf(rank), nt = t === 0 ? -1 : t < 0 ? TIERS.length - 1 : t - 1;
    let tierGap = 0;
    if (nt >= 0) { const last = all[TIERS[nt][0] - 1]; tierGap = last ? Math.max(1, Math.ceil(last[1][0] - vol) + 1) : (vol >= 50 ? 0 : 50); }
    out.me = { rank: i < 0 ? 0 : rank, vol: Math.round(vol), gap, tier: t, nextTier: nt, tierGap };
  }
  return json(out, !isAddr(me));
}
