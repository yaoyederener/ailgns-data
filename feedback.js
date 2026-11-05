// 📮 问题反馈（#/feedback）：客户填钱包地址 + 文字 + 截图（可粘贴 / 拖进来 / 从相册选），提交后变成工单
// 站长后台（#/feedback/admin）：输入口令（FEEDBACK_KEY 或 BACKUP_KEY）看工单、看截图、写回复、标记处理中 / 已解决
(function () {
  "use strict";
  var A = window.AIL;
  var imgs = [], pasteOn = false;
  var ST = { new: ["待处理", "#e11d48"], doing: ["处理中", "#d97706"], done: ["已解决", "#16a34a"] };
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
  function thumbs() {
    var box = document.getElementById("fb-th"); if (!box) return;
    box.innerHTML = imgs.map(function (u, i) { return '<div class="fb-t"><img src="' + u + '"><button type="button" data-rm="' + i + '">✕</button></div>'; }).join("");
    box.querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { imgs.splice(Number(b.getAttribute("data-rm")), 1); thumbs(); }; });
    var z = document.getElementById("fb-zone"); if (z) z.classList.toggle("has", imgs.length > 0);
  }
  function say(t, good) { var s = document.getElementById("fb-st"); if (s) { s.textContent = t; s.className = "fb-st" + (good ? " ok" : ""); } }

  function page(rid) {
    if (/feedback\/admin/.test(location.hash)) return admin(rid);
    imgs = [];
    A.app.innerHTML = '<section class="card fb"><div class="card-head"><h2>📮 问题反馈</h2><span class="muted">提交后生成工单，客服挨个处理</span></div>' +
      '<p class="fb-lead">遇到问题？按下面 3 步填好，<b>一次说清楚</b>，处理最快 👇</p>' +
      '<label class="fb-l"><b>① 你的钱包地址</b><small>出问题的那个钱包（0x 开头）</small></label>' +
      '<div class="fb-row"><input id="fb-a" placeholder="0x…" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button" class="ghost" id="fb-pa">📋 粘贴</button></div>' +
      '<label class="fb-l"><b>② 截图</b><small>最多 4 张：交易记录、报错提示、钱包页面都可以</small></label>' +
      '<div class="fb-zone" id="fb-zone"><input type="file" id="fb-f" accept="image/*" multiple hidden>' +
        '<button type="button" class="fb-pick" id="fb-pick">🖼️ 点这里选截图</button>' +
        '<p class="fb-hint">📱 弹出菜单后，请点 <b>「照片图库」</b>（安卓点 <b>「相册 / 图库」</b>），选好截图后点右上角「添加 / 完成」</p>' +
        '<button type="button" class="ghost fb-pimg" id="fb-pimg">📋 粘贴刚才的截图</button>' +
        '<small>电脑上截图后，直接按 <b>Ctrl+V</b>（苹果 ⌘+V）就能贴进来，也可以把图片拖到这里</small><div class="fb-th" id="fb-th"></div></div>' +
      '<label class="fb-l"><b>③ 遇到了什么问题</b><small>什么时间、在哪个页面、做了什么、提示了什么</small></label>' +
      '<textarea id="fb-x" rows="5" maxlength="2000" placeholder="例如：今天下午 3 点在借贷页面借款，钱包扣了 1 个 AiLGNS，但我的借贷里查不到订单"></textarea>' +
      '<button type="button" class="nm-go fb-go" id="fb-go">✅ 提交反馈</button><p class="fb-st" id="fb-st"></p>' +
      '<div class="fb-dbx"><p>🔔 <b>客服回复第一时间通知你</b>：关注 DeBox 机器人并发送你的钱包地址，工单处理好了机器人会<b>私信</b>你，不用一直刷页面。</p><div id="dbx-slot"></div></div>' +
      '<p class="muted fb-safe">🔒 我们<b>绝不会</b>向你要私钥、助记词或密码；任何人找你要，都是骗子。</p></section>' +
      '<section class="card"><div class="card-head"><h2>🧾 我的反馈进度</h2><span class="muted">按钱包地址查</span></div><div id="fb-mine"><p class="muted">填好钱包地址后，这里显示你提交过的反馈和客服回复</p></div></section>';
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
    var go = document.getElementById("fb-go");
    go.onclick = function () {
      var a = inp.value.trim().toLowerCase(), x = document.getElementById("fb-x").value.trim();
      if (!isAddr(a)) { inp.focus(); return say("请填正确的钱包地址（0x 开头，42 位）"); }
      if (x.length < 2 && !imgs.length) return say("请写一下遇到的问题，或者贴一张截图");
      go.disabled = true; say("提交中…");
      fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: a, txt: x, imgs: imgs }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          go.disabled = false;
          if (j.error) return say(j.error);
          imgs = []; thumbs(); document.getElementById("fb-x").value = "";
          say("✅ 提交成功！工单号 #" + j.id + "，客服会尽快处理，进度在下面「我的反馈进度」里看", true);
          mine(a);
        }, function () { go.disabled = false; say("网络不好，请再点一次"); });
    };
  }
  function mine(a) {
    var box = document.getElementById("fb-mine"); if (!box) return;
    fetch("/api/feedback?mine=" + a).then(function (r) { return r.json(); }).then(function (j) {
      var l = j.list || [];
      box.innerHTML = l.length ? l.map(function (t) {
        var s = ST[t.st] || ST["new"];
        return '<div class="fb-my"><div><b>#' + t.id + '</b> <span class="fb-tag" style="background:' + s[1] + '">' + s[0] + '</span> <small class="muted">' + tm(t.t) + '</small></div><p>' + esc(t.txt || "（截图 " + t.n + " 张）") + "</p>" +
          (t.note ? '<p class="fb-reply">💬 客服回复：' + esc(t.note) + "</p>" : "") + "</div>";
      }).join("") : '<p class="muted">这个地址还没有提交过反馈</p>';
    }, function () {});
  }

  // ===== 站长后台 =====
  // #/feedback/admin          工单列表（每 20 秒自动刷新，有新工单响一声、标红）
  // #/feedback/admin/<编号>   单张工单：看截图 → 写回复 → 「确认已处理」→ 自动跳下一张待处理
  function key() { try { return localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  var adTimer = null, adSeen = null;
  function beep() { try { var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.value = 0.08; o.start(); setTimeout(function () { o.stop(); c.close(); }, 250); } catch (e) {} }
  function api(q) { return fetch("/api/feedback?" + q + "&key=" + encodeURIComponent(key())).then(function (r) { return r.json(); }); }
  function imgUrl(id, i) { return "/api/feedback?img=" + id + ":" + i + "&key=" + encodeURIComponent(key()); }
  function card(t, one) {
    var ims = ""; for (var i = 0; i < t.n; i++) ims += '<a href="' + imgUrl(t.id, i) + '" target="_blank"><img loading="lazy" src="' + imgUrl(t.id, i) + '"></a>';
    var s = ST[t.st] || ST["new"];
    return '<div class="fb-tk" data-id="' + t.id + '"><div class="fb-tkh"><b>#' + t.id + '</b> <small class="muted">' + tm(t.t) + '</small> <span class="fb-tag" style="background:' + s[1] + '">' + s[0] + "</span>" +
      (one ? "" : ' <a href="#/feedback/admin/' + t.id + '">打开处理 →</a>') + "</div>" +
      '<div class="fb-addr"><span class="mono">' + t.a + '</span> <button type="button" class="ghost" data-cp="' + t.a + '">复制</button> <a href="#/scan/' + t.a + '" target="_blank" rel="noopener">📒 看他的账本 ↗</a></div>' +
      '<p class="fb-txt">' + esc(t.txt || "（只有截图）") + "</p>" + (ims ? '<div class="fb-ims">' + ims + "</div>" : "") +
      '<textarea rows="' + (one ? 4 : 2) + '" placeholder="回复客户（客户在反馈页面能看到；绑定了 DeBox 的还会收到私信）">' + esc(t.note || "") + "</textarea>" +
      '<div class="fb-act"><button type="button" class="nm-go" data-set="done">✅ 确认已处理并回复</button><button type="button" class="ghost" data-set="doing">先标处理中</button><button type="button" class="ghost" data-set="save">只保存回复</button></div></div>';
  }
  function bindCards(box, after) {
    box.querySelectorAll("[data-cp]").forEach(function (b) { b.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(b.getAttribute("data-cp")); b.textContent = "已复制"; }; });
    box.querySelectorAll("[data-set]").forEach(function (b) {
      b.onclick = function () {
        var cd = b.closest(".fb-tk"), s = b.getAttribute("data-set"), note = cd.querySelector("textarea").value.trim(), body = { key: key(), action: "set", id: Number(cd.getAttribute("data-id")), note: note };
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
        if (j.error) { tip.className = "fb-kmsg err"; tip.textContent = "口令不对（" + j.error + "）。用 1Password 里「AiLGNS · BACKUP_KEY」那一串，整段复制，前后别带空格。"; inp.select(); return; }
        try { localStorage.setItem("fbKey", k); } catch (e) {}
        admin(rid);
      }, function () { go.disabled = false; tip.className = "fb-kmsg err"; tip.textContent = "网络没通，再点一次"; });
    }
    go.onclick = submit;
    inp.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } };
    setTimeout(function () { inp.focus(); }, 50);
  }
  function admin(rid, st) {
    clearInterval(adTimer);
    if (!key()) return login(rid);
    var m = location.hash.match(/feedback\/admin\/(\d+)/);
    if (m) return one(rid, Number(m[1]));
    st = st || "new";
    A.app.innerHTML = '<section class="card"><div class="card-head"><h2>📮 工单后台<span id="fb-nw"></span></h2><span><button type="button" class="ghost" id="fb-out">退出</button></span></div>' +
      '<p class="muted">每 20 秒自动刷新，有新工单会响一声。点「打开处理」一张一张处理，处理完自动跳下一张。</p><div class="seg" id="fb-seg"></div><div id="fb-list"><p class="muted">读取中…</p></div></section>';
    document.getElementById("fb-out").onclick = function () { try { localStorage.removeItem("fbKey"); } catch (e) {} admin(rid); };
    function load(first) {
      var box = document.getElementById("fb-list"); if (!box) return clearInterval(adTimer);
      if (!first && box.querySelector("textarea:focus")) return; // 正在写回复：不刷新
      api("list=1&st=" + st).then(function (j) {
        if (j.error) { try { localStorage.removeItem("fbKey"); } catch (e) {} return login(rid, "口令失效或不对，请重新输入"); }
        var c = j.cnt || {}, maxId = (j.list || []).reduce(function (x, t) { return Math.max(x, t.id); }, 0);
        if (adSeen !== null && st === "new" && maxId > adSeen) { beep(); var nw = document.getElementById("fb-nw"); if (nw) nw.innerHTML = '<span class="fb-new">🔔 新工单</span>'; }
        if (st === "new") adSeen = Math.max(adSeen || 0, maxId);
        document.getElementById("fb-seg").innerHTML = ["new", "doing", "done"].map(function (s) { return '<button type="button" data-s="' + s + '"' + (s === st ? ' class="on"' : "") + ">" + ST[s][0] + " " + (c[s] || 0) + "</button>"; }).join("");
        document.querySelectorAll("#fb-seg button").forEach(function (b) { b.onclick = function () { admin(rid, b.getAttribute("data-s")); }; });
        var l = j.list || [];
        box.innerHTML = l.length ? l.map(function (t) { return card(t, false); }).join("") : '<p class="muted">没有' + ST[st][0] + "的工单 🎉</p>";
        bindCards(box, function (cd) { cd.remove(); });
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
