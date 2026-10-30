// 地图式团队结构图（冰柱图）：自己在最左边一整列，往右每一列是下一层；每个地址一根竖条，团队越大竖条越高。
// 用 canvas 只画屏幕里看得见的部分；矮到看不清的小分支合并成一条紫色色带（颜色越深人越多）。
// 点一根竖条就放大到它的团队，双指缩放、拖动随意看。百万地址也只画屏幕里的几百根，所以手机上也流畅。
(function () {
  "use strict";

  var W = 220, GX = 10, ROW = 70, COL = W + GX; // 每列宽、列间距；每个叶子（没有下级的地址）占一行
  var BAND = 5; // 分支在屏幕上矮于这么多像素就合并成色带
  var FONT = "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif";
  var MONO = "ui-monospace, Menlo, Consolas, monospace";
  var C = { bg: "#f8f8ff", node: "#ffffff", line: "#cfc4ee", text: "#191839", muted: "#6e6a85", gold: "#7027d9", chip: "#efeaf9", hl: "#ff7a1a" };

  // ---------- 把团队整理成紧凑数组（百万级也省内存） ----------
  // src.n 个节点，0 是自己；src.parent(i) 上级；src.kids(i) 已按算力排好序的下级；src.info(i) → {a, team, power, self, level, zone, direct}
  function build(src) {
    var n = src.n, depth = new Uint16Array(n), start = new Int32Array(n + 1), list = new Int32Array(Math.max(0, n - 1));
    var leafStart = new Float64Array(n), leaves = new Float64Array(n), maxDepth = new Uint16Array(n);
    // 下级列表（CSR）：先数每个人有几个下级
    var cnt = new Int32Array(n);
    for (var i = 1; i < n; i++) cnt[src.parent(i)]++;
    for (i = 0; i < n; i++) start[i + 1] = start[i] + cnt[i];
    var fill = start.slice(0, n);
    // 按 src.kids 的顺序（算力从大到小）放进去
    var order = [0], head = 0;
    while (head < order.length) {
      var p = order[head++], ks = src.kids(p);
      for (var j = 0; j < ks.length; j++) { var k = ks[j]; list[fill[p]++] = k; depth[k] = depth[p] + 1; order.push(k); }
    }
    // 自下而上：叶子数、子树最深一层
    for (var o = order.length - 1; o >= 0; o--) {
      var v = order[o], a = start[v], b = start[v + 1], lv = 0, md = depth[v];
      for (var t = a; t < b; t++) { lv += leaves[list[t]]; if (maxDepth[list[t]] > md) md = maxDepth[list[t]]; }
      leaves[v] = b > a ? lv : 1;
      maxDepth[v] = md;
    }
    // 自上而下：每个人占的行从哪里开始
    for (o = 0; o < order.length; o++) {
      v = order[o];
      var at = leafStart[v];
      for (t = start[v]; t < start[v + 1]; t++) { leafStart[list[t]] = at; at += leaves[list[t]]; }
    }
    return { n: n, depth: depth, start: start, list: list, leafStart: leafStart, leaves: leaves, maxDepth: maxDepth, info: src.info, parent: src.parent };
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function fmt(v) { return Math.round(v).toLocaleString("en-US"); }
  function wan(v) { return v >= 1e8 ? (v / 1e8).toFixed(2) + "亿" : v >= 1e4 ? (v / 1e4).toFixed(v >= 1e6 ? 0 : 1) + "万" : fmt(v); }

  // ---------- 画 ----------
  // 冰柱图：每个地址是一根竖条，高度 = 它的团队在整棵树里占的行数；往右一列是下一层。
  // T：build 的结果；view：{k 纵向缩放, kx 横向缩放, tx, ty, w, h}；hl：高亮的节点
  function paint(g, T, view, hl) {
    var k = view.k, kx = view.kx || k, tx = view.tx, ty = view.ty, VW = view.w, VH = view.h;
    g.fillStyle = C.bg; g.fillRect(0, 0, VW, VH);
    var bars = [], bands = [];
    function sy(row) { return row * ROW * k + ty; }
    function sx(d) { return d * COL * kx + tx; }
    function visit(i) {
      var top = sy(T.leafStart[i]), bot = sy(T.leafStart[i] + T.leaves[i]);
      if (bot < 0 || top > VH) return;
      var x = sx(T.depth[i]);
      if (x > VW || sx(T.maxDepth[i]) + W * kx < 0) return;
      bars.push(i);
      var a = T.start[i], b = T.start[i + 1];
      if (a === b) return;
      // 只看和屏幕重叠的下级（二分查找）
      var lo = a, hi = b - 1, row0 = -ty / (ROW * k);
      while (lo < hi) { var m = (lo + hi) >> 1, c = T.list[m]; if (T.leafStart[c] + T.leaves[c] < row0) lo = m + 1; else hi = m; }
      var run = false, rTop = 0, rBot = 0, rTeam = 0, rMax = 0;
      function flush() { if (run) bands.push([sx(T.depth[i] + 1), rTop, sx(rMax) + W * kx, rBot, rTeam]); run = false; }
      for (var t = lo; t < b; t++) {
        var c2 = T.list[t], ct = sy(T.leafStart[c2]);
        if (ct > VH) break;
        var cb = sy(T.leafStart[c2] + T.leaves[c2]);
        if (cb - ct < BAND) { // 太矮：和相邻的小分支合并成一条色带
          if (!run) { run = true; rTop = ct; rTeam = 0; rMax = 0; }
          rBot = cb; rTeam += 1 + T.info(c2).team; if (T.maxDepth[c2] > rMax) rMax = T.maxDepth[c2];
          continue;
        }
        flush();
        visit(c2);
      }
      flush();
    }
    visit(0);

    // 合并的色带：人越多颜色越深
    bands.forEach(function (b) {
      var h = Math.max(1, b[3] - b[1]), alpha = Math.min(0.8, 0.16 + Math.log10(1 + b[4]) * 0.13);
      g.fillStyle = "rgba(112, 39, 217, " + alpha.toFixed(3) + ")";
      g.fillRect(b[0], b[1], Math.max(2, b[2] - b[0] - 2), h);
      if (h >= 16 && b[2] - b[0] > 70) {
        g.fillStyle = "#fff"; g.font = "600 12px " + FONT; g.textBaseline = "middle";
        g.fillText("合并 " + fmt(b[4]) + " 个地址", b[0] + 6, Math.max(b[1], 0) / 2 + Math.min(b[3], VH) / 2);
      }
    });
    // 每个地址一根竖条，文字贴在竖条露在屏幕里的那一段
    g.textBaseline = "alphabetic";
    bars.forEach(function (i) {
      var n = T.info(i), x = sx(T.depth[i]), w = W * kx - 3, top = sy(T.leafStart[i]), bot = sy(T.leafStart[i] + T.leaves[i]);
      var vt = Math.max(top, -4), vb = Math.min(bot, VH + 4), h = vb - vt, isHl = hl === i;
      var gold = i === 0 || n.level;
      g.fillStyle = isHl ? "#fff3e6" : gold ? "#f4eeff" : C.node;
      if (h < 3 || w < 4) { g.fillStyle = gold ? C.gold : "#b9a9ea"; g.fillRect(x, vt, Math.max(2, w), Math.max(1, h)); return; }
      rr(g, x, vt + 0.5, w, h - 1, Math.min(8, h / 2, w / 2));
      g.fill();
      g.lineWidth = isHl ? 2.5 : gold ? 1.6 : 1; g.strokeStyle = isHl ? C.hl : gold ? C.gold : C.line; g.stroke();
      if (n.zone) { g.fillStyle = C.gold; g.fillRect(x + 1, vt + 1, 3, h - 2); } // 一二三区左边一道紫线
      var vh = Math.min(bot, VH) - Math.max(top, 0);
      if (vh < 16 || w < 56) return;
      var full = vh >= 62 && w >= 150, narrow = !full && vh >= 62 && w >= 90, bh = full || narrow ? 58 : 18;
      var ly = Math.max(top, 0) + 3; if (ly + bh > Math.min(bot, VH)) ly = Math.min(bot, VH) - bh;
      g.save(); g.beginPath(); g.rect(x, Math.max(top, 0), w, vh); g.clip();
      var px = x + 10, right = x + w - 8;
      g.fillStyle = C.text; g.font = "600 13px " + MONO; g.fillText(short(n.a), px, ly + 15);
      if (w >= 120) {
        g.fillStyle = n.level ? C.gold : C.chip; rr(g, right - 34, ly + 2, 34, 18, 5); g.fill();
        g.fillStyle = n.level ? "#fff" : C.muted; g.font = "700 12px " + FONT; g.textAlign = "center"; g.fillText(n.level ? "P" + n.level : "—", right - 17, ly + 15); g.textAlign = "left";
      }
      if (full) {
        g.fillStyle = C.muted; g.font = "12px " + FONT;
        g.fillText("团队 " + fmt(n.team) + " 个地址 · 算力 " + wan(n.power), px, ly + 35);
        g.fillText((n.zone ? ["一区", "二区", "三区"][n.zone - 1] + " · " : "") + "直推 " + fmt(n.direct) + (n.self ? " · 个人 " + wan(n.self) : ""), px, ly + 52);
      } else if (narrow) { // 手机上一列较窄：分三行写短一点
        g.fillStyle = C.muted; g.font = "12px " + FONT;
        g.fillText(fmt(n.team) + " 个地址" + (n.level ? " · P" + n.level : ""), px, ly + 35);
        g.fillText((n.zone ? ["一区", "二区", "三区"][n.zone - 1] + " · " : "") + "算力 " + wan(n.power), px, ly + 52);
      } else if (w >= 200) {
        g.fillStyle = C.muted; g.font = "12px " + FONT; g.textAlign = "right"; g.fillText(fmt(n.team) + " 个地址", right - (w >= 120 ? 40 : 0), ly + 15); g.textAlign = "left";
      }
      g.restore();
    });
    return bars.length + bands.length;
  }

  // ---------- 交互 ----------
  function TreeMap(box, T, opts) {
    opts = opts || {};
    var cv = document.createElement("canvas"), g = cv.getContext("2d"), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
    box.innerHTML = ""; box.appendChild(cv);
    var view = { k: 1, kx: 1, tx: 0, ty: 0, w: 0, h: 0 }, hl = -1, queued = false, totalW = (T.maxDepth[0] * COL + W), totalH = T.leaves[0] * ROW;
    // 横向缩放：跟着 k，但缩小时也保持一屏放得下 3 层（电脑 5 层）、每列看得清字；更深的层往右拖
    function kxOf(k) { var cols = Math.min(T.maxDepth[0] + 1, view.w < 600 ? 3 : 5); return Math.max(k, Math.min(1, (view.w - 16) / (cols * COL))); }
    function resize() {
      view.w = box.clientWidth; view.h = box.clientHeight; view.kx = kxOf(view.k);
      cv.width = Math.round(view.w * dpr); cv.height = Math.round(view.h * dpr);
      draw(true);
    }
    function draw(now) {
      if (now || document.hidden) { queued = false; g.setTransform(dpr, 0, 0, dpr, 0, 0); var c = paint(g, T, view, hl); if (opts.onDraw) opts.onDraw(c, view.k); return; }
      if (queued) return;
      queued = true;
      (window.requestAnimationFrame || setTimeout)(function () { if (queued) draw(true); });
    }
    function kMin() { return Math.min(0.3, (view.h - 16) / totalH); }
    function clampK(k) { return Math.max(kMin() * 0.8, Math.min(2.5, k)); }
    function zoomAt(f, cx, cy) {
      var nk = clampK(view.k * f), nkx = kxOf(nk);
      view.tx = cx - (cx - view.tx) * nkx / view.kx; view.ty = cy - (cy - view.ty) * nk / view.k; view.k = nk; view.kx = nkx;
      draw();
    }
    // 放大到某个人的团队：他的竖条正好占满屏幕高，左边留出上一层
    var cur = 0;
    function focus(i) {
      cur = i;
      view.k = clampK(Math.min(view.w < 600 ? 1 : 1.2, (view.h - 24) / (T.leaves[i] * ROW))); view.kx = kxOf(view.k);
      view.ty = 12 - T.leafStart[i] * ROW * view.k;
      view.tx = Math.min(8, 8 - Math.max(0, T.depth[i] - 1) * COL * view.kx);
      draw();
    }
    function fitAll() { focus(0); }
    // 屏幕上的点落在哪个节点上：返回节点；落在合并色带上返回 {band: 父节点, row}
    function hit(px, py) {
      var wx = (px - view.tx) / view.kx, wy = (py - view.ty) / view.k, row = wy / ROW, d = Math.floor(wx / COL);
      if (row < 0 || row > T.leaves[0] || d < 0) return null;
      var i = 0;
      while (T.depth[i] < d) {
        var a = T.start[i], b = T.start[i + 1];
        if (a === b) return null;
        var lo = a, hi = b - 1;
        while (lo < hi) { var m = (lo + hi) >> 1, c = T.list[m]; if (T.leafStart[c] + T.leaves[c] <= row) lo = m + 1; else hi = m; }
        var ch = T.list[lo];
        if ((T.leaves[ch] * ROW * view.k) < BAND) return { band: ch };
        i = ch;
      }
      return wx - d * COL <= W ? { node: i } : null;
    }

    // 拖动、双指缩放、滚轮
    var pts = {}, last = null, moved = false, downAt = null;
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; moved = false; last = null; downAt = [e.clientX, e.clientY]; cv.style.cursor = "grabbing"; });
    cv.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      var prev = pts[e.pointerId]; pts[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(pts);
      if (downAt && Math.abs(e.clientX - downAt[0]) + Math.abs(e.clientY - downAt[1]) > 6) moved = true;
      if (ids.length === 1) { view.tx += e.clientX - prev[0]; view.ty += e.clientY - prev[1]; draw(); }
      else if (ids.length === 2) {
        var p1 = pts[ids[0]], p2 = pts[ids[1]], dist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), r = cv.getBoundingClientRect();
        if (last) zoomAt(dist / last, (p1[0] + p2[0]) / 2 - r.left, (p1[1] + p2[1]) / 2 - r.top);
        last = dist; moved = true;
      }
    });
    function up(e) {
      var wasTap = !moved && Object.keys(pts).length === 1;
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) last = null;
      cv.style.cursor = "grab";
      if (wasTap && e.type === "pointerup") {
        var r = cv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
        if (h && h.node !== undefined) { if (opts.onTap) opts.onTap(h.node); }
        else if (h && h.band !== undefined) zoomAt(2.5, e.clientX - r.left, e.clientY - r.top); // 点色带：放大这里
      }
    }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = cv.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener("dblclick", function (e) { var r = cv.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); });
    if (window.ResizeObserver) new ResizeObserver(function () { if (box.clientWidth !== view.w || box.clientHeight !== view.h) resize(); }).observe(box);
    resize();

    return {
      fitAll: fitAll,
      focus: focus,
      up: function () { if (cur > 0) focus(T.parent(cur)); },
      zoom: function (f) { zoomAt(f, view.w / 2, view.h / 2); },
      highlight: function (i) { hl = i; draw(); },
      // 把当前画面导出成高清图片（宽 maxW 像素以内）
      image: function (maxW) {
        var s = Math.min(3, (maxW || 2400) / view.w), c = document.createElement("canvas");
        c.width = Math.round(view.w * s); c.height = Math.round(view.h * s);
        var g2 = c.getContext("2d");
        g2.setTransform(s, 0, 0, s, 0, 0);
        paint(g2, T, view, hl);
        g2.setTransform(1, 0, 0, 1, 0, 0);
        g2.font = "600 " + Math.round(13 * s) + "px " + FONT; g2.fillStyle = "rgba(112, 39, 217, .6)"; g2.textAlign = "right";
        g2.fillText("AiLGNS 服务站 · ailgns.dev", c.width - 14 * s, c.height - 12 * s);
        return c.toDataURL("image/jpeg", 0.92);
      },
      view: view
    };
  }

  window.AIL = window.AIL || {};
  window.AIL.treeMap = { build: build, create: TreeMap, ROW: ROW, COL: COL };
})();
