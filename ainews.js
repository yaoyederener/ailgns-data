// 🤖 AI 资讯（#/ainews，站长 2026-11-25：「做一个滚动的 AI 资讯板块，专门轮播 AI 资讯，放更多栏目里，不放 OTC 首页」）
//   · 最上面一张轮播卡：每 5 秒换一条最新的标题（手指按着时不换）；下面是完整列表，新的在前
//   · 只有标题 + 来源 + 时间，点了去原文（新窗口）。正文不搬。数据来自 /api/ainews（每小时抓一次，秒开）
//   · 内容是别人写的：页面底下写明「来自第三方，不代表本站观点，不构成投资建议」
(function () {
  "use strict";
  var A = window.AIL, LS = "ainews:c", timer = 0, idx = 0, hold = false;
  function T(s) { try { return window.AIL_LANG_T ? window.AIL_LANG_T(s) : s; } catch (e) { return s; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ago(ts) {
    var m = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (m < 60) return m + " " + T("分钟前");
    if (m < 1440) return Math.round(m / 60) + " " + T("小时前");
    return Math.round(m / 1440) + " " + T("天前");
  }
  function safeUrl(u) { return /^https:\/\//.test(u) ? u : "#"; }
  function showTop(list) {
    var el = document.getElementById("ainw-top"); if (!el || !list.length) return;
    var x = list[idx % list.length];
    el.innerHTML = '<a class="ainw-hot" href="' + esc(safeUrl(x.u)) + '" target="_blank" rel="noopener noreferrer"><span class="ainw-tag">' + T("最新") + " " + (idx % list.length + 1) + "/" + list.length + '</span><b>' + esc(x.t) + '</b><i>' + esc(x.s) + " · " + ago(x.ts) + "</i></a>";
  }
  function draw(d) {
    var box = document.getElementById("ainw-list"); if (!box) return;
    var list = (d && d.list) || [];
    if (!list.length) { box.innerHTML = '<p class="muted">' + T("暂时没有读到资讯，过一会儿再来看。") + "</p>"; return; }
    var hot = list.slice(0, 10);
    idx = 0; showTop(hot);
    clearInterval(timer);
    timer = setInterval(function () { if (!document.getElementById("ainw-top")) { clearInterval(timer); return; } if (hold || document.hidden) return; idx++; showTop(hot); }, 5000);
    box.innerHTML = list.map(function (x) {
      return '<a class="ainw-it" href="' + esc(safeUrl(x.u)) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(x.t) + "</b>" + (x.o ? '<em>' + esc(x.o) + "</em>" : "") + "<i>" + esc(x.s) + " · " + ago(x.ts) + "</i></a>";
    }).join("");
    var at = document.getElementById("ainw-at"); if (at && d.at) at.textContent = T("更新于") + " " + ago(d.at);
  }
  A.pages.ainews = function (id) {
    clearInterval(timer);
    A.app.innerHTML = '<section class="card ainw"><h2>🤖 AI 资讯</h2>' +
      '<p class="muted">每小时自动更新一次。点标题去原文看。 <span id="ainw-at"></span></p>' +
      '<div id="ainw-top" class="ainw-top"></div>' +
      '<div id="ainw-list" class="ainw-list"><p class="muted">加载中…</p></div>' +
      '<p class="muted ainw-foot">资讯标题来自第三方媒体，英文标题由机器翻译，可能不准，以原文为准。不代表本站观点，不构成投资建议。</p></section>';
    var top = document.getElementById("ainw-top");
    if (top) { top.addEventListener("touchstart", function () { hold = true; }, { passive: true }); top.addEventListener("touchend", function () { hold = false; }, { passive: true }); top.addEventListener("mouseenter", function () { hold = true; }); top.addEventListener("mouseleave", function () { hold = false; }); }
    hold = false;
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) {}
    if (cached && cached.list) draw(cached);
    fetch("/api/ainews").then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(id)) return;
      if (d && d.list && d.list.length) { draw(d); try { localStorage.setItem(LS, JSON.stringify({ at: d.at, list: d.list.slice(0, 40) })); } catch (e) {} }
      else if (!cached) draw(d);
    }).catch(function () { if (A.isCurrent(id) && !cached) draw(null); });
  };
})();
