// AiLGNS/DAI 1 小时 K 线（预言家页面用）：KV 里存最近 48 小时的小时 K 线，每次只补读新区块的 Sync 事件
// KV：or:k = { to: 已读到的区块, at: 更新时间, cur: 最新价, c: { 小时开始时间(秒): [开, 高, 低, 收] } }
import { rpc, PAIR } from "../../lib/oracle.js";

const SYNC = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
const N = 24, KEEP = 48 * 3600, FRESH = 20e3;
const pxOf = (w) => Number((BigInt("0x" + w.slice(64, 128)) * 1000000n) / BigInt("0x" + w.slice(0, 64))) / 1e6;

function out(st, tsL) {
  const h0 = Math.floor(tsL / 3600) * 3600 - (N - 1) * 3600, c = [];
  let prev = null;
  const ks = Object.keys(st.c).map(Number).sort((a, b) => a - b);
  for (const k of ks) if (k < h0) prev = st.c[k][3]; // 窗口前最后一根的收盘
  if (prev === null) prev = ks.length ? st.c[ks[0]][0] : st.cur;
  for (let i = 0; i < N; i++) {
    const t = h0 + i * 3600, x = st.c[t];
    c.push(x ? [t, ...x] : [t, prev, prev, prev, prev]);
    prev = c[i][4];
  }
  return Response.json({ c, cur: st.cur, at: st.at }, { headers: { "cache-control": "public, max-age=15" } });
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let st = await kv.get("or:k", "json");
  const now = Date.now();
  if (st && now - st.at < FRESH) return out(st, st.ts);
  try {
    const b = await rpc("eth_getBlockByNumber", ["latest", false]), latest = parseInt(b.number, 16), tsL = parseInt(b.timestamp, 16);
    if (!st || latest - st.to > KEEP) { // 第一次（或太久没更新）：从 24 小时前开始读
      const from = latest - (tsL - (Math.floor(tsL / 3600) * 3600 - (N - 1) * 3600)) - 1;
      st = { to: from, c: {}, cur: pxOf((await rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "0x" + from.toString(16)])).slice(2)) };
    }
    let cur = st.cur;
    for (let f = st.to + 1; f <= latest; f += 5000) {
      const logs = await rpc("eth_getLogs", [{ address: PAIR, topics: [SYNC], fromBlock: "0x" + f.toString(16), toBlock: "0x" + Math.min(latest, f + 4999).toString(16) }]);
      for (const lg of logs) {
        const p = pxOf(lg.data.slice(2)), t = tsL - (latest - parseInt(lg.blockNumber, 16)), k = Math.floor(t / 3600) * 3600; // 约 1 秒一块，按区块号推时间
        const x = st.c[k];
        if (!x) st.c[k] = [cur, Math.max(cur, p), Math.min(cur, p), p]; // 开盘 = 这一小时第一笔之前的价格
        else { x[1] = Math.max(x[1], p); x[2] = Math.min(x[2], p); x[3] = p; }
        cur = p;
      }
      st.to = Math.min(latest, f + 4999);
    }
    st.cur = cur; st.to = latest; st.ts = tsL; st.at = now;
    for (const k of Object.keys(st.c)) if (Number(k) < tsL - KEEP) delete st.c[k];
    await kv.put("or:k", JSON.stringify(st));
    return out(st, tsL);
  } catch (e) {
    if (st) return out(st, st.ts || Math.floor(now / 1000));
    return Response.json({ error: "读链失败" }, { status: 502 });
  }
}
