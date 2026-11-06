// 前端程序错误上报：POST { p 页面, m 错误, ua, v } → 存 KV err:list（最近 200 条），站长在工单后台「程序报错」栏看。不记钱包地址
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return new Response("ok");
  let b; try { b = JSON.parse(await ctx.request.text()); } catch (e) { return new Response("ok"); }
  const m = String(b.m || "").slice(0, 300); if (!m) return new Response("ok");
  const ip = ctx.request.headers.get("cf-connecting-ip") || "x";
  if (await kv.get("err:rl:" + ip)) return new Response("ok");
  await kv.put("err:rl:" + ip, "1", { expirationTtl: 20 });
  const list = (await kv.get("err:list", "json")) || [];
  const same = list.find((x) => x.m === m && x.p === String(b.p || "").slice(0, 60));
  if (same) { same.n = (same.n || 1) + 1; same.t = Date.now(); } else list.unshift({ t: Date.now(), p: String(b.p || "").slice(0, 60), m, ua: String(b.ua || "").slice(0, 120), v: String(b.v || "").split("?v=")[1] || "", n: 1 });
  await kv.put("err:list", JSON.stringify(list.slice(0, 200)));
  return new Response("ok");
}
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url), k = u.searchParams.get("key");
  if (!kv || !k || !((ctx.env.FEEDBACK_KEY && k === ctx.env.FEEDBACK_KEY) || (ctx.env.BACKUP_KEY && k === ctx.env.BACKUP_KEY))) return Response.json({ error: "口令不对" }, { status: 403 });
  return Response.json({ list: (await kv.get("err:list", "json")) || [] }, { headers: { "cache-control": "no-store" } });
}
