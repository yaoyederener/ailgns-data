// 📋 全站订单（内部页 #/orders，不进菜单）：站长一眼看所有客户在挂的单、域名挂单、最近成交。地址自动换成域名
(function () {
  "use strict";
  var A = window.AIL;
  var MK = { ailgns: { sym: "AiLGNS", dec: 18, chain: "Anubis" }, lgns: { sym: "LGNS", dec: 9, chain: "Anubis" }, glgns: { sym: "gLGNS", dec: 18, chain: "Anubis" }, plgns: { sym: "LGNS", dec: 9, chain: "Polygon" } };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var big = function (x, dec) { var b = BigInt(x); return dec >= 6 ? Number(b / BigInt(10) ** BigInt(dec - 6)) / 1e6 : Number(b) / Math.pow(10, dec); };
  var fmt = function (v, d) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 2 : d }); };
  var leftT = function (sec) { if (sec <= 0) return "已到期"; var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? d + " 天 " + h + " 时" : h ? h + " 时 " + m + " 分" : m + " 分"; };
  var who = function (a) { return '<a href="#/scan/' + a + '" data-a="' + a + '" class="mono">' + A.short(a) + "</a>"; };
  function bj(ts) { var d = new Date(ts * 1000 + 8 * 3600e3); return (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
  function market(k) {
    var m = MK[k];
    return fetch("/api/book?m=" + k).then(function (r) { return r.json(); }).then(function (d) {
      var w = (d.orders || "0x").slice(2).match(/.{64}/g) || [], n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0, from = Number(d.from || 0), now = Date.now() / 1000, rows = [];
      for (var i = 0; i < n; i++) {
        var o = w.slice(2 + i * 7, 9 + i * 7); if (o.length < 7) break;
        var maker = "0x" + o[0].slice(24), sell = o[1].slice(-1) === "1", open = o[2].slice(-1) === "1", exp = Number(BigInt("0x" + o[3])), gT = BigInt("0x" + o[4]), wT = BigInt("0x" + o[5]), gL = BigInt("0x" + o[6]);
        if (!open || exp <= now || gL === 0n || gT === 0n) continue;
        var coin = sell ? big(gL, m.dec) : (wT > 0n ? big(gL * wT / gT, m.dec) : 0), dai = sell ? big(gL * wT / gT, 18) : big(gL, 18);
        rows.push({ k: k, id: from + i, maker: maker, sell: sell, px: coin ? dai / coin : 0, coin: coin, dai: dai, exp: exp });
      }
      return rows;
    }).catch(function () { return []; });
  }
  A.pages.orders = function (id) {
    A.app.innerHTML = '<section class="card"><div class="card-head"><h2>📋 全站订单 <small class="muted">内部</small></h2><span class="muted" id="od-sum">读取中…</span></div>' +
      '<div class="od-tabs" id="od-tabs">' + Object.keys(MK).map(function (k, i) { return '<button type="button" data-k="' + k + '"' + (i ? "" : ' class="on"') + ">" + MK[k].sym + (MK[k].chain === "Polygon" ? " · Polygon" : "") + "</button>"; }).join("") + '<button type="button" data-k="names">域名挂单</button><button type="button" data-k="fills">最近成交</button></div>' +
      '<div id="od-body">读取中…</div></section>';
    var cache = {}, cur = "ailgns";
    function show(k) {
      cur = k; var body = document.getElementById("od-body"); if (!body) return;
      document.querySelectorAll("#od-tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-k") === k); });
      body.innerHTML = "读取中…";
      var p = k === "names" ? fetch("/api/name-market").then(function (r) { return r.json(); }).then(function (d) { return { names: d.list || [] }; })
        : k === "fills" ? fetch("/api/fills?m=ailgns").then(function (r) { return r.json(); }).then(function (d) { return { fills: d.list || [] }; })
        : market(k).then(function (rows) { return { rows: rows }; });
      p.then(function (d) {
        if (!A.isCurrent(id) || cur !== k) return;
        var now = Date.now() / 1000, html;
        if (d.rows) {
          var rows = d.rows.sort(function (a, b) { return a.sell - b.sell || (a.sell ? a.px - b.px : b.px - a.px); }), byMaker = {};
          rows.forEach(function (r) { (byMaker[r.maker] = byMaker[r.maker] || []).push(r); });
          var makers = Object.keys(byMaker).sort(function (a, b) { return byMaker[b].reduce(function (s, r) { return s + r.dai; }, 0) - byMaker[a].reduce(function (s, r) { return s + r.dai; }, 0); });
          html = '<p class="muted">' + rows.length + " 张在挂 · " + makers.length + " 个挂单人 · 买单 " + rows.filter(function (r) { return !r.sell; }).length + " / 卖单 " + rows.filter(function (r) { return r.sell; }).length + " · 总额 " + fmt(rows.reduce(function (s, r) { return s + r.dai; }, 0), 0) + " DAI</p>" +
            makers.map(function (mk) {
              var L = byMaker[mk], tot = L.reduce(function (s, r) { return s + r.dai; }, 0);
              return '<div class="od-maker"><div class="od-mh">' + who(mk) + ' <small class="muted">' + L.length + " 张 · " + fmt(tot, 0) + " DAI</small></div>" + L.map(function (r) {
                return '<div class="od-row ' + (r.sell ? "ask" : "bid") + '"><span>' + (r.sell ? "卖出" : "买入") + "</span><span>" + fmt(r.px, 3) + "</span><span>" + fmt(r.coin, 4) + " " + MK[r.k].sym + "</span><span>" + fmt(r.dai, 0) + " DAI</span><span>#" + r.id + "</span><span>" + leftT(r.exp - now) + "</span></div>";
              }).join("") + "</div>";
            }).join("");
        } else if (d.names) {
          html = '<p class="muted">' + d.names.length + " 个域名在卖</p>" + d.names.map(function (x) { var p = big(x.price, 18); return '<div class="od-row"><span>🏷</span><span><a href="#/names/' + encodeURIComponent(x.label + "." + x.t) + '">' + esc(x.label + "." + x.t) + "</a></span><span>" + fmt(p, 0) + " DAI</span><span>" + who(x.maker) + "</span><span>#" + x.id + "</span><span>" + leftT(x.expiry - now) + "</span></div>"; }).join("");
        } else {
          html = '<p class="muted">AiLGNS OTC 最近 ' + d.fills.length + " 笔成交（北京时间）</p>" + d.fills.map(function (x) { return '<div class="od-row"><span>' + bj(x.t) + "</span><span>" + fmt(x.px, 3) + "</span><span>" + fmt(x.dai / x.px, 4) + " AiLGNS</span><span>" + fmt(x.dai, 2) + " DAI</span><span>#" + x.id + '</span><span><a href="#/scan/' + x.tx + '">详情</a></span></div>'; }).join("");
        }
        body.innerHTML = html || '<p class="muted">暂无</p>';
        if (A.fillNames) A.fillNames(body);
      });
    }
    document.getElementById("od-tabs").onclick = function (e) { var b = e.target.closest("button[data-k]"); if (b) show(b.getAttribute("data-k")); };
    Promise.all(Object.keys(MK).map(market)).then(function (all) { var n = all.reduce(function (s, r) { return s + r.length; }, 0), el = document.getElementById("od-sum"); if (el) el.textContent = "四个市场共 " + n + " 张在挂"; });
    show("ailgns");
  };
})();
