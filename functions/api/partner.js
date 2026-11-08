// 🤝 合伙人面板接口：GET ?key=<PARTNER_KEY 或 FEEDBACK_KEY> → 读 ops-watch 每 5 分钟算好的缓存 ptn:res
// POST { key: FEEDBACK_KEY, cfg: { tech, sales } } 改分配比例；POST { key, plan: [ "..." ] } 改开发计划（只有站长口令能改，合伙人口令只能看）
import { build } from "../../lib/partner.js";
import { pushInbox } from "../../lib/inbox.js";
const OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 谷歌社交账号钱包
const bjDay = (t) => new Date((t || Date.now()) + 8 * 3600e3).toISOString().slice(0, 10);
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
  out.alloclog = (await kv.get("ptn:alloclog", "json")) || []; // 💼 分配记录（站长点「我已分配」时记）
  out.today = out.today || bjDay();
  out.canWrite = canWrite(env, key);
  return json(out);
}

export async function onRequestPost(ctx) {
  const env = ctx.env, kv = env.TEAM_KV;
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (!canWrite(env, b.key)) return json({ error: "只有站长口令能改" }, 403);
  // 💼 站长点「我已分配」（2026-11-08）：记一笔分配记录，并站内信通知四个分配地址 + 站长自己
  if (b.action === "allocDone") {
    const r = (await kv.get("ptn:res", "json")) || {}, parts = (r.split && r.split.parts) || [];
    if (!parts.length) return json({ error: "还没有分配数据，请刷新后再试" }, 400);
    const now = Date.now(), d = bjDay(now), total = Math.round((r.split.total || 0) * 100) / 100;
    const log = (await kv.get("ptn:alloclog", "json")) || [];
    log.unshift({ t: now, day: d, total, parts: parts.map((x) => ({ n: x.n, p: x.p, a: x.a, amt: x.amt })) });
    await kv.put("ptn:alloclog", JSON.stringify(log.slice(0, 60)));
    const day = Number(d.slice(5, 7)) + "月" + Number(d.slice(8, 10)) + "日";
    for (const x of parts) await pushInbox(kv, x.a, "sys", "💼 " + day + " 运营分配已完成\n你的部分：" + x.n + " " + x.p + "% ≈ " + Math.round(x.amt) + " DAI（本次合计 ≈ " + Math.round(total) + " DAI），请查收钱包。", "#/scan/" + x.a).catch(() => {});
    await pushInbox(kv, OWNER, "sys", "💼 " + day + " 运营分配已标记完成，合计 ≈ " + Math.round(total) + " DAI\n" + parts.map((x) => x.n + " " + x.p + "% ≈ " + Math.round(x.amt) + " DAI").join("\n"), "#/partner").catch(() => {});
    return json({ ok: true, log: log.slice(0, 60) });
  }
  if (b.cfg) {
    const tech = Math.max(0, Math.min(100, Math.round(Number(b.cfg.tech) || 0)));
    await kv.put("ptn:cfg", JSON.stringify({ tech, sales: 100 - tech }));
  }
  if (Array.isArray(b.plan)) await kv.put("ptn:plan", JSON.stringify(b.plan.slice(0, 12).map((x) => ({ t: String(x.t || x).slice(0, 80), done: !!x.done }))));
  await kv.delete("ptn:res"); // 下次打开重算
  return json({ ok: true });
}
