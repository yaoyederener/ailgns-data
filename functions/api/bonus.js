// 🎁 创世域名分红 · 每日签到（站长 2026-11-21 定的五条：创世域名持有人 / 每日签到 / 奖池累计满 500 DAI 发一次 / 发 AiLGNS / 钱来自普通域名销售收入）
// 这个接口只管「签到记账」，不碰钱：不转账、不读私钥、不调合约。发放是另一件事（还没做，做的时候另起文件）。
//   GET  ?a=0x…  → { day, round, goal, me: { held, signed, days, tickets }, all: { w, today, t } }
//   GET          → 同上但没有 me
//   GET  ?rank=1 → 签到排行榜（站长 2026-11-21：「弄一个签到排行榜，把签到的创世域名都列出来」）：{ day, round, w, list: [{ a, t 票, n 天, td 今天签了没, gn 现在有几枚创世域名, g: [[创世编号, 名字]…] }] }
//   POST { a, sig } → 用钱包免费签名签到（签名文字见 signText，和 bonus.js 页面里的一字不差）
// 规矩：
//   · 一天 = 北京时间一个自然日；一个钱包一天签一次。
//   · 签到那一刻钱包里有几枚创世域名（挂在市场里的、已销毁的不算），当天就记几票；一枚都没有不能签。
//   · 一轮 = 从上次发放到奖池再满 500 DAI。轮号存在 KV bn:round，发放后才 +1（现在一直是第 1 轮）。
//   · 每个钱包每轮一条 KV：bn:s:<轮号>:<地址> = { d: { 日期: 当天票数 } }；汇总数字放在这条的 metadata 里，列目录就能算总数，不用逐条读。
import { recoverAddress } from "../../lib/evmsig.js";
import { banned } from "../../lib/ban.js";

export const GOAL = 500;
export const dayOf = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
export const signText = (day, a) => "AiLGNS 创世域名分红 · 每日签到\n日期：" + day + "\n钱包：" + a + "\n只是签名，不花钱、不转账。";
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
    if (!no || !want[a]) continue;
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
      const [rec, held] = await Promise.all([kv.get("bn:s:" + round + ":" + a, "json"), heldOf(u.origin, a)]);
      const d = (rec && rec.d) || {}, ks = Object.keys(d);
      out.me = { held, signed: day in d, days: ks.length, tickets: ks.reduce((s, k) => s + (Number(d[k]) || 0), 0) };
    }
    return json(out);
  } catch (e) { return json({ error: "签到数据暂时没读到，稍后再试" }, 503); }
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "签到暂时没开，稍后再试" }, 503);
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "bad" }, 400); }
  const a = String((b && b.a) || "").toLowerCase(), day = dayOf(Date.now());
  if (!/^0x[0-9a-f]{40}$/.test(a)) return json({ error: "钱包地址不对" }, 400);
  // 签名里带日期：跨零点那一两分钟里，昨天的签名也认（记在今天），省得客户白签一次
  const sig = String(b.sig || ""), ok = recoverAddress(signText(day, a), sig) === a || recoverAddress(signText(dayOf(Date.now() - 300e3), a), sig) === a;
  if (!ok) return json({ error: "签名核对失败，请用当前钱包重新签一次" }, 400);
  try {
    const held = await heldOf(new URL(ctx.request.url).origin, a);
    if (held < 0) return json({ error: "暂时没读到你的域名，过一分钟再点" }, 503);
    if (held === 0) return json({ error: "这个钱包里没有创世域名，签不了。刚买的等 1 分钟再点；挂在市场里卖的不算。" }, 400);
    const round = await roundOf(kv), key = "bn:s:" + round + ":" + a;
    const r = addDay(await kv.get(key, "json"), day, held);
    if (r.fresh) await kv.put(key, JSON.stringify(r.rec), { metadata: r.meta });
    return json({ ok: true, already: !r.fresh, day, round, me: { held, signed: true, days: r.meta.n, tickets: r.meta.t } });
  } catch (e) { return json({ error: "没记上，稍后再点一次" }, 503); }
}
