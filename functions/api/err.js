// 前端程序错误上报：POST { p 页面, m 错误, ua, v } → 存 KV err:list（最近 200 条），站长在工单后台「程序报错」栏看。不记钱包地址
// 不算程序错的噪音，新报的不存，旧的也不显示：客户网络断了或请求被掐断、无头浏览器（爬虫、检测机器人）、
// 看不到内容的外来脚本（Script error. @:0、UC 浏览器塞的脚本）、浏览器排版提示、钱包自己回的话（拒绝、弹窗没处理、连不上、不认链参数，页面上已有中文提示）、已经停掉的排查记录（oq-empty）
const NOISE = /Load failed|Failed to fetch|NetworkError|network error|aborted|^Script error\.?( @:\d+)?$|ResizeObserver loop|ucbrowser_script|user reject|already pending|Failed to connect to MetaMask|Invalid custom network|Java bridge|failed to connect to [\w.-]+\/|gas ?limit is too low|gas\\?"? is missing|No EVM wallet|already in progress|Unexpected end of script|Unexpected EOF|Unexpected end of input|Transaction status unknown|gas price below minimum|gas tip cap|in-flight transaction limit|^\s*Transaction failed\.?\s*$|No bridge available|Network request failed|LIDNotify|err-probe|replacement transaction underpriced|transaction underpriced|nonce too low|already known|is not valid JSON|JSON Parse error|^rejected$|(Write|Read) permission denied|Atomic not supported|^i\d+ probe$|^The object (does not support the operation or argument|is in an invalid state)\.?$|^oq-empty trusted=true|^Close window$|^probe-/i;
const noise = (m, ua) => NOISE.test(String(m || "")) || /HeadlessChrome/.test(String(ua || ""));
// 2026-11-15 19:15（北京时间）站长登录后台后把 22 条报错整体过了一遍：真 bug 已修（直推名单写空元素、静默连钱包、农场充值弹窗、缺 gas 重发），钱包/网络噪音已滤。这之前的旧记录不再显示；之后再犯的会重新出现
// 2026-11-19 11:17（北京时间）站长让扫一遍：6 条里 3 条真报错（OTC 撮合按钮、域名挂单下拉、钱包塞的 webkit）11-17 已修，之后两天没再报；另 3 条是噪音（接口探测 2 条、钱包扩展的 Close window），已加进噪音名单
// （上一次是 2026-11-15 19:15）
const SWEPT = 1795058267000;
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
