// 📊 交易所式盘口（#/trade，2026-11-05 站长定）：把本站 OTC 的链上挂单做成「订单簿 + 深度 + K 线 + 一键买卖」的交易所界面
// 撮合还是现有 OTC 合约：限价单 = create 挂单；市价单 = 从最优价开始逐张 fill 吃单。只做前端，不碰合约。复用 otc.js 暴露的 A.otcKit
(function () {
  "use strict";
  var A = window.AIL;
  var K = function () { return A.otcKit; };
  var SEL = { create: "0x9128a740", fill: "0x6fe4a448", cancel: "0x40e58ee5", approve: "0x095ea7b3" };
  var MAX_UINT = (1n << 256n) - 1n, MIN_DAI = 10n ** 18n;
  var MK = "ailgns", M, OTC, TOKEN, DAI, TD, SYM, PD;
  var liveCtl = null;
  function startLive() {
    var el = document.getElementById("tr-k"); if (!el || !A.kchart) return;
    if (liveCtl) liveCtl.stop();
    liveCtl = A.kchart(el, { i: "5m", alive: function () { return A.isCurrent(rid); } });
  }

  var book = { asks: [], bids: [], all: [], mkt: 0 }, fills = [], side = "buy", type = "limit", account = null, rid = 0, timer = 0, kcache = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function ceilDiv(a, b) { return (a + b - 1n) / b; }
  function num(w, d) { return Number(w) / Math.pow(10, d === undefined ? 18 : d); }
  function f(v, d) { return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function f2(v) { return f(v, PD); }
  function fq(v) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 4 }); }
  function toWei(s, d) { s = String(s || "0").trim(); if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return 0n; var p = s.split("."), a = p[0] || "0", b = (p[1] || "").slice(0, d).padEnd(d, "0"); return BigInt(a) * 10n ** BigInt(d) + BigInt(b || "0"); }
  function priceOf(o) { return o.sellAilgns ? num(o.wantTotal) / num(o.giveTotal, TD) : num(o.giveTotal) / num(o.wantTotal, TD); }
  function leftCoin(o) { return o.sellAilgns ? o.giveLeft : o.giveTotal > 0n ? o.giveLeft * o.wantTotal / o.giveTotal : 0n; } // 这张单还能成交多少币
  function leftDai(o) { return o.sellAilgns ? (o.giveTotal > 0n ? ceilDiv(o.giveLeft * o.wantTotal, o.giveTotal) : 0n) : o.giveLeft; }
  function bj(ts) { var d = new Date(ts * 1000 + 8 * 3600e3); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + ":" + String(d.getUTCSeconds()).padStart(2, "0"); }

  function parseOrders(r, from) {
    if (!r || r === "0x") return [];
    var w = r.slice(2).match(/.{64}/g) || [], n = Number(BigInt("0x" + w[1])), list = [];
    for (var i = 0; i < n; i++) {
      var o = w.slice(2 + i * 7, 9 + i * 7); if (o.length < 7) break;
      list.push({ id: from + i, maker: "0x" + o[0].slice(24), sellAilgns: BigInt("0x" + o[1]) === 1n, open: BigInt("0x" + o[2]) === 1n, expiry: Number(BigInt("0x" + o[3])), giveTotal: BigInt("0x" + o[4]), wantTotal: BigInt("0x" + o[5]), giveLeft: BigInt("0x" + o[6]) });
    }
    return list;
  }
  function loadBook(fresh) {
    return fetch("/api/book?m=" + MK + (fresh ? "&fresh=1" : "")).then(function (r) { return r.json(); }).then(function (j) {
      var now = Date.now() / 1000, all = parseOrders(j.orders, Number(j.from || 0));
      var live = all.filter(function (o) { return o.open && o.expiry > now && o.giveLeft > 0n && leftDai(o) >= MIN_DAI; });
      var asks = live.filter(function (o) { return o.sellAilgns; }).sort(function (a, b) { return priceOf(a) - priceOf(b); });
      var bids = live.filter(function (o) { return !o.sellAilgns; }).sort(function (a, b) { return priceOf(b) - priceOf(a); });
      var mkt = 0;
      if (j.reserves) { var w = j.reserves.slice(2).match(/.{64}/g); var r0 = Number(BigInt("0x" + w[0])), r1 = Number(BigInt("0x" + w[1])); mkt = M.pairDai === 1 ? (r1 / 1e18) / (r0 / Math.pow(10, TD)) : (r0 / 1e18) / (r1 / Math.pow(10, TD)); }
      book = { asks: asks, bids: bids, all: all, mkt: mkt };
    });
  }
  function loadFills() { return fetch("/api/fills?m=" + MK).then(function (r) { return r.json(); }).then(function (j) { fills = j.list || []; }, function () {}); }

  // 深度聚合：同一价格（保留 PD 位小数）合并
  function agg(list, n) {
    var m = {}, keys = [];
    list.forEach(function (o) { var p = priceOf(o).toFixed(PD); if (!m[p]) { m[p] = { p: Number(p), coin: 0, dai: 0, ids: [] }; keys.push(p); } m[p].coin += num(leftCoin(o), TD); m[p].dai += num(leftDai(o)); m[p].ids.push(o.id); });
    var rows = keys.map(function (k) { return m[k]; }).slice(0, n), cum = 0;
    rows.forEach(function (r) { cum += r.coin; r.cum = cum; });
    return rows;
  }

  // ---------- 页面 ----------
  function page(id) {
    rid = id; clearInterval(timer); if (liveCtl) { liveCtl.stop(); liveCtl = null; }
    M = A.otcKit.M(); if (M.otc !== "0x4e730be6d46be71223ded5a32dc45799f6d4bc15") { K().useMarket("ailgns"); M = K().M(); }
    OTC = M.otc; TOKEN = M.token; DAI = M.dai; TD = M.dec; SYM = M.sym; PD = M.pd;
    A.app.innerHTML =
      '<div class="tr2">' +
      // 顶部价格条（交易所手机版样式：币对 + 大字最新价 + 24h 数据）
      '<section class="tr2-top"><div class="tr2-pair"><b>' + SYM + '/DAI</b><small>OTC 担保 · 吃单费 1%</small></div><div class="tr2-last" id="tr-stats"><b>—</b></div></section>' +
      '<nav class="tr2-tabs" id="tr2-tabs"><button type="button" class="on" data-pane="trade">交易</button><button type="button" data-pane="k">K 线</button><button type="button" data-pane="fills">成交</button></nav>' +
      // 交易面板：左下单、右盘口
      '<div class="tr2-pane" data-pane="trade">' +
        '<div class="tr2-main">' +
          '<section class="tr2-form tr-form">' +
            '<div class="tr-side tr2-side"><button type="button" class="on buy" data-side="buy">买入</button><button type="button" class="sell" data-side="sell">卖出</button></div>' +
            '<div class="tr-type tr2-type"><button type="button" class="on" data-type="limit">限价</button><button type="button" data-type="market">市价</button></div>' +
            '<div class="tr2-in tr2-step" id="tr-pbox"><button type="button" class="tr2-pm" data-step="-1">−</button><label><span>价格</span><input id="tr-p" inputmode="decimal" autocomplete="off"></label><button type="button" class="tr2-pm" data-step="1">+</button></div>' +
            '<label class="tr2-in"><span>数量 (' + SYM + ')</span><input id="tr-a" inputmode="decimal" autocomplete="off" placeholder="0"></label>' +
            '<div class="tr-pct tr2-pct"><button type="button" data-pct="25">25%</button><button type="button" data-pct="50">50%</button><button type="button" data-pct="75">75%</button><button type="button" data-pct="100">100%</button></div>' +
            '<label class="tr2-in"><span>总额 (DAI)</span><input id="tr-t" inputmode="decimal" autocomplete="off" placeholder="0"></label>' +
            '<div class="tr2-meta"><span class="muted" id="tr-bal"></span><input type="hidden" id="tr-dur" value="' + K().DUR_DEFAULT + '"></div><div class="tr2-durbox" id="tr-durbox"></div>' +
            '<p class="muted tr-note" id="tr-note"></p>' +
            '<button type="button" class="tr-go buy" id="tr-go">买入 ' + SYM + '</button><p class="muted nm-st" id="tr-st"></p>' +
          '</section>' +
          '<section class="tr2-book"><div class="tr2-bh"><span>价格(DAI)</span><span>数量(' + SYM + ')</span></div><div id="tr-bk">读取中…</div><p class="muted tr2-mid" id="tr-mid"></p></section>' +
        '</div>' +
        '<section class="card tr2-orders"><div class="tr2-otabs"><button type="button" class="on" data-o="my">当前委托<i id="tr2-myn"></i></button><button type="button" data-o="fills">最近成交</button><button type="button" class="ghost tr2-conn" id="tr-conn">连接钱包</button></div>' +
          '<div id="tr-my" class="tr2-opane">连接钱包后显示你在挂的单</div><div id="tr-tl" class="tr2-opane" hidden>读取中…</div></section>' +
      '</div>' +
      '<div class="tr2-pane" data-pane="k" hidden><section class="card tr-k"><div id="tr-k" class="or-kc tr-kc"></div></section></div>' +
      '<div class="tr2-pane" data-pane="fills" hidden><section class="card"><div class="card-head"><h2>🕒 最近成交</h2><span class="muted">全站 · 北京时间</span></div><div id="tr-tl2"></div></section></div>' +
      // 手机底部固定买卖按钮
      '<div class="tr2-bar"><button type="button" class="buy" data-bar="buy">买入</button><button type="button" class="sell" data-bar="sell">卖出</button></div>' +
      '</div>';
    bind();
    refresh(true);
    if (matchMedia("(min-width: 901px)").matches) startLive(); // 电脑：K 线常驻；手机：点「K 线」标签再画
    document.querySelectorAll(".tr-ktabs button").forEach(function (b) { b.onclick = function () { document.querySelectorAll(".tr-ktabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); if (b.getAttribute("data-k") === "live") startLive(); else { if (liveCtl) { liveCtl.stop(); liveCtl = null; } document.getElementById("tr-ktip").textContent = "参考：DEX 1 小时线，最近 24 小时"; drawKline(); } }; });
    timer = setInterval(function () { if (!A.isCurrent(rid)) return clearInterval(timer); refresh(false); }, 8000);
    K().silentAccount().then(function () { account = K().account(); if (account) afterConnect(); });
  }
  function refresh(first) {
    return Promise.all([loadBook(false), loadFills()]).then(function () { if (!A.isCurrent(rid)) return; renderStats(); renderBook(); renderTrades(); if (account) renderMine(); if (first) setDefaultPrice(); updateBal(); }).catch(function () {});
  }
  function bestAsk() { return book.asks.length ? priceOf(book.asks[0]) : 0; }
  function bestBid() { return book.bids.length ? priceOf(book.bids[0]) : 0; }
  function renderStats() {
    var last = fills[0], vol = 0, hi = 0, lo = Infinity, since = Date.now() / 1000 - 86400, first24 = null;
    fills.forEach(function (x) { if (x.t >= since) { vol += x.dai; hi = Math.max(hi, x.px); lo = Math.min(lo, x.px); first24 = x; } });
    var el = document.getElementById("tr-stats"); if (!el) return;
    var px = last ? last.px : (bestAsk() && bestBid() ? (bestAsk() + bestBid()) / 2 : book.mkt), chg = last && first24 && first24.px ? (last.px / first24.px - 1) * 100 : 0, up = chg >= 0;
    el.innerHTML = '<div class="tr2-px"><b class="' + (up ? "up" : "dn") + '">' + (px ? f2(px) : "—") + '</b><small>≈ DEX ' + (book.mkt ? f2(book.mkt) : "—") + ' · <span class="' + (up ? "up" : "dn") + '">' + (up ? "+" : "") + chg.toFixed(2) + "%</span></small></div>" +
      '<div class="tr2-24"><div><small>24h 高</small><b>' + (hi ? f2(hi) : "—") + '</b></div><div><small>24h 低</small><b>' + (lo < Infinity ? f2(lo) : "—") + '</b></div><div><small>24h 量(DAI)</small><b>' + f(vol, 0) + "</b></div></div>";
    var mid = document.getElementById("tr-mid"); if (mid) mid.textContent = "买 " + book.bids.length + " 张 · 卖 " + book.asks.length + " 张" + (bestAsk() && bestBid() ? " · 价差 " + f2(bestAsk() - bestBid()) : "");
  }
  function renderBook() {
    var el = document.getElementById("tr-bk"); if (!el) return;
    var N = matchMedia("(min-width: 901px)").matches ? 9 : 6;
    var asks = agg(book.asks, N), bids = agg(book.bids, N), max = Math.max(asks.length ? asks[asks.length - 1].cum : 0, bids.length ? bids[bids.length - 1].cum : 0, 1e-9);
    var row = function (r, cls) { return '<div class="tr2-row ' + cls + '" data-p="' + r.p + '" style="--w:' + Math.min(100, r.cum / max * 100).toFixed(1) + '%"><span>' + f2(r.p) + "</span><span>" + fq(r.coin) + "</span></div>"; };
    var last = fills[0], prev = fills[1], lcls = last && prev && last.px < prev.px ? "dn" : "up";
    var fill = function (list, cls) { var h = list.map(function (r) { return row(r, cls); }).join(""); for (var k = list.length; k < N; k++) h += '<div class="tr2-row empty"><span>—</span><span></span></div>'; return h; };
    var sig = JSON.stringify([asks, bids].map(function (l) { return l.map(function (r) { return [r.p, r.coin]; }); }));
    if (el.getAttribute("data-sig") && el.getAttribute("data-sig") !== sig) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); } // 有变化：整块闪一下，像扫单
    el.setAttribute("data-sig", sig);
    el.innerHTML = '<div class="tr2-asks">' + fill(asks.slice().reverse(), "ask") + '</div>' +
      '<div class="tr2-last2"><b class="' + lcls + '">' + (last ? f2(last.px) : bestAsk() && bestBid() ? f2((bestAsk() + bestBid()) / 2) : "—") + (last ? (lcls === "up" ? " ↑" : " ↓") : "") + "</b><small>≈ DEX " + (book.mkt ? f2(book.mkt) : "—") + "</small></div>" +
      '<div class="tr2-bids">' + fill(bids, "bid") + "</div>";
    el.querySelectorAll(".tr2-row[data-p]").forEach(function (r) { r.onclick = function () { setSide(r.classList.contains("ask") ? "buy" : "sell"); setType("limit"); document.getElementById("tr-p").value = r.getAttribute("data-p"); recalc("p"); }; });
  }
  function renderTrades() {
    var el = document.getElementById("tr-tl"); if (!el) return;
    var el2 = document.getElementById("tr-tl2");
    el.innerHTML = fills.length ? '<div class="tr-th"><span>时间</span><span>价格</span><span>数量</span><span>DAI</span></div>' + fills.slice(0, 30).map(function (x, i) {
      var prev = fills[i + 1], cls = prev && x.px < prev.px ? "dn" : "up";
      return '<div class="tr-trow ' + cls + '"><span>' + bj(x.t) + "</span><span>" + f2(x.px) + "</span><span>" + fq(x.dai / x.px) + "</span><span>" + f(x.dai, 2) + "</span></div>";
    }).join("") : '<p class="muted">最近还没有成交记录（从盘口上线起统计）</p>';
    if (el2) el2.innerHTML = el.innerHTML;
  }
  function setDefaultPrice() { var p = document.getElementById("tr-p"); if (p && !p.value) { p.value = (side === "buy" ? bestAsk() || bestBid() || book.mkt : bestBid() || bestAsk() || book.mkt).toFixed(PD); recalc("p"); } }

  // ---------- K 线（DEX 小时线，复用预言家页的画法） ----------
  function drawKline() {
    var el = document.getElementById("tr-k"); if (!el) return;
    fetch("/api/kline").then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(rid) || !d.c) return;
      var c = d.c.map(function (x) { return { t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] }; });
      var W0 = Math.max(240, el.clientWidth || 360), H0 = Math.max(160, el.clientHeight || 200), L = 6, R = W0 - 66, T = 10, B = H0 - 24, hi = -Infinity, lo = Infinity;
      c.forEach(function (x) { hi = Math.max(hi, x.h); lo = Math.min(lo, x.l); });
      var pad = (hi - lo) * 0.08 || 0.5; hi += pad; lo -= pad;
      var y = function (p) { return T + (hi - p) / (hi - lo) * (B - T); }, cw = (R - L) / c.length, svg = "";
      for (var g = 0; g <= 4; g++) { var gp = lo + (hi - lo) * g / 4, gy = y(gp); svg += '<line x1="' + L + '" x2="' + R + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" class="or-grid"/><text x="' + (R + 6) + '" y="' + (gy + 4).toFixed(1) + '" class="or-ct">' + gp.toFixed(2) + "</text>"; }
      c.forEach(function (x, i) {
        var cx = L + cw * i + cw / 2, up = x.c >= x.o, col = up ? "or-up" : "or-dn", top = y(Math.max(x.o, x.c)), bot = y(Math.min(x.o, x.c));
        var dt = new Date((x.t + 8 * 3600) * 1000), hh = String(dt.getUTCHours()).padStart(2, "0") + ":00";
        svg += '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + y(x.h).toFixed(1) + '" y2="' + y(x.l).toFixed(1) + '" class="' + col + '"/><rect x="' + (cx - cw * 0.32).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (cw * 0.64).toFixed(1) + '" height="' + Math.max(1, bot - top).toFixed(1) + '" class="' + col + '"/>';
        if (i % 6 === 0) svg += '<text x="' + Math.max(cx, 18).toFixed(1) + '" y="' + (H0 - 7) + '" text-anchor="middle" class="or-ct">' + hh + "</text>";
      });
      var lastC = c[c.length - 1];
      svg += '<line x1="' + L + '" x2="' + R + '" y1="' + y(lastC.c).toFixed(1) + '" y2="' + y(lastC.c).toFixed(1) + '" class="or-lastl"/><rect x="' + (R + 1) + '" y="' + (y(lastC.c) - 9).toFixed(1) + '" width="60" height="18" rx="4" class="or-lastb"/><text x="' + (R + 31) + '" y="' + (y(lastC.c) + 4).toFixed(1) + '" text-anchor="middle" class="or-lastt">' + lastC.c.toFixed(2) + "</text>";
      el.setAttribute("viewBox", "0 0 " + W0 + " " + H0); el.innerHTML = svg;
    }).catch(function () {});
  }

  // ---------- 下单框 ----------
  function setSide(s) { side = s; var root = document.querySelector(".tr2"); if (root) root.setAttribute("data-side", s); document.querySelectorAll(".tr-side button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-side") === s); }); var go = document.getElementById("tr-go"); go.className = "tr-go " + s; go.textContent = (s === "buy" ? "买入 " : "卖出 ") + SYM; updateBal(); recalc("a"); }
  function setType(t) { type = t; document.querySelectorAll(".tr-type button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-type") === t); }); document.getElementById("tr-pbox").style.display = t === "market" ? "none" : ""; document.getElementById("tr-durbox").style.display = t === "market" ? "none" : ""; recalc("a"); }
  var bal = { dai: 0n, coin: 0n };
  function updateBal() {
    var el = document.getElementById("tr-bal"); if (!el) return;
    if (!account) { el.textContent = ""; return; }
    Promise.all([K().balance(DAI, account), K().balance(TOKEN, account)]).then(function (b) { bal = { dai: b[0], coin: b[1] }; if (el) el.textContent = "可用 " + (side === "buy" ? f(num(bal.dai), 2) + " DAI" : fq(num(bal.coin, TD)) + " " + SYM); }).catch(function () {});
  }
  // 市价：从最优价开始吃，算出能成交多少、平均价多少
  function plan(coinWant) { // coinWant: BigInt 币数量
    var list = side === "buy" ? book.asks : book.bids, steps = [], left = coinWant, daiSum = 0n, coinSum = 0n;
    for (var i = 0; i < list.length && left > 0n; i++) {
      var o = list[i], cap = leftCoin(o), take = left < cap ? left : cap; if (take <= 0n) continue;
      var amount, pay;
      if (o.sellAilgns) { amount = take; pay = ceilDiv(amount * o.wantTotal, o.giveTotal); daiSum += pay; coinSum += amount; } // 买：拿走币，付 DAI
      else { amount = take * o.giveTotal / o.wantTotal; pay = ceilDiv(amount * o.wantTotal, o.giveTotal); daiSum += amount; coinSum += pay; } // 卖：拿走 DAI，付币
      if (amount <= 0n) continue;
      steps.push({ o: o, amount: amount, pay: pay }); left -= take;
    }
    return { steps: steps, dai: daiSum, coin: coinSum, short: left };
  }
  function recalc(from) {
    var p = document.getElementById("tr-p"), a = document.getElementById("tr-a"), t = document.getElementById("tr-t"), note = document.getElementById("tr-note"); if (!p || !a || !t) return;
    if (type === "limit") {
      var px = Number(p.value) || 0;
      if (from === "t" && px) a.value = px ? (Number(t.value) / px).toFixed(4) : ""; else if (px) t.value = (Number(a.value) * px).toFixed(2);
      var total = Number(t.value) || 0;
      note.innerHTML = total && total < 50 ? '<b class="nm-bad">挂单最少 50 DAI</b>' : px && book.mkt ? "比 DEX 现价" + (px >= book.mkt ? "高 " : "低 ") + Math.abs((px / book.mkt - 1) * 100).toFixed(2) + "%" + (side === "buy" && bestAsk() && px >= bestAsk() ? " · 价格已到卖一，建议用市价直接成交" : side === "sell" && bestBid() && px <= bestBid() ? " · 价格已到买一，建议用市价直接成交" : " · 挂单不收手续费，成交由对方付") : "";
    } else {
      var coin = toWei(a.value, TD), pl = plan(coin);
      if (from === "t") { // 按 DAI 反推数量：粗算按最优价
        var ref = side === "buy" ? bestAsk() : bestBid(); if (ref) { a.value = (Number(t.value) / ref).toFixed(4); coin = toWei(a.value, TD); pl = plan(coin); }
      }
      t.value = pl.dai > 0n ? num(pl.dai).toFixed(2) : "";
      var avg = pl.coin > 0n ? num(pl.dai) / num(pl.coin, TD) : 0;
      note.innerHTML = !coin ? "市价 = 从最优价开始逐张吃单，直到买够 / 卖够" : pl.steps.length ? "预计吃 " + pl.steps.length + " 张单，均价 <b>" + f2(avg) + "</b>" + (pl.short > 0n ? '，<b class="nm-bad">盘口不够，只能成交 ' + fq(num(pl.coin, TD)) + " " + SYM + "</b>" : "") + "，手续费 1% 从收到的币里扣" : '<b class="nm-bad">盘口没有可成交的单</b>';
    }
  }
  function bind() {
    document.querySelectorAll(".tr-side button").forEach(function (b) { b.onclick = function () { setSide(b.getAttribute("data-side")); document.getElementById("tr-p").value = ""; setDefaultPrice(); }; });
    document.querySelectorAll(".tr-type button").forEach(function (b) { b.onclick = function () { setType(b.getAttribute("data-type")); }; });
    document.getElementById("tr-p").oninput = function () { recalc("p"); };
    document.getElementById("tr-a").oninput = function () { recalc("a"); };
    document.getElementById("tr-t").oninput = function () { recalc("t"); };
    document.querySelectorAll(".tr-pct button").forEach(function (b) {
      b.onclick = function () {
        if (!account) return connectBtn();
        var pct = BigInt(b.getAttribute("data-pct"));
        if (side === "sell") { document.getElementById("tr-a").value = num(bal.coin * pct / 100n, TD).toFixed(4); recalc("a"); }
        else { document.getElementById("tr-t").value = num(bal.dai * pct / 100n).toFixed(2); recalc("t"); }
      };
    });
    document.getElementById("tr-conn").onclick = connectBtn;
    document.getElementById("tr-go").onclick = submit;
    if (K().durSlider) K().durSlider(document.getElementById("tr-durbox"), { value: K().DUR_DEFAULT, label: "有效期", onChange: function (sec) { document.getElementById("tr-dur").value = sec ? String(sec) : ""; } });
    // 顶级标签：交易 / K 线 / 成交
    document.querySelectorAll("#tr2-tabs button").forEach(function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-pane");
        document.querySelectorAll("#tr2-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
        document.querySelectorAll(".tr2-pane").forEach(function (x) { x.hidden = x.getAttribute("data-pane") !== p; });
        if (p === "k") startLive(); else if (liveCtl && !matchMedia("(min-width: 901px)").matches) { liveCtl.stop(); liveCtl = null; }
        if (p === "fills") renderTrades();
      };
    });
    // 当前委托 / 最近成交
    document.querySelectorAll(".tr2-otabs button[data-o]").forEach(function (b) {
      b.onclick = function () { var o = b.getAttribute("data-o"); document.querySelectorAll(".tr2-otabs button[data-o]").forEach(function (x) { x.classList.toggle("on", x === b); }); document.getElementById("tr-my").hidden = o !== "my"; document.getElementById("tr-tl").hidden = o !== "fills"; };
    });
    // 价格 ± 步进
    document.querySelectorAll(".tr2-pm").forEach(function (b) {
      b.onclick = function () { var p = document.getElementById("tr-p"), step = Math.pow(10, -PD), v = (Number(p.value) || book.mkt || 0) + Number(b.getAttribute("data-step")) * step; if (v > 0) { p.value = v.toFixed(PD); recalc("p"); } };
    });
    // 手机底部固定买 / 卖：切方向并滚到下单框
    document.querySelectorAll(".tr2-bar button").forEach(function (b) {
      b.onclick = function () { var tb = document.querySelector('#tr2-tabs button[data-pane="trade"]'); if (tb && !tb.classList.contains("on")) tb.click(); setSide(b.getAttribute("data-bar")); document.getElementById("tr-p").value = ""; setDefaultPrice(); var f = document.querySelector(".tr2-form"); if (f) window.scrollTo({ top: f.getBoundingClientRect().top + window.pageYOffset - 70, behavior: "smooth" }); };
    });
  }
  function connectBtn() { return K().connect().then(function (a) { account = a; afterConnect(); }, function (e) { A.errTip(K().niceError(e), document.getElementById("tr-conn")); }); }
  function afterConnect() { var c = document.getElementById("tr-conn"); if (c) c.textContent = A.short(account); updateBal(); renderMine(); }
  function ensureAllowance(token, amount, say, name) {
    return K().allowance(token, account, OTC).then(function (al) { if (al >= amount) return; return K().send(token, SEL.approve + u256(OTC) + u256(MAX_UINT), say, "授权 " + name + " 给托管合约（只需一次，以后不用再授权）"); });
  }
  function submit() {
    var go = document.getElementById("tr-go"), st = document.getElementById("tr-st"), say = function (t) { st.textContent = t; };
    var coin = toWei(document.getElementById("tr-a").value, TD);
    if (coin <= 0n) return A.errTip("先填数量", document.getElementById("tr-a"));
    go.disabled = true;
    K().ready().then(function () {
      account = K().account(); afterConnect();
      if (type === "limit") {
        var px = Number(document.getElementById("tr-p").value) || 0, dai = toWei((num(coin, TD) * px).toFixed(6), 18), dur = Number(document.getElementById("tr-dur").value);
        if (!px) throw new Error("先填价格");
        var mk = book && book.mkt, dv = mk ? px / mk - 1 : 0; // 🛡️ 离市价超过 10% 的亏损单不让提交（不赚客户手滑的钱）
        if (mk && (side === "sell" ? dv < -0.10 : dv > 0.10)) throw new Error("🛡️ 先别急：你的" + (side === "sell" ? "要价比市价 " + f2(mk) + " 低了 " + Math.round(-dv * 100) + "%，挂出去马上会被低价买走，你会亏 " + Math.round(-dv * 100) + "%" : "出价比市价 " + f2(mk) + " 高了 " + Math.round(dv * 100) + "%，挂出去马上会被高价卖给你，你会多付 " + Math.round(dv * 100) + "%") + "。是不是小数点填错了？本站不让离市价超过 10% 的亏损单提交，请改一下价格。");
        if (dai < 50n * 10n ** 18n) throw new Error("挂单最少 50 DAI");
        var sell = side === "sell", give = sell ? coin : dai, want = sell ? dai : coin, token = sell ? TOKEN : DAI, name = sell ? SYM : "DAI";
        return K().balance(token, account).then(function (b) {
          if (b < give) throw new Error((sell ? SYM : "DAI") + " 余额不够：有 " + (sell ? fq(num(b, TD)) : f(num(b), 2)) + "，需要 " + (sell ? fq(num(give, TD)) : f(num(give), 2)));
          return ensureAllowance(token, give, say, name);
        }).then(function () { return K().send(OTC, SEL.create + u256(sell ? 1 : 0) + u256(give) + u256(want) + u256(dur), say, "发布挂单"); })
          .then(function () { say("✅ 挂单成功，已经在盘口上了"); });
      }
      // 市价：先刷新盘口，再逐张吃（每张吃之前再读一次，被人抢先就跳过）
      return loadBook(true).then(function () {
        var pl = plan(coin);
        if (!pl.steps.length) throw new Error("盘口没有可成交的单");
        var token = side === "buy" ? DAI : TOKEN, need = side === "buy" ? pl.dai : pl.coin;
        return K().balance(token, account).then(function (b) {
          if (b < need) throw new Error((side === "buy" ? "DAI" : SYM) + " 余额不够：需要 " + (side === "buy" ? f(num(need), 2) + " DAI" : fq(num(need, TD)) + " " + SYM));
          return ensureAllowance(token, need, say, side === "buy" ? "DAI" : SYM);
        }).then(function () {
          var i = 0, done = 0;
          function next() {
            if (i >= pl.steps.length) return done;
            var s = pl.steps[i++], tag = "成交第 " + i + " / " + pl.steps.length + " 张（#" + s.o.id + "）";
            return K().read(OTC, "0x8f72fc77" + u256(s.o.id) + u256(1)).then(function (h) {
              var o = parseOrders(h, s.o.id)[0];
              if (!o || !o.open || o.giveLeft === 0n) return next();
              var amount = s.amount > o.giveLeft ? o.giveLeft : s.amount, pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
              return K().send(OTC, SEL.fill + u256(o.id) + u256(amount) + u256(pay), function (t) { say(tag + "：" + t); }, "成交").then(function () { done++; return next(); });
            });
          }
          return next();
        }).then(function (n) { say(n ? "✅ 成交 " + n + " 张，币已到账（手续费 1% 已从收到的币里扣）" : "没成交：挂单刚被别人吃掉了，刷新盘口再试"); });
      });
    }).then(function () { go.disabled = false; document.getElementById("tr-a").value = ""; document.getElementById("tr-t").value = ""; return refresh(false); })
      .catch(function (e) { go.disabled = false; say(""); A.errTip(K().niceError(e), go); });
  }
  // 我的委托：在挂的单 + 撤单
  function renderMine() {
    var el = document.getElementById("tr-my"); if (!el || !account) return;
    var now = Date.now() / 1000, mine = book.all.filter(function (o) { return o.maker === account && o.open && o.giveLeft > 0n; });
    var nb = document.getElementById("tr2-myn"); if (nb) nb.textContent = mine.length ? " " + mine.length : "";
    el.innerHTML = mine.length ? mine.map(function (o) {
      var sell = o.sellAilgns, p = priceOf(o);
      return '<div class="tr-myrow"><span class="' + (sell ? "dn" : "up") + '">' + (sell ? "卖出" : "买入") + "</span><span>" + f2(p) + "</span><span>" + fq(num(leftCoin(o), TD)) + " " + SYM + "</span><span>" + f(num(leftDai(o)), 2) + ' DAI</span><span class="muted">' + (o.expiry > now ? K().left(o.expiry - now) : "已到期") + '</span><button type="button" class="ghost" data-cancel="' + o.id + '">撤单</button></div>';
    }).join("") : '<p class="muted">没有在挂的单</p>';
    el.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.onclick = function () {
        var st = document.getElementById("tr-st"), say = function (t) { st.textContent = t; }; b.disabled = true;
        K().ready().then(function () { return K().send(OTC, SEL.cancel + u256(b.getAttribute("data-cancel")), say, "撤单"); }).then(function () { say("✅ 已撤单，币已退回"); return refresh(false); }).catch(function (e) { b.disabled = false; say(""); A.errTip(K().niceError(e), b); });
      };
    });
  }
  A.pages.trade = page;
})();
