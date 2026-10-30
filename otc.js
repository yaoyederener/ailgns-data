// OTC 担保交易：挂单的币锁在智能合约里，吃单在同一笔交易里完成交换，过期自动退回
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  // 部署后填上合约地址；空着时页面显示"即将上线"
  var OTC = "";
  var AILGNS = "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB";
  var DAI = "0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14";
  var FEE_RECIPIENT = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6";
  var MAX_DAI = 5000;
  var FEE_BPS = 100n;
  var EXPLORER = "https://anubisscan.io";
  var SOURCE = "https://github.com/yaoyederener/ailgns-data/blob/main/contracts/AilgnsOtcEscrow.sol";
  var SEL = {
    create: "0x9128a740", fill: "0x6fe4a448", cancel: "0x40e58ee5", ordersCount: "0x35daa731", getOrders: "0x8f72fc77",
    approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231"
  };
  var DURATIONS = [[3600, "1 小时"], [86400, "24 小时"], [7 * 86400, "7 天"]];
  var WEI = 10n ** 18n;
  var account = null;

  // ---------- 数字 ----------
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function toWei(str) {
    str = String(str || "").trim();
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
  function connect() {
    var eth = W.get();
    return eth.request({ method: "eth_requestAccounts" }).then(function (a) {
      account = String(a[0]).toLowerCase();
      return W.switchChain(eth);
    }).then(function () { return account; });
  }
  function send(to, data, say, label) {
    var eth = W.get();
    say("请在钱包里确认：" + label + "…");
    return eth.request({ method: "eth_sendTransaction", params: [{ from: account, to: to, data: data }] }).then(function (hash) {
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
  var TRUST = '<div class="trust">' +
    '<div><b>🔒 合约托管</b><span>挂单的币锁在智能合约里，平台和任何人都动不了</span></div>' +
    '<div><b>⚡ 原子成交</b><span>付款和收币在同一笔交易完成，要么都成功、要么都退回，不存在一方跑路</span></div>' +
    '<div><b>↩️ 过期自动退回</b><span>没人成交就原路退回挂单人，挂单人也能随时撤单</span></div>' +
    '<div><b>🧾 规则公开</b><span>合约无管理员、不可升级，源码公开可查；成交收 1% 手续费</span></div></div>';

  function renderOtc(id, sub) {
    var app = A.app;
    var head = '<h1>OTC 担保交易</h1><p class="sub">AiLGNS ⇄ DAI 场外大额交易。智能合约托管，无需信任对方，无需任何人许可。</p>';
    if (sub === "deploy") return renderDeploy(id);
    if (!OTC) {
      app.innerHTML = head + TRUST + '<section class="card" style="text-align:center;padding:36px 18px"><h2>即将上线</h2><p class="muted" style="margin:8px 0 0">托管合约部署完成后开放挂单和交易。</p></section>';
      return;
    }
    app.innerHTML = head + TRUST + '<div class="loading">正在读取订单…</div>';
    Promise.all([readOrders(), marketPrice().catch(function () { return null; })]).then(function (r) {
      if (!A.isCurrent(id)) return;
      draw(id, r[0], r[1]);
    }, function () {
      if (A.isCurrent(id)) app.innerHTML = head + TRUST + '<div class="card err">订单读取失败，请稍后刷新。</div>';
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
        return "<tr><td><b>" + A.fmt(p, 2) + "</b></td><td>" + show(ail) + "</td><td>" + A.fmt(num(ail) * p, 2) + "</td>" +
          "<td class=\"" + (diff === null ? "" : diff >= 0 ? "up" : "down") + "\">" + (diff === null ? "—" : (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%") + "</td>" +
          "<td>" + left(o.expiry - now) + '</td><td class="l mono">' + A.short(o.maker) + '</td><td><button class="' + (o.sellAilgns ? "" : "ghost") + '" data-fill="' + o.id + '" style="padding:6px 14px">' +
          (o.sellAilgns ? "买入" : "卖出") + "</button></td></tr>";
      }
      function book(title, list, hint) {
        return '<section class="card"><div class="card-head"><h2>' + title + '</h2><span class="muted">' + hint + "</span></div>" +
          (list.length ? '<div class="tbl-wrap"><table><thead><tr><th>单价 DAI</th><th>剩余 AiLGNS</th><th>总额 DAI</th><th>对比市价</th><th>剩余时间</th><th class="l">挂单人</th><th></th></tr></thead><tbody>' +
            list.map(row).join("") + "</tbody></table></div>" : '<div class="empty">暂无挂单</div>') + "</section>";
      }

      var html = head + TRUST;
      html += '<div class="kpis"><div class="kpi"><div class="k">AiLGNS 市价（主池）</div><div class="v num">' + (mkt ? A.fmt(mkt, 2) : "—") + '<small>DAI</small></div><div class="d">挂单价格可以自由设置</div></div>' +
        '<div class="kpi"><div class="k">挂单中</div><div class="v num">' + live.length + '</div><div class="d">卖单 ' + sells.length + " · 买单 " + buys.length + "</div></div>" +
        '<div class="kpi"><div class="k">托管合约</div><div class="v" style="font-size:16px"><a class="mono" target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + OTC + '">' + A.short(OTC) + ' ↗</a></div><div class="d"><a target="_blank" rel="noopener" href="' + SOURCE + '">查看合约源码 ↗</a></div></div>' +
        '<div class="kpi"><div class="k">我的钱包</div><div class="v" style="font-size:16px">' + (account ? '<span class="mono">' + A.short(account) + "</span>" : '<button id="otc-connect" style="padding:8px 16px">连接钱包</button>') + '</div><div class="d" id="otc-bal">' + (account ? "读取余额…" : "挂单、吃单前先连接") + "</div></div></div>";
      html += book("卖单 · 买入 AiLGNS", sells, "价格从低到高") + book("买单 · 卖出 AiLGNS", buys, "价格从高到低");
      html += createForm();
      if (account) html += myOrders(mine, now);
      html += '<p class="note">单笔挂单上限 ' + MAX_DAI.toLocaleString() + " DAI。成交手续费 1%，由吃单方承担（从收到的币里扣）；挂单、撤单、过期退回都不收费。智能合约未经第三方审计，请先小额试用。本站为独立运营的数据站，与 AWAKE HELIX 项目方无关。</p>";
      html += '<div class="modal" id="otc-modal" hidden></div>';
      A.app.innerHTML = html;
      bind(id, orders, mkt);
      if (account) Promise.all([balance(AILGNS, account), balance(DAI, account)]).then(function (b) {
        var el = document.getElementById("otc-bal");
        if (el) el.textContent = show(b[0]) + " AiLGNS · " + show(b[1], 2) + " DAI";
      });
    }

    function createForm() {
      return '<section class="card"><div class="card-head"><h2>发布挂单</h2><span class="muted">币先存进托管合约，成交前随时可撤</span></div>' +
        '<div class="seg" id="otc-side"><button data-side="sell" class="on">我要卖 AiLGNS</button><button data-side="buy">我要买 AiLGNS</button></div>' +
        '<div class="form-grid"><label>数量（AiLGNS）<input id="otc-qty" inputmode="decimal" placeholder="例如 5"></label>' +
        '<label>单价（DAI / 枚）<input id="otc-price" inputmode="decimal" placeholder="例如 800"></label>' +
        '<label>有效期<select id="otc-dur">' + DURATIONS.map(function (d, i) { return '<option value="' + d[0] + '"' + (i === 1 ? " selected" : "") + ">" + d[1] + "</option>"; }).join("") + "</select></label></div>" +
        '<p class="note" id="otc-sum">填好数量和单价后显示总额</p><button id="otc-create" style="padding:12px 22px">发布挂单</button><p class="note" id="otc-st"></p></section>';
    }

    function myOrders(list, now) {
      if (!list.length) return '<section class="card"><div class="card-head"><h2>我的挂单</h2></div><div class="empty">还没有挂单</div></section>';
      return '<section class="card"><div class="card-head"><h2>我的挂单</h2></div><div class="tbl-wrap"><table><thead><tr><th>#</th><th class="l">方向</th><th>单价</th><th>剩余</th><th class="l">状态</th><th></th></tr></thead><tbody>' +
        list.map(function (o) {
          var status = !o.open ? (o.giveLeft === 0n ? "已结束" : "已结束") : o.expiry <= now ? "已过期，等待退回" : "挂单中 · " + left(o.expiry - now);
          var remain = o.sellAilgns ? show(o.giveLeft) + " AiLGNS" : show(o.giveLeft, 2) + " DAI";
          return "<tr><td>" + o.id + '</td><td class="l">' + (o.sellAilgns ? "卖 AiLGNS" : "买 AiLGNS") + "</td><td>" + A.fmt(priceOf(o), 2) + "</td><td>" + remain + '</td><td class="l">' + status + "</td><td>" +
            (o.open ? '<button class="ghost" data-cancel="' + o.id + '" style="padding:6px 12px">' + (o.expiry <= now ? "取回" : "撤单") + "</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div></section>";
    }

    function bind(id, orders, mkt) {
      var st = document.getElementById("otc-st");
      function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; }
      function reload() { if (A.isCurrent(id)) renderOtc(id); }
      var c = document.getElementById("otc-connect");
      if (c) c.onclick = function () { connect().then(reload, function (e) { say(W.error(e), true); }); };

      // 发布挂单
      var side = "sell";
      document.querySelectorAll("#otc-side button").forEach(function (b) {
        b.onclick = function () {
          side = b.getAttribute("data-side");
          document.querySelectorAll("#otc-side button").forEach(function (x) { x.classList.toggle("on", x === b); });
          calc();
        };
      });
      var qty = document.getElementById("otc-qty"), price = document.getElementById("otc-price"), sum = document.getElementById("otc-sum");
      if (mkt) price.placeholder = "市价约 " + mkt.toFixed(2);
      function calc() {
        var q = toWei(qty.value), p = toWei(price.value);
        if (!q || !p) { sum.textContent = "填好数量和单价后显示总额"; return null; }
        var total = (q * p) / WEI;
        var diff = mkt ? (num(p) / mkt - 1) * 100 : null;
        sum.innerHTML = (side === "sell" ? "存入 <b>" + show(q) + " AiLGNS</b>，全部成交后收到 <b>" + show(total, 2) + " DAI</b>" : "存入 <b>" + show(total, 2) + " DAI</b>，全部成交后收到 <b>" + show(q) + " AiLGNS</b>") +
          (diff === null ? "" : '　<span class="' + (diff >= 0 ? "up" : "down") + '">比市价 ' + (diff >= 0 ? "高 " : "低 ") + Math.abs(diff).toFixed(2) + "%</span>") +
          (num(total) > MAX_DAI ? '　<span class="down">超过单笔上限 ' + MAX_DAI + " DAI</span>" : "");
        return { q: q, total: total };
      }
      qty.oninput = calc; price.oninput = calc;
      document.getElementById("otc-create").onclick = function () {
        var btn = this, v = calc();
        if (!v || v.total === 0n) { say("请填写数量和单价", true); return; }
        if (num(v.total) > MAX_DAI) { say("单笔不能超过 " + MAX_DAI + " DAI", true); return; }
        var sell = side === "sell", give = sell ? v.q : v.total, want = sell ? v.total : v.q, token = sell ? AILGNS : DAI;
        var dur = Number(document.getElementById("otc-dur").value);
        btn.disabled = true;
        (account ? W.switchChain(W.get()) : connect()).then(function () {
          return balance(token, account);
        }).then(function (b) {
          if (b < give) throw new Error("余额不足：需要 " + show(give, sell ? 4 : 2) + " " + (sell ? "AiLGNS" : "DAI") + "，钱包里有 " + show(b, sell ? 4 : 2));
          return ensureAllowance(token, give, say, sell ? "AiLGNS" : "DAI");
        }).then(function () {
          return send(OTC, SEL.create + u256(sell ? 1 : 0) + u256(give) + u256(want) + u256(dur), say, "发布挂单");
        }).then(function () {
          say("挂单成功！");
          setTimeout(reload, 1200);
        }, function (e) { say(W.error(e), true); btn.disabled = false; });
      };

      // 撤单 / 取回
      A.app.querySelectorAll("[data-cancel]").forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          W.switchChain(W.get()).then(function () {
            return send(OTC, SEL.cancel + u256(b.getAttribute("data-cancel")), say, "撤单");
          }).then(function () { say("已撤单，币已退回你的钱包"); setTimeout(reload, 1200); }, function (e) { say(W.error(e), true); b.disabled = false; });
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
        '<div class="quote" id="f-quote">输入数量后显示</div><button id="f-go" style="padding:12px 22px;width:100%">确认' + (o.sellAilgns ? "买入" : "卖出") + '</button><p class="note" id="f-st"></p></div>';
      var qty = document.getElementById("f-qty"), quote = document.getElementById("f-quote"), st = document.getElementById("f-st");
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
        (account ? W.switchChain(W.get()) : connect()).then(function () {
          return balance(token, account);
        }).then(function (b) {
          if (b < v.pay) throw new Error("余额不足：需要 " + show(v.pay) + " " + name + "，钱包里有 " + show(b));
          return ensureAllowance(token, v.pay, say, name);
        }).then(function () {
          return send(OTC, SEL.fill + u256(o.id) + u256(v.amount) + u256(v.pay), say, "成交");
        }).then(function () {
          say("成交成功！币已到你的钱包");
          setTimeout(function () { m.hidden = true; reload(); }, 1500);
        }, function (e) { say(W.error(e), true); btn.disabled = false; });
      };
    }
  }

  // ---------- 部署页（只给站长用，不在导航里） ----------
  function renderDeploy(id) {
    var app = A.app;
    app.innerHTML = '<h1>部署托管合约</h1><p class="sub">用你的钱包把 OTC 托管合约部署到 Anubis 链。部署只需要一次，Gas 用 Anubis 链上的 DAI 支付。</p>' +
      '<section class="card"><dl class="dl"><dt>AiLGNS</dt><dd class="mono">' + AILGNS + "</dd><dt>DAI</dt><dd class=\"mono\">" + DAI + "</dd><dt>手续费收款地址</dt><dd class=\"mono\">" + FEE_RECIPIENT +
      "</dd><dt>手续费</dt><dd>1%（合约里写死）</dd><dt>单笔上限</dt><dd>" + MAX_DAI + " DAI（合约里写死）</dd><dt>管理员</dt><dd>无，部署后任何人都改不了</dd></dl>" +
      '<button id="d-go" style="padding:12px 22px;margin-top:16px">连接钱包并部署</button><p class="note" id="d-st"></p></section>';
    var st = document.getElementById("d-st");
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; }
    document.getElementById("d-go").onclick = function () {
      var btn = this;
      btn.disabled = true;
      connect().then(function () {
        return A.getJSON("contracts/AilgnsOtcEscrow.json");
      }).then(function (art) {
        var data = art.bytecode + u256(AILGNS) + u256(DAI) + u256(FEE_RECIPIENT) + u256(BigInt(MAX_DAI) * WEI);
        say("请在钱包里确认部署…");
        return W.get().request({ method: "eth_sendTransaction", params: [{ from: account, data: data }] });
      }).then(function (hash) {
        say("已提交，等待链上确认…");
        return W.waitReceipt(hash);
      }).then(function (r) {
        say('✅ 部署成功！合约地址：<b class="mono">' + r.contractAddress + '</b><br>把这个地址发给我，我把它填进网站就能开放交易。<a target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + r.contractAddress + '">在浏览器查看 ↗</a>');
      }, function (e) { say(W.error(e), true); btn.disabled = false; });
    };
  }

  A.pages.otc = function (id) {
    var sub = location.hash.split("/")[2] || "";
    renderOtc(id, sub);
  };
  A.start();
})();
