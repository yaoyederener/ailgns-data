// 💬 预言家页面弹幕：连钱包签名发言（不花钱），显示主名字（没有就短地址）
// GET → { list: [{ id, name, txt, t }] }（最近 80 条）
// POST { a, txt, ts, sig } → 发一条；30 秒一条；1–30 个字；过滤链接、联系方式、地址、敏感词
// GET ?del=<id>&key=BACKUP_KEY → 删除一条（站长用）
import { recoverAddress } from "../../lib/evmsig.js";
import { primaryName, openRound, prevDay, drawStart } from "../../lib/oracle.js";

const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const dmText = (txt, ts, a) => "AiLGNS 弹幕\n" + txt + "\n时间：" + ts + "\n地址：" + a; // 和前端 oracle.js 一字不差
const BAD = [/https?:|www\.|\.com|\.cn|\.top|t\.me|telegram/i, /0x[0-9a-f]{6,}/i, /\d{7,}/, /微信|vx|v信|qq|加我|私聊|电报|飞机号|扣扣/i,
  /习近平|共产党|六四|法轮|台独|藏独|政府|游行|革命/, /诈骗|骗子|跑路|割韭菜|传销|资金盘|庞氏|退钱|报警/, /操你|傻逼|妈的|草泥马|fuck|shit|贱/i];

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  const del = u.searchParams.get("del");
  if (del) {
    if (!ctx.env.BACKUP_KEY || u.searchParams.get("key") !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
    const list = ((await kv.get("dm:list", "json")) || []).filter((x) => x.id !== del);
    await kv.put("dm:list", JSON.stringify(list));
    return json({ ok: true, n: list.length });
  }
  // 站长 2026-11-07：弹幕每期清一次——只显示本期开放（上一期揭晓 21:00）之后发的，开奖后自然重新开始；老弹幕仍留在 KV 里不删
  const since = drawStart(prevDay(openRound(Date.now())));
  const list = ((await kv.get("dm:list", "json")) || []).filter((x) => x.t >= since).slice(-80).map((x) => ({ id: x.id, name: x.name, txt: x.txt, t: x.t }));
  return Response.json({ list, since }, { headers: { "cache-control": "public, max-age=5" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const a = String(b.a || "").toLowerCase(), txt = String(b.txt || "").replace(/\s+/g, " ").trim(), ts = Number(b.ts);
  if (!/^0x[0-9a-f]{40}$/.test(a)) return json({ error: "请先连接钱包" }, 400);
  if (!txt || Array.from(txt).length > 30) return json({ error: "弹幕 1–30 个字" }, 400);
  if (!(Math.abs(Date.now() - ts) < 300e3)) return json({ error: "时间不对，请刷新页面再发" }, 400);
  if (BAD.some((r) => r.test(txt))) return json({ error: "这条内容不能发（不能带链接、联系方式、地址或不文明的话）" }, 400);
  if (recoverAddress(dmText(txt, ts, a), String(b.sig || "")) !== a) return json({ error: "签名核对失败" }, 400);
  if (await kv.get("dm:rl:" + a)) return json({ error: "发得太快了，30 秒后再发" }, 400);
  await kv.put("dm:rl:" + a, "1", { expirationTtl: 60 });
  let name = "";
  try { name = await primaryName(a); } catch (e) { name = ""; }
  const it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), a, name: name || a.slice(0, 6) + "…" + a.slice(-4), txt, t: Date.now() };
  const list = ((await kv.get("dm:list", "json")) || []).concat(it).slice(-200);
  await kv.put("dm:list", JSON.stringify(list));
  return json({ ok: true, it: { id: it.id, name: it.name, txt: it.txt, t: it.t } });
}
