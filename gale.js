// ⚡ 跨链桥页里的「秒到通道」（原 #/gale「秒到跨链」，2026-11-20 当天合并进 #/usdt；站长 2026-11-20：官方桥从 Anubis 出去要等 2 小时 10 分钟，接第三方 GaleBridge 做秒到通道，本站加收 0.05%）
// 做法：用 GaleBridge 官方公开的嵌入组件（galebridge.net/docs/widget，SDK 0.1.0 固定存一份在 /vendor/，不从它的网站加载脚本）。
//   · 客户的币进的是 GaleBridge 的合约，由它在目标链付款；本站不经手客户的币，没有新合约。
//   · 组件在它自己域名的小窗（iframe）里，要钱包签名时把请求交给本页，本页只放行两种：给 GaleBridge 合约的授权、发给 GaleBridge 合约的交易；别的一律拦下。
//   · 本站服务费 0.05%：客户点跨链时，本页先让钱包单独转一笔服务费到本站收款钱包，再放行跨链那一笔（没有新合约就只能分两笔）。
//     服务费付了、跨链那笔没发出去（客户取消 / 出错）：记在这台设备上，同一个数量再点一次不重复收。
// 页面上写明：GaleBridge 是第三方、它收多少以它小窗里的报价为准、本站另收 0.05%。别把本站这笔写成第三方收的。
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var FEE_BPS = 5n; // 本站服务费：万分之五 = 0.05%。站长 2026-11-20 深夜定：照收，页面上不单独列一行，写进手续费合计里、后面小字「含本站 0.05%」（不说明就收我没做：这笔是钱包单独弹出来的转账，藏不住）。改费率时页面那行合计、客服知识、更新日志要一起改
  var PAYEE = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 本站收款钱包（各条链同一个地址）
  var SDK = "/vendor/gale-widget-0.1.0.js?v=g010a";
  var ADAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", PDAI = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063";
  // GaleBridge 在各条链上的合约（新版、旧版），2026-11-20 取自它公开的 /api/v1/network/list，并在链上核对过正在用
  var GALE = {
    "6714": ["0xd1a5c8492ed1773ca0f1a97abad71afb122a750a", "0x6c18c9226c30bd3057b9606ba5b506efd4c2506a"],
    "137": ["0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "0xa2c1ec79872d2c961cbd33ef750659e3b2439647"],
    "56": ["0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "0xa2c1ec79872d2c961cbd33ef750659e3b2439647"],
    "1": ["0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "0xa2c1ec79872d2c961cbd33ef750659e3b2439647"]
  };
  var KEY = { "6714": "anubis", "137": "polygon", "56": "bsc" }; // 本站钱包模块认识的链（会帮客户把网络加进钱包）
  var NATIVE = { "6714": ["DAI", 18], "137": ["POL", 18], "56": ["BNB", 18], "1": ["ETH", 18] };
  var TOK = { // 认识的币：名字、小数位。不认识的币不收服务费（算不出数），照常放行
    "6714": { "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14": ["DAI", 18], "0x7dd9c7cbc32df500fa3c06fd60cd62c4e97b2eef": ["USDC", 6], "0xdfb6a28bc6dc51fed17c27c880f2c66cdd040a3e": ["USDT", 6], "0xa921267c56b3a57696d6fd7949c9fad0a8e0c177": ["A", 18] },
    "137": { "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": ["DAI", 18], "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": ["USDC", 6], "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": ["USDT", 6] },
    "56": { "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3": ["DAI", 18], "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": ["USDC", 18], "0x55d398326f99059ff775485246999027b3197955": ["USDT", 18] },
    "1": { "0x6b175474e89094c44da98b954eedeac495271d0f": ["DAI", 18], "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ["USDC", 6], "0xdac17f958d2ee523a2206206994597c13d831ec7": ["USDT", 6] }
  };
  var DEPOSIT = "0x5f377433"; // GaleBridge 的存入函数：(币, 数量, "目标链,收款人,目标币")
  var ZERO = "0x0000000000000000000000000000000000000000";
  var widget = null, eth = null, hooked = false, rid = 0;

  function g(id) { return document.getElementById(id); }
  function low(s) { return String(s || "").toLowerCase(); }
  function word(h) { return ("0".repeat(64) + String(h).replace(/^0x/, "")).slice(-64); }
  function say(t, bad) { var el = g("gbx-st"); if (!el) return; el.className = "gbx-st" + (bad ? " bad" : ""); el.textContent = t || ""; }
  function show(v, dec) { // 链上的整数 → 给人看的数，最多 6 位小数
    var s = v.toString().padStart(dec + 1, "0"), i = s.slice(0, s.length - dec), f = s.slice(s.length - dec).slice(0, 6).replace(/0+$/, "");
    return i + (f ? "." + f : "");
  }
  function okGale(chainId, addr) { var l = GALE[String(chainId)]; return !!l && l.indexOf(low(addr)) >= 0; }

  // 钱包：组件要的是标准的钱包接口，这里包一层，走本站自己的钱包模块（选钱包、各家钱包的小毛病都在那边处理）
  function provider() {
    return { request: function (a) {
      // 还没连钱包时，只有客户自己点「连接」（eth_requestAccounts）才弹选钱包；小窗自己来问账号、查回执的，一律答「没连」，不打扰客户
      if (!eth && (!a || a.method !== "eth_requestAccounts")) return Promise.reject(new Error("Connect an EVM wallet"));
      return (eth ? Promise.resolve(eth) : A.wallets.choose().then(function (p) { eth = p; return p; })).then(function (e) { return A.wallets.ask(e, a); });
    } };
  }
  function ask(a) { return provider().request(a); }

  // 这一笔跨链要收多少服务费：从 GaleBridge 的存入交易里读出「什么币、多少」
  function feeOf(tx) {
    var c = String(tx.chainId), d = low(tx.data), val = 0n, token = null, amt = 0n;
    try { val = BigInt(tx.value || "0"); } catch (e) { val = 0n; }
    if (d.slice(0, 10) === DEPOSIT && d.length >= 10 + 128) { token = "0x" + d.slice(10 + 24, 10 + 64); amt = BigInt("0x" + d.slice(10 + 64, 10 + 128)); }
    if (val > 0n && (!token || token === ZERO)) { token = ZERO; amt = val; } // 直接付原生币的
    if (!token || amt <= 0n) return null;
    var info = token === ZERO ? NATIVE[c] : (TOK[c] || {})[token];
    if (!info) return null;
    var fee = amt * FEE_BPS / 10000n;
    if (fee <= 0n) return null;
    var native = token === ZERO || (c === "6714" && token === ADAI); // Anubis 上 DAI 就是原生币，直接转
    return { key: [low(tx.from), c, token, amt.toString()].join("|"), fee: fee, sym: info[0], dec: info[1],
      tx: native ? { from: tx.from, to: PAYEE, value: "0x" + fee.toString(16) } : { from: tx.from, to: token, value: "0x0", data: "0xa9059cbb" + word(PAYEE) + word(fee.toString(16)) } };
  }
  function paidGet() { try { return localStorage.getItem("gbx:paid") || ""; } catch (e) { return ""; } }
  function paidSet(k) { try { if (k) localStorage.setItem("gbx:paid", k); else localStorage.removeItem("gbx:paid"); } catch (e) { /* 存不了就算了：最坏是重试时再收一次 0.05% */ } }
  function waitFee(hash) { // 等服务费这笔上链（最多等 40 秒，等不到也往下走）
    var n = 0;
    return new Promise(function (ok, no) {
      (function loop() {
        ask({ method: "eth_getTransactionReceipt", params: [hash] }).then(function (r) {
          if (r && r.status === "0x1") return ok();
          if (r && r.status === "0x0") return no(new Error("服务费这一笔在链上没成功，没有扣钱。请再点一次。"));
          if (++n > 26) return ok();
          setTimeout(loop, 1500);
        }, function () { if (++n > 26) return ok(); setTimeout(loop, 1500); });
      })();
    });
  }
  function payFee(tx) {
    var f = feeOf(tx);
    if (!f) return Promise.resolve();
    if (paidGet() === f.key) { say("这一笔的服务费已经付过了，不重复收。请在钱包里确认跨链这一笔。"); return Promise.resolve(); }
    var amt = show(f.fee, f.dec) + " " + f.sym;
    say("第 1 笔（共 2 笔）：本站服务费 " + amt + "（0.05%）。请在钱包里确认。");
    return ask({ method: "eth_sendTransaction", params: [f.tx] }).then(function (h) {
      paidSet(f.key);
      say("服务费 " + amt + " 已发出，等它上链…");
      return waitFee(h).catch(function (e) { paidSet(""); throw e; });
    }).then(function () { say("第 2 笔（共 2 笔）：跨链。请在钱包里确认。"); });
  }

  // 交给组件用的钱包接口：在它自带的那份外面再包一层检查
  function adapter() {
    var base = window.GaleBridge.createEvmAdapter(provider());
    return { request: function (r) {
      try {
        if (r.method === "switchChain" && KEY[String(r.chainId)]) {
          return (eth ? Promise.resolve(eth) : A.wallets.choose().then(function (p) { eth = p; return p; }))
            .then(function (e) { return W.switchTo(e, KEY[String(r.chainId)]); }).then(function () { return base.request({ method: "account" }); });
        }
        if (r.method === "approve" && !okGale(r.chainId, r.spender)) { say("这笔授权不是给 GaleBridge 合约的，已拦下，没有发出去。", true); return Promise.reject(new Error("Blocked: unknown spender")); }
        if (r.method === "sendTransaction") {
          var tx = r.transaction || {};
          if (!okGale(tx.chainId, tx.to)) { say("这笔交易不是发给 GaleBridge 合约的，已拦下，没有发出去。", true); return Promise.reject(new Error("Blocked: unknown contract")); }
          return payFee(tx).then(function () { return base.request(r); }).then(function (h) { paidSet(""); say("跨链这一笔已发出，上面的小窗里会显示到账进度。"); return h; });
        }
      } catch (e) { return Promise.reject(e); }
      return base.request(r);
    } };
  }

  function loadSdk() {
    if (window.GaleBridge) return Promise.resolve();
    return new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = SDK; s.onload = function () { window.GaleBridge ? ok() : no(new Error("sdk")); }; s.onerror = function () { no(new Error("sdk")); };
      document.head.appendChild(s);
    });
  }
  function unmount() { try { if (widget) widget.destroy(); } catch (e) { /* 忽略 */ } widget = null; }
  function mount(id) {
    loadSdk().then(function () {
      if (!A.isCurrent(id) || !g("gbx-w")) return;
      unmount();
      var lang = window.AIL_LANG === "en" || window.AIL_LANG === "ko" ? "en" : "zh"; // 组件只有英文和繁体中文
      var dark = false; try { dark = /night|dark/.test(document.documentElement.className + " " + document.body.className); } catch (e) { dark = false; }
      widget = window.GaleBridge.createWidget({
        container: "#gbx-w", clientId: "ailgns-otc-bridge", /* 小窗按这个名字记「没跨完的那一笔」。2026-11-20 换过一次名字：我用假钱包测试时在面板里留了一笔永远跨不完的假记录，换名字后从头开始；客户不受影响 */ lang: lang, theme: dark ? "dark" : "light", accentColor: "#5920ad",
        fromChainId: "6714", fromTokenAddress: ADAI, toChainId: "137", toTokenAddress: PDAI,
        // 站长 2026-11-20 晚：「优化下选择框，看起来很乱」→ 小窗里的下拉是它自己的，样子改不了，只能把选项减到常用的 6 个（按链上最近的单子：去 BSC、Polygon 的最多，币是 USDT、DAI）。以太坊 Gas 贵、波场要另一种钱包，先不开
        allowedChains: ["6714", "137", "56"],
        allowedTokens: [{ chainId: "6714", address: ADAI }, { chainId: "6714", address: "0xdfb6a28bc6dc51fed17c27c880f2c66cdd040a3e" },
          { chainId: "137", address: PDAI }, { chainId: "137", address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" },
          { chainId: "56", address: "0x55d398326f99059ff775485246999027b3197955" }, { chainId: "56", address: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3" }],
        wallets: { evm: adapter() }
      });
      widget.on("error", function (e) { var m = e && e.message ? String(e.message) : ""; if (/Blocked/.test(m)) return; say(/reject|denied|cancel/i.test(m) ? "你在钱包里取消了，这一步没有发出去。" : m, true); });
      widget.on("completed", function () { say("✅ 已到账。到目标链的钱包里看一下余额。"); });
      if (widget.ready && widget.ready.catch) widget.ready.catch(function () { say("秒到通道的小窗没打开（可能是网络问题）。可以直接去 galebridge.net 操作，或者走免费的官方桥。", true); });
    }, function () { say("秒到通道没加载出来，请刷新再试。", true); });
  }

  // 2026-11-20 站长：「合并到跨链桥里面」→ 不再是单独一页，由跨链桥页（usdt.js）选了「秒到通道」时把内容画进它给的那一块
  function draw(el, id) {
    rid = id;
    if (!hooked) { hooked = true; window.addEventListener("hashchange", function () { try { if (location.hash.indexOf("#/usdt") !== 0) unmount(); } catch (e) { /* 忽略 */ } }); }
    try { eth = W.get() || null; } catch (e) { eth = null; } /* 没连钱包时 W.get() 会抛错：等客户在小窗里点连接再选钱包 */
    el.innerHTML = '<div class="gbx">' +
      '<div class="gbx-rows">' +
      '<div><span>多久到</span><b>约 20 秒</b></div>' +
      '<div><span>手续费</span><b>约 0.35%～0.45% + 0.1<small>含本站 0.05%</small></b></div>' +
      '<div><span>单笔</span><b>10～50,000</b></div>' +
      "</div>" +
      '<p class="gbx-note"><b>这是第三方服务，不是本站，也不是官方桥。</b>你的币进的是 GaleBridge 的合约，由它在目标链付给你。小窗里的报价是 GaleBridge 收的那部分。</p>' +
      '<div class="gbx-w" id="gbx-w"></div>' +
      '<p class="gbx-st" id="gbx-st" role="status"></p>' +
      "</div>";
    mount(id);
  }
  A.gale = { mount: draw, unmount: unmount };
  // 老网址 #/gale：转到跨链桥页并选好秒到通道
  A.pages.gale = function () {
    try { sessionStorage.setItem("u2d:mode", "fast"); } catch (e) { /* 存不了就落在本站通道，客户自己点一下 */ }
    location.replace("#/usdt");
  };
})();
