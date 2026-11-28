// 📦 批量注册域名（站长 2026-11-08 定）：一次选一批名字，一次授权 DAI，然后注册。
// 四种选名字：🎲 随机（默认：选要几个 → 一键随机生成能注册的，给买极速票的人用）、🔢 挑号码（几位数 / 花样 / 开头结尾，按条件筛）、🤖 AI 起名（描述 → 候选）、✍️ 自己填（一行一个）。
// 付款：只用 DAI（批量只做最简单的一种币）。先查余额、一次授权总额，再逐个注册；钱包支持「一次确认发一串」（wallet_sendCalls）就只按一次，不支持就逐个确认，有进度。
// 便宜档：中文 ≥3 字 / 英文数字 ≥5 位 = 5 DAI/年；3 位英文 640、4 位 160、中文 2 字 50，列表里标清楚。
(function () {
  var A = window.AIL;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var picked = {}, avail = {}, mode = "num", busy = false, simple = false, one = false; /* one = 🔮 只注册 1 个（站长 2026-11-24：「注册域名还要有 1 个通道，奖金进入每日预言家奖池，客户可以选择注册一个」）。规则没变：10 分钟内只注册 1 个本来就不算极速票、70% 记进每日奖池（lib/fast.js 的凑对规则 + lib/oracle.js allotOf），这里只是给它一个看得见的入口 */ /* simple = 极简买票窗口（从极速预言家「去买票」进来） */
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
  function pickFree(n, done, onProg) {
    var got = [], seen = {}, h = H(), round = 0, maxRound = 4 + Math.ceil(n / 30); // 站长 2026-11-17：买票不设上限，要挑的名字多了就多挑几轮（一轮最多查 90 个）
    (function more() {
      var ns = genNums({ count: Math.min(90, Math.ceil((n - got.length) * 1.5) + 3), kind: "rand", len: 0, no4: true });
      check(ns, function (err) {
        if (err) return done(err, got);
        ns.forEach(function (x) { if (got.length < n && avail[x] === 1 && h.valid(x) && !seen[x]) { seen[x] = 1; got.push(x); } });
        if (onProg) onProg(got.length);
        if (got.length < n && ++round < maxRound) return more();
        done(null, got);
      });
    })();
  }
  /* 站长 2026-11-25：「点注册以后不要跳转到别的页面，极速的就在极速，每日预言家就在每日那里」。stay = 这个窗口是在预言家页 / 极速页原地弹出来的：
     注册完点按钮只关窗口、把当前页面刷新一下（票数、资格跟着变），不跳到域名页 */
  var stay = false;
  function backHome() { try { window.dispatchEvent(new Event("hashchange")); } catch (e) { /* 刷不了就等页面自己更新 */ } }
  function open(opt) {
    if (box) box.remove();
    simple = !!(opt && opt.tickets); one = !simple && !!(opt && opt.one); stay = !!(opt && opt.stay);
    picked = {}; mode = simple ? "tk" : "quick";
    if (simple) {
      cands = [];
      box = document.createElement("div"); box.className = "modal nb-modal";
      box.innerHTML = '<div class="modal-box nb-box"><div class="card-head"><h2>🎟 买极速预言家的票</h2><button type="button" class="ghost" id="nb-x" style="padding:4px 12px">关闭</button></div>' +
        '<div id="nb-pane"></div>' +
        '<div class="nb-cand" id="nb-cand"></div>' +
        '<div class="nb-foot"><div class="nb-sum" id="nb-sum"></div><button type="button" class="nm-go" id="nb-go" disabled>付款</button><button type="button" class="nm-go nb-bot" id="nb-bot" disabled>🤖 交给机器人代点</button></div><p class="muted nb-botst" id="nb-botst"></p>' +
        '<p class="muted nb-st" id="nb-st"></p>' +
        '<p class="muted nb-note">自己点付款：买完票马上能用。交给机器人代点：几个名字一般半分钟左右注册完（下面有进度条），注册完票就能用。只用 DAI 付。</p></div>';
      document.body.appendChild(box);
      document.getElementById("nb-x").onclick = function () { if (busy && !(A.sure || confirm)("正在注册，关了的话已注册的照样有效，没注册的不会扣钱。确定关闭？")) return; box.remove(); box = null; };
      pane(); drawCand();
      return;
    }
    box = document.createElement("div"); box.className = "modal nb-modal";
    box.innerHTML = '<div class="modal-box nb-box"><div class="card-head"><h2>' + (one ? "🔮 每日预言家通道 · 注册域名" : "📦 批量注册域名") + '</h2><button type="button" class="ghost" id="nb-x" style="padding:4px 12px">关闭</button></div>' +
      (one ? '<div class="seg nb-seg nb-seg3"><button type="button" data-m="quick" class="on">🎲 随机</button><button type="button" data-m="own">✍️ 自己填</button><button type="button" data-m="ai">🤖 AI 起名</button></div>' : '<div class="seg nb-seg"><button type="button" data-m="quick" class="on">🎲 随机</button><button type="button" data-m="num">🔢 挑号码</button><button type="button" data-m="ai">🤖 AI 起名</button><button type="button" data-m="own">✍️ 自己填</button></div>') +
      '<div id="nb-pane"></div>' +
      '<div class="nb-cand" id="nb-cand"></div>' +
      '<div class="nb-foot"><div class="nb-sum" id="nb-sum">还没选</div><button type="button" class="nm-go" id="nb-go" disabled>注册选中的</button>' + (one ? "" : '<button type="button" class="nm-go nb-bot" id="nb-bot" disabled>🤖 交给机器人代点</button>') + '</div>' + (one ? "" : '<p class="muted nb-botst" id="nb-botst"></p>') +
      '<p class="muted nb-st" id="nb-st"></p>' +
      (one ? '<p class="muted nb-note">只用 DAI 付，钱包确认 2 次（授权 1 次 + 注册 1 次）。想拿极速票，请到「极速预言家」页买票。</p></div>' : '<p class="muted nb-note">便宜档 <b>5 DAI / 年</b>：中文 3 字及以上、英文数字 5 位及以上。3 位英文 640、4 位 160、中文 2 字 50。批量只用 DAI 付，先授权一次总额，再逐个注册；钱包支持「一次确认」的只按一次，否则一个名字按一下，中途停了已注册的照样有效。<br>🤖 <b>交给机器人代点</b>：你只确认 2 次（授权这次的总额 + 签名委托），团队的机器人替你逐个注册（10 个一般 1 分钟内，有进度条），名字直接归你；被人抢先的名字不扣钱。结果发到站内信。</p></div>');
    document.body.appendChild(box);
    document.getElementById("nb-x").onclick = function () { if (busy && !(A.sure || confirm)("正在注册，关了的话已注册的照样有效，没注册的不会扣钱。确定关闭？")) return; box.remove(); box = null; };
    box.querySelectorAll(".nb-seg button").forEach(function (b) { b.onclick = function () { if (busy) return; mode = b.getAttribute("data-m"); box.querySelectorAll(".nb-seg button").forEach(function (x) { x.classList.toggle("on", x === b); }); if (one) { cands = []; picked = {}; say(""); drawCand(); } /* 只注册 1 个：换一种挑法就清掉上一个 */ pane(); }; });
    pane(); drawCand();
  }
  function say(t, bad) { var el = document.getElementById("nb-st"); if (el) { el.textContent = t || ""; el.className = "muted nb-st" + (bad ? " nm-bad" : ""); } }
  function pane() {
    var p = document.getElementById("nb-pane"); if (!p) return;
    if (mode === "tk") {
      // 🎟 极简买票：只有一件事——选买多少票。1 张票 = 1 DAI；买票 = 注册域名（5 DAI 一个 = 5 张票），域名系统随机挑、归客户
      var TK = [10, 20, 50, 100], cur = 10, TK_MAX = 10000;
      p.innerHTML = '<div class="nb-f nb-q"><p class="nb-qt">花多少 DAI 买票？<b>1 DAI = 1 张票</b>。买票就是注册域名（5 DAI 一个 = 5 张票），域名归你。</p>' +
        '<div class="nb-qc">' + TK.map(function (k) { return '<button type="button" data-n="' + k + '"' + (k === cur ? ' class="on"' : "") + ">" + k + " DAI<small>" + k + " 张票</small></button>"; }).join("") + "</div>" +
        '<div class="nb-tkc"><span>或者自己填</span><input id="nb-tkn" type="number" min="10" step="5" inputmode="numeric" placeholder="比如 35"><span>DAI</span><button type="button" class="nm-go" id="nb-tkgo">确定</button></div>' +
        '<p class="muted nb-tkh" id="nb-tkh">一个域名 5 DAI，所以按 5 DAI 一档；最少 10 DAI，想买多少买多少。超过 250 DAI（50 个域名）请用下面的「🤖 交给机器人代点」。</p></div>';
      var roll = function () {
        if (busy) return;
        p.querySelectorAll(".nb-qc button").forEach(function (b) { b.classList.toggle("on", Number(b.getAttribute("data-n")) === cur); b.disabled = true; });
        cands = []; picked = {}; drawCand(); say("正在随机挑能注册的域名…");
        var want = cur / 5;
        pickFree(want, function (err, got) {
          if (!document.getElementById("nb-pane")) return;
          p.querySelectorAll(".nb-qc button").forEach(function (b) { b.disabled = false; });
          cands = got.slice(); picked = {}; got.forEach(function (x) { picked[x] = 1; });
          say(err ? err : got.length < cur / 5 ? "这次只挑到 " + got.length + " 个，点「换一批」再试" : "", !!err); drawCand();
        }, want > 60 ? function (k) { if (document.getElementById("nb-pane")) say("正在随机挑能注册的域名…已挑好 " + k + " / " + want + " 个"); } : null);
      };
      var tkn = document.getElementById("nb-tkn"), tkh = document.getElementById("nb-tkh");
      p.querySelectorAll(".nb-qc button").forEach(function (b) { b.onclick = function () { cur = Number(b.getAttribute("data-n")); tkn.value = ""; roll(); }; });
      var custom = function () {
        var v = Math.floor(Number(tkn.value));
        if (!(v > 0)) { tkh.textContent = "填一个数字，比如 35。"; return; }
        var k = Math.min(TK_MAX, Math.max(10, Math.ceil(v / 5) * 5)); // 一个域名 5 张：往上凑到 5 的倍数；最少 2 个域名。站长 2026-11-17：不设购买上限（单张委托技术上最多 2000 个域名 = 1 万 DAI，再多就再买一次）
        tkh.textContent = k === v ? "好，花 " + k + " DAI 买 " + k + " 张票。" + (k > 250 ? "名字比较多，挑名字要等一会儿；付款请用「🤖 交给机器人代点」。" : "") : v > TK_MAX ? "一次最多 " + TK_MAX + " DAI（一张委托装不下更多名字），先按 " + TK_MAX + " DAI 挑；还想买，买完再来一次。" : v < 10 ? "最少 10 DAI（2 个域名），按 10 DAI 挑。" : "一个域名 5 DAI，" + v + " DAI 凑成 " + k + " DAI。";
        tkn.value = k; cur = k; roll();
      };
      document.getElementById("nb-tkgo").onclick = custom;
      tkn.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); custom(); } };
      box.__roll = roll;
      roll(); /* 一打开就先按 10 张票挑好 */
    } else if (mode === "quick" && one) {
      // 🔮 只注册 1 个：一打开就随机挑好一个能注册的，不喜欢点一下换一个，下面直接付款
      p.innerHTML = '<div class="nb-f nb-q"><p class="nb-qt">每个域名 <b>5 DAI</b>，注册了就归你。这笔注册费的 <b>95% 进每日预言家奖池</b>，不送极速票。</p>' +
        '<button type="button" class="nm-go nb-gen" id="nb-gen">🎲 换一个名字</button>' +
        ONE_H + "</div>";
      var g1 = document.getElementById("nb-gen");
      g1.onclick = function () {
        if (busy) return;
        g1.disabled = true; say("正在挑能注册的域名…");
        pickFree(1, function (err, got) {
          if (!document.getElementById("nb-pane")) return;
          g1.disabled = false;
          if (err || !got.length) return say(err || "没挑到，再点一次", true);
          cands = got.slice(); picked = {}; picked[got[0]] = 1;
          say(""); drawCand();
        });
      };
      g1.onclick(); /* 一打开就先挑好一个 */
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
    } else if (mode === "own" && one) {
      // ✍️ 只注册 1 个 · 自己填（站长 2026-11-24：「让客户自己手动选择」）：输一个名字，查能不能注册，能就直接在下面付款
      p.innerHTML = '<div class="nb-f nb-q"><p class="nb-qt">输入你想要的名字。中文 3 个字及以上、英文数字 5 位及以上是 <b>5 DAI</b>，更短的更贵，下面会显示价格。注册费的 <b>95% 进每日预言家奖池</b>。</p>' +
        '<div class="nb-own1"><input id="nb-own1" type="text" maxlength="32" placeholder="中文、英文都行，不用写 .ailgns" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button" class="nm-go nb-gen" id="nb-gen">查能不能注册</button></div>' + ONE_H + "</div>";
      var o1 = document.getElementById("nb-own1"), og = document.getElementById("nb-gen");
      og.onclick = function () {
        if (busy) return;
        var n = o1.value.trim().toLowerCase().replace(/\.(ailgns|lgns)$/, "");
        if (!n) return say("先输入一个名字", true);
        cands = []; picked = {}; drawCand();
        if (!H().valid(n)) return say("这个名字不合规：可以用中文、小写字母、数字、连字符；英文最少 3 位，中文最少 2 个字", true);
        og.disabled = true; say("查可用中…");
        check([n], function (err) {
          if (!document.getElementById("nb-own1")) return;
          og.disabled = false;
          if (err) return say(err, true);
          if (avail[n] !== 1) return say(avail[n] === 0 ? "这个名字已经有人注册了，换一个试试" : "这个名字不能注册，换一个试试", true);
          cands = [n]; picked = {}; picked[n] = 1; say(""); drawCand();
        });
      };
      o1.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); og.onclick(); } };
    } else if (mode === "ai" && one) {
      // 🤖 只注册 1 个 · AI 起名（站长 2026-11-24：「也加上 ai 选择」）：AI 出一批，只留能注册的，客户点一个
      p.innerHTML = '<div class="nb-f nb-q"><p class="nb-qt">写一句你想要什么样的名字，AI 出一批，你挑一个。不写就随机出。注册费的 <b>95% 进每日预言家奖池</b>。</p>' +
        '<textarea id="nb-desc" rows="2" maxlength="80" placeholder="比如「想要带 888 的发财名」"></textarea><button type="button" class="nm-go nb-gen" id="nb-gen">🤖 让 AI 出一批名字</button>' + ONE_H + "</div>";
      var ag = document.getElementById("nb-gen");
      ag.onclick = function () {
        if (busy) return;
        var d = document.getElementById("nb-desc").value.trim() || "随机生成：吉利、好记、口语化的中文名";
        ag.disabled = true; say("AI 想名字中…");
        fetch("/api/name-ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desc: d, n: 12 }) }).then(function (r) { return r.json(); }).then(function (j) {
          if (!document.getElementById("nb-desc")) return;
          if (j.error) { ag.disabled = false; return say(j.error, true); }
          var ns = (j.names || []).map(function (s) { return String(s).trim().toLowerCase(); }).filter(Boolean);
          if (!ns.length) { ag.disabled = false; return say("AI 没想出合规的名字，再点一次或换个说法", true); }
          say("查可用中…");
          check(ns, function (err) {
            if (!document.getElementById("nb-desc")) return;
            ag.disabled = false;
            if (err) return say(err, true);
            var ok = ns.filter(function (n, i) { return avail[n] === 1 && H().valid(n) && ns.indexOf(n) === i; });
            if (!ok.length) return say("这一批都被人注册了，再点一次换一批", true);
            cands = ok; picked = {}; picked[ok[0]] = 1; say(""); drawCand();
          });
        }).catch(function () { ag.disabled = false; say("AI 现在没空，稍后再试", true); });
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
      p.innerHTML = '<div class="nb-f"><textarea id="nb-desc" rows="3" maxlength="80" placeholder="不填就随机出一批，多点几次，只勾喜欢的注册。想要特别的就写一句，比如「玩 AiLGNS 的，想要带 888 的发财名」"></textarea>' +
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
  var ONE_H = '<p class="muted nb-oneh">从这个通道注册的域名不算极速票，可以一个接一个注册；想要极速票请到「极速预言家」页买票。</p>'; /* 只注册 1 个：三种挑法下面都带这句 */
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
      el.innerHTML = cands.length ? '<p class="nb-tkl">随机挑好 <b>' + cands.length + "</b> 个能注册的域名：" + cands.slice(0, 30).map(function (n) { return "<i>" + esc(n) + "</i>"; }).join("") + (cands.length > 30 ? " <small>…等 " + cands.length + " 个</small>" : "") + ' <button type="button" class="link" id="nb-re">🎲 换一批</button></p>' : "";
      var re = document.getElementById("nb-re"); if (re) re.onclick = function () { if (box && box.__roll) box.__roll(); };
      botStatus(); sum(); return;
    }
    if (one) { // 只注册 1 个：只列挑好的那一个，不给勾选
      el.innerHTML = !cands.length ? "" : cands.length === 1 ? '<p class="nb-tkl">挑好了：<i>' + esc(cands[0]) + ".ailgns</i></p>" :
        '<p class="muted nb-onep">都能注册，点一个你喜欢的：</p><ul class="nb-list">' + cands.map(function (n) { return '<li><label><input type="radio" name="nb-one1" data-n="' + esc(n) + '"' + (picked[n] ? " checked" : "") + '> <b>' + esc(n) + '</b><small>.ailgns</small></label><em>' + price(n) + ' DAI/年</em></li>'; }).join("") + "</ul>";
      el.querySelectorAll("input[data-n]").forEach(function (c) { c.onchange = function () { if (busy) return; picked = {}; picked[c.getAttribute("data-n")] = 1; sum(); }; });
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
    el.innerHTML = n ? "选了 <b>" + n + "</b> 个 · 1 年 · 共 <b>" + t + " DAI</b>" + (jpNo ? " · <em>领奖用的名字，不算极速票</em>" : n >= 2 ? " · 送 <b>" + t + "</b> 张极速票" : pairing() ? " · 和刚注册的那个凑成一对，两个都算票" : " · <em>只选 1 个没有极速票，至少 2 个</em>") : "还没选";
    if (one) el.innerHTML = n ? "共 <b>" + t + " DAI</b> · 1 年" + (jpNo ? " · <em>领奖用的名字，注册费进每日大奖奖池</em>" : " · 注册费 95% 进每日预言家奖池") : "";
    if (simple) el.innerHTML = n ? (n === 1 && pairing() ? "共 <b>" + t + " DAI</b>，和刚才那个凑成一对，两个都算票" : "共 <b>" + t + " DAI</b> = <b>" + t + "</b> 张票") : "";
    var tooMany = n > 50; // 自己点要每个名字在钱包里确认一次，超过 50 个只能交给机器人
    go.disabled = !n || busy || tooMany; go.innerHTML = tooMany ? "自己点付款<small>超过 50 个域名，钱包要确认 " + (n + 1) + " 次，太多了；请用下面的机器人代点</small>" : n ? (simple ? "付 " + t + " DAI 买 " + t + " 张票" : one ? "付 " + t + " DAI 注册这个域名" : "自己点：注册这 " + n + " 个（" + t + " DAI）") + "<small>钱包要确认 " + (n + 1) + " 次（授权 1 次 + 每个名字 1 次）</small>" : simple ? "付款" : "注册选中的";
    go.onclick = run;
    var bt = document.getElementById("nb-bot"); if (bt) { bt.disabled = !n || busy; bt.innerHTML = n ? "🤖 交给机器人代点<small>钱包只确认 2 次（授权 1 次 + 签名 1 次），" + (n > 20 ? "机器人一分钟大约注册 10 个，" + n + " 个大约要 " + Math.ceil(n / 10) + " 分钟；注册好一批，票就先到一批" : "一般 1 分钟内替你注册完，有进度条") + "</small>" : "🤖 交给机器人代点"; bt.onclick = robot; }
  }
  /* 工单 #340（2026-11-21）：批量选了 2 个、被抢走 1 个，剩下那 1 个照样注册了，但落单的不算票，页面又没醒目地说——客户白等。
     现在：只成了 1 个时，主按钮直接换成「再补 1 个，两个都算票」，点一下随机挑一个能注册的；10 分钟内补上，两个凑成一对都算票（规则本来如此，见 lib/fast.js）。
     pairAt = 刚才那 1 个是什么时候注册成的；只按 9 分钟算，留一点余量 */
  var pairAt = 0;
  var jpNo = false; /* 这个钱包正在领神算子大奖（/api/fast 的 me.jp）：现在注册的名字是领奖用的，不算极速票 */
  var JP_MSG = "这些是领奖用的名字，注册费进每日大奖奖池，不算极速票。回销毁页把它们烧掉就能领奖。";
  function pairing() { return pairAt > 0 && Date.now() - pairAt < 540000; }
  function oneLeft() {
    pairAt = Date.now();
    var b = document.getElementById("nb-go"); if (!b) return;
    b.disabled = false; b.innerHTML = "再补 1 个，两个都算票<small>要在 10 分钟内注册上；点这里随机挑一个能注册的</small>";
    b.onclick = function () {
      if (busy) return;
      b.disabled = true; say("正在挑一个能注册的域名…");
      pickFree(1, function (err, got) {
        if (err || !got.length) { b.disabled = false; return say(err || "没挑到，再点一次", true); }
        cands = got.slice(); picked = {}; picked[got[0]] = 1; drawCand();
        say("挑好了：" + got[0] + ".ailgns。点下面的按钮付款；10 分钟内注册上，两个的票一起到。");
      });
    };
  }
  // ---------- 🤖 机器人代点：客户授权 DAI 给机器人钱包 + 签名委托，机器人用客户的钱替客户注册（名字直接归客户） ----------
  var REG = "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1"; // 代注册机器人钱包（只放 Gas）
  function botText(names, total, a, day) { return "AiLGNS 代注册委托\n请机器人帮我注册（各 1 年，DAI 付款）：" + names.join("、") + "\n共 " + total + " DAI\n我的地址：" + a + "\n日期：" + day; }
  function bjDay() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
  var jpAsk = "";
  function jpProbe() { /* 连着的钱包是不是正在领神算子大奖：每个钱包只问一次 */
    try {
      var a = H().account(); if (!a || jpAsk === a) return; jpAsk = a;
      fetch("/api/fast?a=" + a).then(function (r) { return r.json(); }).then(function (j) { var was = jpNo; jpNo = !!(j && j.me && j.me.jp); if (jpNo !== was) sum(); }, function () {});
    } catch (e) { /* 问不到就照常 */ }
  }
  function botStatus() {
    jpProbe();
    var h = H(), el = document.getElementById("nb-botst"); if (!el || !h.account()) return;
    fetch("/api/reg-order?a=" + h.account()).then(function (r) { return r.json(); }).then(function (j) {
      var l = (j && j.list) || [], p = l.filter(function (o) { return o.state === "pending"; });
      if (watchId && watchBox === box) { el.innerHTML = ""; return; } /* 进度条在画了，不用再写一行「还剩几个」 */
      if (p.length && box && Date.now() - (p[0].t || 0) < 600000) { el.innerHTML = ""; watchOrder(p[0].id, h.account(), null, p[0].t || Date.now(), p[0].names.length); return; } /* 关了窗口又打开：接着画进度条 */
      el.innerHTML = p.length ? "🤖 机器人正在处理你的委托：还剩 <b>" + p.reduce(function (s, o) { return s + (o.todo ? o.todo.length : o.names.length); }, 0) + "</b> 个名字没注册，全部完成后发<a href=\"#/inbox\">站内信</a>" : "";
    }).catch(function () {});
  }
  /* 站长 2026-11-28「这里加个进度条，或者完成提示」：等机器人的这段时间画一条进度条。机器人每做完一批（5 个）才报一次进度，
     所以条子先按「平时要多久」慢慢往前走（最多走到 95%），报上来的真实个数比它多就跳过去；做完了整条变绿，写清楚成了几个 */
  var watchId = "", watchBox = null;
  function botEta(n) { return 6 + Math.ceil(n / 5) * 4 + n * 4; } /* 秒：等接单 + 每 5 个收一次款 + 每个名字注册一笔（2026-11-28 实测 4 个 17 秒） */
  function progDraw(n, got, t0, fin) {
    var st = document.getElementById("nb-st"), el = document.getElementById("nb-prog");
    if (!el && st) { el = document.createElement("div"); el.id = "nb-prog"; el.innerHTML = '<div class="nb-bar"><i></i></div><p class="nb-pt"></p>'; st.parentNode.insertBefore(el, st); }
    if (!el) return;
    var sec = Math.max(0, Math.round((Date.now() - t0) / 1000)), eta = botEta(n), p = fin ? 1 : Math.max(n ? got / n : 0, Math.min(sec / eta, 0.95));
    el.className = "nb-prog" + (fin ? (fin.ok ? " ok" : " bad") : "");
    el.querySelector("i").style.width = (p * 100).toFixed(1) + "%";
    el.querySelector(".nb-pt").textContent = fin ? fin.t : "🤖 机器人正在注册：已好 " + got + " / " + n + " 个 · 已等 " + sec + " 秒 · " + (sec < eta ? "预计还要 " + (eta - sec) + " 秒左右" : "比平时慢一点，马上就好");
  }
  // 下单后盯着这张委托：每 3 秒看一次，机器人注册完就提示；买成 2 个及以上 → 记一笔「刚买的票」，极速页马上能押（和自己点付款一样）
  function watchOrder(id, a, base, t0, n) {
    var myBox = box, wasSimple = simple, got = 0, n0 = n || 0, fin = false;
    watchId = id; watchBox = box;
    var live = function () { return box && box === myBox && watchId === id; };
    var anim = setInterval(function () { if (!live() || fin) { clearInterval(anim); return; } if (n0) progDraw(n0, got, t0); }, 1000); /* 每秒走一下，不用等网络 */
    if (n0) progDraw(n0, 0, t0);
    (function tick() {
      if (!live()) return;
      if (Date.now() - t0 > 600000) { /* 等了 10 分钟：不盯了，结果看站内信 */
        fin = true; watchId = ""; progDraw(n0, got, t0, { ok: false, t: "⏳ 还在注册，比平时慢很多。可以关掉这个窗口，注册好的票会自动到账，结果发站内信 📬" }); return;
      }
      fetch("/api/reg-order?a=" + a, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        if (!live()) return;
        var o = ((j && j.list) || []).filter(function (x) { return x.id === id; })[0];
        if (!o || o.state !== "done") {
          if (o) { n0 = o.names.length; got = (o.done || []).length; progDraw(n0, got, t0); if (n0 > 20) say("名字多，可以关掉这个窗口，注册好的票会自动到账，结果发站内信 📬"); }
          return setTimeout(tick, 3000);
        }
        var done = o.done || [], fail = o.fail || [];
        fin = true; watchId = ""; n0 = o.names.length || n0;
        progDraw(n0, done.length, t0, done.length ? { ok: true, t: fail.length ? "✅ 注册好 " + done.length + " 个，没成功 " + fail.length + " 个（原因见下面）" : "✅ 全部注册好了：" + done.length + " / " + n0 + " 个" } : { ok: false, t: "机器人没注册成，原因见下面" });
        var tk = !jpNo && done.length >= 2 ? done.reduce(function (x, n) { return x + price(n); }, 0) : 0, quick = false;
        if (tk && base !== null) {
          try {
            var me0 = String(a).toLowerCase(), old = JSON.parse(localStorage.getItem("fx:pend") || "null");
            var from = old && old.a === me0 && Date.now() - old.t < 180000 ? Math.max(old.target, base) : base;
            localStorage.setItem("fx:pend", JSON.stringify({ a: me0, target: from + tk, n: tk, t: Date.now() })); quick = true;
          } catch (e1) { /* 存不了就照常等账本 */ }
        }
        say((done.length ? "✅ 机器人注册好了 " + done.length + " 个" + (wasSimple ? "" : "：" + done.join("、")) + "。" : "机器人没注册成。") + (jpNo && done.length ? JP_MSG : tk ? tk + " 张极速票" + (quick ? "已到账，现在就能去押。" : "大约半分钟到账。") : done.length === 1 ? (pairing() ? "补上了，和刚才那个凑成一对，两个的票大约半分钟到账。" : "⚠️ 只成了 1 个，落单的不算票。10 分钟内再注册 1 个，两个的票一起到——点下面的按钮补一个。") : ""), !done.length);
        /* 没成功的另起一行写（2026-11-28）：和上面那句分开，英文 / 韩文版能整句翻译（以前连在一起，英文里「4 个。20 张」挤成了「4.20」） */
        if (fail.length) { var stEl = document.getElementById("nb-st"), fs = document.createElement("span"); if (stEl) { fs.className = "nb-failt"; fs.textContent = "没成功 " + fail.length + " 个（没扣钱）：" + fail.join("、"); stEl.appendChild(document.createElement("br")); stEl.appendChild(fs); } }
        var el2 = document.getElementById("nb-botst"); if (el2) el2.innerHTML = "";
        var b = document.getElementById("nb-go");
        if (b && done.length) { b.textContent = wasSimple && tk ? "去押注 →" : stay ? "完成 →" : "去看我的域名 →"; b.disabled = false; b.onclick = function () { box.remove(); box = null; if (stay) backHome(); else location.hash = wasSimple && tk ? "#/fast" : "#/names/" + a; }; }
        if (done.length === 1 && !pairing()) oneLeft(); else if (done.length) pairAt = 0;
      }, function () { setTimeout(tick, 5000); });
    })();
  }
  function robot() {
    var h = H(), names = list(); if (!names.length || busy) return;
    busy = true; sum();
    var t = total(), wei = BigInt(t) * 10n ** 18n, a, base = null; /* base = 下单前账本上我还有几张极速票（读不到就不做「注册完马上能押」） */
    h.connect().then(function () {
      a = h.account();
      try { fetch("/api/fast?a=" + a, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.me) jpNo = !!j.me.jp; if (j && j.v2 && j.me && typeof j.me.left === "number") base = j.me.left; }, function () {}); } catch (e0) { /* 读不到不影响下单 */ }
      /* 站长 2026-11-28 查出：连着下两张代点委托，第二张时上一张的授权还没被机器人用掉，页面以为「已经授权够了」就没再授权，
         机器人收完第一张的钱，第二张就「授权不够」全失败了。现在先算上自己还没注册完的委托要扣的钱，授权按「这次 + 还欠的」一起授权 */
      var pend = fetch("/api/reg-order?a=" + a, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        return ((j && j.list) || []).filter(function (o) { return o.state === "pending"; }).reduce(function (s, o) {
          var left = Array.isArray(o.todo) ? o.todo : (o.names || []).filter(function (n) { return (o.done || []).indexOf(n) < 0; });
          return s + left.reduce(function (x, n) { return x + price(n); }, 0);
        }, 0);
      }, function () { return 0; });
      return Promise.all([h.balance(h.DAI), h.allowance(h.DAI, REG), pend]);
    }).then(function (r) {
      var owe = r[2] || 0, need = wei + BigInt(owe) * 10n ** 18n, all = t + owe;
      if (r[0] < need) throw new Error("DAI 不够：要 " + all + " DAI" + (owe ? "（这次 " + t + " + 上一张还没注册完的 " + owe + "）" : "") + "，钱包只有 " + (Number(r[0] / 10n ** 16n) / 100));
      if (r[1] >= need) return;
      return h.tx(h.DAI, "0x095ea7b3" + A.pad(REG) + need.toString(16).padStart(64, "0"), say, owe ? "🔒 第 1 步：授权机器人收 " + all + " DAI（这次 " + t + " + 上一张还没注册完的 " + owe + "，不扣钱）。请在钱包确认" : "🔒 第 1 步：授权机器人只能收这次的 " + t + " DAI（不扣钱）。请在钱包确认");
    }).then(function () {
      say("✍️ 第 2 步：签名委托（不扣钱、不花 Gas），请在钱包确认");
      var day = bjDay();
      return h.sign(botText(names, t, a, day)).then(function (sig) {
        return fetch("/api/reg-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: a, names: names, day: day, sig: sig }) }).then(function (r) { return r.json(); });
      });
    }).then(function (j) {
      if (!j || j.error) throw new Error((j && j.error) || "提交失败");
      picked = {}; drawCand();
      say("✅ 已交给机器人：" + names.length + " 个名字，共 " + t + " DAI。名字直接到你钱包；被抢先的不扣钱。结果也会发站内信 📬");
      botStatus();
      watchOrder(j.id, a, base, Date.now(), names.length);
    }).catch(function (e) { say(String((e && e.message) || e), true); }).then(function () { busy = false; sum(); });
  }
  // ---------- 注册 ----------
  function run() {
    var h = H(), names = list(); if (!names.length || busy) return;
    busy = true; sum();
    var done = [], fail = [], t = total(), base = null; /* base = 付款前账本上我还有几张极速票（读不到就不做「秒到账」，照常等半分钟） */
    h.connect().then(function () {
      try { fetch("/api/fast?a=" + h.account(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.me) jpNo = !!j.me.jp; if (j && j.v2 && j.me && typeof j.me.left === "number") base = j.me.left; }, function () {}); } catch (e0) { /* 读不到不影响注册 */ }
      return h.prepay(t, "DAI", say);
    }).then(function () {
      // 先试「一次确认发一串」（EIP-5792 wallet_sendCalls）
      var calls = names.map(function (n) { return { to: h.NAMES(), data: h.regData(n, 1, "DAI", h.account()) }; });
      if (h.srcDaily && h.srcDaily()) return seq(); // 每日预言家通道：每个域名单独一笔交易，交易里才带得上入口记号（钱包「一次确认发一串」会把记号包在里面，认不出来）
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
        if (!one) try { fetch("/api/batch-mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: h.account(), names: done }) }); } catch (e) {} // 🏷️ 标记为批量注册（2026-11-11 起先按普通注册分：30% / 70% 每日奖池；极速预言家上线再改回 10% / 90%）
        // 🎟 票秒到账：自己点买成了 2 个及以上 → 记一笔「刚买的」，极速页马上算进可押的票（账本约半分钟后追上，自动消掉）
        var tk = !jpNo && done.length >= 2 ? done.reduce(function (x, n) { return x + price(n); }, 0) : 0, quick = false, wasPair = !one && !jpNo && done.length === 1 && pairing(); /* wasPair：这 1 个是补给刚才落单那个的 */
        if (tk && base !== null) {
          try {
            var me0 = String(h.account()).toLowerCase(), old = JSON.parse(localStorage.getItem("fx:pend") || "null");
            var from = old && old.a === me0 && Date.now() - old.t < 180000 ? Math.max(old.target, base) : base; /* 上一笔还没上账：接着往上加 */
            localStorage.setItem("fx:pend", JSON.stringify({ a: me0, target: from + tk, n: tk, t: Date.now() })); quick = true;
          } catch (e1) { /* 存不了就照常等账本 */ }
        }
        say("✅ " + (simple ? "买好了：" : "注册成功 " + done.length + " 个：" + done.join("、") + "。") + (jpNo ? JP_MSG : tk ? (simple ? "" : "送 ") + tk + " 张极速票" + (quick ? "已到账，现在就能去押。" : "大约半分钟到账。") : wasPair ? "补上了，和刚才那个凑成一对，两个的票大约半分钟到账。" : one ? "这笔注册费的 95% 进每日预言家奖池。" : "⚠️ 只注册成了 1 个，落单的不算票。10 分钟内再注册 1 个，两个的票一起到——点下面的按钮补一个。") + (fail.length ? " 没成功 " + fail.length + " 个：" + fail.join("、") : ""));
        if (A.just) done.forEach(function (n) { A.just.set("names", n + ".ailgns"); });
        if (A.inbox && A.inbox.authed && A.inbox.authed()) { /* 收件箱会收到链上记录 */ }
        var b = document.getElementById("nb-go"); if (b) { b.textContent = simple && (tk || wasPair) ? "去押注 →" : stay ? "完成 →" : "去看我的域名 →"; b.disabled = false; b.onclick = function () { box.remove(); box = null; if (stay) backHome(); else location.hash = simple && (tk || wasPair) ? "#/fast" : "#/names/" + h.account(); }; }
        if (one) pairAt = 0; /* 每日预言家通道注册的带记号、不算票，不会和后面的注册凑对 */
        else if (false) pairAt = wasPair ? 0 : Date.now(); /* 只注册 1 个：不催他补第二个，只记下时间（10 分钟内再去批量注册 1 个会凑成一对，那边的提示才准） */
        else if (done.length === 1 && !wasPair) oneLeft(); else pairAt = 0;
      } else if (!fail.length) say("一个都没注册", true);
      else say("没成功：" + fail.join("、"), true);
    }
  }
  A.namesBatch = { open: open };
})();
