// 🔮 AiLGNS 每日预言家（#/oracle）：猜今晚 AiLGNS 价格，晚上 9–10 点随机一刻的链上价格开奖（规则见 lib/oracle.js）
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var PAIR = "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0", SCAN = "https://anubisscan.io/";
  var SRC = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", KEEPER = "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb";
  var eth = null, account = "", pxTimer = 0, cdTimer = 0, data = null, curRid = 0;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dai(v) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " DAI"; }
  function hm(ms) { var d = new Date(ms + 8 * 3600e3); return (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
  function dayCn(day) { var p = day.split("-"); return Number(p[1]) + "月" + Number(p[2]) + "日"; }
  function left(ms) { if (ms <= 0) return "0 分"; var h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1000) % 60; return (h ? h + " 小时 " : "") + m + " 分 " + (h ? "" : s + " 秒"); }
  function utf8hex(str) { var b = unescape(encodeURIComponent(str)), h = "0x"; for (var i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return h; }
  // 签名文字必须和 functions/api/oracle.js 里的 guessText 一字不差
  function guessText(day, ps, a) { return "AiLGNS 每日预言家\n我预测 " + day + " 晚上 9-10 点 AiLGNS 价格：\n" + ps.join(", ") + " DAI\n地址：" + a; }
  function pxOf(r) { var w = r.slice(2), ail = BigInt("0x" + w.slice(0, 64)), d = BigInt("0x" + w.slice(64, 128)); return Number((d * 1000000n) / ail) / 1e6; }

  function page(rid) {
    clearInterval(pxTimer); clearInterval(cdTimer); curRid = rid;
    A.app.innerHTML =
      '<section class="card or-hero"><div class="or-h"><h2>🔮 AiLGNS 每日预言家</h2><span class="muted">免费参与 · 持有域名就能玩</span></div>' +
      '<div class="or-px"><small>AiLGNS 现价（链上实时）</small><b id="or-px">读取中…</b><span>DAI</span></div>' +
      '<svg id="or-chart" class="or-chart" viewBox="0 0 360 200"><text x="180" y="100" text-anchor="middle" class="or-ct">K 线读取中…</text></svg>' +
      '<p class="or-src">数据来源：<a href="' + SCAN + 'address/' + PAIR + '" target="_blank" rel="noopener">AiLGNS/DAI 交易池 0x0a1C…caf0（Anubis 链）↗</a> · 现价每 5 秒刷新 · 1 小时 K 线（最近 24 小时）</p></section>' +
      '<div id="or-out"><section class="card"><p class="muted">读取中…</p></section></div>';
    livePx(rid); chart(rid);
    pxTimer = setInterval(function () { if (!A.isCurrent(rid)) return clearInterval(pxTimer); livePx(rid); }, 5000);
    var go = function () { load(rid); };
    if (!account && A.wallets && A.wallets.silent) A.wallets.silent().then(function (a) { if (a) account = String(a).toLowerCase(); go(); }, go); else go();
  }
  function livePx(rid) {
    W.rpcOn("anubis", "eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "latest"]).then(function (r) {
      var el = document.getElementById("or-px"); if (el && A.isCurrent(rid)) el.textContent = pxOf(r).toFixed(3);
    }, function () {});
  }
  // 1 小时 K 线（最近 24 根）：读池子的 Sync 事件（每次买卖后的储备），算出每小时开高低收；Anubis 约 1 秒一块
  var SYNC = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
  function pxData(d) { var w = d.slice(2); return Number(BigInt("0x" + w.slice(64, 128)) * 1000000n / BigInt("0x" + w.slice(0, 64))) / 1e6; }
  function chart(rid) {
    var N = 24, latest, tsL, h0, b0;
    A.rpc("eth_getBlockByNumber", ["latest", false]).then(function (b) {
      latest = parseInt(b.number, 16); tsL = parseInt(b.timestamp, 16);
      h0 = Math.floor(tsL / 3600) * 3600 - (N - 1) * 3600; b0 = latest - (tsL - h0);
      var calls = [A.rpc("eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "0x" + (b0 - 1).toString(16)])];
      for (var f = b0; f <= latest; f += 5000) calls.push(A.rpc("eth_getLogs", [{ address: PAIR, topics: [SYNC], fromBlock: "0x" + f.toString(16), toBlock: "0x" + Math.min(latest, f + 4999).toString(16) }]));
      return Promise.all(calls);
    }).then(function (r) {
      var el = document.getElementById("or-chart"); if (!el || !A.isCurrent(rid)) return;
      var last = pxOf(r[0]), c = [];
      for (var i = 0; i < N; i++) c.push({ t: h0 + i * 3600, o: last, h: last, l: last, c: last, v: 0 });
      var cur = last, prevDai = null;
      [].concat.apply([], r.slice(1)).forEach(function (lg) {
        var b = parseInt(lg.blockNumber, 16), k = Math.floor((tsL - (latest - b) - h0) / 3600);
        var p = pxData(lg.data), dai = Number(BigInt("0x" + lg.data.slice(66, 130)) / 10n ** 16n) / 100;
        if (k >= 0 && k < N) {
          var x = c[k];
          if (!x.touched) { x.o = cur; x.h = Math.max(cur, p); x.l = Math.min(cur, p); x.touched = 1; } // 开盘 = 这一小时第一笔之前的价格
          x.h = Math.max(x.h, p); x.l = Math.min(x.l, p); x.c = p;
          if (prevDai !== null) x.v += Math.abs(dai - prevDai);
        }
        cur = p; prevDai = dai;
      });
      // 没成交的小时：一字线，沿用上一根收盘
      for (var j = 0; j < N; j++) if (!c[j].touched) { var pc = j ? c[j - 1].c : last; c[j].o = c[j].h = c[j].l = c[j].c = pc; }
      drawK(el, c);
    }, function () { var el = document.getElementById("or-chart"); if (el) el.innerHTML = '<text x="180" y="100" text-anchor="middle" class="or-ct">K 线读取失败</text>'; });
  }
  function drawK(el, c) {
    var W0 = 360, H0 = 200, L = 6, R = 300, T = 10, B = 172, hi = -Infinity, lo = Infinity;
    c.forEach(function (x) { hi = Math.max(hi, x.h); lo = Math.min(lo, x.l); });
    var pad = (hi - lo) * 0.08 || 0.5; hi += pad; lo -= pad;
    var y = function (p) { return T + (hi - p) / (hi - lo) * (B - T); }, cw = (R - L) / c.length, svg = "";
    for (var g = 0; g <= 4; g++) { var gp = lo + (hi - lo) * g / 4, gy = y(gp); svg += '<line x1="' + L + '" x2="' + R + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" class="or-grid"/><text x="' + (R + 4) + '" y="' + (gy + 3.5).toFixed(1) + '" class="or-ct">' + gp.toFixed(2) + "</text>"; }
    c.forEach(function (x, i) {
      var cx = L + cw * i + cw / 2, up = x.c >= x.o, col = up ? "or-up" : "or-dn", top = y(Math.max(x.o, x.c)), bot = y(Math.min(x.o, x.c));
      var d = new Date((x.t + 8 * 3600) * 1000), hh = String(d.getUTCHours()).padStart(2, "0") + ":00";
      svg += "<g><title>" + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 " + hh + "\n开 " + x.o.toFixed(3) + "　高 " + x.h.toFixed(3) + "\n低 " + x.l.toFixed(3) + "　收 " + x.c.toFixed(3) + "</title>" +
        '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + y(x.h).toFixed(1) + '" y2="' + y(x.l).toFixed(1) + '" class="' + col + '"/>' +
        '<rect x="' + (cx - cw * 0.32).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (cw * 0.64).toFixed(1) + '" height="' + Math.max(1, bot - top).toFixed(1) + '" class="' + col + '"/></g>';
      if (i % 6 === 0) svg += '<text x="' + cx.toFixed(1) + '" y="' + (H0 - 12) + '" text-anchor="middle" class="or-ct">' + hh + "</text>";
    });
    var lastC = c[c.length - 1];
    svg += '<line x1="' + L + '" x2="' + R + '" y1="' + y(lastC.c).toFixed(1) + '" y2="' + y(lastC.c).toFixed(1) + '" class="or-lastl"/><rect x="' + (R + 1) + '" y="' + (y(lastC.c) - 7).toFixed(1) + '" width="58" height="14" rx="3" class="or-lastb"/><text x="' + (R + 4) + '" y="' + (y(lastC.c) + 3.5).toFixed(1) + '" class="or-lastt">' + lastC.c.toFixed(2) + "</text>";
    el.innerHTML = svg;
  }

  function load(rid) {
    return fetch("/api/oracle" + (account ? "?a=" + account : ""), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (!A.isCurrent(rid)) return;
      data = d; render(rid);
    }, function () { var o = document.getElementById("or-out"); if (o) o.innerHTML = '<section class="card"><p class="muted">读取失败，请稍后刷新</p></section>'; });
  }

  function render(rid) {
    var d = data, o = document.getElementById("or-out"); if (!o) return;
    var dr = d.drawing, res = dr.res, now = Date.now(), inWin = now >= dr.from && now < dr.to + 5 * 60e3 && !res;
    var html = "";
    // 超级大奖池 + 本轮奖金
    html += '<section class="card or-pool"><div class="or-pl"><small>🎯 超级大奖池（猜中 3 位小数平分，没人中一直滚）</small><b>' + dai(d.pool) + "</b></div>" +
      funds(d.funds) +
      '<div class="or-pr"><span>本轮新增奖金 <b>' + dai(d.allot) + "</b></span><small>= 昨天域名收入 " + dai(d.rev) + " × 20%：10% 给最接近的人，90% 滚进大奖池</small></div></section>";
    // 正在开奖 / 刚开完
    if (inWin || (res && now - res.at < 20 * 3600e3)) html += drawCard(d);
    // 提交预测
    html += '<section class="card or-form"><div class="card-head"><h2>✍️ 预测 ' + dayCn(d.round) + ' 晚上开奖价</h2><span class="muted" id="or-cd"></span></div>' + meBox(d) + "</section>";
    // 最近一次结果（不在上面显示时）
    if (d.last && !(res && res.day === d.last.day && now - res.at < 20 * 3600e3)) html += resultCard(d.last, "📜 上一期结果");
    // 预言家榜
    if (d.board && d.board.length) html += '<section class="card"><div class="card-head"><h2>🏆 预言家榜</h2><span class="muted">大奖次数 · 最接近次数</span></div><ol class="or-board">' +
      d.board.map(function (x) { return "<li><b>" + esc(x.name) + "</b><span>🎯 " + x.j + " 次 · 🥇 " + x.c + " 次</span></li>"; }).join("") + "</ol></section>";
    html += rules();
    o.innerHTML = html;
    bind(rid);
    tick();
    clearInterval(cdTimer); cdTimer = setInterval(function () { if (!A.isCurrent(rid)) return clearInterval(cdTimer); tick(); }, 1000);
  }
  function tick() {
    var el = document.getElementById("or-cd"); if (!el || !data) return;
    var ms = data.cutoff - Date.now();
    if (ms <= 0) { clearInterval(cdTimer); if (A.isCurrent(curRid)) setTimeout(function () { load(curRid); }, 3000); return; }
    el.textContent = "距离本轮锁定还有 " + left(ms);
  }

  // 奖金池里实际有多少币：DAI、AiLGNS（按现价折算）、LGNS（不留 LGNS：用 LGNS 付的部分按价值记成「待留」，等 DAI / AiLGNS 进来再留）
  function funds(f) {
    if (!f) return "";
    var ailV = f.ail * f.px, tot = f.dai + ailV;
    return '<div class="or-funds"><span>💵 DAI <b>' + f.dai.toLocaleString("en-US", { maximumFractionDigits: 2 }) + "</b></span>" +
      "<span>🪙 AiLGNS <b>" + f.ail.toLocaleString("en-US", { maximumFractionDigits: 4 }) + "</b> <small>≈ " + ailV.toFixed(2) + " DAI</small></span>" +
      '<span class="or-tot">合计约 <b>' + tot.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " DAI</b></span>" +
      '<small class="or-fnote">奖金池里实际留着的钱（在收款钱包 0xedb9），<a href="https://github.com/yaoyederener/monita/blob/main/data/oracle_prize.json" target="_blank" rel="noopener">记账公开 ↗</a></small></div>';
  }
  function meBox(d) {
    var me = d.me;
    if (account === SRC) return ownerBox();
    if (!account) return '<p>持有 .ailgns / .lgns 域名并设为主名字，就能免费预测。</p><button type="button" class="nm-go" id="or-conn">🔗 连接钱包参加</button>';
    if (!me || me.err) return '<p class="muted">' + esc((me && me.err) || "读取中…") + "</p>";
    if (!me.name) return '<p>钱包 <span class="mono">' + A.short(account) + '</span> 还没有<b>主名字</b>。</p><p>注册一个 .ailgns 域名（5 DAI 起），再点「设为主名字」就能参加 👇</p><a class="nm-go" href="#/names">去注册域名 →</a>';
    if (me.taken) return '<p class="nm-bad">' + esc(me.name) + " 这一轮已经由别的钱包预测过了，一个名字每轮只能用一次。</p>";
    var rest = me.n - me.used;
    return '<p>你好，<b>' + esc(me.name) + "</b>！本轮你有 <b>" + me.n + "</b> 次预测机会（" + esc(me.tier) + "域名 " + me.base + " 次" + (me.bonus ? " + 今天 OTC 成交满 50 DAI 加 1 次" : "") + "），已用 <b>" + me.used + "</b> 次。</p>" +
      (me.ps.length ? '<p class="or-mine">我的预测：' + me.ps.map(function (p) { return "<b>" + p + "</b>"; }).join("、") + "</p>" : "") +
      (rest > 0 ? '<div class="or-in"><input id="or-p" inputmode="decimal" placeholder="例如 827.354（3 位小数）" autocomplete="off"><button type="button" class="nm-go" id="or-go">🔮 提交预测</button></div>' +
        '<p class="muted">还能预测 ' + rest + " 次；一次可以填多个价格，用空格或逗号隔开。只需要钱包签名，不扣钱、不花 Gas。</p>" :
        '<p class="muted">本轮次数已用完' + (me.bonus ? "" : "；今天在 OTC 成交一笔满 50 DAI，可以再加 1 次") + "。</p>") +
      (me.ps.length ? '<button type="button" class="nm-sw" id="or-poster">📸 生成晒单海报</button>' : "") +
      '<p class="muted or-st" id="or-st"></p><div id="or-img"></div>';
  }

  // 站长（收款钱包）：给触发钱包授权 DAI 发奖额度。触发钱包只能在这个额度内把奖金发给中奖的人
  function ownerBox() {
    setTimeout(function () {
      [[DAI, "or-allow", " DAI"], [AIL, "or-allow2", " AiLGNS"]].forEach(function (t) {
        W.rpcOn("anubis", "eth_call", [{ to: t[0], data: "0xdd62ed3e" + SRC.slice(2).padStart(64, "0") + KEEPER.slice(2).padStart(64, "0") }, "latest"]).then(function (r) {
          var el = document.getElementById(t[1]); if (el) el.textContent = (Number(BigInt(r) / 10n ** 14n) / 10000).toLocaleString("en-US") + t[2];
        }, function () {});
      });
    }, 0);
    return '<p>👑 站长钱包不参加预测。这里设置<b>自动发奖额度</b>：收款钱包授权触发钱包 ' + A.short(KEEPER) + ' 最多转出多少 DAI 发奖金（只能发给中奖的人，额度用完再授权）。</p>' +
      '<p>奖金先用 DAI 发，DAI 不够用 AiLGNS（按现价折算），所以两种都要授权。当前额度：<b id="or-allow">读取中…</b> · <b id="or-allow2">读取中…</b></p>' +
      '<div class="or-in"><input id="or-amt" inputmode="decimal" value="1000"><button type="button" class="nm-go or-approve" data-t="DAI">授权 DAI 额度</button></div>' +
      '<div class="or-in"><input id="or-amt2" inputmode="decimal" value="5"><button type="button" class="nm-go or-approve" data-t="AIL">授权 AiLGNS 额度</button></div><p class="muted or-st" id="or-st"></p>';
  }
  function drawCard(d) {
    var dr = d.drawing, res = dr.res;
    if (res) return resultCard(res, "🎉 " + dayCn(res.day) + " 开奖结果");
    var list = dr.list || [];
    return '<section class="card or-draw"><div class="card-head"><h2>🎲 ' + dayCn(dr.day) + ' 正在开奖</h2><span class="muted">晚上 9:00–10:00 随机一刻 · 10:05 前公布</span></div>' +
      "<p>本轮已锁定，共 <b>" + list.length + "</b> 人参与。开奖价 = 9–10 点之间随机一刻的链上价格，由 10 点整那个区块的哈希决定，谁都没法提前知道。</p>" +
      (list.length ? '<details class="or-all"><summary>看所有人的预测（' + list.reduce(function (s, g) { return s + g.ps.length; }, 0) + " 个）</summary><ul>" +
        list.map(function (g) { return "<li><b>" + esc(g.name) + "</b>：" + g.ps.join("、") + "</li>"; }).join("") + "</ul></details>" : "") + "</section>";
  }
  function resultCard(r, title) {
    var px = (r.px / 1000).toFixed(3), jw = r.jackpot.winners, c = r.closest;
    return '<section class="card or-res"><div class="card-head"><h2>' + title + '</h2><span class="muted">' + dayCn(r.day) + "</span></div>" +
      '<div class="or-rpx"><small>开奖价</small><b>' + px + '</b><span>DAI</span></div>' +
      '<p class="or-proof">开奖时刻 ' + hm(r.blockTime * 1000) + ' · <a href="' + SCAN + "block/" + r.block + '" target="_blank" rel="noopener">区块 #' + r.block + " ↗</a>（由 #" + r.b1 + " 的哈希在 #" + r.b0 + "–#" + (r.b1 - 1) + " 中随机选出）· 链上原价 " + r.pxRaw.toFixed(6) + "</p>" +
      (jw.length ? '<p class="or-win">🎯 <b>超级大奖池 ' + dai(r.jackpot.pool) + "</b> 被 " + jw.map(function (w) { return "<b>" + esc(w.name) + "</b>"; }).join("、") + " 猜中！" + (jw.length > 1 ? "每人 " + dai(r.jackpot.each) : "独得") + "</p>" :
        '<p>🎯 没人猜中 ' + px + "，大奖池滚到 <b>" + dai(r.poolAfter) + "</b>，下一期继续！</p>") +
      (c ? '<p class="or-win">🥇 今日最接近：<b>' + esc(c.name) + "</b> 预测 " + (c.p / 1000).toFixed(3) + "，只差 " + (c.diff / 1000).toFixed(3) + "，得 " + dai(c.amt) + "</p>" : '<p class="muted">这一期没人参加。</p>') +
      '<p class="muted">共 ' + r.n + " 人、" + r.guesses + " 个预测 · 本期奖金 " + dai(r.allot) + "（前一天域名收入 " + dai(r.rev) + " × 20%）· 奖金由系统自动发到中奖钱包</p></section>";
  }
  function rules() {
    return '<details class="card or-rules"><summary>📜 玩法规则（点开看）</summary><ol>' +
      "<li><b>谁能玩</b>：持有 .ailgns / .lgns 域名并设为主名字，免费参与，只需钱包签名。</li>" +
      "<li><b>猜什么</b>：猜开奖价，精确到小数点后 3 位，例如 827.354。</li>" +
      "<li><b>几次机会</b>：按主名字档位：普通 1 次、中文 2 字 2 次、英文 4 位 3 次、英文 3 位 5 次；当天在 OTC 成交一笔满 50 DAI 再加 1 次。一个名字每轮只能用一次。</li>" +
      "<li><b>随时能猜</b>：晚上 9 点前提交的参加当晚开奖，9 点后提交的参加第二天。</li>" +
      "<li><b>怎么开奖</b>：晚上 9:00–10:00 之间随机一刻的链上价格就是开奖价；是哪一刻由 10 点整那个区块的哈希决定，谁都没法提前知道。10:05 前公布。</li>" +
      "<li><b>奖金</b>：每天拿出前一天域名收入的 20%。10% 给当天最接近的人（一样接近先提交的得）；90% 滚进超级大奖池，猜中 3 位小数完全一样的人平分，没人中就一直滚。</li>" +
      "<li><b>公开透明</b>：开奖区块、时间、价格全部公开，可以在 anubisscan 上核对。站长钱包不参加。</li>" +
      '<li class="muted">仅供娱乐，不构成任何投资建议。</li></ol></details>';
  }

  function connect() {
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) { account = String(a[0]).toLowerCase(); return account; });
  }
  function bind(rid) {
    var c = document.getElementById("or-conn");
    if (c) c.onclick = function () { connect().then(function () { load(rid); }, function (e) { A.errTip(e.message || String(e), c); }); };
    var go = document.getElementById("or-go"), st = document.getElementById("or-st");
    if (go) go.onclick = function () {
      var raw = document.getElementById("or-p").value.split(/[\s,，、]+/).filter(function (x) { return x; });
      if (!raw.length || raw.some(function (x) { return !/^\d{1,7}(\.\d{1,3})?$/.test(x); })) return A.errTip("价格格式不对，例如 827.354（最多 3 位小数）", go);
      raw = raw.map(function (x) { return Number(x).toFixed(3); });
      var day = data.round;
      go.disabled = true; st.textContent = "请在钱包里签名（只是签名，不扣钱、不花 Gas）…";
      (eth ? Promise.resolve() : connect()).then(function () {
        return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(guessText(day, raw, account)), account] });
      }).then(function (sig) {
        st.textContent = "正在提交…";
        return fetch("/api/oracle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: account, ps: raw, day: day, sig: sig }) }).then(function (x) { return x.json(); });
      }).then(function (j) {
        go.disabled = false;
        if (j.error) throw new Error(j.error);
        st.textContent = "✅ 已提交！" + dayCn(j.round) + " 晚上 9–10 点开奖，10:05 前公布。";
        load(rid);
      }, function (e) { go.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), go); });
    };
    document.querySelectorAll(".or-approve").forEach(function (ap) { ap.onclick = function () {
      var isA = ap.getAttribute("data-t") === "AIL", v = Number(document.getElementById(isA ? "or-amt2" : "or-amt").value);
      if (!(v >= 0 && v <= 100000)) return A.errTip("额度填 0 到 100000 之间（填 0 = 取消授权）", ap);
      var amt = BigInt(Math.round(v * 10000)) * 10n ** 14n;
      ap.disabled = true; st.textContent = "请在钱包确认授权…";
      (eth ? Promise.resolve() : connect()).then(function () { return W.switchTo(eth, "anubis"); }).then(function () {
        return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: isA ? AIL : DAI, data: "0x095ea7b3" + KEEPER.slice(2).padStart(64, "0") + amt.toString(16).padStart(64, "0") }] });
      }).then(function (h) { st.textContent = "已提交，等待确认…"; return W.waitOn("anubis", h); }).then(function () { ap.disabled = false; st.textContent = "✅ 授权成功"; load(rid); },
        function (e) { ap.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), ap); });
    }; });
    var pb = document.getElementById("or-poster");
    if (pb) pb.onclick = function () { poster(); };
  }

  // 晒单海报：域名 + 预测价格 + 大奖池，长按保存图片发到群里（不带邀请链接）
  function poster() {
    var me = data.me, cv = document.createElement("canvas"), W2 = 720, H2 = 960, x = cv.getContext("2d");
    cv.width = W2; cv.height = H2;
    var g = x.createLinearGradient(0, 0, 0, H2); g.addColorStop(0, "#f3eeff"); g.addColorStop(1, "#e6dcff");
    x.fillStyle = g; x.fillRect(0, 0, W2, H2);
    x.textAlign = "center"; x.fillStyle = "#4b2fb8";
    x.font = "bold 54px sans-serif"; x.fillText("🔮 AiLGNS 每日预言家", W2 / 2, 120);
    x.font = "34px sans-serif"; x.fillStyle = "#6b5aa6"; x.fillText("我是", W2 / 2, 230);
    x.font = "bold 60px sans-serif"; x.fillStyle = "#3a1f9e"; x.fillText(me.name, W2 / 2, 310);
    x.font = "34px sans-serif"; x.fillStyle = "#6b5aa6"; x.fillText("我预测 " + dayCn(data.round) + " 晚上 AiLGNS =", W2 / 2, 410);
    x.font = "bold 72px sans-serif"; x.fillStyle = "#7c5cff";
    me.ps.slice(0, 4).forEach(function (p, i) { x.fillText(p, W2 / 2, 500 + i * 80); });
    x.font = "bold 40px sans-serif"; x.fillStyle = "#c98a00"; x.fillText("超级大奖池 " + dai(data.pool), W2 / 2, 830);
    x.font = "30px sans-serif"; x.fillStyle = "#6b5aa6"; x.fillText("敢来比吗？ ailgns.dev", W2 / 2, 900);
    var url = cv.toDataURL("image/png"), box = document.getElementById("or-img");
    if (box) box.innerHTML = '<p class="muted">长按图片保存，发到群里晒一晒 👇</p><img class="or-poster" src="' + url + '" alt="晒单海报">';
  }

  A.pages.oracle = page;
})();
