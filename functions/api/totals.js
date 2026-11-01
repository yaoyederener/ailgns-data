// 全站累计成交（给客户看信心用）：日报扫描攒下来的 st:tot（OTC 四个市场 + 卡牌，从各合约部署区块起算）
// GET → { fillDai, fills, orderDai, orders, lendDai, loans, at }（lendDai：借贷累计借出本金，loan-watch 每 5 分钟写入 st:lend:<市场>），边缘缓存 60 秒
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const [t0, lend] = await Promise.all([kv.get("st:tot", "json"), kv.get("st:lend:ailgns", "json")]);
  const t = t0 || { orders: 0, orderDai: 0, fills: 0, fillDai: 0 }, l = lend || { principal: 0, n: 0 };
  return Response.json({ fillDai: Math.round(t.fillDai * 100) / 100, fills: t.fills, orderDai: Math.round(t.orderDai * 100) / 100, orders: t.orders, lendDai: Math.round(l.principal * 100) / 100, loans: l.n, at: Date.now() },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
}
