// 💊 站长吃药打卡页 #/med（内部，口令和工单后台同一个 fbKey）：早上 10 点后一粒、晚上 22 点后一粒；到点没点「吃了」就一直催
(function () {
  var A = window.AIL;
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tm(ms) { if (!ms) return ""; try { return new Intl.DateTimeFormat("zh-CN", { timeZone: "America/Vancouver", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms); } catch (e) { return new Date(ms).toTimeString().slice(0, 5); } }
  function render(id) {
    var app = A.app, k = key();
    if (!k) { app.innerHTML = '<section class="card"><h1>💊 吃药打卡</h1><p class="note">这页是站长自己用的。先去 <a href="#/feedback/admin">工单后台</a> 输一次口令，回来就能用。</p></section>'; return; }
    var nav = '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb">📮 工单</a><a href="#/partner" class="ad-nb">📊 数据面板</a><a href="#/ops" class="ad-nb">🛠️ 网站优化</a><a href="#/med" class="ad-nb on">💊 吃药</a></div>';
    app.innerHTML = '<section class="card"><h1>💊 吃药打卡</h1>' + nav + '<p class="sub" style="margin-top:10px">早上 10 点后一粒，晚上 22 点后一粒（温哥华时间）。到点没点「吃了」，站内信每半小时催一次。</p><div id="med-box"><p class="muted">读取中…</p></div><div id="med-hist"></div></section>';
    fetch("/api/med?key=" + encodeURIComponent(k)).then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(id)) return;
      if (j.error) { document.getElementById("med-box").innerHTML = '<p class="note down">' + esc(j.error) + "</p>"; return; }
      var t = j.today || {}, cur = j.now || {};
      function slotHtml(slot, name) {
        var s = t[slot] || {}, on = cur.slot === slot, done = !!s.taken;
        return '<div class="med-slot' + (done ? " ok" : on ? " due" : "") + '"><div class="med-t"><b>' + name + "</b><small>" + (done ? "✅ 已吃 " + tm(s.taken) : on ? "⏰ 到点了" + (s.nagN ? "（已提醒 " + s.nagN + " 次）" : "") : "还没到时间") + "</small></div>" +
          (done ? '<button type="button" class="ghost" data-act="undo" data-slot="' + slot + '">点错了，撤销</button>' :
            '<div class="med-btns"><button type="button" class="med-yes" data-act="taken" data-slot="' + slot + '">吃了 ✅</button><button type="button" class="med-no" data-act="skip" data-slot="' + slot + '">没吃，15 分钟后再催</button></div>') + "</div>";
      }
      document.getElementById("med-box").innerHTML = '<p class="muted">今天 ' + esc(cur.bjDay || "") + "（北京时间）</p>" + slotHtml("am", "🌞 早上那粒（10 点后）") + slotHtml("pm", "🌙 晚上那粒（22 点后）");
      var days = (j.days || []).slice(1);
      document.getElementById("med-hist").innerHTML = days.length ? '<h2 style="margin-top:14px">最近 7 天</h2><ul class="med-ul">' + days.map(function (x) { var d = x.d || {}; return "<li><span>" + esc(x.day) + "</span><em>" + (d.am && d.am.taken ? "🌞 ✅ " + tm(d.am.taken) : "🌞 ❌") + "</em><em>" + (d.pm && d.pm.taken ? "🌙 ✅ " + tm(d.pm.taken) : "🌙 ❌") + "</em></li>"; }).join("") + "</ul>" : "";
      app.querySelectorAll("[data-act]").forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          fetch("/api/med", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k, slot: b.getAttribute("data-slot"), action: b.getAttribute("data-act"), day: cur.day }) })
            .then(function (r) { return r.json(); }).then(function () { render(id); }).catch(function () { b.disabled = false; });
        };
      });
    }).catch(function () { if (A.isCurrent(id)) document.getElementById("med-box").innerHTML = '<p class="note down">读不到，刷新再试</p>'; });
  }
  A.pages.med = render;
})();
