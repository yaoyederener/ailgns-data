// 🔁 aiswap 页 #/aiswap（站长 2026-11-11 定：本站自己的 DEX，合约 = PancakeSwap V2 原版一行不改）
// 三块：兑换（DAI / AiLGNS / 新币，自动走 DAI→AiLGNS→新币 两跳）、流动性（加 / 撤、我的份额）、池子列表（储备、24h 成交、费率）
// 合约地址在 lib/aiswap.js，通过 /api/aiswap 读；没填地址时整页只显示「部署中」占位，不报错
(function () {
  "use strict";
  var A = window.AIL, K = function () { return A.otcKit; };
  var SEL = { approve: "0x095ea7b3", balanceOf: "0x70a08231", getReserves: "0x0902f1ac", symbol: "0x95d89b41", decimals: "0x313ce567", totalSupply: "0x18160ddd",
    swapFee: "0x5c11d795" /* swapExactTokensForTokensSupportingFeeOnTransferTokens：普通币和带税的币都能用 */,
    addLiq: "0xe8e33700", removeLiq: "0xbaa2abde", getPair: "0xe6a43905" };
  var MAX_UINT = (1n << 256n) - 1n, ZERO = "0x0000000000000000000000000000000000000000";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function addrWord(a) { return String(a).toLowerCase().replace("0x", "").padStart(64, "0"); }
  function word(hex, i) { return BigInt("0x" + (String(hex || "0x").slice(2 + i * 64, 2 + (i + 1) * 64) || "0")); }
  function toWei(s, d) { s = String(s || "0").trim(); if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return 0n; var p = s.split("."), a = p[0] || "0", b = (p[1] || "").slice(0, d).padEnd(d, "0"); return BigInt(a) * 10n ** BigInt(d) + BigInt(b || "0"); }
  function num(wei, d) { return Number(wei) / Math.pow(10, d); }
  function f(v, d) { if (!isFinite(v)) return "—"; if (d === undefined) d = v >= 1000 ? 2 : v >= 1 ? 4 : 6; return Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d }); }
  function low(a) { return String(a || "").toLowerCase(); }
  function g(id) { return document.getElementById(id); }
  function deadline() { return Math.floor(Date.now() / 1000) + ((cfg && cfg.deadlineMin) || 20) * 60; }

  var cfg = null, pools = [], account = null, rid = 0, tab = "swap", tokens = [], slip = 1, custom = {};
  var S = { from: "", to: "", amt: "" }, L = { a: "", b: "", amtA: "", amtB: "" };

  // ---------- 数据 ----------
  function load() {
    return fetch("/api/aiswap").then(function (r) { return r.json(); }).then(function (j) {
      cfg = j.cfg || null; pools = (j.pools || []).map(function (p) { p.r0 = BigInt(p.r0 || 0); p.r1 = BigInt(p.r1 || 0); p.lp = BigInt(p.lp || 0); return p; });
      tokens = []; var seen = {};
      function addTok(t) { if (!t || !t.addr) return; var k = low(t.addr); if (seen[k]) return; seen[k] = 1; tokens.push({ sym: t.sym, addr: k, dec: t.dec }); }
      (cfg && cfg.tokens || []).forEach(addTok); pools.forEach(function (p) { addTok(p.t0); addTok(p.t1); }); Object.keys(custom).forEach(function (k) { addTok(custom[k]); });
      if (cfg && cfg.slippage && cfg.slippage.indexOf(slip) < 0) slip = cfg.slippage[1] || cfg.slippage[0];
      if (!S.from && tokens[0]) S.from = tokens[0].addr; if (!S.to && tokens[1]) S.to = tokens[1].addr;
      if (!L.a && tokens[1]) L.a = tokens[1].addr; if (!L.b && tokens[0]) L.b = tokens[0].addr;
    });
  }
  function tok(a) { a = low(a); for (var i = 0; i < tokens.length; i++) if (tokens[i].addr === a) return tokens[i]; return null; }
  function poolOf(a, b) { a = low(a); b = low(b); for (var i = 0; i < pools.length; i++) { var p = pools[i]; if ((p.t0.addr === a && p.t1.addr === b) || (p.t0.addr === b && p.t1.addr === a)) return p; } return null; }
  // 池子里 from→to 的储备（按方向排好）
  function reservesFor(p, from) { return p.t0.addr === low(from) ? [p.r0, p.r1] : [p.r1, p.r0]; }
  var liveAt = {};
  function refreshReserves(p) { // 报价前读一次链上最新储备（10 秒内不重复读）
    if (liveAt[p.pair] && Date.now() - liveAt[p.pair] < 10000) return Promise.resolve(p);
    return A.call(p.pair, SEL.getReserves).then(function (h) { p.r0 = word(h, 0); p.r1 = word(h, 1); liveAt[p.pair] = Date.now(); return p; }, function () { return p; });
  }
  // 路径：有直接池子就直连；没有就走报价币 AiLGNS 两跳
  function pathFor(from, to) {
    from = low(from); to = low(to); if (!from || !to || from === to) return null;
    if (poolOf(from, to)) return [from, to];
    var q = low(cfg.quote); if (from !== q && to !== q && poolOf(from, q) && poolOf(q, to)) return [from, q, to];
    return null;
  }
  // PancakeLibrary.getAmountOut 原公式：手续费 0.25%（9975 / 10000）
  function amountOut(amtIn, rIn, rOut) { if (amtIn <= 0n || rIn <= 0n || rOut <= 0n) return 0n; var w = amtIn * 9975n; return w * rOut / (rIn * 10000n + w); }
  function quote(path, amtIn) {
    var amts = [amtIn], impact = 0;
    for (var i = 0; i < path.length - 1; i++) {
      var p = poolOf(path[i], path[i + 1]); if (!p) return null;
      var rs = reservesFor(p, path[i]), out = amountOut(amts[i], rs[0], rs[1]);
      // 价格影响：扣掉手续费后，实际成交价比池子现价差多少
      var spot = Number(rs[1]) / Number(rs[0]), eff = Number(amts[i]) * 0.9975; if (eff > 0 && spot > 0) impact += 1 - (Number(out) / eff) / spot;
      amts.push(out);
    }
    return { amts: amts, out: amts[amts.length - 1], impact: impact };
  }

  // ---------- 页面 ----------
  function page(id) {
    rid = id;
    try { if (K() && K().M && K().M().chain !== "anubis") K().useMarket("ailgns"); } catch (e) { /* 钱包工具没就绪也不影响看页面 */ }
    A.app.innerHTML = '<section class="card"><p class="muted">⏳ 读取池子…</p></section>';
    load().then(function () { if (!A.isCurrent(rid)) return; render(); }, function () {
      if (!A.isCurrent(rid)) return; cfg = null; render();
    });
  }
  function hero(tag) {
    return '<section class="card lp-hero as-hero"><div class="lp-ht"><h2>🔁 aiswap 兑换池 <span class="lp-tag">' + tag + '</span></h2>' +
      '<p>本站自己的「自动兑换池」：DAI、AiLGNS 和以后发射的新币，<b>点一下马上成交</b>，不用等人接单。合约是 <b>PancakeSwap V2 原版，一行没改</b>，没有管理员，谁都动不了池子里的币。</p></div>' +
      '<div class="lp-kpi"><div><small>每笔手续费</small><b>0.25%</b><span>0.17% 归放币的人 · 0.08% 归平台</span></div><div><small>新币报价</small><b>AiLGNS</b><span>DAI 买新币自动两跳</span></div><div><small>你的币</small><b>自己管</b><span>只在你钱包和池子合约里</span></div></div></section>';
  }
  var RULES = '<section class="card lp-rules as-rules"><h2>📜 规则一页纸</h2><ol>' +
    '<li><b>兑换</b>：随行就市、马上成交；大单会有滑点，页面先算好「最少到手」，低于它交易自动失败、钱原路不动。小额急用选这里，大额不急去 <a href="#/otc">OTC 担保交易</a>（0 滑点、1%）。</li>' +
    '<li><b>手续费 0.25%</b>：0.17% 留在池子里归所有放币的人（LP），0.08% 归平台付服务器和开发。加 / 撤流动性不收费。</li>' +
    '<li><b>新币一律用 AiLGNS 报价</b>：新币池子都是「新币 / AiLGNS」，你拿 DAI 买会自动走 DAI → AiLGNS → 新币，一次确认。</li>' +
    '<li><b>做 LP 怎么赚</b>：你放 1,000 DAI + 等值 AiLGNS 占池子 10%，当天池子成交 5 万 DAI，LP 手续费 85 DAI 里你分 8.5。成交越多、份额越大赚越多。</li>' +
    '<li><b>做 LP 会亏吗？会（无常损失）</b>：哪个币涨了，池子就自动卖掉它一部分换成另一个币。放进去时 1 AiLGNS = 1 DAI 各放 1,000；AiLGNS 涨到 4 DAI 时不放池子值 5,000，放了池子撤出来约 4,000，少赚的 1,000 就是无常损失。来回波动越大少赚越多，涨回去就没了。手续费能补一部分。<b>适合两个币都愿意长期拿、想吃手续费的人；觉得某个币要大涨就别放池子。</b></li>' +
    '<li><b>不保本</b>：涨跌和无常损失自己承担，平台不参与盈亏、不做投资建议。新币谁都能发，平台不背书。</li>' +
    '<li><b>你的币平台碰不到</b>：撤流动性随时、不用申请。一切链上可查：<a href="#/scan">账本</a>。</li></ol></section>';
  function render() {
    if (!cfg || !cfg.ready) return soon();
    A.app.innerHTML = hero("试运行") +
      '<div class="seg as-seg"><button type="button" data-t="swap"' + (tab === "swap" ? ' class="on"' : "") + '>🔁 兑换</button><button type="button" data-t="liq"' + (tab === "liq" ? ' class="on"' : "") + '>💧 流动性</button><button type="button" data-t="pools"' + (tab === "pools" ? ' class="on"' : "") + '>🏊 池子</button></div>' +
      '<div id="as-body"></div>' + RULES;
    document.querySelectorAll(".as-seg button").forEach(function (b) { b.onclick = function () { tab = b.getAttribute("data-t"); render(); }; });
    (tab === "swap" ? renderSwap : tab === "liq" ? renderLiq : renderPools)();
    K().silentAccount().then(function () { account = K().account(); if (account) after(); });
  }
  // 地址没填：占位页（不报错）
  function soon() {
    A.app.innerHTML = hero("测试网部署中") +
      '<section class="card as-soon"><h2>🧪 合约部署中</h2>' +
      '<p>aiswap 用的是 PancakeSwap V2 原版合约（全球用了好几年、几千亿成交量验证过），我们一行不改地部署到 Anubis 链上，先彩排、再主网小额验收、验收通过才开放。</p>' +
      '<ol class="as-steps"><li class="done">✅ 方案、费率、报价币已定（2026-11-11）</li><li class="now">🧪 合约部署 + 小额验收中</li><li>⏳ 开放兑换 / 加撤流动性 / 池子列表</li><li>⏳ 发射台：持有 1 枚创世 .ailgns 域名才能发币</li></ol>' +
      '<p class="muted">开放时间会写进「☰ 更多 → 服务 → 更新日志」和收件箱。现在买卖 AiLGNS 请用 <a href="#/otc">OTC 担保交易</a>。</p></section>' + RULES;
  }
  function connBtn(id) { return '<button type="button" class="ghost" id="' + id + '">' + (account ? A.short(account) : "连接钱包") + "</button>"; }
  function after() { document.querySelectorAll(".as-conn").forEach(function (b) { b.textContent = A.short(account); }); if (tab === "swap") swapBal(); if (tab === "liq") myLiq(); }
  function bindConn(id) { var b = g(id); if (!b) return; b.classList.add("as-conn"); b.onclick = function () { K().connect().then(function (a) { account = a; after(); }, function (e) { A.errTip(K().niceError(e), b); }); }; }
  function tokSelect(id, val, exclude) {
    return '<select id="' + id + '">' + tokens.filter(function (t) { return t.addr !== low(exclude); }).map(function (t) { return '<option value="' + t.addr + '"' + (t.addr === low(val) ? " selected" : "") + ">" + esc(t.sym) + "</option>"; }).join("") + '<option value="_custom">其它代币（粘地址）…</option></select>';
  }
  // 「其它代币」：粘合约地址，读 symbol / decimals 加进列表
  function customTok(sel, done) {
    var a = prompt("粘贴代币合约地址（0x 开头 42 位）"); if (!a) { sel.value = sel.getAttribute("data-prev") || ""; return; }
    a = low(a.trim()); if (!A.isAddr(a)) { A.errTip("地址格式不对", sel); sel.value = sel.getAttribute("data-prev") || ""; return; }
    Promise.all([A.call(a, SEL.symbol), A.call(a, SEL.decimals)]).then(function (r) {
      var n = Number(word(r[0], 1)), hex = r[0].slice(2 + 128, 2 + 128 + n * 2), sym = ""; try { sym = decodeURIComponent(hex.replace(/(..)/g, "%$1")); } catch (e) { sym = a.slice(0, 6); }
      custom[a] = { sym: sym || a.slice(0, 8), addr: a, dec: Number(word(r[1], 0)) || 18 }; if (!tok(a)) tokens.push(custom[a]); done(a);
    }, function () { A.errTip("读不到这个代币，确认它在 Anubis 链上", sel); sel.value = sel.getAttribute("data-prev") || ""; });
  }
  function onTokChange(sel, set) { sel.setAttribute("data-prev", sel.value === "_custom" ? sel.getAttribute("data-prev") : sel.value); sel.onchange = function () { if (sel.value === "_custom") customTok(sel, set); else set(sel.value); }; }

  // ---------- 兑换 ----------
  function pick(not) { for (var i = 0; i < tokens.length; i++) if (tokens[i].addr !== low(not)) return tokens[i].addr; return ""; }
  function renderSwap() {
    var body = g("as-body"); if (!body) return;
    if (!tok(S.from)) S.from = pick(S.to); if (!tok(S.to)) S.to = pick(S.from);
    body.innerHTML = '<section class="card as-box"><div class="card-head"><h2>🔁 兑换</h2>' + connBtn("as-sc") + '</div>' +
      '<div class="as-row"><label>付出<span class="muted" id="as-bal-from"></span></label><div class="as-in">' + tokSelect("as-from", S.from, S.to) + '<input id="as-amt" inputmode="decimal" placeholder="0.0" value="' + esc(S.amt) + '"><button type="button" class="as-max" id="as-max">最大</button></div></div>' +
      '<div class="as-flip"><button type="button" id="as-flip" title="反向">⇅</button></div>' +
      '<div class="as-row"><label>得到<span class="muted" id="as-bal-to"></span></label><div class="as-in">' + tokSelect("as-to", S.to, S.from) + '<input id="as-out" readonly placeholder="0.0"></div></div>' +
      '<div class="as-detail" id="as-detail"></div>' +
      '<div class="as-slip">滑点 <span class="seg lp-seg">' + (cfg.slippage || [0.5, 1, 3]).map(function (s) { return '<button type="button" data-s="' + s + '"' + (s === slip ? ' class="on"' : "") + ">" + s + "%</button>"; }).join("") + '</span> <small class="muted">价格比报价差超过这个数，交易自动失败、钱不动</small></div>' +
      '<p class="muted nm-st" id="as-st"></p><button type="button" class="nm-go" id="as-go">兑换</button></section>';
    bindConn("as-sc");
    onTokChange(g("as-from"), function (v) { S.from = v; if (S.to === v) S.to = ""; renderSwap(); });
    onTokChange(g("as-to"), function (v) { S.to = v; if (S.from === v) S.from = ""; renderSwap(); });
    g("as-amt").oninput = function () { S.amt = this.value; quoteSwap(); };
    g("as-flip").onclick = function () { var t = S.from; S.from = S.to; S.to = t; S.amt = ""; renderSwap(); };
    g("as-max").onclick = function () { var t = tok(S.from); if (!bal[S.from] || !t) return; var v = bal[S.from]; if (low(S.from) === low(cfg.tokens[0].addr)) v = v > 10n ** 17n ? v - 10n ** 17n : 0n; /* DAI 留 0.1 当 Gas */ S.amt = (num(v, t.dec)).toString(); g("as-amt").value = S.amt; quoteSwap(); };
    document.querySelectorAll(".as-slip button").forEach(function (b) { b.onclick = function () { slip = Number(b.getAttribute("data-s")); document.querySelectorAll(".as-slip button").forEach(function (x) { x.classList.toggle("on", x === b); }); quoteSwap(); }; });
    g("as-go").onclick = doSwap;
    quoteSwap(); if (account) swapBal();
  }
  var bal = {};
  function swapBal() {
    if (!account) return;
    [S.from, S.to].forEach(function (a, i) { var t = tok(a); if (!t) return; K().balance(a, account).then(function (b) { bal[a] = b; var el = g(i ? "as-bal-to" : "as-bal-from"); if (el) el.textContent = " 余额 " + f(num(b, t.dec)); }, function () {}); });
  }
  var lastQ = null;
  function quoteSwap() {
    var out = g("as-out"), det = g("as-detail"); if (!out) return;
    var tf = tok(S.from), tt = tok(S.to); lastQ = null;
    if (!tf || !tt) { out.value = ""; det.innerHTML = ""; return; }
    var path = pathFor(S.from, S.to);
    if (!path) { out.value = ""; det.innerHTML = '<p class="nm-bad">这两个币之间还没有池子（也没法经 AiLGNS 中转）。去「流动性」开第一个池子，或者先换成 AiLGNS。</p>'; return; }
    var amtIn = toWei(S.amt, tf.dec);
    if (amtIn <= 0n) { out.value = ""; var p0 = poolOf(path[0], path[1]), rs0 = reservesFor(p0, path[0]); det.innerHTML = '<p class="muted">池子现价：1 ' + esc(tf.sym) + ' ≈ ' + f(Number(rs0[1]) / Math.pow(10, tok(path[1]).dec) / (Number(rs0[0]) / Math.pow(10, tf.dec))) + ' ' + esc(tok(path[1]).sym) + (path.length > 2 ? "（先换成 AiLGNS 再换目标币）" : "") + '</p>'; return; }
    Promise.all(path.slice(0, -1).map(function (a, i) { return refreshReserves(poolOf(a, path[i + 1])); })).then(function () {
      if (g("as-amt") && toWei(g("as-amt").value, tf.dec) !== amtIn) return; // 用户又改了
      var q = quote(path, amtIn); if (!q || q.out <= 0n) { out.value = ""; det.innerHTML = '<p class="nm-bad">池子太浅，换不出来</p>'; return; }
      var minOut = q.out * BigInt(Math.round((100 - slip) * 100)) / 10000n, price = num(q.out, tt.dec) / num(amtIn, tf.dec), fee = num(amtIn, tf.dec) * 0.0025;
      lastQ = { path: path, amtIn: amtIn, out: q.out, minOut: minOut };
      out.value = f(num(q.out, tt.dec));
      det.innerHTML = '<div><span>价格</span><b>1 ' + esc(tf.sym) + ' ≈ ' + f(price) + ' ' + esc(tt.sym) + '</b></div>' +
        '<div><span>最少到手</span><b>' + f(num(minOut, tt.dec)) + ' ' + esc(tt.sym) + '</b></div>' +
        '<div><span>价格影响</span><b class="' + (q.impact > 0.05 ? "nm-bad" : q.impact > 0.01 ? "as-warn" : "") + '">' + (q.impact * 100).toFixed(2) + '%' + (q.impact > 0.05 ? " · 池子浅，建议分几笔" : "") + '</b></div>' +
        '<div><span>手续费 0.25%</span><b>' + f(fee) + ' ' + esc(tf.sym) + '</b></div>' +
        '<div><span>路径</span><b>' + path.map(function (a) { return esc(tok(a).sym); }).join(" → ") + '</b></div>';
    });
  }
  function ensureAllowance(token, amount, say, name, spender) {
    return K().allowance(token, account, spender).then(function (al) { if (al >= amount) return; return K().send(token, SEL.approve + u256(spender) + u256(MAX_UINT), say, "授权 " + name + " 给兑换合约（只需一次）"); });
  }
  function encAddrArray(arr, offsetWords) { /* 动态数组：偏移在外面写，这里给 长度 + 元素 */ return u256(arr.length) + arr.map(addrWord).join(""); }
  function doSwap() {
    var go = g("as-go"), st = g("as-st"), say = function (t) { if (st) st.textContent = t; };
    var tf = tok(S.from), tt = tok(S.to); if (!tf || !tt) return A.errTip("先选两个币", go);
    if (!lastQ) return A.errTip("先填数量，等报价出来", go);
    var q = lastQ, R = cfg.contracts.router;
    go.disabled = true;
    K().ready().then(function () { account = K().account(); after(); return K().balance(S.from, account); })
      .then(function (b) { if (b < q.amtIn) throw new Error(tf.sym + " 不够：要 " + f(num(q.amtIn, tf.dec)) + "，你有 " + f(num(b, tf.dec))); return ensureAllowance(S.from, q.amtIn, say, tf.sym, R); })
      .then(function () {
        // swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, to, deadline)
        var data = SEL.swapFee + u256(q.amtIn) + u256(q.minOut) + u256(5 * 32) + addrWord(account) + u256(deadline()) + encAddrArray(q.path);
        return K().send(R, data, say, "兑换");
      })
      .then(function (rc) { go.disabled = false; st.innerHTML = "✅ 换好了，" + esc(tt.sym) + " 已到钱包。" + (rc && rc.transactionHash ? ' <a href="#/scan/' + rc.transactionHash + '">看账本</a>' : ""); S.amt = ""; g("as-amt").value = ""; liveAt = {}; load().then(function () { if (tab === "swap") renderSwap(); }); })
      .catch(function (e) { go.disabled = false; say(""); A.errTip(K().niceError(e), go); });
  }

  // ---------- 流动性 ----------
  function renderLiq() {
    var body = g("as-body"); if (!body) return;
    if (!tok(L.a)) L.a = pick(L.b); if (!tok(L.b)) L.b = pick(L.a);
    body.innerHTML = '<section class="card as-box"><div class="card-head"><h2>💧 加流动性</h2>' + connBtn("as-lc") + '</div>' +
      '<p class="muted">两种币按池子现价各放一半，拿到「份额凭证」；别人每兑换一次你分 0.17% 里的一份；随时全部撤出。</p>' +
      '<div class="as-row"><label>币 A<span class="muted" id="as-bal-a"></span></label><div class="as-in">' + tokSelect("as-ta", L.a, L.b) + '<input id="as-amta" inputmode="decimal" placeholder="0.0" value="' + esc(L.amtA) + '"></div></div>' +
      '<div class="as-row"><label>币 B<span class="muted" id="as-bal-b"></span></label><div class="as-in">' + tokSelect("as-tb", L.b, L.a) + '<input id="as-amtb" inputmode="decimal" placeholder="0.0" value="' + esc(L.amtB) + '"></div></div>' +
      '<div class="as-detail" id="as-ldetail"></div><p class="muted nm-st" id="as-lst"></p><button type="button" class="nm-go" id="as-lgo">加流动性</button>' +
      '<p class="muted lp-note">⚠️ 做 LP 有「无常损失」：哪个币涨了池子会自动卖掉它一部分。适合两个币都愿意长期拿的人，不保本。规则见页面底部。</p></section>' +
      '<section class="card"><div class="card-head"><h2>📒 我的份额</h2><span class="muted">撤出随时、不用申请</span></div><div id="as-mine"><p class="muted">连接钱包后显示你在每个池子里的份额</p></div></section>';
    bindConn("as-lc");
    onTokChange(g("as-ta"), function (v) { L.a = v; if (L.b === v) L.b = ""; L.amtA = L.amtB = ""; renderLiq(); });
    onTokChange(g("as-tb"), function (v) { L.b = v; if (L.a === v) L.a = ""; L.amtA = L.amtB = ""; renderLiq(); });
    g("as-amta").oninput = function () { L.amtA = this.value; liqCalc("a"); };
    g("as-amtb").oninput = function () { L.amtB = this.value; liqCalc("b"); };
    g("as-lgo").onclick = doAdd;
    liqCalc(); if (account) myLiq();
  }
  function liqCalc(which) {
    var ta = tok(L.a), tb = tok(L.b), det = g("as-ldetail"); if (!ta || !tb || !det) return;
    var p = poolOf(L.a, L.b);
    if (!p) { det.innerHTML = '<p class="as-warn">这个池子还没有人开：你放进去的两个数量之比就是<b>开盘价</b>，请按市价算好再放。第一笔会自动创建池子。</p>'; return; }
    var rs = reservesFor(p, L.a), rA = num(rs[0], ta.dec), rB = num(rs[1], tb.dec), price = rB / rA;
    if (which === "a" && L.amtA) { L.amtB = (Number(L.amtA) * price).toFixed(Math.min(6, tb.dec)); g("as-amtb").value = L.amtB; }
    if (which === "b" && L.amtB) { L.amtA = (Number(L.amtB) / price).toFixed(Math.min(6, ta.dec)); g("as-amta").value = L.amtA; }
    var a = Number(L.amtA) || 0, share = a > 0 ? a / (rA + a) : 0;
    det.innerHTML = '<div><span>池子现价</span><b>1 ' + esc(ta.sym) + ' = ' + f(price) + ' ' + esc(tb.sym) + '</b></div><div><span>池子里现有</span><b>' + f(rA, 2) + ' ' + esc(ta.sym) + ' + ' + f(rB, 2) + ' ' + esc(tb.sym) + '</b></div>' + (a > 0 ? '<div><span>放进去后你占</span><b>' + (share * 100).toFixed(3) + '%</b></div>' : "");
  }
  function doAdd() {
    var go = g("as-lgo"), st = g("as-lst"), say = function (t) { if (st) st.textContent = t; };
    var ta = tok(L.a), tb = tok(L.b); if (!ta || !tb) return A.errTip("先选两个币", go);
    var aA = toWei(L.amtA, ta.dec), aB = toWei(L.amtB, tb.dec); if (aA <= 0n || aB <= 0n) return A.errTip("两个数量都要填", go);
    var R = cfg.contracts.router, bps = BigInt(Math.round((100 - slip) * 100)), minA = aA * bps / 10000n, minB = aB * bps / 10000n;
    go.disabled = true;
    K().ready().then(function () { account = K().account(); after(); return Promise.all([K().balance(L.a, account), K().balance(L.b, account)]); })
      .then(function (b) {
        if (b[0] < aA) throw new Error(ta.sym + " 不够：要 " + f(num(aA, ta.dec)) + "，你有 " + f(num(b[0], ta.dec)));
        if (b[1] < aB) throw new Error(tb.sym + " 不够：要 " + f(num(aB, tb.dec)) + "，你有 " + f(num(b[1], tb.dec)));
        return ensureAllowance(L.a, aA, say, ta.sym, R);
      }).then(function () { return ensureAllowance(L.b, aB, say, tb.sym, R); })
      .then(function () {
        // addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline)
        var data = SEL.addLiq + addrWord(L.a) + addrWord(L.b) + u256(aA) + u256(aB) + u256(minA) + u256(minB) + addrWord(account) + u256(deadline());
        return K().send(R, data, say, "加流动性");
      })
      .then(function (rc) { go.disabled = false; st.innerHTML = "✅ 放进去了，份额凭证已到钱包。" + (rc && rc.transactionHash ? ' <a href="#/scan/' + rc.transactionHash + '">看账本</a>' : ""); L.amtA = L.amtB = ""; liveAt = {}; load().then(function () { if (tab === "liq") renderLiq(); }); })
      .catch(function (e) { go.disabled = false; say(""); A.errTip(K().niceError(e), go); });
  }
  function myLiq() {
    var el = g("as-mine"); if (!el || !account) return;
    if (!pools.length) { el.innerHTML = '<p class="muted">还没有池子。</p>'; return; }
    el.innerHTML = '<p class="muted">读取中…</p>';
    Promise.all(pools.map(function (p) { return K().balance(p.pair, account).then(function (b) { return { p: p, b: b }; }, function () { return { p: p, b: 0n }; }); })).then(function (rows) {
      rows = rows.filter(function (r) { return r.b > 0n; });
      if (!rows.length) { el.innerHTML = '<p class="muted">你还没有放币到任何池子。上面选两个币、填数量就能开始。</p>'; return; }
      el.innerHTML = rows.map(function (r, i) {
        var p = r.p, share = p.lp > 0n ? Number(r.b * 1000000n / p.lp) / 10000 : 0, a0 = p.lp > 0n ? num(p.r0 * r.b / p.lp, p.t0.dec) : 0, a1 = p.lp > 0n ? num(p.r1 * r.b / p.lp, p.t1.dec) : 0;
        return '<div class="as-pos" data-i="' + i + '"><div class="as-pos-h"><b>' + esc(p.t0.sym) + ' / ' + esc(p.t1.sym) + '</b><span>占池子 ' + share.toFixed(3) + '%</span></div>' +
          '<div class="muted">≈ ' + f(a0) + ' ' + esc(p.t0.sym) + ' + ' + f(a1) + ' ' + esc(p.t1.sym) + '</div>' +
          '<div class="as-pos-b"><span class="seg lp-seg"><button type="button" data-pc="25">撤 25%</button><button type="button" data-pc="50">撤 50%</button><button type="button" data-pc="100" class="on">全部撤出</button></span><p class="muted nm-st"></p></div></div>';
      }).join("");
      el.querySelectorAll(".as-pos").forEach(function (box) {
        var r = rows[Number(box.getAttribute("data-i"))];
        box.querySelectorAll("button").forEach(function (b) { b.onclick = function () { doRemove(r.p, r.b * BigInt(b.getAttribute("data-pc")) / 100n, box, b); }; });
      });
    });
  }
  function doRemove(p, liq, box, btn) {
    var st = box.querySelector(".nm-st"), say = function (t) { st.textContent = t; }, R = cfg.contracts.router;
    if (liq <= 0n) return;
    var bps = BigInt(Math.round((100 - slip) * 100)), min0 = p.lp > 0n ? p.r0 * liq / p.lp * bps / 10000n : 0n, min1 = p.lp > 0n ? p.r1 * liq / p.lp * bps / 10000n : 0n;
    btn.disabled = true;
    K().ready().then(function () { return ensureAllowance(p.pair, liq, say, "份额凭证", R); })
      .then(function () {
        // removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline)
        var data = SEL.removeLiq + addrWord(p.t0.addr) + addrWord(p.t1.addr) + u256(liq) + u256(min0) + u256(min1) + addrWord(account) + u256(deadline());
        return K().send(R, data, say, "撤流动性");
      })
      .then(function (rc) { btn.disabled = false; st.innerHTML = "✅ 两种币已回到钱包。" + (rc && rc.transactionHash ? ' <a href="#/scan/' + rc.transactionHash + '">看账本</a>' : ""); liveAt = {}; load().then(function () { if (tab === "liq") myLiq(); }); })
      .catch(function (e) { btn.disabled = false; say(""); A.errTip(K().niceError(e), btn); });
  }

  // ---------- 池子列表 ----------
  function renderPools() {
    var body = g("as-body"); if (!body) return;
    if (!pools.length) { body.innerHTML = '<section class="card"><h2>🏊 池子</h2><p class="muted">还没有池子。第一个去「流动性」放币的人就是开池人。</p></section>'; return; }
    var dai = low(cfg.tokens[0].addr), q = low(cfg.quote);
    body.innerHTML = '<section class="card"><div class="card-head"><h2>🏊 池子</h2><span class="muted">手续费都是 0.25%</span></div><table class="as-pools"><thead><tr><th>池子</th><th>价格</th><th>池子里有</th><th>24h 成交</th><th></th></tr></thead><tbody>' +
      pools.map(function (p, i) {
        // 价格：有 DAI 按 DAI 标，否则按 AiLGNS 标
        var base = p.t1.addr === dai || (p.t1.addr === q && p.t0.addr !== dai) ? 1 : 0, other = 1 - base;
        var rb = base ? p.res1 : p.res0, ro = base ? p.res0 : p.res1, tb = base ? p.t1 : p.t0, to = base ? p.t0 : p.t1, vol = base ? p.vol1 : p.vol0;
        return '<tr><td data-l="池子"><b>' + esc(p.t0.sym) + ' / ' + esc(p.t1.sym) + '</b></td><td data-l="价格">1 ' + esc(to.sym) + ' = ' + f(ro > 0 ? rb / ro : 0) + ' ' + esc(tb.sym) + '</td>' +
          '<td data-l="池子里有">' + f(p.res0, 2) + ' ' + esc(p.t0.sym) + '<br>' + f(p.res1, 2) + ' ' + esc(p.t1.sym) + '</td><td data-l="24h 成交">' + f(vol, 2) + ' ' + esc(tb.sym) + '<br><small class="muted">' + p.swaps + ' 笔</small></td>' +
          '<td><button type="button" class="ghost as-trade" data-i="' + i + '">去兑换</button></td></tr>';
      }).join("") + '</tbody></table><p class="muted" style="margin-top:8px">池子地址可在 <a href="#/scan">账本</a> 里查；数据每分钟更新一次。</p></section>';
    body.querySelectorAll(".as-trade").forEach(function (b) { b.onclick = function () { var p = pools[Number(b.getAttribute("data-i"))]; S.from = p.t1.addr === dai || p.t1.addr === q ? p.t1.addr : p.t0.addr; S.to = S.from === p.t0.addr ? p.t1.addr : p.t0.addr; S.amt = ""; tab = "swap"; render(); }; });
  }

  A.pages.aiswap = page;
})();
