// 🖼 宣传海报（站长 2026-11-28：「以后让中奖的伙伴转发我们的 OTC 海报，帮我们宣传……1.给后台加一个上传海报的功能 2.领奖页显示海报引导客户下载发到 DeBox 宣传」）
// GET  ?list=1                                 → 公开列表 [{ id, title, type, w, h }]（边缘缓存 60 秒，领奖页 / #/posters 用）
// GET  ?list=1  + 请求头 x-key                  → 后台列表（不走缓存，多给 size、t）
// GET  ?img=<id>                               → 海报原图。编号一旦定了内容就不变 → 浏览器和边缘都长期缓存，几乎不读 KV（站长 2026-11-27：KV 读取是账单大头）
// POST { action:"add", title, img: dataURL, w, h } + x-key → 新增一张（JPG / PNG / WebP，最大 3MB；前端已把太大的压过）
// POST { action:"set", id, title?, move? }     + x-key → 改标题 / 上移下移（move: -1 上移，1 下移）
// POST { action:"del", id }                    + x-key → 删除
// 口令只认工单后台那一个（FEEDBACK_KEY / BACKUP_KEY），放在请求头里，不进网址
// KV：po:list [{ id, title, type, size, w, h, t }]；po:img:<id> 图片原文件（不设过期，删了才没）
const MAX_ITEMS = 12, IMG_MAX = 3 * 1024 * 1024, TYPE_OK = /^image\/(jpeg|png|webp)$/;
const json = (o, s, h) => Response.json(o, { status: s || 200, headers: Object.assign({ "cache-control": "no-store" }, h || {}) });
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
const getList = async (kv) => (await kv.get("po:list", "json")) || [];
const pub = (x) => ({ id: x.id, title: x.title || "", type: x.type, w: x.w || 0, h: x.h || 0 });
const LIST_CK = () => new Request("https://ailgns.dev/api/posters?list=1&v=1");
const IMG_CK = (id) => new Request("https://ailgns.dev/api/posters?img=" + encodeURIComponent(id));
const cleanId = (s) => String(s || "").replace(/[^a-z0-9]/g, "").slice(0, 24);
const cleanTitle = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url), cache = caches.default;
  const img = cleanId(u.searchParams.get("img"));
  if (img) {
    const hit = await cache.match(IMG_CK(img)); if (hit) return hit;
    const r = await kv.getWithMetadata("po:img:" + img, "arrayBuffer");
    if (!r || !r.value) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
    const type = (r.metadata && TYPE_OK.test(r.metadata.type || "") && r.metadata.type) || "image/jpeg";
    const res = new Response(r.value, { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
    ctx.waitUntil(cache.put(IMG_CK(img), res.clone()));
    return res;
  }
  if (!u.searchParams.get("list")) return json({ error: "?" }, 400);
  if (ctx.request.headers.get("x-key")) { // 后台
    if (!keyOk(ctx.env, ctx.request.headers.get("x-key"))) return json({ error: "口令不对" }, 403);
    const l = await getList(kv);
    return json({ list: l.map((x) => Object.assign(pub(x), { size: x.size || 0, t: x.t || 0 })), max: MAX_ITEMS });
  }
  const hit = await cache.match(LIST_CK()); if (hit) return hit;
  const res = json({ list: (await getList(kv)).map(pub) }, 200, { "cache-control": "public, max-age=60" });
  ctx.waitUntil(cache.put(LIST_CK(), res.clone()));
  return res;
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV, cache = caches.default;
  if (!keyOk(ctx.env, ctx.request.headers.get("x-key"))) return json({ error: "口令不对" }, 403);
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对（图片太大的话请换一张小一点的）" }, 400); }
  const l = await getList(kv);
  const saveList = async () => { await kv.put("po:list", JSON.stringify(l)); ctx.waitUntil(cache.delete(LIST_CK())); }; // 改完清掉这台机房的列表缓存；别的机房最多 60 秒后也是新的
  if (b.action === "add") {
    if (l.length >= MAX_ITEMS) return json({ error: "最多放 " + MAX_ITEMS + " 张海报，先删掉不用的再传" }, 400);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.img || ""));
    if (!m) return json({ error: "只收 JPG / PNG / WebP 图片" }, 400);
    let bin;
    try { bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch (e) { return json({ error: "图片读不出来，请换一张" }, 400); }
    if (bin.length > IMG_MAX) return json({ error: "图片太大了（" + (bin.length / 1048576).toFixed(1) + "MB），最大 3MB" }, 400);
    if (bin.length < 2000) return json({ error: "图片太小了，请传正常的海报" }, 400);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await kv.put("po:img:" + id, bin, { metadata: { type: m[1] } });
    const x = { id, title: cleanTitle(b.title), type: m[1], size: bin.length, w: Math.max(0, Math.round(Number(b.w) || 0)), h: Math.max(0, Math.round(Number(b.h) || 0)), t: Date.now() };
    l.push(x); await saveList();
    return json({ ok: true, it: pub(x) });
  }
  const id = cleanId(b.id), i = l.findIndex((x) => x.id === id);
  if (i < 0) return json({ error: "没有这张海报，刷新一下" }, 404);
  if (b.action === "set") {
    if (typeof b.title === "string") l[i].title = cleanTitle(b.title);
    const mv = Number(b.move) || 0, j = i + (mv < 0 ? -1 : mv > 0 ? 1 : 0);
    if (j !== i && j >= 0 && j < l.length) { const t = l[i]; l[i] = l[j]; l[j] = t; }
    await saveList();
    return json({ ok: true });
  }
  if (b.action === "del") {
    l.splice(i, 1); await saveList();
    await kv.delete("po:img:" + id);
    ctx.waitUntil(cache.delete(IMG_CK(id)));
    return json({ ok: true });
  }
  return json({ error: "?" }, 400);
}
