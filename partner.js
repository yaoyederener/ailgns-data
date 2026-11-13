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
    var st = (j.canWrite ? '<div class="ptn-cp"><div class="ptn-cpt">⚠️ 每次分配，先把 AiLGNS 转到这个地址</div><div class="ptn-cpa mono" id="ptn-cpa">' + esc(tr.a || "") + '</div><button type="button" class="nm-go ptn-cpb" id="ptn-cpb">📋 点击复制中转地址</button></div>' : "") +
      '<div class="ptn-tr"><span>🔁 中转地址余额</span><b>' + (tr.ail == null ? "读取失败" : fm(tr.ail, 4) + " AiLGNS") + "</b>" + (tr.value ? '<small class="muted">≈ ' + fm(tr.value, 0) + " DAI</small>" : "") + '<a class="mono" href="#/scan/' + tr.a + '">链上记录 →</a></div><p class="muted">流程：谷歌社交账号钱包 → 转到这个中转地址 → 从中转地址按比例转到下面四个地址（只分 AiLGNS）。</p>' +
      '<div class="ptn-ast ' + (wait ? "wait" : "done") + '">' + (wait ? "<b>⏳ 等待分配</b><span>中转地址里还有 " + fm(tr.ail, 4) + " AiLGNS 没分</span>" : "<b>✅ 已分配</b><span>中转地址已转空</span>") +
      (j.canWrite ? '<button type="button" class="nm-go" id="ptn-adone">📣 我已分配，通知他们</button>' : "") + '<small class="muted" id="ptn-ast">' + (lg[0] ? "上次通知 " + tm(lg[0].t) + " · " + (lg[0].ail != null ? fm(lg[0].ail, 4) + " AiLGNS" : "≈ " + fm(lg[0].total, 0) + " DAI") : "") + "</small></div>";
    var hist = lg.length ? '<details class="ptn-ahist"><summary>📜 分配记录（' + lg.length + ' 次）</summary>' + lg.slice(0, 20).map(function (x) { return "<div><b>" + tm(x.t) + "</b> 合计 " + (x.ail != null ? fm(x.ail, 4) + " AiLGNS" : "≈ " + fm(x.total, 0) + " DAI") + "<small class=\"muted\"> · " + x.parts.map(function (y) { return esc(y.n) + " " + y.p + "% " + (y.ail != null ? fm(y.ail, 4) : fm(y.amt, 0)); }).join(" / ") + "</small></div>"; }).join("") + "</details>" : "";
    return st + hist + '<details class="ptn-ald"><summary>📊 运营分配统计（中转地址累计已转 ' + fm(tot, 4) + ' AiLGNS）</summary><div class="ptn-alloc">' + L.map(function (y) {
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
      if (Math.abs(o.dai) >= 0.005) a.push('<b>' + fm(o.dai, Math.abs(o.dai) >= 100 ? 0 : 2) + "</b> DAI");
      if (Math.abs(o.ail) >= 0.00005) a.push('<b>' + fm(o.ail, 4) + "</b> AiLGNS");
      if (Math.abs(o.lgns) >= 0.5) a.push('<b>' + fm(o.lgns, 0) + "</b> LGNS");
      return a.length ? a.join(" + ") : "<b>0</b>";
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
    var PS = w7.map(parts), SUM = PS.reduce(function (S, P) {
      if (!P) return S;
      GK.forEach(function (g) { TK.forEach(function (t) { S[g][t] += P[g][t]; }); });
      S.memN += P.memN; S.usd += P.usd; S.othN += P.othN; S.k++;
      return S;
    }, { otc: Z(), nm: Z(), pool: Z(), mem: Z(), oth: Z(), all: Z(), memN: 0, usd: 0, othN: 0, k: 0 });
    var flWait = j.flLag > 3000 ? Math.ceil(j.flLag / 29400) * 5 : 0; // 后台每 5 分钟补 6 段 × 4900 块
    /* 站长 2026-11-13：股东版——一句话 + 三小卡 + 4 列表。三种币按当天 OTC 最后成交价折成 DAI 一个数（估值，带 ≈），真实到手的三种币点开那天看 */
    var PXN = j.pxNow || { ail: j.price || 0, lgns: 0 };
    var conv = function (o, px) { return (o.dai || 0) + (o.ail || 0) * px.ail + (o.lgns || 0) * px.lgns; };
    var CK = ["otc", "nm", "mem", "oth"], CN = { otc: "OTC 手续费", nm: "域名", mem: "会员", oth: "其它" };
    var DV = w7.map(function (r, i) { /* 每天折成 DAI：合计 + 四个来源 */
      var P = PS[i]; if (!P) return null;
      var p = r.px || {}, px = { ail: p.ail || PXN.ail || 0, lgns: p.lgns || PXN.lgns || 0 };
      var o = { all: conv(P.all, px), px: px, est: !r.px || !!p.e, miss: px.lgns ? 0 : P.all.lgns };
      CK.forEach(function (k) { o[k] = conv(P[k], px); });
      return o;
    });
    var W = DV.reduce(function (S, o) { if (!o) return S; S.all += o.all; S.miss += o.miss; S.k++; if (o.est) S.est = 1; CK.forEach(function (k) { S[k] += o[k]; }); return S; }, { all: 0, otc: 0, nm: 0, mem: 0, oth: 0, miss: 0, k: 0, est: 0 });
    var ap = function (v) { return "≈ " + fm(v, 0) + " DAI"; }, estTag = '<em class="ptn-est">估</em>';
    var arrow = function (t, y) { if (!(y > 0)) return ""; var d = Math.round((t - y) / y * 100); return d === 0 ? "，和前天差不多" : '，比前天 <i class="' + (d > 0 ? "up" : "down") + '">' + (d > 0 ? "↑" : "↓") + Math.abs(d) + "%</i>"; };
    var hero = '<div class="ptn-hero"><small>今天到现在，真留下来的钱（三种币折成 DAI）</small><b class="big">' + (DV[0] ? ap(DV[0].all) : "—") + "</b>" +
      "<p>昨天全天 <b>" + (DV[1] ? ap(DV[1].all) : "—") + "</b>" + (DV[1] && DV[2] ? arrow(DV[1].all, DV[2].all) : "") + "</p>" +
      "<p>近 " + (W.k || 7) + " 天 <b>" + (W.k ? ap(W.all) : "—") + "</b></p>" +
      (W.miss > 0.5 ? '<p class="muted">另有 ' + fm(W.miss, 0) + " LGNS 还没有成交价，没折进去</p>" : "") + "</div>";
    var bars = function (k) { /* 7 根小柱：左边最早，最右是今天（没过完，颜色浅） */
      var a = w7.map(function (r) { return r[k] || 0; }), mx = Math.max.apply(null, a.concat([1]));
      return '<div class="ptn-bars">' + a.map(function (v, i) { return "<i" + (i === 0 ? ' class="now"' : "") + ' style="height:' + Math.max(4, Math.round(v / mx * 100)) + '%" title="' + dayCn(w7[i].day) + " " + fm(v, 0) + '"></i>'; }).reverse().join("") + "</div>";
    };
    var shareTot = CK.reduce(function (t, k) { return t + Math.max(0, W[k]); }, 0);
    var share = shareTot > 0 ? '<div class="ptn-share">' + CK.map(function (k) { var p = Math.max(0, W[k]) / shareTot * 100; return p >= 0.5 ? '<i class="s-' + k + '" style="width:' + p.toFixed(1) + '%"></i>' : ""; }).join("") + '</div><div class="ptn-lg">' +
      CK.map(function (k) { return '<span><i class="s-' + k + '"></i>' + CN[k] + " <b>" + Math.round(Math.max(0, W[k]) / shareTot * 100) + "%</b></span>"; }).join("") + "</div>" : '<p class="muted">正在从链上补</p>';
    var cards = '<div class="ptn-c3"><div class="ptn-c"><small>钱从哪来（近 ' + (W.k || 7) + " 天留存）</small>" + share + "</div>" +
      '<div class="ptn-c"><small>生意大不大 · OTC 成交额</small><b>' + fm(d0.fillDai, 0) + " <span>DAI 今天</span></b>" + bars("fillDai") + "<small>昨天 " + fm(d1.fillDai, 0) + "</small></div>" +
      '<div class="ptn-c"><small>人多不多 · 第一次来的人</small><b>' + fm(d0.v1, 0) + " <span>人 今天</span></b>" + bars("v1") + "<small>昨天 " + fm(d1.v1, 0) + " 人</small></div></div>";
    var row = function (lab, val) { return "<p><span>" + lab + "</span><span>" + val + "</span></p>"; };
    var detail = function (P, o, fills, nmN, extra) { /* 点开一天：真实到手的三种币 + 明细 */
      if (!P) return '<div class="ptn-dd">' + row("留存", "正在从链上补") + extra + "</div>";
      return '<div class="ptn-dd">' +
        row("OTC 手续费", tk(P.otc) + "<small>" + (fills || 0) + " 笔成交</small>") +
        row("域名留存", tk(P.nm) + "<small>卖 " + (nmN || 0) + " 个 · 已转奖池 " + fm(P.pool.dai, 0) + " DAI</small>") +
        row("会员费", tk(P.mem) + (P.memN ? "<small>" + P.memN + " 笔 · 合 " + fm(P.usd, 0) + " 美元</small>" : "")) +
        row("其它", tk(P.oth) + (P.othN ? "<small>" + P.othN + " 笔</small>" : "")) +
        row("真实到手合计", tk(P.all)) +
        (o ? row("折算用的价", "1 AiLGNS ≈ " + fm(o.px.ail, 0) + " DAI" + (o.px.lgns ? " · 1 LGNS ≈ " + fm(o.px.lgns, 4) + " DAI" : " · LGNS 暂无成交价") + "<small>" + (o.est ? "没存到当天的价，按后来的价估算" : "当天 OTC 最后一笔成交价") + "</small>") : "") +
        extra + "</div>";
    };
    var pkOf = function (r, i) { return r.pk || (i === 0 && j.traffic ? j.traffic.peak : 0) || 0; };
    var list = '<div class="ptn-l"><div class="ptn-lh"><span>日期</span><span>留存 ≈DAI</span><span>OTC 成交额</span><span>来访人</span></div>' +
      w7.map(function (r, i) {
        var o = DV[i], wk = r.day ? "周" + "日一二三四五六".charAt(new Date(r.day + "T00:00:00Z").getUTCDay()) : "", pk = pkOf(r, i);
        return '<details class="ptn-day' + (i === 0 ? " now" : "") + '"><summary><span>' + (i === 0 ? "今天 " : i === 1 ? "昨天 " : "") + dayCn(r.day) + (i > 1 ? " <small>" + wk + "</small>" : "") + '</span><span class="m">' + (o ? fm(o.all, 0) + (o.est ? estTag : "") : "—") + "</span><span>" + fm(r.fillDai, 0) + "</span><span>" + fm(r.v1, 0) + "</span></summary>" +
          detail(PS[i], o, r.fills, r.nmN, row("来访", fm(r.v, 0) + " 次打开 · App 装机 " + (r.an || 0) + " 台" + (pk ? " · 在线峰值 " + pk + " 人" : ""))) + "</details>";
      }).join("") +
      '<details class="ptn-day sum"><summary><span>近 7 天' + (SUM.k && SUM.k < w7.length ? " <small>留存 " + SUM.k + " 天</small>" : "") + '</span><span class="m">' + (W.k ? fm(W.all, 0) + (W.est ? estTag : "") : "—") + "</span><span>" + fm(sum("fillDai"), 0) + "</span><span>" + fm(sum("v1"), 0) + "</span></summary>" +
      detail(SUM.k ? SUM : null, null, sum("fills"), sum("nmN"), row("来访", fm(sum("v"), 0) + " 次打开 · App 装机 " + sum("an") + " 台 · 在线最高 " + w7.reduce(function (m, r, i) { return Math.max(m, pkOf(r, i)); }, 0) + " 人")) + "</details></div>";
    var biz = '<h3 class="ad-h">📊 股东面板（近 7 天）</h3>' + hero + cards + list +
      '<p class="muted ptn-dn">👆 点某一天，看那天真实收到的三种币和明细。今天还没过完。' + (W.est ? "带「估」的日子没存到当天的价，是按后来的价估的。" : "") + "</p>" +
      (flWait ? '<p class="muted ptn-dn">⏳ 前几天的数正在从链上一笔一笔补，大约 ' + flWait + " 分钟补齐，没补到的日子先显示「—」。</p>" : "") +
      '<details class="ptn-how"><summary>这些数怎么算的</summary><p class="muted ptn-dn">留存 = 真留在谷歌社交账号钱包里的钱，从链上一笔一笔数出来，不是算出来的毛收入。为了一眼看懂，把收到的 DAI、AiLGNS、LGNS 按当天 OTC 最后一笔成交价折成 DAI 一个数（带 ≈ 的都是折算，是估值，不是真换成了 DAI）；真实收到的三种币各多少，点开那一天看。当天的价存下来以后不再变，过去的日子不会跟着币价动。OTC 手续费 = 每笔成交时托管合约转进钱包的手续费（买卖两边收的币不一样，所以有 DAI、AiLGNS、LGNS）。域名留存 = 域名的钱转进钱包的数，减掉转给预言家奖池 / 极速资金池的数（那是客户的奖金，不是我们的）。会员费 = 会员页开通 / 升级实际收到的币。其它 = 外面的钱包直接转进来的钱（游戏充值等）和像素墙收入。不算收入的：自己挂单的本金进出、自己换币、撤单退回、自己钱包之间互转。给客户的退款、分出去和提走的钱没有从这里减。来访人 = 第一次打开网站的人。</p></details>';
    var b = j.bal.src;
    /* 💼 分配比例：现在待分配多少、每人按比例应分多少（一行一个人） */
    var ratio = '<h3 class="ad-h">💼 分配比例</h3><div class="ptn-l">' +
      '<div class="ptn-rr top"><span><b>现在待分配</b><small>谷歌社交账号钱包里的 AiLGNS + DAI</small></span><span class="m">≈ ' + fm(j.split.total, 0) + " DAI<small>折 " + (j.price ? fm(j.split.total / j.price, 4) : "—") + " AiLGNS</small></span></div>" +
      (j.split.parts || []).map(function (y) { return '<div class="ptn-rr"><span><b>' + esc(y.n) + " " + y.p + '%</b><small><a class="mono" href="#/scan/' + y.a + '">' + y.a.slice(0, 6) + "…" + y.a.slice(-4) + '</a></small></span><span class="m">≈ ' + fm(y.amt, 0) + " DAI<small>" + fm(y.ail || 0, 4) + " AiLGNS</small></span></div>"; }).join("") +
      '</div><p class="muted ptn-dn">待分配里有 AiLGNS ' + fm(b.ail, 4) + " + DAI " + fm(b.dai + b.pdai, 0) + "（Anubis " + fm(b.dai, 0) + " + Polygon " + fm(b.pdai, 0) + "），按现价 " + fm(j.price, 0) + " 折算，LGNS 不算在内。" + (j.split.basis === "transit" ? "中转地址里有币，上面每人应分的数按中转地址余额算。" : "") + "分的时候只分 AiLGNS。</p>";
    var h = '<section class="card ptn-top"><div class="card-head"><h2>🤝 合伙人面板</h2><span class="muted">' + tm(j.at) + " 更新 · 每 5 分钟</span></div>" +
      (j.canWrite ? '<div class="ad-nav"><a href="#/feedback/admin" class="ad-nb">📮 工单</a><a href="#/partner" class="ad-nb on">📊 数据面板</a><a href="#/ops" class="ad-nb">🛠️ 网站优化</a><a href="#/todo" class="ad-nb">📝 待办</a><a href="#/med" class="ad-nb">💊 吃药</a></div>' : "") +
      // 风险与建议移到「网站优化」页（#/ops），这里不再重复
      /* 站长 2026-11-13：股东面板放最上面，其次分配比例；其余按「钱 → 客户 → 游戏 → 计划 → 地址」往下排，地址表放最后 */
      biz +
      ratio +
      allocHtml(j) +
      '<h3 class="ad-h">💰 其它余额（现在钱包里有的，不是收入）</h3><div class="ad-tiles">' +
      tile("奖池（客户的奖金，是负债）", "≈ " + fm(j.pool.value, 0) + " DAI", fm(j.pool.ail, 2) + " AiLGNS + " + fm(j.pool.dai, 0) + " DAI") +
      (j.bal.fast ? tile("⚡ 极速资金池（暂停进账，留给极速预言家）", "≈ " + fm(j.bal.fast.dai + j.bal.fast.ail * j.price, 0) + " DAI", fm(j.bal.fast.ail, 2) + " AiLGNS + " + fm(j.bal.fast.dai, 0) + " DAI") : "") +
      tile("钱包里的 LGNS（没算进待分配）", fm(b.lgns, 0) + " + " + fm(b.plgns, 0), "Anubis + Polygon") +
      tile("触发钱包 Gas", fm(j.bal.keeper.dai, 1) + " DAI", j.bal.keeper.dai < 8 ? "⚠️ 低于 8 机器人会停" : "够用", j.bal.keeper.dai < 8 ? "warn" : "") +
      "</div>" +
      '<h3 class="ad-h">👥 客户</h3><div class="ad-tiles">' +
      tile("同时在线（5 分钟内打开）", (j.traffic ? j.traffic.now : 0) + " 人", "今天峰值 " + (j.traffic ? j.traffic.peak + "（" + j.traffic.peakAt + "）" : "—") + (j.traffic && j.traffic.peakY != null ? " · 昨天 " + j.traffic.peakY + "（" + j.traffic.peakYAt + "）" : "") + (j.traffic && j.traffic.peakY2 ? " · 前天 " + j.traffic.peakY2 + "（" + j.traffic.peakY2At + "）" : "") + " · 容量约 " + (j.cap ? j.cap.conc : "—"), j.traffic && j.cap && j.traffic.now >= j.cap.conc * 0.5 ? "warn" : "") +
      tile("今日访客", fm(d0.v, 0) + " 次", vs(d0.v, d1.v, " 次") + " · 前天 " + fm(d2.v, 0) + " 次 · 首次 " + (d0.v1 || 0) + " 人（昨天 " + (d1.v1 || 0) + " · 前天 " + (d2.v1 || 0) + "）") +
      tile("App 装机", "今天 " + (d0.an || 0) + " 台", vs(d0.an, d1.an, " 台") + " · 前天 " + (d2.an || 0) + " 台 · 累计 " + j.installs + " 台") +
      tile("工单", "今天 " + j.tk.today + " 张", (j.tk.yest != null ? vs(j.tk.today, j.tk.yest, " 张") + (j.tk.yest2 != null ? " · 前天 " + j.tk.yest2 + " 张" : "") + " · " : "") + (j.tk.open ? "⚠️ " + j.tk.open + " 张没回，最久等了 " + j.tk.oldestH + " 小时" : "全部回完") + (j.tk.avgH ? " · 平均 " + j.tk.avgH + " 小时回复" : ""), j.tk.open && j.tk.oldestH >= 2 ? "warn" : "") +
      "</div>" +
      (j.tk.latest.length ? '<div class="ptn-tk">' + j.tk.latest.map(function (t) { return '<div><span class="muted">' + tm(t.t) + "</span> " + (t.done ? "✅" : "⏳") + " " + esc(t.txt) + "</div>"; }).join("") + '<p class="muted">详细回复在 <a href="#/feedback/admin">工单后台</a>（需要站长口令）</p></div>' : "") +
      '<h3 class="ad-h">🎮 本周游戏榜（近 7 天打开次数）</h3><p class="muted" id="ptn-games">读取中…</p>' +
      // 5. 计划
      '<h3 class="ad-h">🗺️ 开发计划</h3><div class="ptn-plan" id="ptn-plan">' + (j.plan.length ? j.plan.map(function (p, i) { return "<label" + (p.done ? ' class="done"' : "") + '><input type="checkbox" data-i="' + i + '"' + (p.done ? " checked" : "") + (j.canWrite ? "" : " disabled") + "> " + esc(p.t) + "</label>"; }).join("") : '<p class="muted">还没写计划' + (j.canWrite ? "，站长在下面加" : "") + "</p>") + "</div>" +
      (j.canWrite ? '<p class="ptn-cfg"><input id="ptn-plan-new" placeholder="加一条计划，回车保存" style="width:100%"></p>' : "") +
      '<div id="ptn-upd" class="ptn-upd"></div>' +
      addrTable(j) +
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
