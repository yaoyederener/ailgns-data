// 🆕 更新日志页 #/updates：客户看最近上了什么；内容和客服机器人喂的「最近更新」是同一份（lib/updates.js）
(function () {
  "use strict";
  var A = window.AIL;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  A.pages.updates = function (id) {
    A.app.innerHTML = '<section class="card"><h2>🆕 更新日志</h2><p class="muted">网站每次上线的新功能和规则变化，新的在前。客服机器人也同步学习这份内容。</p><div id="up-list" class="lg-list">读取中…</div></section>';
    fetch("/api/updates").then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(id)) return;
      var el = document.getElementById("up-list"), list = d.list || [];
      el.innerHTML = list.length ? list.map(function (u) { var m = u.t.match(/^(\S+)\s/); return '<div class="lg-row"><span class="lg-ico">' + (m ? m[1] : "✨") + '</span><div class="lg-main"><div class="lg-txt">' + esc(m ? u.t.slice(m[0].length) : u.t) + '</div><small>' + esc(u.d) + "</small></div></div>"; }).join("") : '<p class="muted">暂无</p>';
    }).catch(function () { var el = document.getElementById("up-list"); if (el) el.textContent = "读取失败"; });
  };
})();
