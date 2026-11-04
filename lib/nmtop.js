// 域名史上最高成交：读域名页「成交排行」同一份链上记录快照（KV nmlogs:*），再读名字
import { rpc } from "./oracle.js";

const MK = [["ailgns", "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e", "0xbc408e9d7350967e7247c917a086cb4ece0ed988"], ["lgns", "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d", "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3"]];
export async function nmTop(kv) {
  let top = null;
  for (const [t, O, C] of MK) {
    const c = await kv.get("nmlogs:" + O + ":def4cdb9", "json");
    for (const l of (c && c.l) || []) { const p = BigInt("0x" + l[2].slice(66, 130)); if (!top || p > top.p) top = { t, C, tid: l[2].slice(2, 66), p }; }
  }
  if (!top) return null;
  const r = (await rpc("eth_call", [{ to: top.C, data: "0x36bf1f0c" + top.tid }, "latest"])).slice(2), off = parseInt(r.slice(0, 64), 16) * 2, len = parseInt(r.slice(off, off + 64), 16);
  const label = new TextDecoder().decode(new Uint8Array((r.slice(off + 64, off + 64 + len * 2).match(/../g) || []).map((x) => parseInt(x, 16))));
  return { name: label + "." + top.t, dai: Number(top.p / 10n ** 14n) / 1e4 };
}
