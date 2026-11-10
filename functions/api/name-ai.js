// ✨ 域名市场「AI 推荐」（站长 2026-11-09 拍板）：每小时让 Claude 从全部挂单里挑 20 个值得买的，每个一句大白话理由
// 标准只有三条：寓意好、稀缺（短名 / 创世早期号）、性价比（比同类挂单便宜）；只看名字和价格，不看卖家是谁
// GET → { at, n 当时挂单数, picks: [{ t, id, label, why, tag }] }；KV nm:ai 缓存，先给旧的后台重算（超过 1 小时），没有缓存才当场算
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
const chars = (s) => Array.from(s).length, cn = (s) => /[一-鿿]/.test(s);
const yearPrice = (s) => { const n = chars(s); return cn(s) ? (n === 2 ? 50 : 5) : n === 3 ? 640 : n === 4 ? 160 : 5; }; // 和 names.js yearPrice 一致
const N_PICK = 20, MAX_ROWS = 800, TTL = 3600e3;

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return json({ error: "no kv" }, 503);
  let cur = await kv.get("nm:ai", "json");
  if (!cur) {
    try { cur = await build(ctx, kv, u.origin); } catch (e) { return json({ at: 0, picks: [], err: String((e && e.message) || e).slice(0, 120) }); }
  } else if (Date.now() - (cur.at || 0) > TTL && !(await kv.get("nm:ai:busy"))) ctx.waitUntil(build(ctx, kv, u.origin).catch(() => {}));
  return json(cur);
}

async function build(ctx, kv, origin) {
  await kv.put("nm:ai:busy", "1", { expirationTtl: 300 });
  try {
    const [mk, ge] = await Promise.all([fetch(origin + "/api/name-market").then((r) => r.json()), fetch(origin + "/api/name-genesis").then((r) => r.json()).catch(() => ({}))]);
    const g = (ge && ge.g) || {};
    let list = ((mk && mk.list) || []).filter((x) => !x.expired && x.t === "ailgns" && x.label);
    list.forEach((x) => { x.dai = Number(BigInt(x.price) / 10n ** 12n) / 1e6; x.gno = g[x.tid] || 0; x.cost = yearPrice(x.label); });
    const n = list.length;
    if (!n) { const out = { at: Date.now(), n: 0, picks: [] }; await kv.put("nm:ai", JSON.stringify(out), { expirationTtl: 7 * 86400 }); return out; }
    // 太多就先按创世号、价格粗筛到 800 个，再交给 AI
    if (list.length > MAX_ROWS) list = list.sort((a, b) => (a.gno || 1e9) - (b.gno || 1e9) || a.dai - b.dai).slice(0, MAX_ROWS);
    const rows = list.map((x, i) => `${i}|${x.label}|${x.dai}|${x.gno || "-"}|${x.cost}`).join("\n");
    const sys = "你是一个域名市场的挑选助手。下面是 .ailgns 链上域名市场正在出售的名字，每行格式：序号|名字|标价DAI|创世编号(没有填-)|每年注册价DAI。" +
      "创世编号 = 全站前 1 万个付费注册的名字，编号越小越早越稀有；注册价高的名字（640/160/50）本身更稀缺。" +
      `请只按三条标准挑出 ${N_PICK} 个最值得买的：① 寓意好（吉祥、好记、有商业价值、热门词）② 稀缺（短名、创世早期号）③ 性价比（标价相对同类明显便宜；标价高到离谱的不选）。不看卖家。` +
      "只输出 JSON 数组，不要任何解释，格式：[{\"i\":序号,\"why\":\"不超过 20 字的大白话理由\",\"tag\":\"寓意|稀缺|性价比 三选一\"}]。理由要具体到这个名字，别写套话。";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ctx.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ctx.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: 3000, system: sys, messages: [{ role: "user", content: rows }] }),
    });
    if (!r.ok) throw new Error("ai " + r.status);
    const j = await r.json(), text = (j.content || []).map((c) => c.text || "").join("").replace(/```(?:json)?/g, "");
    const a = text.indexOf("["), b = text.lastIndexOf("]");
    let arr;
    try { if (a < 0 || b <= a) throw new Error("no array"); arr = JSON.parse(text.slice(a, b + 1)); }
    catch (e) { throw new Error("parse(" + (j.stop_reason || "") + "): " + text.slice(0, 160).replace(/\s+/g, " ")); } // 原文截一段，排查 AI 到底回了什么
    const seen = {}, picks = [];
    for (const p of arr) {
      const x = list[Number(p.i)]; if (!x || seen[x.id]) continue; seen[x.id] = 1;
      picks.push({ t: x.t, id: x.id, label: x.label, why: String(p.why || "").slice(0, 40), tag: /稀缺/.test(p.tag) ? "稀缺" : /性价比|便宜/.test(p.tag) ? "性价比" : "寓意" });
      if (picks.length >= N_PICK) break;
    }
    const out = { at: Date.now(), n, picks };
    await kv.put("nm:ai", JSON.stringify(out), { expirationTtl: 7 * 86400 });
    return out;
  } finally { await kv.delete("nm:ai:busy").catch(() => {}); }
}
