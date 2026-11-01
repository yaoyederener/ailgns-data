// 会员按地址开通：不用连钱包、不用签名。先填会员地址下单，网站给一个带零头的专属金额，用任何钱包转这个精确金额就认到这个地址上
// GET  ?addr=0x…[&txs=0x…,0x…]        → { payments: [按订单认到这个地址的付款], giftPayer, giftedTo, claimed: [txs 里已被订单认领的], otcTrader: 在 OTC 单笔成交满 50 DAI 的记录（送初级 VIP） }
// POST { action: "order", target, method, amount } → 生成订单 { id, amount, units, chain, token, receiver, expires }
// POST { action: "check", id, tx? }    → 查这个订单有没有到账，到账就记到会员地址上 { paid, payment, target }
// KV：mord:<id> 订单（2 天过期）；mamt:<method>:<units> 金额占用；mem:<地址> 付款列表；memtx:<tx> 已认领的交易
import { RPCS } from "../../lib/teamlib.js";

const RECEIVER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const POLY_RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"];
const METHODS = {
  lgns: { chain: "anubis", token: "0x4d1d808a081fdac440703b3765fc61f8028c06b8", dec: 9, digits: 0 },
  ailgns: { chain: "anubis", token: "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", dec: 18, digits: 4 },
  lgns_poly: { chain: "polygon", token: "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01", dec: 9, digits: 0 },
  dai: { chain: "polygon", token: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", dec: 18, digits: 2 }
};
const TAG = 4; // 专属零头：在正常显示的小数位后面再加 4 位
const ORDER_TTL = 2 * 86400;
const STEP = { anubis: 5000, polygon: 3000 }; // 每次 eth_getLogs 查多少个块
const MAX_STEPS = 8; // 一次检查最多查几段，没查完下次接着查

const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const isTx = (h) => /^0x[0-9a-f]{64}$/.test(h || "");

async function rpc(chain, method, params) {
  const list = chain === "polygon" ? POLY_RPCS : RPCS;
  for (let k = 0; k < list.length * 2; k++) {
    try {
      const r = await fetch(list[k % list.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (k === list.length * 2 - 1) throw e; }
  }
}
const hex = (n) => "0x" + n.toString(16);
const pad = (a) => "0x" + a.slice(2).padStart(64, "0");

// 把十进制字符串换成最小单位（BigInt）
function toUnits(str, dec) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(str || ""));
  if (!m) return null;
  return BigInt(m[1]) * 10n ** BigInt(dec) + BigInt(((m[2] || "") + "0".repeat(dec)).slice(0, dec));
}
function fromUnits(u, dec, places) {
  const s = u.toString().padStart(dec + 1, "0"), int = s.slice(0, -dec), frac = s.slice(-dec).slice(0, places);
  return places ? int + "." + frac : int;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const addr = (u.searchParams.get("addr") || "").toLowerCase();
  if (!isAddr(addr)) return new Response("bad address", { status: 400 });
  const txs = (u.searchParams.get("txs") || "").toLowerCase().split(",").filter(isTx).slice(0, 50);
  const [payments, giftPayer, giftedTo, otcTrader, ...claims] = await Promise.all([
    kv.get("mem:" + addr, "json"), kv.get("giftto:" + addr), kv.get("gift:" + addr), kv.get("otcq:" + addr, "json"), ...txs.map((t) => kv.get("memtx:" + t))
  ]);
  // 这个地址自己转出去的付款，如果是给别的地址下的订单付的，就不算它自己的
  const claimed = txs.filter((t, i) => claims[i] && claims[i] !== addr);
  return Response.json({ payments: payments || [], giftPayer, giftedTo, claimed, otcTrader }, { headers: { "cache-control": "no-store" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b;
  try { b = await ctx.request.json(); } catch (e) { return Response.json({ error: "bad json" }, { status: 400 }); }
  try {
    if (b.action === "order") return await order(kv, b);
    if (b.action === "check") return await check(kv, b);
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 502 });
  }
  return Response.json({ error: "bad action" }, { status: 400 });
}

async function order(kv, b) {
  const target = String(b.target || "").toLowerCase(), m = METHODS[b.method];
  if (!isAddr(target)) return Response.json({ error: "会员地址格式不对" }, { status: 400 });
  if (!m) return Response.json({ error: "不支持这种付款方式" }, { status: 400 });
  const step = 10n ** BigInt(m.dec - m.digits), tag = 10n ** BigInt(m.dec - m.digits - TAG);
  const base = toUnits(b.amount, m.dec);
  if (!base || base <= 0n) return Response.json({ error: "金额不对" }, { status: 400 });
  const rounded = (base + step - 1n) / step * step; // 先向上取整到正常显示的位数
  const start = parseInt(await rpc(m.chain, "eth_blockNumber", []), 16);
  for (let i = 0; i < 20; i++) {
    const k = BigInt(1 + Math.floor(Math.random() * 9999)), units = rounded + k * tag;
    const key = "mamt:" + b.method + ":" + units;
    if (await kv.get(key)) continue;
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const o = { id, target, method: b.method, chain: m.chain, token: m.token, units: units.toString(), amount: fromUnits(units, m.dec, m.digits + TAG), start, scanned: start - 1, at: Date.now(), expires: Date.now() + ORDER_TTL * 1000 };
    await kv.put(key, id, { expirationTtl: ORDER_TTL });
    await kv.put("mord:" + id, JSON.stringify(o), { expirationTtl: ORDER_TTL });
    return Response.json({ id, target, method: b.method, chain: m.chain, token: m.token, receiver: RECEIVER, amount: o.amount, units: o.units, expires: o.expires });
  }
  return Response.json({ error: "现在下单的人太多，请稍后再试" }, { status: 503 });
}

// 在回执里找「转到收款地址、金额正好等于订单金额」的那笔
function matchLog(r, o) {
  return (r.logs || []).filter((l) => l.address.toLowerCase() === o.token && l.topics[0] === TRANSFER && l.topics[2] && "0x" + l.topics[2].slice(26) === RECEIVER && BigInt(l.data) === BigInt(o.units))[0];
}

async function credit(kv, o, txHash, block, from) {
  const tx = txHash.toLowerCase();
  const owner = await kv.get("memtx:" + tx);
  if (owner && owner !== o.target) return null;
  if (!owner) await kv.put("memtx:" + tx, o.target);
  const list = (await kv.get("mem:" + o.target, "json")) || [];
  const m = METHODS[o.method];
  const p = { method: o.method, chain: o.chain, tx, block, from, paid: Number(BigInt(o.units)) / 10 ** m.dec, order: o.id, at: Date.now() };
  if (!list.some((x) => x.tx === tx)) list.push(p);
  await kv.put("mem:" + o.target, JSON.stringify(list));
  o.paid = p;
  await kv.put("mord:" + o.id, JSON.stringify(o), { expirationTtl: 30 * 86400 }); // 付过的订单多留一阵，方便查
  await kv.delete("mamt:" + o.method + ":" + o.units);
  return p;
}

async function check(kv, b) {
  const o = await kv.get("mord:" + String(b.id || "").replace(/[^0-9a-f]/g, ""), "json");
  if (!o) return Response.json({ error: "订单不存在或已过期，请重新下单" }, { status: 404 });
  if (o.paid) return Response.json({ paid: true, payment: o.paid, target: o.target });
  const tx = String(b.tx || "").toLowerCase();
  if (isTx(tx)) { // 网页里用钱包付的：直接按交易哈希核对
    const r = await rpc(o.chain, "eth_getTransactionReceipt", [tx]);
    const log = r && r.status === "0x1" && matchLog(r, o);
    if (log && parseInt(r.blockNumber, 16) >= o.start) {
      const p = await credit(kv, o, tx, parseInt(r.blockNumber, 16), "0x" + log.topics[1].slice(26));
      if (p) return Response.json({ paid: true, payment: p, target: o.target });
    }
  }
  // 手动转账的：从下单那个块开始往后查转到收款地址的转账，找金额一模一样的
  const latest = parseInt(await rpc(o.chain, "eth_blockNumber", []), 16);
  let from = o.scanned + 1;
  for (let i = 0; i < MAX_STEPS && from <= latest; i++) {
    const to = Math.min(latest, from + STEP[o.chain] - 1);
    const logs = await rpc(o.chain, "eth_getLogs", [{ address: o.token, fromBlock: hex(from), toBlock: hex(to), topics: [TRANSFER, null, pad(RECEIVER)] }]);
    const hit = (logs || []).filter((l) => BigInt(l.data) === BigInt(o.units))[0];
    if (hit) {
      const p = await credit(kv, o, hit.transactionHash, parseInt(hit.blockNumber, 16), "0x" + hit.topics[1].slice(26));
      if (p) return Response.json({ paid: true, payment: p, target: o.target });
    }
    o.scanned = to;
    from = to + 1;
  }
  await kv.put("mord:" + o.id, JSON.stringify(o), { expirationTtl: Math.max(60, Math.round((o.expires - Date.now()) / 1000)) });
  return Response.json({ paid: false, scanned: o.scanned, latest, expires: o.expires });
}
