// 🔔 收件箱接口。钱包签一次名（管 30 天）证明「我控制这个地址」，之后每次请求带 a / ts / sig
//   GET  ?a&ts&sig            → { list, seen, unread }
//   POST { a, ts, sig, action: "seen" } → 全部标为已读
import { recoverAddress } from "../../lib/evmsig.js";
import { inboxText, AUTH_TTL, pushInbox } from "../../lib/inbox.js";
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
  // 6 位码换登录：拿一次就作废
  const code = String(u.searchParams.get("code") || "").replace(/\D/g, "");
  if (code) {
    if (code.length !== 6) return json({ error: "码是 6 位数字" }, 400);
    const rec = await kv.get("ib:code:" + code, "json");
    if (!rec) return json({ error: "这个码不对或已过期（10 分钟内有效，只能用一次）" }, 404);
    await kv.delete("ib:code:" + code);
    return json({ auth: rec });
  }
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
    const to = [...new Set((String(b.to || "").toLowerCase().match(/0x[0-9a-f]{40}/g) || []))];
    const msg = String(b.msg || "").trim().slice(0, 1200);
    if (!to.length) return json({ error: "没找到有效的钱包地址（0x 开头 42 位）" }, 400);
    if (to.length > 50) return json({ error: "一次最多发 50 个地址" }, 400);
    if (msg.length < 2) return json({ error: "内容太短" }, 400);
    const link = /^#\/[\w\/.%-]{0,80}$/.test(String(b.link || "")) ? String(b.link) : "";
    for (const x of to) await pushInbox(kv, x, "sys", "📣 站长通知\n" + msg, link);
    log.unshift({ t: Date.now(), to, msg: msg.slice(0, 300), link });
    await kv.put("ib:adminlog", JSON.stringify(log.slice(0, 50)));
    return json({ ok: true, n: to.length, log: log.slice(0, 50) });
  }
  const a = auth(b.a, b.ts, b.sig);
  if (!a) return json({ error: "登录已过期，请重新用钱包签名" }, 401);
  if (b.action === "seen") { await kv.put("ib:seen:" + a, String(Date.now())); return json(await view(kv, a)); }
  if (b.action === "code") { // 生成 6 位码，10 分钟有效，拿去别的设备 / 桌面图标 App 里登录
    let code; for (let i = 0; i < 5; i++) { code = String(Math.floor(100000 + Math.random() * 900000)); if (!(await kv.get("ib:code:" + code))) break; }
    await kv.put("ib:code:" + code, JSON.stringify({ a, ts: Number(b.ts), sig: String(b.sig) }), { expirationTtl: 600 });
    return json({ code, ttl: 600 });
  }
  return json({ error: "不认识的操作" }, 400);
}
