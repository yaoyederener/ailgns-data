// ⚡ 极速预言家：只读算账（站长 2026-11-12 定稿）。和机器人 monita/fast_oracle.py 是同一套规则，改一边必须改另一边。
//   一期 10 分钟，整点对齐；期号 = 区块时间戳 // 600；开奖 = 本期结束后第一个区块的哈希 % 10。
//   票 = 上线之后新注册的纯数字 .ailgns 域名，付多少 DAI 就是多少票，记在付款钱包上；续费不算。
//   下注 = 钱包给极速资金池转 0 个 DAI，交易数据末尾带「ailgns-fast:数字:票数」；超过剩余按剩余算。
//   每张下注的票带 0.9 DAI 进本期奖池，猜中的按票数平分；没人中整池滚到下一期。
//   发奖 = 机器人用极速资金池钱包转 AiLGNS，交易数据末尾带「ailgns-fast-pay:期号」；这里只读这条链上记录来显示「已发」。
// 这里不发任何交易、不碰任何私钥。
import { RPCS } from "./teamlib.js";

export const FAST_POOL = "0x8610bf581b1c10cb7d372f93b8cdcde382a7c1d1";
export const FAST_START = 18976231; // 上线区块（2026-11-12 开闸，和 monita/fast_oracle.py 同一个数）。填 null = 没开始（正式站不开放，preview 用最近 6 小时试算）
// 🆕 新规则（站长 2026-11-14 定稿，和 monita/fast_oracle.py 同一套；改一边必须改另一边）。V2_START = 新规则生效的区块，null = 还没开闸，一切照旧。
//   ① 票：任何新注册的 .ailgns 域名都行，但要「批量」——同一个钱包 600 个区块（约 10 分钟）内注册 2 个及以上，每个都算票。落单的一个不算票。
//   ② 返奖：猜中的只拿回自己票钱的 90%（每张 0.9 DAI），不分别人的钱；没猜中的票钱归运营收入。
//   ③ 老票（V2_START 之前买的纯数字域名）按旧规则用完：进老奖池，猜中的按票数分，没人中滚存。两种票都有时先用老票。
export const V2_START = null;
const PAIR = 600;
// 🤖 代注册机器人钱包（names-batch.js 里的 REG）：它替客户注册，链上「付款的人」是它。老规则：它付款的不算票（页面一直这么写；2026-11-14 前程序算错过，已改对重算）。新规则：票记给域名主人
const REG_BOT = "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1";
export const STATE_V = 2; // 账本版本：记票口径变了就加 1，接口发现存的是旧版本会从上线区块重新数（和 monita/fast_oracle.py 的 STATE_V 同步改）
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
// 从域名合约的一批日志里挑出【新注册】（同一笔交易里 Paid 后面跟着 NameRegistered；续费只有 Paid，不算；站长自己付的不算）
function allRegs(logs) {
  const ls = logs.slice().sort((x, y) => lkey(x)[0] - lkey(y)[0] || lkey(x)[1] - lkey(y)[1]), out = [], paid = {};
  for (const l of ls) {
    const tx = l.transactionHash;
    if (l.topics[0] === PAID) { paid[tx] = ["0x" + l.topics[1].slice(26).toLowerCase(), BigInt("0x" + l.data.slice(66, 130)), lkey(l)[1]]; continue; }
    if (l.topics[0] !== REG) continue;
    const p = paid[tx]; delete paid[tx];
    const lab = labelOf(l.data);
    if (!p || OWN[p[0]]) continue;
    out.push({ b: lkey(l)[0], i: lkey(l)[1], w: p[0], cost: p[1], lab, tx, pi: p[2], owner: l.topics.length > 2 ? "0x" + l.topics[2].slice(26).toLowerCase() : p[0] });
  }
  return out;
}
// 新规则：一批注册里哪些算票、什么时候发票。regs = [{b, i, w}]（只传新规则生效以后的）。返回 {"区块:序号": [发票区块, 发票序号, 先后]}，不在里面 = 落单
//   同一个钱包：前一个注册在 600 个区块以内 → 自己注册那一刻发票；前面没有、但后一个在 600 以内（一批里的第一个）→ 等第二个出现时一起发，排在它前面
export function pairGrants(regs) {
  const by = {}, out = {};
  for (const r of regs.slice().sort((x, y) => x.b - y.b || x.i - y.i)) (by[r.w] = by[r.w] || []).push(r);
  for (const L of Object.values(by)) L.forEach((r, k) => {
    if (k > 0 && r.b - L[k - 1].b <= PAIR) out[r.b + ":" + r.i] = [r.b, r.i, 1];
    else if (k + 1 < L.length && L[k + 1].b - r.b <= PAIR) out[r.b + ":" + r.i] = [L[k + 1].b, L[k + 1].i, 0];
  });
  return out;
}
// 哪些新注册算票 → [{gb, gi, gs（发票位置）, b（注册区块）, w, cost, lab, tx, pi, ver 1/2}]。新规则那部分要看前后 600 个区块：传进来的日志要比要的范围往前多带 1200 个区块
export function ticketRegs(logs, v2) {
  const start = v2 === undefined ? V2_START : v2, regs = allRegs(logs), out = [];
  const who = (r) => (r.w === REG_BOT ? r.owner : r.w); // 票记给谁：机器人代点的记给域名主人，自己点的记给付款钱包
  const g = pairGrants(regs.filter((r) => start && r.b >= start).map((r) => ({ b: r.b, i: r.i, w: who(r) })));
  for (const r of regs) {
    if (start && r.b >= start) { const at = g[r.b + ":" + r.i]; if (at) out.push({ ...r, w: who(r), gb: at[0], gi: at[1], gs: at[2], ver: 2 }); }
    else if (/^[0-9]+$/.test(r.lab) && r.w !== REG_BOT) out.push({ ...r, gb: r.b, gi: r.i, gs: 1, ver: 1 }); // 老规则：机器人代点的不算票
  }
  return out;
}
// 给日报 / 每日奖池用：这批日志里哪些 Paid 是极速预言家的票款（上线后新注册的纯数字 .ailgns）→ Set("交易:日志序号")。
// 这部分收入 90% 进极速池，不进每日奖池，所以每日奖池算「域名收入 × 70%」时要先减掉它。没上线时永远是空的。
export const FAST_REG_TOPIC = REG;
export function fastPaid(logs) {
  const out = new Set();
  if (!FAST_START) return out;
  // 注意：日报是一段一段扫的，这里只在这一段日志里找同伴；一批注册正好跨在两段的边上会少算，只影响页面上「当天进账」的显示，不影响机器人实际分钱（机器人前后都多看）
  for (const r of ticketRegs(logs.filter((l) => String(l.address).toLowerCase() === NAMES))) if (r.b >= FAST_START) out.add(r.tx + ":" + r.pi);
  return out;
}

// 读一段区块里的新票和新下注
async function scan(a, b, blocks) {
  const calls = [], kinds = [];
  const lo = V2_START ? Math.max(FAST_START || a, a - 2 * PAIR) : a; // 新规则要往前多看 1200 个区块，才知道一个注册前面有没有同伴
  for (let s = lo; s <= b; s += 5000) { calls.push(["eth_getLogs", [{ address: NAMES, fromBlock: hex(s), toBlock: hex(Math.min(b, s + 4999)), topics: [[PAID, REG]] }]]); kinds.push(0); }
  for (let s = a; s <= b; s += 5000) {
    const e = Math.min(b, s + 4999);
    calls.push(["eth_getLogs", [{ address: DAI, fromBlock: hex(s), toBlock: hex(e), topics: [TRANSFER, null, pad(FAST_POOL)] }]]); kinds.push(1);
    calls.push(["eth_getLogs", [{ address: AIL, fromBlock: hex(s), toBlock: hex(e), topics: [TRANSFER, pad(FAST_POOL)] }]]); kinds.push(2);
  }
  const res = await batch(calls), nameLogs = [], betLogs = [], payLogs = [];
  res.forEach((ls, i) => [nameLogs, betLogs, payLogs][kinds[i]].push(...(ls || [])));
  const key = lkey;
  const tickets = [];
  for (const r of ticketRegs(nameLogs)) { const n = Number(r.cost / WEI); if (n > 0 && r.gb >= a && r.gb <= b) tickets.push({ b: r.gb, i: r.gi, s: r.gs, w: r.w, n, lab: r.lab, ver: r.ver }); }
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

export const fresh = (from) => ({ v: STATE_V, from, to: from - 1, saved: 0, bal: {}, sold: 0, names: 0, carry: "0", rounds: {}, done: [], draws: {}, void: 0 });

// 记账（纯计算，不读链）：按（区块, 序号, 先后）把新票、新下注记进账本。tsOf(区块) = 那个区块的时间戳
//   bal = 老票，bal2 = 新票；下注先用老票，不够再用新票；一期里的下注记成 [钱包, 数字, 老票数, 交易, 新票数]
export function book(st, tickets, bets, tsOf) {
  const ev = tickets.map((x) => ({ ...x, k: "T", s: x.s === undefined ? 1 : x.s })).concat(bets.map((x) => ({ ...x, k: "B", s: 2 }))).sort((x, y) => x.b - y.b || x.i - y.i || x.s - y.s);
  for (const e of ev) {
    if (e.k === "T") {
      const key = e.ver === 2 ? "bal2" : "bal"; st[key] = st[key] || {};
      st[key][e.w] = (st[key][e.w] || 0) + e.n; st.sold += e.n; st.names += 1;
      if (e.ver === 2) st.sold2 = (st.sold2 || 0) + e.n;
      continue;
    }
    st.bal2 = st.bal2 || {};
    const n1 = Math.min(e.n, st.bal[e.w] || 0), n2 = Math.min(e.n - n1, st.bal2[e.w] || 0);
    if (n1 + n2 <= 0) { st.void += 1; continue; }
    if (n1) { st.bal[e.w] -= n1; if (!st.bal[e.w]) delete st.bal[e.w]; }
    if (n2) { st.bal2[e.w] -= n2; if (!st.bal2[e.w]) delete st.bal2[e.w]; }
    const rid = Math.floor(tsOf(e.b) / ROUND);
    (st.rounds[rid] = st.rounds[rid] || []).push(n2 ? [e.w, e.d, n1, e.tx, n2] : [e.w, e.d, n1, e.tx]);
  }
  return ev.length;
}
// 结算一期（纯计算）：老票进老奖池按票数分、没人中滚存；新票猜中每张返 0.9 DAI，没猜中的每张 0.9 DAI 记进 ops（运营收入）
export function settleOne(st, rid, digit, n) {
  const bets = st.rounds[rid] || [];
  const tk = bets.reduce((t, x) => t + x[2], 0), pot = BigInt(st.carry) + BigInt(tk) * POT, win = {}, win2 = {};
  let lose2 = 0, tk2 = 0;
  for (const x of bets) {
    const n2 = x[4] || 0; tk2 += n2;
    if (x[1] === digit) { if (x[2]) win[x[0]] = (win[x[0]] || 0) + x[2]; if (n2) win2[x[0]] = (win2[x[0]] || 0) + n2; }
    else lose2 += n2;
  }
  const tot = Object.values(win).reduce((t, x) => t + x, 0), w2 = Object.values(win2).reduce((t, x) => t + x, 0), pay = {};
  let out = 0n;
  for (const w of Object.keys(win)) { const v = pot * BigInt(win[w]) / BigInt(tot); pay[w] = v; out += v; }
  st.carry = String(pot - out); // 老奖池：没人中整池滚存；有人中只剩分不尽的零头
  for (const w of Object.keys(win2)) pay[w] = (pay[w] || 0n) + BigInt(win2[w]) * POT;
  for (const w of Object.keys(pay)) pay[w] = String(pay[w]);
  if (lose2) st.ops = String(BigInt(st.ops || "0") + BigInt(lose2) * POT);
  st.done.push({ r: rid, d: digit, b: n, tk, pot: String(pot), win: tot, pay, bets, tk2, win2: w2, ops: String(BigInt(lose2) * POT) });
  delete st.rounds[rid]; st.draws[rid] = digit;
  // 老票全用完了、老奖池里还剩滚存：已经没有人能再赢它，归运营收入（只在新规则生效后；和机器人同一条）
  if (V2_START && BigInt(st.carry) > 0n && !Object.keys(st.bal).length && !Object.values(st.rounds).some((b) => b.some((x) => x[2] > 0))) { st.ops = String(BigInt(st.ops || "0") + BigInt(st.carry)); st.carry = "0"; }
}

// 往前推进一次：读新票 / 新下注 → 记账 → 能结算的期结算 → 补最近几期的开奖数字。返回 true = 有新东西（值得存档）
export async function advance(st, latest) {
  const blocks = {}; blocks[latest.n] = { t: latest.t, h: latest.h };
  let dirty = false;
  const head = Math.min(latest.n - 1, st.to + 50000); // 落后太多就分几次追
  if (head > st.to) {
    const { tickets, bets, paid } = await scan(st.to + 1, head, blocks);
    st.paid = st.paid || {};
    for (const x of paid) { st.paid[x.r + ":" + x.w] = [x.ail, x.tx]; dirty = true; }
    const n = book(st, tickets, bets, (b) => blocks[b].t);
    st.to = head; dirty = dirty || n > 0;
  }
  // 结算：按期号从小到大，开奖区块出了、又过了 CONFIRM 个块、并且那之前的下注都读完了才结
  for (const rid of Object.keys(st.rounds).map(Number).sort((a, b) => a - b)) {
    const n = await firstBlockAt((rid + 1) * ROUND, latest, blocks);
    if (!n || latest.n - n < CONFIRM || st.to < n) break;
    settleOne(st, rid, Number(BigInt(blocks[n].h) % 10n), n);
    if (st.done.length > 60) { st.done = st.done.slice(-60); const old = st.done[0].r; for (const k of Object.keys(st.paid || {})) if (Number(k.split(":")[0]) < old) delete st.paid[k]; }
    dirty = true;
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
  let tk = 0, tk2 = 0;
  for (const x of bets) { by[x[1]] += x[2] + (x[4] || 0); tk += x[2]; tk2 += x[4] || 0; }
  const sum = (o) => Object.values(o || {}).reduce((t, x) => t + x, 0), left1 = sum(st.bal), left2 = sum(st.bal2);
  const draws = [];
  for (let rid = cur - 1; rid >= cur - 8; rid--) draws.push({ r: rid, d: rid in st.draws ? st.draws[rid] : null });
  return {
    open: true, trial: !!trial, now: st.now, r: cur, ends: (cur + 1) * ROUND,
    v2: !!(V2_START && st.head >= V2_START), // 新规则生效了没有
    carry: dai(st.carry), pot: dai(BigInt(st.carry) + BigInt(tk) * POT), tk, tk2, by, draws, // pot / tk = 老奖池和这一期压的老票；tk2 = 这一期压的新票
    done: st.done.slice(-10).reverse().map((x) => ({ r: x.r, d: x.d, tk: x.tk, tk2: x.tk2 || 0, pot: dai(x.pot), win: x.win, win2: x.win2 || 0, winners: Object.keys(x.pay).length })),
    sold: st.sold, names: st.names, left: left1 + left2, left1, left2,
  };
}
// 一个钱包自己的：还剩几票、每一笔下注的结果
export function mine(st, a) {
  const bets = [];
  for (const rid of Object.keys(st.rounds)) for (const x of st.rounds[rid]) if (x[0] === a) bets.push({ r: Number(rid), d: x[1], n: x[2] + (x[4] || 0), n2: x[4] || 0, tx: x[3], st: "wait" });
  for (const x of st.done) {
    const hits = x.bets.filter((y) => y[0] === a && y[1] === x.d);
    const mineN = hits.reduce((t, y) => t + y[2], 0), mine2 = hits.reduce((t, y) => t + (y[4] || 0), 0);
    const all = x.pay[a] ? BigInt(x.pay[a]) : 0n, old = all - BigInt(mine2) * POT; // 这一期我一共中了多少；其中老奖池分到的那部分
    const got = (st.paid || {})[x.r + ":" + a]; // 这一期机器人已经发给我的 AiLGNS（链上记录）；同一期中了好几笔就按金额摊开显示
    for (const y of x.bets) if (y[0] === a) {
      const hit = y[1] === x.d && all > 0n, n2 = y[4] || 0;
      const p = hit ? (mineN ? old * BigInt(y[2]) / BigInt(mineN) : 0n) + BigInt(n2) * POT : 0n;
      bets.push({ r: x.r, d: y[1], n: y[2] + n2, n2, tx: y[3], st: y[1] === x.d ? "win" : "lose", open: x.d, pay: hit ? dai(p) : 0, ail: hit && got ? ail6(BigInt(got[0]) * p / all) : 0, ptx: hit && got ? got[1] : "" });
    }
  }
  bets.sort((x, y) => y.r - x.r);
  return { a, left: (st.bal[a] || 0) + ((st.bal2 || {})[a] || 0), left1: st.bal[a] || 0, left2: (st.bal2 || {})[a] || 0, bets: bets.slice(0, 30) };
}
