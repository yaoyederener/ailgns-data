// 全站累计成交（给客户看信心用）：日报扫描攒下来的 st:tot（OTC 四个市场 + 卡牌，从各合约部署区块起算）
// GET → { fillDai, fills, orderDai, orders, at }，边缘缓存 60 秒
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const t = (await kv.get("st:tot", "json")) || { orders: 0, orderDai: 0, fills: 0, fillDai: 0 };
  return Response.json({ fillDai: Math.round(t.fillDai * 100) / 100, fills: t.fills, orderDai: Math.round(t.orderDai * 100) / 100, orders: t.orders, at: Date.now() },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
}
