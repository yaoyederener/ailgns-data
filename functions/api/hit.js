// 访问统计打点（网页用 sendBeacon 发过来）：POST ?e=v（打开网站）/ v1（今天第一次打开）/ q_<页面>（查了一个地址）
// a1（今天第一次从手机桌面图标打开）/ an（这台手机第一次从桌面图标打开 = 新装）/ gd（安装教程点了「加好了」）
import { bump } from "../../lib/stats.js";

const EVENTS = new Set(["v", "v1", "q_member", "q_wallet", "q_team", "q_growth", "q_tree", "q_upline", "q_trades", "a1", "an", "gd"]);

export async function onRequestPost(ctx) {
  const e = new URL(ctx.request.url).searchParams.get("e") || "";
  if (EVENTS.has(e)) {
    if (e === "v" || e === "v1") { bump(ctx, "pv"); bump(ctx, "m" + Math.floor((Date.now() + 8 * 3600e3) % 86400e3 / 300e3)); } // 每 5 分钟一个桶（北京时间当天第几个 5 分钟），算「同时在线」
    if (e === "v1") bump(ctx, "uv");
    if (e.startsWith("q_")) bump(ctx, e);
    if (e === "a1") bump(ctx, "app_uv");
    if (e === "an") bump(ctx, "app_new");
    if (e === "gd") bump(ctx, "app_guide");
  }
  return new Response(null, { status: 204 });
}
