// 全站累计成交（给客户看信心用）：日报扫描攒下来的 st:tot（OTC 四个市场 + 卡牌，从各合约部署区块起算）
// GET → { today: { fills, fillDai }, at }；?all=1 再加 { fillDai, fills, orderDai, orders, lendDai, loans }（lendDai：借贷累计借出本金，loan-watch 每 5 分钟写入 st:lend:<市场>），边缘缓存 60 秒
import { bjDay } from "../../lib/stats.js";

// 公开只给「今日成交」（不想让人眼红，站长要求）；累计数字只在 ?all=1 时给（页面上只有站长钱包连上才去取）
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const all = new URL(ctx.request.url).searchParams.get("all") === "1";
  const d = (await kv.get("st:d:" + bjDay(Date.now()), "json")) || { fills: 0, fillDai: 0 };
  const out = { today: { fills: d.fills || 0, fillDai: Math.round((d.fillDai || 0) * 100) / 100 }, at: Date.now() };
  if (all) {
    const [t0, ...lends] = await Promise.all([kv.get("st:tot", "json"), ...["ailgns", "lgns", "glgns"].map((k) => kv.get("st:lend:" + k, "json"))]);
    const t = t0 || { orders: 0, orderDai: 0, fills: 0, fillDai: 0 };
    const l = lends.reduce((a, x) => ({ principal: a.principal + ((x && x.principal) || 0), n: a.n + ((x && x.n) || 0) }), { principal: 0, n: 0 }); // 三个借贷市场加起来
    Object.assign(out, { fillDai: Math.round(t.fillDai * 100) / 100, fills: t.fills, orderDai: Math.round(t.orderDai * 100) / 100, orders: t.orders, lendDai: Math.round(l.principal * 100) / 100, loans: l.n });
  }
  return Response.json(out, { headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
}
