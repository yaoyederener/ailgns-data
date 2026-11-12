// 🏷️ 批量注册标记（站长 2026-11-08 定：批量注册的费用另算 —— 10% 平台、90% 进极速预言家资金池；机器人分账时按这个标记认哪些注册是「票」）
// 2026-11-11 站长：极速预言家上线前，批量注册先按普通注册分（30% 谷歌社交账号钱包、70% 每日奖池），机器人 oracle_prize.py FAST_ON=False；标记照打，留着以后用
//   POST { a, names: [...] } → 记 bt:<label> = { a, t }（90 天）+ 当天清单 bt:d:<日期>
//   GET ?days=3 → { labels: [...] } 最近几天打过标记的名字（机器人分账用）
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
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return Response.json({ labels: [] });
  const days = Math.min(14, Math.max(1, Number(new URL(ctx.request.url).searchParams.get("days")) || 3)), out = new Set();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(bjDay() + "T12:00:00+08:00") - i * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
    for (const n of ((await kv.get("bt:d:" + d, "json")) || [])) out.add(n);
  }
  return Response.json({ labels: [...out], days }, { headers: { "cache-control": "no-store" } });
}
