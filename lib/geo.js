// 📍 钱包连接地区（站长 2026-11-15 定）：钱包连上网站后，页面会带着地址来问未读通知数（/api/inbox?n=），
// 这时顺手记下「这个地址、什么时间、从哪个国家 / 省 / 城市来」。位置是 Cloudflare 给的，只到城市。
// 守三条线：① 不存 IP ② 每条最多留 30 天 ③ 只有站长口令能查（functions/api/geo.js）。网站免责声明里已公开告知。
// 注意：问未读数不用签名，所以这条记录只能说明「有人带着这个地址从那里打开过网站」，不能证明就是钱包主人；开 VPN 的位置也不准。只当参考，不当证据。
const KEEP = 30 * 86400e3, GAP = 6 * 3600e3, MAX = 8;
const seen = new Map(); // 同一台服务器上 1 小时内问过的地址不重复读写数据库（页面每隔一会儿就来问一次）
export async function noteGeo(kv, a, request) {
  try {
    const cf = (request && request.cf) || {}, c = String(cf.country || request.headers.get("cf-ipcountry") || "").slice(0, 4), r = String(cf.region || "").slice(0, 40), city = String(cf.city || "").slice(0, 40);
    if (!kv || !c || c === "XX" || c === "T1") return; // 没有地区信息（或是 Tor）就不记
    const now = Date.now(), place = c + "|" + r + "|" + city, last = seen.get(a);
    if (last && last.p === place && now - last.t < 3600e3) return;
    if (seen.size > 5000) seen.clear();
    seen.set(a, { p: place, t: now });
    const key = "geo:" + a, list = ((await kv.get(key, "json")) || []).filter((x) => x && now - x.t < KEEP);
    const top = list[0];
    if (top && top.c === c && top.r === r && top.city === city) { if (now - top.t < GAP) return; top.t = now; top.n = (top.n || 1) + 1; }
    else list.unshift({ t: now, t0: now, c, r, city, n: 1 });
    await kv.put(key, JSON.stringify(list.slice(0, MAX)), { expirationTtl: 30 * 86400 });
  } catch (e) { /* 记不上就算了，绝不影响页面 */ }
}
export async function readGeo(kv, a) {
  const now = Date.now();
  return ((await kv.get("geo:" + a, "json")) || []).filter((x) => x && now - x.t < KEEP);
}
