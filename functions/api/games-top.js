// 🎮 游戏热度：最近 7 天每个游戏被打开的次数（app.js 打的 g_<游戏> 点）。菜单按它排序，合伙人面板看哪个最火。
// 省钱省时间：过去的日子算一次就存起来（gt:day:<日期>，不会再变）；今天的每 10 分钟算一次；结果 gt:res 先给旧的、后台重算，边缘再缓存 10 分钟。
import { counts, bjDay } from "../../lib/stats.js";
const FRESH = 10 * 60e3;
const dayAgo = (today, i) => new Date(Date.parse(today + "T12:00:00+08:00") - i * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
async function gamesOf(kv, d, store) {
  const key = "gt:day:" + d, c0 = store ? await kv.get(key, "json") : null;
  if (c0) return c0;
  const c = await counts(kv, d).catch(() => ({})), g = {};
  for (const k of Object.keys(c)) if (k.startsWith("g_")) g[k.slice(2)] = c[k];
  if (store) await kv.put(key, JSON.stringify(g), { expirationTtl: 9 * 86400 }).catch(() => {});
  return g;
}
async function build(kv) {
  const today = bjDay(), out = {};
  for (let i = 0; i < 7; i++) { const g = await gamesOf(kv, dayAgo(today, i), i > 0); for (const k of Object.keys(g)) out[k] = (out[k] || 0) + g[k]; }
  return { counts: out, days: 7, at: Date.now() };
}
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return Response.json({ counts: {} });
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/games-top");
  const hit = await cache.match(ck); if (hit) return hit;
  let cur = await kv.get("gt:res", "json");
  const store = (o) => kv.put("gt:res", JSON.stringify(o), { expirationTtl: 86400 }).catch(() => {});
  if (!cur) { cur = await build(kv); ctx.waitUntil(store(cur)); }
  else if (Date.now() - cur.at > FRESH) ctx.waitUntil(build(kv).then(store).catch(() => {}));
  const res = Response.json(cur, { headers: { "cache-control": "public, max-age=600" } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
