// ⚡ 跨链桥页里的「秒到通道」（第三方 GaleBridge）。2026-11-20 上线；当天从单独一页合并进 #/usdt（由 usdt.js 选了秒到通道时调 A.gale.mount 画进来）。
// 2026-11-21 改成本站自己的简体卡片（站长：「默认是简体，我们的客户大陆用户」；GaleBridge 自己的小窗只有繁体 / 英文，所以不再嵌它的小窗）：
//   · 页面直接调 GaleBridge 在 Anubis 上的合约：存入(币, 数量, "目标链,收款人,目标币")，由它在目标链付款。客户的币进的是它的合约，本站不经手，没有新合约。
//   · 这是它没有公开写明的接法（链上 2026-11-20 核对过：它自己网站发的也是这一个函数、同样的备注格式）。所以每次先问 /api/gale 做体检：
//     它公开清单里的合约地址还是登记的那个、目标链的钱够、最近没有「存了没付」的单 —— 任何一条不对就不让发交易（宁可拦）。发之前再在节点上模拟一遍。
//   · 只做从 Anubis 往外：付出 DAI / USDT，到账 Polygon 或 BSC 的 DAI / USDT。往 Anubis 里充走「本站通道」（官方桥 2 分钟、0 手续费）。
//   · 本站服务费 0.05%：跨链前钱包单独转一笔到本站收款钱包（没有新合约只能分两笔）。页面写在手续费合计里，小字「含本站 0.05%」；
//     站长想过「收了不说」，没做：这笔是钱包单独弹出来的转账，藏不住。服务费付了、跨链没发出去：记在这台设备上，同一个数量再点不重复收。
//   · 「预计到手」是按链上最近真实成交量出来的费率估的（/api/gale），不是 GaleBridge 的正式报价，页面上写「约」。
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var FEE_BPS = 5n; // 本站服务费：万分之五 = 0.05%。改费率时页面那行合计、客服知识、更新日志要一起改
  var PAYEE = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6"; // 本站收款钱包
  var GALE = "0xd1a5c8492ed1773ca0f1a97abad71afb122a750a"; // GaleBridge 在 Anubis 上的合约（/api/gale 每次核对它有没有变）
  var DGALE = { "137": ["0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "0xa2c1ec79872d2c961cbd33ef750659e3b2439647"], "56": ["0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "0xa2c1ec79872d2c961cbd33ef750659e3b2439647"] }; // 它在目标链上付款的合约（新版、旧版）
  var SEL = { deposit: "0x5f377433", approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231", transfer: "0xa9059cbb" };
  var PAY = "0xae33cb06d7303f889d953bb09540983050163c1c4c98b330db432a911cfb63fd"; // 它付款时的事件（付款方, 币, 收款人；数量）
  var DEP = "0x1cbdf89ba7d7cd8303790e1d0c0dcbc95b421c3d27f4958e058ec003073df946"; // 存入时的事件（客户, 币；数量, "目标链,收款人,目标币"）
  var FALLBACK = { "DAI>DAI": 0.0041, "DAI>USDT": 0.0032, "USDT>USDT": 0.003, "USDT>DAI": 0.0034 }; // 2026-11-20 链上量的比例费（不含每笔固定的 0.1）；读不到最近成交时用它
  var SRC = { // 能付出的币（都在 Anubis 上）
    DAI: { k: "DAI", sym: "DAI", addr: "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", d: 18, native: true },
    USDT: { k: "USDT", sym: "USDT", addr: "0xdfb6a28bc6dc51fed17c27c880f2c66cdd040a3e", d: 6 }
  };
  var DST = { // 能到账的币
    PD: { k: "PD", c: "137", key: "polygon", chain: "Polygon", sym: "DAI", addr: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", d: 18, scan: "https://polygonscan.com/tx/" },
    PU: { k: "PU", c: "137", key: "polygon", chain: "Polygon", sym: "USDT", addr: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", d: 6, scan: "https://polygonscan.com/tx/" },
    BU: { k: "BU", c: "56", key: "bsc", chain: "BSC", sym: "USDT", addr: "0x55d398326f99059ff775485246999027b3197955", d: 18, scan: "https://bscscan.com/tx/" },
    BD: { k: "BD", c: "56", key: "bsc", chain: "BSC", sym: "DAI", addr: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", d: 18, scan: "https://bscscan.com/tx/" }
  };
  var GAS_KEEP = 50000000000000000n; // 付出 DAI 时在 Anubis 上留 0.05 DAI 当 Gas
  var src = "DAI", dst = "PD", amtStr = "", account = null, bal = {}, info = null, infoAt = 0, live = {}, busy = false, pick = null, host = null, rid = 0, hooked = false, pend = null, timer = null;

  function g(id) { return document.getElementById(id); }
  function low(s) { return String(s || "").toLowerCase(); }
  function word(h) { return ("0".repeat(64) + String(h).replace(/^0x/, "")).slice(-64); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function show(v, dec, dg) { // 链上的整数 → 给人看的数（往下取）
    var s = v.toString().padStart(dec + 1, "0"), i = s.slice(0, s.length - dec), f = s.slice(s.length - dec).slice(0, dg == null ? 6 : dg).replace(/0+$/, "");
    return i + (f ? "." + f : "");
  }
  function toWei(str, dec) { // 客户填的数 → 链上的整数；填得不对返回 null
    var m = /^(\d{0,12})(?:\.(\d{0,18}))?$/.exec(String(str || "").trim());
    if (!m || (!m[1] && !m[2])) return null;
    return BigInt(m[1] || "0") * 10n ** BigInt(dec) + BigInt(((m[2] || "") + "0".repeat(dec)).slice(0, dec) || "0");
  }
  function num2(x) { return (Math.floor(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function nice(e) { var m = (A.otcKit && A.otcKit.niceError) ? A.otcKit.niceError(e) : String((e && e.message) || e || ""); return /reject|denied|取消|拒绝|cancel/i.test(m) ? "你在钱包里取消了，这一步没有发出去。" : (m || "钱包没有响应，刷新后再试"); }
  function say(t, bad) { var el = g("gbx-say"); if (el) { el.textContent = t || ""; el.className = "u2d-say" + (bad ? " bad" : t ? " on" : ""); } }
  // 这一对币现在的数：限额和每笔固定费来自 GaleBridge 公开的清单（/api/gale），对面的钱、比例费、有没有晚付的单来自链上（loadLive）
  function pair() {
    var d = DST[dst], lv = live[d.c];
    if (!info || !info.ok || !info.lim || !info.lim[src] || !lv || !lv.ok) return null;
    return { pct: lv.pct[src + ">" + dst], fix: info.fix[dst], min: info.lim[src][0], max: info.lim[src][1], liq: lv.liq[dst], late: lv.late[dst] || 0 };
  }

  // ---------- 体检和费率 ----------
  function loadInfo(force) {
    if (!force && info && Date.now() - infoAt < 120000) return Promise.resolve(info);
    return fetch("/api/gale").then(function (r) { return r.json(); }).then(function (j) { info = j && typeof j === "object" ? j : { ok: false }; infoAt = Date.now(); return info; }, function () { info = { ok: false, why: "net" }; infoAt = Date.now(); return info; });
  }
  // 把 Anubis 上的存入和目标链上的付款配对：算每个「付出币 > 到账币」的比例费中位数，和「存了 3～25 分钟还没付」的单数（纯计算，方便单独测）
  function analyse(deps, pays, fix, nowBlock, ks) {
    var used = {}, samples = {}, late = {}, pct = {};
    ks.forEach(function (k) { samples[k] = { DAI: [], USDT: [] }; late[k] = 0; });
    pays.forEach(function (p) {
      var best = -1, gap = 1;
      deps.forEach(function (d, i) {
        if (used[i] || d.k !== p.k || d.recv !== p.to || !(d.amt >= p.amt)) return;
        var x = (d.amt - p.amt) / d.amt; if (x < 0.03 && x < gap) { gap = x; best = i; }
      });
      if (best < 0) return;
      used[best] = 1;
      var d = deps[best], r = (d.amt - p.amt - (fix[p.k] || 0)) / d.amt;
      if (r > 0 && r < 0.02) samples[p.k][d.sym].push(r);
    });
    deps.forEach(function (d, i) { var age = nowBlock - d.b; if (!used[i] && age > 180 && age < 1500) late[d.k]++; }); // Anubis 约 1 秒一个块
    ks.forEach(function (k) { ["DAI", "USDT"].forEach(function (sy) {
      var a = samples[k][sy].sort(function (x, y) { return x - y; });
      pct[sy + ">" + k] = a.length >= 3 ? a[Math.floor(a.length / 2)] : FALLBACK[sy + ">" + DST[k].sym];
    }); });
    return { pct: pct, late: late };
  }
  // 读链上的实时情况（只读这一条目标链）：它合约里的钱 + 最近约 1～2 小时的存入和付款。3 分钟内不重复读
  function loadLive(c, force) {
    var old = live[c]; if (!force && old && Date.now() - old.at < 180000) return Promise.resolve(old);
    var key = c === "137" ? "polygon" : "bsc", ks = Object.keys(DST).filter(function (k) { return DST[k].c === c; });
    var hx = function (n) { return "0x" + n.toString(16); };
    var liqP = Promise.all(ks.map(function (k) { return rd(key, DST[k].addr, SEL.balanceOf + word(DGALE[c][0])); }));
    var logP = Promise.all([
      W.rpcOn("anubis", "eth_blockNumber", []).then(function (t) { var top = parseInt(t, 16); return Promise.all([[top - 9999, top - 5000], [top - 4999, top]].map(function (r) { return W.rpcOn("anubis", "eth_getLogs", [{ address: GALE, topics: [DEP], fromBlock: hx(r[0]), toBlock: hx(r[1]) }]); })).then(function (a) { return { top: top, logs: a[0].concat(a[1]) }; }); }),
      W.rpcOn(key, "eth_blockNumber", []).then(function (t) { var top = parseInt(t, 16); return W.rpcOn(key, "eth_getLogs", [{ address: DGALE[c][0], topics: [PAY], fromBlock: hx(top - 5000), toBlock: hx(top) }]); })
    ]).then(function (res) {
      var deps = [], pays = [];
      res[0].logs.forEach(function (l) {
        var t = "0x" + l.topics[2].slice(26), sy = Object.keys(SRC).filter(function (x) { return SRC[x].addr === t; })[0]; if (!sy) return;
        var d = l.data.slice(2), n = parseInt(d.slice(128, 192), 16), memo = "";
        for (var i = 0; i < n && i < 200; i++) memo += String.fromCharCode(parseInt(d.slice(192 + i * 2, 194 + i * 2), 16));
        var m = memo.split(","); if (m.length !== 3 || m[0] !== c) return;
        var k = ks.filter(function (x) { return DST[x].addr === low(m[2]); })[0]; if (!k) return;
        deps.push({ b: parseInt(l.blockNumber, 16), sym: sy, amt: Number(BigInt("0x" + d.slice(0, 64))) / Math.pow(10, SRC[sy].d), k: k, recv: low(m[1]) });
      });
      res[1].forEach(function (l) {
        var t = "0x" + l.topics[2].slice(26), k = ks.filter(function (x) { return DST[x].addr === t; })[0]; if (!k) return;
        pays.push({ k: k, to: "0x" + l.topics[3].slice(26), amt: Number(BigInt(l.data)) / Math.pow(10, DST[k].d) });
      });
      return analyse(deps, pays, (info && info.fix) || {}, res[0].top, ks);
    }).catch(function () { return analyse([], [], {}, 0, ks); }); // 读不到最近成交：比例费用 2026-11-20 量的数，照样可以跨（对面的钱和模拟还会再查）
    return Promise.all([liqP, logP]).then(function (r) {
      var liq = {}; ks.forEach(function (k, i) { liq[k] = Number(r[0][i]) / Math.pow(10, DST[k].d); });
      live[c] = { ok: true, at: Date.now(), liq: liq, pct: r[1].pct, late: r[1].late };
      return live[c];
    }, function () { live[c] = { ok: false, at: Date.now() - 150000 }; return live[c]; }); // 连它合约里有多少钱都读不到：先不让跨，30 秒后可以再读
  }
  // 这一笔的数：付出多少、两边各收多少、预计到手多少
  function calc() {
    var s = SRC[src], d = DST[dst], p = pair(), amt = toWei(amtStr, s.d);
    if (!amt || amt <= 0n) return null;
    var a = Number(amt) / Math.pow(10, s.d), ours = amt * FEE_BPS / 10000n, oursN = Number(ours) / Math.pow(10, s.d);
    var galeN = p ? a * p.pct + p.fix : 0, outN = Math.max(0, a - galeN);
    return { s: s, d: d, p: p, amt: amt, a: a, ours: ours, oursN: oursN, galeN: galeN, outN: outN };
  }
  // 现在能不能跨：不能的话给一句原因（short 放按钮上，long 放卡片里）
  function check(c) {
    if (!info) return { wait: true, short: "正在检查秒到通道…" };
    if (!info.ok) return { short: "秒到通道暂时用不了", long: "现在没法确认 GaleBridge 的状态，为了你的币安全，先不让发交易。请走「本站通道」，或者过几分钟再来。" };
    var lv = live[DST[dst].c];
    if (!lv) return { wait: true, short: "正在读 " + DST[dst].chain + " 链上的情况…" };
    if (!lv.ok) return { short: "读不到 " + DST[dst].chain + " 链", long: "现在读不到 " + DST[dst].chain + " 链上 GaleBridge 的情况，没法确认它付不付得出，先不让发交易。过一会儿再点一次，或者换一个到账的币。", retry: true };
    if (!c) return { idle: true };
    var p = c.p; if (!p) return { short: "秒到通道暂时用不了", long: "这一对币现在查不到，换一个到账的币试试。" };
    if (c.a < p.min) return { short: "最少 " + p.min + " " + c.s.sym, long: "GaleBridge 一笔最少 " + p.min + " " + c.s.sym + "。" };
    if (c.a > p.max) return { short: "一笔最多 " + p.max.toLocaleString("en-US"), long: "GaleBridge 一笔最多 " + p.max.toLocaleString("en-US") + " " + c.s.sym + "，请分几笔。" };
    if (c.a > p.liq * 0.9) return { short: "对面的钱不够这一笔", long: "GaleBridge 在 " + c.d.chain + " 上的 " + c.d.sym + " 现在约有 " + Math.floor(p.liq).toLocaleString("en-US") + "，不够付这一笔。请把数量改小，或者换一个到账的币。" };
    if (p.late >= 3) return { short: "GaleBridge 现在付款慢", long: "链上看到最近有 " + p.late + " 笔存进去超过 3 分钟还没付到 " + c.d.chain + "，它可能在排队。先别跨，过几分钟再看，或者走「本站通道」。" };
    if (account && bal[src] != null) {
      var need = c.amt + c.ours + (c.s.native ? GAS_KEEP : 0n);
      if (bal[src] < need) return { short: c.s.sym + " 余额不足", long: "这一笔要用 " + show(c.amt + c.ours, c.s.d, 4) + " " + c.s.sym + "（含服务费）" + (c.s.native ? "，另外留 0.05 DAI 付 Gas" : "") + "，钱包里不够。" };
      if (!c.s.native && bal.DAI != null && bal.DAI < GAS_KEEP / 5n) return { short: "没有 DAI 付 Gas", long: "Anubis 上的 Gas 用 DAI 付，这个钱包里几乎没有 DAI。先转一点 DAI 进来。" };
    }
    return { ok: true };
  }

  // ---------- 画面 ----------
  function tokIn(o, anubis) { return '<span class="u2d-cw"><i class="u2d-coin ' + (o.sym === "USDT" ? "usdt" : "dai") + '"><img src="/icons/tokens/' + (o.sym === "USDT" ? "usdt" : "dai") + '.png?v=1" alt="" width="30" height="30">' + (o.sym === "USDT" ? "₮" : "◈") + "</i>" + (anubis ? '<em class="u2d-ch" title="Anubis 链"></em>' : "") + "</span><span><b>" + o.sym + "</b><small>" + (anubis ? "Anubis" : o.chain) + " 链</small></span>"; }
  function tokBtn(side) { var o = side === "src" ? SRC[src] : DST[dst]; return '<button type="button" class="u2d-tok u2d-tb" data-side="' + side + '" aria-label="换一个币">' + tokIn(o, side === "src") + '<i class="u2d-car"></i></button>'; }
  function pickList(side) {
    var all = side === "src" ? SRC : DST, cur = side === "src" ? src : dst;
    return '<div class="u2d-pk"><p>' + (side === "src" ? "你要付出哪个币" : "你要到账哪个币") + "</p>" + Object.keys(all).filter(function (k) { return k !== cur; }).map(function (k) { return '<button type="button" class="u2d-tok" data-side="' + side + '" data-k="' + k + '">' + tokIn(all[k], side === "src") + "</button>"; }).join("") + "</div>";
  }
  function draw() {
    if (!host) return;
    host.innerHTML = '<div class="gbx"><section class="u2d-card">' +
      '<div class="u2d-box"><div class="u2d-bh"><span>你付出</span><span>余额 <b id="gbx-b1">—</b><button type="button" class="u2d-max" id="gbx-max">全部</button></span></div>' +
      '<div class="u2d-bm"><input id="gbx-a" class="u2d-num" inputmode="decimal" autocomplete="off" placeholder="0">' + tokBtn("src") + "</div>" + (pick === "src" ? pickList("src") : "") + "</div>" +
      '<div class="u2d-mid"><i>↓</i></div>' +
      '<div class="u2d-box end"><div class="u2d-bh"><span>预计到手</span><span>约 20 秒到</span></div>' +
      '<div class="u2d-bm"><output id="gbx-out" class="u2d-num zero">0</output>' + tokBtn("dst") + "</div>" + (pick === "dst" ? pickList("dst") : "") + "</div>" +
      '<div class="u2d-dt" id="gbx-q" hidden></div>' +
      '<button type="button" class="u2d-go" id="gbx-go"></button><p class="u2d-say" id="gbx-say"></p><div id="gbx-prog"></div>' +
      "</section>" +
      '<p class="gbx-note"><b>这是第三方 GaleBridge 的服务，不是本站，也不是官方桥。</b>你的币进的是 GaleBridge 的合约，由它在目标链付给你；到手的数是按它最近的实际成交估的，以实际到账为准。出了问题要找 GaleBridge 处理。</p>' +
      "</div>";
    var a = g("gbx-a"); a.value = amtStr; a.oninput = function () { amtStr = a.value.replace(/[^\d.]/g, ""); if (a.value !== amtStr) a.value = amtStr; paint(); };
    g("gbx-max").onclick = function () {
      if (busy) return; if (bal[src] == null) return say("先连接钱包", true);
      var s = SRC[src], v = bal[src]; if (s.native) v = v > GAS_KEEP ? v - GAS_KEEP : 0n;
      v = v * 10000n / (10000n + FEE_BPS); // 留出服务费
      amtStr = show(v, s.d, s.d === 6 ? 2 : 4); a.value = amtStr; paint();
    };
    g("gbx-go").onclick = onGo;
    [].forEach.call(host.querySelectorAll(".u2d-tb"), function (b) { b.onclick = function () { if (busy) return; var sd = b.getAttribute("data-side"); pick = pick === sd ? null : sd; draw(); }; });
    [].forEach.call(host.querySelectorAll(".u2d-pk button"), function (b) { b.onclick = function () { if (busy) return; var k = b.getAttribute("data-k"); if (b.getAttribute("data-side") === "src") src = k; else dst = k; pick = null; draw(); }; });
    paint(); paintProg();
    loadLive(DST[dst].c).then(paint);
  }
  function paint() {
    var c = calc(), st = check(c), out = g("gbx-out"), q = g("gbx-q"), go = g("gbx-go"), b1 = g("gbx-b1");
    if (!out || !q || !go) return;
    if (b1) b1.textContent = bal[src] == null ? "—" : show(bal[src], SRC[src].d, SRC[src].d === 6 ? 2 : 4);
    var okNum = c && c.p && info && info.ok;
    out.textContent = okNum ? num2(c.outN) : "0"; out.className = "u2d-num" + (okNum ? "" : " zero");
    var html = "";
    if (st.long) html += '<p class="u2d-warn">' + esc(st.long) + "</p>";
    if (okNum) {
      html += '<dl class="u2d-rows">' +
        "<div><dt>手续费</dt><dd>约 " + num2(c.galeN + c.oursN) + " " + c.s.sym + '<small class="gbx-in">含本站 0.05%</small></dd></div>' +
        "<div><dt>到账地址</dt><dd>" + (account ? esc(A.short ? A.short(account) : account.slice(0, 6) + "…" + account.slice(-4)) : "你连接的钱包") + " · " + c.d.chain + "</dd></div>" +
        "<div><dt>钱包要确认</dt><dd>2～3 次（授权、服务费、跨链）</dd></div>" +
        "</dl>";
    }
    q.innerHTML = html; q.hidden = !html;
    go.textContent = busy ? "处理中…" : st.wait || st.retry || !info.ok ? st.short : !account ? "连接钱包" : (!c ? "输入数量" : st.ok ? "开始秒到跨链" : st.short);
    go.className = "u2d-go" + (!busy && account && (!c || !st.ok) ? " off" : "");
  }
  function lock(on) { busy = on; if (host) [].forEach.call(host.querySelectorAll("#gbx-go, #gbx-max, .u2d-tb, .u2d-pk button"), function (b) { b.disabled = on; }); var a = g("gbx-a"); if (a) a.readOnly = on; paint(); }

  // ---------- 钱包和读链 ----------
  function rd(chain, to, data) { return W.rpcOn(chain, "eth_call", [{ to: to, data: data }, "latest"]).then(function (x) { return BigInt(x && x !== "0x" ? x : "0x0"); }); }
  function loadBal() {
    if (!account) return Promise.resolve();
    return Promise.all([
      W.rpcOn("anubis", "eth_getBalance", [account, "latest"]).then(function (x) { bal.DAI = BigInt(x); }),
      rd("anubis", SRC.USDT.addr, SEL.balanceOf + word(account)).then(function (x) { bal.USDT = x; })
    ]).then(paint, function () { /* 读不到余额：先显示「—」，发交易前还会再查 */ });
  }
  function connect() {
    var eth;
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { account = low(a[0]); return W.switchTo(eth, "anubis"); }).then(function () { return account; });
  }
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
  function sendTx(tx, label) {
    say("请在钱包里确认「" + label + "」");
    return A.wallets.ask(W.get(), { method: "eth_sendTransaction", params: [tx] }).then(function (h) { say(label + "已提交，等链上确认…"); return wait(h).then(function () { return h; }); });
  }
  function paidGet() { try { return localStorage.getItem("gbx:paid") || ""; } catch (e) { return ""; } }
  function paidSet(k) { try { if (k) localStorage.setItem("gbx:paid", k); else localStorage.removeItem("gbx:paid"); } catch (e) { /* 存不了就算了：最坏是重试时再收一次 0.05% */ } }
  function depositData(c) {
    var memo = c.d.c + "," + account + "," + c.d.addr, hex = "";
    for (var i = 0; i < memo.length; i++) hex += ("0" + memo.charCodeAt(i).toString(16)).slice(-2);
    return SEL.deposit + word(c.s.addr) + word(c.amt.toString(16)) + word("60") + word(memo.length.toString(16)) + hex + "0".repeat((64 - hex.length % 64) % 64);
  }

  // ---------- 开始跨 ----------
  function onGo() {
    if (busy) return;
    if (!info || !info.ok) return void loadInfo(true).then(paint);
    if (!live[DST[dst].c] || !live[DST[dst].c].ok) return void loadLive(DST[dst].c, true).then(paint);
    if (!account) return void connect().then(function () { return loadBal(); }).then(paint, function (e) { say(nice(e), true); });
    var c0 = calc(); if (!c0) { say(""); var a = g("gbx-a"); if (a) a.focus(); return; }
    if (!check(c0).ok) return;
    lock(true); say("正在检查秒到通道…");
    var c, data, startBlock = 0, hash = "";
    ready().then(function () { return Promise.all([loadInfo(true), loadLive(DST[dst].c, true), loadBal()]); }).then(function () {
      c = calc(); var st = check(c);
      if (!c || !st.ok) throw new Error(st.long || st.short || "现在不能跨，请稍后再试。");
      data = depositData(c);
      return rd("anubis", c.s.addr, SEL.allowance + word(account) + word(GALE));
    }).then(function (allow) {
      if (allow >= c.amt) return;
      return sendTx({ from: account, to: c.s.addr, data: SEL.approve + word(GALE) + word(c.amt.toString(16)) }, "授权 " + c.s.sym + "（只授权这一笔的数量）");
    }).then(function () {
      // 发之前在节点上模拟一遍跨链那一笔：过不了就停在这，服务费还没收
      return W.rpcOn("anubis", "eth_call", [{ from: account, to: GALE, data: data }, "latest"]).catch(function () { throw new Error("模拟跨链这一笔没通过，为了安全没有发出去，服务费也没有收。请过几分钟再试，或者走「本站通道」。"); });
    }).then(function () {
      if (c.ours <= 0n) return;
      var key = [account, c.d.c, c.s.addr, c.amt.toString()].join("|");
      if (paidGet() === key) return;
      var tx = c.s.native ? { from: account, to: PAYEE, value: "0x" + c.ours.toString(16) } : { from: account, to: c.s.addr, data: SEL.transfer + word(PAYEE) + word(c.ours.toString(16)) };
      return sendTx(tx, "本站服务费 " + show(c.ours, c.s.d) + " " + c.s.sym).then(function () { paidSet(key); });
    }).then(function () {
      return W.rpcOn(c.d.key, "eth_blockNumber", []).then(function (x) { startBlock = parseInt(x, 16); }, function () { startBlock = 0; });
    }).then(function () {
      say("请在钱包里确认「跨链 " + show(c.amt, c.s.d) + " " + c.s.sym + "」");
      return A.wallets.ask(W.get(), { method: "eth_sendTransaction", params: [{ from: account, to: GALE, data: data }] });
    }).then(function (h) {
      hash = h; paidSet("");
      pend = { h: h, k: c.d.k, a: account, out: c.outN, from: startBlock, t: Date.now() }; pendSave();
      say("跨链已提交，等 Anubis 确认…");
      paintProg();
      return wait(h);
    }).then(function () {
      say(""); amtStr = ""; var a = g("gbx-a"); if (a) a.value = "";
      lock(false); loadBal(); track();
    }, function (e) {
      var m = nice(e);
      if (hash) { m = "跨链这一笔在链上没成功，币没有动。"; pend = null; pendSave(); paintProg(); }
      else if (/取消/.test(m) && paidGet()) m = "你取消了跨链这一笔。服务费已经付过，同一个数量再点一次不会重复收。";
      lock(false); say(m, true); loadBal();
    });
  }

  // ---------- 到账进度 ----------
  function pendSave() { try { if (pend) localStorage.setItem("gbx:pend", JSON.stringify(pend)); else localStorage.removeItem("gbx:pend"); } catch (e) { /* 存不了：关页面回来就看不到进度条，不影响到账 */ } }
  function pendLoad() { try { var p = JSON.parse(localStorage.getItem("gbx:pend") || "null"); if (p && p.h && DST[p.k] && Date.now() - p.t < 6 * 3600e3) return p; } catch (e) { /* 忽略 */ } return null; }
  function paintProg() {
    var el = g("gbx-prog"); if (!el) return;
    if (!pend) { el.innerHTML = ""; return; }
    var d = DST[pend.k], sec = Math.floor((Date.now() - pend.t) / 1000);
    if (pend.done) {
      el.innerHTML = '<div class="gbx-prog ok"><b>✅ 已到账 ' + esc(pend.got) + " " + d.sym + "</b><span>在 " + d.chain + ' 链，到你的钱包里看余额。</span><a href="' + d.scan + esc(pend.done) + '" target="_blank" rel="noopener">看这笔付款 ↗</a><button type="button" id="gbx-pok">知道了</button></div>';
      g("gbx-pok").onclick = function () { pend = null; pendSave(); paintProg(); };
      return;
    }
    el.innerHTML = '<div class="gbx-prog"><b>⏳ 正在跨到 ' + d.chain + "：预计到手约 " + num2(pend.out) + " " + d.sym + "</b>" +
      (sec < 180 ? "<span>一般 20 秒左右到账，已等 " + sec + " 秒。可以关掉这一页，回来还能看到。</span>"
        : '<span class="bad">已经等了 ' + Math.floor(sec / 60) + " 分钟，比平时慢。币在 GaleBridge 的合约里，不会凭空消失；请拿下面这笔交易的哈希到 galebridge.net 查，或者找 GaleBridge 的客服。本站查不到它内部的订单。</span>") +
      "<code>" + esc(pend.h) + '</code><button type="button" id="gbx-pcp">复制交易哈希</button></div>';
    g("gbx-pcp").onclick = function () { try { navigator.clipboard.writeText(pend.h); say("已复制"); } catch (e) { /* 复制不了就让客户长按选中 */ } };
  }
  function track() {
    clearTimeout(timer);
    if (!pend || pend.done) return;
    var d = DST[pend.k];
    var go = function () {
      if (!pend || pend.done) return;
      var from = pend.from ? "0x" + pend.from.toString(16) : "latest";
      W.rpcOn(d.key, "eth_getLogs", [{ address: DGALE[d.c], topics: [PAY, null, "0x" + word(d.addr), "0x" + word(pend.a)], fromBlock: from, toBlock: "latest" }]).then(function (logs) {
        if (logs && logs.length) {
          var l = logs[logs.length - 1];
          pend.done = l.transactionHash; pend.got = show(BigInt(l.data), d.d, 2); pendSave(); paintProg(); loadBal();
          return;
        }
        paintProg(); timer = setTimeout(go, Date.now() - pend.t < 120000 ? 4000 : 15000);
      }, function () { paintProg(); timer = setTimeout(go, 8000); });
    };
    go();
  }

  function unmount() { clearTimeout(timer); timer = null; host = null; }
  function mountIn(el, id) {
    rid = id; host = el;
    if (!hooked) {
      hooked = true;
      try { A.wallets.onAccounts(function (a) { account = a && a[0] ? low(a[0]) : null; bal = {}; if (host) { paint(); loadBal(); } }); } catch (e) { /* 忽略 */ }
      window.addEventListener("hashchange", function () { try { if (location.hash.indexOf("#/usdt") !== 0) unmount(); } catch (e) { /* 忽略 */ } });
    }
    pend = pend || pendLoad();
    draw();
    loadInfo().then(paint);
    (account ? Promise.resolve() : A.wallets.silent().then(function (a) { if (a) account = low(a); }, function () { /* 没连过就等客户点 */ }))
      .then(function () { paint(); return loadBal(); }).then(function () { if (pend && (!account || pend.a === account)) track(); }, function () { /* 忽略 */ });
  }
  A.gale = { mount: mountIn, unmount: unmount };
  // 老网址 #/gale：转到跨链桥页并选好秒到通道
  A.pages.gale = function () {
    try { sessionStorage.setItem("u2d:mode", "fast"); } catch (e) { /* 存不了就落在本站通道，客户自己点一下 */ }
    location.replace("#/usdt");
  };
})();
