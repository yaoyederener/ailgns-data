// 🛡 互助保障接口（站长 2026-11-23 定，规则在 lib/cover.js）
//   GET  /api/cover[?a=钱包]            → { rules, open, pool: { addr, bal }, members, budget, claims: [公示], me: 我的保单 }
//   POST { action: "join", a, backup, ts, sig, tx }  → 核对签名（登记备用收款钱包）+ 核对这笔保费到账 → 记保单 / 续保
//   POST { action: "claim_add" | "claim_set" | "settle", key: 站长口令, … } → 站长登记理赔 / 改状态 / 算月度结算（只算不转钱）
// 没有新合约、接口不碰任何人的钱：保费是客户自己转进保障池钱包；理赔由站长核对后从保障池钱包手动打款。
import { COVER, policyOf, claimCheck, settle, bindText } from "../../lib/cover.js";
import { RPCS } from "../../lib/teamlib.js";
import { recoverAddress } from "../../lib/evmsig.js";
import { pushInbox } from "../../lib/inbox.js";
import { alertOwner } from "../../lib/alert.js";

const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const IDX = "cover:idx", CLAIMS = "cover:claims";
const low = (s) => String(s || "").toLowerCase();
const isAddr = (s) => /^0x[0-9a-f]{40}$/.test(low(s));
const isTx = (s) => /^0x[0-9a-f]{64}$/.test(low(s));
const pad = (a) => "0x" + low(a).replace("0x", "").padStart(64, "0");
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}
const poolBal = async () => (COVER.pool ? Number(BigInt(await rpc("eth_getBalance", [COVER.pool, "latest"])) / 10n ** 14n) / 1e4 : 0);
// 给客户看的保单：不带交易明细里用不上的东西；备用钱包只露头尾
function view(p) {
  if (!p) return null;
  const st = policyOf(p.pays), b = low(p.backup);
  return { ...st, backup: b ? b.slice(0, 8) + "…" + b.slice(-6) : "", paid: p.pays.reduce((s, x) => s + x.amt, 0), closed: !!p.closed };
}
const pub = (c) => ({ id: c.id, a: c.a, kind: c.kind, loss: c.loss, cap: c.cap === null ? null : c.cap, status: c.status, t: c.t, when: c.when, noticeUntil: c.noticeUntil, pay: c.pay || 0, payTx: c.payTx || "", txs: (c.txs || []).slice(0, 5), note: c.note || "" });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), a = low(u.searchParams.get("a")), kv = env.TEAM_KV;
  const rules = { fee: COVER.fee, waitDays: COVER.waitDays, tiers: COVER.tiers, monthBudget: COVER.monthBudget, reportHours: COVER.reportHours, noticeDays: COVER.noticeDays, graceDays: COVER.graceDays };
  const base = { rules, open: !!COVER.pool, pool: { addr: COVER.pool, bal: null }, dai: COVER.dai, members: 0, budget: null, claims: [], me: null };
  if (COVER.pool) { try { base.pool.bal = await poolBal(); base.budget = Math.floor(base.pool.bal * COVER.monthBudget * 100) / 100; } catch (e) { /* 余额读不到就不显示 */ } }
  if (!kv) return J({ ...base, noKv: true });
  const [idx, claims] = await Promise.all([kv.get(IDX, "json"), kv.get(CLAIMS, "json")]);
  base.members = (idx || []).length;
  base.claims = (claims || []).slice(0, 50).map(pub);
  if (isAddr(a)) base.me = view(await kv.get("cover:p:" + a, "json"));
  return J(base);
}

async function join(kv, b) {
  if (!COVER.pool) return J({ ok: false, error: "保障池钱包还在准备，暂时不能加入" }, 503);
  const a = low(b.a), backup = low(b.backup), tx = low(b.tx), ts = Number(b.ts) || 0;
  if (!isAddr(a) || !isTx(tx)) return J({ ok: false, error: "缺少钱包地址或交易号" }, 400);
  const key = "cover:p:" + a, old = await kv.get(key, "json");
  if (old && old.closed) return J({ ok: false, error: "这个钱包已经赔过一次，不能再加入。请换一个钱包" });
  // 第一次加入要登记备用收款钱包（签名，不花钱）；续保沿用原来的，不能在这里改
  let bk = old && old.backup;
  if (!bk) {
    if (!isAddr(backup) || backup === a) return J({ ok: false, error: "请填一个备用收款钱包地址（不能和加入的钱包相同）" });
    if (!(Math.abs(Date.now() - ts) < 3600e3)) return J({ ok: false, error: "签名过期了，请重新点一次「加入」" });
    let who = ""; try { who = low(recoverAddress(bindText(a, backup, ts), String(b.sig || ""))); } catch (e) { who = ""; }
    if (who !== a) return J({ ok: false, error: "签名不对：要用加入的那个钱包签名" });
    bk = backup;
  }
  if (await kv.get("cover:tx:" + tx)) return J({ ok: true, me: view(old), again: true });
  let rc, blk;
  try { rc = await rpc("eth_getTransactionReceipt", [tx]); if (rc) blk = await rpc("eth_getBlockByNumber", [rc.blockNumber, false]); } catch (e) { return J({ ok: false, error: "读链失败，请过一会儿再点一次（不会多收费）" }, 502); }
  if (!rc || rc.status !== "0x1" || !blk) return J({ ok: false, error: "这笔保费还没在链上确认，过一会儿再点一次（不会多收费）" });
  let paid = 0n;
  for (const l of rc.logs || []) if (low(l.address) === low(COVER.dai) && l.topics && l.topics[0] === T_XFER && low(l.topics[1]) === pad(a) && low(l.topics[2]) === pad(COVER.pool)) paid += BigInt(l.data);
  const amt = Number(paid / 10n ** 14n) / 1e4;
  if (amt < COVER.fee) return J({ ok: false, error: "这笔交易里没有查到从你钱包转给保障池的 " + COVER.fee + " DAI" });
  const p = old || { a, pays: [], at: Date.now() };
  p.backup = bk;
  p.pays.push({ tx, t: parseInt(blk.timestamp, 16) * 1000, amt });
  await kv.put(key, JSON.stringify(p));
  await kv.put("cover:tx:" + tx, a);
  const idx = (await kv.get(IDX, "json")) || [];
  if (idx.indexOf(a) < 0) { idx.push(a); await kv.put(IDX, JSON.stringify(idx)); }
  const st = policyOf(p.pays);
  try { await pushInbox(kv, a, "sys", "🛡 你已加入互助保障，保障到 " + new Date(st.until + 8 * 3600e3).toISOString().slice(0, 10) + "。被盗保障 " + COVER.waitDays + " 天后生效；出事请在 " + COVER.reportHours + " 小时内提工单。提醒：以保障池余额为限，可能按比例赔付。", "#/cover"); } catch (e) { /* 通知失败不影响加入 */ }
  return J({ ok: true, me: view(p) });
}

async function admin(env, kv, b) {
  if (!b.key || !env.FEEDBACK_KEY || b.key !== env.FEEDBACK_KEY) return J({ error: "口令不对" }, 403);
  const claims = (await kv.get(CLAIMS, "json")) || [];
  if (b.action === "claim_add") { // 站长看过工单和链上记录后登记：进入 7 天公示
    const a = low(b.a), kind = b.kind === "fault" ? "fault" : "theft", loss = Number(b.loss) || 0, when = Number(b.when) || 0, reported = Number(b.reported) || Date.now();
    if (!isAddr(a) || !(loss > 0) || !(when > 0)) return J({ ok: false, error: "要填钱包、损失金额、出事时间" }, 400);
    const p = await kv.get("cover:p:" + a, "json"), ck = claimCheck(p, kind, when, reported);
    if (!ck.ok && !b.force) return J({ ok: false, error: ck.why });
    const c = { id: Date.now().toString(36), a, kind, loss, cap: kind === "fault" ? null : ck.cap || 0, when, reported, t: Date.now(), status: "notice", noticeUntil: Date.now() + COVER.noticeDays * 86400e3, txs: (b.txs || []).filter(isTx).map(low), note: String(b.note || "").slice(0, 200), backup: p ? p.backup : "" };
    claims.unshift(c); await kv.put(CLAIMS, JSON.stringify(claims.slice(0, 500)));
    try { await pushInbox(kv, a, "sys", "🛡 你的互助保障理赔已受理，公示 " + COVER.noticeDays + " 天后进入当月结算。", "#/cover"); } catch (e) { /* 忽略 */ }
    return J({ ok: true, claim: c });
  }
  if (b.action === "claim_set") { // 改状态：approved（公示期过、通过）/ rejected / paid（打款后填金额和交易号，并把这个钱包标成已赔过）
    const c = claims.find((x) => x.id === b.id);
    if (!c) return J({ ok: false, error: "没有这条理赔" }, 404);
    if (["notice", "approved", "rejected", "paid"].indexOf(b.status) < 0) return J({ ok: false, error: "状态不对" }, 400);
    c.status = b.status; if (b.note) c.note = String(b.note).slice(0, 200);
    if (b.status === "paid") {
      c.pay = Number(b.pay) || 0; c.payTx = isTx(b.payTx) ? low(b.payTx) : ""; c.paidAt = Date.now();
      const p = await kv.get("cover:p:" + c.a, "json"); if (p) { p.closed = Date.now(); await kv.put("cover:p:" + c.a, JSON.stringify(p)); }
      try { await pushInbox(kv, c.a, "sys", "🛡 互助保障理赔款 " + c.pay + " DAI 已打到你登记的备用收款钱包。这个钱包已赔过一次，不再受保。", "#/cover"); } catch (e) { /* 忽略 */ }
    }
    await kv.put(CLAIMS, JSON.stringify(claims));
    return J({ ok: true, claim: c });
  }
  if (b.action === "settle") { // 只算不转：把「已通过、还没打款」的理赔按现在的池子余额算出每人该打多少、打到哪个备用钱包
    const due = claims.filter((x) => x.status === "approved");
    const s = settle(await poolBal(), due.map((x) => ({ id: x.id, kind: x.kind, loss: x.loss, cap: x.cap || 0 })));
    return J({ ok: true, ...s, rows: s.rows.map((r) => { const c = due.find((x) => x.id === r.id); return { ...r, a: c.a, to: c.backup }; }) });
  }
  return J({ ok: false, error: "不认识的操作" }, 400);
}

export async function onRequestPost({ request, env }) {
  const kv = env.TEAM_KV;
  if (!kv) return J({ ok: false, error: "没有存储，暂时不能用" }, 503);
  let b; try { b = await request.json(); } catch (e) { return J({ ok: false, error: "请求格式不对" }, 400); }
  if (b.action === "join") {
    const r = await join(kv, b);
    try { const j = await r.clone().json(); if (j.ok && !j.again) await alertOwner(env, kv, "cover:" + low(b.tx), 86400, "🛡 有人加入互助保障，保费 " + COVER.fee + " DAI 已进保障池。", "#/cover", true); } catch (e) { /* 提醒失败不影响加入 */ }
    return r;
  }
  return admin(env, kv, b);
}
