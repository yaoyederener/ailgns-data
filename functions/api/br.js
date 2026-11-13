// 大逃杀接口：GET → 牌桌（所有人共用，边缘缓存 3 秒一档，不用每人都读一遍押注）；POST { a: "me" | "bet", addr, day, sig, room, amt } → 玩家自己的金币和押注（签名和开心农场共用）
import { state, act, ridOf, phaseOf, ROUND } from "../../lib/br.js";

const NO_STORE = { headers: { "cache-control": "no-store" } };

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const t = Math.floor(Date.now() / 1000), ph = phaseOf(t);
  const slot = ridOf(t) + "-" + (ph === "show" ? "show" : Math.floor((t % ROUND) / 3));
  let cache = null, ck = null, body = "";
  try { cache = caches.default; ck = new Request("https://ailgns.dev/api/br/_c/" + slot); const hit = await cache.match(ck); if (hit) body = await hit.text(); } catch (e) { /* 没缓存就现算 */ }
  if (!body) {
    try { body = JSON.stringify(await state(kv, t)); } catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 500 }); }
    try { if (cache) ctx.waitUntil(cache.put(ck, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + (ph === "show" ? 15 : 4) } }))); } catch (e) { /* 忽略 */ }
  }
  /* 缓存的是牌桌数字；时间每次给新的，手机上的倒计时才对得准 */
  return new Response(body.replace(/^\{"now":\d+/, '{"now":' + Math.floor(Date.now() / 1000)), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b;
  try { b = await ctx.request.json(); } catch (e) { return Response.json({ error: "数据格式不对" }, { status: 400 }); }
  try { return Response.json(await act(kv, b), NO_STORE); } catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 400 }); }
}
