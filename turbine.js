// 🌀 涡轮助手（#/turbine，站长 2026-11-25：「官方的功能太复杂，能不能一键整合，先从一键涡轮领取开始」「做成第一步、第二步、第三步，这样小白容易操作」）
//   官方要在三个页面里来回点：领排放 → 涡轮激活（付 DAI）→ 24 小时后领取。这里放到一页，按顺序一步一步点。
//   · 调的全是官方合约（地址、函数都从官方网站前端核过，手续费 / 锁定时间到链上读）：排放金库 VAULT、涡轮 TURBINE。本站没有新合约、不经手、不收费
//   · 客户自己的钱包签名。DAI 授权只批这一次要付的数，不批无限额
//   · 链上实际走法（拿真实交易核过）：激活 X 枚 → 付「市价买 X 枚的 DAI + 2.5% 手续费」→ 市场买到的 X 枚马上进钱包；排放的那 X 枚锁 24 小时后再领
//   · 只做「个人排放」（claimStatic）。社区动态排放要带官方接口给的证明，这一版不做，页面上提示去官方领
//   · 试运行：真钱包完整走一遍还没人试过。官方改规则时这里要跟着改
(function () {
  "use strict";
  var A = window.AIL, K = function () { return A.otcKit; };
  var VAULT = "0x3deea5f638ca0dfb03a0873cf4c0b90ba50e1aa2", TURBINE = "0xe884a336550a4482ca6a17a3f93aa30ed4ed9bad";
  var DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb";
  var SEL = { pendingOf: "0xf44136a1", usable: "0x8c9a2d45", claimStatic: "0x064f3406", feeBps: "0x24a9d853", lockSeconds: "0xbfa6fddb", claimed: "0x9886c2a5", locksOf: "0xc3f9ab58", lockOf: "0x632a4861",
    quote: "0xed1bd76c", activate: "0xd96c5110", claimUnlocked: "0xadaace55", approve: "0x095ea7b3" };
  var SLIP_BPS = 100n, DEADLINE = 1800, LOCKS_MAX = 30; // 报价上多留 1%（市价会动）；交易 30 分钟内有效
  var account = null, S = null, busy = false, tick = 0, pageId = 0;
  function T(s) { try { return window.AIL_LANG_T ? window.AIL_LANG_T(s) : s; } catch (e) { return s; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function u(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function big(h) { try { return h && h.length >= 3 ? BigInt(h) : 0n; } catch (e) { return 0n; } }
  function word(h, i) { return "0x" + String(h || "").slice(2 + 64 * i, 66 + 64 * i); }
  // 18 位精度的整数 → 好读的数（dp 位小数，去掉末尾的 0）
  function f(w, dp) {
    dp = dp == null ? 4 : dp; var neg = w < 0n; if (neg) w = -w;
    var base = 10n ** 18n, cut = 10n ** BigInt(18 - dp), r = (w + cut / 2n) / cut, i = r / (10n ** BigInt(dp)), d = (r % (10n ** BigInt(dp))).toString().padStart(dp, "0").replace(/0+$/, "");
    return (neg ? "-" : "") + i.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? "." + d : "");
  }
  function fd(w) { return f(w, w < 10n ** 18n ? 4 : 2); } // DAI：不到 1 的显示 4 位，免得小额手续费显示成 0
  function read(to, data) { return K().read(to, data); }
  function left(sec) { if (sec <= 0) return T("已解锁"); var h = Math.floor(sec / 3600), m = Math.ceil((sec % 3600) / 60); if (m === 60) { h++; m = 0; } return (h ? h + " " + T("小时") + " " : "") + m + " " + T("分钟"); }

  function load() {
    var a = account;
    return Promise.all([read(VAULT, SEL.pendingOf + u(a)), read(VAULT, SEL.usable + u(a)), read(TURBINE, SEL.claimed + u(a)), read(TURBINE, SEL.locksOf + u(a)),
      K().balance(DAI, a), K().balance(AIL, a), read(TURBINE, SEL.feeBps), read(TURBINE, SEL.lockSeconds)]).then(function (r) {
      var pending = big(r[0]), usable = big(r[1]), n = Number(big(word(r[3], 1))), ids = [];
      for (var i = Math.max(0, n - LOCKS_MAX); i < n; i++) ids.push(big(word(r[3], 2 + i)));
      var st = { stat: pending > usable ? pending - usable : 0n, dyn: usable, wait: big(r[2]), dai: r[4], ail: r[5], feeBps: Number(big(r[6])), lockSec: Number(big(r[7])), locks: [], quote: null };
      var jobs = ids.map(function (id) { return read(TURBINE, SEL.lockOf + u(id)).then(function (h) { return { id: id, amt: big(word(h, 1)), at: Number(big(word(h, 2))), done: big(word(h, 3)) > 0n }; }, function () { return null; }); });
      var q = st.wait > 0n ? read(TURBINE, SEL.quote + u(st.wait)).then(function (h) { return { buy: big(word(h, 0)), fee: big(word(h, 1)), total: big(word(h, 2)) }; }, function () { return null; }) : Promise.resolve(null);
      return Promise.all([Promise.all(jobs), q]).then(function (x) { st.locks = x[0].filter(function (l) { return l && !l.done; }).reverse(); st.quote = x[1]; return st; });
    });
  }
  // DAI 不够付全部时：按比例算出够付的那一部分（再问一次报价确认）
  function fit(st) {
    if (!st.quote || st.wait <= 0n) return Promise.resolve(null);
    var need = st.quote.total + st.quote.total * SLIP_BPS / 10000n;
    if (st.dai >= need) return Promise.resolve({ amt: st.wait, q: st.quote, max: need, part: false });
    var amt = st.wait * st.dai / need * 99n / 100n; if (amt <= 0n) return Promise.resolve(null);
    return read(TURBINE, SEL.quote + u(amt)).then(function (h) { var q = { buy: big(word(h, 0)), fee: big(word(h, 1)), total: big(word(h, 2)) }, max = q.total + q.total * SLIP_BPS / 10000n; return max <= st.dai ? { amt: amt, q: q, max: max, part: true } : null; }, function () { return null; });
  }

  function step(n, title, body, done) { return '<div class="tbn-step' + (done ? " off" : "") + '"><div class="tbn-h"><i>' + n + "</i><b>" + title + "</b></div>" + body + "</div>"; }
  function draw() {
    var box = document.getElementById("tbn-box"); if (!box) return;
    if (!account) { box.innerHTML = '<button type="button" class="nm-go tbn-go" id="tbn-conn">连接钱包</button><p class="muted nm-st" id="tbn-cst"></p>'; document.getElementById("tbn-conn").onclick = conn; return; }
    if (!S) { box.innerHTML = '<p class="muted">正在读取你的排放和涡轮数据…</p>'; return; }
    var now = Math.floor(Date.now() / 1000), open = S.locks.filter(function (l) { return l.at <= now; }), shut = S.locks.filter(function (l) { return l.at > now; });
    var openAmt = open.reduce(function (x, l) { return x + l.amt; }, 0n), F = S.fit, fee = (S.feeBps / 100) + "%", hrs = Math.round(S.lockSec / 3600);
    var s1 = S.stat > 0n
      ? '<p>现在可以领 <b class="tbn-n">' + f(S.stat, 6) + '</b> AiLGNS 的个人排放。</p><button type="button" class="nm-go tbn-go" data-act="claim">领取排放</button>'
      : '<p class="muted">现在没有可领的个人排放。' + (S.wait > 0n ? "之前领的还在第二步等着激活。" : "") + "</p>";
    if (S.dyn > 0n) s1 += '<p class="muted tbn-sm">另有 ' + f(S.dyn, 6) + " AiLGNS 的社区动态排放，本页暂时领不了，请到官方页面领取。</p>";
    var s2;
    if (S.wait <= 0n) s2 = '<p class="muted">没有等着激活的排放。先做第一步。</p>';
    else if (!S.quote) s2 = '<p>有 <b class="tbn-n">' + f(S.wait, 6) + '</b> AiLGNS 等着激活，但这会儿没读到官方报价。</p><button type="button" class="ghost tbn-go" data-act="reload">重新读取</button>';
    else if (!F) s2 = '<p>有 <b class="tbn-n">' + f(S.wait, 6) + "</b> AiLGNS 等着激活，全部激活要付约 <b>" + f(S.quote.total, 2) + " DAI</b>。</p><p class=\"tbn-warn\">你钱包里只有 " + f(S.dai, 2) + ' DAI，不够。先准备好 DAI 再回来点「重新读取」。</p><button type="button" class="ghost tbn-go" data-act="reload">重新读取</button>';
    else s2 = "<p>" + (F.part ? "有 " + f(S.wait, 6) + " AiLGNS 等着激活，你的 DAI 只够先激活 " : "激活 ") + '<b class="tbn-n">' + f(F.amt, 6) + "</b> AiLGNS：</p>" +
      '<div class="tbn-kv"><div><span>要付</span><b>' + fd(F.q.total) + " DAI</b></div><div><span>其中官方手续费（" + fee + "）</span><b>" + fd(F.q.fee) + " DAI</b></div>" +
      "<div><span>付完马上到钱包</span><b>" + f(F.amt, 6) + " AiLGNS</b></div><div><span>" + hrs + " 小时后再到手</span><b>" + f(F.amt, 6) + " AiLGNS</b></div><div><span>你的 DAI 余额</span><b>" + f(S.dai, 2) + " DAI</b></div></div>" +
      '<p class="muted tbn-sm">官方规则：付的 DAI 用来在市场上买同样数量的 AiLGNS，买到的马上给你；排放的那一份锁 ' + hrs + " 小时。市价会动，实际付的可能比上面多一点，最多多 1%，超过就不成交。</p>" +
      '<button type="button" class="nm-go tbn-go" data-act="activate">授权并激活涡轮</button><p class="muted tbn-sm">钱包会弹 2 次：先授权这一次要付的 DAI，再激活。</p>';
    var s3 = "";
    if (open.length) s3 += '<p>已经解锁 <b class="tbn-n">' + f(openAmt, 6) + "</b> AiLGNS（" + open.length + ' 笔），可以领了。</p><button type="button" class="nm-go tbn-go" data-act="unlock">领取已解锁的</button>';
    if (shut.length) s3 += '<div class="tbn-locks">' + shut.map(function (l) { return "<div><span>" + f(l.amt, 6) + ' AiLGNS</span><b class="tbn-left" data-at="' + l.at + '">' + T("还要") + " " + left(l.at - now) + "</b></div>"; }).join("") + "</div>";
    if (!s3) s3 = '<p class="muted">没有锁着的。第二步激活后，' + hrs + " 小时回来这里领。</p>";
    box.innerHTML = step(1, "领排放", s1, S.stat <= 0n) + step(2, "激活涡轮（付 DAI）", s2, S.wait <= 0n) + step(3, hrs + " 小时后领取", s3, !S.locks.length) +
      '<p class="muted nm-st" id="tbn-st"></p>' +
      '<div class="tbn-tail"><p>钱包里现在有 <b>' + f(S.ail, 6) + "</b> AiLGNS、<b>" + f(S.dai, 2) + ' DAI</b>。</p><a class="ghost tbn-otc" href="#/otc">想把 AiLGNS 卖成 DAI？去 OTC →</a><button type="button" class="ghost tbn-re" data-act="reload">刷新数据</button></div>';
    Array.prototype.forEach.call(box.querySelectorAll("[data-act]"), function (b) { b.onclick = function () { act(b.getAttribute("data-act"), b); }; });
  }
  function say(t, bad) { var e = document.getElementById("tbn-st"); if (e) { e.textContent = t || ""; e.className = (bad ? "nm-bad" : "muted") + " nm-st"; } }
  function refresh() { return load().then(function (st) { return fit(st).then(function (F) { st.fit = F; S = st; if (A.isCurrent(pageId)) draw(); }); }); }
  function conn() {
    var st = document.getElementById("tbn-cst");
    try { K().useMarket("ailgns"); } catch (e) {}
    K().connect().then(function (a) { account = String(a || K().account() || "").toLowerCase() || null; S = null; draw(); if (account) return refresh(); }, function (e) { if (st) { st.textContent = K().niceError(e); st.className = "nm-bad nm-st"; } });
  }
  function act(kind, btn) {
    if (kind === "reload") { S = null; draw(); refresh().catch(function () { S = null; say("没读出来，再点一次「刷新数据」。", true); }); return; }
    if (busy || !S) return; busy = true;
    Array.prototype.forEach.call(document.querySelectorAll(".tbn-go"), function (b) { b.disabled = true; });
    var done = function (msg) { busy = false; return refresh().then(function () { say(msg); }, function () { say(msg); }); };
    var fail = function (e) { busy = false; Array.prototype.forEach.call(document.querySelectorAll(".tbn-go"), function (b) { b.disabled = false; }); say("没成功：" + K().niceError(e), true); };
    try { K().useMarket("ailgns"); } catch (e) {}
    say("正在连接钱包…");
    K().ready().then(function () {
      if (String(K().account() || "").toLowerCase() !== account) throw new Error("钱包换了账户，请刷新页面再来");
      if (kind === "claim") return K().send(VAULT, SEL.claimStatic + u(S.stat), say, "领取排放").then(function () { return done("✅ 排放领好了，接着做第二步。"); });
      if (kind === "unlock") {
        var now = Math.floor(Date.now() / 1000), ids = S.locks.filter(function (l) { return l.at <= now; }).map(function (l) { return l.id; });
        if (!ids.length) throw new Error("还没有解锁的");
        return K().send(TURBINE, SEL.claimUnlocked + u(32) + u(ids.length) + ids.map(u).join(""), say, "领取已解锁的 AiLGNS").then(function () { return done("✅ 已经领到钱包了。"); });
      }
      if (kind === "activate") {
        // 点的那一刻重新要一次报价（市价会动），按最新的算最多付多少
        return load().then(function (st) { return fit(st).then(function (F) {
          if (!F) throw new Error("DAI 不够，或者没读到官方报价");
          return K().allowance(DAI, account, TURBINE).then(function (al) {
            if (al >= F.max) return;
            return K().send(DAI, SEL.approve + u(TURBINE) + u(F.max), say, "授权这一次要付的 DAI（" + fd(F.max) + " DAI）");
          }).then(function () {
            var dl = Math.floor(Date.now() / 1000) + DEADLINE;
            return K().send(TURBINE, SEL.activate + u(F.amt) + u(F.max) + u(dl), say, "激活涡轮");
          }).then(function () { return done("✅ 激活好了：买到的 AiLGNS 已经进钱包，另一份到时间后回来做第三步。"); });
        }); });
      }
    }).catch(fail);
  }

  A.pages.turbine = function (id) {
    pageId = id; clearInterval(tick); S = null; busy = false;
    try { K().useMarket("ailgns"); } catch (e) {}
    account = String((K() && K().account && K().account()) || "").toLowerCase() || null;
    A.app.innerHTML = '<section class="card tbn"><h2>🌀 涡轮助手 <small class="tbn-tag">试运行</small></h2>' +
      '<p class="muted">官方的「领排放 → 涡轮 → 领取」要在三个页面里来回点。这里放到一页，按第一步、第二步、第三步的顺序点就行。</p>' +
      '<div id="tbn-box"></div>' +
      '<div class="tbn-note"><b>要知道的</b><ul><li>调用的是官方合约，钱和币只在你的钱包和官方合约之间走。本站不经手、不收费。</li>' +
      "<li>手续费、锁定时间是官方定的，以官方页面为准；官方改规则时，这一页可能要等技术人员跟着更新。</li>" +
      "<li>本页只是把操作变简单，不是投资建议。要不要激活、要不要卖，请自己判断。</li></ul></div></section>";
    draw();
    if (account) refresh().catch(function () { var b = document.getElementById("tbn-box"); if (b && A.isCurrent(id)) b.innerHTML = '<p class="nm-bad">没读出来。</p><button type="button" class="ghost tbn-go" id="tbn-again">再读一次</button>'; var g = document.getElementById("tbn-again"); if (g) g.onclick = function () { S = null; draw(); refresh().catch(function () {}); }; });
    tick = setInterval(function () { // 倒计时每分钟走一下；到点了重画，让「领取」按钮出来
      if (!A.isCurrent(id)) { clearInterval(tick); return; }
      if (!S || busy) return; var now = Math.floor(Date.now() / 1000), due = false;
      Array.prototype.forEach.call(document.querySelectorAll(".tbn-left"), function (e) { var at = Number(e.getAttribute("data-at")); if (at <= now) due = true; else e.textContent = T("还要") + " " + left(at - now); });
      if (due) draw();
    }, 30000);
  };
})();
