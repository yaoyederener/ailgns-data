// 💧 做市商页 #/lp（2026-11-06 建，2026-11-09 晚返佣取消改称号制）：规则一页纸 · 我的做市 · 批量挂单 · 做市榜。撮合还是 OTC 合约，这里只是帮客户算账 + 一键下两张限价单
(function () {
  "use strict";
  var A = window.AIL, K = function () { return A.otcKit; };
  var SEL = { create: "0x9128a740", approve: "0x095ea7b3" }, MAX_UINT = (1n << 256n) - 1n;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function f(v, d) { return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }); }
  function toWei(s, d) { s = String(s || "0").trim(); if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return 0n; var p = s.split("."), a = p[0] || "0", b = (p[1] || "").slice(0, d).padEnd(d, "0"); return BigInt(a) * 10n ** BigInt(d) + BigInt(b || "0"); }
  var account = null, rid = 0, mkt = 0, M, OTC, TOKEN, DAI, TD, SYM, PD = 2, MK = "ailgns", R = { FEE: 0.01, SHARE: 0.7 };
  function lpq(extra) { return "/api/lp?mk=" + MK + (extra || ""); } // 站长 2026-11-10：LGNS 也开做市，接口按市场取盘口缺口

  // 站长 2026-11-06：先不开放给客户，优化好再说。默认显示「待开放」页；内部测试在浏览器控制台 localStorage.lpdev="1" 后可看完整页
  function soon(id) {
    A.app.innerHTML = '<section class="card lp-hero lp-soon"><div class="lp-ht"><h2>💧 做市返佣 <span class="lp-tag">即将开放</span></h2>' +
      '<p>在本站 OTC 挂单，有人吃你的单，吃单方付的 1% 手续费按比例返给你。<b>按你挂在盘口的资金量分档</b>：日均挂单 ≥ 1 万 DAI 返 <b>50%</b>，≥ 3 万返 <b>60%</b>，≥ 5 万返 <b>70%</b>（返的是吃你单的人付的 1% 手续费），每天自动结算到你钱包。挂单即参与，不用报名，资金全程在你自己的钱包和 OTC 合约里。</p>' +
      '<p class="muted">正在做最后的打磨和安全测试，开放时间会在「☰ 更多 → 服务 → 更新日志」和收件箱通知。现在在 OTC 正常挂单不受影响。</p></div>' +
      '<div class="lp-kpi"><div><small>返佣比例</small><b>50–70%</b><span>1 万 / 3 万 / 5 万三档</span></div><div><small>结算</small><b>每天</b><span>北京时间 0 点后结算前一天</span></div><div><small>资金</small><b>全程自管</b><span>随时撤单，不托管</span></div></div>' +
      '<p style="margin-top:14px"><a class="nm-go" href="#/trade">先去交易所盘口挂单 →</a></p></section>';
  }
  function page(id) {
    rid = id;
    var hp = location.hash.split("/"); MK = hp[2] === "lgns" ? "lgns" : "ailgns"; // #/lp = AiLGNS，#/lp/lgns = LGNS（Anubis）；别的币种先不开
    K().useMarket(MK); M = K().M();
    OTC = M.otc; TOKEN = M.token; DAI = M.dai; TD = M.dec; SYM = M.sym; PD = M.pd || 2; mkt = 0; midTouched = false; side = { side: "both" }; data = null;
    // 站长 2026-11-10：试运行对所有人开放——做市工具可用、按新规则记账；首次发放时间另行公告
    A.app.innerHTML =
      '<section class="card lp-hero"><div class="lp-ht"><h2>💧 做市商 <span class="lp-tag">✅ 认证称号</span></h2>' +
        '<div class="lp-mkt"><a href="#/lp"' + (MK === "ailgns" ? ' class="on"' : "") + '>AiLGNS</a><a href="#/lp/lgns"' + (MK === "lgns" ? ' class="on"' : "") + '>LGNS <small>Anubis 链</small></a></div>' +
        '<p>把资金拆成多张限价单铺在本站 ' + SYM + '/DAI 盘口，就是做市。<b>日均挂单资金 ≥ 1 万 DAI，自动获得「👑 官方认证做市商」称号</b>，全站你的名字后面都会挂这个绿标，客户一眼认得你。' +
        '做市不发返佣，赚的是<b>买卖价差</b>；吃单的人照常付 1% 手续费。</p>' +
        '<div class="lp-side" id="lp-side">正在看盘口哪边缺…</div></div>' +
        '<div class="lp-kpi"><div><small>称号门槛</small><b>日均 1 万 DAI</b><span>买单 + 卖单按 DAI 折算，每 5 分钟采样</span></div><div><small>称号有效</small><b>当天 + 次日</b><span>掉下去隔天自动摘，重新挂满再给</span></div><div><small>资金</small><b>全程自管</b><span>你的币只在 OTC 合约里，随时撤单</span></div></div></section>' +
      '<section class="card"><div class="card-head"><h2>📒 我的做市</h2><button type="button" class="ghost" id="lp-conn">连接钱包</button></div><div id="lp-me"><p class="muted">连接钱包后显示今天的日均挂单资金、称号状态和成交</p></div></section>' +
      // ⚡ 一键做市（老板 2026-11-09 晚：太复杂没人看得懂）：只填一个金额；方向 / 中间价 / 档数 / 价差全自动，高级设置折叠
      '<section class="card lp-mk"><div class="card-head"><h2>⚡ 一键做市</h2><span class="muted">填一个金额就行</span></div>' +
        '<p class="muted">你出多少钱，网站帮你拆成几张小单铺在盘口<b>缺的那一边</b>；哪张被吃哪张赚价差，没被吃的随时撤。钱始终在你钱包和 OTC 合约里，网站碰不到。</p>' +
        '<div class="lp-one"><label>我要投入（DAI）<input id="lp-amt" inputmode="decimal" value="1000"></label><div class="lp-one-sum" id="lp-sum">正在算…</div></div>' +
        '<button type="button" class="nm-go lp-gobig" id="lp-go">⚡ 一键做市</button><div class="lp-cnt" id="lp-cnt" hidden></div><p class="muted nm-st" id="lp-st"></p>' +
        '<details class="lp-adv"><summary>高级设置（一般不用动）</summary>' +
        '<div class="lp-grid"><label>铺哪边<select id="lp-which"><option value="auto">自动：只铺缺的一边</option><option value="both">双边都铺</option><option value="buy">只铺买单（压 DAI）</option><option value="sell">只铺卖单（压 ' + SYM + '）</option></select></label>' +
        '<label>中间价 (DAI)<input id="lp-mid" inputmode="decimal"><small class="muted" id="lp-hint"></small></label>' +
        '<label>拆几档<select id="lp-n"><option>2</option><option>3</option><option selected>5</option><option>8</option><option>10</option></select></label>' +
        '<label>第 1 档价差 (%)<input id="lp-sp" inputmode="decimal" value="0.5"></label><label>每档再加 (%)<input id="lp-step" inputmode="decimal" value="0.3"></label>' +
        '<label>有效期<select id="lp-dur">' + K().DURATIONS.map(function (d) { return '<option value="' + d[0] + '"' + (d[0] === 30 * 86400 ? " selected" : "") + ">" + d[1] + "</option>"; }).join("") + "</select></label></div>" +
        '<div class="lp-prev" id="lp-prev"></div></details>' +
        '<p class="muted lp-note">⚠️ 做市有价格风险：币价单边大涨大跌时，一边的单会被吃光、另一边留着。小额、价差别太窄、勤看。这不是理财，也不保本。</p></section>' +
      '<details class="card lp-calc"><summary><h2 style="display:inline">🧮 价差收益估算</h2> <span class="muted">估算，不是承诺 · 点开</span></summary>' +
        '<div class="lp-grid"><label>日均挂单资金 (DAI)<input id="lc-liq" inputmode="decimal" value="10000"></label><label>每天换手 (%)<input id="lc-turn" inputmode="decimal" value="20"></label><label>平均价差 (%)<input id="lc-sp" inputmode="decimal" value="1"></label></div>' +
        '<div class="lp-prev" id="lc-out"></div>' +
        '<p class="muted">换手 = 一天里被吃掉的金额 ÷ 挂着的金额。价差收益按一买一卖配对成交算；单边行情时价差收益可能是负的。</p></details>' +
      '<section class="card"><div class="card-head"><h2>🏆 做市榜</h2><span class="seg lp-seg"><button type="button" class="on" data-r="today">今天</button><button type="button" data-r="week">7 天</button></span></div><div id="lp-board"><p class="muted">读取中…</p></div></section>' +
      '<section class="card lp-rules"><h2>📜 规则（一页纸）</h2><ol>' +
        '<li>范围：本站 <b>AiLGNS / DAI</b> OTC 市场的挂单（限价单）。</li>' +
        '<li>称号：按你当天挂在盘口的资金量（买单 + 卖单，按 DAI 折算，每 5 分钟采样取日均）算，<b>日均 ≥ 1 万 DAI 自动获得「👑 官方认证做市商」</b>，全站名字后显示；当天或昨天达标就有，掉下去隔天自动摘。</li>' +
        '<li>不发返佣：做市赚的是买卖价差，平台不另外给钱；吃单方照常付 1% 手续费。</li>' +
        '<li>缺哪边挂哪边：页面顶部实时显示盘口现在缺买单还是缺卖单，「批量挂单」默认就铺缺的那边，大家一起把买卖铺平。</li>' +
        '<li>不改合约、不碰你的币、不保本：挂单、撤单、成交全在原 OTC 合约里，和平时一样。</li>' +
        '<li>一视同仁：平台不审查交易双方是谁；称号只看挂单资金，不看是谁。规则如有调整会提前在更新日志公示。</li></ol></section>';
    bind();
    load();
    K().silentAccount().then(function () { account = K().account(); if (account) after(); });
  }
  function bind() {
    document.getElementById("lp-conn").onclick = function () { K().connect().then(function (a) { account = a; after(); }, function (e) { A.errTip(K().niceError(e), document.getElementById("lp-conn")); }); };
    ["lp-mid", "lp-sp", "lp-amt", "lp-step"].forEach(function (i) { document.getElementById(i).oninput = preview; });
    document.getElementById("lp-mid").addEventListener("input", function () { midTouched = true; });
    ["lp-which", "lp-n"].forEach(function (i) { document.getElementById(i).onchange = preview; });
    ["lc-liq", "lc-turn", "lc-sp"].forEach(function (i) { document.getElementById(i).oninput = calc; });
    document.querySelectorAll(".lp-seg button").forEach(function (b) { b.onclick = function () { document.querySelectorAll(".lp-seg button").forEach(function (x) { x.classList.toggle("on", x === b); }); board(b.getAttribute("data-r")); }; });
    document.getElementById("lp-go").onclick = place;
    calc();
  }
  var data = null, side = { side: "both" }, midTouched = false; // midTouched：客户自己改过中间价就不再自动覆盖
  function load() {
    fetch("/api/book?m=" + MK).then(function (r) { return r.json(); }).then(function (j) {
      if (j.reserves) { var w = j.reserves.slice(2).match(/.{64}/g); mkt = (Number(BigInt("0x" + w[1])) / 1e18) / (Number(BigInt("0x" + w[0])) / Math.pow(10, TD)); }
      var mi = document.getElementById("lp-mid"); if (mi && !mi.value && !midTouched && mkt && !(side && side.mid)) { mi.value = mkt.toFixed(PD); preview(); } // 没有 OTC 中间价时才用 DEX 价兜底
      hint();
    }).catch(function () {});
    return fetch(lpq(account ? "&a=" + account : "")).then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      data = j; if (j.rules) R = j.rules; if (j.side) side = j.side;
      // 默认中间价用 OTC 自己的买一卖一中间价（DEX 价常高 3% 以上，照它铺买单会被人立刻高价卖给你）
      var mi = document.getElementById("lp-mid"); if (mi && !midTouched && side.mid) mi.value = side.mid.toFixed(PD);
      hint(); sideLine(); sidePoll(); board("today"); if (j.me) me(j.me); preview();
    }).catch(function () { var s = document.getElementById("lp-side"); if (s) s.textContent = "盘口供需暂时读不到，一键做市按双边铺。"; });
  }
  function hint() { var el = document.getElementById("lp-hint"); if (!el) return; el.textContent = (side.mid ? "OTC 盘口中间价 " + f(side.mid, PD) : "") + (mkt ? (side.mid ? " · " : "") + "DEX 现价 " + f(mkt, PD) : ""); }
  // 顶部大字：现在缺哪边、做市商优先挂哪边
  // 站长 2026-11-09：高亮大字明确告诉做市商「现在要挂哪边」，每 30 秒自动刷新（接口 45 秒内按最新盘口现算）
  function sideLine() {
    var el = document.getElementById("lp-side"); if (!el) return;
    var tot = (side.bd || 0) + (side.ad || 0), bp = tot ? Math.round(side.bd / tot * 100) : 50, sp = 100 - bp;
    var big = side.side === "sell" ? "卖单" : side.side === "buy" ? "买单" : "买单、卖单都行";
    var why = side.side === "sell" ? "盘口买单多、缺卖单 → 做市商请<b>优先挂卖单</b>，把盘口铺平" :
      side.side === "buy" ? "盘口卖单多、缺买单 → 做市商请<b>优先挂买单</b>，把盘口铺平" : "盘口买卖基本平衡 → 两边都可以挂";
    el.className = "lp-side lp-side-big " + side.side;
    el.innerHTML = '<div class="lp-sb-k">👉 现在要挂</div><div class="lp-sb-v">' + big + '</div><div class="lp-sb-w">' + why + '</div>' +
      '<div class="lp-sb-bar"><i style="width:' + bp + '%"></i><span>买 ' + bp + '%</span><span>卖 ' + sp + '%</span></div>' +
      '<small>' + (side.at ? new Date(side.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) + " 盘口 · " : "") + '每 30 秒自动更新，以成交那一刻为准</small>';
  }
  var sideTimer = 0;
  function sidePoll() {
    clearInterval(sideTimer);
    sideTimer = setInterval(function () {
      if (!A.isCurrent(rid)) return clearInterval(sideTimer);
      if (document.hidden) return;
      fetch(lpq()).then(function (r) { return r.json(); }).then(function (j) { if (A.isCurrent(rid) && j && j.side) { side = j.side; sideLine(); var n = document.querySelector(".lp-need"); if (n) n.innerHTML = needText(); } }).catch(function () {});
    }, 30000);
  }
  function needText() {
    return (side.side === "sell" ? "👉 现在盘口<b>缺卖单</b>：请优先挂<b>卖单</b>。" :
      side.side === "buy" ? "👉 现在盘口<b>缺买单</b>：请优先挂<b>买单</b>。" :
      "👉 现在盘口买卖差不多：两边都可以挂。") + ' <span class="muted">下面「批量挂单」默认就铺缺的这边。</span>';
  }
  function after() { var c = document.getElementById("lp-conn"); if (c) c.textContent = A.short(account); load(); }
  function me(m) {
    var el = document.getElementById("lp-me"); if (!el) return;
    var t = m.today || {}, lq = m.liq || { avg: 0 }, ti = m.title || { on: false, avg: lq.avg || 0, need: 10000 };
    el.innerHTML = '<div class="lp-kpi lp-me"><div><small>称号</small><b>' + (ti.on ? "👑 官方认证做市商" : "还没有") + '</b><span>' + (ti.on ? (ti.official ? "官方名单" : "日均挂单达标") : "再挂 " + f(Math.max(0, ti.need - (ti.avg || 0)), 0) + " DAI 到 1 万") + '</span></div>' +
      '<div><small>今天日均挂单</small><b>' + f(ti.avg || lq.avg || 0, 0) + ' DAI</b><span>门槛 ' + f(ti.need || 10000, 0) + ' DAI · 每 5 分钟采样</span></div>' +
      '<div><small>今天成交</small><b>' + f(t.dai || 0, 0) + ' DAI</b><span>' + (t.n || 0) + ' 笔 · 赚的是价差，不发返佣</span></div></div>' +
      '<p class="lp-need">' + needText() + '</p>' +
      (m.days.length ? '<div class="lg-list">' + m.days.map(function (d) { return '<div class="lg-row"><span class="lg-ico">📅</span><div class="lg-main"><div class="lg-txt">' + d.d + '：成交 ' + f(d.x.dai, 2) + ' DAI · ' + d.x.n + ' 笔 · 日均挂单 ' + f(d.x.liq || 0, 0) + ' DAI' + ((d.x.liq || 0) >= 10000 ? ' · ✅' : "") + '</div></div></div>'; }).join("") + "</div>" : "");
  }
  function board(r) {
    var el = document.getElementById("lp-board"); if (!el || !data) return;
    var list = (data.board && data.board[r]) || [];
    var SHOW = 5; // 站长 2026-11-10：榜单默认只露前 5，其余折叠
    el.innerHTML = list.length ? list.map(function (x, i) { return '<div class="lg-row' + (i >= SHOW ? " lg-x" : "") + '"><span class="lg-ico">' + (i < 3 ? ["🥇", "🥈", "🥉"][i] : "#" + (i + 1)) + '</span><div class="lg-main"><div class="lg-txt"><a href="#/scan/' + x.a + '" data-a="' + x.a + '" class="mono">' + A.short(x.a) + '</a> · 挂单成交 <b>' + f(x.dai || 0, 0) + ' DAI</b> · ' + x.n + ' 笔</div></div></div>'; }).join("") + (list.length > SHOW ? '<button type="button" class="ghost lg-more" data-more>展开全部 ' + list.length + ' 名 ▾</button>' : "") : '<p class="muted">还没有人上榜，第一个挂单的人就是第一名。</p>';
    var mb = el.querySelector("[data-more]");
    if (mb) mb.onclick = function () { el.classList.add("lg-open"); mb.remove(); };
    if (A.fillNames) A.fillNames(el);
  }
  function params() {
    var g = function (i) { return document.getElementById(i); };
    var which = g("lp-which").value; if (which === "auto") which = side.side === "sell" ? "sell" : side.side === "buy" ? "buy" : "both";
    return { which: which, mid: Number(g("lp-mid").value) || 0, amt: Number(g("lp-amt").value) || 0, n: Number(g("lp-n").value) || 5, sp: Number(g("lp-sp").value) || 0, step: Number(g("lp-step").value) || 0, dur: Number(g("lp-dur").value) };
  }
  // 价格阶梯：买单往下铺、卖单往上铺；每档金额 = 总资金 ÷ 边数 ÷ 档数
  function ladder(p) {
    var sides = p.which === "both" ? ["buy", "sell"] : [p.which], per = p.amt / sides.length / p.n, rows = [];
    sides.forEach(function (sd) { for (var i = 0; i < p.n; i++) { var off = (p.sp + i * p.step) / 100, px = sd === "buy" ? p.mid * (1 - off) : p.mid * (1 + off); rows.push({ side: sd, px: px, dai: per, coin: per / px }); } });
    return rows;
  }
  function preview() {
    var p = params(), el = document.getElementById("lp-prev"), sum = document.getElementById("lp-sum"); if (!el) return;
    if (!p.mid || !p.amt || !p.sp) { el.innerHTML = ""; if (sum) sum.textContent = !p.amt ? "先填金额" : "正在读盘口价格…"; return; }
    if (sum) { // 一键做市的大白话总结（站长 2026-11-09 晚）
      var rs = ladder(p), lo = Math.min.apply(null, rs.map(function (r) { return r.px; })), hi = Math.max.apply(null, rs.map(function (r) { return r.px; }));
      var what = p.which === "buy" ? "买单（压 DAI，等人卖给你）" : p.which === "sell" ? "卖单（压 " + SYM + "，等人来买）" : "买单 + 卖单";
      sum.innerHTML = "将铺 <b>" + rs.length + " 张" + what + "</b>，每张约 <b>" + f(rs[0].dai, 0) + " DAI</b>，价格 <b>" + f(lo, PD) + " ～ " + f(hi, PD) + "</b>（盘口中间价 " + f(p.mid, PD) + "）· 有效 " + (K().DURATIONS.filter(function (d) { return d[0] === p.dur; })[0] || ["", "30 天"])[1] +
        (rs[0].dai < 50 ? ' · <b class="nm-bad">每张最少 50 DAI，请加大金额</b>' : "");
    }
    var rows = ladder(p), per = rows[0].dai, buyDai = rows.filter(function (r) { return r.side === "buy"; }).reduce(function (s, r) { return s + r.dai; }, 0), sellCoin = rows.filter(function (r) { return r.side === "sell"; }).reduce(function (s, r) { return s + r.coin; }, 0);
    el.innerHTML = '<table class="lp-ladder"><thead><tr><th>方向</th><th>价格</th><th>金额</th><th>数量</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr class="' + r.side + '"><td>' + (r.side === "buy" ? "买" : "卖") + '</td><td>' + f(r.px, PD) + '</td><td>' + f(r.dai, 0) + ' DAI</td><td>' + f(r.coin, 4) + ' ' + SYM + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<p class="muted">共 ' + rows.length + ' 张单，每张 ' + f(per, 0) + ' DAI' + (buyDai ? "；买单要压 <b>" + f(buyDai, 0) + " DAI</b>" : "") + (sellCoin ? "；卖单要压 <b>" + f(sellCoin, 4) + " " + SYM + "</b>" : "") +
      (per < 50 ? ' · <b class="nm-bad">每张最少 50 DAI，请加大资金或减少档数</b>' : "") + (p.sp < 0.3 ? ' · <b class="nm-bad">第 1 档价差太窄，容易被单边吃光</b>' : "") +
      (p.which !== "both" && document.getElementById("lp-which").value === "auto" ? ' · 按供需现在只铺<b>' + (p.which === "buy" ? "买单" : "卖单") + "</b>" : "") + "</p>";
  }
  // 🧮 价差收益估算：日成交 = 资金 × 换手；价差收益 ≈ 日成交 ÷ 2 × 价差（返佣已取消，不再算）
  function calc() {
    var liq = Number(document.getElementById("lc-liq").value) || 0, turn = (Number(document.getElementById("lc-turn").value) || 0) / 100, sp = (Number(document.getElementById("lc-sp").value) || 0) / 100, el = document.getElementById("lc-out"); if (!el) return;
    var vol = liq * turn, spread = vol / 2 * sp;
    el.innerHTML = '<div class="lp-kpi"><div><small>称号</small><b>' + (liq >= 10000 ? "👑 官方认证做市商" : "未到 1 万") + '</b><span>' + (liq >= 10000 ? "日均挂单达标" : "挂到 1 万 DAI 才有称号") + '</span></div><div><small>日成交</small><b>' + f(vol, 0) + ' DAI</b><span>资金 × 换手</span></div><div><small>每天价差收益（估）</small><b>' + f(spread, 2) + ' DAI</b><span>日成交 ÷ 2 × 价差 · 单边行情可能为负</span></div></div>';
  }
  function ensureAllowance(token, amount, say, name, onTx) {
    return K().allowance(token, account, OTC).then(function (al) { if (al >= amount) return; if (onTx) onTx(); return K().send(token, SEL.approve + u256(OTC) + u256(MAX_UINT), say, "授权 " + name + " 给托管合约（只需一次）"); });
  }
  function needApprove(token, amount) { return amount > 0n ? K().allowance(token, account, OTC).then(function (al) { return al >= amount ? 0 : 1; }, function () { return 1; }) : Promise.resolve(0); }
  // 钱包支持 EIP-5792 就一次确认发一串；不支持就一张一张确认
  function sendCalls(calls, say) {
    var eth = null; try { eth = A.wallet.get(); } catch (e) { eth = null; } /* 用客户连上的那个钱包问，不用 window.ethereum（手机上可能是另一个钱包，或者根本没有） */
    if (!eth || !eth.request) return Promise.resolve(false);
    var chainId = "0x" + (6714).toString(16);
    return eth.request({ method: "wallet_getCapabilities", params: [account] }).then(function (cap) {
      var c = cap && (cap[chainId] || cap["6714"] || cap[6714]); if (!c || !(c.atomicBatch && c.atomicBatch.supported) && !c.atomic) return false;
      say("钱包支持一次确认发 " + calls.length + " 笔，请在钱包确认一次");
      return eth.request({ method: "wallet_sendCalls", params: [{ version: "1.0", chainId: chainId, from: account, calls: calls.map(function (x) { return { to: x.to, data: x.data, value: "0x0" }; }) }] }).then(function (id) {
        var bid = typeof id === "string" ? id : (id && id.id);
        say("已提交，等待链上确认…");
        return new Promise(function (ok, no) { var n = 0; (function poll() { eth.request({ method: "wallet_getCallsStatus", params: [bid] }).then(function (st) { var s = st && (st.status || st.state); if (s === 200 || s === "CONFIRMED" || s === "success") return ok(true); if (s >= 400 || s === "FAILED" || s === "failure") return no(new Error("钱包批量发送失败")); if (++n > 60) return no(new Error("等待确认超时，请到「查我的订单」看是否已挂上")); setTimeout(poll, 2000); }, no); })(); });
      });
    }, function () { return false; });
  }
  function place() {
    var p = params(), go = document.getElementById("lp-go"), st = document.getElementById("lp-st"), say = function (t) { st.textContent = t; };
    var ce = document.getElementById("lp-cnt"), appr = 0, total = 0, step = 0, at = "连接钱包"; /* at：做到哪一步了，报错说不清原因时告诉客户卡在哪 */
    function cnt(h) { if (!ce) return; ce.hidden = false; ce.innerHTML = h; }
    if (!p.mid || !p.amt || !p.sp) return A.errTip("先填中间价、总资金、价差", go);
    var rows = ladder(p);
    if (rows[0].dai < 50) return A.errTip("每张最少 50 DAI，请加大资金或减少档数", go);
    var buyDai = 0n, sellCoin = 0n, calls = [];
    rows.forEach(function (r) {
      if (r.side === "buy") { var d = toWei(r.dai.toFixed(6), 18), c = toWei((r.dai / r.px).toFixed(6), TD); buyDai += d; calls.push({ to: OTC, data: SEL.create + u256(0) + u256(d) + u256(c) + u256(p.dur), tag: "买单 " + f(r.px, PD) }); }
      else { var c2 = toWei((r.dai / r.px).toFixed(6), TD), d2 = toWei((Number(c2) / Math.pow(10, TD) * r.px).toFixed(6), 18); sellCoin += c2; calls.push({ to: OTC, data: SEL.create + u256(1) + u256(c2) + u256(d2) + u256(p.dur), tag: "卖单 " + f(r.px, PD) }); }
    });
    go.disabled = true;
    K().ready().then(function () {
      account = K().account(); after(); at = "读钱包余额";
      return Promise.all([K().balance(DAI, account), K().balance(TOKEN, account)]);
    }).then(function (b) {
      if (b[0] < buyDai) throw new Error("DAI 不够：买单要压 " + f(Number(buyDai) / 1e18, 0) + " DAI，你有 " + f(Number(b[0]) / 1e18));
      if (b[1] < sellCoin) throw new Error(SYM + " 不够：卖单要压 " + f(Number(sellCoin) / Math.pow(10, TD), 4) + " " + SYM + "，你有 " + f(Number(b[1]) / Math.pow(10, TD), 4));
      at = "查授权额度";
      return Promise.all([needApprove(DAI, buyDai), needApprove(TOKEN, sellCoin)]);
    }).then(function (na) { at = "授权";
      // 站长 2026-11-10：大字告诉客户钱包要点几次确认（授权几次 + 挂单几张），过程中显示到第几次
      appr = na[0] + na[1]; total = appr + calls.length; step = 0;
      cnt("👉 钱包会弹 <b>" + total + "</b> 次确认" + (appr ? "（授权 " + appr + " 次 + 挂单 " + calls.length + " 张）" : "（挂单 " + calls.length + " 张）") + "，每次点「确认」就行");
      return buyDai > 0n ? ensureAllowance(DAI, buyDai, say, "DAI", function () { cnt("第 <b>" + (++step) + " / " + total + "</b> 次：授权 DAI，请在钱包点确认"); }) : null;
    }).then(function () { return sellCoin > 0n ? ensureAllowance(TOKEN, sellCoin, say, SYM, function () { cnt("第 <b>" + (++step) + " / " + total + "</b> 次：授权 " + SYM + "，请在钱包点确认"); }) : null; })
      .then(function () { at = "问钱包能不能一次发 " + calls.length + " 笔"; return sendCalls(calls, function (t) { at = "钱包一次确认发 " + calls.length + " 笔"; say(t); if (/一次确认/.test(t)) { total = step + 1; cnt("钱包支持批量：剩下 " + calls.length + " 张单只要再点 <b>1</b> 次确认（第 " + (step + 1) + " / " + total + " 次）"); } }); })
      .then(function (batched) {
        if (batched) return;
        say("钱包不支持批量，一张一张确认（共 " + calls.length + " 张）");
        return calls.reduce(function (pr, c, i) { return pr.then(function () { at = "挂第 " + (i + 1) + " 张（" + c.tag + "）"; cnt("第 <b>" + (++step) + " / " + total + "</b> 次：挂第 " + (i + 1) + " 张（" + c.tag + "），请在钱包点确认"); return K().send(OTC, c.data, say, "第 " + (i + 1) + "/" + calls.length + " 张：" + c.tag); }); }, Promise.resolve());
      })
      .then(function () { cnt("✅ " + total + " 次确认全部完成"); go.disabled = false; say("✅ " + calls.length + " 张单都挂上了。挂满日均 1 万 DAI 自动获得「👑 官方认证做市商」称号，页面「我的做市」可查。"); if (A.just) A.just.set("otc", MK); setTimeout(load, 2000); })
      .catch(function (e) {
        go.disabled = false; say(""); if (ce) ce.hidden = true;
        var t = K().niceError(e);
        if (/^操作没完成/.test(t)) t = "钱包没说原因就停了，卡在「" + at + "」这一步。已经挂上的单在「查我的订单」里能看到，不会重复扣；请截这张图发给客服，或换一个钱包 App 再试。";
        A.errTip(t, go);
      });
  }
  A.pages.lp = page;
})();
