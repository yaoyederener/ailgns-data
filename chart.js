// 📈 看盘（#/chart，站长 2026-11-25：「做一个 ave.ai 这样的看盘工具，目前仅上架我们这几只币」）
//   #/chart          币种列表：最新价、24 小时涨跌、小走势线、池子资金、24 小时成交额
//   #/chart/ailgns   单个币：大字现价 + 24 小时数据 + K 线（A.kchart）+ 实时成交 + 池子信息 + 去 OTC 买卖
//   #/chart/lp       LP 没有能直接卖的池子：只给参考价（otc.js 的 lpQuote，按里面含的币去 DEX 卖出到手折算）
// 数据：/api/dex（现价 / 池子 / 最近成交，8 秒缓存）+ /api/candles（K 线和 24 小时数据）。只看不交易，页面不碰钱包。
// 上新币：COINS 加一行 + functions/api/dex.js 的 MKS + functions/api/candles.js 的 MKS
(function () {
  "use strict";
  var A = window.AIL;
  var COINS = {
    ailgns: { sym: "AiLGNS", ico: "icons/tokens/ailgns.png?v=1", pd: 2, qd: 4, otc: "#/otc/ailgns", foot: "AiLGNS/DAI 官方 DEX 池子真实成交 · 北京时间 · 黄线 MA7 · 紫线 MA25" },
    lgns: { sym: "LGNS", ico: "icons/tokens/lgns.png?v=1", pd: 4, qd: 2, otc: "#/otc/lgns", foot: "LGNS/DAI 官方 DEX 池子真实成交 · 北京时间 · 黄线 MA7 · 紫线 MA25", tax: 1 },
    lp: { sym: "LP", full: "AiLGNS-LGNS 的 LP", ico: "icons/tokens/lp.png?v=2", lp: 1, otc: "#/otc/lp" }
  };
  var ORDER = ["ailgns", "lgns", "lp"];
  var ZH = !window.AIL_LANG || /^zh/i.test(window.AIL_LANG) || window.AIL_LANG === "hant";
  var mem = {}; // 这次打开期间读到的数据：从列表点进详情、再退回来都先用它画，不等网络
  var timer = 0;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  // 大数：中文用 万 / 亿，其它语言用 K / M / B
  function big(v) {
    v = Number(v) || 0;
    if (ZH) return v >= 1e8 ? num(v / 1e8, 2) + " 亿" : v >= 1e4 ? num(v / 1e4, 1) + " 万" : num(v, v >= 100 ? 0 : 2);
    return v >= 1e9 ? num(v / 1e9, 2) + "B" : v >= 1e6 ? num(v / 1e6, 2) + "M" : v >= 1e3 ? num(v / 1e3, 1) + "K" : num(v, v >= 100 ? 0 : 2);
  }
  function hms(t) { var d = new Date(t * 1000 + 8 * 3600e3), p = function (n) { return String(n).padStart(2, "0"); }; return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()); }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function T(s) { try { return window.AIL_LANG_T ? window.AIL_LANG_T(s) : s; } catch (e) { return s; } } // 拼进一整句里的小词，自己先翻好
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }); }

  // 24 小时数据：从 15 分钟 K 线（最近 97 根）里算。K 线不够 23 小时（历史还在补读）就不给涨跌，免得拿半天的数冒充一天
  function dayOf(c) {
    if (!c || !c.length) return null;
    var hi = -Infinity, lo = Infinity, vol = 0, cl = [];
    c.forEach(function (x) { if (x[2] > hi) hi = x[2]; if (x[3] < lo) lo = x[3]; vol += x[5] || 0; cl.push(x[4]); });
    var full = c.length >= 92, open = c[0][1], last = c[c.length - 1][4];
    return { hi: hi, lo: lo, vol: vol, cl: cl, full: full, chg: full && open > 0 ? (last / open - 1) * 100 : null };
  }
  function load(k) {
    var m = mem[k] || (mem[k] = {});
    return Promise.all([
      getJSON("/api/dex?m=" + k).then(function (d) { if (d && d.px > 0) m.dex = d; }, function () {}),
      getJSON("/api/candles?i=15m&n=97&m=" + k).then(function (d) { if (d && d.c && d.c.length) { m.day = dayOf(d.c); m.lag = d.lag || 0; } }, function () {})
    ]).then(function () { return m; });
  }
  function loadLp() {
    var m = mem.lp || (mem.lp = {}), kit = A.otcKit;
    if (!kit || !kit.lpQuote) return Promise.resolve(m);
    return kit.lpQuote().then(function (q) { m.q = q; return m; }, function () { return m; });
  }
  function chgHtml(v) { return v === null || v === undefined || !isFinite(v) ? '<span class="cht-chg na">—</span>' : '<span class="cht-chg ' + (v >= 0 ? "up" : "dn") + '">' + (v >= 0 ? "+" : "") + v.toFixed(2) + "%</span>"; }
  function spark(cl, up) {
    if (!cl || cl.length < 2) return '<svg class="cht-sp" viewBox="0 0 64 24"></svg>';
    var lo = Math.min.apply(null, cl), hi = Math.max.apply(null, cl), span = hi - lo || 1, n = cl.length;
    var pts = cl.map(function (v, i) { return (i / (n - 1) * 62 + 1).toFixed(1) + "," + (21 - (v - lo) / span * 18).toFixed(1); }).join(" ");
    return '<svg class="cht-sp" viewBox="0 0 64 24" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="' + (up ? "#0ecb81" : "#f6465d") + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  // ───────── 列表 ─────────
  function rowHtml(k) {
    var C = COINS[k], m = mem[k] || {}, px = "—", sub = "", chg = chgHtml(null), sp = spark(null);
    if (C.lp) {
      if (m.q) px = big(m.q.px);
      sub = "参考价 · 按含的币折算";
    } else {
      if (m.dex) { px = num(m.dex.px, C.pd); sub = T("池子") + " " + big(m.dex.liq); }
      if (m.day) { chg = chgHtml(m.day.chg); sp = spark(m.day.cl, m.day.chg === null ? m.day.cl[m.day.cl.length - 1] >= m.day.cl[0] : m.day.chg >= 0); if (m.day.full) sub += (sub ? " · " : "") + T("成交") + " " + big(m.day.vol); }
    }
    return '<a class="cht-row" href="#/chart/' + k + '"><img src="' + C.ico + '" alt="" width="34" height="34"><span class="cht-nm"><b>' + esc(C.sym) + '</b><small>' + esc(sub || (C.full || "")) + "</small></span>" + sp +
      '<span class="cht-r"><b>' + px + "</b>" + (C.lp ? '<span class="cht-chg na">DAI</span>' : chg) + "</span></a>";
  }
  function drawList() { var el = document.getElementById("cht-rows"); if (el) el.innerHTML = ORDER.map(rowHtml).join(""); }
  function pageList(id) {
    A.app.innerHTML = '<section class="card cht"><h2>📈 看盘</h2><p class="muted">官方 DEX 池子的真实价格和成交，几秒更新一次。先上架这几只，点进去看 K 线和实时成交。</p>' +
      '<div class="cht-h"><span>币种</span><span>最新价（DAI） / 24 小时</span></div><div id="cht-rows"></div>' +
      '<p class="muted cht-tip">这里只看行情，不动钱包。价格是池子的标价；LGNS 在 DEX 卖出要扣手续费，实际到手会比标价少。</p></section>';
    drawList();
    var tick = function () {
      if (!A.isCurrent(id)) { clearInterval(timer); return; }
      if (document.hidden) return;
      load("ailgns").then(function () { if (A.isCurrent(id)) drawList(); });
      load("lgns").then(function () { if (A.isCurrent(id)) drawList(); });
      loadLp().then(function () { if (A.isCurrent(id)) drawList(); });
    };
    tick(); timer = setInterval(tick, 15000);
  }

  // ───────── 单个币 ─────────
  function headHtml(k, sub) { var C = COINS[k]; return '<a class="cht-back" href="#/chart">‹ 全部币种</a><div class="cht-top"><img src="' + C.ico + '" alt="" width="40" height="40"><span class="cht-nm"><b>' + esc(C.sym) + ' <i>/ DAI</i></b><small>' + esc(sub) + "</small></span></div>"; }
  function cell(t, v) { return '<div><small>' + t + "</small><b>" + v + "</b></div>"; }
  function drawCoin(k) {
    var C = COINS[k], m = mem[k] || {}, d = m.dex, day = m.day, el;
    if ((el = document.getElementById("cht-px"))) el.innerHTML = "<b>" + (d ? num(d.px, C.pd) : "—") + "</b>" + chgHtml(day ? day.chg : null) + '<small>DAI · 24 小时</small>';
    if ((el = document.getElementById("cht-st"))) el.innerHTML =
      cell("24 小时最高", day && day.full ? num(day.hi, C.pd) : "—") + cell("24 小时最低", day && day.full ? num(day.lo, C.pd) : "—") + cell("24 小时成交额（DAI）", day && day.full ? big(day.vol) : "—") +
      cell("池子资金（DAI）", d ? big(d.liq) : "—") + cell("持币地址", d && d.info ? big(d.info.holders) : "—") + cell("发行总量", d && d.info ? big(d.info.supply) : "—");
    if ((el = document.getElementById("cht-lag"))) el.textContent = day && !day.full ? "K 线历史还在补读，24 小时数据补齐后显示。" : "";
    if ((el = document.getElementById("cht-pool"))) el.innerHTML = d ? "<span>池子里现在有：</span><b>" + big(d.coin) + " " + esc(C.sym) + "</b> + <b>" + big(d.dai) + " DAI</b>" + (C.tax ? "<br><span>LGNS 在 DEX 卖出要扣手续费（比例会变），实际到手比标价少，卖之前可以先看看本站 OTC 的买单。</span>" : "") : "";
    if ((el = document.getElementById("cht-tr"))) {
      var list = d && d.list ? d.list : null;
      el.innerHTML = !list ? '<p class="muted">读取中…</p>' : !list.length ? '<p class="muted">最近一会儿没有成交</p>' :
        '<div class="cht-th"><span>时间</span><span>方向</span><span>金额（DAI）</span><span>数量</span><span>钱包</span></div>' + list.map(function (x) {
          var b = x.s === "b";
          return '<a class="cht-t ' + (b ? "up" : "dn") + '" href="#/scan/tx/' + esc(x.tx) + '"><span>' + hms(x.t) + "</span><span>" + (b ? "买入" : "卖出") + "</span><span>" + num(x.d, 2) + "</span><span>" + num(x.q, C.qd) + '</span><span class="cht-a">' + esc(short(x.a)) + "</span></a>";
        }).join("");
    }
  }
  var kc = null;
  function pageCoin(id, k) {
    var C = COINS[k];
    A.app.innerHTML = '<section class="card cht">' + headHtml(k, "官方 DEX 池子价") +
      '<div class="cht-px" id="cht-px"></div><div class="cht-st" id="cht-st"></div><p class="muted cht-tip" id="cht-lag"></p>' +
      '<div id="cht-k"></div>' +
      '<a class="btn cht-go" href="' + C.otc + '">去本站 OTC 买卖 ' + esc(C.sym) + '</a>' +
      '<h3 class="cht-h3">实时成交</h3><div class="cht-trs" id="cht-tr"></div>' +
      '<h3 class="cht-h3">池子</h3><p class="muted cht-tip" id="cht-pool"></p></section>';
    drawCoin(k);
    if (kc) { try { kc.stop(); } catch (e) {} kc = null; }
    try { if (A.kchart) kc = A.kchart(document.getElementById("cht-k"), { i: "15m", m: k === "ailgns" ? "" : k, d: C.pd, foot: C.foot, alive: function () { return A.isCurrent(id); } }); } catch (e) {}
    var tick = function () {
      if (!A.isCurrent(id)) { clearInterval(timer); return; }
      if (document.hidden) return;
      load(k).then(function () { if (A.isCurrent(id)) drawCoin(k); });
    };
    tick(); timer = setInterval(tick, 9000);
  }

  // ───────── LP ─────────
  function drawLp() {
    var m = mem.lp || {}, q = m.q, el;
    if ((el = document.getElementById("cht-px"))) el.innerHTML = "<b>" + (q ? big(q.px) : "—") + '</b><small>DAI / 1 个 LP（参考价）</small>';
    if ((el = document.getElementById("cht-st")) && q) el.innerHTML =
      cell("1 个 LP 含 AiLGNS", num(q.ail, 2)) + cell("1 个 LP 含 LGNS", big(q.lgns)) + cell("LGNS 卖出手续费", (q.tax * 100).toFixed(1) + "%") +
      cell("AiLGNS 这部分值", big(q.vAil) + " DAI") + cell("LGNS 这部分值", big(q.vLgns) + " DAI") + cell("合计", big(q.px) + " DAI");
  }
  function pageLp(id) {
    A.app.innerHTML = '<section class="card cht">' + headHtml("lp", "AiLGNS-LGNS 的 LP · 参考价") +
      '<div class="cht-px" id="cht-px"></div><div class="cht-st" id="cht-st"></div>' +
      '<p class="muted cht-tip">LP 现在拆不开，DEX 上也没有能直接卖 LP 的池子，所以没有 K 线和成交记录。这个参考价是按「1 个 LP 里含的 AiLGNS 和 LGNS，拿去 DEX 卖出实际到手多少 DAI」折算的，会随行情和 LGNS 卖出手续费变化，只供参考。</p>' +
      '<a class="btn cht-go" href="#/otc/lp">去本站 LP 市场买卖</a></section>';
    drawLp();
    var tick = function () {
      if (!A.isCurrent(id)) { clearInterval(timer); return; }
      if (document.hidden) return;
      loadLp().then(function () { if (A.isCurrent(id)) drawLp(); });
    };
    tick(); timer = setInterval(tick, 30000);
  }

  A.pages.chart = function (id) {
    clearInterval(timer);
    if (kc) { try { kc.stop(); } catch (e) {} kc = null; }
    var k = (location.hash.split("/")[2] || "").toLowerCase().split("?")[0];
    try {
      if (k === "lp") pageLp(id);
      else if (COINS[k]) pageCoin(id, k);
      else pageList(id);
    } catch (e) { A.app.innerHTML = '<section class="card"><p class="muted">看盘页没打开，请刷新再试。</p></section>'; }
  };
})();
