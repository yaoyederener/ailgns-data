// 💵 Polygon 链上 USDT ⇄ DAI 的报价和换币数据，给 #/usdt「USDT 跨链桥」页用（2026-11-19，试运行；同日站长要求做成双向）
//   dir=in （默认）USDT → DAI：客户把 Polygon 的 USDT 换成 DAI，再过桥到 Anubis
//   dir=out        DAI → USDT：客户把 Anubis 的 DAI 过桥到 Polygon 后，换回 USDT
// 为什么要过一道本站：客户（尤其大陆）直连聚合器接口不稳；而且这里把交易对钉死，只能问「Polygon 上 USDT 和 DAI 互换」，别的一概不代理。
// 换币走第三方聚合器（自动在各家 DEX 里找最划算的路线）：先问 KyberSwap，它拒绝或超时就换 ParaSwap（实测 KyberSwap 对我们服务器的请求一半被拒，所以必须有备用）。
// 本站不经手客户的币，返回的数据由客户自己钱包签名发出。
// 收费（站长 2026-11-19 定）：换币收 0.1% 服务费，用两家聚合器自带的「接入方分成」——换币那一笔里直接把 0.1% 的换出币分到收款钱包，没有新合约、客户不用多签。
// 返回的 out 都是扣完服务费之后客户到手的数（显示即所得），fee 是服务费本身（单位 = 换出来的那个币）。过桥不收费。
//   GET  ?amt=付出的数量（整数，按付出那个币的小数位：USDT 6 位、DAI 18 位）&dir=in|out   → { ok, dir, out, fee, feeBps, gasUsd, via, sum }
//   POST { sum, via, dir, sender, slip }  slip = 价格保护，万分之几（10–100，默认 50 = 0.5%） → { ok, to, data, out, min, via }
// 四道保险：① 路由合约地址必须是登记的那两个之一；② 交易数据里必须带着客户自己的地址和换出币的地址（钱只能回到客户自己）；③ 不许带原生币金额；④ 服务费比例必须正好是 FEE_BPS、收款地址必须是 FEE_TO，报价单里对不上就拒绝
const USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // Polygon USDT（6 位）
const DAI = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"; // Polygon DAI（18 位）
const KYBER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5"; // KyberSwap MetaAggregationRouterV2
const PARA = "0x6a000f20005980200259b80c5102003040001068"; // ParaSwap Augustus v6.2（lib/addresses.js 都有登记）
const KAPI = "https://aggregator-api.kyberswap.com/polygon/api/v1", PAPI = "https://api.paraswap.io";
const H = { "x-client-id": "ailgns", "user-agent": "Mozilla/5.0 (compatible; ailgns-site)", accept: "application/json" };
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const low = (s) => String(s || "").toLowerCase();
const FEE_BPS = 10; // 服务费 0.1%（万分之 10）。改费率只改这一个数，页面从接口读
const FEE_TO = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 谷歌社交账号钱包（Polygon 上同一个地址，登记表里有）
// 两个方向各自的：付出币、换出币、小数位、数量上下限（1 ～ 100 万个）
const PAIR = {
  in: { src: USDT, dst: DAI, sd: 6, dd: 18, min: 10n ** 6n, max: 10n ** 12n, name: "USDT" },
  out: { src: DAI, dst: USDT, sd: 18, dd: 6, min: 10n ** 18n, max: 10n ** 24n, name: "DAI" }
};
const dirOf = (d) => (d === "out" ? "out" : "in");
const amtOk = (a, P) => /^\d{1,26}$/.test(String(a || "")) && BigInt(a) >= P.min && BigInt(a) <= P.max;
const numOk = (a) => /^\d{1,30}$/.test(String(a || ""));
const feeOf = (net) => String(BigInt(net) * BigInt(FEE_BPS) / BigInt(10000 - FEE_BPS)); // 到手数是扣完费的，反推服务费

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
const kFeeOk = (s) => { const f = s.extraFee || {}; return String(f.feeAmount) === String(FEE_BPS) && f.chargeFeeBy === "currency_out" && f.isInBps === true && low(f.feeReceiver) === FEE_TO; };
const kSumOk = (s, P) => s && low(s.tokenIn) === P.src && low(s.tokenOut) === P.dst && amtOk(s.amountIn, P) && numOk(s.amountOut) && kFeeOk(s);
async function kQuote(amt, P) {
  const j = await get(KAPI + "/routes?tokenIn=" + P.src + "&tokenOut=" + P.dst + "&amountIn=" + amt + "&feeAmount=" + FEE_BPS + "&chargeFeeBy=currency_out&isInBps=true&feeReceiver=" + FEE_TO, { headers: H });
  const d = j.data || {}, s = d.routeSummary;
  if (j.code !== 0 || low(d.routerAddress) !== KYBER || !kSumOk(s, P) || String(s.amountIn) !== amt) throw new Error("报价格式不对");
  return { out: String(s.amountOut), fee: feeOf(s.amountOut), gasUsd: Number(s.gasUsd) || 0, via: "kyber", sum: s }; // Kyber 的 amountOut 已经是扣完分成的（实测 = 不带费 × 0.999）
}
async function kBuild(s, sender, slip) {
  const j = await get(KAPI + "/route/build", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, H), body: JSON.stringify({ routeSummary: s, sender, recipient: sender, slippageTolerance: slip, source: "ailgns" }) }, 12000);
  const d = j.data || {};
  if (j.code !== 0) throw new Error(j.message || "拿不到交易数据");
  return { to: low(d.routerAddress), data: low(d.data), value: String(d.transactionValue || "0"), out: String(d.amountOut || ""), want: KYBER };
}
// ---- ParaSwap（备用）----
const pSumOk = (p, P) => p && low(p.srcToken) === P.src && low(p.destToken) === P.dst && Number(p.network) === 137 && amtOk(p.srcAmount, P) && numOk(p.destAmount) && numOk(p.destAmountAfterFee) && Number(p.partnerFee) === FEE_BPS / 100 && low(p.contractAddress) === PARA;
async function pQuote(amt, P) {
  const j = await get(PAPI + "/prices?srcToken=" + P.src + "&destToken=" + P.dst + "&amount=" + amt + "&srcDecimals=" + P.sd + "&destDecimals=" + P.dd + "&side=SELL&network=137&version=6.2&partner=ailgns&partnerFeeBps=" + FEE_BPS + "&partnerAddress=" + FEE_TO, { headers: H });
  const p = j.priceRoute;
  if (!pSumOk(p, P) || String(p.srcAmount) !== amt) throw new Error("报价格式不对");
  return { out: String(p.destAmountAfterFee), fee: String(BigInt(p.destAmount) - BigInt(p.destAmountAfterFee)), gasUsd: Number(p.gasCostUSD) || 0, via: "para", sum: p }; // ParaSwap 的 destAmount 是没扣的，destAmountAfterFee 才是客户到手
}
async function pBuild(p, sender, slip, P) {
  const j = await get(PAPI + "/transactions/137?ignoreChecks=true", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, H), body: JSON.stringify({ srcToken: P.src, destToken: P.dst, srcAmount: String(p.srcAmount), slippage: slip, priceRoute: p, userAddress: sender, receiver: sender, srcDecimals: P.sd, destDecimals: P.dd, partner: "ailgns", partnerAddress: FEE_TO, partnerFeeBps: FEE_BPS, isDirectFeeTransfer: true }) }, 12000);
  return { to: low(j.to), data: low(j.data), value: String(j.value || "0"), out: String(p.destAmountAfterFee), want: PARA };
}
const short = (e) => String((e && e.message) || e).slice(0, 50);

export async function onRequestGet(ctx) {
  const sp = new URL(ctx.request.url).searchParams, dir = dirOf(sp.get("dir")), P = PAIR[dir], amt = sp.get("amt") || "";
  if (!amtOk(amt, P)) return json({ error: "数量不对：最少 1 " + P.name + "，最多 100 万 " + P.name }, 400);
  let e1;
  try { return json(Object.assign({ ok: true, dir, feeBps: FEE_BPS }, await kQuote(amt, P))); } catch (e) { e1 = e; }
  try { return json(Object.assign({ ok: true, dir, feeBps: FEE_BPS }, await pQuote(amt, P))); } catch (e2) { return json({ error: "现在两家聚合器都拿不到报价（" + short(e1) + " / " + short(e2) + "），过一会儿再试，你的币没有动" }, 502); }
}

export async function onRequestPost(ctx) {
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const sender = low(b && b.sender), s = b && b.sum, via = b && b.via === "para" ? "para" : "kyber", dir = dirOf(b && b.dir), P = PAIR[dir];
  if (!/^0x[0-9a-f]{40}$/.test(sender)) return json({ error: "钱包地址不对" }, 400);
  if (!(via === "para" ? pSumOk(s, P) : kSumOk(s, P))) return json({ error: "报价单不对，请重新报价" }, 400);
  const slip = Math.min(100, Math.max(10, Math.round(Number(b.slip) || 50)));
  const amt = String(via === "para" ? s.srcAmount : s.amountIn);
  let t = null, used = via, err;
  try { t = via === "para" ? await pBuild(s, sender, slip, P) : await kBuild(s, sender, slip); } catch (e) { err = e; }
  // 这一家临时拒绝了：换另一家重新报价再出交易数据（同一个数量、同一个方向），客户不用重来
  if (!t) { try { used = via === "para" ? "kyber" : "para"; const q2 = used === "para" ? await pQuote(amt, P) : await kQuote(amt, P); t = used === "para" ? await pBuild(q2.sum, sender, slip, P) : await kBuild(q2.sum, sender, slip); } catch (e2) { return json({ error: "现在拿不到换币数据（" + short(err) + " / " + short(e2) + "），过一会儿再试，你的币没有动" }, 502); } }
  if (t.to !== t.want || t.value !== "0" || !/^0x[0-9a-f]{200,60000}$/.test(t.data) || t.data.indexOf(sender.slice(2)) < 0 || t.data.indexOf(P.dst.slice(2)) < 0 || t.data.indexOf(FEE_TO.slice(2)) < 0 || !numOk(t.out))
    return json({ error: "换币数据没通过安全检查，已拦下，你的币没有动。稍后再试" }, 502);
  const out = BigInt(t.out);
  return json({ ok: true, dir, to: t.to, data: t.data, out: String(out), min: String(out * BigInt(10000 - slip) / 10000n), slip, via: used, feeBps: FEE_BPS });
}
