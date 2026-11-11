// ⭐ 域名挂单付费置顶：卖家把 DAI 转进回购分账合约（和域名收入一起分账），可选 3 / 7 / 30 / 90 天（时间越长起步价越高），出得多的排前面；没卖掉也不退
// GET → { pins: [{ t, id, amt, exp }] }（只给还没到期的，amt 大的在前）
// POST { tx, t, id, days } → 核对这笔转账：DAI、转给 BUYBACK、从挂单卖家钱包转出、至少 MIN；同一笔交易只能用一次
// 同一张单再付：金额累加，到期时间 = 现在 + 这次选的天数，但只会延后不会缩短
// days 没传（老页面）按 3 天；付的钱不够所选档位的起步价，就给这笔钱够得上的最长一档（钱已经付了，不能拒收）
import { rpc } from "../../lib/oracle.js";

const DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", BUYBACK = "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3";
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const O = { ailgns: "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e", lgns: "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d" };
const TIERS = [{ d: 3, min: 10 }, { d: 7, min: 20 }, { d: 30, min: 80 }, { d: 90, min: 200 }]; // 天数从短到长、起步价从低到高
const PIN_MIN = TIERS[0].min, PIN_DAYS = TIERS[0].d;
const json = (o, s) => Response.json(o, { status: s || 200, headers: { "cache-control": "no-store" } });
const u256 = (n) => BigInt(n).toString(16).padStart(64, "0");

async function active(kv) {
  const now = Date.now(), all = (await kv.get("nm:pins", "json")) || [];
  return all.filter((p) => p.exp > now);
}

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const pins = (await active(kv)).sort((a, b) => b.amt - a.amt || a.at - b.at).map((p) => ({ t: p.t, id: p.id, amt: p.amt, exp: p.exp }));
  return Response.json({ pins, min: PIN_MIN, days: PIN_DAYS, tiers: TIERS }, { headers: { "cache-control": "public, max-age=10" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await ctx.request.json(); } catch (e) { return json({ error: "格式不对" }, 400); }
  const tx = String(b.tx || "").toLowerCase(), t = String(b.t || ""), id = Number(b.id);
  if (!/^0x[0-9a-f]{64}$/.test(tx) || !O[t] || !Number.isInteger(id) || id < 0) return json({ error: "参数不对" }, 400);
  if (await kv.get("nm:pintx:" + tx)) return json({ error: "这笔付款已经用过了" }, 400);
  let rc, ord;
  try {
    rc = await rpc("eth_getTransactionReceipt", [tx]);
    ord = (await rpc("eth_call", [{ to: O[t], data: "0x8f72fc77" + u256(id) + u256(1) }, "latest"])).slice(2).match(/.{64}/g) || [];
  } catch (e) { return json({ error: "读链失败，请稍后再试（钱已付的不会丢，刷新后重新打开「我的挂单」会自动补登记）" }, 400); }
  if (!rc || rc.status !== "0x1") return json({ error: "这笔交易没有成功" }, 400);
  if (Number(BigInt("0x" + (ord[1] || "0"))) !== 1) return json({ error: "找不到这张挂单" }, 400);
  const o = ord.slice(2, 8), maker = "0x" + o[0].slice(24);
  if (o[1].slice(-1) !== "1" || o[2].slice(-1) !== "1" || Number(BigInt("0x" + o[3])) * 1000 < Date.now()) return json({ error: "这张挂单已经卖掉 / 撤单 / 过期了" }, 400);
  let wei = 0n;
  for (const l of rc.logs || []) {
    if (l.address.toLowerCase() === DAI && l.topics[0] === T_TRANSFER && "0x" + l.topics[1].slice(26) === maker && "0x" + l.topics[2].slice(26) === BUYBACK) wei += BigInt(l.data);
  }
  const amt = Number(wei / 10n ** 16n) / 100;
  if (amt < PIN_MIN) return json({ error: "置顶费至少 " + PIN_MIN + " DAI，并且要从挂单的卖家钱包付" }, 400);
  const want = Number(b.days) || PIN_DAYS, tier = TIERS.filter((x) => x.d <= want && x.min <= amt).pop() || TIERS[0];
  await kv.put("nm:pintx:" + tx, "1"); // 永久记着，防止置顶到期后拿同一笔付款再登记一次
  const now = Date.now(), all = await active(kv);
  let p = all.find((x) => x.t === t && x.id === id);
  const exp = now + tier.d * 86400e3;
  if (p) { p.amt = Math.round((p.amt + amt) * 100) / 100; p.exp = Math.max(p.exp, exp); p.txs.push(tx); }
  else all.push(p = { t, id, maker, amt, at: now, exp, txs: [tx] });
  await kv.put("nm:pins", JSON.stringify(all));
  return json({ ok: true, amt: p.amt, exp: p.exp, days: tier.d, rank: all.sort((a, b) => b.amt - a.amt || a.at - b.at).indexOf(p) + 1 });
}
