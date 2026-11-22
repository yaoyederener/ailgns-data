// 🏆 OTC 手续费周榜（站长 2026-11-15 定，试运行）
// 规则（四条都是站长选的）：
//   ① 每周一 0 点到周日 24 点（北京时间），按每个钱包在本站 OTC 吃单付的手续费排名（和原来贡献榜用同一份记录 or:fee:）；
//   ② 前 WK_TOP 名按手续费占比，分「周榜奖金钱包」里实际有的钱：有多少分多少，不承诺金额；钱由团队手动转进这个钱包；
//   ③ 结算后 WK_BURN_DAYS 天内先销毁 1 枚创世名才发；过期算放弃，钱留在钱包里滚到下一周；分到超过 WK_SAY_MIN DAI 的还要上传宣传截图 / 视频并通过认证（2026-11-22 加）；
//   ④ 发奖由机器人从这个专用钱包发（monita/weekly_prize.py），不碰别的钱包。站长 2026-11-15 定「发 AiLGNS」：每人分到的是一个 DAI 金额，
//      发的时候机器人用这笔 DAI 在本站 OTC 吃最便宜的卖单买成 AiLGNS，买到多少转多少（所以币价怎么动钱包都不会不够发）。
//      合约最小吃单额是 1 DAI，所以分到不足 WK_PAY_MIN 的不发，留在钱包里滚到下一周。
// 钱包必须设了 .ailgns 主名字才上榜；平台自己的钱包、官方做市钱包、合约不上榜。
import { feeBoard, showName, burnedCount, rpc, bjDay, weekStart } from "./oracle.js";
import { EXCLUDE, OFFICIAL_MM } from "./cred.js";

export const WK_POOL = "0xf09b0cd8bd6ed6fa528284f53fc8e9df753b62de"; // 周榜奖金钱包地址（小写）。站长建好钱包后填；没填之前页面显示「准备中」，不结算、不发奖
export const WK_FROM = "2026-11-16"; // 第一周的周一（北京时间）
export const WK_PAY_MIN = 1; // 一个人分到不足 1 DAI：买不了币（合约最小吃单额），不发，留到下周
export const WK_TOP = 10, WK_BURN_DAYS = 3, WK_GAS = 2, WK_MIN = 1; // 前 10 名；3 天内烧 1 枚创世名；钱包留 2 DAI 当 Gas；可分的钱不到 1 DAI 这周不分
const H = 3600e3;
export const cents = (x) => Math.floor(x * 100 + 1e-6) / 100;
export const addDays = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekEnd = (cyc) => addDays(cyc, 6); // 这一周的周日
export const endAt = (cyc) => Date.parse(addDays(cyc, 7) + "T00:00:00Z") - 8 * H; // 这一周结束的时刻（下周一 0 点，北京时间）
/* 📣 站长 2026-11-22：「金额大于 100 DAI，也要销毁一枚创世域名，并上传宣传截图或视频，才能领奖」。
   烧 1 枚创世名：所有人都要（老规矩没变）；分到超过 WK_SAY_MIN 的，另外要上传宣传截图 / 视频，团队在工单后台点「通过」后机器人才发（和预言家大奖同一套：/api/oracle-proof 收凭证，凭证存 or:proof:<编号>）。
   上传没有期限：名字按时烧了就不算放弃，不上传就一直不发，钱留在奖金钱包里（记在「已分出去、等领奖」里，不会再分一遍）。 */
export const WK_SAY_MIN = 100;
export const wkNeedSay = (x) => Number(x.amt || 0) > WK_SAY_MIN;
export const wkSayHas = (x) => !!(x && x.say && (x.say.n > 0 || x.say.v));
export const wkState = (x) => (x.tx ? "paid" : x.forfeit ? "forfeit" : burnedCount(x) < 1 ? "wait" : wkNeedSay(x) && !x.ok ? (wkSayHas(x) ? "review" : "say") : x.lock ? "sending" : "ready"); /* sending = 机器人已经锁住这一笔正在转；锁了没转成要人工看链上，绝不自动重发 */
export const WK_STUCK = 30 * 60e3; /* 锁了这么久还没记成已发 → 提醒站长 */

// 纯算法：榜单 + 能分的钱 → 每人占比和金额（向下取到分，加起来不会超过能分的钱）
export function split(top, avail) {
  const sum = top.reduce((t, x) => t + x.fee, 0);
  return top.map((x) => { const share = sum > 0 ? x.fee / sum : 0; const amt = avail >= WK_MIN ? cents(avail * share) : 0; return { ...x, share, amt: amt >= WK_PAY_MIN ? amt : 0 }; });
}
export const owedOf = (pays) => cents(pays.filter((x) => !x.tx && !x.forfeit).reduce((t, x) => t + Number(x.amt || 0), 0)); // 已经分出去、还在等烧名字的钱：不能再分一遍
export const availOf = (bal, owed) => Math.max(0, cents(bal - WK_GAS - owed));

// 这一周的榜：按手续费从高到低，跳过自己人和没设主名字的，取前 WK_TOP 名（最多往下看 60 个）
export async function boardOf(kv, from, to) {
  const fb = await feeBoard(kv, from, to), top = [];
  let seen = 0;
  for (const x of fb) {
    if (EXCLUDE[x.a] || OFFICIAL_MM[x.a] || !(x.fee > 0)) continue;
    if (++seen > 60) break;
    const name = await showName(kv, x.a);
    if (name.indexOf("…") >= 0) continue;
    top.push({ a: x.a, name, fee: x.fee });
    if (top.length >= WK_TOP) break;
  }
  return { top, n: fb.length };
}
export async function poolBal() { // 钱包里的 DAI（Anubis 的 DAI 就是原生币）；读不到就抛错
  const b = await rpc("eth_getBalance", [WK_POOL, "latest"]);
  return Math.floor(Number(BigInt(b) / 10n ** 14n)) / 1e4;
}

// 结算刚结束的那一周：只算一次；读不到钱包余额就不算（宁可晚，不能多分）
export async function settleWeek(kv, now = Date.now()) {
  if (!WK_POOL) return null;
  const cyc = addDays(weekStart(bjDay(now)), -7);
  if (cyc < WK_FROM || now < endAt(cyc)) return null;
  if (await kv.get("wk:res:" + cyc)) return null;
  if (await kv.get("wk:lock:" + cyc)) return null; /* 别的请求正在算 */
  await kv.put("wk:lock:" + cyc, "1", { expirationTtl: 120 });
  const bal = await poolBal();
  const pays = (await kv.get("wk:pay", "json")) || [], owed = owedOf(pays), avail = availOf(bal, owed);
  const b = await boardOf(kv, cyc, weekEnd(cyc)), top = split(b.top, avail);
  const res = { cyc, to: weekEnd(cyc), at: now, bal, owed, avail, n: b.n, top };
  if (await kv.get("wk:res:" + cyc)) return null;
  await kv.put("wk:res:" + cyc, JSON.stringify(res));
  const have = new Set(pays.map((x) => x.id));
  for (const w of top) {
    const id = "wk:" + cyc + ":" + w.a;
    if (!(w.amt > 0) || have.has(id)) continue;
    pays.push({ id, kind: "week", cyc, day: weekEnd(cyc), at: now, a: w.a, name: w.name, fee: w.fee, amt: w.amt });
  }
  await kv.put("wk:pay", JSON.stringify(pays.slice(-300)));
  return res;
}
