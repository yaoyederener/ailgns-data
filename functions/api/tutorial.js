// 🎬 视频教程（站长 2026-11-24：老年客户建议把操作视频放到网站上，比在群里一遍遍发有用；客服要能自己在后台更新）
// GET  ?list=1                              → 公开的教程列表（只列传完的）
// GET  ?list=1  + 请求头 x-key              → 后台列表（没传完的也列出来，好删掉重传）
// GET  ?v=<id>                              → 看这个视频（公开；支持 Range，苹果播放器必须有）
// POST { action:"new", title, size, type }  + x-key → 新建一条，返回 id 和要分几段
// POST 二进制 ?up=1&id=…&i=<第几段>           + x-key → 传一段（每段 8MB，按顺序传；最后一段到了才算传完、才公开）
// POST { action:"set", id, title?, move? }  + x-key → 改标题 / 上移下移（move: -1 上移，1 下移）
// POST { action:"del", id }                 + x-key → 删除（视频分段一起删）
// 口令只认工单后台那一个（FEEDBACK_KEY / BACKUP_KEY），放在请求头里，不进网址
// KV：tv:list [{ id, title, size, type, n, t, ok }]；tv:<id>:<i> 视频分段（不设过期，教程长期留着）
const PART = 8 * 1024 * 1024, TOTAL = 200 * 1024 * 1024, MAX_ITEMS = 60;
const VID_OK = /^video\/(mp4|quicktime|webm|x-m4v|3gpp)$/i;
const json = (o, s, h) => Response.json(o, { status: s || 200, headers: Object.assign({ "cache-control": "no-store" }, h || {}) });
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
const getList = async (kv) => (await kv.get("tv:list", "json")) || [];
const CAT = (c) => (c === "otc" || c === "off" ? c : "");
const pub = (x) => ({ id: x.id, title: x.title, size: x.size, t: x.t, ok: !!x.ok, cat: CAT(x.cat) });

function stream(ctx, kv, x) {
  const total = Number(x.size) || 0, type = x.type || "video/mp4";
  let start = 0, end = total - 1, partial = false;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(ctx.request.headers.get("range") || "").trim());
  if (m && (m[1] || m[2])) {
    partial = true;
    if (m[1] === "") start = Math.max(0, total - Number(m[2]));
    else { start = Number(m[1]); if (m[2] !== "") end = Math.min(end, Number(m[2])); }
    if (!(start <= end) || start >= total) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + total } });
  }
  const first = Math.floor(start / PART), last = Math.floor(end / PART);
  const { readable, writable } = new FixedLengthStream(end - start + 1);
  ctx.waitUntil((async () => {
    const w = writable.getWriter();
    try {
      for (let i = first; i <= last; i++) {
        const buf = await kv.get("tv:" + x.id + ":" + i, "arrayBuffer");
        if (!buf) throw new Error("missing part " + i);
        const off = i * PART, a = Math.max(start, off) - off, b = Math.min(end, off + buf.byteLength - 1) - off + 1;
        await w.write(new Uint8Array(buf, a, b - a));
      }
      await w.close();
    } catch (e) { try { await w.abort(e); } catch (z) { /* 客户端已经断开 */ } }
  })());
  const h = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=86400" };
  if (partial) h["content-range"] = "bytes " + start + "-" + end + "/" + total;
  return new Response(readable, { status: partial ? 206 : 200, headers: h });
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const list = await getList(kv);
  const v = u.searchParams.get("v");
  if (v) {
    const x = list.find((y) => y.id === v && y.ok);
    if (!x) return new Response("视频没找到（可能已经被删掉了）", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return stream(ctx, kv, x);
  }
  const k = ctx.request.headers.get("x-key");
  if (k) {
    if (!keyOk(ctx.env, k)) return json({ error: "口令不对" }, 403);
    return json({ list: list.map(pub), admin: true, max: TOTAL });
  }
  return json({ list: list.filter((x) => x.ok).map(pub) }, 200, { "cache-control": "public, max-age=60" });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  if (!keyOk(ctx.env, ctx.request.headers.get("x-key"))) return json({ error: "口令不对" }, 403);
  const list = await getList(kv);
  const save = () => kv.put("tv:list", JSON.stringify(list));

  if (u.searchParams.get("up")) {
    const id = String(u.searchParams.get("id") || ""), i = Number(u.searchParams.get("i"));
    const x = list.find((y) => y.id === id);
    if (!x) return json({ error: "没有这条教程，请重新上传" }, 404);
    if (x.ok) return json({ error: "这条教程已经传完了" }, 400);
    if (!Number.isInteger(i) || i < 0 || i >= x.n) return json({ error: "视频分段不对，请刷新页面重新传" }, 400);
    const want = i < x.n - 1 ? PART : x.size - (x.n - 1) * PART;
    if (Number(ctx.request.headers.get("content-length") || 0) > PART) return json({ error: "视频分段不对，请刷新页面重新传" }, 400);
    const buf = await ctx.request.arrayBuffer();
    if (buf.byteLength !== want) return json({ error: "这一段没传完整（网络断了），请再传一次", retry: 1 }, 400);
    await kv.put("tv:" + id + ":" + i, buf);
    if (i < x.n - 1) return json({ ok: true, i, done: false });
    x.ok = true; x.t = Date.now();
    await save();
    return json({ ok: true, i, done: true });
  }

  let b; try { b = await ctx.request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  if (b.action === "new") {
    const title = String(b.title || "").trim().slice(0, 40), size = Number(b.size), type = String(b.type || "").split(";")[0].trim();
    if (!title) return json({ error: "请先写标题" }, 400);
    if (!VID_OK.test(type)) return json({ error: "这个文件不是常见的视频格式，请用手机录的视频 / 录屏（mp4 或 mov）" }, 400);
    if (!(size > 0) || !Number.isInteger(size)) return json({ error: "视频是空的，请重新选一次" }, 400);
    if (size > TOTAL) return json({ error: "视频太大了（最多 200MB）。请录短一点，或者用手机自带的「录屏」" }, 400);
    if (list.length >= MAX_ITEMS) return json({ error: "教程已经有 " + MAX_ITEMS + " 条了，请先删掉旧的" }, 400);
    const x = { id: Date.now().toString(36), title, size, type, n: Math.ceil(size / PART), t: Date.now(), ok: false, cat: CAT(b.cat) };
    list.unshift(x);
    await save();
    return json({ ok: true, id: x.id, n: x.n, part: PART });
  }
  const at = list.findIndex((y) => y.id === String(b.id || ""));
  if (at < 0) return json({ error: "没有这条教程" }, 404);
  if (b.action === "set") {
    if (typeof b.title === "string" && b.title.trim()) list[at].title = b.title.trim().slice(0, 40);
    if (CAT(b.cat)) list[at].cat = CAT(b.cat);
    const to = at + (b.move === -1 ? -1 : b.move === 1 ? 1 : 0);
    if (to !== at && to >= 0 && to < list.length) { const y = list[at]; list[at] = list[to]; list[to] = y; }
    await save();
    return json({ ok: true });
  }
  if (b.action === "del") {
    const x = list.splice(at, 1)[0];
    await save();
    for (let i = 0; i < x.n; i++) await kv.delete("tv:" + x.id + ":" + i).catch(() => {});
    return json({ ok: true });
  }
  return json({ error: "不认识的操作" }, 400);
}
