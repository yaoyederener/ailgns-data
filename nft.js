// AWAKE NFT 卡牌托管交易（Anubis 链）：卖家把卡存进合约标价，买家付 DAI 时同一笔交易里卡给买家、DAI 给卖家；
// 买家也可以存 DAI 挂「求购任意一张」。手续费为成交价的 3%，买家在成交价之外另付，卖家拿完整标价。
// 复用 otc.js 暴露的 A.otcKit（钱包、发交易、读链、数字格式、市场切换）；otc.js 在市场为 nft 时把渲染交给这里
(function () {
  "use strict";

  var A = window.AIL;
  var SEL = {
    list: "0xca690ea2", bid: "0x25e2ba9e", buy: "0xd6febde8", sellTo: "0xf4b7d249", cancel: "0x40e58ee5", ordersCount: "0x35daa731", getOrders: "0x8f72fc77",
    approve: "0x095ea7b3", getApproved: "0x081812fc", ownerOf: "0x6352211e", balanceOf: "0x70a08231", tokenOfOwnerByIndex: "0x2f745c59"
  };
  var FEE_BPS = 300n, BOOK_SHOW = 5, MAX_CARDS = 60;
  var REASONS = {
    "transfers closed": "官方暂时关闭了这套卡牌的转账，现在不能挂单和成交，请等官方重新开放",
    "transfer locked": "这张卡已装配（锁定），不能转让；换一张没有装配的卡",
    NOT_OWNER: "这张卡不在你的钱包里，请刷新后重试",
    OWN_ORDER: "不能吃自己的挂单；想取消请点「撤单」",
    NOT_SELL_ORDER: "这不是卖单，请刷新", NOT_BID: "这不是求购单，请刷新",
    ZERO_PRICE: "价格不能为 0", NFT_NOT_RECEIVED: "卡没有转进托管合约，交易已回滚",
    "not approved": "还没授权托管合约转这张卡，请先点授权"
  };
  var openBook = {}, timer = null, freshNext = false;

  function fee(p) { return (p * FEE_BPS) / 10000n; }
  function words(h) { var out = []; for (var i = 2; i < h.length; i += 64) out.push(h.slice(i, i + 64)); return out; }
  // getOrders 返回的 Order[]：maker, sell, open, expiry, tokenId, price（每条 6 个字）
  function parseOrders(r, from) {
    if (!r || r === "0x") return [];
    var w = words(r), n = Number(BigInt("0x" + w[1])), list = [];
    for (var i = 0; i < n; i++) {
      var o = w.slice(2 + i * 6, 8 + i * 6);
      list.push({ id: from + i, maker: "0x" + o[0].slice(24), sell: BigInt("0x" + o[1]) === 1n, open: BigInt("0x" + o[2]) === 1n, expiry: Number(BigInt("0x" + o[3])), tokenId: BigInt("0x" + o[4]), price: BigInt("0x" + o[5]) });
    }
    return list;
  }
  function niceError(e) {
    var msg = (e && (e.message || e.reason)) || "";
    for (var k in REASONS) if (msg.indexOf(k) >= 0) return REASONS[k];
    return A.otcKit.niceError(e);
  }
  function dai(v, d) { return A.fmt(Number(v) / 1e18, d === undefined ? 2 : d); }

  // ---------- 读链 ----------
  function K() { return A.otcKit; }
  function readOrders() {
    var k = K();
    return k.read(k.OTC(), SEL.ordersCount).then(function (h) {
      var count = Number(BigInt(h)), from = Math.max(0, count - 1000);
      if (!count) return [];
      return k.read(k.OTC(), SEL.getOrders + k.u256(from) + k.u256(count - from)).then(function (r) { return parseOrders(r, from); });
    });
  }
  function loadBook(fresh) {
    return fetch("/api/book?m=nft" + (fresh ? "&fresh=1" : "")).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.error || !j.orders) throw new Error("book");
      try { localStorage.setItem("otc:book:nft", JSON.stringify(j)); } catch (e) { /* 存不下就算了 */ }
      return parseOrders(j.orders, j.from);
    }).catch(readOrders);
  }
  function savedBook() {
    try { var j = JSON.parse(localStorage.getItem("otc:book:nft") || "null"); return j && j.orders ? parseOrders(j.orders, j.from) : null; } catch (e) { return null; }
  }
  // 钱包里的卡（最多读 MAX_CARDS 张）
  function myCards(who) {
    var k = K(), nft = k.M().token;
    return k.read(nft, SEL.balanceOf + k.u256(who)).then(function (h) {
      var n = Math.min(Number(BigInt(h)), MAX_CARDS), idx = [];
      for (var i = 0; i < n; i++) idx.push(i);
      return A.pool(idx, 6, function (i) { return k.read(nft, SEL.tokenOfOwnerByIndex + k.u256(who) + k.u256(i)).then(BigInt); });
    }).then(function (ids) { return ids.filter(function (x) { return x !== null && x !== undefined; }).sort(function (a, b) { return a < b ? -1 : 1; }); });
  }
  function ensureCardApproval(tokenId, say) {
    var k = K();
    return k.read(k.M().token, SEL.getApproved + k.u256(tokenId)).then(function (h) {
      if ("0x" + h.slice(26).toLowerCase() === k.OTC().toLowerCase()) return;
      return k.send(k.M().token, SEL.approve + k.u256(k.OTC()) + k.u256(tokenId), say, "授权托管合约转这张卡（#" + tokenId + "）");
    });
  }
  function ensureDai(amount, say) {
    var k = K();
    return k.allowance(k.DAI(), k.account()).then(function (a) {
      if (a >= amount) return;
      return k.send(k.DAI(), SEL.approve + k.u256(k.OTC()) + k.u256(amount), say, "授权 " + dai(amount) + " DAI 给托管合约");
    });
  }

  // ---------- 页面 ----------
  function render(id, sub) {
    var k = K(), app = A.app;
    if (timer) { clearInterval(timer); timer = null; }
    if (!k.OTC()) {
      app.innerHTML = k.marketTabs() + '<section class="card" style="text-align:center;padding:36px 18px"><h2>AWAKE NFT 卡牌交易即将上线</h2><p class="muted">托管合约部署完成后开放挂单和交易。</p></section>';
      return;
    }
    var saved = savedBook(), shown = null;
    if (saved) { shown = saved; draw(id, saved); }
    else app.innerHTML = k.marketTabs() + '<div class="loading">正在读取挂单…</div>';
    var fresh = freshNext; freshNext = false;
    Promise.all([loadBook(fresh), k.silentAccount()]).then(function (r) {
      if (!A.isCurrent(id)) return;
      shown = r[0]; draw(id, r[0]);
      timer = setInterval(function () {
        if (!A.isCurrent(id)) { clearInterval(timer); timer = null; return; }
        if (busy()) return;
        loadBook(false).then(function (o) { if (A.isCurrent(id) && !busy()) draw(id, o); }).catch(function () {});
      }, 15000);
    }, function () {
      if (A.isCurrent(id) && shown === null) app.innerHTML = k.marketTabs() + '<div class="card err">挂单读取失败，请稍后刷新。</div>';
    });
    function busy() {
      var m = document.getElementById("otc-modal");
      if (m && !m.hidden) return true;
      return Array.prototype.some.call(app.querySelectorAll("input"), function (i) { return i === document.activeElement || (i.value && i.type !== "hidden"); });
    }
  }

  function draw(id, orders) {
    var k = K(), app = A.app, account = k.account(), now = Date.now() / 1000;
    var live = orders.filter(function (o) { return o.open && o.expiry > now; });
    var sells = live.filter(function (o) { return o.sell; }).sort(function (a, b) { return a.price < b.price ? -1 : a.price > b.price ? 1 : 0; });
    var bids = live.filter(function (o) { return !o.sell; }).sort(function (a, b) { return a.price > b.price ? -1 : a.price < b.price ? 1 : 0; });
    var mine = account ? orders.filter(function (o) { return o.maker === account; }).reverse().slice(0, 30) : [];

    function who(o) { return o.maker === account ? '<b style="color:var(--gold)">我的</b>' : A.short(o.maker); }
    function sellRow(o, i) {
      var act = o.maker === account ? '<button class="ghost act-btn" data-cancel="' + o.id + '">撤单</button>' : '<button class="act-btn btn-buy" data-buy="' + o.id + '">买入</button>';
      return '<tr' + (i >= BOOK_SHOW ? ' class="bk-x"' : "") + '><td class="act">' + act + '</td><td data-l="卡牌" class="mono">#' + o.tokenId + '</td><td data-l="价格 DAI" class="price"><b>' + dai(o.price) + '</b></td>' +
        '<td data-l="买家实付（含 3%）">' + dai(o.price + fee(o.price)) + '</td><td data-l="剩余时间">' + k.left(o.expiry - now) + '</td><td data-l="卖家" class="l mono">' + who(o) + "</td></tr>";
    }
    function bidRow(o, i) {
      var act = o.maker === account ? '<button class="ghost act-btn" data-cancel="' + o.id + '">撤单</button>' : '<button class="act-btn btn-sell" data-sellto="' + o.id + '">卖出</button>';
      return '<tr' + (i >= BOOK_SHOW ? ' class="bk-x"' : "") + '><td class="act">' + act + '</td><td data-l="求购价 DAI（卖家到手）" class="price"><b>' + dai(o.price) + '</b></td><td data-l="求购">任意一张</td>' +
        '<td data-l="剩余时间">' + k.left(o.expiry - now) + '</td><td data-l="求购人" class="l mono">' + who(o) + "</td></tr>";
    }
    function book(key, title, list, hint, head, row) {
      var open = openBook[key], more = list.length - BOOK_SHOW;
      return '<section class="card' + (open ? " bk-open" : "") + '" id="book-' + key + '"><div class="card-head"><h2>' + title + ' <small class="muted book-n">' + list.length + ' 张</small></h2><span class="muted">' + hint + "</span></div>" +
        (list.length ? '<div class="tbl-wrap"><table class="cards book"><thead><tr>' + head + "</tr></thead><tbody>" + list.map(row).join("") + "</tbody></table></div>" +
          (more > 0 ? '<button type="button" class="ghost book-more" data-book="' + key + '">' + (open ? "收起 ▴" : "展开其余 " + more + " 张 ▾") + "</button>" : "") : '<div class="empty">暂无挂单</div>') + "</section>";
    }
    var floor = sells.length ? dai(sells[0].price) : "—", top = bids.length ? dai(bids[0].price) : "—";
    var html = k.marketTabs() +
      '<div class="otc-acts"><button type="button" class="oa-sell" data-goform="sell">＋ 我要卖卡</button><button type="button" class="oa-buy" data-goform="buy">＋ 我要求购</button>' + (account && mine.length ? '<button type="button" class="ghost" data-gomine>我的挂单</button>' : "") + "</div>" +
      '<div class="otc-top"><span class="hp-tag">🎁 交易就送会员</span><span class="ot-txt"><b>价格自由定，没有最低限制</b> · 当前最低卖价 <b>' + floor + '</b> · 最高求购 <b>' + top + '</b> DAI · 单笔成交满 50 DAI 送<b>初级 VIP</b>，累计满 <b>1 万 DAI</b> 送<b>高级 VIP</b></span>' +
      (account ? '<span class="ot-w mono">' + A.short(account) + "</span>" : '<button class="ot-c" id="otc-top-c">' + (A.wallets && !window.ethereum && /Android|iPhone|iPad/i.test(navigator.userAgent) ? "在钱包 App 里打开" : "连接钱包") + "</button>") + "</div>";
    html += book("sells", "在售卡牌", sells, "价格从低到高 · 买家另付 3% 手续费", '<th class="l">操作</th><th>卡牌</th><th>价格 DAI</th><th>买家实付</th><th>剩余时间</th><th class="l">卖家</th>', sellRow);
    html += book("bids", "求购", bids, "价格从高到低 · 卖家拿到完整求购价", '<th class="l">操作</th><th>求购价 DAI</th><th>求购</th><th>剩余时间</th><th class="l">求购人</th>', bidRow);
    html += form(k);
    if (account) html += myOrders(mine, now);
    html += '<div class="kpis kpis-2"><div class="kpi"><div class="k">托管合约</div><div class="v" style="font-size:16px"><a class="mono" target="_blank" rel="noopener" href="' + k.EXPLORER() + "/address/" + k.OTC() + '">' + A.short(k.OTC()) + ' ↗</a></div><div class="d"><a target="_blank" rel="noopener" href="https://github.com/yaoyederener/ailgns-data/blob/main/contracts/AwakeNftEscrow.sol">开源源码 ↗</a> · <a target="_blank" rel="noopener" href="https://github.com/yaoyederener/ailgns-data/blob/main/contracts/VERIFY.md">编译参数与核对 ↗</a></div></div>' +
      '<div class="kpi"><div class="k">卡牌合约</div><div class="v" style="font-size:16px"><a class="mono" target="_blank" rel="noopener" href="' + k.EXPLORER() + "/token/" + k.M().token + '">' + A.short(k.M().token) + ' ↗</a></div><div class="d">Awake Governance NFT（AWAKE NFT）· 官方合约</div></div></div>';
    html += '<p class="note">🎁 成交后到「会员」页填这个钱包地址点「查询」，会员就能用。</p>';
    html += '<p class="note">成交手续费为成交价的 3%，由买家在成交价之外另付，卖家拿到完整标价；挂单、撤单、到期退回都不收费。卡牌合约由官方控制：已装配（锁定）的卡不能挂单；官方关闭转账期间，托管中的卡要等重新开放才能取回或成交。本站只提供链上托管撮合，价格由买卖双方自行决定。智能合约未经第三方审计，请先小额试用。</p>';
    html += '<div class="modal" id="otc-modal" hidden></div>';
    app.innerHTML = html;
    bind(id, orders);
  }

  function myOrders(list, now) {
    if (!list.length) return "";
    return '<section class="card" id="otc-mine"><div class="card-head"><h2>我的挂单</h2></div><div class="tbl-wrap"><table class="cards"><thead><tr><th>#</th><th class="l">类型</th><th>卡牌</th><th>价格 DAI</th><th class="l">状态</th><th></th></tr></thead><tbody>' +
      list.map(function (o) {
        var st = !o.open ? (o.tokenId && !o.sell ? "已成交" : o.sell && o.expiry < now ? "已成交 / 已退回" : "已关闭") : o.expiry <= now ? "已过期（待退回）" : "挂单中，" + A.timeBJ(o.expiry * 1000) + " 到期（北京时间）";
        return "<tr><td data-l=\"#\">" + o.id + '</td><td data-l="类型" class="l">' + (o.sell ? "卖卡" : "求购") + '</td><td data-l="卡牌" class="mono">' + (o.tokenId ? "#" + o.tokenId : "任意一张") + '</td><td data-l="价格 DAI">' + dai(o.price) + '</td><td data-l="状态" class="l">' + st + '</td><td class="act">' +
          (o.open ? '<button class="ghost act-btn" data-cancel="' + o.id + '">' + (o.expiry <= now ? "取回" : "撤单") + "</button>" : "") + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  function form(k) {
    return '<section class="card" id="otc-form"><div class="card-head"><h2>发布挂单</h2><span class="muted">卡或 DAI 先存进托管合约，成交前随时可撤</span></div>' +
      '<div class="seg" id="otc-side"><button data-side="sell" class="on">我要卖卡</button><button data-side="buy">我要求购</button></div>' +
      '<div id="nft-cards" class="nft-cards"></div>' +
      '<div class="form-grid"><label>价格（DAI / 张）<input id="nft-price" inputmode="decimal" placeholder="例如 500"></label></div>' +
      '<div class="dur"><span class="dur-t">有效期 <small class="muted">到期没成交，自动退回</small></span><input type="hidden" id="otc-dur" value="' + k.DUR_DEFAULT + '">' +
      '<div class="dur-opts" id="otc-durs">' + k.DURATIONS.map(function (d) { return '<button type="button" data-d="' + d[0] + '"' + (d[0] === k.DUR_DEFAULT ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") + "</div></div>" +
      '<p class="note" id="otc-sum">选一张卡、填好价格后显示明细</p><div id="dbx-slot"></div><button id="otc-create" style="padding:12px 22px">发布挂单</button><p class="note" id="otc-st"></p></section>';
  }

  function bind(id, orders) {
    var k = K(), app = A.app, side = "sell", cards = null, picked = null;
    var price = document.getElementById("nft-price"), sum = document.getElementById("otc-sum"), st = document.getElementById("otc-st"), cardsEl = document.getElementById("nft-cards");
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; }
    function reload() { if (A.isCurrent(id)) { freshNext = true; render(id); } }
    var tc = document.getElementById("otc-top-c");
    if (tc) tc.onclick = function () { k.connect().then(reload, function (e) { say(niceError(e), true); }); };
    app.querySelectorAll(".book-more").forEach(function (b) {
      b.onclick = function () {
        var key = b.getAttribute("data-book"), sec = b.closest("section"), n = sec.querySelectorAll("tr.bk-x").length;
        openBook[key] = !openBook[key];
        sec.classList.toggle("bk-open", openBook[key]);
        b.textContent = openBook[key] ? "收起 ▴" : "展开其余 " + n + " 张 ▾";
        if (!openBook[key]) sec.scrollIntoView({ block: "start" });
      };
    });
    app.querySelectorAll("[data-goform]").forEach(function (b) {
      b.onclick = function () {
        var sd = b.getAttribute("data-goform"), t = document.querySelector('#otc-side [data-side="' + sd + '"]');
        if (t) t.click();
        var f = document.getElementById("otc-form");
        f.scrollIntoView({ behavior: "smooth", block: "start" });
        f.classList.remove("flash", "flash-sell", "flash-buy"); void f.offsetWidth; f.classList.add("flash", "flash-" + sd);
      };
    });
    var gm = app.querySelector("[data-gomine]");
    if (gm) gm.onclick = function () { var x = document.getElementById("otc-mine"); if (x) x.scrollIntoView({ behavior: "smooth", block: "start" }); };

    // 卖卡：先列出钱包里的卡
    function showCards() {
      if (side !== "sell") { cardsEl.innerHTML = ""; return; }
      if (!k.account()) { cardsEl.innerHTML = '<span class="muted">选择要卖的卡：</span><a href="#" id="nft-c">连接钱包后显示</a>'; document.getElementById("nft-c").onclick = function (e) { e.preventDefault(); k.connect().then(function () { cards = null; showCards(); }, function (x) { say(niceError(x), true); }); }; return; }
      if (cards === null) {
        cardsEl.innerHTML = '<span class="muted">正在读取钱包里的卡…</span>';
        myCards(k.account()).then(function (c) { cards = c; showCards(); }, function () { cardsEl.innerHTML = '<span class="down">读取卡牌失败，请刷新</span>'; });
        return;
      }
      if (!cards.length) { cardsEl.innerHTML = '<span class="muted">这个钱包里没有 AWAKE NFT 卡牌</span>'; return; }
      cardsEl.innerHTML = '<span class="muted">选择要卖的卡（' + cards.length + " 张）：</span>" + cards.map(function (c) { return '<button type="button" class="nft-chip' + (picked === c ? " on" : "") + '" data-card="' + c + '">#' + c + "</button>"; }).join("") +
        '<small class="muted">已装配（锁定）的卡挂单时会被合约拒绝</small>';
      cardsEl.querySelectorAll("[data-card]").forEach(function (b) { b.onclick = function () { picked = BigInt(b.getAttribute("data-card")); showCards(); calc(); }; });
    }
    function calc() {
      var p = k.toWei(price.value);
      if (!p || p <= 0n) { sum.textContent = side === "sell" ? "选一张卡、填好价格后显示明细" : "填好求购价后显示明细"; return null; }
      var f = fee(p);
      sum.innerHTML = side === "sell"
        ? (picked === null ? "还没选卡 · " : "卖出 <b>#" + picked + "</b> · ") + "标价 <b>" + dai(p) + " DAI</b>，买家实付 " + dai(p + f) + " DAI（含 3% 手续费），你到手 <b>" + dai(p) + " DAI</b>"
        : "求购任意一张，出价 <b>" + dai(p) + " DAI</b>；需存入 <b>" + dai(p + f) + " DAI</b>（含 3% 手续费 " + dai(f) + "），成交后卖家拿 " + dai(p) + "，没成交撤单全额退回";
      return { p: p, f: f };
    }
    price.oninput = calc;
    document.querySelectorAll("#otc-side button").forEach(function (b) {
      b.onclick = function () {
        side = b.getAttribute("data-side");
        document.querySelectorAll("#otc-side button").forEach(function (x) { x.classList.toggle("on", x === b); });
        document.getElementById("otc-create").textContent = side === "sell" ? "发布卖单" : "发布求购";
        showCards(); calc();
      };
    });
    document.querySelectorAll("#otc-durs button").forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll("#otc-durs button").forEach(function (x) { x.classList.toggle("on", x === b); });
        document.getElementById("otc-dur").value = b.getAttribute("data-d");
      };
    });
    showCards();
    document.getElementById("otc-create").onclick = function () {
      var btn = this, v = calc(), dur = Number(document.getElementById("otc-dur").value);
      if (!v) { say("请填写价格", true); return; }
      if (side === "sell" && picked === null) { say("请先选一张要卖的卡", true); return; }
      btn.disabled = true;
      k.ready().then(function () {
        if (side === "sell") return ensureCardApproval(picked, say).then(function () { return k.send(k.OTC(), SEL.list + k.u256(picked) + k.u256(v.p) + k.u256(dur), say, "发布卖单 #" + picked); });
        return ensureDai(v.p + v.f, say).then(function () { return k.send(k.OTC(), SEL.bid + k.u256(v.p) + k.u256(dur), say, "发布求购 " + dai(v.p) + " DAI"); });
      }).then(function () { say("✅ 挂单成功！成交后到「会员」页填钱包地址点「查询」领会员"); A.track && A.track("q_nft"); setTimeout(reload, 1500); })
        .catch(function (e) { say(niceError(e), true); btn.disabled = false; });
    };

    // 撤单 / 取回
    app.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        k.ready().then(function () { return k.send(k.OTC(), SEL.cancel + k.u256(b.getAttribute("data-cancel")), say, "撤单"); }).then(function () { say("✅ 已退回"); reload(); }, function (e) { say(niceError(e), true); b.disabled = false; });
      };
    });
    // 买入
    var modal = document.getElementById("otc-modal");
    function closeModal() { modal.hidden = true; modal.innerHTML = ""; }
    app.querySelectorAll("[data-buy]").forEach(function (b) {
      b.onclick = function () {
        var o = orders.filter(function (x) { return x.id === Number(b.getAttribute("data-buy")); })[0];
        if (!o) return;
        var total = o.price + fee(o.price);
        modal.innerHTML = '<div class="modal-box"><div class="card-head"><h2>买入 AWAKE NFT #' + o.tokenId + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
          '<dl class="dl"><dt>价格</dt><dd>' + dai(o.price) + ' DAI</dd><dt>手续费 3%</dt><dd>' + dai(fee(o.price)) + ' DAI</dd><dt>实付</dt><dd><b>' + dai(total) + ' DAI</b></dd><dt>卖家</dt><dd class="mono">' + A.short(o.maker) + "</dd></dl>" +
          '<p class="note">付款和收卡在同一笔交易里完成；卡直接到你的钱包。</p><button id="m-go" style="padding:12px 22px">确认买入</button><p class="note" id="m-st"></p></div>';
        modal.hidden = false;
        var ms = document.getElementById("m-st");
        function msay(t, bad) { ms.className = "note" + (bad ? " down" : ""); ms.innerHTML = t; }
        modal.querySelector("[data-close]").onclick = closeModal;
        document.getElementById("m-go").onclick = function () {
          var btn = this; btn.disabled = true;
          k.ready().then(function () { return k.balance(k.DAI(), k.account()); }).then(function (bal) {
            if (bal < total) throw new Error("DAI 不够：需要 " + dai(total) + "，钱包里只有 " + dai(bal));
            return ensureDai(total, msay);
          }).then(function () { return k.send(k.OTC(), SEL.buy + k.u256(o.id) + k.u256(total), msay, "买入 #" + o.tokenId); })
            .then(function () { msay("✅ 成交！卡已到你的钱包。到「会员」页填这个地址点「查询」领会员"); A.track && A.track("q_nft"); setTimeout(function () { closeModal(); reload(); }, 2500); })
            .catch(function (e) { msay(niceError(e), true); btn.disabled = false; });
        };
      };
    });
    // 卖给求购单
    app.querySelectorAll("[data-sellto]").forEach(function (b) {
      b.onclick = function () {
        var o = orders.filter(function (x) { return x.id === Number(b.getAttribute("data-sellto")); })[0];
        if (!o) return;
        var sel = null;
        modal.innerHTML = '<div class="modal-box"><div class="card-head"><h2>卖一张卡给求购单</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
          '<dl class="dl"><dt>你到手</dt><dd><b>' + dai(o.price) + ' DAI</b></dd><dt>求购人</dt><dd class="mono">' + A.short(o.maker) + '</dd></dl><div id="m-cards" class="nft-cards"><span class="muted">正在读取钱包里的卡…</span></div>' +
          '<button id="m-go" style="padding:12px 22px" disabled>确认卖出</button><p class="note" id="m-st"></p></div>';
        modal.hidden = false;
        var ms = document.getElementById("m-st"), mc = document.getElementById("m-cards"), go = document.getElementById("m-go");
        function msay(t, bad) { ms.className = "note" + (bad ? " down" : ""); ms.innerHTML = t; }
        modal.querySelector("[data-close]").onclick = closeModal;
        k.ready().then(function () { return myCards(k.account()); }).then(function (c) {
          if (!c.length) { mc.innerHTML = '<span class="muted">这个钱包里没有 AWAKE NFT 卡牌</span>'; return; }
          function drawCards() {
            mc.innerHTML = '<span class="muted">选一张卡：</span>' + c.map(function (x) { return '<button type="button" class="nft-chip' + (sel === x ? " on" : "") + '" data-card="' + x + '">#' + x + "</button>"; }).join("");
            mc.querySelectorAll("[data-card]").forEach(function (x) { x.onclick = function () { sel = BigInt(x.getAttribute("data-card")); go.disabled = false; drawCards(); }; });
          }
          drawCards();
        }, function (e) { msay(niceError(e), true); });
        go.onclick = function () {
          go.disabled = true;
          ensureCardApproval(sel, msay).then(function () { return k.send(k.OTC(), SEL.sellTo + k.u256(o.id) + k.u256(sel) + k.u256(o.price), msay, "卖出 #" + sel); })
            .then(function () { msay("✅ 成交！" + dai(o.price) + " DAI 已到你的钱包"); A.track && A.track("q_nft"); setTimeout(function () { closeModal(); reload(); }, 2500); })
            .catch(function (e) { msay(niceError(e), true); go.disabled = false; });
        };
      };
    });
  }

  A.nft = { render: render };
})();
