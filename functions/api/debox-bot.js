// 给网页用：通知机器人的 UID 和名字（用 API Key 调 getMe 查出来，缓存 1 天），以及某个钱包是否已绑定
import { deboxCall } from "../../lib/debox.js";

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, addr = (new URL(ctx.request.url).searchParams.get("addr") || "").toLowerCase();
  const debug = new URL(ctx.request.url).searchParams.get("debug") === "1";
  let bot = kv && !debug ? await kv.get("dbx:bot", "json") : null, err = null, raw = null;
  if (!bot && ctx.env.DEBOX_API_KEY) {
    for (const method of ["GET", "POST"]) { // 不同版本的接口用 GET 或 POST
      try {
        const r = await deboxCall(ctx.env, "bot/getMe", {}, method);
        raw = r;
        bot = { uid: r.user_id || r.id || r.uid || r.bot_id, name: r.name || r.first_name || r.username || r.nickname || "" };
        if (kv && bot.uid) await kv.put("dbx:bot", JSON.stringify(bot), { expirationTtl: 86400 });
        break;
      } catch (e) { bot = null; err = String(e.message || e); }
    }
  }
  if (debug) return Response.json({ hasKey: !!ctx.env.DEBOX_API_KEY, keyLen: (ctx.env.DEBOX_API_KEY || "").length, bot, err, rawKeys: raw ? Object.keys(raw) : null }, { headers: { "cache-control": "no-store" } });
  let bound = null;
  if (kv && /^0x[0-9a-f]{40}$/.test(addr)) bound = ((await kv.get("dbx:a:" + addr, "json")) || []).length > 0;
  return Response.json({ ready: !!(bot && bot.uid), bot, bound }, { headers: { "cache-control": "no-store" } });
}
