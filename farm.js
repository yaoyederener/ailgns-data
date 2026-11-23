// 开心农场（#/farm）：仿 QQ 农场 / 牧场，种菜、养鸡、偷好友的菜和鸡蛋。金币可以用 Anubis 链 LGNS 充值（充值的 LGNS 进入运营资金），金币换不回币
// 进农场要用钱包签一条文字确认身份（不是交易、不花 Gas），7 天内不用再签；规则和数据在后台 /api/farm（lib/farm.js）
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function sha(t) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)).then(function (d) { return Array.prototype.map.call(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }); }
  function boostCost(sec, b) { return Math.max(b, Math.ceil(sec / 600) * b); }
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

  // 充值弹窗（开心农场、大逃杀共用）：选档位 → 钱包转 LGNS 到运营资金（收款地址以后台返回的 pay.payTo 为准，数据末尾带农场标记）→ 链上确认后后台核对加金币
  // o = { m: 弹窗元素, R: 农场规则（/api/farm?rules=2）, paid: 以前充过没有, addr: 签名进场的钱包, done: 到账后回调(j) }
  function openPay(o) {
    var m = o.m, R = o.R, first = !o.paid;
    // 规则还没读回来就点了「充值」（网慢时会这样，2026-11-14 错误日志：reading 'king'）：先读规则再开弹窗，读不到就给人话提示
    if (!R) {
      if (!m) return;
      m.hidden = false;
      m.innerHTML = '<div class="modal-box"><p class="muted">正在读取充值档位…</p><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>';
      var cl = m.querySelector("[data-close]"); if (cl) cl.onclick = function () { m.hidden = true; };
      fetch("/api/farm?rules=2").then(function (r) { return r.json(); }).then(function (j) {
        var r2 = j && (j.R || j.rules || j);
        if (!r2 || r2.king == null) throw new Error("no rules");
        if (!m.hidden) { o.R = r2; openPay(o); }
      }).catch(function () { if (!m.hidden) m.innerHTML = '<div class="modal-box"><p class="nm-bad">充值档位没读出来，多半是网络慢。请关掉再点一次。</p><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>'; var c2 = m.querySelector("[data-close]"); if (c2) c2.onclick = function () { m.hidden = true; }; });
      return;
    }
    m.hidden = false;
    m.innerHTML = '<div class="modal-box"><div class="card-head"><h2><i class="fm-coin"></i> 充值金币</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
      (first ? '<p class="fm-first">🔥 首充翻倍！第一次充值任意一档，金币 ×2</p>' : "") + '<div class="fm-packs">' +
      R.packs.map(function (p, i) {
        var bonus = Math.round((p.coins / (p.lgns * 100) - 1) * 100), get = p.coins * (first ? 2 : 1);
        return '<button type="button" data-pack="' + i + '">' + (i === 2 ? '<i class="fm-hot">最划算</i>' : "") + "<b>" + A.fmt(get) + " 金币</b><small>" + p.lgns + " LGNS" + (bonus ? " · 多送 " + bonus + "%" : "") + (first ? " · 翻倍" : "") + "</small></button>";
      }).join("") + "</div>" +
      '<ul class="fm-perk"><li>👑 充值后解锁：🎃 黄金南瓜、🐓 金鸡，每日签到 ' + R.daily + " → <b>" + R.dailyVip + "</b> 金币</li><li>💯 累计充值 " + R.king + " LGNS：名字前挂 👑 农场主</li><li>💰 上充值榜：充值的 LGNS 进入运营资金</li></ul>" +
      '<p class="note" id="fm-pst">只收 Anubis 链 LGNS，还要一点 DAI 付 Gas。金币加给付款的钱包，换不回币。</p></div>';
    m.querySelector("[data-close]").onclick = function () { m.hidden = true; };
    m.onclick = function (e) { if (e.target === m) m.hidden = true; };
    function lock(v) { m.querySelectorAll("[data-pack]").forEach(function (b) { b.disabled = v; }); }
    function pay(p) {
      var st = m.querySelector("#fm-pst"), eth, account, data;
      function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; }
      lock(true);
      A.wallets.choose().then(function (x) { eth = x; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) {
        account = String(a[0]).toLowerCase();
        if (account !== o.addr) throw new Error("请用签名进场的钱包 " + A.short(o.addr) + " 付款（现在是 " + A.short(account) + "）");
        say("正在切换到 Anubis 链…");
        return W.switchTo(eth, "anubis");
      }).then(function () { return sha("farm"); }).then(function (h) {
        data = "0xa9059cbb" + A.pad(R.pay.payTo) + u256(BigInt(p.lgns) * 10n ** 9n) + R.pay.tag + h;
        say("正在检查 LGNS 余额…");
        return W.rpcOn("anubis", "eth_call", [{ from: account, to: R.pay.token, data: data }, "latest"]).catch(function () { throw new Error("LGNS 不够：这档要 " + p.lgns + " LGNS（Anubis 链），还要一点 DAI 付 Gas"); });
      }).then(function () {
        say("🔒 请在钱包确认支付 " + p.lgns + " LGNS（进入运营资金）");
        return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: R.pay.token, data: data }] });
      }).then(function (tx) {
        say("已付款，等待链上确认…");
        return W.waitOn("anubis", tx).then(function () { return tx; });
      }).then(function (tx) {
        var n = 0;
        function once() {
          return fetch("/api/farm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: "recharge", tx: tx }) }).then(function (r) { return r.json(); }).then(function (j) {
            if (j.error) { if (++n < 6 && /查不到/.test(j.error)) { say("正在核对付款…"); return new Promise(function (ok) { setTimeout(ok, 3000); }).then(once); } throw new Error(j.error + "（交易 " + tx + "，到账有问题请截图找客服）"); }
            return j;
          });
        }
        return once();
      }).then(function (j) {
        m.hidden = true; o.done(j);
      }, function (e) {
        say((e && e.message) || "付款没成功", true);
        lock(false);
      });
    }
    m.querySelectorAll("[data-pack]").forEach(function (b) { b.onclick = function () { pay(R.packs[+b.getAttribute("data-pack")]); }; });
  }

  var onAcc = null;
  try { A.wallets.onAccounts(function (a) { try { if (onAcc) onAcc(a); } catch (e) { /* 提醒出不来不影响农场 */ } }); } catch (e) { /* 老版本钱包模块没有这个入口 */ }
  function page(rid) {
    var R = null, me = null, sig = getSig(), skew = 0, tab = "farm", timer = null, burned = 0, seenCoins = null, seenLv = null, seenWho = "", walletNow = "";
    A.app.innerHTML = '<section class="fm-scene"><div class="fm-sky" aria-hidden="true"><i class="fm-sun"></i><i class="fm-cloud c1"></i><i class="fm-cloud c2"></i><i class="fm-hill h1"></i><i class="fm-hill h2"></i><span class="fm-prop p1">🏡</span><span class="fm-prop p2">🌳</span><span class="fm-prop p3">🌻</span><span class="fm-prop p4">🐔</span><span class="fm-prop p5">🌲</span><span id="fm-deco"></span></div><div class="fm-top"><h2 id="fm-title">我的农场</h2><span>种菜 · 养鸡 · 偷菜</span></div><div id="fm-stat"></div></section>' +
      '<div class="seg fm-tabs"><button data-t="farm" class="on">🌾 我的农场</button><button data-t="friends">🕵️ 去偷菜</button><button data-t="top">🏆 金币榜</button></div>' +
      '<div id="fm-out"><section class="card"><p class="muted">读取中…</p></section></div><div class="fm-toast" id="fm-toast" hidden></div><div class="modal" id="fm-modal" hidden></div>' +
      '<p class="note">金币只能在农场里花，换不回币，没有奖金奖品。充值的 LGNS 进入运营资金。</p>';
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
    // 农场动态：有完整地址的，把短地址换成域名标签（有 .ailgns 主名字就显示名字，没有还是短地址）
    function logText(l) {
      var m = esc(l.m);
      try { if (/^0x[0-9a-f]{40}$/.test(l.a || "")) m = m.replace(l.a.slice(0, 6) + "…" + l.a.slice(-4), '<b class="fm-lw">' + A.nameTag(l.a) + "</b>"); } catch (e) { /* 换不了就显示原文 */ }
      // 被偷成了的那一条：2 天内可以点「偷回去」，那一次不会被狗和警察拦（站长 2026-11-17）
      try { if (l.rv && l.a && me && me.rv && me.rv[l.a] > Math.floor(Date.now() / 1000) + skew) m += ' <button type="button" class="fm-rv" data-rv="' + l.a + '">⚔️ 偷回去</button>'; } catch (e) { /* 不显示按钮也不影响 */ }
      return m;
    }
    // 工单 #330：偷到了什么，写在被偷的那一家旁边。同一种合并成「🎃×3」，最多列 4 种，后面是这一趟得的金币
    function stolenLabel(j) {
      if (!j) return "";
      var c = {}, ks; (j.what || []).forEach(function (ic) { c[ic] = (c[ic] || 0) + 1; });
      if (j.cut && j.cut.n) c["🌿"] = (c["🌿"] || 0) + j.cut.n;
      ks = Object.keys(c); if (!ks.length) return "";
      var g1 = (j.got || 0) + ((j.cut && j.cut.got) || 0);
      return ks.slice(0, 4).map(function (ic) { return ic + (c[ic] > 1 ? "×" + c[ic] : ""); }).join("") + (ks.length > 4 ? "…" : "") + (g1 ? " +" + A.fmt(g1) : "");
    }
    function post(a, extra, quiet) { // quiet：一键偷菜时不每家弹一次提示，最后汇总
      var b = { a: a, addr: sig.addr, day: sig.day, sig: sig.sig };
      Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
      return fetch("/api/farm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) { if (/签名/.test(j.error)) { setSig(null); sig = null; } throw new Error(j.error); }
        me = j.me; skew = j.me.now - Math.floor(Date.now() / 1000);
        if (j.msg && !quiet) toast(j.msg);
        return j;
      });
    }
    onAcc = function (a) { var x = String((a && a[0]) || "").toLowerCase(); if (/^0x[0-9a-f]{40}$/.test(x) && A.isCurrent(rid)) { walletNow = x; if (sig) stat(); } }; /* 客户在钱包里换了号：顶上马上提醒 */
    function run(a, extra) { return post(a, extra).then(draw, function (e) { toast(e.message, true); if (!sig) draw(); }); }

    /* sw = true：换钱包。农场认的是「签名进场的那个钱包」，记 6 天；以前换了钱包农场还是原来那个号，也没地方换（客户 2026-11-14 反馈） */
    function login(sw) {
      var eth, addr;
      A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) {
        addr = String(a[0] || "").toLowerCase();
        walletNow = addr;
        if (sw === true && sig && addr === sig.addr) throw new Error("钱包里现在还是这个号 " + A.short(addr) + "。先在钱包 App 里切到你要用的那个账户，再回来点「换钱包」。");
        var day = today();
        return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(signText(addr, day)), addr] }).then(function (s) { sig = { addr: addr, day: day, sig: s }; setSig(sig); });
      }).then(function () { return post("me"); }).then(draw, function (e) { toast((e && e.message) || "钱包没连上", true); });
    }
    /* 悄悄问一下钱包现在是哪个号（不弹窗）：和农场的号不一样就在顶上提醒，一点就换 */
    function checkWallet() {
      try { if (A.wallets.silent) A.wallets.silent().then(function (a) { if (a && a !== walletNow) { walletNow = a; if (A.isCurrent(rid)) stat(); } }).catch(function () {}); } catch (e) { /* 问不到就算了，不影响农场 */ }
    }

    /* 金币变多变少、升级时的小动画：只是好看；出错或手机关了动态效果就跳过，不影响农场 */
    function fx(d, up) {
      try {
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        var pill = document.getElementById("fm-coins"), sc = document.querySelector(".fm-scene");
        if (!pill || !sc) return;
        if (d) {
          var f = document.createElement("span"), b = pill.querySelector("b"), to = me.coins, k = 0;
          f.className = "fm-fly" + (d < 0 ? " neg" : "");
          f.textContent = (d > 0 ? "+" : "-") + A.fmt(Math.abs(d));
          pill.appendChild(f); pill.classList.add("up");
          setTimeout(function () { try { f.remove(); pill.classList.remove("up"); } catch (e) { /* 忽略 */ } }, 1300);
          (function step() { k++; if (!b || !b.isConnected) return; b.textContent = A.fmt(Math.round(to - d * (1 - k / 12))); if (k < 12) setTimeout(step, 45); })();
          if (d > 0) for (var i = 0, n = Math.min(12, 4 + Math.floor(d / 40)); i < n; i++) (function (i) {
            var c = document.createElement("i");
            c.className = "fm-coin fm-rain"; c.style.left = (6 + Math.random() * 86) + "%"; c.style.animationDelay = (i * 0.07) + "s";
            sc.appendChild(c); setTimeout(function () { try { c.remove(); } catch (e) { /* 忽略 */ } }, 1500 + i * 70);
          })(i);
        }
        if (up) {
          var l = document.createElement("div");
          l.className = "fm-lvup"; l.textContent = "🎉 升到 " + me.lv + " 级啦！";
          sc.appendChild(l); setTimeout(function () { try { l.remove(); } catch (e) { /* 忽略 */ } }, 2700);
        }
      } catch (e) { /* 动画出错不影响农场 */ }
    }
    function stat() {
      var el = document.getElementById("fm-stat");
      if (!el) return;
      if (!me || !R) { el.innerHTML = ""; return; } /* 规则还没读到就先不画（网慢时点得快会报错，2026-11-21 报错清扫） */
      fmTitle();
      var lv = me.lv, lo = (lv - 1) * (lv - 1) * 10, hi = lv * lv * 10, pct = Math.max(0, Math.min(100, (me.xp - lo) / (hi - lo) * 100));
      var t = now(), dog = me.dog > t ? Math.ceil((me.dog - t) / 3600) : 0, cop = me.cop > t ? Math.ceil((me.cop - t) / 3600) : 0;
      // 站长 2026-11-16：以前超过 48 小时只写「3 天」（四舍五入），续买后看不出是 3 天整还是 3 天 10 小时；狗和警察一个写小时一个写天也让人糊涂。现在统一写「几天几小时」
      var dh = function (h) { return h >= 24 ? Math.floor(h / 24) + " 天" + (h % 24 ? " " + (h % 24) + " 小时" : "") : h + " 小时"; };
      try { /* 站长 2026-11-18 装饰：买了的摆进顶上那幅画里，每样有固定位置 */
        var dz = document.getElementById("fm-deco");
        if (dz) dz.innerHTML = (me.decor || []).map(function (k) { return R.decor && R.decor[k] ? '<span class="fm-prop fm-deco d-' + k + '">' + R.decor[k].icon + "</span>" : ""; }).join("");
      } catch (e) { /* 装饰画不出来不影响农场 */ }
      if (seenWho !== sig.addr) { seenCoins = null; seenLv = null; seenWho = sig.addr; }
      var d0 = seenCoins == null ? 0 : me.coins - seenCoins, up = seenLv != null && lv > seenLv;
      seenCoins = me.coins; seenLv = lv;
      el.innerHTML = '<div class="fm-hud"><span class="fm-pill fm-gold" id="fm-coins"><i class="fm-coin"></i><b class="num">' + A.fmt(me.coins) + '</b> 金币</span><span class="fm-pill fm-lv">⭐ <b>' + lv + "</b> 级</span>" + (me.paid >= R.king ? '<span class="fm-king">👑 农场主</span>' : "") +
        (cop ? '<span class="fm-dog">👮 ' + dh(cop) + "</span>" : "") + (dog ? '<span class="fm-dog">🐕 ' + dh(dog) + "</span>" : "") + '<button type="button" class="fm-pay' + (me.paid ? "" : " first") + '" id="fm-pay"><i class="fm-coin"></i> 充值' + (me.paid ? "" : " · 首充翻倍") + "</button></div>" +
        '<div class="fm-xp"><i style="width:' + pct.toFixed(0) + '%"></i><em>经验 ' + me.xp + " / " + hi + '</em></div><small class="fm-sub"><span class="fm-who">' + A.nameTag(sig.addr) + '</span> <button type="button" class="fmw-sw" id="fmw-sw">换钱包</button> · 升级解锁更贵的种子' + (burned ? " · 🔥 全站农场已销毁 <b>" + A.fmt(burned, 0) + "</b> LGNS" : "") + "</small>" +
        (walletNow && walletNow !== sig.addr ? '<div class="fmw-bar">👛 钱包现在是 <b>' + A.short(walletNow) + "</b>，这里还是 <b>" + A.short(sig.addr) + '</b> 的农场。<button type="button" id="fmw-go">进 ' + A.short(walletNow) + " 的农场</button></div>" : "");
      document.getElementById("fm-pay").onclick = payPicker;
      document.getElementById("fmw-sw").onclick = function () { login(true); };
      var wg = document.getElementById("fmw-go"); if (wg) wg.onclick = function () { login(true); };
      A.fillNames(el);
      if (d0 || up) fx(d0, up);
    }

    /* 🌱 站长 2026-11-23（工单 #375：「韭菜苗看起来像豌豆，能不能换成小草的样子」）：韭菜原来用的 🌿 在不少手机上画出来是圆叶子，像豌豆苗。
       改成自己画的一丛细长叶子（每台手机看到的都一样）。只换页面上的图标；提示文字里的 🌿 不动。 */
    var FMZ_CHIVE = '<svg class="fmz-chive" viewBox="0 0 36 36" width="1em" height="1em" aria-hidden="true"><g stroke="#3a9636" stroke-width="1.300" stroke-linejoin="round">' +
      '<path d="M16.5 34C12 29 7 22 3 14c6.5 5.500 11.500 13 14.500 20z" fill="#6fbf4f"/>' +
      '<path d="M19.500 34C24 29 29 22 33 14c-6.500 5.500-11.500 13-14.500 20z" fill="#6fbf4f"/>' +
      '<path d="M17 34C14 26 11 16 9 6c4.500 8 7.500 18 9 28z" fill="#3f9e3a"/>' +
      '<path d="M19 34c3-8 6-18 8-28-4.500 8-7.500 18-9 28z" fill="#3f9e3a"/>' +
      '<path d="M18 34.500C16.800 24 17.300 12 18 2c.700 10 1.200 22 0 32.500z" fill="#2f8a34"/></g>' +
      '<ellipse cx="18" cy="33.500" rx="3.200" ry="1.600" fill="#eef7dc"/></svg>';
    /* 🌳 工单 #380（2026-11-24）：「发财树的图标太丑了」——摇钱树原来用的是 💰 钱袋。改成自己画的一棵挂满金币的树（每台手机看到的都一样）。只换页面上的图标 */
    var FMZ_TREE = '<svg class="fmz-tree" viewBox="0 0 36 36" width="1em" height="1em" aria-hidden="true">' +
      '<ellipse cx="18" cy="33.6" rx="8" ry="1.8" fill="#d9b98a"/>' +
      '<path d="M15.6 33.6c.9-4.6.9-8.6.2-12.4h4.400c-.700 3.800-.700 7.800.200 12.400z" fill="#a06a35" stroke="#7a4c22" stroke-width=".8" stroke-linejoin="round"/>' +
      '<circle cx="10.5" cy="17.5" r="6.5" fill="#2f9e44"/><circle cx="25.5" cy="17.5" r="6.5" fill="#2f9e44"/><circle cx="18" cy="12.5" r="10" fill="#40b356"/><circle cx="14.5" cy="8.5" r="4.6" fill="#6fd07f" opacity=".75"/>' +
      '<g fill="#ffd43b" stroke="#d9960a" stroke-width=".9"><circle cx="11.5" cy="13" r="3.2"/><circle cx="23.5" cy="10.5" r="3.2"/><circle cx="18" cy="18.5" r="3.4"/><circle cx="8.8" cy="20.5" r="2.6"/><circle cx="27.2" cy="20" r="2.6"/></g>' +
      '<g fill="#d9960a"><rect x="10.7" y="12.2" width="1.6" height="1.6"/><rect x="22.7" y="9.7" width="1.6" height="1.6"/><rect x="17.1" y="17.6" width="1.8" height="1.8"/></g>' +
      '<path d="M29.5 5.500l.700 1.800 1.800.700-1.800.700-.700 1.800-.700-1.800-1.800-.700 1.800-.700z" fill="#fff3b0"/></svg>';
    function cropIc(c) { return c && c.art === "tree" ? FMZ_TREE : c && c.cut ? FMZ_CHIVE : c.icon; }
    /* 🏡 工单 #380：顶上不写「开心农场」，写「某某的农场」，用钱包的主名字（去掉 .ailgns）；没有主名字就写「我的农场」。名字长就缩小一号，出错不影响农场 */
    function fmTitle() {
      try {
        var h = document.getElementById("fm-title"), a = sig && sig.addr;
        if (!h || !a || !A.nameOf) return;
        A.nameOf(a).then(function (n) {
          n = String(n || "").replace(/\.(ailgns|lgns)$/, "");
          if (!n || !h.isConnected) return;
          var L = window.AIL_LANG;
          h.textContent = L === "en" ? n + "'s Farm" : L === "ko" ? n + "의 농장" : n + "的农场";
          h.classList.toggle("long", h.textContent.length > 8);
        }).catch(function () {});
      } catch (e) { /* 名字读不到就留着「我的农场」 */ }
    }
    /* 韭菜割下来地主至少拿多少（规则从服务器来；老缓存没有这一项时按老数显示） */
    function chiveMin() { return R && R.chive ? Math.floor(R.chive.base / 2) : 60; }
    function farmHtml() {
      var t = now(), C = R.crops, ripe = 0;
      var plots = me.plots.map(function (p, i) {
        if (!p) return '<button type="button" class="fm-plot empty" data-plant="' + i + '"><span class="fm-ic fm-plus">＋</span><b>空地</b><small>点击播种</small></button>';
        var c = C[p.c], s = p.t + c.grow - t, pr = Math.min(1, (t - p.t) / c.grow);
        /* 站长 2026-11-18 韭菜：熟了自己不能收，等别人来割；熟了 R.chiveSelf（24 小时）还没人割，才按普通成熟显示、自己收一半 */
        var selfAt = p.t + c.grow + (R.chiveSelf || 86400);
        if (c.cut && s <= 0 && t < selfAt) return '<button type="button" class="fm-plot cutme" data-cutme="' + selfAt + '"><em class="fm-tip cut">割</em><span class="fm-ic">' + cropIc(c) + "</span><b>" + c.name + "</b><small>等别人来割</small></button>";
        if (s <= 0) ripe++;
        return '<div class="fm-plot' + (s <= 0 ? " ripe" : " grow") + '">' + (s <= 0 ? '<em class="fm-tip">收</em><i class="fm-spark">✨</i>' : "") + '<span class="fm-ic' + (s > 0 && (pr >= 0.67 || (c.cut && pr >= 0.34)) ? " young" : "") + '">' + (s <= 0 || pr >= 0.67 ? cropIc(c) : pr < 0.34 ? "🌱" : c.cut ? FMZ_CHIVE : "🌿") + "</span><b>" + c.name + (p.stolen ? '<em class="fm-st">被偷 ' + p.stolen + "</em>" : "") + "</b>" +
          '<small data-ripe="' + (p.t + c.grow) + '">' + left(s) + "</small>" + (s > 0 ? '<i class="fm-bar"><i style="width:' + (pr * 100).toFixed(0) + '%"></i></i><button type="button" class="fm-boost" data-boost="' + i + '">⚡ ' + boostCost(s, R.boost) + "</button>" : "") + "</div>";
      }).join("");
      var more = me.plots.length < 6 + R.plots.length ? '<button type="button" class="fm-plot buy" id="fm-buyplot"><span class="fm-ic fm-plus">＋</span><b>开垦新地</b><small>' + R.plots[me.plots.length - 6] + " 金币</small></button>" : "";
      var H = R.hen, eggs = 0;
      var hens = me.hens.map(function (h) {
        eggs += h.eggs;
        var full = h.fed > t;
        return '<div class="fm-hen' + (full ? "" : " hungry") + (h.g ? " gold" : "") + '"><span class="fm-ic">' + (full ? (h.g ? "🐓" : "🐔") : "😵") + "</span><b>" + (h.eggs ? (h.g ? "🟡" : "🥚").repeat(h.eggs) : "还没下蛋") + "</b><small>" + (full ? "吃饱还剩 " + left(h.fed - t) : "饿了，喂了才下蛋") + "</small></div>";
      }).join("");
      var hungry = me.hens.filter(function (h) { return h.fed - t < 16 * 3600; }).length;
      /* 站长 2026-11-18 奶牛：牛棚排在鸡舍下面，玩法和鸡一样（喂 → 产奶 → 挤奶卖钱） */
      var K = R.cow, cowList = me.cows || [], milks = 0, barn = "";
      if (K) {
        var cows = cowList.map(function (h) {
          milks += h.eggs;
          var full = h.fed > t;
          return '<div class="fm-hen cow' + (full ? "" : " hungry") + '"><span class="fm-ic">' + (full ? "🐄" : "😵") + "</span><b>" + (h.eggs ? "🥛".repeat(h.eggs) : "还没产奶") + "</b><small>" + (full ? "吃饱还剩 " + left(h.fed - t) : "饿了，喂了才产奶") + "</small></div>";
        }).join("");
        var cowHungry = cowList.filter(function (h) { return h.fed - t < K.maxFed - K.feedTime; }).length;
        barn = '<section class="card fm-coop fm-barn"><div class="card-head"><h2>🐄 牛棚</h2><span class="muted">每 ' + K.milkTime / 3600 + " 小时产 1 瓶奶，奶 " + K.milk + " 金币</span></div>" +
          (cows ? '<div class="fm-grid">' + cows + "</div>" : '<p class="muted">还没有奶牛。买一头，喂饱了每 ' + K.milkTime / 3600 + " 小时产一瓶奶（最多攒 " + K.maxMilk + " 瓶，攒多了会被人偷）。</p>") +
          '<div class="fm-acts"><button type="button" id="fm-milk"' + (milks ? "" : " disabled") + ">挤奶" + (milks ? "（" + milks + "）" : "") + "</button>" +
          (cowList.length ? '<button type="button" class="ghost" id="fm-feedcow"' + (cowHungry ? "" : " disabled") + ">喂牛（" + K.feed + " 金币/头）</button>" : "") +
          (cowList.length < K.max ? '<button type="button" class="ghost" id="fm-cow">买奶牛（' + K.price + " 金币）</button>" : "") + "</div></section>";
      }
      var emptyN = me.plots.filter(function (p) { return !p; }).length;
      return '<section class="card fm-field"><div class="card-head"><h2>🌾 菜地</h2><span class="fm-hdb">' + (emptyN ? '<button type="button" id="fm-plantall">🌱 一键种菜（' + emptyN + "）</button>" : "") + '<button type="button" id="fm-harvest"' + (ripe ? ' class="fm-ripe"' : " disabled") + ">" + (ripe ? "🧺 一键收获（" + ripe + "）" : "一键收获") + "</button></span></div>" +
        '<div class="fm-grid">' + plots + more + "</div></section>" +
        '<section class="card fm-coop"><div class="card-head"><h2>🐔 鸡舍</h2><span class="muted">每 2 小时下 1 个蛋，蛋 ' + H.egg + " 金币</span></div>" +
        (hens ? '<div class="fm-grid">' + hens + "</div>" : '<p class="muted">还没有鸡。买一只小母鸡，喂饱了每 2 小时下一个蛋（最多攒 4 个，攒多了会被人偷）。</p>') +
        '<div class="fm-acts"><button type="button" id="fm-eggs"' + (eggs ? "" : " disabled") + ">捡蛋" + (eggs ? "（" + eggs + "）" : "") + "</button>" +
        (me.hens.length ? '<button type="button" class="ghost" id="fm-feed"' + (hungry ? "" : " disabled") + ">喂鸡（" + H.feed + " 金币/只）</button>" : "") +
        (me.hens.filter(function (h) { return !h.g; }).length < H.max ? '<button type="button" class="ghost" id="fm-hen">买鸡（' + H.price + " 金币）</button>" : "") + "</div></section>" + barn +
        '<section class="card fm-shop"><div class="card-head"><h2>🏪 道具商店</h2></div><div class="fm-items">' +
        '<button type="button" id="fm-dog"><span class="fm-ic">🐕</span><b>看门狗</b><small>' + R.dog.price + " 金币 · " + R.dog.days + " 天</small><em>来偷的一半会被咬，赔你 " + R.dog.bite + " 金币；没被咬也最多偷走一半。别人看不到你家有狗</em></button>" +
        (R.cop ? '<button type="button" id="fm-cop"><span class="fm-ic">👮</span><b>警察</b><small>' + R.cop.price + " 金币 · " + R.cop.days + " 天</small><em>看家最牢：来偷的被抓就一颗也偷不走，还罚 " + R.cop.fine + " 金币给你" + (R.cop.nap ? "；警察有 " + R.cop.nap + "% 的机会在打瞌睡，那一次拦不住" : "") + "。别人看不到你家有警察</em></button>" : "") +
        '<button type="button" id="fm-ghen"' + (me.paid ? "" : ' class="vip"') + '><span class="fm-ic">🐓</span><b>金鸡</b><small>' + R.goldHen.price + " 金币 · 最多 " + R.goldHen.max + " 只</small><em>" + (me.paid ? "金蛋每个 " + R.goldHen.egg + " 金币，是普通蛋的 3 倍多" : "👑 充值玩家专属：金蛋每个 " + R.goldHen.egg + " 金币") + "</em></button>" +
        '<button type="button" id="fm-pump"' + (me.paid ? "" : ' class="vip"') + '><span class="fm-ic">🎃</span><b>黄金南瓜</b><small>种子 ' + R.crops.pumpkin.seed + " · 24 小时</small><em>" + (me.paid ? "一块地卖 " + R.crops.pumpkin.yield * R.crops.pumpkin.price + " 金币，到空地里种" : "👑 充值玩家专属：一块地卖 " + R.crops.pumpkin.yield * R.crops.pumpkin.price + " 金币") + "</em></button>" +
        '<button type="button" id="fm-pay2"><span class="fm-ic"><i class="fm-coin"></i></span><b>充值金币</b><small>1 LGNS = 100 金币</small><em>' + (me.paid ? "档位越大送得越多" : "🔥 首充金币翻倍，每日签到变 " + R.dailyVip) + "</em></button>" +
        "</div></section>" +
        (R.decor ? '<section class="card fm-shop fm-decos"><div class="card-head"><h2>🎀 农场装饰</h2><span class="muted">只为好看 · 买了永久有</span></div><div class="fm-items">' +
          Object.keys(R.decor).map(function (k) {
            var d = R.decor[k], has = (me.decor || []).indexOf(k) >= 0;
            return '<button type="button" data-decor="' + k + '"' + (has ? ' disabled class="has"' : "") + '><span class="fm-ic">' + d.icon + "</span><b>" + d.name + "</b><small>" + (has ? "✅ 已拥有" : A.fmt(d.price) + " 金币") + "</small></button>";
          }).join("") + '</div><p class="note">装饰没有别的作用，就是好看：摆在你农场顶上那幅画里，好友列表和金币榜上你的名字后面也会显示。</p></section>' : "") +
        (me.log.length ? '<section class="card"><div class="card-head"><h2>📜 农场动态</h2></div><ul class="fm-log">' + me.log.slice(0, 10).map(function (l) {
          return "<li><small>" + new Date(l.t * 1000).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + "</small> " + logText(l) + "</li>";
        }).join("") + "</ul></section>" : "");
    }

    function seedPicker(i) {
      var m = document.getElementById("fm-modal"), C = R.crops, all = i === "all", emptyN = me.plots.filter(function (p) { return !p; }).length;
      m.hidden = false;
      m.innerHTML = '<div class="modal-box"><div class="card-head"><h2>' + (all ? "一键种菜 · 选种子" : "选种子") + "</h2>" + (all ? '<span class="muted">' + emptyN + " 块空地全种上</span>" : "") + '<button class="ghost" data-close style="padding:4px 12px">关闭</button></div><div class="fm-seeds">' +
        Object.keys(C).map(function (k) {
          var c = C[k], lock = me.lv < c.lv || (c.vip && !me.paid);
          return '<button type="button" data-seed="' + k + '"' + (lock || me.coins < c.seed ? " disabled" : "") + '><span class="fm-ic">' + cropIc(c) + "</span><b>" + c.name + "</b><small>" +
            (lock ? (c.vip && !me.paid ? "👑 充值解锁" : "🔒 " + c.lv + " 级解锁") : c.seed + " 金币 · " + left(c.grow).replace(" 0 秒", "").replace(" 0 分", "") + (c.cut ? " · 别人来割，对半分，你至少得 " + chiveMin() : " · 卖 " + c.yield * c.price)) + "</small></button>";
        }).join("") + "</div></div>";
      m.querySelector("[data-close]").onclick = function () { m.hidden = true; };
      m.onclick = function (e) { if (e.target === m) m.hidden = true; };
      m.querySelectorAll("[data-seed]").forEach(function (b) { b.onclick = function () { m.hidden = true; if (all) run("plantAll", { crop: b.getAttribute("data-seed") }); else run("plant", { plot: i, crop: b.getAttribute("data-seed") }); }; });
    }

    /* 站长 2026-11-13：吃一堑长一智。被哪家警察抓过，记在这台手机里，1 天内一键偷菜自动绕开那家；单独点「偷」不拦 */
    var COP_SKIP = 86400;
    function copMap() { try { var m = JSON.parse(localStorage.getItem("farm:cop:" + sig.addr) || "{}") || {}, t = Date.now() / 1000, k; for (k in m) if (!(t - m[k] < COP_SKIP)) delete m[k]; return m; } catch (e) { return {}; } }
    function copMark(a) { try { var m = copMap(); m[String(a).toLowerCase()] = Math.floor(Date.now() / 1000); localStorage.setItem("farm:cop:" + sig.addr, JSON.stringify(m)); } catch (e) {} }
    function friendsHtml(d, top) {
      var rows = top ? d.top : d.friends;
      if (!rows.length) return '<section class="card"><p class="muted">' + (top ? "还没有人" : "还没有别的农场主。把 ailgns.dev/#/farm 发给朋友，一起来偷菜！") + "</p></section>";
      var cm = top ? {} : copMap(), skip = top ? 0 : rows.filter(function (x) { return x.ripe && cm[x.a]; }).length;
      var can = top ? 0 : rows.filter(function (x) { return x.ripe && !cm[x.a]; }).length; // 站长 2026-11-12：一键偷菜，把现在能偷的人家一家一家偷过去
      return (can ? '<section class="card fm-allc"><button type="button" id="fm-all" class="fm-all">🧺 一键偷菜（' + can + ' 家能偷）</button>' + (skip ? '<p class="fm-skip">👮 有 ' + skip + ' 家的警察 1 天内抓过你，这一轮自动绕开</p>' : "") + '<p class="muted">一家一家偷过去，每家算 1 次；有的人家养了狗或请了警察，可能被咬、被抓。<b>一轮偷下来要是亏了，系统补回到不亏</b>（每天最多补 ' + ((R && R.baodi) || 100) + ' 金币）。被警察抓过的农场，1 天内一键偷菜自动绕开；想再试可以单独点那一家。</p></section>' : "") +
        '<section class="card"><ul class="fm-fr">' + rows.map(function (x, i) {
        return "<li" + (top ? (i < 3 ? ' class="r' + (i + 1) + '"' : "") : x.ripe ? ' class="can"' : "") + ">" + (top ? '<span class="fm-n">' + (i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1) + "</span>" : "") + '<span class="fm-who">' + (x.king ? "👑 " : "") + A.nameTag(x.a) + (x.dc ? ' <i class="fm-dc">' + esc(x.dc) + "</i>" : "") + "</span><small>⭐" + x.lv + " · 💰" + A.fmt(x.c) + "</small>" +
          (top ? "" : x.ripe ? '<button type="button" data-steal="' + x.a + '"' + (cm[x.a] ? ' data-cop="1" class="cop">👮 抓过你' : ">🕵️ 偷") + "</button>" : '<span class="muted fm-wait">没熟</span>') + "</li>";
      }).join("") + "</ul></section>" + (top ? burnHtml(d) : "");
    }

    function burnHtml(d) {
      return '<section class="card"><div class="card-head"><h2>💰 充值榜</h2><span class="muted">全站农场已销毁 ' + A.fmt(d.burned || 0, 0) + " LGNS</span></div>" +
        (d.burners.length ? '<ul class="fm-fr">' + d.burners.map(function (x, i) {
          return "<li" + (i < 3 ? ' class="r' + (i + 1) + '"' : "") + '><span class="fm-n">' + (i < 3 ? ["👑", "🥈", "🥉"][i] : i + 1) + '</span><span class="fm-who">' + A.nameTag(x.a) + "</span><small>充值 <b>" + A.fmt(x.v) + "</b> LGNS</small></li>";
        }).join("") + "</ul>" : '<p class="muted">还没有人充值，第一个充值的就是榜一农场主！</p>') + "</section>";
    }

    // 充值：弹窗和付款流程在外层 openPay（开心农场、大逃杀共用）
    function payPicker() {
      openPay({ m: document.getElementById("fm-modal"), R: R, paid: me.paid, addr: sig.addr, done: function (j) { me = j.me; toast(j.msg); draw(); } });
    }

    function draw() {
      if (!A.isCurrent(rid)) return;
      stat();
      if (!sig) {
        out.innerHTML = '<section class="card fm-login"><div class="fm-big"><span>🧑‍🌾</span><span>🐔</span><span>🥬</span></div><p>用钱包签个名就能进农场，<b>不是转账、不花 Gas</b>，7 天内不用再签。</p><p class="muted">新农场送 200 金币和 6 块地。</p><button type="button" id="fm-login">🔑 签名进入农场</button></section>';
        document.getElementById("fm-login").onclick = login;
        return;
      }
      if (!me || !R) return;
      if (tab === "farm") {
        out.innerHTML = farmHtml();
        out.querySelectorAll("[data-plant]").forEach(function (b) { b.onclick = function () { seedPicker(+b.getAttribute("data-plant")); }; });
        var on = function (id, fn) { var e = document.getElementById(id); if (e) e.onclick = fn; };
        on("fm-harvest", function () { run("harvest"); });
        on("fm-plantall", function () { seedPicker("all"); });
        // 站长 2026-11-12：熟了的菜地一闪一闪，客户会去点它 → 点熟菜地也等于点「一键收获」
        out.querySelectorAll(".fm-plot.ripe").forEach(function (b) { b.onclick = function () { run("harvest"); }; });
        out.querySelectorAll("[data-cutme]").forEach(function (b) { b.onclick = function () { var c = R.crops.chive, s = +b.getAttribute("data-cutme") - now(); toast("🌿 韭菜自己不能收，等别人来割：割下来两人对半分，你至少得 " + chiveMin() + " 金币，来割的人金币越少割得越多。" + (s > 0 ? "再过 " + left(s) + " 还没人割，你可以自己收一半" : "现在可以自己收一半了，刷新一下")); }; });
        on("fm-buyplot", function () { if ((A.sure || confirm)("花 " + R.plots[me.plots.length - 6] + " 金币开垦一块新地？")) run("buyPlot"); });
        on("fm-eggs", function () { run("eggs"); });
        out.querySelectorAll(".fm-rv").forEach(function (b) { b.onclick = function () { b.disabled = true; run("steal", { to: b.getAttribute("data-rv") }); }; }); // ⚔️ 偷回去：复仇那一次不会被拦
        on("fm-feed", function () { run("feed"); });
        on("fm-hen", function () { run("buyHen"); });
        on("fm-milk", function () { run("milk"); });
        on("fm-feedcow", function () { run("feedCow"); });
        on("fm-cow", function () { if ((A.sure || confirm)("花 " + R.cow.price + " 金币买一头奶牛？")) run("buyCow"); });
        out.querySelectorAll("[data-decor]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-decor"), d = R.decor[k]; if ((A.sure || confirm)("花 " + d.price + " 金币买「" + d.name + "」？只是好看，没有别的作用")) run("buyDecor", { k: k }); }; });
        on("fm-dog", function () { if ((A.sure || confirm)("花 " + R.dog.price + " 金币请看门狗看 " + R.dog.days + " 天？")) run("dog"); });
        on("fm-cop", function () { if ((A.sure || confirm)("花 " + R.cop.price + " 金币请警察看 " + R.cop.days + " 天？")) run("cop"); });
        on("fm-ghen", function () { if (!me.paid) return payPicker(); if ((A.sure || confirm)("花 " + R.goldHen.price + " 金币买一只金鸡？")) run("goldHen"); });
        on("fm-pump", function () { if (!me.paid) return payPicker(); var i = me.plots.indexOf(null); if (i < 0) return toast("没有空地了，先收菜或开垦新地", true); seedPicker(i); });
        on("fm-pay2", payPicker);
        out.querySelectorAll("[data-boost]").forEach(function (b) { b.onclick = function () { run("boost", { plot: +b.getAttribute("data-boost") }); }; });
        A.fillNames(out);
        return;
      }
      out.innerHTML = '<section class="card"><p class="muted">读取中…</p></section>';
      var want = tab;
      fetch("/api/farm?list=1&me=" + sig.addr).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(rid) || tab !== want) return;
        out.innerHTML = friendsHtml(d, tab === "top") + (tab === "friends" ? '<p class="note">🌿 <b>别人家熟了的韭菜可以帮忙割</b>：割下来和对方对半分，每块每人 ' + chiveMin() + " 金币起；你手里的金币越少割得越多（不到 500 金币翻倍，不到 5000 金币 1.5 倍）。狗和警察不拦，点「偷」就一起割了。</p>" + '<p class="note">🎁 <b>每天第一次偷必得手</b>，对方有狗有警察也拦不住。被人偷了？回农场首页「农场动态」点「⚔️ 偷回去」，那一次同样不会被拦。</p><p class="note">别人的菜熟了没收，就能去偷：每块地每人只能偷 1 颗，最多被偷走 40%；鸡蛋攒到 2 个以上能偷 1 个。每天最多偷 ' + R.stealDay + " 次。🐕 有的农场养了看门狗，从外面看不出来：一半机会被咬（空手而归，赔 " + R.dog.bite + " 金币），没被咬也只能偷到一部分。" + (R.cop ? "👮 有的农场请了警察，也看不出来：被抓就空手而归，罚 " + R.cop.fine + " 金币" + (R.cop.nap ? "；警察有 " + R.cop.nap + "% 的机会在打瞌睡，那一次能偷到" : "") + "。" : "") + "</p>" : "");
        var all = out.querySelector("#fm-all");
        if (all) all.onclick = function () {
          var bs = [].slice.call(out.querySelectorAll("[data-steal]")).filter(function (b) { return !b.disabled && !b.hasAttribute("data-cop"); }), c0 = me ? me.coins : 0, ok = 0, bad = 0, no = 0, cops = 0, i = 0, tally = {}, cutN = 0, cutGot = 0, lostAll = 0, best = null, batch = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); // 这一轮的编号，服务器按它算保底
          if (!bs.length) return toast("现在没有能偷的了", true);
          all.disabled = true;
          (function next() {
            if (i >= bs.length || !A.isCurrent(rid)) return done();
            var b = bs[i++]; b.disabled = true; all.textContent = "🧺 偷菜中… " + i + "/" + bs.length;
            post("steal", { to: b.getAttribute("data-steal"), batch: batch }, true).then(function (j) { if (j && j.bit) { bad++; if (/警察/.test(j.msg || "")) { cops++; copMark(b.getAttribute("data-steal")); b.setAttribute("data-cop", "1"); b.textContent = "👮 被抓了"; } else b.textContent = "🐕 被咬了"; } else { ok++; b.textContent = "✅ " + (stolenLabel(j) || "偷到了"); }
              // 工单 #330：记下这一家偷到了什么，最后的结果框按品种汇总，并说在谁家偷得最多
              if (j) {
                (j.what || []).forEach(function (ic) { tally[ic] = (tally[ic] || 0) + 1; });
                if (j.cut) { cutN += j.cut.n || 0; cutGot += j.cut.got || 0; }
                if (j.lost) lostAll += j.lost;
                var g1 = (j.got || 0) + ((j.cut && j.cut.got) || 0), li = b.closest("li"), who = li && li.querySelector(".fm-who");
                if (g1 > 0 && (!best || g1 > best.g)) best = { g: g1, who: who ? who.textContent.trim() : "" };
              }
              next(); },
              function (e) { no++; b.textContent = "偷不到"; if (/今天已经偷了|签名/.test(e.message)) { toast(e.message, true); return done(); } next(); });
          })();
          function done() {
            all.textContent = "🧺 偷完了";
            var end = function (j) { // 先让服务器结这一轮的账：亏了就补回（保底），再报结果
              var d = (me ? me.coins : 0) - c0, back = (j && j.back) || 0; stat();
              // 站长 2026-11-16：结果提示以前 2.6 秒就消失，没看完。改成弹窗，点「知道了」才关；弹窗开不了（已经离开农场页）才退回原来的小提示
              var line = "一键偷菜：偷到 " + ok + " 家" + (bad ? "，被咬 / 被抓 " + bad + " 家" : "") + (no ? "，偷不到 " + no + " 家" : "") + (back ? "，保底补回 " + back : "") + "，金币 " + (d >= 0 ? "+" : "") + A.fmt(d) + (cops ? "。记住了 " + cops + " 家有警察，1 天内自动绕开" : "");
              var sm = document.getElementById("fm-modal");
              if (!sm || !A.isCurrent(rid)) return toast(line);
              sm.hidden = false;
              sm.innerHTML = '<div class="modal-box fm-sum"><h2>🧺 一键偷菜结果</h2><div class="fm-sumn ' + (d >= 0 ? "up" : "dn") + '"><small>金币</small><b>' + (d >= 0 ? "+" : "") + A.fmt(d) + "</b></div><ul>" +
                "<li>✅ 偷到 <b>" + ok + "</b> 家</li>" +
                (Object.keys(tally).length ? '<li class="fm-sumw">🧺 偷到的东西：' + Object.keys(tally).sort(function (x, y) { return tally[y] - tally[x]; }).map(function (ic) { return "<span>" + ic + " ×" + tally[ic] + "</span>"; }).join("") + "</li>" : "") +
                (cutN ? "<li>🌿 割韭菜 <b>" + cutN + "</b> 块，得 <b>" + A.fmt(cutGot) + "</b> 金币</li>" : "") +
                (best && ok > 1 ? "<li>🏆 最肥的一家：<b>" + esc(best.who) + "</b>，+" + A.fmt(best.g) + " 金币</li>" : "") +
                (lostAll ? "<li>💸 被咬 / 被抓共赔 <b>" + A.fmt(lostAll) + "</b> 金币</li>" : "") + (bad ? "<li>🐕 被咬 / 👮 被抓 <b>" + bad + "</b> 家</li>" : "") + (no ? "<li>偷不到 <b>" + no + "</b> 家</li>" : "") + (back ? "<li>🛟 保底补回 <b>" + back + "</b> 金币</li>" : "") + (cops ? "<li>👮 记住了 <b>" + cops + "</b> 家有警察，1 天内自动绕开</li>" : "") +
                '</ul><button type="button" class="fm-sumok" id="fm-sumok">知道了</button></div>';
              document.getElementById("fm-sumok").onclick = function () { sm.hidden = true; sm.innerHTML = ""; };
            };
            post("steal_end", { batch: batch }, true).then(end, function () { end(null); });
          }
        };
        out.querySelectorAll("[data-steal]").forEach(function (b) {
          b.onclick = function () { b.disabled = true; post("steal", { to: b.getAttribute("data-steal") }).then(function (j) { stat(); if (j && j.bit && /警察/.test(j.msg || "")) { copMark(b.getAttribute("data-steal")); b.setAttribute("data-cop", "1"); b.textContent = "👮 被抓了"; } else b.textContent = j && j.bit ? "🐕 被咬了" : "✅ " + (stolenLabel(j) || "偷到了"); }, function (e) { toast(e.message, true); b.textContent = "偷不到"; }); };
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

    fetch("/api/farm?list=1").then(function (r) { return r.json(); }).then(function (d) { burned = d.burned || 0; stat(); }).catch(function () {});
    fetch("/api/farm?rules=2", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (r) {
      R = r;
      if (sig) { checkWallet(); return post("me").then(draw, function (e) { toast(e.message, true); draw(); }); }
      draw();
    }, function () { out.innerHTML = '<section class="card"><p class="muted">读取失败，请稍后再试</p></section>'; });
  }

  A.farmPay = openPay;
  A.pages.farm = page;
})();
