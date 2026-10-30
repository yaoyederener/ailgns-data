// 每日投资记录：从 GitHub 取，在 Cloudflare 边缘缓存（已结束的日子缓存 1 天，当天 5 分钟），访客不用直连 GitHub
const SOURCE = "https://raw.githubusercontent.com/yaoyederener/monita/main/data/deposits/";

export async function onRequestGet(ctx) {
  const date = String(ctx.params.date || "").replace(/\.json$/, "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("bad date", { status: 400 });
  const cache = caches.default;
  const key = new Request(new URL(ctx.request.url).origin + "/api/deposits/" + date);
  const hit = await cache.match(key);
  if (hit) return hit;
  const up = await fetch(SOURCE + date + ".json", { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!up.ok) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
  const body = await up.text();
  const final = /"final":true/.test(body);
  const res = new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + (final ? 86400 : 300) },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
