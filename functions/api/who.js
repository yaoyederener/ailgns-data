// 👤 地址 → 名字（批量）。GET ?a=0x…,0x…（一次最多 80 个）→ { n: { 地址: { p: [".ailgns 主名字", ".lgns 主名字"], o: [名下的域名，最多 5 个] } }, at }
// 为什么要有（站长 2026-11-21：「otc 有时候很卡，有时候点不动」）：以前每部手机自己算「谁叫什么名字」——
//   每次打开页面、之后每 5 分钟，都把两个域名合约从部署到现在的全部记录下载一遍（2026-11-21 实测 17 个请求、解开后 6.4MB，还在随注册量变大），
//   下载和解析的这十几秒里页面发卡、点不动。现在页面只问「这几个地址叫什么」，由服务器答：
//   · 主名字：一批 eth_call 读两个合约的 nameOf（当场读链，准）；
//   · 没设主名字的：用他名下的域名代替。「每个名字现在归谁」服务器用现成的日志快照（/api/name-logs 的 Transfer + NameRegistered）算好，
//     每个机房 90 秒算一次，和页面以前的算法同一个规矩：挂在域名市场里的仍算卖家的；先 .ailgns 后 .lgns；先拿到的排前面。
// 页面那边（scan.js）：这个接口答不上来就退回老办法自己读，名字不会因此显示不出来。隐藏名单仍由页面自己过滤。
// 只读公开数据。整个回答按「这一批地址」在边缘缓存 60 秒。
import { RPCS } from "../../lib/teamlib.js";

const NAMES = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", lgns: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3" };
const ESC = { "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e": 1, "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d": 1 }; // 域名市场的托管合约
const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const SEL_NAMEOF = "0xf5c57382", MAX = 80, IDX_TTL = 90000;
const word = (r, i) => r.slice(2 + i * 64, 2 + (i + 1) * 64);
export function decStr(r) { try { const off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2); return len > 0 && len < 200 ? new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)))) : ""; } catch (e) { return ""; } }

// 纯计算（方便单独测）：两个合约的 Transfer / NameRegistered 快照 → { 地址: [名下的域名，最多 5 个] }
// snaps = { ailgns: { xf: [[区块, topics, data]…], rg: […] }, lgns: {…} }
export function ownedIndex(snaps) {
  const by = {};
  for (const t of ["ailgns", "lgns"]) {
    const s = snaps[t] || {}, cur = {}, label = {};
    (s.xf || []).slice().sort((p, q) => p[0] - q[0]).forEach((l) => {
      const tp = l[1]; if (!tp || !tp[3] || !tp[2] || !tp[1]) return;
      const to = "0x" + tp[2].slice(26).toLowerCase(), from = "0x" + tp[1].slice(26).toLowerCase();
      cur[tp[3].toLowerCase()] = { to: ESC[to] ? from : to, b: l[0] };
    });
    (s.rg || []).forEach((l) => { if (l[1] && l[1][1]) label[l[1][1].toLowerCase()] = decStr(l[2]); });
    for (const id of Object.keys(cur)) { const o = cur[id], n = label[id]; if (n) (by[o.to] = by[o.to] || []).push({ k: t === "ailgns" ? 0 : 1, b: o.b, n: n + "." + t }); }
  }
  const out = {};
  for (const a of Object.keys(by)) out[a] = by[a].sort((p, q) => p.k - q.k || p.b - q.b).slice(0, 5).map((x) => x.n);
  return out;
}

let memo = null, memoAt = 0;
async function index(origin, ctx) {
  if (memo && Date.now() - memoAt < IDX_TTL) return memo;
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/who/_idx?v=1");
  try { const hit = await cache.match(ck); if (hit) { memo = await hit.json(); memoAt = Date.now(); return memo; } } catch (e) { /* 没缓存就现算 */ }
  // 快照先问自己这个站；拿不到（预览站没有数据库）再问正式站，都是公开数据
  const one = (o, a, t) => fetch(o + "/api/name-logs?a=" + a + "&t=" + t).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.l && j.l.length ? j.l : null)).catch(() => null);
  const get = (a, t) => one(origin, a, t).then((l) => l || (origin === "https://ailgns.dev" ? null : one("https://ailgns.dev", a, t)));
  const [ax, ar, lx, lr] = await Promise.all([get(NAMES.ailgns, T_XFER), get(NAMES.ailgns, T_REG), get(NAMES.lgns, T_XFER), get(NAMES.lgns, T_REG)]);
  if (!ax || !ar) return null; // .ailgns 的快照都拿不到：这次答不了，让页面走老办法
  const idx = ownedIndex({ ailgns: { xf: ax, rg: ar }, lgns: { xf: lx || [], rg: lr || [] } });
  memo = idx; memoAt = Date.now();
  try { ctx.waitUntil(cache.put(ck, Response.json(idx, { headers: { "cache-control": "public, max-age=90" } }))); } catch (e) { /* 存不了缓存不影响这次回答 */ }
  return idx;
}
async function primaries(addrs) {
  const calls = [];
  addrs.forEach((a, i) => { ["ailgns", "lgns"].forEach((t, k) => calls.push({ jsonrpc: "2.0", id: i * 2 + k, method: "eth_call", params: [{ to: NAMES[t], data: SEL_NAMEOF + "0".repeat(24) + a.slice(2) }, "latest"] })); });
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const j = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls) }).then((r) => r.json());
      if (!Array.isArray(j) || j.length !== calls.length) throw new Error("rpc");
      const out = addrs.map(() => ["", ""]);
      for (const x of j) { if (!x || x.error || typeof x.result !== "string") throw new Error("rpc"); const n = decStr(x.result); if (n) out[Math.floor(x.id / 2)][x.id % 2] = n + (x.id % 2 ? ".lgns" : ".ailgns"); }
      return out;
    } catch (e) { err = e; }
  }
  throw err;
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url);
  const addrs = Array.from(new Set((u.searchParams.get("a") || "").toLowerCase().split(",").filter((x) => /^0x[0-9a-f]{40}$/.test(x)))).sort().slice(0, MAX);
  if (!addrs.length) return Response.json({ error: "bad" }, { status: 400 });
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/who?a=" + addrs.join(","));
  try { const hit = await cache.match(ck); if (hit) return hit; } catch (e) { /* 没缓存就现查 */ }
  let pr, idx;
  try { [pr, idx] = await Promise.all([primaries(addrs), index(u.origin, ctx)]); } catch (e) { return Response.json({ error: "busy" }, { status: 503, headers: { "cache-control": "no-store" } }); }
  if (!idx) return Response.json({ error: "busy" }, { status: 503, headers: { "cache-control": "no-store" } });
  const n = {};
  addrs.forEach((a, i) => { n[a] = { p: pr[i], o: idx[a] || [] }; });
  const res = Response.json({ n, at: Date.now() }, { headers: { "cache-control": "public, max-age=60" } });
  try { ctx.waitUntil(cache.put(ck, res.clone())); } catch (e) { /* 存不了缓存不影响返回 */ }
  return res;
}
