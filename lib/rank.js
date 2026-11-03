// OTC 成交额排行榜：lb:vol = { 地址: [累计成交 DAI, 成交笔数] }（三个币市场合并，和 otct:<地址> 同一口径）
// otc-watch 每读到新成交就加上；还没有这个 key 时，第一次查询从所有 otct:<地址> 汇总出来
export const LB_KEY = "lb:vol";
// 平台自己的合约不上榜（回购合约会在 OTC 里买 AiLGNS）
export const LB_SKIP = new Set(["0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3"]);

export async function addVol(kv, deltas) {
  const keys = Object.keys(deltas);
  if (!keys.length) return;
  const lb = await kv.get(LB_KEY, "json");
  if (!lb) return; // 还没建：等第一次查询时从 otct 汇总（那时已经包含这些成交）
  for (const a of keys) {
    const r = lb[a] || [0, 0];
    lb[a] = [r[0] + deltas[a][0], r[1] + deltas[a][1]];
  }
  await kv.put(LB_KEY, JSON.stringify(lb));
}

export async function loadRank(kv) {
  let lb = await kv.get(LB_KEY, "json");
  if (lb) return lb;
  lb = {};
  let cursor;
  do {
    const page = await kv.list({ prefix: "otct:", cursor });
    const vals = await Promise.all(page.keys.map((k) => kv.get(k.name, "json")));
    page.keys.forEach((k, i) => { const v = vals[i]; if (v && v.vol) lb[k.name.slice(5)] = [v.vol, v.n || 0]; });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  await kv.put(LB_KEY, JSON.stringify(lb));
  return lb;
}
