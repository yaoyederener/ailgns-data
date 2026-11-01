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
      fetch("/api/trades?addr=" + addr).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(id)) return;
        var list = d.trades || [];
        if (!list.length) { out.innerHTML = '<section class="card"><div class="empty">这个地址在本站还没有成交记录</div></section>'; return; }
        var total = list.reduce(function (s, t) { return s + (t.dai || 0); }, 0);
        out.innerHTML = '<section class="card"><div class="card-head"><h2>成交记录 <small class="muted">' + list.length + ' 笔 · 合计 ' + A.fmt(total, 2) + ' DAI</small></h2><span class="muted mono">' + A.short(addr) + '</span></div>' +
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
