// 🛡 互助保障接口（站长 2026-11-23 定，规则在 lib/cover.js）
//   GET  /api/cover[?a=钱包]            → { rules, open, pool: { addr, bal }, members, budget, claims: [公示], me: 我的保单 }
//   POST { action: "join", a, backup, ts, sig, tx }  → 核对签名（登记备用收款钱包）+ 核对这笔保费到账 → 记保单 / 续保
//   POST { action: "vote", a, id, v: "y" | "n", ts, sig } → 成员给公示中的理赔投票（签名，不花钱）
//   POST { action: "claim_add" | "claim_set" | "settle" | "ops_paid", key: 站长口令, … } → 站长登记理赔 / 改状态 / 算月度结算（只算不转钱）/ 记一笔已转走的运营费
// 没有新合约、接口不碰任何人的钱：保费是客户自己转进保障池钱包；理赔由站长核对后从保障池钱包手动打款。
import { COVER, policyOf, claimCheck, settle, bindText, netPool, canVote, tally, voteText } from "../../lib/cover.js";
import { RPCS } from "../../lib/teamlib.js";
import { recoverAddress } from "../../lib/evmsig.js";
import { pushInbox } from "../../lib/inbox.js";
import { alertOwner } from "../../lib/alert.js";

const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const IDX = "cover:idx", CLAIMS = "cover:claims", SUM = "cover:sum"; // SUM = { prem: 收到的保费累计, ops: 已经转走的运营费累计 }
const VP = (id) => "cover:v:" + id + ":"; // 每张票单独一条（cover:v:<理赔>:<钱包>，票写在 metadata 里），免得两个人同时投互相盖掉
async function votesOf(kv, id) {
  const out = {}, pre = VP(id);
  let cursor;
  do { const p = await kv.list({ prefix: pre, cursor }); for (const k of p.keys) { const v = k.metadata && k.metadata.v; if (v === "y" || v === "n") out[k.name.slice(pre.length)] = v; } cursor = p.list_complete ? null : p.cursor; } while (cursor);
  return out;
}
// 公示中的理赔：读最新的票；投票期过了有结果的，当场改成通过 / 没通过（返回 true = 改过，要存）
async function refresh(kv, c, now) {
  if (c.status !== "notice" || c.voted) return false;
  if ((c.elig || 0) < COVER.voteMin) return false;
  c.votes = await votesOf(kv, c.id);
  const t = tally(c, now);
  if (t.state === "yes" || t.state === "no") {
    c.voted = t.state; c.status = t.state === "yes" ? "approved" : "rejected"; c.votedAt = now;
    try { await pushInbox(kv, c.a, "sys", t.state === "yes" ? "🛡 你的互助保障理赔投票通过了（赞成 " + t.yes + "、反对 " + t.no + "），进入当月结算。" : "🛡 你的互助保障理赔投票没有通过（赞成 " + t.yes + "、反对 " + t.no + "）。", "#/cover"); } catch (e) { /* 忽略 */ }
    return true;
  }
  if (t.state === "low" && !c.lowAt) { c.lowAt = now; return true; } // 投票的人不够：留在公示里，等团队核对
  return false;
}
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
const pub = (c, now) => ({ id: c.id, a: c.a, kind: c.kind, loss: c.loss, cap: c.cap === null ? null : c.cap, status: c.status, t: c.t, when: c.when, noticeUntil: c.noticeUntil, pay: c.pay || 0, payTx: c.payTx || "", txs: (c.txs || []).slice(0, 5), note: c.note || "", vote: tally(c, now), voted: c.voted || "" });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), a = low(u.searchParams.get("a")), kv = env.TEAM_KV;
  const rules = { fee: COVER.fee, waitDays: COVER.waitDays, tiers: COVER.tiers, monthBudget: COVER.monthBudget, reportHours: COVER.reportHours, noticeDays: COVER.noticeDays, graceDays: COVER.graceDays, opsShare: COVER.opsShare, voteMin: COVER.voteMin, voteQuorum: COVER.voteQuorum };
  const base = { rules, open: !!COVER.pool, pool: { addr: COVER.pool, bal: null }, dai: COVER.dai, members: 0, budget: null, claims: [], me: null };
  let raw = null;
  if (COVER.pool) { try { raw = await poolBal(); } catch (e) { /* 余额读不到就不显示 */ } }
  const setBal = (sum) => { if (raw === null) return; const n = netPool(raw, sum && sum.prem, sum && sum.ops); base.pool.bal = n.net; base.pool.raw = raw; base.pool.opsDue = n.due; base.budget = Math.floor(n.net * COVER.monthBudget * 100) / 100; };
  if (!kv) { setBal(null); return J({ ...base, noKv: true }); }
  const [idx, claims0, sum] = await Promise.all([kv.get(IDX, "json"), kv.get(CLAIMS, "json"), kv.get(SUM, "json")]);
  setBal(sum);
  base.members = (idx || []).length;
  const claims = claims0 || [], now = Date.now();
  let dirty = false;
  for (const c of claims.slice(0, 50)) if (await refresh(kv, c, now)) dirty = true;
  if (dirty) await kv.put(CLAIMS, JSON.stringify(claims));
  const mine = isAddr(a) ? await kv.get("cover:p:" + a, "json") : null;
  base.claims = claims.slice(0, 50).map((c) => { const o = pub(c, now); if (isAddr(a)) { o.can = c.status === "notice" && o.vote.state === "open" && canVote(mine, a, c); o.my = (c.votes && c.votes[a]) || ""; } return o; });
  if (isAddr(a)) base.me = view(mine);
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
  { const sum = (await kv.get(SUM, "json")) || { prem: 0, ops: 0 }; sum.prem = Math.round(((sum.prem || 0) + amt) * 100) / 100; await kv.put(SUM, JSON.stringify(sum)); } // 保费累计：其中 10% 是运营费
  const idx = (await kv.get(IDX, "json")) || [];
  if (idx.indexOf(a) < 0) { idx.push(a); await kv.put(IDX, JSON.stringify(idx)); }
  const st = policyOf(p.pays);
  try { await pushInbox(kv, a, "sys", "🛡 你已加入互助保障，保障到 " + new Date(st.until + 8 * 3600e3).toISOString().slice(0, 10) + "。被盗保障 " + COVER.waitDays + " 天后生效；出事请在 " + COVER.reportHours + " 小时内提工单。提醒：以保障池余额为限，可能按比例赔付。", "#/cover"); } catch (e) { /* 通知失败不影响加入 */ }
  return J({ ok: true, me: view(p) });
}

// 成员投票：签一句话（不花钱）。只能投还在公示里、由投票决定的理赔；公示期内可以改
async function vote(kv, b) {
  const a = low(b.a), id = String(b.id || ""), v = b.v === "y" ? "y" : b.v === "n" ? "n" : "", ts = Number(b.ts) || 0;
  if (!isAddr(a) || !id || !v) return J({ ok: false, error: "投票内容不完整" }, 400);
  if (!(Math.abs(Date.now() - ts) < 3600e3)) return J({ ok: false, error: "签名过期了，请重新点一次" });
  let who = ""; try { who = low(recoverAddress(voteText(a, id, v, ts), String(b.sig || ""))); } catch (e) { who = ""; }
  if (who !== a) return J({ ok: false, error: "签名不对：要用你自己的钱包签名" });
  const claims = (await kv.get(CLAIMS, "json")) || [], c = claims.find((x) => x.id === id);
  if (!c) return J({ ok: false, error: "没有这条理赔" }, 404);
  const st = tally(c, Date.now()).state;
  if (c.status !== "notice" || c.voted || st === "low") return J({ ok: false, error: "这笔理赔的投票已经结束" });
  if (st === "team") return J({ ok: false, error: "加入的人还不够 " + COVER.voteMin + " 位，这一笔由团队核对，不用投票" });
  if (!canVote(await kv.get("cover:p:" + a, "json"), a, c)) return J({ ok: false, error: "这一笔你不能投票：要在它登记之前已经加入满 " + COVER.waitDays + " 天，申请人自己也不能投" });
  await kv.put(VP(id) + a, v, { metadata: { v, t: Date.now() } });
  return J({ ok: true, v });
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
    // 这一刻谁有资格投票（登记前被盗保障已生效、没被赔过、不是申请人）：人数定下来，之后才加入的不算
    const idx = (await kv.get(IDX, "json")) || [], ps = await Promise.all(idx.map((x) => kv.get("cover:p:" + x, "json")));
    const voters = idx.filter((x, i) => canVote(ps[i], x, c));
    c.elig = voters.length;
    const byVote = c.elig >= COVER.voteMin;
    claims.unshift(c); await kv.put(CLAIMS, JSON.stringify(claims.slice(0, 500)));
    try { await pushInbox(kv, a, "sys", "🛡 你的互助保障理赔已受理，进入 " + COVER.noticeDays + " 天公示。" + (byVote ? "期间由已加入的成员投票决定赔不赔。" : "加入的人还不够 " + COVER.voteMin + " 位，这一笔由团队核对决定。"), "#/cover"); } catch (e) { /* 忽略 */ }
    if (byVote) for (const x of voters.slice(0, 300)) { try { await pushInbox(kv, x, "sys", "🗳 互助保障有一笔理赔在公示，请你投票决定赔不赔（签名投票，不花钱），" + COVER.noticeDays + " 天内投都算数。", "#/cover"); } catch (e) { /* 忽略 */ } }
    return J({ ok: true, claim: c });
  }
  if (b.action === "claim_set") { // 改状态：approved（公示期过、通过）/ rejected / paid（打款后填金额和交易号，并把这个钱包标成已赔过）
    const c = claims.find((x) => x.id === b.id);
    if (!c) return J({ ok: false, error: "没有这条理赔" }, 404);
    if (["notice", "approved", "rejected", "paid"].indexOf(b.status) < 0) return J({ ok: false, error: "状态不对" }, 400);
    // 投票说了算：投票中不能提前判通过；投票没通过的不能改成通过；团队否决（投票中 / 投票通过后）要写公开的理由
    if ((c.elig || 0) >= COVER.voteMin) {
      c.votes = c.voted ? c.votes || {} : await votesOf(kv, c.id);
      const vs = c.voted || tally(c, Date.now()).state;
      if (b.status === "approved" && vs === "open") return J({ ok: false, error: "投票还没结束，不能提前改成通过" });
      if ((b.status === "approved" || b.status === "paid") && vs === "no") return J({ ok: false, error: "投票没通过的理赔不能改成通过" });
      if (b.status === "rejected" && (vs === "open" || vs === "yes") && !String(b.note || "").trim()) return J({ ok: false, error: "团队否决要写公开的理由" });
    }
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
    const sum = (await kv.get(SUM, "json")) || { prem: 0, ops: 0 }, n = netPool(await poolBal(), sum.prem, sum.ops); // 先留出还没转走的运营费，剩下的才是能赔的
    const s = settle(n.net, due.map((x) => ({ id: x.id, kind: x.kind, loss: x.loss, cap: x.cap || 0 })));
    return J({ ok: true, ...s, opsDue: n.due, opsTo: COVER.ops, rows: s.rows.map((r) => { const c = due.find((x) => x.id === r.id); return { ...r, a: c.a, to: c.backup }; }) });
  }
  if (b.action === "ops_paid") { // 站长从保障池钱包把运营费转走以后记一笔（金额 + 交易号）
    const amt = Number(b.amt) || 0; if (!(amt > 0)) return J({ ok: false, error: "要填转走的金额" }, 400);
    const sum = (await kv.get(SUM, "json")) || { prem: 0, ops: 0 }; sum.ops = Math.round(((sum.ops || 0) + amt) * 100) / 100; (sum.log = sum.log || []).push({ amt, tx: isTx(b.tx) ? low(b.tx) : "", t: Date.now() }); sum.log = sum.log.slice(-200);
    await kv.put(SUM, JSON.stringify(sum));
    return J({ ok: true, sum });
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
  if (b.action === "vote") return vote(kv, b);
  return admin(env, kv, b);
}
