// 🛡 互助保障 #/cover（站长 2026-11-23 定，试运行，入口在 ☰ 更多 → 交易）
// 大白话：大家每年各交 50 DAI 进一个公开的保障池；账户被盗、或者因为平台失误亏了钱，从池子里赔，池子有多少最多赔多少。
// 规则和计算在 lib/cover.js，这里只负责画和「加入」那三步（登记备用收款钱包 → 交保费 → 登记）。对外不叫保险、不写全赔。
(function () {
  "use strict";
  var A = window.AIL, K = function () { return A.otcKit; };
  var KEY = "cover-v1", rid = 0, info = null, account = null, busy = false, draft = {};
  try { draft = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { draft = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch (e) { /* 存不了就只在内存里 */ } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function g(id) { return document.getElementById(id); }
  function dai(v) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
  function day(ms) { var d = new Date(ms + 8 * 3600e3); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  function low(a) { return String(a || "").toLowerCase(); }
  function pad(a) { return low(a).replace("0x", "").padStart(64, "0"); }
  function utf8hex(t) { var b = new TextEncoder().encode(t), h = "0x"; for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0"); return h; }
  // 和 lib/cover.js 的 bindText 一字不差
  function bindText(a, backup, ts) { return "AiLGNS 互助保障 · 登记\n加入的钱包：" + low(a) + "\n备用收款钱包（理赔款只打到这里）：" + low(backup) + "\n时间：" + ts; }
  // 和 lib/cover.js 的 voteText 一字不差
  function voteText(a, id, v, ts) { return "AiLGNS 互助保障 · 投票\n理赔编号：" + id + "\n我的钱包：" + low(a) + "\n我的意见：" + (v === "y" ? "赞成赔付" : "反对赔付") + "\n时间：" + ts; }
  var myVote = {}; /* 刚投的票：服务器那头的计票要几十秒才追上，先记在这里马上显示 */
  var ST = { notice: "📢 公示中", approved: "✅ 已通过，等月度结算", rejected: "❌ 没通过", paid: "💰 已赔付" };

  function load() {
    return fetch("/api/cover" + (account ? "?a=" + account : "")).then(function (r) { return r.json(); }).then(function (j) { info = j; }, function () { info = null; });
  }
  function page(id) {
    rid = id;
    try { if (K() && K().M && K().M().chain !== "anubis") K().useMarket("ailgns"); } catch (e) { /* 钱包工具没就绪也不影响看页面 */ }
    A.app.innerHTML = '<section class="card"><p class="muted">⏳ 读取保障池…</p></section>';
    var sa = K() && K().silentAccount ? K().silentAccount() : Promise.resolve();
    sa.then(function () { account = K().account(); }, function () {}).then(load).then(function () { if (A.isCurrent(rid)) render(); });
  }
  function render() {
    var R = (info && info.rules) || { fee: 50, waitDays: 30, tiers: [[1, 1000], [3, 3000], [6, 5000], [12, 10000]], monthBudget: 0.3, reportHours: 72, noticeDays: 7 };
    if (R.opsShare == null) R.opsShare = 0.1; if (!R.voteMin) R.voteMin = 5; if (!R.voteQuorum) R.voteQuorum = 0.2;
    var ops = Math.round(R.opsShare * 100);
    var open = !!(info && info.open), bal = info && info.pool ? info.pool.bal : null, me = info && info.me, top = R.tiers[R.tiers.length - 1][1];
    A.app.innerHTML =
      '<section class="card lp-hero cvr-hero"><div class="lp-ht"><h2>🛡 互助保障 <span class="lp-tag">试运行</span></h2>' +
      "<p>大家每年各交 <b>" + R.fee + " DAI</b> 进一个公开的保障池。谁的账户被盗了，或者因为平台失误亏了钱，就从池子里赔。<b>池子里有多少，最多赔多少</b>，每一笔进出链上都查得到。</p></div>" +
      '<div class="lp-kpi"><div><small>保障池现在有</small><b>' + (bal == null ? "—" : dai(bal) + " DAI") + "</b><span>" + (open ? "链上公开" : "钱包准备中") + "</span></div><div><small>已加入</small><b>" + ((info && info.members) || 0) + " 人</b><span>人越多池子越大</span></div><div><small>被盗最高赔</small><b>" + dai(top) + " DAI</b><span>连续加入满 1 年</span></div></div>" +
      (open && info.pool.addr ? '<p class="cvr-addr"><small>保障池钱包（点开能看每一笔进出）</small><a href="#/scan/' + esc(info.pool.addr) + '">' + esc(info.pool.addr) + "</a></p>" : "") + "</section>" +
      '<section class="card cvr-what"><h2>能赔什么</h2>' +
      '<div class="cvr-k"><b>① 平台失误</b><p>合约出了漏洞、网站出错、机器人转错了钱，让你亏了。<b>损失多少赔多少</b>，最高到整个保障池；同时有好几个人出事、池子不够时，按比例分。加入当天就算。</p></div>' +
      '<div class="cvr-k"><b>② 账户被盗</b><p>私钥泄露、点了钓鱼链接，币被人转走了。最高赔多少，看你连续加入了多久：</p>' +
      '<table class="cvr-tb"><thead><tr><th>连续加入满</th><th>最高赔</th></tr></thead><tbody>' + R.tiers.map(function (x) { return "<tr><td>" + x[0] + " 个月</td><td><b>" + dai(x[1]) + " DAI</b></td></tr>"; }).join("") + "</tbody></table>" +
      "<p>损失比上限少的，按实际损失赔。</p></div></section>" +
      '<section class="card cvr-warn"><b>⚠️ 加入前请看清楚</b><ul>' +
      "<li>这是大家互相帮忙的保障池，<b>不是保险公司的保险</b>，不承诺一定足额赔。</li>" +
      "<li><b>以保障池余额为限。</b>被盗类每个月最多动用池子的 " + Math.round(R.monthBudget * 100) + "%" + (bal == null ? "" : "（现在约 " + dai(bal * R.monthBudget) + " DAI）") + "，当月要赔的超过这个数，大家<b>按比例打折</b>。</li>" +
      "<li>被盗保障在加入满 <b>" + R.waitDays + " 天</b>后才生效；被盗后 <b>" + R.reportHours + " 小时内</b>必须提工单，过期不受理。</li>" +
      "<li>每笔保费的 <b>" + ops + "%</b> 是运营费（人工核对、服务器），<b>" + (100 - ops) + "%</b> 留在保障池。上面显示的保障池金额已经扣掉运营费。</li>" +
      "<li><b>赔不赔由加入的成员投票决定。</b>每笔理赔<b>公示 " + R.noticeDays + " 天</b>（公开钱包地址、金额、币去了哪里），这 " + R.noticeDays + " 天就是投票期：在这笔理赔登记之前已经加入满 " + R.waitDays + " 天的成员一人一票，申请人自己不能投；赞成多于反对、而且至少 " + Math.round(R.voteQuorum * 100) + "% 的人投了票，才算通过。通过的每月结算一次。</li>" +
      "<li>有资格投票的不满 " + R.voteMin + " 人，或者投票的人不够时，由团队核对链上记录后决定。团队发现骗赔证据可以否决，并公开理由。</li>" +
      "<li><b>一个钱包只赔一次。</b>赔过以后这个钱包不再受保。</li>" +
      "<li>理赔款<b>只打到你加入时登记的备用收款钱包</b>。备用钱包请用另一组助记词，和这个钱包分开放。</li>" +
      "<li>保费交了不退。发现骗赔的，不赔并公开。</li></ul></section>" +
      '<section class="card cvr-me" id="cvr-me">' + meBox(R, open, me) + "</section>" +
      '<section class="card cvr-how"><h2>出事了怎么申请</h2><ol><li>先别慌，<b>不要理任何私聊你的「客服」</b>。平台不会私聊你，更不会让你先转钱。</li><li>打开 <a href="#/feedback">☰ 更多 → 服务 → 问题反馈</a>，标题写「互助保障理赔」。</li><li>写清楚：哪个钱包、什么时候、丢了多少、被盗那几笔交易的交易号，能截图就截图。</li><li>团队核对链上记录后公示 ' + R.noticeDays + " 天，成员投票通过后进入当月结算，理赔款打到你登记的备用收款钱包。</li></ol></section>" +
      '<section class="card cvr-list"><h2>📢 理赔公示</h2><div id="cvr-claims">' + claimsBox() + "</div></section>";
    bind(R);
  }
  function meBox(R, open, me) {
    var head = '<div class="card-head"><h2>我的保障</h2><button type="button" class="ghost" id="cvr-conn">' + (account ? A.short(account) : "连接钱包") + "</button></div>";
    if (me && me.closed) return head + '<p class="cvr-st bad">这个钱包已经赔过一次，不再受保。想继续加入请换一个钱包。</p>';
    if (me && me.active) {
      var soon = me.until - Date.now() < 30 * 86400e3;
      return head + '<p class="cvr-st ok">✅ 已加入，保障到 ' + day(me.until) + "</p>" +
        '<div class="cvr-rows"><p><span>加入日期</span><b>' + day(me.start) + "</b></p><p><span>连续加入</span><b>" + me.months + " 个月</b></p>" +
        "<p><span>平台失误</span><b>已生效</b></p>" +
        "<p><span>被盗保障</span><b>" + (me.effective ? (me.cap > 0 ? "现在最高赔 " + dai(me.cap) + " DAI" : "已生效，满 1 个月开始有额度") : day(me.effectiveAt) + " 生效") + "</b></p>" +
        "<p><span>备用收款钱包</span><b class=\"mono\">" + esc(me.backup) + "</b></p></div>" +
        (soon ? '<button type="button" class="nm-go cvr-go" id="cvr-go"' + (open ? "" : " disabled") + ">续一年（" + R.fee + " DAI）</button><p class=\"muted\">到期后 " + (R.graceDays || 7) + ' 天内续上，连续加入的时间不断。</p><p class="muted nm-st" id="cvr-stt"></p>' : '<p class="muted">快到期时这里会出现「续一年」按钮。备用收款钱包要更换，请提工单。</p>');
    }
    return head + (me && !me.active && me.start ? '<p class="cvr-st bad">你的保障已在 ' + day(me.until) + " 到期。重新加入后，连续加入的时间从头算。</p>" : "") +
      '<p class="cvr-t">① 填一个备用收款钱包</p><p class="muted">万一这个钱包被盗，理赔款只打到备用钱包。偷到私钥的人改不了它。请填<b>另一组助记词</b>的钱包地址。</p>' +
      '<input id="cvr-bk" class="cvr-in" placeholder="0x 开头的钱包地址" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(draft.backup || "") + '"' + (me && me.backup ? " disabled" : "") + ">" +
      (me && me.backup ? '<p class="muted">沿用你以前登记的备用钱包 ' + esc(me.backup) + "</p>" : "") +
      '<p class="cvr-t">② 加入</p><p class="muted">钱包会弹 2 次：第 1 次是签名登记备用钱包（不花钱），第 2 次是交 ' + R.fee + " DAI 保费。</p>" +
      '<button type="button" class="nm-go cvr-go" id="cvr-go"' + (open ? "" : " disabled") + ">" + (draft.tx ? "👉 保费已交，点这里完成登记" : "🛡 加入互助保障（" + R.fee + " DAI / 年）") + "</button>" +
      (open ? "" : '<p class="cvr-soon">🧪 保障池钱包还在准备，暂时不能加入。开放时间会写进更新日志和收件箱。</p>') +
      '<p class="muted nm-st" id="cvr-stt"></p>';
  }
  function claimsBox() {
    var L = (info && info.claims) || [];
    if (!L.length) return '<p class="muted">' + (info && info.noKv ? "预览站没有存储，看不到公示。" : "还没有理赔。每一笔理赔都会在这里公开。") + "</p>";
    return L.map(function (c) {
      return '<div class="cvr-c"><div class="cvr-ch"><b>' + (c.kind === "fault" ? "平台失误" : "账户被盗") + '</b><span class="cvr-cs ' + esc(c.status) + '">' + (ST[c.status] || esc(c.status)) + "</span></div>" +
        "<p><span>钱包</span><b>" + (A.nameTag ? A.nameTag(c.a) : A.short(c.a)) + "</b></p><p><span>损失</span><b>" + dai(c.loss) + " DAI</b></p>" +
        (c.kind === "theft" ? "<p><span>最高可赔</span><b>" + dai(c.cap) + " DAI</b></p>" : "") +
        "<p><span>出事时间</span><b>" + day(c.when) + "</b></p>" +
        (c.status === "notice" ? "<p><span>公示到</span><b>" + day(c.noticeUntil) + "</b></p>" : "") + voteBox(c) +
        (c.status === "paid" ? "<p><span>实际赔付</span><b>" + dai(c.pay) + " DAI" + (c.payTx ? ' <a href="#/scan/' + esc(c.payTx) + '">看账本</a>' : "") + "</b></p>" : "") +
        (c.txs && c.txs.length ? '<p class="cvr-tx">' + c.txs.map(function (t, i) { return '<a href="#/scan/' + esc(t) + '">交易 ' + (i + 1) + "</a>"; }).join(" · ") + "</p>" : "") +
        (c.note ? '<p class="cvr-note">' + esc(c.note) + "</p>" : "") + "</div>";
    }).join("") + '<p class="muted">觉得哪一笔有问题，可以到「问题反馈」里举报。</p>';
  }
  // 🗳 投票（站长 2026-11-24：「赔偿是所有投保人投票决定」）：公示中的理赔显示票数；符合条件的成员能点「赞成 / 反对」
  function voteBox(c) {
    var v = c.vote; if (!v) return "";
    var mine = myVote[c.id] || c.my || "", yes = v.yes, no = v.no;
    if (myVote[c.id] && myVote[c.id] !== c.my) { if (c.my === "y") yes--; if (c.my === "n") no--; if (myVote[c.id] === "y") yes++; else no++; } /* 刚投 / 刚改的票先算进去 */
    var count = '<p class="cvr-vn">🗳 赞成 <b>' + yes + "</b> · 反对 <b>" + no + "</b></p>";
    if (c.status !== "notice") return v.elig >= ((info.rules && info.rules.voteMin) || 5) && (yes + no) ? '<div class="cvr-vote">' + count + "</div>" : "";
    if (v.state === "team") return '<div class="cvr-vote"><p class="cvr-vt">加入满 ' + ((info.rules && info.rules.waitDays) || 30) + " 天的成员还不够 " + ((info.rules && info.rules.voteMin) || 5) + " 位，这一笔由团队核对决定。</p></div>";
    if (v.state === "low") return '<div class="cvr-vote">' + count + '<p class="cvr-vt">投票期已结束，投票的人不够，这一笔由团队核对决定。</p></div>';
    return '<div class="cvr-vote">' + count + '<p class="cvr-vq">有资格投票 ' + v.elig + " 人，至少要 " + v.need + " 人投票才算数</p>" +
      (c.can ? '<div class="cvr-vb"><button type="button" class="cvr-y' + (mine === "y" ? " on" : "") + '" data-vid="' + esc(c.id) + '" data-v="y">👍 赞成赔付</button><button type="button" class="cvr-n' + (mine === "n" ? " on" : "") + '" data-vid="' + esc(c.id) + '" data-v="n">👎 反对</button></div>' +
        '<p class="muted cvr-vh">' + (mine ? "你投了「" + (mine === "y" ? "赞成" : "反对") + "」，公示期内可以改。" : "点一下，钱包签个名就投好了，不花钱。") + "</p>"
        : '<p class="muted cvr-vh">' + (account ? "这一笔你不能投票：要在它登记之前已经加入满 " + ((info.rules && info.rules.waitDays) || 30) + " 天，申请人自己也不能投。" : "连接钱包后，符合条件的成员可以投票。") + "</p>") + "</div>";
  }
  function castVote(btn) {
    if (busy) return;
    var id = btn.getAttribute("data-vid"), v = btn.getAttribute("data-v"), ts = Date.now();
    busy = true;
    K().ready().then(function () {
      account = K().account();
      return A.wallets.ask(A.wallet.get(), { method: "personal_sign", params: [utf8hex(voteText(account, id, v, ts)), account] });
    }).then(function (sig) {
      return fetch("/api/cover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "vote", a: account, id: id, v: v, ts: ts, sig: sig }) }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || "投票没成功，请过一会儿再点一次");
      myVote[id] = v; busy = false;
      var box = g("cvr-claims"); if (box) { box.innerHTML = claimsBox(); bindVotes(); }
    }).then(null, function (e) { busy = false; A.errTip(K().niceError(e), btn); });
  }
  function bindVotes() { Array.prototype.forEach.call(document.querySelectorAll("#cvr-claims [data-vid]"), function (b) { b.onclick = function () { castVote(b); }; }); }
  function bind(R) {
    bindVotes();
    var cb = g("cvr-conn"); if (cb) cb.onclick = function () { K().connect().then(function (a) { account = a; return load(); }).then(function () { if (A.isCurrent(rid)) render(); }, function (e) { A.errTip(K().niceError(e), cb); }); };
    var bk = g("cvr-bk"); if (bk) bk.oninput = function () { draft.backup = bk.value.trim(); save(); };
    var go = g("cvr-go"); if (go) go.onclick = function () { join(R, go); };
  }
  function join(R, go) {
    if (busy) return;
    var say = function (t) { var e = g("cvr-stt"); if (e) e.textContent = t; }, me = info && info.me, has = !!(me && me.backup);
    var backup = low(has ? "" : (g("cvr-bk") || {}).value || draft.backup);
    if (!has && !/^0x[0-9a-f]{40}$/.test(backup)) return A.errTip("请先填备用收款钱包地址（0x 开头，42 位）", go);
    busy = true; go.disabled = true;
    var done = function () { busy = false; return load().then(function () { if (A.isCurrent(rid)) render(); }); };
    var post = function () {
      say("正在登记，网站在核对链上记录…");
      return fetch("/api/cover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", a: account, backup: draft.backup || "", ts: draft.ts || 0, sig: draft.sig || "", tx: draft.tx }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || "登记没成功，请过一会儿再点一次（不会多收费）");
        draft = {}; save();
      });
    };
    K().ready().then(function () {
      account = K().account();
      if (draft.by && draft.by !== account) { draft = { backup: draft.backup }; save(); } // 换了钱包：上一个钱包没做完的不带过来
      if (!has && backup === account) throw new Error("备用收款钱包不能和加入的钱包相同。请填另一组助记词的钱包地址");
      if (draft.tx) return; // 保费已经交过，只差登记
      var step1 = Promise.resolve();
      if (!has) {
        // ① 签名登记备用钱包（不花钱）
        var ts = Date.now(); say("第 1 次：请在钱包里签名，登记备用收款钱包（不花钱）");
        step1 = A.wallets.ask(A.wallet.get(), { method: "personal_sign", params: [utf8hex(bindText(account, backup, ts)), account] }).then(function (sig) { draft.backup = backup; draft.ts = ts; draft.sig = sig; draft.by = account; save(); });
      }
      return step1.then(function () { return K().balance(info.dai, account); }).then(function (b) {
        var fee = BigInt(R.fee) * 10n ** 18n;
        if (b < fee + 10n ** 17n) throw new Error("DAI 不够：保费 " + R.fee + " DAI，另外留一点付 Gas");
        // ② 交保费：DAI 转给保障池钱包
        return K().send(info.dai, "0xa9059cbb" + pad(info.pool.addr) + fee.toString(16).padStart(64, "0"), say, "交互助保障保费 " + R.fee + " DAI");
      }).then(function (rc) { if (!rc || !rc.transactionHash) throw new Error("保费交易没拿到交易号，请到账本里确认后再点一次"); draft.tx = rc.transactionHash; draft.by = account; save(); });
    }).then(post).then(done, function (e) { busy = false; say(""); render(); A.errTip(K().niceError(e), g("cvr-go") || A.app); });
  }
  A.pages.cover = page;
})();
