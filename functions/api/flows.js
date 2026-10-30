// 每日买卖历史：从 GitHub 取一次，在 Cloudflare 边缘缓存 5 分钟，访客不用直连 GitHub
const SOURCE = "https://raw.githubusercontent.com/yaoyederener/monita/main/data/ailgns_flows.json";

export async function onRequestGet(ctx) {
  const cache = caches.default;
  const key = new Request(new URL(ctx.request.url).origin + "/api/flows");
  const hit = await cache.match(key);
  if (hit) return hit;
  const up = await fetch(SOURCE, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!up.ok) return new Response(JSON.stringify({ error: "upstream " + up.status }), { status: 502, headers: { "content-type": "application/json" } });
  const res = new Response(await up.text(), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
