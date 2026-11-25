// 🛰 备用节点（#/rpc，站长 2026-11-25：「客户反应官方节点无法操作，把我们的节点公布给客户，让客户自己选择，引导客户自己添加」）
//   · 上面：官方节点和本站备用节点「从你这台手机连过去」通不通、多快、落后几块——每个人的网络不一样，所以在客户自己这边测，不走服务器
//   · 中间：备用节点地址一键复制 + 一键添加（钱包支持的话）+ 手动怎么填
//   · 最显眼：防骗提醒（骗子会冒充客服让人改节点；只认本页这个地址）
// 定位只是「备用」：官方节点卡的时候用，不承诺永远可用。节点只转发已经签好名的交易，碰不到私钥。只看不动钱。
(function () {
  "use strict";
  var A = window.AIL;
  var OURS = "https://rpc.ailgns.dev", CHAIN_HEX = "0x1a3a", CHAIN_ID = 6714, EXPLORER = "https://browser.anubispace.org";
  var NODES = [
    { k: "o1", name: "官方节点 1", url: "https://rpc.anubispace.org" },
    { k: "o2", name: "官方节点 2", url: "https://rpc2.anubispace.org" },
    { k: "o3", name: "官方节点 3", url: "https://rpc3.anubispace.org" },
    { k: "us", name: "本站备用节点", url: OURS, ours: 1 }
  ];
  var timer = 0;
  function T(s) { try { return window.AIL_LANG_T ? window.AIL_LANG_T(s) : s; } catch (e) { return s; } } // 拼进一句里的小词，自己先翻好
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // 从客户这边问一次最新区块：8 秒没回算不通
  function ping(url) {
    var t0 = Date.now(), ac = window.AbortController ? new AbortController() : null, tm = ac && setTimeout(function () { ac.abort(); }, 8000);
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }), signal: ac ? ac.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(tm); var n = j && typeof j.result === "string" ? parseInt(j.result, 16) : NaN; if (!(n > 0)) throw new Error("bad"); return { ok: true, ms: Date.now() - t0, block: n }; })
      .catch(function () { clearTimeout(tm); return { ok: false, ms: Date.now() - t0, block: 0 }; });
  }
  function draw(res) {
    var el = document.getElementById("rpcp-st"); if (!el) return;
    var top = 0; res.forEach(function (r) { if (r && r.ok && r.block > top) top = r.block; });
    el.innerHTML = NODES.map(function (n, i) {
      var r = res[i], st, cls;
      if (!r) { st = T("检测中…"); cls = "wait"; }
      else if (!r.ok) { st = "❌ " + T("连不上"); cls = "bad"; }
      else { var lag = top - r.block; st = (lag > 30 ? "⚠️ " + T("落后") + " " + lag + " " + T("块") : "✅ " + T("正常")) + " · " + (r.ms / 1000).toFixed(2) + " " + T("秒"); cls = lag > 30 ? "slow" : "ok"; }
      return '<div class="rpcp-row ' + cls + (n.ours ? " ours" : "") + '"><span>' + esc(T(n.name)) + "</span><b>" + st + "</b></div>";
    }).join("");
    var tip = document.getElementById("rpcp-tip"); if (!tip) return;
    if (res.some(function (r) { return !r; })) { tip.textContent = ""; return; }
    var offOk = res.slice(0, 3).some(function (r) { return r.ok; }), usOk = res[3].ok;
    tip.textContent = offOk ? (usOk ? "官方节点现在是通的，可以不用换；想换也行。" : "官方节点现在是通的，不用换。本站备用节点这会儿连不上。")
      : usOk ? "从你这边连官方节点连不上，可以先换成本站备用节点。" : "两边都连不上，多半是你的网络问题：换个网络（Wi-Fi / 流量互换）再试。";
  }
  function check() {
    var res = [null, null, null, null]; draw(res);
    NODES.forEach(function (n, i) { ping(n.url).then(function (r) { res[i] = r; draw(res); }); });
  }
  function copy(text, btn) {
    var done = function () { if (btn) { var o = btn.textContent; btn.textContent = "✅ 已复制"; setTimeout(function () { btn.textContent = o; }, 2000); } };
    var old = function () { try { var x = document.createElement("textarea"); x.value = text; x.setAttribute("readonly", ""); x.style.cssText = "position:fixed;left:-999px;top:0"; document.body.appendChild(x); x.select(); x.setSelectionRange(0, 999); var ok = document.execCommand("copy"); document.body.removeChild(x); if (ok) done(); else if (btn) btn.textContent = "请长按地址复制"; } catch (e) { if (btn) btn.textContent = "请长按地址复制"; } };
    try { navigator.clipboard.writeText(text).then(done, old); } catch (e) { old(); }
  }
  // 一键添加：请钱包把这个节点加进 Anubis 网络。不是每个钱包都支持给已有的网络换节点，不行就按下面手动填
  function addToWallet(btn) {
    var say = function (t) { var s = document.getElementById("rpcp-say"); if (s) s.textContent = t; };
    var eth = window.ethereum;
    if (!eth || !eth.request) { say("这个浏览器里没有钱包。请在钱包 App 里打开本页再点，或者按下面的步骤手动填。"); return; }
    btn.disabled = true; say("请在钱包里确认…");
    eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: "Anubis", nativeCurrency: { name: "DAI", symbol: "DAI", decimals: 18 }, rpcUrls: [OURS], blockExplorerUrls: [EXPLORER] }] })
      .then(function () { btn.disabled = false; say("钱包已处理。有的钱包对已有的网络不会换节点：到钱包的网络设置里看一下 Anubis 的节点地址是不是 " + OURS + "，不是就按下面手动填。"); },
        function (e) { btn.disabled = false; say(e && e.code === 4001 ? "你在钱包里点了取消。" : "这个钱包不支持一键添加，请按下面的步骤手动填。"); });
  }

  A.pages.rpc = function (id) {
    clearInterval(timer);
    A.app.innerHTML = '<section class="card rpcp"><h2>🛰 备用节点</h2>' +
      '<p class="muted">钱包里点了没反应、交易一直发不出去，有时是钱包连的官方节点卡了。本站自己跑了一个 Anubis 节点，可以当备用。先看下面从你这边连过去通不通：</p>' +
      '<div id="rpcp-st" class="rpcp-st"></div><p id="rpcp-tip" class="rpcp-tip"></p>' +
      '<button type="button" class="ghost rpcp-re" id="rpcp-re">重新检测</button>' +
      '<div class="rpcp-warn"><b>⚠️ 防骗，先看这个</b><p>备用节点只认本页这一个地址。客服和技术人员<b>不会私聊</b>让你改节点、「同步」「升级」钱包，更不会要助记词或私钥。有人私聊让你加别的节点地址，就是骗子。</p></div>' +
      '<h3 class="rpcp-h3">备用节点地址</h3>' +
      '<button type="button" class="rpcp-url" id="rpcp-url"><code>' + OURS + '</code><span id="rpcp-cp">复制</span></button>' +
      '<button type="button" class="rpcp-add" id="rpcp-add">一键添加到钱包</button><p class="muted rpcp-say" id="rpcp-say"></p>' +
      '<h3 class="rpcp-h3">手动怎么填</h3>' +
      '<ol class="rpcp-ol"><li>打开钱包，进「网络」设置（有的钱包叫「自定义网络」或「节点设置」），找到 <b>Anubis</b> 网络。</li>' +
      '<li>选「添加节点」或「修改 RPC 地址」，把上面的地址粘贴进去。</li><li>其它几项照下面填（已经有的不用动），保存，然后选中这个节点。</li></ol>' +
      '<div class="rpcp-kv"><div><span>网络名称</span><b>Anubis</b></div><div><span>RPC 地址</span><b>' + OURS + '</b></div><div><span>链 ID</span><b>' + CHAIN_ID + '</b></div><div><span>货币符号</span><b>DAI</b></div><div><span>区块浏览器</span><b>' + EXPLORER + "</b></div></div>" +
      '<h3 class="rpcp-h3">要知道的几件事</h3>' +
      '<ul class="rpcp-ul"><li>节点只负责把你<b>已经签好名</b>的交易送上链，碰不到你的私钥和助记词，动不了你的钱。</li>' +
      '<li>这是备用：官方节点恢复后可以换回去；本站节点偶尔也会维护，连不上时换回官方节点就行。</li>' +
      '<li>换节点不影响你的资产，币都在链上，不在节点里。</li></ul></section>';
    var on = function (i, f) { var e = document.getElementById(i); if (e) e.onclick = f; };
    on("rpcp-re", check);
    on("rpcp-url", function () { copy(OURS, document.getElementById("rpcp-cp")); });
    on("rpcp-add", function () { addToWallet(document.getElementById("rpcp-add")); });
    check();
    timer = setInterval(function () { if (!A.isCurrent(id)) { clearInterval(timer); return; } if (!document.hidden) check(); }, 30000);
  };
})();
