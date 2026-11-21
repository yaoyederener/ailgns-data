// 🎁 创世域名分红 · 每日签到（站长 2026-11-21 定的五条：创世域名持有人 / 每日签到 / 奖池累计满 500 DAI 发一次 / 发 AiLGNS / 钱来自普通域名销售收入）
// 这个接口只管「签到记账」，不碰钱：不转账、不读私钥、不调合约。发放是另一件事（还没做，做的时候另起文件）。
//   GET  ?a=0x…  → { day, round, goal, me: { held, signed, days, tickets }, all: { w, today, t } }
//   GET          → 同上但没有 me
//   POST { a, sig } → 用钱包免费签名签到（签名文字见 signText，和 bonus.js 页面里的一字不差）
// 规矩：
//   · 一天 = 北京时间一个自然日；一个钱包一天签一次。
//   · 签到那一刻钱包里有几枚创世域名（挂在市场里的、已销毁的不算），当天就记几票；一枚都没有不能签。
//   · 一轮 = 从上次发放到奖池再满 500 DAI。轮号存在 KV bn:round，发放后才 +1（现在一直是第 1 轮）。
//   · 每个钱包每轮一条 KV：bn:s:<轮号>:<地址> = { d: { 日期: 当天票数 } }；汇总数字放在这条的 metadata 里，列目录就能算总数，不用逐条读。
import { recoverAddress } from "../../lib/evmsig.js";

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

const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
async function roundOf(kv) { const r = (await kv.get("bn:round", "json")) || {}; return Number(r.no) > 0 ? Number(r.no) : 1; }
// 这个钱包现在有几枚创世域名：用现成的 /api/name-owned（日志快照算的，挂单的、销毁的自然不在里面）
async function heldOf(origin, a) {
  const one = (o) => fetch(o + "/api/name-owned?a=" + a).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const j = (await one(origin)) || (origin === "https://ailgns.dev" ? null : await one("https://ailgns.dev"));
  if (!j || !Array.isArray(j.list)) return -1; // 读不到：让页面提示稍后再试，绝不当成 0 枚
  return j.list.filter((x) => Number(x.no) > 0).length;
}
async function allOf(kv, round, day, ctx) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/bonus/_sum?r=" + round + "&d=" + day);
  try { const hit = await cache.match(ck); if (hit) return await hit.json(); } catch (e) { /* 没缓存就现算 */ }
  const metas = []; let cursor;
  for (let i = 0; i < 20; i++) { // 一页 1000 个钱包，最多数 2 万个
    const p = await kv.list({ prefix: "bn:s:" + round + ":", cursor });
    p.keys.forEach((k) => metas.push(k.metadata));
    if (p.list_complete || !p.cursor) break;
    cursor = p.cursor;
  }
  const s = sumAll(metas, day);
  try { ctx.waitUntil(cache.put(ck, Response.json(s, { headers: { "cache-control": "public, max-age=60" } }))); } catch (e) { /* 存不了不影响 */ }
  return s;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "签到暂时没开，稍后再试" }, 503);
  const u = new URL(ctx.request.url), a = (u.searchParams.get("a") || "").toLowerCase(), day = dayOf(Date.now());
  try {
    const round = await roundOf(kv), out = { day, round, goal: GOAL, all: await allOf(kv, round, day, ctx) };
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
