// OTC 挂单动态通知：定时任务每 5 分钟调用一次，读托管合约新的挂单 / 成交 / 撤单 / 到期退回事件。
// ① 私信：按钱包地址找到在 DeBox 机器人里绑定过的用户，通知挂单人（成交时也通知吃单人）
// ② 群播报：有成交时发到 DeBox 群（庆祝成交 + 成交送会员 + 网址）
//    群 gid 默认是下面 GROUPS 里的两个群，也可以用 Cloudflare 环境变量 DEBOX_GROUP_ID（多个用逗号隔开）覆盖
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox } from "../../lib/debox.js";

const OTC = "0x4e730be6d46be71223ded5a32dc45799f6d4bc15";
const FILLED = "0x69c74c6fcd53500d036d8a37cc9514fb69b660b99d36728e8aba82e7a53b055d"; // Filled(id, taker, amount, paid, fee, giveLeft)
const CLOSED = "0xec091cd14d8a8ba29bf6a14340c9c648295a414a131bd9ad694b621358842776"; // Closed(id, maker, refunded, expired)
const GET_ORDERS = "0x8f72fc77";
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

const dai = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); // DAI 金额、单价保留 2 位
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// 群播报的文字：全部用真实数据制造紧迫感和士气（刚成交、低于市价、快到期、24 小时成交量），不预测价格、不承诺收益
// 结构：标题 + 恭贺 / 催单 + 链接（放最前面，DeBox 长消息会折叠后半段）→ 成交明细 → 求购（鼓励卖给他们）→ 在售 → 数据
const LINK = "👉 立即成交：https://ailgns.dev/#/otc";
const PROMO = "🎁 交易就送会员！任意金额成交送初级 VIP，累计成交满 1 万 DAI 送高级 VIP";
// 群播报只在有成交时发，内容精简：庆祝成交 + 成交明细 + 成交送会员 + 网址（不报求购、在售、行情，避免太长被折叠）
function groupText(fills) {
  const qty = fills.reduce((t, f) => t + f.qty, 0), total = fills.reduce((t, f) => t + f.qty * f.price, 0);
  const lines = [pick([
    `🎉🎉🎉 恭喜恭喜！又有人在 OTC 拿下 ${fmt(qty)} 枚 AiLGNS！`,
    `🎊🎊🎊 成交啦！${fmt(qty)} 枚 AiLGNS 刚刚成交！`,
    `🔥🔥🔥 又一笔！${fmt(qty)} 枚 AiLGNS 成交，筹码到手！`,
  ]), pick(["💎 恭喜这位老板！0 滑点、合约秒到账！", "🥳 这一单买得漂亮，又省下了 DEX 的高额手续费！", "👏 又一位聪明人选择了 OTC！"])];
  fills.slice(0, 3).forEach((f) => lines.push(`💰 ${fmt(f.qty)} 枚 × ${dai(f.price)} DAI = ${dai(f.qty * f.price)} DAI ✅`));
  if (fills.length > 3) lines.push(`  合计 ${fills.length} 笔、${fmt(qty)} 枚，约 ${dai(total)} DAI`);
  lines.push(PROMO, LINK);
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
  const group = fills.length ? groupText(fills) : null;
  if (dry) return Response.json({ from, latest, events: logs.length, group, messages: msgs.map((m) => ({ to: m[0], text: m[1] })) });
  const groupSent = {};
  if (group) {
    for (const g of gids) {
      try { await sendDebox(ctx.env, g, group, "group"); groupSent[g] = true; }
      catch (e) { groupSent[g] = String(e.message || e).slice(0, 160); } // 机器人还没进群时会失败，下次再试
    }
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
  return Response.json({ from, latest, events: logs.length, messages: msgs.length, sent, failed, groupSent, backfilledTo: await kv.get("otct2:scan") });
}
