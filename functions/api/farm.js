// 开心农场接口（POST { a: "recharge", tx } 核对 LGNS 充值，不用签名：金币加给付款地址）：GET ?u=地址 看某人的农场（串门 / 偷菜前看）；GET ?list=1&me=地址 好友列表和金币榜；POST { a, addr, day, sig, ... } 种菜、收菜、养鸡、偷菜（规则见 lib/farm.js）
import { CHAINS } from "../../lib/pixel.js";
import { act, load, view, neighbors, recharge, PACKS, DOG_PRICE, DOG_TIME, DOG_BITE, COP_PRICE, COP_TIME, COP_FINE, GOLD_HEN, BOOST, DAILY, DAILY_VIP, KING, TAG, CROPS, HEN_PRICE, MAX_HENS, FEED_COST, FEED_TIME, EGG_TIME, EGG_PRICE, MAX_EGGS, START_PLOTS, MAX_PLOTS, plotPrice, STEAL_SHARE, STEAL_DAY, BAODI_DAY } from "../../lib/farm.js";

const NO_STORE = { headers: { "cache-control": "no-store" } };

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const q = new URL(ctx.request.url).searchParams;
  if (q.get("list")) return Response.json(await neighbors(kv, String(q.get("me") || "").toLowerCase()), NO_STORE);
  if (q.get("rules")) {
    const plots = []; for (let n = START_PLOTS; n < MAX_PLOTS; n++) plots.push(plotPrice(n));
    return Response.json({ crops: CROPS, hen: { price: HEN_PRICE, max: MAX_HENS, feed: FEED_COST, feedTime: FEED_TIME, eggTime: EGG_TIME, egg: EGG_PRICE, maxEggs: MAX_EGGS }, plots, stealShare: STEAL_SHARE, stealDay: STEAL_DAY, baodi: BAODI_DAY,
      packs: PACKS, pay: { token: CHAINS.anubis.lgns, payTo: CHAINS.anubis.payTo, tag: TAG }, dog: { price: DOG_PRICE, days: DOG_TIME / 86400, bite: DOG_BITE }, cop: { price: COP_PRICE, days: COP_TIME / 86400, fine: COP_FINE }, goldHen: GOLD_HEN, boost: BOOST, daily: DAILY, dailyVip: DAILY_VIP, king: KING }, NO_STORE);
  }
  const u = String(q.get("u") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(u)) return Response.json({ error: "地址格式不对" }, { status: 400 });
  const f = await load(kv, u);
  if (!f) return Response.json({ none: true }, NO_STORE);
  // 2026-11-12 站长：规则说「别人看不出谁家有狗、有警察」，公开接口不能带 dog / cop；动态里也有「狗咬了谁」，一起藏。农场主自己看走 POST（带签名）照常有
  const { dog, cop, log, ...pub } = view(f);
  return Response.json(pub, NO_STORE);
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let body;
  try { body = await ctx.request.json(); } catch (e) { return Response.json({ error: "数据格式不对" }, { status: 400 }); }
  try {
    return Response.json(body.a === "recharge" ? await recharge(kv, body.tx) : await act(kv, body), NO_STORE);
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 400 });
  }
}
