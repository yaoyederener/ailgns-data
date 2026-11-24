// 🎬 视频教程 #/videos：客户点开就能看操作视频；#/videos/admin：客服用工单口令上传 / 改名 / 排序 / 删除
// （站长 2026-11-24：老年客户建议把操作视频放网站上，比在群里一遍遍发有用）
(function () {
  "use strict";
  var A = window.AIL, PART = 8 * 1024 * 1024;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function mb(n) { return n >= 1048576 ? Math.round(n / 1048576) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function api(body) { return fetch("/api/tutorial", { method: "POST", headers: { "content-type": "application/json", "x-key": key() }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  // ===== 客户看的页面 =====
  function page(id) {
    if ((location.hash.split("/")[2] || "") === "admin") return admin(id);
    A.app.innerHTML = '<section class="card vdg"><h2>🎬 视频教程</h2><p class="muted">不会操作的，点下面的视频跟着做。看完还不会，点「📮 问题反馈」找客服。</p><div id="vdg-list"><p class="muted">读取中…</p></div></section>';
    fetch("/api/tutorial?list=1").then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(id)) return;
      var el = document.getElementById("vdg-list"), list = (d && d.list) || [];
      if (!el) return;
      el.innerHTML = list.length ? list.map(function (x, i) {
        return '<div class="vdg-it"><h3>' + (i + 1) + ". " + esc(x.title) + '</h3><video controls playsinline preload="none" src="/api/tutorial?v=' + encodeURIComponent(x.id) + '"></video></div>';
      }).join("") : '<p class="muted">教程视频正在录制，过几天再来看。着急的话点「📮 问题反馈」，客服教你。</p>';
      // 一次只放一个：点开新的，别的自动停
      var vs = el.querySelectorAll("video");
      Array.prototype.forEach.call(vs, function (v) { v.addEventListener("play", function () { Array.prototype.forEach.call(vs, function (o) { if (o !== v) { try { o.pause(); } catch (e) { /* 停不了就算了 */ } } }); }); });
    }).catch(function () { var el = document.getElementById("vdg-list"); if (el) el.innerHTML = '<p class="muted">没读出来，请刷新再试。</p>'; });
  }

  // ===== 后台：上传 / 管理 =====
  function login(id, msg) {
    A.app.innerHTML = '<section class="card vdg"><h2>🎬 视频教程后台</h2><p class="muted">输入工单后台的口令（和工单后台是同一个）。</p>' +
      '<input type="password" id="vdg-k" placeholder="口令" autocomplete="off"><button type="button" class="nm-go" id="vdg-in">进入</button><p class="muted" id="vdg-st">' + esc(msg || "") + "</p></section>";
    document.getElementById("vdg-in").onclick = function () {
      var k = document.getElementById("vdg-k").value.trim(); if (!k) return;
      try { localStorage.setItem("fbKey", k); } catch (e) { /* 存不下也能用这一次 */ }
      admin(id);
    };
  }
  function admin(id) {
    if (!key()) return login(id);
    A.app.innerHTML = '<section class="card vdg"><div class="card-head"><h2>🎬 视频教程后台</h2><a href="#/videos">看客户页面 →</a></div>' +
      '<p class="muted">传上去客户马上就能在「视频教程」里看到。视频最大 200MB，用手机录屏的 mp4 / mov 就行。</p>' +
      '<div class="vdg-form"><input type="text" id="vdg-t" maxlength="40" placeholder="标题，例如：怎么买 AiLGNS">' +
      '<input type="file" id="vdg-f" accept="video/*" hidden><button type="button" class="ghost" id="vdg-pick">🎬 选视频</button><div class="muted" id="vdg-fn">还没选视频</div>' +
      '<button type="button" class="nm-go" id="vdg-up">上传</button><p class="muted" id="vdg-st"></p></div></section>' +
      '<section class="card vdg"><h2>已有的教程</h2><div id="vdg-adm"><p class="muted">读取中…</p></div></section>';
    var fi = document.getElementById("vdg-f"), st = document.getElementById("vdg-st"), busy = false;
    function say(t, bad) { st.textContent = t; st.className = bad ? "nm-bad" : "muted"; }
    document.getElementById("vdg-pick").onclick = function () { fi.click(); };
    fi.onchange = function () { var f = fi.files && fi.files[0]; document.getElementById("vdg-fn").textContent = f ? f.name + "（" + mb(f.size) + "）" : "还没选视频"; };
    document.getElementById("vdg-up").onclick = function () {
      if (busy) return;
      var f = fi.files && fi.files[0], title = document.getElementById("vdg-t").value.trim();
      if (!title) return say("请先写标题", true);
      if (!f) return say("请先选视频", true);
      if (!/^video\//.test(f.type || "")) return say("这个文件不是视频，请选手机里的录屏 / 视频", true);
      busy = true; say("准备上传…");
      api({ action: "new", title: title, size: f.size, type: f.type }).then(function (j) {
        if (j.error) throw new Error(j.error);
        var i = 0, n = j.n, tries = 0;
        function next() {
          if (i >= n) return null;
          say("正在上传 " + Math.round(i / n * 100) + "%，请别关页面…");
          return fetch("/api/tutorial?up=1&id=" + encodeURIComponent(j.id) + "&i=" + i, { method: "POST", headers: { "content-type": f.type, "x-key": key() }, body: f.slice(i * PART, Math.min(f.size, (i + 1) * PART)) })
            .then(function (r) { return r.json(); }, function () { return { error: "网络断了", retry: 1 }; })
            .then(function (r) {
              if (r.error) { if (r.retry && tries++ < 3) return next(); throw new Error(r.error); }
              tries = 0; i++; return next();
            });
        }
        return next();
      }).then(function () {
        busy = false; say("✅ 传好了，客户已经能看到。");
        document.getElementById("vdg-t").value = ""; fi.value = ""; document.getElementById("vdg-fn").textContent = "还没选视频";
        load();
      }, function (e) {
        busy = false;
        if (/口令/.test(e.message)) { try { localStorage.removeItem("fbKey"); } catch (x) { /* 忽略 */ } return login(id, "口令失效或不对，请重新输入"); }
        say("没传成：" + e.message + "。没传完的那条在下面，删掉后重新传。", true); load();
      });
    };
    function load() {
      fetch("/api/tutorial?list=1&_=" + Date.now(), { headers: { "x-key": key() } }).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(id)) return;
        if (d.error) { try { localStorage.removeItem("fbKey"); } catch (x) { /* 忽略 */ } return login(id, "口令失效或不对，请重新输入"); }
        var el = document.getElementById("vdg-adm"), list = d.list || []; if (!el) return;
        el.innerHTML = list.length ? list.map(function (x, i) {
          return '<div class="vdg-row" data-id="' + esc(x.id) + '"><div class="vdg-rt"><b>' + (i + 1) + ". " + esc(x.title) + "</b><small class=\"muted\">" + mb(x.size) + (x.ok ? "" : " · ⚠️ 没传完，客户看不到，请删掉重传") + "</small></div>" +
            '<div class="vdg-btns"><button type="button" class="ghost" data-a="up"' + (i ? "" : " disabled") + '>上移</button><button type="button" class="ghost" data-a="down"' + (i < list.length - 1 ? "" : " disabled") + '>下移</button>' +
            '<button type="button" class="ghost" data-a="name">改标题</button><button type="button" class="ghost vdg-del" data-a="del">删除</button></div></div>';
        }).join("") : '<p class="muted">还没有教程，在上面传第一个。</p>';
        Array.prototype.forEach.call(el.querySelectorAll("button[data-a]"), function (b) {
          b.onclick = function () {
            var row = b.closest(".vdg-row"), vid = row.getAttribute("data-id"), a = b.getAttribute("data-a"), job;
            if (a === "del") {
              // 不用系统弹窗（有的钱包 App 不弹）：点第一次变成「再点一次确认」，3 秒不点就恢复
              if (!b._sure) { b._sure = true; b.textContent = "再点一次确认删除"; setTimeout(function () { b._sure = false; b.textContent = "删除"; }, 3000); return; }
              job = api({ action: "del", id: vid });
            } else if (a === "name") {
              var tb = row.querySelector(".vdg-rt"), old = tb.querySelector("b").textContent.replace(/^\d+\.\s/, "");
              tb.innerHTML = '<input type="text" maxlength="40" value="' + esc(old) + '"><button type="button" class="ghost">保存</button>';
              tb.querySelector("button").onclick = function () { var nv = tb.querySelector("input").value.trim(); if (!nv) return; api({ action: "set", id: vid, title: nv }).then(load, load); };
              return;
            } else job = api({ action: "set", id: vid, move: a === "up" ? -1 : 1 });
            job.then(load, load);
          };
        });
      }).catch(function () { var el = document.getElementById("vdg-adm"); if (el) el.innerHTML = '<p class="muted">没读出来，请刷新再试。</p>'; });
    }
    load();
  }
  A.pages.videos = page;
})();
