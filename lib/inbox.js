// 🔔 站内信 / 收件箱（2026-11-05 站长定：通知不依赖任何第三方社交软件）
// 每个钱包一个收件箱 ib:<addr>（最多 100 条，新的在前）；ib:seen:<addr> = 最后一次「全部已读」的时间
// 成交 / 借贷 / 工单回复 / 预言家 / 链上留言 都往这里写一份；DeBox 私信只是可选的附加提醒
import { pushToAddr } from "./webpush.js";
export const KINDS = { otc: "💱", loan: "🤝", ticket: "📮", msg: "📬", oracle: "🔮", sys: "📣" };
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
export const OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 站长站内信（谷歌社交账号钱包）
export async function pushInbox(kv, addr, k, txt, link) {
  const a = String(addr || "").toLowerCase();
  if (!kv || !isAddr(a) || !txt) return;
  const key = "ib:" + a, list = (await kv.get(key, "json")) || [], t = Date.now();
  list.unshift({ id: t.toString(36) + Math.random().toString(36).slice(2, 6), t, k: KINDS[k] ? k : "sys", txt: String(txt).slice(0, 1200), link: link || "" });
  await kv.put(key, JSON.stringify(list.slice(0, 100)));
  // 🔔 开了通知的设备：系统级推送（iPhone 加到主屏幕后也能收到）
  const it = list[0];
  await pushToAddr(kv, a, { t: (KINDS[it.k] || "📣") + " " + String(it.txt).split("\n")[0].slice(0, 60), b: String(it.txt).split("\n").slice(1).join(" ").slice(0, 120), u: it.link ? (it.link.startsWith("#") ? "/" + it.link : it.link) : "/#/inbox" }).catch(() => {});
}
// [[地址, 文字], …] 批量写（和 DeBox 私信用同一份文字）
export async function pushMany(kv, pairs, k, link) {
  if (!kv) return;
  const by = new Map();
  for (const [addr, txt] of pairs) { const a = String(addr || "").toLowerCase(); if (!isAddr(a) || !txt) continue; if (!by.has(a)) by.set(a, []); by.get(a).push(txt); }
  const one = async (a, txts) => {
    const key = "ib:" + a, list = (await kv.get(key, "json")) || [];
    let t = Date.now();
    for (const txt of txts) { t++; list.unshift({ id: t.toString(36) + Math.random().toString(36).slice(2, 6), t, k: KINDS[k] ? k : "sys", txt: String(txt).slice(0, 1200), link: link || "" }); }
    await kv.put(key, JSON.stringify(list.slice(0, 100)));
    const it = list[0], more = txts.length > 1 ? "（共 " + txts.length + " 条新消息）" : "";
    await pushToAddr(kv, a, { t: (KINDS[it.k] || "📣") + " " + String(it.txt).split("\n")[0].slice(0, 60) + more, b: String(it.txt).split("\n").slice(1).join(" ").slice(0, 120), u: it.link ? (it.link.startsWith("#") ? "/" + it.link : it.link) : "/#/inbox" }).catch(() => {});
  };
  const all = [...by.entries()];
  for (let i = 0; i < all.length; i += 8) await Promise.all(all.slice(i, i + 8).map(([a, txts]) => one(a, txts).catch(() => {})));
}
// 登录签名原文：前端 inbox.js 一字不差
export const inboxText = (a, ts) => "AiLGNS 收件箱登录\n地址：" + a + "\n时间：" + ts;
export const AUTH_TTL = 30 * 86400e3; // 签一次管 30 天
