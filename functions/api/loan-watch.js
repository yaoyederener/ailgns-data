// 借贷 DeBox 通知（每 5 分钟由定时任务调用一次）：
// 1. 读借款合约的新事件：接单（Funded / Taken）→ 私信借款人和出借人，并在营销群播报一条成交；还款 / 违约 / 撤单退回 → 私信相关人
// 2. 借款到期提醒：到期前 24 小时、1 小时各私信借款人一次（没还就提醒，还了不提醒）
// 私信只发给在 OTC 页绑定过 DeBox 的地址（dbx:a:<地址>），没绑定的收不到
// ?dry=1&from=<区块>：只看消息内容，不发送、不记进度
import { RPCS } from "../../lib/teamlib.js";
import { sendDebox } from "../../lib/debox.js";

const LOANS = [ // 借款合约（每个抵押币一份）
  { key: "ailgns", sym: "AiLGNS", dec: 18, addr: "0x242ab392571d325d814a48892ac16115a6d285dc", deploy: 18016308 }
];
const GROUPS = ["oes8etcm", "fvg4wksw"]; // 营销群（和 OTC 成交播报同一批群）
const LINK = "https://ailgns.dev/#/lend", TX = "https://anubisscan.io/tx/";
const T = {
  Funded: "0x974968e4099686772f222ec802e4262eab7a00af4bc618c179650168f804d656", // (id, lender, principal, fee, due)
  Taken: "0x50e96118c53b6a1892a77e86f7d289841ab3e2cff2c59b8e961c282d0e0d8038", // (id, borrower, principal, fee, due)
  Repaid: "0xd7e0ec76b1d4528064c83f86d869783dfd06db26b2b5624bde17d4b99f80dd97", // (id, payer, amount)
  Defaulted: "0xc1ea160264346dd7a031cf9eca709877e63fdd15ca9826847402a9d35f7bc2ff", // (id, lender, collateral)
  Closed: "0xecbcc0f69172bf54c6cc02c6b099b70f146b61086ecdbc4d1e3c44b4f689bbd6" // (id, maker, expired)
};
const COUNT = "0x9d11ed75", GET_LOANS = "0x86b20104";
const SPAN = 5000;
const u256 = (v) => BigInt(v).toString(16).padStart(64, "0");
const words = (h) => (h.slice(2).match(/.{64}/g) || []);
const num = (h, dec = 18) => Number(BigInt("0x" + h)) / 10 ** dec;
const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 4 });
const dai2 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const bj = (sec) => new Date(sec * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const days = (sec) => (sec % 86400 === 0 ? sec / 86400 + " 天" : (sec / 86400).toFixed(1) + " 天");

async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}
// 一条借款：borrower, lender, isOffer, status, expiry, term, due, collateral, principal, repayAmount
function parseLoan(w, i, m) {
  const o = w.slice(2 + i * 10, 12 + i * 10);
  return { borrower: "0x" + o[0].slice(24), lender: "0x" + o[1].slice(24), isOffer: BigInt("0x" + o[2]) === 1n, status: Number(BigInt("0x" + o[3])), expiry: Number(BigInt("0x" + o[4])), term: Number(BigInt("0x" + o[5])), due: Number(BigInt("0x" + o[6])),
    collateral: num(o[7], m.dec), principal: num(o[8]), repay: num(o[9]) };
}
async function loan(m, id) {
  const w = words(await rpc("eth_call", [{ to: m.addr, data: GET_LOANS + u256(id) + u256(1) }, "latest"]));
  return parseLoan(w, 0, m);
}
async function allLoans(m) {
  const count = Number(BigInt(await rpc("eth_call", [{ to: m.addr, data: COUNT }, "latest"])));
  const out = [];
  for (let from = 0; from < count; from += 500) {
    const w = words(await rpc("eth_call", [{ to: m.addr, data: GET_LOANS + u256(from) + u256(500) }, "latest"]));
    const n = Number(BigInt("0x" + w[1]));
    for (let i = 0; i < n; i++) out.push({ id: from + i, ...parseLoan(w, i, m) });
  }
  return out;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const url = new URL(ctx.request.url), dry = url.searchParams.get("dry") === "1";
  const msgs = [], groupPosts = [], status = {};
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  for (const m of LOANS) {
    try {
      let from = dry ? parseInt(url.searchParams.get("from") || String(latest - 2000), 10) : parseInt((await kv.get("lnw:" + m.key + ":block")) || "0", 10) + 1;
      if (from <= 1) from = m.deploy;
      const logs = [];
      for (let b = from; b <= latest; b += SPAN) {
        const to = Math.min(latest, b + SPAN - 1);
        logs.push(...(await rpc("eth_getLogs", [{ address: m.addr, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16), topics: [[T.Funded, T.Taken, T.Repaid, T.Defaulted, T.Closed]] }])));
      }
      const cache = {};
      for (const l of logs) {
        const id = parseInt(l.topics[1], 16), who = "0x" + l.topics[2].slice(26), d = words(l.data), L = cache[id] || (cache[id] = await loan(m, id));
        const link = "\n🔗 " + TX + l.transactionHash + "\n🧬 " + LINK;
        const terms = `押 ${fmt(L.collateral)} ${m.sym}，借 ${dai2(L.principal)} DAI，${days(L.term)}，到期还 ${dai2(L.repay)} DAI`;
        if (l.topics[0] === T.Funded || l.topics[0] === T.Taken) {
          const due = Number(BigInt("0x" + d[2]));
          msgs.push([L.borrower, `💰 借款 #${id} 已成交，本金 ${dai2(L.principal)} DAI 已到你的钱包\n${terms}\n⏰ 还款截止：${bj(due)}（北京时间）。不会自动扣款，请到期前到「借贷 → 我的借贷」点「还款」，可以提前还；逾期抵押币归出借人` + link]);
          msgs.push([L.lender, `🤝 你的出借 #${id} 已成交\n${terms}\n⏰ 借款人应在 ${bj(due)}（北京时间）前还 ${dai2(L.repay)} DAI 到你钱包；逾期抵押币自动划给你` + link]);
          groupPosts.push(`🤝 借贷成交 #${id}\n押 ${fmt(L.collateral)} ${m.sym}，借 ${dai2(L.principal)} DAI\n期限 ${days(L.term)}，到期还 ${dai2(L.repay)} DAI\n链上托管，不看币价、不清算，手续费只收出借人 1%\n🧬 ${LINK}`);
        } else if (l.topics[0] === T.Repaid) {
          msgs.push([L.borrower, `✅ 借款 #${id} 已还清 ${dai2(L.repay)} DAI，抵押的 ${fmt(L.collateral)} ${m.sym} 已退回你的钱包` + link]);
          msgs.push([L.lender, `✅ 借款 #${id} 已还款：${dai2(L.repay)} DAI 已到你的钱包` + link]);
        } else if (l.topics[0] === T.Defaulted) {
          msgs.push([L.lender, `⚠️ 借款 #${id} 到期未还，抵押的 ${fmt(L.collateral)} ${m.sym} 已划到你的钱包` + link]);
          msgs.push([L.borrower, `⚠️ 借款 #${id} 到期未还款，抵押的 ${fmt(L.collateral)} ${m.sym} 已归出借人，借款结束` + link]);
        } else if (l.topics[0] === T.Closed) {
          const expired = BigInt("0x" + d[0]) === 1n;
          msgs.push([who, (expired ? `⏰ 你的${L.isOffer ? "出借单" : "借款单"} #${id} 挂单到期无人接单，` : `↩️ 你的${L.isOffer ? "出借单" : "借款单"} #${id} 已撤单，`) + (L.isOffer ? `${dai2(L.principal * 1.01)} DAI（含预存手续费）` : `${fmt(L.collateral)} ${m.sym}`) + "已退回你的钱包" + link]);
        }
      }
      // 到期提醒：借款中、还没还的，到期前 24 小时和 1 小时各提醒一次
      const now = Math.floor(Date.now() / 1000), remind = [];
      for (const L of await allLoans(m)) {
        if (L.status !== 1) continue;
        const left = L.due - now;
        for (const [tag, limit, label] of [["r24", 24 * 3600, "24 小时"], ["r1", 3600, "1 小时"]]) {
          if (left > 0 && left <= limit) {
            const k = `lnw:${m.key}:${tag}:${L.id}`;
            if (dry || !(await kv.get(k))) {
              remind.push(k);
              msgs.push([L.borrower, `⏰ 借款 #${L.id} 还有不到 ${label}到期（${bj(L.due)} 北京时间）\n应还 ${dai2(L.repay)} DAI，请到「借贷 → 我的借贷」点「还款」。不会自动扣款；逾期抵押的 ${fmt(L.collateral)} ${m.sym} 归出借人` + "\n🧬 " + LINK]);
            }
          }
        }
      }
      status[m.key] = { from, latest, events: logs.length, reminders: remind.length };
      if (!dry) {
        for (const k of remind) await kv.put(k, "1", { expirationTtl: 30 * 86400 });
        await kv.put("lnw:" + m.key + ":block", String(latest));
      }
    } catch (e) { status[m.key] = { err: String(e.message || e).slice(0, 160) }; }
  }
  if (dry) return Response.json({ status, group: groupPosts, messages: msgs.map((x) => ({ to: x[0], text: x[1] })) });
  let sent = 0, failed = 0;
  const groupSent = {};
  for (const text of groupPosts) {
    for (const g of (ctx.env.DEBOX_GROUP_ID ? String(ctx.env.DEBOX_GROUP_ID).split(",") : GROUPS).map((x) => x.trim()).filter(Boolean)) {
      try { await sendDebox(ctx.env, g, text, "group"); groupSent[g] = (groupSent[g] || 0) + 1; } catch (e) { groupSent[g] = String(e.message || e).slice(0, 120); }
    }
  }
  for (const [addr, text] of msgs) {
    const users = (await kv.get("dbx:a:" + addr, "json")) || [];
    for (const u of users) {
      try { await sendDebox(ctx.env, u, text); sent++; } catch (e) { failed++; }
    }
  }
  return Response.json({ status, messages: msgs.length, sent, failed, groupSent });
}
