// 🎁 创世域名每日分红计划 · 上线倒计时页 #/bonus（站长 2026-11-11 定）
// 只是一张说明页：创世域名 1 万枚全部铸造完才开启，开启时再重新分配奖励。现在不签到、不发钱、不碰合约。
// 数字来自 /api/name-genesis（已铸造多少枚、近 24 小时多少枚）；认得出钱包时顺手告诉他现在有几票（/api/name-owned）。
(function () {
  var A = window.AIL, TOTAL = 10000, timer = 0, tick = 0, target = 0, shown = 0, tkey = "";
  function n(v) { return Number(v || 0).toLocaleString("en-US"); }
  function el(id) { return document.getElementById(id); }
  function paint(j) {
    if (!el("bn-left")) return;
    var got = Math.min(TOTAL, Number(j && j.n) || 0), left = TOTAL - got, day = Number(j && j.day) || 0;
    el("bn-left").textContent = left > 0 ? n(left) : "0";
    el("bn-unit").textContent = left > 0 ? "枚后开启" : "已全部铸造完成，即将开启";
    el("bn-fill").style.width = Math.max(2, Math.round(got / TOTAL * 1000) / 10) + "%";
    el("bn-n").textContent = "已铸造 " + n(got) + " / " + n(TOTAL);
    el("bn-eta").textContent = left <= 0 ? "" : day > 0 ? "按近 24 小时 +" + n(day) + " 枚的速度估算，铸得快就提前" : "近 24 小时没有新铸造，暂时估不出时间";
    setTarget(left, day);
  }
  // 实时倒计时：预计开启时刻 = 现在 + 剩余枚数 ÷ 近 24 小时铸造速度。只在「剩余 / 速度」变了才重算，其余时间一秒一秒往下走；
  // 记在本地，刷新页面不会跳。目标变了时数字滚动着追过去，不硬跳。
  function setTarget(left, day) {
    var box = el("bn-clock"); if (!box) return;
    if (!(left > 0 && day > 0)) { target = 0; box.hidden = true; return; }
    var key = left + "|" + day;
    if (key !== tkey || !target) {
      var sv = null; try { sv = JSON.parse(localStorage.getItem("bn:t") || "null"); } catch (e) {}
      if (sv && sv.k === key && sv.t > Date.now()) target = sv.t;
      else { target = Date.now() + Math.round(left / day * 86400000); try { localStorage.setItem("bn:t", JSON.stringify({ k: key, t: target })); } catch (e) {} }
      tkey = key;
    }
    if (!shown) shown = target;
    box.hidden = false; clock();
  }
  function p2(v) { return (v < 10 ? "0" : "") + v; }
  function clock() {
    if (!el("bn-clock") || !target) return;
    shown = Math.abs(target - shown) > 1500 ? shown + (target - shown) * 0.5 : target;
    var s = Math.max(0, Math.floor((shown - Date.now()) / 1000));
    el("bn-d").textContent = Math.floor(s / 86400); el("bn-h").textContent = p2(Math.floor(s % 86400 / 3600));
    el("bn-m").textContent = p2(Math.floor(s % 3600 / 60)); el("bn-s").textContent = p2(s % 60);
  }
  function load() {
    fetch("/api/name-genesis").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(paint).catch(function () {
      if (el("bn-n") && el("bn-left") && el("bn-left").textContent === "…") el("bn-n").textContent = "数字暂时没读到，稍后自动重试";
    });
  }
  // 估算：中签的人每人大概分多少。域名收入从 /api/oracle 里现成的数字反推（last.rev 是整天收入；drawing.allot ÷ 奖池比例 = 前一天整天收入），
  // 取最近两个整天的平均 × 30% ÷ 50 人。只是估算，读不到就整块不显示。
  function est() {
    var c = null; try { c = JSON.parse(localStorage.getItem("bn:est") || "null"); } catch (e) {}
    if (c && c.per > 0) { paintEst(c); if (Date.now() - c.at < 3600000) return; } // 先给上次的数，一小时内不重读
    fetch("/api/oracle").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
      if (!j) return;
      var days = {}, L = j.last || {}, D = j.drawing || {}, share = Number(L.rev) > 0 && Number(L.allot) > 0 ? Number(L.allot) / Number(L.rev) : 0;
      if (L.day && Number(L.rev) > 0) days[L.day] = Number(L.rev);
      if (D.day && share > 0 && Number(D.allot) > 0) days[D.day] = Number(D.allot) / share;
      var ks = Object.keys(days); if (!ks.length) return;
      var avg = ks.reduce(function (s, k) { return s + days[k]; }, 0) / ks.length, pot = avg * 0.3, per = pot / 50;
      if (!(per > 0)) return;
      var px = Number(j.funds && j.funds.otc && j.funds.otc.px) || 0, o = { per: per, avg: avg, pot: pot, k: ks.length, ail: px > 0 ? per / px : 0, at: Date.now() };
      try { localStorage.setItem("bn:est", JSON.stringify(o)); } catch (e) {}
      paintEst(o);
    }).catch(function () {});
  }
  function paintEst(o) {
    try {
      var box = el("bn-est"); if (!box) return;
      var per = o.per, avg = o.avg, pot = o.pot, ail = o.ail, ks = { length: o.k };
      box.innerHTML = '<p class="bn-est-t">💰 照现在的收入估算</p>' +
        '<p class="bn-est-n">中签的人每人大约 <b>' + n(Math.round(per)) + ' DAI</b></p>' +
        (ail > 0 ? '<p class="bn-est-s">发 AiLGNS，按现在的价格约 ' + ail.toFixed(4) + " 枚</p>" : "") +
        '<p class="bn-est-s">怎么算的：最近 ' + ks.length + " 天域名注册和续费收入平均每天 " + n(Math.round(avg)) + " DAI，拿 30% 是 " + n(Math.round(pot)) + " DAI，50 人平分。</p>" +
        (per > 10 ? '<p class="bn-est-s">超过 10 DAI，领之前要先销毁 1 枚普通域名。</p>' : "") +
        '<p class="bn-est-w">只是估算，不是承诺。每天只抽 50 人，不是人人都有；开启后域名收入可能比现在少，实际以当天为准。</p>';
      box.hidden = false;
    } catch (e) {}
  }
  function mine() {
    var box = el("bn-me"); if (!box) return;
    var show = function (a) {
      a = String(a || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(a)) return;
      fetch("/api/name-owned?a=" + a).then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
        var b = el("bn-me"); if (!b) return;
        var k = ((j && j.list) || []).filter(function (x) { return Number(x.no) > 0; }).length, short = a.slice(0, 6) + "…" + a.slice(-4);
        b.innerHTML = k > 0 ? "你的钱包 " + short + " 现在有 <b>" + n(k) + "</b> 枚创世域名，开启后每天有 <b>" + n(k) + "</b> 票"
          : "你的钱包 " + short + " 里还没有创世域名，有 1 枚就能参加";
        b.hidden = false;
      }).catch(function () {});
    };
    var saved = ""; try { saved = localStorage.getItem("ib:acct") || ""; } catch (e) {}
    if (saved) return show(saved);
    try { if (A.wallets && A.wallets.silent) A.wallets.silent().then(show, function () {}); } catch (e) {}
  }
  function render() {
    A.app.innerHTML =
      '<section class="card bn"><h1>🎁 创世域名每日分红计划</h1><p class="sub">上线倒计时：1 万枚创世域名全部铸造完成，分红就开启。</p>' +
      '<div class="bn-cd"><div class="bn-big"><b id="bn-left">…</b><span id="bn-unit">枚后开启</span></div>' +
      '<div class="bn-bar"><i id="bn-fill"></i></div><p class="bn-meta"><span id="bn-n">读取中…</span></p>' +
      '<div class="bn-clock" id="bn-clock" hidden><p>预计还有</p><div><span><b id="bn-d">0</b>天</span><span><b id="bn-h">00</b>时</span><span><b id="bn-m">00</b>分</span><span><b id="bn-s">00</b>秒</span></div></div>' +
      '<p class="bn-meta bn-meta2"><span id="bn-eta"></span></p></div>' +
      '<div class="bn-est" id="bn-est" hidden></div><p class="bn-me" id="bn-me" hidden></p>' +
      '<a class="bn-go" href="#/names">去注册创世域名</a><p class="note">前 1 万个付费注册的 .ailgns 名字就是创世域名，注册完自动带编号。</p></section>' +
      '<section class="card bn"><h2>规则一共四条</h2><ol class="bn-rules">' +
      "<li><b>持有创世域名</b><span>钱包里至少有 1 枚创世域名。1 枚算 1 票，持有越多票越多。</span></li>" +
      "<li><b>每天签到</b><span>签到免费。每天从签到的人里随机抽 50 名。</span></li>" +
      "<li><b>注册费和续费的 30% 拿来分</b><span>只算域名注册费和续费，其它收入都不动。分红发 AiLGNS。</span></li>" +
      "<li><b>大额分红要销毁 1 枚普通域名</b><span>单次分红超过 10 DAI，先销毁 1 枚普通域名再领。10 DAI 以内直接到账。</span></li>" +
      '</ol><p class="note">开启时会重新分配各项奖励，细则以开启当天网站公布的为准。</p></section>' +
      '<section class="card bn"><h2>常见问题</h2>' +
      "<details><summary>现在需要做什么？</summary><p>什么都不用做，钱包里留着创世域名就行。开启后每天来这页点一下签到。</p></details>" +
      "<details><summary>挂在市场上卖的创世域名算票吗？</summary><p>不算。挂单的名字存在市场里，不在你钱包里。撤单拿回钱包就算。</p></details>" +
      "<details><summary>普通域名是什么？</summary><p>没有创世编号的 .ailgns 名字。大额分红领奖时销毁 1 枚，创世域名不用动。</p></details>" +
      "<details><summary>什么时候开启？</summary><p>没有固定日期，看铸造进度。上面的数字归零那天开启。倒计时是按现在的铸造速度估的，铸得快就提前。</p></details></section>";
    load(); mine(); est();
    clearInterval(timer); clearInterval(tick); shown = 0;
    tick = setInterval(function () { if (!el("bn-clock")) { clearInterval(tick); return; } try { clock(); } catch (e) {} }, 1000);
    timer = setInterval(function () { if (!el("bn-left")) { clearInterval(timer); return; } load(); }, 30000);
  }
  A.pages.bonus = function () { try { render(); } catch (e) { A.app.innerHTML = '<section class="card"><p class="muted">页面没画出来，请刷新再试。</p></section>'; } };
})();
