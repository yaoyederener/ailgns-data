// LGNS 像素墙接口：GET 读整面墙；POST { tx, px, chain } 核对链上的 LGNS 付款转账后把格子涂上（规则见 lib/pixel.js）
import { loadBoard, submit, SIZE, UNIT, MAX_PX, BURN, SINK, PAY_TO, LGNS, CHAINS } from "../../lib/pixel.js";

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const b = await loadBoard(kv);
  const top = Object.entries(b.top).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([addr, burned]) => ({ addr, burned }));
  return Response.json({ size: SIZE, unit: UNIT, max: MAX_PX, burn: BURN, sink: SINK, payTo: PAY_TO, token: LGNS,
    chains: Object.fromEntries(Object.entries(CHAINS).map(([k, c]) => [k, { token: c.lgns, sink: c.sink, payTo: c.payTo }])), c: b.c, n: b.n, o: b.o, s: b.s, top },
    { headers: { "cache-control": "no-store" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let body;
  try { body = await ctx.request.json(); } catch (e) { return Response.json({ error: "数据格式不对" }, { status: 400 }); }
  try {
    return Response.json(await submit(kv, body.tx, body.px, body.chain || "anubis"));
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 400 });
  }
}
