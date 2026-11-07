// 📮 客户问题反馈（工单）：客户在 #/feedback 提交「钱包地址 + 文字 + 截图」，站长在 #/feedback/admin 挨个处理
// POST { a, txt, imgs: [dataURL…] }                 → 新工单（截图前端已压缩成 JPEG；最多 4 张）；DeBox 私信通知客服
// GET  ?mine=0x…                                    → 这个地址的工单进度（客户看：编号、时间、状态、回复，不含截图）
// GET  ?key=FEEDBACK_KEY&list=1[&st=new|doing|done]   → 工单列表（站长）
// GET  ?key=FEEDBACK_KEY&img=<id>:<n>                 → 一张截图
// POST { key, action: "set", id, st?, note? }       → 改状态 / 写回复（回复客户能在页面上看到）
// KV：tk:seq 编号；tk:list [id…]；tk:<id> 工单；tk:img:<id>:<n> 截图
import { sendDebox } from "../../lib/debox.js";
import { pushInbox } from "../../lib/inbox.js";
import { triage, LV_NAME } from "../../lib/triage.js";
import { SUPPORT_USER } from "../../lib/support.js";
import { reviewerOf } from "../../lib/reviewers.js";
const OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 站长站内信（谷歌社交账号钱包）

// 后台口令：FEEDBACK_KEY（站长自己设的，专给工单后台）或 BACKUP_KEY（keeper 用的随机长串）都认
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));

const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const ST = { new: "待处理", doing: "处理中", done: "已解决", skip: "无效" };
const pub = (t) => ({ id: t.id, t: t.t, up: t.up || 0, st: t.st === "skip" ? "done" : t.st, txt: t.txt.slice(0, 200), note: t.note || "", bot: t.bot || "", n: t.n, rn: t.rn || 0 });
// 分诊一张工单：写 tri / bot / st；同主题 7 天内多人反复问 → 升到 1 级；0/1 级立刻 DeBox 通知站长
async function runTriage(ctx, kv, t) {
  if (t.vip) { // ⭐ 产品优化员的反馈：不分诊、不判无效、不自动答复，直接推给站长亲审
    t.tri = { ok: true, lv: 1, cat: "review", topic: "⭐ " + t.vip + "反馈", why: "站长亲自审查", dup: 0 };
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    await pushInbox(kv, OWNER, "ticket", "⭐ " + t.vip + "新反馈 #" + t.id + "（请亲自审查）\n" + (t.txt || "（只有截图）").slice(0, 200), "#/feedback/admin/" + t.id).catch(() => {});
    return;
  }
  const tri = await triage(ctx.env, t.txt, t.n);
  if (tri.topic) {
    const ids = ((await kv.get("tk:list", "json")) || []).slice(-100).filter((x) => x !== t.id);
    const others = (await Promise.all(ids.map((id) => kv.get("tk:" + id, "json")))).filter((x) => x && x.tri && x.tri.topic === tri.topic && x.a !== t.a && Date.now() - x.t < 7 * 86400e3);
    if (others.length >= 1 && tri.ok && tri.lv > 1) { tri.lv = 1; tri.dup = others.length + 1; tri.why = "同一问题已有 " + (others.length + 1) + " 位客户反馈：" + tri.why; }
    else if (others.length) tri.dup = others.length + 1;
  }
  t.tri = { ok: tri.ok, lv: tri.lv, cat: tri.cat, topic: tri.topic, why: tri.why, dup: tri.dup || 0, ai: tri.ai };
  if (!tri.ok) t.st = "skip";
  if (tri.ok && tri.lv === 3 && tri.reply) t.bot = tri.reply;
  await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
  if (tri.ok && tri.lv <= 1) {
    const msg = LV_NAME[tri.lv] + " 工单 #" + t.id + (tri.dup ? "（" + tri.dup + " 人反馈同一问题）" : "") + "\n主题：" + tri.topic + "\n钱包：" + t.a + "\n内容：" + (t.txt || "（只有截图）").slice(0, 300) + "\n\n处理 👉 https://ailgns.dev/#/feedback/admin/" + t.id;
    await sendDebox(ctx.env, SUPPORT_USER, msg, "private").catch(() => {});
  }
  return t;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const mine = (u.searchParams.get("mine") || "").toLowerCase();
  // 客服回复里的图：客户凭自己的地址看（只能看自己工单的）
  const rimg = u.searchParams.get("rimg"), ra = (u.searchParams.get("a") || "").toLowerCase();
  if (rimg && isAddr(ra)) {
    const m0 = rimg.match(/^(\d+):(\d)$/); if (!m0) return new Response("bad", { status: 400 });
    const t0 = await kv.get("tk:" + m0[1], "json");
    if (!t0 || t0.a !== ra) return new Response("not found", { status: 404 });
    const d = await kv.get("tk:img:" + m0[1] + ":r" + m0[2]);
    const m = d && d.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return new Response("not found", { status: 404 });
    return new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { headers: { "content-type": m[1], "cache-control": "private, max-age=86400" } });
  }
  if (isAddr(mine)) {
    const ids = (await kv.get("tk:a:" + mine, "json")) || [];
    const ts = (await Promise.all(ids.slice(-20).map((id) => kv.get("tk:" + id, "json")))).filter(Boolean).reverse();
    return json({ list: ts.map(pub) });
  }
  // 站长电脑上的提醒小程序用：只给「还没处理的工单数」，不给内容，不用口令
  if (u.searchParams.get("pending")) {
    const ids = ((await kv.get("tk:list", "json")) || []).slice(-100);
    const ts = (await Promise.all(ids.map((id) => kv.get("tk:" + id, "json")))).filter(Boolean);
    // 老工单还没分诊的，顺手补（每次最多 3 张）
    const todo = ts.filter((t) => !t.tri && t.st !== "done").slice(0, 3);
    for (const t of todo) await runTriage(ctx, kv, t).catch(() => {});
    const open = ts.filter((t) => t.st === "new" || t.st === "doing"), lv = [0, 0, 0, 0];
    open.forEach((t) => { lv[t.tri ? t.tri.lv : 2]++; });
    const top = open.slice().sort((x, y) => ((x.tri ? x.tri.lv : 2) - (y.tri ? y.tri.lv : 2)) || (y.t - x.t))[0];
    return json({ n: open.filter((t) => t.st === "new").length, doing: open.filter((t) => t.st === "doing").length, lv, top: top ? { id: top.id, lv: top.tri ? top.tri.lv : 2, topic: top.tri ? top.tri.topic : "", dup: top.tri ? top.tri.dup : 0 } : null, latest: open.length ? Math.max(...open.map((t) => t.t || 0)) : 0 }, 200);
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
  const cnt = { new: 0, doing: 0, done: 0, skip: 0 };
  ts.forEach((t) => { cnt[t.st] = (cnt[t.st] || 0) + 1; });
  if (st) ts = ts.filter((t) => t.st === st);
  ts.sort((x, y) => ((y.vip ? 1 : 0) - (x.vip ? 1 : 0)) || ((x.tri ? x.tri.lv : 2) - (y.tri ? y.tri.lv : 2)) || (y.t - x.t)); // ⭐ 产品优化员置顶；再按轻重缓急：级别高的在前，同级新的在前
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
    if (b.st === "new" && t.tri && !t.tri.ok) t.tri.ok = true; // 从「无效」恢复
    if (typeof b.note === "string") t.note = b.note.slice(0, 1000);
    // 客服回复附图（最多 4 张，和客户截图一样存 KV）：覆盖式，重新保存就换新的一组
    if (Array.isArray(b.rimgs)) {
      const ri = b.rimgs.filter((x) => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 700000).slice(0, 4);
      for (let i = 0; i < ri.length; i++) await kv.put("tk:img:" + t.id + ":r" + i, ri[i], { expirationTtl: 180 * 86400 });
      if (ri.length) t.rn = ri.length;
    }
    t.up = Date.now();
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    // 处理完：客户绑定过 DeBox 机器人的，私信告诉他回复内容
    if (b.st === "done" && t.note) {
      const users = (await kv.get("dbx:a:" + t.a, "json")) || [];
      const msg = "📮 你的反馈工单 #" + t.id + " 已处理\n\n💬 客服回复：" + t.note + (t.rn ? "\n🖼️ 客服还附了 " + t.rn + " 张图，到网站反馈页看" : "") + "\n\n查看 👉 https://ailgns.dev/#/feedback";
      await pushInbox(kv, t.a, "ticket", msg, "#/feedback").catch(() => {}); // 🔔 站内信
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
  const vip = reviewerOf(a); if (vip) t.vip = vip; // ⭐ 产品优化员
  for (let i = 0; i < imgs.length; i++) await kv.put("tk:img:" + id + ":" + i, imgs[i], { expirationTtl: 180 * 86400 });
  await kv.put("tk:" + id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
  const list = ((await kv.get("tk:list", "json")) || []).concat(id).slice(-1000);
  await kv.put("tk:list", JSON.stringify(list));
  const mine = ((await kv.get("tk:a:" + a, "json")) || []).concat(id).slice(-50);
  await kv.put("tk:a:" + a, JSON.stringify(mine));
  ctx.waitUntil(runTriage(ctx, kv, t).catch(() => {})); // AI 分诊：无效忽略、分级、0/1 级才立刻私信站长
  return json({ ok: true, id });
}
