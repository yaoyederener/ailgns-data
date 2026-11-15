// 📚 知识补充（站长 2026-11-15）：站长在工单后台写一条，AI 客服（Claude 和 DeepSeek 都读）马上就知道，不用等改代码上线。
// 存 KV kb:extra = [{ t, text }]，新的在前，最多 40 条、每条 300 字。只有站长口令（FEEDBACK_KEY / BACKUP_KEY）能看、能改。
// 只放能公开的信息：这里写的每一句客服都可能原样说给客户。
import { kbExtraReset } from "../../lib/chatbot.js";
const ok = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const read = async (kv) => { const l = await kv.get("kb:extra", "json"); return Array.isArray(l) ? l : []; };
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, k = new URL(ctx.request.url).searchParams.get("key");
  if (!kv) return json({ error: "数据库没连上" }, 503);
  if (!ok(ctx.env, k)) return json({ error: "口令不对" }, 403);
  return json({ list: await read(kv), max: 40, len: 300 });
}
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  if (!kv) return json({ error: "数据库没连上" }, 503);
  if (!ok(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
  let list = await read(kv);
  if (b.del) list = list.filter((x) => x.t !== Number(b.del));
  else {
    const text = String(b.add || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (text.length < 4) return json({ error: "写得太短了，至少 4 个字" }, 400);
    if (list.some((x) => x.text === text)) return json({ error: "这一条已经有了" }, 400);
    if (list.length >= 40) return json({ error: "已经 40 条了，先删掉过时的再加" }, 400);
    list.unshift({ t: Date.now(), text });
  }
  await kv.put("kb:extra", JSON.stringify(list));
  kbExtraReset();
  return json({ ok: true, list });
}
