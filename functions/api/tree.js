// 完整结构图数据：服务器算好存进 KV，访客直接取（一般 0.1 秒内）；过期先给旧的、后台更新
// 普通会员 30 分钟更新一次，高级会员（tier=pro）5 分钟
import { buildTree } from "../../lib/teamlib.js";

const KEEP = 7 * 86400;
export const REFRESH_AFTER = 30 * 60 * 1000;
export const PRO_REFRESH_AFTER = 5 * 60 * 1000;

// teamMaxAge：团队名单多久内读过就直接用（只重新读算力和等级）；pro：高级会员，优先刷新
export async function rebuild(env, root, { teamMaxAge = 3600 * 1000, pro = false } = {}) {
  let team = null;
  if (env.TEAM_KV) {
    const t = await env.TEAM_KV.get("team:" + root, "json");
    if (t && t.v === 2 && Date.now() - t.at < teamMaxAge) team = t;
  }
  const data = await buildTree(root, team);
  if (!team && env.TEAM_KV) {
    await env.TEAM_KV.put("team:" + root, JSON.stringify({ v: 2, root, at: data.at, lines: data.lines, list: data.list.map((x) => x.slice(0, 4)) }), { expirationTtl: KEEP });
  }
  const body = JSON.stringify(data);
  if (env.TEAM_KV) await env.TEAM_KV.put("tree:" + root, body, { expirationTtl: KEEP, metadata: { at: data.at, pro } });
  return body;
}

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  const root = (url.searchParams.get("root") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(root)) return new Response("bad root", { status: 400 });
  const pro = url.searchParams.get("tier") === "pro";
  const kv = ctx.env.TEAM_KV, headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  // 超大团队（8 万个地址以上）：交给 GitHub Actions 慢慢读，网页改读 /api/bigtree 的压缩二进制文件
  if (kv) {
    const big = await kv.get("big:" + root, "json");
    if (big || url.searchParams.get("big") === "1") {
      await markBig(kv, root, pro, big);
      return Response.json({ v: 4, big: true, root }, { headers });
    }
  }
  if (kv && url.searchParams.get("fresh") !== "1") {
    const { value, metadata } = await kv.getWithMetadata("tree:" + root);
    if (value) {
      const isPro = pro || !!(metadata && metadata.pro);
      const stale = Date.now() - ((metadata && metadata.at) || 0) > (isPro ? PRO_REFRESH_AFTER : REFRESH_AFTER);
      if (stale) ctx.waitUntil(rebuild(ctx.env, root, { pro: isPro }).catch(() => {}));
      return new Response(value, { headers: { ...headers, "x-tree-cache": stale ? "stale" : "hit" } });
    }
  }
  try {
    return new Response(await rebuild(ctx.env, root, { pro }), { headers: { ...headers, "x-tree-cache": "miss" } });
  } catch (e) {
    if (kv && /too large/.test(e.message || "")) {
      await markBig(kv, root, pro, null);
      return Response.json({ v: 4, big: true, root }, { headers });
    }
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 503, headers });
  }
}

// 记下这个超大团队最近有人在看（7 天没人看就不再重建）；pro：高级会员，重建更勤
async function markBig(kv, root, pro, old) {
  const v = { seen: Date.now(), pro: pro || !!(old && old.pro), since: (old && old.since) || Date.now() };
  if (!old || Date.now() - old.seen > 600000 || v.pro !== old.pro) await kv.put("big:" + root, JSON.stringify(v), { expirationTtl: 7 * 86400, metadata: v });
}
