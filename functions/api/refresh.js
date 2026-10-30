// 定时任务每 5 分钟调用一次：把超过 30 分钟没更新的结构图在后台重新算好，访客打开时永远是现成的
import { rebuild } from "./tree.js";

const STALE = 30 * 60 * 1000;
const PER_RUN = 3;

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const stale = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: "tree:", cursor });
    for (const k of page.keys) if (Date.now() - ((k.metadata && k.metadata.at) || 0) > STALE) stale.push(k.name.slice(5));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const done = [];
  for (const root of stale.slice(0, PER_RUN)) {
    try { await rebuild(ctx.env, root); done.push(root); } catch (e) { /* 下次再试 */ }
  }
  return new Response(JSON.stringify({ stale: stale.length, refreshed: done }), { headers: { "content-type": "application/json" } });
}
