// 📈 看盘页（#/chart）的数据：官方 DEX 池子的现价、池子里的钱、最近成交
//   GET ?m=ailgns|lgns → { px, liq, coin, dai, list: [{ t, s: "b"|"s", q, d, a, tx }], info: { holders, supply } | null, at }
//   px = 池子标价（1 个币值多少 DAI）；liq = 池子两边合计值多少 DAI（= DAI 存量 × 2）；list 新的在前，最多 40 笔，只列 1 DAI 以上的
//   s："b" = 有人拿 DAI 买币，"s" = 有人卖币换 DAI；a = 这笔钱最后打给谁（Swap 事件里的 to）；时间按 1 秒 1 块往回推，是约数
// 不用 KV；边缘缓存 8 秒，再多人看也只是每个边缘每 8 秒读一次链。持币地址数 / 总量来自官方浏览器，缓存 10 分钟，读不到就不给（页面不显示）
import { rpc } from "../../lib/oracle.js";

const SWAP = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
// span = 往回看多少块找成交：LGNS 一秒一笔，看几分钟就够；AiLGNS 稀一些，多看一会
const MKS = {
  ailgns: { pair: "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0", token: "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", d0: 18, span: 4000 },
  lgns: { pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", token: "0x4d1d808a081fdac440703b3765fc61f8028c06b8", d0: 9, span: 900 },
};
const hex = (n) => "0x" + n.toString(16);
const word = (w, i) => BigInt("0x" + w.slice(i * 64, i * 64 + 64));

async function tokenInfo(ctx, k, M) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/dex-info?m=" + k);
  const hit = await cache.match(ck); if (hit) return hit.json();
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch("https://browser.anubispace.org/api/v2/tokens/" + M.token, { signal: ac.signal });
    if (!r.ok) return null;
    const j = await r.json(), holders = Number(j.holders_count) || 0, supply = Number(BigInt(j.total_supply || "0") / 10n ** BigInt(M.d0));
    if (!holders || !supply) return null;
    const info = { holders, supply };
    ctx.waitUntil(cache.put(ck, Response.json(info, { headers: { "cache-control": "public, max-age=600" } })));
    return info;
  } catch (e) { return null; } finally { clearTimeout(tm); }
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), k = u.searchParams.get("m") === "lgns" ? "lgns" : "ailgns", M = MKS[k];
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/dex?m=" + k);
  const hit = await cache.match(ck); if (hit) return hit;
  try {
    const [b, res] = await Promise.all([rpc("eth_getBlockByNumber", ["latest", false]), rpc("eth_call", [{ to: M.pair, data: "0x0902f1ac" }, "latest"])]);
    const latest = parseInt(b.number, 16), tsL = parseInt(b.timestamp, 16), w = res.slice(2), r0 = word(w, 0), r1 = word(w, 1);
    if (r0 <= 0n || r1 <= 0n) throw new Error("池子是空的");
    const coin = Number(r0) / 10 ** M.d0, dai = Number(r1) / 1e18;
    const [logs, info] = await Promise.all([
      rpc("eth_getLogs", [{ address: M.pair, topics: [SWAP], fromBlock: hex(Math.max(1, latest - M.span)), toBlock: hex(latest) }]).catch(() => []),
      tokenInfo(ctx, k, M),
    ]);
    const list = [];
    for (let i = logs.length - 1; i >= 0 && list.length < 40; i--) {
      const lg = logs[i], d = lg.data.slice(2);
      if (d.length < 256 || !lg.topics || lg.topics.length < 3) continue;
      const a0i = word(d, 0), a1i = word(d, 1), a0o = word(d, 2), a1o = word(d, 3), sell = a0i > a0o;
      const q = Number(sell ? a0i - a0o : a0o - a0i) / 10 ** M.d0, dd = Number(sell ? a1o - a1i : a1i - a1o) / 1e18;
      if (!(q > 0) || !(dd >= 1)) continue; // 两头都没净进出的（闪电贷之类）不算成交；不到 1 DAI 的碎单不列（LGNS 池子里一大半是这种，刷屏）
      list.push({ t: tsL - (latest - parseInt(lg.blockNumber, 16)), s: sell ? "s" : "b", q, d: Math.round(dd * 100) / 100, a: "0x" + lg.topics[2].slice(26), tx: lg.transactionHash });
    }
    const out = Response.json({ px: dai / coin, liq: Math.round(dai * 2), coin, dai, list, info, at: Date.now() }, { headers: { "cache-control": "public, max-age=8" } });
    ctx.waitUntil(cache.put(ck, out.clone()));
    return out;
  } catch (e) {
    return Response.json({ error: String(e && e.message || e).slice(0, 200) }, { status: 502 });
  }
}
