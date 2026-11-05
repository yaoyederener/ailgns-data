// 盘口页「最近成交」：GET ?m=ailgns → { list: [{ t, px, dai, tx, id }] }（otc-watch 记进 KV otc:fills:<市场>，最近 300 笔，新的在前）
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url), m = (u.searchParams.get("m") || "ailgns").replace(/[^a-z]/g, "");
  if (!kv) return new Response("no kv", { status: 503 });
  const list = ((await kv.get("otc:fills:" + m, "json")) || []).slice(0, 60);
  return Response.json({ list }, { headers: { "cache-control": "public, max-age=10" } });
}
