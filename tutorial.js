// 🎬 视频教程 #/videos：客户点开就能看操作视频；#/videos/admin：客服用工单口令上传 / 改名 / 排序 / 删除
// （站长 2026-11-24：老年客户建议把操作视频放网站上，比在群里一遍遍发有用）
(function () {
  "use strict";
  var A = window.AIL, PART = 8 * 1024 * 1024;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function mb(n) { return n >= 1048576 ? Math.round(n / 1048576) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function api(body) { return fetch("/api/tutorial", { method: "POST", headers: { "content-type": "application/json", "x-key": key() }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  /* 🚀 上传前自动整理（站长 2026-11-24：客户反映视频打开很慢）。
     手机录的 mp4 / mov，「目录」（moov）常常在文件最末尾，播放器要先绕到末尾取目录才能开始放 → 点了半天不动。
     这里在上传前把目录挪到最前面：不重新压制、画面一点不变，只是换个位置，并把目录里记的「每段数据在哪」统一往后挪目录那么长。
     任何一步看不懂（文件结构特殊）就原样上传，绝不改坏视频。返回 { blob, secs（时长，读不到是 0）, moved } */
  function u32(d, o) { return d.getUint32(o); }
  function atomsOf(file, from, to) { // 读顶层的盒子：[{ type, start, size }]
    var out = [], off = from;
    function next() {
      if (off + 8 > to || out.length > 200) return Promise.resolve(out);
      return file.slice(off, off + 16).arrayBuffer().then(function (b) {
        var d = new DataView(b), n = u32(d, 0), t = String.fromCharCode(d.getUint8(4), d.getUint8(5), d.getUint8(6), d.getUint8(7));
        if (n === 1) { if (b.byteLength < 16 || u32(d, 8) !== 0) throw new Error("big"); n = u32(d, 12); }
        else if (n === 0) n = to - off;
        if (n < 8 || off + n > to) throw new Error("bad");
        out.push({ type: t, start: off, size: n }); off += n; return next();
      });
    }
    return next();
  }
  // 在目录里找出所有 stco / co64（记着每段数据位置的表），把里面的位置都加上 shift；顺手读出时长
  function patchMoov(buf, shift) {
    var d = new DataView(buf), secs = 0, bad = false;
    var BOX = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, edts: 0, udta: 0 };
    (function walk(from, to) {
      var off = from;
      while (off + 8 <= to) {
        var n = u32(d, off), t = String.fromCharCode(d.getUint8(off + 4), d.getUint8(off + 5), d.getUint8(off + 6), d.getUint8(off + 7));
        if (n < 8 || off + n > to) { bad = true; return; }
        if (t === "cmov") { bad = true; return; } // 压缩过的目录：不动
        if (t === "mvhd") { var v = d.getUint8(off + 8); var ts = v === 1 ? u32(d, off + 28) : u32(d, off + 20), du = v === 1 ? u32(d, off + 32) * 4294967296 + u32(d, off + 36) : u32(d, off + 24); if (ts > 0) secs = du / ts; }
        else if (t === "stco") { var c = u32(d, off + 12); if (off + 16 + c * 4 > off + n) { bad = true; return; } for (var i = 0; i < c; i++) { var o = off + 16 + i * 4, nv = u32(d, o) + shift; if (nv > 4294967295) { bad = true; return; } d.setUint32(o, nv); } }
        else if (t === "co64") { var c2 = u32(d, off + 12); if (off + 16 + c2 * 8 > off + n) { bad = true; return; } for (var k = 0; k < c2; k++) { var o2 = off + 16 + k * 8, lo = u32(d, o2 + 4) + shift, hi = u32(d, o2); if (lo > 4294967295) { hi += 1; lo -= 4294967296; } d.setUint32(o2, hi); d.setUint32(o2 + 4, lo); } }
        else if (BOX[t]) walk(off + 8, off + n);
        off += n;
      }
    })(0, buf.byteLength);
    return bad ? null : { secs: secs };
  }
  function fastStart(file) {
    var keep = { blob: file, secs: 0, moved: false };
    return atomsOf(file, 0, file.size).then(function (as) {
      var mi = -1, di = -1;
      as.forEach(function (a, i) { if (a.type === "moov" && mi < 0) mi = i; if (a.type === "mdat" && di < 0) di = i; });
      if (mi < 0 || di < 0 || as[0].type !== "ftyp" || as[mi].size > 64 * 1024 * 1024) return keep;
      var m = as[mi];
      return file.slice(m.start, m.start + m.size).arrayBuffer().then(function (buf) {
        if (mi < di) { var r0 = patchMoov(buf.slice(0), 0); return { blob: file, secs: r0 ? r0.secs : 0, moved: false }; } // 目录本来就在前面：只读时长
        var r = patchMoov(buf, m.size);
        if (!r) return keep;
        var parts = [file.slice(0, as[0].size), buf];
        as.forEach(function (a, i) { if (i !== 0 && i !== mi) parts.push(file.slice(a.start, a.start + a.size)); });
        var out = new Blob(parts, { type: file.type });
        return out.size === file.size ? { blob: out, secs: r.secs, moved: true } : keep;
      });
    }).catch(function () { return keep; });
  }
  // 体积提醒：录屏教程每分钟 10MB 以内就很清楚了；超过这个客户打开会慢（不拦，只提醒）
  function heavy(size, secs) { return secs > 5 && size / secs > 10 * 1048576 / 60 * 1.5; }

  // 分类（站长 2026-11-26：「做一个简单的分类，有的是我们 otc 的操作，有的是官网的操作」）
  // 后台没选分类的，按标题猜：提到涡轮 / 卫星池 / 空投 / 质押 / LP / Helix / 排放 / 投票 / 挖矿 / 官网 的算官网操作，其余算本站操作
  var CATS = [["otc", "🏪 本站操作"], ["off", "🌀 官网操作"]];
  function catOf(x) { return x.cat === "otc" || x.cat === "off" ? x.cat : (/涡轮|卫星池|空投|质押|LP|helix|排放|投票|挖矿|官网|螺旋/i.test(x.title || "") ? "off" : "otc"); }
  function catName(c) { return c === "off" ? CATS[1][1] : CATS[0][1]; }
  /* 关键词（站长 2026-11-26：「太多了关键词，简单一点，比如 otc 交易、域名、预言家这样的，官网的操作不放关键词，主要是我们自己网站的」）
     → 只给本站操作的视频出几个主题词；按标题认主题，从上往下第一个对上的算（「添加 OTC app」先算手机 App，不算 OTC 交易）。
     没有视频的主题不出词（比如预言家的视频还没录，录好上传、标题带「预言」就自动出来）。点词跳到这个主题的第一个视频，同主题的都闪一下 */
  var KEYS = [["📲 手机 App", /app|桌面|链接钱包|连钱包/i], ["📮 工单", /工单|客服|反馈/], ["🌐 域名", /域名/], ["🔮 预言家", /预言|预测/], ["🏪 OTC 交易", /otc|场外|盘口|买卖|交易/i]];
  function keyOf(x) { if (catOf(x) !== "otc") return -1; for (var i = 0; i < KEYS.length; i++) if (KEYS[i][1].test(x.title || "")) return i; return -1; }

  // ===== 客户看的页面 =====
  function page(id) {
    if ((location.hash.split("/")[2] || "") === "admin") return admin(id);
    A.app.innerHTML = '<section class="card vdg"><h2>🎬 视频教程</h2><p class="muted">不会操作的，点下面的视频跟着做。看完还不会，点「📮 问题反馈」找客服。</p><div id="vdg-list"><p class="muted">读取中…</p></div></section>';
    fetch("/api/tutorial?list=1").then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(id)) return;
      var el = document.getElementById("vdg-list"), list = (d && d.list) || [];
      if (!el) return;
      if (!list.length) { el.innerHTML = '<p class="muted">教程视频正在录制，过几天再来看。着急的话点「📮 问题反馈」，客服教你。</p>'; return; }
      /* 站长 2026-11-26：「增加一些关键词，可直接点进进入，然后做一个简单的分类」
         → 顶上三个页签（全部 / 本站操作 / 官网操作）+ 一排关键词（就是每个视频的标题），点一下直接跳到那个视频；下面的视频按分类分成两组 */
      var cur = "";
      function draw() {
        var show = list.filter(function (x) { return !cur || catOf(x) === cur; }), n = 0;
        var tabs = '<div class="vdc-tabs">' + [["", "全部"]].concat(CATS).map(function (c) {
          var cnt = list.filter(function (x) { return !c[0] || catOf(x) === c[0]; }).length;
          return '<button type="button" data-c="' + c[0] + '"' + (cur === c[0] ? ' class="on"' : "") + ">" + c[1] + "<small>" + cnt + "</small></button>";
        }).join("") + "</div>";
        var num = {}, body = "";
        CATS.forEach(function (c) {
          var g = show.filter(function (x) { return catOf(x) === c[0]; }); if (!g.length) return;
          body += '<h3 class="vdc-g">' + c[1] + "<small>" + g.length + "</small></h3>" + g.map(function (x) {
            num[x.id] = ++n;
            return '<div class="vdg-it" id="vd-' + esc(x.id) + '"><h3 data-nobrand="1">' + n + ". " + esc(x.title) + '</h3><video controls playsinline preload="none" src="/api/tutorial?v=' + encodeURIComponent(x.id) + '"></video></div>';
          }).join("");
        });
        // 显示顺序按客户常用的来，和上面认主题的先后不一样
        var keyIdx = [4, 2, 3, 0, 1].filter(function (i) { return show.some(function (x) { return keyOf(x) === i; }); });
        var idx = keyIdx.length ? '<p class="muted vdc-tip">👇 点关键词，直接跳到那类视频</p><div class="vdc-idx">' + keyIdx.map(function (i) {
          var cnt = show.filter(function (x) { return keyOf(x) === i; }).length;
          return '<button type="button" class="vdc-k vdc-otc" data-key="' + i + '">' + KEYS[i][0] + (cnt > 1 ? "<small>" + cnt + "</small>" : "") + "</button>";
        }).join("") + "</div>" : "";
        el.innerHTML = tabs + idx + body;
        Array.prototype.forEach.call(el.querySelectorAll(".vdc-tabs button"), function (b) { b.onclick = function () { cur = b.getAttribute("data-c"); draw(); }; });
        Array.prototype.forEach.call(el.querySelectorAll("[data-key]"), function (b) {
          b.onclick = function () {
            var k = Number(b.getAttribute("data-key"));
            var its = show.filter(function (x) { return keyOf(x) === k; }).map(function (x) { return document.getElementById("vd-" + x.id); }).filter(Boolean);
            var it = its[0]; if (!it) return;
            // 顶栏是固定的，留出它的高度，标题别被挡住
            var top = it.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop) - 150;
            try { window.scrollTo({ top: top, behavior: "smooth" }); } catch (e) { window.scrollTo(0, top); }
            its.forEach(function (v) { v.classList.add("vdc-hit"); setTimeout(function () { v.classList.remove("vdc-hit"); }, 2200); });
          };
        });
        // 一次只放一个：点开新的，别的自动停
        var vs = el.querySelectorAll("video");
        Array.prototype.forEach.call(vs, function (v) { v.addEventListener("play", function () { Array.prototype.forEach.call(vs, function (o) { if (o !== v) { try { o.pause(); } catch (e) { /* 停不了就算了 */ } } }); }); });
      }
      draw();
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
      '<div class="vdc-pick" id="vdg-c" data-c="otc"><span class="muted">这是哪一类：</span><button type="button" class="on" data-c="otc">🏪 本站操作</button><button type="button" data-c="off">🌀 官网操作</button></div>' +
      '<input type="file" id="vdg-f" accept="video/*" hidden><button type="button" class="ghost" id="vdg-pick">🎬 选视频</button><div class="muted" id="vdg-fn">还没选视频</div>' +
      '<button type="button" class="nm-go" id="vdg-up">上传</button><p class="muted" id="vdg-st"></p></div></section>' +
      '<section class="card vdg"><h2>已有的教程</h2><div id="vdg-adm"><p class="muted">读取中…</p></div></section>';
    var fi = document.getElementById("vdg-f"), st = document.getElementById("vdg-st"), busy = false;
    function say(t, bad) { st.textContent = t; st.className = bad ? "nm-bad" : "muted"; }
    document.getElementById("vdg-pick").onclick = function () { fi.click(); };
    var cb = document.getElementById("vdg-c");
    Array.prototype.forEach.call(cb.querySelectorAll("button"), function (b) { b.onclick = function () { cb.setAttribute("data-c", b.getAttribute("data-c")); Array.prototype.forEach.call(cb.querySelectorAll("button"), function (o) { o.className = o === b ? "on" : ""; }); }; });
    fi.onchange = function () {
      var f = fi.files && fi.files[0], fn = document.getElementById("vdg-fn");
      fn.textContent = f ? f.name + "（" + mb(f.size) + "）" : "还没选视频";
      if (!f) return;
      fastStart(f).then(function (r) { // 选完就先看一眼：太大的提醒一句（不拦）
        if (fi.files[0] !== f || !heavy(f.size, r.secs)) return;
        fn.textContent = f.name + "（" + mb(f.size) + "，" + Math.round(r.secs) + " 秒）。⚠️ 这个视频偏大，客户打开会慢。能重录的话，录屏清晰度选 720p；不方便就照传，也能看。";
      });
    };
    document.getElementById("vdg-up").onclick = function () {
      if (busy) return;
      var f = fi.files && fi.files[0], title = document.getElementById("vdg-t").value.trim();
      if (!title) return say("请先写标题", true);
      if (!f) return say("请先选视频", true);
      if (!/^video\//.test(f.type || "")) return say("这个文件不是视频，请选手机里的录屏 / 视频", true);
      busy = true; say("准备上传…");
      fastStart(f).then(function (fsr) {
        f = fsr.blob; // 目录挪到了前面的版本（没法挪就是原文件）；大小不变
        return api({ action: "new", title: title, size: f.size, type: f.type, cat: cb.getAttribute("data-c") });
      }).then(function (j) {
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
          return '<div class="vdg-row" data-id="' + esc(x.id) + '"><div class="vdg-rt"><b>' + (i + 1) + ". " + esc(x.title) + "</b><small class=\"muted\">" + catName(catOf(x)) + " · " + mb(x.size) + (x.ok ? "" : " · ⚠️ 没传完，客户看不到，请删掉重传") + "</small></div>" +
            '<div class="vdg-btns"><button type="button" class="ghost" data-a="up"' + (i ? "" : " disabled") + '>上移</button><button type="button" class="ghost" data-a="down"' + (i < list.length - 1 ? "" : " disabled") + '>下移</button>' +
            '<button type="button" class="ghost" data-a="name">改标题</button><button type="button" class="ghost" data-a="cat" data-to="' + (catOf(x) === "off" ? "otc" : "off") + '">改成' + catName(catOf(x) === "off" ? "otc" : "off").replace(/^\S+\s/, "") + '</button><button type="button" class="ghost vdg-del" data-a="del">删除</button></div></div>';
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
            } else if (a === "cat") job = api({ action: "set", id: vid, cat: b.getAttribute("data-to") });
            else job = api({ action: "set", id: vid, move: a === "up" ? -1 : 1 });
            job.then(load, load);
          };
        });
      }).catch(function () { var el = document.getElementById("vdg-adm"); if (el) el.innerHTML = '<p class="muted">没读出来，请刷新再试。</p>'; });
    }
    load();
  }
  A.pages.videos = page;
})();
