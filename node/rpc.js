// 自建 Anubis 节点对外的「门卫」（nginx njs）。节点只听本机 127.0.0.1:8545，外面的请求都先过这里：
//   · 只放行读链 + 广播已签名交易的方法（管理 / 调试 / 账户类一律不放）
//   · eth_getLogs 一次最多查 5000 块（和官方公共节点一样），防止有人一口气扫全链把机器拖死
//   · 一个请求里最多 400 条（本站后台一批 300 条）
// 改这里之后：nginx -t && systemctl reload nginx
var ALLOW = {
  eth_blockNumber: 1, eth_call: 1, eth_chainId: 1, eth_estimateGas: 1, eth_feeHistory: 1, eth_gasPrice: 1, eth_getBalance: 1,
  eth_getBlockByHash: 1, eth_getBlockByNumber: 1, eth_getBlockReceipts: 1, eth_getCode: 1, eth_getLogs: 1, eth_getStorageAt: 1,
  eth_getTransactionByHash: 1, eth_getTransactionCount: 1, eth_getTransactionReceipt: 1, eth_maxPriorityFeePerGas: 1,
  eth_sendRawTransaction: 1, eth_syncing: 1, net_version: 1, web3_clientVersion: 1
};
var MAX_RANGE = 5000, MAX_BATCH = 400, GETH = "http://127.0.0.1:8545";

function hexNum(v) { return typeof v === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(v) ? parseInt(v, 16) : null; }
function rpcErr(id, code, msg) { return { jsonrpc: "2.0", id: id === undefined ? null : id, error: { code: code, message: msg } }; }
function send(r, obj) { r.headersOut["Content-Type"] = "application/json"; r.return(200, typeof obj === "string" ? obj : JSON.stringify(obj)); }

async function geth(body) {
  var resp = await ngx.fetch(GETH, { method: "POST", headers: { "Content-Type": "application/json" }, body: body });
  return await resp.text();
}

async function handle(r) {
  try {
    if (r.method === "OPTIONS") { r.return(204); return; }
    if (r.method !== "POST") { r.return(405, "POST only\n"); return; }
    var text = r.requestText, j;
    try { j = JSON.parse(text); } catch (e) { send(r, rpcErr(null, -32700, "parse error")); return; }
    var batch = Array.isArray(j), list = batch ? j : [j];
    if (!list.length || list.length > MAX_BATCH) { send(r, rpcErr(null, -32600, "batch too large (max " + MAX_BATCH + ")")); return; }
    var bad = null, head = null;
    for (var i = 0; i < list.length && !bad; i++) {
      var c = list[i];
      if (!c || typeof c.method !== "string" || !ALLOW[c.method]) { bad = [-32601, "method not available on this node"]; break; }
      if (c.method === "eth_getLogs") {
        var f = (Array.isArray(c.params) && c.params[0]) || {};
        if (f.blockHash) continue; // 只查一个块
        var a = hexNum(f.fromBlock), b = hexNum(f.toBlock);
        if (a === null || b === null) {
          if (head === null) { // njs 不让把 await 写在函数参数里，拆开写
            var ht = await geth('{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}');
            head = parseInt(JSON.parse(ht).result, 16);
          }
          if (a === null) a = f.fromBlock === "earliest" ? 0 : head;
          if (b === null) b = f.toBlock === "earliest" ? 0 : head;
        }
        if (b - a > MAX_RANGE) bad = [-32000, "exceed maximum block range: " + MAX_RANGE];
      }
    }
    if (bad) { send(r, batch ? list.map(function (c) { return rpcErr(c && c.id, bad[0], bad[1]); }) : rpcErr(list[0] && list[0].id, bad[0], bad[1])); return; }
    var out = await geth(text);
    send(r, out);
  } catch (e) {
    r.return(502, '{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"node unavailable"}}');
  }
}
export default { handle };
