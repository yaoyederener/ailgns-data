// 超大团队的结构图数据：GitHub Actions 生成的压缩二进制文件（monita 仓库 trees 分支），原样转给浏览器，浏览器自动解压
const RAW = "https://raw.githubusercontent.com/yaoyederener/monita/trees/trees/";

export async function onRequestGet(ctx) {
  const root = (new URL(ctx.request.url).searchParams.get("root") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(root)) return new Response("bad root", { status: 400 });
  const r = await fetch(RAW + root + ".bin.gz", { cf: { cacheTtl: 120, cacheEverything: true } });
  if (r.status === 404) return Response.json({ building: true }, { status: 404, headers: { "cache-control": "no-store" } });
  if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
  return new Response(r.body, {
    encodeBody: "manual", // 文件本身就是 gzip，让浏览器直接解压
    headers: { "content-type": "application/octet-stream", "content-encoding": "gzip", "cache-control": "public, max-age=60", "x-gz-size": r.headers.get("content-length") || "" },
  });
}
