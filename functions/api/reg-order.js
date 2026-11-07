// 🤖 代注册委托（站长 2026-11-08 定：批量注册第 2 步「授权机器人批量点击」）
//   客户在网页：① 授权 DAI 给机器人钱包 REG（只授权这次的总额）② 用钱包签名委托文字 → POST 到这里
//   机器人（monita/reg_bot.py，每 5 分钟）：GET ?key= 取待办 → 用客户的授权 transferFrom 收款 → register(名字, 归客户) → POST result 回报
//   钱从头到尾不经过网站；机器人钱包只放 Gas。被抢先的名字不扣钱（先查可用再收款，注册失败原路退）。
// POST { a, names, day, sig }                      → 下单，返回 { id, total }
// GET  ?a=0x…                                      → 这个地址最近的委托（前端显示进度）
// GET  ?key=BACKUP_KEY                             → 待处理委托（机器人用）
// POST { action:"result", key, id, done, fail }    → 机器人回报；写站内信
// 签名文字模板必须和 names-batch.js 里的 botText 一字不差
import { recoverAddress } from "../../lib/evmsig.js";
import { pushInbox } from "../../lib/inbox.js";
import { bjDay } from "../../lib/stats.js";

const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const chars = (s) => Array.from(s).length, cn = (s) => /[\u4e00-\u9fff]/.test(s);
const valid = (s) => { const n = chars(s); return /^[a-z0-9\u4e00-\u9fff-]+$/.test(s) && n >= (cn(s) ? 2 : 3) && n <= 32 && s[0] !== "-" && s[s.length - 1] !== "-"; };
const yearPrice = (s) => { const n = chars(s); return cn(s) ? (n === 2 ? 50 : 5) : n === 3 ? 640 : n === 4 ? 160 : 5; };
const botText = (names, total, a, day) => "AiLGNS 代注册委托\n请机器人帮我注册（各 1 年，DAI 付款）：" + names.join("、") + "\n共 " + total + " DAI\n我的地址：" + a + "\n日期：" + day;
const json = (o, st) => Response.json(o, { status: st || 200, headers: { "cache-control": "no-store" } });
const PEND = "ro:pend", TTL = 30 * 86400;

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  const u = new URL(ctx.request.url), a = String(u.searchParams.get("a") || "").toLowerCase(), key = u.searchParams.get("key");
  if (key) {
    if (!ctx.env.BACKUP_KEY || key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
    const ids = (await kv.get(PEND, "json")) || [], list = [];
    for (const id of ids.slice(0, 20)) { const o = await kv.get("ro:" + id, "json"); if (o && o.state === "pending") list.push(o); }
    return json({ list });
  }
  if (!isAddr(a)) return json({ error: "bad addr" }, 400);
  const ids = (await kv.get("ro:a:" + a, "json")) || [], list = [];
  for (const id of ids.slice(-10)) { const o = await kv.get("ro:" + id, "json"); if (o) list.push(o); }
  return json({ list: list.reverse() });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (b.action === "result") {
    if (!ctx.env.BACKUP_KEY || b.key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
    const o = await kv.get("ro:" + String(b.id || ""), "json"); if (!o) return json({ error: "no order" }, 404);
    o.done = Array.isArray(b.done) ? b.done : []; o.fail = Array.isArray(b.fail) ? b.fail : []; o.state = "done"; o.doneAt = Date.now();
    await kv.put("ro:" + o.id, JSON.stringify(o), { expirationTtl: TTL });
    const ids = ((await kv.get(PEND, "json")) || []).filter((x) => x !== o.id); await kv.put(PEND, JSON.stringify(ids));
    const txt = "🤖 代注册完成：成功 " + o.done.length + " 个" + (o.done.length ? "（" + o.done.map((n) => n + ".ailgns").join("、") + "）" : "") + (o.fail.length ? "；没成功 " + o.fail.length + " 个：" + o.fail.join("、") + "（没成功的不扣钱）" : "") + "。名字已在你钱包里。";
    try { await pushInbox(kv, o.a, "sys", txt, "#/names/" + o.a); } catch (e) {}
    return json({ ok: true });
  }
  const a = String(b.a || "").toLowerCase(), day = String(b.day || ""), sig = String(b.sig || "");
  if (!isAddr(a)) return json({ error: "地址不对" }, 400);
  const names = [...new Set((Array.isArray(b.names) ? b.names : []).map((s) => String(s || "").trim().toLowerCase()))];
  if (!names.length || names.length > 50 || names.some((n) => !valid(n))) return json({ error: "名字不合规或超过 50 个" }, 400);
  const today = bjDay(), yday = new Date(Date.parse(today + "T12:00:00+08:00") - 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
  if (day !== today && day !== yday) return json({ error: "日期不对，请重新签名" }, 400);
  const total = names.reduce((s, n) => s + yearPrice(n), 0);
  let who = ""; try { who = recoverAddress(botText(names, total, a, day), sig); } catch (e) {}
  if (who !== a) return json({ error: "签名核对失败：请用付款的钱包签名" }, 400);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), o = { id, a, names, total, t: Date.now(), day, state: "pending", done: [], fail: [] };
  await kv.put("ro:" + id, JSON.stringify(o), { expirationTtl: TTL });
  const ids = (await kv.get(PEND, "json")) || []; ids.push(id); await kv.put(PEND, JSON.stringify(ids.slice(-500)));
  const mine = (await kv.get("ro:a:" + a, "json")) || []; mine.push(id); await kv.put("ro:a:" + a, JSON.stringify(mine.slice(-50)), { expirationTtl: TTL });
  return json({ id, total });
}
