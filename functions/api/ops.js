// 🛠️ 网站优化页接口：GET ?key=<FEEDBACK_KEY 或 BACKUP_KEY> → 安全清单 / 待优化 / 方案记录 / 最坏情况 + 当前风险（合伙人面板算好的）
import { OPS } from "../../lib/opsdoc.js";
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
export async function onRequestGet(ctx) {
  const env = ctx.env, kv = env.TEAM_KV, key = new URL(ctx.request.url).searchParams.get("key");
  if (!key || !((env.FEEDBACK_KEY && key === env.FEEDBACK_KEY) || (env.BACKUP_KEY && key === env.BACKUP_KEY))) return json({ error: "口令不对" }, 403);
  let risks = [], at = 0;
  try { const p = kv && (await kv.get("ptn:res", "json")); if (p) { risks = p.risks || []; at = p.at || 0; } } catch (e) {}
  return json(Object.assign({ risks, risksAt: at }, OPS));
}
