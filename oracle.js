// 🔮 AiLGNS 每日预言家（#/oracle）：猜今晚 AiLGNS 价格，晚上 9–10 点随机一刻的链上价格开奖（规则见 lib/oracle.js）
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var PAIR = "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0", SCAN = "https://anubisscan.io/";
  var SRC = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", KEEPER = "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb";
  var eth = null, account = "", pxTimer = 0, cdTimer = 0, data = null, curRid = 0;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dai(v) { return Number(v || 0).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 2 }) + " DAI"; }
  function hm(ms) { var d = new Date(ms + 8 * 3600e3); return (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
  function dayCn(day) { var p = day.split("-"); return Number(p[1]) + "月" + Number(p[2]) + "日"; }
  function left(ms) { if (ms <= 0) return "0 分"; var h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1000) % 60; return (h ? h + " 小时 " : "") + m + " 分 " + (h ? "" : s + " 秒"); }
  function utf8hex(str) { var b = unescape(encodeURIComponent(str)), h = "0x"; for (var i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return h; }
  // 签名文字必须和 functions/api/oracle.js 里的 guessText 一字不差
  function guessText(day, ps, a) { return "AiLGNS 每日预言家\n我预测 " + day + " 晚上 9-10 点 AiLGNS 价格：\n" + ps.join(", ") + " DAI\n地址：" + a; }
  function pxOf(r) { var w = r.slice(2), ail = BigInt("0x" + w.slice(0, 64)), d = BigInt("0x" + w.slice(64, 128)); return Number((d * 1000000n) / ail) / 1e6; }

  function page(rid) {
    clearInterval(pxTimer); clearInterval(cdTimer); curRid = rid;
    A.app.innerHTML =
      '<div id="or-top"></div>' +
      '<section class="card or-dm"><div class="or-dmsky" id="or-dmsky"><span class="or-dmtip">💬 弹幕加载中…</span></div><div class="or-dmin"><input id="or-dmt" maxlength="30" placeholder="说点什么吧（30 字内，不花钱）" autocomplete="off"><button type="button" class="nm-go" id="or-dmgo">发弹幕</button></div></section>' +
      '<section class="card or-hero"><div class="or-h"><h2>🔮 AiLGNS 每日预言家</h2><span class="muted">免费参与 · 创世域名或 OTC 满 5 万就能玩</span></div>' +
      '<div class="or-px2"><div class="or-pxl"><small>AiLGNS 现价（链上实时）</small><div><b id="or-px">读取中…</b><span>DAI</span></div><small class="or-pxs">每 5 秒更新 · 晚上 9–10 点随机一刻开奖</small><div class="or-how"><b>🎯 怎么玩？</b>猜<b>今晚开奖那一刻</b>的价格，写到<b>小数点后 3 位</b>，例如 <b>830.962</b>。<br>整数猜对后，小数点后 3 位有 <b>000–999 共 1000 种</b>可能：<br>🔮 <b>完全猜中</b> → 神算子，平分大奖；同时奖池 30% 给本周期 OTC 手续费前 3 名 💰<br>👁 <b>最接近</b> → 天眼通（奖池 10%）　🌿 <b>第二接近</b> → 地灵通（奖池 5%）<br><small>免费参与，钱包签名即可 · 持创世 .ailgns 域名或 OTC 累计满 5 万 DAI 可玩</small></div></div><div class="or-lead" id="or-lead"></div></div>' +
      '<svg id="or-chart" class="or-chart" viewBox="0 0 360 150"><text x="180" y="75" text-anchor="middle" class="or-ct">K 线读取中…</text></svg>' +
      '<p class="or-src">数据来源：<a href="' + SCAN + 'address/' + PAIR + '" target="_blank" rel="noopener">AiLGNS/DAI 交易池 0x0a1C…caf0（Anubis 链）↗</a> · 现价每 5 秒刷新 · 1 小时 K 线（最近 24 小时）</p></section>' +
      '<div id="or-out"><section class="card"><p class="muted">读取中…</p></section></div>';
    livePx(rid); chart(rid); dmInit(rid);
    pxTimer = setInterval(function () { if (!A.isCurrent(rid)) return clearInterval(pxTimer); livePx(rid); }, 5000);
    var go = function () { load(rid); };
    if (!account && A.wallets && A.wallets.silent) A.wallets.silent().then(function (a) { if (a) account = String(a).toLowerCase(); go(); }, go); else go();
  }
  function livePx(rid) {
    W.rpcOn("anubis", "eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "latest"]).then(function (r) {
      var el = document.getElementById("or-px"); if (el && A.isCurrent(rid)) el.textContent = pxOf(r).toFixed(3);
      if (A.isCurrent(rid)) { livePxV = pxOf(r); liveRank(); }
    }, function () {});
  }
  // 1 小时 K 线（最近 24 根）：读池子的 Sync 事件（每次买卖后的储备），算出每小时开高低收；Anubis 约 1 秒一块
  var SYNC = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
  function pxData(d) { var w = d.slice(2); return Number(BigInt("0x" + w.slice(64, 128)) * 1000000n / BigInt("0x" + w.slice(0, 64))) / 1e6; }
  // K 线：先画本地缓存（秒开），再读 /api/kline（服务器缓存，只补新区块）；接口失败再直接读链
  function chart(rid) {
    var toC = function (a) { return a.map(function (x) { return { t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] }; }); };
    var el0 = document.getElementById("or-chart"), cached = null;
    try { cached = JSON.parse(localStorage.getItem("or:k") || "null"); } catch (e) {}
    if (el0 && cached && cached.c) drawK(el0, toC(cached.c));
    fetch("/api/kline").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
      var el = document.getElementById("or-chart"); if (!el || !A.isCurrent(rid)) return;
      if (!d.c) throw 0;
      try { localStorage.setItem("or:k", JSON.stringify(d)); } catch (e) {}
      drawK(el, toC(d.c));
    }).catch(function () { chartChain(rid); });
  }
  function chartChain(rid) {
    var N = 24, latest, tsL, h0, b0;
    A.rpc("eth_getBlockByNumber", ["latest", false]).then(function (b) {
      latest = parseInt(b.number, 16); tsL = parseInt(b.timestamp, 16);
      h0 = Math.floor(tsL / 3600) * 3600 - (N - 1) * 3600; b0 = latest - (tsL - h0);
      var calls = [A.rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "0x" + (b0 - 1).toString(16)])];
      for (var f = b0; f <= latest; f += 5000) calls.push(A.rpc("eth_getLogs", [{ address: PAIR, topics: [SYNC], fromBlock: "0x" + f.toString(16), toBlock: "0x" + Math.min(latest, f + 4999).toString(16) }]));
      return Promise.all(calls);
    }).then(function (r) {
      var el = document.getElementById("or-chart"); if (!el || !A.isCurrent(rid)) return;
      var last = pxOf(r[0]), c = [];
      for (var i = 0; i < N; i++) c.push({ t: h0 + i * 3600, o: last, h: last, l: last, c: last, v: 0 });
      var cur = last, prevDai = null;
      [].concat.apply([], r.slice(1)).forEach(function (lg) {
        var b = parseInt(lg.blockNumber, 16), k = Math.floor((tsL - (latest - b) - h0) / 3600);
        var p = pxData(lg.data), dai = Number(BigInt("0x" + lg.data.slice(66, 130)) / 10n ** 16n) / 100;
        if (k >= 0 && k < N) {
          var x = c[k];
          if (!x.touched) { x.o = cur; x.h = Math.max(cur, p); x.l = Math.min(cur, p); x.touched = 1; } // 开盘 = 这一小时第一笔之前的价格
          x.h = Math.max(x.h, p); x.l = Math.min(x.l, p); x.c = p;
          if (prevDai !== null) x.v += Math.abs(dai - prevDai);
        }
        cur = p; prevDai = dai;
      });
      // 没成交的小时：一字线，沿用上一根收盘
      for (var j = 0; j < N; j++) if (!c[j].touched) { var pc = j ? c[j - 1].c : last; c[j].o = c[j].h = c[j].l = c[j].c = pc; }
      drawK(el, c);
    }, function () { var el = document.getElementById("or-chart"); if (el) el.innerHTML = '<text x="180" y="75" text-anchor="middle" class="or-ct">K 线读取失败</text>'; });
  }
  var lastK = null, rzT;
  window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(function () { var el = document.getElementById("or-chart"); if (el && lastK) drawK(el, lastK); }, 150); });
  function drawK(el, c) {
    lastK = c; var W0 = Math.max(240, el.clientWidth || 360), H0 = Math.max(120, el.clientHeight || 150), L = 6, R = W0 - 66, T = 10, B = H0 - 24, hi = -Infinity, lo = Infinity;
    c.forEach(function (x) { hi = Math.max(hi, x.h); lo = Math.min(lo, x.l); });
    var pad = (hi - lo) * 0.08 || 0.5; hi += pad; lo -= pad;
    var y = function (p) { return T + (hi - p) / (hi - lo) * (B - T); }, cw = (R - L) / c.length, svg = "";
    for (var g = 0; g <= 4; g++) { var gp = lo + (hi - lo) * g / 4, gy = y(gp); svg += '<line x1="' + L + '" x2="' + R + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" class="or-grid"/><text x="' + (R + 4) + '" y="' + (gy + 3.5).toFixed(1) + '" class="or-ct">' + gp.toFixed(3) + "</text>"; }
    c.forEach(function (x, i) {
      var cx = L + cw * i + cw / 2, up = x.c >= x.o, col = up ? "or-up" : "or-dn", top = y(Math.max(x.o, x.c)), bot = y(Math.min(x.o, x.c));
      var d = new Date((x.t + 8 * 3600) * 1000), hh = String(d.getUTCHours()).padStart(2, "0") + ":00";
      svg += "<g><title>" + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 " + hh + "\n开 " + x.o.toFixed(3) + "　高 " + x.h.toFixed(3) + "\n低 " + x.l.toFixed(3) + "　收 " + x.c.toFixed(3) + "</title>" +
        '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + y(x.h).toFixed(1) + '" y2="' + y(x.l).toFixed(1) + '" class="' + col + '"/>' +
        '<rect x="' + (cx - cw * 0.32).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (cw * 0.64).toFixed(1) + '" height="' + Math.max(1, bot - top).toFixed(1) + '" class="' + col + '"/></g>';
      if (i % 6 === 0) svg += '<text x="' + Math.max(cx, 18).toFixed(1) + '" y="' + (H0 - 7) + '" text-anchor="middle" class="or-ct">' + hh + "</text>";
    });
    var lastC = c[c.length - 1];
    svg += '<line x1="' + L + '" x2="' + R + '" y1="' + y(lastC.c).toFixed(1) + '" y2="' + y(lastC.c).toFixed(1) + '" class="or-lastl"/><rect x="' + (R + 1) + '" y="' + (y(lastC.c) - 9).toFixed(1) + '" width="62" height="18" rx="4" class="or-lastb"/><text x="' + (R + 4) + '" y="' + (y(lastC.c) + 3.5).toFixed(1) + '" class="or-lastt">' + lastC.c.toFixed(3) + "</text>";
    el.setAttribute("viewBox", "0 0 " + W0 + " " + H0); el.innerHTML = svg;
  }

  function load(rid) {
    return fetch("/api/oracle" + (account ? "?a=" + account : ""), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(rid)) return;
      data = d; render(rid);
    }, function () { var o = document.getElementById("or-out"); if (o) o.innerHTML = '<section class="card"><p class="muted">读取失败，请稍后刷新</p></section>'; });
  }

  function render(rid) {
    var d = data, o = document.getElementById("or-out"); if (!o) return;
    var dr = d.drawing, res = dr.res, now = Date.now(), inWin = !dr.skip && now >= dr.from && now < dr.to + 5 * 60e3 && !res; // 第一期之前（11 月 5 日）不开奖
    var html = "", top = "";
    // 超级大奖池 + 本轮奖金（放在页面最上面）
    var potV = d.funds ? Math.floor((d.funds.dai + d.funds.ail * d.funds.px) * 100) / 100 : 0; // 奖池实际总额
    var n0 = function (v) { return Math.floor(v).toLocaleString("en-US", { useGrouping: false }); }, rd = dayCn(new Date(Date.parse(d.round + "T12:00:00+08:00") - 864e5 + 288e5).toISOString().slice(0, 10));
    top += '<section class="card or-pool"><div class="or-pc">' +
      '<small class="or-pcl">🎯 奖池总额</small><div class="or-pbig"><i class="or-cnt" data-to="' + Math.floor(potV) + '">0</i><span>DAI</span></div>' +
      (d.last ? "" : '<div class="or-pdate">🎁 第一期 11 月 6 日晚 9–10 点开奖</div>') +
      '<div class="or-prz">' +
        '<div class="or-pz p3"><small><u class="or-rk">第一名</u>神算子</small><b><i class="or-cnt" data-to="' + Math.floor(potV * 0.55) + '">0</i><em>DAI</em></b></div>' +
        '<div class="or-pz p4"><small><u class="or-rk">贡献王</u>OTC 前 3 名</small><b><i class="or-cnt" data-to="' + Math.floor(potV * 0.3) + '">0</i><em>DAI</em></b></div>' +
        '<div class="or-pz p1"><small><u class="or-rk">第二名</u>天眼通</small><b><i class="or-cnt" data-to="' + Math.floor(potV * 0.1) + '">0</i><em>DAI</em></b></div>' +
        '<div class="or-pz p2"><small><u class="or-rk">第三名</u>地灵通</small><b><i class="or-cnt" data-to="' + Math.floor(potV * 0.05) + '">0</i><em>DAI</em></b></div>' +
      "</div>" +
      "</div></section>";
    // 正在开奖 / 刚开完
    if (inWin || (res && now - res.at < 20 * 3600e3)) html += drawCard(d);
    // 提交预测
    html += '<section class="card or-form"><div class="card-head"><h2>✍️ 预测 ' + dayCn(d.round) + ' 晚上开奖价</h2><span class="muted" id="or-cd"></span></div>' + meBox(d) + "</section>" + kingsCard(d, potV) + playersCard(d);
    setTimeout(liveRank, 0);
    setTimeout(countUp, 0);
    // 最近一次结果（不在上面显示时）
    if (d.last && !(res && res.day === d.last.day && now - res.at < 20 * 3600e3)) html += resultCard(d.last, "📜 上一期结果");
    // 预言家榜
    if (d.board && d.board.length) html += '<section class="card"><div class="card-head"><h2>🏆 预言家榜</h2><span class="muted">大奖次数 · 最接近次数</span></div><ol class="or-board">' +
      d.board.map(function (x) { return "<li><b>" + esc(x.name) + "</b><span>🎯 " + x.j + " 次 · 🥇 " + x.c + " 次</span></li>"; }).join("") + "</ol></section>";
    html += rules();
    // 🔔 最下面：关注 DeBox 机器人，开奖结果、中奖私信、每天开奖提醒
    html += '<section class="card or-dbx"><div class="card-head"><h2>🔔 开奖通知 · DeBox</h2><span class="muted">免费 · 不错过每一期</span></div>' +
      '<p>扫码关注 DeBox 机器人，<b>每晚开奖结果</b>、<b>中奖通知</b>、<b>每天开奖提醒</b>第一时间推送给你。绑定钱包地址后，中奖了机器人还会单独私信你。</p><div id="dbx-slot"></div></section>';
    o.innerHTML = html;
    if (A.otcKit && A.otcKit.deboxCard) A.otcKit.deboxCard(rid, { title: "关注机器人，开奖结果 + 中奖通知 + 每日提醒", on: "开奖结果、中奖私信、每天开奖提醒都会推送到你的 DeBox" });
    var tp = document.getElementById("or-top"); if (tp) tp.innerHTML = top;
    bind(rid);
    tick();
    clearInterval(cdTimer); cdTimer = setInterval(function () { if (!A.isCurrent(rid)) return clearInterval(cdTimer); tick(); }, 1000);
  }
  function tick() {
    var el = document.getElementById("or-cd"); if (!el || !data) return;
    var ms = data.cutoff - Date.now();
    if (ms <= 0) { clearInterval(cdTimer); if (A.isCurrent(curRid)) setTimeout(function () { load(curRid); }, 3000); return; }
    el.textContent = "距离本轮锁定还有 " + left(ms);
  }

  // 奖金池里实际有多少币：DAI、AiLGNS（按现价折算）、LGNS（不留 LGNS：用 LGNS 付的部分按价值记成「待留」，等 DAI / AiLGNS 进来再留）
  function funds(f, pool) {
    if (!f) return "";
    var ailV = f.ail * f.px, tot = f.dai + ailV, gap = Math.max(0, pool - tot);
    return '<div class="or-funds"><span>💵 DAI <b>' + f.dai.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 2 }) + "</b></span>" +
      "<span>🪙 AiLGNS <b>" + f.ail.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 4 }) + "</b> <small>≈ " + ailV.toFixed(2) + " DAI</small></span>" +
      '<span class="or-tot">已到位 <b>' + tot.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 2 }) + " DAI</b></span>" +
      '<small class="or-fnote">' + (gap >= 1 ? "上面的奖池是应得的总额；其中 " + tot.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 }) + " DAI 已经单独留出，另外 " + gap.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 }) + " DAI 正从接下来的域名收入里自动陆续留出，中奖了照样足额发。" : "奖池的钱已经全部单独留出，中奖自动发到你的钱包。") + "</small></div>";
  }
  function meBox(d) {
    var me = d.me;
    if (account === SRC) return ownerBox();
    if (!account) return '<p>参加资格（满足其一）：① 主名字是 <b>🌟 创世 .ailgns 域名</b> ② <b>OTC 累计成交满 5 万 DAI</b>。免费预测。</p><button type="button" class="nm-go" id="or-conn">🔗 连接钱包参加</button>';
    if (!me || me.err) return '<p class="muted">' + esc((me && me.err) || "读取中…") + "</p>";
    if (me.cool) return '<p>🎉 恭喜 <b>' + esc(me.name || A.short(account)) + '</b> 中过奖！每个名字、每个钱包<b>只能中一次奖</b>，把机会留给更多人。</p><p class="muted">想继续玩：用一个<b>新钱包</b>，<a href="#/names">买一个新的 🌟 创世 .ailgns 域名</a>，设为主名字就能再参加。</p>';
    if (!me.ok) return '<p>钱包 <span class="mono">' + A.short(account) + '</span> 还没有参加资格。满足其一就能参加：</p><ul class="or-req">' +
      '<li>' + (me.name ? "❌ 主名字 <b>" + esc(me.name) + "</b> 不是创世域名" : "❌ 还没有 .ailgns 主名字") + '：<a href="#/names">注册 / 买一个 🌟 创世 .ailgns 域名，设为主名字 →</a></li>' +
      '<li>❌ OTC 累计成交 <b>' + Number(me.vol || 0).toLocaleString("en-US", { useGrouping: false }) + "</b> / " + Number(me.need).toLocaleString("en-US", { useGrouping: false }) + ' DAI：<a href="#/otc">去 OTC 交易 →</a></li></ul>';
    if (me.taken) return '<p class="nm-bad">' + esc(me.name) + " 这一轮已经由别的钱包预测过了，一个名字每轮只能用一次。</p>";
    var rest = me.n - me.used;
    return '<p>你好，<b>' + esc(me.name || A.short(account)) + "</b>" + (me.gno ? ' <i class="or-gb">🌟 创世 #' + me.gno + "</i>" : me.vol >= me.need ? ' <i class="or-gb">💎 OTC 成交 ' + Number(me.vol).toLocaleString("en-US", { useGrouping: false }) + " DAI</i>" : "") + "！本轮你有 <b>" + me.n + "</b> 次预测机会（" + esc(me.tier) + (me.name ? "域名 " : " ") + me.base + " 次" + (me.bonus ? " + 今天 OTC 成交满 50 DAI 加 1 次" : "") + "），已用 <b>" + me.used + "</b> 次。</p>" +
      (me.ps.length ? '<p class="or-mine">我的预测：' + me.ps.map(function (p) { return "<b>" + p + "</b>"; }).join("、") + "</p>" : "") +
      (rest > 0 ? '<div class="or-in"><input id="or-p" inputmode="decimal" placeholder="例如 827.354（3 位小数）" autocomplete="off"><button type="button" class="nm-go" id="or-go">🔮 提交预测</button></div>' +
        '<p class="muted">还能预测 ' + rest + " 次；有几次就填几个价格，用空格或逗号隔开。只需要钱包签名，不扣钱、不花 Gas。</p>" :
        '<p class="muted">本轮次数已用完' + (me.bonus ? "" : "；今天在 OTC 成交一笔满 50 DAI，可以再加 1 次") + "。</p>") +
      (me.ps.length ? '<button type="button" class="nm-sw" id="or-poster">📸 生成晒单海报</button>' : "") +
      '<p class="muted or-st" id="or-st"></p><div id="or-img"></div>';
  }

  // 站长（收款钱包）：给触发钱包授权 DAI 发奖额度。触发钱包只能在这个额度内把奖金发给中奖的人
  function ownerBox() {
    setTimeout(function () {
      [[DAI, "or-allow", " DAI"], [AIL, "or-allow2", " AiLGNS"]].forEach(function (t) {
        W.rpcOn("anubis", "eth_call", [{ to: t[0], data: "0xdd62ed3e" + SRC.slice(2).padStart(64, "0") + KEEPER.slice(2).padStart(64, "0") }, "latest"]).then(function (r) {
          var el = document.getElementById(t[1]); if (el) el.textContent = (Number(BigInt(r) / 10n ** 14n) / 10000).toLocaleString("en-US", { useGrouping: false }) + t[2];
        }, function () {});
      });
    }, 0);
    return '<p>👑 站长钱包不参加预测。这里设置<b>自动发奖额度</b>：收款钱包授权触发钱包 ' + A.short(KEEPER) + ' 最多转出多少 DAI 发奖金（只能发给中奖的人，额度用完再授权）。</p>' +
      '<p>奖金先用 DAI 发，DAI 不够用 AiLGNS（按现价折算），所以两种都要授权。当前额度：<b id="or-allow">读取中…</b> · <b id="or-allow2">读取中…</b></p>' +
      '<div class="or-in"><input id="or-amt" inputmode="decimal" value="1000"><button type="button" class="nm-go or-approve" data-t="DAI">授权 DAI 额度</button></div>' +
      '<div class="or-in"><input id="or-amt2" inputmode="decimal" value="5"><button type="button" class="nm-go or-approve" data-t="AIL">授权 AiLGNS 额度</button></div><p class="muted or-st" id="or-st"></p>';
  }
  function drawCard(d) {
    var dr = d.drawing, res = dr.res;
    var list = dr.list || [];
    if (res) return resultCard(res, "🎉 " + dayCn(res.day) + " 开奖结果") + (list.length ? '<section class="card">' + allGuess(list, res.px) + "</section>" : "");
    return '<section class="card or-draw"><div class="card-head"><h2>🎲 ' + dayCn(dr.day) + ' 正在开奖</h2><span class="muted">晚上 9:00–10:00 随机一刻 · 10:05 前公布</span></div>' +
      "<p>本轮已锁定，共 <b>" + list.length + "</b> 人参与。开奖价 = 9–10 点之间随机一刻的链上价格，由 10 点整那个区块的哈希决定，谁都没法提前知道。</p>" +
      (list.length ? allGuess(list) : "") + "</section>";
  }
  // 所有人的预测（完整价格，3 位小数）；开奖后按离开奖价远近排，最接近的在前
  function allGuess(list, px) {
    var rows = [];
    list.forEach(function (g) { g.ps.forEach(function (p) { rows.push({ name: g.name, p: p, d: px ? Math.abs(Math.round(Number(p) * 1000) - px) : 0 }); }); });
    if (px) rows.sort(function (a, b) { return a.d - b.d; });
    return '<details class="or-all"' + (px ? "" : " open") + '><summary>📜 所有人的预测（' + list.length + " 人 · " + rows.length + " 个价格）" + (px ? "，按离开奖价远近排" : "") + '</summary><input class="or-q" placeholder="🔍 搜名字" oninput="var q=this.value.trim().toLowerCase();this.nextElementSibling.querySelectorAll(\'li\').forEach(function(l){l.hidden=q&&l.getAttribute(\'data-n\').indexOf(q)<0})"><ol>' +
      rows.map(function (r) { return '<li data-n="' + esc(r.name.toLowerCase()) + '"><b>' + esc(r.name) + "</b>：" + r.p + " DAI" + (px ? ' <small class="muted">差 ' + (r.d / 1000).toFixed(3) + "</small>" : "") + "</li>"; }).join("") + "</ol></details>";
  }
  // 📈 本轮实时排行：域名 + 预测价，按离当前链上价远近排，每 5 秒跟着价格刷新；人多时自动滚动
  var livePxV = 0, liveRows = [], liveKey = "", liveAll = false;
  // 现价旁边：如果按当前价开奖，最能中奖的前 3 名（同时显示，价格每 5 秒变一次就跟着重排，名次变了闪一下）
  var leadRows = [], leadKey = "";
  function leadShow() {
    var el = document.getElementById("or-lead");
    if (!el || !leadRows.length) return;
    var top = leadRows.slice(0, 3), key = top.map(function (r) { return r.name + r.p; }).join("|"), moved = leadKey && key !== leadKey;
    leadKey = key;
    el.innerHTML = '<div class="or-lh"><b>🏆 如果现在开奖</b><span>最接近的 3 位</span></div>' + top.map(function (r, i) {
      return '<div class="or-ldr r' + (i + 1) + (moved ? " moved" : "") + '"><i>' + (i + 1) + '</i><div class="or-ln"><b>' + esc(r.name) + '</b><small>预测 ' + r.p + '</small></div><em>差 ' + r.d + "</em></div>";
    }).join("");
  }

  // 本周期贡献榜：奖池 30% 给 OTC 手续费前 3 名
  function kingsCard(d, potV) {
    var k = d.kings; if (!k) return "";
    var total = Math.floor(potV * k.share * 100) / 100, me = d.me && d.me.king;
    var rows = k.top.map(function (x, i) { return '<li><span>' + ["🥇", "🥈", "🥉"][i] + " <b>" + esc(x.name) + "</b> 付手续费 " + dai(x.fee) + "</span><b>" + dai(Math.floor(total * k.split[i] * 100) / 100) + "</b></li>"; }).join("");
    return '<section class="card"><div class="card-head"><h2>💰 本周期贡献榜</h2><span class="muted">' + dayCn(k.cyc) + " 起 · 奖池 30% = " + dai(total) + "</span></div>" +
      (rows ? '<ol class="or-board">' + rows + "</ol>" : '<p class="muted">本周期还没有 OTC 成交，第一笔就是第一名。</p>') +
      '<p class="muted">有人猜中大奖的那天，这 3 位按 50 / 30 / 20 分走奖池的 30%，然后重新排。在 OTC 吃单付的手续费（成交额 1%）都算，卡牌按 3%。' + (me ? " 你现在排第 <b>" + me.rank + "</b>，已付 " + dai(me.fee) + "。" : (d.me && d.me.a ? " 你本周期还没有成交。" : "")) + "</p></section>";
  }
  function playersCard(d) {
    liveRows = []; liveKey = "";
    (d.players || []).forEach(function (g) { (g.ps || []).forEach(function (p) { liveRows.push({ name: g.name, p: p, m: Math.round(Number(p) * 1000) }); }); });
    if (!liveRows.length) return "";
    return '<section class="card or-live"><div class="card-head"><h2>📈 ' + dayCn(d.round) + ' 实时排行</h2><span class="muted">' + (d.players || []).length + " 人 · " + liveRows.length + ' 个预测</span></div>' +
      '<p class="muted">按离<b>当前链上价</b>最近排序，每 5 秒刷新；最终以当晚 9–10 点随机一刻的价格开奖。</p><div id="or-live"></div></section>';
  }
  // 奖池数字滚动增加：从上次看到的数（第一次从 0）滚到现在的数
  var cntSeen = {};
  function countUp() {
    document.querySelectorAll(".or-cnt").forEach(function (el, k) {
      var to = Number(el.getAttribute("data-to")) || 0, from = cntSeen[k] != null ? cntSeen[k] : 0, t0 = performance.now(), dur = from ? 900 : 1800;
      cntSeen[k] = to;
      if (from === to) { el.textContent = to.toLocaleString("en-US", { useGrouping: false }); return; }
      (function step(t) {
        var x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 3);
        el.textContent = Math.floor(from + (to - from) * e).toLocaleString("en-US", { useGrouping: false });
        if (x < 1 && el.isConnected) requestAnimationFrame(step);
      })(t0);
    });
  }
  function liveRank() {
    var box = document.getElementById("or-live");
    if (!box || !liveRows.length || !livePxV) return;
    var m = Math.round(livePxV * 1000);
    var rows = liveRows.slice().sort(function (a, b) { return Math.abs(a.m - m) - Math.abs(b.m - m); });
    var key = m + ":" + rows.map(function (r) { return r.name + r.p; }).join("|");
    leadRows = rows.slice(0, 5).map(function (r) { return { name: r.name, p: r.p, d: (Math.abs(r.m - m) / 1000).toFixed(3) }; });
    leadShow();
    if (key === liveKey) return;
    liveKey = key;
    var li = function (r, i) { return '<li' + (i < 3 ? ' class="top"' : "") + '><span class="or-lr">' + (i + 1) + '</span><b>' + esc(r.name) + '</b><span class="or-lp"><small>预测价格</small>' + r.p + '</span><span class="or-lc"><small>差</small>' + (Math.abs(r.m - m) / 1000).toFixed(3) + "</span></li>"; };
    // 不滚动：上面高亮当前价，下面列最接近的 10 个，点「看全部」展开
    box.innerHTML = '<div class="or-lnow"><small>当前价格</small><b>' + livePxV.toFixed(3) + '</b><span>DAI</span></div>' +
      '<div class="or-lwin"><ol>' + rows.slice(0, liveAll ? rows.length : 10).map(li).join("") + "</ol></div>" +
      (rows.length > 10 ? '<button type="button" class="nm-more" id="or-lall">' + (liveAll ? "收起 ▲" : "看全部 " + rows.length + " 个 ▼") + "</button>" : "");
    var la = document.getElementById("or-lall");
    if (la) la.onclick = function () { liveAll = !liveAll; liveKey = ""; liveRank(); };
  }
  function resultCard(r, title) {
    var px = (r.px / 1000).toFixed(3), jw = r.jackpot.winners, c = r.closest;
    return '<section class="card or-res"><div class="card-head"><h2>' + title + '</h2><span class="muted">' + dayCn(r.day) + "</span></div>" +
      '<div class="or-rpx"><small>开奖价</small><b>' + px + '</b><span>DAI</span></div>' +
      '<p class="or-proof">开奖时刻 ' + hm(r.blockTime * 1000) + ' · <a href="' + SCAN + "block/" + r.block + '" target="_blank" rel="noopener">区块 #' + r.block + " ↗</a>（由 #" + r.b1 + " 的哈希在 #" + r.b0 + "–#" + (r.b1 - 1) + " 中随机选出）· 链上原价 " + r.pxRaw.toFixed(6) + "</p>" +
      (jw.length ? '<p class="or-win">🎯 <b>超级大奖池 ' + dai(r.jackpot.pool) + "</b> 被 " + jw.map(function (w) { return "<b>" + esc(w.name) + "</b>"; }).join("、") + " 猜中！" + (jw.length > 1 ? "每人 " + dai(r.jackpot.each) : "独得") + "</p>" :
        '<p>🎯 没人猜中 ' + px + "，大奖池滚到 <b>" + dai(r.poolAfter) + "</b>，下一期继续！</p>") +
      (c ? '<p class="or-win">🥇 天眼通（最接近）：<b>' + esc(c.name) + "</b> 预测 " + (c.p / 1000).toFixed(3) + "，只差 " + (c.diff / 1000).toFixed(3) + "，得 " + dai(c.amt) + "</p>" : '<p class="muted">这一期没人参加。</p>') +
      (r.second ? '<p class="or-win">🥈 地灵通（次接近）：<b>' + esc(r.second.name) + "</b> 预测 " + (r.second.p / 1000).toFixed(3) + "，差 " + (r.second.diff / 1000).toFixed(3) + "，得 " + dai(r.second.amt) + "</p>" : "") +
      (r.kings && r.kings.length ? '<p class="or-win">💰 贡献王（' + dayCn(r.cyc) + " 起 OTC 手续费前 " + r.kings.length + " 名）：" + r.kings.map(function (k, i) { return "<b>" + esc(k.name) + "</b> 付 " + dai(k.fee) + "，得 " + dai(k.amt); }).join("；") + "</p>" : "") +
      '<p class="muted">共 ' + r.n + " 人、" + r.guesses + " 个预测 · 本期奖金 " + dai(r.allot) + "（前一天域名收入 " + dai(r.rev) + " × 70%）· 奖金由系统自动发到中奖钱包</p></section>";
  }
  function rules() {
    return '<details class="card or-rules"><summary>📜 玩法规则（点开看）</summary><ol>' +
      "<li><b>谁能玩</b>（满足其一）：① 主名字是 🌟 创世 .ailgns 域名（全站付费注册的前 1 万个）② OTC 累计成交满 5 万 DAI。免费参与，只需钱包签名。</li>" +
      "<li><b>猜什么</b>：猜开奖价，精确到小数点后 3 位，例如 827.354。</li>" +
      "<li><b>几次机会</b>：按主名字档位：普通 1 次、中文 2 字 2 次、英文 4 位 3 次、英文 3 位 5 次；当天在 OTC 成交一笔满 50 DAI 再加 1 次。一个名字每轮只能用一次。</li>" +
      "<li><b>随时能猜</b>：晚上 9 点前提交的参加当晚开奖，9 点后提交的参加第二天。</li>" +
      "<li><b>怎么开奖</b>：晚上 9:00–10:00 之间随机一刻的链上价格就是开奖价；是哪一刻由 10 点整那个区块的哈希决定，谁都没法提前知道。10:05 前公布。</li>" +
      "<li><b>奖金</b>：每天拿出域名收入的 <b>70%</b>，全部进奖池，回馈参与的朋友。每晚开奖：🥇 <b>天眼通</b>（最接近）拿<b>奖池总额的 10%</b>，🥈 <b>地灵通</b>（次接近）拿 <b>5%</b>（一样接近先提交的得）；🔮 <b>神算子</b>（3 位小数完全猜中）平分剩下的，没人中就一直滚。</li>" +
      "<li><b>💰 贡献王</b>：有人猜中的那天，奖池 <b>30%</b> 给<b>本周期</b>（上次大奖清空的第二天起到当天）在 OTC 付手续费最多的前 3 名，按 50 / 30 / 20 分；发完周期清零，重新排。手续费按成交额算：币 OTC 吃单付 1%，卡牌买家付 3%。贡献王不占名额、不禁赛。</li>" +
      "<li><b>每个名字、每个钱包只能中一次</b>：拿到神算子、天眼通或地灵通后，这个名字和这个钱包都不能再参加了；想继续玩，用新钱包买一个新的 🌟 创世 .ailgns 域名设为主名字。</li>" +
      "<li><b>公开透明</b>：开奖区块、时间、价格全部公开，可以在 anubisscan 上核对。站长钱包不参加。</li>" +
      '<li class="muted">仅供娱乐，不构成任何投资建议。</li></ol></details>';
  }

  // 💬 弹幕：每 15 秒拉一次，3 条跑道从右往左一直飘；新发的优先飘
  var dmList = [], dmQ = [], dmI = 0, dmSeen = {}, dmLane = 0;
  function dmText(txt, ts, a) { return "AiLGNS 弹幕\n" + txt + "\n时间：" + ts + "\n地址：" + a; }
  function dmFetch() {
    return fetch("/api/danmaku?r=" + Date.now()).then(function (r) { return r.json(); }).then(function (j) {
      var fresh = false;
      (j.list || []).forEach(function (m) { if (!dmSeen[m.id]) { dmSeen[m.id] = 1; dmAdd(m); fresh = true; } });
      if (fresh || !dmFetched) dmI = 0; // 有人发新弹幕：从头滚一遍
      dmFetched = true;
      var tip = document.querySelector(".or-dmtip"); if (tip) tip.textContent = dmList.length ? "" : "💬 还没有弹幕，来发第一条吧！";
    }, function () {});
  }
  var dmFetched = false;
  function dmAdd(m) { // 每人只留最新一条
    dmList = dmList.filter(function (x) { return x.name !== m.name; }); dmList.push(m);
    if (dmList.length > 60) dmList.shift();
  }
  function dmFly(m, mine) {
    var sky = document.getElementById("or-dmsky"); if (!sky) return;
    var el = document.createElement("div");
    el.className = "or-dmi" + (mine ? " mine" : "");
    el.style.top = (8 + (dmLane++ % 3) * 30) + "px";
    el.innerHTML = "<b>" + esc(m.name) + "</b>：" + esc(m.txt);
    el.style.animationDuration = (9 + Math.random() * 4).toFixed(1) + "s";
    el.addEventListener("animationend", function () { el.remove(); });
    sky.appendChild(el);
  }
  function dmInit(rid) {
    dmFetched = false; dmSeen = {}; dmList = []; dmQ = [];
    dmFetch();
    var tick = setInterval(function () {
      if (!A.isCurrent(rid) || !document.getElementById("or-dmsky")) return clearInterval(tick);
      if (dmI < dmList.length) dmFly(dmList[dmI++], false); // 滚完一遍就停，等有人发新的再从头滚
    }, 1800);
    var pull = setInterval(function () { if (!A.isCurrent(rid)) return clearInterval(pull); dmFetch(); }, 15000);
    var inp = document.getElementById("or-dmt"), btn = document.getElementById("or-dmgo");
    if (!btn) return;
    var send = function () {
      var txt = inp.value.replace(/\s+/g, " ").trim();
      if (!txt) return A.errTip("先写点内容", btn);
      btn.disabled = true;
      var ts = Date.now();
      (eth ? Promise.resolve() : connect()).then(function () {
        return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(dmText(txt, ts, account)), account] });
      }).then(function (sig) {
        return fetch("/api/danmaku", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: account, txt: txt, ts: ts, sig: sig }) }).then(function (r) { return r.json(); });
      }).then(function (j) {
        btn.disabled = false;
        if (j.error) throw new Error(j.error);
        inp.value = ""; dmSeen[j.it.id] = 1; dmAdd(j.it); dmI = 0;
        var tip = document.querySelector(".or-dmtip"); if (tip) tip.textContent = "";
      }).catch(function (e) { btn.disabled = false; A.errTip(e.message || String(e), btn); });
    };
    btn.onclick = send;
    inp.onkeydown = function (e) { if (e.key === "Enter") send(); };
  }
  function connect() {
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { account = String(a[0]).toLowerCase(); return account; });
  }
  function bind(rid) {
    var c = document.getElementById("or-conn");
    if (c) c.onclick = function () { connect().then(function () { load(rid); }, function (e) { A.errTip(e.message || String(e), c); }); };
    var go = document.getElementById("or-go"), st = document.getElementById("or-st");
    if (go) go.onclick = function () {
      var raw = document.getElementById("or-p").value.split(/[\s,，、]+/).filter(function (x) { return x; });
      if (!raw.length || raw.some(function (x) { return !/^\d{1,7}(\.\d{1,3})?$/.test(x); })) return A.errTip("价格格式不对，例如 827.354（最多 3 位小数）", go);
      raw = raw.map(function (x) { return Number(x).toFixed(3); }).filter(function (x, i, z) { return z.indexOf(x) === i; }); // 重复的价格只算一次
      var left = data.me ? data.me.n - data.me.used : 0;
      if (raw.length > left) return A.errTip("你本轮只剩 " + left + " 次预测机会，但填了 " + raw.length + " 个价格。请删掉多的，只留 " + left + " 个再提交（还没扣次数）", go);
      var day = data.round;
      go.disabled = true; st.textContent = "请在钱包里签名（只是签名，不扣钱、不花 Gas）…";
      (eth ? Promise.resolve() : connect()).then(function () {
        return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(guessText(day, raw, account)), account] });
      }).then(function (sig) {
        st.textContent = "正在提交…";
        return fetch("/api/oracle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: account, ps: raw, day: day, sig: sig }) }).then(function (x) { return x.json(); });
      }).then(function (j) {
        go.disabled = false;
        if (j.error) throw new Error(j.error);
        st.textContent = "✅ 已提交！" + dayCn(j.round) + " 晚上 9–10 点开奖，10:05 前公布。";
        load(rid);
      }, function (e) { go.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), go); });
    };
    document.querySelectorAll(".or-approve").forEach(function (ap) { ap.onclick = function () {
      var isA = ap.getAttribute("data-t") === "AIL", v = Number(document.getElementById(isA ? "or-amt2" : "or-amt").value);
      if (!(v >= 0 && v <= 100000)) return A.errTip("额度填 0 到 100000 之间（填 0 = 取消授权）", ap);
      var amt = BigInt(Math.round(v * 10000)) * 10n ** 14n;
      ap.disabled = true; st.textContent = "请在钱包确认授权…";
      (eth ? Promise.resolve() : connect()).then(function () { return W.switchTo(eth, "anubis"); }).then(function () {
        return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: isA ? AIL : DAI, data: "0x095ea7b3" + KEEPER.slice(2).padStart(64, "0") + amt.toString(16).padStart(64, "0") }] });
      }).then(function (h) { st.textContent = "已提交，等待确认…"; return W.waitOn("anubis", h); }).then(function () { ap.disabled = false; st.textContent = "✅ 授权成功"; load(rid); },
        function (e) { ap.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), ap); });
    }; });
    var pb = document.getElementById("or-poster");
    if (pb) pb.onclick = function () { poster(); };
  }

  // 晒单海报：域名 + 预测价格 + 大奖池，长按保存图片发到群里（不带邀请链接）
  function poster() {
    var me = data.me, cv = document.createElement("canvas"), W2 = 720, H2 = 960, x = cv.getContext("2d");
    cv.width = W2; cv.height = H2;
    var g = x.createLinearGradient(0, 0, 0, H2); g.addColorStop(0, "#f3eeff"); g.addColorStop(1, "#e6dcff");
    x.fillStyle = g; x.fillRect(0, 0, W2, H2);
    x.textAlign = "center"; x.fillStyle = "#4b2fb8";
    x.font = "bold 54px sans-serif"; x.fillText("🔮 AiLGNS 每日预言家", W2 / 2, 120);
    x.font = "34px sans-serif"; x.fillStyle = "#6b5aa6"; x.fillText("我是", W2 / 2, 230);
    x.font = "bold 60px sans-serif"; x.fillStyle = "#3a1f9e"; x.fillText(me.name || A.short(account), W2 / 2, 310);
    x.font = "34px sans-serif"; x.fillStyle = "#6b5aa6"; x.fillText("我预测 " + dayCn(data.round) + " 晚上 AiLGNS =", W2 / 2, 410);
    x.font = "bold 72px sans-serif"; x.fillStyle = "#7c5cff";
    me.ps.slice(0, 4).forEach(function (p, i) { x.fillText(p, W2 / 2, 500 + i * 80); });
    x.font = "bold 40px sans-serif"; x.fillStyle = "#c98a00"; x.fillText("超级大奖池 " + dai(data.pool), W2 / 2, 830);
    x.font = "30px sans-serif"; x.fillStyle = "#6b5aa6"; x.fillText("敢来比吗？ ailgns.dev", W2 / 2, 900);
    var url = cv.toDataURL("image/png"), box = document.getElementById("or-img");
    if (box) box.innerHTML = '<p class="muted">长按图片保存，发到群里晒一晒 👇</p><img class="or-poster" src="' + url + '" alt="晒单海报">';
  }

  A.pages.oracle = page;
})();
