// AiLGNS 账本（2026-11-05 起）：只服务本站的中文链上记录。搜域名 / 地址 / 交易哈希，每一笔翻译成一句人话（买入、卖出、挂单、注册、借贷、转账…）
// 链上数据借用 Anubis 官方浏览器（Blockscout）的公开接口；区块、Gas、日志这些统统不显示
(function () {
  "use strict";

  var A = window.AIL, W = A.wallet;
  var WEB = "https://browser.anubispace.org";
  var NAMES = { ailgns: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", lgns: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3" };
  var SEL = { resolve: "0x461a4478", nameOf: "0xf5c57382", idOf: "0x5fd846f2", expires: "0xcb52c823", ownerOf: "0x6352211e" };
  var METHODS = { // 常见方法的中文名（我们的合约没在官方浏览器开源验证，它显示不出名字）
    "0xd868a84f": "注册域名", "0x26e43e37": "续费域名", "0x38e74feb": "设主名字", "0xeba36dbd": "改指向", "0xa9059cbb": "转账", "0x095ea7b3": "授权",
    "0x23b872dd": "转移", "0xca690ea2": "挂单卖", "0xd6febde8": "买", "0x40e58ee5": "撤单"
  };
  var ZERO = "0x" + "0".repeat(40);
  // 平台自己的合约：直接显示中文名，客户一眼看懂钱去哪了
  var KNOWN = {};
  KNOWN[ZERO] = "🆕 新注册";
  var DEAD = "0x000000000000000000000000000000000000dead"; KNOWN[DEAD] = "🔥 黑洞地址（永久销毁）";
  // 🔒 团队运营地址（站长 2026-11-07：维护团队隐私，账本里统一显示为「运营维护」，不展示明细）
  var TEAM = {};
  ["0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", "0xeee877c1b6285b82890bdcd027d2715f658ecf23", "0xcc274e07847a6a86917b6ccd4e67706170d4036f",
   "0xd53a00bb90bb606f10d888419a14eca779f17285", "0xe8782615e32557f257dd88d70b1eb0d7f47b91c3", "0x5505d382bf5d705c5d3ec0cbfc17a3dde394b322",
   "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", "0x06cc2a46d7ad17496c2de9c61362808e06b44437"].forEach(function (x) { TEAM[x] = 1; KNOWN[x] = "🔧 运营维护"; });
  KNOWN["0x06cc2a46d7ad17496c2de9c61362808e06b44437"] = "🤖 官方做市机器人"; // 站长 2026-11-17
  /* ⚠️ 涉嫌盗号的钱包（站长 2026-11-24，工单 #429）：全站显示成警告，域名市场不展示它们的挂单。名单要和 lib/flagged.js 一致 */
  var FLAG = {}, FLAG_NAME = "⚠️ 涉嫌盗号钱包";
  ["0x63bd82a6b92baaf35aa21ab9aebbc22d56656069", "0xc5e29a77f8c5d800f9ef43df137fcb54b1503b2e"].forEach(function (x) { FLAG[x] = 1; KNOWN[x] = FLAG_NAME; });
  A.FLAG = FLAG; A.FLAG_NAME = FLAG_NAME;
  KNOWN["0xdcc5354175d60ffc8364e71e792fcd66366f00fe"] = "OTC 自动撮合合约";
  KNOWN["0xf09b0cd8bd6ed6fa528284f53fc8e9df753b62de"] = "🏆 OTC 商户奖金池"; // 站长 2026-11-15：手续费周榜的奖金钱包，账本里统一叫这个名字
  KNOWN["0x6ec474047a6c12d0cab53855a990c1c8b3996c20"] = "OTC 批量扫单合约";
  KNOWN["0xb6a7a3be9a17ad241665ab9bddbd9a573d488818"] = "LGNS OTC";
  KNOWN["0x4e730be6d46be71223ded5a32dc45799f6d4bc15"] = "AiLGNS OTC";
  KNOWN["0x2b0ab121d60f823fffc4cef75af26055df388e2b"] = "gLGNS OTC";
  KNOWN["0x0fddaa1a312699b2ae43e2b43d8f7595087e21d0"] = "RM OTC";
  KNOWN["0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c"] = "像素墙 / 游戏";
  KNOWN[NAMES.ailgns] = ".ailgns 域名合约";
  KNOWN[NAMES.lgns] = ".lgns 域名合约";
  KNOWN["0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e"] = ".ailgns 域名市场";
  KNOWN["0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d"] = ".lgns 域名市场";

  /* OFFICIAL-BEGIN 官方合约名单（站长 2026-11-25：账本里把官方合约标出名字）。取自两个官方站自己的前端代码：
     anubis.origindefi.io（LGNS）和 awakehelix.io（AiLGNS），每个地址都在链上核过。官方改了合约要重新生成（脚本见 站长备忘 / 记忆 project-ledger-upgrade） */
  var OFFICIAL = {
    "0xf7e78f731dcdaa18a9a1cbeac6e73590e1128cc4": "官方账户 Accountant",
    "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb": "AiLGNS 代币",
    "0x39ba6313f3c59cac5611b8cf308d084551e9d60f": "AiLGNS/A 池子",
    "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0": "AiLGNS/DAI 池子",
    "0xbfaae809c1803ec4ae73a506309b3036c48d65a8": "AiLGNS/gLGNS 池子",
    "0xc5029d6e80d2fdce321b2b51010e9ce3b1edf1a2": "AiLGNS/LGNS 池子",
    "0x8a36a456e95cd55ea8cbd79ccc798fd1f716db68": "AiLGNS/USDT 池子",
    "0xa921267c56b3a57696d6fd7949c9fad0a8e0c177": "A 代币",
    "0xda24d74aa53c68911648b90a23517f8a92d3e730": "A/DAI 池子",
    "0xb39d8759d59592363395e4c66a3d4e4acc9bc09d": "销毁 NFT 工厂",
    "0x70a7e5e20b4f416e802c2297be7ac229467ef788": "官方账户 Burn Queue",
    "0x616799578b7a9fcff46b6519c2460d07fba8cfd3": "社区基金",
    "0x3deea5f638ca0dfb03a0873cf4c0b90ba50e1aa2": "社区金库",
    "0x2e0d9d461a1b567112a9b824d939fb583853daa7": "每日结算",
    "0x621e693a002f13fc0d87fdcd00de2c8bafceed04": "DAI/USD 预言机",
    "0x0645460f6f485153775154451fe1322fdbb2233c": "生态储备",
    "0x6aab661e1a99b20d1dae581ab0e1250e6f753a19": "排放计划",
    "0x6c5352e15a8327c3f44898fe220100edc2989c58": "纪元时钟",
    "0xaf6f4e641c86a25518509bc840051a8652af598a": "池子工厂",
    "0x7088e192b9b7f41a07bb3f79378e13454d8a80d5": "手续费归集",
    "0x6ee8344ae4785af3099b3dc5e603d88babce0ecb": "官方账户 Fundraise Importer",
    "0xb8bc3c6b90aadd9aff393ecb4297b7fd6876f510": "Gauge 健康度",
    "0x5ddc8a13eabda89593beb885ab8b2afda26a3587": "流动性池 LP 质押",
    "0x8b52b9e85f7ce788c2c141cc2eb98965c705abb0": "Gauge 登记",
    "0xdb752f219a79c8d9d6f6674e5ea295c2c5431d1f": "Gauge 金库",
    "0x81a42a20f754dbecf7aee69685d844a880dea618": "Gauge 投票",
    "0x1a5007a65610b1b55c0d78626b0b7fe1c590feec": "治理激励金库",
    "0x2628aad0b92e319d444b40201a96487fc6f6555d": "官方账户 Health Feeder",
    "0x0527935979d10685b8571fa02a8dedbd6f3024e3": "Helix 路由（添加流动性）",
    "0x22841307af7e663f8ce784230c8f8e10a46888cf": "保险金库",
    "0x9fafb6998eac3bc221da7b26d70373533b312914": "官方账户 Keeper",
    "0xa4e362201f74a9ea4f227b941026ce6c9397c196": "LFEO",
    "0xf61c45b0e63623231a874f2a2df03bf9f6abad9f": "官方账户 Lfeo Syncer",
    "0xb975fd9b03ff440d6a43a52a7f072154cb520a4b": "LGNS 销毁入口",
    "0xf73d1c309ea87a0bf8b6896d49349321242061ab": "官方账户 Lp Airdrop Distributor",
    "0xf0e9ec153f68bfa2fc8c76165db2b80579dcb217": "LP 空投金库",
    "0x732e959fed889626686f9fbe57233fe32b771963": "价格预言机",
    "0x8da328455407aba25e46b4bc270672e208b4eda1": "官方账户 Oracle Updater",
    "0x825d1b92d9cb744c9583999b6f57893e96d9b9c7": "POL 金库（协议自有流动性）",
    "0x9e68f61e2615cc1d2c4a2d0026bfc1ebfdf68c1b": "Power 账本",
    "0xa69a60b8d97d43031c00f16742eb6989553796fc": "Power 账本查询",
    "0x9120720b1bfd3e06fd5295fa2b4182859d178e30": "官方账户 Pp Admin",
    "0x18f46e10cc82fd4dc8fcd7844170f871cc87ce78": "官方账户 Pp Keeper",
    "0x2c36beff699ba473d7bb0eb829d1fe723eeed963": "价格平衡执行",
    "0x915527db1ac1444c454346f6076381a0b75c5a2c": "价格保护金库",
    "0x77e6ab1c5557fd456b0656304e0e5c02a6d7dcca": "生产 NFT",
    "0x27cb55ee75e777ff972b74b6e68782d12bd4ec46": "协议储备",
    "0xb16325f0565a2d83031735a7ac6495b5bc72e422": "风控合约",
    "0x99d9bd14dbd760785acfd8f816c0348f0e88fe60": "官方账户 Risk Feeder",
    "0x156befcce20fa219caa5bc31b67909337ba41efd": "机器人参数时间锁",
    "0xf7cdc210aea57ebdb6cb3e53e1526bea31c0c3a6": "官方账户 Robot Treasury",
    "0xd56603bbe579ebf742cebdbca3af2c69f8152233": "机器人升级时间锁",
    "0xf55f487df255c41a5d40c14faa917ffda8d7defd": "官方账户 Root Finalizer",
    "0xefcba560a18210a2c7103a09ddcd24a5fde5afda": "卖出手续费转换",
    "0xe925d91d226f2c2a8cf357f421582b25738d9e97": "官方账户 Token Initial Fee",
    "0xe98f3366ac45a799531e5e779079b364fabccc00": "官方账户 Token Operator",
    "0xe884a336550a4482ca6a17a3f93aa30ed4ed9bad": "Helix 涡轮",
    "0xdfb6a28bc6dc51fed17c27c880f2c66cdd040a3e": "USDT 代币",
    "0xf14c0e3da42fc36a416e6036dc4c7ca0375b734f": "USDT/DAI 池子",
    "0x52d7f7745d4ba3de6c3a0b503815878aee7edf14": "veAiLGNS 投票权",
    "0x853aa8e3a3c55d7124c0f8bc2cca826645fb0f15": "记账合约",
    "0x31fe4354218e387a236c531c5ccee8149474e773": "活跃积分销毁",
    "0x1e5feec473f7f445fc7f5feec0beabb2270b0b4e": "活跃积分质押",
    "0xebd08fa8768c366fcccd8130aa3c0b35dc50f9a6": "聚合器",
    "0x58839f46bd0e3f4494e2beb8ca93da9352208615": "AWAKE NFT 卡牌",
    "0xf190ab12b73bfe1b626379af96e8f1859ec91f20": "债券质押",
    "0x4d47845750185bc654da1a6a571e5a13e6506929": "官方跨链桥",
    "0x11b10c9827c5b7071e96fcaa143b4e6e86b17c69": "销毁债券",
    "0x3f403751975e1eb06d95901f7ff246513444e71f": "销毁债券（固定）",
    "0x6170743b440696e17c9c0dbc551e0b8c010694d8": "销毁债券奖励发放",
    "0xf7a0cacdf0810609ee5618247c4121b799e41664": "蛛网奖励发放",
    "0xc9f9a8a2dbf8188ad6610e0239105cabe67c4993": "社区合约",
    "0x943c6462d9a5a3ccadc12ef6ad34b9518e6128f6": "贡献积分",
    "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14": "DAI",
    "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d": "gLGNS/DAI 池子",
    "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0": "LGNS/DAI 池子",
    "0x579a71890ae0e99806f75cd2e006bb07559c3b49": "DAO 发放",
    "0xcaf7a121ae9a36606caee1e177797143a2a5c777": "DAO 投票",
    "0x5584cdeb1369673c91c6ad7ebea0ce7cb630ce60": "折扣质押",
    "0x030590921e9841e1d2104642ed285c83b5f0ddb5": "募集合约",
    "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c": "gLGNS 代币",
    "0xac9e27714266766ab0a6908c6ccd899e7f90108f": "gLGNS 线性释放",
    "0xa3007b26b64f0f43b56c8c67a12917faab02fc42": "治理 NFT 铸造",
    "0x5e6d77f8071642561c999e97c1022108b8d5de57": "IDO 账本",
    "0xb4e5b7665186229d8a5b0ba3706c5c119dd1b47b": "指数预言机",
    "0xf7788f5a5cbbafac4120c63c79dcd9f1931c7824": "即时质押",
    "0x8c6c69d640a392645ebcd021d3bfd8dd177ccefb": "Kopek",
    "0x4d1d808a081fdac440703b3765fc61f8028c06b8": "LGNS 代币",
    "0x4ff8e905ab40ed18355b0b2c0dfae8213d5d8d90": "LGNS ILO",
    "0x88ea98af226cd4402a3873400308a4d78784ece6": "长期质押 360 天",
    "0x04ed22c6d1d020a9b5e032e93d79ab28293ef72f": "长期质押 600 天",
    "0x6d59827207b1e9ca32ea9b6247270a0e7023d9a9": "抽奖",
    "0x0664f1369209677fecb279f5ec3df1e53a22212e": "新涡轮",
    "0x229e0aa54ebcfd887a1c06bc649ad1afca87486a": "新涡轮 4x",
    "0x8250f8eeaae5b6e21043fbd8c61c70e1b0906109": "新涡轮（社区）",
    "0x71b514b8d08f61e39e24442c2fc83297584c1dd6": "新涡轮社区发放",
    "0xbe1eca1b4cb8aef5055feb146e1f9285167fb0e2": "推广 Kedi",
    "0x2243ae29f73137d678197b61b0621ae942845b8c": "sLGNS（质押凭证）",
    "0x7a2e3fa6ea60437f0441b8eb5e60674b80339228": "LGNS 质押",
    "0x3e412e02b6157fbe80b6c6697f3ce1142e629019": "兑换路由（DEX）",
    "0x92b53785090f6fe0717ca3cf5db8f8040d3b070b": "涡轮"
  };
  /* OFFICIAL-END */
  // 官方的：KNOWN 里还没有名字的才补（本站自己起过名的不动）。A.OFFICIAL 给别的页面用
  Object.keys(OFFICIAL).forEach(function (x) { if (!KNOWN[x]) KNOWN[x] = "🏛 官方 · " + OFFICIAL[x]; });
  A.OFFICIAL = OFFICIAL;
  // 本站自己部署的合约（lib/addresses.js 里 k: "contract" 的那些）：授权清单里高亮「本站合约 · 安全」。新部署合约要同步
  var OURS = {}; "00e674bb1559557966a6c2244c36d12a63218a5f 0fddaa1a312699b2ae43e2b43d8f7595087e21d0 242ab392571d325d814a48892ac16115a6d285dc 2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d 2b0ab121d60f823fffc4cef75af26055df388e2b 4060f38d3e837843b69014d9f85ecfb3e29fa2db 431c87b1ec15cb955c60262bd4d2ce798281e501 439cb33e9c5d7a26dd1fa503efe6fd3033ac173b 477abc5b8f2de7bf50e0728a44707ca0c670a982 4e730be6d46be71223ded5a32dc45799f6d4bc15 6ec474047a6c12d0cab53855a990c1c8b3996c20 7bf0cf0e4fcdaef1d3173843a16e4b5d2347784e 8c67912b3ed44f4512c2f22b7b2263f6659396ed 8d84d678d195e770caad263d1c37967ec796165c 93af23fe74e5180f54f0996fa6bb6c157775f7f3 99f47ca8e7ed873e01a337aefc5b75f5328d2da3 b6a7a3be9a17ad241665ab9bddbd9a573d488818 bc408e9d7350967e7247c917a086cb4ece0ed988 c5da7d212aad698008d2bf6004aca2ee352a6723 cb3670db84ec9e9dd8c9f341e461c29e4e789a7e cc274e07847a6a86917b6ccd4e67706170d4036f dcc5354175d60ffc8364e71e792fcd66366f00fe eee877c1b6285b82890bdcd027d2715f658ecf23 f1d45cfbcd430d5e90cc5fa25e8958cc3c798abe f1fb8f098979dc29a3020070ac93ef24f1b2ca4c feeaa5f8a104836d15b492399b2ea587a41c4771".split(" ").forEach(function (x) { OURS["0x" + x] = 1; });
  // 本站自己的合约 / 钱包，和已经登记过的第三方（池子、跨链桥路由等）：只用来判断「认不认识」，不显示名字。和 lib/addresses.js 同步（tools 里重新生成）
  var REG = {}; "0000000000000000000000000000000000000000 000000000000000000000000000000000000dead 0000000000000000000000000000000000a11905 00e674bb1559557966a6c2244c36d12a63218a5f 06cc2a46d7ad17496c2de9c61362808e06b44437 0fddaa1a312699b2ae43e2b43d8f7595087e21d0 16b309670cfc6e855d1def7ee55e395827e8a869 1af3f329e8be154074d8769d1ffa4ee058b1dbc3 21425f852a1e0fb798fb9ebeb288def27bc0f2d1 242ab392571d325d814a48892ac16115a6d285dc 2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d 2b0ab121d60f823fffc4cef75af26055df388e2b 2e045e1380f5f5b6e7550328910a7377c9fce59d 3b528845f03a46016bed5f1b9178707b7ac277bb 3c499c542cef5e3811e1192ce70d8cc03d5c3359 4060f38d3e837843b69014d9f85ecfb3e29fa2db 41fd86243836b698405554ae311d223dec7e3552 431c87b1ec15cb955c60262bd4d2ce798281e501 439cb33e9c5d7a26dd1fa503efe6fd3033ac173b 477abc5b8f2de7bf50e0728a44707ca0c670a982 4e730be6d46be71223ded5a32dc45799f6d4bc15 5505d382bf5d705c5d3ec0cbfc17a3dde394b322 55d398326f99059ff775485246999027b3197955 57b515c5cc7fe248b5ab32b6ef461a914020723f 589b441a19fdfd28aee5e57891a842e96d91de31 5daf3a821b562cc4131e37ac501e6b79a8dfc4c1 6131b5fae19ea4f9d964eac0408e4408b66337b5 6a000f20005980200259b80c5102003040001068 6b175474e89094c44da98b954eedeac495271d0f 6c18c9226c30bd3057b9606ba5b506efd4c2506a 6ec474047a6c12d0cab53855a990c1c8b3996c20 701876eb1b6cea82774f7041e092f7740624af81 7bf0cf0e4fcdaef1d3173843a16e4b5d2347784e 7dd9c7cbc32df500fa3c06fd60cd62c4e97b2eef 85ff1e15cabca867f244b9c2465227477f251972 8610bf581b1c10cb7d372f93b8cdcde382a7c1d1 882df4b0fb50a229c3b4124eb18c759911485bfb 8932fe7726c1ee743f662f485c3e5a5d1d595f71 89dd06754bb239b6c4c92bc47c8fa72889084e27 8ac76a51cc950d9822d68b83fe1ad97b32cd580d 8c67912b3ed44f4512c2f22b7b2263f6659396ed 8cbabf4e076baaad295fd32b3249e7f9d812b9c5 8d84d678d195e770caad263d1c37967ec796165c 8f3cf7ad23cd3cadbd9735aff958023239c6a063 93af23fe74e5180f54f0996fa6bb6c157775f7f3 98dc516992437ad3c750bc7fd9916624599c324c 99f47ca8e7ed873e01a337aefc5b75f5328d2da3 a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 a2c1ec79872d2c961cbd33ef750659e3b2439647 ab907917d541313e2ded546f39912c6d508c04f1 ae5a079ad9b76703d5e3950f3375b4d5fdd5f2ab b6a7a3be9a17ad241665ab9bddbd9a573d488818 bc408e9d7350967e7247c917a086cb4ece0ed988 c2132d05d31c914a87c6611c10748aeb04b58e8f c5da7d212aad698008d2bf6004aca2ee352a6723 c615f91a31791f1bf4ac7f7fdc60525bf1804186 cb3670db84ec9e9dd8c9f341e461c29e4e789a7e cc274e07847a6a86917b6ccd4e67706170d4036f cc95906da4b92b3a5c4b187553050df0f90eae08 d1a5c8492ed1773ca0f1a97abad71afb122a750a d53a00bb90bb606f10d888419a14eca779f17285 d69fd045e23c8a45c6b3f6b9a4ef66592d51dba4 dac17f958d2ee523a2206206994597c13d831ec7 dcc5354175d60ffc8364e71e792fcd66366f00fe e8782615e32557f257dd88d70b1eb0d7f47b91c3 eb51d9a39ad5eef215dc0bf39a8821ff804a0f01 edb9c6900a11d2dd37da6b59f3604c35a39db1e6 eee877c1b6285b82890bdcd027d2715f658ecf23 f09b0cd8bd6ed6fa528284f53fc8e9df753b62de f1a871f4f732fb2217cda4e4224d2b2d3b4aa6c2 f1d45cfbcd430d5e90cc5fa25e8958cc3c798abe f1fb8f098979dc29a3020070ac93ef24f1b2ca4c f1fb9ce9472dec231bced60d6aa729f5e403020b feeaa5f8a104836d15b492399b2ea587a41c4771".split(" ").forEach(function (x) { REG["0x" + x] = 1; });
  // 先走我们自己的缓存代理（/api/bs，30 秒边缘缓存，官方接口冷启动慢时也快）；代理不通再直连官方接口
  function viaProxy(p) {
    return fetch("/api/bs?p=" + encodeURIComponent(p)).then(function (r) { if (!r.ok || (r.headers.get("content-type") || "").indexOf("json") < 0) throw new Error("proxy"); return r.json(); })
      .catch(function () { return fetch(WEB + p).then(function (r) { if (!r.ok) throw new Error("浏览器接口返回 " + r.status); return r.json(); }); });
  }
  function get(path) { return viaProxy("/api/v2" + path); }
  function call(to, data) { return W.rpcOn("anubis", "eth_call", [{ to: to, data: data }, "latest"]); }
  function u256(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function str(s) {
    var h = Array.prototype.map.call(new TextEncoder().encode(s), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    return u256(32) + u256(h.length / 2) + h.padEnd(Math.ceil(h.length / 64) * 64, "0");
  }
  function decStr(r) {
    if (!r || r.length < 130) return "";
    var len = parseInt(r.slice(66, 130), 16), h = r.slice(130, 130 + len * 2);
    return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map(function (x) { return parseInt(x, 16); })));
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // 站长 2026-11-17「明细怎么都是 0」：一笔只有 0.000000008 LGNS 的零头成交，以前流向里写成「0」、说明里写成「8e-9」，看着像出了错。
  // 现在极小的数照实写成普通小数（最多 12 位），不再抹成 0，也不用科学计数法
  function small(x) { if (!(x > 0)) return "0"; var s = x.toFixed(12).replace(/0+$/, "").replace(/\.$/, ""); return s === "0" ? "不到 0.000000000001" : s; }
  function amt(v, d) { var x = Number(v || 0) / Math.pow(10, Number(d || 18)); if (x > 0 && x < 1e-4) return small(x); return x === 0 ? "0" : x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : x >= 1 ? x.toFixed(4).replace(/\.?0+$/, "") : x.toPrecision(4); }
  function ago(t) {
    var s = (Date.now() - new Date(t).getTime()) / 1000;
    return s < 60 ? Math.max(1, Math.round(s)) + " 秒前" : s < 3600 ? Math.round(s / 60) + " 分钟前" : s < 86400 ? Math.round(s / 3600) + " 小时前" : Math.round(s / 86400) + " 天前";
  }

  // 官方接口一次最多给 1000 条：满 1000 条就从最后一条的区块接着往后读（2026-11-08 .ailgns 主名字记录满 1000 条，新设名字的钱包不显示名字）
  function allLogs(addr, topic) {
    var out = [];
    function page(from, n) {
      return viaProxy("/api?module=logs&action=getLogs&fromBlock=" + from + "&toBlock=latest&address=" + addr + "&topic0=" + topic).then(function (d) {
        var r = d.result || []; out = out.concat(r);
        if (r.length < 1000 || n >= 40) return { result: out };
        var last = parseInt(r[r.length - 1].blockNumber, 16);
        return page(last > from ? last : from + 1, n + 1);
      });
    }
    return page(18161690, 1);
  }
  // 设过主名字的地址：读两个合约的 PrimaryChanged 记录（官方浏览器接口一次最多 1000 条），5 分钟刷新一次。
  // 只有这些地址才去链上查名字，全站成百上千个地址也不会每个都查
  var T_PRIMARY = "0xcce410882185feecc3dc31bf1f98597f94091d6830a2a5776ef494454c2f4930", cand = null, candAt = 0;
  function candidates() {
    if (!cand || Date.now() - candAt > 300000) {
      candAt = Date.now();
      cand = Promise.all(["ailgns", "lgns"].map(function (t) {
        return allLogs(NAMES[t], T_PRIMARY);
      })).then(function (x) {
        var set = {};
        x.forEach(function (d) { (d.result || []).forEach(function (l) { set["0x" + l.topics[1].slice(26)] = 1; }); });
        return set;
      }, function () { return null; }); // 读不到就退回每个地址都查
    }
    return cand;
  }
  // 地址 → 名字：优先显示 .ailgns，没设 .ailgns 才显示 .lgns；同一页里查过的记住
  var nameCache = {};
  // 没设主名字的地址：用他名下的域名代替钱包地址（读 Transfer 记录得出每个名字现在归谁，5 分钟刷新一次）
  var T_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", owned = null, ownedAt = 0;
  function ownedMap() {
    if (!owned || Date.now() - ownedAt > 300000) {
      ownedAt = Date.now();
      owned = Promise.all(["ailgns", "lgns"].map(function (t) {
        return allLogs(NAMES[t], T_XFER).then(function (d) {
          var cur = {};
          // 挂在域名市场里的名字（转进托管合约），仍然算挂单人的
          var ESC = { "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e": 1, "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d": 1 };
          (d.result || []).forEach(function (l) { var to = "0x" + l.topics[2].slice(26), from = "0x" + l.topics[1].slice(26); cur[l.topics[3]] = { to: ESC[to] ? from : to, b: parseInt(l.blockNumber, 16) }; });
          return cur;
        });
      })).then(function (x) {
        var by = {};
        ["ailgns", "lgns"].forEach(function (t, i) {
          Object.keys(x[i]).forEach(function (id) { var o = x[i][id]; (by[o.to] = by[o.to] || []).push({ t: t, id: id, b: o.b }); });
        });
        // 优先 .ailgns，再按拿到的先后（最早的那个）
        Object.keys(by).forEach(function (a) { by[a].sort(function (p, q) { return (p.t === "ailgns" ? 0 : 1) - (q.t === "ailgns" ? 0 : 1) || p.b - q.b; }); });
        return by;
      }, function () { fails++; return {}; });
    }
    return owned;
  }
  function anyName(a) {
    return ownedMap().then(function (by) {
      var list = (by[a] || []).slice(0, 5), HN = A.hiddenNames || {};
      return list.reduce(function (pr, x) {
        return pr.then(function (got) {
          if (got) return got;
          return bcall(NAMES[x.t], "0x36bf1f0c" + x.id.slice(2)).then(function (r) { var n = decStr(r); return n && !HN[n + "." + x.t] ? n + "." + x.t : ""; }, function () { fails++; return ""; });
        });
      }, Promise.resolve(""));
    });
  }
  // 查名字用攒批读（站长 2026-11-11 提速）：几百个地址的名字合成几次请求，不再把页面自己的读链堵在后面
  var fails = 0;
  function bcall(to, data) { return A.bcall ? A.bcall(to, data) : call(to, data); }
  // 查到的名字记在浏览器里：下次打开直接用记住的，不用再读链；超过 5 分钟的在后台悄悄核对一遍，变了再换
  var NMK = "nmc1", store = {}, saveT = 0;
  try { store = JSON.parse(localStorage.getItem(NMK) || "{}") || {}; } catch (e) { store = {}; }
  function remember(a, n) {
    store[a] = [n, Math.floor(Date.now() / 60000)];
    if (saveT) return;
    saveT = setTimeout(function () {
      saveT = 0;
      try {
        var ks = Object.keys(store);
        if (ks.length > 3000) ks.sort(function (x, y) { return store[x][1] - store[y][1]; }).slice(0, ks.length - 2000).forEach(function (k) { delete store[k]; });
        localStorage.setItem(NMK, JSON.stringify(store));
      } catch (e) {}
    }, 1500);
  }
  // 2026-11-21 提速（站长：「otc 有时候很卡，有时候点不动」）：名字改问服务器 /api/who（一批地址一次请求）。
  // 以前每次打开页面、之后每 5 分钟，手机都要把两个域名合约的全部记录下载一遍（17 个请求、6.4MB）来算名字，那十几秒页面发卡。
  // 服务器答不上来（没网、接口出错）才退回下面的老办法 lookupOld 自己读，名字不会因此显示不出来
  var nmAskQ = [], nmAskT = 0, nmAskBad = 0;
  function nmAskFlush() {
    nmAskT = 0;
    var q = nmAskQ; nmAskQ = [];
    for (var i = 0; i < q.length; i += 60) (function (part) {
      var list = part.map(function (x) { return x.a; });
      fetch("/api/who?a=" + list.join(",")).then(function (r) { if (!r.ok) throw new Error("who"); return r.json(); }).then(function (j) {
        if (!j || !j.n) throw new Error("who");
        nmAskBad = 0;
        part.forEach(function (x) { x.ok(j.n[x.a] || null); });
      }).catch(function () { nmAskBad = Date.now(); part.forEach(function (x) { x.ok(undefined); }); });
    })(q.slice(i, i + 60));
  }
  function nmAsk(a) { // 结果：{ p: [主名字…], o: [名下的域名…] }；undefined = 服务器这次答不了
    if (nmAskBad && Date.now() - nmAskBad < 60000) return Promise.resolve(undefined); // 刚失败过：1 分钟内直接走老办法，别每个地址都去撞一次
    return new Promise(function (ok) { nmAskQ.push({ a: a, ok: ok }); if (!nmAskT) nmAskT = setTimeout(nmAskFlush, 40); });
  }
  function lookup(a) {
    a = String(a || "").toLowerCase();
    return nmAsk(a).then(function (r) {
      if (r === undefined) return lookupOld(a);
      if (!r) return "";
      var HN = A.hiddenNames || {}, ok = function (n) { return n && !HN[n]; };
      return (r.p || []).filter(ok)[0] || (r.o || []).filter(ok)[0] || "";
    }, function () { return lookupOld(a); });
  }
  function lookupOld(a) {
    return candidates().then(function (set) {
      if (set && !set[a]) return "";
      return Promise.all(["ailgns", "lgns"].map(function (t) {
        return bcall(NAMES[t], SEL.nameOf + A.pad(a)).then(function (r) { var n = decStr(r); return n && !(A.hiddenNames || {})[n + "." + t] ? n + "." + t : ""; }, function () { fails++; return ""; });
      })).then(function (x) { return x[0] || x[1]; });
    }).then(function (n) { return n || anyName(a); }); // 设了主名字用主名字；没设就用他名下的域名
  }
  // 读链查一次；中途有读不到的（结果可能不准）就不记，返回 null
  function fresh(a) {
    var f0 = fails;
    return lookup(a).then(function (n) { if (!n && fails !== f0) return null; remember(a, n); return n; }, function () { return null; });
  }
  function nameOf(a) {
    a = String(a).toLowerCase();
    if (A.hidden && A.hidden[a]) return Promise.resolve(""); // 匿名持有人：不把地址换成名字
    if (!nameCache[a]) {
      var c = store[a];
      if (c && typeof c[0] === "string" && !(c[0] && (A.hiddenNames || {})[c[0]])) {
        nameCache[a] = Promise.resolve(c[0]);
        if (Date.now() / 60000 - c[1] > 5) fresh(a).then(function (n) {
          if (n === null || n === c[0]) return;
          nameCache[a] = Promise.resolve(n);
          if (!timer) timer = setTimeout(swapAll, 300); // 名字变了：页面上还显示短地址的地方补换一次
        });
      } else nameCache[a] = fresh(a).then(function (n) { return n || ""; });
    }
    return nameCache[a];
  }
  // 页面里所有 data-a 的地址，查到名字就换成「名字 + 短地址」
  function fillNames(root) {
    // 域名 NFT：把「LGNS Names」换成具体是哪个名字
    root.querySelectorAll("[data-nft]").forEach(function (e) {
      var x = e.getAttribute("data-nft").split(":");
      e.removeAttribute("data-nft");
      bcall(NAMES[x[0]], "0x36bf1f0c" + u256(x[1])).then(function (r) { var n = decStr(r); if (n) e.textContent = "🌐 " + n + "." + x[0]; }, function () {});
    });
    root.querySelectorAll("[data-a]").forEach(function (e) {
      if (KNOWN[e.getAttribute("data-a").toLowerCase()]) return;
      // 只显示名字（不再跟一个短地址：那个短地址又会被全站换名字逻辑换成名字，变成重复两次）；完整地址放在鼠标悬停提示里
      var full = e.getAttribute("data-a");
      Promise.all([nameOf(full), A.rankReady || null]).then(function (x) {
        var n = x[0]; if (!n) return;
        var bg = A.rankBadge && !(e.closest && e.closest("[data-nb]")) ? A.rankBadge(full) : "";
        e.innerHTML = '<b class="sc-nm">' + bg + esc(n) + "</b>"; e.title = full + (bg ? " · " + A.rankTitle(full) : "");
      });
    });
  }
  // ===== 账本（2026-11-05 站长定：只服务本站，每一笔翻译成人话，官方浏览器那些区块 / Gas / 日志统统不要）=====
  var C = {
    otc: { "0x4e730be6d46be71223ded5a32dc45799f6d4bc15": "AiLGNS", "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818": "LGNS", "0x2b0ab121d60f823fffc4cef75af26055df388e2b": "gLGNS", "0x8c67912b3ed44f4512c2f22b7b2263f6659396ed": "AWAKE NFT 卡牌" },
    market: { "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e": 1, "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d": 1 },
    loan: { "0x242ab392571d325d814a48892ac16115a6d285dc": "AiLGNS", "0x8d84d678d195e770caad263d1c37967ec796165c": "AiLGNS（旧）", "0x439cb33e9c5d7a26dd1fa503efe6fd3033ac173b": "LGNS", "0x00e674bb1559557966a6c2244c36d12a63218a5f": "gLGNS" },
    sweep: { "0xdcc5354175d60ffc8364e71e792fcd66366f00fe": 1, "0x6ec474047a6c12d0cab53855a990c1c8b3996c20": 1 }, play: "0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c",
    buyback: "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", pool: "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4",
    tokens: { "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14": "DAI", "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb": "AiLGNS", "0x4d1d808a081fdac440703b3765fc61f8028c06b8": "LGNS", "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c": "gLGNS" }
  };
  KNOWN[C.pool] = "预言家奖池钱包";
  C.fast = "0x8610bf581b1c10cb7d372f93b8cdcde382a7c1d1"; KNOWN[C.fast] = "⚡ 极速预言家奖池"; /* 站长 2026-11-14：这个地址在账本里标成「极速预言家奖池」 */
  var who = function (a) { return a ? '<span data-a="' + a + '" class="lg-who">' + (KNOWN[a.toLowerCase()] || A.short(a)) + "</span>" : ""; };
  var nftTag = function (m) { return m && m.nft ? '<b data-nft="' + m.nft.tld + ":" + m.nft.id + '">🌐 域名</b>' : ""; };
  function bj(ts) { var d = new Date(new Date(ts).getTime() + 8 * 3600e3); return (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
  // 一笔交易里和「我」有关的币怎么动：进 / 出、币种、数量、对方
  function moves(a, tr) {
    return (tr || []).map(function (r) {
      var to = (r.to && r.to.hash || "").toLowerCase(), from = (r.from && r.from.hash || "").toLowerCase(), tok = (r.token && r.token.address_hash || "").toLowerCase();
      var tld = tok === NAMES.ailgns ? "ailgns" : tok === NAMES.lgns ? "lgns" : "", id = r.total && r.total.token_id;
      var card = !tld && id != null && (!r.total || r.total.value == null); // 卡牌这类 NFT 没有数量字段：一笔就是 1 张（以前显示成 0）
      return { dir: to === a ? "in" : from === a ? "out" : "", sym: tld ? "域名" : (r.token && r.token.symbol) || "?", v: tld ? 0 : card ? 1 : Number(r.total && r.total.value || 0) / Math.pow(10, Number(r.total && r.total.decimals || 18)), card: card, vs: tld ? "" : card ? "1" : amt(r.total && r.total.value, r.total && r.total.decimals), nft: tld && id ? { tld: tld, id: id } : null, other: to === a ? from : to };
    }).filter(function (m) { return m.dir; });
  }
  var sumOf = function (ms, dir, sym) { return ms.filter(function (m) { return m.dir === dir && (!sym || m.sym === sym) && !m.nft; }).reduce(function (t, m) { return t + m.v; }, 0); };
  var fmtN = function (v, sym) { return "<b>" + (v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v >= 1 ? +v.toFixed(4) : v > 0 && v < 1e-4 ? small(v) : +v.toPrecision(4)) + " " + esc(sym) + "</b>"; };
  var firstIn = function (ms, sym) { return ms.filter(function (m) { return m.dir === "in" && (!sym || m.sym === sym); })[0]; };
  var firstOut = function (ms, sym) { return ms.filter(function (m) { return m.dir === "out" && (!sym || m.sym === sym); })[0]; };
  // 站长 2026-11-12：客户看价 824.99、账本写「单价 833」以为被多收了。吃单方的 1% 手续费是从收到的币里扣的，
  // 所以直接吃单两个价都写：挂单价（OTC 页面上看到的那个）+ 算上手续费的价；扫单一次吃多张，只写均价并说明已含手续费
  // 站长 2026-11-25：「（含 1% 手续费合 851.465）」客户看不懂，还以为挂单的人也被收了手续费。改成说清楚三件事：
  // 对方挂的价是多少；手续费是吃单的一方付的、从哪里扣；挂单的一方不付
  var pxFee = function (dai, coin, buy) {
    if (!(coin > 0)) return "";
    var real = dai / coin;
    return "，对方挂单价 " + (buy ? real * 0.99 : real / 0.99).toFixed(3) +
      '<br><small class="muted">' + (buy ? "吃单方付 1% 手续费（从买到的币里扣），算下来每枚合 " : "吃单方付 1% 手续费（从收到的 DAI 里扣），算下来每枚合 ") + real.toFixed(3) + "；挂单方不付手续费。</small>";
  };
  var pxAvg = function (dai, coin, buy) { return coin > 0 ? "，均价 " + (dai / coin).toFixed(3) + "（已" + (buy ? "含" : "扣") + " 1% 手续费）" : ""; };
  // 链上留言：0 元交易，data = utf8("ailgns-msg:" + 文字)
  var MSG_PREFIX = "ailgns-msg:", GUESS_PREFIX = "ailgns-oracle-guess:", ANCHOR_PREFIX = "ailgns-oracle:";
  function decodeMsg(input) {
    if (!input || input.length < 2 + MSG_PREFIX.length * 2) return null;
    try {
      var bytes = new Uint8Array((input.slice(2).match(/../g) || []).map(function (x) { return parseInt(x, 16); }));
      var str = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return str.indexOf(MSG_PREFIX) === 0 ? str.slice(MSG_PREFIX.length).slice(0, 300) : null;
    } catch (e) { return null; }
  }
  function encodeMsg(txt) { return "0x" + Array.prototype.map.call(new TextEncoder().encode(MSG_PREFIX + txt), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  // 把一笔交易翻译成一句人话：返回 { ico, text }
  function isMe(a) { var k = A.otcKit && A.otcKit.account && A.otcKit.account(); return !!k && String(k).toLowerCase() === String(a).toLowerCase(); }
  // 🔧 运营地址对外的账本（站长 2026-11-10）：收入照原样，支出用婉转说法（买入托底 / 挂买单托底 / 注入奖池 / 运营维护支出）；站长自己连着钱包看照原样
  function translate(a, row) {
    var r = translate0(a, row);
    if (!r || !TEAM[a] || isMe(a)) return r;
    var t = row.tx, ok = !t || t.result === "success"; if (!ok) return r;
    var ms = moves(a, row.tr), to = t && t.to && t.to.hash ? t.to.hash.toLowerCase() : "";
    var outs = ms.filter(function (m) { return m.dir === "out" && !m.nft; }), ins = ms.filter(function (m) { return m.dir === "in" && !m.nft; });
    var nat = t && Number(t.value) > 0 && ((t.from && t.from.hash) || "").toLowerCase() === a ? Number(t.value) / 1e18 : 0; // 原生 DAI 直接转账
    if (nat > 0 && !outs.length) outs.push({ dir: "out", sym: "DAI", v: nat, other: to });
    /* 官方做市机器人（站长 2026-11-17 晚：别的社区说它在砸盘，让我把账本「说漂亮一点，说在托底、护盘」）。
       我没有写「护盘」：它收来的币确实会卖进 DEX，链上谁都查得到，写成护盘一查就穿帮，反而坐实了「官方在骗人」。
       改成把每一笔照实写清楚——这才是对「砸盘」最有力的回应：它卖出的每一枚都是刚从本站客户手里买来的，团队没有抛过一枚自己的币，它手里也不留币。
       以前它在 DEX 的卖出会被下面的通用规则写成「运营维护支出」，那是错的 */
    if (A.BOT && a === A.BOT) {
      var bCoinOut = outs.filter(function (m) { return m.sym !== "DAI"; }), bDaiIn = ins.filter(function (m) { return m.sym === "DAI"; }).reduce(function (x, m) { return x + m.v; }, 0), bCoinIn = ins.filter(function (m) { return m.sym !== "DAI"; })[0];
      if (bCoinOut.length && bDaiIn > 0) return { ico: "🔁", text: "<b>对冲卖出</b> " + fmtN(bCoinOut.reduce(function (x, m) { return x + m.v; }, 0), bCoinOut[0].sym) + "，换回 " + fmtN(bDaiIn, "DAI") + "（这些币是刚从本站客户手里买来的；机器人不囤币，换回的 DAI 接着挂买单）" };
      if (bCoinIn && !outs.length) return { ico: "🛡️", text: "<b>买单成交</b>：有客户把 " + fmtN(bCoinIn.v, bCoinIn.sym) + " 卖给了机器人（机器人挂的买单接下了这笔卖出）" };
      if (!outs.length && bDaiIn > 0 && ins.some(function (m) { return C.otc[m.other]; })) return { ico: "↩️", text: "<b>撤回买单</b> " + fmtN(bDaiIn, "DAI") + "，按最新行情重新挂" };
    }
    if (!outs.length) { // 收入照原样；运营钱包之间互转的进账也说成内部调拨
      if (ins.length && ins.every(function (m) { return TEAM[m.other]; })) return { ico: "🔧", text: "<b>团队内部调拨</b> 收到 " + ins.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（运营钱包之间划转）" };
      return r;
    }
    var daiOut = outs.filter(function (m) { return m.sym === "DAI"; }).reduce(function (x, m) { return x + m.v; }, 0), coinOut = outs.filter(function (m) { return m.sym !== "DAI"; })[0], coinIn = ins.filter(function (m) { return m.sym !== "DAI"; })[0];
    var list = outs.map(function (m) { return fmtN(m.v, m.sym); }).join("、");
    if (coinIn && daiOut > 0) return { ico: "🛡️", text: "<b>买入 " + esc(coinIn.sym) + " 托底</b>，花 " + fmtN(daiOut, "DAI") + " 买到 " + fmtN(coinIn.v, coinIn.sym) };
    if (C.otc[to] || C.sweep[to] || outs.some(function (m) { return C.otc[m.other] || C.sweep[m.other]; })) {
      if (daiOut > 0) return { ico: "🛡️", text: "<b>挂买单托底</b>，存入 " + fmtN(daiOut, "DAI") + " 到 OTC 托管合约等人卖" };
      if (coinOut) return { ico: "⚖️", text: "<b>挂单调节盘口</b>，存入 " + fmtN(coinOut.v, coinOut.sym) + " 到 OTC 托管合约" };
    }
    if (outs.some(function (m) { return m.other === C.pool; })) return { ico: "🏆", text: "<b>注入预测奖池</b> " + list };
    if (outs.some(function (m) { return TEAM[m.other]; })) return { ico: "🔧", text: "<b>团队内部调拨</b> " + list + "（运营钱包之间划转）" };
    return { ico: "🔧", text: "<b>运营维护支出</b> " + list + "（服务器、节点、客服等日常维护）" };
  }
  function translate0(a, row) {
    var t = row.tx, ms = moves(a, row.tr), sel = t && (t.raw_input || "").slice(0, 10), to = t && t.to && t.to.hash ? t.to.hash.toLowerCase() : "", ok = !t || t.result === "success";
    var nftIn = ms.filter(function (m) { return m.nft && m.dir === "in"; })[0], nftOut = ms.filter(function (m) { return m.nft && m.dir === "out"; })[0];
    var daiIn = sumOf(ms, "in", "DAI"), daiOut = sumOf(ms, "out", "DAI");
    var coinIn = ms.filter(function (m) { return m.dir === "in" && !m.nft && m.sym !== "DAI"; })[0], coinOut = ms.filter(function (m) { return m.dir === "out" && !m.nft && m.sym !== "DAI"; })[0];
    if (t && !ok) return { ico: "❌", text: "操作没成功（链上已回滚，没扣钱）" + (METHODS[sel] ? "：" + METHODS[sel] : "") };
    // 🔮 预言家存证：客户自己写上链的预测 / 奖池钱包封卷后写的全期指纹
    var rawIn = t && t.raw_input && t.raw_input.length > 2 ? (function () { try { return decodeURIComponent(t.raw_input.slice(2).replace(/(..)/g, "%$1")); } catch (e) { return ""; } })() : "";
    var gm = rawIn.indexOf(GUESS_PREFIX) === 0 ? rawIn.slice(GUESS_PREFIX.length).match(/^(\d{4}-\d{2}-\d{2}):([\d.,]+)/) : null;
    if (gm) { var gday = gm[1], gps = gm[2].split(","), md = gday.slice(5).replace("-", "/"); return { ico: "🔮", cls: "lg-oracle", text: "<b>预言家链上存证</b>：" + (t.from && t.from.hash.toLowerCase() === a ? "我" : who(t.from.hash.toLowerCase())) + "预测 <b>" + md + " 期</b>揭晓价 <b>" + gps.join("、") + " DAI</b><span class=\"lg-orc\" data-day=\"" + gday + "\" data-ps=\"" + esc(gm[2]) + "\">…</span>" }; }
    var am = rawIn.indexOf(ANCHOR_PREFIX) === 0 ? rawIn.slice(ANCHOR_PREFIX.length).match(/^(\d{4}-\d{2}-\d{2}):([0-9a-f]{64})/) : null;
    if (am) return { ico: "🔗", cls: "lg-oracle", text: "<b>预言家封卷存证</b>：" + am[1].slice(5).replace("-", "/") + " 期全部预测的指纹 <span class=\"mono\">" + am[2].slice(0, 16) + "…</span> 写入链上（<a href=\"#/oracle\">去验证 ›</a>）" };
    var mtxt = t && to && !KNOWN[to] && !C.tokens[to] ? decodeMsg(t.raw_input) : null;
    if (mtxt) { var mfrom = (t.from && t.from.hash || "").toLowerCase(); return mfrom === a ? { ico: "💬", text: "给 " + who(to) + " <b>留言</b>：「" + esc(mtxt) + "」" } : { ico: "📬", text: who(mfrom) + " <b>给你留言</b>：「" + esc(mtxt) + "」" }; }
    // —— 自己没发交易、是别人的操作让钱进来：看那笔交易的方法，判断是「我的挂单成交」「手续费」还是「到期退回」（站长 2026-11-11）——
    // 合约里吃单的人把钱直接付给挂单人，所以以前这些都只显示成「收到 … 来自 …」
    if (!t && !nftIn && !nftOut) {
      var msel = (row.tr && row.tr[0] && row.tr[0].method) || "", FILLSEL = { "0x6fe4a448": 1, "0x934a9456": 1, "0xdb4361f1": 1, "0x9688b6ba": 1 };
      var viaBot = ms.some(function (m) { return C.sweep[m.other]; }), isFill = !!FILLSEL[msel] || viaBot;
      var inOtc = ms.filter(function (m) { return m.dir === "in" && C.otc[m.other]; })[0], feeTxt = inOtc && TEAM[a] ? "，另收手续费 " + fmtN(inOtc.v, inOtc.sym) : "";
      var botTxt = function (x) { return C.sweep[x] ? (/撮合/.test(KNOWN[x] || "") ? "（自动撮合）" : "（对方一键扫单）") : ""; };
      var cpDai = ms.filter(function (m) { return m.dir === "in" && m.sym === "DAI" && !C.otc[m.other]; })[0];
      if (inOtc && msel === "0x34bfca5c") return { ico: "↩️", text: "<b>挂单到期</b>，自动退回 " + fmtN(inOtc.v, inOtc.sym) };
      if (isFill && daiIn && daiOut && !coinIn && !coinOut) return { ico: "🤖", text: "<b>自动撮合</b>：垫付 " + fmtN(daiOut, "DAI") + "，收回 " + fmtN(daiIn, "DAI") + (daiIn > daiOut ? "，赚 " + fmtN(daiIn - daiOut, "DAI") : "") };
      if (isFill && coinIn && !C.otc[coinIn.other] && !coinOut) return { ico: "✅", text: "<b>买单成交</b>，买入 " + fmtN(coinIn.v, coinIn.sym) + (botTxt(coinIn.other) || "，卖家 " + who(coinIn.other)) + feeTxt };
      if (isFill && cpDai && !daiOut) return { ico: "✅", text: "<b>卖单成交</b>，卖出收到 " + fmtN(cpDai.v, "DAI") + (botTxt(cpDai.other) || "，买家 " + who(cpDai.other)) + feeTxt };
      if (inOtc && isFill && TEAM[a]) return { ico: "🪙", text: "<b>OTC 手续费收入</b> " + fmtN(inOtc.v, inOtc.sym) + "（" + esc(C.otc[inOtc.other]) + " 市场有人成交，合约自动扣的）" };
    }
    // —— 一键扫单 / 自动撮合（合约替你一次吃多张单）——
    if (C.sweep[to] || (!t && ms.some(function (m) { return C.sweep[m.other]; }))) {
      if (coinIn && daiOut) return { ico: "🛒", text: "<b>一键扫单买入</b> " + fmtN(coinIn.v, coinIn.sym) + "，花了 " + fmtN(daiOut, "DAI") + pxAvg(daiOut, coinIn.v, true) };
      if (coinOut && daiIn) return { ico: "💰", text: "<b>一键扫单卖出</b> " + fmtN(coinOut.v, coinOut.sym) + "，收到 " + fmtN(daiIn, "DAI") + pxAvg(daiIn, coinOut.v, false) };
      if (coinIn) return { ico: "🛒", text: "<b>扫单买入</b>到账 " + fmtN(coinIn.v, coinIn.sym) };
      if (daiIn) return { ico: "💰", text: "<b>扫单卖出</b>到账 " + fmtN(daiIn, "DAI") };
      if (daiOut) return { ico: "🛒", text: "<b>一键扫单</b>，付出 " + fmtN(daiOut, "DAI") };
      return { ico: "⇄", text: "一键扫单操作" + (t && sel === "0x095ea7b3" ? "：授权（不扣钱）" : "") };
    }
    if (to === C.play) return { ico: "🎮", text: "<b>销毁乐园</b>" + (coinOut ? "：投入 " + fmtN(coinOut.v, coinOut.sym) : "：玩游戏 / 像素墙") };
    // —— OTC（币 / 卡牌）——
    if (C.otc[to]) {
      var mk = C.otc[to];
      if (sel === "0x6fe4a448" || sel === "0xd6febde8") { // 吃单 / 买
        if (coinIn && daiOut) return { ico: "🛒", text: "在 OTC <b>买入</b> " + fmtN(coinIn.v, coinIn.sym) + "，花了 " + fmtN(daiOut, "DAI") + pxFee(daiOut, coinIn.card ? 0 : coinIn.v, true) + (daiOut < 0.01 ? "<br><small class=\"muted\">金额极小：这是把一张挂单最后剩下的一点零头买走了（前面的成交除不尽留下的），不是出错，谁的钱都没有少。</small>" : "") };
        if (coinOut && daiIn) return { ico: "💰", text: "在 OTC <b>卖出</b> " + fmtN(coinOut.v, coinOut.sym) + "，收到 " + fmtN(daiIn, "DAI") + pxFee(daiIn, coinOut.card ? 0 : coinOut.v, false) };
        if (nftIn && daiOut) return { ico: "🛒", text: "在 OTC <b>买入</b>卡牌，花了 " + fmtN(daiOut, "DAI") };
      }
      if (sel === "0x9128a740" || sel === "0xca690ea2") { // 挂单
        if (coinOut) return { ico: "📌", text: "在 OTC <b>挂单卖出</b> " + fmtN(coinOut.v, coinOut.sym) + "（币先锁进合约，等买家）" };
        if (daiOut) return { ico: "📌", text: "在 OTC <b>挂单买入</b>，锁定 " + fmtN(daiOut, "DAI") + "（等卖家来成交）" };
        if (nftOut) return { ico: "📌", text: "在 OTC <b>挂单出售</b>卡牌" };
      }
      if (sel === "0x40e58ee5") return { ico: "↩️", text: "<b>撤单</b>，退回 " + (ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return m.nft ? "卡牌" : fmtN(m.v, m.sym); }).join("、") || "挂着的币") };
      if (!t && coinIn) return { ico: "✅", text: "你的 OTC <b>买单成交</b>，收到 " + fmtN(coinIn.v, coinIn.sym) + (daiIn ? "（多余的 DAI 也退回了）" : "") };
      if (!t && daiIn) return { ico: "✅", text: "你的 OTC <b>卖单成交</b>，收到 " + fmtN(daiIn, "DAI") };
      return { ico: "⇄", text: "OTC（" + esc(mk) + "）操作" + (METHODS[sel] ? "：" + METHODS[sel] : "") };
    }
    // —— 域名合约 ——
    if (to === NAMES.ailgns || to === NAMES.lgns) {
      if (sel === "0xd868a84f") return { ico: "🌐", text: "<b>注册域名</b> " + (nftTag(nftIn) || "") + (daiOut ? "，付 " + fmtN(daiOut, "DAI") : coinOut ? "，付 " + fmtN(coinOut.v, coinOut.sym) : "") };
      if (sel === "0x26e43e37") return { ico: "🔄", text: "<b>续费域名</b>" + (daiOut ? "，付 " + fmtN(daiOut, "DAI") : coinOut ? "，付 " + fmtN(coinOut.v, coinOut.sym) : "") + "（给谁的域名续费，名字还是原主人的）" };
      if (sel === "0x38e74feb") return { ico: "⭐", text: "<b>设置主名字</b>（以后别人看到这个地址就显示域名）" };
      if (sel === "0xeba36dbd") return { ico: "🔧", text: "<b>修改域名指向</b>的地址" };
      if (sel === "0xa22cb465" || sel === "0x095ea7b3") return { ico: "🔑", text: "<b>授权</b>域名市场代为转移域名（挂单前的准备，不花钱）" };
      if ((sel === "0x23b872dd" || sel === "0x42842e0e" || sel === "0xb88d4fde") && nftOut && nftOut.other === DEAD) return { ico: "🔥", text: "<b>销毁创世域名</b> " + nftTag(nftOut) + "（转进黑洞地址，永久拿不回；预言家领奖凭证，机器人核对后发奖）" };
      if (sel === "0x23b872dd" || sel === "0x42842e0e" || sel === "0xb88d4fde") return nftOut ? { ico: "🎁", text: "<b>转让域名</b> " + nftTag(nftOut) + " 给 " + who(nftOut.other) } : { ico: "📥", text: "<b>收到域名</b> " + nftTag(nftIn) + " 来自 " + who(nftIn && nftIn.other) };
    }
    // —— 域名市场 ——
    if (C.market[to]) {
      if (sel === "0xd6febde8") return { ico: "🛒", text: "<b>买入域名</b> " + nftTag(nftIn) + "，付 " + fmtN(daiOut, "DAI") + "（含 3% 手续费）" };
      if (sel === "0xca690ea2") return { ico: "🏷", text: "<b>域名挂单出售</b> " + nftTag(nftOut) + "（域名托管在市场合约，卖掉前随时可撤）" };
      if (sel === "0x40e58ee5") return { ico: "↩️", text: "<b>撤回域名挂单</b>，" + nftTag(nftIn) + " 退回钱包" };
      return { ico: "🏷", text: "域名市场操作" };
    }
    if (!t && daiIn && ms.some(function (m) { return C.market[m.other]; })) return { ico: "✅", text: "你的<b>域名卖出成交</b>，收到 " + fmtN(daiIn, "DAI") };
    // —— 借贷 ——
    if (C.loan[to]) {
      var L = { "0x2fedd319": ["🤝", "<b>抵押</b> " + (coinOut ? fmtN(coinOut.v, coinOut.sym) : "币") + " 发布借款单（等人出借 DAI）"], "0xa65e2cfd": ["💵", "<b>出借</b> " + fmtN(daiOut, "DAI") + " 给一张借款单（到期连本带息收回）"], "0x992001bd": ["📣", "<b>挂出借单</b>，锁定 " + fmtN(daiOut, "DAI") + "（等人来借）"], "0x4fd9efc4": ["💰", "<b>借到</b> " + fmtN(daiIn, "DAI") + (coinOut ? "，抵押 " + fmtN(coinOut.v, coinOut.sym) : "")], "0x371fd8e6": ["✅", "<b>还款</b> " + fmtN(daiOut, "DAI") + (coinIn ? "，取回抵押 " + fmtN(coinIn.v, coinIn.sym) : "")], "0x379607f5": ["⚖️", "<b>到期处置</b>：拿到 " + ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return fmtN(m.v, m.sym); }).join("、")], "0x40e58ee5": ["↩️", "<b>撤销借贷挂单</b>，退回 " + ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return fmtN(m.v, m.sym); }).join("、")] };
      if (L[sel]) return { ico: L[sel][0], text: L[sel][1] + "（" + esc(C.loan[to]) + " 借贷）" };
      return { ico: "🤝", text: "借贷操作（" + esc(C.loan[to]) + "）" };
    }
    if (!t && ms.some(function (m) { return C.loan[m.other]; })) return { ico: "✅", text: "借贷合约转来 " + ms.filter(function (m) { return m.dir === "in"; }).map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（对方还款 / 你的单成交 / 到期退回）" };
    // —— 普通转账、授权 ——
    if (t && C.tokens[to] && sel === "0xa9059cbb" && firstOut(ms)) { var o = firstOut(ms); return { ico: "💸", text: "<b>转出</b> " + fmtN(o.v, o.sym) + " 给 " + who(o.other) }; }
    if (t && C.tokens[to] && sel === "0x095ea7b3") return { ico: "🔑", text: "<b>授权</b> " + esc(C.tokens[to]) + "（允许合约在交易时扣币，本身不扣钱）" };
    if (t && (!t.raw_input || t.raw_input === "0x") && Number(t.value) > 0) return { ico: "💸", text: "<b>转出</b> " + fmtN(Number(t.value) / 1e18, "DAI") + " 给 " + who(to) };
    if (!t && ms.length) {
      var mi = ms.filter(function (m) { return m.dir === "in"; })[0];
      if (mi) {
        if (TEAM[mi.other]) return { ico: "🔧", text: "<b>运营费用支出</b> " + fmtN(mi.v, mi.sym) + "（服务器、节点、客服等运营维护）" };
        if (mi.other === C.pool) return { ico: "🏆", text: "<b>预言家奖金到账</b> " + fmtN(mi.v, mi.sym) + "（奖池钱包发放）" };
        return { ico: "📥", text: "<b>收到</b> " + (mi.nft ? "域名 " + nftTag(mi) : fmtN(mi.v, mi.sym)) + " 来自 " + who(mi.other) };
      }
    }
    // 不是本站的合约（DEX、质押、跨链桥等）：按币的进出说人话，不装懂
    var EXT = { "0xa694fc3a": "质押", "0x2e1a7d4d": "赎回", "0x3d18b912": "领取收益", "0x38ed1739": "DEX 兑换", "0x7ff36ab5": "DEX 兑换", "0x18cbafe5": "DEX 兑换", "0x8803dbee": "DEX 兑换", "0xe8e33700": "添加流动性", "0xbaa2abde": "移除流动性" };
    if (t && !KNOWN[to] && ms.length) {
      var ins = ms.filter(function (m) { return m.dir === "in" && !m.nft; }), outs = ms.filter(function (m) { return m.dir === "out" && !m.nft; }), lab = EXT[sel] || "其他平台";
      if (ins.length && outs.length) return { ico: "🔁", text: "在<b>" + lab + "</b>用 " + outs.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + " 换了 " + ins.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（非本站）" };
      if (outs.length) return { ico: "📤", text: "<b>" + (EXT[sel] || "转入其他平台") + "</b> " + outs.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（非本站合约）" };
      if (ins.length) return { ico: "📥", text: "从<b>" + lab + "</b>收到 " + ins.map(function (m) { return fmtN(m.v, m.sym); }).join("、") + "（非本站合约）" };
    }
    var k = KNOWN[to];
    return { ico: "🔧", text: (k ? "与「" + esc(k) + "」交互" : (EXT[sel] ? EXT[sel] + "（其他平台）" : "与其他平台的合约交互")) + (METHODS[sel] ? "：" + METHODS[sel] : "") + (ms.length ? "，" + ms.map(function (m) { return (m.dir === "in" ? "收到 " : "付出 ") + (m.nft ? "域名" : fmtN(m.v, m.sym)); }).join("、") : "") };
  }
  // 站长 2026-11-11：每一笔给一个简单判断（买入 AiLGNS / 卖出 AiLGNS / 挂单…），一眼扫过去就知道干了什么
  function tagOf(r) {
    var full = String(r.text).replace(/<[^>]+>/g, ""), s = full.replace(/（[^）]*）/g, ""), sym = (s.match(/AiLGNS|gLGNS|LGNS/) || [""])[0], i = r.ico; // 括号里是补充说明，不参与判断
    var what = /域名/.test(s) ? "域名" : /卡牌/.test(s) ? "卡牌" : sym ? " " + sym : "";
    if (i === "❌") return ["没成功", "bad"];
    if (i === "💬" || i === "📬") return ["留言", "etc"];
    if (i === "🔮" || i === "🔗") return ["预测", "game"];
    if (i === "🔑" || /授权（/.test(full)) return ["授权", "etc"];
    if (i === "🎮") return ["游戏", "game"];
    if (/手续费收入/.test(s)) return ["手续费收入", "in"];
    if (/自动撮合：/.test(s)) return ["自动撮合", "buy"];
    if (/借贷|借款单|出借/.test(s)) return ["借贷", "loan"];
    if (i === "↩️") return [/到期/.test(s) ? "到期退回" : "撤单", "wait"];
    if (/挂单|挂买单|挂出/.test(s) && !/成交/.test(s)) return [/买入|买单/.test(s) ? "挂买单" : /卖|出售/.test(s) ? "挂卖单" : "挂单", "wait"];
    if (/买单成交|买入|托底/.test(s)) return ["买入" + what, "buy"];
    if (/卖单成交|卖出/.test(s)) return ["卖出" + (what || "成交"), "sell"];
    if (/奖金到账/.test(s)) return ["奖金到账", "in"];
    if (/预言家|预测|奖池/.test(s)) return ["预测", "game"];
    if (/销毁/.test(s)) return ["销毁", "out"];
    if (/注册域名/.test(s)) return ["注册域名", "name"];
    if (/续费域名/.test(s)) return ["续费域名", "name"];
    if (/收到域名/.test(s)) return ["收到域名", "in"];
    if (/转让域名/.test(s)) return ["转让域名", "out"];
    if (/域名/.test(s)) return ["域名", "name"];
    if (/运营|调拨/.test(s)) return ["运营", "etc"];
    if (/换了|兑换|其他平台|非本站/.test(s)) return ["其他平台", "etc"];
    if (/转出|付出/.test(s)) return ["转出", "out"];
    if (/收到|转来|到账/.test(s)) return ["收款", "in"];
    if (/OTC/.test(s)) return ["OTC 操作", "etc"];
    return ["其他", "etc"];
  }
  var DIR = { "🪙": "in", "🤖": "trade",  "📥": "in", "🏆": "in", "🎁": "in", "↩️": "in", "💸": "out", "📤": "out", "🔥": "out", "🛒": "trade", "💰": "trade", "✅": "trade", "⇄": "trade", "🔄": "trade", "🔁": "trade", "❌": "bad" };
  function rowHtml(a, row) {
    var r = translate(a, row), tg = tagOf(r), money = (row.tr && row.tr.length) || (row.tx && row.tx.value && Number(row.tx.value) > 0) || /收到|付出|转出|转入|买入|卖出|成交|退回|注册|续费/.test(r.text);
    return '<div class="lg-row" data-kind="' + (r.cls ? "money" : money ? "money" : "other") + (r.cls ? '" data-cls="' + r.cls : "") + (DIR[r.ico] ? '" data-dir="' + DIR[r.ico] : "") + '"><span class="lg-ico">' + r.ico + '</span><div class="lg-main"><span class="lg-tag lg-k-' + tg[1] + '">' + tg[0] + '</span><div class="lg-txt">' + r.text + '</div><small>' + bj(row.t) + '</small></div><a class="lg-link" href="#/scan/' + row.h + '" title="看详情">详情 ›</a></div>';
  }
  // 站长 2026-11-11：流水不要全折叠，先露最新 5 条，其余点「展开」再看
  function clipLg(box) {
    var open = !!box.getAttribute("data-open"), all = !!box.getAttribute("data-all"), vis = 0, hid = 0;
    box.querySelectorAll(".lg-row").forEach(function (r) {
      var counts = all || r.getAttribute("data-kind") !== "other"; if (counts) vis++;
      var cut = !open && counts && vis > 5; if (cut) hid++;
      r.classList.toggle("lg-fold", cut); r.classList.toggle("lg-end", !open && counts && vis === 5);
    });
    box.classList.toggle("sc-clip", !open);
    var ub = box.querySelector(".sc-unfold"), hb = document.getElementById("sc-hbtn"), more = hid || box.querySelector(".sc-more") || box.querySelector(".sc-other");
    if (ub && (open || !more)) { ub.remove(); ub = null; }
    if (!open && more && !ub) { ub = document.createElement("button"); ub.type = "button"; ub.className = "sc-unfold"; ub.textContent = "展开看更多 ▾"; ub.onclick = function () { box.setAttribute("data-open", "1"); clipLg(box); }; box.appendChild(ub); }
    if (hb) { hb.hidden = !open; hb.onclick = function () { box.removeAttribute("data-open"); clipLg(box); var c = box.closest(".card"); if (c) window.scrollTo({ top: c.getBoundingClientRect().top + window.pageYOffset - 70, behavior: "smooth" }); }; }
  }
  // 账本列表：发出的交易 + 收到的币，合在一起按时间排；「再看更早的」两边各翻一页
  function ledger(a, box) {
    var nextTx = null, nextTt = null, first = true, seen = {}, rows = [];
    function qs(n) { return n ? "?" + Object.keys(n).map(function (k) { return k + "=" + encodeURIComponent(n[k]); }).join("&") : ""; }
    function load() {
      var more = box.querySelector(".sc-more"); if (more) more.textContent = "读取中…";
      var pTx = first || nextTx ? get("/addresses/" + a + "/transactions" + qs(nextTx)).catch(function () { return { items: [] }; }) : Promise.resolve({ items: [] });
      var pTt = first || nextTt ? get("/addresses/" + a + "/token-transfers" + qs(nextTt)).catch(function () { return { items: [] }; }) : Promise.resolve({ items: [] });
      return Promise.all([pTx, pTt]).then(function (x) {
        nextTx = x[0].next_page_params || null; nextTt = x[1].next_page_params || null;
        var byH = {};
        (x[1].items || []).forEach(function (r) { (byH[r.transaction_hash] = byH[r.transaction_hash] || []).push(r); });
        (x[0].items || []).forEach(function (t) { if (seen[t.hash]) return; seen[t.hash] = 1; rows.push({ t: t.timestamp, h: t.hash, tx: t, tr: byH[t.hash] || [] }); delete byH[t.hash]; });
        Object.keys(byH).forEach(function (h) { if (seen[h]) return; seen[h] = 1; rows.push({ t: byH[h][0].timestamp, h: h, tx: null, tr: byH[h] }); });
        rows.sort(function (p, q) { return new Date(q.t) - new Date(p.t); });
        if (!rows.length) { box.innerHTML = '<p class="muted">这个地址还没有和本站有关的记录</p>'; return; }
        box.innerHTML = rows.map(function (r) { return rowHtml(a, r); }).join("") + (nextTx || nextTt ? '<button type="button" class="sc-more">再看更早的 ▾</button>' : "");
        var others = box.querySelectorAll('.lg-row[data-kind="other"]').length, all = !!box.getAttribute("data-all");
        if (others && !all) box.insertAdjacentHTML("beforeend", '<p class="muted sc-other">另有 ' + others + ' 条不涉及钱的操作（授权、设置等）· <a href="#" class="sc-showall">显示</a></p>');
        box.classList.toggle("sc-moneyonly", !all);
        var sa = box.querySelector(".sc-showall"); if (sa) sa.onclick = function (e) { e.preventDefault(); box.setAttribute("data-all", "1"); box.classList.remove("sc-moneyonly"); sa.parentNode.remove(); };
        var mb = box.querySelector(".sc-more"); if (mb) mb.onclick = load;
        box.querySelectorAll('[data-cls="lg-oracle"]').forEach(function (r) { r.classList.add("lg-oracle"); });
        box.querySelectorAll(".lg-orc").forEach(function (el) { // 揭晓了就对照：差多少、有没有猜中
          var day = el.getAttribute("data-day"), ps = el.getAttribute("data-ps").split(",");
          fetch("/api/oracle?res=" + day).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.px) { el.innerHTML = ' <i class="lg-orw">⏳ 等揭晓</i>'; return; }
            var px = j.px / 1000, best = Math.min.apply(null, ps.map(function (p) { return Math.abs(Number(p) - px); }));
            el.innerHTML = " <b>揭晓 " + px.toFixed(3) + "</b>" + (best < 0.0005 ? ' <i class="lg-orhit">🎯 完全猜中</i>' : " · 差 " + best.toFixed(3));
          }).catch(function () { el.textContent = ""; });
        });
        first = false;
        var hs = document.getElementById("sc-hsum"), ht = "最近一笔 " + bj(rows[0].t); if (hs && box.id === "sc-lg" && hs.textContent !== ht) hs.textContent = ht;
        if (box.id === "sc-lg") clipLg(box);
        fillNames(box);
      });
    }
    return load();
  }

  function page() {
    var segs = location.hash.split("/").slice(2).map(function (x) { return decodeURIComponent(x || "").trim(); }).filter(Boolean);
    if (segs.length > 1 && /^(tx|address|token)$/.test(segs[0])) segs.shift(); // 兼容 #/scan/tx/哈希、#/scan/address/地址（全站以前指向官方浏览器的链接）
    var q = segs[0] || "", cat = CATS[segs[1]] ? segs[1] : "";
    // 站长 2026-11-12：点「订单查询」不要中转。#/scan/~/otc = 查我自己的：认出钱包就直接跳到结果，认不出才回搜索页
    if (q === "~") {
      A.app.innerHTML = '<section class="card"><p class="muted">查询中…</p></section>';
      var back = function () { if (location.hash.indexOf("#/scan/~") === 0) location.replace("#/scan"); };
      if (!A.wallets || !A.wallets.silent) return back();
      A.wallets.silent().then(function (acc) { if (location.hash.indexOf("#/scan/~") !== 0) return; if (acc) location.replace("#/scan/" + acc + (cat ? "/" + cat : "")); else back(); }, back);
      return;
    }
    /* 站长 2026-11-11：极简——一个高亮大搜索框 + 一行例子，别的都不要 */
    A.app.innerHTML = '<section class="card sc-home"><form class="nm-search sc-search" id="sc-f"><input id="sc-q" placeholder="域名 / 钱包地址 / 交易哈希" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(q) + '"><button type="submit">查询</button></form>' +
      '<p class="muted sc-tip">例：发财.ailgns、0x 开头的地址、交易哈希 · 每一笔都写成人话</p><div id="sc-me"></div></section><div id="sc-out"></div>';
    document.getElementById("sc-f").onsubmit = function (e) {
      e.preventDefault();
      var v = document.getElementById("sc-q").value.trim();
      if (v) location.hash = "#/scan/" + encodeURIComponent(v) + (cat ? "/" + cat : "");
    };
    var out = document.getElementById("sc-out");
    // 自动认出当前钱包：没输东西时直接给「查我的订单」四个按钮，输入框也先填上
    if (A.wallets && A.wallets.silent) A.wallets.silent().then(function (acc) {
      var me = document.getElementById("sc-me"), inp = document.getElementById("sc-q"); if (!acc || !me) return;
      if (inp && !inp.value) inp.value = acc;
      me.innerHTML = '<div class="sc-mine"><span>👤 我的钱包 <b class="mono">' + A.short(acc) + '</b></span>' + catBtns(acc, q.toLowerCase() === acc ? (cat || "all") : "") + "</div>";
    }).catch(function () {});
    if (!q) return;
    var low = q.toLowerCase();
    out.innerHTML = '<section class="card"><p class="muted">查询中…</p></section>';
    var job;
    if (/^0x[0-9a-f]{64}$/.test(low)) job = txView(low, out);
    else if (/^0x[0-9a-f]{40}$/.test(low)) job = addrView(low, out, "", cat);
    else job = nameView(low, out, cat);
    job.catch(function (e) { out.innerHTML = '<section class="card"><p class="nm-bad">查询失败：' + esc(e.message || e) + "</p></section>"; });
  }

  // 域名：没写后缀就两个后缀都查
  function nameView(q, out, cat) {
    var m = q.match(/^(.+)\.(ailgns|lgns)$/), tries = m ? [[m[1], m[2]]] : [[q, "ailgns"], [q, "lgns"]];
    return Promise.all(tries.map(function (t) { return call(NAMES[t[1]], SEL.resolve + str(t[0])).then(function (r) { return { label: t[0], tld: t[1], a: "0x" + r.slice(26) }; }); })).then(function (rs) {
      var hit = rs.filter(function (r) { return r.a !== ZERO; })[0];
      if (!hit) { out.innerHTML = '<section class="card"><p class="nm-bad">没找到「' + esc(q) + '」：这个域名还没注册或已过期</p><p><a href="#/names/' + encodeURIComponent(m ? q : q + ".ailgns") + '">去注册 →</a></p></section>'; return; }
      // 域名正在市场挂单：它暂时托管在市场合约里，别把合约当成主人显示（合约名下是所有在卖的域名）
      if (C.market[hit.a.toLowerCase()]) {
        return fetch("/api/name-market").then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (j) {
          var it = ((j && j.list) || []).filter(function (x) { return x.label === hit.label && x.t === hit.tld; })[0], full = hit.label + "." + hit.tld;
          var p = it ? Number(BigInt(it.price) / 10n ** 12n) / 1e6 : 0;
          out.innerHTML = '<section class="card"><h2>🏷 ' + esc(full) + '</h2><div class="lg-one"><span class="lg-ico">🏷</span><div>这个域名<b>正在域名市场挂单出售</b>' + (it ? "，标价 <b>" + p + " DAI</b>（买家付 " + Math.round(p * 1.03 * 100) / 100 + "，含 3% 手续费）" : "") + "，暂时托管在市场合约里，卖掉前卖家随时可以撤回。</div></div>" +
            (it ? "<p>卖家：" + who(it.maker) + "</p>" : "") +
            '<p><a class="nm-go" href="#/names/' + encodeURIComponent(full) + '">去看这个域名 / 买下它 →</a></p>' + (it ? '<p><a href="#/scan/' + it.maker + '">看卖家的账本 →</a></p>' : "") + "</section>";
          fillNames(out);
        });
      }
      if ((A.hidden && A.hidden[hit.a.toLowerCase()]) || (A.hiddenNames || {})[hit.label + "." + hit.tld]) { out.innerHTML = '<section class="card"><h2>🌐 ' + esc(hit.label + "." + hit.tld) + '</h2><p class="muted">🔒 这个域名的持有人选择匿名，不公开地址。</p></section>'; return; }
      return addrView(hit.a, out, hit.label + "." + hit.tld, cat);
    });
  }

  // 地址拥有的 NFT：官方接口一页 50 个，旧版合约的保留名会占满第一页，所以翻页读完（最多 10 页）
  function allNfts(a) {
    var items = [];
    function page(next, n) {
      var q = next ? "&" + Object.keys(next).map(function (k) { return k + "=" + encodeURIComponent(next[k]); }).join("&") : "";
      return get("/addresses/" + a + "/nft?type=ERC-721" + q).then(function (d) {
        items = items.concat(d.items || []);
        return d.next_page_params && n < 10 ? page(d.next_page_params, n + 1) : { items: items };
      });
    }
    return page(null, 1).catch(function () { return { items: items }; });
  }
  // 🃏 卡牌 / NFT 显示框：AWAKE 卡牌直接读链（刚买完马上就有，不等官方浏览器收录），其它 NFT 用浏览器接口的结果；域名另有一栏，不在这里重复
  var AWAKE = "0x58839f46bd0e3f4494e2beb8ca93da9352208615", CARD_MAX = 60;
  /* 💼 押在别处的（站长 2026-11-25：账本只算钱包里的币，客户押在官方的看不到，以为钱没了 / 以为自己够门槛，工单 #447）。
     只读链上，不动钱。三处：官方 LGNS 质押 360 天、600 天两个合约（getDepositorBalance），官方流动性池里押着的 AiLGNS-LGNS LP（lpOf，按池子存量折成两种币）。
     哪一处读不到就不显示那一行（不当成 0 写出来）；三处都没有就整块不显示。折算用的价和上面余额是同一个（池子标价），只是「大约」 */
  var AWAY = { s360: "0x88ea98af226cd4402a3873400308a4d78784ece6", s600: "0x04ed22c6d1d020a9b5e032e93d79ab28293ef72f", lpMgr: "0x5ddc8a13eabda89593beb885ab8b2afda26a3587", lp: "0xc5029d6e80d2fdce321b2b51010e9ce3b1edf1a2",
    ilo: "0x4ff8e905ab40ed18355b0b2c0dfae8213d5d8d90", ido: "0x5e6d77f8071642561c999e97c1022108b8d5de57" };
  var awayFor = "";
  function awayBox(a, px, fb) {
    awayFor = a; // 读链要几秒：这期间客户又查了别的钱包，晚到的这份就不能画上去
    var big = function (h) { return h && h.length >= 66 ? BigInt(h) : null; }, soft = function (pr) { return pr.then(big, function () { return null; }); };
    Promise.all([
      soft(call(AWAY.s360, "0xb79215d6" + u256(a))), soft(call(AWAY.s600, "0xb79215d6" + u256(a))),
      soft(call(AWAY.lpMgr, "0x963fdeb3" + u256(AWAY.lp) + u256(a))),
      call(AWAY.lp, "0x0902f1ac").catch(function () { return null; }), soft(call(AWAY.lp, "0x18160ddd")),
      /* 站长 2026-11-25：「我账户里还有 ILO 共建代币，没有扫出来」。ILO 共建不是代币，是官方 ILO 合约里的参与记录（投了多少、奖励释放了多少、还能领多少），
         按代币扫不到，要直接问合约：getUserDeposits(address) 每笔 9 个数（DAI 等值、LGNS 数量、LP、价格、时间、期数、总奖励、已领、模式），
         getUserRewardSummary(address) = 奖励总值（DAI）、已释放、已领、现在可领（后三个是 LGNS，9 位小数）。官方 IDO 认购只读投入总额 totalDaiDeposited(address) */
      call(AWAY.ilo, "0x2a5bf6d2" + u256(a)).catch(function () { return null; }), call(AWAY.ilo, "0xc5d304e9" + u256(a)).catch(function () { return null; }),
      soft(call(AWAY.ido, "0xde4a534e" + u256(a)))
    ]).then(function (r) {
      if (awayFor !== a) return;
      var card = document.querySelector(".sc-balc"), old = document.getElementById("sc-away"); if (old) old.remove();
      if (!card) return;
      var rows = [], sum = 0;
      var lg = function (v, name) { if (v === null || v <= 0n) return; var n = Number(v) / 1e9; if (n < 0.01) return; var w = n * (px.LGNS || 0); sum += w; rows.push('<div class="sc-aw"><span><img class="sc-ci" src="icons/tokens/lgns.png?v=1" alt="">' + name + "</span><b>" + fb(n) + " LGNS</b>" + (w ? "<small>≈ " + fb(w) + " DAI</small>" : "") + "</div>"); };
      lg(r[0], "官方质押 · 360 天"); lg(r[1], "官方质押 · 600 天");
      if (r[2] !== null && r[2] > 0n && r[3] && r[3].length >= 130 && r[4] !== null && r[4] > 0n) {
        var ONE = 10n ** 18n, r0 = BigInt("0x" + r[3].slice(2, 66)), r1 = BigInt("0x" + r[3].slice(66, 130));
        var ail = Number(r0 * r[2] / r[4]) / 1e18, lgn = Number(r1 * r[2] / r[4]) / 1e9, w2 = ail * (px.AiLGNS || 0) + lgn * (px.LGNS || 0);
        if (ail > 1e-6 || lgn > 0.01) {
          sum += w2;
          rows.push('<div class="sc-aw"><span><img class="sc-ci" src="icons/tokens/lp.png?v=2" alt="">官方流动性池 · 押着的 LP</span><b>' + fb(Number(r[2] * 100000000n / ONE) / 1e8) + " 个</b><small>里面含 " + fb(ail) + " AiLGNS + " + fb(lgn) + " LGNS" + (w2 ? "，≈ " + fb(w2) + " DAI" : "") + "</small></div>");
        }
      }
      try { // ILO 共建
        var W = function (h) { return (h || "0x").slice(2).match(/.{64}/g) || []; }, dw = W(r[5]), sw = W(r[6]);
        var cnt = dw.length > 1 ? Number(BigInt("0x" + dw[1])) : 0;
        if (cnt > 0 && cnt < 500 && dw.length >= 2 + cnt * 9) {
          var dai = 0, lg2 = 0;
          for (var i = 0; i < cnt; i++) { dai += Number(BigInt("0x" + dw[2 + i * 9])) / 1e18; lg2 += Number(BigInt("0x" + dw[3 + i * 9])) / 1e9; }
          var rel = sw.length >= 4 ? Number(BigInt("0x" + sw[1])) / 1e9 : null, got = sw.length >= 4 ? Number(BigInt("0x" + sw[2])) / 1e9 : null, can = sw.length >= 4 ? Number(BigInt("0x" + sw[3])) / 1e9 : null;
          if (can) sum += can * (px.LGNS || 0);
          rows.push('<div class="sc-aw"><span><img class="sc-ci" src="icons/tokens/lgns.png?v=1" alt="">官方 ILO 共建 · ' + cnt + " 笔</span><b>投入 " + fb(lg2) + " LGNS</b><small>投入时约 " + fb(dai) + " DAI" +
            (rel !== null ? " · 奖励已释放 " + fb(rel) + " LGNS，已领 " + fb(got) + "，现在可领 " + fb(can) : "") + "</small></div>");
        }
      } catch (e) { /* 这一行读不懂就不显示 */ }
      if (r[7] !== null && r[7] > 0n) { var idoDai = Number(r[7]) / 1e18; if (idoDai >= 0.01) rows.push('<div class="sc-aw"><span><img class="sc-ci" src="icons/tokens/dai.png?v=1" alt="">官方 IDO 认购</span><b>投入 ' + fb(idoDai) + " DAI</b><small>释放和领取进度请到官方页面查看</small></div>"); }
      if (!rows.length) return;
      card.insertAdjacentHTML("beforeend", '<div class="sc-away" id="sc-away"><div class="sc-awh"><b>💼 押在别处的</b><span class="muted">' + (sum ? "约 " + fb(sum) + " DAI · " : "") + "不在钱包里</span></div>" + rows.join("") +
        '<p class="muted sc-awn">这些在官方合约里，上面的「账户余额」没有算它们。质押和 LP 要到官方页面取回才能用；ILO、IDO 是参与记录，「约值」只算了现在可领的奖励，本金怎么处理以官方规则为准。</p></div>');
    }).catch(function () { /* 读不到就不显示，不影响别的 */ });
  }
  /* 🔑 授权检查 + 一键取消（站长 2026-11-25：「让客户知道账户有哪些授权是很好的，出个一键取消授权功能」）。
     怎么查：翻这个钱包自己发出的操作（最近 300 笔），挑出「授权」那两种（代币 approve、NFT setApprovalForAll），
     再到链上读现在还剩多少额度——只列现在还生效的。读不到的那一条不列（不乱写）。
     取消 = 用客户自己的钱包把额度改成 0（NFT 是改成「不允许」），本站不经手、不收费（站长问过收 1 DAI，我建议不收：保命的功能收钱，该撤的人就不撤了）。
     只有连着的钱包就是这个地址时才出「取消」按钮 */
  var AP_PAGES = 6;
  function apprBind(a) {
    var btn = document.getElementById("sc-apgo"), box = document.getElementById("sc-apl"); if (!btn || !box) return;
    btn.onclick = function () {
      btn.disabled = true; btn.textContent = "正在查，稍等几秒…";
      apprScan(a).then(function (r) { btn.hidden = true; apprDraw(a, r, box); }, function () { btn.disabled = false; btn.textContent = "没查出来，再点一次"; });
    };
  }
  function apprScan(a) {
    var pairs = {}, pages = 0;
    function page(q) {
      return get("/addresses/" + a + "/transactions?filter=from" + q).then(function (d) {
        (d.items || []).forEach(function (x) {
          var ri = x.raw_input || "", sel = ri.slice(0, 10), tok = x.to && x.to.hash ? x.to.hash.toLowerCase() : "";
          if (!tok || ri.length < 138 || (sel !== "0x095ea7b3" && sel !== "0xa22cb465")) return;
          var sp = "0x" + ri.slice(34, 74).toLowerCase(), k = tok + sp + sel;
          if (/^0x0+$/.test(sp) || pairs[k]) return;
          pairs[k] = { tok: tok, sp: sp, all: sel === "0xa22cb465", name: (x.to && x.to.name) || "" };
        });
        pages++;
        var np = d.next_page_params;
        if (np && pages < AP_PAGES) return page("&" + Object.keys(np).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(np[k]); }).join("&"));
        return !!np;
      });
    }
    return page("").then(function (more) {
      var list = Object.keys(pairs).map(function (k) { return pairs[k]; });
      return Promise.all(list.map(function (x) {
        var q = x.all ? call(x.tok, "0xe985e9c5" + u256(a) + u256(x.sp)) : call(x.tok, "0xdd62ed3e" + u256(a) + u256(x.sp));
        var dec = x.all ? Promise.resolve(0) : call(x.tok, "0x313ce567").then(function (h) { var n = Number(BigInt(h)); return n >= 0 && n <= 36 ? n : 18; }, function () { return 18; });
        return Promise.all([q, dec]).then(function (r) { x.v = r[0] && r[0].length >= 66 ? BigInt(r[0]) : null; x.dec = r[1]; return x; }, function () { x.v = null; return x; });
      })).then(function (ls) { return { list: ls.filter(function (x) { return x.v !== null && x.v > 0n; }), more: more }; });
    });
  }
  function apprDraw(a, r, box) {
    var me = isMe(a), short = function (z) { return z.slice(0, 6) + "…" + z.slice(-4); };
    var kind = function (x) { return FLAG[x.sp] ? 0 : (KNOWN[x.sp] || REG[x.sp]) ? 2 : 1; }; // 0 被报案 1 不认识 2 认识
    var ls = r.list.sort(function (x, y) { return kind(x) - kind(y); });
    if (!ls.length) { box.innerHTML = '<p class="sc-apok">✅ 没查到还在生效的授权。</p>' + (r.more ? '<p class="muted">只查了这个钱包最近 300 笔操作，更早做的授权这里看不到。</p>' : ""); return; }
    var unk = ls.filter(function (x) { return kind(x) === 1; }).length, bad = ls.filter(function (x) { return kind(x) === 0; }).length;
    box.innerHTML = (bad ? '<p class="sc-apdanger">🚨 有 ' + bad + " 个授权给了<b>风险合约</b>（被客户报案的地址）。请马上取消，它现在还能动你的币。</p>" : "") +
      '<p class="' + (unk ? "sc-apwarn" : "sc-apok") + '">' + (unk ? "⚠️ 有 " + unk + " 个授权给了未知合约（不是本站的，也不在官方名单里）。不认识就建议取消。" : bad ? "其余的授权都是给本站或官方合约的。" : "✅ 现在生效的 " + ls.length + " 个授权，都是给本站或官方合约的，属于正常使用。") + "</p>" +
      ls.map(function (x, i) {
        var k = kind(x), tok = C.tokens[x.tok] || (OFFICIAL[x.tok] ? OFFICIAL[x.tok].replace(/ 代币$/, "").replace(/ 池子$/, " 的 LP") : "") || x.name || short(x.tok);
        var our = !!OURS[x.sp], off = !!OFFICIAL[x.sp];
        /* 站长 2026-11-25：「官方合约也标记一下，其它标记未知合约，风险合约要警示出来」→ 四种标签：本站（绿）/ 官方（紫）/ 未知（橙）/ 风险（红，目前 = 被客户报案的地址） */
        var who2 = k === 0 ? '<b class="sc-aptag bad">🚨 风险合约 · 被客户报案</b>' : our ? '<b class="sc-apsafe">✅ 本站合约 · 安全</b>' + (KNOWN[x.sp] ? " " + KNOWN[x.sp] : "") : off ? '<b class="sc-aptag off">🏛 官方合约</b> ' + esc(OFFICIAL[x.sp]) : KNOWN[x.sp] ? "<b>" + KNOWN[x.sp] + "</b>" : REG[x.sp] ? "<b>已登记的合约</b>" : '<b class="sc-aptag unk">❓ 未知合约</b>';
        var amt2 = x.all ? "这个合约里你所有的 NFT（域名 / 卡牌）" : x.v > (1n << 200n) ? "不限数量" : "最多 " + amt(x.v.toString(), x.dec);
        return '<div class="sc-ap' + (k === 0 ? " bad" : k === 1 ? " unk" : our ? " safe" : off ? " off" : "") + '"><div class="sc-apt"><span>能动你的 <b>' + esc(tok) + "</b></span><small>" + amt2 + '</small></div><div class="sc-apw">给了 ' + who2 + ' <span class="mono muted">' + short(x.sp) + "</span></div>" +
          (me ? '<button type="button" class="' + (k < 2 ? "nm-go" : "ghost") + ' sc-apx" data-apx="' + i + '">取消这个授权</button><p class="muted nm-st sc-aps"></p>' : "") + "</div>";
      }).join("") +
      (me ? '<p class="muted">给本站、官方合约的授权是平时交易要用的，取消后下次用到时钱包会让你重新授权一次，不影响资产。</p>' : '<p class="muted">用这个钱包连接本站后，每一条后面会出现「取消这个授权」按钮。</p>') +
      (r.more ? '<p class="muted">只查了这个钱包最近 300 笔操作，更早做的授权这里看不到。</p>' : "");
    Array.prototype.forEach.call(box.querySelectorAll("[data-apx]"), function (b) {
      b.onclick = function () {
        var x = ls[Number(b.getAttribute("data-apx"))], st = b.parentNode.querySelector(".sc-aps"), K2 = A.otcKit; if (!x || !K2 || b.disabled) return;
        var say = function (t, bad) { st.textContent = t; st.className = (bad ? "nm-bad" : "muted") + " nm-st sc-aps"; };
        b.disabled = true; say("正在连接钱包…");
        try { K2.useMarket("ailgns"); } catch (e) { /* 只是为了让下面在 Anubis 链上发 */ }
        K2.ready().then(function () {
          if (!isMe(a)) throw new Error("现在连着的不是这个钱包，取消不了");
          return K2.send(x.tok, x.all ? "0xa22cb465" + u256(x.sp) + u256(0) : "0x095ea7b3" + u256(x.sp) + u256(0), function (t) { say(t); }, "取消授权");
        }).then(function () { b.hidden = true; say("✅ 已取消，这个合约动不了你的币了。"); }, function (e) { b.disabled = false; say("没取消成：" + ((e && e.message) || e), true); });
      };
    });
  }
  function awakeCards(a) {
    return call(AWAKE, "0x70a08231" + u256(a)).then(function (h) {
      var n = Number(BigInt(h || "0x0")), idx = [];
      for (var i = 0; i < Math.min(n, CARD_MAX); i++) idx.push(i);
      return Promise.all(idx.map(function (i) { return call(AWAKE, "0x2f745c59" + u256(a) + u256(i)).then(function (r) { return BigInt(r).toString(); }, function () { return null; }); }))
        .then(function (ids) { return { n: n, ids: ids.filter(Boolean).sort(function (x, y) { return Number(x) - Number(y); }) }; });
    });
  }
  function cardsBox(a, nftJob) {
    var el = function (id) { return document.getElementById(id); };
    var sec = el("sc-cardc"); if (!sec) return;
    if (A.hidden && A.hidden[String(a).toLowerCase()]) return;
    Promise.all([awakeCards(a).catch(function () { return null; }), nftJob.catch(function () { return { items: [] }; })]).then(function (r) {
      var box = el("sc-cards"); if (!box || !el("sc-cardc")) return;
      var aw = r[0], other = ((r[1] && r[1].items) || []).filter(function (n) { var t = ((n.token || {}).address_hash || "").toLowerCase(); return t && t !== NAMES.ailgns && t !== NAMES.lgns && t !== AWAKE && OFFICIAL[t] && false; }); /* 站长 2026-11-25 再定：生产权 NFT 也「不要展示」（它不能转让、不能卖，放在这里没用）→ 这一栏只剩 AWAKE 卡牌 */ /* 站长 2026-11-25：这一栏只展示官方的（卡牌、官方发的其它 NFT / 徽章）；本站域名在下面「域名」那一栏。来历不明的 NFT 不显示——谁都能往别人钱包里塞 NFT，骗子常用这招引人去点 */
      var total = (aw ? aw.n : 0) + other.length, me = isMe(a);
      if (!total && !me) return; // 别人的钱包没有卡牌：不显示这一栏
      sec.hidden = false;
      el("sc-ch").textContent = "🃏 " + (me ? "我的卡牌" : "TA 的卡牌") + "（" + total + "）";
      if (!aw && !other.length) { box.innerHTML = '<p class="muted">卡牌暂时没读出来，刷新一下再看。</p>'; return; }
      if (!total) { box.innerHTML = '<p class="muted">这个钱包里现在没有卡牌。刚买的等几秒刷新一下；正在挂单出售的卡托管在市场里，卖掉或撤单前不在钱包。<a href="#/otc/nft">去卡牌市场 →</a></p>'; return; }
      var tiles = (aw ? aw.ids : []).map(function (id) { return '<a class="sc-nft sc-nftc" href="#/otc/nft"><img src="icons/nft/awake-card.jpg?v=1" alt="AWAKE 卡牌" width="130" height="200"><b>#' + esc(id) + "</b><small>AWAKE 卡牌</small></a>"; }) /* 图是官方网站「我的 NFT」里用的那张卡面（官方每张卡都显示同一张图，合约里没有单独的图片） */
        .concat(other.slice(0, CARD_MAX).map(function (n) { return '<span class="sc-nft"><i>🖼</i><b>#' + esc(String(n.id).slice(0, 10)) + "</b><small>🏛 " + esc(String(OFFICIAL[(n.token.address_hash || "").toLowerCase()] || n.token.symbol || "官方 NFT").slice(0, 14)) + "</small></span>"; }));
      var more = total - tiles.length;
      box.innerHTML = '<div class="sc-nfts">' + tiles.join("") + "</div>" + (more > 0 ? '<p class="muted">还有 ' + more + " 张没列出</p>" : "") +
        (aw && aw.n ? '<p class="muted sc-nftn">卡牌就在这个钱包里，钱包 App 不一定显示，以这里（链上）为准。</p>' : "");
    });
  }
  // ===== 正在进行中：这个地址在本站的挂单、借贷、预言（机器人会告诉客户的事，这里也能看）=====
  var MK = { ailgns: { sym: "AiLGNS", dec: 18, chain: "Anubis" }, lgns: { sym: "LGNS", dec: 9, chain: "Anubis" }, glgns: { sym: "gLGNS", dec: 18, chain: "Anubis" }, lp: { sym: "LP", dec: 18, chain: "Anubis" }, rm: { sym: "RM", dec: 9, chain: "Anubis" }, plgns: { sym: "LGNS", dec: 9, chain: "Polygon" } };
  var LOANS = { ailgns: { c: "0x242ab392571d325d814a48892ac16115a6d285dc", sym: "AiLGNS", dec: 18 }, lgns: { c: "0x439cb33e9c5d7a26dd1fa503efe6fd3033ac173b", sym: "LGNS", dec: 9 }, glgns: { c: "0x00e674bb1559557966a6c2244c36d12a63218a5f", sym: "gLGNS", dec: 18 } };
  var big = function (x, dec) { var b = BigInt(x); return dec >= 6 ? Number(b / BigInt(10) ** BigInt(dec - 6)) / 1e6 : Number(b) / Math.pow(10, dec); };
  var fmtA = function (v) { return v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v >= 1 ? +v.toFixed(4) : v > 0 && v < 1e-4 ? small(v) : +v.toPrecision(4); };
  var leftT = function (sec) { if (sec <= 0) return "已到期"; var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? d + " 天 " + h + " 小时" : h ? h + " 小时 " + m + " 分" : m + " 分钟"; };
  var wordsOf = function (r) { return (r || "0x").slice(2).match(/.{64}/g) || []; };
  function posRow(ico, html, href, cta, just, x) {
    x = x || {};
    var me = A.otcKit && A.otcKit.account && A.otcKit.account();
    var btn = x.cancel && me && x.owner === me ? '<button type="button" class="sc-cancel" data-cancel="' + x.id + '" data-k="' + x.k + '">撤单</button>' : "";
    if (x.cancel && x.owner && (!me || x.owner !== me)) x.st = (x.st || "") + '<div class="sc-guide">这是你的单？右上角连接挂单的钱包，这里就会出现「撤单」按钮。想改价：撤单（币马上退回钱包）→ 去 OTC 按新价重新挂。到期的单币会自动退回，不用管。</div>';
    else if (btn) x.st = (x.st || "") + '<div class="sc-guide">想改价：点「撤单」（钱包确认一次，币马上退回钱包）→ 去 <a href="#/otc">OTC</a> 按新价重新挂一张。到期的单币会自动退回。</div>';
    return '<div class="lg-row' + (just ? " lg-just" : "") + '"><span class="lg-ico">' + (just ? '<i class="lg-justtag">刚挂的</i>' : "") + '' + ico + '</span><div class="lg-main"><div class="lg-txt">' + html + "</div>" + (x.st ? '<div class="sc-stl">' + x.st + "</div>" : "") + "</div><span class=\"lg-acts\">" + btn + (href ? '<a class="lg-link" href="' + href + '">' + (cta || "去处理 ›") + "</a>" : "") + "</span></div>";
  }
  // 账本里直接撤单：切到对应市场，走 OTC 同一套 cancel（普通用户操作，不碰管理权限）
  function bindCancel(box, a, reload) {
    box.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.onclick = function () {
        var K = A.otcKit, id = b.getAttribute("data-cancel"), k = b.getAttribute("data-k");
        if (!K || !K.useMarket) return;
        if (!(A.sure || confirm)("确定撤单 #" + id + "？撤了币马上退回你的钱包。")) return;
        b.disabled = true; b.textContent = "撤单中…";
        K.useMarket(k);
        K.ready().then(function () { return K.send(K.OTC(), "0x40e58ee5" + K.u256(id), function (t) { b.textContent = t.slice(0, 12); }, "撤单 #" + id); })
          .then(function () { b.textContent = "✅ 已撤回"; if (A.just) A.just.set("otc", k); setTimeout(reload, 2500); })
          .catch(function (e) { b.disabled = false; b.textContent = "撤单"; A.errTip(K.niceError ? K.niceError(e) : (e && e.message) || e, b); });
      };
    });
  }
  // 一键批量撤单（站长 2026-11-12：挂单太多，一张张点很累）：只撤自己的 OTC 挂单，按市场分组，走 OTC 页同一套「一键撤销」
  // 钱包支持一次确认发一串就只确认一次；不支持就连着弹，每张只点一下确认。不改合约，和客户自己一张张撤完全一样
  function bindCancelAll(box, reload) {
    var bs = box.querySelectorAll("[data-cancel]"); if (bs.length < 2 || !box.parentNode) return;
    var bar = document.createElement("div"); bar.className = "sc-call";
    bar.innerHTML = '<button type="button" class="sc-callbtn">🧹 一键撤掉全部 OTC 挂单（' + bs.length + ' 张）</button><div class="sc-callbar" hidden><i></i></div><p class="sc-callst" hidden></p>';
    box.parentNode.insertBefore(bar, box);
    var btn = bar.querySelector("button"), st = bar.querySelector(".sc-callst"), pb = bar.querySelector(".sc-callbar");
    function say(t, bad) { st.hidden = false; st.className = "sc-callst" + (bad ? " down" : ""); st.textContent = t; }
    btn.onclick = function () {
      var K = A.otcKit; if (!K || !K.useMarket || !K.cancelMany) return;
      var by = {}, ks = [], n = 0;
      box.querySelectorAll("[data-cancel]").forEach(function (b) { if (b.disabled) return; var k = b.getAttribute("data-k"); if (!by[k]) { by[k] = []; ks.push(k); } by[k].push(Number(b.getAttribute("data-cancel"))); n++; });
      if (!n) return;
      // 站长 2026-11-12：点之前先说清楚钱包会弹几次、要多久（以前客户以为点一次就完，钱包连着弹以为出错了）
      var secs = n * 3, how = secs < 60 ? secs + " 秒" : Math.ceil(secs / 60) + " 分钟";
      if (!(A.sure || confirm)("要撤掉全部 " + n + " 张 OTC 挂单吗？\n\n① 钱包会连着弹出 " + n + " 次，每次点「确认」就行\n② 不用等，连着点完，大约 " + how + "\n③ 币全部退回你的钱包，不收费" + (ks.length > 1 ? "\n④ 你的单分在 " + ks.length + " 个市场，会一个市场一个市场撤" : "") + "\n\n（少数钱包支持一次确认，那就只弹 1 次）")) return;
      btn.disabled = true; say("正在连接钱包…");
      var i = 0, base = 0;
      function prog(d) { pb.hidden = false; pb.firstChild.style.width = Math.round((base + d) / n * 100) + "%"; }
      (function next() {
        if (i >= ks.length) return Promise.resolve();
        var k = ks[i++], tag = ks.length > 1 && MK[k] ? "【" + MK[k].chain + " " + MK[k].sym + "】" : "";
        K.useMarket(k);
        return K.cancelMany(by[k], function (t) { say(tag + t); }, prog).then(function () { base += by[k].length; prog(0); if (A.just) A.just.set("otc", k); return next(); });
      })().then(function () { say("✅ " + n + " 张全部撤掉了，币已退回你的钱包"); setTimeout(reload, 2500); },
        function (e) { btn.disabled = false; say((K.niceError ? K.niceError(e) : (e && e.message) || String(e)) + "（已撤的不受影响，刷新页面后再点一次撤剩下的）", true); });
    };
  }
  function positions(a, box) {
    var now = Date.now() / 1000, out = [];
    var jobs = [];
    // OTC 挂单（四个币市场）
    Object.keys(MK).forEach(function (k) {
      var freshQ = A.otcKit && A.otcKit.account && A.otcKit.account() === a && A.just && A.just.list("otc").length ? "&fresh=1" : "";
      // 窗口里的最近 1000 张 + 窗口之外自己更早挂的单（市场超过 1000 张后老单会被挡住，客户以为单子丢了）
      jobs.push(Promise.all([fetch("/api/book?m=" + k + freshQ).then(function (r) { return r.json(); }), fetch("/api/book?m=" + k + "&mine=" + a + freshQ).then(function (r) { return r.json(); }).catch(function () { return { older: [] }; })]).then(function (dd) {
        var d = dd[0], w = wordsOf(d.orders), n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0, from = Number(d.from || 0), m = MK[k];
        var rows = []; for (var i = 0; i < n; i++) rows.push({ id: from + i, o: w.slice(2 + i * 7, 9 + i * 7) });
        (dd[1].older || []).forEach(function (x) { if (x.id < from) rows.push(x); });
        for (var r2 = 0; r2 < rows.length; r2++) {
          var o = rows[r2].o, oid = rows[r2].id; if (!o || o.length < 7) continue;
          var maker = "0x" + o[0].slice(24), sell = o[1].slice(-1) === "1", open = o[2].slice(-1) === "1", exp = Number(BigInt("0x" + o[3])), gT = BigInt("0x" + o[4]), wT = BigInt("0x" + o[5]), gL = BigInt("0x" + o[6]);
          if (maker !== a || !open || exp <= now || gL === 0n) continue;
          var giveLeft = big(gL, sell ? m.dec : 18), wantLeft = gT > 0n ? big(gL * wT / gT, sell ? 18 : m.dec) : 0;
          var px = sell ? (giveLeft ? wantLeft / giveLeft : 0) : (wantLeft ? giveLeft / wantLeft : 0);
          var lockTxt = sell ? fmtA(giveLeft) + " " + m.sym : fmtA(giveLeft) + " DAI";
          out.push({ t: exp, k: k, id: oid, cancel: true, st: '<span class="sc-st ok">✅ 挂单中 · 你的 ' + lockTxt + ' 安全锁在 OTC 托管合约里，没成交随时撤回，到期自动退回</span>',
            html: sell ? "<b>OTC 挂单卖出</b> " + fmtA(giveLeft) + " " + m.sym + "，要价 " + fmtA(wantLeft) + " DAI（单价 " + px.toFixed(3) + "）· 剩 " + leftT(exp - now) + (m.chain === "Polygon" ? " · Polygon 链" : "")
            : "<b>OTC 挂单买入</b> " + fmtA(wantLeft) + " " + m.sym + "，锁定 " + fmtA(giveLeft) + " DAI（单价 " + px.toFixed(3) + "）· 剩 " + leftT(exp - now) + (m.chain === "Polygon" ? " · Polygon 链" : ""), href: "#/otc" + (k === "ailgns" ? "" : "/" + k), cta: "去 OTC 看 ›", ico: "📌" });
        }
      }).catch(function () {}));
    });
    // 域名挂单
    var meNow = A.otcKit && A.otcKit.account && A.otcKit.account() === a; // 查自己：跳过缓存，刚挂的单马上能看到
    jobs.push(fetch("/api/name-market" + (meNow ? "?f=1" : "")).then(function (r) { return r.json(); }).then(function (d) {
      (d.list || []).forEach(function (x) {
        if (x.maker !== a) return;
        var p = big(x.price, 18), just = A.just && A.just.has("names", x.label + "." + x.t);
        out.push({ t: x.expiry, just: just, st: '<span class="sc-st ok">✅ 在卖 · 名字安全托管在域名市场合约里，没卖掉随时撤回（到「域名 → 我的挂单」撤单）</span>', html: "<b>域名挂单出售</b> " + esc(x.label + "." + x.t) + "，标价 " + fmtA(p) + " DAI · 剩 " + leftT(x.expiry - now), href: "#/names/" + encodeURIComponent(x.label + "." + x.t), ico: just ? "🆕" : "🏷" });
      });
    }).catch(function () {}));
    // 借贷（借款单 / 出借单 / 借款中）
    Object.keys(LOANS).forEach(function (k) {
      var L = LOANS[k];
      jobs.push(call(L.c, "0x9d11ed75").then(function (h) {
        var count = Number(BigInt(h)), from = Math.max(0, count - 1000);
        if (!count) return;
        return call(L.c, "0x86b20104" + u256(from) + u256(count - from)).then(function (r) {
          var w = wordsOf(r), n = w.length > 1 ? Number(BigInt("0x" + w[1])) : 0;
          for (var i = 0; i < n; i++) {
            var o = w.slice(2 + i * 10, 12 + i * 10); if (o.length < 10) break;
            var br = "0x" + o[0].slice(24), ld = "0x" + o[1].slice(24), isOffer = o[2].slice(-1) === "1", st = Number(BigInt("0x" + o[3])), exp = Number(BigInt("0x" + o[4])), term = Number(BigInt("0x" + o[5])), due = Number(BigInt("0x" + o[6]));
            var col = big("0x" + o[7], L.dec), prin = big("0x" + o[8], 18), rep = big("0x" + o[9], 18);
            if (br !== a && ld !== a) continue;
            if (st === 0 && exp > now) {
              if (isOffer && ld === a) out.push({ t: exp, st: '<span class="sc-st ok">✅ 等人来借 · 你的 DAI 安全锁在借贷合约里，没人借随时撤回</span>', html: "<b>出借单挂着</b>：锁定 " + fmtA(prin) + " DAI 等人来借，到期收 " + fmtA(rep) + " DAI（" + Math.round(term / 86400) + " 天）· 剩 " + leftT(exp - now), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "📣" });
              else if (!isOffer && br === a) out.push({ t: exp, st: '<span class="sc-st ok">✅ 等人来借给你 · 你的抵押币安全锁在借贷合约里，没人接随时撤回</span>', html: "<b>借款单挂着</b>：抵押 " + fmtA(col) + " " + L.sym + "，想借 " + fmtA(prin) + " DAI，到期还 " + fmtA(rep) + " DAI（" + Math.round(term / 86400) + " 天）· 剩 " + leftT(exp - now), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "🤝" });
            } else if (st === 1) {
              if (br === a) out.push({ t: due, st: '<span class="sc-st warn">⏳ 借款中 · 抵押币锁在借贷合约里，到期前还款就退回</span>', html: "<b>借款中</b>：借了 " + fmtA(prin) + " DAI，到期要还 <b>" + fmtA(rep) + " DAI</b>，抵押 " + fmtA(col) + " " + L.sym + " · " + (due > now ? "还剩 " + leftT(due - now) + "，记得按时还" : "<b class=\"nm-bad\">已过期，抵押可能被处置</b>"), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "💰" });
              else out.push({ t: due, st: '<span class="sc-st ok">✅ 出借中 · 本金已借出，到期对方还款直接到你钱包；逾期抵押币归你</span>', html: "<b>出借中</b>：借出 " + fmtA(prin) + " DAI，到期收回 " + fmtA(rep) + " DAI · " + (due > now ? "还剩 " + leftT(due - now) : "<b>已到期</b>，对方没还可以处置抵押"), href: "#/lend" + (k === "ailgns" ? "" : "/" + k), ico: "💵" });
            }
          }
        });
      }).catch(function () {}));
    });
    // 预言家本轮预测
    jobs.push(fetch("/api/oracle?a=" + a).then(function (r) { return r.json(); }).then(function (d) {
      var me = d.me || {};
      if (me.ps && me.ps.length) out.push({ t: 0, html: "<b>预言家</b>：本轮已预测 " + me.ps.map(function (p) { return "<b>" + p + "</b>"; }).join("、") + (me.n ? "（" + me.used + "/" + me.n + " 次）" : "") + "，晚 9–10 点揭晓", href: "#/oracle", ico: "🔮", cta: "看排行 ›" });
    }).catch(function () {}));
    return Promise.all(jobs).then(function () {
      if (!box) return out;
      if (!box.isConnected) return out;
      var oc0 = box.parentNode && box.parentNode.querySelector(".sc-call"); if (oc0) oc0.remove();
      if (!out.length) { box.innerHTML = '<p class="muted">现在没有挂着的单、没有借贷、没有预测 · <a href="#/otc">去 OTC 挂一单 →</a></p>'; var ps0 = document.getElementById("sc-possum"); if (ps0) ps0.textContent = "暂时没有"; return out; }
      // 刚挂的 OTC 单：同一市场里编号最大的那张高亮
      if (A.just) A.just.list("otc").forEach(function (j) { var cand = out.filter(function (x) { return x.k && (!j.key || x.k === j.key); }); if (cand.length) { var top = cand.reduce(function (m, x) { return x.id > m.id ? x : m; }); top.just = true; top.ico = "🆕"; } });
      out.sort(function (x, y) { return (y.just ? 1 : 0) - (x.just ? 1 : 0); }); // 刚操作的排最前
      var soon = out.filter(function (x) { return x.t && x.t * 1000 - Date.now() < 86400e3 && x.t * 1000 > Date.now(); }).length, expired = out.filter(function (x) { return x.t && x.t * 1000 <= Date.now(); }).length;
      out.forEach(function (x) { if (x.t && x.t * 1000 - Date.now() < 86400e3 && x.t * 1000 > Date.now()) x.html = '<span class="sc-soon">⏰ 24 小时内到期</span> ' + x.html; });
      var ps = document.getElementById("sc-possum"); if (ps) ps.textContent = "共 " + out.length + " 件" + (soon ? " · ⏰ " + soon + " 件快到期" : "") + (expired ? " · " + expired + " 件已到期（会自动退回）" : "");
      box.innerHTML = out.map(function (x) { x.owner = a; return posRow(x.ico, x.html, x.href, x.cta, x.just, x); }).join("");
      bindCancel(box, a, function () { positions(a, box); });
      bindCancelAll(box, function () { positions(a, box); });
      fillNames(box);
      return out;
    });
  }
  // 给客服机器人用：这个钱包正在进行中的事，纯文字一行一条
  A.myPositions = function (a) { return positions(String(a).toLowerCase(), null).then(function (out) { return (out || []).map(function (x) { return x.html.replace(/<[^>]+>/g, ""); }); }).catch(function () { return []; }); };

  // ===== 留言：列表、写信、发送（0 元交易带 data，钱包签名，只花 Gas）=====
  var SEEN_KEY = "msgSeen";
  function msgRow(a, m) {
    var mine = m.from === a, other = mine ? m.to : m.from, otherName = mine ? m.toName : m.fromName;
    var d = new Date(m.t + 8 * 3600e3), when = (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
    return '<div class="lg-row' + (mine ? " msg-me" : "") + '"><span class="lg-ico">' + (mine ? "💬" : "📬") + '</span><div class="lg-main"><div class="lg-txt">' + (mine ? "我 → " : "") + '<a href="#/scan/' + other + '"><b>' + esc(otherName || A.short(other)) + "</b></a>" + (mine ? "" : " → 我") + '：' + esc(m.txt) + '</div><small>' + when + "</small></div>" + (mine ? "" : '<a class="lg-link" href="#/scan/' + other + '">回复 ›</a>') + "</div>";
  }
  function messages(a, via) {
    var box = document.getElementById("sc-msgs"), btn = document.getElementById("sc-msgbtn"), form = document.getElementById("sc-msgbox"), ta = document.getElementById("sc-mtxt"), st = document.getElementById("sc-mst"), n = document.getElementById("sc-mn");
    if (!box || !btn) return; /* 留言区不在页面上（客户已经切到别的页） */
    var me = A.otcKit && A.otcKit.account && A.otcKit.account();
    if (me && me === a) { btn.textContent = "📬 这是我的信箱"; btn.disabled = true; try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {} var pill = document.getElementById("msg-pill"); if (pill) pill.remove(); }
    fetch("/api/msg?a=" + a).then(function (r) { return r.json(); }).then(function (d) {
      if (!box.isConnected) return;
      var list = d.list || [];
      box.innerHTML = list.length ? list.slice(0, 50).map(function (m) { return msgRow(a, m); }).join("") : '<p class="muted">还没有留言。' + (me === a ? "" : "点右上角「💬 给 TA 留言」，第一个打招呼。") + "</p>";
    }, function () { box.innerHTML = '<p class="muted">留言读取失败</p>'; });
    btn.onclick = function () { form.hidden = !form.hidden; if (!form.hidden) ta.focus(); };
    ta.oninput = function () { n.textContent = Array.from(ta.value).length; };
    document.getElementById("sc-msend").onclick = function () {
      var txt = ta.value.trim(), sb = this;
      if (!txt) return A.errTip("先写点什么", ta);
      if (Array.from(txt).length > 200) return A.errTip("最多 200 字", ta);
      if (/https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|xyz|io|app|cc|top|vip|cn|me|link|site|online|shop|pro)\b|t\.me|微信|微信号|vx|wx|weixin|wechat|qq|扣扣|电报|telegram|tg|飞机|whatsapp|line\b|手机号|电话|加我|加一下|私聊|私信我|联系方式|联系我|\d{11}/i.test(txt)) return A.errTip("🛡️ 留言里不能有网址或联系方式（微信、QQ、电报、手机号等）。为了防骗，所有交流只在链上进行，骗子才会让你加联系方式。请删掉再发。", ta);
      var say = function (t) { st.textContent = t; };
      sb.disabled = true;
      var acct;
      A.otcKit.connect().then(function (acc) {
        acct = acc;
        if (acct === a) throw new Error("不能给自己留言");
        say("检查发信资格…");
        return nameOf(acct);
      }).then(function (nm) {
        if (!nm) throw new Error("只有注册了 .ailgns 域名并设为主名字的钱包才能发信。去「域名」页注册一个（最低 5 DAI），设为主名字后再来");
        say("🔒 这是一笔 0 元转账，文字放在交易里，只花约 0.001 DAI 的 Gas。请在钱包确认");
        var eth = W.get();
        return A.wallets.ask(eth, { method: "eth_sendTransaction", params: [{ from: acct, to: a, value: "0x0", data: encodeMsg(txt) }] });
      }).then(function (hash) {
        say("已提交，等待链上确认…");
        return W.waitOn("anubis", hash).then(function () { return hash; });
      }).then(function (hash) {
        say("链上已确认，正在通知对方…");
        return fetch("/api/msg", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: hash }) }).then(function (r) { return r.json(); });
      }).then(function (r) {
        if (r.error) throw new Error(r.error);
        say("✅ 留言已上链" + (r.notified ? "，对方的 DeBox 已收到提醒" : "，对方进站就能看到"));
        ta.value = ""; n.textContent = "0";
        if (r.item) { var empty = box.querySelector("p.muted"); if (empty) empty.remove(); box.insertAdjacentHTML("afterbegin", msgRow(a, r.item)); }
        sb.disabled = false;
      }).catch(function (e) { sb.disabled = false; say(""); A.errTip((e && (e.message || e.reason)) || String(e), sb); });
    };
  }
  // 全站：连过钱包的人有新留言时，左下角出现小提示
  function msgPill() {
    if (!A.wallets || !A.wallets.silent) return;
    A.wallets.silent().then(function (acc) {
      if (!acc) return;
      acc = String(acc).toLowerCase();
      var seen = 0; try { seen = Number(localStorage.getItem(SEEN_KEY) || 0); } catch (e) {}
      return fetch("/api/msg?a=" + acc).then(function (r) { return r.json(); }).then(function (d) {
        var fresh = (d.list || []).filter(function (m) { return m.to === acc && m.t > seen; }).length;
        if (!fresh || document.getElementById("msg-pill")) return;
        var el = document.createElement("a"); el.id = "msg-pill"; el.className = "msg-pill"; el.href = "#/scan/" + acc; el.textContent = "📬 " + fresh + " 条新留言";
        document.body.appendChild(el);
      });
    }).catch(function () {});
  }
  setTimeout(msgPill, 4000);

  // 地址：我的钱、我的域名、我做过的事
  // ===== 订单分类：OTC / 借贷 / 域名 / 其他（全站「查订单」都走这里）=====
  var CATS = { all: "全部", otc: '<i class="gd-xin">信</i> OTC', loan: "🤝 借贷", names: "🌐 域名", other: "✨ 其他" };
  function catOf(txt) { return /域名|注册|续费|\.ailgns|\.lgns|主名字|转赠|置顶|名字/.test(txt) ? "names" : /借|还款|出借|抵押|逾期|利息/.test(txt) ? "loan" : /OTC|挂单|吃单|成交|撤单|买入|卖出|盘口|求购|手续费|套利|回购/.test(txt) ? "otc" : "other"; }
  function catBtns(a, cur) { return '<div class="seg sc-cats">' + Object.keys(CATS).map(function (k) { return '<a href="#/scan/' + a + (k === "all" ? "" : "/" + k) + '" data-cat="' + k + '"' + (k === cur ? ' class="on"' : "") + ">" + CATS[k] + '<b class="sc-n" hidden></b></a>'; }).join("") + "</div>"; }
  // 「在本站的事」：每个分类按钮上标出有几单（OTC 2 · 借贷 0…），一眼看到有没有订单挂着
  function posCounts(root) {
    var pos = root.querySelector("#sc-pos"); if (!pos) return;
    var n = { all: 0, otc: 0, loan: 0, names: 0, other: 0 };
    pos.querySelectorAll(".lg-row").forEach(function (r) { if (!r.getAttribute("data-cat")) r.setAttribute("data-cat", catOf(r.textContent || "")); n.all++; n[r.getAttribute("data-cat")] = (n[r.getAttribute("data-cat")] || 0) + 1; });
    root.querySelectorAll("#sc-posc .sc-cats a").forEach(function (b) { var k = b.getAttribute("data-cat"), c = n[k] || 0, e = b.querySelector(".sc-n"); var t = c ? c + " 单" : "0"; e.hidden = false; if (e.textContent !== t) e.textContent = t; b.classList.toggle("has", c > 0); }); // 只在变了才写，不然会触发 MutationObserver 死循环
    var sum = document.getElementById("sc-possum"), st = n.all ? "共 " + n.all + " 单在挂" : "没有在挂的订单"; if (sum && sum.textContent !== st) sum.textContent = st;
  }
  function applyCat(root, cat) {
    root.querySelectorAll(".lg-row").forEach(function (r) {
      if (r.closest("#sc-msgs")) return; // 留言不是订单，不参与筛选
      if (!r.getAttribute("data-cat")) r.setAttribute("data-cat", catOf(r.textContent || ""));
      r.classList.toggle("sc-hide", !!cat && cat !== "all" && r.getAttribute("data-cat") !== cat);
    });
    posCounts(root);
    var call = root.querySelector(".sc-call"); if (call) call.hidden = !!cat && cat !== "all" && cat !== "otc"; // 批量撤单只在「全部 / OTC」里出现
    root.querySelectorAll(".lg-list:not(#sc-msgs)").forEach(function (l) {
      var vis = l.querySelectorAll(".lg-row:not(.sc-hide)").length, none = l.querySelector(".sc-none");
      if (!vis && cat && cat !== "all" && l.querySelector(".lg-row") && !none) { none = document.createElement("p"); none.className = "muted sc-none"; none.textContent = "这一类暂时没有"; l.appendChild(none); }
      if (none && (vis || !cat || cat === "all")) none.remove();
    });
  }
  // 给其它页面用的「查订单」条：输入框自动填当前钱包，四个分类按钮，一键到账本
  A.orderQuery = function (host, cat) {
    host.innerHTML = '<section class="card oq"><form class="oq-f"><span class="oq-l">📋 查我的订单</span><input class="oq-in" placeholder="钱包地址 / 域名（连过钱包会自动填）" autocomplete="off" autocapitalize="none" spellcheck="false">' +
      '<span class="seg oq-seg">' + ["otc", "loan", "names", "other"].map(function (k) { return '<button type="button" data-c="' + k + '"' + (k === cat ? ' class="on"' : "") + ">" + CATS[k] + "</button>"; }).join("") + '</span><button type="submit" class="oq-go">查询</button></form></section>';
    var inp = host.querySelector(".oq-in"), seg = host.querySelector(".oq-seg"), c = cat || "otc";
    seg.onclick = function (e) { var b = e.target.closest("button[data-c]"); if (!b) return; c = b.getAttribute("data-c"); seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); if (inp.value.trim()) go(true); };
    // 没填地址：先自动去连钱包（钱包浏览器里一点就连上），连上直接查；连不上才提示（站长 2026-11-09 晚：客户以为没自动连钱包）
    var connecting = false;
    function go(trusted) {
      var v = inp.value.trim();
      if (!v) {
        // 排查用（站长 2026-11-09 晚：进域名页就弹这条，面板复现不了）：把触发现场悄悄记到错误日志，看是谁在没人点的时候提交了这个表单
        // 2026-11-12：客户亲手点「查询」但没填地址是正常操作（下面会自动连钱包），不再记到错误日志；只记不是人点的那种
        if (!trusted) try { navigator.sendBeacon("/api/err", JSON.stringify({ p: location.hash.slice(0, 60), m: "oq-empty trusted=" + trusted + " " + String((new Error()).stack || "").replace(/\s+/g, " ").slice(0, 220), ua: navigator.userAgent.slice(0, 100) })); } catch (e) {}
        if (!trusted) return; // 不是客户亲手点的（脚本 / 浏览器自动触发）：不弹、不连钱包
        var kit = A.otcKit;
        if (kit && kit.connect && !connecting) {
          connecting = true;
          kit.connect().then(function () { connecting = false; var a = kit.account && kit.account(); if (a) { inp.value = String(a).toLowerCase(); go(true); } else { inp.focus(); A.errTip("先连钱包，或粘贴一个钱包地址 / 域名", inp); } }, function () { connecting = false; inp.focus(); A.errTip("先连钱包，或粘贴一个钱包地址 / 域名", inp); });
          return;
        }
        inp.focus(); return A.errTip("先连钱包，或粘贴一个钱包地址 / 域名", inp);
      }
      location.hash = "#/scan/" + encodeURIComponent(v) + "/" + c;
    }
    host.querySelector(".oq-f").onsubmit = function (e) { e.preventDefault(); go(!!(e && e.isTrusted)); };
    var fill = function (acc) { if (acc && !inp.value) inp.value = String(acc).toLowerCase(); };
    if (A.wallets && A.wallets.silent) A.wallets.silent().then(fill).catch(function () {});
    if (A.otcKit && A.otcKit.account && A.otcKit.account()) fill(A.otcKit.account());
    if (A.wallets && A.wallets.onAccounts) A.wallets.onAccounts(function (accs) { var a = Array.isArray(accs) ? accs[0] : accs; if (a) fill(a); }); // 钱包稍后连上也自动填
    return { set: function (k) { c = k; seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-c") === k); }); }, fill: fill };
  };
  function addrView(a, out, via, cat) {
    var wait = '<p class="muted sc-wait">读取中…</p>';
    try { out.style.setProperty("--sc-h", String(225 + parseInt(a.slice(2, 8), 16) % 70)); } catch (e) {} // 每个地址一个专属的紫蓝色调（只管头像色）
    // 站长 2026-11-10：运营地址不再整页隐藏（站长自己也看不到挂单没法撤）；对外顶部一张说明卡，明细照常显示但支出说法婉转（见 translate）
    var teamNote = TEAM[a] && !isMe(a) ? '<section class="card"><h2>🔧 运营维护地址</h2><p>这是本站<b>运营维护和市场托底</b>用的地址：服务器、节点、客服、开发等日常开支，以及在 OTC 挂买单托底、注入预测奖池的资金都从这里出。</p><p class="muted">客户的钱从不经过这里：挂单资金在 OTC 托管合约，借贷资金在借贷合约，域名在域名合约，都可以在账本里查到每一笔。</p></section>' : "";
    // 站长随后还要加一句「把 AiLGNS 拉升 100 倍」：没写。那是对币价的承诺，机器人只是跟着 DEX 价挂买单、抬不了币价，写了就是骗客户进场，涨不到还要担责；只写了做得到的「把买单价挂得更高更稳」。手续费那句按他说的删了
    // 站长 2026-11-17 深夜：说明里不要出现「抛售」两个字（哪怕是「不是抛售」），那个词本身会引起恐慌 → 改讲它做的正事：把买单价格拉高。它会把收来的币换回 DAI 这件事照实保留
    if (FLAG[a]) teamNote = '<section class="card sc-flag"><h2>⚠️ 风险提示：涉嫌盗号钱包</h2><p>有客户报案：2026 年 11 月 22 日被冒充客服的骗子骗走助记词，钱包里的创世域名被转到了这个地址。技术人员已经逐笔核对过链上记录。</p><p>本站域名市场已不再展示这个地址的挂单。请不要和它交易。</p><p class="muted">官方不会主动私聊你，不会索要助记词、私钥。凡是私聊你的「客服」都是骗子。</p></section>';
    if (A.BOT && a === A.BOT && !isMe(a)) teamNote = '<section class="card"><h2>🤖 官方做市机器人</h2><p>这是团队的<b>做市机器人</b>，全天在本站 OTC 挂买单。它做的事只有一件：<b>把买单的价格拉高</b>，一直挂在紧贴官方 DEX 实际到手价的位置，让想卖 AiLGNS 的朋友随时有人接、卖得上价。</p>' +
      '<p>有它在，盘口上的最高买价比以前高出一截，而且全天不断档。</p>' +
      '<p class="muted">它是这样循环的：挂买单 → 有客户卖给它 → 把收到的币换回 DAI → 接着挂下一张买单。它自己不囤币，买进多少、换出多少，下面每一笔都能对上。</p><p>团队会继续努力，把买单的价格挂得更高、更稳。</p></section>';
    var fastNote = a === C.fast ? '<section class="card"><h2>⚡ 极速预言家奖池</h2><p>这是<b>极速预言家的奖池钱包</b>：客户批量注册域名换票的钱进到这里，猜中的奖金从这里发出（换成 AiLGNS 自动转到中奖的钱包）。</p><p class="muted">余额和每一笔进出都在链上，下面就能查。<a href="#/fast">去极速预言家 →</a></p></section>' : "";
    var S = { head: teamNote + fastNote + (C.market[a] ? '<section class="card"><p class="muted">🏷 这是<b>域名市场的托管合约</b>：所有正在出售的域名都暂时存在这里，不是某个人的钱包。下面列出的是全部在卖的域名。</p></section>' : "") +
      // 用地址查：上面搜索框里已经是地址了，不再重复显示（站长 2026-11-06）；用名字查才显示名字 + 地址
      (via || KNOWN[a] ? '<section class="card sc-head"><h2 id="sc-h2">' + (via ? "🌐 " + esc(via) : "👤 " + KNOWN[a]) + '</h2><p class="sc-addr"><span class="mono">' + a.slice(0, 6) + "…" + a.slice(-4) + '</span><button type="button" class="ghost sc-copy" data-cp="' + a + '">复制完整地址</button></p></section>' : '<div id="sc-head-slot"></div>') + '<div id="sc-who"></div>',
      msg: '<section class="card" id="sc-msgc"><div class="card-head"><h2>📬 留言</h2><button type="button" class="nm-go sc-msgbtn" id="sc-msgbtn">💬 给 TA 留言</button></div>' +
      '<div id="sc-msgbox" hidden><textarea id="sc-mtxt" maxlength="200" rows="3" placeholder="写给 TA 的话（200 字以内）。留言会永久记录在链上，所有人可见，只花约 0.001 DAI 的 Gas。"></textarea>' +
      '<div class="sc-mrow"><small class="muted"><span id="sc-mn">0</span>/200 · 只有注册了 .ailgns 域名并设为主名字的钱包才能发信</small><button type="button" class="nm-go" id="sc-msend">发送留言</button></div><p class="muted nm-st" id="sc-mst"></p></div>' +
      '<div class="lg-list" id="sc-msgs">' + wait + "</div></section>",
      bal: '<section class="card sc-balc"><div class="card-head"><h2>💰 账户余额</h2><span class="muted" id="sc-balsum"></span></div><div class="sc-bal" id="sc-bal">' + wait + '</div><div id="sc-balx"></div></section>',
      pos: '<section class="card" id="sc-posc"><div class="card-head"><h2>📌 在本站的事</h2><span class="muted" id="sc-possum">挂单 · 借贷 · 预测</span></div>' + catBtns(a, cat || "all") + '<div class="lg-list" id="sc-pos">' + wait + "</div></section>",
      // 站长 2026-11-23：客户买了卡牌在账户里找不到 → 账本加卡牌 / NFT 显示框（别人的钱包没有就不占地方，自己的钱包没有也说一声）
      cards: '<section class="card" id="sc-cardc" hidden><div class="card-head"><h2 id="sc-ch">🃏 我的卡牌</h2><span class="muted">买到的卡牌显示在这里</span></div><div id="sc-cards">' + wait + "</div></section>",
      names: '<section class="card"><h2 id="sc-nh">🌐 我的域名</h2><div id="sc-names">' + wait + "</div></section>",
      // 站长 2026-11-11：不全折叠，先露最新 5 条，其余点「展开看更多」（见 clipLg）
      hist: '<section class="card sc-histc"><div class="card-head"><div class="sc-fh"><h2>📜 钱的来龙去脉</h2><span class="muted" id="sc-hsum">转进来、转出去、买了什么 · 最新在上</span></div><button type="button" class="sc-hbtn" id="sc-hbtn" hidden>收起 ▴</button></div><div class="lg-list sc-clip" id="sc-lg">' + wait + "</div></section>" };
    // 顺序：查订单（带分类）或查自己的钱包时，「正在进行中」紧跟在钱包信息后面，一打开就看到；查别人才先看留言
    var mine = A.otcKit && A.otcKit.account && A.otcKit.account() === a;
    // 站长 2026-11-06 定（白居易原则：大爷大妈一眼看懂）：先看有多少钱 → 在本站有什么事（挂单/到期/借贷）→ 钱去了哪里 → 域名 → 留言
    /* 站长 2026-11-11：点「查看奖池钱包」进来，先看到大字承诺 */
    if (a === C.pool) S.pledge = '<section class="card sc-pledge"><div class="sc-pl-grid"><div><b>100%</b><span>奖金全在这个账户</span></div><div><b>足额</b><span>有多少发多少，不打折</span></div><div><b>秒发</b><span>中奖按规则自动发到你钱包</span></div></div>' +
      '<p class="muted">预言家页面大字显示的奖池，就是下面这个钱包的实际余额（AiLGNS 按现价折算），链上任何人可查、谁也改不了。</p></section>';
    if (a === C.pool) S.pays = '<section class="card sc-pays"><div class="card-head"><h2>💸 发放记录</h2><span class="muted">奖金从这个钱包发出 · 链上可查</span></div><div id="sc-pays">' + wait + '</div></section>';
    S.appr = '<section class="card" id="sc-apc"><div class="card-head"><h2>🔑 授权检查</h2><span class="muted">谁能动这个钱包的币</span></div>' +
      '<p class="muted">「授权」就是允许某个合约从这个钱包里扣币。用不着的、不认识的，建议取消。取消不收费，只花一点链上 Gas。</p>' +
      '<button type="button" class="ghost sc-apgo" id="sc-apgo">🔍 查一下这个钱包的授权</button><div id="sc-apl"></div></section>';
    out.innerHTML = ["head", "pledge", "bal", "cards", "pays", "pos", "appr", "hist", "names", "msg"].filter(function (k) { return S[k]; }).map(function (k) { return S[k]; }).join("");
    apprBind(a);
    // 📍 这个钱包最近从哪里连过网站：只有浏览器里存着站长口令（登录过工单后台）才去查、才显示；客户看不到这张卡（/api/geo 没口令一律拒绝）
    try {
      var gk = localStorage.getItem("fbKey");
      if (gk) fetch("/api/geo?key=" + encodeURIComponent(gk) + "&a=" + a).then(function (r) { return r.json(); }).then(function (g) {
        if (!g || g.error || !out.isConnected || !out.firstElementChild) return;
        var CN = { CN: "中国大陆", HK: "香港", TW: "台湾", MO: "澳门", US: "美国", CA: "加拿大", JP: "日本", KR: "韩国", SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", AU: "澳大利亚", GB: "英国", DE: "德国", FR: "法国", AE: "阿联酋", KH: "柬埔寨", PH: "菲律宾", ID: "印尼" };
        var bjt = function (t) { var d = new Date(t + 8 * 3600e3); return (d.getUTCMonth() + 1) + "/" + String(d.getUTCDate()).padStart(2, "0") + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
        var l = g.list || [], el = document.createElement("section");
        el.className = "card sc-geo";
        el.innerHTML = '<div class="card-head"><h2>📍 连接地区</h2><span class="muted">只有站长看得到 · 留 30 天</span></div>' +
          (l.length ? l.map(function (x) { return '<div class="sc-pay"><div><b>' + esc((CN[x.c] || x.c) + (x.r ? " · " + x.r : "") + (x.city ? " · " + x.city : "")) + '</b></div><div class="sc-payr"><small class="muted">' + (x.t0 && x.t - x.t0 > 3600e3 ? bjt(x.t0) + " 起，最近 " : "") + bjt(x.t) + "（北京时间）</small></div></div>"; }).join("") : '<p class="muted">最近 30 天，没有人带着这个地址打开过本站（或者是在这个功能上线之前）。</p>') +
          '<p class="muted" style="font-size:12.5px">只到城市，不存 IP。只能说明有人带着这个地址从那里打开过网站，不能证明就是钱包主人；对方开 VPN 时位置不准。只当参考。</p>';
        out.insertBefore(el, out.firstElementChild.nextSibling);
      }).catch(function () {});
    } catch (e) {}
    if (S.pays) fetch("/api/oracle").then(function (r) { return r.json(); }).then(function (j) {
      var KN = { king: "🏆 贡献王", closest: "🥇 天眼通", second: "🥈 地灵通", jackpot: "🎯 神算子", daily: "🎯 每日前三" }, box = document.getElementById("sc-pays"); if (!box) return;
      var l = (j.pays || []).slice().sort(function (x, y) { return x.day < y.day ? 1 : x.day > y.day ? -1 : 0; });
      // 站长 2026-11-15：只露最新 3 条，其余折叠
      var payRow = function (x) {
        return '<div class="sc-pay"><div><small class="muted">' + esc(x.day) + " · " + (KN[x.kind] || esc(x.kind)) + "</small><b>" + esc(x.name) + '</b></div><div class="sc-payr"><b>' + (x.ail ? Number(x.ail).toFixed(4) + " AiLGNS" : Number(x.amt).toFixed(2) + " DAI") + "</b><small class=\"muted\">≈ " + Number(x.amt || 0).toFixed(2) + " DAI</small>" +
          (x.tx ? '<a href="#/scan/' + esc(x.tx) + '">查看转账 →</a>' : "") + "</div></div>";
      };
      box.innerHTML = l.length ? l.slice(0, 3).map(payRow).join("") + (l.length > 3 ? '<details class="sc-paymore"><summary>展开更早的 ' + (l.length - 3) + " 条</summary>" + l.slice(3).map(payRow).join("") + "</details>" : "") : '<p class="muted">最近 14 天还没有发奖</p>';
    }).catch(function () { var b = document.getElementById("sc-pays"); if (b) b.innerHTML = '<p class="muted">发放记录暂时读不到，稍后刷新</p>'; });
    var cpb = out.querySelector(".sc-copy"); if (cpb) cpb.onclick = function () {
      var done = function () { cpb.textContent = "已复制"; };
      var old = function () { try { var t = document.createElement("textarea"); t.value = a; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-999px;top:0;opacity:0"; document.body.appendChild(t); t.select(); var ok = document.execCommand("copy"); t.remove(); cpb.textContent = ok ? "已复制" : "请长按地址复制"; } catch (e) { cpb.textContent = "请长按地址复制"; } };
      try { navigator.clipboard.writeText(a).then(done, old); } catch (e) { old(); }
    };
    var el = function (id) { return document.getElementById(id); };
    nameOf(a).then(function (primary) {
      if (!el("sc-who")) return;
      if (A.credOf) A.credOf(a).then(function (c) {
        var bc = out.querySelector(".sc-balc .card-head"); if (!bc || KNOWN[a]) return;
        bc.insertAdjacentHTML("afterend", '<p class="sc-cred"><i class="cred cred' + c.lv + '">' + c.name + '</i> ' + (c.wk ? '上周本站 OTC 成交 <b>' + c.wk.vol.toLocaleString("en-US") + ' DAI</b> · ' + c.wk.n + ' 笔 · 排第 <b>' + c.wk.r + '</b>（共 ' + c.players + ' 人）' : '上周没有成交') + '<span class="muted"> · 累计 ' + c.vol.toLocaleString("en-US") + ' DAI · 牌子按上周名次评，每周一轮换，<a href="#/rank">看规则</a></span></p>');
      }).catch(function () {});
      var slot = el("sc-head-slot");
      if (primary && !via && slot) slot.outerHTML = '<section class="card sc-head"><h2>🌐 ' + esc(primary) + ' <small class="muted">这个钱包的名字</small></h2></section>';
      else if (slot) slot.remove();
      var bc = out.querySelector(".sc-balc"); if (bc && !primary && !KNOWN[a]) bc.insertAdjacentHTML("beforeend", '<p class="muted sc-noname">这个钱包还没有名字 · <a href="#/names">花 5 DAI 起一个 →</a></p>');
      if (el("sc-who")) el("sc-who").remove();
    });
    // 余额：最值钱的三种大字（AiLGNS / LGNS / DAI），折算成 DAI 合计；其它币小字列出；Gas 不单列（这条链 Gas 就是 DAI）
    var px = { AiLGNS: 0, LGNS: 0 };
    var pxJob = Promise.all([fetch("/api/book?m=ailgns").then(function (r) { return r.json(); }), fetch("/api/book?m=lgns").then(function (r) { return r.json(); })]).then(function (j) {
      var rs = function (x, dec) { var w = (x.reserves || "0x").slice(2).match(/.{64}/g); if (!w || w.length < 2) return 0; var r0 = Number(BigInt("0x" + w[0])) / Math.pow(10, dec), r1 = Number(BigInt("0x" + w[1])) / 1e18; return r0 ? r1 / r0 : 0; };
      px.AiLGNS = rs(j[0], 18); px.LGNS = rs(j[1], 9);
    }).catch(function () {});
    Promise.all([get("/addresses/" + a + "/token-balances").catch(function () { return []; }), pxJob]).then(function (r) {
      var bals = r[0] || [], main = ["AiLGNS", "LGNS", "DAI"], num = {}, others = [];
      bals.forEach(function (b) {
        if (!b.token || b.token.type !== "ERC-20") return;
        var v = Number(b.value || 0) / Math.pow(10, Number(b.token.decimals || 18)); if (v < 1e-6) return;
        if (main.indexOf(b.token.symbol) >= 0) num[b.token.symbol] = v; else others.push({ sym: b.token.symbol, v: v });
      });
      var box = el("sc-bal"); if (!box) return;
      var fb = function (v) { return v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v >= 100 ? v.toFixed(2) : v >= 1 ? (+v.toFixed(4)).toString() : v ? (+v.toPrecision(4)).toString() : "0"; }; // 大字余额：数字别太长，手机上不换行
      var total = (num.DAI || 0) + (num.AiLGNS || 0) * px.AiLGNS + (num.LGNS || 0) * px.LGNS;
      var have = main.map(function (k) { var v = num[k] || 0; return { k: k, v: v, worth: k === "DAI" ? v : v * (px[k] || 0) }; }).filter(function (c) { return c.v > 0; }).sort(function (x, y) { return y.worth - x.worth; }); // 站长 2026-11-07：为 0 的不显示，有钱的高亮、按价值排
      box.className = "sc-bal sc-n" + Math.min(have.length, 3);
      box.innerHTML = have.length ? have.map(function (c, i) {
        return '<div class="sc-coin sc-has' + (i === 0 ? " sc-top" : "") + '"><span><img class="sc-ci" src="icons/tokens/' + c.k.toLowerCase() + '.png?v=1" alt="">' + c.k + (c.k === "DAI" ? "（1 DAI ≈ 1 美元）" : "") + "</span><b>" + fb(c.v) + "</b>" + (c.k !== "DAI" ? "<small>≈ " + fb(c.worth) + " DAI</small>" : "") + "</div>";
      }).join("") : '<div class="sc-coin sc-zero"><span>AiLGNS · LGNS · DAI</span><b>0</b></div>';
      var sum = el("sc-balsum"); if (sum) sum.textContent = total ? "一共约 " + fb(total) + " DAI" : "这个钱包现在没有钱";
      awayBox(a, px, fb);
      var bx = el("sc-balx"); if (bx) bx.innerHTML = others.length ? '<p class="muted sc-others">其它：' + others.sort(function (x, y) { return y.v - x.v; }).slice(0, 8).map(function (o) { return esc(o.sym) + " " + amt(String(Math.round(o.v * 1e6)), 6); }).join(" · ") + "</p>" : "";
    });
    var nftJob = allNfts(a);
    cardsBox(a, nftJob);
    nftJob.then(function (x) {
      var mine = (x.items || []).filter(function (n) { var t = (n.token.address_hash || "").toLowerCase(); return t === NAMES.ailgns || t === NAMES.lgns; });
      if (!el("sc-names")) return;
      if (A.hidden && A.hidden[String(a).toLowerCase()]) { el("sc-names").innerHTML = '<p class="muted">🔒 不公开</p>'; return; }
      el("sc-nh").textContent = "🌐 我的域名（" + mine.length + "）";
      el("sc-names").innerHTML = mine.length ? '<div class="sc-names">' + mine.map(function (n) {
        var nm = (n.metadata && n.metadata.name) || "";
        return '<a href="#/names/' + encodeURIComponent(nm) + '">' + esc(nm || "#" + String(n.id).slice(0, 8)) + "</a>";
      }).join("") + "</div>" : '<p class="muted">没有域名 · <a href="#/names">去注册 →</a></p>';
    });
    messages(a, via);
    positions(a, el("sc-pos"));
    // 分类筛选：列表是异步填进来的，变一次就重新打标签 + 过滤；带分类进来的直接滚到「正在进行中」
    if (window.MutationObserver) { var mo = new MutationObserver(function () { applyCat(out, cat); }); mo.observe(out, { childList: true, subtree: true }); }
    applyCat(out, cat);
    if (cat) setTimeout(function () { var p = el("sc-posc"); if (p) window.scrollTo({ top: p.getBoundingClientRect().top + window.pageYOffset - 70, behavior: "smooth" }); }, 700);
    if (cat && cat !== "all" && el("sc-lg")) el("sc-lg").setAttribute("data-open", "1"); // 按分类查订单时不截断，不然筛完可能一条都看不到
    ledger(a, el("sc-lg"));
    return Promise.resolve();
  }

  // 交易哈希：一句人话 + 几个关键信息
  function txView(h, out) {
    return Promise.all([get("/transactions/" + h), get("/transactions/" + h + "/token-transfers").catch(function () { return { items: [] }; })]).then(function (x) {
      var t = x[0], tt = x[1].items || [], a = (t.from && t.from.hash || "").toLowerCase(), r = translate(a, { tx: t, tr: tt, h: h, t: t.timestamp });
      out.innerHTML = '<section class="card"><div class="card-head"><h2>🧾 这笔交易</h2></div>' +
        '<div class="lg-one"><span class="lg-ico">' + r.ico + '</span><div>' + r.text + "</div></div>" +
        '<dl class="nm-dl"><dt>谁操作的</dt><dd>' + who(a) + "</dd><dt>时间</dt><dd>" + bj(t.timestamp) + "（北京时间）</dd><dt>状态</dt><dd>" + (t.result === "success" ? '<b class="nm-ok">✅ 成功</b>' : '<b class="nm-bad">❌ 失败，没扣钱</b>') + "</dd><dt>链上 Gas 费</dt><dd>" + amt(t.fee && t.fee.value, 18) + " DAI</dd>" +
        (t.to && t.to.hash ? "<dt>对象</dt><dd>" + (KNOWN[t.to.hash.toLowerCase()] ? '<b class="sc-kn">' + KNOWN[t.to.hash.toLowerCase()] + "</b>" : who(t.to.hash)) + "</dd>" : "") + "</dl>" +
        /* 站长 2026-11-25：交互的合约不是本站的、也不在官方名单里，要提醒。只说「不认识」，不说它一定有问题（我们没法替客户判断）；被报案的地址另有红字 */
        (function () {
          var z = t.to && t.to.hash ? t.to.hash.toLowerCase() : "";
          if (!z || !t.to.is_contract) return "";
          if (FLAG[z]) return '<p class="sc-unk bad">🚨 <b>风险合约</b>：这笔交易的对象是被客户报案的地址，请不要再和它打交道；给过它授权的，请到钱包页的「授权检查」里取消。</p>';
          if (OFFICIAL[z]) return '<p class="sc-unk ok">🏛 这是<b>官方合约</b>（在官方网站公布的合约名单里）。</p>';
          if (KNOWN[z] || REG[z]) return "";
          return '<p class="sc-unk">❓ <b>未知合约</b>：这笔交易打交道的合约不是本站的，也不在官方合约名单里。不认识它的话请留意：别给未知合约授权，也别在它的页面上输入助记词。</p>';
        })() +
        (tt.length ? '<h3 class="lg-h3">🔁 这笔交易里币的流向</h3><div class="lg-flow">' + tt.map(function (x) {
          var tok = (x.token && x.token.address_hash || "").toLowerCase(), tld = tok === NAMES.ailgns ? "ailgns" : tok === NAMES.lgns ? "lgns" : "", id = x.total && x.total.token_id;
          var v = tld && id ? '<b data-nft="' + tld + ":" + id + '">🌐 域名</b>' : "<b>" + (id != null && (x.total || {}).value == null ? "1 张" : amt(x.total && x.total.value, x.total && x.total.decimals)) + " " + esc(x.token && x.token.symbol || "") + (id != null && (x.total || {}).value == null ? "（#" + esc(String(id)) + "）" : "") + "</b>";
          var f =(x.from && x.from.hash || "").toLowerCase(), g = (x.to && x.to.hash || "").toLowerCase();
          var nm = function (z) { return /^0x0+$/.test(z) ? "<b>🆕 新铸造</b>" : KNOWN[z] ? '<b class="sc-kn">' + KNOWN[z] + "</b>" : who(z); };
          return "<div>" + nm(f) + ' <span class="lg-arr">→</span> ' + nm(g) + "：" + v + "</div>";
        }).join("") + "</div>" : "") +
        '<p class="muted lg-raw">交易编号 <span class="mono">' + h + '</span> · <a href="https://anubisscan.io/tx/' + h + '" target="_blank" rel="noopener">链上原始记录 ↗</a></p></section>' +
        '<p class="muted" style="text-align:center"><a href="#/scan/' + a + '">← 回到 ' + (KNOWN[a] || "这个钱包") + ' 的账本</a></p>';
      fillNames(out);
    });
  }

  // 全站：页面上出现的短地址（0x1234…abcd），只要这个地址设了主名字，就换成域名显示
  var SKIP = { INPUT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1 }, SHORT_RE = /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/g, timer = 0;
  function swapAll() {
    timer = 0;
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, hits = [];
    while ((n = w.nextNode())) if (n.nodeValue.indexOf("…") >= 0 && /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/.test(n.nodeValue) && n.parentNode && !SKIP[n.parentNode.nodeName]) hits.push(n);
    hits.forEach(function (node) {
      (node.nodeValue.match(SHORT_RE) || []).forEach(function (s) {
        var full = A.shorts && A.shorts[s];
        if (!full) return;
        // 荣耀榜总榜前 50：名字前面加段位徽章（荣耀榜页面和顶部播报条里不加，避免重复）
        Promise.all([nameOf(full), A.rankReady || null]).then(function (x) {
          var nm = FLAG[String(full).toLowerCase()] ? FLAG_NAME : x[0], p = node.parentNode, nb = p && p.closest && p.closest("[data-nb]"), bg = !nb && A.rankBadge ? A.rankBadge(full) : "";
          if (node.nodeValue.indexOf(s) < 0) return;
          if (!nm && (!bg || node.nodeValue.indexOf(bg + s) >= 0)) return;
          node.nodeValue = node.nodeValue.replace(s, bg + (nm || s));
          if (p && !p.title) p.title = full + (bg ? " · " + A.rankTitle(full) : "");
        });
      });
    });
  }
  new MutationObserver(function () { if (!timer) timer = setTimeout(swapAll, 300); }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // 给 OTC 等页面用：地址先显示短地址，查到主名字后换成名字
  /* 站长 2026-11-17：做市钱包 0x06cc 全站统一显示成「🤖 官方做市机器人」（盘口、成交、账本都走这里）。
     名字站长 2026-11-17 最后定为「官方做市机器人」（先说「托底」，后改回）：这张买单量小、跟着 DEX 价走、会自动停机，不是保价。客服口径：有官方的买单在收，价格跟随 DEX，不承诺保价 */
  var BOT = "0x06cc2a46d7ad17496c2de9c61362808e06b44437";
  A.BOT = BOT; A.BOT_NAME = "🤖 官方做市机器人";
  A.nameTag = function (a) {
    if (String(a).toLowerCase() === BOT) return '<span class="bot-tag" data-cred="1" title="团队的做市机器人：买单价跟着官方 DEX 的实际到手价自动调整">' + A.BOT_NAME + "</span>";
    return '<span data-a="' + a + '">' + A.short(a) + "</span>";
  };
  A.fillNames = fillNames;
  // 🏅 信誉标志：按累计成交给挂单人加「信誉商家」等芯片（OTC 订单簿、账本头部用）。等级在 /api/cred 里定
  var CREDN = ["新客", "常客", "✔ 认证商家", "🥇 金牌商家", "💎 钻石商家", "👑 王牌商家", "🐋 镇店巨鲸"], credCache = {}, credAt = 0; // 等级定义同 lib/cred.js（2026-11-08 七级商家体系）
  A.credFill = function (root) {
    var els = Array.prototype.slice.call(root.querySelectorAll("[data-a]:not([data-cred])")), as = {};
    els.forEach(function (e) { var a = e.getAttribute("data-a").toLowerCase(); if (!KNOWN[a]) as[a] = 1; });
    var need = Object.keys(as).filter(function (a) { return !credCache[a] || Date.now() - credAt > 120000; });
    var p = need.length ? fetch("/api/cred?a=" + need.slice(0, 40).join(",")).then(function (r) { return r.json(); }).then(function (j) { Object.keys(j).forEach(function (a) { if (a.charAt(0) === "0") credCache[a] = j[a]; }); credAt = Date.now(); }).catch(function () {}) : Promise.resolve();
    p.then(function () {
      els.forEach(function (e) {
        var a = e.getAttribute("data-a").toLowerCase(), c = credCache[a]; e.setAttribute("data-cred", "1");
        if (!c || (c.lv < 1 && !c.king && !c.mm)) return;
        var last = e;
        // 站长 2026-11-10：一个名字只显示一个标志（留位置给域名），优先级：官方认证做市商 > 本周贡献王 > 商家等级
        if (c.mm) { var mc = document.createElement("i"); mc.className = "cred credmm"; mc.textContent = "👑 官方认证做市商"; mc.title = "👑 官方认证做市商：日均挂单 ≥ 1 万 DAI 的做市商或平台官方做市钱包，负责把盘口铺平，不拿返佣"; e.insertAdjacentElement("afterend", mc); last = mc; } /* 短标签「👑 做市商」，名字后面放得下（站长 2026-11-09 晚） */ // ✅ 官方做市商（站长 2026-11-09）；商家牌子照样往后挂
        if (c.mm) return;
        if (c.king) { var kc = document.createElement("i"); kc.className = "cred credking"; kc.textContent = "🏆 本周贡献王"; kc.title = "上周 OTC 手续费贡献前 3，标志挂 7 天"; last.insertAdjacentElement("afterend", kc); }
        if (c.king) return;
        if (c.lv >= 1) { var chip = document.createElement("i"); chip.className = "cred cred" + c.lv; chip.textContent = CREDN[c.lv]; chip.title = (c.wk ? "上周本站 OTC 成交 " + c.wk.vol.toLocaleString("en-US") + " DAI · " + c.wk.n + " 笔 · 排第 " + c.wk.r : "上周没成交") + " · 牌子按上周名次评，每周一轮换"; last.insertAdjacentElement("afterend", chip); last = chip; }
      });
    });
  };
  A.credOf = function (a) { return fetch("/api/cred?a=" + a).then(function (r) { return r.json(); }).then(function (j) { var c = j[String(a).toLowerCase()] || { vol: 0, n: 0, lv: 0, wk: null }; c.name = CREDN[c.lv]; c.players = j.players || 0; c.next = null; return c; }); };
  // 自己刚注册 / 设主名字 / 转让之后：忘掉记住的旧名字，下次显示重新读链
  A.nameForget = function (a) { a = String(a || "").toLowerCase(); delete nameCache[a]; delete store[a]; try { localStorage.setItem(NMK, JSON.stringify(store)); } catch (e) {} };
  A.nameOf = nameOf; // 荣耀榜播报：没域名的大哥引导去注册
  A.pages.scan = page;
})();
