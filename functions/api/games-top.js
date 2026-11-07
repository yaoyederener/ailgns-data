// 🎮 游戏热度：最近 7 天每个游戏被打开的次数（app.js 打的 g_<游戏> 点）。菜单按它排序，合伙人面板看哪个最火。边缘缓存 10 分钟。
import { counts, bjDay } from "../../lib/stats.js";
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return Response.json({ counts: {} });
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/games-top");
  const hit = await cache.match(ck); if (hit) return hit;
  const out = {}, today = bjDay();
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.parse(today + "T12:00:00+08:00") - i * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
    const c = await counts(kv, d).catch(() => ({}));
    for (const k of Object.keys(c)) if (k.startsWith("g_")) out[k.slice(2)] = (out[k.slice(2)] || 0) + c[k];
  }
  const res = Response.json({ counts: out, days: 7, at: Date.now() }, { headers: { "cache-control": "public, max-age=600" } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
