// 🀄 麻将联机房间服务器（香港机上常驻，Node 20，不装任何第三方包）
// 红线（站长 2026-11-11）：房卡是固定服务费，钱全进收入钱包；桌上积分只是这一桌的记分，不存、不转、不提、不上链。
// 这个服务手里没有任何私钥：只「看」链上的付款记录，从不发交易。用普通用户身份跑（ailgnsmj），读不到别的服务的密钥。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { recoverAddress } from "./evmsig.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.MJ_DATA || "/var/lib/ailgns-mj";
const PORT = Number(process.env.MJ_PORT) || 8787;
const RPCS = (process.env.MJ_RPC || "https://rpc.anubispace.org,https://rpc2.anubispace.org,https://rpc3.anubispace.org").split(",");
const PAY_TO = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 谷歌社交账号钱包（收入钱包），和 lib/addresses.js 一致
const TOKENS = { // 都在 Anubis 链。pair = 和 DAI 的池子，daiAt = DAI 是池子里第几个币，k = 折算系数（LGNS 全站按池价 5 折算）
  dai: { sym: "DAI", addr: "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", dec: 18, show: 2 },
  ailgns: { sym: "AiLGNS", addr: "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", dec: 18, show: 6, pair: "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0", daiAt: 1, k: 1 },
  lgns: { sym: "LGNS", addr: "0x4d1d808a081fdac440703b3765fc61f8028c06b8", dec: 9, show: 2, pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", daiAt: 1, k: 0.5 },
};
const CARD_DAI = 1; // 一张房卡 1 DAI
const ROUNDS = { 8: 1, 16: 2 }; // 8 局 1 张，16 局 2 张
const LIMIT = { swap: 25000, que: 15000, turn: 20000, claim: 12000 }; // 每一步最多等多久，超时机器人代打
const DELAY = { discard: 380, peng: 650, gang: 850, hu: 1500, swap: 2600, que: 800, end: 600 };
const ALLOW = new Set(["https://ailgns.dev", "https://ailgnsotc.com", "https://ailgnsotc.net", "https://ailgnsotc.org", "https://ailgnsotc.cc", "https://ailgnsotc.xyz", "https://ailgns-data.pages.dev"]);
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ---------- 牌的规则：直接用网站那份 mj.js（单机版同一套引擎） ----------
const win = { AIL: { pages: {} } };
new Function("window", fs.readFileSync(path.join(DIR, "mj.js"), "utf8"))(win);
const MJ = win.AILMJ;

class E extends Error {}
const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (a) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");

// ---------- 账本：一行一条，只追加。余额 = 从头加一遍 ----------
fs.mkdirSync(DATA, { recursive: true });
const LEDGER = path.join(DATA, "ledger.jsonl");
const bal = new Map(), usedTx = new Set(), openUse = new Map();
function applyEntry(e) {
  if (e.t === "buy" || e.t === "grant" || e.t === "refund") bal.set(e.addr, (bal.get(e.addr) || 0) + e.n);
  if (e.t === "use") { bal.set(e.addr, (bal.get(e.addr) || 0) - e.n); openUse.set(e.room, e); }
  if (e.t === "buy") usedTx.add(e.tx);
  if (e.t === "done" || e.t === "refund") openUse.delete(e.room);
}
function log(e) { e.ts = now(); fs.appendFileSync(LEDGER, JSON.stringify(e) + "\n"); applyEntry(e); }
if (fs.existsSync(LEDGER)) fs.readFileSync(LEDGER, "utf8").split("\n").forEach((l) => { if (l.trim()) try { applyEntry(JSON.parse(l)); } catch (e) { console.error("账本坏行", l.slice(0, 80)); } });
const SECRET_FILE = path.join(DATA, "secret");
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
const SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim();
const mac = (t) => crypto.createHmac("sha256", SECRET).update(t).digest("hex");
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 站长手动送房卡（测试用）：node server.mjs grant 0x地址 张数
if (process.argv[2] === "grant") {
  const a = String(process.argv[3] || "").toLowerCase(), n = Number(process.argv[4]);
  if (!/^0x[0-9a-f]{40}$/.test(a) || !(n > 0 && n <= 100)) { console.log("用法: node server.mjs grant 0x地址 张数"); process.exit(1); }
  log({ t: "grant", addr: a, n }); console.log(a, "现在有", bal.get(a), "张房卡（服务在跑的话要重启才看得到）"); process.exit(0);
}
// 上次重启时没打完的房间：房卡退回去
[...openUse.values()].forEach((u) => log({ t: "refund", addr: u.addr, n: u.n, room: u.room, why: "restart" }));

// ---------- 链上：只读 ----------
async function rpc(method, params) {
  let err;
  for (const u of RPCS) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}
const priceCache = {};
async function price(tk) { // 1 个币值多少 DAI（已乘折算系数）
  const T = TOKENS[tk], c = priceCache[tk];
  if (!T.pair) return 1;
  if (c && now() - c.at < 30000) return c.p;
  const r = await rpc("eth_call", [{ to: T.pair, data: "0x0902f1ac" }, "latest"]);
  const r0 = BigInt("0x" + r.slice(2, 66)), r1 = BigInt("0x" + r.slice(66, 130));
  const dai = Number(T.daiAt ? r1 : r0) / 1e18, tok = Number(T.daiAt ? r0 : r1) / 10 ** T.dec, p = dai / tok * T.k;
  if (!(p > 0) || !isFinite(p) || dai < 100) throw new E("现在查不到 " + T.sym + " 的价格，先用 DAI 付或者稍后再试");
  priceCache[tk] = { at: now(), p };
  return p;
}
function qmac(token, amount, n, ts) { return mac(["q", token, amount, n, ts].join("|")).slice(0, 16); }
async function quote(o) {
  const n = Number(o.n), T = TOKENS[o.tk];
  if (!T || !Number.isInteger(n) || n < 1 || n > 50) throw new E("买的数量不对");
  const p = await price(o.tk), unit = 10 ** T.show;
  const shown = Math.ceil(n * CARD_DAI / p * unit - 1e-9); // 往上取整到页面显示的小数位
  const amount = (BigInt(shown) * 10n ** BigInt(T.dec - T.show)).toString(), ts = Math.floor(now() / 1000);
  const tag = "4d4a" + n.toString(16).padStart(2, "0") + ts.toString(16).padStart(8, "0") + qmac(T.addr, amount, n, ts); // "MJ" + 张数 + 报价时间 + 防伪码
  return { n, tk: o.tk, sym: T.sym, token: T.addr, payTo: PAY_TO, amount, show: (shown / unit).toFixed(T.show).replace(/\.?0+$/, ""), price: p, tag };
}
async function buy(o) {
  const h = String(o.tx || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(h)) throw new E("交易号不对");
  const [tx, rc] = await Promise.all([rpc("eth_getTransactionByHash", [h]), rpc("eth_getTransactionReceipt", [h])]);
  if (!tx || !rc || !rc.blockNumber) throw new E("查不到这笔付款，稍等几秒再试");
  const from = String(tx.from).toLowerCase();
  if (usedTx.has(h)) return { ok: true, used: true, n: 0, addr: from, cards: bal.get(from) || 0 };
  if (rc.status !== "0x1") throw new E("这笔交易失败了，没有扣款");
  const to = String(tx.to || "").toLowerCase(), tk = Object.keys(TOKENS).find((k) => TOKENS[k].addr === to), inp = String(tx.input || "").toLowerCase();
  if (!tk || inp.length !== 10 + 128 + 30 || !inp.startsWith("0xa9059cbb" + pad(PAY_TO))) throw new E("这笔不是买房卡的付款");
  const amount = BigInt("0x" + inp.slice(74, 138)), tag = inp.slice(138), n = parseInt(tag.slice(4, 6), 16), ts = parseInt(tag.slice(6, 14), 16);
  if (tag.slice(0, 4) !== "4d4a" || !(n >= 1 && n <= 50) || !safeEq(tag.slice(14), qmac(to, amount.toString(), n, ts))) throw new E("这笔不是买房卡的付款");
  let paid = 0n;
  (rc.logs || []).forEach((l) => { if (String(l.address).toLowerCase() === to && l.topics && l.topics[0] === TRANSFER && l.topics[1] === "0x" + pad(from) && l.topics[2] === "0x" + pad(PAY_TO)) paid += BigInt(l.data); });
  if (paid < amount) throw new E("收到的数量不够");
  const blk = await rpc("eth_getBlockByNumber", [rc.blockNumber, false]), bt = parseInt(blk.timestamp, 16);
  if (bt > ts + 3600 || bt < ts - 900) throw new E("这笔付款用的是过期的报价，请到工单里找技术人员处理");
  if (usedTx.has(h)) return { ok: true, used: true, n: 0, addr: from, cards: bal.get(from) || 0 };
  log({ t: "buy", addr: from, n, tx: h, token: tk, amount: amount.toString() });
  return { ok: true, n, addr: from, cards: bal.get(from) || 0 };
}

// ---------- 登录：钱包签一句话，证明这个地址是你的（只为了扣你自己的房卡） ----------
function login(o) {
  const addr = String(o.addr || "").toLowerCase(), ts = Number(o.ts);
  if (!/^0x[0-9a-f]{40}$/.test(addr) || !Number.isInteger(ts) || Math.abs(now() / 1000 - ts) > 600) throw new E("登录过期了，请重新签名");
  if (recoverAddress("AiLGNS 麻将登录\n钱包: " + addr + "\n时间: " + ts, String(o.sig || "")) !== addr) throw new E("签名不对，请重新签名");
  const exp = Math.floor(now() / 1000) + 30 * 86400;
  return { token: addr + "." + exp + "." + mac("t|" + addr + "|" + exp), addr, cards: bal.get(addr) || 0 };
}
function whoIs(token) {
  const p = String(token || "").split(".");
  if (p.length !== 3 || !(Number(p[1]) > now() / 1000) || !safeEq(p[2], mac("t|" + p[0] + "|" + p[1]))) throw new E("请先用钱包登录");
  return p[0];
}

// ---------- 房间 ----------
const rooms = new Map();
const cleanName = (s, d) => (String(s || "").replace(/[^一-龥A-Za-z0-9_]/g, "").slice(0, 8)) || d;
const cleanSid = (s) => { s = String(s || ""); if (!/^[0-9a-f]{32}$/.test(s)) throw new E("请刷新页面再试"); return s; };
function newSeat(room, sid, name) {
  let nm = cleanName(name, "玩家" + (100 + crypto.randomInt(900))), i = 2;
  const used = room.seats.filter(Boolean).map((s) => s.name), base = nm.slice(0, 7);
  while (used.includes(nm)) nm = base + i++;
  return { sid, name: nm, bot: !sid, seen: now(), auto: false, gone: false, miss: 0, ready: false };
}
function getRoom(o) { const r = rooms.get(String(o.room || "")); if (!r) throw new E("房间不存在或已经结束"); return r; }
function seatOf(room, o) { const sid = cleanSid(o.sid), i = room.seats.findIndex((s) => s && s.sid === sid); if (i < 0) throw new E("你不在这个房间里"); return i; }
function online(room, i) { const s = room.seats[i]; return !s.bot && !s.gone && (now() - s.seen < 45000 || room.waiters.has(i)); }
function humansHere(room) { return now() - room.humanAt < 120000; } // 2 分钟内有真人来过

function view(room, me) {
  const abs = (v) => (v + me) % 4, rot = (s) => (s - me + 4) % 4, R = (a) => [0, 1, 2, 3].map((v) => a[abs(v)]), g = room.g, a = room.asks[me];
  const o = { ver: room.ver, code: room.code, st: room.st, k: room.k, n: room.rounds, need: room.need, host: me === 0, auto: room.seats[me].auto,
    seats: [0, 1, 2, 3].map((v) => { const i = abs(v), s = room.seats[i]; return s ? { i, name: s.name, bot: s.bot, host: i === 0, auto: s.auto || s.gone, off: !s.bot && !online(room, i), ready: s.ready } : null; }),
    tot: R(room.total), left: room.until ? Math.max(0, room.until - now()) : 0, note: room.note || "" };
  if (!g) return o;
  o.g = { base: g.base, wall: { length: g.wall.length }, turn: g.turn < 0 ? -1 : rot(g.turn), dealer: rot(g.dealer), flash: g.flash, over: g.over, endNotes: g.endNotes,
    msg: g.swapIn ? "换三张：每人把牌换给" + MJ.REL[g.swapDir] + "。你换到了 " + g.swapIn[me].map(MJ.tn).join(" ") : g.msg,
    melds: R(g.melds).map((ms, v) => ms.map((m) => ({ k: m.k, tile: m.k === "an" && v && !g.over ? -1 : m.tile }))), // 别人的暗杠不亮牌
    hus: R(g.hus).map((hs) => hs.map((h) => ({ tile: h.tile, from: h.from < 0 ? -1 : rot(h.from), fan: h.fan, names: h.names, got: h.got }))),
    que: R(g.que), score: R(g.score), delta: R(g.delta), river: R(g.river), last: g.last ? { seat: rot(g.last.seat), tile: g.last.tile } : null,
    hand: [g.hand[me]], cnt: R(g.hand).map(MJ.sum), drawn: g.turn === me ? g.drawn : -1, names: R(room.seats.map((s) => s.name)) };
  if (a && !a.hidden) { const q = a.q; o.q = Object.assign({}, q, { qid: a.qid, left: Math.max(0, a.until - now()), seat: 0 }); if (q.from != null) o.q.from = rot(q.from); }
  else o.wait = Object.values(room.asks).some((x) => x.q.type === "swap" || x.q.type === "que");
  return o;
}
function send(res, obj) { if (res.writableEnded) return; res.end(JSON.stringify(obj)); }
function bump(room) {
  room.ver++; room.at = now();
  for (const [i, w] of room.waiters) { clearTimeout(w.timer); send(w.res, view(room, i)); }
  room.waiters.clear();
}
function closeRoom(room, why) {
  room.dead = true; rooms.delete(room.code);
  Object.values(room.asks).forEach((a) => clearTimeout(a.timer));
  for (const [, w] of room.waiters) { clearTimeout(w.timer); send(w.res, { err: why || "房间已经结束" }); }
  room.waiters.clear();
}

function ask(room, q) { // 问一个座位要怎么打。机器人、托管、掉线、已经胡牌锁住的：机器人代打
  const seat = room.seats[q.seat], g = room.g;
  return new Promise((resolve) => {
    const a = { q, hidden: false, done: false };
    a.fin = (v) => { if (a.done) return; a.done = true; clearTimeout(a.timer); if (room.asks[q.seat] === a) delete room.asks[q.seat]; resolve(v); };
    if (seat.bot || q.locked || seat.auto || !online(room, q.seat)) {
      const v = MJ.bot(g, q); a.hidden = true;
      a.timer = setTimeout(() => a.fin(v), q.type === "turn" ? (seat.bot || q.locked ? 600 : 900) : q.type === "claim" ? (v === "pass" ? 0 : 500) : 300);
    } else {
      a.qid = ++room.qid; a.until = now() + LIMIT[q.type];
      a.timer = setTimeout(() => { if (++seat.miss >= 2) seat.auto = true; a.fin(MJ.bot(g, q)); if (Object.keys(room.asks).length) bump(room); }, LIMIT[q.type] + 800);
    }
    room.asks[q.seat] = a;
  });
}
function batchOf(g, q) { // 换三张、定缺、碰杠胡：要问的人一起问，不用一个个等
  if (q.type !== "claim") return [0, 1, 2, 3].map((s) => ({ type: q.type, seat: s }));
  const out = [];
  for (let i = 1; i < 4; i++) {
    const s = (q.from + i) % 4, m = MJ.claimOpts(g, s, q.tile);
    if (q.qiang ? m.hu : m.hu || m.peng || m.gang) out.push({ type: "claim", seat: s, tile: q.tile, from: q.from, hu: m.hu, peng: !q.qiang && m.peng, gang: !q.qiang && m.gang, locked: m.locked, qiang: !!q.qiang });
  }
  return out;
}
async function runGame(room) {
  const g = room.g = MJ.newGame({ base: 1, dealer: room.dealer, rnd: () => crypto.randomInt(0x100000000) / 0x100000000 });
  g.names = room.seats.map((s) => s.name);
  const it = MJ.play(g);
  let r = it.next(), pre = null, v;
  while (!r.done) {
    if (room.dead) return false;
    const q = r.value; v = undefined;
    if (q.type === "ev") { pre = null; bump(room); await sleep(DELAY[q.ev] || 400); }
    else if (q.type === "turn") {
      pre = null;
      if (!humansHere(room)) { closeRoom(room, "大家都离开了，房间已结束"); return false; }
      const p = ask(room, q); bump(room); v = await p;
    } else {
      if (!pre || !(q.seat in pre)) {
        const qs = batchOf(g, q), ps = qs.map((x) => ask(room, x)); bump(room);
        const ans = await Promise.all(ps); pre = {}; qs.forEach((x, i) => { pre[x.seat] = ans[i]; });
      }
      v = pre[q.seat]; delete pre[q.seat];
    }
    if (room.dead) return false;
    r = it.next(v);
  }
  return true;
}
async function runRoom(room) {
  try {
    for (;;) {
      room.st = "play"; room.until = 0;
      if (!(await runGame(room))) { if (openUse.has(room.rid)) log({ t: "done", room: room.rid, k: room.k, why: "empty" }); return; }
      room.g.score.forEach((x, s) => { room.total[s] += x; });
      room.dealer = (room.dealer + 1) % 4;
      if (room.k >= room.rounds) break;
      room.st = "between"; room.until = now() + 25000; room.seats.forEach((s) => { s.ready = s.bot; });
      bump(room);
      await new Promise((ok) => { room.go = ok; room.goTimer = setTimeout(ok, 25000); });
      clearTimeout(room.goTimer); room.go = null;
      if (room.dead) return;
      if (!humansHere(room)) { closeRoom(room, "大家都离开了，房间已结束"); log({ t: "done", room: room.rid, k: room.k, why: "empty" }); return; }
      room.k++;
    }
    room.st = "done"; room.until = 0; log({ t: "done", room: room.rid, k: room.k }); bump(room);
  } catch (e) {
    console.error("room", room.code, e);
    if (openUse.has(room.rid)) log({ t: "refund", addr: room.host, n: room.need, room: room.rid, why: "error" });
    closeRoom(room, "这一桌出了点问题，房卡已经退回");
  }
}
function checkReady(room) { if (room.st === "between" && room.go && room.seats.every((s, i) => s.ready || !online(room, i))) room.go(); }

// ---------- 接口 ----------
const H = {
  quote, buy, login,
  cards(o) { const a = String(o.addr || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(a)) throw new E("地址不对"); return { addr: a, cards: bal.get(a) || 0 }; },
  create(o) {
    const addr = whoIs(o.token), sid = cleanSid(o.sid), rounds = Number(o.rounds) === 16 ? 16 : 8, need = ROUNDS[rounds];
    if ((bal.get(addr) || 0) < need) throw new E("房卡不够：开 " + rounds + " 局要 " + need + " 张，你有 " + (bal.get(addr) || 0) + " 张");
    if (rooms.size >= 500) throw new E("现在房间太多了，过一会儿再开");
    if ([...rooms.values()].filter((r) => r.host === addr && r.st !== "done").length >= 2) throw new E("你已经开了 2 个房间，先打完或解散一个");
    let code; do { code = String(100000 + crypto.randomInt(900000)); } while (rooms.has(code));
    const room = { code, rid: code + "-" + now().toString(36), host: addr, rounds, need, st: "wait", k: 0, seats: [null, null, null, null], total: [0, 0, 0, 0], ver: 1, qid: 0, waiters: new Map(), asks: {}, g: null, at: now(), humanAt: now(), dealer: crypto.randomInt(4), until: 0 };
    room.seats[0] = newSeat(room, sid, o.name);
    rooms.set(code, room);
    return { room: code, cards: bal.get(addr) || 0 };
  },
  join(o) {
    const room = getRoom(o), sid = cleanSid(o.sid);
    let i = room.seats.findIndex((s) => s && s.sid === sid);
    if (i >= 0) { room.seats[i].gone = false; room.seats[i].seen = now(); bump(room); return { room: room.code }; } // 本来就在：回到座位
    if (room.st !== "wait") throw new E("这一桌已经开打了，进不去了");
    i = room.seats.indexOf(null);
    if (i < 0) throw new E("这一桌已经坐满了");
    room.seats[i] = newSeat(room, sid, o.name); bump(room);
    return { room: room.code };
  },
  bot(o) {
    const room = getRoom(o);
    if (seatOf(room, o) !== 0 || room.st !== "wait") throw new E("只有房主在开打前能加机器人");
    const i = room.seats.indexOf(null);
    if (i < 0) throw new E("已经坐满了");
    room.seats[i] = newSeat(room, "", "机器人" + i); bump(room);
    return { ok: true };
  },
  kick(o) {
    const room = getRoom(o), i = Number(o.seat);
    if (seatOf(room, o) !== 0 || room.st !== "wait" || !(i >= 1 && i <= 3) || !room.seats[i]) throw new E("现在不能请人离开");
    room.seats[i] = null; const w = room.waiters.get(i);
    if (w) { clearTimeout(w.timer); send(w.res, { err: "房主请你离开了房间" }); room.waiters.delete(i); }
    bump(room); return { ok: true };
  },
  leave(o) {
    const room = getRoom(o), i = seatOf(room, o);
    if (room.st === "wait") { if (i === 0) closeRoom(room, "房主解散了房间"); else { room.seats[i] = null; room.waiters.delete(i); bump(room); } }
    else if (room.st === "done") room.seats[i].gone = true;
    else { room.seats[i].gone = true; const a = room.asks[i]; if (a && !a.hidden) a.fin(MJ.bot(room.g, a.q)); bump(room); checkReady(room); }
    return { ok: true };
  },
  start(o) {
    const room = getRoom(o);
    if (seatOf(room, o) !== 0 || room.st !== "wait") throw new E("只有房主能开始");
    if (room.seats.includes(null)) throw new E("还没坐满 4 个人，可以加机器人");
    if ((bal.get(room.host) || 0) < room.need) throw new E("房卡不够了");
    log({ t: "use", addr: room.host, n: room.need, room: room.rid });
    room.k = 1; room.st = "play"; runRoom(room);
    return { ok: true };
  },
  act(o) {
    const room = getRoom(o), i = seatOf(room, o), a = room.asks[i], seat = room.seats[i];
    let v = o.v;
    if (!a || a.hidden || a.qid !== Number(o.qid)) return { ok: false };
    if (a.q.type === "swap") v = Array.isArray(v) && v.length === 3 && v.every((t) => Number.isInteger(t) && t >= 0 && t < 27) ? v : null;
    else if (a.q.type === "que") v = v === 0 || v === 1 || v === 2 ? v : -1;
    else if (a.q.type === "claim") v = ["hu", "peng", "gang", "pass"].includes(v) ? v : "pass";
    else { v = v && typeof v === "object" ? v : {}; v = v.hu === true ? { hu: true } : Number.isInteger(v.gang) && v.gang >= 0 && v.gang < a.q.gangs.length ? { gang: v.gang } : { discard: Number.isInteger(v.discard) ? v.discard : -1 }; }
    seat.miss = 0; seat.seen = room.humanAt = now(); a.fin(v);
    if (Object.keys(room.asks).length) bump(room); // 还在等别人：先让我看到「等其他人」
    return { ok: true };
  },
  ready(o) { const room = getRoom(o), i = seatOf(room, o); if (room.st === "between" && !room.seats[i].ready) { room.seats[i].ready = true; bump(room); checkReady(room); } return { ok: true }; },
  back(o) { const room = getRoom(o), s = room.seats[seatOf(room, o)]; s.auto = false; s.gone = false; s.miss = 0; s.seen = now(); bump(room); return { ok: true }; }, // 取消托管
};
function poll(o, res) {
  const room = getRoom(o), i = seatOf(room, o), s = room.seats[i], old = room.waiters.get(i);
  s.seen = room.humanAt = now();
  if (old) { clearTimeout(old.timer); send(old.res, { ver: room.ver }); room.waiters.delete(i); }
  if (Number(o.ver) !== room.ver) return send(res, view(room, i));
  const w = { res, timer: setTimeout(() => { if (room.waiters.get(i) === w) room.waiters.delete(i); s.seen = now(); send(res, { ver: room.ver }); }, 25000) };
  room.waiters.set(i, w);
  res.on("close", () => { if (room.waiters.get(i) === w) { clearTimeout(w.timer); room.waiters.delete(i); } });
}
setInterval(() => { // 打扫：没人的等待房 30 分钟、打完的房 15 分钟后收掉
  for (const room of [...rooms.values()]) {
    const idle = now() - room.at;
    if ((room.st === "wait" && idle > 1800000) || (room.st === "done" && idle > 900000)) closeRoom(room, "房间太久没人，已经关闭");
    else if (room.st === "between") checkReady(room);
  }
}, 30000).unref();

http.createServer((req, res) => {
  const origin = String(req.headers.origin || ""), ok = ALLOW.has(origin) || /^https:\/\/[a-z0-9-]+\.ailgns-data\.pages\.dev$/.test(origin);
  res.writeHead(200, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, ok ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}));
  if (req.method === "GET" && req.url === "/mj/health") return send(res, { ok: true, rooms: rooms.size, up: Math.round(process.uptime()) });
  if (req.method !== "POST" || req.url !== "/mj/api") return send(res, { err: "not found" });
  let body = "", big = false;
  req.on("data", (d) => { body += d; if (body.length > 4096) { big = true; req.destroy(); } });
  req.on("end", async () => {
    if (big) return;
    try {
      const o = JSON.parse(body);
      if (!o || typeof o !== "object") throw new E("请求不对");
      if (o.act === "poll") return poll(o, res);
      if (!Object.prototype.hasOwnProperty.call(H, o.act)) throw new E("请求不对");
      send(res, await H[o.act](o));
    } catch (e) {
      if (!(e instanceof E)) console.error("api", e && e.message);
      send(res, { err: e instanceof E ? e.message : e instanceof SyntaxError ? "请求不对" : "服务器开小差了，稍后再试" });
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log("麻将房间服务已启动，端口", PORT, "账本里", bal.size, "个钱包"));
process.on("uncaughtException", (e) => console.error("uncaught", e));
process.on("unhandledRejection", (e) => console.error("unhandled", e));
