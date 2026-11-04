// 🔮 AiLGNS 每日预言家：猜今晚 AiLGNS 价格（3 位小数），晚上 9–10 点随机一刻的链上价格开奖
// 奖金 = 前一天域名收入 × 20%：10% 给当天最接近的人，90% 滚进超级大奖池；猜中 3 位小数完全一样的人平分大奖池，没人中就一直滚
// KV：
//   or:g:<日期>:<主名字>  = { a, name, tier, ps: [[价格×1000, 提交时间]] }  这一轮的预测（一个主名字一个键，避免同时提交互相覆盖）
//   or:res:<日期>         = 开奖结果；or:last = 最近一次结果；or:pool = { pool }（超级大奖池，DAI）
//   or:pay                = [{ id, day, a, name, kind, amt, tx? }] 待发 / 已发奖金（发奖程序读这个）
//   or:wins               = { 主名字: [最接近次数, 大奖次数] } 预言家榜
import { RPCS } from "./teamlib.js";
import { loadTotal } from "./honor.js";

export const PAIR = "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0"; // AiLGNS/DAI 池子：token0 = AiLGNS，token1 = DAI
export const NAMES = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988" }; // 暂定只有 .ailgns 能参加（.lgns 合约 0x93af23fe… 先不算）
export const SHARE = 0.2, CLOSEST = 0.1; // 域名收入拿 20%；其中 10% 给最接近的，90% 进大奖池
export const DRAW_H = 21; // 北京时间 21:00–22:00 开奖窗口
export const MAX_GUESS = 10;
export const FIRST_DAY = "2026-11-06";
export const SEED_DAY = "2026-11-04"; // 开局奖池：11 月 4 日域名收入 × 20% 全部进超级大奖池（那天不开奖，没有「最接近」奖） // 第一期开奖（奖金 = 11 月 5 日域名收入 × 20%：发奖程序从 11 月 5 日 0 点起留奖金）
const SKIP = new Set(["0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", "0x89dd06754bb239b6c4c92bc47c8fa72889084e27"]); // 站长钱包不参加
const H = 3600e3;

export const bjDay = (ms) => new Date(ms + 8 * H).toISOString().slice(0, 10);
export const drawStart = (day) => Date.parse(day + "T" + String(DRAW_H).padStart(2, "0") + ":00:00+08:00");
const addDay = (day, n) => bjDay(Date.parse(day + "T12:00:00+08:00") + n * 24 * H);
// 现在提交算哪一轮：晚上 9 点前 = 今晚，9 点后 = 明晚
export function openRound(now = Date.now()) { const d = bjDay(now), r = now < drawStart(d) ? d : addDay(d, 1); return r < FIRST_DAY ? FIRST_DAY : r; }
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
  if (g[id]) return g[id];
  const seen = c.l.some((x) => x[1][1] === id);
  return !seen && n < GENESIS ? n + 1 : 0; // 快照还没收进去的新注册：创世名额没满就算创世
}
export async function eligibility(kv, a) {
  const name = await primaryName(a);
  const [gno, tot] = await Promise.all([name ? genesisNo(kv, name.split(".")[0]) : 0, loadTotal(kv)]);
  const vol = Math.round(((tot[a] && tot[a][0]) || 0) * 100) / 100;
  return { name, gno, vol, ok: gno > 0 || vol >= OTC_MIN, key: name || a };
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
  const all = (await guessesOf(kv, day)).filter((g) => !SKIP.has(g.a));
  const { rev, allot } = await allotOf(kv, day);
  const poolObj = { pool: await poolNow(kv) };
  let best = null;
  const exact = [];
  for (const g of all) for (const [p, t] of g.ps) {
    const diff = Math.abs(p - px.m);
    if (!best || diff < best.diff || (diff === best.diff && t < best.t)) best = { a: g.a, name: g.name, p, t, diff };
    if (diff === 0 && !exact.some((x) => x.name === g.name)) exact.push({ a: g.a, name: g.name, p, t });
  }
  const closestAmt = best ? cents(allot * CLOSEST) : 0;
  const poolBefore = poolObj.pool, poolIn = cents(allot - closestAmt), pool = cents(poolBefore + poolIn);
  const each = exact.length ? cents(pool / exact.length) : 0;
  const res = {
    day, b0, b1, block: pick, blockTime: pb.t, endHash: end.h, px: px.m, pxRaw: px.raw, reserves: [px.ail, px.dai],
    n: all.length, guesses: all.reduce((s, g) => s + g.ps.length, 0), rev, allot,
    closest: best ? { a: best.a, name: best.name, p: best.p, diff: best.diff, amt: closestAmt } : null,
    jackpot: { winners: exact, each, pool }, poolBefore, poolIn, poolAfter: exact.length ? 0 : pool, at: now,
  };
  if ((await kv.get("or:res:" + day))) return JSON.parse(await kv.get("or:res:" + day)); // 别的请求刚算完
  await kv.put("or:res:" + day, JSON.stringify(res));
  await kv.put("or:last", JSON.stringify(res));
  await kv.put("or:pool", JSON.stringify({ pool: res.poolAfter, day }));
  const pay = (await kv.get("or:pay", "json")) || [], wins = (await kv.get("or:wins", "json")) || {};
  const add = (kind, w, amt) => { const id = day + ":" + kind + ":" + w.name; if (amt > 0 && !pay.some((x) => x.id === id)) pay.push({ id, day, a: w.a, name: w.name, kind, amt }); };
  if (best) { add("closest", best, closestAmt); (wins[best.name] = wins[best.name] || [0, 0])[0]++; }
  for (const w of exact) { add("jackpot", w, each); (wins[w.name] = wins[w.name] || [0, 0])[1]++; }
  await kv.put("or:pay", JSON.stringify(pay.slice(-500)));
  await kv.put("or:wins", JSON.stringify(wins));
  return res;
}
