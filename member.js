// 会员：用钱包签名注册，付 Anubis LGNS / Anubis AiLGNS / Polygon DAI 开通。初级 VIP 20 美元永久；高级 VIP（尊享级）1000 美元终生，多出导出数据和结构图优先刷新
(function () {
  "use strict";

  var A = window.AIL;
  var RECEIVER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 两条链都收到这个地址
  var FEE_USD = 20; // 初级 VIP：20 美元等值，永久
  var PRO_USD = 1000; // 高级 VIP（尊享级）：1000 美元等值，终生；初级补 980 升级
  var TIERS = { basic: { name: "初级 VIP", short: "初级" }, pro: { name: "高级 VIP · 尊享级", short: "高级" } };
  var START_BLOCK = 17790000; // Anubis：会员功能上线前的转账不算
  var POLY_START = 96420000; // Polygon：多付款方式上线前的转账不算
  var POLY_LOOKBACK = 14 * 43200; // Polygon 按地址找付款时最多往回查 14 天（约 2 秒一个块）
  var EXPLORER_API = "https://browser.anubispace.org/api";
  var EXPLORER = "https://anubisscan.io";
  var ETHERS = "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js";
  var KEY = "ailgns-member-v1";
  var TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  var CHAINS = {
    anubis: {
      name: "Anubis", explorer: EXPLORER, gas: "DAI",
      params: { chainId: "0x1a3a", chainName: "Anubis Chain", nativeCurrency: { name: "gasDAI", symbol: "DAI", decimals: 18 }, rpcUrls: ["https://rpc.anubispace.org"], blockExplorerUrls: [EXPLORER] }
    },
    polygon: {
      name: "Polygon", explorer: "https://polygonscan.com", gas: "POL", rpc: "https://polygon-bor-rpc.publicnode.com",
      params: { chainId: "0x89", chainName: "Polygon", nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, rpcUrls: ["https://polygon-bor-rpc.publicnode.com"], blockExplorerUrls: ["https://polygonscan.com"] }
    }
  };

  // 三种付款方式：都按美元等值、实时价格折算
  var METHODS = [
    { id: "lgns", symbol: "LGNS", chain: "anubis", token: "0x4D1D808a081FdAc440703b3765FC61f8028C06B8", dec: 9, digits: 0, tol: 0.97, price: function (b) { return pairPrice("0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", 9, b); } },
    { id: "ailgns", symbol: "AiLGNS", chain: "anubis", token: "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", dec: 18, digits: 4, tol: 0.97, price: function (b) { return pairPrice("0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", 18, b); } },
    { id: "dai", symbol: "DAI", chain: "polygon", token: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", dec: 18, digits: 2, tol: 0.999, price: function () { return Promise.resolve(1); } }
  ];
  function method(id) { return METHODS.filter(function (m) { return m.id === id; })[0] || METHODS[0]; }

  // ---------- 读链 ----------
  function rpcOn(chain, m, params) {
    if (chain === "anubis") return A.rpc(m, params);
    return fetch(CHAINS[chain].rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: params }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error.message); return j.result; });
  }
  // Uniswap V2 式交易对：token0 是被定价的币，token1 是 DAI
  function pairPrice(pair, dec0, block) {
    return A.rpc("eth_call", [{ to: pair, data: "0x0902f1ac" }, block ? "0x" + block.toString(16) : "latest"]).then(function (h) {
      return (Number(A.word(h, 1)) / 1e18) / (Number(A.word(h, 0)) / Math.pow(10, dec0));
    });
  }
  // 需要多少枚（向上取整到这个币的显示精度）
  function need(m, price, usd) { var k = Math.pow(10, m.digits); return Math.ceil((usd || FEE_USD) / price * k) / k; }
  function units(m, amount) { return BigInt(Math.round(amount * Math.pow(10, m.digits))) * 10n ** BigInt(m.dec - m.digits); }
  function show(m, amount) { return A.fmt(amount, m.digits) + " " + m.symbol; }

  // 一笔转账值多少美元：按付款那个区块之前的价格算（价格容差记在付款方一边）
  function value(m, amount, block, tx) {
    return m.price(m.chain === "anubis" ? block - 1 : null).then(function (p) {
      return { method: m.id, chain: m.chain, tx: tx, block: block, paid: amount, usd: amount * p / m.tol };
    });
  }
  // 累计付款决定等级：满 20 美元初级，满 1000 美元高级（初级补 980 即可升级）
  function tierOf(usd) { return usd >= PRO_USD ? "pro" : usd >= FEE_USD ? "basic" : null; }
  function tally(list) {
    var seen = {}, payments = [];
    list.forEach(function (p) { if (p && !seen[p.tx]) { seen[p.tx] = 1; payments.push(p); } });
    var usd = payments.reduce(function (t, p) { return t + p.usd; }, 0);
    return { payments: payments, usd: usd, tier: tierOf(usd) };
  }

  // 按地址找以前的付款：Anubis 用浏览器接口，Polygon 用节点分段查日志
  function findAnubis(addr, m) {
    var url = EXPLORER_API + "?module=account&action=tokentx&address=" + addr + "&contractaddress=" + m.token + "&startblock=" + START_BLOCK + "&page=1&offset=200&sort=asc";
    return A.getJSON(url).then(function (r) {
      var txs = (r.result || []).filter(function (t) { return t.from.toLowerCase() === addr && t.to.toLowerCase() === RECEIVER; });
      return A.pool(txs, 4, function (t) { return value(m, Number(t.value) / Math.pow(10, m.dec), Number(t.blockNumber), t.hash); });
    });
  }
  function findPolygon(addr, m) {
    return rpcOn("polygon", "eth_blockNumber", []).then(function (h) {
      var latest = parseInt(h, 16), from = Math.max(POLY_START, latest - POLY_LOOKBACK), ranges = [];
      for (var b = latest; b >= from; b -= 10000) ranges.push([Math.max(from, b - 9999), b]);
      return A.pool(ranges, 4, function (r) {
        return rpcOn("polygon", "eth_getLogs", [{ address: m.token, fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16), topics: [TRANSFER, "0x" + A.pad(addr), "0x" + A.pad(RECEIVER)] }]);
      });
    }).then(function (chunks) {
      var logs = [].concat.apply([], chunks.filter(Boolean));
      return Promise.all(logs.map(function (l) { return value(m, Number(BigInt(l.data)) / 1e18, parseInt(l.blockNumber, 16), l.transactionHash); }));
    });
  }
  // 找到这个地址的全部付款并算出等级；一笔都没有返回 null
  // 站长手动开通的会员：赠送，或者付款方式不对但钱已收到；会和链上找到的付款一起累计，之后补差价照样能升级
  var MANUAL = {
    "0x6b26fa44754ef4927f0b1aec486ea6bea730a48a": { usd: PRO_USD, note: "赠送" },
    "0x573a0a61a2d6946c7033ec12aba79b70d1da290c": { usd: PRO_USD, note: "赠送" },
    "0xb23aadf2367746f1a3db36a618c6d6f097e5c6e7": { usd: FEE_USD, note: "手动开通（Anubis 链 DAI 20 枚）", chain: "anubis", tx: "0x384b455267ede4b3e0bfdf89435c6bf0ebf14640776ff39a044580119a1b20cf" }
  };
  function findPayment(addr) {
    var manual = MANUAL[addr.toLowerCase()];
    var tries = METHODS.map(function (m) { return (m.chain === "anubis" ? findAnubis(addr, m) : findPolygon(addr, m)).catch(function () { return []; }); });
    return Promise.all(tries).then(function (r) {
      var list = [].concat.apply([], r);
      if (manual) list.push({ method: "manual", chain: manual.chain || "anubis", tx: manual.tx || "manual:" + addr.toLowerCase(), note: manual.note, paid: 0, usd: manual.usd });
      var t = tally(list);
      return t.payments.length ? t : null;
    });
  }

  // 从交易回执里直接确认一笔付款（钱包付款、或者用户填交易哈希）
  function paymentFromReceipt(chain, r, addr) {
    var checks = METHODS.filter(function (m) { return m.chain === chain; }).map(function (m) {
      var log = (r.logs || []).filter(function (l) {
        return l.address.toLowerCase() === m.token.toLowerCase() && l.topics[0] === TRANSFER &&
          "0x" + l.topics[1].slice(26) === addr && "0x" + l.topics[2].slice(26) === RECEIVER;
      })[0];
      return log ? value(m, Number(BigInt(log.data)) / Math.pow(10, m.dec), parseInt(r.blockNumber, 16), r.transactionHash) : null;
    });
    return Promise.all(checks).then(function (x) { return x.filter(Boolean)[0] || null; });
  }
  function verifyHash(addr, hash) {
    var chains = ["anubis", "polygon"], i = 0;
    function next() {
      if (i >= chains.length) return Promise.resolve(null);
      var c = chains[i++];
      return rpcOn(c, "eth_getTransactionReceipt", [hash]).then(function (r) {
        return r && r.status === "0x1" ? paymentFromReceipt(c, r, addr) : null;
      }, function () { return null; }).then(function (p) { return p || next(); });
    }
    return next();
  }

  // ---------- 会员状态（存在本浏览器） ----------
  function member() {
    try {
      var m = JSON.parse(localStorage.getItem(KEY));
      if (m && !m.tier) { // 分级之前开通的会员：按初级 20 美元记
        m.tier = m.method === "gift" ? "pro" : "basic";
        m.payments = m.tx ? [{ method: m.method, chain: m.chain, tx: m.tx, block: m.block, paid: m.paid, usd: FEE_USD }] : [];
        m.usd = m.method === "gift" ? PRO_USD : FEE_USD;
        if (m.method === "gift") m.gift = true;
      }
      return m;
    } catch (e) { return null; }
  }
  function isPro() { var m = member(); return !!(m && m.tier === "pro"); }
  function saveMember(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* 隐私模式不保存 */ } }
  function logout() { try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } }

  function loadEthers() {
    if (window.ethers) return Promise.resolve(window.ethers);
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = ETHERS;
      s.onload = function () { ok(window.ethers); };
      s.onerror = function () { fail(new Error("签名校验组件加载失败")); };
      document.head.appendChild(s);
    });
  }
  function utf8Hex(str) {
    return "0x" + Array.from(new TextEncoder().encode(str)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // ---------- 钱包：注册（签名）与付款 ----------
  var CHAIN = CHAINS.anubis.params; // otc.js 用的是 Anubis 链
  // 当前选中的钱包（由 wallets.js 自动识别、让用户选择）
  function wallet() {
    var p = A.wallets.current();
    if (!p) throw new Error("请先连接钱包");
    return p;
  }
  function walletError(e) {
    if (e && (e.code === 4001 || /reject|denied|cancel/i.test(e.message || ""))) return "你在钱包里取消了操作";
    return (e && (e.message || e.reason)) || "操作失败，请重试";
  }

  // 第 1 步：连接钱包并签名，证明这个地址是你的（不花钱、不授权）
  function register(status) {
    var eth, addr, msg, sig;
    return A.wallets.choose().then(function (p) {
      eth = p;
      status("请在 " + (A.wallets.name() || "钱包") + " 里确认连接…");
      return eth.request({ method: "eth_requestAccounts" });
    }).then(function (accs) {
      addr = String(accs[0]).toLowerCase();
      msg = "AiLGNS 服务站会员注册\n地址：" + addr + "\n时间：" + new Date().toISOString() + "\n此签名只用于确认身份，不会发起交易，也不会授权任何代币。";
      status("请在钱包里签名（不花钱、不授权）…");
      return eth.request({ method: "personal_sign", params: [utf8Hex(msg), addr] });
    }).then(function (s) {
      sig = s;
      status("正在校验签名…");
      return loadEthers();
    }).then(function (ethers) {
      if (ethers.verifyMessage(msg, sig).toLowerCase() !== addr) throw new Error("签名和地址对不上，请重试");
      return { addr: addr, msg: msg, sig: sig };
    });
  }

  function switchTo(eth, chain) {
    var params = CHAINS[chain || "anubis"].params;
    return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: params.chainId }] }).catch(function (e) {
      if (e && (e.code === 4902 || /unrecognized|not added|unknown chain/i.test(e.message || ""))) {
        return eth.request({ method: "wallet_addEthereumChain", params: [params] });
      }
      throw e;
    });
  }
  function switchChain(eth) { return switchTo(eth, "anubis"); }
  function waitOn(chain, hash) {
    var tries = 0;
    return new Promise(function (ok, fail) {
      (function poll() {
        rpcOn(chain, "eth_getTransactionReceipt", [hash]).then(function (r) {
          if (r) return r.status === "0x1" ? ok(r) : fail(new Error("转账失败（交易被链上拒绝）"));
          if (++tries > 90) return fail(new Error("等了 3 分钟还没确认，请稍后用交易哈希验证"));
          setTimeout(poll, 2000);
        }, function () { setTimeout(poll, 3000); });
      })();
    });
  }
  function waitReceipt(hash) { return waitOn("anubis", hash); }

  // 第 2 步：用钱包直接付款（切到对应的链 → 转账 → 等确认）；usd：这次要付多少美元
  function pay(reg, m, status, usd) {
    var eth = wallet(), n, chain = CHAINS[m.chain];
    status("正在切换到 " + chain.name + " 链…");
    return switchTo(eth, m.chain).then(function () {
      return Promise.all([m.price(), rpcOn(m.chain, "eth_call", [{ to: m.token, data: "0x70a08231" + A.pad(reg.addr) }, "latest"])]);
    }).then(function (r) {
      n = need(m, r[0], usd);
      var bal = Number(BigInt(r[1])) / Math.pow(10, m.dec);
      if (bal < n) throw new Error(chain.name + " 链上的钱包里只有 " + show(m, bal) + "，需要 " + show(m, n));
      status("请在钱包里确认转账 " + show(m, n) + "（Gas 用 " + chain.gas + "）…");
      var data = "0xa9059cbb" + A.pad(RECEIVER) + units(m, n).toString(16).padStart(64, "0");
      return eth.request({ method: "eth_sendTransaction", params: [{ from: reg.addr, to: m.token, data: data }] });
    }).then(function (hash) {
      status("已提交，等待 " + chain.name + " 链确认…（通常几秒钟）");
      return waitOn(m.chain, hash);
    }).then(function (r) {
      return paymentFromReceipt(m.chain, r, reg.addr);
    }).then(function (p) {
      if (!p) throw new Error("转账已确认，但没找到这笔付款。请联系站长核对");
      return p;
    });
  }

  // 把新付款合进已有付款，重新算等级后保存
  function activate(reg, sum) {
    var old = member(), prev = old && old.addr === reg.addr ? old.payments || [] : [];
    var t = sum.gift ? sum : tally(prev.concat(sum.payments || []));
    if (!t.tier) return null;
    saveMember({ addr: reg.addr, msg: reg.msg, sig: reg.sig, tier: t.tier, usd: t.usd, payments: t.payments, gift: !!sum.gift, at: Date.now() });
    warmTree(reg.addr);
    return t;
  }
  // 提前让服务器把结构图算好：会员一打开网站就悄悄预热，等点进结构图时已经是现成的；高级会员优先刷新
  function warmTree(a) {
    try { fetch("/api/tree?root=" + a.toLowerCase() + (isPro() ? "&tier=pro" : ""), { keepalive: true }).catch(function () {}); } catch (e) { /* 忽略 */ }
  }

  // 两个等级各自有什么
  var PERKS = {
    basic: ["团队与等级（你自己的付款地址）", "团队新增业绩：今天、昨天、近 7 天", "团队结构图：定位、筛选、逐层展开", "结构图每 30 分钟更新"],
    pro: ["包含初级 VIP 全部功能", "导出全部数据：结构图长图、完整名单 CSV、新增业绩表格", "结构图优先刷新：每 5 分钟更新", "尊享级标识，一次付款终生有效"]
  };
  function perkList(t) { return '<ul class="perks">' + PERKS[t].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"; }
  function tierBadge(t) { return '<span class="vip vip-' + t + '">' + TIERS[t].name + "</span>"; }

  // ---------- 页面：会员 ----------
  function renderMember(id) {
    var app = A.app, m = member();
    var head = '<h1>会员</h1><p class="sub">用自己的钱包注册、付款开通，绑定你的钱包。开通后可以查看你自己（付款钱包）的「团队与等级」「团队新增业绩」，并画出你的团队结构图。</p>';
    if (m && m.tier === "pro") {
      app.innerHTML = head + memberCard(m) + '<section class="card"><div class="card-head"><h2>高级权益</h2><span class="muted">终生有效</span></div>' + perkList("pro") + "</section>";
      return;
    }
    // 未开通：选等级再付款；初级会员：补差价升级
    var upgrade = !!m, plan = upgrade ? "pro" : "basic";
    app.innerHTML = head + (upgrade ? memberCard(m) : "") + '<div class="loading">正在读取实时价格…</div>';
    Promise.all(METHODS.map(function (x) { return x.price().catch(function () { return null; }); })).then(function (prices) {
      if (!A.isCurrent(id)) return;
      function usdNow() { return upgrade ? PRO_USD - FEE_USD : plan === "pro" ? PRO_USD : FEE_USD; }
      var pick = METHODS.filter(function (x, i) { return prices[i]; })[0] || METHODS[0];
      function needOf(x) { var i = METHODS.indexOf(x); return prices[i] ? need(x, prices[i], usdNow()) : null; }

      var plans = upgrade
        ? '<section class="card plan-up"><div class="card-head"><h2>升级 ' + TIERS.pro.name + '</h2><span class="muted">你已付 ' + FEE_USD + " 美元，补差价即可</span></div>" +
          '<div class="plan-price"><b class="num">' + (PRO_USD - FEE_USD) + '</b><small>美元等值 · 终生</small></div>' + perkList("pro") + "</section>"
        : '<div class="plans">' +
          '<button class="plan on" data-plan="basic"><span class="plan-name">' + TIERS.basic.name + '</span><span class="plan-price"><b class="num">' + FEE_USD + '</b><small>美元等值 · 永久</small></span>' + perkList("basic") + "</button>" +
          '<button class="plan plan-pro" data-plan="pro"><span class="plan-tag">尊享级专用</span><span class="plan-name">' + TIERS.pro.name + '</span><span class="plan-price"><b class="num">' + PRO_USD + '</b><small>美元等值 · 终生</small></span>' + perkList("pro") + "</button></div>" +
          '<p class="note">先开初级也可以，以后补 ' + (PRO_USD - FEE_USD) + " 美元差价升级高级。</p>";

      app.innerHTML = head + (upgrade ? memberCard(m) : "") + plans +
        '<section class="card"><div class="card-head"><h2>选择付款方式</h2><span class="muted" id="pay-usd"></span></div><div class="paylist">' +
        METHODS.map(function (x, i) {
          var c = CHAINS[x.chain];
          return '<button class="payopt' + (x === pick ? " on" : "") + '" data-m="' + x.id + '"' + (prices[i] ? "" : " disabled") + '>' +
            '<span class="payopt-tok">' + x.symbol + '</span><span class="payopt-chain">' + c.name + ' 链</span>' +
            '<b class="num" data-amt="' + x.id + '">—</b><small>' + (x.id === "dai" ? "稳定币，1 DAI = 1 美元" : "单价 " + A.fmt(prices[i], x.digits ? 2 : 5) + " DAI") + "</small></button>";
        }).join("") + "</div></section>" +
        '<section class="card"><div class="card-head"><h2>' + (upgrade ? "用钱包升级" : "用钱包开通") + "</h2>" + (upgrade ? "" : '<a href="#/tree">先看看效果 →</a>') + "</div>" +
        '<div class="flow"><div class="flow-step" id="s1"><b>1</b><div><div class="flow-t">连接钱包，签名' + (upgrade ? "确认身份" : "注册") + '</div><div class="muted">证明钱包是你的。只是签一段文字：<b>不花钱、不授权、不发交易</b>。已经付过款的，签完直接' + (upgrade ? "升级" : "开通") + "。</div></div></div>" +
        '<div class="flow-step" id="s2"><b>2</b><div><div class="flow-t" id="s2t"></div><div class="muted" id="s2d"></div></div></div></div>' +
        '<button id="go" style="padding:12px 22px;margin-top:4px">连接钱包</button><p class="note" id="st"></p>' +
        '<p class="note">手机上请在 <b>OKX、Bitget Wallet、TokenPocket、MetaMask</b> 等钱包的「DApp 浏览器 / 发现」里打开 <b>ailgns.dev</b>。电脑上需要装浏览器插件钱包。</p></section>' +
        '<details class="card manual"><summary>不方便用 DApp 浏览器？手动转账也可以</summary><ol class="steps" style="margin-top:12px">' +
        '<li id="man1"></li>' +
        '<li>收款地址（Anubis 和 Polygon 都是这个）：<div class="copy"><span class="mono" id="recv">' + RECEIVER + '</span><button class="ghost" id="copy">复制</button></div></li>' +
        "<li>转完后用<b>付款的那个钱包</b>打开本页，点「连接钱包」签名，会自动找到你的全部付款并按累计金额开通（Polygon 付款自动查找最近 14 天）。</li>" +
        '<li>找不到的话，把付款的交易哈希贴在这里验证，分几笔付的可以一次贴多个（用空格或换行隔开）：<div class="copy"><textarea id="txh" class="mono" rows="2" placeholder="0x…" spellcheck="false"></textarea><button class="ghost" id="txgo">验证</button></div></li></ol></details>' +
        '<p class="note">本站为独立运营的服务站，会员费由本站收取，与 AWAKE HELIX 项目方无关。只收上面三种币，转错币或转错链无法开通，也无法退回。本站不会向你索取私钥或助记词；除了你自愿付的会员费，任何以本站名义要求转账、授权的都是诈骗。</p>';

      var st = document.getElementById("st"), go = document.getElementById("go"), reg = null;
      if (upgrade && m.sig) reg = { addr: m.addr, msg: m.msg, sig: m.sig };
      function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; }
      function done(step) { var el = document.getElementById(step); if (el) el.classList.add("ok"); }
      function describe() {
        METHODS.forEach(function (x) { var n = needOf(x), el = app.querySelector('[data-amt="' + x.id + '"]'); if (el) el.textContent = n ? A.fmt(n, x.digits) : "—"; });
        document.getElementById("pay-usd").textContent = "已按实时价格折算成 " + usdNow() + " 美元";
        var c = CHAINS[pick.chain], amt = show(pick, needOf(pick));
        document.getElementById("s2t").textContent = "钱包付款 " + amt + "（" + c.name + " 链）";
        document.getElementById("s2d").textContent = "自动切到 " + c.name + " 链，在钱包里确认一笔 " + pick.symbol + " 转账，Gas 用 " + c.gas + "。确认后几秒钟自动" + (upgrade ? "升级" : "开通") + "。";
        document.getElementById("man1").innerHTML = "在 <b>" + c.name + " 链</b>上转 <b>" + amt + "</b>（合约 " + A.short(pick.token) + "）";
        if (reg) go.textContent = "付款 " + amt;
      }
      describe();
      app.querySelectorAll(".plan").forEach(function (b) {
        b.onclick = function () {
          plan = b.getAttribute("data-plan");
          app.querySelectorAll(".plan").forEach(function (x) { x.classList.toggle("on", x === b); });
          describe();
        };
      });
      app.querySelectorAll(".payopt").forEach(function (b) {
        b.onclick = function () {
          pick = method(b.getAttribute("data-m"));
          app.querySelectorAll(".payopt").forEach(function (x) { x.classList.toggle("on", x === b); });
          describe();
        };
      });
      document.getElementById("copy").onclick = function () {
        var b = this;
        (navigator.clipboard ? navigator.clipboard.writeText(RECEIVER) : Promise.reject()).then(function () { b.textContent = "已复制"; }, function () {
          var r = document.createRange(); r.selectNodeContents(document.getElementById("recv"));
          var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "已选中，请复制";
        });
      };
      function ensureReg() {
        return reg ? Promise.resolve(reg) : register(say).then(function (r) { reg = r; done("s1"); return r; });
      }
      // 开通或升级成功：达到想要的等级就跳走，否则说明还差多少
      function finish(r, sum) {
        var t = activate(r, sum);
        if (!t) { say("已找到你的付款，累计约 " + A.fmt(sum.usd || 0, 2) + " 美元，还不够开通初级 VIP（" + FEE_USD + " 美元）", true); return false; }
        var want = upgrade || plan === "pro" ? "pro" : "basic";
        if (want === "pro" && t.tier !== "pro") {
          say("已开通" + TIERS[t.tier].name + "（累计约 " + A.fmt(t.usd, 2) + " 美元）。升级高级还差约 " + A.fmt(PRO_USD - t.usd, 2) + " 美元。");
          setTimeout(function () { renderMember(id); subnav(); }, 1500);
          return true;
        }
        say(TIERS[t.tier].name + " 已开通！");
        subnav();
        setTimeout(function () { location.hash = "#/tree"; }, 800);
        return true;
      }
      document.getElementById("txgo").onclick = function () {
        var hs = (document.getElementById("txh").value.match(/0x[0-9a-fA-F]{64}/g) || []), btn = this;
        if (!hs.length) { say("交易哈希格式不对，应该是 0x 开头的 66 位", true); return; }
        btn.disabled = true;
        ensureReg().then(function (r) {
          say("正在核对 " + hs.length + " 笔交易…");
          return Promise.all(hs.map(function (h) { return verifyHash(r.addr, h.toLowerCase()); })).then(function (ps) {
            ps = ps.filter(Boolean);
            if (!ps.length) throw new Error("这些交易不是从你的钱包转给收款地址的");
            if (!finish(r, tally(ps))) btn.disabled = false;
          });
        }).catch(function (e) { say(walletError(e), true); btn.disabled = false; });
      };
      go.onclick = function () {
        go.disabled = true;
        var step = reg ? Promise.resolve(reg) : ensureReg().then(function (r) {
          say("签名成功，正在查找你之前的付款…");
          return findPayment(r.addr).catch(function () { return null; }).then(function (sum) {
            if (sum && sum.tier) {
              var want = upgrade || plan === "pro" ? "pro" : "basic";
              activate(r, sum);
              if (sum.tier === "pro" || want === "basic") { finish(r, sum); throw null; }
              upgrade = true; // 已是初级，接着补差价
              say("你已经是初级 VIP，继续付款补差价升级高级。");
            }
            return r;
          });
        });
        step.then(function (r) {
          describe();
          if (!st.textContent) say("已确认 " + A.short(r.addr) + "。确认上面选的付款方式，点按钮用钱包付款。");
          go.disabled = false;
          go.onclick = function () {
            go.disabled = true;
            pay(r, pick, say, usdNow()).then(function (p) {
              done("s2");
              if (!finish(r, { payments: [p] })) go.disabled = false;
            }, function (e) { say(walletError(e), true); go.disabled = false; });
          };
        }, function (e) {
          if (e === null) return; // 已经付过款，直接跳转
          say(walletError(e), true); go.disabled = false;
        });
      };
    }, function () {
      if (A.isCurrent(id)) app.innerHTML = head + '<div class="card err">价格暂时读不到，请稍后刷新。</div>';
    });
  }
  function memberCard(m) {
    var pays = m.gift ? "赠送" + TIERS[m.tier].name + "（终生）" : (m.payments || []).map(function (p) {
      var pm = method(p.method), pc = CHAINS[p.chain || "anubis"];
      if (p.method === "manual") return A.esc(p.note) + (/^0x/.test(p.tx) ? ' <a target="_blank" rel="noopener" href="' + pc.explorer + "/tx/" + p.tx + '">交易 ↗</a>' : "");
      return show(pm, p.paid) + "（" + pc.name + '） <a target="_blank" rel="noopener" href="' + pc.explorer + "/tx/" + p.tx + '">交易 ↗</a>';
    }).join("<br>") + (m.payments && m.payments.length > 1 ? "<br><span class=\"muted\">累计约 " + A.fmt(m.usd, 2) + " 美元</span>" : "");
    return '<section class="card"><div class="card-head"><h2>✓ 你已经是 ' + tierBadge(m.tier) + '</h2><span class="muted">本浏览器已验证</span></div><dl class="dl">' +
      "<dt>会员钱包</dt><dd>" + A.addrLink(m.addr) + "</dd><dt>付款</dt><dd>" + pays + "</dd></dl>" +
      '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><a class="btn" style="padding:10px 18px" href="#/tree">去画结构图 →</a><button class="ghost" id="logout" style="padding:10px 18px">退出</button></div>' +
      '<p class="note">换浏览器或换手机时，用同一个钱包点「连接钱包」再登录一次就行，不用重复付款。</p></section>';
  }
  // 退出按钮：页面会重画（比如价格读完后），所以在 document 上统一监听，按钮换了也照样有效
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#logout")) return;
    e.preventDefault();
    logout();
    A.ownOnly = null;
    subnav();
    window.dispatchEvent(new HashChangeEvent("hashchange")); // 重新渲染当前页面
  });
  // 初级会员看到的高级功能按钮上加个小标记
  function proMark(b) { if (b && member() && !isPro() && !b.querySelector(".vip-mini")) b.insertAdjacentHTML("beforeend", ' <span class="vip-mini">高级</span>'); }
  // 高级专属：初级会员点导出时弹出升级提示
  function proOnly(fn) {
    return function () {
      if (!member() || isPro()) return fn.apply(this, arguments);
      var box = document.createElement("div");
      box.className = "modal";
      box.innerHTML = '<div class="modal-box"><div class="card-head"><h2>高级 VIP 专属</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
        "<p>导出图片、完整名单和表格是 " + TIERS.pro.name + " 的功能。你已付 " + FEE_USD + " 美元，补 <b>" + (PRO_USD - FEE_USD) + " 美元</b>差价即可终生升级。</p>" + perkList("pro") +
        '<a class="btn" href="#/member" data-close style="padding:12px 18px;text-align:center">去升级 →</a></div>';
      document.body.appendChild(box);
      box.addEventListener("click", function (e) { if (e.target === box || e.target.closest("[data-close]")) box.remove(); });
    };
  }

  // ---------- 页面：结构图 ----------
  var NODE_W = 220, NODE_H = 66, GAP_X = 64, GAP_Y = 14, MAX_CHILDREN = 30;
  var COLORS = { bg: "#f8f8ff", node: "#ffffff", line: "#cfc4ee", text: "#191839", muted: "#6e6a85", gold: "#7027d9", up: "#16a34a", chip: "#efeaf9" };

  function loadNode(a) {
    return Promise.all([A.api("/community/" + a), A.api("/level/" + a).catch(function () { return null; })]).then(function (r) {
      var c = r[0], l = r[1];
      return { a: a.toLowerCase(), level: l ? l.level : 0, team: A.n(c.team), power: A.n(c.teamActivePower), self: l ? A.n(l.selfPower) : 0, direct: A.n(c.direct), children: null, expanded: false };
    });
  }
  function loadChildren(node) {
    return A.allReferrals(node.a, 300).then(function (refs) {
      return A.pool(refs.list, 6, loadNode).then(function (kids) {
        kids = kids.filter(Boolean).sort(function (x, y) { return y.power - x.power || y.team - x.team; });
        // 没有团队、没有等级的直推不单独画，合并成一个"还有 N 个"
        var shown = kids.filter(function (k) { return k.team > 0 || k.level > 0; }).slice(0, MAX_CHILDREN);
        node.more = Math.max(0, refs.total - shown.length);
        node.children = shown;
        node.children.forEach(function (k, i) { k.zone = i < 3 && k.power > 0 ? i + 1 : 0; });
      });
    });
  }

  // 完整团队结构：服务器已经算好每个人的上级、算力、等级（/api/tree，存在 KV 里，一般 0.1 秒内返回）
  // 8 万个地址以上的超大团队：GitHub Actions 生成压缩二进制文件，从 /api/bigtree 下载
  // 服务器暂时不可用时，退回到旧办法：拿团队名单，在浏览器里批量读算力和等级
  // 结果统一是 A.treeMap.team() 的定长数组结构
  var POWER_OF = "0x4f343040"; // totalPowerOf(address)：已登记算力（含排队中的），和官方「团队算力」口径接近
  function fullTree(root, progress) {
    return fetch("/api/tree?root=" + root + (isPro() ? "&tier=pro" : "")).then(function (r) {
      if (!r.ok) throw new Error("tree " + r.status);
      return r.json();
    }).then(function (t) {
      if (t.big) return bigTree(root, progress);
      if (t.v !== 3) throw new Error("old tree format");
      return fromList(root, t.list, [t.rootPower].concat(t.list.map(function (x) { return x[4]; })), [t.rootLevel].concat(t.list.map(function (x) { return x[5]; })), t.at);
    }).catch(function (e) { if (e && e.building) throw e; return fullTreeInBrowser(root, progress); });
  }
  // 超大团队：边下载边显示进度；还没生成好时抛出 {building: true}
  function bigTree(root, progress) {
    if (progress) progress("团队超过 8 万个地址，正在下载完整数据…");
    return fetch("/api/bigtree?root=" + root).then(function (r) {
      if (r.status === 404) throw { building: true };
      if (!r.ok) throw new Error("bigtree " + r.status);
      if (!r.body || !r.body.getReader) return r.arrayBuffer();
      var reader = r.body.getReader(), parts = [], got = 0;
      return (function pump() {
        return reader.read().then(function (x) {
          if (x.done) {
            var out = new Uint8Array(got), o = 0;
            parts.forEach(function (p) { out.set(p, o); o += p.length; });
            return out.buffer;
          }
          parts.push(x.value); got += x.value.length;
          if (progress) progress("正在下载团队数据… " + (got / 1048576).toFixed(1) + " MB");
          return pump();
        });
      })();
    }).then(function (buf) {
      if (progress) progress("正在整理团队结构…");
      return A.treeMap.fromBinary(buf);
    });
  }
  // list：[地址, 直推线, 层级, 上级位置(-1=root)]；pw / lv：按 [root].concat(list) 的顺序
  function fromList(root, list, pw, lv, at) {
    var n = list.length + 1, parent = new Int32Array(n), self = new Float64Array(n), level = new Uint8Array(n);
    parent[0] = -1; self[0] = pw[0] || 0; level[0] = lv ? lv[0] || 0 : 0;
    list.forEach(function (x, i) { parent[i + 1] = x[3] + 1; self[i + 1] = pw[i + 1] || 0; level[i + 1] = lv ? lv[i + 1] || 0 : 0; });
    return A.treeMap.team({ n: n, addr: A.treeMap.hexBytes([root].concat(list.map(function (x) { return x[0]; }))), parent: parent, self: self, level: level, at: at });
  }
  function fullTreeInBrowser(root, progress) {
    return fetch("/api/team?root=" + root).then(function (r) {
      if (!r.ok) throw new Error("team " + r.status);
      return r.json();
    }).then(function (c) {
      if (c.v !== 2) throw new Error("old team format");
      var all = [root].concat(c.list.map(function (x) { return x[0]; }));
      if (progress) progress("正在读取 " + A.fmt(all.length) + " 个地址的算力…");
      var calls = all.map(function (a) { return ["eth_call", [{ to: POWER, data: POWER_OF + A.pad(a) }, "latest"]]; }), chunks = [];
      for (var i = 0; i < calls.length; i += 300) chunks.push(calls.slice(i, i + 300));
      return A.pool(chunks, 4, batchRpc).then(function (parts) {
        var pw = [].concat.apply([], parts).map(function (h) { return h ? Number(BigInt(h.slice(0, 66))) / 1e18 : 0; });
        var D = fromList(root, c.list, pw, null, c.at);
        // 只给团队算力够大的人查官方等级（P1 至少要三个区各 5 万 DAI）
        var big = [];
        for (var j = 0; j < D.n; j++) if (D.power[j] >= 300000) big.push(j);
        big = big.sort(function (x, y) { return D.power[y] - D.power[x]; }).slice(0, 120);
        if (progress) progress("正在读取等级…");
        return A.pool(big, 6, function (j) {
          return A.api("/level/" + D.addr(j)).then(function (l) { D.level[j] = l.level || 0; }, function () {});
        }).then(function () { return D; });
      });
    });
  }

  // 从左到右的树：每个节点占的高度 = 展开后的叶子数
  function layout(root) {
    var nodes = [], edges = [], y = 0;
    function walk(n, depth) {
      n.x = depth * (NODE_W + GAP_X);
      var kids = n.expanded && n.children ? n.children.slice() : [];
      if (n.expanded && n.more) kids.push({ moreOf: n, count: n.more, x: 0 });
      if (!kids.length) { n.y = y; y += NODE_H + GAP_Y; }
      else {
        kids.forEach(function (k) { if (k.moreOf) { k.x = (depth + 1) * (NODE_W + GAP_X); k.y = y; y += NODE_H + GAP_Y; nodes.push(k); } else walk(k, depth + 1); edges.push([n, k]); });
        n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
      }
      nodes.push(n);
    }
    walk(root, 0);
    return { nodes: nodes, edges: edges, w: Math.max.apply(null, nodes.map(function (n) { return n.x; })) + NODE_W, h: y - GAP_Y };
  }

  function nodeSvg(n, root) {
    var e = A.esc;
    if (n.moreOf) {
      return '<g transform="translate(' + n.x + "," + n.y + ')"><rect width="' + NODE_W + '" height="' + NODE_H + '" rx="10" fill="none" stroke="' + COLORS.line + '" stroke-dasharray="5 4"/>' +
        '<text x="14" y="28" fill="' + COLORS.muted + '" font-size="13">还有 ' + A.fmt(n.count) + " 个直推</text>" +
        '<text x="14" y="48" fill="' + COLORS.muted + '" font-size="12">团队较小，没有画出（可用定位查找）</text></g>';
    }
    var stroke = n.hl ? "#ff7a1a" : n === root ? COLORS.gold : n.level ? COLORS.gold : COLORS.line;
    var badge = n.level ? "P" + n.level : "—";
    var zone = n.zone ? ["一区", "二区", "三区"][n.zone - 1] : "";
    var s = '<g class="node" data-a="' + n.a + '" transform="translate(' + n.x + "," + n.y + ')" style="cursor:' + (n.direct ? "pointer" : "default") + '">' +
      "<title>" + e(n.a) + "\n团队 " + A.fmt(n.team) + " 个地址 · 团队入金 " + A.fmt(A.toDai(n.power)) + " DAI · 直推 " + A.fmt(n.direct) + "</title>" +
      (n.hl ? '<rect x="-6" y="-6" width="' + (NODE_W + 12) + '" height="' + (NODE_H + 12) + '" rx="14" fill="rgba(255,122,26,.16)"/>' : "") +
      '<rect width="' + NODE_W + '" height="' + NODE_H + '" rx="10" fill="' + (n.hl ? "#fff7ef" : COLORS.node) + '" stroke="' + stroke + '" stroke-width="' + (n.hl ? 3 : n === root ? 2 : 1.2) + '"/>' +
      '<text x="14" y="23" fill="' + COLORS.text + '" font-size="13" font-family="ui-monospace,Menlo,Consolas,monospace" font-weight="600">' + A.short(n.a) + "</text>" +
      '<rect x="' + (NODE_W - 48) + '" y="9" width="36" height="19" rx="5" fill="' + (n.level ? COLORS.gold : COLORS.chip) + '"/>' +
      '<text x="' + (NODE_W - 30) + '" y="23" text-anchor="middle" fill="' + (n.level ? "#fff" : COLORS.muted) + '" font-size="12" font-weight="700">' + badge + "</text>" +
      (zone ? '<text x="' + (NODE_W - 56) + '" y="23" text-anchor="end" fill="' + COLORS.gold + '" font-size="11">' + zone + "</text>" : "") +
      '<text x="14" y="43" fill="' + COLORS.muted + '" font-size="12">团队 <tspan fill="' + COLORS.text + '">' + A.fmt(n.team) + '</tspan> 个地址 · 入金 <tspan fill="' + COLORS.text + '">' + A.wan(A.toDai(n.power)).replace(" ", "") + "</tspan> DAI</text>" +
      '<text x="14" y="59" fill="' + COLORS.muted + '" font-size="12">直推 ' + A.fmt(n.direct) + (n.self ? " · 个人入金 " + A.wan(A.toDai(n.self)).replace(" ", "") : "") + "</text>";
    if (n.direct) { // 右边的 + / −：手机上手指好点，做大一点
      var open = n.expanded, plusFill = n.coach ? COLORS.gold : open ? COLORS.bg : "#efe8fd";
      s += (n.coach ? '<circle class="coach-ring" cx="' + NODE_W + '" cy="' + NODE_H / 2 + '" r="15" fill="none" stroke="' + COLORS.gold + '" stroke-width="3"/>' : "") +
        '<circle cx="' + NODE_W + '" cy="' + NODE_H / 2 + '" r="14" fill="' + plusFill + '" stroke="' + (n.coach ? COLORS.gold : "#b9a9ea") + '" stroke-width="1.5"/>' +
        '<text x="' + NODE_W + '" y="' + (NODE_H / 2 + 6) + '" text-anchor="middle" fill="' + (n.coach ? "#fff" : COLORS.gold) + '" font-size="19" font-weight="700">' + (n.loading ? "…" : open ? "−" : "+") + "</text>";
    }
    return s + "</g>";
  }

  function treeSvg(root) {
    var L = layout(root), pad = 24;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (L.w + pad * 2) + '" height="' + (L.h + pad * 2) + '" viewBox="' + -pad + " " + -pad + " " + (L.w + pad * 2) + " " + (L.h + pad * 2) + '" font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">' +
      '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="' + COLORS.line + '"/></marker></defs>';
    L.edges.forEach(function (e) {
      var a = e[0], b = e[1], x1 = a.x + NODE_W + 10, y1 = a.y + NODE_H / 2, x2 = b.x - 2, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2;
      s += '<path d="M' + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2 + '" fill="none" stroke="' + COLORS.line + '" stroke-width="1.4" marker-end="url(#arr)"/>';
    });
    L.nodes.forEach(function (n) { s += nodeSvg(n, root); });
    return { svg: s + "</svg>", w: L.w + pad * 2, h: L.h + pad * 2 };
  }

  // 平移缩放：鼠标拖动、滚轮缩放、双指缩放
  function panZoom(box, inner) {
    var k = 1, tx = 0, ty = 0, pts = {}, last = null, moved = false;
    function apply() { inner.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + k + ")"; }
    function zoomAt(f, cx, cy) {
      var nk = Math.min(3, Math.max(0.15, k * f));
      tx = cx - (cx - tx) * nk / k; ty = cy - (cy - ty) * nk / k; k = nk; apply();
    }
    box.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = box.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    box.addEventListener("pointerdown", function (e) { pts[e.pointerId] = [e.clientX, e.clientY]; moved = false; last = null; });
    box.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      var ids = Object.keys(pts), prev = pts[e.pointerId];
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (ids.length === 1) {
        var dx = e.clientX - prev[0], dy = e.clientY - prev[1];
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        if (moved) { box.setPointerCapture(e.pointerId); tx += dx; ty += dy; apply(); }
      } else if (ids.length === 2) {
        var p = pts[ids[0]], q = pts[ids[1]], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        var r = box.getBoundingClientRect();
        if (last) zoomAt(d / last, (p[0] + q[0]) / 2 - r.left, (p[1] + q[1]) / 2 - r.top);
        last = d; moved = true;
      }
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) last = null; }
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    return {
      zoom: function (f) { zoomAt(f, box.clientWidth / 2, box.clientHeight / 2); },
      // 优先看得清：最小缩到 0.5，太高的树从顶部开始，往下拖着看
      // focusY：图太高放不下时，把这一行（一般是自己）放在屏幕中间
      fit: function (w, h, focusY) {
        k = Math.max(0.5, Math.min(1, (box.clientWidth - 16) / w, (box.clientHeight - 16) / h));
        tx = Math.max(8, (box.clientWidth - w * k) / 2);
        ty = h * k < box.clientHeight ? (box.clientHeight - h * k) / 2 : focusY ? Math.min(8, Math.max(box.clientHeight - h * k - 8, box.clientHeight / 2 - focusY * k)) : 8;
        apply();
      },
      center: function (x, y, nk) {
        k = nk || Math.max(k, 0.9);
        tx = box.clientWidth / 2 - x * k; ty = box.clientHeight / 2 - y * k; apply();
      },
      shift: function (dx, dy) { tx += dx * k; ty += dy * k; apply(); }, // 画布坐标里移动 (dx, dy)
      // 从画布 x 开始、宽 w 的一段如果右边超出屏幕，就往左挪，但 x 不移出左边
      showRight: function (x, w) {
        var right = tx + (x + w) * k, over = right - (box.clientWidth - 8);
        if (over > 0) { tx -= Math.min(over, tx + x * k - 8); apply(); }
      },
      wasDrag: function () { return moved; }
    };
  }

  // 导出一张完整长图：当前展开的整棵树画在一张图上。
  // 手机浏览器一张画布最多约 1600 万像素（iPhone 的上限），边长最多 3.2 万像素，超出就整体缩小；缩得太小时提示字会偏小
  var MAX_AREA = 16000000, MAX_SIDE = 32000, HEAD = 72;
  function renderImages(root) {
    var t = treeSvg(root), count = 0;
    (function walk(n) { count++; if (n.expanded && n.children) n.children.forEach(walk); })(root);
    var w = t.w, h = t.h + HEAD;
    var scale = Math.min(2, 2400 / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
    var svg = t.svg.replace("<svg ", '<svg style="background:' + COLORS.bg + '" ');
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () {
        var W = Math.round(w * scale), H = Math.round(h * scale), c = document.createElement("canvas");
        c.width = W; c.height = H;
        var g = c.getContext("2d"), font = "-apple-system, PingFang SC, Microsoft YaHei, sans-serif";
        g.fillStyle = COLORS.bg; g.fillRect(0, 0, W, H);
        g.save(); g.scale(scale, scale);
        // 顶部标题
        g.fillStyle = COLORS.gold; g.fillRect(0, 0, w, 5);
        g.fillStyle = COLORS.text; g.font = "800 22px " + font; g.fillText("团队结构图", 24, 38);
        g.fillStyle = COLORS.muted; g.font = "500 14px " + font;
        g.fillText(A.short(root.a) + " · 团队 " + A.fmt(root.team) + " 个地址 · 团队入金 " + A.wan(A.toDai(root.power)).replace(" ", "") + " DAI · 图中展开了 " + A.fmt(count) + " 个地址", 24, 60);
        g.drawImage(img, 0, HEAD, t.w, t.h);
        g.restore();
        g.font = "600 " + Math.max(11, Math.round(13 * scale)) + "px " + font; g.fillStyle = "rgba(112, 39, 217, .6)"; g.textAlign = "right";
        g.fillText("AiLGNS 服务站 · ailgns.dev", W - 16, H - 14);
        var url = c.toDataURL("image/jpeg", 0.9);
        ok({ urls: [url], note: scale < 0.45 ? "展开的内容很多，为了放进一张图整体缩小了，图里的字会偏小，放大看。想要字更清楚，可以先「收起」一部分再导出。" : "" });
      };
      img.onerror = function () { fail(new Error("图片生成失败：展开的内容太多，请先收起一部分再导出")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }
  function dataUrlFile(url, name) {
    var bin = atob(url.split(",")[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: "image/jpeg" });
  }
  // 导出图片弹窗：make() 返回图片 dataURL 列表；手机长按保存或分享到微信
  function exportModal(name, make) {
    var box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = '<div class="modal-box export-box"><div class="card-head"><h2>导出图片</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div><div class="loading">正在生成图片…</div></div>';
    document.body.appendChild(box);
    box.addEventListener("click", function (e) { if (e.target === box || e.target.closest("[data-close]")) box.remove(); });
    function show(res) {
      var urls = res.urls || res, note = res.note || "";
      var files = urls.map(function (u, i) { return dataUrlFile(u, name + (urls.length > 1 ? "-" + (i + 1) : "") + ".jpg"); });
      var canShare = navigator.canShare && navigator.canShare({ files: files });
      box.querySelector(".modal-box").innerHTML = '<div class="card-head"><h2>导出图片' + (urls.length > 1 ? "（共 " + urls.length + " 张）" : "") + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
        '<div class="export-tip"><b>手机：长按图片</b> → 保存到相册，或发送给微信好友。导出的是当前展开的整棵树：想导出哪些人，先展开到哪里。' + (note ? '<br><span class="down">' + A.esc(note) + "</span>" : "") + "</div>" +
        '<div class="export-actions">' + (canShare ? '<button id="ex-share">分享 / 保存到相册</button>' : "") + '<button class="ghost" id="ex-dl">下载到电脑</button></div>' +
        '<div class="export-imgs">' + urls.map(function (u, i) { return '<img src="' + u + '" alt="团队结构图 第 ' + (i + 1) + ' 张">'; }).join("") + "</div>";
      var sh = document.getElementById("ex-share");
      if (sh) sh.onclick = function () { navigator.share({ files: files, title: "团队结构图" }).catch(function () {}); };
      document.getElementById("ex-dl").onclick = function () {
        urls.forEach(function (u, i) {
          var a = document.createElement("a");
          a.href = u; a.download = files[i].name;
          document.body.appendChild(a); a.click(); a.remove();
        });
      };
    }
    setTimeout(function () {
      Promise.resolve().then(make).then(show, function (e) {
        var l = box.querySelector(".loading");
        if (l) { l.className = "card err"; l.textContent = (e && e.message) || "图片生成失败"; }
      });
    }, 30);
  }
  function exportPng(root) { exportModal("AiLGNS团队-" + root.a.slice(2, 8), function () { return renderImages(root); }); }
  // 完整名单表格：每个地址的上级、层级、所属直推线、直推、团队地址数和算力（大团队分块拼，避免一个超长字符串）
  function exportCsv(D) {
    var line = new Int32Array(D.n), parts = ["\ufeff地址,上级,第几层,所属直推线,直推地址数,团队地址数,个人入金DAI,团队入金DAI\n"], buf = [];
    for (var i = 1; i < D.n; i++) {
      var p = D.parent[i];
      line[i] = p === 0 ? i : line[p];
      buf.push([D.addr(i), D.addr(p), D.depth[i], D.addr(line[i]), D.start[i + 1] - D.start[i], D.team[i], Math.round(A.toDai(D.self[i])), Math.round(A.toDai(D.power[i]))].join(","));
      if (buf.length === 20000) { parts.push(buf.join("\n") + "\n"); buf = []; }
    }
    parts.push(buf.join("\n"));
    var blob = new Blob(parts, { type: "text/csv" }), name = "AiLGNS团队名单-" + D.addr(0).slice(2, 8) + ".csv";
    var file = window.File ? new File([blob], name, { type: "text/csv" }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: "团队完整名单" }).catch(function () {});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function diagramHtml(note) {
    return '<div class="tree-bar"><button class="ghost" data-z="1.25">放大</button><button class="ghost" data-z="0.8">缩小</button><button class="ghost" data-fit>适应屏幕</button>' +
      '<button class="ghost" data-expand>展开下一层</button><button class="ghost" data-all>全部展开</button><button class="ghost" data-fold>收起</button>' +
      '<button data-png>导出图片</button><button class="ghost" data-csv hidden>导出完整名单</button><span class="muted" id="tree-status"></span></div>' +
      '<div class="tree-find" id="tree-find" hidden><input id="find-a" placeholder="输入你团队里的地址（可只输前几位）" autocomplete="off" spellcheck="false"><button id="find-go">定位</button>' +
      "</div>" +
      '<div class="tree-path" id="tree-path" hidden></div>' +
      '<div class="tree-box" id="tree-box"><div class="tree-inner" id="tree-inner"></div></div><p class="note">' + note + "</p>";
  }

  // 示例图、以及服务器不可用时的备用方式：SVG 树，点 + 逐层展开；load(n) 负责读取节点的直推
  function mountDiagram(id, root, load) {
    var app = A.app;
    var box = document.getElementById("tree-box"), inner = document.getElementById("tree-inner"), st = document.getElementById("tree-status");
    var pz = panZoom(box, inner), size;
    function draw(fit) {
      var t = treeSvg(root);
      inner.innerHTML = t.svg;
      size = t;
      if (fit) pz.fit(t.w, t.h, root.y + 24 + NODE_H / 2);
    }
    // 展开/收起后重新排版，点的那个节点会挪位置；把画面跟着挪回来，让它留在原来的位置上
    function drawKeep(n) {
      var ox = n.x, oy = n.y;
      draw();
      pz.shift(ox - n.x, oy - n.y);
      if (n.expanded) pz.showRight(n.x + 24, NODE_W * 2 + GAP_X); // 展开后让下一层露出来（手机屏幕窄）
    }
    draw(true);
    inner.addEventListener("click", function (e) {
      if (pz.wasDrag()) return;
      var g = e.target.closest(".node");
      if (!g) return;
      var n = find(root, g.getAttribute("data-a"));
      if (!n || !n.direct || n.loading || n === root && !n.children) return;
      if (n.children) { n.expanded = !n.expanded; drawKeep(n); return; }
      n.loading = true; drawKeep(n);
      load(n).then(function () { n.loading = false; n.expanded = true; if (A.isCurrent(id)) drawKeep(n); }, function () { n.loading = false; drawKeep(n); });
    });
    app.querySelector("[data-fit]").onclick = function () { pz.fit(size.w, size.h, root.y + 24 + NODE_H / 2); };
    app.querySelectorAll("[data-z]").forEach(function (b) { b.onclick = function () { pz.zoom(Number(b.getAttribute("data-z"))); }; });
    app.querySelector("[data-png]").onclick = proOnly(function () { exportPng(root); });
    // 全部展开：逐层读取
    app.querySelector("[data-all]").onclick = function () {
      var round = 0;
      (function more() {
        var leaves = [];
        (function walk(n) { if (n.expanded && n.children) n.children.forEach(walk); else if (n.direct && !n.moreOf) leaves.push(n); })(root);
        if (!leaves.length || ++round > 30) { st.textContent = "已全部展开"; if (A.isCurrent(id)) draw(true); return; }
        st.textContent = "正在展开第 " + round + " 层…";
        A.pool(leaves, 6, function (n) { return n.children ? Promise.resolve(n.expanded = true) : load(n).then(function () { n.expanded = true; }); }).then(more);
      })();
    };
    app.querySelector("[data-fold]").onclick = function () {
      (function walk(n) { n.expanded = false; (n.children || []).forEach(walk); })(root);
      root.expanded = true;
      st.textContent = "";
      draw(true);
    };
    proMark(app.querySelector("[data-png]"));
    app.querySelector("[data-expand]").onclick = function () {
      // 展开当前最外层里所有有直推的节点
      var leaves = [];
      (function walk(n) { if (n.expanded && n.children) n.children.forEach(walk); else if (n.direct && !n.moreOf) leaves.push(n); })(root);
      if (!leaves.length) { st.textContent = "已经全部展开"; return; }
      leaves = leaves.slice(0, 40);
      var done = 0;
      st.textContent = "正在展开 " + leaves.length + " 个节点…";
      A.pool(leaves, 3, function (n) {
        if (n.children) { n.expanded = true; return Promise.resolve(); }
        return load(n).then(function () { n.expanded = true; });
      }, function () { done++; st.textContent = "正在展开 " + done + " / " + leaves.length; }).then(function () {
        st.textContent = "";
        if (A.isCurrent(id)) draw(true);
      });
    };
  }

  // ---------- 树状结构图（完整数据）：点 + 一层层往下展开，带新手引导 ----------
  // 数据是 A.treeMap.team() 的定长数组；只给展开过的地址建节点对象，所以百万地址的团队也不卡
  var SHOW_CAP = window.innerWidth < 600 ? 300 : 600; // 「全部展开」一次最多画多少个框：太大手机会白屏，也看不清
  var GUIDE_KEY = "ailgns-tree-guide-done";
  function treeHtml(note) {
    return '<div class="tree-guide" id="tree-guide"><span><b>1</b>点框右边的 <i class="g-plus">+</i> 展开他的下级</span><span><b>2</b>一层层往下点，直到看到你想找的人</span><span><b>3</b>双指缩放、拖动查看；点「收起」从头再来</span><a href="#" id="guide-again">再看一遍引导</a></div>' +
      '<div class="tree-bar"><button class="ghost" data-z="1.25">放大</button><button class="ghost" data-z="0.8">缩小</button><button class="ghost" data-fit>适应屏幕</button>' +
      '<button class="ghost" data-expand>展开下一层</button><button class="ghost" data-all>全部展开</button><button class="ghost" data-fold>收起</button>' +
      '<button data-png>导出图片</button><button class="ghost" data-csv>导出完整名单</button><span class="muted" id="tree-status"></span></div>' +
      '<div class="tree-find" id="tree-find"><input id="find-a" placeholder="定位：输入团队里的地址（开头或结尾 4 位以上）" autocomplete="off" spellcheck="false"><button id="find-go">定位</button></div>' +
      '<div class="tree-box" id="tree-box"><div class="tree-inner" id="tree-inner"></div><div class="coach" id="coach" hidden></div></div>' +
      '<div class="tree-path" id="tree-path" hidden></div><p class="note">' + note + "</p>";
  }
  function mountTree(id, D) {
    var app = A.app, box = document.getElementById("tree-box"), inner = document.getElementById("tree-inner"), st = document.getElementById("tree-status");
    var pathEl = document.getElementById("tree-path"), input = document.getElementById("find-a"), coachEl = document.getElementById("coach");
    var pz = panZoom(box, inner), size, nodes = {}, byAddr = {}, pinned = {};
    function nodeOf(i) {
      if (nodes[i]) return nodes[i];
      var n = nodes[i] = { i: i, a: D.addr(i), team: D.team[i], power: D.power[i], self: D.self[i], level: D.level[i], zone: D.zone[i], direct: D.start[i + 1] - D.start[i], children: null, expanded: false };
      return (byAddr[n.a] = n);
    }
    // 下级：有团队、有等级或被定位到的，按算力最多画 MAX_CHILDREN 个；其余合并成「还有 N 个直推」
    function kidsOf(n) {
      var ks = D.kids(n.i), shown = [];
      for (var t = 0; t < ks.length; t++) {
        var k = ks[t];
        if (pinned[k] || ((D.team[k] > 0 || D.level[k] > 0) && shown.length < MAX_CHILDREN)) shown.push(k);
      }
      n.children = shown.map(function (k) { var c = nodeOf(k); c.parent = n; return c; });
      n.more = ks.length - shown.length;
    }
    var root = nodeOf(0);
    kidsOf(root); root.expanded = true;
    function draw(fit) {
      var t = treeSvg(root);
      inner.innerHTML = t.svg;
      size = t;
      if (fit) pz.fit(t.w, t.h, root.y + 24 + NODE_H / 2);
      coach();
    }
    // 展开/收起后重新排版：画面跟住点的那个节点，再往左挪一点让下一层露出来
    function drawKeep(n) {
      var ox = n.x, oy = n.y;
      draw();
      pz.shift(ox - n.x, oy - n.y);
      if (n.expanded) pz.showRight(n.x + 24, NODE_W * 2 + GAP_X);
      coach();
    }
    function toggle(n) {
      if (!n.direct) return;
      if (!n.children) kidsOf(n);
      n.expanded = !n.expanded;
      if (n.expanded && guide.target === n) guide.next(n);
      drawKeep(n);
    }
    function shown(n) { var c = 1; if (n.expanded && n.children) { n.children.forEach(function (k) { c += shown(k); }); if (n.more) c++; } return c; }

    // ---- 新手引导：一个气泡指着该点的 +，跟着展开一步步往下 ----
    var guide = { step: 0, target: null };
    guide.start = function () {
      guide.step = 1;
      guide.point(root.children && root.children[0]);
    };
    guide.point = function (n) {
      if (guide.target) guide.target.coach = false;
      guide.target = n && n.direct ? n : null;
      if (!guide.target) return guide.end();
      n.coach = true;
      draw();
      pz.center(n.x + 24 + NODE_W * 0.6, n.y + 24 + NODE_H / 2, Math.max(0.7, Math.min(1, (box.clientWidth - 40) / (NODE_W * 1.6))));
      coach();
    };
    guide.next = function (n) {
      guide.step++;
      if (guide.step > 3) return guide.end(true);
      var nx = (n.children || [])[0];
      setTimeout(function () { guide.point(nx); }, 60);
    };
    guide.end = function (done) {
      if (guide.target) guide.target.coach = false;
      guide.target = null; guide.step = 0;
      coachEl.hidden = true;
      if (done) { try { localStorage.setItem(GUIDE_KEY, "1"); } catch (e) { /* 忽略 */ } st.textContent = "学会了！接着点任意 + 往下看，点「收起」从头再来"; }
      draw();
    };
    var TIPS = ["", "👆 点这个 <b>+</b>，展开他的下级", "很好！继续点 <b>+</b>，再往下一层", "最后一步：再点一次 <b>+</b>"];
    function coach() {
      var n = guide.target;
      if (!n) { coachEl.hidden = true; return; }
      var g = inner.querySelector('.node[data-a="' + n.a + '"] circle:last-of-type');
      if (!g) { coachEl.hidden = true; return; }
      var r = g.getBoundingClientRect(), b = box.getBoundingClientRect();
      coachEl.hidden = false;
      coachEl.innerHTML = '<div class="coach-txt">' + TIPS[guide.step] + '<small>' + A.short(n.a) + " 的团队有 " + A.fmt(n.team) + ' 个地址</small></div><button class="coach-skip" type="button">跳过</button>';
      var x = r.left - b.left + r.width / 2, y = r.top - b.top;
      coachEl.style.left = Math.max(8, Math.min(box.clientWidth - 228, x - 200)) + "px";
      coachEl.style.top = Math.max(8, y - coachEl.offsetHeight - 12) + "px";
      coachEl.style.setProperty("--arrow", Math.max(16, Math.min(204, x - parseFloat(coachEl.style.left))) + "px");
      coachEl.querySelector(".coach-skip").onclick = function (e) { e.stopPropagation(); guide.end(true); };
    }
    document.getElementById("guide-again").onclick = function (e) {
      e.preventDefault();
      (function walk(n) { n.expanded = false; (n.children || []).forEach(walk); })(root);
      root.expanded = true;
      draw(true);
      guide.start();
    };

    // 点一个地址：展开/收起他的下级，并在图下面显示他在团队里的位置
    inner.addEventListener("click", function (e) {
      if (pz.wasDrag()) return;
      var g = e.target.closest(".node");
      if (!g) return;
      var n = byAddr[g.getAttribute("data-a")];
      if (!n) return;
      if (n !== root) showPath(n.i);
      toggle(n);
    });
    function showPath(i) {
      var p = D.path(i), line = p[1];
      pathEl.hidden = false;
      pathEl.innerHTML = '<div class="tp-head"><b>' + (i === 0 ? "你自己" : "第 " + (p.length - 1) + " 层 · 位置 " + D.pos(i)) + "</b>" +
        (i === 0 ? "" : '<span class="muted">' + (D.zone[line] ? ["一区", "二区", "三区"][D.zone[line] - 1] + " · " : "") + "属于直推线 " + A.short(D.addr(line)) + "</span>") + "</div>" +
        '<div class="tp-chain">' + p.map(function (x, k) {
          return '<button class="tp-step' + (x === i ? " on" : "") + '" data-go="' + x + '"><span>' + (k === 0 ? "你" : "第 " + k + " 层") + '</span><b class="mono">' + A.short(D.addr(x)) + "</b><small>团队 " + A.fmt(D.team[x]) + " 个地址" + (D.level[x] ? " · P" + D.level[x] : "") + "</small></button>";
        }).join('<i class="tp-arrow">›</i>') + "</div>";
      pathEl.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { locate(+b.getAttribute("data-go")); }; });
    }
    // 定位：把从自己到他的路径一层层展开，画出来并高亮
    function locate(i) {
      Object.keys(nodes).forEach(function (k) { nodes[k].hl = false; });
      var p = D.path(i);
      p.forEach(function (x) { pinned[x] = true; });
      p.slice(0, -1).forEach(function (x) { var n = nodeOf(x); kidsOf(n); n.expanded = true; });
      var t = nodeOf(i);
      t.hl = true;
      draw();
      pz.center(t.x + 24 + NODE_W / 2, t.y + 24 + NODE_H / 2, 1);
      showPath(i);
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function search() {
      var q = input.value.trim();
      if (!q) return;
      var hits = D.find(q);
      if (!hits.length) { st.textContent = /^(0x)?[0-9a-f]{4,}$/i.test(q) ? "这个地址不在你的团队里" : "请输入地址的开头或结尾 4 位以上"; return; }
      if (hits.length > 1) { st.textContent = "有 " + (hits.length >= 20 ? "很多" : hits.length) + " 个地址匹配，请多输几位"; return; }
      st.textContent = "";
      locate(hits[0]);
    }
    document.getElementById("find-go").onclick = search;
    input.onkeydown = function (e) { if (e.key === "Enter") search(); };

    app.querySelector("[data-fit]").onclick = function () { pz.fit(size.w, size.h, root.y + 24 + NODE_H / 2); };
    app.querySelectorAll("[data-z]").forEach(function (b) { b.onclick = function () { pz.zoom(Number(b.getAttribute("data-z"))); }; });
    // 展开下一层 / 全部展开：一层层来，画的框超过 SHOW_CAP 个就停
    function expandLevel() {
      var leaves = [];
      (function walk(n) { if (n.expanded && n.children) n.children.forEach(walk); else if (n.direct) leaves.push(n); })(root);
      if (!leaves.length) return 0;
      // 团队大的先展开，加到上限为止
      leaves.sort(function (x, y) { return y.team - x.team; });
      var total = shown(root), opened = 0;
      for (var k = 0; k < leaves.length; k++) {
        var n = leaves[k];
        if (!n.children) kidsOf(n);
        var add = n.children.length + (n.more ? 1 : 0);
        if (total + add > SHOW_CAP) break;
        n.expanded = true; total += add; opened++;
      }
      return opened === leaves.length ? 1 : opened ? -2 : -1; // 1 整层展开；-2 展开了一部分；-1 一个都放不下
    }
    var TOO_BIG = "团队太大，再展开一层画不下了。请点具体某个人右边的 + 往下看，或用上面的定位查找。";
    app.querySelector("[data-expand]").onclick = function () {
      var r = expandLevel();
      st.textContent = r === 0 ? "已经全部展开" : r === -1 ? TOO_BIG : r === -2 ? "这一层太多，先展开了团队最大的几个。" + TOO_BIG : "";
      if (r !== 0 && r !== -1) draw(true);
    };
    app.querySelector("[data-all]").onclick = function () {
      var r;
      while ((r = expandLevel()) > 0) { /* 一层层展开 */ }
      st.textContent = r === 0 ? "已全部展开" : "已展开 " + A.fmt(shown(root)) + " 个框（团队大的优先）。" + TOO_BIG;
      draw(true);
    };
    app.querySelector("[data-fold]").onclick = function () {
      (function walk(n) { n.expanded = false; (n.children || []).forEach(walk); })(root);
      root.expanded = true;
      st.textContent = "";
      draw(true);
    };
    var png = app.querySelector("[data-png]"), csv = app.querySelector("[data-csv]");
    png.onclick = proOnly(function () { exportPng(root); });
    csv.onclick = proOnly(function () { exportCsv(D); });
    proMark(png); proMark(csv);

    draw(true);
    var done = false;
    try { done = localStorage.getItem(GUIDE_KEY) === "1"; } catch (e) { /* 隐私模式 */ }
    if (!done && root.children && root.children.length) guide.start();
  }

  // 示例团队：随机生成 3000 个地址，给没开通的访客看效果（地址和数据都是假的）
  function demoData() {
    var seed = 20261030, N = 3000, parent = new Int32Array(N), self = new Float64Array(N), addr = new Uint8Array(N * 20);
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var b = 0; b < addr.length; b++) addr[b] = Math.floor(rnd() * 256);
    parent[0] = -1; self[0] = 25000;
    for (var i = 1; i < N; i++) {
      parent[i] = Math.floor(Math.pow(rnd(), 1.8) * i); // 偏向挂在早期地址下面：又宽又深
      self[i] = rnd() < 0.35 ? 0 : Math.round(500 + Math.pow(rnd(), 3) * 60000);
    }
    var D = A.treeMap.team({ n: N, addr: addr, parent: parent, self: self, level: new Uint8Array(N), at: Date.now() });
    for (i = 0; i < N; i++) D.level[i] = D.power[i] >= 3.75e6 ? 3 : D.power[i] >= 1.1e6 ? 2 : D.power[i] >= 3.8e5 ? 1 : 0;
    return D;
  }

  var LEGEND_TREE = "紫色边框 = 有 P 等级（来自官方接口）；一区、二区、三区按团队入金从大到小估算，以官方等级为准。入金 = 已登记算力 ÷ 2.5，折算成真实投入的 DAI；团队入金 = 下级所有地址的入金之和（含排队生效中的）。每层最多画出团队入金最多的 " + MAX_CHILDREN + " 个直推，没有团队的直推合并显示，可用定位查找。";
  var LEGEND = "紫色边框 = 有 P 等级；一区、二区、三区按团队入金从大到小估算，以官方等级为准。入金 = 算力 ÷ 2.5。每层最多画出入金最多的 " + MAX_CHILDREN + " 个直推，没有团队的直推合并显示。";

  function renderTree(id, addr) {
    var app = A.app, m = member();
    if (!m) {
      app.innerHTML = '<h1>团队结构图 <span class="lv p1" style="vertical-align:4px">会员</span></h1>' +
        '<p class="sub">开通会员后，就能画出你自己团队的结构图。下面是<b>示例效果</b>，可以直接点、拖、缩放试试。</p>' +
        '<div class="demo-cta"><div><b>' + "初级 " + FEE_USD + " 美元永久 · 高级 " + PRO_USD + " 美元终生" + '</b><span class="muted">用钱包注册、付款，几秒钟开通</span></div><a class="btn" href="#/member">开通会员 →</a></div>' +
        '<div class="features">' +
        '<div class="feature"><b>整条线一目了然</b><span class="muted">谁是一区、二区、三区，每条线多少个地址、入金多少 DAI</span></div>' +
        '<div class="feature"><b>一层层往下点</b><span class="muted">点 + 展开任意一个地址的下级，几十层、上万个地址也流畅</span></div>' +
        '<div class="feature"><b>等级标得清清楚楚</b><span class="muted">P1–P7 紫色标记，数据来自官方接口</span></div>' +
        '<div class="feature"><b>导出图片 · 高级 VIP</b><span class="muted">一键保存高清图片、完整名单，直接发团队群</span></div></div>' +
        '<div class="demo-tag">示例效果 · 地址和数据都是随机生成的</div>' +
        treeHtml(LEGEND_TREE);
      mountTree(id, demoData());
      return;
    }
    var head = '<h1>团队结构图 <span class="lv p1" style="vertical-align:4px">会员</span></h1><p class="sub">你的团队结构：点地址框右边的 + 一层层往下展开；拖动平移，双指缩放；「导出图片」可保存到相册或发微信。</p>';
    var form = ownBar(m);
    if (!addr) {
      app.innerHTML = head + form + '<div class="empty">输入一个地址开始画图，或者 <a href="#/tree/' + m.addr + '">画我自己的团队</a></div>';
      bindForm();
      return;
    }
    app.innerHTML = head + form + '<div class="loading" id="tree-loading">正在读取团队…</div>';
    bindForm();
    var root;
    fullTree(addr, function (t) { var el = document.getElementById("tree-loading"); if (el) el.textContent = t; }).then(function (d) {
      if (!A.isCurrent(id)) return;
      app.innerHTML = head + form + treeHtml(LEGEND_TREE);
      mountTree(id, d);
      var st = document.getElementById("tree-status");
      if (st && d.at && !st.textContent) st.textContent = "数据更新于 " + Math.max(1, Math.round((Date.now() - d.at) / 60000)) + " 分钟前 · " + (isPro() ? "高级会员每 5 分钟更新" : "每 30 分钟更新");
    }).catch(function (e) {
      if (e && e.building) { // 超大团队第一次打开：后台还在整理
        if (A.isCurrent(id)) app.innerHTML = head + form + '<div class="card"><h2>团队很大，正在后台整理</h2><p class="muted" style="margin-top:8px">你的团队超过 8 万个地址，第一次需要在后台把整个团队读出来，大约需要 10–30 分钟。可以先去别的页面，稍后再回来刷新。</p></div>';
        return;
      }
      // 服务器不可用时退回逐个读取
      return loadNode(addr).then(function (r) {
      root = r;
      if (!root.direct) return;
      root.expanded = true;
      return loadChildren(root);
    }).then(function () {
      if (!A.isCurrent(id)) return;
      app.innerHTML = head + form + diagramHtml(LEGEND);
      mountDiagram(id, root, loadChildren);
    }, function () {
      if (A.isCurrent(id)) app.innerHTML = head + form + '<div class="card err">读取失败，请稍后再试。</div>';
    });
    });
  }

  function find(n, a) {
    if (n.a === a) return n;
    var kids = n.children || [];
    for (var i = 0; i < kids.length; i++) { var r = find(kids[i], a); if (r) return r; }
    return null;
  }
  function bindForm(route) {
    var f = A.app.querySelector("form[data-custom]");
    if (!f) return;
    f.onsubmit = function (e) {
      e.preventDefault();
      var a = f.a.value.trim();
      if (!A.isAddr(a)) { f.a.style.borderColor = "var(--down)"; f.a.focus(); return; }
      location.hash = "#/" + (route || "tree") + "/" + a.toLowerCase();
    };
  }

  // ---------- 团队新增业绩（会员）：一段时间内团队里谁投了多少 DAI ----------
  var POWER = "0x9E68F61E2615cc1D2C4a2D0026bFc1EBFdf68C1b";
  var DAI_QUEUED = "0x41fd86243836b698405554ae311d223dec7e355200f05fd658fb3adffe567668"; // 用 DAI 买算力：topics[1]=地址，data=[DAI, 算力]
  var LGNS_BURN = "0x16b309670cfc6e855d1def7ee55e395827e8a8694f4c701ffe0adbc7b75121cc"; // 销毁 LGNS 换算力：topics[1]=地址，data=[LGNS(9 位小数), 算力]
  var COMMUNITY = "0xc9f9a8a2dBf8188AD6610e0239105CAbE67c4993";
  var ANUBIS_RPCS = ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"];

  function batchRpc(calls, k) {
    k = k || 0;
    var body = calls.map(function (c, i) { return { jsonrpc: "2.0", id: i, method: c[0], params: c[1] }; });
    return fetch(ANUBIS_RPCS[k % ANUBIS_RPCS.length], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function (arr) {
        var out = [];
        arr.forEach(function (x) { out[x.id] = x.error ? null : x.result; });
        return out;
      }).catch(function (e) { if (k < ANUBIS_RPCS.length - 1) return batchRpc(calls, k + 1); throw e; });
  }
  // 从 root 往下一层层读出整个团队：地址 → { line: 属于哪条直推线, depth: 第几层 }
  // 每一层只问一次链：同时拿"直推人数"和"第一个直推"，人数多的下一轮再补读，往返次数减半
  // 读完在浏览器里存 30 分钟；服务器那边所有访客共享缓存
  var teamCache = {}, TEAM_TTL = 30 * 60 * 1000; // 本机缓存 30 分钟；服务器那边共享缓存，过期也很快
  function teamKey(root) { return "ailgns-team-v1-" + root; }
  function loadTeamCache(root) {
    if (teamCache[root]) return teamCache[root];
    try {
      var c = JSON.parse(localStorage.getItem(teamKey(root)));
      if (!c) return null;
      var team = {};
      team[root] = { line: "self", depth: 0 };
      c.list.forEach(function (x) { team[x[0]] = { line: c.lines[x[1]], depth: x[2] }; });
      return (teamCache[root] = { at: c.at, team: team });
    } catch (e) { return null; }
  }
  function saveTeamCache(root, team) {
    var lines = [], idx = {}, list = [];
    Object.keys(team).forEach(function (a) {
      if (a === root) return;
      var L = team[a].line;
      if (!(L in idx)) { idx[L] = lines.length; lines.push(L); }
      list.push([a, idx[L], team[a].depth]);
    });
    teamCache[root] = { at: Date.now(), team: team };
    try { localStorage.setItem(teamKey(root), JSON.stringify({ at: Date.now(), lines: lines, list: list })); } catch (e) { /* 太大存不下就只放内存 */ }
  }
  // 先问本站服务器（所有访客共享的缓存，一般 1 秒内）；服务器不可用时再在浏览器里自己读
  function serverTeam(root, fresh) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, 90000);
    return fetch("/api/team?root=" + root + (fresh ? "&fresh=1" : ""), ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (!r.ok) throw new Error("server " + r.status);
      return r.json();
    }).then(function (c) {
      if (timer) clearTimeout(timer);
      var team = {};
      team[root] = { line: "self", depth: 0 };
      c.list.forEach(function (x) { team[x[0]] = { line: c.lines[x[1]], depth: x[2] }; });
      try { localStorage.setItem(teamKey(root), JSON.stringify({ at: c.at, lines: c.lines, list: c.list })); } catch (e) { /* 存不下就只放内存 */ }
      teamCache[root] = { at: c.at, team: team };
      return team;
    });
  }
  function buildTeam(root, progress, fresh) {
    var hit = fresh ? null : loadTeamCache(root);
    if (hit && Date.now() - hit.at < TEAM_TTL) return Promise.resolve(hit.team);
    return serverTeam(root, fresh).catch(function () {
      return bigTeam(root).catch(function () { return browserTeam(root, progress); });
    });
  }
  // 超大团队（8 万个地址以上）：用结构图的压缩数据，做一个按地址查「属于哪条直推线、第几层」的查找表
  // 不给每个地址建对象：team[地址] 用 Proxy 现查（地址前 6 字节做键，再核对完整地址）
  function bigTeam(root) {
    return fetch("/api/tree?root=" + root).then(function (r) { return r.json(); }).then(function (t) {
      if (!t.big) throw new Error("not big");
      return bigTree(root);
    }).then(function (D) {
      var idx = new Map(), b = D.bytes, line = new Int32Array(D.n);
      for (var i = 0; i < D.n; i++) {
        var o = i * 20;
        idx.set(((b[o] * 256 + b[o + 1]) * 256 + b[o + 2]) * 16777216 + (b[o + 3] * 256 + b[o + 4]) * 256 + b[o + 5], i);
        if (i > 0) line[i] = D.parent[i] === 0 ? i : line[D.parent[i]];
      }
      var team = new Proxy({}, {
        get: function (_, a) {
          if (a === "__n") return D.n - 1;
          if (typeof a !== "string" || !/^0x[0-9a-f]{40}$/.test(a)) return undefined;
          var j = idx.get(parseInt(a.slice(2, 14), 16));
          if (j === undefined || D.addr(j) !== a) return undefined;
          return j === 0 ? { line: "self", depth: 0 } : { line: D.addr(line[j]), depth: D.depth[j] };
        }
      });
      teamCache[root] = { at: D.at, team: team };
      return team;
    });
  }
  function browserTeam(root, progress) {
    var team = {}, jobs = [{ parent: root, off: 0, lim: 1, probe: true }], rounds = 0;
    team[root] = { line: "self", depth: 0 };
    function refCall(a, off, lim) {
      return ["eth_call", [{ to: COMMUNITY, data: "0xc01b35a1" + A.pad(a) + off.toString(16).padStart(64, "0") + lim.toString(16).padStart(64, "0") }, "latest"]];
    }
    function batched(calls) {
      var chunks = [];
      for (var i = 0; i < calls.length; i += 300) chunks.push(calls.slice(i, i + 300));
      return A.pool(chunks, 4, batchRpc).then(function (r) { return [].concat.apply([], r); });
    }
    function add(parent, h, next) {
      var len = parseInt(h.slice(2 + 128, 2 + 192), 16), par = team[parent];
      for (var k = 0; k < len; k++) {
        var c = "0x" + h.slice(2 + (3 + k) * 64 + 24, 2 + (4 + k) * 64);
        if (team[c]) continue;
        team[c] = { line: parent === root ? c : par.line, depth: par.depth + 1 };
        next.push({ parent: c, off: 0, lim: 1, probe: true }); // 新成员下一轮去探他的直推
      }
    }
    function step() {
      if (!jobs.length || ++rounds > 400) {
        saveTeamCache(root, team);
        return Promise.resolve(team);
      }
      return batched(jobs.map(function (j) { return refCall(j.parent, j.off, j.lim); })).then(function (res) {
        var next = [];
        jobs.forEach(function (j, i) {
          var h = res[i];
          if (!h) return; // 没有直推时合约会拒绝 limit=1，说明是 0 个
          if (j.probe) {
            var total = parseInt(h.slice(2, 66), 16);
            for (var off = 1; off < total; off += 100) next.push({ parent: j.parent, off: off, lim: Math.min(100, total - off) });
          }
          add(j.parent, h, next);
        });
        jobs = next;
        if (progress) progress(team);
        return step();
      });
    }
    return step();
  }
  // 找到时间戳对应的区块（Anubis 大约 1 秒一个块）
  function blockAt(ts, latest) {
    var lo = Math.max(1, latest.n - Math.ceil((latest.t - ts) * 1.1) - 2000), hi = latest.n;
    function tsOf(n) { return A.rpc("eth_getBlockByNumber", ["0x" + n.toString(16), false]).then(function (b) { return parseInt(b.timestamp, 16); }); }
    function search() {
      if (hi - lo <= 1) return Promise.resolve(hi);
      var mid = Math.floor((lo + hi) / 2);
      return tsOf(mid).then(function (t) { if (t < ts) lo = mid; else hi = mid; return search(); });
    }
    return tsOf(lo).then(function (t) { if (t >= ts) lo = Math.max(1, lo - 200000); return search(); });
  }
  function depositsBetween(from, to) {
    var ranges = [];
    for (var b = from; b <= to; b += 5000) ranges.push([b, Math.min(to, b + 4999)]);
    var groups = [];
    for (var i = 0; i < ranges.length; i += 25) groups.push(ranges.slice(i, i + 25)); // 25 段打包成一次请求
    return A.pool(groups, 3, function (g) {
      return batchRpc(g.map(function (r) {
        return ["eth_getLogs", [{ address: POWER, topics: [[DAI_QUEUED, LGNS_BURN]], fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16) }]];
      })).then(function (res) {
        if (res.some(function (x) { return x == null; })) throw new Error("部分记录没读到");
        return [].concat.apply([], res);
      });
    }).then(function (chunks) {
      return [].concat.apply([], chunks.map(function (c) { return c || []; })).map(function (l) {
        var d = l.data.slice(2), lgns = l.topics[0] === LGNS_BURN, amt = Number(BigInt("0x" + d.slice(0, 64)));
        return { addr: "0x" + l.topics[1].slice(26), kind: lgns ? "LGNS" : "DAI", dai: lgns ? 0 : amt / 1e18, lgns: lgns ? amt / 1e9 : 0,
          power: Number(BigInt("0x" + d.slice(64, 128))) / 1e18, block: parseInt(l.blockNumber, 16), tx: l.transactionHash };
      });
    });
  }

  // 每天（北京时间）最后一个区块，资金流向数据里已经有了，直接查表，不用二分查找
  var dayEnds = null;
  function loadDayEnds() {
    if (dayEnds) return Promise.resolve(dayEnds);
    return A.getJSON("/api/flows").catch(function () {
      return A.getJSON("https://raw.githubusercontent.com/yaoyederener/monita/main/data/ailgns_flows.json");
    }).catch(function () { return { days: [] }; }).then(function (f) {
      dayEnds = {};
      (f.days || []).forEach(function (d) { if (d.final) dayEnds[d.date] = d.end_block; });
      return dayEnds;
    });
  }
  function bjDate(ts) { return new Date((ts + 8 * 3600) * 1000).toISOString().slice(0, 10); }
  function periodBlocks(r, latest) {
    return loadDayEnds().then(function (ends) {
      var startEnd = ends[bjDate(r[0] - 1)], stopEnd = r[1] ? ends[bjDate(r[1] - 1)] : null;
      return Promise.all([
        startEnd ? startEnd + 1 : blockAt(r[0], latest),
        r[1] ? (stopEnd || blockAt(r[1], latest).then(function (x) { return x - 1; })) : latest.n
      ]);
    });
  }

  // 优先读每天整理好的投资记录文件（Cloudflare 边缘缓存，很快）；文件还没覆盖到的最近一段，再直接查链补上
  function dayFile(date) {
    return A.getJSON("/api/deposits/" + date).catch(function () {
      return A.getJSON("https://raw.githubusercontent.com/yaoyederener/monita/main/data/deposits/" + date + ".json");
    }).catch(function () { return null; });
  }
  function loadDeposits(r, from, to) {
    var dates = [];
    for (var t = r[0]; t < (r[1] || Date.now() / 1000); t += 86400) dates.push(bjDate(t));
    return Promise.all(dates.map(dayFile)).then(function (files) {
      if (files.some(function (f) { return !f; })) return depositsBetween(from, to); // 有缺的就整段查链
      var rows = [], covered = 0;
      files.forEach(function (f) {
        covered = Math.max(covered, f.to);
        f.rows.forEach(function (x) {
          if (x[4] < from || x[4] > to) return;
          var burn = x[1] === 1;
          rows.push({ addr: "0x" + x[0], kind: burn ? "LGNS" : "DAI", dai: burn ? 0 : x[2], lgns: burn ? x[2] : 0, power: x[3], block: x[4], tx: null });
        });
      });
      if (covered >= to) return rows;
      return depositsBetween(covered + 1, to).then(function (more) { return rows.concat(more); });
    });
  }

  var PERIODS = [["today", "今天"], ["yesterday", "昨天"], ["7d", "近 7 天"]];
  function periodRange(key) {
    var bjMidnight = Math.floor((Date.now() / 1000 + 8 * 3600) / 86400) * 86400 - 8 * 3600; // 北京时间今天 0 点
    if (key === "yesterday") return [bjMidnight - 86400, bjMidnight];
    if (key === "7d") return [bjMidnight - 6 * 86400, null];
    return [bjMidnight, null];
  }

  function teamGrowth(id, root, el) {
    if (!el || !member()) return;
    root = root.toLowerCase();
    var period = "today", lastRows = [];
    function shell(body) {
      el.innerHTML = '<div class="card-head"><h2>团队新增业绩</h2><div class="seg" id="g-period">' +
        PERIODS.map(function (p) { return '<button data-p="' + p[0] + '"' + (p[0] === period ? ' class="on"' : "") + ">" + p[1] + "</button>"; }).join("") + "</div></div>" + body;
      el.querySelectorAll("#g-period button").forEach(function (b) { b.onclick = function () { period = b.getAttribute("data-p"); run(); }; });
    }
    function run(fresh) {
      var my = ++runId, r = periodRange(period), latest, from, to, deps = null, team = null, teamDone = false, at = null;
      var say = function (t) { if (my === runId && A.isCurrent(id)) shell('<div class="loading">' + t + "</div>"); };
      var cached = !fresh && loadTeamCache(root);
      say(cached ? "正在读取投资记录…" : "正在读取投资记录和团队名单…");
      function render() {
        if (my !== runId || !A.isCurrent(id) || !deps || !team) return;
        var t0 = r[0], t1 = r[1] || latest.t, span = Math.max(1, to - from);
        var rows = deps.filter(function (d) { return team[d.addr]; }).map(function (d) {
          var k = team[d.addr];
          return { addr: d.addr, kind: d.kind, dai: d.dai, lgns: d.lgns, power: d.power, tx: d.tx, block: d.block, line: k.line, depth: k.depth, t: t0 + (d.block - from) / span * (t1 - t0) };
        }).sort(function (a, b) { return b.t - a.t; });
        lastRows = rows;
        var n = team.__n || Object.keys(team).length - 1;
        draw(rows, deps.length, teamDone
          ? '团队 ' + A.fmt(n) + ' 个地址 · 名单更新于 ' + (at ? Math.max(1, Math.round((Date.now() - at) / 60000)) + " 分钟前" : "刚刚") + ' · <a href="#" id="g-refresh">重新读取团队</a>'
          : '<span class="spin"></span>团队名单读取中，已读到 ' + A.fmt(n) + " 个地址，结果还在补充…");
      }
      var teamP = buildTeam(root, function (t) { team = t; render(); }, fresh).then(function (t) {
        team = t; teamDone = true; at = teamCache[root] ? teamCache[root].at : Date.now(); render();
      });
      A.rpc("eth_getBlockByNumber", ["latest", false]).then(function (b) {
        latest = { n: parseInt(b.number, 16), t: parseInt(b.timestamp, 16) };
        return periodBlocks(r, latest);
      }).then(function (bs) {
        from = bs[0]; to = bs[1];
        return loadDeposits(r, from, to);
      }).then(function (d) {
        deps = d;
        if (!team) say("共 " + A.fmt(d.length) + " 笔投资，正在读取团队名单…");
        render();
        return teamP;
      }).catch(function () {
        if (my === runId && A.isCurrent(id)) shell('<div class="card err">读取失败，请稍后再试。</div>');
      });
    }
    function draw(rows, scanned, status) {
      var team = rows.filter(function (r) { return r.line !== "self"; }), self = rows.filter(function (r) { return r.line === "self"; });
      var sum = function (l, k) { return l.reduce(function (t, r) { return t + r[k || "power"]; }, 0); };
      var uniq = function (l) { return Object.keys(l.reduce(function (o, r) { o[r.addr] = 1; return o; }, {})).length; };
      var lines = {};
      team.forEach(function (r) {
        var L = lines[r.line] || (lines[r.line] = { line: r.line, power: 0, dai: 0, lgns: 0, n: 0, who: {} });
        L.power += r.power; L.dai += r.dai; L.lgns += r.lgns; L.n++; L.who[r.addr] = 1;
      });
      var lineList = Object.keys(lines).map(function (k) { return lines[k]; }).sort(function (a, b) { return b.power - a.power; });
      var fmtT = function (t) { return new Date(t * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); };
      var html = '<div class="kpis" style="margin-top:4px"><div class="kpi hero"><div class="k">团队新增入金</div><div class="v num">' + A.fmt(A.toDai(sum(team)), 2) + '<small>DAI</small></div><div class="d">' + team.length + " 笔 · " + uniq(team) + " 个地址</div></div>" +
        '<div class="kpi"><div class="k">其中 DAI 投入</div><div class="v num">' + A.fmt(sum(team, "dai"), 2) + '<small>DAI</small></div><div class="d">真实 DAI，P 等级按这个算</div></div>' +
        '<div class="kpi"><div class="k">其中销毁 LGNS</div><div class="v num">' + A.fmt(sum(team, "lgns"), 2) + '<small>LGNS</small></div><div class="d">按换来的算力 ÷ 2.5 计入新增入金</div></div>' +
        '<div class="kpi"><div class="k">本人新增入金</div><div class="v num">' + A.fmt(A.toDai(sum(self)), 2) + '<small>DAI</small></div><div class="d">' + self.length + " 笔（不计入团队）</div></div></div>";
      html = '<p class="note g-status">' + status + "</p>" + html;
      if (!rows.length) {
        shell(html + '<div class="empty">这段时间团队里没有新增投资（全网共 ' + A.fmt(scanned) + " 笔）</div>");
        bindRefresh();
        return;
      }
      html += '<h3 class="g-h">按直推线</h3><div class="tbl-wrap"><table class="cards"><thead><tr><th class="l">直推线</th><th>新增入金 DAI</th><th>DAI 投入</th><th>销毁 LGNS</th><th>笔数</th><th>地址数</th></tr></thead><tbody>' +
        lineList.map(function (L) {
          return '<tr><td data-l="直推线" class="l">' + A.addrLink(L.line, "team") + '</td><td data-l="新增入金 DAI"><b>' + A.fmt(A.toDai(L.power), 2) + '</b></td><td data-l="DAI 投入">' + A.fmt(L.dai, 2) + '</td><td data-l="销毁 LGNS">' + A.fmt(L.lgns, 2) +
            '</td><td data-l="笔数">' + L.n + '</td><td data-l="地址数">' + Object.keys(L.who).length + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      html += '<div class="card-head" style="margin-top:18px"><h3 class="g-h" style="margin:0">具体地址</h3><button class="ghost" id="g-csv" style="padding:6px 14px">导出表格</button></div><div class="tbl-wrap"><table class="cards"><thead><tr><th class="l">时间</th><th class="l">地址</th><th class="l">方式</th><th>投入</th><th>新增入金 DAI</th><th class="l">所属直推线</th><th>第几层</th></tr></thead><tbody>' +
        rows.slice(0, 500).map(function (r) {
          return '<tr><td data-l="时间" class="l">' + fmtT(r.t) + '</td><td data-l="地址" class="l">' + A.addrLink(r.addr, "team") + '</td><td data-l="方式" class="l">' + (r.kind === "LGNS" ? "销毁 LGNS" : "DAI 买入") +
            '</td><td data-l="投入">' + (r.kind === "LGNS" ? A.fmt(r.lgns, 2) + " LGNS" : A.fmt(r.dai, 2) + " DAI") + '</td><td data-l="新增入金 DAI"><b>' + A.fmt(A.toDai(r.power), 2) + "</b>" +
            '</td><td data-l="所属直推线" class="l">' + (r.line === "self" ? "本人" : A.addrLink(r.line, "team")) + '</td><td data-l="第几层">' + (r.line === "self" ? "—" : r.depth) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        (rows.length > 500 ? '<p class="note">只显示最近 500 笔，导出表格可以拿到全部 ' + rows.length + " 笔。</p>" : "") +
        '<p class="note">这里是链上逐笔记录：团队里每一笔用 DAI 买算力、销毁 LGNS 换算力，都能对应到具体地址和交易。新增入金 = 新增算力 ÷ 2.5，折算成真实投入的 DAI。官方的「增长算力」是奖励公式算出来的数，和这里的原始投入不是同一个口径；P 等级的三区业绩只算 DAI 投入。时间按区块估算，误差在一分钟以内。</p>';
      shell(html);
      bindRefresh();
      document.getElementById("g-csv").onclick = proOnly(function () {
        var csv = "时间,地址,方式,DAI,LGNS,新增入金DAI,所属直推线,第几层,交易或区块\n" + lastRows.map(function (r) {
          return [fmtT(r.t), r.addr, r.kind === "LGNS" ? "销毁LGNS" : "DAI买入", r.dai, r.lgns, Math.round(A.toDai(r.power) * 100) / 100, r.line === "self" ? "本人" : r.line, r.line === "self" ? "" : r.depth, r.tx || "区块 " + r.block].join(",");
        }).join("\n");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
        a.download = "团队新增业绩-" + root.slice(2, 8) + "-" + period + ".csv";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      });
      proMark(document.getElementById("g-csv"));
    }
    function bindRefresh() {
      var b = document.getElementById("g-refresh");
      if (b) b.onclick = function (e) { e.preventDefault(); delete teamCache[root]; run(true); };
    }
    run();
  }
  var runId = 0;
  A.teamGrowth = teamGrowth;

  // 顶部显示"你的付款地址"，不能输入别的地址
  function ownBar(m) {
    return '<div class="ownbar"><span>你的付款地址</span><b class="mono">' + A.short(m.addr) + '</b><span class="muted">会员只能查询自己付款的钱包</span></div>';
  }

  // 团队新增业绩：会员专属的单独页面
  function renderGrowth(id, addr) {
    var app = A.app, m = member();
    var head = '<h1>团队新增业绩 <span class="lv p1" style="vertical-align:4px">会员</span></h1>' +
      '<p class="sub">你的团队今天、昨天、近 7 天新增了多少业绩：按直推线汇总，列出每一笔的具体地址（高级 VIP 可导出表格）。</p>';
    if (!m) {
      app.innerHTML = head +
        '<div class="demo-cta"><div><b>会员专属功能</b><span class="muted">' + FEE_USD + ' 美元起（LGNS / AiLGNS / Polygon DAI 任选），初级永久、高级终生</span></div><a class="btn" href="#/member">开通会员 →</a></div>' +
        '<div class="features">' +
        '<div class="feature"><b>团队新增入金</b><span class="muted">今天 / 昨天 / 近 7 天，团队新增了多少 DAI 一眼看到</span></div>' +
        '<div class="feature"><b>按直推线汇总</b><span class="muted">哪条线在增长、增长了多少，按多少排序</span></div>' +
        '<div class="feature"><b>具体到每个地址</b><span class="muted">谁、什么时候、投了多少 DAI 或销毁多少 LGNS</span></div>' +
        '<div class="feature"><b>导出表格 · 高级 VIP</b><span class="muted">一键下载，Excel 直接打开，带交易哈希可核对</span></div></div>';
      return;
    }
    var form = ownBar(m);
    if (!addr) {
      app.innerHTML = head + form + '<div class="empty">输入一个地址开始查询，或者 <a href="#/growth/' + m.addr + '">查我自己的团队</a></div>';
      bindForm("growth");
      return;
    }
    app.innerHTML = head + form + '<div class="crumbs"><b class="mono">' + A.short(addr) + '</b><a href="#/team/' + addr + '" style="margin-left:auto">团队与等级 →</a><a href="#/tree/' + addr + '">结构图 →</a></div>' +
      '<section class="card" id="growth"></section>';
    bindForm("growth");
    teamGrowth(id, addr, document.getElementById("growth"));
  }

  // 团队与等级：会员专属
  function renderTeamGate(id, addr) {
    if (member()) return A.renderTeam(id, addr);
    A.app.innerHTML = '<h1>团队与等级 <span class="lv p1" style="vertical-align:4px">会员</span></h1>' +
      '<p class="sub">查看你自己（付款钱包）的直推线、每条线的团队地址数和入金（DAI）、三个区业绩，以及官方 P1–P7 等级。</p>' +
      '<div class="demo-cta"><div><b>会员专属功能</b><span class="muted">' + FEE_USD + ' 美元起（LGNS / AiLGNS / Polygon DAI 任选），初级永久、高级终生</span></div><a class="btn" href="#/member">开通会员 →</a></div>' +
      '<div class="features">' +
      '<div class="feature"><b>直推线一览</b><span class="muted">每条线的等级、团队地址数、团队入金，按入金排序</span></div>' +
      '<div class="feature"><b>三个区业绩</b><span class="muted">对比下一级门槛，差多少一目了然</span></div>' +
      '<div class="feature"><b>一层层往下查</b><span class="muted">点任意直推，继续看他的团队</span></div>' +
      '<div class="feature"><b>全网等级分布</b><span class="muted">P1–P7 各有多少个地址、门槛多少</span></div></div>' +
      '<p class="note">开通后同时解锁「团队新增业绩」和「团队结构图」。<a href="#/tree">先看看结构图示例 →</a></p>';
  }

  // ---------- 页面：上级查询（高级 VIP）：输入任意地址（比如卖币的地址），列出他的所有上级，一直到最顶层 ----------
  function copyText(text, btn) {
    function ok() { var t = btn.textContent; btn.textContent = "已复制 ✓"; setTimeout(function () { btn.textContent = t; }, 1500); }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, fallback);
    fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { btn.textContent = "请长按地址复制"; }
      ta.remove();
    }
  }
  function renderUpline(id, addr) {
    var app = A.app, head = '<h1>上级查询 <span class="vip vip-pro" style="font-size:.5em">高级 VIP</span></h1>' +
      '<p class="sub">输入任意地址（比如在 DEX 卖币的地址），列出他的上级、上级的上级……一直到最顶层，每个地址都能一键复制，用来锁定他所在的整条线。</p>';
    if (!isPro()) {
      app.innerHTML = head + '<div class="demo-cta"><div><b>高级 VIP · 尊享级专属</b><span class="muted">' + (member() ? "你已是初级 VIP，补 " + (PRO_USD - FEE_USD) + " 美元差价即可升级" : PRO_USD + " 美元等值，一次付款终生使用") + '</span></div><a class="btn" href="#/member">' + (member() ? "去升级 →" : "开通会员 →") + "</a></div>" +
        '<div class="features"><div class="feature"><b>卖币地址锁定上级</b><span class="muted">输入卖币地址，立刻看到他的上级、上级的上级，一直到最顶层</span></div>' +
        '<div class="feature"><b>一键复制</b><span class="muted">单个复制，或整条链一次复制，直接发给团队长</span></div>' +
        '<div class="feature"><b>标出 P 等级</b><span class="muted">链上哪个上级有官方 P 等级，一眼看到</span></div></div>';
      return;
    }
    app.innerHTML = head + '<form class="search" id="up-form"><input id="up-a" placeholder="输入要查的地址 0x…" value="' + (addr || "") + '" autocomplete="off" spellcheck="false"><button>查询上级</button></form><div id="up-out"></div>';
    document.getElementById("up-form").onsubmit = function (e) {
      e.preventDefault();
      var a = document.getElementById("up-a").value.trim().toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(a)) { document.getElementById("up-out").innerHTML = '<div class="card err">地址格式不对，应该是 0x 开头的 42 位</div>'; return; }
      if (a !== addr) location.hash = "#/upline/" + a; else show(a);
    };
    if (addr) show(addr);
    function show(a) {
      var out = document.getElementById("up-out");
      out.innerHTML = '<div class="loading">正在一层层往上查…（第一次查一条很长的链可能要 10 秒左右，查过的秒出）</div>';
      fetch("/api/upline?addr=" + a).then(function (r) { return r.json(); }).then(function (d) {
        if (!A.isCurrent(id)) return;
        if (d.error) throw new Error(d.error);
        if (!d.chain.length) { out.innerHTML = '<div class="card">' + (d.bound ? "这个地址已经是最顶层，没有上级。" : "这个地址还没有绑定推荐人，查不到上级。") + "</div>"; return; }
        var rows = d.chain.map(function (x, i) {
          return '<div class="up-row"><span class="up-n">上 ' + (i + 1) + ' 级</span><span class="mono up-a">' + x.a + "</span>" +
            (x.level ? '<span class="lv p' + Math.min(x.level, 7) + '">P' + x.level + "</span>" : "") +
            '<span class="up-act"><button class="ghost" data-copy="' + x.a + '">复制</button><a href="#/wallet/' + x.a + '">查看</a></span></div>';
        }).join("");
        var plain = d.chain.map(function (x) { return x.a; }).join("\n");
        var labeled = "查询地址：" + a + "\n" + d.chain.map(function (x, i) { return "上" + (i + 1) + "级：" + x.a + (x.level ? "（P" + x.level + "）" : ""); }).join("\n");
        var leaders = d.chain.filter(function (x) { return x.level; }).length;
        out.innerHTML = '<section class="card"><div class="card-head"><h2>共 ' + d.chain.length + " 层上级</h2>" + '<span class="muted">' + (leaders ? "其中 " + leaders + " 个有 P 等级" : "") + "</span></div>" +
          '<div class="up-row up-self"><span class="up-n">查询地址</span><span class="mono up-a">' + a + '</span><span class="up-act"><button class="ghost" data-copy="' + a + '">复制</button></span></div>' +
          '<div class="up-list">' + rows + "</div>" +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button id="up-copy-all">复制全部上级地址</button><button class="ghost" id="up-copy-lab">复制带层级的列表</button></div>' +
          '<p class="note">上 1 级是他的直接推荐人，往下数字越大越靠近最顶层。数据来自 Anubis 链上推荐关系，绑定后不会改变。</p></section>';
        out.querySelectorAll("[data-copy]").forEach(function (b) { b.onclick = function () { copyText(b.getAttribute("data-copy"), b); }; });
        document.getElementById("up-copy-all").onclick = function () { copyText(plain, this); };
        document.getElementById("up-copy-lab").onclick = function () { copyText(labeled, this); };
      }).catch(function (e) {
        if (A.isCurrent(id)) out.innerHTML = '<div class="card err">' + A.esc((e && e.message) || "查询失败，请稍后重试") + "</div>";
      });
    }
  }

  // 会员区的二级菜单：会员中心 / 团队与等级 / 团队结构图
  function subnav() {
    var el = document.getElementById("subnav");
    if (!el) return;
    var tab = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "";
    if (["member", "team", "growth", "tree", "upline"].indexOf(tab) < 0) { el.hidden = true; return; }
    var lock = member() ? "" : ' <span class="lock">🔒</span>';
    el.hidden = false;
    var mm = member();
    // 每项一个小图标；手机上排成两行宫格，不用左右拖
    var ICON = {
      member: '<path d="M4 17h16l-1.6-8.5-4.4 3.3L12 6l-2 5.8-4.4-3.3z"/><path d="M5 20h14"/>',
      team: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.2c2.4.2 4 1.8 4.6 4.8"/>',
      growth: '<path d="M4 19h16"/><path d="M5 15l4.5-4.5 3.5 3 6-6.5"/><path d="M14.5 7H19v4.5"/>',
      tree: '<rect x="9" y="3" width="6" height="4.5" rx="1.2"/><rect x="3" y="16" width="6" height="4.5" rx="1.2"/><rect x="15" y="16" width="6" height="4.5" rx="1.2"/><path d="M12 7.5V12M6 16v-2.5h12V16"/>',
      upline: '<path d="M12 21V8"/><path d="M7 12.5L12 7.5l5 5"/><circle cx="12" cy="4" r="1.6"/>'
    };
    el.innerHTML = [["member", "会员中心", mm ? ' <span class="vip-mini' + (mm.tier === "pro" ? " on" : "") + '">' + TIERS[mm.tier].short + "</span>" : ""], ["team", "团队与等级", lock], ["growth", "团队新增业绩", lock], ["tree", "团队结构图", lock], ["upline", "上级查询", isPro() ? "" : ' <span class="vip-mini">高级</span>']].map(function (t) {
      return '<a href="#/' + t[0] + '"' + (t[0] === tab ? ' class="on"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[t[0]] + "</svg><span>" + t[1] + t[2] + "</span></a>";
    }).join("");
  }
  window.addEventListener("hashchange", subnav);

  A.pages.member = function (id, a) { subnav(); renderMember(id, a); };
  // 会员功能只能查自己的付款地址：地址不是自己的就转回自己的
  function ownOnly(route, render) {
    return function (id, a) {
      var m = member();
      A.ownOnly = m ? m.addr : null;
      if (m && a !== m.addr) { location.replace("#/" + route + "/" + m.addr); return; }
      subnav();
      render(id, a);
    };
  }
  window.addEventListener("hashchange", function () {
    var tab = location.hash.replace(/^#\/?/, "").split("/")[0];
    if (["team", "growth", "tree"].indexOf(tab) < 0) A.ownOnly = null;
  });
  if (member()) warmTree(member().addr);
  A.pages.tree = ownOnly("tree", renderTree);
  A.pages.team = ownOnly("team", renderTeamGate);
  A.pages.growth = ownOnly("growth", renderGrowth);
  A.pages.upline = function (id, a) { A.ownOnly = null; subnav(); renderUpline(id, a); };
  // 给 otc.js 用的钱包工具
  A.wallet = { get: wallet, switchChain: switchChain, switchTo: switchTo, waitReceipt: waitReceipt, waitOn: waitOn, rpcOn: rpcOn, error: walletError, CHAIN: CHAIN };
})();
