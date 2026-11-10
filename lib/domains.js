// 🌐 网址池（防封防墙）。新买了域名只要加到这里：App 壳页、客服机器人、更新日志都从这取
export const DOMAINS = [
  { h: "ailgns.dev", main: true },
  { h: "ailgnsotc.com" }, { h: "ailgnsotc.net" }, { h: "ailgnsotc.org" }, { h: "ailgnsotc.cc", tag: "🚀 大陆加速" }, { h: "ailgnsotc.xyz" },
  { h: "ailgns-data.pages.dev", note: "Cloudflare 原始地址" },
];

// 📣 「网址」消息：客服机器人、站内信、群公告共用一段文字
export function domainsText() {
  const hs = DOMAINS.filter((d) => !d.note).map((d) => "https://" + d.h + "/");
  return "🌐 AiLGNS 最新可用网址（任选一个，打不开就换下一个）：\n" + hs.join("\n") +
    "\n\n📲 永久入口：用手机浏览器打开任一网址 + /app 加到主屏幕（例如 " + hs[0] + "app ），以后网站全被封它也能打开，里面永远有新网址。" +
    "\n💬 交流群里也会第一时间发新网址。给机器人发「网址」两个字，随时能查。";
}
// 📣 一键群发新网址：所有绑定过机器人的 DeBox 用户私信 + 所有见过机器人的群 + 所有收件箱（站内信）。站长在 DeBox 给机器人发「推送网址」触发
export async function pushDomains(env, kv, sendDebox, pushInbox) {
  const txt = domainsText(), out = { users: 0, groups: 0, inbox: 0 };
  const listAll = async (prefix) => { let ks = [], cur; do { const r = await kv.list({ prefix, cursor: cur, limit: 1000 }); ks = ks.concat(r.keys.map((k) => k.name)); cur = r.list_complete ? null : r.cursor; } while (cur); return ks; };
  const users = (await listAll("dbx:u:")).map((k) => k.slice(6)), groups = (await listAll("dbx:g:")).map((k) => k.slice(6));
  const addrs = (await listAll("ib:")).filter((k) => /^ib:0x[0-9a-f]{40}$/.test(k)).map((k) => k.slice(3));
  const nap = () => new Promise((r) => setTimeout(r, 150)); // DeBox 有频率限制（429），每条之间歇一下
  for (const u of users) { try { await sendDebox(env, u, txt, "private"); out.users++; } catch (e) {} await nap(); }
  for (const g of groups) { try { await sendDebox(env, g, txt, "group"); out.groups++; } catch (e) {} await nap(); }
  for (const a of addrs) { try { await pushInbox(kv, a, "sys", txt, "#/app"); out.inbox++; } catch (e) {} }
  await kv.put("dom:lastpush", JSON.stringify({ t: Date.now(), ...out }), { expirationTtl: 90 * 86400 });
  return out;
}
