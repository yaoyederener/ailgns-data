// 销毁乐园 · 免费小游戏：2048、贪吃蛇、俄罗斯方块、飞翔小鸟、扫雷、打砖块
// 免费练习：不花币，最高分存在本机；排位赛：每局付 LGNS（80% 销毁、20% 进分账），分数上全站排行榜（后台 /api/game，规则见 lib/game.js）
(function () {
  var A = window.AIL;
  var LIST = [
    { id: "g2048", icon: "🔢", name: "2048", desc: "滑动合并相同数字，冲击 2048" },
    { id: "snake", icon: "🐍", name: "贪吃蛇", desc: "吃豆变长，别撞墙、别咬到自己" },
    { id: "tetris", icon: "🧱", name: "俄罗斯方块", desc: "经典消行，越消越快" },
    { id: "flappy", icon: "🐤", name: "飞翔小鸟", desc: "点一下飞一下，穿过管子" },
    { id: "mines", icon: "💣", name: "扫雷", desc: "找出所有地雷，长按插旗" },
    { id: "brick", icon: "🏓", name: "打砖块", desc: "左右移动挡板，打碎全部砖块" },
    { id: "merge", icon: "🧬", name: "DNA 合成", desc: "三个相同的连在一起就合成更高级的 DNA" },
    { id: "pet", icon: "🌱", name: "HELIX 宠物", desc: "喂养你的 DNA 宠物，一路升级进化" }
  ];
  A.gameList = LIST;

  function best(k, v) {
    try {
      var b = Number(localStorage.getItem("game:" + k)) || 0;
      if (v !== undefined && v > b) { localStorage.setItem("game:" + k, String(v)); b = v; }
      return b;
    } catch (e) { return v || 0; }
  }

  // ---------- 排位赛：每局付 10 LGNS 进收款合约（80% 销毁、20% 进分账），分数上全站排行榜；不赢币、没有奖品 ----------
  var W = A.wallet, CHN = { anubis: "Anubis", polygon: "Polygon" };
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function sha(t) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)).then(function (d) { return Array.prototype.map.call(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }); }
  function post(b) { return fetch("/api/game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error); return j; }); }
  function saved(g, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("gtk:" + g) || "null"); if (v) localStorage.setItem("gtk:" + g, JSON.stringify(v)); else localStorage.removeItem("gtk:" + g); } catch (e) { return null; } }
  function buy(g, info, ch, say) {
    var C = info.pay[ch], eth, account, data;
    return A.wallets.choose().then(function (p) {
      eth = p;
      return A.wallets.ask(eth, { method: "eth_requestAccounts" });
    }).then(function (a) {
      account = String(a[0]).toLowerCase();
      say("正在切换到 " + CHN[ch] + " 链…");
      return W.switchTo(eth, ch);
    }).then(function () { return sha(g); }).then(function (h) {
      data = "0xa9059cbb" + A.pad(C.payTo) + u256(BigInt(info.price) * 10n ** 9n) + "4741" + h;
      say("正在检查 LGNS 余额…");
      return W.rpcOn(ch, "eth_call", [{ from: account, to: C.token, data: data }, "latest"]).catch(function () { throw new Error("LGNS 不够或 Gas 不够：每局要 " + info.price + " LGNS（" + CHN[ch] + " 链），还要一点 " + (ch === "polygon" ? "POL" : "DAI") + " 付 Gas"); });
    }).then(function () {
      say("🔒 80% 直接销毁、20% 进分账合约。请在钱包确认支付 " + info.price + " LGNS");
      return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: C.token, data: data }] });
    }).then(function (tx) {
      saved(g, { tx: tx, ch: ch });
      say("已付款，等待链上确认…");
      return W.waitOn(ch, tx).then(function () { return tx; });
    }).then(function (tx) { return confirm(g, tx, ch, say); });
  }
  function confirm(g, tx, ch, say) { // 链上确认后后台还要几秒才查得到，多试几次
    var n = 0;
    function once() {
      return post({ act: "ticket", tx: tx, game: g, chain: ch }).then(function (r) { if (r.used) { saved(g, null); throw new Error("这张门票已经用过了"); } return tx; }, function (e) {
        if (++n < 6 && /查不到/.test(e.message)) { say("正在核对付款…"); return new Promise(function (ok) { setTimeout(ok, 3000); }).then(once); }
        throw e;
      });
    }
    return once();
  }
  // 免费练习：每个游戏每台手机 3 次，用完只能排位赛（站长要求，不无限免费）
  var FREE = 3;
  function freeLeft(g) { try { return Math.max(0, FREE - (Number(localStorage.getItem("gfree:" + g)) || 0)); } catch (e) { return 0; } }
  function useFree(g) { try { localStorage.setItem("gfree:" + g, String(FREE - freeLeft(g) + 1)); } catch (e) { /* 无痕模式 */ } }
  function boardHtml(info) {
    var b = info.board || [];
    return '<section class="card"><div class="card-head"><h2>🏆 排位赛排行榜</h2><span class="muted">每个地址只算最好一局</span></div>' +
      (b.length ? '<ol class="gm-rank">' + b.slice(0, 20).map(function (x) { return "<li><span class=\"mono\">" + A.short(x.a) + "</span><b>" + x.s + "</b></li>"; }).join("") + "</ol>" : '<p class="muted">还没有人上榜，第一名等你来拿！</p>') +
      '<p class="note">销毁乐园累计销毁 <b>' + A.fmt(info.stats.burned || 0) + " LGNS</b>，排位赛已玩 " + (info.stats.plays || 0) + " 局。只消耗、不赢币：排行榜只有名次，没有奖金奖品。</p></section>";
  }

  // 公共外壳：标题、分数、最高分、免费练习 / 排位赛；游戏只管往 .gm-stage 里画
  function shell(id, g, howto, start) {
    A.app.innerHTML = '<a class="px-back" href="#/play">← 销毁乐园</a>' +
      '<section class="card gm-card"><div class="gm-head"><h2>' + g.icon + " " + g.name + '</h2><div class="gm-sc"><span id="gm-mode">免费练习</span><span>分数 <b id="gm-s">0</b></span><span>最高 <b id="gm-b">' + best(g.id) + '</b></span></div></div>' +
      '<div class="gm-stage" id="gm-stage"></div>' +
      '<div class="gm-bar"><button type="button" class="ghost" id="gm-re">🔄 免费练习</button><button type="button" class="gm-rk" id="gm-rk">🔥 排位赛 · 10 LGNS 一局</button></div>' +
      '<div class="gm-ch" id="gm-ch"><span>用哪条链的 LGNS：</span><button type="button" data-ch="anubis" class="on">Anubis</button><button type="button" data-ch="polygon">Polygon</button></div>' +
      '<p class="note" id="gm-st"></p><p class="note">' + howto + "</p></section>" +
      '<div id="gm-board"></div>' +
      '<p class="note">每个游戏可以免费练习 3 次，分数只存在本机；之后排位赛每局 10 LGNS：<b>80% 直接销毁</b>，20% 进分账合约用于平台运营，分数进全站排行榜。</p>';
    var stage = document.getElementById("gm-stage"), sEl = document.getElementById("gm-s"), bEl = document.getElementById("gm-b"), st = document.getElementById("gm-st"), rk = document.getElementById("gm-rk");
    var info = null, ch = "anubis", ranked = null, cur = 0;
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; if (bad && A.errTip) A.errTip(t, st); }
    function loadBoard() {
      return fetch("/api/game?g=" + g.id).then(function (r) { return r.json(); }).then(function (j) {
        info = j; rk.textContent = "🔥 排位赛 · " + j.price + " LGNS 一局";
        if (api.alive()) document.getElementById("gm-board").innerHTML = boardHtml(j);
      }).catch(function () { /* 读不到排行榜不影响免费玩 */ });
    }
    var api = {
      alive: function () { return A.isCurrent(id) && document.body.contains(stage); },
      score: function (v) { cur = v; sEl.textContent = v; bEl.textContent = best(g.id, v); },
      over: function (msg) {
        var d = document.createElement("div");
        d.className = "gm-over";
        d.innerHTML = "<b>" + (msg || "游戏结束") + "</b><span></span>" + againHtml();
        bindAgain(d);
        stage.appendChild(d);
        if (ranked) {
          var tx = ranked; ranked = null;
          var note = d.querySelector("span");
          note.textContent = "正在提交排位赛成绩…";
          post({ act: "score", tx: tx, score: cur }).then(function (r) {
            saved(g.id, null);
            note.textContent = "🏆 排位赛成绩 " + cur + " 分，全站第 " + r.rank + " 名！";
            loadBoard();
          }, function (e) { note.textContent = "成绩没交上：" + e.message; });
        }
      }
    };
    function againHtml() {
      var n = freeLeft(g.id);
      return '<div class="gm-again"><button type="button" data-go="rk">🔥 排位赛 · ' + (info ? info.price : 10) + " LGNS 一局</button>" +
        (n ? '<button type="button" class="ghost" data-go="free">免费练习（还剩 ' + n + " 次）</button>" : '<small>免费练习 3 次已用完，排位赛每局 80% 销毁</small>') + "</div>";
    }
    function bindAgain(d) {
      var f = d.querySelector("[data-go=free]"), k = d.querySelector("[data-go=rk]");
      if (f) f.onclick = function () { run(null); };
      if (k) k.onclick = function () { rk.click(); };
    }
    function startCard() { // 进来先选：免费练习 / 排位赛（不自动开始，免得白白用掉免费次数）
      if (stop) stop();
      stop = null; stage.innerHTML = '<div class="gm-start">' + g.icon + "</div>";
      var d = document.createElement("div");
      d.className = "gm-over gm-first";
      d.innerHTML = "<b>" + g.name + "</b>" + againHtml();
      bindAgain(d);
      stage.appendChild(d);
      freeBtn();
    }
    function freeBtn() { var n = freeLeft(g.id), b = document.getElementById("gm-re"); b.textContent = n ? "🔄 免费练习（剩 " + n + " 次）" : "免费次数已用完"; b.disabled = !n; }
    var stop = null;
    function run(tx) {
      if (!tx) { if (!freeLeft(g.id)) return startCard(); useFree(g.id); }
      if (stop) stop();
      ranked = tx || null;
      freeBtn();
      document.getElementById("gm-mode").textContent = ranked ? "🔥 排位赛" : "免费练习";
      stage.innerHTML = ""; api.score(0); stop = start(stage, api) || null;
    }
    document.getElementById("gm-re").onclick = function () { run(null); };
    document.querySelectorAll("#gm-ch [data-ch]").forEach(function (b) {
      b.onclick = function () { ch = b.getAttribute("data-ch"); document.querySelectorAll("#gm-ch [data-ch]").forEach(function (x) { x.classList.toggle("on", x === b); }); };
    });
    rk.onclick = function () {
      var old = saved(g.id);
      rk.disabled = true;
      (old ? confirm(g.id, old.tx, old.ch, say) : (info ? Promise.resolve() : loadBoard()).then(function () {
        if (!info) throw new Error("排行榜服务暂时连不上，请稍后再试");
        return buy(g.id, info, ch, say);
      })).then(function (tx) {
        rk.disabled = false; say("✅ 门票已确认，排位赛开始！这一局的分数会上全站排行榜。");
        run(tx);
        stage.scrollIntoView({ block: "center", behavior: "smooth" });
      }, function (e) { rk.disabled = false; if (old && /用过/.test(e.message)) saved(g.id, null); say((W.error ? W.error(e) : e.message) || "没成功", true); });
    };
    if (saved(g.id)) rk.textContent = "🔥 继续排位赛（已付款的门票）";
    loadBoard().then(function () { if (saved(g.id)) rk.textContent = "🔥 继续排位赛（已付款的门票）"; });
    startCard();
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

  // ---------- DNA 合成：5×5 格子，点空格放下「下一个」；3 个以上相同等级连在一起就合成高一级（可以连锁），放满了结束 ----------
  var DNA = ["", "🧪", "🦠", "🧫", "🧬", "🌱", "🐛", "🦋", "🐉", "👑"];
  function merge(stage, api) {
    var N = 5, b = [], score = 0, next = pick(), dead = false;
    for (var i = 0; i < N * N; i++) b.push(0);
    var top = document.createElement("div"); top.className = "mg-next"; stage.appendChild(top);
    var grid = document.createElement("div"); grid.className = "mg-grid"; stage.appendChild(grid);
    function pick() { var r = Math.random(); return r < .68 ? 1 : r < .93 ? 2 : 3; }
    function group(i) { // 和 i 相连、等级相同的格子
      var lv = b[i], seen = {}, st = [i], out = [];
      while (st.length) {
        var k = st.pop(); if (seen[k]) continue; seen[k] = 1; out.push(k);
        var r = Math.floor(k / N), c = k % N;
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (p) { if (p[0] >= 0 && p[0] < N && p[1] >= 0 && p[1] < N && b[p[0] * N + p[1]] === lv) st.push(p[0] * N + p[1]); });
      }
      return out;
    }
    function place(i) {
      if (dead || b[i]) return;
      b[i] = next;
      for (;;) {
        var gp = group(i);
        if (gp.length < 3 || b[i] >= DNA.length - 1) break;
        var lv = b[i] + 1;
        gp.forEach(function (k) { b[k] = 0; });
        b[i] = lv; score += Math.pow(3, lv - 1) * gp.length; api.score(score);
        if (navigator.vibrate) navigator.vibrate(15);
      }
      next = pick(); draw();
      if (b.indexOf(0) < 0) { dead = true; api.over("格子满了！最高合成到 " + DNA[Math.max.apply(null, b)]); }
    }
    function draw() {
      top.innerHTML = "下一个：<b>" + DNA[next] + "</b><small>3 个相同的连在一起就合成</small>";
      grid.innerHTML = b.map(function (v, i) { return '<button type="button" data-i="' + i + '" class="mg-c l' + v + '">' + (DNA[v] || "") + "</button>"; }).join("");
    }
    grid.addEventListener("click", function (e) { var c = e.target.closest("[data-i]"); if (c) place(+c.getAttribute("data-i")); });
    draw();
  }

  // ---------- HELIX 宠物：存在本机；免费喂 3 次，之后高级饲料 10 LGNS 一份（+50 成长值），成长值上全站「宠物成长榜」 ----------
  var STAGES = [[0, "🥚", "DNA 蛋"], [30, "🐣", "破壳宝宝"], [100, "🦎", "小螺旋兽"], [250, "🐲", "螺旋龙"], [500, "🐉", "HELIX 神龙"], [1000, "👑", "螺旋之王"]];
  function petPage(id, g) {
    var pet; try { pet = JSON.parse(localStorage.getItem("pet") || "null"); } catch (e) { pet = null; }
    if (!pet) pet = { xp: 0, fed: Date.now(), born: Date.now() };
    function save() { try { localStorage.setItem("pet", JSON.stringify(pet)); } catch (e) { /* 无痕模式 */ } }
    function stage() { var s = STAGES[0]; STAGES.forEach(function (x) { if (pet.xp >= x[0]) s = x; }); return s; }
    function hunger() { return Math.min(100, Math.floor((Date.now() - pet.fed) / 36e5 * 4)); } // 每小时饿 4 点
    A.app.innerHTML = '<a class="px-back" href="#/play">← 销毁乐园</a><section class="card gm-card"><div class="gm-head"><h2>🌱 HELIX 宠物</h2></div><div id="pt-box"></div>' +
      '<div class="gm-ch" id="gm-ch"><span>用哪条链的 LGNS：</span><button type="button" data-ch="anubis" class="on">Anubis</button><button type="button" data-ch="polygon">Polygon</button></div>' +
      '<p class="note" id="gm-st"></p><p class="note">每份高级饲料 10 LGNS：<b>80% 直接销毁</b>，20% 进分账合约用于平台运营。宠物存在你这台手机上，成长值进全站「宠物成长榜」。</p></section><div id="gm-board"></div>';
    var box = document.getElementById("pt-box"), st = document.getElementById("gm-st"), info = null, ch = "anubis";
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; if (bad && A.errTip) A.errTip(t, st); }
    function draw() {
      var s = stage(), nx = STAGES[STAGES.indexOf(s) + 1], h = hunger(), n = freeLeft("pet");
      box.innerHTML = '<div class="pt-pet' + (h > 70 ? " hungry" : "") + '">' + s[1] + "</div>" +
        '<p class="pt-name"><b>' + s[2] + "</b> · 成长值 " + pet.xp + (nx ? "（还差 " + (nx[0] - pet.xp) + " 进化成 " + nx[1] + "）" : "（已满级）") + "</p>" +
        '<div class="pt-bar"><span>饥饿</span><i><em style="width:' + h + '%"></em></i><b>' + (h > 70 ? "饿坏了！" : h > 30 ? "有点饿" : "吃饱了") + "</b></div>" +
        '<div class="gm-again pt-acts"><button type="button" data-go="rk">🍖 高级饲料 · 10 LGNS（+50 成长）</button>' +
        (n ? '<button type="button" class="ghost" data-go="free">🍎 免费喂一次（还剩 ' + n + " 次，+5 成长）</button>" : "<small>免费喂食 3 次已用完</small>") + "</div>";
      var f = box.querySelector("[data-go=free]"), k = box.querySelector("[data-go=rk]");
      if (f) f.onclick = function () { useFree("pet"); feed(5); };
      k.onclick = paid;
    }
    function feed(x) { var before = stage(); pet.xp += x; pet.fed = Date.now(); save(); draw(); var after = stage(); say(after !== before ? "🎉 进化了！变成了 " + after[1] + " " + after[2] : "😋 吃饱了，成长值 +" + x); }
    function loadBoard() { return fetch("/api/game?g=pet").then(function (r) { return r.json(); }).then(function (j) { info = j; if (A.isCurrent(id)) document.getElementById("gm-board").innerHTML = boardHtml(j).replace("排位赛排行榜", "宠物成长榜").replace("每个地址只算最好一局", "按成长值排名"); }).catch(function () {}); }
    function paid() {
      var k = box.querySelector("[data-go=rk]"), old = saved("pet");
      k.disabled = true;
      (old ? confirm("pet", old.tx, old.ch, say) : (info ? Promise.resolve() : loadBoard()).then(function () {
        if (!info) throw new Error("服务暂时连不上，请稍后再试");
        return buy("pet", info, ch, say);
      })).then(function (tx) {
        feed(50);
        return post({ act: "score", tx: tx, score: pet.xp }).then(function (r) { saved("pet", null); say("🍖 喂好了！成长值 " + pet.xp + "，宠物成长榜第 " + r.rank + " 名"); loadBoard(); });
      }).catch(function (e) { if (old && /用过/.test(e.message)) saved("pet", null); var b = box.querySelector("[data-go=rk]"); if (b) b.disabled = false; say((W.error ? W.error(e) : e.message) || "没成功", true); });
    }
    document.querySelectorAll("#gm-ch [data-ch]").forEach(function (b) {
      b.onclick = function () { ch = b.getAttribute("data-ch"); document.querySelectorAll("#gm-ch [data-ch]").forEach(function (x) { x.classList.toggle("on", x === b); }); };
    });
    draw(); loadBoard();
  }

  var RUN = { g2048: g2048, snake: snake, tetris: tetris, flappy: flappy, mines: mines, brick: brick, merge: merge };
  var HOW = {
    g2048: "手机上下左右滑动，电脑用方向键。相同数字碰到一起会合并。",
    snake: "滑动屏幕或点下面的方向键，电脑用方向键。每吃一颗豆 +10 分，越来越快。",
    tetris: "左右滑动移动，轻点或上滑旋转，下滑直接落到底；也可以用下面的按键。消一行 100 分，一次消四行 800 分。",
    flappy: "点一下屏幕小鸟就往上飞一下，穿过管子的空隙，每穿过一根 +1 分。",
    mines: "点格子翻开，数字是周围 8 格里有几颗雷；长按（电脑右键）插旗。第一下一定不是雷。",
    brick: "手指在画面上左右拖动挡板（电脑用鼠标），把球弹回去打碎全部砖块。",
    merge: "点空格子放下「下一个」。3 个或更多相同的连在一起（上下左右）就合成高一级，还能连锁合成。格子放满就结束，等级越高分越多。"
  };
  LIST.forEach(function (g) {
    A.pages[g.id] = g.id === "pet" ? function (id) { petPage(id, g); } : function (id) { shell(id, g, HOW[g.id], RUN[g.id]); };
  });
})();
