// ⚡ 秒到通道（第三方 GaleBridge）的体检 + 实测费率。页面 gale.js 每次打开秒到通道先问这里，通过了才让客户发交易。
// 为什么要有：2026-11-20 站长要简体界面，GaleBridge 自己的小窗只有繁体 / 英文，所以页面改成本站自己的卡片、直接调它的合约。
// 那是它没有公开写明的接法，所以每次都先核对三件事，任何一件不对就不让走（宁可拦）：
//   ① 它公开的清单（galebridge.net/api/v1/integration/networks，官方接入文档里给的）里，合约地址还是本站登记的那个、币还在、限额是多少；
//   ② 目标链上它的合约里钱够不够（链上读余额）；
//   ③ 最近有没有「存进去好几分钟还没付」的单（两条链的记录对一遍）。
// 费率：它公开的只有每笔固定的那部分（fixedCost）；按比例的那部分没公布，这里拿最近约 1～2 小时链上真实的「存入 → 付款」配对算中位数，样本不够就用 2026-11-20 量的数。
// 只读公开数据，不带任何客户信息；结果在边缘缓存 3 分钟。
const AN = "https://rpc.anubispace.org";
const RPC = { "137": "https://polygon-bor-rpc.publicnode.com", "56": "https://bsc-rpc.publicnode.com" };
const GALE = { "6714": "0xd1a5c8492ed1773ca0f1a97abad71afb122a750a", "137": "0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "56": "0xc615f91a31791f1bf4ac7f7fdc60525bf1804186" };
const DEP = "0x1cbdf89ba7d7cd8303790e1d0c0dcbc95b421c3d27f4958e058ec003073df946"; // 存入（客户, 币；数量, "目标链,收款人,目标币"）
const PAY = "0xae33cb06d7303f889d953bb09540983050163c1c4c98b330db432a911cfb63fd"; // 付款（付款方, 币, 收款人；数量）
export const SRC = { DAI: ["0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", 18], USDT: ["0xdfb6a28bc6dc51fed17c27c880f2c66cdd040a3e", 6] }; // Anubis 上能付出的币
export const DST = { // 能到账的币：键、链、地址、小数位、名字
  PD: ["137", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", 18, "DAI"], PU: ["137", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", 6, "USDT"],
  BU: ["56", "0x55d398326f99059ff775485246999027b3197955", 18, "USDT"], BD: ["56", "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", 18, "DAI"]
};
export const FALLBACK = { "DAI>DAI": 0.0041, "DAI>USDT": 0.0032, "USDT>USDT": 0.003, "USDT>DAI": 0.0034 }; // 2026-11-20 链上量的比例费（不含固定的 0.1）
const pad = (a) => "0".repeat(24) + String(a).slice(2).toLowerCase();

async function rpc(url, calls) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: c[0], params: c[1] }))) });
  const j = await r.json(), out = [];
  if (!Array.isArray(j)) throw new Error("rpc");
  for (const x of j) { if (x.error) throw new Error(x.error.message || "rpc"); out[x.id] = x.result; }
  return out;
}
// 纯计算（方便单独测）：把存入和付款配对，算每个「付出币 > 到账币」的比例费中位数，和「存了没付」的单数
export function analyse(deps, pays, fix, nowBlock) {
  const used = new Set(), samples = {}, late = {};
  for (const k of Object.keys(DST)) { samples[k] = { DAI: [], USDT: [] }; late[k] = 0; }
  const key = (c, t) => Object.keys(DST).find((k) => DST[k][0] === c && DST[k][1] === t);
  const matched = new Set();
  for (const p of pays) {
    const k = key(p.c, p.tok); if (!k) continue;
    let best = -1, gap = 1;
    deps.forEach((d, i) => {
      if (used.has(i) || d.c !== p.c || d.recv !== p.to || d.dtok !== p.tok || !(d.amt >= p.amt)) return;
      const g = (d.amt - p.amt) / d.amt; if (g < 0.03 && g < gap) { gap = g; best = i; }
    });
    if (best < 0) continue;
    used.add(best); matched.add(best);
    const d = deps[best], r = (d.amt - p.amt - (fix[k] || 0)) / d.amt;
    if (samples[k][d.sym] && r > 0 && r < 0.02) samples[k][d.sym].push(r);
  }
  deps.forEach((d, i) => { // Anubis 约 1 秒一个块：存了 3～25 分钟还没配上付款的，算「晚了」
    const k = key(d.c, d.dtok); if (!k || matched.has(i)) return;
    const age = nowBlock - d.b; if (age > 180 && age < 1500) late[k]++;
  });
  const pct = {};
  for (const k of Object.keys(DST)) for (const s of ["DAI", "USDT"]) {
    const a = samples[k][s].slice().sort((x, y) => x - y), fb = FALLBACK[s + ">" + DST[k][3]];
    pct[s + ">" + k] = a.length >= 3 ? { pct: Math.round(a[Math.floor(a.length / 2)] * 1e5) / 1e5, n: a.length } : { pct: fb, n: 0 };
  }
  return { pct, late };
}

async function compute() {
  const out = { ok: false, why: "", at: Date.now(), pairs: {} };
  // ① 它公开的清单
  let nets = null;
  try { const r = await fetch("https://galebridge.net/api/v1/integration/networks", { headers: { accept: "application/json" } }); nets = await r.json(); } catch (e) { nets = null; }
  if (!Array.isArray(nets)) { out.why = "list"; return out; }
  const net = (c) => nets.find((n) => String(n.chainId) === c), tok = (c, a) => ((net(c) || {}).tokens || []).find((t) => String(t.address).toLowerCase() === a);
  for (const c of Object.keys(GALE)) if (!net(c) || String(net(c).contractAddress).toLowerCase() !== GALE[c]) { out.why = "contract"; return out; }
  const lim = {}, fix = {};
  for (const s of Object.keys(SRC)) { const t = tok("6714", SRC[s][0]); if (!t) { out.why = "token"; return out; } lim[s] = [Number(t.minAmount) || 10, Number(t.maxAmount) || 50000]; }
  for (const k of Object.keys(DST)) { const t = tok(DST[k][0], DST[k][1]); if (!t) { out.why = "token"; return out; } fix[k] = Number(t.fixedCost); if (!(fix[k] >= 0)) fix[k] = 0.1; }
  // ② ③ 读链
  let deps = [], pays = [], liq = {}, nowBlock = 0;
  try {
    const [topHex] = await rpc(AN, [["eth_blockNumber", []]]); nowBlock = parseInt(topHex, 16);
    const ranges = [[nowBlock - 9999, nowBlock - 5000], [nowBlock - 4999, nowBlock]];
    const dl = await rpc(AN, ranges.map((r) => ["eth_getLogs", [{ address: GALE["6714"], topics: [DEP], fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16) }]]));
    for (const l of dl[0].concat(dl[1])) {
      const t = "0x" + l.topics[2].slice(26), s = Object.keys(SRC).find((x) => SRC[x][0] === t); if (!s) continue;
      const d = l.data.slice(2), n = parseInt(d.slice(128, 192), 16); let memo = "";
      for (let i = 0; i < n; i++) memo += String.fromCharCode(parseInt(d.slice(192 + i * 2, 194 + i * 2), 16));
      const m = memo.split(","); if (m.length !== 3) continue;
      deps.push({ b: parseInt(l.blockNumber, 16), sym: s, amt: Number(BigInt("0x" + d.slice(0, 64))) / Math.pow(10, SRC[s][1]), c: m[0], recv: m[1].toLowerCase(), dtok: m[2].toLowerCase() });
    }
    for (const c of Object.keys(RPC)) {
      const [th] = await rpc(RPC[c], [["eth_blockNumber", []]]), top = parseInt(th, 16), ks = Object.keys(DST).filter((k) => DST[k][0] === c);
      const calls = [["eth_getLogs", [{ address: GALE[c], topics: [PAY], fromBlock: "0x" + (top - 5000).toString(16), toBlock: "0x" + top.toString(16) }]]]
        .concat(ks.map((k) => ["eth_call", [{ to: DST[k][1], data: "0x70a08231" + pad(GALE[c]) }, "latest"]]));
      const res = await rpc(RPC[c], calls);
      for (const l of res[0]) {
        const t = "0x" + l.topics[2].slice(26), k = ks.find((x) => DST[x][1] === t); if (!k) continue;
        pays.push({ c, tok: t, to: "0x" + l.topics[3].slice(26), amt: Number(BigInt(l.data)) / Math.pow(10, DST[k][2]) });
      }
      ks.forEach((k, i) => { liq[k] = Math.floor(Number(BigInt(res[1 + i])) / Math.pow(10, DST[k][2])); });
    }
  } catch (e) { out.why = "chain"; return out; }
  const a = analyse(deps, pays, fix, nowBlock);
  for (const s of Object.keys(SRC)) for (const k of Object.keys(DST)) {
    const p = a.pct[s + ">" + k];
    out.pairs[s + ">" + k] = { pct: p.pct, n: p.n, fix: fix[k], min: lim[s][0], max: lim[s][1], liq: liq[k] || 0, late: a.late[k] || 0 };
  }
  out.ok = true;
  return out;
}

export async function onRequestGet(ctx) {
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/gale?v=1");
  try { const hit = await cache.match(ck); if (hit) return hit; } catch (e) { /* 没缓存就现算 */ }
  let body;
  try { body = await compute(); } catch (e) { body = { ok: false, why: "error", at: Date.now(), pairs: {} }; }
  const res = Response.json(body, { headers: { "cache-control": "public, max-age=" + (body.ok ? 180 : 20) } });
  try { ctx.waitUntil(cache.put(ck, res.clone())); } catch (e) { /* 存不了缓存不影响返回 */ }
  return res;
}
