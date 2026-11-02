// 网站客服的每一次咨询（客户问题 + 机器人回答）转发到指定 DeBox 群：站长专门建的客服群（SUPPORT_GROUP），也可用环境变量 DEBOX_SUPPORT 覆盖
//   DEBOX_SUPPORT：DeBox 群 id 或用户 id；DEBOX_SUPPORT_TYPE：group / private（默认 group）
// POST { q, a, page, sid, human } → { ok }。同一访客 1 小时最多转发 30 条，防刷
import { sendDebox } from "../../lib/debox.js";

const SUPPORT_USER = "p3zjfyer"; // 接收客服咨询的 DeBox 用户 id（私信）；也可用环境变量 DEBOX_SUPPORT 覆盖。空着就不转发（不要发内部运营群，也不要发营销群）
const PER_HOUR = 30;

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  let b;
  try { b = await ctx.request.json(); } catch (e) { return Response.json({ ok: false }, { status: 400 }); }
  const q = String(b.q || "").slice(0, 400).trim(), a = String(b.a || "").slice(0, 600).trim(), page = String(b.page || "").slice(0, 60), sid = String(b.sid || "").replace(/[^a-z0-9]/gi, "").slice(0, 24) || "anon";
  if (!q) return Response.json({ ok: false }, { status: 400 });
  // 防刷：按访客 id 限量
  if (kv) {
    const k = "cl:" + sid + ":" + Math.floor(Date.now() / 3600e3), n = parseInt((await kv.get(k)) || "0", 10);
    if (n >= PER_HOUR) return Response.json({ ok: true, skipped: "limit" });
    await kv.put(k, String(n + 1), { expirationTtl: 3700 });
  }
  const to = ctx.env.DEBOX_SUPPORT || SUPPORT_USER, type = ctx.env.DEBOX_SUPPORT_TYPE || "private";
  if (!to) return Response.json({ ok: true, skipped: "no target" });
  const ip = ctx.request.headers.get("cf-connecting-ip") || "", country = ctx.request.headers.get("cf-ipcountry") || "";
  const text = `💬 网站客服咨询${b.human ? "（客户要找人工）" : ""}\n` +
    `问：${q}\n` +
    (a ? `答：${a}\n` : "") +
    `—— 页面 ${page || "/"} · 访客 ${sid.slice(0, 8)}${country ? " · " + country : ""}${ip ? " · " + ip.replace(/\.\d+$/, ".*") : ""}`;
  try { await sendDebox(ctx.env, to, text, type); return Response.json({ ok: true }); }
  catch (e) { return Response.json({ ok: false, err: String(e.message || e).slice(0, 120) }, { status: 502 }); }
}
