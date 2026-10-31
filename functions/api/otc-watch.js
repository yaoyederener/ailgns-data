// OTC 挂单动态通知：定时任务每 5 分钟调用一次，读托管合约新的挂单 / 成交 / 撤单 / 到期退回事件。
// ① 私信：按钱包地址找到在 DeBox 机器人里绑定过的用户，通知挂单人（成交时也通知吃单人）
// ② 群播报：有成交时发到 DeBox 群（庆祝成交 + 成交送会员 + 网址）
// ③ 订阅号推送：低于市价买 / 高于市价卖的挂单推送给关注机器人的人（每张单只推一次）
//    群 gid 默认是下面 GROUPS 里的两个群，也可以用 Cloudflare 环境变量 DEBOX_GROUP_ID（多个用逗号隔开）覆盖
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox, sendDeboxFans } from "../../lib/debox.js";

const OTC = "0x4e730be6d46be71223ded5a32dc45799f6d4bc15";
const FILLED = "0x69c74c6fcd53500d036d8a37cc9514fb69b660b99d36728e8aba82e7a53b055d"; // Filled(id, taker, amount, paid, fee, giveLeft)
const CLOSED = "0xec091cd14d8a8ba29bf6a14340c9c648295a414a131bd9ad694b621358842776"; // Closed(id, maker, refunded, expired)
const GET_ORDERS = "0x8f72fc77", COUNT = "0x35daa731";
const GROUPS = ["oes8etcm", "fvg4wksw"]; // 站长的两个 DeBox 群（机器人要先被拉进群才发得出去）
const TX = "https://anubisscan.io/tx/";
const OTC_DEPLOY = 17798035; // 托管合约部署的区块：从这里开始补记以前成交过的地址
const BACKFILL_STEPS = 6; // 每次最多补查几段（每段 5000 个块），几轮就补完

// 在 OTC 成交过的地址（挂单被吃的挂单人 + 吃单人）记下来，并累计成交额（DAI）：
// 成交过一笔送初级 VIP，累计满 1 万 DAI 送高级 VIP（会员查询时读 otct:<地址>）
async function markTraders(kv, logs, cache) {
  for (const l of logs) {
    if (l.topics[0] !== FILLED) continue;
    const key = "otcf:" + l.transactionHash + ":" + parseInt(l.logIndex, 16);
    if (await kv.get(key)) continue; // 记过了（补记和正常进度会有重叠）
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(id)), d = words(l.data);
    const vol = o.sell ? num(d[1]) : num(d[0]); // 卖单：吃单人付的 DAI；买单：吃单人拿走的 DAI
    for (const a of new Set([o.maker, "0x" + l.topics[2].slice(26)])) {
      const r = (await kv.get("otct:" + a, "json")) || { id, tx: l.transactionHash, block: parseInt(l.blockNumber, 16) };
      r.vol = (r.vol || 0) + vol;
      r.n = (r.n || 0) + 1;
      await kv.put("otct:" + a, JSON.stringify(r));
    }
    await kv.put(key, "1");
  }
}
// 以前的成交一点点补记：每次 otc-watch 运行时往前补几段，补到和正常进度接上为止
async function backfillTraders(kv, upto, cache) {
  let b = parseInt((await kv.get("otct2:scan")) || String(OTC_DEPLOY - 1), 10) + 1; // otct2：加了成交额统计后从头重新补记一遍
  if (b > upto) return;
  for (let i = 0; i < BACKFILL_STEPS && b <= upto; i++) {
    const to = Math.min(upto, b + 4999);
    await markTraders(kv, await rpc("eth_getLogs", [{ address: OTC, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [FILLED] }]), cache);
    await kv.put("otct2:scan", String(to));
    b = to + 1;
  }
}

async function rpc(method, params) {
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

async function order(id) {
  const w = words(await rpc("eth_call", [{ to: OTC, data: GET_ORDERS + u256(id) + u256(1) }, "latest"]));
  const o = w.slice(2, 9);
  return { maker: "0x" + o[0].slice(24), sell: BigInt("0x" + o[1]) === 1n };
}

// ---------- 低于市价的好单：推送给关注机器人的人（订阅号）----------
// 卖单单价低于市价（客户能低于市价买到）、买单出价高于市价（客户能高于市价卖出），就推送；每张单只推一次
// 只说比市价低 / 高多少，不说能赚多少、不承诺收益
const PAIR = "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0"; // 官方 DEX 的 AiLGNS/DAI 池，算市价
const PP_ON = true; // 站长 2026-11-01 确认文案后开启
async function market() {
  const w = words(await rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "latest"]));
  return num(w[1]) / num(w[0]);
}
// 当前在挂的单子（没过期、还有剩余）
async function book(now) {
  const count = Number(BigInt(await rpc("eth_call", [{ to: OTC, data: COUNT }, "latest"]))), from = Math.max(0, count - 500), out = [];
  if (!count) return out;
  const w = words(await rpc("eth_call", [{ to: OTC, data: GET_ORDERS + u256(from) + u256(count - from) }, "latest"]));
  const n = Number(BigInt("0x" + w[1]));
  for (let i = 0; i < n; i++) {
    const o = w.slice(2 + i * 7, 9 + i * 7), sell = BigInt("0x" + o[1]) === 1n, open = BigInt("0x" + o[2]) === 1n, exp = Number(BigInt("0x" + o[3]));
    const give = num(o[4]), want = num(o[5]), gl = num(o[6]);
    if (!open || exp <= now || gl <= 0) continue;
    out.push({ id: from + i, sell, price: sell ? want / give : give / want, qty: sell ? gl : gl * want / give, left: exp - now });
  }
  return out;
}
const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? `${d}天${h}小时` : h ? `${h}小时${m}分` : `${Math.max(1, m)}分钟`; };
const d2 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// 比市价好多少（正数 = 对客户有利）：卖单比市价低多少，买单比市价高多少
const better = (o, mkt) => (o.sell ? 1 - o.price / mkt : o.price / mkt - 1);
function dealText(list, mkt) {
  const ns = list.filter((o) => o.sell).length;
  const lines = [ns === list.length ? "🔥 低于市场价的 AiLGNS 好单！" : ns ? "🔥 OTC 好单：低于市价买、高于市价卖！" : "🔥 高于市场价求购 AiLGNS！"];
  for (const o of list) {
    const pct = (better(o, mkt) * 100).toFixed(1);
    lines.push("", o.sell
      ? `📤 低价出售 ${o.qty.toFixed(4)} AiLGNS\n单价 ${d2(o.price)} DAI，比市价低 ${pct}%，比官方 DEX 买更便宜`
      : `📥 高价求购 ${o.qty.toFixed(4)} AiLGNS\n出价 ${d2(o.price)} DAI，比市价高 ${pct}%，手里有币可以直接卖`);
    lines.push(`⏳ 还剩 ${dur(o.left)} · 订单 #${o.id}`);
  }
  lines.push("", `📊 现在市价 ${d2(mkt)} DAI`, "⚡ 先到先得，被别人吃掉就没了！", "🎁 交易就送会员，交易金额超过 1 万 DAI 的送高级 VIP", "👉 https://ailgns.dev/#/otc");
  return lines.join("\n");
}
// 找出还没推送过的低于市价的单；send=false 时只返回文字（预览）
async function pushDeals(env, kv, send) {
  const now = Math.floor(Date.now() / 1000), [orders, mkt] = await Promise.all([book(now), market()]);
  const hits = orders.filter((o) => better(o, mkt) > 0);
  const fresh = [];
  for (const o of hits) if (!send || !(await kv.get("otcw:pp:" + o.id))) fresh.push(o);
  fresh.sort((a, b) => better(b, mkt) - better(a, mkt));
  const pick = fresh.slice(0, 3), text = pick.length ? dealText(pick, mkt) : null;
  if (!send || !text) return { hits: hits.length, mkt, text };
  await sendDeboxFans(env, GROUPS[0], text);
  for (const o of pick) await kv.put("otcw:pp:" + o.id, "1", { expirationTtl: Math.max(60, Math.ceil(o.left) + 3600) }); // 每张单只推一次
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
  "🚀 交易就送会员！这一单成交，会员已经自动到账。",
  "🎁 交易就送会员：任意金额成交送初级 VIP，累计满 1 万 DAI 送高级 VIP！",
  "🎁 成交一笔就是会员，累计满 1 万 DAI 直接升高级 VIP，越交易越划算！",
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
  "✨ 小额也能成交，任意金额都送会员，快来试试！",
  "📣 交易就送会员，不限金额，成交即送！",
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
// 从池子里抽一句最近没用过的
async function phrase(kv, dry) {
  const recent = (await kv.get("otcw:phr", "json")) || [];
  const fresh = PHRASES.map((_, i) => i).filter((i) => !recent.includes(i));
  const i = fresh[Math.floor(Math.random() * fresh.length)];
  if (!dry) await kv.put("otcw:phr", JSON.stringify([...recent, i].slice(-30)));
  return PHRASES[i];
}
const PROMO = "🎁 交易就送会员，交易金额超过 1 万 DAI 的送高级 VIP";
function groupText(fills, line) {
  const out = fills.slice(0, 5).map((f) => `🤝 已成交：${f.qty.toFixed(5)} 个 AiLGNS，\n金额：${dai2(f.qty * f.price)} DAI，\n单价：${dai2(f.price)} DAI/AiLGNS`);
  if (fills.length > 5) out.push(`……共 ${fills.length} 笔成交`);
  return out.join("\n\n") + "\n\n" + line + "\n" + PROMO + "\n使用钱包打开DApp链接↓\n🔗 https://ailgns.dev/#/otc";
}
const dai2 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1"; // dry=1&from=区块：只看消息内容，不发送、不记进度（测试用）
  // ppdry=1：预览现在有哪些低于市价的挂单、推送文字长什么样（不发送）
  if (url.searchParams.get("ppdry") === "1") return Response.json(await pushDeals(ctx.env, kv, false));
  // fanstest=1：发一条测试推送给机器人的关注者，看 DeBox 有没有开通权限（1 小时最多一次）
  if (url.searchParams.get("fanstest") === "1") {
    const lastTest = parseInt((await kv.get("otcw:fanstest")) || "0", 10);
    if (Date.now() - lastTest < 3600000) return Response.json({ fans: await kv.get("otcw:fans", "json"), note: "1 小时内测过了" });
    await kv.put("otcw:fanstest", String(Date.now()));
    const r = await sendDeboxFans(ctx.env, GROUPS[0], "📢 已关注 AiLGNS OTC 机器人：以后每笔 OTC 成交都会第一时间推送给你。\n🎁 交易就送会员，交易金额超过 1 万 DAI 的送高级 VIP\n👉 https://ailgns.dev/#/otc")
      .then((x) => ({ ok: true, result: x }), (e) => ({ ok: false, err: String(e.message || e).slice(0, 300) }));
    await kv.put("otcw:fans", JSON.stringify({ ...r, at: Date.now() }));
    return Response.json({ fans: r });
  }
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  let from = dry ? parseInt(url.searchParams.get("from") || "0", 10) - 1 : parseInt((await kv.get("otcw:block")) || "0", 10);
  if (!from) from = latest - 100; // 第一次运行：只看最近一会儿，不补发老消息
  from += 1;
  if (from > latest) return Response.json({ from, latest, events: 0 });
  const logs = [];
  for (let b = from; b <= latest; b += 5000) {
    const to = Math.min(latest, b + 4999);
    logs.push(...(await rpc("eth_getLogs", [{ address: OTC, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [[FILLED, CLOSED]] }])));
  }
  const cache = {}, msgs = [], fills = []; // msgs：[地址, 文字]
  for (const l of logs) {
    const id = parseInt(l.topics[1], 16), d = words(l.data);
    const o = cache[id] || (cache[id] = await order(id));
    const giveSym = o.sell ? "AiLGNS" : "DAI", wantSym = o.sell ? "DAI" : "AiLGNS", side = o.sell ? "卖单" : "买单";
    const link = "\n🔗 " + TX + l.transactionHash + "\n👉 https://ailgns.dev/#/otc";
    if (l.topics[0] === FILLED) {
      const taker = "0x" + l.topics[2].slice(26), amount = num(d[0]), paid = num(d[1]), fee = num(d[2]), left = num(d[3]);
      msgs.push([o.maker, `🎉 你的${side} #${id} 成交了！\n${o.sell ? "卖出" : "付出"} ${fmt(amount)} ${giveSym}，收到 ${fmt(paid)} ${wantSym}\n` +
        (left > 0 ? `还剩 ${fmt(left)} ${giveSym} 在挂单中` : "✅ 已全部成交") + link]);
      fills.push({ qty: o.sell ? amount : paid, price: o.sell ? paid / amount : amount / paid });
      msgs.push([taker, `✅ 吃单成功 #${id}\n付出 ${fmt(paid)} ${wantSym}，收到 ${fmt(amount - fee)} ${giveSym}（已扣 1% 手续费 ${fmt(fee)}）` + link]);
    } else {
      const refunded = num(d[0]), expired = BigInt("0x" + d[1]) === 1n;
      if (refunded <= 0) continue; // 全部成交时的关闭，上面已经通知过
      msgs.push([o.maker, (expired ? `⏰ 你的${side} #${id} 到期未成交，已自动退回 ` : `↩️ 你的${side} #${id} 已撤单，退回 `) + `${fmt(refunded)} ${giveSym} 到你的钱包` + link]);
    }
  }
  // 群播报：只在有成交时发
  const gids = (ctx.env.DEBOX_GROUP_ID ? String(ctx.env.DEBOX_GROUP_ID).split(",") : GROUPS).map((g) => g.trim()).filter(Boolean);
  const group = fills.length ? groupText(fills, await phrase(kv, dry)) : null;
  if (dry) return Response.json({ from, latest, events: logs.length, group, messages: msgs.map((m) => ({ to: m[0], text: m[1] })) });
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
    fans = await pushDeals(ctx.env, kv, true).catch((e) => ({ err: String(e.message || e).slice(0, 200) }));
    if (fans && fans.err) await kv.put("otcw:fans", JSON.stringify({ ok: false, err: fans.err, at: Date.now() }));
  }
  let sent = 0, failed = 0;
  for (const [addr, text] of msgs) {
    const users = (await kv.get("dbx:a:" + addr, "json")) || [];
    for (const u of users) {
      try { await sendDebox(ctx.env, u, text); sent++; } catch (e) { failed++; }
    }
  }
  await markTraders(kv, logs, cache).catch(() => {});
  await backfillTraders(kv, from - 1, cache).catch(() => {});
  await kv.put("otcw:block", String(latest));
  return Response.json({ from, latest, events: logs.length, messages: msgs.length, sent, failed, groupSent, fans, backfilledTo: await kv.get("otct2:scan") });
}
