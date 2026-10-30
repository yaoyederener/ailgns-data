// 完整结构图数据：服务器算好存进 KV，访客直接取（一般 0.1 秒内）；超过 30 分钟先给旧的、后台更新
import { buildTree } from "../../lib/teamlib.js";

const KEEP = 7 * 86400;
const REFRESH_AFTER = 30 * 60 * 1000;

export async function rebuild(env, root) {
  // 团队名单 1 小时内读过就直接用，只重新读算力和等级
  let team = null;
  if (env.TEAM_KV) {
    const t = await env.TEAM_KV.get("team:" + root, "json");
    if (t && t.v === 2 && Date.now() - t.at < 3600 * 1000) team = t;
  }
  const data = await buildTree(root, team);
  if (!team && env.TEAM_KV) {
    await env.TEAM_KV.put("team:" + root, JSON.stringify({ v: 2, root, at: data.at, lines: data.lines, list: data.list.map((x) => x.slice(0, 4)) }), { expirationTtl: KEEP });
  }
  const body = JSON.stringify(data);
  if (env.TEAM_KV) await env.TEAM_KV.put("tree:" + root, body, { expirationTtl: KEEP, metadata: { at: data.at } });
  return body;
}

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  const root = (url.searchParams.get("root") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(root)) return new Response("bad root", { status: 400 });
  const kv = ctx.env.TEAM_KV, headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (kv && url.searchParams.get("fresh") !== "1") {
    const { value, metadata } = await kv.getWithMetadata("tree:" + root);
    if (value) {
      const stale = Date.now() - ((metadata && metadata.at) || 0) > REFRESH_AFTER;
      if (stale) ctx.waitUntil(rebuild(ctx.env, root).catch(() => {}));
      return new Response(value, { headers: { ...headers, "x-tree-cache": stale ? "stale" : "hit" } });
    }
  }
  try {
    return new Response(await rebuild(ctx.env, root), { headers: { ...headers, "x-tree-cache": "miss" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 503, headers });
  }
}
