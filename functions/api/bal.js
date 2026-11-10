// 钱包余额秒开（站长 2026-11-10「可用余额读取中」读不出来）：手机直连链上节点慢，改由边缘节点代读 balanceOf，和前端直连赛跑，谁先到用谁
// GET /api/bal?chain=anubis|polygon&a=<钱包>&t=<代币地址,逗号分隔>  →  { b: ["<余额 wei>", ...] }
import { RPCS } from "../../lib/teamlib.js";
const POLYGON_RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org", "https://1rpc.io/matic"];
const HEX = /^0x[0-9a-fA-F]{40}$/;
const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=3, s-maxage=3" } });
export async function onRequestGet({ request }) {
  const u = new URL(request.url), chain = u.searchParams.get("chain") || "anubis", a = (u.searchParams.get("a") || "").trim();
  const ts = (u.searchParams.get("t") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (!HEX.test(a) || !ts.length || !ts.every((t) => HEX.test(t))) return json({ error: "bad params" }, 400);
  const rpcs = chain === "polygon" ? POLYGON_RPCS : RPCS;
  const who = a.slice(2).toLowerCase().padStart(64, "0");
  const body = JSON.stringify(ts.map((t, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: t, data: "0x70a08231" + who }, "latest"] })));
  let err = "rpc";
  for (let k = 0; k < rpcs.length * 2; k++) {
    try {
      const r = await fetch(rpcs[k % rpcs.length], { method: "POST", headers: { "content-type": "application/json", "user-agent": "ailgns-bal/1" }, body, signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error((j && j.error && j.error.message) || "rpc");
      const out = [];
      j.forEach((x) => { if (x && typeof x.result === "string") out[x.id] = String(BigInt(x.result === "0x" ? "0x0" : x.result)); });
      if (ts.some((_, i) => out[i] === undefined)) throw new Error("缺结果");
      return json({ b: out, at: Date.now() });
    } catch (e) { err = String(e && e.message || e); }
  }
  return json({ error: err }, 502);
}
