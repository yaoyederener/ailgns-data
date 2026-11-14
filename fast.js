// ⚡ 极速预言家 #/fast（站长 2026-11-12 定稿，试运行，不宣传）
// 10 分钟一期，猜 0 到 9。票 = 新注册的纯数字 .ailgns 域名，1 DAI = 1 票。下注 = 给极速池转 0 个 DAI（只花 Gas），数据里带「ailgns-fast:数字:票数」。
// 这页只读 /api/fast，下注时才连钱包发一笔 0 DAI 转账；算账和发奖都不在这里。
(function () {
  var A = window.AIL, W = A.wallet, DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14";
  var SHOW_RES = true; /* 「资金池余额」那一行：站长 2026-11-14 说「显示资金池金额」，正式站也显示（本期没人下注时「本期奖池」是 0，容易被当成没钱） */
  var data = null, acct = "", eth = null, pick = -1, qty = 1, busy = false, tick = 0, poll = 0, lastR = 0;
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function at(r) { var d = new Date((r + 1) * 600 * 1000); return two(d.getHours()) + ":" + two(d.getMinutes()); } // 这一期几点开奖（手机当地时间）
  function money(v) { return (Math.floor(Number(v || 0) * 100) / 100).toFixed(2); }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  var stT = "", stBad = false;
  function say(t, bad) { stT = t || ""; stBad = !!bad; var s = el("fx-st"); if (s) { s.textContent = stT; s.className = "fx-st" + (stBad ? " bad" : ""); } }

  function load() {
    return fetch("/api/fast" + (acct ? "?a=" + acct : ""), { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { if (!r.ok && !j.error) throw new Error("bad"); return j; }); }).then(function (j) {
      if (j.error) throw new Error(j.error);
      data = j; try { localStorage.setItem("fx:last", JSON.stringify(j)); } catch (e) {}
      paint();
    }).catch(function () { if (!data) { var b = el("fx-main"); if (b) b.innerHTML = '<p class="muted">数据没读出来，稍等几秒会自动再试。</p>'; } });
  }

  function left() { return data && data.me ? data.me.left : 0; }
  /* 这一期我最多还能押几张：老票不限；新票每个钱包每期最多 cap2 张（站长 2026-11-14 定 100），已经押过的要扣掉 */
  function maxQ() {
    var me = data && data.me; if (!me) return 0;
    if (!data.v2 || !data.cap2) return me.left;
    var used = (me.bets || []).reduce(function (t, x) { return t + (x.st === "wait" && x.r === data.r ? (x.n2 || 0) : 0); }, 0);
    return (me.left1 || 0) + Math.min(me.left2 || 0, Math.max(0, data.cap2 - used));
  }
  function paint() {
    var box = el("fx-main"); if (!box || !data) return;
    if (!data.open) { box.innerHTML = '<p class="fx-closed">⏳ 还没开放。开放时会在这里直接能玩，不用做任何准备。</p>'; ["fx-draws", "fx-mine", "fx-done"].forEach(function (i) { if (el(i)) el(i).hidden = true; }); return; }
    var me = data.me, have = left(), v2 = !!data.v2; /* v2 = 新规则已生效（接口说了算） */
    var oldOn = v2 && (data.left1 > 0 || data.tk > 0 || data.carry > 0), myOld = v2 && me && me.left1 > 0; /* 还有没有老票在用 */
    if (qty > maxQ()) qty = Math.max(1, maxQ());
    if (ruleV2 !== v2) { ruleV2 = v2; var rb = el("fx-rules"), sb = el("fx-sub"); if (rb) rb.innerHTML = rulesH(v2); if (sb) sb.textContent = subT(v2); }
    var grid = "";
    for (var d = 0; d < 10; d++) grid += '<button type="button" class="fx-d' + (d === pick ? " on" : "") + '" data-d="' + d + '"><b>' + d + "</b><i>" + (data.by[d] ? data.by[d] + " 票" : "还没人压") + "</i></button>";
    box.innerHTML =
      (data.trial ? '<p class="fx-trial">🧪 预览演示：还没正式开始，现在下注<b>不发奖</b>，只用来看页面。</p>' : "") +
      '<div class="fx-hero"><p class="fx-t">本期 <b>' + at(data.r) + '</b> 开奖，还剩</p><p class="fx-clock" id="fx-clock">--:--</p>' +
      (v2 ? '<p class="fx-pot">猜中每张票发 <b>1.9 DAI</b></p><p class="fx-pot2">压 1 张票（1 DAI），猜中拿回本金 1 再赚 0.9 · 本期已压 ' + (data.tk + (data.tk2 || 0)) + " 票</p>" +
          (oldOn ? '<p class="fx-res">老票（规则调整前买的）还按老规则：本期老奖池 <b>' + money(data.pot) + " DAI</b>，已压 " + data.tk + " 张老票，猜中的按票数分。</p>" : "")
        : data.res && SHOW_RES
          ? '<p class="fx-pot">资金池 <b>' + money(data.res.dai) + " DAI</b></p>" +
            '<p class="fx-pot2">本期已压 ' + data.tk + " 票 · 本期可分 <b>" + money(data.pot) + " DAI</b>" + (data.carry > 0 ? "（含前面滚过来的 " + money(data.carry) + "）" : "") + "</p>" +
            '<p class="fx-res">资金池是<a href="#/scan/' + data.pool + '">链上实际余额</a>' + (data.res.ail > 0 ? "（另有 " + data.res.ail.toFixed(4) + " AiLGNS）" : "") + "。猜中的人按票数分「本期可分」那部分，不是分整个资金池。已卖出、还没下注的票有 <b>" + Number(data.left || 0).toLocaleString("en-US") + "</b> 张。</p>"
          : '<p class="fx-pot">本期奖池 <b>' + money(data.pot) + " DAI</b></p>" +
            '<p class="fx-pot2">' + (data.carry > 0 ? "其中 " + money(data.carry) + " DAI 是前面没人猜中滚过来的 · " : "") + "已压 " + data.tk + " 票</p>") +
      (v2 && data.res && SHOW_RES ? '<p class="fx-res">💰 资金池里现在有 <b>' + money(data.res.dai) + " DAI</b>" + (data.res.ail > 0 ? " + " + data.res.ail.toFixed(4) + " AiLGNS" : "") + '（<a href="#/scan/' + data.pool + '">链上实际余额</a>）' + (v2 ? "，用来给猜中的人发奖" : "") + "。已卖出、还没下注的票有 <b>" + Number(data.left || 0).toLocaleString("en-US") + "</b> 张" + (v2 ? "。" : "：谁下注，谁的票才进当期奖池。") + "</p>" : "") + "</div>" +
      '<div class="fx-me">' + (!acct ? '还不知道你是谁。<button type="button" class="fx-link" id="fx-conn">连接钱包看我的票</button>'
        : have > 0 ? "钱包 " + short(acct) + " 还有 <b>" + have + "</b> 张票" + (myOld ? (me.left2 > 0 ? "（其中老票 " + me.left1 + " 张，先用老票）" : "（都是老票，按老规则）") : "")
        : v2 ? "钱包 " + short(acct) + " 现在<b>没有票</b>。注册任意域名就有票，付 5 DAI 就是 5 票（一次至少注册 2 个）。"
        : "钱包 " + short(acct) + " 现在<b>没有票</b>。注册一个纯数字域名就有票，付 5 DAI 就是 5 张。") + "</div>" +
      (acct && have <= 0 ? (v2 ? '<a class="fx-go" href="#/names" id="fx-buy">去买票（批量注册，至少 2 个域名）</a>' : '<a class="fx-go" href="#/names">去买票（注册纯数字域名）</a>') : "") +
      '<p class="fx-h">① 选一个数字</p><div class="fx-grid">' + grid + "</div>" +
      '<p class="fx-h">② 压几张票</p><div class="fx-qty"><button type="button" id="fx-minus">−</button><b id="fx-n">' + qty + '</b><button type="button" id="fx-plus">＋</button><button type="button" class="fx-all" id="fx-all">全压</button></div>' +
      '<button type="button" class="fx-bet" id="fx-bet"></button><p class="fx-st" id="fx-st"></p>' +
      (v2 ? '<p class="note">猜中：每张票发 1.9 DAI（本金 1 + 净赚 0.9），换成 AiLGNS 自动转到你的钱包；不分别人的钱。猜不中：这几张票就用掉了。' + (myOld ? "你的老票猜中还按老规则分老奖池。" : "") + "</p>"
        : '<p class="note">猜中：和本期所有猜中的人按票数平分奖池，奖金换成 AiLGNS 自动转到你的钱包。猜不中：这几张票就用掉了。</p>');
    say(stT, stBad); betLabel(); clock();
    // 最近开奖
    var dr = el("fx-draws");
    if (dr) { dr.hidden = false; dr.querySelector(".fx-balls").innerHTML = data.draws.map(function (x) { return '<span class="fx-ball' + (x.d == null ? " wait" : "") + '"><b>' + (x.d == null ? "…" : x.d) + "</b><i>" + at(x.r) + "</i></span>"; }).join(""); }
    // 我的下注
    var mb = el("fx-mine");
    if (mb) {
      var bets = (me && me.bets) || [];
      mb.hidden = !acct;
      mb.querySelector(".fx-list").innerHTML = bets.length ? bets.map(function (x) {
        var res = x.st === "wait" ? '<span class="fx-tag wait">等开奖</span>' : x.st === "win" ? '<span class="fx-tag win">中了 ' + money(x.pay) + " DAI" + (x.ail ? "，已发 " + x.ail + " AiLGNS" : data.trial ? "" : "，几分钟内到账") + "</span>" : '<span class="fx-tag lose">没中，开的是 ' + x.open + "</span>";
        return '<div class="fx-row"><span><b>' + at(x.r) + "</b> 期　压 <b>" + x.d + "</b>　" + x.n + " 票</span>" + res + "</div>";
      }).join("") : '<p class="muted">还没有下注记录。</p>';
    }
    // 最近有人下注的几期
    var dn = el("fx-done");
    if (dn) {
      dn.hidden = !data.done.length;
      dn.querySelector(".fx-list").innerHTML = data.done.map(function (x) {
        var n2 = x.tk2 || 0;
        return '<div class="fx-row"><span><b>' + at(x.r) + "</b> 期　开 <b>" + x.d + "</b>　" + (x.tk + n2) + " 票" + (x.tk || !n2 ? "　" + (n2 ? "老奖池 " : "奖池 ") + money(x.pot) : "") + "</span>" + (x.winners ? '<span class="fx-tag win">' + x.winners + " 人中</span>" : '<span class="fx-tag wait">' + (x.tk || !n2 ? "没人中，滚存" : "没人中") + "</span>") + "</div>";
      }).join("");
    }
  }
  function betLabel() {
    var b = el("fx-bet"); if (!b) return;
    var have = left(), secs = data ? data.ends - Date.now() / 1000 : 0;
    b.disabled = busy;
    b.textContent = busy ? "处理中…" : !acct ? "连接钱包再下注" : have <= 0 ? "没有票，先去买票" : pick < 0 ? "先选一个数字" : "压 " + qty + " 张票，猜 " + pick;
    b.className = "fx-bet" + (!busy && (!acct || (have > 0 && pick >= 0)) ? " ready" : "");
    if (el("fx-n")) el("fx-n").textContent = qty;
    if (!busy && acct && have > 0 && pick >= 0 && secs < 20 && secs > -5) say("本期快结束了，现在压多半会算到下一期。");
  }
  function clock() {
    var c = el("fx-clock"); if (!c || !data || !data.open) return;
    var s = Math.floor(data.ends - Date.now() / 1000);
    if (s <= 0) { c.textContent = "开奖中…"; if (lastR !== data.r) { lastR = data.r; setTimeout(load, 6000); } return; }
    c.textContent = two(Math.floor(s / 60)) + ":" + two(s % 60);
  }

  function connect() {
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); })
      .then(function (a) { acct = String(a[0]).toLowerCase(); return W.switchTo(eth, "anubis"); }).then(function () { return load(); });
  }
  function hexOf(txt) { return Array.prototype.map.call(new TextEncoder().encode(txt), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function bet() {
    if (busy) return;
    if (!acct || !eth) { busy = true; betLabel(); say("请在钱包里点「连接」"); return connect().then(function () { busy = false; say(""); paint(); }, function (e) { busy = false; betLabel(); say((e && e.message) || "钱包没连上", true); }); }
    var have = left();
    if (have <= 0) { location.hash = "#/names"; return; }
    if (pick < 0) return say("先在上面点一个数字。", true);
    if (data.v2 && maxQ() <= 0) return say("这一期你已经押满 " + data.cap2 + " 张了，每个钱包每期最多押 " + data.cap2 + " 张。等下一期再押。", true);
    var n = Math.min(qty, have, Math.max(1, maxQ())), d = pick;
    if (!window.confirm("确定压 " + n + " 张票，猜 " + d + " 吗？\n\n① 钱包会弹出来，显示「转账 0 DAI」，这是正常的，只花一点点 Gas\n② 猜中平分奖池；猜不中，这 " + n + " 张票就用掉了\n③ 发出去以后不能撤回")) return;
    var tx = { from: acct, to: DAI, data: "0xa9059cbb" + data.pool.slice(2).padStart(64, "0") + "".padStart(64, "0") + hexOf("ailgns-fast:" + d + ":" + n) };
    busy = true; betLabel(); say("请在钱包里点「确认」（显示转账 0 DAI 是正常的）");
    W.switchTo(eth, "anubis").then(function () { return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [tx] }); })
      .then(function (h) { say("已发出，等链上记账，大约十几秒…"); return W.waitOn("anubis", h); })
      .then(function () { busy = false; pick = -1; say("✅ 压好了：" + n + " 张票猜 " + d + "。开奖后在下面「我的下注」看结果。"); setTimeout(load, 2500); setTimeout(load, 8000); betLabel(); })
      .catch(function (e) { busy = false; betLabel(); say(/reject|denied|取消|cancel/i.test((e && e.message) || "") ? "你在钱包里点了取消，没有下注。" : "没发出去：" + ((e && e.message) || "请稍后再试"), true); });
  }

  var ruleV2 = false;
  function subT(v2) { return v2 ? "10 分钟开一期，猜一个 0 到 9 的数字。猜中每张票发 1.9 DAI。" : "10 分钟开一期，猜一个 0 到 9 的数字。猜中的人平分本期奖池。"; }
  function rulesH(v2) { // 规则说明：新规则生效前后各一套（和 lib/fast.js、monita/fast_oracle.py 的算法一致，改规则三处一起改）
    if (!v2) return '<h2>规则一共六条</h2><ol class="bn-rules">' +
      "<li><b>票从哪来</b><span>注册一个纯数字的 .ailgns 域名，付多少 DAI 就得多少张票，5 DAI 就是 5 张。票记在付款的钱包上，续费不算。要自己点注册才有票，交给机器人代点的暂时不算。</span></li>" +
      "<li><b>怎么猜</b><span>每 10 分钟一期。选一个 0 到 9 的数字，压几张票，在钱包里点一次确认。票可以存着，哪一期想玩再用。</span></li>" +
      "<li><b>怎么开奖</b><span>本期结束后，链上出的第一个区块，它的哈希除以 10 的余数就是开奖数字。谁也没法提前知道，谁都能自己上链核对。</span></li>" +
      "<li><b>奖池怎么分</b><span>每张票带 0.9 DAI 进本期奖池，另外 0.1 DAI 是平台服务费。猜中的人按票数平分奖池。</span></li>" +
      "<li><b>奖金怎么发</b><span>只发 AiLGNS。分到的 DAI 按本站 OTC 的价格换成 AiLGNS，开奖后几分钟内自动转到你下注的钱包，不用自己领。</span></li>" +
      "<li><b>没人猜中</b><span>整个奖池滚到下一期。</span></li></ol>" +
      '<p class="bn-warn">⚠️ 猜不中，压的票就用掉了，不退。请只用闲钱玩。</p>';
    return '<h2>规则一共七条</h2><ol class="bn-rules">' +
      "<li><b>票从哪来</b><span>用「批量注册」一次注册 2 个及以上 .ailgns 域名，什么名字都行，不用纯数字。每个域名付多少 DAI 就得多少张票，5 DAI 就是 5 张。只注册 1 个不算票。怎么算一批：同一个钱包 10 分钟内注册满 2 个。自己点、交给机器人代点都算；票记在付款的钱包上，机器人代点的记在域名归属的钱包上。续费不算。</span></li>" +
      "<li><b>怎么猜</b><span>每 10 分钟一期。选一个 0 到 9 的数字，压几张票，在钱包里点一次确认。票可以存着，哪一期想玩再用。<b>每个钱包每期最多押 100 张</b>，超出的不算下注，票还留在你钱包里。</span></li>" +
      "<li><b>怎么开奖</b><span>本期结束后，链上出的第一个区块，它的哈希除以 10 的余数就是开奖数字。谁也没法提前知道，谁都能自己上链核对。</span></li>" +
      "<li><b>猜中发多少</b><span>每张票发 1.9 DAI：拿回本金 1 DAI，再赚 0.9 DAI。压 5 张猜中就是 9.5 DAI。不分别人的钱。极速池里的钱暂时不够时不打折，等钱够了自动补发。</span></li>" +
      "<li><b>奖金怎么发</b><span>只发 AiLGNS。该发的 DAI 按本站 OTC 的价格换成 AiLGNS，开奖后几分钟内自动转到你下注的钱包，不用自己领。</span></li>" +
      "<li><b>没猜中</b><span>压的票就用掉了，不退。没猜中的票钱留在极速池，先用来给猜中的人发奖，剩下的是平台的服务收入。</span></li>" +
      "<li><b>老票</b><span>规则调整前用纯数字域名换的票还能用，按老规则：同一期的老票进老奖池，猜中的按票数分，没人中滚到下一期。老票和新票都有时，先用老票。</span></li></ol>" +
      '<p class="bn-warn">⚠️ 十个数字只开一个：猜中 1 张变 1.9，猜不中票就没了，平均下来是输的。这不是赚钱的办法，请只用闲钱玩。</p>';
  }
  function render() {
    ruleV2 = false;
    A.app.innerHTML = '<div id="fx-wrap">' +
      '<section class="card fx"><h1>⚡ 极速预言家 <small>试运行</small></h1><p class="sub" id="fx-sub">' + subT(false) + '</p><div id="fx-main"><p class="muted">读取中…</p></div></section>' +
      '<section class="card fx" id="fx-draws" hidden><h2>最近开奖</h2><div class="fx-balls"></div><p class="note">数字下面是开奖时间。</p></section>' +
      '<section class="card fx" id="fx-mine" hidden><h2>我的下注</h2><div class="fx-list"></div></section>' +
      '<section class="card fx" id="fx-done" hidden><h2>最近几期结果</h2><div class="fx-list"></div></section>' +
      '<section class="card fx" id="fx-rules">' + rulesH(false) + "</section>" +
      '<section class="card fx"><h2>常见问题</h2>' +
      "<details><summary>票用完了，域名还在吗？</summary><p>在。域名还是你的，照常能用、能转、能卖。只是这个域名不能再换票，想继续玩要再注册新的。</p></details>" +
      "<details><summary>钱包为什么显示「转账 0 DAI」？</summary><p>下注就是给极速奖池发一笔 0 元的转账，里面写着你猜的数字和票数。不花钱，只花一点点 Gas。这样每一笔下注链上都有记录，谁也改不了。</p></details>" +
      "<details><summary>快结束的时候压，算哪一期？</summary><p>看这笔交易被链上记下来的时间。如果记下来时本期已经结束，就算下一期。最后 20 秒建议等下一期再压。</p></details>" +
      "<details><summary>压的票比我有的多会怎样？</summary><p>按你剩下的票数算。一张都不剩的那笔作废，只白花了 Gas。</p></details></section></div>";
    try { var sv = JSON.parse(localStorage.getItem("fx:last") || "null"); if (sv && sv.open && Date.now() / 1000 - sv.now < 600) { data = sv; data.me = null; paint(); } } catch (e) {}
    stT = ""; pick = -1;
    el("fx-wrap").addEventListener("click", function (ev) {
      var t = ev.target; if (!t || !t.closest || !el("fx-main")) return;
      var d = t.closest(".fx-d");
      if (d) { pick = Number(d.getAttribute("data-d")); say(""); paint(); return; }
      if (t.closest("#fx-buy")) { try { sessionStorage.setItem("nm:batch", "1"); } catch (e) { /* 存不了就只是打开域名页，客户自己点批量注册 */ } return; } /* 去买票：到域名页后自动打开批量注册 */
      if (t.closest("#fx-conn")) { say("请在钱包里点「连接」"); connect().then(function () { say(""); }, function (e) { say((e && e.message) || "钱包没连上", true); }); return; }
      if (t.closest("#fx-minus")) { qty = Math.max(1, qty - 1); betLabel(); return; }
      if (t.closest("#fx-plus")) { qty = Math.min(Math.max(1, maxQ()), qty + 1); betLabel(); return; }
      if (t.closest("#fx-all")) { qty = Math.max(1, maxQ()); betLabel(); return; }
      if (t.closest("#fx-bet")) bet();
    });
    var go = function () { load(); };
    try { if (!acct && A.wallets && A.wallets.silent) A.wallets.silent().then(function (a) { if (a) acct = String(a).toLowerCase(); go(); }, go); else go(); } catch (e) { go(); }
    clearInterval(tick); clearInterval(poll);
    tick = setInterval(function () { if (!el("fx-main")) { clearInterval(tick); return; } try { clock(); } catch (e) {} }, 1000);
    poll = setInterval(function () { if (!el("fx-main")) { clearInterval(poll); return; } if (!document.hidden && !busy) load(); }, 10000);
  }
  A.pages.fast = function () { try { render(); } catch (e) { A.app.innerHTML = '<section class="card"><p class="muted">页面没画出来，请刷新再试。</p></section>'; } };
})();
