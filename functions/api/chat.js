// 网站客服窗口的接口：POST { messages, a, ctx } → { answer, human, engine }。大脑在 lib/chatbot.js（DeBox 机器人共用）
import { answer } from "../../lib/chatbot.js";
export async function onRequestPost(ctx) {
  if (!ctx.env.AI && !ctx.env.ANTHROPIC_API_KEY) return new Response("ai not bound", { status: 501 });
  let body;
  try { body = await ctx.request.json(); } catch (e) { return new Response("bad json", { status: 400 }); }
  const r = await answer(ctx.env, body.messages, { a: body.a, ctxLines: body.ctx });
  if (r.error === "no question") return new Response("no question", { status: 400 });
  if (r.error || !r.answer) return new Response("ai error", { status: 502 });
  return Response.json(body.debug ? { answer: r.answer, human: r.human, engine: r.engine, claudeErr: r.claudeErr, hasKey: !!ctx.env.ANTHROPIC_API_KEY } : { answer: r.answer, human: r.human, engine: r.engine });
}
