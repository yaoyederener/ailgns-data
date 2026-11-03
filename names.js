// .ailgns 域名：注册 xxx.ailgns、绑定地址、设主名字、查名字（合约 contracts/AilgnsNames.sol，按名字长度定价）
// 收费全部直接进回购分账合约；合约没部署前 NAMES 留空，页面只能看价格、不能注册（预览）
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  // 两个后缀各一个合约（同一份规则）；网址 #/names/xxx.lgns 打开 .lgns，默认 .ailgns
  var CONTRACTS = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", lgns: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3" }; // 第 3 版（中文价格、DAI/LGNS/AiLGNS 付款、最多 100 年），Anubis 区块 18161697 / 18161710
  var TLD = "ailgns", NAMES = CONTRACTS.ailgns;
  // 域名市场：AWAKE NFT 托管合约同一份代码，各后缀一份；卖家把名字存进合约标价，买家付 DAI 同一笔交易里拿到名字，手续费 3% 买家另付，进回购分账合约
  var START = { ailgns: 18161697, lgns: 18161710 }; // 合约部署区块，从这里开始读链上记录
  var GENESIS = 10000; // 前 1 万个付费注册的名字是「创世域名」，按链上注册顺序编号
  var T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a", T_FILL = "0xdef4cdb91e8c5e2777b0bf9645ce2c7e0b64a3b3fb94e37c6d78cde1043f80cb";
  var OTC = { ailgns: "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e", lgns: "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d" }; // Anubis 区块 18161704 / 18161717
  var DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14";
  var ZERO = "0x" + "0".repeat(40);
  var SEL = { available: "0xaeb8ce9b", register: "0xd868a84f", renew: "0x26e43e37", quote: "0x13b0be33", resolve: "0x461a4478", nameOf: "0xf5c57382", idOf: "0x5fd846f2", expires: "0xcb52c823", ownerOf: "0x6352211e", setPrimary: "0x38e74feb", setAddr: "0xeba36dbd", labelOf: "0x36bf1f0c", oList: "0xca690ea2", oBuy: "0xd6febde8", oCancel: "0x40e58ee5", oCount: "0x35daa731", oGet: "0x8f72fc77", getApproved: "0x081812fc", nftApprove: "0x095ea7b3", allowance: "0xdd62ed3e", approve: "0x095ea7b3" };

  // 和合约一致：a-z、0-9、-、常用汉字（4E00–9FFF），中文一个字算 1 个字符；英文最少 3 个，带汉字最少 2 个，最多 32 个
  function chars(s) { return Array.from(s).length; }
  function valid(s) { var n = chars(s); return /^[a-z0-9\u4e00-\u9fff-]+$/.test(s) && n >= (cn(s) ? 2 : 3) && n <= 32 && s[0] !== "-" && s[s.length - 1] !== "-"; }
  function cn(s) { return /[\u4e00-\u9fff]/.test(s); }
  // 带汉字：2 个字 50、3 个字及以上 5；英文：3 位 640、4 位 160、5 位及以上 5（DAI / 年）
  function yearPrice(s) { var n = chars(s); return cn(s) ? (n === 2 ? 50 : 5) : n === 3 ? 640 : n === 4 ? 160 : 5; }
  // 付款币种：AiLGNS 优先，再 DAI、LGNS（合约按 DEX 实时价格换算）
  // LGNS：合约按 DEX 现价收，但 LGNS 在 DEX 卖出要扣税（动态，约 50%），平台收到的只值一部分。
  // 合约写死改不了，所以用 LGNS 付时先单独补一笔「卖出税差价」给分账合约（PAYEE），再注册：总共付 合约报价 ÷ (1 − 税率)
  var TOK = { AiLGNS: { a: "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", d: 18 }, DAI: { a: DAI, d: 18 }, LGNS: { a: "0x4d1d808a081fdac440703b3765fc61f8028c06b8", d: 9 } };
  var PAYEE = "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3"; // 域名合约的收款地址（回购分账合约）
  var taxP = null;
  function lgnsTax() { // 现在 LGNS 在 DEX 卖出扣多少（万分比）；测不到按 50%
    if (!taxP) taxP = fetch("/api/sell-tax").then(function (r) { return r.json(); }).then(function (j) { var t = j && j.lgns; return t > 0.03 && t < 0.9 ? t : 0.5; }, function () { return 0.5; })
      .then(function (t) { return BigInt(Math.round(t * 10000)); });
    return taxP;
  }
  function topUp(q) { return lgnsTax().then(function (bp) { return q * bp / (10000n - bp); }); } // 合约收 q 个 LGNS 时要补的差价
  function tokSel(id) { return '<select id="' + id + '">' + Object.keys(TOK).map(function (k) { return "<option>" + k + "</option>"; }).join("") + "</select>"; }
  function fmt(x, d) { var v = Number(x) / Math.pow(10, d); return v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4); }
  function quote(dai, k) { // dai 个 DAI 用 k 币要付多少（最小单位）
    var wei = BigInt(dai) * 10n ** 18n;
    if (k === "DAI") return Promise.resolve(wei);
    return call(SEL.quote + u256(wei) + A.pad(TOK[k].a)).then(function (r) { return BigInt(r); });
  }
  // 授权并返回付款参数：最多多付 2%，防止付款时币价小幅变动导致失败
  function prepay(dai, k, say) {
    var t = TOK[k], max;
    return quote(dai, k).then(function (q) {
      if (k !== "LGNS") return q;
      // LGNS：先把卖出税差价转给收款的分账合约，再注册（先补后注册，注册没完成的差价联系客服退回）
      return topUp(q).then(function (e) {
        return W.rpcOn("anubis", "eth_call", [{ to: t.a, data: "0x70a08231" + A.pad(account) }, "latest"]).then(function (b) {
          if (BigInt(b) < q * 102n / 100n + e) throw new Error("LGNS 不够：一共要约 " + fmt(q + e, 9) + " LGNS（含 DEX 卖出税补差），你的钱包只有 " + fmt(BigInt(b), 9));
          return tx(t.a, "0xa9059cbb" + A.pad(PAYEE) + u256(e), say, "💸 补 DEX 卖出税差价 " + fmt(e, 9) + " LGNS（LGNS 在 DEX 卖出要扣税，这部分补给平台；转进回购分账合约）。请在钱包确认");
        }).then(function () { return q; });
      });
    }).then(function (q) {
      max = q * 102n / 100n;
      return W.rpcOn("anubis", "eth_call", [{ to: t.a, data: SEL.allowance + A.pad(account) + A.pad(NAMES) }, "latest"]);
    }).then(function (a) {
      if (BigInt(a) >= max) return;
      return tx(t.a, SEL.approve + A.pad(NAMES) + u256(max), say, "🔒 第 1 步：授权域名合约收 " + fmt(max, t.d) + " " + k + "（只收这一次的钱，合约开源、无管理员）。请在钱包确认");
    }).then(function () { return A.pad(t.a) + u256(max); });
  }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function str(s) { // ABI 编码 string 的尾部：长度 + 内容补齐 32 字节
    var h = Array.prototype.map.call(new TextEncoder().encode(s), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    return u256(h.length / 2) + h.padEnd(Math.ceil(h.length / 64) * 64, "0");
  }
  function call(data) { return W.rpcOn("anubis", "eth_call", [{ to: NAMES, data: data }, "latest"]); }
  function word(r, i) { return r.slice(2 + i * 64, 66 + i * 64); }
  function addrOf(r) { return "0x" + word(r, 0).slice(24); }
  function decStr(r) {
    var off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2);
    return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map(function (x) { return parseInt(x, 16); })));
  }
  var infoCache = {};
  function info(label) { // 能否注册、指向谁、主人、到期时间（同一个名字 20 秒内不重复查链）
    var key = TLD + ":" + label, c = infoCache[key];
    if (c && Date.now() - c.t < 20000) return c.p;
    var p = info1(label);
    infoCache[key] = { t: Date.now(), p: p };
    p.catch(function () { delete infoCache[key]; });
    return p;
  }
  function info1(label) {
    var s = "0000000000000000000000000000000000000000000000000000000000000020" + str(label);
    return Promise.all([call(SEL.available + s), call(SEL.resolve + s), call(SEL.idOf + s)]).then(function (r) {
      var id = word(r[2], 0);
      if (BigInt("0x" + word(r[0], 0)) === 1n) return { free: true, addr: addrOf(r[1]), id: id, exp: 0, owner: null }; // 能注册：不用再查主人、到期，直接出结果
      return Promise.all([call(SEL.expires + id), call(SEL.ownerOf + id).catch(function () { return null; })]).then(function (x) {
        return { free: BigInt("0x" + word(r[0], 0)) === 1n, addr: addrOf(r[1]), id: id, exp: Number(BigInt("0x" + word(x[0], 0))), owner: x[1] ? addrOf(x[1]) : null };
      });
    });
  }
  function date(t) { var d = new Date(t * 1000); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // 连钱包 → 切到 Anubis → 发交易 → 等确认
  var eth, account;
  function connect() {
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); })
      .then(function (a) { account = String(a[0]).toLowerCase(); return W.switchTo(eth, "anubis"); }).then(function () { return account; });
  }
  function tx(to, data, say, msg) {
    // 页面打开时只是静默认出了钱包地址，真要发交易时再正式连接钱包、切到 Anubis
    return (eth ? Promise.resolve() : connect()).then(function () {
      say(msg);
      return W.rpcOn("anubis", "eth_call", [{ from: account, to: to, data: data }, "latest"]).catch(function (e) { throw new Error(e && /PAY_FAILED|transfer/i.test(e.message) ? "DAI 不够（还要一点 DAI 付 Gas）" : "交易会失败：" + ((e && e.message) || "请检查名字和余额")); })
      .then(function () { return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: to, data: data }] }); });
    })
      .then(function (h) { say("已提交，等待链上确认…"); return W.waitOn("anubis", h).then(function () { return h; }); });
  }
  function register(label, years, k, say) {
    return connect().then(function () { return prepay(yearPrice(label) * years, k, say); }).then(function (p) {
      var data = SEL.register + u256(0xa0) + A.pad(account) + u256(years) + p + str(label);
      return tx(NAMES, data, say, "🔒 第 2 步：注册 " + label + "." + TLD + " 给你自己的地址。请在钱包确认");
    });
  }

  function page(rid, arg) {
    // 路由只保留 0x 地址参数，名字自己从网址里取
    var q = decodeURIComponent(location.hash.split("/")[2] || "").toLowerCase(), m = q.match(/\.(ailgns|lgns)$/);
    if (q === "otc") q = ""; // #/names/otc 是菜单「域名 OTC」，不是搜「otc」这个名字
    TLD = m ? m[1] : "ailgns";
    NAMES = CONTRACTS[TLD];
    q = q.replace(/\.(ailgns|lgns)$/, "");
    A.app.innerHTML =
      '<section class="card nm-hero"><h2>🌐 .ailgns / .lgns 域名</h2><p class="muted">把一长串 0x 地址换成好记的名字：转账、收款报 <b>xxx.ailgns</b> 就行。</p><div id="nm-genc"></div>' +
      '<ol class="nm-steps" id="nm-steps"><li data-s="1"><b>1</b>注册名字</li><li data-s="2"><b>2</b>设为主名字</li><li data-s="3"><b>3</b>OTC 出售</li></ol>' +
      '<form class="nm-search" id="nm-f"><input id="nm-q" placeholder="输入想要的名字，中文英文都行" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(q) + '"><select id="nm-t"><option value="ailgns">.ailgns</option><option value="lgns">.lgns</option></select><button type="submit">搜索</button></form>' +
      '<div id="nm-r"></div></section>' +
      '<section class="card"><div class="card-head"><h2>💰 价格（每年，DAI）</h2><span class="muted">按名字长度定价</span></div>' +
      '<p class="nm-pt">英文</p><div class="nm-price"><div><b>3 位</b><span>640 DAI</span><small class="nm-q" data-dai="640"></small></div><div><b>4 位</b><span>160 DAI</span><small class="nm-q" data-dai="160"></small></div><div><b>5 位及以上</b><span>5 DAI</span><small class="nm-q" data-dai="5"></small></div></div>' +
      '<p class="nm-pt">中文</p><div class="nm-price nm-p2"><div><b>2 个字</b><span>50 DAI</span><small class="nm-q" data-dai="50"></small></div><div><b>3 个字及以上</b><span>5 DAI</span><small class="nm-q" data-dai="5"></small></div></div>' +
      '<p class="muted">可以用 <b>AiLGNS、DAI、LGNS</b> 付（Anubis 链）。AiLGNS 按 DEX 实时价格换算，<b>不经过 DEX、没有滑点</b>，比先卖成 DAI 再付划算。<span id="nm-px"></span></p>' +
      '<ul class="nm-rules"><li>可以用<b>中文</b>、小写字母、数字、连字符 -；英文最少 3 位，中文最少 2 个字</li><li>一次买 1–100 年（买 100 年相当于永久）；到期后有 <b>90 天宽限期</b>，只有原主人能续费</li><li>🌟 前 1 万个注册的名字是<b>创世域名</b>，按链上注册顺序永久编号</li><li>每个名字是一个 NFT，可以转让、买卖；转让后自动指向新主人</li><li>🔒 合约开源、无管理员、不能升级，平台也收不走你的名字</li></ul></section>' +
      '<section class="card"><div class="card-head"><h2>🛒 域名市场</h2><span class="muted">一手交钱一手交名字 · 手续费 3% 买家付</span></div><div id="nm-mk"></div></section>' +
      '<section class="card"><div class="card-head"><h2>🏆 成交排行</h2><span class="muted">链上真实成交</span></div><div id="nm-rank"></div></section>' +
      '<section class="card"><div class="card-head"><h2>🔍 反查：这个地址叫什么</h2></div><form class="nm-search" id="nm-rf"><input id="nm-ra" placeholder="0x 地址" autocomplete="off" spellcheck="false"><button type="submit">查询</button></form><div id="nm-rr"></div></section>';
    document.getElementById("nm-t").value = TLD;
    var f = document.getElementById("nm-f"), inp = document.getElementById("nm-q"), out = document.getElementById("nm-r");
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = inp.value.trim().toLowerCase().replace(/\.(ailgns|lgns)$/, ""), t = document.getElementById("nm-t").value;
      if (t !== TLD) { location.hash = "#/names/" + encodeURIComponent(v) + "." + t; return; } // 换后缀：整页换成另一个合约
      // 同一个后缀：只换地址栏、不重新加载整页（以前每搜一次整页的市场、排行都重新读链，很慢）
      if (v !== q) { q = v; try { history.replaceState(null, "", "#/names/" + encodeURIComponent(v) + "." + t); } catch (x) { /* 忽略 */ } }
      show(v);
    };
    // 边打字边查：停顿 0.4 秒就先去链上查，按「搜索」时结果多半已经好了
    var typing;
    inp.oninput = function () {
      var v = inp.value.toLowerCase(); if (v !== inp.value) inp.value = v;
      clearTimeout(typing);
      v = v.trim().replace(/\.(ailgns|lgns)$/, "");
      if (NAMES && valid(v)) typing = setTimeout(function () { info(v).catch(function () {}); }, 400);
    };
    document.getElementById("nm-rf").onsubmit = function (e) {
      e.preventDefault();
      var a = document.getElementById("nm-ra").value.trim().toLowerCase(), o = document.getElementById("nm-rr");
      if (!/^0x[0-9a-f]{40}$/.test(a)) { A.errTip("请输入正确的 0x 地址", e.target); return; }
      if (!NAMES) { o.innerHTML = '<p class="muted">合约还没上线（预览）</p>'; return; }
      o.innerHTML = '<p class="muted">查询中…</p>';
      call(SEL.nameOf + A.pad(a)).then(function (r) { var n = decStr(r); o.innerHTML = n ? '<p class="nm-ok">这个地址的主名字：<b>' + esc(n) + "." + TLD + "</b></p>" : '<p class="muted">这个地址还没设主名字</p>'; }, function () { o.innerHTML = '<p class="muted">查询失败，请稍后再试</p>'; });
    };

    function show(v) {
      if (!v) { out.innerHTML = ""; return; }
      if (!valid(v)) { out.innerHTML = '<p class="nm-bad">「' + esc(v) + '」不能用：可以用中文、小写字母、数字、-；英文最少 3 位，中文最少 2 个字，最多 32 个字，不能以 - 开头或结尾</p>'; return; }
      var buy = '<div class="nm-buy"><label>买几年 <select id="nm-y">' + [1, 2, 3, 5, 10, 100].map(function (y) { return '<option value="' + y + '">' + y + " 年</option>"; }).join("") + '</select></label><label>付款 ' + tokSel("nm-k") + '</label><b id="nm-cost">' + yearPrice(v) + ' DAI</b></div>' +
        '<button type="button" class="nm-go" id="nm-go">注册 ' + esc(v) + "." + TLD + "</button><p class=\"muted nm-st\" id=\"nm-st\"></p>";
      if (!NAMES) {
        out.innerHTML = '<p class="nm-ok"><b>' + esc(v) + "." + TLD + '</b> 名字合规，' + yearPrice(v) + " DAI / 年</p>" + buy;
        bindBuy(v, true);
        return;
      }
      out.innerHTML = '<p class="muted">查询中…</p>';
      info(v).then(function (r) {
        if (r.free) { stepTo(1); out.innerHTML = '<p class="nm-ok">🎉 <b>' + esc(v) + "." + TLD + "</b> 可以注册！</p>" + buy; bindBuy(v); return; }
        var mine = account && r.owner === account, now = Date.now() / 1000;
        var anon = !mine && (PROTECT[r.owner] || PROTECT[r.addr]); // 匿名持有人：不显示地址
        out.innerHTML = '<p class="nm-bad"><b>' + esc(v) + "." + TLD + "</b> 已被注册</p>" +
          '<dl class="nm-dl"><dt>指向地址</dt><dd class="mono">' + (anon ? "🔒 匿名" : r.addr !== ZERO ? r.addr : "—") + "</dd><dt>主人</dt><dd class=\"mono\">" + (anon ? "🔒 匿名持有人" : r.owner || "已过期（宽限期中）") + "</dd><dt>到期</dt><dd>" + date(r.exp) + (r.exp < now ? "（宽限期到 " + date(r.exp + 90 * 86400) + "）" : "") + "</dd></dl>" +
          '<p class="nm-gen" id="nm-gen"></p>' + (mine ? '<div id="nm-next"></div>' : anon ? "" : '<a class="nm-scan" href="#/scan/' + encodeURIComponent(v + "." + TLD) + '">🔎 链上查询这个名字 →</a>') + '<div class="nm-act"><label class="nm-rk">用 ' + tokSel("nm-rk") + ' 付</label><button type="button" id="nm-renew">续费 1 年（' + yearPrice(v) + " DAI，谁都能帮续）</button>" + (mine ? '<button type="button" id="nm-set">改指向地址</button>' + (OTC[TLD] ? '<button type="button" id="nm-sell">挂到市场卖</button>' : "") : "") + '</div><p class="muted nm-st" id="nm-st"></p>';
        var st = document.getElementById("nm-st"), say = function (t) { st.textContent = t; };
        if (!PROTECT[r.owner] || mine) genesis().then(function (g) { var e = document.getElementById("nm-gen"); if (e && g[r.id]) e.textContent = "🌟 创世域名 #" + g[r.id]; }, function () {});
        document.getElementById("nm-renew").onclick = function () {
          var k = document.getElementById("nm-rk").value;
          connect().then(function () { return prepay(yearPrice(v), k, say); })
            .then(function (p) { return tx(NAMES, SEL.renew + u256(0x80) + u256(1) + p + str(v), say, "🔒 第 2 步：续费 1 年。请在钱包确认"); })
            .then(function () { say("✅ 续费成功"); show(v); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
        };
        if (!mine) { stepTo(1); return; }
        guide(document.getElementById("nm-next"), v, r);
        document.getElementById("nm-set").onclick = function () {
          var a = (prompt("让 " + v + "." + TLD + " 指向哪个地址？", account) || "").trim().toLowerCase();
          if (!a) return;
          if (!/^0x[0-9a-f]{40}$/.test(a)) { A.errTip("地址格式不对", st); return; }
          tx(NAMES, SEL.setAddr + r.id + A.pad(a), say, "🔒 修改指向地址。请在钱包确认").then(function () { say("✅ 已修改"); show(v); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
        };
        var sell = document.getElementById("nm-sell");
        if (sell) sell.onclick = function () {
          // 挂单最长 7 天；名字至少还要 37 天才到期，防止挂在市场里过期
          if (r.exp < Date.now() / 1000 + 37 * 86400) { A.errTip("名字 37 天内就到期了，先续费再挂单", st); return; }
          var p = (prompt("卖多少 DAI？（买家另付 3% 手续费，你拿到完整标价；挂 7 天，随时可以撤单）") || "").trim();
          if (!p) return;
          if (!/^\d+(\.\d{1,6})?$/.test(p) || Number(p) <= 0) { A.errTip("价格格式不对，填数字，比如 100", st); return; }
          var wei = BigInt(Math.round(Number(p) * 1e6)) * 10n ** 12n, O = OTC[TLD];
          call(SEL.getApproved + r.id).then(function (g) {
            if (addrOf(g) === O) return;
            return tx(NAMES, SEL.nftApprove + A.pad(O) + r.id, say, "🔒 第 1 步：授权市场合约转这个名字（只用于这次挂单，合约开源、无管理员）。请在钱包确认");
          }).then(function () {
            return tx(O, SEL.oList + r.id + u256(wei) + u256(7 * 86400), say, "🔒 第 2 步：挂单 " + p + " DAI，名字存进市场合约。请在钱包确认");
          }).then(function () { say("✅ 已挂到市场"); market(); show(v); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
        };
      }, function () { out.innerHTML = '<p class="muted">查询失败，请稍后再试</p>'; });
    }
    // 傻瓜式三步：① 注册 ② 设为主名字 ③ OTC 出售（站长要求去掉「链上查询」）。每步做完都能「继续注册下一个」，并显示我注册了几个、排第几
    function again() { // 回到第 1 步，接着注册下一个
      inp.value = ""; out.innerHTML = ""; stepTo(1);
      history.replaceState(null, "", "#/names");
      inp.scrollIntoView({ behavior: "smooth", block: "center" }); inp.focus();
    }
    function mine(box) { // 我注册了几个、排第几（.ailgns 和 .lgns 合起来算，只算付费注册）
      if (!account) return;
      regStats(account).then(function (x) {
        if (!x.n) return;
        box.innerHTML = '<div class="nm-mine">🏅 你已注册 <b>' + x.n + "</b> 个域名，排第 <b>" + x.rank + "</b> 名（共 " + x.total + " 人）" +
          (x.rank > 1 ? "，再注册 <b>" + x.gap + "</b> 个就超过第 " + (x.rank - 1) + " 名" : "，👑 你是注册王！") + "</div>";
      }, function () {});
    }
    function guide(box, v, r) {
      var full = v + "." + TLD;
      call(SEL.nameOf + A.pad(account)).then(function (x) { return decStr(x) === v; }, function () { return false; }).then(function (done) {
        if (done) {
          stepTo(3);
          box.innerHTML = '<div class="nm-guide"><p class="nm-ok">✅ 第 2 步完成：<b>' + esc(full) + '</b> 是你的主名字，你的地址在本站会显示成这个名字</p><div id="nm-mine"></div>' +
            (OTC[TLD] ? '<button type="button" class="nm-go nm-go4" id="nm-go4">第 3 步：挂到 OTC 市场出售</button><p class="muted">想转手赚钱就挂单：你定价格，买家付 DAI 后名字自动过户，你拿完整标价（买家另付 3% 手续费）。不卖就不用做这一步。</p>' : "") +
            '<button type="button" class="nm-go nm-again" id="nm-again">➕ 继续注册下一个</button></div>';
          mine(document.getElementById("nm-mine"));
          document.getElementById("nm-again").onclick = again;
          var g4 = document.getElementById("nm-go4");
          if (g4) g4.onclick = function () {
            var sell = document.getElementById("nm-sell");
            if (sell) sell.click(); else show(v); // 刚注册完的页面没有挂单按钮，先刷新成完整页面
          };
          return;
        }
        stepTo(2);
        if (r.addr !== account) {
          box.innerHTML = '<div class="nm-guide"><p class="muted">第 2 步：这个名字现在指向别的地址，要先点下面「改指向地址」改成你自己的地址，才能设成主名字。</p></div>';
          return;
        }
        box.innerHTML = '<div class="nm-guide"><div id="nm-mine"></div><button type="button" class="nm-go" id="nm-pri">第 2 步：设为我的主名字</button>' +
          '<p class="muted">不花钱，只付一点 Gas。设好后，别人在本站看到你的地址，就显示 <b>' + esc(full) + '</b>。一个地址只有一个主名字，已经有主名字的可以跳过。</p><p class="muted nm-st" id="nm-pst"></p>' +
          '<button type="button" class="nm-skip" id="nm-again">跳过，继续注册下一个 →</button></div>';
        mine(document.getElementById("nm-mine"));
        document.getElementById("nm-again").onclick = again;
        var b = document.getElementById("nm-pri"), pst = document.getElementById("nm-pst");
        b.onclick = function () {
          b.disabled = true;
          tx(NAMES, SEL.setPrimary + r.id, function (t) { pst.textContent = t; }, "🔒 设置主名字（不花钱，只付一点 Gas）。请在钱包确认")
            .then(function () { show(v); }, function (e) { b.disabled = false; pst.textContent = ""; A.errTip(e.message || String(e), b); });
        };
      });
    }
    function stepTo(n) {
      document.querySelectorAll("#nm-steps li").forEach(function (li) {
        var s = Number(li.getAttribute("data-s"));
        li.className = s < n ? "done" : s === n ? "on" : "";
      });
    }

    function bindBuy(v, preview) {
      var y = document.getElementById("nm-y"), st = document.getElementById("nm-st");
      var kk = document.getElementById("nm-k"), cost = document.getElementById("nm-cost");
      y.onchange = kk.onchange = function () { // 换年数或币种：显示要付多少个币
        var dai = yearPrice(v) * y.value, k = kk.value;
        cost.textContent = dai + " DAI";
        if (k === "DAI" || preview) return;
        quote(dai, k).then(function (q) { return k === "LGNS" ? topUp(q).then(function (e) { return q + e; }) : q; })
          .then(function (q) { if (kk.value === k) cost.textContent = "≈ " + fmt(q, TOK[k].d) + " " + k + (k === "LGNS" ? "（含 DEX 卖出税补差）" : ""); }, function () { cost.textContent = dai + " DAI"; });
      };
      kk.onchange();
      document.getElementById("nm-go").onclick = function () {
        if (preview) { st.textContent = "⏳ 合约还没上线，这里是预览"; return; }
        var b = this;
        b.disabled = true;
        register(v, Number(y.value), kk.value, function (t) { st.textContent = t; }).then(function () {
          st.textContent = "";
          out.innerHTML = '<p class="nm-ok nm-big">✅ 第 1 步完成：<b>' + esc(v) + "." + TLD + '</b> 注册成功，已经指向你的地址</p><p class="nm-gen" id="nm-gen"></p><div id="nm-next"><p class="muted">正在准备第 2 步…</p></div>';
          info(v).then(function (r) {
            genesis().then(function (g) { var e = document.getElementById("nm-gen"); if (e && g[r.id]) e.textContent = "🌟 你是创世域名 #" + g[r.id]; }, function () {});
            guide(document.getElementById("nm-next"), v, r);
          });
        }, function (e) { b.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), b); });
      };
    }
    stepTo(1);
    // 已经连过钱包的，静默认出地址，打开自己的名字就直接显示第 2 / 3 步
    if (!account && A.wallets && A.wallets.silent) A.wallets.silent().then(function (a) { if (a && !account) { account = String(a).toLowerCase(); show(q); } }, function () {});
    show(q);
    market();
    ranks();
    livePrices();
    genCard();
    // 菜单「域名 OTC」（#/names/otc）：直接滚到域名市场
    if (/^#\/names\/otc/.test(location.hash)) setTimeout(function () { var m = document.getElementById("nm-mk"); if (m) (m.closest("section") || m).scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
  }

  // 读某个合约的某种事件：从部署区块开始，每次 5000 块；读过的存在本机，下次只读新增的
  function logs(addr, topic, from) {
    var key = "nmlog:" + addr + ":" + topic.slice(2, 10), c = null;
    try { c = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { /* 无痕模式 */ }
    c = c || { to: from - 1, l: [] };
    return W.rpcOn("anubis", "eth_blockNumber", []).then(function (h) {
      var latest = parseInt(h, 16), ranges = [];
      for (var b = c.to + 1; b <= latest; b += 5000) ranges.push([b, Math.min(latest, b + 4999)]);
      return A.pool(ranges, 4, function (r) {
        return W.rpcOn("anubis", "eth_getLogs", [{ address: addr, fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16), topics: [topic] }]);
      }).then(function (chunks) {
        chunks.forEach(function (x) { if (!x) throw new Error("读链上记录失败"); });
        [].concat.apply([], chunks).forEach(function (l) { c.l.push([parseInt(l.blockNumber, 16), l.topics, l.data]); });
        c.to = latest;
        try { localStorage.setItem(key, JSON.stringify(c)); } catch (e) { /* 存不下就下次重读 */ }
        return c.l;
      });
    });
  }
  // 注册排名：.ailgns 和 .lgns 两个合约的付费注册合起来，按注册个数排（官方保留名不算）
  function regStats(me) {
    return Promise.all(["ailgns", "lgns"].map(function (t) { return logs(CONTRACTS[t], T_REG, START[t]); })).then(function (all) {
      var c = {};
      all.forEach(function (l) { l.forEach(function (x) { if (BigInt("0x" + x[2].slice(66, 130)) > 0n) { var o = "0x" + x[1][2].slice(26); c[o] = (c[o] || 0) + 1; } }); });
      var n = c[me] || 0, above = Object.keys(c).filter(function (a) { return c[a] > n; }).map(function (a) { return c[a]; });
      return { n: n, rank: above.length + 1, total: Object.keys(c).length, gap: above.length ? Math.min.apply(null, above) - n + 1 : 0 };
    });
  }
  // 创世编号：按链上顺序，每个名字第一次付费注册排一个号（官方保留名不算），前 1 万个
  var genCache = {};
  function genesis() {
    if (!genCache[TLD]) genCache[TLD] = logs(NAMES, T_REG, START[TLD]).then(function (l) {
      var g = {}, n = 0;
      l.forEach(function (x) { var id = x[1][1].slice(2); if (!g[id] && BigInt("0x" + x[2].slice(66, 130)) > 0n && n < GENESIS) g[id] = ++n; });
      return g;
    }, function (e) { delete genCache[TLD]; throw e; });
    return genCache[TLD];
  }
  // 创世域名营销卡：剩余数量实时倒计时（每 15 秒读一次链，有人注册就当场减一、弹出「刚刚又有人抢注」），全部是链上真实数字，不编
  var gcTimer = null, gcLast = -1, blockTs = {};
  // 站长自己的钱包：注册的名字不出现在「最近被抢注」里，别人搜到也不显示创世编号（只有主人自己看得到）
  var PROTECT = A.hidden || {};
  function bts(b) { // 区块时间（秒），缓存
    if (!blockTs[b]) blockTs[b] = W.rpcOn("anubis", "eth_getBlockByNumber", ["0x" + b.toString(16), false]).then(function (x) { return parseInt(x.timestamp, 16); });
    return blockTs[b];
  }
  function ago(sec) { return sec < 60 ? "刚刚" : sec < 3600 ? Math.floor(sec / 60) + " 分钟前" : sec < 86400 ? Math.floor(sec / 3600) + " 小时前" : Math.floor(sec / 86400) + " 天前"; }
  function flip(n) { // 翻牌数字：每一位一个牌子，不足 4 位前面补 0（10,000 → 9,994）
    var s = String(n).padStart(4, "0");
    return s.split("").map(function (d, i) { return (s.length - i === 3 && i ? '<em class="gc-sep">,</em>' : "") + '<span class="gc-d">' + d + "</span>"; }).join("");
  }
  function gcRead() {
    return logs(NAMES, T_REG, START[TLD]).then(function (l) {
      var seen = {}, list = [];
      l.forEach(function (x) { var id = x[1][1]; if (!seen[id] && BigInt("0x" + x[2].slice(66, 130)) > 0n && list.length < GENESIS) { seen[id] = 1; list.push(x); } });
      var last = list.filter(function (x) { return !PROTECT["0x" + x[1][2].slice(26)]; }).slice(-6).reverse(), latestBlock = l.length ? l[l.length - 1][0] : 0;
      return Promise.all([W.rpcOn("anubis", "eth_getBlockByNumber", ["latest", false])].concat(last.map(function (x) { return bts(x[0]); }))).then(function (t) {
        var now = parseInt(t[0].timestamp, 16), head = parseInt(t[0].number, 16);
        // 近 24 小时：按最近一个注册的区块和现在的时间差估出每块秒数，再数 24 小时内的注册
        var spb = last.length && head > last[0][0] ? Math.max(0.5, (now - t[1]) / (head - last[0][0])) : 2;
        var from = head - Math.floor(86400 / spb), day = list.filter(function (x) { return x[0] >= from; }).length;
        return { n: list.length, day: day, recent: last.map(function (x, i) { var nm = ""; try { nm = decStr(x[2]); } catch (e) { /* 忽略 */ } return { nm: nm, ago: now - t[i + 1], no: list.indexOf(x) + 1 }; }) };
      });
    });
  }
  function genCard() {
    var box = document.getElementById("nm-genc");
    clearInterval(gcTimer); gcLast = -1;
    if (!box || !NAMES) return;
    box.innerHTML = '<div class="gc"><div class="gc-top"><span class="gc-tag">🌟 创世域名 · 公平发射</span><b>全球限量 10,000 个</b></div><p class="muted" style="margin:6px 0 0">读取链上数据…</p></div>';
    function draw(d) {
      var b = document.getElementById("nm-genc");
      if (!b) { clearInterval(gcTimer); return; } // 离开了域名页
      var n = d.n, left = GENESIS - n, pct = Math.max(n / GENESIS * 100, 0.6), changed = gcLast >= 0 && n > gcLast;
      var tier = n < 10 ? ["前 10 号", 10] : n < 100 ? ["前 100 号", 100] : n < 1000 ? ["前 1,000 号", 1000] : null;
      b.innerHTML = '<div class="gc' + (changed ? " gc-hit" : "") + '">' +
        '<div class="gc-top"><span class="gc-tag">🌟 创世域名 · 公平发射</span><span class="gc-live"><i></i>链上实时</span></div>' +
        '<div class="gc-cd"><small>.' + TLD + ' 创世域名 · 全球限量 10,000 个 · 仅剩</small><div class="gc-flip">' + flip(left) + '</div><small>售完永久没有，第 10,001 个起再也不是创世域名</small></div>' +
        '<div class="gc-bar"><i style="width:' + pct.toFixed(2) + '%"></i></div>' +
        '<div class="gc-num"><div><small>已被抢注</small><b>' + n.toLocaleString() + '</b></div><div><small>近 24 小时</small><b>+' + d.day + '</b></div><div><small>你现在注册就是</small><b class="gc-me">创世 #' + (n + 1).toLocaleString() + "</b></div></div>" +
        (tier ? '<p class="gc-hot">🏅 <b>' + tier[0] + "</b>（编号越小越稀有）只剩 <b>" + (tier[1] - n) + "</b> 个，抢完就只能拿更大的号</p>" : "") +
        (changed ? '<p class="gc-flash">⚡ 刚刚又有 <b>' + (n - gcLast) + "</b> 个创世域名被抢注，现在只剩 <b>" + left.toLocaleString() + "</b> 个</p>" : "") +
        '<ul class="gc-pts"><li>🔥 <b>限量 1 万，售完永久没有</b>：合约写死，谁都加不了</li><li>⚖️ <b>公平发射</b>：人人同价，先到先得，官方不占创世编号</li><li>🔢 <b>链上永久编号</b>：注册顺序刻在区块链上，永远改不了</li><li>💎 <b>好名字只有一个</b>：被别人注册了就是别人的，只能去市场高价买</li></ul>' +
        (d.recent.length ? '<div class="gc-recent"><small>最近被抢注：</small>' + d.recent.filter(function (r) { return r.nm; }).map(function (r) { return "<span>" + esc(r.nm) + "." + TLD + " <em>#" + r.no + " · " + ago(r.ago) + "</em></span>"; }).join("") + "</div>" : "") +
        '<button type="button" class="gc-go" id="gc-go">⚡ 立即抢注创世 #' + (n + 1).toLocaleString() + "</button></div>";
      document.getElementById("gc-go").onclick = function () { var i = document.getElementById("nm-q"); if (i) { i.scrollIntoView({ block: "center", behavior: "smooth" }); i.focus(); } };
      gcLast = n;
    }
    gcRead().then(draw, function () { var b = document.getElementById("nm-genc"); if (b) b.innerHTML = ""; });
    gcTimer = setInterval(function () { if (!document.getElementById("nm-genc")) { clearInterval(gcTimer); return; } if (!document.hidden) gcRead().then(draw, function () {}); }, 15000);
  }
  // 价格表：每档下面标出用 AiLGNS / LGNS 付要多少个（LGNS 含卖出税补差）（合约 quote = DEX 实时价格）
  function livePrices() {
    var els = document.querySelectorAll(".nm-q");
    if (!els.length || !NAMES) return;
    Promise.all([quote(1, "AiLGNS"), quote(1, "LGNS").then(function (q) { return topUp(q).then(function (e) { return q + e; }); }), lgnsTax()]).then(function (q) {
      els.forEach(function (el) { var d = BigInt(el.getAttribute("data-dai")); el.innerHTML = "≈ " + fmt(q[0] * d, 18) + " AiLGNS<br>≈ " + fmt(q[1] * d, 9) + " LGNS"; });
      var px = document.getElementById("nm-px");
      if (px) px.textContent = " 现在 1 AiLGNS ≈ " + (1e18 / Number(q[0])).toFixed(2) + " DAI。用 LGNS 付要补 DEX 卖出税（现在约 " + (Number(q[2]) / 100).toFixed(0) + "%）的差价，上面 LGNS 数量已含补差。";
    }, function () {});
  }

  // 成交排行：最贵 10 笔 + 最新 10 笔
  function ranks() {
    var box = document.getElementById("nm-rank"), O = OTC[TLD];
    if (!box || !O) return;
    box.innerHTML = '<p class="muted">读取中…</p>';
    Promise.all([logs(O, T_FILL, START[TLD]), genesis().catch(function () { return {}; })]).then(function (x) {
      var fills = x[0].map(function (l) { return { b: l[0], tid: l[2].slice(2, 66), price: BigInt("0x" + l[2].slice(66, 130)) }; }), g = x[1];
      if (!fills.length) { box.innerHTML = '<p class="muted">还没有成交。第一笔成交会出现在这里！</p>'; return; }
      var top = fills.slice().sort(function (a, b) { return a.price > b.price ? -1 : a.price < b.price ? 1 : 0; }).slice(0, 10), last = fills.slice(-10).reverse(), all = top.concat(last), names = {};
      return Promise.all(all.map(function (f) { return names[f.tid] || (names[f.tid] = call(SEL.labelOf + f.tid).then(decStr)); })).then(function (labels) {
        all.forEach(function (f, i) { f.label = labels[i]; });
        var row = function (f, i) { return '<li><span>' + (i + 1) + ". <b>" + esc(f.label) + "." + TLD + "</b>" + (g[f.tid] ? ' <i class="nm-gb">🌟 创世 #' + g[f.tid] + "</i>" : "") + "</span><b>" + Number(f.price / 10n ** 12n) / 1e6 + " DAI</b></li>"; };
        box.innerHTML = '<div class="nm-rk2"><div><h3>💎 最贵成交</h3><ol>' + top.map(row).join("") + '</ol></div><div><h3>🕒 最新成交</h3><ol>' + last.map(row).join("") + "</ol></div></div>";
      });
    }).catch(function () { box.innerHTML = '<p class="muted">读取失败，请稍后再试</p>'; });
  }

  // 域名市场：读最近 200 张单里还在卖的
  function market() {
    var box = document.getElementById("nm-mk"), O = OTC[TLD];
    if (!box) return;
    if (!O) { box.innerHTML = '<p class="muted">.' + TLD + " 域名市场即将开放</p>"; return; }
    var oc = function (data) { return W.rpcOn("anubis", "eth_call", [{ to: O, data: data }, "latest"]); };
    box.innerHTML = '<p class="muted">读取中…</p>';
    oc(SEL.oCount).then(function (c) {
      var n = Number(BigInt(c)), from = Math.max(0, n - 200);
      return oc(SEL.oGet + u256(from) + u256(n - from)).then(function (res) {
        var w = (res.slice(2).match(/.{64}/g) || []), cnt = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0, now = Date.now() / 1000, list = [];
        for (var i = 0; i < cnt; i++) {
          var o = w.slice(2 + i * 6, 8 + i * 6);
          var it = { id: from + i, maker: "0x" + o[0].slice(24), sell: o[1].slice(-1) === "1", open: o[2].slice(-1) === "1", expiry: Number(BigInt("0x" + o[3])), tid: o[4], price: BigInt("0x" + o[5]) };
          if (it.sell && it.open && it.expiry > now) list.push(it);
        }
        return Promise.all(list.map(function (it) {
          return Promise.all([call(SEL.labelOf + it.tid), call(SEL.expires + it.tid)]).then(function (x) { it.label = decStr(x[0]); it.exp = Number(BigInt("0x" + word(x[1], 0))); return it; });
        }));
      });
    }).then(function (list) {
      if (!list.length) { box.innerHTML = '<p class="muted">还没有人挂单。搜索你自己的名字，点「挂到市场卖」就能挂。</p>'; return; }
      list.sort(function (a, b) { return a.price < b.price ? -1 : 1; });
      box.innerHTML = '<div class="nm-mk">' + list.map(function (it) {
        var mine = account && it.maker === account, p = Number(it.price / 10n ** 12n) / 1e6;
        return '<div class="nm-row"><div><b>' + esc(it.label) + "." + TLD + '</b><i class="nm-gb" data-g="' + it.tid + '"></i><small>名字到期 ' + date(it.exp) + " · 卖家 " + A.short(it.maker) + '</small></div><div class="nm-rp"><b>' + p + ' DAI</b><button type="button" data-o="' + it.id + '" data-m="' + (mine ? 1 : 0) + '" data-p="' + it.price + '">' + (mine ? "撤单" : "买") + "</button></div></div>";
      }).join("") + '</div><p class="muted nm-st" id="nm-mst"></p>';
      genesis().then(function (g) { box.querySelectorAll("[data-g]").forEach(function (e) { var k = g[e.getAttribute("data-g")]; if (k) e.textContent = "🌟 创世 #" + k; }); }, function () {});
      var st = document.getElementById("nm-mst"), say = function (t) { st.textContent = t; };
      box.querySelectorAll("button[data-o]").forEach(function (b) {
        b.onclick = function () {
          var id = Number(b.getAttribute("data-o")), price = BigInt(b.getAttribute("data-p")), total = price + price * 3n / 100n;
          connect().then(function () {
            if (b.getAttribute("data-m") === "1") return tx(O, SEL.oCancel + u256(id), say, "🔒 撤单，名字退回你的钱包。请在钱包确认");
            return W.rpcOn("anubis", "eth_call", [{ to: DAI, data: SEL.allowance + A.pad(account) + A.pad(O) }, "latest"]).then(function (a) {
              if (BigInt(a) < total) return tx(DAI, SEL.approve + A.pad(O) + u256(total), say, "🔒 第 1 步：授权市场合约收 " + Number(total / 10n ** 12n) / 1e6 + " DAI（含 3% 手续费）。请在钱包确认");
            }).then(function () { return tx(O, SEL.oBuy + u256(id) + u256(total), say, "🔒 第 2 步：付款，名字同一笔交易直接到你钱包。请在钱包确认"); });
          }).then(function () { say("✅ 成功"); market(); }, function (e) { say(""); A.errTip(e.message || String(e), b); });
        };
      });
    }, function () { box.innerHTML = '<p class="muted">读取失败，请稍后再试</p>'; });
  }

  A.pages.names = page;
})();
