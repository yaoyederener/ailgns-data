// 🛡 互助保障（站长 2026-11-23 定；他最初叫「被盗全赔的链上保险」，对外不叫保险、不写全赔）
// 大白话：大家每年各交 50 DAI 进一个公开的「保障池」钱包；谁出事了，从池子里赔，池子有多少最多赔多少。
//   · 平台失误（合约漏洞、网站出错、机器人转错）：损失多少赔多少，最高到整个池子；多人同时出事按比例分
//   · 账户被盗：上限跟连续加入的时间涨（满 1 个月 1,000 → 12 个月 10,000 DAI）；每月被盗类的预算 = 池子的 30%，超了按比例打折
//   · 防骗：加入满 30 天才生效、被盗 72 小时内要报、公示 7 天、一个钱包只赔一次（赔完这个钱包不再受保）
// 没有新合约：保费是普通转账进保障池钱包；理赔由站长核对后从保障池钱包手动打款，每月结算一次。
// 这个文件只放规则和纯计算（方便单独测）；读链、存取在 functions/api/cover.js。
export const COVER = {
  pool: "0xab907917d541313e2ded546f39912c6d508c04f1", // 保障池钱包（2026-11-24 本机生成，站长存 1Password 并核对过；不和收款钱包混）。空着 = 页面显示「准备中」，不能加入
  dai: "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", // Anubis 的 DAI（转账有链上记录）
  fee: 50, // 每年保费（DAI）
  yearDays: 365, graceDays: 7, // 到期后 7 天内续上，「连续加入」不断
  waitDays: 30, // 加入满 30 天才生效（防止被盗以后才来加入）
  tiers: [[1, 1000], [3, 3000], [6, 5000], [12, 10000]], // 连续加入满 N 个月（30 天算一个月）→ 被盗类最高赔多少 DAI
  monthBudget: 0.3, // 被盗类每月预算 = 池子的 30%
  reportHours: 72, noticeDays: 7
};
const DAY = 86400e3;
const low = (s) => String(s || "").toLowerCase();

// 连续加入满 months 个月时，被盗类最高赔多少
export function tierCap(months) { let c = 0; for (const [m, v] of COVER.tiers) if (months >= m) c = v; return c; }

// 保单状态：pays = [{ t: 到账时间(毫秒), amt: 付了多少 DAI }]，at = 看哪一刻（默认现在；理赔时填被盗那一刻）
// 每满一份保费续一年；到期后 graceDays 内续上算连续，断了就从新的一笔重新算起
export function policyOf(pays, at) {
  const now = at || Date.now(), list = (pays || []).filter((p) => p && p.t > 0 && p.amt >= COVER.fee).slice().sort((x, y) => x.t - y.t);
  let start = 0, until = 0;
  for (const p of list) {
    if (p.t > now) break; // 那一刻之后才付的不算
    const years = Math.floor(p.amt / COVER.fee) * COVER.yearDays * DAY;
    if (!start || p.t > until + COVER.graceDays * DAY) { start = p.t; until = p.t + years; } else until += years;
  }
  const active = !!start && now < until, months = active ? Math.floor((now - start) / (30 * DAY)) : 0, effective = active && now >= start + COVER.waitDays * DAY;
  return { start, until, active, effective, months, cap: effective ? tierCap(months) : 0, effectiveAt: start ? start + COVER.waitDays * DAY : 0 };
}

// 月度结算（纯计算）：pool = 结算那一刻保障池余额；claims = 这个月通过的理赔 [{ id, kind: "fault" | "theft", loss, cap }]
// 先赔平台失误（按损失，池子不够按比例）；剩下的池子 × 30% 是被盗类预算，每人想赔 = min(损失, 上限)，超预算按比例
export function settle(pool, claims) {
  const r2 = (v) => Math.floor(v * 100) / 100, P = Math.max(0, Number(pool) || 0);
  const fault = claims.filter((c) => c.kind === "fault"), theft = claims.filter((c) => c.kind === "theft");
  const fWant = fault.reduce((s, c) => s + Math.max(0, c.loss), 0), fRate = fWant > P && fWant > 0 ? P / fWant : 1;
  const out = [];
  let fPaid = 0;
  for (const c of fault) { const pay = r2(Math.max(0, c.loss) * fRate); fPaid += pay; out.push({ id: c.id, kind: c.kind, want: r2(Math.max(0, c.loss)), pay, rate: fRate }); }
  const budget = r2(Math.max(0, P - fPaid) * COVER.monthBudget);
  const want = (c) => Math.max(0, Math.min(c.loss, c.cap || 0));
  const tWant = theft.reduce((s, c) => s + want(c), 0), tRate = tWant > budget && tWant > 0 ? budget / tWant : 1;
  let tPaid = 0;
  for (const c of theft) { const pay = r2(want(c) * tRate); tPaid += pay; out.push({ id: c.id, kind: c.kind, want: r2(want(c)), pay, rate: tRate }); }
  return { pool: P, faultPaid: r2(fPaid), budget, theftPaid: r2(tPaid), theftRate: tRate, left: r2(P - fPaid - tPaid), rows: out };
}

// 理赔资格（纯计算）：p = 保单（含 pays / closed）；when = 出事那一刻；reported = 报上来那一刻
export function claimCheck(p, kind, when, reported) {
  const no = (why) => ({ ok: false, why });
  if (!p || !(p.pays || []).length) return no("这个钱包没有加入互助保障");
  if (p.closed) return no("这个钱包已经赔过一次，不再受保");
  const st = policyOf(p.pays, when);
  if (!st.active) return no("出事的时候保障已经到期或还没加入");
  if (kind === "fault") return { ok: true, cap: Infinity, months: st.months };
  if (!st.effective) return no("加入还没满 " + COVER.waitDays + " 天，被盗保障还没生效");
  if (reported - when > COVER.reportHours * 3600e3) return no("被盗超过 " + COVER.reportHours + " 小时才报，不受理");
  if (!(st.cap > 0)) return no("连续加入还没满 1 个月，被盗保障还没有额度");
  return { ok: true, cap: st.cap, months: st.months };
}

// 登记备用收款钱包时要签的话（页面和接口一字不差）。被盗以后理赔款只打到这个地址：偷到私钥的人改不了它
export function bindText(a, backup, ts) { return "AiLGNS 互助保障 · 登记\n加入的钱包：" + low(a) + "\n备用收款钱包（理赔款只打到这里）：" + low(backup) + "\n时间：" + ts; }
