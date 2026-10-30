// 定时任务每 5 分钟调用一次：把过期的结构图在后台重新算好（普通 30 分钟、高级会员 5 分钟），访客打开时永远是现成的
import { rebuild, REFRESH_AFTER, PRO_REFRESH_AFTER } from "./tree.js";

const PER_RUN = 3;

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const stale = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: "tree:", cursor });
    for (const k of page.keys) {
      const pro = !!(k.metadata && k.metadata.pro), age = Date.now() - ((k.metadata && k.metadata.at) || 0);
      if (age > (pro ? PRO_REFRESH_AFTER : REFRESH_AFTER)) stale.push({ root: k.name.slice(5), pro, age });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const done = [];
  // 高级会员排前面；高级会员的团队名单也 10 分钟重读一次
  stale.sort((a, b) => b.pro - a.pro || b.age - a.age);
  for (const s of stale.slice(0, PER_RUN)) {
    try { await rebuild(ctx.env, s.root, { pro: s.pro, teamMaxAge: s.pro ? 10 * 60 * 1000 : 3600 * 1000 }); done.push(s.root); } catch (e) { /* 下次再试 */ }
  }
  return new Response(JSON.stringify({ stale: stale.length, refreshed: done }), { headers: { "content-type": "application/json" } });
}
