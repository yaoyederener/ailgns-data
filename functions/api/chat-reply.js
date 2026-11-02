// 网站客服窗口拉取人工回复：GET ?sid=<访客编号>&after=<时间戳> → { replies: [{ t, text }] }（只返回 after 之后的）
// 回复由站长在 DeBox 里直接回机器人写入（见 debox-hook.js），存在 cl:r:<访客编号>
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return Response.json({ replies: [] });
  const u = new URL(ctx.request.url), sid = (u.searchParams.get("sid") || "").replace(/[^a-z0-9]/gi, "").slice(0, 24), after = parseInt(u.searchParams.get("after") || "0", 10) || 0;
  if (!sid) return Response.json({ replies: [] });
  const list = (await kv.get("cl:r:" + sid, "json")) || [];
  return Response.json({ replies: list.filter((r) => r.t > after) }, { headers: { "cache-control": "no-store" } });
}
