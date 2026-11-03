// 轻量区块浏览器（Anubis 链）：一个搜索框搜域名（xxx.ailgns / xxx.lgns）、地址、交易哈希；
// 链上数据借用 Anubis 官方浏览器（Blockscout）的公开接口，再把地址换成我们的域名显示（像 Etherscan 显示 ENS）
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  var API = "https://browser.anubispace.org/api/v2", WEB = "https://browser.anubispace.org";
  var NAMES = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", lgns: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3" };
  var SEL = { resolve: "0x461a4478", nameOf: "0xf5c57382", idOf: "0x5fd846f2", expires: "0xcb52c823", ownerOf: "0x6352211e" };
  var METHODS = { // 常见方法的中文名（我们的合约没在官方浏览器开源验证，它显示不出名字）
    "0xd868a84f": "注册域名", "0x26e43e37": "续费域名", "0x38e74feb": "设主名字", "0xeba36dbd": "改指向", "0xa9059cbb": "转账", "0x095ea7b3": "授权",
    "0x23b872dd": "转移", "0xca690ea2": "挂单卖", "0xd6febde8": "买", "0x40e58ee5": "撤单"
  };
  var ZERO = "0x" + "0".repeat(40);

  function get(path) { return fetch(API + path).then(function (r) { if (!r.ok) throw new Error("浏览器接口返回 " + r.status); return r.json(); }); }
  function call(to, data) { return W.rpcOn("anubis", "eth_call", [{ to: to, data: data }, "latest"]); }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function str(s) {
    var h = Array.prototype.map.call(new TextEncoder().encode(s), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    return u256(32) + u256(h.length / 2) + h.padEnd(Math.ceil(h.length / 64) * 64, "0");
  }
  function decStr(r) {
    if (!r || r.length < 130) return "";
    var len = parseInt(r.slice(66, 130), 16), h = r.slice(130, 130 + len * 2);
    return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map(function (x) { return parseInt(x, 16); })));
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function amt(v, d) { var x = Number(v || 0) / Math.pow(10, Number(d || 18)); return x === 0 ? "0" : x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : x >= 1 ? x.toFixed(4).replace(/\.?0+$/, "") : x.toPrecision(4); }
  function ago(t) {
    var s = (Date.now() - new Date(t).getTime()) / 1000;
    return s < 60 ? Math.max(1, Math.round(s)) + " 秒前" : s < 3600 ? Math.round(s / 60) + " 分钟前" : s < 86400 ? Math.round(s / 3600) + " 小时前" : Math.round(s / 86400) + " 天前";
  }

  // 地址 → 主名字（两个后缀都查，先 .ailgns 后 .lgns）；同一页里查过的记住
  var nameCache = {};
  function nameOf(a) {
    a = String(a).toLowerCase();
    if (!nameCache[a]) nameCache[a] = Promise.all(["ailgns", "lgns"].map(function (t) {
      return call(NAMES[t], SEL.nameOf + A.pad(a)).then(function (r) { var n = decStr(r); return n ? n + "." + t : ""; }, function () { return ""; });
    })).then(function (x) { return x[0] || x[1]; });
    return nameCache[a];
  }
  // 页面里所有 data-a 的地址，查到名字就换成「名字 + 短地址」
  function fillNames(root) {
    root.querySelectorAll("[data-a]").forEach(function (e) {
      nameOf(e.getAttribute("data-a")).then(function (n) { if (n) { e.innerHTML = '<b class="sc-nm">' + esc(n) + "</b> <small>" + A.short(e.getAttribute("data-a")) + "</small>"; e.title = e.getAttribute("data-a"); } });
    });
  }
  function addr(a) { return a ? '<a class="sc-a mono" href="#/scan/' + a + '" data-a="' + a + '">' + A.short(a) + "</a>" : "—"; }

  function page() {
    var q = decodeURIComponent(location.hash.split("/")[2] || "").trim();
    A.app.innerHTML = '<section class="card"><h2>🔎 AiLGNS 浏览器 <small class="muted">Anubis 链</small></h2>' +
      '<form class="nm-search" id="sc-f"><input id="sc-q" placeholder="搜域名 / 地址 / 交易哈希" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(q) + '"><button type="submit">搜索</button></form>' +
      '<p class="muted sc-tip">例：加拿大局长.lgns · 0x 开头的地址 · 交易哈希。数据来自 Anubis 官方浏览器，每项都能点去官方核对。</p></section><div id="sc-out"></div>';
    document.getElementById("sc-f").onsubmit = function (e) {
      e.preventDefault();
      var v = document.getElementById("sc-q").value.trim();
      if (v) location.hash = "#/scan/" + encodeURIComponent(v);
    };
    var out = document.getElementById("sc-out");
    if (!q) return;
    var low = q.toLowerCase();
    out.innerHTML = '<section class="card"><p class="muted">查询中…</p></section>';
    var job;
    if (/^0x[0-9a-f]{64}$/.test(low)) job = txView(low, out);
    else if (/^0x[0-9a-f]{40}$/.test(low)) job = addrView(low, out, "");
    else job = nameView(low, out);
    job.catch(function (e) { out.innerHTML = '<section class="card"><p class="nm-bad">查询失败：' + esc(e.message || e) + "</p></section>"; });
  }

  // 域名：没写后缀就两个后缀都查
  function nameView(q, out) {
    var m = q.match(/^(.+)\.(ailgns|lgns)$/), tries = m ? [[m[1], m[2]]] : [[q, "ailgns"], [q, "lgns"]];
    return Promise.all(tries.map(function (t) { return call(NAMES[t[1]], SEL.resolve + str(t[0])).then(function (r) { return { label: t[0], tld: t[1], a: "0x" + r.slice(26) }; }); })).then(function (rs) {
      var hit = rs.filter(function (r) { return r.a !== ZERO; })[0];
      if (!hit) { out.innerHTML = '<section class="card"><p class="nm-bad">没找到「' + esc(q) + '」：这个域名还没注册或已过期</p><p><a href="#/names/' + encodeURIComponent(m ? q : q + ".ailgns") + '">去注册 →</a></p></section>'; return; }
      return addrView(hit.a, out, hit.label + "." + hit.tld);
    });
  }

  // 地址：主名字、余额、拥有的域名、最近交易
  function addrView(a, out, via) {
    return Promise.all([get("/addresses/" + a), get("/addresses/" + a + "/token-balances").catch(function () { return []; }), get("/addresses/" + a + "/nft?type=ERC-721").catch(function () { return { items: [] }; }), get("/addresses/" + a + "/transactions").catch(function () { return { items: [] }; }), nameOf(a)]).then(function (x) {
      var info = x[0], bals = x[1] || [], nfts = (x[2].items || []), txs = (x[3].items || []).slice(0, 25), primary = x[4];
      var mine = nfts.filter(function (n) { var t = (n.token.address_hash || "").toLowerCase(); return t === NAMES.ailgns || t === NAMES.lgns; });
      var keep = ["DAI", "LGNS", "AiLGNS", "gLGNS"];
      var shown = bals.filter(function (b) { return b.token && b.token.type === "ERC-20" && keep.indexOf(b.token.symbol) >= 0; });
      out.innerHTML =
        '<section class="card"><div class="card-head"><h2>' + (via ? "🌐 " + esc(via) : "👤 地址") + '</h2><a href="' + WEB + "/address/" + a + '" target="_blank" rel="noopener">官方浏览器核对 ↗</a></div>' +
        (via ? '<p class="muted">这个域名指向：</p>' : "") + '<p class="mono sc-addr">' + a + "</p>" +
        (primary ? '<p>主名字：<b class="sc-nm">' + esc(primary) + "</b></p>" : '<p class="muted">还没设主名字</p>') +
        (info.is_contract ? '<p class="muted">这是合约' + (info.name ? "：" + esc(info.name) : "") + "</p>" : "") + "</section>" +
        '<section class="card"><h2>💰 余额</h2><div class="sc-bal">' + shown.map(function (b) { return "<div><span>" + esc(b.token.symbol) + "</span><b>" + amt(b.value, b.token.decimals) + "</b></div>"; }).join("") +
        (shown.length ? "" : '<p class="muted">没有 DAI / LGNS / AiLGNS / gLGNS</p>') + "</div></section>" +
        '<section class="card"><h2>🌐 拥有的域名（' + mine.length + "）</h2>" + (mine.length ? '<div class="sc-names">' + mine.map(function (n) {
          var nm = (n.metadata && n.metadata.name) || "";
          return '<a href="#/names/' + encodeURIComponent(nm) + '">' + esc(nm || "#" + String(n.id).slice(0, 8)) + "</a>";
        }).join("") + "</div>" : '<p class="muted">没有 .ailgns / .lgns 域名 · <a href="#/names">去注册 →</a></p>') + "</section>" +
        '<section class="card"><h2>📜 最近交易</h2>' + (txs.length ? '<div class="sc-txs">' + txs.map(function (t) {
          var sel = (t.raw_input || "").slice(0, 10), m = METHODS[sel] || t.method || (t.raw_input && t.raw_input !== "0x" ? sel : "转账");
          var outgoing = t.from && t.from.hash.toLowerCase() === a;
          return '<div class="sc-tx"><div><a class="mono" href="#/scan/' + t.hash + '">' + t.hash.slice(0, 10) + "…</a> <em>" + esc(m) + "</em>" + (t.result === "success" ? "" : ' <b class="nm-bad">失败</b>') +
            "<small>" + ago(t.timestamp) + "</small></div><div>" + (outgoing ? '<span class="sc-out">发出 → </span>' + addr(t.to && t.to.hash) : '<span class="sc-in">收到 ← </span>' + addr(t.from && t.from.hash)) + "</div></div>";
        }).join("") + "</div>" : '<p class="muted">没有交易</p>') + "</section>";
      fillNames(out);
    });
  }

  // 交易：状态、双方、手续费、代币转账（地址都换成域名）
  function txView(h, out) {
    return Promise.all([get("/transactions/" + h), get("/transactions/" + h + "/token-transfers").catch(function () { return { items: [] }; })]).then(function (x) {
      var t = x[0], tt = x[1].items || [], sel = (t.raw_input || "").slice(0, 10), ok = t.result === "success";
      out.innerHTML = '<section class="card"><div class="card-head"><h2>🧾 交易</h2><a href="' + WEB + "/tx/" + h + '" target="_blank" rel="noopener">官方浏览器核对 ↗</a></div>' +
        '<p class="mono sc-addr">' + h + "</p>" +
        '<dl class="nm-dl"><dt>状态</dt><dd>' + (ok ? '<b class="nm-ok">✅ 成功</b>' : '<b class="nm-bad">❌ ' + esc(t.result || "失败") + "</b>") + "</dd>" +
        "<dt>操作</dt><dd>" + esc(METHODS[sel] || t.method || "转账") + "</dd>" +
        "<dt>区块</dt><dd>" + t.block_number + "（" + ago(t.timestamp) + "）</dd>" +
        "<dt>发起</dt><dd>" + addr(t.from && t.from.hash) + "</dd><dt>对象</dt><dd>" + addr(t.to && t.to.hash) + (t.to && t.to.name ? " <small>" + esc(t.to.name) + "</small>" : "") + "</dd>" +
        "<dt>手续费</dt><dd>" + amt(t.fee && t.fee.value, 18) + " DAI</dd></dl></section>" +
        (tt.length ? '<section class="card"><h2>🔁 代币转账</h2><div class="sc-txs">' + tt.map(function (r) {
          var v = r.total && r.total.value != null ? amt(r.total.value, r.total.decimals) + " " + esc(r.token.symbol) : (r.total && r.total.token_id ? esc(r.token.name || "NFT") : "");
          return '<div class="sc-tx"><div>' + addr(r.from && r.from.hash) + " → " + addr(r.to && r.to.hash) + "</div><div><b>" + v + "</b></div></div>";
        }).join("") + "</div></section>" : "");
      fillNames(out);
    });
  }

  A.pages.scan = page;
})();
