// 🔗 钱包把本站当成区块浏览器时，点地址 / 代币会打开 /address/<地址>、/token/<地址>：直接跳到中文账本 #/scan/<地址>。站长 2026-11-12
export function onRequestGet({ params, request }) {
  const id = String(params.id || "").toLowerCase();
  return Response.redirect(new URL("/#/scan" + (/^0x[0-9a-f]{40}$/.test(id) ? "/" + id : ""), request.url).toString(), 302);
}
