// 🌀 涡轮助手用：替页面去官方（awakehelix.io）取「社区动态排放」的领取凭证（默克尔证明）。
// 站长 2026-11-26：「社区动态排放也加上，很多团队长也需要」。官方的做法（从官方页面脚本核对）：
//   动态排放每天由官方算好一棵树，树根记在排放金库合约里；每个钱包领的时候要带上自己的「累计数 + 证明」，合约自己验，验不过就领不了。
//   所以这份凭证是公开数据、不是秘密，拿错了、被改了也只会领取失败，不会多领、不会领到别人头上。
// 页面不直接连官方网站（网站的安全策略只放行自家域名和几个节点），由这里转一下：只传钱包地址，只回 day / root / cumulativeRaw / proof 四样，60 秒缓存。
// GET ?a=0x… → { day, root, cumulativeRaw, proof } ；官方那边没有这个钱包的份 → { proof: null }
const json = (o, s, age) => Response.json(o, { status: s || 200, headers: { "cache-control": age ? "public, max-age=" + age : "no-store" } });
const B32 = /^0x[0-9a-fA-F]{64}$/;
export async function onRequestGet(ctx) {
  const a = (new URL(ctx.request.url).searchParams.get("a") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return json({ error: "地址不对" }, 400);
  let j;
  try {
    const r = await fetch("https://awakehelix.io/api/v1/emission/" + a + "/proof", { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" }, cf: { cacheTtl: 60, cacheEverything: true } });
    if (!r.ok) return json({ error: "官方接口暂时读不到（" + r.status + "）" }, 502);
    j = await r.json();
  } catch (e) { return json({ error: "官方接口暂时读不到" }, 502); }
  const proof = Array.isArray(j && j.proof) && j.proof.length <= 64 && j.proof.every((x) => B32.test(x)) ? j.proof : null;
  const cum = j && /^\d{1,78}$/.test(String(j.cumulativeRaw || "")) ? String(j.cumulativeRaw) : null;
  if (!proof || !cum || !B32.test(String(j.root || ""))) return json({ day: Number(j && j.day) || 0, root: null, cumulativeRaw: null, proof: null }, 200, 60);
  return json({ day: Number(j.day) || 0, root: String(j.root).toLowerCase(), cumulativeRaw: cum, proof: proof.map((x) => x.toLowerCase()) }, 200, 60);
}
