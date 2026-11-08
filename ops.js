// 🛠️ 网站优化页 #/ops（内部，和工单后台同一个口令）：当前风险 → 最坏情况与防护 → 安全维护清单 → 待优化 → 站长定的方案
(function () {
  var A = window.AIL;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function tm(t) { var x = new Date(t + 8 * 3600e3); return (x.getUTCMonth() + 1) + "/" + x.getUTCDate() + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); }
  var LV = { red: "🔴", yellow: "🟡", green: "🟢" };
  function login(rid, msg) {
    A.app.innerHTML = '<section class="card ptn-login"><h2>🛠️ 网站优化</h2><p class="muted">和工单后台同一个口令。</p>' + (msg ? '<p class="nm-bad">' + esc(msg) + "</p>" : "") +
      '<input id="ops-k" type="password" placeholder="口令" autocomplete="current-password"><button type="button" class="nm-go" id="ops-go">进入</button></section>';
    var go = document.getElementById("ops-go"), inp = document.getElementById("ops-k");
    go.onclick = function () { var v = inp.value.trim(); if (!v) return; try { localStorage.setItem("fbKey", v); } catch (e) {} load(rid); };
    inp.onkeydown = function (e) { if (e.key === "Enter") go.click(); };
  }
  function nav(cur) {
    return '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb">📮 工单</a><a href="#/partner" class="ad-nb">📊 数据面板</a><a href="#/ops" class="ad-nb on">🛠️ 网站优化</a><a href="#/med" class="ad-nb">💊 吃药</a></div>';
  }
  function li(items, f) { return '<ul class="ops-ul">' + items.map(f).join("") + "</ul>"; }
  function render(rid, j) {
    var h = '<section class="card ops"><div class="card-head"><h2>🛠️ 网站优化</h2><span class="muted">内容更新于 ' + esc(j.updated) + "</span></div>" + nav("ops") +
      '<nav class="ops-toc"><a href="javascript:void 0" data-ops-to="ops-now">当前风险</a><a href="javascript:void 0" data-ops-to="ops-worst">最坏情况</a><a href="javascript:void 0" data-ops-to="ops-sec">安全维护</a><a href="javascript:void 0" data-ops-to="ops-todo">待优化</a><a href="javascript:void 0" data-ops-to="ops-dec">定的方案</a><a href="javascript:void 0" data-ops-to="ops-learn">学习清单</a></nav>' +
      // 当前风险
      '<h3 class="ad-h" id="ops-now">🚦 当前风险（合伙人面板算的' + (j.risksAt ? "，" + tm(j.risksAt) : "") + '）</h3><div class="ptn-risks">' + (j.risks || []).map(function (r) {
        return '<div class="ptn-risk ' + r.level + '"><div class="ptn-rh">' + LV[r.level] + " <b>" + esc(r.title) + '</b><i>' + esc(r.who) + "</i></div><p>" + esc(r.why) + '</p><p class="ptn-todo">👉 ' + esc(r.todo) + "</p></div>";
      }).join("") + "</div>" +
      // 最坏情况
      '<h3 class="ad-h" id="ops-worst">☠️ 最坏情况与防护（按损失从大到小）</h3>' + li(j.worst, function (w) { return "<li><b>" + esc(w.t) + '</b><div class="ops-k">会丢什么</div><p>' + esc(w.lose) + '</p><div class="ops-k">怎么防</div><p>' + esc(w.guard) + "</p></li>"; }) +
      // 安全维护
      '<h3 class="ad-h" id="ops-sec">🔐 网站怎么维护保证安全</h3><h4 class="ops-h4">每天</h4>' + li(j.security.daily, function (x) { return "<li><b>" + esc(x.t) + "</b><p>" + esc(x.d) + "</p></li>"; }) +
      '<h4 class="ops-h4">每周</h4>' + li(j.security.weekly, function (x) { return "<li><b>" + esc(x.t) + "</b><p>" + esc(x.d) + "</p></li>"; }) +
      '<h4 class="ops-h4">永远不做</h4>' + li(j.security.never, function (x) { return "<li><b>" + esc(x.t) + "</b><p>" + esc(x.d) + "</p></li>"; }) +
      // 待优化
      '<h3 class="ad-h" id="ops-todo">🧭 还有哪些需要优化</h3>' + li(j.todo, function (x) { return '<li class="' + (x.done ? "done" : "") + '"><b>' + (x.done ? "✅ " : "") + esc(x.t) + '</b><span class="ops-pri">' + esc(x.pri) + "</span><p>" + esc(x.d) + "</p></li>"; }) +
      // 定的方案
      '<h3 class="ad-h" id="ops-dec">📜 你定的方案（新的在前）</h3>' + li(j.decisions, function (x) { return '<li><span class="muted">' + esc(x.d) + "</span> " + esc(x.t) + "</li>"; }) +
      '<h3 class="ad-h" id="ops-learn">📚 学习清单（小白站长 + AI 开发，你要掌握什么）</h3>' + li(j.learn || [], function (x) { return "<li><b>" + esc(x.t) + '</b><div class="ops-k">为什么</div><p>' + esc(x.why) + '</p><div class="ops-k">怎么练</div><p>' + esc(x.how) + "</p></li>"; }) +
      '<p class="muted ptn-note">这页的内容由开发维护：每次你定了新规矩、每做完一件事都会同步到这里。要改内容告诉开发。</p></section>';
    A.app.innerHTML = h;
    // 站长 2026-11-08：目录点了只在本页滚动（以前用 #ops-xx 锚点，被网站路由当成新页面跳回首页）
    A.app.querySelectorAll("[data-ops-to]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); var t = document.getElementById(a.getAttribute("data-ops-to")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }; });
  }
  function load(rid) {
    var k = key(); if (!k) return login(rid);
    A.app.innerHTML = '<section class="card"><p class="muted">读取中…</p></section>';
    fetch("/api/ops?key=" + encodeURIComponent(k)).then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      if (j.error) { if (/口令/.test(j.error)) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, j.error); } A.app.innerHTML = '<section class="card"><p class="nm-bad">' + esc(j.error) + "</p></section>"; return; }
      render(rid, j);
    }, function (e) { if (A.isCurrent(rid)) A.app.innerHTML = '<section class="card"><p class="nm-bad">读取失败：' + esc(e.message || e) + "</p></section>"; });
  }
  A.pages.ops = function (rid) { load(rid); };
})();
