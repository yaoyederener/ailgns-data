// 开心农场（仿 QQ 农场 / 牧场）：种菜、养鸡、偷好友的菜和鸡蛋。只用游戏金币，不花真钱，金币也换不成币
// 身份：钱包签一条固定文字（不是交易、不花 Gas），7 天内有效；KV：farm:u:<地址> 存农场，farm:list 存最近活跃的农场主（偷菜好友列表）
import { recoverAddress } from "./evmsig.js";

export const CROPS = {
  cabbage: { name: "白菜", icon: "🥬", seed: 10, grow: 5 * 60, yield: 5, price: 4, xp: 2, lv: 1 },
  carrot: { name: "胡萝卜", icon: "🥕", seed: 20, grow: 30 * 60, yield: 6, price: 7, xp: 5, lv: 1 },
  corn: { name: "玉米", icon: "🌽", seed: 40, grow: 2 * 3600, yield: 8, price: 10, xp: 10, lv: 2 },
  tomato: { name: "番茄", icon: "🍅", seed: 60, grow: 4 * 3600, yield: 8, price: 16, xp: 15, lv: 3 },
  melon: { name: "西瓜", icon: "🍉", seed: 100, grow: 8 * 3600, yield: 6, price: 36, xp: 25, lv: 4 },
  berry: { name: "草莓", icon: "🍓", seed: 150, grow: 12 * 3600, yield: 10, price: 30, xp: 35, lv: 5 }
};
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
  return { coins: START_COINS, xp: 0, plots: Array.from({ length: START_PLOTS }, () => null), hens: [], log: [], steals: { d: "", n: 0 }, born: now() };
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

async function save(kv, addr, u) {
  const t = now();
  await kv.put("farm:u:" + addr, JSON.stringify(u));
  const list = (await kv.get("farm:list", "json")) || {};
  list[addr] = { c: u.coins, lv: level(u.xp), t, r: nextRipe(u, t) };
  const keys = Object.keys(list);
  if (keys.length > LIST_MAX) keys.sort((a, b) => list[a].t - list[b].t).slice(0, keys.length - LIST_MAX).forEach((k) => delete list[k]);
  await kv.put("farm:list", JSON.stringify(list));
}

// 公开视图：别人来串门看到的样子（偷菜用）
export function view(u, t = now()) {
  u.hens.forEach((h) => lay(h, t));
  return { coins: u.coins, xp: u.xp, lv: level(u.xp), plots: u.plots, hens: u.hens, log: u.log, steals: u.steals, now: t };
}

export async function act(kv, b) {
  const addr = auth(b), t = now();
  let u = await load(kv, addr);
  const isNew = !u;
  if (!u) u = fresh();
  u.hens.forEach((h) => lay(h, t));
  const a = String(b.a || "me");
  const need = (c) => { if (u.coins < c) throw new Error("金币不够：需要 " + c + "，你有 " + u.coins); u.coins -= c; };
  const plotAt = (i) => { i = Number(i); if (!(i >= 0 && i < u.plots.length)) throw new Error("没有这块地"); return i; };
  let msg = "";

  if (a === "me") msg = isNew ? "欢迎来到开心农场！送你 " + START_COINS + " 金币，先种点白菜吧" : "";
  else if (a === "plant") {
    const i = plotAt(b.plot), c = CROPS[b.crop];
    if (!c) throw new Error("没有这种种子");
    if (level(u.xp) < c.lv) throw new Error(c.name + " 要 " + c.lv + " 级才能种");
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
    if (u.hens.length >= MAX_HENS) throw new Error("鸡舍满了（最多 " + MAX_HENS + " 只）");
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
    const n = u.hens.reduce((s, h) => s + h.eggs, 0);
    if (!n) throw new Error("还没有蛋");
    u.hens.forEach((h) => { h.eggs = 0; h.th = []; });
    u.coins += n * EGG_PRICE; u.xp += n;
    msg = "捡了 " + n + " 个鸡蛋，卖得 " + n * EGG_PRICE + " 金币";
  } else if (a === "steal") {
    const to = String(b.to || "").toLowerCase();
    if (!isAddr(to) || to === addr) throw new Error("不能偷自己的");
    const d = today();
    if (u.steals.d !== d) u.steals = { d, n: 0 };
    if (u.steals.n >= STEAL_DAY) throw new Error("今天已经偷了 " + STEAL_DAY + " 次，明天再来");
    const v = await load(kv, to);
    if (!v) throw new Error("对方还没有农场");
    v.hens.forEach((h) => lay(h, t));
    let got = 0, what = [];
    v.plots.forEach((p) => {
      if (!p || ripeAt(p) > t || p.th.includes(addr)) return;
      const c = CROPS[p.c];
      if (p.stolen >= Math.floor(c.yield * STEAL_SHARE)) return;
      p.stolen++; p.th.push(addr); got += c.price; what.push(c.icon);
    });
    v.hens.forEach((h) => {
      if (h.eggs < 2 || h.th.includes(addr)) return;
      h.eggs--; h.th.push(addr); got += EGG_PRICE; what.push("🥚");
    });
    if (!got) throw new Error("没有能偷的：菜没熟、被偷光了，或者你已经偷过了");
    u.coins += got; u.steals.n++;
    note(v, short(addr) + " 偷走了 " + what.join(""));
    note(u, "去 " + short(to) + " 家偷了 " + what.join("") + "，得 " + got + " 金币");
    await save(kv, to, v);
    msg = "偷到 " + what.join("") + "，得 " + got + " 金币";
  } else throw new Error("未知操作");

  await save(kv, addr, u);
  return { ok: true, msg, me: view(u, t) };
}

export async function neighbors(kv, me) {
  const list = (await kv.get("farm:list", "json")) || {}, t = now();
  const rows = Object.entries(list).map(([a, x]) => ({ a, c: x.c, lv: x.lv, t: x.t, ripe: x.r && x.r <= t }));
  const top = rows.slice().sort((x, y) => y.c - x.c).slice(0, 20);
  const friends = rows.filter((x) => x.a !== me).sort((x, y) => (y.ripe - x.ripe) || (y.t - x.t)).slice(0, 50);
  return { top, friends, now: t };
}

function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
function fmtTime(s) { return s >= 3600 ? s / 3600 + " 小时" : s / 60 + " 分钟"; }
