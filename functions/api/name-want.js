// 域名求购意向（不上链、不锁钱）：买家留「想要哪个名字、出多少 DAI」，名字主人看到后按这个价挂单，买家再去市场买入
// GET  → { list: [{ id, name, price, by, at }] }  价格高的排前面，30 天过期
// POST { name: "发财.ailgns", price: 500, by?: "0x…" } → { ok, list }
// DELETE ?id=…&key=BACKUP_KEY → 站长删掉不合适的
const KEY = "nmwant:list", DAY = 86400000, KEEP = 30 * DAY, MAX = 300;
const NAME_RE = /^([a-z0-9一-鿿-]{2,40})\.(ailgns|lgns)$/;
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");

async function load(kv) {
  let l = [];
  try { l = JSON.parse((await kv.get(KEY)) || "[]"); } catch (e) { l = []; }
  const now = Date.now();
  return l.filter((x) => now - x.at < KEEP);
}
const sorted = (l) => l.slice().sort((a, b) => b.price - a.price || a.at - b.at);

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  return Response.json({ list: sorted(await load(kv)).map(({ ip: _ip, ...x }) => x) }, { headers: { "cache-control": "no-store" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV, req = ctx.request;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await req.json(); } catch (e) { return Response.json({ error: "格式不对" }, { status: 400 }); }
  const name = String(b.name || "").trim().toLowerCase(), price = Math.round(Number(b.price) * 100) / 100, by = String(b.by || "").trim().toLowerCase();
  if (!NAME_RE.test(name)) return Response.json({ error: "域名格式不对，例如 发财.ailgns" }, { status: 400 });
  if (!(price >= 1 && price <= 10000000)) return Response.json({ error: "出价要在 1 到 10,000,000 DAI 之间" }, { status: 400 });
  if (by && !isAddr(by)) return Response.json({ error: "钱包地址格式不对（可以不填）" }, { status: 400 });
  // 防刷：同一个 IP 一小时最多 6 条
  const ip = req.headers.get("cf-connecting-ip") || "x", rk = "nmwant:ip:" + ip, n = Number((await kv.get(rk)) || 0);
  if (n >= 6) return Response.json({ error: "发得太频繁了，过一小时再来" }, { status: 429 });
  await kv.put(rk, String(n + 1), { expirationTtl: 3600 });
  let l = await load(kv);
  // 同一个出价人对同一个名字只留最新一条
  l = l.filter((x) => !(x.name === name && ((by && x.by === by) || (!by && x.ip === ip))));
  l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, price, by: by || "", ip, at: Date.now() });
  l = sorted(l).slice(0, MAX);
  await kv.put(KEY, JSON.stringify(l));
  return Response.json({ ok: true, list: l.map(({ ip: _ip, ...x }) => x) });
}

export async function onRequestDelete(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  if (!ctx.env.BACKUP_KEY || u.searchParams.get("key") !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
  const id = u.searchParams.get("id");
  const l = (await load(kv)).filter((x) => x.id !== id);
  await kv.put(KEY, JSON.stringify(l));
  return Response.json({ ok: true, n: l.length });
}
