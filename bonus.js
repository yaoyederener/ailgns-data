// 🎁 创世域名每日分红计划 · 上线倒计时页 #/bonus（站长 2026-11-11 定）
// 只是一张说明页：创世域名 1 万枚全部铸造完才开启，开启时再重新分配奖励。现在不签到、不发钱、不碰合约。
// 数字来自 /api/name-genesis（已铸造多少枚、近 24 小时多少枚）；认得出钱包时顺手告诉他现在有几票（/api/name-owned）。
(function () {
  var A = window.AIL, TOTAL = 10000, timer = 0;
  function n(v) { return Number(v || 0).toLocaleString("en-US"); }
  function el(id) { return document.getElementById(id); }
  function paint(j) {
    if (!el("bn-left")) return;
    var got = Math.min(TOTAL, Number(j && j.n) || 0), left = TOTAL - got, day = Number(j && j.day) || 0;
    el("bn-left").textContent = left > 0 ? n(left) : "0";
    el("bn-unit").textContent = left > 0 ? "枚后开启" : "已全部铸造完成，即将开启";
    el("bn-fill").style.width = Math.max(2, Math.round(got / TOTAL * 1000) / 10) + "%";
    el("bn-n").textContent = "已铸造 " + n(got) + " / " + n(TOTAL);
    el("bn-eta").textContent = left > 0 && day > 0 ? "近 24 小时 +" + n(day) + " 枚，照这个速度大约还要 " + Math.max(1, Math.ceil(left / day)) + " 天" : "";
  }
  function load() {
    fetch("/api/name-genesis").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(paint).catch(function () {
      if (el("bn-n") && el("bn-left") && el("bn-left").textContent === "…") el("bn-n").textContent = "数字暂时没读到，稍后自动重试";
    });
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
      '<div class="bn-bar"><i id="bn-fill"></i></div><p class="bn-meta"><span id="bn-n">读取中…</span><span id="bn-eta"></span></p></div>' +
      '<p class="bn-me" id="bn-me" hidden></p>' +
      '<a class="bn-go" href="#/names">去注册创世域名</a><p class="note">前 1 万个付费注册的 .ailgns 名字就是创世域名，注册完自动带编号。</p></section>' +
      '<section class="card bn"><h2>规则一共四条</h2><ol class="bn-rules">' +
      "<li><b>持有创世域名</b><span>钱包里至少有 1 枚创世域名。1 枚算 1 票，持有越多票越多。</span></li>" +
      "<li><b>每天签到</b><span>签到免费。每天从签到的人里随机抽 50 名。</span></li>" +
      "<li><b>域名收入的 30% 拿来分</b><span>注册费、续费、市场手续费、置顶费全算。OTC 的收入不动。分红发 AiLGNS。</span></li>" +
      "<li><b>大额分红要销毁 1 枚普通域名</b><span>单次分红超过 10 DAI，先销毁 1 枚普通域名再领。10 DAI 以内直接到账。</span></li>" +
      '</ol><p class="note">开启时会重新分配各项奖励，细则以开启当天网站公布的为准。</p></section>' +
      '<section class="card bn"><h2>常见问题</h2>' +
      "<details><summary>现在需要做什么？</summary><p>什么都不用做，钱包里留着创世域名就行。开启后每天来这页点一下签到。</p></details>" +
      "<details><summary>挂在市场上卖的创世域名算票吗？</summary><p>不算。挂单的名字存在市场里，不在你钱包里。撤单拿回钱包就算。</p></details>" +
      "<details><summary>普通域名是什么？</summary><p>没有创世编号的 .ailgns 名字。大额分红领奖时销毁 1 枚，创世域名不用动。</p></details>" +
      "<details><summary>什么时候开启？</summary><p>没有固定日期，看铸造进度。上面的数字归零那天开启。</p></details></section>";
    load(); mine();
    clearInterval(timer);
    timer = setInterval(function () { if (!el("bn-left")) { clearInterval(timer); return; } load(); }, 30000);
  }
  A.pages.bonus = function () { try { render(); } catch (e) { A.app.innerHTML = '<section class="card"><p class="muted">页面没画出来，请刷新再试。</p></section>'; } };
})();
