// 🚀 一键发币接口（站长 2026-11-23 定）
//   GET  /api/launch[?a=钱包]  → { rules, open, list: [上榜的币 + 现在的池子 / 发币人持仓], me: { gen } }
//   POST /api/launch { token, deployTx, feeTx } → 逐项核对链上事实（lib/launch.js verify），全过才上榜
// 没有新合约、不碰任何人的钱：币是客户自己钱包部署的标准代币，池子是现成的 aiswap，这里只「读链 + 记一张榜」。
// 谁来登记都行（不用签名）：能不能上榜只看链上事实，替别人登记也只是帮他上榜。
import { AISWAP, aiswapReady } from "../../lib/aiswap.js";
import { LAUNCH, DEAD, verify, keepPct } from "../../lib/launch.js";
import { TOKEN_RUNTIME } from "../../lib/launch-token.js";
import { NAMES, heldNames } from "../../lib/oracle.js";
import { pushInbox } from "../../lib/inbox.js";
import { alertOwner } from "../../lib/alert.js";

const LIST_KEY = "launch:list", MAX = 200, TTL = 60;
const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const SEL = { getPair: "0xe6a43905", token0: "0x0dfe1681", getReserves: "0x0902f1ac", symbol: "0x95d89b41", name: "0x06fdde03", decimals: "0x313ce567", totalSupply: "0x18160ddd", balanceOf: "0x70a08231" };
const low = (s) => String(s || "").toLowerCase();
const isAddr = (s) => /^0x[0-9a-f]{40}$/.test(low(s));
const isTx = (s) => /^0x[0-9a-f]{64}$/.test(low(s));
const pad = (a) => low(a).replace("0x", "").padStart(64, "0");
const word = (h, i) => BigInt("0x" + (String(h || "0x").slice(2 + i * 64, 2 + (i + 1) * 64) || "0"));
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function rpc(method, params) {
  let err;
  for (let k = 0; k < AISWAP.chain.rpcs.length * 2; k++) {
    try {
      const r = await fetch(AISWAP.chain.rpcs[k % AISWAP.chain.rpcs.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
function str(h) { try { const n = Number(word(h, 1)); const hex = h.slice(2 + 128, 2 + 128 + n * 2); return decodeURIComponent(hex.replace(/(..)/g, "%$1")); } catch (e) { return ""; } }

// 这个钱包现在手里有几枚创世域名；快照读不到 → null（宁可让他过几分钟再登记，也不乱判）
async function genCount(kv, a) {
  try {
    const [rg, xf] = await Promise.all([kv.get("nmlogs:" + NAMES.ailgns + ":" + T_REG.slice(2, 10), "json"), kv.get("nmlogs:" + NAMES.ailgns + ":" + T_XFER.slice(2, 10), "json")]);
    if (!rg || !xf || !rg.l || !xf.l || !rg.l.length || !xf.l.length) return null;
    return heldNames(xf.l, rg.l, a).gen.length;
  } catch (e) { return null; }
}
// 池子现状：有没有池子、AiLGNS 一侧多少、新币一侧多少
async function poolOf(token) {
  const q = low(AISWAP.quote), pair = "0x" + (await call(AISWAP.contracts.factory, SEL.getPair + pad(token) + pad(q))).slice(-40);
  if (/^0x0{40}$/.test(pair)) return { pair, quoteRes: 0n, tokRes: 0n };
  const [t0, rs] = await Promise.all([call(pair, SEL.token0), call(pair, SEL.getReserves)]);
  const r0 = word(rs, 0), r1 = word(rs, 1), q0 = low("0x" + t0.slice(-40)) === q;
  return { pair: low(pair), quoteRes: q0 ? r0 : r1, tokRes: q0 ? r1 : r0 };
}
// 登记用：把这个币的链上事实全部读回来
async function gather(kv, token, deployTx, feeTx, list) {
  const [rcD, rcF, code] = await Promise.all([rpc("eth_getTransactionReceipt", [deployTx]), rpc("eth_getTransactionReceipt", [feeTx]), rpc("eth_getCode", [token, "latest"])]);
  const creator = low(rcD && rcD.from), feeTo = low(AISWAP.feeTo), q = low(AISWAP.quote);
  const [nm, sy, dc, ts, kept, pool] = await Promise.all([call(token, SEL.name).then(str, () => ""), call(token, SEL.symbol).then(str, () => ""), call(token, SEL.decimals).then((h) => Number(word(h, 0)), () => 0),
    call(token, SEL.totalSupply).then((h) => word(h, 0), () => 0n), creator ? call(token, SEL.balanceOf + pad(creator)).then((h) => word(h, 0), () => 0n) : 0n, poolOf(token)]);
  let lpTotal = 0n, lpDead = 0n, lpCreator = 0n;
  if (!/^0x0{40}$/.test(pool.pair)) [lpTotal, lpDead, lpCreator] = await Promise.all([call(pool.pair, SEL.totalSupply), call(pool.pair, SEL.balanceOf + pad(DEAD)), call(pool.pair, SEL.balanceOf + pad(creator))]).then((x) => x.map((h) => word(h, 0)));
  // 发币费：这笔交易里，发币人 → 收款钱包 的 AiLGNS 转账合计
  let feePaid = 0n;
  for (const l of (rcF && rcF.logs) || []) {
    if (low(l.address) === q && l.topics && l.topics[0] === T_XFER && low(l.topics[1]) === "0x" + pad(creator) && low(l.topics[2]) === "0x" + pad(feeTo)) feePaid += word(l.data, 0);
  }
  return {
    token, creator, wantCode: TOKEN_RUNTIME, code, name: nm, sym: sy, decimals: dc, supply: ts, kept,
    deployOk: !!(rcD && rcD.status === "0x1"), deployTo: rcD && rcD.contractAddress,
    pair: pool.pair, quoteRes: pool.quoteRes, tokRes: pool.tokRes, lpTotal, lpDead, lpCreator,
    feeOk: !!(rcF && rcF.status === "0x1"), feePaid, feeUsed: !!(await kv.get("launch:fee:" + feeTx)),
    gen: creator ? await genCount(kv, creator) : null,
    symTaken: list.some((x) => low(x.sym) === low(sy) && low(x.token) !== low(token))
  };
}
// 榜单：记录 + 现在的池子和发币人持仓（60 秒缓存，不实时读链）
async function liveList(list) {
  return Promise.all(list.map(async (x) => {
    try {
      const [pool, bal] = await Promise.all([poolOf(x.token), call(x.token, SEL.balanceOf + pad(x.creator)).then((h) => word(h, 0))]);
      const supply = BigInt(x.supply) * 10n ** 18n, q = Number(pool.quoteRes) / 1e18, t = Number(pool.tokRes) / 1e18;
      return { ...x, q: Math.round(q * 1e4) / 1e4, px: t > 0 ? q / t : 0, keep: keepPct(bal, supply) };
    } catch (e) { return { ...x, q: null, px: null, keep: null }; }
  }));
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), a = low(u.searchParams.get("a")), kv = env.TEAM_KV;
  const base = { rules: LAUNCH, open: !!TOKEN_RUNTIME && aiswapReady(), feeTo: AISWAP.feeTo, quote: AISWAP.quote, router: AISWAP.contracts.router, dead: DEAD };
  if (!kv) return J({ ...base, list: [], me: null, noKv: true });
  const ck = new Request(u.origin + "/api/launch?list=1"), hit = await caches.default.match(ck);
  let list;
  if (hit) list = (await hit.json()).list;
  else {
    list = await liveList((await kv.get(LIST_KEY, "json")) || []);
    await caches.default.put(ck, new Response(JSON.stringify({ list }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + TTL } }));
  }
  return J({ ...base, list, me: isAddr(a) ? { gen: await genCount(kv, a) } : null });
}

export async function onRequestPost({ request, env }) {
  const kv = env.TEAM_KV;
  if (!kv) return J({ ok: false, error: "没有存储，暂时不能登记" }, 503);
  if (!TOKEN_RUNTIME || !aiswapReady()) return J({ ok: false, error: "发币还没开放，请等公告" }, 503);
  let b; try { b = await request.json(); } catch (e) { return J({ ok: false, error: "请求格式不对" }, 400); }
  const token = low(b.token), deployTx = low(b.deployTx), feeTx = low(b.feeTx);
  if (!isAddr(token) || !isTx(deployTx) || !isTx(feeTx)) return J({ ok: false, error: "缺少币的地址或交易号" }, 400);
  const list = (await kv.get(LIST_KEY, "json")) || [];
  const had = list.find((x) => low(x.token) === token);
  if (had) return J({ ok: true, coin: had, again: true });
  if (list.length >= MAX) return J({ ok: false, error: "榜单满了，请联系客服" }, 503);
  let f;
  try { f = await gather(kv, token, deployTx, feeTx, list); } catch (e) { return J({ ok: false, error: "读链失败，请过一会儿再点一次登记（不会多收费）" }, 502); }
  const v = verify(f);
  if (!v.ok) return J({ ok: false, error: v.why });
  const coin = { token, sym: f.sym, name: f.name, supply: (f.supply / 10n ** 18n).toString(), creator: f.creator, pair: f.pair, at: Date.now(), deployTx, feeTx, keep0: keepPct(f.kept, f.supply), q0: Math.round(Number(f.quoteRes) / 1e14) / 1e4 };
  list.unshift(coin);
  await kv.put(LIST_KEY, JSON.stringify(list));
  await kv.put("launch:fee:" + feeTx, token);
  try { await caches.default.delete(new Request(new URL(request.url).origin + "/api/launch?list=1")); } catch (e) { /* 缓存清不掉 60 秒后也会更新 */ }
  try { await pushInbox(kv, f.creator, "sys", "🚀 你的币「" + f.sym + "」已经上榜，可以在 aiswap 买卖了。流动性已销毁，谁也撤不走。提醒：平台只提供工具，不为任何币背书。", "#/aiswap/launch"); } catch (e) { /* 通知失败不影响上榜 */ }
  try { await alertOwner(env, kv, "launch:" + token, 86400, "🚀 有人发了新币「" + f.sym + "」（" + f.name + "），发币费 " + LAUNCH.feeAil + " 枚 AiLGNS 已到收款钱包。发币人自己留了 " + coin.keep0 + "%，池子里 " + coin.q0 + " 枚 AiLGNS。", "#/aiswap/launch", true); } catch (e) { /* 同上 */ }
  return J({ ok: true, coin });
}
