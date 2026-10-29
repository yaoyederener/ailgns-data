// AiLGNS 数据站：只读 Anubis 链上合约和 Awake Helix 官方公开接口
(function () {
  "use strict";

  var API = "https://awakehelix.io/api/v1";
  var FLOWS_URL = "https://raw.githubusercontent.com/yaoyederener/monita/main/data/ailgns_flows.json";
  var RPCS = ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"];
  var EXPLORER = "https://anubisscan.io";
  var C = {
    PAIR: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", // token0 = AILGNS, token1 = DAI
    DAI: "0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14",
    AILGNS: "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB",
    RESERVE: "0x27Cb55eE75E777fF972B74B6E68782D12Bd4ec46",
    COMMUNITY: "0xc9f9a8a2dBf8188AD6610e0239105CAbE67c4993"
  };
  var WATCH_KEY = "ailgns-watch-v1";

  var app = document.getElementById("app");
  var tip = document.createElement("div");
  tip.className = "tip";
  document.body.appendChild(tip);
  var renderId = 0;

  // ---------- 格式化 ----------
  function n(v) { return typeof v === "number" ? v : parseFloat(v || 0); }
  function fmt(v, d) { return n(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function wan(v) {
    v = n(v);
    var a = Math.abs(v);
    if (a >= 1e8) return (v / 1e8).toFixed(2) + " 亿";
    if (a >= 1e4) return (v / 1e4).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, "") + " 万";
    return fmt(v, a < 10 ? 2 : 0);
  }
  function signed(v, f) { v = n(v); return (v > 0 ? "+" : v < 0 ? "−" : "") + (f || wan)(Math.abs(v)); }
  function cls(v) { return n(v) > 0 ? "up" : n(v) < 0 ? "down" : ""; }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lv(level) { return level ? '<span class="lv p' + level + '">P' + level + "</span>" : '<span class="lv">—</span>'; }
  function addrLink(a, route) { return '<a class="mono" href="#/' + (route || "wallet") + "/" + a.toLowerCase() + '" title="' + a + '">' + short(a) + "</a>"; }
  function timeBJ(d) {
    return new Date(d).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  // ---------- 数据 ----------
  function getJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function api(path) { return getJSON(API + path); }

  function rpc(method, params, i) {
    i = i || 0;
    return fetch(RPCS[i % RPCS.length], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message);
      return j.result;
    }).catch(function (e) {
      if (i < RPCS.length - 1) return rpc(method, params, i + 1);
      throw e;
    });
  }
  function call(to, data) { return rpc("eth_call", [{ to: to, data: data }, "latest"]); }
  function pad(a) { return a.toLowerCase().replace("0x", "").padStart(64, "0"); }
  function word(hex, i) { return BigInt("0x" + (hex.slice(2 + i * 64, 2 + (i + 1) * 64) || "0")); }
  function units(b) { return Number(b / 10n ** 12n) / 1e6; }
  function balanceOf(token, who) { return call(token, "0x70a08231" + pad(who)).then(function (h) { return units(word(h, 0)); }); }
  function reserves() {
    return call(C.PAIR, "0x0902f1ac").then(function (h) { return { ail: units(word(h, 0)), dai: units(word(h, 1)) }; });
  }
  // 社区合约 referrals(address, offset, limit) → (总数, 直推地址[])
  function referrals(addr, offset, limit) {
    var data = "0xc01b35a1" + pad(addr) + offset.toString(16).padStart(64, "0") + limit.toString(16).padStart(64, "0");
    return call(C.COMMUNITY, data).then(function (h) {
      var total = Number(word(h, 0)), len = Number(word(h, 2)), out = [];
      for (var i = 0; i < len; i++) out.push("0x" + h.slice(2 + (3 + i) * 64 + 24, 2 + (4 + i) * 64));
      return { total: total, list: out };
    });
  }
  // limit 不能超过剩余数量，否则合约 revert，所以先读总数再分页
  function allReferrals(addr, cap) {
    return referrals(addr, 0, 0).then(function (first) {
      var total = first.total, want = Math.min(total, cap), pages = [];
      for (var off = 0; off < want; off += 50) pages.push(referrals(addr, off, Math.min(50, want - off)));
      return Promise.all(pages).then(function (ps) {
        return { total: total, list: [].concat.apply([], ps.map(function (p) { return p.list; })) };
      });
    });
  }

  // 并发受限地依次处理
  function pool(items, size, fn, onEach) {
    var i = 0, out = new Array(items.length);
    function next() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return fn(items[k]).then(function (r) { out[k] = r; }, function () { out[k] = null; }).then(function () {
        if (onEach) onEach(k, out[k]);
        return next();
      });
    }
    var workers = [];
    for (var w = 0; w < Math.min(size, items.length); w++) workers.push(next());
    return Promise.all(workers).then(function () { return out; });
  }

  // ---------- 关注列表（只存在本浏览器） ----------
  function watchList() { try { return JSON.parse(localStorage.getItem(WATCH_KEY)) || []; } catch (e) { return []; } }
  function setWatch(list) { try { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); } catch (e) { /* 隐私模式下不保存 */ } }
  function toggleWatch(a) {
    a = a.toLowerCase();
    var l = watchList(), i = l.indexOf(a);
    if (i >= 0) l.splice(i, 1); else l.unshift(a);
    setWatch(l.slice(0, 20));
  }

  // ---------- 图表 ----------
  function bindTip(svg) {
    svg.addEventListener("mousemove", function (e) {
      var t = e.target.closest("[data-tip]");
      if (!t) { tip.style.display = "none"; return; }
      tip.innerHTML = t.getAttribute("data-tip");
      tip.style.display = "block";
      var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + "px";
      tip.style.top = (e.clientY + 14) + "px";
    });
    svg.addEventListener("mouseleave", function () { tip.style.display = "none"; });
  }

  // 每日买入（向上）、卖出（向下）柱子，金点 = 池子净流入/流出
  function flowChart(days) {
    var W = 900, H = 260, L = 52, R = 10, T = 14, B = 26;
    var max = 1;
    days.forEach(function (d) { max = Math.max(max, d.buy_dai, d.sell_dai, Math.abs(d.net)); });
    var mid = T + (H - T - B) / 2, half = (H - T - B) / 2;
    var bw = (W - L - R) / days.length;
    var y = function (v) { return mid - v / max * half; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="每日买卖金额">';
    [1, .5, 0, -.5, -1].forEach(function (f) {
      var yy = mid - f * half;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#262b33"' + (f === 0 ? "" : ' stroke-dasharray="3 4"') + "/>";
      s += '<text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + (f === 0 ? "0" : (f < 0 ? "−" : "") + wan(Math.abs(f) * max).replace(" ", "")) + "</text>";
    });
    var pts = [];
    days.forEach(function (d, i) {
      var x = L + i * bw, w = Math.max(2, bw * .64), cx = x + bw / 2;
      var t = "<b>" + d.date + (d.final ? "" : "（今天）") + "</b><br>买入 " + fmt(d.buy_dai) + " DAI · " + fmt(d.buy_n) + " 笔<br>卖出 " +
        fmt(d.sell_dai) + " DAI · " + fmt(d.sell_n) + ' 笔<br>池子 <span class="' + cls(d.net) + '">' + signed(d.net, fmt) + " DAI</span>";
      s += '<g data-tip="' + esc(t) + '"><rect x="' + x + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="transparent"/>';
      s += '<rect x="' + (cx - w / 2) + '" y="' + y(d.buy_dai) + '" width="' + w + '" height="' + (mid - y(d.buy_dai)) + '" rx="2" fill="#2fbf71" opacity="' + (d.final ? .85 : .5) + '"/>';
      s += '<rect x="' + (cx - w / 2) + '" y="' + mid + '" width="' + w + '" height="' + (y(-d.sell_dai) - mid) + '" rx="2" fill="#f0524f" opacity="' + (d.final ? .85 : .5) + '"/></g>';
      pts.push(cx + "," + y(d.net));
      if (i % Math.ceil(days.length / 8) === 0 || i === days.length - 1)
        s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + d.date.slice(5).replace("-", "/") + "</text>";
    });
    s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#d4af37" stroke-width="1.5" pointer-events="none"/>';
    pts.forEach(function (p) { var q = p.split(","); s += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="2.6" fill="#d4af37" pointer-events="none"/>'; });
    return s + "</svg>";
  }

  // 主池 DAI 储备走势
  function lineChart(days, key, label) {
    var W = 900, H = 200, L = 52, R = 10, T = 12, B = 26;
    var vals = days.map(function (d) { return d[key]; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    var padv = (hi - lo) * .1; lo -= padv; hi += padv;
    var bw = (W - L - R) / days.length;
    var y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var s = '<svg class="chart" style="height:200px" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + label + '">';
    [0, .5, 1].forEach(function (f) {
      var v = lo + (hi - lo) * f, yy = y(v);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#262b33" stroke-dasharray="3 4"/>';
      s += '<text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + wan(v).replace(" ", "") + "</text>";
    });
    var pts = days.map(function (d, i) { return (L + i * bw + bw / 2) + "," + y(d[key]); });
    s += '<polygon points="' + (L + bw / 2) + "," + (H - B) + " " + pts.join(" ") + " " + (L + (days.length - .5) * bw) + "," + (H - B) + '" fill="rgba(212,175,55,.10)"/>';
    s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#d4af37" stroke-width="2"/>';
    days.forEach(function (d, i) {
      var cx = L + i * bw + bw / 2;
      s += '<rect data-tip="' + esc("<b>" + d.date + "</b><br>" + label + " " + fmt(d[key], key === "price_end" ? 2 : 0)) + '" x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="transparent"/>';
      if (i % Math.ceil(days.length / 8) === 0 || i === days.length - 1)
        s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + d.date.slice(5).replace("-", "/") + "</text>";
    });
    return s + "</svg>";
  }

  // ---------- 页面：资金流向 ----------
  function renderFlows(id) {
    app.innerHTML = '<h1>资金流向</h1><p class="sub">AiLGNS/DAI 主池每天的买单、卖单，以及池子是净流入还是净流出（北京时间自然日）</p><div class="loading">正在读取链上数据…</div>';
    Promise.all([
      getJSON(FLOWS_URL).catch(function () { return null; }),
      reserves().catch(function () { return null; }),
      balanceOf(C.DAI, C.RESERVE).catch(function () { return null; }),
      api("/power").catch(function () { return null; }),
      api("/overview").catch(function () { return null; })
    ]).then(function (r) {
      if (id !== renderId) return;
      var flows = r[0], res = r[1], reserveDai = r[2], power = r[3], overview = r[4];
      var days = flows ? flows.days.map(function (d) { d.net = d.pool_dai_end - d.pool_dai_start; return d; }) : [];
      var today = days.length ? days[days.length - 1] : null;
      var yday = days.length > 1 ? days[days.length - 2] : null;
      var price = res ? res.dai / res.ail : null;
      var html = '<h1>资金流向</h1><p class="sub">AiLGNS/DAI 主池每天的买单、卖单，以及池子是净流入还是净流出（北京时间自然日）</p>';

      html += '<div class="kpis">';
      if (today) {
        var dir = today.net > 0 ? "in" : today.net < 0 ? "out" : "";
        html += '<div class="kpi hero ' + dir + '"><div class="k">今天 · 池子' + (today.net >= 0 ? "净流入" : "净流出") + '</div><div class="v num ' + cls(today.net) + '">' + signed(today.net) + "<small>DAI</small></div>" +
          '<div class="d">截至 ' + timeBJ(flows.updated) + "，每小时更新</div></div>";
        html += '<div class="kpi"><div class="k">今天买单</div><div class="v num up">' + wan(today.buy_dai) + '<small>DAI</small></div><div class="d">' + fmt(today.buy_n) + " 笔 · 最大单笔 " + wan(today.buy_max) + "</div></div>";
        html += '<div class="kpi"><div class="k">今天卖单</div><div class="v num down">' + wan(today.sell_dai) + '<small>DAI</small></div><div class="d">' + fmt(today.sell_n) + " 笔 · 最大单笔 " + wan(today.sell_max) + "</div></div>";
      }
      if (price != null) {
        var chg = yday ? (price / yday.price_end - 1) * 100 : null;
        html += '<div class="kpi"><div class="k">AiLGNS 现价（主池实时）</div><div class="v num">' + fmt(price, 2) + "<small>DAI</small></div>" +
          (chg != null ? '<div class="d">较昨日收盘 <span class="' + cls(chg) + '">' + (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%</span></div>" : "") + "</div>";
        html += '<div class="kpi"><div class="k">主池 DAI 储备（实时）</div><div class="v num">' + wan(res.dai) + '<small>DAI</small></div><div class="d">' + fmt(res.ail, 2) + " AiLGNS</div></div>";
      }
      if (reserveDai != null) html += '<div class="kpi"><div class="k">协议储备（实时）</div><div class="v num">' + wan(reserveDai) + '<small>DAI</small></div><div class="d">买算力的 DAI 都进这里</div></div>';
      if (power) html += '<div class="kpi"><div class="k">全网有效算力</div><div class="v num">' + wan(power.totalActivePower) + '</div><div class="d">' + fmt(power.participants) + " 个地址 · 今天新增 " + wan(power.today.newPower) + "</div></div>";
      if (overview && overview.latest) html += '<div class="kpi"><div class="k">24 小时新用户</div><div class="v num">' + fmt(overview.latest.new_users_24h) + '</div><div class="d">24 小时成交 ' + wan(overview.latest.volume_24h_usd) + " DAI</div></div>";
      html += "</div>";

      if (days.length) {
        var recent = days.slice(-30);
        var sumNet = recent.reduce(function (a, d) { return a + d.net; }, 0);
        html += '<section class="card"><div class="card-head"><h2>每日买卖</h2><div class="legend"><span><i style="background:#2fbf71"></i>买入</span><span><i style="background:#f0524f"></i>卖出</span><span><i style="background:#d4af37"></i>池子净流入/流出</span></div></div>' +
          flowChart(recent) + '<p class="note">近 ' + recent.length + ' 天池子合计 <b class="' + cls(sumNet) + '">' + signed(sumNet) + " DAI</b>。今天的柱子颜色较浅，表示还没收盘。</p></section>";
        html += '<section class="card"><div class="card-head"><h2>主池 DAI 储备</h2><span class="muted">每天收盘时</span></div>' + lineChart(recent, "pool_dai_end", "主池 DAI") + "</section>";

        html += '<section class="card"><div class="card-head"><h2>每日明细</h2><span class="muted">池子变化 = 买卖差额 + 添加/撤出流动性</span></div><div class="tbl-wrap"><table><thead><tr>' +
          "<th>日期</th><th>买单</th><th>买入 DAI</th><th>卖单</th><th>卖出 DAI</th><th>池子净流入/流出</th><th>收盘价</th></tr></thead><tbody>";
        days.slice().reverse().forEach(function (d) {
          html += "<tr><td>" + d.date + (d.final ? "" : ' <span class="muted">今天</span>') + "</td><td>" + fmt(d.buy_n) + '</td><td class="up">' + fmt(d.buy_dai) + "</td><td>" + fmt(d.sell_n) +
            '</td><td class="down">' + fmt(d.sell_dai) + '</td><td class="' + cls(d.net) + '"><b>' + signed(d.net, fmt) + "</b></td><td>" + fmt(d.price_end, 2) + "</td></tr>";
        });
        html += "</tbody></table></div></section>";
      } else {
        html += '<div class="card err">历史数据暂时读不到，稍后刷新再试。</div>';
      }
      app.innerHTML = html;
      app.querySelectorAll("svg.chart").forEach(bindTip);
    });
  }

  // ---------- 页面：钱包快查 ----------
  function searchBox(route, value) {
    var chips = watchList().map(function (a) {
      return '<span class="chip"><a href="#/' + route + "/" + a + '" class="mono">' + short(a) + '</a><span class="x" data-unwatch="' + a + '" title="取消关注">✕</span></span>';
    }).join("");
    return '<form class="search" data-route="' + route + '"><input name="a" placeholder="粘贴钱包地址 0x…" autocomplete="off" spellcheck="false" value="' + esc(value || "") + '"><button>查询</button></form>' +
      (chips ? '<div class="chips"><span class="muted" style="font-size:12px">关注：</span>' + chips + "</div>" : "");
  }

  function renderWallet(id, addr) {
    var head = '<h1>钱包快查</h1><p class="sub">输入地址，查看官方等级、算力、团队、每日奖励和余额。只读查询，不连接钱包。</p>';
    if (!addr) {
      app.innerHTML = head + searchBox("wallet") + '<div class="empty">输入一个钱包地址开始查询</div>';
      return;
    }
    app.innerHTML = head + searchBox("wallet", addr) + '<div class="loading">正在查询…</div>';
    Promise.all([
      api("/level/" + addr).catch(function () { return null; }),
      api("/community/" + addr).catch(function () { return null; }),
      api("/power/" + addr + "?limit=50").catch(function () { return null; }),
      balanceOf(C.DAI, addr).catch(function () { return null; }),
      balanceOf(C.AILGNS, addr).catch(function () { return null; })
    ]).then(function (r) {
      if (id !== renderId) return;
      var lvl = r[0], com = r[1], pw = r[2], dai = r[3], ail = r[4];
      var watched = watchList().indexOf(addr) >= 0;
      var html = head + searchBox("wallet", addr);
      html += '<div class="card-head"><div class="mono" style="overflow-wrap:anywhere">' + addr + ' <a href="' + EXPLORER + "/address/" + addr + '" target="_blank" rel="noopener">浏览器 ↗</a></div>' +
        '<div style="display:flex;gap:8px"><button class="ghost" data-watch="' + addr + '" style="padding:8px 14px">' + (watched ? "★ 已关注" : "☆ 关注") + '</button><a class="btn" style="padding:8px 14px" href="#/team/' + addr + '">看团队 →</a></div></div>';

      html += '<div class="kpis">';
      html += '<div class="kpi hero"><div class="k">官方等级</div><div class="v">' + (lvl && lvl.level ? "P" + lvl.level : "无等级") + '</div><div class="d">' + (lvl ? "官方第 " + lvl.day + " 天评估" : "暂无评估") + "</div></div>";
      if (pw && pw.summary) html += '<div class="kpi"><div class="k">生效算力</div><div class="v num">' + wan(pw.summary.activePower) + '</div><div class="d">投入 ' + wan(pw.summary.totalDai) + " DAI · " + pw.summary.records + " 笔</div></div>";
      if (lvl) html += '<div class="kpi"><div class="k">ve 锁仓价值</div><div class="v num">' + wan(lvl.veUsd) + '<small>DAI</small></div><div class="d">个人业绩 ' + wan(lvl.selfPower) + "</div></div>";
      if (com) html += '<div class="kpi"><div class="k">团队</div><div class="v num">' + fmt(com.team) + '<small>人</small></div><div class="d">直推 ' + fmt(com.direct) + " · 团队算力 " + wan(com.teamActivePower) + "</div></div>";
      html += '<div class="kpi"><div class="k">钱包余额</div><div class="v num">' + (dai != null ? wan(dai) : "—") + '<small>DAI</small></div><div class="d">' + (ail != null ? fmt(ail, 4) : "—") + " AiLGNS</div></div>";
      html += "</div>";

      html += '<div class="grid2">';
      if (lvl) html += zonesCard(lvl);
      if (com) {
        html += '<section class="card"><div class="card-head"><h2>推荐关系</h2></div><dl class="dl">' +
          "<dt>推荐人</dt><dd>" + (com.referrer && isAddr(com.referrer) && !/^0x0+1?$/.test(com.referrer) ? addrLink(com.referrer) : "—") + "</dd>" +
          "<dt>绑定时间</dt><dd>" + (com.boundAt ? timeBJ(com.boundAt) : "—") + "</dd>" +
          "<dt>所在层级</dt><dd>第 " + fmt(com.level) + " 层</dd>" +
          "<dt>直推人数</dt><dd>" + fmt(com.direct) + "</dd>" +
          "<dt>团队人数</dt><dd>" + fmt(com.team) + "</dd>" +
          "<dt>团队生效算力</dt><dd>" + fmt(com.teamActivePower) + "</dd></dl></section>";
      }
      html += "</div>";

      if (com && com.history && com.history.length) {
        html += '<section class="card"><div class="card-head"><h2>每日社区奖励</h2><span class="muted">增长 / 网络 / 共识，单位 AiLGNS</span></div><div class="tbl-wrap"><table><thead><tr>' +
          "<th>官方天数</th><th>状态</th><th>增长算力</th><th>网络算力</th><th>共识算力</th><th>奖励合计</th></tr></thead><tbody>";
        com.history.forEach(function (h) {
          var rw = n(h.rewardGrowth) + n(h.rewardNetwork) + n(h.rewardConsensus);
          html += "<tr><td>第 " + h.day + " 天</td><td>" + ({ applied: "已结算", closed: "已结束", pending: "待公布" }[h.status] || esc(h.status)) + "</td><td>" + fmt(h.growthPower, 2) + "</td><td>" + fmt(h.networkPower, 2) +
            "</td><td>" + fmt(h.consensusPower, 2) + "</td><td><b>" + fmt(rw, 4) + "</b></td></tr>";
        });
        html += "</tbody></table></div></section>";
      }
      if (pw && pw.records && pw.records.length) {
        html += '<section class="card"><div class="card-head"><h2>算力记录</h2><span class="muted">最近 ' + pw.records.length + ' 笔</span></div><div class="tbl-wrap"><table><thead><tr>' +
          '<th>时间</th><th class="l">方式</th><th>DAI</th><th>算力</th><th>生效日</th><th class="l">交易</th></tr></thead><tbody>';
        pw.records.forEach(function (x) {
          html += "<tr><td>" + timeBJ(x.ts) + '</td><td class="l">' + esc(x.method.replace(/^Power/, "")) + "</td><td>" + (x.daiAmount ? fmt(x.daiAmount, 2) : "—") + "</td><td>" + fmt(x.power, 2) +
            "</td><td>第 " + (x.activeFromDay || "—") + ' 天</td><td class="l"><a class="mono" target="_blank" rel="noopener" href="' + EXPLORER + "/tx/" + x.tx + '">' + x.tx.slice(0, 10) + "…</a></td></tr>";
        });
        html += "</tbody></table></div></section>";
      }
      if (!lvl && !com && !pw) html += '<div class="card err">官方接口暂时没有返回这个地址的数据，稍后再试。</div>';
      app.innerHTML = html;
    });
  }

  // 三个区对比下一级门槛
  var THRESHOLDS = null;
  function zonesCard(lvl) {
    var zones = (lvl.zones || []).map(n).sort(function (a, b) { return b - a; });
    while (zones.length < 3) zones.push(0);
    var cur = lvl.level || 0, nextLv = Math.min(cur + 1, 5);
    var t = THRESHOLDS && THRESHOLDS.filter(function (x) { return x.level === nextLv; })[0];
    var need = t ? n(t.zoneUsd) : [50000, 150000, 500000, 1500000, 4000000][nextLv - 1];
    var veNeed = t ? n(t.veUsd) : [1000, 3000, 5000, 8000, 10000][nextLv - 1];
    var s = '<section class="card"><div class="card-head"><h2>三个区业绩（官方）</h2><span class="muted">对比 P' + nextLv + " 门槛 · 每区 " + wan(need) + " DAI</span></div><div class=\"zones\">";
    zones.slice(0, 3).forEach(function (z, i) {
      var p = Math.min(100, z / need * 100);
      s += '<div class="zone"><div style="display:flex;justify-content:space-between"><span>' + ["一区", "二区", "三区"][i] + '</span><span class="num">' + fmt(z) + ' <span class="muted">/ ' + wan(need) + '</span></span></div><div class="bar"><i class="' + (z >= need ? "ok" : "") + '" style="width:' + p + '%"></i></div></div>';
    });
    var veOk = n(lvl.veUsd) >= veNeed;
    s += '</div><p class="note">ve 锁仓价值 ' + fmt(lvl.veUsd) + " / 需要 " + fmt(veNeed) + ' <span class="' + (veOk ? "up" : "down") + '">' + (veOk ? "✓ 已达标" : "✗ 未达标") + "</span>。三个区必须各自达标，不能相加。</p></section>";
    return s;
  }

  // ---------- 页面：团队与等级 ----------
  function levelOverview(lv) {
    var s = '<section class="card"><div class="card-head"><h2>全网 P 等级分布</h2><span class="muted">官方第 ' + lv.day + " 天 · 已评估 " + fmt(lv.evaluated) + ' 个地址</span></div><div class="tbl-wrap"><table><thead><tr>' +
      "<th>等级</th><th>人数</th><th>每区门槛（DAI）</th><th>三区合计</th><th>ve 锁仓价值</th></tr></thead><tbody>";
    lv.thresholds.forEach(function (t) {
      var d = lv.distribution.filter(function (x) { return x.level === t.level; })[0];
      s += "<tr><td>" + lv_(t.level) + "</td><td><b>" + fmt(d ? d.members : 0) + "</b></td><td>" + (t.zoneUsd ? fmt(t.zoneUsd) : "每区 1 名 P" + t.contains) + "</td><td>" + (t.zoneUsd ? fmt(n(t.zoneUsd) * 3) : "—") + "</td><td>" + fmt(t.veUsd) + "</td></tr>";
    });
    return s + '</tbody></table></div><p class="note">三个区要分别达标，不能把三个区加起来算。</p></section>';
  }
  var lv_ = lv;

  function renderTeam(id, addr) {
    var head = '<h1>团队与等级</h1><p class="sub">查看任意地址的直推线、每条线的团队人数和算力，以及官方 P 等级。点直推地址可以一层层往下看。</p>';
    app.innerHTML = head + searchBox("team", addr) + '<div class="loading">正在读取…</div>';
    var levelP = api("/level").then(function (l) { THRESHOLDS = l.thresholds; return l; }).catch(function () { return null; });
    if (!addr) {
      levelP.then(function (l) {
        if (id !== renderId) return;
        app.innerHTML = head + searchBox("team") + (l ? levelOverview(l) : '<div class="card err">官方等级接口暂时读不到</div>');
      });
      return;
    }
    Promise.all([levelP, api("/level/" + addr).catch(function () { return null; }), api("/community/" + addr).catch(function () { return null; }), allReferrals(addr, 300).catch(function () { return null; })])
      .then(function (r) {
        if (id !== renderId) return;
        var lvAll = r[0], me = r[1], com = r[2], refs = r[3];
        var html = head + searchBox("team", addr);
        html += '<div class="crumbs">' + (com && isAddr(com.referrer) && !/^0x0+1?$/.test(com.referrer) ? '<span class="muted">上级</span> ' + addrLink(com.referrer, "team") + ' <span class="muted">›</span> ' : "") +
          '<b class="mono">' + short(addr) + "</b>" + (me ? " " + lv(me.level) : "") + ' <a href="#/wallet/' + addr + '" style="margin-left:auto">钱包详情 →</a></div>';
        html += '<div class="kpis">';
        html += '<div class="kpi hero"><div class="k">官方等级</div><div class="v">' + (me && me.level ? "P" + me.level : "无等级") + '</div><div class="d">ve ' + (me ? wan(me.veUsd) : "—") + " DAI</div></div>";
        if (com) {
          html += '<div class="kpi"><div class="k">直推</div><div class="v num">' + fmt(com.direct) + '<small>人</small></div><div class="d">链上可读 ' + (refs ? fmt(refs.total) : "—") + " 个</div></div>";
          html += '<div class="kpi"><div class="k">团队人数</div><div class="v num">' + fmt(com.team) + '<small>人</small></div><div class="d">所在第 ' + fmt(com.level) + " 层</div></div>";
          html += '<div class="kpi"><div class="k">团队生效算力</div><div class="v num">' + wan(com.teamActivePower) + "</div><div class=\"d\">官方统计</div></div>";
        }
        html += "</div>";
        if (me) html += zonesCard(me);
        html += '<section class="card"><div class="card-head"><h2>直推线</h2><span class="muted" id="lines-status"></span></div><div id="lines"><div class="loading">正在读取每条线…</div></div>' +
          '<p class="note">按整条线的团队算力从大到小排列，前三条通常就是官方的三个区（官方未公开分区规则，以官方等级为准）。</p></section>';
        if (lvAll) html += levelOverview(lvAll);
        app.innerHTML = html;

        var list = refs ? refs.list : [];
        if (!list.length) { document.getElementById("lines").innerHTML = '<div class="empty">链上没有读到直推地址</div>'; return; }
        var status = document.getElementById("lines-status");
        var rows = [];
        function draw() {
          var sorted = rows.filter(Boolean).sort(function (a, b) { return b.total - a.total; });
          var s = '<div class="tbl-wrap"><table><thead><tr><th>#</th><th class="l">直推地址</th><th class="l">等级</th><th>个人业绩</th><th>团队人数</th><th>团队算力</th><th>直推</th></tr></thead><tbody>';
          sorted.forEach(function (x, i) {
            s += "<tr><td>" + (i < 3 ? '<b style="color:var(--gold)">' + ["一区", "二区", "三区"][i] + "</b>" : i + 1) + '</td><td class="l">' + addrLink(x.a, "team") + '</td><td class="l">' + lv(x.level) + "</td><td>" + wan(x.self) + "</td><td>" + fmt(x.team) +
              "</td><td><b>" + wan(x.teamPower) + "</b></td><td>" + fmt(x.direct) + "</td></tr>";
          });
          document.getElementById("lines").innerHTML = s + "</tbody></table></div>";
        }
        var done = 0, last = 0;
        pool(list, 6, function (a) {
          return Promise.all([api("/community/" + a), api("/level/" + a).catch(function () { return null; })]).then(function (p) {
            var c = p[0], l = p[1];
            return { a: a, level: l ? l.level : 0, self: l ? n(l.selfPower) : 0, team: n(c.team), teamPower: n(c.teamActivePower), direct: n(c.direct), total: n(c.teamActivePower) + (l ? n(l.selfPower) : 0) };
          });
        }, function (k, row) {
          if (id !== renderId) return;
          rows[k] = row; done++;
          status.textContent = done < list.length ? "已读取 " + done + " / " + list.length : list.length + " 条线" + (refs.total > list.length ? "（只显示前 " + list.length + " 条）" : "");
          if (done === list.length || Date.now() - last > 400) { last = Date.now(); draw(); }
        });
      });
  }

  // ---------- 路由 ----------
  function route() {
    var id = ++renderId;
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var tab = parts[0] || "flows", a = (parts[1] || "").toLowerCase();
    if (["flows", "wallet", "team"].indexOf(tab) < 0) tab = "flows";
    if (a && !isAddr(a)) a = "";
    document.querySelectorAll(".tabs a").forEach(function (el) { el.classList.toggle("on", el.getAttribute("data-tab") === tab); });
    tip.style.display = "none";
    window.scrollTo(0, 0);
    if (tab === "wallet") renderWallet(id, a);
    else if (tab === "team") renderTeam(id, a);
    else renderFlows(id);
  }

  document.addEventListener("submit", function (e) {
    var f = e.target.closest("form.search");
    if (!f) return;
    e.preventDefault();
    var a = f.a.value.trim();
    if (!isAddr(a)) { f.a.focus(); f.a.style.borderColor = "var(--down)"; return; }
    location.hash = "#/" + f.getAttribute("data-route") + "/" + a.toLowerCase();
  });
  document.addEventListener("click", function (e) {
    var w = e.target.closest("[data-watch]"), u = e.target.closest("[data-unwatch]");
    if (w) { toggleWatch(w.getAttribute("data-watch")); route(); }
    if (u) { e.preventDefault(); toggleWatch(u.getAttribute("data-unwatch")); route(); }
  });
  window.addEventListener("hashchange", route);
  route();
})();
