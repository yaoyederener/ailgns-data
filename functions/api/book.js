// OTC 订单簿快照：GET ?m=ailgns|lgns|plgns|glgns[&fresh=1] → { at, from, orders: getOrders 原始返回, reserves: DEX 池子 getReserves 原始返回 }
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
  // 点对点借款合约（AilgnsLoanEscrow）：读取函数是 loansCount / getLoans；pair 用来给页面算抵押品现值参考
  lend_old: { otc: "0x8d84d678d195e770caad263d1c37967ec796165c", pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" }, // 已下架的旧借款合约，只为让旧单能撤 / 还
  lend_ailgns: { otc: "0x242ab392571d325d814a48892ac16115a6d285dc", pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" },
  lend_lgns: { otc: "0x439cb33e9c5d7a26dd1fa503efe6fd3033ac173b", pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" },
  lend_glgns: { otc: "0x00e674bb1559557966a6c2244c36d12a63218a5f", pair: "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", rpcs: RPCS, count: "0x9d11ed75", get: "0x86b20104" } // AWAKE NFT 卡牌托管（AwakeNftEscrow，订单结构不同但同样用 ordersCount/getOrders 读）；没有 DEX 池子
};
const COUNT = "0x35daa731", GET_ORDERS = "0x8f72fc77", RESERVES = "0x0902f1ac";
const MAX = 1000; // 和前端一样只读最近 1000 张
const STALE = 8000; // 缓存超过这么久就在后台刷新
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
const OLD_MK = { ailgns: 1, lgns: 1 }, OLD_STALE = 60000, OLD_FRESH = 10000, OLD_STEP = 500, OLD_MAX = 500;
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

async function refresh(m, key, k, fresh) {
  const [count, reserves] = await Promise.all([call(m, m.otc, m.count || COUNT), m.pair ? call(m, m.pair, RESERVES).catch(() => null) : null]);
  const n = Number(BigInt(count)), from = Math.max(0, n - MAX);
  const [orders, old] = await Promise.all([n ? call(m, m.otc, (m.get || GET_ORDERS) + u256(from) + u256(n - from)) : "0x", OLD_MK[k] && !m.get ? oldOpen(m, k, from, fresh ? OLD_FRESH : OLD_STALE).catch(() => []) : null]);
  const at = Date.now(), body = JSON.stringify(old ? { at, from, orders, reserves, old } : { at, from, orders, reserves });
  await caches.default.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", "x-at": String(at) } }));
  return body;
}

// 老单补读：市场超过 1000 张单后，更早的单页面看不到（客户的单被挡在窗口外、撤不了）。?mine=0x… 把窗口之前属于这个地址、还开着的单找出来
async function olderMine(m, k, a, fresh) {
  const key = new Request("https://ailgns.dev/__mine/" + k + "/" + a);
  if (!fresh) { const hit = await caches.default.match(key); if (hit) return hit.text(); }
  const count = Number(BigInt(await call(m, m.otc, m.count || COUNT))), end = Math.max(0, count - MAX), me = a.slice(2).padStart(64, "0"), older = [];
  for (let s = 0; s < end; s += 250) {
    const c = Math.min(250, end - s), r = await call(m, m.otc, (m.get || GET_ORDERS) + u256(s) + u256(c));
    const w = (r || "0x").slice(2).match(/.{64}/g) || [], n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0;
    for (let i = 0; i < n; i++) { const o = w.slice(2 + i * 7, 9 + i * 7); if (o.length === 7 && o[0] === me && o[2].endsWith("1")) older.push({ id: s + i, o }); }
  }
  const body = JSON.stringify({ at: Date.now(), from: 0, older });
  await caches.default.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } }));
  return body;
}

const out = (body, state) => new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store", "x-book": state } });

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
  if (u.searchParams.get("fresh") !== "1") {
    const hit = await caches.default.match(key);
    if (hit) {
      if (Date.now() - Number(hit.headers.get("x-at") || 0) > STALE) ctx.waitUntil(refresh(m, key, k, false).catch(() => {}));
      return out(await hit.text(), "hit");
    }
  }
  try {
    return out(await refresh(m, key, k, u.searchParams.get("fresh") === "1"), "miss");
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 502 });
  }
}
