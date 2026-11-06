// 💧 做市返佣页 #/lp（站长 2026-11-06 定）：规则一页纸 · 我的返佣 · 一键铺双边单 · 返佣榜。撮合还是 OTC 合约，这里只是帮客户算账 + 一键下两张限价单
(function () {
  "use strict";
  var A = window.AIL, K = function () { return A.otcKit; };
  var SEL = { create: "0x9128a740", approve: "0x095ea7b3" }, MAX_UINT = (1n << 256n) - 1n;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function f(v, d) { return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }); }
  function toWei(s, d) { s = String(s || "0").trim(); if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return 0n; var p = s.split("."), a = p[0] || "0", b = (p[1] || "").slice(0, d).padEnd(d, "0"); return BigInt(a) * 10n ** BigInt(d) + BigInt(b || "0"); }
  var account = null, rid = 0, mkt = 0, M, OTC, TOKEN, DAI, TD, SYM, R = { FEE: 0.01, SHARE: 0.7 };

  // 站长 2026-11-06：先不开放给客户，优化好再说。默认显示「待开放」页；内部测试在浏览器控制台 localStorage.lpdev="1" 后可看完整页
  function soon(id) {
    A.app.innerHTML = '<section class="card lp-hero lp-soon"><div class="lp-ht"><h2>💧 做市返佣 <span class="lp-tag">即将开放</span></h2>' +
      '<p>在本站 OTC 挂单，有人吃你的单，<b>吃单方付的 1% 手续费，70% 返给挂单方</b>，每天自动结算到你钱包。挂单即参与，不用报名，资金全程在你自己的钱包和 OTC 合约里。</p>' +
      '<p class="muted">正在做最后的打磨和安全测试，开放时间会在「☰ 更多 → 服务 → 更新日志」和收件箱通知。现在在 OTC 正常挂单不受影响。</p></div>' +
      '<div class="lp-kpi"><div><small>返佣比例</small><b>70%</b><span>手续费的 70% 归挂单方</span></div><div><small>结算</small><b>每天</b><span>北京时间 0 点后结算前一天</span></div><div><small>资金</small><b>全程自管</b><span>随时撤单，不托管</span></div></div>' +
      '<p style="margin-top:14px"><a class="nm-go" href="#/trade">先去交易所盘口挂单 →</a></p></section>';
  }
  function page(id) {
    rid = id;
    var dev = false; try { dev = localStorage.getItem("lpdev") === "1"; } catch (e) {}
    if (!dev) return soon(id);
    M = K().M(); if (M.otc !== "0x4e730be6d46be71223ded5a32dc45799f6d4bc15") { K().useMarket("ailgns"); M = K().M(); }
    OTC = M.otc; TOKEN = M.token; DAI = M.dai; TD = M.dec; SYM = M.sym;
    A.app.innerHTML =
      '<section class="card lp-hero"><div class="lp-ht"><h2>💧 做市返佣</h2><p>在本站 OTC 挂单，有人吃你的单，<b>吃单方付的 1% 手续费，70% 返给你</b>。挂单即参与，不用报名；每天自动结算到你钱包。</p></div>' +
        '<div class="lp-kpi"><div><small>返佣比例</small><b>70%</b><span>手续费的 70% 归挂单方</span></div><div><small>结算</small><b>每天</b><span>北京时间 0 点后结算前一天</span></div><div><small>资金</small><b>全程自管</b><span>你的币只在 OTC 合约里，随时撤单</span></div></div></section>' +
      '<section class="card"><div class="card-head"><h2>📒 我的返佣</h2><button type="button" class="ghost" id="lp-conn">连接钱包</button></div><div id="lp-me"><p class="muted">连接钱包后显示今天 / 累计 / 待发放</p></div></section>' +
      '<section class="card lp-mk"><div class="card-head"><h2>⚡ 一键铺双边单</h2><span class="muted">同时挂一张买单、一张卖单</span></div>' +
        '<p class="muted">围绕中间价各挂一张限价单：买单压 DAI，卖单压 ' + SYM + '。谁吃了你的单你就赚价差 + 返佣；没人吃就原封不动退回，随时可撤。</p>' +
        '<div class="lp-grid"><label>中间价 (DAI)<input id="lp-mid" inputmode="decimal"></label><label>价差 (%)<input id="lp-sp" inputmode="decimal" value="1"></label><label>每边金额 (DAI)<input id="lp-amt" inputmode="decimal" value="100"></label><label>有效期<select id="lp-dur">' + K().DURATIONS.map(function (d) { return '<option value="' + d[0] + '"' + (d[0] === K().DUR_DEFAULT ? " selected" : "") + ">" + d[1] + "</option>"; }).join("") + "</select></label></div>" +
        '<div class="lp-prev" id="lp-prev"></div><p class="muted nm-st" id="lp-st"></p>' +
        '<button type="button" class="nm-go" id="lp-go">⚡ 铺单（钱包确认 2 笔，首次多 2 笔授权）</button>' +
        '<p class="muted lp-note">⚠️ 做市有价格风险：币价单边大涨大跌时，你一边的单会被吃掉、另一边留着。小额、价差别太窄、勤看。这不是理财，也不保本。</p></section>' +
      '<section class="card"><div class="card-head"><h2>🏆 返佣榜</h2><span class="seg lp-seg"><button type="button" class="on" data-r="today">今天</button><button type="button" data-r="week">7 天</button></span></div><div id="lp-board"><p class="muted">读取中…</p></div></section>' +
      '<section class="card lp-rules"><h2>📜 规则（一页纸）</h2><ol>' +
        '<li>范围：本站 <b>AiLGNS / DAI</b> OTC 市场的挂单（限价单），买单卖单都算。</li>' +
        '<li>算法：你的单每被吃掉一笔，返佣 = <b>成交 DAI × 1% × 70%</b>（例：成交 1,000 DAI → 返 7 DAI）。按 DAI 价值计，以 DAI 发放。</li>' +
        '<li>结算：每天北京时间 0 点后自动结算前一天，转到挂单钱包；不足 1 DAI 累计到下一天。链上可查。</li>' +
        '<li>不改合约、不碰你的币、不保本：挂单、撤单、成交全在原 OTC 合约里，和平时一样。</li>' +
        '<li>刷量无效：自己吃自己的单（同一钱包 / 明显关联钱包）不计返佣；发现作弊取消资格。</li>' +
        '<li>平台留 30% 覆盖 Gas、服务器和运营；规则如有调整会提前在更新日志公示，已产生的返佣不受影响。</li></ol></section>';
    bind();
    load();
    K().silentAccount().then(function () { account = K().account(); if (account) after(); });
  }
  function bind() {
    document.getElementById("lp-conn").onclick = function () { K().connect().then(function (a) { account = a; after(); }, function (e) { A.errTip(K().niceError(e), document.getElementById("lp-conn")); }); };
    ["lp-mid", "lp-sp", "lp-amt"].forEach(function (i) { document.getElementById(i).oninput = preview; });
    document.querySelectorAll(".lp-seg button").forEach(function (b) { b.onclick = function () { document.querySelectorAll(".lp-seg button").forEach(function (x) { x.classList.toggle("on", x === b); }); board(b.getAttribute("data-r")); }; });
    document.getElementById("lp-go").onclick = place;
  }
  var data = null;
  function load() {
    fetch("/api/book?m=ailgns").then(function (r) { return r.json(); }).then(function (j) {
      if (j.reserves) { var w = j.reserves.slice(2).match(/.{64}/g); mkt = (Number(BigInt("0x" + w[1])) / 1e18) / (Number(BigInt("0x" + w[0])) / Math.pow(10, TD)); }
      var mi = document.getElementById("lp-mid"); if (mi && !mi.value && mkt) { mi.value = mkt.toFixed(2); preview(); }
    }).catch(function () {});
    return fetch("/api/lp" + (account ? "?a=" + account : "")).then(function (r) { return r.json(); }).then(function (j) { if (!A.isCurrent(rid)) return; data = j; if (j.rules) R = j.rules; board("today"); if (j.me) me(j.me); });
  }
  function after() { var c = document.getElementById("lp-conn"); if (c) c.textContent = A.short(account); load(); }
  function me(m) {
    var el = document.getElementById("lp-me"); if (!el) return;
    el.innerHTML = '<div class="lp-kpi lp-me"><div><small>今天</small><b>' + f(m.today.rb, 4) + ' DAI</b><span>' + m.today.n + ' 笔 · 成交 ' + f(m.today.dai, 0) + ' DAI</span></div><div><small>累计返佣</small><b>' + f(m.total.rb, 4) + ' DAI</b><span>' + m.total.n + ' 笔 · 成交 ' + f(m.total.dai, 0) + ' DAI</span></div><div><small>待发放</small><b>' + f(m.pending, 4) + ' DAI</b><span>已发 ' + f(m.total.paid || 0, 4) + ' DAI</span></div></div>' +
      (m.days.length ? '<div class="lg-list">' + m.days.map(function (d) { return '<div class="lg-row"><span class="lg-ico">📅</span><div class="lg-main"><div class="lg-txt">' + d.d + '：成交 ' + f(d.x.dai, 2) + ' DAI · ' + d.x.n + ' 笔 → 返佣 <b>' + f(d.x.rb, 4) + ' DAI</b></div></div></div>'; }).join("") + "</div>" : '<p class="muted">最近 7 天还没有你的挂单被成交。去下面铺一组单，或到盘口挂单。</p>') +
      (m.paid.length ? '<p class="muted">发放记录：' + m.paid.slice(0, 5).map(function (p) { return p.day + " " + f(p.amt, 4) + ' DAI <a href="#/scan/' + p.tx + '">详情</a>'; }).join(" · ") + "</p>" : "");
  }
  function board(r) {
    var el = document.getElementById("lp-board"); if (!el || !data) return;
    var list = (data.board && data.board[r]) || [];
    el.innerHTML = list.length ? list.map(function (x, i) { return '<div class="lg-row"><span class="lg-ico">' + (i < 3 ? ["🥇", "🥈", "🥉"][i] : "#" + (i + 1)) + '</span><div class="lg-main"><div class="lg-txt"><a href="#/scan/' + x.a + '" data-a="' + x.a + '" class="mono">' + A.short(x.a) + '</a> · 成交 ' + f(x.dai, 0) + ' DAI · ' + x.n + ' 笔</div></div><b class="lp-rb">+' + f(x.rb, 2) + ' DAI</b></div>'; }).join("") : '<p class="muted">' + (r === "today" ? "今天" : "最近 7 天") + '还没有成交，第一个铺单的人就是榜一。</p>';
    if (A.fillNames) A.fillNames(el);
  }
  function params() { return { mid: Number(document.getElementById("lp-mid").value) || 0, sp: Number(document.getElementById("lp-sp").value) || 0, amt: Number(document.getElementById("lp-amt").value) || 0, dur: Number(document.getElementById("lp-dur").value) }; }
  function preview() {
    var p = params(), el = document.getElementById("lp-prev"); if (!el) return;
    if (!p.mid || !p.sp || !p.amt) { el.innerHTML = ""; return; }
    var bid = p.mid * (1 - p.sp / 200), ask = p.mid * (1 + p.sp / 200), coin = p.amt / ask;
    el.innerHTML = '<div class="lp-two"><div class="bid"><small>买单</small><b>' + f(bid) + '</b><span>压 ' + f(p.amt) + ' DAI → 买 ' + f(p.amt / bid, 4) + ' ' + SYM + '</span></div><div class="ask"><small>卖单</small><b>' + f(ask) + '</b><span>压 ' + f(coin, 4) + ' ' + SYM + ' → 收 ' + f(p.amt) + ' DAI</span></div></div>' +
      '<p class="muted">两边都成交一轮：价差赚 <b>' + f(coin * (ask - bid)) + ' DAI</b> + 返佣 <b>' + f(p.amt * 2 * R.FEE * R.SHARE) + ' DAI</b>' + (p.amt < 50 ? ' · <b class="nm-bad">每边最少 50 DAI</b>' : "") + (p.sp < 0.3 ? ' · <b class="nm-bad">价差太窄，容易被单边吃光</b>' : "") + "</p>";
  }
  function ensureAllowance(token, amount, say, name) {
    return K().allowance(token, account, OTC).then(function (al) { if (al >= amount) return; return K().send(token, SEL.approve + u256(OTC) + u256(MAX_UINT), say, "授权 " + name + " 给托管合约（只需一次）"); });
  }
  function place() {
    var p = params(), go = document.getElementById("lp-go"), st = document.getElementById("lp-st"), say = function (t) { st.textContent = t; };
    if (!p.mid || !p.sp || !p.amt) return A.errTip("先填中间价、价差、金额", go);
    if (p.amt < 50) return A.errTip("每边最少 50 DAI", go);
    var bid = p.mid * (1 - p.sp / 200), ask = p.mid * (1 + p.sp / 200);
    var daiWei = toWei(p.amt.toFixed(6), 18), coinBuy = toWei((p.amt / bid).toFixed(6), TD), coinSell = toWei((p.amt / ask).toFixed(6), TD), daiSell = toWei((Number(coinSell) / Math.pow(10, TD) * ask).toFixed(6), 18);
    go.disabled = true;
    K().ready().then(function () {
      account = K().account(); after();
      return Promise.all([K().balance(DAI, account), K().balance(TOKEN, account)]);
    }).then(function (b) {
      if (b[0] < daiWei) throw new Error("DAI 不够：买单要压 " + f(p.amt) + " DAI，你有 " + f(Number(b[0]) / 1e18));
      if (b[1] < coinSell) throw new Error(SYM + " 不够：卖单要压 " + f(Number(coinSell) / Math.pow(10, TD), 4) + " " + SYM + "，你有 " + f(Number(b[1]) / Math.pow(10, TD), 4));
      return ensureAllowance(DAI, daiWei, say, "DAI");
    }).then(function () { return ensureAllowance(TOKEN, coinSell, say, SYM); })
      .then(function () { return K().send(OTC, SEL.create + u256(0) + u256(daiWei) + u256(coinBuy) + u256(p.dur), say, "第 1 张：买单 " + f(bid)); })
      .then(function () { return K().send(OTC, SEL.create + u256(1) + u256(coinSell) + u256(daiSell) + u256(p.dur), say, "第 2 张：卖单 " + f(ask)); })
      .then(function () { go.disabled = false; say("✅ 两张单都挂上了。有人吃单后返佣自动记账，每天结算。"); if (A.just) A.just.set("otc", "ailgns"); setTimeout(load, 2000); })
      .catch(function (e) { go.disabled = false; say(""); A.errTip(K().niceError(e), go); });
  }
  A.pages.lp = page;
})();
