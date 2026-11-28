// 🖼 宣传海报 #/posters：所有海报，点开看大图、保存、分享；#/posters/admin：用工单口令上传 / 改名 / 排序 / 删除
// （站长 2026-11-28：「以后让中奖的伙伴转发我们的 OTC 海报，帮我们宣传……1.给后台加一个上传海报的功能 2.领奖页显示海报引导客户下载发到 DeBox 宣传」）
// 领奖页（预言家 / 周榜第二步）里的那一排海报是 app.js 的 A.posterBox，和这里读同一个接口 /api/posters；这里排第一的海报，领奖页也排第一
(function () {
  "use strict";
  var A = window.AIL, MAX = 3 * 1024 * 1024;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function api(body) { return fetch("/api/posters", { method: "POST", headers: { "content-type": "application/json", "x-key": key() }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { error: "服务器没回正常的数据，请再试一次" }; }); }); }
  var NAV = '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb">📮 工单</a><a href="#/videos/admin" class="ad-nb">🎬 上传视频</a><a href="#/posters/admin" class="ad-nb on">🖼 宣传海报</a><a href="#/partner" class="ad-nb">📊 数据面板</a><a href="#/todo" class="ad-nb">📝 待办</a><a href="#/updates" class="ad-nb">🆕 更新日志</a></div>';

  function page(id) {
    if (/^#\/posters\/admin/.test(location.hash)) return admin(id);
    A.app.innerHTML = '<section class="card pst-page"><h2>🖼 AiLGNS OTC 宣传海报</h2><p class="muted">点海报看大图 → 存到相册 → 发到 DeBox / 微信群，帮我们宣传。谢谢支持！</p><div data-pst hidden></div><p class="muted" id="pst-none">读取中…</p></section>';
    A.posterBox(A.app).then(function (l) {
      if (!A.isCurrent(id)) return;
      var n = document.getElementById("pst-none"); if (!n) return;
      if (l.length) n.remove(); else n.textContent = "现在还没有海报。";
    });
  }

  // 后台：口令和工单后台是同一个（存在这台设备上，进过工单后台就不用再输）
  function login(id, msg) {
    A.app.innerHTML = '<section class="card vdg"><h2>🖼 宣传海报后台</h2><p class="muted">输入工单后台的口令（和工单后台是同一个）。</p>' +
      '<input type="password" id="pst-k" placeholder="口令" autocomplete="off"><button type="button" class="nm-go" id="pst-in">进入</button><p class="muted" id="pst-st">' + esc(msg || "") + "</p></section>";
    var go = function () { var k = document.getElementById("pst-k").value.trim(); if (!k) return; try { localStorage.setItem("fbKey", k); } catch (e) { /* 存不下也能用这一次 */ } admin(id); };
    document.getElementById("pst-in").onclick = go;
    document.getElementById("pst-k").onkeydown = function (e) { if (e.key === "Enter") go(); };
  }
  // 选的图：JPG / PNG / WebP 且不超过 2.5MB 的原样传（海报要清楚）；别的格式（HEIC 等）或太大的，转成 JPEG（最长边 2400，太大再降到 1800）
  function prep(f) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () {
          var w = im.naturalWidth, h = im.naturalHeight;
          if (/^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 2.5 * 1048576) return ok({ url: r.result, w: w, h: h, size: f.size });
          var draw = function (side, q) { var k = Math.min(1, side / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k); var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); var u = c.toDataURL("image/jpeg", q); return { url: u, w: c.width, h: c.height, size: Math.round((u.length - 23) * 0.75) }; };
          try { var x = draw(2400, 0.88); if (x.size > MAX) x = draw(1800, 0.8); ok(x); } catch (e) { bad(new Error("这张图片处理不了，请换一张")); }
        };
        im.onerror = function () { bad(new Error("「" + f.name + "」打不开，请换成 JPG / PNG 图片")); };
        im.src = r.result;
      };
      r.onerror = function () { bad(new Error("「" + f.name + "」读不出来，请换一张")); };
      r.readAsDataURL(f);
    });
  }
  function admin(id) {
    if (!key()) return login(id);
    A.app.innerHTML = '<section class="card vdg">' + NAV + '<div class="card-head"><h2>🖼 宣传海报</h2><a href="#/posters">看客户看到的 →</a></div>' +
      '<p class="muted">传上去以后，中奖的人在<b>预言家、周榜的领奖第二步</b>就能看到这些海报：点开保存，发到 DeBox 群，截图回来上传。排在前面的先看到。最多 12 张，每张最大 3MB（太大的会自动压一下）。</p>' +
      '<div class="vdg-form"><input type="text" id="pst-t" maxlength="20" placeholder="标题（可以不写），例如：OTC 0 滑点">' +
      '<input type="file" id="pst-f" accept="image/*" multiple hidden><button type="button" class="ghost" id="pst-pick">🖼 选海报（可以一次选几张）</button><div class="pst-pre" id="pst-pre"></div>' +
      '<button type="button" class="nm-go" id="pst-up">上传</button><p class="muted" id="pst-st"></p></div></section>' +
      '<section class="card vdg"><h2>已有的海报</h2><div id="pst-adm"><p class="muted">读取中…</p></div></section>';
    var fi = document.getElementById("pst-f"), st = document.getElementById("pst-st"), pre = document.getElementById("pst-pre"), busy = false;
    function say(t, bad) { st.textContent = t; st.className = bad ? "nm-bad" : "muted"; }
    function picked() { return Array.prototype.slice.call(fi.files || []).filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || ""); }); }
    document.getElementById("pst-pick").onclick = function () { fi.click(); };
    fi.onchange = function () {
      var fs = picked(); say("");
      pre.innerHTML = fs.map(function (f) { return '<span class="muted">' + esc(f.name) + "（" + kb(f.size) + "）</span>"; }).join("");
    };
    document.getElementById("pst-up").onclick = function () {
      if (busy) return;
      var fs = picked(), title = document.getElementById("pst-t").value.trim();
      if (!fs.length) return say("请先选海报", true);
      busy = true;
      var i = 0, okN = 0;
      function next() {
        if (i >= fs.length) return null;
        var f = fs[i++];
        say("正在处理第 " + i + " / " + fs.length + " 张…");
        return prep(f).then(function (x) {
          if (x.size > MAX) throw new Error("「" + f.name + "」压过还是太大（" + kb(x.size) + "），请换一张小一点的");
          say("正在上传第 " + i + " / " + fs.length + " 张（" + kb(x.size) + "），请别关页面…");
          return api({ action: "add", title: fs.length > 1 && title ? title + " " + i : title, img: x.url, w: x.w, h: x.h });
        }).then(function (j) { if (j.error) throw new Error(j.error); okN++; return next(); });
      }
      Promise.resolve().then(next).then(function () {
        busy = false; say("✅ 传好了 " + okN + " 张，领奖页已经能看到（最多晚 1 分钟）。");
        document.getElementById("pst-t").value = ""; fi.value = ""; pre.innerHTML = ""; load();
      }, function (e) {
        busy = false;
        if (/口令/.test(e.message)) { try { localStorage.removeItem("fbKey"); } catch (x) { /* 忽略 */ } return login(id, "口令失效或不对，请重新输入"); }
        say((okN ? "传好了 " + okN + " 张，后面的没传成：" : "没传成：") + e.message, true); load();
      });
    };
    function load() {
      fetch("/api/posters?list=1&_=" + Date.now(), { headers: { "x-key": key() } }).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(id)) return;
        if (d.error) { try { localStorage.removeItem("fbKey"); } catch (x) { /* 忽略 */ } return login(id, "口令失效或不对，请重新输入"); }
        var el = document.getElementById("pst-adm"), list = d.list || []; if (!el) return;
        el.innerHTML = list.length ? list.map(function (x, i) {
          return '<div class="vdg-row pst-arow" data-id="' + esc(x.id) + '"><a class="pst-ath" href="/api/posters?img=' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener"><img loading="lazy" src="/api/posters?img=' + encodeURIComponent(x.id) + '" alt=""></a>' +
            '<div class="pst-ainfo"><div class="vdg-rt"><b>' + (i + 1) + ". " + esc(x.title || "（没写标题）") + '</b><small class="muted">' + (x.w && x.h ? x.w + "×" + x.h + " · " : "") + kb(x.size || 0) + "</small></div>" +
            '<div class="vdg-btns"><button type="button" class="ghost" data-a="up"' + (i ? "" : " disabled") + '>上移</button><button type="button" class="ghost" data-a="down"' + (i < list.length - 1 ? "" : " disabled") + '>下移</button>' +
            '<button type="button" class="ghost" data-a="name">改标题</button><button type="button" class="ghost vdg-del" data-a="del">删除</button></div></div></div>';
        }).join("") : '<p class="muted">还没有海报，在上面传第一张。没有海报时，领奖页照旧只显示原来的步骤。</p>';
        Array.prototype.forEach.call(el.querySelectorAll("button[data-a]"), function (b) {
          b.onclick = function () {
            var row = b.closest(".pst-arow"), pid = row.getAttribute("data-id"), a = b.getAttribute("data-a"), job;
            if (a === "del") { // 不用系统弹窗（有的钱包 App 不弹）：点第一次变成「再点一次确认」，3 秒不点就恢复
              if (!b._sure) { b._sure = true; b.textContent = "再点一次确认删除"; setTimeout(function () { b._sure = false; b.textContent = "删除"; }, 3000); return; }
              job = api({ action: "del", id: pid });
            } else if (a === "name") {
              var tb = row.querySelector(".vdg-rt"), old = tb.querySelector("b").textContent.replace(/^\d+\.\s/, "").replace(/^（没写标题）$/, "");
              tb.innerHTML = '<input type="text" maxlength="20" value="' + esc(old) + '"><button type="button" class="ghost">保存</button>';
              tb.querySelector("button").onclick = function () { api({ action: "set", id: pid, title: tb.querySelector("input").value.trim() }).then(load, load); };
              return;
            } else job = api({ action: "set", id: pid, move: a === "up" ? -1 : 1 });
            b.disabled = true;
            job.then(function (j) { if (j && j.error) A.errTip(j.error, b); load(); }, load);
          };
        });
      }).catch(function () { var el = document.getElementById("pst-adm"); if (el) el.innerHTML = '<p class="muted">没读出来，请刷新再试。</p>'; });
    }
    load();
  }
  A.pages.posters = page;
})();
