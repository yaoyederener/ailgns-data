// OTC 成交额排行榜：GET → { top: [{ a, vol, n }]（前 50），me?: { rank, vol, gap } }；?me=<地址> 再给这个地址的名次和离上一名还差多少
import { loadRank, LB_SKIP } from "../../lib/rank.js";

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const me = (new URL(ctx.request.url).searchParams.get("me") || "").toLowerCase();
  const lb = await loadRank(kv);
  const all = Object.entries(lb).filter(([a]) => !LB_SKIP.has(a)).sort((x, y) => y[1][0] - x[1][0]);
  const out = { top: all.slice(0, 50).map(([a, v]) => ({ a, vol: Math.round(v[0]), n: v[1] })), at: Date.now() };
  if (/^0x[0-9a-f]{40}$/.test(me)) {
    const i = all.findIndex(([a]) => a === me);
    out.me = i < 0 ? { rank: 0, vol: 0, gap: all.length ? Math.ceil(all[all.length - 1][1][0]) : 0 } : { rank: i + 1, vol: Math.round(all[i][1][0]), gap: i ? Math.ceil(all[i - 1][1][0] - all[i][1][0]) + 1 : 0 };
  }
  return Response.json(out, { headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
}
