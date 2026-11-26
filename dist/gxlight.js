try{
// 💡 每日熄灯 · #/gxlight（游戏自动开发，2026-11-26 第一版）
// 玩法：5×5 的灯，点一格，它和上下左右四格一起翻面；把所有灯都点灭。每天一题（全站同一题），比谁用的步数少。
// 红线：纯娱乐。不收费、不联网、不碰钱包，没有任何币、奖励。成绩只存在这台设备的浏览器里。
// 上半截是规则引擎（纯计算，不碰页面）：本机用 node 直接跑 `node gx-light.js` 做自测，所以引擎部分不能用 document、localStorage。
(function () {
  var N = 5, M = N * N;
  var W = typeof window !== "undefined" ? window : null, A = W && W.AIL;

  // ====================== 规则引擎 ======================
  // 局面 = 长度 25 的数组，1 = 亮，0 = 灭。位置 i = 行 * 5 + 列。
  function press(b, i) {
    var r = (i / N) | 0, c = i % N, o = b.slice();
    o[i] ^= 1;
    if (r > 0) o[i - N] ^= 1;
    if (r < N - 1) o[i + N] ^= 1;
    if (c > 0) o[i - 1] ^= 1;
    if (c < N - 1) o[i + 1] ^= 1;
    return o;
  }
  function solved(b) { for (var i = 0; i < M; i++) if (b[i]) return false; return true; }
  function lit(b) { var n = 0; for (var i = 0; i < M; i++) n += b[i]; return n; }

  // 带种子的随机数（同一个种子永远出同一题）
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261, i; for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // 出题：从全灭的盘面出发，随机点若干格（所以一定有解）。最少几步由 solve 算出来，不靠猜。
  function makePuzzle(seed) {
    var rnd = rng(seed), b = [], i, k, pos;
    for (i = 0; i < M; i++) b.push(0);
    for (var tries = 0; tries < 20; tries++) {
      b = []; for (i = 0; i < M; i++) b.push(0);
      k = 7 + Math.floor(rnd() * 5); // 7～11 次随机点击
      for (i = 0; i < k; i++) { pos = Math.floor(rnd() * M); b = press(b, pos); }
      var s = solve(b);
      if (s && s.length >= 6 && s.length <= 14) return b; // 太简单（步数很少）或太绕的题重出
    }
    return b;
  }

  // 解题：在 GF(2) 上解 25 元线性方程组。5×5 的灯有 4 种通解，取点击最少的一种，返回要点的格子（升序）；无解返回 null。
  function solve(b) {
    // 方程 j：第 j 格最后要灭 → 按下的格子里属于 j 的“邻居集合”异或起来 = b[j]
    var rows = [], i, j, r, k;
    for (j = 0; j < M; j++) {
      var row = new Array(M + 1);
      for (i = 0; i < M; i++) row[i] = 0;
      var t = press(zero(), j); // 点 j 影响哪些格（对称，所以也是影响 j 的格）
      for (i = 0; i < M; i++) row[i] = t[i];
      row[M] = b[j];
      rows.push(row);
    }
    var piv = [], rank = 0;
    for (var col = 0; col < M && rank < M; col++) {
      var p = -1;
      for (r = rank; r < M; r++) if (rows[r][col]) { p = r; break; }
      if (p < 0) continue;
      var tmp = rows[p]; rows[p] = rows[rank]; rows[rank] = tmp;
      for (r = 0; r < M; r++) if (r !== rank && rows[r][col]) for (k = 0; k <= M; k++) rows[r][k] ^= rows[rank][k];
      piv.push(col); rank++;
    }
    for (r = rank; r < M; r++) if (rows[r][M]) return null; // 无解
    var isPiv = {}, free = [];
    for (i = 0; i < piv.length; i++) isPiv[piv[i]] = i;
    for (i = 0; i < M; i++) if (isPiv[i] === undefined) free.push(i);
    var best = null, mask, x, f, cnt;
    for (mask = 0; mask < (1 << free.length); mask++) { // 自由变量一共 2 个，4 种取法
      x = new Array(M);
      for (i = 0; i < M; i++) x[i] = 0;
      for (f = 0; f < free.length; f++) x[free[f]] = (mask >> f) & 1;
      for (i = 0; i < piv.length; i++) {
        var v = rows[i][M];
        for (f = 0; f < free.length; f++) if (rows[i][free[f]] && x[free[f]]) v ^= 1;
        x[piv[i]] = v;
      }
      cnt = 0; for (i = 0; i < M; i++) cnt += x[i];
      if (!best || cnt < best.n) best = { n: cnt, x: x.slice() };
    }
    var out = []; for (i = 0; i < M; i++) if (best.x[i]) out.push(i);
    return out;
  }
  function zero() { var z = [], i; for (i = 0; i < M; i++) z.push(0); return z; }

  // 北京日期 YYYY-MM-DD
  function bjDay(ms) { return new Date((ms === undefined ? Date.now() : ms) + 8 * 3600e3).toISOString().slice(0, 10); }
  function dayOf(day) { return makePuzzle(hashStr("gxlight:" + day)); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400e3); }

  // 评级：和最少步数比
  function grade(moves, min) {
    if (moves <= min) return 3;
    if (moves <= min + 3) return 2;
    return 1;
  }
  function shareText(day, moves, min, hints) {
    var g = grade(moves, min), stars = g === 3 ? "⭐⭐⭐" : g === 2 ? "⭐⭐" : "⭐";
    return "💡 每日熄灯 " + day.slice(5) + " " + stars + "\n" + moves + " 步（最少 " + min + " 步）" + (hints ? " · 用了 " + hints + " 次提示" : "") + "\nailgns.dev/#/gxlight";
  }

  var API = { press: press, solved: solved, lit: lit, solve: solve, makePuzzle: makePuzzle, dayOf: dayOf, bjDay: bjDay, daysBetween: daysBetween, grade: grade, shareText: shareText, hashStr: hashStr };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
    if (require.main === module) selfTest();
  }

  function selfTest() {
    var assert = require("assert"), i, n = 0;
    // 1) press 是自己的逆操作
    var b0 = makePuzzle(1);
    for (i = 0; i < M; i++) assert.deepStrictEqual(press(press(b0, i), i), b0);
    // 2) 角上点一下翻 3 格，中间翻 5 格
    assert.strictEqual(lit(press(zero(), 0)), 3);
    assert.strictEqual(lit(press(zero(), 12)), 5);
    // 3) 随机 300 个种子：出的题一定有解，按解点完一定全灭，且步数在范围内
    for (var s = 0; s < 300; s++) {
      var b = makePuzzle(s * 7919 + 13), sol = solve(b), cur = b.slice();
      assert.ok(sol, "无解 seed " + s);
      sol.forEach(function (p) { cur = press(cur, p); });
      assert.ok(solved(cur), "按解没点灭 seed " + s);
      n += sol.length;
    }
    // 4) 全灭的盘面 0 步
    assert.deepStrictEqual(solve(zero()), []);
    // 5) 同一天出同一题，不同天不同题
    assert.deepStrictEqual(dayOf("2026-11-26"), dayOf("2026-11-26"));
    var diff = 0; for (i = 1; i <= 20; i++) if (JSON.stringify(dayOf("2026-12-" + (i < 10 ? "0" + i : i))) !== JSON.stringify(dayOf("2026-11-26"))) diff++;
    assert.ok(diff >= 15, "每天的题太像");
    // 6) 存在无解盘面时 solve 返回 null（5×5 有 2^2 个盘面无解的类别）
    var bad = zero(); bad[0] = 1; // 只亮左上角一格 = 不可解
    assert.strictEqual(solve(bad), null);
    // 7) 日期工具、评级
    assert.strictEqual(daysBetween("2026-11-25", "2026-11-26"), 1);
    assert.strictEqual(bjDay(Date.parse("2026-11-25T17:00:00Z")), "2026-11-26");
    assert.strictEqual(grade(5, 5), 3); assert.strictEqual(grade(8, 5), 2); assert.strictEqual(grade(9, 5), 1);
    console.log("✅ gx-light 自测通过（300 题平均最少 " + (n / 300).toFixed(1) + " 步）");
  }

  // ====================== 页面 ======================
  if (!A || !A.pages) return;
  var S = null, bound = false, flash = 0;
  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 存不了也能玩，只是刷新后不记得 */ } }
  function rec() { try { var r = JSON.parse(ls("gx:light:rec") || "{}"); return r && typeof r === "object" ? r : {}; } catch (e) { return {}; } }
  function saveRec(r) { lsSet("gx:light:rec", JSON.stringify(r)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // 连续天数：最近一次完成的是今天或昨天才算还在连着
  function streakNow(r, today) {
    if (!r.last) return 0;
    var d = daysBetween(r.last, today);
    return d <= 1 ? (r.streak || 0) : 0;
  }
  function newGame(mode) {
    var day = bjDay(), b = mode === "daily" ? dayOf(day) : makePuzzle((Math.random() * 4294967296) >>> 0);
    return { mode: mode, day: day, b: b, start: b.slice(), moves: 0, hints: 0, hint: -1, done: false, min: solve(b).length, hist: [] };
  }
  function boardH() {
    var h = "", i;
    for (i = 0; i < M; i++) h += '<button type="button" class="gxl-c' + (S.b[i] ? " on" : "") + (S.hint === i ? " hint" : "") + '" data-gxl="p" data-i="' + i + '" aria-label="第 ' + ((i / N | 0) + 1) + " 行第 " + (i % N + 1) + " 列，" + (S.b[i] ? "亮" : "灭") + '"></button>';
    return '<div class="gxl-bd" id="gxl-bd">' + h + "</div>";
  }
  function doneH() {
    var g = grade(S.moves, S.min), r = rec(), today = bjDay();
    var line = g === 3 ? "🎉 刚好最少步数！" : g === 2 ? "👍 很接近最少步数" : "✅ 通关了，下次试试更少的步数";
    var share = S.mode === "daily" ? '<button type="button" class="gxl-b pri" data-gxl="share">📋 复制成绩，发给朋友比</button>' : "";
    return '<div class="gxl-done"><b>' + line + "</b><p><span>步数：</span>" + S.moves + " · <span>最少：</span>" + S.min + (S.hints ? " · <span>提示：</span>" + S.hints : "") + "</p>" +
      (S.mode === "daily" ? "<p><span>连续：</span>" + streakNow(r, today) + " <span>天</span> · <span>最长：</span>" + (r.best || 0) + " <span>天</span> · <span>明天 0 点（北京时间）出新题</span></p>" : "") + share +
      '<button type="button" class="gxl-b" data-gxl="free">🎲 再练一题</button></div>';
  }
  function draw() {
    var r = rec(), today = bjDay(), tag = S.mode === "daily" ? "<span>今日题：</span>" + S.day.slice(5) : "<span>自由练习</span>";
    A.app.innerHTML = '<section class="gxl" id="gxl-root"><div class="gxl-hero"><h2>💡 每日熄灯</h2><p>点一格，它和上下左右一起翻面；把所有灯点灭。</p></div>' +
      '<div class="gxl-bar"><span>' + tag + '</span><span><span>步数：</span><b id="gxl-mv">' + S.moves + "</b></span><span><span>还亮：</span><b id=\"gxl-lt\">" + lit(S.b) + "</b></span><span>🔥 <span>连续：</span>" + streakNow(r, today) + " <span>天</span></span></div>" +
      boardH() + '<div class="gxl-tools">' +
      '<button type="button" class="gxl-b" data-gxl="undo">↩ 撤销</button><button type="button" class="gxl-b" data-gxl="reset">🔄 重来</button>' +
      '<button type="button" class="gxl-b" data-gxl="hint">💡 提示</button>' + (S.mode === "daily" ? '<button type="button" class="gxl-b" data-gxl="free">🎲 练习</button>' : '<button type="button" class="gxl-b" data-gxl="daily">📅 今日题</button>') + "</div>" +
      '<div id="gxl-msg">' + (S.done ? doneH() : '<p class="gxl-tip">每天一题，全站同一题，步数越少越好。用提示不扣分，但会写在分享里。</p>') + '</div>' +
      '<p class="gxl-note">纯娱乐小游戏：不收费、不连钱包、没有任何币和奖励；成绩只存在这台设备上。由团队维护。</p></section>';
  }
  function save() { if (S.mode === "daily") lsSet("gx:light:cur", JSON.stringify({ day: S.day, b: S.b, moves: S.moves, hints: S.hints, done: S.done, hist: S.hist })); }
  function finish() {
    S.done = true;
    if (S.mode !== "daily") return;
    var r = rec(), today = S.day;
    if (r.last !== today) {
      r.streak = (r.last && daysBetween(r.last, today) === 1) ? (r.streak || 0) + 1 : 1;
      r.last = today; r.best = Math.max(r.best || 0, r.streak);
      r.days = (r.days || 0) + 1;
    }
    r.res = r.res || {};
    var old = r.res[today];
    if (!old || S.moves < old.m) r.res[today] = { m: S.moves, min: S.min, h: S.hints };
    var ks = Object.keys(r.res).sort(); while (ks.length > 30) delete r.res[ks.shift()]; // 只留最近 30 天
    saveRec(r);
  }
  function refresh() {
    var cells = document.querySelectorAll(".gxl-c"), i;
    for (i = 0; i < cells.length && i < M; i++) { cells[i].className = "gxl-c" + (S.b[i] ? " on" : "") + (S.hint === i ? " hint" : ""); cells[i].setAttribute("aria-label", "第 " + ((i / N | 0) + 1) + " 行第 " + (i % N + 1) + " 列，" + (S.b[i] ? "亮" : "灭")); }
    var mv = document.getElementById("gxl-mv"), lt = document.getElementById("gxl-lt"), msg = document.getElementById("gxl-msg");
    if (mv) mv.textContent = S.moves; if (lt) lt.textContent = lit(S.b);
    if (msg) msg.innerHTML = S.done ? doneH() : '<p class="gxl-tip">每天一题，全站同一题，步数越少越好。用提示不扣分，但会写在分享里。</p>';
  }
  function say(t) {
    var m = document.getElementById("gxl-msg"); if (!m) return;
    if (!S.done) { m.innerHTML = '<p class="gxl-tip">' + esc(t) + "</p>"; return; }
    var n = document.getElementById("gxl-say"); // 已通关：提示追加在面板下面，不覆盖「再练一题」等按钮
    if (!n) { n = document.createElement("p"); n.id = "gxl-say"; n.className = "gxl-tip"; m.appendChild(n); }
    n.textContent = t;
  }
  function copy(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { say("已复制，去发给朋友吧 ✅"); }, function () { say(t); }); } catch (e) { /* 走下面的办法 */ }
    say(t);
  }
  function onClick(ev) {
    try {
      var el = ev.target.closest ? ev.target.closest("[data-gxl]") : null;
      if (!el || !document.getElementById("gxl-root") || !S) return;
      var a = el.getAttribute("data-gxl");
      if (a === "p") {
        if (S.done) return;
        var i = Number(el.getAttribute("data-i"));
        if (!(i >= 0 && i < M)) return;
        S.hist.push(i); S.b = press(S.b, i); S.moves++; S.hint = -1;
        if (solved(S.b)) finish();
        save(); refresh();
      } else if (a === "undo") {
        if (S.done || !S.hist.length) return;
        S.b = press(S.b, S.hist.pop()); S.moves = Math.max(0, S.moves - 1); S.hint = -1; save(); refresh();
      } else if (a === "reset") {
        if (S.done && S.mode === "daily") return; // 今天已经通关，不能刷步数
        S.b = S.start.slice(); S.moves = 0; S.hist = []; S.hint = -1; save(); refresh();
      } else if (a === "hint") {
        if (S.done) return;
        var s = solve(S.b);
        if (!s || !s.length) return;
        S.hint = s[Math.floor(flash++ % s.length)]; S.hints++; save(); refresh(); say("点亮着提示边框的那一格（已用 " + S.hints + " 次提示）");
      } else if (a === "free") { S = newGame("free"); draw(); }
      else if (a === "daily") { S = loadDaily(); draw(); }
      else if (a === "share") { copy(shareText(S.day, S.moves, S.min, S.hints)); }
    } catch (e) { /* 点错了不能让整站出问题 */ }
  }
  function loadDaily() {
    var g = newGame("daily");
    try {
      var c = JSON.parse(ls("gx:light:cur") || "null");
      if (c && c.day === g.day && c.b && c.b.length === M && c.hist && c.hist.length === c.moves) { g.b = c.b; g.moves = c.moves; g.hints = c.hints || 0; g.done = !!c.done; g.hist = c.hist; }
    } catch (e) { /* 存档坏了就重新开始 */ }
    return g;
  }
  A.pages.gxlight = function () {
    try {
      if (!bound) { bound = true; document.addEventListener("click", onClick); }
      if (document.getElementById("gxl-root") && !(S && S.mode === "daily" && S.day !== bjDay())) return; // 网站后台刷新会重画当前页：别把正在玩的盘面冲掉（过了 0 点的今日题除外，换新题）
      if (!S || (S.mode === "daily" && S.day !== bjDay())) S = loadDaily();
      draw();
    } catch (e) { A.app.innerHTML = '<section class="card"><p class="note">每日熄灯页面打开失败，请刷新再试。</p></section>'; }
  };
})();

}catch(e){console.error('[bundle] gx-light.js',e);}
;(window.AIL_LOADED=window.AIL_LOADED||{})["gxlight"]="hd421bea5b8";
/*v:hd421bea5b8*/