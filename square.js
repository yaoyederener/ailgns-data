// 🏛️ 链上广场 #/square（2026-11-07）：盖楼 · 时间胶囊 / 立字据 · 帖子带按钮（挂单帖一键去成交、预言帖一键去预测）
// 发帖 = 一笔 0 元交易到广场地址，JSON 放 data 里（前缀 ailgns-post:），只花约 0.001 DAI Gas；只有设了 .ailgns 主名字的钱包能发。读帖不用钱包。
(function () {
  var A = window.AIL, W = A.wallet;
  var SQUARE = "0x0000000000000000000000000000000000a11905"; // 广场地址（收 0 元交易，只是个「公告栏」，没有私钥、没有钱）
  var PREFIX = "ailgns-post:", MAX = 300;
  var NAMES = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", lgns: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3" }, SEL_NAMEOF = "0xf5c57382";
  var MK = { ailgns: "AiLGNS", lgns: "LGNS", glgns: "gLGNS", plgns: "LGNS（Polygon）", nft: "AWAKE NFT" };
  var CONTACT = /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|xyz|io|app|cc|top|vip|cn|me|link|site|online|shop|pro)\b|t\.me|微信|微信号|vx|wx|weixin|wechat|qq|扣扣|电报|telegram|tg|飞机|whatsapp|line\b|手机号|电话|加我|加一下|私聊|私信我|联系方式|联系我|\d{11}/i;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tm(t) { var x = new Date(t + 8 * 3600e3); return (x.getUTCMonth() + 1) + "/" + x.getUTCDate() + " " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0"); }
  function ago(t) { var s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? "刚刚" : s < 3600 ? Math.floor(s / 60) + " 分钟前" : s < 86400 ? Math.floor(s / 3600) + " 小时前" : Math.floor(s / 86400) + " 天前"; }
  function left(t) { var s = Math.max(0, (t - Date.now()) / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? d + " 天 " + h + " 小时" : h ? h + " 小时 " + m + " 分" : m + " 分钟"; }
  function enc(obj) { return "0x" + Array.prototype.map.call(new TextEncoder().encode(PREFIX + JSON.stringify(obj)), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function decStr(hex) { var w = hex.slice(2), off = parseInt(w.slice(0, 64), 16) * 2, len = parseInt(w.slice(off, off + 64), 16); return new TextDecoder().decode(new Uint8Array((w.slice(off + 64, off + 64 + len * 2).match(/../g) || []).map(function (x) { return parseInt(x, 16); }))); }
  function nameOf(a) {
    return Promise.all(Object.keys(NAMES).map(function (t) { return A.call(NAMES[t], SEL_NAMEOF + A.pad(a)).then(function (r) { var s = decStr(r); return s ? s + "." + t : ""; }, function () { return ""; }); })).then(function (r) { return r.filter(Boolean)[0] || ""; });
  }
  function nameHtml(p) { return '<a class="sq-name" href="#/scan/' + p.from + '">' + esc(p.name || A.short(p.from)) + "</a>"; }
  function body(p) {
    if (p.locked) return '<div class="sq-lock">🔒 时间胶囊 · ' + tm(p.at) + " 揭晓（还有 " + left(p.at) + "）</div>";
    var h = '<div class="sq-txt">' + esc(p.t).replace(/\n/g, "<br>") + "</div>", btn = "";
    if (p.o) btn += '<a class="sq-btn" href="#/otc' + (p.o.m === "ailgns" ? "" : "/" + p.o.m) + '">💱 去买这张单（' + esc(MK[p.o.m] || p.o.m) + " 市场 #" + p.o.id + "）→</a>";
    if (p.k === "pred") btn += '<a class="sq-btn" href="#/oracle">🔮 我也预测 →</a>';
    if (p.k === "iou") h = '<div class="sq-iou">📜 立字据 · 永久刻在链上</div>' + h;
    if (p.at && !p.locked) h = '<div class="sq-iou">⏰ 时间胶囊 · ' + tm(p.at) + " 揭晓</div>" + h;
    return h + (btn ? '<div class="sq-btns">' + btn + "</div>" : "");
  }
  function rootCard(p) {
    return '<a class="sq-card" href="#/square/' + p.tx + '"><div class="sq-h">' + nameHtml(p) + '<small>' + ago(p.time) + "</small></div>" + body(p) +
      '<div class="sq-f"><span>💬 ' + (p.n || 0) + " 层</span><span>" + (p.n ? "最新 " + ago(p.last || p.time) + " · " : "") + "点开盖楼 →</span></div></a>";
  }
  function floorCard(p, i) {
    var tag = i === 1 ? "楼主" : i === 2 ? "沙发" : i === 3 ? "板凳" : i + " 楼";
    return '<div class="sq-floor"><div class="sq-h"><b class="sq-no">#' + i + " " + tag + "</b>" + nameHtml(p) + "<small>" + tm(p.time) + '</small><a class="sq-tx" href="#/scan/' + p.tx + '" title="链上证据">🔗</a></div>' + body(p) + "</div>";
  }
  function composer(re) {
    return '<section class="card sq-compose"><div class="card-head"><h2>' + (re ? "💬 盖一层" : "✍️ 发一帖") + '</h2><span class="muted">只花约 0.001 DAI Gas · 永久上链</span></div>' +
      (re ? "" : '<div class="sq-kinds"><button type="button" class="on" data-k="">普通</button><button type="button" data-k="cap">🔒 时间胶囊</button><button type="button" data-k="iou">📜 立字据</button><button type="button" data-k="order">📌 挂单帖</button><button type="button" data-k="pred">🔮 预言帖</button></div>') +
      '<textarea id="sq-t" maxlength="' + MAX + '" rows="3" placeholder="写点什么（' + MAX + ' 字以内）。不能有网址和联系方式，所有交流只在链上。"></textarea>' +
      '<div id="sq-opt" class="sq-opt" hidden></div>' +
      '<div class="sq-cf"><span class="muted" id="sq-n">0 / ' + MAX + '</span><button type="button" class="nm-go" id="sq-go">' + (re ? "盖楼（钱包确认一次）" : "发布（钱包确认一次）") + '</button></div><p class="note" id="sq-st"></p></section>';
  }
  var kind = "";
  function optHtml(k) {
    var d = new Date(Date.now() + 365 * 86400e3), iso = d.toISOString().slice(0, 10);
    if (k === "cap") return '<label>🔒 到这一天才揭晓：<input type="date" id="sq-at" value="' + iso + '"></label><small>到期前本站只显示「🔒 时间胶囊」。写给未来的自己、一年后的预言、给某人的话。链上原文懂技术的人能提前解出来，所以别写秘密。</small>';
    if (k === "order") return '<label>📌 市场 <select id="sq-m">' + Object.keys(MK).map(function (m) { return '<option value="' + m + '">' + MK[m] + "</option>"; }).join("") + '</select> 单号 <input id="sq-id" type="number" min="0" placeholder="例如 1234" style="width:100px"></label><small>单号在 OTC 页「我的挂单」里看（# 后面的数字）。帖子下面会出现「去买这张单」按钮，别人一点就到你的单。</small>';
    if (k === "iou") return '<small>📜 立字据模板已填进正文：改成你们的内容。双方名字和时间永久刻在链上，谁都改不了。</small>';
    if (k === "pred") return '<small>🔮 预言帖：写你对今晚揭晓价的看法，帖子下面会有「我也预测」按钮带大家去预言家页。</small>';
    return "";
  }
  function bindComposer(rid, re, onDone) {
    var ta = document.getElementById("sq-t"), n = document.getElementById("sq-n"), go = document.getElementById("sq-go"), st = document.getElementById("sq-st"), opt = document.getElementById("sq-opt");
    if (!ta) return;
    ta.oninput = function () { n.textContent = Array.from(ta.value).length + " / " + MAX; };
    document.querySelectorAll(".sq-kinds button").forEach(function (b) {
      b.onclick = function () {
        kind = b.getAttribute("data-k"); document.querySelectorAll(".sq-kinds button").forEach(function (x) { x.classList.toggle("on", x === b); });
        opt.innerHTML = optHtml(kind); opt.hidden = !opt.innerHTML;
        if (kind === "iou" && !ta.value) { ta.value = "我 ___ 承诺：___。期限：___。违约则：___。"; ta.oninput(); }
      };
    });
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; if (bad) A.errTip(t, go); }
    go.onclick = function () {
      var txt = ta.value.trim();
      if (!txt) return say("先写点什么", true);
      if (Array.from(txt).length > MAX) return say("最多 " + MAX + " 字", true);
      if (CONTACT.test(txt)) return say("🛡️ 帖子里不能有网址或联系方式（微信、QQ、电报、手机号等）。所有交流只在链上进行，骗子才会让你加联系方式。", true);
      var obj = { t: txt };
      if (re) obj.re = re;
      else {
        if (kind === "cap") { var at = document.getElementById("sq-at"), ts = at && at.value ? new Date(at.value + "T21:00:00+08:00").getTime() : 0; if (!ts || ts < Date.now()) return say("揭晓日期要在今天之后", true); obj.at = ts; }
        if (kind === "order") { var m = document.getElementById("sq-m").value, id = Number(document.getElementById("sq-id").value); if (!(id >= 0) || document.getElementById("sq-id").value === "") return say("填一下挂单的单号", true); obj.o = { m: m, id: id }; }
        if (kind === "pred" || kind === "iou") obj.k = kind;
      }
      go.disabled = true;
      var acct;
      A.otcKit.connect().then(function (acc) {
        acct = acc; say("检查发帖资格…");
        return nameOf(acct);
      }).then(function (nm) {
        if (!nm) throw new Error("只有注册了 .ailgns 域名并设为主名字的钱包才能发帖。去「域名」页注册一个（最低 5 DAI），设为主名字后再来");
        say("🔒 这是一笔 0 元转账，内容放在交易里，只花约 0.001 DAI 的 Gas。请在钱包确认");
        return A.wallets.ask(W.get(), { method: "eth_sendTransaction", params: [{ from: acct, to: SQUARE, value: "0x0", data: enc(obj) }] });
      }).then(function (hash) {
        say("已提交，等待链上确认…");
        return W.waitOn("anubis", hash).then(function () { return hash; });
      }).then(function (hash) {
        say("链上已确认，正在收进广场…");
        return fetch("/api/square", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: hash }) }).then(function (r) { return r.json(); });
      }).then(function (r) {
        if (r.error) throw new Error(r.error);
        say("✅ 已上链"); ta.value = ""; n.textContent = "0 / " + MAX; go.disabled = false;
        onDone(r.item);
      }).catch(function (e) { go.disabled = false; say(A.otcKit.niceError ? A.otcKit.niceError(e) : (e.message || String(e)), true); });
    };
  }
  function head() {
    return '<section class="card sq-head"><h1>🏛️ 链上广场</h1><p class="sub">有 .ailgns 名字的人才能发言，每句话都是一笔链上交易：发了就删不掉、改不了，谁说的永远查得到。<b>看帖不用钱包。</b></p>' +
      '<div class="sq-rules"><span>🧱 盖楼</span><span>🔒 时间胶囊</span><span>📜 立字据</span><span>📌 挂单帖一键去成交</span><span>🔮 预言帖</span></div></section>';
  }
  function list(rid) {
    A.app.innerHTML = head() + composer(null) + '<div id="sq-list"><p class="muted">读取中…</p></div>';
    kind = ""; bindComposer(rid, null, function () { list(rid); });
    fetch("/api/square?list=1").then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      var box = document.getElementById("sq-list"), l = j.list || [];
      box.innerHTML = l.length ? '<h3 class="sq-h3">最新 · 共 ' + (j.total || l.length) + " 帖</h3>" + l.map(rootCard).join("") : '<section class="card"><p class="muted">广场还空着。第一帖会永远是第一帖，要不要留给你？</p></section>';
    }).catch(function () { var box = document.getElementById("sq-list"); if (box) box.innerHTML = '<p class="muted">读取失败，稍后再试</p>'; });
  }
  function thread(rid, tx) {
    A.app.innerHTML = '<p class="sq-back"><a href="#/square">← 回广场</a></p><div id="sq-th"><p class="muted">读取中…</p></div>';
    fetch("/api/square?p=" + tx).then(function (r) { return r.json(); }).then(function (j) {
      if (!A.isCurrent(rid)) return;
      var box = document.getElementById("sq-th");
      if (j.error) { box.innerHTML = '<section class="card"><p class="nm-bad">' + esc(j.error) + "</p></section>"; return; }
      var floors = [j.root].concat(j.replies || []);
      box.innerHTML = '<section class="card sq-thread">' + floors.map(function (p, i) { return floorCard(p, i + 1); }).join("") + "</section>" + composer(tx);
      bindComposer(rid, tx, function (item) { var th = document.querySelector(".sq-thread"); if (th) th.insertAdjacentHTML("beforeend", floorCard(item, floors.length + 1)); floors.push(item); });
    }).catch(function () { var box = document.getElementById("sq-th"); if (box) box.innerHTML = '<p class="muted">读取失败，稍后再试</p>'; });
  }
  A.pages.square = function (rid) {
    var tx = (location.hash.split("/")[2] || "").toLowerCase();
    if (/^0x[0-9a-f]{64}$/.test(tx)) thread(rid, tx); else list(rid);
  };
})();
