// .ailgns 域名：注册 xxx.ailgns、绑定地址、设主名字、查名字（合约 contracts/AilgnsNames.sol，规则照抄 ENS 的 .eth）
// 收费全部直接进回购分账合约；合约没部署前 NAMES 留空，页面只能看价格、不能注册（预览）
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  // 两个后缀各一个合约（同一份规则）；网址 #/names/xxx.lgns 打开 .lgns，默认 .ailgns
  var CONTRACTS = { ailgns: "0x4992917c0e9790342454d2acbbf7559d94c317cb", lgns: "0x9d8caceb1bda65ff21f62248d973e8c2a49bf333" }; // Anubis 区块：.ailgns 18159922，.lgns 18160417
  var TLD = "ailgns", NAMES = CONTRACTS.ailgns;
  var DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14";
  var ZERO = "0x" + "0".repeat(40);
  var SEL = { available: "0xaeb8ce9b", register: "0xd393c871", renew: "0xacf1a841", resolve: "0x461a4478", nameOf: "0xf5c57382", idOf: "0x5fd846f2", expires: "0xcb52c823", ownerOf: "0x6352211e", setPrimary: "0x38e74feb", setAddr: "0xeba36dbd", allowance: "0xdd62ed3e", approve: "0x095ea7b3" };

  function valid(s) { return /^[a-z0-9-]{3,32}$/.test(s) && s[0] !== "-" && s[s.length - 1] !== "-"; }
  function yearPrice(s) { return s.length === 3 ? 640 : s.length === 4 ? 160 : 5; }
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
    say(msg);
    return W.rpcOn("anubis", "eth_call", [{ from: account, to: to, data: data }, "latest"]).catch(function (e) { throw new Error(e && /PAY_FAILED|transfer/i.test(e.message) ? "DAI 不够（还要一点 DAI 付 Gas）" : "交易会失败：" + ((e && e.message) || "请检查名字和余额")); })
      .then(function () { return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: to, data: data }] }); })
      .then(function (h) { say("已提交，等待链上确认…"); return W.waitOn("anubis", h).then(function () { return h; }); });
  }
  function register(label, years, say) {
    var cost = BigInt(yearPrice(label) * years) * 10n ** 18n;
    return connect().then(function () {
      return W.rpcOn("anubis", "eth_call", [{ to: DAI, data: SEL.allowance + A.pad(account) + A.pad(NAMES) }, "latest"]);
    }).then(function (r) {
      if (BigInt(r) >= cost) return;
      return tx(DAI, SEL.approve + A.pad(NAMES) + u256(cost), say, "🔒 第 1 步：授权域名合约收 " + yearPrice(label) * years + " DAI（只收这一次的钱，合约开源、无管理员）。请在钱包确认");
    }).then(function () {
      var data = SEL.register + u256(0x60) + A.pad(account) + u256(years) + str(label);
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
      '<form class="nm-search" id="nm-f"><input id="nm-q" placeholder="输入想要的名字，比如 baili" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(q) + '"><select id="nm-t"><option value="ailgns">.ailgns</option><option value="lgns">.lgns</option></select><button type="submit">搜索</button></form>' +
      '<div id="nm-r"></div></section>' +
      '<section class="card"><div class="card-head"><h2>💰 价格（每年，DAI）</h2><span class="muted">和 ENS 一样按长度</span></div>' +
      '<div class="nm-price"><div><b>3 个字符</b><span>640 DAI</span></div><div><b>4 个字符</b><span>160 DAI</span></div><div><b>5 个及以上</b><span>5 DAI</span></div></div>' +
      '<ul class="nm-rules"><li>只能用小写字母、数字、连字符 -，3–32 个字符</li><li>一次买 1–10 年；到期后有 <b>90 天宽限期</b>，只有原主人能续费</li><li>每个名字是一个 NFT，可以转让、买卖；转让后自动指向新主人</li><li>🔒 合约开源、无管理员、不能升级，平台也收不走你的名字</li></ul></section>' +
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
      if (!valid(v)) { out.innerHTML = '<p class="nm-bad">「' + esc(v) + '」不能用：只能小写字母、数字、-，3–32 个字符，不能以 - 开头或结尾</p>'; return; }
      var buy = '<div class="nm-buy"><label>买几年 <select id="nm-y">' + [1, 2, 3, 5, 10].map(function (y) { return '<option value="' + y + '">' + y + " 年</option>"; }).join("") + '</select></label><b id="nm-cost">' + yearPrice(v) + ' DAI</b></div>' +
        '<button type="button" class="nm-go" id="nm-go">注册 ' + esc(v) + "." + TLD + "</button><p class=\"muted nm-st\" id=\"nm-st\"></p>";
      if (!NAMES) {
        out.innerHTML = '<p class="nm-ok"><b>' + esc(v) + "." + TLD + '</b> 名字合规，' + yearPrice(v) + " DAI / 年</p>" + buy;
        bindBuy(v, true);
        return;
      }
      out.innerHTML = '<p class="muted">查询中…</p>';
      info(v).then(function (r) {
        if (r.free) { out.innerHTML = '<p class="nm-ok">🎉 <b>' + esc(v) + "." + TLD + "</b> 可以注册！</p>" + buy; bindBuy(v); return; }
        var mine = account && r.owner === account, now = Date.now() / 1000;
        out.innerHTML = '<p class="nm-bad"><b>' + esc(v) + "." + TLD + "</b> 已被注册</p>" +
          '<dl class="nm-dl"><dt>指向地址</dt><dd class="mono">' + (r.addr !== ZERO ? r.addr : "—") + "</dd><dt>主人</dt><dd class=\"mono\">" + (r.owner || "已过期（宽限期中）") + "</dd><dt>到期</dt><dd>" + date(r.exp) + (r.exp < now ? "（宽限期到 " + date(r.exp + 90 * 86400) + "）" : "") + "</dd></dl>" +
          '<div class="nm-act"><button type="button" id="nm-renew">续费 1 年（' + yearPrice(v) + " DAI，谁都能帮续）</button>" + (mine ? '<button type="button" id="nm-pri">设为我的主名字</button><button type="button" id="nm-set">改指向地址</button>' : "") + '</div><p class="muted nm-st" id="nm-st"></p>';
        var st = document.getElementById("nm-st"), say = function (t) { st.textContent = t; };
        document.getElementById("nm-renew").onclick = function () {
          var cost = BigInt(yearPrice(v)) * 10n ** 18n;
          connect().then(function () { return W.rpcOn("anubis", "eth_call", [{ to: DAI, data: SEL.allowance + A.pad(account) + A.pad(NAMES) }, "latest"]); })
            .then(function (a) { if (BigInt(a) < cost) return tx(DAI, SEL.approve + A.pad(NAMES) + u256(cost), say, "🔒 第 1 步：授权域名合约收 " + yearPrice(v) + " DAI。请在钱包确认"); })
            .then(function () { return tx(NAMES, SEL.renew + u256(0x40) + u256(1) + str(v), say, "🔒 第 2 步：续费 1 年。请在钱包确认"); })
            .then(function () { say("✅ 续费成功"); show(v); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
        };
        if (!mine) return;
        document.getElementById("nm-pri").onclick = function () {
          if (r.addr !== account) { A.errTip("名字要先指向你自己的地址，才能设成主名字", st); return; }
          tx(NAMES, SEL.setPrimary + r.id, say, "🔒 设置主名字（不花钱，只付一点 Gas）。请在钱包确认").then(function () { say("✅ 别人查你的地址会显示 " + v + "." + TLD); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
        };
        document.getElementById("nm-set").onclick = function () {
          var a = (prompt("让 " + v + "." + TLD + " 指向哪个地址？", account) || "").trim().toLowerCase();
          if (!a) return;
          if (!/^0x[0-9a-f]{40}$/.test(a)) { A.errTip("地址格式不对", st); return; }
          tx(NAMES, SEL.setAddr + r.id + A.pad(a), say, "🔒 修改指向地址。请在钱包确认").then(function () { say("✅ 已修改"); show(v); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
        };
      }, function () { out.innerHTML = '<p class="muted">查询失败，请稍后再试</p>'; });
    }
    function bindBuy(v, preview) {
      var y = document.getElementById("nm-y"), st = document.getElementById("nm-st");
      y.onchange = function () { document.getElementById("nm-cost").textContent = yearPrice(v) * y.value + " DAI"; };
      document.getElementById("nm-go").onclick = function () {
        if (preview) { st.textContent = "⏳ 合约还没上线，这里是预览"; return; }
        var b = this;
        b.disabled = true;
        register(v, Number(y.value), function (t) { st.textContent = t; }).then(function () {
          st.textContent = "";
          out.innerHTML = '<p class="nm-ok">✅ 注册成功！<b>' + esc(v) + "." + TLD + "</b> 现在指向你的地址</p><p class=\"muted\">再点一次搜索可以「设为我的主名字」，别人查你的地址就会显示这个名字。</p>";
        }, function (e) { b.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), b); });
      };
    }
    show(q);
  }

  A.pages.names = page;
})();
