// 📝 站长待办接口（内部，口令和工单后台同一个）
//   GET  ?key=…                      → { updated, items: [...], done: { id: 勾选时间 } }
//   POST { key, id, done: true|false } → 记 / 取消「做完了」（KV todo:done）
import { TODO } from "../../lib/todo.js";
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));

export async function onRequestGet(ctx) {
  const env = ctx.env, kv = env.TEAM_KV, key = new URL(ctx.request.url).searchParams.get("key");
  if (!keyOk(env, key)) return json({ error: "口令不对" }, 403);
  const done = (kv && (await kv.get("todo:done", "json"))) || {};
  return json({ updated: TODO.updated, items: TODO.items, done });
}
export async function onRequestPost(ctx) {
  const env = ctx.env, kv = env.TEAM_KV;
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (!keyOk(env, b.key)) return json({ error: "口令不对" }, 403);
  if (!kv) return json({ error: "no kv" }, 503);
  const id = String(b.id || "");
  if (!TODO.items.some((x) => x.id === id)) return json({ error: "没有这一条" }, 404);
  const done = (await kv.get("todo:done", "json")) || {};
  if (b.done) done[id] = Date.now(); else delete done[id];
  await kv.put("todo:done", JSON.stringify(done));
  return json({ ok: true, done });
}
