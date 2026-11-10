// App 壳页脚本（CSP 不允许内联脚本）。三件事：找到能用的网址、一键进钱包、一句话问客服
(function () {
  "use strict";
  var FALLBACK = ["ailgns.dev", "ailgnsotc.com", "ailgnsotc.net", "ailgnsotc.org", "ailgnsotc.cc", "ailgnsotc.xyz", "ailgns-data.pages.dev"];
  var WALLETS = [["OKX", "okx", function (u) { return "okx://wallet/dapp/url?dappUrl=" + encodeURIComponent(u); }], ["Bitget", "bitget", function (u) { return "bitkeep://bkconnect?action=dapp&url=" + encodeURIComponent(u); }], ["TokenPocket", "tokenpocket", function (u) { return "tpdapp://open?params=" + encodeURIComponent(JSON.stringify({ url: u })); }], ["imToken", "imtoken", function (u) { return "imtokenv2://navigate/DappView?url=" + encodeURIComponent(u); }], ["MetaMask", "metamask", function (u) { return "https://metamask.app.link/dapp/" + u.replace(/^https?:\/\//, ""); }]];
  var list = [], status = {}, best = "", timer = null;
  function $(id) { return document.getElementById(id); }
  function toast(t) { var el = $("toast"); el.textContent = t; el.style.opacity = 1; setTimeout(function () { el.style.opacity = 0; }, 1600); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fetchT(url, ms) { var ac = window.AbortController ? new AbortController() : null; var t = setTimeout(function () { ac && ac.abort(); }, ms); return fetch(url, { signal: ac && ac.signal, cache: "no-store" }).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; }); }
  var h = new Date().getHours(); $("hi").textContent = h < 5 ? "夜猫子" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  function load() {
    try { var c = JSON.parse(localStorage.getItem("doms") || "null"); if (c && c.length) list = c; } catch (e) {}
    if (!list.length) list = FALLBACK.map(function (x, i) { return { h: x, main: i === 0 }; });
    paint(); check(); walletsPaint();
    // 📈 装机统计：从桌面图标打开的，每天记一次「桌面打开」(a1)，这台手机第一次记「新装」(an)。主站以前记这个，现在桌面打开直接进壳页，所以搬到这里
    try {
      var sa = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone, today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
      var hit = function (e) { try { navigator.sendBeacon("/api/hit?e=" + e); } catch (x) {} };
      if (sa) { if (localStorage.getItem("st:a1") !== today) { localStorage.setItem("st:a1", today); hit("a1"); } if (!localStorage.getItem("st:app")) { localStorage.setItem("st:app", today); hit("an"); } }
    } catch (e) {}
    (function pull(i) {
      if (i >= list.length) return;
      fetchT("https://" + list[i].h + "/api/domains", 5000).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.list && j.list.length) { list = j.list; try { localStorage.setItem("doms", JSON.stringify(list)); } catch (e) {} paint(); check(); }
      }).catch(function () { pull(i + 1); });
    })(0);
  }
  var ms = {}; // 每个网址实测耗时（毫秒）：站长 2026-11-10，香港中转上线后按最快的排，大陆客户自动走 ailgnsotc.cc
  function check() {
    list.forEach(function (d) {
      status[d.h] = "wait"; paint();
      var t0 = Date.now();
      fetchT("https://" + d.h + "/api/domains", 6000).then(function (r) { status[d.h] = r.ok ? "ok" : "bad"; ms[d.h] = Date.now() - t0; }, function () { status[d.h] = "bad"; ms[d.h] = 99999; }).then(function () { paint(); pick(); });
    });
  }
  function pick() {
    var oks = list.filter(function (d) { return status[d.h] === "ok"; }), st = $("st");
    if (!oks.length) { if (list.every(function (d) { return status[d.h] === "bad"; })) { st.className = "st bad"; st.lastElementChild.textContent = "网站都打不开，看下面群二维码"; } return; }
    // 谁最快用谁（相差不到 150 毫秒时主站优先，免得来回跳）
    var sorted = oks.slice().sort(function (a, b) { return (ms[a.h] || 99999) - (ms[b.h] || 99999); }), mainOk = oks.filter(function (d) { return d.main; })[0];
    best = (mainOk && (ms[mainOk.h] || 99999) - (ms[sorted[0].h] || 99999) < 150 ? mainOk : sorted[0]).h;
    st.className = "st ok"; st.lastElementChild.textContent = best + " 可用" + (ms[best] && ms[best] < 99999 ? "（" + ms[best] + " 毫秒，最快）" : "");
    $("full").href = "https://" + best + "/#/otc?full=1"; var es = $("enter-sub"); if (es) es.textContent = "现在能用：" + best; paint();
    walletsPaint();
    clearInterval(timer); var k = 0;
    timer = setInterval(function () { var rows = document.querySelectorAll(".dom.ok"); if (!rows.length) return; rows.forEach(function (r) { r.classList.remove("hot"); }); rows[k % rows.length].classList.add("hot"); k++; }, 1800);
  }
  function paint() {
    // 发布页风格：每个网址就是一个大按钮，整行可点直接进；最佳网址标「推荐」；复制按钮保留给要转发的人
    $("doms").innerHTML = list.map(function (d) {
      var s = status[d.h] || "wait", isBest = best && d.h === best;
      // 站长 2026-11-09：网址只展示 + 复制，不跳转（客户复制到钱包浏览器里打开）
      return '<div class="dom ' + s + (isBest ? " best" : "") + '"><i></i><span class="h">' + esc(d.h) + "</span>" + (isBest ? '<span class="tag">✅ 推荐</span>' : d.main ? '<span class="tag" style="color:#5a35d6;background:#efe9ff">主网址</span>' : "") + '<button type="button" data-cp="' + esc(d.h) + '">复制</button></div>';
    }).join("");
    $("doms").querySelectorAll("[data-cp]").forEach(function (b) { b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); var u = "https://" + b.getAttribute("data-cp") + "/"; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("已复制 " + u); }, function () { prompt("复制这个网址", u); }); }; });
  }
  function walletsPaint() {
    var url = "https://" + (best || list[0].h) + "/#/otc";
    var go = $("full"); if (go) go.href = "https://" + (best || list[0].h) + "/#/otc?full=1"; // 大按钮也跟着能打开的网址走
    $("wl").innerHTML = WALLETS.map(function (w) { return '<a href="' + w[2](url) + '"><img src="/icons/wallets/' + w[1] + '.png?v=1" alt=""><span>' + w[0] + "</span></a>"; }).join("");
  }
  // 问客服：带着问题跳到网站客服窗口（钱包浏览器里能连钱包；这里只是壳，所以跳主站）
  $("ask").onsubmit = function (e) {
    e.preventDefault();
    var q = $("q").value.trim(), host = best || list[0].h;
    location.href = "https://" + host + "/?full=1&chat=" + encodeURIComponent(q || "你好") + "#/otc";
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
    // 新版 Service Worker 接管了（刚更新完）：刷新一次拿新壳页（每次打开最多一次）
    navigator.serviceWorker.addEventListener("controllerchange", function () { try { if (sessionStorage.getItem("shell:rl")) return; sessionStorage.setItem("shell:rl", "1"); } catch (e) {} location.reload(); });
  }
  // 🔄 自检新版本（站长 2026-11-09：手机一直卡旧壳页）：悄悄拉一次最新 /app，版本号不一样就自动刷新（每次打开最多一次）
  (function () {
    var cur = (document.querySelector('meta[name="shell-ver"]') || {}).content || "";
    fetchT("/app?chk=" + Date.now(), 8000).then(function (r) { return r.ok ? r.text() : ""; }).then(function (html) {
      var m = html.match(/name="shell-ver" content="(\d+)"/);
      if (m && cur && m[1] !== cur) { try { if (sessionStorage.getItem("shell:rl")) return; sessionStorage.setItem("shell:rl", "1"); } catch (e) {} location.reload(); }
    }).catch(function () {});
  })();
  load();
})();
