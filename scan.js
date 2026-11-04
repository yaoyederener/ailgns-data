// 轻量区块浏览器（Anubis 链）：一个搜索框搜域名（xxx.ailgns / xxx.lgns）、地址、交易哈希；
// 链上数据借用 Anubis 官方浏览器（Blockscout）的公开接口，再把地址换成我们的域名显示
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  var WEB = "https://browser.anubispace.org";
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
  KNOWN["0xdcc5354175d60ffc8364e71e792fcd66366f00fe"] = "OTC 自动撮合合约";
  KNOWN["0x6ec474047a6c12d0cab53855a990c1c8b3996c20"] = "OTC 批量扫单合约";
  KNOWN["0xb6a7a3be9a17ad241665ab9bddbd9a573d488818"] = "LGNS OTC";
  KNOWN["0x4e730be6d46be71223ded5a32dc45799f6d4bc15"] = "AiLGNS OTC";
  KNOWN["0x2b0ab121d60f823fffc4cef75af26055df388e2b"] = "gLGNS OTC";
  KNOWN["0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c"] = "像素墙 / 游戏";
  KNOWN[NAMES.ailgns] = ".ailgns 域名合约";
  KNOWN[NAMES.lgns] = ".lgns 域名合约";
  KNOWN["0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e"] = ".ailgns 域名市场";
  KNOWN["0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d"] = ".lgns 域名市场";

  // 先走我们自己的缓存代理（/api/bs，30 秒边缘缓存，官方接口冷启动慢时也快）；代理不通再直连官方接口
  function viaProxy(p) {
    return fetch("/api/bs?p=" + encodeURIComponent(p)).then(function (r) { if (!r.ok || (r.headers.get("content-type") || "").indexOf("json") < 0) throw new Error("proxy"); return r.json(); })
      .catch(function () { return fetch(WEB + p).then(function (r) { if (!r.ok) throw new Error("浏览器接口返回 " + r.status); return r.json(); }); });
  }
  function get(path) { return viaProxy("/api/v2" + path); }
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

  // 设过主名字的地址：读两个合约的 PrimaryChanged 记录（官方浏览器接口一次最多 1000 条），5 分钟刷新一次。
  // 只有这些地址才去链上查名字，全站成百上千个地址也不会每个都查
  var T_PRIMARY = "0xcce410882185feecc3dc31bf1f98597f94091d6830a2a5776ef494454c2f4930", cand = null, candAt = 0;
  function candidates() {
    if (!cand || Date.now() - candAt > 300000) {
      candAt = Date.now();
      cand = Promise.all(["ailgns", "lgns"].map(function (t) {
        return viaProxy("/api?module=logs&action=getLogs&fromBlock=18161690&toBlock=latest&address=" + NAMES[t] + "&topic0=" + T_PRIMARY);
      })).then(function (x) {
        var set = {};
        x.forEach(function (d) { (d.result || []).forEach(function (l) { set["0x" + l.topics[1].slice(26)] = 1; }); });
        return set;
      }, function () { return null; }); // 读不到就退回每个地址都查
    }
    return cand;
  }
  // 地址 → 名字：优先显示 .ailgns，没设 .ailgns 才显示 .lgns；同一页里查过的记住
  var nameCache = {};
  // 没设主名字的地址：用他名下的域名代替钱包地址（读 Transfer 记录得出每个名字现在归谁，5 分钟刷新一次）
  var T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", owned = null, ownedAt = 0;
  function ownedMap() {
    if (!owned || Date.now() - ownedAt > 300000) {
      ownedAt = Date.now();
      owned = Promise.all(["ailgns", "lgns"].map(function (t) {
        return viaProxy("/api?module=logs&action=getLogs&fromBlock=18161690&toBlock=latest&address=" + NAMES[t] + "&topic0=" + T_XFER).then(function (d) {
          var cur = {};
          // 挂在域名市场里的名字（转进托管合约），仍然算挂单人的
          var ESC = { "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e": 1, "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d": 1 };
          (d.result || []).forEach(function (l) { var to = "0x" + l.topics[2].slice(26), from = "0x" + l.topics[1].slice(26); cur[l.topics[3]] = { to: ESC[to] ? from : to, b: parseInt(l.blockNumber, 16) }; });
          return cur;
        });
      })).then(function (x) {
        var by = {};
        ["ailgns", "lgns"].forEach(function (t, i) {
          Object.keys(x[i]).forEach(function (id) { var o = x[i][id]; (by[o.to] = by[o.to] || []).push({ t: t, id: id, b: o.b }); });
        });
        // 优先 .ailgns，再按拿到的先后（最早的那个）
        Object.keys(by).forEach(function (a) { by[a].sort(function (p, q) { return (p.t === "ailgns" ? 0 : 1) - (q.t === "ailgns" ? 0 : 1) || p.b - q.b; }); });
        return by;
      }, function () { return {}; });
    }
    return owned;
  }
  function anyName(a) {
    return ownedMap().then(function (by) {
      var list = (by[a] || []).slice(0, 5), HN = A.hiddenNames || {};
      return list.reduce(function (pr, x) {
        return pr.then(function (got) {
          if (got) return got;
          return call(NAMES[x.t], "0x36bf1f0c" + x.id.slice(2)).then(function (r) { var n = decStr(r); return n && !HN[n + "." + x.t] ? n + "." + x.t : ""; }, function () { return ""; });
        });
      }, Promise.resolve(""));
    });
  }
  function nameOf(a) {
    a = String(a).toLowerCase();
    if (A.hidden && A.hidden[a]) return Promise.resolve(""); // 匿名持有人：不把地址换成名字
    if (!nameCache[a]) nameCache[a] = candidates().then(function (set) {
      if (set && !set[a]) return "";
      return Promise.all(["ailgns", "lgns"].map(function (t) {
        return call(NAMES[t], SEL.nameOf + A.pad(a)).then(function (r) { var n = decStr(r); return n && !(A.hiddenNames || {})[n + "." + t] ? n + "." + t : ""; }, function () { return ""; });
      })).then(function (x) { return x[0] || x[1]; });
    }).then(function (n) { return n || anyName(a); }); // 设了主名字用主名字；没设就用他名下的域名
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
        if (first) box.innerHTML = "";
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
      '<p class="muted sc-tip">例：xxx.ailgns · 0x 开头的地址 · 交易哈希。数据来自 Anubis 官方浏览器，每项都能点去官方核对。</p></section><div id="sc-out"></div>';
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
      if ((A.hidden && A.hidden[hit.a.toLowerCase()]) || (A.hiddenNames || {})[hit.label + "." + hit.tld]) { out.innerHTML = '<section class="card"><h2>🌐 ' + esc(hit.label + "." + hit.tld) + '</h2><p class="muted">🔒 这个域名的持有人选择匿名，不公开地址。</p></section>'; return; }
      return addrView(hit.a, out, hit.label + "." + hit.tld);
    });
  }

  // 地址：主名字、余额、拥有的域名、最近交易
  function addrView(a, out, via) {
    // 先把页面骨架画出来，各块数据谁先到谁先显示（官方接口有时某一个要等十几秒，不能让整页一起等）
    var label = esc(via || A.short(a)), wait = '<p class="muted">读取中…</p>';
    out.innerHTML =
      '<section class="card"><div class="card-head"><h2>' + (via ? "🌐 " + esc(via) : "👤 地址") + '</h2><a href="' + WEB + "/address/" + a + '" target="_blank" rel="noopener">官方浏览器核对 ↗</a></div>' +
      (via ? '<p class="muted">这个域名指向：</p>' : "") + '<p class="mono sc-addr">' + a + '</p><div id="sc-who"></div></section>' +
      '<section class="card"><h2>💰 余额</h2><div class="sc-bal" id="sc-bal">' + wait + "</div></section>" +
      '<section class="card"><h2 id="sc-nh">🌐 拥有的域名</h2><div id="sc-names">' + wait + "</div></section>" +
      '<section class="card"><div class="card-head"><h2>💸 <span class="sc-lbl">' + label + '</span> 的代币收付</h2><span class="muted"><span id="sc-ntt">…</span> 笔 · 收到和转出的 DAI、LGNS 等</span></div><div class="sc-txs" id="sc-tt">' + wait + '</div></section>' +
      '<section class="card"><div class="card-head"><h2>📜 <span class="sc-lbl">' + label + '</span> 发起的交易</h2><span class="muted"><span id="sc-ntx">…</span> 笔 · 这个地址自己签名发出的</span></div><div class="sc-txs" id="sc-tx">' + wait + '</div></section>';
    var el = function (id) { return document.getElementById(id); };
    nameOf(a).then(function (primary) {
      if (primary) out.querySelectorAll(".sc-lbl").forEach(function (e) { e.textContent = primary; });
      get("/addresses/" + a).catch(function () { return {}; }).then(function (info) {
        if (!el("sc-who")) return;
        el("sc-who").innerHTML = (primary ? '<p>主名字：<b class="sc-nm">' + esc(primary) + "</b></p>" : '<p class="muted">还没设主名字</p>') +
          (info.is_contract ? '<p class="muted">这是合约' + (info.name ? "：" + esc(info.name) : "") + "</p>" : "");
      });
    });
    get("/addresses/" + a + "/token-balances").catch(function () { return []; }).then(function (bals) {
      var keep = ["DAI", "LGNS", "AiLGNS", "gLGNS"], shown = (bals || []).filter(function (b) { return b.token && b.token.type === "ERC-20" && keep.indexOf(b.token.symbol) >= 0; });
      if (el("sc-bal")) el("sc-bal").innerHTML = shown.map(function (b) { return "<div><span>" + esc(b.token.symbol) + "</span><b>" + amt(b.value, b.token.decimals) + "</b></div>"; }).join("") || '<p class="muted">没有 DAI / LGNS / AiLGNS / gLGNS</p>';
    });
    allNfts(a).then(function (x) {
      var mine = (x.items || []).filter(function (n) { var t = (n.token.address_hash || "").toLowerCase(); return t === NAMES.ailgns || t === NAMES.lgns; });
      if (!el("sc-names")) return;
      if (A.hidden && A.hidden[String(a).toLowerCase()]) { el("sc-names").innerHTML = '<p class="muted">🔒 不公开</p>'; return; } // 匿名持有人
      el("sc-nh").textContent = "🌐 拥有的域名（" + mine.length + "）";
      el("sc-names").innerHTML = mine.length ? '<div class="sc-names">' + mine.map(function (n) {
        var nm = (n.metadata && n.metadata.name) || "";
        return '<a href="#/names/' + encodeURIComponent(nm) + '">' + esc(nm || "#" + String(n.id).slice(0, 8)) + "</a>";
      }).join("") + "</div>" : '<p class="muted">没有 .ailgns / .lgns 域名 · <a href="#/names">去注册 →</a></p>';
    });
    get("/addresses/" + a + "/counters").then(function (c) {
      if (el("sc-ntt")) { el("sc-ntt").textContent = "共 " + (c.token_transfers_count || "?"); el("sc-ntx").textContent = "共 " + (c.transactions_count || "?"); }
    }, function () {});
    paged(el("sc-tt"), "/addresses/" + a + "/token-transfers", function (r) {
      var inc = r.to && r.to.hash.toLowerCase() === a, v = r.total && r.total.value != null ? amt(r.total.value, r.total.decimals) + " " + esc(r.token.symbol) : nft(r);
      return '<div class="sc-tx"><div>' + (inc ? '<span class="sc-in">收到 ' : '<span class="sc-out">转出 ') + "<b>" + v + "</b></span><small>" + ago(r.timestamp) + '</small> <a class="mono" href="#/scan/' + r.transaction_hash + '">' + r.transaction_hash.slice(0, 10) + "…</a></div><div>" + (inc ? "来自 " + addr(r.from && r.from.hash) : "给 " + addr(r.to && r.to.hash)) + "</div></div>";
    }, "没有代币收付记录");
    paged(el("sc-tx"), "/addresses/" + a + "/transactions", function (t) {
      var sel = (t.raw_input || "").slice(0, 10), m = METHODS[sel] || t.method || (t.raw_input && t.raw_input !== "0x" ? sel : "转账");
      var outgoing = t.from && t.from.hash.toLowerCase() === a;
      return '<div class="sc-tx"><div><a class="mono" href="#/scan/' + t.hash + '">' + t.hash.slice(0, 10) + "…</a> <em>" + esc(m) + "</em>" + (t.result === "success" ? "" : ' <b class="nm-bad">失败</b>') +
        "<small>" + ago(t.timestamp) + "</small></div><div>" + (outgoing ? '<span class="sc-out">发出 → </span>' + addr(t.to && t.to.hash) : '<span class="sc-in">收到 ← </span>' + addr(t.from && t.from.hash)) + "</div></div>";
    }, "没有交易");
    return Promise.resolve();
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

  // 全站：页面上出现的短地址（0x1234…abcd），只要这个地址设了主名字，就换成域名显示
  var SKIP = { INPUT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1 }, SHORT_RE = /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/g, timer = 0;
  function swapAll() {
    timer = 0;
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, hits = [];
    while ((n = w.nextNode())) if (n.nodeValue.indexOf("…") >= 0 && /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/.test(n.nodeValue) && n.parentNode && !SKIP[n.parentNode.nodeName]) hits.push(n);
    hits.forEach(function (node) {
      (node.nodeValue.match(SHORT_RE) || []).forEach(function (s) {
        var full = A.shorts && A.shorts[s];
        if (!full) return;
        // 荣耀榜总榜前 50：名字前面加段位徽章（荣耀榜页面和顶部播报条里不加，避免重复）
        Promise.all([nameOf(full), A.rankReady || null]).then(function (x) {
          var nm = x[0], p = node.parentNode, nb = p && p.closest && p.closest("[data-nb]"), bg = !nb && A.rankBadge ? A.rankBadge(full) : "";
          if (node.nodeValue.indexOf(s) < 0) return;
          if (!nm && (!bg || node.nodeValue.indexOf(bg + s) >= 0)) return;
          node.nodeValue = node.nodeValue.replace(s, bg + (nm || s));
          if (p && !p.title) p.title = full + (bg ? " · " + A.rankTitle(full) : "");
        });
      });
    });
  }
  new MutationObserver(function () { if (!timer) timer = setTimeout(swapAll, 300); }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // 给 OTC 等页面用：地址先显示短地址，查到主名字后换成名字
  A.nameTag = function (a) { return '<span data-a="' + a + '">' + A.short(a) + "</span>"; };
  A.fillNames = fillNames;
  A.nameOf = nameOf; // 荣耀榜播报：没域名的大哥引导去注册
  A.pages.scan = page;
})();
