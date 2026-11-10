// 网站客服窗口的接口：POST { messages, a, ctx } → { answer, human, engine }。大脑在 lib/chatbot.js（DeBox 机器人共用）
import { answer } from "../../lib/chatbot.js";
// GET ?key=FEEDBACK_KEY&log=1 → 最近 300 条问答（不含钱包地址），巡检机器人复核客服有没有答错用
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv || !keyOk(ctx.env, u.searchParams.get("key"))) return Response.json({ error: "口令不对" }, { status: 403 });
  return Response.json({ list: (await kv.get("chat:recent", "json")) || [] }, { headers: { "cache-control": "no-store" } });
}
async function remember(kv, q, a, engine, err) { // 只存问题和回答，不存钱包地址；err = Claude 没答成的原因（巡检查限流/过载用）
  try {
    const list = (await kv.get("chat:recent", "json")) || [];
    list.push({ t: Date.now(), q: String(q || "").slice(0, 300), a: String(a || "").slice(0, 600), e: engine || "", err: String(err || "").slice(0, 80) });
    await kv.put("chat:recent", JSON.stringify(list.slice(-300)));
  } catch (e) { /* 存不上就算了 */ }
}
export async function onRequestPost(ctx) {
  if (!ctx.env.ANTHROPIC_API_KEY) return new Response("ai not bound", { status: 501 });
  let body;
  try { body = await ctx.request.json(); } catch (e) { return new Response("bad json", { status: 400 }); }
  const r = await answer(ctx.env, body.messages, { a: body.a, ctxLines: body.ctx });
  if (r.error === "no question") return new Response("no question", { status: 400 });
  if (r.error || !r.answer) return new Response("ai error", { status: 502 });
  const lastQ = (Array.isArray(body.messages) ? body.messages : []).filter((m) => m && m.role === "user").slice(-1)[0];
  if (ctx.env.TEAM_KV && lastQ) ctx.waitUntil(remember(ctx.env.TEAM_KV, lastQ.content, r.answer, r.engine, r.claudeErr));
  return Response.json(body.debug ? { answer: r.answer, human: r.human, engine: r.engine, claudeErr: r.claudeErr, hasKey: !!ctx.env.ANTHROPIC_API_KEY } : { answer: r.answer, human: r.human, engine: r.engine });
}
