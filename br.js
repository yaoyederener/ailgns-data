// 大逃杀（#/br，试运行）：8 个房间，每 60 秒一局，押开心农场的金币。规则和结算全在后台 /api/br（lib/br.js），这里只管显示和点按钮
// 身份和开心农场共用一条签名（不是交易、不花 Gas），所以签名文字、存放位置必须和 farm.js 一字不差
(function () {
  "use strict";

  var A = window.AIL, SIG_KEY = "farm:sig", CHIPS = [10, 50, 100, 500, 1000];
  function utf8hex(str) { var b = unescape(encodeURIComponent(str)), h = "0x"; for (var i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return h; }
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
  function num(n) { return Number(n || 0).toLocaleString("en-US"); }
  var DEF = [["🌾", "谷仓"], ["🐔", "鸡舍"], ["🥕", "菜窖"], ["🍎", "果园"], ["🐟", "鱼塘"], ["🌻", "花房"], ["🛖", "草屋"], ["⛲", "水井"]];

  /* 地图上每个房间的位置（左、上、宽、高，都是占地图的百分比）；右下角空着的是大灰狼的树林 */
  var LAY = [[3, 12, 41, 21], [47, 14, 21, 17], [71, 12, 26, 21], [3, 37, 31, 22], [37, 35, 31, 26], [71, 37, 26, 25], [3, 63, 31, 23], [37, 65, 31, 21]];
  var WOODS = [84, 80], PETS = ["🐥", "🐷", "🐮", "🐑", "🐰", "🦆"];
  function ctr(i) { var L = LAY[i] || LAY[0]; return [L[0] + L[2] / 2, L[1] + L[3] / 2 + 3]; }
  function rnd(a, b, c) { var x = Math.sin(a * 97.13 + b * 31.7 + c * 7.77) * 43758.5453; return x - Math.floor(x); }
  function short(n) { n = Number(n || 0); return n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "万" : num(n); }
  /* 房间里的小动物：位置按房间号和序号固定算出来，刷新时不会乱跳；最多画 8 只，多的写 +N */
  function folks(i, n, mine, dead) {
    var h = "", k, show = Math.min(n, 8);
    for (k = 0; k < show; k++) {
      var isMe = mine && k === 0;
      h += '<i class="dt-p' + (isMe ? " me" : "") + '" style="left:' + (6 + rnd(i, k, 1) * 66).toFixed(0) + "%;top:" + (46 + rnd(i, k, 2) * 26).toFixed(0) + "%;animation-delay:-" + (rnd(i, k, 3) * 2).toFixed(2) + 's">' + (dead ? "💀" : isMe ? "🧑‍🌾" : PETS[Math.floor(rnd(i, k, 4) * PETS.length)]) + (isMe ? "<em>我</em>" : "") + "</i>";
    }
    if (n > show) h += '<i class="dt-more">+' + (n - show) + "</i>";
    return h;
  }

  function page(id) {
    var S = null, me = null, sig = getSig(), skew = 0, sel = -1, amt = 100, busy = false, payBusy = false, asked = 0, askAt = 0, lastPull = 0, lastPh = "", tm = null;
    try { var sv = Number(localStorage.getItem("br:amt")); if (CHIPS.indexOf(sv) >= 0) amt = sv; } catch (e) { /* 忽略 */ }
    A.app.innerHTML = '<div class="dt-head"><h2>🐺 大逃杀</h2><span class="dt-beta">试运行</span><button type="button" class="dt-pay" id="dt-pay" hidden>＋ 充值金币</button></div>' +
      '<div class="dt-map" id="dt-grid"><div class="dt-hud"><span class="dt-coins" id="dt-coins"></span><span class="dt-clock" id="dt-clock">读取中…</span></div>' +
      DEF.map(function (r, i) { var L = LAY[i]; return '<button type="button" class="dt-room f' + i + '" data-i="' + i + '" style="left:' + L[0] + "%;top:" + L[1] + "%;width:" + L[2] + "%;height:" + L[3] + '%"><span class="dt-name">' + r[1] + '</span><span class="dt-t">💰 0</span><span class="dt-n"></span><b class="dt-emo">' + r[0] + '</b><span class="dt-ps"></span></button>'; }).join("") +
      '<i class="dt-deco" style="left:75%;top:70%">🌲</i><i class="dt-deco" style="left:92%;top:69%">🌳</i><i class="dt-deco" style="left:93%;top:82%">🌲</i><span class="dt-woods">大灰狼的树林</span>' +
      '<div class="dt-wolf nap" id="dt-wolf">🐺</div><div class="dt-me" id="dt-me" hidden><i>🧑‍🌾</i><em>我</em></div></div>' +
      '<div id="dt-res"></div><section class="card dt-act" id="dt-act"></section>' +
      '<section class="card"><h3 class="dt-h">最近几局大灰狼进了哪间</h3><div class="dt-hist" id="dt-hist"><span class="muted">还没有记录</span></div></section>' +
      '<details class="card dt-fold"><summary>怎么玩？（点开看）</summary><ol class="dt-rule"><li>每 60 秒一局。前 40 秒，选一个房间躲进去，押 10 到 1,000 金币。一局只能进一次，进了不能换。</li><li>关门后，大灰狼随机闯进一间<b>有人的房间</b>，那间房的人这一局押的金币就没了。</li><li>被吃掉的金币，10% 销毁，90% 分给其它房间活下来的人，押得多分得多。</li><li>只有一个房间有人就不开杀，押金原样退回。</li><li>金币和开心农场是同一份，赢的输的都记在农场金币里。</li></ol></details>' +
      '<details class="card dt-fold"><summary>怎么保证公平？（点开看）</summary><p class="dt-fairp">每一局进哪个房间由一串「种子」决定，种子在你押注之前就定好了。押注时先公布种子的指纹，开杀后公布种子本身，任何人都能核对种子没被换过。</p><div class="dt-fair" id="dt-fair"></div></details>' +
      '<p class="note">金币只能在游戏里玩，换不回币、不能提现、不能转给别人，没有奖金奖品。娱乐为主，量力而行。金币不够可以点右上角「充值金币」，也可以去 <a href="#/farm">开心农场</a> 签到、种菜。</p><div class="fm-toast" id="dt-toast" hidden></div><div class="modal" id="dt-modal" hidden></div>';
    var $ = function (x) { return document.getElementById(x); };

    function toast(t, bad) {
      var el = $("dt-toast");
      if (!el) return;
      el.textContent = t; el.className = "fm-toast" + (bad ? " bad" : ""); el.hidden = false;
      clearTimeout(el._t); el._t = setTimeout(function () { el.hidden = true; }, 2600);
    }
    function cfg(k, d) { return S && S[k] ? S[k] : d; }
    function cur() {
      var R = cfg("round", 60), t = Date.now() / 1000 + skew, rid = Math.floor(t / R), s = t - rid * R;
      return { rid: rid, s: s, ph: s < cfg("bet", 40) ? "bet" : s < cfg("show", 50) ? "lock" : "show" };
    }
    function rooms() { return cfg("rooms", DEF); }
    function rn(i) { var r = rooms()[i] || ["", "?"]; return r[0] + r[1]; }
    function myBet(c) { return me && me.bet && me.bet.rid === c.rid ? me.bet : null; }
    function myLast(c) { return me && me.last && me.last.rid === c.rid ? me.last : null; }

    function pull() {
      lastPull = Date.now();
      return fetch("/api/br", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(id) || !d || d.error || !d.rid) return;
        S = d; skew = d.now + 0.5 - Date.now() / 1000;
        draw();
      }).catch(function () { /* 网络抖一下，下一轮再读 */ });
    }
    function post(a, extra) {
      var b = { a: a, addr: sig.addr, day: sig.day, sig: sig.sig };
      Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
      return fetch("/api/br", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) { if (/签名/.test(j.error)) { setSig(null); sig = null; me = null; } throw new Error(j.error); }
        me = { coins: j.coins, bet: j.bet, last: j.last };
        return j;
      });
    }
    function login() {
      var eth, addr;
      A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) {
        addr = String(a[0] || "").toLowerCase();
        var day = today();
        return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(signText(addr, day)), addr] }).then(function (s) { sig = { addr: addr, day: day, sig: s }; setSig(sig); });
      }).then(function () { return post("me"); }).then(draw, function (e) { toast((e && e.message) || "钱包没连上", true); draw(); });
    }
    function bet() {
      if (busy || sel < 0 || !sig) return;
      busy = true; draw();
      post("bet", { room: sel, amt: amt }).then(function () { busy = false; toast("躲进「" + rn(sel) + "」了，押 " + amt + " 金币"); draw(); pull(); }, function (e) { busy = false; toast(e.message, true); draw(); });
    }

    /* 充值：和开心农场同一个弹窗、同一套档位（farm.js 的 A.farmPay），金币是同一份；先读档位和「以前充过没有」（首充翻倍用） */
    function recharge() {
      if (payBusy || !sig || !me) return;
      if (!A.farmPay) { toast("充值暂时打不开，可以去开心农场充值", true); return; }
      payBusy = true;
      var who = sig, body = JSON.stringify({ a: "me", addr: who.addr, day: who.day, sig: who.sig });
      Promise.all([
        fetch("/api/farm?rules=2", { cache: "no-store" }).then(function (r) { return r.json(); }),
        fetch("/api/farm", { method: "POST", headers: { "content-type": "application/json" }, body: body }).then(function (r) { return r.json(); })
      ]).then(function (x) {
        payBusy = false;
        if (!A.isCurrent(id) || !$("dt-modal")) return;
        var R = x[0], f = x[1];
        if (!f || f.error || !f.me) throw new Error((f && f.error) || "充值暂时打不开，稍后再试");
        if (!R || !R.packs || !R.pay) throw new Error("充值档位没读到，稍后再试");
        A.farmPay({ m: $("dt-modal"), R: R, paid: f.me.paid, addr: who.addr, done: function (j) { if (me && j.me) me.coins = j.me.coins; toast(j.msg || "充值到账了"); draw(); } });
      }).catch(function (e) { payBusy = false; toast((e && e.message) || "充值暂时打不开，稍后再试", true); });
    }

    function draw() {
      if (!A.isCurrent(id) || !$("dt-grid")) return;
      var c = cur(), fresh = S && S.rid === c.rid, res = fresh && c.ph === "show" ? S.res : null, b = myBet(c), l = myLast(c);
      var mine = b ? b.r : l ? l.r : -1, kill = res ? res.kill : -1;
      $("dt-coins").textContent = me ? "💰 " + num(me.coins) : "";
      if ($("dt-pay")) $("dt-pay").hidden = !(sig && me);
      Array.prototype.forEach.call($("dt-grid").querySelectorAll(".dt-room"), function (el, i) {
        var t = fresh ? S.tot[i] : 0, n = Math.max(fresh ? S.n[i] : 0, i === mine ? 1 : 0), dead = i === kill;
        el.className = "dt-room f" + i + (dead ? " dead" : "") + (i === mine ? " mine" : "") + (c.ph === "bet" && !b && i === sel ? " sel" : "") + (res && kill >= 0 && !dead && n ? " safe" : "");
        el.querySelector(".dt-t").textContent = "💰 " + short(t);
        el.querySelector(".dt-n").textContent = n ? n + " 人" : "";
        var key = n + "|" + (i === mine) + "|" + dead, ps = el.querySelector(".dt-ps");
        if (ps.getAttribute("data-k") !== key) { ps.setAttribute("data-k", key); ps.innerHTML = folks(i, n, i === mine, dead); }
      });
      $("dt-me").hidden = !(sig && me) || mine >= 0;
      /* 结果条 */
      var h = "";
      if (c.ph === "show") {
        if (l) h = l.kill < 0 ? '<div class="dt-ban">这一局人不够（至少两个房间有人才开杀），你的 ' + num(l.a) + " 金币原样退回。</div>"
          : l.got ? '<div class="dt-ban win">🎉 你活下来了！拿回 <b>' + num(l.got) + "</b> 金币（赚 " + num(l.got - l.a) + "）</div>"
          : '<div class="dt-ban lose">😵 大灰狼进了你躲的「' + rn(l.r) + "」，这一局的 " + num(l.a) + " 金币没了。</div>";
        else if (b) h = '<div class="dt-ban">结算中…</div>';
        if (res && res.kill >= 0) h += '<p class="dt-sum">🐺 大灰狼进了「' + rn(res.kill) + "」：" + res.n[res.kill] + " 人被淘汰，" + num(res.dead) + " 金币里 " + num(res.burn) + " 销毁，其余分给活下来的 " + (res.players - res.n[res.kill]) + " 人。</p>";
        else if (res && !l) h += '<p class="dt-sum">' + (res.players ? "这一局只有一个房间有人，没开杀，押金退回。" : "这一局没人进房间。") + "</p>";
      }
      $("dt-res").innerHTML = h;
      /* 操作区 */
      var a = "";
      if (!sig) a = '<button type="button" class="dt-go" id="dt-login">连接钱包进场</button><p class="dt-tip">只是签一条文字确认身份，不是转账，不花钱。新人送 200 金币。</p>';
      else if (!me) a = '<p class="muted">读取你的金币…</p>';
      else if (b) a = '<p class="dt-in">你躲在「<b>' + rn(b.r) + "</b>」，押了 <b>" + num(b.a) + "</b> 金币。" + (c.ph === "bet" ? "等关门。" : c.ph === "lock" ? "大灰狼出动了…" : "") + "</p>";
      else if (c.ph === "bet") a = '<div class="dt-chips">' + CHIPS.map(function (v) { return '<button type="button" data-v="' + v + '" class="' + (v === amt ? "on" : "") + '">' + num(v) + "</button>"; }).join("") + "</div>" +
        '<button type="button" class="dt-go" id="dt-bet"' + (sel < 0 || busy ? " disabled" : "") + ">" + (busy ? "进房间中…" : sel < 0 ? "先点上面选一个房间" : "躲进「" + rn(sel) + "」· 押 " + num(amt) + " 金币") + "</button>";
      else a = '<p class="dt-in">' + (c.ph === "lock" ? "这一局关门了，下一局再来。" : "下一局马上开始，先想好躲哪间。") + "</p>";
      $("dt-act").innerHTML = a;
      var lg = $("dt-login"), bt = $("dt-bet");
      if (lg) lg.onclick = login;
      if (bt) bt.onclick = bet;
      Array.prototype.forEach.call($("dt-act").querySelectorAll(".dt-chips button"), function (x) {
        x.onclick = function () { amt = Number(x.getAttribute("data-v")); try { localStorage.setItem("br:amt", String(amt)); } catch (e) { /* 忽略 */ } draw(); };
      });
      /* 最近几局 + 公平 */
      if (S && S.hist && S.hist.length) $("dt-hist").innerHTML = S.hist.map(function (x) { return '<span class="dt-chip" title="' + x.p + " 人 · " + num(x.s) + ' 金币">' + rn(x.kill) + "</span>"; }).join("");
      if (S) $("dt-fair").innerHTML = '<p>这一局的指纹：<code>' + A.esc(String(S.commit || "")) + "</code></p>" + (res && res.seed ? "<p>这一局的种子（已开杀）：<code>" + A.esc(res.seed) + "</code></p><p class=\"muted\">核对方法：种子做一次 SHA-256 等于上面的指纹；有人的房间从左到右排，取种子前 12 位十六进制数除以房间数的余数，就是大灰狼进的那间。</p>" : "");
    }

    function tick() {
      try {
        if (!A.isCurrent(id) || !$("dt-clock")) { clearInterval(tm); return; }
        var c = cur(), R = cfg("round", 60), B = cfg("bet", 40), W = cfg("show", 50);
        var left = Math.max(0, Math.ceil((c.ph === "bet" ? B : c.ph === "lock" ? W : R) - c.s));
        $("dt-clock").innerHTML = !S ? "读取中…" : c.ph === "bet" ? "<b>" + left + "</b> 秒后大灰狼出现" : c.ph === "lock" ? "关门了！大灰狼在挑房间 <b>" + left + "</b>" : "下一局 <b>" + left + "</b> 秒后开始";
        $("dt-clock").className = "dt-clock " + c.ph;
        /* 大灰狼：押注时在树林里睡觉；关门后在有人的房间之间转悠（只是动画，真正进哪间由种子决定）；开杀后停在那间房 */
        var wolf = $("dt-wolf"), live = S && S.rid === c.rid, rs = live && c.ph === "show" ? S.res : null, at = WOODS, wc = "dt-wolf nap";
        if (c.ph === "lock") {
          var occ = [];
          (live ? S.n : []).forEach(function (n, i) { if (n) occ.push(i); });
          if (!occ.length) occ = [0, 1, 2, 3, 4, 5, 6, 7];
          at = ctr(occ[Math.floor(rnd(c.rid % 1000, Math.floor(c.s / 0.9), 5) * occ.length)]); wc = "dt-wolf hunt";
        } else if (rs && rs.kill >= 0) { at = ctr(rs.kill); wc = "dt-wolf bite"; }
        wolf.style.left = at[0] + "%"; wolf.style.top = at[1] + "%"; wolf.className = wc;
        var key = c.rid + c.ph;
        if (key !== lastPh) { lastPh = key; draw(); pull(); }
        else if (Date.now() - lastPull > (c.ph === "show" ? 5000 : 3000)) pull();
        /* 开杀后去后台结一下自己的这一局；以前没结的局也顺手结掉 */
        if (sig && me && me.bet && asked !== me.bet.rid && Date.now() - askAt > 3000 && (me.bet.rid < c.rid || (c.ph === "show" && c.s >= W + 1.5))) {
          asked = me.bet.rid; askAt = Date.now();
          post("me").then(function () { if (me && me.bet) asked = 0; draw(); }, function () { asked = 0; });
        }
      } catch (e) { /* 页面切走时节点没了，不报错 */ }
    }

    $("dt-grid").onclick = function (e) {
      var el = e.target.closest ? e.target.closest(".dt-room") : null;
      if (!el) return;
      var c = cur();
      if (c.ph !== "bet") { toast("这一局关门了，等下一局", true); return; }
      if (myBet(c)) { toast("这一局你已经进房间了", true); return; }
      sel = Number(el.getAttribute("data-i")); draw();
    };
    $("dt-pay").onclick = function () { try { recharge(); } catch (e) { toast("充值暂时打不开，稍后再试", true); } };
    draw();
    pull();
    if (sig) post("me").then(draw, function () { draw(); });
    tm = setInterval(tick, 250);
  }

  A.pages.br = page;
})();
