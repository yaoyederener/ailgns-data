// 代开会员：小号（付款钱包）给大号（会员地址）开通。这里记「付款钱包 → 会员地址」，一个付款钱包只能绑定一个会员地址，绑定后不能改
// GET ?payer=0x…  → { target }      GET ?target=0x… → { payer }
// POST { payer, target }            → 第一次绑定成功；已绑定别的地址返回 409
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  const payer = (u.searchParams.get("payer") || "").toLowerCase(), target = (u.searchParams.get("target") || "").toLowerCase();
  if (!kv) return new Response("no kv", { status: 503 });
  if (isAddr(payer)) return Response.json({ target: await kv.get("gift:" + payer) });
  if (isAddr(target)) return Response.json({ payer: await kv.get("giftto:" + target) });
  return new Response("bad address", { status: 400 });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  let b;
  try { b = await ctx.request.json(); } catch (e) { return new Response("bad json", { status: 400 }); }
  const payer = String(b.payer || "").toLowerCase(), target = String(b.target || "").toLowerCase();
  if (!kv || !isAddr(payer) || !isAddr(target) || payer === target) return new Response("bad address", { status: 400 });
  const old = await kv.get("gift:" + payer);
  if (old && old !== target) return Response.json({ error: "already", target: old }, { status: 409 });
  const taken = await kv.get("giftto:" + target);
  if (taken && taken !== payer) return Response.json({ error: "target_taken", payer: taken }, { status: 409 });
  await kv.put("gift:" + payer, target);
  await kv.put("giftto:" + target, payer);
  return Response.json({ ok: true, target });
}
