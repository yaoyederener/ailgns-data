// 点对点抵押借款（AilgnsLoanEscrow，双向）：借款人押币挂单，出借人接单；出借人存 DAI 挂单，借款人押币接单。本金都直接到借款人钱包，
// 到期前还款抵押币退回，到期没还抵押币归出借人。合约不看价格、不清算；手续费为本金的 1%，出借人接单时另付。
// 复用 otc.js 暴露的 A.otcKit（钱包、发交易、读链、数字格式）；先只开 AiLGNS 抵押，LGNS / gLGNS 后面加
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  var ANUBIS_DAI = "0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14", FEE_RECIPIENT = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", EXPLORER = "https://anubisscan.io";
  // loan 空着表示还没部署（显示「即将上线」）；otc：复用 otc.js 的哪个市场设置（链、钱包切链）；pair：DEX 池子，只用来显示抵押品现值参考
  var MARKETS = {
    ailgns: { sym: "AiLGNS", otc: "ailgns", loan: "0x242ab392571d325d814a48892ac16115a6d285dc", token: "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", dec: 18, pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", pairDai: 1, eg: ["1", "500", "520"] },
    lgns: { sym: "LGNS", otc: "lgns", loan: "", token: "0x4D1D808a081FdAc440703b3765FC61f8028C06B8", dec: 9, pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", pairDai: 1, eg: ["10000", "500", "520"] },
    glgns: { sym: "gLGNS", otc: "glgns", loan: "", token: "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c", dec: 18, pair: "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", pairDai: 0, eg: ["0.01", "500", "520"] }
  };
  // 旧的单向合约（已下架，不在标签里，只能从 #/lend/old 进去撤单 / 还款 / 取回，不能再挂新单）
  MARKETS.old = { sym: "AiLGNS", otc: "ailgns", loan: "0x8d84d678d195e770caad263d1c37967ec796165c", legacy: true, token: MARKETS.ailgns.token, dec: 18, pair: MARKETS.ailgns.pair, pairDai: 1, eg: ["1", "500", "520"] };
  var MKEYS = ["ailgns", "lgns", "glgns"];
  var SEL = { request: "0x2fedd319", fund: "0xa65e2cfd", offer: "0x992001bd", take: "0x4fd9efc4", repay: "0x371fd8e6", claim: "0x379607f5", cancel: "0x40e58ee5", count: "0x9d11ed75", get: "0x86b20104", approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231" };
  var FEE_BPS = 100n, BOOK_SHOW = 8;
  var TERMS = [[86400, "1 天"], [3 * 86400, "3 天"], [7 * 86400, "7 天"], [15 * 86400, "15 天"], [30 * 86400, "30 天"], [60 * 86400, "60 天"], [90 * 86400, "90 天"]];
  var TERM_DEFAULT = 30 * 86400;
  var GUIDE_MONTHLY = 0.10; // 指导利息：月息 10%，不足一个月按一个月算（只是参考，利息由双方自己协商）
  // 指导抵押率：期限越长币价波动越大，抵押要越多（按 DEX 市价算，只是参考）：1–7 天 130%，8–30 天 150%，31–90 天 200%
  function guideOver(term) { return term <= 7 * 86400 ? 1.30 : term <= 30 * 86400 ? 1.50 : 2.00; }
  function guideMonths(term) { return Math.max(1, Math.ceil(term / (30 * 86400))); }
  function guideRepay(p, term) { return p + p * BigInt(Math.round(GUIDE_MONTHLY * guideMonths(term) * 1e6)) / 1000000n; }
  var STATUS = ["挂单中", "借款中", "已还清", "已违约", "已撤单 / 已退回"];
  var REASONS = {
    REPAY_LT_PRINCIPAL: "到期还款金额不能少于本金", BAD_TERM: "借款期限要在 1 天到 90 天之间",
    NOT_OPEN: "这张借款单已经被接走或撤销，请刷新", OWN_LOAN: "不能接自己的借款单", NOT_ACTIVE: "这笔借款不在借款中状态，请刷新",
    NOT_DUE: "还没到还款截止时间，不能领取抵押品", NOT_MAKER: "只有挂单人自己能撤单", NO_LOAN: "没有这张单", ZERO_AMOUNT: "数量不能为 0",
    NOT_OFFER: "这不是出借单，请刷新", NOT_REQUEST: "这不是借款单，请刷新"
  };
  var MK = "ailgns", M = MARKETS.ailgns, LOAN = "", mkt = null, openBook = {}, timer = null, freshNext = false;
  function K() { return A.otcKit; }
  function useMarket(k) { MK = MARKETS[k] ? k : "ailgns"; M = MARKETS[MK]; LOAN = M.loan; K().useMarket(M.otc); }

  // ---------- 数字 ----------
  function fee(p) { return (p * FEE_BPS) / 10000n; }
  function u256(v) { return K().u256(v); }
  function daiN(v) { return Number(v) / 1e18; }
  function dai(v, d) { return A.fmt(daiN(v), d === undefined ? 2 : d); }
  function tokN(v) { return Number(v) / Math.pow(10, M.dec); }
  function tok(v) { return A.fmt(tokN(v), M.dec === 18 ? 4 : 2); }
  function days(sec) { return sec % 86400 === 0 ? sec / 86400 + " 天" : (sec / 86400).toFixed(1) + " 天"; }
  // 利息和年化（只是把借款人填的数字换算一下，不是平台定的利率）
  function interest(l) {
    var i = daiN(l.repayAmount - l.principal), r = daiN(l.principal) ? i / daiN(l.principal) : 0, apr = l.term ? r * 365 * 86400 / Number(l.term) : 0;
    return { i: i, pct: r * 100, apr: apr * 100 };
  }
  // 抵押品现值 / 本金（按 DEX 市价，只是参考）
  function ratio(l) { return mkt ? tokN(l.collateral) * mkt / daiN(l.principal) * 100 : null; }
  function words(h) { var out = []; for (var i = 2; i < h.length; i += 64) out.push(h.slice(i, i + 64)); return out; }
  function parse(r, from) {
    if (!r || r === "0x") return [];
    var w = words(r), n = Number(BigInt("0x" + w[1])), list = [];
    if (M.legacy) { // 旧合约每条 9 个字：没有 isOffer
      for (var j = 0; j < n; j++) {
        var q = w.slice(2 + j * 9, 11 + j * 9);
        list.push({ id: from + j, borrower: "0x" + q[0].slice(24), lender: "0x" + q[1].slice(24), isOffer: false, status: Number(BigInt("0x" + q[2])), expiry: Number(BigInt("0x" + q[3])), term: Number(BigInt("0x" + q[4])), due: Number(BigInt("0x" + q[5])),
          collateral: BigInt("0x" + q[6]), principal: BigInt("0x" + q[7]), repayAmount: BigInt("0x" + q[8]) });
      }
      return list;
    }
    for (var i = 0; i < n; i++) {
      var o = w.slice(2 + i * 10, 12 + i * 10);
      list.push({ id: from + i, borrower: "0x" + o[0].slice(24), lender: "0x" + o[1].slice(24), isOffer: BigInt("0x" + o[2]) === 1n, status: Number(BigInt("0x" + o[3])), expiry: Number(BigInt("0x" + o[4])), term: Number(BigInt("0x" + o[5])), due: Number(BigInt("0x" + o[6])),
        collateral: BigInt("0x" + o[7]), principal: BigInt("0x" + o[8]), repayAmount: BigInt("0x" + o[9]) });
    }
    return list;
  }
  function niceError(e) {
    var msg = (e && (e.message || e.reason)) || "";
    for (var k in REASONS) if (msg.indexOf(k) >= 0) return REASONS[k];
    return K().niceError(e);
  }

  // ---------- 读链 ----------
  function readLoans() {
    var k = K();
    return k.read(LOAN, SEL.count).then(function (h) {
      var count = Number(BigInt(h)), from = Math.max(0, count - 1000);
      if (!count) return [];
      return k.read(LOAN, SEL.get + u256(from) + u256(count - from)).then(function (r) { return parse(r, from); });
    });
  }
  function marketPrice() {
    return K().read(M.pair, "0x0902f1ac").then(function (h) { return Number(A.word(h, M.pairDai)) / 1e18 / (Number(A.word(h, 1 - M.pairDai)) / Math.pow(10, M.dec)); }).catch(function () { return null; });
  }
  function loadBook(fresh) {
    var mk = MK;
    return fetch("/api/book?m=lend_" + mk + (fresh ? "&fresh=1" : "")).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.error || !j.orders) throw new Error("book");
      try { localStorage.setItem("lend:book:" + mk, JSON.stringify(j)); } catch (e) { /* 存不下就算了 */ }
      return { loans: parse(j.orders, j.from), mkt: j.reserves ? Number(A.word(j.reserves, M.pairDai)) / 1e18 / (Number(A.word(j.reserves, 1 - M.pairDai)) / Math.pow(10, M.dec)) : null };
    }).catch(function () { return Promise.all([readLoans(), marketPrice()]).then(function (r) { return { loans: r[0], mkt: r[1] }; }); });
  }
  function savedBook() {
    try { var j = JSON.parse(localStorage.getItem("lend:book:" + MK) || "null"); return j && j.orders ? { loans: parse(j.orders, j.from), mkt: j.reserves ? Number(A.word(j.reserves, M.pairDai)) / 1e18 / (Number(A.word(j.reserves, 1 - M.pairDai)) / Math.pow(10, M.dec)) : null } : null; } catch (e) { return null; }
  }
  function allowanceTo(token, who) { return K().read(token, SEL.allowance + u256(who) + u256(LOAN)).then(BigInt); }
  function ensureAllowance(token, amount, say, label) {
    var k = K();
    return allowanceTo(token, k.account()).then(function (a) {
      if (a >= amount) return;
      return k.send(token, SEL.approve + u256(LOAN) + u256(amount), say, "授权 " + label + " 给借款合约");
    });
  }
  function toTokWei(str) { return K().toWei(str, M.dec); }

  function marketTabs(prefix) {
    if (M.legacy) return "";
    return '<nav class="mkt-tabs" aria-label="选择抵押币">' + MKEYS.map(function (k) {
      return '<a href="' + prefix + (k === "ailgns" && prefix === "#/lend" ? "" : "/" + k) + '"' + (k === MK ? ' class="on"' : "") + "><b>" + MARKETS[k].sym + " 抵押</b><small>Anubis 链" + (MARKETS[k].loan ? "" : " · 即将上线") + "</small></a>";
    }).join("") + "</nav>";
  }

  // ---------- 页面 ----------
  function render(id) {
    var k = K(), app = A.app;
    if (timer) { clearInterval(timer); timer = null; }
    if (!LOAN) {
      app.innerHTML = '<h1>借贷</h1><p class="sub">点对点抵押借款：押币借 DAI，条件自己定，愿意的人接单；合约只认时间和数字，不看价格、不清算。</p>' + marketTabs("#/lend") +
        '<section class="card" style="text-align:center;padding:36px 18px"><h2>' + M.sym + " 抵押借款即将上线</h2><p class=\"muted\">借款合约部署完成后开放。</p></section>";
      return;
    }
    var saved = savedBook(), shown = null;
    if (saved) { shown = saved; mkt = saved.mkt; draw(id, saved.loans); }
    else app.innerHTML = '<h1>借贷</h1>' + marketTabs("#/lend") + '<div class="loading">正在读取借款单…</div>';
    var fresh = freshNext; freshNext = false;
    Promise.all([loadBook(fresh), k.silentAccount()]).then(function (r) {
      if (!A.isCurrent(id)) return;
      shown = r[0]; mkt = r[0].mkt; draw(id, r[0].loans);
      timer = setInterval(function () {
        if (!A.isCurrent(id)) { clearInterval(timer); timer = null; return; }
        if (busy()) return;
        loadBook(false).then(function (b) { if (A.isCurrent(id) && !busy()) { mkt = b.mkt; draw(id, b.loans); } }).catch(function () {});
      }, 15000);
    }, function () {
      if (A.isCurrent(id) && shown === null) app.innerHTML = '<h1>借贷</h1>' + marketTabs("#/lend") + '<div class="card err">借款单读取失败，请稍后刷新。</div>';
    });
    function busy() {
      var m = document.getElementById("otc-modal");
      if (m && !m.hidden) return true;
      return Array.prototype.some.call(app.querySelectorAll("input"), function (i) { return i === document.activeElement || (i.value && i.type !== "hidden"); });
    }
  }

  function draw(id, loans) {
    var k = K(), app = A.app, account = k.account(), now = Date.now() / 1000;
    var open = loans.filter(function (l) { return l.status === 0 && l.expiry > now && !l.isOffer; }).sort(function (a, b) { return interest(b).apr - interest(a).apr; });
    var offers = loans.filter(function (l) { return l.status === 0 && l.expiry > now && l.isOffer; }).sort(function (a, b) { return interest(a).apr - interest(b).apr; }); // 出借单按年化从低到高：借款人先看便宜的
    var active = loans.filter(function (l) { return l.status === 1; }).sort(function (a, b) { return a.due - b.due; });
    var mine = account ? loans.filter(function (l) { return l.borrower === account || l.lender === account; }).reverse().slice(0, 30) : [];
    function who(a) { return a === account ? '<b style="color:var(--gold)">我</b>' : A.short(a); }
    function ratioTd(l) { var r = ratio(l); return r === null ? "—" : '<span class="' + (r >= 150 ? "up" : r >= 110 ? "warn" : "down") + '" title="' + (r >= 150 ? "抵押较足" : r >= 110 ? "抵押偏薄：币价跌 " + Math.max(1, Math.round(100 - 10000 / r)) + "% 就不够还款" : "抵押不足：借款人很可能不还") + '">' + r.toFixed(0) + "%" + (r < 110 ? " ⚠️" : "") + "</span>"; }
    function openRow(l, i) {
      var it = interest(l);
      var act = l.borrower === account ? '<button class="ghost act-btn" data-cancel="' + l.id + '">撤单</button>' : '<button class="act-btn btn-buy" data-fund="' + l.id + '">出借</button>';
      return '<tr' + (i >= BOOK_SHOW ? ' class="bk-x"' : "") + '><td class="act">' + act + '</td><td data-l="抵押">' + tok(l.collateral) + " " + M.sym + '</td><td data-l="借款 DAI" class="price"><b>' + dai(l.principal) + '</b></td><td data-l="到期还 DAI">' + dai(l.repayAmount) + '</td>' +
        '<td data-l="利息">' + A.fmt(it.i, 2) + " DAI（" + it.pct.toFixed(1) + "% · 年化 " + it.apr.toFixed(0) + '%）</td><td data-l="期限">' + days(l.term) + '</td><td data-l="抵押率参考">' + ratioTd(l) + '</td><td data-l="挂单剩余">' + k.left(l.expiry - now) + '</td><td data-l="借款人" class="l mono">' + who(l.borrower) + "</td></tr>";
    }
    function offerRow(l, i) {
      var it = interest(l);
      var act = l.lender === account ? '<button class="ghost act-btn" data-cancel="' + l.id + '">撤单</button>' : '<button class="act-btn btn-sell" data-take="' + l.id + '">借入</button>';
      return '<tr' + (i >= BOOK_SHOW ? ' class="bk-x"' : "") + '><td class="act">' + act + '</td><td data-l="出借 DAI" class="price"><b>' + dai(l.principal) + '</b></td><td data-l="要求抵押">' + tok(l.collateral) + " " + M.sym + '</td><td data-l="到期还 DAI">' + dai(l.repayAmount) + '</td>' +
        '<td data-l="利息">' + A.fmt(it.i, 2) + " DAI（" + it.pct.toFixed(1) + "% · 年化 " + it.apr.toFixed(0) + '%）</td><td data-l="期限">' + days(l.term) + '</td><td data-l="抵押率参考">' + ratioTd(l) + '</td><td data-l="挂单剩余">' + k.left(l.expiry - now) + '</td><td data-l="出借人" class="l mono">' + who(l.lender) + "</td></tr>";
    }
    function activeRow(l) {
      var act = l.borrower === account ? '<button class="act-btn" data-repay="' + l.id + '">还款</button>' : l.lender === account && l.due <= now ? '<button class="act-btn btn-sell" data-claim="' + l.id + '">领取抵押品</button>' : l.due <= now ? '<span class="muted">已逾期</span>' : "";
      return '<tr><td class="act">' + act + '</td><td data-l="抵押">' + tok(l.collateral) + " " + M.sym + '</td><td data-l="借款 DAI">' + dai(l.principal) + '</td><td data-l="应还 DAI" class="price"><b>' + dai(l.repayAmount) + '</b></td><td data-l="还款截止">' + A.timeBJ(l.due * 1000) + (l.due > now ? "（还剩 " + k.left(l.due - now) + "）" : '<span class="down">（已到期）</span>') + '</td><td data-l="抵押率参考">' + ratioTd(l) + '</td><td data-l="借款人 / 出借人" class="l mono">' + who(l.borrower) + " / " + who(l.lender) + "</td></tr>";
    }
    function book(key, title, list, hint, head, row) {
      var isOpen = openBook[key], more = list.length - BOOK_SHOW;
      return '<section class="card' + (isOpen ? " bk-open" : "") + '" id="book-' + key + '"><div class="card-head"><h2>' + title + ' <small class="muted book-n">' + list.length + ' 笔</small></h2><span class="muted">' + hint + "</span></div>" +
        (list.length ? '<div class="tbl-wrap"><table class="cards book"><thead><tr>' + head + "</tr></thead><tbody>" + list.map(row).join("") + "</tbody></table></div>" +
          (more > 0 ? '<button type="button" class="ghost book-more" data-book="' + key + '">' + (isOpen ? "收起 ▴" : "展开其余 " + more + " 笔 ▾") + "</button>" : "") : '<div class="empty">暂无</div>') + "</section>";
    }
    var html = (M.legacy
      ? '<h1>借贷 · 旧合约</h1><p class="sub">这是已下架的旧借款合约 <span class="mono">' + A.short(LOAN) + '</span>，<b>不能再挂新单</b>；之前在这里挂的单可以照常接单、撤单、还款、到期取回。新挂单请到 <a href="#/lend">借贷</a>。</p>'
      : '<h1>借贷</h1><p class="sub">点对点抵押借款，双向挂单：借款人押 ' + M.sym + ' 挂单借 DAI，出借人挂单等人来借，条件（借多少、还多少、借几天）都由挂单人自己定。合约只认时间和数字：<b>到期前还上抵押币退回，到期没还抵押币归出借人</b>，不看价格、不清算。</p>' + marketTabs("#/lend") +
      '<div class="otc-acts"><button type="button" class="oa-sell" data-goform="borrow">我有 ' + M.sym + '，想借 DAI</button><button type="button" class="oa-buy" data-goform="lend">我有 DAI，想出借</button>' + (account && mine.length ? '<button type="button" class="ghost" data-gomine>我的借贷</button>' : "") + "</div>" +
      '<div class="otc-top"><span class="hp-tag">手续费 1%</span><span class="ot-txt">左边红色：你手里有 ' + M.sym + '，押给合约借 DAI；右边绿色：你手里有 DAI，借给押币的人收利息 · 出借人接单时按本金另付 1% 手续费，其它都免费' + (mkt ? " · " + M.sym + " 市价 <b>" + A.fmt(mkt, M.dec === 9 ? 5 : 2) + "</b> DAI" : "") + "</span>" +
      (account ? '<span class="ot-w mono">' + A.short(account) + "</span>" : '<button class="ot-c" id="otc-top-c">' + (A.wallets && !window.ethereum && /Android|iPhone|iPad/i.test(navigator.userAgent) ? "在钱包 App 里打开" : "连接钱包") + "</button>") + "</div>");
    if (M.legacy) html = html.replace(/<div class="otc-acts">[\s\S]*?<\/div>/, ""); // 旧合约页不显示「我要借 / 我要出借」
    html += book("open", "想借 DAI 的人（已押 " + M.sym + "）", open, "你有 DAI 就可以出借给他 · 按年化从高到低 · 实付本金 + 1%", '<th class="l">操作</th><th>抵押</th><th>借款 DAI</th><th>到期还</th><th>利息</th><th>期限</th><th>抵押率参考</th><th>挂单剩余</th><th class="l">借款人</th>', openRow);
    html += book("offers", "想出借 DAI 的人", offers, "你押够要求的 " + M.sym + " 就能把 DAI 借走 · 按年化从低到高", '<th class="l">操作</th><th>出借 DAI</th><th>要求抵押</th><th>到期还</th><th>利息</th><th>期限</th><th>抵押率参考</th><th>挂单剩余</th><th class="l">出借人</th>', offerRow);
    html += book("active", "借款中", active, "按还款截止时间排序", '<th class="l">操作</th><th>抵押</th><th>借款 DAI</th><th>应还</th><th>还款截止（北京时间）</th><th>抵押率参考</th><th class="l">借款人 / 出借人</th>', activeRow);
    if (!M.legacy) html += '<div id="otc-tot"></div>' + form(k);
    if (mine.length) html += myLoans(mine, now);
    html += '<div class="kpis kpis-2"><div class="kpi"><div class="k">借款合约</div><div class="v" style="font-size:16px"><a class="mono" target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + LOAN + '">' + A.short(LOAN) + ' ↗</a></div><div class="d"><a target="_blank" rel="noopener" href="https://github.com/yaoyederener/ailgns-data/blob/main/contracts/AilgnsLoanEscrow.sol">开源源码 ↗</a> · <a target="_blank" rel="noopener" href="https://github.com/yaoyederener/ailgns-data/blob/main/contracts/VERIFY.md">编译参数与核对 ↗</a></div></div>' +
      '<div class="kpi"><div class="k">规则</div><div class="v" style="font-size:16px">金额不限 · 期限 1–90 天</div><div class="d">借多少、押多少、还多少由挂单人自己填（利息可以为 0）· 建议抵押率 1–7 天 130%、8–30 天 150%、31–90 天 200% · 没有管理员，部署后任何人改不了</div></div></div>';
    html += '<section class="card" id="ln-terms"><div class="card-head"><h2>借款约定</h2><span class="muted">接单即视为双方同意，全部由合约执行</span></div><ol class="addr-tips">' +
      '<li><b>利息自行协商。</b>借多少、到期还多少由挂单人填写，接单方认可就成交；页面的指导价（月息 10%）只是参考。</li>' +
      '<li><b>不足一个月按一个月计算。</b>指导价按月计息：借 1–30 天算 1 个月，31–60 天算 2 个月，61–90 天算 3 个月；提前还款不退利息。</li>' +
      '<li><b>逾期不还，抵押币自动划给出借人。</b>到还款截止时间未还清约定金额，合约把全部抵押的 ' + M.sym + ' 划给出借人，借款结束；没有宽限期，划转后不能再还。</li>' +
      '<li><b>按时还清，抵押币原路退回。</b>还款金额付给出借人，抵押币同一笔交易退回借款地址。</li>' +
      '<li><b>手续费</b>为本金的 1%，由出借人在接单（或挂出借单）时另付；挂单、撤单、还款、违约划转都不收费。</li>' +
      '<li>合约不看币价、不清算、没有管理员。抵押币涨跌的风险由双方自行承担，本站只提供链上托管撮合。</li></ol></section>';
    html += '<section class="card" id="ln-howto"><div class="card-head"><h2>还款怎么操作</h2></div><ul class="addr-tips">' +
      '<li><b>可以提前还。</b>接单后任何时候都能还，还的金额就是挂单时写好的「到期还款」数，提前还不打折、不加钱。</li>' +
      '<li><b>不会自动扣款。</b>合约没法从你钱包里扣 DAI：你要自己到「我的借贷」点「还款」，钱包里有足够的 DAI，确认一笔授权、一笔还款，DAI 直接付给出借人，抵押的 ' + M.sym + ' 同一笔交易里退回你钱包。</li>' +
      '<li><b>用哪个钱包还？</b>点「还款」时连接的钱包付 DAI，抵押币退回的永远是<b>当初借款的那个地址</b>。所以用借款钱包还最省事；用别的钱包替他还也行，钱照样付给出借人，币退给借款人。</li>' +
      '<li><b>到期没还会怎样？</b>到了还款截止时间，抵押币就归出借人（机器人几分钟内自动划转），没有宽限期，之后不能再还。到期前请把 DAI 准备好。</li>' +
      '<li>还款截止时间在「借款中」列表和「我的借贷」里都按北京时间显示。</li></ul></section>';
    html += '<p class="note"><b>出借前请自己判断风险：</b>合约不会清算。抵押币跌了借款人可能不还，到期你拿到的只是那些抵押币，可能不值借出去的钱。「抵押率参考」按 DEX 市价换算，只是参考。<b>借款人请记好还款截止时间：</b>到期没还抵押币直接归出借人，没有宽限期。本站只提供链上托管撮合，不参与借贷、不承诺收益；智能合约未经第三方审计，请先小额试用。</p>';
    html += '<div class="modal" id="otc-modal" hidden></div>';
    app.innerHTML = html;
    bind(id, loans);
    if (!M.legacy && A.fillTotals) A.fillTotals();
    if (!M.legacy && k.deboxCard) k.deboxCard(id, { title: "借贷成交 / 还款 / 到期提醒，DeBox 私信秒通知", on: "这个钱包的借贷成交、还款、到期前 24 小时和 1 小时提醒、逾期划转都会私信到你的 DeBox" });
  }

  function myLoans(list, now) {
    return '<section class="card" id="otc-mine"><div class="card-head"><h2>我的借贷</h2></div><div class="tbl-wrap"><table class="cards"><thead><tr><th>#</th><th class="l">我是</th><th>抵押</th><th>借款 / 应还</th><th class="l">状态</th><th></th></tr></thead><tbody>' +
      list.map(function (l) {
        var k = K(), role = l.isOffer ? (l.lender === k.account() ? "出借人" : "借款人") : (l.borrower === k.account() ? "借款人" : "出借人");
        var st = (l.status === 0 ? (l.isOffer ? "出借挂单中" : "借款挂单中") : STATUS[l.status]) + (l.status === 0 ? "，" + A.timeBJ(l.expiry * 1000) + " 前无人接单自动退回" : l.status === 1 ? "，" + A.timeBJ(l.due * 1000) + " 前还款（北京时间）" : "");
        var maker = l.isOffer ? "出借人" : "借款人";
        var act = l.status === 0 && role === maker ? '<button class="ghost act-btn" data-cancel="' + l.id + '">' + (l.expiry <= now ? "取回" : "撤单") + "</button>"
          : l.status === 1 && role === "借款人" ? '<button class="act-btn" data-repay="' + l.id + '">还款 ' + dai(l.repayAmount) + ' DAI</button>'
          : l.status === 1 && role === "出借人" && l.due <= now ? '<button class="act-btn btn-sell" data-claim="' + l.id + '">领取抵押品</button>' : "";
        return "<tr><td data-l=\"#\">" + l.id + '</td><td data-l="我是" class="l">' + role + '</td><td data-l="抵押">' + tok(l.collateral) + " " + M.sym + '</td><td data-l="借款 / 应还">' + dai(l.principal) + " / " + dai(l.repayAmount) + ' DAI</td><td data-l="状态" class="l">' + st + '</td><td class="act">' + act + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  function form(k) {
    return '<section class="card" id="otc-form"><div class="card-head"><h2 id="ln-title">押 ' + M.sym + ' 借 DAI</h2><span class="muted" id="ln-hint">抵押币先存进合约，没人接单前随时可撤</span></div>' +
      '<div class="seg" id="otc-side"><button data-side="borrow" class="on">我有 ' + M.sym + '，想借 DAI</button><button data-side="lend">我有 DAI，想出借</button></div>' +
      '<div class="form-grid" id="ln-grid"><label id="ln-col-l">抵押数量（' + M.sym + '）<input id="ln-col" inputmode="decimal" placeholder="例如 ' + M.eg[0] + '"></label>' +
      '<label id="ln-p-l">借款金额（DAI）<input id="ln-p" inputmode="decimal" placeholder="例如 ' + M.eg[1] + '"></label>' +
      '<label id="ln-r-l">到期还款（DAI，含利息）<input id="ln-r" inputmode="decimal" placeholder="例如 ' + M.eg[2] + '"></label></div>' +
      '<div class="qty-pick" id="ln-pick"></div><div class="guide" id="ln-guide" hidden></div>' +
      '<div class="dur"><span class="dur-t">借款期限 <small class="muted">从接单那一刻起算</small></span><input type="hidden" id="ln-term" value="' + TERM_DEFAULT + '">' +
      '<div class="dur-opts" id="ln-terms">' + TERMS.map(function (d) { return '<button type="button" data-d="' + d[0] + '"' + (d[0] === TERM_DEFAULT ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="dur"><span class="dur-t">挂单有效期 <small class="muted" id="ln-exp-hint">没人接单就自动退回抵押币</small></span><input type="hidden" id="otc-dur" value="' + k.DUR_DEFAULT + '">' +
      '<div class="dur-opts" id="otc-durs">' + k.DURATIONS.map(function (d) { return '<button type="button" data-d="' + d[0] + '"' + (d[0] === k.DUR_DEFAULT ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") + "</div></div>" +
      '<p class="note" id="otc-sum">填好三个数字后显示明细</p><div id="dbx-slot"></div><button id="otc-create" style="padding:12px 22px">发布借款单（存入 ' + M.sym + '）</button><p class="note" id="otc-st"></p></section>';
  }

  function bind(id, loans) {
    var k = K(), app = A.app, side = "borrow";
    var col = document.getElementById("ln-col"), pIn = document.getElementById("ln-p"), rIn = document.getElementById("ln-r"), sum = document.getElementById("otc-sum"), st = document.getElementById("otc-st"), pick = document.getElementById("ln-pick"), guideEl = document.getElementById("ln-guide");
    // 指导价：有 AiLGNS 的先填抵押数量 → 算出能借多少（抵押 110%）和到期还多少（月息 10%）；有 DAI 的先填出借金额 → 算出要求对方押多少和到期收回多少
    // 自动填进去的值，用户手动改过就不再覆盖；点「用这个价」恢复
    var autoSec = true, autoRepay = true;
    function guide() {
      if (!guideEl) return;
      var term = Number(document.getElementById("ln-term").value), lend = side === "lend", g, pr, cl;
      if (lend) {
        pr = k.toWei(pIn.value); if (!pr || pr <= 0n) { guideEl.hidden = true; return; }
        if (mkt) { cl = toTokWei((Number(pr) / 1e18 * guideOver(term) / mkt).toFixed(M.dec === 18 ? 6 : 2)); if (autoSec || !col.value) { col.value = floorTok(cl); autoSec = true; } }
      } else {
        cl = toTokWei(col.value); if (!cl || cl <= 0n) { guideEl.hidden = true; return; }
        if (mkt) { pr = k.toWei((tokN(cl) * mkt / guideOver(term)).toFixed(2)); if (autoSec || !pIn.value) { pIn.value = floorDai(pr); autoSec = true; } }
        else pr = k.toWei(pIn.value);
      }
      if (!pr || pr <= 0n) { guideEl.hidden = true; return; }
      g = guideRepay(pr, term);
      if (autoRepay || !rIn.value) { rIn.value = floorDai(g); autoRepay = true; }
      guideEl.hidden = false;
      guideEl.innerHTML = '<div class="guide-head"><span class="guide-tag">指导价</span><b class="num">' + (lend ? (cl ? floorTok(cl) + " " + M.sym : "—") : dai(pr) + " DAI") + '</b><small>' +
        (lend ? "建议要求抵押 · 现值约为出借金额的 " + Math.round(guideOver(term) * 100) + "%（" + days(term) + "）" : "可借 · 抵押品现值的 " + Math.round(100 / guideOver(term)) + "%（" + days(term) + "期限建议抵押率 " + Math.round(guideOver(term) * 100) + "%）") +
        " · " + days(term) + "到期还 <b>" + dai(g) + " DAI</b>（月息 " + (GUIDE_MONTHLY * 100) + "% × " + guideMonths(term) + " 个月，不足一个月按一个月算，利息 " + dai(g - pr) + '）</small><button type="button" class="ghost" id="ln-guse">用这个价</button></div>' +
        '<p class="muted">按 ' + M.sym + " 当前市价 " + (mkt ? A.fmt(mkt, M.dec === 9 ? 5 : 2) : "—") + ' DAI 算，只是参考：借多少、押多少、利息多少都由双方自己协商。抵押率建议 1–7 天 130%、8–30 天 150%、31–90 天 200%：合约不清算，币价跌破借款金额时借款人多半不还，抵押越足出借人越安全。</p>';
      document.getElementById("ln-guse").onclick = function () { autoSec = true; autoRepay = true; guide(); calc(); };
    }
    function floorTok(v) { var n = Number(v) / Math.pow(10, M.dec); return (Math.floor(n * 10000) / 10000).toString(); }
    function floorDai(v) { var n = Number(v) / 1e18; return (Math.round(n * 100) / 100).toString(); }
    if (!st) { st = document.createElement("p"); st.className = "note"; (document.getElementById("otc-mine") || app).appendChild(st); } // 旧合约页没有表单：提示放在「我的借贷」下面
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; }
    function reload() { if (A.isCurrent(id)) { freshNext = true; render(id); } }
    var tc = document.getElementById("otc-top-c");
    if (tc) tc.onclick = function () { k.connect().then(reload, function (e) { say(niceError(e), true); }); };
    app.querySelectorAll(".book-more").forEach(function (b) {
      b.onclick = function () {
        var key = b.getAttribute("data-book"), sec = b.closest("section"), n = sec.querySelectorAll("tr.bk-x").length;
        openBook[key] = !openBook[key]; sec.classList.toggle("bk-open", openBook[key]);
        b.textContent = openBook[key] ? "收起 ▴" : "展开其余 " + n + " 笔 ▾";
        if (!openBook[key]) sec.scrollIntoView({ block: "start" });
      };
    });
    app.querySelectorAll("[data-goform]").forEach(function (b) {
      b.onclick = function () {
        var sd = b.getAttribute("data-goform"), t = document.querySelector('#otc-side [data-side="' + sd + '"]');
        if (t) t.click();
        var f = document.getElementById("otc-form"); f.scrollIntoView({ behavior: "smooth", block: "start" });
        f.classList.remove("flash", "flash-sell", "flash-buy"); void f.offsetWidth; f.classList.add("flash", sd === "lend" ? "flash-buy" : "flash-sell");
      };
    });
    if (!col) { bindActions(); return; } // 旧合约页：只有撤单 / 还款 / 领取 / 出借
    function setSide(sd) {
      side = sd;
      document.querySelectorAll("#otc-side button").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-side") === sd); });
      var lend = sd === "lend";
      document.getElementById("ln-title").textContent = lend ? "出借 DAI（等人押 " + M.sym + " 来借）" : "押 " + M.sym + " 借 DAI";
      document.getElementById("ln-hint").textContent = lend ? "本金 + 1% 手续费先存进合约，没人借前随时可撤" : "抵押币先存进合约，没人接单前随时可撤";
      document.getElementById("ln-col-l").firstChild.textContent = lend ? "要求借款人抵押（" + M.sym + "）" : "抵押数量（" + M.sym + "）";
      document.getElementById("ln-p-l").firstChild.textContent = lend ? "出借金额（DAI）" : "借款金额（DAI）";
      document.getElementById("ln-r-l").firstChild.textContent = lend ? "到期收回（DAI，含利息）" : "到期还款（DAI，含利息）";
      document.getElementById("otc-create").textContent = lend ? "发布出借单（存入 DAI）" : "发布借款单（存入 " + M.sym + "）";
      document.getElementById("ln-exp-hint").textContent = lend ? "没人来借就自动退回 DAI" : "没人接单就自动退回抵押币";
      document.getElementById("ln-grid").classList.toggle("lend-first", lend); // 有 DAI 的先填 DAI
      autoSec = true; autoRepay = true; col.value = ""; pIn.value = ""; rIn.value = ""; guideEl.hidden = true;
      showPick(); calc();
    }
    document.querySelectorAll("#otc-side button").forEach(function (b) { b.onclick = function () { setSide(b.getAttribute("data-side")); }; });
    var gm = app.querySelector("[data-gomine]");
    if (gm) gm.onclick = function () { var x = document.getElementById("otc-mine"); if (x) x.scrollIntoView({ behavior: "smooth", block: "start" }); };

    // 余额和「最大」
    function showPick() {
      if (side === "lend") { // 出借：显示 DAI 余额
        if (!k.account()) { pick.innerHTML = ""; return; }
        k.balance(ANUBIS_DAI, k.account()).then(function (b) { pick.innerHTML = '<span class="muted">钱包里有 ' + dai(b) + " DAI</span>"; }).catch(function () { pick.innerHTML = ""; });
        return;
      }
      if (!k.account()) { pick.innerHTML = '<span class="muted">可用余额：</span><a href="#" id="ln-c">连接钱包后显示</a>'; document.getElementById("ln-c").onclick = function (e) { e.preventDefault(); k.connect().then(function () { showPick(); }, function (x) { say(niceError(x), true); }); }; return; }
      k.balance(M.token, k.account()).then(function (b) {
        pick.innerHTML = '<span class="muted">可用 ' + tok(b) + " " + M.sym + '</span> <button type="button" class="ghost" id="ln-max" style="padding:4px 10px">最大</button>';
        document.getElementById("ln-max").onclick = function () { col.value = String(tokN(b)); calc(); };
      }).catch(function () { pick.innerHTML = ""; });
    }
    function calc() {
      var c = toTokWei(col.value), p = k.toWei(pIn.value), r = k.toWei(rIn.value);
      if (!c || !p || !r || c <= 0n || p <= 0n) { sum.textContent = "填好三个数字后显示明细"; return null; }
      var term = Number(document.getElementById("ln-term").value), l = { collateral: c, principal: p, repayAmount: r, term: term }, it = interest(l), ra = ratio(l);
      var warn = r < p ? '<br><span class="down">到期还款不能少于本金</span>' : ra !== null && ra < 100 ? '<br><span class="down">抵押品现值低于借款金额，很难有人接单</span>' : ra !== null && ra < guideOver(term) * 100 ? '<br><span class="warn">抵押率低于 ' + days(term) + '期限的建议值 ' + Math.round(guideOver(term) * 100) + '%，出借人可能嫌风险大</span>' : "";
      sum.innerHTML = (side === "lend"
        ? "借款人押 <b>" + tok(c) + " " + M.sym + "</b> 就能借走 <b>" + dai(p) + " DAI</b>，" + days(term) + "后还你 <b>" + dai(r) + " DAI</b>（利息 " + A.fmt(it.i, 2) + " DAI，" + it.pct.toFixed(1) + "%，年化约 " + it.apr.toFixed(0) + "%）" +
          (ra === null ? "" : "；抵押率参考 " + ra.toFixed(0) + "%") + "。你现在需存入 <b>" + dai(p + fee(p)) + " DAI</b>（含 1% 手续费 " + dai(fee(p)) + "），没人借撤单全额退回。"
        : "押 <b>" + tok(c) + " " + M.sym + "</b>，借 <b>" + dai(p) + " DAI</b>，" + days(term) + "后还 <b>" + dai(r) + " DAI</b>（利息 " + A.fmt(it.i, 2) + " DAI，" + it.pct.toFixed(1) + "%，年化约 " + it.apr.toFixed(0) + "%）" +
          (ra === null ? "" : "；抵押率参考 " + ra.toFixed(0) + "%") + "。出借人实付 " + dai(p + fee(p)) + " DAI（含 1% 手续费），你到手 " + dai(p) + " DAI。") + warn;
      return r < p ? null : { c: c, p: p, r: r, term: term };
    }
    col.oninput = function () { if (side === "lend") autoSec = false; guide(); calc(); };
    pIn.oninput = function () { if (side !== "lend") autoSec = false; guide(); calc(); };
    rIn.oninput = function () { autoRepay = false; calc(); };
    document.querySelectorAll("#ln-terms button").forEach(function (b) { b.onclick = function () { document.querySelectorAll("#ln-terms button").forEach(function (x) { x.classList.toggle("on", x === b); }); document.getElementById("ln-term").value = b.getAttribute("data-d"); guide(); calc(); }; });
    document.querySelectorAll("#otc-durs button").forEach(function (b) { b.onclick = function () { document.querySelectorAll("#otc-durs button").forEach(function (x) { x.classList.toggle("on", x === b); }); document.getElementById("otc-dur").value = b.getAttribute("data-d"); }; });
    showPick();
    document.getElementById("otc-create").onclick = function () {
      var btn = this, v = calc(), dur = Number(document.getElementById("otc-dur").value);
      if (!v) { say("请把抵押数量、借款金额、到期还款填完整", true); return; }
      btn.disabled = true;
      var job = side === "lend"
        ? k.ready().then(function () { return k.balance(ANUBIS_DAI, k.account()); }).then(function (bal) {
            if (bal < v.p + fee(v.p)) throw new Error("DAI 不够：需要 " + dai(v.p + fee(v.p)) + "，钱包里只有 " + dai(bal));
            return ensureAllowance(ANUBIS_DAI, v.p + fee(v.p), say, dai(v.p + fee(v.p)) + " DAI");
          }).then(function () { return k.send(LOAN, SEL.offer + u256(v.c) + u256(v.p) + u256(v.r) + u256(v.term) + u256(dur), say, "发布出借单"); })
          .then(function () { say("✅ 出借单已发布！有人押币借走后开始计时，到期还款直接到你的钱包"); })
        : k.ready().then(function () { return ensureAllowance(M.token, v.c, say, tok(v.c) + " " + M.sym); })
          .then(function () { return k.send(LOAN, SEL.request + u256(v.c) + u256(v.p) + u256(v.r) + u256(v.term) + u256(dur), say, "发布借款单"); })
          .then(function () { say("✅ 借款单已发布！有人接单后本金直接到你的钱包。到期前记得自己来点「还款」，合约不会自动扣款"); });
      job.then(function () { setTimeout(reload, 1500); }).catch(function (e) { say(niceError(e), true); btn.disabled = false; });
    };
    bindActions();
    function bindActions() {
    // 撤单 / 取回 / 还款 / 领取抵押品
    function act(sel, label, build, pre) {
      app.querySelectorAll(sel).forEach(function (b) {
        b.onclick = function () {
          var l = loans.filter(function (x) { return x.id === Number(b.getAttribute(sel.slice(1, -1))); })[0];
          if (!l) return;
          b.disabled = true;
          k.ready().then(function () { return pre ? pre(l) : null; }).then(function () { return k.send(LOAN, build(l), say, label); })
            .then(function () { say("✅ " + label + "成功"); reload(); }, function (e) { say(niceError(e), true); b.disabled = false; });
        };
      });
    }
    act("[data-cancel]", "撤单", function (l) { return SEL.cancel + u256(l.id); });
    act("[data-repay]", "还款", function (l) { return SEL.repay + u256(l.id); }, function (l) {
      return k.balance(ANUBIS_DAI, k.account()).then(function (bal) {
        if (bal < l.repayAmount) throw new Error("DAI 不够：应还 " + dai(l.repayAmount) + "，钱包里只有 " + dai(bal));
        return ensureAllowance(ANUBIS_DAI, l.repayAmount, say, dai(l.repayAmount) + " DAI");
      });
    });
    act("[data-claim]", "领取抵押品", function (l) { return SEL.claim + u256(l.id); });
    var modal = document.getElementById("otc-modal");
    function closeModal() { modal.hidden = true; modal.innerHTML = ""; }
    // 借入：借款人接出借单
    app.querySelectorAll("[data-take]").forEach(function (b) {
      b.onclick = function () {
        var l = loans.filter(function (x) { return x.id === Number(b.getAttribute("data-take")); })[0];
        if (!l) return;
        var it = interest(l), ra = ratio(l);
        modal.innerHTML = '<div class="modal-box"><div class="card-head"><h2>借入 · 出借单 #' + l.id + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
          '<dl class="dl"><dt>出借人</dt><dd class="mono">' + A.short(l.lender) + "</dd><dt>你要抵押</dt><dd><b>" + tok(l.collateral) + " " + M.sym + "</b>" + (ra === null ? "" : "（现值约 " + A.fmt(tokN(l.collateral) * mkt, 2) + " DAI，抵押率 " + ra.toFixed(0) + "%）") + "</dd>" +
          "<dt>你到手</dt><dd><b>" + dai(l.principal) + " DAI</b>（手续费由出借人承担）</dd><dt>到期还</dt><dd><b>" + dai(l.repayAmount) + " DAI</b>（利息 " + A.fmt(it.i, 2) + "，年化约 " + it.apr.toFixed(0) + "%）</dd><dt>期限</dt><dd>" + days(l.term) + "，从现在起算</dd></dl>" +
          '<p class="note down">到期没还上，抵押币直接归出借人，没有宽限期。</p><button id="m-go" style="padding:12px 22px">确认借入</button><p class="note" id="m-st"></p></div>';
        modal.hidden = false;
        var ms = document.getElementById("m-st");
        function msay(t, bad) { ms.className = "note" + (bad ? " down" : ""); ms.innerHTML = t; }
        modal.querySelector("[data-close]").onclick = closeModal;
        document.getElementById("m-go").onclick = function () {
          var btn = this; btn.disabled = true;
          k.ready().then(function () { return k.balance(M.token, k.account()); }).then(function (bal) {
            if (bal < l.collateral) throw new Error(M.sym + " 不够：要押 " + tok(l.collateral) + "，钱包里只有 " + tok(bal));
            return ensureAllowance(M.token, l.collateral, msay, tok(l.collateral) + " " + M.sym);
          }).then(function () { return k.send(LOAN, SEL.take + u256(l.id), msay, "借入 " + dai(l.principal) + " DAI"); })
            .then(function () { msay("✅ 已借入！本金已到你的钱包。<b>不会自动扣款</b>：请在 " + A.timeBJ((Date.now() / 1000 + l.term) * 1000) + "（北京时间）前到「我的借贷」自己点「还款」，可以提前还"); setTimeout(function () { closeModal(); reload(); }, 3500); })
            .catch(function (e) { msay(niceError(e), true); btn.disabled = false; });
        };
      };
    });
    // 出借：确认弹窗
    app.querySelectorAll("[data-fund]").forEach(function (b) {
      b.onclick = function () {
        var l = loans.filter(function (x) { return x.id === Number(b.getAttribute("data-fund")); })[0];
        if (!l) return;
        var total = l.principal + fee(l.principal), it = interest(l), ra = ratio(l);
        modal.innerHTML = '<div class="modal-box"><div class="card-head"><h2>出借 · 借款单 #' + l.id + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
          '<dl class="dl"><dt>借款人</dt><dd class="mono">' + A.short(l.borrower) + "</dd><dt>抵押</dt><dd>" + tok(l.collateral) + " " + M.sym + (ra === null ? "" : "（现值约 " + A.fmt(tokN(l.collateral) * mkt, 2) + " DAI，抵押率 " + ra.toFixed(0) + "%）") + "</dd>" +
          "<dt>你借出</dt><dd>" + dai(l.principal) + " DAI</dd><dt>手续费 1%</dt><dd>" + dai(fee(l.principal)) + " DAI</dd><dt>实付</dt><dd><b>" + dai(total) + " DAI</b></dd>" +
          "<dt>到期收回</dt><dd><b>" + dai(l.repayAmount) + " DAI</b>（利息 " + A.fmt(it.i, 2) + "，年化约 " + it.apr.toFixed(0) + "%）</dd><dt>期限</dt><dd>" + days(l.term) + "，从你接单起算</dd></dl>" +
          '<p class="note down">到期借款人没还，你拿到的是上面的抵押币，不是 DAI。' + (ra === null ? "" : "按现价，" + M.sym + " 跌超过 " + Math.max(0, Math.round(100 - 10000 / ra)) + "% 时抵押品就不够还款，借款人大概率不还。") + '合约不会清算、不会提醒补仓，跌价风险全部由你承担。</p>' +
          '<button id="m-go" style="padding:12px 22px">确认出借</button><p class="note" id="m-st"></p></div>';
        modal.hidden = false;
        var ms = document.getElementById("m-st");
        function msay(t, bad) { ms.className = "note" + (bad ? " down" : ""); ms.innerHTML = t; }
        modal.querySelector("[data-close]").onclick = closeModal;
        document.getElementById("m-go").onclick = function () {
          var btn = this; btn.disabled = true;
          k.ready().then(function () { return k.balance(ANUBIS_DAI, k.account()); }).then(function (bal) {
            if (bal < total) throw new Error("DAI 不够：需要 " + dai(total) + "，钱包里只有 " + dai(bal));
            return ensureAllowance(ANUBIS_DAI, total, msay, dai(total) + " DAI");
          }).then(function () { return k.send(LOAN, SEL.fund + u256(l.id) + u256(total), msay, "出借 " + dai(l.principal) + " DAI"); })
            .then(function () { msay("✅ 已出借！到期前借款人还款会直接到你的钱包；到期没还可在「我的借贷」领取抵押品"); setTimeout(function () { closeModal(); reload(); }, 3000); })
            .catch(function (e) { msay(niceError(e), true); btn.disabled = false; });
        };
      };
    });
    }
  }

  // ---------- 部署页：#/lend/deploy/<市场> ----------
  function renderDeploy(id) {
    var k = K(), app = A.app;
    app.innerHTML = '<h1>部署借款合约 · ' + M.sym + ' 抵押（Anubis 链）</h1><p class="sub">用你的钱包把点对点借款合约 AilgnsLoanEscrow 部署到 Anubis 链，Gas 用 DAI。构造参数是下面的抵押币、DAI 和手续费收款地址；手续费 1%、期限 1–90 天都写死在合约里，金额不限。</p>' + marketTabs("#/lend/deploy") +
      (LOAN ? '<section class="card"><p>这个市场已经部署：<a class="mono" target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + LOAN + '">' + LOAN + " ↗</a>，不用再部署。</p></section>" : "") +
      '<section class="card"><dl class="dl"><dt>抵押币 ' + M.sym + '</dt><dd class="mono">' + M.token + '</dd><dt>DAI</dt><dd class="mono">' + ANUBIS_DAI + '</dd><dt>手续费收款地址</dt><dd class="mono">' + FEE_RECIPIENT + "</dd><dt>手续费</dt><dd>本金的 1%，出借人另付（合约里写死）</dd><dt>管理员</dt><dd>无，部署后任何人都改不了</dd></dl>" +
      '<button id="d-go" style="padding:12px 22px;margin-top:16px">连接钱包并部署</button><p class="note" id="d-st"></p></section>';
    var st = document.getElementById("d-st");
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; }
    document.getElementById("d-go").onclick = function () {
      var btn = this, data, gas; btn.disabled = true;
      k.connect().then(function () { return W.get().request({ method: "eth_chainId" }); }).then(function (cid) {
        if (Number(cid) !== Number(W.CHAINS.anubis.params.chainId)) throw new Error("钱包现在不在 Anubis 链上：请在钱包里手动切换到 Anubis 再点部署");
        return A.getJSON("contracts/AilgnsLoanEscrow.json");
      }).then(function (art) {
        data = art.bytecode + u256(M.token) + u256(ANUBIS_DAI) + u256(FEE_RECIPIENT);
        say("正在估算部署手续费…");
        return Promise.all([W.rpcOn("anubis", "eth_estimateGas", [{ from: k.account(), data: data }]), W.rpcOn("anubis", "eth_gasPrice", []), W.rpcOn("anubis", "eth_getBalance", [k.account(), "latest"])]);
      }).then(function (r) {
        gas = BigInt(r[0]) * 13n / 10n;
        var cost = gas * BigInt(r[1]);
        if (BigInt(r[2]) < cost) throw new Error("钱包里的 DAI 不够付部署手续费：大约需要 " + dai(cost, 3) + " DAI");
        say("请在钱包里确认部署（手续费约 " + dai(cost, 3) + " DAI）…");
        return W.get().request({ method: "eth_sendTransaction", params: [{ from: k.account(), data: data, gas: "0x" + gas.toString(16) }] });
      }).then(function (hash) { say("已提交，等待链上确认…"); return W.waitOn("anubis", hash); })
        .then(function (r) { say('✅ 部署成功！合约地址：<b class="mono">' + r.contractAddress + '</b><br>把这个地址发给我，我把它填进网站就能开放。<a target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + r.contractAddress + '">在浏览器查看 ↗</a>'); },
          function (e) { say(niceError(e), true); btn.disabled = false; });
    };
  }

  var listening = false;
  A.pages.lend = function (id) {
    // #/lend · #/lend/<市场> · #/lend/deploy/<市场>
    var parts = location.hash.split("/"), sub = parts[2] || "";
    useMarket(sub === "deploy" ? parts[3] : sub);
    if (!listening) { listening = true; A.wallets.onAccounts(function () { if (A.isCurrent(id)) render(id); }); }
    if (sub === "deploy") return renderDeploy(id);
    render(id);
  };
})();
