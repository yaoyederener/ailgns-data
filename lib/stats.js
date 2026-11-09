// 访问 / 查询次数统计（内部群日报用）：只记次数，不记地址、IP 等个人信息
// 每个 Worker 实例在内存里攒着，最多 10 秒写一次 KV；键按实例分开（st:c:<北京日期>:<实例>），互不覆盖，日报时把当天的全部加起来
export const bjDay = (ms = Date.now()) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);

const ISO = Math.random().toString(36).slice(2, 10);
let buf = {}, day = "", pending = null;

export function bump(ctx, name, n = 1) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return;
  const d = bjDay();
  if (d !== day) { buf = {}; day = d; }
  buf[name] = (buf[name] || 0) + n;
  if (pending) return;
  const key = "st:c:" + day + ":" + ISO;
  pending = new Promise((ok) => setTimeout(ok, 10000)).then(() => {
    pending = null;
    // 2026-11-09：计数同时写进键的 metadata（≤1 KB），日报 list 一次就能拿到几百把钥匙的数，不用一把一把 get（一天 4000–6000 把实例钥匙，get 会撞 Worker 请求上限）
    const s = JSON.stringify(buf);
    return kv.put(key, s, { expirationTtl: 40 * 86400, metadata: s.length <= 1000 ? buf : { big: 1 } });
  }).catch(() => { pending = null; });
  ctx.waitUntil(pending);
}

// 某一天全部实例的计数加起来
export async function counts(kv, d) {
  const keys = [], sum = {};
  let cursor, total = 0;
  const add = (v) => { for (const [k, n] of Object.entries(v || {})) if (typeof n === "number") sum[k] = (sum[k] || 0) + n; };
  do {
    const r = await kv.list({ prefix: "st:c:" + d + ":", cursor, limit: 1000 });
    for (const k of r.keys) { total++; if (k.metadata && !k.metadata.big) add(k.metadata); else keys.push(k.name); } // 有 metadata 的直接加；老钥匙 / 超大钥匙才 get
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  for (let i = 0; i < keys.length; i += 500) {
    for (const v of await Promise.all(keys.slice(i, i + 500).map((k) => kv.get(k, "json")))) add(v);
  }
  sum._n = total; sum._g = keys.length; // 钥匙数 / 其中要单独 get 的数（日报行记 kn/kg，排查用；一次调用 get 太多会撞上限）
  return sum;
}
