// 🏆 OTC 手续费周榜（规则在 lib/weekly.js）
// GET                          → 本周榜单、奖金钱包余额、每人预计分多少、上周结果、发放记录（公开，缓存 60 秒）
// GET  ?pay=1&key=BACKUP_KEY   → 已经烧了创世名、可以发的奖（发奖机器人用）；顺手结算刚结束的那一周、核对烧名字
// POST { action: "lock", id, key }      → 机器人转账前先锁住这一笔（锁上才转；锁了没转成不会自动重发，提醒站长人工核对）
// POST { action: "paid", id, tx, key } → 机器人转完账后记为已发
// 这里不发交易、不碰私钥。预览站（没有数据库）返回示例数据，只给站长看页面长什么样。
import { WK_POOL, WK_FROM, WK_TOP, WK_BURN_DAYS, WK_GAS, WK_STUCK, addDays, weekEnd, endAt, wkState, split, owedOf, availOf, boardOf, poolBal, settleWeek } from "../../lib/weekly.js";
import { burnCheck, payDue, bjDay, weekStart } from "../../lib/oracle.js";
import { pushInbox } from "../../lib/inbox.js";
import { alertOwner } from "../../lib/alert.js";

const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const rules = () => ({ top: WK_TOP, burnDays: WK_BURN_DAYS, gas: WK_GAS, from: WK_FROM });
const pub = (x) => ({ id: x.id, cyc: x.cyc, a: x.a, name: x.name, fee: x.fee, amt: x.amt, st: wkState(x), tx: x.tx || "", due: payDue(x) });

function demo(now) { // 预览站用的示例数据
  const cyc = weekStart(bjDay(now)), names = ["示例甲", "示例乙", "示例丙", "示例丁", "示例戊", "示例己", "示例庚", "示例辛", "示例壬", "示例癸"];
  const top = split(names.map((n, i) => ({ a: "0x" + String(i + 1).padStart(40, "0"), name: n + ".ailgns", fee: Math.round((320 - i * 29) * 100) / 100 })), 998);
  return { demo: true, on: true, pre: false, rules: rules(), cyc, to: weekEnd(cyc), endAt: endAt(cyc), n: 87, pool: { a: "0x" + "0".repeat(40), bal: 1000, owed: 0, avail: 998 }, top,
    last: { cyc: addDays(cyc, -7), to: addDays(cyc, -1), avail: 500, top: split(top.slice(0, 10).map((x) => ({ a: x.a, name: x.name, fee: x.fee })), 500) },
    pays: top.slice(0, 3).map((x, i) => ({ id: "wk:demo:" + i, cyc: addDays(cyc, -7), a: x.a, name: x.name, fee: x.fee, amt: [120.5, 96.2, 71.3][i], st: ["paid", "wait", "forfeit"][i], tx: i ? "" : "0x" + "ab".repeat(32), due: now + 2 * 86400e3 })), at: now };
}

async function view(ctx, kv, now) {
  const today = bjDay(now), cyc = weekStart(today), pre = today < WK_FROM;
  let pays = (await kv.get("wk:pay", "json")) || [];
  if (pays.some((x) => wkState(x) === "wait")) { try { pays = (await burnCheck(kv, new URL(ctx.request.url).origin, pays, now, "wk:pay")).pays; } catch (e) { /* 核对不了就先按原样显示 */ } }
  let pool = null;
  if (WK_POOL) { try { const bal = await poolBal(), owed = owedOf(pays); pool = { a: WK_POOL, bal, owed, avail: availOf(bal, owed) }; } catch (e) { pool = { a: WK_POOL, bal: null, owed: owedOf(pays), avail: null }; } }
  const b = await boardOf(kv, cyc, weekEnd(cyc));
  const last = await kv.get("wk:res:" + addDays(cyc, -7), "json");
  return { on: !!WK_POOL, pre, rules: rules(), cyc, to: weekEnd(cyc), endAt: endAt(cyc), n: b.n, pool, top: split(b.top, pool && pool.avail != null && !pre ? pool.avail : 0),
    last: last ? { cyc: last.cyc, to: last.to, avail: last.avail, top: last.top } : null, pays: pays.slice(-30).reverse().map(pub), at: now };
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), kv = ctx.env.TEAM_KV, now = Date.now();
  if (!kv) return /(\.pages\.dev|^localhost|^127\.0\.0\.1)$/.test(u.hostname) ? json(demo(now)) : new Response("no kv", { status: 503 });
  if (u.searchParams.get("pay")) {
    if (!ctx.env.BACKUP_KEY || u.searchParams.get("key") !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
    let done = null;
    try { done = await settleWeek(kv, now); } catch (e) { return json({ error: "结算没成：" + String((e && e.message) || e).slice(0, 120), pay: [] }); }
    if (done) for (const w of done.top) if (w.amt > 0) { try { await pushInbox(kv, w.a, "sys", "🏆 OTC 手续费周榜\n你是 " + done.cyc + " 这一周的第 " + (done.top.indexOf(w) + 1) + " 名，分到 " + w.amt + " DAI。\n" + WK_BURN_DAYS + " 天内先销毁 1 枚创世名，机器人核对后自动转到你的钱包；过期算放弃。", "#/weekly"); } catch (e) { /* 通知失败不影响结算 */ } }
    let pays = (await kv.get("wk:pay", "json")) || [];
    try { pays = (await burnCheck(kv, u.origin, pays, now, "wk:pay")).pays; } catch (e) { return json({ error: "烧名字核对没成", pay: [] }); }
    const stuck = pays.filter((x) => wkState(x) === "sending" && now - x.lock > WK_STUCK);
    for (const x of stuck) { try { await alertOwner(ctx.env, kv, "wkstuck:" + x.id, 6 * 3600, "🏆 周榜有一笔奖金卡在「发放中」：" + x.name + " " + x.amt + " DAI（" + x.cyc + " 那一周）。机器人锁住后没记成已发，不会自动重发。请让技术人员到账本核对奖金钱包有没有转出这笔。", "#/scan/" + WK_POOL); } catch (e) { /* 提醒失败不影响发奖 */ } }
    return json({ pool: WK_POOL, settled: done ? done.cyc : null, pay: pays.filter((x) => wkState(x) === "ready").map((x) => ({ id: x.id, a: x.a, amt: x.amt })), stuck: stuck.map((x) => ({ id: x.id, a: x.a, amt: x.amt })) });
  }
  let c = await kv.get("wk:cache", "json");
  if (!c || now - c.at > 60e3) {
    try { c = await view(ctx, kv, now); ctx.waitUntil(kv.put("wk:cache", JSON.stringify(c), { expirationTtl: 600 })); } catch (e) { if (!c) return json({ error: "读取失败，请稍后再试" }, 500); }
  }
  return json(c);
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  if (b.action !== "paid" && b.action !== "lock") return json({ error: "不认识的操作" }, 400);
  if (!ctx.env.BACKUP_KEY || b.key !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
  if (b.action === "lock") {
    const ps = (await kv.get("wk:pay", "json")) || [], p = ps.find((q) => q.id === b.id);
    if (!p) return json({ error: "没有这笔" }, 404);
    if (wkState(p) !== "ready") return json({ ok: false, st: wkState(p) }); /* 不是「可以发」的一律不给锁：已发 / 已锁 / 没烧 / 已放弃 */
    p.lock = Date.now();
    await kv.put("wk:pay", JSON.stringify(ps));
    return json({ ok: true, a: p.a, amt: p.amt });
  }
  if (!/^0x[0-9a-f]{64}$/.test(String(b.tx || ""))) return json({ error: "交易哈希不对" }, 400);
  const pays = (await kv.get("wk:pay", "json")) || [], x = pays.find((p) => p.id === b.id);
  if (!x) return json({ error: "没有这笔" }, 404);
  if (x.tx) return json({ ok: true, already: true });
  x.tx = b.tx; x.paidAt = Date.now();
  await kv.put("wk:pay", JSON.stringify(pays));
  await kv.delete("wk:cache");
  try { await pushInbox(kv, x.a, "sys", "✅ OTC 手续费周榜奖金到账\n" + x.cyc + " 这一周的奖金 " + x.amt + " DAI 已转到你的钱包。", "#/scan/" + x.a); } catch (e) { /* 通知失败不影响记账 */ }
  return json({ ok: true });
}
