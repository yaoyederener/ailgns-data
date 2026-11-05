// 🔔 站内信 / 收件箱（2026-11-05 站长定：通知不依赖任何第三方社交软件）
// 每个钱包一个收件箱 ib:<addr>（最多 100 条，新的在前）；ib:seen:<addr> = 最后一次「全部已读」的时间
// 成交 / 借贷 / 工单回复 / 预言家 / 链上留言 都往这里写一份；DeBox 私信只是可选的附加提醒
export const KINDS = { otc: "💱", loan: "🤝", ticket: "📮", msg: "📬", oracle: "🔮", sys: "📣" };
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
export async function pushInbox(kv, addr, k, txt, link) {
  const a = String(addr || "").toLowerCase();
  if (!kv || !isAddr(a) || !txt) return;
  const key = "ib:" + a, list = (await kv.get(key, "json")) || [], t = Date.now();
  list.unshift({ id: t.toString(36) + Math.random().toString(36).slice(2, 6), t, k: KINDS[k] ? k : "sys", txt: String(txt).slice(0, 1200), link: link || "" });
  await kv.put(key, JSON.stringify(list.slice(0, 100)));
}
// [[地址, 文字], …] 批量写（和 DeBox 私信用同一份文字）
export async function pushMany(kv, pairs, k) {
  for (const [a, txt] of pairs) await pushInbox(kv, a, k, txt).catch(() => {});
}
// 登录签名原文：前端 inbox.js 一字不差
export const inboxText = (a, ts) => "AiLGNS 收件箱登录\n地址：" + a + "\n时间：" + ts;
export const AUTH_TTL = 30 * 86400e3; // 签一次管 30 天
