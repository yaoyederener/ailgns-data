// 📍 查某个钱包最近从哪里连过网站（只有站长口令能查；数据怎么记、守哪几条线见 lib/geo.js）
import { readGeo } from "../../lib/geo.js";
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
export async function onRequestGet(ctx) {
  const env = ctx.env, kv = env.TEAM_KV, u = new URL(ctx.request.url), k = u.searchParams.get("key"), a = String(u.searchParams.get("a") || "").toLowerCase();
  if (!kv) return json({ error: "数据库没连上" }, 503);
  if (!k || !((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY))) return json({ error: "口令不对" }, 403);
  if (!/^0x[0-9a-f]{40}$/.test(a)) return json({ error: "地址不对" }, 400);
  return json({ a, list: await readGeo(kv, a), keepDays: 30 });
}
