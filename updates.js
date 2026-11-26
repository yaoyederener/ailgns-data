// 🆕 更新日志 #/updates：2026-11-26 起是后台页，只有站长口令能看（站长：「更新日志放在后台，前台不要展示，骗子在模仿我们」）。
// 内容和客服机器人喂的「最近更新」是同一份（lib/updates.js）。前台菜单入口已撤掉。
(function () {
  "use strict";
  var A = window.AIL;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  var NAV = '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb">📮 工单</a><a href="#/videos/admin" class="ad-nb">🎬 上传视频</a><a href="#/partner" class="ad-nb">📊 数据面板</a><a href="#/notify" class="ad-nb">📣 发站内信</a><a href="#/todo" class="ad-nb">📝 待办</a><a href="#/updates" class="ad-nb on">🆕 更新日志</a><a href="#/med" class="ad-nb">💊 吃药</a></div>';
  function login(id, msg) {
    A.app.innerHTML = '<section class="card ptn-login"><h2>🆕 更新日志（内部）</h2><p class="muted">这一页只有内部能看。输入工单后台的口令（同一个）。</p>' + (msg ? '<p class="nm-bad">' + esc(msg) + "</p>" : "") +
      '<input id="up-k" type="password" placeholder="口令" autocomplete="current-password"><button type="button" class="nm-go" id="up-go">进入</button></section>';
    var go = document.getElementById("up-go"), inp = document.getElementById("up-k");
    go.onclick = function () { var v = inp.value.trim(); if (!v) return; try { localStorage.setItem("fbKey", v); } catch (e) {} page(id); };
    inp.onkeydown = function (e) { if (e.key === "Enter") go.click(); };
  }
  function page(id) {
    var k = key(); if (!k) return login(id);
    A.app.innerHTML = '<section class="card"><h2>🆕 更新日志（内部）</h2>' + NAV + '<p class="muted">网站每次上线的新功能和规则变化，新的在前。只有内部能看，客户看不到这一页。</p><div id="up-list" class="lg-list">读取中…</div></section>';
    fetch("/api/updates", { headers: { "x-key": k } }).then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(id)) return;
      if (d.error) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(id, "口令失效或不对，请重新输入"); }
      var el = document.getElementById("up-list"), list = d.list || [];
      el.innerHTML = list.length ? list.map(function (u) { var m = u.t.match(/^(\S+)\s/); return '<div class="lg-row"><span class="lg-ico">' + (m ? m[1] : "✨") + '</span><div class="lg-main"><div class="lg-txt">' + esc(m ? u.t.slice(m[0].length) : u.t) + '</div><small>' + esc(u.d) + "</small></div></div>"; }).join("") : '<p class="muted">暂无</p>';
    }).catch(function () { var el = document.getElementById("up-list"); if (el) el.textContent = "读取失败"; });
  }
  A.pages.updates = page;
})();
