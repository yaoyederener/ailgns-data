// 📮 问题反馈（#/feedback）：客户填钱包地址 + 文字 + 截图（可粘贴 / 拖进来 / 从相册选），提交后变成工单
// 站长后台（#/feedback/admin）：输入口令（FEEDBACK_KEY 或 BACKUP_KEY）看工单、看截图、写回复、标记处理中 / 已解决
(function () {
  "use strict";
  var A = window.AIL;
  var imgs = [], pasteOn = false;
  var ST = { new: ["待处理", "#e11d48"], doing: ["处理中", "#d97706"], done: ["已解决", "#16a34a"], skip: ["无效", "#9ca3af"] };
  var LV = { 0: ["🚨 资金安全", "#b91c1c"], 1: ["🔴 交易故障", "#dc2626"], 2: ["🟠 功能问题", "#d97706"], 3: ["🟢 咨询建议", "#16a34a"] };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tm(t) { var d = new Date(t); return (d.getMonth() + 1) + "-" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }

  // 截图压缩：最长边 1400，JPEG 0.75（手机截图几 MB → 200KB 左右）
  function shrink(file) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () {
          var k = Math.min(1, 1400 / Math.max(im.width, im.height)), c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.75));
        };
        im.onerror = bad; im.src = r.result;
      };
      r.onerror = bad; r.readAsDataURL(file);
    });
  }
  function addFiles(files) {
    var fs = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
    if (!fs.length) return;
    var room = 4 - imgs.length;
    if (room <= 0) return say("截图最多 4 张");
    Promise.all(fs.slice(0, room).map(shrink)).then(function (r) { imgs = imgs.concat(r); thumbs(); say(""); }, function () { say("这张图片读不出来，请换一张"); });
  }
  // ✏️ 图片标注画板：画圈 / 箭头 / 随手画，红色粗线，可撤销；完成后替换原图（白居易原则：手指一划就行，不用学）
  function markImg(src, done) {
    var im = new Image();
    im.onload = function () {
      var ov = document.createElement("div"); ov.className = "fb-mk";
      ov.innerHTML = '<div class="fb-mkbar"><button type="button" data-t="circle" class="on">⭕ 画圈</button><button type="button" data-t="arrow">➡️ 箭头</button><button type="button" data-t="pen">✏️ 随手画</button><button type="button" id="fb-mkundo">↩️ 撤销</button></div>' +
        '<div class="fb-mkc"><canvas id="fb-mkcv"></canvas></div>' +
        '<p class="fb-mktip">在图上用手指（或鼠标）按住拖一下，就画出一个圈 / 箭头，标出有问题的地方</p>' +
        '<div class="fb-mkft"><button type="button" class="ghost" id="fb-mkx">取消</button><button type="button" class="nm-go" id="fb-mkok">✅ 完成标注</button></div>';
      document.body.appendChild(ov); document.body.style.overflow = "hidden";
      var cv = document.getElementById("fb-mkcv"), cx = cv.getContext("2d"), W = im.width, H = im.height, tool = "circle", shapes = [], cur = null;
      cv.width = W; cv.height = H;
      var lw = Math.max(4, Math.round(Math.max(W, H) / 180));
      function draw() {
        cx.clearRect(0, 0, W, H); cx.drawImage(im, 0, 0);
        cx.strokeStyle = "#ff2d2d"; cx.lineWidth = lw; cx.lineCap = "round"; cx.lineJoin = "round"; cx.shadowColor = "rgba(0,0,0,.35)"; cx.shadowBlur = 2;
        shapes.concat(cur ? [cur] : []).forEach(function (sh) {
          cx.beginPath();
          if (sh.t === "pen") { sh.p.forEach(function (q, i) { i ? cx.lineTo(q[0], q[1]) : cx.moveTo(q[0], q[1]); }); cx.stroke(); return; }
          var x0 = sh.p[0][0], y0 = sh.p[0][1], x1 = sh.p[1][0], y1 = sh.p[1][1];
          if (sh.t === "circle") { var rx = Math.max(6, Math.abs(x1 - x0) / 2), ry = Math.max(6, Math.abs(y1 - y0) / 2); cx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, rx, ry, 0, 0, Math.PI * 2); cx.stroke(); return; }
          cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
          var ang = Math.atan2(y1 - y0, x1 - x0), hl = lw * 4;
          cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x1 - hl * Math.cos(ang - 0.5), y1 - hl * Math.sin(ang - 0.5)); cx.moveTo(x1, y1); cx.lineTo(x1 - hl * Math.cos(ang + 0.5), y1 - hl * Math.sin(ang + 0.5)); cx.stroke();
        });
      }
      function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
      cv.onpointerdown = function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); var q = pt(e); cur = { t: tool, p: tool === "pen" ? [q] : [q, q] }; draw(); };
      cv.onpointermove = function (e) { if (!cur) return; e.preventDefault(); var q = pt(e); if (cur.t === "pen") cur.p.push(q); else cur.p[1] = q; draw(); };
      cv.onpointerup = cv.onpointercancel = function (e) { if (!cur) return; var q = pt(e); if (cur.t !== "pen" && Math.abs(q[0] - cur.p[0][0]) < 4 && Math.abs(q[1] - cur.p[0][1]) < 4) { cur.p[1] = [q[0] + W / 12, q[1] + W / 12]; } shapes.push(cur); cur = null; draw(); };
      ov.querySelectorAll("[data-t]").forEach(function (b) { b.onclick = function () { tool = b.getAttribute("data-t"); ov.querySelectorAll("[data-t]").forEach(function (x) { x.classList.toggle("on", x === b); }); }; });
      document.getElementById("fb-mkundo").onclick = function () { shapes.pop(); draw(); };
      function close() { ov.remove(); document.body.style.overflow = ""; }
      document.getElementById("fb-mkx").onclick = close;
      document.getElementById("fb-mkok").onclick = function () { cur = null; draw(); var u = cv.toDataURL("image/jpeg", 0.8); close(); done(u); };
      draw();
    };
    im.src = src;
  }
  function thumbs() {
    var box = document.getElementById("fb-th"); if (!box) return;
    box.innerHTML = imgs.map(function (u, i) { return '<div class="fb-t"><img src="' + u + '" data-ed="' + i + '" title="点图片画圈标注"><button type="button" data-rm="' + i + '">✕</button><button type="button" class="fb-tmk" data-ed="' + i + '">✏️ 标注</button></div>'; }).join("") + (imgs.length ? '<p class="fb-mkhint">点图片上的「✏️ 标注」可以画圈、画箭头，标出有问题的地方</p>' : "");
    box.querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { imgs.splice(Number(b.getAttribute("data-rm")), 1); thumbs(); }; });
    box.querySelectorAll("[data-ed]").forEach(function (b) { b.onclick = function () { var i = Number(b.getAttribute("data-ed")); markImg(imgs[i], function (u) { imgs[i] = u; thumbs(); }); }; });
    var z = document.getElementById("fb-zone"); if (z) z.classList.toggle("has", imgs.length > 0);
  }
  function say(t, good) { var s = document.getElementById("fb-st"); if (s) { s.textContent = t; s.className = "fb-st" + (good ? " ok" : ""); } }

  function page(rid) {
    if (/feedback\/admin\/stats/.test(location.hash)) { location.replace("#/partner"); return; } // 旧数据面板网址已发给合伙人：不用先登工单后台，直接换成合伙人面板
    if (/feedback\/admin/.test(location.hash)) return admin(rid);
    imgs = [];
    var prefill = ""; try { prefill = sessionStorage.getItem("fb:prefill") || ""; sessionStorage.removeItem("fb:prefill"); } catch (e) {} // 错误弹窗「报给客服」带过来的内容
    A.app.innerHTML = '<section class="card fb"><div class="card-head"><h2>📮 问题反馈</h2><span class="muted">提交后生成工单，客服挨个处理</span></div>' +
      '<p class="fb-lead">遇到问题？按下面 3 步填好，<b>一次说清楚</b>，处理最快 👇</p>' +
      '<div class="fb-slow">⏳ <b>回复会比较慢，请耐心等。</b>技术人员正忙着研究产品策略、极致优化体验，每一个客户的问题都要逐个优化、不断调试，没办法及时处理工单。你的钱在合约里不会因为等待受影响；提交后进度在下面「我的反馈进度」里看。</div>' +
      '<label class="fb-l"><b>① 你的钱包地址</b><small>出问题的那个钱包（0x 开头）</small></label>' +
      '<div class="fb-row"><input id="fb-a" placeholder="0x…" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button" class="ghost" id="fb-pa">📋 粘贴</button></div>' +
      '<label class="fb-l"><b>② 截图</b><small>最多 4 张：交易记录、报错提示、钱包页面都可以</small></label>' +
      '<div class="fb-zone" id="fb-zone"><input type="file" id="fb-f" accept="image/*" multiple hidden>' +
        '<button type="button" class="fb-pick" id="fb-pick">🖼️ 点这里选截图</button>' +
        '<p class="fb-hint">📱 弹出菜单后，请点 <b>「照片图库」</b>（安卓点 <b>「相册 / 图库」</b>），选好截图后点右上角「添加 / 完成」</p>' +
        '<button type="button" class="ghost fb-pimg" id="fb-pimg">📋 粘贴刚才的截图</button>' +
        '<small>电脑上截图后，直接按 <b>Ctrl+V</b>（苹果 ⌘+V）就能贴进来，也可以把图片拖到这里</small><div class="fb-th" id="fb-th"></div></div>' +
      '<label class="fb-l"><b>🎬 录屏 / 视频（可选）</b><small>闪退、卡住、点了没反应这类问题，录一段最说得清：1 个，最多 100MB。用手机自带的「录屏」最省流量；用另一台手机对着拍也可以</small></label>' +
      '<div class="fb-zone fb-vz"><input type="file" id="fb-v" accept="video/*" hidden><button type="button" class="fb-pick" id="fb-vpick">🎬 点这里选视频</button><div class="fb-vn" id="fb-vn"></div></div>' +
      '<label class="fb-l"><b>③ 遇到了什么问题</b><small>什么时间、在哪个页面、做了什么、提示了什么</small></label>' +
      '<textarea id="fb-x" rows="5" maxlength="2000" placeholder="例如：今天下午 3 点在借贷页面借款，钱包扣了 1 个 AiLGNS，但我的借贷里查不到订单"></textarea>' +
      '<button type="button" class="nm-go fb-go" id="fb-go">✅ 提交反馈</button><p class="fb-st" id="fb-st"></p>' +
      '<div class="fb-dbx"><p>🔔 <b>客服回复第一时间通知你</b>：关注 DeBox 机器人并发送你的钱包地址，工单处理好了机器人会<b>私信</b>你，不用一直刷页面。</p><div id="dbx-slot"></div></div>' +
      '<p class="muted fb-safe">🔒 我们<b>绝不会</b>向你要私钥、助记词或密码；任何人找你要，都是骗子。</p></section>' +
      '<section class="card"><div class="card-head"><h2>🧾 我的反馈进度</h2><span class="muted">按钱包地址查</span></div><div id="fb-mine"><p class="muted">填好钱包地址后，这里显示你提交过的反馈和客服回复</p></div></section>';
    if (prefill) { var pf = document.getElementById("fb-x"); if (pf) { pf.value = prefill; pf.focus(); pf.setSelectionRange(pf.value.length, pf.value.length); } }
    if (A.otcKit && A.otcKit.deboxCard) A.otcKit.deboxCard(rid, { title: "绑定 DeBox 机器人，客服回复秒通知", on: "已绑定：工单处理好、客服回复了，机器人会私信你；OTC 成交也会通知你" });
    var inp = document.getElementById("fb-a");
    if (A.wallets && A.wallets.silent) A.wallets.silent().then(function (a) { if (a && !inp.value && A.isCurrent(rid)) { inp.value = String(a).toLowerCase(); mine(inp.value); } }, function () {});
    inp.onchange = function () { var v = inp.value.trim(); if (isAddr(v)) mine(v.toLowerCase()); };
    document.getElementById("fb-pa").onclick = function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) return say("请长按输入框，选「粘贴」");
      navigator.clipboard.readText().then(function (t) { var m = String(t).match(/0x[0-9a-fA-F]{40}/); if (m) { inp.value = m[0].toLowerCase(); mine(inp.value); say(""); } else say("剪贴板里没有钱包地址，请先在钱包里复制地址"); }, function () { say("请长按输入框，选「粘贴」"); });
    };
    var f = document.getElementById("fb-f");
    document.getElementById("fb-pick").onclick = function () { f.click(); };
    f.onchange = function () { addFiles(f.files); f.value = ""; };
    document.getElementById("fb-pimg").onclick = function () {
      if (!navigator.clipboard || !navigator.clipboard.read) return say("这个浏览器不支持一键粘贴图片，请用上面「选截图」");
      navigator.clipboard.read().then(function (items) {
        var ps = [];
        items.forEach(function (it) { it.types.forEach(function (ty) { if (/^image\//.test(ty)) ps.push(it.getType(ty).then(function (bl) { return new File([bl], "paste", { type: ty }); })); }); });
        if (!ps.length) return say("剪贴板里没有图片，请先截图或复制图片");
        Promise.all(ps).then(addFiles);
      }, function () { say("请用上面「选截图」，或者在电脑上按 Ctrl+V"); });
    };
    var z = document.getElementById("fb-zone");
    z.ondragover = function (e) { e.preventDefault(); z.classList.add("drag"); };
    z.ondragleave = function () { z.classList.remove("drag"); };
    z.ondrop = function (e) { e.preventDefault(); z.classList.remove("drag"); addFiles(e.dataTransfer.files); };
    if (!pasteOn) { // 整个页面任何地方 Ctrl+V 都能贴截图
      pasteOn = true;
      document.addEventListener("paste", function (e) {
        if (!document.getElementById("fb-zone")) return;
        var fs = [];
        Array.prototype.forEach.call((e.clipboardData && e.clipboardData.items) || [], function (it) { if (it.kind === "file" && /^image\//.test(it.type)) fs.push(it.getAsFile()); });
        if (fs.length) { e.preventDefault(); addFiles(fs); }
      });
    }
    // 视频：只收 1 个，先记在页面上，工单建好以后单独传（站长 2026-11-17）
    var vid = null, vIn = document.getElementById("fb-v"), vPick = document.getElementById("fb-vpick"), vN = document.getElementById("fb-vn");
    function vShow() {
      if (!vN) return;
      vN.innerHTML = vid ? '已选：<b>' + esc(vid.name || "视频") + '</b>（' + Math.max(1, Math.round(vid.size / 1048576)) + ' MB） <button type="button" class="ghost" id="fb-vrm">✕ 不传了</button>' : "";
      var rm = document.getElementById("fb-vrm"); if (rm) rm.onclick = function () { vid = null; vShow(); };
      if (vPick) vPick.textContent = vid ? "🔁 换一个视频" : "🎬 点这里选视频";
    }
    if (vPick && vIn) {
      vPick.onclick = function () { vIn.click(); };
      vIn.onchange = function () {
        var f = vIn.files && vIn.files[0]; vIn.value = "";
        if (!f) return;
        if (!/^video\//.test(f.type || "")) return say("这个文件不是视频，请选手机里的录屏 / 视频");
        if (f.size > 100 * 1024 * 1024) return say("视频太大了（" + Math.round(f.size / 1048576) + " MB，最多 100 MB）。请录短一点，或者用手机自带的「录屏」（比用另一台手机拍小很多）");
        vid = f; vShow(); say("");
      };
    }
    var go = document.getElementById("fb-go");
    go.onclick = function () {
      var a = inp.value.trim().toLowerCase(), x = document.getElementById("fb-x").value.trim();
      if (!isAddr(a)) { inp.focus(); return say("请填正确的钱包地址（0x 开头，42 位）"); }
      if (x.length < 2 && !imgs.length && !vid) return say("请写一下遇到的问题，或者贴一张截图 / 选一个视频");
      go.disabled = true; say("提交中…");
      var okMsg = function (id, extra) { return "✅ 提交成功！工单号 #" + id + (extra || "") + "。回复会比较慢，请耐心等：技术人员正忙着优化每一个客户的问题。进度在下面「我的反馈进度」里看"; };
      fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: a, txt: x || (vid ? "（见视频）" : ""), imgs: imgs, v: vid ? 1 : 0 }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          if (j.error) { go.disabled = false; return say(j.error); }
          imgs = []; thumbs(); document.getElementById("fb-x").value = "";
          var v = vid; vid = null; vShow();
          if (!v) { go.disabled = false; say(okMsg(j.id), true); mine(a); return; }
          /* 站长 2026-11-19「怎么方便客户怎么来」：视频切成 8MB 一段一段传（最多 100MB）。每段失败自动重试 3 次；还不行就停在那一段，给一个「接着传」按钮，不用从头再来 */
          var PART = 8 * 1024 * 1024, n = Math.max(1, Math.ceil(v.size / PART)), mb = Math.max(1, Math.round(v.size / 1048576));
          var sendFrom = function (i, tries) {
            if (i >= n) return Promise.resolve();
            say("工单 #" + j.id + " 已提交，正在上传视频（" + mb + " MB）：已传 " + Math.round(i / n * 100) + "%，请别关页面…");
            return fetch("/api/feedback?video=1&id=" + j.id + "&a=" + a + "&i=" + i + "&n=" + n + "&size=" + v.size, { method: "POST", headers: { "content-type": v.type || "video/mp4" }, body: v.slice(i * PART, Math.min(v.size, (i + 1) * PART)) })
              .then(function (r) { return r.json(); })
              .then(function (k) {
                if (k.error && !k.retry) { var e = new Error(k.error); e.final = true; throw e; }
                if (k.error) throw new Error(k.error);
                return i + 1;
              })
              .then(function (next) { return sendFrom(next, 0); }, function (e) {
                if (e && e.final) throw e;
                if (tries < 3) return new Promise(function (ok) { setTimeout(ok, 2500 * (tries + 1)); }).then(function () { return sendFrom(i, tries + 1); });
                var x = new Error("net"); x.at = i; throw x;
              });
          };
          var run = function (from) {
            go.disabled = true;
            return sendFrom(from, 0).then(function () { go.disabled = false; say(okMsg(j.id, "，视频也传好了"), true); mine(a); }, function (e) {
              go.disabled = false;
              if (e && e.final) { say("工单 #" + j.id + " 已提交，但视频没传上去：" + e.message + "。文字和截图我们已经收到"); mine(a); return; }
              var at = e && e.at != null ? e.at : from, s = document.getElementById("fb-st");
              say("工单 #" + j.id + " 已提交，文字和截图我们已经收到。视频传到 " + Math.round(at / n * 100) + "% 时网络断了。");
              if (s) { var b = document.createElement("button"); b.type = "button"; b.className = "ghost fb-vgo"; b.textContent = "🔁 接着传（不用从头再来）"; b.onclick = function () { run(at); }; s.appendChild(b); }
              mine(a);
            });
          };
          return run(0);
        }, function () { go.disabled = false; say("网络不好，请再点一次"); });
    };
  }
  // 🔒 私密工单：把「收件箱登录」的钱包签名带上（站长钱包能看全部；发单人能看自己的）。a 给了就只在签名正是这个地址时才带
  function fbSig(a) { try { var x = JSON.parse(localStorage.getItem("ibAuth") || "null"); if (x && x.a && x.ts && x.sig && (!a || x.a === a)) return x; } catch (e) {} return null; }
  function fbPq(a) { var x = fbSig(a); return x ? "&pa=" + x.a + "&pts=" + x.ts + "&psig=" + x.sig : ""; }
  function mine(a) {
    var box = document.getElementById("fb-mine"); if (!box) return;
    fetch("/api/feedback?mine=" + a + fbPq(a)).then(function (r) { return r.json(); }).then(function (j) {
      if (j.lock) { box.innerHTML = '<p class="muted">🔒 这个地址的工单只有本人能看。先到 <a href="#/inbox">📬 收件箱</a> 用钱包登录一次（签名免费），再回到这里。</p>'; return; }
      var l = j.list || [], seen = 0; try { seen = Number(localStorage.getItem("fb:seen:" + a) || 0); } catch (e) {}
      // 客户看进度：像聊天一样——左边我说的，右边客服回的；状态大字；新回复高亮
      box.innerHTML = l.length ? l.map(function (t) {
        var s = ST[t.st] || ST["new"], fresh = t.note && t.up > seen;
        return '<div class="fb-th' + (fresh ? " fresh" : "") + '" id="fb-t' + t.id + '"><div class="fb-thh"><span class="fb-tag" style="background:' + s[1] + '">' + (t.st === "done" ? "✅ " : t.st === "doing" ? "⏳ " : "📮 ") + s[0] + '</span><b>工单 #' + t.id + '</b><small class="muted">' + tm(t.t) + "</small>" + (fresh ? '<i class="fb-new">新回复</i>' : "") + "</div>" +
          '<div class="fb-bub me"><small>我</small>' + esc(t.txt || "（截图 " + t.n + " 张）") + (t.n ? '<div class="fb-ims">' + Array.apply(null, Array(t.n)).map(function (_, i) { var u = "/api/feedback?mimg=" + t.id + ":" + i + "&a=" + a + fbPq(a); return '<a href="' + u + '" target="_blank"><img loading="lazy" src="' + u + '" alt="我的截图"></a>'; }).join("") + "</div>" : "") + "</div>" + // 站长 2026-11-08：显示客户自己当初的截图
          (t.bot && !t.note ? '<div class="fb-bub bot"><small>🤖 机器人初步答复</small>' + esc(t.bot) + '<em>人工客服会再确认</em></div>' : "") +
          (t.note ? '<div class="fb-bub cs"><small>💬 客服' + (t.up ? " · " + tm(t.up) : "") + "</small>" + esc(t.note) + (t.rn ? '<div class="fb-ims">' + Array.apply(null, Array(t.rn)).map(function (_, i) { var u = "/api/feedback?rimg=" + t.id + ":" + i + "&a=" + a + fbPq(a); return '<a href="' + u + '" target="_blank"><img loading="lazy" src="' + u + '"></a>'; }).join("") + "</div>" : "") + "</div>" : '<div class="fb-wait">客服还没回复，会按轻重缓急处理；回复了这里会亮起来，页面右下角也会提醒</div>') +
          (t.st !== "done" || t.note ? '<div class="fb-thf"><button type="button" class="link fb-more" data-id="' + t.id + '">补充说明 / 追问</button></div>' : "") + "</div>";
      }).join("") : '<p class="muted">这个地址还没有提交过反馈</p>';
      try { var mx = Math.max.apply(null, [0].concat(l.map(function (t) { return t.up || 0; }))); if (mx) localStorage.setItem("fb:seen:" + a, String(mx)); } catch (e) {}
      var pill = document.getElementById("fb-pill"); if (pill) pill.remove();
      box.querySelectorAll(".fb-more").forEach(function (b) { b.onclick = function () { var x = document.getElementById("fb-x"); if (x) { x.value = "关于工单 #" + b.getAttribute("data-id") + "：" + x.value; x.focus(); x.scrollIntoView({ behavior: "smooth", block: "center" }); } }; });
      var h = location.hash.match(/feedback\/(\d+)/); if (h) { var el = document.getElementById("fb-t" + h[1]); if (el) setTimeout(function () { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("fresh"); }, 200); }
    }, function () {});
  }
  // 全站：连过钱包的客户有新客服回复时，右下角弹一个漂亮的提醒气泡（60 秒查一次，看过就消失）
  var pillOff = false;
  function replyPill() {
    if (!A.wallets || !A.wallets.silent || /feedback/.test(location.hash)) return;
    A.wallets.silent().then(function (acc) {
      if (!acc) return; acc = String(acc).toLowerCase();
      var seen = 0; try { seen = Number(localStorage.getItem("fb:seen:" + acc) || 0); } catch (e) {}
      return fetch("/api/feedback?mine=" + acc + fbPq(acc)).then(function (r) { return r.json(); }).then(function (j) {
        var fresh = (j.list || []).filter(function (t) { return t.note && t.up > seen; });
        if (!fresh.length || document.getElementById("fb-pill") || pillOff) return;
        var t = fresh[0], el = document.createElement("a"); el.id = "fb-pill"; el.className = "fb-pill"; el.href = "#/feedback/" + t.id;
        el.innerHTML = '<span class="fb-pill-i">💬</span><span class="fb-pill-t"><b>客服回复了你的工单 #' + t.id + "</b><small>" + esc(String(t.note).slice(0, 40)) + (t.note.length > 40 ? "…" : "") + '</small></span><span class="fb-pill-go">查看 ›</span><span class="fb-pill-x" role="button" aria-label="关掉">✕</span>';
        document.body.appendChild(el);
        // 站长 2026-11-19：气泡要能直接关掉。点 ✕ = 这些回复都算看过了，不再弹；有新回复才会再出来
        var x = el.querySelector(".fb-pill-x");
        if (x) x.onclick = function (ev) {
          ev.preventDefault(); ev.stopPropagation(); pillOff = true; el.remove();
          try { var mx = Math.max.apply(null, [0].concat((j.list || []).map(function (q) { return q.up || 0; }))); if (mx) { localStorage.setItem("fb:seen:" + acc, String(mx)); pillOff = false; } } catch (e) { /* 本机存不上：这次打开期间不再弹 */ }
        };
      });
    }).catch(function () {});
  }
  setTimeout(replyPill, 3500); setInterval(replyPill, 60000);
  // ===== 站长后台 =====
  // #/feedback/admin          工单列表（每 20 秒自动刷新，有新工单响一声、标红）
  // #/feedback/admin/<编号>   单张工单：看截图 → 写回复 → 「确认已处理」→ 自动跳下一张待处理
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  // 📲 这台设备接收站长提醒（2026-11-19）：iPhone 桌面 App 里没有钱包、OKX 钱包里弹不了通知，所以用后台口令给设备开。开过就不再显示这一行
  function pushRow() {
    var on = false; try { on = localStorage.getItem("fb:ownerpush") === "1"; } catch (e) { /* 读不到就当没开 */ }
    return on ? "" : '<p class="note" id="fb-pushrow">📲 想让这台设备弹出站长提醒（大奖、机器人断线、奖池不够、上线后体检出事）？<button type="button" class="link" id="fb-push">点这里开启</button></p>';
  }
  function ownerPush(btn) {
    var row = document.getElementById("fb-pushrow");
    var fail = function (m) { btn.disabled = false; btn.textContent = "点这里开启"; if (A.errTip) A.errTip(m, btn); else if (row) row.appendChild(document.createTextNode(" " + m)); };
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return fail(/iPhone|iPad/.test(navigator.userAgent) ? "iPhone 要从桌面的 App 图标进来才能开：先把本站「添加到主屏幕」，打开后在入口页的问客服框里输入「工单后台」" : "这个浏览器不支持通知，换 Chrome / Edge / Safari 试试");
    btn.disabled = true; btn.textContent = "开启中…";
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("你没有允许通知。到手机「设置 → 通知」里允许 AiLGNS，再回来点一次");
      return navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; });
    }).then(function (reg) {
      return fetch("/api/push").then(function (r) { return r.json(); }).then(function (j) {
        if (!j.pub) throw new Error("服务器没准备好，稍后再试");
        var raw = atob(j.pub.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(j.pub.length / 4) * 4, "=")), k = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) k[i] = raw.charCodeAt(i);
        return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k }); });
      });
    }).then(function (sub) {
      return fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: key(), sub: sub.toJSON() }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (j.error) throw new Error(j.error);
      try { localStorage.setItem("fb:ownerpush", "1"); } catch (e) { /* 存不上只是下次还显示这一行 */ }
      if (row) row.textContent = j.test && !j.test.ok ? "✅ 这台设备已登记，但测试通知没发出去（" + (j.test.status || j.test.err || "未知") + "），稍后再点一次试试" : "✅ 这台设备已开启站长提醒。刚发了一条测试通知，看看弹出来没有";
    }).catch(function (e) { fail(String((e && e.message) || e)); });
  }
  var adTimer = null, adSeen = null, nagTimer = null, titleTimer = null, baseTitle = document.title;
  // 右上角铃铛：固定在页面右上角，显示待处理数；有 0/1 级没处理就按级别节奏响一声 + 标题闪烁 + 浏览器通知（站长开着这一页就够了，不用开新页）
  var NAG = { 0: 60e3, 1: 300e3, 2: 1800e3, 3: 6 * 3600e3 };
  function bellEl() {
    var b = document.getElementById("fb-bell");
    if (!b) { b = document.createElement("a"); b.id = "fb-bell"; b.className = "fb-bell"; b.href = "#/feedback/admin"; b.innerHTML = '<span class="fb-bi">🔔</span><i class="fb-bn" hidden></i>'; document.body.appendChild(b); b.onclick = bellGo; }
    return b;
  }
  // 工单 #324（2026-11-19）：「点了没反应这个铃铛」。铃铛原来只是一个指向 #/feedback/admin 的链接，人已经在后台这一页，点了网址不变，所以什么都不发生。
  // 现在：在后台点铃铛 = 切到「待处理」→ 滚到最紧急的那一张并闪一下；一张待处理都没有就说一声
  var lastP = null;
  function bellGo(e) {
    if (!/feedback\/admin/.test(location.hash)) return; // 不在后台：照常跳过去
    e.preventDefault();
    var find = function (tries) {
      var id = lastP && lastP.top && lastP.top.id, el = (id && document.querySelector('.fb-tk[data-id="' + id + '"]')) || document.querySelector(".fb-tk[data-id]");
      if (!el && tries > 0) return setTimeout(function () { find(tries - 1); }, 400);
      // 直接跳过去，不用「慢慢滚」的动画：上线后核对时，带动画的滚动有一次根本没动（页面没在画面上时浏览器会把动画停掉），老的钱包浏览器也不一定认
      var jump = function (x) { try { x.scrollIntoView({ block: "center" }); } catch (e2) { x.scrollIntoView(); } };
      if (!el) { el = document.getElementById("fb-seg"); if (el) jump(el); return; }
      jump(el);
      el.classList.add("fb-flash"); setTimeout(function () { el.classList.remove("fb-flash"); }, 1800);
    };
    if (lastP && !lastP.n) { var b = document.getElementById("fb-bell"); if (b && A.errTip) A.errTip("现在没有待处理的工单", b); }
    var seg = document.querySelector('#fb-seg button[data-s="new"]');
    if (seg && seg.className.indexOf("on") < 0) { seg.click(); setTimeout(function () { find(8); }, 500); } else find(8);
  }
  function bellPaint(p) {
    lastP = p || null;
    var b = bellEl(), n = (p && p.n) || 0, lv = p && p.top ? p.top.lv : 3;
    b.querySelector(".fb-bn").hidden = !n; b.querySelector(".fb-bn").textContent = n; b.className = "fb-bell" + (n ? " has lv" + lv : "");
    b.title = n ? "待处理 " + n + " 张，最紧急：" + (p.top.topic || "") : "没有待处理工单";
    clearInterval(titleTimer); document.title = baseTitle;
    if (n && lv <= 1) { var on = false; titleTimer = setInterval(function () { on = !on; document.title = on ? "（" + n + "）⚠️ 待处理工单" : baseTitle; }, 1000); }
  }
  var lastNag = 0, lastTop = 0;
  function nag(p) {
    if (!p || !p.n) return;
    var lv = p.top ? p.top.lv : 2, gap = NAG[lv] || NAG[2], now = Date.now();
    if (p.top && p.top.id !== lastTop) { lastTop = p.top.id; lastNag = 0; } // 来了更紧急的新单：立刻响
    if (now - lastNag < gap) return;
    lastNag = now; beep();
    if ("Notification" in window && Notification.permission === "granted") { try { new Notification("📮 待处理工单 " + p.n + " 张", { body: (p.top ? ["🚨 资金安全", "🔴 交易故障", "🟠 功能问题", "🟢 咨询建议"][lv] + "：#" + p.top.id + " " + (p.top.topic || "") : ""), tag: "fb-nag" }); } catch (e) {}
    }
  }
  function pendingPoll() {
    fetch("/api/feedback?pending=1" + fbPq()).then(function (r) { return r.json(); }).then(function (p) { bellPaint(p); nag(p); }).catch(function () {});
  }
  function startNag() { clearInterval(nagTimer); pendingPoll(); nagTimer = setInterval(pendingPoll, 30000); }
  if (/feedback\/admin/.test(location.hash)) setTimeout(startNag, 500);
  window.addEventListener("hashchange", function () { if (/feedback\/admin/.test(location.hash)) startNag(); else { clearInterval(nagTimer); clearInterval(titleTimer); if (/⚠️/.test(document.title)) document.title = baseTitle; /* 只在标题正闪着提醒时才还原；以前每次换页都还原，标签标题就一直停在第一个打开的页面上 */ var b = document.getElementById("fb-bell"); if (b) b.remove(); } });
  function beep() { try { var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.value = 0.08; o.start(); setTimeout(function () { o.stop(); c.close(); }, 250); } catch (e) {} }
  function api(q) { return fetch("/api/feedback?" + q + "&key=" + encodeURIComponent(key()) + fbPq()).then(function (r) { return r.json(); }); }
  function imgUrl(id, i) { return "/api/feedback?img=" + id + ":" + i + "&key=" + encodeURIComponent(key()) + fbPq(); }
  function card(t, one) {
    var ims = ""; for (var i = 0; i < t.n; i++) ims += '<a href="' + imgUrl(t.id, i) + '" target="_blank"><img loading="lazy" src="' + imgUrl(t.id, i) + '"></a>';
    if (t.v) ims += '<a class="fb-vbtn" href="/api/feedback?vid=' + t.id + "&key=" + encodeURIComponent(key()) + fbPq() + '" target="_blank" rel="noopener">▶ 看客户的视频' + (t.vs ? "（" + Math.max(1, Math.round(t.vs / 1048576)) + " MB）" : "") + "</a>"; // 站长 2026-11-17：客户随工单传的录屏，新开一页播放
    var s = ST[t.st] || ST["new"], tr = t.tri, lv = tr ? LV[tr.lv] : null;
    return '<div class="fb-tk lv' + (tr ? tr.lv : 2) + (t.vip ? " fb-vip" : "") + '" data-id="' + t.id + '"><div class="fb-tkh"><b>#' + t.id + '</b> <small class="muted">' + tm(t.t) + '</small> ' + (t.vip ? '<span class="fb-tag" style="background:#b45309">⭐ ' + esc(t.vip) + ' · 站长亲审</span> ' : "") + '<span class="fb-tag" style="background:' + s[1] + '">' + s[0] + "</span>" + (lv ? '<span class="fb-tag" style="background:' + lv[1] + '">' + lv[0] + (tr.dup > 1 ? " · " + tr.dup + " 人同问" : "") + "</span>" : '<span class="fb-tag" style="background:#9ca3af">分诊中</span>') +
      (one ? "" : ' <a href="#/feedback/admin/' + t.id + '">打开处理 →</a>') + "</div>" +
      '<div class="fb-addr"><span class="mono">' + t.a + '</span> <button type="button" class="ghost" data-cp="' + t.a + '">复制</button> <a href="#/scan/' + t.a + '" target="_blank" rel="noopener">📒 看他的账本 ↗</a></div>' +
      (tr ? '<p class="fb-tri muted">🤖 ' + esc(tr.topic || "") + (tr.why ? " · " + esc(tr.why) : "") + "</p>" : "") +
      '<p class="fb-txt">' + esc(t.txt || "（只有截图）") + "</p>" + (ims ? '<div class="fb-ims">' + ims + "</div>" : "") + (t.bot ? '<p class="fb-reply fb-bot">🤖 机器人已初步答复：' + esc(t.bot) + "</p>" : "") +
      '<textarea rows="' + (one ? 4 : 2) + '" placeholder="回复客户（客户在反馈页面能看到；绑定了 DeBox 的还会收到私信）">' + esc(t.note || "") + "</textarea>" +
      '<div class="fb-rim"><label class="fb-rimpick">🖼️ 附图给客户<input type="file" accept="image/*" multiple hidden data-rfile></label><span class="muted">最多 4 张。截完图直接在回复框里粘贴（Ctrl / ⌘ + V）就行，也可以把图拖进来</span><div class="fb-ims fb-rimth" data-rth></div>' +
      (t.rn ? '<div class="fb-ims">' + Array.apply(null, Array(t.rn)).map(function (_, i) { return '<a href="' + imgUrl(t.id, "r" + i) + '" target="_blank"><img loading="lazy" src="' + imgUrl(t.id, "r" + i) + '" title="上次回复附的图"></a>'; }).join("") + "</div>" : "") + "</div>" +
      '<div class="fb-act"><button type="button" class="nm-go" data-set="done">✅ 确认已处理并回复</button><button type="button" class="ghost" data-set="doing">先标处理中</button><button type="button" class="ghost" data-set="save">只保存回复</button>' + (t.st === "skip" ? '<button type="button" class="ghost" data-set="new">恢复为待处理</button>' : '<button type="button" class="ghost" data-set="skip">标为无效</button>') + "</div></div>";
  }
  function bindCards(box, after) {
    box.querySelectorAll("[data-cp]").forEach(function (b) { b.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(b.getAttribute("data-cp")); b.textContent = "已复制"; }; });
    // 回复附图：每张卡自己一组，选图后缩略图可删，发送时一起带上
    box.querySelectorAll("[data-rfile]").forEach(function (f) {
      var cd = f.closest(".fb-tk"), th = cd.querySelector("[data-rth]"); cd._rimgs = cd._rimgs || [];
      function draw() { th.innerHTML = cd._rimgs.map(function (u, i) { return '<div class="fb-t"><img src="' + u + '"><button type="button" data-rrm="' + i + '">✕</button></div>'; }).join(""); th.querySelectorAll("[data-rrm]").forEach(function (x) { x.onclick = function () { cd._rimgs.splice(Number(x.getAttribute("data-rrm")), 1); draw(); }; }); }
      function add(list) {
        var room = 4 - cd._rimgs.length, fs = list.slice(0, Math.max(0, room));
        if (!fs.length) return A.errTip("最多 4 张", f);
        Promise.all(fs.map(shrink)).then(function (r) { cd._rimgs = cd._rimgs.concat(r); draw(); }, function () { A.errTip("这张图片读不出来，请换一张", f); });
      }
      f.onchange = function () { var fs = Array.prototype.slice.call(f.files || []); f.value = ""; add(fs); };
      // 站长 2026-11-16：电脑上截完图直接在这张工单的回复框里粘贴（Ctrl / ⌘ + V）就附上，不用先存到桌面再选文件；把图拖进这张卡也行
      function imgsOf(dt) {
        var out = [];
        try {
          Array.prototype.forEach.call((dt && dt.items) || [], function (it) { if (it.kind === "file" && /^image\//.test(it.type)) { var x = it.getAsFile(); if (x) out.push(x); } });
          if (!out.length) Array.prototype.forEach.call((dt && dt.files) || [], function (x) { if (/^image\//.test(x.type)) out.push(x); });
        } catch (e) {}
        return out;
      }
      cd.addEventListener("paste", function (e) { var fs = imgsOf(e.clipboardData); if (fs.length) { e.preventDefault(); add(fs); } }); // 粘贴的是文字就照常进输入框
      cd.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
      cd.addEventListener("drop", function (e) { var fs = imgsOf(e.dataTransfer); if (fs.length) { e.preventDefault(); add(fs); } });
    });
    box.querySelectorAll("[data-set]").forEach(function (b) {
      b.onclick = function () {
        var cd = b.closest(".fb-tk"), s = b.getAttribute("data-set"), note = cd.querySelector("textarea").value.trim(), body = { key: key(), action: "set", id: Number(cd.getAttribute("data-id")), note: note }, sg = fbSig();
        if (sg) { body.pa = sg.a; body.pts = sg.ts; body.psig = sg.sig; }
        if (cd._rimgs && cd._rimgs.length) body.rimgs = cd._rimgs;
        if (s === "done" && !note && !confirm("还没写回复，确定直接标「已解决」吗？")) return;
        if (s !== "save") body.st = s;
        b.disabled = true;
        fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (j2) {
          b.disabled = false;
          if (j2.error) return A.errTip(j2.error, b);
          if (s === "save") { b.textContent = "已保存 ✓"; return; }
          after(cd, s);
        }, function () { b.disabled = false; A.errTip("网络不好，再点一次", b); });
      };
    });
  }
  function login(rid, msg) {
    A.app.innerHTML = '<section class="card fb-login"><h2>📮 工单后台</h2><p class="muted">输入后台口令，只存在这台设备上，以后打开直接进。</p>' +
      '<div class="fb-row"><input id="fb-k" type="password" placeholder="粘贴口令" autocomplete="current-password" autocapitalize="off" spellcheck="false"><button type="button" class="ghost" id="fb-eye" aria-label="显示口令">👁</button><button type="button" class="nm-go" id="fb-kgo">进入</button></div>' +
      '<p id="fb-kmsg" class="fb-kmsg' + (msg ? " err" : "") + '">' + esc(msg || "") + "</p></section>";
    var inp = document.getElementById("fb-k"), go = document.getElementById("fb-kgo"), tip = document.getElementById("fb-kmsg");
    document.getElementById("fb-eye").onclick = function () { inp.type = inp.type === "password" ? "text" : "password"; inp.focus(); };
    function submit() {
      var k = inp.value.trim();
      if (!k) { tip.className = "fb-kmsg err"; tip.textContent = "口令是空的，先粘贴再点进入"; inp.focus(); return; }
      go.disabled = true; tip.className = "fb-kmsg"; tip.textContent = "核对中…";
      fetch("/api/feedback?list=1&st=new&key=" + encodeURIComponent(k)).then(function (r) { return r.json(); }).then(function (j) {
        go.disabled = false;
        if (j.error) { tip.className = "fb-kmsg err"; tip.textContent = "口令不对。后台认 Cloudflare 里的 FEEDBACK_KEY（或 BACKUP_KEY），请核对后整段粘贴。"; inp.select(); return; }
        try { localStorage.setItem("fbKey", k); } catch (e) {}
        admin(rid);
      }, function () { go.disabled = false; tip.className = "fb-kmsg err"; tip.textContent = "网络没通，再点一次"; });
    }
    go.onclick = submit;
    inp.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } };
    setTimeout(function () { inp.focus(); }, 50);
  }
  function fm(v, d) { return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
  function statsHtml(j) {
    var t = j.totals, rows = j.rows, td = rows[0] || {}, y = rows[1] || {};
    var pend = '<p class="muted">数据更新于 ' + tm(j.at || j.walletsAt) + '，每 5 分钟自动更新一次' + (j.pending ? '；还有 ' + j.pending + ' 天历史在后台补算' : "") + '</p>';
    var tile = function (k, v, sub, cls) { return '<div class="ad-tile' + (cls ? " " + cls : "") + '"><small>' + k + "</small><b>" + v + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>"; };
    // 💰 留存口径（站长 2026-11-12：不要毛收入）：只算真留在谷歌社交账号钱包里的钱，三种币分开写、不折算；数据和合伙人面板同一份
    var K = j.keep || {}, KS = { dai: 0, ail: 0, lgns: 0 }, KN = 0, KP = 0;
    rows.forEach(function (r) { var P = K[r.day]; if (!P) return; KN++; KP += P.pool || 0; ["dai", "ail", "lgns"].forEach(function (k) { KS[k] += P.all[k] || 0; }); });
    var kd = function (o, k, d) { return o ? fm(o[k], d) : "—"; };
    var keepTile = function (name, o, cls) { return o ? tile(name, fm(o.dai, Math.abs(o.dai) >= 100 ? 0 : 2) + " DAI", "另有 " + fm(o.ail, 4) + " AiLGNS · " + fm(o.lgns, 0) + " LGNS", cls) : tile(name, "—", "正在从链上数", cls); };
    var h = pend + '<div class="ad-tiles">' +
      tile("今日成交额", fm(td.fillDai, 0) + " DAI", td.fills + " 笔 · 昨日 " + fm(y.fillDai, 0), "big") +
      keepTile("今日留存（真到钱包的）", K[td.day] && K[td.day].all, "big money") +
      keepTile("昨日留存", K[y.day] && K[y.day].all, "big money") +
      tile("今日域名销售", td.nmN + " 个", fm(td.nmDai, 0) + " DAI") +
      tile("今日新装 App", td.an + " 台", "桌面打开 " + td.a1 + " 次") +
      tile("今日访问", fm(td.v, 0) + " 次", td.v1 + " 人首次 · 查询 " + td.q + " 次") +
      keepTile("近 " + KN + " 天留存合计", KN ? KS : null, "money") +
      tile("近 " + KN + " 天已转奖池", fm(KP, 0) + " DAI", "域名的钱里转给预言家奖池 / 极速资金池的，不算留存", "money") +
      tile("总成交额", fm(t.fillDai, 0) + " DAI", t.fills + " 笔 · 挂单 " + t.orders + " 张") +
      tile("累计装机", t.installs + " 台", "最近 " + rows.length + " 天") + "</div>";
    h += '<h3 class="ad-h">🏦 钱托管在哪（链上实时，每 2 分钟刷新）</h3><div class="ad-wal">' + j.wallets.map(function (w) {
      var toks = Object.keys(w.tok).map(function (s) { return "<b>" + fm(w.tok[s], s === "LGNS" ? 0 : 2) + "</b> " + s; });
      if (w.gas) toks.unshift("<b>" + fm(w.gas) + "</b> DAI(Gas)");
      return '<div class="ad-w"><div><b>' + esc(w.name) + '</b> <small class="muted">' + esc(w.note) + '</small><br><a class="mono" href="#/scan/' + w.a + '">' + w.a.slice(0, 8) + "…" + w.a.slice(-6) + "</a></div><div class=\"ad-wb\">" + (toks.length ? toks.join(" · ") : '<span class="muted">0</span>') + "</div></div>";
    }).join("") + "</div>";
    h += '<h3 class="ad-h">📅 每日明细（北京时间，最近 ' + rows.length + ' 天）</h3><div class="ad-tw"><table class="ad-t"><thead><tr><th>日期</th><th>成交额</th><th>笔数</th><th>域名</th><th>留存 DAI</th><th>留存 AiLGNS</th><th>留存 LGNS</th><th>新装</th><th>访问</th><th>首次</th></tr></thead><tbody>' +
      rows.map(function (r) { if (r.pending) return "<tr><td>" + r.day.slice(5) + '</td><td colspan="9" class="muted">计算中…</td></tr>'; return "<tr><td>" + r.day.slice(5) + "</td><td>" + fm(r.fillDai, 0) + "</td><td>" + r.fills + "</td><td>" + r.nmN + "</td><td><b>" + kd(K[r.day] && K[r.day].all, "dai", 0) + "</b></td><td>" + kd(K[r.day] && K[r.day].all, "ail", 4) + "</td><td>" + kd(K[r.day] && K[r.day].all, "lgns", 0) + "</td><td>" + r.an + "</td><td>" + r.v + "</td><td>" + r.v1 + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="muted">成交额 = OTC 四个市场成交（DAI 计）。留存 = 真留在谷歌社交账号钱包里的钱，从链上一笔一笔数出来：OTC 手续费 + 域名的钱（减掉转给奖池的）+ 会员费 + 其它；收到什么币就写什么币，不折算、不估算，和合伙人面板是同一份数。显示「—」的日子还没从链上数。装机 = 第一次从手机桌面图标打开的设备数；访问 = 打开网站次数 / 当天首次打开的人数。</p>';
    return h;
  }
  var adminSt = "";
  function admin(rid, st) {
    clearInterval(adTimer);
    if (!key()) return login(rid);
    var m = location.hash.match(/feedback\/admin\/(\d+)/);
    if (m) return one(rid, Number(m[1]));
    if (/feedback\/admin\/stats/.test(location.hash)) { location.replace("#/partner"); return; } // 旧的数据面板网址已发给合伙人：直接换成合伙人面板（#/partner，用同一个口令也能进）
    st = st || "new"; adminSt = st;
    A.app.innerHTML = '<section class="card"><div class="card-head"><h2>📮 工单后台<span id="fb-nw"></span></h2><span>' + ("Notification" in window && Notification.permission !== "granted" ? '<button type="button" class="ghost" id="fb-notify">开启桌面通知</button> ' : "") + '<button type="button" class="ghost" id="fb-out">退出</button></span></div>' +
      '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb' + (st === "stats" ? "" : " on") + '" data-s="new">📮 工单</a><a href="#/partner" class="ad-nb">📊 数据面板</a><a href="#/ops" class="ad-nb">🛠️ 网站优化</a><a href="#/todo" class="ad-nb">📝 待办</a><a href="#/med" class="ad-nb">💊 吃药</a></div>' +
      '<div id="fb-says"></div>' + pushRow() +
      '<p class="muted">AI 已分诊：🚨 资金安全 › 🔴 交易故障 / 多人同问 › 🟠 功能问题 › 🟢 咨询建议，按这个顺序排；无效的自动归到「无效」栏。每 20 秒刷新，有新工单响一声。</p><div class="seg" id="fb-seg">' + ["new", "doing", "done", "skip"].map(function (s2) { return '<button type="button" data-s="' + s2 + '"' + (s2 === st ? ' class="on"' : "") + ">" + ST[s2][0] + "</button>"; }).join("") + '<button type="button" data-s="err"' + (st === "err" ? ' class="on"' : "") + '>🐞 程序报错</button><button type="button" data-s="chat">💬 咨询</button><button type="button" data-s="kb">📚 知识</button><button type="button" data-s="stats"' + (st === "stats" ? ' class="on"' : "") + '>📊 数据</button></div><div id="fb-list"><p class="muted">读取中…</p></div></section>';
    document.querySelectorAll("#fb-seg button").forEach(function (b) { b.onclick = function () { admin(rid, b.getAttribute("data-s")); }; });
    document.querySelectorAll(".ad-nb").forEach(function (b) { b.onclick = function (e) { e.preventDefault(); location.hash = b.getAttribute("href"); admin(rid, b.getAttribute("data-s")); }; });
    document.getElementById("fb-out").onclick = function () { try { localStorage.removeItem("fbKey"); } catch (e) {} admin(rid); };
    var nb = document.getElementById("fb-notify"); if (nb) nb.onclick = function () { Notification.requestPermission().then(function () { admin(rid, st); }); };
    var pb = document.getElementById("fb-push"); if (pb) pb.onclick = function () { ownerPush(pb); };
    // 📣 预言家中奖待认证（站长 2026-11-14）：中奖人交了 DeBox 宣告帖 → 这里点「通过」→ 机器人才发奖
    function says() {
      var sb = document.getElementById("fb-says"); if (!sb) return;
      var KN = { king: "贡献王", closest: "天眼通", second: "地灵通", jackpot: "神算子大奖", daily: "每日前三", week: "OTC 周榜" };
      var postTo = function (url, o) { o.key = key(); return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(function (r) { return r.json(); }); };
      var post = function (o) { o.key = key(); return fetch("/api/oracle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(function (r) { return r.json(); }); };
      // 🏆 周榜的奖（站长 2026-11-22 超过 100 DAI 的，2026-11-23 起所有上榜的）也要交宣传截图 / 视频、等这里点「通过」：和预言家的并在一起显示（周榜那边读不到不影响预言家）
      Promise.all([post({ action: "says" }), postTo("/api/weekly", { action: "says" }).catch(function () { return null; })]).then(function (rs) {
        var j = rs[0], L = ((j && j.list) || []).concat((rs[1] && rs[1].list) || []);
        if (!L.length) { sb.innerHTML = ""; return; }
        sb.innerHTML = '<div class="fb-say"><b>🏆 中奖待认证 · 预言家 / 周榜（' + L.length + ' 笔）</b><small>中奖人在群里说一声并上传截图 / 视频 → 你点开看一眼 → 点「通过」→ 机器人自动发奖。不点就不发。</small>' + L.map(function (x, i) {
          var burnOk = x.bn >= x.need, stT = x.ok ? (burnOk ? "✅ 已通过，机器人马上发" : "✅ 已通过，等他烧够名字（" + x.bn + "/" + x.need + "）") : x.has ? (burnOk ? "🔎 等你认证" : "🔎 凭证已交，名字还没烧够（" + x.bn + "/" + x.need + "）") : burnOk ? "📣 名字烧够了，等他上传截图 / 视频" : "⏳ 等他烧名字（" + x.bn + "/" + x.need + "）和上传凭证";
          return '<div class="fb-say-r"><span><b>' + esc(x.name) + "</b> · " + esc(x.day) + " · " + (KN[x.kind] || esc(x.kind)) + " · <b>" + Number(x.amt).toLocaleString("en-US") + " DAI</b></span><span>" + stT + "</span>" +
            (x.shots || x.video ? '<span class="fb-say-pv">' + (x.shots ? Array.apply(null, Array(x.shots)).map(function (_, n) { return '<button type="button" class="ghost" data-pv="' + i + '" data-n="' + n + '">🖼 看截图 ' + (n + 1) + "</button>"; }).join("") : "") + (x.video ? '<button type="button" class="ghost" data-pv="' + i + '" data-v="1">▶ 看视频</button>' : "") + "</span>" : "") +
            (x.say ? '<a href="' + esc(x.say) + '" target="_blank" rel="noopener">👉 打开他的 DeBox 宣告帖 ↗</a>' : "") +
            (!burnOk && x.src !== "week" ? '<button type="button" class="ghost" data-fix="' + i + '">🩹 他用别的钱包烧的？补认销毁</button>' : "") +
            (x.ok ? '<button type="button" class="ghost" data-i="' + i + '" data-ok="0">撤回通过</button>' : x.has ? '<button type="button" class="nm-go" data-i="' + i + '" data-ok="1">✅ 通过，发奖</button>' : burnOk ? '<small>他还没在网站上传截图 / 视频。你已经在群里亲眼看到他说了，也可以直接通过：</small><button type="button" class="ghost" data-i="' + i + '" data-ok="1">🖐 我已看到他的宣告，手动通过，发奖</button>' : "") + "</div>";
        }).join("") + "</div>";
        // 🖼 / ▶ 看凭证：口令走请求正文，拿回来的图 / 视频放进一个盖在页面上的浮层里（后台每 20 秒刷新，浮层不受影响）
        sb.querySelectorAll("button[data-pv]").forEach(function (bt) {
          bt.onclick = function () {
            var x = L[Number(bt.getAttribute("data-pv"))], isV = bt.getAttribute("data-v") === "1", old = bt.textContent;
            bt.disabled = true; bt.textContent = "读取中…";
            var done = function () { bt.disabled = false; bt.textContent = old; };
            fetch("/api/oracle-proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(isV ? { action: "view", key: key(), id: x.id, video: 1 } : { action: "view", key: key(), id: x.id, n: Number(bt.getAttribute("data-n")) }) })
              .then(function (r) { if (isV && r.ok && !/json/.test(r.headers.get("content-type") || "")) return r.blob().then(function (b) { return { url: URL.createObjectURL(b) }; }); return r.json(); })
              .then(function (j) {
                done();
                if (!j || j.error) return alert((j && j.error) || "没读出来，请再点一次");
                var o = document.getElementById("fb-pvo"); if (o) o.remove();
                o = document.createElement("div"); o.id = "fb-pvo"; o.className = "fb-pvo";
                o.innerHTML = '<div class="fb-pvb"><div class="fb-pvh"><b>' + esc(x.name) + " · " + esc(x.day) + " · " + Number(x.amt).toLocaleString("en-US") + ' DAI</b><button type="button" class="ghost" id="fb-pvx">关闭</button></div>' + (isV ? '<video controls playsinline autoplay src="' + j.url + '"></video>' : '<img alt="领奖凭证截图" src="' + j.img + '">') + "</div>";
                document.body.appendChild(o);
                var close = function () { if (isV) { try { URL.revokeObjectURL(j.url); } catch (e) {} } o.remove(); };
                document.getElementById("fb-pvx").onclick = close; o.onclick = function (e) { if (e.target === o) close(); };
              }, function () { done(); alert("没读出来，网络不好，请再点一次"); });
          };
        });
        // 🩹 补认销毁：中奖人拿别的钱包把名字烧了，系统只认中奖钱包烧的。填上「烧名字的那个钱包」→ 先让服务器查一遍给你看 → 你确认 → 记到这笔奖上（奖仍然只发到中奖钱包）
        sb.querySelectorAll("button[data-fix]").forEach(function (bt) {
          bt.onclick = function () {
            var x = L[Number(bt.getAttribute("data-fix"))], from = (prompt("他是用哪个钱包烧的名字？把那个钱包地址贴进来（0x 开头）\n" + x.name + " · " + x.amt + " DAI") || "").trim();
            if (!from) return;
            bt.disabled = true;
            post({ action: "burnfix", id: x.id, from: from }).then(function (r) {
              if (!r || r.error) { bt.disabled = false; return alert((r && r.error) || "没查出来，请再点一次"); }
              var what = (r.hit || []).map(function (h) { return h.no ? "创世 #" + h.no : "名字"; }).join("、");
              if (!confirm("查到了：这个钱包在开奖后烧了 " + what + "。\n把它记到「" + x.name + " · " + x.amt + " DAI」这笔奖上？\n\n· 奖仍然只发到中奖的那个钱包\n· 记上去以后，这枚名字不能再抵别的奖\n· 记上去改不回来")) { bt.disabled = false; return; }
              return post({ action: "burnfix", id: x.id, from: from, go: 1 }).then(function (r2) { alert(r2 && r2.ok ? "记好了（" + r2.n + "/" + r2.need + "）。" + (r2.st === "ready" ? "机器人马上发奖。" : "他上传截图 / 视频、通过以后机器人发奖。") : (r2 && r2.error) || "没记上，请再点一次"); says(); });
            }).catch(function () { bt.disabled = false; alert("网络不好，请再点一次"); });
          };
        });
        sb.querySelectorAll("button[data-i]").forEach(function (bt) {
          bt.onclick = function () {
            var x = L[Number(bt.getAttribute("data-i"))], ok = bt.getAttribute("data-ok") === "1";
            if (ok && !confirm((x.has ? "确认通过？" : "他还没在网站上传截图 / 视频。\n确认你已经在群里亲眼看到他说自己中奖了？") + "\n" + x.name + " · " + x.amt + " DAI\n通过后机器人会自动把奖金发给他，发出去收不回。")) return;
            bt.disabled = true;
            (x.src === "week" ? postTo("/api/weekly", { action: "approve", id: x.id, ok: ok }) : post({ action: "approve", id: x.id, ok: ok })).then(function (r) { if (r.error) alert(r.error); says(); }, function () { bt.disabled = false; });
          };
        });
      }, function () {});
    }
    try { says(); } catch (e) {}
    function load(first) {
      var box = document.getElementById("fb-list"); if (!box) return clearInterval(adTimer);
      if (!first && box.querySelector("textarea:focus")) return; // 正在写回复：不刷新
      if (st === "stats") { // 📊 站长数据面板：成交、域名、装机、访问、收入、钱包
        if (!first) return; // 不用 20 秒刷新
        fetch("/api/admin-stats?key=" + encodeURIComponent(key())).then(function (r) { return r.json(); }).then(function (j) {
          if (j.error && /口令/.test(j.error)) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, "口令失效或不对，请重新输入"); }
          if (j.error) { box.innerHTML = '<p class="nm-bad">' + esc(j.error) + "</p>"; return; }
          (document.getElementById("fb-seg") || {}).innerHTML = /* 已离开工单页时不报错 */ ["new", "doing", "done", "skip"].map(function (s) { return '<button type="button" data-s="' + s + '">' + ST[s][0] + "</button>"; }).join("") + '<button type="button" data-s="err">🐞 程序报错</button><button type="button" data-s="chat">💬 咨询</button><button type="button" data-s="kb">📚 知识</button><button type="button" data-s="stats" class="on">📊 数据</button>';
          document.querySelectorAll("#fb-seg button").forEach(function (b) { b.onclick = function () { admin(rid, b.getAttribute("data-s")); }; });
          try { box.innerHTML = statsHtml(j); } catch (e) { box.innerHTML = '<p class="nm-bad">面板渲染出错：' + esc(e.message) + "</p>"; }

        }).catch(function (e) { box.innerHTML = '<p class="nm-bad">数据读取失败：' + esc(e.message || e) + '，<a href="#/feedback/admin/stats" onclick="location.reload()">点这里重试</a></p>'; });
        box.innerHTML = '<p class="muted">读取中…</p>';
        return;
      }
      if (st === "kb") { // 📚 知识补充（站长 2026-11-15）：这里写一条，AI 客服（两个模型）1 分钟内就知道
        if (document.getElementById("kbx-t")) return; /* 已经画好了：后台每 20 秒自动刷新，这一栏不跟着重画，免得把正在打的字清掉 */
        var kbDraw = function (j) {
          if (!document.getElementById("fb-seg")) return; /* 已离开工单页 */
          if (j.error && /口令/.test(j.error)) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, "口令失效或不对，请重新输入"); }
          var l = j.list || [];
          box.innerHTML = '<div class="fb-tk"><p><b>📚 给 AI 客服补一条知识</b></p><p class="muted">写一条，客服 1 分钟内就会按它回答（大陆 / 香港和其它地区的客服都读同一份）。和原来的知识有出入时，以这里为准。<b>只写能公开的事</b>：这里的每一句，客服都可能原样说给客户。</p>' +
            '<textarea id="kbx-t" rows="3" maxlength="300" placeholder="例如：11 月 20 日起，预言家改成晚上 8 点揭晓。"></textarea>' +
            '<p><button type="button" class="nm-go" id="kbx-add">➕ 加这一条</button> <span id="kbx-st" class="muted">' + (j.error ? '<b class="nm-bad">' + esc(j.error) + "</b>" : "最多 " + (j.max || 40) + " 条，每条 " + (j.len || 300) + " 字；现在 " + l.length + " 条") + "</span></p></div>" +
            (l.length ? l.map(function (x) { return '<div class="fb-tk lv2"><div class="fb-tkh"><small class="muted">' + tm(x.t) + '</small> <button type="button" class="ghost" data-kbdel="' + x.t + '" style="float:right;padding:2px 10px">删除</button></div><p class="fb-txt">' + esc(x.text) + "</p></div>"; }).join("") : '<p class="muted">还没有补充。过时的记得删掉，免得客服拿旧话回答。</p>');
          var send = function (o) { o.key = key(); var s3 = document.getElementById("kbx-st"); if (s3) s3.textContent = "保存中…"; return fetch("/api/kb", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(function (r) { return r.json(); }).then(function (r) { if (r.error) { var s4 = document.getElementById("kbx-st"); if (s4) s4.innerHTML = '<b class="nm-bad">' + esc(r.error) + "</b>"; return; } kbDraw(r); }, function () { var s5 = document.getElementById("kbx-st"); if (s5) s5.innerHTML = '<b class="nm-bad">没保存上，网络不好，再点一次</b>'; }); };
          var ab = document.getElementById("kbx-add"); if (ab) ab.onclick = function () { var t = document.getElementById("kbx-t"); if (t && t.value.trim()) send({ add: t.value }); };
          box.querySelectorAll("[data-kbdel]").forEach(function (b) { b.onclick = function () { if (confirm("删掉这一条？客服就不再按它回答了。")) send({ del: b.getAttribute("data-kbdel") }); }; });
        };
        fetch("/api/kb?key=" + encodeURIComponent(key())).then(function (r) { return r.json(); }).then(kbDraw).catch(function () { box.innerHTML = '<p class="muted">读取失败</p>'; });
        (document.getElementById("fb-seg") || {}).innerHTML = ["new", "doing", "done", "skip"].map(function (s) { return '<button type="button" data-s="' + s + '">' + ST[s][0] + "</button>"; }).join("") + '<button type="button" data-s="err">🐞 程序报错</button><button type="button" data-s="chat">💬 咨询</button><button type="button" data-s="kb" class="on">📚 知识</button><button type="button" data-s="stats">📊 数据</button>';
        document.querySelectorAll("#fb-seg button").forEach(function (b) { b.onclick = function () { admin(rid, b.getAttribute("data-s")); }; });
        return;
      }
      if (st === "chat") { // 💬 客户和机器人的对话记录：客户都在问什么，按关键词统计
        fetch("/api/chat-log?key=" + encodeURIComponent(key())).then(function (r) { return r.json(); }).then(function (j) {
          if (j.error) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, "口令失效或不对，请重新输入"); }
          var l = j.list || [], KW = ["挂单", "撤单", "成交", "订单", "看不到", "域名", "主名字", "会员", "预言家", "奖池", "借贷", "钱包", "连接", "到账", "手续费", "App", "网址", "打不开", "价格", "卡牌", "扫单", "Gas", "转账", "退回", "报错", "人工"];
          var cnt = {}; l.forEach(function (x) { KW.forEach(function (k) { if ((x.q || "").toLowerCase().indexOf(k.toLowerCase()) >= 0) cnt[k] = (cnt[k] || 0) + 1; }); });
          var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 15);
          var day0 = Date.now() - 86400e3, today = l.filter(function (x) { return x.t > day0; }).length, human = l.filter(function (x) { return x.h; }).length;
          box.innerHTML = '<div class="ad-tiles"><div class="ad-tile"><small>最近 24 小时咨询</small><b>' + today + ' 条</b></div><div class="ad-tile"><small>记录总数</small><b>' + l.length + ' 条</b><span>最多留 400 条</span></div><div class="ad-tile' + (human ? " warn" : "") + '"><small>点了「找人工」</small><b>' + human + ' 次</b></div></div>' +
            (top.length ? '<p class="muted">客户最常问（按关键词）：' + top.map(function (k) { return "<b>" + esc(k) + "</b> " + cnt[k]; }).join(" · ") + "</p>" : "") +
            (l.length ? l.slice(0, 150).map(function (x) { return '<div class="fb-tk lv' + (x.h ? "1" : "2") + '"><div class="fb-tkh"><small class="muted">' + tm(x.t) + " · " + esc(x.page || "/") + (x.c ? " · " + esc(x.c) : "") + (x.w ? ' · <a href="#/scan/' + x.w + '" target="_blank" rel="noopener">' + x.w.slice(0, 6) + "…" + x.w.slice(-4) + "</a>" : " · 没连钱包") + (x.h ? ' · <b style="color:#c6454a">要找人工</b>' : "") + '</small></div><div class="fb-bub me"><small>客户问</small>' + esc(x.q) + '</div>' + (x.a ? '<div class="fb-bub bot"><small>🤖 机器人答</small>' + esc(x.a) + "</div>" : "") + "</div>"; }).join("") : '<p class="muted">还没有咨询记录（从上线这功能起开始记）</p>');
          (document.getElementById("fb-seg") || {}).innerHTML = /* 已离开工单页时不报错 */ ["new", "doing", "done", "skip"].map(function (s) { return '<button type="button" data-s="' + s + '">' + ST[s][0] + "</button>"; }).join("") + '<button type="button" data-s="err">🐞 程序报错</button><button type="button" data-s="chat" class="on">💬 咨询</button><button type="button" data-s="kb">📚 知识</button><button type="button" data-s="stats">📊 数据</button>';
          document.querySelectorAll("#fb-seg button").forEach(function (b) { b.onclick = function () { admin(rid, b.getAttribute("data-s")); }; });
        }).catch(function () { box.innerHTML = '<p class="muted">读取失败</p>'; });
        return;
      }
      if (st === "err") { // 前端自动上报的程序错误（客户看到英文报错时我们这边同步有记录）
        fetch("/api/err?key=" + encodeURIComponent(key())).then(function (r) { return r.json(); }).then(function (j) {
          if (j.error) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, "口令失效或不对，请重新输入"); }
          var l = j.list || [];
          box.innerHTML = l.length ? l.map(function (x) { return '<div class="fb-tk lv2"><div class="fb-tkh"><b>' + esc(x.p || "") + '</b> <small class="muted">' + tm(x.t) + (x.n > 1 ? " · " + x.n + " 次" : "") + (x.v ? " · v" + esc(x.v) : "") + '</small></div><p class="fb-txt mono">' + esc(x.m) + '</p><p class="muted" style="font-size:11.5px">' + esc(x.ua) + "</p></div>"; }).join("") : '<p class="muted">没有程序报错 🎉</p>';
          (document.getElementById("fb-seg") || {}).innerHTML = /* 已离开工单页时不报错 */ ["new", "doing", "done", "skip"].map(function (s) { return '<button type="button" data-s="' + s + '">' + ST[s][0] + "</button>"; }).join("") + '<button type="button" data-s="err" class="on">🐞 程序报错</button><button type="button" data-s="chat">💬 咨询</button><button type="button" data-s="kb">📚 知识</button><button type="button" data-s="stats">📊 数据</button>';
          document.querySelectorAll("#fb-seg button").forEach(function (b) { b.onclick = function () { admin(rid, b.getAttribute("data-s")); }; });
        }).catch(function () { box.innerHTML = '<p class="muted">读取失败</p>'; });
        return;
      }
      api("list=1&st=" + st).then(function (j) {
        if (j.error) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, "口令失效或不对，请重新输入"); }
        var c = j.cnt || {}, maxId = (j.list || []).reduce(function (x, t) { return Math.max(x, t.id); }, 0);
        if (adSeen !== null && st === "new" && maxId > adSeen) { beep(); var nw = document.getElementById("fb-nw"); if (nw) nw.innerHTML = '<span class="fb-new">🔔 新工单</span>'; }
        if (st === "new") adSeen = Math.max(adSeen || 0, maxId);
        (document.getElementById("fb-seg") || {}).innerHTML = /* 已离开工单页时不报错 */ ["new", "doing", "done", "skip"].map(function (s) { return '<button type="button" data-s="' + s + '"' + (s === st ? ' class="on"' : "") + ">" + ST[s][0] + " " + (c[s] || 0) + "</button>"; }).join("") + '<button type="button" data-s="err"' + (st === "err" ? ' class="on"' : "") + '>🐞 程序报错</button><button type="button" data-s="chat">💬 咨询</button><button type="button" data-s="kb">📚 知识</button><button type="button" data-s="stats">📊 数据</button>';
        document.querySelectorAll("#fb-seg button").forEach(function (b) { b.onclick = function () { admin(rid, b.getAttribute("data-s")); }; });
        var l = j.list || [];
        box.innerHTML = l.length ? l.map(function (t) { return card(t, false); }).join("") : '<p class="muted">没有' + ST[st][0] + "的工单 🎉</p>";
        bindCards(box, function (cd) { cd.remove(); });
        if (j.boss === false) box.insertAdjacentHTML("beforeend", '<p class="muted fb-privtip">🔒 有一类工单只有站长的钱包能看：站长先在 <a href="#/inbox">📬 收件箱</a> 用自己的钱包登录一次，再回到这里。</p>');
      }, function () { box.innerHTML = '<p class="muted">读取失败</p>'; });
    }
    load(true);
    adTimer = setInterval(function () { if (!A.isCurrent(rid)) return clearInterval(adTimer); load(false); }, 20000);
  }
  function one(rid, id) {
    A.app.innerHTML = '<section class="card fb-one"><div class="fb-nav"><a href="#/feedback/admin">← 全部工单</a><span class="muted" id="fb-left"></span></div><div id="fb-1"><p class="muted">读取中…</p></div></section>';
    api("list=1").then(function (j) {
      if (j.error) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, "口令失效或不对，请重新输入"); }
      var l = j.list || [], t = l.filter(function (x) { return x.id === id; })[0], box = document.getElementById("fb-1");
      var todo = l.filter(function (x) { return x.st !== "done"; }).sort(function (a, b) { return a.id - b.id; });
      document.getElementById("fb-left").textContent = "还有 " + todo.length + " 张没处理完";
      if (!t) { box.innerHTML = '<p class="muted">找不到工单 #' + id + "</p>"; return; }
      box.innerHTML = card(t, true);
      bindCards(box, function (cd, s) {
        if (s !== "done") { cd.querySelector(".fb-tag").textContent = ST[s][0]; return; }
        var next = todo.filter(function (x) { return x.id !== id; })[0];
        box.innerHTML = '<p class="fb-st ok">✅ #' + id + " 已处理，回复已发给客户</p>" + (next ? '<p class="muted">正在打开下一张 #' + next.id + "…</p>" : '<p class="muted">全部处理完了 🎉</p><a href="#/feedback/admin">← 回到工单列表</a>');
        if (next) setTimeout(function () { location.hash = "#/feedback/admin/" + next.id; }, 900);
      });
    });
  }
  A.pages.feedback = page;
})();
