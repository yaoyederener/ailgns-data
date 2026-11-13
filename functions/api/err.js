// 前端程序错误上报：POST { p 页面, m 错误, ua, v } → 存 KV err:list（最近 200 条），站长在工单后台「程序报错」栏看。不记钱包地址
// 不算程序错的噪音，新报的不存，旧的也不显示：客户网络断了或请求被掐断、无头浏览器（爬虫、检测机器人）、
// 看不到内容的外来脚本（Script error. @:0、UC 浏览器塞的脚本）、浏览器排版提示、钱包自己回的话（拒绝、弹窗没处理、连不上、不认链参数，页面上已有中文提示）、已经停掉的排查记录（oq-empty）
const NOISE = /Load failed|Failed to fetch|NetworkError|network error|aborted|^Script error\.?( @:\d+)?$|ResizeObserver loop|ucbrowser_script|user reject|already pending|Failed to connect to MetaMask|Invalid custom network|Java bridge|failed to connect to [\w.-]+\/|gas ?limit is too low|Transaction status unknown|^oq-empty trusted=true/i;
const noise = (m, ua) => NOISE.test(String(m || "")) || /HeadlessChrome/.test(String(ua || ""));
// 2026-11-13 17:00（北京时间）把之前的报错整体过了一遍：真 bug 已修、噪音已滤。这之前的旧记录不再显示；之后再犯的会重新出现
const SWEPT = 1794560400000;
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return new Response("ok");
  let b; try { b = JSON.parse(await ctx.request.text()); } catch (e) { return new Response("ok"); }
  const m = String(b.m || "").slice(0, 300); if (!m || noise(m, b.ua)) return new Response("ok");
  const ip = ctx.request.headers.get("cf-connecting-ip") || "x";
  // 每个 IP 20 秒收一条。KV 过期时间最短 60 秒（原来写 20 会报错，导致报错一条都没存上，2026-11-11 修），所以存时间戳自己比
  if (Date.now() - Number(await kv.get("err:rl:" + ip) || 0) < 20000) return new Response("ok");
  await kv.put("err:rl:" + ip, String(Date.now()), { expirationTtl: 60 });
  const list = (await kv.get("err:list", "json")) || [];
  const same = list.find((x) => x.m === m && x.p === String(b.p || "").slice(0, 60));
  if (same) { same.n = (same.n || 1) + 1; same.t = Date.now(); } else list.unshift({ t: Date.now(), p: String(b.p || "").slice(0, 60), m, ua: String(b.ua || "").slice(0, 120), v: String(b.v || "").split("?v=")[1] || "", n: 1 });
  await kv.put("err:list", JSON.stringify(list.slice(0, 200)));
  return new Response("ok");
}
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url), k = u.searchParams.get("key");
  if (!kv || !k || !((ctx.env.FEEDBACK_KEY && k === ctx.env.FEEDBACK_KEY) || (ctx.env.BACKUP_KEY && k === ctx.env.BACKUP_KEY))) return Response.json({ error: "口令不对" }, { status: 403 });
  return Response.json({ list: ((await kv.get("err:list", "json")) || []).filter((x) => x.t >= SWEPT && !noise(x.m, x.ua)) }, { headers: { "cache-control": "no-store" } });
}
