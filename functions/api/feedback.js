// 📮 客户问题反馈（工单）：客户在 #/feedback 提交「钱包地址 + 文字 + 截图」，站长在 #/feedback/admin 挨个处理
// POST 二进制 ?video=1&id=…&a=…  正文就是视频文件          → 给刚提交的工单附 1 个视频（站长 2026-11-17：客户录屏最能说明问题；最多 20MB，留 60 天）
// POST 二进制 ?video=1&id=…&a=…&i=<第几段>&n=<共几段>&size=<总字节>      → 分段上传视频（站长 2026-11-19「怎么方便客户怎么来」：苹果手机拍 10 秒就 20MB；
//      数据库单个值最多 25MB，所以每 8MB 存一段，总共最多 100MB，留 14 天）。老页面不带 i / n 的照旧走上面那条（一次传完，最多 20MB）
// GET  ?vid=<工单号>&key=…                                  → 站长后台看这个视频
// POST { a, txt, imgs: [dataURL…] }                 → 新工单（截图前端已压缩成 JPEG；最多 4 张）；DeBox 私信通知客服
// GET  ?mine=0x…                                    → 这个地址的工单进度（客户看：编号、时间、状态、回复，不含截图）
// GET  ?key=FEEDBACK_KEY&list=1[&st=new|doing|done]   → 工单列表（站长）
// GET  ?key=FEEDBACK_KEY&img=<id>:<n>                 → 一张截图
// POST { key, action: "set", id, st?, note? }       → 改状态 / 写回复（回复客户能在页面上看到）；st: "del" = 删除，只能删自己提交的（要签名，见 canDel）
// POST { key, action: "set", id, urg: 0 }           → 取消加急
// GET  ?urgok=1&a=0x…[&pa&pts&psig]                → 提交页问：这台设备能不能给工单「加急」（只给站长 / 产品优化员）
// GET  ?mine=0x…&tk=<编号>[&pa&pts&psig]           → 在这个地址自己的工单里按编号找（站长 2026-11-28）
// GET  ?key=…&tk=<编号>[&pa&pts&psig]              → 后台按编号找一张工单，很久以前、列表里翻不到的也能找到
// POST { action: "del", id, pa, pts, psig[, key][, undo: 1] } → 删除（放进回收站）/ 恢复自己提交的工单：只认提交这张工单的钱包签名，见 canDel
// KV：tk:seq 编号；tk:list [id…]；tk:<id> 工单；tk:img:<id>:<n> 截图
import { sendDebox } from "../../lib/debox.js";
import { pushInbox, inboxText, AUTH_TTL, OWNER_ALSO } from "../../lib/inbox.js";
import { recoverAddress } from "../../lib/evmsig.js";
import { triage, LV_NAME } from "../../lib/triage.js";
import { SUPPORT_USER } from "../../lib/support.js";
import { reviewerOf } from "../../lib/reviewers.js";
const OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 站长站内信（谷歌社交账号钱包）

// 后台口令：FEEDBACK_KEY（站长自己设的，专给工单后台）或 BACKUP_KEY（keeper 用的随机长串）都认
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));

const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
/* 🔒 私密工单（站长 2026-11-21）：产品优化员名单（lib/reviewers.js）里的地址发的工单，光有后台口令看不到、也改不了。
   只有两种人能看：站长的钱包（BOSS），和发单人自己。怎么认人：用「收件箱登录」的那个钱包签名（pa / pts / psig，签一次管 30 天），不另设口令。
   巡检机器人只有口令，所以自动跳过这些工单。 */
const BOSS = [OWNER].concat(OWNER_ALSO);
const isPriv = (t) => !!(t && (t.vip || reviewerOf(t.a)));
function signer(a, ts, sig) {
  a = String(a || "").toLowerCase(); ts = Number(ts);
  if (!isAddr(a) || !ts || !sig) return "";
  const now = Date.now();
  if (ts > now + 5 * 60e3 || now - ts > AUTH_TTL) return "";
  try { return recoverAddress(inboxText(a, ts), String(sig)) === a ? a : ""; } catch (e) { return ""; }
}
const signerOf = (p) => signer(p.get("pa"), p.get("pts"), p.get("psig"));
/* 🚨 加急（站长 2026-11-27，工单 #504）：提交工单时可以勾「加急」，后台排到最上面、马上私信通知。
   只给站长和产品优化员用（站长定的：普通客户看不到这个开关，免得人人都勾、加急就不灵了）。
   怎么认人：和私密工单一样，用「收件箱登录」的钱包签名（pa / pts / psig）；签名的钱包是站长或产品优化员才算，工单上填的地址可以是别人的（站长替客户提单）。 */
const canUrg = (a) => !!a && (BOSS.includes(a) || !!reviewerOf(a));
/* 🗑 删除只能删自己提交的（站长 2026-11-28：「去掉删除别的工单的功能……只让产品体验官快速识别自己的工单并删除自己的工单，无法删除别人的工单」，
   站长自己也一样：别人的工单只能标「无效」）。认人靠签名：签名的钱包 = 工单上填的地址，才算「自己的」。
   在哪删：工单后台（拿口令的人，删自己提交的）；「我的反馈进度」（没有口令，只给站长 / 产品优化员；普通客户那里不显示删除） */
const canDel = (me, t, viaKey) => !!me && !!t && me === t.a && !t.nosig && (viaKey || canUrg(me)); // nosig：填的是站长 / 产品优化员的地址、提交时却没有这个钱包的签名（可能是别人冒填的）——不算本人提交的，不能删
// 站长 2026-11-27：「后台工单加一个删除功能」（2026-11-28 起只能删自己提交的，见 canDel）→ 删除 = 放进回收站（状态 del）：后台各栏、客户自己的「我的反馈进度」都不再显示，
// 但东西还在，回收站里能恢复（恢复时回到删除前的状态 st0，不会再给客户发一遍通知）。和其它工单一样 180 天后自动清掉。不做「永久删除」：删错了找不回来。
const ST = { new: "待处理", doing: "处理中", done: "已解决", skip: "无效", del: "回收站" };
const pub = (t) => ({ id: t.id, t: t.t, up: t.up || 0, st: t.st === "skip" ? "done" : t.st, txt: t.txt.slice(0, 200), note: t.note || "", bot: t.bot || "", n: t.n, rn: t.rn || 0, urg: t.urg ? 1 : 0, nosig: t.nosig ? 1 : 0 });
// 分诊一张工单：写 tri / bot / st；同主题 7 天内多人反复问 → 升到 1 级；0/1 级立刻 DeBox 通知站长
async function runTriage(ctx, kv, t) {
  if (t.src === "inbox") { // 💬 客户在站内信里「回复站长」（2026-11-08）：不分诊、不判无效，直接推给站长
    t.tri = { ok: true, lv: 2, cat: "reply", topic: "💬 回复站内信", why: "客户回复站长通知", dup: 0 };
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    await pushInbox(kv, OWNER, "ticket", "💬 客户回复站内信 #" + t.id + "\n" + (t.txt || "").slice(0, 300), "#/feedback/admin/" + t.id).catch(() => {});
    return;
  }
  if (t.vip) { // ⭐ 产品优化员的反馈：不分诊、不判无效、不自动答复，直接推给站长亲审
    t.tri = { ok: true, lv: 2, cat: "review", topic: "⭐ " + t.vip + "反馈", why: t.nosig ? "没有本人签名，可能是冒填，请核对" : "站长亲自审查", dup: 0 };
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    const head = t.nosig ? "⚠️ 没有本人签名（可能是冒填）· " + t.vip + "地址的新反馈 #" + t.id + "，请到后台核对" // 冒填的不带正文：免得冒填的话术、链接直接出现在站长手机上
      : (t.urg ? "🚨 加急 · " : "") + "⭐ " + t.vip + "新反馈 #" + t.id + "（请亲自审查）\n" + (t.txt || "（只有截图）").slice(0, 200);
    await pushInbox(kv, OWNER, "ticket", head, "#/feedback/admin/" + t.id).catch(() => {});
    return;
  }
  const tri = await triage(ctx.env, t.txt, t.n, ctx.request.headers.get("cf-ipcountry") || "");
  if (tri.topic && tri.ai !== false) { // 分诊没成的（主题都是「未分类」）不算「同一问题」——以前会把每张都标成「已有 40 位客户反馈」、顶到最高级（2026-11-22 修）

    const ids = ((await kv.get("tk:list", "json")) || []).slice(-100).filter((x) => x !== t.id);
    const others = (await Promise.all(ids.map((id) => kv.get("tk:" + id, "json")))).filter((x) => x && x.tri && x.tri.topic === tri.topic && x.a !== t.a && Date.now() - x.t < 7 * 86400e3);
    if (others.length >= 1 && tri.ok && tri.lv > 1) { tri.lv = 1; tri.dup = others.length + 1; tri.why = "同一问题已有 " + (others.length + 1) + " 位客户反馈：" + tri.why; }
    else if (others.length) tri.dup = others.length + 1;
  }
  if (t.urg) { tri.ok = true; delete tri.reply; } // 🚨 加急的：AI 不许判无效、不自动答复，等人处理
  t.tri = { ok: tri.ok, lv: tri.lv, cat: tri.cat, topic: tri.topic, why: tri.why, dup: tri.dup || 0, ai: tri.ai, ...(tri.err ? { err: tri.err } : {}) };
  if (!tri.ok) t.st = "skip";
  if (tri.ok && tri.lv === 3 && tri.reply) t.bot = tri.reply;
  await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
  if ((tri.ok && tri.lv <= 1) || t.urg) {
    const msg = (t.urg ? "🚨 加急 · " : "") + LV_NAME[tri.lv] + " 工单 #" + t.id + (tri.dup ? "（" + tri.dup + " 人反馈同一问题）" : "") + "\n主题：" + tri.topic + "\n钱包：" + t.a + "\n内容：" + (t.txt || "（只有截图）").slice(0, 300) + "\n\n处理 👉 https://ailgns.dev/#/feedback/admin/" + t.id;
    await sendDebox(ctx.env, SUPPORT_USER, msg, "private").catch(() => {});
  }
  return t;
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const mine = (u.searchParams.get("mine") || "").toLowerCase();
  // 客服回复里的图：客户凭自己的地址看（只能看自己工单的）
  // 站长 2026-11-08：客户也能看自己当初提交的截图（mimg，同样只能看自己地址的工单），以前只能看文字、记不清问的什么
  const mimg = u.searchParams.get("mimg"), rimg = u.searchParams.get("rimg") || mimg, ra = (u.searchParams.get("a") || "").toLowerCase();
  if (rimg && isAddr(ra)) {
    const m0 = rimg.match(/^(\d+):(\d)$/); if (!m0) return new Response("bad", { status: 400 });
    const t0 = await kv.get("tk:" + m0[1], "json");
    if (!t0 || t0.a !== ra) return new Response("not found", { status: 404 });
    if (signerOf(u.searchParams) !== ra) { // 没签名（光知道地址）：只给这个地址最近 20 张工单的图，和「我的反馈进度」列表看得到的一样；更早的要本人签名（站长 2026-11-28 评审：按编号查找不能把别人的老工单翻出来）
      if (isPriv(t0) || t0.st === "del") return new Response("not found", { status: 404 }); // 🔒 私密工单、回收站里的：图只有本人签过名才给（和列表、按编号查找一样）
      const ids0 = (await kv.get("tk:a:" + ra, "json")) || [];
      if (!ids0.slice(-20).map(Number).includes(Number(m0[1]))) return new Response("not found", { status: 404 });
    }
    const d = await kv.get("tk:img:" + m0[1] + ":" + (mimg ? "" : "r") + m0[2]);
    const m = d && d.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return new Response("not found", { status: 404 });
    return new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { headers: { "content-type": m[1], "cache-control": "private, max-age=86400" } });
  }
  if (isAddr(mine)) {
    /* 🔔 回复气泡（每个连着钱包的访客每分钟问一次）先只问「最近一次客服回复是什么时候」：读一条 tk:up:<地址>，有新回复页面再来拿全文。
       以前每次都把这个地址最近 20 张工单逐张读一遍（站长 2026-11-27 省 KV 读取）。老地址第一次问时现算一遍记下来，没工单的记 0 */
    if (u.searchParams.get("peek")) {
      if (reviewerOf(mine) && signerOf(u.searchParams) !== mine) return json({ up: 0, lock: 1 });
      const v = await kv.get("tk:up:" + mine);
      if (v !== null) return json({ up: Number(v) || 0 });
      const ids = (await kv.get("tk:a:" + mine, "json")) || [];
      const ts = ids.length ? (await Promise.all(ids.slice(-20).map((id) => kv.get("tk:" + id, "json")))).filter((t) => t && t.st !== "del" && t.note) : [];
      const up = ts.reduce((m, t) => Math.max(m, t.up || 0), 0);
      ctx.waitUntil(kv.put("tk:up:" + mine, String(up), { expirationTtl: 180 * 86400 }).catch(() => {}));
      return json({ up });
    }
    if (reviewerOf(mine) && signerOf(u.searchParams) !== mine) return json({ list: [], lock: 1 }); // 🔒 光知道地址不行，要本人签过名
    const del = canDel(signerOf(u.searchParams), { a: mine }, false) ? 1 : 0; // 这台设备签名的正是这个地址，而且是站长 / 产品优化员 → 页面上显示「删除」
    const q = Number(u.searchParams.get("tk")) || 0;
    if (q) { // 🔎 按编号找自己的工单（老的、列表里没有的也能找到）。不是这个地址的、已删除的（能删的人除外：要能恢复）一律当没有
      const signed = signerOf(u.searchParams) === mine;
      if (!signed) { // 没签名（光知道地址）：只在这个地址最近 20 张里找，和上面列表看得到的一样，不把更早的翻出来；sign:1 → 页面提示先签名
        const ids0 = (await kv.get("tk:a:" + mine, "json")) || [];
        if (!ids0.slice(-20).map(Number).includes(q)) return json({ list: [], none: 1, del, sign: 1 });
      }
      const t = await kv.get("tk:" + q, "json");
      if (!t || t.a !== mine || (t.st === "del" && !del)) return json({ list: [], none: 1, del, sign: signed ? 0 : 1 });
      return json({ list: [pub(t)], del });
    }
    const ids = (await kv.get("tk:a:" + mine, "json")) || [];
    const ts = (await Promise.all(ids.slice(-20).map((id) => kv.get("tk:" + id, "json")))).filter((t) => t && t.st !== "del").reverse(); // 删掉的不给客户看
    return json({ list: ts.map(pub), del });
  }
  // 站长电脑上的提醒小程序用：只给「还没处理的工单数」，不给内容，不用口令
  if (u.searchParams.get("pending")) {
    const ids = ((await kv.get("tk:list", "json")) || []).slice(-100);
    const seeAll = BOSS.includes(signerOf(u.searchParams));
    const ts = (await Promise.all(ids.map((id) => kv.get("tk:" + id, "json")))).filter((t) => t && (seeAll || !isPriv(t))); // 🔒 私密工单不计数，除非是站长钱包
    // 老工单还没分诊的，顺手补（每次最多 3 张）
    const todo = ts.filter((t) => !t.tri && t.st !== "done").slice(0, 3);
    for (const t of todo) await runTriage(ctx, kv, t).catch(() => {});
    const open = ts.filter((t) => t.st === "new" || t.st === "doing"), lv = [0, 0, 0, 0];
    open.forEach((t) => { lv[t.tri ? t.tri.lv : 2]++; });
    const top = open.slice().sort((x, y) => ((y.urg ? 1 : 0) - (x.urg ? 1 : 0)) || ((x.tri ? x.tri.lv : 2) - (y.tri ? y.tri.lv : 2)) || (y.t - x.t))[0]; // 🚨 加急的算最紧急
    return json({ n: open.filter((t) => t.st === "new").length, doing: open.filter((t) => t.st === "doing").length, lv, urg: open.filter((t) => t.urg).length, top: top ? { id: top.id, st: top.st, lv: top.tri ? top.tri.lv : 2, topic: top.tri ? top.tri.topic : "", dup: top.tri ? top.tri.dup : 0, urg: top.urg ? 1 : 0 } : null, latest: open.length ? Math.max(...open.map((t) => t.t || 0)) : 0 }, 200);
  }
  // 🚨 提交页问「能不能加急」：can = 这台设备签过名的钱包是站长 / 产品优化员；sign = 还没签（或签的不是），但填的地址是站长 / 产品优化员的 → 提示先签名。普通客户两样都是 0，页面上什么都不显示
  if (u.searchParams.get("urgok")) {
    const can = canUrg(signerOf(u.searchParams));
    const pa0 = canUrg(String(u.searchParams.get("a") || "").toLowerCase());
    return json({ can: can ? 1 : 0, sign: !can && pa0 ? 1 : 0, priv: pa0 ? 1 : 0 }); // priv：填的是站长 / 产品优化员的地址（提交页据此提醒「不签名提交的不算你本人的」）
  }
  if (!keyOk(ctx.env, u.searchParams.get("key"))) return json({ error: "口令不对" }, 403);
  const me = signerOf(u.searchParams), boss = BOSS.includes(me); // 🔒 是不是站长钱包；me = 这台设备签名的钱包（认「自己提交的工单」：自己的私密工单自己能看、能删）
  const vid = u.searchParams.get("vid");
  if (vid) {
    const vt = await kv.get("tk:" + (Number(vid) || 0), "json");
    if (isPriv(vt) && !boss && vt.a !== me) return new Response("not found", { status: 404 });
    if (vt && vt.vn) return videoParts(ctx, kv, vt.id, vt);
    const r = await kv.getWithMetadata("tk:vid:" + (Number(vid) || 0), "arrayBuffer");
    if (!r || !r.value) return new Response("视频没找到（可能已过期：视频只留 14 天，11-19 之前传的留 60 天）", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response(r.value, { headers: { "content-type": (r.metadata && r.metadata.type) || "video/mp4", "cache-control": "private, max-age=3600" } });
  }
  const img = u.searchParams.get("img");
  if (img) {
    if (!boss) { const it = await kv.get("tk:" + (Number(img.split(":")[0]) || 0), "json"); if (isPriv(it) && it.a !== me) return new Response("not found", { status: 404 }); }
    const d = await kv.get("tk:img:" + img.replace(":", ":"));
    if (!d) return new Response("not found", { status: 404 });
    const m = d.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return new Response("bad", { status: 400 });
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { "content-type": m[1], "cache-control": "private, max-age=86400" } });
  }
  // 🔎 按编号找（站长 2026-11-28）：直接读这一张，很久以前、列表里翻不到的也能找到（工单留 180 天）。看不了的私密工单和没有一样
  const q = Number(u.searchParams.get("tk")) || 0;
  if (q) {
    const t = await kv.get("tk:" + q, "json");
    if (!t || (isPriv(t) && !boss && t.a !== me)) return json({ none: 1, seq: Number(await kv.get("tk:seq")) || 0, boss, me });
    return json({ t, boss, me });
  }
  const st = u.searchParams.get("st") || "";
  const ids = ((await kv.get("tk:list", "json")) || []).slice(-300).reverse();
  let ts = (await Promise.all(ids.map((id) => kv.get("tk:" + id, "json")))).filter((t) => t && (boss || !isPriv(t) || t.a === me)); // 🔒 私密工单只给站长钱包，和发单人自己
  const cnt = { new: 0, doing: 0, done: 0, skip: 0, del: 0 };
  ts.forEach((t) => { cnt[t.st] = (cnt[t.st] || 0) + 1; });
  const own = me ? ts.filter((t) => t.a === me && !t.nosig && t.st !== "del").sort((x, y) => y.t - x.t) : []; // 🙋 签名的这个钱包自己提交的（各栏都算，回收站除外），页面上单独标出来（站长 2026-11-28）
  if (st) ts = ts.filter((t) => t.st === st);
  else ts = ts.filter((t) => t.st !== "del"); // 不分栏看全部时，不带回收站里的
  if (st === "done" || st === "skip") ts.sort((x, y) => ((y.up || y.t) - (x.up || x.t))); // 已解决 / 无效：最近处理的在前（站长 2026-11-08：之前按级别排，老单子一直占着第一条）
  else ts.sort((x, y) => ((y.urg ? 1 : 0) - (x.urg ? 1 : 0)) || ((y.vip ? 1 : 0) - (x.vip ? 1 : 0)) || ((x.tri ? x.tri.lv : 2) - (y.tri ? y.tri.lv : 2)) || (y.t - x.t)); // 🚨 加急的最上面；⭐ 产品优化员其次；再按轻重缓急：级别高的在前，同级新的在前
  return json({ list: ts, cnt, boss, me, own });
}

const VID_OK = /^video\/(mp4|quicktime|webm|x-m4v|3gpp)$/i, VID_MAX = 20 * 1024 * 1024;
const VID_PART = 8 * 1024 * 1024, VID_TOTAL = 100 * 1024 * 1024, VID_TTL = 14 * 86400; /* 分段：每段 8MB、总共最多 100MB、留 14 天 */
// 分段存的视频拿出来看：支持「只要其中一段」（Range），苹果的播放器必须有这个才肯播
function videoParts(ctx, kv, id, t) {
  const total = Number(t.vs) || 0, type = t.vt || "video/mp4";
  let start = 0, end = total - 1, partial = false;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(ctx.request.headers.get("range") || "").trim());
  if (m && (m[1] || m[2])) {
    partial = true;
    if (m[1] === "") start = Math.max(0, total - Number(m[2]));
    else { start = Number(m[1]); if (m[2] !== "") end = Math.min(end, Number(m[2])); }
    if (!(start <= end) || start >= total) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + total } });
  }
  const first = Math.floor(start / VID_PART), last = Math.floor(end / VID_PART);
  const { readable, writable } = new FixedLengthStream(end - start + 1);
  ctx.waitUntil((async () => {
    const w = writable.getWriter();
    try {
      for (let i = first; i <= last; i++) {
        const buf = await kv.get("tk:vid:" + id + ":" + i, "arrayBuffer");
        if (!buf) throw new Error("missing part " + i);
        const off = i * VID_PART, a = Math.max(start, off) - off, b = Math.min(end, off + buf.byteLength - 1) - off + 1;
        await w.write(new Uint8Array(buf, a, b - a));
      }
      await w.close();
    } catch (e) { try { await w.abort(e); } catch (x) { /* 客户端已经断开 */ } }
  })());
  const h = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  if (partial) h["content-range"] = "bytes " + start + "-" + end + "/" + total;
  return new Response(readable, { status: partial ? 206 : 200, headers: h });
}
async function putVideo(ctx, kv, u) {
  const a = String(u.searchParams.get("a") || "").trim().toLowerCase(), id = Number(u.searchParams.get("id")) || 0;
  const type = String(ctx.request.headers.get("content-type") || "").split(";")[0].trim();
  const big = "视频太大了（最多 20MB）。请录短一点（30 秒以内），或者改传截图";
  if (!isAddr(a) || !id) return json({ error: "缺少工单号或钱包地址" }, 400);
  if (!VID_OK.test(type)) return json({ error: "这个文件不是常见的视频格式，请用手机直接录的视频 / 录屏，或者改传截图" }, 400);
  const parts = u.searchParams.has("n");
  if (parts) {
    const i = Number(u.searchParams.get("i")), n = Number(u.searchParams.get("n")), size = Number(u.searchParams.get("size"));
    const tooBig = "视频太大了（最多 100MB）。请录短一点，或者用手机自带的「录屏」（比用另一台手机拍小很多）";
    if (!(size > 0) || !Number.isInteger(size)) return json({ error: "视频是空的，请重新选一次" }, 400);
    if (size > VID_TOTAL) return json({ error: tooBig }, 400);
    if (!Number.isInteger(n) || !Number.isInteger(i) || n !== Math.ceil(size / VID_PART) || i < 0 || i >= n) return json({ error: "视频分段不对，请刷新页面重新选一次视频" }, 400);
    const want = i < n - 1 ? VID_PART : size - (n - 1) * VID_PART;
    if (Number(ctx.request.headers.get("content-length") || 0) > VID_PART) return json({ error: "视频分段不对，请刷新页面重新选一次视频" }, 400);
    const pt = await kv.get("tk:" + id, "json");
    if (!pt || pt.a !== a) return json({ error: "没有这个工单" }, 404);
    if (Date.now() - pt.t > 90 * 60e3) return json({ error: "这张工单提交太久了，视频请重新提一张工单一起传" }, 400); /* 大视频传得慢，给 90 分钟 */
    if (pt.v) return json({ error: "这张工单已经有视频了" }, 400);
    const pb = await ctx.request.arrayBuffer();
    if (pb.byteLength !== want) return json({ error: "这一段没传完整（网络断了），请再传一次", retry: 1 }, 400);
    await kv.put("tk:vid:" + id + ":" + i, pb, { expirationTtl: VID_TTL, metadata: { size: pb.byteLength } });
    if (i < n - 1) return json({ ok: true, i, done: false });
    /* 最后一段到了：工单上记下「有视频、共几段、多大、什么格式」。前面每一段都是存好了才回的「成功」，页面按顺序一段一段传 */
    pt.v = 1; pt.vs = size; pt.vn = n; pt.vt = type;
    await kv.put("tk:" + id, JSON.stringify(pt), { expirationTtl: 180 * 86400 });
    return json({ ok: true, i, done: true });
  }
  if (Number(ctx.request.headers.get("content-length") || 0) > VID_MAX) return json({ error: big }, 400);
  const t = await kv.get("tk:" + id, "json");
  // 只能给「自己刚提交的那张工单」补视频：地址要对得上，而且在提交后 30 分钟内，一张工单只收 1 个
  if (!t || t.a !== a) return json({ error: "没有这个工单" }, 404);
  if (Date.now() - t.t > 30 * 60e3) return json({ error: "这张工单提交太久了，视频请重新提一张工单一起传" }, 400);
  if (t.v) return json({ error: "这张工单已经有视频了" }, 400);
  const buf = await ctx.request.arrayBuffer();
  if (!buf.byteLength) return json({ error: "视频是空的，请重新选一次" }, 400);
  if (buf.byteLength > VID_MAX) return json({ error: big }, 400);
  await kv.put("tk:vid:" + id, buf, { expirationTtl: VID_TTL, metadata: { type, size: buf.byteLength } });
  t.v = 1; t.vs = buf.byteLength;
  await kv.put("tk:" + id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
  return json({ ok: true });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const pu = new URL(ctx.request.url);
  if (pu.searchParams.get("video")) return putVideo(ctx, kv, pu);
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对（截图太大的话请少传几张）" }, 400); }
  if (b.action === "del") { // 🗑 删除 / 恢复自己提交的工单（见 canDel）：放进回收站，不是真删；undo: 1 = 从回收站拿回来，回到删除前那一栏
    const t = await kv.get("tk:" + (Number(b.id) || 0), "json");
    if (!t) return json({ error: "没有这个工单" }, 404);
    const me = signer(b.pa, b.pts, b.psig);
    if (!me) return json({ error: "先用提交这张工单的钱包签个名（免费，不是交易，不花 Gas），认一下是你本人", sign: 1 }, 403);
    if (!canDel(me, t, keyOk(ctx.env, b.key))) return json({ error: t.nosig && me === t.a ? "这张提交时没有这个钱包的签名，不算你本人提交的，删不了；要处理请找站长（站长可以标「无效」）" : "只能删除你自己提交的工单。别人的工单可以标「无效」" }, 403);
    if (b.undo) { if (t.st === "del") { t.st = t.st0 && t.st0 !== "del" && Object.prototype.hasOwnProperty.call(ST, t.st0) ? t.st0 : "new"; delete t.st0; delete t.dl; } }
    else if (t.st !== "del") { t.st0 = t.st; t.st = "del"; t.dl = Date.now(); } // dl = 什么时候删的（回收站里看）
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    return json({ ok: true, id: t.id, st: t.st });
  }
  if (b.action === "set") {
    if (!keyOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
    if (b.st !== undefined && !(typeof b.st === "string" && Object.prototype.hasOwnProperty.call(ST, b.st))) return json({ error: "状态不对" }, 400); // 只认这几种状态：以前传 ["del"]、"toString" 这种也会照写进去，工单就从各栏（连回收站）消失了，还绕过了「只能删自己的」
    const t = await kv.get("tk:" + b.id, "json");
    if (!t) return json({ error: "没有这个工单" }, 404);
    const me = signer(b.pa, b.pts, b.psig);
    if (b.st === "del") { // 后台的「删除」按钮（老页面也是走这里）：一样只能删自己提交的（站长 2026-11-28，见 canDel）
      if (!me) return json({ error: "先用提交这张工单的钱包签个名（到 📬 收件箱用它登录一次，免费），再回来删", sign: 1 }, 403);
      if (!canDel(me, t, true)) return json({ error: t.nosig && me === t.a ? "这张提交时没有这个钱包的签名，不算你本人提交的，删不了；要处理请找站长（站长可以标「无效」）" : "只能删除你自己提交的工单。别人的工单可以标「无效」" }, 403);
      if (t.st !== "del") { t.st0 = t.st; t.st = "del"; t.dl = Date.now(); await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 }); }
      return json({ ok: true, t });
    }
    if (isPriv(t) && !BOSS.includes(me)) return t.a === me ? json({ error: t.nosig ? "这张提交时没有这个钱包的签名，不算你本人提交的，删不了；要处理请找站长（站长可以标「无效」）" : "这是你自己提交的工单，站长亲自处理：你这里只能删除，不能回复、改状态" }, 403) : json({ error: "没有这个工单" }, 404); // 🔒 私密工单只有站长钱包能回复 / 改状态
    const wasDel = t.st === "del", wasDone = t.st === "done", note0 = t.note || ""; // wasDel：从回收站恢复的，不再给客户发通知；wasDone + note0：同一条回复不发第二遍
    if (b.st && ST[b.st]) t.st = b.st;
    if (wasDel && b.st) { delete t.st0; delete t.dl; } // 从回收站恢复
    if (b.st === "new" && t.tri && !t.tri.ok) t.tri.ok = true; // 从「无效」恢复
    if (typeof b.note === "string") t.note = b.note.slice(0, 1000);
    if (b.urg === 0) delete t.urg; // 🚨 取消加急（加急只能在提交时勾，后台只能取消）
    // 🧹 清理正文（站长 2026-11-24：#434 客户把助记词写进了工单）：站长口令 + redact:1 才能改正文，记下改过的时间
    if (b.redact === 1 && typeof b.txt === "string") { t.txt = b.txt.slice(0, 4000); t.red = Date.now(); }
    // 客服回复附图（最多 4 张，和客户截图一样存 KV）：覆盖式，重新保存就换新的一组
    if (Array.isArray(b.rimgs)) {
      const ri = b.rimgs.filter((x) => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 700000).slice(0, 4);
      for (let i = 0; i < ri.length; i++) await kv.put("tk:img:" + t.id + ":r" + i, ri[i], { expirationTtl: 180 * 86400 });
      if (ri.length) t.rn = ri.length;
    }
    t.up = Date.now();
    await kv.put("tk:" + t.id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
    if (t.note && t.st !== "del") await kv.put("tk:up:" + t.a, String(t.up), { expirationTtl: 180 * 86400 }).catch(() => {}); // 🔔 客户的回复气泡只看这一条（见 GET ?mine=&peek=1）
    // 处理完：客户绑定过 DeBox 机器人的，私信告诉他回复内容
    const same = wasDone && t.note === note0 && !(Array.isArray(b.rimgs) && b.rimgs.length); // 已经是「已解决」、回复也没变：手机连点、重复提交，不再通知第二遍
    if (b.st === "done" && t.note && !wasDel && !same) {
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
  if (txt.length < 2 && !imgs.length && !b.v) return json({ error: "请写一下遇到的问题，或者贴一张截图 / 传一个视频" }, 400); // b.v：客户选了视频，工单建好后马上单独上传
  if (txt.length > 2000) return json({ error: "文字太长了，2000 字以内" }, 400);
  if (imgs.length > 4) return json({ error: "截图最多 4 张" }, 400);
  if (imgs.some((x) => x.length > 1.5e6)) return json({ error: "有一张截图太大了，请换一张" }, 400);
  const sg = signer(b.pa, b.pts, b.psig), urg = b.urg ? canUrg(sg) : false;
  if (b.urg && !urg) return json({ error: "「加急」只给站长和产品优化员用：请先用你的钱包签个名（免费，不花 Gas），或者去掉「加急」再提交" }, 400);
  if (canUrg(a) && sg !== a && !b.nosigOk) return json({ error: "这是站长 / 产品优化员的钱包地址，这次提交没有带上这个钱包的签名。请先用这个钱包签个名（到 📬 收件箱登录一次，免费）再点提交；还不行就刷新页面再试。不签名提交的不算你本人提交的，以后自己删不掉", sign: 1 }, 400);
  const ip = ctx.request.headers.get("cf-connecting-ip") || "x";
  if (await kv.get("tk:rl:" + ip)) return json({ error: "提交太快了，请 1 分钟后再试" }, 400);
  await kv.put("tk:rl:" + ip, "1", { expirationTtl: 60 });
  const id = Number((await kv.get("tk:seq")) || "0") + 1;
  await kv.put("tk:seq", String(id));
  const t = { id, a, txt, n: imgs.length, t: Date.now(), st: "new", note: "" };
  if (b.src === "inbox") t.src = "inbox";
  const vip = reviewerOf(a); if (vip) t.vip = vip; // ⭐ 产品优化员：按地址认（站长定的规矩：不走 AI 分诊、不判无效、不自动答复、推站内信给站长亲审）。冒填的另有 nosig 提示
  if (urg) t.urg = Date.now(); // 🚨 加急（记下加急的时间）
  if (canUrg(a) && sg !== a) t.nosig = 1; // 填的是站长 / 产品优化员的地址，提交时却没有这个钱包的签名：可能是别人冒填的，不算本人提交的（后台不标「我」、不能删）
  for (let i = 0; i < imgs.length; i++) await kv.put("tk:img:" + id + ":" + i, imgs[i], { expirationTtl: 180 * 86400 });
  await kv.put("tk:" + id, JSON.stringify(t), { expirationTtl: 180 * 86400 });
  const list = ((await kv.get("tk:list", "json")) || []).concat(id).slice(-1000);
  await kv.put("tk:list", JSON.stringify(list));
  const mine = ((await kv.get("tk:a:" + a, "json")) || []).concat(id).slice(-50);
  await kv.put("tk:a:" + a, JSON.stringify(mine));
  ctx.waitUntil(runTriage(ctx, kv, t).catch(() => {})); // AI 分诊：无效忽略、分级、0/1 级才立刻私信站长
  return json({ ok: true, id, urg: urg ? 1 : 0 });
}
