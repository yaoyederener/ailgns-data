// 📊 官方资金池统计（站长 2026-11-12）：官方公布的 7 个资金地址，边缘节点每 5 分钟读一次链上余额，所有人免费看（#/funds）
// GET /api/funds → { at, f: [{ a, dai, ail, lgns }], prev: { day, six, pool } | null }
//   dai = 原生币余额（Anubis 的 DAI 就是 Gas 币，和 DAI 代币余额一致）；prev = 昨天第一次读到的合计（六个资金池 DAI 合计 / 底池 DAI），用来算「比昨天」
// 只读链上余额，不碰任何合约权限；每天第一次读到时把合计记进 KV（funds:d:<北京日期>），记不上也不影响出数
import { RPCS } from "../../lib/teamlib.js";
import { bjDay } from "../../lib/stats.js";

const AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", LGNS = "0x4d1d808a081fdac440703b3765fc61f8028c06b8";
// 顺序和页面 funds.js 一致；最后一个是底池（AiLGNS/DAI 交易池）
const FUND_ADDRS = [
  "0x27cb55ee75e777ff972b74b6e68782d12bd4ec46", "0xcc95906da4b92b3a5c4b187553050df0f90eae08", "0x85ff1e15cabca867f244b9c2465227477f251972", "0x0664f1369209677fecb279f5ec3df1e53a22212e",
  "0x589b441a19fdfd28aee5e57891a842e96d91de31", "0xf1fb9ce9472dec231bced60d6aa729f5e403020b", "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0",
];
const num = (hex, dec) => Number(BigInt(!hex || hex === "0x" ? "0x0" : hex) / 10n ** BigInt(dec - 4)) / 1e4;

async function readChain() {
  const reqs = [];
  FUND_ADDRS.forEach((a) => {
    const who = a.slice(2).padStart(64, "0");
    reqs.push({ method: "eth_getBalance", params: [a, "latest"] });
    reqs.push({ method: "eth_call", params: [{ to: AIL, data: "0x70a08231" + who }, "latest"] });
    reqs.push({ method: "eth_call", params: [{ to: LGNS, data: "0x70a08231" + who }, "latest"] });
  });
  const body = JSON.stringify(reqs.map((x, i) => ({ jsonrpc: "2.0", id: i, method: x.method, params: x.params })));
  let err = "rpc";
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json", "user-agent": "ailgns-funds/1" }, body, signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error((j && j.error && j.error.message) || "rpc");
      const out = [];
      j.forEach((x) => { if (x && typeof x.result === "string") out[x.id] = x.result; });
      if (reqs.some((_, i) => out[i] === undefined)) throw new Error("缺结果");
      return FUND_ADDRS.map((a, i) => ({ a, dai: num(out[i * 3], 18), ail: num(out[i * 3 + 1], 18), lgns: num(out[i * 3 + 2], 9) }));
    } catch (e) { err = String((e && e.message) || e); }
  }
  throw new Error(err);
}

export async function onRequestGet(ctx) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/funds");
  try { const hit = await cache.match(ck); if (hit) return hit; } catch (e) { /* 没缓存就现读 */ }
  let f;
  try { f = await readChain(); } catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 502 }); }
  const six = f.slice(0, 6).reduce((s, x) => s + x.dai, 0), pool = f[6].dai;
  let prev = null;
  try {
    const kv = ctx.env.TEAM_KV;
    if (kv) {
      const today = bjDay(Date.now()), yday = bjDay(Date.now() - 864e5);
      const [t, y] = await Promise.all([kv.get("funds:d:" + today, "json"), kv.get("funds:d:" + yday, "json")]);
      if (!t) ctx.waitUntil(kv.put("funds:d:" + today, JSON.stringify({ six, pool, at: Date.now() }), { expirationTtl: 86400 * 400 }));
      if (y && y.six > 0) prev = { day: yday, six: y.six, pool: y.pool };
    }
  } catch (e) { /* 记不上就不显示「比昨天」 */ }
  const res = Response.json({ at: Date.now(), f, prev }, { headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
  try { ctx.waitUntil(cache.put(ck, res.clone())); } catch (e) { /* 忽略 */ }
  return res;
}
