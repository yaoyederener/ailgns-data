// AiLGNS 账本（2026-11-05 起）：只服务本站的中文链上记录。搜域名 / 地址 / 交易哈希，每一笔翻译成一句人话（买入、卖出、挂单、注册、借贷、转账…）
// 链上数据借用 Anubis 官方浏览器（Blockscout）的公开接口；区块、Gas、日志这些统统不显示
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
  // 🔒 团队运营地址（站长 2026-11-07：维护团队隐私，账本里统一显示为「运营维护」，不展示明细）
  var TEAM = {};
  ["0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", "0xeee877c1b6285b82890bdcd027d2715f658ecf23", "0xcc274e07847a6a86917b6ccd4e67706170d4036f",
   "0xd53a00bb90bb606f10d888419a14eca779f17285", "0xe8782615e32557f257dd88d70b1eb0d7f47b91c3", "0x5505d382bf5d705c5d3ec0cbfc17a3dde394b322",
   "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", "0x06cc2a46d7ad17496c2de9c61362808e06b44437"].forEach(function (x) { TEAM[x] = 1; KNOWN[x] = "🔧 运营维护"; });
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
  function amt(v, d) { var x = Number(v || 0) / Math.pow(10, Number(d || 18)); if (x < 1e-6) x = 0; return x === 0 ? "0" : x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : x >= 1 ? x.toFixed(4).replace(/\.?0+$/, "") : x.toPrecision(4); }
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
      // 只显示名字（不再跟一个短地址：那个短地址又会被全站换名字逻辑换成名字，变成重复两次）；完整地址放在鼠标悬停提示里
      var full = e.getAttribute("data-a");
      Promise.all([nameOf(full), A.rankReady || null]).then(function (x) {
        var n = x[0]; if (!n) return;
        var bg = A.rankBadge && !(e.closest && e.closest("[data-nb]")) ? A.rankBadge(full) : "";
        e.innerHTML = '<b class="sc-nm">' + bg + esc(n) + "</b>"; e.title = full + (bg ? " · " + A.rankTitle(full) : "");
      });
    });
  }
  // ===== 账本（2026-11-05 站长定：只服务本站，每一笔翻译成人话，官方浏览器那些区块 / Gas / 日志统统不要）=====
  var C = {
    otc: { "0x4e730be6d46be71223ded5a32dc45799f6d4bc15": "AiLGNS", "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818": "LGNS", "0x2b0ab121d60f823fffc4cef75af26055df388e2b": "gLGNS", "0x8c67912b3ed44f4512c2f22b7b2263f6659396ed": "AWAKE NFT 卡牌" },
    market: { "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e": 1, "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d": 1 },
    loan: { "0x242ab392571d325d814a48892ac16115a6d285dc": "AiLGNS", "0x8d84d678d195e770caad263d1c37967ec796165c": "AiLGNS（旧）", "0x439cb33e9c5d7a26dd1fa503efe6fd3033ac173b": "LGNS", "0x00e674bb1559557966a6c2244c36d12a63218a5f": "gLGNS" },
    sweep: { "0xdcc5354175d60ffc8364e71e792fcd66366f00fe": 1, "0x6ec474047a6c12d0cab53855a990c1c8b3996c20": 1 }, play: "0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c",
    buyback: "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", pool: "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4",
    tokens: { "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14": "DAI", "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb": "AiLGNS", "0x4d1d808a081fdac440703b3765fc61f8028c06b8": "LGNS", "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c": "gLGNS" }
  };
  KNOWN[C.pool] = "预言家奖池钱包";
  var who = function (a) { return a ? '<span data-a="' + a + '" class="lg-who">' + (KNOWN[a.toLowerCase()] || A.short(a)) + "</span>" : ""; };
  var nftTag = function (m) { return m && m.nft ? '<b data-nft="' + m.nft.tld + ":" + m.nft.id + '">🌐 域名</b>' : ""; };
  function bj(ts) { var d = new Date(new Date(ts).getTime() + 8 * 3600e3); return (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
  // 一笔交易里和「我」有关的币怎么动：进 / 出、币种、数量、对方
  function moves(a, tr) {
    return (tr || []).map(function (r) {
      var to = (r.to && r.to.hash || "").toLowerCase(), from = (r.from && r.from.hash || "").toLowerCase(), tok = (r.token && r.token.address_hash || "").toLowerCase();
      var tld = tok === NAMES.ailgns ? "ailgns" : tok === NAMES.lgns ? "lgns" : "", id = r.total && r.total.token_id;
      return { dir: to === a ? "in" : from === a ? "out" : "", sym: tld ? "域名" : (r.token && r.token.symbol) || "?", v: tld ? 0 : Number(r.total && r.total.value || 0) / Math.pow(10, Number(r.total && r.total.decimals || 18)), vs: tld ? "" : amt(r.total && r.total.value, r.total && r.total.decimals), nft: tld && id ? { tld: tld, id: id } : null, other: to === a ? from : to };
    }).filter(function (m) { return m.dir; });
  }
  var sumOf = function (ms, dir, sym) { return ms.filter(function (m) { return m.dir === dir && (!sym || m.sym === sym) && !m.nft; }).reduce(function (t, m) { return t + m.v; }, 0); };
  var fmtN = function (v, sym) { return "<b>" + (v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v >= 1 ? +v.toFixed(4) : +v.toPrecision(4)) + " " + esc(sym) + "</b>"; };
  var firstIn = function (ms, sym) { return ms.filter(function (m) { return m.dir === "in" && (!sym || m.sym === sym); })[0]; };
  var firstOut = function (ms, sym) { return ms.filter(function (m) { return m.dir === "out" && (!sym || m.sym === sym); })[0]; };
  var pxOf = function (dai, coin) { return coin > 0 ? "，单价 " + (dai / coin).toFixed(3) : ""; };
  // 链上留言：0 元交易，data = utf8("ailgns-msg:" + 文字)
  var MSG_PREFIX = "ailgns-msg:", GUESS_PREFIX = "ailgns-oracle-guess:", ANCHOR_PREFIX = "ailgns-oracle:";
  function decodeMsg(input) {
    if (!input || input.length < 2 + MSG_PREFIX.length * 2) return null;
    try {
      var bytes = new Uint8Array((input.slice(2).match(/../g) || []).map(function (x) { return parseInt(x, 16); }));
      var str = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return str.indexOf(MSG_PREFIX) === 0 ? str.slice(MSG_PREFIX.length).slice(0, 300) : null;
    } catch (e) { return null; }
  }
  function encodeMsg(txt) { return "0x" + Array.prototype.map.call(new TextEncoder().encode(MSG_PREFIX + txt), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  // 把一笔交易翻译成一句人话：返回 { ico, text }
  function translate(a, row) {
    var t = row.tx, ms = moves(a, row.tr), sel = t && (t.raw_input || "").slice(0, 10), to = t && t.to && t.to.hash ? t.to.hash.toLowerCase() : "", ok = !t || t.result === "success";
    var nftIn = ms.filter(function (m) { return m.nft && m.dir === "in"; })[0], nftOut = ms.filter(function (m) { return m.nft && m.dir === "out"; })[0];
    var daiIn = sumOf(ms, "in", "DAI"), daiOut = sumOf(ms, "out", "DAI");
    var coinIn = ms.filter(function (m) { return m.dir === "in" && !m.nft && m.sym !== "DAI"; })[0], coinOut = ms.filter(function (m) { return m.dir === "out" && !m.nft && m.sym !== "DAI"; })[0];
    if (t && !ok) return { ico: "❌", text: "操作没成功（链上已回滚，没扣钱）" + (METHODS[sel] ? "：" + METHODS[sel] : "") };
    // 🔮 预言家存证：客户自己写上链的预测 / 奖池钱包封卷后写的全期指纹
    var rawIn = t && t.raw_input && t.raw_input.length > 2 ? (function () { try { return decodeURIComponent(t.raw_input.slice(2).replace(/(..)/g, "%$1")); } catch (e) { return ""; } })() : "";
    var gm = rawIn.indexOf(GUESS_PREFIX) === 0 ? rawIn.slice(GUESS_PREFIX.length).match(/^(\d{4}-\d{2}-\d{2}):([\d.,]+)/) : null;
    if (gm) { var gday = gm[1], gps = gm[2].split(","), md = gday.slice(5).replace("-", "/"); return { ico: "🔮", cls: "lg-oracle", text: "<b>预言家链上存证</b>：" + (t.from && t.from.hash.toLowerCase() === a ? "我" : who(t.from.hash.toLowerCase())) + "预测 <b>" + md + " 期</b>揭晓价 <b>" + gps.join("、") + " DAI</b><span class=\"lg-orc\" data-day=\"" + gday + "\" data-ps=\"" + esc(gm[2]) + "\">…</span>" }; }
    var am = rawIn.indexOf(ANCHOR_PREFIX) === 0 ? rawIn.slice(ANCHOR_PREFIX.length).match(/^(\d{4}-\d{2}-\d{2}):([0-9a-f]{64})/) : null;
    if (am) return { ico: "🔗", cls: "lg-oracle", text: "<b>预言家封卷存证</b>：" + am[1].slice(5).replace("-", "/") + " 期全部预测的指纹 <span class=\"mono\">" + am[2].slice(0, 16) + "…</span> 写入链上（<a href=\"#/oracle\">去验证 ›</a>）" };
    var mtxt = t && to && !KNOWN[to] && !C.tokens[to] ? decodeMsg(t.raw_input) : null;
    if (mtxt) { var mfrom = (t.from && t.from.hash || "").toLowerCase(); return mfrom === a ? { ico: "💬", text: "给 " + who(to) + " <b>留言</b>：「" + esc(mtxt) + "」" } : { ico: "📬", text: who(mfrom) + " <b>给你留言</b>：「" + esc(mtxt) + "」" }; }
    // —— 一键扫单 / 自动撮合（合约替你一次吃多张单）——
    if (C.sweep[to] || (!t && ms.some(function (m) { return C.sweep[m.other]; }))) {
      if (coinIn && daiOut) return { ico: "🛒", text: "<b>一键扫单买入</b> " + fmtN(coinIn.v, coinIn.sym) + "，花了 " + fmtN(daiOut, "DAI") + pxOf(daiOut, coinIn.v) };
      if (coinOut && daiIn) return { ico: "💰", text: "<b>一键扫单卖出</b> " + fmtN(coinOut.v, coinOut.sym) + "，收到 " + fmtN(daiIn, "DAI") + pxOf(daiIn, coinOut.v) };
      if (coinIn) return { ico: "🛒", text: "<b>扫单买入</b>到账 " + fmtN(coinIn.v, coinIn.sym) };
      if (daiIn) return { ico: "💰", text: "<b>扫单卖出</b>到账 " + fmtN(daiIn, "DAI") };
      if (daiOut) return { ico: "🛒", text: "<b>一键扫单</b>，付出 " + fmtN(daiOut, "DAI") };
      return { ico: "⇄", text: "一键扫单操作" + (t && sel === "0x095ea7b3" ? "：授权（不扣钱）" : "") };
    }
    if (to === C.play) return { ico: "🎮", text: "<b>销毁乐园</b>" + (coinOut ? "：投入 " + fmtN(coinOut.v, coinOut.sym) : "：玩游戏 / 像素墙") };
    // —— OTC（币 / 卡牌）——
    if (C.otc[to]) {
      var mk = C.otc[to];
      if (sel === "0x6fe4a448" || sel === "0xd6febde8") { // 吃单 / 买
        if (coinIn && daiOut) return { ico: "🛒", text: "在 OTC <b>买入</b> " + fmtN(coinIn.v, coinIn.sym) + "，花了 " + fmtN(daiOut, "DAI") + pxOf(daiOut, coinIn.v) };
        if (coinOut && daiIn) return { ico: "💰", text: "在 OTC <b>卖出</b> " + fmtN(coinOut.v, coinOut.sym) + "，收到 " + fmtN(daiIn, "DAI") + pxOf(daiIn, coinOut.v) };
        if (nftIn && daiOut) return { ico: "🛒", text: "在 OTC <b>买入</b>卡牌，花了 " + fmtN(daiOut, "DAI") };
      }
      if (sel === "0x9128a740" || sel === "0xca690ea2") { // 挂单
        if (coinOut) return { ico: "📌", text: "在 OTC <b>挂单卖出</b> " + fmtN(coinOut.v, coinOut.sym) + "（币先锁进合约，等买家）" };
        if (daiOut) return { ico: "📌", text: "在 OTC <b>挂单买入</b>，锁定 " + fmtN(daiOut, "DAI") + "（等卖家来成交）" };
        if (nftOut) return { ico: "📌", text: "在 OTC <b>挂单出售</b>卡牌" };
      }
      if (sel === "0x40e58ee5") return { ico: "↩️", text: "<b>撤单</b>，退回 " + (ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return m.nft ? "卡牌" : fmtN(m.v, m.sym); }).join("、") || "挂着的币") };
      if (!t && coinIn) return { ico: "✅", text: "你的 OTC <b>买单成交</b>，收到 " + fmtN(coinIn.v, coinIn.sym) + (daiIn ? "（多余的 DAI 也退回了）" : "") };
      if (!t && daiIn) return { ico: "✅", text: "你的 OTC <b>卖单成交</b>，收到 " + fmtN(daiIn, "DAI") };
      return { ico: "⇄", text: "OTC（" + esc(mk) + "）操作" + (METHODS[sel] ? "：" + METHODS[sel] : "") };
    }
    // —— 域名合约 ——
    if (to === NAMES.ailgns || to === NAMES.lgns) {
      if (sel === "0xd868a84f") return { ico: "🌐", text: "<b>注册域名</b> " + (nftTag(nftIn) || "") + (daiOut ? "，付 " + fmtN(daiOut, "DAI") : coinOut ? "，付 " + fmtN(coinOut.v, coinOut.sym) : "") };
      if (sel === "0x26e43e37") return { ico: "🔄", text: "<b>续费域名</b>" + (daiOut ? "，付 " + fmtN(daiOut, "DAI") : coinOut ? "，付 " + fmtN(coinOut.v, coinOut.sym) : "") + "（给谁的域名续费，名字还是原主人的）" };
      if (sel === "0x38e74feb") return { ico: "⭐", text: "<b>设置主名字</b>（以后别人看到这个地址就显示域名）" };
      if (sel === "0xeba36dbd") return { ico: "🔧", text: "<b>修改域名指向</b>的地址" };
      if (sel === "0xa22cb465" || sel === "0x095ea7b3") return { ico: "🔑", text: "<b>授权</b>域名市场代为转移域名（挂单前的准备，不花钱）" };
      if (sel === "0x23b872dd" || sel === "0x42842e0e" || sel === "0xb88d4fde") return nftOut ? { ico: "🎁", text: "<b>转让域名</b> " + nftTag(nftOut) + " 给 " + who(nftOut.other) } : { ico: "📥", text: "<b>收到域名</b> " + nftTag(nftIn) + " 来自 " + who(nftIn && nftIn.other) };
    }
    // —— 域名市场 ——
    if (C.market[to]) {
      if (sel === "0xd6febde8") return { ico: "🛒", text: "<b>买入域名</b> " + nftTag(nftIn) + "，付 " + fmtN(daiOut, "DAI") + "（含 3% 手续费）" };
      if (sel === "0xca690ea2") return { ico: "🏷", text: "<b>域名挂单出售</b> " + nftTag(nftOut) + "（域名托管在市场合约，卖掉前随时可撤）" };
      if (sel === "0x40e58ee5") return { ico: "↩️", text: "<b>撤回域名挂单</b>，" + nftTag(nftIn) + " 退回钱包" };
      return { ico: "🏷", text: "域名市场操作" };
    }
    if (!t && daiIn && ms.some(function (m) { return C.market[m.other]; })) return { ico: "✅", text: "你的<b>域名卖出成交</b>，收到 " + fmtN(daiIn, "DAI") };
    // —— 借贷 ——
    if (C.loan[to]) {
      var L = { "0x2fedd319": ["🤝", "<b>抵押</b> " + (coinOut ? fmtN(coinOut.v, coinOut.sym) : "币") + " 发布借款单（等人出借 DAI）"], "0xa65e2cfd": ["💵", "<b>出借</b> " + fmtN(daiOut, "DAI") + " 给一张借款单（到期连本带息收回）"], "0x992001bd": ["📣", "<b>挂出借单</b>，锁定 " + fmtN(daiOut, "DAI") + "（等人来借）"], "0x4fd9efc4": ["💰", "<b>借到</b> " + fmtN(daiIn, "DAI") + (coinOut ? "，抵押 " + fmtN(coinOut.v, coinOut.sym) : "")], "0x371fd8e6": ["✅", "<b>还款</b> " + fmtN(daiOut, "DAI") + (coinIn ? "，取回抵押 " + fmtN(coinIn.v, coinIn.sym) : "")], "0x379607f5": ["⚖️", "<b>到期处置</b>：拿到 " + ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return fmtN(m.v, m.sym); }).join("、")], "0x40e58ee5": ["↩️", "<b>撤销借贷挂单</b>，退回 " + ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return fmtN(m.v, m.sym); }).join("、")] };
      if (L[sel]) return { ico: L[sel][0], text: L[sel][1] + "（" + esc(C.loan[to]) + " 借贷）" };
      return { ico: "🤝", text: "借贷操作（" + esc(C.loan[to]) + "）" };
    }
    if (!t && ms.some(function (m) { return C.loan[m.other]; })) return { ico: "✅", text: "借贷合约转来 " + ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（对方还款 / 你的单成交 / 到期退回）" };
    // —— 普通转账、授权 ——
    if (t && C.tokens[to] && sel === "0xa9059cbb" && ms.length) { var o = firstOut(ms); return { ico: "💸", text: "<b>转出</b> " + fmtN(o.v, o.sym) + " 给 " + who(o.other) }; }
    if (t && C.tokens[to] && sel === "0x095ea7b3") return { ico: "🔑", text: "<b>授权</b> " + esc(C.tokens[to]) + "（允许合约在交易时扣币，本身不扣钱）" };
    if (t && (!t.raw_input || t.raw_input === "0x") && Number(t.value) > 0) return { ico: "💸", text: "<b>转出</b> " + fmtN(Number(t.value) / 1e18, "DAI") + " 给 " + who(to) };
    if (!t && ms.length) {
      var mi = ms.filter(function (m) { return m.dir === "in"; })[0];
      if (mi) {
        if (TEAM[mi.other]) return { ico: "🔧", text: "<b>运营费用支出</b> " + fmtN(mi.v, mi.sym) + "（服务器、节点、客服等运营维护）" };
        if (mi.other === C.pool) return { ico: "🏆", text: "<b>预言家奖金到账</b> " + fmtN(mi.v, mi.sym) + "（奖池钱包发放）" };
        return { ico: "📥", text: "<b>收到</b> " + (mi.nft ? "域名 " + nftTag(mi) : fmtN(mi.v, mi.sym)) + " 来自 " + who(mi.other) };
      }
    }
    // 不是本站的合约（DEX、质押、跨链桥等）：按币的进出说人话，不装懂
    var EXT = { "0xa694fc3a": "质押", "0x2e1a7d4d": "赎回", "0x3d18b912": "领取收益", "0x38ed1739": "DEX 兑换", "0x7ff36ab5": "DEX 兑换", "0x18cbafe5": "DEX 兑换", "0x8803dbee": "DEX 兑换", "0xe8e33700": "添加流动性", "0xbaa2abde": "移除流动性" };
    if (t && !KNOWN[to] && ms.length) {
      var ins = ms.filter(function (m) { return m.dir === "in" && !m.nft; }), outs = ms.filter(function (m) { return m.dir === "out" && !m.nft; }), lab = EXT[sel] || "其他平台";
      if (ins.length && outs.length) return { ico: "🔁", text: "在<b>" + lab + "</b>用 " + outs.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + " 换了 " + ins.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（非本站）" };
      if (outs.length) return { ico: "📤", text: "<b>" + (EXT[sel] || "转入其他平台") + "</b> " + outs.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（非本站合约）" };
      if (ins.length) return { ico: "📥", text: "从<b>" + lab + "</b>收到 " + ins.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（非本站合约）" };
    }
    var k = KNOWN[to];
    return { ico: "🔧", text: (k ? "与「" + esc(k) + "」交互" : (EXT[sel] ? EXT[sel] + "（其他平台）" : "与其他平台的合约交互")) + (METHODS[sel] ? "：" + METHODS[sel] : "") + (ms.length ? "，" + ms.map(function (m) { return (m.dir === "in" ? "收到 " : "付出 ") + (m.nft ? "域名" : fmtN(m.v, m.sym)); }).join("、") : "") };
  }
  function rowHtml(a, row) {
    var r = translate(a, row), money = (row.tr && row.tr.length) || (row.tx && row.tx.value && Number(row.tx.value) > 0) || /收到|付出|转出|转入|买入|卖出|成交|退回|注册|续费/.test(r.text);
    return '<div class="lg-row" data-kind="' + (r.cls ? "money" : money ? "money" : "other") + (r.cls ? '" data-cls="' + r.cls : "") + '"><span class="lg-ico">' + r.ico + '</span><div class="lg-main"><div class="lg-txt">' + r.text + '</div><small>' + bj(row.t) + '</small></div><a class="lg-link" href="#/scan/' + row.h + '" title="看详情">详情 ›</a></div>';
  }
  // 账本列表：发出的交易 + 收到的币，合在一起按时间排；「再看更早的」两边各翻一页
  function ledger(a, box) {
    var nextTx = null, nextTt = null, first = true, seen = {}, rows = [];
    function qs(n) { return n ? "?" + Object.keys(n).map(function (k) { return k + "=" + encodeURIComponent(n[k]); }).join("&") : ""; }
    function load() {
      var more = box.querySelector(".sc-more"); if (more) more.textContent = "读取中…";
      var pTx = first || nextTx ? get("/addresses/" + a + "/transactions" + qs(nextTx)).catch(function () { return { items: [] }; }) : Promise.resolve({ items: [] });
      var pTt = first || nextTt ? get("/addresses/" + a + "/token-transfers" + qs(nextTt)).catch(function () { return { items: [] }; }) : Promise.resolve({ items: [] });
      return Promise.all([pTx, pTt]).then(function (x) {
        nextTx = x[0].next_page_params || null; nextTt = x[1].next_page_params || null;
        var byH = {};
        (x[1].items || []).forEach(function (r) { (byH[r.transaction_hash] = byH[r.transaction_hash] || []).push(r); });
        (x[0].items || []).forEach(function (t) { if (seen[t.hash]) return; seen[t.hash] = 1; rows.push({ t: t.timestamp, h: t.hash, tx: t, tr: byH[t.hash] || [] }); delete byH[t.hash]; });
        Object.keys(byH).forEach(function (h) { if (seen[h]) return; seen[h] = 1; rows.push({ t: byH[h][0].timestamp, h: h, tx: null, tr: byH[h] }); });
        rows.sort(function (p, q) { return new Date(q.t) - new Date(p.t); });
        if (!rows.length) { box.innerHTML = '<p class="muted">这个地址还没有和本站有关的记录</p>'; return; }
        box.innerHTML = rows.map(function (r) { return rowHtml(a, r); }).join("") + (nextTx || nextTt ? '<button type="button" class="sc-more">再看更早的 ▾</button>' : "");
        var others = box.querySelectorAll('.lg-row[data-kind="other"]').length, all = !!box.getAttribute("data-all");
        if (others && !all) box.insertAdjacentHTML("beforeend", '<p class="muted sc-other">另有 ' + others + ' 条不涉及钱的操作（授权、设置等）· <a href="#" class="sc-showall">显示</a></p>');
        box.classList.toggle("sc-moneyonly", !all);
        var sa = box.querySelector(".sc-showall"); if (sa) sa.onclick = function (e) { e.preventDefault(); box.setAttribute("data-all", "1"); box.classList.remove("sc-moneyonly"); sa.parentNode.remove(); };
        var mb = box.querySelector(".sc-more"); if (mb) mb.onclick = load;
        box.querySelectorAll('[data-cls="lg-oracle"]').forEach(function (r) { r.classList.add("lg-oracle"); });
        box.querySelectorAll(".lg-orc").forEach(function (el) { // 揭晓了就对照：差多少、有没有猜中
          var day = el.getAttribute("data-day"), ps = el.getAttribute("data-ps").split(",");
          fetch("/api/oracle?res=" + day).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.px) { el.innerHTML = ' <i class="lg-orw">⏳ 等揭晓</i>'; return; }
            var px = j.px / 1000, best = Math.min.apply(null, ps.map(function (p) { return Math.abs(Number(p) - px); }));
            el.innerHTML = " <b>揭晓 " + px.toFixed(3) + "</b>" + (best < 0.0005 ? ' <i class="lg-orhit">🎯 完全猜中</i>' : " · 差 " + best.toFixed(3));
          }).catch(function () { el.textContent = ""; });
        });
        first = false;
        fillNames(box);
      });
    }
    return load();
  }

  function page() {
    var segs = location.hash.split("/").slice(2).map(function (x) { return decodeURIComponent(x || "").trim(); }).filter(Boolean);
    if (segs.length > 1 && /^(tx|address|token)$/.test(segs[0])) segs.shift(); // 兼容 #/scan/tx/哈希、#/scan/address/地址（全站以前指向官方浏览器的链接）
    var q = segs[0] || "", cat = CATS[segs[1]] ? segs[1] : "";
    A.app.innerHTML = '<section class="card"><h2>📒 AiLGNS 账本 <small class="muted">看得懂的链上记录</small></h2>' +
      '<form class="nm-search" id="sc-f"><input id="sc-q" placeholder="输入域名 / 钱包地址 / 交易哈希" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(q) + '"><button type="submit">查询</button></form>' +
      '<p class="muted sc-tip">只显示和本站有关的事：买卖、挂单、注册域名、借贷、转账，每一笔都写成人话。例：发财.ailgns、0x 开头的地址、交易哈希。</p><div id="sc-me"></div></section><div id="sc-out"></div>';
    document.getElementById("sc-f").onsubmit = function (e) {
      e.preventDefault();
      var v = document.getElementById("sc-q").value.trim();
      if (v) location.hash = "#/scan/" + encodeURIComponent(v) + (cat ? "/" + cat : "");
    };
    var out = document.getElementById("sc-out");
    // 自动认出当前钱包：没输东西时直接给「查我的订单」四个按钮，输入框也先填上
    if (A.wallets && A.wallets.silent) A.wallets.silent().then(function (acc) {
      var me = document.getElementById("sc-me"), inp = document.getElementById("sc-q"); if (!acc || !me) return;
      if (inp && !inp.value) inp.value = acc;
      me.innerHTML = '<div class="sc-mine"><span>👤 我的钱包 <b class="mono">' + A.short(acc) + '</b></span>' + catBtns(acc, q.toLowerCase() === acc ? (cat || "all") : "") + "</div>";
    }).catch(function () {});
    if (!q) return;
    var low = q.toLowerCase();
    out.innerHTML = '<section class="card"><p class="muted">查询中…</p></section>';
    var job;
    if (/^0x[0-9a-f]{64}$/.test(low)) job = txView(low, out);
    else if (/^0x[0-9a-f]{40}$/.test(low)) job = addrView(low, out, "", cat);
    else job = nameView(low, out, cat);
    job.catch(function (e) { out.innerHTML = '<section class="card"><p class="nm-bad">查询失败：' + esc(e.message || e) + "</p></section>"; });
  }

  // 域名：没写后缀就两个后缀都查
  function nameView(q, out, cat) {
    var m = q.match(/^(.+)\.(ailgns|lgns)$/), tries = m ? [[m[1], m[2]]] : [[q, "ailgns"], [q, "lgns"]];
    return Promise.all(tries.map(function (t) { return call(NAMES[t[1]], SEL.resolve + str(t[0])).then(function (r) { return { label: t[0], tld: t[1], a: "0x" + r.slice(26) }; }); })).then(function (rs) {
      var hit = rs.filter(function (r) { return r.a !== ZERO; })[0];
      if (!hit) { out.innerHTML = '<section class="card"><p class="nm-bad">没找到「' + esc(q) + '」：这个域名还没注册或已过期</p><p><a href="#/names/' + encodeURIComponent(m ? q : q + ".ailgns") + '">去注册 →</a></p></section>'; return; }
      // 域名正在市场挂单：它暂时托管在市场合约里，别把合约当成主人显示（合约名下是所有在卖的域名）
      if (C.market[hit.a.toLowerCase()]) {
        return fetch("/api/name-market").then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (j) {
          var it = ((j && j.list) || []).filter(function (x) { return x.label === hit.label && x.t === hit.tld; })[0], full = hit.label + "." + hit.tld;
          var p = it ? Number(BigInt(it.price) / 10n ** 12n) / 1e6 : 0;
          out.innerHTML = '<section class="card"><h2>🏷 ' + esc(full) + '</h2><div class="lg-one"><span class="lg-ico">🏷</span><div>这个域名<b>正在域名市场挂单出售</b>' + (it ? "，标价 <b>" + p + " DAI</b>（买家付 " + Math.round(p * 1.03 * 100) / 100 + "，含 3% 手续费）" : "") + "，暂时托管在市场合约里，卖掉前卖家随时可以撤回。</div></div>" +
            (it ? "<p>卖家：" + who(it.maker) + "</p>" : "") +
            '<p><a class="nm-go" href="#/names/' + encodeURIComponent(full) + '">去看这个域名 / 买下它 →</a></p>' + (it ? '<p><a href="#/scan/' + it.maker + '">看卖家的账本 →</a></p>' : "") + "</section>";
          fillNames(out);
        });
      }
      if ((A.hidden && A.hidden[hit.a.toLowerCase()]) || (A.hiddenNames || {})[hit.label + "." + hit.tld]) { out.innerHTML = '<section class="card"><h2>🌐 ' + esc(hit.label + "." + hit.tld) + '</h2><p class="muted">🔒 这个域名的持有人选择匿名，不公开地址。</p></section>'; return; }
      return addrView(hit.a, out, hit.label + "." + hit.tld, cat);
    });
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
  // ===== 正在进行中：这个地址在本站的挂单、借贷、预言（机器人会告诉客户的事，这里也能看）=====
  var MK = { ailgns: { sym: "AiLGNS", dec: 18, chain: "Anubis" }, lgns: { sym: "LGNS", dec: 9, chain: "Anubis" }, glgns: { sym: "gLGNS", dec: 18, chain: "Anubis" }, plgns: { sym: "LGNS", dec: 9, chain: "Polygon" } };
  var LOANS = { ailgns: { c: "0x242ab392571d325d814a48892ac16115a6d285dc", sym: "AiLGNS", dec: 18 }, lgns: { c: "0x439cb33e9c5d7a26dd1fa503efe6fd3033ac173b", sym: "LGNS", dec: 9 }, glgns: { c: "0x00e674bb1559557966a6c2244c36d12a63218a5f", sym: "gLGNS", dec: 18 } };
  var big = function (x, dec) { var b = BigInt(x); return dec >= 6 ? Number(b / BigInt(10) ** BigInt(dec - 6)) / 1e6 : Number(b) / Math.pow(10, dec); };
  var fmtA = function (v) { return v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v >= 1 ? +v.toFixed(4) : +v.toPrecision(4); };
  var leftT = function (sec) { if (sec <= 0) return "已到期"; var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? d + " 天 " + h + " 小时" : h ? h + " 小时 " + m + " 分" : m + " 分钟"; };
  var wordsOf = function (r) { return (r || "0x").slice(2).match(/.{64}/g) || []; };
  function posRow(ico, html, href, cta, just, x) {
    x = x || {};
    var me = A.otcKit && A.otcKit.account && A.otcKit.account();
    var btn = x.cancel && me && x.owner === me ? '<button type="button" class="sc-cancel" data-cancel="' + x.id + '" data-k="' + x.k + '">撤单</button>' : "";
    if (x.cancel && x.owner && (!me || x.owner !== me)) x.st = (x.st || "") + '<div class="sc-guide">这是你的单？右上角连接挂单的钱包，这里就会出现「撤单」按钮。想改价：撤单（币马上退回钱包）→ 去 OTC 按新价重新挂。到期的单币会自动退回，不用管。</div>';
    else if (btn) x.st = (x.st || "") + '<div class="sc-guide">想改价：点「撤单」（钱包确认一次，币马上退回钱包）→ 去 <a href="#/otc">OTC</a> 按新价重新挂一张。到期的单币会自动退回。</div>';
    return '<div class="lg-row' + (just ? " lg-just" : "") + '"><span class="lg-ico">' + (just ? '<i class="lg-justtag">刚挂的</i>' : "") + '' + ico + '</span><div class="lg-main"><div class="lg-txt">' + html + "</div>" + (x.st ? '<div class="sc-stl">' + x.st + "</div>" : "") + "</div><span class=\"lg-acts\">" + btn + (href ? '<a class="lg-link" href="' + href + '">' + (cta || "去处理 ›") + "</a>" : "") + "</span></div>";
  }
  // 账本里直接撤单：切到对应市场，走 OTC 同一套 cancel（普通用户操作，不碰管理权限）
  function bindCancel(box, a, reload) {
    box.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.onclick = function () {
        var K = A.otcKit, id = b.getAttribute("data-cancel"), k = b.getAttribute("data-k");
        if (!K || !K.useMarket) return;
        if (!confirm("确定撤单 #" + id + "？撤了币马上退回你的钱包。")) return;
        b.disabled = true; b.textContent = "撤单中…";
        K.useMarket(k);
        K.ready().then(function () { return K.send(K.OTC(), "0x40e58ee5" + K.u256(id), function (t) { b.textContent = t.slice(0, 12); }, "撤单 #" + id); })
          .then(function () { b.textContent = "✅ 已撤回"; if (A.just) A.just.set("otc", k); setTimeout(reload, 2500); })
          .catch(function (e) { b.disabled = false; b.textContent = "撤单"; A.errTip(K.niceError ? K.niceError(e) : (e && e.message) || e, b); });
      };
    });
  }
  function positions(a, box) {
    var now = Date.now() / 1000, out = [];
    var jobs = [];
    // OTC 挂单（四个币市场）
    Object.keys(MK).forEach(function (k) {
      var freshQ = A.otcKit && A.otcKit.account && A.otcKit.account() === a && A.just && A.just.list("otc").length ? "&fresh=1" : "";
      // 窗口里的最近 1000 张 + 窗口之外自己更早挂的单（市场超过 1000 张后老单会被挡住，客户以为单子丢了）
      jobs.push(Promise.all([fetch("/api/book?m=" + k + freshQ).then(function (r) { return r.json(); }), fetch("/api/book?m=" + k + "&mine=" + a + freshQ).then(function (r) { return r.json(); }).catch(function () { return { older: [] }; })]).then(function (dd) {
        var d = dd[0], w = wordsOf(d.orders), n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0, from = Number(d.from || 0), m = MK[k];
        var rows = []; for (var i = 0; i < n; i++) rows.push({ id: from + i, o: w.slice(2 + i * 7, 9 + i * 7) });
        (dd[1].older || []).forEach(function (x) { if (x.id < from) rows.push(x); });
        for (var r2 = 0; r2 < rows.length; r2++) {
          var o = rows[r2].o, oid = rows[r2].id; if (!o || o.length < 7) continue;
          var maker = "0x" + o[0].slice(24), sell = o[1].slice(-1) === "1", open = o[2].slice(-1) === "1", exp = Number(BigInt("0x" + o[3])), gT = BigInt("0x" + o[4]), wT = BigInt("0x" + o[5]), gL = BigInt("0x" + o[6]);
          if (maker !== a || !open || exp <= now || gL === 0n) continue;
          var giveLeft = big(gL, sell ? m.dec : 18), wantLeft = gT > 0n ? big(gL * wT / gT, sell ? 18 : m.dec) : 0;
          var px = sell ? (giveLeft ? wantLeft / giveLeft : 0) : (wantLeft ? giveLeft / wantLeft : 0);
          var lockTxt = sell ? fmtA(giveLeft) + " " + m.sym : fmtA(giveLeft) + " DAI";
          out.push({ t: exp, k: k, id: oid, cancel: true, st: '<span class="sc-st ok">✅ 挂单中 · 你的 ' + lockTxt + ' 安全锁在 OTC 托管合约里，没成交随时撤回，到期自动退回</span>',
            html: sell ? "<b>OTC 挂单卖出</b> " + fmtA(giveLeft) + " " + m.sym + "，要价 " + fmtA(wantLeft) + " DAI（单价 " + px.toFixed(3) + "）· 剩 " + leftT(exp - now) + (m.chain === "Polygon" ? " · Polygon 链" : "")
            : "<b>OTC 挂单买入</b> " + fmtA(wantLeft) + " " + m.sym + "，锁定 " + fmtA(giveLeft) + " DAI（单价 " + px.toFixed(3) + "）· 剩 " + leftT(exp - now) + (m.chain === "Polygon" ? " · Polygon 链" : ""), href: "#/otc" + (k === "ailgns" ? "" : "/" + k), cta: "去 OTC 看 ›", ico: "📌" });
        }
      }).catch(function () {}));
    });
    // 域名挂单
    var meNow = A.otcKit && A.otcKit.account && A.otcKit.account() === a; // 查自己：跳过缓存，刚挂的单马上能看到
    jobs.push(fetch("/api/name-market" + (meNow ? "?f=1" : "")).then(function (r) { return r.json(); }).then(function (d) {
      (d.list || []).forEach(function (x) {
        if (x.maker !== a) return;
        var p = big(x.price, 18), just = A.just && A.just.has("names", x.label + "." + x.t);
        out.push({ t: x.expiry, just: just, st: '<span class="sc-st ok">✅ 在卖 · 名字安全托管在域名市场合约里，没卖掉随时撤回（到「域名 → 我的挂单」撤单）</span>', html: "<b>域名挂单出售</b> " + esc(x.label + "." + x.t) + "，标价 " + fmtA(p) + " DAI · 剩 " + leftT(x.expiry - now), href: "#/names/" + encodeURIComponent(x.label + "." + x.t), ico: just ? "🆕" : "🏷" });
      });
    }).catch(function () {}));
    // 借贷（借款单 / 出借单 / 借款中）
    Object.keys(LOANS).forEach(function (k) {
      var L = LOANS[k];
      jobs.push(call(L.c, "0x9d11ed75").then(function (h) {
        var count = Number(BigInt(h)), from = Math.max(0, count - 1000);
        if (!count) return;
        return call(L.c, "0x86b20104" + u256(from) + u256(count - from)).then(function (r) {
          var w = wordsOf(r), n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0;
          for (var i = 0; i < n; i++) {
            var o = w.slice(2 + i * 10, 12 + i * 10); if (o.length < 10) break;
            var br = "0x" + o[0].slice(24), ld = "0x" + o[1].slice(24), isOffer = o[2].slice(-1) === "1", st = Number(BigInt("0x" + o[3])), exp = Number(BigInt("0x" + o[4])), term = Number(BigInt("0x" + o[5])), due = Number(BigInt("0x" + o[6]));
            var col = big("0x" + o[7], L.dec), prin = big("0x" + o[8], 18), rep = big("0x" + o[9], 18);
            if (br !== a && ld !== a) continue;
            if (st === 0 && exp > now) {
              if (isOffer && ld === a) out.push({ t: exp, st: '<span class="sc-st ok">✅ 等人来借 · 你的 DAI 安全锁在借贷合约里，没人借随时撤回</span>', html: "<b>出借单挂着</b>：锁定 " + fmtA(prin) + " DAI 等人来借，到期收 " + fmtA(rep) + " DAI（" + Math.round(term / 86400) + " 天）· 剩 " + leftT(exp - now), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "📣" });
              else if (!isOffer && br === a) out.push({ t: exp, st: '<span class="sc-st ok">✅ 等人来借给你 · 你的抵押币安全锁在借贷合约里，没人接随时撤回</span>', html: "<b>借款单挂着</b>：抵押 " + fmtA(col) + " " + L.sym + "，想借 " + fmtA(prin) + " DAI，到期还 " + fmtA(rep) + " DAI（" + Math.round(term / 86400) + " 天）· 剩 " + leftT(exp - now), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "🤝" });
            } else if (st === 1) {
              if (br === a) out.push({ t: due, st: '<span class="sc-st warn">⏳ 借款中 · 抵押币锁在借贷合约里，到期前还款就退回</span>', html: "<b>借款中</b>：借了 " + fmtA(prin) + " DAI，到期要还 <b>" + fmtA(rep) + " DAI</b>，抵押 " + fmtA(col) + " " + L.sym + " · " + (due > now ? "还剩 " + leftT(due - now) + "，记得按时还" : "<b class=\"nm-bad\">已过期，抵押可能被处置</b>"), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "💰" });
              else out.push({ t: due, st: '<span class="sc-st ok">✅ 出借中 · 本金已借出，到期对方还款直接到你钱包；逾期抵押币归你</span>', html: "<b>出借中</b>：借出 " + fmtA(prin) + " DAI，到期收回 " + fmtA(rep) + " DAI · " + (due > now ? "还剩 " + leftT(due - now) : "<b>已到期</b>，对方没还可以处置抵押"), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "💵" });
            }
          }
        });
      }).catch(function () {}));
    });
    // 预言家本轮预测
    jobs.push(fetch("/api/oracle?a=" + a).then(function (r) { return r.json(); }).then(function (d) {
      var me = d.me || {};
      if (me.ps && me.ps.length) out.push({ t: 0, html: "<b>预言家</b>：本轮已预测 " + me.ps.map(function (p) { return "<b>" + p + "</b>"; }).join("、") + (me.n ? "（" + me.used + "/" + me.n + " 次）" : "") + "，晚 9–10 点揭晓", href: "#/oracle", ico: "🔮", cta: "看排行 ›" });
    }).catch(function () {}));
    return Promise.all(jobs).then(function () {
      if (!box) return out;
      if (!box.isConnected) return out;
      if (!out.length) { box.innerHTML = '<p class="muted">现在没有挂着的单、没有借贷、没有预测 · <a href="#/otc">去 OTC 挂一单 →</a></p>'; var ps0 = document.getElementById("sc-possum"); if (ps0) ps0.textContent = "暂时没有"; return out; }
      // 刚挂的 OTC 单：同一市场里编号最大的那张高亮
      if (A.just) A.just.list("otc").forEach(function (j) { var cand = out.filter(function (x) { return x.k && (!j.key || x.k === j.key); }); if (cand.length) { var top = cand.reduce(function (m, x) { return x.id > m.id ? x : m; }); top.just = true; top.ico = "🆕"; } });
      out.sort(function (x, y) { return (y.just ? 1 : 0) - (x.just ? 1 : 0); }); // 刚操作的排最前
      var soon = out.filter(function (x) { return x.t && x.t * 1000 - Date.now() < 86400e3 && x.t * 1000 > Date.now(); }).length, expired = out.filter(function (x) { return x.t && x.t * 1000 <= Date.now(); }).length;
      out.forEach(function (x) { if (x.t && x.t * 1000 - Date.now() < 86400e3 && x.t * 1000 > Date.now()) x.html = '<span class="sc-soon">⏰ 24 小时内到期</span> ' + x.html; });
      var ps = document.getElementById("sc-possum"); if (ps) ps.textContent = "共 " + out.length + " 件" + (soon ? " · ⏰ " + soon + " 件快到期" : "") + (expired ? " · " + expired + " 件已到期（会自动退回）" : "");
      box.innerHTML = out.map(function (x) { x.owner = a; return posRow(x.ico, x.html, x.href, x.cta, x.just, x); }).join("");
      bindCancel(box, a, function () { positions(a, box); });
      fillNames(box);
      return out;
    });
  }
  // 给客服机器人用：这个钱包正在进行中的事，纯文字一行一条
  A.myPositions = function (a) { return positions(String(a).toLowerCase(), null).then(function (out) { return (out || []).map(function (x) { return x.html.replace(/<[^>]+>/g, ""); }); }).catch(function () { return []; }); };

  // ===== 留言：列表、写信、发送（0 元交易带 data，钱包签名，只花 Gas）=====
  var SEEN_KEY = "msgSeen";
  function msgRow(a, m) {
    var mine = m.from === a, other = mine ? m.to : m.from, otherName = mine ? m.toName : m.fromName;
    var d = new Date(m.t + 8 * 3600e3), when = (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
    return '<div class="lg-row' + (mine ? " msg-me" : "") + '"><span class="lg-ico">' + (mine ? "💬" : "📬") + '</span><div class="lg-main"><div class="lg-txt">' + (mine ? "我 → " : "") + '<a href="#/scan/' + other + '"><b>' + esc(otherName || A.short(other)) + "</b></a>" + (mine ? "" : " → 我") + '：' + esc(m.txt) + '</div><small>' + when + "</small></div>" + (mine ? "" : '<a class="lg-link" href="#/scan/' + other + '">回复 ›</a>') + "</div>";
  }
  function messages(a, via) {
    var box = document.getElementById("sc-msgs"), btn = document.getElementById("sc-msgbtn"), form = document.getElementById("sc-msgbox"), ta = document.getElementById("sc-mtxt"), st = document.getElementById("sc-mst"), n = document.getElementById("sc-mn");
    var me = A.otcKit && A.otcKit.account && A.otcKit.account();
    if (me && me === a) { btn.textContent = "📬 这是我的信箱"; btn.disabled = true; try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {} var pill = document.getElementById("msg-pill"); if (pill) pill.remove(); }
    fetch("/api/msg?a=" + a).then(function (r) { return r.json(); }).then(function (d) {
      if (!box.isConnected) return;
      var list = d.list || [];
      box.innerHTML = list.length ? list.slice(0, 50).map(function (m) { return msgRow(a, m); }).join("") : '<p class="muted">还没有留言。' + (me === a ? "" : "点右上角「💬 给 TA 留言」，第一个打招呼。") + "</p>";
    }, function () { box.innerHTML = '<p class="muted">留言读取失败</p>'; });
    btn.onclick = function () { form.hidden = !form.hidden; if (!form.hidden) ta.focus(); };
    ta.oninput = function () { n.textContent = Array.from(ta.value).length; };
    document.getElementById("sc-msend").onclick = function () {
      var txt = ta.value.trim(), sb = this;
      if (!txt) return A.errTip("先写点什么", ta);
      if (Array.from(txt).length > 200) return A.errTip("最多 200 字", ta);
      var say = function (t) { st.textContent = t; };
      sb.disabled = true;
      var acct;
      A.otcKit.connect().then(function (acc) {
        acct = acc;
        if (acct === a) throw new Error("不能给自己留言");
        say("检查发信资格…");
        return nameOf(acct);
      }).then(function (nm) {
        if (!nm) throw new Error("只有注册了 .ailgns 域名并设为主名字的钱包才能发信。去「域名」页注册一个（最低 5 DAI），设为主名字后再来");
        say("🔒 这是一笔 0 元转账，文字放在交易里，只花约 0.001 DAI 的 Gas。请在钱包确认");
        var eth = W.get();
        return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: acct, to: a, value: "0x0", data: encodeMsg(txt) }] });
      }).then(function (hash) {
        say("已提交，等待链上确认…");
        return W.waitOn("anubis", hash).then(function () { return hash; });
      }).then(function (hash) {
        say("链上已确认，正在通知对方…");
        return fetch("/api/msg", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: hash }) }).then(function (r) { return r.json(); });
      }).then(function (r) {
        if (r.error) throw new Error(r.error);
        say("✅ 留言已上链" + (r.notified ? "，对方的 DeBox 已收到提醒" : "，对方进站就能看到"));
        ta.value = ""; n.textContent = "0";
        if (r.item) { var empty = box.querySelector("p.muted"); if (empty) empty.remove(); box.insertAdjacentHTML("afterbegin", msgRow(a, r.item)); }
        sb.disabled = false;
      }).catch(function (e) { sb.disabled = false; say(""); A.errTip((e && (e.message || e.reason)) || String(e), sb); });
    };
  }
  // 全站：连过钱包的人有新留言时，左下角出现小提示
  function msgPill() {
    if (!A.wallets || !A.wallets.silent) return;
    A.wallets.silent().then(function (acc) {
      if (!acc) return;
      acc = String(acc).toLowerCase();
      var seen = 0; try { seen = Number(localStorage.getItem(SEEN_KEY) || 0); } catch (e) {}
      return fetch("/api/msg?a=" + acc).then(function (r) { return r.json(); }).then(function (d) {
        var fresh = (d.list || []).filter(function (m) { return m.to === acc && m.t > seen; }).length;
        if (!fresh || document.getElementById("msg-pill")) return;
        var el = document.createElement("a"); el.id = "msg-pill"; el.className = "msg-pill"; el.href = "#/scan/" + acc; el.textContent = "📬 " + fresh + " 条新留言";
        document.body.appendChild(el);
      });
    }).catch(function () {});
  }
  setTimeout(msgPill, 4000);

  // 地址：我的钱、我的域名、我做过的事
  // ===== 订单分类：OTC / 借贷 / 域名 / 其他（全站「查订单」都走这里）=====
  var CATS = { all: "全部", otc: "💱 OTC", loan: "🤝 借贷", names: "🌐 域名", other: "✨ 其他" };
  function catOf(txt) { return /域名|注册|续费|\.ailgns|\.lgns|主名字|转赠|置顶|名字/.test(txt) ? "names" : /借|还款|出借|抵押|逾期|利息/.test(txt) ? "loan" : /OTC|挂单|吃单|成交|撤单|买入|卖出|盘口|求购|手续费|套利|回购/.test(txt) ? "otc" : "other"; }
  function catBtns(a, cur) { return '<div class="seg sc-cats">' + Object.keys(CATS).map(function (k) { return '<a href="#/scan/' + a + (k === "all" ? "" : "/" + k) + '" data-cat="' + k + '"' + (k === cur ? ' class="on"' : "") + ">" + CATS[k] + '<b class="sc-n" hidden></b></a>'; }).join("") + "</div>"; }
  // 「在本站的事」：每个分类按钮上标出有几单（OTC 2 · 借贷 0…），一眼看到有没有订单挂着
  function posCounts(root) {
    var pos = root.querySelector("#sc-pos"); if (!pos) return;
    var n = { all: 0, otc: 0, loan: 0, names: 0, other: 0 };
    pos.querySelectorAll(".lg-row").forEach(function (r) { if (!r.getAttribute("data-cat")) r.setAttribute("data-cat", catOf(r.textContent || "")); n.all++; n[r.getAttribute("data-cat")] = (n[r.getAttribute("data-cat")] || 0) + 1; });
    root.querySelectorAll("#sc-posc .sc-cats a").forEach(function (b) { var k = b.getAttribute("data-cat"), c = n[k] || 0, e = b.querySelector(".sc-n"); var t = c ? c + " 单" : "0"; e.hidden = false; if (e.textContent !== t) e.textContent = t; b.classList.toggle("has", c > 0); }); // 只在变了才写，不然会触发 MutationObserver 死循环
    var sum = document.getElementById("sc-possum"), st = n.all ? "共 " + n.all + " 单在挂" : "没有在挂的订单"; if (sum && sum.textContent !== st) sum.textContent = st;
  }
  function applyCat(root, cat) {
    root.querySelectorAll(".lg-row").forEach(function (r) {
      if (r.closest("#sc-msgs")) return; // 留言不是订单，不参与筛选
      if (!r.getAttribute("data-cat")) r.setAttribute("data-cat", catOf(r.textContent || ""));
      r.classList.toggle("sc-hide", !!cat && cat !== "all" && r.getAttribute("data-cat") !== cat);
    });
    posCounts(root);
    root.querySelectorAll(".lg-list:not(#sc-msgs)").forEach(function (l) {
      var vis = l.querySelectorAll(".lg-row:not(.sc-hide)").length, none = l.querySelector(".sc-none");
      if (!vis && cat && cat !== "all" && l.querySelector(".lg-row") && !none) { none = document.createElement("p"); none.className = "muted sc-none"; none.textContent = "这一类暂时没有"; l.appendChild(none); }
      if (none && (vis || !cat || cat === "all")) none.remove();
    });
  }
  // 给其它页面用的「查订单」条：输入框自动填当前钱包，四个分类按钮，一键到账本
  A.orderQuery = function (host, cat) {
    host.innerHTML = '<section class="card oq"><form class="oq-f"><span class="oq-l">📋 查我的订单</span><input class="oq-in" placeholder="钱包地址 / 域名（连过钱包会自动填）" autocomplete="off" autocapitalize="none" spellcheck="false">' +
      '<span class="seg oq-seg">' + ["otc", "loan", "names", "other"].map(function (k) { return '<button type="button" data-c="' + k + '"' + (k === cat ? ' class="on"' : "") + ">" + CATS[k] + "</button>"; }).join("") + '</span><button type="submit" class="oq-go">查询</button></form></section>';
    var inp = host.querySelector(".oq-in"), seg = host.querySelector(".oq-seg"), c = cat || "otc";
    seg.onclick = function (e) { var b = e.target.closest("button[data-c]"); if (!b) return; c = b.getAttribute("data-c"); seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); if (inp.value.trim()) host.querySelector(".oq-f").requestSubmit ? host.querySelector(".oq-f").requestSubmit() : go(); };
    function go() { var v = inp.value.trim(); if (!v) { inp.focus(); return A.errTip("先连钱包，或粘贴一个钱包地址 / 域名", inp); } location.hash = "#/scan/" + encodeURIComponent(v) + "/" + c; }
    host.querySelector(".oq-f").onsubmit = function (e) { e.preventDefault(); go(); };
    var fill = function (acc) { if (acc && !inp.value) inp.value = String(acc).toLowerCase(); };
    if (A.wallets && A.wallets.silent) A.wallets.silent().then(fill).catch(function () {});
    if (A.otcKit && A.otcKit.account && A.otcKit.account()) fill(A.otcKit.account());
    return { set: function (k) { c = k; seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-c") === k); }); }, fill: fill };
  };
  function addrView(a, out, via, cat) {
    var wait = '<p class="muted">读取中…</p>';
    if (TEAM[a]) { out.innerHTML = '<section class="card"><h2>🔧 运营维护地址</h2><p>这是本站<b>运营费用支出</b>用的地址（服务器、节点、客服、开发等日常维护）。属于团队内部账务，账本不展示明细。</p><p class="muted">客户的钱从不经过这里：挂单资金在 OTC 托管合约，借贷资金在借贷合约，域名在域名合约，都可以在账本里查到每一笔。</p></section>'; return Promise.resolve(); }
    var S = { head: (C.market[a] ? '<section class="card"><p class="muted">🏷 这是<b>域名市场的托管合约</b>：所有正在出售的域名都暂时存在这里，不是某个人的钱包。下面列出的是全部在卖的域名。</p></section>' : "") +
      // 用地址查：上面搜索框里已经是地址了，不再重复显示（站长 2026-11-06）；用名字查才显示名字 + 地址
      (via || KNOWN[a] ? '<section class="card sc-head"><h2 id="sc-h2">' + (via ? "🌐 " + esc(via) : "👤 " + KNOWN[a]) + '</h2><p class="sc-addr"><span class="mono">' + a + '</span><button type="button" class="ghost sc-copy" data-cp="' + a + '">复制</button></p></section>' : '<div id="sc-head-slot"></div>') + '<div id="sc-who"></div>',
      msg: '<section class="card" id="sc-msgc"><div class="card-head"><h2>📬 留言</h2><button type="button" class="nm-go sc-msgbtn" id="sc-msgbtn">💬 给 TA 留言</button></div>' +
      '<div id="sc-msgbox" hidden><textarea id="sc-mtxt" maxlength="200" rows="3" placeholder="写给 TA 的话（200 字以内）。留言会永久记录在链上，所有人可见，只花约 0.001 DAI 的 Gas。"></textarea>' +
      '<div class="sc-mrow"><small class="muted"><span id="sc-mn">0</span>/200 · 只有注册了 .ailgns 域名并设为主名字的钱包才能发信</small><button type="button" class="nm-go" id="sc-msend">发送留言</button></div><p class="muted nm-st" id="sc-mst"></p></div>' +
      '<div class="lg-list" id="sc-msgs">' + wait + "</div></section>",
      bal: '<section class="card sc-balc"><div class="card-head"><h2>💰 账户余额</h2><span class="muted" id="sc-balsum"></span></div><div class="sc-bal" id="sc-bal">' + wait + '</div><div id="sc-balx"></div></section>',
      pos: '<section class="card" id="sc-posc"><div class="card-head"><h2>📌 在本站的事</h2><span class="muted" id="sc-possum">挂单 · 借贷 · 预测</span></div>' + catBtns(a, cat || "all") + '<div class="lg-list" id="sc-pos">' + wait + "</div></section>",
      names: '<section class="card"><h2 id="sc-nh">🌐 我的域名</h2><div id="sc-names">' + wait + "</div></section>",
      hist: '<section class="card"><div class="card-head"><h2>📜 钱的来龙去脉</h2><span class="muted">转进来、转出去、买了什么 · 最新在上</span></div><div class="lg-list" id="sc-lg">' + wait + "</div></section>" };
    // 顺序：查订单（带分类）或查自己的钱包时，「正在进行中」紧跟在钱包信息后面，一打开就看到；查别人才先看留言
    var mine = A.otcKit && A.otcKit.account && A.otcKit.account() === a;
    // 站长 2026-11-06 定（白居易原则：大爷大妈一眼看懂）：先看有多少钱 → 在本站有什么事（挂单/到期/借贷）→ 钱去了哪里 → 域名 → 留言
    out.innerHTML = ["head", "bal", "pos", "hist", "names", "msg"].map(function (k) { return S[k]; }).join("");
    var cpb = out.querySelector(".sc-copy"); if (cpb) cpb.onclick = function () { try { navigator.clipboard.writeText(a); } catch (e) {} cpb.textContent = "已复制"; };
    var el = function (id) { return document.getElementById(id); };
    nameOf(a).then(function (primary) {
      if (!el("sc-who")) return;
      if (A.credOf) A.credOf(a).then(function (c) {
        var bc = out.querySelector(".sc-balc .card-head"); if (!bc || KNOWN[a]) return;
        bc.insertAdjacentHTML("afterend", '<p class="sc-cred"><i class="cred cred' + c.lv + '">' + c.name + '</i> 本站 OTC 累计成交 <b>' + c.vol.toLocaleString("en-US") + ' DAI</b> · ' + c.n + ' 笔' + (c.next ? '<span class="muted"> · 再做到 ' + c.next.vol.toLocaleString("en-US") + ' DAI 且 ' + c.next.n + ' 笔升「' + c.next.name + '」</span>' : "") + "</p>");
      }).catch(function () {});
      var slot = el("sc-head-slot");
      if (primary && !via && slot) slot.outerHTML = '<section class="card sc-head"><h2>🌐 ' + esc(primary) + ' <small class="muted">这个钱包的名字</small></h2></section>';
      else if (slot) slot.remove();
      var bc = out.querySelector(".sc-balc"); if (bc && !primary && !KNOWN[a]) bc.insertAdjacentHTML("beforeend", '<p class="muted sc-noname">这个钱包还没有名字 · <a href="#/names">花 5 DAI 起一个 →</a></p>');
      if (el("sc-who")) el("sc-who").remove();
    });
    // 余额：最值钱的三种大字（AiLGNS / LGNS / DAI），折算成 DAI 合计；其它币小字列出；Gas 不单列（这条链 Gas 就是 DAI）
    var px = { AiLGNS: 0, LGNS: 0 };
    var pxJob = Promise.all([fetch("/api/book?m=ailgns").then(function (r) { return r.json(); }), fetch("/api/book?m=lgns").then(function (r) { return r.json(); })]).then(function (j) {
      var rs = function (x, dec) { var w = (x.reserves || "0x").slice(2).match(/.{64}/g); if (!w || w.length < 2) return 0; var r0 = Number(BigInt("0x" + w[0])) / Math.pow(10, dec), r1 = Number(BigInt("0x" + w[1])) / 1e18; return r0 ? r1 / r0 : 0; };
      px.AiLGNS = rs(j[0], 18); px.LGNS = rs(j[1], 9);
    }).catch(function () {});
    Promise.all([get("/addresses/" + a + "/token-balances").catch(function () { return []; }), pxJob]).then(function (r) {
      var bals = r[0] || [], main = ["AiLGNS", "LGNS", "DAI"], num = {}, others = [];
      bals.forEach(function (b) {
        if (!b.token || b.token.type !== "ERC-20") return;
        var v = Number(b.value || 0) / Math.pow(10, Number(b.token.decimals || 18)); if (v < 1e-6) return;
        if (main.indexOf(b.token.symbol) >= 0) num[b.token.symbol] = v; else others.push({ sym: b.token.symbol, v: v });
      });
      var box = el("sc-bal"); if (!box) return;
      var fb = function (v) { return v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v >= 100 ? v.toFixed(2) : v >= 1 ? (+v.toFixed(4)).toString() : v ? (+v.toPrecision(4)).toString() : "0"; }; // 大字余额：数字别太长，手机上不换行
      var total = (num.DAI || 0) + (num.AiLGNS || 0) * px.AiLGNS + (num.LGNS || 0) * px.LGNS;
      box.innerHTML = main.map(function (k) {
        var v = num[k] || 0, worth = k === "DAI" ? v : v * (px[k] || 0);
        return '<div class="sc-coin' + (v ? "" : " sc-zero") + '"><span>' + k + (k === "DAI" ? "（1 DAI ≈ 1 美元）" : "") + "</span><b>" + fb(v) + "</b>" + (k !== "DAI" && v ? "<small>≈ " + fb(worth) + " DAI</small>" : "") + "</div>";
      }).join("");
      var sum = el("sc-balsum"); if (sum) sum.textContent = total ? "一共约 " + fb(total) + " DAI" : "这个钱包现在没有钱";
      var bx = el("sc-balx"); if (bx) bx.innerHTML = others.length ? '<p class="muted sc-others">其它：' + others.sort(function (x, y) { return y.v - x.v; }).slice(0, 8).map(function (o) { return esc(o.sym) + " " + amt(String(Math.round(o.v * 1e6)), 6); }).join(" · ") + "</p>" : "";
    });
    allNfts(a).then(function (x) {
      var mine = (x.items || []).filter(function (n) { var t = (n.token.address_hash || "").toLowerCase(); return t === NAMES.ailgns || t === NAMES.lgns; });
      if (!el("sc-names")) return;
      if (A.hidden && A.hidden[String(a).toLowerCase()]) { el("sc-names").innerHTML = '<p class="muted">🔒 不公开</p>'; return; }
      el("sc-nh").textContent = "🌐 我的域名（" + mine.length + "）";
      el("sc-names").innerHTML = mine.length ? '<div class="sc-names">' + mine.map(function (n) {
        var nm = (n.metadata && n.metadata.name) || "";
        return '<a href="#/names/' + encodeURIComponent(nm) + '">' + esc(nm || "#" + String(n.id).slice(0, 8)) + "</a>";
      }).join("") + "</div>" : '<p class="muted">没有域名 · <a href="#/names">去注册 →</a></p>';
    });
    messages(a, via);
    positions(a, el("sc-pos"));
    // 分类筛选：列表是异步填进来的，变一次就重新打标签 + 过滤；带分类进来的直接滚到「正在进行中」
    if (window.MutationObserver) { var mo = new MutationObserver(function () { applyCat(out, cat); }); mo.observe(out, { childList: true, subtree: true }); }
    applyCat(out, cat);
    if (cat) setTimeout(function () { var p = el("sc-posc"); if (p) window.scrollTo({ top: p.getBoundingClientRect().top + window.pageYOffset - 70, behavior: "smooth" }); }, 700);
    ledger(a, el("sc-lg"));
    return Promise.resolve();
  }

  // 交易哈希：一句人话 + 几个关键信息
  function txView(h, out) {
    return Promise.all([get("/transactions/" + h), get("/transactions/" + h + "/token-transfers").catch(function () { return { items: [] }; })]).then(function (x) {
      var t = x[0], tt = x[1].items || [], a = (t.from && t.from.hash || "").toLowerCase(), r = translate(a, { tx: t, tr: tt, h: h, t: t.timestamp });
      out.innerHTML = '<section class="card"><div class="card-head"><h2>🧾 这笔交易</h2></div>' +
        '<div class="lg-one"><span class="lg-ico">' + r.ico + '</span><div>' + r.text + "</div></div>" +
        '<dl class="nm-dl"><dt>谁操作的</dt><dd>' + who(a) + "</dd><dt>时间</dt><dd>" + bj(t.timestamp) + "（北京时间）</dd><dt>状态</dt><dd>" + (t.result === "success" ? '<b class="nm-ok">✅ 成功</b>' : '<b class="nm-bad">❌ 失败，没扣钱</b>') + "</dd><dt>手续费</dt><dd>" + amt(t.fee && t.fee.value, 18) + " DAI</dd>" +
        (t.to && t.to.hash ? "<dt>对象</dt><dd>" + (KNOWN[t.to.hash.toLowerCase()] ? '<b class="sc-kn">' + KNOWN[t.to.hash.toLowerCase()] + "</b>" : who(t.to.hash)) + "</dd>" : "") + "</dl>" +
        (tt.length ? '<h3 class="lg-h3">🔁 这笔交易里币的流向</h3><div class="lg-flow">' + tt.map(function (x) {
          var tok = (x.token && x.token.address_hash || "").toLowerCase(), tld = tok === NAMES.ailgns ? "ailgns" : tok === NAMES.lgns ? "lgns" : "", id = x.total && x.total.token_id;
          var v = tld && id ? '<b data-nft="' + tld + ":" + id + '">🌐 域名</b>' : "<b>" + amt(x.total && x.total.value, x.total && x.total.decimals) + " " + esc(x.token && x.token.symbol || "") + "</b>";
          var f = (x.from && x.from.hash || "").toLowerCase(), g = (x.to && x.to.hash || "").toLowerCase();
          var nm = function (z) { return /^0x0+$/.test(z) ? "<b>🆕 新铸造</b>" : KNOWN[z] ? '<b class="sc-kn">' + KNOWN[z] + "</b>" : who(z); };
          return "<div>" + nm(f) + ' <span class="lg-arr">→</span> ' + nm(g) + "：" + v + "</div>";
        }).join("") + "</div>" : "") +
        '<p class="muted lg-raw">交易编号 <span class="mono">' + h + '</span> · <a href="https://anubisscan.io/tx/' + h + '" target="_blank" rel="noopener">链上原始记录 ↗</a></p></section>' +
        '<p class="muted" style="text-align:center"><a href="#/scan/' + a + '">← 回到 ' + (KNOWN[a] || "这个钱包") + ' 的账本</a></p>';
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
  // 🏅 信誉标志：按累计成交给挂单人加「信誉商家」等芯片（OTC 订单簿、账本头部用）。等级在 /api/cred 里定
  var CREDN = ["新手", "常客", "✔ 认证商家", "✔ OTC 大户", "👑 至尊大户"], credCache = {}, credAt = 0;
  A.credFill = function (root) {
    var els = Array.prototype.slice.call(root.querySelectorAll("[data-a]:not([data-cred])")), as = {};
    els.forEach(function (e) { var a = e.getAttribute("data-a").toLowerCase(); if (!KNOWN[a]) as[a] = 1; });
    var need = Object.keys(as).filter(function (a) { return !credCache[a] || Date.now() - credAt > 120000; });
    var p = need.length ? fetch("/api/cred?a=" + need.slice(0, 40).join(",")).then(function (r) { return r.json(); }).then(function (j) { Object.keys(j).forEach(function (a) { credCache[a] = j[a]; }); credAt = Date.now(); }).catch(function () {}) : Promise.resolve();
    p.then(function () {
      els.forEach(function (e) {
        var a = e.getAttribute("data-a").toLowerCase(), c = credCache[a]; e.setAttribute("data-cred", "1");
        if (!c || c.lv < 1) return;
        var chip = document.createElement("i"); chip.className = "cred cred" + c.lv; chip.textContent = CREDN[c.lv]; chip.title = "官方认证 · 本站 OTC 累计真实成交 " + c.vol.toLocaleString("en-US") + " DAI · " + c.n + " 笔";
        e.insertAdjacentElement("afterend", chip);
      });
    });
  };
  A.credOf = function (a) { return fetch("/api/cred?a=" + a).then(function (r) { return r.json(); }).then(function (j) { var c = j[String(a).toLowerCase()] || { vol: 0, n: 0, lv: 0 }; c.name = CREDN[c.lv]; var nx = c.lv < 4 ? [[1000, 5], [10000, 20], [100000, 50], [1000000, 100]][c.lv] : null; c.next = nx ? { name: CREDN[c.lv + 1], vol: nx[0], n: nx[1] } : null; return c; }); };
  A.nameOf = nameOf; // 荣耀榜播报：没域名的大哥引导去注册
  A.pages.scan = page;
})();
