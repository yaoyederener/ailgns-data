// ⚡ 极速预言家（只读）：GET /api/fast?a=<钱包> → 本期倒计时、奖池、每个数字压了几票、最近开奖、我的票和下注记录。
// 算账规则在 lib/fast.js。这里不发交易、不碰私钥、不发奖（发奖是机器人第 3 步的事）。
// 还没上线（FAST_START 没填）时：正式站直接说「还没开放」；preview 用最近 6 小时的真实链上数据试算，方便站长看页面。
import { FAST_START, TRIAL_BLOCKS, FAST_POOL, batch, fresh, advance, view, mine } from "../../lib/fast.js";

const AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb"; // AiLGNS（Anubis）
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const KEY = "fast:st";

async function load(ctx, trial) {
  const kv = trial ? null : ctx.env.TEAM_KV;
  const [b] = await batch([["eth_getBlockByNumber", ["latest", false]]]);
  const latest = { n: parseInt(b.number, 16), t: parseInt(b.timestamp, 16), h: b.hash };
  let st = kv ? await kv.get(KEY, "json") : null;
  if (!st || st.v !== 1) st = fresh(trial ? latest.n - TRIAL_BLOCKS : FAST_START);
  const dirty = await advance(st, latest);
  if (kv && (dirty || st.to - (st.saved || 0) > 600)) { st.saved = st.to; await kv.put(KEY, JSON.stringify(st)); } // 没新东西就不写，省 KV 写入次数
  // 资金池钱包链上实际有多少（站长 2026-11-14：页面只显示本期奖池 0，看不到池子里有钱）。放在存 KV 之后：只跟着 5 秒缓存走，不写进 KV；读不到就不显示
  try {
    const [d, a] = await batch([["eth_getBalance", [FAST_POOL, "latest"]], ["eth_call", [{ to: AIL, data: "0x70a08231" + FAST_POOL.slice(2).padStart(64, "0") }, "latest"]]]);
    st.res = { dai: Math.floor(Number(BigInt(d) / 10n ** 14n)) / 1e4, ail: Math.floor(Number(BigInt(a) / 10n ** 12n)) / 1e6 };
  } catch (e) { st.res = null; }
  return st;
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), trial = !FAST_START;
  if (trial && !/(\.pages\.dev|^localhost|^127\.0\.0\.1)$/.test(u.hostname)) return json({ open: false });
  if (!trial && !ctx.env.TEAM_KV) return new Response("no kv", { status: 503 });
  const a = (u.searchParams.get("a") || "").toLowerCase();
  // 5 秒内重复打开直接用上一次算好的（秒开；也省节点）
  const ckey = new Request("https://fast.internal/st-v1" + (trial ? "-trial" : ""));
  let st = null;
  try { const hit = await caches.default.match(ckey); if (hit) st = await hit.json(); } catch (e) { /* 没有缓存就现算 */ }
  if (!st) {
    try { st = await load(ctx, trial); } catch (e) { return json({ error: "读链失败，稍后再试" }, 502); }
    try { ctx.waitUntil(caches.default.put(ckey, new Response(JSON.stringify(st), { headers: { "cache-control": "max-age=5" } }))); } catch (e) { /* 忽略 */ }
  }
  const out = view(st, trial);
  out.pool = FAST_POOL; out.res = st.res || null;
  if (/^0x[0-9a-f]{40}$/.test(a)) out.me = mine(st, a);
  return json(out);
}
