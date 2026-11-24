// OTC 订单簿快照：GET ?m=ailgns|lgns|plgns|glgns|lp|rm[&fresh=1] → { at, from, orders: getOrders 原始返回, reserves: DEX 池子 getReserves 原始返回 }
// 直接读链要先后两次调用（挂单数 → 挂单列表），国内打开要好几秒；这里在 Cloudflare 边缘缓存一份：
// 缓存超过 8 秒照样先返回旧的（秒开），同时后台去链上刷新；fresh=1（自己刚挂单 / 成交 / 撤单后）直接读链并更新缓存
import { RPCS } from "../../lib/teamlib.js";

const POLYGON_RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"];
const MARKETS = {
  ailgns: { otc: "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", rpcs: RPCS },
  lgns: { otc: "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818", pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", rpcs: RPCS },
  plgns: { otc: "0x4060f38d3e837843b69014d9f85ecfb3e29fa2db", pair: "0x882df4b0fb50a229c3b4124eb18c759911485bfb", rpcs: POLYGON_RPCS },
  glgns: { otc: "0x2b0ab121d60f823fffc4cef75af26055df388e2b", pair: "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", rpcs: RPCS },
  nft: { otc: "0x8c67912b3ed44f4512c2f22b7b2263f6659396ed", pair: null, rpcs: RPCS },
  lp: { otc: "0xfeeaa5f8a104836d15b492399b2ea587a41c4771", pair: null, rpcs: RPCS },
  rm: { otc: "0x0fddaa1a312699b2ae43e2b43d8f7595087e21d0", pair: "0x8cbabf4e076baaad295fd32b3249e7f9d812b9c5", rpcs: RPCS }, // RM（第三方项目的币）：参考价读 RM/USDT 池子，USDT 是 6 位小数，页面自己换算（otc.js qdec） // 官方 AiLGNS/LGNS 的 LP：DEX 上没有报价，参考价页面自己算（otc.js lpValue）
  // 点对点借款合约（AilgnsLoanEscrow）：读取函数是 loansCount / getLoans；pair 用来给页面算抵押品现值参考
  lend_old: { otc: "0x8d84d678d195e770caad263d1c37967ec796165c", pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" }, // 已下架的旧借款合约，只为让旧单能撤 / 还
  lend_ailgns: { otc: "0x242ab392571d325d814a48892ac16115a6d285dc", pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" },
  lend_lgns: { otc: "0x439cb33e9c5d7a26dd1fa503efe6fd3033ac173b", pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" },
  lend_glgns: { otc: "0x00e674bb1559557966a6c2244c36d12a63218a5f", pair: "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" } // AWAKE NFT 卡牌托管（AwakeNftEscrow，订单结构不同但同样用 ordersCount/getOrders 读）；没有 DEX 池子
};
const COUNT = "0x35daa731", GET_ORDERS = "0x8f72fc77", RESERVES = "0x0902f1ac";
const MAX = 1000; // 和前端一样只读最近 1000 张
/* 站长 2026-11-18：做市机器人的新买单「不能及时上架、看到」。以前：缓存 8 秒后才后台刷新，而且再旧的缓存也照发（这个机房几分钟没人来，第一个人看到的就是几分钟前的盘口）。
   现在：超过 3 秒就后台刷新；超过 15 秒的旧缓存不再发，当场现读一份（读链失败才退回用旧的）。回应里带 x-age（这份数据多少毫秒前读的），页面据此决定要不要马上再拿一次 */
const STALE = 3000; // 缓存超过这么久就在后台刷新
const MAX_STALE = 15000; // 缓存超过这么久就不发了，现读
const u256 = (v) => BigInt(v).toString(16).padStart(64, "0");

async function call(m, to, data) {
  let err;
  for (let k = 0; k < m.rpcs.length * 2; k++) {
    try {
      const r = await fetch(m.rpcs[k % m.rpcs.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}

// 工单 #282（2026-11-18）：盘口只读最近 1000 张，更早挂的单哪怕还有效也看不到、买家吃不到（当时 38 张卖单 41.5 枚）。
// oldOpen = 窗口之前「还开着、没过期、还有剩」的单，随盘口一起发给页面（字段 old）。只读链，不碰合约。
// 省事的办法：关掉 / 过期的单不会再活过来，所以每次只从「上次最早的那张有效老单」扫到窗口起点，不用从头扫；结果按机房缓存
// 工单 #351 / #356（2026-11-21）：卡牌市场也超过 1000 张了（1,378 张），客户 11 月挂的一张卡（#177，还没到期）被挡在窗口外——
//   「买入」里看不到、自己的挂单里也看不到、撤不了，以为卡丢了（其实一直在托管合约里）。卡牌市场也补上老单。
//   卡牌的订单是 6 个字（maker, sell, open, expiry, tokenId, price），没有「剩余数量」；过期但还开着的也要带上，卖家才能在页面上点「取回」
const OLD_MK = { ailgns: 1, lgns: 1, nft: 1 }, OLD_STALE = 60000, OLD_FRESH = 10000, OLD_STEP = 500, OLD_MAX = 500;
async function oldOpen(m, k, from, maxAge) {
  if (!from) return [];
  const key = new Request("https://ailgns.dev/__old/" + k);
  let prev = null;
  try { const hit = await caches.default.match(key); if (hit) prev = await hit.json(); } catch (e) { prev = null; }
  if (prev && !Array.isArray(prev.old)) prev = null;
  if (prev && prev.upto === from && Date.now() - prev.at < maxAge) return prev.old;
  try {
    let lo = 0;
    if (prev && prev.upto <= from) lo = prev.old.length ? Math.min(prev.old[0].id, prev.upto) : prev.upto;
    const jobs = [];
    for (let s = lo; s < from; s += OLD_STEP) jobs.push(call(m, m.otc, GET_ORDERS + u256(s) + u256(Math.min(OLD_STEP, from - s))).then((r) => [s, r]));
    const parts = await Promise.all(jobs), now = Date.now() / 1000;
    let old = [];
    for (const [s, r] of parts) {
      const w = (r || "0x").slice(2).match(/.{64}/g) || [], n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0;
      for (let i = 0; i < n; i++) {
        if (k === "nft") { const o = w.slice(2 + i * 6, 8 + i * 6); if (o.length === 6 && BigInt("0x" + o[2]) === 1n) old.push({ id: s + i, o }); continue; }
        const o = w.slice(2 + i * 7, 9 + i * 7);
        if (o.length === 7 && BigInt("0x" + o[2]) === 1n && Number(BigInt("0x" + o[3])) > now && BigInt("0x" + o[6]) > 0n) old.push({ id: s + i, o });
      }
    }
    old.sort((a, b) => a.id - b.id);
    if (old.length > OLD_MAX) old = old.slice(-OLD_MAX); /* 太多就只留最近的，免得盘口数据太大 */
    await caches.default.put(key, new Response(JSON.stringify({ at: Date.now(), upto: from, old }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } }));
    return old;
  } catch (e) { return prev ? prev.old.filter((x) => x.id < from) : []; } /* 这一轮没读成：先用上一轮的，绝不让盘口出错 */
}

function fnv(s) { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16).padStart(8, "0") + s.length.toString(36); }
async function refresh(m, key, k, fresh) {
  const [count, reserves] = await Promise.all([call(m, m.otc, m.count || COUNT), m.pair ? call(m, m.pair, RESERVES).catch(() => null) : null]);
  const n = Number(BigInt(count)), from = Math.max(0, n - MAX);
  const [orders, old] = await Promise.all([n ? call(m, m.otc, (m.get || GET_ORDERS) + u256(from) + u256(n - from)) : "0x", OLD_MK[k] && !m.get ? oldOpen(m, k, from, fresh ? OLD_FRESH : OLD_STALE).catch(() => []) : null]);
  /* h = 这份盘口里「挂单 + 老单」的指纹。页面下次带着 ?h= 来问，挂单没变就只回 {same:1, reserves}（两百来个字节），不用再发 46 万字。
     池子余额（reserves）不算进指纹：DEX 上几秒就有人交易，算进去就次次都「变了」；它单独放在回应里，页面照样拿到最新市价 */
  const h = fnv(from + "|" + orders + "|" + (old ? old.map((x) => x.id + ":" + x.o[x.o.length - 1]).join(",") : ""));
  const at = Date.now(), body = JSON.stringify(old ? { at, from, orders, reserves, old, h } : { at, from, orders, reserves, h });
  await caches.default.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", "x-at": String(at), "x-h": h, "x-rsv": /^0x[0-9a-f]{1,400}$/i.test(reserves || "") ? reserves : "" } }));
  return { body, h, reserves };
}

// 老单补读：市场超过 1000 张单后，更早的单页面看不到（客户的单被挡在窗口外、撤不了）。?mine=0x… 把窗口之前属于这个地址、还开着的单找出来
async function olderMine(m, k, a, fresh) {
  const key = new Request("https://ailgns.dev/__mine/" + k + "/" + a);
  if (!fresh) { const hit = await caches.default.match(key); if (hit) return hit.text(); }
  const count = Number(BigInt(await call(m, m.otc, m.count || COUNT))), end = Math.max(0, count - MAX), me = a.slice(2).padStart(64, "0"), older = [];
  /* 2026-11-19：以前 250 张一段、一段读完再读下一段。LGNS 市场 1 万多张单要读 41 段，实测冷启动 95 秒——客户连上钱包后要等这么久才看到「我的挂单」和挂单簿里「我的」单。
     改成 1000 张一段、所有段同时读（和读窗口那一次一样大），内容不变 */
  const jobs = [];
  for (let s = 0; s < end; s += 1000) jobs.push(call(m, m.otc, (m.get || GET_ORDERS) + u256(s) + u256(Math.min(1000, end - s))).then((r) => [s, r]));
  for (const [s, r] of await Promise.all(jobs)) {
    const w = (r || "0x").slice(2).match(/.{64}/g) || [], n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0;
    for (let i = 0; i < n; i++) { const o = w.slice(2 + i * 7, 9 + i * 7); if (o.length === 7 && o[0] === me && o[2].endsWith("1")) older.push({ id: s + i, o }); }
  }
  older.sort((a, b) => a.id - b.id);
  const body = JSON.stringify({ at: Date.now(), from: 0, older });
  await caches.default.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } }));
  return body;
}

const out = (body, state, age) => new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store", "x-book": state, "x-age": String(Math.max(0, Math.round(age || 0))) } });

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), k = u.searchParams.get("m") || "ailgns";
  const m = Object.hasOwn(MARKETS, k) ? MARKETS[k] : null;
  if (!m || !m.otc) return new Response("bad market", { status: 400 });
  const key = new Request("https://ailgns.dev/__book/" + k);
  const mine = String(u.searchParams.get("mine") || "").toLowerCase();
  if (mine) {
    if (!/^0x[0-9a-f]{40}$/.test(mine) || m.get) return Response.json({ older: [] });
    try { return out(await olderMine(m, k, mine, u.searchParams.get("fresh") === "1"), "mine"); } catch (e) { return Response.json({ older: [], error: String((e && e.message) || e) }); }
  }
  let old = null, oldAge = 0;
  const want = String(u.searchParams.get("h") || ""), same = (age, rsv) => out(JSON.stringify(rsv ? { same: 1, reserves: rsv } : { same: 1 }), "same", age); /* 页面手里那份的指纹；一样就不重发 */
  if (u.searchParams.get("fresh") !== "1") {
    const hit = await caches.default.match(key);
    if (hit) {
      const age = Date.now() - Number(hit.headers.get("x-at") || 0);
      if (age <= MAX_STALE) {
        if (age > STALE) ctx.waitUntil(refresh(m, key, k, false).catch(() => {}));
        if (want && want === hit.headers.get("x-h")) return same(age, hit.headers.get("x-rsv") || "");
        return out(await hit.text(), "hit", age);
      }
      old = hit; oldAge = age; /* 太旧：先不发，下面现读；读不成再用它 */
    }
  }
  try {
    const r = await refresh(m, key, k, u.searchParams.get("fresh") === "1");
    if (want && want === r.h && u.searchParams.get("fresh") !== "1") return same(0, r.reserves || "");
    return out(r.body, "miss", 0);
  } catch (e) {
    if (old) return out(await old.text(), "stale", oldAge);
    return Response.json({ error: String((e && e.message) || e) }, { status: 502 });
  }
}
