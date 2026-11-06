// 💧 做市返佣（站长 2026-11-06 定）：客户在 AiLGNS/DAI OTC 挂单，被吃时吃单方付的 1% 手续费，70% 返给挂单方，30% 归平台
// 规则一页纸：挂单即参与、不用报名；按 DAI 金额算（返佣 = 成交 DAI × 1% × 70%）；每天北京时间 0 点后结算前一天，自动转到挂单钱包；链上可查
// 账本：lp:d:<day> = { maker: { dai, n, rb } }（当天各挂单人成交额/笔数/应返）；lp:tot:<maker> = { dai, n, rb, paid }；lp:paid:<day> 由 keeper 写
import { bjDay } from "./stats.js";
export const LP = { FEE: 0.01, SHARE: 0.7, MIN_PAY: 1, PAIR: "AiLGNS/DAI", START: "2026-11-06" }; // MIN_PAY：不足 1 DAI 累计到下次
export const rebateOf = (dai) => Math.round(dai * LP.FEE * LP.SHARE * 1e6) / 1e6;
export async function addRebate(kv, rec) {
  if (!rec || rec.m !== "ailgns" || !(rec.dai > 0) || !rec.maker) return;
  const day = bjDay(rec.t * 1000), rb = rebateOf(rec.dai), a = rec.maker.toLowerCase();
  const d = (await kv.get("lp:d:" + day, "json")) || {}, x = d[a] || (d[a] = { dai: 0, n: 0, rb: 0 });
  x.dai += rec.dai; x.n += 1; x.rb += rb;
  await kv.put("lp:d:" + day, JSON.stringify(d), { expirationTtl: 400 * 86400 });
  const t = (await kv.get("lp:tot:" + a, "json")) || { dai: 0, n: 0, rb: 0, paid: 0 };
  t.dai += rec.dai; t.n += 1; t.rb += rb;
  await kv.put("lp:tot:" + a, JSON.stringify(t));
  const days = (await kv.get("lp:days", "json")) || [];
  if (!days.includes(day)) { days.push(day); await kv.put("lp:days", JSON.stringify(days.slice(-400))); }
}
