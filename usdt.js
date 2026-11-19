// 💵 #/usdt「USDT 换成 Anubis 的 DAI」一键通道（站长 2026-11-19：客户 USDT 提到 Polygon 换 DAI 损耗太高，是刚需；试运行，放 ☰ 更多 → 交易）
// 两步，都由客户自己的钱包签名，本站不经手客户的币、没有新合约。收费（站长 2026-11-19 定）：换币收 0.1% 服务费（聚合器自带的接入方分成，换币那一笔里直接分走；费率在 functions/api/u2d.js 的 FEE_BPS，页面从接口读）；过桥不收费：
//   第 1 步  Polygon 上 USDT → DAI：/api/u2d 向聚合器（KyberSwap，不通就换 ParaSwap）要最划算的路线（USDT 和 DAI 的市价差约 0.11%，池子费用约 0.002%；老池子直接换 1 万要亏 4%）
//   第 2 步  DAI 过 Anubis 官方跨链桥（app.anubisbridge.com，不收手续费：2026-11-19 核对官方桥订单记录，机器人跨过的 4 笔都是发多少到多少；最少 10 DAI），到账地址 = 客户自己这个钱包
// 授权只授权这一笔的数量（用的是第三方合约，不给无限额度）。Gas 用 Polygon 的 POL。
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", PDAI = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063";
  var BRIDGE = "0x8932fe7726c1ee743f662f485c3e5a5d1d595f71"; // Anubis 官方跨链桥（各链同一地址）
  var DAI_ID = "a5e92f3efb6826155f1f728e162af9d7cda33a574a1153b58f03ea01cc37e568"; // 桥里 DAI 的编号
  var ANUBIS_ID = 6714, FEE = 0, BMIN = 10, SLIP = 50; // 官方桥不收费（站长 2026-11-19 指正，订单记录核对过：发多少到多少）；最少 10 DAI；价格保护 0.5%。哪天官方开始收费，改 FEE 这一个数，页面文字会跟着变
  var ROUTERS = ["0x6131b5fae19ea4f9d964eac0408e4408b66337b5", "0x6a000f20005980200259b80c5102003040001068"]; // KyberSwap、ParaSwap（备用）的路由合约
  var SEL = { balanceOf: "0x70a08231", allowance: "0xdd62ed3e", approve: "0x095ea7b3", bridge: "0x8d3ccf9f" /* bridge(bytes32,uint32,bytes32,uint256) */ };
  var account = null, bal = null, q = null, busy = false, rid = 0, qTimer = null, qSeq = 0, watch = null;

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
  function setBal() { [["u2d-b1", bal ? f(n(bal.usdt, 6)) : "—"], ["u2d-b2", bal ? f(n(bal.pdai, 18)) : "—"], ["u2d-b2b", bal ? f(n(bal.pdai, 18)) : "—"], ["u2d-b3", bal ? f(n(bal.adai, 18)) : "—"]].forEach(function (x) { var e = g(x[0]); if (e) e.textContent = x[1]; }); }
  function paintBal() {
    var el = g("u2d-bal"); if (!el) return;
    if (!account || !bal) setBal();
    if (!account) { el.innerHTML = '<button type="button" class="u2d-conn" id="u2d-conn">连接钱包</button><p class="note">连上后，每个框右上角会显示你在那条链上的余额。</p>'; g("u2d-conn").onclick = function () { connect().then(function () { return loadBal(); }).then(paintAll, function (e) { say(1, nice(e), true); }); }; return; }
    if (!bal) { el.innerHTML = '<p class="muted">正在读余额…</p>'; return; }
    setBal();
    el.innerHTML = (bal.pol < 20000000000000000n ? '<p class="u2d-warn">⚠️ 这个钱包在 Polygon 上只有 ' + f(n(bal.pol, 18), 3) + ' 个 POL，付不了 Gas。请先从交易所提 1 个 POL 到这个钱包（选 Polygon 网络），再回来操作。</p>' : '<p class="note">Gas 用 POL 付，你有 ' + f(n(bal.pol, 18), 2) + ' 个，够用（两步合起来不到 0.2 个）。</p>');
  }

  // ---------- 钱包 ----------
  function connect() {
    var eth;
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { account = String(a[0]).toLowerCase(); return W.switchTo(eth, "polygon"); }).then(function () { return account; });
  }
  function ready() { return Promise.resolve().then(function () { return account ? W.switchTo(W.get(), "polygon") : connect(); }); }
  function say(k, t, bad) { var el = g("u2d-say" + k); if (el) { el.textContent = t || ""; el.className = "u2d-say" + (bad ? " bad" : t ? " on" : ""); } }
  function lock(on) { busy = on; ["u2d-go1", "u2d-go2"].forEach(function (i) { var b = g(i); if (b) b.disabled = on; }); }
  function wait(hash, k) {
    var tries = 0;
    return new Promise(function (ok, fail) {
      (function poll() {
        W.rpcOn("polygon", "eth_getTransactionReceipt", [hash]).then(function (r) {
          if (r) return r.status === "0x1" ? ok(r) : fail(new Error("这笔交易被链上拒绝了，币没有动（只花了一点 Gas）"));
          if (++tries > 120) return fail(new Error("等了 4 分钟链上还没确认。别重复点：过一会儿刷新这一页，余额变了就是成功了"));
          setTimeout(poll, 2000);
        }, function () { setTimeout(poll, 3000); });
      })();
    });
  }
  // 先在节点上模拟一次，会失败的直接说原因，不让钱包弹一个确认不了的窗口；Gas 由本站节点估好（多留 30%）
  function send(to, data, k, label) {
    var eth = W.get();
    say(k, "正在检查这一步能不能成功…");
    return Promise.all([
      W.rpcOn("polygon", "eth_call", [{ from: account, to: to, data: data }, "latest"]).catch(function (e) { throw new Error("这一步现在做不成：" + nice(e)); }),
      W.rpcOn("polygon", "eth_estimateGas", [{ from: account, to: to, data: data }]).then(function (x) { return "0x" + (BigInt(x) * 13n / 10n).toString(16); }, function () { return null; })
    ]).then(function (res) {
      var tx = { from: account, to: to, data: data }; if (res[1]) tx.gas = res[1];
      say(k, "请在钱包里确认「" + label + "」");
      return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [tx] });
    }).then(function (hash) { say(k, label + "已提交，等链上确认（一般十几秒）…"); return wait(hash, k); });
  }
  // 第三方合约：只授权这一笔要用的数量，不给无限额度
  function allow(token, spender, amount, k, name) {
    return rd("polygon", token, SEL.allowance + aw(account) + aw(spender)).then(function (a) {
      if (a >= amount) return;
      return send(token, SEL.approve + aw(spender) + u256(amount), k, "授权 " + name + "（只授权这一笔的数量）");
    });
  }

  // ---------- 第 1 步：报价 + 换币 ----------
  function getQuote(amt) { return fetch("/api/u2d?amt=" + amt).then(function (r) { return r.json(); }).then(function (j) { if (!j || j.error || !j.ok) throw new Error((j && j.error) || "现在拿不到报价，稍后再试"); return { amt: amt, out: BigInt(j.out), fee: BigInt(j.fee || 0), feeBps: Number(j.feeBps) || 0, sum: j.sum, via: j.via, at: Date.now() }; }); }
  function paintQuote(err) {
    var el = g("u2d-q"), top = g("u2d-top"), o1 = g("u2d-out1"); if (!el) return;
    if (o1) { o1.textContent = !err && q ? f(n(q.out, 18)) : "0"; o1.className = "u2d-num" + (!err && q ? "" : " zero"); }
    if (err) { el.innerHTML = '<p class="u2d-warn">' + esc(err) + "</p>"; if (top) top.innerHTML = ""; return; }
    if (!q) { el.innerHTML = '<p class="muted">填上要换多少 USDT，上面马上显示能换到多少 DAI。</p>'; if (top) top.innerHTML = ""; return; }
    // out 已经是扣完本站服务费之后的到手数（显示即所得）；gap = 除服务费以外的差额，主要是 USDT 和 DAI 两个币本身的市价差，不是手续费
    var inU = n(q.amt, 6), out = n(q.out, 18), fee = n(q.fee, 18), pct = q.feeBps / 100, gap = (1 - (out + fee) / inU) * 100, min = out * (1 - SLIP / 10000), fin = out - FEE;
    var feeTxt = q.feeBps ? "本站服务费 " + pct + "%（约 " + f(fee) + " DAI）已经扣在这个数里" : "本站不收费";
    el.innerHTML = '<p class="note">' + feeTxt + "。" + (gap > 0.005 ? "另外约 " + f(gap, 2) + "% 是 USDT 和 DAI 这两个币本身的市价差，不是手续费，在哪换都一样。" : "") + "</p>" +
      '<p class="note">最少到手 ' + f(min) + " DAI：成交那一刻价格突然变差超过 0.5%，这笔会自动取消，不会按更差的价成交。</p>" +
      (gap > 1 ? '<p class="u2d-warn">⚠️ 现在这个数量换下来比平时差不少（市价差超过 1%）。可以把数量改小分几次换，或者过一会儿再看。</p>' : "");
    if (top) top.innerHTML = out >= BMIN ? '<div class="u2d-sum"><small>' + f(inU) + " USDT 两步走完，到 Anubis 约</small><b>" + f(fin) + " DAI</b><span>" + (q.feeBps ? "已扣本站服务费 " + pct + "%" : "本站不收费") + "，" + (FEE ? "官方过桥费 " + FEE + " DAI" : "官方跨链桥不收费") + "</span></div>" : '<p class="u2d-warn">换出来不到 ' + BMIN + " DAI，过不了桥（官方桥最少跨 " + BMIN + " DAI）。请把数量加大一点。</p>";
  }
  function onAmt() {
    clearTimeout(qTimer); var seq = ++qSeq, amt = units((g("u2d-a1") || {}).value, 6);
    if (amt < 1000000n) { q = null; paintQuote(amt > 0n ? "最少换 1 USDT" : ""); if (amt === 0n) paintQuote(); return; }
    var el = g("u2d-q"); if (el) el.innerHTML = '<p class="muted">正在全网找最划算的价…</p>';
    qTimer = setTimeout(function () { getQuote(amt.toString()).then(function (x) { if (seq !== qSeq) return; q = x; paintQuote(); }, function (e) { if (seq !== qSeq) return; q = null; paintQuote(String((e && e.message) || e)); }); }, 450);
  }
  function swap() {
    if (busy) return;
    var amt = units((g("u2d-a1") || {}).value, 6);
    if (amt < 1000000n) return say(1, "先填要换多少 USDT（最少 1）", true);
    lock(true); say(1, "正在连接钱包…");
    var before = 0n, got = 0n;
    ready().then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (bal.usdt < amt) throw new Error("Polygon 上的 USDT 不够：你有 " + f(n(bal.usdt, 6)) + "，要换 " + f(n(amt, 6)));
      if (bal.pol < 20000000000000000n) throw new Error("钱包里的 POL 不够付 Gas，请先从交易所提 1 个 POL 到这个钱包（Polygon 网络）");
      before = bal.pdai; say(1, "正在拿最新报价…");
      return getQuote(amt.toString());
    }).then(function (x) {
      q = x; paintQuote();
      return fetch("/api/u2d", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sum: x.sum, via: x.via, sender: account, slip: SLIP }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || j.error || !j.ok) throw new Error((j && j.error) || "拿不到换币数据，稍后再试");
      // 本机再核一遍：只认登记的两个聚合器路由合约（KyberSwap、ParaSwap），交易里必须写着你自己的地址
      if (ROUTERS.indexOf(String(j.to).toLowerCase()) < 0 || String(j.data).toLowerCase().indexOf(account.slice(2)) < 0) throw new Error("换币数据没通过安全检查，已拦下，你的币没有动");
      return allow(USDT, j.to, amt, 1, "USDT").then(function () { return send(j.to, j.data, 1, "USDT 换成 DAI"); });
    }).then(function () { return loadBal(); }).then(function () {
      got = bal && bal.pdai > before ? bal.pdai - before : 0n;
      var a1 = g("u2d-a1"); if (a1) a1.value = ""; q = null;
      paintAll();
      say(1, "✅ 换好了" + (got > 0n ? "，到手 " + f(n(got, 18)) + " DAI" : "") + "。接着做第 2 步，把 DAI 跨到 Anubis。");
      var a2 = g("u2d-a2"); if (a2 && bal) { a2.value = plain(bal.pdai, 18, 4); onAmt2(); a2.scrollIntoView({ behavior: "smooth", block: "center" }); }
    }).catch(function (e) { say(1, "没成功：" + nice(e), true); }).then(function () { lock(false); });
  }

  // ---------- 第 2 步：过桥 ----------
  function onAmt2() {
    var el = g("u2d-b"), o2 = g("u2d-out2"); if (!el) return; var v = units((g("u2d-a2") || {}).value, 18), okv = n(v, 18) >= BMIN;
    if (o2) { o2.textContent = okv ? f(n(v, 18) - FEE) : "0"; o2.className = "u2d-num" + (okv ? "" : " zero"); }
    el.innerHTML = v === 0n ? '<p class="muted">填上要跨多少 DAI。</p>' : !okv ? '<p class="u2d-warn">官方桥最少跨 ' + BMIN + " DAI。</p>" : '<p class="note">' + (FEE ? "官方桥收 " + FEE + " DAI" : "官方跨链桥不收费，跨多少到多少") + "。到账地址就是你现在这个钱包，在 Anubis 链上。</p>";
  }
  function bridge() {
    if (busy) return;
    var amt = units((g("u2d-a2") || {}).value, 18);
    if (n(amt, 18) < BMIN) return say(2, "官方桥最少跨 " + BMIN + " DAI", true);
    lock(true); say(2, "正在连接钱包…");
    var start = 0n;
    ready().then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (bal.pdai < amt) throw new Error("Polygon 上的 DAI 不够：你有 " + f(n(bal.pdai, 18)) + "，要跨 " + f(n(amt, 18)));
      if (bal.pol < 10000000000000000n) throw new Error("钱包里的 POL 不够付 Gas，请先从交易所提 1 个 POL 到这个钱包（Polygon 网络）");
      start = bal.adai;
      return allow(PDAI, BRIDGE, amt, 2, "DAI 给官方跨链桥");
    }).then(function () {
      return send(BRIDGE, SEL.bridge + DAI_ID + u256(ANUBIS_ID) + aw(account) + u256(amt), 2, "DAI 跨到 Anubis");
    }).then(function () { return loadBal(); }).then(function () {
      var a2 = g("u2d-a2"); if (a2) a2.value = ""; paintAll();
      say(2, "✅ 已交给官方跨链桥，正在跨。到账后 Anubis 链上的 DAI 会多 " + f(n(amt, 18) - FEE) + "，这一页会自动提示；也可以到官方桥 app.anubisbridge.com 的 History 里查。");
      arrive(start);
    }).catch(function (e) { say(2, "没成功：" + nice(e), true); }).then(function () { lock(false); });
  }
  // 过桥后每 15 秒看一眼 Anubis 余额，最多看 15 分钟；到了就报喜
  function arrive(start) {
    clearInterval(watch); var a = account, left = 60;
    watch = setInterval(function () {
      if (--left < 0 || a !== account || !g("u2d-say2")) return clearInterval(watch);
      W.rpcOn("anubis", "eth_getBalance", [a, "latest"]).then(function (h) {
        var now = BigInt(h); if (now <= start) return;
        clearInterval(watch); if (bal) bal.adai = now; paintBal();
        say(2, "🎉 到账了：Anubis 链上多了 " + f(n(now - start, 18)) + " DAI。现在可以去买 AiLGNS 或注册域名了。");
      }, function () { /* 这一轮没查到，等下一轮 */ });
    }, 15000);
  }

  // ---------- 页面 ----------
  var hooked = false;
  function paintAll() { paintBal(); paintQuote(); onAmt2(); }
  A.pages.usdt = function (id) {
    rid = id; q = null;
    if (!hooked) { hooked = true; A.wallets.onAccounts(function (a) { account = a && a[0] ? String(a[0]).toLowerCase() : null; bal = null; if (location.hash.indexOf("#/usdt") === 0 && g("u2d-bal")) { paintBal(); loadBal().then(paintAll, function () { /* 读不到就等客户再点 */ }); } }); }
    // 版式参照 Uniswap 的兑换卡：窄卡居中、上下两个大框（付出 / 到手）、中间一个箭头、右边写清是哪条链的哪个币（站长 2026-11-19）
    A.app.innerHTML =
      '<div class="u2d">' +
      '<header class="u2d-hd"><h2>USDT 跨链桥<span class="lp-tag">试运行</span></h2>' +
      '<div class="u2d-route"><span class="u2d-chip"><i class="u2d-dot pg"></i>Polygon 链 · USDT</span><b>→</b><span class="u2d-chip"><i class="u2d-dot an"></i>Anubis 链 · DAI</span></div>' +
      '<p class="u2d-lead">把 <b>Polygon 链上的 USDT</b>，变成 <b>Anubis 链上的 DAI</b>。两步，都在你自己钱包里签名，本站不经手你的币。换币时本站收 0.1% 服务费，过桥不收费。</p></header>' +
      '<div id="u2d-top"></div><div id="u2d-bal"></div>' +
      '<section class="u2d-card"><div class="u2d-step"><i>1</i><b>换币</b><span>在 Polygon 链上，USDT 换成 DAI</span></div>' +
      '<div class="u2d-box"><div class="u2d-bh"><span>你付出</span><span>余额 <b id="u2d-b1">—</b><button type="button" class="u2d-max" id="u2d-max1">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="u2d-a1" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + '<div class="u2d-tok"><i class="u2d-coin usdt">₮</i><span><b>USDT</b><small>Polygon 链</small></span></div>' + '</div></div>' +
      '<div class="u2d-mid"><i>↓</i></div>' +
      '<div class="u2d-box"><div class="u2d-bh"><span>你换到（已扣服务费）</span><span>余额 <b id="u2d-b2">—</b></span></div>' +
      '<div class="u2d-bm"><output id="u2d-out1" class="u2d-num zero">0</output>' + '<div class="u2d-tok"><i class="u2d-coin dai">◈</i><span><b>DAI</b><small>Polygon 链</small></span></div>' + '</div></div>' +
      '<div id="u2d-q" class="u2d-info"></div><button type="button" class="u2d-go" id="u2d-go1">换成 DAI</button><p class="u2d-say" id="u2d-say1"></p></section>' +
      '<section class="u2d-card"><div class="u2d-step"><i>2</i><b>过桥</b><span>DAI 从 Polygon 链跨到 Anubis 链</span></div>' +
      '<div class="u2d-box"><div class="u2d-bh"><span>你跨出</span><span>余额 <b id="u2d-b2b">—</b><button type="button" class="u2d-max" id="u2d-max2">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="u2d-a2" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + '<div class="u2d-tok"><i class="u2d-coin dai">◈</i><span><b>DAI</b><small>Polygon 链</small></span></div>' + '</div></div>' +
      '<div class="u2d-mid"><i>↓</i></div>' +
      '<div class="u2d-box an"><div class="u2d-bh"><span>你到账</span><span>余额 <b id="u2d-b3">—</b></span></div>' +
      '<div class="u2d-bm"><output id="u2d-out2" class="u2d-num zero">0</output>' + '<div class="u2d-tok"><i class="u2d-coin dai an">◈</i><span><b>DAI</b><small>Anubis 链</small></span></div>' + '</div></div>' +
      '<div id="u2d-b" class="u2d-info"></div><button type="button" class="u2d-go" id="u2d-go2">跨到 Anubis</button><p class="u2d-say" id="u2d-say2"></p>' +
      '<p class="note">已经有 Polygon 链的 DAI？跳过第 1 步，直接做这一步。官方桥最少跨 ' + BMIN + ' DAI。</p></section>' +
      '<section class="u2d-card u2d-faq"><details><summary>这两步用的是谁的合约？安全吗？</summary>' +
      '<p class="note">都不是本站的合约，本站也没有为这个功能新做任何合约：</p>' +
      '<p class="note">① 换币用 <b>KyberSwap 聚合器</b>（第三方，自动在 Uniswap 等多家里挑最划算的路线；它临时不通时换 <b>ParaSwap 聚合器</b>）。</p>' +
      '<p class="note">② 跨链用 <b>Anubis 官方跨链桥</b>（app.anubisbridge.com），和你自己去官方桥页面操作是同一个合约。</p>' +
      '<p class="note">收费：换币那一笔里，换出来的 DAI 有 0.1% 作为本站服务费直接分走，其余全部到你自己钱包；过桥不收费。直接去老池子换，1 万 USDT 要亏 4% 左右。</p>' +
      '<p class="note">③ 授权只给这一笔要用的数量，不给无限额度；每一步发出前本站先替你模拟一遍，会失败的不让钱包弹窗。</p>' +
      '<p class="note">④ 这是试运行功能，第一次请先用小额（比如 20 USDT）走一遍，到账了再放大。</p></details></section></div>';
    var a1 = g("u2d-a1"), a2 = g("u2d-a2");
    a1.oninput = onAmt; a2.oninput = onAmt2;
    g("u2d-max1").onclick = function () { if (bal) { a1.value = plain(bal.usdt, 6, 2); onAmt(); } else say(1, "先连接钱包", true); };
    g("u2d-max2").onclick = function () { if (bal) { a2.value = plain(bal.pdai, 18, 4); onAmt2(); } else say(2, "先连接钱包", true); };
    g("u2d-go1").onclick = swap; g("u2d-go2").onclick = bridge;
    paintAll();
    // 钱包以前连过本站：不弹窗直接显示余额
    (account ? Promise.resolve() : A.wallets.silent().then(function (a) { if (a) account = String(a).toLowerCase(); }, function () { /* 没连过就等客户点 */ }))
      .then(function () { paintBal(); return loadBal(); }).then(function () { if (A.isCurrent(id)) paintAll(); }, function () { if (A.isCurrent(id)) paintBal(); });
  };
})();
