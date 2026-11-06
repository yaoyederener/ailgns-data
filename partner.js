// 🤝 合伙人面板 #/partner：独立口令（PARTNER_KEY，站长口令也能进）。四屏：风险与建议 → 钱 → 今天的生意 → 客户 → 计划
// 数据来自 /api/partner（ops-watch 每 5 分钟算好）；只有站长口令能改分配比例和开发计划
(function () {
  var A = window.AIL, esc = A.esc || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function key() { try { return localStorage.getItem("ptnKey") || localStorage.getItem("fbKey") || ""; } catch (e) { return ""; } }
  function fm(v, d) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d }); }
  function tm(t) { var x = new Date(t + 8 * 3600e3); return (x.getUTCMonth() + 1) + "/" + x.getUTCDate() + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); }
  function dayCn(d) { return d ? Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10)) : ""; }
  var LV = { red: ["🔴", "马上处理"], yellow: ["🟡", "今天处理"], green: ["🟢", "知道就好"] };

  function login(rid, msg) {
    A.app.innerHTML = '<section class="card ptn-login"><h2>🤝 合伙人面板</h2><p class="muted">输入查看口令。合伙人只能看，站长口令还能改分配比例和计划。</p>' +
      (msg ? '<p class="nm-bad">' + esc(msg) + "</p>" : "") +
      '<input id="ptn-k" type="password" placeholder="口令" autocomplete="current-password"><button type="button" class="nm-go" id="ptn-go">进入</button></section>';
    var go = document.getElementById("ptn-go"), inp = document.getElementById("ptn-k");
    go.onclick = function () { var v = inp.value.trim(); if (!v) return; try { localStorage.setItem("ptnKey", v); } catch (e) {} load(rid); };
    inp.onkeydown = function (e) { if (e.key === "Enter") go.click(); };
  }

  function tile(label, val, sub, cls) { return '<div class="ad-tile' + (cls ? " " + cls : "") + '"><small>' + label + "</small><b>" + val + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>"; }

  function render(rid, j) {
    var d0 = j.rows[0] || {}, d1 = j.rows[1] || {}, w7 = j.rows.slice(0, 7);
    var sum = function (k) { return w7.reduce(function (s, r) { return s + (r[k] || 0); }, 0); };
    var inV = function (r) { return r && r.in ? r.in.dai + r.in.ail * j.price : null; };
    var inSum = w7.reduce(function (s, r) { return s + (inV(r) || 0); }, 0);
    var b = j.bal.src;
    var h = '<section class="card ptn-top"><div class="card-head"><h2>🤝 合伙人面板</h2><span class="muted">' + tm(j.at) + " 更新 · 每 5 分钟</span></div>" +
      // 1. 风险与建议
      '<h3 class="ad-h">🚦 风险与建议（按优先级，上面的先做）</h3><div class="ptn-risks">' + j.risks.map(function (r) {
        return '<div class="ptn-risk ' + r.level + '"><div class="ptn-rh">' + LV[r.level][0] + " <b>" + esc(r.title) + '</b><i>' + LV[r.level][1] + " · " + esc(r.who) + "</i></div><p>" + esc(r.why) + '</p><p class="ptn-todo">👉 ' + esc(r.todo) + "</p></div>";
      }).join("") + "</div>" +
      // 2. 钱
      '<h3 class="ad-h">💰 钱（当前余额，不是历史累计）</h3><div class="ad-tiles">' +
      tile("待分配余额（收款钱包）", fm(j.split.total, 0) + " DAI", "Anubis DAI " + fm(b.dai, 0) + " + Polygon DAI " + fm(b.pdai, 0) + " + AiLGNS " + fm(b.ail, 2) + "（≈ " + fm(b.ail * j.price, 0) + "）", "big money") +
      tile("技术费用 " + j.cfg.tech + "%", fm(j.split.tech, 0) + " DAI", "", "money") +
      tile("销售费用 " + j.cfg.sales + "%", fm(j.split.sales, 0) + " DAI", "", "money") +
      tile("另有 LGNS（未折算）", fm(b.lgns, 0) + " + " + fm(b.plgns, 0), "Anubis + Polygon") +
      tile("奖池（客户的奖金，是负债）", "≈ " + fm(j.pool.value, 0) + " DAI", fm(j.pool.ail, 2) + " AiLGNS + " + fm(j.pool.dai, 0) + " DAI") +
      tile("触发钱包 Gas", fm(j.bal.keeper.dai, 1) + " DAI", j.bal.keeper.dai < 8 ? "⚠️ 低于 8 机器人会停" : "够用", j.bal.keeper.dai < 8 ? "warn" : "") +
      "</div>" +
      (j.canWrite ? '<p class="muted ptn-cfg">分配比例（站长可改）：技术 <input id="ptn-tech" type="number" min="0" max="100" value="' + j.cfg.tech + '" style="width:60px"> % ，销售 = 100 − 技术 <button type="button" class="ghost" id="ptn-cfg-save">保存</button><span id="ptn-cfg-st"></span></p>' : "") +
      // 3. 生意
      '<h3 class="ad-h">📈 今天的生意（今天 · 昨天 · 近 7 天合计）</h3><div class="ad-tw"><table class="ad-t ptn-t"><thead><tr><th></th><th>今天 ' + dayCn(d0.day) + "</th><th>昨天 " + dayCn(d1.day) + "</th><th>近 7 天</th></tr></thead><tbody>" +
      "<tr><td>OTC 成交额</td><td><b>" + fm(d0.fillDai, 0) + "</b> DAI · " + (d0.fills || 0) + " 笔</td><td>" + fm(d1.fillDai, 0) + " · " + (d1.fills || 0) + " 笔</td><td>" + fm(sum("fillDai"), 0) + " · " + sum("fills") + " 笔</td></tr>" +
      "<tr><td>域名销售</td><td><b>" + (d0.nmN || 0) + "</b> 个 · " + fm(d0.nmDai, 0) + " DAI</td><td>" + (d1.nmN || 0) + " 个 · " + fm(d1.nmDai, 0) + "</td><td>" + sum("nmN") + " 个 · " + fm(sum("nmDai"), 0) + "</td></tr>" +
      "<tr><td>会员付款</td><td><b>" + fm(d0.member, 0) + "</b> DAI</td><td>" + fm(d1.member, 0) + "</td><td>" + fm(sum("member"), 0) + "</td></tr>" +
      '<tr><td>估算收入<small>成交×1% + 域名 + 会员</small></td><td><b>' + fm(d0.income, 0) + "</b> DAI</td><td>" + fm(d1.income, 0) + "</td><td>" + fm(sum("income"), 0) + "</td></tr>" +
      '<tr class="ptn-real"><td>实际到账<small>链上真转进收款钱包的</small></td><td><b>' + (inV(d0) == null ? "—" : fm(inV(d0), 0)) + "</b> DAI</td><td>" + (inV(d1) == null ? "—" : fm(inV(d1), 0)) + "</td><td>" + fm(inSum, 0) + "</td></tr>" +
      "</tbody></table></div>" +
      // 4. 客户
      '<h3 class="ad-h">👥 客户</h3><div class="ad-tiles">' +
      tile("今日访客", fm(d0.v, 0) + " 次", (d0.v1 || 0) + " 人首次 · 昨天 " + fm(d1.v, 0)) +
      tile("App 装机", "今天 " + (d0.an || 0) + " 台", "累计 " + j.installs + " 台（11-07 起统计）") +
      tile("工单", "今天 " + j.tk.today + " 张", (j.tk.open ? "⚠️ " + j.tk.open + " 张没回，最久等了 " + j.tk.oldestH + " 小时" : "全部回完") + (j.tk.avgH ? " · 平均 " + j.tk.avgH + " 小时回复" : ""), j.tk.open && j.tk.oldestH >= 2 ? "warn" : "") +
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
    fetch("/api/partner?key=" + encodeURIComponent(k)).then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      if (j.error) { if (/口令/.test(j.error)) { try { localStorage.removeItem("ptnKey"); } catch (e) {} return login(rid, j.error); } A.app.innerHTML = '<section class="card"><p class="nm-bad">' + esc(j.error) + "</p></section>"; return; }
      render(rid, j);
    }, function (e) { if (A.isCurrent(rid)) A.app.innerHTML = '<section class="card"><p class="nm-bad">读取失败：' + esc(e.message || e) + "</p></section>"; });
  }
  A.pages.partner = function (rid) { load(rid); };
})();
