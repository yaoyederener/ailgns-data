// DeBox 机器人的 Webhook：客户私聊机器人发钱包地址就完成绑定，之后这个地址的 OTC 挂单动态会私信通知他
// 支持：直接发地址 / 「绑定 0x…」 / 「解绑 0x…」 / 「我的绑定」
// 绑定关系存在 KV：dbx:u:<用户> → [地址…]，dbx:a:<地址> → [用户…]
import { sendDebox } from "../../lib/debox.js";
import { SUPPORT_USER } from "../../lib/support.js";
import { domainsText, pushDomains } from "../../lib/domains.js";
import { pushInbox } from "../../lib/inbox.js";
import { answer } from "../../lib/chatbot.js";

const MAX_ADDR = 10;
const HELP = "👋 这里是 AiLGNS 服务站通知机器人。\n\n把你挂单用的钱包地址（0x 开头）直接发给我，就能绑定。之后这个钱包的 OTC 挂单：\n• 成交（包括部分成交）\n• 撤单退回\n• 到期自动退回\n都会第一时间私信通知你。\n\n其他指令：\n• 解绑 0x…  取消某个地址\n• 我的绑定  查看已绑定的地址\n\n👉 交易：https://ailgns.dev/#/otc";

async function getList(kv, key) { return (await kv.get(key, "json")) || []; }
// Webhook 的 key：机器人后台既可以写在地址 ?key=… 里，也可以填在「Webhook Key」栏（DeBox 会放到请求头里）
function keyOk(ctx) {
  const want = ctx.env.DEBOX_HOOK_KEY; if (!want) return true;
  if (new URL(ctx.request.url).searchParams.get("key") === want) return true;
  const h = ctx.request.headers;
  return ["x-webhook-key", "webhook-key", "x-debox-key", "x-api-key", "authorization", "x-signature", "key"].some((n) => { const v = h.get(n) || ""; return v === want || v === "Bearer " + want; });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  let u;
  try { u = await ctx.request.json(); } catch (e) { u = null; }
  if (!u) return new Response("ok");
  // DeBox 实际推送的格式：{ from_user_id, to_user_id, group_id（私聊为空）, message: "文字", message_raw, address, name }
  // 也兼容 SDK 文档里那种 { message: { text, chat: {id, type}, from: {user_id} } }
  let text, user, chatType, chatId;
  if (typeof u.message === "string" || u.from_user_id) {
    text = String(u.message_raw || u.message || "").trim();
    user = String(u.from_user_id || "");
    chatType = u.group_id ? "group" : "private";
    chatId = user;
  } else {
    const m = u.message || (u.callback_query && u.callback_query.message) || u, chat = m.chat || {}, from = m.from || {};
    text = String(m.text || m.text_raw || m.content || "").trim();
    user = String(from.user_id || from.id || chat.id || "");
    chatType = chat.type || "private";
    chatId = chat.id || user;
  }
  if (!user || !kv) return new Response("ok");
  // 诊断：记最近一次收到的消息长什么样（不存正文），站长用 ?diag=1 看机器人有没有收到群消息
  ctx.waitUntil(kv.put("dbx:lasthit", JSON.stringify({ t: Date.now(), chatType, hasGroup: !!u.group_id, keys: Object.keys(u).slice(0, 12), keyOk: keyOk(ctx), hdrs: [...ctx.request.headers.keys()].filter((k) => !/^(cf-|accept|content|host|user-agent|x-forwarded|x-real)/i.test(k)).slice(0, 10), mention: !!(u.mention_users && u.mention_users.length), gid: String(u.group_id || "").slice(0, 3) + (u.group_id ? "…" : ""), len: text.length }), { expirationTtl: 86400 }));
  // 群里：机器人当客服。只接「像问题」的话（有问号 / 疑问词 / @机器人），每群 15 秒最多答 1 条、每人 10 秒 1 条、每群每天 300 条，避免刷屏
  if (/group/i.test(chatType)) {
    const gid = String(u.group_id || chatId || "");
    if (!gid || !text || text.length < 2 || text.length > 400) return new Response("ok");
    // 安全：Webhook 谁都能 POST，群回复只认带正确 key 的请求（机器人 Webhook 地址 ?key=DEBOX_HOOK_KEY），防止有人伪造消息让机器人刷群
    if (!keyOk(ctx)) { ctx.waitUntil(kv.put("dbx:gkeymiss", String(Date.now()), { expirationTtl: 86400 })); return new Response("ok"); }
    ctx.waitUntil(kv.put("dbx:g:" + gid, "1", { expirationTtl: 90 * 86400 })); // 记住这个群，群发新网址时用
    if (/^@?\S*\s*(网址|新网址|备用网址|最新网址|网站打不开|打不开)\s*[?？!！]*$/.test(text)) { ctx.waitUntil(sendDebox(ctx.env, gid, domainsText(), "group").catch(() => {})); return new Response("ok"); }
    const asked = (u.mention_users && u.mention_users.length) || /[?？]|怎么|怎样|如何|什么|啥|吗\b|多少|哪里|哪儿|为什么|为啥|能不能|可以|是不是|有没有|几点|多久|请问|@/.test(text);
    if (!asked || (text.match(/0x[0-9a-fA-F]{40}/g) || []).length > 1) return new Response("ok");
    const lastBot = await kv.get("dbx:gbot:" + gid); if (lastBot && text === lastBot) return new Response("ok"); // 自己的话不接
    const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const [gl, ul, dn] = await Promise.all([kv.get("dbx:gl:" + gid), kv.get("dbx:ul:" + user), kv.get("dbx:gd:" + gid + ":" + day)]);
    if (gl || ul || Number(dn || 0) >= 300) return new Response("ok");
    await Promise.all([kv.put("dbx:gl:" + gid, "1", { expirationTtl: 60 }), kv.put("dbx:ul:" + user, "1", { expirationTtl: 60 })]);
    ctx.waitUntil((async () => {
      const hist = (await kv.get("dbx:h:" + user, "json")) || [];
      const msgs = hist.concat([{ role: "user", content: text.replace(/@\S+/g, "").trim() || text }]);
      const r = await answer(ctx.env, msgs, { style: "【现在的场合】你在 DeBox 的 AiLGNS OTC 交流群里回答群友。纯文本、不要 Markdown、不要列表符号，2-4 句说完；只答和本站有关的问题，无关的话题一句话礼貌带过；需要人工就说「可以在网站客服窗口留言或提交工单，站长会处理」。" });
      if (!r || !r.answer) return;
      // 回答结尾引导：有问题 @我（站长 2026-11-05 定：客服机器人自己接所有问题，不 @站长）
      // 答不了的：直接把工单入口甩给对方（站长 2026-11-05 定），答得了的：引导继续 @我
      const out = (u.name ? "@" + u.name + " " : "") + r.answer + (r.human ? "\n\n📮 这个问题需要人工核实，请提交工单（填钱包地址 + 截图），会按轻重缓急处理：https://ailgns.dev/#/feedback" : "\n\n有其他问题随时 @我，OTC / 域名 / 借贷 / 预言家都能答。");
      await sendDebox(ctx.env, gid, out, "group").catch((e) => kv.put("dbx:lasterr", JSON.stringify({ at: Date.now(), err: String(e.message || e) }), { expirationTtl: 86400 }));
      await Promise.all([
        kv.put("dbx:gbot:" + gid, out, { expirationTtl: 600 }),
        kv.put("dbx:gl:" + gid, "1", { expirationTtl: 15 }), kv.put("dbx:ul:" + user, "1", { expirationTtl: 10 }),
        kv.put("dbx:gd:" + gid + ":" + day, String(Number(dn || 0) + 1), { expirationTtl: 2 * 86400 }),
        kv.put("dbx:h:" + user, JSON.stringify(msgs.concat([{ role: "assistant", content: r.answer }]).slice(-6)), { expirationTtl: 3600 }),
      ]);
      const log = (await kv.get("dbx:qa", "json")) || []; log.unshift({ t: Date.now(), g: gid, u: user, n: u.name || "", q: text.slice(0, 200), a: r.answer.slice(0, 400), e: r.engine });
      await kv.put("dbx:qa", JSON.stringify(log.slice(0, 100)));
    })());
    return new Response("ok");
  }
  const reply = (t) => sendDebox(ctx.env, chatId, t, "private").catch((e) => kv && kv.put("dbx:lasterr", JSON.stringify({ at: Date.now(), err: String(e.message || e) }), { expirationTtl: 86400 }));

  // 「我的ID」：把发信人的 DeBox 用户 id 告诉他（站长设置客服接收人时要用）
  if (/^(我的\s*id|id|我的编号|编号)$/i.test(text)) { ctx.waitUntil(reply("你的 DeBox 用户 ID 是：" + user + "\n把这个 ID 发给站长，就能把网站客服的咨询转发到你这里。")); return new Response("ok"); }
  if (/^(网址|新网址|备用网址|最新网址|网站打不开|打不开)\s*[?？!！]*$/.test(text)) { ctx.waitUntil(reply(domainsText())); return new Response("ok"); }
  // 站长发「推送网址」：给所有绑定过的用户私信 + 所有群 + 所有收件箱群发最新网址（被封当天用）
  if (user === SUPPORT_USER && /^推送网址$/.test(text)) {
    if (!keyOk(ctx)) { ctx.waitUntil(reply("⚠️ 没带 key，不执行")); return new Response("ok"); }
    ctx.waitUntil(pushDomains(ctx.env, kv, sendDebox, pushInbox).then((o) => reply("📣 已群发最新网址：私信 " + o.users + " 人 · " + o.groups + " 个群 · 站内信 " + o.inbox + " 个钱包")).catch((e) => reply("群发出错：" + String(e.message || e))));
    return new Response("ok");
  }
  const addrs = [...new Set((text.match(/0x[0-9a-fA-F]{40}/g) || []).map((a) => a.toLowerCase()))];
  // 站长（客服接收人）直接回复机器人 = 回复网站上最近咨询的访客；开头写「@编号 」可以指定访客
  // 安全：Webhook 没有来源校验，任何人都能伪造 POST，所以只有带正确 key（Cloudflare 环境变量 DEBOX_HOOK_KEY，机器人 Webhook 地址 ?key=… 里同一个值）的请求才算站长回复
  if (user === SUPPORT_USER && text && !addrs.length && !/^(我的绑定|绑定列表|list|解绑|取消|unbind|帮助|help)/i.test(text)) {
    const ok = ctx.env.DEBOX_HOOK_KEY && keyOk(ctx);
    if (!ok) { ctx.waitUntil(reply("⚠️ 客服回复还没开启：请在 Cloudflare 设置环境变量 DEBOX_HOOK_KEY，并把机器人的 Webhook 地址改成 https://ailgns.dev/api/debox-hook?key=（同一个值），之后在这里直接回复就能发给客户。")); return new Response("ok"); }
    const m = text.match(/^@?([a-z0-9]{8})\s+([\s\S]+)$/i);
    const sid = m ? await kv.get("cl:code:" + m[1].toLowerCase()) : await kv.get("cl:last"), body = (m ? m[2] : text).trim().slice(0, 600);
    if (!sid) { ctx.waitUntil(reply(m ? "没找到访客 " + m[1] + "（编号只保留 7 天）" : "最近没有待回复的访客")); return new Response("ok"); }
    const list = (await kv.get("cl:r:" + sid, "json")) || [];
    list.push({ t: Date.now(), text: body });
    await kv.put("cl:r:" + sid, JSON.stringify(list.slice(-50)), { expirationTtl: 7 * 86400 });
    ctx.waitUntil(reply("✅ 已发给访客 " + sid.slice(0, 8) + "（TA 的网页客服窗口几秒内显示）"));
    return new Response("ok");
  }
  const mine = await getList(kv, "dbx:u:" + user);
  let out;
  if (/解绑|取消|unbind/i.test(text) && addrs.length) {
    for (const a of addrs) {
      await kv.put("dbx:a:" + a, JSON.stringify((await getList(kv, "dbx:a:" + a)).filter((x) => x !== user)));
    }
    const left = mine.filter((a) => !addrs.includes(a));
    await kv.put("dbx:u:" + user, JSON.stringify(left));
    out = "已解绑 " + addrs.map(short).join("、") + "。" + (left.length ? "\n仍在通知：\n" + left.join("\n") : "\n现在没有绑定任何地址。");
  } else if (addrs.length) {
    const all = [...new Set(mine.concat(addrs))];
    if (all.length > MAX_ADDR) {
      out = `最多绑定 ${MAX_ADDR} 个地址，请先「解绑 0x…」不用的。`;
    } else {
      for (const a of addrs) {
        const us = await getList(kv, "dbx:a:" + a);
        if (!us.includes(user)) { us.push(user); await kv.put("dbx:a:" + a, JSON.stringify(us.slice(-20))); }
      }
      await kv.put("dbx:u:" + user, JSON.stringify(all));
      out = "✅ 已绑定 " + addrs.map(short).join("、") + "\n这个钱包的 OTC 挂单成交、撤单、到期退回都会通知你。\n\n已绑定 " + all.length + " 个地址，发「我的绑定」查看。";
    }
  } else if (/我的绑定|绑定列表|list/i.test(text)) {
    out = mine.length ? "已绑定 " + mine.length + " 个地址：\n" + mine.join("\n") : "还没有绑定地址。把你的钱包地址（0x 开头）直接发给我就能绑定。";
  } else if (!text || /^(帮助|help|菜单|开始|start|你好|hi|hello)$/i.test(text)) {
    out = HELP;
  } else {
    // 私聊问别的：机器人当客服回答（知识库同网站客服），答完顺带提醒怎么绑定通知
    ctx.waitUntil((async () => {
      const hist = (await kv.get("dbx:h:" + user, "json")) || [], msgs = hist.concat([{ role: "user", content: text }]);
      const r = await answer(ctx.env, msgs, { style: "【现在的场合】你在 DeBox 私聊里回答一位客户。纯文本、不要 Markdown，3-5 句说完。" });
      const t = r && r.answer ? r.answer + (r.human ? "\n\n📮 请提交工单（填钱包地址 + 截图）：https://ailgns.dev/#/feedback" : "\n\n（把钱包地址发给我，可以绑定成交/借贷通知）") : HELP;
      await kv.put("dbx:h:" + user, JSON.stringify(msgs.concat([{ role: "assistant", content: r && r.answer || "" }]).slice(-6)), { expirationTtl: 3600 });
      const log = (await kv.get("dbx:qa", "json")) || []; log.unshift({ t: Date.now(), g: "", u: user, n: u.name || "", q: text.slice(0, 200), a: (r && r.answer || "").slice(0, 400), e: r && r.engine });
      await kv.put("dbx:qa", JSON.stringify(log.slice(0, 100)));
      await reply(t);
    })());
    return new Response("ok");
  }
  ctx.waitUntil(reply(out));
  return new Response("ok");
}

// 浏览器打开这个地址时给个提示（DeBox 后台填 Webhook 时也可能先访问一下）

function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }

// 站长诊断：GET ?diag=1 → 最近一次收到的消息形状、最近发送错误、群问答条数（不含正文、不含密钥）
export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv || !(u.searchParams.get("diag") || u.searchParams.get("debug"))) return new Response("AiLGNS DeBox webhook ok");
  const [hit, err, qa, miss] = await Promise.all([kv.get("dbx:lasthit", "json"), kv.get("dbx:lasterr", "json"), kv.get("dbx:qa", "json"), kv.get("dbx:gkeymiss")]);
  return Response.json({ lastHit: hit, lastErr: err, qa: (qa || []).length, lastQa: qa && qa[0] ? { t: qa[0].t, e: qa[0].e } : null, keyMissAt: miss ? Number(miss) : 0, hookKeySet: !!ctx.env.DEBOX_HOOK_KEY, apiKeySet: !!ctx.env.DEBOX_API_KEY, now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
