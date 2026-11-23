// 左侧抽屉菜单（仿 awakehelix.io 官方菜单）：顶部只留「AiLGNS OTC」「会员」，其它栏目收进这里
// 分组可折叠，当前页面所在的分组默认展开；搜索框按名字过滤
(function () {
  "use strict";

  var A = window.AIL;
  var ICON = {
    otc: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
    chain: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
    member: '<path d="M4 17h16l-1.6-8.5-4.4 3.3L12 6l-2 5.8-4.4-3.3z"/><path d="M5 20h14"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>',
    team: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.2c2.4.2 4 1.8 4.6 4.8"/>',
    growth: '<path d="M4 19h16"/><path d="M5 15l4.5-4.5 3.5 3 6-6.5"/><path d="M14.5 7H19v4.5"/>',
    tree: '<rect x="9" y="3" width="6" height="4.5" rx="1.2"/><rect x="3" y="16" width="6" height="4.5" rx="1.2"/><rect x="15" y="16" width="6" height="4.5" rx="1.2"/><path d="M12 7.5V12M6 16v-2.5h12V16"/>',
    upline: '<path d="M12 21V8"/><path d="M7 12.5L12 7.5l5 5"/><circle cx="12" cy="4" r="1.6"/>',
    fire: '<path d="M12 21c4 0 6.5-2.6 6.5-6.3 0-3.6-2.6-5.6-3.6-8.7-1.6 1.6-2 3.3-2 4.6C11.5 8.7 10 6 10.4 3 6.8 5.4 5.5 9.6 5.5 14.7 5.5 18.4 8 21 12 21z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    flow: '<path d="M4 19h16"/><rect x="6" y="11" width="3" height="6" rx="1"/><rect x="11" y="7" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="13" rx="1"/>',
    promo: '<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
    custom: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    app: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    chat: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    /* 「交易」组每项一个专属线条图标（站长 2026-11-19：名字前面的彩色表情丑，去掉，统一成线条） */
    bridge: '<path d="M3 17h18"/><path d="M6 17V7M18 17V7"/><path d="M6 8c2.6 4.6 9.4 4.6 12 0"/><path d="M9.5 11.2V17M12 11.9V17M14.5 11.2V17"/>',
    bolt: '<path d="M13 3L5.5 13.5H11L10 21l8.5-11H13z"/>',
    swap: '<path d="M4.5 10a7.8 7.8 0 0 1 14-3.2"/><path d="M19 3v4h-4"/><path d="M19.5 14a7.8 7.8 0 0 1-14 3.2"/><path d="M5 21v-4h4"/>',
    drop: '<path d="M12 3.5c3.3 3.9 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.2-6.1 5.5-10z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>',
    candle: '<path d="M7.5 4v3M7.5 15v5"/><rect x="5.5" y="7" width="4" height="8" rx="1"/><path d="M16.5 4v5M16.5 15v5"/><rect x="14.5" y="9" width="4" height="6" rx="1"/>'
  };
  // [分组名, 英文, [[链接, 名字, 图标, 是否外链]]]
  // 站长定（2026-11-05）：顶部导航已有的（OTC、域名、预言家、借贷、会员、荣耀榜）不在菜单里重复；以后的新功能都先加在这里
  // 分组按「币圈玩法在前、服务在中、游戏在后」排；以后上百个功能都往对应分组里加，分组标题下只列前几个
  var GROUPS = [
    ["交易", "TRADE", [["#/usdt", "USDT 跨链桥（试运行）", "bridge"], ["#/fast", "极速预言家（试运行）", "bolt"], ["#/aiswap", "aiswap 兑换池（试运行）", "swap"], ["#/aiswap/launch", "一键发币（试运行）", "bolt"], ["#/lp", "做市商（✅ 认证称号）", "drop"], ["#/trade", "交易所盘口（专业版）", "candle"]]], // 站长 2026-11-11：订单查询从这组撤下（页面顶部「查我的订单」和「链上身份 → 账本」都能查）；金融类新功能都先放这组试运行，冷启动、不宣传。资金流向 2026-11-09 从菜单撤下（页面 #/flows 还在，站长：交易组留给区块链底层玩法冷启动）
    ["链上身份", "ON-CHAIN", [["#/bonus", "🎁 创世域名分红 · 每日签到", "promo"], ["#/genesis", "🔥 创世域名销毁进行中", "fire"], ["#/inbox", "🔔 收件箱", "bell"], ["#/scan", "📒 AiLGNS 账本", "wallet"], ["#/scan", "💬 链上留言（在账本里）", "chat"], ["#/square", "🏛️ 链上广场（盖楼 · 时间胶囊 · 挂单帖）", "chat"]]],
    ["销毁乐园（游戏）", "PLAY", [["#/farm", "🏡 开心农场", "fire"], ["#/mj", "🀄 血流成河麻将（试玩）", "grid"], ["#/br", "🐺 大逃杀（试运行）", "fire"], ["#/gd", "🃏 掼蛋（单机 · 联机）", "grid"]]],
    ["服务", "SUPPORT", [["#/feedback", "📮 问题反馈", "chat"], ["#/updates", "🆕 更新日志", "promo"], ["#/app", "📲 下载 App", "app"], ["#group", "💬 加 OTC 交流群（二维码）", "chat"], ["#/custom", "私人定制 · 商户合作", "custom"], ["#/promo", "营销广告", "promo"]]],
  ];
  // 🎮 游戏按最近 7 天打开次数排序（站长 2026-11-08：玩得最多的放上面，顺便知道哪个最火）；接口读不到就保持默认顺序
  // 站长 2026-11-11：开心农场、血流成河麻将固定在最上面，其它游戏收进「其它小游戏」，点一下再展开
  var GAME_GROUP = GROUPS.filter(function (g) { return g[1] === "PLAY"; })[0], gameHot = {}, PIN = { "#/farm": 4, "#/mj": 3, "#/br": 2, "#/gd": 1 }, moreOpen = false;
  function sortGames(counts) {
    if (!GAME_GROUP || !counts) return;
    gameHot = counts;
    var any = GAME_GROUP[2].some(function (it) { return counts[it[0].slice(2)] > 0; });
    if (!any) return; // 还没有数据就保持默认顺序
    GAME_GROUP[2].sort(function (a, b) { return (PIN[b[0]] || 0) - (PIN[a[0]] || 0) || (counts[b[0].slice(2)] || 0) - (counts[a[0].slice(2)] || 0); }); // 置顶的几个（站长调研的游戏，按 PIN 从大到小）在前，其余多的在前，相同的保持原顺序
  }
  try { fetch("/api/games-top").then(function (r) { return r.json(); }).then(function (j) { if (j && j.counts) sortGames(j.counts); }).catch(function () {}); } catch (e) {}
  function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + "</svg>"; }
  // 站长 2026-11-19：菜单里的线条图标和名字前面的彩色表情都嫌丑，整个菜单改成纯文字。想换回带图标的，把 PLAIN 改成 false 就行（图标和表情都还在上面的清单里）
  var PLAIN = true;
  function ico(k) { return PLAIN ? "" : svg(k); }
  function txt(s) { return PLAIN ? String(s).replace(/^[^0-9A-Za-z\u4e00-\u9fff（(]+\s*/, "") : s; } // 去掉名字最前面的表情，名字中间的（比如 ✅ 认证称号）不动
  var CHEV = '<svg class="dw-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  // 当前页面对应哪一项：完整路由先匹配（#/otc/lgns），再按第一段匹配（#/member/0x… → 会员中心）
  function current() {
    var parts = location.hash.replace(/^#\/?/, "").split("/"), full = "#/" + parts.slice(0, 2).join("/"), first = "#/" + (parts[0] || "otc");
    var all = [];
    GROUPS.forEach(function (g) { g[2].forEach(function (it) { all.push(it[0]); }); });
    return all.indexOf(full) >= 0 ? full : first;
  }

  var dw = document.createElement("div");
  dw.className = "dw";
  dw.hidden = true;
  dw.innerHTML = '<div class="dw-mask" data-close></div><aside class="dw-panel" role="dialog" aria-modal="true" aria-label="菜单">' +
    '<div class="dw-head"><div class="dw-top"><img class="hx-logo" src="icons/helix-logo.svg?v=1" alt="HELIX Protocol" width="119" height="40"><button type="button" class="dw-x" data-close aria-label="关闭菜单"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<button type="button" class="dw-wallet" id="dw-wallet"><span class="dw-wi">' + svg("wallet") + '</span><b id="dw-wt">连接钱包</b>' + CHEV + "</button>" +
    '</div>' + // 站长 2026-11-08：头部到这里结束（以前没关上，列表被包进头部撑出屏幕，菜单滑不动）
    '<div class="dw-body" id="dw-body"></div>' +
    '<p class="dw-foot">AWAKE HELIX 官方认证 AiLGNS OTC 服务站</p></aside>';
  document.body.appendChild(dw);
  try { /* 🌐 右上角的小按钮（站长 2026-11-20：夜间模式和语言切换放在「更多」里太占地方，挪到上面做成一个小按钮）。
     点开是一个小浮层：夜间模式开关 + 简体 / 繁體 / English。出错不能连累菜单 */
    var sb = document.getElementById("tset-btn"), tin = document.querySelector(".top-in");
    if (sb && tin) {
      var hasN = !!(window.AIL_NIGHT_OK && window.AIL_NIGHT_SET), hasL = !!window.AIL_LANG_SET, lcur = window.AIL_LANG || "zh";
      if (!hasN && !hasL) sb.hidden = true;
      var pop = document.createElement("div"); pop.className = "tset-pop"; pop.id = "tset-pop"; pop.hidden = true;
      pop.innerHTML = (hasN ? '<button type="button" class="tset-night" id="tset-night"><b data-night-lb>🌙 夜间模式</b></button>' : "") +
        (hasL ? '<div class="tset-lang" data-nolang role="group" aria-label="Language"><button type="button" data-lang="zh">简体</button><button type="button" data-lang="hant">繁體</button><button type="button" data-lang="en">English</button><button type="button" data-lang="ko">한국어</button></div>' : "");
      tin.appendChild(pop);
      sb.onclick = function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; sb.setAttribute("aria-expanded", pop.hidden ? "false" : "true"); };
      document.addEventListener("click", function (e) { if (!pop.hidden && !pop.contains(e.target) && !sb.contains(e.target)) { pop.hidden = true; sb.setAttribute("aria-expanded", "false"); } });
      window.addEventListener("hashchange", function () { pop.hidden = true; });
      var nb2 = document.getElementById("tset-night");
      if (nb2) { nb2.onclick = function () { try { window.AIL_NIGHT_SET(!window.AIL_NIGHT_ON()); } catch (e2) { /* 切不了就算了 */ } }; if (window.AIL_NIGHT_PAINT) window.AIL_NIGHT_PAINT(); }
      Array.prototype.forEach.call(pop.querySelectorAll("[data-lang]"), function (b) {
        if (b.getAttribute("data-lang") === lcur) { b.className = "on"; b.setAttribute("aria-pressed", "true"); }
        // 点了马上有反应：按钮先变成「…」，再去切（切换要重新打开页面，英文词典比较大，手机上要等一两秒）
        b.onclick = function () { if (b.className === "on") { pop.hidden = true; return; } b.textContent = "…"; try { window.AIL_LANG_SET(b.getAttribute("data-lang")); } catch (e3) { /* 切不了就算了 */ } };
      });
    }
  } catch (e1) { /* 没有这个按钮不影响别的 */ }
  var body = document.getElementById("dw-body"), open = {};

  // ===== 宫格菜单（站长 2026-11-19：照支付宝那种功能宫格做——灰底白块、四列、一格一个彩色图标 + 短名字、不折叠全摊开）=====
  // 想换回折叠列表，把 GRID 改成 false。图标是 Tabler Icons 的线条图标（MIT 许可，只取了路径数据），画在彩色圆角方块上。
  var GRID = true;
  var GICON = {
    "apps": '<path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 7l6 0"/><path d="M17 4l0 6"/>',
    "arrows-exchange": '<path d="M7 10h14l-4 -4"/><path d="M17 14h-14l4 4"/>',
    "bell": '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/>',
    "bolt": '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>',
    "rocket": '<path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3"/><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3"/><path d="M15 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    "bomb": '<path d="M15.349 5.349l3.301 3.301a1.2 1.2 0 0 1 0 1.698l-.972 .972a7.5 7.5 0 1 1 -5 -5l.972 -.972a1.2 1.2 0 0 1 1.698 0z"/><path d="M17 7l1.293 -1.293a2.414 2.414 0 0 0 .707 -1.707a1 1 0 0 1 1 -1h1"/><path d="M7 13a3 3 0 0 1 3 -3"/>',
    "book-2": '<path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12z"/><path d="M19 16h-12a2 2 0 0 0 -2 2"/><path d="M9 8h6"/>',
    "briefcase": '<path d="M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/><path d="M12 12l0 .01"/><path d="M3 13a20 20 0 0 0 18 0"/>',
    "building-bridge": '<path d="M6 5l0 14"/><path d="M18 5l0 14"/><path d="M2 15l20 0"/><path d="M3 8a7.5 7.5 0 0 0 3 -2a6.5 6.5 0 0 0 12 0a7.5 7.5 0 0 0 3 2"/><path d="M12 10l0 5"/>',
    "building-community": '<path d="M8 9l5 5v7h-5v-4m0 4h-5v-7l5 -5m1 1v-6a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v17h-8"/><path d="M13 7l0 .01"/><path d="M17 7l0 .01"/><path d="M17 11l0 .01"/><path d="M17 15l0 .01"/>',
    "cat": '<path d="M20 3v10a8 8 0 1 1 -16 0v-10l3.432 3.432a7.963 7.963 0 0 1 4.568 -1.432c1.769 0 3.403 .574 4.728 1.546l3.272 -3.546z"/><path d="M2 16h5l-4 4"/><path d="M22 16h-5l4 4"/><path d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M9 11v.01"/><path d="M15 11v.01"/>',
    "chart-candle": '<path d="M4 6m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/><path d="M6 4l0 2"/><path d="M6 11l0 9"/><path d="M10 14m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/><path d="M12 4l0 10"/><path d="M12 19l0 1"/><path d="M16 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/><path d="M18 4l0 1"/><path d="M18 11l0 9"/>',
    "device-gamepad-2": '<path d="M12 5h3.5a5 5 0 0 1 0 10h-5.5l-4.015 4.227a2.3 2.3 0 0 1 -3.923 -2.035l1.634 -8.173a5 5 0 0 1 4.904 -4.019h3.4z"/><path d="M14 15l4.07 4.284a2.3 2.3 0 0 0 3.925 -2.023l-1.6 -8.232"/><path d="M8 9v2"/><path d="M7 10h2"/><path d="M14 10h2"/>',
    "device-mobile": '<path d="M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14z"/><path d="M11 4h2"/><path d="M12 17v.01"/>',
    "dice-5": '<path d="M3 3m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/>',
    "dna-2": '<path d="M17 3v1c-.01 3.352 -1.68 6.023 -5.008 8.014c-3.328 1.99 3.336 -2 .008 -.014c-3.328 1.99 -5 4.662 -5.008 8.014v1"/><path d="M17 21.014v-1c-.01 -3.352 -1.68 -6.023 -5.008 -8.014c-3.328 -1.99 3.336 2 .008 .014c-3.328 -1.991 -5 -4.662 -5.008 -8.014v-1"/><path d="M7 4h10"/><path d="M7 20h10"/><path d="M8 8h8"/><path d="M8 16h8"/>',
    "dots": '<path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    "droplet": '<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z"/>',
    "feather": '<path d="M4 20l10 -10m0 -5v5h5m-9 -1v5h5m-9 -1v5h5m-5 -5l4 -4l4 -4"/><path d="M19 10c.638 -.636 1 -1.515 1 -2.486a3.515 3.515 0 0 0 -3.517 -3.514c-.97 0 -1.847 .367 -2.483 1m-3 13l4 -4l4 -4"/>',
    "flame": '<path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"/>',
    "gift": '<path d="M3 8m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z"/><path d="M12 8l0 13"/><path d="M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5"/>',
    "grid-dots": '<path d="M5 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M19 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M5 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M19 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    "message-2": '<path d="M8 9h8"/><path d="M8 13h6"/><path d="M9 18h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-3l-3 3l-3 -3z"/>',
    "message-report": '<path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"/><path d="M12 8v3"/><path d="M12 14v.01"/>',
    "news": '<path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/><path d="M8 8l4 0"/><path d="M8 12l4 0"/><path d="M8 16l4 0"/>',
    "numbers": '<path d="M8 10v-7l-2 2"/><path d="M6 16a2 2 0 1 1 4 0c0 .591 -.601 1.46 -1 2l-3 3h4"/><path d="M15 14a2 2 0 1 0 2 -2a2 2 0 1 0 -2 -2"/><path d="M6.5 10h3"/>',
    "paw": '<path d="M14.7 13.5c-1.1 -2 -1.441 -2.5 -2.7 -2.5c-1.259 0 -1.736 .755 -2.836 2.747c-.942 1.703 -2.846 1.845 -3.321 3.291c-.097 .265 -.145 .677 -.143 .962c0 1.176 .787 2 1.8 2c1.259 0 3 -1 4.5 -1s3.241 1 4.5 1c1.013 0 1.8 -.823 1.8 -2c0 -.285 -.049 -.697 -.146 -.962c-.475 -1.451 -2.512 -1.835 -3.454 -3.538z"/><path d="M20.188 8.082a1.039 1.039 0 0 0 -.406 -.082h-.015c-.735 .012 -1.56 .75 -1.993 1.866c-.519 1.335 -.28 2.7 .538 3.052c.129 .055 .267 .082 .406 .082c.739 0 1.575 -.742 2.011 -1.866c.516 -1.335 .273 -2.7 -.54 -3.052z"/><path d="M9.474 9c.055 0 .109 0 .163 -.011c.944 -.128 1.533 -1.346 1.32 -2.722c-.203 -1.297 -1.047 -2.267 -1.932 -2.267c-.055 0 -.109 0 -.163 .011c-.944 .128 -1.533 1.346 -1.32 2.722c.204 1.293 1.048 2.267 1.933 2.267z"/><path d="M16.456 6.733c.214 -1.376 -.375 -2.594 -1.32 -2.722a1.164 1.164 0 0 0 -.162 -.011c-.885 0 -1.728 .97 -1.93 2.267c-.214 1.376 .375 2.594 1.32 2.722c.054 .007 .108 .011 .162 .011c.885 0 1.73 -.974 1.93 -2.267z"/><path d="M5.69 12.918c.816 -.352 1.054 -1.719 .536 -3.052c-.436 -1.124 -1.271 -1.866 -2.009 -1.866c-.14 0 -.277 .027 -.407 .082c-.816 .352 -1.054 1.719 -.536 3.052c.436 1.124 1.271 1.866 2.009 1.866c.14 0 .277 -.027 .407 -.082z"/>',
    "plant-2": '<path d="M2 9a10 10 0 1 0 20 0"/><path d="M12 19a10 10 0 0 1 10 -10"/><path d="M2 9a10 10 0 0 1 10 10"/><path d="M12 4a9.7 9.7 0 0 1 2.99 7.5"/><path d="M9.01 11.5a9.7 9.7 0 0 1 2.99 -7.5"/>',
    "play-card": '<path d="M19 5v14a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2z"/><path d="M8 6h.01"/><path d="M16 18h.01"/><path d="M12 16l-3 -4l3 -4l3 4z"/>',
    "puzzle": '<path d="M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1"/>',
    "route": '<path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z"/><path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5"/>',
    "speakerphone": '<path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/><path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/>',
    "layout-grid": '<path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/>',
    "chart-area-line": '<path d="M4 19l4 -6l4 2l4 -5l4 4l0 5l-16 0"/><path d="M4 12l3 -4l4 2l5 -6l4 4"/>',
    "users": '<path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
    "wall": '<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M4 8h16"/><path d="M20 12h-16"/><path d="M4 16h16"/><path d="M9 4v4"/><path d="M14 8v4"/><path d="M8 12v4"/><path d="M16 12v4"/><path d="M11 16v4"/>'
  };
  // 菜单里的完整名字 → [格子里的短名, 图标, 颜色, 高亮角标（可不填）]。新加菜单项时在这里补一行；没补的会用名字前几个字 + 通用图标，不会报错
  // 高亮角标：填了就在图标上方显示一条红色小标签，代替「试」。跨链桥的「0手续费」是站长 2026-11-19 要的：让客户一眼知道我们不收费
  var GMETA = {
    "USDT 跨链桥（试运行）": ["跨链桥", "building-bridge", "b", "0手续费"],
    "极速预言家（试运行）": ["极速预言", "bolt", "o", "10分钟一期"], /* 站长 2026-11-20：角标「试」改成「10分钟一期」 */
    "aiswap 兑换池（试运行）": ["aiswap", "arrows-exchange", "c"],
    "一键发币（试运行）": ["一键发币", "rocket", "o"], /* 站长 2026-11-23：团队长一键发币 */
    "做市商（✅ 认证称号）": ["做市商", "droplet", "g"],
    "交易所盘口（专业版）": ["盘口", "chart-area-line", "r"],
    "🎁 创世域名分红 · 每日签到": ["签到分红", "gift", "r"],
    "🔥 创世域名销毁进行中": ["创世销毁", "flame", "o"],
    "🔔 收件箱": ["收件箱", "bell", "y"],
    "📒 AiLGNS 账本": ["账本", "book-2", "b"],
    "💬 链上留言（在账本里）": ["链上留言", "message-2", "g"],
    "🏛️ 链上广场（盖楼 · 时间胶囊 · 挂单帖）": ["链上广场", "building-community", "p"],
    "🏡 开心农场": ["开心农场", "plant-2", "g"],
    "🀄 血流成河麻将（试玩）": ["麻将", "layout-grid", "r"],
    "🐺 大逃杀（试运行）": ["大逃杀", "paw", "p"],
    "🃏 掼蛋（单机 · 联机）": ["掼蛋", "play-card", "b"],
    "销毁乐园": ["销毁乐园", "device-gamepad-2", "o"],
    "LGNS 像素墙": ["像素墙", "grid-dots", "c"],
    "2048": ["2048", "numbers", "y"],
    "贪吃蛇": ["贪吃蛇", "route", "g"],
    "俄罗斯方块": ["方块", "puzzle", "b"],
    "飞翔小鸟": ["飞翔小鸟", "feather", "c"],
    "扫雷": ["扫雷", "bomb", "r"],
    "打砖块": ["打砖块", "wall", "o"],
    "DNA 合成": ["DNA 合成", "dna-2", "p"],
    "HELIX 宠物": ["宠物", "cat", "k"],
    "📮 问题反馈": ["问题反馈", "message-report", "b"],
    "🆕 更新日志": ["更新日志", "news", "g"],
    "📲 下载 App": ["下载 App", "device-mobile", "p"],
    "💬 加 OTC 交流群（二维码）": ["交流群", "users", "c"],
    "私人定制 · 商户合作": ["商户合作", "briefcase", "y"],
    "营销广告": ["营销广告", "speakerphone", "r"]
  };
  function gsvg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (GICON[k] || GICON.apps) + "</svg>"; }
  function tile(it, cur) {
    var m = GMETA[it[1]] || [String(it[1]).replace(/^[^0-9A-Za-z\u4e00-\u9fff（(]+\s*/, "").replace(/（.*?）/g, "").slice(0, 6), "apps", "b"];
    var trial = /试运行|试玩/.test(it[1]);
    return '<a class="dg-i' + (it[0] === cur ? " on" : "") + '" href="' + (it[0] === "#group" ? "#" : it[0]) + '"' + (it[0] === "#group" ? " data-group" : "") + (it[3] ? ' target="_blank" rel="noopener"' : "") + ' title="' + String(it[1]).replace(/"/g, "&quot;") + '"><span class="dg-t dgc-' + m[2] + '">' + gsvg(m[1]) + (m[3] ? '<em class="hot">' + m[3] + "</em>" : trial ? "<em>试</em>" : "") + "</span><b>" + m[0] + "</b></a>";
  }
  function drawGrid(cur) {
    return GROUPS.map(function (g) {
      var items = g[2], cells;
      if (g !== GAME_GROUP) cells = items.map(function (it) { return tile(it, cur); }).join("");
      else {
        var top = items.filter(function (it) { return PIN[it[0]]; }), rest = items.filter(function (it) { return !PIN[it[0]]; });
        cells = top.map(function (it) { return tile(it, cur); }).join("") + (moreOpen ? rest.map(function (it) { return tile(it, cur); }).join("") : "") +
          (rest.length ? '<button type="button" class="dg-i dg-more" data-more><span class="dg-t dgc-n">' + gsvg("dots") + "</span><b>" + (moreOpen ? "收起" : "更多 " + rest.length) + "</b></button>" : "");
      }
      return '<section class="dg"><h3>' + g[0] + '</h3><div class="dg-g">' + cells + "</div></section>";
    }).join("");
  }
  function draw() {
    var cur = current(), kw = "";
    if (GRID) { try { body.innerHTML = drawGrid(cur); return; } catch (e) { /* 宫格画不出来就退回折叠列表，菜单不能空着 */ } }
    body.innerHTML = GROUPS.map(function (g, gi) {
      var items = g[2].filter(function (it) { return !kw || it[1].toLowerCase().indexOf(kw) >= 0; });
      if (!items.length) return "";
      var isOpen = kw || open[gi];
      return '<section class="dw-group' + (isOpen ? " open" : "") + '"><button type="button" class="dw-gh" data-g="' + gi + '"><b>' + g[0] + "</b><small>" + g[1] + '</small><em class="dw-sum">' + g[2].slice(0, 4).map(function (it) { return txt(it[1]).replace(/（.*?）/g, ""); }).join(" · ") + (g[2].length > 4 ? " 等 " + g[2].length + " 项" : "") + '</em><svg class="dw-up" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>' +
        '<div class="dw-items">' + (function () {
          function row(it) { return '<a href="' + (it[0] === "#group" ? "#" : it[0]) + '"' + (it[0] === "#group" ? " data-group" : "") + (it[3] ? ' target="_blank" rel="noopener"' : "") + (it[0] === cur ? ' class="on"' : "") + ">" + ico(it[2]) + "<span>" + txt(it[1]) + "</span>" + CHEV + "</a>"; }
          if (g !== GAME_GROUP || kw) return items.map(row).join("");
          var top = items.filter(function (it) { return PIN[it[0]]; }), rest = items.filter(function (it) { return !PIN[it[0]]; });
          return top.map(row).join("") + (rest.length ? '<button type="button" class="dw-more' + (moreOpen ? " open" : "") + '" data-more>' + ico("grid") + "<span>其它小游戏（" + rest.length + ' 个）</span><svg class="dw-up" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>' + (moreOpen ? rest.map(row).join("") : "") : "");
        })() + "</div></section>";
    }).join("") || '<p class="dw-none">没有找到相关功能</p>';
  }
  body.onclick = function (e) {
    if (e.target.closest("[data-more]")) { moreOpen = !moreOpen; draw(); return; }
    var h = e.target.closest(".dw-gh");
    if (h) { var gi = h.getAttribute("data-g"); open[gi] = !open[gi]; draw(); return; }
    if (e.target.closest("a")) close();
  };

  function show() {
    // 打开时分组全部收起（站长要求）：每个分组标题下面用小字列出里面有什么，一屏看到全部功能，点标题再展开
    moreOpen = false; open = {}; // 分组默认收起（站长 2026-11-05 定），标题下有小字列出里面有什么，点标题展开
    if (A.freshCheck) A.freshCheck(); // 点开菜单顺便查新版本，有就自动换成新版
    draw();
    wallet();
    dw.hidden = false;
    document.documentElement.classList.add("dw-lock");
    requestAnimationFrame(function () { dw.classList.add("in"); });
  }
  function close() {
    dw.classList.remove("in");
    document.documentElement.classList.remove("dw-lock");
    setTimeout(function () { if (!dw.classList.contains("in")) dw.hidden = true; }, 220);
  }
  dw.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = close; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !dw.hidden) close(); });
  window.addEventListener("hashchange", function () { if (!dw.hidden) close(); });
  var btn = document.getElementById("menu-btn");
  if (btn) btn.onclick = function () { seen(); show(); };
  // ☰ 引导：以后新功能都先放菜单里。☰ 下面常驻「更多」两个字；没打开过菜单的客户，再弹一个气泡提示 + 呼吸光圈
  function seen() {
    try { localStorage.setItem("mnSeen", "1"); } catch (e) {}
    if (btn) btn.classList.remove("nudge");
    var t = document.getElementById("mn-tip"); if (t) t.remove();
  }
  if (btn) {
    btn.insertAdjacentHTML("beforeend", '<span class="mn-lb">更多</span>');
    var was = null; try { was = localStorage.getItem("mnSeen"); } catch (e) {}
    if (was !== "1") {
      btn.classList.add("nudge");
      setTimeout(function () { btn.classList.remove("nudge"); }, 8000); // 只闪 8 秒提醒一下，不弹气泡（站长嫌每次都要点「知道了」）
    }
  }

  // 钱包：已连接就显示地址，点一下去会员中心；没连接就连接
  var addr = null;
  function wallet() {
    var t = document.getElementById("dw-wt");
    if (addr) { t.textContent = "已连接 " + A.short(addr); return; }
    t.textContent = "连接钱包";
    if (A.wallets) A.wallets.silent().then(function (a) { if (a) { addr = String(a).toLowerCase(); t.textContent = "已连接 " + A.short(addr); } }).catch(function () {});
  }
  document.getElementById("dw-wallet").onclick = function () {
    if (addr) { close(); location.hash = "#/member"; return; }
    var t = document.getElementById("dw-wt");
    A.wallets.choose().then(function (eth) { return AIL.wallets.ask(eth, { method: "eth_requestAccounts" }); }).then(function (a) {
      addr = String(a[0]).toLowerCase();
      t.textContent = "已连接 " + A.short(addr);
    }, function () { t.textContent = "连接钱包"; });
  };
})();
