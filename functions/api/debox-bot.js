// 给网页用：通知机器人的 UID 和名字（用 API Key 调 getMe 查出来，缓存 1 天），以及某个钱包是否已绑定
import { deboxCall } from "../../lib/debox.js";

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, addr = (new URL(ctx.request.url).searchParams.get("addr") || "").toLowerCase();
  let bot = kv ? await kv.get("dbx:bot", "json") : null;
  if (!bot && ctx.env.DEBOX_API_KEY) {
    try {
      const r = await deboxCall(ctx.env, "bot/getMe", {}, "GET");
      bot = { uid: r.user_id || r.id || r.uid, name: r.name || r.first_name || r.username || "" };
      if (kv && bot.uid) await kv.put("dbx:bot", JSON.stringify(bot), { expirationTtl: 86400 });
    } catch (e) { bot = null; }
  }
  let bound = null;
  if (kv && /^0x[0-9a-f]{40}$/.test(addr)) bound = ((await kv.get("dbx:a:" + addr, "json")) || []).length > 0;
  return Response.json({ ready: !!(bot && bot.uid), bot, bound }, { headers: { "cache-control": "no-store" } });
}
