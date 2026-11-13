// 📊 官方资金池 #/funds（站长 2026-11-12）：官方公布的 7 个资金地址的链上余额 + 每个池子是干嘛的 + 一句话总结；放在会员栏目里，所有人免费看
// 秒开：先画手机里上次存的数字，再去 /api/funds 取（边缘节点 5 分钟读一次链）；接口不通才由手机直接读链
(function () {
  "use strict";
  var A = window.AIL, CACHE = "ailgns-funds-cache-v1";
  var AIL_T = "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", LGNS_T = "0x4D1D808a081FdAc440703b3765FC61f8028C06B8";
  /* 用途只按官方公布的名称用大白话解释，不替官方承诺怎么用 */
  var FUNDS = [
    { no: "①", n: "协议储备金", a: "0x27Cb55eE75E777fF972B74B6E68782D12Bd4ec46", w: "协议的家底，金额最大。大家买算力付的 DAI 都进这里。" },
    { no: "②", n: "初始铸造池", a: "0xcC95906Da4b92B3a5c4B187553050df0f90eaE08", w: "按官方命名，放的是初始铸造出来的 AiLGNS。里面主要是币，不是 DAI。" },
    { no: "③", n: "护盘资金", a: "0x85fF1E15CaBCa867F244B9c2465227477f251972", w: "官方标注用来护盘（稳住币价）的备用资金。" },
    { no: "④", n: "缓冲池", a: "0x0664F1369209677FEcb279F5EC3Df1E53a22212e", w: "官方标注的缓冲资金，行情波动大的时候当缓冲垫。" },
    { no: "⑤", n: "护价池 ①", a: "0x589B441A19fdFD28aEe5E57891a842e96d91de31", w: "官方标注用来托住价格的资金池。" },
    { no: "⑥", n: "护价池 ②", a: "0xF1Fb9cE9472DEc231bCed60d6Aa729f5e403020B", w: "官方标注用来托住价格的资金池。" },
    { no: "池", n: "底池资金", a: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", pool: 1, w: "AiLGNS/DAI 交易池。大家在 DEX 买卖 AiLGNS 就是和这个池子换；池里的 DAI ÷ AiLGNS 就是现在的币价。" }
  ];
  function num(hex, dec) { try { return Number(BigInt(!hex || hex === "0x" ? "0x0" : hex) / BigInt(Math.pow(10, dec - 4))) / 1e4; } catch (e) { return 0; } }
  /* 接口不通时的兜底：手机一次批量读链（7 个地址 × DAI / AiLGNS / LGNS） */
  function direct() {
    var list = [];
    FUNDS.forEach(function (f) {
      list.push(["eth_getBalance", [f.a, "latest"]]);
      list.push(["eth_call", [{ to: AIL_T, data: "0x70a08231" + A.pad(f.a) }, "latest"]]);
      list.push(["eth_call", [{ to: LGNS_T, data: "0x70a08231" + A.pad(f.a) }, "latest"]]);
    });
    return A.rpcMany(list).then(function (rs) {
      if (rs.some(function (x) { return x == null; })) throw new Error("缺结果");
      return { at: Date.now(), prev: null, f: FUNDS.map(function (f, i) { return { a: f.a.toLowerCase(), dai: num(rs[i * 3], 18), ail: num(rs[i * 3 + 1], 18), lgns: num(rs[i * 3 + 2], 9) }; }) };
    });
  }
  function ok(d) { return d && d.f && d.f.length === FUNDS.length && d.f.every(function (x, i) { return x && String(x.a).toLowerCase() === FUNDS[i].a.toLowerCase() && typeof x.dai === "number"; }); }
  function ago(at) {
    var m = Math.max(0, Math.round((Date.now() - at) / 60000));
    return m < 1 ? "刚刚" : m < 60 ? m + " 分钟前" : m < 1440 ? Math.round(m / 60) + " 小时前" : Math.round(m / 1440) + " 天前";
  }
  function draw(d, state) {
    var wan = A.wan, fmt = A.fmt, html = '<h1>📊 官方资金池</h1><p class="sub">官方公布的 7 个资金地址，链上余额原样读出来，所有人免费看。</p>';
    if (!ok(d)) {
      A.app.innerHTML = html + '<section class="card"><p class="muted">' + (state === "fail" ? '链上数据暂时没读到，<a href="javascript:location.reload()">点这里刷新</a>再试。' : "⏳ 正在读链上余额…") + "</p></section>";
      return;
    }
    var six = 0, guard = 0, pool = d.f[6];
    d.f.forEach(function (x, i) { if (i < 6) six += x.dai; if (i >= 2 && i < 6) guard += x.dai; });
    var price = pool.ail > 0 ? pool.dai / pool.ail : 0, times = pool.dai > 0 ? six / pool.dai : 0;
    var word = times >= 2 ? "家底厚" : times >= 1 ? "家底够" : "家底偏薄", cls = times >= 1 ? "good" : "warn";
    var why = times >= 1 ? "池子外面的备用资金，是交易池里 DAI 的 " + times.toFixed(1) + " 倍" : "池子外面的备用资金，比交易池里的 DAI 少（" + times.toFixed(2) + " 倍）";
    html += '<section class="fd-sum ' + cls + '"><div class="fd-tag">一句话总结</div><div class="fd-word">' + word + '</div><div class="fd-why">' + why + "</div>" +
      '<div class="fd-big"><b class="num">' + wan(six) + '</b><small>DAI</small></div><div class="fd-cap">①～⑥ 六个资金池的 DAI 合计</div>' +
      '<div class="fd-rows">' +
      '<div><span>其中储备金 ①</span><b class="num">' + wan(d.f[0].dai) + " DAI</b></div>" +
      '<div><span>护盘 / 缓冲 / 护价 ③④⑤⑥</span><b class="num">' + wan(guard) + " DAI</b></div>" +
      '<div><span>底池里的 DAI</span><b class="num">' + wan(pool.dai) + " DAI</b></div>" +
      (price ? '<div><span>底池现价</span><b class="num">' + fmt(price, 2) + " DAI / AiLGNS</b></div>" : "") +
      (d.prev && d.prev.six > 0 ? '<div><span>六个池合计比昨天</span><b class="num ' + (six >= d.prev.six ? "up" : "down") + '">' + (six >= d.prev.six ? "+" : "−") + wan(Math.abs(six - d.prev.six)) + " DAI</b></div>" : "") +
      "</div>" +
      '<p class="fd-note">这是链上此刻的真实数字，不是承诺。币价会涨也会跌，买不买、拿不拿请自己判断，本页不构成投资建议。</p></section>';
    html += '<div class="fd-list">' + FUNDS.map(function (f, i) {
      var x = d.f[i], extra = [];
      var main = i === 1 ? wan(x.ail) + "<small>AiLGNS</small>" : wan(x.dai) + "<small>DAI</small>";
      if (i === 1) extra.push("另有 " + fmt(x.dai, 0) + " DAI");
      else if (x.ail >= 1) extra.push("另有 " + wan(x.ail) + " AiLGNS");
      if (x.lgns >= 1) extra.push("另有 " + wan(x.lgns) + " LGNS");
      return '<section class="fd-card' + (f.pool ? " pool" : "") + '"><div class="fd-head"><i>' + f.no + "</i><b>" + f.n + '</b><a href="#/scan/' + f.a.toLowerCase() + '">' + A.short(f.a) + " ›</a></div>" +
        '<div class="fd-amt num">' + main + "</div>" + (extra.length ? '<div class="fd-extra">' + extra.join(" · ") + "</div>" : "") +
        '<p class="fd-what">' + f.w + "</p></section>";
    }).join("") + "</div>";
    html += '<section class="card fd-foot"><p class="muted">数据时间：' + ago(d.at) + (state === "loading" ? " · 正在更新…" : "") + "（约 5 分钟更新一次）</p>" +
      "<details><summary>这些数字怎么来的？</summary><p>直接读 Anubis 链上这 7 个地址的余额，谁都可以自己核对：点每张卡片右上角的地址，就能在本站账本里看到它的每一笔进出。</p>" +
      "<p>每个池子的用途，是按官方公布的名称用大白话解释的；具体什么时候动用、怎么动用，以官方公告为准。本站只负责把链上余额原样读出来。</p>" +
      "<p>「家底厚 / 家底够 / 家底偏薄」是按数字自动算的：六个资金池的 DAI 合计 ÷ 底池里的 DAI，≥ 2 倍算厚，≥ 1 倍算够，不到 1 倍算偏薄。</p></details></section>";
    A.app.innerHTML = html;
  }
  A.pages.funds = function (id) {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(CACHE)); } catch (e) { st = null; }
    if (!ok(st)) st = null;
    draw(st, "loading");
    A.getJSON("/api/funds").then(function (d) { if (!ok(d)) throw new Error("bad"); return d; }).catch(function () { return direct(); }).then(function (d) {
      try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch (e) { /* 存不下就算了 */ }
      if (A.isCurrent(id)) draw(d, "done");
    }, function () { if (A.isCurrent(id)) draw(st, st ? "done" : "fail"); });
  };
})();
