// 🔁 aiswap 接口：GET /api/aiswap → { cfg, pools, at }
// cfg 来自 lib/aiswap.js（合约地址只在那里填）；pools = 工厂里每个池子的两种币、储备、价格、24h 成交（Swap 事件汇总）
// 合约地址没填时 pools 为空、cfg.ready=false，前端显示「部署中」占位。结果在 Cloudflare 边缘缓存 60 秒（秒开优先，不实时读链）
import { AISWAP, aiswapConfig, aiswapReady } from "../../lib/aiswap.js";

const TTL = 60, MAX_POOLS = 60, SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const SEL = { allPairsLength: "0x574f2ba3", allPairs: "0x1e3dd18b", token0: "0x0dfe1681", token1: "0xd21220a7", getReserves: "0x0902f1ac", symbol: "0x95d89b41", decimals: "0x313ce567", totalSupply: "0x18160ddd" };
const u256 = (v) => BigInt(v).toString(16).padStart(64, "0");
const addr = (w) => "0x" + w.slice(-40).toLowerCase();
const word = (h, i) => BigInt("0x" + (h.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"));
const num = (v, d) => Number(v) / Math.pow(10, d);

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
function str(h) { /* ABI string：偏移 + 长度 + 内容 */ try { const n = Number(word(h, 1)); const hex = h.slice(2 + 128, 2 + 128 + n * 2); return decodeURIComponent(hex.replace(/(..)/g, "%$1")); } catch (e) { return "?"; } }

const known = Object.fromEntries(AISWAP.tokens.map((t) => [t.addr.toLowerCase(), t]));
const tokenCache = {};
async function token(a) {
  a = a.toLowerCase();
  if (known[a]) return known[a];
  if (!tokenCache[a]) {
    const [s, d] = await Promise.all([call(a, SEL.symbol).then(str, () => "?"), call(a, SEL.decimals).then((h) => Number(word(h, 0)), () => 18)]);
    tokenCache[a] = { sym: s, addr: a, dec: d };
  }
  return tokenCache[a];
}

async function pools() {
  const f = AISWAP.contracts.factory;
  const n = Math.min(Number(word(await call(f, SEL.allPairsLength), 0)), MAX_POOLS);
  const pairs = await Promise.all(Array.from({ length: n }, (_, i) => call(f, SEL.allPairs + u256(i)).then(addr)));
  // 24h 成交：最近 24 小时的 Swap 事件，按两种币分别汇总（用区块时间戳估算 24h 跨几个块）
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  const [b1, b0] = await Promise.all([rpc("eth_getBlockByNumber", ["0x" + latest.toString(16), false]), rpc("eth_getBlockByNumber", ["0x" + (latest - 2000).toString(16), false])]);
  const blockSec = Math.max(0.5, (parseInt(b1.timestamp, 16) - parseInt(b0.timestamp, 16)) / 2000);
  const from = Math.max(0, latest - Math.ceil(86400 / blockSec));
  const logs = pairs.length ? await rpc("eth_getLogs", [{ address: pairs, fromBlock: "0x" + from.toString(16), toBlock: "0x" + latest.toString(16), topics: [SWAP_TOPIC] }]).catch(() => []) : [];
  const vol = {};
  for (const l of logs) {
    const p = l.address.toLowerCase(), v = vol[p] || (vol[p] = { v0: 0n, v1: 0n, n: 0 });
    v.v0 += word(l.data, 0) + word(l.data, 2); v.v1 += word(l.data, 1) + word(l.data, 3); v.n++; // amount0In + amount0Out，amount1In + amount1Out
  }
  const out = [];
  for (const p of pairs) {
    const [t0, t1, rs, ts] = await Promise.all([call(p, SEL.token0).then(addr), call(p, SEL.token1).then(addr), call(p, SEL.getReserves), call(p, SEL.totalSupply)]);
    const [a, b] = await Promise.all([token(t0), token(t1)]);
    const r0 = word(rs, 0), r1 = word(rs, 1), v = vol[p] || { v0: 0n, v1: 0n, n: 0 };
    out.push({ pair: p, t0: a, t1: b, r0: r0.toString(), r1: r1.toString(), lp: word(ts, 0).toString(),
      res0: num(r0, a.dec), res1: num(r1, b.dec), vol0: num(v.v0, a.dec) / 2, vol1: num(v.v1, b.dec) / 2, swaps: v.n }); // 成交额 = (进 + 出) / 2，一笔只算一次
  }
  // 按 DAI 储备（没有 DAI 就按 AiLGNS 储备）从大到小
  const dai = AISWAP.tokens[0].addr.toLowerCase(), q = AISWAP.quote.toLowerCase();
  const size = (x) => x.t0.addr === dai ? x.res0 * 2 : x.t1.addr === dai ? x.res1 * 2 : x.t0.addr === q ? x.res0 : x.t1.addr === q ? x.res1 : 0;
  out.sort((x, y) => size(y) - size(x));
  return out;
}

export async function onRequestGet({ request }) {
  const key = new Request(new URL(request.url).origin + "/api/aiswap?v=1"), hit = await caches.default.match(key);
  if (hit) return hit;
  let body;
  if (!aiswapReady()) body = { cfg: aiswapConfig(), pools: [], at: Date.now() };
  else {
    try { body = { cfg: aiswapConfig(), pools: await pools(), at: Date.now() }; }
    catch (e) { body = { cfg: aiswapConfig(), pools: [], at: Date.now(), err: String(e && e.message || e).slice(0, 120) }; }
  }
  const res = new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + TTL } });
  if (!body.err) await caches.default.put(key, res.clone());
  return res;
}
