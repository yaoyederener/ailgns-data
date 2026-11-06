// AiLGNS 数据站：只读 Anubis 链上合约和 Awake Helix 官方公开接口
(function () {
  "use strict";

  // 苹果 Safari 不认 user-scalable=no：这里拦住双指缩放和双击放大，页面固定不缩放（站长要求）
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener("gesturechange", function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener("touchmove", function (e) { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  var lastTap = 0;
  document.addEventListener("touchend", function (e) {
    var now = Date.now();
    if (now - lastTap < 300 && !e.target.closest("input, textarea, select")) e.preventDefault(); // 快速连点两下不放大（按钮照常能点）
    lastTap = now;
  }, { passive: false });

  var API = "https://awakehelix.io/api/v1";
  // 历史数据走本站的 /api/flows（Cloudflare 边缘缓存），国内不用直连 GitHub；失败时再直连
  var FLOWS_URL = "/api/flows";
  var FLOWS_FALLBACK = "https://raw.githubusercontent.com/yaoyederener/monita/main/data/ailgns_flows.json";
  var RPCS = ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"];
  var EXPLORER = "#/scan"; // 全站只用本站账本，不跳官方浏览器（站长 2026-11-05 定）
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
  // 短地址顺便记下对应的完整地址：scan.js 全站把短地址换成 .ailgns / .lgns 域名时要用
  var SHORTS = {};
  function short(a) { var s = a.slice(0, 6) + "…" + a.slice(-4); if (isAddr(a)) SHORTS[s] = a.toLowerCase(); return s; }
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lv(level) { return level ? '<span class="lv p' + level + '">P' + level + "</span>" : '<span class="lv">—</span>'; }
  function addrLink(a, route) {
    // 会员功能只能查会员地址：别人的地址只显示，不能点进去查
    var own = window.AIL && window.AIL.ownOnly;
    if (own && route && route !== "wallet" && a.toLowerCase() !== own) return '<span class="mono" title="' + a + '">' + short(a) + "</span>";
    return '<a class="mono" href="#/' + (route || "wallet") + "/" + a.toLowerCase() + '" title="' + a + '">' + short(a) + "</a>";
  }
  // 算力折算成真实入金：算力 ÷ 2.5 = 入金 DAI
  var POWER_PER_DAI = 2.5;
  function toDai(power) { return Number(power || 0) / POWER_PER_DAI; }
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
    // 一个节点 8 秒没回应就换下一个（以前没有超时，节点卡住时会一直等，钱包迟迟弹不出来）
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, timer = ctl && setTimeout(function () { ctl.abort(); }, 8000);
    return fetch(RPCS[i % RPCS.length], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) { clearTimeout(timer); return r.json(); }).then(function (j) {
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
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e7e4ef"' + (f === 0 ? "" : ' stroke-dasharray="3 4"') + "/>";
      s += '<text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + (f === 0 ? "0" : (f < 0 ? "−" : "") + wan(Math.abs(f) * max).replace(" ", "")) + "</text>";
    });
    var pts = [];
    days.forEach(function (d, i) {
      var x = L + i * bw, w = Math.max(2, bw * .64), cx = x + bw / 2;
      var t = "<b>" + d.date + (d.final ? "" : "（今天）") + "</b><br>买入 " + fmt(d.buy_dai) + " DAI · " + fmt(d.buy_n) + " 笔<br>卖出 " +
        fmt(d.sell_dai) + " DAI · " + fmt(d.sell_n) + ' 笔<br>池子 <span class="' + cls(d.net) + '">' + signed(d.net, fmt) + " DAI</span>";
      s += '<g data-tip="' + esc(t) + '"><rect x="' + x + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="transparent"/>';
      s += '<rect x="' + (cx - w / 2) + '" y="' + y(d.buy_dai) + '" width="' + w + '" height="' + (mid - y(d.buy_dai)) + '" rx="2" fill="#16a34a" opacity="' + (d.final ? .85 : .5) + '"/>';
      s += '<rect x="' + (cx - w / 2) + '" y="' + mid + '" width="' + w + '" height="' + (y(-d.sell_dai) - mid) + '" rx="2" fill="#ef4444" opacity="' + (d.final ? .85 : .5) + '"/></g>';
      pts.push(cx + "," + y(d.net));
      if (i % Math.ceil(days.length / 8) === 0 || i === days.length - 1)
        s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + d.date.slice(5).replace("-", "/") + "</text>";
    });
    s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#7027d9" stroke-width="1.5" pointer-events="none"/>';
    pts.forEach(function (p) { var q = p.split(","); s += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="2.6" fill="#7027d9" pointer-events="none"/>'; });
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
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e7e4ef" stroke-dasharray="3 4"/>';
      s += '<text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + wan(v).replace(" ", "") + "</text>";
    });
    var pts = days.map(function (d, i) { return (L + i * bw + bw / 2) + "," + y(d[key]); });
    s += '<polygon points="' + (L + bw / 2) + "," + (H - B) + " " + pts.join(" ") + " " + (L + (days.length - .5) * bw) + "," + (H - B) + '" fill="rgba(112,39,217,.10)"/>';
    s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#7027d9" stroke-width="2"/>';
    days.forEach(function (d, i) {
      var cx = L + i * bw + bw / 2;
      s += '<rect data-tip="' + esc("<b>" + d.date + "</b><br>" + label + " " + fmt(d[key], key === "price_end" ? 2 : 0)) + '" x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="transparent"/>';
      if (i % Math.ceil(days.length / 8) === 0 || i === days.length - 1)
        s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + d.date.slice(5).replace("-", "/") + "</text>";
    });
    return s + "</svg>";
  }

  // 大总结：今天是净流入还是净流出，再看近 7 天、30 天
  function verdict(days, updated) {
    var today = days[days.length - 1];
    var last7 = days.slice(-7), last30 = days.slice(-30);
    var sum = function (l) { return l.reduce(function (t, d) { return t + d.net; }, 0); };
    var net7 = sum(last7), net30 = sum(last30);
    var inDays = last7.filter(function (d) { return d.net > 0; }).length;
    var up = today.net >= 0;
    var trend = inDays >= 5 ? "资金持续流入" : inDays <= 2 ? "资金持续流出" : "资金进出拉锯";
    var arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (up ? "M12 4l8 9h-5v7H9v-7H4z" : "M12 20l8-9h-5V4H9v7H4z") + '" fill="currentColor"/></svg>';
    var mini = function (label, v, note) {
      return '<div class="vd-mini"><span>' + label + '</span><b class="' + cls(v) + '">' + signed(v) + ' <small>DAI</small></b><em class="' + cls(v) + '">' + (v >= 0 ? "净流入" : "净流出") + "</em>" + (note ? "<i>" + note + "</i>" : "") + "</div>";
    };
    return '<section class="verdict ' + (up ? "in" : "out") + '">' +
      '<div class="vd-main"><div class="vd-icon">' + arrow + '</div><div>' +
      '<div class="vd-label">今天 AiLGNS/DAI 主池</div>' +
      '<div class="vd-word">' + (up ? "净流入" : "净流出") + '</div>' +
      '<div class="vd-amt num">' + signed(today.net) + ' <small>DAI</small></div>' +
      '<div class="vd-sub">买单 <b class="up">' + wan(today.buy_dai) + '</b> · 卖单 <b class="down">' + wan(today.sell_dai) + "</b> · 截至 " + timeBJ(updated) + "</div></div></div>" +
      '<div class="vd-side"><div class="vd-trend"><b>' + trend + '</b><span>近 7 天有 ' + inDays + " 天净流入</span>" +
      '<div class="vd-dots">' + last7.map(function (d) { return '<i class="' + (d.net >= 0 ? "in" : "out") + '" title="' + d.date + " " + signed(d.net, fmt) + ' DAI"></i>'; }).join("") + "</div></div>" +
      mini("近 7 天合计", net7) + mini("近 30 天合计", net30) + "</div></section>";
  }

  // ---------- 页面：资金流向 ----------
  // 先用上次的数据马上画出来，再分头去取新数据，哪个先回来先更新哪个
  var FLOWS_CACHE = "ailgns-flows-cache-v1";
  function renderFlows(id) {
    var st = {}, pending = { flows: true };
    try { st = JSON.parse(localStorage.getItem(FLOWS_CACHE)) || {}; } catch (e) { st = {}; }
    var queued = false;
    function draw() {
      queued = false;
      if (id !== renderId) return;
      var flows = st.flows, res = st.res, reserveDai = st.reserveDai, power = st.power, overview = st.overview;
      var days = flows ? flows.days.map(function (d) { return Object.assign({ net: d.pool_dai_end - d.pool_dai_start }, d); }) : [];
      var today = days.length ? days[days.length - 1] : null;
      var yday = days.length > 1 ? days[days.length - 2] : null;
      var price = res ? res.dai / res.ail : null;
      var html = '<h1>资金流向</h1><p class="sub sub-x">AiLGNS/DAI 主池每天的买单、卖单，以及池子是净流入还是净流出（北京时间自然日）</p>';

      if (today) html += verdict(days, flows.updated);
      html += '<div class="kpis">';
      if (today) {
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
        html += '<section class="card"><div class="card-head"><h2>每日买卖</h2><div class="legend"><span><i style="background:#16a34a"></i>买入</span><span><i style="background:#ef4444"></i>卖出</span><span><i style="background:#7027d9"></i>池子净流入/流出</span></div></div>' +
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
        html += pending.flows ? '<div class="loading">正在读取历史数据…</div>' : '<div class="card err">历史数据暂时读不到，稍后刷新再试。</div>';
      }
      app.innerHTML = html;
      app.querySelectorAll("svg.chart").forEach(bindTip);
    }
    function redraw() { if (!queued) { queued = true; setTimeout(draw, 30); } }
    function load(key, p) {
      pending[key] = true;
      p.then(function (v) {
        if (v == null) return;
        st[key] = v;
        try { localStorage.setItem(FLOWS_CACHE, JSON.stringify(st)); } catch (e) { /* 存不下就算了 */ }
      }, function () {}).then(function () { pending[key] = false; redraw(); });
    }
    draw();
    load("flows", getJSON(FLOWS_URL).catch(function () { return getJSON(FLOWS_FALLBACK); }));
    load("res", reserves());
    load("reserveDai", balanceOf(C.DAI, C.RESERVE));
    load("power", api("/power"));
    load("overview", api("/overview"));
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
    var head = '<h1>钱包快查</h1><p class="sub sub-x">输入地址，查看官方等级、算力、团队、每日奖励和余额。只读查询，不连接钱包。</p>';
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
      if (com) html += '<div class="kpi"><div class="k">团队</div><div class="v num">' + fmt(com.team) + '<small>个地址</small></div><div class="d">直推 ' + fmt(com.direct) + " · 团队入金 " + wan(toDai(com.teamActivePower)) + " DAI</div></div>";
      html += '<div class="kpi"><div class="k">钱包余额</div><div class="v num">' + (dai != null ? wan(dai) : "—") + '<small>DAI</small></div><div class="d">' + (ail != null ? fmt(ail, 4) : "—") + " AiLGNS</div></div>";
      html += "</div>";

      html += '<div class="grid2">';
      if (lvl) html += zonesCard(lvl);
      if (com) {
        html += '<section class="card"><div class="card-head"><h2>推荐关系</h2></div><dl class="dl">' +
          "<dt>推荐人</dt><dd>" + (com.referrer && isAddr(com.referrer) && !/^0x0+1?$/.test(com.referrer) ? addrLink(com.referrer) + '　<a href="#/upline/' + addr + '">查所有上级 →</a> <span class="vip-mini">高级</span>' : "—") + "</dd>" +
          "<dt>绑定时间</dt><dd>" + (com.boundAt ? timeBJ(com.boundAt) : "—") + "</dd>" +
          "<dt>所在层级</dt><dd>第 " + fmt(com.level) + " 层</dd>" +
          "<dt>直推地址数</dt><dd>" + fmt(com.direct) + "</dd>" +
          "<dt>团队地址数</dt><dd>" + fmt(com.team) + "</dd>" +
          "<dt>团队入金</dt><dd>" + fmt(toDai(com.teamActivePower)) + " DAI <span class=\"muted\">（团队算力 ÷ 2.5）</span></dd></dl></section>";
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
      "<th>等级</th><th>地址数</th><th>每区门槛（DAI）</th><th>三区合计</th><th>ve 锁仓价值</th></tr></thead><tbody>";
    lv.thresholds.forEach(function (t) {
      var d = lv.distribution.filter(function (x) { return x.level === t.level; })[0];
      s += "<tr><td>" + lv_(t.level) + "</td><td><b>" + fmt(d ? d.members : 0) + "</b></td><td>" + (t.zoneUsd ? fmt(t.zoneUsd) : "每区 1 名 P" + t.contains) + "</td><td>" + (t.zoneUsd ? fmt(n(t.zoneUsd) * 3) : "—") + "</td><td>" + fmt(t.veUsd) + "</td></tr>";
    });
    return s + '</tbody></table></div><p class="note">三个区要分别达标，不能把三个区加起来算。</p></section>';
  }
  var lv_ = lv;

  function renderTeam(id, addr) {
    var head = '<h1>团队与等级</h1><p class="sub sub-x">会员地址的直推线、每条线的团队地址数和入金（DAI），以及官方 P 等级。</p>';
    var box = function (v) { return window.AIL.ownOnly ? "" : searchBox("team", v); };
    app.innerHTML = head + box(addr) + '<div class="loading">正在读取…</div>';
    var levelP = api("/level").then(function (l) { THRESHOLDS = l.thresholds; return l; }).catch(function () { return null; });
    if (!addr) {
      levelP.then(function (l) {
        if (id !== renderId) return;
        app.innerHTML = head + box() + (l ? levelOverview(l) : '<div class="card err">官方等级接口暂时读不到</div>');
      });
      return;
    }
    Promise.all([levelP, api("/level/" + addr).catch(function () { return null; }), api("/community/" + addr).catch(function () { return null; }), allReferrals(addr, 300).catch(function () { return null; })])
      .then(function (r) {
        if (id !== renderId) return;
        var lvAll = r[0], me = r[1], com = r[2], refs = r[3];
        var html = head + box(addr);
        html += '<div class="crumbs">' + (com && isAddr(com.referrer) && !/^0x0+1?$/.test(com.referrer) ? '<span class="muted">上级</span> ' + addrLink(com.referrer, "team") + ' <span class="muted">›</span> ' : "") +
          '<b class="mono">' + short(addr) + "</b>" + (me ? " " + lv(me.level) : "") + ' <a href="#/wallet/' + addr + '" style="margin-left:auto">钱包详情 →</a></div>';
        html += '<div class="kpis">';
        html += '<div class="kpi hero"><div class="k">官方等级</div><div class="v">' + (me && me.level ? "P" + me.level : "无等级") + '</div><div class="d">ve ' + (me ? wan(me.veUsd) : "—") + " DAI</div></div>";
        if (com) {
          html += '<div class="kpi"><div class="k">直推</div><div class="v num">' + fmt(com.direct) + '<small>个地址</small></div><div class="d">链上可读 ' + (refs ? fmt(refs.total) : "—") + " 个</div></div>";
          html += '<div class="kpi"><div class="k">团队地址数</div><div class="v num">' + fmt(com.team) + '<small>个地址</small></div><div class="d">所在第 ' + fmt(com.level) + " 层</div></div>";
          html += '<div class="kpi"><div class="k">团队入金</div><div class="v num">' + wan(toDai(com.teamActivePower)) + '<small>DAI</small></div><div class="d">官方团队算力 ÷ 2.5</div></div>';
        }
        html += "</div>";
        if (me) html += zonesCard(me);
        html += '<section class="card"><div class="card-head"><h2>直推线</h2><span class="muted" id="lines-status"></span></div><div id="lines"><div class="loading">正在读取每条线…</div></div>' +
          '<p class="note">按整条线的团队入金从大到小排列，前三条通常就是官方的三个区（官方未公开分区规则，以官方等级为准）。</p></section>';
        html += '<a class="promo" href="#/growth/' + addr + '" style="margin-bottom:16px"><span class="promo-tag">会员</span><b>团队新增业绩</b><span class="promo-txt">这个团队今天、昨天、近 7 天新增了多少，具体到每个地址</span><span class="promo-go">去查看 →</span></a>';
        if (lvAll) html += levelOverview(lvAll);
        app.innerHTML = html;

        var list = refs ? refs.list : [];
        if (!list.length) { document.getElementById("lines").innerHTML = '<div class="empty">链上没有读到直推地址</div>'; return; }
        var status = document.getElementById("lines-status");
        var rows = [];
        function draw() {
          var sorted = rows.filter(Boolean).sort(function (a, b) { return b.total - a.total; });
          var s = '<div class="tbl-wrap"><table><thead><tr><th>#</th><th class="l">直推地址</th><th class="l">等级</th><th>个人业绩</th><th>团队地址数</th><th>团队入金 DAI</th><th>直推</th></tr></thead><tbody>';
          sorted.forEach(function (x, i) {
            s += "<tr><td>" + (i < 3 ? '<b style="color:var(--gold)">' + ["一区", "二区", "三区"][i] + "</b>" : i + 1) + '</td><td class="l">' + addrLink(x.a, "team") + '</td><td class="l">' + lv(x.level) + "</td><td>" + wan(x.self) + "</td><td>" + fmt(x.team) +
              "</td><td><b>" + wan(toDai(x.teamPower)) + "</b></td><td>" + fmt(x.direct) + "</td></tr>";
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
  // 每个页面在浏览器标签和分享时显示的标题
  var PAGE_TITLES = { lp: "做市返佣", inbox: "收件箱", lend: "借贷", trades: "成交查询", trade: "交易所盘口", arb: "EVM 套利做市商（内部）", updates: "更新日志", orders: "全站订单（内部）", feedback: "问题反馈",
    otc: "AiLGNS OTC 担保交易 · 0 滑点 手续费 1%", flows: "AiLGNS 资金流向 · 净流入监测", wallet: "钱包快查 · 等级算力团队", member: "会员中心",
    team: "团队与等级查询", growth: "团队新增业绩", tree: "团队结构图", upline: "上级查询", custom: "私人定制 · 商户合作", promo: "AiLGNS OTC 介绍 · 交易就送会员", app: "下载 AiLGNS OTC App", pixel: "LGNS 像素墙 · 销毁乐园", play: "销毁乐园 · 玩小游戏销毁 LGNS", g2048: "2048 · 销毁乐园", snake: "贪吃蛇 · 销毁乐园", tetris: "俄罗斯方块 · 销毁乐园", flappy: "飞翔小鸟 · 销毁乐园", mines: "扫雷 · 销毁乐园", brick: "打砖块 · 销毁乐园", merge: "DNA 合成 · 销毁乐园", pet: "HELIX 宠物 · 销毁乐园", names: "域名 · .ailgns", scan: "AiLGNS 账本", rank: "🏆 AiLGNS 荣耀榜 · OTC 大户排行", oracle: "🔮 AiLGNS 每日预言家", farm: "开心农场"
  };

  // ---------- 页面：私人定制 · 商户合作（海报） ----------
  function renderCustom() {
    var debox = "https://m.debox.pro/card?id=twbzjko7&invite_code=twbzjko7";
    var tags = ["数据监测", "团队分析", "社群机器人", "商户 OTC", "链上数据", "专属工具"];
    app.innerHTML = '<section class="poster">' +
      '<div class="poster-glow"></div><div class="poster-grid"></div>' +
      '<div class="poster-in">' +
      '<div class="poster-top"><span class="poster-brand">AiLGNS 服务站</span><span class="poster-line"></span><span class="poster-sub">PRIVATE CUSTOM</span></div>' +
      '<div class="poster-kicker">私人定制 · 商户合作</div>' +
      '<h1 class="poster-title">你要的<br>都能做！</h1>' +
      '<div class="poster-en">WHATEVER YOU NEED, WE BUILD IT.</div>' +
      '<div class="poster-tags">' + tags.map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div>" +
      '<a class="poster-cta" href="' + debox + '" target="_blank" rel="noopener">联系站长 DeBox　→</a>' +
      '<div class="poster-foot">一对一沟通 · 方案报价面议 · 交付后持续调整</div>' +
      "</div></section>" +
      '<p class="note" style="text-align:center">本站为 AWAKE HELIX 官方认证的 AiLGNS OTC 服务站。本站不会索取私钥或助记词。</p>';
  }

  // 访问统计（内部群日报用）：打开网站记一次访问，今天第一次打开再记一位访客；查一个地址记一次查询。只记次数，不记地址
  function track(e) { try { navigator.sendBeacon("/api/hit?e=" + e); } catch (x) { /* 统计失败不影响使用 */ } }
  var tracked = {};
  function route() {
    var id = ++renderId;
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var extra = window.AIL.pages;
    var tab = parts[0] || "otc", a = (parts[1] || "").toLowerCase();
    if (["flows", "wallet", "team", "custom"].indexOf(tab) < 0 && !extra[tab]) tab = "otc";
    document.title = (PAGE_TITLES[tab] ? PAGE_TITLES[tab] + " · " : "") + "AiLGNS 服务站";
    if (a && !isAddr(a)) a = "";
    if (a && ["wallet", "team", "growth", "tree", "upline"].indexOf(tab) >= 0 && !tracked[tab + a]) { tracked[tab + a] = 1; track("q_" + tab); }
    document.querySelectorAll(".tabs a").forEach(function (el) {
      var on = (el.getAttribute("data-tabs") || el.getAttribute("data-tab")).split(" ").indexOf(tab) >= 0;
      el.classList.toggle("on", on);
      if (on) { var nav = el.parentNode; nav.scrollLeft = Math.max(0, el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2); } // 手机上当前栏目滚到看得见
    });
    tip.style.display = "none";
    window.scrollTo(0, 0);
    guide(tab, parts);
    orderBar(tab);
    if (extra[tab]) extra[tab](id, a);
    else if (tab === "wallet") renderWallet(id, a);
    else if (tab === "team") renderTeam(id, a);
    else if (tab === "custom") renderCustom();
    else renderFlows(id);
  }

  // 每个页面最上面一张「这页是干嘛的 + 编号步骤」引导卡：客户一进来就知道点哪里
  // 步骤目标：标题文字（跳到那一块）、"click:选择器"（替客户点那个按钮）、"#/路由"（跳页面）
  var GUIDES = {
    otc: ["💱", "AiLGNS 担保交易", "币先锁进合约、成交才放出，0 滑点，手续费 1%", [["我要买 AiLGNS", "买入 AiLGNS"], ["我要卖 AiLGNS", "卖出 AiLGNS"], ["自己定价挂单", "click:[data-goform=sell]"], ["📊 交易所盘口", "#/trade"]]],
    trade: ["📊", "交易所盘口", "订单簿 + K 线 + 一键买卖，撮合在链上合约里完成", [["买入", "sel:.tr-form"], ["看盘口", "sel:.tr-book"], ["我的委托", "sel:.tr-mine"], ["回普通版", "#/otc"]]],
    names: ["🌐", ".ailgns 域名", "注册一个属于你的名字，可以设为主号、转赠、挂单卖", [["注册新域名", ".ailgns 域名"], ["查我的域名", "查询域名"], ["买别人的域名", "域名市场"], ["卖我的域名", "click:#nm-sellgo"]]],
    oracle: ["🔮", "每日预言家", "免费猜今晚揭晓价，猜中平分大奖", [["看奖池", "sel:.or-pool"], ["怎么玩", "sel:.or-how"], ["提交我的预言", "✍️ 预测"], ["开通获奖通知", "揭晓通知"]]],
    lend: ["🤝", "借贷", "押 AiLGNS 借 DAI，或者出借 DAI 赚利息，合约托管", [["我要借 DAI", "押 AiLGNS 借 DAI"], ["我要出借 DAI", "想借 DAI 的人"], ["正在借的单", "借款中"], ["怎么还款", "还款怎么操作"]]],
    member: ["👑", "会员", "开通会员享受更多权益，三步完成", [["填开通地址", "第 1 步"], ["选付款方式", "选择付款方式"], ["付款开通", "付款开通"]]],
    rank: ["🏆", "荣耀榜", "OTC 成交大户排行，名字永久留名", [["看排行", "sel:#app .card"], ["名人堂", "名人堂"], ["段位规则", "段位规则"]]],
    feedback: ["📮", "问题反馈", "遇到问题提交工单，客服处理后回复你", [["提交问题", "问题反馈"], ["查看处理进度", "我的反馈进度"]]],
    inbox: ["🔔", "收件箱", "成交、借贷、工单回复、中奖、留言的通知都在这里，不用加任何社交软件", [["钱包签名登录", "click:#ib-go"], ["开启浏览器通知", "click:#ib-notify"], ["全部已读", "click:#ib-seen"]]],
    scan: ["📒", "AiLGNS 账本", "输入域名或钱包地址，每一笔买卖、挂单、注册、借贷都写成人话", [["查我的钱包", "sel:#sc-q"], ["我的钱", "我的钱"], ["我做过的事", "我做过的事"]]]
  };
  // 全站「查我的订单」条：OTC / 盘口 / 借贷 / 域名 / 会员 / 预言家 / 荣耀榜 页顶部都有，输入框自动填当前钱包
  var OQ = { otc: "otc", trade: "otc", lp: "otc", flows: "otc", lend: "loan", names: "names", member: "other", oracle: "other", rank: "other", wallet: "other", team: "other" }, oqCtl = null;
  function orderBar(tab) {
    var host = document.getElementById("oq");
    if (!host) { host = document.createElement("div"); host.id = "oq"; host.className = "wrap"; var app = document.getElementById("app"); app.parentNode.insertBefore(host, app); }
    var c = OQ[tab];
    host.hidden = !c || !window.AIL.orderQuery;
    if (host.hidden) return;
    if (!oqCtl) oqCtl = window.AIL.orderQuery(host, c); else oqCtl.set(c);
  }
  // 加 OTC 交流群：弹出 DeBox 群二维码（页面任何 [data-group] 按钮都能打开）
  var GROUP_LINK = ""; // 群链接解析出来后填这里，有链接就多一个「在 DeBox 里打开」按钮
  function groupModal() {
    var old = document.getElementById("grp-m"); if (old) old.remove();
    var d = document.createElement("div"); d.id = "grp-m"; d.className = "grp-m";
    d.innerHTML = '<div class="grp-c"><button type="button" class="grp-x" aria-label="关闭">×</button><h3>💬 加入 AiLGNS OTC 交流群</h3><p class="muted">用 <b>DeBox</b> 扫一扫，进群聊 OTC、域名、预言家；站长和机器人都在群里</p>' +
      '<img src="icons/otc-group-qr.png?v=1" alt="OTC 交流群二维码" width="240" height="250">' +
      (GROUP_LINK ? '<a class="nm-go" href="' + GROUP_LINK + '" target="_blank" rel="noopener">手机上点这里直接加群 →</a>' : "") +
      '<p class="muted grp-tip">手机：长按二维码保存 → 打开 DeBox → 扫一扫 → 相册选图。没有 DeBox？<a href="#/app">先看这里 →</a></p></div>';
    document.body.appendChild(d);
    var close = function () { d.remove(); };
    d.onclick = function (e) { if (e.target === d || e.target.closest(".grp-x") || e.target.closest("a[href^='#/']")) close(); };
  }
  document.addEventListener("click", function (e) { if (e.target.closest("[data-group]")) { e.preventDefault(); groupModal(); } });
  // 刚挂单 / 刚操作的标记：10 分钟内在「我的挂单」和账本里高亮，解决「挂完找不到」
  var just = {
    set: function (kind, key) { try { var l = JSON.parse(localStorage.getItem("just") || "[]").filter(function (x) { return Date.now() - x.at < 600e3; }); l.push({ k: kind, key: String(key || "").toLowerCase(), at: Date.now() }); localStorage.setItem("just", JSON.stringify(l.slice(-10))); } catch (e) {} },
    list: function (kind) { try { return JSON.parse(localStorage.getItem("just") || "[]").filter(function (x) { return Date.now() - x.at < 600e3 && (!kind || x.k === kind); }); } catch (e) { return []; } },
    has: function (kind, key) { key = String(key || "").toLowerCase(); return this.list(kind).some(function (x) { return !x.key || x.key === key; }); }
  };
  function guide(tab, parts) {
    var box = document.getElementById("guide"); if (!box) return;
    var g = GUIDES[tab];
    document.body.classList.toggle("has-guide", !!g && !parts[1]);
    if (!g || parts[1]) { box.innerHTML = ""; return; }
    box.innerHTML = '<section class="gd"><div class="gd-h"><span class="gd-i">' + g[0] + '</span><div><b>' + g[1] + "</b><small>" + g[2] + '</small></div></div><div class="gd-s">' +
      g[3].map(function (st, i) { return '<button type="button" data-gd="' + st[1].replace(/"/g, "&quot;") + '"><i>' + (i + 1) + "</i>" + st[0] + "</button>"; }).join("") + "</div></section>";
  }
  function gdFind(t) {
    if (t.indexOf("sel:") === 0) return document.querySelector(t.slice(4));
    var hs = document.querySelectorAll("#app h1, #app h2, #app h3");
    for (var i = 0; i < hs.length; i++) if (hs[i].textContent.indexOf(t) >= 0) return hs[i].closest("section, .card") || hs[i];
    return null;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-gd]"); if (!b) return;
    var t = b.getAttribute("data-gd"), n = 0;
    if (t.indexOf("#/") === 0) { location.hash = t; return; }
    if (t.indexOf("click:") === 0) { var c = document.querySelector(t.slice(6)); if (c) c.click(); return; }
    (function go() {
      var el = gdFind(t);
      if (!el) { if (++n < 20) setTimeout(go, 300); return; }
      var top = el.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      el.classList.remove("gd-flash"); void el.offsetWidth; el.classList.add("gd-flash");
    })();
  });
  // 手机上往下滑收起顶部导航，往上滑再出来，内容多一块屏幕
  (function () {
    var last = 0, top = document.querySelector("header.top");
    if (!top) return;
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      if (y > last + 6 && y > 140) top.classList.add("hid");
      else if (y < last - 6 || y < 60) top.classList.remove("hid");
      last = y;
    }, { passive: true });
  })();

  document.addEventListener("submit", function (e) {
    var f = e.target.closest("form.search");
    if (!f || f.hasAttribute("data-custom")) return;
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
  // 给 member.js 等扩展页面用的公共工具
  // 出错时：屏幕底部弹出原因（不会被滚走），同时把页面滚到出问题的地方，客户照着提示改了再点
  // 合约报错翻译成客户看得懂的话（去掉一长串 0x 数据）
  function friendly(t) {
    t = String(t || "");
    if (/NOTHING_FILLED/.test(t)) return "你要吃的单刚刚被别人抢先成交或撤单了，这一笔一张都没吃到，已自动作废：你的币没有被扣。请刷新挂单列表，看最新价格再点一次。";
    return t.replace(/:?\s*0x[0-9a-f]{40,}/gi, "").trim() || "操作没完成，请刷新页面再试一次";
  }
  function errTip(t, el) {
    var old = document.getElementById("err-tip");
    if (old) old.remove();
    var d = document.createElement("div");
    d.id = "err-tip";
    d.className = "err-tip";
    d.innerHTML = '<b>⚠️ 没成功，原因：</b><span></span><button type="button">知道了</button>';
    d.querySelector("span").textContent = friendly(t);
    d.querySelector("button").onclick = function () { d.remove(); };
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.remove(); }, 15000);
    if (el && el.scrollIntoView && !el.closest(".modal")) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  // 全站兜底：点了按钮以后几秒内冒出来、又没人处理的错误，也弹出来告诉客户，不再「点了没反应」
  var lastTap = 0;
  document.addEventListener("click", function () { lastTap = Date.now(); }, true);
  var lastNav = 0;
  window.addEventListener("hashchange", function () { lastNav = Date.now(); });
  function oops(e) {
    if (Date.now() - lastTap > 8000) return; // 后台自动刷新出的错不打扰客户
    // 切换页面后，上一页还没加载完的内容写回已经不在的位置（Cannot set properties of null）：只是旧页面的残留，不影响操作，不弹
    if (Date.now() - lastNav < 15000 && /of null|of undefined/.test(String(e && e.message))) { try { console.warn("旧页面残留：", e); } catch (x) {} return; }
    var W = window.AIL && window.AIL.wallet, m = "";
    try { m = W && W.error ? W.error(e) : ""; } catch (x) {}
    errTip(m || (e && (e.message || e.reason)) || "操作没完成，请刷新页面再试一次");
  }
  window.addEventListener("unhandledrejection", function (ev) { oops(ev.reason); });
  window.addEventListener("error", function (ev) { if (ev.error) oops(ev.error); });
  window.AIL = { errTip: errTip, freshCheck: function () { freshCheck(); }, toDai: toDai, timeBJ: timeBJ,
    // 站长自己的钱包：本站不显示它们的域名、创世编号，域名搜到也不显示指向哪个地址（链上匿名）
    hidden: { "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6": 1, "0x89dd06754bb239b6c4c92bc47c8fa72889084e27": 1 },
    // 站长和四哥注册的前 4 个创世域名：不进「最近被抢注」、不显示编号和持有人（站长要求）
    hiddenNames: { "加拿大局长.ailgns": 1, "aiotc.ailgns": 1, "四哥.ailgns": 1, "觉醒人生.ailgns": 1, "加拿大局长.lgns": 1 },
    pages: {}, shorts: SHORTS, app: app, api: api, rpc: rpc, call: call, pad: pad, word: word, getJSON: getJSON,
    allReferrals: allReferrals, pool: pool, n: n, fmt: fmt, wan: wan, short: short, isAddr: isAddr, esc: esc, lv: lv, just: just,
    addrLink: addrLink, searchBox: searchBox, renderTeam: renderTeam, isCurrent: function (id) { return id === renderId; },
    track: track,
    start: function () {
      var today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), first = false;
      try { first = localStorage.getItem("st:seen") !== today; if (first) localStorage.setItem("st:seen", today); } catch (x) { /* 无痕模式 */ }
      track(first ? "v1" : "v");
      // 从手机桌面图标打开的：每天第一次记一下（桌面 App 日活）；这台手机第一次从桌面打开记一次「新装」
      if ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone) {
        try {
          if (first) track("a1");
          if (!localStorage.getItem("st:app")) { localStorage.setItem("st:app", today); track("an"); }
        } catch (x) { /* 无痕模式 */ }
      }
      // 自动刷新带的 ?v=… 只为绕过缓存，加载完就从地址栏抹掉，复制出去只剩 https://ailgns.dev/#/页面
      if (/[?&]v=/.test(location.search)) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (x) { /* 忽略 */ } }
      window.addEventListener("hashchange", route); route();
      freshCheck(true);
      window.addEventListener("hashchange", function () { freshCheck(); });
    }
  };
  // 钱包内置浏览器经常把首页缓存很久，导致脚本还是旧版（新功能看不到、按钮没反应）：
  // 打开后悄悄拉一次最新首页，脚本版本号和当前不一样就自动刷新一次（每次会话最多一次，免得循环）
  // 打开网站、切换页面、点开菜单时都查一下有没有新版本（最多 1 分钟查一次）；有就带上随机参数重新打开，绕过钱包浏览器的旧缓存
  // 同一个新版本只自动刷新一次，避免钱包死活给旧页面时一直刷新
  var lastFresh = 0;
  function freshCheck(now) {
    try {
      if (!now && Date.now() - lastFresh < 60e3) return;
      lastFresh = Date.now();
      var mine = Array.prototype.map.call(document.scripts, function (s) { return (s.getAttribute("src") || "").match(/[a-z]+\.js\?v=[a-z0-9]+/); }).filter(Boolean).map(String).sort().join(",");
      if (!mine) return;
      fetch("/?fresh=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (html) {
        var latest = (html.match(/[a-z]+\.js\?v=[a-z0-9]+/g) || []).sort().join(",");
        if (!latest || latest === mine || sessionStorage.getItem("fresh:to") === latest) return;
        sessionStorage.setItem("fresh:to", latest);
        location.replace(location.pathname + "?v=" + Date.now() + location.hash);
      }).catch(function () {});
    } catch (e) { /* 忽略 */ }
  }
})();
