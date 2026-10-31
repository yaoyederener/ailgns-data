// 代开会员：小号（付款钱包）给大号（会员地址）开通。这里记「付款钱包 → 会员地址」，一个付款钱包只能绑定一个会员地址，绑定后不能改
// GET ?payer=0x…  → { target }      GET ?target=0x… → { payer }
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  const payer = (u.searchParams.get("payer") || "").toLowerCase(), target = (u.searchParams.get("target") || "").toLowerCase();
  if (!kv) return new Response("no kv", { status: 503 });
  if (isAddr(payer)) return Response.json({ target: await kv.get("gift:" + payer) });
  if (isAddr(target)) return Response.json({ payer: await kv.get("giftto:" + target) });
  return new Response("bad address", { status: 400 });
}
// 以前的「小号签名代开」已停用（现在会员按地址下单开通），这里只保留查询，让老的代开记录继续有效
