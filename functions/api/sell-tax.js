// DEX 卖出实际扣费：GET → { lgns: 0.4775, at, samples }
// Anubis 链 LGNS 卖进池子的手续费是动态的（5% 到 50% 以上），合约没有公开读取的函数，这里直接看最近几笔卖单：
// 卖家转出的 LGNS 里，真正进池子的只有一部分，其余是手续费（进销毁 / 手续费地址）；扣费比例 = 1 - 进池子的 / 卖家转出的总数
// 结果在 Cloudflare 边缘缓存 5 分钟；没测到（最近没人卖）返回 null，页面按 50% 算
import { RPCS } from "../../lib/teamlib.js";

const TOKEN = "0x4d1d808a081fdac440703b3765fc61f8028c06b8"; // Anubis LGNS
const PAIR = "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0"; // LGNS / DAI 池子
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SPAN = 4999, RECEIPTS = 8, TTL = 300;
const pad = (a) => "0x" + a.slice(2).padStart(64, "0");
const addr = (t) => "0x" + t.slice(26);

async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}

async function measure() {
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  const logs = await rpc("eth_getLogs", [{ address: TOKEN, fromBlock: "0x" + (latest - SPAN).toString(16), toBlock: "0x" + latest.toString(16), topics: [TRANSFER, null, pad(PAIR)] }]);
  const txs = [...new Set(logs.map((l) => l.transactionHash).reverse())].slice(0, RECEIPTS); // 最新的几笔
  const samples = [];
  for (const tx of txs) {
    const rc = await rpc("eth_getTransactionReceipt", [tx]).catch(() => null);
    if (!rc) continue;
    const tr = rc.logs.filter((l) => l.address.toLowerCase() === TOKEN && l.topics[0] === TRANSFER)
      .map((l) => ({ from: addr(l.topics[1]), to: addr(l.topics[2]), v: BigInt(l.data) }));
    if (tr.some((t) => t.from === PAIR)) continue; // 有从池子转出的：是买入或者套利，不算
    // 卖家：直接往池子里转了币的地址里，转出最多的那个
    const outs = {};
    for (const t of tr) (outs[t.from] = outs[t.from] || { all: 0n, pair: 0n }), (outs[t.from].all += t.v), t.to === PAIR && (outs[t.from].pair += t.v);
    const s = Object.values(outs).filter((o) => o.pair > 0n).sort((a, b) => (b.all > a.all ? 1 : -1))[0];
    if (s && s.all > 0n) samples.push(Number((s.all - s.pair) * 10000n / s.all) / 10000);
  }
  // 少数地址只扣 5%（白名单 / 特殊路径），普通卖家扣的是动态费：取最近一笔超过 6% 的，没有就取最大的
  const dyn = samples.find((x) => x > 0.06);
  const tax = dyn !== undefined ? dyn : samples.length ? Math.max(...samples) : null;
  return { lgns: tax === null ? null : Math.min(0.95, tax), at: Date.now(), samples };
}

export async function onRequestGet(ctx) {
  const key = new Request("https://ailgns.dev/__sell-tax");
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  try {
    const body = JSON.stringify(await measure());
    ctx.waitUntil(caches.default.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + TTL } })));
    return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ lgns: null, error: String((e && e.message) || e) }, { status: 502 });
  }
}
