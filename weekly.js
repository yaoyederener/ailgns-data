// 🏆 OTC 手续费周榜 #/weekly（站长 2026-11-15 定，试运行，入口在 ☰ 更多 → 交易）
// 大白话：这周谁在本站 OTC 付的手续费多，谁就排前面；前 10 名按占比分「奖金钱包」里实际有的钱。规则在 lib/weekly.js，这里只负责画。
// 秒开：先画手机里上次存的，再去 /api/weekly 取新的。
(function () {
  "use strict";
  var A = window.AIL, CACHE = "ailgns-weekly-cache-v1";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dai(v) { return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dayCn(d) { var p = String(d || "").split("-"); return p.length === 3 ? Number(p[1]) + "月" + Number(p[2]) + "日" : ""; }
  function pct(s) { var v = (s || 0) * 100; return (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + "%"; }
  function left(ms) { var h = Math.max(0, Math.floor((ms - Date.now()) / 3600e3)); return h >= 24 ? Math.floor(h / 24) + " 天 " + (h % 24) + " 小时" : h + " 小时"; }
  function addrBox(a) { return '<div class="wkb-addr"><small>奖池托管地址（链上公开，点地址能看每一笔进出）</small><a href="#/scan/' + esc(a) + '">' + esc(a) + '</a><button type="button" class="wkb-cp" data-cp="' + esc(a) + '">复制</button></div>'; }
  var bindCopy = function (root) { /* 「复制」按钮：钱包 App 不让复制就换老办法，再不行提示长按 */
    Array.prototype.forEach.call(root.querySelectorAll(".wkb-cp"), function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-cp") || "", done = function () { b.textContent = "已复制"; };
        var old = function () { try { var x = document.createElement("textarea"); x.value = t; x.setAttribute("readonly", ""); x.style.cssText = "position:fixed;left:-999px;top:0;opacity:0"; document.body.appendChild(x); x.select(); var ok = document.execCommand("copy"); x.remove(); b.textContent = ok ? "已复制" : "请长按地址复制"; } catch (e) { b.textContent = "请长按地址复制"; } };
        try { navigator.clipboard.writeText(t).then(done, old); } catch (e) { old(); }
      };
    });
  };
  var ST = { wait: "⏳ 等烧创世名", ready: "🕐 机器人待发", sending: "🕐 发放中", paid: "✅ 已到账", forfeit: "已放弃" };

  function row(x, i, showAmt) {
    return '<li><i class="wkb-no' + (i < 3 ? " top" : "") + '">' + (i + 1) + '</i><div class="wkb-who"><b data-a="' + esc(x.a) + '">' + esc(x.name) + "</b><small>付手续费 " + dai(x.fee) + " DAI · 占 " + pct(x.share) + "</small></div>" +
      (showAmt ? '<em class="num">' + (x.amt > 0 ? "≈ " + dai(x.amt) : "—") + "<small>DAI</small></em>" : "") + "</li>";
  }
  function draw(d, state) {
    if (!d) { A.app.innerHTML = '<section class="card"><p class="muted">' + (state === "fail" ? "读取失败，请稍后刷新再试。" : "读取中…") + "</p></section>"; return; }
    var p = d.pool, canPay = d.on && !d.pre && p && p.avail != null, html = "";
    if (d.demo) html += '<p class="wkb-demo">👀 这是预览站，下面全是<b>示例数据</b>，只为看页面长什么样。</p>';
    html += '<section class="card wkb-hero"><div class="wkb-tag">🏆 OTC 手续费周榜 · 试运行</div>' +
      (canPay ? '<div class="wkb-big"><b class="num">' + dai(p.avail) + '</b><small>DAI</small></div><div class="wkb-cap">奖金钱包里现在能分的钱 · 有多少分多少</div>'
        : '<div class="wkb-big wkb-soon"><b>' + (d.on && d.pre ? dayCn(d.rules.from) + "开始" : "准备中") + '</b></div><div class="wkb-cap">' + (d.on && d.pre ? "从这一周起，前 " + d.rules.top + " 名开始分奖金钱包里的钱" : "奖金钱包开放后，这里显示钱包里能分的钱") + "</div>") +
      (p && p.a ? addrBox(p.a) : "") +
      '<div class="wkb-week">本周：' + dayCn(d.cyc) + " – " + dayCn(d.to) + " · 周日 24 点截止，周一结算" + (d.endAt > Date.now() ? "（还剩 " + left(d.endAt) + "）" : "") + "</div>" +
      (canPay && p.owed > 0 ? '<div class="wkb-owed">钱包里另有 ' + dai(p.owed) + " DAI 是前几周已经分出去、等领奖的，不算进本周</div>" : "") + "</section>";
    html += '<section class="card"><div class="card-head"><h2>📋 本周榜单</h2><span class="muted">前 ' + d.rules.top + " 名分钱</span></div>" +
      (d.top && d.top.length ? '<ol class="wkb-list">' + d.top.map(function (x, i) { return row(x, i, canPay); }).join("") + "</ol>" : '<p class="muted">本周还没有人上榜，第一笔吃单就是第一名。</p>') +
      '<p class="muted wkb-tip">' + (canPay ? "金额跟着成交和钱包余额实时变，<b>以周一结算那一刻为准</b>，不承诺金额。发的是 <b>AiLGNS</b>。" : "现在只显示排名，开始计奖后这里会显示每人预计分多少。") + "</p>" +
      '<a class="wkb-cta" href="#/otc">💱 去 OTC 吃一单，手续费直接计入 ›</a></section>';
    html += '<section class="card"><div class="card-head"><h2>📖 怎么算</h2></div><ul class="wkb-rules">' +
      "<li><b>排什么</b><span>每周一到周日（北京时间），你在本站 OTC <b>吃单付的手续费</b>加起来，从高到低排。挂单被别人吃不付手续费，不算。</span></li>" +
      "<li><b>谁能分</b><span>前 " + d.rules.top + " 名。钱包要先设好 .ailgns 主名字才上榜，没设的跳过、名额顺延。</span></li>" +
      "<li><b>分多少</b><span>周一结算那一刻，奖金钱包里<b>有多少就分多少</b>，按前 " + d.rules.top + " 名各自手续费的占比分。钱是团队手动转进去的，<b>不承诺金额，也可能是 0</b>。</span></li>" +
      "<li><b>怎么领</b><span>结算后 " + d.rules.burnDays + " 天内，先到「🔥 创世域名销毁」页销毁 1 枚创世名，机器人核对后自动发到你的钱包，不用申请。</span></li>" +
      "<li><b>发什么</b><span>发 <b>AiLGNS</b>：机器人用你分到的这笔 DAI，在本站 OTC 按当时最便宜的卖价买成 AiLGNS 转给你，买到多少发多少。分到不足 1 DAI 的买不了币，不发，留到下周。</span></li>" +
      "<li><b>没领的</b><span>" + d.rules.burnDays + " 天没烧算放弃，这笔钱留在奖金钱包里，滚到下一周。</span></li>" +
      '</ul><a class="wkb-cta wkb-cta2" href="#/genesis">🔥 去销毁创世名 ›</a><p class="muted wkb-tip">📐 试运行期间规则可能调整，以本页为准。</p></section>';
    if (d.last && d.last.top && d.last.top.length) {
      html += '<section class="card"><div class="card-head"><h2>🗓 上周结果</h2><span class="muted">' + dayCn(d.last.cyc) + " – " + dayCn(d.last.to) + " · 共分 " + dai(d.last.avail) + ' DAI</span></div><ol class="wkb-list">' +
        d.last.top.map(function (x, i) { return row(x, i, true); }).join("") + "</ol></section>";
    }
    if (d.pays && d.pays.length) {
      html += '<section class="card"><div class="card-head"><h2>💸 发放记录</h2></div><ul class="wkb-pays">' + d.pays.map(function (x) {
        var s = ST[x.st] || x.st, more = x.st === "wait" ? " · 还剩 " + left(x.due) : "";
        return '<li><div><b data-a="' + esc(x.a) + '">' + esc(x.name) + "</b><small>" + dayCn(x.cyc) + " 那一周 · " + dai(x.amt) + " DAI" + (x.ail > 0 ? " → " + Number(x.ail).toFixed(4) + " AiLGNS" : "") + more + '</small></div><span class="wkb-st ' + esc(x.st) + '">' + (x.st === "paid" && x.tx ? '<a href="#/scan/' + esc(x.a) + '">' + s + " ›</a>" : s) + "</span></li>";
      }).join("") + "</ul></section>";
    }
    A.app.innerHTML = html;
    try { bindCopy(A.app); } catch (e) { /* 复制按钮挂不上不影响看榜 */ }
    try { if (A.credFill) A.credFill(A.app); } catch (e) { /* 信誉标志挂不上不影响看榜 */ }
  }
  A.pages.weekly = function (id) {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(CACHE)); } catch (e) { st = null; }
    if (!st || !st.rules) st = null;
    draw(st, "loading");
    A.getJSON("/api/weekly").then(function (d) {
      if (!d || !d.rules) throw new Error("bad");
      try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch (e) { /* 存不下就算了 */ }
      if (A.isCurrent(id)) draw(d, "done");
    }).catch(function () { if (A.isCurrent(id)) draw(st, st ? "done" : "fail"); });
  };
})();
