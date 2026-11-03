// Anubis 官方浏览器（Blockscout）接口的缓存代理：浏览器页面（scan.js）走这里，同一个请求 30 秒内直接用边缘缓存，
// 官方接口冷启动有时要 10 秒以上，缓存后大家都秒开。只转发只读的 /api/v2/... 和 /api?module=logs 查询
const BASE = "https://browser.anubispace.org";
const TTL = 30;

export async function onRequestGet(ctx) {
  const p = new URL(ctx.request.url).searchParams.get("p") || "";
  if (!/^\/api\/v2\/[\w\-/.?=&,%]+$/.test(p) && !/^\/api\?module=logs&[\w\-=&]+$/.test(p)) return Response.json({ error: "bad path" }, { status: 400 });
  const cache = caches.default, key = new Request(BASE + p);
  const hit = await cache.match(key);
  if (hit) return hit;
  let r;
  try {
    r = await fetch(BASE + p, { signal: AbortSignal.timeout(15000), headers: { accept: "application/json" } });
  } catch (e) {
    return Response.json({ error: "官方浏览器接口超时" }, { status: 504 });
  }
  const out = new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=" + TTL, "access-control-allow-origin": "*" } });
  if (r.ok) ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}
