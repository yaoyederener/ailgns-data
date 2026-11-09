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
  function allocHtml(j) {
    var L = j.alloc || []; if (!L.length) return "";
    var tot = L.reduce(function (t, y) { return t + ((y.got && y.got.ail) || 0); }, 0);
    var lg = j.alloclog || [], tr = (j.split && j.split.transit) || {}, wait = tr.ail > 0.0001;
    var st = '<div class="ptn-cp"><div class="ptn-cpt">⚠️ 每次分配，先把 AiLGNS 转到这个地址</div><div class="ptn-cpa mono" id="ptn-cpa">' + esc(tr.a || "") + '</div><button type="button" class="nm-go ptn-cpb" id="ptn-cpb">📋 点击复制中转地址</button></div>' +
      '<div class="ptn-tr"><span>🔁 中转地址余额</span><b>' + (tr.ail == null ? "读取失败" : fm(tr.ail, 4) + " AiLGNS") + "</b>" + (tr.value ? '<small class="muted">≈ ' + fm(tr.value, 0) + " DAI</small>" : "") + '<a class="mono" href="#/scan/' + tr.a + '">链上记录 →</a></div><p class="muted">流程：谷歌社交账号钱包 → 转到这个中转地址 → 从中转地址按比例转到下面四个地址（只分 AiLGNS）。</p>' +
      '<div class="ptn-ast ' + (wait ? "wait" : "done") + '">' + (wait ? "<b>⏳ 等待分配</b><span>中转地址里还有 " + fm(tr.ail, 4) + " AiLGNS 没分</span>" : "<b>✅ 已分配</b><span>中转地址已转空</span>") +
      (j.canWrite ? '<button type="button" class="nm-go" id="ptn-adone">📣 我已分配，通知他们</button>' : "") + '<small class="muted" id="ptn-ast">' + (lg[0] ? "上次通知 " + tm(lg[0].t) + " · " + (lg[0].ail != null ? fm(lg[0].ail, 4) + " AiLGNS" : "≈ " + fm(lg[0].total, 0) + " DAI") : "") + "</small></div>";
    var hist = lg.length ? '<details class="ptn-ahist"><summary>📜 分配记录（' + lg.length + ' 次）</summary>' + lg.slice(0, 20).map(function (x) { return "<div><b>" + tm(x.t) + "</b> 合计 " + (x.ail != null ? fm(x.ail, 4) + " AiLGNS" : "≈ " + fm(x.total, 0) + " DAI") + "<small class=\"muted\"> · " + x.parts.map(function (y) { return esc(y.n) + " " + y.p + "% " + (y.ail != null ? fm(y.ail, 4) : fm(y.amt, 0)); }).join(" / ") + "</small></div>"; }).join("") + "</details>" : "";
    return '<h3 class="ad-h">💼 本次分配</h3>' + st + hist + '<h3 class="ad-h">📊 运营分配统计（中转地址实际转出的 AiLGNS 累计）</h3><div class="ptn-alloc">' + L.map(function (y) {
      var g = y.got || {}, real = tot ? Math.round(g.ail / tot * 1000) / 10 : 0;
      return '<div class="ptn-al"><div class="ptn-alh"><b>' + esc(y.n) + " " + y.p + '%</b><a class="mono" href="#/scan/' + y.a + '">' + y.a.slice(0, 6) + "…" + y.a.slice(-4) + " →</a></div>" +
        (g.err ? '<p class="muted">读取失败，稍后刷新</p>' : '<div class="ptn-alv"><span>已转 <b>' + fm(g.ail || 0, 4) + " AiLGNS</b></span><span>实际占比 <b" + (tot && Math.abs(real - y.p) > 5 ? ' class="warn"' : "") + ">" + real + "%</b></span><span>" + (g.n || 0) + " 笔</span></div>" +
        '<small class="muted">≈ ' + fm(g.value || 0, 0) + " DAI（按现价）" + (g.last ? " · 最近 " + tm(g.last) : "") + "</small>" + ((g.txs || []).length ? '<div class="ptn-atx">' + g.txs.map(function (x) { return '<a href="#/scan/' + x.h + '"><span>' + tm(x.t) + "</span><b>" + fm(x.v, 4) + " AiLGNS</b><small>查看转账 →</small></a>"; }).join("") + "</div>" : "")) + "</div>";
    }).join("") + '<p class="muted">四个地址合计已转 <b>' + fm(tot, 4) + ' AiLGNS</b>。「实际占比」和设定比例差 5% 以上会标红。</p></div>';
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
    var d0 = j.rows[0] || {}, d1 = j.rows[1] || {}, w7 = j.rows.slice(0, 7);
    var sum = function (k) { return w7.reduce(function (s, r) { return s + (r[k] || 0); }, 0); };
    var inV = function (r) { return r && r.in ? r.in.dai + r.in.ail * j.price : null; };
    var inSum = w7.reduce(function (s, r) { return s + (inV(r) || 0); }, 0);
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
      (j.bal.fast ? tile("⚡ 极速资金池（批量注册 90%，分开放）", "≈ " + fm(j.bal.fast.dai + j.bal.fast.ail * j.price, 0) + " DAI", fm(j.bal.fast.ail, 2) + " AiLGNS + " + fm(j.bal.fast.dai, 0) + " DAI") : "") +
      tile("触发钱包 Gas", fm(j.bal.keeper.dai, 1) + " DAI", j.bal.keeper.dai < 8 ? "⚠️ 低于 8 机器人会停" : "够用", j.bal.keeper.dai < 8 ? "warn" : "") +
      "</div>" +
      allocHtml(j) +
      // 3. 生意
      '<h3 class="ad-h">📈 今天的生意（今天 · 昨天 · 近 7 天合计）</h3><div class="ad-tw"><table class="ad-t ptn-t"><thead><tr><th></th><th>今天 ' + dayCn(d0.day) + "</th><th>昨天 " + dayCn(d1.day) + "</th><th>近 7 天</th></tr></thead><tbody>" +
      "<tr><td>OTC 成交额</td><td data-l=今天><b>" + fm(d0.fillDai, 0) + "</b> DAI · " + (d0.fills || 0) + " 笔</td><td data-l=昨天>" + fm(d1.fillDai, 0) + " · " + (d1.fills || 0) + " 笔</td><td data-l=近7天>" + fm(sum("fillDai"), 0) + " · " + sum("fills") + " 笔</td></tr>" +
      "<tr><td>域名销售</td><td data-l=今天><b>" + (d0.nmN || 0) + "</b> 个 · " + fm(d0.nmDai, 0) + " DAI</td><td data-l=昨天>" + (d1.nmN || 0) + " 个 · " + fm(d1.nmDai, 0) + "</td><td data-l=近7天>" + sum("nmN") + " 个 · " + fm(sum("nmDai"), 0) + "</td></tr>" +
      "<tr><td>会员付款</td><td data-l=今天><b>" + fm(d0.member, 0) + "</b> DAI</td><td data-l=昨天>" + fm(d1.member, 0) + "</td><td data-l=近7天>" + fm(sum("member"), 0) + "</td></tr>" +
      '<tr><td>估算收入<small>成交×1% + 域名 + 会员</small></td><td data-l=今天><b>' + fm(d0.income, 0) + "</b> DAI</td><td data-l=昨天>" + fm(d1.income, 0) + "</td><td data-l=近7天>" + fm(sum("income"), 0) + "</td></tr>" +
      '<tr class="ptn-real"><td>实际到账<small>链上真转进谷歌社交账号钱包的</small></td><td data-l=今天><b>' + (inV(d0) == null ? "—" : fm(inV(d0), 0)) + "</b> DAI</td><td data-l=昨天>" + (inV(d1) == null ? "—" : fm(inV(d1), 0)) + "</td><td data-l=近7天>" + fm(inSum, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      // 4. 客户
      '<h3 class="ad-h">🎮 本周游戏榜（近 7 天打开次数）</h3><p class="muted" id="ptn-games">读取中…</p>' +
      '<h3 class="ad-h">👥 客户</h3><div class="ad-tiles">' +
      tile("同时在线（5 分钟内打开）", (j.traffic ? j.traffic.now : 0) + " 人", "今天峰值 " + (j.traffic ? j.traffic.peak + "（" + j.traffic.peakAt + "）" : "—") + (j.traffic && j.traffic.peakY != null ? " · 昨天峰值 " + j.traffic.peakY + "（" + j.traffic.peakYAt + "）" : "") + " · 容量约 " + (j.cap ? j.cap.conc : "—"), j.traffic && j.cap && j.traffic.now >= j.cap.conc * 0.5 ? "warn" : "") +
      tile("今日访客", fm(d0.v, 0) + " 次", vs(d0.v, d1.v, " 次") + " · 首次 " + (d0.v1 || 0) + " 人（昨天 " + (d1.v1 || 0) + "）") +
      tile("App 装机", "今天 " + (d0.an || 0) + " 台", vs(d0.an, d1.an, " 台") + " · 累计 " + j.installs + " 台") +
      tile("工单", "今天 " + j.tk.today + " 张", (j.tk.yest != null ? vs(j.tk.today, j.tk.yest, " 张") + " · " : "") + (j.tk.open ? "⚠️ " + j.tk.open + " 张没回，最久等了 " + j.tk.oldestH + " 小时" : "全部回完") + (j.tk.avgH ? " · 平均 " + j.tk.avgH + " 小时回复" : ""), j.tk.open && j.tk.oldestH >= 2 ? "warn" : "") +
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
