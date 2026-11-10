// 💧 做市返佣（站长 2026-11-06 定）：客户在 AiLGNS/DAI OTC 挂单，被吃时吃单方付的 1% 手续费，70% 返给挂单方，30% 归平台
// 规则一页纸：挂单即参与、不用报名；按 DAI 金额算（返佣 = 成交 DAI × 1% × 70%）；每天北京时间 0 点后结算前一天，自动转到挂单钱包；链上可查
// 账本：lp:d:<day> = { maker: { dai, n, rb } }（当天各挂单人成交额/笔数/应返）；lp:tot:<maker> = { dai, n, rb, paid }；lp:paid:<day> 由 keeper 写
import { bjDay } from "./stats.js";
// 站长 2026-11-10 定稿（上级意见）：
//   ① 档位：按做市商当天挂在盘口的资金量（买+卖，按 DAI 折算，日均）分三档 ≥1 万→50%、≥3 万→60%、≥5 万→70%，不足 1 万不返
//   ② 只算缺的一边：盘口（中间价 ±3% 内）买单多的时候只有卖单成交才计返佣，卖单多的时候只有买单成交才计；基本平衡两边都算
//   ③ 返佣在读取/结算时按档位现算：返佣 = 计入成交 DAI × 1% × 档位比例（lp:d 里 cdai 是计入的成交额，dai 是全部成交额）
// 站长 2026-11-09 晚：返佣整个取消（老板：做市商资金量太小，只给称号不给钱）。REBATE=false 后 rateOf/rebateOf 一律 0；做市页只留批量挂单工具 + ✅ 官方认证做市商称号（日均挂单 ≥ TITLE_MIN）
export const LP = { FEE: 0.01, SHARE: 0.7, MIN_PAY: 1, PAIR: "AiLGNS/DAI", START: "2026-11-06", RULES_FROM: "2026-11-10", REBATE: false, REBATE_OFF: "2026-11-10", TITLE_MIN: 10000,
  TIERS: [[50000, 0.7], [30000, 0.6], [10000, 0.5]], BAND: 0.03, SKEW: 0.6, TRIAL: true }; // TRIAL：试运行，按规则记账，首次发放另行公告
export const rebateOf = (dai) => (LP.REBATE ? Math.round(dai * LP.FEE * LP.SHARE * 1e6) / 1e6 : 0); // 旧算法（11-10 之前的记录仍用它）
export const rateOf = (avgLiq) => { if (!LP.REBATE) return 0; for (const [min, r] of LP.TIERS) if (avgLiq >= min) return r; return 0; };
// ✅ 认证做市商称号：今天或昨天日均挂单 ≥ TITLE_MIN 就算（隔天掉下去称号自动没）
export const mmByLiq = (liqToday, liqYesterday, a) => Math.max(avgLiqOf(liqToday, a), avgLiqOf(liqYesterday, a)) >= LP.TITLE_MIN;
// 盘口哪边缺：返回 { side: "buy"|"sell"|"both", bd, ad, mid }，side 是「现在挂哪种单才计返佣」
export function scarceSide(orders) {
  const bids = orders.filter((o) => !o.sell), asks = orders.filter((o) => o.sell);
  const bb = bids.length ? Math.max(...bids.map((o) => o.price)) : 0, ba = asks.length ? Math.min(...asks.map((o) => o.price)) : 0;
  const mid = bb && ba ? (bb + ba) / 2 : bb || ba;
  if (!mid) return { side: "both", bd: 0, ad: 0, mid: 0 };
  const bd = bids.filter((o) => o.price >= mid * (1 - LP.BAND)).reduce((s, o) => s + o.qty * o.price, 0);
  const ad = asks.filter((o) => o.price <= mid * (1 + LP.BAND)).reduce((s, o) => s + o.qty * o.price, 0);
  const tot = bd + ad; let side = "both";
  if (tot >= 100) { if (bd / tot >= LP.SKEW) side = "sell"; else if (ad / tot >= LP.SKEW) side = "buy"; }
  return { side, bd: Math.round(bd), ad: Math.round(ad), mid: Math.round(mid * 1e6) / 1e6 }; // LGNS 单价 0.0x，中间价留 6 位
}
// 每 5 分钟采样一次（otc-watch 调）：记下现在缺哪边 + 每个挂单人此刻挂着多少 DAI（日均用来定档）
// 站长 2026-11-10：LGNS 也开做市——extra = { lgns: [LGNS 市场挂单] }，缺哪边按市场分开记（lp:side / lp:side:lgns），日均挂单资金两个市场合起来算（都是 DAI 折算）
export async function sampleLiquidity(kv, orders, extra) {
  const day = bjDay(), ss = scarceSide(orders);
  await kv.put("lp:side", JSON.stringify({ ...ss, at: Date.now() }), { expirationTtl: 3600 });
  const all = orders.slice();
  for (const k of Object.keys(extra || {})) { const os = extra[k] || []; await kv.put("lp:side:" + k, JSON.stringify({ ...scarceSide(os), at: Date.now() }), { expirationTtl: 3600 }); all.push(...os); }
  const liq = (await kv.get("lp:liq:" + day, "json")) || { n: 0, m: {} };
  liq.n += 1;
  const now = {};
  for (const o of all) if (o.maker) { const a = o.maker.toLowerCase(); now[a] = (now[a] || 0) + o.qty * o.price; }
  for (const a of new Set([...Object.keys(liq.m), ...Object.keys(now)])) liq.m[a] = (liq.m[a] || 0) + (now[a] || 0); // 累加，日均 = m[a] / n
  await kv.put("lp:liq:" + day, JSON.stringify(liq), { expirationTtl: 400 * 86400 });
  return ss;
}
export const avgLiqOf = (liq, a) => liq && liq.n ? (liq.m[a] || 0) / liq.n : 0;
import { OFFICIAL_MM } from "./cred.js";
export async function addRebate(kv, rec) {
  if (!rec || (rec.m !== "ailgns" && rec.m !== "lgns") || !(rec.dai > 0) || !rec.maker) return; // AiLGNS + LGNS（Anubis）两个市场都记做市账
  if (OFFICIAL_MM[rec.maker.toLowerCase()]) return; // ✅ 官方做市商不拿返佣，不记账（站长 2026-11-09）
  const day = bjDay(rec.t * 1000), a = rec.maker.toLowerCase(), newRules = day >= LP.RULES_FROM;
  const side = newRules ? ((await kv.get(rec.m === "lgns" ? "lp:side:lgns" : "lp:side", "json")) || { side: "both" }) : { side: "both" };
  const counted = side.side === "both" || (side.side === "sell" && rec.makerSide === "卖") || (side.side === "buy" && rec.makerSide === "买");
  const rb = newRules ? 0 : rebateOf(rec.dai); // 新规则下 rb 读取时按档位现算
  const d = (await kv.get("lp:d:" + day, "json")) || {}, x = d[a] || (d[a] = { dai: 0, n: 0, rb: 0, cdai: 0, cn: 0 });
  x.dai += rec.dai; x.n += 1; x.rb += rb; if (counted) { x.cdai = (x.cdai || 0) + rec.dai; x.cn = (x.cn || 0) + 1; }
  await kv.put("lp:d:" + day, JSON.stringify(d), { expirationTtl: 400 * 86400 });
  const t = (await kv.get("lp:tot:" + a, "json")) || { dai: 0, n: 0, rb: 0, paid: 0 };
  t.dai += rec.dai; t.n += 1; t.rb += rb;
  await kv.put("lp:tot:" + a, JSON.stringify(t));
  const days = (await kv.get("lp:days", "json")) || [];
  if (!days.includes(day)) { days.push(day); await kv.put("lp:days", JSON.stringify(days.slice(-400))); }
}
