// 开心农场（仿 QQ 农场 / 牧场）：种菜、养鸡、偷好友的菜和鸡蛋
// 金币：免费送、每日签到送、种菜养鸡赚，也可以用 Anubis 链 LGNS 充值（LGNS 进销毁乐园收款合约：80% 销毁、20% 作为运营费用）。金币只能花，换不回币，没有奖金
// 身份：钱包签一条固定文字（不是交易、不花 Gas），7 天内有效；KV：farm:u:<地址> 存农场，farm:list 存最近活跃的农场主，farm:burn 存充值销毁统计
import { recoverAddress } from "./evmsig.js";
import { CHAINS, rpc } from "./pixel.js";
import { pushInbox } from "./inbox.js";

export const CROPS = {
  cabbage: { name: "白菜", icon: "🥬", seed: 10, grow: 5 * 60, yield: 5, price: 4, xp: 2, lv: 1 },
  carrot: { name: "胡萝卜", icon: "🥕", seed: 20, grow: 30 * 60, yield: 6, price: 7, xp: 5, lv: 1 },
  corn: { name: "玉米", icon: "🌽", seed: 40, grow: 2 * 3600, yield: 8, price: 10, xp: 10, lv: 2 },
  tomato: { name: "番茄", icon: "🍅", seed: 60, grow: 4 * 3600, yield: 8, price: 16, xp: 15, lv: 3 },
  melon: { name: "西瓜", icon: "🍉", seed: 100, grow: 8 * 3600, yield: 6, price: 36, xp: 25, lv: 4 },
  berry: { name: "草莓", icon: "🍓", seed: 150, grow: 12 * 3600, yield: 10, price: 30, xp: 35, lv: 5 },
  pumpkin: { name: "黄金南瓜", icon: "🎃", seed: 1000, grow: 24 * 3600, yield: 10, price: 160, xp: 120, lv: 1, vip: true } // 充值玩家专属
};
// 充值档位（只收 Anubis 链 LGNS）：1 LGNS = 100 金币，档位越大送得越多；第一次充值金币翻倍
export const PACKS = [{ lgns: 10, coins: 1000 }, { lgns: 50, coins: 5500 }, { lgns: 100, coins: 12000 }, { lgns: 500, coins: 65000 }];
export const TAG = "4641"; // 转账数据末尾附「FA（4641）+ sha256("farm")」，认出这是农场充值
export const DOG_PRICE = 1500, DOG_TIME = 3 * 86400, DOG_MAX = 30 * 86400, DOG_BITE = 20; // 看门狗：3 天 1500 金币，最多叠 30 天；偷菜的被咬赔 20 金币
// 2026-11-12 站长按客户建议改：以前有狗完全偷不了、别人还看得见狗，结果家家有狗没人偷、没意思。
// 现在：别人看不到谁家有狗；有狗时来偷的一半机会被咬（空手 + 赔 20），一半机会得手但最多偷走一半的东西。
// 改规则前买的狗（当时说的是「没人偷得了」）：剩余时间翻一倍作补偿，每人只补一次（u.dg = 2 记着）
export const DOG_CATCH = 0.5, DOG_V2 = 1794464921;
export const GOLD_HEN = { price: 3000, max: 2, egg: 80 }; // 金鸡：充值玩家专属，金蛋 80 金币
export const BOOST = 2; // 化肥：每催熟 10 分钟 2 金币
export const DAILY = 50, DAILY_VIP = 200; // 每日签到：普通 50，充值过的 200
export const KING = 100; // 累计充值 100 LGNS 以上：👑 农场主
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const START_COINS = 200, START_PLOTS = 6, MAX_PLOTS = 12;
export const HEN_PRICE = 300, MAX_HENS = 6, FEED_COST = 10, FEED_TIME = 8 * 3600, MAX_FED = 24 * 3600, EGG_TIME = 2 * 3600, MAX_EGGS = 4, EGG_PRICE = 25;
export const STEAL_SHARE = 0.4; // 每块地最多被偷走 40%，农场主至少留 60%
export const STEAL_DAY = 50; // 每人每天最多偷 50 次
const SIGN_DAYS = 7, LIST_MAX = 300;

export const plotPrice = (n) => 500 * (n - START_PLOTS + 1); // 第 7 块地 500，第 8 块 1000…
export const level = (xp) => Math.floor(Math.sqrt(xp / 10)) + 1;
export const signText = (addr, day) => "AiLGNS 开心农场\n用这个钱包进入农场：" + addr + "\n只是签名确认身份，不是转账，不花 Gas。\n日期：" + day;
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a);
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

export function auth(b) {
  const addr = String(b.addr || "").toLowerCase(), day = String(b.day || "");
  if (!isAddr(addr)) throw new Error("地址格式不对");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("请重新签名进入农场");
  const age = Date.now() - Date.parse(day + "T00:00:00+08:00");
  if (age < -86400e3 || age > SIGN_DAYS * 86400e3) throw new Error("签名过期了，请重新签名进入农场");
  if (recoverAddress(signText(addr, day), String(b.sig || "")) !== addr) throw new Error("签名核对失败，请重新签名");
  return addr;
}

function fresh() {
  return { coins: START_COINS, xp: 0, plots: Array.from({ length: START_PLOTS }, () => null), hens: [], log: [], steals: { d: "", n: 0 }, born: now(), paid: 0, dog: 0, dg: 2, daily: "" };
}
export async function load(kv, addr) { return (await kv.get("farm:u:" + addr, "json")) || null; }

// 鸡下蛋：喂饱的时间里每 2 小时下 1 个，每只最多攒 4 个
function lay(h, t) {
  const end = Math.min(t, h.fed);
  if (end > h.last) {
    const n = Math.floor((end - h.last) / EGG_TIME);
    h.eggs = Math.min(MAX_EGGS, h.eggs + n);
    h.last += n * EGG_TIME;
    if (h.eggs >= MAX_EGGS) h.last = Math.max(h.last, end);
  }
}
function ripeAt(p) { return p ? p.t + CROPS[p.c].grow : Infinity; }
// 好友列表里给别人看的提示：最早什么时候有东西可偷
function nextRipe(u, t) {
  let r = Infinity;
  for (const p of u.plots) if (p && p.stolen < Math.floor(CROPS[p.c].yield * STEAL_SHARE)) r = Math.min(r, ripeAt(p));
  for (const h of u.hens) { lay(h, t); if (h.eggs >= 2) r = Math.min(r, t); else if (h.fed > t) r = Math.min(r, h.last + EGG_TIME * (2 - h.eggs)); }
  return r === Infinity ? 0 : r;
}
function note(u, text) { u.log.unshift({ t: now(), m: text }); u.log.length = Math.min(u.log.length, 20); }
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

async function save(kv, addr, u) {
  const t = now();
  await kv.put("farm:u:" + addr, JSON.stringify(u));
  const list = (await kv.get("farm:list", "json")) || {};
  list[addr] = { c: u.coins, lv: level(u.xp), t, r: nextRipe(u, t), p: u.paid || 0, d: (u.dog || 0) > t ? 1 : 0 };
  const keys = Object.keys(list);
  if (keys.length > LIST_MAX) keys.sort((a, b) => list[a].t - list[b].t).slice(0, keys.length - LIST_MAX).forEach((k) => delete list[k]);
  await kv.put("farm:list", JSON.stringify(list));
}

// 公开视图：别人来串门看到的样子（偷菜用）
export function view(u, t = now()) {
  u.hens.forEach((h) => lay(h, t));
  return { coins: u.coins, xp: u.xp, lv: level(u.xp), plots: u.plots, hens: u.hens, log: u.log, steals: u.steals, paid: u.paid || 0, dog: u.dog || 0, daily: u.daily || "", now: t };
}

export async function act(kv, b) {
  const addr = auth(b), t = now();
  let u = await load(kv, addr);
  const isNew = !u;
  if (!u) u = fresh();
  await dogFix(kv, addr, u);
  u.hens.forEach((h) => lay(h, t));
  const a = String(b.a || "me");
  const need = (c) => { if (u.coins < c) throw new Error("金币不够：需要 " + c + "，你有 " + u.coins); u.coins -= c; };
  const plotAt = (i) => { i = Number(i); if (!(i >= 0 && i < u.plots.length)) throw new Error("没有这块地"); return i; };
  let msg = "";

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
    msg = "种下了" + c.icon + c.name + "，" + fmtTime(c.grow) + "后成熟";
  } else if (a === "harvest") {
    let got = 0, n = 0;
    u.plots.forEach((p, i) => {
      if (!p || ripeAt(p) > t) return;
      const c = CROPS[p.c], left = c.yield - p.stolen;
      got += left * c.price; u.xp += c.xp; n++;
      u.plots[i] = null;
    });
    if (!n) throw new Error("还没有成熟的菜");
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
    msg = "🐕 看门狗上岗，" + Math.round((u.dog - t) / 86400) + " 天内来偷的一半会被咬，没被咬也最多偷走一半";
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
    v.hens.forEach((h) => lay(h, t));
    const picks = []; // 这次能偷的东西
    v.plots.forEach((p) => {
      if (!p || ripeAt(p) > t || p.th.includes(addr)) return;
      const c = CROPS[p.c];
      if (p.stolen >= Math.floor(c.yield * STEAL_SHARE)) return;
      picks.push({ p, v: c.price, ic: c.icon });
    });
    v.hens.forEach((h) => {
      if (h.eggs < 2 || h.th.includes(addr)) return;
      picks.push({ h, v: eggPrice(h), ic: h.g ? "🟡" : "🥚" });
    });
    if (!picks.length) throw new Error("没有能偷的：菜没熟、被偷光了，或者你已经偷过了");
    const guard = (v.dog || 0) > t;
    if (guard && Math.random() < DOG_CATCH) { // 有看门狗：一半机会被咬，空手而归，赔对方金币
      const bite = Math.min(DOG_BITE, u.coins);
      u.coins -= bite; v.coins += bite; u.steals.n++;
      note(v, "🐕 看门狗咬了 " + short(addr) + "，赔你 " + bite + " 金币");
      note(u, "去 " + short(to) + " 家偷菜被狗咬了，赔了 " + bite + " 金币");
      await save(kv, to, v); await save(kv, addr, u);
      return { ok: true, msg: "🐕 被看门狗咬了！赔了 " + bite + " 金币", bit: true, me: view(u, t) };
    }
    let got = 0, what = [];
    const half = guard ? Math.ceil(picks.length / 2) : picks.length; // 有狗没咬到：最多偷走一半
    picks.forEach((x, i) => {
      (x.p || x.h).th.push(addr); // 没偷走的那一半也记上「来过了」，不能反复来把剩下的偷光
      if (i >= half) return;
      if (x.p) x.p.stolen++; else x.h.eggs--;
      got += x.v; what.push(x.ic);
    });
    u.coins += got; u.steals.n++;
    note(v, (guard ? "🐕 狗没拦住，" : "") + short(addr) + " 偷走了 " + what.join(""));
    note(u, "去 " + short(to) + " 家偷了 " + what.join("") + "，得 " + got + " 金币");
    await save(kv, to, v);
    msg = (guard ? "🐕 这家有狗，只偷到一部分：" : "偷到 ") + what.join("") + "，得 " + got + " 金币";
  } else throw new Error("未知操作");

  await save(kv, addr, u);
  return { ok: true, msg, me: view(u, t) };
}

export async function neighbors(kv, me) {
  const list = (await kv.get("farm:list", "json")) || {}, t = now();
  const rows = Object.entries(list).map(([a, x]) => ({ a, c: x.c, lv: x.lv, t: x.t, ripe: !!(x.r && x.r <= t), king: (x.p || 0) >= KING })); // 有没有狗不给别人看
  const top = rows.slice().sort((x, y) => y.c - x.c).slice(0, 20);
  const friends = rows.filter((x) => x.a !== me).sort((x, y) => (y.ripe - x.ripe) || (y.t - x.t)).slice(0, 50);
  const s = (await kv.get("farm:burn", "json")) || { paid: 0, burned: 0, n: 0, by: {} };
  const burners = Object.entries(s.by).sort((x, y) => y[1] - x[1]).slice(0, 20).map(([a, v]) => ({ a, v }));
  return { top, friends, burners, burned: s.burned, now: t };
}

function eggPrice(h) { return h.g ? GOLD_HEN.egg : EGG_PRICE; }
export function boostCost(sec) { return Math.max(BOOST, Math.ceil(sec / 600) * BOOST); }

// 充值：核对链上 LGNS 转账（转给销毁乐园收款合约，数据末尾带农场标记），按档位给付款地址加金币；同一笔只认一次
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
  let paid = 0n;
  for (const l of rc.logs) if (l.address.toLowerCase() === C.lgns && l.topics[0] === TRANSFER && "0x" + l.topics[1].slice(26) === from && "0x" + l.topics[2].slice(26) === C.payTo) paid += BigInt(l.data);
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
  s.paid += lgns; s.burned += lgns * 0.8; s.n++; s.by[from] = (s.by[from] || 0) + lgns;
  await kv.put("farm:burn", JSON.stringify(s));
  return { ok: true, msg: "充值成功！到账 " + coins + " 金币" + (first ? "（首充翻倍）" : ""), me: view(u, t) };
}
async function sha256hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
function fmtTime(s) { return s >= 3600 ? s / 3600 + " 小时" : s / 60 + " 分钟"; }
