// 内部群日报：每天北京时间 9 点后，把前一天的访问、查询、挂单、成交、会员付款汇总发到内部运营群（只发这个群，不发行情群）
// 定时任务每 5 分钟调用一次：链上数据分段往前读（落后时每次都读，追上后每小时读一次），按北京日期记进 st:d:<日期>；
// 访问、查询次数由 /api/hit 记（lib/stats.js）。?dry=1[&day=2026-10-31]：只看日报文字，不发
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox } from "../../lib/debox.js";
import { bjDay, counts } from "../../lib/stats.js";

const OPS_GROUP = "uqw6tsqb"; // 内部运营群（不要和行情群 oes8etcm、fvg4wksw 混用）
const ENABLED = true; // 2026-11-01 站长确认模板后打开
const FIRST_DAY = "2026-11-01"; // 访问统计 10-31 晚上才上线：从 11-01 整天开始发
const SEND_HOUR = 9; // 北京时间几点后发前一天的日报
const POLY_RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"];
const CHAINS = { anubis: { rpcs: RPCS, span: 5000, name: "Anubis" }, polygon: { rpcs: POLY_RPCS, span: 2000, name: "Polygon" } };
const MARKETS = [
  { key: "ailgns", name: "AiLGNS", chain: "anubis", otc: "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", deploy: 17798035 },
  { key: "lgns", name: "LGNS（Anubis）", chain: "anubis", otc: "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818", deploy: 17936478 },
  { key: "plgns", name: "LGNS（Polygon）", chain: "polygon", otc: "0x4060f38d3e837843b69014d9f85ecfb3e29fa2db", deploy: 96510526 },
  { key: "glgns", name: "gLGNS（Anubis）", chain: "anubis", otc: "0x2b0ab121d60f823fffc4cef75af26055df388e2b", deploy: 18004618 },
  { key: "nft", name: "AWAKE NFT 卡牌", chain: "anubis", nft: true, otc: "0x8c67912b3ed44f4512c2f22b7b2263f6659396ed", deploy: 18008025 } // AwakeNftEscrow：事件结构不同（见下面 NFT_*）
].filter((m) => m.otc);
const RECEIVER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 原收款钱包：会员费都转到这里
const PAY_TOKENS = { // 会员费能用的币
  anubis: { "0x4d1d808a081fdac440703b3765fc61f8028c06b8": ["LGNS", 9], "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb": ["AiLGNS", 18], "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14": ["DAI", 18] },
  polygon: { "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": ["DAI", 18], "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01": ["LGNS", 9] }
};
// 合约转进原收款钱包的是 OTC 手续费、像素墙收入，不是会员费
const NOT_MEMBER = new Set([...MARKETS.map((m) => m.otc), "0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c", "0x2b0ab121d60f823fffc4cef75af26055df388e2b"]);
const CREATED = "0xabeda1aaf527ebcdd00999e25c2ae410eec4a6098fe233573eb8d956dd149bff"; // Created(id, maker, sellAilgns, give, want, expiry)
// 卡牌托管合约：Created(id, maker, sell, tokenId, price, expiry)、Filled(id, taker, tokenId, price, fee)
const NFT_CREATED = "0xabeda1aaf527ebcdd00999e25c2ae410eec4a6098fe233573eb8d956dd149bff", NFT_FILLED = "0xdef4cdb91e8c5e2777b0bf9645ce2c7e0b64a3b3fb94e37c6d78cde1043f80cb";
const FILLED = "0x69c74c6fcd53500d036d8a37cc9514fb69b660b99d36728e8aba82e7a53b055d"; // Filled(id, taker, amount, paid, fee, giveLeft)
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BUDGET = 40; // 每次调用最多访问节点多少次（免费版 Worker 一次最多 50 个外部请求）

const pad = (a) => "0x" + a.slice(2).padStart(64, "0");
const words = (h) => (h.slice(2).match(/.{64}/g) || []).map((w) => BigInt("0x" + w));
const dai = (v) => Number(v) / 1e18;
const money = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 4 });

function emptyDay() { return { orders: 0, orderDai: 0, makers: [], fills: 0, fillDai: 0, takers: [], m: {}, pays: [] }; }

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1";
  const yesterday = bjDay(Date.now() - 86400e3);
  if (dry) return Response.json({ text: await report(kv, url.searchParams.get("day") || yesterday) });

  const scan = await catchUp(kv).catch((e) => ({ behind: true, error: String((e && e.stack) || e).slice(0, 400) }));
  let sent = null, err = null;
  const hour = new Date(Date.now() + 8 * 3600e3).getUTCHours();
  if (ENABLED && yesterday >= FIRST_DAY && hour >= SEND_HOUR && !scan.behind && (await kv.get("st:sent")) !== yesterday) {
    try {
      await sendDebox(ctx.env, OPS_GROUP, await report(kv, yesterday), "group");
      await kv.put("st:sent", yesterday);
      sent = yesterday;
    } catch (e) { err = String(e.message || e).slice(0, 200); }
  }
  return Response.json({ ...scan, sent, err });
}

// ---------- 读链：挂单、成交、会员付款，按北京日期记 ----------
async function catchUp(kv) {
  let budget = BUDGET;
  const rpc = async (chain, method, params) => {
    const list = CHAINS[chain].rpcs;
    let e;
    for (let k = 0; k < list.length * 2; k++) { // 每个节点试两次（publicnode 偶尔从 Cloudflare 调会失败）
      if (k && budget <= 1) break;
      budget--; // 每次 fetch 都算（免费版每次调用最多 50 次子请求）
      try {
        const r = await fetch(list[k % list.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      } catch (x) { e = x; }
    }
    throw e;
  };
  const st = (await kv.get("st:cur", "json")) || { cur: {}, sides: {} };
  const latest = {};
  for (const c of Object.keys(CHAINS)) latest[c] = parseInt(await rpc(c, "eth_blockNumber", []), 16);
  // 追上之后每小时读一次就够了（每次读一段，省节点请求和 KV 写入）
  const behindOf = (k, c) => (st.cur[k] || 0) < latest[c] - CHAINS[c].span;
  const anyBehind = MARKETS.some((m) => behindOf(m.key, m.chain)) || Object.keys(CHAINS).some((c) => behindOf("pay_" + c, c));
  if (!anyBehind && new Date().getUTCMinutes() >= 5) return { behind: false, skipped: true };

  const days = {}, ts = {};
  const dayOf = async (chain, block) => {
    const k = chain + block;
    if (!ts[k]) ts[k] = parseInt((await rpc(chain, "eth_getBlockByNumber", ["0x" + block.toString(16), false])).timestamp, 16);
    const d = bjDay(ts[k] * 1000);
    if (!days[d]) days[d] = (await kv.get("st:d:" + d, "json")) || emptyDay();
    return days[d];
  };
  const errors = [];
  const tot = (await kv.get("st:tot", "json")) || { orders: 0, orderDai: 0, fills: 0, fillDai: 0 };
  // 一段一段读；预算不够时停在已处理完的区块，下次接着读
  async function walk(key, chain, start, query, handle) {
    try { await walk1(key, chain, start, query, handle); } catch (e) { errors.push(key + ": " + String((e && e.message) || e).slice(0, 120)); } // 一条链出错不影响别的
  }
  async function walk1(key, chain, start, query, handle) {
    let from = (st.cur[key] || start - 1) + 1;
    while (from <= latest[chain] && budget > 3) {
      const to = Math.min(latest[chain], from + CHAINS[chain].span - 1);
      const logs = (await rpc(chain, "eth_getLogs", [{ ...query, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]))
        .sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
      let done = to;
      for (let i = 0; i < logs.length; i++) {
        const b = parseInt(logs[i].blockNumber, 16);
        if (budget <= 1 && !ts[chain + b]) { done = b - 1; break; } // 没预算查这个区块的时间了：这个区块下次再处理
        let d;
        try { d = await dayOf(chain, b); } catch (e) { if (ts[chain + b]) throw e; done = b - 1; break; } // 查不到区块时间：从这个区块开始下次再处理，不会重复计数
        await handle(logs[i], d);
      }
      st.cur[key] = done;
      if (done < to) break;
      from = to + 1;
    }
  }
  for (const m of MARKETS) {
    const sides = st.sides[m.key] || "";
    let s = sides;
    await walk(m.key, m.chain, m.deploy, { address: m.otc, topics: [m.nft ? [NFT_CREATED, NFT_FILLED] : [CREATED, FILLED]] }, async (l, d) => {
      const id = Number(BigInt(l.topics[1])), w = words(l.data), mm = d.m[m.key] || (d.m[m.key] = { orders: 0, orderDai: 0, fills: 0, fillDai: 0 });
      if (m.nft) { // 卡牌：整张成交，金额就是成交价（DAI）
        if (l.topics[0] === NFT_CREATED) {
          const v = dai(w[2]), maker = "0x" + l.topics[2].slice(26);
          d.orders++; d.orderDai += v; mm.orders++; mm.orderDai += v; tot.orders++; tot.orderDai += v;
          if (!d.makers.includes(maker)) d.makers.push(maker);
        } else {
          const v = dai(w[1]), taker = "0x" + l.topics[2].slice(26);
          d.fills++; d.fillDai += v; mm.fills++; mm.fillDai += v; tot.fills++; tot.fillDai += v;
          if (!d.takers.includes(taker)) d.takers.push(taker);
        }
        return;
      }
      if (l.topics[0] === CREATED) {
        const sell = w[0] === 1n, v = dai(sell ? w[2] : w[1]), maker = "0x" + l.topics[2].slice(26);
        s = s.padEnd(id, "?").slice(0, id) + (sell ? "1" : "0") + s.slice(id + 1);
        d.orders++; d.orderDai += v; mm.orders++; mm.orderDai += v; tot.orders++; tot.orderDai += v;
        if (!d.makers.includes(maker)) d.makers.push(maker);
      } else {
        let side = s[id];
        if (side !== "0" && side !== "1") { // 没见过挂单记录（不应该发生）：直接问合约
          const o = words(await rpc(m.chain, "eth_call", [{ to: m.otc, data: "0xd09ef241" + id.toString(16).padStart(64, "0") }, "latest"]));
          side = o[1] === 1n ? "1" : "0";
        }
        const v = dai(side === "1" ? w[1] : w[0]), taker = "0x" + l.topics[2].slice(26); // 卖单：吃单人付的 DAI；买单：吃单人拿走的 DAI
        d.fills++; d.fillDai += v; mm.fills++; mm.fillDai += v; tot.fills++; tot.fillDai += v;
        if (!d.takers.includes(taker)) d.takers.push(taker);
      }
    });
    st.sides[m.key] = s;
  }
  // 会员付款：转进原收款钱包的会员费币（第一次从大约一天前开始读）
  for (const [chain, toks] of Object.entries(PAY_TOKENS)) {
    const k = "pay_" + chain, back = chain === "polygon" ? 45000 : 50000;
    await walk(k, chain, latest[chain] - back, { address: Object.keys(toks), topics: [TRANSFER, null, pad(RECEIVER)] }, async (l, d) => {
      const from = "0x" + l.topics[1].slice(26);
      if (NOT_MEMBER.has(from)) return;
      const [sym, dec] = toks[l.address.toLowerCase()];
      if (!d.pays.some((p) => p.tx === l.transactionHash)) d.pays.push({ from, sym, chain, amt: Number(BigInt(l.data)) / 10 ** dec, tx: l.transactionHash });
    });
  }
  for (const [d, v] of Object.entries(days)) await kv.put("st:d:" + d, JSON.stringify(v), { expirationTtl: 90 * 86400 });
  await kv.put("st:tot", JSON.stringify(tot));
  await kv.put("st:cur", JSON.stringify(st));
  const behind = MARKETS.some((m) => behindOf(m.key, m.chain)) || Object.keys(CHAINS).some((c) => behindOf("pay_" + c, c));
  return { behind, cur: st.cur, budgetLeft: budget, ...(errors.length ? { errors } : {}) };
}

// ---------- 日报文字 ----------
async function report(kv, day) {
  const [d0, c, tot, vip] = await Promise.all([kv.get("st:d:" + day, "json"), counts(kv, day), kv.get("st:tot", "json"), kv.get("st:v:" + day, "json")]);
  const d = d0 || emptyDay(), t = tot || { orders: 0, orderDai: 0, fills: 0, fillDai: 0 };
  const [y, mo, da] = day.split("-").map(Number);
  const q = (k) => c["q_" + k] || 0;
  const lines = [`📊 AiLGNS 服务站日报 · ${mo}月${da}日（北京时间）`, ""];
  lines.push("👀 访问", `· 访问人数：${c.uv || 0}（按设备去重）`, `· 访问次数：${c.pv || 0}`, "");
  const qAll = q("member") + q("wallet") + q("team") + q("growth") + q("tree") + q("upline");
  lines.push(`🔍 查询：${qAll} 次`, `· 会员查询 ${q("member")} · 钱包快查 ${q("wallet")} · 团队与等级 ${q("team")}`, `· 团队新增业绩 ${q("growth")} · 团队结构图 ${q("tree")} · 上级查询 ${q("upline")}`, "");
  lines.push("📝 挂单", `· 新挂单：${d.orders} 张，${d.makers.length} 个地址，共 ${money(d.orderDai)} DAI`);
  lines.push("", "🤝 成交", `· 成交：${d.fills} 笔，${d.takers.length} 个吃单地址，共 ${money(d.fillDai)} DAI`);
  for (const m of MARKETS) {
    const x = d.m[m.key];
    if (x && (x.orders || x.fills)) lines.push(`  ${m.name}：挂单 ${x.orders} 张 ${money(x.orderDai)} DAI · 成交 ${x.fills} 笔 ${money(x.fillDai)} DAI`);
  }
  lines.push(`· 累计总成交：${money(t.fillDai)} DAI（${t.fills} 笔）`, `· 累计总挂单：${t.orders} 张`, "");
  // 会员付款、赠送 VIP 只报数量，不列地址
  const bySym = {};
  for (const p of d.pays) bySym[p.sym] = (bySym[p.sym] || 0) + p.amt;
  const paySum = Object.entries(bySym).map(([s, a]) => `${amt(a)} ${s}`).join(" + ");
  lines.push(`👑 会员付款：${d.pays.length} 笔` + (paySum ? `，共 ${paySum}` : ""));
  lines.push(`🎁 OTC 成交赠送初级 VIP：${(vip || []).length} 个`);
  return lines.join("\n");
}
