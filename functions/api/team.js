// 团队名单：在 Cloudflare 服务器上从 Anubis 链一层层读出整个团队，结果存进 KV 共享 6 小时，所有访客秒取
// 需要 Workers 付费版（一次要发几十个子请求）和 KV 绑定 TEAM_KV；没有时返回 503，网页会自己在浏览器里读
const RPCS = ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"];
const COMMUNITY = "0xc9f9a8a2dBf8188AD6610e0239105CAbE67c4993";
const TTL = 6 * 3600;
const MAX_MEMBERS = 80000;

const pad = (a) => a.toLowerCase().replace("0x", "").padStart(64, "0");
const u256 = (v) => v.toString(16).padStart(64, "0");
const refCall = (a, off, lim) => ({ method: "eth_call", params: [{ to: COMMUNITY, data: "0xc01b35a1" + pad(a) + u256(off) + u256(lim) }, "latest"] });

async function batch(calls) {
  const out = new Array(calls.length).fill(null);
  const chunks = [];
  for (let i = 0; i < calls.length; i += 400) chunks.push(i);
  await Promise.all(chunks.map(async (start, n) => {
    const part = calls.slice(start, start + 400).map((c, i) => ({ jsonrpc: "2.0", id: i, ...c }));
    for (let k = 0; k < RPCS.length; k++) {
      try {
        const r = await fetch(RPCS[(n + k) % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(part) });
        const arr = await r.json();
        for (const x of arr) if (!x.error) out[start + x.id] = x.result;
        return;
      } catch (e) { /* 换一个节点 */ }
    }
    throw new Error("rpc failed");
  }));
  return out;
}

async function buildTeam(root) {
  const team = new Map([[root, { line: "self", depth: 0 }]]);
  let jobs = [{ parent: root, off: 0, lim: 1, probe: true }];
  for (let round = 0; jobs.length && round < 400; round++) {
    const res = await batch(jobs.map((j) => refCall(j.parent, j.off, j.lim)));
    const next = [];
    jobs.forEach((j, i) => {
      const h = res[i];
      if (!h) return; // 没有直推时 limit=1 会被拒绝
      if (j.probe) {
        const total = parseInt(h.slice(2, 66), 16);
        for (let off = 1; off < total; off += 100) next.push({ parent: j.parent, off, lim: Math.min(100, total - off) });
      }
      const len = parseInt(h.slice(2 + 128, 2 + 192), 16), par = team.get(j.parent);
      for (let k = 0; k < len; k++) {
        const c = "0x" + h.slice(2 + (3 + k) * 64 + 24, 2 + (4 + k) * 64);
        if (team.has(c)) continue;
        team.set(c, { line: j.parent === root ? c : par.line, depth: par.depth + 1 });
        next.push({ parent: c, off: 0, lim: 1, probe: true });
      }
    });
    if (team.size > MAX_MEMBERS) throw new Error("team too large");
    jobs = next;
  }
  const lines = [], idx = new Map(), list = [];
  for (const [a, v] of team) {
    if (a === root) continue;
    if (!idx.has(v.line)) { idx.set(v.line, lines.length); lines.push(v.line); }
    list.push([a, idx.get(v.line), v.depth]);
  }
  return { root, at: Date.now(), lines, list };
}

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  const root = (url.searchParams.get("root") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(root)) return new Response("bad root", { status: 400 });
  const kv = ctx.env.TEAM_KV;
  const fresh = url.searchParams.get("fresh") === "1";
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (kv && !fresh) {
    const hit = await kv.get("team:" + root);
    if (hit) return new Response(hit, { headers: { ...headers, "x-team-cache": "hit" } });
  }
  try {
    const body = JSON.stringify(await buildTeam(root));
    if (kv) ctx.waitUntil(kv.put("team:" + root, body, { expirationTtl: TTL }));
    return new Response(body, { headers: { ...headers, "x-team-cache": "miss" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 503, headers });
  }
}
