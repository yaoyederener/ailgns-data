// 📈 币安式 K 线组件：A.kchart(容器, { i: "1m" }) → { set(i), stop() }
// 数据 /api/candles（池子真实成交聚合）；蜡烛 + 成交量 + MA7/MA25 + 十字光标 + 最新价线 + OTC 预言机虚线；拖动平移、滚轮/双指缩放；每 5 秒刷新
(function () {
  "use strict";
  var A = window.AIL;
  var UP = "#0ecb81", DN = "#f6465d", GRID = "#efe9fb", TXT = "#6b5aa6", AX = "#8d7fb8", MA7 = "#f0b90b", MA25 = "#9b5cf6", ORC = "#7c5cff";
  var IVS = [["1m", "1 分"], ["5m", "5 分"], ["15m", "15 分"], ["1h", "1 时"], ["4h", "4 时"], ["1d", "1 日"]];
  function fmt(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function vol(v) { return v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0); }
  function bj(t, iv) { var d = new Date(t * 1000 + 8 * 3600e3), p = function (n) { return String(n).padStart(2, "0"); }, md = p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()), hm = p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()); return iv === "1d" ? md : iv === "1h" || iv === "4h" ? md + " " + hm : hm; }
  function bjFull(t) { var d = new Date(t * 1000 + 8 * 3600e3), p = function (n) { return String(n).padStart(2, "0"); }; return p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()); }
  function ma(c, n, i) { if (i < n - 1) return null; var s = 0; for (var k = i - n + 1; k <= i; k++) s += c[k][4]; return s / n; }

  A.kchart = function (host, opt) {
    opt = opt || {};
    var iv = opt.i || "15m", data = [], cur = 0, orc = 0, orcAt = 0, timer = null, dead = false, done = false;
    var cw = 9, cwDraw = 9, off = 0, hover = -1, drag = null, pinch = 0;
    host.classList.add("kc");
    host.innerHTML = '<div class="kc-top"><div class="kc-ivs">' + IVS.map(function (x) { return '<button type="button" data-i="' + x[0] + '"' + (x[0] === iv ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + '</div><div class="kc-legend" id="kc-leg"></div></div><div class="kc-price" id="kc-price"></div><div class="kc-wrap"><canvas class="kc-cv"></canvas></div><div class="kc-foot muted">' + (opt.foot || "AiLGNS/DAI 池子真实成交 · 北京时间 · 黄线 MA7 · 紫线 MA25 · 虚线 OTC 预言机价") + '<span id="kc-load"></span></div>';
    var cv = host.querySelector("canvas"), ctx = cv.getContext("2d"), leg = host.querySelector("#kc-leg"), wrap = host.querySelector(".kc-wrap");
    host.querySelectorAll(".kc-ivs button").forEach(function (b) { b.onclick = function () { try { sessionStorage.setItem("kc:pick", b.getAttribute("data-i")); } catch (e) {} set(b.getAttribute("data-i")); }; });

    // 秒开：上次看过的数据存在本机，先画出来，再用接口数据无感替换
    function cacheGet() { try { var j = JSON.parse(localStorage.getItem("kc:" + iv) || "null"); return j && j.c && j.c.length ? j : null; } catch (e) { return null; } }
    function cacheSet(d) { try { localStorage.setItem("kc:" + iv, JSON.stringify({ c: d.c.slice(-300), cur: d.cur, done: d.done })); } catch (e) {} }
    function load() {
      if (opt.alive && !opt.alive()) { dead = true; clearInterval(timer); return; }
      if (dead) return;
      var want = iv;
      fetch("/api/candles?i=" + iv + "&n=500").then(function (r) { return r.json(); }).then(function (d) {
        if (dead || want !== iv || !d || !d.c) return;
        data = d.c; cur = d.cur || cur; done = !!d.done; cacheSet(d);
        var l = host.querySelector("#kc-load"); if (l) l.textContent = done ? "" : " · 历史数据补读中…";
        draw();
      }).catch(function () {});
      if (Date.now() - orcAt > 60000) { orcAt = Date.now(); fetch("/api/oracle").then(function (r) { return r.json(); }).then(function (d) { orc = d.funds && d.funds.otc ? d.funds.otc.px || 0 : 0; }).catch(function () {}); }
    }
    function set(i) { iv = i; off = 0; hover = -1; host.querySelectorAll(".kc-ivs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-i") === i); }); var c = cacheGet(); data = c ? c.c : []; if (c) cur = c.cur || cur; draw(); load(); }
    function size() { var r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; var lim = host.parentElement ? host.parentElement.clientWidth : 0; if (lim && r.width > lim) r = { width: lim, height: r.height }; /* 别被自己撑大 */ cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); cv.style.width = r.width + "px"; cv.style.height = r.height + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return r; }

    function draw() {
      var r = size(), W = r.width, H = r.height, AXW = 64, AXH = 20, plotW = W - AXW, pH = Math.floor((H - AXH) * 0.74), vTop = pH + 6, vH = H - AXH - vTop;
      ctx.clearRect(0, 0, W, H);
      if (!data.length) { ctx.fillStyle = TXT; ctx.font = "13px system-ui"; ctx.textAlign = "center"; ctx.fillText("K 线读取中…", W / 2, H / 2); return; }
      var cwE = data.length * cw < plotW ? Math.min(26, plotW / data.length) : cw; // 数据不够铺满时自动撑开（币安也这样）
      var n = Math.max(5, Math.floor(plotW / cwE)), end = data.length - off, start = Math.max(0, end - n), vis = data.slice(start, end);
      if (!vis.length) return;
      var hi = -Infinity, lo = Infinity, vmax = 0;
      vis.forEach(function (c, k) { hi = Math.max(hi, c[2]); lo = Math.min(lo, c[3]); vmax = Math.max(vmax, c[5]); var m = ma(data, 25, start + k); if (m) { hi = Math.max(hi, m); lo = Math.min(lo, m); } });
      if (orc && orc > lo * 0.9 && orc < hi * 1.1) { hi = Math.max(hi, orc); lo = Math.min(lo, orc); }
      var pad = Math.max((hi - lo) * 0.08, hi * 0.0002); hi += pad; lo -= pad;
      var y = function (p) { return pH - (p - lo) / (hi - lo) * pH; }, x = function (k) { return k * cwE + cwE / 2; }; cwDraw = cwE;
      // 网格 + 右轴
      ctx.font = "11px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      for (var g = 0; g <= 5; g++) { var yy = Math.round(pH * g / 5) + 0.5, pv = hi - (hi - lo) * g / 5; ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.fillStyle = AX; ctx.fillText(fmt(pv, 2), plotW + 6, yy); }
      // 成交量
      vis.forEach(function (c, k) { var up = c[4] >= c[1], h = vmax ? c[5] / vmax * vH : 0; ctx.fillStyle = up ? "rgba(14,203,129,.45)" : "rgba(246,70,93,.45)"; ctx.fillRect(x(k) - cwE * 0.35, vTop + vH - h, cwE * 0.7, h); });
      ctx.fillStyle = AX; ctx.fillText("量 " + vol(vmax), plotW + 6, vTop + 6);
      // 时间轴
      var step = Math.ceil(70 / cwE); ctx.textAlign = "center"; ctx.fillStyle = AX;
      vis.forEach(function (c, k) { if ((start + k) % step === 0) { ctx.fillText(bj(c[0], iv), x(k), H - AXH / 2); ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(Math.round(x(k)) + 0.5, 0); ctx.lineTo(Math.round(x(k)) + 0.5, vTop + vH); ctx.stroke(); } });
      // 蜡烛
      vis.forEach(function (c, k) {
        var up = c[4] >= c[1], col = up ? UP : DN, cx = Math.round(x(k)) + 0.5, bw = Math.max(1, cwE * 0.62);
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, y(c[2])); ctx.lineTo(cx, y(c[3])); ctx.stroke();
        var top = y(Math.max(c[1], c[4])), bh = Math.max(1, Math.abs(y(c[1]) - y(c[4])));
        ctx.fillRect(cx - bw / 2, top, bw, bh);
      });
      // MA
      [[7, MA7], [25, MA25]].forEach(function (m) { ctx.strokeStyle = m[1]; ctx.lineWidth = 1.2; ctx.beginPath(); var pen = false; vis.forEach(function (c, k) { var v = ma(data, m[0], start + k); if (v === null) return; if (!pen) { ctx.moveTo(x(k), y(v)); pen = true; } else ctx.lineTo(x(k), y(v)); }); ctx.stroke(); });
      // OTC 预言机虚线
      if (orc && orc > lo && orc < hi) { ctx.setLineDash([4, 4]); ctx.strokeStyle = ORC; ctx.beginPath(); ctx.moveTo(0, y(orc)); ctx.lineTo(plotW, y(orc)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = ORC; ctx.textAlign = "left"; ctx.fillText("预言机 " + fmt(orc, 2), 6, y(orc) - 8); }
      // 最新价
      var last = data[data.length - 1], lp = last[4], lup = lp >= last[1];
      if (lp > lo && lp < hi) { ctx.setLineDash([3, 3]); ctx.strokeStyle = lup ? UP : DN; ctx.beginPath(); ctx.moveTo(0, y(lp)); ctx.lineTo(plotW, y(lp)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = lup ? UP : DN; ctx.fillRect(plotW, y(lp) - 9, AXW, 18); ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(fmt(lp, 2), plotW + 6, y(lp)); }
      // 十字光标
      var hi_ = hover >= 0 && hover < vis.length ? vis[hover] : null, c0 = hi_ || last;
      if (hi_) { var hx = Math.round(x(hover)) + 0.5; ctx.setLineDash([3, 3]); ctx.strokeStyle = "#a89cd4"; ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, vTop + vH); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = "#4b3d8f"; var tw = 80; ctx.fillRect(Math.min(Math.max(0, hx - tw / 2), plotW - tw), H - AXH, tw, AXH); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(bjFull(c0[0]), Math.min(Math.max(tw / 2, hx), plotW - tw / 2), H - AXH / 2); }
      var chg = c0[1] ? (c0[4] - c0[1]) / c0[1] * 100 : 0, colC = c0[4] >= c0[1] ? UP : DN;
      var first = vis[0], pc = first[1] ? (lp - first[1]) / first[1] * 100 : 0, pEl = host.querySelector("#kc-price");
      if (pEl) pEl.innerHTML = '<b style="color:' + (pc >= 0 ? UP : DN) + '">' + fmt(lp, 2) + ' <small>DAI</small></b><span style="color:' + (pc >= 0 ? UP : DN) + '">' + (pc >= 0 ? "▲ +" : "▼ ") + pc.toFixed(2) + "%</span><small class=\"muted\">本窗口 " + vis.length + " 根 · " + (IVS.filter(function (x) { return x[0] === iv; })[0] || ["", iv])[1] + "线</small>";
      leg.innerHTML = '<span class="kc-t">' + bjFull(c0[0]) + "</span><span>开 <b style=\"color:" + colC + '">' + fmt(c0[1], 2) + "</b></span><span>高 <b style=\"color:" + colC + '">' + fmt(c0[2], 2) + "</b></span><span>低 <b style=\"color:" + colC + '">' + fmt(c0[3], 2) + "</b></span><span>收 <b style=\"color:" + colC + '">' + fmt(c0[4], 2) + "</b></span><span>涨跌 <b style=\"color:" + colC + '">' + (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%</b></span><span>量 <b>" + vol(c0[5]) + " DAI</b></span>";
    }
    // 交互：拖动平移、滚轮缩放、悬停十字、触屏
    function px2idx(clientX) { var r = cv.getBoundingClientRect(); return Math.floor((clientX - r.left) / cwDraw); }
    cv.addEventListener("mousemove", function (e) { if (drag) { var dx = e.clientX - drag.x; var dn = Math.round(dx / cw); if (dn) { off = Math.min(Math.max(0, drag.off + dn), Math.max(0, data.length - 10)); draw(); } return; } hover = px2idx(e.clientX); draw(); });
    cv.addEventListener("mouseleave", function () { hover = -1; drag = null; draw(); });
    cv.addEventListener("mousedown", function (e) { drag = { x: e.clientX, off: off }; e.preventDefault(); });
    window.addEventListener("mouseup", function () { drag = null; });
    cv.addEventListener("wheel", function (e) { e.preventDefault(); cw = Math.min(24, Math.max(3, cw * (e.deltaY > 0 ? 0.85 : 1.18))); draw(); }, { passive: false });
    cv.addEventListener("touchstart", function (e) { if (e.touches.length === 2) { pinch = Math.abs(e.touches[0].clientX - e.touches[1].clientX); return; } drag = { x: e.touches[0].clientX, off: off, t: Date.now() }; hover = px2idx(e.touches[0].clientX); draw(); }, { passive: true });
    cv.addEventListener("touchmove", function (e) { if (e.touches.length === 2 && pinch) { var d = Math.abs(e.touches[0].clientX - e.touches[1].clientX); cw = Math.min(24, Math.max(3, cw * d / pinch)); pinch = d; draw(); e.preventDefault(); return; } if (!drag) return; var dn = Math.round((e.touches[0].clientX - drag.x) / cw); if (Math.abs(dn) >= 1) { off = Math.min(Math.max(0, drag.off + dn), Math.max(0, data.length - 10)); hover = -1; } else hover = px2idx(e.touches[0].clientX); draw(); if (Math.abs(dn) >= 1) e.preventDefault(); }, { passive: false });
    cv.addEventListener("touchend", function () { drag = null; pinch = 0; setTimeout(function () { hover = -1; draw(); }, 1500); });
    var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null; if (ro) ro.observe(wrap);
    // 默认周期：自动挑「看起来在涨」的那个（窗口内涨幅 × 上涨连贯度最高），10 分钟内不换；用户手动点过的本次会话里优先
    function autoPick() {
      var pick = null; try { pick = sessionStorage.getItem("kc:pick"); } catch (e) {}
      if (pick && IVS.some(function (x) { return x[0] === pick; })) { if (pick !== iv) set(pick); return; }
      var au = null; try { au = JSON.parse(localStorage.getItem("kc:auto") || "null"); } catch (e) {}
      if (au && au.i && Date.now() - au.at < 600e3) { if (au.i !== iv) set(au.i); return; }
      var n = Math.max(30, Math.min(90, Math.floor((wrap.getBoundingClientRect().width - 64) / cw)));
      Promise.all(IVS.map(function (x) { return fetch("/api/candles?i=" + x[0] + "&n=" + n).then(function (r) { return r.json(); }).then(function (d) { return d && d.c ? d : null; }).catch(function () { return null; }); })).then(function (all) {
        if (dead) return;
        var best = null;
        all.forEach(function (d, k) {
          if (!d || d.c.length < 20) return; // 根数太少的周期不参与（历史还没补够）
          var c = d.c, f = c[0][1], l = c[c.length - 1][4], pct = f ? (l - f) / f * 100 : 0, up = 0;
          for (var j = 1; j < c.length; j++) if (c[j][4] >= c[j - 1][4]) up++;
          var cons = up / (c.length - 1), score = pct * (0.4 + cons);
          try { localStorage.setItem("kc:" + IVS[k][0], JSON.stringify({ c: c, cur: d.cur, done: d.done })); } catch (e) {}
          if (!best || score > best.score) best = { i: IVS[k][0], score: score, pct: pct };
        });
        if (!best) return;
        try { localStorage.setItem("kc:auto", JSON.stringify({ i: best.i, at: Date.now() })); } catch (e) {}
        if (best.i !== iv) set(best.i);
      });
    }
    var c0 = cacheGet(); if (c0) { data = c0.c; cur = c0.cur || 0; draw(); }
    load(); timer = setInterval(load, 5000); autoPick();
    return { set: set, stop: function () { dead = true; clearInterval(timer); if (ro) ro.disconnect(); } };
  };
})();
