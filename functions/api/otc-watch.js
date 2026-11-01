// OTC 挂单动态通知：定时任务每 5 分钟调用一次，读各市场托管合约新的成交 / 撤单 / 到期退回事件。
// 市场：AiLGNS（Anubis）、LGNS（Anubis）、LGNS（Polygon），合约代码相同，各链各一份
// ① 私信：按钱包地址找到在 DeBox 机器人里绑定过的用户，通知挂单人（成交时也通知吃单人）
// ② 群播报：有成交时发到 DeBox 群（庆祝成交 + 成交送会员 + 网址）
// ③ 订阅号推送：低于市价买 / 高于市价卖的挂单推送给关注机器人的人（每张单只推一次）
//    群 gid 默认是下面 GROUPS 里的两个群，也可以用 Cloudflare 环境变量 DEBOX_GROUP_ID（多个用逗号隔开）覆盖
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox, sendDeboxFans } from "../../lib/debox.js";
import { rebuildIfNeeded } from "../../lib/pixel.js";
import { bjDay } from "../../lib/stats.js";

// kv：进度等 KV 键的前缀（AiLGNS 沿用原来的键）；deploy：合约部署区块，第一次运行从这里开始读；otc 空着 = 还没部署，跳过
// pd：单价显示几位小数；dex：AiLGNS 才说「比官方 DEX 买更便宜」（LGNS 在 DEX 买不扣税，不这么说）
// sellTax：LGNS 在 DEX 卖出扣的手续费（Polygon 固定 5%，Anubis 动态 5%–约 50%），求购单推送时提一句
const POLYGON_RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"];
const MARKETS = [
  { key: "ailgns", sym: "AiLGNS", chain: "Anubis", otc: "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", dec: 18, rpcs: RPCS, tx: "https://anubisscan.io/tx/",
    pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", pairDai: 1, pd: 2, kv: "otcw:", deploy: 17798035, backfill: true, dex: true, link: "https://ailgns.dev/#/otc" },
  { key: "lgns", sym: "LGNS", chain: "Anubis", otc: "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818", dec: 9, rpcs: RPCS, tx: "https://anubisscan.io/tx/",
    pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", pairDai: 1, pd: 4, kv: "otcw:lgns:", deploy: 17936478, sellTax: "5%～50%", link: "https://ailgns.dev/#/otc/lgns" },
  { key: "plgns", sym: "LGNS", chain: "Polygon", otc: "0x4060f38d3e837843b69014d9f85ecfb3e29fa2db", dec: 9, rpcs: POLYGON_RPCS, tx: "https://polygonscan.com/tx/",
    pair: "0x882df4b0fb50a229c3b4124eb18c759911485bfb", pairDai: 0, pd: 4, kv: "otcw:plgns:", deploy: 96510526, sellTax: "5%", link: "https://ailgns.dev/#/otc/plgns" },
].filter((m) => m.otc);
const SITE = "https://ailgns.dev/#/otc";
// 币名：LGNS 两条链都有，带上链名
const label = (m) => (m.key === "ailgns" ? m.sym : `${m.sym}（${m.chain}）`);
const FILLED = "0x69c74c6fcd53500d036d8a37cc9514fb69b660b99d36728e8aba82e7a53b055d"; // Filled(id, taker, amount, paid, fee, giveLeft)
const CLOSED = "0xec091cd14d8a8ba29bf6a14340c9c648295a414a131bd9ad694b621358842776"; // Closed(id, maker, refunded, expired)
const GET_ORDERS = "0x8f72fc77", COUNT = "0x35daa731";
const GROUPS = ["oes8etcm", "fvg4wksw"]; // 站长的两个 DeBox 群（机器人要先被拉进群才发得出去）
const BACKFILL_STEPS = 6; // 每次最多补查几段（每段 5000 个块），几轮就补完

// 在 OTC 成交过的地址（挂单被吃的挂单人 + 吃单人）记下来，并累计成交额（DAI）：
// otct:<地址> 记所有成交；送会员只看 otcq:<地址>：单笔成交满 50 DAI 才算（防小额刷单刷会员），满一笔送初级 VIP，累计满 1 万 DAI 送高级 VIP
// 三个市场的成交额合并累计（DAI 两条链都是 18 位）
const VIP_MIN_FILL = 50;
const OLD_VIP_CUTOFF = { anubis: 17967579, polygon: 96531101 }; // 和 functions/api/member.js 的 OTC_VIP_CUTOFF 一样
async function markTraders(m, kv, logs, cache, live = false) {
  for (const l of logs) {
    if (l.topics[0] !== FILLED) continue;
    const key = "otcf:" + l.transactionHash + ":" + parseInt(l.logIndex, 16);
    if (await kv.get(key)) continue; // 记过了（补记和正常进度会有重叠）
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(m, id)), d = words(l.data);
    const vol = o.sell ? num(d[1]) : num(d[0]); // 卖单：吃单人付的 DAI；买单：吃单人拿走的 DAI
    for (const a of new Set([o.maker, "0x" + l.topics[2].slice(26)])) {
      const r = (await kv.get("otct:" + a, "json")) || { id, tx: l.transactionHash, block: parseInt(l.blockNumber, 16), chain: m.chain.toLowerCase() };
      r.vol = (r.vol || 0) + vol;
      r.n = (r.n || 0) + 1;
      await kv.put("otct:" + a, JSON.stringify(r));
    }
    await kv.put(key, "1");
  }
  await markVip(m, kv, logs, cache, live);
}
// live：正常进度读到的新成交（补记以前的成交时不算），新送出的初级 VIP 记进 st:v:<北京日期>，内部群日报用
async function markVip(m, kv, logs, cache, live = false) {
  for (const l of logs) {
    if (l.topics[0] !== FILLED) continue;
    const key = "otcq:f:" + l.transactionHash + ":" + parseInt(l.logIndex, 16);
    if (await kv.get(key)) continue;
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(m, id)), d = words(l.data);
    const vol = o.sell ? num(d[1]) : num(d[0]);
    if (vol >= VIP_MIN_FILL) {
      for (const a of new Set([o.maker, "0x" + l.topics[2].slice(26)])) {
        const old = await kv.get("otcq:" + a, "json"), r = old || { id, tx: l.transactionHash, block: parseInt(l.blockNumber, 16), chain: m.chain.toLowerCase() };
        const first = (await kv.get("otct:" + a, "json")) || {}; // 50 DAI 门槛之前就成交过的老用户本来就有会员，不算新送的
        if (!old && live && !(first.block < (OLD_VIP_CUTOFF[first.chain || "anubis"] || 0))) {
          const dk = "st:v:" + bjDay(), list = (await kv.get(dk, "json")) || [];
          if (!list.includes(a)) { list.push(a); await kv.put(dk, JSON.stringify(list), { expirationTtl: 90 * 86400 }); }
        }
        r.vol = (r.vol || 0) + vol;
        r.n = (r.n || 0) + 1;
        await kv.put("otcq:" + a, JSON.stringify(r));
      }
    }
    await kv.put(key, "1");
  }
}
// 加了 50 DAI 门槛后，三个市场以前的成交从部署区块起重新补记一遍（只补 otcq，otct 已经记过）
async function backfillVip(m, kv, upto, cache) {
  const sk = m.kv + "otcq:scan";
  let b = parseInt((await kv.get(sk)) || String(m.deploy - 1), 10) + 1;
  const span = m.chain === "Polygon" ? 2000 : 5000;
  for (let i = 0; i < BACKFILL_STEPS && b <= upto; i++) {
    const to = Math.min(upto, b + span - 1);
    await markVip(m, kv, await rpc(m, "eth_getLogs", [{ address: m.otc, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [FILLED] }]), cache);
    await kv.put(sk, String(to));
    b = to + 1;
  }
}
// 以前的成交一点点补记：每次 otc-watch 运行时往前补几段，补到和正常进度接上为止
// 只有 AiLGNS 需要补记（新市场从部署区块开始读，不会漏）
async function backfillTraders(m, kv, upto, cache) {
  let b = parseInt((await kv.get("otct2:scan")) || String(m.deploy - 1), 10) + 1; // otct2：加了成交额统计后从头重新补记一遍
  if (b > upto) return;
  for (let i = 0; i < BACKFILL_STEPS && b <= upto; i++) {
    const to = Math.min(upto, b + 4999);
    await markTraders(m, kv, await rpc(m, "eth_getLogs", [{ address: m.otc, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [FILLED] }]), cache);
    await kv.put("otct2:scan", String(to));
    b = to + 1;
  }
}

async function rpc(m, method, params) {
  const RPCS = m.rpcs;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (k === RPCS.length * 2 - 1) throw e; }
  }
}
const u256 = (v) => BigInt(v).toString(16).padStart(64, "0");
const words = (h) => (h.startsWith("0x") ? h.slice(2) : h).match(/.{64}/g) || [];
const num = (h, dec = 18) => Number(BigInt("0x" + h)) / 10 ** dec;
const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: v !== 0 && Math.abs(v) < 0.01 ? 8 : 4 }); // 很小的数多保留几位，别显示成 0
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);

async function order(m, id) {
  const w = words(await rpc(m, "eth_call", [{ to: m.otc, data: GET_ORDERS + u256(id) + u256(1) }, "latest"]));
  const o = w.slice(2, 9);
  return { maker: "0x" + o[0].slice(24), sell: BigInt("0x" + o[1]) === 1n };
}

// ---------- 低于市价的好单：推送给关注机器人的人（订阅号）----------
// 卖单单价低于市价（客户能低于市价买到）、买单出价高于市价（客户能高于市价卖出），就推送；每张单只推一次
// 只说比市价低 / 高多少，不说能赚多少、不承诺收益
const PP_ON = true; // 站长 2026-11-01 确认文案后开启
// DEX 市价：每枚挂单币值多少 DAI
async function market(m) {
  const w = words(await rpc(m, "eth_call", [{ to: m.pair, data: "0x0902f1ac" }, "latest"]));
  return num(w[m.pairDai]) / num(w[1 - m.pairDai], m.dec);
}
// 当前在挂的单子（没过期、还有剩余）
async function book(m, now) {
  const count = Number(BigInt(await rpc(m, "eth_call", [{ to: m.otc, data: COUNT }, "latest"]))), from = Math.max(0, count - 500), out = [];
  if (!count) return out;
  const w = words(await rpc(m, "eth_call", [{ to: m.otc, data: GET_ORDERS + u256(from) + u256(count - from) }, "latest"]));
  const n = Number(BigInt("0x" + w[1]));
  for (let i = 0; i < n; i++) {
    const o = w.slice(2 + i * 7, 9 + i * 7), sell = BigInt("0x" + o[1]) === 1n, open = BigInt("0x" + o[2]) === 1n, exp = Number(BigInt("0x" + o[3]));
    const gd = sell ? m.dec : 18, wd = sell ? 18 : m.dec; // 挂单存入的币 / 想换回的币各自的小数位
    const give = num(o[4], gd), want = num(o[5], wd), gl = num(o[6], gd);
    if (!open || exp <= now || gl < 1e-4 || (sell ? gl * want / give : gl) < 1) continue; // 剩余不足 1 DAI 的自动下架
    out.push({ id: from + i, sell, price: sell ? want / give : give / want, qty: sell ? gl : gl * want / give, left: exp - now });
  }
  return out;
}
const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? `${d}天${h}小时` : h ? `${h}小时${m}分` : `${Math.max(1, m)}分钟`; };
const d2 = (v, pd = 2) => v.toLocaleString("en-US", { minimumFractionDigits: pd, maximumFractionDigits: pd });
const qtyStr = (m, v) => v.toFixed(m.dec === 18 ? 4 : 2);
// 比市价好多少（正数 = 对客户有利）：卖单比市价低多少，买单比市价高多少
const better = (o, mkt) => (o.sell ? 1 - o.price / mkt : o.price / mkt - 1);
function dealText(m, list, mkt) {
  const ns = list.filter((o) => o.sell).length, name = label(m);
  const lines = [ns === list.length ? `🔥 低于市场价的 ${name} 好单！` : ns ? `🔥 ${name} OTC 好单：低于市价买、高于市价卖！` : `🔥 高于市场价求购 ${name}！`];
  for (const o of list) {
    const pct = (better(o, mkt) * 100).toFixed(1);
    lines.push("", o.sell
      ? `📤 低价出售 ${qtyStr(m, o.qty)} ${m.sym}\n单价 ${d2(o.price, m.pd)} DAI，比市价低 ${pct}%` + (m.dex ? "，比官方 DEX 买更便宜" : "")
      : `📥 高价求购 ${qtyStr(m, o.qty)} ${m.sym}\n出价 ${d2(o.price, m.pd)} DAI，比市价高 ${pct}%，手里有币可以直接卖` + (m.sellTax ? `\n（在 DEX 卖要扣 ${m.sellTax} 手续费，这里只收 1%）` : ""));
    lines.push(`⏳ 还剩 ${dur(o.left)} · 订单 #${o.id}`);
  }
  lines.push("", `📊 现在${m.key === "ailgns" ? "" : " " + m.chain + " 链"}市价 ${d2(mkt, m.pd)} DAI`, "⚡ 先到先得，被别人吃掉就没了！", "🎁 交易就送会员，交易金额超过 1 万 DAI 的送高级 VIP", "🧬 " + m.link);
  return lines.join("\n");
}
// 找出还没推送过的低于市价的单；send=false 时只返回文字（预览）
async function pushDeals(m, env, kv, send) {
  const now = Math.floor(Date.now() / 1000), [orders, mkt] = await Promise.all([book(m, now), market(m)]);
  const hits = orders.filter((o) => better(o, mkt) > 0);
  const fresh = [];
  for (const o of hits) if (!send || !(await kv.get(m.kv + "pp:" + o.id))) fresh.push(o);
  fresh.sort((a, b) => better(b, mkt) - better(a, mkt));
  const pick = fresh.slice(0, 3), text = pick.length ? dealText(m, pick, mkt) : null;
  if (!send || !text) return { hits: hits.length, mkt, text };
  await sendDeboxFans(env, GROUPS[0], text);
  for (const o of pick) await kv.put(m.kv + "pp:" + o.id, "1", { expirationTtl: Math.max(60, Math.ceil(o.left) + 3600) }); // 每张单只推一次
  return { hits: hits.length, sent: pick.length };
}

// 群播报模板（站长给的）：成交数量 / 金额 / 单价 + 一句随机的庆祝或宣传 + 钱包打开链接
// 随机句子从下面的池子里抽，最近用过的 30 句不再抽（记在 KV otcw:phr），群里看着不重样
// 只说真实的东西（0 滑点、1% 手续费、合约担保、成交送会员），不预测价格、不承诺收益
const PHRASES = [
  "🎉 恭喜恭喜！又一笔大单落袋，0 滑点就是这么爽！",
  "🥳 又成交一笔！合约担保，一笔交易钱货两清。",
  "🔥 成交一笔接一笔，OTC 越来越热闹了！",
  "💎 恭喜这位老板，筹码稳稳到手！",
  "👏 又一位聪明人选择了 OTC，省下了 DEX 的高额滑点！",
  "🚀 交易就送会员！单笔满 50 DAI 的成交，会员自动到账。",
  "🎁 交易就送会员：单笔成交满 50 DAI 送初级 VIP，累计满 1 万 DAI 送高级 VIP！",
  "🎁 成交一笔满 50 DAI 就是会员，累计满 1 万 DAI 直接升高级 VIP，越交易越划算！",
  "🏆 恭喜成交！你离高级 VIP（累计 1 万 DAI）又近了一步。",
  "💰 只收 1% 手续费，买卖 1 万 DAI 比 DEX 省下几百上千 DAI！",
  "⚡ 合约秒到账，不用等、不用信任任何人，代码说了算。",
  "🔐 币锁在合约里，付款收币一笔完成，比私下转账安全得多。",
  "🤝 买卖双方都满意，这才是好交易！",
  "🌟 越来越多人选择在 OTC 交易，省钱又安全！",
  "💪 大家一起建设，AiLGNS 社区越来越热闹！",
  "🤝 每一笔成交都是社区共识的一部分！",
  "🏗️ 社区在建设，交易在增长，一起加油！",
  "🎊 又是漂亮的一单！想买想卖的，挂单就有人接。",
  "📈 交易越活跃，市场越有深度，大家都受益！",
  "😎 0 滑点成交的感觉，用过就回不去了。",
  "🧧 恭喜发财！这一单成交得干脆利落。",
  "🎯 看准价格挂个单，到价自动成交，省心省力。",
  "⏰ 挂单 10 分钟到 30 天自选，到期没成交自动退回，零风险挂单。",
  "🙌 不用盯盘不用抢，挂好单子等人来吃就行。",
  "💡 小技巧：挂单价格贴近指导价，成交更快！",
  "💡 想卖 AiLGNS？在 OTC 挂单，0 滑点卖出，不用被池子吃差价。",
  "💡 想买 AiLGNS？直接吃 OTC 的单，价格一目了然，没有滑点。",
  "🛡️ 智能合约担保，无需信任、无需许可，安全看得见。",
  "🔥 恭喜成交！下一笔庆祝的就是你！",
  "🥂 干杯！又一位老板在 OTC 完成交易。",
  "🌈 成交顺利，皆大欢喜！",
  "✨ 50 DAI 起就能挂单，成交一笔满 50 DAI 就送会员，快来试试！",
  "📣 交易就送会员，单笔满 50 DAI 成交即送！",
  "💎 大单小单都欢迎，一视同仁，合约自动结算。",
  "🚀 OTC 成交量稳步增长，感谢每一位支持的朋友！",
  "🤑 省下的滑点就是赚到的钱！",
  "🧮 算一算：DEX 滑点 3%–28%，这里固定 1%，差距一目了然。",
  "🎉 又一单！大家的信任就是我们最大的动力。",
  "👍 交易透明可查，每一笔都在链上。",
  "🔗 每笔成交都在链上，随时可以查验，公开透明。",
  "🥳 恭喜！成交完成，币已经在钱包里了。",
  "🌟 好的交易平台，就是让买卖变得简单。",
  "🎁 还没开会员的朋友，来 OTC 成交一笔就送！",
  "🏅 累计成交满 1 万 DAI 送高级 VIP，大户朋友们冲！",
  "💬 有任何问题，网站右下角找客服。",
  "📲 用钱包 App 打开链接，一键挂单、一键成交。",
  "🙏 感谢每一位在 OTC 交易的朋友，一起把社区做大！",
  "🎊 成交！又是愉快的一笔交易。",
  "🔥 热度持续，OTC 天天有成交！",
  "🌙 不管白天黑夜，合约 24 小时自动撮合结算。",
];
// 从池子里抽一句最近没用过的；有 LGNS 成交时不抽讲 AiLGNS / 官方 DEX 费用的句子（那些只对 AiLGNS 成立）
async function phrase(kv, dry, onlyAilgns) {
  const recent = (await kv.get("otcw:phr", "json")) || [];
  const ok = (i) => onlyAilgns || !/AiLGNS|DEX/.test(PHRASES[i]);
  let fresh = PHRASES.map((_, i) => i).filter((i) => ok(i) && !recent.includes(i));
  if (!fresh.length) fresh = PHRASES.map((_, i) => i).filter(ok);
  const i = fresh[Math.floor(Math.random() * fresh.length)];
  if (!dry) await kv.put("otcw:phr", JSON.stringify([...recent, i].slice(-30)));
  return PHRASES[i];
}
const PROMO = "🎁 交易就送会员，交易金额超过 1 万 DAI 的送高级 VIP";
function groupText(fills, line) {
  const out = fills.slice(0, 5).map((f) => `🤝 已成交：${f.qty.toFixed(f.m.dec === 18 ? 5 : 2)} 个 ${label(f.m)}，\n金额：${dai2(f.qty * f.price)} DAI，\n单价：${d2(f.price, f.m.pd)} DAI/${f.m.sym}`);
  if (fills.length > 5) out.push(`……共 ${fills.length} 笔成交`);
  const links = [...new Set(fills.map((f) => f.m.link))]; // 都是同一个市场的成交，就直接链到那个市场
  return out.join("\n\n") + "\n\n" + line + "\n" + PROMO + "\n使用钱包打开DApp链接↓\n🧬 " + (links.length === 1 ? links[0] : SITE);
}
const dai2 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1"; // dry=1&from=区块：只看消息内容，不发送、不记进度（测试用）
  // ppdry=1：预览现在有哪些低于市价的挂单、推送文字长什么样（不发送）
  if (url.searchParams.get("ppdry") === "1") return Response.json(await Promise.all(MARKETS.map((m) => pushDeals(m, ctx.env, kv, false).then((r) => ({ market: m.key, ...r }), (e) => ({ market: m.key, err: String(e.message || e) })))));
  // fanstest=1：发一条测试推送给机器人的关注者，看 DeBox 有没有开通权限（1 小时最多一次）
  if (url.searchParams.get("fanstest") === "1") {
    const lastTest = parseInt((await kv.get("otcw:fanstest")) || "0", 10);
    if (Date.now() - lastTest < 3600000) return Response.json({ fans: await kv.get("otcw:fans", "json"), note: "1 小时内测过了" });
    await kv.put("otcw:fanstest", String(Date.now()));
    const r = await sendDeboxFans(ctx.env, GROUPS[0], "📢 已关注 AiLGNS OTC 机器人：以后每笔 OTC 成交都会第一时间推送给你。\n🎁 交易就送会员，交易金额超过 1 万 DAI 的送高级 VIP\n🧬 https://ailgns.dev/#/otc")
      .then((x) => ({ ok: true, result: x }), (e) => ({ ok: false, err: String(e.message || e).slice(0, 300) }));
    await kv.put("otcw:fans", JSON.stringify({ ...r, at: Date.now() }));
    return Response.json({ fans: r });
  }
  // dry=1&from=区块&m=市场（默认 ailgns）：只预览这一个市场
  const markets = dry ? MARKETS.filter((m) => m.key === (url.searchParams.get("m") || "ailgns")) : MARKETS;
  const msgs = [], fills = [], status = {}, done = []; // msgs：[地址, 文字]；done：[市场, 日志, 订单缓存, 起点, 最新区块]
  for (const m of markets) {
    try {
      const latest = parseInt(await rpc(m, "eth_blockNumber", []), 16);
      let from = dry ? parseInt(url.searchParams.get("from") || "0", 10) - 1 : parseInt((await kv.get(m.kv + "block")) || "0", 10);
      if (!from) from = m.deploy ? m.deploy - 1 : latest - 100; // 第一次运行：新合约从部署区块开始；否则只看最近一会儿，不补发老消息
      from += 1;
      const span = m.chain === "Polygon" ? 2000 : 5000, logs = [];
      for (let b = from; b <= latest; b += span) {
        const to = Math.min(latest, b + span - 1);
        logs.push(...(await rpc(m, "eth_getLogs", [{ address: m.otc, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [[FILLED, CLOSED]] }])));
      }
      const cache = {};
      for (const l of logs) {
        const id = parseInt(l.topics[1], 16), d = words(l.data);
        const o = cache[id] || (cache[id] = await order(m, id));
        const giveSym = o.sell ? label(m) : "DAI", wantSym = o.sell ? "DAI" : label(m), side = (m.key === "ailgns" ? "" : label(m)) + (o.sell ? "卖单" : "买单");
        const gd = o.sell ? m.dec : 18, wd = o.sell ? 18 : m.dec; // 挂单存入的币 / 想换回的币各自的小数位
        const link = "\n🔗 " + m.tx + l.transactionHash + "\n🧬 " + m.link;
        if (l.topics[0] === FILLED) {
          const taker = "0x" + l.topics[2].slice(26), amount = num(d[0], gd), paid = num(d[1], wd), fee = num(d[2], gd), left = num(d[3], gd);
          msgs.push([o.maker, `🎉 你的${side} #${id} 成交了！\n${o.sell ? "卖出" : "付出"} ${fmt(amount)} ${giveSym}，收到 ${fmt(paid)} ${wantSym}\n` +
            ((o.sell ? left * paid / amount : left) >= 1 ? `还剩 ${fmt(left)} ${giveSym} 在挂单中` : "✅ 已全部成交" + (left > 0 ? `（剩 ${fmt(left)} ${giveSym} 不足 1 DAI，已自动下架，可在网站「我的挂单」点取回）` : "")) + link]);
          fills.push({ m, qty: o.sell ? amount : paid, price: o.sell ? paid / amount : amount / paid });
          msgs.push([taker, `✅ 吃单成功 #${id}\n付出 ${fmt(paid)} ${wantSym}，收到 ${fmt(amount - fee)} ${giveSym}（已扣 1% 手续费 ${fmt(fee)}）` + link]);
        } else {
          const refunded = num(d[0], gd), expired = BigInt("0x" + d[1]) === 1n;
          if (refunded <= 0) continue; // 全部成交时的关闭，上面已经通知过
          msgs.push([o.maker, (expired ? `⏰ 你的${side} #${id} 到期未成交，已自动退回 ` : `↩️ 你的${side} #${id} 已撤单，退回 `) + `${fmt(refunded)} ${giveSym} 到你的钱包` + link]);
        }
      }
      done.push([m, logs, cache, from, latest]);
      status[m.key] = { from, latest, events: logs.length };
    } catch (e) { status[m.key] = { err: String(e.message || e).slice(0, 160) }; } // 一条链的节点出问题，不影响别的市场，下次接着读
  }
  // 群播报：只在有成交时发
  const gids = (ctx.env.DEBOX_GROUP_ID ? String(ctx.env.DEBOX_GROUP_ID).split(",") : GROUPS).map((g) => g.trim()).filter(Boolean);
  const group = fills.length ? groupText(fills, await phrase(kv, dry, fills.every((f) => f.m.key === "ailgns"))) : null;
  if (dry) return Response.json({ status, group, messages: msgs.map((m) => ({ to: m[0], text: m[1] })) });
  const groupSent = {};
  if (group) {
    for (const g of gids) {
      try { await sendDebox(ctx.env, g, group, "group"); groupSent[g] = true; }
      catch (e) { groupSent[g] = String(e.message || e).slice(0, 160); } // 机器人还没进群时会失败，下次再试
    }
  }
  // 低于市价的挂单推送给关注机器人的人（站长确认文案后把 PP_ON 改成 true 才真的发）
  let fans = null;
  if (PP_ON) {
    fans = {};
    for (const m of MARKETS) {
      fans[m.key] = await pushDeals(m, ctx.env, kv, true).catch((e) => ({ err: String(e.message || e).slice(0, 200) }));
      if (fans[m.key].err) await kv.put("otcw:fans", JSON.stringify({ ok: false, market: m.key, err: fans[m.key].err, at: Date.now() }));
    }
  }
  let sent = 0, failed = 0;
  for (const [addr, text] of msgs) {
    const users = (await kv.get("dbx:a:" + addr, "json")) || [];
    for (const u of users) {
      try { await sendDebox(ctx.env, u, text); sent++; } catch (e) { failed++; }
    }
  }
  for (const [m, logs, cache, from, latest] of done) {
    await markTraders(m, kv, logs, cache, true).catch(() => {});
    if (m.backfill) await backfillTraders(m, kv, from - 1, cache).catch(() => {});
    await backfillVip(m, kv, from - 1, cache).catch(() => {});
    await kv.put(m.kv + "block", String(latest));
  }
  const pixel = await rebuildIfNeeded(kv).catch((e) => ({ err: String(e.message || e).slice(0, 160) })); // 像素墙：顺便检查一下有没有被同时写覆盖
  return Response.json({ status, messages: msgs.length, sent, failed, groupSent, fans, pixel, backfilledTo: await kv.get("otct2:scan"), vipScan: Object.fromEntries(await Promise.all(MARKETS.map(async (m) => [m.key, await kv.get(m.kv + "otcq:scan")]))) });
}
