// 钱包自动识别：EIP-6963 标准钱包 + 老式注入钱包；多个钱包时让用户选，手机上没有钱包时给出"在钱包 App 里打开"
(function () {
  "use strict";

  var A = window.AIL;
  var KEY = "ailgns-wallet-v1";
  var announced = [];
  var current = null;
  var listeners = [];

  // EIP-6963：钱包主动报上名字和图标
  window.addEventListener("eip6963:announceProvider", function (e) {
    var d = e.detail;
    if (!d || !d.provider || !d.info) return;
    if (announced.some(function (w) { return w.info.uuid === d.info.uuid; })) return;
    announced.push(d);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // 老式注入：按各家钱包的特征识别
  function legacy() {
    var out = [], eth = window.ethereum;
    function add(id, name, p) { if (p && typeof p.request === "function") out.push({ id: id, name: name, provider: p }); }
    add("okx", "OKX Wallet", window.okxwallet);
    add("bitget", "Bitget Wallet", window.bitkeep && window.bitkeep.ethereum);
    add("trust", "Trust Wallet", window.trustwallet && (window.trustwallet.ethereum || window.trustwallet));
    add("coinbase", "Coinbase Wallet", window.coinbaseWalletExtension);
    var injected = eth && eth.providers && eth.providers.length ? eth.providers : eth ? [eth] : [];
    injected.forEach(function (p) {
      var name = p.isOkxWallet || p.isOKExWallet ? "OKX Wallet" : p.isBitKeep || p.isBitgetWallet ? "Bitget Wallet" : p.isTokenPocket ? "TokenPocket" :
        p.isImToken ? "imToken" : p.isTrust || p.isTrustWallet ? "Trust Wallet" : p.isRabby ? "Rabby" : p.isCoinbaseWallet ? "Coinbase Wallet" :
        p.isMetaMask ? "MetaMask" : "浏览器钱包";
      add(name.toLowerCase().replace(/\s/g, ""), name, p);
    });
    return out;
  }

  // 合并去重：同一个钱包对象只出现一次，优先用 EIP-6963 的名字和图标
  function list() {
    var all = announced.map(function (d) { return { id: d.info.rdns || d.info.uuid, name: d.info.name, icon: d.info.icon, provider: d.provider }; });
    legacy().forEach(function (w) {
      var dup = all.some(function (x) { return x.provider === w.provider || x.name === w.name; });
      if (!dup) all.push(w);
    });
    return all;
  }

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(id) { try { localStorage.setItem(KEY, id); } catch (e) { /* 隐私模式不保存 */ } }
  function use(w) {
    if (current && current.provider === w.provider) return w.provider;
    current = w;
    save(w.id);
    if (w.provider.on) w.provider.on("accountsChanged", function (a) { listeners.forEach(function (fn) { fn(a); }); });
    return w.provider;
  }

  // 等 EIP-6963 钱包报到（一般几十毫秒内）
  function settle() { return new Promise(function (ok) { setTimeout(ok, 120); }); }

  // 自动选钱包：记住的 > 只有一个 > 让用户选 > 没有钱包
  function choose() {
    if (current) return Promise.resolve(current.provider);
    return settle().then(function () {
      var ws = list(), id = saved();
      var hit = ws.filter(function (w) { return w.id === id; })[0];
      if (hit) return use(hit);
      if (ws.length === 1) return use(ws[0]);
      if (ws.length > 1) return picker(ws).then(use);
      noWallet();
      throw new Error("没有检测到钱包，请按提示在钱包 App 里打开本站");
    });
  }

  // 不弹窗：已经授权过本站的钱包直接拿到地址
  function silent() {
    return settle().then(function () {
      var ws = list(), id = saved();
      var w = ws.filter(function (x) { return x.id === id; })[0] || (ws.length === 1 ? ws[0] : null);
      if (!w) return null;
      return w.provider.request({ method: "eth_accounts" }).then(function (a) {
        if (!a || !a[0]) return null;
        use(w);
        return String(a[0]).toLowerCase();
      }, function () { return null; });
    });
  }

  function iconHtml(w) {
    return w.icon ? '<img src="' + A.esc(w.icon) + '" alt="">' : '<span class="wicon">' + A.esc(w.name.slice(0, 1)) + "</span>";
  }

  function sheet(html) {
    var m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = '<div class="modal-box">' + html + "</div>";
    document.body.appendChild(m);
    function close() { m.remove(); }
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-close]")) close(); });
    return { el: m, close: close };
  }

  function picker(ws) {
    return new Promise(function (ok, fail) {
      var s = sheet('<div class="card-head"><h2>选择钱包</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
        '<p class="note" style="margin:-6px 0 0">检测到 ' + ws.length + " 个钱包，选一个继续（会记住你的选择）</p>" +
        '<div class="wlist">' + ws.map(function (w, i) { return '<button class="wbtn" data-i="' + i + '">' + iconHtml(w) + "<span>" + A.esc(w.name) + "</span></button>"; }).join("") + "</div>");
      s.el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-i]");
        if (b) { s.close(); ok(ws[Number(b.getAttribute("data-i"))]); }
        else if (e.target === s.el || e.target.closest("[data-close]")) fail(new Error("没有选择钱包"));
      });
    });
  }

  // 没有钱包：手机给"在钱包 App 里打开"，电脑给安装链接
  function noWallet() {
    var url = location.href, bare = url.replace(/^https?:\/\//, "");
    var mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    var apps = [
      ["OKX Wallet", "okx://wallet/dapp/url?dappUrl=" + encodeURIComponent(url)],
      ["Bitget Wallet", "bitkeep://bkconnect?action=dapp&url=" + encodeURIComponent(url)],
      ["TokenPocket", "tpdapp://open?params=" + encodeURIComponent(JSON.stringify({ url: url }))],
      ["MetaMask", "https://metamask.app.link/dapp/" + bare],
      ["Trust Wallet", "https://link.trustwallet.com/open_url?coin_id=60&url=" + encodeURIComponent(url)],
      ["imToken", "imtokenv2://navigate/DappView?url=" + encodeURIComponent(url)]
    ];
    var installs = [["MetaMask", "https://metamask.io/download/"], ["OKX Wallet", "https://www.okx.com/web3"], ["Bitget Wallet", "https://web3.bitget.com/"]];
    var s = sheet('<div class="card-head"><h2>' + (mobile ? "在钱包 App 里打开" : "没有检测到钱包") + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
      '<p class="note" style="margin:-6px 0 0">' + (mobile ? "普通浏览器连不了钱包。点你手机上装的钱包，会自动在它的 DApp 浏览器里打开本页：" : "请先安装一个浏览器钱包插件，装好后刷新本页：") + "</p>" +
      '<div class="wlist">' + (mobile ? apps : installs).map(function (a) {
        return '<a class="wbtn" href="' + a[1] + '"' + (mobile ? "" : ' target="_blank" rel="noopener"') + '><span class="wicon">' + a[0].slice(0, 1) + "</span><span>" + a[0] + "</span></a>";
      }).join("") + "</div>" +
      '<div class="copy"><span class="mono">' + A.esc(url) + '</span><button class="ghost" id="w-copy">复制网址</button></div>' +
      '<p class="note" style="margin:0">没有反应的话：复制网址，打开钱包 App 的「发现 / DApp 浏览器」粘贴打开。</p>');
    s.el.querySelector("#w-copy").onclick = function () {
      var b = this;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = "已复制"; }, function () { b.textContent = "请手动复制"; });
    };
  }

  A.wallets = {
    list: list,
    choose: choose,
    silent: silent,
    current: function () { return current && current.provider; },
    name: function () { return current && current.name; },
    forget: function () { current = null; try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } },
    onAccounts: function (fn) { listeners.push(fn); }
  };
})();
