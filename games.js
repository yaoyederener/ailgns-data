// 销毁乐园 · 免费小游戏：2048、贪吃蛇、俄罗斯方块、飞翔小鸟、扫雷、打砖块
// 全部在浏览器里跑，免费玩，不花币、不赢币；最高分存在本机（localStorage）
(function () {
  var A = window.AIL;
  var LIST = [
    { id: "g2048", icon: "🔢", name: "2048", desc: "滑动合并相同数字，冲击 2048" },
    { id: "snake", icon: "🐍", name: "贪吃蛇", desc: "吃豆变长，别撞墙、别咬到自己" },
    { id: "tetris", icon: "🧱", name: "俄罗斯方块", desc: "经典消行，越消越快" },
    { id: "flappy", icon: "🐤", name: "飞翔小鸟", desc: "点一下飞一下，穿过管子" },
    { id: "mines", icon: "💣", name: "扫雷", desc: "找出所有地雷，长按插旗" },
    { id: "brick", icon: "🏓", name: "打砖块", desc: "左右移动挡板，打碎全部砖块" }
  ];
  A.gameList = LIST;

  function best(k, v) {
    try {
      var b = Number(localStorage.getItem("game:" + k)) || 0;
      if (v !== undefined && v > b) { localStorage.setItem("game:" + k, String(v)); b = v; }
      return b;
    } catch (e) { return v || 0; }
  }

  // 公共外壳：标题、分数、最高分、重新开始；游戏只管往 .gm-stage 里画
  function shell(id, g, howto, start) {
    A.app.innerHTML = '<a class="px-back" href="#/play">← 销毁乐园</a>' +
      '<section class="card gm-card"><div class="gm-head"><h2>' + g.icon + " " + g.name + '</h2><div class="gm-sc"><span>分数 <b id="gm-s">0</b></span><span>最高 <b id="gm-b">' + best(g.id) + '</b></span></div></div>' +
      '<div class="gm-stage" id="gm-stage"></div><div class="gm-bar"><button type="button" id="gm-re">🔄 重新开始</button></div>' +
      '<p class="note">' + howto + "</p></section>" +
      '<p class="note">免费玩，不花币也不赢币，最高分只存在你这台手机上。</p>';
    var stage = document.getElementById("gm-stage"), sEl = document.getElementById("gm-s"), bEl = document.getElementById("gm-b");
    var api = {
      alive: function () { return A.isCurrent(id) && document.body.contains(stage); },
      score: function (v) { sEl.textContent = v; bEl.textContent = best(g.id, v); },
      over: function (msg) {
        var d = document.createElement("div");
        d.className = "gm-over";
        d.innerHTML = "<b>" + (msg || "游戏结束") + '</b><button type="button">再来一局</button>';
        d.querySelector("button").onclick = run;
        stage.appendChild(d);
      }
    };
    var stop = null;
    function run() { if (stop) stop(); stage.innerHTML = ""; api.score(0); stop = start(stage, api) || null; }
    document.getElementById("gm-re").onclick = run;
    run();
  }

  // 键盘：只在当前游戏页有效
  function keys(api, fn) {
    function h(e) {
      if (!api.alive()) return document.removeEventListener("keydown", h);
      if (fn(e.key) !== false && /^Arrow| /.test(e.key)) e.preventDefault();
    }
    document.addEventListener("keydown", h);
    return function () { document.removeEventListener("keydown", h); };
  }
  // 滑动手势：返回 "Left" / "Right" / "Up" / "Down"
  function swipe(el, fn) {
    var x0, y0;
    el.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
    el.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return fn("Tap");
      fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "Right" : "Left") : (dy > 0 ? "Down" : "Up"));
    });
  }
  function canvas(stage, w, h) {
    var c = document.createElement("canvas"), r = window.devicePixelRatio || 1;
    c.width = w * r; c.height = h * r; c.className = "gm-cv";
    c.style.aspectRatio = w + " / " + h;
    c.style.maxWidth = "min(100%, calc(48vh * " + (w / h).toFixed(3) + "))"; c.style.margin = "0 auto"; // 竖长的游戏在手机上别超出一屏，下面的按键要看得到
    stage.appendChild(c);
    var x = c.getContext("2d"); x.scale(r, r);
    return { c: c, x: x };
  }
  function loop(api, step) { // 每帧调用，页面切走自动停
    var on = true, last = performance.now();
    function f(t) { if (!on || !api.alive()) return; var dt = Math.min(50, t - last); last = t; if (step(dt) !== false) requestAnimationFrame(f); }
    requestAnimationFrame(f);
    return function () { on = false; };
  }

  // ---------- 2048 ----------
  function g2048(stage, api) {
    var N = 4, b = [], score = 0, dead = false;
    for (var i = 0; i < N * N; i++) b.push(0);
    var grid = document.createElement("div"); grid.className = "g2-grid"; stage.appendChild(grid);
    function add() { var e = []; b.forEach(function (v, i) { if (!v) e.push(i); }); if (e.length) b[e[Math.floor(Math.random() * e.length)]] = Math.random() < .9 ? 2 : 4; }
    function draw() { grid.innerHTML = b.map(function (v) { return '<div class="g2-c v' + Math.min(v, 4096) + '">' + (v || "") + "</div>"; }).join(""); api.score(score); }
    function line(a) { // 一行往左合并
      var t = a.filter(Boolean), o = [];
      for (var i = 0; i < t.length; i++) { if (t[i] === t[i + 1]) { o.push(t[i] * 2); score += t[i] * 2; i++; } else o.push(t[i]); }
      while (o.length < N) o.push(0);
      return o;
    }
    function move(d) {
      if (dead) return;
      var old = b.join(), idx = function (r, c) { return d === "Left" ? r * N + c : d === "Right" ? r * N + N - 1 - c : d === "Up" ? c * N + r : (N - 1 - c) * N + r; };
      for (var r = 0; r < N; r++) {
        var a = []; for (var c = 0; c < N; c++) a.push(b[idx(r, c)]);
        a = line(a); for (c = 0; c < N; c++) b[idx(r, c)] = a[c];
      }
      if (b.join() === old) return;
      add(); draw();
      if (b.indexOf(2048) >= 0 && !api.won) { api.won = true; }
      if (!canMove()) { dead = true; api.over("没有可以合并的了"); }
    }
    function canMove() {
      if (b.indexOf(0) >= 0) return true;
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) { var v = b[r * N + c]; if ((c < N - 1 && v === b[r * N + c + 1]) || (r < N - 1 && v === b[(r + 1) * N + c])) return true; }
      return false;
    }
    add(); add(); draw();
    swipe(grid, function (d) { if (d !== "Tap") move(d); });
    return keys(api, function (k) { var m = /^Arrow(\w+)/.exec(k); if (m) move(m[1]); else return false; });
  }

  // ---------- 贪吃蛇 ----------
  function snake(stage, api) {
    var W = 20, H = 20, S = 16, cv = canvas(stage, W * S, H * S), x = cv.x;
    var body = [[10, 10], [9, 10], [8, 10]], dir = [1, 0], next = [1, 0], food = place(), score = 0, acc = 0, speed = 140;
    function place() { for (;;) { var p = [Math.floor(Math.random() * W), Math.floor(Math.random() * H)]; if (!body.some(function (q) { return q[0] === p[0] && q[1] === p[1]; })) return p; } }
    function turn(d) { var m = { Left: [-1, 0], Right: [1, 0], Up: [0, -1], Down: [0, 1] }[d]; if (m && (m[0] !== -dir[0] || m[1] !== -dir[1])) next = m; }
    swipe(cv.c, turn); padHtml(stage, turn);
    var unkey = keys(api, function (k) { var m = /^Arrow(\w+)/.exec(k); if (m) turn(m[1]); else return false; });
    var stop = loop(api, function (dt) {
      acc += dt; if (acc < speed) return; acc = 0; dir = next;
      var h = [body[0][0] + dir[0], body[0][1] + dir[1]];
      if (h[0] < 0 || h[1] < 0 || h[0] >= W || h[1] >= H || body.some(function (q) { return q[0] === h[0] && q[1] === h[1]; })) { api.over("撞到了！"); return false; }
      body.unshift(h);
      if (h[0] === food[0] && h[1] === food[1]) { score += 10; api.score(score); food = place(); speed = Math.max(70, speed - 3); } else body.pop();
      x.fillStyle = "#f5f3ff"; x.fillRect(0, 0, W * S, H * S);
      x.fillStyle = "#ef4444"; x.beginPath(); x.arc(food[0] * S + S / 2, food[1] * S + S / 2, S / 2 - 2, 0, 7); x.fill();
      body.forEach(function (q, i) { x.fillStyle = i ? "#7c3aed" : "#5b21b6"; x.fillRect(q[0] * S + 1, q[1] * S + 1, S - 2, S - 2); });
    });
    return function () { stop(); unkey(); };
  }
  // 手机方向键
  function padHtml(stage, fn) {
    var p = document.createElement("div"); p.className = "gm-pad";
    p.innerHTML = '<button data-d="Up">▲</button><button data-d="Left">◀</button><button data-d="Down">▼</button><button data-d="Right">▶</button>';
    p.querySelectorAll("button").forEach(function (b) { b.addEventListener("touchstart", function (e) { e.preventDefault(); fn(b.getAttribute("data-d")); }, { passive: false }); b.onclick = function () { fn(b.getAttribute("data-d")); }; });
    stage.appendChild(p);
  }

  // ---------- 俄罗斯方块 ----------
  function tetris(stage, api) {
    var W = 10, H = 20, S = 18, cv = canvas(stage, W * S, H * S), x = cv.x;
    var SH = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]]];
    var COL = ["#06b6d4", "#eab308", "#a855f7", "#3b82f6", "#f97316", "#ef4444", "#22c55e"];
    var g = []; for (var r = 0; r < H; r++) g.push(new Array(W).fill(0));
    var cur, score = 0, lines = 0, acc = 0;
    function spawn() { var k = Math.floor(Math.random() * 7); cur = { m: SH[k], c: k + 1, x: 3, y: 0 }; if (hit(cur.m, cur.x, cur.y)) return false; return true; }
    function hit(m, px, py) { for (var r = 0; r < m.length; r++) for (var c = 0; c < m[r].length; c++) if (m[r][c] && (px + c < 0 || px + c >= W || py + r >= H || (py + r >= 0 && g[py + r][px + c]))) return true; return false; }
    function rot(m) { return m[0].map(function (_, c) { return m.map(function (row) { return row[c]; }).reverse(); }); }
    function lock() {
      cur.m.forEach(function (row, r) { row.forEach(function (v, c) { if (v && cur.y + r >= 0) g[cur.y + r][cur.x + c] = cur.c; }); });
      var n = 0;
      for (var r = H - 1; r >= 0; r--) if (g[r].every(Boolean)) { g.splice(r, 1); g.unshift(new Array(W).fill(0)); n++; r++; }
      if (n) { lines += n; score += [0, 100, 300, 500, 800][n]; api.score(score); }
      return spawn();
    }
    function act(d) {
      if (d === "Left" && !hit(cur.m, cur.x - 1, cur.y)) cur.x--;
      else if (d === "Right" && !hit(cur.m, cur.x + 1, cur.y)) cur.x++;
      else if (d === "Up" || d === "Tap") { var m = rot(cur.m); if (!hit(m, cur.x, cur.y)) cur.m = m; else if (!hit(m, cur.x - 1, cur.y)) { cur.m = m; cur.x--; } else if (!hit(m, cur.x + 1, cur.y)) { cur.m = m; cur.x++; } }
      else if (d === "Down") { while (!hit(cur.m, cur.x, cur.y + 1)) cur.y++; acc = 1e9; }
      draw();
    }
    function cell(cx, cy, k) { x.fillStyle = COL[k - 1]; x.fillRect(cx * S + 1, cy * S + 1, S - 2, S - 2); }
    function draw() {
      x.fillStyle = "#1e1b4b"; x.fillRect(0, 0, W * S, H * S);
      g.forEach(function (row, r) { row.forEach(function (v, c) { if (v) cell(c, r, v); }); });
      cur.m.forEach(function (row, r) { row.forEach(function (v, c) { if (v) cell(cur.x + c, cur.y + r, cur.c); }); });
    }
    spawn(); draw();
    swipe(cv.c, act); padHtml(stage, act);
    var unkey = keys(api, function (k) { var m = /^Arrow(\w+)/.exec(k); if (m) act(m[1]); else if (k === " ") act("Down"); else return false; });
    var stop = loop(api, function (dt) {
      acc += dt; if (acc < Math.max(120, 600 - lines * 15)) return; acc = 0;
      if (!hit(cur.m, cur.x, cur.y + 1)) cur.y++; else if (!lock()) { draw(); api.over("堆满了！消了 " + lines + " 行"); return false; }
      draw();
    });
    return function () { stop(); unkey(); };
  }

  // ---------- 飞翔小鸟 ----------
  function flappy(stage, api) {
    var W = 320, H = 440, cv = canvas(stage, W, H), x = cv.x;
    var y = H / 2, v = 0, pipes = [], score = 0, t = 0, started = false, dead = false;
    function flap() { if (dead) return; started = true; v = -6.2; }
    cv.c.addEventListener("touchstart", function (e) { e.preventDefault(); flap(); }, { passive: false });
    cv.c.addEventListener("mousedown", flap);
    var unkey = keys(api, function (k) { if (k === " " || k === "ArrowUp") flap(); else return false; });
    var stop = loop(api, function (dt) {
      var f = dt / 16.7;
      if (started) {
        v += 0.38 * f; y += v * f; t += dt;
        if (t > 1500) { t = 0; pipes.push({ x: W, gap: 70 + Math.random() * (H - 260), ok: false }); }
        pipes.forEach(function (p) { p.x -= 2.4 * f; if (!p.ok && p.x + 52 < 70) { p.ok = true; score++; api.score(score); } });
        pipes = pipes.filter(function (p) { return p.x > -60; });
        if (y > H - 14 || y < 0 || pipes.some(function (p) { return p.x < 84 && p.x + 52 > 56 && (y - 12 < p.gap || y + 12 > p.gap + 130); })) dead = true;
      }
      x.fillStyle = "#e0f2fe"; x.fillRect(0, 0, W, H);
      x.fillStyle = "#22c55e"; pipes.forEach(function (p) { x.fillRect(p.x, 0, 52, p.gap); x.fillRect(p.x, p.gap + 130, 52, H - p.gap - 130); });
      x.font = "28px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("🐤", 70, y);
      if (!started) { x.fillStyle = "#1f2937"; x.font = "bold 18px sans-serif"; x.fillText("点一下开始", W / 2, H / 2 + 50); }
      if (dead) { api.over("撞到了！穿过 " + score + " 根管子"); return false; }
    });
    return function () { stop(); unkey(); };
  }

  // ---------- 扫雷 ----------
  function mines(stage, api) {
    var R = 10, C = 9, M = 12, cells = [], opened = 0, dead = false, first = true, t0 = 0;
    var grid = document.createElement("div"); grid.className = "mn-grid"; grid.style.gridTemplateColumns = "repeat(" + C + ", 1fr)"; stage.appendChild(grid);
    for (var i = 0; i < R * C; i++) cells.push({ m: false, o: false, f: false, n: 0 });
    function nb(i) { var r = Math.floor(i / C), c = i % C, o = []; for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) { var rr = r + dr, cc = c + dc; if ((dr || dc) && rr >= 0 && rr < R && cc >= 0 && cc < C) o.push(rr * C + cc); } return o; }
    function lay(safe) {
      var bad = nb(safe).concat(safe), k = 0;
      while (k < M) { var j = Math.floor(Math.random() * R * C); if (!cells[j].m && bad.indexOf(j) < 0) { cells[j].m = true; k++; } }
      cells.forEach(function (c, j) { c.n = nb(j).filter(function (q) { return cells[q].m; }).length; });
    }
    function open(i) {
      var c = cells[i]; if (dead || c.o || c.f) return;
      if (first) { first = false; lay(i); t0 = Date.now(); }
      c.o = true; opened++;
      if (c.m) { dead = true; cells.forEach(function (q) { if (q.m) q.o = true; }); draw(); return api.over("踩到地雷了 💥"); }
      if (!c.n) nb(i).forEach(open);
    }
    function draw() {
      grid.innerHTML = cells.map(function (c, i) {
        var t = c.o ? (c.m ? "💣" : c.n || "") : c.f ? "🚩" : "";
        return '<button type="button" data-i="' + i + '" class="mn-c' + (c.o ? " o n" + c.n : "") + '">' + t + "</button>";
      }).join("");
    }
    function check() {
      if (!dead && opened === R * C - M) { dead = true; var s = Math.max(1, 1000 - Math.floor((Date.now() - t0) / 1000) * 5); api.score(s); api.over("全部找到了 🎉 用时 " + Math.floor((Date.now() - t0) / 1000) + " 秒"); }
    }
    var press = null, longed = false;
    grid.addEventListener("pointerdown", function (e) { var b = e.target.closest("[data-i]"); if (!b) return; longed = false; press = setTimeout(function () { longed = true; flag(+b.getAttribute("data-i")); }, 420); });
    grid.addEventListener("pointerup", function () { clearTimeout(press); });
    grid.addEventListener("pointerleave", function () { clearTimeout(press); });
    grid.addEventListener("contextmenu", function (e) { e.preventDefault(); var b = e.target.closest("[data-i]"); if (b && !longed) { clearTimeout(press); longed = true; flag(+b.getAttribute("data-i")); } }); // 电脑右键插旗
    grid.addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (!b || longed) return; open(+b.getAttribute("data-i")); draw(); check(); });
    function flag(i) { var c = cells[i]; if (dead || c.o) return; c.f = !c.f; if (navigator.vibrate) navigator.vibrate(20); draw(); }
    draw();
  }

  // ---------- 打砖块 ----------
  function brick(stage, api) {
    var W = 320, H = 420, cv = canvas(stage, W, H), x = cv.x;
    var px = W / 2, bx = W / 2, by = H - 60, vx = 2.6, vy = -3.4, score = 0, started = false, bricks = [];
    var COL = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];
    for (var r = 0; r < 5; r++) for (var c = 0; c < 8; c++) bricks.push({ x: 8 + c * 38.5, y: 40 + r * 18, r: r, on: true });
    function aim(e) { var b = cv.c.getBoundingClientRect(), cx = (e.touches ? e.touches[0].clientX : e.clientX) - b.left; px = Math.max(30, Math.min(W - 30, cx / b.width * W)); started = true; }
    cv.c.addEventListener("touchmove", function (e) { e.preventDefault(); aim(e); }, { passive: false });
    cv.c.addEventListener("touchstart", function (e) { e.preventDefault(); aim(e); }, { passive: false });
    cv.c.addEventListener("mousemove", aim);
    var held = {};
    var unkey = keys(api, function (k) { if (k === "ArrowLeft" || k === "ArrowRight") { held[k] = 1; started = true; setTimeout(function () { held[k] = 0; }, 120); } else return false; });
    var stop = loop(api, function (dt) {
      var f = dt / 16.7;
      if (held.ArrowLeft) px = Math.max(30, px - 7 * f);
      if (held.ArrowRight) px = Math.min(W - 30, px + 7 * f);
      if (started) {
        bx += vx * f; by += vy * f;
        if (bx < 6 || bx > W - 6) vx = -vx;
        if (by < 6) vy = Math.abs(vy);
        if (by > H - 32 && by < H - 20 && Math.abs(bx - px) < 34 && vy > 0) { vy = -Math.abs(vy); vx = (bx - px) / 34 * 4; }
        bricks.forEach(function (b) { if (b.on && bx > b.x && bx < b.x + 35 && by > b.y && by < b.y + 14) { b.on = false; vy = -vy; score += (5 - b.r) * 10; api.score(score); } });
      } else { bx = px; }
      x.fillStyle = "#0f172a"; x.fillRect(0, 0, W, H);
      bricks.forEach(function (b) { if (b.on) { x.fillStyle = COL[b.r]; x.fillRect(b.x, b.y, 35, 14); } });
      x.fillStyle = "#a78bfa"; x.fillRect(px - 32, H - 26, 64, 8);
      x.fillStyle = "#fff"; x.beginPath(); x.arc(bx, by, 6, 0, 7); x.fill();
      if (!started) { x.font = "bold 16px sans-serif"; x.textAlign = "center"; x.fillText("按住屏幕左右拖动开始", W / 2, H / 2); }
      if (by > H) { api.over("球掉了！"); return false; }
      if (!bricks.some(function (b) { return b.on; })) { api.over("全部打碎了 🎉"); return false; }
    });
    return function () { stop(); unkey(); };
  }

  var RUN = { g2048: g2048, snake: snake, tetris: tetris, flappy: flappy, mines: mines, brick: brick };
  var HOW = {
    g2048: "手机上下左右滑动，电脑用方向键。相同数字碰到一起会合并。",
    snake: "滑动屏幕或点下面的方向键，电脑用方向键。每吃一颗豆 +10 分，越来越快。",
    tetris: "左右滑动移动，轻点或上滑旋转，下滑直接落到底；也可以用下面的按键。消一行 100 分，一次消四行 800 分。",
    flappy: "点一下屏幕小鸟就往上飞一下，穿过管子的空隙，每穿过一根 +1 分。",
    mines: "点格子翻开，数字是周围 8 格里有几颗雷；长按（电脑右键）插旗。第一下一定不是雷。",
    brick: "手指在画面上左右拖动挡板（电脑用鼠标），把球弹回去打碎全部砖块。"
  };
  LIST.forEach(function (g) {
    A.pages[g.id] = function (id) { shell(id, g, HOW[g.id], RUN[g.id]); };
  });
})();
