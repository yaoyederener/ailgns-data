// 🔥 已销毁的创世域名（站长 2026-11-09：域名页要有「已销毁创世域名」统计 + 销毁记录，点开进中文账本）
// 销毁 = 名字被转进黑洞地址 DEAD。记录从 /api/name-logs 的 Transfer 快照里挑 to = DEAD 的那几条（零 RPC），
// 交易哈希和时间快照里没有，只对新出现的那几条补查一次（eth_getLogs 只查那一个块 + eth_getBlockByNumber），结果存 KV nm:burnmeta 永久复用。
//   GET → { n, list: [{ id, label, no, from, blk, tx, t }]（新的在前，最多 200 条）, at }   边缘缓存 30 秒
import { RPCS } from "../../lib/teamlib.js";

const NAMES = "0xbc408e9d7350967e7247c917a086cb4ece0ed988";
const DEAD = "0x000000000000000000000000000000000000dead";
const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const pad = (a) => "0x" + String(a).slice(2).toLowerCase().padStart(64, "0");
const word = (r, i) => r.slice(2 + i * 64, 2 + (i + 1) * 64);
function decStr(r) { try { const off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2); return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)))); } catch (e) { return ""; } }
async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try { const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); const j = await r.json(); if (j.result !== undefined) return j.result; err = new Error((j.error && j.error.message) || "rpc"); } catch (e) { err = e; }
  }
  throw err;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/name-burns");
  const hit = await cache.match(ck);
  if (hit) return hit;
  const get = (p) => fetch(u.origin + p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [xf, rg, gen] = await Promise.all([get("/api/name-logs?a=" + NAMES + "&t=" + T_XFER), get("/api/name-logs?a=" + NAMES + "&t=" + T_REG), get("/api/name-genesis")]);
  if (!xf || !xf.l) return new Response("no data", { status: 503 });
  const dead = pad(DEAD), label = {}, g = Object.assign({}, (gen && gen.g) || {}, (gen && gen.x) || {}); // 烧过的编号在 x 里
  ((rg && rg.l) || []).forEach((l) => { if (l[1] && l[1][1]) label[l[1][1].toLowerCase()] = decStr(l[2]); });
  const burns = xf.l.filter((l) => l[1] && l[1][2] && l[1][2].toLowerCase() === dead && l[1][3]).map((l) => {
    const id = l[1][3].toLowerCase();
    return { id: id.slice(2), label: label[id] || "", no: g[id.slice(2)] || 0, from: "0x" + l[1][1].slice(26).toLowerCase(), blk: l[0] };
  });
  // 补交易哈希 + 时间：只查还没记过的（一般就是最新那一两条）
  const metaKey = "nm:burnmeta", meta = (await kv.get(metaKey, "json")) || {};
  let dirty = false;
  for (const b of burns) {
    const k = b.blk + ":" + b.id;
    if (!meta[k]) {
      try {
        const [logs, blk] = await Promise.all([
          rpc("eth_getLogs", [{ address: NAMES, fromBlock: "0x" + b.blk.toString(16), toBlock: "0x" + b.blk.toString(16), topics: [T_XFER, null, dead, "0x" + b.id] }]),
          rpc("eth_getBlockByNumber", ["0x" + b.blk.toString(16), false]),
        ]);
        meta[k] = { tx: (logs[0] && logs[0].transactionHash) || "", t: parseInt(blk.timestamp, 16) * 1000 };
        dirty = true;
      } catch (e) { /* 节点没响应：这次先不记，下次再补 */ }
    }
    b.tx = (meta[k] && meta[k].tx) || ""; b.t = (meta[k] && meta[k].t) || 0;
  }
  if (dirty) ctx.waitUntil(kv.put(metaKey, JSON.stringify(meta)).catch(() => {}));
  const list = burns.sort((p, q) => q.blk - p.blk).slice(0, 200);
  const res = Response.json({ n: burns.length, list, to: xf.to, at: Date.now() }, { headers: { "cache-control": "public, max-age=30" } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
