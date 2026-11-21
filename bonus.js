// 🎁 创世域名分红 · 每日签到页 #/bonus（站长 2026-11-21 定的五条：创世域名持有人 / 每日签到 / 奖池累计满 500 DAI 发一次 / 发 AiLGNS / 钱来自普通域名销售收入）
// 2026-11-21 站长补充：满 500 DAI 时「按票数随机抽 50 人」（中签的平分；一个钱包一轮最多中一次；不到 50 个钱包就全中——后三条是我配的默认）。
// 这页做两件事：① 显示奖池现在多少、离 500 DAI 还差多少；② 让持有创世域名的钱包每天签到一次（钱包免费签名，不上链、不花钱）。
// 奖池金额来自 /api/name-genesis 的 pool（奖池钱包的链上余额）；签到记账在 /api/bonus。这页不转账、不调合约。发放还没做。
(function () {
  var A = window.AIL, GOAL = 500, WIN = 50, POOL = "0xf1a871f4f732fb2217cda4e4224d2b2d3b4aa6c2", timer = 0, eth = null, account = "", info = null, busy = false, pool = null;
  function n(v) { return Number(v || 0).toLocaleString("en-US"); }
  function n2(v) { return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function el(id) { return document.getElementById(id); }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function utf8hex(str) { var b = unescape(encodeURIComponent(str)), h = "0x"; for (var i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return h; }
  // 签名文字必须和 functions/api/bonus.js 里的 signText 一字不差
  function signText(day, a) { return "AiLGNS 创世域名分红 · 每日签到\n日期：" + day + "\n钱包：" + a + "\n只是签名，不花钱、不转账。"; }
  function say(t, bad) { var s = el("bn-st"); if (!s) return; s.textContent = t || ""; s.hidden = !t; s.className = "bn-st" + (bad ? " bad" : ""); }

  function paintPool() {
    if (!el("bn-pool")) return;
    var goal = Number(info && info.goal) || GOAL, has = pool === null ? null : Number(pool) || 0;
    el("bn-pool").textContent = has === null ? "…" : n2(has);
    el("bn-fill").style.width = Math.max(2, Math.min(100, Math.round((has || 0) / goal * 1000) / 10)) + "%";
    el("bn-need").textContent = has === null ? "读取中…" : has >= goal ? "奖池已满 " + n(goal) + " DAI，等待发放" : "还差 " + n2(goal - has) + " DAI 就发放";
    var all = info && info.all;
    el("bn-all").textContent = all ? "第 " + n(info.round) + " 轮 · 已有 " + n(all.w) + " 个钱包签到，今天 " + n(all.today) + " 个" : "";
  }
  function paintMe() {
    var box = el("bn-me"), btn = el("bn-sign"); if (!box || !btn) return;
    var me = info && info.me;
    btn.disabled = busy;
    if (!account) { box.hidden = true; btn.textContent = "连接钱包签到"; return; }
    box.hidden = false;
    if (!me) { box.textContent = "钱包 " + short(account) + "：签到数据读取中…"; btn.textContent = "✍️ 今日签到（免费）"; return; }
    if (me.held < 0) { box.textContent = "钱包 " + short(account) + "：暂时没读到你的域名，过一分钟再来。"; btn.textContent = "✍️ 今日签到（免费）"; return; }
    if (me.held === 0) {
      box.innerHTML = "钱包 " + short(account) + " 里没有创世域名，有 1 枚就能签到。" + (me.days > 0 ? "（本轮已签 " + n(me.days) + " 天）" : "");
      btn.textContent = "去域名市场买创世域名 →"; return;
    }
    box.innerHTML = "钱包 " + short(account) + " 有 <b>" + n(me.held) + "</b> 枚创世域名，签到一天记 <b>" + n(me.held) + "</b> 票。" +
      (me.days > 0 ? "<br>本轮已签 <b>" + n(me.days) + "</b> 天，共 <b>" + n(me.tickets) + "</b> 票。" : "");
    if (me.signed) { btn.textContent = "✅ 今天已签到，明天再来"; btn.disabled = true; }
    else btn.textContent = "✍️ 今日签到（免费）";
  }
  function paint() { try { paintPool(); paintMe(); } catch (e) {} }

  // 🏆 签到排行榜（站长 2026-11-21：「弄一个签到排行榜，把签到的创世域名都列出来」）：这一轮按票数排，每个钱包下面列出它现在手里的创世域名。
  // 先给上次存的，再去拿新的（接口那头缓存 60 秒）。手机先看前 10 个钱包、每个钱包先看 3 个名字，其余点开再看
  var rk = null, rkAll = false, rkOpen = {};
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function paintRank() {
    var box = el("bn-rk"); if (!box) return;
    if (!rk) { box.innerHTML = '<p class="muted">读取中…</p>'; return; }
    var list = rk.list || [];
    if (!list.length) { box.innerHTML = '<p class="muted">这一轮还没有人签到。你来当第一个。</p>'; return; }
    var show = rkAll ? list.length : Math.min(10, list.length);
    box.innerHTML = '<p class="bn-rk-top">第 ' + n(rk.round) + " 轮 · 共 " + n(rk.w) + ' 个钱包签到 · 按票数排</p><ol class="bn-rk-l">' + list.slice(0, show).map(function (r, i) {
      var g = r.g || [], open = !!rkOpen[r.a], cut = open ? g.length : Math.min(3, g.length), me = account && r.a === account;
      var who = me ? '<b class="bn-rk-me">我</b>' : (A.nameTag ? A.nameTag(r.a) : short(r.a));
      return '<li class="bn-rk-i' + (me ? " me" : "") + '"><div class="bn-rk-h"><i class="bn-rk-no' + (i < 3 ? " top" : "") + '">' + (i + 1) + '</i><span class="bn-rk-w mono">' + who + '</span><b class="bn-rk-t">' + n(r.t) + " 票</b></div>" +
        '<p class="bn-rk-s">签到 ' + n(r.n) + " 天 · " + (r.td ? "今天已签" : "今天还没签") + (r.gn >= 0 ? " · 现在有 " + n(r.gn) + " 枚创世域名" : "") + "</p>" +
        (g.length ? '<p class="bn-rk-g">' + g.slice(0, cut).map(function (x) { return '<a href="#/names/' + encodeURIComponent(x[1] + ".ailgns") + '">🌟 ' + esc(x[1]) + ".ailgns <small>#" + x[0] + "</small></a>"; }).join("") +
          (g.length > 3 ? '<button type="button" class="bn-rk-more" data-rk="' + r.a + '">' + (open ? "收起" : "展开全部 " + n(r.gn) + " 枚") + "</button>" : "") +
          (open && r.gn > g.length ? '<span class="bn-rk-rest">还有 ' + n(r.gn - g.length) + " 枚没列出</span>" : "") + "</p>"
          : r.gn === 0 ? '<p class="bn-rk-g none">签到后名字已转走或挂到市场，现在钱包里没有创世域名</p>' : "") + "</li>";
    }).join("") + "</ol>" + (list.length > 10 ? '<button type="button" class="bn-rk-all" id="bn-rk-all">' + (rkAll ? "收起，只看前 10 名" : "再看后面 " + n(list.length - 10) + " 个钱包") + "</button>" : "") +
      (rk.w > list.length ? '<p class="note">榜上只列票数最多的 ' + n(list.length) + " 个钱包。</p>" : "");
  }
  function loadRank() {
    if (!rk) { try { var c = JSON.parse(localStorage.getItem("bn:rk") || "null"); if (c && c.list) rk = c; } catch (e) {} }
    try { paintRank(); } catch (e) {}
    return fetch("/api/bonus?rank=1").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
      if (!j || !j.list) throw new Error("bad");
      rk = j; try { localStorage.setItem("bn:rk", JSON.stringify(j)); } catch (e) {}
      paintRank();
    }).catch(function () { try { if (!rk && el("bn-rk")) el("bn-rk").innerHTML = '<p class="muted">排行榜暂时没读到，稍后自动重试。</p>'; } catch (e) {} });
  }

  function loadPool() {
    return fetch("/api/name-genesis").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
      if (j && j.pool !== undefined && j.pool !== null) pool = Number(j.pool) || 0;
      paint();
    }).catch(function () {
      // 接口没答上来：自己读一次奖池钱包的链上余额（Anubis 上 DAI 就是原生币）
      return A.wallet.rpcOn("anubis", "eth_getBalance", [POOL, "latest"]).then(function (b) { pool = Number(BigInt(b) / 10n ** 14n) / 1e4; paint(); });
    }).catch(function () { if (el("bn-need") && pool === null) el("bn-need").textContent = "奖池金额暂时没读到，稍后自动重试"; });
  }
  function loadInfo() {
    return fetch("/api/bonus" + (account ? "?a=" + account : "")).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j || j.error) throw new Error((j && j.error) || "bad"); return j; }); })
      .then(function (j) { info = j; paint(); return j; })
      .catch(function (e) { if (account && el("bn-me")) { el("bn-me").hidden = false; el("bn-me").textContent = "钱包 " + short(account) + "：" + (e && /[一-龥]/.test(e.message || "") ? e.message : "签到数据暂时没读到，稍后再试"); } return null; });
  }
  function connect() {
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); })
      .then(function (a) { var got = String(a[0]).toLowerCase(); if (got !== account) { account = got; info = info ? { day: info.day, round: info.round, goal: info.goal, all: info.all } : null; } return account; });
  }
  function onSign() {
    if (busy) return;
    var me = info && info.me;
    if (account && me && me.held === 0) { location.hash = "#/names/otc"; return; }
    busy = true; say(""); paint();
    var done = function () { busy = false; paint(); };
    (eth && account ? Promise.resolve() : connect()).then(function () { paint(); return loadInfo(); }).then(function (j) {
      if (!j || !j.me) throw new Error("签到数据暂时没读到，稍后再点一次");
      if (j.me.held < 0) throw new Error("暂时没读到你的域名，过一分钟再点");
      if (j.me.held === 0) { say("这个钱包里没有创世域名。刚买的等 1 分钟再点；挂在市场里卖的不算。", true); return null; }
      if (j.me.signed) { say("今天已经签过了，明天再来。"); return null; }
      say("请在钱包里签名（只是签名，不扣钱、不花 Gas）…");
      return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(signText(j.day, account)), account] }).then(function (sig) {
        say("正在登记…");
        return fetch("/api/bonus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: account, sig: sig }) }).then(function (r) { return r.json(); });
      }).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || "没记上，稍后再点一次");
        info = info || {}; info.me = r.me; info.day = r.day; info.round = r.round;
        if (info.all && !r.already) { info.all.today = (Number(info.all.today) || 0) + 1; if (r.me.days === 1) info.all.w = (Number(info.all.w) || 0) + 1; }
        say("✅ 签到成功，今天记 " + n(r.me.held) + " 票。明天再来。");
        setTimeout(function () { try { loadRank(); } catch (e) {} }, 1500); // 榜一分钟更新一次，刚签的可能要等一会儿才上榜
      });
    }).then(done, function (e) {
      var m = String((e && e.message) || "");
      say(e && (e.code === 4001 || /reject|denied|cancel/i.test(m)) ? "你取消了签名，没有签到。" : /[一-龥]/.test(m) ? m : "没签成，稍后再点一次。", true);
      done();
    });
  }
  function render() {
    A.app.innerHTML =
      '<section class="card bn"><h1>🎁 创世域名分红计划</h1><p class="sub">持有创世域名，每天签到。奖池每满 ' + n(GOAL) + ' DAI，按票数随机抽 ' + n(WIN) + ' 人，发 AiLGNS。</p>' +
      '<div class="bn-cd"><p class="bn-cap">分红奖池现在有</p><div class="bn-big"><b id="bn-pool">…</b><span>DAI</span></div>' +
      '<div class="bn-bar"><i id="bn-fill"></i></div><p class="bn-meta"><span id="bn-need">读取中…</span><span id="bn-all"></span></p></div>' +
      '<p class="bn-me" id="bn-me" hidden></p>' +
      '<button type="button" class="bn-go bn-sign" id="bn-sign">连接钱包签到</button><p class="bn-st" id="bn-st" hidden></p>' +
      '<p class="note">签到只是在钱包里签个名，不花钱、不转账、不用 Gas。奖池的钱在链上，<a href="#/scan/' + POOL + '">随时可查</a>。</p></section>' +
      '<section class="card bn"><h2>🏆 签到排行榜</h2><div id="bn-rk"></div><p class="note">每分钟更新一次。名字是钱包现在手里的创世域名；挂在市场里卖的不算。</p></section>' +
      '<section class="card bn"><h2>规则一共五条</h2><p class="bn-warn">⚠️ 试运行中，规则可能随时调整，以本页最新显示为准。</p><ol class="bn-rules">' +
      "<li><b>谁能领：创世域名持有人</b><span>钱包里至少有 1 枚创世域名。1 枚签到一天记 1 票，持有越多票越多。</span></li>" +
      "<li><b>怎么参加：每天签到</b><span>每天来这页点一次签到，免费。不签到的那天没有票。</span></li>" +
      "<li><b>怎么抽：奖池满 " + n(GOAL) + " DAI，按票数随机抽 " + n(WIN) + " 人</b><span>奖池每累计满 " + n(GOAL) + " DAI 抽一次，从这一轮签到的钱包里按票数随机抽 " + n(WIN) + " 个，票越多越容易中。一个钱包一轮最多中一次。抽完开始下一轮，票从头算。</span></li>" +
      "<li><b>发什么：AiLGNS</b><span>中签的钱包平分奖池，发 AiLGNS，直接打到中签的钱包。</span></li>" +
      "<li><b>钱从哪里来</b><span>普通域名的销售收入。以后计划加入极速预言奖池的分红。</span></li>" +
      '</ol></section>' +
      '<section class="card bn"><h2>常见问题</h2>' +
      "<details><summary>签到要花钱吗？</summary><p>不花钱。签到只是在钱包里签个名，不转账、不用 Gas。任何让你转账才能签到的都是骗子。</p></details>" +
      "<details><summary>挂在市场上卖的创世域名算票吗？</summary><p>不算。挂单的名字存在市场里，不在你钱包里。撤单拿回钱包就算。已销毁的也不算。</p></details>" +
      "<details><summary>刚买的创世域名签不了？</summary><p>等 1 分钟再点。网站要等链上记录同步过来才认得出。</p></details>" +
      "<details><summary>没有创世域名怎么办？</summary><p>1 万枚创世域名已经全部注册完，现在只能去 <a href=\"#/names/otc\">域名市场</a> 买别人挂出来的。</p></details>" +
      "<details><summary>什么时候抽？</summary><p>没有固定日期。奖池满 " + n(GOAL) + " DAI 就抽一次，上面的进度条能看到还差多少。</p></details>" +
      "<details><summary>签到了就一定有吗？</summary><p>不一定。每轮只抽 " + n(WIN) + " 个钱包，签到天数越多、创世域名越多，票就越多，越容易中。签到的钱包不到 " + n(WIN) + " 个时，全部中签。</p></details></section>";
    el("bn-sign").onclick = function () { try { onSign(); } catch (e) { busy = false; say("没签成，稍后再点一次。", true); } };
    info = null; busy = false;
    if (!eth || !account) { // 这次打开网站还没在这页连过钱包：先用上次认得的地址显示，点签到时再真正连
      eth = null; account = "";
      var saved = ""; try { saved = String(localStorage.getItem("ib:acct") || "").toLowerCase(); } catch (e) {}
      if (/^0x[0-9a-f]{40}$/.test(saved)) account = saved;
    }
    paint(); loadPool(); loadInfo(); loadRank();
    el("bn-rk").onclick = function (e) {
      try {
        var t = e.target, m = t.closest ? t.closest("button[data-rk]") : null;
        if (m) { var k = m.getAttribute("data-rk"); rkOpen[k] = !rkOpen[k]; paintRank(); return; }
        if (t.id === "bn-rk-all") { rkAll = !rkAll; paintRank(); }
      } catch (x) {}
    };
    if (!account) { try { if (A.wallets && A.wallets.silent) A.wallets.silent().then(function (a) { a = String(a || "").toLowerCase(); if (/^0x[0-9a-f]{40}$/.test(a) && !account) { account = a; paint(); loadInfo(); } }, function () {}); } catch (e) {} }
    clearInterval(timer);
    timer = setInterval(function () { if (!el("bn-pool")) { clearInterval(timer); return; } loadPool(); if (!busy) loadInfo(); loadRank(); }, 60000);
  }
  A.pages.bonus = function () { try { render(); } catch (e) { A.app.innerHTML = '<section class="card"><p class="muted">页面没画出来，请刷新再试。</p></section>'; } };
})();
