// 开心农场（仿 QQ 农场 / 牧场）：种菜、养鸡、偷好友的菜和鸡蛋
// 金币：免费送、每日签到送、种菜养鸡赚，也可以用 Anubis 链 LGNS 充值（站长 2026-11-12 定：充值的 LGNS 全部进运营资金 FARM_PAY，后期手动处理；以前是进销毁乐园收款合约 80% 销毁、20% 运营）。金币只能花，换不回币，没有奖金
// 身份：钱包签一条固定文字（不是交易、不花 Gas），7 天内有效；KV：farm:u:<地址> 存农场，farm:list 存最近活跃的农场主，farm:burn 存充值销毁统计
import { recoverAddress } from "./evmsig.js";
import { CHAINS, rpc } from "./pixel.js";
import { pushInbox } from "./inbox.js";
import { claim as brClaim } from "./br.js";
import { selfReg, primaryLabels, loadOwnIndex, nameIsOwn } from "./oracle.js";

export const CROPS = {
  cabbage: { name: "白菜", icon: "🥬", seed: 10, grow: 5 * 60, yield: 5, price: 4, xp: 2, lv: 1 },
  carrot: { name: "胡萝卜", icon: "🥕", seed: 20, grow: 30 * 60, yield: 6, price: 7, xp: 5, lv: 1 },
  /* 站长 2026-11-18「可以，做韭菜」（客户建议）：韭菜自己不能收，只能等别人来割。别人割了 → 地主拿全额（yield × price），割的人另拿四成（系统给，不从地主那里扣）；
     狗和警察不拦割韭菜。熟了 CHIVE_SELF 这么久还没人割，地主才能自己收一半（正好回本） */
  chive: { name: "韭菜", icon: "🌿", seed: 30, grow: 3600, yield: 10, price: 6, xp: 8, lv: 2, cut: true },
  corn: { name: "玉米", icon: "🌽", seed: 40, grow: 2 * 3600, yield: 8, price: 10, xp: 10, lv: 2 },
  tomato: { name: "番茄", icon: "🍅", seed: 60, grow: 4 * 3600, yield: 8, price: 16, xp: 15, lv: 3 },
  melon: { name: "西瓜", icon: "🍉", seed: 100, grow: 8 * 3600, yield: 6, price: 36, xp: 25, lv: 4 },
  berry: { name: "草莓", icon: "🍓", seed: 150, grow: 12 * 3600, yield: 10, price: 30, xp: 35, lv: 5 },
  /* 站长 2026-11-18「做新作物」（客户建议）：给高等级老玩家的三种慢作物，越往后越贵、越久、赚得越多；每小时净赚不超过黄金南瓜（25），不抢充值玩家的专属 */
  pineapple: { name: "菠萝", icon: "🍍", seed: 300, grow: 18 * 3600, yield: 10, price: 55, xp: 50, lv: 8 },
  mango: { name: "芒果", icon: "🥭", seed: 500, grow: 24 * 3600, yield: 10, price: 90, xp: 80, lv: 12 },
  moneytree: { name: "摇钱树", icon: "💰", seed: 2000, grow: 48 * 3600, yield: 8, price: 400, xp: 200, lv: 15, art: "tree" }, /* art：页面上用自己画的摇钱树（工单 #380「图标太丑」），文字提示里还是 💰 */ // 结 8 个金元宝，每个 400
  pumpkin: { name: "黄金南瓜", icon: "🎃", seed: 1000, grow: 24 * 3600, yield: 10, price: 160, xp: 120, lv: 1, vip: true } // 充值玩家专属
};
// 充值档位（只收 Anubis 链 LGNS）：1 LGNS = 100 金币，档位越大送得越多；第一次充值金币翻倍
export const PACKS = [{ lgns: 10, coins: 1000 }, { lgns: 50, coins: 5500 }, { lgns: 100, coins: 12000 }, { lgns: 500, coins: 65000 }];
export const FARM_PAY = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; /* 谷歌社交账号钱包（所有收入），lib/addresses.js 里有登记 */
export const TAG = "4641"; // 转账数据末尾附「FA（4641）+ sha256("farm")」，认出这是农场充值
export const DOG_PRICE = 1500, DOG_TIME = 3 * 86400, DOG_MAX = 30 * 86400, DOG_BITE = 20; // 看门狗：3 天 1500 金币，最多叠 30 天；偷菜的被咬赔 20 金币
// 2026-11-12 站长按客户建议改：以前有狗完全偷不了、别人还看得见狗，结果家家有狗没人偷、没意思。
// 现在：别人看不到谁家有狗；有狗时来偷的一半机会被咬（空手 + 赔 20），一半机会得手但最多偷走一半的东西。
// 改规则前买的狗（当时说的是「没人偷得了」）：剩余时间翻一倍作补偿，每人只补一次（u.dg = 2 记着）
export const DOG_CATCH = 0.5, DOG_V2 = 1794464921;
// 2026-11-12 客户反馈「看门狗看不了家」：加一档更贵的警察。警察在岗时来偷的一定被抓，空手而归，罚 100 金币给农场主；
// 别人同样看不出谁家有警察。价钱是狗的 3 倍多，免得又变成家家都有、没人偷。狗和警察同时有，按警察算
export const COP_PRICE = 5000, COP_TIME = 3 * 86400, COP_MAX = 30 * 86400, COP_FINE = 150; // 罚金 2026-11-17 从 100 提到 150（抓人概率降了，罚得重一点，警察才值这个价）
/* 站长 2026-11-15：「农场警察抓人能力太强了，我偷了50家，好多都被警察抓了，要不设置一下，警察休息，或者打瞌睡？」
   → 警察会打瞌睡：每次有人来偷，COP_NAP 的机会警察在打瞌睡，那一次按没有警察算（家里有狗就看狗）。
   改规则前请的警察（当时说的是「一定被抓」）：剩余时间加长一半作补偿，每人只补一次（u.cg = 1 记着），见 copFix */
export const COP_NAP = 0.5;
/* 站长 2026-11-24：「警察打盹，别人来偷东西，不能全偷，要有比例，比如那个发财树这么贵，只能偷个 10%，不能全部，要不太心疼了」
   → 有警察在岗的农场，就算被偷成了（警察打瞌睡 / 对方今天第一次必得手 / 复仇），每块地这一次最多被偷走这块地的 COP_TAKE（一成）；鸡蛋、牛奶不变。
   没请警察的照旧：一次偷一颗。「每块地合计最多被偷走四成」这条两边都还在。
   摇钱树一块值 3200：以前一次被偷 400，现在有警察一次只丢 320；白菜一块 20，一次只丢 2。 */
export const COP_TAKE = 0.1;
export const stealBite = (c, cop) => (cop ? Math.min(1, Math.round(c.yield * COP_TAKE * 100) / 100) : 1); // 这一次从一块地偷走几颗（有警察时可以不到一颗）
/* 站长 2026-11-17：「完全按照你的建议来，反正金币不要钱，也不能兑换，就是让客户有成就感」。这一批：
   ① 警察抓住的机会 70% → 50%（打瞌睡 30% → 50%），和狗一样；罚金 100 → 150。之前请的警察（当时说的是 70%）剩余时间加长四成作补偿，每人只补一次（u.cg2），见 copFix2
   ② 每天第一次偷必得手：不管对方有没有狗、警察，都能全偷到（FIRST_FREE）
   ③ 复仇：被谁偷成了，2 天内可以去他家「偷回去」一次，那一次同样不会被拦（u.rv 记着；复仇得手不再给对方反过来复仇的机会，免得两个人无限互偷绕开看家） */
export const FIRST_FREE = true, REVENGE_TIME = 2 * 86400;
// 剩余时间写成「3 天 10 小时」（续买是在原来剩的时间上接着加，以前四舍五入成「3 天」看不出来）
const dhText = (sec) => { const h = Math.ceil(sec / 3600); return h >= 24 ? Math.floor(h / 24) + " 天" + (h % 24 ? " " + (h % 24) + " 小时" : "") : h + " 小时"; };
/* 2026-11-19 客户建议（站长转来）：「金鸡的数量太少，只能 2 个」「土地要扩」→ 金鸡上限 2 → 5，地上限 12 → 18（价钱照原来的规律往上排：第 13 块 3500 … 第 18 块 6000）。
   提这个建议的访客已经 12 块地、20 级、两万多金币没处花。金币不提现、不转赠、不上链，多给点能买的东西只增加成就感 */
export const GOLD_HEN = { price: 3000, max: 5, egg: 80 }; // 金鸡：充值玩家专属，金蛋 80 金币
export const BOOST = 2; // 化肥：每催熟 10 分钟 2 金币
export const DAILY = 50, DAILY_VIP = 200; // 每日签到：普通 50，充值过的 200
export const KING = 100; // 累计充值 100 LGNS 以上：👑 农场主
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const START_COINS = 200, START_PLOTS = 6, MAX_PLOTS = 18;
/* 站长 2026-11-18「做奶牛」（客户建议）：和鸡一个道理，只是更贵、更慢、更值钱。一头 2000 金币、最多 3 头；喂一次 30 金币管 12 小时（最多预存 36 小时）；
   喂饱的时间里每 4 小时产 1 瓶奶、每头最多攒 3 瓶，一瓶 120 金币；攒到 2 瓶起别人能偷 1 瓶。存在 u.cows 里，字段和鸡一样（fed / last / eggs / th），eggs 就是奶的瓶数 */
export const COW = { price: 2000, max: 3, feed: 30, feedTime: 12 * 3600, maxFed: 36 * 3600, milkTime: 4 * 3600, maxMilk: 3, milk: 120 };
/* 站长 2026-11-18「做装饰」（客户建议）：只为好看、没有任何功能，是农场里唯一纯花金币的东西。每样只能买一个，买了永久有；
   摆在自己农场顶上那幅画里，好友列表和金币榜上名字后面也显示（存在 u.decor，榜单用的小图标串存在 farm:list 的 dc 里） */
export const DECOR = {
  flower: { name: "花坛", icon: "🌷", price: 1000 },
  fountain: { name: "喷泉", icon: "⛲", price: 3000 },
  statue: { name: "石像", icon: "🗿", price: 6000 },
  rainbow: { name: "彩虹", icon: "🌈", price: 10000 },
  castle: { name: "城堡", icon: "🏰", price: 20000 }
};
const decoIcons = (u) => (u.decor || []).map((k) => (DECOR[k] ? DECOR[k].icon : "")).join("");
export const HEN_PRICE = 300, MAX_HENS = 6, FEED_COST = 10, FEED_TIME = 8 * 3600, MAX_FED = 24 * 3600, EGG_TIME = 2 * 3600, MAX_EGGS = 4, EGG_PRICE = 25;
export const STEAL_SHARE = 0.4; // 每块地最多被偷走 40%，农场主至少留 60%
export const STEAL_DAY = 50; // 每人每天最多偷 50 次
// 站长 2026-11-12：一键偷菜保底。一轮一键偷菜（带同一个 batch 编号）偷完要是净亏，系统补回到 0；被罚的金币照样归农场主。
// 补的金币是系统发的，所以每人每天最多补 BAODI_DAY，防止有人串通（一个请警察、一个专门去被抓）刷金币。单独点「偷」不保底
// 2026-11-17 站长截图：一键偷菜一轮被抓 8 家亏了 186，保底只补到 100，结果还是 -86。警察罚金提到 150 以后，一轮被抓两次就超过 100 了。
// 站长要的是「一键偷菜不会亏」→ 每天上限提到 1000。串通刷金币的口子也跟着变大（一天最多刷 1000 金币 = 充值 10 LGNS 的量），金币不能提现、不能转赠，可以接受
export const BAODI_DAY = 1000;
const SIGN_DAYS = 7, LIST_MAX = 300;

export const CHIVE_SELF = 24 * 3600; // 韭菜熟了这么久没人割，地主才能自己收一半
/* 站长 2026-11-24（工单 #380）：韭菜改成「割的人和地主对半分」，金额调高，来割的人越穷割得越多。
   一块韭菜割下来的总数 = CHIVE_BASE × 倍数，两边各拿一半；倍数看来割的人动手那一刻手里的金币：不到 500 → 2 倍，不到 5000 → 1.5 倍，其余 1 倍。
   1 倍时地主拿 60，和以前一样；割的人从 24 涨到 60。熟了 24 小时没人割、地主自己收一半（30）不变。 */
export const CHIVE_BASE = 120, CHIVE_TIERS = [[500, 2], [5000, 1.5]];
export const chiveMul = (coins) => { for (const [lim, m] of CHIVE_TIERS) if (Number(coins) < lim) return m; return 1; };
export const chiveHalf = (coins) => Math.floor((CHIVE_BASE * chiveMul(coins)) / 2); // 割一块，地主和割的人每人拿多少
export const plotPrice = (n) => 500 * (n - START_PLOTS + 1); // 第 7 块地 500，第 8 块 1000…
export const level = (xp) => Math.floor(Math.sqrt(xp / 10)) + 1;
export const signText = (addr, day) => "AiLGNS 开心农场\n用这个钱包进入农场：" + addr + "\n只是签名确认身份，不是转账，不花 Gas。\n日期：" + day;
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a);
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

/* 🌐 主名字门槛（站长 2026-11-25：「农场限制一下，只有注册域名，绑定主域名才能玩，才能上榜」）
   · 每个农场操作前先看这个钱包有没有 .ailgns 主名字；没有就不让操作（金币、地、鸡都原样留着，设好主名字马上能回来）
   · 有主名字的记 1 小时（KV farm:nm:<地址>），不用每点一下都去读链；没有的不记，这样客户刚设好就能进
   · 链读不到时放行（返回 null）：绝不因为节点出问题把本来能玩的人挡在外面
   · 榜单 / 偷菜名单只列有主名字的农场：farm:list 里每家记 nm（1 有 / 0 没有）和 nc（上次核对时间），
     老农场在别人打开名单时分批补查（一次最多 NAME_BATCH 家），所以上线后头几分钟名单会从少到多 */
export const NEED_NAME = "农场现在要先有 .ailgns 主名字才能玩：到「域名」页注册一个名字，再点进名字选「设为我的主名字」。你的金币、地和鸡都还在，设好马上能回来。";
/* 2026-11-26 站长再定：「只有新买的域名才能拥有这些权限，去二级市场购买的没用」→ 主名字必须是自己注册的（或者是创世域名）；买来的、别人转来的普通名字不算。
   数法和每日预言家一样（lib/oracle.js selfReg）。缓存键换成 farm:own:，老的 farm:nm:（只看有没有名字）不再用 */
export const needOwn = (name) => "你的主名字 " + name + " 是买来或别人转来的，农场只认自己注册的主名字：到「域名」页自己注册一个名字（普通名字 5 DAI 起），再把它设为主名字。你的金币、地和鸡都还在，设好马上能回来。";
const LIST_V = 2; // farm:list 里 nm 标记的版本：2 = 按「自己注册的主名字」核对过
const NAME_TTL = 3600, NAME_RECHECK = 6 * 3600, NAME_BATCH = 100;
const namedNow = new Set(); // 这一次请求里刚核对过有主名字的地址：save() 写名单时顺手标上
export async function nameOk(kv, addr) { // true 能玩 / null 读不到（放行）/ 一句话 = 不能玩的原因
  try { if (await kv.get("farm:own:" + addr)) return true; } catch (e) { /* 读不到缓存就去读链 */ }
  let r;
  try { r = await selfReg(kv, addr); } catch (e) { return null; }
  if (!r.name) return NEED_NAME;
  if (r.ok === null) return null;
  if (!r.ok) return needOwn(r.name);
  try { await kv.put("farm:own:" + addr, "1", { expirationTtl: NAME_TTL }); } catch (e) { /* 记不上不要紧 */ }
  return true;
}
export function auth(b) {
  const addr = String(b.addr || "").toLowerCase(), day = String(b.day || "");
  if (!isAddr(addr)) throw new Error("地址格式不对");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("请重新签名进入农场");
  const age = Date.now() - Date.parse(day + "T00:00:00+08:00");
  if (age < -86400e3 || age > SIGN_DAYS * 86400e3) throw new Error("签名过期了，请重新签名进入农场");
  if (recoverAddress(signText(addr, day), String(b.sig || "")) !== addr) throw new Error("签名核对失败，请重新签名");
  return addr;
}

export function fresh() {
  return { coins: START_COINS, xp: 0, plots: Array.from({ length: START_PLOTS }, () => null), hens: [], log: [], steals: { d: "", n: 0 }, born: now(), paid: 0, dog: 0, dg: 2, daily: "" };
}
export async function load(kv, addr) { return (await kv.get("farm:u:" + addr, "json")) || null; }

// 鸡下蛋：喂饱的时间里每 2 小时下 1 个，每只最多攒 4 个
function lay(h, t, step = EGG_TIME, max = MAX_EGGS) {
  const end = Math.min(t, h.fed);
  if (end > h.last) {
    const n = Math.floor((end - h.last) / step);
    h.eggs = Math.min(max, h.eggs + n);
    h.last += n * step;
    if (h.eggs >= max) h.last = Math.max(h.last, end);
  }
}
const milk = (c, t) => lay(c, t, COW.milkTime, COW.maxMilk); // 奶牛产奶：同一套算法，4 小时一瓶、最多 3 瓶
function ripeAt(p) { return p ? p.t + CROPS[p.c].grow : Infinity; }
// 好友列表里给别人看的提示：最早什么时候有东西可偷
function nextRipe(u, t) {
  let r = Infinity;
  for (const p of u.plots) if (p && p.stolen < Math.floor(CROPS[p.c].yield * STEAL_SHARE)) r = Math.min(r, ripeAt(p));
  for (const h of u.hens) { lay(h, t); if (h.eggs >= 2) r = Math.min(r, t); else if (h.fed > t) r = Math.min(r, h.last + EGG_TIME * (2 - h.eggs)); }
  for (const c of u.cows || []) { milk(c, t); if (c.eggs >= 2) r = Math.min(r, t); else if (c.fed > t) r = Math.min(r, c.last + COW.milkTime * (2 - c.eggs)); }
  return r === Infinity ? 0 : r;
}
// who：这条动态里提到的那个钱包的完整地址，页面拿它换成域名显示（站长 2026-11-12「农场动态显示域名」）
function note(u, text, who) { u.log.unshift(who ? { t: now(), m: text, a: who } : { t: now(), m: text }); u.log.length = Math.min(u.log.length, 20); }
// 以前的动态只存了短地址：每人补一次，从活跃农场名单里把完整地址对回来（对不上的就还显示短地址）
async function logFix(kv, u) {
  if (!u || u.lg) return;
  u.lg = 1;
  const old = u.log.filter((l) => !l.a && /0x[0-9a-f]{4}…[0-9a-f]{4}/.test(l.m));
  if (!old.length) return;
  const full = {};
  for (const a of Object.keys((await kv.get("farm:list", "json")) || {})) full[short(a)] = a;
  old.forEach((l) => { const a = full[l.m.match(/0x[0-9a-f]{4}…[0-9a-f]{4}/)[0]]; if (a) l.a = a; });
}
// 老狗补偿：改规则那一刻还没到期的狗，剩下的时间翻一倍；补完马上存，保证只补一次、通知只发一次
async function dogFix(kv, addr, u) {
  if (!u || u.dg) return;
  u.dg = 2;
  if ((u.dog || 0) <= DOG_V2) return;
  u.dog += u.dog - DOG_V2;
  const m = "🐕 看门狗规则调整：现在别人看不到谁家有狗；来偷的一半机会被咬（赔你 " + DOG_BITE + " 金币），没被咬也最多偷走一半。你之前请的狗，剩余时间已经翻了一倍作为补偿";
  note(u, m);
  await save(kv, addr, u);
  try { await pushInbox(kv, addr, "sys", "🏡 开心农场\n" + m, "#/farm"); } catch (e) { /* 通知发不出不影响游戏 */ }
}

/* 老警察补偿：第一次碰到这个农场时警察还在岗的，剩下的时间加长一半；补完马上存，保证只补一次、通知只发一次 */
async function copFix2(kv, addr, u) {
  if (!u || u.cg2) return;
  u.cg2 = 1;
  const t = now();
  if ((u.cop || 0) <= t) return;
  u.cop += Math.round((u.cop - t) * 0.4);
  const m = "👮 警察规则调整：现在警察抓住小偷的机会是 " + Math.round((1 - COP_NAP) * 100) + "%（以前是 70%），抓住了罚 " + COP_FINE + " 金币给你（以前是 100）。你之前请的警察，剩余时间已经加长四成作为补偿";
  note(u, m);
  await save(kv, addr, u);
  try { await pushInbox(kv, addr, "sys", "🏡 开心农场\n" + m, "#/farm"); } catch (e) { /* 通知发不出不影响游戏 */ }
}
async function copFix(kv, addr, u) {
  if (!u || u.cg) return;
  u.cg = 1;
  const t = now();
  if ((u.cop || 0) <= t) return;
  u.cop += Math.round((u.cop - t) / 2);
  const m = "👮 警察规则调整：警察现在偶尔会打瞌睡（" + Math.round(COP_NAP * 100) + "% 的机会），那一次拦不住小偷；其余时候照旧一定抓住，罚 " + COP_FINE + " 金币给你。你之前请的警察，剩余时间已经加长一半作为补偿";
  note(u, m);
  await save(kv, addr, u);
  try { await pushInbox(kv, addr, "sys", "🏡 开心农场\n" + m, "#/farm"); } catch (e) { /* 通知发不出不影响游戏 */ }
}

export async function save(kv, addr, u) {
  const t = now();
  await kv.put("farm:u:" + addr, JSON.stringify(u));
  const list = (await kv.get("farm:list", "json")) || {};
  const prev = list[addr] || {};
  list[addr] = { c: u.coins, lv: level(u.xp), t, r: nextRipe(u, t), p: u.paid || 0, d: (u.dog || 0) > t ? 1 : 0 };
  if (namedNow.has(addr)) { list[addr].nm = 1; list[addr].nc = t; list[addr].nv = LIST_V; } // 刚核对过：主名字是自己注册的
  else { if (prev.nm !== undefined) list[addr].nm = prev.nm; if (prev.nc) list[addr].nc = prev.nc; if (prev.nv) list[addr].nv = prev.nv; } // 别人动到这家（被偷、发奖励）时保持原来的标记
  if (u.decor && u.decor.length) list[addr].dc = decoIcons(u); // 装饰：榜单上名字后面显示
  const keys = Object.keys(list);
  if (keys.length > LIST_MAX) keys.sort((a, b) => list[a].t - list[b].t).slice(0, keys.length - LIST_MAX).forEach((k) => delete list[k]);
  await kv.put("farm:list", JSON.stringify(list));
}

// 公开视图：别人来串门看到的样子（偷菜用）
export function view(u, t = now()) {
  u.hens.forEach((h) => lay(h, t));
  (u.cows || (u.cows = [])).forEach((c) => milk(c, t));
  return { coins: u.coins, xp: u.xp, lv: level(u.xp), plots: u.plots, hens: u.hens, cows: u.cows || [], decor: u.decor || [], log: u.log, steals: u.steals, paid: u.paid || 0, dog: u.dog || 0, cop: u.cop || 0, daily: u.daily || "", rv: u.rv || {}, now: t };
}

export async function act(kv, b) {
  const addr = auth(b), t = now();
  const named = await nameOk(kv, addr);
  if (typeof named === "string") {
    try { const l0 = (await kv.get("farm:list", "json")) || {}; if (l0[addr] && (l0[addr].nm !== 0 || l0[addr].nv !== LIST_V)) { l0[addr].nm = 0; l0[addr].nc = t; l0[addr].nv = LIST_V; await kv.put("farm:list", JSON.stringify(l0)); } } catch (e) { /* 名单改不上不影响拦人 */ }
    throw new Error(named);
  }
  if (named === true) namedNow.add(addr);
  let u = await load(kv, addr);
  const isNew = !u;
  if (!u) u = fresh();
  await dogFix(kv, addr, u);
  await copFix(kv, addr, u);
  await copFix2(kv, addr, u);
  await logFix(kv, u);
  try { await brClaim(kv, u, t); } catch (e) { /* 大逃杀上一局结不了不影响农场，下次再结 */ }
  u.hens.forEach((h) => lay(h, t));
  (u.cows || (u.cows = [])).forEach((c) => milk(c, t));
  const a = String(b.a || "me");
  const need = (c) => { if (u.coins < c) throw new Error("金币不够：需要 " + c + "，你有 " + u.coins); u.coins -= c; };
  const plotAt = (i) => { i = Number(i); if (!(i >= 0 && i < u.plots.length)) throw new Error("没有这块地"); return i; };
  let msg = "", more = null; // more：这一次动作另外带回页面的明细（偷菜：偷了哪些东西、得多少金币、割了几块韭菜——工单 #330）

  if (a === "me") {
    msg = isNew ? "欢迎来到开心农场！送你 " + START_COINS + " 金币，先种点白菜吧" : "";
    if (u.daily !== today()) {
      const g = u.paid ? DAILY_VIP : DAILY;
      u.daily = today(); u.coins += g;
      if (!isNew) msg = "每日签到 +" + g + " 金币" + (u.paid ? "（充值玩家 4 倍）" : "，充值过的每天送 " + DAILY_VIP);
    }
  }
  else if (a === "plant") {
    const i = plotAt(b.plot), c = CROPS[b.crop];
    if (!c) throw new Error("没有这种种子");
    if (level(u.xp) < c.lv) throw new Error(c.name + " 要 " + c.lv + " 级才能种");
    if (c.vip && !u.paid) throw new Error(c.name + "是充值玩家专属，充值任意一档就能种");
    if (u.plots[i]) throw new Error("这块地已经种了");
    need(c.seed);
    u.plots[i] = { c: b.crop, t, stolen: 0, th: [] };
    msg = "种下了" + c.icon + c.name + "，" + fmtTime(c.grow) + "后成熟" + (c.cut ? "。韭菜自己不能收，等别人来割，割下来两人对半分，你至少得 " + chiveHalf(Infinity) + " 金币" : "");
  } else if (a === "plantAll") { // 🌱 一键种菜（工单 #380）：所有空地种上同一种；金币不够就种到够的那一块为止
    const c = Object.prototype.hasOwnProperty.call(CROPS, String(b.crop)) ? CROPS[b.crop] : null;
    if (!c) throw new Error("没有这种种子");
    if (level(u.xp) < c.lv) throw new Error(c.name + " 要 " + c.lv + " 级才能种");
    if (c.vip && !u.paid) throw new Error(c.name + "是充值玩家专属，充值任意一档就能种");
    const empty = u.plots.filter((p) => !p).length;
    if (!empty) throw new Error("没有空地了");
    let n = 0;
    for (let i = 0; i < u.plots.length; i++) { if (u.plots[i]) continue; if (u.coins < c.seed) break; u.coins -= c.seed; u.plots[i] = { c: b.crop, t, stolen: 0, th: [] }; n++; }
    if (!n) throw new Error("金币不够：一块要 " + c.seed + "，你有 " + u.coins);
    msg = "一键种下了" + c.icon + c.name + " × " + n + "，" + fmtTime(c.grow) + "后成熟" + (n < empty ? "；金币不够，还有 " + (empty - n) + " 块空着" : "") + (c.cut ? "。韭菜自己不能收，等别人来割" : "");
  } else if (a === "harvest") {
    let got = 0, n = 0, wait = 0;
    u.plots.forEach((p, i) => {
      if (!p || ripeAt(p) > t) return;
      const c = CROPS[p.c], left = c.yield - p.stolen;
      if (c.cut) { if (t < ripeAt(p) + CHIVE_SELF) { wait++; return; } got += Math.floor(c.yield / 2) * c.price; } // 韭菜：没人割满 24 小时，自己只能收一半
      else got += Math.round(left * c.price); // 有警察时被偷的可以不到一颗，四舍五入到整数金币
      u.xp += c.xp; n++;
      u.plots[i] = null;
    });
    if (!n) throw new Error(wait ? "韭菜自己不能收，要等别人来割；熟了 24 小时还没人割，才能自己收一半" : "还没有成熟的菜");
    u.coins += got;
    msg = "收了 " + n + " 块地，卖得 " + got + " 金币";
  } else if (a === "buyPlot") {
    if (u.plots.length >= MAX_PLOTS) throw new Error("地已经买满了");
    need(plotPrice(u.plots.length));
    u.plots.push(null);
    msg = "开垦了一块新地";
  } else if (a === "buyHen") {
    if (u.hens.filter((h) => !h.g).length >= MAX_HENS) throw new Error("鸡舍满了（最多 " + MAX_HENS + " 只）");
    need(HEN_PRICE);
    u.hens.push({ fed: t + FEED_TIME, last: t, eggs: 0, th: [] });
    msg = "买了一只小母鸡🐔，已经喂饱了";
  } else if (a === "feed") {
    const hungry = u.hens.filter((h) => h.fed - t < MAX_FED - FEED_TIME);
    if (!hungry.length) throw new Error("鸡都吃饱了");
    need(FEED_COST * hungry.length);
    hungry.forEach((h) => { if (h.fed < t) { h.fed = t; h.last = t; } h.fed = Math.min(t + MAX_FED, h.fed + FEED_TIME); });
    msg = "喂了 " + hungry.length + " 只鸡";
  } else if (a === "eggs") {
    const n = u.hens.reduce((s, h) => s + h.eggs, 0), got = u.hens.reduce((s, h) => s + h.eggs * eggPrice(h), 0);
    if (!n) throw new Error("还没有蛋");
    u.hens.forEach((h) => { h.eggs = 0; h.th = []; });
    u.coins += got; u.xp += n;
    msg = "捡了 " + n + " 个蛋，卖得 " + got + " 金币";
  } else if (a === "buyCow") {
    if (u.cows.length >= COW.max) throw new Error("牛棚满了（最多 " + COW.max + " 头）");
    need(COW.price);
    u.cows.push({ fed: t + COW.feedTime, last: t, eggs: 0, th: [] });
    msg = "买了一头奶牛🐄，已经喂饱了，每 " + COW.milkTime / 3600 + " 小时产 1 瓶奶";
  } else if (a === "feedCow") {
    const hungry = u.cows.filter((c) => c.fed - t < COW.maxFed - COW.feedTime);
    if (!hungry.length) throw new Error(u.cows.length ? "牛都吃饱了" : "还没有奶牛");
    need(COW.feed * hungry.length);
    hungry.forEach((c) => { if (c.fed < t) { c.fed = t; c.last = t; } c.fed = Math.min(t + COW.maxFed, c.fed + COW.feedTime); });
    msg = "喂了 " + hungry.length + " 头牛";
  } else if (a === "milk") {
    const n = u.cows.reduce((s, c) => s + c.eggs, 0);
    if (!n) throw new Error("还没有奶");
    u.cows.forEach((c) => { c.eggs = 0; c.th = []; });
    u.coins += n * COW.milk; u.xp += n * 3;
    msg = "挤了 " + n + " 瓶奶，卖得 " + n * COW.milk + " 金币";
  } else if (a === "buyDecor") {
    const k = String(b.k || ""), d = Object.prototype.hasOwnProperty.call(DECOR, k) ? DECOR[k] : null;
    if (!d) throw new Error("没有这个装饰");
    if (!u.decor) u.decor = [];
    if (u.decor.includes(k)) throw new Error("你已经有" + d.name + "了");
    need(d.price);
    u.decor.push(k);
    msg = "🎉 买了" + d.icon + d.name + "，已经摆在你的农场里，榜单上你的名字后面也会显示";
  } else if (a === "boost") {
    const i = plotAt(b.plot), p = u.plots[i];
    if (!p || ripeAt(p) <= t) throw new Error("这块地不用催熟");
    const cost = boostCost(ripeAt(p) - t);
    need(cost);
    p.t -= ripeAt(p) - t;
    msg = "⚡ 施了化肥，" + CROPS[p.c].name + "马上成熟了（花 " + cost + " 金币）";
  } else if (a === "dog") {
    need(DOG_PRICE);
    u.dog = Math.min(t + DOG_MAX, Math.max(u.dog || 0, t) + DOG_TIME);
    msg = "🐕 看门狗上岗，" + dhText(u.dog - t) + "内来偷的一半会被咬，没被咬也最多偷走一半";
  } else if (a === "cop") {
    need(COP_PRICE);
    u.cop = Math.min(t + COP_MAX, Math.max(u.cop || 0, t) + COP_TIME);
    msg = "👮 警察上岗 " + dhText(u.cop - t) + "：来偷的被抓就一颗也偷不走，还罚 " + COP_FINE + " 金币给你；警察有 " + Math.round(COP_NAP * 100) + "% 的机会在打瞌睡，那一次拦不住，但每块地最多被偷走 " + Math.round(COP_TAKE * 100) + "%";
  } else if (a === "goldHen") {
    if (!u.paid) throw new Error("金鸡是充值玩家专属，充值任意一档就能买");
    if (u.hens.filter((h) => h.g).length >= GOLD_HEN.max) throw new Error("金鸡最多 " + GOLD_HEN.max + " 只");
    if (u.hens.length >= MAX_HENS + GOLD_HEN.max) throw new Error("鸡舍满了");
    need(GOLD_HEN.price);
    u.hens.push({ fed: t + FEED_TIME, last: t, eggs: 0, th: [], g: true });
    msg = "买了一只金鸡🐓，金蛋每个 " + GOLD_HEN.egg + " 金币";
  } else if (a === "steal") {
    const to = String(b.to || "").toLowerCase();
    if (!isAddr(to) || to === addr) throw new Error("不能偷自己的");
    const d = today();
    if (u.steals.d !== d) u.steals = { d, n: 0 };
    if (u.steals.n >= STEAL_DAY) throw new Error("今天已经偷了 " + STEAL_DAY + " 次，明天再来");
    const v = await load(kv, to);
    if (!v) throw new Error("对方还没有农场");
    await dogFix(kv, to, v);
    await copFix(kv, to, v);
    await copFix2(kv, to, v);
    v.hens.forEach((h) => lay(h, t));
    (v.cows || []).forEach((c) => milk(c, t));
    const picks = []; // 这次能偷的东西
    const copOn = (v.cop || 0) > t; // 这家有警察在岗：这一次每块地最多偷走一成（stealBite）
    v.plots.forEach((p) => {
      if (!p || ripeAt(p) > t || p.th.includes(addr)) return;
      const c = CROPS[p.c];
      if (c.cut) return; // 韭菜不算偷，下面单独割
      const bite = stealBite(c, copOn);
      if (p.stolen + bite > Math.floor(c.yield * STEAL_SHARE) + 1e-9) return; // 合计最多被偷走四成
      picks.push({ p, u: bite, v: Math.floor(c.price * bite), ic: c.icon });
    });
    v.hens.forEach((h) => {
      if (h.eggs < 2 || h.th.includes(addr)) return;
      picks.push({ h, v: eggPrice(h), ic: h.g ? "🟡" : "🥚" });
    });
    (v.cows || []).forEach((c) => { // 奶牛：攒到 2 瓶起能偷 1 瓶，和偷蛋一个规矩
      if (c.eggs < 2 || c.th.includes(addr)) return;
      picks.push({ h: c, v: COW.milk, ic: "🥛" });
    });
    const cuts = []; // 熟了的韭菜（第几块地）：谁来都能割，狗和警察不拦；一天最多去 STEAL_DAY 家割
    if ((u.steals.c || 0) < STEAL_DAY) v.plots.forEach((p, i) => { if (p && CROPS[p.c].cut && ripeAt(p) <= t) cuts.push(i); });
    if (!picks.length && !cuts.length) throw new Error("没有能偷的：菜没熟、被偷光了，或者你已经偷过了");
    const batch = String(b.batch || "").slice(0, 24); // 一键偷菜的这一轮编号；单独偷没有
    const book = (n) => { if (!batch) return; if (!u.bt || u.bt.id !== batch) u.bt = { id: batch, net: 0 }; u.bt.net += n; };
    let cutMsg = "", cutInfo = null;
    if (cuts.length) { // 割韭菜：割下来地主和割的人对半分，割的人越穷割得越多（chiveHalf）；不算偷——不占「今天第一次必得手」、不给对方复仇、狗和警察不管
      let own = 0, mine = 0;
      const half = chiveHalf(u.coins); // 按动手这一刻的金币定倍数，这一趟割的每一块都一样
      cuts.forEach((i) => { const c = CROPS[v.plots[i].c]; own += half; mine += half; v.xp += c.xp; v.plots[i] = null; });
      v.coins += own; u.coins += mine; u.steals.c = (u.steals.c || 0) + 1; book(mine);
      note(v, "🌿 " + short(addr) + " 帮你割了 " + cuts.length + " 块韭菜，对半分，你得 " + own + " 金币", addr);
      note(u, "去 " + short(to) + " 家割了 " + cuts.length + " 块韭菜，对半分，得 " + mine + " 金币", to);
      cutMsg = "🌿 割了 " + cuts.length + " 块韭菜，得 " + mine + " 金币"; cutInfo = { n: cuts.length, got: mine };
      if (!picks.length) { await save(kv, to, v); await save(kv, addr, u); return { ok: true, msg: cutMsg, cut: cutInfo, me: view(u, t) }; }
      cutMsg = "；" + cutMsg;
    }
    const first = FIRST_FREE && u.steals.n === 0;            // 今天第一次偷：必得手
    const rev = !!(u.rv && u.rv[to] > t);                    // 复仇：对方 2 天内偷成过我
    const free = first || rev;                               // 这一次不会被狗、警察拦
    const nap = !free && (v.cop || 0) > t && Math.random() < COP_NAP; /* 警察在岗但这一次打瞌睡了：按没有警察算 */
    if (!free && (v.cop || 0) > t && !nap) { /* 有警察而且醒着：被抓，空手而归，罚金给农场主 */
      const fine = Math.min(COP_FINE, u.coins);
      u.coins -= fine; v.coins += fine; u.steals.n++; book(-fine);
      picks.forEach((x) => (x.p || x.h).th.push(addr)); // 被抓过的这一批菜和蛋不能再来试，免得反复来送罚金
      note(v, "👮 警察抓住了 " + short(addr) + "，罚了 " + fine + " 金币给你", addr);
      note(u, "去 " + short(to) + " 家偷菜被警察抓了，罚了 " + fine + " 金币", to);
      await save(kv, to, v); await save(kv, addr, u);
      return { ok: true, msg: "👮 被警察抓了！罚了 " + fine + " 金币" + cutMsg, bit: true, lost: fine, cut: cutInfo, me: view(u, t) };
    }
    const guard = !free && (v.dog || 0) > t;
    if (guard && Math.random() < DOG_CATCH) { // 有看门狗：一半机会被咬，空手而归，赔对方金币
      const bite = Math.min(DOG_BITE, u.coins);
      u.coins -= bite; v.coins += bite; u.steals.n++; book(-bite);
      note(v, "🐕 看门狗咬了 " + short(addr) + "，赔你 " + bite + " 金币", addr);
      note(u, "去 " + short(to) + " 家偷菜被狗咬了，赔了 " + bite + " 金币", to);
      await save(kv, to, v); await save(kv, addr, u);
      return { ok: true, msg: "🐕 被看门狗咬了！赔了 " + bite + " 金币" + cutMsg, bit: true, lost: bite, cut: cutInfo, me: view(u, t) };
    }
    let got = 0, what = [];
    const half = guard ? Math.ceil(picks.length / 2) : picks.length; // 有狗没咬到：最多偷走一半
    picks.forEach((x, i) => {
      (x.p || x.h).th.push(addr); // 没偷走的那一半也记上「来过了」，不能反复来把剩下的偷光
      if (i >= half) return;
      if (x.p) x.p.stolen = Math.round((x.p.stolen + x.u) * 100) / 100; else x.h.eggs--;
      got += x.v; what.push(x.ic);
    });
    u.coins += got; u.steals.n++; book(got);
    note(v, (rev ? "⚔️ 被复仇了，" : "") + (nap ? "👮 警察打瞌睡了，" : "") + (guard ? "🐕 狗没拦住，" : "") + short(addr) + " 偷走了 " + what.join("") + (copOn ? "（有警察在，每块地最多丢一成）" : ""), addr);
    note(u, (rev ? "⚔️ 复仇成功！" : "") + "去 " + short(to) + " 家偷了 " + what.join("") + "，得 " + got + " 金币", to);
    if (rev) delete u.rv[to];
    else if (got > 0) { // 被偷成了：给农场主一次「偷回去」的机会（复仇得手的不再给，免得无限互偷）
      const rv = v.rv || {};
      Object.keys(rv).forEach((k) => { if (!(rv[k] > t)) delete rv[k]; });
      const ks = Object.keys(rv); if (ks.length >= 12) delete rv[ks.sort((x, y) => rv[x] - rv[y])[0]];
      rv[addr] = t + REVENGE_TIME; v.rv = rv;
      if (v.log[0]) v.log[0].rv = 1;
    }
    await save(kv, to, v);
    msg = (rev ? "⚔️ 复仇成功！" : first ? "🎁 今天第一次偷，必得手！" : "") + (nap ? "👮 这家的警察打瞌睡了！" : "") + (guard ? "🐕 这家有狗，只偷到一部分：" : "偷到 ") + what.join("") + "，得 " + got + " 金币" + (copOn ? "（这家有警察，每块地只能偷到一成）" : "") + cutMsg;
    more = { got, what, cut: cutInfo }; // 页面拿它在那一家旁边写「偷到了什么」，一键偷菜最后按品种汇总
  } else if (a === "steal_end") { // 一键偷菜这一轮偷完：净亏就补回到 0（每天最多 BAODI_DAY）
    const batch = String(b.batch || "").slice(0, 24), d = today();
    if (!u.bd || u.bd.d !== d) u.bd = { d, n: 0 };
    let back = 0;
    if (batch && u.bt && u.bt.id === batch) {
      if (u.bt.net < 0) back = Math.max(0, Math.min(-u.bt.net, BAODI_DAY - u.bd.n));
      u.bt = null;
    }
    if (back > 0) {
      u.coins += back; u.bd.n += back;
      note(u, "🧺 一键偷菜保底：这一轮亏了，系统补回 " + back + " 金币");
      msg = "🧺 这一轮亏了，保底补回 " + back + " 金币";
    }
    await save(kv, addr, u);
    return { ok: true, msg, back, me: view(u, t) };
  } else throw new Error("未知操作");

  await save(kv, addr, u);
  return Object.assign({ ok: true, msg, me: view(u, t) }, more || {});
}

export async function neighbors(kv, me) {
  const list = (await kv.get("farm:list", "json")) || {}, t = now();
  // 没核对过、或者核对结果太旧的农场：分批去链上问有没有主名字，问到的写回名单
  try {
    const todo = Object.keys(list).filter((a) => !list[a].nc || list[a].nv !== LIST_V || t - list[a].nc > NAME_RECHECK).sort((a, b) => (list[b].c || 0) - (list[a].c || 0)).slice(0, NAME_BATCH);
    if (todo.length) {
      const lb = await primaryLabels(todo), ix = await loadOwnIndex(kv); let hit = 0;
      todo.forEach((a) => {
        if (lb[a] === undefined) return; // 主名字没读到：下次再查
        let v;
        if (!lb[a]) v = 0; // 没有主名字
        else { if (!ix) return; const r = nameIsOwn(ix, a, lb[a]); if (r === undefined) return; v = r ? 1 : 0; } // 快照里还没有这枚名字（刚注册）：下次再查；他自己一操作就会标上
        list[a].nm = v; list[a].nc = t; list[a].nv = LIST_V; hit++;
      });
      if (hit) {
        const cur = (await kv.get("farm:list", "json")) || {}; // 重新读一遍再写，别把这几百毫秒里别人刚存的农场数据盖回去
        todo.forEach((a) => { if (cur[a] && list[a].nc === t && list[a].nv === LIST_V) { cur[a].nm = list[a].nm; cur[a].nc = t; cur[a].nv = LIST_V; } });
        await kv.put("farm:list", JSON.stringify(cur));
      }
    }
  } catch (e) { /* 补查失败不影响出名单：还没核对的这次先不列 */ }
  const rows = Object.entries(list).filter(([, x]) => x.nm === 1 && x.nv === LIST_V).map(([a, x]) => ({ a, c: x.c, lv: x.lv, t: x.t, ripe: !!(x.r && x.r <= t), king: (x.p || 0) >= KING, dc: x.dc || "" })); // 只列有主名字的；有没有狗不给别人看
  const top = rows.slice().sort((x, y) => y.c - x.c).slice(0, 20);
  const friends = rows.filter((x) => x.a !== me).sort((x, y) => (y.ripe - x.ripe) || (y.t - x.t)).slice(0, 50);
  const s = (await kv.get("farm:burn", "json")) || { paid: 0, burned: 0, n: 0, by: {} };
  const burners = Object.entries(s.by).filter(([a]) => list[a] && list[a].nm === 1 && list[a].nv === LIST_V).sort((x, y) => y[1] - x[1]).slice(0, 20).map(([a, v]) => ({ a, v })); // 充值榜也只列有主名字的
  return { top, friends, burners, burned: s.burned, now: t };
}

function eggPrice(h) { return h.g ? GOLD_HEN.egg : EGG_PRICE; }
export function boostCost(sec) { return Math.max(BOOST, Math.ceil(sec / 600) * BOOST); }

// 充值：核对链上 LGNS 转账（转给运营资金 FARM_PAY；还开着旧页面的人转给旧收款合约也照样到账，那部分仍按 80% 记销毁，数据末尾带农场标记），按档位给付款地址加金币；同一笔只认一次
/* 站长发奖励金币（2026-11-18：给产品优化员 3 万金币）。只有带站长口令才能调（functions/api/farm.js 里核对 FEEDBACK_KEY）。
   农场金币不提现、不转赠、不上链，这只是站长给的游戏内奖励；一次最多 10 万，每次都记在 farm:grants 里留底 */
export const GRANT_MAX = 100000;
export async function grant(kv, addr, coins, why) {
  addr = String(addr || "").toLowerCase(); coins = Math.floor(Number(coins) || 0); why = String(why || "").slice(0, 60);
  if (!/^0x[0-9a-f]{40}$/.test(addr)) throw new Error("地址不对");
  if (!(coins > 0) || coins > GRANT_MAX) throw new Error("金币数量要在 1 到 " + GRANT_MAX + " 之间");
  const u = (await load(kv, addr)) || fresh(), before = u.coins;
  u.coins += coins;
  const m = "🎁 团队奖励 " + coins + " 金币" + (why ? "：" + why : "");
  note(u, m);
  await save(kv, addr, u);
  const log = (await kv.get("farm:grants", "json")) || [];
  log.unshift({ t: now(), a: addr, c: coins, why });
  await kv.put("farm:grants", JSON.stringify(log.slice(0, 200)));
  try { await pushInbox(kv, addr, "sys", "🏡 开心农场\n" + m + "\n金币只能在农场里用。", "#/farm"); } catch (e) { /* 通知发不出不影响到账 */ }
  return { ok: true, addr, added: coins, before, coins: u.coins };
}

export async function recharge(kv, tx) {
  const C = CHAINS.anubis;
  tx = String(tx || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new Error("交易哈希不对");
  if (await kv.get("fmtx:" + tx)) throw new Error("这笔充值已经到账了");
  const [txo, rc] = await Promise.all([rpc("eth_getTransactionByHash", [tx]), rpc("eth_getTransactionReceipt", [tx])]);
  if (!txo || !rc) throw new Error("链上还查不到这笔交易，稍等几秒再试");
  if (rc.status !== "0x1") throw new Error("这笔转账在链上失败了");
  const input = String(txo.input || "").toLowerCase();
  if (String(txo.to || "").toLowerCase() !== C.lgns || input.slice(0, 10) !== "0xa9059cbb" || input.slice(138) !== TAG + (await sha256hex("farm"))) throw new Error("这笔交易不是农场充值");
  const from = String(txo.from).toLowerCase();
  let paid = 0n, old = 0n;
  for (const l of rc.logs) if (l.address.toLowerCase() === C.lgns && l.topics[0] === TRANSFER && "0x" + l.topics[1].slice(26) === from) {
    const to = "0x" + l.topics[2].slice(26);
    if (to === FARM_PAY) paid += BigInt(l.data);
    else if (to === C.payTo) { paid += BigInt(l.data); old += BigInt(l.data); }
  }
  const lgns = Number(paid / 10n ** 9n), pack = PACKS.filter((p) => p.lgns <= lgns).pop();
  if (!pack) throw new Error("充值至少 " + PACKS[0].lgns + " LGNS");
  await kv.put("fmtx:" + tx, "1");
  const t = now();
  const u = (await load(kv, from)) || fresh();
  const first = !u.paid, coins = pack.coins + (first ? pack.coins : 0);
  u.coins += coins; u.paid = (u.paid || 0) + lgns;
  note(u, "充值 " + lgns + " LGNS，到账 " + coins + " 金币" + (first ? "（首充翻倍）" : ""));
  await save(kv, from, u);
  const s = (await kv.get("farm:burn", "json")) || { paid: 0, burned: 0, n: 0, by: {} };
  s.paid += lgns; s.burned += Number(old / 10n ** 9n) * 0.8; s.n++; s.by[from] = (s.by[from] || 0) + lgns;
  await kv.put("farm:burn", JSON.stringify(s));
  return { ok: true, msg: "充值成功！到账 " + coins + " 金币" + (first ? "（首充翻倍）" : ""), me: view(u, t) };
}
async function sha256hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
function fmtTime(s) { return s >= 3600 ? s / 3600 + " 小时" : s / 60 + " 分钟"; }
