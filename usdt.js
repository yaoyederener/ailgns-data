// 💵 #/usdt「USDT 跨链桥」一键通道（站长 2026-11-19：客户 USDT 提到 Polygon 换 DAI 损耗太高，是刚需；试运行，放 ☰ 更多 → 交易）
// 双向（站长同日要求）：
//   充进来 dir=in ：① Polygon 上 USDT 换成 DAI  → ② DAI 过桥到 Anubis
//   提出去 dir=out：① Anubis 的 DAI 过桥到 Polygon → ② Polygon 上 DAI 换成 USDT
// 每一步都由客户自己的钱包签名，本站不经手客户的币、没有新合约。
// 换币：/api/u2d 向聚合器（KyberSwap，不通就换 ParaSwap）要最划算的路线，收 0.1% 服务费（聚合器自带的接入方分成，换币那一笔里直接分走；费率在 functions/api/u2d.js 的 FEE_BPS，页面从接口读）。
// 过桥：Anubis 官方跨链桥（app.anubisbridge.com），两个方向都是同一个函数 bridge(币编号, 目标链, 收款人, 数量)，不收手续费（2026-11-19 核对官方桥订单记录：两个方向都是发多少到多少）。
//   Polygon → Anubis：要先授权 DAI 给桥；Anubis → Polygon：DAI 是 Anubis 的原生币，链上实测不用授权（模拟不带授权能过，真实交易也都没有授权这一步）。
//   合约本身不拦 10 DAI 以下的数量，但官方页面规定最少 10 DAI，低于这个数可能没人处理，所以本页一律拦在 10 DAI。
// 授权只授权这一笔的数量（用的是第三方合约，不给无限额度）。Polygon 上 Gas 用 POL，Anubis 上 Gas 用 DAI。
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", PDAI = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063";
  var BRIDGE = "0x8932fe7726c1ee743f662f485c3e5a5d1d595f71"; // Anubis 官方跨链桥（各链同一地址）
  var DAI_ID = "a5e92f3efb6826155f1f728e162af9d7cda33a574a1153b58f03ea01cc37e568"; // 桥里 DAI 的编号（两条链相同）
  var CHAIN_ID = { anubis: 6714, polygon: 137 }, FEE = 0, BMIN = 10, SLIP = 50; // 官方桥不收费；最少 10 DAI；价格保护 0.5%。哪天官方开始收费，改 FEE 这一个数，页面文字会跟着变
  var GAS_KEEP = 50000000000000000n; // 提出去时在 Anubis 上留 0.05 DAI 当 Gas，「全部」不会把它也跨走
  var POL_MIN = 20000000000000000n; // Polygon 上少于 0.02 POL 就付不了 Gas
  var ROUTERS = ["0x6131b5fae19ea4f9d964eac0408e4408b66337b5", "0x6a000f20005980200259b80c5102003040001068"]; // KyberSwap、ParaSwap（备用）的路由合约
  var SEL = { balanceOf: "0x70a08231", allowance: "0xdd62ed3e", approve: "0x095ea7b3", bridge: "0x8d3ccf9f" /* bridge(bytes32,uint32,bytes32,uint256) */ };
  var account = null, bal = null, q = null, busy = false, rid = 0, qTimer = null, qSeq = 0, watch = null, dir = "in";
  // 换币这一步两个方向各自的：付出币、换出币、小数位
  function P() { return dir === "in" ? { src: USDT, sd: 6, sn: "USDT", dd: 18, dn: "DAI", sb: "usdt", db: "pdai" } : { src: PDAI, sd: 18, sn: "DAI", dd: 6, dn: "USDT", sb: "pdai", db: "usdt" }; }
  // 过桥这一步两个方向各自的：从哪条链到哪条链、余额记在哪
  function B() { return dir === "in" ? { from: "polygon", to: "anubis", fn: "Polygon", tn: "Anubis", fb: "pdai", tb: "adai" } : { from: "anubis", to: "polygon", fn: "Anubis", tn: "Polygon", fb: "adai", tb: "pdai" }; }
  var DEC = { usdt: 6, pdai: 18, adai: 18 };
  // 官方桥过一次要多久（秒）。2026-11-19 从官方桥订单记录量的：Polygon → Anubis 29 笔全是约 2 分钟；Anubis → Polygon 72 笔全是约 130 分钟
  // （官方桥设定：Anubis 发出的要等 7200 个区块确认，约 2 小时；别的链只等 64 个区块）。这是官方桥的规则，本站改不了也加急不了
  var EXPECT = { in: 2 * 60, out: 130 * 60 };
  function dur(sec) { sec = Math.max(0, Math.round(sec)); if (sec < 90) return sec < 45 ? "不到 1 分钟" : "约 1 分钟"; var m = Math.round(sec / 60); return m < 60 ? "约 " + m + " 分钟" : "约 " + Math.floor(m / 60) + " 小时" + (m % 60 ? " " + (m % 60) + " 分钟" : ""); }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function g(id) { return document.getElementById(id); }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function aw(a) { return String(a).toLowerCase().replace("0x", "").padStart(64, "0"); }
  function units(s, d) { s = String(s || "").trim().replace(/,/g, ""); if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return 0n; var p = s.split("."); return BigInt(p[0] || "0") * 10n ** BigInt(d) + BigInt((p[1] || "").slice(0, d).padEnd(d, "0") || "0"); }
  function n(wei, d) { return Number(wei) / Math.pow(10, d); }
  function f(v, dg) { return isFinite(v) ? Number(v).toLocaleString("en-US", { minimumFractionDigits: dg === undefined ? 2 : dg, maximumFractionDigits: dg === undefined ? 2 : dg }) : "—"; }
  function plain(wei, d, dg) { var v = n(wei, d), p = Math.pow(10, dg); return String(Math.floor(v * p) / p); } // 往下取，免得填出来比余额多
  function nice(e) { var m = (A.otcKit && A.otcKit.niceError) ? A.otcKit.niceError(e) : String((e && e.message) || e || ""); return /reject|denied|取消|拒绝|cancel/i.test(m) ? "你在钱包里取消了，币没有动。想继续再点一次就行" : (m || "钱包没有响应，刷新后再试"); }
  function rd(chain, to, data) { return W.rpcOn(chain, "eth_call", [{ to: to, data: data }, "latest"]).then(function (h) { return BigInt(h && h !== "0x" ? h : 0); }); }
  function balOf(k) { return bal ? f(n(bal[k], DEC[k])) : "—"; }

  // ---------- 余额 ----------
  function loadBal() {
    if (!account) { bal = null; return Promise.resolve(); }
    var a = account;
    return Promise.all([
      rd("polygon", USDT, SEL.balanceOf + aw(a)), rd("polygon", PDAI, SEL.balanceOf + aw(a)),
      W.rpcOn("polygon", "eth_getBalance", [a, "latest"]).then(BigInt), W.rpcOn("anubis", "eth_getBalance", [a, "latest"]).then(BigInt)
    ]).then(function (r) { if (a === account) bal = { usdt: r[0], pdai: r[1], pol: r[2], adai: r[3] }; });
  }
  // 余额写进每个兑换框右上角（Uniswap 式：钱在哪条链、有多少，就写在那个框里）
  function setBal() { var p = P(), b = B(); [["u2d-b1", balOf(p.sb)], ["u2d-b2", balOf(p.db)], ["u2d-b2b", balOf(b.fb)], ["u2d-b3", balOf(b.tb)]].forEach(function (x) { var e = g(x[0]); if (e) e.textContent = x[1]; }); }
  function paintBal() {
    var el = g("u2d-bal"); if (!el) return;
    setBal();
    if (!account) { el.innerHTML = '<button type="button" class="u2d-conn" id="u2d-conn">连接钱包</button><p class="note">连上后，每个框右上角会显示你在那条链上的余额。</p>'; g("u2d-conn").onclick = function () { connect("polygon").then(function () { track(); return loadBal(); }).then(paintAll, function (e) { say("s", nice(e), true); }); }; return; }
    if (!bal) { el.innerHTML = '<p class="muted">正在读余额…</p>'; return; }
    var low = bal.pol < POL_MIN, pol = f(n(bal.pol, 18), low ? 3 : 2);
    el.innerHTML = dir === "in"
      ? (low ? '<p class="u2d-warn">⚠️ 这个钱包在 Polygon 上只有 ' + pol + ' 个 POL，付不了 Gas。请先从交易所提 1 个 POL 到这个钱包（选 Polygon 网络），再回来操作。</p>' : '<p class="note">Polygon 上的 Gas 用 POL 付，你有 ' + pol + " 个，够用（两步合起来不到 0.2 个）。</p>")
      : (low ? '<p class="u2d-warn">⚠️ 先别急着跨：这个钱包在 Polygon 上只有 ' + pol + ' 个 POL。DAI 跨到 Polygon 以后，换成 USDT 那一步要用 POL 付 Gas。请先从交易所提 1 个 POL 到这个钱包（选 Polygon 网络）。</p>' : '<p class="note">第 1 步在 Anubis 上，Gas 用 DAI 付（很少）；第 2 步在 Polygon 上，Gas 用 POL 付，你有 ' + pol + " 个，够用。</p>");
  }

  // ---------- 钱包 ----------
  function connect(chain) {
    var eth;
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { account = String(a[0]).toLowerCase(); return W.switchTo(eth, chain); }).then(function () { return account; });
  }
  function ready(chain) { return Promise.resolve().then(function () { return account ? W.switchTo(W.get(), chain) : connect(chain); }); }
  function say(k, t, bad) { var el = g("u2d-say-" + k); if (el) { el.textContent = t || ""; el.className = "u2d-say" + (bad ? " bad" : t ? " on" : ""); } }
  function lock(on) { busy = on; ["u2d-go-s", "u2d-go-b", "u2d-dir-in", "u2d-dir-out"].forEach(function (i) { var b = g(i); if (b) b.disabled = on; }); }
  function wait(chain, hash) {
    var tries = 0;
    return new Promise(function (ok, fail) {
      (function poll() {
        W.rpcOn(chain, "eth_getTransactionReceipt", [hash]).then(function (r) {
          if (r) return r.status === "0x1" ? ok(r) : fail(new Error("这笔交易被链上拒绝了，币没有动（只花了一点 Gas）"));
          if (++tries > 120) return fail(new Error("等了 4 分钟链上还没确认。别重复点：过一会儿刷新这一页，余额变了就是成功了"));
          setTimeout(poll, 2000);
        }, function () { setTimeout(poll, 3000); });
      })();
    });
  }
  // 先在节点上模拟一次，会失败的直接说原因，不让钱包弹一个确认不了的窗口；Gas 由本站节点估好（多留 30%）
  function send(chain, to, data, k, label) {
    var eth = W.get();
    say(k, "正在检查这一步能不能成功…");
    return Promise.all([
      W.rpcOn(chain, "eth_call", [{ from: account, to: to, data: data }, "latest"]).catch(function (e) { throw new Error("这一步现在做不成：" + nice(e)); }),
      W.rpcOn(chain, "eth_estimateGas", [{ from: account, to: to, data: data }]).then(function (x) { return "0x" + (BigInt(x) * 13n / 10n).toString(16); }, function () { return null; })
    ]).then(function (res) {
      var tx = { from: account, to: to, data: data }; if (res[1]) tx.gas = res[1];
      say(k, "请在钱包里确认「" + label + "」");
      return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [tx] });
    }).then(function (hash) { say(k, label + "已提交，等链上确认（一般十几秒）…"); return wait(chain, hash); });
  }
  // 第三方合约：只授权这一笔要用的数量，不给无限额度（只在 Polygon 上用）
  function allow(token, spender, amount, k, name) {
    return rd("polygon", token, SEL.allowance + aw(account) + aw(spender)).then(function (a) {
      if (a >= amount) return;
      return send("polygon", token, SEL.approve + aw(spender) + u256(amount), k, "授权 " + name + "（只授权这一笔的数量）");
    });
  }

  // ---------- 换币：报价 + 发交易（在 Polygon 上） ----------
  function getQuote(amt) { var d = dir; return fetch("/api/u2d?amt=" + amt + "&dir=" + d).then(function (r) { return r.json(); }).then(function (j) { if (!j || j.error || !j.ok) throw new Error((j && j.error) || "现在拿不到报价，稍后再试"); if ((j.dir || "in") !== d) throw new Error("报价方向不对，请重新填一次数量"); return { dir: d, amt: amt, out: BigInt(j.out), fee: BigInt(j.fee || 0), feeBps: Number(j.feeBps) || 0, sum: j.sum, via: j.via, at: Date.now() }; }); }
  function paintQuote(err) {
    var el = g("u2d-q"), top = g("u2d-top"), o1 = g("u2d-out1"), p = P(); if (!el) return;
    var okq = !err && q && q.dir === dir;
    if (o1) { o1.textContent = okq ? f(n(q.out, p.dd)) : "0"; o1.className = "u2d-num" + (okq ? "" : " zero"); }
    if (err) { el.innerHTML = '<p class="u2d-warn">' + esc(err) + "</p>"; if (top) top.innerHTML = ""; return; }
    if (!okq) { el.innerHTML = '<p class="muted">填上要换多少 ' + p.sn + "，上面马上显示能换到多少 " + p.dn + "。</p>"; if (top) top.innerHTML = ""; return; }
    // out 已经是扣完本站服务费之后的到手数（显示即所得）；gap = 除服务费以外的差额，主要是 USDT 和 DAI 两个币本身的市价差，不是手续费
    var inU = n(q.amt, p.sd), out = n(q.out, p.dd), fee = n(q.fee, p.dd), pct = q.feeBps / 100, gap = (1 - (out + fee) / inU) * 100, min = out * (1 - SLIP / 10000);
    var feeTxt = q.feeBps ? "本站服务费 " + pct + "%（约 " + f(fee) + " " + p.dn + "）已经扣在这个数里" : "本站不收费";
    el.innerHTML = '<p class="note">' + feeTxt + "。" + (gap > 0.005 ? "另外约 " + f(gap, 2) + "% 是 USDT 和 DAI 这两个币本身的市价差，不是手续费，在哪换都一样。" : gap < -0.005 ? "这一刻 " + p.sn + " 比 " + p.dn + " 略贵，市价差对你有利。" : "") + "</p>" +
      '<p class="note">最少到手 ' + f(min) + " " + p.dn + "：成交那一刻价格突然变差超过 0.5%，这笔会自动取消，不会按更差的价成交。</p>" +
      (gap > 1 ? '<p class="u2d-warn">⚠️ 现在这个数量换下来比平时差不少（市价差超过 1%）。可以把数量改小分几次换，或者过一会儿再看。</p>' : "");
    if (!top) return;
    var paid = q.feeBps ? "已扣本站服务费 " + pct + "%" : "本站不收费", free = FEE ? "官方过桥费 " + FEE + " DAI" : "官方跨链桥不收费";
    if (dir === "in") top.innerHTML = out >= BMIN ? '<div class="u2d-sum"><small>' + f(inU) + " USDT 两步走完，到 Anubis 约</small><b>" + f(out - FEE) + " DAI</b><span>" + paid + "，" + free + "</span></div>" : '<p class="u2d-warn">换出来不到 ' + BMIN + " DAI，过不了桥（官方桥最少跨 " + BMIN + " DAI）。请把数量加大一点。</p>";
    else top.innerHTML = '<div class="u2d-sum"><small>' + f(inU) + " DAI 两步走完，到 Polygon 约</small><b>" + f(out) + " USDT</b><span>" + paid + "，" + free + "</span></div>";
  }
  function onAmt() {
    clearTimeout(qTimer); var seq = ++qSeq, p = P(), amt = units((g("u2d-a1") || {}).value, p.sd), one = 10n ** BigInt(p.sd);
    if (amt < one) { q = null; if (amt > 0n) paintQuote("最少换 1 " + p.sn); else paintQuote(); return; }
    var el = g("u2d-q"); if (el) el.innerHTML = '<p class="muted">正在全网找最划算的价…</p>';
    qTimer = setTimeout(function () { getQuote(amt.toString()).then(function (x) { if (seq !== qSeq) return; q = x; paintQuote(); }, function (e) { if (seq !== qSeq) return; q = null; paintQuote(String((e && e.message) || e)); }); }, 450);
  }
  function swap() {
    if (busy) return;
    var d0 = dir, p = P(), amt = units((g("u2d-a1") || {}).value, p.sd);
    if (amt < 10n ** BigInt(p.sd)) return say("s", "先填要换多少 " + p.sn + "（最少 1）", true);
    lock(true); say("s", "正在连接钱包…");
    var before = 0n, got = 0n;
    ready("polygon").then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (bal[p.sb] < amt) throw new Error("Polygon 上的 " + p.sn + " 不够：你有 " + balOf(p.sb) + "，要换 " + f(n(amt, p.sd)));
      if (bal.pol < POL_MIN) throw new Error("钱包里的 POL 不够付 Gas，请先从交易所提 1 个 POL 到这个钱包（Polygon 网络）");
      before = bal[p.db]; say("s", "正在拿最新报价…");
      return getQuote(amt.toString());
    }).then(function (x) {
      if (dir !== d0) throw new Error("方向已经换了，请重新点一次");
      q = x; paintQuote();
      return fetch("/api/u2d", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sum: x.sum, via: x.via, dir: d0, sender: account, slip: SLIP }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || j.error || !j.ok) throw new Error((j && j.error) || "拿不到换币数据，稍后再试");
      // 本机再核一遍：只认登记的两个聚合器路由合约（KyberSwap、ParaSwap），方向要对，交易里必须写着你自己的地址
      if (ROUTERS.indexOf(String(j.to).toLowerCase()) < 0 || (j.dir || "in") !== d0 || String(j.data).toLowerCase().indexOf(account.slice(2)) < 0) throw new Error("换币数据没通过安全检查，已拦下，你的币没有动");
      return allow(p.src, j.to, amt, "s", p.sn).then(function () { return send("polygon", j.to, j.data, "s", p.sn + " 换成 " + p.dn); });
    }).then(function () { return loadBal(); }).then(function () {
      got = bal && bal[p.db] > before ? bal[p.db] - before : 0n;
      var a1 = g("u2d-a1"); if (a1) a1.value = ""; q = null;
      paintAll();
      var gotTxt = got > 0n ? "，到手 " + f(n(got, p.dd)) + " " + p.dn : "";
      if (d0 === "in") {
        say("s", "✅ 换好了" + gotTxt + "。接着做第 2 步，把 DAI 跨到 Anubis。");
        var a2 = g("u2d-a2"); if (a2 && bal && dir === "in") { a2.value = plain(bal.pdai, 18, 4); onAmt2(); a2.scrollIntoView({ behavior: "smooth", block: "center" }); }
      } else say("s", "🎉 换好了" + gotTxt + "，就在你这个钱包里（Polygon 链）。两步都走完了。");
    }).catch(function (e) { say("s", "没成功：" + nice(e), true); }).then(function () { lock(false); });
  }

  // ---------- 过桥（充进来在 Polygon 上发，提出去在 Anubis 上发） ----------
  function onAmt2() {
    var el = g("u2d-b"), o2 = g("u2d-out2"), b = B(); if (!el) return; var v = units((g("u2d-a2") || {}).value, 18), okv = n(v, 18) >= BMIN;
    if (o2) { o2.textContent = okv ? f(n(v, 18) - FEE) : "0"; o2.className = "u2d-num" + (okv ? "" : " zero"); }
    el.innerHTML = v === 0n ? '<p class="muted">填上要跨多少 DAI。</p>' : !okv ? '<p class="u2d-warn">官方桥最少跨 ' + BMIN + " DAI。</p>" : '<p class="note">' + (FEE ? "官方桥收 " + FEE + " DAI" : "官方跨链桥不收费，跨多少到多少") + "。到账地址就是你现在这个钱包，在 " + b.tn + " 链上。</p>";
  }
  function bridge() {
    if (busy) return;
    var d0 = dir, b = B(), amt = units((g("u2d-a2") || {}).value, 18);
    if (n(amt, 18) < BMIN) return say("b", "官方桥最少跨 " + BMIN + " DAI", true);
    lock(true); say("b", "正在连接钱包…");
    var start = 0n, txHash = "";
    ready(b.from).then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (d0 === "in") {
        if (bal.pdai < amt) throw new Error("Polygon 上的 DAI 不够：你有 " + balOf("pdai") + "，要跨 " + f(n(amt, 18)));
        if (bal.pol < POL_MIN / 2n) throw new Error("钱包里的 POL 不够付 Gas，请先从交易所提 1 个 POL 到这个钱包（Polygon 网络）");
      } else if (bal.adai < amt + GAS_KEEP / 5n) throw new Error("Anubis 上的 DAI 不够：你有 " + balOf("adai") + "，要跨 " + f(n(amt, 18)) + "，还要留一点点当 Gas。点「全部」会自动留好");
      start = bal[b.tb];
      // Polygon 的 DAI 是普通代币，要先授权给桥；Anubis 的 DAI 是原生币，实测不用授权
      return d0 === "in" ? allow(PDAI, BRIDGE, amt, "b", "DAI 给官方跨链桥") : null;
    }).then(function () {
      if (dir !== d0) throw new Error("方向已经换了，请重新点一次");
      return send(b.from, BRIDGE, SEL.bridge + DAI_ID + u256(CHAIN_ID[b.to]) + aw(account) + u256(amt), "b", "DAI 跨到 " + b.tn);
    }).then(function (rc) { txHash = rc && rc.transactionHash; return loadBal(); }).then(function () {
      var a2 = g("u2d-a2"); if (a2) a2.value = ""; paintAll();
      say("b", "✅ 已交给官方跨链桥，正在跨（官方桥到账" + dur(EXPECT[d0]) + "）。进度看页面上方的进度条，可以关掉这一页，回来还在。");
      track({ a: account, dir: d0, amt: amt.toString(), start: start.toString(), t0: Date.now(), tx: txHash || "" });
    }).catch(function (e) { say("b", "没成功：" + nice(e), true); }).then(function () { lock(false); });
  }
  // ---------- 到账进度条 ----------
  // 过桥那一笔记在本机（按钱包地址），关掉页面再回来还能接着看；每 20 秒查一次：先问官方桥这一笔的状态，再看目标链余额有没有变多，哪个先说到了都算到
  var PKEY = "u2d:pend:";
  function pend() { try { var p = JSON.parse(localStorage.getItem(PKEY + account) || "null"); return p && p.a === account && Date.now() - p.t0 < 3 * 86400e3 ? p : null; } catch (e) { return null; } }
  function pendSave(p) { try { if (p) localStorage.setItem(PKEY + p.a, JSON.stringify(p)); } catch (e) { /* 存不上只是关掉页面后看不到进度，不影响到账 */ } }
  function pendClear() { try { localStorage.removeItem(PKEY + account); } catch (e) { /* 忽略 */ } var el = g("u2d-prog"); if (el) el.innerHTML = ""; clearInterval(watch); }
  function paintProg(p) {
    var el = g("u2d-prog"); if (!el) return; if (!p) { el.innerHTML = ""; return; }
    var isIn = p.dir === "in", to = isIn ? "Anubis" : "Polygon", exp = EXPECT[p.dir], el2 = (Date.now() - p.t0) / 1000, amt = f(n(BigInt(p.amt), 18) - FEE);
    var done = !!p.done, late = !done && el2 > exp * 1.3 + 300, pct = done ? 100 : Math.max(4, Math.min(96, el2 / exp * 100));
    var head = done ? "🎉 到账了：" + amt + " DAI 已经在 " + to + " 链上" : "正在跨链：" + amt + " DAI → " + to + " 链";
    var sub2 = done ? "这一趟用了" + dur((p.done - p.t0) / 1000) + "。" + (isIn ? "现在可以去买 AiLGNS 或注册域名了。" : "接着做第 2 步，把 DAI 换成 USDT。")
      : late ? "已经过了" + dur(el2) + "，比平时（" + dur(exp) + "）慢。币不会丢，官方桥还在处理。"
      : "已经过了" + dur(el2) + " · 预计还要" + dur(exp - el2);
    el.innerHTML = '<div class="u2d-prog' + (done ? " done" : late ? " late" : "") + '"><div class="u2d-pt"><b>' + head + "</b><span>" + sub2 + '</span></div>' +
      '<div class="u2d-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<ol class="u2d-stg"><li class="ok">交易已上链</li><li class="' + (done ? "ok" : "now") + '">官方桥确认中</li><li class="' + (done ? "ok" : "") + '">到账</li></ol>' +
      (done ? "" : '<p class="note">' + (isIn ? "这个方向官方桥一般 2 分钟左右到账。" : "这个方向官方桥要等 2 小时 10 分钟左右，是它的安全规则（下面有详细说明），不是卡住了。") + "可以关掉这一页去做别的，回来还能看到进度。" + (late ? "一直不到，就到官方桥 app.anubisbridge.com 的 History 里看这一笔，或者提工单把钱包地址和交易哈希发给我们。" : "") + "</p>") +
      '<button type="button" class="u2d-px" id="u2d-px">' + (done ? "知道了" : "不看这条进度了") + "</button></div>";
    var x = g("u2d-px"); if (x) x.onclick = pendClear;
  }
  function arrived(p, nowBal) {
    if (p.done) return; p.done = Date.now(); pendSave(p); clearInterval(watch); paintProg(p);
    loadBal().then(function () { paintBal(); if (p.dir === "out" && dir === "out" && bal) { var a1 = g("u2d-a1"); if (a1 && !a1.value) { a1.value = plain(bal.pdai, 18, 4); onAmt(); } } }, function () { /* 余额下次再读 */ });
  }
  function checkProg() {
    var p = pend(); if (!p || p.done) return clearInterval(watch);
    paintProg(p);
    var a = p.a, st = BigInt(p.start || 0);
    (p.tx ? fetch("/api/u2d?order=" + p.tx + "&a=" + a).then(function (r) { return r.json(); }).catch(function () { return null; }) : Promise.resolve(null)).then(function (j) {
      if (a !== account) return;
      if (j && j.ok && j.found && (j.status === "completed" || j.receivedTs)) return arrived(p);
      return (p.dir === "in" ? W.rpcOn("anubis", "eth_getBalance", [a, "latest"]).then(BigInt) : rd("polygon", PDAI, SEL.balanceOf + aw(a))).then(function (now) { if (a === account && now > st) arrived(p); });
    }).catch(function () { /* 这一轮没查到，等下一轮 */ });
  }
  function track(p) { if (p) pendSave(p); clearInterval(watch); var cur = pend(); paintProg(cur); if (cur && !cur.done) { watch = setInterval(function () { if (!g("u2d-prog")) return clearInterval(watch); checkProg(); }, 20000); checkProg(); } }

  // ---------- 页面 ----------
  var hooked = false;
  function paintAll() { paintBal(); paintQuote(); onAmt2(); }
  function tok(cls, ch, sym, chain) { return '<div class="u2d-tok"><i class="u2d-coin ' + cls + '">' + ch + "</i><span><b>" + sym + "</b><small>" + chain + " 链</small></span></div>"; }
  function chip(c, t) { return '<span class="u2d-chip"><i class="u2d-dot ' + c + '"></i>' + t + "</span>"; }
  // 换币那张卡（两个方向都在 Polygon 上）
  function swapCard(no) {
    var p = P(), isIn = dir === "in";
    return '<section class="u2d-card"><div class="u2d-step"><i>' + no + "</i><b>换币</b><span>在 Polygon 链上，" + p.sn + " 换成 " + p.dn + "</span></div>" +
      '<div class="u2d-box"><div class="u2d-bh"><span>你付出</span><span>余额 <b id="u2d-b1">—</b><button type="button" class="u2d-max" id="u2d-max1">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="u2d-a1" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + (isIn ? tok("usdt", "₮", "USDT", "Polygon") : tok("dai", "◈", "DAI", "Polygon")) + "</div></div>" +
      '<div class="u2d-mid"><i>↓</i></div>' +
      '<div class="u2d-box' + (isIn ? "" : " end") + '"><div class="u2d-bh"><span>你换到（已扣服务费）</span><span>余额 <b id="u2d-b2">—</b></span></div>' +
      '<div class="u2d-bm"><output id="u2d-out1" class="u2d-num zero">0</output>' + (isIn ? tok("dai", "◈", "DAI", "Polygon") : tok("usdt", "₮", "USDT", "Polygon")) + "</div></div>" +
      '<div id="u2d-q" class="u2d-info"></div><button type="button" class="u2d-go" id="u2d-go-s">换成 ' + p.dn + '</button><p class="u2d-say" id="u2d-say-s"></p>' +
      (isIn ? "" : '<p class="note">Polygon 链上已经有 DAI？跳过第 1 步，直接做这一步。</p>') + "</section>";
  }
  // 过桥那张卡
  function bridgeCard(no) {
    var b = B(), isIn = dir === "in";
    return '<section class="u2d-card"><div class="u2d-step"><i>' + no + "</i><b>过桥</b><span>DAI 从 " + b.fn + " 链跨到 " + b.tn + " 链</span></div>" +
      '<div class="u2d-box"><div class="u2d-bh"><span>你跨出</span><span>余额 <b id="u2d-b2b">—</b><button type="button" class="u2d-max" id="u2d-max2">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="u2d-a2" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + tok(isIn ? "dai" : "dai an", "◈", "DAI", b.fn) + "</div></div>" +
      '<div class="u2d-mid"><i>↓</i></div>' +
      '<div class="u2d-box' + (isIn ? " end" : "") + '"><div class="u2d-bh"><span>你到账</span><span>余额 <b id="u2d-b3">—</b></span></div>' +
      '<div class="u2d-bm"><output id="u2d-out2" class="u2d-num zero">0</output>' + tok(isIn ? "dai an" : "dai", "◈", "DAI", b.tn) + "</div></div>" +
      '<div id="u2d-b" class="u2d-info"></div>' +
      (isIn ? '<p class="u2d-eta">⏱ 这一步到账：<b>2 分钟左右</b></p>'
        : '<div class="u2d-eta slow"><p>⏳ 这一步到账要等 <b>2 小时 10 分钟左右</b>，比充进来慢很多。</p><details><summary>为什么这么慢？能加急吗？</summary>' +
          '<p>慢的是 Anubis 官方跨链桥，不是本站，也不是你的钱包卡了。</p>' +
          '<p><b>原因</b>：官方桥为了安全，要等你在 Anubis 链上的这笔交易被后面 7200 个区块压住（大约 2 小时），确认它绝不会被撤回，才肯在 Polygon 那边把 DAI 放给你。别的链只要等 64 个区块，所以充进来只要 2 分钟。</p>' +
          '<p><b>实际数字</b>：我们查了官方桥最近 72 笔从 Anubis 跨到 Polygon 的记录，每一笔都是 2 小时 10 分钟左右到账；从 Polygon 跨到 Anubis 的 29 笔都是 2 分钟左右。</p>' +
          '<p><b>不能加急</b>：这是官方桥写死的规则，谁也改不了，付再多钱也快不了。</p>' +
          '<p><b>等的时候</b>：币不会丢，它在官方桥里排队。你可以关掉这一页，回来页面上方的进度条还在；到账后再做第 2 步换成 USDT。也可以到官方桥 app.anubisbridge.com 的 History 里看这一笔。</p>' +
          '<p><b>急用钱</b>：请提前 2 个多小时操作，别等到要用的时候才跨。</p></details></div>') +
      '<button type="button" class="u2d-go" id="u2d-go-b">跨到 ' + b.tn + '</button><p class="u2d-say" id="u2d-say-b"></p>' +
      '<p class="note">' + (isIn ? "已经有 Polygon 链的 DAI？跳过第 1 步，直接做这一步。" : "") + "官方桥最少跨 " + BMIN + " DAI。</p></section>";
  }
  function render() {
    var isIn = dir === "in";
    A.app.innerHTML =
      // 版式参照 Uniswap 的兑换卡：窄卡居中、上下两个大框（付出 / 到手）、中间一个箭头、右边写清是哪条链的哪个币（站长 2026-11-19）
      '<div class="u2d">' +
      '<header class="u2d-hd"><h2>USDT 跨链桥<span class="lp-tag">试运行</span></h2>' +
      '<div class="u2d-dir" role="tablist"><button type="button" id="u2d-dir-in" class="' + (isIn ? "on" : "") + '"><b>充进来</b><small>USDT → Anubis</small></button><button type="button" id="u2d-dir-out" class="' + (isIn ? "" : "on") + '"><b>提出去</b><small>Anubis → USDT</small></button></div>' +
      '<div class="u2d-route">' + (isIn ? chip("pg", "Polygon 链 · USDT") + "<b>→</b>" + chip("an", "Anubis 链 · DAI") : chip("an", "Anubis 链 · DAI") + "<b>→</b>" + chip("pg", "Polygon 链 · USDT")) + "</div>" +
      '<p class="u2d-lead">' + (isIn ? "把 <b>Polygon 链上的 USDT</b>，变成 <b>Anubis 链上的 DAI</b>。" : "把 <b>Anubis 链上的 DAI</b>，变回 <b>Polygon 链上的 USDT</b>。") + "两步，都在你自己钱包里签名，本站不经手你的币。换币时本站收 0.1% 服务费，过桥不收费。</p></header>" +
      '<div id="u2d-top"></div><div id="u2d-bal"></div><div id="u2d-prog"></div>' +
      (isIn ? swapCard(1) + bridgeCard(2) : bridgeCard(1) + swapCard(2)) +
      '<section class="u2d-card u2d-faq"><details><summary>这两步用的是谁的合约？安全吗？</summary>' +
      '<p class="note">都不是本站的合约，本站也没有为这个功能新做任何合约：</p>' +
      '<p class="note">① 换币用 <b>KyberSwap 聚合器</b>（第三方，自动在 Uniswap 等多家里挑最划算的路线；它临时不通时换 <b>ParaSwap 聚合器</b>）。</p>' +
      '<p class="note">② 跨链用 <b>Anubis 官方跨链桥</b>（app.anubisbridge.com），两个方向都是它，和你自己去官方桥页面操作是同一个合约。</p>' +
      '<p class="note">收费：换币那一笔里，换出来的币有 0.1% 作为本站服务费直接分走，其余全部到你自己钱包；过桥不收费。直接去老池子换，1 万 USDT 要亏 4% 左右。</p>' +
      '<p class="note">③ 授权只给这一笔要用的数量，不给无限额度；每一步发出前本站先替你模拟一遍，会失败的不让钱包弹窗。</p>' +
      '<p class="note">④ 这是试运行功能，第一次请先用小额（比如 20 USDT）走一遍，到账了再放大。</p></details></section></div>';
    var a1 = g("u2d-a1"), a2 = g("u2d-a2"), p = P(), b = B();
    a1.oninput = onAmt; a2.oninput = onAmt2;
    g("u2d-max1").onclick = function () { if (bal) { a1.value = plain(bal[p.sb], p.sd, p.sd === 6 ? 2 : 4); onAmt(); } else say("s", "先连接钱包", true); };
    g("u2d-max2").onclick = function () {
      if (!bal) return say("b", "先连接钱包", true);
      var v = bal[b.fb]; if (dir === "out") v = v > GAS_KEEP ? v - GAS_KEEP : 0n; // 提出去：在 Anubis 上留一点 DAI 当 Gas
      a2.value = plain(v, 18, 4); onAmt2();
    };
    g("u2d-go-s").onclick = swap; g("u2d-go-b").onclick = bridge;
    g("u2d-dir-in").onclick = function () { setDir("in"); }; g("u2d-dir-out").onclick = function () { setDir("out"); };
    paintAll(); track();
  }
  function setDir(d) { if (busy || d === dir) return; dir = d; q = null; qSeq++; clearTimeout(qTimer); render(); }
  A.pages.usdt = function (id) {
    rid = id; q = null;
    if (!hooked) { hooked = true; A.wallets.onAccounts(function (a) { account = a && a[0] ? String(a[0]).toLowerCase() : null; bal = null; if (location.hash.indexOf("#/usdt") === 0 && g("u2d-bal")) { paintBal(); track(); loadBal().then(paintAll, function () { /* 读不到就等客户再点 */ }); } }); }
    render();
    // 钱包以前连过本站：不弹窗直接显示余额
    (account ? Promise.resolve() : A.wallets.silent().then(function (a) { if (a) account = String(a).toLowerCase(); }, function () { /* 没连过就等客户点 */ }))
      .then(function () { paintBal(); track(); return loadBal(); }).then(function () { if (A.isCurrent(id)) paintAll(); }, function () { if (A.isCurrent(id)) paintBal(); });
  };
})();
