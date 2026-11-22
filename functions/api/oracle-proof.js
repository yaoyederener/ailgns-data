// 📷 预言家领奖凭证（站长 2026-11-16）：很多人不会在 DeBox 发帖贴链接，改成「在群里说一声自己中奖了 → 截图或录一小段视频 → 在预言家页上传」。
// 团队在工单后台点开看一眼，再点「通过」，机器人才发奖（发奖那一步没变，还是 functions/api/oracle.js 的 approve）。
//   POST JSON  { action: "shots", a, id, imgs: [dataURL…] }          中奖人交截图（最多 3 张，前端已压成 JPEG）
//   POST 二进制 ?video=1&id=…&a=…   正文就是视频文件                    中奖人交视频（最多 20MB）
//   POST JSON  { action: "view", key, id, n }  /  { action: "view", key, id, video: 1 }   后台看图 / 看视频（口令走正文，不进网址）
// 存 KV：or:proof:<奖项编号>:i0..i2（图片 dataURL）、or:proof:<奖项编号>:v（视频原文件），留 60 天。
// 不要求钱包签名（站长要方便）：凭证只是给团队看的，奖只会发到中奖钱包，别人乱传也领不走钱；通过不通过由团队看了算。
import { needSay, payState, autoOk } from "../../lib/oracle.js";
import { pushInbox, OWNER } from "../../lib/inbox.js";
import { wkNeedSay, wkState } from "../../lib/weekly.js"; // 周榜超过 100 DAI 的奖也在这里交凭证（2026-11-22），编号以 wk: 开头，名单在 wk:pay
const KIND_CN = { king: "贡献王", closest: "天眼通", second: "地灵通", jackpot: "神算子大奖", daily: "每日前三" };
const TTL = 60 * 86400, MAX_IMG = 3, IMG_MAX = 1200000, VID_MAX = 20 * 1024 * 1024;
const VID_OK = /^video\/(mp4|quicktime|webm|x-m4v|3gpp)$/i;
const admOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });

async function mine(kv, id, a) { // 找到这笔奖，并确认还收凭证
  if (/^wk:/.test(String(id))) { // 🏆 周榜的奖
    const pay = (await kv.get("wk:pay", "json")) || [], x = pay.find((p) => String(p.id) === String(id) && p.a === a);
    if (!x) return { err: json({ error: "没找到这笔奖，请刷新页面再试一次" }, 404) };
    const st = wkState(x);
    if (!wkNeedSay(x) || st === "paid" || st === "forfeit" || st === "sending") return { err: json({ error: "这笔奖不用再交了" }, 400) };
    if (x.ok) return { err: json({ error: "这笔奖已经认证通过，等机器人发奖就行" }, 400) };
    return { pay, x, key: "wk:pay", wk: 1, st: () => wkState(x) };
  }
  const pay = (await kv.get("or:pay", "json")) || [], x = pay.find((p) => String(p.id) === String(id) && p.a === a);
  if (!x) return { err: json({ error: "没找到这笔奖。请确认连的是中奖的那个钱包，再刷新页面试一次" }, 404) };
  const st = payState(x);
  if (!needSay(x) || st === "paid" || st === "forfeit") return { err: json({ error: "这笔奖不用再交了" }, 400) };
  if (x.ok && !x.ok.auto) return { err: json({ error: "这笔奖已经认证通过，等机器人发奖就行" }, 400) };
  return { pay, x, key: "or:pay", st: () => payState(x) };
}
async function limit(kv, ctx) { // 同一个网络 8 秒内只收一次，防乱刷（前端传完截图会等 9 秒再传视频）
  const ip = ctx.request.headers.get("cf-connecting-ip") || "x", k = "or:proof:rl:" + ip;
  if (Date.now() - Number((await kv.get(k)) || 0) < 8000) return json({ error: "交得太快了，请等 10 秒再试" }, 429);
  await kv.put(k, String(Date.now()), { expirationTtl: 60 });
  return null;
}
const IMG_MIN = 4000, VID_MIN = 100 * 1024; // 🤖 简单审核：截图不能是空白小图、视频不能只有一丁点；不够格的留给站长手动看
function tell(ctx, kv, x, what, good) {
  if (x.kind === "week") { // 周榜：不自动通过，都等团队看
    ctx.waitUntil(pushInbox(kv, OWNER, "oracle", "🏆 周榜中奖人交了领奖凭证（" + what + "），等你认证\n" + x.name + " · " + x.cyc + " 那一周 · " + x.amt + " DAI\n到工单后台最上面点开看一眼，再点「通过」，机器人才会发奖。", "#/feedback/admin").catch(() => {}));
    ctx.waitUntil(kv.delete("wk:cache").catch(() => {}));
    return;
  }
  if (good && autoOk(x) && !x.ok) { // 小奖：凭证像样就自动通过，站长只收一条「已自动通过」的通知，想撤回还可以到后台撤
    x.ok = { at: Date.now(), auto: 1 };
    ctx.waitUntil(pushInbox(kv, OWNER, "oracle", "🤖 小奖已自动通过（" + what + "）\n" + x.name + " · " + x.day + " · " + (KIND_CN[x.kind] || x.kind) + " · " + x.amt + " DAI\n" + (payState(x) === "ready" ? "机器人几分钟内发奖。" : "他名字烧够后机器人自动发。") + "不用你点；想看凭证或撤回，到工单后台最上面。", "#/feedback/admin").catch(() => {}));
    ctx.waitUntil(pushInbox(kv, x.a, "oracle", "✅ 你的领奖凭证已通过（" + x.day + " · " + (KIND_CN[x.kind] || x.kind) + "）。" + (payState(x) === "ready" ? "机器人几分钟内把 AiLGNS 发到这个钱包。" : "名字烧够以后，机器人自动把 AiLGNS 发到这个钱包。") + "\n⚠️ 领奖全程自助，不需要任何客服帮忙；有人私聊你「指导领奖」都是骗子。", "#/oracle").catch(() => {}));
    return;
  }
  ctx.waitUntil(pushInbox(kv, OWNER, "oracle", "🏆 中奖人交了领奖凭证（" + what + "），等你认证\n" + x.name + " · " + x.day + " · " + (KIND_CN[x.kind] || x.kind) + " · " + x.amt + " DAI\n到工单后台最上面点开看一眼，再点「通过」，机器人才会发奖。", "#/feedback/admin").catch(() => {}));
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return json({ error: "数据库没连上" }, 503);
  const u = new URL(ctx.request.url);
  // —— 视频：正文就是文件 ——
  if (u.searchParams.get("video")) {
    const a = String(u.searchParams.get("a") || "").toLowerCase(), id = String(u.searchParams.get("id") || "");
    const type = String(ctx.request.headers.get("content-type") || "").split(";")[0].trim();
    if (!isAddr(a)) return json({ error: "请先连接钱包" }, 400);
    if (!VID_OK.test(type)) return json({ error: "这个文件不是常见的视频格式，请换成手机直接录的视频，或者改传截图" }, 400);
    if (Number(ctx.request.headers.get("content-length") || 0) > VID_MAX) return json({ error: "视频太大了（最多 20MB）。请录短一点（20 秒以内），或者改传截图" }, 400);
    const m = await mine(kv, id, a); if (m.err) return m.err;
    const rl = await limit(kv, ctx); if (rl) return rl;
    const buf = await ctx.request.arrayBuffer();
    if (!buf.byteLength) return json({ error: "视频是空的，请重新选一次" }, 400);
    if (buf.byteLength > VID_MAX) return json({ error: "视频太大了（最多 20MB）。请录短一点（20 秒以内），或者改传截图" }, 400);
    await kv.put("or:proof:" + id + ":v", buf, { expirationTtl: TTL, metadata: { type, size: buf.byteLength } });
    m.x.say = Object.assign({}, m.x.say || {}, { v: 1, vt: type, at: Date.now() });
    tell(ctx, kv, m.x, "视频", buf.byteLength >= VID_MIN);
    await kv.put(m.key, JSON.stringify(m.pay));
    return json({ ok: true, st: m.st() });
  }
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  // —— 截图 ——
  if (b.action === "shots") {
    const a = String(b.a || "").toLowerCase(), id = String(b.id || "");
    const imgs = (Array.isArray(b.imgs) ? b.imgs : []).filter((s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)).slice(0, MAX_IMG);
    if (!isAddr(a)) return json({ error: "请先连接钱包" }, 400);
    if (!imgs.length) return json({ error: "没收到图片，请重新选一次截图" }, 400);
    if (imgs.some((s) => s.length > IMG_MAX)) return json({ error: "有一张截图太大了，请换一张" }, 400);
    const m = await mine(kv, id, a); if (m.err) return m.err;
    const rl = await limit(kv, ctx); if (rl) return rl;
    for (let i = 0; i < imgs.length; i++) await kv.put("or:proof:" + id + ":i" + i, imgs[i], { expirationTtl: TTL });
    m.x.say = Object.assign({}, m.x.say || {}, { n: imgs.length, at: Date.now() });
    tell(ctx, kv, m.x, imgs.length + " 张截图", imgs.some((s) => s.length >= IMG_MIN));
    await kv.put(m.key, JSON.stringify(m.pay));
    return json({ ok: true, st: m.st() });
  }
  // —— 上传过程留痕（2026-11-20，工单 #327：客户说「发截图没反应」，服务器上一条都没收到，查不出卡在哪一步）——
  // 页面在「点了上传 / 选到几个文件 / 失败原因 / 成功」各报一条。只收确实有待领奖的钱包（mine 核过，别人刷不进来），留最近 200 条、30 天；后台用工单口令看（action: "logs"）
  if (b.action === "log") {
    const a = String(b.a || "").toLowerCase(), id = String(b.id || "");
    if (!isAddr(a)) return json({ ok: false });
    const m = await mine(kv, id, a);
    if (m.err) return json({ ok: false });
    const L = (await kv.get("or:uplog", "json")) || [];
    L.push({ t: Date.now(), a, id, ev: String(b.ev || "").slice(0, 20), info: String(b.info || "").slice(0, 160), ua: String(ctx.request.headers.get("user-agent") || "").slice(0, 160) });
    await kv.put("or:uplog", JSON.stringify(L.slice(-200)), { expirationTtl: 30 * 86400 });
    return json({ ok: true });
  }
  if (b.action === "logs") {
    if (!admOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
    return json({ list: (await kv.get("or:uplog", "json")) || [] });
  }
  // —— 后台看凭证 ——
  if (b.action === "view") {
    if (!admOk(ctx.env, b.key)) return json({ error: "口令不对" }, 403);
    const id = String(b.id || "");
    if (b.video) {
      const r = await kv.getWithMetadata("or:proof:" + id + ":v", "arrayBuffer");
      if (!r || !r.value) return json({ error: "视频没找到（可能已过期）" }, 404);
      return new Response(r.value, { headers: { "content-type": (r.metadata && r.metadata.type) || "video/mp4", "cache-control": "no-store" } });
    }
    const d = await kv.get("or:proof:" + id + ":i" + (Number(b.n) || 0));
    if (!d) return json({ error: "截图没找到（可能已过期）" }, 404);
    return json({ img: d });
  }
  return json({ error: "不认识的操作" }, 400);
}
