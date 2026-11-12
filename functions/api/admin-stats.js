// 📊 站长数据面板接口：只读 ops-watch 每 5 分钟算好的缓存（adm:res），秒开；站长说延迟无所谓
// GET ?key=<FEEDBACK_KEY 或 BACKUP_KEY>
import { build } from "../../lib/adminstats.js";
// 💰 钱包留存（站长 2026-11-12：「不要毛收入，按谷歌账户留存的真实收入」）：和合伙人面板同一份链上数据
// 最近 8 天取 ptn:res（今天、昨天的会员费/其它是现算的），更早的取 ptn:fl + ptn:src2；没扫到的日子不给，前端显示「—」
async function keepOf(kv) {
  const TK = ["dai", "ail", "lgns"], MK = { dai: "mDai", ail: "mAil", lgns: "mLgns" }, out = {};
  const one = (f, x) => {
    const g = (k) => (f && f[k]) || {}, P = { otc: {}, nm: {}, mem: {}, oth: {}, all: {}, pool: g("pool").dai || 0 };
    TK.forEach((t) => { P.otc[t] = g("otc")[t] || 0; P.nm[t] = (g("nm")[t] || 0) - (g("pool")[t] || 0); P.mem[t] = (x && x[MK[t]]) || 0; P.oth[t] = ((x && x[t]) || 0) + (g("oth")[t] || 0); P.all[t] = P.otc[t] + P.nm[t] + P.mem[t] + P.oth[t]; });
    return P;
  };
  const [res, fl, src] = await Promise.all([kv.get("ptn:res", "json"), kv.get("ptn:fl", "json"), kv.get("ptn:src2", "json")]);
  if (fl && fl.dt && src) Object.keys(fl.d || {}).forEach((d) => { if (d > fl.d0 && d <= fl.dt && src[d]) out[d] = one(fl.d[d], src[d]); });
  ((res && res.rows) || []).forEach((r) => { if (r.fl) out[r.day] = one(r.fl, r.src || {}); });
  return out;
}
export async function onRequestGet(ctx) {
  const env = ctx.env, kv = env.TEAM_KV, key = new URL(ctx.request.url).searchParams.get("key");
  if (!key || !((env.FEEDBACK_KEY && key === env.FEEDBACK_KEY) || (env.BACKUP_KEY && key === env.BACKUP_KEY))) return Response.json({ error: "口令不对" }, { status: 403 });
  if (!kv) return Response.json({ error: "no kv" }, { status: 503 });
  let out = await kv.get("adm:res", "json");
  // ?keys=1：数今天/昨天/前天各有多少把访问计数钥匙（排查「昨天访客 0」）
  if (new URL(ctx.request.url).searchParams.get("keys")) {
    const cnt = async (d) => { let n = 0, cur, sample = []; do { const r = await kv.list({ prefix: "st:c:" + d + ":", cursor: cur, limit: 1000 }); n += r.keys.length; if (!sample.length) sample = r.keys.slice(0, 2).map((x) => x.name); cur = r.list_complete ? null : r.cursor; } while (cur); return { n, sample }; };
    const out = {}; for (let i = 0; i < 3; i++) { const d = new Date(Date.now() + 8 * 3600e3 - i * 86400e3).toISOString().slice(0, 10); out[d] = await cnt(d); }
    const any = await kv.list({ prefix: "st:c:", limit: 5 }); out.anyPrefix = any.keys.map((x) => x.name);
    return Response.json(out);
  }
  // ?rebuild=1：当场重算并把出错原因返回（排查后台静默失败用，站长口令）
  if (new URL(ctx.request.url).searchParams.get("rebuild")) { try { out = await build(env, kv, ctx); } catch (e) {
      // 顺便数一下今天/昨天各有多少把计数钥匙（每把 = 1 次 KV 读），判断是不是撞 1000 次上限
      const cnt = async (d) => { let n = 0, cur; do { const r = await kv.list({ prefix: "st:c:" + d + ":", cursor: cur, limit: 1000 }); n += r.keys.length; cur = r.list_complete ? null : r.cursor; } while (cur); return n; };
      const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), yd = new Date(Date.now() + 8 * 3600e3 - 86400e3).toISOString().slice(0, 10);
      let keys = {}; try { keys = { [today]: await cnt(today), [yd]: await cnt(yd) }; } catch (x) {}
      return Response.json({ error: "重算出错：" + String(e.message || e).slice(0, 500), keys, stack: String(e.stack || "").slice(0, 800) }, { status: 500 }); } }
  if (!out) { try { out = await build(env, kv, ctx); } catch (e) { return Response.json({ error: "面板第一次生成出错：" + String(e.message || e).slice(0, 300) }, { status: 500 }); } }
  out.keep = await keepOf(kv).catch(() => ({}));
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
