// 🏛️ 链上广场（2026-11-07 站长定：按全球最火的玩法 = 名字身份 + 盖楼 + 帖子能做事；放在「链上身份」里，不宣传，不碰合约）
// 发帖 / 回帖 = 一笔 0 元交易，文字放在 data 里（前缀 ailgns-post:，后面是 JSON）；只花 Gas，永久上链。只有设了 .ailgns 主名字的钱包能发。
//   POST { tx }           → 读链核对（前缀、发帖人主名字、交易成功），存进广场索引
//   GET  ?list=1          → 主帖列表（新的在前，最多 200），时间胶囊到期前只给「锁」不给正文
//   GET  ?p=<tx>          → 一个帖子 + 全部楼层
// 帖子 JSON：{ t: 正文, re: 回的哪条(交易哈希), at: 时间胶囊揭晓时间(毫秒), o: { m: 市场, id: 单号 }, k: "pred"|"iou" }
// KV：sq:list 主帖 [tx…]；sq:p:<tx> 帖子；sq:re:<tx> 楼层 [tx…]
import { rpc, primaryName } from "../../lib/oracle.js";

const PREFIX = "ailgns-post:", MAX = 300, MARKETS = { ailgns: 1, lgns: 1, glgns: 1, plgns: 1, nft: 1 };
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const BAD = /习近平|共产党|六四|法轮|台独|藏独|游行|革命/;
const CONTACT = /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|xyz|io|app|cc|top|vip|cn|me|link|site|online|shop|pro)\b|t\.me|微信|微信号|vx|wx|weixin|wechat|qq|扣扣|电报|telegram|tg|飞机|whatsapp|line\b|手机号|电话|加我|加一下|私聊|私信我|联系方式|联系我|\d{11}/i;
const hexBytes = (h) => new Uint8Array((h.replace(/^0x/, "").match(/../g) || []).map((x) => parseInt(x, 16)));
function decode(input) {
  if (!input || input.length < 2 + PREFIX.length * 2) return null;
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(hexBytes(input));
    if (!s.startsWith(PREFIX)) return null;
    const j = JSON.parse(s.slice(PREFIX.length));
    const out = { t: String(j.t || "").slice(0, MAX).trim() };
    if (/^0x[0-9a-f]{64}$/i.test(String(j.re || ""))) out.re = String(j.re).toLowerCase();
    if (Number.isFinite(Number(j.at)) && Number(j.at) > Date.now() - 86400e3 && Number(j.at) < Date.now() + 10 * 365 * 86400e3) out.at = Math.round(Number(j.at));
    if (j.o && MARKETS[j.o.m] && Number.isInteger(Number(j.o.id)) && Number(j.o.id) >= 0) out.o = { m: j.o.m, id: Number(j.o.id) };
    if (j.k === "pred" || j.k === "iou") out.k = j.k;
    return out.t ? out : null;
  } catch (e) { return null; }
}
const pub = (p) => (p.at && p.at > Date.now() ? Object.assign({}, p, { t: "", locked: true }) : p); // 时间胶囊：到期前不给正文

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return json({ error: "no kv" }, 503);
  const p = (u.searchParams.get("p") || "").toLowerCase();
  if (/^0x[0-9a-f]{64}$/.test(p)) {
    const root = await kv.get("sq:p:" + p, "json");
    if (!root) return json({ error: "没有这个帖子" }, 404);
    const ids = (await kv.get("sq:re:" + p, "json")) || [];
    const replies = (await Promise.all(ids.slice(0, 300).map((id) => kv.get("sq:p:" + id, "json")))).filter(Boolean).map(pub);
    return json({ root: pub(root), replies });
  }
  const ids = ((await kv.get("sq:list", "json")) || []).slice(0, 60);
  const list = (await Promise.all(ids.map((id) => kv.get("sq:p:" + id, "json")))).filter(Boolean).map(pub);
  return json({ list, total: ((await kv.get("sq:list", "json")) || []).length });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return json({ error: "no kv" }, 503);
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  const h = String(b.tx || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(h)) return json({ error: "交易哈希不对" }, 400);
  if (await kv.get("sq:p:" + h)) return json({ ok: true, dup: true, item: await kv.get("sq:p:" + h, "json") });
  let tx = null, rc = null;
  for (let i = 0; i < 10 && !(tx && rc); i++) {
    if (i) await new Promise((r) => setTimeout(r, 4000));
    try { tx = tx || (await rpc("eth_getTransactionByHash", [h])); rc = await rpc("eth_getTransactionReceipt", [h]); } catch (e) { /* 再试 */ }
  }
  if (!tx) return json({ error: "链上还没查到这笔交易，稍后再试" }, 404);
  if (!rc) return json({ error: "交易还在确认中，稍后再试" }, 202);
  if (rc.status !== "0x1") return json({ error: "这笔交易失败了" }, 400);
  const from = String(tx.from || "").toLowerCase(), d = decode(tx.input);
  if (!d) return json({ error: "这不是一条广场帖子" }, 400);
  if (BAD.test(d.t)) return json({ error: "帖子里有不允许的内容" }, 400);
  if (CONTACT.test(d.t)) return json({ error: "帖子里不能有网址或联系方式（微信、QQ、电报、手机号等）。所有交流只在链上进行" }, 400);
  const name = await primaryName(from).catch(() => "");
  if (!name) return json({ error: "只有设了 .ailgns 主名字的钱包才能发帖" }, 403);
  const blk = await rpc("eth_getBlockByNumber", [rc.blockNumber, false]).catch(() => null);
  const item = Object.assign({ tx: h, from, name, time: blk ? parseInt(blk.timestamp, 16) * 1000 : Date.now(), n: 0 }, d);
  if (item.re) {
    const parent = await kv.get("sq:p:" + item.re, "json");
    if (!parent) return json({ error: "回的那条帖子不存在" }, 400);
    const ids = ((await kv.get("sq:re:" + item.re, "json")) || []).filter((x) => x !== h);
    ids.push(h);
    await kv.put("sq:re:" + item.re, JSON.stringify(ids.slice(0, 500)));
    parent.n = ids.length; parent.last = item.time;
    await kv.put("sq:p:" + item.re, JSON.stringify(parent));
    item.floor = ids.length + 1; // 楼主是 1 楼
  } else {
    const list = ((await kv.get("sq:list", "json")) || []).filter((x) => x !== h);
    list.unshift(h);
    await kv.put("sq:list", JSON.stringify(list.slice(0, 500)));
  }
  await kv.put("sq:p:" + h, JSON.stringify(item));
  return json({ ok: true, item: pub(item) });
}
