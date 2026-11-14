// 🔔 收件箱（站内信）：成交、借贷、工单回复、预言家、链上留言的通知都在这里，不依赖任何社交软件
// 钱包签一次名（管 30 天）证明是本人，之后每分钟悄悄拉一次；顶栏铃铛显示未读数；开了浏览器通知的，新消息会弹系统通知
// 2026-11-11 站长：铃铛放大；点开就算已读（不用点「全部已读」）；6 位码取消；客户自己的每笔操作即时进收件箱；
//   站长私信像工单回复一样弹悬浮气泡；没签名的钱包铃铛也亮未读数（只有数字，内容要签名才看得到）
(function () {
  "use strict";
  var A = window.AIL, KEY = "ibAuth", W = A.wallets;
  var ICO = { otc: "💱", loan: "🤝", ticket: "📮", msg: "📬", oracle: "🔮", sys: "📣" };
  var PAUSED = false; // 2026-11-08 站长：重新开通（原 2026-11-06：手机 App 里连不上钱包，先暂停对客户开放，方案想好再开（改成 false 即恢复）
  var auth = null, lastMax = 0, timer = null, eth = null, account = "", openSeen = null, marking = false, DM = "📣 站长通知";
  try { auth = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { auth = null; }
  if (auth && (!auth.a || !auth.sig || Date.now() - auth.ts > 29 * 86400e3)) auth = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function utf8hex(str) { var b = unescape(encodeURIComponent(str)), h = "0x"; for (var i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return h; }
  function text(a, ts) { return "AiLGNS 收件箱登录\n地址：" + a + "\n时间：" + ts; } // 和 lib/inbox.js 一字不差
  function q() { return "a=" + auth.a + "&ts=" + auth.ts + "&sig=" + encodeURIComponent(auth.sig); }
  function bj(ts) { var d = new Date(ts + 8 * 3600e3), n = new Date(Date.now() + 8 * 3600e3); var hm = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); return (d.toDateString() === n.toDateString() ? "今天 " : (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " ") + hm; }
  // 文字里的链接变成可点的（本站链接直接走 #/，不跳出）
  function rich(t) { return esc(t).replace(/https?:\/\/[^\s<]+/g, function (u) { var h = u.replace(/^https?:\/\/ailgns\.dev\/?/, "/"); return '<a href="' + h + '"' + (h === u ? ' target="_blank" rel="noopener"' : "") + ">" + (h === u ? u : u.replace(/^https?:\/\/ailgns\.dev\/?/, "ailgns.dev/")) + "</a>"; }).replace(/\n/g, "<br>"); }

  // ---------- 顶栏铃铛 ----------
  var bell = document.createElement("a");
  bell.className = "ib-bell"; bell.href = "#/inbox"; bell.title = "收件箱"; bell.setAttribute("aria-label", "收件箱");
  bell.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><i class="ib-n" hidden></i>';
  var right = document.querySelector(".top-r"); if (right && !PAUSED) right.insertBefore(bell, right.firstChild);
  function badge(n) { var i = bell.querySelector(".ib-n"); i.hidden = !n; i.textContent = n > 99 ? "99+" : n; bell.classList.toggle("has", !!n); }
  function onInbox() { return location.hash.indexOf("#/inbox") === 0; }
  function isAddr(a) { return /^0x[0-9a-f]{40}$/.test(a || ""); }
  // 这台设备最近用的钱包地址（没签名时只用来问「有几条未读」）
  function getAcct() { if (auth) return auth.a; try { var a = localStorage.getItem("ib:acct") || ""; return isAddr(a) ? a : ""; } catch (e) { return ""; } }
  function setAcct(a) {
    a = String(a || "").toLowerCase(); if (!isAddr(a)) return;
    var old = ""; try { old = localStorage.getItem("ib:acct") || ""; if (old !== a) localStorage.setItem("ib:acct", a); } catch (e) {}
    if (old !== a && !auth && !PAUSED) { schedule(); count(); }
  }
  // 📬 站长私信悬浮气泡：和工单回复同一个样式，点开收件箱就消失
  function pill(n, txt) {
    var el = document.getElementById("ib-pill");
    if (!n || onInbox() || PAUSED) { if (el) el.remove(); return; }
    var k = n + "|" + txt; if (el && el.getAttribute("data-k") === k) return;
    if (!el) { el = document.createElement("a"); el.id = "ib-pill"; el.className = "fb-pill ib-pill"; el.href = "#/inbox"; document.body.appendChild(el); }
    el.setAttribute("data-k", k);
    el.innerHTML = '<span class="fb-pill-i">📬</span><span class="fb-pill-t"><b>站长给你发来' + (n > 1 ? " " + n + " 条" : "一条") + "私信</b><small>" + (txt ? esc(txt.slice(0, 40)) + (txt.length > 40 ? "…" : "") : "点开用钱包签个名就能看（免费）") + '</small></span><span class="fb-pill-go">查看 ›</span>';
  }
  /* 气泡记在本机：一打开网站先按上次查到的显示，后台再核对一遍（已读了就马上收起） */
  function pillSave(n, txt) { try { var a = getAcct(); if (a) localStorage.setItem("ib:pill", JSON.stringify({ a: a, n: n || 0, txt: txt || "", t: Date.now() })); } catch (e) { /* 存不上不要紧 */ } }
  function pillCached() { try { var c = JSON.parse(localStorage.getItem("ib:pill") || "null"); if (c && c.n > 0 && c.a === getAcct() && Date.now() - c.t < 7 * 86400e3) pill(c.n, c.txt || ""); } catch (e) { /* 读不到就等网络 */ } }
  // 没签名：只问未读数（不含内容）
  function count() {
    var a = getAcct(); if (!a || auth || document.hidden) return Promise.resolve(null);
    return fetch("/api/inbox?n=" + a).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.error) return null;
      badge(j.unread); pill(j.dm, ""); pillSave(j.dm, "");
      var c = document.getElementById("ib-cnt"); if (c) c.textContent = j.unread ? "🔴 钱包 " + A.short(a) + " 有 " + j.unread + " 条未读通知，签名后就能看" : "";
      return j;
    }).catch(function () { return null; });
  }

  function pull(render) {
    if (!auth) return count();
    return fetch("/api/inbox?" + q()).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { if (/过期/.test(j.error)) logout(false); return null; }
      badge(j.unread);
      var dms = j.list.filter(function (x) { return x.t > j.seen && String(x.txt).indexOf(DM) === 0; });
      var dmTxt = dms.length ? String(dms[0].txt).split("\n").slice(1).join(" ") : "";
      pill(dms.length, dmTxt); pillSave(dms.length, dmTxt);
      var top = j.list.length ? j.list[0].t : 0;
      var hasPush = false; try { hasPush = localStorage.getItem("ib:push:" + auth.a) === "1"; } catch (e) {}
      if (!hasPush && lastMax && top > lastMax && "Notification" in window && Notification.permission === "granted") {
        j.list.filter(function (x) { return x.t > lastMax; }).slice(0, 3).forEach(function (x) {
          try { var n = new Notification("AiLGNS 新消息", { body: x.txt.split("\n")[0].slice(0, 90), tag: x.id }); n.onclick = function () { location.hash = x.link || "#/inbox"; window.focus(); }; } catch (e) {}
        });
      }
      lastMax = Math.max(lastMax, top);
      if (render) render(j);
      return j;
    }).catch(function () { return null; });
  }
  function schedule() { clearInterval(timer); if (PAUSED || (!auth && !getAcct())) return; timer = setInterval(function () { pull(onInbox() ? paint : null); }, auth && onInbox() ? 20000 : 60000); }
  function logout(clear) { auth = null; openSeen = null; badge(0); pill(0); clearInterval(timer); try { if (clear !== false) localStorage.removeItem(KEY); } catch (e) {} }

  // ---------- 钱包签名登录 ----------
  function login(btn) {
    var st = document.getElementById("ib-st"), say = function (t) { if (st) st.textContent = t; };
    btn.disabled = true; say("正在连接钱包…");
    var ts = Date.now();
    // 签名不需要切链：只要拿到地址就签（之前走 OTC 的连接流程会先切 Anubis 链，钱包切链失败就被当成「没有钱包」，在 OKX 里死循环）
    return W.choose().then(function (p) {
      eth = p;
      return W.ask(eth, { method: "eth_requestAccounts" });
    }).then(function (a) {
      account = String((a && a[0]) || "").toLowerCase();
      if (!account) throw new Error("钱包没有给出地址，请在钱包里解锁后再试");
      say("请在钱包里点「签名」（免费，不是交易，不花 Gas）");
      var msg = utf8hex(text(account, ts));
      return W.ask(eth, { method: "personal_sign", params: [msg, account] }).catch(function (e) {
        if (/reject|denied|取消|拒绝|cancel/i.test(String(e && (e.message || e)))) throw e;
        return W.ask(eth, { method: "personal_sign", params: [account, msg] }); // 个别钱包参数顺序相反
      });
    }).then(function (sig) {
      if (!sig || !/^0x[0-9a-fA-F]{100,}$/.test(String(sig))) throw new Error("钱包返回的签名不对，请换个钱包试试");
      auth = { a: account, ts: ts, sig: sig }; try { localStorage.setItem(KEY, JSON.stringify(auth)); localStorage.setItem("ib:acct", account); } catch (e) {}
      btn.disabled = false; lastMax = 0; schedule(); say("✅ 已登录");
      return pull(paint).then(function () { if (location.hash.indexOf("#/inbox") === 0 && A.pages.inbox) A.pages.inbox(cur); });
    }).catch(function (e) {
      btn.disabled = false; say("");
      var m = String(e && (e.message || e.reason || e)) || "";
      if (/没有检测到钱包/.test(m)) return; // choose() 已经弹了「到钱包 App 里操作」
      A.errTip(/reject|denied|取消|拒绝|cancel/i.test(m) ? "你在钱包里取消了签名，再点一次就行" : m || "钱包没有响应，请换个钱包或刷新再试", btn);
    });
  }

  // ---------- 真·推送订阅（Service Worker + Web Push）：手机不开网站也能收到 ----------
  function subscribePush(btn, id) {
    if (!auth) return;
    btn.disabled = true; btn.textContent = "开启中…";
    var fail = function (m) { btn.disabled = false; btn.textContent = "开启通知"; A.errTip(m, btn); };
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return fail(/iPhone|iPad/.test(navigator.userAgent) ? "iPhone 需要先把本站「添加到主屏幕」，再从桌面图标打开才能开通知（iOS 16.4 以上）" : "这个浏览器不支持通知，换 Chrome / Edge / Safari 试试");
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("你没有允许通知。想开的话到浏览器设置里允许本站通知，再回来点一次");
      return navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; });
    }).then(function (reg) {
      return fetch("/api/push").then(function (r) { return r.json(); }).then(function (j) {
        if (!j.pub) throw new Error("服务器没准备好，稍后再试");
        var raw = atob(j.pub.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(j.pub.length / 4) * 4, "=")), key = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
        return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); });
      });
    }).then(function (sub) {
      return fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: auth.a, ts: auth.ts, sig: auth.sig, sub: sub.toJSON() }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (j.error) throw new Error(j.error);
      try { localStorage.setItem("ib:push:" + auth.a, "1"); } catch (e) {}
      btn.textContent = "✅ 已开启"; btn.disabled = false;
      if (j.test && !j.test.ok) A.errTip("订阅成功，但测试推送没发出去（" + (j.test.status || j.test.err || "未知") + "），稍后再试", btn);
      setTimeout(function () { if (A.isCurrent(id)) A.pages.inbox(id); }, 1500);
    }).catch(function (e) { fail(String(e && (e.message || e)) || "开启失败"); });
  }
  // ---------- 页面 ----------
  var cur = null;
  var shown = [];
  function paint(j) {
    var box = document.getElementById("ib-list"); if (!box || !j) return;
    // 点开就算已读：铃铛数字马上清零；这一趟里「新」字照旧标着（按进页面那一刻的已读时间算），离开再回来就没了
    if (openSeen === null) openSeen = j.seen;
    var fresh = j.list.filter(function (x) { return x.t > openSeen; }).length;
    var un = document.getElementById("ib-un"); if (un) un.textContent = fresh ? fresh + " 条新消息" : "";
    pill(0); pillSave(0, ""); /* 点开收件箱就算看过：本机记的气泡也清掉，下次打开不再闪一下 */
    if (j.unread && !document.hidden) { badge(0); markSeen(); }
    if (box.querySelector(".ib-rbox")) return; // 正在写回复：不刷新列表，免得字被清掉
    shown = j.list;
    box.innerHTML = j.list.length ? j.list.map(function (x) {
      return '<div class="ib-it' + (x.t > openSeen ? " new" : "") + '"><span class="ib-ico"><i class="gd-xin">信</i></span><div class="ib-main"><div class="ib-txt">' + rich(x.txt) + '</div><small>' + bj(x.t) + '</small>' + repBtn(x) + '</div></div>';
    }).join("") : '<p class="muted ib-empty">还没有消息。以后你的成交、借贷、工单回复、预言家中奖、链上留言都会出现在这里。</p>';
  }
  /* 回复按钮：客户看到的是「回复站长」；站长自己的收件箱里，客户来信 / 工单那几条变成「回复客户」（直接回到那位客户的收件箱），其余通知不放按钮（站长 2026-11-14） */
  var OWNER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6";
  function tidOf(x) { var m = String((x && x.link) || "").match(/^#\/feedback\/admin\/(\d+)$/); return m ? m[1] : ""; }
  function repBtn(x) {
    if (auth && auth.a === OWNER) { var tid = tidOf(x); return tid ? '<button type="button" class="ib-rep ib-repc" data-rep="' + esc(x.id) + '" data-tid="' + tid + '">💬 回复客户</button>' : ""; }
    return '<button type="button" class="ib-rep" data-rep="' + esc(x.id) + '">💬 回复站长</button>';
  }
  function replyCustomer(b, main) {
    var tid = b.getAttribute("data-tid");
    b.hidden = true;
    main.insertAdjacentHTML("beforeend", '<div class="ib-rbox"><textarea rows="3" maxlength="1000" placeholder="写给这位客户（工单 #' + tid + '）。发出后他的收件箱多一条「站长通知」，网站底部会弹出提醒"></textarea><div class="ib-rrow"><button type="button" class="link ib-rx">取消</button><button type="button" class="nm-go ib-rs">发送给客户</button></div><p class="muted ib-rst"></p></div>');
    var box = main.querySelector(".ib-rbox"), ta = box.querySelector("textarea"), st = box.querySelector(".ib-rst"); ta.focus();
    box.querySelector(".ib-rx").onclick = function () { box.remove(); b.hidden = false; };
    box.querySelector(".ib-rs").onclick = function () {
      var v = ta.value.trim(), s = this; if (v.length < 2) { st.textContent = "多写几个字吧"; return; }
      s.disabled = true; st.textContent = "发送中…";
      fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: auth.a, ts: auth.ts, sig: auth.sig, action: "reply", tid: tid, msg: v }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) { s.disabled = false; st.textContent = "❌ " + j.error; return; }
        box.innerHTML = '<p class="ib-rok">✅ 已发给客户 ' + esc(A.short(j.to)) + '（工单 #' + esc(j.id) + ' 已标成已处理）。他打开网站，底部会弹出「站长给你发来一条私信」；他再回复，还会出现在你这里。</p><p class="ib-rmine">你写的：' + esc(v) + "</p>";
      }, function () { s.disabled = false; st.textContent = "❌ 网络不好，再点一次"; });
    };
  }
  function markSeen() {
    if (!auth || marking) return; marking = true;
    fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: auth.a, ts: auth.ts, sig: auth.sig, action: "seen" }) }).then(function (r) { return r.json(); }).then(function (j) { marking = false; if (j && !j.error && onInbox()) badge(0); }, function () { marking = false; });
  }
  // 💬 回复站长（2026-11-08 站长定）：回复内容进工单后台，站长收件箱同时提醒
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-rep]"); if (!b || !auth) return;
    var main = b.parentNode; if (main.querySelector(".ib-rbox")) return;
    var it = shown.filter(function (x) { return x.id === b.getAttribute("data-rep"); })[0] || {};
    if (b.getAttribute("data-tid") && auth.a === OWNER) return replyCustomer(b, main);
    b.hidden = true;
    main.insertAdjacentHTML("beforeend", '<div class="ib-rbox"><textarea rows="3" maxlength="1000" placeholder="想对站长说什么？问题、建议都可以，站长会亲自看"></textarea><div class="ib-rrow"><button type="button" class="link ib-rx">取消</button><button type="button" class="nm-go ib-rs">发送给站长</button></div><p class="muted ib-rst"></p></div>');
    var box = main.querySelector(".ib-rbox"), ta = box.querySelector("textarea"), st = box.querySelector(".ib-rst"); ta.focus();
    box.querySelector(".ib-rx").onclick = function () { box.remove(); b.hidden = false; };
    box.querySelector(".ib-rs").onclick = function () {
      var v = ta.value.trim(), s = this; if (v.length < 2) { st.textContent = "多写几个字吧"; return; }
      s.disabled = true; st.textContent = "发送中…";
      fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: auth.a, src: "inbox", txt: "【回复站内信】" + v + "\n\n—— 回复的是：" + String(it.txt || "").slice(0, 300) }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) { s.disabled = false; st.textContent = "❌ " + j.error; return; }
        box.innerHTML = '<p class="ib-rok">✅ 已发给站长（工单 #' + j.id + '），回复会出现在这里和「我的反馈进度」</p>';
      }, function () { s.disabled = false; st.textContent = "❌ 网络不好，再点一次"; });
    };
  });
  A.pages.inbox = function (id) {
    cur = id;
    if (PAUSED) {
      A.app.innerHTML = '<section class="card ib-login"><h2>🔔 收件箱 <span class="lp-tag">调整中，暂未开放</span></h2><p>成交、借贷、工单回复、预言家中奖、链上留言的通知功能正在重新设计（手机 App 里登录体验还不够顺），弄好会在「更新日志」公布。</p><p class="muted">这期间通知不会丢：所有消息都在后台替你存着，开放后一次看到。成交 / 到期提醒现在仍可通过 DeBox 机器人接收（OTC 页「DeBox 私信」卡片）。</p><p><a class="nm-go" href="#/scan">去账本查我的单 →</a></p></section>';
      return;
    }
    if (!auth) {
      A.app.innerHTML = '<section class="card ib-login"><h2>🔔 收件箱</h2><p>成交、借贷、工单回复、预言家中奖、链上留言……所有和你钱包有关的通知都在这里，<b>不用加任何社交软件</b>。</p>' +
        '<p class="muted">用钱包签一次名证明是你本人（免费、不花 Gas、不是交易），管 30 天。</p><button type="button" class="nm-go" id="ib-go">🔏 钱包签名，打开我的收件箱</button><p class="muted nm-st" id="ib-st"></p><p class="ib-cnt" id="ib-cnt"></p>' +
        '<p class="muted ib-tip">手机请在钱包 App（OKX / Bitget / TokenPocket / MetaMask 等）内置浏览器里打开 ailgns.dev 再点；点了弹出钱包就选「签名」。</p><p class="muted ib-diag" id="ib-diag"></p></section>';
      // 诊断行：这台设备检测到了哪些钱包（排查「点了没反应」用）
      setTimeout(function () { var d = document.getElementById("ib-diag"); if (!d) return; var ws = (W.list && W.list()) || []; d.textContent = "诊断 v2 · " + (ws.length ? "检测到钱包：" + ws.map(function (w) { return w.name; }).join("、") : "没检测到钱包（当前不是钱包内置浏览器，或钱包还没注入）") + (W.standalone && W.standalone() ? " · 桌面图标模式" : ""); }, 600);
      document.getElementById("ib-go").onclick = function () { login(this); };
      count();
      return;
    }
    var canN = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window, perm = canN ? Notification.permission : "denied";
    var pushed = false; try { pushed = localStorage.getItem("ib:push:" + auth.a) === "1"; } catch (e) {}
    A.app.innerHTML = '<section class="card"><div class="card-head"><h2>🔔 收件箱 <small class="muted" id="ib-un"></small></h2><span class="ib-ops"><button type="button" class="ghost" id="ib-out" title="换一个钱包">退出</button></span></div>' +
      '<p class="muted ib-who">钱包 <a class="mono" href="#/scan/' + auth.a + '">' + A.short(auth.a) + "</a>" +
      (canN && (perm === "default" || (perm === "granted" && !pushed)) ? ' · <button type="button" class="link" id="ib-notify">开启通知</button>（新消息像微信一样弹到手机/电脑）' : perm === "granted" && pushed ? ' · ✅ 通知已开 <button type="button" class="link" id="ib-notify">重新开启</button>' : perm === "denied" && canN ? ' · <span class="muted">通知被浏览器拒绝了，去浏览器设置里允许本站通知后再来</span>' : (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone ? ' · <span class="muted">iPhone 要先把本站「添加到主屏幕」再从桌面图标打开，才能开通知（<a href="#/app">怎么加 →</a>）</span>' : "")) + "</p>" +
      '<div id="ib-list"><p class="muted">读取中…</p></div></section>';
    document.getElementById("ib-out").onclick = function () { logout(true); A.pages.inbox(id); };
    var nb = document.getElementById("ib-notify");
    if (nb) nb.onclick = function () { subscribePush(nb, id); };
    pull(paint); schedule();
  };
  // ---------- 客户自己的每笔操作：钱包一返回交易哈希就报给服务器，服务器读链核对后写进收件箱 ----------
  // 排队存在本机（最多 12 笔、15 分钟内）：钱包 App 切来切去、页面刷新了也接着报
  var TXW = [2500, 4000, 6000, 10000, 20000, 40000, 60000];
  function txq(fn) { try { var l = JSON.parse(localStorage.getItem("ib:txq") || "[]").filter(function (x) { return x && x.h && Date.now() - x.t < 900e3; }); if (fn) { l = fn(l).slice(-12); localStorage.setItem("ib:txq", JSON.stringify(l)); } return l; } catch (e) { return []; } }
  function txGo(h, i) {
    if (i >= TXW.length) return;
    setTimeout(function () {
      fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "tx", tx: h }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.pending) return txGo(h, i + 1);
        txq(function (l) { return l.filter(function (x) { return x.h !== h; }); });
        if (j.ok && !j.skip && !j.dup) { if (j.a) setAcct(j.a); pull(onInbox() ? paint : null); }
      }).catch(function () { txGo(h, i + 1); });
    }, TXW[i]);
  }
  function tx(h, from) {
    if (PAUSED) return; h = String(h || "").toLowerCase(); if (!/^0x[0-9a-f]{64}$/.test(h)) return;
    if (from) setAcct(from);
    txq(function (l) { return l.filter(function (x) { return x.h !== h; }).concat([{ h: h, t: Date.now() }]); });
    txGo(h, 0);
  }
  // 开站就拉一次，之后按节奏；没签名的先悄悄问一下钱包地址（不弹窗），只为了让铃铛亮未读数
  if (!PAUSED) { try { pillCached(); } catch (e) { /* 忽略 */ } }
  if (!PAUSED) setTimeout(function () {
    try { txq().forEach(function (x) { txGo(x.h, 0); }); } catch (e) {}
    if (auth || getAcct()) { pull(onInbox() ? paint : null); schedule(); return; }
    try { if (W.silent) W.silent().then(function (a) { if (a) setAcct(a); }).catch(function () {}); } catch (e) {}
  }, 150);
  var lastWake = 0;
  function wake() { try { if (PAUSED || document.hidden || Date.now() - lastWake < 5000 || (!auth && !getAcct())) return; lastWake = Date.now(); pull(onInbox() ? paint : null); } catch (e) { /* 查不了就等下一轮 */ } }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("hashchange", function () { if (!onInbox()) openSeen = null; else pill(0); schedule(); });
  A.inbox = { login: function (b) { return login(b); }, authed: function () { return !!auth; }, tx: tx, acct: setAcct };
})();
