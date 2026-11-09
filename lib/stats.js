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
    return kv.put(key, JSON.stringify(buf), { expirationTtl: 40 * 86400 });
  }).catch(() => { pending = null; });
  ctx.waitUntil(pending);
}

// 某一天全部实例的计数加起来
export async function counts(kv, d) {
  const keys = [];
  let cursor;
  do {
    const r = await kv.list({ prefix: "st:c:" + d + ":", cursor });
    keys.push(...r.keys.map((k) => k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  const sum = {};
  // 一天有几千把实例钥匙（2026-11-09 实测 4000–6000 把）：分批 500 个一起读，别一口气几千个并发
  for (let i = 0; i < keys.length; i += 500) {
    for (const v of await Promise.all(keys.slice(i, i + 500).map((k) => kv.get(k, "json")))) {
      for (const [k, n] of Object.entries(v || {})) sum[k] = (sum[k] || 0) + n;
    }
  }
  sum._n = keys.length; // 钥匙数（日报行记 kn，排查用）
  return sum;
}
