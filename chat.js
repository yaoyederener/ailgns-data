// 左下角机器人客服（2026-11-12 从右下角搬过来）：常见问题秒回；问得复杂时交给服务器上的 AI（/api/chat）；都答不了就引导找人工
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
    { k: ["极速预言家", "极速", "猜数字", "10分钟一期", "十分钟一期", "纯数字域名", "几张票"], q: "极速预言家怎么玩？", a: "⚡ 极速预言家正在试运行：☰ 更多 → 交易 → ⚡ 极速预言家（ailgns.dev/#/fast）。每 10 分钟一期，猜一个 0 到 9 的数字。票从哪来：自己注册一个纯数字的 .ailgns 域名，付多少 DAI 就得多少张票（5 DAI = 5 张），票记在付款的钱包上，续费不算，交给机器人代点注册的暂时不算；票可以存着以后用，用完就没了，域名还是你的。开奖：本期结束后链上第一个区块的哈希除以 10 的余数，谁都能自己核对。每张票 0.9 DAI 进本期奖池、0.1 DAI 是平台服务费，猜中的人按票数平分；没人猜中整个奖池滚到下一期。奖金只发 AiLGNS，按本站 OTC 价格折算，开奖后几分钟内自动转到下注的钱包。有输有赢，不保本，猜不中票就没了。规则可能随时调整，以页面为准。" },
    { k: ["麻将", "血流成河", "川麻", "房卡", "开房", "欢乐豆", "打牌"], q: "血流成河麻将怎么玩？", a: "🀄 血流成河麻将正在试运行：☰ 更多 → 销毁乐园 → 🀄 血流成河麻将（ailgns.dev/#/mj）。单机试玩不收费；和朋友开房要房卡，1 张 = 1 DAI（可用 DAI、AiLGNS 或 LGNS 付），1 张开 8 局，朋友加入不用房卡也不用钱包。房卡买了不退、不能转给别人；欢乐豆和桌上的积分只是记分，不能提现、不能转赠、不能兑换任何东西。规则可能随时调整，以页面为准。" },
    { k: ["域名", ".ailgns", ".lgns", "ailgns域名", "名字", "主名字", "注册域名", "怎么注册", "注册"], q: "怎么注册域名？", a: "顶部「域名」栏目可以注册 xxx.ailgns / xxx.lgns 链上名字（NFT，归你钱包）。设为主名字后，你的地址全站显示成这个名字。价格每年：英文 5 位以上 5 DAI、4 位 160、3 位 640；中文 3 字以上 5 DAI、2 字 50。可买 1–100 年，DAI / AiLGNS / LGNS 都能付，推荐 DAI 或 AiLGNS（一笔完成）。前 1 万个是🌟创世域名，永久编号。" },
    { k: ["续费", "到期", "宽限", "永久"], q: "域名怎么续费、到期怎么办？", a: "域名页「🔍 查询域名」输入你的域名，下面有续费框，可选 1/2/3/5/10 年或♾️永久。到期后有 90 天宽限期，只有原主人能续；过了宽限期任何人都能重新注册，记得提前续费。" },
    { k: ["销毁进行中", "销毁倒计时", "烧创世", "销毁创世", "领奖要烧", "创世销毁", "逾期不销毁"], q: "创世域名销毁是怎么回事？", a: "☰ 更多 → 链上身份 → 「🔥 创世域名销毁进行中」（ailgns.dev/#/genesis）：中奖领钱的人必须先永久销毁 1 枚创世名，烧自己手里的或去域名市场任意买一枚来烧都行（一枚只能抵一次奖，编号跟着名字走，买来的也算）；中奖后 3 天内不销毁视为放弃领奖，过期不补发。怎么烧：在那页点红色按钮「🔥 中奖的人点这里销毁领奖」→ 连钱包 → 选一枚 → 钱包确认，就是把它转进黑洞地址 0x…dEaD，只花一点 Gas；烧完机器人核对链上记录后发奖。" },
    { k: ["分红", "每日分红", "签到", "抽50", "抽 50", "分红计划", "分红倒计时"], q: "创世域名每日分红是什么？", a: "🎁 创世域名每日分红计划已公告、还没开启（☰ 更多 → 链上身份 → 🎁 创世域名每日分红，ailgns.dev/#/bonus）。1 万枚创世域名全部铸造完才开启，页面能看到还差多少枚。规则四条：① 钱包里至少 1 枚创世域名，1 枚 1 票；② 每天免费签到，随机抽 50 名；③ 域名注册费和续费的 30% 用于分红，发 AiLGNS，其它收入不动；④ 单次分红超过 10 DAI 要先销毁 1 枚普通域名才能领。页面上有按铸造速度估的实时倒计时，和「中签每人大约能分多少」的估算（只是估算，不是承诺）。现在还不能签到。⚠️ 规则可能随时调整，以页面最新显示为准。" },
    { k: ["创世", "编号", "创世域名"], q: "什么是创世域名？", a: "全站前 1 万个付费注册的名字是🌟创世域名，按链上注册顺序永久编号，编号跟着名字走（转让、卖出后还是这个编号）。在域名页「🔍 查询域名」输入名字就能看到编号。" },
    { k: ["lgns注册", "用lgns", "两笔", "少了", "注册没成功", "没注册成功"], q: "用 LGNS 注册域名扣了两笔 / 没成功？", a: "用 LGNS 付域名会分 2 笔扣：第 1 笔补 DEX 卖出税差价，第 2 笔才是注册费，中途关页面会只扣第 1 笔。别担心，差价已记在你的地址上，下次用 LGNS 注册自动抵扣，钱没丢。想省事请用 DAI 或 AiLGNS 付，一笔完成。需要核对请把钱包地址发给人工客服。" },
    { k: ["转赠", "转到大号", "转让域名"], q: "域名怎么转给别人？", a: "域名页「🔍 查询域名」查你自己的域名，点「🎁 转赠」填对方地址即可，免费，只付一点 Gas。想卖的话可以挂到域名市场（买家另付 3% 手续费）。" },
    { k: ["荣耀榜", "排行", "排名", "段位", "王者", "名人堂", "百万"], q: "荣耀榜怎么排名？", a: "顶部「荣耀榜」按本站 OTC 累计成交排名（单笔满 50 DAI 才算，买卖都算），有总榜和本月榜。前 50 名全站显示段位徽章（最强王者 / 荣耀王者 / 王者 / 星耀 / 钻石），月底前三进名人堂；累计满 100 万 DAI 送👑至尊 VIP，永久进「百万俱乐部」。" },
    { k: ["手续费", "费用", "收费", "1%", "抽成"], q: "手续费多少？", a: "AiLGNS OTC 成交手续费 1%，由吃单方承担，直接从收到的币里扣。挂单、撤单、到期退回都不收费。手续费写死在合约里，谁都改不了。" },
    { k: ["安全", "靠谱", "跑路", "骗", "资金安全", "审计", "托管"], q: "资金安全吗？", a: "挂单的币锁在智能合约里，不经过任何人的手：成交时付款和收币在同一笔交易里完成，要么都成功要么都不成功；到期没成交自动原路退回。合约没有管理员、不能升级，源码公开（OTC 页面有「开源源码」链接）。合约未经第三方审计，建议先小额试用。" },
    { k: ["怎么买", "买入", "购买", "吃单", "怎么成交", "我买", "想买", "我要买", "买不了", "买不到", "买ailgns", "买 ailgns"], q: "怎么买 AiLGNS？", a: "打开首页 AiLGNS OTC → 在「买入 AiLGNS」列表里挑一张 → 点「买入」→ 输入要买的数量 → 在钱包里确认（第一次会先授权 DAI）。成交后 AiLGNS 直接到你钱包。需要 Anubis 链上的 DAI 付款和少量 gasDAI 当手续费。" },
    { k: ["怎么卖", "卖出", "出售", "怎么挂单", "挂单", "发布", "卖不掉", "卖不出", "卖不了", "没人买", "没成交", "不成交"], q: "怎么挂单卖 AiLGNS？", a: "AiLGNS OTC 页面 →「发布挂单」→ 选「我要卖 AiLGNS」→ 填数量、单价、有效期 → 在钱包里确认。币会存进托管合约，有人买就自动成交，DAI 直接到你钱包；成交前随时可以撤单，到期没成交自动退回。" },
    { k: ["撤单", "取消", "取回", "退回", "过期", "到期"], q: "怎么撤单、把币取回？", a: "在 OTC 页面「我的挂单」里可以随时撤单，币马上退回。挂单多的可以一键批量撤：OTC 页「我的挂单」点「一键撤销全部」，或打开账本 ailgns.dev/#/scan/你的钱包地址 ，连上挂单的钱包，「在本站的事」里点「一键撤掉全部 OTC 挂单」（钱包不支持一次确认多笔时会连着弹，每张点一下确认即可）。设置的有效期（10 分钟到 30 天自选）到了还没成交，系统会自动把剩下的币原路退回给挂单人，不收任何费用。" },
    { k: ["有效期", "多久", "时间多长"], q: "挂单有效期多久？", a: "挂单有效期可以选 10 分钟、30 分钟、1 小时……一直到 30 天，也能自定义。到期没成交自动退回。" },
    { k: ["钱包", "连接", "metamask", "okx", "bitget", "tp", "tokenpocket", "imtoken", "打不开", "欧易", "点不进"], q: "支持哪些钱包、怎么连接？", a: "支持 OKX、Bitget Wallet、TokenPocket、MetaMask 等。手机上请在钱包 App 的「DApp 浏览器 / 发现」里打开 ailgns.dev，网站会自动识别钱包；电脑上需要装浏览器插件钱包。" },
    { k: ["网络", "链", "anubis", "rpc", "chainid", "加网络", "gas", "gasdai"], q: "Anubis 网络怎么加？", a: "OTC 在 Anubis 链上：Chain ID 6714，RPC https://rpc.anubispace.org，Gas 币是 DAI（gasDAI）。网站会自动帮你添加和切换网络，确认即可。" },
    { k: ["资金池", "储备金", "护盘", "护价", "缓冲池", "底池", "铸造池", "官方资金", "家底", "护盘资金", "护价池", "协议储备", "底池多少", "底池资金", "储备金多少", "家底怎么样", "缓冲池是", "储备金是", "护盘资金是", "护价池是", "铸造池是", "底池是"], q: "官方资金池在哪看？", a: "「官方资金池」页面免费给所有人看（会员 → 官方资金池，或直接打开 ailgns.dev/#/funds）：官方公布的 7 个资金地址（协议储备金、初始铸造池、护盘资金、缓冲池、护价池 ①②、底池）现在链上各有多少钱，约 5 分钟更新一次，每个池子有一句大白话说明，点地址能进账本看每一笔进出。页面顶部的总结是按链上数字自动算的，只是数据展示，不构成投资建议。" },
    { k: ["会员", "vip", "开通", "价格", "多少钱", "升级", "尊享", "初级", "高级"], q: "会员多少钱？", a: "会员两档：初级 VIP 20 美元等值，永久；高级 VIP · 尊享级 1000 美元等值，终生，多出导出全部数据和结构图每 5 分钟优先刷新。初级补 980 美元差价即可升级。可用 Anubis 链的 LGNS（按市价 50% 计，因为 Anubis 卖出扣 50%）/ AiLGNS，或 Polygon 链的 LGNS / DAI 付款，按实时价格折算。在「会员」页面用钱包开通。" },
    { k: ["结构图", "团队", "业绩", "等级", "p1", "p2", "查别人", "别人的地址"], q: "会员能查什么（团队结构图）？", a: "会员开在地址上：在会员中心填要开通的地址，用任何钱包转一笔专属金额（带零头），到账自动开通，不用连钱包、不用签名、不用授权。开通后可以查这个会员地址的「团队与等级」「团队新增业绩」和「团队结构图」，只能查会员地址本身。「钱包快查」和「资金流向」所有人都能免费用。" },
    { k: ["资金流向", "净流入", "净流出", "流入", "流出"], q: "资金流向怎么看？", a: "「资金流向」页面统计 AiLGNS/DAI 交易池每天的买入、卖出和净流入/净流出，页面顶部会直接告诉你今天是净流入还是净流出，所有人免费查看。菜单里已不再列出，直接打开 ailgns.dev/#/flows 还能看。" },
    { k: ["私钥", "助记词", "授权", "被盗", "钓鱼"], q: "会不会要我的私钥？", a: "本站绝不会向你索取私钥或助记词。只有开通会员、OTC 挂单和成交时，才会请你在自己的钱包里确认交易。任何以本站名义私聊要私钥、要转账的都是诈骗，请直接拉黑。" },
    { k: ["官方", "awake", "helix", "项目方"], q: "这是官方的吗？", a: "本站是 AWAKE HELIX 官方认证的 AiLGNS OTC 服务站。团队、等级等数据来自链上合约和官方公开接口。" },
    { k: ["没到账", "失败", "卡住", "报错", "失败了", "pending"], q: "交易失败 / 没到账怎么办？", a: "先看钱包里这笔交易的状态：如果是「失败」，币不会被扣（只花了少量 Gas）；如果一直「等待中」，通常是 Gas 不够或网络拥堵，稍等或加速。还解决不了的话，请把交易哈希发给人工客服核对。" },
    { k: ["盘口", "交易所", "专业版", "深度", "k线", "限价", "市价", "委托"], q: "交易所盘口在哪？", a: "☰ 更多 → 工具 →「📊 交易所盘口」（ailgns.dev/#/trade；LGNS 的盘口：OTC 页切到 LGNS 再点「盘口」，或 ailgns.dev/#/trade/lgns，LGNS 的 K 线还在接入中）：买卖盘深度 + K 线 + 一键买卖。限价 = 自己定价挂单（最少 50 DAI，免手续费）；市价 = 从最优价逐张自动吃单（手续费 1% 从收到的币里扣）。撮合还是原来的 OTC 托管合约，和普通版是同一批挂单。" },
    { k: ["账本", "链上查询", "浏览器", "查地址", "查交易", "钱不见了", "币不见了", "成交查询", "钱包快查", "看不见了", "不见了"], q: "怎么查地址和交易（账本）？", a: "☰ 更多 → 工具 →「📒 AiLGNS 账本」（ailgns.dev/#/scan）：输入域名、钱包地址或交易哈希，能看到余额、正在挂的单、借贷、预测和每一笔做过的事（都是中文人话）。觉得钱不见了，先在这里查地址，多半是币挂在 OTC 没成交或域名挂在市场里。" },
    { k: ["留言", "私信", "联系他", "对话", "发信", "给他留言"], q: "怎么给别人留言？", a: "在账本里打开对方的域名或地址页，点「💬 给 TA 留言」，写 200 字以内，钱包确认一笔 0 元转账（只花约 0.001 DAI Gas）就永久上链。只有注册了 .ailgns 域名并设为主名字的钱包才能发信；对方绑了 DeBox 会马上收到私信。留言是公开的，别写隐私。" },
    { k: ["我的单", "挂单", "查订单", "订单", "看不到", "成交了吗", "钱去哪", "哪里能看到", "在哪里可以看到", "在哪看", "成功了没", "买成功", "买的成功", "买到的"], q: "我的订单 / 买到的币在哪看？", a: "查订单最快的办法：打开账本 ailgns.dev/#/scan/你的钱包地址 ，「在本站的事」里列出你在所有市场的挂单、借贷、域名，写着币锁在哪、剩多久、怎么撤。也可以在任何页面顶部「📋 查我的订单」粘贴地址点查询。挂单在别的币种市场的，OTC 页要先切到那个市场才显示；到期的单币自动退回。" },
    { k: ["没有资格", "不能参加", "设主名字", "怎么设主名字", "没资格", "有没有设主", "主账户", "设主"], q: "提示没有资格 / 怎么设主名字？", a: "注册了域名还提示没有资格，九成是没设主名字。注册完页面会出现黄色框「第 2 步：设为我的主名字（免费）」，点它→钱包弹出→按确认，只付一点 Gas，设好马上能玩预言家。也可以到「域名」页点进自己的名字按「设为我的主名字」；预言家页连上钱包也会自动提示并给按钮。" },
    { k: ["为什么改封卷", "封卷时间", "下午 3 点", "早上 9 点", "为什么提前", "锁定 6 小时", "锁定 12 小时", "封单"], q: "预言家为什么改封卷时间？", a: "预言家 11 月 12 日起改为下午 3 点封卷、锁定 6 小时、晚上 9–10 点揭晓（11 月 10–11 日试过早上 9 点封卷锁 12 小时，大家反映太长）。为什么要提前封卷：AiLGNS 价格一直在稳步上涨、短时间内波动很小，封卷离揭晓太近的话，有人可以贴着现价用大量钱包批量下注，把奖金池掏空；为了保护真实参与的玩家，封卷后锁定一段时间再揭晓。随机揭晓时刻本身仍由链上区块哈希决定，谁都改不了。" },
    { k: ["官方做市商", "官方认证做市商", "官方做市", "绿色对勾", "✅"], q: "官方认证做市商是什么？", a: "名字后面挂「👑 官方认证做市商」的，是日均挂单资金 ≥ 1 万 DAI 的做市商（自动获得）或平台官方做市钱包，负责把盘口买卖铺平、让大家随时有单可吃。做市不发返佣，赚的是价差。他们的单和别人的单一样走同一个托管合约，吃单一样安全。想拿称号：☰ 更多 → 交易 → 做市商，用「批量挂单」铺到日均 1 万 DAI。" },
    { k: ["做市返佣", "返佣", "做市商", "做市", "返佣什么时候", "我的返佣"], q: "做市返佣还有吗？", a: "做市返佣规则已取消（试运行期间没有发放过）。现在做市只给称号：日均挂单资金 ≥ 1 万 DAI 自动获得「👑 官方认证做市商」，全站名字后显示；做市赚的是买卖价差。入口：☰ 更多 → 交易 → 做市商（ailgns.dev/#/lp），有「批量挂单」工具和「现在缺哪边」实时提示。" },
    { k: ["取消主名字", "取消主号", "解绑主名字", "不想当主名字", "换主名字", "主名字换成", "撤销主名字"], q: "怎么取消 / 更换主名字？", a: "取消主名字：域名页「🔍 查询域名」→ 点「👛 查我的钱包」→ 名单上方会显示当前主名字和「取消主名字」按钮，点它在钱包确认即可（不花钱，只付一点 Gas）。取消后地址重新显示成 0x…，不能玩预言家、不能发站内信，随时可再设。想换成另一个名字不用先取消，直接进那个名字的页面点「设为我的主名字」就会换过去。" },
    { k: ["ai推荐", "ai 推荐", "推荐域名", "哪个域名值得买", "值得买", "买哪个名字"], q: "AI 推荐域名是什么？", a: "域名市场有「✨ AI 推荐」（ailgns.dev/#/names 往下到域名市场，排序里点 ✨ AI 推荐）：AI 每小时从全部挂单里挑 20 个，只按寓意、稀缺（短名 / 创世早期号）、性价比三条看名字和价格，不看卖家，每个配一句理由。仅供参考，不构成投资建议，买不买自己定。" },
    { k: ["几次", "一次", "次数", "每个域名", "多个域名", "叠加", "抽奖", "抽一次", "猜几次", "多个名字"], q: "预言家每天能猜几次？", a: "预言家次数按主名字档位算：普通 1 次、中文 2 字 2 次、英文 4 位 3 次、英文 3 位 5 次；当天 OTC 成交满 50 DAI 再加 1 次；单钱包每轮最多 5 次。一个钱包每轮只认一个主名字，手里有多个域名不叠加，换主名字也不会多出次数。" },
    { k: ["中奖", "中了吗", "中没中", "中奖名单", "谁中了", "开奖", "揭晓结果", "中奖查询", "奖金到账", "奖金什么时候", "没收到奖金", "天眼通", "地灵通", "发奖", "提示中奖", "领奖"], q: "中奖了吗 / 奖金什么时候到？", a: "🔗 中奖查询：https://ailgns.dev/#/oracle/result （打开直接到「揭晓结果」：揭晓价、神算子 / 天眼通 / 地灵通 / 贡献王是谁、每人多少奖金、所有人的预测按远近排）。奖金自动发到获奖钱包，到账记录在账本 https://ailgns.dev/#/scan/你的钱包地址 能看到。中奖领钱要先销毁 1 枚创世名（3 天内），还没烧的在预言家页连钱包会有提示。" },
    { k: ["预言家", "猜价格", "揭晓", "神算子", "奖池", "预测", "预言", "怎么猜"], q: "预言家怎么玩？", a: "顶部「预言家」：免费猜当晚 AiLGNS 揭晓价（小数点后 3 位，一次填 1 个价格），下午 3 点封卷（11 月 12 日起；下午 3 点到晚 9 点锁定 6 小时，锁定期间提交的算下一期）、当晚 9–10 点随机一刻揭晓。资格：主名字是创世 .ailgns 域名，或 OTC 累计成交满 5 万 DAI（已公告：1 万个创世名注册满那天起，任何 .ailgns 主名字都能玩，普通名每天 1 次，创世名每天 1～5 次；参与人数超 1 万会改猜 4 位小数、超 10 万猜 5 位，提前一期公告）。有人完全猜中那天发奖：神算子 55%、贡献王 30%、天眼通 10%、地灵通 5%，奖金全部以 AiLGNS 发放。详细规则在页面「玩法规则」。" },
    { k: ["备用网址", "打不开", "被墙", "网址", "新网址", "网站地址", "官网"], q: "网站打不开 / 备用网址？", a: "主站 ailgns.dev；备用网址 ailgnsotc.com / ailgnsotc.net / ailgnsotc.org / ailgnsotc.cc / ailgnsotc.xyz，内容和数据完全一样，主站打不开换任意一个即可。" },
    { k: ["无法发言", "不能发言", "发不了言", "没法发言", "禁言", "发不了消息", "群里发言", "不让说话"], q: "群里发不了言怎么办？", a: "群里能不能发言是 DeBox 群自己的设置，网站这边看不到也改不了。发不了言不影响用网站：有问题直接在这里问我；要站长亲自看的，☰ 更多 → 合作与支持 →「📮 问题反馈」提交，站长会处理。" },
    { k: ["交流群", "加群", "群二维码", "社群", "群聊", "扫一扫", "扫码", "大群", "进群"], q: "怎么加交流群？", a: "网页右上角「💬 加 OTC 交流群」按钮（或 ☰ 更多 → 服务 → 加 OTC 交流群）会弹出群二维码，用 DeBox 扫一扫进群；手机长按保存二维码 → DeBox 扫一扫 → 相册选图。站长和机器人都在群里。" },
    { k: ["订单查询", "查订单", "我的订单", "成交查询", "查挂单", "查记录", "交易记录", "怎么查"], q: "怎么查我的订单？", a: "OTC、借贷、预言家、荣耀榜等页面顶部都有「📋 查我的订单」条：连过钱包会自动填你的地址，点 OTC / 借贷 / 域名 / 其他 → 查询，就跳到账本里对应分类，看正在挂的单、借贷、域名和每一笔成交记录。也可以 ☰ 更多 → 链上身份 → AiLGNS 账本，或直接输入别人的地址 / 域名查。" },
    { k: ["收件箱", "通知", "消息提醒", "站内信", "铃铛", "怎么收到通知"], q: "怎么收到通知？", a: "右上角 🔔 铃铛就是收件箱（☰ 更多 → 链上身份 → 收件箱）。用钱包签一次名（免费、不是交易，管 30 天），你在本站的每笔操作（挂单、成交、撤单、域名、借贷、兑换）几秒内就会有一条通知，别人和你成交、工单回复、预言家中奖、站长私信也都在里面，不用加任何社交软件。有新消息铃铛会变紫、显示红色数字，点开就算已读，数字自动清零。点「开启通知」新消息还会弹到桌面/手机。DeBox 机器人只是可选的附加提醒。" },
    { k: ["工单", "反馈", "提交问题", "投诉"], q: "怎么提交问题反馈？", a: "☰ 更多 → 合作与支持 →「📮 问题反馈」：填钱包地址、问题描述和截图提交，处理进度和客服回复在同一页「我的反馈进度」里看；绑定 DeBox 机器人的话回复会私信通知你。" },
    { k: ["aiswap", "兑换池", "swap", "流动性", "无常损失", "lp怎么赚", "做lp", "自动兑换", "自己的dex"], q: "aiswap 是什么？", a: "aiswap 是本站自己的自动兑换池（☰ 更多 → 交易 → aiswap），合约是 PancakeSwap V2 原版一行不改、没有管理员。每笔兑换手续费 0.25%：0.17% 归放币的人（LP）、0.08% 归平台；加撤流动性不收费。新币一律用 AiLGNS 报价；aiswap 不做 AiLGNS / DAI 兑换，手里是 DAI 先去 OTC 换成 AiLGNS，卖新币拿到的 AiLGNS 想变现也回 OTC。做 LP 会有「无常损失」（哪个币涨了池子会自动卖掉它一部分），不保本。已开放试运行：池子刚起步流动性少，大单滑点大，页面会显示价格影响，建议小额或分几笔，大额仍可用 OTC。" },
    { k: ["otc是什么", "什么是otc", "介绍一下otc", "介绍otc", "otc介绍", "介绍一下本站", "介绍一下网站", "这个网站是", "是干嘛的", "是做什么的", "是干什么的"], q: "这个网站是做什么的？", a: "AiLGNS OTC（ailgns.dev）是 AWAKE HELIX 官方认证的 AiLGNS 买卖服务站。卖的人把币挂出来，币锁在智能合约里，不经过任何人的手；买的人付 DAI，付款和收币在同一笔交易里完成，要么都成功要么都不成功。成交手续费 1%，由吃单方承担；挂单、撤单不收费，到期没成交自动原路退回。打开首页就能买入或发布挂单，建议先小额试。" },
    { k: ["误点", "误触", "挡住", "客服按钮", "隐藏客服", "收起客服", "关掉客服", "客服在哪"], q: "客服按钮挡手，怎么收起？", a: "客服按钮在屏幕左下角。嫌它挡手：点按钮右上角的小「×」，它会缩成贴在左边的「客服」小标签；需要时点一下小标签就回来了，手机会记住你的选择。" },
    { k: ["在哪输入", "在哪里输入", "怎么预言", "怎么参与", "参与没", "参与了没", "参与成功", "会付款", "要付款"], q: "预言家在哪填、要付钱吗、怎么知道参与成功？", a: "顶部「预言家」页：在输入框填 1 个价格（例如 831.462），点「🔗 上链预测」。这是给自己发一笔 0 元转账、把预测写到链上，只付约 0.001 DAI 的 Gas，本站不收任何费用；钱包里没 DAI 付 Gas 的，点下面的「用签名方式」免费提交。提交成功会显示「✅ 已提交」，页面上「我的预测」会列出你填的价格，看到就是参与成功了。提示没有资格的，最常见是没设主名字。" },
    { k: ["开心农场", "农场", "种菜", "金币", "养鸡", "母鸡", "偷菜怎么玩"], q: "开心农场怎么玩、要花钱吗？", a: "🧑‍🌾 开心农场：☰ 更多 → 销毁乐园 → 开心农场（ailgns.dev/#/farm）。用钱包签个名就能进（不是转账、不花 Gas，7 天内不用再签），新人送 200 金币和 6 块地，种菜、养鸡赚金币，还能去别人家偷菜。不充值也能玩，每天签到领 50 金币；想玩大一点可以用 Anubis 链的 LGNS 充值（10 LGNS = 1000 金币，第一次充值金币翻倍）。注意：金币只能在农场里花，换不回 LGNS 或别的币。" },
    { k: ["被咬", "被抓", "看门狗", "警察", "扣金币", "被罚", "罚了", "保底", "一键偷菜", "偷菜"], q: "偷菜被狗咬 / 被警察抓 / 保底是怎么回事？", a: "偷菜的规则：对方家有看门狗时，一半机会被咬（空手而归，赔对方 20 金币）；有警察时一定被抓（一颗也偷不走，罚 100 金币给农场主）。从外面看不出谁家有狗、有警察。扣的都是农场里的金币，不是钱包里的币。「去偷菜」页最上面的「🧺 一键偷菜」有保底：一轮下来要是净亏，系统把亏的补回到 0，每人每天最多补 100 金币；单独点「偷」不保底。每人每天最多偷 50 次。" },
    { k: ["归零", "清零", "等级归零", "农场等级", "等级没了", "等级掉了", "金币没了", "金币少了"], q: "农场的等级 / 金币不对了？", a: "农场里的金币会因为偷菜被狗咬（赔 20 金币）、被警察抓（罚 100 金币）而变少，这是正常规则。如果是等级或金币突然归零、和你记得的对不上：请到 ☰ 更多 → 合作与支持 →「📮 问题反馈」，填钱包地址、写清楚大概什么时候发现的、附上截图，技术人员会核对后台记录再回复你。" },
    { k: ["借贷", "借款", "借da", "借钱", "抵押", "出借", "还款", "利息", "加急"], q: "借贷怎么用（抵押借 DAI / 出借）？", a: "顶部「借贷」是点对点抵押借款，双向挂单：有 AiLGNS（或 LGNS）的押币挂单借 DAI；有 DAI 的挂出借单等人押币来借。借多少、押多少、到期还多少、借几天（1–90 天）都由挂单人自己填。挂了单要等对方来接，网站不撮合、没有加急通道；想快点成交，可以直接接别人已经挂好的单。接单时本金直接到借款人钱包，手续费是本金 1%、由出借人另付。还款不会自动扣：到期前自己到「借贷 → 我的借贷」点「还款」；到期没还，抵押币归出借人，没有宽限期。" },
    { k: ["没通过", "不通过", "加不进", "进不了群", "进不去群", "加不了群", "被拒", "被拒绝", "审核", "通过一下"], q: "加群没通过 / 进不了群？", a: "进群是在 DeBox App 里完成的，通不通过、要不要审核是 DeBox 群自己的设置，网站这边看不到也改不了。可以再试一次：网页右上角「💬 加 OTC 交流群」弹出二维码，用 DeBox 扫一扫（手机上长按保存二维码，再在 DeBox 扫一扫里从相册选图）。还是进不去也不耽误事：有问题直接在这里问我，或 ☰ 更多 → 合作与支持 →「📮 问题反馈」提交，技术人员都会看。" },
    { k: ["指导价", "定价", "价格怎么定", "卖价", "买价", "成交价", "价格不一样", "排后面", "排在后面", "差价", "单价", "价格不对", "价不对", "成交价格", "多扣", "多收", "成交"], q: "价格怎么定 / 成交价为什么不一样？", a: "OTC 的价格都是挂单人自己定的，网站不给指导价、不限制价格，单价框只提示当前 DEX 市价作参考。你吃哪张单，就按那张单上写的单价成交；另外手续费 1% 由吃单方承担，直接从收到的币里扣，所以把手续费算进去，实际到手的均价会和挂单价差 1% 左右。某一笔到底怎么成交的，打开账本 ailgns.dev/#/scan/你的钱包地址 能看到。觉得哪一笔不对，请到 ☰ 更多 → 合作与支持 →「📮 问题反馈」附截图。" },
    { k: ["不显示", "显示0", "显示为0", "余额不对", "余额没了", "看不到余额", "没有显示"], q: "余额 / DAI 不显示？", a: "先核对三件事：① 钱包当前网络是不是 Anubis 链（Chain ID 6714），AiLGNS OTC 用的 AiLGNS 和 DAI 都在这条链上；② 连接的是不是放币的那个钱包地址；③ 刷新页面再看一次。也可以打开账本 ailgns.dev/#/scan/你的钱包地址 ，直接看这个地址的余额和正在挂的单。还是对不上，请到 ☰ 更多 → 合作与支持 →「📮 问题反馈」附截图。" },
    { k: ["机器人", "debox机器人", "添加机器人", "绑定", "debox私信", "已绑定"], q: "DeBox 机器人怎么添加 / 绑定？", a: "收通知首选右上角 🔔 收件箱：钱包签一次名，通知自动进来，不用装任何软件。DeBox 机器人「Ailgns otc」只是附加可选：OTC 页和借贷页有「DeBox 私信」卡片，把你的钱包地址发给这个机器人，收到「已绑定」就好了，之后同样的通知会再私信一份；不绑不影响使用。" },
    { k: ["app", "下载", "安装", "桌面", "主屏幕", "应用商店"], q: "App 怎么下载？", a: "本站 App 不在苹果商店和安卓商店，是「把网站加到手机桌面」：打开 ailgns.dev/#/app（☰ 更多 → 服务 → 📲 下载 App），页面会认出你的手机和浏览器，一步步带着点。iPhone：用自带 Safari 打开 → 底部「分享」→「添加到主屏幕」→「添加」；安卓 Chrome：右上「⋮」→「添加到主屏幕」或「安装应用」。不下载安装包、不要权限、不会要私钥。" },
    { k: ["登录", "登陆", "登入", "注册账号", "账号", "密码"], q: "怎么登录？", a: "本站不用注册账号、没有密码，用钱包就行。手机上请在钱包 App（OKX、Bitget Wallet、TokenPocket、MetaMask 等）的「DApp 浏览器 / 发现」里打开 ailgns.dev，网站会自动识别钱包。本站绝不会向你要私钥或助记词。" },
    { k: ["买lgns", "卖lgns", "买卖lgns", "lgns买卖", "lgnsotc", "lgns市场", "polygon"], q: "这里能买卖 LGNS 吗？", a: "能。OTC 页的币种切到「LGNS」就是 LGNS 的场外市场（Anubis 链：ailgns.dev/#/otc/lgns；Polygon 链的 LGNS 在「更多币种」里：ailgns.dev/#/otc/plgns）。注意：LGNS 在 Anubis 链 DEX 卖出要扣约 50% 的税，所以场外 LGNS 的合理价本来就比 DEX 显示价低不少，挂单、吃单前自己核对一遍价格。" },
    { k: ["合约地址", "代币地址", "代币合约", "添加代币", "导入代币", "添加币种"], q: "AiLGNS 合约地址是多少？", a: "AiLGNS 代币合约地址（Anubis 链，Chain ID 6714）：0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB 。提醒：只认本站页面上给出的地址，别信私聊发来的地址；本站绝不会向你要私钥或助记词。" },
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

  // 关键词没对上（比如走香港中转线路时不调用 AI）：按字面相近（两个字一组）挑最像的 3 个问题给客户点，不替客户瞎猜答案（站长 2026-11-12：老回「建议联系人工」体验太差）
  function guess(q) {
    var t = norm(q), bg = [], i;
    for (i = 0; i < t.length - 1; i++) if (bg.indexOf(t.substr(i, 2)) < 0) bg.push(t.substr(i, 2));
    return FAQ.filter(function (f) { return f.a !== "HUMAN" && f.q; }).map(function (f) {
      var ks = norm(f.k.join("|") + "|" + f.q), s = 0; bg.forEach(function (b) { if (ks.indexOf(b) >= 0) s++; }); return { f: f, s: s };
    }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3);
  }

  // ---------- 界面 ----------
  var QUICK = ["怎么注册域名？", "怎么买 AiLGNS？", "怎么挂单卖？", "手续费多少？", "资金安全吗？", "会员价格", "联系人工"];
  var root, list, input, history = [];

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s，。）)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>"); }
  function humanHtml() { // 站长 2026-11-07：不写人工时间；先引导加群，再提交工单
    return '<a class="cb-human" href="#" data-group>💬 进 5000 人大群（群里 @客服，最快）→</a>' +
      '<br><a class="cb-human" href="#/feedback">📮 群里没解决？提交问题工单（附截图，技术人员按轻重缓急处理）→</a>' +
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
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) { var lk = "https://ailgns.dev/#/scan/" + q.toLowerCase(); reply("这是一个钱包地址。点下面的链接打开账本，能看到这个地址的余额、正在挂的单和每一笔做过的事：<br>" + linkify(lk) + "<br>想问别的，直接打字告诉我遇到了什么问题。", "这是钱包地址，给了账本链接 " + lk); return; }
    if (/^(你好|您好|在吗|在不在|有人吗|哈喽|嗨|hello|hi)(啊|呀|哦|吗|在吗|客服|[!！。.~，,？? ])*$/i.test(q)) { var hi = "你好！直接打字说你遇到的问题就行，比如：怎么买 AiLGNS、怎么注册域名、订单在哪看、预言家怎么玩。说得越具体（在哪个页面、提示了什么字），我答得越准。"; reply(hi, hi); return; }
    if (/^(好的|好滴|ok|okay|嗯+|哦+|收到|谢谢|感谢|多谢|明白|知道了|懂了|可以了)(了|啊|呀|的|哦|啦|你|您|谢谢|感谢|[!！。.~，, ])*$/i.test(q)) { var ty = "不客气！还有别的问题，随时在这里问我。"; reply(ty, ty); return; }
    var f = faq(q);
    if (f && f.a === "HUMAN") { reply(humanHtml(), "已为你提供人工联系方式"); return; }
    // 简短的常见问题直接秒回；带疑问语气或较长的问题（「抽奖是不是每个域名都可以抽一次么」）关键词容易套错，交给 AI 按知识库答（站长 2026-11-09）
    if (f && f.score >= 4 && q.length <= 12 && !/是不是|能不能|可不可以|可以|为什么|怎么办|几次|几个|多少次|一次|吗|么|呢/.test(q)) { reply(linkify(f.a), f.a); return; }
    var wait = add("bot", '<span class="cb-typing"><i></i><i></i><i></i></span>');
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 30000); // 服务器最多重试 3 次，给够时间
    withCtx().then(function (c) { return fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-8), a: walletA, ctx: c }), signal: ctl ? ctl.signal : undefined }); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        clearTimeout(timer);
        wait.remove();
        if (j && j.answer) { reply(linkify(j.answer) + (j.human ? "<br><br>" + humanHtml() : ""), j.answer); return; }
        if (f) { reply(linkify(f.a), f.a); return; }
        var g = guess(q);
        reply((g.length ? "我没完全看懂，你是想问下面哪个？点一下就行：" + '<div class="cb-guess">' + g.map(function (x) { return '<button type="button" data-i="' + FAQ.indexOf(x.f) + '">' + esc(x.f.q) + "</button>"; }).join("") + "</div>" + "都不是的话，" : "这个问题我暂时答不好，") + "可以直接问人工：<br>" + humanHtml(), "问答库没对上，给了相近问题，建议联系人工");
      });
  }
  var GRP = '<div class="cb-grp"><a href="#" data-group>💬 欢迎进 5000 人大群，和大家交流心得 →</a></div>'; // 每条回复都带进群入口（站长 2026-11-09 晚）
  function reply(html, plain) {
    add("bot", html + (/data-group/.test(html) ? "" : GRP));
    history.push({ role: "assistant", content: plain });
    forward(plain, /人工/.test(plain));
  }
  // 每次咨询（问题 + 回答）转发到站长指定的 DeBox（后台 /api/chat-log），人工能看到客户在问什么
  var SID = (function () { try { var k = "cb:sid", v = localStorage.getItem(k); if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(k, v); } return v; } catch (e) { return "anon"; } })();
  // 客户连过钱包：把他的地址和「正在进行中」一起交给机器人和人工，回答「我的钱呢」这类问题不用他自己去查
  var walletA = null, ctxCache = { at: 0, v: [] };
  function wallet() { if (walletA || !window.AIL || !window.AIL.wallets || !window.AIL.wallets.silent) return Promise.resolve(walletA); return window.AIL.wallets.silent().then(function (a) { walletA = a ? String(a).toLowerCase() : null; return walletA; }).catch(function () { return null; }); }
  function withCtx() {
    return wallet().then(function (a) {
      if (!a || !window.AIL.myPositions) return [];
      if (Date.now() - ctxCache.at < 60000) return ctxCache.v;
      return Promise.race([window.AIL.myPositions(a), new Promise(function (res) { setTimeout(function () { res([]); }, 5000); })]).then(function (v) { ctxCache = { at: Date.now(), v: v || [] }; return ctxCache.v; });
    }).catch(function () { return []; });
  }
  wallet();
  function forward(answer, human) {
    var q = history.filter(function (m) { return m.role === "user"; }).slice(-1)[0];
    if (!q) return;
    try {
      fetch("/api/chat-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: walletA, q: q.content, a: String(answer || "").slice(0, 600), page: location.hash || "/", sid: SID, human: !!human }), keepalive: true }).catch(function () {});
    } catch (e) { /* 转发失败不影响聊天 */ }
  }

  // 人工回复：站长在 DeBox 里直接回机器人，网页每隔几秒拉一次（窗口开着 5 秒、关着 30 秒），显示成「人工客服」气泡；窗口关着时客服按钮亮红点
  var lastReply = 0, pollTimer = null;
  try { lastReply = parseInt(localStorage.getItem("cb:last") || "0", 10) || 0; } catch (e) { /* 忽略 */ }
  function poll() {
    fetch("/api/chat-reply?sid=" + SID + "&after=" + lastReply).then(function (r) { return r.json(); }).then(function (d) {
      (d.replies || []).forEach(function (r) {
        lastReply = Math.max(lastReply, r.t);
        add("human", '<span class="cb-tag">人工客服</span>' + linkify(r.text));
        history.push({ role: "assistant", content: "[人工] " + r.text });
        if (root.querySelector(".cb-panel").hidden) root.querySelector(".cb-fab").classList.add("cb-new");
      });
      try { localStorage.setItem("cb:last", String(lastReply)); } catch (e) { /* 忽略 */ }
    }).catch(function () {}).then(schedule);
  }
  function schedule() {
    clearTimeout(pollTimer);
    var open = root && !root.querySelector(".cb-panel").hidden;
    pollTimer = setTimeout(poll, open ? 5000 : 30000);
  }
  function build() {
    root = el('<div class="cb" id="cb">' +
      '<button class="cb-fab" aria-label="在线客服"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor"/><circle cx="9" cy="9.6" r="1.2" fill="#7027d9"/><circle cx="12" cy="9.6" r="1.2" fill="#7027d9"/><circle cx="15" cy="9.6" r="1.2" fill="#7027d9"/></svg><span>客服</span></button>' +
      '<button class="cb-hide" type="button" aria-label="收起客服按钮">×</button><button class="cb-tab" type="button" aria-label="展开客服按钮">客服</button>' +
      '<section class="cb-panel" hidden aria-label="在线客服">' +
      '<header class="cb-head"><b>AiLGNS 客服</b><button class="cb-x" aria-label="关闭">×</button></header>' +
            '<div class="cb-list"></div>' +
      '<form class="cb-form"><input placeholder="输入你的问题…" maxlength="300" autocomplete="off"><button type="submit">发送</button></form>' +
      "</section></div>");
    document.body.appendChild(root);
    list = root.querySelector(".cb-list");
    input = root.querySelector(".cb-form input");
    var panel = root.querySelector(".cb-panel"), fab = root.querySelector(".cb-fab");
    function toggle(open) {
      panel.hidden = !open;
      root.classList.toggle("open", open);
      if (open) fab.classList.remove("cb-new");
      // 站长 2026-11-08（工单 #33）：打开窗口先打招呼，第一件事引导加群（最快有人回）；只显示一次，不算进对话
      // 站长 2026-11-09 晚：开场先说「有问题发我」，再欢迎进 5000 人大群；很多人进群问的都是客服能答的简单问题
      if (open && !list.children.length) add("bot", '您好 👋 我是 AiLGNS 客服。<br><b>有任何问题直接发给我，我来帮你解决。</b><br>另外欢迎进入 <b>5000 人大群</b>，和大家交流心得：<br><a class="cb-human cb-hi" href="#" data-group>💬 点这里进 5000 人大群 →</a>');
      schedule();
      if (open && matchMedia("(min-width: 601px)").matches) input.focus();
    }
    fab.onclick = function () { toggle(panel.hidden); };
    // 站长 2026-11-12（工单 #136，很多客户说老误点）：按钮移到左下角；右上角的 × 把它缩成屏幕左边一个小耳朵，点小耳朵再放出来；记住客户的选择
    try {
      var MINI = "cb:mini", mini = function (on) { root.classList.toggle("mini", on); try { if (on) localStorage.setItem(MINI, "1"); else localStorage.removeItem(MINI); } catch (e) { /* 无痕模式 */ } };
      root.querySelector(".cb-hide").onclick = function (e) { e.stopPropagation(); mini(true); };
      root.querySelector(".cb-tab").onclick = function () { mini(false); };
      try { if (localStorage.getItem(MINI)) root.classList.add("mini"); } catch (e) { /* 无痕模式 */ }
    } catch (e) { /* 收不起来不影响客服本身 */ }
    if (window.AIL) window.AIL.chatOpen = function (q) { toggle(true); if (q && input) { input.value = q; input.focus(); } };
    // 从 App 壳页带问题过来：?chat=问题 → 打开窗口直接问
    try { var cq = new URLSearchParams(location.search).get("chat"); if (cq) { setTimeout(function () { toggle(true); ask(cq); }, 600); } } catch (e) {} // 别的页面一键呼出客服（预言家弹幕旁的「在线客服」）
    root.querySelector(".cb-x").onclick = function () { toggle(false); };
    // 窗口里点站内链接（提交工单等）：先把客服窗口收起来，不然手机上全屏的窗口把页面盖住，客户以为没反应（站长 2026-11-08 反馈）
    panel.addEventListener("click", function (e) { var gq = e.target.closest("[data-i]"), gf = gq && FAQ[+gq.getAttribute("data-i")]; if (gf) { add("me", esc(gf.q)); history.push({ role: "user", content: gf.q }); reply(linkify(gf.a), gf.a); return; } if (e.target.closest("[data-group]")) { toggle(false); return; } var a = e.target.closest('a[href^="#/"]'); if (a) { toggle(false); if (location.hash === a.getAttribute("href")) { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (x) {} } } });
    root.querySelector(".cb-form").onsubmit = function (e) { e.preventDefault(); var q = input.value; input.value = ""; ask(q); };
    poll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
