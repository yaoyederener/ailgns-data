// 💵 USDT → DAI（Polygon 链）的报价和换币数据，给 #/usdt「USDT 换成 Anubis 的 DAI」页用（2026-11-19，试运行）
// 为什么要过一道本站：客户（尤其大陆）直连聚合器接口不稳；而且这里把交易对钉死，只能问「Polygon USDT 换 Polygon DAI」这一种，别的一概不代理。
// 换币走 KyberSwap 聚合器（第三方，自动在各家 DEX 里找最划算的路线）；本站不经手客户的币、不加任何手续费，返回的数据由客户自己钱包签名发出。
//   GET  ?amt=USDT 数量（6 位小数的整数，如 1000 USDT = 1000000000）   → { ok, out, gasUsd, sum }
//   POST { sum, sender, slip }  sum = 上面返回的报价单；slip = 价格保护，万分之几（10–100，默认 50 = 0.5%） → { ok, to, data, out, min }
// 三道保险：① 路由合约地址必须是登记的那一个；② 交易数据里必须带着客户自己的地址和 DAI 地址（钱只能回到客户自己）；③ 不许带原生币金额
const USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // Polygon USDT（6 位）
const DAI = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"; // Polygon DAI（18 位）
const ROUTER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5"; // KyberSwap MetaAggregationRouterV2（lib/addresses.js 有登记）
const API = "https://aggregator-api.kyberswap.com/polygon/api/v1";
const H = { "x-client-id": "ailgns", "user-agent": "Mozilla/5.0 (compatible; ailgns-site)", accept: "application/json" };
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const low = (s) => String(s || "").toLowerCase();
const MIN = 1000000n, MAX = 1000000000000n; // 1 USDT ～ 100 万 USDT

async function call(url, init) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal }, init));
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.code !== 0 || !j.data) throw new Error((j && j.message) || "HTTP " + r.status);
    return j.data;
  } finally { clearTimeout(t); }
}
function sumOk(s) {
  return s && low(s.tokenIn) === USDT && low(s.tokenOut) === DAI && /^\d{1,15}$/.test(String(s.amountIn || "")) && /^\d{1,30}$/.test(String(s.amountOut || "")) && BigInt(s.amountIn) >= MIN && BigInt(s.amountIn) <= MAX;
}

export async function onRequestGet(ctx) {
  const amt = new URL(ctx.request.url).searchParams.get("amt") || "";
  if (!/^\d{1,15}$/.test(amt) || BigInt(amt) < MIN || BigInt(amt) > MAX) return json({ error: "数量不对：最少 1 USDT，最多 100 万 USDT" }, 400);
  try {
    const d = await call(API + "/routes?tokenIn=" + USDT + "&tokenOut=" + DAI + "&amountIn=" + amt, { headers: H });
    const s = d.routeSummary;
    if (low(d.routerAddress) !== ROUTER || !sumOk(s) || String(s.amountIn) !== amt) return json({ error: "报价数据不对劲，先别换，稍后再试" }, 502);
    return json({ ok: true, out: String(s.amountOut), gasUsd: Number(s.gasUsd) || 0, sum: s });
  } catch (e) { return json({ error: "现在拿不到报价（" + String((e && e.message) || e).slice(0, 60) + "），稍后再试" }, 502); }
}

export async function onRequestPost(ctx) {
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const sender = low(b && b.sender), s = b && b.sum;
  if (!/^0x[0-9a-f]{40}$/.test(sender)) return json({ error: "钱包地址不对" }, 400);
  if (!sumOk(s)) return json({ error: "报价单不对，请重新报价" }, 400);
  const slip = Math.min(100, Math.max(10, Math.round(Number(b.slip) || 50)));
  try {
    const d = await call(API + "/route/build", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, H), body: JSON.stringify({ routeSummary: s, sender, recipient: sender, slippageTolerance: slip, source: "ailgns" }) });
    const data = low(d.data);
    if (low(d.routerAddress) !== ROUTER || String(d.transactionValue || "0") !== "0" || !/^0x[0-9a-f]{200,60000}$/.test(data) || data.indexOf(sender.slice(2)) < 0 || data.indexOf(DAI.slice(2)) < 0 || !/^\d{1,30}$/.test(String(d.amountOut || "")))
      return json({ error: "换币数据没通过安全检查，已拦下，你的币没有动。稍后再试" }, 502);
    const out = BigInt(d.amountOut);
    return json({ ok: true, to: ROUTER, data, out: String(out), min: String(out * BigInt(10000 - slip) / 10000n), slip });
  } catch (e) { return json({ error: "报价过期或拿不到换币数据（" + String((e && e.message) || e).slice(0, 60) + "），请重新报价再试" }, 502); }
}
