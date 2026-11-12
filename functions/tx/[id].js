// 🔗 钱包（OKX 等）把本站当成 Anubis 的区块浏览器：付款详情里点「在浏览器查看」会打开 /tx/<交易哈希>。
// 这个网址以前没有页面（出来一张乱掉的首页），现在直接跳到中文账本 #/scan/<哈希>。站长 2026-11-12
export function onRequestGet({ params, request }) {
  const id = String(params.id || "").toLowerCase();
  return Response.redirect(new URL("/#/scan" + (/^0x[0-9a-f]{64}$/.test(id) ? "/" + id : ""), request.url).toString(), 302);
}
