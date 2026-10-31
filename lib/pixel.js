// LGNS 像素墙：100×100 格子，花 LGNS 涂色。只消耗、不赢币：涂色得到的只是墙上的格子和排行榜名次，没有任何币或有价值的东西返还
// 付款转进收款合约 LgnsPixelSink：80% 销毁、20% 转原收款钱包（再按 30/40/30 分）；收款合约还没部署时，付款直接转进销毁地址（100% 销毁）
// Anubis 链和 Polygon 链的 LGNS 都能付，一格的价格（LGNS 个数）一样，两条链的付款涂在同一面墙上
// 付款方式：钱包里把 LGNS 转到收款地址，转账数据末尾附上「PX + 这次要涂的格子的 sha256」，
// 后台核对链上转账（付款人、金额、附带的哈希）后才涂上，所以付款只能用来涂当初选好的那些格子
import { RPCS } from "./teamlib.js";

export const SIZE = 100;
export const BURN = "0x000000000000000000000000000000000000dead";
// 每条链：LGNS（都是 9 位小数）、收款合约（空着就直接转进销毁地址）、节点
export const CHAINS = {
  anubis: { lgns: "0x4d1d808a081fdac440703b3765fc61f8028c06b8", sink: "0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c", rpcs: RPCS }, // LgnsPixelSink，部署区块 17937871
  polygon: { lgns: "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01", sink: "0x2b0ab121d60f823fffc4cef75af26055df388e2b", rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"] } // LgnsPixelSinkPolygon，部署区块 96512223
};
for (const c of Object.values(CHAINS)) c.payTo = c.sink || BURN;
export const LGNS = CHAINS.anubis.lgns, SINK = CHAINS.anubis.sink, PAY_TO = CHAINS.anubis.payTo;
const BURN_SHARE = (to) => (to === BURN ? 1 : 0.8); // 付款里有多少比例被销毁
export const UNIT = 5; // 第 k 次涂同一格要 5k LGNS：空格 5，被涂过 1 次的 10，以此类推
export const MAX_PX = 200; // 一笔最多涂多少格
export const COLORS = 16;
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RACE = 600; // 付款前 10 分钟内被别人抢先涂了的格子，照样按付款时的价格涂上（两人同时下单）
const MAX_AGE = 3 * 86400; // 3 天前的转账不再受理
export const price = (n) => UNIT * (n + 1);

export async function rpc(method, params, chain = "anubis") {
  const RPCS = CHAINS[chain].rpcs;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (k === RPCS.length * 2 - 1) throw e; }
  }
}

// 墙的状态：c = 每格颜色（10000 个字符，"." 是空格，0-f 是颜色），n = 每格被涂过几次，o = 每格现在是谁的，t = 每格最后涂的时间
// s：总花费 / 总销毁（LGNS）、涂过的格数、受理的转账笔数；top：每个地址累计花了多少
export function emptyBoard() {
  return { c: ".".repeat(SIZE * SIZE), n: {}, o: {}, t: {}, s: { spent: 0, burned: 0, paints: 0, txs: 0 }, top: {} };
}
export async function loadBoard(kv) {
  return (await kv.get("px:board", "json")) || emptyBoard();
}

// 一笔已受理的转账涂到墙上（apply 和重建共用，保证结果一样）
function paint(b, ev) {
  const c = b.c.split("");
  for (const [i, col] of ev.px) {
    c[i] = col.toString(16);
    b.n[i] = (b.n[i] || 0) + 1;
    b.o[i] = ev.from;
    b.t[i] = ev.ts;
  }
  b.c = c.join("");
  b.s.spent = (b.s.spent || 0) + ev.amount;
  b.s.burned += ev.amount * BURN_SHARE(ev.to || BURN);
  b.s.paints += ev.px.length;
  b.s.txs += 1;
  b.top[ev.from] = (b.top[ev.from] || 0) + ev.amount;
}

async function sha256hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// 受理一笔付款：px = [[格子编号, 颜色, 付款时这一格被涂过几次], ...]；chain = 付款的链
export async function submit(kv, tx, px, chain = "anubis") {
  const C = Object.hasOwn(CHAINS, chain) ? CHAINS[chain] : null;
  if (!C) throw new Error("不支持这条链");
  tx = String(tx || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new Error("交易哈希不对");
  const done = await kv.get("pxtx:" + tx, "json");
  if (done) return { ok: true, again: true, applied: done.px.length, skipped: done.skipped || 0 };
  if (!Array.isArray(px) || !px.length || px.length > MAX_PX) throw new Error("格子数量不对（一次 1–" + MAX_PX + " 格）");
  const seen = new Set();
  for (const p of px) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isInteger)) throw new Error("格子数据不对");
    if (p[0] < 0 || p[0] >= SIZE * SIZE || p[1] < 0 || p[1] >= COLORS || p[2] < 0 || seen.has(p[0])) throw new Error("格子数据不对");
    seen.add(p[0]);
  }
  const [txo, rc] = await Promise.all([rpc("eth_getTransactionByHash", [tx], chain), rpc("eth_getTransactionReceipt", [tx], chain)]);
  if (!txo || !rc) throw new Error("链上还查不到这笔交易，稍等几秒再试");
  if (rc.status !== "0x1") throw new Error("这笔转账在链上失败了");
  // 转账数据：transfer(收款地址, 金额) + "5058"（PX）+ 这批格子的 sha256
  const input = String(txo.input || "").toLowerCase(), hash = await sha256hex(JSON.stringify(px));
  if (String(txo.to || "").toLowerCase() !== C.lgns || input.slice(0, 10) !== "0xa9059cbb" || input.slice(138) !== "5058" + hash) throw new Error("这笔交易不是这批格子的付款");
  const from = String(txo.from).toLowerCase();
  let paid = 0n;
  for (const l of rc.logs) {
    if (l.address.toLowerCase() === C.lgns && l.topics[0] === TRANSFER && "0x" + l.topics[1].slice(26) === from && "0x" + l.topics[2].slice(26) === C.payTo) paid += BigInt(l.data);
  }
  const need = px.reduce((a, p) => a + price(p[2]), 0);
  if (paid < BigInt(need) * 10n ** 9n) throw new Error("付款不够：需要 " + need + " LGNS");
  const blk = await rpc("eth_getBlockByNumber", [rc.blockNumber, false], chain), ts = parseInt(blk.timestamp, 16);
  if (Date.now() / 1000 - ts > MAX_AGE) throw new Error("这笔付款太久了（超过 3 天），不能再用");

  const b = await loadBoard(kv), ok = [];
  for (const [i, col, n] of px) {
    const cur = b.n[i] || 0;
    // 付款时看到的次数就是现在的次数，或者是付款前 10 分钟内被别人抢先涂了（同时下单），都照样涂上
    if (n === cur || (n < cur && (b.t[i] || 0) >= ts - RACE)) ok.push([i, col]);
  }
  const ev = { from, chain, to: C.payTo, ts, block: parseInt(rc.blockNumber, 16), amount: Number(paid / 10n ** 9n), px: ok, skipped: px.length - ok.length };
  await kv.put("pxtx:" + tx, JSON.stringify(ev)); // 先记转账（重建墙时以它为准），再更新墙
  paint(b, ev);
  await kv.put("px:board", JSON.stringify(b));
  return { ok: true, applied: ok.length, skipped: ev.skipped };
}

// KV 同时写可能互相覆盖：受理过的转账数比墙上记的多，就按转账记录从头重建一遍（定时任务每 5 分钟检查）
export async function rebuildIfNeeded(kv) {
  const keys = [];
  let cursor;
  do {
    const r = await kv.list({ prefix: "pxtx:", cursor });
    keys.push(...r.keys.map((k) => k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  const b = await loadBoard(kv);
  if (keys.length === b.s.txs) return { txs: keys.length, rebuilt: false };
  const evs = (await Promise.all(keys.map((k) => kv.get(k, "json")))).filter(Boolean).sort((x, y) => x.ts - y.ts || x.block - y.block);
  const nb = emptyBoard();
  for (const ev of evs) paint(nb, ev);
  await kv.put("px:board", JSON.stringify(nb));
  return { txs: keys.length, rebuilt: true };
}
