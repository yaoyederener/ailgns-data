// 🌀 涡轮助手（#/turbine，站长 2026-11-25：「官方的功能太复杂，能不能一键整合，先从一键涡轮领取开始」「做成第一步、第二步、第三步，这样小白容易操作」）
//   官方要在三个页面里来回点：领排放 → 涡轮激活（付 DAI）→ 24 小时后领取。这里放到一页，按顺序一步一步点。
//   · 调的全是官方合约（地址、函数都从官方网站前端核过，手续费 / 锁定时间到链上读）：排放金库 VAULT、涡轮 TURBINE。本站没有新合约、不经手、不收费
//   · 客户自己的钱包签名。DAI 授权只批这一次要付的数，不批无限额
//   · 链上实际走法（拿真实交易核过）：激活 X 枚 → 付「市价买 X 枚的 DAI + 2.5% 手续费」→ 市场买到的 X 枚马上进钱包；排放的那 X 枚锁 24 小时后再领
//   · 只做「个人排放」（claimStatic）。社区动态排放要带官方接口给的证明，这一版不做，页面上提示去官方领
//   · 第四、五步（站长 2026-11-25：「自动在 OTC 卖出、DAI 复投算力，做出来」）：
//       第四步 把 AiLGNS 在本站 OTC 卖成 DAI——吃现成的买单，和「闪兑」第 1 步同一套代码（A.otcKit.sellQuote / sellFire），照收 1% 吃单手续费；
//               先算给客户看再让他点确认；卖出均价比涡轮的市场买入价低 10% 以上就不让卖（买盘太浅）
//       第五步 把 DAI 投进官方算力账本 LEDGER.participate(DAI 数量)（链上核过：现在 1 DAI 记 2.5 算力、开放中）。授权同样只批这一次的数
//       页面只摆数字，不说「复投更赚」——划不划算客户自己判断
//   · 试运行：真钱包完整走一遍还没人试过。官方改规则时这里要跟着改
(function () {
  "use strict";
  var A = window.AIL, K = function () { return A.otcKit; };
  var VAULT = "0x3deea5f638ca0dfb03a0873cf4c0b90ba50e1aa2", TURBINE = "0xe884a336550a4482ca6a17a3f93aa30ed4ed9bad";
  var LEDGER = "0x9e68f61e2615cc1d2c4a2d0026bfc1ebfdf68c1b";
  var DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb";
  var SEL = { pendingOf: "0xf44136a1", usable: "0x8c9a2d45", claimStatic: "0x064f3406", feeBps: "0x24a9d853", lockSeconds: "0xbfa6fddb", claimed: "0x9886c2a5", locksOf: "0xc3f9ab58", lockOf: "0x632a4861",
    rateBps: "0xbe7f8c68", open: "0x549c4627", minDai: "0xa2b7b1c5", participate: "0x845c9306", active: "0x6cf2fa36", pendingPow: "0xaa81a38f",
    quote: "0xed1bd76c", activate: "0xd96c5110", claimUnlocked: "0xadaace55", approve: "0x095ea7b3" };
  var SLIP_BPS = 100n, DEADLINE = 1800, LOCKS_MAX = 30; // 报价上多留 1%（市价会动）；交易 30 分钟内有效
  var account = null, S = null, busy = false, tick = 0, pageId = 0;
  var sellStr = "", daiStr = "", sellQ = null; // 第四、五步输入框里的数（重画时不丢）；sellQ = 算好等客户确认的卖出计划
  var GAS_KEEP = 2n * 10n ** 17n; // 留 0.2 DAI 付 Gas
  var LOW_SELL = 90n; // 卖出均价不到「涡轮市场买入价」的 90% 就不让卖
  function mem(k, v) { try { var key = "tbn:" + k + ":" + account; if (v === undefined) return localStorage.getItem(key) || ""; localStorage.setItem(key, v); } catch (e) {} return ""; }
  function plain(w, dp) { return f(w, dp).replace(/,/g, ""); }
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
      K().balance(DAI, a), K().balance(AIL, a), read(TURBINE, SEL.feeBps), read(TURBINE, SEL.lockSeconds),
      read(LEDGER, SEL.rateBps).catch(function () { return ""; }), read(LEDGER, SEL.open).catch(function () { return ""; }), read(LEDGER, SEL.minDai).catch(function () { return ""; }),
      read(LEDGER, SEL.active + u(a)).catch(function () { return ""; }), read(LEDGER, SEL.pendingPow + u(a)).catch(function () { return ""; }), read(TURBINE, SEL.quote + u(10n ** 18n)).catch(function () { return ""; })]).then(function (r) {
      var pending = big(r[0]), usable = big(r[1]), n = Number(big(word(r[3], 1))), ids = [];
      for (var i = Math.max(0, n - LOCKS_MAX); i < n; i++) ids.push(big(word(r[3], 2 + i)));
      var st = { stat: pending > usable ? pending - usable : 0n, dyn: usable, wait: big(r[2]), dai: r[4], ail: r[5], feeBps: Number(big(r[6])), lockSec: Number(big(r[7])), locks: [], quote: null,
        rate: Number(big(r[8])), open: r[9] ? big(r[9]) > 0n : null, minDai: big(r[10]), pow: big(r[11]), powWait: big(r[12]), mkt: r[13] ? big(word(r[13], 0)) : 0n }; // mkt = 涡轮按市价买 1 枚要多少 DAI
      var jobs = ids.map(function (id) { return read(TURBINE, SEL.lockOf + u(id)).then(function (h) { return { id: id, amt: big(word(h, 1)), at: Number(big(word(h, 2))), done: big(word(h, 3)) > 0n }; }, function () { return null; }); });
      var q = st.wait > 0n ? read(TURBINE, SEL.quote + u(st.wait)).then(function (h) { return { buy: big(word(h, 0)), fee: big(word(h, 1)), total: big(word(h, 2)) }; }, function () { return null; }) : Promise.resolve(null);
      return Promise.all([Promise.all(jobs), q]).then(function (x) { st.locks = x[0].filter(function (l) { return l && !l.done; }).reverse(); st.quote = x[1]; return st; });
    });
  }
  // DAI 不够付全部时：按比例算出够付的那一部分（再问一次报价确认）
  function fit(st) {
    if (!st.quote || st.wait <= 0n) return Promise.resolve(null);
    var need = st.quote.total + st.quote.total * SLIP_BPS / 10000n;
    var have = st.dai > GAS_KEEP ? st.dai - GAS_KEEP : 0n; // Anubis 链的 Gas 用的就是 DAI：留一点，别把钱包付空了后面几步发不出去
    if (have >= need) return Promise.resolve({ amt: st.wait, q: st.quote, max: need, part: false });
    var amt = st.wait * have / need * 99n / 100n; if (amt <= 0n) return Promise.resolve(null);
    return read(TURBINE, SEL.quote + u(amt)).then(function (h) { var q = { buy: big(word(h, 0)), fee: big(word(h, 1)), total: big(word(h, 2)) }, max = q.total + q.total * SLIP_BPS / 10000n; return max <= have ? { amt: amt, q: q, max: max, part: true } : null; }, function () { return null; });
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
    if (!sellStr) { var ls = mem("sell"); try { if (ls && BigInt(ls) > 0n && BigInt(ls) <= S.ail) sellStr = plain(BigInt(ls), 6); } catch (e) {} }
    if (!daiStr) { var ld = mem("dai"); try { if (ld && BigInt(ld) > 0n && BigInt(ld) <= S.dai) daiStr = plain(BigInt(ld), 2); } catch (e) {} }
    var s4 = '<p>钱包里有 <b class="tbn-n">' + f(S.ail, 6) + "</b> AiLGNS。想卖多少，填在下面：</p>" +
      '<div class="tbn-in"><input id="tbn-sell" inputmode="decimal" autocomplete="off" placeholder="卖多少 AiLGNS" value="' + esc(sellStr) + '"><button type="button" class="ghost" data-act="sellall">全部</button></div>';
    if (sellQ) s4 += '<div class="tbn-kv"><div><span>卖出</span><b>' + f(sellQ.tok, 6) + " AiLGNS</b></div><div><span>到手（已扣 1% 手续费）</span><b>" + fd(sellQ.dai) + " DAI</b></div><div><span>合每枚</span><b>" + f(sellQ.avg, 2) + " DAI</b></div>" +
      (S.mkt > 0n ? "<div><span>涡轮的市场买入价</span><b>" + f(S.mkt, 2) + " DAI</b></div>" : "") + "</div>" +
      (sellQ.short ? '<p class="tbn-warn">现在的买单只够接 ' + f(sellQ.tok, 6) + " AiLGNS，剩下的这次卖不掉。</p>" : "") +
      (sellQ.low ? '<p class="tbn-warn">现在买单的出价太低（比涡轮的市场买入价低 10% 以上），这个价先不卖。可以过一会儿再来，或者到 OTC 自己挂卖单。</p><a class="ghost tbn-otc" href="#/otc">去 OTC 挂卖单 →</a>'
        : '<button type="button" class="nm-go tbn-go" data-act="sellgo">确认卖出</button><p class="muted tbn-sm">吃的是 OTC 里现成的买单（' + sellQ.n + " 张），一笔交易成交。第一次用会先让你授权一次。</p>");
    else s4 += '<button type="button" class="nm-go tbn-go" data-act="sellq">算一下能卖多少 DAI</button>';
    var rateX = S.rate ? (S.rate / 10000) : 0, s5;
    if (S.open === false) s5 = '<p class="tbn-warn">官方现在暂停了 DAI 参与算力，等开放后再来。</p>';
    else s5 = '<p>钱包里有 <b class="tbn-n">' + f(S.dai, 2) + "</b> DAI。想投多少进官方算力，填在下面：</p>" +
      '<div class="tbn-in"><input id="tbn-dai" inputmode="decimal" autocomplete="off" placeholder="投多少 DAI" value="' + esc(daiStr) + '"><button type="button" class="ghost" data-act="daiall">全部</button></div>' +
      (rateX ? '<p class="muted tbn-sm">官方现在的规则：1 DAI 记 ' + rateX + " 算力。投进去的 DAI 不能取回。官方每天有总额度，满了这一步会不成功。</p>" : "") +
      '<button type="button" class="nm-go tbn-go" data-act="invest">授权并投入算力</button><p class="muted tbn-sm">钱包会弹 2 次：先授权这一次的 DAI，再投入。</p>';
    s5 += '<p class="muted tbn-sm">你现在的算力：生效中 ' + f(S.pow, 2) + (S.powWait > 0n ? "，等生效 " + f(S.powWait, 2) : "") + "。</p>";
    box.innerHTML = step(1, "领排放", s1, S.stat <= 0n) + step(2, "激活涡轮（付 DAI）", s2, S.wait <= 0n) + step(3, hrs + " 小时后领取", s3, !S.locks.length) +
      step(4, "把 AiLGNS 卖成 DAI（可选）", s4, S.ail <= 0n) + step(5, "DAI 复投算力（可选）", s5, S.dai <= 0n || S.open === false) +
      '<p class="muted nm-st" id="tbn-st"></p>' +
      '<div class="tbn-tail"><p>钱包里现在有 <b>' + f(S.ail, 6) + "</b> AiLGNS、<b>" + f(S.dai, 2) + ' DAI</b>。</p><button type="button" class="ghost tbn-re" data-act="reload">刷新数据</button></div>';
    var i4 = document.getElementById("tbn-sell"), i5 = document.getElementById("tbn-dai");
    if (i4) i4.oninput = function () { sellStr = i4.value; if (sellQ) { sellQ = null; draw(); var n4 = document.getElementById("tbn-sell"); if (n4) { n4.focus(); try { n4.setSelectionRange(n4.value.length, n4.value.length); } catch (e) {} } } };
    if (i5) i5.oninput = function () { daiStr = i5.value; };
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
    if (kind === "sellall") { sellStr = plain(S.ail, 6); if (BigInt(K().toWei(sellStr, 18)) > S.ail) sellStr = plain(S.ail - 10n ** 12n, 6); sellQ = null; draw(); return; }
    if (kind === "daiall") { daiStr = plain(S.dai - (S.dai > 2n * 10n ** 18n ? 2n * 10n ** 18n : 0n), 2); if (BigInt(K().toWei(daiStr, 18)) > S.dai) daiStr = "0"; draw(); say(S.dai > 2n * 10n ** 18n ? "留了 2 DAI 当手续费（Anubis 链的 Gas 用的就是 DAI）。" : ""); return; }
    if (kind === "sellq") {
      if (busy || !S) return; var want; try { want = BigInt(K().toWei(sellStr, 18)); } catch (e) { want = 0n; }
      if (want <= 0n) { say("先填要卖多少 AiLGNS。", true); return; }
      if (want > S.ail) { say("钱包里没有这么多 AiLGNS。", true); return; }
      busy = true; say("正在读 OTC 的买单…");
      K().sellQuote(want).then(function (q) {
        busy = false; try { K().useMarket("ailgns"); } catch (e) {}
        if (!q || !q.n || q.tok <= 0n) { say("OTC 现在没有能接的买单。可以到 OTC 自己挂卖单。", true); return; }
        var avg = q.dai * (10n ** 18n) / q.tok;
        sellQ = { p: q.p, dai: q.dai, tok: q.tok, n: q.n, avg: avg, short: q.tok < want * 99n / 100n, low: S.mkt > 0n && avg * 100n < S.mkt * LOW_SELL };
        draw(); say("");
      }, function () { busy = false; say("没读到 OTC 的买单，再点一次。", true); });
      return;
    }
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
      if (kind === "sellgo") {
        if (!sellQ || sellQ.low) throw new Error("先点「算一下能卖多少 DAI」");
        var plan = sellQ.p;
        return K().sellFire(plan, say).then(function (r) {
          sellQ = null; sellStr = ""; mem("sell", "0"); mem("dai", r.got.toString()); daiStr = plain(r.got, 2); if (BigInt(K().toWei(daiStr, 18)) > r.got) daiStr = plain(r.got - 10n ** 16n, 2);
          return done("✅ 卖掉 " + f(r.paid, 6) + " AiLGNS，到手 " + fd(r.got) + " DAI。想复投就接着做第五步。");
        });
      }
      if (kind === "invest") {
        var amt; try { amt = BigInt(K().toWei(daiStr, 18)); } catch (e) { amt = 0n; }
        if (amt <= 0n) throw new Error("先填要投多少 DAI");
        if (amt > S.dai) throw new Error("钱包里没有这么多 DAI");
        if (S.minDai > 0n && amt < S.minDai) throw new Error("官方要求每次最少 " + f(S.minDai, 2) + " DAI");
        return K().allowance(DAI, account, LEDGER).then(function (al) {
          if (al >= amt) return;
          return K().send(DAI, SEL.approve + u(LEDGER) + u(amt), say, "授权这一次要投的 DAI（" + fd(amt) + " DAI）");
        }).then(function () { return K().send(LEDGER, SEL.participate + u(amt), say, "DAI 投入算力"); })
          .then(function () { daiStr = ""; mem("dai", "0"); return done("✅ " + fd(amt) + " DAI 已投入算力。"); });
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
          }).then(function () { mem("sell", F.amt.toString()); sellStr = ""; sellQ = null; return done("✅ 激活好了：买到的 AiLGNS 已经进钱包（想卖成 DAI 看第四步），另一份到时间后回来做第三步。"); });
        }); });
      }
    }).catch(fail);
  }

  A.pages.turbine = function (id) {
    pageId = id; clearInterval(tick); S = null; busy = false; sellStr = ""; daiStr = ""; sellQ = null;
    try { K().useMarket("ailgns"); } catch (e) {}
    account = String((K() && K().account && K().account()) || "").toLowerCase() || null;
    A.app.innerHTML = '<section class="card tbn"><h2>🌀 涡轮助手 <small class="tbn-tag">试运行</small></h2>' +
      '<p class="muted">官方的「领排放 → 涡轮 → 领取」要在三个页面里来回点。这里放到一页，按第一步、第二步、第三步的顺序点就行。第四、五步是可选的：把币在本站 OTC 卖成 DAI，再投回官方算力。</p>' +
      '<div id="tbn-box"></div>' +
      '<div class="tbn-note"><b>要知道的</b><ul><li>第一、二、三、五步调用的是官方合约，本站不经手、不收费。第四步是在本站 OTC 成交，和平时吃单一样收 1% 手续费。</li>' +
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
