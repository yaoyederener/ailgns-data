// OTC 担保交易：挂单的币锁在智能合约里，吃单在同一笔交易里完成交换，过期自动退回
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  var ANUBIS_DAI = "0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14", ANUBIS_AILGNS = "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", ANUBIS_EXPLORER = "#/scan";
  // 各市场用同一份托管合约代码（AilgnsOtcEscrow.sol），各自部署一份，构造参数换成对应的币和 DAI
  // otc 空着时页面显示"即将上线"；pairDai：DEX 交易对里 DAI 是 token0 还是 token1；pd：单价显示几位小数
  // dexSell：在 DEX 卖 1 枚实际到手 ≈ 市价 × dexSell；dexBuy：在 DEX 买 1 枚实际成本 ≈ 市价 × dexBuy（买入不扣税，只有池子手续费 + 滑点）
  // AiLGNS 官方 DEX 卖出扣 3%；LGNS 卖进池子扣税：Polygon 固定 5%，Anubis 动态（常见 50% 左右，页面打开时从 /api/sell-tax 读链上实测值）
  var MARKETS = {
    ailgns: { sym: "AiLGNS", chain: "anubis", chainName: "Anubis", otc: "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", token: ANUBIS_AILGNS, dai: ANUBIS_DAI, dec: 18, pd: 2,
      pair: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", pairDai: 1, explorer: ANUBIS_EXPLORER, gas: "DAI", dexSell: 0.967, dexBuy: 1.005, dexName: "官方 DEX", eg: [5, 800], buyRef: 1.3 },
    lgns: { sym: "LGNS", chain: "anubis", chainName: "Anubis", otc: "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818", token: "0x4D1D808a081FdAc440703b3765FC61f8028C06B8", dai: ANUBIS_DAI, dec: 9, pd: 4,
      pair: "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", pairDai: 1, explorer: ANUBIS_EXPLORER, gas: "DAI", dexSell: 0.4985, dexBuy: 1.005, dexName: " DEX", eg: [10000, 0.075], liveTax: true,
      dexNote: "Anubis 链 DEX 卖出 LGNS 的手续费是动态的，常见 50% 左右（暂时没读到实测值，按 50% 算）。" },
    plgns: { sym: "LGNS", chain: "polygon", chainName: "Polygon", otc: "0x4060f38d3e837843b69014d9f85ecfb3e29fa2db", token: "0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01", dai: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", dec: 9, pd: 4,
      pair: "0x882df4b0fb50a229c3b4124eb18c759911485bfb", pairDai: 0, explorer: "https://polygonscan.com", gas: "POL", dexSell: 0.947, dexBuy: 1.005, dexName: " DEX", eg: [10000, 0.15],
      dexNote: "Polygon 链 DEX 卖出 LGNS 固定扣 5% 手续费，买入不扣。" },
    // gLGNS（Governance LGNS，Anubis 链，18 位小数）：普通 ERC20，DEX 买卖都不扣税，只有池子 0.3% 手续费
    glgns: { sym: "gLGNS", chain: "anubis", chainName: "Anubis", otc: "0x2b0ab121d60f823fffc4cef75af26055df388e2b", token: "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c", dai: ANUBIS_DAI, dec: 18, pd: 2,
      pair: "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", pairDai: 0, explorer: ANUBIS_EXPLORER, gas: "DAI", dexSell: 0.997, dexBuy: 1.003, dexName: " DEX", eg: [0.1, 83000],
      flat: true }, // DEX 不扣税、价差不到 1%：指导价就是市价，不算「比 DEX 多拿多少」
    // AWAKE NFT 卡牌（Anubis 链，ERC721）：用另一份托管合约 AwakeNftEscrow（整张成交、手续费 3% 买家另付），页面在 nft.js；token 是卡牌合约
    nft: { sym: "AWAKE NFT", chain: "anubis", chainName: "Anubis", nft: true, otc: "0x8c67912b3ed44f4512c2f22b7b2263f6659396ed", token: "0x58839f46bd0E3F4494E2BEB8ca93Da9352208615", dai: ANUBIS_DAI, dec: 0, pd: 2,
      explorer: ANUBIS_EXPLORER, gas: "DAI", eg: [1, 500] }
  };
  var MKEYS = ["ailgns", "lgns", "nft", "plgns", "glgns"], MK_MAIN = 3; // 站长 2026-11-07：按成交量排，前 3 个常驻，其余折进「更多币种」
  // 当前市场；下面的 OTC / AILGNS（挂单的币）/ DAI 等跟着切换
  var M, MK, OTC, AILGNS, DAI, SYM, TD, TUNIT, PD, EXPLORER, GAS_RESERVE, DEX_SELL, DEX_BUY, RANGE, DX;
  function useMarket(k) {
    MK = MARKETS[k] ? k : "ailgns"; M = MARKETS[MK];
    OTC = M.otc; AILGNS = M.token; DAI = M.dai; SYM = M.sym; TD = M.dec; TUNIT = 10n ** BigInt(TD); PD = M.pd; EXPLORER = M.explorer;
    // Anubis 链的 Gas 就是用 DAI 付的（DAI 余额就是 Gas 余额），用 DAI 的「最大」要留一点当 Gas；Polygon 用 POL 付 Gas，不用留 DAI
    GAS_RESERVE = M.gas === "DAI" ? 10n ** 17n : 0n; // 0.1 DAI，够授权 + 成交好几次
    DEX_SELL = M.dexSell; DEX_BUY = M.dexBuy; DX = M.dexName;
    if (M.liveTax && SELL_TAX !== null) DEX_SELL = (1 - SELL_TAX) * 0.997; // 链上实测扣费 + 池子 0.3%
    RANGE = { sell: [DEX_SELL, DEX_BUY * TAKER], buy: [DEX_SELL / TAKER, DEX_BUY] };
  }
  // Anubis LGNS 卖出实测扣费（/api/sell-tax，服务器每 5 分钟看一次最近的卖单）；读到后重新算 DEX 到手价和指导价
  var SELL_TAX = null;
  function loadTax() {
    if (!M.liveTax) return Promise.resolve();
    return fetch("/api/sell-tax").then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.lgns > 0 && j.lgns < 0.95) { SELL_TAX = j.lgns; useMarket(MK); }
    }).catch(function () { /* 读不到就按默认 50% */ });
  }
  // 指导价跟真实成交走（站长要求）：/api/guide 给出最近 30 笔成交价 ÷ 当时 DEX 市价的中位数，页面乘上现在的市价
  var GUIDE = null;
  var guideP = fetch("/api/guide").then(function (r) { return r.json(); }).then(function (j) { GUIDE = j || {}; }, function () { GUIDE = {}; });
  var POL_MIN = 2n * 10n ** 16n; // Polygon 上至少留 0.02 POL 付 Gas
  var FEE_RECIPIENT = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6";
  var FEE_BPS = 100n;
  // 收入分账合约（Anubis、Polygon 各一个）：原收款钱包授权后，到账的收入按 30% / 40% / 30% 自动分出去（地址、比例写死）
  var SPLITTERS = { anubis: "0xeee877c1b6285b82890bdcd027d2715f658ecf23", polygon: "0xcc274e07847a6a86917b6ccd4e67706170d4036f" };
  var PAYEES = [["0xe8782615e32557f257dd88d70b1eb0d7f47b91c3", 30], ["0xd53a00bb90bb606f10d888419a14eca779f17285", 40], [FEE_RECIPIENT, 30]];
  // 回购分账合约（Anubis）：收到的 LGNS、DAI 在 OTC 换成 AiLGNS，连同收到的 AiLGNS 按 40 / 30 / 30 分；部署后填地址
  var BUYBACK = "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3";
  // OTC 自动撮合合约（Anubis）：卖单比买单便宜 2% 以上时，从收款钱包临时取 DAI 吃卖单再卖给买单，本金当笔退回，利润进回购合约
  var MATCHER = "0xdcc5354175d60ffc8364e71e792fcd66366f00fe";
  var BB_PAYEES = [["0xd53a00bb90bb606f10d888419a14eca779f17285", 40], ["0xe8782615e32557f257dd88d70b1eb0d7f47b91c3", 30], ["0x5505d382bf5d705c5d3ec0cbfc17a3dde394b322", 30]];
  var SOURCE = "https://github.com/yaoyederener/ailgns-data/blob/main/contracts/AilgnsOtcEscrow.sol";
  var VERIFY = "https://github.com/yaoyederener/ailgns-data/blob/main/contracts/VERIFY.md";
  var SEL = {
    create: "0x9128a740", fill: "0x6fe4a448", cancel: "0x40e58ee5", ordersCount: "0x35daa731", getOrders: "0x8f72fc77",
    approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231"
  };
  // 有效期：合约允许 10 分钟到 30 天；用按钮而不是下拉框，钱包内置浏览器里下拉框经常点不动
  var DURATIONS = [[600, "10 分钟"], [1800, "30 分钟"], [3600, "1 小时"], [7200, "2 小时"], [21600, "6 小时"], [43200, "12 小时"],
    [86400, "1 天"], [3 * 86400, "3 天"], [7 * 86400, "7 天"], [15 * 86400, "15 天"], [30 * 86400, "30 天"]];
  var DUR_MIN = 600, DUR_MAX = 30 * 86400;
  var DUR_DEFAULT = 30 * 86400; // 站长 2026-11-06：默认挂满 30 天（合约允许的上限），订单簿更厚；随时可撤单
  // 有效期滑块（站长 2026-11-06：做成进度条的感觉）：11 个档位拖着选，下面有刻度，右边一个「自定义」小按钮
  function durText(sec) { return sec % 86400 === 0 ? sec / 86400 + " 天" : sec % 3600 === 0 ? sec / 3600 + " 小时" : sec >= 3600 ? Math.floor(sec / 3600) + " 小时 " + Math.round(sec % 3600 / 60) + " 分钟" : Math.round(sec / 60) + " 分钟"; }
  function durSlider(host, opt) {
    // 站长 2026-11-07：不要滑块，默认 30 天一行字，旁边一个小小的「自定义」；订单簿要热闹，单子别一会儿就没了
    opt = opt || {}; var val = opt.value || DUR_DEFAULT, unit = 86400;
    var old = host.querySelector(".dl"); if (old) old.remove(); // 不用 innerHTML：宿主里还有 <input hidden id="otc-dur">，清掉会让发布挂单读到 null
    host.insertAdjacentHTML("beforeend", '<div class="dl"><span class="dl-t">' + (opt.label || "有效期") + '</span><b class="dl-v"></b><small class="muted dl-st"></small><button type="button" class="link dl-cus">自定义</button>' +
      '<span class="dl-custom" hidden><input class="dl-n" inputmode="decimal" placeholder="数字"><span class="seg dl-u"><button type="button" data-u="60">分钟</button><button type="button" data-u="3600">小时</button><button type="button" data-u="86400" class="on">天</button></span><button type="button" class="link dl-back">用默认 30 天</button></span></div>');
    var v = host.querySelector(".dl-v"), st = host.querySelector(".dl-st"), cus = host.querySelector(".dl-custom"), n = host.querySelector(".dl-n");
    function paint(sec) {
      var ok = sec >= DUR_MIN && sec <= DUR_MAX;
      v.textContent = ok ? durText(sec) : "—";
      st.innerHTML = ok ? "到期没成交币自动退回 · 约 " + A.timeBJ(Date.now() + sec * 1000) + " 到期" : '<span class="down">要在 10 分钟到 30 天之间</span>';
      val = ok ? sec : 0; if (opt.onChange) opt.onChange(val);
    }
    host.querySelector(".dl-cus").onclick = function () { cus.hidden = false; this.hidden = true; n.focus(); };
    host.querySelector(".dl-back").onclick = function () { cus.hidden = true; host.querySelector(".dl-cus").hidden = false; n.value = ""; paint(DUR_DEFAULT); };
    host.querySelectorAll(".dl-u button").forEach(function (b) { b.onclick = function () { host.querySelectorAll(".dl-u button").forEach(function (x) { x.classList.toggle("on", x === b); }); unit = Number(b.getAttribute("data-u")); var x = Number(n.value); if (x > 0) paint(Math.round(x * unit)); }; });
    n.oninput = function () { var x = Number(n.value); paint(x > 0 ? Math.round(x * unit) : NaN); };
    paint(val);
    return { value: function () { return val; }, set: function (sec) { paint(sec); } };
  }
  var account = null;
  var sweeping = false; // 正在一键扫单：不自动刷新页面
  // 扫单方向：扫完刷新后停在原来的「扫卖单 / 扫买单」，不跳回买入（客户反馈）。存进 sessionStorage：有的钱包浏览器成交后会整页重新加载
  var sweepSide = "buy";
  try { if (sessionStorage.getItem("otc:sw") === "sell") sweepSide = "sell"; } catch (e) { /* 忽略 */ }
  // 指导价：要比 DEX 对买卖双方都划算，才容易成交（DEX 到手价 / 成本见上面各市场的 dexSell、dexBuy）
  // 吃单方付 1% 手续费，所以：卖单价 ≤ 市价 × dexBuy × 99% 买家才划算；买单价 ≥ 市价 × dexSell ÷ 99% 卖家才划算
  var TAKER = 0.99;
  // 指导价取合理区间（RANGE）的正中间：卖家比去 DEX 卖多拿的，和买家比去 DEX 买省下的，差不多一样多，两边都有赚头
  useMarket("ailgns");

  // ---------- 数字 ----------
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  // dec：小数位数，默认 18（DAI）；挂单的币用 tWei / tNum / tShow（AiLGNS 18 位，LGNS 9 位）
  function toWei(str, dec) {
    dec = dec || 18;
    // 手机键盘可能打出全角符号或空格；逗号要分清是千分位（1,000 / 1,234,567.89）还是小数点（中文键盘打出的 0,5）
    str = String(str || "").replace(/[．。]/g, ".").replace(/，/g, ",").replace(/\s/g, "");
    if (str.indexOf(",") >= 0) {
      var parts0 = str.split(","), tail = parts0[parts0.length - 1];
      // 有小数点、或多个逗号、或逗号后面正好 3 位数字（且前面是 1–3 位）：都是千分位，去掉；否则当小数点
      if (str.indexOf(".") >= 0 || parts0.length > 2 || (/^\d{1,3}$/.test(parts0[0]) && /^\d{3}$/.test(tail))) str = str.replace(/,/g, "");
      else str = str.replace(",", ".");
    }
    if (!/^\d*\.?\d*$/.test(str) || str === "" || str === ".") return null;
    var parts = str.split("."), frac = (parts[1] || "").slice(0, dec).padEnd(dec, "0");
    return BigInt(parts[0] || "0") * 10n ** BigInt(dec) + BigInt(frac);
  }
  function num(wei, dec) { return Number(wei) / Math.pow(10, dec || 18); }
  function show(wei, d, dec) { return A.fmt(num(wei, dec), d === undefined ? 4 : d); }
  function tWei(str) { return toWei(str, TD); }
  function tNum(v) { return num(v, TD); }
  function tShow(v, d) { return show(v, d, TD); }
  // 往下取到 d 位小数的字符串（填进输入框用，不会超过余额）
  function floorStr(v, d, dec) {
    var s = (v / 10n ** BigInt(dec - d)).toString().padStart(d + 1, "0");
    return (s.slice(0, -d) + "." + s.slice(-d)).replace(/\.?0+$/, "");
  }
  function ceilDiv(a, b) { return (a + b - 1n) / b; }
  // 零头：剩下的不到 0.0001 个（挂单币或换回的币），吃单按 4 位小数往下取时会剩这么一点
  function isCrumb(o, left) {
    var gd = o.sellAilgns ? TD : 18, wd = o.sellAilgns ? 18 : TD;
    return left < 10n ** BigInt(gd - 4) || ceilDiv(left * o.wantTotal, o.giveTotal) < 10n ** BigInt(wd - 4);
  }
  // 剩下的值多少 DAI：卖单按单价折算，买单存的就是 DAI
  function daiLeft(o, left) { return o.sellAilgns ? ceilDiv(left * o.wantTotal, o.giveTotal) : left; }
  var MIN_ORDER = 50n * 10n ** 18n; // 单笔成交满 50 DAI 才送会员（挂单金额不限，站长要求）
  var MIN_DAI = 10n ** 18n; // 剩余不足 1 DAI 的挂单自动下架：不在市场里显示，挂单人点「取回」退回（到期也会自动退回）
  function isDustLeft(o, left) { return isCrumb(o, left) || daiLeft(o, left) < MIN_DAI; }
  function isDust(o) { return o.giveLeft > 0n && o.giveLeft < o.giveTotal && isDustLeft(o, o.giveLeft); } // 只下架「成交后剩下的零头」；新挂的小额单照常显示
  function left(sec) {
    if (sec <= 0) return "已过期";
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return d ? d + " 天 " + h + " 小时" : h ? h + " 小时 " + m + " 分" : m + " 分钟";
  }

  // ---------- 读链 ----------
  function words(h) { var out = []; for (var i = 2; i < h.length; i += 64) out.push(h.slice(i, i + 64)); return out; }
  function parseOrders(r, from) {
    if (!r || r === "0x") return [];
    var w = words(r), n = Number(BigInt("0x" + w[1])), list = [];
    for (var i = 0; i < n; i++) {
      var o = w.slice(2 + i * 7, 9 + i * 7);
      list.push({
        id: from + i, maker: "0x" + o[0].slice(24), sellAilgns: BigInt("0x" + o[1]) === 1n, open: BigInt("0x" + o[2]) === 1n,
        expiry: Number(BigInt("0x" + o[3])), giveTotal: BigInt("0x" + o[4]), wantTotal: BigInt("0x" + o[5]), giveLeft: BigInt("0x" + o[6])
      });
    }
    return list;
  }
  function readOrders() {
    return read(OTC, SEL.ordersCount).then(function (h) {
      var count = Number(BigInt(h)), from = Math.max(0, count - 1000);
      if (!count) return [];
      return read(OTC, SEL.getOrders + u256(from) + u256(count - from)).then(function (r) { return parseOrders(r, from); });
    });
  }
  // ---------- 秒开：订单簿先用上次打开时存下的，再用后台缓存（/api/book，边缘缓存、毫秒级）刷新；后台出错才直接读链 ----------
  var BOOK_KEY = "otc:book:";
  function bookOf(j) { return { orders: parseOrders(j.orders, j.from), mkt: j.reserves ? priceFromReserves(j.reserves) : null, raw: j.orders }; }
  function savedBook() {
    try { var j = JSON.parse(localStorage.getItem(BOOK_KEY + MK) || "null"); return j && j.orders ? bookOf(j) : null; } catch (e) { return null; }
  }
  // 市场超过 1000 张单后，自己更早挂的单不在窗口里（客户反馈「我的挂单」空的、撤不了）：连了钱包就再问后台要一次自己的老单，合并进来
  function withMine(b, fresh) {
    var mk = MK, a = account;
    if (!a || !b.orders.length) return Promise.resolve(b);
    var from = b.orders.reduce(function (m, o) { return Math.min(m, o.id); }, Infinity);
    if (!(from > 0)) return Promise.resolve(b);
    return fetch("/api/book?m=" + mk + "&mine=" + a + (fresh ? "&fresh=1" : "")).then(function (r) { return r.json(); }).then(function (j) {
      (j.older || []).forEach(function (x) {
        if (b.orders.some(function (o) { return o.id === x.id; })) return;
        var o = x.o;
        b.orders.unshift({ id: x.id, maker: "0x" + o[0].slice(24), sellAilgns: BigInt("0x" + o[1]) === 1n, open: BigInt("0x" + o[2]) === 1n, expiry: Number(BigInt("0x" + o[3])), giveTotal: BigInt("0x" + o[4]), wantTotal: BigInt("0x" + o[5]), giveLeft: BigInt("0x" + o[6]), older: true });
      });
      return b;
    }).catch(function () { return b; });
  }
  function loadBook(fresh) {
    var mk = MK, tax = loadTax();
    return tax.then(function () { return fetch("/api/book?m=" + mk + (fresh ? "&fresh=1" : "")).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.error || !j.orders) throw new Error("book");
      try { localStorage.setItem(BOOK_KEY + mk, JSON.stringify(j)); } catch (e) { /* 存不下就算了 */ }
      return bookOf(j);
    }).catch(function () {
      return Promise.all([readOrders(), marketPrice().catch(function () { return null; })]).then(function (r) { return { orders: r[0], mkt: r[1], raw: null }; });
    }).then(function (b) { return withMine(b, fresh); }); });
  }
  // 读当前市场所在的链
  function read(to, data) { return W.rpcOn(M.chain, "eth_call", [{ to: to, data: data }, "latest"]); }
  function balance(token, who) { return read(token, SEL.balanceOf + u256(who)).then(BigInt); }
  function allowance(token, who, spender) { return read(token, SEL.allowance + u256(who) + u256(spender || OTC)).then(BigInt); }
  // 批量扫单合约（Anubis 的 AiLGNS / LGNS / gLGNS 三个市场）：一笔交易吃多张单，钱包只确认 1 次；没填地址或别的市场就照旧一张一张吃
  var ROUTER = "0x6ec474047a6c12d0cab53855a990c1c8b3996c20", ROUTER_MK = { ailgns: 1, lgns: 1, glgns: 1 };
  function useRouter() { return !!(ROUTER && ROUTER_MK[MK]); }
  function gasBalance(who) { return W.rpcOn(M.chain, "eth_getBalance", [who, "latest"]).then(BigInt); }
  // Polygon 上 Gas 用 POL 付：钱包里没有 POL 的话，交易发不出去，提前说清楚
  function checkPol() {
    if (M.gas !== "POL") return Promise.resolve();
    return gasBalance(account).then(function (g) {
      if (g < POL_MIN) throw new Error("Polygon 链的 Gas 用 POL 支付：钱包里至少要有 0.02 POL，现在只有 " + show(g, 4) + " POL");
    });
  }
  // DEX 市价：每枚挂单币值多少 DAI
  function marketPrice() { return read(M.pair, "0x0902f1ac").then(priceFromReserves); }
  function priceFromReserves(h) {
    var dai = Number(A.word(h, M.pairDai)) / 1e18, tok = Number(A.word(h, 1 - M.pairDai)) / Math.pow(10, TD);
    return dai / tok;
  }
  // 每枚挂单币的 DAI 价格
  function priceOf(o) { return o.sellAilgns ? num(o.wantTotal) / tNum(o.giveTotal) : num(o.giveTotal) / tNum(o.wantTotal); }

  // ---------- 发交易 ----------
  // 都包在 Promise 里：没有钱包时也会走到失败提示，而不是按钮没反应
  function connect() {
    var eth;
    return A.wallets.choose().then(function (p) {
      eth = p;
      return AIL.wallets.ask(eth, { method: "eth_requestAccounts" });
    }).then(function (a) {
      account = String(a[0]).toLowerCase();
      return W.switchTo(eth, M.chain);
    }).then(function () { return account; });
  }
  function ready() {
    return Promise.resolve().then(function () { return account ? W.switchTo(W.get(), M.chain) : connect(); });
  }
  // 钱包已经授权过本站时，不弹窗直接拿到地址
  function silentAccount() {
    if (account) return Promise.resolve();
    return A.wallets.silent().then(function (a) { if (a) account = a; });
  }
  // 合约的失败原因翻译成中文
  var REASONS = {
    NOTHING_FILLED: "你要吃的单刚刚被别人抢先成交或撤单了，这一笔一张都没吃到，已自动作废：你的币没有被扣。请刷新挂单列表，看最新价格再点一次。",
    TRANSFER_MISMATCH: "不能吃自己的挂单：付款钱包和挂单钱包是同一个。想取消请点「撤单」；测试成交需要换另一个钱包",
    CLOSED: "这张挂单已经成交完或被撤销，请刷新",
    EXPIRED: "这张挂单已经过期",
    BAD_AMOUNT: "数量超过了剩余可成交数量，请刷新后重试",
    PRICE_CHANGED: "应付金额和页面不一致，请刷新后重试",
    TOKEN_TRANSFER_FAILED: "代币转账失败：余额或授权额度不够",
    BAD_DURATION: "有效期不在允许范围内",
    ZERO_AMOUNT: "数量不能为 0",
    NOT_MAKER: "只有挂单人自己能撤单"
  };
  function niceError(e) {
    var msg = (e && (e.message || e.reason)) || "";
    for (var k in REASONS) if (msg.indexOf(k) >= 0) return REASONS[k];
    return W.error(e);
  }
  function send(to, data, say, label) {
    var eth = W.get();
    say("正在检查交易能否成功…");
    // 先模拟一次：会失败的交易直接说明原因，不让钱包弹出一个确认不了的窗口
    // 模拟和估 Gas 同时查（以前一个接一个，钱包弹出来要多等一轮）；用本站节点估好 Gas（多留 30%）交给钱包，有些钱包自己估算会失败
    return Promise.all([
      W.rpcOn(M.chain, "eth_call", [{ from: account, to: to, data: data }, "latest"]).catch(function (e) { throw new Error(niceError(e)); }),
      W.rpcOn(M.chain, "eth_estimateGas", [{ from: account, to: to, data: data }]).then(function (g) { return "0x" + (BigInt(g) * 13n / 10n).toString(16); }, function () { return null; })
    ]).then(function (res) {
      var gas = res[1];
      var tx = { from: account, to: to, data: data };
      if (gas) tx.gas = gas;
      // 这行字在手机上只显示两行：一句话说清楚这一步 + 为什么放心（站长要求）
      say(/^授权/.test(label) ? "🔒 合约开源、无管理员，只有你本人能动用。请在钱包确认授权" + (label.indexOf("只需一次") >= 0 ? "（只需一次）" : "") : "🔒 合约开源、无后门，币只按规则走。请在钱包确认" + (label.length <= 6 ? "「" + label + "」" : ""));
      return AIL.wallets.ask(eth, { method: "eth_sendTransaction", params: [tx] });
    }).then(function (hash) {
      say(label + "已提交，等待链上确认…");
      return W.waitOn(M.chain, hash);
    });
  }
  // 授权额度不够时一次授权到最大，以后挂单、吃单、扫单都不用再授权（站长要求）
  var MAX_UINT = (1n << 256n) - 1n;
  function ensureAllowance(token, amount, say, name, known, spender) {
    return (known !== undefined ? Promise.resolve(known) : allowance(token, account, spender)).then(function (a) {
      if (a >= amount) return;
      return send(token, SEL.approve + u256(spender || OTC) + u256(MAX_UINT), say, "授权 " + name + " 给" + (spender ? "批量扫单合约" : "托管合约") + "（只需一次，以后不用再授权）");
    });
  }

  // ---------- 页面 ----------
  // 和官方 DEX 兑换对比：醒目标识，按成交 1,000 美元算（DEX 手续费 3%–28%、滑点容差 0.5%–1% 由站长提供；滑点按「最多」写，实际滑点取决于池子深度）
  var VS = '<section class="vs"><div class="vs-head"><span class="vs-tag">同样买卖 1,000 美元的 AiLGNS</span>' +
    '<h2>官方 DEX 要贵 <em>3–28 倍</em>，在这里每 1,000 美元最多省 <em>270 美元</em></h2></div>' +
    '<div class="vs-nums">' +
    '<div class="vs-num vs-bad"><span>官方 DEX 扣</span><b>$30–$280</b><small>3%–28%<br>+ 滑点 ≤ $10</small></div>' +
    '<div class="vs-num vs-good"><span>本站只收</span><b>$10</b><small>固定 1%</small></div>' +
    '<div class="vs-num vs-win"><span>你省下</span><b>$20–$270</b><small>每 1,000 美元</small></div></div>' +
    '<div class="vs-bars" aria-hidden="true">' +
    '<div><span>官方最高</span><i class="bad" style="width:100%"></i><b>$280</b></div>' +
    '<div><span>官方最低</span><i class="bad" style="width:10.7%"></i><b>$30</b></div>' +
    '<div><span>本站</span><i class="good" style="width:3.6%"></i><b>$10</b></div></div>' +
    '<div class="vs-grid"><div class="vs-col vs-us"><b>AiLGNS OTC（本站）</b><ul>' +
    "<li><i>✓</i><span>手续费固定 <b>1%</b>：1,000 美元只收 <b>10 美元</b></span></li>" +
    "<li><i>✓</i><span><b>0 滑点</b>：挂单价是多少，就按多少成交，一分不少</span></li>" +
    "<li><i>✓</i><span>挂单、撤单、到期退回全部免费</span></li></ul></div>" +
    '<div class="vs-col vs-them"><b>官方 DEX 兑换</b><ul>' +
    "<li><i>✕</i><span>手续费 <b>3%–28%</b>：1,000 美元被扣 <b>30–280 美元</b></span></li>" +
    "<li><i>✕</i><span>还有滑点：滑点容差一般设 <b>0.5%–1%</b>，1,000 美元最多再少拿 <b>5–10 美元</b></span></li>" +
    "<li><i>✕</i><span>交易越频繁，被扣得越多</span></li></ul></div></div>" +
    '<p class="vs-save">买卖 1 万美元：官方 DEX 扣 <s>$300–$2,800</s>，本站只收 <b>$100</b></p></section>';

  // 首页大横幅：AiLGNS OTC 主推
  var HERO_ART = '<svg class="hero-art" viewBox="0 0 220 180" aria-hidden="true"><defs>' +
    '<linearGradient id="ha" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#009cff"/><stop offset=".55" stop-color="#4936ff"/><stop offset="1" stop-color="#a014f8"/></linearGradient>' +
    '<linearGradient id="hb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient></defs>' +
    '<circle cx="110" cy="90" r="78" fill="url(#ha)" opacity=".12"/><circle cx="110" cy="90" r="56" fill="url(#ha)" opacity=".16"/>' +
    '<path d="M110 40l34 13v26c0 23-15 40-34 47-19-7-34-24-34-47V53z" fill="url(#ha)"/>' +
    '<path d="M95 88l11 11 20-22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<g><circle cx="38" cy="58" r="24" fill="url(#hb)" stroke="#d5b9f5" stroke-width="2"/><text x="38" y="64" text-anchor="middle" font-size="15" font-weight="800" fill="#7027d9">AiL</text></g>' +
    '<g><circle cx="182" cy="122" r="24" fill="url(#hb)" stroke="#d5b9f5" stroke-width="2"/><text x="182" y="128" text-anchor="middle" font-size="14" font-weight="800" fill="#a014f8">DAI</text></g>' +
    '<path d="M62 50c22-18 48-22 66-16" fill="none" stroke="#9828dc" stroke-width="2.5" stroke-dasharray="4 5"/>' +
    '<path d="M158 130c-22 18-48 22-66 16" fill="none" stroke="#9828dc" stroke-width="2.5" stroke-dasharray="4 5"/></svg>';
  function hero(mkt, live) {
    return '<section class="otc-hero"><div class="hero-txt">' +
      '<span class="pill">智能合约担保 · 无需信任 · 无需许可</span>' +
      '<h1>AiLGNS <span class="grad">OTC</span></h1>' +
      '<p>AiLGNS ⇄ DAI 场外交易。币锁在合约里，付款和收币一笔完成，到期没成交自动退回（有效期 10 分钟到 30 天自选）。</p>' +
      '<div class="hero-promo"><a class="hp-tag" href="#/member" style="text-decoration:none">🎁 交易就送会员</a><span>单笔成交满 50 DAI 送<b>初级 VIP</b> · 累计成交满 <b>1 万 DAI</b> 送<b>高级 VIP</b> · 累计满 <b>100 万 DAI</b> 送<b>👑至尊 VIP</b> + 名人堂永久留名</span></div>' +
      '<div class="hero-cta"><button data-go="sell">我要卖 AiLGNS</button><button class="ghost" data-go="buy">我要买 AiLGNS</button></div>' +
      '<div class="hero-stats"><div><span>AiLGNS 市价</span><b>' + (mkt ? A.fmt(mkt, 2) : "—") + ' <small>DAI</small></b></div>' +
      "<div><span>挂单中</span><b>" + (live === null ? "—" : live) + " <small>张</small></b></div><div><span>成交手续费</span><b>1%</b></div></div></div>" + HERO_ART + "</section>";
  }

  // 市场切换：AiLGNS · LGNS（Anubis）· LGNS（Polygon）
  // 币种切换放到页面最顶上（引导卡上面）：站长 2026-11-08 看手机截图定的，点进 OTC 第一眼就选币种
  // 引导卡（#guide）和查订单条（#oq）在 OTC 页要排到「土豪扫单」下面：渲染前先放回 #app 外面（否则 innerHTML 一换就没了），渲染后再搬进页内的槽位
  function parkGuides() { var app = A.app; ["guide", "oq"].forEach(function (id) { var el = document.getElementById(id); if (el && app.contains(el)) app.parentNode.insertBefore(el, app); }); }
  function moveGuides() { var slot = document.getElementById("otc-guide-slot"); if (!slot) return; ["guide", "oq"].forEach(function (id) { var el = document.getElementById(id); if (el) slot.appendChild(el); }); }
  function placeTabs() {
    parkGuides();
    var slot = document.getElementById("mkt-top"); if (!slot) return "";
    slot.innerHTML = marketTabs();
    var tk = document.getElementById("hn-tick"); if (tk) slot.insertBefore(tk, slot.firstChild); // 荣耀榜播报条也放最顶上
    return "";
  }
  function marketTabs() {
    var BADGE = { ailgns: "🔥 热", lgns: "🔥 热", nft: "抢" }; // 成交量最大的两个挂「热」，NFT 卡牌挂「抢」
    var tab = function (k) { var m = MARKETS[k]; return '<a href="#/otc' + (k === "ailgns" ? "" : "/" + k) + '"' + (k === MK ? ' class="on"' : "") + ">" + (BADGE[k] ? '<i class="mkt-hot">' + BADGE[k] + "</i>" : "") + "<b>" + m.sym + "</b><small>" + m.chainName + " 链</small></a>"; };
    var main = MKEYS.slice(0, MK_MAIN), rest = MKEYS.slice(MK_MAIN), restOn = rest.indexOf(MK) >= 0;
    return '<nav class="mkt-tabs" aria-label="选择交易币种">' + main.map(tab).join("") + "</nav>" +
      (rest.length ? '<details class="mkt-more"' + (restOn ? " open" : "") + '><summary>更多币种（' + rest.map(function (k) { return MARKETS[k].sym + " · " + MARKETS[k].chainName; }).join("、") + "）</summary>" +
        '<nav class="mkt-tabs mkt-tabs-more">' + rest.map(tab).join("") + "</nav></details>" : "");
  }

  var BOOK_SHOW = 5; // 挂单太多时每个列表先只显示价格最好的几张，点「展开」看全部（挂单表单就不会被挤到很下面）
  var openBook = {}; // 用户点开了哪个列表（自动刷新后保持展开）
  var freshNext = false; // 自己刚挂单 / 成交 / 撤单：下次读订单簿跳过缓存
  // ---------- 全站累计成交（给客户信心）：/api/totals，读一次缓存 5 分钟 ----------
  var totals = null, totalsAt = 0;
  function loadTotals() {
    var owner = account === FEE_RECIPIENT; // 站长自己的收款钱包连上时才取累计数字
    if (totals && Date.now() - totalsAt < 300000 && (!owner || totals.fillDai !== undefined)) return Promise.resolve(totals);
    return fetch("/api/totals" + (owner ? "?all=1" : "")).then(function (r) { return r.json(); }).then(function (t) { totals = t; totalsAt = Date.now(); return t; }).catch(function () { return totals; });
  }
  // 公开只显示今日成交 + 0 出错（站长要求，不想让人眼红）；站长收款钱包连上时，下面多一行只有自己看得到的累计数字
  function totalsHtml(t) {
    if (!t || !t.today) return "";
    return '<div class="tot"><div class="tot-i"><span class="tot-k">今日成交</span><b class="num">' + A.fmt(t.today.fillDai, 0) + '</b><span class="tot-u">DAI</span></div>' +
      '<div class="tot-i"><span class="tot-k">今日笔数</span><b class="num">' + A.fmt(t.today.fills) + '</b><span class="tot-u">笔</span></div>' +
      '<div class="tot-i"><span class="tot-k">运行至今</span><b class="num">0</b><span class="tot-u">出错 · 0 纠纷</span></div>' +
      '<span class="tot-n">链上可查</span></div>' +
      (t.fillDai !== undefined ? '<p class="note tot-own">🔒 仅你可见（站长钱包）：累计成交 <b>' + A.fmt(t.fillDai, 0) + " DAI · " + A.fmt(t.fills) + " 笔</b>" + (t.lendDai ? "；借贷累计借出 <b>" + A.fmt(t.lendDai, 0) + " DAI · " + A.fmt(t.loans) + " 笔</b>" : "") + "</p>" : "");
  }
  function fillTotals() { loadTotals().then(function (t) { var el = document.getElementById("otc-tot"); if (el) el.innerHTML = totalsHtml(t); }); }
  A.fillTotals = fillTotals;

  // ---------- DeBox 通知绑定卡片（OTC、卡牌、借贷页共用；文案用 t 参数区分） ----------
  // DeBox 通知：放在「发布挂单」按钮上方，挂单时顺手绑定；之后成交 / 撤单 / 到期退回都会私信通知
  var dbx = null; // { ready, bot, bound }
  function dbxLink() { return "https://m.debox.pro/card?id=" + encodeURIComponent(dbx.bot.uid); } // 机器人名片页：打开后点「关注」/「发消息」
  function copyTo(text, btn) {
    function ok() { btn.textContent = "已复制 ✓"; }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, fallback);
    fallback();
    function fallback() { // 部分钱包浏览器不支持剪贴板接口
      var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { btn.textContent = text; }
      ta.remove();
    }
  }
  function bindCopies(root) {
    root.querySelectorAll("[data-dbx-copy]").forEach(function (b) { b.onclick = function () { copyTo(b.getAttribute("data-dbx-copy"), b); }; });
    root.querySelectorAll("[data-dbx-link]").forEach(function (b) { b.onclick = showLink; });
  }
  // 弹出机器人二维码：客户长按保存（或截图），到 DeBox「扫一扫」从相册选图，直接打开机器人关注
  var QR_LIB = "vendor/qrcode-1.4.4.min.js?v=1"; // 放在本站：国内访问外站 CDN 不稳定（和 cdnjs 上 1.4.4 版逐字节相同）
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return new Promise(function (ok, fail) {
      var sc = document.createElement("script"); sc.src = QR_LIB;
      sc.onload = function () { ok(window.qrcode); }; sc.onerror = fail;
      document.head.appendChild(sc);
    });
  }
  // 二维码画成一张带白边和说明文字的图片，方便长按保存到相册
  function qrImage(text, caption) {
    return loadQr().then(function (qrcode) {
      var q = qrcode(0, "M"); q.addData(text); q.make();
      var n = q.getModuleCount(), cell = 8, pad = 32, size = n * cell + pad * 2, c = document.createElement("canvas");
      c.width = size; c.height = size + 56;
      var g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#191839";
      for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(pad + k * cell, pad + r * cell, cell, cell);
      g.font = "700 22px -apple-system, PingFang SC, Microsoft YaHei, sans-serif"; g.textAlign = "center"; g.fillStyle = "#7027d9";
      g.fillText(caption, size / 2, size + 26);
      return c.toDataURL("image/png");
    });
  }
  function showLink() {
    var link = dbxLink(), name = dbx.bot.name || "机器人", box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = '<div class="modal-box"><div class="card-head"><h2>🔔 扫码关注「' + A.esc(name) + '」</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
      '<div class="dbx-qr" id="dbx-qr"><div class="loading">正在生成二维码…</div></div>' +
      '<ol class="steps"><li><b>长按二维码保存到相册</b>（或截图）</li>' +
      "<li>打开 <b>DeBox App</b> →「扫一扫」→ 从<b>相册</b>选这张图</li>" +
      "<li>进入机器人页面，点<b>关注</b></li>" +
      "<li>回到这里，复制钱包地址发给机器人，收到「✅ 已绑定」就完成了</li></ol>" +
      '<details class="dbx-alt"><summary>扫码不方便？复制链接</summary><div class="dbx-link mono">' + link + '</div><button class="ghost" id="dbx-link-copy" style="padding:8px 14px;margin-top:8px">复制链接</button><p class="note">把链接粘贴发到 DeBox 任意聊天里点开，也能进入机器人页面。</p></details></div>';
    document.body.appendChild(box);
    box.addEventListener("click", function (e) { if (e.target === box || e.target.closest("[data-close]")) box.remove(); });
    var btn = document.getElementById("dbx-link-copy");
    btn.onclick = function () { copyTo(link, btn); };
    qrImage(link, "DeBox 扫码关注 " + name).then(function (url) {
      var el = document.getElementById("dbx-qr");
      if (el) el.innerHTML = '<img src="' + url + '" alt="机器人二维码">';
    }, function () {
      var el = document.getElementById("dbx-qr");
      if (el) el.innerHTML = '<p class="note">二维码加载失败，请用下面「复制链接」。</p>';
      box.querySelector(".dbx-alt").open = true;
    });
  }
  // 客户大多在钱包的 DApp 浏览器里，那里跳不到 DeBox App：所以给出机器人名字 / ID 让他复制，到 DeBox 里搜
  var DBX_TXT = { title: "挂单成交 / 退回，DeBox 私信秒通知", on: "这个钱包的挂单成交、撤单、到期退回会私信到你的 DeBox" };
  function dbxHtml(t) {
    t = t || DBX_TXT;
    if (dbx.bound) return '<div class="dbx-bar dbx-on"><span class="dbx-bell">🔔</span><div><b>已开启 DeBox 通知</b><small>' + A.esc(t.on) + '</small></div></div>';
    return '<div class="dbx-bar"><span class="dbx-bell">🔔</span><div class="dbx-txt"><b>' + A.esc(t.title) + '</b>' +
      '<ol class="dbx-steps"><li><button type="button" data-dbx-link>显示机器人二维码</button>，长按保存到相册</li>' +
      "<li>打开 <b>DeBox</b>「扫一扫」→ 从相册选这张图 → 关注「" + A.esc(dbx.bot.name || "机器人") + "」</li>" +
      "<li>把你的钱包地址发给机器人" + (account ? '：<span class="mono">' + A.short(account) + '</span> <button type="button" class="ghost" data-dbx-copy="' + account + '">复制地址</button>' : "（连接钱包后这里显示）") + "，收到「✅ 已绑定」就好了</li></ol></div></div>";
  }
  function deboxCard(id, t) {
    fetch("/api/debox-bot" + (account ? "?addr=" + account : "")).then(function (r) { return r.json(); }).then(function (d) {
      dbx = d;
      var el = document.getElementById("dbx-slot");
      if (!el || !A.isCurrent(id) || !d.ready) return; // 机器人还没配置好时不显示
      el.innerHTML = dbxHtml(t);
      bindCopies(el);
    }).catch(function () { /* 通知功能不可用时不显示 */ });
  }
  // 挂单成功后：还没绑定的，弹窗提醒顺手开启通知
  var errTip = A.errTip;
  // 成交 / 挂单成功的结果弹窗：一直停留到客户点关闭，底下放「查看交易记录」
  function doneModal(title, html, extra) {
    var box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = '<div class="modal-box"><div class="card-head"><h2>' + title + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' + html +
      (extra || "") + '<a class="gm-big" style="text-align:center;text-decoration:none" href="#/scan/' + account + '/otc" data-close>📋 查我的订单</a><p class="note" style="text-align:center">以后在页面上方「📋 查我的订单」填钱包地址点「查询」就能看</p></div>';
    document.body.appendChild(box);
    box.addEventListener("click", function (e) { if (e.target === box || e.target.closest("[data-close]")) box.remove(); });
    return box;
  }
  // 客户反馈挂完找不到自己的单：成功弹窗里放一个大按钮，点了直接跳到「我的挂单」
  function dbxAfterCreate() {
    if (A.just) A.just.set("otc", MK || "");
    var box = document.createElement("div");
    box.className = "modal";
    // 站长 2026-11-08：下单后第一时间引导客户去「查我的订单」（和页面上方查订单条查出来的是同一页）
    var mine = (account ? '<a class="gm-big" href="#/scan/' + account + '/otc" data-close>📋 查我的订单</a>' : "") +
      '<button type="button" class="gm-big alt" data-seemine>看页面上的「我的挂单」</button><p class="note" style="text-align:center">以后在页面上方「📋 查我的订单」填钱包地址点「查询」，随时能看这张单的状态</p>';
    if (!dbx || !dbx.ready || dbx.bound || !account) {
      box.innerHTML = '<div class="modal-box"><div class="card-head"><h2>✅ 挂单成功！</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' + mine + "</div>";
    } else box.innerHTML = '<div class="modal-box"><div class="card-head"><h2>✅ 挂单成功！</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' + mine +
      '<p><b>开启 DeBox 通知</b>，有人成交、到期退回，第一时间私信告诉你，不用一直盯着网页。</p>' +
      '<ol class="steps"><li><button data-dbx-link>显示机器人二维码</button>，长按保存到相册</li>' +
      '<li>打开 <b>DeBox</b>「扫一扫」→ 从相册选这张图 → 关注「' + A.esc(dbx.bot.name || "机器人") + '」</li>' +
      '<li>把钱包地址发给机器人：<div class="copy"><span class="mono">' + account + '</span><button class="ghost" data-dbx-copy="' + account + '">复制</button></div>收到「✅ 已绑定」就好了</li></ol></div>';
    document.body.appendChild(box);
    box.addEventListener("click", function (e) {
      if (e.target.closest("[data-seemine]")) { box.remove(); var g = A.app.querySelector("[data-gomine]"); if (g) g.click(); return; }
      if (e.target === box || e.target.closest("[data-close]")) box.remove();
    });
    bindCopies(box);
    return true;
  }


  var pendingJump = false;
  function renderOtc(id, sub) {
    var app = A.app;
    if (sub === "deploy") return renderDeploy(id);
    if (sub === "split") return renderSplit(id);
    if (M.nft) return A.nft.render(id, sub); // 卡牌市场：nft.js 负责
    if (!OTC) {
      app.innerHTML = placeTabs() + '<section class="card" style="text-align:center;padding:36px 18px"><h2>' + SYM + "（" + M.chainName + " 链）OTC 即将上线</h2>" +
        '<p class="muted" style="margin:8px 0 0">托管合约部署完成后开放挂单和交易。</p></section>';
      return;
    }
    // 有上次存下的订单簿就先画出来（秒开），拿到最新的再换；用户已经在填表或开着吃单弹窗时不打断
    var snap = savedBook(), shown = null, fresh = freshNext;
    freshNext = false;
    if (snap) { draw(id, snap.orders, snap.mkt); shown = snap.raw; }
    else app.innerHTML = placeTabs() + '<div class="loading">正在读取订单…</div>';
    var acct0 = account;
    Promise.all([loadBook(fresh), silentAccount()]).then(function (r) {
      if (!A.isCurrent(id)) return;
      if (pendingJump) { pendingJump = false; setTimeout(function () { var g = app.querySelector("[data-gomine]"); if (g) g.click(); }, 80); }
      var b = r[0];
      if (shown !== null && b.raw === shown && account === acct0) return; // 没变化
      if (shown !== null && busy()) return;
      draw(id, b.orders, b.mkt);
    }, function () {
      if (A.isCurrent(id) && shown === null) app.innerHTML = placeTabs() + '<div class="card err">订单读取失败，请稍后刷新。</div>';
    });
    function busy() {
      var m = document.getElementById("otc-modal");
      if (m && !m.hidden) return true;
      if (sweeping) return true;
      return Array.prototype.some.call(app.querySelectorAll("input"), function (i) { return i === document.activeElement || (i.value && i.type !== "hidden" && i.type !== "radio" && i.type !== "checkbox" && i.type !== "range"); });
    }

    function draw(id, orders, mkt) {
      var now = Date.now() / 1000;
      var live = orders.filter(function (o) { return o.open && o.expiry > now && o.giveLeft > 0n && !isDust(o); });
      var sells = live.filter(function (o) { return o.sellAilgns; }).sort(function (a, b) { return priceOf(a) - priceOf(b); });
      var buys = live.filter(function (o) { return !o.sellAilgns; }).sort(function (a, b) { return priceOf(b) - priceOf(a); });
      var mine = account ? orders.filter(function (o) { return o.maker === account; }).reverse().slice(0, 30) : [];

      function row(o, i) {
        var p = priceOf(o), ail = o.sellAilgns ? o.giveLeft : (o.giveLeft * o.wantTotal) / o.giveTotal; // 剩余的挂单币数量
        var diff = mkt ? (p / mkt - 1) * 100 : null;
        // 操作按钮放在最前面：买入绿色、卖出红色，自己的单显示撤单
        var act = o.maker === account
          ? '<button class="ghost act-btn" data-cancel="' + o.id + '">撤单</button>'
          : '<button class="act-btn ' + (o.sellAilgns ? "btn-buy" : "btn-sell") + '" data-fill="' + o.id + '">' + (o.sellAilgns ? "买入" : "卖出") + "</button>";
        return '<tr' + (i >= BOOK_SHOW ? ' class="bk-x"' : "") + ' style="--w:' + (o._w || 0) + '%"><td class="act">' + act + '</td><td data-l="单价 DAI" class="price"><b>' + A.fmt(p, PD) + '</b></td><td data-l="剩余 ' + SYM + '">' + tShow(ail, TD === 18 ? 4 : 2) + '</td><td data-l="总额 DAI">' + A.fmt(tNum(ail) * p, 2) + "</td>" +
          '<td data-l="对比市价" class="' + (diff === null ? "" : diff >= 0 ? "up" : "down") + '">' + (diff === null ? "—" : (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%") + "</td>" +
          '<td data-l="剩余时间">' + left(o.expiry - now) + '</td><td data-l="挂单人" class="l mono">' + (o.maker === account ? '<b style="color:var(--gold)">我的</b>' : A.nameTag(o.maker)) + "</td></tr>";
      }
      function book(key, title, list, hint) {
        var bk = MK + key, open = openBook[bk], more = list.length - BOOK_SHOW;
        // 深度条：每一行背景按「到这一档为止累计多少 DAI」铺色，一眼看出哪边厚；配合扫光动画有「扫单」的感觉
        var daiOf = function (o) { return o.sellAilgns ? tNum(o.giveLeft) * priceOf(o) : num(o.giveLeft); }; // 这一档还剩多少 DAI 的量
        var cum = 0, tot = list.reduce(function (sum, o) { return sum + daiOf(o); }, 0) || 1;
        list.forEach(function (o) { cum += daiOf(o); o._w = Math.min(100, cum / tot * 100).toFixed(1); });
        return '<section class="card' + (open ? " bk-open" : "") + '" id="book-' + key + '"><div class="card-head"><h2>' + title + ' <small class="muted book-n">' + list.length + ' 张</small></h2><span class="muted">' + hint + "</span></div>" +
          (list.length ? '<div class="tbl-wrap bk-sweep"><table class="cards book ' + key + '"><thead><tr><th class="l">操作</th><th>单价 DAI</th><th>剩余 ' + SYM + '</th><th>总额 DAI</th><th>对比市价</th><th>剩余时间</th><th class="l">挂单人</th></tr></thead><tbody>' +
            list.map(row).join("") + "</tbody></table></div>" +
            (more > 0 ? '<button type="button" class="ghost book-more" data-book="' + bk + '">' + (open ? "收起 ▴" : "展开其余 " + more + " 张 ▾") + "</button>" : "") : '<div class="empty">暂无挂单</div>') + "</section>";
      }

      // 顶部小按钮：直接跳到挂单表单（订单多时客户找不到挂单的地方）
      var acts = '<div class="otc-acts"><button type="button" class="oa-sell" data-goform="sell">＋ 我要挂单卖 ' + SYM + '</button><button type="button" class="oa-buy" data-goform="buy">＋ 我要挂单买 ' + SYM + "</button>" +
        '<button type="button" data-gomine>📋 我的挂单' + (account && mine.length ? '<span class="gm-n">' + mine.length + "</span>" : "") + "</button></div>"; // 没连钱包也显示，点了先连钱包再跳过去
      // 打开就是交易：最上面只留一条「交易就送会员」+ 连钱包，紧接着就是挂单簿和挂单表单；介绍、DEX 对比这些营销内容在「营销广告」栏目
      var html = placeTabs() + acts + '<div class="otc-top"><span class="hp-tag">🎁 交易就送会员</span><button type="button" class="ot-sw" data-gosweep>💰 土豪一键扫单</button>' + // 站长 2026-11-08：顶部只留三个按钮，送会员的说明文字去掉（规则在会员页）
        (account ? '<span class="ot-w mono">' + A.short(account) + "</span>" : '<button class="ot-c" id="otc-top-c">' + (A.wallets && !window.ethereum && /Android|iPhone|iPad/i.test(navigator.userAgent) ? "在钱包 App 里打开" : "连接钱包") + "</button>") + "</div>";
      html += '<div class="saved-bar" id="saved-bar" hidden></div>';
      html += book("buys", "卖出 " + SYM, buys, "卖成 DAI · 价格从高到低") + book("sells", "买入 " + SYM, sells, "用 DAI 买 · 价格从低到高"); // 卖出放上面：鼓励大家卖
      html += '<div id="otc-guide-slot"></div>'; // 站长 2026-11-08：客户进来先看币种和挂单簿，担保交易引导卡 + 查我的订单 放在挂单簿下面
      fetch("/api/saved" + (account ? "?a=" + account : "")).then(function (r) { return r.json(); }).then(function (j) {
        var el = document.getElementById("saved-bar"); if (!el || !j.all || !(j.all.dai > 0)) return;
        el.hidden = false; el.innerHTML = '<span>💚 本站客户累计比 DEX <b>多赚 ' + A.fmt(j.all.dai, 0) + ' DAI</b>（' + j.all.n + ' 笔）</span>' + (j.me && j.me.dai > 0 ? '<span class="saved-me">你多赚 <b>' + A.fmt(j.me.dai, 2) + ' DAI</b></span>' : '<span class="muted">卖币先来这里，每一单都比 DEX 划算</span>');
      }).catch(function () {});
      setTimeout(function () { if (A.credFill) A.credFill(app); }, 0); // 🏅 挂单人后面加信誉芯片
      html += sweepHtml();
      html += '<div id="otc-tot">' + totalsHtml(totals) + "</div>"; // 全站累计放在挂单下面，上面留给买卖
      html += '<p class="note" style="margin:-6px 0 14px">成交后想核对记录？<a href="#/scan' + (account ? "/" + account : "") + '">成交查询 →</a> 输入任意地址就能看它在本站的全部成交。</p>';
      html += createForm();
      if (account) html += myOrders(mine, now, mkt);
      html += '<div class="kpis kpis-2">' +
        '<div class="kpi"><div class="k">托管合约</div><div class="v" style="font-size:16px"><a class="mono" target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + OTC + '">' + A.short(OTC) + ' ↗</a></div><div class="d"><a target="_blank" rel="noopener" href="' + SOURCE + '">开源源码 ↗</a> · <a target="_blank" rel="noopener" href="' + VERIFY + '">编译参数与核对 ↗</a></div></div>' +
        '<div class="kpi" id="otc-wallet"></div></div>';
      html += '<p class="note">🎁 成交后到「会员」页填这个钱包地址点「查询」，会员就能用。<a href="#/promo">为什么在这里交易更划算 →</a></p>';
      html += '<p class="note">成交手续费 1%，由吃单方承担（从收到的币里扣）；挂单、撤单、过期退回都不收费。' + (M.gas === "POL" ? "Polygon 链的 Gas 用 POL 支付，钱包里要留一点 POL。" : "") + '智能合约未经第三方审计，请先小额试用。本站为 AWAKE HELIX 官方认证的 AiLGNS OTC 服务站。</p>';
      html += '<div class="modal" id="otc-modal" hidden></div>';
      A.app.innerHTML = html;
      moveGuides();
      A.fillNames(A.app); // 挂单人有 .ailgns / .lgns 主名字的，显示名字
      bind(id, orders, mkt);
      bindSweep(sells, buys, mkt, function () { if (A.isCurrent(id)) { freshNext = true; renderOtc(id); } });
      walletCard();
      var tc = document.getElementById("otc-top-c");
      if (tc) tc.onclick = function () { var c = document.getElementById("otc-connect"); if (c) c.click(); };
      deboxCard(id);
      fillTotals();
      app.querySelectorAll(".book-more").forEach(function (b) {
        b.onclick = function () {
          // 只切换显示，不重画页面（免得清掉挂单表单里填了一半的内容）
          var k = b.getAttribute("data-book"), sec = b.closest("section"), n = sec.querySelectorAll("tr.bk-x").length;
          openBook[k] = !openBook[k];
          sec.classList.toggle("bk-open", openBook[k]);
          b.textContent = openBook[k] ? "收起 ▴" : "展开其余 " + n + " 张 ▾";
          if (!openBook[k]) sec.scrollIntoView({ block: "start" }); // 收起后回到这个列表开头
        };
      });
      app.querySelectorAll("[data-goform]").forEach(function (b) {
        b.onclick = function () {
          var sd = b.getAttribute("data-goform"), t = document.querySelector('#otc-side [data-side="' + sd + '"]');
          if (t) t.click();
          var f = document.getElementById("otc-form");
          if (!f) return;
          f.scrollIntoView({ behavior: "smooth", block: "start" });
          f.classList.remove("flash", "flash-sell", "flash-buy");
          void f.offsetWidth; // 重新触发闪框动画
          f.classList.add("flash", "flash-" + sd);
        };
      });
      var gm = app.querySelector("[data-gomine]");
      // 跳到某一块：减去顶部固定导航栏的高度，不然手机上标题和买卖切换会被导航栏挡住
      function jump(elId) { var x = document.getElementById(elId), top = document.querySelector(".top"); if (x) window.scrollTo({ top: x.getBoundingClientRect().top + window.pageYOffset - (top ? top.offsetHeight : 0) - 8, behavior: "smooth" }); }
      if (gm) gm.onclick = function () {
        if (account) return jump("otc-mine");
        connect().then(function () { pendingJump = true; renderOtc(id); }, function (e) { errTip(niceError(e)); }); // 没连钱包：先连，最新订单画完再跳过去
      };
      var gs = app.querySelector("[data-gosweep]");
      if (gs) gs.onclick = function () { jump("otc-sweep"); };
    }

    // 我的钱包：地址 + AiLGNS / DAI 余额；连接后随时刷新
    function walletCard() {
      var el = document.getElementById("otc-wallet");
      if (!el) return;
      if (!account) {
        var jump = !A.wallets.list().length && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); // 手机上没有钱包（桌面图标、普通浏览器）：直接跳到钱包 App 里打开
        el.innerHTML = '<div class="k">我的钱包</div><div class="v" style="font-size:16px"><button id="otc-connect" style="padding:8px 16px">' + (jump ? "在钱包 App 里打开" : "连接钱包") + '</button></div><div class="d">' + (jump ? "挂单、买卖要在钱包 App 里操作，点一下自动跳过去" : "连接后显示 " + SYM + " 和 DAI 余额") + "</div>";
        document.getElementById("otc-connect").onclick = function () {
          connect().then(function () { renderOtc(id); }, function (e) { el.querySelector(".d").textContent = niceError(e); errTip(niceError(e)); });
        };
        return;
      }
      el.innerHTML = '<div class="k">' + A.esc(A.wallets.name() || "我的钱包") + ' <span class="mono">' + A.short(account) + '</span> · <a href="#" id="otc-switch">换钱包</a></div><div class="bal"><div><b id="bal-ail">…</b> ' + SYM + '</div><div><b id="bal-dai">…</b> DAI</div>' + (M.gas === "POL" ? '<div><b id="bal-gas">…</b> POL</div>' : "") + "</div>" +
        '<div class="d">' + M.chainName + ' 链 · <a href="#" id="otc-watch">把 ' + SYM + " 添加到钱包</a></div>" + '<div id="otc-vol"></div>';
      // 累计成交进度：离 1 万 DAI 高级 VIP 还差多少
      if (A.volBox) fetch("/api/member?addr=" + account).then(function (r) { return r.json(); }).then(function (srv) { var v = document.getElementById("otc-vol"); if (v) v.innerHTML = A.volBox(srv); }).catch(function () {});
      Promise.all([balance(AILGNS, account), balance(DAI, account), M.gas === "POL" ? gasBalance(account) : null]).then(function (b) {
        var a = document.getElementById("bal-ail"), d = document.getElementById("bal-dai"), g = document.getElementById("bal-gas");
        if (a) a.textContent = tShow(b[0]);
        if (d) d.textContent = show(b[1], 2);
        if (g) g.textContent = show(b[2], 3);
      });
      document.getElementById("otc-switch").onclick = function (e) {
        e.preventDefault();
        A.wallets.forget();
        account = null;
        connect().then(function () { renderOtc(id); }, function (err) { renderOtc(id); errTip(niceError(err)); });
      };
      document.getElementById("otc-watch").onclick = function (e) {
        e.preventDefault();
        var link = this;
        Promise.resolve().then(function () { return W.get().request({ method: "wallet_watchAsset", params: { type: "ERC20", options: { address: AILGNS, symbol: SYM, decimals: TD } } }); })
          .then(function () { link.textContent = "已添加 ✓"; }, function () { link.textContent = "钱包不支持自动添加，请手动添加合约 " + A.short(AILGNS); });
      };
    }

    function createForm() {
      return '<section class="card" id="otc-form"><div class="card-head"><h2>发布挂单</h2><span class="muted">币先存进托管合约，成交前随时可撤</span></div>' +
        '<div class="seg" id="otc-side"><button data-side="sell" class="on">我要挂单卖 ' + SYM + '</button><button data-side="buy">我要挂单买 ' + SYM + "</button></div>" +
        '<div class="form-grid"><label>数量（' + SYM + '）<input id="otc-qty" inputmode="decimal" placeholder="例如 ' + M.eg[0] + '"></label>' +
        '<label>单价（DAI / 枚）<input id="otc-price" inputmode="decimal" placeholder="例如 ' + M.eg[1] + '"></label>' +
        "</div>" + '<div class="qty-pick" id="otc-pick"></div>' + '<div class="guide" id="otc-guide"></div>' +
        '<div class="dur" id="otc-durbox"><input type="hidden" id="otc-dur" value="' + DUR_DEFAULT + '"></div>' +
        '<p class="note" id="otc-sum">填好数量和单价后显示总额</p><div id="otc-match"></div><div id="dbx-slot"></div><button id="otc-create" style="padding:12px 22px">发布挂单</button><p class="note" id="otc-st"></p></section>';
    }

    function myOrders(list, now, mkt) {
      if (!list.length) return '<section class="card" id="otc-mine"><div class="card-head"><h2>我的挂单</h2></div><div class="empty">这个市场（' + SYM + '）还没有挂单</div><p class="note">挂在别的币种市场的单这里不显示：上面切换市场，或 <a href="#/scan/' + account + '">在账本里看我所有市场的挂单 →</a></p></section>';
      return '<section class="card" id="otc-mine"><div class="card-head"><h2>我的挂单</h2></div><div class="tbl-wrap"><table class="cards"><thead><tr><th>#</th><th class="l">方向</th><th>单价</th><th>剩余</th><th class="l">状态</th><th></th></tr></thead><tbody>' +
        list.map(function (o) {
          var dust = o.open && isDust(o);
          var status = !o.open ? "已结束" : dust ? "剩余不足 1 DAI，已自动下架，点「取回」退回钱包" : o.expiry <= now ? "已过期，等待退回" : "挂单中 · 还剩 " + left(o.expiry - now) + '<br><span class="muted">' + A.timeBJ(o.expiry * 1000) + " 到期（北京时间）</span>";
          var r = mkt && o.open && o.expiry > now ? priceOf(o) / mkt : null, side = o.sellAilgns ? "sell" : "buy";
          if (r && !dust && !M.flat && (side === "sell" ? r > RANGE.sell[1] : r < RANGE.buy[0])) status += '<br><span class="down">价格' + (side === "sell" ? "偏高" : "偏低") + "，很难成交，建议撤单按指导价 " + A.fmt(mkt * (RANGE[side][0] + RANGE[side][1]) / 2, PD) + " 重挂</span>";
          var remain = dust && isCrumb(o, o.giveLeft) ? "零头" : o.sellAilgns ? tShow(o.giveLeft) + " " + SYM : show(o.giveLeft, 2) + " DAI";
          return '<tr><td data-l="编号">#' + o.id + '</td><td data-l="方向" class="l">' + (o.sellAilgns ? "卖 " : "买 ") + SYM + '</td><td data-l="单价">' + A.fmt(priceOf(o), PD) + '</td><td data-l="剩余">' + remain + '</td><td data-l="状态" class="l">' + status + '</td><td class="act">' +
            (o.open ? '<button class="ghost" data-cancel="' + o.id + '" style="padding:6px 12px">' + (o.expiry <= now || dust ? "取回" : "撤单") + "</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<p class="note">价格变了想改价：点「撤单」（钱包确认一次，币马上退回钱包）→ 回到上面「发布挂单」按新价再挂一张。到期的单显示「取回」，点一下币就退回。没看到你的单？可能挂在别的币种市场：<a href="#/scan/' + account + '">在账本里看我所有市场的挂单 →</a></p></section>';
    }

    function bind(id, orders, mkt) {
      var st = document.getElementById("otc-st");
      function say(t, bad) {
        st.className = "note" + (bad ? " down" : "");
        st.textContent = t;
        if (bad) return errTip(t, st);
        if (st.scrollIntoView) st.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      function reload() { if (A.isCurrent(id)) { freshNext = true; renderOtc(id); } }
      var c = document.getElementById("otc-connect");
      if (c) c.onclick = function () { connect().then(reload, function (e) { say(niceError(e), true); }); };

      // 从「营销广告」点「我要卖 / 我要买」进来（#/otc/sell、#/otc/buy）：切到对应方向，滚到挂单表单
      var hp = location.hash.split("/"), go = MARKETS[hp[2]] ? hp[3] : hp[2]; // #/otc/sell 或 #/otc/plgns/sell
      if (go === "sell" || go === "buy") setTimeout(function () {
        var t = document.querySelector('#otc-side [data-side="' + go + '"]');
        if (t) t.click();
        var f = document.getElementById("otc-form");
        if (f) f.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);

      // 发布挂单
      var side = "sell";
      document.querySelectorAll("#otc-side button").forEach(function (b) {
        b.onclick = function () {
          side = b.getAttribute("data-side");
          document.querySelectorAll("#otc-side button").forEach(function (x) { x.classList.toggle("on", x === b); });
          guide();
          calc();
          pick();
        };
      });
      var qty = document.getElementById("otc-qty"), price = document.getElementById("otc-price"), sum = document.getElementById("otc-sum");
      if (mkt) price.placeholder = "市价约 " + mkt.toFixed(PD);
      // 指导价：默认自动填进单价；客户自己改过就不再覆盖
      var auto = true;
      function guide() {
        var el = document.getElementById("otc-guide");
        if (!mkt) { el.hidden = true; return; }
        var g = mkt * (RANGE[side][0] + RANGE[side][1]) / 2, lo = mkt * RANGE[side][0], hi = mkt * RANGE[side][1], dexSell = mkt * DEX_SELL, dexBuy = mkt * DEX_BUY;
        if (M.flat) { // DEX 不扣税的币：OTC 和 DEX 价差不到 1%，按市价挂就行；想快点成交就让一点
          g = mkt;
          el.innerHTML = '<div class="guide-head"><span class="guide-tag">指导价</span><b class="num">' + A.fmt(g, PD) + '</b><small>DAI / 枚 · 当前 DEX 市价</small><button type="button" class="ghost" id="otc-guse">用这个价</button></div>' +
            "<p>" + SYM + " 在 DEX 买卖都不扣税，场外价贴着市价挂就行；想快点成交，卖单可以比市价低一点、买单比市价高一点。成交手续费 1% 由吃单方承担。</p>";
          document.getElementById("otc-guse").onclick = function () { price.value = g.toFixed(PD); auto = true; calc(); pick(); };
          if (auto || !price.value) { price.value = g.toFixed(PD); auto = true; }
          return;
        }
        var gr = GUIDE && GUIDE[MK] && GUIDE[MK][side];
        if (gr) { // 有真实成交数据：直接用最近成交的中间价
          g = mkt * gr;
          var gn = GUIDE[MK].n[side], goff = (gr - 1) * 100;
          el.innerHTML = '<div class="guide-head"><span class="guide-tag">指导价</span><b class="num">' + A.fmt(g, PD) + '</b><small>DAI / 枚 · 比 DEX 市价' + (goff >= 0 ? "高 " : "低 ") + Math.abs(goff).toFixed(1) + '%</small><button type="button" class="ghost" id="otc-guse">用这个价</button></div>' +
            "<p>按本站最近 <b>" + gn + " 笔真实成交</b>的中间价算（每 5 分钟跟着新成交更新）：大家" + (side === "sell" ? "卖" : "买") + " " + SYM + " 一般成交在 DEX 市价的 <b>" + (gr * 100).toFixed(1) + "%</b> 左右。按这个价挂，最容易成交。</p>" +
            '<p class="muted">' + (side === "sell" ? "想卖得快，可以比指导价再低一点；挂得越高，等的时间越长。" : "想买得快，可以比指导价再高一点；挂得越低，等的时间越长。") + "成交手续费 1% 由吃单方承担。</p>";
          document.getElementById("otc-guse").onclick = function () { price.value = g.toFixed(PD); auto = true; calc(); pick(); };
          if (auto || !price.value) { price.value = g.toFixed(PD); auto = true; }
          return;
        }
        var off = (1 - g / mkt) * 100, sellGain = (side === "sell" ? g : g * TAKER) - dexSell, buyGain = dexBuy - (side === "sell" ? g / TAKER : g);
        el.innerHTML = '<div class="guide-head"><span class="guide-tag">指导价</span><b class="num">' + A.fmt(g, PD) + '</b><small>DAI / 枚 · 比市价' + (off >= 0 ? "低 " : "高 ") + Math.abs(off).toFixed(1) + '%</small><button type="button" class="ghost" id="otc-guse">用这个价</button></div>' +
          "<p>按这个价成交，两边都比去" + DX + " 划算：卖家比在" + DX + " 卖（每枚到手约 " + A.fmt(dexSell, PD) + "）多拿约 <b>" + A.fmt(sellGain, PD) + " DAI</b>；买家比去" + DX + " 买（每枚约 " + A.fmt(dexBuy, PD) + "）省约 <b>" + A.fmt(buyGain, PD) + " DAI</b>（都已算上吃单方 1% 手续费）。</p>" +
          '<p class="muted">合理区间 ' + A.fmt(lo, PD) + "–" + A.fmt(hi, PD) + "。" + (side === "sell" ? "高于 " + A.fmt(hi, PD) + " 买家直接去 DEX 买更划算，基本卖不掉；想快点卖可以往下调。" : "低于 " + A.fmt(lo, PD) + " 卖家去 DEX 卖更划算，基本买不到；想快点买可以往上调。") + "</p>" +
          (M.dexNote ? '<p class="muted">' + (M.liveTax && SELL_TAX !== null ? "Anubis 链 DEX 卖出 LGNS 的手续费是动态的，链上实测现在约扣 <b>" + (SELL_TAX * 100).toFixed(1) + "%</b>（每 5 分钟更新）。" : M.dexNote) + " LGNS 在 Anubis 链和 Polygon 链上各有一个市场，价格各自独立。</p>" : "");
        document.getElementById("otc-guse").onclick = function () { price.value = g.toFixed(PD); auto = true; calc(); pick(); };
        if (auto || !price.value) { price.value = g.toFixed(PD); auto = true; }
      }
      // 自动撮合：挂单前先看对面有没有价格更好的单，有就提示「一键先成交，剩下的再挂单」
      var now0 = Date.now() / 1000, live0 = orders.filter(function (o) { return o.open && o.expiry > now0 && o.giveLeft > 0n && !isDust(o) && o.maker !== account; });
      var mbox = document.getElementById("otc-match"), mp = null;
      function match() {
        var q = tWei(qty.value), pw = toWei(price.value), pr = Number(price.value), sell = side === "sell";
        mp = null;
        if (!q || !pw || !(pr > 0)) { mbox.innerHTML = ""; return; }
        var cross = live0.filter(function (o) { return sell ? !o.sellAilgns && priceOf(o) >= pr : o.sellAilgns && priceOf(o) <= pr; })
          .sort(function (a, b) { return sell ? priceOf(b) - priceOf(a) : priceOf(a) - priceOf(b); });
        var total = q * pw / TUNIT, p = cross.length ? (sell ? sweepPlanTok(cross, q) : buyPlan(cross, q)) : null;
        if (!p || !p.steps.length) { mbox.innerHTML = ""; return; }
        var restGive = sell ? q - p.tok : (q - p.tok) * pw / TUNIT, restWant = sell ? restGive * pw / TUNIT : q - p.tok;
        var restDai = sell ? restWant : restGive;
        if (restDai < MIN_DAI) { restGive = 0n; restWant = 0n; } // 剩的不到 1 DAI 就不挂了
        mp = { p: p, sell: sell, restGive: restGive, restWant: restWant };
        var fee = sell ? p.dai / 100n : p.tok / 100n, better = sell ? (p.avg / pr - 1) * 100 : (1 - p.avg / pr) * 100;
        mbox.innerHTML = '<div class="otc-match"><b class="om-t">⚡ 有更划算的单，现在就能成交</b>' +
          "<p>市场上有 <b>" + p.steps.length + " 张" + (sell ? "买单出价 ≥" : "卖单要价 ≤") + "</b> 你填的价，可以立刻" + (sell ? "卖出 <b>" + tShow(p.tok) + " " + SYM + "</b>，到手 <b>" + show(p.dai - fee, 2) + " DAI</b>" : "买到 <b>" + tShow(p.tok - fee) + " " + SYM + "</b>，付 <b>" + show(p.dai, 2) + " DAI</b>") +
          "（均价 " + A.fmt(p.avg, PD) + (better > 0.005 ? '，<span class="up">比你填的价' + (sell ? "高 " : "低 ") + better.toFixed(2) + "%</span>" : "") + "，已扣 1% 手续费）</p>" +
          (restGive ? "<p>剩下 <b>" + (sell ? tShow(restGive) + " " + SYM : show(restGive, 2) + " DAI") + "</b> 按你的价自动挂单，等别人来成交。</p>" : "<p>全部都能马上成交，不用挂单等。</p>") +
          '<button type="button" id="otc-mgo">⚡ 一键成交 ' + p.steps.length + " 张" + (restGive ? " + 剩余挂单" : "") + '</button><p class="note" id="otc-mst"></p></div>';
        document.getElementById("otc-mgo").onclick = matchGo;
      }
      function buyPlan(list, want) { // 买入：按想买的币数从最便宜的卖单吃起，最多吃到 want 个
        var steps = [], dai = 0n, tok = 0n;
        for (var i = 0; i < list.length && tok < want; i++) {
          var o = list[i], amount = o.giveLeft < want - tok ? o.giveLeft : want - tok, pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
          if (pay < MIN_DAI && amount < o.giveLeft) break; // 不到 1 DAI 的零头不吃，留给挂单
          steps.push({ o: o, amount: amount, pay: pay }); dai += pay; tok += amount;
        }
        return { steps: steps, dai: dai, tok: tok, avg: tok ? num(dai) / tNum(tok) : 0 };
      }
      function matchGo() {
        var m = mp, btn = document.getElementById("otc-mgo"), mst = document.getElementById("otc-mst");
        if (!m) return;
        function msay(t, bad) { mst.className = "note" + (bad ? " down" : ""); mst.textContent = t; if (bad) errTip(t, mst); }
        var token = m.sell ? AILGNS : DAI, name = m.sell ? SYM : "DAI", dur = Number((document.getElementById("otc-dur") || {}).value) || DUR_DEFAULT; // 扫单面板里没有有效期控件（剩余部分挂单用默认 30 天）
        var need = m.p.steps.reduce(function (t, x) { return t + x.pay; }, 0n) + m.restGive, done = 0;
        btn.disabled = true; sweeping = true;
        ready().then(function () {
          walletCard();
          return balance(token, account);
        }).then(function (b) {
          if (b < need) throw new Error("余额不足：需要 " + (m.sell ? tShow(need) : show(need, 2)) + " " + name + "，钱包里有 " + (m.sell ? tShow(b) : show(b, 2)));
          return M.gas === "POL" ? checkPol() : null;
        }).then(function () { return ensureAllowance(token, need, msay, name); }).then(function () {
          var i = 0;
          function next() {
            if (i >= m.p.steps.length) return;
            var s = m.p.steps[i++], tag = "成交第 " + i + " / " + m.p.steps.length + " 张（#" + s.o.id + "）";
            return read(OTC, SEL.getOrders + u256(s.o.id) + u256(1)).then(function (h) {
              var o = parseOrders(h, s.o.id)[0];
              if (!o || !o.open || o.giveLeft === 0n) return next(); // 被别人抢先吃了，跳过（这部分会留在钱包里）
              var amount = s.amount > o.giveLeft ? o.giveLeft : s.amount, pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
              return send(OTC, SEL.fill + u256(o.id) + u256(amount) + u256(pay), function (t) { msay(tag + "：" + t); }, "成交").then(function () { done++; return next(); });
            });
          }
          return next();
        }).then(function () {
          if (!m.restGive) return;
          return send(OTC, SEL.create + u256(m.sell ? 1 : 0) + u256(m.restGive) + u256(m.restWant) + u256(dur), function (t) { msay("剩余挂单：" + t); }, "发布挂单");
        }).then(function () {
          sweeping = false;
          msay("✅ 完成：成交 " + done + " 张" + (m.restGive ? "，剩余已挂单" : ""));
          setTimeout(reload, 1500);
        }, function (e) { sweeping = false; btn.disabled = false; msay((done ? "已成交 " + done + " 张，后面停下了：" : "") + niceError(e), true); });
      }
      function calc() {
        match();
        var q = tWei(qty.value), p = toWei(price.value);
        if (!q || !p) { sum.textContent = "填好数量后显示总额"; return null; }
        var total = (q * p) / TUNIT; // DAI
        var diff = mkt ? (num(p) / mkt - 1) * 100 : null;
        var r = mkt ? num(p) / mkt : null, verdict = "";
        if (r && M.flat) { // DEX 不扣税的币：只提醒比 DEX 还差的价格
          if (side === "sell" && r < DEX_SELL) verdict = "⚠️ 低于" + DX + " 卖出到手价（约 " + A.fmt(mkt * DEX_SELL, PD) + "），你会少拿 DAI";
          if (side === "buy" && r > DEX_BUY) verdict = "⚠️ 高于" + DX + " 买入价（约 " + A.fmt(mkt * DEX_BUY, PD) + "），你会多花 DAI";
        } else if (r) {
          if (side === "sell") verdict = r > RANGE.sell[1] ? "⚠️ 价格偏高：买家去" + DX + " 买更划算，很难成交，建议不高于 " + A.fmt(mkt * RANGE.sell[1], PD) : r < DEX_SELL ? "⚠️ 低于" + DX + " 卖出到手价（约 " + A.fmt(mkt * DEX_SELL, PD) + "），你会少拿 DAI" : "";
          else verdict = r < RANGE.buy[0] ? "⚠️ 价格偏低：卖家去" + DX + " 卖更划算，很难成交，建议不低于 " + A.fmt(mkt * RANGE.buy[0], PD) : r > DEX_BUY ? "⚠️ 高于" + DX + " 买入价（约 " + A.fmt(mkt * DEX_BUY, PD) + "），你会多花 DAI" : "";
        }
        sum.innerHTML = (side === "sell" ? "存入 <b>" + tShow(q) + " " + SYM + "</b>，全部成交后收到 <b>" + show(total, 2) + " DAI</b>" : "存入 <b>" + show(total, 2) + " DAI</b>，全部成交后收到 <b>" + tShow(q) + " " + SYM + "</b>") +
          (diff === null ? "" : '　<span class="' + (diff >= 0 ? "up" : "down") + '">比市价 ' + (diff >= 0 ? "高 " : "低 ") + Math.abs(diff).toFixed(2) + "%</span>") +
          (r ? "<br>" + (verdict ? '<span class="down">' + verdict + "</span>" : '<span class="up">✓ ' + (M.flat ? "价格贴近市价，容易成交" : "价格合理，比" + DX + " 划算，容易成交") + '</span>') : "");
        return { q: q, total: total };
      }
      qty.oninput = calc; price.oninput = function () { auto = false; calc(); pick(); };
      guide();
      if (!GUIDE) guideP.then(function () { if (document.getElementById("otc-guide") && document.body.contains(price)) { guide(); calc(); } }); // 成交价数据晚到一步：到了再刷新指导价
      // 可用余额 + 25% / 50% / 75% / 最大：卖单按 AiLGNS 余额，买单按 DAI 余额 ÷ 单价换成能买多少枚
      var bal = null;
      function maxQty() {
        if (!bal) return null;
        if (side === "sell") return bal.ail;
        var p = toWei(price.value);
        return p ? (bal.dai > GAS_RESERVE ? bal.dai - GAS_RESERVE : 0n) * TUNIT / p : null; // Anubis 留 0.1 DAI 付 Gas
      }
      function pick() {
        var el = document.getElementById("otc-pick");
        if (!el) return; // 余额晚到时客户已切走页面（#/names 等），元素不在了：不报错
        if (!account) { el.innerHTML = '<span class="muted">可用余额：</span><a href="#" id="otc-pick-c">连接钱包后显示</a>'; document.getElementById("otc-pick-c").onclick = function (e) { e.preventDefault(); var c = document.getElementById("otc-connect"); if (c) c.click(); }; return; }
        if (!bal) { el.innerHTML = '<span class="muted">可用余额读取中…</span>'; return; }
        var m = maxQty();
        el.innerHTML = '<div class="qp-bal"><span class="muted">可用</span><b>' + (side === "sell" ? tShow(bal.ail) + " " + SYM : show(bal.dai, 2) + " DAI") + "</b>" +
          (side === "buy" ? '<span class="muted">' + (m !== null ? "按这个单价最多买 " + tShow(m) + " 枚" : "先填单价，算能买多少枚") + "</span>" : "") + "</div>" +
          '<div class="qp-btns">' + [[25, "25%"], [50, "50%"], [75, "75%"], [100, "最大"]].map(function (x) { return '<button type="button" class="ghost" data-pct="' + x[0] + '"' + (m ? "" : " disabled") + ">" + x[1] + "</button>"; }).join("") + "</div>";
        el.querySelectorAll("[data-pct]").forEach(function (b) {
          b.onclick = function () {
            var mq = maxQty();
            if (!mq) return;
            qty.value = floorStr(mq * BigInt(b.getAttribute("data-pct")) / 100n, TD === 18 ? 6 : 4, TD);
            calc();
          };
        });
      }
      pick();
      if (account) Promise.all([balance(AILGNS, account), balance(DAI, account)]).then(function (b) { bal = { ail: b[0], dai: b[1] }; pick(); }, function () { bal = null; });
      // 有效期滑块
      var durIn = document.getElementById("otc-dur");
      durSlider(document.getElementById("otc-durbox"), { value: DUR_DEFAULT, onChange: function (sec) { durIn.value = sec ? String(sec) : ""; } });
      document.getElementById("otc-create").onclick = function () {
        var btn = this, v = calc();
        if (!v || v.total === 0n) { say("请填写数量和单价", true); return; }
        var sell = side === "sell", give = sell ? v.q : v.total, want = sell ? v.total : v.q, token = sell ? AILGNS : DAI;
        var dur = Number((document.getElementById("otc-dur") || {}).value) || DUR_DEFAULT;
        if (!dur) { say("有效期要在 10 分钟到 30 天之间", true); return; }
        btn.disabled = true;
        ready().then(function () {
          walletCard();
          return balance(token, account);
        }).then(function (b) {
          if (b < give) throw new Error("余额不足：需要 " + (sell ? tShow(give) : show(give, 2)) + " " + (sell ? SYM : "DAI") + "，钱包里有 " + (sell ? tShow(b) : show(b, 2)));
          return checkPol();
        }).then(function () {
          return ensureAllowance(token, give, say, sell ? SYM : "DAI");
        }).then(function () {
          return send(OTC, SEL.create + u256(sell ? 1 : 0) + u256(give) + u256(want) + u256(dur), say, "发布挂单");
        }).then(function () {
          say("挂单成功！");
          dbxAfterCreate();
          setTimeout(reload, 1200);
        }, function (e) { say(niceError(e), true); btn.disabled = false; });
      };

      // 撤单 / 取回
      // 进度就写在撤单按钮下面（以前写在页面最上面的挂单表单那里，页面会跳走，客户以为没反应）；撤单过程中不自动刷新页面，不然按钮和提示会被刷掉
      A.app.querySelectorAll("[data-cancel]").forEach(function (b) {
        b.onclick = function () {
          var note = b.parentElement.querySelector(".cx-st");
          if (!note) { note = document.createElement("p"); note.className = "note cx-st"; b.parentElement.appendChild(note); }
          function here(t, bad) { note.className = "note cx-st" + (bad ? " down" : ""); note.textContent = t; }
          b.disabled = true; sweeping = true;
          here("正在连接钱包…");
          ready().then(function () {
            return send(OTC, SEL.cancel + u256(b.getAttribute("data-cancel")), here, "撤单");
          }).then(function () { sweeping = false; here("✅ 已撤单，币已退回你的钱包"); setTimeout(reload, 1500); }, function (e) { sweeping = false; here(niceError(e), true); b.disabled = false; });
        };
      });

      // 吃单
      A.app.querySelectorAll("[data-fill]").forEach(function (b) {
        b.onclick = function () {
          var o = orders.filter(function (x) { return x.id === Number(b.getAttribute("data-fill")); })[0];
          openFill(o, reload, mkt);
        };
      });
    }

    // ---------- 土豪扫单：按价格从优到差一口气吃下挂单簿的一部分，滑块选扫多少（按 DAI 金额占全部挂单的百分比），实时算均价 ----------
    var SW_CAP = 9000; // 一键扫单最多扫全部挂单的 90%：别人同时在吃的单会让整笔扫单失败（客户反馈），留 10% 余量
    function sweepHtml() {
      return '<section class="card sweep" id="otc-sweep"><div class="card-head"><h2>💰 土豪扫单</h2><span class="muted">按价格从优到差，一次吃下多张单</span></div>' +
        '<div class="sw-side"><button type="button" data-sw="buy" class="on">扫卖单 · 买入 ' + SYM + '</button><button type="button" data-sw="sell">扫买单 · 卖出 ' + SYM + "</button></div>" +
        '<div class="sw-pct"><b id="sw-pv">90%</b><input type="range" id="sw-r" min="1" max="9000" value="9000" step="1" aria-label="扫单比例"></div>' +
        '<div class="sw-quick">' + [10, 20, 30, 50, 90].map(function (x) { return '<button type="button" data-swp="' + x * 100 + '">' + x + "%</button>"; }).join("") + '<button type="button" data-swp="max" class="sw-max">最大</button></div>' +
        '<div class="sw-out" id="sw-out"></div><div class="sw-ladder" id="sw-ladder"></div>' +
        '<button type="button" id="sw-go" class="sw-go">👉 点击确认付款</button><p class="note" id="sw-st"></p><div id="sw-rec"></div></section>';
    }
    // 按 DAI 金额从最优价开始吃，吃到 target（DAI，BigInt）为止；返回每张单吃多少 + 合计
    // 买入（扫卖单）：amount = 拿走的币，pay = 付的 DAI；卖出（扫买单）：amount = 拿走的 DAI，pay = 付的币
    function sweepPlan(list, target) {
      var steps = [], dai = 0n, tok = 0n;
      for (var i = 0; i < list.length && dai < target; i++) {
        var o = list[i], full = daiLeft(o, o.giveLeft), amount = o.giveLeft;
        if (dai + full > target) { // 最后一张只吃一部分
          var need = target - dai;
          amount = o.sellAilgns ? need * o.giveTotal / o.wantTotal : need;
          if (amount <= 0n) break;
          if (amount > o.giveLeft || isDustLeft(o, o.giveLeft - amount)) amount = o.giveLeft; // 剩的不到 1 DAI 就一起吃掉
        }
        var pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
        steps.push({ o: o, amount: amount, pay: pay });
        if (o.sellAilgns) { dai += pay; tok += amount; } else { dai += amount; tok += pay; }
      }
      return { steps: steps, dai: dai, tok: tok, avg: tok ? num(dai) / tNum(tok) : 0 };
    }
    // 扫买单（卖出）按手里的币算：最多付 budget 个币（BigInt），从出价最高的买单吃起
    function sweepPlanTok(list, budget) {
      var steps = [], dai = 0n, tok = 0n;
      for (var i = 0; i < list.length && tok < budget; i++) {
        var o = list[i], amount = o.giveLeft, pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
        if (tok + pay > budget) { // 最后一张只吃一部分：币不够整张
          amount = (budget - tok) * o.giveTotal / o.wantTotal;
          if (amount <= 0n || amount < MIN_DAI) break;
          pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
          if (tok + pay > budget) { amount -= 1n; pay = ceilDiv(amount * o.wantTotal, o.giveTotal); }
        }
        steps.push({ o: o, amount: amount, pay: pay });
        dai += amount; tok += pay;
      }
      return { steps: steps, dai: dai, tok: tok, avg: tok ? num(dai) / tNum(tok) : 0 };
    }
    function gasKeep(n) { return M.gas === "DAI" ? GAS_RESERVE + GAS_RESERVE / 10n * BigInt(n + 1) : 0n; } // Anubis 上 Gas 用 DAI 付：固定留 0.1，每张再留 0.01
    // 赚了多少：和同样数量在 DEX 买 / 卖比（已算 DEX 手续费、卖出税和本站 1% 手续费）。只在真的比 DEX 划算时显示，不划算就不显示（不能把亏的说成赚的）
    // buy=true：tok = 到手的币，dai = 付的 DAI；buy=false：tok = 卖出的币，dai = 到手的 DAI
    var lastPnl = null; // 最近一次报价算出来的「比 DEX 多赚」，成交后拿去记账 + 庆祝
    function pnlOf(buy, tok, dai, mkt) {
      if (!mkt || !tok || !dai) return null;
      var ref = buy && M.buyRef, dex = buy ? tNum(tok) * mkt * (ref || DEX_BUY) : tNum(tok) * mkt * DEX_SELL, mine = num(dai), d = buy ? dex - mine : mine - dex;
      return d > 0 && dex > 0 ? { d: d, dex: dex, pct: d / dex * 100, dai: buy ? mine : mine } : null;
    }
    // 成交后：记一笔「比 DEX 多赚」到后台（全站合计 + 个人累计），返回庆祝文案
    function savedRecord(tx, pnl) {
      if (!pnl || !account || !tx || typeof tx !== "string") return Promise.resolve(null);
      return fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: account, tx: tx, d: Math.round(pnl.d * 100) / 100, dai: Math.round(pnl.dai * 100) / 100 }) }).then(function (r) { return r.json(); }).catch(function () { return null; });
    }
    function winHtml(pnl, rec) {
      if (!pnl) return "";
      var me = rec && rec.me, all = rec && rec.all;
      return '<div class="win-big"><div class="win-t">🎉 这一单比去 DEX <b>多赚 +' + A.fmt(pnl.d, 2) + ' DAI</b><small>多 ' + pnl.pct.toFixed(1) + '%</small></div>' +
        (me ? '<div class="win-me">你在本站累计多赚 <b>' + A.fmt(me.dai, 2) + ' DAI</b>（' + me.n + ' 笔）</div>' : "") +
        (all ? '<div class="win-all muted">全站客户累计比 DEX 多赚 ' + A.fmt(all.dai, 0) + ' DAI</div>' : "") +
        '<div class="win-tip">以后卖币先来这里挂一单或吃一单，每一单都比 DEX 划算 💚</div></div>';
    }
    function pnlHtml(buy, tok, dai, mkt) {
      if (!mkt || !tok || !dai) return "";
      // AiLGNS 不能直接从底池买，只能场外收，买入按场外行情算：DEX 价 + 30% 溢价（站长定的标准，buyRef）
      var ref = buy && M.buyRef, dex = buy ? tNum(tok) * mkt * (ref || DEX_BUY) : tNum(tok) * mkt * DEX_SELL, mine = num(dai), d = buy ? dex - mine : mine - dex;
      if (!(d > 0) || !(dex > 0)) return "";
      var refTxt = ref ? "场外行情（DEX 价 + " + Math.round((ref - 1) * 100) + "% 溢价）" : "";
      return '<div class="sw-pnl win"><span>✅ 赚了</span><b>+' + A.fmt(d, 2) + " DAI</b><em>" + (buy ? (ref ? "比场外行情便宜 " : "比去 DEX 买便宜 ") : "比在 DEX 卖多拿 ") + (d / dex * 100).toFixed(1) + "%</em>" +
        "<small>同样" + (buy ? "买 " + tShow(tok) + " " + SYM + "，" + (ref ? "按" + refTxt + "要付约 " : "在 DEX 要付约 ") : "卖 " + tShow(tok) + " " + SYM + "，在 DEX 只能拿约 ") + A.fmt(dex, 2) + " DAI" + (ref ? "" : "（含 DEX 手续费" + (buy ? "" : "和卖出税") + "）") + "</small></div>";
    }
    function bindSweep(sells, buys, mkt, reload) {
      var box = document.getElementById("otc-sweep");
      if (!box) return;
      var side = sweepSide, r = document.getElementById("sw-r"), pv = document.getElementById("sw-pv"), out = document.getElementById("sw-out"), ladder = document.getElementById("sw-ladder"), go = document.getElementById("sw-go"), st = document.getElementById("sw-st");
      function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; if (bad) errTip(t, st); }
      function list() { return (side === "buy" ? sells : buys).filter(function (o) { return o.maker !== account; }); } // 自己的单不能吃
      function total(l) { return l.reduce(function (t, o) { return t + daiLeft(o, o.giveLeft); }, 0n); }
      // 进度条 = 占全部挂单的比例（万分比，最细 0.01%）。连上钱包后，余额最多能扫到哪里就只能拖到哪里（右边那段灰掉）
      var bal = { buy: null, sell: null };
      function full(l) { // 余额全用上能扫成什么样；没连钱包返回 null
        if (bal[side] === null) return null;
        if (side === "sell") return sweepPlanTok(l, bal.sell); // 卖出：手里的币全卖
        var avail = bal.buy - gasKeep(l.length); // 买入：DAI 全用上，留一点付 Gas
        return sweepPlan(l, avail > 0n ? avail : 0n);
      }
      function maxBp(l) {
        var t = total(l), f = full(l);
        if (!f || !t) return SW_CAP;
        return f.dai >= t ? SW_CAP : Math.min(SW_CAP, Number(f.dai * 10000n / t));
      }
      function plan(bp) {
        var l = list(), m = maxBp(l);
        if (bp >= m && m < SW_CAP && full(l)) return full(l); // 拖到头 = 余额全部用上（按币数精确算，不会差一点）
        return sweepPlan(l, total(l) * BigInt(bp) / 10000n);
      }
      function pctText(bp) { return (bp >= 100 ? (bp / 100).toFixed(bp % 100 ? 1 : 0) : (bp / 100).toFixed(2)) + "%"; }
      function loadBal() {
        if (!account) return;
        Promise.all([balance(DAI, account), balance(AILGNS, account)]).then(function (b) {
          var first = bal.buy === null; bal = { buy: b[0], sell: b[1] };
          if (first) r.value = maxBp(list()); // 第一次读到余额：进度条默认拉到余额能扫的最大（站长要求）
          draw();
        }).catch(function () {});
      }
      function balLine(m) {
        var buy = side === "buy", b = bal[side];
        if (b === null) return '<p class="muted sw-bal">' + (account ? "正在读取钱包余额…" : "连上钱包后，进度条最多只能拖到你余额扫得起的地方") + "</p>";
        return '<p class="muted sw-bal">钱包里有 <b>' + (buy ? show(b, 2) + " DAI" : tShow(b) + " " + SYM) + "</b>" + (buy && M.gas === "DAI" ? "（留约 " + show(gasKeep(list().length), 2) + " DAI 付 Gas）" : "") +
          (m >= SW_CAP ? " · 最多扫全部挂单的 90%（留 10%，防止别人同时成交导致扫单失败）" : " · 最多能扫全部挂单的 <b>" + pctText(m) + "</b>，再往右余额不够") + "</p>";
      }
      function draw() {
        var l = list(), m = maxBp(l);
        if (Number(r.value) > m) r.value = m; // 余额不够：只能往左拖
        var bp = Number(r.value), p = plan(bp);
        pv.textContent = pctText(bp);
        r.style.setProperty("--p", bp / 100 + "%");
        r.style.setProperty("--m", m / 100 + "%");
        box.querySelectorAll(".sw-quick [data-swp]").forEach(function (q) { var v = q.getAttribute("data-swp"); q.disabled = v !== "max" && Number(v) > m; q.classList.toggle("on", (v === "max" ? m : Number(v)) === bp); });
        if (!l.length) { out.innerHTML = '<div class="empty">现在没有可以扫的' + (side === "buy" ? "卖单" : "买单") + "</div>"; ladder.innerHTML = ""; go.disabled = true; return; }
        go.disabled = !p.steps.length;
        if (!p.steps.length) { out.innerHTML = balLine(m) + '<div class="empty">' + (m === 0 ? "钱包里的" + (side === "buy" ? " DAI " : " " + SYM + " ") + "不够扫一张单" : "往右拖一点，至少要吃到一张单") + "</div>"; ladder.innerHTML = ""; return; }
        var buy = side === "buy", fee = buy ? p.tok / 100n : p.dai / 100n, net = buy ? p.tok - fee : p.dai - fee;
        if (!sweeping) go.innerHTML = buy ? "<b>👉 点击确认付款 " + show(p.dai, 2) + " DAI</b><small>买入 " + tShow(net) + " " + SYM + "</small>" : "<b>👉 点击确认卖出 " + tShow(p.tok) + " " + SYM + "</b><small>收到 " + show(net, 2) + " DAI</small>"; // 分两行：付多少一行，得多少一行
        var pnl = pnlHtml(buy, buy ? net : p.tok, buy ? p.dai : net, mkt); lastPnl = pnlOf(buy, buy ? net : p.tok, buy ? p.dai : net, mkt);
        out.innerHTML = balLine(m) + pnl + '<div class="sw-get"><span>你将收到</span><b class="num">' + (buy ? tShow(net) + "</b><em>" + SYM : show(net, 2) + "</b><em>DAI") + "</em><small>已扣 1% 手续费 · 你付 " + (buy ? show(p.dai, 2) + " DAI" : tShow(p.tok) + " " + SYM) + " · 吃掉 " + p.steps.length + " 张单</small></div>"; // 平均单价和明细表去掉了（站长要求）
        ladder.innerHTML = ""; // 各档位对比表去掉了（站长要求），只看上面进度条选中的这一档
      }
      box.querySelectorAll("[data-sw]").forEach(function (b) {
        b.onclick = function () { side = sweepSide = b.getAttribute("data-sw"); try { sessionStorage.setItem("otc:sw", side); } catch (e) { /* 忽略 */ } box.querySelectorAll("[data-sw]").forEach(function (x) { x.classList.toggle("on", x === b); }); say(""); r.value = maxBp(list()); draw(); };
      });
      box.querySelectorAll("[data-sw]").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-sw") === side); });
      box.querySelectorAll(".sw-quick [data-swp]").forEach(function (b) { b.onclick = function () { var v = b.getAttribute("data-swp"); r.value = v === "max" ? maxBp(list()) : v; draw(); }; });
      r.oninput = draw;
      draw();
      loadBal();
      // 一键扫单：先一次授权总额，再按价格从优到差一张一张成交（合约一次只能吃一张单，每张都要在钱包里确认一次）
      go.onclick = function () {
        var buy = side === "buy", token = buy ? DAI : AILGNS, name = buy ? "DAI" : SYM, payDec = buy ? 18 : TD;
        go.disabled = true; sweeping = true;
        var p, done = 0, skipped = 0, paid = 0n, got = 0n, recs = [], rec = document.getElementById("sw-rec");
        rec.innerHTML = "";
        function end(msg, bad) {
          sweeping = false; go.disabled = false; say(msg, bad);
          if (done) { // 扫单记录：每张单的成交和链上交易，另附全部成交记录入口（站长要求）
            var getName = buy ? SYM : "DAI", getDec = buy ? TD : 18;
            var html = '<div class="sw-get sw-done"><span>本次扫单到手</span><b class="num">' + show(got, 4, getDec) + "</b><em>" + getName + "</em><small>成交 " + done + " 张，共付 " + show(paid, 4, payDec) + " " + name + "</small></div>" +
              '<table class="sw-tbl"><thead><tr><th>订单</th><th>付出</th><th>到手</th><th>交易</th></tr></thead><tbody>' +
              recs.map(function (x) { return "<tr><td>#" + x.id + "</td><td>" + show(x.pay, 4, payDec) + "</td><td><b>" + show(x.get, 4, getDec) + "</b></td><td>" + (x.tx ? '<a href="' + M.explorer + "/tx/" + x.tx + '" target="_blank" rel="noopener">查看</a>' : "") + "</td></tr>"; }).join("") +
              "</tbody></table>";
            var pnlNow2 = lastPnl, lastTx = (recs.filter(function (x) { return x.tx; }).slice(-1)[0] || {}).tx;
            savedRecord(typeof lastTx === "string" ? lastTx : "", pnlNow2).then(function (rec) { var w = document.querySelector(".modal .win-slot"); if (w) w.innerHTML = winHtml(pnlNow2, rec); });
            doneModal("✅ 扫单成功！", '<div class="win-slot">' + winHtml(pnlNow2, null) + "</div>" + html); // 弹窗里显示，页面刷新也不会消失，客户自己点关闭
            setTimeout(reload, 2000);
          }
        }
        // 批量扫单：一笔交易吃掉计划里的所有单，钱包只确认 1 次；结果从合约的 Swept 事件读
        function viaRouter() {
          var ids = p.steps.map(function (x) { return x.o.id; }), amts = p.steps.map(function (x) { return x.amount; });
          var max = p.steps.reduce(function (t, x) { return t + x.pay; }, 0n), arr = function (a) { return u256(a.length) + a.map(u256).join(""); };
          var data = "0x934a9456" + u256(OTC) + u256(buy ? 1 : 0) + u256(6 * 32) + u256((7 + ids.length) * 32) + u256(max) + u256(0) + arr(ids) + arr(amts);
          return send(ROUTER, data, function (t) { say("一次吃 " + ids.length + " 张：" + t); }, "批量扫单").then(function (rc) {
            var lg = (rc && rc.logs || []).filter(function (l) { return l.address.toLowerCase() === ROUTER && l.topics[0] === "0x2dd220c0a634108812dcd2bfb91b386e16d5da52969e771d2a9bb90eb2995257"; })[0];
            if (!lg) throw new Error("扫单交易成功了，但没读到结果，请刷新看看钱包余额");
            var w = function (i) { return BigInt("0x" + lg.data.slice(2 + i * 64, 66 + i * 64)); };
            done = Number(w(1)); paid = w(2); got = w(3);
            recs.push({ id: ids.slice(0, done).join(" #"), pay: paid, get: got, tx: rc.transactionHash });
            skipped = ids.length - done;
          });
        }
        // 🔄 客户只点一次：发交易前重读链上最新挂单，没了的单剔掉、自动换成现在最便宜的；贵了 1% 以上才问一句。整笔作废再自动换新重试 1 次
        var p0 = null, tried = 0;
        function refreshPlan(msg) {
          return loadBook(true).then(function (b) {
            var now = Date.now() / 1000, live = b.orders.filter(function (o) { return o.open && o.expiry > now && o.giveLeft > 0n && !isDust(o); });
            sells = live.filter(function (o) { return o.sellAilgns; }).sort(function (x, y) { return priceOf(x) - priceOf(y); });
            buys = live.filter(function (o) { return !o.sellAilgns; }).sort(function (x, y) { return priceOf(y) - priceOf(x); });
          }, function () { /* 读不到就用页面上的 */ }).then(function () {
            p = plan(Number(r.value));
            if (!p.steps.length) throw new Error("你要吃的单刚被别人吃完了，现在没有可以扫的单；稍等一下再看看");
            var same = p.steps.length === p0.steps.length && p.steps.every(function (x, i) { return x.o.id === p0.steps[i].o.id && x.amount === p0.steps[i].amount; });
            if (same) return;
            var worse = buy ? p.dai * 100n > p0.dai * 101n : p.dai * 100n < p0.dai * 99n;
            if (worse && !confirm("有单刚被别人吃了，换成现在的单后" + (buy ? "要付 " : "能收到 ") + show(p.dai, 2) + " DAI（原来 " + show(p0.dai, 2) + "）。继续吗？")) throw new Error("已取消，没有扣你的币");
            say(msg || "有单刚被别人吃了，已自动换成现在最便宜的单");
            draw();
          });
        }
        function retryable(e) { return /NOTHING_FILLED|CLOSED|EXPIRED|抢先|已经成交完/.test(String((e && e.message) || e)); }
        ready().then(function () {
          walletCard();
          return Promise.all([balance(DAI, account), balance(AILGNS, account)]).then(function (b) { bal = { buy: b[0], sell: b[1] }; draw(); });
        }).then(function () {
          p0 = plan(Number(r.value));
          if (!p0.steps.length) throw new Error("没有可以扫的单");
          return refreshPlan();
        }).then(function () {
          var need = p.steps.reduce(function (t, x) { return t + x.pay; }, 0n);
          return balance(token, account).then(function (b) {
            var reserve = buy ? gasKeep(p.steps.length) : 0n; // Anubis 上 Gas 用 DAI 付，留一点
            if (b < need + reserve) throw new Error("余额不足：扫这么多要 " + show(need, 4, payDec) + " " + name + (reserve ? "（另留一点 DAI 付 Gas）" : "") + "，钱包里有 " + show(b, 4, payDec) + "。把滑块往左拉一点");
            if (!buy && M.gas === "DAI") return balance(DAI, account).then(function (d) { if (d < gasKeep(p.steps.length) - GAS_RESERVE) throw new Error("钱包里的 DAI 不够付 Gas：Anubis 链 Gas 用 DAI 付，请先转一点 DAI（约 " + show(gasKeep(p.steps.length), 2) + "）进来"); });
            return M.gas === "POL" ? checkPol() : null;
          }).then(function () { return ensureAllowance(token, need, say, name, undefined, useRouter() ? ROUTER : undefined); });
        }).then(function () {
          function fire() { return useRouter() ? viaRouter() : seq(); }
          return fire().catch(function (e) {
            if (!retryable(e) || tried || done) throw e;
            tried = 1; p0 = p;
            return refreshPlan("刚有人抢先，已自动换成最新的单，正在成交…").then(function () {
              var need2 = p.steps.reduce(function (t, x) { return t + x.pay; }, 0n);
              return ensureAllowance(token, need2, say, name, undefined, useRouter() ? ROUTER : undefined);
            }).then(fire);
          });
          function seq() {
          var i = 0;
          function next() {
            if (i >= p.steps.length) return;
            var s = p.steps[i++], tag = "第 " + i + " / " + p.steps.length + " 张（#" + s.o.id + "）";
            // 成交前重读这张单：可能已经被别人吃掉一部分
            return read(OTC, SEL.getOrders + u256(s.o.id) + u256(1)).then(function (h) {
              var o = parseOrders(h, s.o.id)[0];
              if (!o || !o.open || o.giveLeft === 0n) { skipped++; return next(); }
              var amount = s.amount > o.giveLeft ? o.giveLeft : s.amount, pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
              return send(OTC, SEL.fill + u256(o.id) + u256(amount) + u256(pay), function (t) { say(tag + "：" + t); }, "成交").then(function (rc) {
                done++; paid += pay; got += amount - amount / 100n; // 到手 = 吃下的数量扣 1% 手续费
                recs.push({ id: o.id, pay: pay, get: amount - amount / 100n, tx: rc && rc.transactionHash });
                return next();
              });
            });
          }
          return next();
          }
        }).then(function () {
          if (!done) { end("⚠️ 你选的单连续两次被别人抢先买走了，没有扣你的币。正在刷新最新挂单，请再点一次", true); setTimeout(reload, 800); return; } // 以前这里也说「扫单完成」，客户以为点了没反应
          end("✅ 扫单完成，已到你的钱包" + (skipped ? "（有 " + skipped + " 张已被别人吃掉，跳过了）" : ""));
        }, function (e) {
          end((done ? "已成交 " + done + " 张，后面的停下了：" : "") + niceError(e), true);
          // 单被别人抢走 / 已关闭：页面上的挂单是旧的，马上重读最新挂单（以前不刷新，客户再点还是吃同一张旧单，一直报错）
          if (/NOTHING_FILLED|CLOSED|EXPIRED|抢先|已经成交完/.test(String((e && e.message) || e))) setTimeout(function () { sweeping = false; reload(); }, 1500);
        });
      };
    }

    // 吃单弹窗：买入按付多少 DAI 填，卖出按卖多少 AiLGNS 填
    function openFill(o, reload, mkt) {
      var m = document.getElementById("otc-modal"), p = priceOf(o);
      var maxAil = o.sellAilgns ? o.giveLeft : ceilDiv(o.giveLeft * o.wantTotal, o.giveTotal);
      m.hidden = false;
      m.innerHTML = '<div class="modal-box"><div class="card-head"><h2>' + (o.sellAilgns ? "买入 " : "卖出 ") + SYM + " · #" + o.id + '</h2><button class="ghost" data-close style="padding:4px 12px">关闭</button></div>' +
        '<dl class="dl"><dt>单价</dt><dd>' + A.fmt(p, PD + 2) + " DAI</dd><dt>可成交</dt><dd>" + tShow(maxAil) + " " + SYM + '</dd><dt>挂单人</dt><dd class="mono">' + A.nameTag(o.maker) + "</dd></dl>" +
        '<label class="full">' + (o.sellAilgns ? "付款金额（DAI）" : "卖出数量（" + SYM + "）") + '<div class="row"><input id="f-qty" inputmode="decimal" placeholder="0"><button class="ghost" id="f-max" style="padding:0 14px">最大</button></div></label>' +
        '<div class="quote" id="f-quote">输入数量后显示</div><div class="note" id="f-bal" style="margin:0"></div><button id="f-go" style="padding:12px 22px;width:100%">确认' + (o.sellAilgns ? "买入" : "卖出") + '</button><p class="note" id="f-st"></p></div>';
      var qty = document.getElementById("f-qty"), quote = document.getElementById("f-quote"), st = document.getElementById("f-st");
      var payToken = o.sellAilgns ? DAI : AILGNS, payName = o.sellAilgns ? "DAI" : SYM, payDec = o.sellAilgns ? 18 : TD;
      var bal = null; // 钱包里能付的币（BigInt）
      function loadBal() {
        return balance(payToken, account).then(function (b) {
          bal = b;
          var el = document.getElementById("f-bal");
          if (el) el.textContent = "你的余额：" + show(b, o.sellAilgns ? 2 : 4, payDec) + " " + payName;
          return b;
        });
      }
      if (account) loadBal();
      // 「最大」= 你钱包余额最多能成交多少，和这张单剩下的取小的
      var maxPay = ceilDiv(o.giveLeft * o.wantTotal, o.giveTotal); // 买下这张单剩下的全部要付多少 DAI
      function maxByWallet(b) {
        if (o.sellAilgns) { // 买：能付的 DAI = 余额 - Gas 预留，和吃完这张单要的 DAI 取小的
          var can = b > GAS_RESERVE ? b - GAS_RESERVE : 0n;
          return can < maxPay ? can : maxPay;
        }
        return b < maxAil ? b : maxAil; // 卖：挂单币余额（Gas 用 DAI / POL 付，不用留）
      }
      function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.textContent = t; if (bad) errTip(t, st); }
      function plan() {
        var q = toWei(qty.value, payDec);
        if (!q) { quote.textContent = o.sellAilgns ? "输入付多少 DAI 后显示" : "输入数量后显示"; return null; }
        var amount, pay, get, fee, capped = o.sellAilgns ? q > maxPay : q > maxAil;
        if (o.sellAilgns) { // 付 q 个 DAI，按单价换成能拿走的 AiLGNS（往下取，实际付的不会超过 q）
          if (q > maxPay) q = maxPay;
          amount = (q * o.giveTotal) / o.wantTotal;
          if (amount > o.giveLeft) amount = o.giveLeft;
        } else {
          if (q > maxAil) q = maxAil; // 付 AILGNS，拿走 DAI
          amount = (q * o.giveTotal) / o.wantTotal;
          if (amount > o.giveLeft) amount = o.giveLeft;
        }
        // 吃完后剩下不到 1 DAI 的，连剩下的一起吃掉，不给挂单留下没人要的尾巴
        var swept = amount > 0n && amount < o.giveLeft && isDustLeft(o, o.giveLeft - amount);
        if (swept) amount = o.giveLeft;
        pay = ceilDiv(amount * o.wantTotal, o.giveTotal);
        fee = (amount * FEE_BPS) / 10000n; get = amount - fee;
        if (amount === 0n) { quote.textContent = "数量太小"; return null; }
        quote.innerHTML = o.sellAilgns
          ? "你付 <b>" + show(pay, 4) + " DAI</b>，收到 <b>" + tShow(get) + " " + SYM + "</b><br><span class=\"muted\">手续费 1%：" + tShow(fee) + " " + SYM + "</span>"
          : "你付 <b>" + tShow(pay) + " " + SYM + "</b>，收到 <b>" + show(get, 4) + " DAI</b><br><span class=\"muted\">手续费 1%：" + show(fee, 4) + " DAI</span>";
        lastPnl = pnlOf(o.sellAilgns, o.sellAilgns ? get : pay, o.sellAilgns ? pay : get, mkt);
        quote.innerHTML = pnlHtml(o.sellAilgns, o.sellAilgns ? get : pay, o.sellAilgns ? pay : get, mkt) + quote.innerHTML;
        if (capped) quote.innerHTML += '<br><span class="muted">这张单只剩这么多，已按剩下的全部算</span>';
        else if (swept) quote.innerHTML += '<br><span class="muted">这张单买完后只剩不到 1 DAI，已一起算上</span>';
        if ((o.sellAilgns ? pay : amount) < MIN_ORDER) quote.innerHTML += '<br><span class="muted">单笔成交不足 50 DAI，不送会员</span>';
        return { amount: amount, pay: pay };
      }
      qty.oninput = plan;
      document.getElementById("f-max").onclick = function () {
        (account ? (bal !== null ? Promise.resolve(bal) : loadBal()) : ready().then(function () { walletCard(); return loadBal(); })).then(function (b) {
          var q = maxByWallet(b);
          if (q <= 0n) { qty.value = ""; plan(); say("钱包里没有 " + payName + "，没法" + (o.sellAilgns ? "买入" : "卖出"), true); return; }
          qty.value = floorStr(q, o.sellAilgns || TD < 18 ? 4 : 6, payDec); // 往下取（DAI、LGNS 4 位，AiLGNS 6 位小数），免得超过余额
          plan();
          var full = o.sellAilgns ? q >= maxPay : q >= maxAil;
          say(full ? "这张单剩下的全部（你的余额够）" : o.sellAilgns ? "已按你的 DAI 余额填入最大金额，留了 0.1 DAI 付 Gas" : "已按你的钱包余额填入最大数量");
        }, function (e) { say(niceError(e), true); });
      };
      m.querySelector("[data-close]").onclick = function () { m.hidden = true; };
      m.onclick = function (e) { if (e.target === m) m.hidden = true; };
      document.getElementById("f-go").onclick = function () {
        var btn = this, v = plan();
        if (!v) { say("请输入数量", true); return; }
        var token = o.sellAilgns ? DAI : AILGNS, name = payName;
        btn.disabled = true;
        say("正在连接钱包…");
        ready().then(function () {
          walletCard();
          say("正在检查余额…");
          if (account === o.maker) throw new Error(REASONS.TRANSFER_MISMATCH);
          // 余额、Gas 余额、授权额度一次同时查（以前一个接一个查，点了要等好几秒钱包才弹出来）
          return Promise.all([balance(token, account), !o.sellAilgns && M.gas !== "POL" ? balance(DAI, account) : null, allowance(token, account), M.gas === "POL" ? checkPol() : null]);
        }).then(function (res) {
          var b = res[0], g = res[1];
          if (b < v.pay) throw new Error("余额不足：需要 " + show(v.pay, 4, payDec) + " " + name + "，钱包里有 " + show(b, 4, payDec));
          if (M.gas !== "POL" && o.sellAilgns && b - v.pay < GAS_RESERVE / 10n) throw new Error("要留一点 DAI 付 Gas：请把金额改小一点（或点「最大」自动留 0.1 DAI）");
          if (g !== null && g < GAS_RESERVE / 10n) throw new Error("钱包里要有一点 DAI 付 Gas（0.01 DAI 就够），现在只有 " + show(g, 4) + " DAI");
          return ensureAllowance(token, v.pay, say, name, res[2]);
        }).then(function () {
          return send(OTC, SEL.fill + u256(o.id) + u256(v.amount) + u256(v.pay), say, "成交");
        }).then(function (tx) {
          say("成交成功！币已到你的钱包");
          m.hidden = true; // 换成停留的结果弹窗，带成交记录入口（客户自己点关闭）
          var pnlNow = lastPnl, txh = tx && (tx.transactionHash || tx);
          savedRecord(typeof txh === "string" ? txh : "", pnlNow).then(function (rec) { var w = document.querySelector(".modal .win-slot"); if (w) w.innerHTML = winHtml(pnlNow, rec); });
          doneModal("✅ 成交成功！", '<div class="win-slot">' + winHtml(pnlNow, null) + '</div><p style="font-size:16px">币已到你的钱包（订单 #' + o.id + "）" + ((tx = tx && (tx.transactionHash || tx)) && typeof tx === "string" ? '，<a href="' + M.explorer + "/tx/" + tx + '" target="_blank" rel="noopener">查看链上交易</a>' : "") + "。</p>");
          setTimeout(reload, 1500);
        }, function (e) { say(niceError(e), true); btn.disabled = false; });
      };
    }
  }

  // ---------- 部署页（只给站长用，不在导航里） ----------
  function renderDeploy(id) {
    var app = A.app;
    app.innerHTML = '<h1>部署托管合约 · ' + SYM + "（" + M.chainName + ' 链）</h1><p class="sub">用你的钱包把 OTC 托管合约部署到 ' + M.chainName + " 链。部署只需要一次，Gas 用 " + M.chainName + " 链上的 " + M.gas + " 支付。" + (M.nft ? "卡牌用另一份托管合约 AwakeNftEscrow（整张成交、手续费 3% 买家另付），构造参数是下面的卡牌合约、DAI 和手续费收款地址。" : "合约代码和 AiLGNS OTC 完全相同，只是构造参数换成下面的币。") + "</p>" +
      '<nav class="mkt-tabs">' + MKEYS.map(function (k) { return '<a href="#/otc/deploy/' + k + '"' + (k === MK ? ' class="on"' : "") + "><b>" + MARKETS[k].sym + "</b><small>" + MARKETS[k].chainName + " 链</small></a>"; }).join("") + "</nav>" +
      (OTC ? '<section class="card"><p>这个市场已经部署：<a class="mono" target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + OTC + '">' + OTC + " ↗</a>，不用再部署。</p></section>" : "") +
      '<section class="card"><dl class="dl"><dt>' + (M.nft ? "卡牌合约 " : "挂单币 ") + SYM + '</dt><dd class="mono">' + AILGNS + "</dd><dt>DAI</dt><dd class=\"mono\">" + DAI + "</dd><dt>手续费收款地址</dt><dd class=\"mono\">" + FEE_RECIPIENT +
      "</dd><dt>手续费</dt><dd>" + (M.nft ? "3%，买家另付" : "1%") + "（合约里写死）</dd><dt>管理员</dt><dd>无，部署后任何人都改不了</dd></dl>" +
      '<button id="d-go" style="padding:12px 22px;margin-top:16px">连接钱包并部署</button><p class="note" id="d-st"></p></section>';
    var st = document.getElementById("d-st");
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; }
    document.getElementById("d-go").onclick = function () {
      var btn = this;
      btn.disabled = true;
      var data, gas;
      connect().then(function () {
        // 有的钱包切链会"假成功"，确认钱包真的在目标链上，不然手续费估算会失败
        return W.get().request({ method: "eth_chainId" });
      }).then(function (cid) {
        if (Number(cid) !== Number(W.CHAINS[M.chain].params.chainId)) throw new Error("钱包现在不在 " + M.chainName + " 链上：请在钱包里手动切换到 " + M.chainName + " 再点部署");
        return A.getJSON(M.nft ? "contracts/AwakeNftEscrow.json" : "contracts/AilgnsOtcEscrow.json");
      }).then(function (art) {
        data = art.bytecode + u256(AILGNS) + u256(DAI) + u256(FEE_RECIPIENT);
        say("正在估算部署手续费…");
        // 用本站的节点先估算 Gas，再直接告诉钱包，钱包不用自己估算（有的钱包在 Polygon 上估算会失败）
        return Promise.all([W.rpcOn(M.chain, "eth_estimateGas", [{ from: account, data: data }]), W.rpcOn(M.chain, "eth_gasPrice", []), gasBalance(account)]);
      }).then(function (r) {
        gas = BigInt(r[0]) * 13n / 10n; // 多留 30%
        var cost = gas * BigInt(r[1]);
        if (BigInt(r[2]) < cost) throw new Error("钱包里的 " + M.gas + " 不够付部署手续费：大约需要 " + show(cost, 3) + " " + M.gas + "，现在有 " + show(BigInt(r[2]), 3));
        say("请在钱包里确认部署（手续费约 " + show(cost, 3) + " " + M.gas + "）…");
        return AIL.wallets.ask(W.get(), { method: "eth_sendTransaction", params: [{ from: account, data: data, gas: "0x" + gas.toString(16) }] });
      }).then(function (hash) {
        say("已提交，等待链上确认…");
        return W.waitOn(M.chain, hash);
      }).then(function (r) {
        say('✅ 部署成功！合约地址：<b class="mono">' + r.contractAddress + '</b><br>把这个地址发给我，我把它填进网站就能开放交易。<a target="_blank" rel="noopener" href="' + EXPLORER + "/address/" + r.contractAddress + '">在浏览器查看 ↗</a>');
      }, function (e) { say(niceError(e), true); btn.disabled = false; });
    };
  }

  // 收入分账：原收款钱包在这里授权分账合约；之后每 5 分钟自动把新到的收入分出去
  function renderSplit(id) {
    var app = A.app, MAX = (1n << 256n) - 1n, totalSel = "0x0399205c"; // totalSplit(address)
    // 🔒 团队内部页：只有收款钱包本人连上才显示（站长 2026-11-07：不公开收入分配）
    if (String(account || "").toLowerCase() !== FEE_RECIPIENT) {
      app.innerHTML = '<section class="card"><h2>🔧 运营维护</h2><p class="muted">这是团队内部的运营维护页面，需要用团队钱包登录。</p>' +
        (account ? '<p class="muted">当前连接的是 <span class="mono">' + A.short(account) + '</span>，不是团队钱包。请在钱包里切换到团队钱包再回到本页。</p>' : '<button type="button" class="nm-go" id="sp-conn">🔗 连接钱包</button>') +
        '<p><a href="#/otc">← 回 OTC</a></p></section>';
      var cb = document.getElementById("sp-conn");
      if (cb) cb.onclick = function () { cb.disabled = true; connect().then(function () { renderSplit(id); }, function (e) { cb.disabled = false; A.errTip(e.message || String(e), cb); }); };
      return;
    }
    var TOKS = [
      { name: "LGNS", chain: "anubis", token: "0x4D1D808a081FdAc440703b3765FC61f8028C06B8", dec: 9 },
      { name: "AiLGNS", chain: "anubis", token: ANUBIS_AILGNS, dec: 18 },
      { name: "DAI", chain: "anubis", token: ANUBIS_DAI, dec: 18 },
      { name: "DAI", chain: "polygon", token: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", dec: 18 },
      { name: "LGNS", chain: "polygon", token: "0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01", dec: 9 },
      { name: "gLGNS", chain: "anubis", token: "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c", dec: 18 }
    ];
    var CH = { anubis: { name: "Anubis", explorer: ANUBIS_EXPLORER }, polygon: { name: "Polygon", explorer: "https://polygonscan.com" } };
    function read(chain, to, data) { return (chain === "anubis" ? A.call(to, data) : W.rpcOn("polygon", "eth_call", [{ to: to, data: data }, "latest"])).then(BigInt); }
    function amt(v, dec) { return A.fmt(Number(v) / Math.pow(10, dec), 4); }
    var BB_TOKS = TOKS.slice(0, 3); // 回购合约用 Anubis 的 LGNS、AiLGNS、DAI
    var PG_KEEPER = "0x89Dd06754bb239b6C4C92Bc47C8Fa72889084E27", PG_TOKS = [TOKS[4], TOKS[3]]; // Polygon 跨链回购：触发钱包取 Polygon 的 LGNS、DAI，卖成 DAI 跨到 Anubis
    var pulledSel = "0x9f5951c7"; // totalPulled(address)
    app.innerHTML = '<h1>收入分账</h1><p class="sub">会员费和 OTC 手续费照旧进入原收款钱包 ' + A.short(FEE_RECIPIENT) + '。现在改成<b>回购分账</b>：Anubis 链收到的 LGNS、DAI 先在本站 OTC 换成 AiLGNS，再连同收到的 AiLGNS 按比例分出去；Polygon 链的收入攒够 100 美金后卖成 DAI 跨到 Anubis，再一起回购。地址、比例和价格保护都写死在合约里，任何人都改不了。</p>' +
      '<section class="card"><div class="card-head"><h2>回购分账规则</h2></div><dl class="dl">' +
      BB_PAYEES.map(function (p) { return "<dt>" + p[1] + "%</dt><dd>" + A.addrLink(p[0]) + "</dd>"; }).join("") +
      "<dt>回购合约</dt><dd>" + (BUYBACK ? '<a class="mono" target="_blank" rel="noopener" href="' + ANUBIS_EXPLORER + "/address/" + BUYBACK + '">' + A.short(BUYBACK) + " ↗</a>" : '<span class="muted">待部署</span>') +
      '</dd><dt>源码</dt><dd><a href="contracts/AilgnsBuyback.sol" target="_blank" rel="noopener">AilgnsBuyback.sol ↗</a></dd></dl>' +
      '<p class="note">怎么换：LGNS 卖进 LGNS OTC 的买单（出价不低于 DEX 现价 50%，不走 DEX，DEX 卖出要扣约 50%）→ 用 DAI 扫 AiLGNS OTC 的卖单（要价不高于 DEX 现价 115%）→ 买到的 AiLGNS 直接打给上面三个地址。攒够 300 美金换一次；收款钱包永远留 5 DAI 付 Gas；触发钱包 Gas 不够时每次最多从收入里补 0.5 DAI。没有合适的单子时，钱留在合约里下次接着换，也可以原样退回收款钱包。</p>' +
      '<div id="bb-state" class="loading">正在读取…</div><p class="note" id="sp-st"></p></section>' +
      '<section class="card"><div class="card-head"><h2>🎯 奖池周转授权</h2><span class="muted">域名 70% 转进奖池用</span></div>' +
      '<p class="note">域名费退回收款钱包后，机器人（触发钱包 ' + A.short(PG_KEEPER) + '）靠这笔授权把其中 70% 转进奖池。点一次「设为 100,000 DAI / 200 AiLGNS」，几年不用再管。真正的防线不是这个额度，是你每天把谷歌社交账号钱包清到冷钱包：就算触发钱包私钥泄露，也只能动钱包里当天的钱。</p>' +
      '<div id="kp-state" class="loading">正在读取…</div></section>' +
      '<section class="card"><div class="card-head"><h2>⚡ OTC 自动撮合</h2><span class="muted">利润进回购合约</span></div>' +
      '<p class="note">卖单要价比买单出价低 2% 以上时，机器人每几分钟自动撮合：从收款钱包临时取 DAI（每次用能用的最多 DAI，收款钱包永远留 5 DAI 付 Gas）→ 吃卖单 → 卖给买单 → 循环。<b>本金在同一笔交易里原样退回收款钱包</b>，利润进回购合约（攒够 300 美金自动分）；赚不到钱整笔回滚，本金一分不动。合约 <a class="mono" target="_blank" rel="noopener" href="' + ANUBIS_EXPLORER + "/address/" + MATCHER + '">' + A.short(MATCHER) + ' ↗</a> · <a href="contracts/AilgnsOtcMatcher.sol" target="_blank" rel="noopener">源码 ↗</a></p>' +
      '<div id="mx-state" class="loading">正在读取…</div></section>' +
      '<section class="card"><div class="card-head"><h2>Polygon 收入跨链回购</h2></div><p class="note">Polygon 链收到的 LGNS、DAI 攒够 100 美金后，触发钱包 ' + A.short(PG_KEEPER) + ' 把它取走：LGNS 在 QuickSwap 卖成 DAI（扣约 5% 税），再通过 Anubis 官方跨链桥跨回收款钱包（桥收 1 DAI），到账后和 Anubis 收入一样扫单买成 AiLGNS 分出去。需要先用收款钱包在 Polygon 链授权下面两个币（每个点一次）。</p>' +
      '<div id="pg-state" class="loading">正在读取…</div></section>' +
      '<section class="card"><div class="card-head"><h2>旧分账合约' + (BUYBACK ? "（已停用）" : "") + '</h2><span class="muted">30% / 40% / 30%，按原币分</span></div>' +
      '<p class="note">' + (BUYBACK ? "回购分账上线后，机器人不再触发旧合约。为了安全，建议用收款钱包把旧合约的授权撤销（点「撤销」，额度改成 0）。" : "回购合约部署之前，旧合约照常分账。") +
      " 旧合约：" + Object.keys(SPLITTERS).map(function (c) { return CH[c].name + ' <a class="mono" target="_blank" rel="noopener" href="' + CH[c].explorer + "/address/" + SPLITTERS[c] + '">' + A.short(SPLITTERS[c]) + " ↗</a>"; }).join("　") + "</p>" +
      '<div id="sp-state" class="loading">正在读取…</div></section>';
    var st = document.getElementById("sp-st");
    function say(t, bad) { st.className = "note" + (bad ? " down" : ""); st.innerHTML = t; if (st.scrollIntoView) st.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    function allowCell(a, t) {
      var ok = a !== null && a >= 10n ** BigInt(t.dec + 6); // 授权 100 万枚以上就算够用
      return [ok, a === null ? "—" : ok ? '<span class="up">已授权 ✓</span>' : a === 0n ? '<span class="muted">未授权</span>' : amt(a, t.dec)];
    }
    function load() {
      Promise.all(PG_TOKS.map(function (t) { return read("polygon", t.token, SEL.allowance + u256(FEE_RECIPIENT) + u256(PG_KEEPER)).catch(function () { return null; }); })).then(function (r) {
        if (!A.isCurrent(id)) return;
        var el = document.getElementById("pg-state");
        el.className = "";
        el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th class="l">币种</th><th>授权给触发钱包</th><th></th></tr></thead><tbody>' +
          PG_TOKS.map(function (t, i) {
            var c = allowCell(r[i], t);
            return '<tr><td class="l"><b>' + t.name + "</b> Polygon</td><td>" + c[1] + "</td><td>" + (c[0] ? "" : '<button data-pg="' + i + '" style="padding:6px 14px">授权</button>') + "</td></tr>";
          }).join("") + "</tbody></table></div>";
        el.querySelectorAll("[data-pg]").forEach(function (b) { b.onclick = function () { approve(PG_TOKS[+b.getAttribute("data-pg")], b, PG_KEEPER, MAX, "授权触发钱包使用 "); }; });
      });
      // 🎯 奖池周转授权：收款钱包 → 触发钱包（Anubis DAI / AiLGNS），封顶 1,000 DAI / 2 AiLGNS
      var KP_TOKS = [TOKS[2], TOKS[1]], KP_CAP = [100000n * 10n ** 18n, 200n * 10n ** 18n]; // 站长 2026-11-07 定：一次授权几年不用管；真正的防线是每天清钱包
      Promise.all(KP_TOKS.map(function (t) { return read("anubis", t.token, SEL.allowance + u256(FEE_RECIPIENT) + u256(PG_KEEPER)).catch(function () { return null; }); })).then(function (r) {
        if (!A.isCurrent(id)) return;
        var el = document.getElementById("kp-state"); if (!el) return;
        el.className = "";
        el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th class="l">币种</th><th>现在的额度</th><th></th></tr></thead><tbody>' +
          KP_TOKS.map(function (t, i) {
            var a = r[i], cap = KP_CAP[i], capTxt = (i ? "200 AiLGNS" : "100,000 DAI");
            var st = a === null ? "—" : a === 0n ? '<span class="nm-bad">0（70% 转不进奖池）</span>' : a < cap / 100n ? '<span class="nm-bad">' + amt(a, t.dec) + "（快用完）</span>" : '<span class="up">' + amt(a, t.dec) + " ✓</span>";
            return '<tr><td class="l"><b>' + t.name + "</b> Anubis</td><td>" + st + '</td><td><button data-kp="' + i + '" style="padding:6px 14px">设为 ' + capTxt + "</button></td></tr>";
          }).join("") + "</tbody></table></div>";
        el.querySelectorAll("[data-kp]").forEach(function (b) { var i = +b.getAttribute("data-kp"); b.onclick = function () { approve(KP_TOKS[i], b, PG_KEEPER, KP_CAP[i], "把触发钱包的额度设为 " + (i ? "200 " : "100,000 ")); }; });
      });
      Promise.all([read("anubis", ANUBIS_DAI, SEL.allowance + u256(FEE_RECIPIENT) + u256(MATCHER)), read("anubis", MATCHER, "0x2a5b1451"), read("anubis", MATCHER, "0x86001519")]).catch(function () { return null; }).then(function (r) {
        if (!A.isCurrent(id)) return;
        var el = document.getElementById("mx-state"), t = BB_TOKS[2], c = allowCell(r ? r[0] : null, t);
        el.className = "";
        el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th class="l">币种</th><th>授权给撮合合约</th><th>已撮合</th><th>累计利润</th><th></th></tr></thead><tbody><tr><td class="l"><b>DAI</b> Anubis</td><td>' + c[1] + "</td><td>" + (r ? r[1] + " 次" : "—") + "</td><td>" + (r ? amt(r[2], 18) + " DAI" : "—") + "</td><td>" +
          (r && r[0] > 0n ? '<button class="ghost" data-mx="0" style="padding:6px 14px">撤销</button> ' : "") + '<button data-mx="1" style="padding:6px 14px">授权 100,000 DAI（一次管几年）</button>' + "</td></tr></tbody></table></div>";
        el.querySelectorAll("[data-mx]").forEach(function (b) { b.onclick = function () { var on = b.getAttribute("data-mx") === "1"; approve(t, b, MATCHER, on ? 100000n * 10n ** 18n : 0n, on ? "授权撮合合约使用 " : "撤销撮合合约对 "); }; });
      });
      if (BUYBACK) Promise.all(BB_TOKS.map(function (t) {
        return Promise.all([read("anubis", t.token, SEL.allowance + u256(FEE_RECIPIENT) + u256(BUYBACK)), read("anubis", BUYBACK, pulledSel + u256(t.token))]).catch(function () { return null; });
      })).then(function (r) {
        if (!A.isCurrent(id)) return;
        var el = document.getElementById("bb-state");
        el.className = "";
        el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th class="l">币种</th><th>授权给回购合约</th><th>累计取走</th><th></th></tr></thead><tbody>' +
          BB_TOKS.map(function (t, i) {
            var c = allowCell(r[i] ? r[i][0] : null, t);
            return '<tr><td class="l"><b>' + t.name + "</b> Anubis</td><td>" + c[1] + "</td><td>" + (r[i] ? amt(r[i][1], t.dec) : "—") + "</td><td>" +
              (c[0] ? '<button class="ghost" data-bbrv="' + i + '" style="padding:6px 14px">撤销</button>' : '<button data-bb="' + i + '" style="padding:6px 14px">授权</button>') + "</td></tr>";
          }).join("") + "</tbody></table></div>" +
          '<p class="note">分账暂停期间建议把三个币的授权都「撤销」（额度改成 0）：撤销后机器人动不了收款钱包里的币，域名收入照样自动退回收款钱包，不影响任何功能。以后要恢复分账再点「授权」。</p>';
        el.querySelectorAll("[data-bb]").forEach(function (b) { b.onclick = function () { approve(BB_TOKS[+b.getAttribute("data-bb")], b, BUYBACK, MAX, "授权回购合约使用 "); }; });
        el.querySelectorAll("[data-bbrv]").forEach(function (b) { b.onclick = function () { approve(BB_TOKS[+b.getAttribute("data-bbrv")], b, BUYBACK, 0n, "撤销回购合约对 "); }; });
      });
      else { var e0 = document.getElementById("bb-state"); e0.className = "note"; e0.textContent = "回购合约部署后，这里会出现授权按钮。"; }
      Promise.all(TOKS.map(function (t) {
        return Promise.all([read(t.chain, t.token, SEL.allowance + u256(FEE_RECIPIENT) + u256(SPLITTERS[t.chain])), read(t.chain, SPLITTERS[t.chain], totalSel + u256(t.token))]).catch(function () { return null; });
      })).then(function (r) {
        if (!A.isCurrent(id)) return;
        var el = document.getElementById("sp-state");
        el.className = "";
        el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th class="l">币种</th><th class="l">链</th><th>授权</th><th>累计已分</th><th></th></tr></thead><tbody>' +
          TOKS.map(function (t, i) {
            var a = r[i] ? r[i][0] : null, c = allowCell(a, t);
            return '<tr><td class="l"><b>' + t.name + '</b></td><td class="l">' + CH[t.chain].name + "</td><td>" + c[1] + "</td><td>" + (r[i] ? amt(r[i][1], t.dec) : "—") + "</td>" +
              "<td>" + (BUYBACK ? (a ? '<button class="ghost" data-rv="' + i + '" style="padding:6px 14px">撤销</button>' : "") : c[0] ? "" : '<button data-ap="' + i + '" style="padding:6px 14px">授权</button>') + "</td></tr>";
          }).join("") + "</tbody></table></div>";
        el.querySelectorAll("[data-ap]").forEach(function (b) { var t = TOKS[+b.getAttribute("data-ap")]; b.onclick = function () { approve(t, b, SPLITTERS[t.chain], MAX, "授权分账合约使用 "); }; });
        el.querySelectorAll("[data-rv]").forEach(function (b) { var t = TOKS[+b.getAttribute("data-rv")]; b.onclick = function () { approve(t, b, SPLITTERS[t.chain], 0n, "撤销旧分账合约对 "); }; });
      });
    }
    function approve(t, b, spender, value, verb) {
      b.disabled = true;
      var eth, label = verb + t.name + "（" + CH[t.chain].name + "）" + (value ? "" : " 的授权");
      Promise.resolve().then(function () { return account ? null : connect(); }).then(function () {
        if (account !== FEE_RECIPIENT) throw new Error("请切换到原收款钱包 " + A.short(FEE_RECIPIENT) + " 再操作（现在连接的是 " + A.short(account) + "）");
        eth = W.get();
        say("正在切换到 " + CH[t.chain].name + " 链…");
        return W.switchTo(eth, t.chain);
      }).then(function () {
        say("请在钱包里确认：" + label + "…");
        return AIL.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: account, to: t.token, data: SEL.approve + u256(spender) + u256(value) }] });
      }).then(function (hash) {
        say(label + "已提交，等待链上确认…");
        return W.waitOn(t.chain, hash);
      }).then(function () {
        say("✅ " + label + "成功");
        load();
      }, function (e) { say(niceError(e), true); b.disabled = false; });
    }
    load();
  }

  // 其他页面顶部的 AiLGNS OTC 推荐条
  function promo() {
    var el = document.getElementById("promo");
    if (!el) return;
    var tab = location.hash.replace(/^#\/?/, "").split("/")[0] || "otc";
    // 推荐条已撤下，位置留给顶部荣耀榜播报条（榜一）
    el.innerHTML = true ? "" : '<a class="promo" href="#/otc"><span class="promo-tag">主推</span><b>AiLGNS OTC</b><span class="promo-txt">每 1,000 美元省 $20–$270 · 手续费仅 1%（官方 DEX 3%–28%）· 0 滑点</span><span class="promo-go">去交易 →</span></a>';
  }
  window.addEventListener("hashchange", promo);
  promo();

  // 钱包里切换账户时，页面跟着换
  var listening = false;
  // 给 nft.js 用：钱包、发交易、读链、数字格式、市场切换（都按当前市场）
  A.otcKit = {
    account: function () { return account; }, connect: connect, ready: ready, silentAccount: silentAccount, send: send, read: read, balance: balance, allowance: allowance,
    u256: u256, toWei: toWei, left: left, niceError: niceError, marketTabs: marketTabs, DURATIONS: DURATIONS, DUR_DEFAULT: DUR_DEFAULT, durSlider: durSlider,
    M: function () { return M; }, OTC: function () { return OTC; }, DAI: function () { return DAI; }, EXPLORER: function () { return EXPLORER; },
    useMarket: useMarket, // lend.js 用：切到对应市场，让链、钱包切链都对
    deboxCard: deboxCard // 借贷 / 卡牌页复用 DeBox 通知绑定卡片
  };
  A.pages.otc = function (id) {
    // #/otc · #/otc/lgns · #/otc/plgns · #/otc/glgns（后面可再跟 /sell、/buy）；部署页 #/otc/deploy/<市场>
    var parts = location.hash.split("/"), sub = parts[2] || "";
    useMarket(sub === "deploy" ? parts[3] : sub);
    if (!listening) {
      listening = true;
      A.wallets.onAccounts(function (a) {
        account = a && a[0] ? String(a[0]).toLowerCase() : null;
        if (location.hash.indexOf("#/otc") === 0) window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
    }
    renderOtc(id, sub);
  };
  // 营销广告：OTC 介绍、和官方 DEX 的费用对比、交易送会员
  A.pages.promo = function (id) {
    useMarket("ailgns"); // 营销广告讲的是 AiLGNS
    var gift = '<section class="card promo-gift"><div class="card-head"><h2>🎁 交易就送会员</h2></div>' +
      '<div class="pg-row"><div class="pg-item"><b>初级 VIP</b><span>在本站 OTC 单笔成交满 50 DAI</span></div><div class="pg-item pro"><b>高级 VIP</b><span>累计成交满 1 万 DAI</span></div></div>' +
      '<p class="note">挂单被吃、吃别人的单都算，按钱包地址自动累计。成交后到<a href="#/member">「会员」</a>页填这个钱包地址点「查询」就能用。</p>' +
      '<button data-go="otc" style="padding:12px 22px">去 OTC 交易 →</button></section>';
    function draw(mkt, live) {
      A.app.innerHTML = hero(mkt, live) + gift + VS + '<p class="note">本站为 AWAKE HELIX 官方认证的 AiLGNS OTC 服务站。智能合约未经第三方审计，请先小额试用。</p>';
      A.app.querySelectorAll("[data-go]").forEach(function (b) {
        b.onclick = function () { var g = b.getAttribute("data-go"); location.hash = "#/otc" + (g === "otc" ? "" : "/" + g); };
      });
    }
    draw(null, null);
    if (!OTC) return;
    var liveCount = function (b) { var now = Date.now() / 1000; return b.orders.filter(function (o) { return o.open && o.expiry > now && o.giveLeft > 0n && !isDust(o); }).length; };
    var snap = savedBook();
    if (snap) draw(snap.mkt, liveCount(snap));
    loadBook(false).then(function (b) {
      if (A.isCurrent(id)) draw(b.mkt, liveCount(b));
    }, function () {});
  };
  A.start();
})();
