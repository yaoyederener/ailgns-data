// 香港中转专用的客服入口（站长 2026-11-10）：Cloudflare 免费版的限流规则按 IP 算，会把香港中转 140.235.99.27 当成一个人，
// 规则表达式又不让按 IP 排除（要付费版）。所以香港机把 /api/chat 转到这里，这里只认来自香港机的请求；
// 真正的每客户限流在香港机 nginx 上做（每 IP 10 秒 8 次，和 Cloudflare 规则一样），逻辑完全复用 chat.js。
import { onRequestGet as chatGet } from "./chat.js";
const HK_IP = "140.235.99.27", HK_IP6_PREFIX = "2403:18c0:4:866:"; // 香港机出口：IPv4 一个，IPv6 一段 /64（nginx 连 Cloudflare 常走 IPv6）
function fromHK(request) { const ip = (request.headers.get("cf-connecting-ip") || "").toLowerCase(); return ip === HK_IP || ip.startsWith(HK_IP6_PREFIX); }
const deny = () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "content-type": "application/json" } });
export async function onRequestGet(ctx) { return fromHK(ctx.request) ? chatGet(ctx) : deny(); }
// 站长 2026-11-12「遵守 AI 服务商规则优先，求稳」：走中转的基本都是服务商不支持地区的客户，而中转机的 IPv4 被登记成美国，
// 一半请求会碰巧通到 AI，等于替不支持地区转发。所以这条线不再调用 AI：直接回 502，网页客服自动改用人写的标准答案（chat.js 的 FAQ）。
export async function onRequestPost(ctx) { return fromHK(ctx.request) ? new Response("ai off on relay", { status: 502 }) : deny(); }
