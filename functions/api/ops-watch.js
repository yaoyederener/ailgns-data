// 运营费用发放公告：定时任务每 5 分钟调用一次，读 Anubis、Polygon 两个发放合约的新发放记录，
// 发到「运营费用」专用 DeBox 群（只发这个群，和行情播报群分开）。文字只写运营费用发放，不写比例和收款人。
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox } from "../../lib/debox.js";

const OPS_GROUP = "uqw6tsqb"; // 运营费用公告群（不要和行情群 oes8etcm、fvg4wksw 混用）
const SPLIT = "0xb1fafb8bf72e6705dba1b22c347f53d50b1b8539bc5f9ce17a1cf52973dfbe79"; // Split(token, amount, toPayee1, toPayee2, toPayee3, by)
const CHAINS = {
  anubis: { name: "Anubis", contract: "0xeee877c1b6285b82890bdcd027d2715f658ecf23", rpcs: RPCS, tx: "https://anubisscan.io/tx/", span: 5000 },
  polygon: { name: "Polygon", contract: "0xcc274e07847a6a86917b6ccd4e67706170d4036f", rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"], tx: "https://polygonscan.com/tx/", span: 9000 },
};
const TOKENS = {
  "0x4d1d808a081fdac440703b3765fc61f8028c06b8": ["LGNS", 9], "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb": ["AiLGNS", 18],
  "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14": ["DAI", 18], "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": ["DAI", 18],
  "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01": ["LGNS", 9],
};

async function rpc(c, method, params) {
  for (let k = 0; k < c.rpcs.length * 2; k++) {
    try {
      const r = await fetch(c.rpcs[k % c.rpcs.length], { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 ailgns" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (k === c.rpcs.length * 2 - 1) throw e; }
  }
}
const amt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 6 : 2 });
const bjTime = (sec) => new Date(sec * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

// 版本 A：只写「运营费用发放」，附转账链接
function notice(items) {
  const lines = ["📋 AiLGNS 运营费用发放公告", "", "本次运营费用已发放："];
  for (const it of items) lines.push(`· ${amt(it.out)} ${it.sym}（${it.chain}）`, `  转账：${it.link}`);
  lines.push("", "运营费用来自 AiLGNS 服务站的会员服务与 OTC 交易服务费，用于服务站的日常运营。", "", `🕒 ${bjTime(items[items.length - 1].time)}（北京时间）`, "—— AiLGNS 服务站");
  return lines.join("\n");
}

// 2026-10-31 16:16 那次发放因为 DeBox 限流（429）没发出去，部署后补发一次
const BACKFILL = { flag: "opsw:backfill-20261031", ranges: [{ key: "anubis", from: 17899804, to: 17900127 }, { key: "polygon", from: 96485885, to: 96486100 }] };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function scan(c, from, latest, items) {
  for (let b = from; b <= latest; b += c.span) {
    const to = Math.min(latest, b + c.span - 1);
    const logs = await rpc(c, "eth_getLogs", [{ address: c.contract, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [SPLIT] }]);
    for (const l of logs) {
      const tok = "0x" + l.topics[1].slice(26), [sym, dec] = TOKENS[tok] || ["?", 18], d = l.data.slice(2).match(/.{64}/g);
      const out = (Number(BigInt("0x" + d[1])) + Number(BigInt("0x" + d[2]))) / 10 ** dec; // 实际转出去的部分（留在原钱包的不算）
      const blk = await rpc(c, "eth_getBlockByNumber", [l.blockNumber, false]);
      items.push({ chain: c.name, sym, out, link: c.tx + l.transactionHash, time: parseInt(blk.timestamp, 16) });
    }
  }
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1"; // dry=1&anubisFrom=区块：只看文字，不发、不记进度
  const items = [], ranges = {};
  // 上次没发出去的区块段（发送失败会记下来），这次一起补发
  let retry = dry ? [] : (await kv.get("opsw:retry", "json")) || [];
  if (!dry && !(await kv.get(BACKFILL.flag))) { retry = retry.concat(BACKFILL.ranges); await kv.put(BACKFILL.flag, "1"); }
  for (const r of retry) await scan(CHAINS[r.key], r.from, r.to, items);
  const fresh = [];
  for (const [key, c] of Object.entries(CHAINS)) {
    const latest = parseInt(await rpc(c, "eth_blockNumber", []), 16);
    let from = dry ? parseInt(url.searchParams.get(key + "From") || String(latest - 2000), 10) : parseInt((await kv.get("opsw:" + key)) || "0", 10) + 1;
    if (!dry && from <= 1) from = latest - 50; // 第一次运行：从现在开始，不补发以前的
    ranges[key] = [from, latest];
    const n = items.length;
    await scan(c, from, latest, items);
    if (items.length > n) fresh.push({ key, from, to: latest });
    if (!dry) await kv.put("opsw:" + key, String(latest));
  }
  if (!items.length) { if (retry.length) await kv.put("opsw:retry", "[]"); return Response.json({ ranges, items: 0 }); }
  items.sort((a, b) => a.time - b.time);
  const text = notice(items);
  if (dry) return Response.json({ ranges, items: items.length, text });
  // DeBox 限流（同一轮里行情群刚发过）时等几秒再试；还不行就记下区块段，下一轮（5 分钟后）补发
  let sent = false, err = null;
  for (let k = 0; k < 3 && !sent; k++) {
    if (k) await sleep(4000 * k);
    try { await sendDebox(ctx.env, OPS_GROUP, text, "group"); sent = true; } catch (e) { err = String(e.message || e).slice(0, 200); }
  }
  await kv.put("opsw:retry", JSON.stringify(sent ? [] : retry.concat(fresh).slice(-50)));
  return Response.json({ ranges, items: items.length, sent, err: sent ? null : err, retried: retry.length });
}
