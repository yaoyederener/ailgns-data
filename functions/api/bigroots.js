// 给 GitHub Actions 用：哪些超大团队需要（重新）生成结构图数据
// 最近 7 天有人看过、并且还没生成或已经过期（高级会员 1 小时，其他 6 小时）的才返回
const INDEX = "https://raw.githubusercontent.com/yaoyederener/monita/trees/trees/index.json";

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let built = {};
  try { const r = await fetch(INDEX + "?t=" + Date.now()); if (r.ok) built = await r.json(); } catch (e) { /* 还没有生成过 */ }
  const due = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: "big:", cursor });
    for (const k of page.keys) {
      const root = k.name.slice(4), m = k.metadata || {}, b = built[root];
      const age = b ? Date.now() - b.at : Infinity;
      if (age > (m.pro ? 3600e3 : 6 * 3600e3)) due.push({ root, pro: !!m.pro, age: b ? Math.round(age / 60000) : null });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  due.sort((a, b) => b.pro - a.pro || (b.age === null) - (a.age === null) || b.age - a.age);
  return Response.json({ due: due.map((d) => d.root), detail: due }, { headers: { "cache-control": "no-store" } });
}
