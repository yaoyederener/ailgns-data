// 访问统计打点（网页用 sendBeacon 发过来）：POST ?e=v（打开网站）/ v1（今天第一次打开）/ q_<页面>（查了一个地址）
import { bump } from "../../lib/stats.js";

const EVENTS = new Set(["v", "v1", "q_member", "q_wallet", "q_team", "q_growth", "q_tree", "q_upline", "q_trades"]);

export async function onRequestPost(ctx) {
  const e = new URL(ctx.request.url).searchParams.get("e") || "";
  if (EVENTS.has(e)) {
    if (e === "v" || e === "v1") bump(ctx, "pv");
    if (e === "v1") bump(ctx, "uv");
    if (e.startsWith("q_")) bump(ctx, e);
  }
  return new Response(null, { status: 204 });
}
