// 会员：用钱包签名注册，付 20 美元等值的 Anubis LGNS / Anubis AiLGNS / Polygon DAI 开通（一次付款永久），开通后可以画团队结构图；未开通时展示示例结构图
(function () {
  "use strict";

  var A = window.AIL;
  var RECEIVER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 两条链都收到这个地址
  var FEE_USD = 20; // 会员价：20 美元等值
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

  // 三种付款方式：都按 20 美元等值折算
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
  // 20 美元需要多少枚（向上取整到这个币的显示精度）
  function need(m, price) { var k = Math.pow(10, m.digits); return Math.ceil(FEE_USD / price * k) / k; }
  function units(m, amount) { return BigInt(Math.round(amount * Math.pow(10, m.digits))) * 10n ** BigInt(m.dec - m.digits); }
  function show(m, amount) { return A.fmt(amount, m.digits) + " " + m.symbol; }

  // 一笔转账够不够：按付款那个区块之前的价格算
  function judge(m, amount, block, tx) {
    return m.price(m.chain === "anubis" ? block - 1 : null).then(function (p) {
      var n = need(m, p);
      return amount >= n * m.tol ? { method: m.id, chain: m.chain, tx: tx, block: block, paid: amount, need: n } : null;
    });
  }

  // 按地址找以前的付款：Anubis 用浏览器接口，Polygon 用节点分段查日志
  function findAnubis(addr, m) {
    var url = EXPLORER_API + "?module=account&action=tokentx&address=" + addr + "&contractaddress=" + m.token + "&startblock=" + START_BLOCK + "&page=1&offset=200&sort=asc";
    return A.getJSON(url).then(function (r) {
      var txs = (r.result || []).filter(function (t) { return t.from.toLowerCase() === addr && t.to.toLowerCase() === RECEIVER; });
      var sum = 0, i = 0;
      function next() {
        if (i >= txs.length) return null;
        var t = txs[i++];
        sum += Number(t.value) / Math.pow(10, m.dec); // 分几笔付也算，累计够数就开通
        return judge(m, sum, Number(t.blockNumber), t.hash).then(function (ok) { return ok || next(); });
      }
      return next();
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
      var sum = logs.reduce(function (t, l) { return t + Number(BigInt(l.data)) / 1e18; }, 0);
      if (!logs.length) return null;
      var last = logs[logs.length - 1];
      return judge(m, sum, parseInt(last.blockNumber, 16), last.transactionHash);
    });
  }
  function findPayment(addr) {
    if (addr.toLowerCase() === "0x6b26fa44754ef4927f0b1aec486ea6bea730a48a") {
      return Promise.resolve({ method: "gift", chain: "anubis", paid: 0 });
    }
    var tries = METHODS.map(function (m) { return (m.chain === "anubis" ? findAnubis(addr, m) : findPolygon(addr, m)).catch(function () { return null; }); });
    return Promise.all(tries).then(function (r) { return r.filter(Boolean)[0] || null; });
  }

  // 从交易回执里直接确认付款（钱包付款、或者用户填交易哈希）
  function paymentFromReceipt(chain, r, addr) {
    var checks = METHODS.filter(function (m) { return m.chain === chain; }).map(function (m) {
      var log = (r.logs || []).filter(function (l) {
        return l.address.toLowerCase() === m.token.toLowerCase() && l.topics[0] === TRANSFER &&
          "0x" + l.topics[1].slice(26) === addr && "0x" + l.topics[2].slice(26) === RECEIVER;
      })[0];
      return log ? judge(m, Number(BigInt(log.data)) / Math.pow(10, m.dec), parseInt(r.blockNumber, 16), r.transactionHash) : null;
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
  function member() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
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

  // 第 2 步：用钱包直接付款（切到对应的链 → 转账 → 等确认）
  function pay(reg, m, status) {
    var eth = wallet(), n, chain = CHAINS[m.chain];
    status("正在切换到 " + chain.name + " 链…");
    return switchTo(eth, m.chain).then(function () {
      return Promise.all([m.price(), rpcOn(m.chain, "eth_call", [{ to: m.token, data: "0x70a08231" + A.pad(reg.addr) }, "latest"])]);
    }).then(function (r) {
      n = need(m, r[0]);
      var bal = Number(BigInt(r[1])) / Math.pow(10, m.dec);
      if (bal < n) throw new Error(chain.name + " 链上的钱包里只有 " + show(m, bal) + "，开通需要 " + show(m, n));
      status("请在钱包里确认转账 " + show(m, n) + "（Gas 用 " + chain.gas + "）…");
      var data = "0xa9059cbb" + A.pad(RECEIVER) + units(m, n).toString(16).padStart(64, "0");
      return eth.request({ method: "eth_sendTransaction", params: [{ from: reg.addr, to: m.token, data: data }] });
    }).then(function (hash) {
      status("已提交，等待 " + chain.name + " 链确认…（通常几秒钟）");
      return waitOn(m.chain, hash);
    }).then(function (r) {
      return paymentFromReceipt(m.chain, r, reg.addr);
    }).then(function (p) {
      if (!p) throw new Error("转账已确认，但金额不够。请联系站长核对");
      return p;
    });
  }

  function activate(reg, p) {
    saveMember({ addr: reg.addr, msg: reg.msg, sig: reg.sig, method: p.method, chain: p.chain, tx: p.tx, block: p.block, paid: p.paid, at: Date.now() });
  }

  // ---------- 页面：会员 ----------
  function renderMember(id) {
    var app = A.app, m = member();
    var head = '<h1>会员</h1><p class="sub">用自己的钱包注册、付款，一次付款永久使用。开通后可以查任意地址的「团队与等级」「团队新增业绩」，并画出整个团队的结构图。</p>';
    if (m) {
      var pm = method(m.method || "lgns"), pc = CHAINS[m.chain || "anubis"];
      app.innerHTML = head + '<section class="card"><div class="card-head"><h2>✓ 你已经是会员</h2><span class="muted">本浏览器已验证</span></div><dl class="dl">' +
        "<dt>会员钱包</dt><dd>" + A.addrLink(m.addr) + "</dd><dt>付款</dt><dd>" + (m.method === "gift" ? "赠送会员（永久）" : show(pm, m.paid) + "（" + pc.name + '） · <a target="_blank" rel="noopener" href="' + pc.explorer + "/tx/" + m.tx + '">查看交易 ↗</a>') + "</dd></dl>" +
        '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><a class="btn" style="padding:10px 18px" href="#/tree">去画结构图 →</a><button class="ghost" id="logout" style="padding:10px 18px">退出</button></div>' +
        '<p class="note">换浏览器或换手机时，用同一个钱包点「连接钱包」再登录一次就行，不用重复付款。</p></section>';
      document.getElementById("logout").onclick = function () { logout(); subnav(); renderMember(id); };
      return;
    }
    app.innerHTML = head + '<div class="loading">正在读取实时价格…</div>';
    Promise.all(METHODS.map(function (x) { return x.price().catch(function () { return null; }); })).then(function (prices) {
      if (!A.isCurrent(id)) return;
      var needs = {};
      METHODS.forEach(function (x, i) { needs[x.id] = prices[i] ? need(x, prices[i]) : null; });
      var pick = METHODS.filter(function (x) { return needs[x.id]; })[0] || METHODS[0];

      app.innerHTML = head +
        '<div class="kpis"><div class="kpi hero"><div class="k">会员价</div><div class="v num">' + FEE_USD + '<small>美元等值</small></div><div class="d">三种币任选一种，按实时价格折算</div></div>' +
        '<div class="kpi"><div class="k">有效期</div><div class="v">永久</div><div class="d">一次付款，绑定你的钱包</div></div></div>' +
        '<section class="card"><div class="card-head"><h2>选择付款方式</h2><span class="muted">金额已按实时价格折算成 ' + FEE_USD + ' 美元</span></div><div class="paylist">' +
        METHODS.map(function (x, i) {
          var c = CHAINS[x.chain];
          return '<button class="payopt' + (x === pick ? " on" : "") + '" data-m="' + x.id + '"' + (needs[x.id] ? "" : " disabled") + '>' +
            '<span class="payopt-tok">' + x.symbol + '</span><span class="payopt-chain">' + c.name + ' 链</span>' +
            '<b class="num">' + (needs[x.id] ? A.fmt(needs[x.id], x.digits) : "—") + '</b><small>' + (x.id === "dai" ? "稳定币，固定 20" : "单价 " + A.fmt(prices[i], x.digits ? 2 : 5) + " DAI") + "</small></button>";
        }).join("") + "</div></section>" +
        '<section class="card"><div class="card-head"><h2>用钱包开通</h2><a href="#/tree">先看看效果 →</a></div>' +
        '<div class="flow"><div class="flow-step" id="s1"><b>1</b><div><div class="flow-t">连接钱包，签名注册</div><div class="muted">证明钱包是你的。只是签一段文字：<b>不花钱、不授权、不发交易</b>。已经付过款的，签完直接开通。</div></div></div>' +
        '<div class="flow-step" id="s2"><b>2</b><div><div class="flow-t" id="s2t"></div><div class="muted" id="s2d"></div></div></div></div>' +
        '<button id="go" style="padding:12px 22px;margin-top:4px">连接钱包</button><p class="note" id="st"></p>' +
        '<p class="note">手机上请在 <b>OKX、Bitget Wallet、TokenPocket、MetaMask</b> 等钱包的「DApp 浏览器 / 发现」里打开 <b>ailgns.dev</b>。电脑上需要装浏览器插件钱包。</p></section>' +
        '<details class="card manual"><summary>不方便用 DApp 浏览器？手动转账也可以</summary><ol class="steps" style="margin-top:12px">' +
        '<li id="man1"></li>' +
        '<li>收款地址（Anubis 和 Polygon 都是这个）：<div class="copy"><span class="mono" id="recv">' + RECEIVER + '</span><button class="ghost" id="copy">复制</button></div></li>' +
        "<li>转完后用<b>付款的那个钱包</b>打开本页，点「连接钱包」签名，会自动找到你的付款并开通（Polygon 付款自动查找最近 14 天）。</li>" +
        '<li>找不到的话，把付款的交易哈希贴在这里验证：<div class="copy"><input id="txh" class="mono" placeholder="0x…" spellcheck="false"><button class="ghost" id="txgo">验证</button></div></li></ol></details>' +
        '<p class="note">本站为独立运营的服务站，会员费由本站收取，与 AWAKE HELIX 项目方无关。只收上面三种币，转错币或转错链无法开通，也无法退回。本站不会向你索取私钥或助记词；除了这一笔自愿付款，任何以本站名义要求转账、授权的都是诈骗。</p>';

      var st = document.getElementById("st"), go = document.getElementById("go"), reg = null;
      function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; }
      function done(step) { document.getElementById(step).classList.add("ok"); }
      function describe() {
        var c = CHAINS[pick.chain], amt = show(pick, needs[pick.id]);
        document.getElementById("s2t").textContent = "钱包付款 " + amt + "（" + c.name + " 链）";
        document.getElementById("s2d").textContent = "自动切到 " + c.name + " 链，在钱包里确认一笔 " + pick.symbol + " 转账，Gas 用 " + c.gas + "。确认后几秒钟自动开通。";
        document.getElementById("man1").innerHTML = "在 <b>" + c.name + " 链</b>上转 <b>" + amt + "</b>（合约 " + A.short(pick.token) + "）";
        if (reg) go.textContent = "付款 " + amt;
      }
      describe();
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
      // 用交易哈希验证
      document.getElementById("txgo").onclick = function () {
        var h = document.getElementById("txh").value.trim(), btn = this;
        if (!/^0x[0-9a-fA-F]{64}$/.test(h)) { say("交易哈希格式不对，应该是 0x 开头的 66 位", true); return; }
        btn.disabled = true;
        ensureReg().then(function (r) {
          say("正在核对这笔交易…");
          return verifyHash(r.addr, h.toLowerCase()).then(function (p) {
            if (!p) throw new Error("这笔交易不是从你的钱包转给收款地址的，或者金额不够 20 美元");
            activate(r, p); say("验证成功，会员已开通！");
            setTimeout(function () { location.hash = "#/tree"; }, 800);
          });
        }).catch(function (e) { say(walletError(e), true); btn.disabled = false; });
      };
      go.onclick = function () {
        go.disabled = true;
        var step = reg ? Promise.resolve(reg) : ensureReg().then(function (r) {
          say("签名成功，正在查找你之前的付款…");
          return findPayment(r.addr).catch(function () { return null; }).then(function (p) {
            if (p) { activate(r, p); location.hash = "#/tree"; throw null; }
            return r;
          });
        });
        step.then(function (r) {
          describe();
          say("已注册 " + A.short(r.addr) + "。确认上面选的付款方式，点按钮用钱包付款。");
          go.disabled = false;
          go.onclick = function () {
            go.disabled = true;
            pay(r, pick, say).then(function (p) {
              done("s2"); activate(r, p);
              say("付款成功，会员已开通！");
              setTimeout(function () { location.hash = "#/tree"; }, 800);
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
        '<text x="14" y="48" fill="' + COLORS.muted + '" font-size="12">暂无团队或团队较小，未画出</text></g>';
    }
    var stroke = n === root ? COLORS.gold : n.level ? COLORS.gold : COLORS.line;
    var badge = n.level ? "P" + n.level : "—";
    var zone = n.zone ? ["一区", "二区", "三区"][n.zone - 1] : "";
    var s = '<g class="node" data-a="' + n.a + '" transform="translate(' + n.x + "," + n.y + ')" style="cursor:' + (n.direct ? "pointer" : "default") + '">' +
      "<title>" + e(n.a) + "\n团队 " + A.fmt(n.team) + " 人 · 团队算力 " + A.fmt(n.power) + " · 直推 " + A.fmt(n.direct) + "</title>" +
      '<rect width="' + NODE_W + '" height="' + NODE_H + '" rx="10" fill="' + COLORS.node + '" stroke="' + stroke + '" stroke-width="' + (n === root ? 2 : 1.2) + '"/>' +
      '<text x="14" y="23" fill="' + COLORS.text + '" font-size="13" font-family="ui-monospace,Menlo,Consolas,monospace" font-weight="600">' + A.short(n.a) + "</text>" +
      '<rect x="' + (NODE_W - 48) + '" y="9" width="36" height="19" rx="5" fill="' + (n.level ? COLORS.gold : COLORS.chip) + '"/>' +
      '<text x="' + (NODE_W - 30) + '" y="23" text-anchor="middle" fill="' + (n.level ? "#fff" : COLORS.muted) + '" font-size="12" font-weight="700">' + badge + "</text>" +
      (zone ? '<text x="' + (NODE_W - 56) + '" y="23" text-anchor="end" fill="' + COLORS.gold + '" font-size="11">' + zone + "</text>" : "") +
      '<text x="14" y="43" fill="' + COLORS.muted + '" font-size="12">团队 <tspan fill="' + COLORS.text + '">' + A.fmt(n.team) + '</tspan> 人 · 算力 <tspan fill="' + COLORS.text + '">' + A.wan(n.power).replace(" ", "") + "</tspan></text>" +
      '<text x="14" y="59" fill="' + COLORS.muted + '" font-size="12">直推 ' + A.fmt(n.direct) + (n.self ? " · 个人 " + A.wan(n.self).replace(" ", "") : "") + "</text>";
    if (n.direct) {
      s += '<circle cx="' + NODE_W + '" cy="' + NODE_H / 2 + '" r="10" fill="' + COLORS.bg + '" stroke="' + COLORS.line + '"/>' +
        '<text x="' + NODE_W + '" y="' + (NODE_H / 2 + 4.5) + '" text-anchor="middle" fill="' + COLORS.text + '" font-size="14">' + (n.loading ? "…" : n.expanded ? "−" : "+") + "</text>";
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
      fit: function (w, h) {
        k = Math.max(0.5, Math.min(1, (box.clientWidth - 16) / w, (box.clientHeight - 16) / h));
        tx = Math.max(8, (box.clientWidth - w * k) / 2);
        ty = h * k < box.clientHeight ? (box.clientHeight - h * k) / 2 : 8;
        apply();
      },
      wasDrag: function () { return moved; }
    };
  }

  function exportPng(root) {
    var t = treeSvg(root), scale = 2;
    var svg = t.svg.replace("<svg ", '<svg style="background:' + COLORS.bg + '" ');
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      c.width = t.w * scale; c.height = t.h * scale;
      var g = c.getContext("2d");
      g.fillStyle = COLORS.bg; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      // 右下角品牌水印
      g.font = "600 " + 13 * scale + "px -apple-system, PingFang SC, Microsoft YaHei, sans-serif";
      g.fillStyle = "rgba(112, 39, 217, .55)";
      g.textAlign = "right";
      g.fillText("AiLGNS 服务站 · ailgns.dev", c.width - 16 * scale, c.height - 12 * scale);
      c.toBlob(function (b) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "AiLGNS服务站-团队-" + root.a.slice(2, 8) + ".png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // 示例数据：随机生成一个团队，只用来展示效果
  function demoTree() {
    var seed = 20261030;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    function addr() { var s = "0x"; for (var i = 0; i < 40; i++) s += "0123456789abcdef"[Math.floor(rnd() * 16)]; return s; }
    function levelOf(p) { return p >= 3.75e6 ? 3 : p >= 1.1e6 ? 2 : p >= 3.8e5 ? 1 : 0; }
    function node(power, depth) {
      var team = Math.max(0, Math.round(power / (2000 + rnd() * 3000)));
      var n = { a: addr(), power: Math.round(power), team: team, self: Math.round(5000 + rnd() * 40000), level: levelOf(power / 3), direct: 0, children: null, expanded: false, demo: true };
      if (team > 0 && depth < 5) {
        var k = Math.min(6, 2 + Math.floor(rnd() * 5)), left = power * 0.85, kids = [];
        for (var i = 0; i < k; i++) { var share = i === k - 1 ? left : left * (0.35 + rnd() * 0.4); left -= share; kids.push(node(share, depth + 1)); }
        kids.sort(function (x, y) { return y.power - x.power; });
        kids.forEach(function (c, i) { c.zone = i < 3 && c.power > 0 ? i + 1 : 0; });
        n.children = kids;
        n.more = Math.floor(rnd() * 9);
        n.direct = kids.length + n.more;
      }
      return n;
    }
    var root = node(2.9e7, 0);
    root.level = 4;
    root.expanded = true;
    root.children.slice(0, 3).forEach(function (c) { c.expanded = true; });
    return root;
  }

  function diagramHtml(note) {
    return '<div class="tree-bar"><button class="ghost" data-z="1.25">放大</button><button class="ghost" data-z="0.8">缩小</button><button class="ghost" data-fit>适应屏幕</button>' +
      '<button class="ghost" data-expand>展开下一层</button><button data-png>导出图片</button><span class="muted" id="tree-status"></span></div>' +
      '<div class="tree-box" id="tree-box"><div class="tree-inner" id="tree-inner"></div></div><p class="note">' + note + "</p>";
  }

  // 把树画进页面，并接上点击展开、缩放、导出；load(n) 负责读取节点的直推
  function mountDiagram(id, root, load) {
    var app = A.app;
    var box = document.getElementById("tree-box"), inner = document.getElementById("tree-inner"), st = document.getElementById("tree-status");
    var pz = panZoom(box, inner), size;
    function draw(fit) {
      var t = treeSvg(root);
      inner.innerHTML = t.svg;
      size = t;
      if (fit) pz.fit(t.w, t.h);
    }
    draw(true);
    inner.addEventListener("click", function (e) {
      if (pz.wasDrag()) return;
      var g = e.target.closest(".node");
      if (!g) return;
      var n = find(root, g.getAttribute("data-a"));
      if (!n || !n.direct || n.loading || n === root && !n.children) return;
      if (n.children) { n.expanded = !n.expanded; draw(); return; }
      n.loading = true; draw();
      load(n).then(function () { n.loading = false; n.expanded = true; if (A.isCurrent(id)) draw(); }, function () { n.loading = false; draw(); });
    });
    app.querySelector("[data-fit]").onclick = function () { pz.fit(size.w, size.h); };
    app.querySelectorAll("[data-z]").forEach(function (b) { b.onclick = function () { pz.zoom(Number(b.getAttribute("data-z"))); }; });
    app.querySelector("[data-png]").onclick = function () { exportPng(root); };
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

  var LEGEND = "紫色边框 = 有 P 等级；一区、二区、三区按团队算力从大到小估算，以官方等级为准。每层最多画出算力最大的 " + MAX_CHILDREN + " 个直推，没有团队的直推合并显示。";

  function renderTree(id, addr) {
    var app = A.app, m = member();
    if (!m) {
      app.innerHTML = '<h1>团队结构图 <span class="lv p1" style="vertical-align:4px">会员</span></h1>' +
        '<p class="sub">开通会员后，输入任意钱包地址，就能画出这样的团队结构图。下面是<b>示例效果</b>，可以直接点、拖、缩放试试。</p>' +
        '<div class="demo-cta"><div><b>' + "一次付款，永久使用" + '</b><span class="muted">用钱包注册、付款，几秒钟开通</span></div><a class="btn" href="#/member">开通会员 →</a></div>' +
        '<div class="features">' +
        '<div class="feature"><b>整条线一目了然</b><span class="muted">谁是一区、二区、三区，每条线多少人、多少算力</span></div>' +
        '<div class="feature"><b>一层层往下点</b><span class="muted">点 + 展开任意一个人的下级，几十层也能看</span></div>' +
        '<div class="feature"><b>等级标得清清楚楚</b><span class="muted">P1–P7 紫色标记，数据来自官方接口</span></div>' +
        '<div class="feature"><b>导出图片</b><span class="muted">一键保存高清 PNG，直接发团队群</span></div></div>' +
        '<div class="demo-tag">示例效果 · 地址和数据都是随机生成的</div>' +
        diagramHtml(LEGEND);
      mountDiagram(id, demoTree(), function () { return Promise.resolve(); });
      return;
    }
    var head = '<h1>团队结构图 <span class="lv p1" style="vertical-align:4px">会员</span></h1><p class="sub">输入地址，画出团队结构。点节点右边的 + 展开下一层，拖动平移，滚轮或双指缩放。</p>';
    var form = '<form class="search" data-custom><input name="a" placeholder="粘贴钱包地址 0x…" autocomplete="off" spellcheck="false" value="' + A.esc(addr || "") + '"><button>画图</button></form>';
    if (!addr) {
      app.innerHTML = head + form + '<div class="empty">输入一个地址开始画图，或者 <a href="#/tree/' + m.addr + '">画我自己的团队</a></div>';
      bindForm();
      return;
    }
    app.innerHTML = head + form + '<div class="loading">正在读取团队…</div>';
    bindForm();
    var root;
    loadNode(addr).then(function (r) {
      root = r;
      if (!root.direct) return;
      root.expanded = true;
      return loadChildren(root);
    }).then(function () {
      if (!A.isCurrent(id)) return;
      app.innerHTML = head + form + diagramHtml(LEGEND);
      bindForm();
      mountDiagram(id, root, loadChildren);
    }, function () {
      if (A.isCurrent(id)) app.innerHTML = head + form + '<div class="card err">读取失败，请确认地址正确，稍后再试。</div>';
      bindForm();
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
  var teamCache = {};
  function buildTeam(root, progress) {
    var hit = teamCache[root];
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return Promise.resolve(hit.team);
    var team = {}, frontier = [root], level = 0;
    team[root] = { line: "self", depth: 0 };
    function refCall(a, off, lim) {
      return ["eth_call", [{ to: COMMUNITY, data: "0xc01b35a1" + A.pad(a) + off.toString(16).padStart(64, "0") + lim.toString(16).padStart(64, "0") }, "latest"]];
    }
    function batched(calls) {
      var chunks = [];
      for (var i = 0; i < calls.length; i += 200) chunks.push(calls.slice(i, i + 200));
      return A.pool(chunks, 3, batchRpc).then(function (r) { return [].concat.apply([], r); });
    }
    function step() {
      if (!frontier.length || level > 200) {
        teamCache[root] = { at: Date.now(), team: team };
        return Promise.resolve(team);
      }
      level++;
      // 先查每个人有多少直推，再分页读出直推地址（每页最多 100，不能超过剩余数量）
      return batched(frontier.map(function (a) { return refCall(a, 0, 0); })).then(function (counts) {
        var pages = [];
        frontier.forEach(function (a, i) {
          var h = counts[i], total = h ? parseInt(h.slice(2, 66), 16) : 0;
          for (var off = 0; off < total; off += 100) pages.push({ parent: a, call: refCall(a, off, Math.min(100, total - off)) });
        });
        return batched(pages.map(function (p) { return p.call; })).then(function (res) {
          var next = [];
          pages.forEach(function (p, i) {
            var h = res[i];
            if (!h) return;
            var len = parseInt(h.slice(2 + 128, 2 + 192), 16), par = team[p.parent];
            for (var k = 0; k < len; k++) {
              var c = "0x" + h.slice(2 + (3 + k) * 64 + 24, 2 + (4 + k) * 64);
              if (team[c]) continue;
              team[c] = { line: p.parent === root ? c : par.line, depth: par.depth + 1 };
              next.push(c);
            }
          });
          frontier = next;
          if (progress) progress(Object.keys(team).length - 1);
          return step();
        });
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
    return A.pool(ranges, 4, function (r) {
      return A.rpc("eth_getLogs", [{ address: POWER, topics: [[DAI_QUEUED, LGNS_BURN]], fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16) }]);
    }).then(function (chunks) {
      return [].concat.apply([], chunks.map(function (c) { return c || []; })).map(function (l) {
        var d = l.data.slice(2), lgns = l.topics[0] === LGNS_BURN, amt = Number(BigInt("0x" + d.slice(0, 64)));
        return { addr: "0x" + l.topics[1].slice(26), kind: lgns ? "LGNS" : "DAI", dai: lgns ? 0 : amt / 1e18, lgns: lgns ? amt / 1e9 : 0,
          power: Number(BigInt("0x" + d.slice(64, 128))) / 1e18, block: parseInt(l.blockNumber, 16), tx: l.transactionHash };
      });
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
    function run() {
      var my = ++runId, r = periodRange(period);
      var say = function (t) { if (my === runId && A.isCurrent(id)) shell('<div class="loading">' + t + "</div>"); };
      say("正在读取这段时间的全部投资记录…");
      var latest, from, to;
      // 团队名单和投资记录同时读
      var teamP = buildTeam(root, function (n) { var el2 = el.querySelector(".loading"); if (el2 && my === runId) el2.textContent = "正在读取团队名单…已读到 " + A.fmt(n) + " 人"; });
      A.rpc("eth_getBlockByNumber", ["latest", false]).then(function (b) {
        latest = { n: parseInt(b.number, 16), t: parseInt(b.timestamp, 16) };
        return Promise.all([blockAt(r[0], latest), r[1] ? blockAt(r[1], latest).then(function (x) { return x - 1; }) : latest.n]);
      }).then(function (bs) {
        from = bs[0]; to = bs[1];
        return depositsBetween(from, to);
      }).then(function (deps) {
        say("共 " + A.fmt(deps.length) + " 笔投资，正在读取团队名单…");
        return teamP.then(function (known) { return { deps: deps, known: known }; });
      }).then(function (x) {
        if (my !== runId || !A.isCurrent(id)) return;
        var t0 = r[0], t1 = r[1] || latest.t, span = Math.max(1, to - from);
        var rows = x.deps.filter(function (d) { return x.known[d.addr]; }).map(function (d) {
          var k = x.known[d.addr];
          return { addr: d.addr, kind: d.kind, dai: d.dai, lgns: d.lgns, power: d.power, tx: d.tx, line: k.line, depth: k.depth, t: t0 + (d.block - from) / span * (t1 - t0) };
        }).sort(function (a, b) { return b.t - a.t; });
        lastRows = rows;
        draw(rows, x.deps.length);
      }).catch(function () {
        if (my === runId && A.isCurrent(id)) shell('<div class="card err">读取失败，请稍后再试。</div>');
      });
    }
    function draw(rows, scanned) {
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
      var html = '<div class="kpis" style="margin-top:4px"><div class="kpi hero"><div class="k">团队新增算力</div><div class="v num">' + A.fmt(sum(team)) + '</div><div class="d">' + team.length + " 笔 · " + uniq(team) + " 个地址</div></div>" +
        '<div class="kpi"><div class="k">其中 DAI 投入</div><div class="v num">' + A.fmt(sum(team, "dai"), 2) + '<small>DAI</small></div><div class="d">真实 DAI，P 等级按这个算</div></div>' +
        '<div class="kpi"><div class="k">其中销毁 LGNS</div><div class="v num">' + A.fmt(sum(team, "lgns"), 2) + '<small>LGNS</small></div><div class="d">换来的算力也计入新增</div></div>' +
        '<div class="kpi"><div class="k">本人新增</div><div class="v num">' + A.fmt(sum(self)) + '</div><div class="d">' + self.length + " 笔（不计入团队）</div></div></div>";
      if (!rows.length) {
        el.innerHTML = "";
        shell(html + '<div class="empty">这段时间团队里没有新增投资（全网共 ' + A.fmt(scanned) + " 笔）</div>");
        return;
      }
      html += '<h3 class="g-h">按直推线</h3><div class="tbl-wrap"><table class="cards"><thead><tr><th class="l">直推线</th><th>新增算力</th><th>DAI 投入</th><th>销毁 LGNS</th><th>笔数</th><th>地址数</th></tr></thead><tbody>' +
        lineList.map(function (L) {
          return '<tr><td data-l="直推线" class="l">' + A.addrLink(L.line, "team") + '</td><td data-l="新增算力"><b>' + A.fmt(L.power) + '</b></td><td data-l="DAI 投入">' + A.fmt(L.dai, 2) + '</td><td data-l="销毁 LGNS">' + A.fmt(L.lgns, 2) +
            '</td><td data-l="笔数">' + L.n + '</td><td data-l="地址数">' + Object.keys(L.who).length + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      html += '<div class="card-head" style="margin-top:18px"><h3 class="g-h" style="margin:0">具体地址</h3><button class="ghost" id="g-csv" style="padding:6px 14px">导出表格</button></div><div class="tbl-wrap"><table class="cards"><thead><tr><th class="l">时间</th><th class="l">地址</th><th class="l">方式</th><th>投入</th><th>新增算力</th><th class="l">所属直推线</th><th>第几层</th></tr></thead><tbody>' +
        rows.slice(0, 500).map(function (r) {
          return '<tr><td data-l="时间" class="l">' + fmtT(r.t) + '</td><td data-l="地址" class="l">' + A.addrLink(r.addr, "team") + '</td><td data-l="方式" class="l">' + (r.kind === "LGNS" ? "销毁 LGNS" : "DAI 买入") +
            '</td><td data-l="投入">' + (r.kind === "LGNS" ? A.fmt(r.lgns, 2) + " LGNS" : A.fmt(r.dai, 2) + " DAI") + '</td><td data-l="新增算力"><b>' + A.fmt(r.power) + "</b>" +
            '</td><td data-l="所属直推线" class="l">' + (r.line === "self" ? "本人" : A.addrLink(r.line, "team")) + '</td><td data-l="第几层">' + (r.line === "self" ? "—" : r.depth) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        (rows.length > 500 ? '<p class="note">只显示最近 500 笔，导出表格可以拿到全部 ' + rows.length + " 笔。</p>" : "") +
        '<p class="note">这里是链上逐笔记录：团队里每一笔用 DAI 买算力、销毁 LGNS 换算力，都能对应到具体地址和交易。官方的「增长算力」是奖励公式算出来的数，和这里的原始投入不是同一个口径；P 等级的三区业绩只算 DAI 投入。时间按区块估算，误差在一分钟以内。</p>';
      shell(html);
      document.getElementById("g-csv").onclick = function () {
        var csv = "时间,地址,方式,DAI,LGNS,新增算力,所属直推线,第几层,交易\n" + lastRows.map(function (r) {
          return [fmtT(r.t), r.addr, r.kind === "LGNS" ? "销毁LGNS" : "DAI买入", r.dai, r.lgns, r.power, r.line === "self" ? "本人" : r.line, r.line === "self" ? "" : r.depth, r.tx].join(",");
        }).join("\n");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
        a.download = "团队新增业绩-" + root.slice(2, 8) + "-" + period + ".csv";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      };
    }
    run();
  }
  var runId = 0;
  A.teamGrowth = teamGrowth;

  // 团队新增业绩：会员专属的单独页面
  function renderGrowth(id, addr) {
    var app = A.app, m = member();
    var head = '<h1>团队新增业绩 <span class="lv p1" style="vertical-align:4px">会员</span></h1>' +
      '<p class="sub">输入地址，查这个团队今天、昨天、近 7 天新增了多少业绩：按直推线汇总，列出每一笔的具体地址，可以导出表格。</p>';
    if (!m) {
      app.innerHTML = head +
        '<div class="demo-cta"><div><b>会员专属功能</b><span class="muted">' + FEE_USD + ' 美元等值（LGNS / AiLGNS / Polygon DAI 任选），一次付款永久使用</span></div><a class="btn" href="#/member">开通会员 →</a></div>' +
        '<div class="features">' +
        '<div class="feature"><b>团队新增算力</b><span class="muted">今天 / 昨天 / 近 7 天，一眼看到团队涨了多少</span></div>' +
        '<div class="feature"><b>按直推线汇总</b><span class="muted">哪条线在增长、增长了多少，按多少排序</span></div>' +
        '<div class="feature"><b>具体到每个地址</b><span class="muted">谁、什么时候、投了多少 DAI 或销毁多少 LGNS</span></div>' +
        '<div class="feature"><b>导出表格</b><span class="muted">一键下载，Excel 直接打开，带交易哈希可核对</span></div></div>';
      return;
    }
    var form = '<form class="search" data-custom><input name="a" placeholder="粘贴钱包地址 0x…" autocomplete="off" spellcheck="false" value="' + A.esc(addr || "") + '"><button>查询</button></form>';
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
      '<p class="sub">查看任意地址的直推线、每条线的团队人数和算力、三个区业绩，以及官方 P1–P7 等级。</p>' +
      '<div class="demo-cta"><div><b>会员专属功能</b><span class="muted">' + FEE_USD + ' 美元等值（LGNS / AiLGNS / Polygon DAI 任选），一次付款永久使用</span></div><a class="btn" href="#/member">开通会员 →</a></div>' +
      '<div class="features">' +
      '<div class="feature"><b>直推线一览</b><span class="muted">每条线的等级、团队人数、团队算力，按算力排序</span></div>' +
      '<div class="feature"><b>三个区业绩</b><span class="muted">对比下一级门槛，差多少一目了然</span></div>' +
      '<div class="feature"><b>一层层往下查</b><span class="muted">点任意直推，继续看他的团队</span></div>' +
      '<div class="feature"><b>全网等级分布</b><span class="muted">P1–P7 各有多少人、门槛多少</span></div></div>' +
      '<p class="note">开通后同时解锁「团队新增业绩」和「团队结构图」。<a href="#/tree">先看看结构图示例 →</a></p>';
  }

  // 会员区的二级菜单：会员中心 / 团队与等级 / 团队结构图
  function subnav() {
    var el = document.getElementById("subnav");
    if (!el) return;
    var tab = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "";
    if (["member", "team", "growth", "tree"].indexOf(tab) < 0) { el.hidden = true; return; }
    var lock = member() ? "" : ' <span class="lock">🔒</span>';
    el.hidden = false;
    el.innerHTML = [["member", "会员中心", ""], ["team", "团队与等级", lock], ["growth", "团队新增业绩", lock], ["tree", "团队结构图", lock]].map(function (t) {
      return '<a href="#/' + t[0] + '"' + (t[0] === tab ? ' class="on"' : "") + ">" + t[1] + t[2] + "</a>";
    }).join("");
  }
  window.addEventListener("hashchange", subnav);

  A.pages.member = function (id, a) { subnav(); renderMember(id, a); };
  A.pages.tree = function (id, a) { subnav(); renderTree(id, a); };
  A.pages.team = function (id, a) { subnav(); renderTeamGate(id, a); };
  A.pages.growth = function (id, a) { subnav(); renderGrowth(id, a); };
  // 给 otc.js 用的钱包工具
  A.wallet = { get: wallet, switchChain: switchChain, waitReceipt: waitReceipt, error: walletError, CHAIN: CHAIN };
})();
