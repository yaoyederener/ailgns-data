// 🌟 创世域名营销卡的数字（站长 2026-11-08：「要秒开，不想任何卡顿，可以用缓存」）
// 以前每个访客自己拉 1 MB 的日志快照再读链算；现在服务器算好一份小结果：{ n 已抢注, day 近 24 小时, recent 最近 10 个, g: {tokenId: 创世编号}, at }
// KV nm:gen 缓存 30 秒内直接给；过期先给旧的、后台重算；边缘再缓存 15 秒。数字仍然全部来自链上真实注册记录。
import { RPCS } from "../../lib/teamlib.js";
import { banned } from "../../lib/ban.js";

const NAMES = "0xbc408e9d7350967e7247c917a086cb4ece0ed988", START = 18161697, T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
// 🔥 站长 2026-11-09 定：烧进黑洞地址的名字永久移出创世表——一年到期 + 宽限后被人重新注册，也不算创世、没有编号。编号留在 x 里（销毁核对 / 销毁记录要用）
const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", DEAD64 = "0x" + "000000000000000000000000000000000000dead".padStart(64, "0");
const GENESIS = 10000, STEP = 5000, MAX_RANGES = 40, FRESH = 30e3;
const HIDDEN = { "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6": 1, "0x89dd06754bb239b6c4c92bc47c8fa72889084e27": 1 }; // 站长钱包：不进「最近被抢注」
const HIDDEN_NAMES = { "加拿大局长": 1, "aiotc": 1, "四哥": 1, "觉醒人生": 1 };
const json = (o, extra) => new Response(JSON.stringify(o), { headers: Object.assign({ "content-type": "application/json", "cache-control": "public, max-age=15" }, extra || {}) });
const word = (r, i) => r.slice(2 + i * 64, 2 + (i + 1) * 64);
function decStr(r) { try { const off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2); return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)))); } catch (e) { return ""; } }
async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try { const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); const j = await r.json(); if (j.result !== undefined) return j.result; err = new Error((j.error && j.error.message) || "rpc"); } catch (e) { err = e; }
  }
  throw err;
}
async function batch(calls) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try { const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: c[0], params: c[1] }))) }); const j = await r.json(); if (!Array.isArray(j)) throw new Error("rpc"); const out = []; j.forEach((x) => { out[x.id] = x.result; }); if (out.some((x) => x === undefined)) throw new Error("缺结果"); return out; } catch (e) { err = e; }
  }
  throw err;
}
// 注册日志：和 /api/name-logs 共用同一份 KV 快照（nmlogs:<合约>:a15b6603），只补最新的块
async function regLogs(kv) {
  const key = "nmlogs:" + NAMES + ":" + T_REG.slice(2, 10);
  const c = (await kv.get(key, "json")) || { to: START - 1, l: [] };
  const latest = parseInt(await rpc("eth_blockNumber", []), 16), ranges = [];
  for (let b = c.to + 1; b <= latest && ranges.length < MAX_RANGES; b += STEP) ranges.push([b, Math.min(latest, b + STEP - 1)]);
  if (ranges.length) {
    for (let i = 0; i < ranges.length; i += 4) {
      const got = await Promise.all(ranges.slice(i, i + 4).map((r) => rpc("eth_getLogs", [{ address: NAMES, fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16), topics: [T_REG] }])));
      got.forEach((x) => x.forEach((l) => c.l.push([parseInt(l.blockNumber, 16), l.topics, l.data])));
    }
    c.to = ranges[ranges.length - 1][1];
    await kv.put(key, JSON.stringify(c));
  }
  return { l: c.l, latest };
}
async function build(kv) {
  const { l, latest } = await regLogs(kv);
  const seen = {}, list = [], g = {};
  for (const x of l) { const id = x[1][1]; if (!seen[id] && BigInt("0x" + x[2].slice(66, 130)) > 0n && list.length < GENESIS) { seen[id] = 1; list.push(x); g[id.slice(2)] = list.length; } }
  const last = list.filter((x) => !HIDDEN["0x" + x[1][2].slice(26)]).slice(-10).reverse();
  const t = await batch([["eth_getBlockByNumber", ["latest", false]]].concat(last.map((x) => ["eth_getBlockByNumber", ["0x" + x[0].toString(16), false]])));
  const now = parseInt(t[0].timestamp, 16), head = parseInt(t[0].number, 16);
  const spb = last.length && head > last[0][0] ? Math.max(0.5, (now - parseInt(t[1].timestamp, 16)) / (head - last[0][0])) : 2;
  const from = head - Math.floor(86400 / spb), day = list.filter((x) => x[0] >= from).length;
  const recent = last.map((x, i) => ({ nm: decStr(x[2]), ago: now - parseInt(t[i + 1].timestamp, 16), no: list.indexOf(x) + 1 })).filter((r) => r.nm && !HIDDEN_NAMES[r.nm] && !banned(r.nm));
  const xf = (await kv.get("nmlogs:" + NAMES + ":" + T_XFER.slice(2, 10), "json")) || { l: [] }, x = {};
  for (const t of xf.l) if (t[1] && t[1][2] && t[1][2].toLowerCase() === DEAD64 && t[1][3]) { const k = t[1][3].toLowerCase().slice(2); if (g[k]) { x[k] = g[k]; delete g[k]; } }
  return { n: list.length, day, recent, g, x, burned: Object.keys(x).length, at: Date.now(), latest };
}
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/name-genesis");
  const hit = await cache.match(ck); if (hit) return hit;
  let cur = await kv.get("nm:gen", "json");
  const store = (o) => kv.put("nm:gen", JSON.stringify(o), { expirationTtl: 3600 }).catch(() => {});
  if (!cur) { cur = await build(kv); ctx.waitUntil(store(cur)); }
  else if (Date.now() - cur.at > FRESH) ctx.waitUntil(build(kv).then(store).catch(() => {})); // 先给旧的，后台重算
  const res = json(cur);
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
