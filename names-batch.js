// 📦 批量注册域名（站长 2026-11-08 定）：一次选一批名字，一次授权 DAI，然后注册。
// 四种选名字：🎲 随机（默认：选要几个 → 一键随机生成能注册的，给买极速票的人用）、🔢 挑号码（几位数 / 花样 / 开头结尾，按条件筛）、🤖 AI 起名（描述 → 候选）、✍️ 自己填（一行一个）。
// 付款：只用 DAI（批量只做最简单的一种币）。先查余额、一次授权总额，再逐个注册；钱包支持「一次确认发一串」（wallet_sendCalls）就只按一次，不支持就逐个确认，有进度。
// 便宜档：中文 ≥3 字 / 英文数字 ≥5 位 = 5 DAI/年；3 位英文 640、4 位 160、中文 2 字 50，列表里标清楚。
(function () {
  var A = window.AIL;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var picked = {}, avail = {}, mode = "num", busy = false, simple = false; /* simple = 极简买票窗口（从极速预言家「去买票」进来） */
  function H() { return A.nm; } // names.js 暴露的内部函数（yearPrice、valid、register 等）
  function price(n) { return H().yearPrice(n); }
  function list() { return Object.keys(picked); }
  function total() { return list().reduce(function (t, n) { return t + price(n); }, 0); }

  // ---------- 数字号码生成（站长 2026-11-14：不固定 5 位。f.len = 几位数，0 = 每个随机 5～10 位；5 位及以上都是便宜档 5 DAI） ----------
  function genNums(f) {
    var out = [], tries = 0, want = f.count || 20, head = f.head || "", tail = f.tail || "";
    var minL = Math.max(5, head.length + tail.length);
    var ok = function (s) {
      if (f.has8 && s.indexOf("8") < 0) return false;
      if (f.no4 && s.indexOf("4") >= 0) return false;
      if (f.kind === "aaa" && !/(\d)\1\1/.test(s)) return false; // 豹子（三连同）
      if (f.kind === "abc" && !/(?:012|123|234|345|456|567|678|789)/.test(s)) return false; // 顺子
      if (f.kind === "aabb" && !/(\d)\1(\d)\2/.test(s)) return false; // 对子
      return true;
    };
    if (f.kind === "seq") { // 顺序列出：开头 + 从 0 数起 + 结尾（没选几位数就按 5 位）
      var L = Math.max(f.len || 5, minL), mid = L - head.length - tail.length, lim = Math.pow(10, Math.min(mid, 7));
      for (var i = 0; out.length < want && i < lim && tries++ < 200000; i++) { var s0 = head + (mid ? String(i).padStart(mid, "0") : "") + tail; if (ok(s0)) out.push(s0); }
      return out;
    }
    var seen = {};
    while (out.length < want && tries++ < 20000) {
      var L2 = Math.max(f.len || 5 + Math.floor(Math.random() * 6), minL), s = head;
      for (var k = L2 - head.length - tail.length; k > 0; k--) s += Math.floor(Math.random() * 10);
      s += tail;
      if (!seen[s] && ok(s)) { seen[s] = 1; out.push(s); }
    }
    return out;
  }
  // ---------- 可用性批查 ----------
  function check(names, cb) {
    var need = names.filter(function (n) { return avail[n] === undefined; });
    if (!need.length) return cb();
    fetch("/api/name-check?n=" + encodeURIComponent(need.slice(0, 100).join(","))).then(function (r) { return r.json(); }).then(function (j) {
      Object.keys(j.ok || {}).forEach(function (n) { avail[n] = j.ok[n] ? 1 : 0; });
      (j.bad || []).forEach(function (n) { avail[n] = -1; });
      cb();
    }).catch(function () { cb("查询失败，稍后再试"); });
  }
  // ---------- 界面 ----------
  var box = null;
  // 随机挑 n 个「现在就能注册」的数字域名（5～10 位）：已经被注册的、不合规的直接不要，不够再补，最多补 4 轮
  function pickFree(n, done) {
    var got = [], h = H(), round = 0;
    (function more() {
      var ns = genNums({ count: Math.min(90, Math.ceil((n - got.length) * 1.5) + 3), kind: "rand", len: 0, no4: true });
      check(ns, function (err) {
        if (err) return done(err, got);
        ns.forEach(function (x) { if (got.length < n && avail[x] === 1 && h.valid(x) && got.indexOf(x) < 0) got.push(x); });
        if (got.length < n && ++round < 4) return more();
        done(null, got);
      });
    })();
  }
  function open(opt) {
    if (box) box.remove();
    simple = !!(opt && opt.tickets);
    picked = {}; mode = simple ? "tk" : "quick";
    if (simple) {
      cands = [];
      box = document.createElement("div"); box.className = "modal nb-modal";
      box.innerHTML = '<div class="modal-box nb-box"><div class="card-head"><h2>🎟 买极速预言家的票</h2><button type="button" class="ghost" id="nb-x" style="padding:4px 12px">关闭</button></div>' +
        '<div id="nb-pane"></div>' +
        '<div class="nb-cand" id="nb-cand"></div>' +
        '<div class="nb-foot"><div class="nb-sum" id="nb-sum"></div><button type="button" class="nm-go" id="nb-go" disabled>付款</button><button type="button" class="nm-go nb-bot" id="nb-bot" disabled>🤖 交给机器人代点</button></div><p class="muted nb-botst" id="nb-botst"></p>' +
        '<p class="muted nb-st" id="nb-st"></p>' +
        '<p class="muted nb-note">自己点付款：买完票马上能用。交给机器人代点：机器人注册完（一般几分钟）票才到。只用 DAI 付。</p></div>';
      document.body.appendChild(box);
      document.getElementById("nb-x").onclick = function () { if (busy && !confirm("正在注册，关了的话已注册的照样有效，没注册的不会扣钱。确定关闭？")) return; box.remove(); box = null; };
      pane(); drawCand();
      return;
    }
    box = document.createElement("div"); box.className = "modal nb-modal";
    box.innerHTML = '<div class="modal-box nb-box"><div class="card-head"><h2>📦 批量注册域名</h2><button type="button" class="ghost" id="nb-x" style="padding:4px 12px">关闭</button></div>' +
      '<div class="seg nb-seg"><button type="button" data-m="quick" class="on">🎲 随机</button><button type="button" data-m="num">🔢 挑号码</button><button type="button" data-m="ai">🤖 AI 起名</button><button type="button" data-m="own">✍️ 自己填</button></div>' +
      '<div id="nb-pane"></div>' +
      '<div class="nb-cand" id="nb-cand"></div>' +
      '<div class="nb-foot"><div class="nb-sum" id="nb-sum">还没选</div><button type="button" class="nm-go" id="nb-go" disabled>注册选中的</button><button type="button" class="nm-go nb-bot" id="nb-bot" disabled>🤖 交给机器人代点</button></div><p class="muted nb-botst" id="nb-botst"></p>' +
      '<p class="muted nb-st" id="nb-st"></p>' +
      '<p class="muted nb-note">便宜档 <b>5 DAI / 年</b>：中文 3 字及以上、英文数字 5 位及以上。3 位英文 640、4 位 160、中文 2 字 50。批量只用 DAI 付，先授权一次总额，再逐个注册；钱包支持「一次确认」的只按一次，否则一个名字按一下，中途停了已注册的照样有效。<br>🤖 <b>交给机器人代点</b>：你只确认 2 次（授权这次的总额 + 签名委托），团队的机器人几分钟内替你逐个注册，名字直接归你；被人抢先的名字不扣钱。结果发到站内信。</p></div>';
    document.body.appendChild(box);
    document.getElementById("nb-x").onclick = function () { if (busy && !confirm("正在注册，关了的话已注册的照样有效，没注册的不会扣钱。确定关闭？")) return; box.remove(); box = null; };
    box.querySelectorAll(".nb-seg button").forEach(function (b) { b.onclick = function () { mode = b.getAttribute("data-m"); box.querySelectorAll(".nb-seg button").forEach(function (x) { x.classList.toggle("on", x === b); }); pane(); }; });
    pane(); drawCand();
  }
  function say(t, bad) { var el = document.getElementById("nb-st"); if (el) { el.textContent = t || ""; el.className = "muted nb-st" + (bad ? " nm-bad" : ""); } }
  function pane() {
    var p = document.getElementById("nb-pane"); if (!p) return;
    if (mode === "tk") {
      // 🎟 极简买票：只有一件事——选买多少票。1 张票 = 1 DAI；买票 = 注册域名（5 DAI 一个 = 5 张票），域名系统随机挑、归客户
      var TK = [10, 20, 50, 100], cur = 10;
      p.innerHTML = '<div class="nb-f nb-q"><p class="nb-qt">买多少张票？<b>1 张票 = 1 DAI</b>。买票就是注册域名（5 DAI 一个 = 5 张票），域名归你。</p>' +
        '<div class="nb-qc">' + TK.map(function (k) { return '<button type="button" data-n="' + k + '"' + (k === cur ? ' class="on"' : "") + ">" + k + " 票<small>" + k + " DAI</small></button>"; }).join("") + "</div>" +
        '<div class="nb-tkc"><span>或者自己填</span><input id="nb-tkn" type="number" min="10" max="250" step="5" inputmode="numeric" placeholder="比如 35"><span>张</span><button type="button" class="nm-go" id="nb-tkgo">确定</button></div>' +
        '<p class="muted nb-tkh" id="nb-tkh">一个域名 5 张票，所以按 5 张一档；最少 10 张，一次最多 250 张，想多买可以再买一次。</p></div>';
      var roll = function () {
        if (busy) return;
        p.querySelectorAll(".nb-qc button").forEach(function (b) { b.classList.toggle("on", Number(b.getAttribute("data-n")) === cur); b.disabled = true; });
        cands = []; picked = {}; drawCand(); say("正在随机挑能注册的域名…");
        pickFree(cur / 5, function (err, got) {
          if (!document.getElementById("nb-pane")) return;
          p.querySelectorAll(".nb-qc button").forEach(function (b) { b.disabled = false; });
          cands = got.slice(); picked = {}; got.forEach(function (x) { picked[x] = 1; });
          say(err ? err : got.length < cur / 5 ? "这次只挑到 " + got.length + " 个，点「换一批」再试" : "", !!err); drawCand();
        });
      };
      var tkn = document.getElementById("nb-tkn"), tkh = document.getElementById("nb-tkh");
      p.querySelectorAll(".nb-qc button").forEach(function (b) { b.onclick = function () { cur = Number(b.getAttribute("data-n")); tkn.value = ""; roll(); }; });
      var custom = function () {
        var v = Math.floor(Number(tkn.value));
        if (!(v > 0)) { tkh.textContent = "填一个数字，比如 35。"; return; }
        var k = Math.min(250, Math.max(10, Math.ceil(v / 5) * 5)); // 一个域名 5 张：往上凑到 5 的倍数；最少 2 个域名；最多 50 个域名
        tkh.textContent = k === v ? "好，买 " + k + " 张。" : v > 250 ? "一次最多 250 张，先按 250 张挑；想多买可以再买一次。" : v < 10 ? "最少 10 张（2 个域名），按 10 张挑。" : "一个域名 5 张票，" + v + " 张凑成 " + k + " 张。";
        tkn.value = k; cur = k; roll();
      };
      document.getElementById("nb-tkgo").onclick = custom;
      tkn.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); custom(); } };
      box.__roll = roll;
      roll(); /* 一打开就先按 10 张票挑好 */
    } else if (mode === "quick") {
      // 🎲 大道至简（站长 2026-11-14）：从极速预言家「去买票」进来的人只想买票——选要几个，一键随机生成能注册的域名，下面直接付款
      var qn = 2, lab = function () { return "🎲 一键随机生成 " + qn + " 个可注册的域名"; };
      p.innerHTML = '<div class="nb-f nb-q"><p class="nb-qt">每个域名 <b>5 DAI</b>，注册了就归你，还送 <b>5 张极速预言家的票</b>。一次至少 2 个才有票。</p>' +
        '<div class="nb-qc">' + [2, 4, 10, 20].map(function (k) { return '<button type="button" data-n="' + k + '"' + (k === qn ? ' class="on"' : "") + ">" + k + " 个<small>" + k * 5 + " 票</small></button>"; }).join("") + "</div>" +
        '<label>或者自己填要几个 <input id="nb-cnt" type="number" min="2" max="50" value="' + qn + '" inputmode="numeric"></label>' +
        '<button type="button" class="nm-go nb-gen" id="nb-gen">' + lab() + "</button></div>";
      var cnt = document.getElementById("nb-cnt"), gen = document.getElementById("nb-gen");
      var setN = function (k) { qn = Math.min(50, Math.max(2, Math.floor(Number(k)) || 2)); gen.textContent = lab(); p.querySelectorAll(".nb-qc button").forEach(function (b) { b.classList.toggle("on", Number(b.getAttribute("data-n")) === qn); }); };
      p.querySelectorAll(".nb-qc button").forEach(function (b) { b.onclick = function () { cnt.value = b.getAttribute("data-n"); setN(cnt.value); }; });
      cnt.oninput = function () { setN(cnt.value); };
      gen.onclick = function () {
        setN(cnt.value); cnt.value = qn;
        gen.disabled = true; say("正在挑能注册的域名…");
        pickFree(qn, function (err, got) {
          gen.disabled = false;
          if (err) return say(err, true);
          cands = got.slice(); picked = {}; got.forEach(function (x) { picked[x] = 1; }); // 换成这一批，全部勾上
          say(got.length < qn ? "这次只挑到 " + got.length + " 个，再点一次换一批" : "挑好了，往下看：不喜欢就再点一次换一批，喜欢就在下面付款。"); drawCand();
        });
      };
    } else if (mode === "num") {
      p.innerHTML = '<div class="nb-f"><label>要几个 <input id="nb-cnt" type="number" min="1" max="50" value="10" inputmode="numeric"></label>' +
        '<label>几位数 <select id="nb-len"><option value="0">随机（5～10 位）</option><option value="5">5 位</option><option value="6">6 位</option><option value="7">7 位</option><option value="8">8 位</option><option value="9">9 位</option><option value="10">10 位</option></select></label>' +
        '<label>花样 <select id="nb-kind"><option value="rand">随机</option><option value="seq">按顺序连号</option><option value="aaa">带豹子（111）</option><option value="abc">带顺子（123）</option><option value="aabb">带对子（1122）</option></select></label>' +
        '<label>开头 <input id="nb-head" placeholder="如 88" maxlength="4" inputmode="numeric"></label><label>结尾 <input id="nb-tail" placeholder="如 8" maxlength="4" inputmode="numeric"></label>' +
        '<label class="nb-chk"><input id="nb-has8" type="checkbox" checked> 要带 8</label><label class="nb-chk"><input id="nb-no4" type="checkbox" checked> 不要 4</label>' +
        '<button type="button" class="nm-go nb-gen" id="nb-gen">生成并查可用</button></div>';
      document.getElementById("nb-gen").onclick = function () {
        var f = { count: Math.min(50, Math.max(1, Number(document.getElementById("nb-cnt").value) || 10)), kind: document.getElementById("nb-kind").value, len: Number(document.getElementById("nb-len").value) || 0, head: document.getElementById("nb-head").value.replace(/\D/g, ""), tail: document.getElementById("nb-tail").value.replace(/\D/g, ""), has8: document.getElementById("nb-has8").checked, no4: document.getElementById("nb-no4").checked };
        addCands(genNums(f));
      };
    } else if (mode === "ai") {
      p.innerHTML = '<div class="nb-f"><textarea id="nb-desc" rows="3" maxlength="80" placeholder="不填就随机出一批；多生成几次，只勾喜欢的几个注册。也可以描述：比如「做茶叶生意的，想要招财的中文名」"></textarea>' +
        '<label>要几个 <input id="nb-cnt" type="number" min="5" max="40" value="20" inputmode="numeric"></label><button type="button" class="nm-go nb-gen" id="nb-gen">🎲 随机生成能注册的名字</button></div>';
      document.getElementById("nb-desc").oninput = function () { var b = document.getElementById("nb-gen"); if (b) b.textContent = this.value.trim() ? "让 AI 按描述出主意" : "🎲 随机生成能注册的名字"; };
      document.getElementById("nb-gen").onclick = function () {
        var d = document.getElementById("nb-desc").value.trim() || "随机生成：吉利、好记、口语化的中文名";
        var b = document.getElementById("nb-gen"); b.disabled = true; say("AI 想名字中…");
        fetch("/api/name-ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desc: d, n: Number(document.getElementById("nb-cnt").value) || 20 }) }).then(function (r) { return r.json(); }).then(function (j) {
          b.disabled = false; if (j.error) return say(j.error, true); if (!j.names || !j.names.length) return say("AI 没想出合规的名字，再点一次或换个说法", true);
          say(""); addCands(j.names);
        }).catch(function () { b.disabled = false; say("AI 现在没空，稍后再试", true); });
      };
    } else {
      p.innerHTML = '<div class="nb-f"><textarea id="nb-own" rows="4" placeholder="一行一个名字，不用写 .ailgns"></textarea><button type="button" class="nm-go nb-gen" id="nb-gen">加入并查可用</button></div>';
      document.getElementById("nb-gen").onclick = function () {
        var ns = document.getElementById("nb-own").value.split(/[\n,，\s]+/).map(function (s) { return s.trim().toLowerCase().replace(/\.(ailgns|lgns)$/, ""); }).filter(Boolean);
        if (!ns.length) return say("先填几个名字", true);
        addCands(ns);
      };
    }
  }
  var cands = [];
  function addCands(ns) {
    var h = H(), fresh = [];
    ns.forEach(function (n) { if (cands.indexOf(n) < 0) { cands.push(n); fresh.push(n); } });
    if (!fresh.length) return say("这些名字已经在列表里了");
    say("查可用中…");
    check(fresh, function (err) {
      if (err) return say(err, true);
      fresh.forEach(function (n) { if (avail[n] === 1 && h.valid(n)) picked[n] = 1; }); // 能注册的默认勾上
      say(""); drawCand();
    });
  }
  function drawCand() {
    var el = document.getElementById("nb-cand"); if (!el) return;
    if (simple) { // 极简买票：只列出挑好的名字（都是能注册的），不给勾选
      el.innerHTML = cands.length ? '<p class="nb-tkl">随机挑好 <b>' + cands.length + "</b> 个能注册的域名：" + cands.map(function (n) { return "<i>" + esc(n) + "</i>"; }).join("") + ' <button type="button" class="link" id="nb-re">🎲 换一批</button></p>' : "";
      var re = document.getElementById("nb-re"); if (re) re.onclick = function () { if (box && box.__roll) box.__roll(); };
      botStatus(); sum(); return;
    }
    if (!cands.length) { el.innerHTML = '<p class="muted">上面生成或填入名字，能注册的会自动勾上。</p>'; sum(); return; }
    el.innerHTML = '<div class="nb-tools"><button type="button" class="link" id="nb-all">全选能注册的</button> · <button type="button" class="link" id="nb-none">全不选</button> · <button type="button" class="link" id="nb-clear">清空列表</button></div>' +
      '<ul class="nb-list">' + cands.map(function (n) {
        var st = avail[n], p = price(n);
        var tag = st === 1 ? '<i class="nb-ok">可注册</i>' : st === 0 ? '<i class="nb-no">已有人</i>' : st === -1 ? '<i class="nb-no">不合规</i>' : '<i class="muted">查询中</i>';
        return '<li' + (st === 1 ? "" : ' class="off"') + '><label><input type="checkbox" data-n="' + esc(n) + '"' + (picked[n] ? " checked" : "") + (st === 1 ? "" : " disabled") + '> <b>' + esc(n) + '</b><small>.ailgns</small></label>' + tag + '<em>' + p + ' DAI/年</em></li>';
      }).join("") + "</ul>";
    el.querySelectorAll("input[data-n]").forEach(function (c) { c.onchange = function () { var n = c.getAttribute("data-n"); if (c.checked) picked[n] = 1; else delete picked[n]; sum(); }; });
    document.getElementById("nb-all").onclick = function () { cands.forEach(function (n) { if (avail[n] === 1) picked[n] = 1; }); drawCand(); };
    botStatus();
    document.getElementById("nb-none").onclick = function () { picked = {}; drawCand(); };
    document.getElementById("nb-clear").onclick = function () { cands = []; picked = {}; drawCand(); };
    sum();
  }
  function sum() {
    var el = document.getElementById("nb-sum"), go = document.getElementById("nb-go"); if (!el || !go) return;
    var n = list().length, t = total();
    el.innerHTML = n ? "选了 <b>" + n + "</b> 个 · 1 年 · 共 <b>" + t + " DAI</b>" + (n >= 2 ? " · 送 <b>" + t + "</b> 张极速票" : " · <em>只选 1 个没有极速票，至少 2 个</em>") : "还没选";
    if (simple) el.innerHTML = n ? "共 <b>" + t + " DAI</b> = <b>" + t + "</b> 张票" : "";
    go.disabled = !n || busy; go.innerHTML = n ? (simple ? "付 " + t + " DAI 买 " + t + " 张票" : "自己点：注册这 " + n + " 个（" + t + " DAI）") + "<small>钱包要确认 " + (n + 1) + " 次（授权 1 次 + 每个名字 1 次）</small>" : simple ? "付款" : "注册选中的";
    go.onclick = run;
    var bt = document.getElementById("nb-bot"); if (bt) { bt.disabled = !n || busy; bt.innerHTML = n ? "🤖 交给机器人代点<small>钱包只确认 2 次（授权 1 次 + 签名 1 次），几分钟内替你注册完</small>" : "🤖 交给机器人代点"; bt.onclick = robot; }
  }
  // ---------- 🤖 机器人代点：客户授权 DAI 给机器人钱包 + 签名委托，机器人用客户的钱替客户注册（名字直接归客户） ----------
  var REG = "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1"; // 代注册机器人钱包（只放 Gas）
  function botText(names, total, a, day) { return "AiLGNS 代注册委托\n请机器人帮我注册（各 1 年，DAI 付款）：" + names.join("、") + "\n共 " + total + " DAI\n我的地址：" + a + "\n日期：" + day; }
  function bjDay() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
  function botStatus() {
    var h = H(), el = document.getElementById("nb-botst"); if (!el || !h.account()) return;
    fetch("/api/reg-order?a=" + h.account()).then(function (r) { return r.json(); }).then(function (j) {
      var l = (j && j.list) || [], p = l.filter(function (o) { return o.state === "pending"; });
      el.innerHTML = p.length ? "🤖 机器人正在处理你的 <b>" + p.reduce(function (s, o) { return s + o.names.length; }, 0) + "</b> 个名字，几分钟内完成，结果发<a href=\"#/inbox\">站内信</a>" : "";
    }).catch(function () {});
  }
  function robot() {
    var h = H(), names = list(); if (!names.length || busy) return;
    busy = true; sum();
    var t = total(), wei = BigInt(t) * 10n ** 18n, a;
    h.connect().then(function () {
      a = h.account();
      return Promise.all([h.balance(h.DAI), h.allowance(h.DAI, REG)]);
    }).then(function (r) {
      if (r[0] < wei) throw new Error("DAI 不够：要 " + t + " DAI，钱包只有 " + (Number(r[0] / 10n ** 16n) / 100));
      if (r[1] >= wei) return;
      return h.tx(h.DAI, "0x095ea7b3" + A.pad(REG) + wei.toString(16).padStart(64, "0"), say, "🔒 第 1 步：授权机器人只能收这次的 " + t + " DAI（不扣钱）。请在钱包确认");
    }).then(function () {
      say("✍️ 第 2 步：签名委托（不扣钱、不花 Gas），请在钱包确认");
      var day = bjDay();
      return h.sign(botText(names, t, a, day)).then(function (sig) {
        return fetch("/api/reg-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: a, names: names, day: day, sig: sig }) }).then(function (r) { return r.json(); });
      });
    }).then(function (j) {
      if (!j || j.error) throw new Error((j && j.error) || "提交失败");
      picked = {}; drawCand();
      say("✅ 已交给机器人：" + names.length + " 个名字，共 " + t + " DAI。几分钟内替你注册完，名字直接到你钱包；被抢先的不扣钱。结果发站内信 📬");
      botStatus();
    }).catch(function (e) { say(String((e && e.message) || e), true); }).then(function () { busy = false; sum(); });
  }
  // ---------- 注册 ----------
  function run() {
    var h = H(), names = list(); if (!names.length || busy) return;
    busy = true; sum();
    var done = [], fail = [], t = total(), base = null; /* base = 付款前账本上我还有几张极速票（读不到就不做「秒到账」，照常等半分钟） */
    h.connect().then(function () {
      try { fetch("/api/fast?a=" + h.account(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.v2 && j.me && typeof j.me.left === "number") base = j.me.left; }, function () {}); } catch (e0) { /* 读不到不影响注册 */ }
      return h.prepay(t, "DAI", say);
    }).then(function () {
      // 先试「一次确认发一串」（EIP-5792 wallet_sendCalls）
      var calls = names.map(function (n) { return { to: h.NAMES(), data: h.regData(n, 1, "DAI", h.account()) }; });
      return h.sendCalls(calls, say).then(function (ok) { if (ok) { done = names.slice(); return; } return seq(); }, function () { return seq(); });
      function seq() { // 逐个确认
        var i = 0;
        function next() {
          if (i >= names.length) return;
          var n = names[i++];
          say("第 " + i + " / " + names.length + " 个：" + n + ".ailgns，请在钱包确认");
          return h.register(n, 1, "DAI", function () {}, h.account()).then(function () { done.push(n); delete picked[n]; avail[n] = 0; drawCand(); }, function (e) {
            var m = String((e && e.message) || e);
            if (/reject|denied|cancel|取消|拒绝签名|User/i.test(m)) { fail.push(n + "（你取消了）"); throw new Error("stop"); }
            fail.push(n + "（" + m.slice(0, 40) + "）");
          }).then(next);
        }
        return next();
      }
    }).then(function () { finish(); }, function (e) { if (String(e && e.message) !== "stop") say(String((e && e.message) || e), true); finish(); });
    function finish() {
      busy = false; sum();
      if (done.length) {
        try { fetch("/api/batch-mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: h.account(), names: done }) }); } catch (e) {} // 🏷️ 标记为批量注册（2026-11-11 起先按普通注册分：30% / 70% 每日奖池；极速预言家上线再改回 10% / 90%）
        // 🎟 票秒到账：自己点买成了 2 个及以上 → 记一笔「刚买的」，极速页马上算进可押的票（账本约半分钟后追上，自动消掉）
        var tk = done.length >= 2 ? done.reduce(function (x, n) { return x + price(n); }, 0) : 0, quick = false;
        if (tk && base !== null) {
          try {
            var me0 = String(h.account()).toLowerCase(), old = JSON.parse(localStorage.getItem("fx:pend") || "null");
            var from = old && old.a === me0 && Date.now() - old.t < 180000 ? Math.max(old.target, base) : base; /* 上一笔还没上账：接着往上加 */
            localStorage.setItem("fx:pend", JSON.stringify({ a: me0, target: from + tk, n: tk, t: Date.now() })); quick = true;
          } catch (e1) { /* 存不了就照常等账本 */ }
        }
        say("✅ " + (simple ? "买好了：" : "注册成功 " + done.length + " 个：" + done.join("、") + "。") + (tk ? (simple ? "" : "送 ") + tk + " 张极速票" + (quick ? "已到账，现在就能去押。" : "大约半分钟到账。") : simple ? "只注册成了 1 个，还没有票；10 分钟内再注册 1 个，两个的票一起到。" : "") + (fail.length ? " 没成功 " + fail.length + " 个：" + fail.join("、") : ""));
        if (A.just) done.forEach(function (n) { A.just.set("names", n + ".ailgns"); });
        if (A.inbox && A.inbox.authed && A.inbox.authed()) { /* 收件箱会收到链上记录 */ }
        var b = document.getElementById("nb-go"); if (b) { b.textContent = simple && tk ? "去押注 →" : "去看我的域名 →"; b.disabled = false; b.onclick = function () { box.remove(); box = null; location.hash = simple && tk ? "#/fast" : "#/names/" + h.account(); }; }
      } else if (!fail.length) say("一个都没注册", true);
      else say("没成功：" + fail.join("、"), true);
    }
  }
  A.namesBatch = { open: open };
})();
