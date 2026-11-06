// 🔔 收件箱（站内信）：成交、借贷、工单回复、预言家、链上留言的通知都在这里，不依赖任何社交软件
// 钱包签一次名（管 30 天）证明是本人，之后每分钟悄悄拉一次；顶栏铃铛显示未读数；开了浏览器通知的，新消息会弹系统通知
(function () {
  "use strict";
  var A = window.AIL, KEY = "ibAuth", W = A.wallets;
  var ICO = { otc: "💱", loan: "🤝", ticket: "📮", msg: "📬", oracle: "🔮", sys: "📣" };
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
  var right = document.querySelector(".top-r"); if (right) right.insertBefore(bell, right.firstChild);
  function badge(n) { var i = bell.querySelector(".ib-n"); i.hidden = !n; i.textContent = n > 99 ? "99+" : n; bell.classList.toggle("has", !!n); }

  function pull(render) {
    if (!auth) return Promise.resolve(null);
    return fetch("/api/inbox?" + q()).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { if (/过期/.test(j.error)) logout(false); return null; }
      badge(j.unread);
      var top = j.list.length ? j.list[0].t : 0;
      if (lastMax && top > lastMax && "Notification" in window && Notification.permission === "granted") {
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
    var K = A.otcKit, Wt = A.wallet, ts = Date.now();
    // 和 OTC / 账本留言同一套连接流程（手机钱包浏览器、EIP-6963、切链都在里面）
    var conn = K && K.connect ? K.connect() : W.choose().then(function (p) { eth = p; return W.ask(p, { method: "eth_requestAccounts" }); }).then(function (a) { return a[0]; });
    return conn.then(function (acc) {
      account = String(acc || "").toLowerCase();
      if (!account) throw new Error("没有拿到钱包地址");
      eth = (Wt && Wt.get && Wt.get()) || W.current() || eth;
      say("请在钱包里点「签名」（免费，不是交易，不花 Gas）");
      var msg = utf8hex(text(account, ts));
      return W.ask(eth, { method: "personal_sign", params: [msg, account] }).catch(function (e) {
        if (/reject|denied|取消|拒绝/i.test(String(e && (e.message || e)))) throw e;
        return W.ask(eth, { method: "personal_sign", params: [account, msg] }); // 个别钱包参数顺序相反
      });
    }).then(function (sig) {
      auth = { a: account, ts: ts, sig: sig }; try { localStorage.setItem(KEY, JSON.stringify(auth)); } catch (e) {}
      btn.disabled = false; lastMax = 0; schedule(); say("✅ 已登录");
      return pull(paint).then(function () { if (location.hash.indexOf("#/inbox") === 0 && A.pages.inbox) A.pages.inbox(cur); });
    }).catch(function (e) {
      btn.disabled = false; say("");
      var m = String(e && (e.message || e.reason || e)) || "";
      if (!eth && !(K && K.account && K.account()) && W.openIn && !/reject|denied|取消|拒绝/i.test(m)) return W.openIn();
      A.errTip(m || "钱包没有响应，请在钱包 App 内置浏览器里打开本站再试", btn);
    });
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
    if (!auth) {
      A.app.innerHTML = '<section class="card ib-login"><h2>🔔 收件箱</h2><p>成交、借贷、工单回复、预言家中奖、链上留言……所有和你钱包有关的通知都在这里，<b>不用加任何社交软件</b>。</p>' +
        '<p class="muted">用钱包签一次名证明是你本人（免费、不花 Gas、不是交易），管 30 天。</p><button type="button" class="nm-go" id="ib-go">🔏 钱包签名，打开我的收件箱</button><p class="muted nm-st" id="ib-st"></p>' +
        '<p class="muted ib-tip">手机请在钱包 App（OKX / Bitget / TokenPocket / MetaMask 等）内置浏览器里打开 ailgns.dev 再点；点了弹出钱包就选「签名」。</p></section>';
      document.getElementById("ib-go").onclick = function () { login(this); };
      return;
    }
    var canN = "Notification" in window, perm = canN ? Notification.permission : "denied";
    A.app.innerHTML = '<section class="card"><div class="card-head"><h2>🔔 收件箱 <small class="muted" id="ib-un"></small></h2><span class="ib-ops"><button type="button" class="ghost" id="ib-seen">全部已读</button><button type="button" class="ghost" id="ib-out" title="换一个钱包">退出</button></span></div>' +
      '<p class="muted ib-who">钱包 <a class="mono" href="#/scan/' + auth.a + '">' + A.short(auth.a) + "</a>" +
      (canN && perm === "default" ? ' · <button type="button" class="link" id="ib-notify">开启浏览器通知</button>（新消息弹到桌面/手机）' : perm === "granted" ? " · ✅ 浏览器通知已开" : (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone ? ' · <span class="muted">iPhone 要先把本站「添加到主屏幕」再从桌面图标打开，才能开通知（<a href="#/app">怎么加 →</a>）</span>' : "")) + "</p>" +
      '<div id="ib-list"><p class="muted">读取中…</p></div></section>';
    document.getElementById("ib-seen").onclick = function () {
      var b = this; b.disabled = true;
      fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: auth.a, ts: auth.ts, sig: auth.sig, action: "seen" }) }).then(function (r) { return r.json(); }).then(function (j) { b.disabled = false; if (j.error) return A.errTip(j.error, b); badge(0); paint(j); });
    };
    document.getElementById("ib-out").onclick = function () { logout(true); A.pages.inbox(id); };
    var nb = document.getElementById("ib-notify");
    if (nb) nb.onclick = function () { Notification.requestPermission().then(function () { if (A.isCurrent(id)) A.pages.inbox(id); }); };
    pull(paint); schedule();
  };
  // 开站就拉一次（已登录的），之后按节奏
  if (auth) { setTimeout(function () { pull(null); schedule(); }, 1500); }
  window.addEventListener("hashchange", schedule);
  A.inbox = { login: function (b) { return login(b); }, authed: function () { return !!auth; } };
})();
