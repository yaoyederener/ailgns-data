// 按付款钱包查注册 / 续费记录：合约每次收钱都发 Paid(payer, token, amount, costDai)，同一笔交易里有 NameRegistered / NameRenewed
// 客户说「注册了但查不到」：多半是帮别的地址注册了，或者注册后转走了。这里按付款记录查出名字和它现在在哪个钱包
// GET ?a=<付款地址> → { list: [{ t, label, kind: "reg"|"renew", to, owner, primary, tx, block }] }
import { RPCS } from "../../lib/teamlib.js";

const C = { ailgns: ["0xbc408e9d7350967e7247c917a086cb4ece0ed988", 18161697], lgns: ["0x93af23fe74e5180f54f0996fa6bb6c157775f7f3", 18161710] };
const PAID = "0x26c4308021cef5cdbc618fee8b61faf9de6b8f7e4e49fac43869dc1a26756408";
const REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const RENEW = "0xe03473f0a48e80b9c5a43d80af578cc6d82504d52c8239b1699e3d281b280b56";
const STEP = 5000;

async function rpcBatch(calls) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: c[0], params: c[1] }))) });
      const j = await r.json(), out = [];
      if (!Array.isArray(j)) throw new Error("rpc");
      j.forEach((x) => { if (x.error) throw new Error(x.error.message); out[x.id] = x.result; });
      if (out.length !== calls.length) throw new Error("rpc 缺结果");
      return out;
    } catch (e) { err = e; }
  }
  throw err;
}
async function many(calls) { // 分批，每批 20 个
  const out = [];
  for (let i = 0; i < calls.length; i += 20) out.push(...(await rpcBatch(calls.slice(i, i + 20))));
  return out;
}
function decStr(data, wordIdx) { // data 里第 wordIdx 个字是字符串偏移
  const h = data.slice(2), w = (i) => h.slice(i * 64, i * 64 + 64), off = parseInt(w(wordIdx), 16) / 32, len = parseInt(w(off), 16);
  const s = h.slice((off + 1) * 64, (off + 1) * 64 + len * 2);
  return new TextDecoder().decode(new Uint8Array((s.match(/../g) || []).map((x) => parseInt(x, 16))));
}

export async function onRequestGet(ctx) {
  const a = (new URL(ctx.request.url).searchParams.get("a") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return Response.json({ error: "地址格式不对" }, { status: 400 });
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/name-paid?a=" + a);
  const hit = await cache.match(ck); if (hit) return hit;
  try {
    const latest = parseInt((await rpcBatch([["eth_blockNumber", []]]))[0], 16), topic1 = "0x" + a.slice(2).padStart(64, "0");
    const q = [];
    for (const t of Object.keys(C)) for (let b = C[t][1]; b <= latest; b += STEP) q.push([t, ["eth_getLogs", [{ address: C[t][0], fromBlock: "0x" + b.toString(16), toBlock: "0x" + Math.min(latest, b + STEP - 1).toString(16), topics: [PAID, topic1] }]]]);
    const res = await many(q.map((x) => x[1]));
    const txs = {};
    res.forEach((ls, i) => (ls || []).forEach((l) => { txs[l.transactionHash] = { t: q[i][0], block: parseInt(l.blockNumber, 16) }; }));
    const hs = Object.keys(txs);
    const recs = hs.length ? await many(hs.map((h) => ["eth_getTransactionReceipt", [h]])) : [];
    const list = [];
    recs.forEach((r, i) => {
      const meta = txs[hs[i]], addr = C[meta.t][0];
      (r && r.logs || []).forEach((l) => {
        if (l.address.toLowerCase() !== addr) return;
        if (l.topics[0] === REG) list.push({ t: meta.t, id: l.topics[1].slice(2), label: decStr(l.data, 0), kind: "reg", to: "0x" + l.topics[2].slice(26), tx: hs[i], block: meta.block });
        else if (l.topics[0] === RENEW) list.push({ t: meta.t, id: l.topics[1].slice(2), label: decStr(l.data, 0), kind: "renew", tx: hs[i], block: meta.block });
      });
    });
    // 现在的持有人 + 持有人的主名字
    const own = list.length ? await many(list.map((x) => ["eth_call", [{ to: C[x.t][0], data: "0x6352211e" + x.id }, "latest"]])) : [];
    list.forEach((x, i) => { x.owner = own[i] && own[i].length >= 66 ? "0x" + own[i].slice(-40) : null; });
    const pri = list.length ? await many(list.map((x) => ["eth_call", [{ to: C[x.t][0], data: "0xf5c57382" + (x.owner || "0x0").slice(2).padStart(64, "0") }, "latest"]])) : [];
    list.forEach((x, i) => { try { x.primary = pri[i] && pri[i].length > 130 ? decStr(pri[i], 0) : ""; } catch (e) { x.primary = ""; } delete x.id; });
    list.sort((x, y) => y.block - x.block);
    const out = new Response(JSON.stringify({ list }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
    ctx.waitUntil(cache.put(ck, out.clone()));
    return out;
  } catch (e) {
    return Response.json({ error: "读链失败，请稍后再试" }, { status: 400 });
  }
}
