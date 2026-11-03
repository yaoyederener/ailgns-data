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
  // 平台自己的合约：直接显示中文名，客户一眼看懂钱去哪了
  var KNOWN = {};
  KNOWN[ZERO] = "🆕 新注册";
  KNOWN["0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3"] = "回购分账合约";
  KNOWN["0xb6a7a3be9a17ad241665ab9bddbd9a573d488818"] = "LGNS OTC";
  KNOWN["0x4e730be6d46be71223ded5a32dc45799f6d4bc15"] = "AiLGNS OTC";
  KNOWN["0x2b0ab121d60f823fffc4cef75af26055df388e2b"] = "gLGNS OTC";
  KNOWN["0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c"] = "像素墙 / 游戏";
  KNOWN[NAMES.ailgns] = ".ailgns 域名合约";
  KNOWN[NAMES.lgns] = ".lgns 域名合约";
  KNOWN["0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e"] = ".ailgns 域名市场";
  KNOWN["0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d"] = ".lgns 域名市场";

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

  // 地址 → 主名字：两个后缀都查，都设了就两个一起显示；同一页里查过的记住
  var nameCache = {};
  function nameOf(a) {
    a = String(a).toLowerCase();
    if (!nameCache[a]) nameCache[a] = Promise.all(["ailgns", "lgns"].map(function (t) {
      return call(NAMES[t], SEL.nameOf + A.pad(a)).then(function (r) { var n = decStr(r); return n ? n + "." + t : ""; }, function () { return ""; });
    })).then(function (x) { return x.filter(Boolean).join(" · "); });
    return nameCache[a];
  }
  // 页面里所有 data-a 的地址，查到名字就换成「名字 + 短地址」
  function fillNames(root) {
    // 域名 NFT：把「LGNS Names」换成具体是哪个名字
    root.querySelectorAll("[data-nft]").forEach(function (e) {
      var x = e.getAttribute("data-nft").split(":");
      e.removeAttribute("data-nft");
      call(NAMES[x[0]], "0x36bf1f0c" + u256(x[1])).then(function (r) { var n = decStr(r); if (n) e.textContent = "🌐 " + n + "." + x[0]; }, function () {});
    });
    root.querySelectorAll("[data-a]").forEach(function (e) {
      if (KNOWN[e.getAttribute("data-a").toLowerCase()]) return;
      nameOf(e.getAttribute("data-a")).then(function (n) { if (n) { e.innerHTML = '<b class="sc-nm">' + esc(n) + "</b> <small>" + A.short(e.getAttribute("data-a")) + "</small>"; e.title = e.getAttribute("data-a"); } });
    });
  }
  // 分页列表：先显示一页，「加载更多」按官方接口给的下一页参数继续读
  function paged(box, path, row, empty) {
    var next = null;
    function load(first) {
      var q = next ? (path.indexOf("?") >= 0 ? "&" : "?") + Object.keys(next).map(function (k) { return k + "=" + encodeURIComponent(next[k]); }).join("&") : "";
      var more = box.querySelector(".sc-more");
      if (more) more.textContent = "读取中…";
      return get(path + q).then(function (d) {
        var items = d.items || [];
        if (first && !items.length) { box.innerHTML = '<p class="muted">' + empty + "</p>"; return; }
        if (more) more.remove();
        box.insertAdjacentHTML("beforeend", items.map(row).join(""));
        next = d.next_page_params;
        if (next) {
          box.insertAdjacentHTML("beforeend", '<button type="button" class="sc-more">加载更多</button>');
          box.querySelector(".sc-more").onclick = function () { load(false); };
        }
        fillNames(box);
      }, function () { if (more) more.textContent = "读取失败，点我重试"; else box.innerHTML = '<p class="muted">读取失败，请稍后再试</p>'; });
    }
    return load(true);
  }

  function nft(r) {
    var t = (r.token && r.token.address_hash || "").toLowerCase(), id = r.total && r.total.token_id, tld = t === NAMES.ailgns ? "ailgns" : t === NAMES.lgns ? "lgns" : "";
    return tld && id ? '<span data-nft="' + tld + ":" + id + '">🌐 域名</span>' : esc((r.token && r.token.name) || "NFT");
  }
  // 地址拥有的 NFT：官方接口一页 50 个，旧版合约的保留名会占满第一页，所以翻页读完（最多 10 页）
  function allNfts(a) {
    var items = [];
    function page(next, n) {
      var q = next ? "&" + Object.keys(next).map(function (k) { return k + "=" + encodeURIComponent(next[k]); }).join("&") : "";
      return get("/addresses/" + a + "/nft?type=ERC-721" + q).then(function (d) {
        items = items.concat(d.items || []);
        return d.next_page_params && n < 10 ? page(d.next_page_params, n + 1) : { items: items };
      });
    }
    return page(null, 1).catch(function () { return { items: items }; });
  }
  function addr(a) {
    var k = a && KNOWN[a.toLowerCase()];
    if (k) return '<a class="sc-a" href="#/scan/' + a + '" data-a="' + a + '" title="' + a + '"><b class="sc-kn">' + k + "</b></a>";
    return a ? '<a class="sc-a mono" href="#/scan/' + a + '" data-a="' + a + '">' + A.short(a) + "</a>" : "—"; }

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
    return Promise.all([get("/addresses/" + a), get("/addresses/" + a + "/token-balances").catch(function () { return []; }), allNfts(a), get("/addresses/" + a + "/counters").catch(function () { return {}; }), nameOf(a)]).then(function (x) {
      var info = x[0], bals = x[1] || [], nfts = (x[2].items || []), cnt = x[3] || {}, primary = x[4];
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
        '<section class="card"><div class="card-head"><h2>💸 ' + esc(primary || via || A.short(a)) + ' 的代币收付</h2><span class="muted">共 ' + (cnt.token_transfers_count || "?") + ' 笔 · 收到和转出的 DAI、LGNS 等</span></div><div class="sc-txs" id="sc-tt"></div></section>' +
        '<section class="card"><div class="card-head"><h2>📜 ' + esc(primary || via || A.short(a)) + ' 发起的交易</h2><span class="muted">共 ' + (cnt.transactions_count || "?") + ' 笔 · 这个地址自己签名发出的</span></div><div class="sc-txs" id="sc-tx"></div></section>';
      fillNames(out);
      paged(document.getElementById("sc-tt"), "/addresses/" + a + "/token-transfers", function (r) {
        var inc = r.to && r.to.hash.toLowerCase() === a, v = r.total && r.total.value != null ? amt(r.total.value, r.total.decimals) + " " + esc(r.token.symbol) : nft(r);
        return '<div class="sc-tx"><div>' + (inc ? '<span class="sc-in">收到 ' : '<span class="sc-out">转出 ') + "<b>" + v + "</b></span><small>" + ago(r.timestamp) + '</small> <a class="mono" href="#/scan/' + r.transaction_hash + '">' + r.transaction_hash.slice(0, 10) + "…</a></div><div>" + (inc ? "来自 " + addr(r.from && r.from.hash) : "给 " + addr(r.to && r.to.hash)) + "</div></div>";
      }, "没有代币收付记录");
      paged(document.getElementById("sc-tx"), "/addresses/" + a + "/transactions", function (t) {
        var sel = (t.raw_input || "").slice(0, 10), m = METHODS[sel] || t.method || (t.raw_input && t.raw_input !== "0x" ? sel : "转账");
        var outgoing = t.from && t.from.hash.toLowerCase() === a;
        return '<div class="sc-tx"><div><a class="mono" href="#/scan/' + t.hash + '">' + t.hash.slice(0, 10) + "…</a> <em>" + esc(m) + "</em>" + (t.result === "success" ? "" : ' <b class="nm-bad">失败</b>') +
          "<small>" + ago(t.timestamp) + "</small></div><div>" + (outgoing ? '<span class="sc-out">发出 → </span>' + addr(t.to && t.to.hash) : '<span class="sc-in">收到 ← </span>' + addr(t.from && t.from.hash)) + "</div></div>";
      }, "没有交易");
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
          var v = r.total && r.total.value != null ? amt(r.total.value, r.total.decimals) + " " + esc(r.token.symbol) : nft(r);
          return '<div class="sc-tx"><div>' + addr(r.from && r.from.hash) + " → " + addr(r.to && r.to.hash) + "</div><div><b>" + v + "</b></div></div>";
        }).join("") + "</div></section>" : "");
      fillNames(out);
    });
  }

  A.pages.scan = page;
})();
