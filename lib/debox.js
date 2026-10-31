// DeBox 机器人发消息（服务器端）。密钥放在 Cloudflare 环境变量：DEBOX_API_KEY（必填）、DEBOX_API_SECRET（可选，用于签名）
const API = "https://open.debox.pro/openapi/";

async function sha1Hex(s) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deboxCall(env, path, body, method = "POST") {
  if (!env.DEBOX_API_KEY) throw new Error("no DEBOX_API_KEY");
  const nonce = String(Math.floor(Math.random() * 2 ** 31)), ts = String(Math.floor(Date.now() / 1000));
  const headers = { "content-type": "application/json", "X-API-KEY": env.DEBOX_API_KEY, nonce, timestamp: ts, "X-Request-Id": crypto.randomUUID() };
  if (env.DEBOX_API_SECRET) headers.signature = await sha1Hex(env.DEBOX_API_SECRET + nonce + ts);
  const r = await fetch(API + path, { method, headers, body: method === "POST" ? JSON.stringify(body || {}) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !(j.ok || j.success)) throw new Error("debox " + path + " " + r.status + " " + JSON.stringify(j).slice(0, 200));
  return j.result;
}

export function sendDebox(env, chatId, text, chatType = "private") {
  return deboxCall(env, "bot/sendMessage", { chat_id: String(chatId), chat_type: chatType, content: text, parse_mode: "text" });
}
