// 🤝 合伙人面板（#/partner，独立口令）：只回答三个问题——今天生意怎么样、现在有多少钱可以分、客户有没有在骂
// 不放历史累计、不放流水、不放分账地址。ops-watch 每 5 分钟算一次存 ptn:res，接口只读缓存。
// 风险 + 建议引擎：按当前运营数据自动给红 / 黄 / 绿灯和「该做什么」，顺序就是优先级。
import { bjDay } from "./stats.js";
import { RPCS } from "./teamlib.js";
import { priceMilli, poolEscrow } from "./oracle.js";
import { ADDRESSES, TOKENS } from "./addresses.js";

const SRC = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 谷歌社交账号钱包（待分配）
const POOL = "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4"; // 预言家奖池（负债）
const REGBOT = "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1"; // 🤖 代注册机器人钱包（只放 Gas）
const FAST = "0x8610bf581b1c10cb7d372f93b8cdcde382a7c1d1"; // ⚡ 极速资金池（批量注册收入的 90%，和每日奖池分开，也是负债）
const KEEPER = "0x89dd06754bb239b6c4c92bc47c8fa72889084e27"; // 触发钱包（付 Gas）
const BB = "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3"; // 域名费中转，机器人每轮退回谷歌社交账号钱包
const MATCHER = "0xdcc5354175d60ffc8364e71e792fcd66366f00fe"; // 撮合合约：退回的是本金，不算到账
const OTC_AIL = "0x4e730be6d46be71223ded5a32dc45799f6d4bc15";
const DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", LGNS = "0x4d1d808a081fdac440703b3765fc61f8028c06b8";
const PRPC = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org", "https://1rpc.io/matic"], PDAI = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", PLGNS = "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01";
const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a) => a.slice(2).padStart(64, "0");
const r2 = (x) => Math.round(x * 100) / 100;
const GAS_MIN = 8;

async function batch(url, calls) {
  try {
    // Polygon publicnode 对没有 User-Agent 的请求回 403（2026-11-09 排查「地址表 4 条读不到」）
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (ailgns-partner)" }, body: JSON.stringify(calls) }).then((r) => r.json());
    const by = {}; (Array.isArray(res) ? res : []).forEach((x) => { by[x.id] = x.result; });
    return by;
  } catch (e) { return {}; }
}
const num = (hex, dec) => { try { return Number(BigInt(hex || "0x0")) / 10 ** dec; } catch (e) { return 0; } };

// 📍 所有登记地址（lib/addresses.js）的余额：Gas + 每种代币，一条链一两批 RPC；value = DAI + AiLGNS×现价（LGNS 不折算）
async function allBalances(price) {
  const out = ADDRESSES.map((d) => ({ n: d.n, a: d.a, k: d.k, c: d.c, e: d.e, min: d.min || 0, note: d.note || "", gas: null, tok: {}, value: 0, ok: false, st: "" }));
  for (const chain of Object.keys(TOKENS)) {
    const idx = out.map((d, i) => (d.c === chain ? i : -1)).filter((i) => i >= 0), toks = TOKENS[chain];
    const calls = [], tag = [];
    idx.forEach((i) => {
      const a = out[i].a;
      tag.push([i, "gas", 18]); calls.push({ jsonrpc: "2.0", id: calls.length, method: "eth_getBalance", params: [a, "latest"] });
      toks.forEach(([sym, t, dec]) => { tag.push([i, sym, dec]); calls.push({ jsonrpc: "2.0", id: calls.length, method: "eth_call", params: [{ to: t, data: "0x70a08231" + pad(a) }, "latest"] }); });
    });
    const urls = chain === "polygon" ? PRPC : RPCS, by = {}, step = chain === "polygon" ? 8 : 60; // drpc 一批最多 10 个
    for (let s0 = 0; s0 < calls.length; s0 += step) {
      const part = calls.slice(s0, s0 + step);
      // Polygon 公共节点对 Cloudflare 出口限流，一批里常有几条回 error：只补读缺的那几条，三个节点轮两遍（2026-11-09 排查「2 条读不到」）
      let pending = part;
      for (let pass = 0; pass < 2 && pending.length; pass++) {
        for (const u of urls) {
          const got = await batch(u, pending);
          for (const k in got) if (got[k] != null) by[k] = got[k];
          pending = pending.filter((c) => by[c.id] == null);
          if (!pending.length) break;
        }
      }
    }
    tag.forEach(([i, sym, dec], k) => { const h = by[k]; if (h == null) return; const v = num(h, dec); out[i].ok = true; if (sym === "gas") out[i].gas = Math.round(v * 1e4) / 1e4; else if (v) out[i].tok[sym] = sym === "AiLGNS" ? Math.round(v * 1e4) / 1e4 : r2(v); });
  }
  out.forEach((d) => {
    d.value = r2((d.tok.DAI || 0) + (d.tok.AiLGNS || 0) * price);
    if (!d.ok) d.st = "❌ 读不到余额";
    else if (d.e === "gas" && d.gas < d.min) d.st = "⚠️ Gas 只剩 " + d.gas + "，低于 " + d.min;
    else if (d.e === "zero" && d.value >= 50) d.st = "⚠️ 压着约 " + Math.round(d.value) + " DAI 没出来";
    else d.st = "✅";
  });
  return out;
}
async function balances() {
  const c = [], q = (to, who) => ({ jsonrpc: "2.0", id: c.length, method: "eth_call", params: [{ to, data: "0x70a08231" + pad(who) }, "latest"] });
  c.push({ jsonrpc: "2.0", id: 0, method: "eth_getBalance", params: [SRC, "latest"] });
  c.push(q(DAI, SRC)); c.push(q(AIL, SRC)); c.push(q(LGNS, SRC));
  c.push(q(DAI, POOL)); c.push(q(AIL, POOL));
  c.push({ jsonrpc: "2.0", id: c.length, method: "eth_getBalance", params: [KEEPER, "latest"] }); c.push(q(DAI, KEEPER));
  c.push(q(DAI, BB));
  c.push({ jsonrpc: "2.0", id: c.length, method: "eth_blockNumber", params: [] });
  c.push({ jsonrpc: "2.0", id: c.length, method: "eth_call", params: [{ to: DAI, data: "0xdd62ed3e" + pad(SRC) + pad(KEEPER) }, "latest"] }); // 谷歌社交账号钱包给触发钱包的周转额度（转 70% 进奖池用）
  c.push({ jsonrpc: "2.0", id: c.length, method: "eth_call", params: [{ to: AIL, data: "0xdd62ed3e" + pad(SRC) + pad(KEEPER) }, "latest"] });
  c.push(q(DAI, FAST)); c.push(q(AIL, FAST));
  c.push({ jsonrpc: "2.0", id: c.length, method: "eth_getBalance", params: [REGBOT, "latest"] });
  const a = await batch(RPCS[0], c);
  const p = [];
  p.push({ jsonrpc: "2.0", id: 0, method: "eth_getBalance", params: [SRC, "latest"] });
  p.push({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: PDAI, data: "0x70a08231" + pad(SRC) }, "latest"] });
  p.push({ jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: PLGNS, data: "0x70a08231" + pad(SRC) }, "latest"] });
  let b = await batch(PRPC[0], p); if (!b[1]) b = await batch(PRPC[1], p);
  return {
    src: { gas: r2(num(a[0], 18)), dai: r2(num(a[1], 18)), ail: r2(num(a[2], 18) * 1e4) / 1e4, lgns: r2(num(a[3], 9)), pol: r2(num(b[0], 18)), pdai: r2(num(b[1], 18)), plgns: r2(num(b[2], 9)), polyOk: !!b[1] },
    pool: { dai: r2(num(a[4], 18)), ail: r2(num(a[5], 18) * 1e4) / 1e4 },
    keeper: { gas: r2(num(a[6], 18)), dai: r2(num(a[7], 18)) },
    bb: { dai: r2(num(a[8], 18)) },
    block: parseInt(a[9] || "0x0", 16),
    allow: { dai: r2(num(a[10], 18)), ail: r2(num(a[11], 18) * 1e4) / 1e4 },
    fast: { dai: r2(num(a[12], 18)), ail: r2(num(a[13], 18) * 1e4) / 1e4 },
    regbot: { gas: r2(num(a[14], 18) * 1e4) / 1e4 },
  };
}

// 实际到账：每 5 分钟扫新区块里转进谷歌社交账号钱包的 DAI / AiLGNS（撮合合约退回的本金不算），记到当天
async function scanIn(kv, latest) {
  if (!latest) return;
  const st = (await kv.get("ptn:scan", "json")) || { b: latest - 600 };
  const from = st.b + 1, to = Math.min(latest, from + 4900);
  if (to < from) return;
  const me = "0x" + pad(SRC);
  const calls = [DAI, AIL].map((tok, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getLogs", params: [{ fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), address: tok, topics: [T, null, me] }] }));
  const by = await batch(RPCS[0], calls);
  if (!Array.isArray(by[0]) || !Array.isArray(by[1])) return; // RPC 没回，下次再扫这段
  const day = bjDay(), key = "ptn:in:" + day, cur = (await kv.get(key, "json")) || { dai: 0, ail: 0, n: 0 };
  const skip = { [MATCHER]: 1, [SRC]: 1 };
  by[0].forEach((l) => { const f = "0x" + l.topics[1].slice(26); if (skip[f]) return; cur.dai += num(l.data, 18); cur.n++; });
  by[1].forEach((l) => { const f = "0x" + l.topics[1].slice(26); if (skip[f]) return; cur.ail += num(l.data, 18); cur.n++; });
  cur.dai = r2(cur.dai); cur.ail = Math.round(cur.ail * 1e4) / 1e4;
  await kv.put(key, JSON.stringify(cur), { expirationTtl: 40 * 86400 });
  await kv.put("ptn:scan", JSON.stringify({ b: to, at: Date.now() }));
}

async function tickets(kv) {
  const ids = ((await kv.get("tk:list", "json")) || []).slice(-150); // 三天的量（今天 / 昨天 / 前天对比要用）
  const ts = (await Promise.all(ids.map((id) => kv.get("tk:" + id, "json")))).filter(Boolean);
  const now = Date.now(), day0 = new Date(bjDay() + "T00:00:00+08:00").getTime();
  const open = ts.filter((t) => t.st !== "done" && t.st !== "skip" && !t.note);
  const oldest = open.reduce((m, t) => Math.max(m, now - t.t), 0);
  const replied = ts.filter((t) => t.up && t.t);
  const avg = replied.length ? replied.reduce((s, t) => s + (t.up - t.t), 0) / replied.length : 0;
  return { today: ts.filter((t) => t.t >= day0).length, yest: ts.filter((t) => t.t >= day0 - 86400e3 && t.t < day0).length, yest2: ts.filter((t) => t.t >= day0 - 2 * 86400e3 && t.t < day0 - 86400e3).length, open: open.length, oldestH: Math.round(oldest / 36e5 * 10) / 10, avgH: Math.round(avg / 36e5 * 10) / 10,
    latest: ts.slice(-5).reverse().map((t) => ({ t: t.t, st: t.st, txt: String(t.txt || "").slice(0, 60), done: !!t.note })) };
}

// 风险 + 建议：level red / yellow / green，按严重程度排好，就是处理优先级
function advise(x) {
  const out = [], add = (level, who, title, why, todo) => out.push({ level, who, title, why, todo });
  const d0 = x.rows[0] || {}, d1 = x.rows[1] || {}, w7 = x.rows.slice(1, 8);
  const avg = (k) => (w7.length ? w7.reduce((s, r) => s + (r[k] || 0), 0) / w7.length : 0);
  const hour = (Date.now() + 8 * 3600e3) / 36e5 % 24;
  // 🌡️ 流量 vs 容量
  if (x.traffic && x.CAP) {
    const t = x.traffic, c = x.CAP;
    if (t.now >= c.conc) add("red", "站长", "同时在线 " + t.now + "，到容量线了", "这 5 分钟打开了 " + t.now + " 次，当前架构（公共节点直连）大约 " + c.conc + " 人同时在线就会开始「读取中…」", "马上做扩容第一档：读链全部走边缘缓存接口、Workers 升付费；今晚先把客服机器人限流");
    else if (t.now >= c.conc * 0.5 || t.peak >= c.conc * 0.7) add("yellow", "站长", "流量接近容量线（现在 " + t.now + "，今天峰值 " + t.peak + "，容量约 " + c.conc + "）", "再涨一倍就会卡。扩容第一档要一两天，别等到红灯", "安排扩容第一档（读链走接口缓存 + Workers 付费 + 接口限流）");
    if (t.today >= c.daily * 0.6) add(t.today >= c.daily ? "red" : "yellow", "站长", "今天访问 " + t.today + " 次，接近每日额度", "Workers 免费额度每天 10 万次请求，一次访问要好几次请求，" + c.daily + " 次访问左右就到顶，到顶全站接口 503", "Cloudflare → Workers & Pages → Plans 升到 Paid（每月 5 美金起按量）");
  }
  // 🔴 钱和机器
  if (x.bal.keeper.dai < GAS_MIN) add("red", "站长", "触发钱包快没 Gas", "触发钱包只剩 " + x.bal.keeper.dai + " DAI，低于 " + GAS_MIN + " 时退款、发奖、撮合全部停", "给 0x89dd…4e27 转 30 DAI（Anubis 链）");
  if (x.keeperAgeMin == null) add("yellow", "站长", "机器人心跳未知", "还没收到发奖程序的心跳记录（刚上线的新功能，等 10 分钟）", "10 分钟后再看；还是没有就查 GitHub Actions");
  else if (x.keeperAgeMin > 30) add("red", "站长", "机器人停了", "发奖程序已 " + x.keeperAgeMin + " 分钟没运行（正常每 5 分钟一次）", "打开 GitHub → monita → Actions 看最近一次运行为什么失败");
  if (x.bal.bb.dai >= 50) add("yellow", "自动", "域名费还没退回谷歌社交账号钱包", "中转地址里压着 " + x.bal.bb.dai + " DAI，正常每轮自动退", "等下一轮（5 分钟）；超过 1 小时没动就是机器人出问题");
  if (x.bal.regbot && x.bal.regbot.gas < 0.05) add(x.bal.regbot.gas < 0.01 ? "red" : "yellow", "站长", "代注册机器人钱包 Gas 快没了（剩 " + x.bal.regbot.gas + "）", "客户点「交给机器人代点」后，是这个钱包替他们发注册交易；没 Gas 委托就一直挂着", "给 0x2142…f2d1 转 0.5 个 Anubis Gas 币即可，一年够用");
  if (x.bal.allow && x.bal.allow.dai < 1000) add(x.bal.allow.dai < 200 ? "red" : "yellow", "站长", "奖池周转额度快用完（剩 " + x.bal.allow.dai + " DAI）", "机器人靠这笔额度把域名 70% 转进奖池、做撮合周转，用完就转不动，会一直欠着", "用谷歌社交账号钱包打开 #/otc/split → 「奖池周转授权」→ 点「设为 100,000 DAI」，一次管几年");
  (x.addrs || []).forEach((d) => {
    if (d.st === "✅" || ["0x89dd06754bb239b6c4c92bc47c8fa72889084e27", "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1", "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3"].indexOf(d.a) >= 0) return;
    if (!d.ok) add("yellow", "自动", "地址余额读不到：" + d.n, d.c + " 链 RPC 没返回 " + d.a.slice(0, 6) + "… 的余额", "等下一轮；一直读不到说明这条链的公共节点有问题");
    else if (d.e === "gas") add("red", "站长", d.n + " Gas 快没了", d.st.replace("⚠️ ", ""), "往 " + d.a.slice(0, 6) + "… 转一点 Gas 币");
    else if (d.e === "zero") add(d.value >= 500 ? "red" : "yellow", "站长", d.n + "里压着钱", "这个地址正常应该 ≈ 0，现在约 " + Math.round(d.value) + " DAI（DAI " + (d.tok.DAI || 0) + " + AiLGNS " + (d.tok.AiLGNS || 0) + "）", "看「所有部署地址」表 → 点地址进账本查最近几笔；是机器人没退就看 keeper 日志");
  });
  if (x.bal.src.gas < 1) add("yellow", "站长", "谷歌社交账号钱包 Gas 不足", "谷歌社交账号钱包 Anubis Gas 只剩 " + x.bal.src.gas + "，撤销授权、转账都要 Gas", "往 0xedb9 转 2 DAI 当 Gas");
  // 🟠 客户
  if (x.tk.open > 0 && x.tk.oldestH >= 2) add("red", "客服", x.tk.open + " 张工单没人回", "最久的已经等了 " + x.tk.oldestH + " 小时，客户等得越久越容易去群里骂", "打开工单后台，先回最久的那张");
  else if (x.tk.open > 0) add("yellow", "客服", x.tk.open + " 张新工单待回复", "都在 2 小时内，还来得及", "今天内回完");
  if (x.tk.today >= 5) add("yellow", "站长", "今天工单偏多（" + x.tk.today + " 张）", "一天超过 5 张通常是同一个问题反复出现", "看工单后台的分诊主题，同一主题的做成公告或改页面");
  // 🟡 生意
  if (d1.fillDai && avg("fillDai") && d1.fillDai < avg("fillDai") * 0.6) add("yellow", "合伙人", "昨天成交额掉了", "昨天 " + Math.round(d1.fillDai) + " DAI，只有前 7 天平均（" + Math.round(avg("fillDai")) + "）的 " + Math.round(d1.fillDai / avg("fillDai") * 100) + "%", "看盘口价差和挂单量：挂单少就是流动性问题，该推进做市商；挂单多价差大就是买卖双方价格没谈拢，不用管");
  if (hour >= 14 && d0.fillDai != null && avg("fillDai") && d0.fillDai < avg("fillDai") * 0.3) add("yellow", "合伙人", "今天成交冷清", "到下午 2 点只成交 " + Math.round(d0.fillDai) + " DAI，前 7 天全天平均 " + Math.round(avg("fillDai")), "先别推广，看看是不是价差太大没人成交");
  if (x.spread != null && x.spread > 3) add("yellow", "合伙人", "盘口价差太大（" + x.spread + "%）", "买一卖一差 " + x.spread + "%，客户一看就不想下单", "这就是做市商要解决的事：在买一卖一中间挂单，价差压到 1% 以内");
  if (hour >= 12 && !d0.nmN) add("green", "观察", "今天域名还没开张", "域名是奖池的来源，一天 0 个说明预言家吸引力在下降", "看预言家参与人数；掉了就该想新玩法，不是去推广");
  if (d1.v && avg("v") && d1.v < avg("v") * 0.6) add("yellow", "合伙人", "昨天访客少了", "昨天 " + d1.v + " 次访问，前 7 天平均 " + Math.round(avg("v")), "先确认网址能不能打开（备用网址都试一遍），再看是不是没新内容");
  // 🟢 钱
  if (x.split.total >= 500) add("yellow", "站长", "今天的钱还没转走（谷歌社交账号钱包约 " + Math.round(x.split.total) + " DAI）", "站长 2026-11-07 定的规矩：每天把谷歌社交账号钱包的 DAI / AiLGNS / LGNS 全部转到冷钱包，只留 2–3 DAI 付 Gas，被黑最多丢当天的", "用谷歌钱包把余额转到冷钱包；不影响退款、奖池和撮合");
  if (x.split.total >= 1000) add("green", "合伙人", "待分配余额已到 " + Math.round(x.split.total) + " DAI", "中转地址按比例拆：" + x.split.parts.map((y) => y.n + " " + y.p + "% " + y.ail + " AiLGNS").join("、"), "商量好就分，分之前先把奖池负债核一遍");
  if (x.pool.value < 500) add("yellow", "合伙人", "奖池偏小（约 " + Math.round(x.pool.value) + " DAI）", "奖池小了预言家就没人玩，域名也跟着卖不动", "域名收入的 70% 在自动补；想快可以从待分配里拨一笔");
  if (!out.length) add("green", "全站", "一切正常", "机器人在跑、工单回完了、生意和前 7 天持平", "什么都不用做");
  const rank = { red: 0, yellow: 1, green: 2 };
  out.sort((a, b) => rank[a.level] - rank[b.level]);
  return out;
}

// 红 / 黄灯自动开成系统工单（站长 2026-11-07：风险提醒要进工单后台，股东也看得到）。同一条 24 小时内只开一次；关于工单本身的、几分钟就会自己消失的不开
async function ticketRisks(kv, risks) {
  const skip = /工单|心跳未知|域名费还没退回/;
  for (const r of risks) {
    if (r.level === "green" || skip.test(r.title)) continue;
    const key = "ptn:tk:" + r.title.replace(/[\d,.，]+/g, "#").slice(0, 60);
    if (await kv.get(key)) continue;
    await kv.put(key, "1", { expirationTtl: r.level === "red" ? 6 * 3600 : 24 * 3600 });
    const id = Number((await kv.get("tk:seq")) || "0") + 1;
    await kv.put("tk:seq", String(id));
    const txt = (r.level === "red" ? "🔴 " : "🟡 ") + r.title + "\n\n" + r.why + "\n\n👉 " + r.todo + "\n\n（合伙人面板自动提醒 · 负责人：" + r.who + "）";
    const t = { id, a: "system", txt, n: 0, t: Date.now(), st: "new", note: "", tri: { ok: true, lv: r.level === "red" ? 0 : 1, cat: "运营", topic: r.title.slice(0, 20), why: "面板自动", dup: 0, ai: false } };
    await kv.put("tk:" + id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    await kv.put("tk:list", JSON.stringify(((await kv.get("tk:list", "json")) || []).concat(id).slice(-1000)));
  }
}

// 💼 运营分配（站长 2026-11-08 定）：谷歌社交账号钱包的钱按这个比例分到四个地址
export const ALLOC = [
  { n: "运营费用", p: 55, a: "0xd53a00bb90bb606f10d888419a14eca779f17285" },
  { n: "管理费用", p: 5, a: "0x57b515c5cc7fe248b5ab32b6ef461a914020723f" },
  { n: "管理费用", p: 10, a: "0xe8782615e32557f257dd88d70b1eb0d7f47b91c3" },
  { n: "技术费用", p: 30, a: "0xae5a079ad9b76703d5e3950f3375b4d5fdd5f2ab" },
];
// 运营分配统计：出款钱包实际转到每个地址的 DAI / AiLGNS（Anubis 链，区块浏览器读）；最近 10 笔转账记录带交易哈希
// 站长 2026-11-09 定：只分 AiLGNS；流程 = 谷歌社交账号钱包 → 运营中转地址 0x7018 → 按比例转到四个地址。统计只认从中转地址转出的 AiLGNS
export const TRANSIT = "0x701876eb1b6cea82774f7041e092f7740624af81";
async function transitBal() { const j = await fetch("https://browser.anubispace.org/api?module=account&action=tokenbalance&contractaddress=" + AIL + "&address=" + TRANSIT).then((r) => r.json()); return Math.round(Number(j.result || 0) / 1e14) / 1e4; }
async function allocStats(price) {
  return Promise.all(ALLOC.map(async (x) => {
    const o = { ail: 0, n: 0, last: 0, txs: [] };
    try {
      const j = await fetch("https://browser.anubispace.org/api?module=account&action=tokentx&address=" + x.a + "&page=1&offset=1000&sort=desc").then((r) => r.json());
      for (const t of j.result || []) {
        if (String(t.from).toLowerCase() !== TRANSIT || String(t.to).toLowerCase() !== x.a || String(t.contractAddress).toLowerCase() !== AIL) continue;
        const v = Number(t.value) / 1e18;
        o.ail += v; o.n++; o.last = Math.max(o.last, Number(t.timeStamp) * 1000);
        if (o.txs.length < 10) o.txs.push({ t: Number(t.timeStamp) * 1000, v: Math.round(v * 1e4) / 1e4, h: t.hash });
      }
    } catch (e) { o.err = 1; }
    o.ail = Math.round(o.ail * 1e4) / 1e4; o.value = r2(o.ail * price);
    return o;
  }));
}
export async function build(env, kv, ctx) {
  const adm = (await kv.get("adm:res", "json")) || { rows: [] };
  const cfg = Object.assign({ tech: 30, sales: 70 }, (await kv.get("ptn:cfg", "json")) || {});
  const [bal, px, esc] = await Promise.all([balances(), priceMilli().catch(() => ({ raw: 0 })), poolEscrow()]);
  bal.pool.dai = r2(bal.pool.dai + esc); bal.pool.escrow = esc; // 奖池挂在 OTC 买单里的 DAI 也算奖池的
  await scanIn(kv, bal.block).catch(() => {});
  const today = bjDay(), rows = (adm.rows || []).filter((r) => !r.pending).slice(0, 8);
  const ins = await Promise.all(rows.map((r) => kv.get("ptn:in:" + r.day, "json")));
  rows.forEach((r, i) => { r.in = ins[i] || null; });
  // 🌡️ 流量：今天的 5 分钟桶（m<slot>）→ 当前 5 分钟访问数、今天峰值；「同时在线」≈ 5 分钟内打开网站的次数
  let traffic = { now: 0, peak: 0, peakAt: "", today: 0, uv: 0 };
  try {
    const { counts } = await import("./stats.js");
    const c = await counts(kv, today), slot = Math.floor((Date.now() + 8 * 3600e3) % 86400e3 / 300e3);
    let peak = 0, peakAt = 0;
    for (const k of Object.keys(c)) if (k[0] === "m" && /^\d+$/.test(k.slice(1))) { const v = c[k]; if (v > peak) { peak = v; peakAt = Number(k.slice(1)); } }
    const hm = (sl) => String(Math.floor(sl * 5 / 60)).padStart(2, "0") + ":" + String((sl * 5) % 60).padStart(2, "0");
    traffic = { now: c["m" + slot] || 0, prev: c["m" + (slot - 1)] || 0, peak, peakAt: hm(peakAt), today: c.pv || 0, uv: c.uv || 0 };
    // 昨日对比（站长 2026-11-09）：昨天的峰值从日报行拿（adminstats 算行时顺手记的 pk/pkAt），不再单独读一遍计数
    // 11-07 之前没有 5 分钟桶，pk=0 就不显示
    if (rows[1] && rows[1].pk) { traffic.peakY = rows[1].pk; traffic.peakYAt = rows[1].pkAt; }
    if (rows[2] && rows[2].pk) { traffic.peakY2 = rows[2].pk; traffic.peakY2At = rows[2].pkAt; }
  } catch (e) {}
  // 容量线（当前架构：公共 RPC 直连 + Workers 免费额度）：5 分钟内 300 次打开约等于 300 人同时在线，公共节点会开始限流；每天 5 万次请求接近 Workers 免费额度
  const CAP = { conc: 15000, daily: 2500000 }; // 扩容第一档（2026-11-08 站长：按 50 倍扩）：Workers 付费 + 读链全走缓存接口 后的估算容量；没升级付费前实际约 300 / 5 万
  const kp = await kv.get("kp:at", "json");
  const keeperAgeMin = kp ? Math.round((Date.now() - kp) / 60e3) : null;
  const tk = await tickets(kv).catch(() => ({ today: 0, open: 0, oldestH: 0, avgH: 0, latest: [] }));
  const price = px.raw || 0;
  const srcValue = r2(bal.src.dai + bal.src.pdai + bal.src.ail * price);
  const split = { total: srcValue, tech: r2(srcValue * cfg.tech / 100), sales: r2(srcValue * cfg.sales / 100) };
  const tb = await transitBal().catch(() => null); // 中转地址里待分配的 AiLGNS
  split.transit = { a: TRANSIT, ail: tb, value: tb == null ? null : r2(tb * price) };
  // 应分：中转地址里有 AiLGNS 就按中转余额拆；转空了就按谷歌社交账号钱包的待分配余额（折成 AiLGNS）拆，提前看每人能分多少
  const base = tb > 0 ? tb : (price ? srcValue / price : 0);
  split.basis = tb > 0 ? "transit" : "src";
  split.parts = ALLOC.map((y) => { const ail = Math.floor(base * y.p / 100 * 1e4) / 1e4; return Object.assign({}, y, { ail, amt: r2(ail * price) }); });
  const got = await allocStats(price).catch(() => ALLOC.map(() => ({ err: 1 })));
  const alloc = ALLOC.map((y, i) => Object.assign({}, y, { got: got[i] }));
  const pool = { dai: bal.pool.dai, ail: bal.pool.ail, value: r2(bal.pool.dai + bal.pool.ail * price) };
  let spread = null;
  try { const bk = await kv.get("otc:book:ailgns", "json"); if (bk && bk.ask && bk.bid) spread = r2((bk.ask - bk.bid) / bk.bid * 100); } catch (e) {}
  const addrs = await allBalances(price).catch(() => []);
  const x = { rows, bal, keeperAgeMin, tk, split, cfg, pool, spread, traffic, CAP, addrs };
  const risks = advise(x);
  try { await ticketRisks(kv, risks); } catch (e) {}
  const out = { at: Date.now(), today, price, cfg, split, alloc, bal, pool, keeperAgeMin, tk, rows, risks, traffic, cap: CAP, addrs, installs: (adm.totals && adm.totals.installs) || 0,
    plan: (await kv.get("ptn:plan", "json")) || [],
    note: "待分配 = 谷歌社交账号钱包两条链 DAI + AiLGNS 按现价折算（LGNS 不折算，另列）；实际到账 = 链上真实转进谷歌社交账号钱包的 DAI/AiLGNS（撮合本金不算），从 2026-11-07 起记；收入只看实际到账（站长 2026-11-09 定）。" };
  await kv.put("ptn:res", JSON.stringify(out), { expirationTtl: 7 * 86400 });
  return out;
}
