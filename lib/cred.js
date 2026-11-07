// 🏅 商家认证（站长 2026-11-08 下午改：不再按累计门槛，改成「按上周名次分配、每周一轮换」，周期内每一级一定有人，巨鲸只有 1 个）
// 排名范围：上周在本站 OTC 有成交的地址（挂单被吃 + 吃单都算，按成交额排，同额按笔数）。周一 0 点（北京时间）第一次有人访问时结算，牌子挂一整周。
//   第 1 名 🐋 镇店巨鲸 · 第 2–3 👑 王牌商家 · 第 4–8 💎 钻石商家 · 第 9–20 🥇 金牌商家 · 第 21 起且上周成交满 1,000 DAI ✔ 认证商家 · 有成交不满 1,000 常客 · 没成交 新客
// 人不够 20 个时名额按顺序往下填，有几个人填几级。认证商家及以上才能进贡献王榜（KING_MIN_LV）。
// 数据：lb:vol（otc-watch 汇总的每人累计成交）每周一快照到 cred:snap，本周快照减上周快照 = 上周成交；第一次没有旧快照就用累计成交排一次（开局）。
export const CRED = [["新客", 0, 0], ["常客", 1, 0], ["认证商家", 1000, 0], ["金牌商家", 0, 0], ["钻石商家", 0, 0], ["王牌商家", 0, 0], ["镇店巨鲸", 0, 0]];
export const CRED_ICON = ["", "", "✔ ", "🥇 ", "💎 ", "👑 ", "🐋 "];
export const SLOTS = [[6, 1], [5, 2], [4, 5], [3, 12]]; // [等级, 名额]，按名次从上往下填
export const CERT_MIN = 1000; // 上周成交满这个数才是「认证商家」
export const KING_MIN_LV = 2; // 认证商家以上才能进贡献榜分钱
const EXCLUDE = { "0x6ec474047a6c12d0cab53855a990c1c8b3996c20": 1, "0xdcc5354175d60ffc8364e71e792fcd66366f00fe": 1, "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3": 1, // 路由 / 撮合 / 回购合约不参加
  "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4": 1, "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6": 1, "0x06cc2a46d7ad17496c2de9c61362808e06b44437": 1, "0x89dd06754bb239b6c4c92bc47c8fa72889084e27": 1, "0x8610bf581b1c10cb7d372f93b8cdcde382a7c1d1": 1, "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1": 1 }; // 站里自己的钱包（奖池 / 收入 / 做市 / 触发 / 极速池 / 代注册）也不参加
export function weekKey(ms = Date.now()) { const d = new Date(ms + 8 * 3600e3), dow = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - dow * 86400e3).toISOString().slice(0, 10); } // 本周一（北京时间）
export function levelOfRank(i, vol) { let p = 0; for (const [lv, n] of SLOTS) { if (i < p + n) return lv; p += n; } return vol >= CERT_MIN ? 2 : 1; }
import { loadRank } from "./rank.js"; // lb:vol = { 地址: [累计成交, 笔数] }，一次读完（挨个读 otct:* 太慢，单次请求跑不完）
async function listAll(kv) {
  const lb = await loadRank(kv), out = {};
  for (const k in lb) { const a = k.toLowerCase(); if (EXCLUDE[a]) continue; const o = out[a] || (out[a] = { vol: 0, n: 0 }); o.vol += Number(lb[k][0] || 0); o.n += Number(lb[k][1] || 0); } // 键可能大小写混着，统一小写合并
  return out;
}
// 本周的牌子表：{ week, lv: {地址: 等级}, rank: {地址: {r 名次, vol 上周成交, n 笔数}}, n 参加人数, boot 是否开局 }
export async function ensureWeek(kv) {
  const wk = weekKey();
  let w = await kv.get("cred:week", "json");
  if (w && w.week === wk && w.v === 3) return w;
  if (await kv.get("cred:lock")) return w || { week: "", lv: {}, rank: {}, n: 0 }; // 别人正在算
  await kv.put("cred:lock", "1", { expirationTtl: 120 });
  const now = await listAll(kv), snap = await kv.get("cred:snap", "json");
  // 上周起点：本周已经拍过快照（同一周里重算）就用快照里存的「上一周起点」base；没拍过就把上一次的快照当起点；从没拍过 = 开局，用累计成交排
  const prev = snap && snap.week === wk ? (snap.base || null) : (snap && snap.t ? snap.t : null);
  const rows = [];
  for (const a in now) {
    const p = prev ? prev[a] : null;
    const vol = prev ? Math.max(0, now[a].vol - (p ? p.vol : 0)) : now[a].vol, n = prev ? Math.max(0, now[a].n - (p ? p.n : 0)) : now[a].n;
    if (vol > 0 || n > 0) rows.push({ a, vol, n });
  }
  rows.sort((x, y) => y.vol - x.vol || y.n - x.n);
  const lv = {}, rank = {};
  rows.forEach((r, i) => { lv[r.a] = levelOfRank(i, r.vol); rank[r.a] = { r: i + 1, vol: Math.round(r.vol), n: r.n }; });
  w = { week: wk, v: 3, lv, rank, n: rows.length, at: Date.now(), boot: !prev };
  await kv.put("cred:week", JSON.stringify(w));
  if (!(snap && snap.week === wk)) await kv.put("cred:snap", JSON.stringify({ t: now, week: wk, base: prev })); // 本周第一次才拍快照，同一周重算不动它
  return w;
}
export async function credOf(kv, a) {
  a = String(a).toLowerCase();
  const [w, r] = await Promise.all([ensureWeek(kv), kv.get("otct:" + a, "json")]);
  const vol = Number((r && r.vol) || 0), n = Number((r && r.n) || 0);
  return { vol: Math.round(vol), n, lv: w.lv[a] || 0, wk: w.rank[a] || null, week: w.week, players: w.n };
}
export const credLevel = () => 0; // 旧接口：等级不再按累计门槛算，统一走 credOf / ensureWeek
