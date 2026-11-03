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
  // 钱包弹窗出来时，在屏幕顶部（钱包弹窗一般在下半屏）说明这一步在做什么、为什么放心；钱包一回应就收起
  // 只写事实（连接只读地址、授权对象是开源无管理员的合约、可随时取消），不说「绝对零风险」
  function safeText(a) {
    var m = a && a.method, d = (a && a.params && a.params[0] && a.params[0].data) || "";
    if (m === "eth_requestAccounts") return "🔒 连接 / 登录只是让本站看到你的钱包地址（DeBox 还有昵称头像），<b>不会转走任何币，也不花一分钱</b>。";
    if (m === "personal_sign" || /^eth_signTypedData/.test(m || "")) return "🔒 这只是签名确认身份，<b>不是转账，不会动你的币</b>，也不花 Gas。";
    if (m !== "eth_sendTransaction") return "";
    if (/^0x095ea7b3/i.test(d)) return "🔒 <b>授权说明</b>：授权给的是本站托管合约 <span class=\"mono\">" + ("0x" + d.slice(34, 38) + "…" + d.slice(70, 74)) + "</span>。合约代码开源、<b>无管理员、无后门、谁都改不了</b>，只会在<b>你本人</b>下单或成交时转你的币，任何人（包括我们）都动不了。授权只需一次，不放心可随时在钱包里取消。";
    return "🔒 这笔交易由你本人发起，金额以钱包里显示的为准；托管合约开源、无管理员、无后门，币只按合约规则走。";
  }
  function safeShow(t) {
    var el = document.getElementById("safe-tip");
    if (!t) return el && el.remove();
    if (!el) { el = document.createElement("div"); el.id = "safe-tip"; el.className = "safe-tip"; document.body.appendChild(el); }
    el.innerHTML = t;
  }
  // 弹钱包时顺便显示说明。不改钱包对象本身（OKX 钱包内部会回调自己的 request，改了会无限循环）
  function ask(eth, a) {
    var t = safeText(a);
    if (t) safeShow(t);
    return Promise.resolve().then(function () { return eth.request(a); }).then(function (r) { if (t) safeShow(""); return r; }, function (e) { if (t) safeShow(""); throw e; });
  }
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

  // 钱包图标：钱包自己报的图标（EIP-6963）优先，否则用本站存的官方图标，都没有就用首字母
  var LOGOS = { "OKX Wallet": "okx", "Bitget Wallet": "bitget", "TokenPocket": "tokenpocket", "MetaMask": "metamask", "Trust Wallet": "trust", "imToken": "imtoken" };
  function logoHtml(name, icon) {
    var letter = '<span class="wicon">' + A.esc(String(name).slice(0, 1)) + "</span>";
    var src = icon || (LOGOS[name] ? "icons/wallets/" + LOGOS[name] + ".png?v=1" : "");
    if (!src) return letter;
    // 图片加载失败就换成首字母（onerror 里只能用单引号，别的写法会把属性截断）
    return '<img class="wlogo" src="' + A.esc(src) + '" alt="" data-l="' + A.esc(String(name).slice(0, 1)) + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'wicon\',textContent:this.dataset.l}))">';
  }
  function iconHtml(w) { return logoHtml(w.name, w.icon); }

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
        return '<a class="wbtn" href="' + a[1] + '"' + (mobile ? "" : ' target="_blank" rel="noopener"') + '>' + logoHtml(a[0]) + "<span>" + a[0] + "</span></a>";
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
    ask: ask,
    openIn: noWallet, // 弹出「在钱包 App 里打开」
    standalone: standalone,
    silent: silent,
    current: function () { return current && current.provider; },
    name: function () { return current && current.name; },
    forget: function () { current = null; try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } },
    onAccounts: function (fn) { listeners.push(fn); }
  };

  // ---------- 添加到手机桌面：先认出手机 + 浏览器，再一步一屏带着做 ----------
  var UA = navigator.userAgent;
  function ver(re) { var m = UA.match(re); return m ? parseInt(m[1], 10) : 0; }
  var ENV = {
    ios: /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    iosVer: Math.max(ver(/OS (\d+)_/), /CriOS|FxiOS|EdgiOS/.test(UA) ? 0 : ver(/Version\/(\d+)/)), // iOS 26 起 Safari 的 UA 系统版本冻结在 18，真实版本在 Version/26
    android: /Android/i.test(UA),
    wechat: /MicroMessenger/i.test(UA),
    qq: / QQ\/[\d.]/i.test(UA), // QQ App 里打开（QQ 浏览器 App 的 UA 只有 MQQBrowser，没有 " QQ/"）
    other: /DingTalk|Weibo|AlipayClient|Lark|Feishu/i.test(UA),
    huawei: /HuaweiBrowser|HONORBrowser|ArkWeb|OpenHarmony/i.test(UA),
    harmonyNext: /OpenHarmony|ArkWeb/i.test(UA), // 鸿蒙 NEXT（5.0 起）的浏览器菜单和老版不一样
    xiaomi: /MiuiBrowser/i.test(UA),
    vivo: /VivoBrowser/i.test(UA),
    oppo: /HeyTapBrowser|OppoBrowser|ColorOSBrowser/i.test(UA),
    samsung: /SamsungBrowser/i.test(UA),
    qqBrowser: /MQQBrowser/i.test(UA) && !/ QQ\/[\d.]/i.test(UA),
    uc: /UCBrowser/i.test(UA),
    quark: /Quark/i.test(UA),
    edge: /EdgA/i.test(UA),
    firefox: /Firefox/i.test(UA),
    iosChrome: /CriOS/i.test(UA),
    iosOther: /FxiOS|EdgiOS|UCBrowser|MQQBrowser|Quark|baiduboxapp|SogouMobileBrowser/i.test(UA)
  };
  ENV.inApp = ENV.wechat || ENV.qq || ENV.other;
  ENV.chrome = ENV.android && /Chrome\//.test(UA) && !(ENV.huawei || ENV.xiaomi || ENV.vivo || ENV.oppo || ENV.samsung || ENV.qqBrowser || ENV.uc || ENV.quark || ENV.edge || ENV.inApp);
  // 手机牌子：从 UA 里的机型猜（HUAWEI ALN-AL00 / 23127PN0CC / V2307A / PJD110 / SM-S918B）
  var MODEL = (UA.match(/Android [\d.]+; (?:[a-z]{2}-[a-z]{2}; )?([^;)]+?)(?: Build|\))/i) || [])[1] || "";
  function brand() {
    if (ENV.ios) return /iPad/i.test(UA) ? "iPad" : "iPhone";
    var m = MODEL + " " + UA;
    if (/HONOR/i.test(m)) return "荣耀";
    if (/HUAWEI|HarmonyOS|OpenHarmony|ArkWeb|Huawei/i.test(m)) return "华为";
    if (/Xiaomi|Redmi|POCO|MiuiBrowser|^(MI|M\d{4}|2\d{3}[A-Z0-9]{5,})/i.test(m)) return "小米";
    if (/vivo|^V\d{4}|iQOO/i.test(m)) return "vivo";
    if (/OPPO|realme|OnePlus|HeyTap|^(CPH|PJ|PH|PG|PE|RMX)/i.test(m)) return "OPPO";
    if (/^SM-|Samsung/i.test(m)) return "三星";
    if (/Pixel/i.test(m)) return "Google";
    return ENV.android ? "安卓" : "";
  }
  var installPrompt = null; // 安卓 Chrome / Edge 的一键安装
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installPrompt = e; });

  // 教程里的小示意图（不是截图，画出要点哪里，红框标出来）
  var I = {
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dots: "···", kebab: "⋮", menu: "≡", grid: "∷"
  };
  function bar(items) { // 浏览器的工具栏：[文字, 是否标红]
    return '<div class="mk-bar">' + items.map(function (x) { return '<span class="' + (x[1] ? "hl" : "") + '">' + x[0] + "</span>"; }).join("") + "</div>";
  }
  function menu(items, title) { // 弹出的菜单：[图标, 文字, 是否标红]
    return '<div class="mk-menu">' + (title ? '<div class="mk-title">' + title + "</div>" : "") + items.map(function (x) {
      return '<div class="mk-item' + (x[2] ? " hl" : "") + '"><i>' + x[0] + "</i><span>" + x[1] + "</span></div>";
    }).join("") + "</div>";
  }
  var ICON = '<img src="/favicon.png?v=hx2" alt="">';
  var DIALOG = '<div class="mk-dlg"><div class="mk-dlg-h"><span>取消</span><b>添加到主屏幕</b><span class="hl">添加</span></div><div class="mk-dlg-b">' + ICON + "<div><b>AiLGNS</b><small>https://ailgns.dev</small></div></div>" +
    '<div class="mk-dlg-t"><span>作为网页 App 打开</span><i class="mk-switch"></i></div></div>';
  var ADROID_DLG = '<div class="mk-dlg"><div class="mk-dlg-b">' + ICON + "<div><b>AiLGNS</b><small>ailgns.dev</small></div></div>" + '<div class="mk-dlg-h"><span>取消</span><span class="hl">添加</span></div></div>';
  var HOME = '<div class="mk-home"><i></i><i></i><i></i><span>' + ICON + "<small>AiLGNS</small></span><i></i><i></i><i></i><i></i></div>";
  var OPEN_BROWSER = menu([["↗", "在浏览器打开", true], ["⎘", "复制链接"], ["✉", "发送给朋友"]]);
  var SHARE_SHEET = '<div class="mk-sheet"><div class="mk-apps"><i></i><i></i><i></i><i></i></div>' + menu([["⎘", "拷贝"], ["☆", "添加到个人收藏"], [I.plus, "添加到主屏幕", 1]]) + "</div>";
  var PERM_ANDROID = "提示没有权限、或者点了添加桌面上没图标：去手机<b>「设置 → 应用 → 应用管理 → 找到这个浏览器 → 权限」</b>，把<b>「桌面快捷方式」</b>（有的叫「创建桌面快捷方式」）打开，再回来加一次。";

  // 每套教程：name 标签、dev 手机、note 开头提醒、steps 一步一屏、alt 没找到按钮时的备用路线、perm 权限提示
  var GUIDES = {
    safari26: {
      name: "iPhone · Safari（iOS 26）", dev: "iPhone", note: "iOS 26 的 Safari 底部没有分享按钮了，分享藏在<b>地址栏左边的「≡」</b>里。",
      steps: [
        ["点底部地址栏<b>左边的「≡」</b>。<br><small>有的手机这里没有「≡」，是在右下角的「···」，点它一样。</small>", bar([["‹"], [I.menu, 1], ["ailgns.dev"], ["↻"], ["⧉"]])],
        ["在弹出的菜单里点<b>「分享」</b>。", menu([[I.share, "分享", 1], ["☆", "添加到个人收藏"], ["⌕", "在页面上查找"]])],
        ["分享面板出来后，<b>往上滑</b>，点<b>「查看更多」</b>，再点<b>「添加到主屏幕」</b>。<br><small>列表里直接看到「添加到主屏幕」的，直接点它。</small>", '<div class="mk-sheet"><div class="mk-apps"><i></i><i></i><i></i><i></i></div>' + menu([["⎘", "拷贝"], ["⋯", "查看更多", 1], [I.plus, "添加到主屏幕", 1]]) + "</div>"],
        ["保持<b>「作为网页 App 打开」</b>是开着的，点右上角<b>「添加」</b>。", DIALOG],
        ["回到桌面，就有 AiLGNS 图标了，以后点它打开。", HOME]
      ],
      alt: { title: "还是找不到「添加到主屏幕」？", steps: ["分享面板拉到最底下，点「编辑操作」，把「添加到主屏幕」加上，再回去点它。", "底部有「方框加箭头」分享按钮的（设置里改过标签页布局），直接点它，再往上滑找「添加到主屏幕」。"] }
    },
    safari: {
      name: "iPhone · Safari", dev: "iPhone", note: "请用 iPhone 自带的 <b>Safari</b>（指南针图标）打开，其他浏览器大多加不了。",
      steps: [
        ["点屏幕<b>底部中间的「分享」按钮</b>（方框加向上箭头）。", bar([["‹"], ["›"], [I.share, 1], ["📖"], ["⧉"]])],
        ["分享面板出来后，<b>往上滑</b>，找到<b>「添加到主屏幕」</b>点一下。", SHARE_SHEET],
        ["点右上角<b>「添加」</b>。", DIALOG],
        ["回到桌面，就有 AiLGNS 图标了，以后点它打开。", HOME]
      ],
      alt: { title: "底部没有分享按钮？", steps: ["那是 iOS 26 的新布局：点地址栏左边的「≡」（或右下角「···」）→「分享」→「查看更多」→「添加到主屏幕」→「添加」。"] }
    },
    ioschrome: {
      name: "iPhone · Chrome", dev: "iPhone", note: "iPhone 上的 Chrome 也能加（系统要 iOS 16.4 以上）。不行就换 Safari 打开。",
      steps: [
        ["点地址栏<b>右边的「分享」按钮</b>（方框加箭头）。", bar([["ailgns.dev"], [I.share, 1], ["⋯"]])],
        ["往上滑，找到并点<b>「添加到主屏幕」</b>。", menu([["⎘", "复制"], [I.plus, "添加到主屏幕", 1], ["☆", "添加书签"]])],
        ["点<b>「添加」</b>。", DIALOG],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      alt: { title: "没有「添加到主屏幕」？", steps: ["系统低于 iOS 16.4 的 Chrome 没有这个功能。复制网址 ailgns.dev，打开自带的 Safari 粘贴，再按 Safari 的步骤做。"] }
    },
    iosother: {
      name: "iPhone · 其他浏览器", dev: "iPhone", note: "你现在用的浏览器在 iPhone 上加不了桌面，要换成自带的 <b>Safari</b>。",
      steps: [
        ["点下面按钮复制网址。", '<div class="app-copy"><span class="mono">https://ailgns.dev/#/app</span><button data-copy>复制网址</button></div>'],
        ["回到手机桌面，打开 <b>Safari</b>（蓝色指南针图标），点地址栏粘贴，打开。", bar([["🧭 Safari"], ["粘贴并前往", 1]])],
        ["打开后页面会自动认出是 Safari，照着新出来的步骤做就行。", HOME]
      ]
    },
    chrome: {
      name: "安卓 · Chrome", dev: "安卓", note: "Chrome 最简单，多数时候能一键安装。",
      steps: [
        ["点右上角的<b>三个点「⋮」</b>。", bar([["⌂"], ["ailgns.dev"], ["⧉"], [I.kebab, 1]])],
        ["点<b>「添加到主屏幕」</b>（新版叫<b>「安装应用」</b>）。", menu([["↻", "刷新"], ["☆", "添加书签"], [I.plus, "添加到主屏幕 / 安装应用", 1], ["⚙", "设置"]])],
        ["点<b>「安装」</b>或<b>「添加」</b>。", ADROID_DLG],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      perm: PERM_ANDROID
    },
    huawei: {
      name: "华为 / 荣耀 · 自带浏览器", dev: "安卓", note: "华为、荣耀自带浏览器的按钮叫<b>「添加至桌面」</b>。鸿蒙 5 以上在网页里就能点，老版本在「添加至」里。",
      steps: [
        ["点屏幕<b>右下角的「∷」</b>（四个点，菜单）。", bar([["‹"], ["›"], ["⌂"], ["⧉"], [I.grid, 1]])],
        ["鸿蒙 5 以上：直接点<b>「添加至桌面」</b>。<br><small>老版本：先点「添加至」，再选「桌面」。</small>", menu([["☆", "添加至书签"], [I.plus, "添加至桌面", 1], ["⤓", "下载"], ["⚙", "设置"]], "菜单")],
        ["名字用默认的 AiLGNS 就行，点<b>「✔」</b>或<b>「添加」</b>。", ADROID_DLG],
        ["回到桌面，就有 AiLGNS 图标了（图标上带小闪电也正常）。", HOME]
      ],
      alt: { title: "菜单里没有「添加至桌面」？", steps: ["先点「添加至书签」收藏本页。", "回到浏览器首页，点「我的 → 书签收藏 → 书签」，<b>长按</b> AiLGNS 这条，选「添加至桌面」。"] },
      perm: PERM_ANDROID
    },
    xiaomi: {
      name: "小米 / Redmi · 自带浏览器", dev: "安卓", note: "小米自带浏览器藏在<b>「工具箱」</b>里，叫「添加快捷方式」。",
      steps: [
        ["点屏幕<b>最下面的「≡」菜单</b>。", bar([["‹"], ["›"], [I.menu, 1], ["⧉"], ["⌂"]])],
        ["点<b>「工具箱」</b>。", menu([["☆", "收藏"], ["🧰", "工具箱", 1], ["⤓", "下载"], ["⚙", "设置"]], "菜单")],
        ["点<b>「添加快捷方式」</b>。", menu([["🖥", "电脑版"], [I.plus, "添加快捷方式", 1], ["🔍", "页内查找"]], "工具箱")],
        ["选<b>「手机桌面」</b>，点<b>「确定」</b>。", menu([["☆", "收藏"], ["🏠", "手机桌面", 1]], "添加收藏至")],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      alt: { title: "工具箱里没有「添加快捷方式」？", steps: ["小米手机大多装了 Chrome：复制网址 ailgns.dev 到 Chrome 打开，按 Chrome 的步骤一键安装。"] },
      perm: "小米提示没有权限或桌面没图标：去<b>「设置 → 应用设置 → 授权管理 → 应用权限管理 → 浏览器 → 桌面快捷方式」</b>选「允许」，再加一次。"
    },
    vivo: {
      name: "vivo / iQOO · 自带浏览器", dev: "安卓", note: "vivo 自带浏览器是在<b>「添加书签」</b>里顺便放到桌面。",
      steps: [
        ["点屏幕<b>最下面的「≡」菜单</b>。", bar([["‹"], ["›"], [I.menu, 1], ["⧉"], ["⌂"]])],
        ["点<b>「添加书签」</b>。", menu([[I.plus, "添加书签", 1], ["🧰", "工具箱"], ["⤓", "下载"], ["⚙", "设置"]], "菜单")],
        ["在弹出的窗口里勾选 / 点<b>「添加到手机桌面」</b>，再点<b>「完成」</b>。", menu([["☆", "书签"], ["🏠", "添加到手机桌面", 1]], "添加至")],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      alt: { title: "添加书签的窗口里没有「桌面」？", steps: ["先把本页添加书签。", "点底部「书签」，<b>长按</b> AiLGNS 这条，选「添加到桌面」。"] },
      perm: "vivo 提示没有权限或桌面没图标：打开<b>「i 管家 → 应用管理 → 权限管理 → 桌面快捷方式 → 浏览器」</b>选「允许」，再加一次。"
    },
    oppo: {
      name: "OPPO / realme / 一加 · 自带浏览器", dev: "安卓", note: "OPPO 自带浏览器是在<b>「添加书签」</b>里选「桌面书签」。",
      steps: [
        ["点屏幕<b>最下面的「≡」菜单</b>。", bar([["‹"], ["›"], [I.menu, 1], ["⧉"], ["⌂"]])],
        ["点<b>「添加书签」</b>。", menu([[I.plus, "添加书签", 1], ["🧰", "工具箱"], ["⤓", "下载"], ["⚙", "设置"]], "菜单")],
        ["选<b>「桌面书签」</b>（或「添加到桌面」），点<b>「确定」</b>。", menu([["☆", "书签"], ["🏠", "桌面书签", 1]], "添加到")],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      alt: { title: "没有「桌面书签」？", steps: ["先把本页添加书签。", "打开书签列表，<b>长按</b> AiLGNS 这条，选「添加到桌面」。", "还是没有：OPPO 手机大多装了 Chrome，复制网址到 Chrome 打开，按 Chrome 的步骤一键安装。"] },
      perm: PERM_ANDROID
    },
    samsung: {
      name: "三星 · 自带浏览器", dev: "安卓", note: "三星浏览器的菜单在右下角，按钮叫<b>「添加页面到」</b>。",
      steps: [
        ["点<b>右下角的「≡」</b>。", bar([["‹"], ["›"], ["⌂"], ["⧉"], [I.menu, 1]])],
        ["点<b>「添加页面到」</b>。", menu([["☆", "添加到书签"], [I.plus, "添加页面到", 1], ["⤓", "下载"], ["⚙", "设置"]])],
        ["选<b>「主屏幕」</b>，再点<b>「添加」</b>。", menu([["☆", "书签"], ["🏠", "主屏幕", 1], ["▦", "快速访问"]], "添加页面到")],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      perm: PERM_ANDROID
    },
    qqb: {
      name: "QQ浏览器", dev: "安卓", note: "QQ浏览器在<b>「工具箱」</b>里，叫「添加快捷方式」。",
      steps: [
        ["点屏幕<b>最下面的「≡」菜单</b>。", bar([["‹"], ["›"], [I.menu, 1], ["⧉"], ["⌂"]])],
        ["点<b>「工具箱」</b>。", menu([["☆", "收藏"], ["🧰", "工具箱", 1], ["⤓", "下载"], ["⚙", "设置"]], "菜单")],
        ["点<b>「添加快捷方式」</b>，选<b>「手机桌面」</b>，点确定。", menu([["🖥", "电脑版"], [I.plus, "添加快捷方式", 1], ["🔍", "页内查找"]], "工具箱")],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      alt: { title: "工具箱里没有？", steps: ["点「≡」→「添加书签」，书签加好后点提示里的<b>「编辑」</b>，再点<b>「发送到桌面」</b>。"] },
      perm: PERM_ANDROID
    },
    uc: {
      name: "UC / 夸克浏览器", dev: "安卓", note: "UC、夸克在<b>菜单</b>里直接有「添加到桌面」。",
      steps: [
        ["点屏幕<b>最下面的「≡」菜单</b>。", bar([["‹"], ["›"], [I.menu, 1], ["⧉"], ["⌂"]])],
        ["找到并点<b>「添加到桌面」</b>（夸克在「工具箱」里）。", menu([["☆", "收藏"], [I.plus, "添加到桌面", 1], ["🧰", "工具箱"], ["⚙", "设置"]], "菜单")],
        ["点<b>「添加」</b>。", ADROID_DLG],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      perm: PERM_ANDROID
    },
    edge: {
      name: "安卓 · Edge", dev: "安卓", note: "Edge 和 Chrome 差不多，多数能一键安装。",
      steps: [
        ["点屏幕<b>最下面的「···」</b>。", bar([["‹"], ["⌂"], [I.dots, 1], ["⧉"], ["☆"]])],
        ["点<b>「添加到手机」</b>。", menu([["☆", "添加到收藏夹"], [I.plus, "添加到手机", 1], ["⤓", "下载"]])],
        ["点<b>「安装」</b>。", ADROID_DLG],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      perm: PERM_ANDROID
    },
    firefox: {
      name: "安卓 · Firefox", dev: "安卓", note: "",
      steps: [
        ["点<b>右下角的「⋮」</b>。", bar([["ailgns.dev"], ["⧉"], [I.kebab, 1]])],
        ["点<b>「添加到主屏幕」</b>。", menu([["☆", "书签"], [I.plus, "添加到主屏幕", 1], ["⚙", "设置"]])],
        ["点<b>「添加」</b>。", ADROID_DLG],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      perm: PERM_ANDROID
    },
    androidother: {
      name: "安卓 · 其他浏览器", dev: "安卓", note: "认不出你用的浏览器。所有安卓浏览器的套路都一样：<b>菜单 → 添加到桌面</b>。",
      steps: [
        ["点屏幕<b>底部或右上角的菜单</b>（「≡」「⋮」或「···」）。", bar([["‹"], ["›"], [I.menu, 1], ["⧉"], ["⌂"]])],
        ["找<b>「添加到桌面」「发送到桌面」「添加到主屏幕」「安装应用」</b>其中一个点进去（有的在「工具箱」「添加书签」里）。", menu([["☆", "收藏"], [I.plus, "添加到桌面 / 安装应用", 1], ["🧰", "工具箱"], ["⚙", "设置"]], "菜单")],
        ["点<b>「添加」</b>。", ADROID_DLG],
        ["回到桌面，就有 AiLGNS 图标了。", HOME]
      ],
      alt: { title: "实在找不到？", steps: ["复制网址 ailgns.dev，用手机自带浏览器或 Chrome 打开，页面会自动认出浏览器，再照着做。"] },
      perm: PERM_ANDROID
    },
    wechat: {
      name: "微信 / QQ / 钉钉里", dev: "", note: "在<b>微信、QQ、钉钉</b>里打开的网页不能放到桌面，先换到浏览器打开。",
      steps: [
        ["点右上角的<b>「···」</b>。", bar([["✕"], ["AiLGNS 服务站"], [I.dots, 1]])],
        ["点<b>「在浏览器打开」</b>（iPhone 显示「在 Safari 中打开」；安卓新版微信要先点「更多」）。", OPEN_BROWSER],
        ["浏览器打开后，这一页会自动认出你的浏览器，照新出来的步骤做。", HOME]
      ],
      alt: { title: "没有「在浏览器打开」？", steps: ["点「···」→「复制链接」，回桌面打开浏览器（iPhone 用 Safari），点地址栏粘贴打开。"] }
    },
    wallet: {
      name: "钱包 App 里", dev: "", note: "你现在在<b>钱包 App</b> 里，钱包里不能装到桌面。",
      steps: [
        ["点下面按钮复制网址。", '<div class="app-copy"><span class="mono">https://ailgns.dev/#/app</span><button data-copy>复制网址</button></div>'],
        ["回到手机桌面，打开浏览器（iPhone 用 <b>Safari</b>，安卓用自带浏览器或 <b>Chrome</b>），粘贴打开。", bar([["浏览器"], ["粘贴并前往", 1]])],
        ["打开后页面会自动认出你的浏览器，照新出来的步骤做。装好后交易时点「在钱包 App 里打开」就会跳回钱包。", HOME]
      ]
    },
    desktop: {
      name: "电脑", dev: "", note: "这是手机功能。用手机打开 ailgns.dev/#/app 就能看到自动识别的步骤。",
      steps: [["手机扫下面的二维码，或者把网址发到手机上打开。", '<img class="app-qr" alt="二维码" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent("https://ailgns.dev/#/app") + '">']]
    }
  };
  // 手动选的菜单（认错了的时候）
  var PICK = [["iPhone", ["safari26", "safari", "ioschrome", "iosother"]], ["安卓", ["chrome", "huawei", "xiaomi", "vivo", "oppo", "samsung", "qqb", "uc", "edge", "firefox", "androidother"]], ["App 里", ["wechat", "wallet"]]];

  // 自动认：先看是不是在 App 里，再看浏览器
  function detect() {
    if (!ENV.ios && !ENV.android) return "desktop";
    if (list().length) return "wallet";
    if (ENV.inApp) return "wechat";
    if (ENV.ios) {
      if (ENV.iosChrome) return "ioschrome";
      if (ENV.iosOther) return "iosother";
      return ENV.iosVer >= 26 ? "safari26" : "safari";
    }
    if (ENV.huawei) return "huawei";
    if (ENV.xiaomi) return "xiaomi";
    if (ENV.vivo) return "vivo";
    if (ENV.oppo) return "oppo";
    if (ENV.samsung) return "samsung";
    if (ENV.qqBrowser) return "qqb";
    if (ENV.uc || ENV.quark) return "uc";
    if (ENV.edge) return "edge";
    if (ENV.firefox) return "firefox";
    if (ENV.chrome) return "chrome";
    return "androidother";
  }
  // 「已识别：华为 ALN-AL00 · 鸿蒙 · 华为浏览器」这一行
  function deviceLine() {
    var b = brand(), parts = [];
    if (!ENV.ios && !ENV.android) return "电脑浏览器";
    if (b) parts.push(b + (MODEL && b !== "安卓" && !ENV.ios ? " " + MODEL : ""));
    if (ENV.ios && ENV.iosVer) parts.push("iOS " + ENV.iosVer);
    else if (ENV.harmonyNext) parts.push("鸿蒙 NEXT");
    else if (/HarmonyOS/i.test(UA)) parts.push("鸿蒙");
    else if (ENV.android) parts.push("安卓 " + (ver(/Android (\d+)/) || ""));
    var br = ENV.wechat ? "微信" : ENV.qq ? "QQ" : ENV.other ? "钉钉 / 支付宝等" : list().length ? "钱包 App" :
      ENV.iosChrome ? "Chrome" : ENV.ios ? (ENV.iosOther ? "非 Safari 浏览器" : "Safari") :
      ENV.huawei ? "华为浏览器" : ENV.xiaomi ? "小米浏览器" : ENV.vivo ? "vivo 浏览器" : ENV.oppo ? "OPPO 浏览器" : ENV.samsung ? "三星浏览器" :
      ENV.qqBrowser ? "QQ浏览器" : ENV.uc ? "UC" : ENV.quark ? "夸克" : ENV.edge ? "Edge" : ENV.firefox ? "Firefox" : ENV.chrome ? "Chrome" : "浏览器";
    parts.push(br);
    return parts.join(" · ");
  }

  // 一步一屏的向导：box 容器，k 教程，onPick 换教程
  function wizard(box, k, onPick) {
    var g = GUIDES[k], i = 0, showAlt = false, auto = k === detect();
    function draw() {
      var st = g.steps[i], last = i === g.steps.length - 1, canOne = installPrompt && (k === "chrome" || k === "edge" || k === "androidother");
      box.innerHTML = '<div class="wz">' +
        '<div class="wz-top"><span class="wz-dev">' + (auto ? "✓ 已识别：" + deviceLine() : "📘 " + g.name) + '</span><button type="button" class="ghost wz-pick">不是这个？换一个</button></div>' +
        (i === 0 && g.note ? '<p class="g-note">' + g.note + "</p>" : "") +
        (i === 0 && canOne ? '<button class="paybtn wz-one">⚡ 一键安装到桌面（不用按步骤）</button><p class="g-note" style="text-align:center">点了没反应再按下面的步骤：</p>' : "") +
        '<div class="wz-dots">' + g.steps.map(function (_, j) { return '<i class="' + (j < i ? "done" : j === i ? "on" : "") + '"></i>'; }).join("") + "</div>" +
        '<div class="wz-step"><div class="g-num">' + (i + 1) + '</div><div class="g-txt">' + st[0] + '</div><div class="g-pic">' + st[1] + "</div></div>" +
        '<div class="wz-nav">' + (i > 0 ? '<button type="button" class="ghost wz-prev">← 上一步</button>' : "<span></span>") +
        (last ? '<button type="button" class="paybtn wz-done">✅ 加好了</button>' : '<button type="button" class="paybtn wz-next">做好了，下一步 →</button>') + "</div>" +
        (g.alt || g.perm ? '<div class="wz-help"><a href="#" class="wz-alt">没找到这个按钮？</a>' + (showAlt ? '<div class="wz-altbox">' +
          (g.alt ? "<b>" + g.alt.title + "</b><ol>" + g.alt.steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" : "") +
          (g.perm ? '<p class="g-note">' + g.perm + "</p>" : "") + "</div>" : "") + "</div>" : "") +
        "</div>";
      var q = function (s) { return box.querySelector(s); };
      q(".wz-pick").onclick = function () { picker(box, k, onPick); };
      if (q(".wz-prev")) q(".wz-prev").onclick = function () { i--; draw(); };
      if (q(".wz-next")) q(".wz-next").onclick = function () { i++; draw(); window.scrollTo(0, Math.max(0, box.offsetTop - 60)); };
      if (q(".wz-done")) q(".wz-done").onclick = function () {
        box.innerHTML = '<div class="app-done">🎉 回到手机桌面，点 <b>AiLGNS</b> 图标打开就行。<br><small>桌面上没有图标？</small> <a href="#" class="wz-redo">重新看一遍步骤</a></div>';
        box.querySelector(".wz-redo").onclick = function (e) { e.preventDefault(); i = 0; showAlt = true; draw(); };
      };
      if (q(".wz-alt")) q(".wz-alt").onclick = function (e) { e.preventDefault(); showAlt = !showAlt; draw(); };
      if (q(".wz-one")) q(".wz-one").onclick = function () { installPrompt.prompt(); installPrompt.userChoice.then(function (c) { if (c && c.outcome === "accepted") q(".wz-done") ? q(".wz-done").click() : (i = g.steps.length - 1, draw()); }); };
      var cp = q("[data-copy]");
      if (cp) cp.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText("https://ailgns.dev/#/app") : Promise.reject()).then(function () { cp.textContent = "已复制 ✓"; }, function () { cp.textContent = "请长按网址复制"; }); };
    }
    draw();
  }
  function picker(box, cur, onPick) {
    box.innerHTML = '<div class="wz"><p class="g-note" style="margin-top:0">选你现在用的<b>手机</b>和<b>浏览器</b>（看屏幕上方的 App 名字，或问一下发链接给你的人）：</p>' +
      PICK.map(function (grp) {
        return '<div class="wz-grp"><b>' + grp[0] + '</b><div class="g-tabs">' + grp[1].map(function (x) { return '<button type="button" data-g="' + x + '" class="' + (x === cur ? "on" : "") + '">' + GUIDES[x].name.replace(/^(iPhone|安卓) · /, "") + "</button>"; }).join("") + "</div></div>";
      }).join("") + "</div>";
    box.querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { onPick(b.getAttribute("data-g")); }; });
  }

  // 弹窗版（页脚等地方的「添加到桌面」入口）
  function installGuide() {
    var s = sheet('<div class="card-head"><h2>添加到手机桌面</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div><div id="g-body"></div>');
    s.el.classList.add("guide-modal");
    var body = s.el.querySelector("#g-body");
    (function show(k) { wizard(body, k, show); })(detect());
  }

  // 顶部横幅：认出手机和浏览器后，一句话 + 「开始」按钮进向导；关掉后 3 天内不再出现
  (function installBanner() {
    var el = document.getElementById("a2hs"), off = 0;
    try { off = Number(localStorage.getItem("ailgns-a2hs-off")) || 0; } catch (e) { /* 忽略 */ }
    if (!el || standalone() || !(ENV.ios || ENV.android) || Date.now() - off < 3 * 86400000) return;
    if (location.hash.indexOf("#/app") === 0) return; // 下载 App 页本身就是教程
    function draw() {
      var k = detect(), g = GUIDES[k];
      el.innerHTML = '<div class="a2hs"><div class="a2hs-head"><img src="/favicon.png?v=hx2" alt="" width="44" height="44"><div class="a2hs-t"><b>把 AiLGNS 放到手机桌面</b><span>' +
        (installPrompt ? "已识别：" + deviceLine() + "，可以一键安装" : "已识别：" + deviceLine() + "，" + g.steps.length + " 步搞定") + "</span></div>" +
        '<button id="a2hs-go">' + (installPrompt ? "一键安装" : "开始") + '</button><button class="a2hs-x" id="a2hs-x" aria-label="关闭">×</button></div></div>';
      document.getElementById("a2hs-x").onclick = function () { el.innerHTML = ""; try { localStorage.setItem("ailgns-a2hs-off", String(Date.now())); } catch (e) { /* 忽略 */ } };
      document.getElementById("a2hs-go").onclick = function () {
        if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(function (c) { if (c && c.outcome === "accepted") el.innerHTML = ""; }); }
        else location.hash = "#/app";
      };
    }
    var drawn = false;
    window.addEventListener("beforeinstallprompt", function () { if (drawn) draw(); }); // 安卓 Chrome 稍后才告诉我们能一键安装
    setTimeout(function () {
      if (list().length) return; // 钱包 App 里不提示
      drawn = true;
      draw();
    }, 1200);
  })();
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-a2hs]");
    if (a) { e.preventDefault(); installGuide(); }
  });
  A.installGuide = installGuide;

  // ---------- 页面：下载 App（其实是把网站装到手机桌面，打开和 App 一样）----------
  // #/app/huawei 这种带教程名的链接可以直接发给客户，打开就是对应的步骤
  A.pages.app = function () {
    var want = (location.hash.split("/")[2] || "").toLowerCase(), k = GUIDES[want] ? want : detect();
    var html = '<section class="app-hero"><img src="/favicon.png?v=hx2" alt="" width="88" height="88">' +
      '<div><h1>AiLGNS OTC App</h1><p>官方认证 AiLGNS OTC 服务站 · 装到手机桌面，和 App 一样用</p>' +
      '<div class="app-feats"><span>📲 桌面一点就开</span><span>🔎 不用再找网址</span><span>🖥️ 全屏像 App</span><span>⚡ 自动更新</span></div></div></section>';
    html += '<section class="card"><div class="card-head"><h2>安装到手机桌面</h2><span class="muted">不用下载安装包，不要任何权限</span></div>' +
      (standalone() ? '<div class="app-done">✅ 你已经是从桌面图标打开的，App 已经装好了。</div>' : '<div id="app-wz"></div>') + "</section>";
    html += '<section class="card"><div class="card-head"><h2>发给客户</h2></div><p class="g-note" style="margin:0">客户用自己的手机打开 <span class="mono">ailgns.dev/#/app</span>，会自动认出他的手机和浏览器。知道他用什么手机的话，可以直接发对应链接：</p>' +
      '<div class="g-tabs" style="margin-top:8px">' + PICK[0][1].concat(PICK[1][1]).map(function (x) { return '<a href="#/app/' + x + '">' + GUIDES[x].name + "</a>"; }).join("") + "</div></section>";
    html += '<section class="card"><div class="card-head"><h2>装好后怎么交易</h2></div><p class="g-note" style="margin:0">从桌面图标打开后，点「连接钱包」或「在钱包 App 里打开」，会自动跳到你的钱包（OKX、TokenPocket、MetaMask 等）里签名交易。</p></section>';
    html += '<section class="card"><div class="card-head"><h2>常见问题</h2></div><dl class="app-faq">' +
      "<dt>安全吗？</dt><dd>就是官方认证网站 ailgns.dev 本身，不下载任何安装包，不要任何手机权限，也不会索取私钥或助记词。</dd>" +
      "<dt>点了添加，桌面上没图标？</dt><dd>安卓手机多半是浏览器没有「桌面快捷方式」权限：设置 → 应用管理 → 浏览器 → 权限 → 桌面快捷方式 → 允许，再加一次。</dd>" +
      "<dt>怎么删除？</dt><dd>和删 App 一样：长按桌面图标 → 删除 / 移除。</dd>" +
      "<dt>要更新吗？</dt><dd>不用。每次打开都是最新版，自动更新。</dd>" +
      "<dt>为什么苹果商店搜不到？</dt><dd>这是网页版 App，直接从网站装到桌面，不经过应用商店，打开和 App 一样。</dd></dl></section>";
    A.app.innerHTML = html;
    var box = document.getElementById("app-wz");
    if (box) (function show(key) { wizard(box, key, show); })(k);
  };
  window.addEventListener("beforeinstallprompt", function () { if (location.hash.indexOf("#/app") === 0) setTimeout(A.pages.app, 0); });
})();

