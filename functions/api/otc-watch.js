// OTC 挂单动态通知：定时任务每 5 分钟调用一次，读托管合约新的成交 / 撤单 / 到期退回事件，
// 按钱包地址找到在 DeBox 机器人里绑定过的用户，私信通知挂单人（成交时也通知吃单人）
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox } from "../../lib/debox.js";

const OTC = "0x4e730be6d46be71223ded5a32dc45799f6d4bc15";
const FILLED = "0x69c74c6fcd53500d036d8a37cc9514fb69b660b99d36728e8aba82e7a53b055d"; // Filled(id, taker, amount, paid, fee, giveLeft)
const CLOSED = "0xec091cd14d8a8ba29bf6a14340c9c648295a414a131bd9ad694b621358842776"; // Closed(id, maker, refunded, expired)
const GET_ORDERS = "0x8f72fc77";
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
  const cache = {}, msgs = []; // [地址, 文字]
  for (const l of logs) {
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(id)), d = words(l.data);
    const giveSym = o.sell ? "AiLGNS" : "DAI", wantSym = o.sell ? "DAI" : "AiLGNS", side = o.sell ? "卖单" : "买单";
    const link = "\n🔗 " + TX + l.transactionHash + "\n👉 https://ailgns.dev/#/otc";
    if (l.topics[0] === FILLED) {
      const taker = "0x" + l.topics[2].slice(26), amount = num(d[0]), paid = num(d[1]), fee = num(d[2]), left = num(d[3]);
      msgs.push([o.maker, `🎉 你的${side} #${id} 成交了！\n${o.sell ? "卖出" : "付出"} ${fmt(amount)} ${giveSym}，收到 ${fmt(paid)} ${wantSym}\n` +
        (left > 0 ? `还剩 ${fmt(left)} ${giveSym} 在挂单中` : "✅ 已全部成交") + link]);
      msgs.push([taker, `✅ 吃单成功 #${id}\n付出 ${fmt(paid)} ${wantSym}，收到 ${fmt(amount - fee)} ${giveSym}（已扣 1% 手续费 ${fmt(fee)}）` + link]);
    } else {
      const refunded = num(d[0]), expired = BigInt("0x" + d[1]) === 1n;
      if (refunded <= 0) continue; // 全部成交时的关闭，上面已经通知过
      msgs.push([o.maker, (expired ? `⏰ 你的${side} #${id} 到期未成交，已自动退回 ` : `↩️ 你的${side} #${id} 已撤单，退回 `) + `${fmt(refunded)} ${giveSym} 到你的钱包` + link]);
    }
  }
  if (dry) return Response.json({ from, latest, events: logs.length, messages: msgs.map((m) => ({ to: m[0], text: m[1] })) });
  let sent = 0, failed = 0;
  for (const [addr, text] of msgs) {
    const users = (await kv.get("dbx:a:" + addr, "json")) || [];
    for (const u of users) {
      try { await sendDebox(ctx.env, u, text); sent++; } catch (e) { failed++; }
    }
  }
  await kv.put("otcw:block", String(latest));
  return Response.json({ from, latest, events: logs.length, messages: msgs.length, sent, failed });
}
