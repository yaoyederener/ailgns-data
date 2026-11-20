// 💵 #/usdt「USDT 跨链桥」一键通道（站长 2026-11-19：客户 USDT 提到 Polygon 换 DAI 损耗太高，是刚需；试运行，放 ☰ 更多 → 交易）
// 双向（站长同日要求）：
//   充进来 dir=in ：① Polygon 上 USDT 换成 DAI  → ② DAI 过桥到 Anubis
//   提出去 dir=out：① Anubis 的 DAI 过桥到 Polygon → ② Polygon 上 DAI 换成 USDT
// 每一步都由客户自己的钱包签名，本站不经手客户的币、没有新合约。
// 换币：/api/u2d 向聚合器（KyberSwap，不通就换 ParaSwap）要最划算的路线。服务费现在不收（functions/api/u2d.js 的 FEE_BPS = 0，2026-11-19 站长定：钱包自带兑换同价不收费，我们收了反而贵）；报价区的文字跟着接口返回的费率变，页头和说明里的「不收服务费」是写死的，改回收费时要一起改。
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
  var CHAIN_ID = { anubis: 6714, polygon: 137, bsc: 56 }, FEE = 0, BMIN = 10, SLIP = 50; // 官方桥不收费；最少 10 DAI；价格保护 0.5%。哪天官方开始收费，改 FEE 这一个数，页面文字会跟着变
  var GAS_KEEP = 50000000000000000n; // 提出去时在 Anubis 上留 0.05 DAI 当 Gas，「全部」不会把它也跨走
  var POL_MIN = 20000000000000000n; // Polygon 上少于 0.02 POL 就付不了 Gas
  // 🆕 2026-11-20 加 BSC（站长：把常用链加上）。net = 客户的币现在在哪条链；每条链各自的 USDT / DAI 地址、小数位、付 Gas 的币、官方桥大概多久到。
  // BSC 只能充进来：官方桥没有「DAI 从 Anubis 回 BSC」这条路（canOut: false）。BSC 上 DAI 的池子浅，一次最多换 2 万（服务器也拦），大额让客户走 Polygon
  var NETS = {
    polygon: { key: "polygon", name: "Polygon", usdt: USDT, dai: PDAI, ud: 6, gas: "POL", gasMin: POL_MIN, eta: 2 * 60, canOut: true },
    bsc: { key: "bsc", name: "BSC", usdt: "0x55d398326f99059ff775485246999027b3197955", dai: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", ud: 18, gas: "BNB", gasMin: 500000000000000n, eta: 4 * 60, canOut: false, cap: 20000 }
  };
  var net = "polygon";
  function N() { return NETS[net]; }
  var ROUTERS = ["0x6131b5fae19ea4f9d964eac0408e4408b66337b5", "0x6a000f20005980200259b80c5102003040001068"]; // KyberSwap、ParaSwap（备用）的路由合约
  var SEL = { balanceOf: "0x70a08231", allowance: "0xdd62ed3e", approve: "0x095ea7b3", bridge: "0x8d3ccf9f" /* bridge(bytes32,uint32,bytes32,uint256) */ };
  var account = null, bal = null, q = null, busy = false, rid = 0, qTimer = null, qSeq = 0, watch = null, dir = "in", sdir = "in"; // dir = 整趟的方向（充进来 / 提出去）；sdir = 换币那一步的方向，默认跟着 dir，点换币卡片中间的 ⇅ 可以单独反过来（站长 2026-11-19：USDT 换 DAI 和 DAI 换 USDT 应该是相互的）
  // 换币这一步两个方向各自的：付出币、换出币、小数位
  function P() { var c = N(); return sdir === "in" ? { src: c.usdt, sd: c.ud, sn: "USDT", dd: 18, dn: "DAI", sb: "usdt", db: "pdai" } : { src: c.dai, sd: 18, sn: "DAI", dd: c.ud, dn: "USDT", sb: "pdai", db: "usdt" }; }
  // 过桥这一步两个方向各自的：从哪条链到哪条链、余额记在哪
  function B() { var c = N(); return dir === "in" ? { from: c.key, to: "anubis", fn: c.name, tn: "Anubis", fb: "pdai", tb: "adai" } : { from: "anubis", to: c.key, fn: "Anubis", tn: c.name, fb: "adai", tb: "pdai" }; }
  function decOf(k) { return k === "usdt" ? N().ud : 18; } // 余额里的 usdt / pdai / pol 都是「当前选的那条链」上的（名字沿用 Polygon 时代的）
  // 官方桥过一次要多久（秒）。2026-11-19 从官方桥订单记录量的：Polygon → Anubis 29 笔全是约 2 分钟；Anubis → Polygon 72 笔全是约 130 分钟
  // （官方桥设定：Anubis 发出的要等 7200 个区块确认，约 2 小时；别的链只等 64 个区块）。这是官方桥的规则，本站改不了也加急不了
  var EXPECT = { in: 2 * 60, out: 130 * 60 };
  function expOf(d, nk) { return d === "in" ? (NETS[nk] || NETS.polygon).eta : EXPECT.out; } // BSC → Anubis 官方桥同样等 64 个区块，按 4 分钟估（还没有真实记录量过）
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
  function balOf(k) { return bal ? f(n(bal[k], decOf(k))) : "—"; }

  // ---------- 余额 ----------
  function loadBal() {
    if (!account) { bal = null; return Promise.resolve(); }
    var a = account, c = N(), nk = net;
    return Promise.all([
      rd(c.key, c.usdt, SEL.balanceOf + aw(a)), rd(c.key, c.dai, SEL.balanceOf + aw(a)),
      W.rpcOn(c.key, "eth_getBalance", [a, "latest"]).then(BigInt), W.rpcOn("anubis", "eth_getBalance", [a, "latest"]).then(BigInt)
    ]).then(function (r) { if (a === account && nk === net) bal = { usdt: r[0], pdai: r[1], pol: r[2], adai: r[3] }; });
  }
  // 余额写进每个兑换框右上角（Uniswap 式：钱在哪条链、有多少，就写在那个框里）
  function setBal() { var p = P(), b = B(); [["u2d-b1", balOf(p.sb)], ["u2d-b2", balOf(p.db)], ["u2d-b2b", balOf(b.fb)], ["u2d-b3", balOf(b.tb)]].forEach(function (x) { var e = g(x[0]); if (e) e.textContent = x[1]; }); }
  function paintBal() {
    var el = g("u2d-bal"); if (!el) return;
    setBal();
    if (!account) { el.innerHTML = '<button type="button" class="u2d-conn" id="u2d-conn">连接钱包</button><p class="note">连上后，每个框右上角会显示你在那条链上的余额。</p>'; g("u2d-conn").onclick = function () { connect(N().key).then(function () { track(); return loadBal(); }).then(paintAll, function (e) { say("s", nice(e), true); }); }; return; }
    if (!bal) { el.innerHTML = '<p class="muted">正在读余额…</p>'; return; }
    var c = N(), low = bal.pol < c.gasMin, pol = f(n(bal.pol, 18), low ? 4 : 2), tip = gasTip();
    el.innerHTML = !low ? "" : dir === "in"
      ? '<p class="u2d-warn">⚠️ 这个钱包在 ' + c.name + " 上只有 " + pol + " 个 " + c.gas + "，付不了 Gas。" + tip + "，再回来操作。</p>"
      : '<p class="u2d-warn">⚠️ 先别急着跨：这个钱包在 ' + c.name + " 上只有 " + pol + " 个 " + c.gas + "。DAI 跨到 " + c.name + " 以后，换成 USDT 那一步要用 " + c.gas + " 付 Gas。" + tip + "。</p>";
  }

  function gasTip() { var c = N(); return "请先从交易所提一点 " + c.gas + "（" + (c.key === "bsc" ? "0.005 个就够" : "1 个就够") + "）到这个钱包（选 " + c.name + " 网络）"; }
  // ---------- 钱包 ----------
  function connect(chain) {
    var eth;
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { account = String(a[0]).toLowerCase(); return W.switchTo(eth, chain); }).then(function () { return account; });
  }
  function ready(chain) { return Promise.resolve().then(function () { return account ? W.switchTo(W.get(), chain) : connect(chain); }); }
  function say(k, t, bad) { var el = g("u2d-say-" + k); if (el) { el.textContent = t || ""; el.className = "u2d-say" + (bad ? " bad" : t ? " on" : ""); } }
  function lock(on) { busy = on; ["u2d-go-s", "u2d-go-b", "u2d-flip2", "u2d-flip"].forEach(function (i) { var b = g(i); if (b) b.disabled = on; }); [].forEach.call(document.querySelectorAll("#u2d-net button"), function (b) { b.disabled = on; }); }
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
    var ck = N().key;
    return rd(ck, token, SEL.allowance + aw(account) + aw(spender)).then(function (a) {
      if (a >= amount) return;
      return send(ck, token, SEL.approve + aw(spender) + u256(amount), k, "授权 " + name + "（只授权这一笔的数量）");
    });
  }

  // ---------- 换币：报价 + 发交易（在 Polygon 上） ----------
  function getQuote(amt) { var d = sdir, nk = net; return fetch("/api/u2d?amt=" + amt + "&dir=" + d + (nk === "polygon" ? "" : "&chain=" + nk)).then(function (r) { return r.json(); }).then(function (j) { if (!j || j.error || !j.ok) throw new Error((j && j.error) || "现在拿不到报价，稍后再试"); if ((j.dir || "in") !== d || (j.chain || "polygon") !== nk) throw new Error("报价方向不对，请重新填一次数量"); return { dir: d, net: nk, amt: amt, out: BigInt(j.out), fee: BigInt(j.fee || 0), feeBps: Number(j.feeBps) || 0, sum: j.sum, via: j.via, at: Date.now() }; }); }
  function paintQuote(err) {
    var el = g("u2d-q"), top = g("u2d-top"), o1 = g("u2d-out1"), p = P(); if (!el) return;
    var okq = !err && q && q.dir === sdir && q.net === net;
    if (o1) { o1.textContent = okq ? f(n(q.out, p.dd)) : "0"; o1.className = "u2d-num" + (okq ? "" : " zero"); }
    if (err) { el.innerHTML = '<p class="u2d-warn">' + esc(err) + "</p>"; if (top) top.innerHTML = ""; return; }
    if (!okq) { el.innerHTML = '<p class="muted">填上要换多少 ' + p.sn + "，上面马上显示能换到多少 " + p.dn + "。想反过来，把 " + p.dn + " 换成 " + p.sn + "？点两个框中间的 ⇅。</p>"; if (top) top.innerHTML = ""; return; }
    // out 已经是扣完本站服务费之后的到手数（显示即所得）；gap = 除服务费以外的差额，主要是 USDT 和 DAI 两个币本身的市价差，不是手续费
    var inU = n(q.amt, p.sd), out = n(q.out, p.dd), fee = n(q.fee, p.dd), pct = q.feeBps / 100, gap = (1 - (out + fee) / inU) * 100, min = out * (1 - SLIP / 10000);
    var feeTxt = q.feeBps ? "本站服务费 " + pct + "%（约 " + f(fee) + " " + p.dn + "）已经扣在这个数里" : "本站不收服务费，这是全网比价后的到手数";
    el.innerHTML = '<p class="note">' + feeTxt + "。" + (gap > 0.005 ? (q.feeBps ? "另外约 " : "和 1:1 差的约 ") + f(gap, 2) + "% 是 USDT 和 DAI 这两个币本身的市价差，不是手续费，在哪换都一样。" : gap < -0.005 ? "这一刻 " + p.sn + " 比 " + p.dn + " 略贵，市价差对你有利。" : "") + "</p>" +
      '<p class="note">最少到手 ' + f(min) + " " + p.dn + "：成交那一刻价格突然变差超过 0.5%，这笔会自动取消，不会按更差的价成交。</p>" +
      (gap > 1 ? '<p class="u2d-warn">⚠️ 现在这个数量换下来比平时差不少（市价差超过 1%）。可以把数量改小分几次换，或者过一会儿再看。</p>' : "");
    if (!top) return;
    var paid = q.feeBps ? "已扣本站服务费 " + pct + "%" : "本站不收服务费", free = FEE ? "官方过桥费 " + FEE + " DAI" : "官方跨链桥不收费";
    if (sdir !== dir) top.innerHTML = '<div class="u2d-sum"><small>' + f(inU) + " " + p.sn + " 在 " + N().name + " 链上换成约</small><b>" + f(out) + " " + p.dn + "</b><span>" + paid + "。只换币，不过桥</span></div>";
    else if (dir === "in") top.innerHTML = out >= BMIN ? '<div class="u2d-sum"><small>' + f(inU) + " USDT 两步走完，到 Anubis 约</small><b>" + f(out - FEE) + " DAI</b><span>" + paid + "，" + free + "</span></div>" : '<p class="u2d-warn">换出来不到 ' + BMIN + " DAI，过不了桥（官方桥最少跨 " + BMIN + " DAI）。请把数量加大一点。</p>";
    else top.innerHTML = '<div class="u2d-sum"><small>' + f(inU) + " DAI 两步走完，到 " + N().name + " 约</small><b>" + f(out) + " USDT</b><span>" + paid + "，" + free + "</span></div>";
  }
  function onAmt() {
    clearTimeout(qTimer); var seq = ++qSeq, p = P(), amt = units((g("u2d-a1") || {}).value, p.sd), one = 10n ** BigInt(p.sd);
    if (amt < one) { q = null; if (amt > 0n) paintQuote("最少换 1 " + p.sn); else paintQuote(); return; }
    var el = g("u2d-q"); if (el) el.innerHTML = '<p class="muted">正在全网找最划算的价…</p>';
    qTimer = setTimeout(function () { getQuote(amt.toString()).then(function (x) { if (seq !== qSeq) return; q = x; paintQuote(); }, function (e) { if (seq !== qSeq) return; q = null; paintQuote(String((e && e.message) || e)); }); }, 450);
  }
  function swap() {
    if (busy) return;
    var d0 = sdir, f0 = dir, p = P(), amt = units((g("u2d-a1") || {}).value, p.sd);
    if (amt < 10n ** BigInt(p.sd)) return say("s", "先填要换多少 " + p.sn + "（最少 1）", true);
    lock(true); say("s", "正在连接钱包…");
    var before = 0n, got = 0n;
    var c = N(), nk0 = net;
    if (c.cap && n(amt, p.sd) > c.cap) return say("s", c.name + " 上一次最多换 " + c.cap / 10000 + " 万（池子浅，再多会亏很多）。大额请在上面选 Polygon", true);
    ready(c.key).then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (bal[p.sb] < amt) throw new Error(c.name + " 上的 " + p.sn + " 不够：你有 " + balOf(p.sb) + "，要换 " + f(n(amt, p.sd)));
      if (bal.pol < c.gasMin) throw new Error("钱包里的 " + c.gas + " 不够付 Gas，" + gasTip());
      before = bal[p.db]; say("s", "正在拿最新报价…");
      return getQuote(amt.toString());
    }).then(function (x) {
      if (sdir !== d0 || net !== nk0) throw new Error("方向或者链已经换了，请重新点一次");
      q = x; paintQuote();
      return fetch("/api/u2d", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sum: x.sum, via: x.via, dir: d0, chain: nk0, sender: account, slip: SLIP }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || j.error || !j.ok) throw new Error((j && j.error) || "拿不到换币数据，稍后再试");
      // 本机再核一遍：只认登记的两个聚合器路由合约（KyberSwap、ParaSwap），方向要对，交易里必须写着你自己的地址
      if (ROUTERS.indexOf(String(j.to).toLowerCase()) < 0 || (j.dir || "in") !== d0 || (j.chain || "polygon") !== nk0 || net !== nk0 || String(j.data).toLowerCase().indexOf(account.slice(2)) < 0) throw new Error("换币数据没通过安全检查，已拦下，你的币没有动");
      return allow(p.src, j.to, amt, "s", p.sn).then(function () { return send(c.key, j.to, j.data, "s", p.sn + " 换成 " + p.dn); });
    }).then(function () { return loadBal(); }).then(function () {
      got = bal && bal[p.db] > before ? bal[p.db] - before : 0n;
      var a1 = g("u2d-a1"); if (a1) a1.value = ""; q = null;
      paintAll();
      var gotTxt = got > 0n ? "，到手 " + f(n(got, p.dd)) + " " + p.dn : "";
      if (d0 === "in" && f0 === "in" && dir === "in") {
        say("s", "✅ 换好了" + gotTxt + "。接着到下面「过桥」，把 DAI 跨到 Anubis。");
        var a2 = g("u2d-a2"); if (a2 && bal) { a2.value = plain(bal.pdai, 18, 4); onAmt2(); a2.scrollIntoView({ behavior: "smooth", block: "center" }); }
      } else if (d0 === "out" && f0 === "out") say("s", "🎉 换好了" + gotTxt + "，就在你这个钱包里（" + c.name + " 链）。两步都走完了。");
      else say("s", "✅ 换好了" + gotTxt + "，就在你这个钱包里（" + c.name + " 链）。");
    }).catch(function (e) { say("s", "没成功：" + nice(e), true); }).then(function () { lock(false); });
  }

  // ---------- 过桥（充进来在 Polygon 上发，提出去在 Anubis 上发） ----------
  function onAmt2() {
    var el = g("u2d-b"), o2 = g("u2d-out2"), b = B(); if (!el) return; var v = units((g("u2d-a2") || {}).value, 18), okv = n(v, 18) >= BMIN;
    if (o2) { o2.textContent = okv ? f(n(v, 18) - FEE) : "0"; o2.className = "u2d-num" + (okv ? "" : " zero"); }
    el.innerHTML = v === 0n ? '<p class="muted">填上要跨多少 DAI。' + (N().canOut ? "想反过来跨？点两个框中间的 ⇅。" : "") + "</p>" : !okv ? '<p class="u2d-warn">官方桥最少跨 ' + BMIN + " DAI。</p>" : '<p class="note">' + (FEE ? "官方桥收 " + FEE + " DAI" : "官方跨链桥不收费，跨多少到多少") + "。到账地址就是你现在这个钱包，在 " + b.tn + " 链上。</p>";
  }
  function bridge() {
    if (busy) return;
    var d0 = dir, b = B(), c = N(), nk0 = net, amt = units((g("u2d-a2") || {}).value, 18);
    if (n(amt, 18) < BMIN) return say("b", "官方桥最少跨 " + BMIN + " DAI", true);
    if (d0 === "out" && !c.canOut) return say("b", "官方桥不支持把 DAI 跨回 " + c.name + "，往外提请在上面选 Polygon", true);
    lock(true); say("b", "正在连接钱包…");
    var start = 0n, txHash = "";
    ready(b.from).then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (d0 === "in") {
        if (bal.pdai < amt) throw new Error(c.name + " 上的 DAI 不够：你有 " + balOf("pdai") + "，要跨 " + f(n(amt, 18)));
        if (bal.pol < c.gasMin / 2n) throw new Error("钱包里的 " + c.gas + " 不够付 Gas，" + gasTip());
      } else if (bal.adai < amt + GAS_KEEP / 5n) throw new Error("Anubis 上的 DAI 不够：你有 " + balOf("adai") + "，要跨 " + f(n(amt, 18)) + "，还要留一点点当 Gas。点「全部」会自动留好");
      start = bal[b.tb];
      // Polygon 的 DAI 是普通代币，要先授权给桥；Anubis 的 DAI 是原生币，实测不用授权
      return d0 === "in" ? allow(c.dai, BRIDGE, amt, "b", "DAI 给官方跨链桥") : null;
    }).then(function () {
      if (dir !== d0 || net !== nk0) throw new Error("方向或者链已经换了，请重新点一次");
      return send(b.from, BRIDGE, SEL.bridge + DAI_ID + u256(CHAIN_ID[b.to]) + aw(account) + u256(amt), "b", "DAI 跨到 " + b.tn);
    }).then(function (rc) { txHash = rc && rc.transactionHash; return loadBal(); }).then(function () {
      var a2 = g("u2d-a2"); if (a2) a2.value = ""; paintAll();
      say("b", "✅ 已交给官方跨链桥，正在跨（官方桥到账" + dur(expOf(d0, nk0)) + "）。进度看页面上方的进度条，可以关掉这一页，回来还在。");
      track({ a: account, dir: d0, net: nk0, amt: amt.toString(), start: start.toString(), t0: Date.now(), tx: txHash || "" });
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
    var isIn = p.dir === "in", pn = NETS[p.net] || NETS.polygon, to = isIn ? "Anubis" : pn.name, exp = expOf(p.dir, p.net), el2 = (Date.now() - p.t0) / 1000, amt = f(n(BigInt(p.amt), 18) - FEE);
    var done = !!p.done, late = !done && el2 > exp * 1.3 + 300, pct = done ? 100 : Math.max(4, Math.min(96, el2 / exp * 100));
    var head = done ? "🎉 到账了：" + amt + " DAI 已经在 " + to + " 链上" : "正在跨链：" + amt + " DAI → " + to + " 链";
    var sub2 = done ? "这一趟用了" + dur((p.done - p.t0) / 1000) + "。" + (isIn ? "现在可以去买 AiLGNS 或注册域名了。" : "接着到上面「换币」，把 DAI 换成 USDT。")
      : late ? "已经过了" + dur(el2) + "，比平时（" + dur(exp) + "）慢。币不会丢，官方桥还在处理。"
      : "已经过了" + dur(el2) + " · 预计还要" + dur(exp - el2);
    el.innerHTML = '<div class="u2d-prog' + (done ? " done" : late ? " late" : "") + '"><div class="u2d-pt"><b>' + head + "</b><span>" + sub2 + '</span></div>' +
      '<div class="u2d-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<ol class="u2d-stg"><li class="ok">交易已上链</li><li class="' + (done ? "ok" : "now") + '">官方桥确认中</li><li class="' + (done ? "ok" : "") + '">到账</li></ol>' +
      (done ? "" : '<p class="note">' + (isIn ? "这个方向官方桥一般" + dur(exp) + "到账。" : "这个方向官方桥要等 2 小时 10 分钟左右，是它的安全规则（下面有详细说明），不是卡住了。") + "可以关掉这一页去做别的，回来还能看到进度。" + (late ? "一直不到，就到官方桥 app.anubisbridge.com 的 History 里看这一笔，或者提工单把钱包地址和交易哈希发给我们。" : "") + "</p>") +
      '<button type="button" class="u2d-px" id="u2d-px">' + (done ? "知道了" : "不看这条进度了") + "</button></div>";
    var x = g("u2d-px"); if (x) x.onclick = pendClear;
  }
  function arrived(p, nowBal) {
    if (p.done) return; p.done = Date.now(); pendSave(p); clearInterval(watch); paintProg(p);
    loadBal().then(function () { paintBal(); if (p.dir === "out" && dir === "out" && sdir === "out" && bal) { var a1 = g("u2d-a1"); if (a1 && !a1.value) { a1.value = plain(bal.pdai, 18, 4); onAmt(); } } }, function () { /* 余额下次再读 */ });
  }
  function checkProg() {
    var p = pend(); if (!p || p.done) return clearInterval(watch);
    paintProg(p);
    var a = p.a, st = BigInt(p.start || 0);
    (p.tx ? fetch("/api/u2d?order=" + p.tx + "&a=" + a).then(function (r) { return r.json(); }).catch(function () { return null; }) : Promise.resolve(null)).then(function (j) {
      if (a !== account) return;
      if (j && j.ok && j.found && (j.status === "completed" || j.receivedTs)) return arrived(p);
      return (p.dir === "in" ? W.rpcOn("anubis", "eth_getBalance", [a, "latest"]).then(BigInt) : rd((NETS[p.net] || NETS.polygon).key, (NETS[p.net] || NETS.polygon).dai, SEL.balanceOf + aw(a))).then(function (now) { if (a === account && now > st) arrived(p); });
    }).catch(function () { /* 这一轮没查到，等下一轮 */ });
  }
  function track(p) { if (p) pendSave(p); clearInterval(watch); var cur = pend(); paintProg(cur); if (cur && !cur.done) { watch = setInterval(function () { if (!g("u2d-prog")) return clearInterval(watch); checkProg(); }, 20000); checkProg(); } }

  // ---------- 页面 ----------
  var hooked = false;
  function paintAll() { paintBal(); paintQuote(); onAmt2(); }
  // 币的图标用官方标志（站长 2026-11-19：换成官方的）：icons/tokens/usdt.png、dai.png。图片万一没加载出来，后面还垫着原来的色块和符号
  // Anubis 链上的 DAI：币的右下角压一个 Anubis 链的小标志（站长 2026-11-20；标志取自官方区块浏览器 browser.anubispace.org 的站标），和钱包里显示「哪条链上的币」一个画法
  function tok(cls, ch, sym, chain) { return '<div class="u2d-tok"><span class="u2d-cw"><i class="u2d-coin ' + cls + '"><img src="/icons/tokens/' + (sym === "USDT" ? "usdt" : "dai") + '.png?v=1" alt="" width="30" height="30">' + ch + "</i>" + (/\ban\b/.test(cls) ? '<em class="u2d-ch" title="Anubis 链"></em>' : "") + "</span><span><b>" + sym + "</b><small>" + chain + " 链</small></span></div>"; }
  function chip(c, t) { return '<span class="u2d-chip"><i class="u2d-dot ' + c + '"></i>' + t + "</span>"; }
  // 换币那张卡（两个方向都在 Polygon 上）
  function swapCard(no) {
    var p = P(), isIn = sdir === "in", last = dir === "out" && !isIn; // last：这一格就是整趟的终点（提出去 + DAI 换成 USDT）
    return '<section class="u2d-card"><div class="u2d-step">' + (no ? '<i class="st">第 ' + no + " 步</i>" : "") + "<b>换币</b><span>在 " + N().name + " 链上，" + p.sn + " 换成 " + p.dn + "</span></div>" +
      '<div class="u2d-box"><div class="u2d-bh"><span>你付出</span><span>余额 <b id="u2d-b1">—</b><button type="button" class="u2d-max" id="u2d-max1">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="u2d-a1" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + (isIn ? tok("usdt", "₮", "USDT", N().name) : tok("dai", "◈", "DAI", N().name)) + "</div></div>" +
      '<div class="u2d-mid"><button type="button" class="u2d-flip" id="u2d-flip" aria-label="反过来换" title="点一下，反过来换">⇅</button></div>' +
      '<div class="u2d-box' + (last ? " end" : "") + '"><div class="u2d-bh"><span>你换到</span><span>余额 <b id="u2d-b2">—</b></span></div>' +
      '<div class="u2d-bm"><output id="u2d-out1" class="u2d-num zero">0</output>' + (isIn ? tok("dai", "◈", "DAI", N().name) : tok("usdt", "₮", "USDT", N().name)) + "</div></div>" +
      '<div id="u2d-q" class="u2d-info"></div><button type="button" class="u2d-go" id="u2d-go-s">换成 ' + p.dn + '</button><p class="u2d-say" id="u2d-say-s"></p>' +
      (N().cap ? '<p class="note">' + N().name + " 上 DAI 的池子比较浅：一次最多换 " + N().cap / 10000 + " 万，超过 1 万价格会明显变差。大额请在上面选 Polygon。</p>" : "") +
      (!isIn && N().canOut ? '<p class="note">' + N().name + ' 链上已经有 DAI？不用等过桥，直接在这里换。</p>' : "") + "</section>";
  }
  // 过桥那张卡
  function bridgeCard(no) {
    var b = B(), isIn = dir === "in";
    return '<section class="u2d-card"><div class="u2d-step">' + (no ? '<i class="st">第 ' + no + " 步</i>" : "") + "<b>过桥</b><span>DAI 从 " + b.fn + " 链跨到 " + b.tn + " 链</span></div>" +
      '<div class="u2d-box"><div class="u2d-bh"><span>你跨出</span><span>余额 <b id="u2d-b2b">—</b><button type="button" class="u2d-max" id="u2d-max2">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="u2d-a2" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + tok(isIn ? "dai" : "dai an", "◈", "DAI", b.fn) + "</div></div>" +
      (N().canOut ? '<div class="u2d-mid"><button type="button" class="u2d-flip" id="u2d-flip2" aria-label="反过来跨" title="点一下，反过来跨">⇅</button></div>' : '<div class="u2d-mid"><i>↓</i><span class="u2d-one">往外提请选 Polygon</span></div>') +
      '<div class="u2d-box' + (isIn ? " end" : "") + '"><div class="u2d-bh"><span>你到账</span><span>余额 <b id="u2d-b3">—</b></span></div>' +
      '<div class="u2d-bm"><output id="u2d-out2" class="u2d-num zero">0</output>' + tok(isIn ? "dai an" : "dai", "◈", "DAI", b.tn) + "</div></div>" +
      '<div id="u2d-b" class="u2d-info"></div>' +
      (isIn ? '<p class="u2d-eta">⏱ 这一步到账：<b>' + (N().key === "bsc" ? "几分钟" : "2 分钟左右") + "</b></p>"
        : '<div class="u2d-eta slow"><p>⏳ 这一步到账要等 <b>2 小时 10 分钟左右</b>，比跨到 Anubis 慢很多。</p><details><summary>为什么这么慢？能加急吗？</summary>' +
          '<p>慢的是 Anubis 官方跨链桥，不是本站，也不是你的钱包卡了。</p>' +
          '<p><b>原因</b>：官方桥为了安全，要等你在 Anubis 链上的这笔交易被后面 7200 个区块压住（大约 2 小时），确认它绝不会被撤回，才肯在 Polygon 那边把 DAI 放给你。别的链只要等 64 个区块，所以从 Polygon 跨到 Anubis 只要 2 分钟。</p>' +
          '<p><b>实际数字</b>：我们查了官方桥最近 72 笔从 Anubis 跨到 Polygon 的记录，每一笔都是 2 小时 10 分钟左右到账；从 Polygon 跨到 Anubis 的 29 笔都是 2 分钟左右。</p>' +
          '<p><b>不能加急</b>：这是官方桥写死的规则，谁也改不了，付再多钱也快不了。</p>' +
          '<p><b>等的时候</b>：币不会丢，它在官方桥里排队。你可以关掉这一页，回来页面上方的进度条还在；到账后再到上面「换币」那张卡，把 DAI 换成 USDT。也可以到官方桥 app.anubisbridge.com 的 History 里看这一笔。</p>' +
          '<p><b>急用钱</b>：请提前 2 个多小时操作，别等到要用的时候才跨。</p></details></div>') +
      '<button type="button" class="u2d-go" id="u2d-go-b">跨到 ' + b.tn + '</button><p class="u2d-say" id="u2d-say-b"></p>' +
      '<p class="note">' + (isIn ? "已经有 " + N().name + " 链的 DAI？不用换币，直接在这里跨。" : "") + "官方桥最少跨 " + BMIN + " DAI。" + "</p></section>";
  }
  function render() {
    var isIn = dir === "in";
    A.app.innerHTML =
      // 版式参照 Uniswap 的兑换卡：窄卡居中、上下两个大框（付出 / 到手）、中间一个箭头、右边写清是哪条链的哪个币（站长 2026-11-19）
      '<div class="u2d">' +
      '<header class="u2d-hd"><h2>USDT 跨链桥<span class="u2d-free">0手续费</span></h2>' +
      // 站长 2026-11-20：「充进来 / 提出去」两个大标签合并掉——方向就在「过桥」那张卡中间的 ⇅ 上切（和换币卡的 ⇅ 一个用法）。切了以后整趟的顺序跟着变（先做的那张卡排上面）
      '<div class="u2d-net" id="u2d-net"><span>你的币在哪条链</span>' + Object.keys(NETS).map(function (k) { return '<button type="button" data-net="' + k + '"' + (k === net ? ' class="on"' : "") + ">" + NETS[k].name + "</button>"; }).join("") + "</div>" +
      '</header>' + // 站长 2026-11-20：两条链的小牌子、那句说明、「Gas 够用」的提示都嫌多余，删了；卡片里本来就写着哪条链。POL 不够付 Gas 的警告还留着
      '<div id="u2d-top"></div><div id="u2d-bal"></div><div id="u2d-prog"></div>' +
      // 站长 2026-11-20：「在一个对话框就在一个对话框，不要换来换去」——两张卡位置固定（换币在上、过桥在下），各自的 ⇅ 只换自己这张卡的方向，不带动另一张、不挪位置。
      // 两张卡的方向正好凑成一整趟时（都往里 / 都往外），卡片左上角写「第 1 步 / 第 2 步」告诉客户先做哪张
      swapCard(sdir === dir ? (isIn ? 1 : 2) : 0) + bridgeCard(sdir === dir ? (isIn ? 2 : 1) : 0) +
      '<section class="u2d-card u2d-faq"><details><summary>这两步用的是谁的合约？安全吗？</summary>' +
      '<p class="note">都不是本站的合约，本站也没有为这个功能新做任何合约：</p>' +
      '<p class="note">① 换币用 <b>KyberSwap 聚合器</b>（第三方，自动在 Uniswap 等多家里挑最划算的路线；它临时不通时换 <b>ParaSwap 聚合器</b>）。</p>' +
      '<p class="note">② 跨链用 <b>Anubis 官方跨链桥</b>（app.anubisbridge.com），两个方向都是它，和你自己去官方桥页面操作是同一个合约。</p>' +
      '<p class="note">收费：本站不收服务费，换出来的币全部到你自己钱包；过桥官方也不收费。你只付链上的 Gas。直接去老池子换，1 万 USDT 要亏 4% 左右。</p>' +
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
    g("u2d-flip").onclick = function () { if (busy) return; var keep2 = (g("u2d-a2") || {}).value || ""; sdir = sdir === "in" ? "out" : "in"; q = null; qSeq++; clearTimeout(qTimer); render(); var c2 = g("u2d-a2"); if (c2 && keep2) { c2.value = keep2; onAmt2(); } /* 过桥那张卡填着的数不动 */ var c = g("u2d-a1"); if (c) c.focus({ preventScroll: true }); };
    [].forEach.call(document.querySelectorAll("#u2d-net button"), function (bt) { bt.onclick = function () { setNet(bt.getAttribute("data-net")); }; });
    if (g("u2d-flip2")) g("u2d-flip2").onclick = function () { if (busy) return; var keep = (g("u2d-a1") || {}).value || ""; setDir(dir === "in" ? "out" : "in"); var c = g("u2d-a1"); if (c && keep && !c.value) { c.value = keep; onAmt(); } var c2 = g("u2d-a2"); if (c2) c2.focus({ preventScroll: true }); };
    paintAll(); track();
  }
  // 换一条链：余额、报价都是那条链上的，清掉重读；这条链不能往外提的话方向拨回「往里充」
  function setNet(k) {
    if (busy || !NETS[k] || k === net) return;
    net = k; if (!NETS[k].canOut) dir = "in";
    q = null; qSeq++; clearTimeout(qTimer); bal = null; render();
    if (account) loadBal().then(paintAll, function () { /* 余额读不到：框里先显示「—」 */ });
  }
  function setDir(d) { if (busy || d === dir) return; dir = d; render(); if (g("u2d-a1") && g("u2d-a1").value) onAmt(); } // 只换过桥的方向；换币那张卡填着的数不动
  A.pages.usdt = function (id) {
    rid = id; q = null;
    if (!hooked) { hooked = true; A.wallets.onAccounts(function (a) { account = a && a[0] ? String(a[0]).toLowerCase() : null; bal = null; if (location.hash.indexOf("#/usdt") === 0 && g("u2d-bal")) { paintBal(); track(); loadBal().then(paintAll, function () { /* 读不到就等客户再点 */ }); } }); }
    render();
    // 钱包以前连过本站：不弹窗直接显示余额
    (account ? Promise.resolve() : A.wallets.silent().then(function (a) { if (a) account = String(a).toLowerCase(); }, function () { /* 没连过就等客户点 */ }))
      .then(function () { paintBal(); track(); return loadBal(); }).then(function () { if (A.isCurrent(id)) paintAll(); }, function () { if (A.isCurrent(id)) paintBal(); });
  };
})();
