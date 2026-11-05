// 更新日志：GET → { list: [{ d, t }] }（lib/updates.js，客服机器人也用同一份）
import { UPDATES } from "../../lib/updates.js";
export async function onRequestGet() {
  return Response.json({ list: UPDATES }, { headers: { "cache-control": "public, max-age=60" } });
}
