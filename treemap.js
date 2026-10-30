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

  // ---------- 团队数据：全部用定长数组（百万个地址约 100MB 以内，不给每个地址建对象） ----------
  // src：{ n, addr: Uint8Array(20n) 地址字节, parent: Int32Array（自己为 -1，上级下标一定小于下级）, self: 个人算力, level: Uint8Array 官方等级, at }
  var HEX = []; for (var h = 0; h < 256; h++) HEX.push((h < 16 ? "0" : "") + h.toString(16));
  function team(src) {
    var n = src.n, parent = src.parent, self = src.self, addrB = src.addr;
    var teamN = new Int32Array(n), power = new Float64Array(n), depth = new Uint16Array(n), start = new Int32Array(n + 1), list = new Int32Array(Math.max(0, n - 1));
    var i, p;
    for (i = n - 1; i > 0; i--) { p = parent[i]; teamN[p] += 1 + teamN[i]; power[p] += power[i] + self[i]; }
    for (i = 1; i < n; i++) { depth[i] = depth[parent[i]] + 1; start[parent[i] + 1]++; }
    for (i = 0; i < n; i++) start[i + 1] += start[i];
    var fill = start.slice(0, n);
    for (i = 1; i < n; i++) list[fill[parent[i]]++] = i;
    // 每个人的下级按团队算力从大到小排（一区、二区、三区在前）
    var rank = new Int32Array(n), tmp = [];
    for (i = 0; i < n; i++) {
      var a = start[i], b = start[i + 1];
      if (b - a > 1) {
        tmp.length = 0;
        for (var t = a; t < b; t++) tmp.push(list[t]);
        tmp.sort(function (x, y) { return power[y] - power[x] || teamN[y] - teamN[x]; });
        for (t = a; t < b; t++) list[t] = tmp[t - a];
      }
      for (t = a; t < b; t++) rank[list[t]] = t - a;
    }
    var zone = new Uint8Array(n);
    for (t = start[0]; t < Math.min(start[1], start[0] + 3); t++) if (power[list[t]] > 0) zone[list[t]] = t - start[0] + 1;
    function addr(j) { var s2 = "0x", o = j * 20; for (var q = 0; q < 20; q++) s2 += HEX[addrB[o + q]]; return s2; }
    var D = {
      n: n, at: src.at, bytes: addrB, parent: parent, self: self, level: src.level, team: teamN, power: power, depth: depth, start: start, list: list, rank: rank, zone: zone,
      addr: addr,
      kids: function (j) { return list.subarray(start[j], start[j + 1]); },
      info: function (j) { return { a: addr(j), team: teamN[j], power: power[j], self: self[j], level: src.level[j], zone: zone[j], direct: start[j + 1] - start[j] }; },
      // 从自己到 j 的路径（下标）
      path: function (j) { var r = []; for (var x = j; x >= 0; x = parent[x]) r.unshift(x); return r; },
      // 位置编号：一区第 3 个直推的第 2 个直推 → 1.3.2
      pos: function (j) { return D.path(j).slice(1).map(function (x) { return rank[x] + 1; }).join("."); },
      // 按地址开头或结尾查找（输 4 位以上）；完整地址精确匹配
      find: function (q) {
        q = q.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "");
        if (q.length < 4) return [];
        var hits = [], L = q.length;
        for (var j = 0; j < n && hits.length < 20; j++) {
          var o = j * 20, pre = true, suf = true;
          for (var c = 0; c < L && (pre || suf); c++) {
            if (pre) { var bt = addrB[o + (c >> 1)], nib = c & 1 ? bt & 15 : bt >> 4; if (nib !== parseInt(q[c], 16)) pre = false; }
            if (suf && L <= 40) { var cc = 40 - L + c, bt2 = addrB[o + (cc >> 1)], nib2 = cc & 1 ? bt2 & 15 : bt2 >> 4; if (nib2 !== parseInt(q[c], 16)) suf = false; }
          }
          if (pre || suf) { if (L === 40 && pre) return [j]; hits.push(j); }
        }
        return hits;
      }
    };
    return D;
  }
  // 地址字符串 → 字节
  function hexBytes(list) {
    var out = new Uint8Array(list.length * 20);
    for (var j = 0; j < list.length; j++) { var hx = list[j].replace(/^0x/, ""); for (var q = 0; q < 20; q++) out[j * 20 + q] = parseInt(hx.substr(q * 2, 2), 16); }
    return out;
  }
  // 读 /api/bigtree 的二进制文件（格式见 monita/big_team_build.py）
  function fromBinary(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "AILT") throw new Error("数据格式不对");
    var n = dv.getUint32(8, true), at = dv.getFloat64(12, true), o = 20;
    var addr = u8.slice(o, o + 20 * n); o += 20 * n;
    var parent = new Int32Array(buf.slice(o, o + 4 * n)); o += 4 * n;
    var self = new Float32Array(buf.slice(o, o + 4 * n)); o += 4 * n;
    var level = u8.slice(o, o + n);
    return team({ n: n, addr: addr, parent: parent, self: self, level: level, at: at });
  }

  // ---------- 冰柱图排版：每个叶子占一行，父节点占住所有后代的行 ----------
  function build(D) {
    var n = D.n, start = D.start, list = D.list, depth = D.depth;
    var leafStart = new Float64Array(n), leaves = new Float64Array(n), maxDepth = new Uint16Array(n);
    for (var v = n - 1; v >= 0; v--) { // 上级下标一定小于下级：倒着走就是自下而上
      var a = start[v], b = start[v + 1], lv = 0, md = depth[v];
      for (var t = a; t < b; t++) { lv += leaves[list[t]]; if (maxDepth[list[t]] > md) md = maxDepth[list[t]]; }
      leaves[v] = b > a ? lv : 1;
      maxDepth[v] = md;
    }
    for (v = 0; v < n; v++) {
      var at = leafStart[v];
      for (t = start[v]; t < start[v + 1]; t++) { leafStart[list[t]] = at; at += leaves[list[t]]; }
    }
    return { n: n, depth: depth, start: start, list: list, leafStart: leafStart, leaves: leaves, maxDepth: maxDepth, info: D.info, parent: function (i) { return D.parent[i]; }, D: D };
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
          rBot = cb; rTeam += 1 + T.D.team[c2]; if (T.maxDepth[c2] > rMax) rMax = T.maxDepth[c2];
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
  window.AIL.treeMap = { team: team, hexBytes: hexBytes, fromBinary: fromBinary, build: build, create: TreeMap };
})();
