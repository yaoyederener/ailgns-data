// OTC 担保交易：挂单的币锁在智能合约里，吃单在同一笔交易里完成交换，过期自动退回
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  // 部署后填上合约地址；空着时页面显示"即将上线"
  var OTC = "0x4e730be6d46be71223ded5a32dc45799f6d4bc15";
  var AILGNS = "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB";
  var DAI = "0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14";
  var FEE_RECIPIENT = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6";
  var FEE_BPS = 100n;
  var EXPLORER = "https://anubisscan.io";
  // 收入分账合约（Anubis、Polygon 各一个）：原收款钱包授权后，到账的收入按 30% / 40% / 30% 自动分出去（地址、比例写死）
  var SPLITTERS = { anubis: "0xeee877c1b6285b82890bdcd027d2715f658ecf23", polygon: "0xcc274e07847a6a86917b6ccd4e67706170d4036f" };
  var PAYEES = [["0xe8782615e32557f257dd88d70b1eb0d7f47b91c3", 30], ["0xd53a00bb90bb606f10d888419a14eca779f17285", 40], [FEE_RECIPIENT, 30]];
  var SOURCE = "https://github.com/yaoyederener/ailgns-data/blob/main/contracts/AilgnsOtcEscrow.sol";
  var VERIFY = "https://github.com/yaoyederener/ailgns-data/blob/main/contracts/VERIFY.md";
  var SEL = {
    create: "0x9128a740", fill: "0x6fe4a448", cancel: "0x40e58ee5", ordersCount: "0x35daa731", getOrders: "0x8f72fc77",
    approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231"
  };
  // 有效期：合约允许 10 分钟到 30 天；用按钮而不是下拉框，钱包内置浏览器里下拉框经常点不动
  var DURATIONS = [[600, "10 分钟"], [1800, "30 分钟"], [3600, "1 小时"], [7200, "2 小时"], [21600, "6 小时"], [43200, "12 小时"],
    [86400, "1 天"], [3 * 86400, "3 天"], [7 * 86400, "7 天"], [15 * 86400, "15 天"], [30 * 86400, "30 天"]];
  var DUR_MIN = 600, DUR_MAX = 30 * 86400;
  var WEI = 10n ** 18n;
  var account = null;
  // 指导价：要比官方 DEX 对买卖双方都划算，才容易成交
  // 官方 DEX 卖 1 枚实际到手 ≈ 市价 × 96.7%（3% 手续费 + 滑点，按 DEX 实际报价）；买入实际成本 ≈ 市价 × 100.5%（滑点）
  // 吃单方付 1% 手续费，所以：卖单价 ≤ 市价 × 100.5% × 99% 买家才划算；买单价 ≥ 市价 × 96.7% ÷ 99% 卖家才划算
  var DEX_SELL = 0.967, DEX_BUY = 1.005, TAKER = 0.99;
  var GUIDE = { sell: 0.985, buy: 0.99 }; // 挂卖单建议市价 -1.5%，挂买单建议市价 -1%
  var RANGE = { sell: [DEX_SELL, DEX_BUY * TAKER], buy: [DEX_SELL / TAKER, DEX_BUY] };

  // ---------- 数字 ----------
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function toWei(str) {
    // 手机键盘可能打出逗号、全角符号或空格
    str = String(str || "").replace(/[，,．。]/g, ".").replace(/\s/g, "");
    if (!/^\d*\.?\d*$/.test(str) || str === "" || str === ".") return null;
    var parts = str.split("."), frac = (parts[1] || "").slice(0, 18).padEnd(18, "0");
    return BigInt(parts[0] || "0") * WEI + BigInt(frac);
  }
  function num(wei) { return Number(wei) / 1e18; }
  function show(wei, d) { return A.fmt(num(wei), d === undefined ? 4 : d); }
  function ceilDiv(a, b) { return (a + b - 1n) / b; }
  function left(sec) {
    if (sec <= 0) return "已过期";
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return d ? d + " 天 " + h + " 小时" : h ? h + " 小时 " + m + " 分" : m + " 分钟";
  }

  // ---------- 读链 ----------
  function words(h) { var out = []; for (var i = 2; i < h.length; i += 64) out.push(h.slice(i, i + 64)); return out; }
  function readOrders() {
    return A.call(OTC, SEL.ordersCount).then(function (h) {
      var count = Number(BigInt(h)), from = Math.max(0, count - 1000);
      if (!count) return [];
      return A.call(OTC, SEL.getOrders + u256(from) + u256(count - from)).then(function (r) {
        var w = words(r), n = Number(BigInt("0x" + w[1])), list = [];
        for (var i = 0; i < n; i++) {
          var o = w.slice(2 + i * 7, 9 + i * 7);
          list.push({
            id: from + i, maker: "0x" + o[0].slice(24), sellAilgns: BigInt("0x" + o[1]) === 1n, open: BigInt("0x" + o[2]) === 1n,
            expiry: Number(BigInt("0x" + o[3])), giveTotal: BigInt("0x" + o[4]), wantTotal: BigInt("0x" + o[5]), giveLeft: BigInt("0x" + o[6])
          });
        }
        return list;
      });
    });
  }
  function balance(token, who) { return A.call(token, SEL.balanceOf + u256(who)).then(BigInt); }
  function allowance(token, who) { return A.call(token, SEL.allowance + u256(who) + u256(OTC)).then(BigInt); }
  function marketPrice() {
    return A.call("0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", "0x0902f1ac").then(function (h) {
      return Number(A.word(h, 1)) / Number(A.word(h, 0));
    });
  }
  // 每枚 AILGNS 的 DAI 价格
  function priceOf(o) { return o.sellAilgns ? num(o.wantTotal) / num(o.giveTotal) : num(o.giveTotal) / num(o.wantTotal); }

  // ---------- 发交易 ----------
  // 都包在 Promise 里：没有钱包时也会走到失败提示，而不是按钮没反应
  function connect() {
    var eth;
    return A.wallets.choose().then(function (p) {
      eth = p;
      return eth.request({ method: "eth_requestAccounts" });
    }).then(function (a) {
      account = String(a[0]).toLowerCase();
      return W.switchChain(eth);
    }).then(function () { return account; });
  }
  function ready() {
    return Promise.resolve().then(function () { return account ? W.switchChain(W.get()) : connect(); });
  }
  // 钱包已经授权过本站时，不弹窗直接拿到地址
  function silentAccount() {
    if (account) return Promise.resolve();
    return A.wallets.silent().then(function (a) { if (a) account = a; });
  }
  // 合约的失败原因翻译成中文
  var REASONS = {
    TRANSFER_MISMATCH: "不能吃自己的挂单：付款钱包和挂单钱包是同一个。想取消请点「撤单」；测试成交需要换另一个钱包",
    CLOSED: "这张挂单已经成交完或被撤销，请刷新",
    EXPIRED: "这张挂单已经过期",
    BAD_AMOUNT: "数量超过了剩余可成交数量，请刷新后重试",
    PRICE_CHANGED: "应付金额和页面不一致，请刷新后重试",
    TOKEN_TRANSFER_FAILED: "代币转账失败：余额或授权额度不够",
    BAD_DURATION: "有效期不在允许范围内",
    ZERO_AMOUNT: "数量不能为 0",
    NOT_MAKER: "只有挂单人自己能撤单"
  };
  function niceError(e) {
    var msg = (e && (e.message || e.reason)) || "";
    for (var k in REASONS) if (msg.indexOf(k) >= 0) return REASONS[k];
    return W.error(e);
  }
  function send(to, data, say, label) {
    var eth = W.get();
    say("正在检查交易能否成功…");
    // 先模拟一次：会失败的交易直接说明原因，不让钱包弹出一个确认不了的窗口
    return A.rpc("eth_call", [{ from: account, to: to, data: data }, "latest"]).catch(function (e) {
      throw new Error(niceError(e));
    }).then(function () {
      say("请在钱包里确认：" + label + "…");
      return eth.request({ method: "eth_sendTransaction", params: [{ from: account, to: to, data: data }] });
    }).then(function (hash) {
      say(label + "已提交，等待链上确认…");
      return W.waitReceipt(hash);
    });
  }
  // 授权额度不够时先授权本次需要的数量（不做无限授权）
  function ensureAllowance(token, amount, say, name) {
    return allowance(token, account).then(function (a) {
      if (a >= amount) return;
      return send(token, SEL.approve + u256(OTC) + u256(amount), say, "授权 " + show(amount) + " " + name + " 给托管合约");
    });
  }

  // ---------- 页面 ----------
  // 和官方 DEX 兑换对比：醒目标识，按成交 1,000 美元算（DEX 手续费 3%–28%、滑点容差 0.5%–1% 由站长提供；滑点按「最多」写，实际滑点取决于池子深度）
  var VS = '<section class="vs"><div class="vs-head"><span class="vs-tag">同样买卖 1,000 美元的 AiLGNS</span>' +
    '<h2>官方 DEX 要贵 <em>3–28 倍</em>，在这里每 1,000 美元最多省 <em>270 美元</em></h2></div>' +
    '<div class="vs-nums">' +
    '<div class="vs-num vs-bad"><span>官方 DEX 扣</span><b>$30–$280</b><small>3%–28%<br>+ 滑点 ≤ $10</small></div>' +
    '<div class="vs-num vs-good"><span>本站只收</span><b>$10</b><small>固定 1%</small></div>' +
    '<div class="vs-num vs-win"><span>你省下</span><b>$20–$270</b><small>每 1,000 美元</small></div></div>' +
    '<div class="vs-bars" aria-hidden="true">' +
    '<div><span>官方最高</span><i class="bad" style="width:100%"></i><b>$280</b></div>' +
    '<div><span>官方最低</span><i class="bad" style="width:10.7%"></i><b>$30</b></div>' +
    '<div><span>本站</span><i class="good" style="width:3.6%"></i><b>$10</b></div></div>' +
    '<div class="vs-grid"><div class="vs-col vs-us"><b>AiLGNS OTC（本站）</b><ul>' +
    "<li><i>✓</i><span>手续费固定 <b>1%</b>：1,000 美元只收 <b>10 美元</b></span></li>" +
    "<li><i>✓</i><span><b>0 滑点</b>：挂单价是多少，就按多少成交，一分不少</span></li>" +
    "<li><i>✓</i><span>挂单、撤单、到期退回全部免费</span></li></ul></div>" +
    '<div class="vs-col vs-them"><b>官方 DEX 兑换</b><ul>' +
    "<li><i>✕</i><span>手续费 <b>3%–28%</b>：1,000 美元被扣 <b>30–280 美元</b></span></li>" +
    "<li><i>✕</i><span>还有滑点：滑点容差一般设 <b>0.5%–1%</b>，1,000 美元最多再少拿 <b>5–10 美元</b></span></li>" +
    "<li><i>✕</i><span>交易越频繁，被扣得越多</span></li></ul></div></div>" +
    '<p class="vs-save">买卖 1 万美元：官方 DEX 扣 <s>$300–$2,800</s>，本站只收 <b>$100</b></p></section>';

  // 首页大横幅：AiLGNS OTC 主推
  var HERO_ART = '<svg class="hero-art" viewBox="0 0 220 180" aria-hidden="true"><defs>' +
    '<linearGradient id="ha" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1930f7"/><stop offset=".55" stop-color="#6c1ef1"/><stop offset="1" stop-color="#c00bea"/></linearGradient>' +
    '<linearGradient id="hb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient></defs>' +
    '<circle cx="110" cy="90" r="78" fill="url(#ha)" opacity=".12"/><circle cx="110" cy="90" r="56" fill="url(#ha)" opacity=".16"/>' +
    '<path d="M110 40l34 13v26c0 23-15 40-34 47-19-7-34-24-34-47V53z" fill="url(#ha)"/>' +
    '<path d="M95 88l11 11 20-22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<g><circle cx="38" cy="58" r="24" fill="url(#hb)" stroke="#d9cdfa" stroke-width="2"/><text x="38" y="64" text-anchor="middle" font-size="15" font-weight="800" fill="#6c1ef1">AiL</text></g>' +
    '<g><circle cx="182" cy="122" r="24" fill="url(#hb)" stroke="#d9cdfa" stroke-width="2"/><text x="182" y="128" text-anchor="middle" font-size="14" font-weight="800" fill="#c00bea">DAI</text></g>' +
    '<path d="M62 50c22-18 48-22 66-16" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-dasharray="4 5"/>' +
    '<path d="M158 130c-22 18-48 22-66 16" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-dasharray="4 5"/></svg>';
  function hero(mkt, live) {
    return '<section class="otc-hero"><div class="hero-txt">' +
      '<span class="pill">智能合约担保 · 无需信任 · 无需许可</span>' +
      '<h1>AiLGNS <span class="grad">OTC</span></h1>' +
      '<p>AiLGNS ⇄ DAI 场外交易。币锁在合约里，付款和收币一笔完成，到期没成交自动退回（有效期 10 分钟到 30 天自选）。</p>' +
      '<div class="hero-promo"><span class="hp-tag">🎁 交易就送会员</span><span>任意金额成交送<b>初级 VIP</b> · 累计成交满 <b>1 万 DAI</b> 送<b>高级 VIP</b></span></div>' +
      '<div class="hero-cta"><button data-go="sell">我要卖 AiLGNS</button><button class="ghost" data-go="buy">我要买 AiLGNS</button></div>' +
      '<div class="hero-stats"><div><span>AiLGNS 市价</span><b>' + (mkt ? A.fmt(mkt, 2) : "—") + ' <small>DAI</small></b></div>' +
      "<div><span>挂单中</span><b>" + (live === null ? "—" : live) + " <small>张</small></b></div><div><span>成交手续费</span><b>1%</b></div></div></div>" + HERO_ART + "</section>";
  }

  function renderOtc(id, sub) {
    var app = A.app;
    if (sub === "deploy") return renderDeploy(id);
    if (sub === "split") return renderSplit(id);
    if (!OTC) {
      app.innerHTML = '<section class="card" style="text-align:center;padding:36px 18px"><h2>即将上线</h2><p class="muted" style="margin:8px 0 0">托管合约部署完成后开放挂单和交易。</p></section>';
      return;
    }
    app.innerHTML = '<div class="loading">正在读取订单…</div>';
    Promise.all([readOrders(), marketPrice().catch(function () { return null; }), silentAccount()]).then(function (r) {
      if (!A.isCurrent(id)) return;
      draw(id, r[0], r[1]);
    }, function () {
      if (A.isCurrent(id)) app.innerHTML = head + '<div class="card err">订单读取失败，请稍后刷新。</div>';
    });

    function draw(id, orders, mkt) {
      var now = Date.now() / 1000;
      var live = orders.filter(function (o) { return o.open && o.expiry > now && o.giveLeft > 0n; });
      var sells = live.filter(function (o) { return o.sellAilgns; }).sort(function (a, b) { return priceOf(a) - priceOf(b); });
      var buys = live.filter(function (o) { return !o.sellAilgns; }).sort(function (a, b) { return priceOf(b) - priceOf(a); });
      var mine = account ? orders.filter(function (o) { return o.maker === account; }).reverse().slice(0, 30) : [];

      function row(o) {
        var p = priceOf(o), ail = o.sellAilgns ? o.giveLeft : (o.giveLeft * o.wantTotal) / o.giveTotal;
        var diff = mkt ? (p / mkt - 1) * 100 : null;
        // 操作按钮放在最前面：买入绿色、卖出红色，自己的单显示撤单
        var act = o.maker === account
          ? '<button class="ghost act-btn" data-cancel="' + o.id + '">撤单</button>'
          : '<button class="act-btn ' + (o.sellAilgns ? "btn-buy" : "btn-sell") + '" data-fill="' + o.id + '">' + (o.sellAilgns ? "买入" : "卖出") + "</button>";
        return '<tr><td class="act">' + act + '</td><td data-l="单价 DAI" class="price"><b>' + A.fmt(p, 2) + '</b></td><td data-l="剩余 AiLGNS">' + show(ail) + '</td><td data-l="总额 DAI">' + A.fmt(num(ail) * p, 2) + "</td>" +
          '<td data-l="对比市价" class="' + (diff === null ? "" : diff >= 0 ? "up" : "down") + '">' + (diff === null ? "—" : (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%") + "</td>" +
          '<td data-l="剩余时间">' + left(o.expiry - now) + '</td><td data-l="挂单人" class="l mono">' + (o.maker === account ? '<b style="color:var(--gold)">我的</b>' : A.short(o.maker)) + "</td></tr>";
      }
      function book(title, list, hint) {
        return '<section class="card"><div class="card-head"><h2>' + title + '</h2><span class="muted">' + hint + "</span></div>" +
          (list.length ? '<div class="tbl-wrap"><table class="cards book"><thead><tr><th class="l">操作</th><th>单价 DAI</th><th>剩余 AiLGNS</th><th>总额 DAI</th><th>对比市价</th><th>剩余时间</th><th class="l">挂单人</th></tr></thead><tbody>' +
            list.map(row).join("") + "</tbody></table></div>" : '<div class="empty">暂无挂单</div>') + "</section>";
      }

      // 打开就是交易：最上面只留一条「交易就送会员」+ 连钱包，紧接着就是挂单簿和挂单表单；介绍、DEX 对比这些营销内容在「营销广告」栏目
      var html = '<div class="otc-top"><span class="hp-tag">🎁 交易就送会员</span><span class="ot-txt">任意金额成交送<b>初级 VIP</b> · 累计满 <b>1 万 DAI</b> 送<b>高级 VIP</b></span>' +
        (account ? '<span class="ot-w mono">' + A.short(account) + "</span>" : '<button class="ot-c" id="otc-top-c">' + (A.wallets && !window.ethereum && /Android|iPhone|iPad/i.test(navigator.userAgent) ? "在钱包 App 里打开" : "连接钱包") + "</button>") + "</div>";
      html += book("卖出 AiLGNS", buys, "卖成 DAI · 价格从高到低") + book("买入 AiLGNS", sells, "用 DAI 买 · 价格从低到高"); // 卖出放上面：鼓励大家卖 AiLGNS
      html += createForm();
      if (account) html += myOrders(mine, now, mkt);
      html += '<div class="kpis kpis-2">' +
        '<div class="kpi"><div class="k">托管合约</div><div class="v" style="font-size:16px"><a class="mono" target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + OTC + '">' + A.short(OTC) + ' ↗</a></div><div class="d"><a target="_blank" rel="noopener" href="' + SOURCE + '">开源源码 ↗</a> · <a target="_blank" rel="noopener" href="' + VERIFY + '">编译参数与核对 ↗</a></div></div>' +
        '<div class="kpi" id="otc-wallet"></div></div>';
      html += '<p class="note">🎁 成交后到「会员」页填这个钱包地址点「查询」，会员就能用。<a href="#/promo">为什么在这里交易更划算 →</a></p>';
      html += '<p class="note">成交手续费 1%，由吃单方承担（从收到的币里扣）；挂单、撤单、过期退回都不收费。智能合约未经第三方审计，请先小额试用。本站为 AWAKE HELIX 官方授权的 AiLGNS OTC 服务站。</p>';
      html += '<div class="modal" id="otc-modal" hidden></div>';
      A.app.innerHTML = html;
      bind(id, orders, mkt);
      walletCard();
      var tc = document.getElementById("otc-top-c");
      if (tc) tc.onclick = function () { var c = document.getElementById("otc-connect"); if (c) c.click(); };
      deboxCard(id);
    }

    // DeBox 通知：放在「发布挂单」按钮上方，挂单时顺手绑定；之后成交 / 撤单 / 到期退回都会私信通知
    var dbx = null; // { ready, bot, bound }
    function dbxLink() { return "https://m.debox.pro/card?id=" + encodeURIComponent(dbx.bot.uid); } // 机器人名片页：打开后点「关注」/「发消息」
    function copyTo(text, btn) {
      function ok() { btn.textContent = "已复制 ✓"; }
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, fallback);
      fallback();
      function fallback() { // 部分钱包浏览器不支持剪贴板接口
        var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); ok(); } catch (e) { btn.textContent = text; }
        ta.remove();
      }
    }
    function bindCopies(root) {
      root.querySelectorAll("[data-dbx-copy]").forEach(function (b) { b.onclick = function () { copyTo(b.getAttribute("data-dbx-copy"), b); }; });
      root.querySelectorAll("[data-dbx-link]").forEach(function (b) { b.onclick = showLink; });
    }
    // 弹出机器人二维码：客户长按保存（或截图），到 DeBox「扫一扫」从相册选图，直接打开机器人关注
    var QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    function loadQr() {
      if (window.qrcode) return Promise.resolve(window.qrcode);
      return new Promise(function (ok, fail) {
        var sc = document.createElement("script"); sc.src = QR_LIB;
        sc.onload = function () { ok(window.qrcode); }; sc.onerror = fail;
        document.head.appendChild(sc);
      });
    }
    // 二维码画成一张带白边和说明文字的图片，方便长按保存到相册
    function qrImage(text, caption) {
      return loadQr().then(function (qrcode) {
        var q = qrcode(0, "M"); q.addData(text); q.make();
        var n = q.getModuleCount(), cell = 8, pad = 32, size = n * cell + pad * 2, c = document.createElement("canvas");
        c.width = size; c.height = size + 56;
        var g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = "#191839";
        for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(pad + k * cell, pad + r * cell, cell, cell);
        g.font = "700 22px -apple-system, PingFang SC, Microsoft YaHei, sans-serif"; g.textAlign = "center"; g.fillStyle = "#7027d9";
        g.fillText(caption, size / 2, size + 26);
        return c.toDataURL("image/png");
      });
    }
    function showLink() {
      var link = dbxLink(), name = dbx.bot.name || "机器人", box = document.createElement("div");
      box.className = "modal";
      box.innerHTML = '<div class="modal-box"><div class="card-head"><h2>🔔 扫码关注「' + A.esc(name) + '」</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
        '<div class="dbx-qr" id="dbx-qr"><div class="loading">正在生成二维码…</div></div>' +
        '<ol class="steps"><li><b>长按二维码保存到相册</b>（或截图）</li>' +
        "<li>打开 <b>DeBox App</b> →「扫一扫」→ 从<b>相册</b>选这张图</li>" +
        "<li>进入机器人页面，点<b>关注</b></li>" +
        "<li>回到这里，复制钱包地址发给机器人，收到「✅ 已绑定」就完成了</li></ol>" +
        '<details class="dbx-alt"><summary>扫码不方便？复制链接</summary><div class="dbx-link mono">' + link + '</div><button class="ghost" id="dbx-link-copy" style="padding:8px 14px;margin-top:8px">复制链接</button><p class="note">把链接粘贴发到 DeBox 任意聊天里点开，也能进入机器人页面。</p></details></div>';
      document.body.appendChild(box);
      box.addEventListener("click", function (e) { if (e.target === box || e.target.closest("[data-close]")) box.remove(); });
      var btn = document.getElementById("dbx-link-copy");
      btn.onclick = function () { copyTo(link, btn); };
      qrImage(link, "DeBox 扫码关注 " + name).then(function (url) {
        var el = document.getElementById("dbx-qr");
        if (el) el.innerHTML = '<img src="' + url + '" alt="机器人二维码">';
      }, function () {
        var el = document.getElementById("dbx-qr");
        if (el) el.innerHTML = '<p class="note">二维码加载失败，请用下面「复制链接」。</p>';
        box.querySelector(".dbx-alt").open = true;
      });
    }
    // 客户大多在钱包的 DApp 浏览器里，那里跳不到 DeBox App：所以给出机器人名字 / ID 让他复制，到 DeBox 里搜
    function dbxHtml() {
      if (dbx.bound) return '<div class="dbx-bar dbx-on"><span class="dbx-bell">🔔</span><div><b>已开启 DeBox 通知</b><small>这个钱包的挂单成交、撤单、到期退回会私信到你的 DeBox</small></div></div>';
      return '<div class="dbx-bar"><span class="dbx-bell">🔔</span><div class="dbx-txt"><b>挂单成交 / 退回，DeBox 私信秒通知</b>' +
        '<ol class="dbx-steps"><li><button type="button" data-dbx-link>显示机器人二维码</button>，长按保存到相册</li>' +
        "<li>打开 <b>DeBox</b>「扫一扫」→ 从相册选这张图 → 关注「" + A.esc(dbx.bot.name || "机器人") + "」</li>" +
        "<li>把你的钱包地址发给机器人" + (account ? '：<span class="mono">' + A.short(account) + '</span> <button type="button" class="ghost" data-dbx-copy="' + account + '">复制地址</button>' : "（连接钱包后这里显示）") + "，收到「✅ 已绑定」就好了</li></ol></div></div>";
    }
    function deboxCard(id) {
      fetch("/api/debox-bot" + (account ? "?addr=" + account : "")).then(function (r) { return r.json(); }).then(function (d) {
        dbx = d;
        var el = document.getElementById("dbx-slot");
        if (!el || !A.isCurrent(id) || !d.ready) return; // 机器人还没配置好时不显示
        el.innerHTML = dbxHtml();
        bindCopies(el);
      }).catch(function () { /* 通知功能不可用时不显示 */ });
    }
    // 挂单成功后：还没绑定的，弹窗提醒顺手开启通知
    function dbxAfterCreate() {
      if (!dbx || !dbx.ready || dbx.bound || !account) return false;
      var box = document.createElement("div");
      box.className = "modal";
      box.innerHTML = '<div class="modal-box"><div class="card-head"><h2>✅ 挂单成功！</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
        '<p><b>开启 DeBox 通知</b>，有人成交、到期退回，第一时间私信告诉你，不用一直盯着网页。</p>' +
        '<ol class="steps"><li><button data-dbx-link>显示机器人二维码</button>，长按保存到相册</li>' +
        '<li>打开 <b>DeBox</b>「扫一扫」→ 从相册选这张图 → 关注「' + A.esc(dbx.bot.name || "机器人") + '」</li>' +
        '<li>把钱包地址发给机器人：<div class="copy"><span class="mono">' + account + '</span><button class="ghost" data-dbx-copy="' + account + '">复制</button></div>收到「✅ 已绑定」就好了</li></ol></div>';
      document.body.appendChild(box);
      box.addEventListener("click", function (e) { if (e.target === box || e.target.closest("[data-close]")) box.remove(); });
      bindCopies(box);
      return true;
    }

    // 我的钱包：地址 + AiLGNS / DAI 余额；连接后随时刷新
    function walletCard() {
      var el = document.getElementById("otc-wallet");
      if (!el) return;
      if (!account) {
        var jump = !A.wallets.list().length && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); // 手机上没有钱包（桌面图标、普通浏览器）：直接跳到钱包 App 里打开
        el.innerHTML = '<div class="k">我的钱包</div><div class="v" style="font-size:16px"><button id="otc-connect" style="padding:8px 16px">' + (jump ? "在钱包 App 里打开" : "连接钱包") + '</button></div><div class="d">' + (jump ? "挂单、买卖要在钱包 App 里操作，点一下自动跳过去" : "连接后显示 AiLGNS 和 DAI 余额") + "</div>";
        document.getElementById("otc-connect").onclick = function () {
          connect().then(function () { renderOtc(id); }, function (e) { el.querySelector(".d").textContent = niceError(e); });
        };
        return;
      }
      el.innerHTML = '<div class="k">' + A.esc(A.wallets.name() || "我的钱包") + ' <span class="mono">' + A.short(account) + '</span> · <a href="#" id="otc-switch">换钱包</a></div><div class="bal"><div><b id="bal-ail">…</b> AiLGNS</div><div><b id="bal-dai">…</b> DAI</div></div>' +
        '<div class="d"><a href="#" id="otc-watch">把 AiLGNS 添加到钱包</a></div>';
      Promise.all([balance(AILGNS, account), balance(DAI, account)]).then(function (b) {
        var a = document.getElementById("bal-ail"), d = document.getElementById("bal-dai");
        if (a) a.textContent = show(b[0]);
        if (d) d.textContent = show(b[1], 2);
      });
      document.getElementById("otc-switch").onclick = function (e) {
        e.preventDefault();
        A.wallets.forget();
        account = null;
        connect().then(function () { renderOtc(id); }, function (err) { renderOtc(id); });
      };
      document.getElementById("otc-watch").onclick = function (e) {
        e.preventDefault();
        var link = this;
        Promise.resolve().then(function () { return W.get().request({ method: "wallet_watchAsset", params: { type: "ERC20", options: { address: AILGNS, symbol: "AiLGNS", decimals: 18 } } }); })
          .then(function () { link.textContent = "已添加 ✓"; }, function () { link.textContent = "钱包不支持自动添加，请手动添加合约 " + A.short(AILGNS); });
      };
    }

    function createForm() {
      return '<section class="card" id="otc-form"><div class="card-head"><h2>发布挂单</h2><span class="muted">币先存进托管合约，成交前随时可撤</span></div>' +
        '<div class="seg" id="otc-side"><button data-side="sell" class="on">我要卖 AiLGNS</button><button data-side="buy">我要买 AiLGNS</button></div>' +
        '<div class="form-grid"><label>数量（AiLGNS）<input id="otc-qty" inputmode="decimal" placeholder="例如 5"></label>' +
        '<label>单价（DAI / 枚）<input id="otc-price" inputmode="decimal" placeholder="例如 800"></label>' +
        "</div>" + '<div class="qty-pick" id="otc-pick"></div>' + '<div class="guide" id="otc-guide"></div>' +
        '<div class="dur"><span class="dur-t">有效期 <small class="muted">到期没成交，币自动退回</small></span><input type="hidden" id="otc-dur" value="1800">' +
        '<div class="dur-opts" id="otc-durs">' + DURATIONS.map(function (d) { return '<button type="button" data-d="' + d[0] + '"' + (d[0] === 1800 ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") +
        '<button type="button" data-d="custom">自定义</button></div>' +
        '<div class="dur-custom" id="otc-dur-custom" hidden><input id="otc-dur-n" inputmode="numeric" placeholder="数字"><div class="seg" id="otc-dur-u"><button type="button" data-u="60">分钟</button><button type="button" data-u="3600" class="on">小时</button><button type="button" data-u="86400">天</button></div></div>' +
        '<p class="note" id="otc-dur-st">有效期 30 分钟</p></div>' +
        '<p class="note" id="otc-sum">填好数量和单价后显示总额</p><div id="dbx-slot"></div><button id="otc-create" style="padding:12px 22px">发布挂单</button><p class="note" id="otc-st"></p></section>';
    }

    function myOrders(list, now, mkt) {
      if (!list.length) return '<section class="card"><div class="card-head"><h2>我的挂单</h2></div><div class="empty">还没有挂单</div></section>';
      return '<section class="card"><div class="card-head"><h2>我的挂单</h2></div><div class="tbl-wrap"><table class="cards"><thead><tr><th>#</th><th class="l">方向</th><th>单价</th><th>剩余</th><th class="l">状态</th><th></th></tr></thead><tbody>' +
        list.map(function (o) {
          var status = !o.open ? (o.giveLeft === 0n ? "已结束" : "已结束") : o.expiry <= now ? "已过期，等待退回" : "挂单中 · " + left(o.expiry - now);
          var r = mkt && o.open && o.expiry > now ? priceOf(o) / mkt : null, side = o.sellAilgns ? "sell" : "buy";
          if (r && (side === "sell" ? r > RANGE.sell[1] : r < RANGE.buy[0])) status += '<br><span class="down">价格' + (side === "sell" ? "偏高" : "偏低") + "，很难成交，建议撤单按指导价 " + A.fmt(mkt * GUIDE[side], 2) + " 重挂</span>";
          var remain = o.sellAilgns ? show(o.giveLeft) + " AiLGNS" : show(o.giveLeft, 2) + " DAI";
          return '<tr><td data-l="编号">#' + o.id + '</td><td data-l="方向" class="l">' + (o.sellAilgns ? "卖 AiLGNS" : "买 AiLGNS") + '</td><td data-l="单价">' + A.fmt(priceOf(o), 2) + '</td><td data-l="剩余">' + remain + '</td><td data-l="状态" class="l">' + status + '</td><td class="act">' +
            (o.open ? '<button class="ghost" data-cancel="' + o.id + '" style="padding:6px 12px">' + (o.expiry <= now ? "取回" : "撤单") + "</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div></section>";
    }

    function bind(id, orders, mkt) {
      var st = document.getElementById("otc-st");
      function say(t, bad) {
        st.className = "note" + (bad ? " down" : "");
        st.textContent = t;
        if (st.scrollIntoView) st.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      function reload() { if (A.isCurrent(id)) renderOtc(id); }
      var c = document.getElementById("otc-connect");
      if (c) c.onclick = function () { connect().then(reload, function (e) { say(niceError(e), true); }); };

      // 从「营销广告」点「我要卖 / 我要买」进来（#/otc/sell、#/otc/buy）：切到对应方向，滚到挂单表单
      var go = location.hash.split("/")[2];
      if (go === "sell" || go === "buy") setTimeout(function () {
        var t = document.querySelector('#otc-side [data-side="' + go + '"]');
        if (t) t.click();
        var f = document.getElementById("otc-form");
        if (f) f.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);

      // 发布挂单
      var side = "sell";
      document.querySelectorAll("#otc-side button").forEach(function (b) {
        b.onclick = function () {
          side = b.getAttribute("data-side");
          document.querySelectorAll("#otc-side button").forEach(function (x) { x.classList.toggle("on", x === b); });
          guide();
          calc();
          pick();
        };
      });
      var qty = document.getElementById("otc-qty"), price = document.getElementById("otc-price"), sum = document.getElementById("otc-sum");
      if (mkt) price.placeholder = "市价约 " + mkt.toFixed(2);
      // 指导价：默认自动填进单价；客户自己改过就不再覆盖
      var auto = true;
      function guide() {
        var el = document.getElementById("otc-guide");
        if (!mkt) { el.hidden = true; return; }
        var g = mkt * GUIDE[side], lo = mkt * RANGE[side][0], hi = mkt * RANGE[side][1], dexSell = mkt * DEX_SELL, dexBuy = mkt * DEX_BUY;
        el.innerHTML = '<div class="guide-head"><span class="guide-tag">指导价</span><b class="num">' + A.fmt(g, 2) + '</b><small>DAI / 枚 · 比市价低 ' + ((1 - GUIDE[side]) * 100).toFixed(1) + '%</small><button type="button" class="ghost" id="otc-guse">用这个价</button></div>' +
          (side === "sell"
            ? "<p>买家比去官方 DEX 买便宜；你比在 DEX 卖（每枚到手约 " + A.fmt(dexSell, 2) + "）多拿约 <b>" + A.fmt(g - dexSell, 2) + " DAI</b>，挂出去容易被吃掉。</p>" +
              '<p class="muted">合理区间 ' + A.fmt(lo, 2) + "–" + A.fmt(hi, 2) + "。高于 " + A.fmt(hi, 2) + " 买家直接去 DEX 买更划算，基本卖不掉。</p>"
            : "<p>卖家扣 1% 手续费后每枚到手 " + A.fmt(g * TAKER, 2) + "，比在 DEX 卖（约 " + A.fmt(dexSell, 2) + "）多，容易成交；你比去 DEX 买（约 " + A.fmt(dexBuy, 2) + "）每枚省约 <b>" + A.fmt(dexBuy - g, 2) + " DAI</b>。</p>" +
              '<p class="muted">合理区间 ' + A.fmt(lo, 2) + "–" + A.fmt(hi, 2) + "。低于 " + A.fmt(lo, 2) + " 卖家去 DEX 卖更划算，基本买不到。</p>");
        document.getElementById("otc-guse").onclick = function () { price.value = g.toFixed(2); auto = true; calc(); pick(); };
        if (auto || !price.value) { price.value = g.toFixed(2); auto = true; }
      }
      function calc() {
        var q = toWei(qty.value), p = toWei(price.value);
        if (!q || !p) { sum.textContent = "填好数量后显示总额"; return null; }
        var total = (q * p) / WEI;
        var diff = mkt ? (num(p) / mkt - 1) * 100 : null;
        var r = mkt ? num(p) / mkt : null, verdict = "";
        if (r) {
          if (side === "sell") verdict = r > RANGE.sell[1] ? "⚠️ 价格偏高：买家去官方 DEX 买更划算，很难成交，建议不高于 " + A.fmt(mkt * RANGE.sell[1], 2) : r < DEX_SELL ? "⚠️ 低于官方 DEX 卖出到手价（约 " + A.fmt(mkt * DEX_SELL, 2) + "），你会少拿 DAI" : "";
          else verdict = r < RANGE.buy[0] ? "⚠️ 价格偏低：卖家去官方 DEX 卖更划算，很难成交，建议不低于 " + A.fmt(mkt * RANGE.buy[0], 2) : r > DEX_BUY ? "⚠️ 高于官方 DEX 买入价（约 " + A.fmt(mkt * DEX_BUY, 2) + "），你会多花 DAI" : "";
        }
        sum.innerHTML = (side === "sell" ? "存入 <b>" + show(q) + " AiLGNS</b>，全部成交后收到 <b>" + show(total, 2) + " DAI</b>" : "存入 <b>" + show(total, 2) + " DAI</b>，全部成交后收到 <b>" + show(q) + " AiLGNS</b>") +
          (diff === null ? "" : '　<span class="' + (diff >= 0 ? "up" : "down") + '">比市价 ' + (diff >= 0 ? "高 " : "低 ") + Math.abs(diff).toFixed(2) + "%</span>") +
          (r ? "<br>" + (verdict ? '<span class="down">' + verdict + "</span>" : '<span class="up">✓ 价格合理，比官方 DEX 划算，容易成交</span>') : "");
        return { q: q, total: total };
      }
      qty.oninput = calc; price.oninput = function () { auto = false; calc(); pick(); };
      guide();
      // 可用余额 + 25% / 50% / 75% / 最大：卖单按 AiLGNS 余额，买单按 DAI 余额 ÷ 单价换成能买多少枚
      var bal = null;
      function floorStr(wei, d) { var k = 10n ** BigInt(18 - d), v = wei / k * k, s = (Number(v / 10n ** 12n) / 1e6).toFixed(d); return s.replace(/\.?0+$/, ""); }
      function maxQty() {
        if (!bal) return null;
        if (side === "sell") return bal.ail;
        var p = toWei(price.value);
        return p ? bal.dai * WEI / p : null;
      }
      function pick() {
        var el = document.getElementById("otc-pick");
        if (!account) { el.innerHTML = '<span class="muted">可用余额：</span><a href="#" id="otc-pick-c">连接钱包后显示</a>'; document.getElementById("otc-pick-c").onclick = function (e) { e.preventDefault(); var c = document.getElementById("otc-connect"); if (c) c.click(); }; return; }
        if (!bal) { el.innerHTML = '<span class="muted">可用余额读取中…</span>'; return; }
        var m = maxQty();
        el.innerHTML = '<div class="qp-bal"><span class="muted">可用</span><b>' + (side === "sell" ? show(bal.ail) + " AiLGNS" : show(bal.dai, 2) + " DAI") + "</b>" +
          (side === "buy" ? '<span class="muted">' + (m !== null ? "按这个单价最多买 " + show(m) + " 枚" : "先填单价，算能买多少枚") + "</span>" : "") + "</div>" +
          '<div class="qp-btns">' + [[25, "25%"], [50, "50%"], [75, "75%"], [100, "最大"]].map(function (x) { return '<button type="button" class="ghost" data-pct="' + x[0] + '"' + (m ? "" : " disabled") + ">" + x[1] + "</button>"; }).join("") + "</div>";
        el.querySelectorAll("[data-pct]").forEach(function (b) {
          b.onclick = function () {
            var mq = maxQty();
            if (!mq) return;
            qty.value = floorStr(mq * BigInt(b.getAttribute("data-pct")) / 100n, 6);
            calc();
          };
        });
      }
      pick();
      if (account) Promise.all([balance(AILGNS, account), balance(DAI, account)]).then(function (b) { bal = { ail: b[0], dai: b[1] }; pick(); }, function () { bal = null; });
      // 有效期按钮
      var durIn = document.getElementById("otc-dur"), durSt = document.getElementById("otc-dur-st"), custom = document.getElementById("otc-dur-custom");
      var durN = document.getElementById("otc-dur-n"), unit = 3600;
      function durText(sec) {
        return sec % 86400 === 0 ? sec / 86400 + " 天" : sec % 3600 === 0 ? sec / 3600 + " 小时" : sec >= 3600 ? Math.floor(sec / 3600) + " 小时 " + Math.round(sec % 3600 / 60) + " 分钟" : Math.round(sec / 60) + " 分钟";
      }
      function setDur(sec) {
        if (!(sec >= DUR_MIN && sec <= DUR_MAX)) { durIn.value = ""; durSt.innerHTML = '<span class="down">有效期要在 10 分钟到 30 天之间</span>'; return; }
        durIn.value = String(sec);
        durSt.textContent = "有效期 " + durText(sec) + "，约 " + new Date(Date.now() + sec * 1000).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 到期";
      }
      function customDur() { var n = Number(durN.value); setDur(n > 0 ? Math.round(n * unit) : NaN); }
      document.querySelectorAll("#otc-durs button").forEach(function (b) {
        b.onclick = function () {
          document.querySelectorAll("#otc-durs button").forEach(function (x) { x.classList.toggle("on", x === b); });
          var d = b.getAttribute("data-d");
          custom.hidden = d !== "custom";
          if (d === "custom") { customDur(); durN.focus(); } else setDur(Number(d));
        };
      });
      document.querySelectorAll("#otc-dur-u button").forEach(function (b) {
        b.onclick = function () {
          document.querySelectorAll("#otc-dur-u button").forEach(function (x) { x.classList.toggle("on", x === b); });
          unit = Number(b.getAttribute("data-u")); customDur();
        };
      });
      durN.oninput = customDur;
      setDur(1800);
      document.getElementById("otc-create").onclick = function () {
        var btn = this, v = calc();
        if (!v || v.total === 0n) { say("请填写数量和单价", true); return; }
        var sell = side === "sell", give = sell ? v.q : v.total, want = sell ? v.total : v.q, token = sell ? AILGNS : DAI;
        var dur = Number(document.getElementById("otc-dur").value);
        if (!dur) { say("有效期要在 10 分钟到 30 天之间", true); return; }
        btn.disabled = true;
        ready().then(function () {
          walletCard();
          return balance(token, account);
        }).then(function (b) {
          if (b < give) throw new Error("余额不足：需要 " + show(give, sell ? 4 : 2) + " " + (sell ? "AiLGNS" : "DAI") + "，钱包里有 " + show(b, sell ? 4 : 2));
          return ensureAllowance(token, give, say, sell ? "AiLGNS" : "DAI");
        }).then(function () {
          return send(OTC, SEL.create + u256(sell ? 1 : 0) + u256(give) + u256(want) + u256(dur), say, "发布挂单");
        }).then(function () {
          say("挂单成功！");
          dbxAfterCreate();
          setTimeout(reload, 1200);
        }, function (e) { say(niceError(e), true); btn.disabled = false; });
      };

      // 撤单 / 取回
      A.app.querySelectorAll("[data-cancel]").forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          ready().then(function () {
            return send(OTC, SEL.cancel + u256(b.getAttribute("data-cancel")), say, "撤单");
          }).then(function () { say("已撤单，币已退回你的钱包"); setTimeout(reload, 1200); }, function (e) { say(niceError(e), true); b.disabled = false; });
        };
      });

      // 吃单
      A.app.querySelectorAll("[data-fill]").forEach(function (b) {
        b.onclick = function () {
          var o = orders.filter(function (x) { return x.id === Number(b.getAttribute("data-fill")); })[0];
          openFill(o, reload);
        };
      });
    }

    // 吃单弹窗：数量一律按 AiLGNS 填
    function openFill(o, reload) {
      var m = document.getElementById("otc-modal"), p = priceOf(o);
      var maxAil = o.sellAilgns ? o.giveLeft : ceilDiv(o.giveLeft * o.wantTotal, o.giveTotal);
      m.hidden = false;
      m.innerHTML = '<div class="modal-box"><div class="card-head"><h2>' + (o.sellAilgns ? "买入 AiLGNS" : "卖出 AiLGNS") + ' · #' + o.id + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
        '<dl class="dl"><dt>单价</dt><dd>' + A.fmt(p, 4) + " DAI</dd><dt>可成交</dt><dd>" + show(maxAil) + ' AiLGNS</dd><dt>挂单人</dt><dd class="mono">' + A.short(o.maker) + "</dd></dl>" +
        '<label class="full">' + (o.sellAilgns ? "买入数量" : "卖出数量") + '（AiLGNS）<div class="row"><input id="f-qty" inputmode="decimal" placeholder="0"><button class="ghost" id="f-max" style="padding:0 14px">全部</button></div></label>' +
        '<div class="quote" id="f-quote">输入数量后显示</div><div class="note" id="f-bal" style="margin:0"></div><button id="f-go" style="padding:12px 22px;width:100%">确认' + (o.sellAilgns ? "买入" : "卖出") + '</button><p class="note" id="f-st"></p></div>';
      var qty = document.getElementById("f-qty"), quote = document.getElementById("f-quote"), st = document.getElementById("f-st");
      var payToken = o.sellAilgns ? DAI : AILGNS, payName = o.sellAilgns ? "DAI" : "AiLGNS";
      if (account) balance(payToken, account).then(function (b) {
        var el = document.getElementById("f-bal");
        if (el) el.textContent = "你的余额：" + show(b, o.sellAilgns ? 2 : 4) + " " + payName;
      });
      function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; }
      function plan() {
        var q = toWei(qty.value);
        if (!q) { quote.textContent = "输入数量后显示"; return null; }
        if (q > maxAil) q = maxAil;
        var amount, pay, get, fee;
        if (o.sellAilgns) { // 拿走 q 个 AILGNS，付 DAI
          amount = q; pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
        } else { // 付 AILGNS，拿走 DAI
          amount = (q * o.giveTotal) / o.wantTotal;
          if (amount > o.giveLeft) amount = o.giveLeft;
          pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
        }
        fee = (amount * FEE_BPS) / 10000n; get = amount - fee;
        if (amount === 0n) { quote.textContent = "数量太小"; return null; }
        quote.innerHTML = o.sellAilgns
          ? "你付 <b>" + show(pay, 4) + " DAI</b>，收到 <b>" + show(get) + " AiLGNS</b><br><span class=\"muted\">手续费 1%：" + show(fee) + " AiLGNS</span>"
          : "你付 <b>" + show(pay) + " AiLGNS</b>，收到 <b>" + show(get, 4) + " DAI</b><br><span class=\"muted\">手续费 1%：" + show(fee, 4) + " DAI</span>";
        return { amount: amount, pay: pay };
      }
      qty.oninput = plan;
      document.getElementById("f-max").onclick = function () { qty.value = String(num(maxAil)); plan(); };
      m.querySelector("[data-close]").onclick = function () { m.hidden = true; };
      m.onclick = function (e) { if (e.target === m) m.hidden = true; };
      document.getElementById("f-go").onclick = function () {
        var btn = this, v = plan();
        if (!v) { say("请输入数量", true); return; }
        var token = o.sellAilgns ? DAI : AILGNS, name = o.sellAilgns ? "DAI" : "AiLGNS";
        btn.disabled = true;
        ready().then(function () {
          walletCard();
          if (account === o.maker) throw new Error(REASONS.TRANSFER_MISMATCH);
          return balance(token, account);
        }).then(function (b) {
          if (b < v.pay) throw new Error("余额不足：需要 " + show(v.pay) + " " + name + "，钱包里有 " + show(b));
          return ensureAllowance(token, v.pay, say, name);
        }).then(function () {
          return send(OTC, SEL.fill + u256(o.id) + u256(v.amount) + u256(v.pay), say, "成交");
        }).then(function () {
          say("成交成功！币已到你的钱包");
          setTimeout(function () { m.hidden = true; reload(); }, 1500);
        }, function (e) { say(niceError(e), true); btn.disabled = false; });
      };
    }
  }

  // ---------- 部署页（只给站长用，不在导航里） ----------
  function renderDeploy(id) {
    var app = A.app;
    app.innerHTML = '<h1>部署托管合约</h1><p class="sub">用你的钱包把 OTC 托管合约部署到 Anubis 链。部署只需要一次，Gas 用 Anubis 链上的 DAI 支付。</p>' +
      '<section class="card"><dl class="dl"><dt>AiLGNS</dt><dd class="mono">' + AILGNS + "</dd><dt>DAI</dt><dd class=\"mono\">" + DAI + "</dd><dt>手续费收款地址</dt><dd class=\"mono\">" + FEE_RECIPIENT +
      "</dd><dt>手续费</dt><dd>1%（合约里写死）</dd><dt>管理员</dt><dd>无，部署后任何人都改不了</dd></dl>" +
      '<button id="d-go" style="padding:12px 22px;margin-top:16px">连接钱包并部署</button><p class="note" id="d-st"></p></section>';
    var st = document.getElementById("d-st");
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; }
    document.getElementById("d-go").onclick = function () {
      var btn = this;
      btn.disabled = true;
      connect().then(function () {
        return A.getJSON("contracts/AilgnsOtcEscrow.json");
      }).then(function (art) {
        var data = art.bytecode + u256(AILGNS) + u256(DAI) + u256(FEE_RECIPIENT);
        say("请在钱包里确认部署…");
        return W.get().request({ method: "eth_sendTransaction", params: [{ from: account, data: data }] });
      }).then(function (hash) {
        say("已提交，等待链上确认…");
        return W.waitReceipt(hash);
      }).then(function (r) {
        say('✅ 部署成功！合约地址：<b class="mono">' + r.contractAddress + '</b><br>把这个地址发给我，我把它填进网站就能开放交易。<a target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + r.contractAddress + '">在浏览器查看 ↗</a>');
      }, function (e) { say(niceError(e), true); btn.disabled = false; });
    };
  }

  // 收入分账：原收款钱包在这里授权分账合约；之后每 5 分钟自动把新到的收入分出去
  function renderSplit(id) {
    var app = A.app, MAX = (1n << 256n) - 1n, totalSel = "0x0399205c"; // totalSplit(address)
    var TOKS = [
      { name: "LGNS", chain: "anubis", token: "0x4D1D808a081FdAc440703b3765FC61f8028C06B8", dec: 9 },
      { name: "AiLGNS", chain: "anubis", token: AILGNS, dec: 18 },
      { name: "DAI", chain: "anubis", token: DAI, dec: 18 },
      { name: "DAI", chain: "polygon", token: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", dec: 18 },
      { name: "LGNS", chain: "polygon", token: "0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01", dec: 9 }
    ];
    var CH = { anubis: { name: "Anubis", explorer: EXPLORER }, polygon: { name: "Polygon", explorer: "https://polygonscan.com" } };
    function read(chain, to, data) { return (chain === "anubis" ? A.call(to, data) : W.rpcOn("polygon", "eth_call", [{ to: to, data: data }, "latest"])).then(BigInt); }
    function amt(v, dec) { return A.fmt(Number(v) / Math.pow(10, dec), 4); }
    app.innerHTML = '<h1>收入分账</h1><p class="sub">会员费和 OTC 手续费照旧进入原收款钱包。原收款钱包授权分账合约后，每 5 分钟检查一次，新到账的收入自动按比例分出去。地址和比例写死在合约里，任何人都改不了。</p>' +
      '<section class="card"><div class="card-head"><h2>分账规则</h2></div><dl class="dl">' +
      PAYEES.map(function (p, i) { return "<dt>" + p[1] + "%</dt><dd>" + A.addrLink(p[0]) + (i === 2 ? '　<span class="muted">（原收款钱包，这份留在原地）</span>' : "") + "</dd>"; }).join("") +
      "<dt>分账合约</dt><dd>" + Object.keys(SPLITTERS).map(function (c) { return CH[c].name + '：<a class="mono" target="_blank" rel="noopener" href="' + CH[c].explorer + "/address/" + SPLITTERS[c] + '">' + A.short(SPLITTERS[c]) + " ↗</a>"; }).join("　") +
      '</dd><dt>源码</dt><dd><a href="contracts/AilgnsFeeSplitter.sol" target="_blank" rel="noopener">AilgnsFeeSplitter.sol ↗</a></dd></dl>' +
      '<p class="note">分账范围：转进原收款钱包的 Anubis 链 LGNS、AiLGNS、DAI 和 Polygon 链 DAI、LGNS（会员费 + OTC 手续费，包括任何人转进来的这几种币），只算分账上线之后到账的。分账合约不收任何费用，触发分账的 Gas 由自动退款那个小钱包支付。</p></section>' +
      '<section class="card"><div class="card-head"><h2>授权状态</h2><span class="muted">请用原收款钱包 ' + A.short(FEE_RECIPIENT) + ' 授权，每种币一次</span></div><div id="sp-state" class="loading">正在读取…</div>' +
      '<p class="note">授权后分账合约只能把钱按上面的比例转给这三个固定地址，不能转到别处。Polygon 上的授权需要少量 POL 付 Gas。</p><p class="note" id="sp-st"></p></section>';
    var st = document.getElementById("sp-st");
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; }
    function load() {
      Promise.all(TOKS.map(function (t) {
        return Promise.all([read(t.chain, t.token, SEL.allowance + u256(FEE_RECIPIENT) + u256(SPLITTERS[t.chain])), read(t.chain, SPLITTERS[t.chain], totalSel + u256(t.token))]).catch(function () { return null; });
      })).then(function (r) {
        if (!A.isCurrent(id)) return;
        var el = document.getElementById("sp-state");
        el.className = "";
        el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th class="l">币种</th><th class="l">链</th><th>授权</th><th>累计已分</th><th></th></tr></thead><tbody>' +
          TOKS.map(function (t, i) {
            var a = r[i] ? r[i][0] : null, ok = a !== null && a >= 10n ** BigInt(t.dec + 6); // 授权 100 万枚以上就算够用
            return '<tr><td class="l"><b>' + t.name + '</b></td><td class="l">' + CH[t.chain].name + "</td><td>" +
              (a === null ? "—" : ok ? '<span class="up">已授权 ✓</span>' + (a > MAX / 2n ? "" : '<br><small class="muted">额度 ' + amt(a, t.dec) + "</small>") : a === 0n ? '<span class="down">未授权</span>' : amt(a, t.dec)) + "</td><td>" + (r[i] ? amt(r[i][1], t.dec) : "—") + "</td>" +
              '<td>' + (ok ? "" : '<button data-ap="' + i + '" style="padding:6px 14px">授权</button>') + "</td></tr>";
          }).join("") + "</tbody></table></div>";
        el.querySelectorAll("[data-ap]").forEach(function (b) { b.onclick = function () { approve(TOKS[+b.getAttribute("data-ap")], b); }; });
      });
    }
    function approve(t, b) {
      b.disabled = true;
      var eth, label = "授权分账合约使用 " + t.name + "（" + CH[t.chain].name + "）";
      Promise.resolve().then(function () { return account ? null : connect(); }).then(function () {
        if (account !== FEE_RECIPIENT) throw new Error("请切换到原收款钱包 " + A.short(FEE_RECIPIENT) + " 再授权（现在连接的是 " + A.short(account) + "）");
        eth = W.get();
        say("正在切换到 " + CH[t.chain].name + " 链…");
        return W.switchTo(eth, t.chain);
      }).then(function () {
        say("请在钱包里确认：" + label + "…");
        return eth.request({ method: "eth_sendTransaction", params: [{ from: account, to: t.token, data: SEL.approve + u256(SPLITTERS[t.chain]) + u256(MAX) }] });
      }).then(function (hash) {
        say(label + "已提交，等待链上确认…");
        return W.waitOn(t.chain, hash);
      }).then(function () {
        say("✅ " + t.name + "（" + CH[t.chain].name + "）授权成功，之后新到账的收入会自动分账");
        load();
      }, function (e) { say(niceError(e), true); b.disabled = false; });
    }
    load();
  }

  // 其他页面顶部的 AiLGNS OTC 推荐条
  function promo() {
    var el = document.getElementById("promo");
    if (!el) return;
    var tab = location.hash.replace(/^#\/?/, "").split("/")[0] || "otc";
    el.innerHTML = tab === "otc" ? "" : '<a class="promo" href="#/otc"><span class="promo-tag">主推</span><b>AiLGNS OTC</b><span class="promo-txt">每 1,000 美元省 $20–$270 · 手续费仅 1%（官方 DEX 3%–28%）· 0 滑点</span><span class="promo-go">去交易 →</span></a>';
  }
  window.addEventListener("hashchange", promo);
  promo();

  // 钱包里切换账户时，页面跟着换
  var listening = false;
  A.pages.otc = function (id) {
    var sub = location.hash.split("/")[2] || "";
    if (!listening) {
      listening = true;
      A.wallets.onAccounts(function (a) {
        account = a && a[0] ? String(a[0]).toLowerCase() : null;
        if (location.hash.indexOf("#/otc") === 0) window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
    }
    renderOtc(id, sub);
  };
  // 营销广告：OTC 介绍、和官方 DEX 的费用对比、交易送会员
  A.pages.promo = function (id) {
    var gift = '<section class="card promo-gift"><div class="card-head"><h2>🎁 交易就送会员</h2></div>' +
      '<div class="pg-row"><div class="pg-item"><b>初级 VIP</b><span>在本站 OTC 成交任意金额</span></div><div class="pg-item pro"><b>高级 VIP</b><span>累计成交满 1 万 DAI</span></div></div>' +
      '<p class="note">挂单被吃、吃别人的单都算，按钱包地址自动累计。成交后到<a href="#/member">「会员」</a>页填这个钱包地址点「查询」就能用。</p>' +
      '<button data-go="otc" style="padding:12px 22px">去 OTC 交易 →</button></section>';
    function draw(mkt, live) {
      A.app.innerHTML = hero(mkt, live) + gift + VS + '<p class="note">本站为 AWAKE HELIX 官方授权的 AiLGNS OTC 服务站。智能合约未经第三方审计，请先小额试用。</p>';
      A.app.querySelectorAll("[data-go]").forEach(function (b) {
        b.onclick = function () { var g = b.getAttribute("data-go"); location.hash = "#/otc" + (g === "otc" ? "" : "/" + g); };
      });
    }
    draw(null, null);
    if (!OTC) return;
    Promise.all([marketPrice().catch(function () { return null; }), readOrders().catch(function () { return null; })]).then(function (r) {
      if (!A.isCurrent(id)) return;
      var now = Date.now() / 1000;
      draw(r[0], r[1] ? r[1].filter(function (o) { return o.open && o.expiry > now && o.giveLeft > 0; }).length : null);
    });
  };
  A.start();
})();
