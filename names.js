// .ailgns 域名：注册 xxx.ailgns、绑定地址、设主名字、查名字（合约 contracts/AilgnsNames.sol，按名字长度定价）
// 收费全部直接进回购分账合约；合约没部署前 NAMES 留空，页面只能看价格、不能注册（预览）
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  // 两个后缀各一个合约（同一份规则）；网址 #/names/xxx.lgns 打开 .lgns，默认 .ailgns
  var CONTRACTS = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", lgns: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3" }; // 第 3 版（中文价格、DAI/LGNS/AiLGNS 付款、最多 100 年），Anubis 区块 18161697 / 18161710
  var TLD = "ailgns", NAMES = CONTRACTS.ailgns;
  // 域名市场：AWAKE NFT 托管合约同一份代码，各后缀一份；卖家把名字存进合约标价，买家付 DAI 同一笔交易里拿到名字，手续费 3% 买家另付，进回购分账合约
  var START = { ailgns: 18161697, lgns: 18161710 }; // 合约部署区块，从这里开始读链上记录
  var GENESIS = 10000; // 前 1 万个付费注册的名字是「创世域名」，按链上注册顺序编号
 var T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  // 创世徽章：和会员勋章同一种做法（渐变圆章 + 虚线内圈 + 白色图案），站点紫色，中间一颗星
  // 💎 稀有度（站长 2026-11-08 定）：只看名字本身，人人都珍贵，没有「普通」档
  function rarity(l) {
    l = String(l || "").toLowerCase(); var c = Array.from(l), n = c.length, d = /^\d+$/.test(l), han = /^[一-鿿]+$/.test(l);
    var same = n > 1 && c.every(function (x) { return x === c[0]; }), pal = n >= 3 && c.slice().reverse().join("") === l, seq = false;
    if (d && n >= 3) { var up = true, dn = true; for (var i = 1; i < n; i++) { var k = +c[i] - +c[i - 1]; if (k !== 1) up = false; if (k !== -1) dn = false; } seq = up || dn; }
    if (n === 1) return [4, han ? "单个汉字，一字千金" : "只有 1 个字符，全站屈指可数"];
    if (d && same) return [4, n + " 位同号，独一无二"];
    if (n === 2) return [3, "只有 2 个字符，极为罕见"];
    if (d && /^(520|1314|5201314|168|1688|518|666|888|999|6868|8686|9898|8899|6688)$/.test(l)) return [3, "吉祥号，寓意满满"];
    if (d && n === 3) return [3, "3 位数字号，全站只有 1000 个"];
    if (d && seq) return [3, "顺子号，步步高升"];
    if (d && n === 4 && (/^(\d)\1(\d)\2$/.test(l) || /^(\d)(\d)\1\2$/.test(l) || pal)) return [3, "4 位对子 / 回文号，非常抢手"];
    if (d && n === 4) return [2, "4 位数字号，全站只有 1 万个"];
    if (d && /^[689]+$/.test(l)) return [2, "全是 6、8、9 吉利数字"];
    if (n === 3) return [2, "只有 3 个字符，短而好记"];
    if (han && n === 4) return [2, "四字好名，寓意吉祥"];
    if (d && pal) return [2, "回文号，正读反读都一样"];
    return [1, "独一无二，全网只此一个"];
  }
  var RAR = { 4: "🐉 传承一亿年", 3: "💎 绝世罕见", 2: "🌟 稀有", 1: "💠 珍藏" };
  function rarTag(l) { var r = rarity(l); return '<span class="nm-rar t' + r[0] + '"><b>' + RAR[r[0]] + "</b><small>" + r[1] + "</small></span>"; }
  A.rarity = rarity;
  function genEmblem(s) {
    var rays = "";
    for (var i = 0; i < 24; i++) { var a = i * 15, w = i % 2 ? 2.2 : 3.4, h = i % 2 ? 7 : 10; rays += '<rect x="' + (32 - w / 2) + '" y="1" width="' + w + '" height="' + h + '" rx="1" fill="url(#gnRay)" transform="rotate(' + a + ' 32 32)"/>'; }
    return '<svg class="gen-emb" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true"><defs>' +
      '<linearGradient id="gnRay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b3"/><stop offset="1" stop-color="#e3a71c"/></linearGradient>' +
      '<linearGradient id="gnGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff5c2"/><stop offset=".35" stop-color="#f3c54a"/><stop offset=".6" stop-color="#c98a12"/><stop offset=".8" stop-color="#f7d564"/><stop offset="1" stop-color="#b8780a"/></linearGradient>' +
      '<radialGradient id="gnCore" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#9b4dff"/><stop offset=".55" stop-color="#5a1fd1"/><stop offset="1" stop-color="#2a0e6e"/></radialGradient>' +
      '<linearGradient id="gnStar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8d6"/><stop offset=".5" stop-color="#f5c93d"/><stop offset="1" stop-color="#d0920f"/></linearGradient>' +
      '<linearGradient id="gnGem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#8ad7ff"/><stop offset="1" stop-color="#1e6fe8"/></linearGradient></defs>' +
      rays +
      '<circle cx="32" cy="32" r="24.5" fill="url(#gnGold)"/>' +
      '<circle cx="32" cy="32" r="21.2" fill="url(#gnCore)" stroke="#fff3c4" stroke-width="1.1"/>' +
      '<circle cx="32" cy="32" r="18.6" fill="none" stroke="#f7d564" stroke-opacity=".55" stroke-width=".9" stroke-dasharray="1.2 2.2"/>' +
      '<path d="M32 15l4.9 10.9 11.9 1.1-9 7.9 2.7 11.7L32 40.5l-10.5 6.1 2.7-11.7-9-7.9 11.9-1.1z" fill="url(#gnStar)" stroke="#7a4c00" stroke-width=".6" stroke-linejoin="round"/>' +
      '<path d="M32 15l4.9 10.9 11.9 1.1-9 7.9L32 30.5z" fill="#ffffff" opacity=".22"/>' +
      '<circle cx="32" cy="31.5" r="3.1" fill="url(#gnGem)" stroke="#7a4c00" stroke-width=".4"/>' +
      '<text x="32" y="52.5" text-anchor="middle" font-size="6.2" font-weight="900" letter-spacing="1.2" fill="#ffe08a" font-family="system-ui,sans-serif">GENESIS</text></svg>';
  }

 var T_REG = "0xa15b66031269f1c32be8db1e4353108dc76c84574a7c6697527e431ad921462a", T_FILL = "0xdef4cdb91e8c5e2777b0bf9645ce2c7e0b64a3b3fb94e37c6d78cde1043f80cb";
  var OTC = { ailgns: "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e", lgns: "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d" }; // Anubis 区块 18161704 / 18161717
  var DAI = "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14";
  var ZERO = "0x" + "0".repeat(40);
  var SEL = { available: "0xaeb8ce9b", register: "0xd868a84f", renew: "0x26e43e37", quote: "0x13b0be33", resolve: "0x461a4478", nameOf: "0xf5c57382", idOf: "0x5fd846f2", expires: "0xcb52c823", ownerOf: "0x6352211e", setPrimary: "0x38e74feb", setAddr: "0xeba36dbd", labelOf: "0x36bf1f0c", oList: "0xca690ea2", oBuy: "0xd6febde8", oCancel: "0x40e58ee5", oCount: "0x35daa731", oGet: "0x8f72fc77", getApproved: "0x081812fc", nftApprove: "0x095ea7b3", allowance: "0xdd62ed3e", approve: "0x095ea7b3" };

  // 和合约一致：a-z、0-9、-、常用汉字（4E00–9FFF），中文一个字算 1 个字符；英文最少 3 个，带汉字最少 2 个，最多 32 个
  function chars(s) { return Array.from(s).length; }
  function valid(s) { var n = chars(s); return /^[a-z0-9\u4e00-\u9fff-]+$/.test(s) && n >= (cn(s) ? 2 : 3) && n <= 32 && s[0] !== "-" && s[s.length - 1] !== "-"; }
  function cn(s) { return /[\u4e00-\u9fff]/.test(s); }
  // 带汉字：2 个字 50、3 个字及以上 5；英文：3 位 640、4 位 160、5 位及以上 5（DAI / 年）
  function yearPrice(s) { var n = chars(s); return cn(s) ? (n === 2 ? 50 : 5) : n === 3 ? 640 : n === 4 ? 160 : 5; }
  // 付款币种：AiLGNS 优先，再 DAI、LGNS（合约按 DEX 实时价格换算）
  // LGNS：合约按 DEX 现价收，但 LGNS 在 DEX 卖出要扣税（动态，约 50%），平台收到的只值一部分。
  // 合约写死改不了，所以用 LGNS 付时先单独补一笔「卖出税差价」给分账合约（PAYEE），再注册：总共付 合约报价 ÷ (1 − 税率)
  var TOK = { AiLGNS: { a: "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", d: 18 }, DAI: { a: DAI, d: 18 }, LGNS: { a: "0x4d1d808a081fdac440703b3765fc61f8028c06b8", d: 9 } };
  var PAYEE = "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3"; // 域名合约的收款地址（回购分账合约）
  var taxP = null;
  function lgnsTax() { // 现在 LGNS 在 DEX 卖出扣多少（万分比）；测不到按 50%
    if (!taxP) taxP = fetch("/api/sell-tax").then(function (r) { return r.json(); }).then(function (j) { var t = j && j.lgns; return t > 0.03 && t < 0.9 ? t : 0.5; }, function () { return 0.5; })
      .then(function (t) { return BigInt(Math.round(t * 10000)); });
    return taxP;
  }
  // LGNS 提示里的「换成 DAI / AiLGNS 付」按钮：点了等于点上面的付款按钮
  function lgnsSwitch() { return ' <button type="button" class="nm-sw" data-sw="DAI">换成 DAI 付</button> <button type="button" class="nm-sw" data-sw="AiLGNS">换成 AiLGNS 付</button>'; }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".nm-sw"); if (!b) return;
    var p = document.querySelector('.nm-pay[data-for="nm-k"] button[data-k="' + b.getAttribute("data-sw") + '"]'); if (p) p.click();
  });
  var topUpAt = 0, topUpAmt = ""; // 刚补完差价：第 2 笔的大字提示里说「差价已补好」
  function topUp(q) { return lgnsTax().then(function (bp) { return q * bp / (10000n - bp); }); } // 合约收 q 个 LGNS 时要补的差价
  // 付款币种直接摊开三个按钮（下拉框客户以为只有 AiLGNS）；隐藏的 select 仍是数据来源，原有 onchange 照用
  function tokSel(id) {
    return '<select id="' + id + '" hidden>' + Object.keys(TOK).map(function (k) { return "<option>" + k + "</option>"; }).join("") + "</select>" +
      '<span class="nm-pay" data-for="' + id + '">' + Object.keys(TOK).map(function (k, i) { return '<button type="button" data-k="' + k + '"' + (i ? "" : ' class="on"') + ">" + k + "</button>"; }).join("") + "</span>";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".nm-pay button"); if (!b) return;
    e.preventDefault();
    var g = b.parentNode, sel = document.getElementById(g.getAttribute("data-for")); if (!sel) return;
    g.querySelectorAll("button").forEach(function (x) { x.className = x === b ? "on" : ""; });
    sel.value = b.getAttribute("data-k"); sel.dispatchEvent(new Event("change"));
  });
  function fmt(x, d) { var v = Number(x) / Math.pow(10, d); return v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4); }
  function quote(dai, k) { // dai 个 DAI 用 k 币要付多少（最小单位）
    var wei = BigInt(dai) * 10n ** 18n;
    if (k === "DAI") return Promise.resolve(wei);
    return call(SEL.quote + u256(wei) + A.pad(TOK[k].a)).then(function (r) { return BigInt(r); });
  }
  // 授权并返回付款参数：最多多付 2%，防止付款时币价小幅变动导致失败
  // 差价余额：这个地址转给分账合约的 LGNS 里，不在注册交易里的算「补差价」；每次用 LGNS 注册成功，按时间顺序用掉最早的一笔补差价。剩下没用掉的就是余额
  function topUpCredit() {
    var L = TOK.LGNS.a, me = "0x" + A.pad(account), to = "0x" + A.pad(PAYEE), regs = {};
    Object.keys(CONTRACTS).forEach(function (t) { regs[CONTRACTS[t]] = 1; });
    return W.rpcOn("anubis", "eth_blockNumber", []).then(function (h) {
      var latest = parseInt(h, 16), ranges = [];
      for (var b = START.ailgns; b <= latest; b += 5000) ranges.push([b, Math.min(latest, b + 4999)]);
      return A.pool(ranges, 4, function (r) {
        return W.rpcOn("anubis", "eth_getLogs", [{ address: L, fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16), topics: [T_XFER, me, to] }]);
      });
    }).then(function (chunks) {
      var xs = [].concat.apply([], chunks.map(function (c) { if (!c) throw new Error("读链上记录失败"); return c; }));
      return Promise.all(xs.map(function (l) {
        return W.rpcOn("anubis", "eth_getTransactionReceipt", [l.transactionHash]).then(function (rc) {
          var isReg = (rc.logs || []).some(function (y) { return y.topics[0] === T_REG && regs[String(y.address).toLowerCase()]; });
          return { b: parseInt(l.blockNumber, 16), i: parseInt(l.logIndex, 16), v: BigInt(l.data), reg: isReg };
        });
      }));
    }).then(function (ev) {
      // 按时间顺序记账：补差价 +；每次用 LGNS 注册，按现在的税率扣掉这次该补的差价；最低到 0（以前税率低时多扣的不倒找）
      ev.sort(function (x, y) { return x.b - y.b || x.i - y.i; });
      return lgnsTax().then(function (bp) {
        var c = 0n;
        ev.forEach(function (x) { if (!x.reg) c += x.v; else { c -= x.v * bp / (10000n - bp); if (c < 0n) c = 0n; } });
        return c;
      });
    }).then(function (c) {
      // 站长从自己钱包手动退过的 LGNS，从余额里扣掉，避免退了钱还能再抵扣
      if (c <= 0n) return c;
      var owners = Object.keys(A.hidden || {});
      return W.rpcOn("anubis", "eth_blockNumber", []).then(function (h) {
        var latest = parseInt(h, 16), jobs = [];
        owners.forEach(function (o) { for (var b = START.ailgns; b <= latest; b += 5000) jobs.push([o, b, Math.min(latest, b + 4999)]); });
        return A.pool(jobs, 4, function (j) {
          return W.rpcOn("anubis", "eth_getLogs", [{ address: L, fromBlock: "0x" + j[1].toString(16), toBlock: "0x" + j[2].toString(16), topics: [T_XFER, "0x" + A.pad(j[0]), me] }]);
        });
      }).then(function (chunks) {
        var back = 0n;
        chunks.forEach(function (x) { if (!x) throw new Error("读链上记录失败"); x.forEach(function (l) { back += BigInt(l.data); }); });
        return c > back ? c - back : 0n;
      });
    });
  }
  function prepay(dai, k, say) {
    var t = TOK[k], max, lgLeft = null;
    return quote(dai, k).then(function (q) {
      // 先查余额：币不够时钱包的「确定」是灰的点不动，客户不知道为什么，这里先说清楚
      var ks = Object.keys(TOK);
      return Promise.all(ks.map(function (x) { return W.rpcOn("anubis", "eth_call", [{ to: TOK[x].a, data: "0x70a08231" + A.pad(account) }, "latest"]).then(BigInt, function () { return -1n; }); })
        .concat([W.rpcOn("anubis", "eth_getBalance", [account, "latest"]).then(BigInt, function () { return -1n; })])).then(function (bal) {
        if (bal[ks.length] === 0n) throw new Error("你的钱包里没有 Anubis 链的 Gas 币，付不了手续费（钱包「确定」会点不动）。请先转一点 Gas 币进这个钱包再来");
        var mine = bal[ks.indexOf(k)];
        if (k !== "LGNS" && mine >= 0n && mine < q) {
          var have = ks.filter(function (x, i) { return x !== k && bal[i] > 0n; }).map(function (x) { return x + " " + fmt(bal[ks.indexOf(x)], TOK[x].d); });
          throw new Error(k + " 不够：要约 " + fmt(q, TOK[k].d) + " " + k + "，你的钱包只有 " + fmt(mine, TOK[k].d) + "（钱包「确定」会点不动）（活期 / 质押里的币不算，要先「赎回」取回钱包才能付）。" +
            (have.length ? "你钱包里有 " + have.join("、") + "，点上面「付款」换成它付就行" : "请先往钱包里转 AiLGNS、DAI 或 LGNS"));
        }
        return q;
      });
    }).then(function (q) {
      if (k !== "LGNS") return q;
      // LGNS：先把卖出税差价转给收款的分账合约，再注册（先补后注册，注册没完成的差价联系客服退回）
      // 之前补过差价、但注册没完成的（比如钱包里点了取消），这次直接抵扣，不再重复收
      return Promise.all([topUp(q), topUpCredit().catch(function () { return 0n; })]).then(function (z) {
        var e = z[0], cr = z[1];
        if (cr > 0n) { say("✅ 你之前补过的 " + fmt(cr, 9) + " LGNS 差价还没用上，这次直接抵扣"); e = cr * 100n >= e * 90n ? 0n : e - cr; }
        return W.rpcOn("anubis", "eth_call", [{ to: t.a, data: "0x70a08231" + A.pad(account) }, "latest"]).then(function (b) {
          lgLeft = BigInt(b) - e; // 补完差价后钱包还剩多少 LGNS：付注册费的上限不能超过它
          if (BigInt(b) < q + e) throw new Error("LGNS 不够：一共要约 " + fmt(q + e, 9) + " LGNS（含 DEX 卖出税补差），你的钱包只有 " + fmt(BigInt(b), 9) + "（活期 / 质押里的币不算，要先「赎回」取回钱包才能付）");
          if (!e) { if (cr > 0n) { topUpAt = Date.now(); topUpAmt = fmt(cr, 9); } return; }
          return tx(t.a, "0xa9059cbb" + A.pad(PAYEE) + u256(e), say, "💸 第 1 笔：补 DEX 卖出税差价 " + fmt(e, 9) + " LGNS（LGNS 在 DEX 卖出要扣税，这部分补给平台；作为运营费用）。请在钱包确认").then(function () {
            topUpAt = Date.now(); topUpAmt = fmt(e, 9);
            say("✅ 第 1 笔完成：差价 " + topUpAmt + " LGNS 已补好（网站记住了，不会重复扣）。马上弹第 2 笔付注册费，千万别关页面");
          });
        }).then(function () { return q; });
      });
    }).then(function (q) {
      max = k === "DAI" ? q : q * 102n / 100n;
      if (k === "LGNS" && lgLeft !== null && max > lgLeft) max = lgLeft; // 余额刚好够（比如要 112.8 有 113）：不再因为 2% 价格余量判成不够 // DAI 价格固定：扣多少授权多少；AiLGNS / LGNS 按 DEX 实时价，留 2% 防价格在确认期间变动（实际只扣当时价格）
      return W.rpcOn("anubis", "eth_call", [{ to: t.a, data: SEL.allowance + A.pad(account) + A.pad(NAMES) }, "latest"]);
    }).then(function (a) {
      if (BigInt(a) >= max) return; // 额度还够：跳过授权，钱包只弹「注册」一次
      // 只授权这一次要付的金额（客户反馈多授权不放心）：扣多少，授权多少
      return tx(t.a, SEL.approve + A.pad(NAMES) + u256(max), say, "🔒 授权（不扣钱）：只授权这次要付的 " + fmt(max, t.d) + " " + k + (k === "DAI" ? "" : "（含 2% 价格波动余量，实际按付款时价格扣）") + "。请在钱包确认");
    }).then(function () { return A.pad(t.a) + u256(max); });
  }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function str(s) { // ABI 编码 string 的尾部：长度 + 内容补齐 32 字节
    var h = Array.prototype.map.call(new TextEncoder().encode(s), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    return u256(h.length / 2) + h.padEnd(Math.ceil(h.length / 64) * 64, "0");
  }
  function call(data) { return W.rpcOn("anubis", "eth_call", [{ to: NAMES, data: data }, "latest"]); }
  function word(r, i) { return r.slice(2 + i * 64, 66 + i * 64); }
  function addrOf(r) { return "0x" + word(r, 0).slice(24); }
  function decStr(r) {
    var off = parseInt(word(r, 0), 16) / 32, len = parseInt(word(r, off), 16), h = r.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2);
    return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map(function (x) { return parseInt(x, 16); })));
  }
  var infoCache = {};
  // 最近被抢注：默认只露 3 个，点「展开」才显示全部；卡片 15 秒重画一次，所以状态放外面
  var gcOpen = false;
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".gc-more"); if (!b) return;
    gcOpen = !gcOpen;
    b.parentNode.classList.toggle("open", gcOpen);
    b.textContent = gcOpen ? "收起 ▴" : "展开全部 " + b.parentNode.querySelectorAll("span").length + " 个 ▾";
  });
  function info(label) { // 能否注册、指向谁、主人、到期时间（同一个名字 20 秒内不重复查链）
    var key = TLD + ":" + label, c = infoCache[key];
    if (c && Date.now() - c.t < 20000) return c.p;
    var p = info1(label);
    infoCache[key] = { t: Date.now(), p: p };
    p.catch(function () { delete infoCache[key]; });
    return p;
  }
  function info1(label) {
    var s = "0000000000000000000000000000000000000000000000000000000000000020" + str(label);
    return Promise.all([call(SEL.available + s), call(SEL.resolve + s), call(SEL.idOf + s)]).then(function (r) {
      var id = word(r[2], 0);
      if (BigInt("0x" + word(r[0], 0)) === 1n) return { free: true, addr: addrOf(r[1]), id: id, exp: 0, owner: null }; // 能注册：不用再查主人、到期，直接出结果
      return Promise.all([call(SEL.expires + id), call(SEL.ownerOf + id).catch(function () { return null; })]).then(function (x) {
        return { free: BigInt("0x" + word(r[0], 0)) === 1n, addr: addrOf(r[1]), id: id, exp: Number(BigInt("0x" + word(x[0], 0))), owner: x[1] ? addrOf(x[1]) : null };
      });
    });
  }
  function date(t) { var d = new Date(t * 1000); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // 连钱包 → 切到 Anubis → 发交易 → 等确认
  var eth, account;
  function connect() {
    return A.wallets.choose().then(function (p) { eth = p; return A.wallets.ask(eth, { method: "eth_requestAccounts" }); })
      .then(function (a) { account = String(a[0]).toLowerCase(); return W.switchTo(eth, "anubis"); }).then(function () { return account; });
  }
  function tx(to, data, say, msg) {
    // 页面打开时只是静默认出了钱包地址，真要发交易时再正式连接钱包、切到 Anubis
    return (eth ? Promise.resolve() : connect()).then(function () {
      say(msg);
      return W.rpcOn("anubis", "eth_call", [{ from: account, to: to, data: data }, "latest"]).catch(function (e) { throw new Error(e && /PAY_FAILED|transfer/i.test(e.message) ? "DAI 不够（还要一点 DAI 付 Gas）" : "交易会失败：" + ((e && e.message) || "请检查名字和余额")); })
      .then(function () { bigTip(msg); return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: to, data: data }] }); });
    })
      .then(function (h) { bigTip(""); say("已提交，等待链上确认…"); return W.waitOn("anubis", h).then(function () { return h; }); }, function (e) { bigTip(""); throw e; });
  }
  // 大字提示层：钱包弹出前先告诉老人家「点绿色确定」，点一下就关
  function bigTip(msg) {
    var el = document.getElementById("nm-big");
    if (!msg) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "nm-big"; el.onclick = function () { el.remove(); }; document.body.appendChild(el); }
    // 每一步说清楚「扣不扣钱」：客户以为确认几次就付了几次钱
    if (Date.now() - tipAt > 180000) { tipN = 0; tipTotal = 0; } // 别的操作（挂单、设主名字）重新从第 1 次数
    tipAt = Date.now(); tipN++;
    var t = String(msg), kind = /消费上限/.test(t) ? '<b class="nm-warn">⚠️ 钱包里如果有「消费上限 / 金额」数字，千万不要改！</b><br>那是名字的编号，不是价格，直接点确定' : /授权/.test(t) ? '这一步是<b class="nm-free">授权，不扣钱</b>，只是允许合约收这一次的款' : /补 DEX/.test(t) ? "这一步是补 LGNS 卖出税差价（只有用 LGNS 付才有）" : /转赠/.test(t) ? '这一步是<b class="nm-free">转赠，不扣钱</b>，只花一点 Gas；名字马上到对方钱包' : /^签名$/.test(t) ? '这一步只是<b class="nm-free">签名，不扣钱、不花 Gas</b>，证明是你本人出价' : /注册|续费/.test(t) ? (Date.now() - topUpAt < 600000 ? '✅ 第 1 笔差价 ' + topUpAmt + ' LGNS 已补好（<b>不会重复扣</b>）<br>这是<b>第 2 笔：真正付注册费</b>，付完名字就到手，千万别取消' : '这一步才是<b>真正付款</b>，付完名字就到手') : "";
    el.innerHTML = '<div class="nm-big-in"><div class="nm-big-ico">👛</div><b>钱包马上弹出来</b><p>请点钱包<b>最下面绿色的「确定」</b></p>' +
      '<p class="nm-big-step">第 <b>' + tipN + "</b> 次确认" + (tipTotal ? "（最多 " + tipTotal + " 次）" : "") + "</p>" + (kind ? '<p class="nm-big-kind">' + kind + "</p>" : "") + '<small>' + String(msg).replace(/^🔒\s*/, "").replace(/[<>]/g, "") + "</small><em>（看不到钱包？点这里关掉提示）</em></div>";
  }
  var tipN = 0, tipTotal = 0, tipAt = 0;
  // 名字授权给市场：有的钱包把它当成「代币授权」，显示可改的「消费上限」，客户把价格填进去，名字编号就被改掉、链上拒绝
  function nftOk(C, O, id, say) {
    function on(d) { return W.rpcOn("anubis", "eth_call", [{ to: C, data: d }, "latest"]); }
    // 改成「一次授权全部名字」（setApprovalForAll）：钱包里没有可改的数字，以后再挂别的名字也不用再授权
    var all = function () { return on("0xe985e9c5" + A.pad(account) + A.pad(O)).then(function (r) { return BigInt(r) === 1n; }); };
    return Promise.all([on(SEL.getApproved + id), all()]).then(function (g) {
      if (addrOf(g[0]) === O || g[1]) return;
      return tx(C, "0xa22cb465" + A.pad(O) + u256(1), say, "🔒 第 1 步：授权市场合约（不扣钱，只需一次，以后挂单不用再授权）。直接点确定").catch(function (e) {
        if (/reject|denied|cancel|取消|拒绝签名|User/i.test((e && e.message) || "")) throw e; // 客户自己点了取消
        throw new Error("授权没成功，请重新点「发布挂单」，钱包里直接点确定。");
      }).then(function () {
        return all().then(function (ok) { if (!ok) throw new Error("授权没生效，请重新点「发布挂单」，钱包里直接点确定。"); });
      });
    });
  } // 大字提示里的「第几次确认 / 最多几次」
  // 📦 批量注册（names-batch.js）要用的内部函数
  function regData(label, years, k, to) { var t = TOK[k]; return SEL.register + u256(0xa0) + A.pad(to) + u256(years) + A.pad(t.a) + u256(BigInt(yearPrice(label) * years) * 10n ** 18n) + str(label); }
  // 钱包支持「一次确认发一串」（EIP-5792 wallet_sendCalls）就用它：返回 true；不支持返回 false
  function sendCalls(calls, say) {
    if (!eth || !eth.request) return Promise.resolve(false);
    var chainId = "0x" + (6714).toString(16);
    return eth.request({ method: "wallet_getCapabilities", params: [account] }).then(function (cap) {
      var c = cap && (cap[chainId] || cap["6714"] || cap[6714]); if (!c || !(c.atomicBatch && c.atomicBatch.supported) && !c.atomic) return false;
      say("钱包支持一次确认发 " + calls.length + " 笔，请在钱包确认一次");
      return eth.request({ method: "wallet_sendCalls", params: [{ version: "1.0", chainId: chainId, from: account, calls: calls.map(function (x) { return { to: x.to, data: x.data, value: "0x0" }; }) }] }).then(function (id) {
        var bid = typeof id === "string" ? id : (id && id.id);
        say("已提交，等待链上确认…");
        return new Promise(function (ok, no) { var n = 0; (function poll() { eth.request({ method: "wallet_getCallsStatus", params: [bid] }).then(function (st) { var s = st && (st.status || st.state); if (s === 200 || s === "CONFIRMED" || s === "success") return ok(true); if (s >= 400 || s === "FAILED" || s === "failure") return no(new Error("打包交易失败")); if (++n > 120) return no(new Error("等待超时")); setTimeout(poll, 2000); }, no); })(); });
      });
    }, function () { return false; });
  }
  A.nm = { yearPrice: yearPrice, valid: valid, connect: connect, prepay: prepay, register: register, regData: regData, sendCalls: sendCalls, account: function () { return account; }, NAMES: function () { return NAMES; },
    tx: tx, DAI: DAI, owned: ownedList, // 销毁页（genesis.js）用：列出钱包里的创世名
    idOf: function (label) { return call(SEL.idOf + str(label)).then(function (r) { return word(r, 0); }); }, // 大奖一键注册并销毁：名字 → tokenId（64 位 hex）
    allowance: function (token, spender) { return call2(token, SEL.allowance + A.pad(account) + A.pad(spender)).then(BigInt); },
    balance: function (token) { return call2(token, "0x70a08231" + A.pad(account)).then(BigInt); },
    sign: function (text) { return connect().then(function () { bigTip("签名"); return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(text), account] }); }).then(function (r) { bigTip(""); return r; }, function (e) { bigTip(""); throw e; }); } };
  function call2(to, data) { return W.rpcOn("anubis", "eth_call", [{ to: to, data: data }, "latest"]); }
  function register(label, years, k, say, to) { // to：帮别人注册时填对方地址，名字直接归对方
    tipN = 0; tipAt = Date.now(); tipTotal = k === "LGNS" ? 3 : 2;
    return connect().then(function () { return prepay(yearPrice(label) * years, k, say); }).then(function (p) {
      var who = to || account, data = SEL.register + u256(0xa0) + A.pad(who) + u256(years) + p + str(label);
      return tx(NAMES, data, say, "💰 付注册费：注册 " + label + "." + TLD + (to ? " 给 " + to.slice(0, 6) + "…" + to.slice(-4) : " 给你自己的地址") + "。请在钱包确认");
    });
  }

  function page(rid, arg) {
    // 路由只保留 0x 地址参数，名字自己从网址里取
    var q = decodeURIComponent((location.hash.split("/")[2] || "").split("?")[0]).toLowerCase(), m = q.match(/\.(ailgns|lgns)$/); // ?pri=1 是预言家页跳过来设主名字的标记
    if (q === "otc" || q === "mine") q = ""; // #/names/otc 是菜单「域名 OTC」，不是搜「otc」这个名字
    TLD = m ? m[1] : "ailgns";
    NAMES = CONTRACTS[TLD]; window.__nmTLD = TLD;
    q = q.replace(/\.(ailgns|lgns)$/, "");
    A.app.innerHTML =
      '<section class="card nm-hero"><h2>🌐 .ailgns 域名</h2>' +
      '<ol class="nm-steps" id="nm-steps"><li data-s="1"><b>1</b>注册名字</li><li data-s="2"><b>2</b>设为主名字</li><li data-s="3"><b>3</b>OTC 出售</li></ol>' +
      '<p class="nm-hint" id="nm-hint">👇 输入你想要的名字，下面马上显示能不能注册</p>' +
      '<form class="nm-search" id="nm-f"><input id="nm-q" placeholder="中文、英文都行" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(q) + '"><select id="nm-t" hidden><option value="ailgns">.ailgns</option><option value="lgns">.lgns</option></select><span class="nm-tld">.ailgns</span><button type="submit">搜索</button></form>' +
      '<div id="nm-r"></div><p class="nm-batchrow"><button type="button" class="link" id="nm-batch">📦 想一次注册一批？批量注册（AI 起名 / 5 位数号码 / 自己填）→</button></p><div id="nm-genc"></div></section>' +
      // 💰 价格卡紧跟「立即抢注创世」按钮之后、销毁卡之前（站长 2026-11-09 晚：很多人不知道价格）
      '<section class="card nm-pcard"><div class="card-head"><h2>💰 价格 <small class="muted">每年</small></h2><span class="muted">按名字长度定价</span></div>' +
      '<div class="nm-price nm-pc"><div><b>英文 3 位</b><span>640 DAI</span><small class="nm-q" data-dai="640"></small></div><div><b>英文 4 位</b><span>160 DAI</span><small class="nm-q" data-dai="160"></small></div><div><b>英文 5 位+</b><span>5 DAI</span><small class="nm-q" data-dai="5"></small></div><div><b>中文 2 字</b><span>50 DAI</span><small class="nm-q" data-dai="50"></small></div><div><b>中文 3 字+</b><span>5 DAI</span><small class="nm-q" data-dai="5"></small></div></div>' +
      '<p class="muted">可以用 <b>AiLGNS、DAI、LGNS</b> 付（Anubis 链）。AiLGNS 按 DEX 实时价格换算，<b>不经过 DEX、没有滑点</b>，比先卖成 DAI 再付划算。<span id="nm-px"></span></p>' +
      '<details class="nm-pdet"><summary>注册规则</summary><ul class="nm-rules"><li>可以用<b>中文</b>、小写字母、数字、连字符 -；英文最少 3 位，中文最少 2 个字</li><li>一次买 1–100 年（买 100 年相当于永久）；到期后有 <b>90 天宽限期</b>，只有原主人能续费</li><li>🌟 前 1 万个注册的名字是<b>创世域名</b>，按链上注册顺序永久编号</li><li>每个名字是一个 NFT，可以转让、买卖；转让后自动指向新主人</li><li>🔒 合约开源、无管理员、不能升级，平台也收不走你的名字</li></ul></details></section>' +
      '<div id="nm-burnc"></div>' +
      '<section class="card" id="nm-mycard"><div class="card-head"><h2>🔍 查询域名</h2><button type="button" class="nm-myw" id="nm-myw">👛 查我的钱包</button></div>' +
      '<form class="nm-search" id="nm-myf"><input id="nm-mya" placeholder="输入 0x 钱包地址，或者域名（如 发财.ailgns）" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="submit">查询</button></form>' +
      '<div id="nm-myr"></div></section>' +
      '<section class="card"><div class="card-head"><h2>🏆 成交排行</h2><span class="muted">链上真实成交</span></div><div id="nm-rank"></div></section>' +
      '<section class="card"><div class="card-head"><h2>🛒 域名市场</h2><span class="muted">一手交钱一手交名字 · 手续费 3% 买家付</span></div>' +
        '<div class="seg" id="nm-side"><button type="button" data-side="buy" class="on">我要买域名</button><button type="button" data-side="sell" id="nm-sellgo">我要卖域名</button><button type="button" data-side="want">📢 求购意向</button><button type="button" data-side="mine">📋 我的挂单</button></div>' +
        '<div id="nm-mk"></div><div id="nm-sp" hidden></div><div id="nm-wp" hidden></div><div id="nm-minep" hidden><div id="nm-mo"></div><p class="muted">成交记录在下方 <a href="#" id="nm-toord">🧾 域名订单查询 ↓</a></p></div></section>' +
      '<section class="card" id="nm-ord"><div class="card-head"><h2>🧾 域名订单查询</h2><span class="muted">在挂的单 + 买入 / 卖出记录，链上可查</span></div>' +
      '<div class="nm-rk"><input id="nm-oa" placeholder="填钱包地址 0x…，查挂单和成交" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button" id="nm-ob">查询</button></div><div id="nm-olo"></div><div id="nm-ol"></div></section>';
    document.getElementById("nm-t").value = TLD;
    var nbb = document.getElementById("nm-batch"); if (nbb) nbb.onclick = function () { if (A.namesBatch) A.namesBatch.open(); };
    var tl = document.querySelector(".nm-tld"); if (tl) tl.textContent = "." + TLD;
    var f = document.getElementById("nm-f"), inp = document.getElementById("nm-q"), out = document.getElementById("nm-r");
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = inp.value.trim().toLowerCase().replace(/\.(ailgns|lgns)$/, ""), t = document.getElementById("nm-t").value;
      if (t !== TLD) { location.hash = "#/names/" + encodeURIComponent(v) + "." + t; return; } // 换后缀：整页换成另一个合约
      // 同一个后缀：只换地址栏、不重新加载整页（以前每搜一次整页的市场、排行都重新读链，很慢）
      if (v !== q) { q = v; try { history.replaceState(null, "", "#/names/" + encodeURIComponent(v) + "." + t); } catch (x) { /* 忽略 */ } }
      show(v);
      // 点了「搜索」：收起手机键盘，把结果（注册按钮）滚到眼前
      if (e.isTrusted !== false && !e.auto) { inp.blur(); setTimeout(function () { out.scrollIntoView({ behavior: "smooth", block: "start" }); }, 300); }
    };
    // 边打字边查：停顿 0.4 秒就先去链上查，按「搜索」时结果多半已经好了
    var typing;
    inp.oninput = function () {
      var v = inp.value.toLowerCase(); if (v !== inp.value) inp.value = v;
      clearTimeout(typing);
      v = v.trim().replace(/\.(ailgns|lgns)$/, "");
      var hint = document.getElementById("nm-hint");
      if (hint) hint.innerHTML = v ? "👇 下面就是 <b>" + esc(v) + "." + TLD + "</b> 能不能注册，能注册就点下面的「注册」按钮" : "👇 输入你想要的名字，下面马上显示能不能注册";
      // 停顿一下就自动出结果，不用找「搜索」按钮
      if (valid(v)) typing = setTimeout(function () { if (document.getElementById("nm-t").value === TLD) f.onsubmit({ preventDefault: function () {}, auto: true }); }, 700);
    };
    // 我的域名：填地址（或用当前钱包）→ 列出这个地址名下所有 .ailgns / .lgns 名字，创世域名大大地显示创世徽章
    function myNames(a) {
      var o = document.getElementById("nm-myr");
      if (!/^0x[0-9a-f]{40}$/.test(a)) { A.errTip("地址格式不对：0x 开头，一共 42 位", document.getElementById("nm-myf")); return; }
      var self = a === account;
      if ((A.hidden || {})[a] && !self) { o.innerHTML = '<p class="muted">🔒 这个地址的持有人选择匿名</p>'; return; }
      o.innerHTML = '<p class="muted">查询中…</p>';
      ownedList(a).then(function (all) {
        var HN = A.hiddenNames || {}, list = all.filter(function (x) { return x && x.label && !(A.nameBanned && A.nameBanned(x.label)) && (self || !HN[x.label + "." + x.t]); }); // 涉政名字连自己的列表都不显示
        list.sort(function (x, y) { return (x.no || 1e9) - (y.no || 1e9); });
        if (!list.length) {
          var seen = {}, mv = (movedOf[a] || []).filter(function (x) { var k = x.t + ":" + x.label; if (!x.label || seen[k]) return false; seen[k] = 1; return true; }), sh = function (x) { return x.slice(0, 6) + "…" + x.slice(-4); };
          var onMk = mv.filter(function (x) { return x.to === OTC[x.t]; }); mv = mv.filter(function (x) { return x.to !== OTC[x.t]; });
          o.innerHTML = (onMk.length ? '<div class="nm-mv"><b>🛒 这个钱包有 ' + onMk.length + ' 个域名正在域名市场出售</b>' + onMk.map(function (x) {
            return '<div><a href="#/names/' + encodeURIComponent(x.label + "." + x.t) + '">' + esc(x.label) + "." + x.t + "</a> · 挂单中（暂时托管在市场合约，卖掉前随时可以撤单拿回）</div>";
          }).join("") + "<small>挂单详情、撤单、置顶都在下面的「挂单」列表里。</small></div>" : "") + (mv.length ? '<div class="nm-mv"><b>📦 这个钱包注册/收到过 ' + mv.length + ' 个域名，但现在不在这个钱包：</b>' + mv.map(function (x) {
            return '<div><a href="#/names/' + encodeURIComponent(x.label + "." + x.t) + '">' + esc(x.label) + "." + x.t + "</a> → 现在在 <code>" + sh(x.to) + "</code></div>";
          }).join("") + '<small>说明域名已经转到别的钱包（或卖掉了）。用上面显示的那个钱包登录/查询，就能看到它。</small></div>'
            : onMk.length ? "" : '<p class="muted">这个地址钱包里没有域名（刚注册的等 10 秒再查）。</p><p class="muted">💡 如果你确定注册过：可能是用<b>另一个钱包</b>注册的。换成注册时付款的那个钱包地址再查一次。</p>') + '<div id="nm-myo"></div>'; paidRec(a, o, self); myOpen(a, document.getElementById("nm-myo")); return; }
        var g = list.filter(function (x) { return x.no; }).length;
        o.innerHTML = '<p class="nm-my-sum" id="nm-mysum">共 <b>' + list.length + "</b> 个域名" + (g ? "，其中 <b>" + g + "</b> 个是🌟创世域名" : "") + "</p>" + list.map(function (x) {
          var full = '<span class="nm-my-l">' + esc(x.label) + '</span><span class="nm-my-tld">.' + x.t + "</span>";
          var href = "#/names/" + encodeURIComponent(x.label + "." + x.t);
          return '<div class="nm-my' + (x.no ? " gen" : "") + '"><a class="nm-my-a" href="' + href + '">' +
            (x.no ? genEmblem(68) : '<span class="nm-my-dot">🌐</span>') +
            '<span class="nm-my-t"><b>' + full + "</b>" + (x.no ? '<em class="nm-my-no">创世域名 #' + x.no + "</em>" : "") + (x.exp ? "<small>到期 " + date(x.exp) + "</small>" : "") + "</span></a>" +
            (self ? '<span class="nm-my-btns">' + giveBtn(x.t, x.id, x.label + "." + x.t) + '<button type="button" class="nm-my-sell" data-full="' + esc(x.label + "." + x.t) + '">挂单出售</button></span>' : "") + "</div>";
        }).join("") + '<div id="nm-myo"></div>';
        var n0 = list.length;
        var ts = {}; list.forEach(function (x) { ts[x.t] = 1; });
        Object.keys(ts).forEach(function (t) {
          W.rpcOn("anubis", "eth_call", [{ to: CONTRACTS[t], data: SEL.nameOf + A.pad(a) }, "latest"]).then(function (x) { try { return decStr(x); } catch (e) { return ""; } }, function () { return null; }).then(function (p) {
            var sm = document.getElementById("nm-mysum"); if (!sm) return;
            var d = document.createElement("div"); d.className = "nm-mv";
            if (p === "") { d.innerHTML = "<b>⚠️ 这个钱包还没设 ." + t + " 主名字（主号）</b>" + (self ? "不设主名字就<b>不能玩预言家、不能发站内信</b>。点下面任意一个名字进去，按「设为我的主名字」就行（免费，只付一点 Gas）。" : "<small>如果这是你的钱包：点右上角<b>连接钱包</b>（连这个钱包），再点下面任意一个名字进去，按「设为我的主名字」。</small>"); }
            else if (self) {
              // 已有主名字：给「取消主名字」（站长 2026-11-09）。合约 setPrimary(0) 就是取消，不用改合约
              d.innerHTML = "<b>✅ 这个钱包的 ." + t + " 主名字：" + esc(p) + "." + t + '</b> <button type="button" class="ghost nm-unpri">取消主名字</button><small>取消后你的地址在本站重新显示成 0x…，<b>不能玩预言家、不能发站内信</b>。想换成另一个名字不用先取消，直接进那个名字的页面点「设为我的主名字」就行。不花钱，只付一点 Gas。</small><p class="muted nm-st" hidden></p>';
              d.querySelector(".nm-unpri").onclick = function () {
                var b = this, st = d.querySelector(".nm-st");
                if (!confirm("确定取消主名字 " + p + "." + t + "？取消后不能玩预言家、不能发站内信，随时可以再设回来。")) return;
                b.disabled = true; st.hidden = false;
                tx(CONTRACTS[t], SEL.setPrimary + "0".repeat(64), function (m) { st.textContent = m; }, "🔒 取消主名字（不花钱，只付一点 Gas）。请在钱包确认").then(function () {
                  if (A.nameCache) A.nameCache[a] = "";
                  d.innerHTML = "<b>✅ 已取消 ." + t + " 主名字</b><small>你的地址在本站重新显示成 0x…。想再设，点任意一个名字进去按「设为我的主名字」（免费）。</small>";
                }, function (e) { b.disabled = false; st.textContent = ""; A.errTip((e && e.message) || String(e), b); });
              };
            } else return;
            sm.parentNode.insertBefore(d, sm);
          });
        });
        paidRec(a, o, self); myOpen(a, document.getElementById("nm-myo")).then(function (k) { var sm = document.getElementById("nm-mysum"); if (sm && k) sm.innerHTML = "共 <b>" + (n0 + k) + "</b> 个域名：钱包里 <b>" + n0 + "</b> 个" + (g ? "（🌟创世 " + g + " 个）" : "") + " + <b>挂单中 " + k + "</b> 个（在最下面，卖出后就不算了）"; }); // 挂在市场里的名字在托管合约名下，钱包里查不到：单独列在下面
      }, function () { o.innerHTML = '<p class="muted">查询失败，请稍后再试</p>'; });
    }
    // 「我要卖」：连钱包 → 列出我名下的域名 → 每个旁边「挂单出售」→ 打开这个名字的页面并直接弹出挂单设置
    document.getElementById("nm-side").onclick = function (e) {
      var b = e.target.closest("button[data-side]"); if (!b) return;
      var side = b.getAttribute("data-side");
      this.querySelectorAll("button").forEach(function (x) { x.className = x === b ? "on" : ""; });
      document.getElementById("nm-mk").hidden = side !== "buy"; document.getElementById("nm-sp").hidden = side !== "sell"; document.getElementById("nm-wp").hidden = side !== "want"; document.getElementById("nm-minep").hidden = side !== "mine";
      if (side === "sell") sellPanel();
      if (side === "want") wantPanel();
      if (side === "mine") {
        var mo = document.getElementById("nm-mo"); mo.innerHTML = '<p class="muted">连接钱包后显示你正在挂的单…</p>';
        connect().then(function () { myOpen(account, mo); var oi = document.getElementById("nm-oa"); if (oi) { oi.value = account; orders(account); } }, function (e) { mo.innerHTML = '<p class="muted">请先连接钱包</p>'; A.errTip(e.message || String(e), b); });
      }
    };
    document.getElementById("nm-myr").onclick = function (e) {
      var gv = e.target.closest(".nm-my-give"); if (gv) { giveForm(gv); return; }
      var b = e.target.closest(".nm-my-sell"); if (!b) return;
      try { sessionStorage.setItem("nm:sellpick", b.getAttribute("data-full")); } catch (x) { /* 忽略 */ }
      var sg = document.getElementById("nm-sellgo"); sg.click(); sg.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    document.getElementById("nm-myf").onsubmit = function (e) {
      e.preventDefault();
      var a = document.getElementById("nm-mya").value.trim().toLowerCase();
      if (/^0x[0-9a-f]{40}$/.test(a)) { myNames(a); return; }
      if (/^0x[0-9a-f]*$/.test(a)) { A.errTip("地址不完整：0x 开头，一共 42 位", e.target); return; }
      lookName(a);
    };
    document.getElementById("nm-myw").onclick = function () {
      connect().then(function () { document.getElementById("nm-mya").value = account; myNames(account); }, function (e) { A.errTip(e.message || String(e), document.getElementById("nm-myw")); });
    };
    if (/^#\/names\/mine/.test(location.hash)) setTimeout(function () { document.getElementById("nm-mycard").scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
    // 🎁 转赠：主人把名字转给别的地址（比如小号转大号）。不扣钱，只花一点 Gas；对方可以填 0x 地址或域名
    function giveBtn(t, id, full) { return '<button type="button" class="nm-my-give" data-t="' + t + '" data-id="' + id + '" data-full="' + esc(full) + '">🎁 转赠</button>'; }
    function giveForm(b) {
      var item = b.closest(".nm-my"), old = item.nextElementSibling;
      if (old && old.classList.contains("nm-give")) { old.remove(); return; }
      var t = b.getAttribute("data-t"), id = b.getAttribute("data-id"), full = b.getAttribute("data-full"), box = document.createElement("div");
      box.className = "nm-give";
      box.innerHTML = '<p>把 <b>' + esc(full) + '</b> 转给：</p><div class="nm-search"><input placeholder="对方的 0x 地址，或对方的域名" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button">确认转赠</button></div><p class="muted nm-st"></p>';
      item.after(box);
      var inp = box.querySelector("input"), go = box.querySelector("button"), st = box.querySelector(".nm-st"), say = function (x) { st.textContent = x; };
      inp.focus();
      go.onclick = function () {
        var v = inp.value.trim().toLowerCase();
        if (!v) { A.errTip("请填对方的地址或域名", go); return; }
        go.disabled = true;
        var toP;
        if (/^0x[0-9a-f]{40}$/.test(v)) toP = Promise.resolve(v);
        else {
          var m = v.match(/^(.+?)(?:\.(ailgns|lgns))?$/), lb = m && m[1], tt = (m && m[2]) || "ailgns";
          if (!lb || /^0x/.test(v) || /\s|\./.test(lb)) { go.disabled = false; A.errTip("地址不对：0x 开头一共 42 位，或者填对方的域名", go); return; }
          say("查询 " + lb + "." + tt + " 指向的地址…");
          toP = W.rpcOn("anubis", "eth_call", [{ to: CONTRACTS[tt], data: SEL.resolve + "0000000000000000000000000000000000000000000000000000000000000020" + str(lb) }, "latest"]).then(function (r) {
            var ad = addrOf(r); if (/^0x0{40}$/.test(ad)) throw new Error(lb + "." + tt + " 还没被注册，或者没有指向地址"); return ad;
          });
        }
        var to;
        toP.then(function (ad) {
          to = ad;
          return eth ? null : connect();
        }).then(function () {
          if (to === account) throw new Error("不能转给自己（就是你现在连接的钱包）");
          return W.rpcOn("anubis", "eth_call", [{ to: CONTRACTS[t], data: SEL.ownerOf + id }, "latest"]);
        }).then(function (ow) {
          if (addrOf(ow) !== account) throw new Error("这个名字不在你当前连接的钱包里（主人是 " + A.short(addrOf(ow)) + "），请切换到主人钱包");
          if (!confirm("确认把 " + full + " 转给\n" + to + " 吗？\n\n转出后名字归对方，不能撤回。")) throw new Error("已取消");
          return tx(CONTRACTS[t], "0x23b872dd" + A.pad(account) + A.pad(to) + id, say, "🎁 转赠 " + full + " 给 " + to.slice(0, 6) + "…" + to.slice(-4) + "。请在钱包确认");
        }).then(function () {
          say("✅ 已转给 " + A.short(to) + "，名字已经到对方钱包");
          genCache = {}; setTimeout(function () { myNames(account); }, 1500);
        }, function (e) { go.disabled = false; say(""); if (e && e.message !== "已取消") A.errTip((e && e.message) || "转赠失败", go); });
      };
    }
    // 查一个域名：是谁的、指向哪里、是不是创世域名（创世的大大地显示创世徽章）；站长和保护名单显示匿名
    function lookName(a) {
      var o = document.getElementById("nm-myr"), btn = document.getElementById("nm-myf");
      function on(c, data) { return W.rpcOn("anubis", "eth_call", [{ to: c, data: data }, "latest"]); }
      var PROT = A.hidden || {}, HN = A.hiddenNames || {};
      var m = a.match(/^(.+?)(?:\.(ailgns|lgns))?$/), label = m && m[1], t = (m && m[2]) || TLD;
      if (!label || /\s|\./.test(label)) { A.errTip("请输入 0x 钱包地址，或者域名（比如 发财.ailgns）", btn); return; }
      var full = label + "." + t, s = "0000000000000000000000000000000000000000000000000000000000000020" + str(label);
      o.innerHTML = '<p class="muted">查询中…</p>';
      Promise.all([on(CONTRACTS[t], SEL.resolve + s), on(CONTRACTS[t], SEL.idOf + s)]).then(function (r) {
        var ad = addrOf(r[0]), id = r[1].slice(2);
        return on(CONTRACTS[t], SEL.ownerOf + id).then(function (ow) { return addrOf(ow); }, function () { return ""; }).then(function (owner) {
          if (!owner || /^0x0{40}$/.test(owner)) { o.innerHTML = '<p class="nm-ok">🎉 <b>' + esc(full) + '</b> 还没被注册，<a href="#/names/' + encodeURIComponent(full) + '">现在去注册 →</a></p>'; return; }
          var anon = PROT[ad] || PROT[owner] || HN[full], sale = owner === OTC[t];
          // 页面打开后才注册的名字不在旧的创世编号表里：查不到就重新读一次链（刚注册的也能马上显示创世编号）
          var gP = genesis(t).then(function (g) { if (g[id]) return g; delete genCache[t]; genApi = null; return genesis(t); }).catch(function () { return {}; });
          return gP.then(function (g) {
            var no = anon ? 0 : g[id], href = "#/names/" + encodeURIComponent(full);
            o.innerHTML = '<div class="nm-my' + (no ? " gen" : "") + '"><a class="nm-my-a" href="' + href + '">' + (no ? genEmblem(68) : '<span class="nm-my-dot">🌐</span>') +
              '<span class="nm-my-t"><b><span class="nm-my-l">' + esc(label) + '</span><span class="nm-my-tld">.' + t + "</span></b>" + (no ? '<em class="nm-my-no">创世域名 #' + no + "</em>" : "") + rarTag(label) +
              "<small>" + (anon ? "🔒 持有人选择匿名" : sale ? "🛒 正在域名市场出售，点开可以买" : "主人 " + A.nameTag(owner)) + "</small></span></a>" +
              (account && owner === account ? '<span class="nm-my-btns">' + giveBtn(t, id, full) + "</span>" : "") + "</div>" +
              (anon || sale ? "" : '<p class="muted" style="word-break:break-all">指向地址：<span class="mono">' + ad + "</span></p>");
          });
        });
      }).catch(function () { o.innerHTML = '<p class="muted">查询失败，请稍后再试</p>'; });
    }

    // 续费框：选年数（最长「永久」= 合约允许的最多年数：到期时间最多到现在 + 101 年）
    function renewBox(v, exp) {
      var Y = 365 * 86400, now = Date.now() / 1000, max = Math.min(100, Math.floor((now + 101 * Y - exp - 86400) / Y));
      if (max < 1) return '<div class="nm-renewbox"><b>🔄 续费</b><p class="muted">已经续满（永久），不用再续</p></div>';
      var opts = [1, 2, 3, 5, 10].filter(function (y) { return y < max; }).concat([max]);
      return '<div class="nm-renewbox"><div class="nm-rb-h"><b>🔄 续费</b><small class="muted">谁都能帮续 · 名字还是原主人的</small></div>' +
        '<div class="nm-pay nm-yrs" id="nm-ry" data-max="' + max + '">' + opts.map(function (y, i) { return '<button type="button" data-y="' + y + '"' + (i ? "" : ' class="on"') + ">" + (y === max && y > 10 ? "♾️ 永久（" + y + " 年）" : y + " 年") + "</button>"; }).join("") + "</div>" +
        '<p class="nm-total" id="nm-rtot"></p><div class="nm-rb-f"><label class="nm-rk">用 ' + tokSel("nm-rk") + ' 付</label><button type="button" class="nm-go" id="nm-renew">续费</button></div></div>';
    }
    var showSeq = 0;
    function show(v) {
      var my = ++showSeq;
      if (!v) { out.innerHTML = ""; return; }
      if (A.nameBanned && A.nameBanned(v)) { out.innerHTML = '<p class="nm-bad">「' + esc(v) + '」这个名字本站不开放注册，也不会显示，请换一个。</p>'; return; }
      if (!valid(v)) { out.innerHTML = '<p class="nm-bad">「' + esc(v) + '」不能用：可以用中文、小写字母、数字、-；英文最少 3 位，中文最少 2 个字，最多 32 个字，不能以 - 开头或结尾</p>'; return; }
      var buy = '<div class="nm-yr"><span class="nm-yr-t">买几年</span><select id="nm-y" hidden>' + [1, 2, 3, 5, 10, 100].map(function (y) { return '<option value="' + y + '">' + y + " 年</option>"; }).join("") + "</select>" +
        '<span class="nm-pay nm-yrs" data-for="nm-y">' + [1, 2, 3, 5, 10, 100].map(function (y, i) { return '<button type="button" data-k="' + y + '"' + (i ? "" : ' class="on"') + ">" + (y === 100 ? "100 年<small>永久</small>" : y + " 年") + "</button>"; }).join("") + "</span></div>" +
        '<p class="nm-total" id="nm-total"></p><div class="nm-buy"><label>付款 ' + tokSel("nm-k") + '</label><b id="nm-cost">' + yearPrice(v) + ' DAI</b></div>' +
        '<label class="nm-for"><input type="checkbox" id="nm-for"> 🤝 帮别人注册（志愿者代办：我付钱，名字归对方）</label>' +
        '<div class="nm-for-box" id="nm-for-box" hidden><input id="nm-to" placeholder="对方的钱包地址 0x…" autocomplete="off" autocapitalize="none" spellcheck="false"><p class="muted">名字会直接注册到对方地址上，对方什么都不用点。请仔细核对地址，填错了收不回来。</p></div>' +
        '<button type="button" class="nm-go" id="nm-go">注册 ' + esc(v) + "." + TLD + "</button><p class=\"muted nm-st\" id=\"nm-st\"></p>";
      if (!NAMES) {
        out.innerHTML = '<p class="nm-ok"><b>' + esc(v) + "." + TLD + '</b> 名字合规，' + yearPrice(v) + " DAI / 年</p>" + buy;
        bindBuy(v, true);
        return;
      }
      out.innerHTML = '<p class="muted">查询中…</p>';
      info(v).then(function (r) {
        if (my !== showSeq) return; // 已经换了别的名字，这个结果作废
        // .lgns 暂停新注册（站长决定先只开放 .ailgns）；已注册的老名字照常显示、续费、转赠、改指向
        if (r.free && TLD === "lgns") { out.innerHTML = '<p class="muted">.lgns 暂不开放注册，<a href="#/names/' + encodeURIComponent(v) + '.ailgns">看看 ' + esc(v) + '.ailgns →</a></p>'; return; }
        if (r.free) { stepTo(1); out.innerHTML = '<p class="nm-ok">🎉 <b>' + esc(v) + "." + TLD + "</b> 可以注册！</p>" + rarTag(v) + buy; bindBuy(v); return; }
        var mine = account && r.owner === account, now = Date.now() / 1000;
        var anon = !mine && (PROTECT[r.owner] || PROTECT[r.addr] || (A.hiddenNames || {})[v + "." + TLD]); // 匿名持有人：不显示地址、编号
        var onSale = r.owner && r.owner === OTC[TLD];
        out.innerHTML = (onSale ? '<div class="nm-sale" id="nm-sale"><p class="muted">🛒 这个名字正在市场出售，读取价格中…</p></div>' : "") + '<p class="nm-bad"><b>' + esc(v) + "." + TLD + "</b> 已被注册</p>" +
          '<dl class="nm-dl"><dt>指向地址</dt><dd class="mono">' + (anon ? "🔒 匿名" : onSale ? "🛒 域名市场托管中（挂单出售）" : r.addr !== ZERO ? r.addr : "—") + "</dd><dt>主人</dt><dd class=\"mono\">" + (anon ? "🔒 匿名持有人" : onSale ? "🛒 域名市场托管中，卖出后直接过户给买家" : r.owner || "已过期（宽限期中）") + "</dd><dt>到期</dt><dd>" + date(r.exp) + (r.exp < now ? "（宽限期到 " + date(r.exp + 90 * 86400) + "）" : "") + "</dd></dl>" +
          rarTag(v) + '<p class="nm-gen" id="nm-gen"></p>' + (onSale ? "" : mine ? renewBox(v, r.exp) : '<div class="nm-taken">❌ <b>' + esc(v + "." + TLD) + '</b> 已经被别人注册了，<b>不能注册</b>。请换一个名字。</div><details class="nm-rdet"><summary>我是持有人的朋友，要帮他续费（名字不会变成你的）</summary>' + renewBox(v, r.exp) + '</details>') + '<p class="muted nm-st" id="nm-st"></p>' +
          (mine ? '<div id="nm-next"></div>' : anon ? "" : '<div id="nm-next"></div><a class="nm-scan" href="#/scan/' + encodeURIComponent(v + "." + TLD) + '">🔎 链上查询这个名字 →</a>') +
          (mine ? '<div class="nm-act"><button type="button" id="nm-set">改指向地址</button>' + (OTC[TLD] && TLD === "ailgns" ? '<button type="button" id="nm-sell">挂到市场卖</button>' : "") + "</div>" : "");
        var st = document.getElementById("nm-st"), say = function (t) { st.textContent = t; };
        if (!anon) genesis().then(function (g) { var e = document.getElementById("nm-gen"); if (e && g[r.id]) e.textContent = "🌟 创世域名 #" + g[r.id]; }, function () {});
        var rn = document.getElementById("nm-renew");
        if (rn) {
          var ry = document.getElementById("nm-ry"), rt = document.getElementById("nm-rtot");
          var yrs = function () { var b = ry.querySelector(".on"); return b ? Number(b.getAttribute("data-y")) : 1; };
          var paint = function () {
            var y = yrs(), ex = new Date((r.exp + y * 365 * 86400) * 1000);
            rt.innerHTML = "续费 <b>" + y + " 年</b>：" + yearPrice(v) + " DAI × " + y + " = <b>" + yearPrice(v) * y + " DAI</b> · 新到期 <b>" + date(ex / 1000) + "</b>";
            rn.textContent = "🔄 续费 " + (b100(y) ? "到永久（" + y + " 年）" : y + " 年") + " · " + yearPrice(v) * y + " DAI";
          };
          var b100 = function (y) { return y === Number(ry.getAttribute("data-max")) && y > 10; };
          ry.onclick = function (e) { var b = e.target.closest("button[data-y]"); if (!b) return; ry.querySelectorAll("button").forEach(function (x) { x.className = x === b ? "on" : ""; }); paint(); };
          paint();
          rn.onclick = function () {
            var k = document.getElementById("nm-rk").value, y = yrs();
            connect().then(function () { return prepay(yearPrice(v) * y, k, say); })
              .then(function (p) { return tx(NAMES, SEL.renew + u256(0x80) + u256(y) + p + str(v), say, "💰 付续费：续费 " + y + " 年（" + yearPrice(v) * y + " DAI）。请在钱包确认"); })
              .then(function () { say("✅ 续费成功"); delete infoCache[TLD + ":" + v]; show(v); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
          };
        }
        if (onSale) listings().then(function (ls) {
          var it = ls.filter(function (x) { return x.t === TLD && x.tid === r.id && !x.expired; })[0], sb = document.getElementById("nm-sale");
          if (!sb) return;
          if (!it) { sb.innerHTML = '<p class="muted">🛒 这个名字在市场合约里（挂单可能刚过期，等卖家取回）</p>'; return; }
          var p = Number(it.price / 10n ** 12n) / 1e6, me = account && it.maker === account;
          sb.innerHTML = '<p class="nm-sale-t">🛒 <b>' + esc(v) + "." + TLD + '</b> 正在出售</p><p class="nm-sale-p"><b>' + p + ' DAI</b><small>买家付 ' + Math.round(p * 1.03 * 1e6) / 1e6 + " DAI（含 3%）· 剩 " + leftT(it.expiry - Date.now() / 1000) + '</small></p><p class="muted">卖家 <span class="mono">' + (me ? "我" : A.nameTag ? A.nameTag(it.maker) : A.short(it.maker)) + '</span></p>' +
            '<button type="button" class="nm-go" id="nm-salego">' + (me ? "撤单" : "立即买入") + '</button><p class="muted nm-st" id="nm-sst"></p>';
          var sg = document.getElementById("nm-salego"), sst = document.getElementById("nm-sst");
          sg.onclick = function () { sg.disabled = true; buyIt(it, sg, function (t) { sst.textContent = t; }).then(function () { sst.textContent = "✅ 成功"; delete infoCache[TLD + ":" + v]; show(v); market(); ordAfter(); }, function (e) { sg.disabled = false; sst.textContent = ""; A.errTip(e.message || String(e), sg); }); };
        });
        if (!mine) { stepTo(1); if (r.owner && !/^0x0+$/.test(r.owner)) priHint(document.getElementById("nm-next"), v, r.owner); return; }
        guide(document.getElementById("nm-next"), v, r);
        document.getElementById("nm-set").onclick = function () {
          var a = (prompt("让 " + v + "." + TLD + " 指向哪个地址？", account) || "").trim().toLowerCase();
          if (!a) return;
          if (!/^0x[0-9a-f]{40}$/.test(a)) { A.errTip("地址格式不对", st); return; }
          tx(NAMES, SEL.setAddr + r.id + A.pad(a), say, "🔒 修改指向地址。请在钱包确认").then(function () { say("✅ 已修改"); show(v); }, function (e) { say(""); A.errTip(e.message || String(e), st); });
        };
        var sell = document.getElementById("nm-sell");
        if (sell) sell.onclick = function () { sellForm(v, r, st); };
        var want = null; try { want = sessionStorage.getItem("nm:sell"); } catch (x) { /* 忽略 */ }
        if (want && want === v + "." + TLD) { try { sessionStorage.removeItem("nm:sell"); } catch (x) { /* 忽略 */ } if (sell) sell.click(); else A.errTip("这个名字现在不能挂单（可能已经在市场里了）", st); }
      }, function () { out.innerHTML = '<p class="muted">查询失败，请稍后再试</p>'; });
    }
    // 挂单设置页：和 OTC「发布挂单」同一套样式（价格 + 有效期 + 到手金额），代替原来的弹窗
    function sellForm(v, r, st) {
      var old = document.getElementById("nm-sf"); if (old) old.remove();
      var DURS = [[86400, "1 天"], [3 * 86400, "3 天"], [7 * 86400, "7 天"], [15 * 86400, "15 天"], [30 * 86400, "30 天"]], dur = 30 * 86400; // 站长 2026-11-09：默认挂满 30 天（合约上限），别让名字静悄悄下架
      var box = document.createElement("section");
      box.className = "card"; box.id = "nm-sf";
      box.innerHTML = '<div class="card-head"><h2>挂单出售 ' + esc(v + "." + TLD) + '</h2><span class="muted">名字先存进托管合约，成交前随时可撤</span></div>' +
        '<div class="form-grid"><label>售价（DAI）<input id="nm-sf-p" inputmode="decimal" placeholder="例如 100"></label></div>' +
        '<div class="dur"><span class="dur-t">有效期 <small class="muted">到期没卖掉，名字自动退回</small></span>' +
        '<div class="dur-opts" id="nm-sf-d">' + DURS.map(function (d) { return '<button type="button" data-d="' + d[0] + '"' + (d[0] === dur ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") + "</div></div>" +
        '<p class="note" id="nm-sf-sum">填好售价后显示你能拿到多少</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap"><button id="nm-sf-go" style="padding:12px 22px">发布挂单</button><button type="button" class="ghost" id="nm-sf-x" style="padding:12px 22px">取消</button></div>' +
        '<p class="note" id="nm-sf-st"></p>';
      out.appendChild(box);
      box.scrollIntoView({ behavior: "smooth", block: "start" });
      var pi = document.getElementById("nm-sf-p"), sum = document.getElementById("nm-sf-sum"), sst = document.getElementById("nm-sf-st"), go = document.getElementById("nm-sf-go");
      function ok(p) { return /^\d+(\.\d{1,6})?$/.test(p) && Number(p) > 0; }
      function upd() {
        var p = pi.value.trim();
        sum.innerHTML = ok(p) ? "你拿到 <b>" + Number(p) + " DAI</b>（完整标价）· 买家付 " + Math.round(Number(p) * 1.03 * 1e6) / 1e6 + " DAI（含 3% 手续费）" : "填好售价后显示你能拿到多少";
      }
      pi.oninput = upd; setTimeout(function () { pi.focus(); }, 300);
      document.getElementById("nm-sf-d").onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return;
        dur = Number(b.getAttribute("data-d"));
        this.querySelectorAll("button").forEach(function (x) { x.className = x === b ? "on" : ""; });
      };
      document.getElementById("nm-sf-x").onclick = function () { box.remove(); };
      function say(t) { sst.textContent = t; }
      go.onclick = function () {
        var p = pi.value.trim();
        if (!ok(p)) { A.errTip("价格格式不对，填数字，比如 100", go); return; }
        // 名字在挂单期间 + 30 天内不能到期，防止挂在市场里过期
        if (r.exp < Date.now() / 1000 + dur + 30 * 86400) { A.errTip("名字快到期了，先续费再挂单（或选短一点的有效期）", go); return; }
        var wei = BigInt(Math.round(Number(p) * 1e6)) * 10n ** 12n, O = OTC[TLD];
        go.disabled = true;
        nftOk(NAMES, O, r.id, say).then(function () {
          return tx(O, SEL.oList + r.id + u256(wei) + u256(dur), say, "🔒 第 2 步：挂单 " + p + " DAI，名字存进市场合约。请在钱包确认");
        }).then(function () { say("✅ 已挂到市场"); listedDone(v, p); market(); show(v); }, function (e) { go.disabled = false; say(""); A.errTip(e.message || String(e), go); });
      };
    }
    // 傻瓜式三步：① 注册 ② 设为主名字 ③ OTC 出售（站长要求去掉「链上查询」）。每步做完都能「继续注册下一个」，并显示我注册了几个、排第几
    function again() { // 回到第 1 步，接着注册下一个
      inp.value = ""; out.innerHTML = ""; stepTo(1);
      history.replaceState(null, "", "#/names");
      inp.scrollIntoView({ behavior: "smooth", block: "center" }); inp.focus();
    }
    function mine(box) { // 我注册了几个、排第几（.ailgns 和 .lgns 合起来算，只算付费注册）
      if (!account) return;
      regStats(account).then(function (x) {
        if (!x.n) return;
        box.innerHTML = '<div class="nm-mine">🏅 你已注册 <b>' + x.n + "</b> 个域名，排第 <b>" + x.rank + "</b> 名（共 " + x.total + " 人）" +
          (x.rank > 1 ? "，再注册 <b>" + x.gap + "</b> 个就超过第 " + (x.rank - 1) + " 名" : "，👑 你是注册王！") + "</div>";
      }, function () {});
    }
    function guide(box, v, r) {
      var full = v + "." + TLD;
      call(SEL.nameOf + A.pad(account)).then(function (x) { return decStr(x) === v; }, function () { return false; }).then(function (done) {
        if (done) {
          stepTo(3);
          box.innerHTML = '<div class="nm-guide"><p class="nm-ok">✅ 第 2 步完成：<b>' + esc(full) + '</b> 是你的主名字，你的地址在本站会显示成这个名字</p>' + (TLD === "ailgns" ? '<a class="nm-go nm-go-or" href="#/oracle">🔮 现在就能玩预言家了，去预测 →</a>' : "") + '<div id="nm-mine"></div>' +
            (OTC[TLD] ? '<button type="button" class="nm-go nm-go4" id="nm-go4">第 3 步：挂到 OTC 市场出售</button><p class="muted">想转手赚钱就挂单：你定价格，买家付 DAI 后名字自动过户，你拿完整标价（买家另付 3% 手续费）。不卖就不用做这一步。</p>' : "") +
            '<button type="button" class="nm-go nm-again" id="nm-again">➕ 继续注册下一个</button></div>';
          mine(document.getElementById("nm-mine"));
          document.getElementById("nm-again").onclick = again;
          var g4 = document.getElementById("nm-go4");
          if (g4) g4.onclick = function () {
            var sell = document.getElementById("nm-sell");
            if (sell) sell.click(); else show(v); // 刚注册完的页面没有挂单按钮，先刷新成完整页面
          };
          return;
        }
        stepTo(2);
        if (r.addr !== account) {
          if (r.owner !== account) { box.innerHTML = '<div class="nm-guide"><p class="muted">这个名字不在你当前连接的钱包里，请切换到注册它的钱包再打开。</p></div>'; return; }
          box.innerHTML = '<div class="nm-guide"><button type="button" class="nm-go" id="nm-fix">第 2 步：把名字指向我的地址</button>' +
            '<p class="muted">不花钱，只付一点 Gas。做完再点一次「设为主名字」就完成了。</p><p class="muted nm-st" id="nm-fst"></p></div>';
          var fb = document.getElementById("nm-fix"), fst = document.getElementById("nm-fst");
          fb.onclick = function () {
            fb.disabled = true;
            tx(NAMES, SEL.setAddr + r.id + A.pad(account), function (t) { fst.textContent = t; }, "🔒 把名字指向你的地址（不花钱，只付一点 Gas）。请在钱包确认")
              .then(function () { delete infoCache[TLD + ":" + v]; show(v); }, function (e) { fb.disabled = false; fst.textContent = ""; A.errTip(e.message || String(e), fb); });
          };
          return;
        }
        box.innerHTML = '<div class="nm-guide nm-pri-box"><p class="nm-pri-why">⚠️ <b>还差最后一步才能玩预言家、发站内信</b><small>注册好了，但钱包还没「认」这个名字。不设主名字，预言家页会提示「没有资格」。</small></p><div id="nm-mine"></div><button type="button" class="nm-go nm-go-pri" id="nm-pri">第 2 步：设为我的主名字（免费）</button>' +
          '<p class="muted">点了之后钱包会弹出来，按「确认」就好。不花钱，只付一点 Gas。设好后，别人在本站看到你的地址，就显示 <b>' + esc(full) + '</b>，预言家页马上就能参加。一个钱包只有一个主名字。</p><p class="muted nm-st" id="nm-pst"></p>' +
          '<button type="button" class="nm-skip" id="nm-again">这个钱包已经有主名字了，跳过 →</button></div>';
        if (/[?&]pri=1/.test(location.hash)) setTimeout(function () { var e = document.getElementById("nm-pri"); if (e) e.scrollIntoView({ behavior: "smooth", block: "center" }); }, 200);
        mine(document.getElementById("nm-mine"));
        document.getElementById("nm-again").onclick = again;
        var b = document.getElementById("nm-pri"), pst = document.getElementById("nm-pst");
        b.onclick = function () {
          b.disabled = true;
          tx(NAMES, SEL.setPrimary + r.id, function (t) { pst.textContent = t; }, "🔒 设置主名字（不花钱，只付一点 Gas）。请在钱包确认")
            .then(function () { show(v); }, function (e) { b.disabled = false; pst.textContent = ""; A.errTip(e.message || String(e), b); });
        };
      });
    }
    function stepTo(n) {
      document.querySelectorAll("#nm-steps li").forEach(function (li) {
        var s = Number(li.getAttribute("data-s"));
        li.className = s < n ? "done" : s === n ? "on" : "";
      });
    }

    // 自动选币：查钱包里哪种币够付，直接帮客户选好（大爷大妈不用自己挑）；都不够就大字说明
    function autoPick(v, y, kk) {
      if (!account) return;
      var dai = yearPrice(v) * y.value, ks = Object.keys(TOK), tip = document.getElementById("nm-pick");
      Promise.all(ks.map(function (k) {
        return Promise.all([quote(dai, k).then(function (q) { return k === "LGNS" ? topUp(q).then(function (e) { return q + e; }) : q; }),
          W.rpcOn("anubis", "eth_call", [{ to: TOK[k].a, data: "0x70a08231" + A.pad(account) }, "latest"]).then(BigInt)]).then(function (x) { return x[1] >= x[0] * 102n / 100n; }, function () { return false; });
      })).then(function (ok) {
        if (!document.getElementById("nm-go")) return;
        var i = ok.indexOf(true), box = tip || document.createElement("p");
        box.id = "nm-pick"; box.className = "nm-pick";
        if (!tip) document.getElementById("nm-go").before(box);
        if (i < 0) { box.innerHTML = "⚠️ 你的钱包里 AiLGNS、DAI、LGNS 都不够付这个名字。<b>活期 / 质押里的币不算，要先「赎回」取回钱包；或者找志愿者帮你代注册。</b>"; return; }
        if (kk.value !== ks[i]) { var pb = document.querySelector('.nm-pay button[data-k="' + ks[i] + '"]'); if (pb) pb.click(); }
        box.innerHTML = "✅ 已自动帮你选好：用你钱包里的 <b>" + ks[i] + "</b> 付款，直接点下面蓝色按钮就行";
      });
    }
    function bindBuy(v, preview) {
      var y = document.getElementById("nm-y"), st = document.getElementById("nm-st");
      var kk = document.getElementById("nm-k"), cost = document.getElementById("nm-cost");
      var cn = document.getElementById("nm-cn");
      if (!cn) { cn = document.createElement("p"); cn.id = "nm-cn"; cn.className = "nm-cn"; document.getElementById("nm-go").before(cn); }
      y.onchange = kk.onchange = function () { // 换年数或币种：显示要付多少个币
        var dai = yearPrice(v) * y.value, k = kk.value, yy = Number(y.value), ex = new Date(); ex.setFullYear(ex.getFullYear() + yy);
        var tt = document.getElementById("nm-total");
        if (tt) tt.innerHTML = "📅 买 <b>" + (yy === 100 ? "100 年（永久）" : yy + " 年") + "</b>：" + yearPrice(v) + " DAI × " + yy + " 年 = 一共 <b>" + dai + " DAI</b> · 到期 " + date(ex / 1000) + (yy === 100 ? "" : "<small>（到期前可以续费）</small>");
        cn.className = "nm-cn" + (k === "LGNS" ? " nm-cn-warn" : "");
        cn.innerHTML = k === "LGNS" ? "⚠️ <b>用 LGNS 付要多付卖出税差，分 2 笔扣钱</b>：① 先补差价 ② 再付注册费。<b>第 1 笔扣完一定要点完第 2 笔</b>，中途别关页面。<br>👉 用 <b>DAI / AiLGNS</b> 付只扣 1 笔、不多付：" + lgnsSwitch()
          : "ℹ️ 只付<b>一次钱</b>。第一次注册钱包弹 <b>2 次</b>：① 授权（<b>不扣钱</b>）② 注册付款；<b>以后再注册只弹 1 次</b>。";
        cost.textContent = dai + " DAI";
        if (k === "DAI" || preview) return;
        quote(dai, k).then(function (q) {
          if (k !== "LGNS") return q;
          return Promise.all([topUp(q), lgnsTax()]).then(function (z) {
            // 把两笔各多少写清楚：客户以为「少了 51 个」是丢钱
            if (kk.value === k) cn.innerHTML = "⚠️ <b>用 LGNS 付要多付约 " + Math.round(Number(z[1]) / 100) + "% 卖出税差，分 2 笔扣钱</b>：<br>① 先补差价约 <b>" + fmt(z[0], 9) + "</b> LGNS → ② 再付注册费约 <b>" + fmt(q, 9) + "</b> LGNS，合计约 <b>" + fmt(q + z[0], 9) + " LGNS</b>。<br><b>第 1 笔扣完一定要点完第 2 笔</b>，中途别关页面。<br>👉 用 <b>DAI / AiLGNS</b> 付只扣 1 笔、不多付：" + lgnsSwitch();
            return q + z[0];
          });
        }).then(function (q) { if (kk.value === k) cost.textContent = "≈ " + fmt(q, TOK[k].d) + " " + k + (k === "LGNS" ? "（2 笔合计）" : ""); }, function () { cost.textContent = dai + " DAI"; });
      };
      kk.onchange();
      var forCb = document.getElementById("nm-for");
      if (forCb) forCb.onchange = function () { document.getElementById("nm-for-box").hidden = !forCb.checked; if (forCb.checked) document.getElementById("nm-to").focus(); };
      if (!preview) autoPick(v, y, kk);
      y.addEventListener("change", function () { if (!preview) autoPick(v, y, kk); });
      document.getElementById("nm-go").onclick = function () {
        if (preview) { st.textContent = "⏳ 合约还没上线，这里是预览"; return; }
        var b = this, to = "";
        if (forCb && forCb.checked) {
          to = document.getElementById("nm-to").value.trim().toLowerCase();
          if (!/^0x[0-9a-f]{40}$/.test(to)) { A.errTip("对方地址格式不对：要以 0x 开头，一共 42 位", b); return; }
          if (to === account) to = "";
          else if (!confirm("确认帮这个地址注册吗？\n\n" + v + "." + TLD + "\n→ " + to + "\n\n地址填错了收不回来")) return;
        }
        b.disabled = true;
        register(v, Number(y.value), kk.value, function (t) { st.textContent = t; }, to).then(function () {
          st.textContent = "";
          if (to) { // 帮别人注册：名字已经在对方地址上，后面的「设主名字」只能对方自己做，这里不引导
            delete infoCache[TLD + ":" + v];
            out.innerHTML = '<p class="nm-ok nm-big">✅ 代注册成功：<b>' + esc(v) + "." + TLD + '</b> 已经归 <span class="mono">' + to.slice(0, 6) + "…" + to.slice(-4) + '</span></p><p class="nm-gen" id="nm-gen"></p>' +
              '<p class="muted">对方以后转账、收款报这个名字就行。</p><button type="button" class="nm-go nm-again" id="nm-again">➕ 继续帮下一个人注册</button>';
            document.getElementById("nm-again").onclick = again;
            info1(v).then(function (r) { genesis().then(function (g) { var e = document.getElementById("nm-gen"); if (e && g[r.id]) e.textContent = "🌟 创世域名 #" + g[r.id]; }, function () {}); }, function () {});
            return;
          }
          out.innerHTML = '<p class="nm-ok nm-big">✅ 第 1 步完成：<b>' + esc(v) + "." + TLD + '</b> 注册成功，已经指向你的地址</p><p class="nm-gen" id="nm-gen"></p><div id="nm-next"><p class="muted">正在准备第 2 步…</p></div>';
          delete infoCache[TLD + ":" + v]; // 注册前查过的缓存是「还没注册」，不能用
          (function fresh(n) { return info1(v).then(function (r) { return (r.free || r.addr !== account) && n > 0 ? new Promise(function (ok) { setTimeout(ok, 2500); }).then(function () { return fresh(n - 1); }) : r; }); })(4).then(function (r) {
            infoCache[TLD + ":" + v] = { t: Date.now(), p: Promise.resolve(r) };
            genesis().then(function (g) { var e = document.getElementById("nm-gen"); if (e && g[r.id]) e.textContent = "🌟 你是创世域名 #" + g[r.id]; }, function () {});
            guide(document.getElementById("nm-next"), v, r);
          });
        }, function (e) { b.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), b); });
      };
    }
    stepTo(1);
    // 已经连过钱包的，静默认出地址，打开自己的名字就直接显示第 2 / 3 步
    if (!account && A.wallets && A.wallets.silent) A.wallets.silent().then(function (a) { if (a && !account) { account = String(a).toLowerCase(); show(q); ordInit(); } }, function () {});
    show(q);
    market();
    ranks();
    ordInit();
    livePrices();
    genCard();
    // 菜单「域名 OTC」（#/names/otc）：直接滚到域名市场
    if (/^#\/names\/otc/.test(location.hash)) setTimeout(function () { var m = document.getElementById("nm-mk"); if (m) (m.closest("section") || m).scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
  }

  // 读某个合约的某种事件：从部署区块开始，每次 5000 块；读过的存在本机，下次只读新增的
  function logs(addr, topic, from) {
    var key = "nmlog:" + addr + ":" + topic.slice(2, 10), c = null;
    try { c = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { /* 无痕模式 */ }
    c = c || { to: from - 1, l: [] };
    // 本地没缓存或落后很多：先拉服务器快照（一次拿到全部历史），再只从链上补最新几个块
    var snap = c.to < from + 1000 || !c.l.length ? fetch("/api/name-logs?a=" + addr + "&t=" + topic).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.to > c.to) c = j; }, function () {}) : Promise.resolve();
    return snap.then(function () { return W.rpcOn("anubis", "eth_blockNumber", []); }).then(function (h) {
      var latest = parseInt(h, 16), ranges = [];
      for (var b = c.to + 1; b <= latest; b += 5000) ranges.push([b, Math.min(latest, b + 4999)]);
      return A.pool(ranges, 4, function (r) {
        return W.rpcOn("anubis", "eth_getLogs", [{ address: addr, fromBlock: "0x" + r[0].toString(16), toBlock: "0x" + r[1].toString(16), topics: [topic] }]);
      }).then(function (chunks) {
        chunks.forEach(function (x) { if (!x) throw new Error("读链上记录失败"); });
        [].concat.apply([], chunks).forEach(function (l) { c.l.push([parseInt(l.blockNumber, 16), l.topics, l.data]); });
        c.to = latest;
        try { localStorage.setItem(key, JSON.stringify(c)); } catch (e) { /* 存不下就下次重读 */ }
        return c.l;
      });
    });
  }
  // 注册排名：.ailgns 和 .lgns 两个合约的付费注册合起来，按注册个数排（官方保留名不算）
  function regStats(me) {
    return Promise.all(["ailgns", "lgns"].map(function (t) { return logs(CONTRACTS[t], T_REG, START[t]); })).then(function (all) {
      var c = {};
      all.forEach(function (l) { l.forEach(function (x) { if (BigInt("0x" + x[2].slice(66, 130)) > 0n) { var o = "0x" + x[1][2].slice(26); c[o] = (c[o] || 0) + 1; } }); });
      var n = c[me] || 0, above = Object.keys(c).filter(function (a) { return c[a] > n; }).map(function (a) { return c[a]; });
      return { n: n, rank: above.length + 1, total: Object.keys(c).length, gap: above.length ? Math.min.apply(null, above) - n + 1 : 0 };
    });
  }
  // 创世编号：按链上顺序，每个名字第一次付费注册排一个号（官方保留名不算），前 1 万个
  var genCache = {};
  // 服务器算好的创世数据（/api/name-genesis，30 秒缓存，秒开）：{ n, day, recent, g }；拿不到就退回自己读链
  var genApi = null, genApiAt = 0;
  function genesisApi() {
    if (genApi && Date.now() - genApiAt < 15000) return genApi;
    genApiAt = Date.now();
    genApi = fetch("/api/name-genesis").then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) { if (!j || !j.g) throw new Error("bad"); return j; });
    genApi.catch(function () { genApi = null; });
    return genApi;
  }
  function genesis(t) {
    var TLD = t || window.__nmTLD || "ailgns"; // 默认当前页面的后缀
    if (!genCache[TLD] && TLD === "ailgns") genCache[TLD] = genesisApi().then(function (j) { return j.g; }, function () { delete genCache[TLD]; return genesisChain(TLD); });
    if (!genCache[TLD]) genCache[TLD] = genesisChain(TLD);
    return genCache[TLD];
  }
  function genesisChain(TLD) {
    if (!genCache[TLD]) genCache[TLD] = logs(CONTRACTS[TLD], T_REG, START[TLD]).then(function (l) {
      var g = {}, n = 0;
      l.forEach(function (x) { var id = x[1][1].slice(2); if (!g[id] && BigInt("0x" + x[2].slice(66, 130)) > 0n && n < GENESIS) g[id] = ++n; });
      return g;
    }, function (e) { delete genCache[TLD]; throw e; });
    return genCache[TLD];
  }
  // 创世域名营销卡：剩余数量实时倒计时（每 15 秒读一次链，有人注册就当场减一、弹出「刚刚又有人抢注」），全部是链上真实数字，不编
  var gcTimer = null, gcLast = -1, blockTs = {};
  // 站长自己的钱包：注册的名字不出现在「最近被抢注」里，别人搜到也不显示创世编号（只有主人自己看得到）
  var PROTECT = A.hidden || {};
  function bts(b) { // 区块时间（秒），缓存
    if (!blockTs[b]) blockTs[b] = W.rpcOn("anubis", "eth_getBlockByNumber", ["0x" + b.toString(16), false]).then(function (x) { return parseInt(x.timestamp, 16); });
    return blockTs[b];
  }
  function ago(sec) { return sec < 60 ? "刚刚" : sec < 3600 ? Math.floor(sec / 60) + " 分钟前" : sec < 86400 ? Math.floor(sec / 3600) + " 小时前" : Math.floor(sec / 86400) + " 天前"; }
  function flip(n) { // 翻牌数字：每一位一个牌子，不足 4 位前面补 0（10,000 → 9,994）
    var s = String(n).padStart(4, "0");
    return s.split("").map(function (d, i) { return (s.length - i === 3 && i ? '<em class="gc-sep">,</em>' : "") + '<span class="gc-d">' + d + "</span>"; }).join("");
  }
  function gcRead() {
    if (TLD === "ailgns") return genesisApi().then(function (j) { return { n: j.n, day: j.day, recent: j.recent }; }, function () { return gcReadChain(); });
    return gcReadChain();
  }
  function gcReadChain() {
    return logs(NAMES, T_REG, START[TLD]).then(function (l) {
      var seen = {}, list = [];
      l.forEach(function (x) { var id = x[1][1]; if (!seen[id] && BigInt("0x" + x[2].slice(66, 130)) > 0n && list.length < GENESIS) { seen[id] = 1; list.push(x); } });
      var last = list.filter(function (x) { return !PROTECT["0x" + x[1][2].slice(26)]; }).slice(-10).reverse(), latestBlock = l.length ? l[l.length - 1][0] : 0;
      return Promise.all([W.rpcOn("anubis", "eth_getBlockByNumber", ["latest", false])].concat(last.map(function (x) { return bts(x[0]); }))).then(function (t) {
        var now = parseInt(t[0].timestamp, 16), head = parseInt(t[0].number, 16);
        // 近 24 小时：按最近一个注册的区块和现在的时间差估出每块秒数，再数 24 小时内的注册
        var spb = last.length && head > last[0][0] ? Math.max(0.5, (now - t[1]) / (head - last[0][0])) : 2;
        var from = head - Math.floor(86400 / spb), day = list.filter(function (x) { return x[0] >= from; }).length;
        return { n: list.length, day: day, recent: last.map(function (x, i) { var nm = ""; try { nm = decStr(x[2]); } catch (e) { /* 忽略 */ } return { nm: nm, ago: now - t[i + 1], no: list.indexOf(x) + 1 }; })
          .filter(function (r) { return r.nm && !(A.hiddenNames || {})[r.nm + "." + TLD]; }) };
      });
    });
  }
  function genCard() {
    var box = document.getElementById("nm-genc");
    clearInterval(gcTimer); gcLast = -1;
    if (!box || !NAMES) return;
    box.innerHTML = '<div class="gc"><div class="gc-top"><span class="gc-tag">🌟 创世域名 · 公平发射</span><b>全球限量 10,000 个</b></div><p class="muted" style="margin:6px 0 0">读取链上数据…</p></div>';
    // 站长 2026-11-09：销毁界面放在铸造卡下方（和 #/genesis 页同一套按钮，genesis.js 提供）；只画一次，不跟着 15 秒重画
    // 站长 2026-11-09：注册卡下面直接嵌整个销毁页（实况 + 按钮 + 规则），清晰提醒
    var bc = document.getElementById("nm-burnc");
    if (bc && A.genesisBurn && A.genesisBurn.full) A.genesisBurn.full(bc);
    function draw(d) {
      var b = document.getElementById("nm-genc");
      if (!b) { clearInterval(gcTimer); return; } // 离开了域名页
      var n = d.n, left = GENESIS - n, pct = Math.max(n / GENESIS * 100, 0.6), changed = gcLast >= 0 && n > gcLast;
      var tier = n < 10 ? ["前 10 号", 10] : n < 100 ? ["前 100 号", 100] : n < 1000 ? ["前 1,000 号", 1000] : null;
      b.innerHTML = '<div class="gc' + (changed ? " gc-hit" : "") + '">' +
        '<div class="gc-top"><span class="gc-tag">🌟 创世域名 · 公平发射</span><span class="gc-live"><i></i>链上实时</span></div>' +
        '<div class="gc-cd"><small>.' + TLD + ' 创世域名 · 全球限量 10,000 个 · 仅剩</small><div class="gc-flip">' + flip(left) + '</div><small>售完永久没有，第 10,001 个起再也不是创世域名</small></div>' +
        '<div class="gc-bar"><i style="width:' + pct.toFixed(2) + '%"></i></div>' +
        '<div class="gc-num"><div><small>已被抢注</small><b>' + n.toLocaleString() + '</b></div><div><small>近 24 小时</small><b>+' + d.day + '</b></div><div><small>你现在注册就是</small><b class="gc-me">创世 #' + (n + 1).toLocaleString() + "</b></div></div>" +
        (tier ? '<p class="gc-hot">🏅 <b>' + tier[0] + "</b>（编号越小越稀有）只剩 <b>" + (tier[1] - n) + "</b> 个，抢完就只能拿更大的号</p>" : "") +
        (changed ? '<p class="gc-flash">⚡ 刚刚又有 <b>' + (n - gcLast) + "</b> 个创世域名被抢注，现在只剩 <b>" + left.toLocaleString() + "</b> 个</p>" : "") +
        '<ul class="gc-pts"><li>🔥 <b>限量 1 万，售完永久没有</b>：合约写死，谁都加不了</li><li>⚖️ <b>公平发射</b>：人人同价，先到先得，官方不占创世编号</li><li>🔢 <b>链上永久编号</b>：注册顺序刻在区块链上，永远改不了</li><li>💎 <b>好名字只有一个</b>：被别人注册了就是别人的，只能去市场高价买</li></ul>' +
        (d.recent.length ? '<div class="gc-recent' + (gcOpen ? " open" : "") + '"><small>最近被抢注：</small>' + d.recent.map(function (r) { return "<span>" + esc(r.nm) + "." + TLD + " <em>#" + r.no + " · " + ago(r.ago) + "</em></span>"; }).join("") +
          (d.recent.length > 3 ? '<button type="button" class="gc-more">' + (gcOpen ? "收起 ▴" : "展开全部 " + d.recent.length + " 个 ▾") + "</button>" : "") + "</div>" : "") +
        '<button type="button" class="gc-go" id="gc-go">⚡ 立即抢注创世 #' + (n + 1).toLocaleString() + "</button></div>";
      document.getElementById("gc-go").onclick = function () { var i = document.getElementById("nm-q"); if (i) { i.scrollIntoView({ block: "center", behavior: "smooth" }); i.focus(); i.classList.remove("nm-flash"); void i.offsetWidth; i.classList.add("nm-flash"); } };
      gcLast = n;
    }
    gcRead().then(draw, function () { var b = document.getElementById("nm-genc"); if (b) b.innerHTML = ""; });
    gcTimer = setInterval(function () { if (!document.getElementById("nm-genc")) { clearInterval(gcTimer); return; } if (!document.hidden) gcRead().then(draw, function () {}); }, 15000);
  }
  // 价格表：每档下面标出用 AiLGNS / LGNS 付要多少个（LGNS 含卖出税补差）（合约 quote = DEX 实时价格）
  function livePrices() {
    var els = document.querySelectorAll(".nm-q");
    if (!els.length || !NAMES) return;
    Promise.all([quote(1, "AiLGNS"), quote(1, "LGNS").then(function (q) { return topUp(q).then(function (e) { return q + e; }); }), lgnsTax()]).then(function (q) {
      els.forEach(function (el) { var d = BigInt(el.getAttribute("data-dai")); el.innerHTML = "≈ " + fmt(q[0] * d, 18) + " AiLGNS<br>≈ " + fmt(q[1] * d, 9) + " LGNS"; });
      var px = document.getElementById("nm-px");
      if (px) px.textContent = " 现在 1 AiLGNS ≈ " + (1e18 / Number(q[0])).toFixed(2) + " DAI。用 LGNS 付要补 DEX 卖出税（现在约 " + (Number(q[2]) / 100).toFixed(0) + "%）的差价，上面 LGNS 数量已含补差。";
    }, function () {});
  }

  // 🧾 域名订单查询：按地址列出在域名市场买入 / 卖出的成交（成交 Filled + 挂单 Created 找出对方）
  var T_CREATED = "0xabeda1aaf527ebcdd00999e25c2ae410eec4a6098fe233573eb8d956dd149bff";
  // 📋 某个地址正在挂的单（.ailgns + 老的 .lgns 挂单都显示）；是自己的可以直接撤单
  // 挂单成功：一直停留的醒目弹窗（客户反馈挂完找不到单）。两个按钮：看我的挂单（高亮刚挂的）/ 去账本
  function listedDone(full, price) {
    full = String(full || "").toLowerCase(); if (!/\./.test(full)) full += "." + TLD;
    if (A.just) A.just.set("names", full);
    var box = document.createElement("div"); box.className = "modal";
    box.innerHTML = '<div class="modal-box nm-done"><div class="card-head"><h2>✅ 挂单成功！</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
      '<div class="nm-done-row"><span class="nm-done-ico">🏷</span><div><b>' + A.esc(full) + '</b><br><span class="muted">标价 ' + A.esc(String(price)) + ' DAI · 已存进市场合约，有人买下 DAI 直接到你钱包</span></div></div>' +
      '<button type="button" class="gm-big" data-seemine>📋 查看我的挂单（刚挂的会高亮）</button>' +
      (account ? '<a class="gm-big alt" style="text-align:center;text-decoration:none" href="#/scan/' + account + '/names" data-close>📒 去账本看「域名」类订单</a>' : "") +
      '<p class="note" style="text-align:center">以后在任何页面顶部「📋 查我的订单 → 域名」都能找到它</p></div>';
    document.body.appendChild(box);
    box.addEventListener("click", function (e) {
      if (e.target.closest("[data-seemine]")) { box.remove(); var b = document.querySelector('#nm-side button[data-side="mine"]'); if (b) { b.click(); setTimeout(function () { var m = document.getElementById("nm-minep"); if (m) m.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100); } return; }
      if (e.target === box || e.target.closest("[data-close]")) box.remove();
    });
  }
  function myOpen(a, box) {
    if (!box || !/^0x[0-9a-f]{40}$/.test(a || "")) return;
    box.innerHTML = '<p class="muted">读取挂单中…</p>';
    return listings(true).then(function (all) {
      var list = all.filter(function (x) { return x.maker === a; }), me = account && a === account, now2 = Date.now() / 1000;
      if (!list.length) { box.innerHTML = '<p class="muted">📋 ' + (me ? "你" : A.short(a)) + ' 现在没有在挂的单。' + (me ? '点上面「我要卖域名」就能挂。' : "") + "</p>"; return 0; }
      box.innerHTML = '<h3 class="nm-oh">📋 ' + (me ? "我的" : A.short(a) + " 的") + "挂单（" + list.length + ' 个在卖）</h3><div class="nm-otbl"><table><thead><tr><th>操作</th><th>域名</th><th>标价</th><th>买家付（含 3%）</th><th>剩余时间</th></tr></thead><tbody>' +
        list.map(function (it, i) {
          var p = Number(it.price / 10n ** 12n) / 1e6;
          var just = A.just && A.just.has("names", it.label + "." + it.t);
          return '<tr' + (just ? ' class="nm-just"' : '') + '><td class="nm-oact">' + (just ? '<span class="nm-justtag">🆕 刚挂的</span>' : '') + (me ? (it.expired ? "" : '<button type="button" class="act-btn nm-pinbtn" data-op="' + i + '">⭐ 置顶</button>') + '<button type="button" class="ghost act-btn" data-oc="' + i + '">' + (it.expired ? "取回" : "撤单") + '</button>' : it.expired ? "已过期" : "在卖") + '</td><td class="nm-onm"><a href="#/names/' + encodeURIComponent(it.label + "." + it.t) + '"><b>' + esc(it.label) + "." + it.t + '</b></a></td><td class="nm-opx"><b>' + p + ' DAI</b></td><td class="nm-obp">买家付 ' + Math.round(p * 1.03 * 1e6) / 1e6 + ' DAI</td><td class="nm-olt">⏱ ' + (it.expired ? "已过期，点「取回」名字退回钱包" : leftT(it.expiry - now2)) + "</td></tr>";
        }).join("") + '</tbody></table></div><p class="muted nm-st" id="nm-ost"></p>';
      var st = document.getElementById("nm-ost"), say = function (t) { if (st) st.textContent = t; };
      var jr = box.querySelector("tr.nm-just"); if (jr) setTimeout(function () { jr.scrollIntoView({ behavior: "smooth", block: "center" }); }, 150);
      if (me) pinRetry(say);
      box.querySelectorAll("button[data-op]").forEach(function (b) {
        b.onclick = function () { pinIt(list[Number(b.getAttribute("data-op"))], b, say); };
      });
      box.querySelectorAll("button[data-oc]").forEach(function (b) {
        b.onclick = function () { b.disabled = true; buyIt(list[Number(b.getAttribute("data-oc"))], b, say).then(function () { say("✅ 名字已退回你的钱包"); market(); setTimeout(function () { myOpen(a, box); }, 3000); }, function (e) { b.disabled = false; say(""); A.errTip(e.message || String(e), b); }); };
      });
      return list.length;
    }).catch(function () { box.innerHTML = '<p class="muted">挂单读取失败，请稍后再试</p>'; });
  }
  // 买入成功后：订单查询自动填上自己的地址并刷新（链上记录要几秒才出来）
  function ordAfter() { var inp = document.getElementById("nm-oa"); if (!inp || !account) return; inp.value = account; setTimeout(function () { orders(account); }, 4000); }
  function ordInit() {
    var inp = document.getElementById("nm-oa"), btn = document.getElementById("nm-ob");
    if (!inp || !btn) return;
    if (account) { inp.value = account; orders(account); }
    btn.onclick = function () { orders(inp.value.trim().toLowerCase()); };
    var to = document.getElementById("nm-toord"); if (to) to.onclick = function (e) { e.preventDefault(); document.getElementById("nm-ord").scrollIntoView({ behavior: "smooth" }); };
    inp.onkeydown = function (e) { if (e.key === "Enter") btn.click(); };
  }
  function orders(a) {
    var out = document.getElementById("nm-ol"); if (!out) return;
    if (!/^0x[0-9a-f]{40}$/.test(a)) { out.innerHTML = '<p class="muted">请填正确的钱包地址（0x 开头 42 位）</p>'; return; }
    out.innerHTML = '<p class="muted">查询中…</p>';
    myOpen(a, document.getElementById("nm-olo"));
    var pad = "0x" + A.pad(a);
    Promise.all(Object.keys(OTC).map(function (t) {
      return Promise.all([logs(OTC[t], T_FILL, START[t]), logs(OTC[t], T_CREATED, START[t])]).then(function (x) {
        var mk = {};
        x[1].forEach(function (l) { mk[l[1][1]] = { maker: "0x" + l[1][2].slice(26), sell: BigInt("0x" + l[2].slice(2, 66)) === 1n }; });
        return x[0].map(function (l) {
          var o = mk[l[1][1]] || {}, taker = "0x" + l[1][2].slice(26), buyer = o.sell === false ? o.maker : taker, seller = o.sell === false ? taker : o.maker;
          return { t: t, b: l[0], id: parseInt(l[1][1], 16), tid: l[2].slice(2, 66), price: BigInt("0x" + l[2].slice(66, 130)), buy: buyer === a, sell: seller === a, other: buyer === a ? seller : buyer };
        }).filter(function (r) { return r.buy || r.sell; });
      });
    })).then(function (all) {
      var rows = [].concat.apply([], all).sort(function (x, y) { return y.b - x.b; }).slice(0, 50);
      if (!rows.length) { out.innerHTML = '<p class="muted">' + A.short(a) + ' 在域名市场还没有成交记录。</p>'; return; }
      return Promise.all(rows.map(function (r) {
        return Promise.all([
          W.rpcOn("anubis", "eth_call", [{ to: CONTRACTS[r.t], data: SEL.labelOf + r.tid }, "latest"]).then(decStr).catch(function () { return "#" + r.id; }),
          W.rpcOn("anubis", "eth_getBlockByNumber", ["0x" + r.b.toString(16), false]).then(function (b) { return parseInt(b.timestamp, 16); }).catch(function () { return 0; }),
        ]);
      })).then(function (info) {
        var bought = 0, sold = 0;
        var html = rows.map(function (r, i) {
          var d = info[i][1] ? new Date((info[i][1] + 8 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ") : "", dai = Number(r.price / 10n ** 12n) / 1e6;
          if (r.buy) bought += dai; else sold += dai;
          return "<tr><td>" + d + '</td><td><b>' + esc(info[i][0]) + "." + r.t + "</b></td><td>" + (r.buy ? '<span class="nm-ob-b">买入</span>' : '<span class="nm-ob-s">卖出</span>') + "</td><td><b>" + dai + " DAI</b></td><td>" + (r.other ? A.short(r.other) : "") + '</td><td><span class="muted">区块 ' + r.b + "</span></td></tr>";
        }).join("");
        out.innerHTML = '<p class="muted">共 ' + rows.length + " 笔 · 买入 " + Math.round(bought * 100) / 100 + " DAI · 卖出 " + Math.round(sold * 100) / 100 + ' DAI（成交价，不含手续费）</p><div class="nm-otbl"><table><thead><tr><th>时间（北京）</th><th>域名</th><th>方向</th><th>成交价</th><th>对方</th><th>链上凭证</th></tr></thead><tbody>' + html + "</tbody></table></div>";
      });
    }).catch(function () { out.innerHTML = '<p class="muted">查询失败，请稍后再试</p>'; });
  }

  // 成交排行：最贵 10 笔 + 最新 10 笔
  function ranks() {
    var box = document.getElementById("nm-rank"), O = OTC[TLD];
    if (!box || !O) return;
    box.innerHTML = '<p class="muted">读取中…</p>';
    Promise.all([logs(O, T_FILL, START[TLD]), genesis().catch(function () { return {}; })]).then(function (x) {
      var fills = x[0].map(function (l) { return { b: l[0], tid: l[2].slice(2, 66), price: BigInt("0x" + l[2].slice(66, 130)) }; }), g = x[1];
      if (!fills.length) { box.innerHTML = '<p class="muted">还没有成交。第一笔成交会出现在这里！</p>'; return; }
      var top = fills.slice().sort(function (a, b) { return a.price > b.price ? -1 : a.price < b.price ? 1 : 0; }).slice(0, 10), last = fills.slice(-10).reverse(), all = top.concat(last), names = {};
      return Promise.all(all.map(function (f) { return names[f.tid] || (names[f.tid] = call(SEL.labelOf + f.tid).then(decStr)); })).then(function (labels) {
        all.forEach(function (f, i) { f.label = labels[i]; });
        var row = function (f, i) { return '<li><span>' + (i + 1) + ". <b>" + esc(f.label) + "." + TLD + "</b>" + (g[f.tid] ? ' <i class="nm-gb">🌟 创世 #' + g[f.tid] + "</i>" : "") + "</span><b>" + Number(f.price / 10n ** 12n) / 1e6 + " DAI</b></li>"; };
        box.innerHTML = '<div class="nm-rk2"><div><h3>💎 最贵成交</h3><ol>' + top.map(row).join("") + '</ol></div><div><h3>🕒 最新成交</h3><ol>' + last.map(row).join("") + "</ol></div></div>";
      });
    }).catch(function () { box.innerHTML = '<p class="muted">读取失败，请稍后再试</p>'; });
  }

  // 域名市场：读最近 200 张单里还在卖的
  // 某个地址名下现在有哪些名字（两个后缀）：读 Transfer 记录找候选，再用 ownerOf 确认还在他手里
  // 名字已注册但还不是持有人的主名字（主号）→ 提示用持有钱包连接本页设置
  function priHint(box, v, owner) {
    if (!box) return;
    call(SEL.nameOf + A.pad(owner)).then(function (x) { try { return decStr(x); } catch (e) { return ""; } }, function () { return null; }).then(function (p) {
      if (p === null || p === v || !document.body.contains(box)) return;
      box.innerHTML = '<div class="nm-mv"><b>⚠️ ' + esc(v + "." + TLD) + ' 还没设为主名字（主号）</b>' +
        (p ? "持有人现在的主名字是 <b>" + esc(p + "." + TLD) + "</b>。" : "持有人还没设置任何主名字。") +
        '<small>如果这是你的名字：点右上角<b>连接钱包</b>，用持有它的钱包 <code>' + owner.slice(0, 6) + "…" + owner.slice(-4) + '</code> 连接后重新打开本页，就会出现「设为我的主名字」按钮（不花钱，只付一点 Gas）。</small></div>';
    });
  }
  // 付款注册记录：按这个钱包付过的注册费查（帮别人注册的、注册后转走的都能查到），并标出哪些还没设主名字
  function paidRec(a, o, self) {
    var d = document.createElement("div"); d.className = "nm-mv nm-paid"; d.innerHTML = "<b>📜 付款注册记录</b><small>查询中…</small>"; o.appendChild(d);
    var sh = function (x) { return x ? x.slice(0, 6) + "…" + x.slice(-4) : "?"; };
    fetch("/api/name-paid?a=" + a).then(function (r) { return r.json(); }).then(function (j) {
      if (!document.body.contains(d)) return;
      var RN = (j.list || []).filter(function (x) { return x.kind === "renew" && x.owner !== a; }), L = (j.list || []).filter(function (x) { return x.kind === "reg"; });
      var rnHtml = RN.length ? '<div class="nm-pr"><em>⚠️ 这个钱包还付过 ' + RN.length + " 次「续费」，续的是别人的名字（钱付了，名字还是原主人的）：</em>" + RN.map(function (x) { return " " + esc(x.label + "." + x.t) + "（持有人 <code>" + sh(x.owner) + "</code>）"; }).join("，") + "</div>" : "";
      if (j.error) { d.innerHTML = "<b>📜 付款注册记录</b><small>" + esc(j.error) + "</small>"; return; }
      if (!L.length) { d.innerHTML = "<b>📜 付款注册记录</b>" + rnHtml + "<small>这个钱包没有付款<b>注册</b>过域名。如果你确定注册过，请换成当时付款的钱包地址再查。</small>"; return; }
      var bad = 0;
      d.innerHTML = "<b>📜 这个钱包付款注册过 " + L.length + " 个域名</b>" + L.map(function (x) {
        var full = x.label + "." + x.t, here = x.owner === a, pri = x.primary === x.label, st;
        var onMk = x.owner && x.owner === OTC[x.t];
        if (onMk) return '<div class="nm-pr"><a href="#/names/' + encodeURIComponent(full) + '">' + esc(full) + "</a> <span>🛒 正在域名市场出售（托管在市场合约）</span></div>";
        if (!x.owner) st = "⚪ 已过期或已释放";
        else if (!here) st = "📦 现在在 <code>" + sh(x.owner) + "</code>" + (x.to !== a ? "（注册时就是给这个地址的）" : "（注册后转走了）");
        else st = "✅ 在这个钱包";
        if (x.owner && !pri) { bad++; st += " · <em>⚠️ 未设主名字</em>"; }
        return '<div class="nm-pr"><a href="#/names/' + encodeURIComponent(full) + '">' + esc(full) + "</a> <span>" + st + "</span></div>";
      }).join("") + rnHtml + (bad ? "<small>⚠️ 标「未设主名字」的：用它<b>现在所在的钱包</b>连接本站，点进名字按「设为我的主名字」（不花钱，只付一点 Gas）。一个钱包只能有一个主名字。</small>" : "");
    }, function () { if (document.body.contains(d)) d.innerHTML = "<b>📜 付款注册记录</b><small>查询失败，请稍后再试</small>"; });
  }
  var movedOf = {}; // 曾经进过这个钱包、现在已经不在的名字（转走了 / 卖掉了）
  function ownedList(a) {
    // 🚀 先走服务端索引 /api/name-owned（站长 2026-11-09：查询超过 5 秒）：日志快照算好的，1 秒内出；接口挂了再退回老办法扫链
    return fetch("/api/name-owned?a=" + a).then(function (r) { if (!r.ok) throw new Error("api"); return r.json(); }).then(function (j) {
      if (!j || !Array.isArray(j.list)) throw new Error("api");
      movedOf[a] = (j.moved || []).map(function (x) { return { t: "ailgns", label: x.label, to: x.to }; });
      return j.list.map(function (x) { return { t: "ailgns", id: x.id, label: x.label, exp: x.exp || 0, no: x.no || 0 }; });
    }).catch(function () { return ownedListChain(a); });
  }
  function ownedListChain(a) {
    movedOf[a] = [];
    var pad = "0x" + A.pad(a), tlds = Object.keys(CONTRACTS);
    tlds.forEach(function (t) { delete genCache[t]; }); // 创世编号重新读（增量，很快），刚注册的名字也能拿到编号
    return Promise.all(tlds.map(function (t) {
      var C = CONTRACTS[t];
      function on(d) { return W.rpcOn("anubis", "eth_call", [{ to: C, data: d }, "latest"]); }
      return logs(C, T_XFER, START[t]).then(function (l) {
        var ids = {}; l.forEach(function (x) { if (x[1][2] === pad) ids[x[1][3]] = 1; });
        return Promise.all(Object.keys(ids).map(function (id) {
          var h = id.slice(2);
          return on(SEL.ownerOf + h).then(function (w) {
            var cur = addrOf(w);
            if (cur !== a) { return on(SEL.labelOf + h).then(function (l) { (movedOf[a] = movedOf[a] || []).push({ t: t, label: decStr(l), to: cur }); return null; }, function () { return null; }); }
            return Promise.all([on(SEL.labelOf + h), on(SEL.expires + h), genesis(t)]).then(function (x) {
              return { t: t, id: h, label: decStr(x[0]), exp: Number(BigInt("0x" + word(x[1], 0))), no: x[2][h] || 0 };
            });
          }, function () { return null; });
        }));
      });
    })).then(function (all) { return [].concat.apply([], all).filter(function (x) { return x && x.label; }); });
  }
  function leftT(sec) {
    if (sec <= 0) return "已过期";
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return d ? d + " 天 " + h + " 小时" : h ? h + " 小时 " + m + " 分" : m + " 分钟";
  }
  // 「我要卖域名」面板：和 AiLGNS OTC 一样，先直接显示挂单表单，不弹钱包；点「发布挂单」时才连钱包、核对名字是不是你的
  function sellPanel() {
    var box = document.getElementById("nm-sp"); if (!box) return;
    var DURS = [[86400, "1 天"], [3 * 86400, "3 天"], [7 * 86400, "7 天"], [15 * 86400, "15 天"], [30 * 86400, "30 天"]], dur = 30 * 86400; // 站长 2026-11-09：默认挂满 30 天（合约上限），别让名字静悄悄下架
    var pre = ""; try { pre = sessionStorage.getItem("nm:sellpick") || ""; sessionStorage.removeItem("nm:sellpick"); } catch (x) { /* 忽略 */ }
    box.innerHTML = '<div class="form-grid"><label>要卖的域名<input id="nm-sp-n" list="nm-sp-dl" placeholder="例如 发财.ailgns" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(pre) + '"><datalist id="nm-sp-dl"></datalist></label>' +
      '<label>售价（DAI）<input id="nm-sp-p" inputmode="decimal" placeholder="例如 100"></label></div>' +
      '<div class="nm-sp-mine" id="nm-sp-mine"></div><p class="note" id="nm-sp-vol"></p>' +
      '<div class="dur"><span class="dur-t">有效期 <small class="muted">到期没卖掉，名字自动退回</small></span><div class="dur-opts" id="nm-sp-d">' + DURS.map(function (d) { return '<button type="button" data-d="' + d[0] + '"' + (d[0] === dur ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") + "</div></div>" +
      '<p class="note" id="nm-sp-sum">填好售价后显示你能拿到多少</p><button id="nm-sp-go" style="padding:12px 22px">发布挂单</button><p class="note" id="nm-sp-st">点「发布挂单」时才会连接钱包；名字先存进托管合约，成交前随时可撤</p>';
    var ni = document.getElementById("nm-sp-n"), pi = document.getElementById("nm-sp-p"), sum = document.getElementById("nm-sp-sum"), sst = document.getElementById("nm-sp-st"), go = document.getElementById("nm-sp-go");
    try { var pp = sessionStorage.getItem("nm:sellprice"); sessionStorage.removeItem("nm:sellprice"); if (pp) { pi.value = pp; setTimeout(function () { pi.oninput && pi.oninput(); }, 0); } } catch (x) { /* 忽略 */ }
    if (account) otcVols([account]).then(function (v) { var e = document.getElementById("nm-sp-vol"), vol = v[account] || 0; if (e) e.innerHTML = "📊 你的 OTC 累计成交：<b>" + A.fmt(vol, 2) + " DAI</b>" + (vol ? "，挂单会排在成交比你少的卖家前面" : "（还没有，挂单排在有成交的卖家后面）") + ' · <a href="#/names/otc">排名规则</a>'; });
    // 已经连过钱包的：把名下的域名列成按钮，点一下就填好（不弹钱包）
    if (account) ownedList(account).then(function (list) {
      var m = document.getElementById("nm-sp-mine"); if (!m || !list.length) return;
      list.sort(function (x, y) { return (x.no || 1e9) - (y.no || 1e9); });
      document.getElementById("nm-sp-dl").innerHTML = list.map(function (x) { return '<option value="' + esc(x.label + "." + x.t) + '">'; }).join("");
      m.innerHTML = '<small class="muted">你的域名：</small>' + list.map(function (x) { return '<button type="button" data-n="' + esc(x.label + "." + x.t) + '">' + esc(x.label) + "." + x.t + (x.no ? " 🌟#" + x.no : "") + "</button>"; }).join("");
      m.onclick = function (e) { var b = e.target.closest("button[data-n]"); if (!b) return; ni.value = b.getAttribute("data-n"); m.querySelectorAll("button").forEach(function (y) { y.className = y === b ? "on" : ""; }); pi.focus(); };
    }, function () {});
    function ok(p) { return /^\d+(\.\d{1,6})?$/.test(p) && Number(p) > 0; }
    pi.oninput = function () { var p = pi.value.trim(); sum.innerHTML = ok(p) ? "你拿到 <b>" + Number(p) + " DAI</b>（完整标价，卖家 0 手续费）· 买家付 " + Math.round(Number(p) * 1.03 * 1e6) / 1e6 + " DAI（含 3%）" : "填好售价后显示你能拿到多少"; };
    document.getElementById("nm-sp-d").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; dur = Number(b.getAttribute("data-d")); this.querySelectorAll("button").forEach(function (x) { x.className = x === b ? "on" : ""; }); };
    function say(t) { sst.textContent = t; }
    go.onclick = function () {
      var raw = ni.value.trim().toLowerCase(), p = pi.value.trim(), m = raw.match(/^(.+?)(?:\.(ailgns|lgns))?$/), label = m && m[1], t = (m && m[2]) || "ailgns";
      if (!label) { A.errTip("请填要卖的域名，比如 发财.ailgns", go); return; }
      if (!ok(p)) { A.errTip("价格格式不对，填数字，比如 100", go); return; }
      var O = OTC[t], C = CONTRACTS[t];
      if (!O) { A.errTip("." + t + " 市场还没开放", go); return; }
      function on(d) { return W.rpcOn("anubis", "eth_call", [{ to: C, data: d }, "latest"]); }
      var wei = BigInt(Math.round(Number(p) * 1e6)) * 10n ** 12n, id;
      go.disabled = true;
      connect().then(function () {
        return on(SEL.idOf + "0000000000000000000000000000000000000000000000000000000000000020" + str(label));
      }).then(function (r) {
        id = word(r, 0);
        return Promise.all([on(SEL.ownerOf + id).then(addrOf, function () { return ""; }), on(SEL.expires + id)]);
      }).then(function (x) {
        if (x[0] !== account) throw new Error(x[0] === O ? label + "." + t + " 已经在市场里挂着了" : label + "." + t + " 不在你当前连接的钱包里，请换成注册它的钱包");
        if (Number(BigInt("0x" + word(x[1], 0))) < Date.now() / 1000 + dur + 30 * 86400) throw new Error("这个名字快到期了，先续费再挂单（或选短一点的有效期）");
        return nftOk(C, O, id, say);
      }).then(function () {
        return tx(O, SEL.oList + id + u256(wei) + u256(dur), say, "🔒 第 2 步：挂单 " + p + " DAI，名字存进市场合约。请在钱包确认");
      }).then(function () {
        say("✅ 已挂到市场"); go.disabled = false; ni.value = ""; pi.value = "";
        listedDone(label + "." + t, p); market();
      }, function (e) { go.disabled = false; say(""); A.errTip(e.message || String(e), go); });
    };
  }
  // 📢 求购意向（不上链、不锁钱）：买家留「想要哪个名字、出多少」，出价高的排前面；名字主人按这个价挂单，买家再去买入
  function wantPanel() {
    var box = document.getElementById("nm-wp"); if (!box) return;
    box.innerHTML = '<p class="note">想要的名字已经被别人注册了？在这里出个价，名字主人看到会按你的价格挂单，你再点「买入」成交。<br>发布时要<b>连钱包签个名（不扣钱、不花 Gas）</b>，钱包里 DAI 要够「出价 + 3% 手续费」，这样大家知道你是真心要买。钱一直在你自己钱包里，随时可以撤单。</p>' +
      '<div class="form-grid"><label>想要的域名<input id="nm-w-n" placeholder="例如 发财.ailgns" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
      '<label>出价（DAI）<input id="nm-w-p" inputmode="decimal" placeholder="例如 500"></label>' +
      '</div><button id="nm-w-go" style="padding:12px 22px;margin-top:10px">📢 连钱包签名，发布求购</button><p class="note" id="nm-w-st"></p><div id="nm-w-list"><p class="muted">读取中…</p></div>';
    var go = document.getElementById("nm-w-go"), wst = document.getElementById("nm-w-st");
    go.onclick = function () {
      var raw = document.getElementById("nm-w-n").value.trim().toLowerCase(), p = Math.round(Number(document.getElementById("nm-w-p").value.trim()) * 100) / 100, day = bjDay();
      if (raw && !/\.(ailgns|lgns)$/.test(raw)) raw += ".ailgns";
      var m = raw.match(/^(.+)\.(ailgns|lgns)$/);
      if (!m) { A.errTip("请填想要的域名，例如 发财.ailgns", go); return; }
      if (!(p >= 1)) { A.errTip("出价至少 1 DAI", go); return; }
      go.disabled = true; wst.textContent = "检查这个名字…";
      W.rpcOn("anubis", "eth_call", [{ to: CONTRACTS[m[2]], data: SEL.available + "0000000000000000000000000000000000000000000000000000000000000020" + str(m[1]) }, "latest"]).then(function (r) {
        if (BigInt("0x" + word(r, 0)) === 1n) { go.disabled = false; wst.innerHTML = '🎉 <b>' + esc(raw) + '</b> 还没人注册，不用求购！<a href="#/names/' + encodeURIComponent(raw) + '">直接去注册 →</a>'; return; }
        wst.textContent = "请在钱包确认连接…";
        return (eth ? Promise.resolve() : connect()).then(function () {
          wst.textContent = "检查钱包里的 DAI…";
          return W.rpcOn("anubis", "eth_call", [{ to: DAI, data: "0x70a08231" + account.slice(2).padStart(64, "0") }, "latest"]);
        }).then(function (r) {
          var have = Number(BigInt(r) / 10n ** 14n) / 1e4, want = Math.ceil(p * 1.03 * 100) / 100;
          if (have < want) throw new Error("钱包里 DAI 不够：出价 " + p + " + 3% 手续费 = " + want + " DAI，你现在只有 " + have + " DAI（活期/质押里的不算）");
          bigTip("签名");
          wst.textContent = "请在钱包里签名（只是签名，不扣钱、不花 Gas）…";
          return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(wantText(raw, p, account, day)), account] });
        }).then(function (sig) {
          bigTip(""); wst.textContent = "正在发布…";
          return fetch("/api/name-want", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: raw, price: p, by: account, day: day, sig: sig }) }).then(function (x) { return x.json(); });
        }).then(function (j) {
          go.disabled = false;
          if (j.error) throw new Error(j.error);
          wst.textContent = "✅ 已发布，名字主人看到会按你的价格挂单。记得常回来看看";
          loadWants();
        });
      }).catch(function (e) { bigTip(""); go.disabled = false; wst.textContent = ""; A.errTip((e && e.message) || "发布失败，请稍后再试", go); });
    };
    loadWants();
  }
  // 签名文字必须和 functions/api/name-want.js 里一字不差
  function wantText(name, price, by, day) { return "AiLGNS 域名求购\n我想用 " + price + " DAI 买 " + name + "\n出价地址：" + by + "\n日期：" + day; }
  function cancelText(id, by, day) { return "AiLGNS 域名求购撤单\n撤销求购 " + id + "\n出价地址：" + by + "\n日期：" + day; }
  function bjDay() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
  function utf8hex(str) { var b = unescape(encodeURIComponent(str)), h = "0x"; for (var i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return h; }
  function loadWants() {
    fetch("/api/name-want", { cache: "no-store" }).then(function (x) { return x.json(); }).then(function (j) { drawWants(j.list || []); }, function () { var el = document.getElementById("nm-w-list"); if (el) el.innerHTML = '<p class="muted">读取失败，请稍后再试</p>'; });
  }
  function drawWants(list) {
    var el = document.getElementById("nm-w-list"); if (!el) return;
    if (!list.length) { el.innerHTML = '<p class="muted">还没有求购意向，第一个出价吧</p>'; return; }
    list = list.slice().sort(function (a, b) { return b.price - a.price || a.at - b.at; });
    listings().then(function (ls) { return ls; }, function () { return []; }).then(function (ls) {
      var sale = {}; ls.forEach(function (x) { if (!x.expired) sale[x.label + "." + x.t] = x; });
      var now = Date.now();
      el.innerHTML = '<div class="tbl-wrap"><table class="cards book"><thead><tr><th class="l">操作</th><th class="l">想要的域名</th><th>出价 DAI</th><th class="l">出价人</th><th>时间</th></tr></thead><tbody>' + list.map(function (w, i) {
        var it = sale[w.name], act = account && w.by === account ? '<button type="button" class="act-btn" data-wc="' + i + '">撤单</button>'
          : it ? '<button type="button" class="act-btn btn-buy" data-wb="' + i + '">已挂单 ' + Number(it.price / 10n ** 12n) / 1e6 + " · 买入</button>"
          : '<button type="button" class="act-btn btn-sell" data-ws="' + i + '">我是主人，按这个价卖</button>';
        return '<tr' + (w.ok === false ? ' class="nm-wdim"' : "") + '><td class="act">' + act + '</td><td data-l="想要的域名" class="l"><b>' + esc(w.name) + '</b></td><td data-l="出价 DAI" class="price"><b>' + w.price + '</b></td>' +
          '<td data-l="出价人" class="l mono">' + (A.nameTag ? A.nameTag(w.by) : A.short(w.by)) + (w.ok === false ? ' <span class="nm-wbad">余额不足</span>' : ' <span class="nm-wok">✅ 余额已验证</span>') + '</td><td data-l="时间">' + ago((now - w.at) / 1000) + "</td></tr>";
      }).join("") + '</tbody></table></div><p class="muted nm-st" id="nm-w-st2"></p>';
      var st2 = document.getElementById("nm-w-st2");
      el.querySelectorAll("button[data-ws]").forEach(function (b) {
        b.onclick = function () {
          var w = list[Number(b.getAttribute("data-ws"))];
          try { sessionStorage.setItem("nm:sellpick", w.name); sessionStorage.setItem("nm:sellprice", String(w.price)); } catch (x) { /* 忽略 */ }
          var sg = document.getElementById("nm-sellgo"); sg.click(); sg.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      });
      el.querySelectorAll("button[data-wc]").forEach(function (b) {
        b.onclick = function () {
          var w = list[Number(b.getAttribute("data-wc"))], day = bjDay();
          b.disabled = true; st2.textContent = "请在钱包里签名撤单（不扣钱、不花 Gas）…";
          (eth ? Promise.resolve() : connect()).then(function () {
            if (account !== w.by) throw new Error("请切换到出价的钱包 " + A.short(w.by));
            return A.wallets.ask(eth, { method: "personal_sign", params: [utf8hex(cancelText(w.id, account, day)), account] });
          }).then(function (sig) {
            return fetch("/api/name-want", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", id: w.id, by: account, day: day, sig: sig }) }).then(function (x) { return x.json(); });
          }).then(function (j) { if (j.error) throw new Error(j.error); st2.textContent = "✅ 已撤单"; loadWants(); }, function (e) { b.disabled = false; st2.textContent = ""; A.errTip(e.message || String(e), b); });
        };
      });
      el.querySelectorAll("button[data-wb]").forEach(function (b) {
        b.onclick = function () {
          var it = sale[list[Number(b.getAttribute("data-wb"))].name];
          buyIt(it, b, function (t) { st2.textContent = t; }).then(function () { st2.textContent = "✅ 成功"; market(); wantPanel(); ordAfter(); }, function (e) { st2.textContent = ""; A.errTip(e.message || String(e), b); });
        };
      });
    });
  }
  var lsP = null, lsAt = 0;
  function listings(fresh) { // 两个市场里所有在卖的名字（15 秒内复用）
    if (lsP && !fresh && Date.now() - lsAt < 15000) return lsP;
    var again = !!lsP; lsAt = Date.now();
    var tlds = Object.keys(OTC).filter(function (t) { return OTC[t]; });
    // 先用服务器批量读好的列表（一次请求）；服务器出问题再退回自己逐个读链
    lsP = fetch("/api/name-market" + (fresh && again ? "?f=1" : "")).then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); }).then(function (j) {
      if (!j.list) throw new Error("bad");
      return j.list.map(function (it) { it.price = BigInt(it.price); return it; });
    }).catch(function () { return slowListings(tlds); });
    lsP.catch(function () { lsP = null; });
    return lsP;
  }
  function slowListings(tlds) {
    return Promise.all(tlds.map(function (t) {
      var O = OTC[t], C = CONTRACTS[t];
      var oc = function (data) { return W.rpcOn("anubis", "eth_call", [{ to: O, data: data }, "latest"]); };
      var nc = function (data) { return W.rpcOn("anubis", "eth_call", [{ to: C, data: data }, "latest"]); };
      return oc(SEL.oCount).then(function (c) {
        var n = Number(BigInt(c)), from = 0; // 全部挂单都读
        return oc(SEL.oGet + u256(from) + u256(n - from)).then(function (res) {
          var w = (res.slice(2).match(/.{64}/g) || []), cnt = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0, now = Date.now() / 1000, list = [];
          for (var i = 0; i < cnt; i++) {
            var o = w.slice(2 + i * 6, 8 + i * 6);
            var it = { t: t, O: O, id: from + i, maker: "0x" + o[0].slice(24), sell: o[1].slice(-1) === "1", open: o[2].slice(-1) === "1", expiry: Number(BigInt("0x" + o[3])), tid: o[4], price: BigInt("0x" + o[5]) };
            if (it.sell && it.open) { it.expired = it.expiry <= now; list.push(it); } // 过期没取回的也留着，卖家在「我的挂单」里取回
          }
          return Promise.all(list.map(function (it) {
            return Promise.all([nc(SEL.labelOf + it.tid), nc(SEL.expires + it.tid)]).then(function (x) { it.label = decStr(x[0]); it.exp = Number(BigInt("0x" + word(x[1], 0))); return it; });
          }));
        });
      });
    })).then(function (all) { return [].concat.apply([], all); });
  }
  // 买一个在卖的名字：授权 DAI（含 3%）→ 付款，名字同一笔交易到钱包；自己的单就是撤单
  function buyIt(it, b, say) {
    var O = it.O, id = it.id, price = it.price, total = price + price * 3n / 100n;
    return connect().then(function () {
      if (it.maker === account) return tx(O, SEL.oCancel + u256(id), say, "🔒 撤单，名字退回你的钱包。请在钱包确认");
      return W.rpcOn("anubis", "eth_call", [{ to: DAI, data: SEL.allowance + A.pad(account) + A.pad(O) }, "latest"]).then(function (a) {
        if (BigInt(a) < total) return tx(DAI, SEL.approve + A.pad(O) + u256(total), say, "🔒 第 1 步：授权市场合约收 " + Number(total / 10n ** 12n) / 1e6 + " DAI（含 3% 手续费）。请在钱包确认");
      }).then(function () { return tx(O, SEL.oBuy + u256(id) + u256(total), say, "🔒 第 2 步：付款，名字同一笔交易直接到你钱包。请在钱包确认"); });
    });
  }
  // ⭐ 付费置顶：卖家付 DAI（进回购分账，和域名收入一起分），置顶 3 天，出得多的排前面；没卖掉也不退
  var BUYBACK = "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", PIN_MIN = 10;
  function pinsGet() {
    return fetch("/api/name-pin?r=" + Date.now()).then(function (r) { return r.json(); }).then(function (j) {
      var m = {}; (j.pins || []).forEach(function (p) { m[p.t + ":" + p.id] = p.amt; }); m._top = (j.pins || []).map(function (p) { return p.amt; }); return m;
    }, function () { return { _top: [] }; });
  }
  function pinPost(p, say) {
    return fetch("/api/name-pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "登记失败");
      try { localStorage.removeItem("nmPinTx"); } catch (e) {}
      say("✅ 置顶成功！累计 " + j.amt + " DAI，现在排第 " + j.rank + " 位，到 " + new Date(j.exp).toLocaleString() + " 结束");
      market(); return j;
    });
  }
  function pinRetry(say) { // 付了钱但登记没成功（网络断了等）：下次打开自动补登记
    var p; try { p = JSON.parse(localStorage.getItem("nmPinTx") || "null"); } catch (e) {}
    if (p) pinPost(p, say).catch(function (e) { if (/用过|卖掉|没有成功|找不到/.test(e.message)) try { localStorage.removeItem("nmPinTx"); } catch (x) {} });
  }
  // 付费置顶：页面里直接弹一个输入框（以前用浏览器 prompt，很多钱包 App 里弹不出来，点了像没反应）
  function pinIt(it, b, say) {
    var old = document.getElementById("nm-pinbox"); if (old) old.remove();
    var box = document.createElement("div"); box.id = "nm-pinbox"; box.className = "nm-pinbox"; box.innerHTML = '<p class="muted">读取置顶行情…</p>';
    var row = b.closest("tr"), tbl = b.closest(".nm-otbl");
    (tbl || row).parentNode.insertBefore(box, (tbl || row).nextSibling);
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    pinsGet().then(function (m) {
      var top = m._top || [], mine = m[it.t + ":" + it.id] || 0, def = Math.max(PIN_MIN, top.length ? Math.floor(top[0] - mine + 1) : PIN_MIN);
      box.innerHTML = '<b>⭐ 付费置顶「' + esc(it.label + "." + it.t) + '」</b>' +
        '<ul><li>置顶 3 天，出价越高排越前（同一张单再付会累加）</li><li>最少 <b>' + PIN_MIN + ' DAI</b>，从你的钱包直接付</li><li>⚠️ 3 天内没卖掉也不退</li></ul>' +
        '<p class="nm-pin-now">' + (top.length ? "现在置顶出价：<b>" + top.slice(0, 5).join(" / ") + "</b> DAI" : "现在还没有人置顶，你付了就是第 1 名") + (mine ? "<br>你这张单已付 <b>" + mine + "</b> DAI" : "") + "</p>" +
        '<div class="nm-pin-q">' + [PIN_MIN, 20, 50, 100].filter(function (x, k, z) { return z.indexOf(x) === k; }).map(function (x) { return '<button type="button" data-pq="' + x + '">' + x + "</button>"; }).join("") + "</div>" +
        '<div class="nm-pin-in"><input id="nm-pinv" inputmode="decimal" value="' + def + '"><span>DAI</span></div>' +
        '<div class="nm-pin-b"><button type="button" class="nm-go" id="nm-pinok">⭐ 确认付款置顶</button><button type="button" class="ghost" id="nm-pinno">取消</button></div><p class="nm-st" id="nm-pinst"></p>';
      var inp = document.getElementById("nm-pinv"), st = document.getElementById("nm-pinst"), ok = document.getElementById("nm-pinok");
      var say2 = function (t) { st.textContent = t; say(t); };
      box.querySelectorAll("[data-pq]").forEach(function (q) { q.onclick = function () { inp.value = q.getAttribute("data-pq"); }; });
      document.getElementById("nm-pinno").onclick = function () { box.remove(); };
      ok.onclick = function () {
        var v = String(inp.value || "").trim().replace(/[，,]/g, ""), n = Number(v);
        if (!(n >= PIN_MIN) || !/^\d+(\.\d{1,2})?$/.test(v)) { st.textContent = "⚠️ 最少 " + PIN_MIN + " DAI，最多 2 位小数（例如 10 或 12.5）"; inp.focus(); return; }
        ok.disabled = true; b.disabled = true;
        var wei = BigInt(Math.round(n * 100)) * 10n ** 16n;
        tx(DAI, "0xa9059cbb" + A.pad(BUYBACK) + u256(wei), say2, "⭐ 付置顶费 " + n + " DAI（3 天，不退）。请在钱包确认").then(function (h) {
          var p = { tx: h, t: it.t, id: it.id };
          try { localStorage.setItem("nmPinTx", JSON.stringify(p)); } catch (e) {}
          say2("付款成功，登记置顶中…");
          return pinPost(p, say2);
        }).then(function () { ok.disabled = false; b.disabled = false; }, function (e) { ok.disabled = false; b.disabled = false; st.textContent = ""; A.errTip(e.message || String(e), ok); });
      };
    }, function () { box.innerHTML = '<p class="muted">置顶行情读取失败，请稍后再试</p>'; });
  }
  function market() {
    var box = document.getElementById("nm-mk");
    if (!box) return;
    box.innerHTML = '<p class="muted">读取中…</p>';
    var tlds = Object.keys(OTC).filter(function (t) { return OTC[t]; });
    listings(true).then(function (list) {
      list = list.filter(function (x) { return !x.expired && (x.t !== "lgns" || (account && x.maker === account)); }); // 过期的不在市场里显示；.lgns 暂停：市场只显示 .ailgns；自己挂的老 .lgns 单照样显示（能看到、能撤）
      if (!list.length) { box.innerHTML = '<p class="muted">还没有人挂单。点上面「我要卖域名」就能挂。</p>' + rankRules(); rankLookup(); return; }
      var makers = list.map(function (x) { return x.maker; }).filter(function (a, i, z) { return z.indexOf(a) === i; });
      return Promise.all([otcVols(makers), pinsGet()].concat(tlds.map(function (t) { return genesis(t).catch(function () { return {}; }); }))).then(function (r) {
        list.forEach(function (it) { it.pin = r[1][it.t + ":" + it.id] || 0; });
        draw(list, r[0], r.slice(2));
      });
    }).catch(function () { box.innerHTML = '<p class="muted">读取失败，请稍后再试</p>'; });
    function draw(full, vols, gens) {
      var list = full;
      list.forEach(function (it) { var ti = tlds.indexOf(it.t); it.vol = vols[it.maker] || 0; it.gno = gens[ti][it.tid] || 0; it.cost = yearPrice(it.label); /* 名字一年的注册价，不看买了几年 */ });
      // 🔍 搜索：按域名或卖家地址 / 名字筛选（挂单多了一页页翻找不到）
      var q = mkQ.trim().toLowerCase().replace(/\.(ailgns|lgns)$/, "");
      if (q) list = full.filter(function (it) { return it.label.toLowerCase().indexOf(q) >= 0 || it.maker.indexOf(q) >= 0 || ((A.nameCache || {})[it.maker] || "").toLowerCase().indexOf(q) >= 0; });
      // ✨ AI 推荐（站长 2026-11-09）：只显示 AI 挑出的那 20 个，按 AI 给的顺序，理由写在名字下面
      var aiMap = null;
      if (mkSort === "ai") {
        if (aiPicks === null) { aiPicks = []; aiErr = "loading"; fetch("/api/name-ai").then(function (r) { return r.json(); }).then(function (j) { aiPicks = j.picks || []; aiAt = j.at || 0; aiErr = j.err || ""; draw(full, vols, gens); }, function () { aiErr = "fail"; draw(full, vols, gens); }); }
        aiMap = {}; aiPicks.forEach(function (p, k) { aiMap[p.t + ":" + p.id] = { k: k, why: p.why, tag: p.tag }; });
        list = list.filter(function (it) { return aiMap[it.t + ":" + it.id]; });
        list.forEach(function (it) { var m = aiMap[it.t + ":" + it.id]; it.why = m.why; it.tag = m.tag; it.aik = m.k; });
      }
      // 排名规则（推荐）：① 卖家 OTC 累计成交多的在前 ② 名字一年注册价高的在前（3 位 640、4 位 160、中文 2 字 50…）③ 创世编号小的在前 ④ 新挂的在前
      list.sort(mkSort === "ai" ? function (a, b) { return a.aik - b.aik; } : mkSort === "price" ? function (a, b) { return a.price < b.price ? -1 : a.price > b.price ? 1 : 0; }
        : mkSort === "priced" ? function (a, b) { return a.price > b.price ? -1 : a.price < b.price ? 1 : 0; } // 价格高→低（站长 2026-11-09）
        : mkSort === "new" ? function (a, b) { return b.id - a.id; }
        : function (a, b) { return b.pin - a.pin || b.vol - a.vol || b.cost - a.cost || (a.gno || 1e9) - (b.gno || 1e9) || (a.t === b.t ? 0 : a.t === "ailgns" ? -1 : 1) || b.id - a.id; });
      var now2 = Date.now() / 1000;
      box.innerHTML = '<div class="nm-rulebar"><b>📋 挂单展示规则</b><span>⭐ <b>付费置顶</b>的排最前（出价高的在前）</span><span>① 卖家 <b>OTC 累计成交越多</b>，越靠前</span><span>② 名字<b>注册价越高</b>（越稀缺），越靠前</span><span>③ <b>创世编号越小</b>，越靠前</span><span>④ 都一样的，新挂的在前</span></div>' +
        '<div class="nm-mkq"><input id="nm-mkq" placeholder="🔍 搜域名或卖家地址，例如 发财 / 0xf0da…" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(mkQ) + '">' + (q ? '<span class="muted">找到 ' + list.length + " 个</span>" : "") + "</div>" +
        '<div class="seg nm-sort" id="nm-sort">' + [["rec", "推荐排序"], ["ai", "✨ AI 推荐"], ["price", "价格低→高"], ["priced", "价格高→低"], ["new", "最新挂单"]].map(function (x) { return '<button type="button" data-s="' + x[0] + '"' + (mkSort === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>" +
        (mkSort === "ai" ? '<p class="muted nm-aidisc">✨ AI 每小时从全部挂单里挑 20 个，只按<b>寓意、稀缺、性价比</b>三条看名字和价格，不看卖家' + (aiAt ? " · 更新于 " + new Date(aiAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) : "") + ' · 仅供参考，不构成投资建议</p>' +
          (!list.length ? '<p class="muted nm-aiempty">' + (aiErr === "loading" ? "✨ AI 正在挑选，几秒后自动显示…" : aiErr ? "AI 这会儿没答上来，稍后再点一次，或先看「推荐排序」" : "这一小时 AI 没挑出特别值得推荐的，看看其它排序") + "</p>" : "") : "") +
        '<div class="tbl-wrap"><table class="cards book"><thead><tr><th class="l">操作</th><th class="l">域名</th><th>标价 DAI</th><th>买家付（含 3%）</th><th>剩余时间</th><th class="l">卖家</th></tr></thead><tbody>' + list.map(function (it, i) {
        var mine = account && it.maker === account, p = Number(it.price / 10n ** 12n) / 1e6;
        var act = mine ? '<button type="button" class="ghost act-btn" data-i="' + i + '" data-m="1">撤单</button>'
          : '<button type="button" class="act-btn btn-buy" data-i="' + i + '" data-m="0">买入</button>';
        return '<tr' + (i >= mkShow() ? " hidden" : "") + (it.pin && mkSort === "rec" ? ' class="nm-pinrow"' : "") + '><td class="act">' + act + '</td><td data-l="域名" class="l">' + (it.pin && mkSort === "rec" ? '<span class="nm-pin">⭐ 置顶</span> ' : "") + '<b>' + esc(it.label) + "." + it.t + '</b> <i class="nm-gb" data-g="' + it.t + ":" + it.tid + '"></i>' + (mkSort === "ai" && it.why ? '<small class="nm-why"><i>' + esc(it.tag || "推荐") + "</i>" + esc(it.why) + "</small>" : "") + '</td>' +
          '<td data-l="标价 DAI" class="price"><b>' + p + '</b></td><td data-l="买家付">' + Math.round(p * 1.03 * 1e6) / 1e6 + '</td><td data-l="剩余时间">' + leftT(it.expiry - now2) + '</td>' +
          '<td data-l="卖家" class="l mono">' + (mine ? '<b style="color:var(--gold)">我的</b>' : (A.nameTag ? A.nameTag(it.maker) : A.short(it.maker))) +
          '<br><small class="nm-vol">' + (it.vol ? "OTC 累计成交 " + A.fmt(it.vol, 2) + " DAI" : "暂无 OTC 成交") + "</small></td></tr>";
      }).join("") + '</tbody></table></div>' + (list.length > mkStep() ? '<div class="nm-morebar">' + (list.length > mkShow() ? '<button type="button" class="nm-more" id="nm-mkmore">再看 ' + Math.min(mkStep(), list.length - mkShow()) + " 个 ▼ <small>（已显示 " + mkShow() + " / " + list.length + "）</small></button>" : "") + (mkShow() > mkStep() ? '<button type="button" class="nm-more nm-less" id="nm-mkless">收起 ▲</button>' : "") + "</div>" : "") + '<p class="muted nm-st" id="nm-mst"></p>' + rankRules();
      var more = document.getElementById("nm-mkmore");
      if (more) more.onclick = function () { mkN = mkShow() + mkStep(); draw(full, vols, gens); };
      var less = document.getElementById("nm-mkless");
      if (less) less.onclick = function () { mkN = 0; draw(full, vols, gens); box.scrollIntoView({ behavior: "smooth", block: "start" }); };
      box.querySelectorAll("[data-g]").forEach(function (e) { var k = e.getAttribute("data-g").split(":"), n = gens[tlds.indexOf(k[0])][k[1]]; if (n) e.textContent = "🌟 创世 #" + n; });
      var qi = document.getElementById("nm-mkq"), qt;
      if (qi) qi.oninput = function () { clearTimeout(qt); qt = setTimeout(function () { mkQ = qi.value; mkN = 0; draw(full, vols, gens); var n = document.getElementById("nm-mkq"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); };
      document.getElementById("nm-sort").onclick = function (e) { var b = e.target.closest("button[data-s]"); if (!b) return; mkSort = b.getAttribute("data-s"); draw(full, vols, gens); };
      rankLookup();
      var st = document.getElementById("nm-mst"), say = function (t) { st.textContent = t; };
      box.querySelectorAll("button[data-i]").forEach(function (b) {
        b.onclick = function () {
          buyIt(list[Number(b.getAttribute("data-i"))], b, say).then(function () { say("✅ 成功，订单已记录在下方「🧾 域名订单查询」"); market(); ordAfter(); }, function (e) { say(""); A.errTip(e.message || String(e), b); });
        };
      });
    }
  }
  // 挂单多：手机先显示 5 个、电脑 10 个，点「再看」每次多显示同样多个，不一下子全铺开
  var mkSort = "rec", mkN = 0, mkQ = "", aiPicks = null, aiAt = 0, aiErr = ""; // ✨ AI 推荐：/api/name-ai 每小时挑 20 个 + 理由
  function mkStep() { return innerWidth < 640 ? 5 : 10; }
  function mkShow() { return mkN || mkStep(); }
  // 卖家的「OTC 累计成交」：和会员卡上同一个数（本站 OTC 单笔满 50 DAI 的成交累计）
  function otcVols(as) {
    if (!as.length) return Promise.resolve({});
    return fetch("/api/member?vols=" + as.join(",")).then(function (r) { return r.json(); }).then(function (j) { return j.vols || {}; }, function () { return {}; });
  }
  function rankRules() {
    return '<details class="nm-rules"><summary>📋 规则详细说明 · 查我的 OTC 成交额</summary><ol>' +
      "<li><b>卖家 OTC 累计成交越多，排越前。</b>就是会员卡上的「OTC 累计成交」：在本站 OTC（AiLGNS / LGNS / gLGNS / NFT 卡牌 / 域名）单笔成交满 50 DAI 的金额累计。成交多说明信誉好，买家更放心。</li>" +
      "<li><b>成交一样的，按名字一年的注册价排</b>：英文 3 位（640 DAI）＞ 4 位（160 DAI）＞ 中文 2 字（50 DAI）＞ 普通名字（5 DAI），越稀缺越靠前；只看名字本身，和买了几年无关。</li>" +
      "<li><b>再一样的，按创世编号排</b>：创世 #1 最前，编号越小越靠前。</li>" +
      "<li><b>都一样的，按挂单时间排</b>，新挂的在前。</li></ol>" +
      '<p class="muted">想排前面？多在 <a href="#/otc">OTC 交易</a> 成交就行。也可以点上面「价格低→高」「最新挂单」换排序。刷单每笔要付 3% 手续费，刷不划算。</p>' +
      '<div class="nm-rk"><input id="nm-rk-a" placeholder="填钱包地址，查你的 OTC 累计成交" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button" id="nm-rk-go">查询</button></div><p class="note" id="nm-rk-r"></p></details>';
  }
  function rankLookup() {
    var inp = document.getElementById("nm-rk-a"), go = document.getElementById("nm-rk-go"), out = document.getElementById("nm-rk-r");
    if (!inp) return;
    if (account) inp.value = account;
    var run = function () {
      var a = inp.value.trim().toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(a)) { A.errTip("请填 0x 开头的钱包地址", go); return; }
      out.textContent = "查询中…";
      otcVols([a]).then(function (v) {
        var vol = v[a] || 0;
        out.innerHTML = vol ? "✅ " + A.short(a) + " 的 OTC 累计成交：<b>" + A.fmt(vol, 2) + " DAI</b>。挂单时会排在成交比你少的卖家前面" : A.short(a) + " 还没有 OTC 成交（单笔满 50 DAI 才计入）。挂单会排在有成交的卖家后面，创世名字按编号排";
      });
    };
    go.onclick = run;
    if (account) run();
  }

  A.pages.names = page;
})();
