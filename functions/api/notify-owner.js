// 📣 给站长自己推一条站内信（2026-11-07 站长定：巡检机器人跑完要「电脑手机同步推送，防止忘了」）
//   POST { key, msg, link? } → 写进谷歌社交账号钱包 0xedb9 的收件箱 #/inbox，并网页推送到所有开了通知的设备（电脑 + 手机）
// 只能干这一件事：只写站长自己的收件箱，不能发给客户、不能改任何别的东西。口令和工单后台同一个。
import { pushInbox } from "../../lib/inbox.js";

const OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 谷歌社交账号钱包
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return json({ error: "no kv" }, 503);
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (!keyOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
  const msg = String(b.msg || "").trim().slice(0, 1200);
  if (msg.length < 2) return json({ error: "内容太短" }, 400);
  const link = /^#\/[\w\/-]{0,60}$/.test(String(b.link || "")) ? String(b.link) : "";
  await pushInbox(kv, OWNER, "sys", msg, link);
  return json({ ok: true });
}
