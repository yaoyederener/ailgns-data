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
  nft: { otc: "", pair: null, rpcs: RPCS } // AWAKE NFT 卡牌托管（AwakeNftEscrow，订单结构不同但同样用 ordersCount/getOrders 读）；没有 DEX 池子
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

async function refresh(m, key) {
  const [count, reserves] = await Promise.all([call(m, m.otc, COUNT), m.pair ? call(m, m.pair, RESERVES).catch(() => null) : null]);
  const n = Number(BigInt(count)), from = Math.max(0, n - MAX);
  const orders = n ? await call(m, m.otc, GET_ORDERS + u256(from) + u256(n - from)) : "0x";
  const at = Date.now(), body = JSON.stringify({ at, from, orders, reserves });
  await caches.default.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", "x-at": String(at) } }));
  return body;
}

const out = (body, state) => new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store", "x-book": state } });

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), k = u.searchParams.get("m") || "ailgns";
  const m = Object.hasOwn(MARKETS, k) ? MARKETS[k] : null;
  if (!m || !m.otc) return new Response("bad market", { status: 400 });
  const key = new Request("https://ailgns.dev/__book/" + k);
  if (u.searchParams.get("fresh") !== "1") {
    const hit = await caches.default.match(key);
    if (hit) {
      if (Date.now() - Number(hit.headers.get("x-at") || 0) > STALE) ctx.waitUntil(refresh(m, key).catch(() => {}));
      return out(await hit.text(), "hit");
    }
  }
  try {
    return out(await refresh(m, key), "miss");
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 502 });
  }
}
