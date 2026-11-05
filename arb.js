// ⚡ EVM 套利做市商（内部页 #/arb，2026-11-05）：只给站长看，不进菜单。读 keeper 的记账文件 + 套利钱包链上余额
(function () {
  "use strict";
  var A = window.AIL, W = A.wallet;
  var ARB = "0x06cc2a46d7ad17496c2de9c61362808e06b44437", DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", AIL = "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", PAIR = "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0";
  var RAW = "https://raw.githubusercontent.com/yaoyederener/monita/main/data/arb.json";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function bal(t) { return W.rpcOn("anubis", "eth_call", [{ to: t, data: "0x70a08231" + ARB.slice(2).padStart(64, "0") }, "latest"]).then(function (r) { return Number(BigInt(r) / 10n ** 12n) / 1e6; }); }
  function bj(ts) { var d = new Date(ts * 1000 + 8 * 3600e3); return (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
  function page(id) {
    A.app.innerHTML = '<section class="card"><h2>⚡ EVM 套利做市商 <small class="muted">内部测试 · 未开放</small></h2>' +
      '<p class="muted">AiLGNS 在本站 OTC 和官方 DEX 之间的差价套利：OTC 有人贱卖 → 吃掉再去 DEX 卖；OTC 有人高价求购 → DEX 买来卖给他。两条腿几秒内完成，不持仓，只赚差价。keeper 每 5 分钟检查一次，单笔 ≤ 300 DAI，净利 ≥ 0.05 DAI 且 ≥ 0.3% 才出手。</p>' +
      '<p>套利钱包 <a href="#/scan/' + ARB + '" class="mono">' + ARB + '</a></p><div class="sc-bal" id="arb-bal"><p class="muted">读取中…</p></div></section>' +
      '<section class="card"><div class="card-head"><h2>📈 战绩</h2><span class="muted" id="arb-eff"></span></div><div id="arb-sum">读取中…</div></section>' +
      '<section class="card"><h2>🧾 成交记录</h2><div class="lg-list" id="arb-log">读取中…</div></section>' +
      '<section class="card"><h2>📐 手续费账（为什么能稳赚）</h2><table class="arb-t"><tr><th>场所</th><th>挂单（maker）</th><th>吃单（taker）</th></tr>' +
      '<tr><td>本站 OTC</td><td><b>0</b></td><td>1%（从收到的币里扣）</td></tr><tr><td>币安现货</td><td>0.1%（VIP 更低）</td><td>0.1%</td></tr><tr><td>官方 DEX</td><td>—</td><td>买约 0.5% · 卖约 3.3%</td></tr></table>' +
      '<ul class="muted arb-ul"><li>路径 A 触发条件：OTC 卖单价 &lt; DEX 现价 × 0.965 × 0.99 ≈ 现价的 95.5%；路径 B：OTC 买单价 &gt; DEX 现价 ÷ 0.99 ÷ 0.995 ≈ 现价的 101.5%。</li>' +
      '<li>Anubis 链一笔 Gas 约 0.0015 DAI，一次套利 2–3 笔，所以理论最低利润只要 &gt; 0.005 DAI 就是正的；为了留余量设成 0.05 DAI。</li>' +
      '<li>唯一风险是两腿之间几秒的价格变动，用「DEX 成交量下限 + 单笔小额」兜住；DEX 那腿失败就回滚，币留在套利钱包等下次。</li>' +
      '<li>同一盘口里买单 ≥ 卖单的交叉机会由撮合合约另外处理（利润进回购池）。</li></ul></section>';
    Promise.all([bal(DAI), bal(AIL)]).then(function (b) {
      var el = document.getElementById("arb-bal"); if (!el || !A.isCurrent(id)) return;
      el.innerHTML = "<div><span>DAI</span><b>" + b[0].toLocaleString("en-US", { maximumFractionDigits: 2 }) + "</b></div><div><span>AiLGNS</span><b>" + b[1].toLocaleString("en-US", { maximumFractionDigits: 4 }) + "</b></div>" + (b[0] < 2 ? '<p class="muted">本金不足：往套利钱包转 DAI 后 keeper 才会开始工作（建议 1,000–3,000 DAI，Gas 也是 DAI）</p>' : "");
    });
    fetch(RAW + "?r=" + Date.now()).then(function (r) { return r.json(); }).then(function (st) {
      if (!A.isCurrent(id)) return;
      var tr = st.trades || [], day = Date.now() / 1000 - 86400, td = tr.filter(function (x) { return x.t >= day; });
      document.getElementById("arb-eff").textContent = "DEX 实测折损：卖出 " + ((1 - st.sell_eff) * 100).toFixed(2) + "% · 买入 " + ((1 - st.buy_eff) * 100).toFixed(2) + "%";
      document.getElementById("arb-sum").innerHTML = '<div class="sc-bal"><div><span>累计净利</span><b>' + (st.pnl || 0).toFixed(4) + " DAI</b></div><div><span>累计笔数</span><b>" + tr.length + "</b></div><div><span>24 小时</span><b>" + td.reduce(function (s, x) { return s + x.profit; }, 0).toFixed(4) + " DAI / " + td.length + " 笔</b></div></div>";
      document.getElementById("arb-log").innerHTML = tr.length ? tr.slice().reverse().slice(0, 50).map(function (x) {
        return '<div class="lg-row"><span class="lg-ico">' + (x.path === "A" ? "🅰️" : "🅱️") + '</span><div class="lg-main"><div class="lg-txt">' + (x.path === "A" ? "OTC 买入 → DEX 卖出" : "DEX 买入 → OTC 卖出") + "，动用 " + x.size + " DAI，净赚 <b>" + x.profit.toFixed(4) + " DAI</b>（DEX " + x.dex + "）</div><small>" + bj(x.t) + " · 单 #" + x.id + "</small></div>" + (x.tx && x.tx[0] ? '<a class="lg-link" href="#/scan/' + x.tx[0] + '">详情 ›</a>' : "") + "</div>";
      }).join("") : '<p class="muted">还没有成交。keeper 每 5 分钟扫一次，有机会就自动出手。</p>';
    }).catch(function () { var s = document.getElementById("arb-sum"); if (s) s.innerHTML = '<p class="muted">记账文件还没生成（keeper 第一次成交后出现）</p>'; var l = document.getElementById("arb-log"); if (l) l.innerHTML = ""; });
  }
  A.pages.arb = page;
})();
