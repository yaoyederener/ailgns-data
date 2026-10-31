// DeBox 机器人的 Webhook：客户私聊机器人发钱包地址就完成绑定，之后这个地址的 OTC 挂单动态会私信通知他
// 支持：直接发地址 / 「绑定 0x…」 / 「解绑 0x…」 / 「我的绑定」
// 绑定关系存在 KV：dbx:u:<用户> → [地址…]，dbx:a:<地址> → [用户…]
import { sendDebox } from "../../lib/debox.js";

const MAX_ADDR = 10;
const HELP = "👋 这里是 AiLGNS 服务站通知机器人。\n\n把你挂单用的钱包地址（0x 开头）直接发给我，就能绑定。之后这个钱包的 OTC 挂单：\n• 成交（包括部分成交）\n• 撤单退回\n• 到期自动退回\n都会第一时间私信通知你。\n\n其他指令：\n• 解绑 0x…  取消某个地址\n• 我的绑定  查看已绑定的地址\n\n👉 交易：https://ailgns.dev/#/otc";

async function getList(kv, key) { return (await kv.get(key, "json")) || []; }

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
  if (/group/i.test(chatType)) return new Response("ok"); // 只处理私聊，群里的消息不管
  const reply = (t) => sendDebox(ctx.env, chatId, t, "private").catch((e) => kv && kv.put("dbx:lasterr", JSON.stringify({ at: Date.now(), err: String(e.message || e) }), { expirationTtl: 86400 }));

  const addrs = [...new Set((text.match(/0x[0-9a-fA-F]{40}/g) || []).map((a) => a.toLowerCase()))];
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
  } else {
    out = HELP;
  }
  ctx.waitUntil(reply(out));
  return new Response("ok");
}

// 浏览器打开这个地址时给个提示（DeBox 后台填 Webhook 时也可能先访问一下）
export async function onRequestGet(ctx) {
  if (new URL(ctx.request.url).searchParams.get("debug") === "1" && ctx.env.TEAM_KV) {
    return Response.json({ err: await ctx.env.TEAM_KV.get("dbx:lasterr", "json") }); // 最近一次回复失败的原因
  }
  return new Response("AiLGNS DeBox webhook ok");
}

function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
