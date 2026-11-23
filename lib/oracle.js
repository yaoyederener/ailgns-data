// 🔮 AiLGNS 每日预言家：猜今晚 AiLGNS 价格（3 位小数），晚上 9–10 点随机一刻的链上价格开奖
// 奖金 = 前一天域名收入 × 20%：10% 给当天最接近的人，90% 滚进超级大奖池；猜中 3 位小数完全一样的人平分大奖池，没人中就一直滚
// KV：
//   or:g:<日期>:<主名字>  = { a, name, tier, ps: [[价格×1000, 提交时间]] }  这一轮的预测（一个主名字一个键，避免同时提交互相覆盖）
//   or:res:<日期>         = 开奖结果；or:last = 最近一次结果；or:pool = { pool }（超级大奖池，DAI）
//   or:pay                = [{ id, day, a, name, kind, amt, tx? }] 待发 / 已发奖金（发奖程序读这个）
//   or:wins               = { 主名字: [最接近次数, 大奖次数] } 预言家榜
import { RPCS } from "./teamlib.js";
import { banned } from "./ban.js";
import { loadTotal } from "./honor.js";
import { credOf, KING_MIN_LV } from "./cred.js";

export const PAIR = "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0"; // AiLGNS/DAI 池子：token0 = AiLGNS，token1 = DAI
export const NAMES = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988" }; // 暂定只有 .ailgns 能参加（.lgns 合约 0x93af23fe… 先不算）
export const SHARE = 0.7, CLOSEST = 0.1, SECOND = 0.05; // 域名收入拿 70%（2026-11-05 起，之前 20%）全部进奖池；每晚开奖：最接近的拿奖池总额 10%，第二接近的（另一个名字）拿 5%，猜中 3 位小数的平分剩下的
export const KING = 0.3, KING_SPLIT = [0.5, 0.3, 0.2], CYC0 = "2026-11-05"; // （旧规则，留着兼容老结果）
// 💰 贡献王（站长 2026-11-08 定稿，规则会随数据继续优化）：按周结算（周一到周日，周日揭晓时发，不用等有人猜中大奖）；
//    奖池 30% 给本周 OTC 手续费前 3，按各自手续费占比分；每人最多拿回自己付的手续费 KING_CAP 倍（防左手倒右手刷单）；认证商家（lib/cred.js KING_MIN_LV）以上、且钱包绑定了域名（设了主名字）才进榜。
export const KING_CAP = 3, KING_TOP = 3, KING_BADGE_DAYS = 7;
// 2026-11-10 起（站长 2026-11-08 定）：周榜的钱不再从奖池余额出，改从「本周新进奖池的钱」里出 KING_IN 比例；大奖池只进不出，只在有人猜中大奖时清空
export const KING_IN = 0.15, KING_IN_FROM = "2026-11-10", KING_REAL_FROM = "2026-11-15";
export const KING_OFF_FROM = "2026-11-15"; /* 站长 2026-11-15 凌晨：贡献王取消，原定的最后一期也不结算了；奖池里的钱全部留给大奖 */
export const kingOn = (day) => day < KING_OFF_FROM;
export async function weekInflow(kv, from, to) { let t = 0; for (let d = from; d <= to; d = addDay(d, 1)) t += (await allotOf(kv, d)).allot; return cents(t); } // 本周每天进奖池的钱（域名收入 × 70%）加起来
export async function kingBudget(kv, from, to, held) { // 这一周周榜能分的总额 + 按哪条规则
  if (to < KING_IN_FROM) return { total: Math.floor(held * KING * 100) / 100, mode: "held", base: held, rate: KING };
  const inflow = await weekInflow(kv, from, to), want = cents(inflow * KING_IN), have = cents(Math.max(0, Number(held) || 0));
  /* 站长 2026-11-15「按实际余额发」：奖池改由团队注入后，公式算出来的数可能比奖池钱包里的钱多；多了就只分钱包里实际有的，三人照旧按占比分 */
  if (to >= KING_REAL_FROM && want > have) return { total: have, mode: "wallet", base: inflow, rate: KING_IN, want };
  return { total: want, mode: "inflow", base: inflow, rate: KING_IN };
}
// 站长 2026-11-13 定：贡献王周奖太高、不公平 → 11-15（周日）发完最后一期就取消。DAILY_FROM（周一）起改成「每日前三」：
// 每晚离揭晓价最近的 3 个名字各 DAILY_PRIZE DAI（照旧发 AiLGNS），只从当天新进奖池的钱里出（当天进账不够 60 就三人平分当天进账），大奖池只进不出；
// 中了每日奖冷却 DAILY_COOL_DAYS 天（只停每日奖，照样能猜大奖）；领奖照旧 3 天内先烧 1 枚创世名。天眼通 / 地灵通并进每日前三，大奖整池归神算子。
export const DAILY_FROM = "2026-11-16", DAILY_PRIZE = 20, DAILY_TOP = 3, DAILY_COOL_DAYS = 7;
export const dailyOn = (day) => day >= DAILY_FROM;
export const DRAW_H = 21; // 北京时间 21:00–22:00 开奖窗口
export const MAX_GUESS = 5; // 单钱包每轮上限（2026-11-05 站长定：防大户碾压）
export const COOL_FOREVER = "9999-12-31"; // 中奖（三个奖都算）后，这个名字和这个钱包都永久不能再参加；想再玩要用新钱包、买新的创世域名（站长 2026-11-05 定）
export const FIRST_DAY = "2026-11-06";
export const SEED_DAY = "2026-11-04"; // 开局奖池：11 月 4 日域名收入 × 20% 全部进超级大奖池（那天不开奖，没有「最接近」奖） // 第一期开奖（奖金 = 11 月 5 日域名收入 × 20%：发奖程序从 11 月 5 日 0 点起留奖金）
const SKIP = new Set(["0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", "0x89dd06754bb239b6c4c92bc47c8fa72889084e27"]); // 站长钱包不参加
const H = 3600e3;

export const bjDay = (ms) => new Date(ms + 8 * H).toISOString().slice(0, 10);
export const drawStart = (day) => Date.parse(day + "T" + String(DRAW_H).padStart(2, "0") + ":00:00+08:00");
const addDay = (day, n) => bjDay(Date.parse(day + "T12:00:00+08:00") + n * 24 * H);
// 现在提交算哪一轮：晚上 9 点前 = 今晚，9 点后 = 明晚
// 站长 2026-11-09 定：11 月 10 日起早 9 点封卷，锁定 12 小时（封卷后提交的算下一期）；揭晓仍是 21:00–22:00。之前的轮次还是晚 9 点封卷
// 站长 2026-11-11 定：12 小时太长，11 月 12 日起改下午 3 点封卷、锁定 6 小时试一下；揭晓时间不变
const atH = (day, h) => Date.parse(day + "T" + String(h).padStart(2, "0") + ":00:00+08:00");
export const CUT_FROM = "2026-11-10", CUT_H_OLD = 9, CUT_FROM2 = "2026-11-12", CUT_H = 15;
export const cutoffAt = (day) => (day >= CUT_FROM2 ? atH(day, CUT_H) : day >= CUT_FROM ? atH(day, CUT_H_OLD) : drawStart(day));
export function openRound(now = Date.now()) { const d = bjDay(now), r = now < cutoffAt(d) ? d : addDay(d, 1); return r < FIRST_DAY ? FIRST_DAY : r; }
export const prevDay = (day) => addDay(day, -1);
// 🎚️ 难度（站长 2026-11-13 定）：11-13 那期 608 人猜、3 位小数被猜中的概率已到七成，大奖池一晚清空。DEC4_FROM 那一轮起改猜 4 位小数（难 10 倍）；之前的轮次和老结果照旧 3 位
/* 站长 2026-11-14 晚：11-14 那期又被猜中（487 个预测，elonmosk 猜中 854.686），「赶紧上线 4 位数版本」→ 提前一轮，11-15 那一轮（当时正开放着）起就猜 4 位 */
export const DEC4_FROM = "2026-11-15";
/* 4 位小数的轮次里，存的预测都按 ×10000 的整数。11-15 那一轮改规则之前已经交上来的是 ×1000（没有 sc 标记）：读出来时末位补 0（×10），
   并记上 was3（改之前交的）。之后新交的、改过的记录都带 sc: 10000，不会再乘第二次。 */
export function normG(g, day) {
  if (!g || !Array.isArray(g.ps) || decOf(day) !== 4 || g.sc === 10000) return g;
  return { ...g, ps: g.ps.map((x) => [x[0] * 10, x[1]]), sc: 10000, was3: true };
}
export const decOf = (day) => (String(day || "") >= DEC4_FROM ? 4 : 3);
export const scOf = (day) => (decOf(day) === 4 ? 10000 : 1000);
export const fmtP = (m, day) => (m / scOf(day)).toFixed(decOf(day)); // day 不给 = 老的 3 位

export async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.result !== undefined && j.result !== null) return j.result;
      err = new Error((j.error && j.error.message) || "rpc");
    } catch (e) { err = e; }
  }
  throw err;
}
// 价格（DAI / AiLGNS）× sc（默认 1000 = 3 位小数；4 位小数的轮次传 10000），四舍五入到整数；block 不给就是最新
export async function priceMilli(block, sc = 1000) {
  const r = (await rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, block ? "0x" + block.toString(16) : "latest"])).slice(2);
  const ail = BigInt("0x" + r.slice(0, 64)), dai = BigInt("0x" + r.slice(64, 128));
  return { m: Number((dai * 2n * BigInt(sc) + ail) / (2n * ail)), raw: Number((dai * 1000000n) / ail) / 1e6, ail: r.slice(0, 64), dai: r.slice(64, 128) };
}
const blk = async (n) => { const b = await rpc("eth_getBlockByNumber", [n === "latest" ? n : "0x" + n.toString(16), false]); return { n: parseInt(b.number, 16), t: parseInt(b.timestamp, 16), h: b.hash }; };
// 第一个时间 ≥ ts（秒）的区块：先按出块速度估，再逐步校正（Anubis 大约 1 秒一块）
async function blockAt(ts, latest) {
  let lo = 0, hi = latest.n, g = Math.max(1, Math.min(latest.n, latest.n - Math.round(latest.t - ts)));
  for (let i = 0; i < 30 && hi - lo > 1; i++) {
    const b = await blk(g);
    if (b.t >= ts) hi = b.n; else lo = b.n;
    const step = Math.round(ts - b.t);
    g = Math.min(hi - 1, Math.max(lo + 1, b.n + (step === 0 ? (b.t >= ts ? -1 : 1) : step)));
    if (g <= lo || g >= hi) g = Math.floor((lo + hi) / 2);
  }
  return hi;
}

// .ailgns 主名字；没有返回 ""
export async function primaryName(a) {
  for (const [t, c] of Object.entries(NAMES)) {
    const r = await rpc("eth_call", [{ to: c, data: "0xf5c57382" + a.slice(2).padStart(64, "0") }, "latest"]);
    const w = r.slice(2), off = parseInt(w.slice(0, 64), 16) * 2, len = parseInt(w.slice(off, off + 64), 16);
    const s = new TextDecoder().decode(new Uint8Array((w.slice(off + 64, off + 64 + len * 2).match(/../g) || []).map((x) => parseInt(x, 16))));
    if (s && banned(s)) return ""; // 🚫 涉政名字：本站不显示，当没主名字处理
    if (s) return s + "." + t;
  }
  return "";
}
// 一批地址「有没有本站域名」（荣耀榜用，站长 2026-11-20：上榜必须有域名）。和页面上显示名字的规则对齐（scan.js lookup）：
// 钱包名下有 .ailgns / .lgns 域名就算；主名字是被屏蔽的名字（页面不显示）时，名下要另有别的域名才算。
// 一次请求查一批；返回 { 地址: "1" 或 "" }；哪个地址没读全就不在返回里（调用方当「还不知道」）
const LGNS_NAMES = "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3";
export async function domainFlags(addrs) {
  const out = {};
  for (let i = 0; i < addrs.length; i += 100) {
    const part = addrs.slice(i, i + 100), calls = [];
    part.forEach((a) => { const w = a.slice(2).padStart(64, "0"); calls.push({ to: NAMES.ailgns, data: "0xf5c57382" + w }, { to: NAMES.ailgns, data: "0x70a08231" + w }, { to: LGNS_NAMES, data: "0x70a08231" + w }); });
    const body = JSON.stringify(calls.map((c, k) => ({ jsonrpc: "2.0", id: k, method: "eth_call", params: [c, "latest"] })));
    let res = null;
    for (let k = 0; k < RPCS.length * 2 && !res; k++) {
      try { const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body }); const j = await r.json(); if (Array.isArray(j)) res = j; } catch (e) { res = null; }
    }
    const by = {};
    for (const x of res || []) if (typeof x.result === "string" && x.result.length >= 66) by[x.id] = x.result;
    part.forEach((a, n) => {
      const pr = by[n * 3], b1 = by[n * 3 + 1], b2 = by[n * 3 + 2];
      if (!pr || !b1 || !b2 || pr.length < 130) return;
      const w = pr.slice(2), off = parseInt(w.slice(0, 64), 16) * 2, len = parseInt(w.slice(off, off + 64), 16);
      const name = new TextDecoder().decode(new Uint8Array((w.slice(off + 64, off + 64 + len * 2).match(/../g) || []).map((y) => parseInt(y, 16))));
      const own = Number(BigInt(b1) + BigInt(b2));
      out[a] = (name && banned(name) ? own >= 2 : own >= 1) ? "1" : "";
    });
  }
  return out;
}
// 参加资格（满足其一）：① 主名字是创世域名（.ailgns 付费注册的前 1 万个）② OTC 累计成交满 5 万 DAI（和会员卡、荣耀榜同一口径）
// （③ 当天又改成「持有至少 5 枚普通域名」，见下面 heldNames；plainRegs 这个「注册过几个」的数法留着备查，不再决定资格）
// ③ 2026-11-21 站长加一条路（「要注册 5 个普通域名才能参与每日预言家」「多一条路」）：这个钱包累计注册满 5 个普通 .ailgns 域名（付费注册、不在创世 1 万个里的；
//    按注册记录数，注册到这个钱包名下的才算，买来的、别人转来的不算；注册后卖掉 / 转走 / 销毁不影响）。原来两条照旧。
export const PLAIN_MIN = 5;
// 纯计算（方便单独测）：.ailgns 的 NameRegistered 快照 → 这个钱包注册过几个普通域名。哪些算创世和 genesisNo 同一个数法（先到的前 1 万个付费注册）
export function plainRegs(l, a) {
  const pad = "0x" + String(a || "").toLowerCase().slice(2).padStart(64, "0"), g = {};
  let n = 0, mine = 0;
  for (const x of l || []) {
    if (!x || !x[1] || !x[2]) continue;
    const k = x[1][1], paid = BigInt("0x" + x[2].slice(66, 130)) > 0n;
    if (!g[k] && paid && n < GENESIS) { g[k] = ++n; continue; } // 这一条是创世注册
    if (paid && x[1][2] && x[1][2].toLowerCase() === pad) mine++;
  }
  return mine;
}
export const OTC_MIN = 50000, GENESIS = 10000;
const T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
// 2026-11-21 站长再改（看了没资格的提示后）：「规则改下：至少持有 1 枚创世域名」「至少持有 5 枚普通域名」→ 资格看钱包里**现在持有**的 .ailgns 名字，不再看主名字、也不再看注册过几个：
//   ① 持有至少 1 枚创世域名（不用设成主名字）  ② OTC 累计成交满 5 万 DAI（没变）  ③ 持有至少 5 枚普通域名（买来的也算）
// 怎么算「持有」（防倒手，和原来主名字那条「本轮开放后才转进来的要等下一轮」同一个规矩）：
//   · 名字现在在这个钱包里（挂在市场里的在市场合约名下，不算；烧掉的不算）；
//   · 自己注册的马上算；买来 / 别人转来的，要在本轮开放（上一轮封卷）之前就到了才算，本轮才到的下一轮算；
//   · 中过奖的创世域名（or:cool 里按名字停赛的）不再算数，转到哪个钱包都一样。
// 2026-11-23 站长再改（堵「批量注册 → 极速票用完 → 空名字便宜卖给别人拿资格，奖池一分钱没涨」）：③ 普通域名这条路只认**自己注册的**——
//   名字现在在这个钱包里，而且最近一次注册就是注册到这个钱包名下（自己点、机器人代注册、别人替你注册到你名下都算）；买来的、别人转来的不算。
//   自己注册的挂到市场再撤回来，仍算自己注册的（本轮才撤回来的照旧等下一轮）。创世域名不变：持有就算，买来的也算（2026-11-23 承诺过永久有效）。
// 纯计算（方便单独测）：Transfer / NameRegistered 快照 → 这个钱包现在手里的名字 { gen: [{ no, label, b, mint }], plain: [{ label, b, mint, self }] }
//   b = 最后一次转进来的区块；mint = 是注册铸造来的；self = 最近一次注册是注册到这个钱包名下。哪些算创世和 genesisNo 同一个数法；烧进过黑洞的名字永久不算创世。
export function heldNames(xf, rg, a) {
  const me = "0x" + String(a || "").toLowerCase().slice(2).padStart(64, "0"), dead64 = "0x" + DEAD.slice(2).padStart(64, "0");
  const g = {}, label = {}, last = {}, burnt = {}, regTo = {};
  let n = 0;
  for (const x of rg || []) {
    if (!x || !x[1] || !x[2]) continue;
    const k = x[1][1].toLowerCase();
    label[k] = decLabel(x[2]);
    regTo[k] = String(x[1][2] || "").toLowerCase(); // 最近一次注册到谁名下（过期后被别人重新注册的，以后一次为准）
    if (!g[k] && BigInt("0x" + x[2].slice(66, 130)) > 0n && n < GENESIS) g[k] = ++n;
  }
  for (const l of (xf || []).slice().sort((p, q) => p[0] - q[0])) {
    const t = l && l[1]; if (!t || !t[3] || !t[2]) continue;
    const id = t[3].toLowerCase();
    last[id] = l;
    if (t[2].toLowerCase() === dead64) burnt[id] = 1;
  }
  const out = { gen: [], plain: [] };
  for (const id of Object.keys(last)) {
    const l = last[id];
    if (l[1][2].toLowerCase() !== me) continue;
    const nm = label[id]; if (!nm) continue;
    const row = { label: nm, b: l[0], mint: /^0x0+$/.test(l[1][1]), self: regTo[id] === me };
    if (g[id] && !burnt[id]) out.gen.push(Object.assign(row, { no: g[id] })); else out.plain.push(row);
  }
  out.gen.sort((p, q) => p.no - q.no);
  return out;
}
// 纯计算：手里的名字里，这一轮算数的有几枚。openBlock = 本轮开放那一刻的区块；cooled(名字) = 这个名字中过奖还在停赛
export function countHeld(held, openBlock, cooled) {
  const ok = (r) => r.mint || !(openBlock > 0) || r.b < openBlock;
  const gen = held.gen.filter((r) => !(cooled && cooled(r.label + ".ailgns")));
  const mine = held.plain.filter((r) => r.self); // 普通域名只认自己注册的；pb = 手里买来 / 别人转来的普通域名有几枚（不算数，页面上告诉他）
  return { gh: gen.filter(ok).length, ghWait: gen.filter((r) => !ok(r)).length, ph: mine.filter(ok).length, phWait: mine.filter((r) => !ok(r)).length, pb: held.plain.length - mine.length };
}
function decLabel(r) { try { const w = (i) => r.slice(2 + i * 64, 2 + (i + 1) * 64), off = parseInt(w(0), 16) / 32, len = parseInt(w(off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2); return len > 0 && len < 200 ? new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)))) : ""; } catch (e) { return ""; } }
// 本轮开放那一刻的区块号：一轮只找一次，记在 KV
async function openBlockOf(kv, round) {
  const k = "or:openblk:" + round, c = await kv.get(k);
  if (c && Number(c) > 0) return Number(c);
  const b = await blockAt(cutoffAt(prevDay(round)) / 1000, await blk("latest"));
  try { await kv.put(k, String(b), { expirationTtl: 5 * 86400 }); } catch (e) { /* 记不上下次再找 */ }
  return b;
}
async function genesisNo(kv, label, snap, xsnap) {
  const h = Array.from(new TextEncoder().encode(label)).map((x) => x.toString(16).padStart(2, "0")).join("");
  const id = await rpc("eth_call", [{ to: NAMES.ailgns, data: "0x5fd846f2" + (32).toString(16).padStart(64, "0") + (h.length / 2).toString(16).padStart(64, "0") + h.padEnd(Math.ceil(h.length / 64) * 64 || 64, "0") }, "latest"]);
  const c = snap || (await kv.get("nmlogs:" + NAMES.ailgns + ":" + T_REG.slice(2, 10), "json")) || { l: [] };
  const g = {};
  let n = 0;
  for (const x of c.l) { const k = x[1][1]; if (!g[k] && BigInt("0x" + x[2].slice(66, 130)) > 0n && n < GENESIS) g[k] = ++n; }
  // 🔥 烧进黑洞过的名字永久不算创世（站长 2026-11-09）：哪怕到期后被重新注册
  const xf = xsnap || (await kv.get("nmlogs:" + NAMES.ailgns + ":" + T_XFER.slice(2, 10), "json")) || { l: [] }, dead64 = "0x" + DEAD.slice(2).padStart(64, "0");
  if (xf.l.some((t) => t[1] && t[1][3] && t[1][3].toLowerCase() === id && t[1][2] && t[1][2].toLowerCase() === dead64)) return 0;
  if (g[id]) return g[id];
  const seen = c.l.some((x) => x[1][1] === id);
  return !seen && n < GENESIS ? n + 1 : 0; // 快照还没收进去的新注册：创世名额没满就算创世
}
export async function eligibility(kv, a) {
  const name = await primaryName(a);
  const snap = (await kv.get("nmlogs:" + NAMES.ailgns + ":" + T_REG.slice(2, 10), "json")) || { l: [] }; // 注册记录快照：算创世编号和「注册过几个普通域名」共用一份
  const xsnap = (await kv.get("nmlogs:" + NAMES.ailgns + ":" + T_XFER.slice(2, 10), "json")) || { l: [] }; // 转账记录快照：算「现在持有哪些名字」
  const [gno, tot] = await Promise.all([name ? genesisNo(kv, name.split(".")[0], snap, xsnap) : 0, loadTotal(kv)]);
  let reg = 0; try { reg = plainRegs(snap.l, a); } catch (e) { reg = 0; }
  const vol = Math.round(((tot[a] && tot[a][0]) || 0) * 100) / 100;
  const key = name || a, cm = (await kv.get("or:cool", "json")) || {}, cool = [cm[key] || "", cm[a] || ""].sort().pop(), round = openRound(); // 名字和钱包都查：中过奖的名字、中过奖的钱包都不能再参加
  const coolOn = cool >= round; // cool = 暂停到哪一轮（含）
  // 持有几枚：快照或区块读不到时 hold 留空，退回老办法（主名字是创世名就算），绝不因为读不到把原来能玩的人挡在外面
  let hold = null;
  try { if (xsnap.l.length && snap.l.length) hold = countHeld(heldNames(xsnap.l, snap.l, a), await openBlockOf(kv, round), (nm) => (cm[nm] || "") >= round); } catch (e) { hold = null; }
  const gh = hold ? hold.gh : gno > 0 ? 1 : 0, ph = hold ? hold.ph : 0;
  return { name, gno, vol, reg, gh, ph, ghWait: hold ? hold.ghWait : 0, phWait: hold ? hold.phWait : 0, pb: hold ? hold.pb : 0,
    // 站长 2026-11-21 上线当晚再补一条：「现在也要设置主域名，所有都要设置主域名才能玩」→ 三条路都一样，先得有 .ailgns 主名字（name 非空），再满足其一
    pass: gno > 0 || gh > 0 || vol >= OTC_MIN || ph >= PLAIN_MIN,
    ok: !!name && (gno > 0 || gh > 0 || vol >= OTC_MIN || ph >= PLAIN_MIN) && !coolOn, key, cool: coolOn ? cool : "" };
}
// 预测次数：按主名字的档位（和注册价一样：英文 3 位 640、4 位 160、中文 2 字 50、其他 5 DAI/年）+ 当天 OTC 成交满 50 DAI 再加 1
export function tierOf(name) {
  const label = name.split(".")[0], n = Array.from(label).length, cn = /[一-鿿]/.test(label);
  if (cn) return n === 2 ? { n: 2, label: "中文 2 字" } : { n: 1, label: "普通" };
  return n === 3 ? { n: 5, label: "3 位" } : n === 4 ? { n: 3, label: "4 位" } : { n: 1, label: "普通" };
}
export async function otcBonus(kv, a, day) {
  const from = Date.parse(day + "T00:00:00+08:00") / 1000, list = (await kv.get("tr:" + a, "json")) || [];
  return list.some((r) => r.t >= from && r.t < from + 86400 && r.dai >= 50) ? 1 : 0;
}

async function listKeys(kv, prefix) {
  const out = [];
  let cursor;
  do { const p = await kv.list({ prefix, cursor }); out.push(...p.keys.map((k) => k.name)); cursor = p.list_complete ? null : p.cursor; } while (cursor);
  return out;
}
export async function guessesOf(kv, day) {
  const keys = await listKeys(kv, "or:g:" + day + ":");
  return (await Promise.all(keys.map((k) => kv.get(k, "json")))).filter(Boolean).map((g) => normG(g, day));
}
// 这一轮的奖金：前一天的域名收入 × 20%（日报统计里的数，站长自己付的不算）
export async function allotOf(kv, day) {
  const d = await kv.get("st:d:" + prevDay(day), "json");
  const rev = (d && d.nm && d.nm.dai) || 0, fast = (d && d.nm && d.nm.fast) || 0; // fast = 极速预言家的票款（90% 进极速池），不进每日奖池
  const lg = (d && d.nm && d.nm.lg) || 0; // lg = 客户用 LGNS 付的域名费（站长 2026-11-14：不进每日奖池，站长手动加；从这天起才开始单独记，之前的天没有这个数 = 0）
  return { rev, fast, lg, allot: Math.floor(Math.max(0, rev - fast - lg) * SHARE * 100) / 100 };
}
const cents = (x) => Math.floor(x * 100) / 100;

// 超级大奖池现在有多少：开过奖就用记录的数；第一期开奖前 = 开局奖池（11 月 4 日收入 × 20%，日报统计实时更新）
export async function poolNow(kv) {
  const p = await kv.get("or:pool", "json");
  if (p) return p.pool || 0;
  const d = await kv.get("st:d:" + SEED_DAY, "json");
  return Math.floor(((d && d.nm && d.nm.dai) || 0) * SHARE * 100) / 100;
}
// 开奖：晚上 10 点以后第一次调用时算，算过就直接返回
// 奖金池里实际留出的钱（DAI + AiLGNS 按现价，发奖程序的公开记账）：页面显示和发奖都以它为准，有多少发多少，不夸大
// 奖池钱包（2026-11-05 起，只放奖池的钱，链上公开可查）：DAI 累计满 100 由 keeper 在 OTC 买成 AiLGNS，奖金只发 AiLGNS
export const POOL = "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4";
const DAI_T = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL_T = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb";
const OTC_T = "0x4e730be6d46be71223ded5a32dc45799f6d4bc15";
// 奖池挂在 OTC 买单里的 DAI（2026-11-07 起奖池换币改成挂买单，钱在托管合约里，也是奖池的钱）：最近 1000 张单里 maker = 奖池、买币、还开着的 giveLeft 之和
export async function poolEscrow() {
  try {
    const n = Number(BigInt(await rpc("eth_call", [{ to: OTC_T, data: "0x35daa731" }, "latest"]))), from = Math.max(0, n - 1000);
    const h = (await rpc("eth_call", [{ to: OTC_T, data: "0x8f72fc77" + from.toString(16).padStart(64, "0") + (n - from).toString(16).padStart(64, "0") }, "latest"])).slice(2);
    const w = [], cnt = parseInt(h.slice(64, 128), 16), now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < cnt; i++) w.push(h.slice(128 + i * 448, 128 + (i + 1) * 448));
    let sum = 0n;
    for (const o of w) {
      const maker = "0x" + o.slice(24, 64), sell = o.slice(64, 128).endsWith("1"), open = o.slice(128, 192).endsWith("1"), exp = parseInt(o.slice(192, 256), 16);
      if (maker === POOL && !sell && open && exp > now) sum += BigInt("0x" + o.slice(384, 448));
    }
    return Number(sum / 10n ** 12n) / 1e6;
  } catch (e) { return 0; }
}
export async function poolFunds() {
  const q = (t) => rpc("eth_call", [{ to: t, data: "0x70a08231" + POOL.slice(2).padStart(64, "0") }, "latest"]).then((r) => Number(BigInt(r) / 10n ** 12n) / 1e6);
  const [dai, ail, esc] = await Promise.all([q(DAI_T), q(AIL_T), poolEscrow()]);
  return { dai: Math.round((dai + esc) * 1e6) / 1e6, ail, escrow: esc };
}
/* 奖池钱包里实际有多少钱（折成 DAI）。px = 把里面的 AiLGNS 按什么价折：给了就用它（开奖时传 OTC 预言机价），不给才用 DEX 现价。
   站长 2026-11-14 晚：「钱包钱不够却要显示？不是让你按实际收入来吗」——以前这里按 DEX 价估钱包里的 AiLGNS，发奖却按 OTC 预言机价折回 AiLGNS；
   OTC 价比 DEX 价低的那天（11-14：834 对 854.7），算出来要发的 AiLGNS 就比钱包里的多（差 0.19 枚）。估值和折算必须用同一个价。 */
export async function heldNow(px) {
  const [f, dex] = await Promise.all([poolFunds(), px > 0 ? null : priceMilli()]);
  return Math.floor((f.dai + f.ail * (px > 0 ? px : dex.raw)) * 100) / 100;
}
// 本周期贡献榜：从 from 到 to（北京日，含）每个地址付的 OTC 手续费合计，降序
// 合约地址不参与贡献榜：批量扫单合约 0x6ec4（手续费其实是扫单的人付的，新成交已按交易发起人记）、自动撮合 0xdcc5（我们自己的机器人）、回购合约
export const NOT_PLAYER = { "0x6ec474047a6c12d0cab53855a990c1c8b3996c20": 1, "0xdcc5354175d60ffc8364e71e792fcd66366f00fe": 1, "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3": 1 };
export async function feeBoard(kv, from, to) {
  const sum = {};
  let cursor;
  do {
    const r = await kv.list({ prefix: "or:fee:", cursor });
    for (const k of r.keys) {
      const d = k.name.slice(7, 17);
      if (d < from || d > to) continue;
      const f = (await kv.get(k.name, "json")) || {};
      for (const a in f) { if (NOT_PLAYER[a]) continue; sum[a] = Math.round(((sum[a] || 0) + f[a]) * 100) / 100; }
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return Object.entries(sum).map(([a, fee]) => ({ a, fee })).sort((x, y) => y.fee - x.fee);
}
export const weekStart = (day) => { const d = new Date(day + "T00:00:00Z"), back = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - back); const m = d.toISOString().slice(0, 10); return m < CYC0 ? CYC0 : m; }; // 本周周一（北京日期）；第一周从 11-05 起
export const isWeekEnd = (day) => new Date(day + "T00:00:00Z").getUTCDay() === 0; // 周日结算
export async function cycleStart(kv, day) { return weekStart(day || bjDay(Date.now())); }
// 贡献榜：只算认证商家以上；按手续费占比分 kingTotal，每人封顶 KING_CAP × 自己的手续费
export async function kingsOf(kv, from, to, kingTotal, fb0) {
  const fb = fb0 || await feeBoard(kv, from, to), top = [];
  // 站长 2026-11-08 定：必须绑定域名（设了主名字）才进贡献王榜，没绑的跳过、名额顺延
  for (const x of fb) { const c = await credOf(kv, x.a); if (c.lv < KING_MIN_LV) continue; const nm = await showName(kv, x.a); if (nm.indexOf("…") >= 0) continue; top.push({ a: x.a, fee: x.fee, lv: c.lv }); if (top.length >= KING_TOP) break; }
  const sum = top.reduce((t, x) => t + x.fee, 0);
  for (const x of top) { x.share = sum ? x.fee / sum : 0; }
  // 连庄降一级（站长 2026-11-08 定）：上周第一名本周最多算第二：占比压到第二名的水平，多出来的给新第一；榜单位置也换
  const lastTop = (((await kv.get("or:kingbadge", "json")) || {}).a || [])[0];
  if (top.length > 1 && lastTop && top[0].a === lastTop) {
    const d = top[0].share - top[1].share;
    if (d > 0) { top[0].share -= d; top[1].share += d; }
    top[0].demoted = true; [top[0], top[1]] = [top[1], top[0]];
  }
  for (const x of top) { x.amt = cents(Math.min(kingTotal * x.share, x.fee * KING_CAP)); x.name = await showName(kv, x.a); }
  return { top, n: fb.length, sum, eligible: top.length };
}
// 地址的显示名：主名字，没有就缩写（缓存 1 小时）
export async function showName(kv, a) {
  const k = "or:nm:" + a, c = await kv.get(k);
  if (c !== null) return c;
  let n = ""; try { n = await primaryName(a); } catch (e) { n = ""; }
  if (!n) n = a.slice(0, 6) + "…" + a.slice(-4);
  await kv.put(k, n, { expirationTtl: 3600 });
  return n;
}
export async function settle(kv, day, now = Date.now()) {
  if (day < FIRST_DAY) return null;
  const done = await kv.get("or:res:" + day, "json");
  if (done) return done;
  const t0 = drawStart(day) / 1000, t1 = t0 + 3600;
  if (now / 1000 < t1 + 30) return null;
  const latest = await blk("latest");
  if (latest.t < t1 + 5) return null;
  const b0 = await blockAt(t0, latest), b1 = await blockAt(t1, latest), end = await blk(b1);
  // 开奖区块 = 开奖窗口里的随机一块，由 22:00 那一块的哈希决定（开奖前谁都不知道）
  const pick = b0 + Number(BigInt(end.h) % BigInt(Math.max(1, b1 - b0))), pb = await blk(pick), px = await priceMilli(pick, scOf(day));
  const cool0 = (await kv.get("or:cool", "json")) || {}, ck0 = (w) => (w.name && w.name.indexOf("…") < 0 ? w.name : w.a);
  const all = (await guessesOf(kv, day)).filter((g) => !SKIP.has(g.a) && !((cool0[ck0(g)] || "") >= day) && !((cool0[g.a] || "") >= day)); // 冷却中的（开奖前抢先提交的）不算
  const { rev, allot } = await allotOf(kv, day);
  const poolObj = { pool: await poolNow(kv) };
  let best = null;
  const exact = [];
  for (const g of all) for (const [p, t] of g.ps) {
    const diff = Math.abs(p - px.m);
    if (!best || diff < best.diff || (diff === best.diff && t < best.t)) best = { a: g.a, name: g.name, p, t, diff };
    if (diff === 0 && !exact.some((x) => x.name === g.name)) exact.push({ a: g.a, name: g.name, p, t });
  }
  // 第二名：除了第一名那个名字以外，最接近的（同样一样接近先提交的得）
  let second = null;
  if (best) for (const g of all) if (g.name !== best.name) for (const [p, t] of g.ps) {
    const diff = Math.abs(p - px.m);
    if (!second || diff < second.diff || (diff === second.diff && t < second.t)) second = { a: g.a, name: g.name, p, t, diff };
  }
  // 站长定：有人完全猜中那天，四个奖才一起发；没人猜中，全部留在奖池继续滚（也不禁赛）
  // 天眼通 / 地灵通 = 除了神算子以外最接近的两个名字（不然最接近的就是神算子本人）
  best = null; second = null;
  if (exact.length && !dailyOn(day)) {
    const exN = new Set(exact.map((x) => x.name)), near = (skip) => {
      let r = null;
      for (const g of all) if (!exN.has(g.name) && g.name !== skip) for (const [p, t] of g.ps) {
        const diff = Math.abs(p - px.m);
        if (!r || diff < r.diff || (diff === r.diff && t < r.t)) r = { a: g.a, name: g.name, p, t, diff };
      }
      return r;
    };
    best = near(null); second = best ? near(best.name) : null;
  }
  /* 每日前三（DAILY_FROM 起）：除神算子外离揭晓价最近的 3 个名字（一个名字、一个钱包只占一个名额；一样近先提交的得；每日奖冷却中的跳过、名额顺延） */
  let daily = [], dailyPaid = 0, owed = 0, dcool = {};
  if (dailyOn(day)) {
    dcool = (await kv.get("or:dcool", "json")) || {};
    const exN = new Set(exact.map((x) => x.name)), exA = new Set(exact.map((x) => x.a)), cand = [];
    for (const g of all) {
      if (exN.has(g.name) || exA.has(g.a) || (dcool[ck0(g)] || "") >= day || (dcool[g.a] || "") >= day) continue;
      let b = null;
      for (const [p, t] of g.ps) { const diff = Math.abs(p - px.m); if (!b || diff < b.diff || (diff === b.diff && t < b.t)) b = { a: g.a, name: g.name, p, t, diff }; }
      if (b) cand.push(b);
    }
    cand.sort((x, y) => x.diff - y.diff || x.t - y.t);
    for (const c of cand) { if (daily.some((x) => x.a === c.a || x.name === c.name)) continue; daily.push(c); if (daily.length >= DAILY_TOP) break; }
    /* 每人发多少放到下面、读完奖池钱包余额以后再算（站长 2026-11-15：奖池改由团队注入，不再有「当天进账」这个公式数） */
    /* 前几天中了每日奖、还在等烧名字的钱还躺在奖池钱包里，不能算进大奖 */
    owed = cents((((await kv.get("or:pay", "json")) || []).filter((x) => x.kind === "daily" && !x.tx && !x.forfeit)).reduce((t, x) => t + (x.amt || 0), 0));
  }
  // 奖金只发 AiLGNS：DAI 金额按揭晓这一刻的 OTC 预言机价折成 AiLGNS 数量（站长 2026-11-05 定）
  let pxOtc = px.raw; try { pxOtc = (await otcHi(kv)).px || px.raw; } catch (e) { /* 读不到就按 DEX 价 */ }
  const heldAll = await heldNow(pxOtc); // 钱包里实际有的钱（里面的 AiLGNS 也按同一个 OTC 价折，这样要发的 AiLGNS 加起来不会超过钱包里有的）：读不到就不开奖，下次再算（宁可晚，不能多发）
  /* 前几期已经中奖、还在等烧名字 / 等认证的奖，钱还躺在奖池钱包里：那是别人的，不能再算进这一期（站长 2026-11-14 晚：按实际能发的来） */
  const owedAll = cents(((await kv.get("or:pay", "json")) || []).filter((x) => !x.tx && !x.forfeit && payState(x) !== "forfeit").reduce((t, x) => t + (x.ail > 0 ? x.ail * pxOtc : (x.amt || 0)), 0));
  const held = Math.max(0, cents(heldAll - owedAll));
  if (dailyOn(day) && daily.length) { /* 每日前三：从奖池钱包里实际有的钱出，每人最多 DAILY_PRIZE；不够就这几个人平分钱包里的，绝不多发 */
    const eachD = cents(Math.min(DAILY_PRIZE, held / daily.length));
    if (eachD > 0) for (const w of daily) w.amt = eachD; else daily = [];
    dailyPaid = cents(daily.length * eachD);
  }
  const closestAmt = best ? Math.floor(held * CLOSEST * 100) / 100 : 0; // 按奖池实际总额的比例发
  const secondAmt = second ? Math.floor(held * SECOND * 100) / 100 : 0;
  const poolBefore = poolObj.pool, poolIn = cents(allot - dailyPaid), pool = cents(poolBefore + poolIn - closestAmt - secondAmt);
  // 猜中那天：奖池 30% 给本周期 OTC 手续费贡献前 3 名（50/30/20），然后周期清零
  const cyc = weekStart(day);
  let kings = [], kingPaid = 0;
  if (isWeekEnd(day) && !dailyOn(day) && kingOn(day)) { // 周日：本周贡献榜结算（2026-11-08 起不再等大奖）
    const kbud = await kingBudget(kv, cyc, day, held - closestAmt - secondAmt), kb = await kingsOf(kv, cyc, day, kbud.total);
    kings = kb.top.filter((k) => k.amt > 0).map((k) => ({ a: k.a, name: k.name, fee: k.fee, amt: k.amt, share: k.share }));
    kingPaid = cents(kings.reduce((t, k) => t + k.amt, 0));
  }
  const each = exact.length ? cents(Math.max(0, held - closestAmt - secondAmt - kingPaid - dailyPaid) / exact.length) : 0; // 大奖：账户里实际有多少（扣掉第一、第二名、贡献王）就平分多少
  const toAil = (v) => Math.floor((v / pxOtc) * 1e6) / 1e6;
  if (best) best.ail = toAil(closestAmt);
  if (second) second.ail = toAil(secondAmt);
  for (const k of kings) k.ail = toAil(k.amt);
  for (const w of daily) w.ail = toAil(w.amt);
  const eachAil = toAil(each);
  const res = {
    day, b0, b1, block: pick, blockTime: pb.t, endHash: end.h, px: px.m, sc: scOf(day), pxRaw: px.raw, reserves: [px.ail, px.dai],
    n: all.length, guesses: all.reduce((s, g) => s + g.ps.length, 0), rev, allot,
    pxOtc, heldAll, owedAll,
    closest: best ? { a: best.a, name: best.name, p: best.p, diff: best.diff, amt: closestAmt, ail: best.ail } : null,
    second: second ? { a: second.a, name: second.name, p: second.p, diff: second.diff, amt: secondAmt, ail: second.ail } : null,
    jackpot: { winners: exact, each, eachAil, pool: exact.length ? cents(each * exact.length) : Math.max(0, cents(held - closestAmt - secondAmt)) }, poolBefore, poolIn, poolAfter: exact.length ? 0 : pool, at: now,
    kings, cyc, kingPaid, kingRule: isWeekEnd(day) && !dailyOn(day) && kingOn(day) ? await kingBudget(kv, cyc, day, held - closestAmt - secondAmt) : null,
    daily: daily.map((w) => ({ a: w.a, name: w.name, p: w.p, diff: w.diff, amt: w.amt, ail: w.ail })), dailyPaid, dailyRule: dailyOn(day) ? { prize: DAILY_PRIZE, top: DAILY_TOP, cool: DAILY_COOL_DAYS } : null,
  };
  if ((await kv.get("or:res:" + day))) return JSON.parse(await kv.get("or:res:" + day)); // 别的请求刚算完
  await kv.put("or:res:" + day, JSON.stringify(res));
  await kv.put("or:last", JSON.stringify(res));
  await kv.put("or:pool", JSON.stringify({ pool: res.poolAfter, day, cyc }));
  if (kings.length) await kv.put("or:kingbadge", JSON.stringify({ until: addDay(day, KING_BADGE_DAYS), a: kings.map((k) => k.a), day })); // 🏆 本周贡献王标志挂 7 天
  const pay = (await kv.get("or:pay", "json")) || [], wins = (await kv.get("or:wins", "json")) || {};
  const add = (kind, w, amt, ail) => { const id = day + ":" + kind + ":" + w.name; if (amt > 0 && !pay.some((x) => x.id === id)) pay.push({ id, day, a: w.a, name: w.name, kind, amt, ail, at: now }); }; // at：中奖时间，先烧才发的 3 天从这里算
  if (best) { add("closest", best, closestAmt, best.ail); (wins[best.name] = wins[best.name] || [0, 0])[0]++; }
  if (second) add("second", second, secondAmt, second.ail); // 第二名：发奖，不进榜、不冷却
  for (const w of exact) { add("jackpot", w, each, eachAil); (wins[w.name] = wins[w.name] || [0, 0])[1]++; }
  for (const w of daily) { add("daily", w, w.amt, w.ail); (wins[w.name] = wins[w.name] || [0, 0])[0]++; } /* 每日前三：发奖、进「最接近次数」榜、只冷却每日奖 7 天 */
  for (const w of kings) add("king", w, w.amt, w.ail); // 贡献王：发奖，不进榜、不冷却
  await kv.put("or:pay", JSON.stringify(pay.slice(-500)));
  await kv.put("or:wins", JSON.stringify(wins));
  // 中奖的名字冷却 7 轮：下一轮起暂停，第 8 轮恢复
  const cool = (await kv.get("or:cool", "json")) || {}, until = COOL_FOREVER, today = bjDay(now);
  const ck = (w) => (w.name && w.name.indexOf("…") < 0 ? w.name : w.a);
  const ban = (w) => { cool[ck(w)] = until; cool[w.a] = until; }; // 名字 + 钱包一起永久停用
  if (best) ban(best);
  if (second) ban(second);
  for (const w of exact) ban(w);
  for (const k of Object.keys(cool)) if (cool[k] < today) delete cool[k];
  await kv.put("or:cool", JSON.stringify(cool));
  if (daily.length) {
    const du = addDay(day, DAILY_COOL_DAYS);
    for (const w of daily) { dcool[ck(w)] = du; dcool[w.a] = du; }
    for (const k of Object.keys(dcool)) if (dcool[k] < day) delete dcool[k];
    await kv.put("or:dcool", JSON.stringify(dcool));
  }
  return res;
}

// 🔥 先烧才发（站长 2026-11-09 定）：BURN_FROM 起开出的奖，中奖钱包要先把 1 枚创世 .ailgns 名转进黑洞地址 DEAD（#/genesis 页有按钮），
// 网站核对链上 Transfer(中奖钱包 → DEAD) 记录后才把这笔奖放进「待发」给机器人；一枚只抵一次（or:burns = { tokenId: payId }）；
// 中奖后 BURN_DAYS 天还没烧 → 标 forfeit（放弃），钱留在奖池（奖池显示的本来就是钱包实际余额，不用再记账）。BURN_FROM 之前的老奖照旧直接发。
export const BURN_FROM = "2026-11-09", BURN_DAYS = 3, DEAD = "0x000000000000000000000000000000000000dead";
/* 🏆 站长 2026-11-23：「大于 100 美金才销毁创世域名，因为创世域名已经铸造完毕，购买价格提高了」，稍后又说「大于 50 dai 吧」→ 周榜的奖（kind "week"）分到超过 WK_BURN_MIN DAI 的才要烧 1 枚创世名；
   50 DAI 及以下的不用烧（改成上传宣传截图，见 lib/weekly.js）。预言家的奖没动。 */
export const WK_BURN_MIN = 50;
export const needBurn = (x) => (x.kind === "week" ? Number(x.amt || 0) > WK_BURN_MIN : x.day >= BURN_FROM);
export const payDue = (x) => (x.at || drawStart(x.day) + 3600e3) + BURN_DAYS * 86400e3; // 截止：中奖（揭晓窗口结束）起 3 天
// 🏆 站长 2026-11-10 定：神算子大奖领奖前要「注册并销毁」价值 ≥ 奖金 30% 的 .ailgns 名字（按 5 DAI/个向上取整，任何 .ailgns 名字都算，烧过的永久作废）；
//    其余奖项（天眼通 / 地灵通 / 贡献王）仍是烧 1 枚创世名。注册费 2026-11-11 起先按普通注册分（30% 谷歌社交账号钱包、70% 每日奖池）；极速预言家上线再改回 90% 进极速资金池。
export const JP_BURN_FROM = "2026-11-10", JP_RATE = 0.3, NAME_PRICE = 5;
export const needCount = (x) => (x.kind === "jackpot" && x.day >= JP_BURN_FROM ? Math.max(1, Math.ceil(Number(x.amt || 0) * JP_RATE / NAME_PRICE)) : 1);
export const burnedCount = (x) => Number(x.bn || (x.burn ? 1 : 0));
// 📣 先宣告再发奖（站长 2026-11-14 定）：SAY_FROM 那一期起开出的奖（含 11-13 那期还没发的大奖），烧完名字以后，中奖人还要到 DeBox 社区发帖宣告自己中奖，
//    把帖子链接交到预言家页；团队在工单后台核对后点「通过」（x.ok），这笔才进「待发」给机器人。目的：让中奖的人站出来，社区看得见是真人，防作弊、防质疑。
//    状态：wait 等烧名字 → say 等中奖人交 DeBox 帖子链接 → review 交了等团队认证 → ready 机器人待发 → paid。已经发出去的不受影响。
export const SAY_FROM = "2026-11-13";
export const needSay = (x) => x.day >= SAY_FROM;
// 2026-11-16 起凭证改成截图 / 视频（functions/api/oracle-proof.js）：x.say = { n: 截图张数, v: 有视频, url: 老办法交的 DeBox 帖子链接, at }，有任何一样就算「交了，等团队看」
export const sayHas = (x) => !!(x && x.say && (x.say.url || x.say.n > 0 || x.say.v));
// 🤖 小奖自动通过（站长 2026-11-18：每天 3 笔手动点太累）：每日前三（20 DAI 一笔）交了像样的截图 / 视频就自动通过，不用站长点；
//    奖只会发到中奖时登记的钱包，别人乱传也领不走；烧名字那一关照旧由链上记录把关。大奖和其它奖项仍然要站长点「通过」。
export const AUTO_KIND = "daily", AUTO_MAX = 20;
export const autoOk = (x) => !!x && x.kind === AUTO_KIND && Number(x.amt || 0) > 0 && Number(x.amt) <= AUTO_MAX;
export const sayUrlOk = (u) => /^https:\/\/([a-z0-9-]+\.)*debox\.[a-z]{2,10}\/[^\s<>"']{1,280}$/i.test(String(u || "")); // 只收 DeBox 的 https 链接
export const sayText = (id, url, a) => "AiLGNS 每日预言家 · 领奖宣告\n奖项编号：" + id + "\n我在 DeBox 社区的宣告帖：" + url + "\n地址：" + a; // 中奖钱包签这段话，证明链接是本人交的
export function payState(x) { return x.tx ? "paid" : x.forfeit ? "forfeit" : needBurn(x) && burnedCount(x) < needCount(x) ? "wait" : needSay(x) && !x.ok ? (sayHas(x) ? "review" : "say") : "ready"; }
export async function burnCheck(kv, origin, pays, now = Date.now(), key = "or:pay") { /* key：这份中奖名单存在哪（周榜用 wk:pay）；烧过的名字登记表 or:burns 两边共用，一枚只抵一次 */
  const todo = pays.filter((x) => !x.tx && !x.forfeit && needBurn(x) && burnedCount(x) < needCount(x));
  if (!todo.length) return { pays, changed: false };
  let changed = false, snap = null, gen = null, used = null;
  const load = async () => {
    if (snap) return;
    snap = await fetch(origin + "/api/name-logs?a=" + NAMES.ailgns + "&t=" + T_XFER).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    gen = await fetch(origin + "/api/name-genesis").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    used = (await kv.get("or:burns", "json")) || {};
  };
  const dead = "0x" + DEAD.slice(2).padStart(64, "0");
  for (const x of todo) {
    await load();
    const need = needCount(x), anyName = need > 1; // 大奖：任何 .ailgns 名字都算；其它奖：要创世名
    if (snap && snap.l && gen) {
      const me = "0x" + String(x.a).slice(2).padStart(64, "0");
      const mine = snap.l.filter((l) => l[1] && l[1][1] && l[1][1].toLowerCase() === me && l[1][2] && l[1][2].toLowerCase() === dead && l[1][3]).sort((p, q) => p[0] - q[0]);
      const genNo = (id) => ((gen.g && gen.g[id.slice(2)]) || (gen.x && gen.x[id.slice(2)]) || 0); // 烧过的编号在 x 里
      let n = burnedCount(x);
      /* 🩹 自己补回丢掉的记账（2026-11-23，工单 #399：龙将军 22:19 烧了创世名，同一会儿又上传了领奖截图）。
         中奖名单 or:pay 有好几处在写（这里记「烧了几个」、上传凭证记「交了截图」）。两边撞在同一刻时，后写的那份会把先写的盖掉：
         这里刚记上的「已烧 1 个」被盖回 0，可是登记表 or:burns 里那枚名字已经写着「抵了这笔奖」，下一轮看到它「用过了」就跳过，这笔奖永远卡在「等烧名字」。
         所以每一轮先数一遍登记表里已经抵给这笔奖的名字：比名单上记的多，就以登记表为准补回来（一枚名字只会登记给一笔奖，不会多算）。 */
      const had = Object.keys(used).filter((k) => used[k] === x.id);
      if (x.id && had.length > n) {
        n = had.length; x.bn = n; changed = true;
        if (!x.burn) { const l0 = mine.find((l) => l[1][3].toLowerCase() === had[0]); x.burn = { id: had[0], no: genNo(had[0]), blk: l0 ? l0[0] : 0, at: now, heal: 1 }; }
      }
      for (const l of mine) {
        if (n >= need) break;
        const id = l[1][3].toLowerCase();
        if (used[id] || (!anyName && !genNo(id))) continue;
        used[id] = x.id; n++; changed = true; x.bn = n;
        if (!x.burn) x.burn = { id, no: genNo(id), blk: l[0], at: now };
      }
      if (n >= need) continue;
    }
    if (now > payDue(x)) { x.forfeit = now; changed = true; } // 3 天没烧：放弃，钱留池
  }
  if (changed) { await kv.put(key, JSON.stringify(pays.slice(-500))); await kv.put("or:burns", JSON.stringify(used || {})); }
  return { pays, changed };
}

// 🩹 补认销毁（站长 2026-11-20）：中奖人用别的钱包把名字烧了（第一例：0x9165… 中奖，0x362a… 烧的），burnCheck 只认中奖钱包自己烧的，所以一直卡在「等烧名字」。
// 团队核对后在工单后台填「烧名字的那个钱包」，把那一枚记到这笔奖上。只放宽「谁烧的」这一条，其余照旧：
// 名字必须真的进了黑洞、每日奖必须是创世名（大奖任何名字都算）、一枚只抵一次（or:burns）、必须是这一期开奖以后烧的、奖仍然只发到中奖时登记的钱包。
// burnFix 自己不联网（方便单测）：times = { 区块号: 毫秒时间 } 由 burnFixRun 向节点问来；dry = 只看不写。返回 { ok, x, hit:[{ id, no, blk }] } 或 { error }
const pad64 = (a) => "0x" + String(a).slice(2).toLowerCase().padStart(64, "0");
export function burnFixCands(snap, from) {
  const me = pad64(from), dead = pad64(DEAD);
  return ((snap && snap.l) || []).filter((l) => l[1] && l[1][1] && l[1][1].toLowerCase() === me && l[1][2] && l[1][2].toLowerCase() === dead && l[1][3]).sort((p, q) => p[0] - q[0]);
}
export function burnFix(pays, used, snap, gen, payId, from, times, now, dry) {
  const x = pays.find((p) => String(p.id) === String(payId || ""));
  if (!x) return { error: "没有这一笔" };
  if (x.tx) return { error: "这笔已经发出去了" };
  if (x.forfeit) return { error: "这笔已经过期作废了" };
  if (!needBurn(x) || burnedCount(x) >= needCount(x)) return { error: "这笔不差销毁，不用补认" };
  if (!/^0x[0-9a-f]{40}$/.test(String(from || "").toLowerCase())) return { error: "钱包地址不对（0x 开头，一共 42 位）" };
  if (String(from).toLowerCase() === String(x.a).toLowerCase()) return { error: "这就是中奖钱包：它自己烧的名字系统会自动认，不用补认" };
  const need = needCount(x), anyName = need > 1, t0 = drawStart(x.day);
  const genNo = (id) => ((gen && gen.g && gen.g[id.slice(2)]) || (gen && gen.x && gen.x[id.slice(2)]) || 0);
  const all = burnFixCands(snap, from), hit = [], why = { used: 0, plain: 0, early: 0, notime: 0 };
  let n = burnedCount(x);
  for (const l of all) {
    if (n >= need) break;
    const id = l[1][3].toLowerCase(), no = genNo(id), t = times && times[l[0]];
    if (used[id]) { why.used++; continue; }
    if (!anyName && !no) { why.plain++; continue; }
    if (!t) { why.notime++; continue; }
    if (t < t0) { why.early++; continue; }
    hit.push({ id, no, blk: l[0] }); n++;
  }
  if (!hit.length) return { error: !all.length ? "链上没查到这个钱包往黑洞烧过名字（刚烧的要等几分钟记录才同步）" : why.notime ? "暂时问不到那笔销毁的时间，过一会儿再试" : why.early ? "这个钱包烧的名字都是这一期开奖以前烧的，不能算" : why.plain ? "这个钱包烧的不是创世名，这个奖要烧创世名" : "这个钱包烧的名字已经抵过别的奖了" };
  if (!dry) {
    for (const h of hit) used[h.id] = x.id;
    x.bn = n;
    if (!x.burn) x.burn = { id: hit[0].id, no: hit[0].no, blk: hit[0].blk, at: now, fix: 1, by: String(from).toLowerCase() };
    else { x.burn.fix = 1; x.burn.by = String(from).toLowerCase(); }
  }
  return { ok: true, x, hit, n, need };
}
export async function burnFixRun(kv, origin, payId, from, dry, now = Date.now()) {
  const { pays } = await burnCheck(kv, origin, (await kv.get("or:pay", "json")) || [], now);
  const snap = await fetch(origin + "/api/name-logs?a=" + NAMES.ailgns + "&t=" + T_XFER).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const gen = await fetch(origin + "/api/name-genesis").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!snap || !snap.l || !gen) return { error: "链上记录暂时读不到，过一会儿再试" };
  const used = (await kv.get("or:burns", "json")) || {}, times = {};
  for (const l of burnFixCands(snap, from).slice(-30)) { // 一个钱包烧的名字一般就一两枚；最多问 30 个区块的时间
    if (times[l[0]] !== undefined) continue;
    const blk = await rpc("eth_getBlockByNumber", ["0x" + Number(l[0]).toString(16), false]).catch(() => null);
    if (blk && blk.timestamp) times[l[0]] = parseInt(blk.timestamp, 16) * 1000;
  }
  const r = burnFix(pays, used, snap, gen, payId, from, times, now, dry);
  if (r.ok && !dry) { await kv.put("or:pay", JSON.stringify(pays.slice(-500))); await kv.put("or:burns", JSON.stringify(used)); }
  return r;
}

// 防刷（2026-11-05 站长定）：名字必须在本轮开放前（前一晚 9 点揭晓开始时）就在这个钱包里。
// 刚注册的（从 0x0 转入）不受限；从别的钱包 / 市场转进来的要等到下一轮。看的是网站的链上记录快照（name-logs）。
const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const strArg = (s) => { const h = [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join(""); return "0000000000000000000000000000000000000000000000000000000000000020" + (h.length / 2).toString(16).padStart(64, "0") + h.padEnd(Math.ceil(h.length / 64) * 64, "0"); };
export async function heldSince(origin, a, name, round) {
  const label = name.split(".")[0], tld = name.split(".")[1], c = NAMES[tld];
  if (!c) return { ok: true };
  const id = (await rpc("eth_call", [{ to: c, data: "0x5fd846f2" + strArg(label) }, "latest"])).slice(2, 66).toLowerCase();
  const snap = await fetch(origin + "/api/name-logs?a=" + c + "&t=" + T_XFER).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!snap || !snap.l) return { ok: true }; // 快照读不到：不拦（宁可放过，不能误伤）
  const me = "0x" + a.slice(2).padStart(64, "0");
  let last = null;
  for (const l of snap.l) if (l[1][3] && l[1][3].toLowerCase() === "0x" + id && l[1][2].toLowerCase() === me) last = l;
  if (!last) return { ok: true, id, none: true }; // 快照还没收进去（刚注册几分钟）
  if (/^0x0+$/.test(last[1][1])) return { ok: true, mint: true }; // 注册铸造：马上能玩
  const t = (await blk(last[0])).t * 1000, open = cutoffAt(prevDay(round)); // 本轮开放 = 上一轮封卷那一刻
  if (t < open) return { ok: true, at: t };
  return { ok: false, at: t, open };
}

// 奖池预言机（站长 2026-11-05 定）：本站 OTC 市场 24 小时内、单笔 ≥ 10 DAI 的 AiLGNS/DAI 真实成交最高价，且不超过 DEX 现价 +50%（防小单刷价）
// 24 小时没合格成交就用最近一笔合格成交（同样封顶）；一笔都没有才用 DEX 现价
export const ORC_MIN_DAI = 10, ORC_CAP = 1.5;
export async function otcHi(kv) {
  const fl = ((await kv.get("otc:fills:ailgns", "json")) || []).filter((x) => x.px > 0 && x.dai >= ORC_MIN_DAI), now = Date.now() / 1000;
  const dex = (await priceMilli()).raw, cap = Math.round(dex * ORC_CAP * 1000) / 1000, day = fl.filter((x) => x.t >= now - 86400);
  const pick = day.length ? day.reduce((m, x) => (x.px > m.px ? x : m)) : fl[0];
  if (!pick) return { px: dex, at: Date.now(), n: 0, src: "dex", dex, cap };
  const capped = pick.px > cap;
  return { px: capped ? cap : pick.px, raw: pick.px, capped, at: pick.t * 1000, n: day.length, vol: Math.round(day.reduce((t, x) => t + x.dai, 0)), src: day.length ? "otc24" : "otclast", dex, cap };
}
