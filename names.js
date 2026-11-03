// .ailgns 域名：注册 xxx.ailgns、绑定地址、设主名字、查名字（合约 contracts/AilgnsNames.sol，规则照抄 ENS 的 .eth）
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
  // 带汉字：2 个字 50、3 个字及以上 5；英文照 ENS：3 位 640、4 位 160、5 位及以上 5（DAI / 年）
  function yearPrice(s) { var n = chars(s); return cn(s) ? (n === 2 ? 50 : 5) : n === 3 ? 640 : n === 4 ? 160 : 5; }
  // 付款币种：DAI，或 LGNS、AiLGNS（合约按 DEX 现价换算）
  var TOK = { DAI: { a: DAI, d: 18 }, LGNS: { a: "0x4d1d808a081fdac440703b3765fc61f8028c06b8", d: 9 }, AiLGNS: { a: "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", d: 18 } };
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
  function info(label) { // 能否注册、指向谁、主人、到期时间
    var s = "0000000000000000000000000000000000000000000000000000000000000020" + str(label);
    return Promise.all([call(SEL.available + s), call(SEL.resolve + s), call(SEL.idOf + s)]).then(function (r) {
      var id = word(r[2], 0);
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
    TLD = m ? m[1] : "ailgns";
    NAMES = CONTRACTS[TLD];
    q = q.replace(/\.(ailgns|lgns)$/, "");
    A.app.innerHTML =
      '<section class="card nm-hero"><h2>🌐 .ailgns / .lgns 域名</h2><p class="muted">把一长串 0x 地址换成好记的名字：转账、收款报 <b>xxx.ailgns</b> 就行。规则照抄以太坊 ENS（.eth）。</p>' +
      '<ol class="nm-steps" id="nm-steps"><li data-s="1"><b>1</b>注册名字</li><li data-s="2"><b>2</b>设为主名字</li><li data-s="3"><b>3</b>链上查询</li></ol>' +
      '<form class="nm-search" id="nm-f"><input id="nm-q" placeholder="输入想要的名字，中文英文都行" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(q) + '"><select id="nm-t"><option value="ailgns">.ailgns</option><option value="lgns">.lgns</option></select><button type="submit">搜索</button></form>' +
      '<div id="nm-r"></div></section>' +
      '<section class="card"><div class="card-head"><h2>💰 价格（每年，DAI）</h2><span class="muted">和 ENS 一样按长度</span></div>' +
      '<p class="nm-pt">英文（照抄 ENS）</p><div class="nm-price"><div><b>3 位</b><span>640 DAI</span></div><div><b>4 位</b><span>160 DAI</span></div><div><b>5 位及以上</b><span>5 DAI</span></div></div>' +
      '<p class="nm-pt">中文</p><div class="nm-price nm-p2"><div><b>2 个字</b><span>50 DAI</span></div><div><b>3 个字及以上</b><span>5 DAI</span></div></div>' +
      '<p class="muted">可以用 DAI、LGNS、AiLGNS 付（Anubis 链，按 DEX 现价换算）</p>' +
      '<ul class="nm-rules"><li>可以用<b>中文</b>、小写字母、数字、连字符 -；英文最少 3 位，中文最少 2 个字</li><li>一次买 1–100 年（买 100 年相当于永久）；到期后有 <b>90 天宽限期</b>，只有原主人能续费</li><li>🌟 前 1 万个注册的名字是<b>创世域名</b>，按链上注册顺序永久编号</li><li>每个名字是一个 NFT，可以转让、买卖；转让后自动指向新主人</li><li>🔒 合约开源、无管理员、不能升级，平台也收不走你的名字</li></ul></section>' +
      '<section class="card"><div class="card-head"><h2>🛒 域名市场</h2><span class="muted">一手交钱一手交名字 · 手续费 3% 买家付</span></div><div id="nm-mk"></div></section>' +
      '<section class="card"><div class="card-head"><h2>🏆 成交排行</h2><span class="muted">链上真实成交</span></div><div id="nm-rank"></div></section>' +
      '<section class="card"><div class="card-head"><h2>🔍 反查：这个地址叫什么</h2></div><form class="nm-search" id="nm-rf"><input id="nm-ra" placeholder="0x 地址" autocomplete="off" spellcheck="false"><button type="submit">查询</button></form><div id="nm-rr"></div></section>';
    document.getElementById("nm-t").value = TLD;
    var f = document.getElementById("nm-f"), inp = document.getElementById("nm-q"), out = document.getElementById("nm-r");
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = inp.value.trim().toLowerCase().replace(/\.(ailgns|lgns)$/, ""), t = document.getElementById("nm-t").value;
      if (v !== q || t !== TLD) { location.hash = "#/names/" + encodeURIComponent(v) + "." + t; return; }
      show(v);
    };
    inp.oninput = function () { var v = inp.value.toLowerCase(); if (v !== inp.value) inp.value = v; };
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
        out.innerHTML = '<p class="nm-bad"><b>' + esc(v) + "." + TLD + "</b> 已被注册</p>" +
          '<dl class="nm-dl"><dt>指向地址</dt><dd class="mono">' + (r.addr !== ZERO ? r.addr : "—") + "</dd><dt>主人</dt><dd class=\"mono\">" + (r.owner || "已过期（宽限期中）") + "</dd><dt>到期</dt><dd>" + date(r.exp) + (r.exp < now ? "（宽限期到 " + date(r.exp + 90 * 86400) + "）" : "") + "</dd></dl>" +
          '<p class="nm-gen" id="nm-gen"></p>' + (mine ? '<div id="nm-next"></div>' : '<a class="nm-scan" href="#/scan/' + encodeURIComponent(v + "." + TLD) + '">🔎 链上查询这个名字 →</a>') + '<div class="nm-act"><label class="nm-rk">用 ' + tokSel("nm-rk") + ' 付</label><button type="button" id="nm-renew">续费 1 年（' + yearPrice(v) + " DAI，谁都能帮续）</button>" + (mine ? '<button type="button" id="nm-set">改指向地址</button>' + (OTC[TLD] ? '<button type="button" id="nm-sell">挂到市场卖</button>' : "") : "") + '</div><p class="muted nm-st" id="nm-st"></p>';
        var st = document.getElementById("nm-st"), say = function (t) { st.textContent = t; };
        genesis().then(function (g) { var e = document.getElementById("nm-gen"); if (e && g[r.id]) e.textContent = "🌟 创世域名 #" + g[r.id]; }, function () {});
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
    // 傻瓜式三步：① 注册 ② 设为主名字 ③ 链上查询。自己的名字没设主名字就给大按钮去设，设好了就给大按钮去查
    function guide(box, v, r) {
      var full = v + "." + TLD;
      call(SEL.nameOf + A.pad(account)).then(function (x) { return decStr(x) === v; }, function () { return false; }).then(function (done) {
        if (done) {
          stepTo(3);
          box.innerHTML = '<div class="nm-guide"><p class="nm-ok">✅ 第 2 步完成：<b>' + esc(full) + '</b> 是你的主名字</p>' +
            '<a class="nm-go nm-golink" href="#/scan/' + encodeURIComponent(full) + '">第 3 步：去链上查询 →</a>' +
            '<p class="muted">在浏览器里，你的地址会直接显示成 <b>' + esc(full) + "</b>，转账时对方输入这个名字就能找到你。</p></div>";
          return;
        }
        stepTo(2);
        if (r.addr !== account) {
          box.innerHTML = '<div class="nm-guide"><p class="muted">第 2 步：这个名字现在指向别的地址，要先点下面「改指向地址」改成你自己的地址，才能设成主名字。</p></div>';
          return;
        }
        box.innerHTML = '<div class="nm-guide"><button type="button" class="nm-go" id="nm-pri">第 2 步：设为我的主名字</button>' +
          '<p class="muted">不花钱，只付一点 Gas。设好后，别人在浏览器里看到你的地址，就显示 <b>' + esc(full) + '</b>。</p><p class="muted nm-st" id="nm-pst"></p></div>';
        var b = document.getElementById("nm-pri"), pst = document.getElementById("nm-pst");
        b.onclick = function () {
          b.disabled = true;
          tx(NAMES, SEL.setPrimary + r.id, function (t) { pst.textContent = t; }, "🔒 设置主名字（不花钱，只付一点 Gas）。请在钱包确认")
            .then(function () { guide(box, v, r); }, function (e) { b.disabled = false; pst.textContent = ""; A.errTip(e.message || String(e), b); });
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
        quote(dai, k).then(function (q) { if (kk.value === k) cost.textContent = "≈ " + fmt(q, TOK[k].d) + " " + k; }, function () { cost.textContent = dai + " DAI"; });
      };
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
