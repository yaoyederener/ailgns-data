// 🎁 创世域名分红 · 每日签到（站长 2026-11-21 定的五条：创世域名持有人 / 每日签到 / 奖池累计满 500 DAI 发一次 / 发 AiLGNS / 钱来自普通域名销售收入）
// 这个接口只管「签到记账」，不碰钱：不转账、不读私钥、不调合约。发放是另一件事（还没做，做的时候另起文件）。
//   GET  ?a=0x…  → { day, round, goal, me: { held, ail, ailNeed, signed, days, tickets }, all: { w, today, t } }
//   GET          → 同上但没有 me
//   GET  ?rank=1 → 签到排行榜（站长 2026-11-21：「弄一个签到排行榜，把签到的创世域名都列出来」）：{ day, round, w, list: [{ a, t 票, n 天, td 今天签了没, gn 现在有几枚创世域名, g: [[创世编号, 名字]…] }] }
//   POST { a, sig } → 用钱包免费签名签到（签名文字见 signText，和 bonus.js 页面里的一字不差）
// 规矩：
//   · 一天 = 北京时间一个自然日；一个钱包一天签一次。
//   · 签到那一刻钱包里有几枚创世域名（挂在市场里的、已销毁的不算），当天就记几票；一枚都没有不能签。
//   · 2026-11-21 加：签到那一刻钱包里还要有至少 1 枚 AiLGNS（AIL_MIN，读链上余额）。
//   · 2026-11-21 夜 站长改门槛（「1. 至少 1 枚 ailgns 2. 至少 1 万 lgns 3. 质押的 lp 也算；有的人用的是小号，我们允许他主钱包签名即可」）：
//       二选一：AiLGNS ≥ 1 枚，或 LGNS ≥ 1 万枚；官方流动性池里质押的 LP（只有 AiLGNS/LGNS 池有质押）按里面实际含的两种币折算、和钱包余额相加。
//       创世域名在小号里的：主钱包签一次名给这个小号「作保」（POST { bind:1, main, sub, ts, sig }，记 KV bn:bm:<主钱包> = { s 小号, t }），
//       小号签到时签名文字里带上主钱包地址（signTextM），门槛按「小号 + 主钱包」合计。一个主钱包同一时间只给一个小号作保，换小号要等 7 天。
//       小号这边不存任何记录：主钱包是谁由小号自己的签到签名说了算，别人没法替它乱绑。
//   · 一轮 = 从上次发放到奖池再满 500 DAI。轮号存在 KV bn:round，发放后才 +1（现在一直是第 1 轮）。
//   · 每个钱包每轮一条 KV：bn:s:<轮号>:<地址> = { d: { 日期: 当天票数 } }；汇总数字放在这条的 metadata 里，列目录就能算总数，不用逐条读。
import { isStolen } from "../../lib/stolen.js";
import { recoverAddress } from "../../lib/evmsig.js";
import { banned } from "../../lib/ban.js";
import { RPCS } from "../../lib/teamlib.js";

export const GOAL = 500;
// 站长 2026-11-21：「上级要求，域名分红，需要持有一枚 ailgns」→ 签到那一刻要有至少 1 枚 AiLGNS。
// 站长 2026-11-21 夜放宽：AiLGNS ≥ 1 枚 或 LGNS ≥ 1 万枚，二选一；质押在官方流动性池里的 LP 也算；小号可以让主钱包作保（见上面的规矩）。
// 只是门槛：够了就行，多了不加票。挂在 OTC 卖单里、押在借贷里的不算。读不到时不放行也不当成 0，让客户稍后再点。之前已经签过的票照旧保留。
export const AIL_MIN = 1, LGNS_MIN = 10000;
const AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", LGNS = "0x4d1d808a081fdac440703b3765fc61f8028c06b8";
// 官方 LP 质押（awakehelix.io 流动性页）：只有 AiLGNS/LGNS 这个池有质押，LP 押在 GAUGE_LP_MANAGER 里，每个人押了多少读 lpOf(池子, 钱包)（2026-11-21 链上核过）
const LP_PAIR = "0xc5029d6e80d2fdce321b2b51010e9ce3b1edf1a2", LP_MGR = "0x5ddc8a13eabda89593beb885ab8b2afda26a3587";
// 官方质押里的 LGNS 也算（站长 2026-11-25「算吧」：客户质押了 1 万多枚 LGNS，钱包里是空的，签不了到）。
// 官方一共六个质押合约，各自记自己的账，每个都用 getDepositorBalance(钱包) 读这个人押着多少 LGNS（9 位小数）。2026-11-25 用真实钱包逐个核过，六个都读得出。
// gLGNS、ILO 共建、IDO 认购不在这里面，不算。
const STK = ["0x88ea98af226cd4402a3873400308a4d78784ece6", "0x04ed22c6d1d020a9b5e032e93d79ab28293ef72f", "0xf7788f5a5cbbafac4120c63c79dcd9f1931c7824",
  "0x5584cdeb1369673c91c6ad7ebea0ce7cb630ce60", "0x1e5feec473f7f445fc7f5feec0beabb2270b0b4e", "0xf190ab12b73bfe1b626379af96e8f1859ec91f20"]; // 360 天 / 600 天 / 即时 / 折扣 / 活跃积分 / 债券
const PER = 3 + STK.length; // 每个钱包问几次：balanceOf ×2、lpOf、六个质押
const isAddr = (x) => /^0x[0-9a-f]{40}$/.test(x);
const p64 = (a) => a.slice(2).padStart(64, "0");
// 纯计算：balanceOf 的返回值（18 位小数）→ 枚数，保留 6 位小数（往下取，不四舍五入，0.9999999 不能算成 1）
export function ailNum(hex) { return Number(BigInt(hex) / 10n ** 12n) / 1e6; }
// 纯计算，下面都用「百万分之一枚」的整数来加，免得 0.3 + 0.7 加出 0.9999999 过不了门槛
export const ailMicro = (hex) => Number(BigInt(hex) / 10n ** 12n); // AiLGNS 18 位小数
export const lgnsMicro = (hex) => Number(BigInt(hex) / 1000n); // LGNS 9 位小数
// 纯计算：押着的 LP 份额 → 里面含多少 AiLGNS、多少 LGNS（各自往下取）。res = getReserves 返回值，t0 = token0 返回值
export function lpMicro(lpHex, supHex, res, t0) {
  const lp = BigInt(lpHex), sup = BigInt(supHex);
  if (lp <= 0n || sup <= 0n) return { ail: 0, lgns: 0 };
  const r0 = BigInt("0x" + res.slice(2, 66)), r1 = BigInt("0x" + res.slice(66, 130)), ailFirst = "0x" + t0.slice(26).toLowerCase() === AIL;
  return { ail: Number((ailFirst ? r0 : r1) * lp / sup / 10n ** 12n), lgns: Number((ailFirst ? r1 : r0) * lp / sup / 1000n) };
}
// 纯计算：一批 eth_call 的结果 → 这几个钱包合计的持仓 { ail, lgns }（枚）。r 的顺序见 holdOf
export function holdSum(r, n) {
  let ail = 0, lgns = 0;
  for (let i = 0; i < n; i++) {
    const o = 3 + i * PER, lp = lpMicro(r[o + 2], r[2], r[1], r[0]);
    ail += ailMicro(r[o]) + lp.ail; lgns += lgnsMicro(r[o + 1]) + lp.lgns;
    for (let k = 0; k < STK.length; k++) lgns += lgnsMicro(r[o + 3 + k]); // 官方质押里的 LGNS
  }
  return { ail: ail / 1e6, lgns: lgns / 1e6 };
}
export const holdOk = (h) => !!h && (h.ail >= AIL_MIN || h.lgns >= LGNS_MIN);
// 读这几个钱包的持仓（钱包里的 AiLGNS、LGNS + 押在官方池里的 LP 折算）。一次批量请求；读不到返回 null（绝不当成 0）
async function holdOf(addrs) {
  const calls = [[LP_PAIR, "0x0dfe1681"], [LP_PAIR, "0x0902f1ac"], [LP_PAIR, "0x18160ddd"]]; // token0 / getReserves / totalSupply
  addrs.forEach((a) => { calls.push([AIL, "0x70a08231" + p64(a)], [LGNS, "0x70a08231" + p64(a)], [LP_MGR, "0x963fdeb3" + p64(LP_PAIR) + p64(a)]); STK.forEach((c) => calls.push([c, "0xb79215d6" + p64(a)])); }); // balanceOf ×2、lpOf(池子, 钱包)、六个质押的 getDepositorBalance(钱包)
  const body = JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: c[0], data: c[1] }, "latest"] })));
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const j = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body }).then((x) => x.json());
      if (!Array.isArray(j) || j.length !== calls.length) continue;
      const r = []; let bad = false;
      j.forEach((x) => { if (x && typeof x.result === "string" && /^0x[0-9a-f]+$/i.test(x.result) && x.result.length >= 66) r[x.id] = x.result; else bad = true; });
      if (bad || r.filter(Boolean).length !== calls.length || r[1].length < 130) continue;
      return holdSum(r, addrs.length);
    } catch (e) { /* 换下一个节点 */ }
  }
  return null; // 读不到
}
// 主钱包作保：一个主钱包同一时间只给一个小号作保；换小号要等 BIND_LOCK。作保的签名 10 分钟内有效（防止旧签名被人拿去重放）
const BIND_TTL = 600e3, BIND_LOCK = 7 * 86400e3;
export const bindText = (main, sub, ts) => "AiLGNS 创世域名分红 · 主钱包作保\n主钱包：" + main + "\n小号：" + sub + "\n时间：" + ts + "\n只是签名，不花钱、不转账。让这个小号用我的持仓过签到门槛。";
// 纯计算：主钱包现在能不能给 sub 作保。old = KV 里这个主钱包现有的记录。返回 { ok, already, wait（还要等几天） }
export function bindCheck(old, sub, now) {
  if (old && old.s === sub) return { ok: true, already: true, wait: 0 };
  if (old && now - Number(old.t) < BIND_LOCK) return { ok: false, already: false, wait: Math.ceil((Number(old.t) + BIND_LOCK - now) / 86400e3) };
  return { ok: true, already: false, wait: 0 };
}
// m 真的在给 a 作保才返回 m，否则返回 ""
async function mainOf(kv, a, m) { if (!isAddr(m) || m === a) return ""; const b = await kv.get("bn:bm:" + m, "json"); return b && b.s === a ? m : ""; }
const sh = (a) => a.slice(0, 6) + "…" + a.slice(-4);
export const dayOf = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
export const signText = (day, a) => "AiLGNS 创世域名分红 · 每日签到\n日期：" + day + "\n钱包：" + a + "\n只是签名，不花钱、不转账。";
// 小号带着主钱包签到：签名文字里多一行主钱包地址（和 bonus.js 页面里的一字不差）
export const signTextM = (day, a, m) => "AiLGNS 创世域名分红 · 每日签到\n日期：" + day + "\n钱包：" + a + "\n主钱包：" + m + "\n只是签名，不花钱、不转账。";
// 纯计算（方便单独测）：往一个钱包的本轮记录里记一天。返回 { rec, meta, fresh }；当天签过就原样返回 fresh = false
export function addDay(rec, day, held) {
  const d = Object.assign({}, (rec && rec.d) || {});
  const fresh = !(day in d);
  if (fresh) d[day] = held;
  const days = Object.keys(d), t = days.reduce((s, k) => s + (Number(d[k]) || 0), 0);
  return { rec: { d }, meta: { n: days.length, t, l: days.sort().slice(-1)[0] }, fresh };
}
// 纯计算：目录里各条的 metadata → 汇总（本轮签过的钱包数、今天签到的钱包数、总票数）
export function sumAll(metas, day) {
  let w = 0, today = 0, t = 0;
  for (const m of metas) { if (!m) continue; w++; t += Number(m.t) || 0; if (m.l === day) today++; }
  return { w, today, t };
}

// 纯计算：排行榜排序。票多的在前；票一样，签到天数多的在前；再一样按地址（保证每次顺序一样）
export function rankRows(rows, day, top) {
  return rows.filter((r) => r && r.m && Number(r.m.t) > 0)
    .map((r) => ({ a: r.a, t: Number(r.m.t) || 0, n: Number(r.m.n) || 0, td: r.m.l === day }))
    .sort((p, q) => q.t - p.t || q.n - p.n || (p.a < q.a ? -1 : 1)).slice(0, top);
}
// 纯计算：.ailgns 的 Transfer / NameRegistered 快照 + 创世编号表 → 这些钱包现在各有哪些创世域名 { 地址: [[创世编号, 名字]…]（编号从小到大） }
// 和 /api/name-owned 同一个规矩：主人 = 每个名字最后一次 Transfer 的接收方，所以挂在市场里的（在市场合约名下）、已销毁的（创世表里已删）都不算
export function genOf(xf, rg, g, want, isBanned) {
  const owner = {}, label = {}, out = {};
  xf.slice().sort((p, q) => p[0] - q[0]).forEach((l) => { if (l[1] && l[1][3] && l[1][2]) owner[l[1][3].toLowerCase()] = "0x" + l[1][2].slice(26).toLowerCase(); });
  rg.forEach((l) => { if (l[1] && l[1][1]) label[l[1][1].toLowerCase()] = decStr(l[2]); });
  for (const id of Object.keys(owner)) {
    const a = owner[id], no = g[id.slice(2)];
    if (!no || !want[a] || isStolen(id)) continue; /* ⚠️ 被盗名单上的不算（lib/stolen.js） */
    const nm = label[id]; if (!nm || (isBanned && isBanned(nm))) continue;
    (out[a] = out[a] || []).push([no, nm]);
  }
  for (const a of Object.keys(out)) out[a].sort((p, q) => p[0] - q[0]);
  return out;
}
const word = (r, i) => r.slice(2 + i * 64, 2 + (i + 1) * 64);
function decStr(r) { try { const off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2); return len > 0 && len < 200 ? new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)))) : ""; } catch (e) { return ""; } }
const NAMES = "0xbc408e9d7350967e7247c917a086cb4ece0ed988", T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const TOP = 100, SHOW = 50; // 榜上最多 100 个钱包；每个钱包最多列 50 个名字（再多页面写「还有 N 枚」）

const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
async function roundOf(kv) { const r = (await kv.get("bn:round", "json")) || {}; return Number(r.no) > 0 ? Number(r.no) : 1; }
// 这个钱包现在有几枚创世域名：用现成的 /api/name-owned（日志快照算的，挂单的、销毁的自然不在里面）
async function heldOf(origin, a) {
  const one = (o) => fetch(o + "/api/name-owned?a=" + a).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const j = (await one(origin)) || (origin === "https://ailgns.dev" ? null : await one("https://ailgns.dev"));
  if (!j || !Array.isArray(j.list)) return -1; // 读不到：让页面提示稍后再试，绝不当成 0 枚
  return j.list.filter((x) => Number(x.no) > 0).length;
}
async function rowsOf(kv, round) {
  const pre = "bn:s:" + round + ":", rows = []; let cursor;
  for (let i = 0; i < 20; i++) { // 一页 1000 个钱包，最多数 2 万个
    const p = await kv.list({ prefix: pre, cursor });
    p.keys.forEach((k) => rows.push({ a: k.name.slice(pre.length), m: k.metadata }));
    if (p.list_complete || !p.cursor) break;
    cursor = p.cursor;
  }
  return rows;
}
// 🏆 签到排行榜：KV 目录里的票数排好序，再配上每个钱包现在手里的创世域名。整份结果边缘缓存 60 秒
async function rankOf(kv, origin, round, day, ctx) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/bonus/_rank?r=" + round + "&d=" + day);
  try { const hit = await cache.match(ck); if (hit) return await hit.json(); } catch (e) { /* 没缓存就现算 */ }
  const rows = await rowsOf(kv, round), list = rankRows(rows, day, TOP), want = {};
  list.forEach((r) => { want[r.a] = 1; });
  const one = (o, p) => fetch(o + p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const get = (p) => one(origin, p).then((j) => j || (origin === "https://ailgns.dev" ? null : one("https://ailgns.dev", p)));
  let names = null; // 名字读不到：榜照样给，只是不带名字
  if (list.length) {
    const [xf, rg, gen] = await Promise.all([get("/api/name-logs?a=" + NAMES + "&t=" + T_XFER), get("/api/name-logs?a=" + NAMES + "&t=" + T_REG), get("/api/name-genesis")]);
    if (xf && xf.l && rg && rg.l && gen && gen.g) names = genOf(xf.l, rg.l, gen.g, want, banned);
  }
  list.forEach((r) => { const g = names ? names[r.a] || [] : null; r.gn = g ? g.length : -1; r.g = g ? g.slice(0, SHOW) : null; });
  const out = { day, round, w: rows.length, list, at: Date.now() };
  try { ctx.waitUntil(cache.put(ck, Response.json(out, { headers: { "cache-control": "public, max-age=" + (names || !list.length ? 60 : 10) } }))); } catch (e) { /* 存不了不影响 */ }
  return out;
}
async function allOf(kv, round, day, ctx) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/bonus/_sum?r=" + round + "&d=" + day);
  try { const hit = await cache.match(ck); if (hit) return await hit.json(); } catch (e) { /* 没缓存就现算 */ }
  const s = sumAll((await rowsOf(kv, round)).map((r) => r.m), day);
  try { ctx.waitUntil(cache.put(ck, Response.json(s, { headers: { "cache-control": "public, max-age=60" } }))); } catch (e) { /* 存不了不影响 */ }
  return s;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "签到暂时没开，稍后再试" }, 503);
  const u = new URL(ctx.request.url), a = (u.searchParams.get("a") || "").toLowerCase(), day = dayOf(Date.now());
  try {
    const round = await roundOf(kv);
    if (u.searchParams.get("rank")) return json(await rankOf(kv, u.origin, round, day, ctx));
    const out = { day, round, goal: GOAL, all: await allOf(kv, round, day, ctx) };
    if (/^0x[0-9a-f]{40}$/.test(a)) {
      const mq = (u.searchParams.get("m") || "").toLowerCase(), m = await mainOf(kv, a, mq); // m：小号页面上记着的主钱包；真的在作保才算
      const [rec, held, hold, back] = await Promise.all([kv.get("bn:s:" + round + ":" + a, "json"), heldOf(u.origin, a), holdOf(m ? [a, m] : [a]), kv.get("bn:bm:" + a, "json")]);
      const d = (rec && rec.d) || {}, ks = Object.keys(d);
      // ail / lgns：算进门槛的合计（钱包 + 质押的 LP + 作保的主钱包）；读不到是 -1。ok：够不够门槛（读不到是 null）。back：这个钱包自己正在给哪个小号作保
      out.me = { held, ail: hold ? hold.ail : -1, lgns: hold ? hold.lgns : -1, ailNeed: AIL_MIN, lgnsNeed: LGNS_MIN, ok: hold ? holdOk(hold) : null, main: m, mainBad: isAddr(mq) && !m ? mq : "",
        back: back && isAddr(back.s) ? { s: back.s, t: Number(back.t) || 0, lock: BIND_LOCK } : null, signed: day in d, days: ks.length, tickets: ks.reduce((s, k) => s + (Number(d[k]) || 0), 0) };
    }
    return json(out);
  } catch (e) { return json({ error: "签到数据暂时没读到，稍后再试" }, 503); }
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "签到暂时没开，稍后再试" }, 503);
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "bad" }, 400); }
  if (b && b.bind) { // 主钱包给小号作保：主钱包自己签名才算
    const main = String(b.main || "").toLowerCase(), sub = String(b.sub || "").toLowerCase(), ts = Number(b.ts), now = Date.now();
    if (!isAddr(main) || !isAddr(sub)) return json({ error: "钱包地址不对" }, 400);
    if (main === sub) return json({ error: "主钱包和小号不能是同一个地址" }, 400);
    if (!(ts > 0) || Math.abs(now - ts) > BIND_TTL) return json({ error: "签名过期了，请重新点一次" }, 400);
    let who = ""; try { who = recoverAddress(bindText(main, sub, ts), String(b.sig || "")); } catch (e) { who = ""; }
    if (who !== main) return json({ error: "签名核对失败，请用主钱包重新签一次" }, 400);
    try {
      const c = bindCheck(await kv.get("bn:bm:" + main, "json"), sub, now);
      if (!c.ok) return json({ error: "这个主钱包已经在给另一个小号作保，" + c.wait + " 天后才能换。" }, 400);
      if (!c.already) await kv.put("bn:bm:" + main, JSON.stringify({ s: sub, t: now }));
      return json({ ok: true, already: c.already, main, sub });
    } catch (e) { return json({ error: "没记上，稍后再点一次" }, 503); }
  }
  const a = String((b && b.a) || "").toLowerCase(), day = dayOf(Date.now());
  if (!isAddr(a)) return json({ error: "钱包地址不对" }, 400);
  // 签名里带日期：跨零点那一两分钟里，昨天的签名也认（记在今天），省得客户白签一次
  const sig = String(b.sig || ""), mq = String(b.m || "").toLowerCase(), days2 = [day, dayOf(Date.now() - 300e3)];
  const rec1 = (t) => { try { return recoverAddress(t, sig) === a; } catch (e) { return false; } };
  const okPlain = days2.some((d) => rec1(signText(d, a))), okM = !okPlain && isAddr(mq) && mq !== a && days2.some((d) => rec1(signTextM(d, a, mq)));
  if (!okPlain && !okM) return json({ error: "签名核对失败，请用当前钱包重新签一次" }, 400);
  try {
    const held = await heldOf(new URL(ctx.request.url).origin, a);
    if (held < 0) return json({ error: "暂时没读到你的域名，过一分钟再点" }, 503);
    if (held === 0) return json({ error: "这个钱包里没有创世域名，签不了。刚买的等 1 分钟再点；挂在市场里卖的不算。" }, 400);
    const round = await roundOf(kv), key = "bn:s:" + round + ":" + a;
    const before = await kv.get(key, "json");
    if (!(before && before.d && day in before.d)) { // 今天还没签过的才核对余额（签过的直接回「已签」）
      const m = okM ? await mainOf(kv, a, mq) : "";
      if (okM && !m) return json({ error: "主钱包 " + sh(mq) + " 现在没有给这个小号作保。请先用主钱包打开这页，点「主钱包签名作保」。" }, 400);
      const hold = await holdOf(m ? [a, m] : [a]);
      if (!hold) return json({ error: "暂时没读到你的持仓，过一会儿再点" }, 503);
      if (!holdOk(hold)) return json({ error: "签到要持有至少 " + AIL_MIN + " 枚 AiLGNS，或者至少 " + LGNS_MIN + " 枚 LGNS（官方质押里的 LGNS、质押在官方流动性池里的 LP 也算）。现在算到 AiLGNS " + hold.ail + " 枚、LGNS " + hold.lgns + " 枚，还不够。" }, 400);
    }
    const r = addDay(before, day, held);
    if (r.fresh) await kv.put(key, JSON.stringify(r.rec), { metadata: r.meta });
    return json({ ok: true, already: !r.fresh, day, round, me: { held, signed: true, days: r.meta.n, tickets: r.meta.t } });
  } catch (e) { return json({ error: "没记上，稍后再点一次" }, 503); }
}
