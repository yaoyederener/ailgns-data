// 📈 币安式 K 线数据：AiLGNS/DAI 池子的每一笔 Swap（真实成交）→ 1 分钟 K 线存 KV（最近 7 天），按请求聚合成 1m/5m/15m/1h/4h/1d
//   GET ?i=1m|5m|15m|1h|4h|1d&n=300 → { c: [[时间秒, 开, 高, 低, 收, 成交额DAI], …], cur, from, done, at }
// 历史慢慢往前补：每次请求最多读 10 段（每段 5000 块 ≈ 1.4 小时），前端轮询几次就补满 7 天。只在有新成交时才写 KV
import { rpc, PAIR } from "../../lib/oracle.js";

const SWAP = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", SYNC = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
// 价格用 Sync（成交后的池子储备比）而不是单笔 Swap 的进出比：小额/高滑点的单笔会算出离谱价格，储备价才是市场价
const KEY = "kc:1m:v2", KEEP = 7 * 86400, CHUNK = 5000, MAXC = 10, FRESH = 8e3;
const IV = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
const big = (h) => Number(BigInt("0x" + h) / 1000000000000n) / 1e6; // 18 位小数 → 数字（6 位精度）
const blockTs = async (n) => parseInt((await rpc("eth_getBlockByNumber", ["0x" + n.toString(16), false])).timestamp, 16);

async function readChunk(st, f, e) {
  const [tsF, tsE, logs] = await Promise.all([blockTs(f), blockTs(e), rpc("eth_getLogs", [{ address: PAIR, topics: [[SYNC, SWAP]], fromBlock: "0x" + f.toString(16), toBlock: "0x" + e.toString(16) }])]);
  const span = Math.max(1, e - f);
  let changed = 0, syncPx = 0;
  logs.sort((a, b) => (parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16)) || (parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16)));
  for (const lg of logs) {
    const w = lg.data.slice(2);
    if (lg.topics[0] === SYNC) { const r0 = BigInt("0x" + w.slice(0, 64)), r1 = BigInt("0x" + w.slice(64, 128)); if (r0 > 0n) syncPx = Number((r1 * 1000000n) / r0) / 1e6; continue; }
    const a0i = big(w.slice(0, 64)), a1i = big(w.slice(64, 128)), a0o = big(w.slice(128, 192)), a1o = big(w.slice(192, 256));
    const vol = a1i > 0 ? a1i : a1o, px = syncPx;
    if (!px || !isFinite(px) || !(a0i > 0 || a0o > 0)) continue;
    const t = Math.floor(tsF + (parseInt(lg.blockNumber, 16) - f) * (tsE - tsF) / span), m = Math.floor(t / 60) * 60, x = st.c[m];
    if (!x) st.c[m] = [px, px, px, px, vol];
    else { x[1] = Math.max(x[1], px); x[2] = Math.min(x[2], px); x[3] = px; x[4] += vol; }
    changed++;
  }
  return { changed, tsF, tsE };
}

// 先答后补：请求只读 KV + 2 次快速 RPC（最新块、池子储备）立刻返回；补新块 / 补历史放到后台（waitUntil），同一时刻只跑一个
async function tick(kv) {
  const [st, b, res] = await Promise.all([kv.get(KEY, "json"), rpc("eth_getBlockByNumber", ["latest", false]), rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "latest"])]);
  const latest = parseInt(b.number, 16), tsL = parseInt(b.timestamp, 16), w = res.slice(2);
  const cur = Number((BigInt("0x" + w.slice(64, 128)) * 1000000n) / BigInt("0x" + w.slice(0, 64))) / 1e6;
  return { st: st || { to: latest, from: latest + 1, tsTo: tsL, tsFrom: tsL, c: {}, fresh: true }, latest, tsL, cur };
}
async function backfill(kv, st, latest, tsL) {
  if (await kv.get("kc:busy")) return; // 别人正在补
  await kv.put("kc:busy", "1", { expirationTtl: 50 });
  try {
    let budget = MAXC, dirty = !!st.fresh; delete st.fresh;
    while (st.to < latest && budget-- > 0) { const f = st.to + 1, e = Math.min(latest, f + CHUNK - 1), r = await readChunk(st, f, e); st.to = e; st.tsTo = r.tsE; if (r.changed) dirty = true; }
    while (st.tsFrom > tsL - KEEP && st.from > 1 && budget-- > 0) { const e = st.from - 1, f = Math.max(1, e - CHUNK + 1), r = await readChunk(st, f, e); st.from = f; st.tsFrom = r.tsF; dirty = true; }
    const cut = tsL - KEEP - 3600;
    for (const k of Object.keys(st.c)) if (Number(k) < cut) { delete st.c[k]; dirty = true; }
    if (dirty || st.to === latest) await kv.put(KEY, JSON.stringify(st)); // 块号推进也要记，不然每次都从老地方重读
  } finally { await kv.delete("kc:busy").catch(() => {}); }
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
    const m = await tick(kv), st = m.st, behind = m.latest - st.to, done = st.tsFrom <= m.tsL - KEEP;
    if (behind > 30 || !done) ctx.waitUntil(backfill(kv, st, m.latest, m.tsL).catch(() => {})); // 后台补，不耽误这次回答
    return Response.json({ c: aggregate(st, sec, n, m.tsL, m.cur), cur: m.cur, from: st.tsFrom, done, at: Date.now() }, { headers: { "cache-control": "public, max-age=4" } });
  } catch (e) {
    return Response.json({ error: String(e && e.message || e).slice(0, 200) }, { status: 502 });
  }
}
