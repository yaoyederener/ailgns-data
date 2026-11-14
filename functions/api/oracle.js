// 🔮 AiLGNS 每日预言家 API（规则见 lib/oracle.js）
// GET  [?a=0x…]                       → 当前轮、奖池、参与人数、正在开奖的这一轮（9 点后公开全部预测）、最近结果、预言家榜、我的次数
// POST { a, ps: ["827.354", …], day, sig } → 提交预测（钱包签名，不花钱；只能加，不能改）
// GET  ?pay=1&key=BACKUP_KEY          → 还没发的奖金（发奖程序用；2026-11-09 起只给「已销毁 1 枚创世名」的，没烧的等，3 天没烧作废）；POST { action: "paid", id, tx, key } → 记为已发
// 签名文字必须和 oracle.js（前端）里的 guessText 一字不差
import { recoverAddress } from "../../lib/evmsig.js";
import { rpc, needSay, sayUrlOk, sayText } from "../../lib/oracle.js";
import { pushInbox } from "../../lib/inbox.js";
const OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 站长站内信（谷歌社交账号钱包），和工单后台同一个
const KIND_CN = { king: "贡献王", closest: "天眼通", second: "地灵通", jackpot: "神算子大奖", daily: "每日前三" };
const admOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY)); // 后台只用工单口令（站长：只留一个口令）
import { poolFunds, POOL, otcHi, heldSince, priceMilli, openRound, drawStart, prevDay, settle, guessesOf, allotOf, primaryName, tierOf, otcBonus, fmtP, decOf, scOf, MAX_GUESS, FIRST_DAY, poolNow, eligibility, OTC_MIN, feeBoard, cycleStart, showName, KING, KING_SPLIT, KING_CAP, kingsOf, weekStart, bjDay, kingBudget, KING_IN, KING_IN_FROM, burnCheck, payState, payDue, needBurn, BURN_DAYS, cutoffAt, needCount, burnedCount, NAME_PRICE, DAILY_FROM, DAILY_PRIZE, DAILY_TOP, DAILY_COOL_DAYS } from "../../lib/oracle.js";

const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const guessText = (day, ps, a) => "AiLGNS 每日预言家\n我预测 " + day + " 晚上 9-10 点 AiLGNS 价格：\n" + ps.join(", ") + " DAI\n地址：" + a;
const pub = (g, day) => ({ name: g.name, ps: g.ps.map((x) => fmtP(x[0], day)), tx: g.tx || "" });

async function quota(kv, a, name, day) {
  const t = name ? tierOf(name) : { n: 1, label: "普通" }, bonus = await otcBonus(kv, a, day);
  return { tier: t.label, base: t.n, bonus, n: Math.min(MAX_GUESS, t.n + bonus) };
}

// 🔗 链上存证：封卷（21:00）后把本期全部预测按固定格式排好、算 SHA-256 指纹，奖池钱包发一笔 0 元交易把指纹写进链上（keeper oracle_anchor.py 做）
// 任何人都能：下载本期清单 → 自己算 SHA-256 → 和链上交易 data 里的指纹对比 → 证明名单没被改过
async function proofOf(kv, day) {
  const g = await guessesOf(kv, day);
  const entries = g.map((x) => ({ name: x.name, a: x.a, ps: (x.ps || []).map((p) => [p[0], p[1]]) })).sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  const canon = JSON.stringify({ day, entries });
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { day, n: entries.length, guesses: entries.reduce((s, e) => s + e.ps.length, 0), canon, hash, anchor: (await kv.get("or:anchor:" + day, "json")) || null };
}
// 页面公共数据（和访客无关的部分）：站长 2026-11-08「显示慢，改成读缓存」→ 存 or:pub，30 秒内直接给，过期先给旧的、后台重算
async function buildPub(kv, ctx, now) {
  const round = openRound(now), drawing = prevDay(round); // drawing：今晚 9–10 点正在开奖 / 刚开完的那一轮
  // 到点了顺手开奖（算过就不再算）
  let res = null;
  try { res = await settle(kv, drawing, now); } catch (e) { res = null; }
  const [g, poolV, last, wins, al, alDraw] = await Promise.all([guessesOf(kv, round), poolNow(kv), kv.get("or:last", "json"), kv.get("or:wins", "json"), allotOf(kv, round), allotOf(kv, drawing)]);
  const out = {
    now, round, dec: decOf(round), cutoff: cutoffAt(round), drawFrom: drawStart(round), drawTo: drawStart(round) + 3600e3,
    pool: poolV, allot: al.allot,
    daily: { from: DAILY_FROM, on: round >= DAILY_FROM, prize: DAILY_PRIZE, top: DAILY_TOP, cool: DAILY_COOL_DAYS, each: Math.floor(Math.min(DAILY_PRIZE, al.allot / DAILY_TOP) * 100) / 100 }, /* 每日前三（站长 2026-11-13 定）：each = 今晚每人能拿多少（只花当天进账） */
    count: { n: g.length, guesses: g.reduce((s, x) => s + x.ps.length, 0) },
    players: g.map((x) => ({ name: x.name, ps: x.ps.map((p) => fmtP(p[0], round)), tx: x.tx || "" })), // 本轮谁参加了、猜的价格（公开，页面按离当前价远近实时滚动）
    drawing: { anchor: (await kv.get("or:anchor:" + drawing, "json")) || null, day: drawing, dec: decOf(drawing), cutoff: cutoffAt(drawing), from: drawStart(drawing), to: drawStart(drawing) + 3600e3, res, allot: drawing < FIRST_DAY ? 0 : alDraw.allot, skip: drawing < FIRST_DAY },
    last, board: Object.entries(wins || {}).map(([name, w]) => ({ name, c: w[0], j: w[1] })).sort((x, y) => y.j - x.j || y.c - x.c).slice(0, 20),
  };
  // 奖金池里实际留了多少钱（发奖程序的记账文件，公开在 GitHub）：DAI、AiLGNS，LGNS 不留（按价值记成待留）
  try {
    const [f, px] = await Promise.all([poolFunds(), priceMilli()]); // 奖池钱包链上实际余额
    out.funds = { dai: f.dai, ail: f.ail, px: px.raw, wallet: POOL };
    try { out.funds.otc = await otcHi(kv); } catch (e) { out.funds.otc = { px: px.raw, at: Date.now(), n: 0, src: "dex" }; }
  } catch (e) { out.funds = null; }
  // 本周贡献榜（周一起到今天，认证商家以上；按手续费占比分奖池 30%，每人封顶手续费 KING_CAP 倍；周日揭晓时结算）
  try {
    if (weekStart(bjDay(now)) >= DAILY_FROM) throw new Error("king off"); /* DAILY_FROM 那周起没有贡献王了 */
    const cyc = weekStart(bjDay(now)), held = out.funds ? (out.funds.dai + out.funds.ail * (out.funds.otc && out.funds.otc.px ? out.funds.otc.px : out.funds.px)) : 0;
    // 提速（站长 2026-11-08「读取太慢」）：手续费表只扫一次，并缓存 60 秒；算出来的榜单大家共用
    let kc = await kv.get("or:kcache", "json");
    if (!kc || kc.cyc !== cyc || Date.now() - kc.at > 60e3) {
      const today = bjDay(now), bud = await kingBudget(kv, cyc, today, held);
      const all = await feeBoard(kv, cyc, today), kb = await kingsOf(kv, cyc, today, bud.total, all);
      kc = { at: Date.now(), cyc, n: kb.n, top: kb.top.map((x) => ({ a: x.a, name: x.name, fee: x.fee, lv: x.lv, share: x.share, amt: x.amt, demoted: !!x.demoted })), all, budget: bud };
      ctx.waitUntil(kv.put("or:kcache", JSON.stringify(kc), { expirationTtl: 600 }));
    }
    out.kings = { cyc, n: kc.n, top: kc.top, share: KING, cap: KING_CAP, minLv: 2, budget: kc.budget || null, inRate: KING_IN, inFrom: KING_IN_FROM, all: kc.all }; // all 只在服务端用，返回前删掉
  } catch (e) { out.kings = null; }
  // 正在开奖的这一轮：9 点以后已经锁定，公开所有预测
  if (now >= cutoffAt(drawing)) out.drawing.list = (await guessesOf(kv, drawing)).map((g) => pub(g, drawing)); // 封卷后公开全部预测
  // 站长 2026-11-08：揭晓卡公开发奖记录（谁、什么奖、多少 AiLGNS、链上交易），公开公正；只给最近 14 天
  try { const p0 = (await kv.get("or:pay", "json")) || [], d0 = bjDay(now - 14 * 86400e3); out.pays = p0.filter((x) => x.day >= d0).map((x) => ({ day: x.day, kind: x.kind, a: x.a, name: x.name, amt: x.amt, ail: x.ail || 0, tx: x.tx || "", st: payState(x), due: needBurn(x) ? payDue(x) : 0, burn: x.burn ? x.burn.no : 0, need: needCount(x), bn: burnedCount(x), say: x.say && sayUrlOk(x.say.url) ? x.say.url : "" })); } catch (e) { out.pays = []; }
  return out;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  if (u.searchParams.get("proof")) {
    const day = String(u.searchParams.get("proof")).slice(0, 10), pf = await proofOf(kv, day), qa = String(u.searchParams.get("a") || "").toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(qa)) pf.mine = (await kv.get("or:gtx:" + day + ":" + qa, "json")) || null; // 查看者自己的链上存证（时间、预测价、交易）
    return json(pf);
  }
  if (u.searchParams.get("res")) { const r = await kv.get("or:res:" + String(u.searchParams.get("res")).slice(0, 10), "json"); return Response.json(r ? { day: r.day, px: r.px } : { day: null }, { headers: { "cache-control": "public, max-age=60" } }); }
  if (u.searchParams.get("pay")) {
    if (!ctx.env.BACKUP_KEY || u.searchParams.get("key") !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
    ctx.waitUntil(kv.put("kp:at", String(Date.now()), { expirationTtl: 7 * 86400 }).catch(() => {})); // 🤝 合伙人面板用的机器人心跳
    const { pays } = await burnCheck(kv, u.origin, (await kv.get("or:pay", "json")) || [], Date.now()); // 🔥 先烧才发：核对销毁记录、过期作废
    return json({ pay: pays.filter((x) => payState(x) === "ready") });
  }
  const now = Date.now(), fresh = 30e3;
  let out = null, cached = await kv.get("or:pub", "json");
  if (cached && cached.out && now - cached.at < fresh) out = cached.out;
  else if (cached && cached.out) { out = cached.out; ctx.waitUntil(buildPub(kv, ctx, Date.now()).then((o) => kv.put("or:pub", JSON.stringify({ at: Date.now(), out: o }), { expirationTtl: 600 })).catch(() => {})); }
  else { out = await buildPub(kv, ctx, now); ctx.waitUntil(kv.put("or:pub", JSON.stringify({ at: now, out }), { expirationTtl: 600 }).catch(() => {})); }
  out = JSON.parse(JSON.stringify(out)); out.now = now; // 倒计时用当前时间，别用缓存里的
  const round = out.round;
  const a = (u.searchParams.get("a") || "").toLowerCase();
  if (isAddr(a)) {
    try {
      const el = await eligibility(kv, a), name = el.name;
      out.me = { a, name, gno: el.gno, vol: el.vol, ok: el.ok, need: OTC_MIN, cool: el.cool };
      if (round >= DAILY_FROM) { const dm = (await kv.get("or:dcool", "json")) || {}, dc = [dm[el.key] || "", dm[a] || ""].sort().pop(); out.me.dcool = dc >= round ? dc : ""; } /* 每日奖冷却到哪一轮（含）；照样能猜大奖 */
      if (out.kings) { const i = out.kings.all.findIndex((x) => x.a === a); out.me.king = i >= 0 ? { rank: i + 1, fee: out.kings.all[i].fee } : null; }
      try { // 📋 我的预测记录：今晚揭晓那一轮 + 往前 5 轮（客户 2026-11-14：封卷后页面只显示新一轮，下午填的找不到）；这块读不到不影响别的
        const days = []; for (let d0 = out.drawing.day, i = 0; i < 6 && d0 >= FIRST_DAY; i++, d0 = prevDay(d0)) days.push(d0);
        const keys = [...new Set([el.key, a].filter(Boolean))];
        const rows = await Promise.all(days.map(async (d0) => {
          const [gs, r] = await Promise.all([Promise.all(keys.map((k) => kv.get("or:g:" + d0 + ":" + k, "json"))), kv.get("or:res:" + d0, "json")]);
          const g = gs.find((x) => x && x.a === a && x.ps && x.ps.length); /* 只认这个钱包自己填的（名字转过手的不算） */
          return g ? { day: d0, ps: g.ps.map((x) => fmtP(x[0], d0)), px: r && r.px ? fmtP(r.px, d0) : "" } : null;
        }));
        out.me.hist = rows.filter(Boolean);
      } catch (e) { out.me.hist = []; }
      if (el.ok) {
        const q = await quota(kv, a, name, round), mine = await kv.get("or:g:" + round + ":" + el.key, "json");
        out.me = { ...out.me, ...q, used: mine ? mine.ps.length : 0, ps: mine ? mine.ps.map((x) => fmtP(x[0], round)) : [], taken: !!(mine && mine.a !== a) };
        const gtx = await kv.get("or:gtx:" + round + ":" + a, "json"); out.me && (out.me.chain = gtx || null);
        const lk = await kv.get("or:w:" + round + ":" + a); // 一个钱包一轮只认一个名字
        if (lk && lk !== el.key) out.me.lock = lk;
        else if (name) { const h = await heldSince(u.origin, a, name, round); if (!h.ok) out.me.hold = h; }
      }
      { // 🔥 我有没有等着销毁创世名才能领的奖（给预言家页 / 销毁页提示用）；中奖后已停赛，所以放在 el.ok 外面
        const mineAll = ((await kv.get("or:pay", "json")) || []).filter((x) => x.a === a), wait = mineAll.filter((x) => payState(x) === "wait");
        const sayDue = mineAll.filter((x) => needSay(x) && ["wait", "say", "review", "ready"].includes(payState(x))); // 📣 我还没到手的奖：要去 DeBox 宣告的
        if (sayDue.length) out.me.sayDue = sayDue.map((x) => ({ id: x.id, kind: x.kind, day: x.day, amt: x.amt, ail: x.ail || 0, st: payState(x), need: needCount(x), bn: burnedCount(x), url: x.say && sayUrlOk(x.say.url) ? x.say.url : "", ok: !!x.ok }));
        if (wait.length) out.me.burnDue = wait.map((x) => ({ kind: x.kind, day: x.day, amt: x.amt, ail: x.ail || 0, due: payDue(x), need: needCount(x), bn: burnedCount(x), price: NAME_PRICE }));
        out.me.burnDays = BURN_DAYS;
      }
    } catch (e) { out.me = { a, err: "读链失败" }; }
  }
  if (out.kings) delete out.kings.all;
  return json(out);
}

export async function onRequestPost(ctx) {
  let chainSubmit = null; // 客户自己上链的预测（0 元自转账）
  // keeper 写入链上存证：{ action: "anchor", key: BACKUP_KEY, day, tx, hash }（指纹必须和服务器现算的一致）
  const req0 = ctx.request.clone();
  try {
    const b0 = await req0.json();
    if (b0 && b0.action === "anchor") {
      const kv0 = ctx.env.TEAM_KV;
      if (!ctx.env.BACKUP_KEY || b0.key !== ctx.env.BACKUP_KEY) return json({ error: "forbidden" }, 403);
      const day = String(b0.day || "").slice(0, 10), tx = String(b0.tx || "").toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^0x[0-9a-f]{64}$/.test(tx)) return json({ error: "参数不对" }, 400);
      const pf = await proofOf(kv0, day);
      if (pf.hash !== String(b0.hash || "").toLowerCase()) return json({ error: "指纹不一致", server: pf.hash }, 409);
      const rec = { tx, hash: pf.hash, n: pf.n, guesses: pf.guesses, at: Date.now() };
      await kv0.put("or:anchor:" + day, JSON.stringify(rec));
      return json({ ok: true, anchor: rec });
    }
    if (b0 && b0.action === "chain") { // 客户自己花一点 Gas 把预测写上链：核对交易确实是他发的、data 带本站前缀，记下哈希（名单里显示 🔗）
      const kv0 = ctx.env.TEAM_KV, tx = String(b0.tx || "").toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(tx)) return json({ error: "交易哈希不对" }, 400);
      const t = await rpc("eth_getTransactionByHash", [tx]).catch(() => null);
      if (!t || !t.from) return json({ error: "链上还没找到这笔交易，等几秒再试" }, 404);
      const hex = String(t.input || "0x").slice(2), txt = hex ? new TextDecoder().decode(new Uint8Array(hex.match(/../g).map((x) => parseInt(x, 16)))) : "";
      const m = txt.match(/^ailgns-oracle-guess:(\d{4}-\d{2}-\d{2}):([\d.,]+)$/);
      if (!m) return json({ error: "这笔交易不是预测存证" }, 400);
      const a0 = String(t.from).toLowerCase();
      if (await kv0.get("or:gtx:tx:" + tx)) return json({ error: "这笔交易已经提交过了" }, 400);
      await kv0.put("or:gtx:tx:" + tx, "1", { expirationTtl: 400 * 86400 });
      await kv0.put("or:gtx:" + m[1] + ":" + a0, JSON.stringify({ tx, ps: m[2], at: Date.now() }), { expirationTtl: 400 * 86400 });
      // 站长 2026-11-07：上链 = 提交。交易本身就是钱包签名，不再另外要 personal_sign；其它规则（资格、次数、一钱包一名字）一样
      chainSubmit = { a: a0, day: m[1], ps: m[2].split(","), tx };
    }
  } catch (e) { /* 不是 anchor 请求，往下走 */ }
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  if (b.action === "say") { // 📣 中奖人交 DeBox 宣告帖的链接（中奖钱包签名）
    const a = String(b.a || "").toLowerCase(), url = String(b.url || "").trim(), id = String(b.id || "");
    if (!isAddr(a)) return json({ error: "请先连接钱包" }, 400);
    if (!sayUrlOk(url)) return json({ error: "请贴你在 DeBox 发的那条帖子的链接（https:// 开头的 DeBox 网址）" }, 400);
    if (recoverAddress(sayText(id, url, a), String(b.sig || "")) !== a) return json({ error: "签名核对失败，请用中奖的那个钱包重新签名" }, 400);
    const pay = (await kv.get("or:pay", "json")) || [], x = pay.find((p) => String(p.id) === id && p.a === a);
    if (!x) return json({ error: "没找到这笔奖，请刷新页面再试" }, 404);
    const st = payState(x);
    if (!needSay(x) || st === "paid" || st === "forfeit") return json({ error: "这笔奖不用再交了" }, 400);
    if (x.ok) return json({ error: "这笔奖已经认证通过，等机器人发奖就行" }, 400);
    x.say = { url, at: Date.now() };
    await kv.put("or:pay", JSON.stringify(pay));
    ctx.waitUntil(pushInbox(kv, OWNER, "oracle", "🏆 中奖人交了 DeBox 宣告帖，等你认证\n" + x.name + " · " + x.day + " · " + (KIND_CN[x.kind] || x.kind) + " · " + x.amt + " DAI\n" + url + "\n到工单后台最上面点「通过」，机器人才会发奖。", "#/feedback/admin").catch(() => {}));
    return json({ ok: true, st: payState(x) });
  }
  if (b.action === "says") { // 📣 工单后台：还没发的奖（等烧名字 / 等宣告 / 等认证 / 已通过等机器人发）。口令走请求正文，不进网址
    if (!admOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
    const { pays } = await burnCheck(kv, new URL(ctx.request.url).origin, (await kv.get("or:pay", "json")) || [], Date.now());
    return json({ list: pays.filter((x) => !x.tx && !x.forfeit && needSay(x)).map((x) => ({ id: x.id, day: x.day, kind: x.kind, name: x.name, a: x.a, amt: x.amt, ail: x.ail || 0, st: payState(x), need: needCount(x), bn: burnedCount(x), due: needBurn(x) ? payDue(x) : 0, say: x.say && sayUrlOk(x.say.url) ? x.say.url : "", sayAt: (x.say && x.say.at) || 0, ok: x.ok ? x.ok.at : 0 })) });
  }
  if (b.action === "approve") { // 📣 团队认证：通过 / 撤回（工单口令）
    if (!admOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
    const pay = (await kv.get("or:pay", "json")) || [], x = pay.find((p) => String(p.id) === String(b.id || ""));
    if (!x) return json({ error: "没有这一笔" }, 404);
    if (x.tx) return json({ error: "这笔已经发出去了" }, 400);
    if (b.ok === false) delete x.ok; else x.ok = { at: Date.now() };
    await kv.put("or:pay", JSON.stringify(pay));
    if (x.ok) ctx.waitUntil(pushInbox(kv, x.a, "oracle", "✅ 你的中奖宣告已通过认证（" + x.day + " · " + (KIND_CN[x.kind] || x.kind) + "）。" + (payState(x) === "ready" ? "机器人几分钟内把 AiLGNS 发到这个钱包。" : "名字烧够以后，机器人自动把 AiLGNS 发到这个钱包。"), "#/oracle").catch(() => {}));
    return json({ ok: true, st: payState(x) });
  }
  if (b.action === "paid") {
    if (!ctx.env.BACKUP_KEY || b.key !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
    const pay = (await kv.get("or:pay", "json")) || [], x = pay.find((p) => p.id === b.id);
    if (!x) return json({ error: "没有这一笔" }, 404);
    x.tx = String(b.tx || ""); x.paidAt = Date.now(); if (b.ail) x.paidAil = Number(b.ail);
    await kv.put("or:pay", JSON.stringify(pay));
    return json({ ok: true });
  }
  const a = chainSubmit ? chainSubmit.a : String(b.a || "").toLowerCase(), day = chainSubmit ? chainSubmit.day : String(b.day || ""), sig = String(b.sig || "");
  if (!isAddr(a)) return json({ error: "请先连接钱包" }, 400);
  const round = openRound();
  if (day !== round) return json({ error: "这一轮已经开始揭晓了，请刷新页面，预测下一轮" }, 400);
  const raw = chainSubmit ? chainSubmit.ps : Array.isArray(b.ps) ? b.ps.map((x) => String(x).trim()) : [];
  const dec = decOf(round), sc = scOf(round), pOk = new RegExp("^\\d{1,7}(\\.\\d{1," + dec + "})?$"); /* 这一轮猜几位小数 */
  if (!raw.length || raw.some((x) => !pOk.test(x))) return json({ error: "价格格式不对，例如 " + (dec === 4 ? "827.3546" : "827.354") + "（最多 " + dec + " 位小数）" }, 400);
  const ps = raw.map((x) => Number(x).toFixed(dec));
  if (new Set(ps).size !== ps.length) return json({ error: "这次提交里有重复的价格" }, 400);
  if (!chainSubmit && recoverAddress(guessText(day, raw, a), sig) !== a) return json({ error: "签名核对失败，请用当前钱包重新签名" }, 400);
  if (a === "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6" || a === "0x89dd06754bb239b6c4c92bc47c8fa72889084e27") return json({ error: "站长钱包不参加" }, 400);
  let el;
  try { el = await eligibility(kv, a); } catch (e) { return json({ error: "读链失败，请稍后再试" }, 502); }
  if (el.cool) return json({ error: "恭喜你中过奖！" + (el.name || "这个钱包") + "（或这个钱包）已经领过奖，不能再参加。想继续玩：用一个新钱包，买新的 🌟 创世 .ailgns 域名设为主名字" }, 400);
  if (!el.ok) return json({ error: "还没有参加资格：主名字是创世 .ailgns 域名，或者 OTC 累计成交满 " + OTC_MIN.toLocaleString("en-US") + " DAI，满足其一就能参加" }, 400);
  const name = el.name || a.slice(0, 6) + "…" + a.slice(-4); // 没有域名、靠 OTC 成交参加的，用短地址显示
  const key = "or:g:" + round + ":" + el.key, mine = (await kv.get(key, "json")) || { a, name, ps: [] };
  if (mine.a !== a) return json({ error: name + " 这一轮已经由别的钱包预测过了，一个名字每轮只能用一次" }, 400);
  // 防刷 ①：一个钱包一轮只认一个名字（换主名字不给新额度）
  const lk = await kv.get("or:w:" + round + ":" + a);
  if (lk && lk !== el.key) return json({ error: "这个钱包本轮已经用 " + lk + " 预测过了。一个钱包每轮只认一个名字，换主名字不会多出次数" }, 400);
  // 防刷 ②：名字要在本轮开放前就在这个钱包里（刚注册的不受限；转进来 / 买来的要等下一轮）
  if (el.name) {
    let h; try { h = await heldSince(new URL(ctx.request.url).origin, a, el.name, round); } catch (e) { h = { ok: true }; }
    if (!h.ok) return json({ error: el.name + " 是本轮开放后才转进这个钱包的，要等下一轮才能用它预测（刚注册的名字不受此限）" }, 400);
  }
  const q = await quota(kv, a, el.name, round), have = new Set(mine.ps.map((x) => fmtP(x[0], round)));
  const fresh = ps.filter((p) => !have.has(p));
  if (!fresh.length) return json({ error: "这些价格你已经预测过了" }, 400);
  if (mine.ps.length + fresh.length > q.n) return json({ error: "次数不够：你这一轮共 " + q.n + " 次，已用 " + mine.ps.length + " 次" }, 400);
  const t = Date.now();
  fresh.forEach((p) => mine.ps.push([Math.round(Number(p) * sc), t]));
  mine.tier = q.tier; if (chainSubmit) mine.tx = chainSubmit.tx;
  await kv.put(key, JSON.stringify(mine), { expirationTtl: 400 * 86400 });
  if (!lk) await kv.put("or:w:" + round + ":" + a, el.key, { expirationTtl: 3 * 86400 });
  return json({ ok: true, round, name, ps: mine.ps.map((x) => fmtP(x[0], round)), left: q.n - mine.ps.length });
}

