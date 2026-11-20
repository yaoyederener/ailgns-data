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
  var account = null, bal = null, q = null, busy = false, rid = 0, qTimer = null, qSeq = 0, watch = null, dir = "in", sdir = "in"; // dir = 过桥那一步的方向，sdir = 换币那一步的方向；都由下面的 from / to 推出来（sync()），别处不要直接改
  // 🆕 2026-11-20 两张卡合成一张（站长：主流都是一张卡——上面付出、下面到账、一个按钮）。
  // from / to = 付出的币、到账的币：U = 这条链的 USDT，D = 这条链的 DAI，A = Anubis 的 DAI。走哪几步由这一对决定：
  //   U→A 换币 + 过桥；A→U 过桥 + 换币；U⇄D 只换币；D⇄A 只过桥。
  // 换币、过桥两段链上逻辑（doSwap / doBridge）和合成前一样，只是由一个按钮按顺序带着走；每一笔仍然要客户在钱包里确认
  var from = "U", to = "A", pick = null, amtStr = "", way = null; // pick = 哪个框的选币列表开着；amtStr =「你付出」框里填的数；way = 两步的那一趟走到第几步 { k: "UA" | "AU", now: 1 | 2 }
  function route() { var k = from + to; return k === "UA" ? ["swap", "bridge"] : k === "AU" ? ["bridge", "swap"] : (k === "UD" || k === "DU") ? ["swap"] : ["bridge"]; }
  function has(s) { return route().indexOf(s) >= 0; }
  function sync() { if (!N().canOut && from === "A") { from = "U"; to = "A"; } if (from === to) to = from === "A" ? "U" : "A"; sdir = from === "U" ? "in" : "out"; dir = from === "A" ? "out" : "in"; }
  function C(k) { var c = N(); return k === "U" ? { cls: "usdt", ch: "₮", sym: "USDT", chain: c.name, bk: "usdt", d: c.ud } : k === "D" ? { cls: "dai", ch: "◈", sym: "DAI", chain: c.name, bk: "pdai", d: 18 } : { cls: "dai an", ch: "◈", sym: "DAI", chain: "Anubis", bk: "adai", d: 18 }; }
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
  function setBal() { [["u2d-b1", balOf(C(from).bk)], ["u2d-b2", balOf(C(to).bk)]].forEach(function (x) { var e = g(x[0]); if (e) e.textContent = x[1]; }); }
  function paintBal() {
    var el = g("u2d-bal"); if (!el) return;
    setBal(); if (hisFor !== (account || "")) loadHis();
    if (!account || !bal) { el.innerHTML = ""; return; } // 没连钱包 / 余额还在读：这里不占地方（主按钮会写「连接钱包」，框右上角的余额先是「—」）
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
  function say(k, t, bad) { var el = g("u2d-say"); if (el) { el.textContent = t || ""; el.className = "u2d-say" + (bad ? " bad" : t ? " on" : ""); } } // 合成一张卡以后只有一处提示；第一个参数留着是为了少改调用的地方
  function lock(on) { busy = on; [].forEach.call(document.querySelectorAll("#u2d-go, #u2d-flip, #u2d-max1, .u2d-tb, .u2d-pk button, #u2d-net button"), function (b) { b.disabled = on; }); var a = g("u2d-a1"); if (a) a.readOnly = on; if (!on) paintBtn(); }
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

  // ---------- 报价 ----------
  function getQuote(amt) { var d = sdir, nk = net; return fetch("/api/u2d?amt=" + amt + "&dir=" + d + (nk === "polygon" ? "" : "&chain=" + nk)).then(function (r) { return r.json(); }).then(function (j) { if (!j || j.error || !j.ok) throw new Error((j && j.error) || "现在拿不到报价，稍后再试"); if ((j.dir || "in") !== d || (j.chain || "polygon") !== nk) throw new Error("报价方向不对，请重新填一次数量"); return { dir: d, net: nk, amt: amt, out: BigInt(j.out), fee: BigInt(j.fee || 0), feeBps: Number(j.feeBps) || 0, sum: j.sum, via: j.via, at: Date.now() }; }); }
  function amtIn() { return units(amtStr, C(from).d); }
  var FEE_WEI = BigInt(Math.round(FEE * 1e6)) * 10n ** 12n;
  // 「你到账」那个数 + 下面的说明。到账数 = 整趟走完最后到手的数（显示即所得）
  function paintInfo(err) {
    var el = g("u2d-q"), o = g("u2d-out"), cf = C(from), ct = C(to), sw = has("swap"), br = has("bridge"); if (!el) return;
    var amt = amtIn(), okq = sw && !err && !!q && q.dir === sdir && q.net === net && q.amt === amt.toString();
    var outWei = !sw ? (n(amt, 18) >= BMIN ? amt - FEE_WEI : 0n) : !okq ? 0n : (from === "U" && to === "A") ? (q.out > FEE_WEI ? q.out - FEE_WEI : 0n) : q.out;
    if (o) { o.textContent = outWei > 0n ? f(n(outWei, ct.d)) : "0"; o.className = "u2d-num" + (outWei > 0n ? "" : " zero"); }
    paintBtn();
    if (err) { el.innerHTML = '<p class="u2d-warn">' + esc(err) + "</p>"; return dtVis(); }
    if (amt === 0n) { el.innerHTML = ""; return dtVis(); }
    if (br && !sw && n(amt, 18) < BMIN) { el.innerHTML = '<p class="u2d-warn">官方桥最少跨 ' + BMIN + " DAI。</p>"; return dtVis(); }
    if (sw && !okq) return dtVis(); // 报价还在路上，onAmt 已经写了「正在找价」
    // 明细行照主流兑换页的排法：左边名目、右边数字；解释性的话收在下面「这些数是怎么算的？」里，想看的人再点开
    var rows = [], why = "", warn = "";
    if (sw) {
      // out 已经是扣完本站服务费之后的到手数；gap = 除服务费以外的差额，主要是 USDT 和 DAI 两个币本身的市价差，不是手续费
      var p = P(), inU = n(q.amt, p.sd), out = n(q.out, p.dd), fee = n(q.fee, p.dd), pct = q.feeBps / 100, gap = (1 - (out + fee) / inU) * 100, min = out * (1 - SLIP / 10000);
      var feeTxt = q.feeBps ? "本站服务费 " + pct + "%（约 " + f(fee) + " " + p.dn + "）已经扣在这个数里" : "本站不收服务费，这是全网比价后的到手数";
      rows.push(["兑换比例", "1 " + p.sn + " ≈ " + f(out / inU, 4) + " " + p.dn]);
      rows.push(["手续费", q.feeBps ? pct + "%" : '<b class="free">0</b>']);
      rows.push(["最少到手", f(min) + " " + p.dn]);
      why += '<p class="note">' + feeTxt + "。" + (gap > 0.005 ? (q.feeBps ? "另外约 " : "和 1:1 差的约 ") + f(gap, 2) + "% 是 USDT 和 DAI 这两个币本身的市价差，不是手续费，在哪换都一样。" : gap < -0.005 ? "这一刻 " + p.sn + " 比 " + p.dn + " 略贵，市价差对你有利。" : "") + "</p>" +
        '<p class="note">最少到手 ' + f(min) + " " + p.dn + "：成交那一刻价格突然变差超过 0.5%，这笔会自动取消，不会按更差的价成交。</p>";
      if (gap > 1) warn += '<p class="u2d-warn">⚠️ 现在这个数量换下来比平时差不少（市价差超过 1%）。可以把数量改小分几次换，或者过一会儿再看。</p>';
      if (from === "U" && to === "A" && out < BMIN) warn += '<p class="u2d-warn">换出来不到 ' + BMIN + " DAI，过不了桥（官方桥最少跨 " + BMIN + " DAI）。请把数量加大一点。</p>";
      if (from === "A" && n(amt, 18) < BMIN) warn += '<p class="u2d-warn">官方桥最少跨 ' + BMIN + " DAI。</p>";
    } else rows.push(["手续费", FEE ? FEE + " DAI" : '<b class="free">0</b>']);
    rows.push(["预计到账", !br ? "十几秒" : dir === "out" ? dur(EXPECT.out) : net === "bsc" ? "几分钟" : dur(expOf("in", net))]);
    rows.push(["到账地址", "你这个钱包 · " + ct.chain + " 链"]);
    if (br) why += '<p class="note">' + (FEE ? "官方桥收 " + FEE + " DAI" : "官方跨链桥不收费，跨多少到多少") + "。到账地址就是你现在这个钱包，在 " + ct.chain + ' 链上。</p><p class="note">官方桥最少跨 ' + BMIN + " DAI。</p>";
    el.innerHTML = warn + '<dl class="u2d-rows">' + rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") + '</dl><details class="u2d-why"><summary>这些数是怎么算的？</summary>' + why + "</details>";
    dtVis();
  }
  // 明细那一块（步骤条 + 明细行）两样都没有的时候整块收起来，不留一个空框
  function dtVis() { var d = g("u2d-dt"), w = g("u2d-way"), e = g("u2d-q"); if (d) d.hidden = !(w && w.innerHTML) && !(e && e.innerHTML); }
  // 主按钮按状态换字（主流兑换页的做法）：没连钱包 →「连接钱包」；没填数 →「输入数量」；余额不够 →「XX 余额不足」；都好了才是「开始跨链」
  function btnState() {
    if (!account) return { t: "连接钱包", act: "conn" };
    var amt = amtIn(), cf = C(from);
    if (amt === 0n) return { t: "输入数量", dim: 1, act: "focus" };
    if (bal && bal[cf.bk] < amt) return { t: cf.sym + " 余额不足", dim: 1, act: "go" }; // 点了照样走 go()，由它说清楚差多少
    return { t: goLabel(), act: "go" };
  }
  function paintBtn() { var b = g("u2d-go"); if (!b || busy) return; var st = btnState(); b.textContent = st.t; b.className = "u2d-go" + (st.dim ? " dim" : ""); }
  function onAmt() {
    clearTimeout(qTimer); var seq = ++qSeq, a = g("u2d-a1"); if (a) amtStr = a.value;
    var amt = amtIn(), cf = C(from), one = 10n ** BigInt(cf.d);
    if (!has("swap")) { q = null; return paintInfo(); }
    if (amt < one) { q = null; return amt > 0n ? paintInfo("最少换 1 " + cf.sym) : paintInfo(); }
    var el = g("u2d-q"); if (el) el.innerHTML = '<p class="muted">正在全网找最划算的价…</p>'; dtVis(); paintBtn();
    qTimer = setTimeout(function () { getQuote(amt.toString()).then(function (x) { if (seq !== qSeq) return; q = x; paintInfo(); }, function (e) { if (seq !== qSeq) return; q = null; paintInfo(String((e && e.message) || e)); }); }, 450);
  }

  // ---------- 换币（在客户选的那条链上）。成功后返回这一笔实际到手多少 ----------
  // 换完读余额，一直读到看见多出来的数（节点偶尔慢一两个区块）；读了 6 次还没变就返回 0，由调用的地方让客户自己再点
  function settle(k, before) {
    var tries = 0;
    function later() { return ++tries >= 6 ? 0n : new Promise(function (r) { setTimeout(r, 1500); }).then(again); }
    function again() { return loadBal().then(function () { return bal && bal[k] > before ? bal[k] - before : later(); }, later); }
    return again();
  }
  function doSwap(amt, needBridge) {
    var d0 = sdir, p = P(), c = N(), nk0 = net, before = 0n;
    if (c.cap && n(amt, p.sd) > c.cap) return Promise.reject(new Error(c.name + " 上一次最多换 " + c.cap / 10000 + " 万（池子浅，再多会亏很多）。大额请在上面选 Polygon"));
    return ready(c.key).then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (bal[p.sb] < amt) throw new Error(c.name + " 上的 " + p.sn + " 不够：你有 " + balOf(p.sb) + "，要换 " + f(n(amt, p.sd)));
      if (bal.pol < c.gasMin) throw new Error("钱包里的 " + c.gas + " 不够付 Gas，" + gasTip());
      before = bal[p.db]; say("s", "正在拿最新报价…");
      return getQuote(amt.toString());
    }).then(function (x) {
      if (sdir !== d0 || net !== nk0) throw new Error("方向或者链已经换了，请重新点一次");
      q = x; paintInfo();
      if (needBridge && n(x.out, 18) < BMIN) throw new Error("换出来不到 " + BMIN + " DAI，过不了桥（官方桥最少跨 " + BMIN + " DAI）。请把数量加大一点");
      return fetch("/api/u2d", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sum: x.sum, via: x.via, dir: d0, chain: nk0, sender: account, slip: SLIP }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || j.error || !j.ok) throw new Error((j && j.error) || "拿不到换币数据，稍后再试");
      // 本机再核一遍：只认登记的两个聚合器路由合约（KyberSwap、ParaSwap），方向要对，交易里必须写着你自己的地址
      if (ROUTERS.indexOf(String(j.to).toLowerCase()) < 0 || (j.dir || "in") !== d0 || (j.chain || "polygon") !== nk0 || net !== nk0 || String(j.data).toLowerCase().indexOf(account.slice(2)) < 0) throw new Error("换币数据没通过安全检查，已拦下，你的币没有动");
      return allow(p.src, j.to, amt, "s", p.sn).then(function () { return send(c.key, j.to, j.data, "s", p.sn + " 换成 " + p.dn); });
    }).then(function () { return settle(p.db, before); });
  }

  // ---------- 过桥（往里充在客户那条链上发，往外提在 Anubis 上发）。then = "swap" 表示到了以后还要接着换成 USDT ----------
  function doBridge(amt, then) {
    var d0 = dir, b = B(), c = N(), nk0 = net, start = 0n, txHash = "";
    if (n(amt, 18) < BMIN) return Promise.reject(new Error("官方桥最少跨 " + BMIN + " DAI"));
    if (d0 === "out" && !c.canOut) return Promise.reject(new Error("官方桥不支持把 DAI 跨回 " + c.name + "，往外提请在上面选 Polygon"));
    return ready(b.from).then(function () { return loadBal(); }).then(function () {
      paintBal();
      if (!bal) throw new Error("没读到余额，刷新后再试");
      if (d0 === "in") {
        if (bal.pdai < amt) throw new Error(c.name + " 上的 DAI 不够：你有 " + balOf("pdai") + "，要跨 " + f(n(amt, 18)));
        if (bal.pol < c.gasMin / 2n) throw new Error("钱包里的 " + c.gas + " 不够付 Gas，" + gasTip());
      } else if (bal.adai < amt + GAS_KEEP / 5n) throw new Error("Anubis 上的 DAI 不够：你有 " + balOf("adai") + "，要跨 " + f(n(amt, 18)) + "，还要留一点点当 Gas。点「全部」会自动留好");
      start = bal[b.tb];
      // 客户那条链上的 DAI 是普通代币，要先授权给桥；Anubis 的 DAI 是原生币，实测不用授权
      return d0 === "in" ? allow(c.dai, BRIDGE, amt, "b", "DAI 给官方跨链桥") : null;
    }).then(function () {
      if (dir !== d0 || net !== nk0) throw new Error("方向或者链已经换了，请重新点一次");
      return send(b.from, BRIDGE, SEL.bridge + DAI_ID + u256(CHAIN_ID[b.to]) + aw(account) + u256(amt), "b", "DAI 跨到 " + b.tn);
    }).then(function (rc) { txHash = rc && rc.transactionHash; return loadBal(); }).then(function () {
      track({ a: account, dir: d0, net: nk0, amt: amt.toString(), start: start.toString(), t0: Date.now(), tx: txHash || "", then: then || "" });
      setTimeout(function () { loadHis(true); }, 10000);
    });
  }
  function bridged(d, nk) { return "✅ 已交给官方跨链桥，正在跨（官方桥到账" + dur(expOf(d, nk)) + "）。进度看页面上方的进度条，可以关掉这一页，回来还在。"; }

  // ---------- 那一个按钮：按 from / to 这一对，把该走的步骤按顺序走完 ----------
  function go() {
    if (busy) return;
    var k = from + to, r = route(), cf = C(from), amt = amtIn(), c = N(), stage = 1, got1 = 0n, second = way && way.now === 2 ? way.k : "";
    if (amt === 0n) return say("s", "先填要付出多少 " + cf.sym, true);
    if (r[0] === "swap" && amt < 10n ** BigInt(cf.d)) return say("s", "最少换 1 " + cf.sym, true);
    if (r[0] === "bridge" && n(amt, 18) < BMIN) return say("s", "官方桥最少跨 " + BMIN + " DAI", true);
    if (pick) { pick = null; render(); }
    lock(true); say("s", "正在连接钱包…");
    if (r.length === 2) { way = { k: k, now: 1 }; paintWay(); }
    var job;
    if (k === "UA") job = doSwap(amt, true).then(function (got) {
      // 第 1 步换好了：界面切成「这条链的 DAI → Anubis」并填上到手的数。后面过桥万一没成，客户再点一次按钮就是接着跨，不会重复换币
      got1 = got; stage = 2;
      from = "D"; to = "A"; amtStr = got > 0n ? plain(got, 18, 4) : ""; q = null; way = { k: "UA", now: 2 };
      render(); lock(true);
      if (got === 0n) throw new Error("余额还没刷新出来。等几秒点「全部」，再点下面的按钮跨到 Anubis");
      say("s", "✅ 第 1 步换好了，到手 " + f(n(got, 18)) + " DAI。接着第 2 步：跨到 Anubis…");
      return doBridge(got, "");
    }).then(function () { var nk = net; from = "U"; to = "A"; amtStr = ""; way = null; render(); say("s", bridged("in", nk)); });
    else if (k === "AU") job = doBridge(amt, "swap").then(function () { amtStr = ""; way = null; render(); say("s", "✅ 第 1 步已交给官方跨链桥，" + dur(EXPECT.out) + "后到 " + c.name + "。到了以后这一页会帮你填好第 2 步，点一下按钮把 DAI 换成 USDT。可以关掉这一页，回来还在。"); });
    else if (r[0] === "swap") job = doSwap(amt, false).then(function (got) {
      var ct = C(to), gotTxt = got > 0n ? "，到手 " + f(n(got, ct.d)) + " " + ct.sym : "";
      if (second === "AU") pendClear(); // 两步都走完了：上面那条「到账了，接着换成 USDT」的进度收起来
      amtStr = ""; q = null; way = null; render();
      say("s", (second === "AU" ? "🎉 换好了" : "✅ 换好了") + gotTxt + "，就在你这个钱包里（" + c.name + " 链）。" + (second === "AU" ? "两步都走完了。" : ""));
    });
    else job = doBridge(amt, "").then(function () { var d0 = dir, nk = net; if (second === "UA") { from = "U"; to = "A"; } amtStr = ""; way = null; render(); say("s", bridged(d0, nk)); });
    job.catch(function (e) {
      if (stage === 2) say("s", "第 1 步已经换好，" + (got1 > 0n ? f(n(got1, 18)) + " " : "") + "DAI 在你钱包里（" + c.name + " 链），没有丢。第 2 步还没做：" + nice(e), true);
      else { if (r.length === 2) { way = null; paintWay(); } say("s", "没成功：" + nice(e), true); }
    }).then(function () { lock(false); });
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
    var sub2 = done ? "这一趟用了" + dur((p.done - p.t0) / 1000) + "。" + (isIn ? "现在可以去买 AiLGNS 或注册域名了。" : p.then === "" ? "DAI 已经在你这个钱包里了。" : "接着在下面点按钮，把 DAI 换成 USDT。")
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
    loadBal().then(function () { paintBal(); if (p.dir === "out" && p.then !== "" && !busy && !amtStr && net === (p.net || "polygon") && bal) { var v = BigInt(p.amt); if (bal.pdai < v) v = bal.pdai; if (v > 0n) { from = "D"; to = "U"; pick = null; q = null; amtStr = plain(v, 18, 4); way = { k: "AU", now: 2 }; render(); } } }, function () { /* 余额下次再读 */ });
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

  // ---------- 我的跨链记录（站长 2026-11-20：自己跨了一笔，页面上找不到记录，问「钱到哪了、什么时候到」）----------
  // 直接读官方桥上这个钱包的订单（/api/u2d?orders=），不靠浏览器里存的那一条：换手机、换浏览器、在官方桥页面跨的，都查得到。
  // 上面那条进度条（u2d-prog）是刚跨完这一笔的即时反馈，还管「到了以后接着换成 USDT」；这里是完整的记录
  var his = null, hisAt = 0, hisFor = "", hisBusy = false, hisTimer = null;
  var HEXP = { out: 130 * 60, polygon: 120, bsc: 120 }, HNAME = { anubis: "Anubis", polygon: "Polygon", bsc: "BSC" }; // 官方桥大概多久到（秒）：从 Anubis 出去约 2 小时 10 分钟；进 Anubis 一两分钟
  function hm(ts) { var d = new Date(ts * 1000), p2 = function (x) { return (x < 10 ? "0" : "") + x; }; return (new Date().toDateString() === d.toDateString() ? "" : (d.getMonth() + 1) + "-" + d.getDate() + " ") + p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function paintHis(msg) {
    var el = g("u2d-his"); if (!el) return;
    var head = '<div class="u2d-hh"><b>我的跨链记录</b>' + (account ? '<button type="button" class="u2d-hr" id="u2d-hr">' + (hisBusy ? "查询中…" : "查询进度") + "</button>" : "") + "</div>";
    if (!account) { el.innerHTML = head + '<p class="muted">连接钱包后，这里显示你最近的跨链：钱到哪了、还要多久到。</p>'; return; }
    var L = hisFor === account && his ? his : null, body;
    if (msg) body = '<p class="u2d-warn">' + esc(msg) + "</p>";
    else if (!L) body = '<p class="muted">正在查…</p>';
    else if (!L.length) body = '<p class="muted">这个钱包最近没有跨链记录。</p>';
    else body = L.map(function (o) {
      var now = Date.now() / 1000, exp = o.from === "anubis" ? HEXP.out : (HEXP[o.from] || 120), done = o.st === "completed" || o.recvTs > 0, bad = !done && !!(o.fail || /fail|refund|cancel/i.test(o.st));
      var el2 = Math.max(0, now - o.sendTs), late = !done && !bad && el2 > exp * 1.3 + 300, pct = done ? 100 : Math.max(4, Math.min(96, el2 / exp * 100));
      var amt = o.amt ? f(n(BigInt(o.amt), o.dec)) + " " + esc(o.sym) : (esc(o.sym) || "跨链");
      var t = done ? "✅ 已到账" + (o.recvTs ? " · " + hm(o.recvTs) + " · 用了" + dur(o.recvTs - o.sendTs) : "")
        : bad ? "⚠️ 官方桥显示这笔没成功" + (o.fail ? "：" + esc(o.fail) : "") + "。请到官方桥 app.anubisbridge.com 的 History 里看，或者提工单给我们"
        : late ? "⏳ 已经过了" + dur(el2) + "，比平时（" + dur(exp) + "）慢。币不会丢，官方桥还在处理"
        : "⏳ 正在跨 · 预计 " + hm(o.sendTs + exp) + " 到（还要" + dur(exp - el2) + "）";
      return '<div class="u2d-ho' + (done ? " done" : bad ? " bad" : "") + '"><div class="u2d-ht"><b>' + amt + "</b><span>" + (HNAME[o.from] || "其它链") + " → " + (HNAME[o.to] || "其它链") + " · " + hm(o.sendTs) + ' 发出</span></div><p>' + t + "</p>" + (done || bad ? "" : '<div class="u2d-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>') + "</div>";
    }).join("");
    el.innerHTML = head + body;
    var b = g("u2d-hr"); if (b) b.onclick = function () { loadHis(true); };
  }
  function loadHis(force) {
    clearTimeout(hisTimer);
    if (!account) { hisFor = ""; return paintHis(); }
    if (hisFor !== account) { his = null; hisFor = account; hisAt = 0; }
    if (hisBusy) return paintHis();
    if (!force && his && Date.now() - hisAt < 20000) { paintHis(); return hisNext(); } // 20 秒内查过：直接用刚才的，不再问一遍
    var a = account; hisBusy = true; paintHis();
    fetch("/api/u2d?orders=" + a).then(function (r) { return r.json(); }).then(function (j) {
      hisBusy = false; if (a !== account) return;
      if (!j || !j.ok) return paintHis(his ? "" : (j && j.error) || "记录暂时查不到，过一会儿再点「查询进度」"); // 以前查到过的先留着显示
      his = j.list || []; hisAt = Date.now(); paintHis(); hisNext();
    }, function () { hisBusy = false; if (a === account) paintHis(his ? "" : "网络不好，过一会儿再点「查询进度」"); });
  }
  // 有还没到的：页面开着就每分钟自己再查一次（切到后台不查），到了自动变成「已到账」
  function hisNext() { clearTimeout(hisTimer); if (his && his.some(function (o) { return o.st !== "completed" && !o.recvTs; })) hisTimer = setTimeout(function () { if (!g("u2d-his")) return; if (document.hidden) return hisNext(); loadHis(true); }, 60000); }

  // ---------- 页面 ----------
  var hooked = false;
  function paintAll() { paintBal(); paintInfo(); paintWay(); }
  // 两步的那一趟：框下面一行「第 1 步 → 第 2 步」，走到哪步亮哪步。只有一步的（只换币 / 只过桥）不显示
  function paintWay() {
    var el = g("u2d-way"); if (!el) return;
    var k = way ? way.k : from + to, now = way ? way.now : 0;
    if (k !== "UA" && k !== "AU") { el.innerHTML = ""; dtVis(); paintBtn(); return; }
    var nm = k === "UA" ? ["换币", "过桥"] : ["过桥", "换币"];
    el.innerHTML = '<ol class="u2d-way">' + nm.map(function (x, i) { var cl = now > i + 1 ? "ok" : now === i + 1 ? "now" : ""; return '<li class="' + cl + '"><i>' + (cl === "ok" ? "✓" : i + 1) + "</i><b>" + x + "</b></li>"; }).join('<li class="ar"></li>') + "</ol>";
    dtVis(); paintBtn();
  }
  // 币的图标用官方标志：icons/tokens/usdt.png、dai.png，图片万一没加载出来，后面还垫着原来的色块和符号。
  // Anubis 链上的 DAI：币的右下角压一个 Anubis 链的小标志（取自官方区块浏览器的站标），和钱包里显示「哪条链上的币」一个画法
  function tokIn(k) { var c = C(k); return '<span class="u2d-cw"><i class="u2d-coin ' + c.cls + '"><img src="/icons/tokens/' + (c.sym === "USDT" ? "usdt" : "dai") + '.png?v=1" alt="" width="30" height="30">' + c.ch + "</i>" + (k === "A" ? '<em class="u2d-ch" title="Anubis 链"></em>' : "") + "</span><span><b>" + c.sym + "</b><small>" + c.chain + " 链</small></span>"; }
  // 框右边那个币是个按钮：点一下，在框里列出能换成的另外两个币（主流兑换页的「选币」）
  function tokBtn(side, k) { return '<button type="button" class="u2d-tok u2d-tb" data-side="' + side + '" aria-label="换一个币">' + tokIn(k) + '<i class="u2d-car"></i></button>'; }
  function pickList(side) {
    var cur = side === "from" ? from : to;
    var ks = ["U", "D", "A"].filter(function (k) { return k !== cur && !(side === "from" && k === "A" && !N().canOut); });
    return '<div class="u2d-pk"><p>' + (side === "from" ? "你要付出哪个币" : "你要到账哪个币") + "</p>" + ks.map(function (k) { return '<button type="button" class="u2d-tok" data-side="' + side + '" data-k="' + k + '">' + tokIn(k) + "</button>"; }).join("") + "</div>";
  }
  function choose(side, k) {
    if (busy) return; var of = from, ot = to;
    if (side === "from") { from = k; if (to === k) to = of; } else { to = k; if (from === k) from = ot; }
    if (!N().canOut && from === "A") from = to === "U" ? "D" : "U"; // 这条链不能往外提：付出的币只能是这条链上的
    pick = null; way = null; q = null; qSeq++; clearTimeout(qTimer); render();
  }
  function goLabel() {
    var k = from + to, two = way && way.now === 2;
    return k === "UA" || k === "AU" ? "开始跨链" : k === "UD" ? "换成 DAI" : k === "DU" ? (two ? "第 2 步：换成 USDT" : "换成 USDT") : (two ? "第 2 步：" : "") + "跨到 " + C(to).chain;
  }
  function etaHtml() {
    if (!has("bridge")) return "";
    if (dir === "in") return ""; // 往里充的到账时间写在明细行「预计到账」里
    return '<div class="u2d-eta slow"><p>⏳ 过桥这一步要等 <b>2 小时 10 分钟左右</b>，比跨到 Anubis 慢很多。</p><details><summary>为什么这么慢？能加急吗？</summary>' +
      '<p>慢的是 Anubis 官方跨链桥，不是本站，也不是你的钱包卡了。</p>' +
      '<p><b>原因</b>：官方桥为了安全，要等你在 Anubis 链上的这笔交易被后面 7200 个区块压住（大约 2 小时），确认它绝不会被撤回，才肯在 Polygon 那边把 DAI 放给你。别的链只要等 64 个区块，所以从 Polygon 跨到 Anubis 只要 2 分钟。</p>' +
      '<p><b>实际数字</b>：我们查了官方桥最近 72 笔从 Anubis 跨到 Polygon 的记录，每一笔都是 2 小时 10 分钟左右到账；从 Polygon 跨到 Anubis 的 29 笔都是 2 分钟左右。</p>' +
      '<p><b>不能加急</b>：这是官方桥写死的规则，谁也改不了，付再多钱也快不了。</p>' +
      '<p><b>等的时候</b>：币不会丢，它在官方桥里排队。你可以关掉这一页，回来页面上方的进度条还在；要换成 USDT 的，到账后这一页会帮你填好，点一下按钮就行。也可以到官方桥 app.anubisbridge.com 的 History 里看这一笔。</p>' +
      '<p><b>急用钱</b>：请提前 2 个多小时操作，别等到要用的时候才跨。</p></details></div>';
  }
  function card() {
    var canFlip = N().canOut || to !== "A"; // 对调以后付出的币不能是 Anubis 的 DAI（这条链不能往外提）
    return '<section class="u2d-card">' +
      '<div class="u2d-box"><div class="u2d-bh"><span>你付出</span><span>余额 <b id="u2d-b1">—</b><button type="button" class="u2d-max" id="u2d-max1">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="u2d-a1" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + tokBtn("from", from) + "</div>" + (pick === "from" ? pickList("from") : "") + "</div>" +
      (canFlip ? '<div class="u2d-mid"><button type="button" class="u2d-flip" id="u2d-flip" aria-label="付出和到账对调" title="点一下，付出和到账对调">⇅</button></div>' : '<div class="u2d-mid"><i>↓</i><span class="u2d-one">往外提请选 Polygon</span></div>') +
      '<div class="u2d-box end"><div class="u2d-bh"><span>你到账</span><span>余额 <b id="u2d-b2">—</b></span></div>' +
      '<div class="u2d-bm"><output id="u2d-out" class="u2d-num zero">0</output>' + tokBtn("to", to) + "</div>" + (pick === "to" ? pickList("to") : "") + "</div>" +
      '<div class="u2d-dt" id="u2d-dt" hidden><div id="u2d-way"></div><div id="u2d-q"></div></div>' + etaHtml() +
      '<button type="button" class="u2d-go" id="u2d-go">' + goLabel() + '</button><p class="u2d-say" id="u2d-say"></p>' +
      (has("swap") && N().cap ? '<p class="note">' + N().name + " 上 DAI 的池子比较浅：一次最多换 " + N().cap / 10000 + " 万，超过 1 万价格会明显变差。大额请在上面选 Polygon。</p>" : "") + "</section>";
  }
  function render() {
    sync();
    A.app.innerHTML =
      // 版式参照主流兑换页（Uniswap / 币安钱包那种）：一张窄卡居中、上面付出、下面到账、中间一个箭头、框右边选哪条链的哪个币、底下一个按钮
      '<div class="u2d">' +
      '<header class="u2d-hd"><h2>USDT 跨链桥<span class="u2d-free">0手续费</span></h2>' +
      '<div class="u2d-net" id="u2d-net"><span>你的币在哪条链</span>' + Object.keys(NETS).map(function (k) { return '<button type="button" data-net="' + k + '"' + (k === net ? ' class="on"' : "") + ">" + NETS[k].name + "</button>"; }).join("") + "</div>" +
      '</header>' +
      '<div id="u2d-bal"></div><div id="u2d-prog"></div>' + card() + '<section class="u2d-card u2d-his" id="u2d-his"></section>' +
      '<section class="u2d-card u2d-faq"><details><summary>这两步用的是谁的合约？安全吗？</summary>' +
      '<p class="note">都不是本站的合约，本站也没有为这个功能新做任何合约：</p>' +
      '<p class="note">① 换币用 <b>KyberSwap 聚合器</b>（第三方，自动在 Uniswap 等多家里挑最划算的路线；它临时不通时换 <b>ParaSwap 聚合器</b>）。</p>' +
      '<p class="note">② 跨链用 <b>Anubis 官方跨链桥</b>（app.anubisbridge.com），两个方向都是它，和你自己去官方桥页面操作是同一个合约。</p>' +
      '<p class="note">收费：本站不收服务费，换出来的币全部到你自己钱包；过桥官方也不收费。你只付链上的 Gas。直接去老池子换，1 万 USDT 要亏 4% 左右。</p>' +
      '<p class="note">③ 授权只给这一笔要用的数量，不给无限额度；每一步发出前本站先替你模拟一遍，会失败的不让钱包弹窗。</p>' +
      '<p class="note">④ 这是试运行功能，第一次请先用小额（比如 20 USDT）走一遍，到账了再放大。</p></details></section></div>';
    var a1 = g("u2d-a1"); a1.value = amtStr; a1.oninput = onAmt;
    g("u2d-max1").onclick = function () {
      if (!bal) return say("s", "先连接钱包", true);
      var cf = C(from), v = bal[cf.bk]; if (from === "A") v = v > GAS_KEEP ? v - GAS_KEEP : 0n; // 往外提：在 Anubis 上留一点 DAI 当 Gas
      a1.value = plain(v, cf.d, cf.d === 6 ? 2 : 4); onAmt();
    };
    g("u2d-go").onclick = function () {
      if (busy) return; var st = btnState();
      if (st.act === "conn") return void connect(N().key).then(function () { track(); return loadBal(); }).then(paintAll, function (e) { say("s", nice(e), true); });
      if (st.act === "focus") { say("s", ""); return a1.focus(); }
      go();
    };
    if (g("u2d-flip")) g("u2d-flip").onclick = function () { if (busy) return; var t = from; from = to; to = t; pick = null; way = null; q = null; qSeq++; clearTimeout(qTimer); render(); };
    [].forEach.call(document.querySelectorAll(".u2d-tb"), function (b) { b.onclick = function () { if (busy) return; var s = b.getAttribute("data-side"); pick = pick === s ? null : s; render(); }; });
    [].forEach.call(document.querySelectorAll(".u2d-pk button"), function (b) { b.onclick = function () { choose(b.getAttribute("data-side"), b.getAttribute("data-k")); }; });
    [].forEach.call(document.querySelectorAll("#u2d-net button"), function (bt) { bt.onclick = function () { setNet(bt.getAttribute("data-net")); }; });
    paintAll(); track(); loadHis();
    if (amtStr && has("swap") && !q) onAmt();
  }
  // 换一条链：余额、报价都是那条链上的，清掉重读；这条链不能往外提的话，付出的币拨回这条链上的（sync() 里管）
  function setNet(k) {
    if (busy || !NETS[k] || k === net) return;
    net = k; pick = null; way = null;
    q = null; qSeq++; clearTimeout(qTimer); bal = null; render();
    if (account) loadBal().then(paintAll, function () { /* 余额读不到：框里先显示「—」 */ });
  }
  A.pages.usdt = function (id) {
    rid = id; q = null; pick = null; sync();
    if (!hooked) { hooked = true; A.wallets.onAccounts(function (a) { account = a && a[0] ? String(a[0]).toLowerCase() : null; bal = null; if (location.hash.indexOf("#/usdt") === 0 && g("u2d-bal")) { paintBal(); track(); loadBal().then(paintAll, function () { /* 读不到就等客户再点 */ }); } }); }
    render();
    // 钱包以前连过本站：不弹窗直接显示余额
    (account ? Promise.resolve() : A.wallets.silent().then(function (a) { if (a) account = String(a).toLowerCase(); }, function () { /* 没连过就等客户点 */ }))
      .then(function () { paintBal(); track(); return loadBal(); }).then(function () { if (A.isCurrent(id)) paintAll(); }, function () { if (A.isCurrent(id)) paintBal(); });
  };
})();
