// 🔔 收件箱接口。钱包签一次名（管 30 天）证明「我控制这个地址」，之后每次请求带 a / ts / sig
//   GET  ?a&ts&sig            → { list, seen, unread }
//   GET  ?n=地址              → { unread, dm }（dm = 其中站长私信几条；只给数字，不给内容；没签名的钱包铃铛也能亮，点进去再签名看）
//   POST { a, ts, sig, action: "seen" } → 全部标为已读（页面一打开就自动调）
//   POST { action: "tx", tx }  → 客户刚在本站发的交易：读链核对后给发起人写一条通知（不用签名，文字全由链上回执生成）
import { recoverAddress } from "../../lib/evmsig.js";
import { inboxText, AUTH_TTL, pushInbox, OWNER } from "../../lib/inbox.js";
import { ensureWeek } from "../../lib/cred.js";
import { rpc } from "../../lib/oracle.js";
import { txNote } from "../../lib/txnote.js";
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
function auth(a, ts, sig) {
  a = String(a || "").toLowerCase(); ts = Number(ts);
  if (!/^0x[0-9a-f]{40}$/.test(a) || !ts || !sig) return null;
  const now = Date.now();
  if (ts > now + 5 * 60e3 || now - ts > AUTH_TTL) return null;
  try { if (recoverAddress(inboxText(a, ts), String(sig)) !== a) return null; } catch (e) { return null; }
  return a;
}
async function view(kv, a) {
  const list = (await kv.get("ib:" + a, "json")) || [], seen = Number(await kv.get("ib:seen:" + a)) || 0;
  return { list, seen, unread: list.filter((x) => x.t > seen).length };
}
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "没有存储" }, 500);
  const u = new URL(ctx.request.url);
  // 只要未读数（2026-11-11）：不用签名，只回一个数字
  const n = String(u.searchParams.get("n") || "").toLowerCase();
  if (n) { if (!/^0x[0-9a-f]{40}$/.test(n)) return json({ error: "地址不对" }, 400); const v = await view(kv, n); return json({ unread: v.unread, dm: v.list.filter((x) => x.t > v.seen && String(x.txt).startsWith("📣 站长通知")).length }); }
  const a = auth(u.searchParams.get("a"), u.searchParams.get("ts"), u.searchParams.get("sig"));
  if (!a) return json({ error: "登录已过期，请重新用钱包签名" }, 401);
  return json(await view(kv, a));
}
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "没有存储" }, 500);
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  // 📣 站长给指定地址发站内信（2026-11-08 站长定）：口令和工单后台同一个；一次最多 50 个地址，不做全站群发
  if (b.action === "admin" || b.action === "adminlog") {
    const k = String(b.key || ""), env = ctx.env;
    if (!k || !((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY))) return json({ error: "口令不对" }, 403);
    const log = (await kv.get("ib:adminlog", "json")) || [];
    if (b.action === "adminlog") return json({ log });
    // 「@商户」= 本周全部 OTC 商户（✔ 认证商家及以上，名单按 lib/cred.js 每周一轮换）
    let to = [...new Set((String(b.to || "").toLowerCase().match(/0x[0-9a-f]{40}/g) || []))], max = 50;
    if (/@商户/.test(String(b.to || ""))) { const w = await ensureWeek(kv); to = [...new Set(to.concat(Object.keys(w.lv || {}).filter((x) => w.lv[x] >= 2)))]; max = 120; }
    const msg = String(b.msg || "").trim().slice(0, 1200);
    if (!to.length) return json({ error: "没找到有效的钱包地址（0x 开头 42 位）" }, 400);
    if (to.length > max) return json({ error: "一次最多发 " + max + " 个地址" }, 400);
    if (msg.length < 2) return json({ error: "内容太短" }, 400);
    const link = /^#\/[\w\/.%-]{0,80}$/.test(String(b.link || "")) ? String(b.link) : "";
    for (const x of to) await pushInbox(kv, x, "sys", "📣 站长通知\n" + msg, link);
    log.unshift({ t: Date.now(), to, msg: msg.slice(0, 300), link });
    await kv.put("ib:adminlog", JSON.stringify(log.slice(0, 50)));
    return json({ ok: true, n: to.length, log: log.slice(0, 50) });
  }
  // 🔔 客户自己的每笔操作即时通知（2026-11-11）：只认 15 分钟内、调用本站合约的交易；每笔只通知一次
  if (b.action === "tx") {
    const h = String(b.tx || "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(h)) return json({ error: "参数不对" }, 400);
    if (await kv.get("ib:tx:" + h)) return json({ ok: true, dup: true });
    let rc, tx, blk;
    try { rc = await rpc("eth_getTransactionReceipt", [h]); } catch (e) { return json({ pending: true }); } // 还没打包
    if (!rc || !rc.blockNumber) return json({ pending: true });
    try { [tx, blk] = await Promise.all([rpc("eth_getTransactionByHash", [h]), rpc("eth_getBlockByNumber", [rc.blockNumber, false])]); } catch (e) { return json({ pending: true }); }
    if (Date.now() / 1000 - parseInt(blk.timestamp, 16) > 900) return json({ ok: true, skip: "old" });
    const note = txNote(rc, tx);
    await kv.put("ib:tx:" + h, "1", { expirationTtl: 86400 });
    if (!note) return json({ ok: true, skip: "other" });
    await pushInbox(kv, rc.from, note.k, note.txt, note.link);
    return json({ ok: true, a: String(rc.from).toLowerCase() });
  }
  const a = auth(b.a, b.ts, b.sig);
  if (!a) return json({ error: "登录已过期，请重新用钱包签名" }, 401);
  if (b.action === "seen") { await kv.put("ib:seen:" + a, String(Date.now())); return json(await view(kv, a)); }
  // 💬 站长在收件箱里直接回复客户（2026-11-14 站长定）：只有站长钱包签名登录的收件箱能用；回给「那张工单是谁提的」那个钱包，不能随便填地址
  //    客户那边：收件箱多一条「📣 站长通知」，全站底部弹悬浮气泡（和站长私信同一个）；工单也记上这条回复、标成已处理
  if (b.action === "reply") {
    if (a !== OWNER) return json({ error: "只有站长的收件箱能回复客户" }, 403);
    const tid = String(b.tid || ""), msg = String(b.msg || "").trim().slice(0, 1000);
    if (!/^\d{1,9}$/.test(tid)) return json({ error: "没找到是哪张工单" }, 400);
    if (msg.length < 2) return json({ error: "内容太短" }, 400);
    const t = await kv.get("tk:" + tid, "json");
    if (!t || !/^0x[0-9a-f]{40}$/.test(String(t.a || ""))) return json({ error: "没有这张工单，或者工单上没有客户的钱包地址" }, 404);
    const said = String(t.txt || "").replace(/^【回复站内信】/, "").split("\n\n—— 回复的是：")[0].trim().slice(0, 120);
    await pushInbox(kv, t.a, "ticket", "📣 站长通知\n" + msg + (said ? "\n\n—— 回复你的留言：" + said : ""), "#/inbox");
    t.note = msg; t.st = "done"; t.up = Date.now();
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    const log = (await kv.get("ib:adminlog", "json")) || [];
    log.unshift({ t: Date.now(), to: [t.a], msg: ("【回复工单 #" + t.id + "】" + msg).slice(0, 300), link: "#/inbox" });
    await kv.put("ib:adminlog", JSON.stringify(log.slice(0, 50)));
    return json({ ok: true, to: t.a, id: t.id });
  }
  return json({ error: "不认识的操作" }, 400);
}
