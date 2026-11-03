// 域名求购意向（不上链、不锁钱）：买家连钱包、签名证明是本人，钱包里 DAI 够「出价 + 3% 手续费」才能发
// 名字主人看到后按这个价挂单，买家再去市场买入（成交走现有托管合约，一手交钱一手交货）
// GET  → { list: [{ id, name, price, by, at, ok }] }  价格高的排前面，30 天过期；ok = 出价人现在 DAI 还够
// POST { name, price, by, day, sig }            → 发布（同一个人对同一个名字只留最新一条）
// POST { action: "cancel", id, by, day, sig }   → 出价人随时撤单
// DELETE ?id=…&key=BACKUP_KEY                   → 站长删掉不合适的
// 文字模板必须和 names.js 里的 wantText / cancelText 一字不差
import { recoverAddress } from "../../lib/evmsig.js";

const KEY = "nmwant:list", DAY = 86400000, KEEP = 30 * DAY, MAX = 300;
const NAME_RE = /^([a-z0-9一-鿿-]{2,40})\.(ailgns|lgns)$/;
const DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", RPC = "https://rpc.anubispace.org";
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(a || "");
const wantText = (name, price, by, day) => "AiLGNS 域名求购\n我想用 " + price + " DAI 买 " + name + "\n出价地址：" + by + "\n日期：" + day;
const cancelText = (id, by, day) => "AiLGNS 域名求购撤单\n撤销求购 " + id + "\n出价地址：" + by + "\n日期：" + day;
const need = (price) => price * 1.03; // 买入时还要另付 3% 手续费

async function load(kv) {
  let l = [];
  try { l = JSON.parse((await kv.get(KEY)) || "[]"); } catch (e) { l = []; }
  const now = Date.now();
  return l.filter((x) => now - x.at < KEEP && x.by);
}
const sorted = (l) => l.slice().sort((a, b) => b.price - a.price || a.at - b.at);
const pub = (l) => l.map(({ ip: _ip, ...x }) => x);

// 钱包里的 DAI（单位：个），KV 缓存 5 分钟，避免每次打开都查一遍链
async function daiOf(kv, a, fresh) {
  const ck = "nmwant:bal:" + a;
  if (!fresh) { const c = await kv.get(ck); if (c !== null) return Number(c); }
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: DAI, data: "0x70a08231" + a.slice(2).padStart(64, "0") }, "latest"] }) });
  const j = await r.json();
  if (!j.result) throw new Error("查余额失败");
  const v = Number(BigInt(j.result) / 10n ** 14n) / 1e4;
  await kv.put(ck, String(v), { expirationTtl: 300 });
  return v;
}
function dayOk(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && Math.abs(Date.parse(day + "T00:00:00+08:00") - Date.now()) <= 2 * DAY; }

export async function onRequestGet(ctx) {
  const kv = ctx.env.TEAM_KV;
  if (!kv) return new Response("no kv", { status: 503 });
  const l = sorted(await load(kv)), bal = {};
  await Promise.all([...new Set(l.map((x) => x.by))].map(async (a) => { try { bal[a] = await daiOf(kv, a); } catch (e) { bal[a] = null; } }));
  return Response.json({ list: pub(l).map((x) => ({ ...x, ok: bal[x.by] === null ? true : bal[x.by] >= need(x.price) })) }, { headers: { "cache-control": "no-store" } });
}

export async function onRequestPost(ctx) {
  const kv = ctx.env.TEAM_KV, req = ctx.request;
  if (!kv) return new Response("no kv", { status: 503 });
  let b = {};
  try { b = await req.json(); } catch (e) { return Response.json({ error: "格式不对" }, { status: 400 }); }
  const by = String(b.by || "").trim().toLowerCase(), day = String(b.day || ""), sig = String(b.sig || "");
  if (!isAddr(by)) return Response.json({ error: "请先连接钱包" }, { status: 400 });
  if (!dayOk(day)) return Response.json({ error: "签名已过期，请重新签" }, { status: 400 });

  if (b.action === "cancel") {
    const id = String(b.id || "");
    if (recoverAddress(cancelText(id, by, day), sig) !== by) return Response.json({ error: "签名核对失败：请用出价的钱包签名" }, { status: 400 });
    let l = await load(kv);
    if (!l.some((x) => x.id === id && x.by === by)) return Response.json({ error: "找不到这条求购（可能已经撤过了）" }, { status: 404 });
    l = l.filter((x) => !(x.id === id && x.by === by));
    await kv.put(KEY, JSON.stringify(l));
    return Response.json({ ok: true });
  }

  const name = String(b.name || "").trim().toLowerCase(), price = Math.round(Number(b.price) * 100) / 100;
  if (!NAME_RE.test(name)) return Response.json({ error: "域名格式不对，例如 发财.ailgns" }, { status: 400 });
  if (!(price >= 1 && price <= 10000000)) return Response.json({ error: "出价要在 1 到 10,000,000 DAI 之间" }, { status: 400 });
  if (recoverAddress(wantText(name, price, by, day), sig) !== by) return Response.json({ error: "签名核对失败：请用出价的钱包签名" }, { status: 400 });
  // 防刷：同一个地址一小时最多 6 条
  const rk = "nmwant:rl:" + by, n = Number((await kv.get(rk)) || 0);
  if (n >= 6) return Response.json({ error: "发得太频繁了，过一小时再来" }, { status: 429 });
  let have;
  try { have = await daiOf(kv, by, true); } catch (e) { return Response.json({ error: "查不到钱包余额，请稍后再试" }, { status: 502 }); }
  if (have < need(price)) return Response.json({ error: "钱包里 DAI 不够：出价 " + price + " + 3% 手续费 = " + (Math.ceil(need(price) * 100) / 100) + " DAI，你现在只有 " + have + " DAI（活期/质押里的不算）" }, { status: 400 });
  await kv.put(rk, String(n + 1), { expirationTtl: 3600 });
  let l = (await load(kv)).filter((x) => !(x.name === name && x.by === by));
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  l.push({ id, name, price, by, at: Date.now() });
  l = sorted(l).slice(0, MAX);
  await kv.put(KEY, JSON.stringify(l));
  return Response.json({ ok: true, id });
}

export async function onRequestDelete(ctx) {
  const kv = ctx.env.TEAM_KV, u = new URL(ctx.request.url);
  if (!kv) return new Response("no kv", { status: 503 });
  if (!ctx.env.BACKUP_KEY || u.searchParams.get("key") !== ctx.env.BACKUP_KEY) return new Response("forbidden", { status: 403 });
  const id = u.searchParams.get("id");
  const l = (await load(kv)).filter((x) => x.id !== id);
  await kv.put(KEY, JSON.stringify(l));
  return Response.json({ ok: true, n: l.length });
}
