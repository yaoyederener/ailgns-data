// 右下角机器人客服：常见问题秒回；问得复杂时交给服务器上的 AI（/api/chat）；都答不了就引导找人工
(function () {
  "use strict";

  var DEBOX = "https://m.debox.pro/card?id=twbzjko7&invite_code=twbzjko7";
  var TZ = "America/Vancouver"; // 人工客服按温哥华时间 10:00–22:00
  var OPEN = 10, CLOSE = 22;

  // ---------- 人工时间：温哥华 10am–10pm 换算成北京时间（自动跟随夏令时/冬令时） ----------
  function offsetMin(tz, d) {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
    var g = {}; p.forEach(function (x) { g[x.type] = x.value; });
    return (Date.UTC(+g.year, g.month - 1, +g.day, +g.hour, +g.minute) - Math.floor(d.getTime() / 60000) * 60000) / 60000;
  }
  function hours() {
    var now = new Date(), van = offsetMin(TZ, now), bj = 8 * 60, diff = (bj - van) / 60; // 北京比温哥华快几小时
    var vanHour = ((now.getUTCHours() * 60 + now.getUTCMinutes() + van) / 60 + 48) % 24;
    // 写成「早上 10 点」「晚上 22 点」这样，国内客户一眼看懂
    function hh(h) { return (h < 6 ? "凌晨 " : h < 12 ? "早上 " : h < 13 ? "中午 " : h < 18 ? "下午 " : "晚上 ") + h + " 点"; }
    var s = (OPEN + diff) % 24, e = (CLOSE + diff) % 24; // 北京时间的开始、结束整点；结束早于开始说明跨到第二天
    return { online: vanHour >= OPEN && vanHour < CLOSE, text: "北京时间 " + hh(s) + "到" + (e <= s ? "次日" : "") + hh(e) + "（温哥华时间 " + hh(OPEN) + "到" + hh(CLOSE) + "）" };
  }

  // ---------- 常见问题：关键词命中就直接回答 ----------
  var FAQ = [
    { k: ["手续费", "费用", "收费", "1%", "抽成"], a: "AiLGNS OTC 成交手续费 1%，由吃单方承担，直接从收到的币里扣。挂单、撤单、到期退回都不收费。手续费写死在合约里，谁都改不了。" },
    { k: ["安全", "靠谱", "跑路", "骗", "资金安全", "审计", "托管"], a: "挂单的币锁在智能合约里，不经过任何人的手：成交时付款和收币在同一笔交易里完成，要么都成功要么都不成功；到期没成交自动原路退回。合约没有管理员、不能升级，源码公开（OTC 页面有「开源源码」链接）。合约未经第三方审计，建议先小额试用。" },
    { k: ["怎么买", "买入", "购买", "吃单", "怎么成交", "买ailgns", "买 ailgns"], a: "打开首页 AiLGNS OTC → 在「买入 AiLGNS」列表里挑一张 → 点「买入」→ 输入要买的数量 → 在钱包里确认（第一次会先授权 DAI）。成交后 AiLGNS 直接到你钱包。需要 Anubis 链上的 DAI 付款和少量 gasDAI 当手续费。" },
    { k: ["怎么卖", "卖出", "出售", "怎么挂单", "挂单", "发布"], a: "AiLGNS OTC 页面 →「发布挂单」→ 选「我要卖 AiLGNS」→ 填数量、单价、有效期 → 在钱包里确认。币会存进托管合约，有人买就自动成交，DAI 直接到你钱包；成交前随时可以撤单，到期没成交自动退回。" },
    { k: ["撤单", "取消", "取回", "退回", "过期", "到期"], a: "在 OTC 页面「我的挂单」里可以随时撤单，币马上退回。设置的有效期（10 分钟到 30 天自选）到了还没成交，系统会自动把剩下的币原路退回给挂单人，不收任何费用。" },
    { k: ["有效期", "多久", "时间多长"], a: "挂单有效期可以选 10 分钟、30 分钟、1 小时……一直到 30 天，也能自定义。到期没成交自动退回。" },
    { k: ["钱包", "连接", "metamask", "okx", "bitget", "tp", "tokenpocket", "imtoken", "打不开"], a: "支持 OKX、Bitget Wallet、TokenPocket、MetaMask 等。手机上请在钱包 App 的「DApp 浏览器 / 发现」里打开 ailgns.dev，网站会自动识别钱包；电脑上需要装浏览器插件钱包。" },
    { k: ["网络", "链", "anubis", "rpc", "chainid", "加网络", "gas", "gasdai"], a: "OTC 在 Anubis 链上：Chain ID 6714，RPC https://rpc.anubispace.org，Gas 币是 DAI（gasDAI）。网站会自动帮你添加和切换网络，确认即可。" },
    { k: ["会员", "vip", "开通", "价格", "多少钱", "升级", "尊享", "初级", "高级"], a: "会员两档：初级 VIP 20 美元等值，永久；高级 VIP · 尊享级 1000 美元等值，终生，多出导出全部数据和结构图每 5 分钟优先刷新。初级补 980 美元差价即可升级。可用 Anubis 链的 LGNS（按市价 50% 计，因为 Anubis 卖出扣 50%）/ AiLGNS，或 Polygon 链的 LGNS / DAI 付款，按实时价格折算。在「会员」页面用钱包开通。" },
    { k: ["结构图", "团队", "业绩", "等级", "p1", "p2", "查别人", "别人的地址"], a: "会员开在地址上：在会员中心填要开通的地址，用任何钱包转一笔专属金额（带零头），到账自动开通，不用连钱包、不用签名、不用授权。开通后可以查这个会员地址的「团队与等级」「团队新增业绩」和「团队结构图」，只能查会员地址本身。「钱包快查」和「资金流向」所有人都能免费用。" },
    { k: ["资金流向", "净流入", "净流出", "流入", "流出"], a: "「资金流向」页面统计 AiLGNS/DAI 交易池每天的买入、卖出和净流入/净流出，页面顶部会直接告诉你今天是净流入还是净流出，所有人免费查看。" },
    { k: ["私钥", "助记词", "授权", "被盗", "钓鱼"], a: "本站绝不会向你索取私钥或助记词。只有开通会员、OTC 挂单和成交时，才会请你在自己的钱包里确认交易。任何以本站名义私聊要私钥、要转账的都是诈骗，请直接拉黑。" },
    { k: ["官方", "awake", "helix", "项目方"], a: "本站是 AWAKE HELIX 官方认证的 AiLGNS OTC 服务站。团队、等级等数据来自链上合约和官方公开接口。" },
    { k: ["没到账", "失败", "卡住", "报错", "失败了", "pending"], a: "先看钱包里这笔交易的状态：如果是「失败」，币不会被扣（只花了少量 Gas）；如果一直「等待中」，通常是 Gas 不够或网络拥堵，稍等或加速。还解决不了的话，请把交易哈希发给人工客服核对。" },
    { k: ["人工", "客服", "联系", "站长", "debox", "真人"], a: "HUMAN" }
  ];
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }
  function faq(q) {
    var t = norm(q), best = null, score = 0;
    FAQ.forEach(function (f) {
      var s = 0;
      f.k.forEach(function (k) { if (t.indexOf(norm(k)) >= 0) s += k.length; });
      if (s > score) { score = s; best = f; }
    });
    return best ? { a: best.a, score: score } : null;
  }

  // ---------- 界面 ----------
  var QUICK = ["怎么买 AiLGNS？", "怎么挂单卖？", "手续费多少？", "资金安全吗？", "会员价格", "联系人工"];
  var root, list, input, history = [];

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s，。）)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>"); }
  function humanHtml() {
    var h = hours();
    return "人工客服时间：<b>" + esc(h.text) + "</b><br>" + (h.online ? '<span class="cb-on">● 现在人工在线</span>' : '<span class="cb-off">● 现在不在人工时间，留言后上班第一时间回复</span>') +
      '<br><a class="cb-human" href="' + DEBOX + '" target="_blank" rel="noopener">加站长 DeBox，找人工 →</a>' +
      '<br><span class="muted">也可以直接在这里留言，你的每一条留言我们都会阅读并反馈。</span>';
  }
  function add(who, html) {
    var m = el('<div class="cb-msg cb-' + who + '"><div class="cb-bubble"></div></div>');
    m.firstChild.innerHTML = html;
    list.appendChild(m);
    list.scrollTop = list.scrollHeight;
    return m;
  }
  function ask(q) {
    q = String(q || "").trim().slice(0, 300);
    if (!q) return;
    add("me", esc(q));
    history.push({ role: "user", content: q });
    var f = faq(q);
    if (f && f.a === "HUMAN") { reply(humanHtml(), "已为你提供人工联系方式"); return; }
    if (f && f.score >= 2 && q.length <= 20) { reply(linkify(f.a), f.a); return; } // 简短的常见问题直接秒回
    var wait = add("bot", '<span class="cb-typing"><i></i><i></i><i></i></span>');
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
    fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-8) }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        clearTimeout(timer);
        wait.remove();
        if (j && j.answer) { reply(linkify(j.answer) + (j.human ? "<br><br>" + humanHtml() : ""), j.answer); return; }
        if (f) { reply(linkify(f.a), f.a); return; }
        reply("这个问题我暂时答不好，建议直接问人工：<br>" + humanHtml(), "建议联系人工");
      });
  }
  function reply(html, plain) {
    add("bot", html);
    history.push({ role: "assistant", content: plain });
    forward(plain, /人工/.test(plain));
  }
  // 每次咨询（问题 + 回答）转发到站长指定的 DeBox（后台 /api/chat-log），人工能看到客户在问什么
  var SID = (function () { try { var k = "cb:sid", v = localStorage.getItem(k); if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(k, v); } return v; } catch (e) { return "anon"; } })();
  function forward(answer, human) {
    var q = history.filter(function (m) { return m.role === "user"; }).slice(-1)[0];
    if (!q) return;
    try {
      fetch("/api/chat-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: q.content, a: String(answer || "").slice(0, 600), page: location.hash || "/", sid: SID, human: !!human }), keepalive: true }).catch(function () {});
    } catch (e) { /* 转发失败不影响聊天 */ }
  }

  function build() {
    root = el('<div class="cb" id="cb">' +
      '<button class="cb-fab" aria-label="在线客服"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor"/><circle cx="9" cy="9.6" r="1.2" fill="#7027d9"/><circle cx="12" cy="9.6" r="1.2" fill="#7027d9"/><circle cx="15" cy="9.6" r="1.2" fill="#7027d9"/></svg><span>客服</span></button>' +
      '<section class="cb-panel" hidden aria-label="在线客服">' +
      '<header class="cb-head"><div><b>AiLGNS 服务站客服</b><small>机器人 7×24 秒回 · 人工 ' + esc(hours().text) + '</small></div><button class="cb-x" aria-label="关闭">×</button></header>' +
      '<div class="cb-list"></div>' +
      '<div class="cb-quick">' + QUICK.map(function (q) { return '<button type="button">' + esc(q) + "</button>"; }).join("") + "</div>" +
      '<form class="cb-form"><input placeholder="输入你的问题…" maxlength="300" autocomplete="off"><button type="submit">发送</button></form>' +
      "</section></div>");
    document.body.appendChild(root);
    list = root.querySelector(".cb-list");
    input = root.querySelector(".cb-form input");
    var panel = root.querySelector(".cb-panel"), fab = root.querySelector(".cb-fab");
    function toggle(open) {
      panel.hidden = !open;
      root.classList.toggle("open", open);
      if (open && !list.childNodes.length) {
        add("bot", "你好！我是 AiLGNS 服务站的机器人客服，OTC 买卖、挂单、手续费、会员、钱包连接的问题都可以问我。<br><br>" + humanHtml());
      }
      if (open && matchMedia("(min-width: 601px)").matches) input.focus();
    }
    fab.onclick = function () { toggle(panel.hidden); };
    root.querySelector(".cb-x").onclick = function () { toggle(false); };
    root.querySelectorAll(".cb-quick button").forEach(function (b) { b.onclick = function () { ask(b.textContent); }; });
    root.querySelector(".cb-form").onsubmit = function (e) { e.preventDefault(); var q = input.value; input.value = ""; ask(q); };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
