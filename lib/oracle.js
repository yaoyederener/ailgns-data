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
export const KING_IN = 0.15, KING_IN_FROM = "2026-11-10";
export async function weekInflow(kv, from, to) { let t = 0; for (let d = from; d <= to; d = addDay(d, 1)) t += (await allotOf(kv, d)).allot; return cents(t); } // 本周每天进奖池的钱（域名收入 × 70%）加起来
export async function kingBudget(kv, from, to, held) { // 这一周周榜能分的总额 + 按哪条规则
  if (to < KING_IN_FROM) return { total: Math.floor(held * KING * 100) / 100, mode: "held", base: held, rate: KING };
  const inflow = await weekInflow(kv, from, to); return { total: cents(inflow * KING_IN), mode: "inflow", base: inflow, rate: KING_IN };
}
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
export const fmtP = (m) => (m / 1000).toFixed(3);

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
// 价格（DAI / AiLGNS）× 1000，四舍五入到整数（= 3 位小数）；block 不给就是最新
export async function priceMilli(block) {
  const r = (await rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, block ? "0x" + block.toString(16) : "latest"])).slice(2);
  const ail = BigInt("0x" + r.slice(0, 64)), dai = BigInt("0x" + r.slice(64, 128));
  return { m: Number((dai * 2000n + ail) / (2n * ail)), raw: Number((dai * 1000000n) / ail) / 1e6, ail: r.slice(0, 64), dai: r.slice(64, 128) };
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
// 参加资格（满足其一）：① 主名字是创世域名（.ailgns 付费注册的前 1 万个）② OTC 累计成交满 5 万 DAI（和会员卡、荣耀榜同一口径）
export const OTC_MIN = 50000, GENESIS = 10000;
const T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
async function genesisNo(kv, label) {
  const h = Array.from(new TextEncoder().encode(label)).map((x) => x.toString(16).padStart(2, "0")).join("");
  const id = await rpc("eth_call", [{ to: NAMES.ailgns, data: "0x5fd846f2" + (32).toString(16).padStart(64, "0") + (h.length / 2).toString(16).padStart(64, "0") + h.padEnd(Math.ceil(h.length / 64) * 64 || 64, "0") }, "latest"]);
  const c = (await kv.get("nmlogs:" + NAMES.ailgns + ":" + T_REG.slice(2, 10), "json")) || { l: [] };
  const g = {};
  let n = 0;
  for (const x of c.l) { const k = x[1][1]; if (!g[k] && BigInt("0x" + x[2].slice(66, 130)) > 0n && n < GENESIS) g[k] = ++n; }
  // 🔥 烧进黑洞过的名字永久不算创世（站长 2026-11-09）：哪怕到期后被重新注册
  const xf = (await kv.get("nmlogs:" + NAMES.ailgns + ":" + T_XFER.slice(2, 10), "json")) || { l: [] }, dead64 = "0x" + DEAD.slice(2).padStart(64, "0");
  if (xf.l.some((t) => t[1] && t[1][3] && t[1][3].toLowerCase() === id && t[1][2] && t[1][2].toLowerCase() === dead64)) return 0;
  if (g[id]) return g[id];
  const seen = c.l.some((x) => x[1][1] === id);
  return !seen && n < GENESIS ? n + 1 : 0; // 快照还没收进去的新注册：创世名额没满就算创世
}
export async function eligibility(kv, a) {
  const name = await primaryName(a);
  const [gno, tot] = await Promise.all([name ? genesisNo(kv, name.split(".")[0]) : 0, loadTotal(kv)]);
  const vol = Math.round(((tot[a] && tot[a][0]) || 0) * 100) / 100;
  const key = name || a, cm = (await kv.get("or:cool", "json")) || {}, cool = [cm[key] || "", cm[a] || ""].sort().pop(), round = openRound(); // 名字和钱包都查：中过奖的名字、中过奖的钱包都不能再参加
  const coolOn = cool >= round; // cool = 暂停到哪一轮（含）
  return { name, gno, vol, ok: (gno > 0 || vol >= OTC_MIN) && !coolOn, key, cool: coolOn ? cool : "" };
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
  return (await Promise.all(keys.map((k) => kv.get(k, "json")))).filter(Boolean);
}
// 这一轮的奖金：前一天的域名收入 × 20%（日报统计里的数，站长自己付的不算）
export async function allotOf(kv, day) {
  const d = await kv.get("st:d:" + prevDay(day), "json");
  const rev = (d && d.nm && d.nm.dai) || 0;
  return { rev, allot: Math.floor(rev * SHARE * 100) / 100 };
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
export async function heldNow() {
  const [f, px] = await Promise.all([poolFunds(), priceMilli()]);
  return Math.floor((f.dai + f.ail * px.raw) * 100) / 100;
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
  const pick = b0 + Number(BigInt(end.h) % BigInt(Math.max(1, b1 - b0))), pb = await blk(pick), px = await priceMilli(pick);
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
  if (exact.length) {
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
  const held = await heldNow(); // 实际能发的钱：读不到就不开奖，下次再算（宁可晚，不能多发）
  const closestAmt = best ? Math.floor(held * CLOSEST * 100) / 100 : 0; // 按奖池实际总额的比例发
  const secondAmt = second ? Math.floor(held * SECOND * 100) / 100 : 0;
  const poolBefore = poolObj.pool, poolIn = allot, pool = cents(poolBefore + poolIn - closestAmt - secondAmt);
  // 猜中那天：奖池 30% 给本周期 OTC 手续费贡献前 3 名（50/30/20），然后周期清零
  const cyc = weekStart(day);
  let kings = [], kingPaid = 0;
  if (isWeekEnd(day)) { // 周日：本周贡献榜结算（2026-11-08 起不再等大奖）
    const kbud = await kingBudget(kv, cyc, day, held), kb = await kingsOf(kv, cyc, day, kbud.total);
    kings = kb.top.filter((k) => k.amt > 0).map((k) => ({ a: k.a, name: k.name, fee: k.fee, amt: k.amt, share: k.share }));
    kingPaid = cents(kings.reduce((t, k) => t + k.amt, 0));
  }
  const each = exact.length ? cents(Math.max(0, held - closestAmt - secondAmt - kingPaid) / exact.length) : 0; // 大奖：账户里实际有多少（扣掉第一、第二名、贡献王）就平分多少
  // 奖金只发 AiLGNS：DAI 金额按揭晓这一刻的 OTC 预言机价折成 AiLGNS 数量（站长 2026-11-05 定）
  let pxOtc = px.raw; try { pxOtc = (await otcHi(kv)).px || px.raw; } catch (e) { /* 读不到就按 DEX 价 */ }
  const toAil = (v) => Math.floor((v / pxOtc) * 1e6) / 1e6;
  if (best) best.ail = toAil(closestAmt);
  if (second) second.ail = toAil(secondAmt);
  for (const k of kings) k.ail = toAil(k.amt);
  const eachAil = toAil(each);
  const res = {
    day, b0, b1, block: pick, blockTime: pb.t, endHash: end.h, px: px.m, pxRaw: px.raw, reserves: [px.ail, px.dai],
    n: all.length, guesses: all.reduce((s, g) => s + g.ps.length, 0), rev, allot,
    pxOtc,
    closest: best ? { a: best.a, name: best.name, p: best.p, diff: best.diff, amt: closestAmt, ail: best.ail } : null,
    second: second ? { a: second.a, name: second.name, p: second.p, diff: second.diff, amt: secondAmt, ail: second.ail } : null,
    jackpot: { winners: exact, each, eachAil, pool: exact.length ? cents(each * exact.length) : Math.max(0, cents(held - closestAmt - secondAmt)) }, poolBefore, poolIn, poolAfter: exact.length ? 0 : pool, at: now,
    kings, cyc, kingPaid, kingRule: isWeekEnd(day) ? await kingBudget(kv, cyc, day, held) : null,
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
  return res;
}

// 🔥 先烧才发（站长 2026-11-09 定）：BURN_FROM 起开出的奖，中奖钱包要先把 1 枚创世 .ailgns 名转进黑洞地址 DEAD（#/genesis 页有按钮），
// 网站核对链上 Transfer(中奖钱包 → DEAD) 记录后才把这笔奖放进「待发」给机器人；一枚只抵一次（or:burns = { tokenId: payId }）；
// 中奖后 BURN_DAYS 天还没烧 → 标 forfeit（放弃），钱留在奖池（奖池显示的本来就是钱包实际余额，不用再记账）。BURN_FROM 之前的老奖照旧直接发。
export const BURN_FROM = "2026-11-09", BURN_DAYS = 3, DEAD = "0x000000000000000000000000000000000000dead";
export const needBurn = (x) => x.day >= BURN_FROM;
export const payDue = (x) => (x.at || drawStart(x.day) + 3600e3) + BURN_DAYS * 86400e3; // 截止：中奖（揭晓窗口结束）起 3 天
// 🏆 站长 2026-11-10 定：神算子大奖领奖前要「注册并销毁」价值 ≥ 奖金 30% 的 .ailgns 名字（按 5 DAI/个向上取整，任何 .ailgns 名字都算，烧过的永久作废）；
//    其余奖项（天眼通 / 地灵通 / 贡献王）仍是烧 1 枚创世名。注册费 2026-11-11 起先按普通注册分（30% 谷歌社交账号钱包、70% 每日奖池）；极速预言家上线再改回 90% 进极速资金池。
export const JP_BURN_FROM = "2026-11-10", JP_RATE = 0.3, NAME_PRICE = 5;
export const needCount = (x) => (x.kind === "jackpot" && x.day >= JP_BURN_FROM ? Math.max(1, Math.ceil(Number(x.amt || 0) * JP_RATE / NAME_PRICE)) : 1);
export const burnedCount = (x) => Number(x.bn || (x.burn ? 1 : 0));
export function payState(x) { return x.tx ? "paid" : x.forfeit ? "forfeit" : needBurn(x) && burnedCount(x) < needCount(x) ? "wait" : "ready"; }
export async function burnCheck(kv, origin, pays, now = Date.now()) {
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
  if (changed) { await kv.put("or:pay", JSON.stringify(pays.slice(-500))); await kv.put("or:burns", JSON.stringify(used || {})); }
  return { pays, changed };
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
