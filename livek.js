// 实时 K 线（2026-11-05 站长要求「1–10 秒一根、一直在波动」）：每 3 秒读一次 DEX 池子储备算现价，攒成 5 秒一根的 K 线画出来
// 全是链上真实价格，不造数据；没成交的几秒就是平的，但时间轴一直往前走。共用：盘口页、预言家页。用法：A.liveK(svgEl, { bucket: 5, span: 600, onPrice: fn })
(function () {
  "use strict";
  var A = window.AIL;
  var PAIR = "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0"; // AiLGNS/DAI：token0 = AiLGNS，token1 = DAI（都是 18 位）
  function load(k) { try { return JSON.parse(sessionStorage.getItem("livek:" + k) || "[]"); } catch (e) { return []; } }
  function save(k, t) { try { sessionStorage.setItem("livek:" + k, JSON.stringify(t.slice(-1200))); } catch (e) {} }
  function dexPrice() {
    return A.wallet.rpcOn("anubis", "eth_call", [{ to: PAIR, data: "0x0902f1ac" }, "latest"]).then(function (r) {
      var w = r.slice(2), r0 = Number(BigInt("0x" + w.slice(0, 64))), r1 = Number(BigInt("0x" + w.slice(64, 128)));
      return r1 / r0;
    });
  }
  // 本站 OTC 价（站长 2026-11-05 定：K 线用我们自己的盘口，不用 DEX）：买一卖一的中间价；只有一边就用那一边；盘口空了才退回 DEX
  function otcPrice() {
    return fetch("/api/book?m=ailgns").then(function (r) { return r.json(); }).then(function (j) {
      var w = (j.orders || "0x").slice(2).match(/.{64}/g) || [], n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0, now = Date.now() / 1000, ask = 0, bid = 0;
      for (var i = 0; i < n; i++) {
        var o = w.slice(2 + i * 7, 9 + i * 7); if (o.length < 7) break;
        var sell = o[1].slice(-1) === "1", open = o[2].slice(-1) === "1", exp = Number(BigInt("0x" + o[3])), gT = Number(BigInt("0x" + o[4])), wT = Number(BigInt("0x" + o[5])), gL = BigInt("0x" + o[6]);
        if (!open || exp <= now || gL === 0n || !gT || !wT) continue;
        var p = sell ? wT / gT : gT / wT;
        if (sell) { if (!ask || p < ask) ask = p; } else if (!bid || p > bid) bid = p;
      }
      if (ask && bid) return { p: (ask + bid) / 2, bid: bid, ask: ask };
      if (ask || bid) return { p: ask || bid, bid: bid, ask: ask };
      return dexPrice().then(function (p) { return { p: p, dex: true }; });
    });
  }
  function oraclePx() { return fetch("/api/oracle").then(function (r) { return r.json(); }).then(function (d) { return d.funds && d.funds.otc ? d.funds.otc.px : 0; }).catch(function () { return 0; }); }
  A.liveK = function (el, opts) {
    opts = opts || {};
    var every = opts.every || 3000, bucket = opts.bucket || 5, span = opts.span || 600, key = opts.key || ("ailgns-" + (opts.src || "otc"));
    var ticks = load(key), timer = 0, dead = false, lastP = null, orc = 0, orcAt = 0, info = {};
    var src = opts.src || "otc", price = src === "dex" ? function () { return dexPrice().then(function (p) { return { p: p }; }); } : otcPrice;
    function candles() {
      var now = Math.floor(Date.now() / 1000), from = now - span, m = {};
      ticks.forEach(function (t) {
        if (t[0] < from - bucket) return;
        var b = Math.floor(t[0] / bucket) * bucket;
        if (!m[b]) m[b] = { t: b, o: t[1], h: t[1], l: t[1], c: t[1] }; else { var c = m[b]; c.h = Math.max(c.h, t[1]); c.l = Math.min(c.l, t[1]); c.c = t[1]; }
      });
      var out = [], prev = null, b0 = Math.floor(from / bucket) * bucket, bN = Math.floor(now / bucket) * bucket;
      for (var b = b0; b <= bN; b += bucket) {
        if (m[b]) { if (prev !== null) m[b].o = prev; out.push(m[b]); prev = m[b].c; }
        else if (prev !== null) out.push({ t: b, o: prev, h: prev, l: prev, c: prev, gap: true });
      }
      return out;
    }
    function draw() {
      if (!el || !el.isConnected) return;
      var c = candles(); if (!c.length) return;
      var W0 = Math.max(240, el.clientWidth || 360), H0 = Math.max(120, el.clientHeight || 160), L = 6, R = W0 - 66, T = 10, B = H0 - 24, hi = -Infinity, lo = Infinity;
      c.forEach(function (x) { hi = Math.max(hi, x.h); lo = Math.min(lo, x.l); });
      var pad = Math.max((hi - lo) * 0.25, hi * 0.0004); hi += pad; lo -= pad; // 波动很小时也撑开一点，看得见起伏
      var y = function (p) { return T + (hi - p) / (hi - lo) * (B - T); }, cw = (R - L) / c.length, svg = "";
      for (var g = 0; g <= 4; g++) { var gp = lo + (hi - lo) * g / 4, gy = y(gp); svg += '<line x1="' + L + '" x2="' + R + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" class="or-grid"/><text x="' + (R + 6) + '" y="' + (gy + 4).toFixed(1) + '" class="or-ct">' + gp.toFixed(3) + "</text>"; }
      var lab = Math.max(1, Math.round(c.length / 6));
      c.forEach(function (x, i) {
        var cx = L + cw * i + cw / 2, up = x.c >= x.o, col = up ? "or-up" : "or-dn", top = y(Math.max(x.o, x.c)), bot = y(Math.min(x.o, x.c));
        svg += '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + y(x.h).toFixed(1) + '" y2="' + y(x.l).toFixed(1) + '" class="' + col + '"/><rect x="' + (cx - cw * 0.36).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + Math.max(1, cw * 0.72).toFixed(1) + '" height="' + Math.max(1, bot - top).toFixed(1) + '" class="' + col + '"' + (x.gap ? ' opacity=".45"' : "") + "/>";
        if (i % lab === 0) { var d = new Date((x.t + 8 * 3600) * 1000); svg += '<text x="' + Math.max(cx, 18).toFixed(1) + '" y="' + (H0 - 7) + '" text-anchor="middle" class="or-ct">' + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + ":" + String(d.getUTCSeconds()).padStart(2, "0") + "</text>"; }
      });
      if (orc && orc > lo && orc < hi) { var oy = y(orc); svg += '<line x1="' + L + '" x2="' + R + '" y1="' + oy.toFixed(1) + '" y2="' + oy.toFixed(1) + '" class="lk-orc"/><text x="' + (L + 4) + '" y="' + (oy - 3).toFixed(1) + '" class="or-ct lk-orct">预言机 ' + orc.toFixed(3) + "</text>"; }
      if (info.bid && info.ask) { if (info.ask > lo && info.ask < hi) svg += '<text x="' + (L + 4) + '" y="' + (y(info.ask) - 3).toFixed(1) + '" class="or-ct lk-ask">卖一 ' + info.ask.toFixed(3) + "</text>"; if (info.bid > lo && info.bid < hi) svg += '<text x="' + (L + 4) + '" y="' + (y(info.bid) + 11).toFixed(1) + '" class="or-ct lk-bid">买一 ' + info.bid.toFixed(3) + "</text>"; }
      var last = c[c.length - 1], ly = y(last.c);
      svg += '<line x1="' + L + '" x2="' + R + '" y1="' + ly.toFixed(1) + '" y2="' + ly.toFixed(1) + '" class="or-lastl"/><rect x="' + (R + 1) + '" y="' + (ly - 9).toFixed(1) + '" width="60" height="18" rx="4" class="or-lastb lk-pulse"/><text x="' + (R + 31) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="middle" class="or-lastt">' + last.c.toFixed(3) + "</text>";
      el.setAttribute("viewBox", "0 0 " + W0 + " " + H0); el.innerHTML = svg;
    }
    function tick() {
      if (dead || !el.isConnected) return stop();
      price().then(function (x) {
        var p = x.p, now = Math.floor(Date.now() / 1000);
        info = x;
        ticks.push([now, p]); if (ticks.length > 2000) ticks = ticks.slice(-1200);
        save(key, ticks); draw();
        if (opts.onPrice) opts.onPrice(p, lastP, x); lastP = p;
      }, function () {});
      if (src !== "dex" && Date.now() - orcAt > 60000) { orcAt = Date.now(); oraclePx().then(function (v) { orc = v || orc; }); }
    }
    function stop() { dead = true; clearInterval(timer); }
    draw(); tick(); timer = setInterval(tick, every);
    return { stop: stop, redraw: draw };
  };
})();
