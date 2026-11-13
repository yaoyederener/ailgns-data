// OTC 挂单动态通知：定时任务每 5 分钟调用一次，读各市场托管合约新的成交 / 撤单 / 到期退回事件。
// 市场：AiLGNS（Anubis）、LGNS（Anubis）、LGNS（Polygon），合约代码相同，各链各一份
// ① 私信：按钱包地址找到在 DeBox 机器人里绑定过的用户，通知挂单人（成交时也通知吃单人）
// ② 每小时播报：累计成交 + 本小时新增 + 合约安全 + 高价求购单 + 初心，整点发到 DeBox 群（没成交也没好求购单就不发）
// ③ 好单私信：比 DEX 买得便宜的出售单，私信关注机器人的人（一小时最多一次）；营销群里的好单合进每小时播报
//    群 gid 默认是下面 GROUPS 里的两个群，也可以用 Cloudflare 环境变量 DEBOX_GROUP_ID（多个用逗号隔开）覆盖
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox, sendDeboxFans } from "../../lib/debox.js";
import { pushMany } from "../../lib/inbox.js";
import { addRebate, sampleLiquidity } from "../../lib/lp.js";
import { rebuildIfNeeded } from "../../lib/pixel.js";
import { bjDay } from "../../lib/stats.js";
import { GP_MAX, SEED } from "../../lib/guide.js";
import { addVol } from "../../lib/rank.js";
import { addHonor } from "../../lib/honor.js";
import { nmTop } from "../../lib/nmtop.js";
import { oracleNotify } from "../../lib/ornotify.js";

// kv：进度等 KV 键的前缀（AiLGNS 沿用原来的键）；deploy：合约部署区块，第一次运行从这里开始读；otc 空着 = 还没部署，跳过
// pd：单价显示几位小数；dex：AiLGNS 才说「比官方 DEX 买更便宜」（LGNS 在 DEX 买不扣税，不这么说）
// sellTax：LGNS 在 DEX 卖出扣的手续费（Polygon 固定 5%，Anubis 动态，常见 50% 左右），求购单推送时提一句
const POLYGON_RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"];
export const MARKETS = [
  { key: "ailgns", sym: "AiLGNS", chain: "Anubis", otc: "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", dec: 18, rpcs: RPCS, tx: "https://ailgns.dev/#/scan/",
    pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", pairDai: 1, pd: 2, kv: "otcw:", deploy: 17798035, backfill: true, dex: true, link: "https://ailgns.dev/#/otc" },
  { key: "lgns", sym: "LGNS", chain: "Anubis", otc: "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818", dec: 9, rpcs: RPCS, tx: "https://ailgns.dev/#/scan/",
    pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", pairDai: 1, pd: 4, kv: "otcw:lgns:", deploy: 17936478, sellTax: "约 50%（动态）", link: "https://ailgns.dev/#/otc/lgns" },
  { key: "plgns", sym: "LGNS", chain: "Polygon", otc: "0x4060f38d3e837843b69014d9f85ecfb3e29fa2db", dec: 9, rpcs: POLYGON_RPCS, tx: "https://polygonscan.com/tx/",
    pair: "0x882df4b0fb50a229c3b4124eb18c759911485bfb", pairDai: 0, pd: 4, kv: "otcw:plgns:", deploy: 96510526, sellTax: "5%", link: "https://ailgns.dev/#/otc/plgns" },
  // gLGNS（Anubis，18 位）：DEX 买卖不扣税
  { key: "glgns", sym: "gLGNS", chain: "Anubis", otc: "0x2b0ab121d60f823fffc4cef75af26055df388e2b", dec: 18, rpcs: RPCS, tx: "https://ailgns.dev/#/scan/",
    pair: "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", pairDai: 0, pd: 2, kv: "otcw:glgns:", deploy: 18004618, link: "https://ailgns.dev/#/otc/glgns" },
  // AWAKE NFT 卡牌（AwakeNftEscrow）：整张成交，价格就是成交 DAI；没有 DEX 市价，不推「低于市价好单」
  { key: "nft", sym: "AWAKE NFT", chain: "Anubis", nft: true, otc: "0x8c67912b3ed44f4512c2f22b7b2263f6659396ed", dec: 0, rpcs: RPCS, tx: "https://ailgns.dev/#/scan/", pd: 2, kv: "otcw:nft:", deploy: 18008025, link: "https://ailgns.dev/#/otc/nft" },
  // 域名市场（同一份 AwakeNftEscrow 代码）：成交通知里显示名字（从域名合约 labelOf 读），不显示编号
  { key: "nm_ailgns", sym: ".ailgns 域名", kind: "域名", chain: "Anubis", nft: true, otc: "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e", names: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", tld: "ailgns", dec: 0, rpcs: RPCS, tx: "https://ailgns.dev/#/scan/", pd: 2, kv: "otcw:nma:", deploy: 18161704, link: "https://ailgns.dev/#/names/otc" },
  { key: "nm_lgns", sym: ".lgns 域名", kind: "域名", chain: "Anubis", nft: true, otc: "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d", names: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3", tld: "lgns", dec: 0, rpcs: RPCS, tx: "https://ailgns.dev/#/scan/", pd: 2, kv: "otcw:nml:", deploy: 18161717, link: "https://ailgns.dev/#/names/otc" },
].filter((m) => m.otc);
const SITE = "https://ailgns.dev/#/otc";
// 币名：LGNS 两条链都有，带上链名
const label = (m) => (m.key === "ailgns" ? m.sym : `${m.sym}（${m.chain}）`);
const FILLED = "0x69c74c6fcd53500d036d8a37cc9514fb69b660b99d36728e8aba82e7a53b055d"; // Filled(id, taker, amount, paid, fee, giveLeft)
const CLOSED = "0xec091cd14d8a8ba29bf6a14340c9c648295a414a131bd9ad694b621358842776"; // Closed(id, maker, refunded, expired)
// 卡牌托管合约的事件：Filled(id, taker, tokenId, price, fee)、Closed(id, maker, expired)
const NFT_FILLED = "0xdef4cdb91e8c5e2777b0bf9645ce2c7e0b64a3b3fb94e37c6d78cde1043f80cb", NFT_CLOSED = "0xecbcc0f69172bf54c6cc02c6b099b70f146b61086ecdbc4d1e3c44b4f689bbd6";
const filledTopic = (m) => (m.nft ? NFT_FILLED : FILLED), closedTopic = (m) => (m.nft ? NFT_CLOSED : CLOSED);
// 一笔成交的 DAI 金额（送会员、累计成交额用）：卡牌成交 = 成交价；代币成交：卖单看吃单人付的 DAI，买单看吃单人拿走的 DAI
const fillDai = (m, o, d) => (m.nft ? num(d[1]) : o.sell ? num(d[1]) : num(d[0]));
const GET_ORDERS = "0x8f72fc77", COUNT = "0x35daa731";
const GROUPS = ["fvg4wksw"]; // 站长 2026-11-08 定：只播「Ailgns OTC」这一个群（fvg4wksw）；8c62txey 机器人不在群里、oes8etcm 是旧群，都不要了
const BACKFILL_STEPS = 6; // 每次最多补查几段（每段 5000 个块），几轮就补完

// 在 OTC 成交过的地址（挂单被吃的挂单人 + 吃单人）记下来，并累计成交额（DAI）：
// otct:<地址> 记所有成交；送会员只看 otcq:<地址>：单笔成交满 50 DAI 才算（防小额刷单刷会员），满一笔送初级 VIP，累计满 1 万 DAI 送高级 VIP
// 三个市场的成交额合并累计（DAI 两条链都是 18 位）
const VIP_MIN_FILL = 50;
const OLD_VIP_CUTOFF = { anubis: 17967579, polygon: 96531101 }; // 和 functions/api/member.js 的 OTC_VIP_CUTOFF 一样
async function markTraders(m, kv, logs, cache, live = false) {
  const deltas = {}; // 这批新成交给排行榜加的量
  for (const l of logs) {
    if (l.topics[0] !== filledTopic(m)) continue;
    const key = "otcf:" + l.transactionHash + ":" + parseInt(l.logIndex, 16);
    if (await kv.get(key)) continue; // 记过了（补记和正常进度会有重叠）
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(m, id)), d = words(l.data);
    const vol = fillDai(m, o, d);
    for (const a of new Set([o.maker, "0x" + l.topics[2].slice(26)])) {
      const r = (await kv.get("otct:" + a, "json")) || { id, tx: l.transactionHash, block: parseInt(l.blockNumber, 16), chain: m.chain.toLowerCase() };
      r.vol = (r.vol || 0) + vol;
      r.n = (r.n || 0) + 1;
      await kv.put("otct:" + a, JSON.stringify(r));
      const d = deltas[a] || (deltas[a] = [0, 0]);
      d[0] += vol;
      d[1] += 1;
    }
    await kv.put(key, "1");
  }
  await addVol(kv, deltas);
  await markVip(m, kv, logs, cache, live);
}
// live：正常进度读到的新成交（补记以前的成交时不算），新送出的初级 VIP 记进 st:v:<北京日期>，内部群日报用
async function markVip(m, kv, logs, cache, live = false) {
  const hd = {}; // 荣耀榜（总榜 / 月榜）这批新加的量
  for (const l of logs) {
    if (l.topics[0] !== filledTopic(m)) continue;
    const key = "otcq:f:" + l.transactionHash + ":" + parseInt(l.logIndex, 16);
    if (await kv.get(key)) continue;
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(m, id)), d = words(l.data);
    const vol = fillDai(m, o, d);
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
        const h = hd[a] || (hd[a] = [0, 0]);
        h[0] += vol;
        h[1] += 1;
      }
    }
    await kv.put(key, "1");
  }
  await addHonor(kv, hd, live);
}
// 加了 50 DAI 门槛后，三个市场以前的成交从部署区块起重新补记一遍（只补 otcq，otct 已经记过）
// ---------- 按地址记成交（客户在「成交查询」里按地址查）：tr:<地址> 最多存最近 300 条 ----------
const TR_MAX = 300, tsCache = {};
async function blockTime(m, bn) {
  const k = m.chain + bn;
  if (!tsCache[k]) tsCache[k] = parseInt((await rpc(m, "eth_getBlockByNumber", ["0x" + bn.toString(16), false])).timestamp, 16);
  return tsCache[k];
}
// 预言家「贡献榜」：按北京日、按市场记每个地址付的手续费（币 OTC 吃单方付 1%，卡牌买家付 3%，都按 DAI 金额算）→ or:fee:<日>:<市场> = { 地址: DAI }
const feeDay = (ts) => new Date((ts + 8 * 3600) * 1000).toISOString().slice(0, 10);
const SWEEP_ROUTER = "0x6ec474047a6c12d0cab53855a990c1c8b3996c20", MATCHER = "0xdcc5354175d60ffc8364e71e792fcd66366f00fe";
async function addFee(kv, rec, m) {
  let payer = rec.nft ? (rec.makerSide === "卖" ? rec.taker : rec.maker) : rec.taker;
  if (payer === MATCHER) return; // 我们自己的撮合机器人，不计贡献
  if (payer === SWEEP_ROUTER && m && rec.tx) { // 批量扫单：手续费是发起这笔交易的人付的，记到他名下
    try { const t = await rpc(m, "eth_getTransactionByHash", [rec.tx]); if (t && t.from) payer = String(t.from).toLowerCase(); else return; } catch (e) { return; }
  }
  const fee = Math.round(rec.dai * (rec.nft ? 0.03 : 0.01) * 100) / 100;
  if (!(fee > 0) || !payer) return;
  const k = "or:fee:" + feeDay(rec.t) + ":" + rec.m, f = (await kv.get(k, "json")) || {};
  f[payer] = Math.round(((f[payer] || 0) + fee) * 100) / 100;
  await kv.put(k, JSON.stringify(f));
}
async function recordTrades(m, kv, logs, cache) {
  for (const l of logs) {
    if (l.topics[0] !== filledTopic(m)) continue;
    const key = "tr:f:" + l.transactionHash + ":" + parseInt(l.logIndex, 16);
    if (await kv.get(key)) continue;
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(m, id)), d = words(l.data), taker = "0x" + l.topics[2].slice(26), bn = parseInt(l.blockNumber, 16);
    const ts = await blockTime(m, bn);
    let rec;
    if (m.nft) {
      const price = num(d[1]);
      rec = { m: m.key, id, t: ts, tx: l.transactionHash, sym: m.sym, nft: true, tokenId: BigInt("0x" + d[0]).toString(), dai: price, maker: o.maker, taker, makerSide: o.sell ? "卖" : "买" };
    } else {
      const gd = o.sell ? m.dec : 18, wd = o.sell ? 18 : m.dec, amount = num(d[0], gd), paid = num(d[1], wd);
      const qty = o.sell ? amount : paid, dai = o.sell ? paid : amount; // 挂单币数量 / DAI 金额
      rec = { m: m.key, id, t: ts, tx: l.transactionHash, sym: m.sym, qty, dai, price: qty ? dai / qty : 0, maker: o.maker, taker, makerSide: o.sell ? "卖" : "买" };
    }
    await addFee(kv, rec, m).catch(() => {});
    await addRebate(kv, rec).catch(() => {}); // 💧 做市返佣记账（挂单方 70%）
    // AiLGNS/DAI 真实成交记录（全站一份，最近 300 笔）：预言家奖池用「24 小时真实成交最高价」做预言机
    // 2026-11-12 起 LGNS 也记一份（otc:fills:lgns），给 LGNS 盘口的「最近成交」用；预言家只读 ailgns 那份
    if ((m.key === "ailgns" || m.key === "lgns") && rec.price > 0 && rec.dai >= 0.5) {
      const fk = "otc:fills:" + m.key, pr = m.key === "ailgns" ? 1000 : 1e6, fl = (await kv.get(fk, "json")) || [];
      if (!fl.some((x) => x.tx === rec.tx && x.id === rec.id)) { fl.unshift({ t: rec.t, px: Math.round(rec.price * pr) / pr, dai: rec.dai, tx: rec.tx, id: rec.id, mk: rec.maker }); await kv.put(fk, JSON.stringify(fl.slice(0, 300))); }
    }
    for (const a of new Set([o.maker, taker])) {
      const list = (await kv.get("tr:" + a, "json")) || [];
      if (!list.some((x) => x.tx === rec.tx && x.id === rec.id && x.m === rec.m)) { list.unshift(rec); await kv.put("tr:" + a, JSON.stringify(list.slice(0, TR_MAX))); }
    }
    await kv.put(key, "1");
  }
}
// 指导价素材：新成交的单价 ÷ 现在的 DEX 市价，按挂单方向记进 gp:<市场>（最近 30 笔）
async function recordGuide(m, kv, logs, cache) {
  if (m.nft || !m.pair) return;
  const fills = logs.filter((l) => l.topics[0] === filledTopic(m));
  if (!fills.length) return;
  const px = (await market(m)).px, g = (await kv.get("gp:" + m.key, "json")) || SEED[m.key] || { sell: [], buy: [] };
  for (const l of fills) {
    const id = parseInt(l.topics[1], 16), o = cache[id] || (cache[id] = await order(m, id)), d = words(l.data);
    const gd = o.sell ? m.dec : 18, wd = o.sell ? 18 : m.dec, amount = num(d[0], gd), paid = num(d[1], wd);
    const qty = o.sell ? amount : paid, dai = o.sell ? paid : amount;
    if (!qty || !dai || dai < 0.5) continue; // 零头成交不算
    const s = o.sell ? "sell" : "buy";
    g[s] = [...(g[s] || []), Math.round((dai / qty / px) * 10000) / 10000].slice(-GP_MAX);
  }
  await kv.put("gp:" + m.key, JSON.stringify(g));
}
// 以前的成交一段段补进 tr:<地址>（每次运行补几段，补到接上为止）
async function backfillTrades(m, kv, upto, cache) {
  const sk = m.kv + "tr:scan";
  let b = parseInt((await kv.get(sk)) || String(m.deploy - 1), 10) + 1;
  const span = m.chain === "Polygon" ? 2000 : 5000;
  for (let i = 0; i < 3 && b <= upto; i++) { // 每段里每笔成交要查一次区块时间，所以一次只补 3 段，免得超子请求上限
    const to = Math.min(upto, b + span - 1);
    await recordTrades(m, kv, await rpc(m, "eth_getLogs", [{ address: m.otc, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [filledTopic(m)] }]), cache);
    await kv.put(sk, String(to));
    b = to + 1;
  }
}
async function backfillVip(m, kv, upto, cache) {
  const sk = m.kv + "otcq:scan";
  let b = parseInt((await kv.get(sk)) || String(m.deploy - 1), 10) + 1;
  const span = m.chain === "Polygon" ? 2000 : 5000;
  for (let i = 0; i < BACKFILL_STEPS && b <= upto; i++) {
    const to = Math.min(upto, b + span - 1);
    await markVip(m, kv, await rpc(m, "eth_getLogs", [{ address: m.otc, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [filledTopic(m)] }]), cache);
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
    await markTraders(m, kv, await rpc(m, "eth_getLogs", [{ address: m.otc, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [filledTopic(m)] }]), cache);
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

// 成交通知里怎么称呼这件东西：域名显示「xxx.ailgns」，卡牌显示「AWAKE NFT #编号」
async function itemName(m, tokenId) {
  if (!m.names) return "AWAKE NFT #" + tokenId;
  try {
    const h = (await rpc(m, "eth_call", [{ to: m.names, data: "0x36bf1f0c" + u256(tokenId) }, "latest"])).slice(2);
    const len = parseInt(h.slice(64, 128), 16), bytes = new Uint8Array(h.slice(128, 128 + len * 2).match(/.{2}/g).map((x) => parseInt(x, 16)));
    return new TextDecoder().decode(bytes) + "." + m.tld;
  } catch (e) { return m.sym + " #" + tokenId.slice(0, 8) + "…"; }
}

async function order(m, id) {
  const w = words(await rpc(m, "eth_call", [{ to: m.otc, data: GET_ORDERS + u256(id) + u256(1) }, "latest"]));
  const o = w.slice(2, 9); // 代币 7 个字、卡牌 6 个字，前两个字（maker、sell）一样
  return { maker: "0x" + o[0].slice(24), sell: BigInt("0x" + o[1]) === 1n, tokenId: m.nft ? BigInt("0x" + o[4]).toString() : null,
    give: m.nft ? 0n : BigInt("0x" + o[4]), want: m.nft ? 0n : BigInt("0x" + o[5]) }; // 代币单：挂单总量、想换回的总量
}

// ---------- 有利润的好单：实时推送到营销群 + 关注机器人的人 ----------
// 币价一动，原来挂着的单就可能变成"买了就赚 / 卖了更赚"的好单，每 5 分钟检查一次：
//   卖单（客户买币）：按 OTC 单价买（到手扣 1% 手续费），和在 DEX 买同样多的币要花多少比，省得多就推；买下后马上在 DEX 卖掉还有钱赚的，写出约赚多少
//   买单（客户卖币）：卖给这张单拿到的 DAI（扣 1%），和在 DEX 卖同样多的币（扣卖出税、按池子深度算滑点）比，多得多就推；从 DEX 买币再卖给这张单有钱赚的，写出约赚多少
// 都按池子当前储备精确算（含 0.3% 池子手续费和滑点），不是简单比市价
// 每张单推一次；之后币价继续往有利方向走、好处又多了 3 个百分点以上（且隔了 30 分钟），再推一次
const PP_ON = false; // 2026-11-06 站长：营销群播报全部停掉，机器人只做客服。好单推送关
const GROUP_BROADCAST = false; // 2026-11-06 站长：群里不再发自我介绍等营销内容；私信通知（个人成交、到期）照发
const HOURLY_ON = true; // 2026-11-08 站长：每小时成交播报重新上线（很多人不知道）：只报累计笔数 + 0 出错 + 好单推荐，不带营销话；夜里 23–8 点不发
const PP_MIN_PCT = 0.005, PP_MIN_DAI = 1, PP_AGAIN_PCT = 0.03, PP_AGAIN_SEC = 1800;
const PP_GAP = 3600; // 站长要求：好单播报全站一小时最多发一次（各市场共用一个间隔），每次最多 3 张
const OTC_FEE = 0.01;
const SELL_TAX = { ailgns: 0.03, lgns: 0.5, plgns: 0.05, glgns: 0 }; // DEX 卖出扣的税（不含池子 0.3%）；Anubis LGNS 是动态的，下面用实测值
async function sellTax(m) {
  if (m.key !== "lgns") return SELL_TAX[m.key] || 0;
  const j = await fetch("https://ailgns.dev/api/sell-tax").then((r) => r.json()).catch(() => null);
  return j && j.lgns > 0 && j.lgns < 0.95 ? j.lgns : SELL_TAX.lgns;
}
// DEX 池子储备：{ tok, dai, px（每枚币值多少 DAI）}
async function market(m) {
  const w = words(await rpc(m, "eth_call", [{ to: m.pair, data: "0x0902f1ac" }, "latest"]));
  const dai = num(w[m.pairDai]), tok = num(w[1 - m.pairDai], m.dec);
  return { tok, dai, px: dai / tok };
}
const ammSell = (p, q) => (q * 0.997 * p.dai) / (p.tok + q * 0.997); // 往池子卖 q 个币能拿到的 DAI
const ammBuyCost = (p, q) => (q >= p.tok ? Infinity : (p.dai * q) / ((p.tok - q) * 0.997)); // 从池子买到 q 个币要花的 DAI
// 当前在挂的单子（没过期、还有剩余）
export async function book(m, now) {
  const count = Number(BigInt(await rpc(m, "eth_call", [{ to: m.otc, data: COUNT }, "latest"]))), from = Math.max(0, count - 500), out = [];
  if (!count) return out;
  const w = words(await rpc(m, "eth_call", [{ to: m.otc, data: GET_ORDERS + u256(from) + u256(count - from) }, "latest"]));
  const n = Number(BigInt("0x" + w[1]));
  for (let i = 0; i < n; i++) {
    const o = w.slice(2 + i * 7, 9 + i * 7), sell = BigInt("0x" + o[1]) === 1n, open = BigInt("0x" + o[2]) === 1n, exp = Number(BigInt("0x" + o[3]));
    const gd = sell ? m.dec : 18, wd = sell ? 18 : m.dec; // 挂单存入的币 / 想换回的币各自的小数位
    const give = num(o[4], gd), want = num(o[5], wd), gl = num(o[6], gd);
    if (!open || exp <= now || gl < 1e-4 || (sell ? gl * want / give : gl) < 1) continue; // 剩余不足 1 DAI 的自动下架
    out.push({ id: from + i, sell, price: sell ? want / give : give / want, qty: sell ? gl : gl * want / give, left: exp - now, maker: "0x" + o[0].slice(24) });
  }
  return out;
}
// 一张单对客户有多划算：gain = 比走 DEX 多赚 / 少花的 DAI，pct = 占比，arb = 一买一卖立刻能赚的 DAI（没有就是 0）
function edge(o, p, tax) {
  if (o.sell) {
    const pay = o.qty * o.price, got = o.qty * (1 - OTC_FEE); // 付 DAI，到手的币扣 1%
    const dex = ammBuyCost(p, got), back = ammSell(p, got * (1 - tax));
    return { gain: dex - pay, pct: (dex - pay) / dex, arb: Math.max(0, back - pay), dexPrice: dex / got, buy: true, pay, got, dex, back };
  }
  const get = o.qty * o.price * (1 - OTC_FEE), dex = ammSell(p, o.qty * (1 - tax)), cost = ammBuyCost(p, o.qty); // 卖给这张单拿到的 DAI 扣 1%
  return { gain: get - dex, pct: dex > 0 ? (get - dex) / dex : 1, arb: Math.max(0, get - cost), dexPrice: dex / o.qty, buy: false, get, dex, cost };
}
const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? `${d}天${h}小时` : h ? `${h}小时${m}分` : `${Math.max(1, m)}分钟`; };
const d2 = (v, pd = 2) => v.toLocaleString("en-US", { minimumFractionDigits: pd, maximumFractionDigits: pd });
const qtyStr = (m, v) => v.toFixed(m.dec === 18 ? 4 : 2);
function dealText(m, list, p, tax) {
  const ns = list.filter((x) => x.o.sell).length, name = label(m), arb = list.some((x) => x.e.arb >= PP_MIN_DAI);
  const head = [arb ? `💰 ${name} OTC 出现买了就赚的单！` : ns === list.length ? `🔥 比 DEX 便宜的 ${name} 好单！` : ns ? `🔥 ${name} OTC 好单：比 DEX 买得便宜、卖得贵！` : `💰 手里有 ${name} 的看过来：在 OTC 卖给这张求购单，比在 DEX 卖多拿钱！`];
  const lines = [head[0], "👉 钱包打开：" + m.link];
  for (const { o, e } of list) {
    const pct = (e.pct * 100).toFixed(1);
    const q = qtyStr(m, o.qty);
    lines.push("", o.sell
      ? `📤 出售 ${q} ${m.sym} · 单价 ${d2(o.price, m.pd)} DAI\n` +
        `▶ 全部买下：付 ${d2(e.pay)} DAI，到手 ${qtyStr(m, e.got)} ${m.sym}（已扣 1% 手续费）\n` +
        `▶ 同样多的币在 DEX 买要 ${d2(e.dex)} DAI\n` +
        `✅ 你省下 ${d2(e.gain)} DAI（便宜 ${pct}%）` +
        (e.arb >= PP_MIN_DAI ? `\n💰 买下马上到 DEX 卖掉能拿回 ${d2(e.back)} DAI，净赚 ${d2(e.arb)} DAI` : "")
      : `📥 求购 ${q} ${m.sym} · 出价 ${d2(o.price, m.pd)} DAI\n` +
        `▶ 把 ${q} ${m.sym} 卖给这张单：到手 ${d2(e.get)} DAI（已扣 1% 手续费）\n` +
        `▶ 同样多的币在 DEX 卖只能拿 ${d2(e.dex)} DAI\n` +
        `✅ 你多赚 ${d2(e.gain)} DAI（多 ${pct}%）` +
        (e.arb >= PP_MIN_DAI ? `\n💰 没有币也能赚：先在 DEX 花 ${d2(e.cost)} DAI 买 ${q} ${m.sym}，再卖给这张单拿 ${d2(e.get)} DAI，净赚 ${d2(e.arb)} DAI` : ""));
    lines.push(`⏳ 还剩 ${dur(o.left)} · 订单 #${o.id}`);
  }
  const f = list[0], where = m.key === "ailgns" ? "DEX" : m.chain + " 链 DEX"; // DEX 价按第一张单的数量算上手续费和滑点，不报池子的裸价
  lines.push("", `📊 同样数量在${where}${f.o.sell ? "买入，实际每枚要付" : "卖出，实际每枚只到手"}约 ${d2(f.e.dexPrice, m.pd)} DAI（已算上 DEX 手续费和滑点，币价随时在变）`, "⚡ 先到先得，被别人吃掉就没了！", PROMO);
  return lines.join("\n");
}
// 找出该推的好单；send=false 时只返回文字（预览）
async function pushDeals(m, env, kv, send, gids = [], quiet = false) {
  if (m.nft) return { hits: 0, skipped: "nft" }; // 卡牌没有 DEX 市价，不推好单
  const now = Math.floor(Date.now() / 1000), [orders, p, tax] = await Promise.all([book(m, now), market(m), sellTax(m)]);
  const hits = orders.filter((o) => o.sell).map((o) => ({ o, e: edge(o, p, tax) })).filter((x) => x.e.pct >= PP_MIN_PCT && x.e.gain >= PP_MIN_DAI); // 求购单不实时推，放进每小时播报（站长要求）
  const fresh = [];
  for (const x of hits) {
    const prev = send ? await kv.get(m.kv + "pp:" + x.o.id, "json") : null; // 以前推过：{ pct, at }（老数据是 1）
    if (!prev || (typeof prev === "object" && x.e.pct >= prev.pct + PP_AGAIN_PCT && now - prev.at >= PP_AGAIN_SEC)) fresh.push(x);
  }
  fresh.sort((a, b) => b.e.arb - a.e.arb || b.e.gain - a.e.gain);
  const pick = fresh.slice(0, 3), text = pick.length ? dealText(m, pick, p, tax) : null;
  if (!send || !text) return { hits: hits.length, px: p.px, tax, text };
  if (await kv.get("otcw:ppgap")) return { hits: hits.length, waiting: fresh.length };
  const out = { hits: hits.length, sent: pick.length, groups: {} };
  // 营销群不再单独发好单：合进每小时播报（站长要求一小时只发一条）；这里只私信关注机器人的人
  await sendDeboxFans(env, GROUPS[0], text).catch((e) => { out.fans = String(e.message || e).slice(0, 120); });
  await kv.put("otcw:ppgap", "1", { expirationTtl: PP_GAP });
  for (const { o, e } of pick) await kv.put(m.kv + "pp:" + o.id, JSON.stringify({ pct: e.pct, at: now }), { expirationTtl: Math.max(60, Math.ceil(o.left) + 3600) });
  return out;
}

const PROMO = "🎁 交易就送会员，累计成交满 1 万 DAI 送高级 VIP";
// 群播报（站长 2026-11-10 定稿，每 4 小时一条）：① OTC 近 1 小时成交（不报累计） ② 域名累计注册 + 这段新增 ③ 创世域名免费预测 + 奖池 ④ 网址
// tot：KV st:tot 全站累计（daily-stats 攒的）；fills：上次播报以来的新成交；names：/api/name-genesis；pool：/api/oracle funds 算出的奖池钱包实际余额 { ail, dai }
// 群发结果记录（最近 20 次）：/api/otc-watch?bcdry=1 的 log 里能看到每次发没发成、DeBox 报了什么错
async function bcLog(kv, row) {
  try { const l = (await kv.get("bc:log", "json")) || []; l.push(row); await kv.put("bc:log", JSON.stringify(l.slice(-20))); } catch (e) { /* 记不上不影响播报 */ }
}
const BC_HOURS = [8, 12, 16, 20]; // 北京时间这几个整点各发一条（夜里不发）
function bcText(fills, tot, names, newNames, pool, until) {
  const hm = (t) => { const d = new Date(t + 8 * 3600e3); return d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
  const n0 = (v) => Math.round(v || 0).toLocaleString("en-US");
  // 站长 2026-11-10：不报累计成交（不想让人知道总量），只报近 1 小时；这一小时没有就报近 4 小时的
  const sumDai = (arr) => arr.reduce((s, f) => s + (f.nm ? Number(f.price) || 0 : (Number(f.qty) || 0) * (Number(f.price) || 0)), 0);
  const h1 = fills.filter((f) => f.t && f.t >= until - 3600e3), use = h1.length ? h1 : fills, span = h1.length ? "近 1 小时" : "近 4 小时";
  return [`📊 AiLGNS OTC 平台播报 · ${hm(until)}`, "",
    `1️⃣ OTC ${span}成交 ${use.length} 笔 · ${n0(sumDai(use))} DAI` + (use.length ? "" : "，欢迎挂单"),
    `2️⃣ 域名市场累计注册 ${n0(names)} 个` + (newNames > 0 ? `，近 4 小时新增 ${newNames} 个` : ""),
    `3️⃣ 持有创世域名免费参与预测，奖池已累计 ${pool.ail.toLocaleString("en-US", { maximumFractionDigits: 2 })} AiLGNS（约 ${n0(pool.dai)} DAI）`, "",
    "👉 网址：" + SITE].join("\n");
}
// 现在比 DEX 划算的挂单（各市场合起来，按划算的比例各取前 3）：bids 求购单（卖给它比 DEX 多拿），asks 出售单（买它比 DEX 便宜）
async function topDeals() {
  const now = Math.floor(Date.now() / 1000), all = [];
  for (const m of MARKETS) {
    if (m.nft) continue;
    try {
      const [orders, p, tax] = await Promise.all([book(m, now), market(m), sellTax(m)]);
      for (const o of orders) { const e = edge(o, p, tax); if (e.pct >= PP_MIN_PCT && e.gain >= PP_MIN_DAI) all.push({ m, o, e }); }
    } catch (e) {} // 一条链读不到就跳过
  }
  all.sort((a, b) => b.e.pct - a.e.pct);
  return { bids: all.filter((x) => !x.o.sell).slice(0, 3), asks: all.filter((x) => x.o.sell).slice(0, 3) };
}
const dai2 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1"; // dry=1&from=区块：只看消息内容，不发送、不记进度（测试用）
  // ppdry=1：预览现在有哪些低于市价的挂单、推送文字长什么样（不发送）
  if (url.searchParams.get("ppdry") === "1") return Response.json(await Promise.all(MARKETS.map((m) => pushDeals(m, ctx.env, kv, false).then((r) => ({ market: m.key, ...r }), (e) => ({ market: m.key, err: String(e.message || e) })))));
  // grouptest=1&key=BACKUP_KEY：逐个群发一条测试消息，返回 DeBox 的原始回复（排查哪个群收不到用；站长 2026-11-08）
  if (url.searchParams.get("grouptest") === "1") {
    const k = url.searchParams.get("key"); if (!k || !((ctx.env.FEEDBACK_KEY && k === ctx.env.FEEDBACK_KEY) || (ctx.env.BACKUP_KEY && k === ctx.env.BACKUP_KEY))) return Response.json({ error: "口令不对" }, { status: 403 });
    const gids = (ctx.env.DEBOX_GROUP_ID ? String(ctx.env.DEBOX_GROUP_ID).split(",") : GROUPS).map((g) => g.trim()).filter(Boolean), r = {};
    for (const g of gids) r[g] = await sendDebox(ctx.env, g, "🔧 播报线路测试 · 群 " + g + " · " + new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16) + "（北京时间）收到请忽略", "group").then((x) => ({ ok: true, result: x }), (e) => ({ ok: false, err: String(e.message || e).slice(0, 300) }));
    const seen = (await kv.list({ prefix: "dbx:g:" })).keys.map((k) => k.name.slice(6)); // 机器人最近 90 天在哪些群里收到过消息（webhook 记的）
    return Response.json({ gids, seen, r });
  }
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
        logs.push(...(await rpc(m, "eth_getLogs", [{ address: m.otc, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [[filledTopic(m), closedTopic(m)]] }])));
      }
      const cache = {};
      for (const l of logs) {
        const id = parseInt(l.topics[1], 16), d = words(l.data);
        const o = cache[id] || (cache[id] = await order(m, id));
        const giveSym = o.sell ? label(m) : "DAI", wantSym = o.sell ? "DAI" : label(m), side = (m.key === "ailgns" ? "" : label(m)) + (o.sell ? "卖单" : "买单");
        const gd = o.sell ? m.dec : 18, wd = o.sell ? 18 : m.dec; // 挂单存入的币 / 想换回的币各自的小数位
        // 每条私信都附上收信人自己的全部成交记录，客户点进去就能核对，不用自己把几条通知加起来
        const link = "\n🔗 " + m.tx + l.transactionHash + "\n🧬 " + m.link, mine = (a) => link + "\n📋 我的全部成交记录：https://ailgns.dev/#/trades/" + a;
        const inWallet = (sym) => (m.key === "ailgns" || m.key === "lgns") ? (sym === "DAI" ? "\n💰 钱已直接到你的钱包，不用再领（DAI 是 Anubis 链的主币：钱包切到 Anubis 链，主余额就是它）" : "\n💰 币已直接到你的钱包，不用再领") : ""; /* 站长 2026-11-13：说清钱在哪 */
        if (m.nft) { // 卡牌：整张成交
          if (l.topics[0] === NFT_FILLED) {
            const taker = "0x" + l.topics[2].slice(26), tokenId = BigInt("0x" + d[0]).toString(), price = num(d[1]), fee = num(d[2]), nm = await itemName(m, tokenId), kind = m.kind || "卡牌";
            msgs.push([o.maker, o.sell
              ? `🎉 你的${kind}卖单 #${id} 成交了！\n${nm} 已卖出，收到 ${fmt(price)} DAI` + link
              : `🎉 你的${kind}求购单 #${id} 成交了！\n收到 ${nm}，付出 ${fmt(price)} DAI（另付 3% 手续费 ${fmt(fee)}）` + link]);
            msgs.push([taker, o.sell
              ? `✅ 买入成功 #${id}\n收到 ${nm}，付出 ${fmt(price)} DAI（另付 3% 手续费 ${fmt(fee)}）` + link
              : `✅ 卖出成功 #${id}\n${nm} 已卖给求购方，收到 ${fmt(price)} DAI` + link]);
            fills.push({ m, qty: 1, price, k: l.transactionHash + l.logIndex, nm: m.names ? nm : undefined });
          } else {
            const expired = BigInt("0x" + d[0]) === 1n;
            const kind = m.kind || "卡牌", nm = o.sell ? await itemName(m, o.tokenId) : "";
            msgs.push([o.maker, (expired ? `⏰ 你的${kind}${o.sell ? "卖单" : "求购单"} #${id} 到期未成交，已自动退回` : `↩️ 你的${kind}${o.sell ? "卖单" : "求购单"} #${id} 已撤单，已退回`) + (o.sell ? " " + nm : " DAI（含预存的手续费）") + " 到你的钱包" + link]);
          }
          continue;
        }
        if (l.topics[0] === FILLED) {
          const taker = "0x" + l.topics[2].slice(26), amount = num(d[0], gd), paid = num(d[1], wd), fee = num(d[2], gd), left = num(d[3], gd);
          const got = o.give ? Number((o.give - BigInt("0x" + d[3])) * o.want / o.give) / 10 ** wd : 0; // 这张单到现在一共收到多少
          msgs.push([o.maker, `🎉 你的${side} #${id} 成交了！\n这笔：${o.sell ? "卖出" : "付出"} ${fmt(amount)} ${giveSym}，收到 ${fmt(paid)} ${wantSym}${inWallet(wantSym)}\n` +
            (o.give ? `本单累计：已收到 ${fmt(got)} / ${fmt(Number(o.want) / 10 ** wd)} ${wantSym}\n` : "") +
            ((o.sell ? left * paid / amount : left) >= 1 ? `还剩 ${fmt(left)} ${giveSym} 在挂单中` : "✅ 已全部成交" + (left > 0 ? `（剩 ${fmt(left)} ${giveSym} 不足 1 DAI，已自动下架，可在网站「我的挂单」点取回）` : "")) + mine(o.maker)]);
          fills.push({ m, qty: o.sell ? amount : paid, price: o.sell ? paid / amount : amount / paid, k: l.transactionHash + l.logIndex });
          msgs.push([taker, `✅ 吃单成功 #${id}\n付出 ${fmt(paid)} ${wantSym}，收到 ${fmt(amount - fee)} ${giveSym}（已扣 1% 手续费 ${fmt(fee)}）` + inWallet(giveSym) + mine(taker)]);
        } else {
          const refunded = num(d[0], gd), expired = BigInt("0x" + d[1]) === 1n;
          if (refunded <= 0) continue; // 全部成交时的关闭，上面已经通知过
          msgs.push([o.maker, (expired ? `⏰ 你的${side} #${id} 到期未成交，已自动退回 ` : `↩️ 你的${side} #${id} 已撤单，退回 `) + `${fmt(refunded)} ${giveSym} 到你的钱包` + mine(o.maker)]);
        }
      }
      done.push([m, logs, cache, from, latest]);
      status[m.key] = { from, latest, events: logs.length };
    } catch (e) { status[m.key] = { err: String(e.message || e).slice(0, 160) }; } // 一条链的节点出问题，不影响别的市场，下次接着读
  }
  // 群播报：新成交先存进 otcw:hr，整点后发上一段的汇总，发完清空
  const gids = (ctx.env.DEBOX_GROUP_ID ? String(ctx.env.DEBOX_GROUP_ID).split(",") : GROUPS).map((g) => g.trim()).filter(Boolean);
  const now = Date.now();
  const hr = (await kv.get("otcw:hr", "json")) || { since: Math.floor(now / 3600e3) * 3600e3, fills: [] };
  for (const f of fills) if (!hr.fills.some((x) => x.k === f.k)) hr.fills.push({ mk: f.m.key, qty: f.qty, price: f.price, k: f.k, nm: f.nm, t: now });
  const bjH = new Date(now + 8 * 3600e3).getUTCHours();
  const due = BC_HOURS.includes(bjH) && Math.floor((now + 8 * 3600e3) / 3600e3) > Math.floor((hr.since + 8 * 3600e3) / 3600e3); // 站长 2026-11-10：每 4 小时一条（8/12/16/20 点），其余整点只攒不发
  // 北京时间夜里 23:00–8:00 不播报（站长要求）：夜里的成交先攒着，早上 8 点那条一起发
  const bjHour = new Date(now + 8 * 3600e3).getUTCHours(), quiet = bjHour >= 23 || bjHour < 8;
  const until = Math.floor(now / 3600e3) * 3600e3;
  const first = HOURLY_ON && !(await kv.get("otcw:hr1")); // 2026-11-08 重新上线：第一次先发一条汇总，之后每小时一条
  const bcSnap = (await kv.get("bc:last", "json")) || null; // 上次播报时的域名总数
  let bcNames = 0, bcPool = { ail: 0, dai: 0 };
  const build = async (dry2) => {
    try { const j = await fetch(url.origin + "/api/name-genesis").then((r) => r.json()); bcNames = j.n || 0; } catch (e) {}
    try { // 和预测页大字一致：奖池钱包实际余额（AiLGNS + DAI 按 OTC 预言机价折成 AiLGNS），不是记账数
      const j = await fetch(url.origin + "/api/oracle").then((r) => r.json()), f = j.funds || {}, px = (f.otc && f.otc.px) || f.px || 1;
      const ail = (f.ail || 0) + (f.dai || 0) / px; bcPool = { ail: Math.floor(ail * 100) / 100, dai: Math.floor(ail * px * 100) / 100 };
    } catch (e) {}
    const newNames = bcSnap && bcNames ? Math.max(0, bcNames - (bcSnap.names || 0)) : 0;
    return bcText(hr.fills, (await kv.get("st:tot", "json")) || {}, bcNames, newNames, bcPool, until);
  };
  // bcdry=1：只看播报文字不发送；bc=1&key=口令：立刻发一条到群里（站长看效果用），不清空这段的成交
  if (url.searchParams.get("bcdry") === "1") return Response.json({ text: await build(true), due, quiet, gids, since: hr.since, log: (await kv.get("bc:log", "json")) || [] });
  if (url.searchParams.get("bc") === "1") {
    const k = url.searchParams.get("key"); if (!k || !((ctx.env.FEEDBACK_KEY && k === ctx.env.FEEDBACK_KEY) || (ctx.env.BACKUP_KEY && k === ctx.env.BACKUP_KEY))) return Response.json({ error: "口令不对" }, { status: 403 });
    const text = await build(false), r = {};
    for (const g of gids) { try { await sendDebox(ctx.env, g, text, "group"); r[g] = "ok"; } catch (e) { r[g] = String(e.message || e).slice(0, 200); } }
    await kv.put("bc:last", JSON.stringify({ names: bcNames, at: now }));
    await bcLog(kv, { at: now, how: "手动", n: hr.fills.length, sent: r });
    return Response.json({ sent: r, text });
  }
  if (dry) return Response.json({ status, due, quiet, group: await build(true), messages: msgs.map((m) => ({ to: m[0], text: m[1] })) });
  const groupSent = {};
  if ((due || first) && !quiet && HOURLY_ON) {
    const text = await build(false);
    if (text) for (const g of gids) {
      try { await sendDebox(ctx.env, g, text, "group"); groupSent[g] = true; }
      catch (e) { groupSent[g] = String(e.message || e).slice(0, 160); }
    }
    // 站长 2026-11-11：以前 DeBox 没收也当发过了，不重发也不留记录，漏发了没人知道。现在每次结果记进 bc:log；一个群都没发成就不清空，5 分钟后下一轮重发
    const okAny = Object.keys(groupSent).some((g) => groupSent[g] === true);
    await bcLog(kv, { at: now, how: "定时", n: hr.fills.length, sent: groupSent });
    if (okAny || !gids.length) {
      await kv.put("otcw:hr1", "1");
      await kv.put("bc:last", JSON.stringify({ names: bcNames, at: now }));
      await kv.put("otcw:hr", JSON.stringify({ since: until, fills: [] }));
    } else if (fills.length) await kv.put("otcw:hr", JSON.stringify(hr));
  } else if (fills.length) await kv.put("otcw:hr", JSON.stringify(hr)); // 有新成交才写，省 KV 写入次数
  // 低于市价的挂单推送给关注机器人的人（站长确认文案后把 PP_ON 改成 true 才真的发）
  let fans = null;
  if (PP_ON) {
    fans = {};
    for (const m of MARKETS) {
      fans[m.key] = await pushDeals(m, ctx.env, kv, true, gids).catch((e) => ({ err: String(e.message || e).slice(0, 200) }));
      if (fans[m.key].err) await kv.put("otcw:fans", JSON.stringify({ ok: false, market: m.key, err: fans[m.key].err, at: Date.now() }));
    }
  }
  let sent = 0, failed = 0;
  await pushMany(kv, msgs, "otc"); // 🔔 先写站内信（不依赖 DeBox）
  for (const [addr, text] of msgs) {
    const users = (await kv.get("dbx:a:" + addr, "json")) || [];
    for (const u of users) {
      try { await sendDebox(ctx.env, u, text); sent++; } catch (e) { failed++; }
    }
  }
  for (const [m, logs, cache, from, latest] of done) {
    await markTraders(m, kv, logs, cache, true).catch(() => {});
    await recordTrades(m, kv, logs, cache).catch(() => {});
    await recordGuide(m, kv, logs, cache).catch(() => {});
    await backfillTrades(m, kv, from - 1, cache).catch(() => {});
    if (m.backfill) await backfillTraders(m, kv, from - 1, cache).catch(() => {});
    await backfillVip(m, kv, from - 1, cache).catch(() => {});
    await kv.put(m.kv + "block", String(latest));
  }
  // 🤖 客服机器人自我介绍：每 8 小时在群里说一句「有问题 @我」，引导群友直接问（站长 2026-11-05 定）
  let greet = 0;
  try {
    const last = Number(await kv.get("dbx:greet")) || 0;
    if (GROUP_BROADCAST && Date.now() - last > 8 * 3600e3) {
      await kv.put("dbx:greet", String(Date.now()));
      const text = "🤖 我是 AiLGNS 客服机器人，7×24 在线。\n\nOTC 买卖、挂单、域名注册、借贷、预言家、会员……任何问题直接 @我 提问，秒回；我答不了的请到网站提交工单（https://ailgns.dev/#/feedback），按轻重缓急处理。\n\n网站：https://ailgns.dev";
      for (const g of gids) { try { await sendDebox(ctx.env, g, text, "group"); greet++; } catch (e) {} }
    }
  } catch (e) {}
  const oracle = await oracleNotify(ctx.env, kv, gids).catch((e) => ({ err: String(e.message || e).slice(0, 160) })); // 🔮 预言家：开奖结果 + 每天提醒
  const pixel = await rebuildIfNeeded(kv).catch((e) => ({ err: String(e.message || e).slice(0, 160) })); // 像素墙：顺便检查一下有没有被同时写覆盖
  // 💧 做市返佣：每次巡检采一次 AiLGNS 盘口（缺哪边 + 每人挂着多少），定档和「只算缺的一边」都靠它
  if (!dry) { const ts0 = Math.floor(Date.now() / 1000); ctx.waitUntil(Promise.all([book(MARKETS[0], ts0), book(MARKETS[1], ts0).catch(() => [])]).then(([os, ol]) => sampleLiquidity(kv, os, { lgns: ol })).catch(() => {})); } // AiLGNS + LGNS 两个盘口
  return Response.json({ status, messages: msgs.length, sent, failed, groupSent, fans, oracle, pixel, backfilledTo: await kv.get("otct2:scan"), vipScan: Object.fromEntries(await Promise.all(MARKETS.map(async (m) => [m.key, await kv.get(m.kv + "otcq:scan")]))) });
}
