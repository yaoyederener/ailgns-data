// 运营费用发放公告：定时任务每 5 分钟调用一次，读 Anubis、Polygon 两个发放合约的新发放记录，攒起来每 8 小时汇总发一次，
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

// 一天发 3 次汇总（北京时间 0 点、8 点、16 点），每次统计前 8 小时发放的运营费用，并附当天累计
const SLOT = 8 * 3600; // 8 小时一段；北京时间和 UTC 差 8 小时，正好对齐北京 0/8/16 点
const bjDate = (sec) => new Date(sec * 1000).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" });
const bjHour = (sec) => new Date(sec * 1000).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
const dayKey = (sec) => new Date((sec + 8 * 3600) * 1000).toISOString().slice(0, 10); // 北京时间的日期
// 按「币种（链）」加总
function sum(items) {
  const m = {};
  for (const it of items) { const k = it.sym + "（" + it.chain + "）"; m[k] = (m[k] || 0) + it.out; }
  return m;
}
const listSum = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `· ${amt(v)} ${k}`);
function notice(items, start, end, day) {
  const lines = ["📋 AiLGNS 运营费用发放公告", "", `⏱ 统计时段：${bjDate(start)} ${bjHour(start)}–${end % 86400 === 16 * 3600 ? "24:00" : bjHour(end)}（北京时间）`, "", `本时段发放 ${items.length} 笔，合计：`, ...listSum(sum(items))];
  lines.push("", `📊 ${bjDate(start)} 今日累计：`, ...listSum(day));
  lines.push("", "🔗 转账记录：");
  items.slice(-5).forEach((it) => lines.push(`· ${amt(it.out)} ${it.sym}：${it.link}`));
  if (items.length > 5) lines.push(`  （只列最近 5 笔，共 ${items.length} 笔，都可在链上查询）`);
  lines.push("", "运营费用来自 AiLGNS 服务站的会员服务与 OTC 交易服务费，用于服务站的日常运营。", "—— AiLGNS 服务站");
  return lines.join("\n");
}

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

// 每 5 分钟：把新的发放记录攒进 opsw:pending；到了北京 0/8/16 点，把上一段 8 小时的汇总发到运营群
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1"; // dry=1[&anubisFrom=区块&polygonFrom=区块]：只看汇总的文字，不发、不记进度
  const now = Math.floor(Date.now() / 1000), slot = Math.floor(now / SLOT) * SLOT; // 当前这段的开始
  const pending = (await kv.get("opsw:pending", "json")) || [], seen = new Set(pending.map((x) => x.link)), fresh = [];
  // 以前发送失败留下的区块段（旧版逻辑），并进来
  const retry = dry ? [] : (await kv.get("opsw:retry", "json")) || [];
  for (const r of retry) await scan(CHAINS[r.key], r.from, r.to, fresh);
  const ranges = {};
  for (const [key, c] of Object.entries(CHAINS)) {
    const latest = parseInt(await rpc(c, "eth_blockNumber", []), 16);
    let from = dry && url.searchParams.get(key + "From") ? parseInt(url.searchParams.get(key + "From"), 10) : parseInt((await kv.get("opsw:" + key)) || "0", 10) + 1; // 预览可指定起始区块
    if (from <= 1) from = latest - 50;
    ranges[key] = [from, latest];
    await scan(c, from, latest, fresh);
    if (!dry) await kv.put("opsw:" + key, String(latest));
  }
  // 改成 8 小时汇总的那天：把这一段（北京 0 点起）已经单独发过的发放也补进来，让第一条汇总和今日累计是完整的
  if (!dry && !(await kv.get("opsw:v2"))) {
    for (const [key, c] of Object.entries(CHAINS)) await scan(c, ranges[key][1] - (key === "polygon" ? 16000 : 8000), ranges[key][0] - 1, fresh);
    await kv.put("opsw:v2", "1");
  }
  for (const it of fresh) if (!seen.has(it.link) && (it.time >= slot || dry)) { seen.add(it.link); pending.push(it); }
  pending.sort((a, b) => a.time - b.time);
  if (!dry) { await kv.put("opsw:pending", JSON.stringify(pending)); if (retry.length) await kv.put("opsw:retry", "[]"); }

  let last = parseInt((await kv.get("opsw:slot")) || "0", 10);
  if (!last) { last = slot; if (!dry) await kv.put("opsw:slot", String(slot)); } // 第一次运行：从这一段开始攒
  const due = pending.filter((x) => x.time < slot && x.time >= slot - SLOT); // 刚结束的那 8 小时里的发放（更早的不算进这一段）
  if (!dry && (slot <= last || !due.length)) {
    if (slot > last) { await kv.put("opsw:slot", String(slot)); await kv.put("opsw:pending", JSON.stringify(pending.filter((x) => x.time >= slot))); } // 这段没有发放：不发公告
    return Response.json({ ranges, pending: pending.length, next: slot + SLOT });
  }
  // 预览：把攒着的全部当作一段来看
  const batch = dry ? pending.filter((x) => x.time >= slot) : due, start = dry ? slot : slot - SLOT, end = dry ? slot + SLOT : slot;
  if (!batch.length) return Response.json({ ranges, pending: 0, text: null });
  const day = dayKey(start), dayItems = ((await kv.get("opsw:day:" + day, "json")) || []).concat(dry ? [] : batch.map((x) => ({ sym: x.sym, chain: x.chain, out: x.out })));
  const text = notice(batch, start, end, sum(dry ? dayItems.concat(batch) : dayItems));
  if (dry) return Response.json({ ranges, pending: pending.length, text });
  let sent = false, err = null;
  for (let k = 0; k < 3 && !sent; k++) { // DeBox 限流时等几秒再试；还不行就下一轮（5 分钟后）再发
    if (k) await sleep(4000 * k);
    try { await sendDebox(ctx.env, OPS_GROUP, text, "group"); sent = true; } catch (e) { err = String(e.message || e).slice(0, 200); }
  }
  if (sent) {
    await kv.put("opsw:day:" + day, JSON.stringify(dayItems), { expirationTtl: 3 * 86400 });
    await kv.put("opsw:pending", JSON.stringify(pending.filter((x) => x.time >= slot)));
    await kv.put("opsw:slot", String(slot));
  }
  return Response.json({ ranges, items: batch.length, sent, err: sent ? null : err });
}
