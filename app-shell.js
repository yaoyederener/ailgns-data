// App 永久入口壳页的脚本（CSP 不允许内联脚本，所以单独一个文件；sw.js 也会把它缓存起来离线用）
(function () {
  "use strict";
  var FALLBACK = ["ailgns.dev", "ailgnsotc.com", "ailgnsotc.net", "ailgnsotc.org", "ailgnsotc.cc", "ailgnsotc.xyz", "ailgns-data.pages.dev"];
  var list = [], status = {}, best = "", timer = null;
  function $(id) { return document.getElementById(id); }
  function toast(t) { var el = $("toast"); el.textContent = t; el.style.opacity = 1; setTimeout(function () { el.style.opacity = 0; }, 1600); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load() {
    try { var c = JSON.parse(localStorage.getItem("doms") || "null"); if (c && c.length) list = c; } catch (e) {}
    if (!list.length) list = FALLBACK.map(function (h, i) { return { h: h, main: i === 0 }; });
    paint(); check();
    // 从任意一个能通的网址拉最新网址池（新域名不用更新 App）
    (function pull(i) {
      if (i >= list.length) return;
      fetchT("https://" + list[i].h + "/api/domains", 5000).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.list && j.list.length) { list = j.list; try { localStorage.setItem("doms", JSON.stringify(list)); } catch (e) {} paint(); check(); }
      }).catch(function () { pull(i + 1); });
    })(0);
  }
  function fetchT(url, ms) { var ac = window.AbortController ? new AbortController() : null; var t = setTimeout(function () { ac && ac.abort(); }, ms); return fetch(url, { signal: ac && ac.signal, cache: "no-store" }).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; }); }
  function check() {
    var started = Date.now();
    list.forEach(function (d) {
      status[d.h] = "wait"; paint();
      fetchT("https://" + d.h + "/api/domains", 6000).then(function (r) { status[d.h] = r.ok ? "ok" : "bad"; }, function () { status[d.h] = "bad"; }).then(function () { paint(); pick(); });
    });
    $("st").textContent = "检测中…";
  }
  function pick() {
    var oks = list.filter(function (d) { return status[d.h] === "ok"; });
    if (!oks.length) { if (list.every(function (d) { return status[d.h] === "bad"; })) { $("st").textContent = "都打不开？看下面联系方式"; $("go").textContent = "网站暂时都打不开，请到群里拿新网址"; $("go").href = "#"; } return; }
    best = (oks.filter(function (d) { return d.main; })[0] || oks[0]).h;
    $("st").textContent = oks.length + " 个可用";
    $("go").textContent = "打开 " + best + " →"; $("go").href = "https://" + best + "/#/otc";
    wallets();
    // 轮动：可用的网址轮流高亮，提醒客户「不止一个」
    clearInterval(timer); var k = 0;
    timer = setInterval(function () { var rows = document.querySelectorAll(".dom.ok"); if (!rows.length) return; rows.forEach(function (r) { r.classList.remove("hot"); }); rows[k % rows.length].classList.add("hot"); k++; }, 1800);
  }
  function paint() {
    $("doms").innerHTML = list.map(function (d) {
      var s = status[d.h] || "wait";
      return '<div class="dom ' + s + '" data-h="' + esc(d.h) + '"><span class="dot"></span><span class="h">' + esc(d.h) + (d.main ? '<span class="tag">主网址</span>' : "") + (d.note ? "<small>" + esc(d.note) + "</small>" : "") + "</span>" +
        '<button type="button" data-cp="' + esc(d.h) + '">复制网址</button></div>';
    }).join("");
    $("doms").querySelectorAll("[data-cp]").forEach(function (b) { b.onclick = function () { var u = "https://" + b.getAttribute("data-cp") + "/"; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("已复制 " + u); }, function () { prompt("复制这个网址", u); }); }; });
  }
  function wallets() {
    var url = "https://" + best + "/#/otc", bare = url.replace(/^https?:\/\//, "");
    var apps = [["OKX 钱包", "okx://wallet/dapp/url?dappUrl=" + encodeURIComponent(url)], ["Bitget 钱包", "bitkeep://bkconnect?action=dapp&url=" + encodeURIComponent(url)], ["TokenPocket", "tpdapp://open?params=" + encodeURIComponent(JSON.stringify({ url: url }))], ["imToken", "imtokenv2://navigate/DappView?url=" + encodeURIComponent(url)], ["MetaMask", "https://metamask.app.link/dapp/" + bare], ["Trust 钱包", "https://link.trustwallet.com/open_url?coin_id=60&url=" + encodeURIComponent(url)]];
    $("wl").innerHTML = apps.map(function (a) { return '<a href="' + a[1] + '">' + a[0] + "</a>"; }).join("");
    $("full").href = "https://" + best + "/#/otc?full=1";
    fetchT("https://" + best + "/api/updates", 6000).then(function (r) { return r.json(); }).then(function (j) {
      var l = (j.list || []).slice(0, 6); if (!l.length) return;
      try { localStorage.setItem("ups", JSON.stringify(l)); } catch (e) {}
      $("ups").innerHTML = l.map(function (u) { return '<div class="up">' + esc(u.t) + "<br><small>" + esc(u.d) + "</small></div>"; }).join("");
    }).catch(function () {});
  }
  try { var cu = JSON.parse(localStorage.getItem("ups") || "null"); if (cu && cu.length) $("ups").innerHTML = cu.map(function (u) { return '<div class="up">' + esc(u.t) + "<br><small>" + esc(u.d) + "</small></div>"; }).join(""); } catch (e) {}
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function () {});
  load();
})();
