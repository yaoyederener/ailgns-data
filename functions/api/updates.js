// 更新日志：GET（请求头 x-key = 站长口令）→ { list: [{ d, t }] }（lib/updates.js，客服机器人也用同一份）
// 站长 2026-11-26：「更新日志放在后台，前台不要展示，骗子在模仿我们」→ 这个接口以前谁都能读，现在只认站长口令（和工单后台同一个）
import { UPDATES } from "../../lib/updates.js";
export async function onRequestGet(ctx) {
  const k = String(ctx.request.headers.get("x-key") || "");
  if (!k || !ctx.env.FEEDBACK_KEY || k !== ctx.env.FEEDBACK_KEY) return Response.json({ error: "口令不对" }, { status: 403, headers: { "cache-control": "no-store" } });
  return Response.json({ list: UPDATES }, { headers: { "cache-control": "no-store" } });
}
