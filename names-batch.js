// 📦 批量注册域名（站长 2026-11-08 定）：一次选一批名字，一次授权 DAI，然后注册。
// 三种选名字：🤖 让 AI 出主意（描述 → 候选）、🔢 5 位数号码（00000–99999，按条件筛）、✍️ 自己填（一行一个）。
// 付款：只用 DAI（批量只做最简单的一种币）。先查余额、一次授权总额，再逐个注册；钱包支持「一次确认发一串」（wallet_sendCalls）就只按一次，不支持就逐个确认，有进度。
// 便宜档：中文 ≥3 字 / 英文数字 ≥5 位 = 5 DAI/年；3 位英文 640、4 位 160、中文 2 字 50，列表里标清楚。
(function () {
  var A = window.AIL;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var picked = {}, avail = {}, mode = "num", busy = false;
  function H() { return A.nm; } // names.js 暴露的内部函数（yearPrice、valid、register 等）
  function price(n) { return H().yearPrice(n); }
  function list() { return Object.keys(picked); }
  function total() { return list().reduce(function (t, n) { return t + price(n); }, 0); }

  // ---------- 5 位数生成 ----------
  function genNums(f) {
    var out = [], tries = 0, want = f.count || 20;
    var ok = function (s) {
      if (f.has8 && s.indexOf("8") < 0) return false;
      if (f.no4 && s.indexOf("4") >= 0) return false;
      if (f.tail && !s.endsWith(f.tail)) return false;
      if (f.head && !s.startsWith(f.head)) return false;
      if (f.kind === "aaa" && !/(\d)\1\1/.test(s)) return false; // 豹子（三连同）
      if (f.kind === "abc" && !/(?:012|123|234|345|456|567|678|789)/.test(s)) return false; // 顺子
      if (f.kind === "aabb" && !/(\d)\1(\d)\2/.test(s)) return false; // 对子
      return true;
    };
    if (f.kind === "seq") { // 顺序列出：从 head 开始连续
      var start = parseInt((f.head || "0").padEnd(5, "0").slice(0, 5), 10) || 0;
      for (var i = start; out.length < want && i < 100000; i++) { var s0 = String(i).padStart(5, "0"); if (ok(s0)) out.push(s0); }
      return out;
    }
    var seen = {};
    while (out.length < want && tries++ < 20000) { var s = String(Math.floor(Math.random() * 100000)).padStart(5, "0"); if (!seen[s] && ok(s)) { seen[s] = 1; out.push(s); } }
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
  function open() {
    if (box) box.remove();
    picked = {}; mode = "num";
    box = document.createElement("div"); box.className = "modal nb-modal";
    box.innerHTML = '<div class="modal-box nb-box"><div class="card-head"><h2>📦 批量注册域名</h2><button type="button" class="ghost" id="nb-x" style="padding:4px 12px">关闭</button></div>' +
      '<div class="seg nb-seg"><button type="button" data-m="num" class="on">🔢 5 位数号码</button><button type="button" data-m="ai">🤖 让 AI 出主意</button><button type="button" data-m="own">✍️ 自己填</button></div>' +
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
    if (mode === "num") {
      p.innerHTML = '<div class="nb-f"><label>要几个 <input id="nb-cnt" type="number" min="1" max="50" value="10" inputmode="numeric"></label>' +
        '<label>花样 <select id="nb-kind"><option value="rand">随机</option><option value="seq">按顺序连号</option><option value="aaa">带豹子（111）</option><option value="abc">带顺子（123）</option><option value="aabb">带对子（1122）</option></select></label>' +
        '<label>开头 <input id="nb-head" placeholder="如 88" maxlength="4" inputmode="numeric"></label><label>结尾 <input id="nb-tail" placeholder="如 8" maxlength="4" inputmode="numeric"></label>' +
        '<label class="nb-chk"><input id="nb-has8" type="checkbox" checked> 要带 8</label><label class="nb-chk"><input id="nb-no4" type="checkbox" checked> 不要 4</label>' +
        '<button type="button" class="nm-go nb-gen" id="nb-gen">生成并查可用</button></div>';
      document.getElementById("nb-gen").onclick = function () {
        var f = { count: Math.min(50, Math.max(1, Number(document.getElementById("nb-cnt").value) || 10)), kind: document.getElementById("nb-kind").value, head: document.getElementById("nb-head").value.replace(/\D/g, ""), tail: document.getElementById("nb-tail").value.replace(/\D/g, ""), has8: document.getElementById("nb-has8").checked, no4: document.getElementById("nb-no4").checked };
        addCands(genNums(f));
      };
    } else if (mode === "ai") {
      p.innerHTML = '<div class="nb-f"><textarea id="nb-desc" rows="2" maxlength="80" placeholder="不填就随机生成。也可以描述一下：比如「做茶叶生意的，想要招财的中文名」或「和 AI、宇宙有关的英文」"></textarea>' +
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
    el.innerHTML = n ? "选了 <b>" + n + "</b> 个 · 1 年 · 共 <b>" + t + " DAI</b>" : "还没选";
    go.disabled = !n || busy; go.innerHTML = n ? "自己点：注册这 " + n + " 个（" + t + " DAI）<small>钱包要确认 " + (n + 1) + " 次（授权 1 次 + 每个名字 1 次）</small>" : "注册选中的";
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
    var done = [], fail = [], t = total();
    h.connect().then(function () { return h.prepay(t, "DAI", say); }).then(function () {
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
        try { fetch("/api/batch-mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: h.account(), names: done }) }); } catch (e) {} // 🏷️ 标记为批量注册（费用 10% 平台 / 90% 极速预言家资金池）
        say("✅ 注册成功 " + done.length + " 个：" + done.join("、") + (fail.length ? "；没成功 " + fail.length + " 个：" + fail.join("、") : ""));
        if (A.just) done.forEach(function (n) { A.just.set("names", n + ".ailgns"); });
        if (A.inbox && A.inbox.authed && A.inbox.authed()) { /* 收件箱会收到链上记录 */ }
        var b = document.getElementById("nb-go"); if (b) { b.textContent = "去看我的域名 →"; b.disabled = false; b.onclick = function () { box.remove(); box = null; location.hash = "#/names/" + h.account(); }; }
      } else if (!fail.length) say("一个都没注册", true);
      else say("没成功：" + fail.join("、"), true);
    }
  }
  A.namesBatch = { open: open };
})();
