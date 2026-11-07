// 域名市场在卖的名字（两个后缀合并）：服务器一次批量读链，15 秒边缘缓存
// 以前每个访客自己读：每个挂单 2 次（名字、到期），70 个挂单就是 140 多次请求，很慢
// GET [?f=1 跳过缓存] → { list: [{ t, O, id, maker, expiry, tid, price, label, exp }] }（price 是 wei 字符串）
import { RPCS } from "../../lib/teamlib.js";
import { banned } from "../../lib/ban.js";

const M = {
  ailgns: { O: "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e", C: "0xbc408e9d7350967e7247c917a086cb4ece0ed988" },
  lgns: { O: "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d", C: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3" },
};
const SEL = { oCount: "0x35daa731", oGet: "0x8f72fc77", labelOf: "0x36bf1f0c", expires: "0xcb52c823" };
const u256 = (n) => BigInt(n).toString(16).padStart(64, "0");
const word = (r, i) => r.slice(2 + i * 64, 2 + (i + 1) * 64);
function decStr(r) {
  const off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2);
  return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16))));
}
// 批量 eth_call：一次 HTTP 请求带很多个调用
async function batch(calls) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const body = calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: c[0], data: c[1] }, "latest"] }));
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(), out = [];
      if (!Array.isArray(j)) throw new Error("rpc");
      j.forEach((x) => { out[x.id] = x.result; });
      if (out.length !== calls.length || out.some((x) => x === undefined)) throw new Error("rpc 缺结果");
      return out;
    } catch (e) { err = e; }
  }
  throw err;
}

async function build() {
  const ts = Object.keys(M), now = Date.now() / 1000;
  const counts = await batch(ts.map((t) => [M[t].O, SEL.oCount]));
  // 全部挂单都读（以前只读最近 200 张：早挂的单在市场里看不到，客户以为名字丢了）；每 200 张一页，一次批量请求
  const jobs = [];
  ts.forEach((t, k) => { const n = Number(BigInt(counts[k])); for (let f = 0; f < n; f += 200) jobs.push([t, f, Math.min(200, n - f)]); });
  const pages = jobs.length ? await batch(jobs.map((j) => [M[j[0]].O, SEL.oGet + u256(j[1]) + u256(j[2])])) : [];
  const list = [];
  jobs.forEach(([t, from], k) => {
    const w = pages[k].slice(2).match(/.{64}/g) || [], cnt = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0;
    for (let i = 0; i < cnt; i++) {
      const o = w.slice(2 + i * 6, 8 + i * 6);
      const it = { t, O: M[t].O, id: from + i, maker: "0x" + o[0].slice(24), sell: o[1].slice(-1) === "1", open: o[2].slice(-1) === "1", expiry: Number(BigInt("0x" + o[3])), tid: o[4], price: BigInt("0x" + o[5]).toString() };
      if (it.sell && it.open) { it.expired = it.expiry <= now; delete it.sell; delete it.open; list.push(it); } // 2026-11-07：过期没取回的也给（带 expired），不然卖家找不到自己的单、取不回名字（工单 #31）
    }
  });
  if (list.length) {
    const res = await batch(list.flatMap((it) => [[M[it.t].C, SEL.labelOf + it.tid], [M[it.t].C, SEL.expires + it.tid]]));
    list.forEach((it, i) => { it.label = decStr(res[2 * i]); it.exp = Number(BigInt("0x" + word(res[2 * i + 1], 0))); });
  }
  return list.filter((it) => !banned(it.label)); // 🚫 涉政名字不进市场
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), cache = caches.default, ck = new Request("https://ailgns.dev/api/name-market");
  if (!u.searchParams.get("f")) { const hit = await cache.match(ck); if (hit) return hit; }
  let list;
  try { list = await build(); } catch (e) { return Response.json({ error: "读链失败" }, { status: 502 }); }
  const res = new Response(JSON.stringify({ list, at: Date.now() }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=15" } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
