// 💊 站长吃药打卡：早上 10 点后一粒、晚上 22 点后一粒（北京时间）。到点没打卡就每半小时推一条站内信，直到点「吃了」。
//   GET  ?key=                      → 今天两粒的状态 + 最近 7 天
//   GET  ?nag=1&key=BACKUP_KEY      → 机器人每 5 分钟调一次：该催就催（写站内信给站长）
//   POST { key, slot: am|pm, action: taken|skip [, day] } → 打卡：taken 吃了（不再催），skip 没吃（15 分钟后再催）
// 口令和工单后台同一个。KV：med:<日期> = { am: {taken, t, nag, skips}, pm: {...} }
import { pushInbox } from "../../lib/inbox.js";

const OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 谷歌社交账号钱包（站长收件箱）
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
const NAG_MS = 30 * 60e3, SKIP_MS = 15 * 60e3;
const SLOT_NAME = { am: "早上那粒（10 点后）", pm: "晚上那粒（22 点后）" };

// 北京时间：现在该吃哪一粒（10:00–21:59 早粒；22:00 起到次日 03:59 算当天的晚粒）
function current(now) {
  const bj = new Date(now + 8 * 3600e3), h = bj.getUTCHours();
  let day = bj.toISOString().slice(0, 10), slot = "";
  if (h >= 10 && h < 22) slot = "am";
  else if (h >= 22) slot = "pm";
  else if (h < 4) { slot = "pm"; day = new Date(bj.getTime() - 86400e3).toISOString().slice(0, 10); }
  return { day, slot, bjDay: bj.toISOString().slice(0, 10) };
}
const load = async (kv, day) => (await kv.get("med:" + day, "json")) || { am: {}, pm: {} };
const save = (kv, day, d) => kv.put("med:" + day, JSON.stringify(d), { expirationTtl: 400 * 86400 });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  const u = new URL(ctx.request.url);
  if (!keyOk(ctx.env, u.searchParams.get("key"))) return json({ error: "口令不对" }, 403);
  const now = Date.now(), cur = current(now);
  if (u.searchParams.get("nag")) {
    if (!cur.slot) return json({ ok: true, nag: false, why: "不在吃药时段" });
    const d = await load(kv, cur.day), s = d[cur.slot] || {};
    if (s.taken) return json({ ok: true, nag: false, why: "已吃" });
    const wait = s.skips ? SKIP_MS : NAG_MS;
    if (s.nag && now - s.nag < wait) return json({ ok: true, nag: false, why: "刚催过" });
    const n = (s.nagN || 0) + 1;
    const msg = "💊 " + (n > 1 ? "第 " + n + " 次提醒：" : "") + "该吃药了：" + SLOT_NAME[cur.slot] + "。\n吃了请点「吃了」，没吃点「没吃」（我 15 分钟后再提醒），不点我每半小时催一次。";
    await pushInbox(kv, OWNER, "sys", msg, "#/med");
    d[cur.slot] = Object.assign(s, { nag: now, nagN: n }); await save(kv, cur.day, d);
    return json({ ok: true, nag: true, slot: cur.slot, n });
  }
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.parse(cur.bjDay + "T12:00:00+08:00") - i * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
    days.push({ day, d: await load(kv, day) });
  }
  return json({ now: cur, today: days[0].d, days });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (!keyOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
  const slot = b.slot === "pm" ? "pm" : "am", cur = current(Date.now());
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.day || "")) ? String(b.day) : cur.day;
  const d = await load(kv, day), s = d[slot] || {};
  if (b.action === "taken") { s.taken = Date.now(); s.skips = 0; }
  else if (b.action === "skip") { s.skips = (s.skips || 0) + 1; s.nag = Date.now(); delete s.taken; }
  else if (b.action === "undo") { delete s.taken; }
  else return json({ error: "action?" }, 400);
  d[slot] = s; await save(kv, day, d);
  return json({ ok: true, day, slot, s });
}
