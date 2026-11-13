// 大逃杀（#/br，试运行）：8 个房间，每 60 秒一局。前 40 秒选一个房间押农场金币，关门后大灰狼随机进一间「有人的房间」，
// 那间房的金币 10% 销毁、90% 按押注比例分给其它房间活下来的人。只有一个房间有人 → 人不够，押金原样退回。
// 红线（站长 2026-11-12 定，和麻将一致）：只用农场金币，不提现、不转赠、不上链，没有奖金奖品。
// KV：br:b:<局号>:<地址>（押注，房间和金额放在 metadata 里，一次 list 就能合计）、br:r:<局号>（开杀结果，写一次就不变）、br:hist（最近几局）、br:key（随机种子钥匙）
// 公平：每局种子 = HMAC(钥匙, 局号)，押注时先公布种子的指纹（sha256），开杀后公布种子；被杀房间 = 有人的房间从小到大排，取 种子前 12 位十六进制 % 房间数
import { auth, load, save, fresh } from "./farm.js";

export const ROOMS = [["🌾", "谷仓"], ["🐔", "鸡舍"], ["🥕", "菜窖"], ["🍎", "果园"], ["🐟", "鱼塘"], ["🌻", "花房"], ["🛖", "草屋"], ["⛲", "水井"]];
export const ROUND = 60, BET = 40, SHOW = 50; /* 一局 60 秒：0–40 秒押注，40 秒关门，50 秒开杀 */
export const MIN = 10, MAX = 1000, BURN = 0.1;
const TTL = 30 * 86400, HIST = 30;
const now = () => Math.floor(Date.now() / 1000);
export const ridOf = (t) => Math.floor(t / ROUND);
export const phaseOf = (t) => { const s = t % ROUND; return s < BET ? "bet" : s < SHOW ? "lock" : "show"; };

const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))); }
async function hmac(key, text) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text)));
}
let KEY = "";
async function secret(kv) {
  if (KEY) return KEY;
  let k = await kv.get("br:key");
  if (!k) { k = hex(crypto.getRandomValues(new Uint8Array(32))); await kv.put("br:key", k); }
  KEY = k;
  return k;
}
export async function seedOf(kv, rid) { return hmac(await secret(kv), "br:" + rid); }
export async function commitOf(kv, rid) { return sha256(await seedOf(kv, rid)); }

// 合计这一局每个房间的金币和人数
export async function tally(kv, rid) {
  const tot = ROOMS.map(() => 0), n = ROOMS.map(() => 0);
  let cursor, pages = 0;
  do {
    const p = await kv.list({ prefix: "br:b:" + rid + ":", cursor });
    for (const k of p.keys) {
      const m = k.metadata || {}, r = Number(m.r), a = Math.floor(Number(m.a));
      if (r >= 0 && r < ROOMS.length && a >= MIN && a <= MAX) { tot[r] += a; n[r]++; }
    }
    cursor = p.list_complete ? null : p.cursor;
  } while (cursor && ++pages < 20);
  return { tot, n };
}

// 纯计算：给定各房间合计和种子，定出杀哪一间、销毁多少、活下来的人分多少
export function decide(rid, tot, n, seed) {
  const rooms = [];
  let sum = 0, players = 0;
  tot.forEach((v, i) => { if (v > 0) rooms.push(i); sum += v; players += n[i]; });
  if (rooms.length < 2) return { rid, kill: -1, tot, n, sum, players, seed };
  const kill = rooms[parseInt(seed.slice(0, 12), 16) % rooms.length];
  const dead = tot[kill], burn = Math.floor(dead * BURN);
  return { rid, kill, tot, n, sum, players, dead, burn, pot: dead - burn, live: sum - dead, seed };
}

// 一个人这一局拿回多少金币：人不够 → 原样退；被杀 → 0；活着 → 本金 + 按比例分到的
export function payout(res, bet) {
  if (!res || res.kill < 0) return bet.a;
  if (bet.r === res.kill) return 0;
  return bet.a + Math.floor(bet.a * res.pot / res.live);
}

// 开杀：到点后谁先来谁算，结果写一次就不变（同一局的押注和种子相同，谁算都一样）
export async function settle(kv, rid, t = now()) {
  if (t < rid * ROUND + SHOW) return null;
  const key = "br:r:" + rid;
  const old = await kv.get(key, "json");
  if (old) return old;
  const { tot, n } = await tally(kv, rid);
  const res = decide(rid, tot, n, await seedOf(kv, rid));
  if (!res.players) return res; /* 没人玩的局不落库 */
  await kv.put(key, JSON.stringify(res), { expirationTtl: TTL });
  if (res.kill >= 0) {
    try {
      const h = (await kv.get("br:hist", "json")) || [];
      if (!h.some((x) => x.rid === rid)) {
        h.unshift({ rid, kill: res.kill, p: res.players, s: res.sum, d: res.dead });
        await kv.put("br:hist", JSON.stringify(h.slice(0, HIST)));
      }
    } catch (e) { /* 历史记不上不影响结算 */ }
  }
  return res;
}

// 把这个人上一局的结果结到金币里（懒结算：下次进大逃杀或进农场时到账）
export async function claim(kv, u, t = now()) {
  const b = u.br;
  if (!b) return null;
  const res = await settle(kv, b.rid, t);
  if (!res) return null;
  const got = payout(res, b);
  u.coins += got;
  u.brl = { rid: b.rid, r: b.r, a: b.a, kill: res.kill, got };
  delete u.br;
  return u.brl;
}

// 所有人都能看的牌桌：这一局各房间押了多少、开杀结果、最近几局
export async function state(kv, t = now()) {
  const rid = ridOf(t), ph = phaseOf(t);
  const [commit, hist] = await Promise.all([commitOf(kv, rid), kv.get("br:hist", "json")]);
  let res = null, live;
  if (ph === "show") { res = await settle(kv, rid, t); live = res; } else live = await tally(kv, rid);
  return { now: t, rid, ph, round: ROUND, bet: BET, show: SHOW, min: MIN, max: MAX, burn: BURN, rooms: ROOMS, tot: live.tot, n: live.n, commit, res, hist: (hist || []).slice(0, 12) };
}

// 玩家操作：a = "me" 看自己（顺手结上一局）；a = "bet" 进房间押金币（一局只能进一次，进了不能换）
export async function act(kv, b) {
  const addr = auth(b), t = now();
  let u = await load(kv, addr), dirty = false;
  if (!u) { u = fresh(); dirty = true; }
  if (await claim(kv, u, t)) dirty = true;
  if (b.a === "bet") {
    const rid = ridOf(t);
    if (phaseOf(t) !== "bet") throw new Error("这一局已经关门了，等下一局");
    if (u.br) throw new Error(u.br.rid === rid ? "这一局你已经进房间了，等大灰狼出动" : "上一局还在结算，等几秒再试");
    const r = Number(b.room), a = Number(b.amt);
    if (!Number.isInteger(r) || r < 0 || r >= ROOMS.length) throw new Error("没有这个房间");
    if (!Number.isInteger(a) || a < MIN || a > MAX) throw new Error("每局押 " + MIN + " 到 " + MAX + " 金币");
    if (u.coins < a) throw new Error("金币不够：要 " + a + "，你有 " + u.coins + "。去开心农场签到、种菜能赚");
    u.coins -= a;
    u.br = { rid, r, a };
    await kv.put("br:b:" + rid + ":" + addr, "1", { metadata: { r, a }, expirationTtl: TTL });
    dirty = true;
  } else if (b.a !== "me") throw new Error("不认识的操作");
  if (dirty) await save(kv, addr, u);
  return { ok: true, coins: u.coins, bet: u.br || null, last: u.brl || null, now: t };
}
