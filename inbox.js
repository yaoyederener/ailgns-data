// 🔔 收件箱（站内信）：成交、借贷、工单回复、预言家、链上留言的通知都在这里，不依赖任何社交软件
// 钱包签一次名（管 30 天）证明是本人，之后每分钟悄悄拉一次；顶栏铃铛显示未读数；开了浏览器通知的，新消息会弹系统通知
(function () {
  "use strict";
  var A = window.AIL, KEY = "ibAuth", W = A.wallets;
  var ICO = { otc: "💱", loan: "🤝", ticket: "📮", msg: "📬", oracle: "🔮", sys: "📣" };
  var PAUSED = true; // 站长 2026-11-06：手机 App 里连不上钱包，先暂停对客户开放，方案想好再开（改成 false 即恢复）
  var auth = null, lastMax = 0, timer = null, eth = null, account = "";
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

  function pull(render) {
    if (!auth) return Promise.resolve(null);
    return fetch("/api/inbox?" + q()).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { if (/过期/.test(j.error)) logout(false); return null; }
      badge(j.unread);
      var top = j.list.length ? j.list[0].t : 0;
      var hasPush = false; try { hasPush = localStorage.getItem("ib:push:" + auth.a) === "1"; } catch (e) {}
      if (!hasPush && lastMax && top > lastMax && "Notification" in window && Notification.permission === "granted") {
        j.list.filter(function (x) { return x.t > lastMax; }).slice(0, 3).forEach(function (x) {
          try { var n = new Notification("AiLGNS " + (ICO[x.k] || "📣") + " 新消息", { body: x.txt.split("\n")[0].slice(0, 90), tag: x.id }); n.onclick = function () { location.hash = x.link || "#/inbox"; window.focus(); }; } catch (e) {}
        });
      }
      lastMax = Math.max(lastMax, top);
      if (render) render(j);
      return j;
    }).catch(function () { return null; });
  }
  function schedule() { clearInterval(timer); if (!auth) return; timer = setInterval(function () { pull(location.hash.indexOf("#/inbox") === 0 ? paint : null); }, location.hash.indexOf("#/inbox") === 0 ? 20000 : 60000); }
  function logout(clear) { auth = null; badge(0); clearInterval(timer); try { if (clear !== false) localStorage.removeItem(KEY); } catch (e) {} }

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
      auth = { a: account, ts: ts, sig: sig }; try { localStorage.setItem(KEY, JSON.stringify(auth)); } catch (e) {}
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
  function paint(j) {
    var box = document.getElementById("ib-list"); if (!box || !j) return;
    var un = document.getElementById("ib-un"); if (un) un.textContent = j.unread ? j.unread + " 条未读" : "没有未读";
    box.innerHTML = j.list.length ? j.list.map(function (x) {
      return '<div class="ib-it' + (x.t > j.seen ? " new" : "") + '"><span class="ib-ico">' + (ICO[x.k] || "📣") + '</span><div class="ib-main"><div class="ib-txt">' + rich(x.txt) + '</div><small>' + bj(x.t) + "</small></div></div>";
    }).join("") : '<p class="muted ib-empty">还没有消息。以后你的成交、借贷、工单回复、预言家中奖、链上留言都会出现在这里。</p>';
  }
  A.pages.inbox = function (id) {
    cur = id;
    if (PAUSED) {
      A.app.innerHTML = '<section class="card ib-login"><h2>🔔 收件箱 <span class="lp-tag">调整中，暂未开放</span></h2><p>成交、借贷、工单回复、预言家中奖、链上留言的通知功能正在重新设计（手机 App 里登录体验还不够顺），弄好会在「更新日志」公布。</p><p class="muted">这期间通知不会丢：所有消息都在后台替你存着，开放后一次看到。成交 / 到期提醒现在仍可通过 DeBox 机器人接收（OTC 页「DeBox 私信」卡片）。</p><p><a class="nm-go" href="#/scan">去账本查我的单 →</a></p></section>';
      return;
    }
    if (!auth) {
      A.app.innerHTML = '<section class="card ib-login"><h2>🔔 收件箱</h2><p>成交、借贷、工单回复、预言家中奖、链上留言……所有和你钱包有关的通知都在这里，<b>不用加任何社交软件</b>。</p>' +
        '<p class="muted">用钱包签一次名证明是你本人（免费、不花 Gas、不是交易），管 30 天。</p><button type="button" class="nm-go" id="ib-go">🔏 钱包签名，打开我的收件箱</button><p class="muted nm-st" id="ib-st"></p>' +
        '<p class="muted ib-tip">手机请在钱包 App（OKX / Bitget / TokenPocket / MetaMask 等）内置浏览器里打开 ailgns.dev 再点；点了弹出钱包就选「签名」。</p><p class="muted ib-diag" id="ib-diag"></p></section>';
      // 诊断行：这台设备检测到了哪些钱包（排查「点了没反应」用）
      setTimeout(function () { var d = document.getElementById("ib-diag"); if (!d) return; var ws = (W.list && W.list()) || []; d.textContent = "诊断 v2 · " + (ws.length ? "检测到钱包：" + ws.map(function (w) { return w.name; }).join("、") : "没检测到钱包（当前不是钱包内置浏览器，或钱包还没注入）") + (W.standalone && W.standalone() ? " · 桌面图标模式" : ""); }, 600);
      document.getElementById("ib-go").onclick = function () { login(this); };
      // iPhone 桌面图标 / 别的设备：没钱包也能用 6 位码登录
      var box = document.querySelector(".ib-login");
      box.insertAdjacentHTML("beforeend", '<div class="ib-code"><p class="muted">已经在钱包里登录过？在那边点「生成 6 位码」，这里输入就能登录（iPhone 桌面图标 App 里没有钱包，用这个）：</p><form class="ib-codef"><input inputmode="numeric" maxlength="6" placeholder="6 位数字" autocomplete="one-time-code"><button type="submit" class="ghost">用码登录</button></form></div>');
      box.querySelector(".ib-codef").onsubmit = function (e) {
        e.preventDefault(); var inp = this.querySelector("input"), b = this.querySelector("button"), code = inp.value.replace(/\D/g, "");
        if (code.length !== 6) return A.errTip("输入 6 位数字", inp);
        b.disabled = true;
        fetch("/api/inbox?code=" + code).then(function (r) { return r.json(); }).then(function (j) {
          b.disabled = false; if (j.error) return A.errTip(j.error, inp);
          auth = j.auth; try { localStorage.setItem(KEY, JSON.stringify(auth)); } catch (x) {}
          lastMax = 0; schedule(); A.pages.inbox(id);
        }).catch(function () { b.disabled = false; A.errTip("网络不好，再试一次", inp); });
      };
      return;
    }
    var canN = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window, perm = canN ? Notification.permission : "denied";
    var pushed = false; try { pushed = localStorage.getItem("ib:push:" + auth.a) === "1"; } catch (e) {}
    A.app.innerHTML = '<section class="card"><div class="card-head"><h2>🔔 收件箱 <small class="muted" id="ib-un"></small></h2><span class="ib-ops"><button type="button" class="ghost" id="ib-seen">全部已读</button><button type="button" class="ghost" id="ib-out" title="换一个钱包">退出</button></span></div>' +
      '<p class="muted ib-who">钱包 <a class="mono" href="#/scan/' + auth.a + '">' + A.short(auth.a) + "</a>" +
      (canN && (perm === "default" || (perm === "granted" && !pushed)) ? ' · <button type="button" class="link" id="ib-notify">开启通知</button>（新消息像微信一样弹到手机/电脑）' : perm === "granted" && pushed ? ' · ✅ 通知已开 <button type="button" class="link" id="ib-notify">重新开启</button>' : perm === "denied" && canN ? ' · <span class="muted">通知被浏览器拒绝了，去浏览器设置里允许本站通知后再来</span>' : (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone ? ' · <span class="muted">iPhone 要先把本站「添加到主屏幕」再从桌面图标打开，才能开通知（<a href="#/app">怎么加 →</a>）</span>' : "")) + "</p>" +
      '<div id="ib-list"><p class="muted">读取中…</p></div></section>';
    document.getElementById("ib-seen").onclick = function () {
      var b = this; b.disabled = true;
      fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: auth.a, ts: auth.ts, sig: auth.sig, action: "seen" }) }).then(function (r) { return r.json(); }).then(function (j) { b.disabled = false; if (j.error) return A.errTip(j.error, b); badge(0); paint(j); });
    };
    document.getElementById("ib-out").onclick = function () { logout(true); A.pages.inbox(id); };
    // 生成 6 位码：拿到 iPhone 桌面图标 App（或电脑）里登录，不用再签名
    var who = document.querySelector(".ib-who");
    if (who) {
      who.insertAdjacentHTML("beforeend", ' · <button type="button" class="link" id="ib-code">生成 6 位码</button><span class="muted">（在 iPhone 桌面图标 / 电脑上登录用）</span>');
      document.getElementById("ib-code").onclick = function () {
        var b = this; b.disabled = true;
        fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: auth.a, ts: auth.ts, sig: auth.sig, action: "code" }) }).then(function (r) { return r.json(); }).then(function (j) {
          b.disabled = false; if (j.error) return A.errTip(j.error, b);
          b.outerHTML = '<b class="ib-codev">' + j.code + '</b><span class="muted">（10 分钟内有效，只能用一次：到另一台设备的收件箱页输入）</span>';
        }).catch(function () { b.disabled = false; A.errTip("网络不好，再试一次", b); });
      };
    }
    var nb = document.getElementById("ib-notify");
    if (nb) nb.onclick = function () { subscribePush(nb, id); };
    pull(paint); schedule();
  };
  // 开站就拉一次（已登录的），之后按节奏
  if (auth && !PAUSED) { setTimeout(function () { pull(null); schedule(); }, 1500); }
  window.addEventListener("hashchange", schedule);
  A.inbox = { login: function (b) { return login(b); }, authed: function () { return !!auth; } };
})();
