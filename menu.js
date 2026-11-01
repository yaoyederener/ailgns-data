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
    chat: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"/>'
  };
  // [分组名, 英文, [[链接, 名字, 图标, 是否外链]]]
  var GROUPS = [
    ["OTC 交易", "TRADE", [["#/otc", "AiLGNS OTC", "otc"], ["#/otc/lgns", "LGNS OTC · Anubis", "chain"], ["#/otc/plgns", "LGNS OTC · Polygon", "chain"], ["#/otc/glgns", "gLGNS OTC · Anubis", "chain"], ["#/otc/nft", "AWAKE NFT 卡牌", "grid"], ["#/trades", "成交查询", "wallet"]]],
    ["会员", "MEMBER", [["#/member", "会员中心", "member"], ["#/wallet", "钱包快查", "wallet"], ["#/team", "团队与等级", "team"], ["#/growth", "团队新增业绩", "growth"], ["#/tree", "团队结构图", "tree"], ["#/upline", "上级查询", "upline"]]],
    ["借贷", "LEND", [["#/lend", "AiLGNS 抵押借款", "otc"], ["#/lend/lgns", "LGNS 抵押借款（即将上线）", "chain"], ["#/lend/glgns", "gLGNS 抵押借款（即将上线）", "chain"]]],
    ["销毁乐园", "PLAY", [["#/play", "销毁乐园", "fire"], ["#/pixel", "LGNS 像素墙", "grid"]]],
    ["数据", "DATA", [["#/flows", "资金流向", "flow"]]],
    ["合作与支持", "SUPPORT", [["#/promo", "营销广告", "promo"], ["#/custom", "私人定制 · 商户合作", "custom"], ["#/app", "下载 App", "app"], ["https://m.debox.pro/card?id=twbzjko7&invite_code=twbzjko7", "加站长 DeBox", "chat", true]]]
  ];
  function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + "</svg>"; }
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
    '<label class="dw-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg><input id="dw-q" type="search" placeholder="搜索功能" autocomplete="off"></label></div>' +
    '<div class="dw-body" id="dw-body"></div>' +
    '<p class="dw-foot">AWAKE HELIX 官方认证 AiLGNS OTC 服务站</p></aside>';
  document.body.appendChild(dw);
  var body = document.getElementById("dw-body"), q = document.getElementById("dw-q"), open = {};

  function draw() {
    var cur = current(), kw = q.value.trim().toLowerCase();
    body.innerHTML = GROUPS.map(function (g, gi) {
      var items = g[2].filter(function (it) { return !kw || it[1].toLowerCase().indexOf(kw) >= 0; });
      if (!items.length) return "";
      var isOpen = kw || open[gi];
      return '<section class="dw-group' + (isOpen ? " open" : "") + '"><button type="button" class="dw-gh" data-g="' + gi + '"><b>' + g[0] + "</b><small>" + g[1] + '</small><svg class="dw-up" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>' +
        '<div class="dw-items">' + items.map(function (it) {
          return '<a href="' + it[0] + '"' + (it[3] ? ' target="_blank" rel="noopener"' : "") + (it[0] === cur ? ' class="on"' : "") + ">" + svg(it[2]) + "<span>" + it[1] + "</span>" + CHEV + "</a>";
        }).join("") + "</div></section>";
    }).join("") || '<p class="dw-none">没有找到相关功能</p>';
  }
  body.onclick = function (e) {
    var h = e.target.closest(".dw-gh");
    if (h) { var gi = h.getAttribute("data-g"); open[gi] = !open[gi]; draw(); return; }
    if (e.target.closest("a")) close();
  };
  q.oninput = draw;

  function show() {
    // 打开时展开当前页面所在的分组
    var cur = current();
    open = {};
    GROUPS.forEach(function (g, gi) { if (g[2].some(function (it) { return it[0] === cur; })) open[gi] = true; });
    if (!Object.keys(open).length) open[0] = true;
    q.value = "";
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
  if (btn) btn.onclick = show;

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
    A.wallets.choose().then(function (eth) { return eth.request({ method: "eth_requestAccounts" }); }).then(function (a) {
      addr = String(a[0]).toLowerCase();
      t.textContent = "已连接 " + A.short(addr);
    }, function () { t.textContent = "连接钱包"; });
  };
})();
