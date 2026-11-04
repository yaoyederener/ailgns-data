// 🏆 AiLGNS 荣耀榜（#/rank）：OTC 成交大户排行，和会员卡「OTC 累计成交」同一口径（单笔满 50 DAI 才算）
// 总榜 + 月榜（每月 1 号清零）+ 段位（最强王者 / 荣耀王者 / 王者 / 星耀 / 钻石）+ 名人堂（历届月榜前三）
// 全站：顶部播报条（感谢前三、名次上升、月底倒计时）；总榜前 50 的名字走到哪里都带段位徽章（scan.js 换名字时加）
(function () {
  "use strict";

  var A = window.AIL;
  var TIER = [["👑", "最强王者"], ["🏆", "荣耀王者"], ["💎", "王者"], ["⭐", "星耀"], ["🔷", "钻石"]];
  var MEDAL = ["👑", "🥈", "🥉"];
  var badgeMap = {};
  function tierOfRank(r) { return !r ? -1 : r === 1 ? 0 : r <= 3 ? 1 : r <= 10 ? 2 : r <= 20 ? 3 : r <= 50 ? 4 : -1; }
  // 全站徽章：总榜名次 → 名字前面的小图标（前三用奖牌，其余用段位图标）
  A.rankBadge = function (a) { var r = badgeMap[String(a || "").toLowerCase()]; return !r ? "" : r <= 3 ? MEDAL[r - 1] : TIER[tierOfRank(r)][0]; };
  A.rankTitle = function (a) { var r = badgeMap[String(a || "").toLowerCase()]; return r ? "荣耀榜总榜第 " + r + " 名 · " + TIER[tierOfRank(r)][1] : ""; };
  var tick = null;
  A.rankReady = fetch("/api/rank?ticker=1").then(function (r) { return r.json(); }).then(function (d) { badgeMap = d.badges || {}; tick = d; ticker(d); }).catch(function () {});

  function dai(v) { return Number(v).toLocaleString("en-US") + " DAI"; }
  function left(ms) { var h = Math.max(0, Math.floor(ms / 3600e3)); return h >= 24 ? Math.floor(h / 24) + " 天 " + (h % 24) + " 小时" : h + " 小时 " + Math.max(0, Math.floor(ms / 60e3) % 60) + " 分"; }
  function tierChip(t) { return t < 0 ? "" : '<span class="hn-tier hn-t' + t + '">' + TIER[t][0] + " " + TIER[t][1] + "</span>"; }

  // ---------- 顶部播报条（全站） ----------
  // 播报里的地址：有域名的直接显示域名昵称（先查好名字再开播，最多等 3 秒）
  function ticker(d) {
    var as = [];
    (d.top3 || []).concat(d.mtop3 || []).forEach(function (x) { as.push(x.a); });
    (d.ev || []).slice(0, 5).forEach(function (e) { as.push(e.a); if (e.over) as.push(e.over); });
    var N = {}, go = function () { tickerRun(d, function (a) { return N[a] || A.short(a); }); }, done = false;
    var once = function () { if (!done) { done = true; go(); } };
    if (!A.nameOf || !as.length) return go();
    setTimeout(once, 3000);
    Promise.all(as.map(function (a) { return A.nameOf(a).then(function (n) { if (n) N[a] = n; }).catch(function () {}); })).then(once);
  }
  function tickerRun(d, nm) {
    var msgs = [];
    if (d.top3 && d.top3.length) msgs.push("🏆 感谢 " + d.top3.map(function (x, i) { return MEDAL[i] + "榜" + "一二三"[i] + " " + nm(x.a); }).join("、") + " 为 AiLGNS 做出的贡献！");
    (d.ev || []).slice(0, 5).forEach(function (e) {
      var t = tierOfRank(e.to);
      msgs.push("🔥 " + nm(e.a) + (e.over ? " 刚刚超过 " + nm(e.over) + "，" : " 冲进榜单，") + "升到本月第 " + e.to + " 名【" + TIER[t][1] + "】！");
    });
    if (d.mtop3 && d.mtop3[0]) msgs.push("👑 本月榜一 " + nm(d.mtop3[0].a) + "，已成交 " + dai(d.mtop3[0].vol) + "，谁来挑战？");
    var rest = d.end - Date.now();
    if (rest > 0 && rest < 3 * 86400e3) msgs.push("⏰ 本月榜一争夺战还剩 " + left(rest) + "，月底定冠军，永久刻进名人堂！");
    // 🔮 预言家：大奖池金额 + 最近一期结果（一天内）
    var or = d.or;
    if (or) {
      if (or.last && Date.now() - or.last.at < 86400e3) {
        if (or.last.j.length) msgs.unshift("🎯 神预测！" + or.last.j.join("、") + " 猜中开奖价 " + (or.last.px / 1000).toFixed(3) + "，瓜分超级大奖池！");
        else if (or.last.c) msgs.push("🔮 今日预言家 " + or.last.c.name + "：只差 " + (or.last.c.diff / 1000).toFixed(3) + "，拿下 " + or.last.c.amt + " DAI！");
      }
      msgs.push("🔮 预言家超级大奖池已累积 " + Number(or.pool).toLocaleString("en-US") + " DAI，猜中今晚 AiLGNS 价格就能拿走 →");
    }
    // 💎 域名史上最高成交
    if (d.nmTop && d.nmTop.name) msgs.unshift("💎 域名史上最高成交：" + d.nmTop.name + " 以 " + Number(d.nmTop.dai).toLocaleString("en-US") + " DAI 成交！好名字只有一个，下一个天价名字是谁？→");
    if (!msgs.length) return;
    // 穿插「注册域名」引导：上榜大哥只显示 0x 地址太可惜，亮出名字让全网知道
    var DOM = ["🌐 上了荣耀榜却只显示一串 0x？注册 .ailgns 域名，让全网知道你是谁 →",
      "✨ 大哥都有名号！注册 .ailgns 域名，荣耀榜、OTC 挂单、成交记录，全站亮出你的名字 →",
      "💎 好名字全球只有一个，先注册先得，晚一步就是别人的 →",
      "🏆 榜上有名，更要有名！5 DAI 起注册 .ailgns，名字永久跟着你 →",
      "📣 0x 地址没人记得住，xxx.ailgns 一眼就记住：别人转账填名字就行 →"];
    var list = msgs.map(function (t) { return { t: t, h: /^(🔮|🎯)/.test(t) ? "#/oracle" : /^💎 域名/.test(t) ? "#/names" : "#/rank" }; });
    var mix = [];
    list.forEach(function (m, i) { mix.push(m); mix.push({ t: DOM[i % DOM.length], h: "#/names" }); });
    // 前三名、本月榜一还没域名的：点名邀请
    var who = [];
    (d.top3 || []).forEach(function (x, i) { who.push([x.a, MEDAL[i] + " 榜" + "一二三"[i] + "大哥"]); });
    if (d.mtop3 && d.mtop3[0]) who.push([d.mtop3[0].a, "👑 本月榜一"]);
    if (A.nameOf) Promise.all(who.map(function (w) { return A.nameOf(w[0]).catch(function () { return null; }); })).then(function (ns) {
      var seen = {};
      ns.forEach(function (nm, i) {
        var a = who[i][0]; if (nm || seen[a]) return; seen[a] = 1;
        mix.splice(Math.min(mix.length, 1 + i * 2), 0, { t: who[i][1] + " " + A.short(a) + "，您还没有名字！注册一个 .ailgns 域名，让全网记住您的大名 →", h: "#/names" });
      });
    });
    var app = A.app, bar = document.getElementById("hn-tick");
    if (!bar) {
      bar = document.createElement("a"); bar.id = "hn-tick"; bar.href = "#/rank"; bar.setAttribute("data-nb", "1");
      bar.innerHTML = '<span class="hn-tk-l">荣耀榜</span><span class="hn-tk-m" id="hn-tk-m"></span><span class="hn-tk-r">看榜 ›</span>';
      var wrap = document.createElement("div"); wrap.className = "wrap"; wrap.appendChild(bar); // 和页面内容同宽对齐
      app.parentNode.insertBefore(wrap, app);
    }
    var i = 0, m = document.getElementById("hn-tk-m");
    var show = function () { var x = mix[i++ % mix.length]; m.classList.remove("in"); void m.offsetWidth; m.textContent = x.t; bar.href = x.h; bar.querySelector(".hn-tk-r").textContent = x.h === "#/names" ? "去注册 ›" : x.h === "#/oracle" ? "去预测 ›" : "看榜 ›"; m.classList.add("in"); };
    show();
    clearInterval(ticker.t); ticker.t = setInterval(show, 5000);
  }

  // ---------- 荣耀榜页面 ----------
  var board = "total";
  function page(rid) {
    A.app.innerHTML = '<div id="hn-milbox" data-nb="1"></div><section class="card hn-hero"><h2>🏆 AiLGNS 荣耀榜</h2><p class="muted">感谢每一位为 AiLGNS 生态做出贡献的交易者 · 按 OTC 累计成交排名（链上真实成交）</p>' +
      '<div class="seg hn-seg" id="hn-seg"><button type="button" data-b="total">🏛 总榜</button><button type="button" data-b="month">🔥 本月榜</button></div><p class="hn-cd" id="hn-cd"></p><div id="hn-me"></div></section>' +
      '<div id="hn-out" data-nb="1"><section class="card"><p class="muted">读取中…</p></section></div>';
    var me = null, seg = document.getElementById("hn-seg");
    var paint = function () { seg.querySelectorAll("button").forEach(function (b) { b.className = b.getAttribute("data-b") === board ? "on" : ""; }); };
    paint();
    seg.onclick = function (e) { var b = e.target.closest("button[data-b]"); if (!b) return; board = b.getAttribute("data-b"); paint(); load().catch(fail); };
    var load = function () {
      return fetch("/api/rank?board=" + board + (me ? "&me=" + me : "")).then(function (r) { return r.json(); }).then(function (d) { if (A.isCurrent(rid)) render(d); });
    };
    var fail = function () { var o = document.getElementById("hn-out"); if (o) o.innerHTML = '<section class="card"><p class="muted">读取失败，请稍后再试</p></section>'; };
    load().catch(fail);
    var silent = A.wallets && A.wallets.silent ? A.wallets.silent().catch(function () { return null; }) : Promise.resolve(null);
    silent.then(function (a) { if (a) { me = String(a).toLowerCase(); load().catch(function () {}); } });

    function render(d) {
      var top = d.top || [], out = document.getElementById("hn-out"), box = document.getElementById("hn-me"), cd = document.getElementById("hn-cd");
      cd.innerHTML = board === "month" ? "📅 " + d.ym.replace("-", " 年 ") + " 月榜 · 距本月结束还有 <b>" + left(d.end - Date.now()) + "</b>，月底榜一永久刻进名人堂" : "🏛 从开站到现在的累计成交，前 50 名全站显示段位徽章";
      var html = "";
      if (!top.length) html = '<section class="card"><p class="muted">' + (board === "month" ? "本月还没有人上榜，现在成交一笔满 50 DAI，你就是本月榜一！" : "还没有成交") + "</p></section>";
      else {
        var podium = [1, 0, 2].filter(function (i) { return top[i]; }).map(function (i) {
          var x = top[i];
          return '<div class="hn-p hn-p' + (i + 1) + '"><span class="hn-medal">' + MEDAL[i] + '</span><b class="hn-pt">榜' + "一二三"[i] + " · " + TIER[i ? 1 : 0][1] + '</b><span class="hn-pa">' + A.nameTag(x.a) + '</span><b class="hn-pv">' + dai(x.vol) + "</b><small>" + x.n + " 笔</small></div>";
        }).join("");
        var rest = top.slice(3).map(function (x, i) {
          var r = i + 4;
          return '<li class="hn-r' + x.tier + '"><span class="hn-n">' + r + '</span><span class="hn-a">' + A.nameTag(x.a) + "</span>" + tierChip(x.tier) + "<b>" + dai(x.vol) + "</b></li>";
        }).join("");
        html = '<section class="card"><div class="hn-podium">' + podium + "</div>" + (rest ? '<ol class="hn-list">' + rest + "</ol>" : "") + "</section>";
      }
      // 名人堂
      var hof = d.hof || [], mil = d.mil || [];
      html += '<section class="card hn-hof"><div class="card-head"><h2>🏛 名人堂</h2><span class="muted">历届月榜前三 · 百万大户，永久留名</span></div>' +
        (hof.length ? hof.map(function (h) {
          return '<div class="hn-hy"><b>' + h.ym.replace("-", " 年 ") + ' 月</b><div>' + h.top.map(function (x, i) { return '<span class="hn-hm">' + MEDAL[i] + " " + A.nameTag(x.a) + " <small>" + dai(x.vol) + "</small></span>"; }).join("") + "</div></div>";
        }).join("") : '<p class="muted">第一届名人堂将在本月月底诞生，本月榜一、榜二、榜三的名字会永久刻在这里。</p>') + "</section>";
      // 段位规则
      html += '<section class="card hn-rules"><div class="card-head"><h2>📜 段位规则</h2></div><ul>' +
        "<li>" + TIER[0][0] + " <b>最强王者</b>：第 1 名</li><li>" + TIER[1][0] + " <b>荣耀王者</b>：第 2–3 名</li><li>" + TIER[2][0] + " <b>王者</b>：第 4–10 名</li><li>" + TIER[3][0] + " <b>星耀</b>：第 11–20 名</li><li>" + TIER[4][0] + " <b>钻石</b>：第 21–50 名</li></ul>" +
        '<p class="muted">按在本站 OTC（AiLGNS / LGNS / gLGNS / NFT 卡牌 / 域名）的累计成交排名，买和卖都算；<b>单笔满 50 DAI 才计入</b>（和会员卡上的「OTC 累计成交」同一个数）。总榜前 50 名的名字在全站显示段位徽章；本月榜每月 1 号清零，月底前三名进名人堂；<b>累计满 100 万 DAI 送👑至尊 VIP，永久进名人堂「百万俱乐部」</b>。</p></section>';
      out.innerHTML = html;
      // 名人堂 · 百万俱乐部：放在页面最顶上，人数从 0 开始挂出来，有人达到就展示
      var mb = document.getElementById("hn-milbox");
      if (mb) { mb.innerHTML = '<section class="card hn-milc"><div class="hn-mil-h"><b>👑 名人堂 · 百万俱乐部</b><span class="hn-mil-n">' + mil.length + ' <small>位</small></span></div>' +
        (mil.length ? '<div class="hn-mil-l">' + mil.map(function (x, i) { return '<span class="hn-hm">' + (i + 1) + '. 👑 至尊 VIP ' + A.nameTag(x.a) + " <small>" + dai(x.vol) + "</small></span>"; }).join("") + "</div>" : "") +
        '<p class="hn-mil-t">OTC 累计成交满 <b>100 万 DAI</b>，送👑<b>至尊 VIP</b>，名字永久刻在这里' + (mil.length ? "" : "。第一位百万大户虚位以待！") + "</p></section>"; if (mil.length) A.fillNames(mb); }

      // 我的名次：还差多少超过上一名、升下一个段位
      if (!me) {
        box.innerHTML = '<button type="button" class="nm-go" id="hn-c">连接钱包，看我排第几</button>';
        document.getElementById("hn-c").onclick = function () {
          A.wallets.choose().then(function (eth) { return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { me = String(a[0]).toLowerCase(); return load(); }, function (e) { A.errTip((e && e.message) || "钱包没连上", box); });
        };
        return;
      }
      var m = d.me || { rank: 0 }, nb = board === "month" ? "本月" : "总榜";
      var msg = m.rank === 1 ? "👑 你就是" + nb + "<b>最强王者</b>！已成交 " + dai(m.vol) + "，守住宝座！"
        : m.rank ? "你在" + nb + "排第 <b>" + m.rank + "</b> 名 " + tierChip(m.tier) + "（已成交 " + dai(m.vol) + "）<br>再成交 <b>" + dai(m.gap) + "</b> 就超过第 " + (m.rank - 1) + " 名" +
          (m.nextTier >= 0 && m.tierGap ? "；再成交 <b>" + dai(m.tierGap) + "</b> 升【" + TIER[m.nextTier][1] + "】" : "")
        : "你还没进" + nb + "前 50 名" + (m.vol ? "（已成交 " + dai(m.vol) + "）" : "") + "，再成交 <b>" + dai(m.tierGap || m.gap || 50) + "</b> 就能上榜成为【钻石】！";
      box.innerHTML = '<div class="hn-mine">' + msg + '</div><a class="nm-go nm-golink" href="#/otc">去 OTC 交易冲榜 →</a>';
    }
  }

  A.pages.rank = page;
})();
