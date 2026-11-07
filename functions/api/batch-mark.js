// 🏷️ 批量注册标记（站长 2026-11-08 定：批量注册的费用另算 —— 10% 平台、90% 进极速预言家资金池；机器人分账时按这个标记认哪些注册是「票」）
//   POST { a, names: [...] } → 记 bt:<label> = { a, t }（90 天）+ 当天清单 bt:d:<日期>
//   没有口令：它只决定钱进哪个池子，不决定钱归谁，刷它没有好处
import { bjDay } from "../../lib/stats.js";
const valid = (s) => /^[a-z0-9一-鿿-]{2,32}$/.test(s);
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return Response.json({ error: "no kv" }, { status: 503 });
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  const a = String(b.a || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(a)) return Response.json({ error: "bad addr" }, { status: 400 });
  const names = [...new Set((Array.isArray(b.names) ? b.names : []).map((s) => String(s || "").trim().toLowerCase()).filter(valid))].slice(0, 100);
  if (!names.length) return Response.json({ ok: true, n: 0 });
  const day = bjDay(), t = Date.now();
  for (const n of names) await kv.put("bt:" + n, JSON.stringify({ a, t, day }), { expirationTtl: 90 * 86400 });
  const key = "bt:d:" + day, cur = (await kv.get(key, "json")) || [];
  for (const n of names) if (!cur.includes(n)) cur.push(n);
  await kv.put(key, JSON.stringify(cur.slice(-5000)), { expirationTtl: 120 * 86400 });
  return Response.json({ ok: true, n: names.length });
}
