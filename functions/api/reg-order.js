// 🤖 代注册委托（站长 2026-11-08 定：批量注册第 2 步「授权机器人批量点击」）
//   客户在网页：① 授权 DAI 给机器人钱包 REG（只授权这次的总额）② 用钱包签名委托文字 → POST 到这里
//   机器人（monita/reg_bot.py，常驻循环每几秒看一次）：GET ?key= 取待办（每张待办一个记号 ro:p:<id>，见下面 MARK） → 用客户的授权 transferFrom 收款 → register(名字, 归客户) → POST result 回报
//   钱从头到尾不经过网站；机器人钱包只放 Gas。被抢先的名字不扣钱（先查可用再收款，注册失败原路退）。
// POST { a, names, day, sig }                      → 下单，返回 { id, total }
// GET  ?a=0x…                                      → 这个地址最近的委托（前端显示进度）
// GET  ?key=BACKUP_KEY                             → 待处理委托（机器人用）
// POST { action:"result", key, id, done, fail }    → 机器人回报；写站内信
// POST { action:"progress", key, id, done, fail, failn } → 机器人做完一小批就报一次（站长 2026-11-17：买票不设上限，一张委托可以有上千个名字，
//        机器人一轮只有几分钟，做不完的留在 o.todo 里下一轮接着做；全做完才算 done、才发站内信）。failn = 这一批没成功的名字（不带原因）
const MAX_NAMES = 2000; // 一张委托最多多少个名字（= 1 万 DAI）。不是业务上限，是签名文字和存储的技术上限；想买更多再下一张
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
const PEND = "ro:pend", MARK = "ro:p:", TTL = 30 * 86400;
/* 站长 2026-11-28「太慢了吧？」查出来的丢单：待办以前只记在一张共用清单 ro:pend 里，客户下单（客户那边的机房）和机器人做完（机器人那边的机房）
   都是「读整张 → 改 → 写回」。KV 各机房之间同步要几十秒，机器人做完一单写回清单时用的是还没看到刚下那单的旧清单，新单就被盖掉了、再也没人做
   （11-28 14:38:57 那张 2 个名字的委托就是这样卡住的）。现在每张待办单独一个记号 ro:p:<id>：下单时写、做完删，机器人按前缀列出来，谁也盖不掉谁。
   老清单 ro:pend 不再往里加，只有机器人这边读、清，等里面的单做完自然空掉。
   客户页面来问自己的委托时，发现还在等却没有记号的（以前被盖掉的），顺手补上记号，机器人下一轮就会做（HEAL 秒以上的才补，刚下的单本来就有记号） */
const HEAL = 45e3;

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  const u = new URL(ctx.request.url), a = String(u.searchParams.get("a") || "").toLowerCase(), key = u.searchParams.get("key");
  if (key) {
    if (!ctx.env.BACKUP_KEY || key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
    const legacy = (await kv.get(PEND, "json")) || [], marks = [];
    let cur = null;
    do { const r = await kv.list({ prefix: MARK, cursor: cur || undefined, limit: 1000 }); r.keys.forEach((k) => marks.push(k.name.slice(MARK.length))); cur = r.list_complete ? null : r.cursor; } while (cur && marks.length < 5000);
    const ids = [...new Set(legacy.concat(marks))].sort(), list = [], gone = []; // id 以下单时间开头：先下的先做
    for (const id of ids) {
      if (list.length >= 20) break;
      const o = await kv.get("ro:" + id, "json");
      if (o && o.state === "pending") list.push(Object.assign({}, o, { names: Array.isArray(o.todo) ? o.todo : o.names })); // 机器人只拿还没做的
      else gone.push(id);
    }
    for (const id of gone) if (marks.includes(id)) await kv.delete(MARK + id); // 做完了 / 过期了的记号顺手清掉
    const left = legacy.filter((id) => !gone.includes(id));
    if (left.length !== legacy.length) await kv.put(PEND, JSON.stringify(left)); // 老清单现在只有机器人这边在写，不会再互相盖掉
    return json({ list });
  }
  if (!isAddr(a)) return json({ error: "bad addr" }, 400);
  const ids = (await kv.get("ro:a:" + a, "json")) || [], list = [];
  for (const id of ids.slice(-10)) { const o = await kv.get("ro:" + id, "json"); if (o) list.push(o); }
  for (const o of list) { // 以前被盖掉的待办：补上记号（见文件上面 HEAL 那段）
    if (o.state === "pending" && Date.now() - (o.t || 0) > HEAL) { try { if (!(await kv.get(MARK + o.id))) await kv.put(MARK + o.id, "1", { expirationTtl: TTL }); } catch (e) { /* 补不上下次再补 */ } }
  }
  return json({ list: list.reverse() });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (b.action === "progress") {
    if (!ctx.env.BACKUP_KEY || b.key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
    const o = await kv.get("ro:" + String(b.id || ""), "json"); if (!o) return json({ error: "no order" }, 404);
    if (o.state !== "pending") return json({ ok: true, left: 0 });
    const done = (Array.isArray(b.done) ? b.done : []).map(String), fail = (Array.isArray(b.fail) ? b.fail : []).map(String), failn = (Array.isArray(b.failn) ? b.failn : []).map(String);
    const todo = Array.isArray(o.todo) ? o.todo : o.names.slice(), gone = new Set(done.concat(failn));
    o.done = (o.done || []).concat(done.filter((n) => todo.includes(n) && !(o.done || []).includes(n)));
    o.fail = (o.fail || []).concat(fail);
    o.todo = todo.filter((n) => !gone.has(n));
    if (o.todo.length) { await kv.put("ro:" + o.id, JSON.stringify(o), { expirationTtl: TTL }); return json({ ok: true, left: o.todo.length }); }
    await kv.put("ro:" + o.id, JSON.stringify(o), { expirationTtl: TTL });
    b.action = "result"; b.done = o.done; b.fail = o.fail; // 全做完了：走下面的收尾（改状态、出待办、发站内信）
  }
  if (b.action === "result") {
    if (!ctx.env.BACKUP_KEY || b.key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
    const o = await kv.get("ro:" + String(b.id || ""), "json"); if (!o) return json({ error: "no order" }, 404);
    o.done = Array.isArray(b.done) ? b.done : []; o.fail = Array.isArray(b.fail) ? b.fail : []; o.state = "done"; o.doneAt = Date.now();
    await kv.put("ro:" + o.id, JSON.stringify(o), { expirationTtl: TTL });
    await kv.delete(MARK + o.id);
    const old = (await kv.get(PEND, "json")) || []; if (old.includes(o.id)) await kv.put(PEND, JSON.stringify(old.filter((x) => x !== o.id))); // 老清单里的单做完了也拿掉
    const txt = "🤖 代注册完成：成功 " + o.done.length + " 个" + (o.done.length ? "（" + o.done.slice(0, 20).map((n) => n + ".ailgns").join("、") + (o.done.length > 20 ? " 等 " + o.done.length + " 个" : "") + "）" : "") + (o.fail.length ? "；没成功 " + o.fail.length + " 个：" + o.fail.slice(0, 20).join("、") + "（没成功的不扣钱）" : "") + "。名字已在你钱包里。";
    try { await pushInbox(kv, o.a, "sys", txt, "#/names/" + o.a); } catch (e) {}
    return json({ ok: true });
  }
  const a = String(b.a || "").toLowerCase(), day = String(b.day || ""), sig = String(b.sig || "");
  if (!isAddr(a)) return json({ error: "地址不对" }, 400);
  const names = [...new Set((Array.isArray(b.names) ? b.names : []).map((s) => String(s || "").trim().toLowerCase()))];
  if (!names.length || names.length > MAX_NAMES || names.some((n) => !valid(n))) return json({ error: "名字不合规或超过 " + MAX_NAMES + " 个" }, 400);
  const today = bjDay(), yday = new Date(Date.parse(today + "T12:00:00+08:00") - 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
  if (day !== today && day !== yday) return json({ error: "日期不对，请重新签名" }, 400);
  const total = names.reduce((s, n) => s + yearPrice(n), 0);
  let who = ""; try { who = recoverAddress(botText(names, total, a, day), sig); } catch (e) {}
  if (who !== a) return json({ error: "签名核对失败：请用付款的钱包签名" }, 400);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), o = { id, a, names, total, t: Date.now(), day, state: "pending", done: [], fail: [] };
  await kv.put("ro:" + id, JSON.stringify(o), { expirationTtl: TTL });
  await kv.put(MARK + id, "1", { expirationTtl: TTL }); // 待办记号：一单一个，不再往共用清单里加（见文件上面）
  const mine = (await kv.get("ro:a:" + a, "json")) || []; mine.push(id); await kv.put("ro:a:" + a, JSON.stringify(mine.slice(-50)), { expirationTtl: TTL });
  return json({ id, total });
}
