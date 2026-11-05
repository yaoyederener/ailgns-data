// 📈 币安式 K 线数据：AiLGNS/DAI 池子的每一笔 Swap（真实成交）→ 1 分钟 K 线存 KV（最近 7 天），按请求聚合成 1m/5m/15m/1h/4h/1d
//   GET ?i=1m|5m|15m|1h|4h|1d&n=300 → { c: [[时间秒, 开, 高, 低, 收, 成交额DAI], …], cur, from, done, at }
// 历史慢慢往前补：每次请求最多读 10 段（每段 5000 块 ≈ 1.4 小时），前端轮询几次就补满 7 天。只在有新成交时才写 KV
import { rpc, PAIR } from "../../lib/oracle.js";

const SWAP = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const KEY = "kc:1m", KEEP = 7 * 86400, CHUNK = 5000, MAXC = 10, FRESH = 8e3;
const IV = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
const big = (h) => Number(BigInt("0x" + h) / 1000000000000n) / 1e6; // 18 位小数 → 数字（6 位精度）
let mem = null; // 同一个实例里缓存一下，省 KV 读
const blockTs = async (n) => parseInt((await rpc("eth_getBlockByNumber", ["0x" + n.toString(16), false])).timestamp, 16);

async function readChunk(st, f, e) {
  const [tsF, tsE, logs] = await Promise.all([blockTs(f), blockTs(e), rpc("eth_getLogs", [{ address: PAIR, topics: [SWAP], fromBlock: "0x" + f.toString(16), toBlock: "0x" + e.toString(16) }])]);
  const span = Math.max(1, e - f);
  let changed = 0;
  for (const lg of logs) {
    const w = lg.data.slice(2), a0i = big(w.slice(0, 64)), a1i = big(w.slice(64, 128)), a0o = big(w.slice(128, 192)), a1o = big(w.slice(192, 256));
    let px = 0, vol = 0;
    if (a1i > 0 && a0o > 0) { px = a1i / a0o; vol = a1i; } else if (a1o > 0 && a0i > 0) { px = a1o / a0i; vol = a1o; }
    if (!px || !isFinite(px)) continue;
    const t = Math.floor(tsF + (parseInt(lg.blockNumber, 16) - f) * (tsE - tsF) / span), m = Math.floor(t / 60) * 60, x = st.c[m];
    if (!x) st.c[m] = [px, px, px, px, vol];
    else { x[1] = Math.max(x[1], px); x[2] = Math.min(x[2], px); x[3] = px; x[4] += vol; }
    changed++;
  }
  return { changed, tsF, tsE };
}

async function refresh(kv) {
  const now = Date.now();
  if (mem && now - mem.at < FRESH) return mem;
  let st = (await kv.get(KEY, "json")) || null;
  const [b, res] = await Promise.all([rpc("eth_getBlockByNumber", ["latest", false]), rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "latest"])]);
  const latest = parseInt(b.number, 16), tsL = parseInt(b.timestamp, 16), w = res.slice(2);
  const cur = Number((BigInt("0x" + w.slice(64, 128)) * 1000000n) / BigInt("0x" + w.slice(0, 64))) / 1e6;
  if (!st) st = { to: latest, from: latest + 1, tsTo: tsL, tsFrom: tsL, c: {} };
  let budget = MAXC, dirty = !(await kv.get(KEY)), fills = 0;
  // ① 往后补新块
  while (st.to < latest && budget-- > 0) {
    const f = st.to + 1, e = Math.min(latest, f + CHUNK - 1), r = await readChunk(st, f, e);
    st.to = e; st.tsTo = r.tsE; fills += r.changed; if (r.changed) dirty = true;
  }
  // ② 往前补历史，直到 7 天
  while (st.tsFrom > tsL - KEEP && st.from > 1 && budget-- > 0) {
    const e = st.from - 1, f = Math.max(1, e - CHUNK + 1), r = await readChunk(st, f, e);
    st.from = f; st.tsFrom = r.tsF; fills += r.changed; dirty = true;
  }
  // 只留 7 天
  const cut = tsL - KEEP - 3600;
  for (const k of Object.keys(st.c)) if (Number(k) < cut) { delete st.c[k]; dirty = true; }
  if (dirty) await kv.put(KEY, JSON.stringify(st));
  mem = { st, cur, tsL, at: now, fills };
  return mem;
}

function aggregate(st, sec, n, tsL, cur) {
  const ks = Object.keys(st.c).map(Number).sort((a, b) => a - b), end = Math.floor(tsL / sec) * sec, start = end - (n - 1) * sec, out = [];
  let prev = null, i = 0;
  while (i < ks.length && ks[i] < start) { prev = st.c[ks[i]][3]; i++; }
  if (prev === null) prev = ks.length ? st.c[ks[0]][0] : cur;
  for (let t = start; t <= end; t += sec) {
    let o = prev, h = prev, l = prev, c = prev, v = 0, any = false;
    while (i < ks.length && ks[i] < t + sec) {
      const x = st.c[ks[i]]; if (!any) { o = x[0]; h = x[1]; l = x[2]; any = true; }
      h = Math.max(h, x[1]); l = Math.min(l, x[2]); c = x[3]; v += x[4]; i++;
    }
    if (t === end && cur) { c = cur; h = Math.max(h, cur); l = Math.min(l, cur); } // 最后一根用池子现价收口，实时跳动
    out.push([t, +o.toFixed(4), +h.toFixed(4), +l.toFixed(4), +c.toFixed(4), Math.round(v * 100) / 100]);
    prev = c;
  }
  return out;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const u = new URL(ctx.request.url), sec = IV[u.searchParams.get("i")] || 60, n = Math.min(500, Math.max(20, Number(u.searchParams.get("n")) || 300));
  try {
    const m = await refresh(kv);
    return Response.json({ c: aggregate(m.st, sec, n, m.tsL, m.cur), cur: m.cur, from: m.st.tsFrom, done: m.st.tsFrom <= m.tsL - KEEP, at: m.at, fills: m.fills }, { headers: { "cache-control": "public, max-age=4" } });
  } catch (e) {
    return Response.json({ error: String(e && e.message || e).slice(0, 200) }, { status: 502 });
  }
}
