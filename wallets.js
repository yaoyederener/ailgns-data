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

  // 是不是从手机桌面图标打开的（添加到主屏幕）
  function standalone() { return !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone); }

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
    var s = sheet('<div class="card-head"><h2>' + (mobile ? "到钱包 App 里操作" : "没有检测到钱包") + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
      '<p class="note" style="margin:-6px 0 0">' + (mobile ? "这里连不了钱包（桌面图标和普通浏览器都一样）。点你手机上装的钱包，会自动跳过去并打开<b>当前这一页</b>，在那里连接、确认就行：" : "请先安装一个浏览器钱包插件，装好后刷新本页：") + "</p>" +
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
    openIn: noWallet, // 弹出「在钱包 App 里打开」
    standalone: standalone,
    silent: silent,
    current: function () { return current && current.provider; },
    name: function () { return current && current.name; },
    forget: function () { current = null; try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } },
    onAccounts: function (fn) { listeners.push(fn); }
  };

  // ---------- 添加到手机桌面：醒目的横幅 + 分手机、分浏览器的图解教程 ----------
  var UA = navigator.userAgent;
  var ENV = {
    ios: /iPhone|iPad|iPod/i.test(UA),
    android: /Android/i.test(UA),
    wechat: /MicroMessenger/i.test(UA),
    qq: / QQ\/[\d.]/i.test(UA), // QQ App 里打开（QQ 浏览器 App 的 UA 只有 MQQBrowser，没有 " QQ/"）
    other: /DingTalk|Weibo|AlipayClient|Lark|Feishu/i.test(UA),
    qqBrowser: /MQQBrowser/i.test(UA) && !/ QQ\/[\d.]/i.test(UA),
    uc: /UCBrowser/i.test(UA),
    iosChrome: /CriOS/i.test(UA),
    vendor: /HuaweiBrowser|HONOR|MiuiBrowser|XiaoMi|VivoBrowser|HeyTapBrowser|OppoBrowser|SamsungBrowser|Quark/i.test(UA)
  };
  ENV.inApp = ENV.wechat || ENV.qq || ENV.other;
  var installPrompt = null; // 安卓 Chrome 的一键安装
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installPrompt = e; });

  // 教程里的小示意图（不是截图，画出要点哪里，红框标出来）
  var I = {
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dots: "···", kebab: "⋮", menu: "≡"
  };
  function bar(items) { // 浏览器的工具栏：[文字, 是否标红]
    return '<div class="mk-bar">' + items.map(function (x) { return '<span class="' + (x[1] ? "hl" : "") + '">' + x[0] + "</span>"; }).join("") + "</div>";
  }
  function menu(items, title) { // 弹出的菜单：[图标, 文字, 是否标红]
    return '<div class="mk-menu">' + (title ? '<div class="mk-title">' + title + "</div>" : "") + items.map(function (x) {
      return '<div class="mk-item' + (x[2] ? " hl" : "") + '"><i>' + x[0] + "</i><span>" + x[1] + "</span></div>";
    }).join("") + "</div>";
  }
  var ICON = '<img src="icons/icon-180.png" alt="">';
  var DIALOG = '<div class="mk-dlg"><div class="mk-dlg-h"><span>取消</span><b>添加到主屏幕</b><span class="hl">添加</span></div><div class="mk-dlg-b">' + ICON + "<div><b>AiLGNS</b><small>https://ailgns.dev</small></div></div></div>";
  var HOME = '<div class="mk-home"><i></i><i></i><i></i><span>' + ICON + "<small>AiLGNS</small></span><i></i><i></i><i></i><i></i></div>";
  var OPEN_BROWSER = menu([["↗", "在浏览器打开", true], ["⎘", "复制链接"], ["✉", "发送给朋友"]]);

  var GUIDES = {
    iphone: {
      tab: "iPhone", note: "请用<b>Safari 浏览器</b>（iPhone 自带的指南针图标）打开 ailgns.dev 再操作。",
      steps: [
        ["点屏幕<b>最下面中间的「分享」按钮</b>（方框加向上的箭头）。<br><small>新版 iOS 如果底部只有地址栏，先点右下角「···」，再点「分享」。</small>", bar([["‹"], ["›"], [I.share, 1], ["▢"], ["⧉"]])],
        ["弹出菜单后<b>往上滑</b>，找到并点<b>「添加到主屏幕」</b>。<br><small>没看到的话滑到最下面点「编辑操作」把它加上。</small>", menu([["⎘", "拷贝"], ["☆", "添加到个人收藏"], [I.plus, "添加到主屏幕", 1], ["⌕", "在页面上查找"]])],
        ["点右上角的<b>「添加」</b>。", DIALOG],
        ["回到手机桌面，就有 <b>AiLGNS</b> 图标了，以后点它直接打开。", HOME]
      ]
    },
    iphoneChrome: {
      tab: "iPhone Chrome", note: "iPhone 上的 Chrome 也可以（系统要 iOS 16.4 以上）；不行就换 Safari 打开。",
      steps: [
        ["点地址栏<b>右边的「分享」按钮</b>。", bar([["ailgns.dev"], [I.share, 1], ["⋯"]])],
        ["找到并点<b>「添加到主屏幕」</b>。", menu([["⎘", "复制"], [I.plus, "添加到主屏幕", 1], ["☆", "添加书签"]])],
        ["点<b>「添加」</b>，桌面就有图标了。", DIALOG]
      ]
    },
    android: {
      tab: "安卓 Chrome", note: "安卓手机推荐用 <b>Chrome</b>，最简单。",
      steps: [
        ["点右上角的<b>三个点「⋮」</b>。", bar([["⌂"], ["ailgns.dev"], ["⧉"], [I.kebab, 1]])],
        ["点<b>「添加到主屏幕」</b>或<b>「安装应用」</b>。", menu([["↻", "刷新"], ["☆", "添加书签"], [I.plus, "添加到主屏幕 / 安装应用", 1], ["⚙", "设置"]])],
        ["点<b>「安装」</b>或<b>「添加」</b>，桌面就有图标了。", HOME]
      ]
    },
    vendor: {
      tab: "QQ浏览器 / 手机自带浏览器", note: "QQ浏览器、UC、夸克、华为、小米、vivo、OPPO、三星自带浏览器，名字不太一样，但都在<b>菜单</b>里。",
      steps: [
        ["点屏幕<b>最下面的「≡」菜单</b>（有的在右上角「⋮」）。", bar([["‹"], ["›"], [I.menu, 1], ["⧉"], ["⌂"]])],
        ["找<b>「添加到桌面」「发送到桌面」「添加至主屏幕」</b>其中一个点进去（QQ浏览器在「工具箱 / 添加到」里）。", menu([["☆", "收藏"], ["⤓", "下载"], [I.plus, "添加到桌面 / 发送到桌面", 1], ["⚙", "设置"]], "菜单")],
        ["点<b>「添加」</b>。<br><small>提示没有权限的：去手机「设置 → 应用 → 这个浏览器 → 权限」，打开<b>「桌面快捷方式」</b>，再回来加一次。</small>", HOME]
      ]
    },
    inapp: {
      tab: "微信 / QQ 里", note: "在<b>微信、QQ</b>里打开的网页不能直接放到桌面，要先换到浏览器里打开。",
      steps: [
        ["点右上角的<b>「···」</b>。", bar([["✕"], ["AiLGNS 服务站"], [I.dots, 1]])],
        ["点<b>「在浏览器打开」</b>（iPhone 显示「在 Safari 中打开」）。", OPEN_BROWSER],
        ["浏览器打开后，再按 <b>iPhone</b> 或 <b>安卓</b> 的步骤添加到桌面。", HOME]
      ]
    }
  };
  function defaultGuide() {
    if (ENV.inApp) return "inapp";
    if (ENV.ios) return ENV.iosChrome ? "iphoneChrome" : "iphone";
    if (ENV.qqBrowser || ENV.uc || ENV.vendor) return "vendor";
    return ENV.android ? "android" : "iphone";
  }
  function installGuide() {
    var cur = defaultGuide(), order = ["iphone", "iphoneChrome", "android", "vendor", "inapp"];
    var s = sheet('<div class="card-head"><h2>添加到手机桌面</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
      '<p class="note" style="margin:-6px 0 0">加好后桌面有 AiLGNS 图标，一点就开，不用每次输网址。下面选你现在用的手机和浏览器：</p>' +
      '<div class="g-tabs">' + order.map(function (k) { return '<button type="button" data-g="' + k + '">' + GUIDES[k].tab + "</button>"; }).join("") + "</div>" +
      '<div id="g-body"></div>');
    s.el.classList.add("guide-modal");
    function draw(k) {
      cur = k;
      s.el.querySelectorAll("[data-g]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-g") === k); });
      var g = GUIDES[k], canInstall = installPrompt && (k === "android");
      s.el.querySelector("#g-body").innerHTML = (k === defaultGuide() ? '<div class="g-you">✓ 已识别你现在用的是这种，照着做就行</div>' : "") +
        '<p class="g-note">' + g.note + "</p>" +
        (canInstall ? '<button class="paybtn" id="g-install">一键安装到桌面</button><p class="g-note" style="text-align:center">或者按下面的步骤手动添加：</p>' : "") +
        '<ol class="g-steps">' + g.steps.map(function (st, i) { return '<li><div class="g-num">' + (i + 1) + '</div><div class="g-txt">' + st[0] + '</div><div class="g-pic">' + st[1] + "</div></li>"; }).join("") + "</ol>" +
        '<p class="g-note">交易、付款要用钱包：从桌面图标打开后点「在钱包 App 里打开」，会自动跳到你的钱包。</p>';
      var gi = s.el.querySelector("#g-install");
      if (gi) gi.onclick = function () { installPrompt.prompt(); installPrompt.userChoice.then(function () { s.close(); }); };
    }
    s.el.querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { draw(b.getAttribute("data-g")); }; });
    draw(cur);
  }

  // 顶部横幅：手机普通浏览器里每次都显示（关掉后 3 天内不再出现）；钱包 App 里、已经从桌面图标打开的不显示
  (function installBanner() {
    var el = document.getElementById("a2hs"), off = 0;
    try { off = Number(localStorage.getItem("ailgns-a2hs-off")) || 0; } catch (e) { /* 忽略 */ }
    if (!el || standalone() || !(ENV.ios || ENV.android) || Date.now() - off < 3 * 86400000) return;
    setTimeout(function () {
      if (list().length) return; // 钱包 App 里不提示
      var sub = ENV.inApp ? "先换到浏览器打开，再放到桌面，以后一点就开" : ENV.ios ? "Safari 里点「分享」→「添加到主屏幕」，一点就开" : "像 App 一样放在桌面，一点就开";
      el.innerHTML = '<div class="a2hs"><img src="icons/icon-180.png" alt="" width="48" height="48"><div class="a2hs-t"><b>把 AiLGNS 放到手机桌面</b><span>' + sub + "</span></div>" +
        '<button id="a2hs-go">' + (installPrompt ? "一键安装" : "看图教程") + '</button><button class="a2hs-x" id="a2hs-x" aria-label="关闭">×</button></div>';
      document.getElementById("a2hs-x").onclick = function () { el.innerHTML = ""; try { localStorage.setItem("ailgns-a2hs-off", String(Date.now())); } catch (e) { /* 忽略 */ } };
      document.getElementById("a2hs-go").onclick = function () {
        if (installPrompt) installPrompt.prompt();
        else installGuide();
      };
    }, 1200);
  })();
  // 页脚等地方的「添加到桌面」入口
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-a2hs]");
    if (a) { e.preventDefault(); installGuide(); }
  });
  A.installGuide = installGuide;
})();
