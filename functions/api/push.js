// 🔔 推送订阅接口。GET → { pub }（VAPID 公钥，首次自动生成）；POST { a, ts, sig, sub }（钱包签名同收件箱）→ 保存订阅；POST { …, action: "off", endpoint } → 取消
import { recoverAddress } from "../../lib/evmsig.js";
import { inboxText, AUTH_TTL } from "../../lib/inbox.js";
import { vapid, sendOne } from "../../lib/webpush.js";
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
function auth(a, ts, sig) {
  a = String(a || "").toLowerCase(); ts = Number(ts);
  if (!/^0x[0-9a-f]{40}$/.test(a) || !ts || !sig || ts > Date.now() + 300e3 || Date.now() - ts > AUTH_TTL) return null;
  try { return recoverAddress(inboxText(a, ts), String(sig)) === a ? a : null; } catch (e) { return null; }
}
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "没有存储" }, 500);
  return json({ pub: (await vapid(kv)).pub });
}
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ error: "没有存储" }, 500);
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const a = auth(b.a, b.ts, b.sig); if (!a) return json({ error: "登录已过期，请重新用钱包签名" }, 401);
  const key = "push:" + a, subs = (await kv.get(key, "json")) || [];
  if (b.action === "off") { await kv.put(key, JSON.stringify(subs.filter((s) => s.endpoint !== b.endpoint))); return json({ ok: true, n: subs.length - 1 }); }
  const sub = b.sub;
  if (!sub || !/^https:\/\//.test(String(sub.endpoint || "")) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: "订阅信息不完整" }, 400);
  const list = subs.filter((s) => s.endpoint !== sub.endpoint).concat([{ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ua: String(ctx.request.headers.get("user-agent") || "").slice(0, 80), at: Date.now() }]).slice(-5);
  await kv.put(key, JSON.stringify(list));
  // 立刻发一条测试，让客户当场看到效果
  let test = null; try { test = await sendOne(kv, sub, { t: "AiLGNS 通知已开启 ✅", b: "以后成交、借贷、工单回复、中奖、留言都会这样弹出来", u: "/#/inbox" }); } catch (e) { test = { ok: false, err: String(e && e.message || e).slice(0, 100) }; }
  return json({ ok: true, n: list.length, test });
}
