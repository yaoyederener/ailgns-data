// LGNS 像素墙：100×100 格子，花 LGNS 涂色；花掉的 LGNS 直接转进销毁地址。只消耗、不赢币
// 付款：钱包把 LGNS 转到销毁地址，转账数据末尾附上「PX + 这批格子的 sha256」，后台核对后涂上（见 lib/pixel.js）
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  var LGNS = "0x4D1D808a081FdAc440703b3765FC61f8028C06B8", BURN = "0x000000000000000000000000000000000000dEaD";
  var PAIR = "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0"; // Anubis LGNS/DAI 池（token0 = LGNS，token1 = DAI），算大约多少 DAI
  var SIZE = 100, UNIT = 5, MAX_PX = 200, EMPTY = "#f6f5fb";
  var COLORS = ["#ffffff", "#d9d6e4", "#848298", "#191839", "#ef4444", "#ff8a3d", "#facc15", "#16a34a",
    "#22d3ee", "#009cff", "#2865fc", "#4936ff", "#7027d9", "#a014f8", "#ff6fb5", "#8b5a2b"];
  var PENDING = "px:pending"; // 付了款但还没涂上的（网络断了等），下次打开自动补交
  var VIEWS = [10, 20, 40];

  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function store(k, v) { try { if (v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function post(body) {
    return fetch("/api/pixel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error); return j; });
  }

  var board = null, mkt = null, account = null;
  var sel = {}; // 选中的格子：编号 → 颜色
  var color = 12, view = 20, cx = 40, cy = 40; // 当前颜色、放大窗口大小、放大窗口左上角

  function nOf(i) { return (board && board.n[i]) || 0; }
  function priceOf(i) { return UNIT * (nOf(i) + 1); }
  function selList() { return Object.keys(sel).map(Number).sort(function (a, b) { return a - b; }); }
  function total() { return selList().reduce(function (a, i) { return a + priceOf(i); }, 0); }
  function colorAt(i) { return sel[i] !== undefined ? COLORS[sel[i]] : board.c[i] === "." ? EMPTY : COLORS[parseInt(board.c[i], 16)]; }

  A.pages.pixel = function (id) {
    A.app.innerHTML = '<div class="loading">正在加载像素墙…</div>';
    Promise.all([
      fetch("/api/pixel").then(function (r) { return r.json(); }),
      A.call(PAIR, "0x0902f1ac").then(function (h) { return (Number(A.word(h, 1)) / 1e18) / (Number(A.word(h, 0)) / 1e9); }).catch(function () { return null; }),
      A.wallets.silent().then(function (a) { if (a) account = String(a).toLowerCase(); }).catch(function () {})
    ]).then(function (r) {
      if (!A.isCurrent(id)) return;
      board = r[0]; mkt = r[1];
      draw(id);
      retryPending(id);
    }, function () {
      if (A.isCurrent(id)) A.app.innerHTML = '<div class="card err">像素墙读取失败，请稍后刷新。</div>';
    });
  };

  function draw(id) {
    var s = board.s;
    A.app.innerHTML = '<section class="px-hero"><h1>🧱 LGNS 像素墙</h1>' +
      "<p>花 LGNS 给格子涂色，画出你的图案、名字、社区标志。别人可以花更多 LGNS 盖掉你的格子，守住你的地盘！</p>" +
      '<p class="px-burn">🔥 花掉的 LGNS 全部转进<a target="_blank" rel="noopener" href="https://anubisscan.io/address/' + BURN + '">销毁地址 ↗</a>，链上可查，谁也拿不回来</p></section>' +
      '<div class="kpis px-kpis"><div class="kpi"><div class="k">已销毁</div><div class="v">' + A.fmt(s.burned) + ' <small>LGNS</small></div></div>' +
      '<div class="kpi"><div class="k">已涂</div><div class="v">' + A.fmt(s.paints) + ' <small>次</small></div></div>' +
      '<div class="kpi"><div class="k">参与</div><div class="v">' + A.fmt(s.txs) + ' <small>笔</small></div></div></div>' +
      '<section class="card px-card"><div class="px-wrap"><div class="px-ov-box"><canvas id="px-ov" width="' + SIZE + '" height="' + SIZE + '"></canvas><div id="px-win"></div></div>' +
      '<p class="note px-tip">点上面的整面墙，下面放大那一块；点下面的格子选中 / 取消</p>' +
      '<div class="px-zoom-bar"><div class="seg" id="px-views">' + VIEWS.map(function (v) { return '<button type="button" data-v="' + v + '"' + (v === view ? ' class="on"' : "") + ">" + v + "×" + v + "</button>"; }).join("") + "</div>" +
      '<div class="px-arrows"><button type="button" class="ghost" data-mv="0,-1">↑</button><button type="button" class="ghost" data-mv="-1,0">←</button><button type="button" class="ghost" data-mv="1,0">→</button><button type="button" class="ghost" data-mv="0,1">↓</button></div></div>' +
      '<canvas id="px-zoom"></canvas></div>' +
      '<div class="px-colors" id="px-colors">' + COLORS.map(function (c, i) { return '<button type="button" data-c="' + i + '" style="background:' + c + '"' + (i === color ? ' class="on"' : "") + ' aria-label="颜色 ' + (i + 1) + '"></button>'; }).join("") + "</div>" +
      '<p class="note" id="px-info">点一个格子看它的信息</p>' +
      '<div class="px-bar"><div class="px-sum" id="px-sum"></div><button type="button" class="ghost" id="px-clear">清空</button><button type="button" id="px-pay">支付并涂色</button></div><p class="note" id="px-st"></p></section>' +
      '<section class="card"><div class="card-head"><h2>🏆 销毁排行榜</h2><span class="muted">累计花掉的 LGNS</span></div>' + topHtml() + "</section>" +
      '<section class="card"><div class="card-head"><h2>玩法</h2></div><ol class="steps">' +
      "<li>选颜色，点格子（一次最多 " + MAX_PX + " 格），可以拼字、画图</li>" +
      "<li>空格子 <b>" + UNIT + " LGNS</b> 一格；被涂过的格子更贵：第 k 次涂要 <b>" + UNIT + "×k LGNS</b>（10、15、20…）</li>" +
      "<li>点「支付并涂色」，在钱包里确认一笔 LGNS 转账（Anubis 链，Gas 用 DAI），几秒后就涂上</li>" +
      "<li>花掉的 LGNS 全部销毁，只换来墙上的格子和排行榜名次，不返还任何币</li></ol>" +
      '<p class="note">付款转账里附带了这次所选格子的校验码，后台核对链上转账后才涂上，付款不会被别人冒用。同一时间有人抢先涂了同一格，你付款前 10 分钟内被涂的照样给你涂上。</p></section>';
    bind(id);
    paintAll();
    summary();
  }

  function topHtml() {
    if (!board.top.length) return '<div class="empty">还没有人上榜，第一个就是你！</div>';
    return '<ol class="px-top">' + board.top.map(function (t, k) {
      return "<li><b>" + (k + 1) + '</b><span class="mono">' + (t.addr === account ? "我 " : "") + A.short(t.addr) + "</span><em>" + A.fmt(t.burned) + " LGNS</em></li>";
    }).join("") + "</ol>";
  }

  // ---------- 画墙 ----------
  function paintAll() { paintOverview(); paintZoom(); }
  function paintOverview() {
    var cv = document.getElementById("px-ov");
    if (!cv) return;
    var g = cv.getContext("2d"), img = g.createImageData(SIZE, SIZE);
    for (var i = 0; i < SIZE * SIZE; i++) {
      var h = colorAt(i);
      img.data[i * 4] = parseInt(h.slice(1, 3), 16); img.data[i * 4 + 1] = parseInt(h.slice(3, 5), 16); img.data[i * 4 + 2] = parseInt(h.slice(5, 7), 16); img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var win = document.getElementById("px-win");
    win.style.left = cx + "%"; win.style.top = cy + "%"; win.style.width = view + "%"; win.style.height = view + "%";
  }
  function paintZoom() {
    var cv = document.getElementById("px-zoom");
    if (!cv) return;
    var w = cv.parentNode.clientWidth, dpr = window.devicePixelRatio || 1, cell = w / view;
    cv.style.width = w + "px"; cv.style.height = w + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
    var g = cv.getContext("2d");
    g.scale(dpr, dpr);
    for (var y = 0; y < view; y++) for (var x = 0; x < view; x++) {
      var i = (cy + y) * SIZE + cx + x;
      g.fillStyle = colorAt(i); g.fillRect(x * cell, y * cell, cell, cell);
      if (sel[i] !== undefined) { // 选中的格子：画个框
        g.strokeStyle = "#7027d9"; g.lineWidth = Math.max(1.5, cell / 10);
        g.strokeRect(x * cell + g.lineWidth / 2, y * cell + g.lineWidth / 2, cell - g.lineWidth, cell - g.lineWidth);
      }
    }
    if (cell >= 8) { // 格子够大才画网格线
      g.strokeStyle = "rgba(25,24,57,.08)"; g.lineWidth = 1;
      for (var k = 0; k <= view; k++) {
        g.beginPath(); g.moveTo(k * cell, 0); g.lineTo(k * cell, w); g.stroke();
        g.beginPath(); g.moveTo(0, k * cell); g.lineTo(w, k * cell); g.stroke();
      }
    }
  }
  function clamp(v) { return Math.max(0, Math.min(SIZE - view, v)); }

  // ---------- 交互 ----------
  function bind(id) {
    var ov = document.getElementById("px-ov"), zoom = document.getElementById("px-zoom");
    ov.onclick = function (e) {
      var r = ov.getBoundingClientRect();
      cx = clamp(Math.round((e.clientX - r.left) / r.width * SIZE - view / 2));
      cy = clamp(Math.round((e.clientY - r.top) / r.height * SIZE - view / 2));
      paintAll();
    };
    zoom.onclick = function (e) {
      var r = zoom.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * view), y = Math.floor((e.clientY - r.top) / r.height * view);
      if (x < 0 || y < 0 || x >= view || y >= view) return;
      var i = (cy + y) * SIZE + cx + x;
      if (sel[i] === color) delete sel[i];
      else if (sel[i] !== undefined || selList().length < MAX_PX) sel[i] = color;
      else say("一次最多选 " + MAX_PX + " 格，先付款涂上这批", true);
      info(i);
      paintAll();
      summary();
    };
    document.querySelectorAll("#px-views button").forEach(function (b) {
      b.onclick = function () {
        var mid = [cx + view / 2, cy + view / 2];
        view = Number(b.getAttribute("data-v"));
        cx = clamp(Math.round(mid[0] - view / 2)); cy = clamp(Math.round(mid[1] - view / 2));
        document.querySelectorAll("#px-views button").forEach(function (x) { x.classList.toggle("on", x === b); });
        paintAll();
      };
    });
    document.querySelectorAll("[data-mv]").forEach(function (b) {
      b.onclick = function () {
        var d = b.getAttribute("data-mv").split(",").map(Number), step = Math.max(1, view / 2);
        cx = clamp(cx + d[0] * step); cy = clamp(cy + d[1] * step);
        paintAll();
      };
    });
    document.querySelectorAll("#px-colors button").forEach(function (b) {
      b.onclick = function () {
        color = Number(b.getAttribute("data-c"));
        document.querySelectorAll("#px-colors button").forEach(function (x) { x.classList.toggle("on", x === b); });
      };
    });
    document.getElementById("px-clear").onclick = function () { sel = {}; paintAll(); summary(); };
    document.getElementById("px-pay").onclick = function () { pay(id, this); };
    window.onresize = function () { if (document.getElementById("px-zoom")) paintZoom(); };
  }
  function info(i) {
    var n = nOf(i), x = i % SIZE, y = Math.floor(i / SIZE), owner = board.o[i];
    document.getElementById("px-info").innerHTML = "格子 (" + (x + 1) + ", " + (y + 1) + ")：" + (n ? "被涂过 " + n + " 次，现在属于 <span class=\"mono\">" + (owner === account ? "我" : A.short(owner)) + "</span>" : "还是空的") +
      " · 涂这一格要 <b>" + priceOf(i) + " LGNS</b>";
  }
  function summary() {
    var k = selList().length, t = total(), el = document.getElementById("px-sum");
    el.innerHTML = k ? "已选 <b>" + k + "</b> 格 · 共 <b>" + A.fmt(t) + " LGNS</b>" + (mkt ? '<small>约 ' + (t * mkt).toFixed(2) + " DAI</small>" : "") : '<span class="muted">还没选格子</span>';
    document.getElementById("px-pay").disabled = !k;
  }
  function say(t, bad) {
    var st = document.getElementById("px-st");
    if (!st) return;
    st.className = "note" + (bad ? " down" : "");
    st.innerHTML = t;
  }

  // ---------- 付款 ----------
  function pay(id, btn) {
    var list = selList();
    if (!list.length) return;
    var px = list.map(function (i) { return [i, sel[i], nOf(i)]; }), t = total(), amount = BigInt(t) * 10n ** 9n, eth, data;
    btn.disabled = true;
    A.wallets.choose().then(function (p) {
      eth = p;
      return eth.request({ method: "eth_requestAccounts" });
    }).then(function (a) {
      account = String(a[0]).toLowerCase();
      say("正在切换到 Anubis 链…");
      return W.switchTo(eth, "anubis");
    }).then(function () {
      return Promise.all([A.call(LGNS, "0x70a08231" + A.pad(account)).then(BigInt), A.rpc("eth_getBalance", [account, "latest"]).then(BigInt), sha256(JSON.stringify(px))]);
    }).then(function (r) {
      if (r[0] < amount) throw new Error("LGNS 不够：需要 " + A.fmt(t) + " LGNS，钱包里有 " + A.fmt(Number(r[0]) / 1e9, 2) + "（Anubis 链）");
      if (r[1] < 10n ** 16n) throw new Error("钱包里要有一点 DAI 付 Gas（0.01 DAI 就够）");
      data = "0xa9059cbb" + A.pad(BURN) + u256(amount) + "5058" + r[2];
      say("正在检查交易能否成功…");
      return A.rpc("eth_call", [{ from: account, to: LGNS, data: data }, "latest"]);
    }).then(function () {
      say("请在钱包里确认：销毁 " + A.fmt(t) + " LGNS 涂 " + px.length + " 格…");
      return eth.request({ method: "eth_sendTransaction", params: [{ from: account, to: LGNS, data: data }] });
    }).then(function (tx) {
      store(PENDING, { tx: tx, px: px });
      say("已提交，等待链上确认…");
      return W.waitOn("anubis", tx).then(function () { return tx; });
    }).then(function (tx) {
      say("正在涂色…");
      return submitPaid(tx, px);
    }).then(function (r) {
      sel = {};
      say("✅ 涂好了 " + r.applied + " 格！" + (r.skipped ? "（" + r.skipped + " 格被别人抢先涂了）" : ""));
      setTimeout(function () { if (A.isCurrent(id)) A.pages.pixel(id); }, 1500);
    }, function (e) {
      say(W.error(e), true);
      btn.disabled = false;
    });
  }
  // 链上刚确认时，后台的节点可能还没同步到：多试几次
  function submitPaid(tx, px, tries) {
    tries = tries || 0;
    return post({ tx: tx, px: px }).then(function (r) { store(PENDING); return r; }, function (e) {
      if (tries < 5 && /查不到/.test(e.message)) return new Promise(function (ok) { setTimeout(ok, 3000); }).then(function () { return submitPaid(tx, px, tries + 1); });
      throw e;
    });
  }
  function retryPending(id) {
    var p = load(PENDING);
    if (!p || !p.tx) return;
    say("发现一笔已付款还没涂上的，正在补交…");
    submitPaid(p.tx, p.px).then(function (r) {
      say("✅ 补交成功，涂好了 " + r.applied + " 格");
      setTimeout(function () { if (A.isCurrent(id)) A.pages.pixel(id); }, 1500);
    }, function (e) {
      if (!/查不到/.test(e.message)) store(PENDING); // 转账失败、不是这批格子的付款等：不再重试
      say("补交失败：" + A.esc(e.message), true);
    });
  }
})();
