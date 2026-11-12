var PARTNER_BUILD = "2026-11-10"; // 换地址重发：CDN 把旧地址缓存成了 HTML
// 🤝 合伙人面板 #/partner：独立口令（PARTNER_KEY，站长口令也能进）。四屏：风险与建议 → 钱 → 今天的生意 → 客户 → 计划
// 数据来自 /api/partner（ops-watch 每 5 分钟算好）；只有站长口令能改分配比例和开发计划
(function () {
  var A = window.AIL, esc = A.esc || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function key() { try { return localStorage.getItem("ptnKey") || localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function fm(v, d) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d }); }
  function tm(t) { var x = new Date(t + 8 * 3600e3); return (x.getUTCMonth() + 1) + "/" + x.getUTCDate() + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); }
  function dayCn(d) { return d ? Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10)) : ""; }
  var LV = { red: ["🔴", "马上处理"], yellow: ["🟡", "今天处理"], green: ["🟢", "知道就好"] };

  // 📊 运营分配统计（2026-11-08）：比例、地址、谷歌社交账号钱包实际转过去多少
  // 📍 所有部署地址（lib/addresses.js 登记）：名称 · 链 · 地址 · Gas / DAI / AiLGNS / LGNS · 状态；异常的排前面
  // 站长 2026-11-11：余额从高到低排（点 Gas / DAI / AiLGNS / LGNS），「默认」= 异常在前的原顺序；刷新数据后保持选择
  var adSort = "";
  function sortAddr(k) {
    var tb = document.querySelector(".ptn-addr tbody"); if (!tb) return;
    adSort = k || "";
    var at = function (r, n) { return parseFloat(r.getAttribute("data-" + n)); }, rows = [].slice.call(tb.children);
    rows.sort(function (x, y) {
      if (adSort) { var p = at(x, adSort), q = at(y, adSort), dv = (isNaN(q) ? -1 : q) - (isNaN(p) ? -1 : p); if (dv) return dv; }
      return at(x, "i") - at(y, "i");
    });
    rows.forEach(function (r) { tb.appendChild(r); });
    [].forEach.call(document.querySelectorAll("#ptn-sort button"), function (b) { b.className = (b.getAttribute("data-k") || "") === adSort ? "on" : ""; });
  }
  function addrTable(j) {
    var L = j.addrs || []; if (!L.length) return "";
    var bad = L.filter(function (d) { return d.st !== "✅"; }), good = L.filter(function (d) { return d.st === "✅"; });
    var scan = function (d) { return d.c === "polygon" ? "https://polygonscan.com/address/" + d.a : "#/scan/" + d.a; };
    var f4 = function (v) { return v == null ? "—" : v >= 100 ? fm(v, 0) : String(Math.round(v * 1e4) / 1e4); };
    var dv = function (v) { return v == null ? "" : v; };
    var row = function (d, i) {
      return '<tr data-i="' + i + '" data-gas="' + dv(d.gas) + '" data-dai="' + dv(d.tok.DAI) + '" data-ailgns="' + dv(d.tok.AiLGNS) + '" data-lgns="' + dv(d.tok.LGNS) + '" class="' + (d.st === "✅" ? "" : "ptn-bad") + '"><td><b>' + esc(d.n) + "</b><small>" + (d.k === "contract" ? "合约" : "钱包") + " · " + (d.c === "polygon" ? "Polygon" : "Anubis") + ' · <a href="' + scan(d) + '"' + (d.c === "polygon" ? ' target="_blank" rel="noopener"' : "") + '><code>' + d.a.slice(0, 6) + "…" + d.a.slice(-4) + "</code></a>" + (d.note ? " · " + esc(d.note) : "") + "</small></td>" +
        "<td data-l=Gas>" + f4(d.gas) + "</td><td data-l=DAI>" + f4(d.tok.DAI) + "</td><td data-l=AiLGNS>" + f4(d.tok.AiLGNS) + "</td><td data-l=LGNS>" + f4(d.tok.LGNS) + "</td><td data-l=状态>" + esc(d.st) + "</td></tr>";
    };
    // 站长 2026-11-09：表太长，默认折叠；有异常才默认展开
    return '<details class="ptn-addrs"' + (bad.length ? " open" : "") + '><summary><h3 class="ad-h">📍 所有部署地址（' + L.length + " 个" + (bad.length ? " · ⚠️ " + bad.length + " 个异常" : " · ✅ 全部正常") + '）<small class="muted">' + (bad.length ? "有异常，已展开" : "点开看每个地址的余额") + "</small></h3></summary>" +
      '<p class="muted">合约、机器人钱包、合伙人收款全在这，有异常会同时出现在上面的风险里。新部署的合约或钱包必须登记到这张表（lib/addresses.js），不然看不见。</p>' +
      '<div class="ptn-sort" id="ptn-sort"><span>余额从高到低排：</span><button type="button" data-k="" class="on">默认</button><button type="button" data-k="gas">Gas</button><button type="button" data-k="dai">DAI</button><button type="button" data-k="ailgns">AiLGNS</button><button type="button" data-k="lgns">LGNS</button></div>' +
      '<div class="ad-tw"><table class="ad-t ptn-t ptn-addr"><thead><tr><th>地址</th><th>Gas</th><th>DAI</th><th>AiLGNS</th><th>LGNS</th><th>状态</th></tr></thead><tbody>' + bad.concat(good).map(row).join("") + "</tbody></table></div></details>";
  }
  function allocHtml(j) {
    var L = j.alloc || []; if (!L.length) return "";
    var tot = L.reduce(function (t, y) { return t + ((y.got && y.got.ail) || 0); }, 0);
    var lg = j.alloclog || [], tr = (j.split && j.split.transit) || {}, wait = tr.ail > 0.0001;
    var st = '<div class="ptn-cp"><div class="ptn-cpt">⚠️ 每次分配，先把 AiLGNS 转到这个地址</div><div class="ptn-cpa mono" id="ptn-cpa">' + esc(tr.a || "") + '</div><button type="button" class="nm-go ptn-cpb" id="ptn-cpb">📋 点击复制中转地址</button></div>' +
      '<div class="ptn-tr"><span>🔁 中转地址余额</span><b>' + (tr.ail == null ? "读取失败" : fm(tr.ail, 4) + " AiLGNS") + "</b>" + (tr.value ? '<small class="muted">≈ ' + fm(tr.value, 0) + " DAI</small>" : "") + '<a class="mono" href="#/scan/' + tr.a + '">链上记录 →</a></div><p class="muted">流程：谷歌社交账号钱包 → 转到这个中转地址 → 从中转地址按比例转到下面四个地址（只分 AiLGNS）。</p>' +
      '<div class="ptn-ast ' + (wait ? "wait" : "done") + '">' + (wait ? "<b>⏳ 等待分配</b><span>中转地址里还有 " + fm(tr.ail, 4) + " AiLGNS 没分</span>" : "<b>✅ 已分配</b><span>中转地址已转空</span>") +
      (j.canWrite ? '<button type="button" class="nm-go" id="ptn-adone">📣 我已分配，通知他们</button>' : "") + '<small class="muted" id="ptn-ast">' + (lg[0] ? "上次通知 " + tm(lg[0].t) + " · " + (lg[0].ail != null ? fm(lg[0].ail, 4) + " AiLGNS" : "≈ " + fm(lg[0].total, 0) + " DAI") : "") + "</small></div>";
    var hist = lg.length ? '<details class="ptn-ahist"><summary>📜 分配记录（' + lg.length + ' 次）</summary>' + lg.slice(0, 20).map(function (x) { return "<div><b>" + tm(x.t) + "</b> 合计 " + (x.ail != null ? fm(x.ail, 4) + " AiLGNS" : "≈ " + fm(x.total, 0) + " DAI") + "<small class=\"muted\"> · " + x.parts.map(function (y) { return esc(y.n) + " " + y.p + "% " + (y.ail != null ? fm(y.ail, 4) : fm(y.amt, 0)); }).join(" / ") + "</small></div>"; }).join("") + "</details>" : "";
    return '<h3 class="ad-h">💼 本次分配</h3>' + st + hist + '<details class="ptn-ald"><summary>📊 运营分配统计（中转地址累计已转 ' + fm(tot, 4) + ' AiLGNS）</summary><div class="ptn-alloc">' + L.map(function (y) {
      var g = y.got || {}, real = tot ? Math.round(g.ail / tot * 1000) / 10 : 0;
      return '<div class="ptn-al"><div class="ptn-alh"><b>' + esc(y.n) + " " + y.p + '%</b><a class="mono" href="#/scan/' + y.a + '">' + y.a.slice(0, 6) + "…" + y.a.slice(-4) + " →</a></div>" +
        (g.err ? '<p class="muted">读取失败，稍后刷新</p>' : '<div class="ptn-alv"><span>已转 <b>' + fm(g.ail || 0, 4) + " AiLGNS</b></span><span>实际占比 <b" + (tot && Math.abs(real - y.p) > 5 ? ' class="warn"' : "") + ">" + real + "%</b></span><span>" + (g.n || 0) + " 笔</span></div>" +
        '<small class="muted">≈ ' + fm(g.value || 0, 0) + " DAI（按现价）" + (g.last ? " · 最近 " + tm(g.last) : "") + "</small>" + ((g.txs || []).length ? '<details class="ptn-atxd"><summary>查看最近 ' + g.txs.length + ' 笔转账明细</summary><div class="ptn-atx">' + g.txs.map(function (x) { return '<a href="#/scan/' + x.h + '"><span>' + tm(x.t) + "</span><b>" + fm(x.v, 4) + " AiLGNS</b><small>查看转账 →</small></a>"; }).join("") + "</div></details>" : "")) + "</div>";
    }).join("") + '<p class="muted">四个地址合计已转 <b>' + fm(tot, 4) + ' AiLGNS</b>。「实际占比」和设定比例差 5% 以上会标红。</p></div></details>';
  }
  function login(rid, msg) {
    A.app.innerHTML = '<section class="card ptn-login"><h2>🤝 合伙人面板</h2><p class="muted">输入查看口令。合伙人只能看，站长口令还能改分配比例和计划。</p>' +
      (msg ? '<p class="nm-bad">' + esc(msg) + "</p>" : "") +
      '<input id="ptn-k" type="password" placeholder="口令" autocomplete="current-password"><button type="button" class="nm-go" id="ptn-go">进入</button></section>';
    var go = document.getElementById("ptn-go"), inp = document.getElementById("ptn-k");
    go.onclick = function () { var v = inp.value.trim(); if (!v) return; try { localStorage.setItem("ptnKey", v); } catch (e) {} load(rid); };
    inp.onkeydown = function (e) { if (e.key === "Enter") go.click(); };
  }

  // 昨日对比：今天 vs 昨天 → 「昨天 236 ↑12%」（站长 2026-11-09）
  function vs(t, y, unit) { t = Number(t) || 0; y = Number(y) || 0; var d = y ? Math.round((t - y) / y * 100) : 0; return "昨天 " + fm(y, 0) + (unit || "") + (y ? (d > 0 ? ' <i class="up">↑' + d + "%</i>" : d < 0 ? ' <i class="down">↓' + (-d) + "%</i>" : " 持平") : ""); }
  function tile(label, val, sub, cls) { return '<div class="ad-tile' + (cls ? " " + cls : "") + '"><small>' + label + "</small><b>" + val + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>"; }

  function render(rid, j) {
    var d0 = j.rows[0] || {}, d1 = j.rows[1] || {}, d2 = j.rows[2] || {}, w7 = j.rows.slice(0, 7); // d2 = 前天（站长 2026-11-09：两天太少，看三天）
    var sum = function (k) { return w7.reduce(function (s, r) { return s + (r[k] || 0); }, 0); };
    // 站长 2026-11-12：「不要毛收入，要统计谷歌账户留存的真实收入，我也不作假」。成交额×1%、域名×30% 这种算出来的数全撤掉，
    // 只写链上真转进谷歌社交账号钱包并留下来的钱（r.fl 后台逐笔扫链；r.src 外面钱包直接转来的）。三种币分开写、不折算（2026-11-11 定）
    var TK = ["dai", "ail", "lgns"], MK = { dai: "mDai", ail: "mAil", lgns: "mLgns" }, GK = ["otc", "nm", "pool", "mem", "oth", "all"];
    var Z = function () { return { dai: 0, ail: 0, lgns: 0 }; };
    var tk = function (o) {
      var a = [];
      if (Math.abs(o.dai) >= 0.005) a.push('<span class="tk1"><b>' + fm(o.dai, Math.abs(o.dai) >= 100 ? 0 : 2) + "</b> DAI</span>");
      if (Math.abs(o.ail) >= 0.00005) a.push('<span class="tk1"><b>' + fm(o.ail, 4) + "</b> AiLGNS</span>");
      if (Math.abs(o.lgns) >= 0.5) a.push('<span class="tk1"><b>' + fm(o.lgns, 0) + "</b> LGNS</span>");
      return a.length ? a.join("") : "<b>0</b>"; // 一种币一行（手机上三种币挤一行会被切掉）
    };
    var parts = function (r) { // 一天的留存：OTC 手续费 + （域名钱进来 − 转给奖池）+ 会员费 + 其它
      if (!r.fl) return null;
      var f = r.fl, x = r.src || {}, g = function (k) { return f[k] || {}; };
      var P = { otc: Z(), nm: Z(), pool: Z(), mem: Z(), oth: Z(), all: Z(), memN: x.memN || 0, usd: x.mem || 0, othN: (x.n || 0) + (g("oth").n || 0), k: 1 };
      TK.forEach(function (t) {
        P.otc[t] = g("otc")[t] || 0; P.pool[t] = g("pool")[t] || 0; P.nm[t] = (g("nm")[t] || 0) - P.pool[t];
        P.mem[t] = x[MK[t]] || 0; P.oth[t] = (x[t] || 0) + (g("oth")[t] || 0);
        P.all[t] = P.otc[t] + P.nm[t] + P.mem[t] + P.oth[t];
      });
      return P;
    };
    var cells = function (P, r, fills, fillDai, nmN) {
      if (!P) return '<td data-l="OTC 手续费">—</td><td data-l="域名留存">—</td><td data-l="会员费">—</td><td data-l="其它">—</td><td data-l="留存合计" class="in">—<small class="muted">正在从链上补</small></td>';
      return '<td data-l="OTC 手续费">' + tk(P.otc) + '<small class="muted">（成交 ' + fm(fillDai, 0) + " · " + (fills || 0) + " 笔）</small></td>" +
        '<td data-l="域名留存">' + tk(P.nm) + '<small class="muted">（卖 ' + (nmN || 0) + " 个 · 已转奖池 " + fm(P.pool.dai, 0) + " DAI）</small></td>" +
        '<td data-l="会员费">' + tk(P.mem) + (P.memN ? '<small class="muted">（' + P.memN + " 笔 · 合 " + fm(P.usd, 0) + " 美元）</small>" : "") + "</td>" +
        '<td data-l="其它">' + tk(P.oth) + (P.othN ? '<small class="muted">（' + P.othN + " 笔）</small>" : "") + "</td>" +
        '<td data-l="留存合计" class="in">' + tk(P.all) + "</td>";
    };
    var PS = w7.map(parts), SUM = PS.reduce(function (S, P) {
      if (!P) return S;
      GK.forEach(function (g) { TK.forEach(function (t) { S[g][t] += P[g][t]; }); });
      S.memN += P.memN; S.usd += P.usd; S.othN += P.othN; S.k++;
      return S;
    }, { otc: Z(), nm: Z(), pool: Z(), mem: Z(), oth: Z(), all: Z(), memN: 0, usd: 0, othN: 0, k: 0 });
    var flWait = j.flLag > 3000 ? Math.ceil(j.flLag / 29400) * 5 : 0; // 后台每 5 分钟补 6 段 × 4900 块
    var b = j.bal.src;
    var h = '<section class="card ptn-top"><div class="card-head"><h2>🤝 合伙人面板</h2><span class="muted">' + tm(j.at) + " 更新 · 每 5 分钟</span></div>" +
      (j.canWrite ? '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb">📮 工单</a><a href="#/partner" class="ad-nb on">📊 数据面板</a><a href="#/ops" class="ad-nb">🛠️ 网站优化</a><a href="#/todo" class="ad-nb">📝 待办</a><a href="#/med" class="ad-nb">💊 吃药</a></div>' : "") +
      // 风险与建议移到「网站优化」页（#/ops），这里不再重复
      // 2. 钱
      '<h3 class="ad-h">💰 钱（当前余额，不是历史累计）</h3><div class="ad-tiles">' +
      tile("待分配余额（谷歌社交账号钱包，折成 AiLGNS）", (j.price ? fm(j.split.total / j.price, 4) : "—") + " AiLGNS", "≈ " + fm(j.split.total, 0) + " DAI · 其中 AiLGNS " + fm(b.ail, 4) + " + DAI " + fm(b.dai + b.pdai, 0) + "（Anubis " + fm(b.dai, 0) + " + Polygon " + fm(b.pdai, 0) + "，按现价 " + fm(j.price, 0) + " 折算）", "big money") +
      (j.split.parts || []).map(function (y) { return tile(y.n + " " + y.p + "%（应分）", fm(y.ail || 0, 4) + " AiLGNS", "≈ " + fm(y.amt, 0) + " DAI · " + (j.split.basis === "transit" ? "按中转地址余额" : "按待分配余额") + " · " + '<a class="mono" href="#/scan/' + y.a + '">' + y.a.slice(0, 6) + "…" + y.a.slice(-4) + "</a>", "money"); }).join("") +
      tile("另有 LGNS（未折算）", fm(b.lgns, 0) + " + " + fm(b.plgns, 0), "Anubis + Polygon") +
      tile("奖池（客户的奖金，是负债）", "≈ " + fm(j.pool.value, 0) + " DAI", fm(j.pool.ail, 2) + " AiLGNS + " + fm(j.pool.dai, 0) + " DAI") +
      (j.bal.fast ? tile("⚡ 极速资金池（暂停进账，留给极速预言家）", "≈ " + fm(j.bal.fast.dai + j.bal.fast.ail * j.price, 0) + " DAI", fm(j.bal.fast.ail, 2) + " AiLGNS + " + fm(j.bal.fast.dai, 0) + " DAI") : "") +
      tile("触发钱包 Gas", fm(j.bal.keeper.dai, 1) + " DAI", j.bal.keeper.dai < 8 ? "⚠️ 低于 8 机器人会停" : "够用", j.bal.keeper.dai < 8 ? "warn" : "") +
      "</div>" +
      allocHtml(j) +
      addrTable(j) +
      // 3. 生意
      // 站长 2026-11-12：近 7 天逐天列出来（原来只有今天 / 昨天 / 7 天合计），看增长和运营；手机上一天一张卡
      '<h3 class="ad-h">📈 生意和使用（近 7 天，一天一行）</h3><div class="ad-tw"><table class="ad-t ptn-d"><thead><tr><th>日期</th><th>OTC 手续费</th><th>域名留存</th><th>会员费</th><th>其它</th><th>留存合计</th><th>访客</th><th>App 装机</th><th>在线峰值</th></tr></thead><tbody>' +
      w7.map(function (r, i) {
        var wk = r.day ? "周" + "日一二三四五六".charAt(new Date(r.day + "T00:00:00Z").getUTCDay()) : "", pk = r.pk || (i === 0 && j.traffic ? j.traffic.peak : 0);
        return "<tr" + (i === 0 ? ' class="now"' : "") + "><td>" + (i === 0 ? "今天 " : i === 1 ? "昨天 " : "") + dayCn(r.day) + " <small>" + wk + (i === 0 ? " · 还没过完" : "") + "</small></td>" +
          cells(PS[i], r, r.fills, r.fillDai, r.nmN) +
          '<td data-l="访客"><b>' + fm(r.v, 0) + "</b> 次 · 首次 " + (r.v1 || 0) + " 人</td>" +
          '<td data-l="App 装机"><b>' + (r.an || 0) + "</b> 台</td>" +
          '<td data-l="在线峰值">' + (pk ? "<b>" + pk + "</b> 人" : "—") + "</td></tr>";
      }).join("") +
      '<tr class="sum"><td>近 7 天合计' + (SUM.k && SUM.k < w7.length ? " <small>留存只有 " + SUM.k + " 天</small>" : "") + "</td>" + cells(SUM.k ? SUM : null, null, sum("fills"), sum("fillDai"), sum("nmN")) +
      '<td data-l="访客"><b>' + fm(sum("v"), 0) + "</b> 次 · 首次 " + fm(sum("v1"), 0) + ' 人</td><td data-l="App 装机"><b>' + sum("an") + '</b> 台</td><td data-l="在线峰值">最高 <b>' + w7.reduce(function (m, r, i) { return Math.max(m, r.pk || (i === 0 && j.traffic ? j.traffic.peak : 0) || 0); }, 0) + "</b> 人</td></tr>" +
      '</tbody></table></div>' + (flWait ? '<p class="muted ptn-dn">⏳ 前几天的数正在从链上一笔一笔补，大约 ' + flWait + " 分钟补齐，没补到的日子先显示「—」。</p>" : "") +
      '<p class="muted ptn-dn">这张表只算真留在谷歌社交账号钱包里的钱，从链上一笔一笔数出来，收到什么币就写什么币，不折算、不估算。OTC 手续费 = 每笔成交时托管合约转进钱包的手续费（买卖两边收的币不一样，所以有 DAI、AiLGNS、LGNS）。域名留存 = 域名的钱转进钱包的数，减掉转给预言家奖池 / 极速资金池的数（那是客户的奖金，不是我们的）。会员费 = 会员页开通 / 升级实际收到的币。其它 = 外面的钱包直接转进来的钱（游戏充值等）和像素墙收入。留存合计 = 前四栏相加。不算收入的：自己挂单的本金进出、自己换币、撤单退回、自己钱包之间互转。给客户的退款、分出去和提走的钱没有从这里减。访客「首次」= 第一次打开网站的人。</p>' +
      // 4. 客户
      '<h3 class="ad-h">🎮 本周游戏榜（近 7 天打开次数）</h3><p class="muted" id="ptn-games">读取中…</p>' +
      '<h3 class="ad-h">👥 客户</h3><div class="ad-tiles">' +
      tile("同时在线（5 分钟内打开）", (j.traffic ? j.traffic.now : 0) + " 人", "今天峰值 " + (j.traffic ? j.traffic.peak + "（" + j.traffic.peakAt + "）" : "—") + (j.traffic && j.traffic.peakY != null ? " · 昨天 " + j.traffic.peakY + "（" + j.traffic.peakYAt + "）" : "") + (j.traffic && j.traffic.peakY2 ? " · 前天 " + j.traffic.peakY2 + "（" + j.traffic.peakY2At + "）" : "") + " · 容量约 " + (j.cap ? j.cap.conc : "—"), j.traffic && j.cap && j.traffic.now >= j.cap.conc * 0.5 ? "warn" : "") +
      tile("今日访客", fm(d0.v, 0) + " 次", vs(d0.v, d1.v, " 次") + " · 前天 " + fm(d2.v, 0) + " 次 · 首次 " + (d0.v1 || 0) + " 人（昨天 " + (d1.v1 || 0) + " · 前天 " + (d2.v1 || 0) + "）") +
      tile("App 装机", "今天 " + (d0.an || 0) + " 台", vs(d0.an, d1.an, " 台") + " · 前天 " + (d2.an || 0) + " 台 · 累计 " + j.installs + " 台") +
      tile("工单", "今天 " + j.tk.today + " 张", (j.tk.yest != null ? vs(j.tk.today, j.tk.yest, " 张") + (j.tk.yest2 != null ? " · 前天 " + j.tk.yest2 + " 张" : "") + " · " : "") + (j.tk.open ? "⚠️ " + j.tk.open + " 张没回，最久等了 " + j.tk.oldestH + " 小时" : "全部回完") + (j.tk.avgH ? " · 平均 " + j.tk.avgH + " 小时回复" : ""), j.tk.open && j.tk.oldestH >= 2 ? "warn" : "") +
      "</div>" +
      (j.tk.latest.length ? '<div class="ptn-tk">' + j.tk.latest.map(function (t) { return '<div><span class="muted">' + tm(t.t) + "</span> " + (t.done ? "✅" : "⏳") + " " + esc(t.txt) + "</div>"; }).join("") + '<p class="muted">详细回复在 <a href="#/feedback/admin">工单后台</a>（需要站长口令）</p></div>' : "") +
      // 5. 计划
      '<h3 class="ad-h">🗺️ 开发计划</h3><div class="ptn-plan" id="ptn-plan">' + (j.plan.length ? j.plan.map(function (p, i) { return "<label" + (p.done ? ' class="done"' : "") + '><input type="checkbox" data-i="' + i + '"' + (p.done ? " checked" : "") + (j.canWrite ? "" : " disabled") + "> " + esc(p.t) + "</label>"; }).join("") : '<p class="muted">还没写计划' + (j.canWrite ? "，站长在下面加" : "") + "</p>") + "</div>" +
      (j.canWrite ? '<p class="ptn-cfg"><input id="ptn-plan-new" placeholder="加一条计划，回车保存" style="width:100%"></p>' : "") +
      '<div id="ptn-upd" class="ptn-upd"></div>' +
      '<p class="muted ptn-note">' + esc(j.note) + "</p></section>";
    A.app.innerHTML = h;
    fetch("/api/updates").then(function (r) { return r.json(); }).then(function (u) {
      var el = document.getElementById("ptn-upd"); if (!el || !A.isCurrent(rid)) return;
      el.innerHTML = '<h3 class="ad-h">🆕 最近上线</h3>' + (u.list || []).slice(0, 7).map(function (x) { return '<div><span class="muted">' + esc(x.d.slice(5)) + "</span> " + esc(x.t.slice(0, 70)) + (x.t.length > 70 ? "…" : "") + "</div>"; }).join("");
    }).catch(function () {});
    if (!j.canWrite) return;
    function post(body, st) {
      body.key = key();
      return fetch("/api/partner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (r) { if (r.error) throw new Error(r.error); if (st) st.textContent = " ✅ 已保存"; load(rid); }, function (e) { if (st) st.textContent = " ❌ " + (e.message || e); });
    }
    var cpb = document.getElementById("ptn-cpb");
    if (cpb) cpb.onclick = function () {
      var v = document.getElementById("ptn-cpa").textContent, ok = function () { cpb.textContent = "✅ 已复制，去钱包粘贴"; setTimeout(function () { cpb.textContent = "📋 点击复制中转地址"; }, 2500); };
      try { navigator.clipboard.writeText(v).then(ok, function () { prompt("长按复制：", v); }); } catch (e) { prompt("长按复制：", v); }
    };
    var so = document.getElementById("ptn-sort");
    if (so) { so.onclick = function (e) { var b = e.target && e.target.closest ? e.target.closest("button") : null; if (b) sortAddr(b.getAttribute("data-k")); }; if (adSort) sortAddr(adSort); }
    var ad = document.getElementById("ptn-adone");
    if (ad) ad.onclick = function () {
      var t = (j.split.parts || []).map(function (y) { return y.n + " " + y.p + "% ≈ " + fm(y.amt, 0) + " DAI"; }).join("\n");
      if (!confirm("确定已经按比例转完了？\n" + t + "\n\n确定后会给四个地址各发一条站内信通知。")) return;
      ad.disabled = true; post({ action: "allocDone" }, document.getElementById("ptn-ast"));
    };
    var cs = document.getElementById("ptn-cfg-save");
    if (cs) cs.onclick = function () { post({ cfg: { tech: Number(document.getElementById("ptn-tech").value) } }, document.getElementById("ptn-cfg-st")); };
    var plan = j.plan.slice();
    document.querySelectorAll("#ptn-plan input[data-i]").forEach(function (c) { c.onchange = function () { plan[+c.getAttribute("data-i")].done = c.checked; post({ plan: plan }); }; });
    var pn = document.getElementById("ptn-plan-new");
    if (pn) pn.onkeydown = function (e) { if (e.key === "Enter" && pn.value.trim()) { plan.push({ t: pn.value.trim(), done: false }); post({ plan: plan }); } };
  }

  function load(rid) {
    var k = key(); if (!k) return login(rid);
    A.app.innerHTML = '<section class="card"><p class="muted">读取中…</p></section>';
    var GN = { play: "销毁乐园", farm: "开心农场", pixel: "LGNS 像素墙", g2048: "2048", snake: "贪吃蛇", tetris: "俄罗斯方块", flappy: "飞翔小鸟", mines: "扫雷", brick: "打砖块", merge: "DNA 合成", pet: "HELIX 宠物" };
    function gamesLine() {
      fetch("/api/games-top").then(function (r) { return r.json(); }).then(function (j) {
        var el = document.getElementById("ptn-games"); if (!el) return;
        var rows = Object.keys(j.counts || {}).map(function (k) { return [GN[k] || k, j.counts[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
        el.innerHTML = rows.length ? rows.map(function (r, i) { return (i < 3 ? ["🥇", "🥈", "🥉"][i] : "·") + " <b>" + esc(r[0]) + "</b> " + r[1] + " 次"; }).join("　") : "还没有数据（从今天开始统计）";
      }).catch(function () {});
    }
    fetch("/api/partner?key=" + encodeURIComponent(k)).then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      if (j.error) { if (/口令/.test(j.error)) { try { localStorage.removeItem("ptnKey"); } catch (e) {} return login(rid, j.error); } A.app.innerHTML = '<section class="card"><p class="nm-bad">' + esc(j.error) + "</p></section>"; return; }
      render(rid, j);
      gamesLine();
    }, function (e) { if (A.isCurrent(rid)) A.app.innerHTML = '<section class="card"><p class="nm-bad">读取失败：' + esc(e.message || e) + "</p></section>"; });
  }
  A.pages.partner = function (rid) { load(rid); };
})();
