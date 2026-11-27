// ⚡ 极速预言家（只读）：GET /api/fast?a=<钱包> → 本期倒计时、奖池、每个数字压了几票、最近开奖、我的票和下注记录。
// 算账规则在 lib/fast.js。这里不发交易、不碰私钥、不发奖（发奖是机器人第 3 步的事）。
// 还没上线（FAST_START 没填）时：正式站直接说「还没开放」；preview 用最近 6 小时的真实链上数据试算，方便站长看页面。
import { FAST_START, TRIAL_BLOCKS, FAST_POOL, STATE_V, batch, fresh, advance, view, mine, JP_GATE, JP_SKIP_FROM, JP_LAG, setClaims } from "../../lib/fast.js";
import { payDue, BURN_DAYS } from "../../lib/oracle.js";
import { recoverAddress } from "../../lib/evmsig.js";

const AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb"; // AiLGNS（Anubis）
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const KEY = "fast:st", JPC = "fast:jpc";
// 🏆 神算子领奖名单（规则见 lib/fast.js 的 JP_GATE）：从中奖名单里挑 JP_SKIP_FROM 起的大奖，记成 [{a, day, f, t}]。
//   记进 fast:jpc 以后只加不改：中奖名单只留最近 500 条，账本哪天要从头重数，也得认得出当年哪些注册是领奖用的。
async function claims(kv) {
  if (!JP_GATE || !kv) return [];
  const [pays, old] = await Promise.all([kv.get("or:pay", "json"), kv.get(JPC, "json")]);
  const list = Array.isArray(old) ? old : [], have = new Set(list.map((c) => c.a + ":" + c.day));
  let add = false;
  for (const x of pays || []) {
    if (x.kind !== "jackpot" || !(x.day >= JP_SKIP_FROM) || !x.a) continue;
    const a = String(x.a).toLowerCase();
    if (have.has(a + ":" + x.day)) continue;
    const t = payDue(x);
    list.push({ a, day: x.day, f: t - BURN_DAYS * 86400e3 + JP_LAG, t }); have.add(a + ":" + x.day); add = true;
  }
  if (add) await kv.put(JPC, JSON.stringify(list));
  return list;
}

async function load(ctx, trial) {
  const kv = trial ? null : ctx.env.TEAM_KV;
  const [b] = await batch([["eth_getBlockByNumber", ["latest", false]]]);
  const latest = { n: parseInt(b.number, 16), t: parseInt(b.timestamp, 16), h: b.hash };
  let st = kv ? await kv.get(KEY, "json") : null;
  if (!st || st.v !== STATE_V) st = fresh(trial ? latest.n - TRIAL_BLOCKS : FAST_START);
  const jl = await claims(kv); setClaims(jl); // 先认清谁在领大奖，再数票
  const dirty = await advance(st, latest);
  if (kv && (dirty || st.to - (st.saved || 0) > 600)) { st.saved = st.to; await kv.put(KEY, JSON.stringify(st)); } // 没新东西就不写，省 KV 写入次数
  // 资金池钱包链上实际有多少（站长 2026-11-14：页面只显示本期奖池 0，看不到池子里有钱）。放在存 KV 之后：只跟着 5 秒缓存走，不写进 KV；读不到就不显示
  try {
    const [d, a] = await batch([["eth_getBalance", [FAST_POOL, "latest"]], ["eth_call", [{ to: AIL, data: "0x70a08231" + FAST_POOL.slice(2).padStart(64, "0") }, "latest"]]]);
    st.res = { dai: Math.floor(Number(BigInt(d) / 10n ** 14n)) / 1e4, ail: Math.floor(Number(BigInt(a) / 10n ** 12n)) / 1e6 };
  } catch (e) { st.res = null; }
  st.jpc = jl;
  return st;
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), trial = !FAST_START;
  if (trial && !/(\.pages\.dev|^localhost|^127\.0\.0\.1)$/.test(u.hostname)) return json({ open: false });
  if (!trial && !ctx.env.TEAM_KV) return new Response("no kv", { status: 503 });
  const a = (u.searchParams.get("a") || "").toLowerCase();
  if (u.searchParams.get("hb") === "1") { // ⚡ 常驻发奖程序上次报到的时间（毫秒）：GitHub 定时任务看它决定自己快发还是只做后备（见 onRequestPost）
    return json({ hb: trial ? 0 : Number(await ctx.env.TEAM_KV.get("fast:hb")) || 0, now: Date.now() });
  }
  if (u.searchParams.get("jpc") === "1") { // 机器人读领奖名单（只读 KV，不读链）
    try { return json({ jpc: await claims(trial ? null : ctx.env.TEAM_KV), gate: JP_GATE }); } catch (e) { return json({ error: "读不到名单" }, 502); }
  }
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
  if (/^0x[0-9a-f]{40}$/.test(a)) {
    out.me = mine(st, a);
    const now = Date.now(); // 这个钱包正在领神算子大奖：现在注册的名字不算极速票（批量注册页据此不再写「送票」）
    if (JP_GATE && st.to >= JP_GATE && (st.jpc || []).some((c) => c.a === a && c.f <= now && now <= c.t)) out.me.jp = true;
  }
  return json(out);
}

/* ⚡ 常驻发奖程序报到（站长 2026-11-28「#528 中奖没到账，能不能秒到账」）：POST { action: "hb", t: 毫秒时间, sig }
   sig = 极速资金池钱包 personal_sign("ailgns-fast-hb:" + t)。常驻程序装在站长服务器上，开奖一确认就发奖，每 30 秒报到一次；
   GitHub 上的定时任务（monita fast_oracle.py）发奖前先看这里：150 秒内报过到就只做后备，两边不会抢着发。
   只认极速资金池钱包的签名、时间差 2 分钟以内；只记一个时间戳（fast:hb），不动任何钱 */
export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  if (!b || b.action !== "hb") return json({ error: "不支持" }, 400);
  const t = Number(b.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 120e3) return json({ error: "时间不对" }, 400);
  if (recoverAddress("ailgns-fast-hb:" + t, String(b.sig || "")) !== FAST_POOL) return json({ error: "签名不对" }, 403);
  await kv.put("fast:hb", String(t), { expirationTtl: 7 * 86400 });
  return json({ ok: true });
}
