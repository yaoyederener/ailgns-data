// 🔥 创世域名销毁进行中 #/genesis（站长 2026-11-09 定）：中奖领钱的人必须先销毁 1 枚创世名——烧自己的，或去市场任意买一枚来烧；中奖后 3 天不销毁视为放弃领奖。
// 这页做「讲规则 + 铸造实况 + 销毁按钮（选创世名 → 转黑洞）+ 引导去注册 / 去市场买」；数据走 /api/name-genesis（有缓存，秒开）
(function () {
  "use strict";
  try {
    var A = window.AIL; if (!A || !A.pages) return;
    var GENESIS = 10000;
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function n(v) { return Number(v || 0).toLocaleString("en-US"); }
    function ago(s) { s = Math.max(0, Math.floor(Number(s) || 0)); return s < 60 ? "刚刚" : s < 3600 ? Math.floor(s / 60) + " 分钟前" : s < 86400 ? Math.floor(s / 3600) + " 小时前" : Math.floor(s / 86400) + " 天前"; }
    var rid = 0, timer = null, lastLeft = null, stGot = null, stBurn = null;
    function paintStats() {
      var set = function (k, v) { var el = document.getElementById(k); if (el) el.textContent = v; };
      if (stBurn !== null) set("gs-bn", n(stBurn));
      if (stGot !== null) { set("gs-bmint", n(Math.max(0, GENESIS - stGot))); if (stBurn !== null) set("gs-bleft", n(Math.max(0, stGot - stBurn))); }
    }
    function flip(n) { // 翻牌数字：和域名页创世卡同款（.gc-d），不足 4 位补 0
      var str = String(Math.max(0, n | 0)).padStart(4, "0");
      return str.split("").map(function (d, i) { return (str.length - i === 3 && i ? '<em class="gc-sep">,</em>' : "") + '<span class="gc-d">' + d + "</span>"; }).join("");
    }
    // 站长 2026-11-09：整页（实况 + 按钮 + 规则）也嵌到域名页注册卡下面做清晰提醒 → render(root, full)；full=false 时不带「去注册」按钮和「刚刚注册」列表
    // 站长 2026-11-11：客户反映红按钮有诱导感、不知道怎么操作 → 红按钮上方加「只给已中奖的人用 + 4 步怎么做」（两处共用）
    var HOW = '<div class="gs-how"><b>👇 下面红色按钮，只给已经中奖的人用</b><ol>' +
      '<li>先查有没有中奖：<a href="#/oracle/result">点这里看揭晓结果 ›</a>。结果里有你的名字或钱包，后面写着「等中奖人销毁」，才需要烧。</li>' +
      '<li>中奖了，点红色按钮，连<b>中奖的那个钱包</b>。</li>' +
      '<li>选一枚创世名，点「销毁这枚」，在钱包里确认。钱包里没有创世名，再去域名市场买一枚。</li>' +
      '<li>烧完不用再做别的，机器人核对后把奖金发到中奖钱包。</li></ol>' +
      '<p>没中奖的：不用点、不用买、不用烧。</p></div>';
    var seq = 0;
    function render(root, full) {
      rid = "r" + (++seq); lastLeft = null;
      clearInterval(timer); timer = setInterval(function () { if (!document.body.contains(root) || !root.querySelector("#gs-flip")) { clearInterval(timer); return; } load(); }, 15000); // 接口缓存 15 秒，跟着刷；容器没了就停
      root.innerHTML =
        '<section class="card gs-hero"><div class="gc-top"><h2>🔥 创世域名销毁进行中</h2><span class="gc-live"><i></i>链上实时</span></div>' +
        '<p class="muted"><b>中奖领钱的人，必须先销毁 1 枚创世名。</b>烧自己手里的，或去域名市场任意买一枚来烧都行。<b>中奖后 3 天内不销毁，视为放弃领奖。</b></p>' +
        '<div class="gs-big"><small id="gs-cap">已铸造的创世名（限量 10,000）</small><div class="gc-flip" id="gs-flip">' + flip(0) + '</div><small id="gs-sub">每被注册 1 个，这里就跳 1 下 · 铸完永久没有</small></div>' +
        // 一边铸造、一边销毁：左边紫色是已铸出来的，右边火色是等着被烧的；中间进度条紫色吃掉火色
        '<div class="gs-duel"><div class="gs-mint"><small>🌟 已铸造</small><b id="gs-n">—</b><span>一边在铸</span></div><div class="gs-vs">VS</div><div class="gs-fire"><small>🔥 还能注册</small><b id="gs-rest">—</b><span>铸完只能去市场买</span></div></div>' +
        '<div class="gs-bar"><i id="gs-fill"></i></div>' +
        '<p class="gs-day">今天新铸 <b id="gs-day">—</b> 个 · 中奖要领钱的，手里先备一枚</p>' +
        '<div class="gs-act">' + (full ? '<a class="nm-go gs-reg" href="#/names">🌟 现在去注册创世名（5 DAI / 年起）</a>' : "") + '<a class="nm-go gs-ghost" href="#/names">🛒 已中奖、没有创世名？去买一枚</a>' +
        HOW + '<button type="button" class="nm-go gs-off gs-on gs-burn">🔥 中奖的人点这里销毁领奖<small>没中奖的不用点</small></button><p class="gs-bwarn">⚠️ 风险提示：<b>中奖后再来烧，没中奖不要烧</b>。烧掉不退、不补偿，也不会因此多发奖。</p></div><div class="gs-burn-box"></div></section>' +
        // 站长 2026-11-09：已销毁创世域名统计 + 销毁记录放在销毁按钮正下方（规则卡上面），每条点开进中文账本
        '<section class="card gs-burned"><div class="gc-top"><h3>🔥 创世域名销毁统计</h3><span class="gc-live"><i></i>链上实时</span></div>' +
        // 站长 2026-11-09：高亮、大数字，让人一眼看到剩多少：已销毁 / 现存（已铸造 − 已销毁）/ 还能注册（10,000 − 已铸造）
        '<div class="gs-bstats"><div class="gs-bs hot"><small>🔥 已销毁</small><b id="gs-bn">—</b><span>永久消失</span></div><div class="gs-bs"><small>🌟 现存创世名</small><b id="gs-bleft">—</b><span>已铸造 − 已销毁</span></div><div class="gs-bs"><small>🆕 还能注册</small><b id="gs-bmint">—</b><span>限量 10,000</span></div></div>' +
        '<p class="gs-bcap">销毁记录（点「账本」看链上那笔）</p><ul class="gs-recent gs-blist" id="gs-blist"><li class="muted">读取中…</li></ul></section>' +
        '<section class="card gs-rule"><h3>📜 规则（大白话）</h3><ol>' +
        '<li><b>中奖要领钱，先烧 1 枚创世名。</b>烧 = 永久销毁，拿不回来；烧完机器人核对链上记录才发奖。<b>烧掉的名字以后谁再注册都不算创世</b>，编号永久作废。</li>' +
        '<li><b>烧哪一枚都行。</b>自己手里的，或者去域名市场任意买一枚来烧；没满之前也可以直接注册一枚。编号跟着名字走，买来的也算。</li>' +
        '<li><b>一枚只能抵一次奖。</b>想多次领奖，就要多备几枚。</li>' +
        '<li><b>中奖后 3 天内不销毁，视为放弃领奖。</b>从中奖通知发出算起，过期不补发。</li>' +
        '<li><b>怎么烧：</b>点上面红色按钮「中奖的人点这里销毁领奖」→ 连钱包 → 选一枚 → 钱包里确认。销毁就是转进黑洞地址，只花一点 Gas。</li><li><b>📣 提前公告 · 1 万个注册满那天起，预言家这样玩：</b>钱包里有任何 .ailgns 主名字就能天天猜。<b>普通名每天 1 次</b>；<b>创世名按档位每天 1～5 次，永久有效</b>，这是创世名卖完后最硬的价值。按钱包算，不按名字数量，囤再多也不多猜。中奖领钱照样要先烧 1 枚创世名。</li></ol>' +
        '<p class="muted">说明：所有活动为社区自治、娱乐性质，参与请自行承担风险。</p></section>' +
        (full ? '<section class="card"><h3>🆕 刚刚注册的创世名</h3><ul class="gs-recent" id="gs-recent"><li class="muted">读取中…</li></ul></section>' : "");
      bindBurn(root);
      load(); loadBurns();
    }
    function page() { render(A.app, true); }
    function loadBurns() {
      var my = rid;
      fetch("/api/name-burns").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
        if (my !== rid || !j) return;
        stBurn = Number(j.n) || 0; paintStats();
        var ul = document.getElementById("gs-blist"); if (!ul) return;
        var all = j.list || [], FOLD = 3; // 默认只露 3 条，其余折叠（站长 2026-11-09）
        ul.innerHTML = all.slice(0, 50).map(function (x, i) {
          var who = x.from ? x.from.slice(0, 6) + "…" + x.from.slice(-4) : "";
          return '<li><div class="gs-bm"><b>' + esc(x.label || "（未知）") + ".ailgns</b> <span>" + (x.no ? "创世 #" + n(x.no) : "") + "</span><small>🔥 " + who + (x.t ? " · " + ago((Date.now() - x.t) / 1000) : "") + "</small></div>" +
            (x.tx ? '<a href="#/scan/' + esc(x.tx) + '">账本 ›</a>' : '<a href="#/scan/' + esc(x.from) + '">账本 ›</a>') + "</li>";
        }).map(function (h, i) { return i >= FOLD ? h.replace("<li>", '<li class="more">') : h; }).join("") || '<li class="muted">还没有人销毁</li>';
        var old = ul.nextElementSibling; if (old && old.classList.contains("gs-bmore")) old.remove();
        if (all.length > FOLD) { ul.classList.add("fold"); var bt = document.createElement("button"); bt.type = "button"; bt.className = "gs-bmore"; bt.textContent = "展开全部 " + n(all.length) + " 条 ▾"; bt.onclick = function () { var f = ul.classList.toggle("fold"); bt.textContent = f ? "展开全部 " + n(all.length) + " 条 ▾" : "收起 ▴"; }; ul.after(bt); }
      }).catch(function () { var ul = document.getElementById("gs-blist"); if (ul && my === rid) ul.innerHTML = '<li class="muted">读取失败，稍后自动重试</li>'; });
    }

    // 🔥 销毁领奖（站长 2026-11-09 定）：连钱包 → 列出钱包里的创世 .ailgns 名 → 选一枚 → 用 ERC721 transferFrom 转进黑洞地址（永久拿不回）
    // 不碰合约、不加权限：就是普通用户自己把 NFT 转给 0x…dEaD；机器人发奖前核对链上 Transfer→dEaD 记录，一枚只抵一次。钱包里没有就引导去市场买
    var DEAD = "0x000000000000000000000000000000000000dead";
    // 站长 2026-11-09：销毁界面也放到域名页铸造卡下方 → 抽成 html() + bind(root)，两个页面共用
    function burnHtml() { return '<div class="gs-act">' + HOW + '<button type="button" class="nm-go gs-off gs-on gs-burn">🔥 中奖的人点这里销毁领奖<small>没中奖的不用点</small></button><p class="gs-bwarn">⚠️ 风险提示：<b>中奖后再来烧，没中奖不要烧</b>。烧掉不退、不补偿，也不会因此多发奖。</p></div><div class="gs-burn-box"></div>'; }
    function bindBurn(root) {
      if (!root) return;
      root.querySelectorAll(".gs-burn").forEach(function (bb) {
        var box = bb.closest(".gs-act") && bb.closest(".gs-act").nextElementSibling;
        if (!box || !box.classList.contains("gs-burn-box")) return;
        bb.onclick = function () { burnFlow(bb, box); };
      });
    }
    A.genesisBurn = { html: burnHtml, bind: bindBurn, full: function (root) { render(root, false); } };
    // 🏆 大奖一键工具（站长 2026-11-10 定）：注册 K 个随机 .ailgns 名字（5 DAI/个，一次授权、钱包支持就一次确认发一串）→ 查 tokenId → 全部转进黑洞。
    //    注册打「批量注册」标记（2026-11-11 起费用和普通注册一样：30% 谷歌社交账号钱包、70% 每日奖池）。机器人下次来取名单时核对黑洞记录数 ≥ 需要数才发奖
    function jackpotPanel(box, jp, own, prim) {
      var nm = A.nm, acct = nm.account(), K = jp.need - (jp.bn || 0), price = jp.price || 5;
      // 🔥 钱包里已经有名字（先用批量注册注册好的）：直接烧已有的，不用再花钱注册。主名字不动；编号大的（新注册的）先烧
      var have = (own || []).filter(function (x) { return x && /^[0-9a-f]{64}$/.test(String(x.id || "")) && !/^0+$/.test(x.id) && x.label && x.label !== prim; }).sort(function (x, y) { return (y.no || 0) - (x.no || 0); });
      var pick = have.slice(0, K);
      if (pick.length) return ownBurnPanel(box, jp, pick, have.length, prim, K);
      box.innerHTML = '<div class="gs-jp"><b>🏆 你有待领大奖 ' + n(jp.amt) + ' DAI（' + Number(jp.ail || 0).toFixed(4) + ' AiLGNS）</b>' +
        '<p>领奖前要注册并销毁 <b>' + n(jp.need) + '</b> 个 .ailgns 名字（奖金 30% ÷ ' + price + ' DAI），已烧 <b>' + n(jp.bn || 0) + '</b> 个，还差 <b>' + n(K) + '</b> 个，约 <b>' + n(K * price) + ' DAI</b>。注册费和普通注册一样，70% 进每日奖池。</p>' +
        '<p class="muted">点下面一键完成：先授权 DAI，再一次确认注册一批，再一次确认全部转进黑洞（钱包不支持批量就逐个确认，有进度）。截止 ' + new Date(jp.due + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ") + '（北京时间）。</p>' +
        '<button type="button" class="nm-go gs-off gs-on gs-jpgo">⚡ 一键注册并销毁 ' + n(K) + ' 个名字（约 ' + n(K * price) + ' DAI）</button><p class="muted gs-jpst"></p></div>';
      var go = box.querySelector(".gs-jpgo"), st = box.querySelector(".gs-jpst"), say = function (t) { st.textContent = t || ""; };
      go.onclick = function () {
        if (!confirm("确认注册并销毁 " + K + " 个 .ailgns 名字（约 " + (K * price) + " DAI）吗？\n\n这些名字注册后会立刻转进黑洞地址，永久拿不回。")) return;
        go.disabled = true;
        var labels = [], chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < K; i++) { var s = "jp"; for (var k = 0; k < 8; k++) s += chars[Math.floor(Math.random() * chars.length)]; labels.push(s); }
        var regd = [], ids = [];
        function chunks(arr, size) { var out = []; for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
        function seqP(items, fn) { return items.reduce(function (p, it, i) { return p.then(function () { return fn(it, i); }); }, Promise.resolve()); }
        nm.prepay(K * price, "DAI", say).then(function () {
          // ① 注册：每 50 个一批，先试一次确认发一串，不行就逐个
          return seqP(chunks(labels, 50), function (grp, gi) {
            say("注册第 " + (gi * 50 + 1) + "–" + (gi * 50 + grp.length) + " / " + K + " 个，请在钱包确认");
            var calls = grp.map(function (l) { return { to: nm.NAMES(), data: nm.regData(l, 1, "DAI", acct) }; });
            return nm.sendCalls(calls, say).then(function (ok) { if (ok) { regd = regd.concat(grp); return; } return seqP(grp, function (l, i) { say("注册第 " + (gi * 50 + i + 1) + " / " + K + " 个：" + l + ".ailgns，请在钱包确认"); return nm.register(l, 1, "DAI", function () {}, acct).then(function () { regd.push(l); }, function (e) { if (/reject|denied|cancel|取消|拒绝/i.test(String(e && e.message))) throw e; }); }); }, function () { return seqP(grp, function (l) { return nm.register(l, 1, "DAI", function () {}, acct).then(function () { regd.push(l); }, function () {}); }); });
          });
        }).then(function () {
          if (!regd.length) throw new Error("一个都没注册成功，请检查 DAI 余额后重试");
          chunks(regd, 100).forEach(function (grp) { try { fetch("/api/batch-mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: acct, names: grp }) }); } catch (x) {} });
          say("已注册 " + regd.length + " 个，正在读取编号…");
          return Promise.all(regd.map(function (l) { return nm.idOf(l).then(function (id) { return id; }, function () { return null; }); }));
        }).then(function (got) {
          ids = got.filter(function (x) { return x && /^[0-9a-f]{64}$/.test(x) && !/^0+$/.test(x); });
          // ② 销毁：全部转进黑洞，每 50 个一批
          var done = 0;
          return seqP(chunks(ids, 50), function (grp, gi) {
            say("销毁第 " + (gi * 50 + 1) + "–" + (gi * 50 + grp.length) + " / " + ids.length + " 个，请在钱包确认");
            var calls = grp.map(function (id) { return { to: nm.NAMES(), data: "0x23b872dd" + A.pad(acct) + A.pad(DEAD) + id }; });
            return nm.sendCalls(calls, say).then(function (ok) { if (ok) { done += grp.length; return; } return seqP(grp, function (id, i) { return nm.tx(nm.NAMES(), "0x23b872dd" + A.pad(acct) + A.pad(DEAD) + id, say, "🔥 销毁第 " + (gi * 50 + i + 1) + " / " + ids.length + " 个名字，请在钱包确认").then(function () { done++; }); }); }, function () { return seqP(grp, function (id) { return nm.tx(nm.NAMES(), "0x23b872dd" + A.pad(acct) + A.pad(DEAD) + id, say, "🔥 销毁名字，请在钱包确认").then(function () { done++; }); }); });
          }).then(function () { return done; });
        }).then(function (done) {
          box.innerHTML = '<div class="gs-bdone"><b>✅ 已注册并销毁 ' + n(done) + ' 个名字</b><p>名字烧够后还有最后一步：到 DeBox 的 AiLGNS 社区发帖宣告中奖，把帖子链接交到<a href="#/oracle">预言家页</a>，团队核对后机器人把大奖 AiLGNS 发到这个钱包。</p>' + (done < K ? '<p class="muted">还差 ' + n(K - done) + ' 个没完成，再点一次销毁按钮继续。</p>' : "") + '<p><a href="#/scan/' + acct + '">📒 在账本里看这些销毁 ›</a></p></div>';
          try { fetch("/api/hit?e=jpburn", { method: "POST" }); } catch (x) {}
          setTimeout(loadBurns, 5000); setTimeout(loadBurns, 60000);
        }).catch(function (e) { go.disabled = false; say(""); if (e && e.message !== "已取消") A.errTip((e && e.message) || "没完成，请重试", go); });
      };
    }
    // 🤖 机器人代烧（站长 2026-11-14）：普通钱包烧上千个名字要点上千次。改成：授权一次（setApprovalForAll 给代注册机器人钱包）+ 签名一次，
    //    机器人（monita/burn_bot.py，每 5 分钟一轮）替他转进黑洞；烧完这里出「取消授权」。委托接口 /api/burn-order
    var REG = "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1";
    function burnText(k, keep, a, day) { return "AiLGNS 代销毁委托\n请机器人把我钱包里的 " + k + " 个 .ailgns 名字转进黑洞地址（永久销毁，拿不回来），用来领取预言家大奖。\n不动的名字：" + (keep ? keep + ".ailgns" : "无") + "\n我的地址：" + a + "\n日期：" + day; } // 和 functions/api/burn-order.js、monita/burn_bot.py 一字不差
    function approved(acct) { return A.wallet.rpcOn("anubis", "eth_call", [{ to: A.nm.NAMES(), data: "0xe985e9c5" + A.pad(acct) + A.pad(REG) }, "latest"]).then(function (r) { return /1$/.test(String(r || "")); }, function () { return false; }); }
    function botOrder(acct) { return fetch("/api/burn-order?a=" + acct, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return (j && j.order) || null; }, function () { return null; }); }
    // 授权还开着就给一个「取消授权」按钮（烧完、或者不想让机器人烧了，都点它）
    function revokeBtn(host, acct, tip) {
      if (!host) return;
      host.innerHTML = '<div class="gs-bot"><b>🔓 机器人的操作权还开着</b><p class="muted">' + tip + '</p><button type="button" class="nm-go gs-ghost gs-botoff">取消授权（钱包确认 1 次）</button><p class="muted gs-botst2"></p></div>';
      var b = host.querySelector(".gs-botoff"), st = host.querySelector(".gs-botst2");
      b.onclick = function () {
        b.disabled = true;
        A.nm.tx(A.nm.NAMES(), "0xa22cb465" + A.pad(REG) + "0".repeat(64), function (t) { st.textContent = t || ""; }, "取消机器人对你 .ailgns 名字的操作权，请在钱包确认").then(function () {
          host.innerHTML = '<div class="gs-bot"><b>✅ 已取消授权</b><p class="muted">机器人现在动不了你钱包里的任何名字。</p></div>';
        }, function (e) { b.disabled = false; st.textContent = ""; if (e && e.message !== "已取消") A.errTip((e && e.message) || "没完成，请重试", b); });
      };
    }
    function botPanel(host, jp, N, prim, acct, hideManual) {
      if (!host) return;
      var alive = function () { return document.body.contains(host); };
      function showRun(o) {
        hideManual(true);
        host.innerHTML = '<div class="gs-bot"><b>🤖 机器人正在替你烧：' + n(o.done || 0) + " / " + n(o.n) + '</b><p class="muted">每 5 分钟一轮，一轮几百个，全部烧完大约 10～20 分钟。这期间<b>不用再手点</b>，可以关掉页面，烧完会发站内信。' + (o.note ? "<br>" + esc(o.note) : "") + '</p><p class="muted gs-botst"></p></div>';
        setTimeout(function () { if (alive()) refresh(); }, 30000);
      }
      function showIdle(ap) {
        hideManual(false);
        host.innerHTML = '<div class="gs-bot"><b>🤖 嫌一个个点太累？授权一次，机器人替你烧</b>' +
          '<p class="muted">你只要在钱包确认 <b>1 次授权</b>、再 <b>签 1 次名</b>（签名不花钱）。之后机器人替你把这 ' + n(N) + ' 个名字转进黑洞，每 5 分钟一轮，大约 10～20 分钟烧完，Gas 我们出。' +
          '授权只管 .ailgns 名字，不碰你的 DAI 和别的币；' + (prim ? "主名字 <b>" + esc(prim) + ".ailgns</b> 不会动；" : "") + '烧完这里会出现「取消授权」按钮，记得点一下收回权限。</p>' +
          '<button type="button" class="nm-go gs-off gs-on gs-botgo">🤖 授权机器人代烧 ' + n(N) + ' 个名字</button><p class="muted gs-botst"></p>' + (ap ? '<div class="gs-botrv"></div>' : "") + "</div>";
        if (ap) revokeBtn(host.querySelector(".gs-botrv"), acct, "你之前授权过机器人。不想让机器人烧了，可以取消。");
        var go = host.querySelector(".gs-botgo"), st = host.querySelector(".gs-botst"), say = function (t) { st.textContent = t || ""; }, label = go.textContent;
        go.onclick = function () {
          if (go.getAttribute("data-sure") !== "1") {
            go.setAttribute("data-sure", "1"); go.textContent = "⚠️ 再点一次，确认让机器人烧 " + n(N) + " 个";
            say("机器人会把这 " + n(N) + " 个名字转进黑洞地址，永久拿不回来。确定的话，再点一次按钮。");
            setTimeout(function () { if (go.getAttribute("data-sure") === "1" && !go.disabled) { go.removeAttribute("data-sure"); go.textContent = label; say(""); } }, 15000);
            return;
          }
          go.disabled = true;
          var day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
          (ap ? Promise.resolve() : A.nm.tx(A.nm.NAMES(), "0xa22cb465" + A.pad(REG) + "0".repeat(63) + "1", say, "第 1 步：授权机器人操作你的 .ailgns 名字（只用来销毁），请在钱包确认")).then(function () {
            ap = true; say("第 2 步：请在钱包里签名委托（不花钱、不转账）");
            return A.nm.sign(burnText(N, prim, acct, day));
          }).then(function (sig) {
            say("正在提交委托…");
            return fetch("/api/burn-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: acct, n: N, keep: prim, day: day, sig: sig }) }).then(function (r) { return r.json(); });
          }).then(function (j) {
            if (!j || j.error) throw new Error((j && j.error) || "提交失败，请重试");
            showRun({ n: j.n || N, done: 0 });
          }).catch(function (e) { go.disabled = false; go.removeAttribute("data-sure"); go.textContent = label; say(ap ? "授权已经完成，只差签名委托：再点一次按钮接着做。" : ""); if (e && e.message !== "已取消") A.errTip((e && e.message) || "没完成，请重试", go); });
        };
      }
      function refresh() {
        Promise.all([botOrder(acct), approved(acct)]).then(function (r) {
          if (!alive()) return;
          var o = r[0], ap = r[1];
          if (o && o.state === "pending") return showRun(o);
          if (o && o.state === "done" && o.done >= o.n && Date.now() - (o.doneAt || 0) < 86400e3) { // 刚烧完：等网站核对（几分钟），先让他取消授权
            hideManual(true);
            host.innerHTML = '<div class="gs-bot"><b>✅ 机器人已烧完 ' + n(o.done) + ' 个名字</b><p class="muted">网站几分钟内核对完链上记录。接下来到 DeBox 的 AiLGNS 社区发帖宣告中奖，把帖子链接交到预言家页，团队核对后发奖。</p><a class="nm-go" href="#/oracle">👉 去预言家页交宣告帖</a><div class="gs-botrv"></div></div>';
            if (ap) revokeBtn(host.querySelector(".gs-botrv"), acct, "名字已经烧完，机器人用不着这个权限了，请点一下收回。");
            return;
          }
          showIdle(ap);
        });
      }
      refresh();
    }
    function ownBurnPanel(box, jp, pick, haveN, prim, K) {
      var nm = A.nm, acct = nm.account(), N = pick.length, label = "🔥 一键销毁钱包里的 " + n(N) + " 个名字";
      function chunks(arr, size) { var out = []; for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
      function seqP(items, fn) { return items.reduce(function (p, it, i) { return p.then(function () { return fn(it, i); }); }, Promise.resolve()); }
      box.innerHTML = '<div class="gs-jp"><b>🏆 你有待领大奖 ' + n(jp.amt) + ' DAI（' + Number(jp.ail || 0).toFixed(4) + ' AiLGNS）</b>' +
        '<p>领奖前要销毁 <b>' + n(jp.need) + '</b> 个 .ailgns 名字，已烧 <b>' + n(jp.bn || 0) + '</b> 个，还差 <b>' + n(K) + '</b> 个。</p>' +
        '<p>✅ 你钱包里已经有 <b>' + n(haveN) + '</b> 个名字可以烧' + (prim ? "（主名字 <b>" + esc(prim) + ".ailgns</b> 不会动）" : "") + '，<b>不用再花钱注册</b>。' + (N < K ? "烧完这 " + n(N) + " 个还差 " + n(K - N) + " 个，到时候这里会出现注册按钮。" : "") + '</p>' +
        '<details class="gs-jpl"><summary>看看要烧哪 ' + n(N) + ' 个（新注册的先烧）</summary><p>' + pick.map(function (x) { return esc(x.label); }).join("、") + '</p></details>' +
        '<button type="button" class="nm-go gs-off gs-on gs-jpburn">' + label + '</button>' +
        '<p class="muted">销毁 = 转进黑洞地址，<b>永久拿不回来</b>；不扣钱，只花一点 Gas（每个约 0.001 DAI）。钱包支持批量的，每 50 个确认一次；不支持的要一个一个确认，页面有进度，中途停了再点一次接着烧。截止 ' + new Date(jp.due + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ") + '（北京时间）。</p><p class="muted gs-jpst"></p><div class="gs-bothost"></div></div>';
      try { botPanel(box.querySelector(".gs-bothost"), jp, N, prim, acct, function (hide) { var b0 = box.querySelector(".gs-jpburn"); if (b0) b0.hidden = !!hide; }); } catch (eB) { /* 代烧面板出错不影响手动烧 */ }
      var bb = box.querySelector(".gs-jpburn"), st = box.querySelector(".gs-jpst"), say = function (t) { st.textContent = t || ""; };
      bb.onclick = function () {
        // 不用浏览器自带确认框（有的钱包浏览器不弹）：同一个按钮点两次
        if (bb.getAttribute("data-sure") !== "1") {
          bb.setAttribute("data-sure", "1"); bb.textContent = "⚠️ 再点一次，确认销毁 " + n(N) + " 个名字";
          say("这 " + n(N) + " 个名字会被转进黑洞地址，永久拿不回来。确定的话，再点一次按钮。");
          setTimeout(function () { if (bb.getAttribute("data-sure") === "1" && !bb.disabled) { bb.removeAttribute("data-sure"); bb.textContent = label; say(""); } }, 15000);
          return;
        }
        bb.disabled = true;
        var done = 0, fail = 0, stop = false;
        var dat = function (id) { return "0x23b872dd" + A.pad(acct) + A.pad(DEAD) + id; };
        var one = function (x, i) {
          if (stop) return;
          return nm.tx(nm.NAMES(), dat(x.id), say, "🔥 销毁第 " + (i + 1) + " / " + N + " 个：" + x.label + ".ailgns（已完成 " + done + " 个），请在钱包确认").then(function () { done++; },
            function (e) { if (/已取消|reject|denied|cancel|取消|拒绝/i.test(String(e && e.message))) stop = true; else fail++; }); /* 取消 = 停下；单个失败（比如刚烧过）跳过继续 */
        };
        seqP(chunks(pick, 50), function (grp, gi) {
          if (stop) return;
          var each = function () { return seqP(grp, function (x, i) { return one(x, gi * 50 + i); }); };
          say("销毁第 " + (gi * 50 + 1) + "–" + (gi * 50 + grp.length) + " / " + N + " 个，请在钱包确认");
          return nm.sendCalls(grp.map(function (x) { return { to: nm.NAMES(), data: dat(x.id) }; }), say).then(function (ok) { if (ok) { done += grp.length; return; } return each(); }, each);
        }).then(function () {
          box.innerHTML = '<div class="gs-bdone"><b>' + (done ? "✅ 已销毁 " + n(done) + " 个名字" : "还没有销毁") + '</b>' +
            (done >= K ? '<p>名字烧够了。还有最后一步：到 DeBox 的 AiLGNS 社区发帖宣告中奖，把帖子链接交到预言家页，团队核对后机器人发奖。</p><a class="nm-go" href="#/oracle">👉 去预言家页交宣告帖</a>'
              : '<p class="muted">还差 ' + n(K - done) + ' 个' + (fail ? "（有 " + fail + " 个没成功）" : "") + '。等 1 分钟，再点一次上面的销毁按钮接着烧。</p>') +
            '<p><a href="#/scan/' + acct + '">📒 在账本里看这些销毁 ›</a></p></div>';
          if (done) { try { fetch("/api/hit?e=jpburn", { method: "POST" }); } catch (x) {} setTimeout(loadBurns, 5000); setTimeout(loadBurns, 60000); }
        }).catch(function (e) { bb.disabled = false; bb.removeAttribute("data-sure"); bb.textContent = label; say(""); A.errTip((e && e.message) || "没完成，请重试", bb); });
      };
    }
    function burnFlow(btn, box) {
      if (!box) return;
      var nm = A.nm; if (!nm || !nm.owned) { box.innerHTML = '<p class="muted">域名模块还没加载好，刷新一下再试</p>'; return; }
      var say = function (x) { var el = box.querySelector(".gs-bst"); if (el) el.textContent = x || ""; };
      btn.disabled = true; box.innerHTML = '<p class="muted gs-bst">正在连接钱包…</p>';
      var acct;
      var jp = null, prim = ""; // 这个钱包有没有待领大奖（要烧奖金 30% 的名字）；prim = 主名字（一键销毁时不动它）
      nm.connect().then(function (a) {
        acct = a; say("正在读取 " + A.short(a) + " 钱包里的创世名…");
        return fetch("/api/oracle?a=" + a).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { var d = (j && j.me && j.me.burnDue) || []; prim = String((j && j.me && j.me.name) || "").replace(/\.ailgns$/, ""); jp = d.filter(function (x) { return x.need > 1 && x.bn < x.need; })[0] || null; }, function () {});
      }).then(function () {
        // 先走服务器快照接口（秒出，不读链）；接口不通再退回手机自己读链（慢）
        return fetch("/api/name-owned?a=" + acct).then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); })
          .then(function (j) { return (j.list || []).map(function (x) { return { t: "ailgns", id: x.id, label: x.label, no: x.no }; }); },
            function () { say("快照读不到，改为直接读链，会慢一点，请稍等…"); return nm.owned(acct); });
      }).then(function (all) {
        var list = (all || []).filter(function (x) { return x && x.no && x.t === "ailgns"; }).sort(function (x, y) { return x.no - y.no; });
        btn.disabled = false;
        if (jp) { jackpotPanel(box, jp, all, prim); return; }
        approved(acct).then(function (ap) { if (!ap || !document.body.contains(box)) return; var h = document.createElement("div"); box.insertBefore(h, box.firstChild); revokeBtn(h, acct, "你之前授权过机器人代烧名字。现在用不着了，请点一下收回权限。"); }, function () {}); // 🏆 大奖：走一键注册并销毁
        if (!list.length) {
          box.innerHTML = '<div class="gs-bnone"><b>😅 这个钱包（' + A.short(acct) + '）里没有创世名</b><p>去域名市场任意买一枚，买到后回到这页再点一次销毁按钮（刚买 / 刚注册的等 1 分钟再点）。</p>' +
            '<a class="nm-go gs-ghost" href="#/names">🛒 去域名市场买一枚</a><a class="nm-go gs-reg" href="#/names">🌟 还没铸满，也可以直接注册一枚</a>' +
            '<p class="muted">如果你的创世名在另一个钱包里，请切换到那个钱包再点销毁。</p></div>';
          return;
        }
        box.innerHTML = '<div class="gs-blist"><p><b>钱包 ' + A.short(acct) + '</b> 里有 <b>' + list.length + '</b> 枚创世名，选一枚销毁（编号越小越稀有，建议烧编号大的）：</p>' +
          list.map(function (x) { return '<div class="gs-bitem"><span><b>' + esc(x.label) + '.ailgns</b><small>🌟 创世域名 #' + n(x.no) + '</small></span><button type="button" class="gs-bpick" data-id="' + x.id + '" data-no="' + x.no + '" data-full="' + esc(x.label) + '.ailgns">🔥 销毁这枚</button></div>'; }).join("") +
          '<p class="muted">销毁 = 把它转进黑洞地址 0x…dEaD，<b>永久拿不回来</b>；只花一点 Gas，不扣钱。烧完机器人核对链上记录后发奖。</p><p class="muted gs-bst"></p></div>';
        box.querySelectorAll(".gs-bpick").forEach(function (b) {
          b.onclick = function () {
            var id = b.getAttribute("data-id"), no = b.getAttribute("data-no"), full = b.getAttribute("data-full");
            // 2026-11-12：不用浏览器自带的确认框（有的钱包浏览器不弹，客户点了没反应），改成同一个按钮点两次
            if (b.getAttribute("data-sure") !== "1") {
              box.querySelectorAll(".gs-bpick").forEach(function (x) { x.removeAttribute("data-sure"); x.textContent = "🔥 销毁这枚"; });
              b.setAttribute("data-sure", "1"); b.textContent = "⚠️ 再点一次，确认销毁";
              say("要销毁 " + full + "（创世 #" + no + "）：它会被转进黑洞地址，永久拿不回来，一枚只能抵一次奖。确定的话，再点一次那个按钮。");
              setTimeout(function () { if (b.getAttribute("data-sure") === "1" && !b.disabled) { b.removeAttribute("data-sure"); b.textContent = "🔥 销毁这枚"; say(""); } }, 15000);
              return;
            }
            b.removeAttribute("data-sure"); b.textContent = "🔥 销毁这枚";
            box.querySelectorAll(".gs-bpick").forEach(function (x) { x.disabled = true; });
            nm.tx(nm.NAMES(), "0x23b872dd" + A.pad(acct) + A.pad(DEAD) + id, say, "🔥 销毁 " + full + "（创世 #" + no + "）：转进黑洞地址，永久拿不回。请在钱包确认").then(function (h) {
              box.innerHTML = '<div class="gs-bdone"><b>✅ ' + esc(full) + '（创世 #' + n(no) + '）已销毁</b><p>机器人会核对这条链上记录，核对无误后发奖；奖金发到你中奖时用的钱包。</p>' +
                '<p><a href="#/scan/' + h + '">📒 在账本里看这笔销毁 ›</a></p><p class="muted">交易 ' + h.slice(0, 10) + '…' + h.slice(-6) + '。一枚只抵一次奖，下次中奖要再烧一枚。</p></div>';
              try { fetch("/api/hit?e=burn", { method: "POST" }); } catch (x) {}
              setTimeout(loadBurns, 5000); setTimeout(loadBurns, 60000);
            }, function (e) {
              box.querySelectorAll(".gs-bpick").forEach(function (x) { x.disabled = false; }); say("");
              if (e && e.message !== "已取消") A.errTip((e && e.message) || "销毁失败", b);
            });
          };
        });
      }).catch(function (e) { btn.disabled = false; box.innerHTML = ""; A.errTip((e && e.message) || "连接钱包失败", btn); });
    }
    function load() {
      var my = rid;
      fetch("/api/name-genesis").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
        if (my !== rid || !j) return;
        var got = Math.min(GENESIS, Number(j.n) || 0), left = Math.max(0, GENESIS - got), pct = Math.min(100, got / GENESIS * 100);
        var set = function (k, v) { var el = document.getElementById(k); if (el) el.textContent = v; };
        var fl = document.getElementById("gs-flip");
        if (fl && lastLeft !== left) { fl.innerHTML = flip(got); if (lastLeft !== null) { fl.classList.remove("gc-hit"); void fl.offsetWidth; fl.classList.add("gc-hit"); } lastLeft = left; }
        if (!left) { // 一万个全部铸满：没得注册了，只剩去市场买
          set("gs-cap", "🎉 10,000 枚创世名已全部铸造完成");
          set("gs-sub", "要领奖的只能去域名市场买一枚来烧");
          var reg = document.querySelector(".gs-reg"); if (reg) reg.hidden = true;
        } else { set("gs-sub", "每被注册 1 个，这里就跳 1 下 · 铸完永久没有（还能注册 " + n(left) + "）"); }
        set("gs-n", n(got)); set("gs-day", "+" + n(j.day)); set("gs-rest", n(left));
        stGot = got; paintStats();
        var f = document.getElementById("gs-fill"); if (f) f.style.width = pct.toFixed(2) + "%";
        var ul = document.getElementById("gs-recent");
        if (ul) ul.innerHTML = (j.recent || []).slice(0, 8).map(function (r) { return "<li><b>" + esc(r.nm) + ".ailgns</b><span>#" + n(r.no) + "</span><small>" + ago(r.ago) + "</small></li>"; }).join("") || '<li class="muted">暂无</li>';
      }).catch(function () {
        if (my !== rid) return;
        var el = document.getElementById("gs-sub"); if (el) el.textContent = "读取失败，稍后自动重试";
        var ul = document.getElementById("gs-recent"); if (ul) ul.innerHTML = '<li class="muted">读取失败</li>';
      });
    }
    A.pages.genesis = page;
  } catch (e) { try { console.warn("genesis.js", e); } catch (x) {} }
})();
