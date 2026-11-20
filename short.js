// 📉 #/short「做空 OFT」（站长 2026-11-21 定做，试运行，放 ☰ 更多 → 交易，不宣传）
// 真做空只有一种做法：借币 → 卖掉 → 以后买回来还。这里把四步放在一页：
//   ① 出借人挂单：存入 OFT，写明要对方押多少 DAI、到期还多少 OFT、借几天；
//   ② 做空的人接单：押上 DAI，OFT 直接到自己钱包；③ 在官方 DEX 把 OFT 卖成 DAI；④ 到期前买回 OFT 还上，押金退回。
// 合约：本站借贷合约 AilgnsLoanEscrow 同一份代码、换个参数再部署一份（抵押币 = DAI，本金币 = OFT）。不看价格、不清算；
//   到期不还，押金归出借人——做空的人最多亏掉押金。手续费是本金的 1%，由出借人付，收到的是 OFT（合约写死）。
//   LOAN 空着 = 还没部署：页面只显示说明、现价和示例，所有发交易的按钮都不开。部署由站长自己做（monita/deploy_short_oft.py），部署后把地址填到 LOAN。
// 卖出 / 买回走官方 DEX 的路由（第三方合约，和客户自己去官方 DEX 换是同一个），发之前先在节点上模拟，授权只给这一笔的数量。
// 只做「出借人挂单、做空的人接单」这一个方向（合约里另一个方向——做空的人先挂单等人出借——页面先不做，少一条路少一分错）。
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var LOAN = ""; // 「押 DAI 借 OFT」的借贷合约地址：还没部署
  var OFT = "0x90ba17416946622b37a833580aaebb2512558858", DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14";
  var PAIR = "0x5d064ebe2d7f46a11f4e238b75cb9588eb8120b1"; // 官方 DEX 的 OFT/DAI 池子（token0 = DAI，token1 = OFT）
  var ROUTER = "0x3e412e02b6157fbe80b6c6697f3ce1142e629019"; // 官方 DEX 路由
  var SEL = { offer: "0x992001bd", take: "0x4fd9efc4", repay: "0x371fd8e6", claim: "0x379607f5", cancel: "0x40e58ee5", count: "0x9d11ed75", get: "0x86b20104",
    approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231", reserves: "0x0902f1ac", outs: "0xd06ca61f", ins: "0x1f00ca74",
    sell: "0x5c11d795" /* swapExactTokensForTokensSupportingFeeOnTransferTokens */, buy: "0x8803dbee" /* swapTokensForExactTokens */ };
  var TERMS = [[86400, "1 天"], [3 * 86400, "3 天"], [7 * 86400, "7 天"], [15 * 86400, "15 天"], [30 * 86400, "30 天"], [60 * 86400, "60 天"], [90 * 86400, "90 天"]];
  var E18 = 10n ** 18n, GAS_KEEP = 50000000000000000n, LIST_FOR = 7 * 86400; // 出借单挂 7 天没人接就能取回
  var account = null, price = 0, loans = [], bal = {}, busy = false, rid = 0, hooked = false, timer = 0;

  function g(id) { return document.getElementById(id); }
  function low(s) { return String(s || "").toLowerCase(); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function word(v) { return ("0".repeat(64) + (typeof v === "bigint" ? v.toString(16) : String(v).replace(/^0x/, ""))).slice(-64); }
  function words(r) { return (String(r || "").slice(2).match(/.{64}/g) || []); }
  function toWei(str) { var m = /^(\d{0,12})(?:\.(\d{0,18}))?$/.exec(String(str || "").trim()); if (!m || (!m[1] && !m[2])) return null; return BigInt(m[1] || "0") * E18 + BigInt(((m[2] || "") + "0".repeat(18)).slice(0, 18) || "0"); }
  function num(v) { return Number(v) / 1e18; }
  function f(x, d) { return (x || 0).toLocaleString("en-US", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
  function oft(v) { return f(num(v), num(v) >= 100 ? 0 : 2); }
  function left(sec) { return sec <= 0 ? "已到期" : sec >= 86400 ? Math.floor(sec / 86400) + " 天 " + Math.floor(sec % 86400 / 3600) + " 小时" : sec >= 3600 ? Math.floor(sec / 3600) + " 小时 " + Math.floor(sec % 3600 / 60) + " 分钟" : Math.max(1, Math.floor(sec / 60)) + " 分钟"; }
  function nice(e) { var m = (A.otcKit && A.otcKit.niceError) ? A.otcKit.niceError(e) : String((e && e.message) || e || ""); return /reject|denied|取消|拒绝|cancel/i.test(m) ? "你在钱包里取消了，这一步没有发出去。" : (m || "钱包没有响应，刷新后再试"); }
  function say(t, bad) { var el = g("sht-say"); if (el) { el.textContent = t || ""; el.className = "sht-say" + (bad ? " bad" : t ? " on" : ""); if (t) try { el.scrollIntoView({ block: "nearest" }); } catch (e) { /* 忽略 */ } } }
  function guideRate(term) { return Math.max(0.02, 0.05 * term / (30 * 86400)); } // 和借贷页同一个指导利息：月息 5% 按天折算，最低 2%

  // ---------- 读链 ----------
  function rd(to, data, from) { var p = { to: to, data: data }; if (from) p.from = from; return W.rpcOn("anubis", "eth_call", [p, "latest"]); }
  function loadPrice() { return rd(PAIR, SEL.reserves).then(function (r) { var w = words(r), d = BigInt("0x" + w[0]), o = BigInt("0x" + w[1]); price = o > 0n ? Number(d) / Number(o) : 0; }, function () { /* 读不到价：页面上写「—」 */ }); }
  function quoteSell(amt) { return rd(ROUTER, SEL.outs + word(amt) + word(64n) + word(2n) + word(OFT) + word(DAI)).then(function (r) { return BigInt("0x" + words(r)[3]); }); } // 卖 amt 个 OFT 能到手多少 DAI
  function quoteBuy(amt) { return rd(ROUTER, SEL.ins + word(amt) + word(64n) + word(2n) + word(DAI) + word(OFT)).then(function (r) { return BigInt("0x" + words(r)[2]); }); } // 买 amt 个 OFT 要花多少 DAI
  function parseLoans(r, from) {
    var w = words(r), n = Number(BigInt("0x" + (w[1] || "0"))), out = [];
    for (var i = 0; i < n; i++) {
      var o = w.slice(2 + i * 10, 12 + i * 10); if (o.length < 10) break;
      out.push({ id: from + i, borrower: "0x" + o[0].slice(24), lender: "0x" + o[1].slice(24), isOffer: BigInt("0x" + o[2]) === 1n, status: Number(BigInt("0x" + o[3])), expiry: Number(BigInt("0x" + o[4])), term: Number(BigInt("0x" + o[5])), due: Number(BigInt("0x" + o[6])), collateral: BigInt("0x" + o[7]), principal: BigInt("0x" + o[8]), repay: BigInt("0x" + o[9]) });
    }
    return out;
  }
  function loadLoans() {
    if (!LOAN) { loans = []; return Promise.resolve(); }
    return rd(LOAN, SEL.count).then(function (c) { var n = Number(BigInt(c)), from = Math.max(0, n - 300); return n ? rd(LOAN, SEL.get + word(BigInt(from)) + word(300n)).then(function (r) { loans = parseLoans(r, from); }) : (loans = []); });
  }
  function loadBal() {
    if (!account) return Promise.resolve();
    return Promise.all([W.rpcOn("anubis", "eth_getBalance", [account, "latest"]).then(function (x) { bal.dai = BigInt(x); }), rd(OFT, SEL.balanceOf + word(account)).then(function (x) { bal.oft = BigInt(x); })]).catch(function () { /* 余额读不到就先不显示 */ });
  }

  // ---------- 钱包 ----------
  function connect() { var eth; return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { account = low(a[0]); return W.switchTo(eth, "anubis"); }).then(function () { return account; }); }
  function ready() { return Promise.resolve().then(function () { return account ? W.switchTo(W.get(), "anubis") : connect(); }); }
  function wait(hash) {
    var tries = 0;
    return new Promise(function (ok, fail) {
      (function poll() {
        W.rpcOn("anubis", "eth_getTransactionReceipt", [hash]).then(function (r) {
          if (r) return r.status === "0x1" ? ok(r) : fail(new Error("这笔交易被链上拒绝了，币没有动（只花了一点 Gas）。"));
          if (++tries > 60) return fail(new Error("等了 2 分钟链上还没确认。别重复点：过一会儿刷新这一页再看。"));
          setTimeout(poll, 1500);
        }, function () { setTimeout(poll, 2500); });
      })();
    });
  }
  // 先在节点上模拟一遍，过不了就不让钱包弹窗；过了再发、等上链
  function send(to, data, label) {
    say("正在检查「" + label + "」能不能成功…");
    return rd(to, data, account).catch(function (e) { throw new Error("「" + label + "」现在做不成：" + nice(e)); }).then(function () {
      say("请在钱包里确认「" + label + "」");
      return A.wallets.ask(W.get(), { method: "eth_sendTransaction", params: [{ from: account, to: to, data: data }] });
    }).then(function (h) { say(label + "已提交，等链上确认…"); return wait(h); });
  }
  function allow(token, spender, amount, name) { // 授权只给这一笔要用的数量
    return rd(token, SEL.allowance + word(account) + word(spender)).then(function (a) {
      if (BigInt(a) >= amount) return;
      return send(token, SEL.approve + word(spender) + word(amount), "授权 " + name + "（只授权这一笔的数量）");
    });
  }
  function run(job) { // 所有按钮都走这里：防连点、出错说人话、做完重读
    if (busy) return; busy = true; paintBusy();
    Promise.resolve().then(ready).then(loadBal).then(job).then(function (msg) { busy = false; say(msg || "✅ 完成"); return refresh(); }, function (e) { busy = false; say(nice(e), true); paintBusy(); loadBal(); });
  }
  function paintBusy() { [].forEach.call(document.querySelectorAll(".sht button"), function (b) { if (b.hasAttribute("data-act")) b.disabled = busy || !LOAN; }); }

  // ---------- 动作 ----------
  function doTake(l) { // 做空的人接出借单：押 DAI，拿走 OFT
    return function () {
      if (bal.dai != null && bal.dai < l.collateral + GAS_KEEP) throw new Error("要押 " + f(num(l.collateral)) + " DAI，另外留一点付 Gas，钱包里不够。");
      return allow(DAI, LOAN, l.collateral, "DAI").then(function () { return send(LOAN, SEL.take + word(BigInt(l.id)), "押 " + f(num(l.collateral)) + " DAI，借 " + oft(l.principal) + " OFT"); })
        .then(function () { return "✅ 借到了 " + oft(l.principal) + " OFT，已经在你钱包里。下一步：在下面「我的做空」里点「卖出」，把它换成 DAI。"; });
    };
  }
  function doSell(amt) { // 在官方 DEX 把 OFT 卖成 DAI（最少到手 = 报价的 99%）
    return function () {
      if (bal.oft != null && bal.oft < amt) throw new Error("钱包里的 OFT 不够卖这么多。");
      var out;
      return quoteSell(amt).then(function (q) { out = q; return allow(OFT, ROUTER, amt, "OFT"); }).then(function () {
        var data = SEL.sell + word(amt) + word(out * 99n / 100n) + word(160n) + word(account) + word(BigInt(Math.floor(Date.now() / 1000) + 600)) + word(2n) + word(OFT) + word(DAI);
        return send(ROUTER, data, "卖出 " + oft(amt) + " OFT，到手约 " + f(num(out)) + " DAI");
      }).then(function () { return "✅ 卖出了，到手约 " + f(num(out)) + " DAI。等 OFT 跌了再回来点「买回」。"; });
    };
  }
  function doBuy(amt) { // 在官方 DEX 买回正好 amt 个 OFT（最多付 = 报价的 101%）
    return function () {
      var cost;
      return quoteBuy(amt).then(function (q) { cost = q * 101n / 100n; if (bal.dai != null && bal.dai < cost + GAS_KEEP) throw new Error("买回要约 " + f(num(q)) + " DAI，钱包里不够。"); return allow(DAI, ROUTER, cost, "DAI"); }).then(function () {
        var data = SEL.buy + word(amt) + word(cost) + word(160n) + word(account) + word(BigInt(Math.floor(Date.now() / 1000) + 600)) + word(2n) + word(DAI) + word(OFT);
        return send(ROUTER, data, "买回 " + oft(amt) + " OFT，约花 " + f(num(cost * 100n / 101n)) + " DAI");
      }).then(function () { return "✅ 买回来了。下一步：点「还币」，押金就退回来。"; });
    };
  }
  function doRepay(l) {
    return function () {
      if (bal.oft != null && bal.oft < l.repay) throw new Error("要还 " + oft(l.repay) + " OFT，钱包里只有 " + oft(bal.oft) + "。先点「买回」。");
      return allow(OFT, LOAN, l.repay, "OFT").then(function () { return send(LOAN, SEL.repay + word(BigInt(l.id)), "还 " + oft(l.repay) + " OFT，取回押金 " + f(num(l.collateral)) + " DAI"); })
        .then(function () { return "✅ 还清了，押金 " + f(num(l.collateral)) + " DAI 已退回你的钱包。"; });
    };
  }
  function doSimple(sel, l, label, done) { return function () { return send(LOAN, sel + word(BigInt(l.id)), label).then(function () { return done; }); }; }
  function doOffer() {
    return function () {
      var c = calcOffer(); if (!c) throw new Error("请把出借的数量填好。");
      if (c.principal < 1000n * E18 / 100n) throw new Error("数量太小了。");
      var need = c.principal + c.principal / 100n;
      if (bal.oft != null && bal.oft < need) throw new Error("要存入 " + oft(need) + " OFT（含 1% 手续费），钱包里只有 " + oft(bal.oft) + "。");
      return allow(OFT, LOAN, need, "OFT").then(function () {
        return send(LOAN, SEL.offer + word(c.collateral) + word(c.principal) + word(c.repay) + word(BigInt(c.term)) + word(BigInt(LIST_FOR)), "挂出借单：借出 " + oft(c.principal) + " OFT");
      }).then(function () { return "✅ 出借单挂上了。7 天没人接可以点「撤单」取回。"; });
    };
  }
  function calcOffer() {
    var a = g("sht-oa"), t = g("sht-ot"), i = g("sht-oi"), r = g("sht-or"); if (!a) return null;
    var principal = toWei(a.value), term = Number(t.value) || 7 * 86400, rate = Math.max(0, Number(i.value) || 0) / 100, ratio = Math.max(100, Number(r.value) || 150) / 100;
    if (!principal || principal <= 0n || !price) return null;
    var repay = principal + principal * BigInt(Math.round(rate * 1e6)) / 1000000n;
    var collateral = BigInt(Math.round(num(principal) * price * ratio * 100)) * E18 / 100n;
    return { principal: principal, repay: repay, collateral: collateral, term: term, ratio: ratio, rate: rate };
  }

  // ---------- 画面 ----------
  function row(l, demo) {
    var val = num(l.principal) * price, ratio = val ? num(l.collateral) / val * 100 : 0, intr = num(l.principal) ? (num(l.repay) / num(l.principal) - 1) * 100 : 0;
    return '<div class="sht-row' + (demo ? " demo" : "") + '">' +
      "<div><b>借 " + oft(l.principal) + " OFT</b><span>现在能卖约 " + f(val) + " DAI</span></div>" +
      "<div><b>押 " + f(num(l.collateral)) + " DAI</b><span>抵押率 " + f(ratio, 0) + "%</span></div>" +
      "<div><b>" + Math.round(l.term / 86400) + " 天后还 " + oft(l.repay) + "</b><span>利息 " + f(intr, 1) + "%</span></div>" +
      (demo ? '<em class="sht-demo">示例</em>' : '<button type="button" data-act="take" data-id="' + l.id + '">借来做空</button>') + "</div>";
  }
  function mineHtml() {
    if (!account || !LOAN) return "";
    var now = Date.now() / 1000, html = "";
    loans.filter(function (l) { return l.status === 1 && low(l.borrower) === account; }).forEach(function (l) {
      var have = bal.oft || 0n, need = l.repay > have ? l.repay - have : 0n;
      html += '<div class="sht-my"><b>我借了 ' + oft(l.principal) + " OFT，要还 " + oft(l.repay) + "</b>" +
        "<span>押金 " + f(num(l.collateral)) + " DAI · " + (l.due > now ? "还剩 " + left(l.due - now) : "<i>已到期，出借人随时可以把押金领走，要还请尽快</i>") + " · 钱包里有 " + oft(have) + " OFT</span>" +
        '<span id="sht-q' + l.id + '" class="sht-q"></span><div class="sht-btns">' +
        (have > 0n ? '<button type="button" class="ghost" data-act="sell" data-id="' + l.id + '">卖出 OFT</button>' : "") +
        (need > 0n ? '<button type="button" class="ghost" data-act="buy" data-id="' + l.id + '">买回 ' + oft(need) + " OFT</button>" : "") +
        '<button type="button" data-act="repay" data-id="' + l.id + '">还币，取回押金</button></div></div>';
    });
    loans.filter(function (l) { return low(l.lender) === account && (l.status === 0 || l.status === 1); }).forEach(function (l) {
      html += '<div class="sht-my"><b>我借出 ' + oft(l.principal) + " OFT" + (l.status === 0 ? "（还没人接）" : "") + "</b>" +
        "<span>" + (l.status === 0 ? "对方要押 " + f(num(l.collateral)) + " DAI · 挂单还剩 " + left(l.expiry - now) : "到期收回 " + oft(l.repay) + " OFT · 对方押了 " + f(num(l.collateral)) + " DAI · " + (l.due > now ? "还剩 " + left(l.due - now) : "<i>已到期，对方还没还</i>")) + "</span>" +
        '<div class="sht-btns">' + (l.status === 0 ? '<button type="button" class="ghost" data-act="cancel" data-id="' + l.id + '">撤单，取回 OFT</button>' : l.due <= now ? '<button type="button" data-act="claim" data-id="' + l.id + '">领取押金 ' + f(num(l.collateral)) + " DAI</button>" : "") + "</div></div>";
    });
    return html ? '<section class="card sht-sec"><h3>我的做空 / 我的出借</h3>' + html + "</section>" : "";
  }
  function draw() {
    if (!A.isCurrent(rid)) return;
    var now = Date.now() / 1000, open = loans.filter(function (l) { return l.isOffer && l.status === 0 && l.expiry > now; }).sort(function (x, y) { return num(x.collateral) / num(x.principal) - num(y.collateral) / num(y.principal); });
    var demo = [{ id: 0, principal: 10000n * E18, repay: 10200n * E18, collateral: BigInt(Math.round(10000 * (price || 0.054) * 1.5)) * E18, term: 7 * 86400 }, { id: 0, principal: 50000n * E18, repay: 52500n * E18, collateral: BigInt(Math.round(50000 * (price || 0.054) * 1.5)) * E18, term: 30 * 86400 }];
    var keep = {}; ["sht-oa", "sht-ot", "sht-oi", "sht-or"].forEach(function (k) { if (g(k)) keep[k] = g(k).value; });
    var openDt = g("sht-lend") && g("sht-lend").open;
    A.app.innerHTML = '<div class="sht">' +
      '<header class="sht-hd"><h2>📉 做空 OFT<em>试运行</em></h2><p>觉得 OFT 会跌？借来卖掉，跌了再买回来还，中间的差价就是你赚的。涨了就亏。</p></header>' +
      '<section class="card sht-steps"><div><i>1</i><b>押 DAI 借 OFT</b></div><div><i>2</i><b>马上卖成 DAI</b></div><div><i>3</i><b>跌了买回来</b></div><div><i>4</i><b>还币，押金退回</b></div></section>' +
      '<section class="card sht-px"><span>OFT 现价（官方 DEX）</span><b>' + (price ? f(price, 4) + " DAI" : "—") + "</b></section>" +
      (LOAN ? "" : '<p class="sht-soon">🚧 合约还没部署，下面是示例，按钮暂时点不了。部署后这里会列出真实的出借单。</p>') +
      '<section class="card sht-sec"><h3>可以借的 OFT</h3>' +
      (LOAN ? (open.length ? open.map(function (l) { return row(l); }).join("") : '<p class="muted">现在没有人挂出借单。手里有 OFT 的可以在下面挂一张。</p>') : demo.map(function (l) { return row(l, true); }).join("")) +
      "</section>" + mineHtml() +
      '<section class="card sht-sec"><details id="sht-lend"' + (openDt ? " open" : "") + "><summary>我有 OFT，想借出去赚利息</summary>" +
      '<label>借出多少 OFT<input id="sht-oa" inputmode="decimal" autocomplete="off" placeholder="例如 10000"></label>' +
      '<div class="sht-g3"><label>借几天<select id="sht-ot">' + TERMS.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === 7 * 86400 ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select></label>" +
      '<label>利息 %<input id="sht-oi" inputmode="decimal" autocomplete="off" value="2"></label><label>抵押率 %<input id="sht-or" inputmode="decimal" autocomplete="off" value="150"></label></div>' +
      '<p class="sht-calc" id="sht-calc"></p><button type="button" data-act="offer">挂出借单</button>' +
      '<p class="note">你另付本金 1% 的手续费（收的是 OFT）。对方到期不还，他押的 DAI 归你；OFT 涨得比抵押率还多时，他可能宁可不还——抵押率定高一点更稳。</p></details></section>' +
      '<p class="sht-say" id="sht-say" role="status"></p>' +
      '<section class="card sht-risk"><h3>先看清楚</h3><ul>' +
      "<li><b>最多亏掉押金。</b>OFT 涨了，买回来要花更多钱；涨太多可以不还，押金归出借人，卖币到手的 DAI 仍是你的。</li>" +
      "<li><b>到期必须还。</b>过了期限，出借人随时可以把押金领走。可以提前还，但要还的数量不变。</li>" +
      "<li><b>不看价格、不清算。</b>合约只认「到期还没还」，中途涨跌都不会强制平仓。</li>" +
      "<li><b>卖出、买回走官方 DEX</b>，价格和滑点以当时池子为准，页面给的是预估。</li>" +
      "<li>这是试运行功能，合约未经第三方审计，请先用小额试。</li></ul></section></div>";
    Object.keys(keep).forEach(function (k) { if (g(k)) g(k).value = keep[k]; });
    ["sht-oa", "sht-ot", "sht-oi", "sht-or"].forEach(function (k) { if (g(k)) g(k).oninput = paintCalc; });
    [].forEach.call(A.app.querySelectorAll("[data-act]"), function (b) { b.onclick = function () { onAct(b.getAttribute("data-act"), Number(b.getAttribute("data-id"))); }; });
    paintCalc(); paintBusy(); paintQuotes();
  }
  function paintCalc() {
    var el = g("sht-calc"), c = calcOffer(); if (!el) return;
    el.textContent = c ? "对方要押 " + f(num(c.collateral)) + " DAI（按现价 " + f(price, 4) + " 的 " + Math.round(c.ratio * 100) + "%），" + Math.round(c.term / 86400) + " 天后还你 " + oft(c.repay) + " OFT。你一共存入 " + oft(c.principal + c.principal / 100n) + " OFT（含手续费）。" : "";
  }
  function paintQuotes() { // 我的做空：现在买回要多少钱
    if (!account || !LOAN) return;
    loans.filter(function (l) { return l.status === 1 && low(l.borrower) === account; }).forEach(function (l) {
      quoteBuy(l.repay).then(function (q) { var el = g("sht-q" + l.id); if (el) el.textContent = "现在买回 " + oft(l.repay) + " OFT 要约 " + f(num(q)) + " DAI"; }, function () { /* 报价读不到就不显示 */ });
    });
  }
  function onAct(act, id) {
    if (!LOAN) return say("合约还没部署，这个按钮暂时用不了。", true);
    var l = loans.filter(function (x) { return x.id === id; })[0];
    if (act === "offer") return run(doOffer());
    if (!l) return say("这张单找不到了，请刷新。", true);
    if (act === "take") return run(doTake(l));
    if (act === "sell") return run(function () { var amt = bal.oft != null && bal.oft < l.principal ? bal.oft : l.principal; return doSell(amt)(); });
    if (act === "buy") return run(function () { var need = l.repay - (bal.oft || 0n); if (need <= 0n) throw new Error("钱包里的 OFT 已经够还了，直接点「还币」。"); return doBuy(need)(); });
    if (act === "repay") return run(doRepay(l));
    if (act === "cancel") return run(doSimple(SEL.cancel, l, "撤掉出借单", "✅ 已撤单，OFT 已退回你的钱包。"));
    if (act === "claim") return run(doSimple(SEL.claim, l, "领取押金", "✅ 押金已到你的钱包。"));
  }
  function refresh() { return Promise.all([loadPrice(), loadLoans(), loadBal()]).then(draw, draw); }

  A.pages.short = function (id) {
    rid = id;
    if (!hooked) { hooked = true; try { A.wallets.onAccounts(function (a) { account = a && a[0] ? low(a[0]) : null; bal = {}; if (location.hash.indexOf("#/short") === 0) refresh(); }); } catch (e) { /* 忽略 */ } }
    draw();
    (account ? Promise.resolve() : A.wallets.silent().then(function (a) { if (a) account = low(a); }, function () { /* 没连过就等客户点按钮时再连 */ })).then(refresh, refresh);
    clearInterval(timer);
    timer = setInterval(function () { if (!A.isCurrent(id)) return clearInterval(timer); if (!busy && !document.hidden && !(document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName))) refresh(); }, 20000);
  };
})();
