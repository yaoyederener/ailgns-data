// KV 备份导出：只有带对的 BACKUP_KEY 才能读。monita 每天调一次，打包发邮件留底
// GET ?cursor=…   Header: Authorization: Bearer <BACKUP_KEY>
// → { items: [[key, value]], cursor }   cursor 为 null 时导完
// 只导链上恢复不了的数据：会员开通记录、VIP 转让、代开绑定、像素墙、团队树
const PREFIXES = ["mem:", "memtx:", "vipx:", "gift:", "giftto:", "mamt:", "px:", "pxtx:", "team:", "tree:"];
const BATCH = 400; // 每次最多读这么多个值（Cloudflare 单次请求的 KV 操作有上限）

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, key = ctx.env.BACKUP_KEY || "";
  const auth = (ctx.request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (key.length < 32 || !same(auth, key)) return new Response("forbidden", { status: 403 });
  if (!kv) return new Response("no kv", { status: 503 });
  // cursor = "前缀序号|KV 分页游标"
  const [pi, kc] = (new URL(ctx.request.url).searchParams.get("cursor") || "0|").split("|");
  let p = Number(pi) || 0, c = kc || undefined;
  const items = [];
  while (p < PREFIXES.length && items.length < BATCH) {
    const r = await kv.list({ prefix: PREFIXES[p], cursor: c, limit: BATCH - items.length });
    const vals = await Promise.all(r.keys.map((k) => kv.get(k.name)));
    r.keys.forEach((k, i) => items.push([k.name, vals[i]]));
    if (r.list_complete) p++, (c = undefined);
    else c = r.cursor;
  }
  return Response.json({ items, cursor: p < PREFIXES.length ? p + "|" + (c || "") : null }, { headers: { "cache-control": "no-store" } });
}
