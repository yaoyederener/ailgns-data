// LGNS 像素墙接口：GET 读整面墙；POST { tx, px } 核对链上的 LGNS 销毁转账后把格子涂上（规则见 lib/pixel.js）
import { loadBoard, submit, SIZE, UNIT, MAX_PX, BURN, SINK, PAY_TO, LGNS } from "../../lib/pixel.js";

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const b = await loadBoard(kv);
  const top = Object.entries(b.top).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([addr, burned]) => ({ addr, burned }));
  return Response.json({ size: SIZE, unit: UNIT, max: MAX_PX, burn: BURN, sink: SINK, payTo: PAY_TO, token: LGNS, c: b.c, n: b.n, o: b.o, s: b.s, top },
    { headers: { "cache-control": "no-store" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let body;
  try { body = await ctx.request.json(); } catch (e) { return Response.json({ error: "数据格式不对" }, { status: 400 }); }
  try {
    return Response.json(await submit(kv, body.tx, body.px));
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 400 });
  }
}
