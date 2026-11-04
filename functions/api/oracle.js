// 🔮 AiLGNS 每日预言家 API（规则见 lib/oracle.js）
// GET  [?a=0x…]                       → 当前轮、奖池、参与人数、正在开奖的这一轮（9 点后公开全部预测）、最近结果、预言家榜、我的次数
// POST { a, ps: ["827.354", …], day, sig } → 提交预测（钱包签名，不花钱；只能加，不能改）
// GET  ?pay=1&key=BACKUP_KEY          → 还没发的奖金（发奖程序用）；POST { action: "paid", id, tx, key } → 记为已发
// 签名文字必须和 oracle.js（前端）里的 guessText 一字不差
import { recoverAddress } from "../../lib/evmsig.js";
import { priceMilli, openRound, drawStart, prevDay, settle, guessesOf, allotOf, primaryName, tierOf, otcBonus, fmtP, MAX_GUESS, FIRST_DAY, poolNow, eligibility, OTC_MIN } from "../../lib/oracle.js";

const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const guessText = (day, ps, a) => "AiLGNS 每日预言家\n我预测 " + day + " 晚上 9-10 点 AiLGNS 价格：\n" + ps.join(", ") + " DAI\n地址：" + a;
const pub = (g) => ({ name: g.name, ps: g.ps.map((x) => fmtP(x[0])) });

async function quota(kv, a, name, day) {
  const t = name ? tierOf(name) : { n: 1, label: "普通" }, bonus = await otcBonus(kv, a, day);
  return { tier: t.label, base: t.n, bonus, n: Math.min(MAX_GUESS, t.n + bonus) };
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  if (u.searchParams.get("pay")) {
    if (!ctx.env.BACKUP_KEY || u.searchParams.get("key") !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
    return json({ pay: ((await kv.get("or:pay", "json")) || []).filter((x) => !x.tx) });
  }
  const now = Date.now(), round = openRound(now), drawing = prevDay(round); // drawing：今晚 9–10 点正在开奖 / 刚开完的那一轮
  // 到点了顺手开奖（算过就不再算）
  let res = null;
  try { res = await settle(kv, drawing, now); } catch (e) { res = null; }
  const [g, poolV, last, wins, al, alDraw] = await Promise.all([guessesOf(kv, round), poolNow(kv), kv.get("or:last", "json"), kv.get("or:wins", "json"), allotOf(kv, round), allotOf(kv, drawing)]);
  const out = {
    now, round, cutoff: drawStart(round), drawFrom: drawStart(round), drawTo: drawStart(round) + 3600e3,
    pool: poolV, allot: al.allot, rev: al.rev,
    count: { n: g.length, guesses: g.reduce((s, x) => s + x.ps.length, 0) },
    players: g.map((x) => ({ name: x.name, ps: x.ps.map((p) => fmtP(p[0])) })), // 本轮谁参加了、猜的价格（公开，页面按离当前价远近实时滚动）
    drawing: { day: drawing, from: drawStart(drawing), to: drawStart(drawing) + 3600e3, res, allot: drawing < FIRST_DAY ? 0 : alDraw.allot, skip: drawing < FIRST_DAY },
    last, board: Object.entries(wins || {}).map(([name, w]) => ({ name, c: w[0], j: w[1] })).sort((x, y) => y.j - x.j || y.c - x.c).slice(0, 20),
  };
  // 奖金池里实际留了多少钱（发奖程序的记账文件，公开在 GitHub）：DAI、AiLGNS，LGNS 不留（按价值记成待留）
  try {
    const st = await fetch("https://raw.githubusercontent.com/yaoyederener/monita/main/data/oracle_prize.json", { cf: { cacheTtl: 60 } }).then((r) => r.json());
    const px = await priceMilli();
    const big = (x) => Number(BigInt(x || "0") / 10n ** 12n) / 1e6;
    out.funds = { dai: big(st.held), ail: big(st.held_ail), owed: big(st.owed), px: px.raw };
  } catch (e) { out.funds = null; }
  // 正在开奖的这一轮：9 点以后已经锁定，公开所有预测
  if (now >= drawStart(drawing)) out.drawing.list = (await guessesOf(kv, drawing)).map(pub);
  const a = (u.searchParams.get("a") || "").toLowerCase();
  if (isAddr(a)) {
    try {
      const el = await eligibility(kv, a), name = el.name;
      out.me = { a, name, gno: el.gno, vol: el.vol, ok: el.ok, need: OTC_MIN, cool: el.cool };
      if (el.ok) {
        const q = await quota(kv, a, name, round), mine = await kv.get("or:g:" + round + ":" + el.key, "json");
        out.me = { ...out.me, ...q, used: mine ? mine.ps.length : 0, ps: mine ? mine.ps.map((x) => fmtP(x[0])) : [], taken: !!(mine && mine.a !== a) };
      }
    } catch (e) { out.me = { a, err: "读链失败" }; }
  }
  return json(out);
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  if (b.action === "paid") {
    if (!ctx.env.BACKUP_KEY || b.key !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
    const pay = (await kv.get("or:pay", "json")) || [], x = pay.find((p) => p.id === b.id);
    if (!x) return json({ error: "没有这一笔" }, 404);
    x.tx = String(b.tx || ""); x.paidAt = Date.now();
    await kv.put("or:pay", JSON.stringify(pay));
    return json({ ok: true });
  }
  const a = String(b.a || "").toLowerCase(), day = String(b.day || ""), sig = String(b.sig || "");
  if (!isAddr(a)) return json({ error: "请先连接钱包" }, 400);
  const round = openRound();
  if (day !== round) return json({ error: "这一轮已经开始开奖了，请刷新页面，预测下一轮" }, 400);
  const raw = Array.isArray(b.ps) ? b.ps.map((x) => String(x).trim()) : [];
  if (!raw.length || raw.some((x) => !/^\d{1,7}(\.\d{1,3})?$/.test(x))) return json({ error: "价格格式不对，例如 827.354（最多 3 位小数）" }, 400);
  const ps = raw.map((x) => Number(x).toFixed(3));
  if (new Set(ps).size !== ps.length) return json({ error: "这次提交里有重复的价格" }, 400);
  if (recoverAddress(guessText(day, raw, a), sig) !== a) return json({ error: "签名核对失败，请用当前钱包重新签名" }, 400);
  if (a === "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6" || a === "0x89dd06754bb239b6c4c92bc47c8fa72889084e27") return json({ error: "站长钱包不参加" }, 400);
  let el;
  try { el = await eligibility(kv, a); } catch (e) { return json({ error: "读链失败，请稍后再试" }, 502); }
  if (el.cool) return json({ error: "恭喜你中过奖！" + (el.name || "这个钱包") + " 冷却中，" + el.cool + " 这一轮之后恢复（中奖后暂停 7 轮，让新人也有机会）" }, 400);
  if (!el.ok) return json({ error: "还没有参加资格：主名字是创世 .ailgns 域名，或者 OTC 累计成交满 " + OTC_MIN.toLocaleString("en-US") + " DAI，满足其一就能参加" }, 400);
  const name = el.name || a.slice(0, 6) + "…" + a.slice(-4); // 没有域名、靠 OTC 成交参加的，用短地址显示
  const key = "or:g:" + round + ":" + el.key, mine = (await kv.get(key, "json")) || { a, name, ps: [] };
  if (mine.a !== a) return json({ error: name + " 这一轮已经由别的钱包预测过了，一个名字每轮只能用一次" }, 400);
  const q = await quota(kv, a, el.name, round), have = new Set(mine.ps.map((x) => fmtP(x[0])));
  const fresh = ps.filter((p) => !have.has(p));
  if (!fresh.length) return json({ error: "这些价格你已经预测过了" }, 400);
  if (mine.ps.length + fresh.length > q.n) return json({ error: "次数不够：你这一轮共 " + q.n + " 次，已用 " + mine.ps.length + " 次" }, 400);
  const t = Date.now();
  fresh.forEach((p) => mine.ps.push([Math.round(Number(p) * 1000), t]));
  mine.tier = q.tier;
  await kv.put(key, JSON.stringify(mine), { expirationTtl: 400 * 86400 });
  return json({ ok: true, round, name, ps: mine.ps.map((x) => fmtP(x[0])), left: q.n - mine.ps.length });
}

