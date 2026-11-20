// AiLGNS 荣耀榜：和会员卡「OTC 累计成交」同一口径（单笔成交满 50 DAI 才算，防小额刷单）
// lbq:vol          = { 地址: [累计 DAI, 笔数] }  总榜；还没有时从 otcq:<地址>（+ 门槛前老用户的 otct）汇总
// lbm:<YYYY-MM>    = 同上，月榜（北京时间自然月，每月 1 号清零）；还没有时从 tr:<地址> 成交记录汇总本月
// lbhof            = [{ ym, top: [{ a, vol }] }]  名人堂：历届月榜前三
// lbsnap:<YYYY-MM> = { 地址: 名次 }，lbev = [{ a, from, to, over, at }]  月榜名次上升播报
import { ADDRESSES } from "./addresses.js";
export const VIP_MIN = 50;
const OLD_CUTOFF = { anubis: 17967579, polygon: 96531101 }; // 和 member.js 的 OTC_VIP_CUTOFF 一样
// 不上榜：本站自己的合约和钱包（站长 2026-11-20：榜一竟是「一键成交」的批量扫单合约——客户本人的成交已另记在各自名下，合约那行只是合计；
// 官方做市机器人、官方做市钱包、奖池这些自家钱包也一起拿掉）。直接读地址登记表：以后新登记的自家地址自动不上榜。合伙人的钱包是他们个人的，照常上榜
export const HONOR_SKIP = new Set(["0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", "0x89dd06754bb239b6c4c92bc47c8fa72889084e27"]
  .concat(ADDRESSES.filter((x) => !/^合伙人/.test(x.n)).map((x) => String(x.a).toLowerCase())));
// 段位（按名次）
export const TIERS = [[1, "最强王者"], [3, "荣耀王者"], [10, "王者"], [20, "星耀"], [50, "钻石"]];
export const tierOf = (rank) => { for (let i = 0; i < TIERS.length; i++) if (rank && rank <= TIERS[i][0]) return i; return -1; };

export const ymOf = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 7);
export function monthStart(ym) { return Date.parse(ym + "-01T00:00:00+08:00"); }
export function nextMonthStart(ym) { const [y, m] = ym.split("-").map(Number); return Date.parse((m === 12 ? y + 1 + "-01" : y + "-" + String(m + 1).padStart(2, "0")) + "-01T00:00:00+08:00"); }
const prevYm = (ym) => ymOf(monthStart(ym) - 1000);

async function listAll(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    out.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

export async function loadTotal(kv) {
  let lb = await kv.get("lbq:vol", "json");
  if (lb) return lb;
  lb = {};
  const [q, t] = await Promise.all([listAll(kv, "otcq:0x"), listAll(kv, "otct:0x")]);
  for (const k of q) { const v = await kv.get(k, "json"); if (v && v.vol) lb[k.slice(5)] = [v.vol, v.n || 0]; }
  for (const k of t) {
    const a = k.slice(5);
    if (lb[a]) continue;
    const v = await kv.get(k, "json");
    if (v && v.vol && v.block < (OLD_CUTOFF[v.chain || "anubis"] || 0)) lb[a] = [v.vol, v.n || 0];
  }
  await kv.put("lbq:vol", JSON.stringify(lb));
  return lb;
}

export async function loadMonth(kv, ym) {
  let lb = await kv.get("lbm:" + ym, "json");
  if (lb) return lb;
  lb = {};
  const from = monthStart(ym) / 1000, to = nextMonthStart(ym) / 1000;
  for (const k of await listAll(kv, "tr:0x")) {
    const list = (await kv.get(k, "json")) || [];
    for (const r of list) {
      if (r.t >= from && r.t < to && r.dai >= VIP_MIN) { const x = lb[k.slice(3)] || (lb[k.slice(3)] = [0, 0]); x[0] += r.dai; x[1] += 1; }
    }
  }
  await kv.put("lbm:" + ym, JSON.stringify(lb), { expirationTtl: 400 * 86400 });
  return lb;
}

// otc-watch 每读到新的 ≥50 DAI 成交调用：总榜一直加；月榜只加实时读到的（补记的老成交不算进本月）
export async function addHonor(kv, deltas, live) {
  const keys = Object.keys(deltas);
  if (!keys.length) return;
  const targets = ["lbq:vol"].concat(live ? ["lbm:" + ymOf(Date.now())] : []);
  for (const key of targets) {
    const lb = await kv.get(key, "json");
    if (!lb) continue; // 还没建：第一次查询时汇总（那时已包含这些成交）
    for (const a of keys) { const r = lb[a] || [0, 0]; lb[a] = [r[0] + deltas[a][0], r[1] + deltas[a][1]]; }
    await kv.put(key, JSON.stringify(lb), key.startsWith("lbm:") ? { expirationTtl: 400 * 86400 } : undefined);
  }
}

export function ranked(lb) {
  return Object.entries(lb).filter(([a, v]) => !HONOR_SKIP.has(a) && v[0] > 0).sort((x, y) => y[1][0] - x[1][0]);
}

// 上榜必须有本站域名（站长 2026-11-20：「上榜的必须有域名，把没有域名的地址移出」）。
// lbnm = { 地址: ["1" 或 "", 查的时刻] }，所有地址放一条 KV；一小时重查一次；lookup(地址数组) → { 地址: "1" 或 "" }（lib/oracle.js domainFlags，一次查一批）。
// fresh：这几个地址要是记的是「没域名」且超过 1 分钟，马上重查（本人刚注册完域名回来看榜）。链上读不到就沿用上次记的。
export const NM_TTL = 3600e3, NM_MAX = 900;
export async function nameMap(kv, addrs, lookup, fresh = [], now = Date.now()) {
  const nm = (await kv.get("lbnm", "json")) || {};
  const need = addrs.slice(0, NM_MAX).filter((a) => !nm[a] || now - nm[a][1] > NM_TTL);
  for (const a of fresh) if (nm[a] && !nm[a][0] && now - nm[a][1] > 60e3 && need.indexOf(a) < 0) need.push(a);
  if (need.length) {
    let got = null;
    try { got = await lookup(need); } catch (e) { got = null; }
    const ks = got ? Object.keys(got) : [];
    if (ks.length) { for (const a of ks) nm[a] = [got[a] || "", now]; await kv.put("lbnm", JSON.stringify(nm)); }
  }
  return nm;
}
// 能不能上榜：查到没有域名的不上；还没查到过的（链上一时读不到）先照常显示，免得整张榜空掉
export const namedOk = (nm) => (a) => !nm[a] || !!nm[a][0];

// 名人堂：上个月的前三名还没记的，记进去
export async function hallOfFame(kv, ym, named) { /* named(排好的榜) → 只留有域名的（可以不传） */
  const hof = (await kv.get("lbhof", "json")) || [], p = prevYm(ym);
  if (!hof.some((x) => x.ym === p)) {
    const lb = await kv.get("lbm:" + p, "json");
    if (lb) {
      const all = ranked(lb), top = (named ? await named(all) : all).slice(0, 3).map(([a, v]) => ({ a, vol: Math.round(v[0]) }));
      if (top.length) { hof.unshift({ ym: p, top }); await kv.put("lbhof", JSON.stringify(hof.slice(0, 60))); }
    }
  }
  return hof;
}

// 月榜名次上升：和上次的名次比，升了就记一条播报（超过了谁、升到第几、进了什么段位）
export async function rankEvents(kv, ym, all, ok) { /* ok(地址) → 能不能上榜（可以不传） */
  const can = (a) => !HONOR_SKIP.has(a) && (!ok || ok(a));
  const snapKey = "lbsnap:" + ym, now = {}, top = all.slice(0, 50);
  let old = (await kv.get(snapKey, "json")) || null;
  if (old) { /* 上次的名次里要是还有不上榜的地址（名单刚加人），先把它们拿掉、后面的往前补，免得大家平白「升名次」被播报一遍 */
    const keep = Object.entries(old).filter(([a]) => can(a)).sort((x, y) => x[1] - y[1]);
    if (keep.length !== Object.keys(old).length) { old = {}; keep.forEach(([a], i) => { old[a] = i + 1; }); }
  }
  top.forEach(([a], i) => { now[a] = i + 1; });
  let ev = (await kv.get("lbev", "json")) || [];
  if (old) {
    const byRank = {};
    Object.entries(old).forEach(([a, r]) => { byRank[r] = a; });
    const fresh = [];
    top.forEach(([a, v], i) => {
      const to = i + 1, from = old[a] || 0;
      if (from && from <= to) return;
      // 只播有看头的：进前 10、段位升级、新冲进榜单
      if (from && to > 10 && tierOf(to) === tierOf(from)) return;
      fresh.push({ a, from, to, over: byRank[to] && byRank[to] !== a ? byRank[to] : "", vol: Math.round(v[0]), at: Date.now() });
    });
    if (fresh.length) { ev = fresh.slice(0, 5).concat(ev).slice(0, 30); await kv.put("lbev", JSON.stringify(ev)); }
  }
  if (!old || JSON.stringify(old) !== JSON.stringify(now)) await kv.put(snapKey, JSON.stringify(now), { expirationTtl: 60 * 86400 });
  return ev.filter((e) => Date.now() - e.at < 3 * 86400e3 && can(e.a) && (!e.over || can(e.over)));
}
