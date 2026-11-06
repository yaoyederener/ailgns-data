// 运营费用发放公告：定时任务每 5 分钟调用一次，读 Anubis、Polygon 两个发放合约的新发放记录，攒起来每 8 小时汇总发一次，
// 发到「运营费用」专用 DeBox 群（只发这个群，和行情播报群分开）。写今日总收入和按 4:3:3 每份分多少（不写收款地址），并提醒 LGNS 及时换 DAI。
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox } from "../../lib/debox.js";
import { SUPPORT_USER } from "../../lib/support.js";
import { build as buildAdminStats } from "../../lib/adminstats.js";
import { build as buildPartner } from "../../lib/partner.js";

// ⛽ 触发钱包 Gas 看门狗（站长 2026-11-07：没钱就一直提醒）：keeper 每 5 分钟调一次本接口，顺手查一下
// 低于 GAS_MIN DAI → 开一张 0 级工单（铃铛 + Mac 提醒会一直催）+ DeBox 私信站长；每 6 小时催一次，补够了自动安静
const KEEPER = "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", GAS_MIN = 8;
async function gasWatch(ctx, kv) {
  const r = await fetch("https://rpc.anubispace.org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [KEEPER, "latest"] }) }).then((x) => x.json());
  const bal = Number(BigInt(r.result || "0x0")) / 1e18;
  if (!(bal < GAS_MIN)) return;
  if (await kv.get("gas:nag")) return;
  await kv.put("gas:nag", "1", { expirationTtl: 6 * 3600 });
  const txt = "⛽ 触发钱包 Gas 快没了：0x89dd…4e27 只剩 " + bal.toFixed(2) + " DAI（低于 " + GAS_MIN + "）。退款、撮合、奖池、存证都靠它付 Gas，请马上转 30–50 DAI（Anubis 链）到 " + KEEPER + "。补够后提醒自动停。";
  const id = Number((await kv.get("tk:seq")) || "0") + 1;
  await kv.put("tk:seq", String(id));
  const t = { id, a: "system", txt, n: 0, t: Date.now(), st: "new", note: "", tri: { ok: true, lv: 0, cat: "资金", topic: "触发钱包Gas不足", why: "系统自动", dup: 0, ai: false } };
  await kv.put("tk:" + id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
  await kv.put("tk:list", JSON.stringify(((await kv.get("tk:list", "json")) || []).concat(id).slice(-1000)));
  await sendDebox(ctx.env, SUPPORT_USER, txt + "\n\n工单 #" + id + " 👉 https://ailgns.dev/#/feedback/admin", "private").catch(() => {});
}

const OPS_GROUP = "uqw6tsqb"; // 运营费用公告群（不要和行情群 oes8etcm、fvg4wksw 混用）
const SPLIT = "0xb1fafb8bf72e6705dba1b22c347f53d50b1b8539bc5f9ce17a1cf52973dfbe79"; // Split(token, amount, toPayee1, toPayee2, toPayee3, by)
const BUYBACK = "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3"; // 回购分账合约（Anubis，2026-11-03 部署）；它分的是买到的 AiLGNS，三份都转出去
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

// 一天发 1 次汇总（站长 2026-11-05 定）：北京时间 0 点过后第一次运行，把前一天全天的运营费用发到运营群
const SKIP_DAYS = ["2026-11-06"]; // 站长 2026-11-06：今天先停收入汇总（这一天的分账记录照常记账，只是不发公告）
const SLOT = 86400; // 一天一段，按北京时间 0 点切
const slotOf = (sec) => Math.floor((sec + 8 * 3600) / 86400) * 86400 - 8 * 3600; // 这一秒所在的北京日 0 点
const bjDate = (sec) => new Date(sec * 1000).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" });
const bjHour = (sec) => new Date(sec * 1000).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
const dayKey = (sec) => new Date((sec + 8 * 3600) * 1000).toISOString().slice(0, 10); // 北京时间的日期
// 按「币种（链）」加总
// total：这笔收入的总数（分账前）；旧记录只存了转出去的部分 out（40% + 30%），按 70% 倒推
const totalOf = (it) => (it.total !== undefined ? it.total : it.out / 0.7);
function sum(items) {
  const m = {};
  for (const it of items) { const k = it.sym + "（" + it.chain + "）"; m[k] = (m[k] || 0) + totalOf(it); }
  return m;
}
const SHARES = [["40% 份", 0.4], ["30% 份（每人）", 0.3]]; // 4 : 3 : 3，两个 30% 一样多，合成一行
const shareLines = (m) => SHARES.map(([name, r]) => `· ${name}：` + Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${amt(v * r)} ${k}`).join("、"));
const listSum = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `· ${amt(v)} ${k}`);
// 折合 DAI：按各自 DEX 池子的现价（DAI 本身按 1）；key 和 sum() 里的「币种（链）」一样
const PAIRS = { "LGNS（Anubis）": ["anubis", "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", 1, 9], "LGNS（Polygon）": ["polygon", "0x882df4b0fb50a229c3b4124eb18c759911485bfb", 0, 9],
  "AiLGNS（Anubis）": ["anubis", "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", 1, 18] };
async function prices() {
  const out = { "DAI（Anubis）": 1, "DAI（Polygon）": 1 };
  await Promise.all(Object.entries(PAIRS).map(async ([k, [chain, pair, daiIdx, dec]]) => {
    try {
      const w = (await rpc(CHAINS[chain], "eth_call", [{ to: pair, data: "0x0902f1ac" }, "latest"])).slice(2).match(/.{64}/g);
      out[k] = (Number(BigInt("0x" + w[daiIdx])) / 1e18) / (Number(BigInt("0x" + w[1 - daiIdx])) / 10 ** dec);
    } catch (e) { /* 读不到这个币的价格就不折算它 */ }
  }));
  return out;
}
const daiOf = (m, px) => Object.entries(m).reduce((t, [k, v]) => t + (px[k] ? v * px[k] : 0), 0);
const dai2 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// items：这一批的发放（带链上链接）；day：全天合计（按币种）；end < start + 1 天 就是「到现在」的临时汇总
function notice(items, start, end, day, px, dayCount) {
  const partial = end - start < 86400, d = bjDate(start), n = dayCount || items.length;
  const lines = ["📋 AiLGNS 运营费用发放公告", "", `⏱ 统计时段：${d} ${partial ? "00:00–" + bjHour(end) + "（到现在）" : "全天 00:00–24:00"}（北京时间）`, "",
    `💰 ${d} ${partial ? "今天到现在" : "全天"}收入 ${n} 笔，合计：`, ...listSum(day)];
  const total = daiOf(day, px || {});
  if (total) lines.push(`≈ 折合约 ${dai2(total)} DAI（按 DEX 现价）`);
  lines.push("", "👥 按 4 : 3 : 3 分配，每份：", ...shareLines(day).map((l, i) => (total ? l + `（≈ ${dai2(total * SHARES[i][1])} DAI）` : l)));
  if (items.some((it) => it.link)) lines.push("", "🔗 转账记录：");
  items.filter((it) => it.link).slice(-5).forEach((it) => lines.push(`· ${amt(totalOf(it))} ${it.sym}：${it.link}`));
  if (items.length > 5 && items.some((it) => it.link)) lines.push(`  （只列最近 5 笔，共 ${items.length} 笔，都可在链上查询）`);
  // 内部运营群：我们是坚定的布道者（站长 2026-11-05 定），不写风险提醒，只写信念
  lines.push("", "💎 布道者宣言：请想尽一切办法多囤 AiLGNS！", "· 收到的每一份运营费，第一时间换成 AiLGNS，一枚都不要卖", "· 我们的目标：AiLGNS 未来价值 100 万美金一枚", "· 拿得住的人才配得上这个结果，坚定信心，一起见证 👉 https://ailgns.dev/#/otc");
  lines.push("", "运营费用来自 AiLGNS 服务站的会员服务与 OTC 交易服务费。", "—— AiLGNS 服务站");
  return lines.join("\n");
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function scan(c, from, latest, items) {
  for (let b = from; b <= latest; b += c.span) {
    const to = Math.min(latest, b + c.span - 1);
    const logs = await rpc(c, "eth_getLogs", [{ address: [c.contract, c.name === "Anubis" && BUYBACK].filter(Boolean), fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [SPLIT] }]);
    for (const l of logs) {
      const tok = "0x" + l.topics[1].slice(26), [sym, dec] = TOKENS[tok] || ["?", 18], d = l.data.slice(2).match(/.{64}/g);
      const bb = l.address.toLowerCase() === BUYBACK; // 回购合约三份都转出去；旧合约第三份留在原钱包
      const out = (Number(BigInt("0x" + d[1])) + Number(BigInt("0x" + d[2])) + (bb ? Number(BigInt("0x" + d[3])) : 0)) / 10 ** dec;
      const blk = await rpc(c, "eth_getBlockByNumber", [l.blockNumber, false]);
      items.push({ chain: c.name, sym, out, total: Number(BigInt("0x" + d[0])) / 10 ** dec, link: c.tx + l.transactionHash, time: parseInt(blk.timestamp, 16) });
    }
  }
}

// 每 5 分钟：把新的发放记录攒进 opsw:pending；过了北京 0 点，把前一天全天的汇总发到运营群
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  ctx.waitUntil(gasWatch(ctx, kv).catch(() => {}));
  ctx.waitUntil(buildAdminStats(ctx.env, kv, ctx).then(() => buildPartner(ctx.env, kv, ctx)).catch(() => {})); // 🤝 合伙人面板：接着站长面板算（要用它的日表）
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1"; // dry=1[&anubisFrom=区块&polygonFrom=区块]：只看汇总的文字，不发、不记进度
  const now = Math.floor(Date.now() / 1000), slot = slotOf(now); // 今天北京 0 点
  // today=1 / day=2026-11-02：站长想马上看效果，把今天到现在（或前两天里某一整天）的汇总立刻发一次；每个日期最多手动发 3 次，防止被人刷群
  const pickDay = url.searchParams.get("day");
  if (url.searchParams.get("today") === "1" || /^\d{4}-\d{2}-\d{2}$/.test(pickDay || "")) {
    const today0 = Math.floor((now + 8 * 3600) / 86400) * 86400 - 8 * 3600;
    const dayStart = pickDay ? Date.parse(pickDay + "T00:00:00+08:00") / 1000 : today0, day = dayKey(dayStart), flag = "opsw:manual:" + day;
    if (!(dayStart <= today0 && dayStart >= today0 - 2 * 86400)) return Response.json({ error: "只能发今天或前两天" }, { status: 400 });
    const end = dayStart === today0 ? now : dayStart + 86400;
    const used = parseInt((await kv.get(flag)) || "0", 10);
    if (used >= 3) return Response.json({ error: "这个日期已经手动发过 3 次了" }, { status: 429 });
    const sent0 = (await kv.get("opsw:day:" + day, "json")) || [], pend = ((await kv.get("opsw:pending", "json")) || []).filter((x) => x.time >= dayStart && x.time < end);
    const all = sent0.concat(pend);
    if (!all.length) return Response.json({ error: "这天没有收入" });
    const text = notice(all, dayStart, end, sum(all), await prices());
    await kv.put(flag, String(used + 1), { expirationTtl: 3 * 86400 });
    await sendDebox(ctx.env, OPS_GROUP, text, "group");
    return Response.json({ sent: true, text });
  }
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
  const due = pending.filter((x) => x.time < slot && x.time >= slot - SLOT); // 昨天（北京时间）全天的发放
  if (!dry && (slot <= last || !due.length)) {
    if (slot > last) { await kv.put("opsw:slot", String(slot)); await kv.put("opsw:pending", JSON.stringify(pending.filter((x) => x.time >= slot))); } // 昨天没有发放：不发公告
    return Response.json({ ranges, pending: pending.length, next: slot + SLOT });
  }
  // 预览：把攒着的全部当作一段来看
  const batch = dry ? pending.filter((x) => x.time >= slot) : due, start = dry ? slot : slot - SLOT, end = dry ? slot + SLOT : slot;
  if (!batch.length) return Response.json({ ranges, pending: 0, text: null });
  const day = dayKey(start), dayItems = ((await kv.get("opsw:day:" + day, "json")) || []).concat(dry ? [] : batch.map((x) => ({ sym: x.sym, chain: x.chain, out: x.out, total: totalOf(x) })));
  const text = notice(batch, start, dry ? now : end, sum(dry ? dayItems.concat(batch) : dayItems), await prices(), dry ? dayItems.length + batch.length : dayItems.length);
  if (dry) return Response.json({ ranges, pending: pending.length, text });
  let sent = true, err = null; // 2026-11-07 站长：运营费用公告暂停（分账也停了），记录照常落盘，后台看 // 停发的那天：当作已发，记录照常落盘
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
