// 🚨 站长实时提醒（站长 2026-11-14 回「做」）：大奖开出、机器人断线、奖池不够发、收款钱包该清了 → 站长收件箱（小铃铛，开了通知的手机 / 电脑会弹）+ 后台工单
// 站长 2026-11-14 晚：「通过后台工单或者小铃铛站内信通知我，减少对第三方软件的依赖」→ 不发 DeBox，只走本站自己的两条路
// 只读、只发提醒：不转账、不改任何数据。同一类提醒在一段时间内只发一次（al:<类别>），情况没解决到点再催。
import { pushInbox, OWNER, OWNER_ALSO } from "./inbox.js";

export const BOT_LATE_MIN = 25, WALLET_MAX = 2000, LAG_BLOCKS = 3000;

// key：哪一类；ttl：多少秒内不重复发
export async function alertOwner(env, kv, key, ttl, txt, link) {
  const k = "al:" + key;
  if (await kv.get(k)) return false;
  await kv.put(k, String(Date.now()), { expirationTtl: Math.max(60, Math.round(ttl)) });
  const msg = "🚨 站长提醒\n" + txt;
  await pushInbox(kv, OWNER, "sys", msg, link || "#/inbox").catch(() => {});
  for (const x of OWNER_ALSO) await pushInbox(kv, x, "sys", msg, link || "#/inbox").catch(() => {}); // 抄送站长手机上的钱包
  await sysTicket(kv, msg, key).catch(() => {});
  return true;
}
// 后台工单里开一张「系统」单（和 Gas 看门狗同一套）：断线、奖池不够是 0 级（最急），其余 1 级
const KIND = { jackpot: [1, "预言家", "大奖开出"], pool: [0, "资金", "奖池不够发"], wallet: [1, "资金", "收款钱包该清"], bot: [0, "系统", "机器人断线"], lag: [1, "系统", "成交通知落后"], mm: [1, "系统", "做市机器人没挂单"] };
async function sysTicket(kv, txt, key) {
  const k = KIND[String(key).split(":")[0]] || [1, "系统", "站长提醒"];
  const id = Number((await kv.get("tk:seq")) || "0") + 1;
  await kv.put("tk:seq", String(id));
  await kv.put("tk:" + id, JSON.stringify({ id, a: "system", txt, n: 0, t: Date.now(), st: "new", note: "", tri: { ok: true, lv: k[0], cat: k[1], topic: k[2], why: "系统自动", dup: 0, ai: false } }), { expirationTtl: 180 * 86400 });
  await kv.put("tk:list", JSON.stringify(((await kv.get("tk:list", "json")) || []).concat(id).slice(-1000)));
  return id;
}

// ---- 各类提醒的判断：只算，不发（方便测试）；返回 [类别, 多久不重复(秒), 文字, 链接] 或 null ----
const n0 = (v) => Math.round(v).toLocaleString("en-US");
/* ⑥ 官方做市机器人没挂单（站长 2026-11-17「加提醒」：那天链变慢，机器人停了 80 分钟，站长自己来问才知道）。
   x = { mins 连续多少分钟盘口上没有它的买单, slow 链是不是变慢了, per 最近每个块几秒, dai 做市钱包里的 DAI }
   钱包里不到 MM_MIN_DAI：本来就挂不了单（站长把钱转走了），不提醒。链慢：机器人在自动等，只告知、不用处理，1 小时提一次；链正常却没单：多半停机了，半小时催一次 */
export const MM_IDLE_MIN = 10, MM_MIN_DAI = 25;
export function mmAlert(x) {
  if (!x || !(x.mins >= MM_IDLE_MIN) || !(x.dai >= MM_MIN_DAI)) return null;
  const m = Math.round(x.mins), money = "钱都在做市钱包里（约 " + n0(x.dai) + " DAI），没有丢。";
  if (x.slow) return ["mm:slow", 3600, "🤖 官方做市机器人已经 " + m + " 分钟没有挂买单。\n原因：链变慢了（最近每个块约 " + Math.round(x.per) + " 秒，平时 1 秒）。机器人在自动等，链恢复后会自己继续挂单，现在不用处理。\n" + money, "#/partner"];
  return ["mm:down", 1800, "🤖 官方做市机器人已经 " + m + " 分钟没有挂买单，而链是正常的 → 多半是机器人停机了。\n" + money + "\n请告诉技术人员去看一下。", "#/partner"];
}
// ① 大奖开出：o = /api/oracle 的返回
export function jackpotAlert(o) {
  const r = (o && o.drawing && o.drawing.res) || null;
  const w = r && r.jackpot && r.jackpot.winners;
  if (!w || !w.length) return null;
  return ["jackpot:" + r.day, 4 * 86400, "🎉 大奖开出了：" + r.day + " 神算子被 " + w.map((x) => x.name).join("、") + " 猜中，每人 " + (r.jackpot.eachAil ? r.jackpot.eachAil.toFixed(4) + " AiLGNS（≈ " + n0(r.jackpot.each) + " DAI）" : n0(r.jackpot.each) + " DAI") +
    "。\n接下来：中奖人烧名字 + 到 DeBox 宣告 → 你在工单后台「🏆 预言家中奖待认证」点「通过」→ 机器人自动发。先看一眼奖池钱包够不够。", "#/oracle"];
}
// ② 每日预言家奖池不够发：还没发的奖（按 AiLGNS 算）比奖池钱包里的多
export function dailyPoolAlert(o) {
  const f = o && o.funds, pays = (o && o.pays) || [];
  if (!f) return null;
  const due = pays.filter((x) => x && !x.tx && x.st !== "paid" && x.st !== "forfeit" && !x.forfeit);
  const need = due.reduce((t, x) => t + Number(x.ail || 0), 0);
  if (!(need > 0)) return null;
  const px = (f.otc && f.otc.px) || f.px || 0, wAil = Number(f.wAil !== undefined ? f.wAil : f.ail || 0), wDai = Number(f.wDai !== undefined ? f.wDai : f.dai || 0), have = wAil + (px ? wDai / px : 0); /* 用钱包实际余额比（funds.ail / dai 已经扣掉了欠的） */
  if (have >= need) return null;
  return ["pool:daily", 6 * 3600, "💰 每日预言家奖池不够发：还有 " + due.length + " 笔奖没发，共要 " + need.toFixed(4) + " AiLGNS，奖池钱包折合只有 " + have.toFixed(4) + " AiLGNS（" + wAil.toFixed(4) + " AiLGNS + " + n0(wDai) + " DAI），差 " + (need - have).toFixed(4) + " AiLGNS。\n补法：往奖池钱包 " + (f.wallet || "0xd69f…dba4") + " 转 AiLGNS 或 DAI（Anubis 链）。", "#/scan/" + (f.wallet || "")];
}
// ③ 极速预言家奖池不够发：这一期押得最多的那个数字如果开出来，要发的钱比奖池钱包（加上在路上的）多
export function fastPoolAlert(f) {
  if (!f || !f.v2 || !f.res || !Array.isArray(f.by)) return null;
  const top = Math.max.apply(null, f.by.map((x) => Number(x) || 0)), need = f.need != null ? Number(f.need) : top * (Number(f.payx) || 1.9), /* 猜中每张发多少跟着规则走（1.9 或 9.5） */ have = Number(f.res.dai || 0) + Number(f.transit || 0);
  if (!(need > 0) || have >= need) return null;
  return ["pool:fast", 3600, "⚡ 极速预言家奖池可能不够发：这一期最热的数字押了 " + top + " 张，开出来要发 " + n0(need) + " DAI，奖池钱包只有 " + n0(have) + " DAI（含在路上的），差 " + n0(need - have) + " DAI。\n补法：往极速奖池钱包 " + (f.pool || "") + " 转 DAI（Anubis 链），随时可以手动加。", "#/fast"];
}
// ④ 收款钱包该清了：ail / dai = 钱包余额，px = AiLGNS 现价；bjHour = 北京时间几点（夜里不催）
export function walletAlert(ail, dai, px, bjHour) {
  const total = Number(ail || 0) * Number(px || 0) + Number(dai || 0);
  if (!(total > WALLET_MAX) || bjHour < 8 || bjHour >= 23) return null;
  return ["wallet", 12 * 3600, "👛 收款钱包该清了：谷歌社交账号钱包现在约合 " + n0(total) + " DAI（" + Number(ail || 0).toFixed(4) + " AiLGNS + " + n0(dai) + " DAI），超过 " + n0(WALLET_MAX) + "。\n做法：钱包 → 转账 → 选 AiLGNS → 转到冷钱包；DAI 留够「正在转进极速奖池」的那部分，再留 2 DAI 当 Gas。", "#/funds"];
}
// ⑤ 机器人断线：hb = 上一次跑完一轮的时间（毫秒）
export function botAlert(hb, now) {
  if (!hb) return null;
  const min = Math.floor((now - hb) / 60000);
  if (min < BOT_LATE_MIN) return null;
  return ["bot", 3600, "🤖 机器人断线了：已经 " + min + " 分钟没跑完一轮（平时每 5 分钟一轮）。这期间成交通知、群播报、退款、发奖都会停。\n先看 GitHub 上 monita 仓库的 Actions 有没有在跑；看不懂就把这条截图发给 Claude。", "#/inbox"];
}
// ⑥ 成交通知落后：status = otc-watch 每个市场的进度
export function lagAlert(status) {
  const bad = Object.keys(status || {}).filter((k) => status[k] && status[k].behind > LAG_BLOCKS);
  if (!bad.length) return null;
  const worst = Math.max.apply(null, bad.map((k) => status[k].behind));
  return ["lag", 2 * 3600, "📨 成交通知落后了：" + bad.join("、") + " 市场落后约 " + Math.round(worst / 60) + " 分钟（" + worst + " 个区块），客户的成交提醒会迟到。系统在自己一段段补，持续一小时以上不见好再找 Claude。", "#/inbox"];
}

// 🐕 看门狗：机器人自己死了就没人调巡检接口，所以挂在访客最常打的价格接口上（缓存没命中时才跑，再加每个实例 2 分钟一次）
let wdAt = 0;
export async function watchdog(env) {
  const now = Date.now();
  if (now - wdAt < 120000) return;
  wdAt = now;
  const kv = env && env.TEAM_KV; if (!kv) return;
  const a = botAlert(Number(await kv.get("hb:watch")) || 0, now);
  if (a) await alertOwner(env, kv, a[0], a[1], a[2], a[3]);
}
