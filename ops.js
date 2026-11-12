// 🛠️ 网站优化页 #/ops（内部，和工单后台同一个口令）：当前风险 → 最坏情况与防护 → 安全维护清单 → 待优化 → 站长定的方案
(function () {
  var A = window.AIL;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function tm(t) { var x = new Date(t + 8 * 3600e3); return (x.getUTCMonth() + 1) + "/" + x.getUTCDate() + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); }
  var LV = { red: "🔴", yellow: "🟡", green: "🟢" };
  function login(rid, msg) {
    A.app.innerHTML = '<section class="card ptn-login"><h2>' + (location.hash.indexOf("#/notify") === 0 ? "📣 发站内信" : location.hash.indexOf("#/todo") === 0 ? "📝 待办" : "🛠️ 网站优化") + '</h2><p class="muted">和工单后台同一个口令。</p>' + (msg ? '<p class="nm-bad">' + esc(msg) + "</p>" : "") +
      '<input id="ops-k" type="password" placeholder="口令" autocomplete="current-password"><button type="button" class="nm-go" id="ops-go">进入</button></section>';
    var go = document.getElementById("ops-go"), inp = document.getElementById("ops-k");
    go.onclick = function () { var v = inp.value.trim(); if (!v) return; try { localStorage.setItem("fbKey", v); } catch (e) {} if (location.hash.indexOf("#/notify") === 0) A.pages.notify(rid); else if (location.hash.indexOf("#/todo") === 0) A.pages.todo(rid); else load(rid); };
    inp.onkeydown = function (e) { if (e.key === "Enter") go.click(); };
  }
  function nav(cur) {
    return '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb">📮 工单</a><a href="#/partner" class="ad-nb">📊 数据面板</a><a href="#/ops" class="ad-nb' + (cur === "ops" ? " on" : "") + '">🛠️ 网站优化</a><a href="#/notify" class="ad-nb' + (cur === "notify" ? " on" : "") + '">📣 发站内信</a><a href="#/todo" class="ad-nb' + (cur === "todo" ? " on" : "") + '">📝 待办</a><a href="#/med" class="ad-nb">💊 吃药</a></div>';
  }
  // 站长 2026-11-12：「弄个动态的滚动页，把紧急、重要的推送放前面滚动」→ 导航下面一条滚动条：红的在前、黄的在后，4 秒换一条，点一下跳到下面的详情
  function hot(j) { var rs = j.risks || []; return rs.filter(function (r) { return r.level === "red"; }).concat(rs.filter(function (r) { return r.level === "yellow"; })); }
  function roll(j) {
    var hs = hot(j);
    if (!hs.length) return '<div class="ops-roll ok"><div class="ops-ri"><b>🟢 现在没有紧急的事</b><span>下面的清单有空再看</span></div></div>';
    return '<div class="ops-roll" id="ops-roll"><div class="ops-rt" id="ops-rt">' + hs.concat(hs.length > 1 ? [hs[0]] : []).map(function (r) {
      return '<div class="ops-ri ' + r.level + '"><b>' + LV[r.level] + " " + (r.level === "red" ? "紧急" : "重要") + "：" + esc(r.title) + "</b><span>👉 " + esc(r.todo) + "</span></div>";
    }).join("") + '</div><i class="ops-rn" id="ops-rn">1/' + hs.length + "</i></div>";
  }
  function rollGo(n) {
    try {
      var box = document.getElementById("ops-roll"), t = document.getElementById("ops-rt"), num = document.getElementById("ops-rn");
      if (!box || !t) return;
      box.onclick = function () { var x = document.getElementById("ops-now"); if (x) x.scrollIntoView({ behavior: "smooth", block: "start" }); };
      if (n < 2) return;
      var i = 0, hold = false;
      box.onmouseenter = box.ontouchstart = function () { hold = true; };
      box.onmouseleave = box.ontouchend = function () { hold = false; };
      var iv = setInterval(function () {
        try {
          if (!document.body.contains(box)) { clearInterval(iv); return; }
          if (hold || document.hidden) return;
          i++; t.style.transition = "transform .45s ease"; t.style.transform = "translateY(-" + (i * 54) + "px)";
          if (num) num.textContent = ((i % n) + 1) + "/" + n;
          if (i === n) setTimeout(function () { i = 0; t.style.transition = "none"; t.style.transform = "translateY(0)"; }, 500);
        } catch (e) { clearInterval(iv); }
      }, 4000);
    } catch (e) {}
  }
  function li(items, f) { return '<ul class="ops-ul">' + items.map(f).join("") + "</ul>"; }
  function render(rid, j) {
    var h = '<section class="card ops"><div class="card-head"><h2>🛠️ 网站优化</h2><span class="muted">内容更新于 ' + esc(j.updated) + "</span></div>" + nav("ops") + roll(j) +
      '<nav class="ops-toc"><a href="javascript:void 0" data-ops-to="ops-now">当前风险</a><a href="javascript:void 0" data-ops-to="ops-worst">最坏情况</a><a href="javascript:void 0" data-ops-to="ops-sec">安全维护</a><a href="javascript:void 0" data-ops-to="ops-todo">待优化</a><a href="javascript:void 0" data-ops-to="ops-dec">定的方案</a><a href="javascript:void 0" data-ops-to="ops-learn">学习清单</a></nav>' +
      // 当前风险
      '<h3 class="ad-h" id="ops-now">🚦 当前风险（合伙人面板算的' + (j.risksAt ? "，" + tm(j.risksAt) : "") + '）</h3><div class="ptn-risks">' + (j.risks || []).map(function (r) {
        return '<div class="ptn-risk ' + r.level + '"><div class="ptn-rh">' + LV[r.level] + " <b>" + esc(r.title) + '</b><i>' + esc(r.who) + "</i></div><p>" + esc(r.why) + '</p><p class="ptn-todo">👉 ' + esc(r.todo) + "</p></div>";
      }).join("") + "</div>" +
      // 最坏情况
      '<h3 class="ad-h" id="ops-worst">☠️ 最坏情况与防护（按损失从大到小）</h3>' + li(j.worst, function (w) { return "<li><b>" + esc(w.t) + '</b><div class="ops-k">会丢什么</div><p>' + esc(w.lose) + '</p><div class="ops-k">怎么防</div><p>' + esc(w.guard) + "</p>" + (w.done ? '<div class="ops-k ok">✅ 已经做了</div><p>' + esc(w.done) + "</p>" : "") + (w.next ? '<div class="ops-k go">🔧 继续优化</div><p>' + esc(w.next) + "</p>" : "") + "</li>"; }) +
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
    rollGo(hot(j).length);
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
  // 📝 站长待办（2026-11-10 站长：「很多想一半没有执行，在这里提醒我继续优化」）：清单在 lib/todo.js 由开发维护；勾「做完了」存服务器
  var TD_ST = { "拍板": ["🟣 等你拍板", "td-pick"], "半成": ["🟠 想了一半没做", "td-half"], "长期": ["🔵 长期 / 基础设施", "td-long"], "跟进": ["🟢 开发在查在盯", "td-follow"] };
  A.pages.todo = function (rid) {
    var k = key(); if (!k) return login(rid);
    A.app.innerHTML = '<section class="card"><p class="muted">读取中…</p></section>';
    fetch("/api/todo?key=" + encodeURIComponent(k)).then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      if (j.error) { if (/口令/.test(j.error)) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, j.error); } A.app.innerHTML = '<section class="card"><p class="nm-bad">' + esc(j.error) + "</p></section>"; return; }
      var done = j.done || {}, items = j.items || [], open = items.filter(function (x) { return !done[x.id]; }), closed = items.filter(function (x) { return done[x.id]; });
      var card = function (x) {
        var dn = !!done[x.id];
        return '<li class="td-it' + (dn ? " done" : "") + ' pri-' + (x.pri === "高" ? "h" : x.pri === "中" ? "m" : "l") + '"><div class="td-h"><b>' + (dn ? "✅ " : "") + esc(x.t) + '</b><span class="td-pri">' + esc(x.pri) + "</span></div>" +
          '<p class="td-why">' + esc(x.why) + '</p><p class="td-next">👉 ' + esc(x.next) + '</p>' +
          '<div class="td-f"><small class="muted">' + esc(x.d) + (dn ? " · 做完于 " + tm(done[x.id]) : "") + '</small><button type="button" class="td-tg" data-id="' + esc(x.id) + '" data-done="' + (dn ? "0" : "1") + '">' + (dn ? "恢复" : "做完了 ✓") + "</button></div></li>";
      };
      var groups = Object.keys(TD_ST).map(function (st) { var l = open.filter(function (x) { return x.st === st; }); return l.length ? '<h3 class="ad-h">' + TD_ST[st][0] + "（" + l.length + "）</h3>" + li(l, card) : ""; }).join("");
      A.app.innerHTML = '<section class="card ops"><div class="card-head"><h2>📝 待办 · 想到的都在这</h2><span class="muted">清单更新于 ' + esc(j.updated) + "</span></div>" + nav("todo") +
        '<p class="muted ptn-note">你说过的想法、定了一半的规则、我在查的事，全在这。<b>等你拍板</b>的一句话就能动；<b>想了一半</b>的是你开了头没往下走的。做完的点「做完了」收进底下。</p>' +
        (open.length ? groups : '<p class="muted">全部做完了 🎉</p>') +
        (closed.length ? '<details class="td-done"><summary>✅ 已完成（' + closed.length + '）</summary>' + li(closed, card) + "</details>" : "") +
        '<p class="muted ptn-note">清单由开发维护：你每说一个新想法、每定一条规则、每做完一件事都会同步到这里。</p></section>';
      A.app.querySelectorAll(".td-tg").forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          fetch("/api/todo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: k, id: b.getAttribute("data-id"), done: b.getAttribute("data-done") === "1" }) })
            .then(function (r) { return r.json(); }).then(function (r2) { if (r2.error) { A.errTip(r2.error, b); b.disabled = false; return; } A.pages.todo(rid); }, function () { b.disabled = false; });
        };
      });
    }, function (e) { if (A.isCurrent(rid)) A.app.innerHTML = '<section class="card"><p class="nm-bad">读取失败：' + esc(e.message || e) + "</p></section>"; });
  };
  // 📣 站长给指定地址发站内信（2026-11-08）
  function tm2(t) { var d = new Date(t + 8 * 3600e3); return d.toISOString().slice(5, 16).replace("T", " "); }
  function logHtml(log) {
    if (!log || !log.length) return '<p class="muted">还没发过</p>';
    return log.map(function (x) { return '<div class="ntf-log"><small class="muted">' + tm2(x.t) + " · 发给 " + x.to.length + " 个地址</small><p>" + esc(x.msg) + '</p><small class="mono muted">' + x.to.map(function (a) { return a.slice(0, 6) + "…" + a.slice(-4); }).join("、") + "</small></div>"; }).join("");
  }
  A.pages.notify = function (rid) {
    var k = key(); if (!k) return login(rid);
    A.app.innerHTML = '<section class="card ops"><div class="card-head"><h2>📣 发站内信</h2><span class="muted">只有站长能用</span></div>' + nav("notify") +
      '<label class="ntf-l">发给谁（钱包地址，一行一个，最多 50 个）</label><textarea id="ntf-to" rows="4" placeholder="0x…&#10;0x…"></textarea>' +
      '<button type="button" class="link" id="ntf-all">＋ 填入「全部 OTC 商户」（✔ 认证商家及以上，按本周名单）</button>' +
      '<label class="ntf-l">内容（1200 字以内）</label><textarea id="ntf-msg" rows="5" maxlength="1200" placeholder="比如：恭喜你获得本周贡献王，奖金已发到你的钱包，请查收 💜"></textarea>' +
      '<label class="ntf-l">点开跳到哪一页（可不填）</label><input id="ntf-link" placeholder="#/oracle">' +
      '<button type="button" class="nm-go" id="ntf-go">发送</button><p id="ntf-st" class="muted"></p>' +
      '<h3 class="ad-h">🗂 发送记录</h3><div id="ntf-log"><p class="muted">读取中…</p></div>' +
      '<p class="muted ptn-note">对方会在「📬 收件箱」看到，标题是「📣 站长通知」；开了通知的手机、电脑会弹提醒。</p></section>';
    var post = function (o) { o.key = k; return fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then(function (r) { return r.json(); }); };
    post({ action: "adminlog" }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      if (j.error && /口令/.test(j.error)) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, j.error); }
      document.getElementById("ntf-log").innerHTML = j.error ? '<p class="nm-bad">' + esc(j.error) + "</p>" : logHtml(j.log);
    }, function () {});
    document.getElementById("ntf-all").onclick = function () { var t = document.getElementById("ntf-to"); if (!/@商户/.test(t.value)) t.value = "@商户" + (t.value.trim() ? "\n" + t.value.trim() : ""); };
    document.getElementById("ntf-go").onclick = function () {
      var b = this, st = document.getElementById("ntf-st"), to = document.getElementById("ntf-to").value, msg = document.getElementById("ntf-msg").value.trim(), link = document.getElementById("ntf-link").value.trim();
      var n = (to.toLowerCase().match(/0x[0-9a-f]{40}/g) || []).length, all = /@商户/.test(to);
      if (!n && !all) { st.textContent = "❌ 没找到有效地址"; return; }
      if (msg.length < 2) { st.textContent = "❌ 内容太短"; return; }
      if (!confirm(all ? "确定发给全部 OTC 商户" + (n ? "（再加 " + n + " 个地址）" : "") + "？" : "确定发给 " + n + " 个地址？")) return;
      b.disabled = true; st.textContent = "发送中…";
      post({ action: "admin", to: to, msg: msg, link: link }).then(function (j) {
        b.disabled = false;
        if (j.error) { st.textContent = "❌ " + j.error; return; }
        st.textContent = "✅ 已发给 " + j.n + " 个地址"; document.getElementById("ntf-msg").value = "";
        document.getElementById("ntf-log").innerHTML = logHtml(j.log);
      }, function (e) { b.disabled = false; st.textContent = "❌ 发送失败：" + (e.message || e); });
    };
  };
})();
