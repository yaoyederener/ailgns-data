// 销毁乐园排位赛：GET ?g=游戏 → 价格、累计销毁、燃烧榜、这个游戏的排行榜、收款地址；POST { act: "ticket", tx, game, chain } 核对门票；POST { act: "score", tx, score } 交分数
import { ticket, score, board } from "../../lib/game.js";

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  return Response.json(await board(kv, new URL(ctx.request.url).searchParams.get("g")), { headers: { "cache-control": "no-store" } });
}
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b;
  try { b = await ctx.request.json(); } catch (e) { return Response.json({ error: "数据格式不对" }, { status: 400 }); }
  try {
    if (b.act === "ticket") return Response.json(await ticket(kv, b.tx, b.game, b.chain || "anubis"));
    if (b.act === "score") return Response.json(await score(kv, b.tx, b.score));
    throw new Error("不认识的操作");
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 400 });
  }
}
