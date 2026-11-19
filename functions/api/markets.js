// 📊 市场列表（OTC 页「全部市场」，站长 2026-11-19：点开更多做成交易所形式，以后要上很多币种）
// GET → { m: { <市场>: { px: 最新成交价, t: 最新成交时间, vol: 最近 24 小时成交额 DAI, n: 最近 24 小时笔数, more: 实际比这个数多 } }, at }
// 数据是 otc-watch 记进 KV 的最近成交（otc:fills:<市场>，每个市场最近 300 笔）；没有成交记录的市场不在返回里，页面显示「暂无成交」。
// 边缘缓存 60 秒：再多人看也只是每个边缘每分钟读一次 KV。市场名单在 otc.js 的 MARKETS / MKEYS，这里的 KEYS 要跟着加
const KEYS = ["ailgns", "lgns", "glgns", "nft", "plgns"];
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const now = Math.floor(Date.now() / 1000), m = {};
  const all = await Promise.all(KEYS.map((k) => kv.get("otc:fills:" + k, "json").catch(() => null)));
  KEYS.forEach((k, i) => {
    const fl = Array.isArray(all[i]) ? all[i] : [];
    if (!fl.length) return;
    const day = fl.filter((x) => x && now - x.t < 86400);
    // 账本每个市场只留最近 300 笔：成交很多的币，300 笔还不到 24 小时，算出来的成交额就偏少——这时标 more，页面在数字后面加「+」
    const more = fl.length >= 300 && now - fl[fl.length - 1].t < 86400;
    m[k] = { px: fl[0].px, t: fl[0].t, vol: Math.round(day.reduce((s, x) => s + (Number(x.dai) || 0), 0) * 100) / 100, n: day.length, more };
  });
  return Response.json({ m, at: Date.now() }, { headers: { "cache-control": "public, max-age=60" } });
}
