// 📊 站长数据面板（工单后台里看，要口令）：每日成交额、域名销售、装机量、访问量、收入、总收入、各钱包余额
// 数据来源：st:d:<日期>（daily-stats 每 5 分钟扫链写的）、st:c:*（/api/hit 打点）、st:tot（累计）、链上余额实时读
// build()：ops-watch 每 5 分钟调一次，算好存 adm:res（每次最多补 2 个历史日子）；接口 /api/admin-stats 只读这个缓存，秒开
import { bjDay, counts } from "./stats.js";
import { RPCS } from "./teamlib.js";

const WALLETS = [
  ["收款钱包（所有收入）", "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", "谷歌社交登录钱包"],
  ["预言家奖池", "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4", "只发 AiLGNS 奖"],
  ["触发钱包（付 Gas）", "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", "低于 8 DAI 会催你"],
  ["做市 / 套利钱包", "0x06cc2a46d7ad17496c2de9c61362808e06b44437", "未启用"],
  ["运营费用地址（域名费中转）", "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", "域名费先到这里，机器人每轮退回收款钱包，账本上对外显示「运营维护」"],
  ["OTC 托管合约（客户挂单资金）", "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", "客户的钱，不是收入"],
];
const TOK = [["DAI", "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", 18], ["AiLGNS", "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", 18], ["LGNS", "0x4d1d808a081fdac440703b3765fc61f8028c06b8", 9]];
const pad = (a) => a.slice(2).padStart(64, "0");
const r2 = (x) => Math.round(x * 100) / 100;

async function balances() {
  // 一次 JSON-RPC 批量请求把 6 个钱包 × 4 个余额全读回来（Worker 单次调用的子请求数有上限，不能一个个发）
  const calls = [];
  WALLETS.forEach(([, a]) => { calls.push({ jsonrpc: "2.0", id: calls.length, method: "eth_getBalance", params: [a, "latest"] }); TOK.forEach(([, t]) => calls.push({ jsonrpc: "2.0", id: calls.length, method: "eth_call", params: [{ to: t, data: "0x70a08231" + pad(a) }, "latest"] })); });
  let res = [];
  try { res = await fetch(RPCS[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls) }).then((r) => r.json()); } catch (e) { res = []; }
  const by = {}; (Array.isArray(res) ? res : []).forEach((x) => { by[x.id] = x.result; });
  return WALLETS.map(([name, a, note], i) => {
    const base = i * (1 + TOK.length), w = { name, a, note, gas: 0, tok: {} };
    try { w.gas = r2(Number(BigInt(by[base] || "0x0")) / 1e18); } catch (e) {}
    TOK.forEach(([sym, , dec], k) => { try { const v = Number(BigInt(by[base + 1 + k] || "0x0")) / 10 ** dec; if (v) w.tok[sym] = r2(v); } catch (e) {} });
    return w;
  });
}
export async function build(env, kv, ctx) {
  const n = 30;
  const today = bjDay(), days = [];
  for (let i = 0; i < n; i++) { const d = bjDay(Date.now() - i * 86400e3); if (d >= "2026-11-01") days.push(d); } // 站长：11-01 正式上线，之前的不统计
  // KV 操作也算子请求（单次调用有上限）：过去的日子算一次永久缓存，今天/昨天缓存 2 分钟；每次最多现算 2 天，其余标 pending 让前端再拉
  const yday = bjDay(Date.now() - 86400e3);
  let budget = 1; // 访问计数是按 Worker 实例一把钥匙一把钥匙读的，一天几百次 KV 读；一次调用超过 1000 次 KV 就整个报错，所以每次只现算「今天 + 最多 1 个别的日子」
  const rows = [];
  for (const day of days) {
    // d3（2026-11-09）：d2 时代今天/昨天每次都占掉 2 个现算名额，11-07 永远 pending、11-08 在访问计数读失败时被永久缓存成 0——现在今天/昨天不占名额，计数读失败只缓存 10 分钟
    const fresh = day === today, ck = (fresh ? "adm:t3:" : day === yday ? "adm:y3:" : "adm:d3:") + day; // 今天 2 分钟、昨天 15 分钟（计数可能还有尾巴）、更早永久
    const hit = await kv.get(ck, "json");
    if (hit) { rows.push(hit); continue; }
    if (!fresh) { if (budget <= 0) { rows.push({ day, pending: true }); continue; } budget--; }
    let cfail = false;
    const [d, c] = await Promise.all([kv.get("st:d:" + day, "json"), counts(kv, day).catch(() => { cfail = true; return {}; })]);
    const nm = (d && d.nm) || { n: 0, dai: 0 }, pays = (d && d.pays) || [];
    const member = r2(pays.reduce((s, p) => s + (p.amt || 0), 0)); // 会员付款（各币种按面值相加，主要是 DAI）
    // 打点键名是 pv/uv/app_new/app_uv（lib/stats.js bump），面板字段 v/v1/an/a1 从这里映射
    const fillDai = (d && d.fillDai) || 0, fee = r2(fillDai * 0.01);
    const row = { day, fills: (d && d.fills) || 0, fillDai: r2(fillDai), orders: (d && d.orders) || 0, nmN: nm.n || 0, nmDai: r2(nm.dai || 0), member, fee,
      income: r2(fee + (nm.dai || 0) + member), v: c.pv || 0, v1: c.uv || 0, an: c.app_new || 0, a1: c.app_uv || 0, q: Object.keys(c).filter((k) => k.startsWith("q_")).reduce((s, k) => s + c[k], 0) };
    let pk = 0, pkAt = 0; for (const k of Object.keys(c)) if (k[0] === "m" && /^\d+$/.test(k.slice(1)) && c[k] > pk) { pk = c[k]; pkAt = Number(k.slice(1)); } // 当天 5 分钟峰值（合伙人面板「昨天峰值」用）
    row.kn = c._n || 0; row.cf = cfail; // 钥匙数 / 计数是否读失败（排查「访客 0」）
    row.pk = pk; row.pkAt = String(Math.floor(pkAt * 5 / 60)).padStart(2, "0") + ":" + String((pkAt * 5) % 60).padStart(2, "0");
    await kv.put(ck, JSON.stringify(row), fresh ? { expirationTtl: 120 } : (cfail || day === yday) ? { expirationTtl: 900 } : { expirationTtl: 100 * 86400 });
    rows.push(row);
  }
  const pending = rows.filter((r) => r.pending).length;
  const tot = (await kv.get("st:tot", "json")) || {}, tn = tot.nm || { n: 0, dai: 0 };
  // 总收入：OTC 手续费 1% × 累计成交 + 域名累计 + 会员（会员只有按天的记录，把有记录的天加起来）
  const memberAll = rows.reduce((s, r) => s + (r.member || 0), 0);
  // 累计 = 11-01 上线以来各天相加（站长：之前的不统计），挂单数仍用 st:tot
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const totals = { fillDai: r2(sum("fillDai")), fills: sum("fills"), orders: tot.orders || 0, fee: r2(sum("fee")), nmN: sum("nmN"), nmDai: r2(sum("nmDai")), member: r2(sum("member")),
    income: r2(sum("income")), installs: sum("an") };
  const wallets = { at: Date.now(), list: await balances() };
  const out = { at: Date.now(), today, rows, pending, totals, wallets: wallets.list, walletsAt: wallets.at, note: "成交额 = OTC 四个市场成交（DAI 计）；收入 = 毛收入 = 成交额×1% 手续费 + 域名销售 + 会员付款（域名的 70% 要留给预言家奖池，净收入 = 收入 − 域名×70%）；装机 = 第一次从手机桌面图标打开的设备数（an）；访问 = 打开网站次数（v）/ 当天首次打开的人数（v1）" };
  await kv.put("adm:res", JSON.stringify(out), { expirationTtl: 7 * 86400 });
  return out;
}
