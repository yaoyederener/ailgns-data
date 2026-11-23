// ⚠️ 被盗域名名单给页面用（lib/stolen.js）：域名页在「挂单出售」前先对一下，名单上的不让挂；自己读链那条路也拿它过滤。
// GET → { list: [tokenId…] }（64 位十六进制、小写、不带 0x）。名单是公开的链上信息，边缘缓存 5 分钟。
import { STOLEN } from "../../lib/stolen.js";

export async function onRequestGet() {
  return Response.json({ list: Array.from(STOLEN) }, { headers: { "cache-control": "public, max-age=300" } });
}
