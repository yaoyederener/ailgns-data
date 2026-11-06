// 📊 站长数据面板接口：只读 ops-watch 每 5 分钟算好的缓存（adm:res），秒开；站长说延迟无所谓
// GET ?key=<FEEDBACK_KEY 或 BACKUP_KEY>
import { build } from "../../lib/adminstats.js";
export async function onRequestGet(ctx) {
  const env = ctx.env, kv = env.TEAM_KV, key = new URL(ctx.request.url).searchParams.get("key");
  if (!key || !((env.FEEDBACK_KEY && key === env.FEEDBACK_KEY) || (env.BACKUP_KEY && key === env.BACKUP_KEY))) return Response.json({ error: "口令不对" }, { status: 403 });
  if (!kv) return Response.json({ error: "no kv" }, { status: 503 });
  let out = await kv.get("adm:res", "json");
  if (!out) { try { out = await build(env, kv, ctx); } catch (e) { return Response.json({ error: "面板第一次生成出错：" + String(e.message || e).slice(0, 300) }, { status: 500 }); } }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
