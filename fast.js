// ⚡ 极速预言家 #/fast（站长 2026-11-12 定稿，试运行，不宣传）
// 10 分钟一期，猜 0 到 9。票 = 新注册的纯数字 .ailgns 域名，1 DAI = 1 票。下注 = 给极速池转 0 个 DAI（只花 Gas），数据里带「ailgns-fast:数字:票数」。
// 这页只读 /api/fast，下注时才连钱包发一笔 0 DAI 转账；算账和发奖都不在这里。
(function () {
  var A = window.AIL, W = A.wallet, DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14";
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
  function paint() {
    var box = el("fx-main"); if (!box || !data) return;
    if (!data.open) { box.innerHTML = '<p class="fx-closed">⏳ 还没开放。开放时会在这里直接能玩，不用做任何准备。</p>'; ["fx-draws", "fx-mine", "fx-done"].forEach(function (i) { if (el(i)) el(i).hidden = true; }); return; }
    var me = data.me, have = left();
    if (qty > have) qty = Math.max(1, have);
    var grid = "";
    for (var d = 0; d < 10; d++) grid += '<button type="button" class="fx-d' + (d === pick ? " on" : "") + '" data-d="' + d + '"><b>' + d + "</b><i>" + (data.by[d] ? data.by[d] + " 票" : "还没人压") + "</i></button>";
    box.innerHTML =
      (data.trial ? '<p class="fx-trial">🧪 预览演示：还没正式开始，现在下注<b>不发奖</b>，只用来看页面。</p>' : "") +
      '<div class="fx-hero"><p class="fx-t">本期 <b>' + at(data.r) + '</b> 开奖，还剩</p><p class="fx-clock" id="fx-clock">--:--</p>' +
      '<p class="fx-pot">本期奖池 <b>' + money(data.pot) + " DAI</b></p>" +
      '<p class="fx-pot2">' + (data.carry > 0 ? "其中 " + money(data.carry) + " DAI 是前面没人猜中滚过来的 · " : "") + "已压 " + data.tk + " 票</p></div>" +
      '<div class="fx-me">' + (!acct ? '还不知道你是谁。<button type="button" class="fx-link" id="fx-conn">连接钱包看我的票</button>'
        : have > 0 ? "钱包 " + short(acct) + " 还有 <b>" + have + "</b> 张票"
        : "钱包 " + short(acct) + " 现在<b>没有票</b>。注册一个纯数字域名就有票，付 5 DAI 就是 5 张。") + "</div>" +
      (acct && have <= 0 ? '<a class="fx-go" href="#/names">去买票（注册纯数字域名）</a>' : "") +
      '<p class="fx-h">① 选一个数字</p><div class="fx-grid">' + grid + "</div>" +
      '<p class="fx-h">② 压几张票</p><div class="fx-qty"><button type="button" id="fx-minus">−</button><b id="fx-n">' + qty + '</b><button type="button" id="fx-plus">＋</button><button type="button" class="fx-all" id="fx-all">全压</button></div>' +
      '<button type="button" class="fx-bet" id="fx-bet"></button><p class="fx-st" id="fx-st"></p>' +
      '<p class="note">猜中：和本期所有猜中的人按票数平分奖池，奖金换成 AiLGNS 自动转到你的钱包。猜不中：这几张票就用掉了。</p>';
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
        return '<div class="fx-row"><span><b>' + at(x.r) + "</b> 期　开 <b>" + x.d + "</b>　" + x.tk + " 票　奖池 " + money(x.pot) + "</span>" + (x.winners ? '<span class="fx-tag win">' + x.winners + " 人中</span>" : '<span class="fx-tag wait">没人中，滚存</span>') + "</div>";
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
    var n = Math.min(qty, have), d = pick;
    if (!window.confirm("确定压 " + n + " 张票，猜 " + d + " 吗？\n\n① 钱包会弹出来，显示「转账 0 DAI」，这是正常的，只花一点点 Gas\n② 猜中平分奖池；猜不中，这 " + n + " 张票就用掉了\n③ 发出去以后不能撤回")) return;
    var tx = { from: acct, to: DAI, data: "0xa9059cbb" + data.pool.slice(2).padStart(64, "0") + "".padStart(64, "0") + hexOf("ailgns-fast:" + d + ":" + n) };
    busy = true; betLabel(); say("请在钱包里点「确认」（显示转账 0 DAI 是正常的）");
    W.switchTo(eth, "anubis").then(function () { return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [tx] }); })
      .then(function (h) { say("已发出，等链上记账，大约十几秒…"); return W.waitOn("anubis", h); })
      .then(function () { busy = false; pick = -1; say("✅ 压好了：" + n + " 张票猜 " + d + "。开奖后在下面「我的下注」看结果。"); setTimeout(load, 2500); setTimeout(load, 8000); betLabel(); })
      .catch(function (e) { busy = false; betLabel(); say(/reject|denied|取消|cancel/i.test((e && e.message) || "") ? "你在钱包里点了取消，没有下注。" : "没发出去：" + ((e && e.message) || "请稍后再试"), true); });
  }

  function render() {
    A.app.innerHTML = '<div id="fx-wrap">' +
      '<section class="card fx"><h1>⚡ 极速预言家 <small>试运行</small></h1><p class="sub">10 分钟开一期，猜一个 0 到 9 的数字。猜中的人平分本期奖池。</p><div id="fx-main"><p class="muted">读取中…</p></div></section>' +
      '<section class="card fx" id="fx-draws" hidden><h2>最近开奖</h2><div class="fx-balls"></div><p class="note">数字下面是开奖时间。</p></section>' +
      '<section class="card fx" id="fx-mine" hidden><h2>我的下注</h2><div class="fx-list"></div></section>' +
      '<section class="card fx" id="fx-done" hidden><h2>最近几期结果</h2><div class="fx-list"></div></section>' +
      '<section class="card fx"><h2>规则一共六条</h2><ol class="bn-rules">' +
      "<li><b>票从哪来</b><span>注册一个纯数字的 .ailgns 域名，付多少 DAI 就得多少张票，5 DAI 就是 5 张。票记在付款的钱包上，续费不算。要自己点注册才有票，交给机器人代点的暂时不算。</span></li>" +
      "<li><b>怎么猜</b><span>每 10 分钟一期。选一个 0 到 9 的数字，压几张票，在钱包里点一次确认。票可以存着，哪一期想玩再用。</span></li>" +
      "<li><b>怎么开奖</b><span>本期结束后，链上出的第一个区块，它的哈希除以 10 的余数就是开奖数字。谁也没法提前知道，谁都能自己上链核对。</span></li>" +
      "<li><b>奖池怎么分</b><span>每张票带 0.9 DAI 进本期奖池，另外 0.1 DAI 是平台服务费。猜中的人按票数平分奖池。</span></li>" +
      "<li><b>奖金怎么发</b><span>只发 AiLGNS。分到的 DAI 按本站 OTC 的价格换成 AiLGNS，开奖后几分钟内自动转到你下注的钱包，不用自己领。</span></li>" +
      "<li><b>没人猜中</b><span>整个奖池滚到下一期。</span></li></ol>" +
      '<p class="bn-warn">⚠️ 猜不中，压的票就用掉了，不退。请只用闲钱玩。</p></section>' +
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
      if (t.closest("#fx-conn")) { say("请在钱包里点「连接」"); connect().then(function () { say(""); }, function (e) { say((e && e.message) || "钱包没连上", true); }); return; }
      if (t.closest("#fx-minus")) { qty = Math.max(1, qty - 1); betLabel(); return; }
      if (t.closest("#fx-plus")) { qty = Math.min(Math.max(1, left()), qty + 1); betLabel(); return; }
      if (t.closest("#fx-all")) { qty = Math.max(1, left()); betLabel(); return; }
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
