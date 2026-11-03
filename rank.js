// OTC 成交排行榜（#/rank）：所有 OTC 市场累计成交额（DAI）排名，前三名「榜一大哥 / 榜二大哥 / 榜三大哥」领奖台，
// 连了钱包的显示自己第几名、离上一名还差多少 DAI；地址设了 .ailgns / .lgns 主名字的，scan.js 会自动换成名字
(function () {
  "use strict";

  var A = window.AIL;
  var TITLE = ["👑 榜一大哥", "🥈 榜二大哥", "🥉 榜三大哥"];

  function dai(v) { return Number(v).toLocaleString("en-US") + " DAI"; }

  function page(rid) {
    A.app.innerHTML = '<section class="card rk-hero"><h2>🏆 OTC 交易排行榜</h2><p class="muted">按累计成交额排名（所有 OTC 市场合并，链上真实成交）</p><div id="rk-me"></div></section><div id="rk-out"><section class="card"><p class="muted">读取中…</p></section></div>';
    var me = null;
    var load = function () {
      return fetch("/api/rank" + (me ? "?me=" + me : "")).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(rid)) return;
        render(d);
      });
    };
    var silent = A.wallets && A.wallets.silent ? A.wallets.silent().catch(function () { return null; }) : Promise.resolve(null);
    // 排行榜马上读，不等钱包；钱包认出来以后再读一次带上「我的排名」
    var fail = function () { var o = document.getElementById("rk-out"); if (o) o.innerHTML = '<section class="card"><p class="muted">读取失败，请稍后再试</p></section>'; };
    load().catch(fail);
    silent.then(function (a) { if (a) { me = String(a).toLowerCase(); load().catch(function () {}); } });

    function render(d) {
      var top = d.top || [], out = document.getElementById("rk-out"), box = document.getElementById("rk-me");
      if (!top.length) { out.innerHTML = '<section class="card"><p class="muted">还没有成交，第一个成交的就是榜一大哥！</p></section>'; return; }
      // 领奖台：二、一、三（中间最高）
      var podium = [1, 0, 2].filter(function (i) { return top[i]; }).map(function (i) {
        var x = top[i];
        return '<div class="rk-p rk-p' + (i + 1) + '"><b class="rk-t">' + TITLE[i] + '</b><span class="rk-a">' + A.short(x.a) + '</span><b class="rk-v">' + dai(x.vol) + '</b><small>' + x.n + " 笔</small></div>";
      }).join("");
      var rest = top.slice(3).map(function (x, i) {
        return '<li><span class="rk-n">' + (i + 4) + '</span><span class="rk-a">' + A.short(x.a) + '</span><b>' + dai(x.vol) + "</b></li>";
      }).join("");
      out.innerHTML = '<section class="card"><div class="rk-podium">' + podium + "</div>" + (rest ? '<ol class="rk-list">' + rest + "</ol>" : "") + "</section>";
      // 自己的名次：差多少超过上一名，直接给去交易的按钮
      if (!me) {
        box.innerHTML = '<button type="button" class="nm-go" id="rk-c">连接钱包，看我排第几</button>';
        document.getElementById("rk-c").onclick = function () {
          A.wallets.choose().then(function (eth) { return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { me = String(a[0]).toLowerCase(); return load(); }, function (e) { A.errTip((e && e.message) || "钱包没连上", box); });
        };
        return;
      }
      var m = d.me || { rank: 0 };
      box.innerHTML = '<div class="rk-mine">' + (m.rank === 1 ? "👑 你就是<b>榜一大哥</b>！累计 " + dai(m.vol) + "，守住宝座！"
        : m.rank ? "你排第 <b>" + m.rank + "</b> 名（累计 " + dai(m.vol) + "），再成交 <b>" + dai(m.gap) + "</b> 就超过第 " + (m.rank - 1) + " 名" + (m.rank <= 3 ? "，冲" + TITLE[m.rank - 2].slice(3) + "！" : m.rank === 4 ? "，登上领奖台！" : "")
        : "你还没上榜，成交一笔就能上榜") + '</div><a class="nm-go nm-golink" href="#/otc">去 OTC 交易 →</a>';
    }
  }

  A.pages.rank = page;
})();
