// 上级查询：从某个地址一直往上找推荐人，直到最顶层。推荐关系绑定后不会再变，所以每一步都永久存在 KV 里，查过的链再查秒出
import { RPCS } from "../../lib/teamlib.js";

const COMMUNITY = "0xc9f9a8a2dBf8188AD6610e0239105CAbE67c4993";
const MEMBERS = "0x08ae4b0c"; // members(address) → (层级, 推荐人)
const MAX_UP = 300;

async function referrer(a) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: COMMUNITY, data: MEMBERS + a.slice(2).padStart(64, "0") }, "latest"] });
  for (let k = 0; k < RPCS.length * 2; k++) {
    try {
      const r = await fetch(RPCS[k % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body });
      const j = await r.json();
      if (j.result && j.result.length >= 130) return "0x" + j.result.slice(2 + 64 + 24, 2 + 128);
      if (j.result) return null;
    } catch (e) { /* 换一个节点 */ }
  }
  throw new Error("rpc failed");
}
function isEnd(a) { return !a || /^0x0{39}[01]$/.test(a); }

export async function onRequestGet(ctx) {
  const addr = (new URL(ctx.request.url).searchParams.get("addr") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return new Response("bad addr", { status: 400 });
  const kv = ctx.env.TEAM_KV, chain = [], seen = new Set([addr]), saves = [];
  let cur = addr, bound = true;
  try {
    for (let i = 0; i < MAX_UP; i++) {
      let up = kv ? await kv.get("ref:" + cur) : null;
      if (up === null) {
        up = (await referrer(cur)) || "0x0000000000000000000000000000000000000000";
        if (!isEnd(up) && kv) saves.push(kv.put("ref:" + cur, up)); // 只存已经绑定的（没绑定的以后还可能绑）
      }
      if (isEnd(up) || seen.has(up)) { if (i === 0 && isEnd(up)) bound = false; break; }
      chain.push(up); seen.add(up); cur = up;
    }
  } catch (e) {
    return Response.json({ error: "读链失败，请稍后重试" }, { status: 503 });
  }
  ctx.waitUntil(Promise.all(saves));
  // 有官方 P 等级的上级标出来（缓存 1 天）
  const levels = await Promise.all(chain.map(async (a) => {
    const c = kv && (await kv.get("lvl:" + a));
    if (c !== null && c !== undefined) return +c;
    try {
      const r = await fetch("https://awakehelix.io/api/v1/level/" + a);
      const l = r.ok ? (await r.json()).level || 0 : 0;
      if (kv) ctx.waitUntil(kv.put("lvl:" + a, String(l), { expirationTtl: 86400 }));
      return l;
    } catch (e) { return 0; }
  }));
  return Response.json({ addr, bound, chain: chain.map((a, i) => ({ a, level: levels[i] })) }, { headers: { "cache-control": "no-store" } });
}
