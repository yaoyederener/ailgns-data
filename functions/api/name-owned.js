// 🔥 某个钱包现在手里有哪些 .ailgns 名（销毁领奖选名字用，站长 2026-11-09：「读取太慢，能不能快点」）
// 以前手机自己读链：拉几万条 Transfer 记录 + 每个候选名字查 ownerOf / labelOf / expires，公共节点一慢就「读链上记录失败」。
// 现在服务器直接用现成的日志快照算（/api/name-logs 的 Transfer + NameRegistered 快照，/api/name-genesis 的创世编号表），一次 RPC 都不用：
//   GET ?a=0x… → { a, list: [{ id, label, no }], to, at }   owner = 每个 tokenId 最后一次 Transfer 的 to；挂在市场里的名字在市场合约名下，自然不在列表里
// 边缘缓存 10 秒。快照最多落后几个块：刚买 / 刚注册的名字等 1 分钟再点。
import { banned } from "../../lib/ban.js";

const NAMES = "0xbc408e9d7350967e7247c917a086cb4ece0ed988";
const T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a";
const word = (r, i) => r.slice(2 + i * 64, 2 + (i + 1) * 64);
function decStr(r) { try { const off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2); return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)))); } catch (e) { return ""; } }

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), a = (u.searchParams.get("a") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return new Response("bad", { status: 400 });
  const cache = caches.default, ck = new Request("https://ailgns.dev/api/name-owned?a=" + a);
  const hit = await cache.match(ck);
  if (hit) return hit;
  const get = (p) => fetch(u.origin + p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [xf, rg, gen] = await Promise.all([get("/api/name-logs?a=" + NAMES + "&t=" + T_XFER), get("/api/name-logs?a=" + NAMES + "&t=" + T_REG), get("/api/name-genesis")]);
  if (!xf || !xf.l) return new Response("no data", { status: 503 });
  const owner = {};
  xf.l.slice().sort((p, q) => p[0] - q[0]).forEach((l) => { if (l[1] && l[1][3] && l[1][2]) owner[l[1][3].toLowerCase()] = "0x" + l[1][2].slice(26).toLowerCase(); });
  const label = {};
  ((rg && rg.l) || []).forEach((l) => { if (l[1] && l[1][1]) label[l[1][1].toLowerCase()] = decStr(l[2]); });
  const g = (gen && gen.g) || {};
  const list = Object.keys(owner).filter((id) => owner[id] === a)
    .map((id) => ({ id: id.slice(2), label: label[id] || "", no: g[id.slice(2)] || 0 }))
    .filter((x) => x.label && !banned(x.label))
    .sort((p, q) => (p.no || 1e9) - (q.no || 1e9));
  const res = Response.json({ a, list, to: xf.to, at: Date.now() }, { headers: { "cache-control": "public, max-age=10" } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
