// 开心农场（#/farm）：仿 QQ 农场 / 牧场，种菜、养鸡、偷好友的菜和鸡蛋。只用游戏金币，不花真钱，金币换不成币
// 进农场要用钱包签一条文字确认身份（不是交易、不花 Gas），7 天内不用再签；规则和数据在后台 /api/farm（lib/farm.js）
(function () {
  "use strict";

  var A = window.AIL;
  var SIG_KEY = "farm:sig";

  function utf8hex(str) { var b = unescape(encodeURIComponent(str)), h = "0x"; for (var i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return h; }
  // 签名文字必须和 lib/farm.js 的 signText 一字不差
  function signText(addr, day) { return "AiLGNS 开心农场\n用这个钱包进入农场：" + addr + "\n只是签名确认身份，不是转账，不花 Gas。\n日期：" + day; }
  function today() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
  function getSig() {
    try {
      var s = JSON.parse(localStorage.getItem(SIG_KEY) || "null");
      if (s && Date.now() - Date.parse(s.day + "T00:00:00+08:00") < 6 * 86400e3) return s;
    } catch (e) { /* 无痕模式 */ }
    return null;
  }
  function setSig(s) { try { if (s) localStorage.setItem(SIG_KEY, JSON.stringify(s)); else localStorage.removeItem(SIG_KEY); } catch (e) { /* 忽略 */ } }
  function left(s) {
    if (s <= 0) return "已成熟";
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h ? h + " 小时 " + m + " 分" : m ? m + " 分 " + x + " 秒" : x + " 秒";
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function page(rid) {
    var R = null, me = null, sig = getSig(), skew = 0, tab = "farm", timer = null;
    A.app.innerHTML = '<section class="card fm-hero"><div class="fm-top"><h2>🏡 开心农场</h2><span class="muted">种菜 · 养鸡 · 偷菜</span></div><div id="fm-stat"></div></section>' +
      '<div class="seg fm-tabs"><button data-t="farm" class="on">🌾 我的农场</button><button data-t="friends">🕵️ 去偷菜</button><button data-t="top">🏆 金币榜</button></div>' +
      '<div id="fm-out"><section class="card"><p class="muted">读取中…</p></section></div><div class="fm-toast" id="fm-toast" hidden></div><div class="modal" id="fm-modal" hidden></div>' +
      '<p class="note">玩法纯属娱乐：只用游戏金币，不花真钱，金币也换不成币。</p>';
    document.querySelectorAll(".fm-tabs button").forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute("data-t"); document.querySelectorAll(".fm-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); };
    });
    var out = document.getElementById("fm-out");

    function toast(t, bad) {
      var el = document.getElementById("fm-toast");
      if (!el) return;
      el.textContent = t; el.className = "fm-toast" + (bad ? " bad" : ""); el.hidden = false;
      clearTimeout(el._t); el._t = setTimeout(function () { el.hidden = true; }, 2600);
    }
    function now() { return Math.floor(Date.now() / 1000) + skew; }
    function post(a, extra) {
      var b = { a: a, addr: sig.addr, day: sig.day, sig: sig.sig };
      Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
      return fetch("/api/farm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) { if (/签名/.test(j.error)) { setSig(null); sig = null; } throw new Error(j.error); }
        me = j.me; skew = j.me.now - Math.floor(Date.now() / 1000);
        if (j.msg) toast(j.msg);
        return j;
      });
    }
    function run(a, extra) { return post(a, extra).then(draw, function (e) { toast(e.message, true); if (!sig) draw(); }); }

    function login() {
      var eth, addr;
      A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) {
        addr = String(a[0] || "").toLowerCase();
        var day = today();
        return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(signText(addr, day)), addr] }).then(function (s) { sig = { addr: addr, day: day, sig: s }; setSig(sig); });
      }).then(function () { return post("me"); }).then(draw, function (e) { toast((e && e.message) || "钱包没连上", true); });
    }

    function stat() {
      var el = document.getElementById("fm-stat");
      if (!el) return;
      if (!me) { el.innerHTML = ""; return; }
      var lv = me.lv, lo = (lv - 1) * (lv - 1) * 10, hi = lv * lv * 10, pct = Math.max(0, Math.min(100, (me.xp - lo) / (hi - lo) * 100));
      el.innerHTML = '<div class="fm-stat"><span>💰 <b class="num">' + A.fmt(me.coins) + '</b> 金币</span><span>⭐ <b>' + lv + '</b> 级</span><span class="fm-who">' + A.nameTag(sig.addr) + "</span></div>" +
        '<div class="fm-xp"><i style="width:' + pct.toFixed(0) + '%"></i></div><small class="muted">经验 ' + me.xp + " / " + hi + "，升级解锁更贵的种子</small>";
      A.fillNames(el);
    }

    function farmHtml() {
      var t = now(), C = R.crops, ripe = 0;
      var plots = me.plots.map(function (p, i) {
        if (!p) return '<button type="button" class="fm-plot empty" data-plant="' + i + '"><span class="fm-ic">🟫</span><b>空地</b><small>点击播种</small></button>';
        var c = C[p.c], s = p.t + c.grow - t, pr = Math.min(1, (t - p.t) / c.grow);
        if (s <= 0) ripe++;
        return '<div class="fm-plot' + (s <= 0 ? " ripe" : "") + '"><span class="fm-ic">' + (s <= 0 ? c.icon : pr < 0.5 ? "🌱" : "🌿") + "</span><b>" + c.name + (p.stolen ? '<em class="fm-st">被偷 ' + p.stolen + "</em>" : "") + "</b>" +
          '<small data-ripe="' + (p.t + c.grow) + '">' + left(s) + "</small>" + (s > 0 ? '<i class="fm-bar"><i style="width:' + (pr * 100).toFixed(0) + '%"></i></i>' : "") + "</div>";
      }).join("");
      var more = me.plots.length < 12 ? '<button type="button" class="fm-plot buy" id="fm-buyplot"><span class="fm-ic">➕</span><b>开垦新地</b><small>' + R.plots[me.plots.length - 6] + " 金币</small></button>" : "";
      var H = R.hen, eggs = 0;
      var hens = me.hens.map(function (h) {
        eggs += h.eggs;
        var full = h.fed > t;
        return '<div class="fm-hen' + (full ? "" : " hungry") + '"><span class="fm-ic">' + (full ? "🐔" : "😵") + "</span><b>" + (h.eggs ? "🥚".repeat(h.eggs) : "还没下蛋") + "</b><small>" + (full ? "吃饱还剩 " + left(h.fed - t) : "饿了，喂了才下蛋") + "</small></div>";
      }).join("");
      var hungry = me.hens.filter(function (h) { return h.fed - t < 16 * 3600; }).length;
      return '<section class="card"><div class="card-head"><h2>🌾 菜地</h2><button type="button" id="fm-harvest"' + (ripe ? "" : " disabled") + ">一键收获" + (ripe ? "（" + ripe + "）" : "") + "</button></div>" +
        '<div class="fm-grid">' + plots + more + "</div></section>" +
        '<section class="card"><div class="card-head"><h2>🐔 鸡舍</h2><span class="muted">每 2 小时下 1 个蛋，蛋 ' + H.egg + " 金币</span></div>" +
        (hens ? '<div class="fm-grid">' + hens + "</div>" : '<p class="muted">还没有鸡。买一只小母鸡，喂饱了每 2 小时下一个蛋（最多攒 4 个，攒多了会被人偷）。</p>') +
        '<div class="fm-acts"><button type="button" id="fm-eggs"' + (eggs ? "" : " disabled") + ">捡蛋" + (eggs ? "（" + eggs + "）" : "") + "</button>" +
        (me.hens.length ? '<button type="button" class="ghost" id="fm-feed"' + (hungry ? "" : " disabled") + ">喂鸡（" + H.feed + " 金币/只）</button>" : "") +
        (me.hens.length < H.max ? '<button type="button" class="ghost" id="fm-hen">买鸡（' + H.price + " 金币）</button>" : "") + "</div></section>" +
        (me.log.length ? '<section class="card"><div class="card-head"><h2>📜 农场动态</h2></div><ul class="fm-log">' + me.log.slice(0, 10).map(function (l) {
          return "<li><small>" + new Date(l.t * 1000).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + "</small> " + esc(l.m) + "</li>";
        }).join("") + "</ul></section>" : "");
    }

    function seedPicker(i) {
      var m = document.getElementById("fm-modal"), C = R.crops;
      m.hidden = false;
      m.innerHTML = '<div class="modal-box"><div class="card-head"><h2>选种子</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div><div class="fm-seeds">' +
        Object.keys(C).map(function (k) {
          var c = C[k], lock = me.lv < c.lv;
          return '<button type="button" data-seed="' + k + '"' + (lock || me.coins < c.seed ? " disabled" : "") + '><span class="fm-ic">' + c.icon + "</span><b>" + c.name + "</b><small>" +
            (lock ? "🔒 " + c.lv + " 级解锁" : c.seed + " 金币 · " + left(c.grow).replace(" 0 秒", "").replace(" 0 分", "") + " · 卖 " + c.yield * c.price) + "</small></button>";
        }).join("") + "</div></div>";
      m.querySelector("[data-close]").onclick = function () { m.hidden = true; };
      m.onclick = function (e) { if (e.target === m) m.hidden = true; };
      m.querySelectorAll("[data-seed]").forEach(function (b) { b.onclick = function () { m.hidden = true; run("plant", { plot: i, crop: b.getAttribute("data-seed") }); }; });
    }

    function friendsHtml(d, top) {
      var rows = top ? d.top : d.friends;
      if (!rows.length) return '<section class="card"><p class="muted">' + (top ? "还没有人" : "还没有别的农场主。把 ailgns.dev/#/farm 发给朋友，一起来偷菜！") + "</p></section>";
      return '<section class="card"><ul class="fm-fr">' + rows.map(function (x, i) {
        return "<li>" + (top ? '<span class="fm-n">' + (i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1) + "</span>" : "") + '<span class="fm-who">' + A.nameTag(x.a) + "</span><small>⭐" + x.lv + " · 💰" + A.fmt(x.c) + "</small>" +
          (top ? "" : x.ripe ? '<button type="button" data-steal="' + x.a + '">🕵️ 偷</button>' : '<span class="muted fm-wait">没熟</span>') + "</li>";
      }).join("") + "</ul></section>";
    }

    function draw() {
      if (!A.isCurrent(rid)) return;
      stat();
      if (!sig) {
        out.innerHTML = '<section class="card fm-login"><div class="fm-big">🧑‍🌾🐔🥬</div><p>用钱包签个名就能进农场，<b>不是转账、不花 Gas</b>，7 天内不用再签。</p><p class="muted">新农场送 200 金币和 6 块地。</p><button type="button" id="fm-login">🔑 签名进入农场</button></section>';
        document.getElementById("fm-login").onclick = login;
        return;
      }
      if (!me || !R) return;
      if (tab === "farm") {
        out.innerHTML = farmHtml();
        out.querySelectorAll("[data-plant]").forEach(function (b) { b.onclick = function () { seedPicker(+b.getAttribute("data-plant")); }; });
        var on = function (id, fn) { var e = document.getElementById(id); if (e) e.onclick = fn; };
        on("fm-harvest", function () { run("harvest"); });
        on("fm-buyplot", function () { if (confirm("花 " + R.plots[me.plots.length - 6] + " 金币开垦一块新地？")) run("buyPlot"); });
        on("fm-eggs", function () { run("eggs"); });
        on("fm-feed", function () { run("feed"); });
        on("fm-hen", function () { run("buyHen"); });
        A.fillNames(out);
        return;
      }
      out.innerHTML = '<section class="card"><p class="muted">读取中…</p></section>';
      var want = tab;
      fetch("/api/farm?list=1&me=" + sig.addr).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(rid) || tab !== want) return;
        out.innerHTML = friendsHtml(d, tab === "top") + (tab === "friends" ? '<p class="note">别人的菜熟了没收，就能去偷：每块地每人只能偷 1 颗，最多被偷走 40%；鸡蛋攒到 2 个以上能偷 1 个。每天最多偷 ' + R.stealDay + " 次。</p>" : "");
        out.querySelectorAll("[data-steal]").forEach(function (b) {
          b.onclick = function () { b.disabled = true; post("steal", { to: b.getAttribute("data-steal") }).then(function () { stat(); b.textContent = "✅ 偷到了"; }, function (e) { toast(e.message, true); b.textContent = "偷不到"; }); };
        });
        A.fillNames(out);
      }, function () { out.innerHTML = '<section class="card"><p class="muted">读取失败，请稍后再试</p></section>'; });
    }

    // 倒计时每秒走一次；有菜刚成熟就整块重画（变成可收获）
    timer = setInterval(function () {
      if (!A.isCurrent(rid)) { clearInterval(timer); return; }
      if (tab !== "farm" || !me) return;
      var t = now(), redraw = false;
      out.querySelectorAll("[data-ripe]").forEach(function (el) {
        var s = +el.getAttribute("data-ripe") - t;
        if (s <= 0 && el.textContent !== "已成熟") redraw = true;
        el.textContent = left(s);
      });
      if (redraw) draw();
    }, 1000);

    fetch("/api/farm?rules=1").then(function (r) { return r.json(); }).then(function (r) {
      R = r;
      if (sig) return post("me").then(draw, function (e) { toast(e.message, true); draw(); });
      draw();
    }, function () { out.innerHTML = '<section class="card"><p class="muted">读取失败，请稍后再试</p></section>'; });
  }

  A.pages.farm = page;
})();
