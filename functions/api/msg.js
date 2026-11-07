// 💬 链上留言（2026-11-05 站长定）：给某个地址发一笔 0 元交易，文字放在 data 里（前缀 ailgns-msg:），只花一点 Gas，永久公开
// 只有设了 .ailgns 主名字的钱包才能发（注册了域名的人才有资格）。前端发完交易把哈希 POST 过来：
//   POST { tx }            → 读链核对（前缀、发信人主名字、交易成功），存进双方的留言列表，给收信人发 DeBox 私信
//   GET  ?a=<地址>         → 这个地址收到 / 发出的留言（最近 200 条，新的在前）
import { rpc, primaryName } from "../../lib/oracle.js";
import { sendDebox } from "../../lib/debox.js";
import { pushInbox } from "../../lib/inbox.js";

const PREFIX = "ailgns-msg:", MAX = 300;
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const BAD = [/习近平|共产党|六四|法轮|台独|藏独|游行|革命/];
// 🛡️ 站长 2026-11-07：留言里禁止网址和联系方式（骗子靠这个把客户引到站外）。前端发之前也会拦，这里是兜底：绕过前端直接上链的，本站不显示、不通知
const CONTACT = /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|xyz|io|app|cc|top|vip|cn|me|link|site|online|shop|pro)\b|t\.me|微信|微信号|vx|wx|weixin|wechat|qq|扣扣|电报|telegram|tg|飞机|whatsapp|line\b|手机号|电话|加我|加一下|私聊|私信我|联系方式|联系我|\d{11}/i;
const hexBytes = (h) => new Uint8Array((h.replace(/^0x/, "").match(/../g) || []).map((x) => parseInt(x, 16)));

export function decodeMsg(input) {
  if (!input || input.length < 2 + PREFIX.length * 2) return null;
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(hexBytes(input));
    return s.startsWith(PREFIX) ? s.slice(PREFIX.length).slice(0, MAX) : null;
  } catch (e) { return null; }
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const a = (u.searchParams.get("a") || "").toLowerCase();
  if (!isAddr(a)) return json({ error: "地址格式不对" }, 400);
  const list = (await kv.get("msg:" + a, "json")) || [];
  return json({ list });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const h = String(b.tx || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(h)) return json({ error: "交易哈希不对" }, 400);
  if (await kv.get("msg:tx:" + h)) return json({ ok: true, dup: true });
  // 等链上确认（最多 ~40 秒）
  let tx = null, rc = null;
  for (let i = 0; i < 10 && !(tx && rc); i++) {
    if (i) await new Promise((r) => setTimeout(r, 4000));
    try { tx = tx || (await rpc("eth_getTransactionByHash", [h])); rc = await rpc("eth_getTransactionReceipt", [h]); } catch (e) { /* 再试 */ }
  }
  if (!tx) return json({ error: "链上还没查到这笔交易，稍后再试" }, 404);
  if (!rc) return json({ error: "交易还在确认中，稍后再试" }, 202);
  if (rc.status !== "0x1") return json({ error: "这笔交易失败了" }, 400);
  const from = String(tx.from || "").toLowerCase(), to = String(tx.to || "").toLowerCase(), txt = decodeMsg(tx.input);
  if (!isAddr(to) || !txt) return json({ error: "这不是一条留言交易" }, 400);
  if (BAD.some((r) => r.test(txt))) return json({ error: "留言里有不允许的内容" }, 400);
  if (CONTACT.test(txt)) return json({ error: "留言里不能有网址或联系方式（微信、QQ、电报、手机号等）。为了防骗，所有交流只在链上进行" }, 400);
  const [fromName, toName] = await Promise.all([primaryName(from).catch(() => ""), primaryName(to).catch(() => "")]);
  if (!fromName) return json({ error: "只有设了 .ailgns 主名字的钱包才能发信" }, 403);
  const blk = await rpc("eth_getBlockByNumber", [rc.blockNumber, false]).catch(() => null);
  const item = { tx: h, from, to, fromName, toName, txt, t: blk ? parseInt(blk.timestamp, 16) * 1000 : Date.now() };
  for (const a of new Set([from, to])) {
    const list = ((await kv.get("msg:" + a, "json")) || []).filter((x) => x.tx !== h);
    list.unshift(item);
    await kv.put("msg:" + a, JSON.stringify(list.slice(0, 200)));
  }
  await kv.put("msg:tx:" + h, "1", { expirationTtl: 400 * 86400 });
  // 收信人绑了 DeBox 机器人就私信他
  const users = (await kv.get("dbx:a:" + to, "json")) || [];
  // 🛡️ 防骗：留言里有网址、钱包地址、要私钥/助记词/转账这类词，通知里打醒目提示（留言照样送达，不替客户做判断）
  const risky = /https?:\/\/|www\.|\.(com|net|org|xyz|io|app|cc|top|vip)\b|0x[0-9a-f]{40}|私钥|助记词|密码|验证码|转账|打款|汇款|空投|领取|返利|客服|官方|解冻|升级账户|保证金|手续费先/i.test(txt);
  const warn = risky ? "\n\n⚠️ 这条留言里有网址 / 地址 / 要你转账或给密钥之类的内容。记住：本站从不私信要你转账、私钥、助记词或验证码；任何「官方客服」「空投领取」「账户解冻」都是骗子。不点陌生链接，不给任何人转钱。" : "";
  // 没有 .ailgns 主名字的收信人回不了信：多一句怎么注册（只对这类人说，有名字的一个字不加）
  const tip = toName ? "" : "\n\n你还没有 .ailgns 名字，回不了信：5 DAI 起注册一个 👉 https://ailgns.dev/#/names ，顺便就能免费玩预言家。";
  const text = "📬 " + fromName + " 在链上给你留言：\n\n" + txt + warn + "\n\n回复 👉 https://ailgns.dev/#/scan/" + from + tip;
  await pushInbox(kv, to, "msg", text, "#/scan/" + from).catch(() => {}); // 🔔 站内信
  if (users.length) {
    ctx.waitUntil(Promise.all(users.map((u) => sendDebox(ctx.env, u, text, "private").catch(() => {}))));
  }
  return json({ ok: true, item, notified: users.length });
}
