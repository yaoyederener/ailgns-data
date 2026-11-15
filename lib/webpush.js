// 🔔 Web Push（RFC 8291 / 8188 / 8292）纯 WebCrypto 实现：iPhone（加到主屏幕后）、安卓、电脑浏览器都能收到系统通知
// VAPID 密钥第一次用时自动生成并存进 KV（push:vapid），没有任何人看得到私钥；订阅存 push:<地址> = [subscription…]（最多 5 台设备）
const te = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const cat = (...arrs) => { const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };

export async function vapid(kv) {
  let v = await kv.get("push:vapid", "json");
  if (v && v.priv && v.pub) return v;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey), raw = await crypto.subtle.exportKey("raw", kp.publicKey);
  v = { priv, pub: b64u(raw), at: Date.now() };
  await kv.put("push:vapid", JSON.stringify(v));
  return v;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}
async function vapidJwt(v, aud) {
  const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const h = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))), c = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:support@ailgns.dev" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(h + "." + c));
  return h + "." + c + "." + b64u(sig);
}
// 加密 payload（aes128gcm）
async function encrypt(sub, text) {
  const clientPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const clientKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, cat(te.encode("WebPush: info\0"), clientPub, serverPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, cat(te.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return cat(salt, rs, new Uint8Array([serverPub.length]), serverPub, ct);
}
// 给一个订阅发一条；返回 { ok, status }，410/404 表示订阅失效（调用方删掉）
export async function sendOne(kv, sub, payload) {
  const v = await vapid(kv), aud = new URL(sub.endpoint).origin, jwt = await vapidJwt(v, aud);
  const body = await encrypt(sub, JSON.stringify(payload));
  const r = await fetch(sub.endpoint, { method: "POST", headers: { "content-type": "application/octet-stream", "content-encoding": "aes128gcm", ttl: "86400", urgency: "high", authorization: "vapid t=" + jwt + ", k=" + v.pub }, body, signal: AbortSignal.timeout(6000) });
  try { if (r.body) await r.body.cancel(); } catch (e) { /* 关不掉不要紧 */ }
  return { ok: r.ok, status: r.status };
}
// 给某个钱包的所有设备发
export async function pushToAddr(kv, addr, payload) {
  const a = String(addr || "").toLowerCase(), key = "push:" + a, subs = (await kv.get(key, "json")) || [];
  if (!subs.length) return 0;
  let sent = 0; const keep = [];
  for (const s of subs) {
    try { const r = await sendOne(kv, s, payload); if (r.ok) { sent++; keep.push(s); } else if (r.status === 404 || r.status === 410) { /* 设备已取消订阅 */ } else keep.push(s); } catch (e) { keep.push(s); }
  }
  if (keep.length !== subs.length) await kv.put(key, JSON.stringify(keep));
  return sent;
}
