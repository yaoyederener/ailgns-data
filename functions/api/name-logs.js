// 域名页的链上记录快照：服务器把「注册 / 转让 / 市场成交」日志存在 KV 里，每次只补最新的几个块
// 新访客打开页面只要拉这一个文件，不用自己从部署区块开始一段一段读链（以前第一次打开要读几十次，很慢）
// GET ?a=<合约地址>&t=<事件 topic> → { to: 读到的区块, l: [[区块, topics, data], …] }（和 names.js 里 logs() 本地缓存同一格式）
import { RPCS } from "../../lib/teamlib.js";

const NAMES = { "0xbc408e9d7350967e7247c917a086cb4ece0ed988": 18161697, "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3": 18161710 };
const OTC = { "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e": 18161697, "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d": 18161710 };
const T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const T_FILL = "0xdef4cdb91e8c5e2777b0bf9645ce2c7e0b64a3b3fb94e37c6d78cde1043f80cb";
const T_CREATED = "0xabeda1aaf527ebcdd00999e25c2ae410eec4a6098fe233573eb8d956dd149bff"; // 挂单 Created(id, maker, sell, tokenId, price, expiry)：订单查询用来找卖家 / 买家
const STEP = 5000, MAX_RANGES = 40;

function startOf(a, t) {
  if (NAMES[a] && (t === T_REG || t === T_XFER)) return NAMES[a];
  if (OTC[a] && (t === T_FILL || t === T_CREATED)) return OTC[a];
  return 0;
}
async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.result !== undefined) return j.result;
      err = new Error((j.error && j.error.message) || "rpc");
    } catch (e) { err = e; }
  }
  throw err;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  const a = (u.searchParams.get("a") || "").toLowerCase(), t = (u.searchParams.get("t") || "").toLowerCase();
  const from = startOf(a, t);
  if (!from) return new Response("bad", { status: 400 });
  if (!kv) return new Response("no kv", { status: 503 });
  // 同一份快照 15 秒内直接用边缘缓存，很多人同时打开也只读一次链
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/name-logs?a=" + a + "&t=" + t);
  const hit = await cache.match(ck);
  if (hit) return hit;
  const key = "nmlogs:" + a + ":" + t.slice(2, 10);
  const c = (await kv.get(key, "json")) || { to: from - 1, l: [] };
  try {
    const latest = parseInt(await rpc("eth_blockNumber", []), 16), ranges = [];
    for (let b = c.to + 1; b <= latest && ranges.length < MAX_RANGES; b += STEP) ranges.push([b, Math.min(latest, b + STEP - 1)]);
    if (ranges.length) {
      const got = [];
      for (let i = 0; i < ranges.length; i += 4) {
        got.push(...(await Promise.all(ranges.slice(i, i + 4).map((r) => rpc("eth_getLogs", [{ address: a, fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16), topics: [t] }])))));
      }
      got.forEach((x) => x.forEach((l) => c.l.push([parseInt(l.blockNumber, 16), l.topics, l.data])));
      c.to = ranges[ranges.length - 1][1];
      await kv.put(key, JSON.stringify(c));
    }
  } catch (e) { /* 读链失败就先给旧快照，前端会自己补最新的块 */ }
  const res = new Response(JSON.stringify(c), { headers: { "content-type": "application/json", "cache-control": "public, max-age=15" } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
