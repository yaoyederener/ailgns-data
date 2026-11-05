// 🔔 收件箱接口。钱包签一次名（管 30 天）证明「我控制这个地址」，之后每次请求带 a / ts / sig
//   GET  ?a&ts&sig            → { list, seen, unread }
//   POST { a, ts, sig, action: "seen" } → 全部标为已读
import { recoverAddress } from "../../lib/evmsig.js";
import { inboxText, AUTH_TTL } from "../../lib/inbox.js";
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
  const u = new URL(ctx.request.url), a = auth(u.searchParams.get("a"), u.searchParams.get("ts"), u.searchParams.get("sig"));
  if (!a) return json({ error: "登录已过期，请重新用钱包签名" }, 401);
  return json(await view(kv, a));
}
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "没有存储" }, 500);
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const a = auth(b.a, b.ts, b.sig);
  if (!a) return json({ error: "登录已过期，请重新用钱包签名" }, 401);
  if (b.action === "seen") { await kv.put("ib:seen:" + a, String(Date.now())); return json(await view(kv, a)); }
  return json({ error: "不认识的操作" }, 400);
}
