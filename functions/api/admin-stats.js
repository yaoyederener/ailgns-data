// 📊 站长数据面板（工单后台里看，要口令）：每日成交额、域名销售、装机量、访问量、收入、总收入、各钱包余额
// 数据来源：st:d:<日期>（daily-stats 每 5 分钟扫链写的）、st:c:*（/api/hit 打点）、st:tot（累计）、链上余额实时读
// GET ?key=<FEEDBACK_KEY 或 BACKUP_KEY>[&days=30]
import { bjDay, counts } from "../../lib/stats.js";
import { rpc } from "../../lib/oracle.js";

const WALLETS = [
  ["收款钱包（所有收入）", "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", "谷歌社交登录钱包"],
  ["预言家奖池", "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4", "只发 AiLGNS 奖"],
  ["触发钱包（付 Gas）", "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", "低于 8 DAI 会催你"],
  ["做市 / 套利钱包", "0x06cc2a46d7ad17496c2de9c61362808e06b44437", "未启用"],
  ["回购分账合约", "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", "域名费中转，每轮退回收款钱包"],
  ["OTC 托管合约（客户挂单资金）", "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", "客户的钱，不是收入"],
];
const TOK = [["DAI", "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", 18], ["AiLGNS", "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", 18], ["LGNS", "0x4d1d808a081fdac440703b3765fc61f8028c06b8", 9]];
const pad = (a) => a.slice(2).padStart(64, "0");
const r2 = (x) => Math.round(x * 100) / 100;

async function balances() {
  const out = [];
  for (const [name, a, note] of WALLETS) {
    const w = { name, a, note, gas: 0, tok: {} };
    try { w.gas = r2(Number(BigInt(await rpc("eth_getBalance", [a, "latest"]))) / 1e18); } catch (e) {}
    for (const [sym, t, dec] of TOK) { try { const v = Number(BigInt(await rpc("eth_call", [{ to: t, data: "0x70a08231" + pad(a) }, "latest"]))) / 10 ** dec; if (v) w.tok[sym] = r2(v); } catch (e) {} }
    out.push(w);
  }
  return out;
}

export async function onRequestGet(ctx) {
  const env = ctx.env, kv = env.TEAM_KV, u = new URL(ctx.request.url), key = u.searchParams.get("key");
  if (!key || !((env.FEEDBACK_KEY && key === env.FEEDBACK_KEY) || (env.BACKUP_KEY && key === env.BACKUP_KEY))) return Response.json({ error: "口令不对" }, { status: 403 });
  if (!kv) return Response.json({ error: "no kv" }, { status: 503 });
  const n = Math.min(90, Math.max(7, Number(u.searchParams.get("days")) || 30));
  const today = bjDay(), days = [];
  for (let i = 0; i < n; i++) days.push(bjDay(Date.now() - i * 86400e3));
  const rows = await Promise.all(days.map(async (day) => {
    const [d, c] = await Promise.all([kv.get("st:d:" + day, "json"), counts(kv, day).catch(() => ({}))]);
    const nm = (d && d.nm) || { n: 0, dai: 0 }, pays = (d && d.pays) || [];
    const member = r2(pays.reduce((s, p) => s + (p.amt || 0), 0)); // 会员付款（各币种按面值相加，主要是 DAI）
    const fillDai = (d && d.fillDai) || 0, fee = r2(fillDai * 0.01);
    return { day, fills: (d && d.fills) || 0, fillDai: r2(fillDai), orders: (d && d.orders) || 0, nmN: nm.n || 0, nmDai: r2(nm.dai || 0), member, fee,
      income: r2(fee + (nm.dai || 0) + member), v: c.v || 0, v1: c.v1 || 0, an: c.an || 0, a1: c.a1 || 0, q: Object.keys(c).filter((k) => k.startsWith("q_")).reduce((s, k) => s + c[k], 0) };
  }));
  const tot = (await kv.get("st:tot", "json")) || {}, tn = tot.nm || { n: 0, dai: 0 };
  // 总收入：OTC 手续费 1% × 累计成交 + 域名累计 + 会员（会员只有按天的记录，把有记录的天加起来）
  const memberAll = rows.reduce((s, r) => s + r.member, 0);
  const totals = { fillDai: r2(tot.fillDai || 0), fills: tot.fills || 0, orders: tot.orders || 0, fee: r2((tot.fillDai || 0) * 0.01), nmN: tn.n || 0, nmDai: r2(tn.dai || 0), member: r2(memberAll),
    income: r2((tot.fillDai || 0) * 0.01 + (tn.dai || 0) + memberAll), installs: rows.reduce((s, r) => s + r.an, 0) };
  let wallets = await kv.get("adm:wal", "json");
  if (!wallets || Date.now() - wallets.at > 120e3) { wallets = { at: Date.now(), list: await balances() }; ctx.waitUntil(kv.put("adm:wal", JSON.stringify(wallets), { expirationTtl: 3600 })); }
  return Response.json({ today, rows, totals, wallets: wallets.list, walletsAt: wallets.at, note: "成交额 = OTC 四个市场成交（DAI 计）；收入 = 成交额×1% 手续费 + 域名销售 + 会员付款；装机 = 第一次从手机桌面图标打开的设备数（an）；访问 = 打开网站次数（v）/ 当天首次打开的人数（v1）" }, { headers: { "cache-control": "no-store" } });
}
