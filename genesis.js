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
    var rid = 0, timer = null, lastLeft = null;
    function flip(n) { // 翻牌数字：和域名页创世卡同款（.gc-d），不足 4 位补 0
      var str = String(Math.max(0, n | 0)).padStart(4, "0");
      return str.split("").map(function (d, i) { return (str.length - i === 3 && i ? '<em class="gc-sep">,</em>' : "") + '<span class="gc-d">' + d + "</span>"; }).join("");
    }
    function page(id) {
      rid = id; lastLeft = null;
      clearInterval(timer); timer = setInterval(function () { if (location.hash.indexOf("#/genesis") !== 0) { clearInterval(timer); return; } load(); }, 15000); // 接口缓存 15 秒，跟着刷
      A.app.innerHTML =
        '<section class="card gs-hero"><div class="gc-top"><h2>🔥 创世域名销毁进行中</h2><span class="gc-live"><i></i>链上实时</span></div>' +
        '<p class="muted"><b>中奖领钱的人，必须先销毁 1 枚创世名。</b>烧自己手里的，或去域名市场任意买一枚来烧都行。<b>中奖后 3 天内不销毁，视为放弃领奖。</b></p>' +
        '<div class="gs-big"><small id="gs-cap">已铸造的创世名（限量 10,000）</small><div class="gc-flip" id="gs-flip">' + flip(0) + '</div><small id="gs-sub">每被注册 1 个，这里就跳 1 下 · 铸完永久没有</small></div>' +
        // 一边铸造、一边销毁：左边紫色是已铸出来的，右边火色是等着被烧的；中间进度条紫色吃掉火色
        '<div class="gs-duel"><div class="gs-mint"><small>🌟 已铸造</small><b id="gs-n">—</b><span>一边在铸</span></div><div class="gs-vs">VS</div><div class="gs-fire"><small>🔥 还能注册</small><b id="gs-rest">—</b><span>铸完只能去市场买</span></div></div>' +
        '<div class="gs-bar"><i id="gs-fill"></i></div>' +
        '<p class="gs-day">今天新铸 <b id="gs-day">—</b> 个 · 中奖要领钱的，手里先备一枚</p>' +
        '<div class="gs-act"><a class="nm-go gs-reg" href="#/names">🌟 现在去注册创世名（5 DAI / 年起）</a><a class="nm-go gs-ghost" href="#/names">🛒 去域名市场买一枚来烧</a>' +
        '<button type="button" class="nm-go gs-off gs-on" id="gs-burn">🔥 我中奖了 · 销毁 1 枚创世名领奖</button></div><div id="gs-burn-box"></div></section>' +
        '<section class="card gs-rule"><h3>📜 规则（大白话）</h3><ol>' +
        '<li><b>中奖要领钱，先烧 1 枚创世名。</b>烧 = 永久销毁，拿不回来；烧完机器人核对链上记录才发奖。</li>' +
        '<li><b>烧哪一枚都行。</b>自己手里的，或者去域名市场任意买一枚来烧；没满之前也可以直接注册一枚。编号跟着名字走，买来的也算。</li>' +
        '<li><b>一枚只能抵一次奖。</b>想多次领奖，就要多备几枚。</li>' +
        '<li><b>中奖后 3 天内不销毁，视为放弃领奖。</b>从中奖通知发出算起，过期不补发。</li>' +
        '<li><b>怎么烧：</b>点上面「销毁 1 枚创世名领奖」→ 连钱包 → 选一枚 → 钱包里确认。销毁就是转进黑洞地址，只花一点 Gas。</li></ol>' +
        '<p class="muted">说明：所有活动为社区自治、娱乐性质，参与请自行承担风险。</p></section>' +
        '<section class="card"><h3>🆕 刚刚注册的创世名</h3><ul class="gs-recent" id="gs-recent"><li class="muted">读取中…</li></ul></section>';
      var bb = document.getElementById("gs-burn"); if (bb) bb.onclick = function () { burnFlow(bb); };
      load();
    }

    // 🔥 销毁领奖（站长 2026-11-09 定）：连钱包 → 列出钱包里的创世 .ailgns 名 → 选一枚 → 用 ERC721 transferFrom 转进黑洞地址（永久拿不回）
    // 不碰合约、不加权限：就是普通用户自己把 NFT 转给 0x…dEaD；机器人发奖前核对链上 Transfer→dEaD 记录，一枚只抵一次。钱包里没有就引导去市场买
    var DEAD = "0x000000000000000000000000000000000000dead";
    function burnFlow(btn) {
      var box = document.getElementById("gs-burn-box"); if (!box) return;
      var nm = A.nm; if (!nm || !nm.owned) { box.innerHTML = '<p class="muted">域名模块还没加载好，刷新一下再试</p>'; return; }
      var say = function (x) { var el = box.querySelector(".gs-bst"); if (el) el.textContent = x || ""; };
      btn.disabled = true; box.innerHTML = '<p class="muted gs-bst">正在连接钱包…</p>';
      var acct;
      nm.connect().then(function (a) {
        acct = a; say("正在读取 " + A.short(a) + " 钱包里的创世名…（第一次要读链上记录，稍等几秒）");
        return nm.owned(a);
      }).then(function (all) {
        var list = (all || []).filter(function (x) { return x && x.no && x.t === "ailgns"; }).sort(function (x, y) { return x.no - y.no; });
        btn.disabled = false;
        if (!list.length) {
          box.innerHTML = '<div class="gs-bnone"><b>😅 这个钱包（' + A.short(acct) + '）里没有创世名</b><p>去域名市场任意买一枚，买到后回到这页再点一次销毁按钮。</p>' +
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
            if (!confirm("确认销毁 " + full + "（创世 #" + no + "）吗？\n\n它会被转进黑洞地址，永久拿不回来。\n一枚只能抵一次奖。")) return;
            box.querySelectorAll(".gs-bpick").forEach(function (x) { x.disabled = true; });
            nm.tx(nm.NAMES(), "0x23b872dd" + A.pad(acct) + A.pad(DEAD) + id, say, "🔥 销毁 " + full + "（创世 #" + no + "）：转进黑洞地址，永久拿不回。请在钱包确认").then(function (h) {
              box.innerHTML = '<div class="gs-bdone"><b>✅ ' + esc(full) + '（创世 #' + n(no) + '）已销毁</b><p>机器人会核对这条链上记录，核对无误后发奖；奖金发到你中奖时用的钱包。</p>' +
                '<p><a href="#/scan/' + h + '">📒 在账本里看这笔销毁 ›</a></p><p class="muted">交易 ' + h.slice(0, 10) + '…' + h.slice(-6) + '。一枚只抵一次奖，下次中奖要再烧一枚。</p></div>';
              try { fetch("/api/hit?e=burn", { method: "POST" }); } catch (x) {}
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
