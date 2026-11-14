// 🤖 代烧委托（站长 2026-11-14 定「做机器人代烧」）：神算子大奖要烧上千个名字，普通钱包只能一个一个确认，太累。
//   客户在销毁页：① 在域名合约上把名字的操作权授给代注册机器人钱包 REG（setApprovalForAll，钱包确认 1 次）② 钱包签名委托文字 → POST 到这里
//   机器人（monita/burn_bot.py，每 5 分钟）：GET ?key= 取待办 → 自己再核一遍签名 → 只把委托清单里、还在客户钱包里的名字转进黑洞 → POST progress 回报
//   安全边界：只收「有待领神算子大奖」的钱包；数量不超过还差的个数；主名字不进清单；清单在下单时就定死（机器人只能烧清单里的）；
//           机器人烧够就停（按链上黑洞记录数）；委托 2 天过期；客户随时可以在链上取消授权，机器人立刻就动不了。
// POST { a, n, keep, day, sig }                                   → 下单，返回 { id, n }
// GET  ?a=0x…                                                     → 这个地址最新的委托进度（不带清单）
// GET  ?key=BACKUP_KEY                                            → 待处理委托（机器人用，带清单）
// POST { action:"progress", key, id, done, fail, blk0, state, note } → 机器人回报；做完写站内信
// 签名文字模板必须和 genesis.js、monita/burn_bot.py 里的一字不差
import { recoverAddress } from "../../lib/evmsig.js";
import { pushInbox } from "../../lib/inbox.js";
import { bjDay } from "../../lib/stats.js";
import { payState, needCount, burnedCount, primaryName, burnCheck } from "../../lib/oracle.js";

const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const burnText = (n, keep, a, day) => "AiLGNS 代销毁委托\n请机器人把我钱包里的 " + n + " 个 .ailgns 名字转进黑洞地址（永久销毁，拿不回来），用来领取预言家大奖。\n不动的名字：" + (keep ? keep + ".ailgns" : "无") + "\n我的地址：" + a + "\n日期：" + day;
const json = (o, st) => Response.json(o, { status: st || 200, headers: { "cache-control": "no-store" } });
const PEND = "bo:pend", TTL = 14 * 86400, MAX_AGE = 2 * 86400e3, MAX_N = 3000;
const pub = (o) => ({ id: o.id, a: o.a, n: o.n, keep: o.keep, t: o.t, state: o.state, done: o.done || 0, fail: o.fail || 0, note: o.note || "", doneAt: o.doneAt || 0 });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  const u = new URL(ctx.request.url), a = String(u.searchParams.get("a") || "").toLowerCase(), key = u.searchParams.get("key");
  if (key) {
    if (!ctx.env.BACKUP_KEY || key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
    const ids = (await kv.get(PEND, "json")) || [], list = [], keep = [];
    for (const id of ids.slice(0, 10)) {
      const o = await kv.get("bo:" + id, "json");
      if (!o || o.state !== "pending") continue;
      if (Date.now() - o.t > MAX_AGE) { o.state = "expired"; o.note = "超过 2 天没烧完，委托作废"; o.doneAt = Date.now(); await kv.put("bo:" + id, JSON.stringify(o), { expirationTtl: TTL }); continue; }
      list.push(o); keep.push(id);
    }
    if (keep.length !== ids.length) await kv.put(PEND, JSON.stringify(keep));
    return json({ list });
  }
  if (!isAddr(a)) return json({ error: "bad addr" }, 400);
  const id = await kv.get("bo:a:" + a), o = id ? await kv.get("bo:" + id, "json") : null;
  return json({ order: o ? pub(o) : null });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "no kv" }, 503);
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (b.action === "progress") {
    if (!ctx.env.BACKUP_KEY || b.key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
    const o = await kv.get("bo:" + String(b.id || ""), "json"); if (!o) return json({ error: "no order" }, 404);
    if (Number.isFinite(b.done)) o.done = Math.max(0, Math.min(o.n, Math.floor(b.done)));
    if (Number.isFinite(b.fail)) o.fail = Math.max(0, Math.floor(b.fail));
    if (Number.isFinite(b.blk0) && !o.blk0) o.blk0 = Math.floor(b.blk0); // 机器人第一次接单时的区块号：之后「烧了几个」从这里往后数链上黑洞记录
    if (typeof b.note === "string") o.note = b.note.slice(0, 200);
    else if (b.state === "done") o.note = ""; /* 烧完了：清掉上一轮留下的「正在烧」提示，免得站内信里带着旧话 */
    o.seen = Date.now();
    if (b.state === "done" && o.state === "pending") {
      o.state = "done"; o.doneAt = Date.now();
      const ids = ((await kv.get(PEND, "json")) || []).filter((x) => x !== o.id); await kv.put(PEND, JSON.stringify(ids));
      const txt = "🤖 机器人代烧完成：已把 " + o.done + " 个名字转进黑洞。" + (o.note ? "（" + o.note + "）" : "") + "\n接下来两件事：① 回销毁页点「取消授权」（收回机器人的操作权）② 到 DeBox 的 AiLGNS 社区发帖宣告中奖，把帖子链接交到预言家页，团队核对后发奖。";
      try { await pushInbox(kv, o.a, "sys", txt, "#/genesis"); } catch (e) {}
    }
    await kv.put("bo:" + o.id, JSON.stringify(o), { expirationTtl: TTL });
    return json({ ok: true });
  }
  const a = String(b.a || "").toLowerCase(), day = String(b.day || ""), sig = String(b.sig || ""), n = Math.floor(Number(b.n)), keep = String(b.keep || "").trim().toLowerCase();
  if (!isAddr(a)) return json({ error: "地址不对" }, 400);
  if (!(n >= 1 && n <= MAX_N)) return json({ error: "数量不对" }, 400);
  const today = bjDay(), yday = new Date(Date.parse(today + "T12:00:00+08:00") - 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
  if (day !== today && day !== yday) return json({ error: "日期不对，请重新签名" }, 400);
  let who = ""; try { who = recoverAddress(burnText(n, keep, a, day), sig); } catch (e) {}
  if (who !== a) return json({ error: "签名核对失败：请用中奖的那个钱包签名" }, 400);
  const old = await kv.get("bo:a:" + a), oo = old ? await kv.get("bo:" + old, "json") : null;
  if (oo && oo.state === "pending" && Date.now() - oo.t < MAX_AGE) return json({ id: oo.id, n: oo.n, exists: true }); // 已经有一张在烧：不重复下
  // 只给「有待领神算子大奖、名字还没烧够」的钱包代烧，数量不超过还差的个数
  const origin = new URL(ctx.request.url).origin;
  let pays = (await kv.get("or:pay", "json")) || [];
  try { pays = (await burnCheck(kv, origin, pays, Date.now())).pays; } catch (e) { /* 核对不了就用现有的数 */ } // 先按链上记录把「已烧几个」刷新一遍，免得多烧
  const jp = pays.filter((x) => x.a === a && needCount(x) > 1 && payState(x) === "wait")[0];
  if (!jp) return json({ error: "这个钱包没有等着烧名字的大奖，不需要代烧" }, 400);
  const lack = needCount(jp) - burnedCount(jp);
  if (n > lack) return json({ error: "只差 " + lack + " 个了，请刷新页面重新委托" }, 400);
  // 主名字不烧：链上读主名字，和签名里写的「不动的名字」必须一致
  let prim = null; try { prim = String(await primaryName(a) || ""); } catch (e) {}
  if (prim === null) return json({ error: "读链失败，请稍后再试" }, 503);
  const primLabel = /\.ailgns$/.test(prim) ? prim.replace(/\.ailgns$/, "") : "";
  if (primLabel !== keep) return json({ error: "主名字对不上，请刷新页面重新委托" }, 400);
  const own = await fetch(origin + "/api/name-owned?a=" + a).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!own || !Array.isArray(own.list)) return json({ error: "读名字清单失败，请稍后再试" }, 503);
  const ids = own.list.filter((x) => x && /^[0-9a-f]{64}$/.test(String(x.id || "")) && !/^0+$/.test(x.id) && x.label && x.label !== keep).sort((x, y) => (y.no || 0) - (x.no || 0)).slice(0, n).map((x) => x.id); // 新注册的先烧
  if (ids.length < n) return json({ error: "钱包里能烧的名字只有 " + ids.length + " 个，请刷新页面重新委托" }, 400);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), o = { id, a, n, keep, day, sig, ids, t: Date.now(), state: "pending", done: 0, fail: 0, prize: jp.id };
  await kv.put("bo:" + id, JSON.stringify(o), { expirationTtl: TTL });
  const pend = (await kv.get(PEND, "json")) || []; pend.push(id); await kv.put(PEND, JSON.stringify(pend.slice(-50)));
  await kv.put("bo:a:" + a, id, { expirationTtl: TTL });
  return json({ id, n });
}
