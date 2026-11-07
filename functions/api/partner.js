// 🤝 合伙人面板接口：GET ?key=<PARTNER_KEY 或 FEEDBACK_KEY> → 读 ops-watch 每 5 分钟算好的缓存 ptn:res
// POST { key: FEEDBACK_KEY, cfg: { tech, sales } } 改分配比例；POST { key, plan: [ "..." ] } 改开发计划（只有站长口令能改，合伙人口令只能看）
import { build } from "../../lib/partner.js";
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const canRead = (env, k) => !!k && ((env.PARTNER_KEY && k === env.PARTNER_KEY) || (env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
const canWrite = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));

export async function onRequestGet(ctx) {
  const env = ctx.env, kv = env.TEAM_KV, u = new URL(ctx.request.url), key = u.searchParams.get("key");
  if (u.searchParams.get("health")) { const r = kv && (await kv.get("ptn:res", "json")); return json({ ok: !!r, at: r ? r.at : 0, risks: r ? r.risks.length : 0, traffic: r ? r.traffic : null, cap: r ? r.cap : null }); } // 只报有没有算过，不带数据
  if (!canRead(env, key)) return json({ error: "口令不对" }, 403);
  if (!kv) return json({ error: "no kv" }, 503);
  let out = await kv.get("ptn:res", "json");
  // 先给缓存、后台刷新（站长 2026-11-07：「余额读取太慢」）：缓存超过 2 分钟就在后台重算，这次先把旧的给出去，下次打开就是新的；没有缓存才当场算
  if (!out) { try { out = await build(env, kv, ctx); } catch (e) { return json({ error: "面板第一次生成出错：" + String(e.message || e).slice(0, 300) }, 500); } }
  else if (Date.now() - (out.at || 0) > 2 * 60e3) ctx.waitUntil(build(env, kv, ctx).catch(() => {}));
  out.canWrite = canWrite(env, key);
  return json(out);
}

export async function onRequestPost(ctx) {
  const env = ctx.env, kv = env.TEAM_KV;
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (!canWrite(env, b.key)) return json({ error: "只有站长口令能改" }, 403);
  if (b.cfg) {
    const tech = Math.max(0, Math.min(100, Math.round(Number(b.cfg.tech) || 0)));
    await kv.put("ptn:cfg", JSON.stringify({ tech, sales: 100 - tech }));
  }
  if (Array.isArray(b.plan)) await kv.put("ptn:plan", JSON.stringify(b.plan.slice(0, 12).map((x) => ({ t: String(x.t || x).slice(0, 80), done: !!x.done }))));
  await kv.delete("ptn:res"); // 下次打开重算
  return json({ ok: true });
}
