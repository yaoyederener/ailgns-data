// 📮 客户问题反馈（工单）：客户在 #/feedback 提交「钱包地址 + 文字 + 截图」，站长在 #/feedback/admin 挨个处理
// POST { a, txt, imgs: [dataURL…] }                 → 新工单（截图前端已压缩成 JPEG；最多 4 张）；DeBox 私信通知客服
// GET  ?mine=0x…                                    → 这个地址的工单进度（客户看：编号、时间、状态、回复，不含截图）
// GET  ?key=FEEDBACK_KEY&list=1[&st=new|doing|done]   → 工单列表（站长）
// GET  ?key=FEEDBACK_KEY&img=<id>:<n>                 → 一张截图
// POST { key, action: "set", id, st?, note? }       → 改状态 / 写回复（回复客户能在页面上看到）
// KV：tk:seq 编号；tk:list [id…]；tk:<id> 工单；tk:img:<id>:<n> 截图
import { sendDebox } from "../../lib/debox.js";
import { SUPPORT_USER } from "../../lib/support.js";

// 后台口令：FEEDBACK_KEY（站长自己设的，专给工单后台）或 BACKUP_KEY（keeper 用的随机长串）都认
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));

const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const ST = { new: "待处理", doing: "处理中", done: "已解决" };
const pub = (t) => ({ id: t.id, t: t.t, st: t.st, txt: t.txt.slice(0, 200), note: t.note || "", n: t.n });

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const mine = (u.searchParams.get("mine") || "").toLowerCase();
  if (isAddr(mine)) {
    const ids = (await kv.get("tk:a:" + mine, "json")) || [];
    const ts = (await Promise.all(ids.slice(-20).map((id) => kv.get("tk:" + id, "json")))).filter(Boolean).reverse();
    return json({ list: ts.map(pub) });
  }
  if (!keyOk(ctx.env, u.searchParams.get("key"))) return json({ error: "口令不对" }, 403);
  const img = u.searchParams.get("img");
  if (img) {
    const d = await kv.get("tk:img:" + img.replace(":", ":"));
    if (!d) return new Response("not found", { status: 404 });
    const m = d.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return new Response("bad", { status: 400 });
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { "content-type": m[1], "cache-control": "private, max-age=86400" } });
  }
  const st = u.searchParams.get("st") || "";
  const ids = ((await kv.get("tk:list", "json")) || []).slice(-300).reverse();
  let ts = (await Promise.all(ids.map((id) => kv.get("tk:" + id, "json")))).filter(Boolean);
  const cnt = { new: 0, doing: 0, done: 0 };
  ts.forEach((t) => { cnt[t.st] = (cnt[t.st] || 0) + 1; });
  if (st) ts = ts.filter((t) => t.st === st);
  return json({ list: ts, cnt });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对（截图太大的话请少传几张）" }, 400); }
  if (b.action === "set") {
    if (!keyOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
    const t = await kv.get("tk:" + b.id, "json");
    if (!t) return json({ error: "没有这个工单" }, 404);
    if (b.st && ST[b.st]) t.st = b.st;
    if (typeof b.note === "string") t.note = b.note.slice(0, 1000);
    t.up = Date.now();
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    // 处理完：客户绑定过 DeBox 机器人的，私信告诉他回复内容
    if (b.st === "done" && t.note) {
      const users = (await kv.get("dbx:a:" + t.a, "json")) || [];
      const msg = "📮 你的反馈工单 #" + t.id + " 已处理\n\n💬 客服回复：" + t.note + "\n\n查看 👉 https://ailgns.dev/#/feedback";
      ctx.waitUntil(Promise.all(users.map((u) => sendDebox(ctx.env, u, msg, "private").catch(() => {}))));
    }
    return json({ ok: true, t });
  }
  const a = String(b.a || "").trim().toLowerCase(), txt = String(b.txt || "").trim();
  const imgs = Array.isArray(b.imgs) ? b.imgs.filter((x) => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x)) : [];
  if (!isAddr(a)) return json({ error: "请填正确的钱包地址（0x 开头，42 位）" }, 400);
  if (txt.length < 2 && !imgs.length) return json({ error: "请写一下遇到的问题，或者贴一张截图" }, 400);
  if (txt.length > 2000) return json({ error: "文字太长了，2000 字以内" }, 400);
  if (imgs.length > 4) return json({ error: "截图最多 4 张" }, 400);
  if (imgs.some((x) => x.length > 1.5e6)) return json({ error: "有一张截图太大了，请换一张" }, 400);
  const ip = ctx.request.headers.get("cf-connecting-ip") || "x";
  if (await kv.get("tk:rl:" + ip)) return json({ error: "提交太快了，请 1 分钟后再试" }, 400);
  await kv.put("tk:rl:" + ip, "1", { expirationTtl: 60 });
  const id = Number((await kv.get("tk:seq")) || "0") + 1;
  await kv.put("tk:seq", String(id));
  const t = { id, a, txt, n: imgs.length, t: Date.now(), st: "new", note: "" };
  for (let i = 0; i < imgs.length; i++) await kv.put("tk:img:" + id + ":" + i, imgs[i], { expirationTtl: 180 * 86400 });
  await kv.put("tk:" + id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
  const list = ((await kv.get("tk:list", "json")) || []).concat(id).slice(-1000);
  await kv.put("tk:list", JSON.stringify(list));
  const mine = ((await kv.get("tk:a:" + a, "json")) || []).concat(id).slice(-50);
  await kv.put("tk:a:" + a, JSON.stringify(mine));
  const msg = "📮 新工单 #" + id + "\n钱包：" + a + "\n截图：" + imgs.length + " 张\n内容：" + (txt || "（只有截图）").slice(0, 300) + "\n\n处理 👉 https://ailgns.dev/#/feedback/admin/" + id;
  ctx.waitUntil(sendDebox(ctx.env, SUPPORT_USER, msg, "private").catch(() => {}));
  return json({ ok: true, id });
}
