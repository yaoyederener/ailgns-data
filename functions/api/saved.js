// 💚 「比 DEX 多赚」记账：前端成交后把这一单比 DEX 多赚的 DAI 报上来（按当时 DEX 价 + 手续费/卖出税算，和页面上显示的一致）
//   POST { a, tx, d, dai }  → saved:<a> = { dai: 累计多赚, n: 笔数, vol: 成交额 }，saved:all 全站合计；按 tx 去重；d 不得超过成交额 40%（防刷）
//   GET  ?a=0x…            → { me: {...}, all: {...} }
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ all: { dai: 0, n: 0 } });
  const a = String(new URL(ctx.request.url).searchParams.get("a") || "").toLowerCase();
  const [all, me] = await Promise.all([kv.get("saved:all", "json"), /^0x[0-9a-f]{40}$/.test(a) ? kv.get("saved:" + a, "json") : null]);
  return json({ all: all || { dai: 0, n: 0, vol: 0 }, me: me || null });
}
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV; if (!kv) return json({ ok: false });
  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const a = String(b.a || "").toLowerCase(), tx = String(b.tx || "").toLowerCase(), d = Number(b.d), dai = Number(b.dai);
  if (!/^0x[0-9a-f]{40}$/.test(a) || !/^0x[0-9a-f]{64}$/.test(tx) || !(d > 0) || !(dai > 0) || d > dai * 0.4) return json({ error: "参数不对" }, 400);
  if (await kv.get("saved:tx:" + tx)) return json({ ok: true, dup: true });
  await kv.put("saved:tx:" + tx, "1", { expirationTtl: 400 * 86400 });
  const me = (await kv.get("saved:" + a, "json")) || { dai: 0, n: 0, vol: 0 }, all = (await kv.get("saved:all", "json")) || { dai: 0, n: 0, vol: 0 };
  me.dai = Math.round((me.dai + d) * 100) / 100; me.n += 1; me.vol = Math.round((me.vol || 0) + dai);
  all.dai = Math.round((all.dai + d) * 100) / 100; all.n += 1; all.vol = Math.round((all.vol || 0) + dai);
  await Promise.all([kv.put("saved:" + a, JSON.stringify(me)), kv.put("saved:all", JSON.stringify(all))]);
  return json({ ok: true, me, all });
}
