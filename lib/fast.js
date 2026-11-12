// ⚡ 极速预言家：只读算账（站长 2026-11-12 定稿）。和机器人 monita/fast_oracle.py 是同一套规则，改一边必须改另一边。
//   一期 10 分钟，整点对齐；期号 = 区块时间戳 // 600；开奖 = 本期结束后第一个区块的哈希 % 10。
//   票 = 上线之后新注册的纯数字 .ailgns 域名，付多少 DAI 就是多少票，记在付款钱包上；续费不算。
//   下注 = 钱包给极速资金池转 0 个 DAI，交易数据末尾带「ailgns-fast:数字:票数」；超过剩余按剩余算。
//   每张下注的票带 0.9 DAI 进本期奖池，猜中的按票数平分；没人中整池滚到下一期。
//   发奖 = 机器人用极速资金池钱包转 AiLGNS，交易数据末尾带「ailgns-fast-pay:期号」；这里只读这条链上记录来显示「已发」。
// 这里不发任何交易、不碰任何私钥。
import { RPCS } from "./teamlib.js";

export const FAST_POOL = "0x8610bf581b1c10cb7d372f93b8cdcde382a7c1d1";
export const FAST_START = null; // 上线区块。上线那天填；没填 = 还没开始（正式站不开放，preview 用最近 6 小时试算）
export const ROUND = 600, CONFIRM = 20, TRIAL_BLOCKS = 21600, PREFIX = "ailgns-fast:", PAY_PREFIX = "ailgns-fast-pay:";
const DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", NAMES = "0xbc408e9d7350967e7247c917a086cb4ece0ed988";
const PAID = "0x26c4308021cef5cdbc618fee8b61faf9de6b8f7e4e49fac43869dc1a26756408", REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const OWN = { "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6": 1, "0x89dd06754bb239b6c4c92bc47c8fa72889084e27": 1 }; // 站长自己付的不算票
const POT = 9n * 10n ** 17n, WEI = 10n ** 18n;
const hex = (n) => "0x" + n.toString(16), pad = (a) => "0x" + a.replace(/^0x/, "").toLowerCase().padStart(64, "0");

export async function batch(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += 40) {
    const part = calls.slice(i, i + 40);
    let err, got = null;
    for (let k = 0; k < RPCS.length * 2 && !got; k++) {
      try {
        const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(part.map((c, j) => ({ jsonrpc: "2.0", id: j, method: c[0], params: c[1] }))) });
        const j = await r.json();
        if (!Array.isArray(j) || j.length !== part.length) throw new Error("rpc");
        const res = new Array(part.length);
        for (const x of j) { if (x.error) throw new Error(x.error.message || "rpc"); res[x.id] = x.result; }
        got = res;
      } catch (e) { err = e; }
    }
    if (!got) throw err;
    out.push(...got);
  }
  return out;
}

function labelOf(data) {
  try {
    const h = data.slice(2), off = parseInt(h.slice(0, 64), 16) / 32, ln = parseInt(h.slice(off * 64, off * 64 + 64), 16);
    const b = new Uint8Array((h.slice((off + 1) * 64, (off + 1) * 64 + ln * 2).match(/../g) || []).map((x) => parseInt(x, 16)));
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch (e) { return ""; }
}
function memoOf(input, prefix) { // transfer(…) 后面附的字：以 prefix 开头就返回后面那段，否则 null
  if (!input || input.slice(0, 10) !== "0xa9059cbb" || input.length <= 138) return null;
  try {
    const b = new Uint8Array((input.slice(138).match(/../g) || []).map((x) => parseInt(x, 16)));
    const s = new TextDecoder("utf-8", { fatal: true }).decode(b);
    return s.indexOf(prefix) === 0 ? s.slice(prefix.length) : null;
  } catch (e) { return null; }
}
export function decodeBet(input) { // transfer(极速池, 0) 后面附的字 → [数字, 票数] 或 null
  const m = /^([0-9]):([1-9][0-9]{0,8})$/.exec(memoOf(input, PREFIX) || "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}
const lkey = (l) => [parseInt(l.blockNumber, 16), parseInt(l.logIndex, 16)];
// 从域名合约的一批日志里挑出【新注册的纯数字域名】（同一笔交易里 Paid 后面跟着 NameRegistered；续费只有 Paid，不算；站长自己付的不算）
function numericRegs(logs) {
  const ls = logs.slice().sort((x, y) => lkey(x)[0] - lkey(y)[0] || lkey(x)[1] - lkey(y)[1]), out = [], paid = {};
  for (const l of ls) {
    const tx = l.transactionHash;
    if (l.topics[0] === PAID) { paid[tx] = ["0x" + l.topics[1].slice(26).toLowerCase(), BigInt("0x" + l.data.slice(66, 130)), lkey(l)[1]]; continue; }
    if (l.topics[0] !== REG) continue;
    const p = paid[tx]; delete paid[tx];
    const lab = labelOf(l.data);
    if (!p || OWN[p[0]] || !/^[0-9]+$/.test(lab)) continue;
    out.push({ b: lkey(l)[0], i: lkey(l)[1], w: p[0], cost: p[1], lab, tx, pi: p[2] });
  }
  return out;
}
// 给日报 / 每日奖池用：这批日志里哪些 Paid 是极速预言家的票款（上线后新注册的纯数字 .ailgns）→ Set("交易:日志序号")。
// 这部分收入 90% 进极速池，不进每日奖池，所以每日奖池算「域名收入 × 70%」时要先减掉它。没上线时永远是空的。
export const FAST_REG_TOPIC = REG;
export function fastPaid(logs) {
  const out = new Set();
  if (!FAST_START) return out;
  for (const r of numericRegs(logs.filter((l) => String(l.address).toLowerCase() === NAMES))) if (r.b >= FAST_START) out.add(r.tx + ":" + r.pi);
  return out;
}

// 读一段区块里的新票和新下注
async function scan(a, b, blocks) {
  const calls = [];
  for (let s = a; s <= b; s += 5000) {
    const e = Math.min(b, s + 4999);
    calls.push(["eth_getLogs", [{ address: NAMES, fromBlock: hex(s), toBlock: hex(e), topics: [[PAID, REG]] }]]);
    calls.push(["eth_getLogs", [{ address: DAI, fromBlock: hex(s), toBlock: hex(e), topics: [TRANSFER, null, pad(FAST_POOL)] }]]);
    calls.push(["eth_getLogs", [{ address: AIL, fromBlock: hex(s), toBlock: hex(e), topics: [TRANSFER, pad(FAST_POOL)] }]]);
  }
  const res = await batch(calls), nameLogs = [], betLogs = [], payLogs = [];
  res.forEach((ls, i) => [nameLogs, betLogs, payLogs][i % 3].push(...(ls || [])));
  const key = lkey;
  const tickets = [];
  for (const r of numericRegs(nameLogs)) { const n = Number(r.cost / WEI); if (n > 0) tickets.push({ b: r.b, i: r.i, w: r.w, n, lab: r.lab }); }
  const zero = betLogs.filter((l) => BigInt(l.data) === 0n);
  const txs = await batch(zero.concat(payLogs).map((l) => ["eth_getTransactionByHash", [l.transactionHash]]));
  // 已经发出去的奖：极速池钱包自己直接发、并且带「ailgns-fast-pay:期号」的 AiLGNS 转账
  const paid = [];
  payLogs.forEach((l, i) => {
    const tx = txs[zero.length + i];
    if (!tx || String(tx.to || "").toLowerCase() !== AIL || String(tx.from).toLowerCase() !== FAST_POOL) return;
    const rid = memoOf(tx.input, PAY_PREFIX);
    if (rid && /^[0-9]+$/.test(rid)) paid.push({ r: Number(rid), w: "0x" + l.topics[2].slice(26).toLowerCase(), ail: String(BigInt(l.data)), tx: l.transactionHash });
  });
  const bets = [];
  zero.forEach((l, i) => {
    const tx = txs[i], frm = "0x" + l.topics[1].slice(26).toLowerCase();
    if (!tx || String(tx.to || "").toLowerCase() !== DAI || String(tx.from).toLowerCase() !== frm) return; // 必须是钱包自己直接发的
    const d = decodeBet(tx.input);
    if (d) bets.push({ b: key(l)[0], i: key(l)[1], w: frm, d: d[0], n: d[1], tx: l.transactionHash });
  });
  await loadBlocks([...new Set(bets.map((x) => x.b))], blocks);
  return { tickets, bets, paid };
}

async function loadBlocks(ns, blocks) {
  const need = ns.filter((n) => n > 0 && !(n in blocks));
  const res = await batch(need.map((n) => ["eth_getBlockByNumber", [hex(n), false]]));
  need.forEach((n, i) => { blocks[n] = res[i] ? { t: parseInt(res[i].timestamp, 16), h: res[i].hash } : null; });
}
// 时间戳 >= ts 的第一个区块号；还没出返回 0。链大约 1 秒 1 块：先估，再一次读 9 个块左右挪
async function firstBlockAt(ts, latest, blocks) {
  if (latest.t < ts) return 0;
  const clamp = (n) => Math.max(5, Math.min(latest.n, n));
  let n = clamp(latest.n - (latest.t - ts));
  for (let k = 0; k < 8; k++) {
    const lo = Math.max(1, n - 4), hi = Math.min(latest.n, n + 4), ns = [];
    for (let x = lo; x <= hi; x++) ns.push(x);
    await loadBlocks(ns, blocks);
    if (ns.some((x) => !blocks[x])) break;
    for (let x = lo + 1; x <= hi; x++) if (blocks[x].t >= ts && blocks[x - 1].t < ts) return x;
    n = clamp(blocks[lo].t >= ts ? lo - Math.max(4, blocks[lo].t - ts) : hi + Math.max(4, ts - blocks[hi].t));
  }
  let lo = 1, hi = latest.n; // 兜底：二分
  while (lo < hi) { const m = (lo + hi) >> 1; await loadBlocks([m], blocks); if (blocks[m] && blocks[m].t >= ts) hi = m; else lo = m + 1; }
  await loadBlocks([lo], blocks);
  return lo;
}

export const fresh = (from) => ({ v: 1, from, to: from - 1, saved: 0, bal: {}, sold: 0, names: 0, carry: "0", rounds: {}, done: [], draws: {}, void: 0 });

// 往前推进一次：读新票 / 新下注 → 记账 → 能结算的期结算 → 补最近几期的开奖数字。返回 true = 有新东西（值得存档）
export async function advance(st, latest) {
  const blocks = {}; blocks[latest.n] = { t: latest.t, h: latest.h };
  let dirty = false;
  const head = Math.min(latest.n - 1, st.to + 50000); // 落后太多就分几次追
  if (head > st.to) {
    const { tickets, bets, paid } = await scan(st.to + 1, head, blocks);
    st.paid = st.paid || {};
    for (const x of paid) { st.paid[x.r + ":" + x.w] = [x.ail, x.tx]; dirty = true; }
    const ev = tickets.map((x) => ({ ...x, k: "T" })).concat(bets.map((x) => ({ ...x, k: "B" }))).sort((x, y) => x.b - y.b || x.i - y.i);
    for (const e of ev) {
      if (e.k === "T") { st.bal[e.w] = (st.bal[e.w] || 0) + e.n; st.sold += e.n; st.names += 1; continue; }
      const n = Math.min(e.n, st.bal[e.w] || 0);
      if (n <= 0) { st.void += 1; continue; }
      st.bal[e.w] -= n; if (!st.bal[e.w]) delete st.bal[e.w];
      const rid = Math.floor(blocks[e.b].t / ROUND);
      (st.rounds[rid] = st.rounds[rid] || []).push([e.w, e.d, n, e.tx]);
    }
    st.to = head; dirty = dirty || ev.length > 0;
  }
  // 结算：按期号从小到大，开奖区块出了、又过了 CONFIRM 个块、并且那之前的下注都读完了才结
  for (const rid of Object.keys(st.rounds).map(Number).sort((a, b) => a - b)) {
    const n = await firstBlockAt((rid + 1) * ROUND, latest, blocks);
    if (!n || latest.n - n < CONFIRM || st.to < n) break;
    const digit = Number(BigInt(blocks[n].h) % 10n), bets = st.rounds[rid];
    const tk = bets.reduce((t, x) => t + x[2], 0), pot = BigInt(st.carry) + BigInt(tk) * POT, win = {};
    for (const [w, d, k] of bets) if (d === digit) win[w] = (win[w] || 0) + k;
    const tot = Object.values(win).reduce((t, x) => t + x, 0), pay = {};
    let out = 0n;
    for (const w of Object.keys(win)) { const v = pot * BigInt(win[w]) / BigInt(tot); pay[w] = String(v); out += v; }
    st.carry = String(pot - out); // 没人中：整池滚存；有人中：只剩分不尽的零头
    st.done.push({ r: rid, d: digit, b: n, tk, pot: String(pot), win: tot, pay, bets });
    if (st.done.length > 60) { st.done = st.done.slice(-60); const old = st.done[0].r; for (const k of Object.keys(st.paid || {})) if (Number(k.split(":")[0]) < old) delete st.paid[k]; }
    delete st.rounds[rid]; st.draws[rid] = digit; dirty = true;
  }
  // 最近 8 期的开奖数字（没人下注的期也显示）；等 3 个块再认
  const cur = Math.floor(latest.t / ROUND);
  for (let rid = cur - 8; rid < cur; rid++) {
    if (rid in st.draws) continue;
    const n = await firstBlockAt((rid + 1) * ROUND, latest, blocks);
    if (n && latest.n - n >= 3) { st.draws[rid] = Number(BigInt(blocks[n].h) % 10n); dirty = true; }
  }
  for (const k of Object.keys(st.draws)) if (Number(k) < cur - 40) delete st.draws[k];
  st.now = latest.t; st.head = latest.n;
  return dirty;
}

const dai = (wei) => Number(BigInt(wei) / 10n ** 14n) / 10000; // 给页面显示用，4 位小数
const ail6 = (wei) => Number(BigInt(wei) / 10n ** 12n) / 1e6; // AiLGNS 显示 6 位小数
// 给页面的公开数据（不带任何人的余额表）
export function view(st, trial) {
  const cur = Math.floor(st.now / ROUND), bets = st.rounds[cur] || [], by = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const x of bets) by[x[1]] += x[2];
  const tk = by.reduce((t, x) => t + x, 0);
  const left = Object.values(st.bal).reduce((t, x) => t + x, 0);
  const draws = [];
  for (let rid = cur - 1; rid >= cur - 8; rid--) draws.push({ r: rid, d: rid in st.draws ? st.draws[rid] : null });
  return {
    open: true, trial: !!trial, now: st.now, r: cur, ends: (cur + 1) * ROUND,
    carry: dai(st.carry), pot: dai(BigInt(st.carry) + BigInt(tk) * POT), tk, by, draws,
    done: st.done.slice(-10).reverse().map((x) => ({ r: x.r, d: x.d, tk: x.tk, pot: dai(x.pot), win: x.win, winners: Object.keys(x.pay).length })),
    sold: st.sold, names: st.names, left,
  };
}
// 一个钱包自己的：还剩几票、每一笔下注的结果
export function mine(st, a) {
  const bets = [];
  for (const rid of Object.keys(st.rounds)) for (const x of st.rounds[rid]) if (x[0] === a) bets.push({ r: Number(rid), d: x[1], n: x[2], tx: x[3], st: "wait" });
  for (const x of st.done) {
    const mineN = x.bets.filter((y) => y[0] === a && y[1] === x.d).reduce((t, y) => t + y[2], 0);
    const got = (st.paid || {})[x.r + ":" + a]; // 这一期机器人已经发给我的 AiLGNS（链上记录）；同一期中了好几笔就按票数摊开显示
    for (const y of x.bets) if (y[0] === a) {
      const hit = y[1] === x.d && x.pay[a];
      bets.push({ r: x.r, d: y[1], n: y[2], tx: y[3], st: y[1] === x.d ? "win" : "lose", open: x.d, pay: hit ? dai(BigInt(x.pay[a]) * BigInt(y[2]) / BigInt(mineN)) : 0, ail: hit && got ? ail6(BigInt(got[0]) * BigInt(y[2]) / BigInt(mineN)) : 0, ptx: hit && got ? got[1] : "" });
    }
  }
  bets.sort((x, y) => y.r - x.r);
  return { a, left: st.bal[a] || 0, bets: bets.slice(0, 30) };
}
