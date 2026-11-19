// 💵 USDT → DAI（Polygon 链）的报价和换币数据，给 #/usdt「USDT 换成 Anubis 的 DAI」页用（2026-11-19，试运行）
// 为什么要过一道本站：客户（尤其大陆）直连聚合器接口不稳；而且这里把交易对钉死，只能问「Polygon USDT 换 Polygon DAI」这一种，别的一概不代理。
// 换币走第三方聚合器（自动在各家 DEX 里找最划算的路线）：先问 KyberSwap，它拒绝或超时就换 ParaSwap（预览站实测 KyberSwap 对我们服务器的请求一半被拒，所以必须有备用）。
// 本站不经手客户的币、不加任何手续费，返回的数据由客户自己钱包签名发出。
//   GET  ?amt=USDT 数量（6 位小数的整数，如 1000 USDT = 1000000000）   → { ok, out, gasUsd, via, sum }
//   POST { sum, via, sender, slip }  sum = 上面返回的报价单；slip = 价格保护，万分之几（10–100，默认 50 = 0.5%） → { ok, to, data, out, min, via }
// 三道保险：① 路由合约地址必须是登记的那两个之一；② 交易数据里必须带着客户自己的地址和 DAI 地址（钱只能回到客户自己）；③ 不许带原生币金额
const USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // Polygon USDT（6 位）
const DAI = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"; // Polygon DAI（18 位）
const KYBER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5"; // KyberSwap MetaAggregationRouterV2
const PARA = "0x6a000f20005980200259b80c5102003040001068"; // ParaSwap Augustus v6.2（lib/addresses.js 都有登记）
const KAPI = "https://aggregator-api.kyberswap.com/polygon/api/v1", PAPI = "https://api.paraswap.io";
const H = { "x-client-id": "ailgns", "user-agent": "Mozilla/5.0 (compatible; ailgns-site)", accept: "application/json" };
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const low = (s) => String(s || "").toLowerCase();
const MIN = 1000000n, MAX = 1000000000000n; // 1 USDT ～ 100 万 USDT
const amtOk = (a) => /^\d{1,15}$/.test(String(a || "")) && BigInt(a) >= MIN && BigInt(a) <= MAX;
const numOk = (a) => /^\d{1,30}$/.test(String(a || ""));

async function get(url, init, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 9000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal }, init));
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error((j && (j.message || j.error)) || "HTTP " + r.status);
    return j;
  } finally { clearTimeout(t); }
}
// ---- KyberSwap ----
const kSumOk = (s) => s && low(s.tokenIn) === USDT && low(s.tokenOut) === DAI && amtOk(s.amountIn) && numOk(s.amountOut);
async function kQuote(amt) {
  const j = await get(KAPI + "/routes?tokenIn=" + USDT + "&tokenOut=" + DAI + "&amountIn=" + amt, { headers: H });
  const d = j.data || {}, s = d.routeSummary;
  if (j.code !== 0 || low(d.routerAddress) !== KYBER || !kSumOk(s) || String(s.amountIn) !== amt) throw new Error("报价格式不对");
  return { out: String(s.amountOut), gasUsd: Number(s.gasUsd) || 0, via: "kyber", sum: s };
}
async function kBuild(s, sender, slip) {
  const j = await get(KAPI + "/route/build", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, H), body: JSON.stringify({ routeSummary: s, sender, recipient: sender, slippageTolerance: slip, source: "ailgns" }) }, 12000);
  const d = j.data || {};
  if (j.code !== 0) throw new Error(j.message || "拿不到交易数据");
  return { to: low(d.routerAddress), data: low(d.data), value: String(d.transactionValue || "0"), out: String(d.amountOut || ""), want: KYBER };
}
// ---- ParaSwap（备用）----
const pSumOk = (p) => p && low(p.srcToken) === USDT && low(p.destToken) === DAI && Number(p.network) === 137 && amtOk(p.srcAmount) && numOk(p.destAmount) && low(p.contractAddress) === PARA;
async function pQuote(amt) {
  const j = await get(PAPI + "/prices?srcToken=" + USDT + "&destToken=" + DAI + "&amount=" + amt + "&srcDecimals=6&destDecimals=18&side=SELL&network=137&version=6.2&partner=ailgns", { headers: H });
  const p = j.priceRoute;
  if (!pSumOk(p) || String(p.srcAmount) !== amt) throw new Error("报价格式不对");
  return { out: String(p.destAmount), gasUsd: Number(p.gasCostUSD) || 0, via: "para", sum: p };
}
async function pBuild(p, sender, slip) {
  const j = await get(PAPI + "/transactions/137?ignoreChecks=true", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, H), body: JSON.stringify({ srcToken: USDT, destToken: DAI, srcAmount: String(p.srcAmount), slippage: slip, priceRoute: p, userAddress: sender, receiver: sender, srcDecimals: 6, destDecimals: 18, partner: "ailgns" }) }, 12000);
  return { to: low(j.to), data: low(j.data), value: String(j.value || "0"), out: String(p.destAmount), want: PARA };
}
const short = (e) => String((e && e.message) || e).slice(0, 50);

export async function onRequestGet(ctx) {
  const amt = new URL(ctx.request.url).searchParams.get("amt") || "";
  if (!amtOk(amt)) return json({ error: "数量不对：最少 1 USDT，最多 100 万 USDT" }, 400);
  let e1;
  try { return json(Object.assign({ ok: true }, await kQuote(amt))); } catch (e) { e1 = e; }
  try { return json(Object.assign({ ok: true }, await pQuote(amt))); } catch (e2) { return json({ error: "现在两家聚合器都拿不到报价（" + short(e1) + " / " + short(e2) + "），过一会儿再试，你的币没有动" }, 502); }
}

export async function onRequestPost(ctx) {
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const sender = low(b && b.sender), s = b && b.sum, via = b && b.via === "para" ? "para" : "kyber";
  if (!/^0x[0-9a-f]{40}$/.test(sender)) return json({ error: "钱包地址不对" }, 400);
  if (!(via === "para" ? pSumOk(s) : kSumOk(s))) return json({ error: "报价单不对，请重新报价" }, 400);
  const slip = Math.min(100, Math.max(10, Math.round(Number(b.slip) || 50)));
  const amt = String(via === "para" ? s.srcAmount : s.amountIn);
  let t = null, used = via, err;
  try { t = via === "para" ? await pBuild(s, sender, slip) : await kBuild(s, sender, slip); } catch (e) { err = e; }
  // 这一家临时拒绝了：换另一家重新报价再出交易数据（同一个数量），客户不用重来
  if (!t) { try { used = via === "para" ? "kyber" : "para"; const q2 = used === "para" ? await pQuote(amt) : await kQuote(amt); t = used === "para" ? await pBuild(q2.sum, sender, slip) : await kBuild(q2.sum, sender, slip); } catch (e2) { return json({ error: "现在拿不到换币数据（" + short(err) + " / " + short(e2) + "），过一会儿再试，你的币没有动" }, 502); } }
  if (t.to !== t.want || t.value !== "0" || !/^0x[0-9a-f]{200,60000}$/.test(t.data) || t.data.indexOf(sender.slice(2)) < 0 || t.data.indexOf(DAI.slice(2)) < 0 || !numOk(t.out))
    return json({ error: "换币数据没通过安全检查，已拦下，你的币没有动。稍后再试" }, 502);
  const out = BigInt(t.out);
  return json({ ok: true, to: t.to, data: t.data, out: String(out), min: String(out * BigInt(10000 - slip) / 10000n), slip, via: used });
}
