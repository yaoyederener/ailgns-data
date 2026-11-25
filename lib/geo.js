// 📍 钱包连接地区（站长 2026-11-15 定）：钱包连上网站后，页面会带着地址来问未读通知数（/api/inbox?n=），
// 这时顺手记下「这个地址、什么时间、从哪个国家 / 省来、走的哪家网络」。位置是 Cloudflare 给的。
// 站长 2026-11-25「显示不准确，优化一下」：城市那一级最不准，不再记；多记一项网络运营商的名字（不是 IP），出口是机房 / VPN 的标出来（dc），后台显示「位置不可信」。
// 守三条线：① 不存 IP ② 每条最多留 30 天 ③ 只有站长口令能查（functions/api/geo.js）。网站免责声明里已公开告知。
// 注意：问未读数不用签名，所以这条记录只能说明「有人带着这个地址从那里打开过网站」，不能证明就是钱包主人；开 VPN 的位置也不准。只当参考，不当证据。
const KEEP = 30 * 86400e3, GAP = 6 * 3600e3, MAX = 8;
const seen = new Map(); // 同一台服务器上 1 小时内问过的地址不重复读写数据库（页面每隔一会儿就来问一次）
// 出口是机房 / 云服务器 / VPN 商的：位置是机房的位置，不是人在的位置
export const isDc = (net) => /amazon|\baws\b|google cloud|google llc|microsoft|azure|digitalocean|linode|akamai|vultr|choopa|constant company|\bovh\b|hetzner|alibaba|aliyun|tencent cloud|tencent building|oracle|m247|datacamp|cdn77|leaseweb|contabo|cloudflare|hosting|\bhost|server|data ?cent|\bvpn\b|proxy|colocation|cogent|zenlayer|\bdmit\b|it7|racknerd|psychz|quadranet|g-?core|misaka|packet|cloud/i.test(String(net || ""));
export async function noteGeo(kv, a, request) {
  try {
    const cf = (request && request.cf) || {}, c = String(cf.country || request.headers.get("cf-ipcountry") || "").slice(0, 4), r = String(cf.region || "").slice(0, 40), net = String(cf.asOrganization || "").slice(0, 40), dc = isDc(net) ? 1 : 0;
    if (!kv || !c || c === "XX" || c === "T1") return; // 没有地区信息（或是 Tor）就不记
    const now = Date.now(), place = c + "|" + r + "|" + dc, last = seen.get(a);
    if (last && last.p === place && now - last.t < 3600e3) return;
    if (seen.size > 5000) seen.clear();
    seen.set(a, { p: place, t: now });
    const key = "geo:" + a, list = ((await kv.get(key, "json")) || []).filter((x) => x && now - x.t < KEEP);
    const top = list[0];
    if (top && top.c === c && top.r === r && !top.city && (top.dc || 0) === dc) { if (now - top.t < GAP) return; top.t = now; top.n = (top.n || 1) + 1; top.net = net; }
    else list.unshift({ t: now, t0: now, c, r, net, dc, n: 1 });
    await kv.put(key, JSON.stringify(list.slice(0, MAX)), { expirationTtl: 30 * 86400 });
  } catch (e) { /* 记不上就算了，绝不影响页面 */ }
}
export async function readGeo(kv, a) {
  const now = Date.now();
  return ((await kv.get("geo:" + a, "json")) || []).filter((x) => x && now - x.t < KEEP).map((x) => ({ t: x.t, t0: x.t0, c: x.c, r: x.r, net: x.net || "", dc: x.dc ? 1 : 0, n: x.n }));
}
