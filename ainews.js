// 🤖 AI 资讯（#/ainews，站长 2026-11-25：「做一个滚动的 AI 资讯板块，专门轮播 AI 资讯，放更多栏目里，不放 OTC 首页」）
//   · 最上面一张轮播卡：每 5 秒换一条最新的标题（手指按着时不换）；下面是完整列表，新的在前
//   · 只有标题 + 来源 + 时间，正文不搬。数据来自 /api/ainews（每小时抓一次，秒开）
//   · 站长 2026-11-26：「只展示标题，不跳转，不看细节，看个标题就行」→ 点了没反应（不再链到原文），英文原标题那一行也去掉；
//     中文页面只列已经翻成中文的（没翻好的那条不显示，免得混进一条看不懂的英文）；英文 / 韩文页面显示英文原标题
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
  function zh() { return !window.AIL_LANG || window.AIL_LANG === "zh"; }
  function title(x) { return zh() ? x.t : (x.o || x.t); } // 英 / 韩页面：用英文原标题（没有就是本来就是英文的那条）
  function usable(x) { return !!x && !!x.t && (!zh() || /[\u4e00-\u9fff]/.test(x.t)); } // 中文页面：标题里没有中文 = 没翻好，不显示
  function showTop(list) {
    var el = document.getElementById("ainw-top"); if (!el || !list.length) return;
    var x = list[idx % list.length];
    el.innerHTML = '<div class="ainw-hot"><span class="ainw-tag">' + T("最新") + " " + (idx % list.length + 1) + "/" + list.length + '</span><b>' + esc(title(x)) + '</b><i>' + esc(x.s) + " · " + ago(x.ts) + "</i></div>";
  }
  function draw(d) {
    var box = document.getElementById("ainw-list"); if (!box) return;
    var list = ((d && d.list) || []).filter(usable);
    if (!list.length) { box.innerHTML = '<p class="muted">' + T("暂时没有读到资讯，过一会儿再来看。") + "</p>"; return; }
    var hot = list.slice(0, 10);
    idx = 0; showTop(hot);
    clearInterval(timer);
    timer = setInterval(function () { if (!document.getElementById("ainw-top")) { clearInterval(timer); return; } if (hold || document.hidden) return; idx++; showTop(hot); }, 5000);
    box.innerHTML = list.map(function (x) {
      return '<div class="ainw-it"><b>' + esc(title(x)) + "</b><i>" + esc(x.s) + " · " + ago(x.ts) + "</i></div>";
    }).join("");
    var at = document.getElementById("ainw-at"); if (at && d.at) at.textContent = T("更新于") + " " + ago(d.at);
  }
  A.pages.ainews = function (id) {
    clearInterval(timer);
    A.app.innerHTML = '<section class="card ainw"><h2>🤖 AI 资讯</h2>' +
      '<p class="muted">每小时自动更新一次，只看标题就行。 <span id="ainw-at"></span></p>' +
      '<div id="ainw-top" class="ainw-top"></div>' +
      '<div id="ainw-list" class="ainw-list"><p class="muted">加载中…</p></div>' +
      '<p class="muted ainw-foot">资讯标题来自国外第三方媒体，中文标题是机器翻译的，可能不准。不代表本站观点，不构成投资建议。</p></section>';
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
