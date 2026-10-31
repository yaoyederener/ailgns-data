// OTC 挂单动态通知：定时任务每 5 分钟调用一次，读托管合约新的挂单 / 成交 / 撤单 / 到期退回事件。
// ① 私信：按钱包地址找到在 DeBox 机器人里绑定过的用户，通知挂单人（成交时也通知吃单人）
// ② 群播报：有新挂单或成交时发到 DeBox 群；没动静时每 2 小时发一次挂单速报
//    群 gid 默认是下面 GROUPS 里的两个群，也可以用 Cloudflare 环境变量 DEBOX_GROUP_ID（多个用逗号隔开）覆盖
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox } from "../../lib/debox.js";

const OTC = "0x4e730be6d46be71223ded5a32dc45799f6d4bc15";
const FILLED = "0x69c74c6fcd53500d036d8a37cc9514fb69b660b99d36728e8aba82e7a53b055d"; // Filled(id, taker, amount, paid, fee, giveLeft)
const CLOSED = "0xec091cd14d8a8ba29bf6a14340c9c648295a414a131bd9ad694b621358842776"; // Closed(id, maker, refunded, expired)
const CREATED = "0xabeda1aaf527ebcdd00999e25c2ae410eec4a6098fe233573eb8d956dd149bff"; // Created(id, maker, sellAilgns, give, want, expiry)
const GET_ORDERS = "0x8f72fc77", COUNT = "0x35daa731";
const PAIR = "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0"; // AiLGNS/DAI 池，算市价
const SUMMARY_EVERY = 2 * 3600 * 1000;
const GROUPS = ["oes8etcm", "fvg4wksw"]; // 站长的两个 DeBox 群（机器人要先被拉进群才发得出去）
const URGE = ["⚡ 好价不等人，手慢无！", "⚡ 低价单一出就被抢，先到先得！", "⚡ 0 滑点、手续费仅 1%，比 DEX 省得多，抓紧下单！", "⚡ 挂单随时可能被吃掉，看准就上！"];
const TX = "https://anubisscan.io/tx/";

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

const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? `${d}天${h}小时` : h ? `${h}小时${m}分` : `${Math.max(1, m)}分钟`; };
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
const dai = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); // DAI 金额、单价保留 2 位
const pct = (p, mkt) => { const d = (p / mkt - 1) * 100; return `比市价${d >= 0 ? "高" : "低"} ${Math.abs(d).toFixed(1)}%`; };
// 群播报的文字：新挂单、刚成交、当前在售概况、催单
function groupText(created, fills, orders, mkt) {
  const sells = orders.filter((o) => o.sell).sort((a, b) => a.price - b.price), buys = orders.filter((o) => !o.sell).sort((a, b) => b.price - a.price);
  const lines = [fills.length ? "🔥 AiLGNS OTC 刚刚成交！" : created.length ? "🆕 AiLGNS OTC 新挂单！" : "📢 AiLGNS OTC 挂单速报"];
  if (fills.length) {
    lines.push("", "✅ 刚刚成交：");
    fills.slice(0, 6).forEach((f) => lines.push(`· ${fmt(f.qty)} 枚 × ${dai(f.price)} DAI = ${dai(f.qty * f.price)} DAI`));
  }
  if (created.length) {
    lines.push("", "🆕 新挂单：");
    created.slice(0, 6).forEach((c) => lines.push(`· ${c.sell ? "出售" : "求购"} ${fmt(c.qty)} 枚 × ${dai(c.price)} DAI，${pct(c.price, mkt)}，` + (c.left > 0 ? `有效 ${dur(c.left)}` : "已到期")));
  }
  lines.push("", `📊 市价 ${dai(mkt)} DAI`);
  if (sells.length) {
    lines.push(`📤 在售 ${sells.length} 张，共 ${fmt(sells.reduce((t, o) => t + o.qty, 0))} 枚，最低 ${dai(sells[0].price)} DAI（${pct(sells[0].price, mkt)}）`);
    sells.slice(0, 3).forEach((o) => lines.push(`  · ${fmt(o.qty)} 枚 × ${dai(o.price)} DAI，剩 ${dur(o.left)}`));
  } else lines.push("📤 目前没有卖单，挂单出售正是时候");
  if (buys.length) lines.push(`📥 求购 ${buys.length} 张，最高出价 ${dai(buys[0].price)} DAI`);
  lines.push("", "✅ 合约担保 · 0 滑点 · 手续费 1%", URGE[Math.floor(Math.random() * URGE.length)], "👉 立即成交：https://ailgns.dev/#/otc");
  return lines.join("\n");
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1"; // dry=1&from=区块：只看消息内容，不发送、不记进度（测试用）
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  let from = dry ? parseInt(url.searchParams.get("from") || "0", 10) - 1 : parseInt((await kv.get("otcw:block")) || "0", 10);
  if (!from) from = latest - 100; // 第一次运行：只看最近一会儿，不补发老消息
  from += 1;
  if (from > latest) return Response.json({ from, latest, events: 0 });
  const logs = [];
  for (let b = from; b <= latest; b += 5000) {
    const to = Math.min(latest, b + 4999);
    logs.push(...(await rpc("eth_getLogs", [{ address: OTC, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [[FILLED, CLOSED, CREATED]] }])));
  }
  const cache = {}, msgs = [], created = [], fills = []; // msgs：[地址, 文字]
  const blockTime = parseInt((await rpc("eth_getBlockByNumber", ["0x" + latest.toString(16), false])).timestamp, 16);
  for (const l of logs) {
    const id = parseInt(l.topics[1], 16), d = words(l.data);
    if (l.topics[0] === CREATED) { // 新挂单：只用于群播报
      const sell = BigInt("0x" + d[0]) === 1n, give = num(d[1]), want = num(d[2]), exp = Number(BigInt("0x" + d[3]));
      created.push({ id, sell, qty: sell ? give : want, price: sell ? want / give : give / want, left: Math.max(0, exp - blockTime) });
      continue;
    }
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
  // 群播报：有新挂单或成交就发；没动静时每 2 小时发一次速报（有挂单才发）
  const gids = (ctx.env.DEBOX_GROUP_ID ? String(ctx.env.DEBOX_GROUP_ID).split(",") : GROUPS).map((g) => g.trim()).filter(Boolean);
  const lastSum = parseInt((await kv.get("otcw:sum")) || "0", 10);
  let group = null;
  if (created.length || fills.length || Date.now() - lastSum > SUMMARY_EVERY) {
    const orders = await book(blockTime);
    if (created.length || fills.length || orders.length) group = groupText(created, fills, orders, await market());
  }
  if (dry) return Response.json({ from, latest, events: logs.length, group, messages: msgs.map((m) => ({ to: m[0], text: m[1] })) });
  const groupSent = {};
  if (group) {
    for (const g of gids) {
      try { await sendDebox(ctx.env, g, group, "group"); groupSent[g] = true; }
      catch (e) { groupSent[g] = String(e.message || e).slice(0, 160); } // 机器人还没进群时会失败，下次再试
    }
    if (Object.values(groupSent).some((v) => v === true)) await kv.put("otcw:sum", String(Date.now()));
  }
  let sent = 0, failed = 0;
  for (const [addr, text] of msgs) {
    const users = (await kv.get("dbx:a:" + addr, "json")) || [];
    for (const u of users) {
      try { await sendDebox(ctx.env, u, text); sent++; } catch (e) { failed++; }
    }
  }
  await kv.put("otcw:block", String(latest));
  return Response.json({ from, latest, events: logs.length, messages: msgs.length, sent, failed, groupSent });
}
