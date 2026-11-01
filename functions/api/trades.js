// 成交查询：GET ?addr=0x… → { trades: [...] }（这个地址作为挂单人或吃单人的成交，最近 300 条，由 otc-watch 记进 tr:<地址>）
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const addr = (new URL(ctx.request.url).searchParams.get("addr") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return Response.json({ error: "地址格式不对" }, { status: 400 });
  const trades = (await kv.get("tr:" + addr, "json")) || [];
  return Response.json({ addr, trades }, { headers: { "cache-control": "no-store" } });
}
