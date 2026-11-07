// 🔍 批量查名字能不能注册（批量注册用）：GET ?n=名字1,名字2,…（最多 100 个，.ailgns）→ { ok: { 名字: true|false }, bad: [不合规或不开放的] }
// 服务器一次批量 eth_call 合约 available(label)，客户端不用自己打 100 次链
import { RPCS } from "../../lib/teamlib.js";
import { banned } from "../../lib/ban.js";
const NAMES = "0xbc408e9d7350967e7247c917a086cb4ece0ed988", SEL = "0xaeb8ce9b";
const u256 = (n) => BigInt(n).toString(16).padStart(64, "0");
const str = (s) => { const h = [...new TextEncoder().encode(s)].map((x) => x.toString(16).padStart(2, "0")).join(""); return u256(h.length / 2) + h.padEnd(Math.ceil(h.length / 64) * 64, "0"); };
const chars = (s) => Array.from(s).length, cn = (s) => /[一-鿿]/.test(s);
const valid = (s) => /^[a-z0-9一-鿿-]+$/.test(s) && chars(s) >= (cn(s) ? 2 : 3) && chars(s) <= 32 && s[0] !== "-" && s[s.length - 1] !== "-";
async function batch(calls) {
  let err;
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: NAMES, data: c }, "latest"] }))) });
      const j = await r.json(); if (!Array.isArray(j)) throw new Error("rpc"); const out = []; j.forEach((x) => { out[x.id] = x.result; }); return out;
    } catch (e) { err = e; }
  }
  throw err;
}
export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url);
  const names = [...new Set(String(u.searchParams.get("n") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
  const ok = {}, bad = [], good = [];
  for (const n of names) { if (!valid(n) || banned(n)) bad.push(n); else good.push(n); }
  if (good.length) {
    try {
      const res = await batch(good.map((n) => SEL + u256(0x20) + str(n)));
      good.forEach((n, i) => { ok[n] = !!(res[i] && BigInt(res[i]) === 1n); });
    } catch (e) { return Response.json({ error: "读链失败，稍后再试" }, { status: 502 }); }
  }
  return Response.json({ ok, bad }, { headers: { "cache-control": "no-store" } });
}
