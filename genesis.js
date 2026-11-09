// 🔥 创世域名销毁倒计时 #/genesis（站长 2026-11-08 定）：创世名 1 万个注册满那天起，中奖领钱要先烧 1 枚创世名。
// 现在这页只做「倒计时 + 讲规则 + 引导去注册 / 去市场买」，销毁按钮注册满后才开放；数据走 /api/name-genesis（有缓存，秒开）
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
        '<section class="card gs-hero"><div class="gc-top"><h2>🔥 创世域名销毁倒计时</h2><span class="gc-live"><i></i>链上实时</span></div>' +
        '<p class="muted">创世名只有 <b>10,000</b> 个，注册满那天起，<b>中奖领钱要先烧掉 1 枚创世名</b>。现在还来得及先备一枚。</p>' +
        '<div class="gs-big"><small id="gs-cap">离 10,000 个注册满还差</small><div class="gc-flip" id="gs-flip">' + flip(0) + '</div><small id="gs-sub">每被注册 1 个，这里就跳 1 下 · 跳到 0 销毁活动开启</small></div>' +
        // 一边铸造、一边销毁：左边紫色是已铸出来的，右边火色是等着被烧的；中间进度条紫色吃掉火色
        '<div class="gs-duel"><div class="gs-mint"><small>🌟 已铸造</small><b id="gs-n">—</b><span>一边在铸</span></div><div class="gs-vs">VS</div><div class="gs-fire"><small>🔥 等待销毁</small><b id="gs-rest">—</b><span>铸满那天开烧</span></div></div>' +
        '<div class="gs-bar"><i id="gs-fill"></i></div>' +
        '<p class="gs-day">今天新铸 <b id="gs-day">—</b> 个 · 每铸 1 个，上面倒计时就跳 1 下</p>' +
        '<div class="gs-act"><a class="nm-go gs-reg" href="#/names">🌟 现在去注册创世名（5 DAI / 年起）</a><a class="nm-go gs-ghost" href="#/names">🛒 去域名市场买一枚创世名</a>' +
        '<button type="button" class="nm-go gs-off" disabled>🔥 销毁领奖：注册满 10,000 个后开放</button></div></section>' +
        '<section class="card gs-rule"><h3>📜 到时候的规则（大白话）</h3><ol>' +
        '<li><b>中奖要领钱，先烧 1 枚创世名。</b>烧 = 永久销毁，拿不回来；烧完机器人核对链上记录才发奖。</li>' +
        '<li><b>手里没有？</b>去域名市场买一枚，或者趁现在还没满直接注册一枚。编号跟着名字走，买来的也算。</li>' +
        '<li><b>一枚只能抵一次奖。</b>想多次领奖，就要多备几枚。</li>' +
        '<li><b>正式开始前会提前公告</b>，只对公告后的新一期有效；之前中的奖不受影响。</li></ol>' +
        '<p class="muted">说明：本页是预告，具体以正式公告为准。所有活动为社区自治、娱乐性质，参与请自行承担风险。</p></section>' +
        '<section class="card"><h3>🆕 刚刚注册的创世名</h3><ul class="gs-recent" id="gs-recent"><li class="muted">读取中…</li></ul></section>';
      load();
    }
    function load() {
      var my = rid;
      fetch("/api/name-genesis").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
        if (my !== rid || !j) return;
        var got = Math.min(GENESIS, Number(j.n) || 0), left = Math.max(0, GENESIS - got), pct = Math.min(100, got / GENESIS * 100);
        var set = function (k, v) { var el = document.getElementById(k); if (el) el.textContent = v; };
        var fl = document.getElementById("gs-flip");
        if (fl && lastLeft !== left) { fl.innerHTML = flip(left); if (lastLeft !== null) { fl.classList.remove("gc-hit"); void fl.offsetWidth; fl.classList.add("gc-hit"); } lastLeft = left; }
        if (!left) { // 一万个全部铸满：倒计时结束，销毁活动开启
          set("gs-cap", "🎉 10,000 枚创世名已全部铸造完成");
          set("gs-sub", "创世域名销毁活动正式开启：中奖领钱先烧 1 枚创世名");
          var off = document.querySelector(".gs-off"); if (off) { off.textContent = "🔥 销毁创世名领奖（功能开通中，请看公告）"; off.classList.add("gs-on"); }
          var h = document.querySelector(".gs-hero h2"); if (h) h.textContent = "🔥 创世域名销毁活动已开启";
          var reg = document.querySelector(".gs-reg"); if (reg) reg.hidden = true; // 铸满了，没得注册，只剩去市场买
        } else { set("gs-sub", "每被注册 1 个，这里就跳 1 下 · 跳到 0 销毁活动开启（已注册 " + n(got) + "）"); }
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
