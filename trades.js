// 成交查询：输入任意地址，看它在本站 OTC / 卡牌的成交记录（挂单人和吃单人都算），数据由 otc-watch 按地址记录
(function () {
  "use strict";
  var A = window.AIL;
  var MK = { ailgns: "AiLGNS", lgns: "LGNS · Anubis", plgns: "LGNS · Polygon", glgns: "gLGNS", nft: "AWAKE NFT" };
  var TX = { plgns: "https://polygonscan.com/tx/" };
  function row(t, addr) {
    var mine = t.taker === addr, side = mine ? (t.makerSide === "卖" ? "买入" : "卖出") : (t.makerSide === "卖" ? "卖出" : "买入"); // 我是吃单人就和挂单方向相反
    var other = mine ? t.maker : t.taker, tx = (TX[t.m] || "https://anubisscan.io/tx/") + t.tx;
    return '<tr><td data-l="时间" class="l">' + A.timeBJ(t.t * 1000) + '</td><td data-l="市场" class="l">' + (MK[t.m] || t.m) + '</td><td data-l="方向" class="' + (side === "买入" ? "up" : "down") + '">' + side + "</td>" +
      '<td data-l="数量">' + (t.nft ? "#" + t.tokenId : A.fmt(t.qty, 4) + " " + t.sym) + '</td><td data-l="单价 DAI">' + (t.nft ? "—" : A.fmt(t.price, t.m === "lgns" || t.m === "plgns" ? 4 : 2)) + '</td><td data-l="金额 DAI"><b>' + A.fmt(t.dai, 2) + "</b></td>" +
      '<td data-l="对手方" class="l mono">' + A.short(other) + '</td><td data-l="角色" class="l">' + (mine ? "吃单" : "挂单") + '</td><td data-l="交易"><a target="_blank" rel="noopener" href="' + tx + '">查看 ↗</a></td></tr>';
  }
  // 这个地址还在挂着的单（没成交就不会出现在成交记录里，客户容易以为"没查到"）
  var OPEN_MKTS = [["ailgns", "AiLGNS", 18, 7], ["lgns", "LGNS · Anubis", 9, 7], ["plgns", "LGNS · Polygon", 9, 7], ["glgns", "gLGNS", 18, 7], ["nft", "AWAKE NFT", 0, 6]];
  function openOrders(addr) {
    var now = Date.now() / 1000;
    return Promise.all(OPEN_MKTS.map(function (m) {
      return fetch("/api/book?m=" + m[0]).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.orders || j.orders === "0x") return [];
        var h = j.orders.slice(2), w = h.match(/.{64}/g) || [], n = parseInt(w[1], 16), W = m[3], out = [];
        for (var i = 0; i < n; i++) {
          var o = w.slice(2 + i * W, 2 + (i + 1) * W);
          if (!o[0].endsWith(addr.slice(2)) || BigInt("0x" + o[2]) !== 1n || Number(BigInt("0x" + o[3])) <= now) continue; // 不是它挂的 / 已关闭 / 已过期
          var sell = BigInt("0x" + o[1]) === 1n;
          if (W === 6) out.push({ mk: m[1], side: sell ? "卖出" : "求购", what: sell ? "卡 #" + BigInt("0x" + o[4]) : "任意一张", dai: Number(BigInt("0x" + o[5])) / 1e18, id: j.from + i });
          else {
            var giveTotal = Number(BigInt("0x" + o[4])), wantTotal = Number(BigInt("0x" + o[5])), left = Number(BigInt("0x" + o[6])), gd = sell ? m[2] : 18;
            var daiLeft = sell ? left * wantTotal / giveTotal / 1e18 : left / 1e18;
            out.push({ mk: m[1], side: sell ? "卖出" : "买入", what: sell ? (left / Math.pow(10, gd)).toFixed(m[2] === 9 ? 2 : 4) + " " + m[1].split(" ")[0] : (left * wantTotal / giveTotal / Math.pow(10, m[2])).toFixed(m[2] === 9 ? 2 : 4) + " " + m[1].split(" ")[0], dai: daiLeft, id: j.from + i });
          }
        }
        return out;
      }).catch(function () { return []; });
    })).then(function (lists) { return [].concat.apply([], lists); });
  }
  function render(id, a) {
    var app = A.app;
    app.innerHTML = '<h1>成交查询</h1><p class="sub">输入任意钱包地址，查它在本站 OTC（四个市场）和卡牌交易的成交记录：挂单被吃、自己吃单都算，带交易链接可核对。</p>' +
      '<section class="card"><div class="addr-box"><input id="tr-addr" class="mono" placeholder="粘贴钱包地址 0x…" autocomplete="off" spellcheck="false" value="' + (a || "") + '"><button id="tr-go">查询</button></div><p class="note" style="margin:8px 0 0">成交后几分钟内记录会出现在这里；累计成交和会员赠送以「会员中心」的查询为准。</p></section><div id="tr-out"></div>';
    var inp = document.getElementById("tr-addr"), out = document.getElementById("tr-out");
    function go() {
      var addr = (inp.value || "").trim().toLowerCase();
      if (!A.isAddr(addr)) { out.innerHTML = '<p class="note down">地址格式不对</p>'; return; }
      if (location.hash !== "#/trades/" + addr) { history.replaceState(null, "", "#/trades/" + addr); }
      out.innerHTML = '<div class="loading">正在读取成交记录…</div>';
      A.track && A.track("q_trades");
      Promise.all([fetch("/api/trades?addr=" + addr).then(function (r) { return r.json(); }), openOrders(addr)]).then(function (res) {
        if (!A.isCurrent(id)) return;
        var d = res[0], opens = res[1], list = d.trades || [];
        var openHtml = opens.length ? '<section class="card"><div class="card-head"><h2>挂单中 <small class="muted">' + opens.length + ' 张 · 还没成交</small></h2></div><div class="tbl-wrap"><table class="cards"><thead><tr><th class="l">市场</th><th>方向</th><th>剩余</th><th>剩余金额 DAI</th><th>单号</th></tr></thead><tbody>' +
          opens.map(function (o) { return '<tr><td data-l="市场" class="l">' + o.mk + '</td><td data-l="方向" class="' + (o.side === "买入" || o.side === "求购" ? "up" : "down") + '">' + o.side + '</td><td data-l="剩余">' + o.what + '</td><td data-l="剩余金额 DAI">' + A.fmt(o.dai, 2) + '</td><td data-l="单号">#' + o.id + "</td></tr>"; }).join("") +
          '</tbody></table></div><p class="note">挂单成交后才会出现在下面的成交记录里。</p></section>' : "";
        if (!list.length) { out.innerHTML = openHtml + '<section class="card"><div class="empty">这个地址在本站还没有成交记录' + (opens.length ? "（有 " + opens.length + " 张挂单还没人吃）" : "") + '</div></section>'; return; }
        out.innerHTML = openHtml;
        var total = list.reduce(function (s, t) { return s + (t.dai || 0); }, 0);
        out.innerHTML += '<section class="card"><div class="card-head"><h2>成交记录 <small class="muted">' + list.length + ' 笔 · 合计 ' + A.fmt(total, 2) + ' DAI</small></h2><span class="muted mono">' + A.short(addr) + '</span></div>' +
          '<div class="tbl-wrap"><table class="cards"><thead><tr><th class="l">时间（北京）</th><th class="l">市场</th><th>方向</th><th>数量</th><th>单价 DAI</th><th>金额 DAI</th><th class="l">对手方</th><th class="l">角色</th><th>交易</th></tr></thead><tbody>' +
          list.map(function (t) { return row(t, addr); }).join("") + "</tbody></table></div>" + (list.length >= 300 ? '<p class="note">只显示最近 300 笔。</p>' : "") + "</section>";
      }).catch(function () { if (A.isCurrent(id)) out.innerHTML = '<p class="note down">读取失败，请稍后再试</p>'; });
    }
    document.getElementById("tr-go").onclick = go;
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    if (a && A.isAddr(a)) go();
  }
  A.pages.trades = function (id, a) { render(id, a); };
})();
