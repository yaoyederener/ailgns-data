// 团队名单：在 Cloudflare 服务器上从 Anubis 链一层层读出整个团队，结果存进 KV 共享，所有访客秒取
import { buildTeam } from "../../lib/teamlib.js";

const KEEP = 7 * 86400; // KV 里保留 7 天
const REFRESH_AFTER = 3600 * 1000; // 超过 1 小时：先返回旧的，后台悄悄更新

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  const root = (url.searchParams.get("root") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(root)) return new Response("bad root", { status: 400 });
  const kv = ctx.env.TEAM_KV;
  const fresh = url.searchParams.get("fresh") === "1";
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  const save = async () => {
    const body = JSON.stringify(await buildTeam(root));
    if (kv) await kv.put("team:" + root, body, { expirationTtl: KEEP });
    return body;
  };
  if (kv && !fresh) {
    const hit = await kv.get("team:" + root);
    if (hit) {
      const parsed = JSON.parse(hit);
      if (parsed.v === 2) {
      const age = Date.now() - (parsed.at || 0);
      if (age > REFRESH_AFTER) ctx.waitUntil(save().catch(() => {}));
      return new Response(hit, { headers: { ...headers, "x-team-cache": age > REFRESH_AFTER ? "stale" : "hit" } });
      }
    }
  }
  try {
    const body = await save();
    return new Response(body, { headers: { ...headers, "x-team-cache": "miss" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 503, headers });
  }
}
