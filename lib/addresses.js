// 📍 全站所有部署地址登记表（站长 2026-11-09：合伙人面板列出每个地址的余额，有异常提醒，防止漏掉某个地址）
// ⚠️ 规矩：以后部署任何新合约、新钱包，必须先在这里加一行。tools/build.py 会扫源码，发现没登记的 0x 地址就警告。
// expect 四种：
//   gas    钱包，只放 Gas；低于 min 报警
//   hold   钱包 / 合约，正常就是有钱（收款、奖池、合伙人钱包、池子）；不报
//   zero   中转 / 路由 / 注册合约，正常 ≈ 0；压着钱（≥ 50 DAI 折算）就报，说明机器人没退或卡住
//   escrow 客户的钱在里面（托管、借贷、市场、池子）；金额不报，只报读不到
export const TOKENS = {
  anubis: [["DAI", "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", 18], ["AiLGNS", "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", 18], ["LGNS", "0x4d1d808a081fdac440703b3765fc61f8028c06b8", 9]],
  polygon: [["DAI", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", 18], ["LGNS", "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01", 9]],
};
export const ADDRESSES = [
  // —— 钱包 ——
  { n: "谷歌社交账号钱包（所有收入）", a: "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", k: "wallet", c: "anubis", e: "hold", note: "每天手动清到冷钱包" },
  { n: "谷歌社交账号钱包（Polygon）", a: "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", k: "wallet", c: "polygon", e: "hold" },
  { n: "触发钱包（机器人付 Gas）", a: "0x89dd06754bb239b6c4c92bc47c8fa72889084e27", k: "wallet", c: "anubis", e: "gas", min: 8, note: "退款、发奖、撮合都靠它" },
  { n: "预言家奖池", a: "0xd69fd045e23c8a45c6b3f6b9a4ef66592d51dba4", k: "wallet", c: "anubis", e: "hold", note: "客户的奖金，是负债" },
  { n: "极速预言家奖池", a: "0x8610bf581b1c10cb7d372f93b8cdcde382a7c1d1", k: "wallet", c: "anubis", e: "hold", note: "客户的票款和奖金，是负债" },
  { n: "创世分红奖池", a: "0xf1a871f4f732fb2217cda4e4224d2b2d3b4aa6c2", k: "wallet", c: "anubis", e: "hold", note: "2026-11-21 本机生成（创世 1 万个卖完当天）；站长手动转 DAI 进来，域名页创世卡片显示它的余额当「分红奖池累计金额」；发放规则和机器人还没做；私钥在 1Password「AiLGNS · 创世分红奖池钱包私钥」，只有私钥没有助记词" },
  { n: "互助保障池", a: "0xab907917d541313e2ded546f39912c6d508c04f1", k: "wallet", c: "anubis", e: "hold", note: "2026-11-24 本机生成；客户交的保障费（50 DAI / 年）直接转进来，理赔由站长核对后每月从这里手动打款；私钥只在 1Password「AiLGNS · 保障池钱包私钥」，只有私钥没有助记词，不进任何 GitHub Secret" },
  { n: "OTC 商户奖金池（手续费周榜奖金）", a: "0xf09b0cd8bd6ed6fa528284f53fc8e9df753b62de", k: "wallet", c: "anubis", e: "hold", note: "2026-11-15 本机生成；站长手动转 DAI 进来，周一按前 10 名手续费占比分，机器人买成 AiLGNS 发；私钥在 GitHub Secret WEEKLY_KEY 和 1Password" },
  { n: "代注册机器人钱包", a: "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1", k: "wallet", c: "anubis", e: "gas", min: 0.05, note: "只放 Gas；代注册 + 大奖代烧（客户在域名合约上授权后，只把委托清单里的名字转进黑洞）" },
  { n: "官方做市机器人钱包", a: "0x06cc2a46d7ad17496c2de9c61362808e06b44437", k: "wallet", c: "anubis", e: "hold", note: "2026-11-17 起常驻机器人在跑（新加坡服务器）：挂买单、收到币去 DEX 卖" },
  { n: "✅ 官方做市钱包（站长测试）", a: "0x98dc516992437ad3c750bc7fd9916624599c324c", k: "wallet", c: "anubis", e: "hold", honor: 1, note: "挂官方认证做市商标志；honor: 1 = 照常上荣耀榜（站长 2026-11-21 工单 #342：「让它做市商重新上榜」）" },
  { n: "✅ 官方做市钱包 2", a: "0x3b528845f03a46016bed5f1b9178707b7ac277bb", k: "wallet", c: "anubis", e: "hold", note: "挂官方认证做市商标志" },
  { n: "分账中转钱包", a: "0x701876eb1b6cea82774f7041e092f7740624af81", k: "wallet", c: "anubis", e: "hold", note: "AiLGNS 分账从这里发给合伙人" },
  { n: "合伙人 · 运营费用 55%", a: "0xd53a00bb90bb606f10d888419a14eca779f17285", k: "wallet", c: "anubis", e: "hold", note: "合伙人自己的钱包" },
  { n: "合伙人 · 管理费用 5%", a: "0x5daf3a821b562cc4131e37ac501e6b79a8dfc4c1", k: "wallet", c: "anubis", e: "hold", note: "合伙人自己的钱包（2026-11-12 换成这个）" },
  { n: "合伙人 · 管理费用 5%（旧地址，已换）", a: "0x57b515c5cc7fe248b5ab32b6ef461a914020723f", k: "wallet", c: "anubis", e: "hold", note: "2026-11-12 起不再往这里分" },
  { n: "合伙人 · 管理费用 10%", a: "0xe8782615e32557f257dd88d70b1eb0d7f47b91c3", k: "wallet", c: "anubis", e: "hold", note: "合伙人自己的钱包" },
  { n: "合伙人 · 技术费用 30%", a: "0xae5a079ad9b76703d5e3950f3375b4d5fdd5f2ab", k: "wallet", c: "anubis", e: "hold", note: "合伙人自己的钱包" },
  { n: "旧分账收款（已停用）", a: "0x5505d382bf5d705c5d3ec0cbfc17a3dde394b322", k: "wallet", c: "anubis", e: "hold" },
  // —— OTC ——
  { n: "OTC 托管 · AiLGNS", a: "0x4e730be6d46be71223ded5a32dc45799f6d4bc15", k: "contract", c: "anubis", e: "escrow", note: "客户挂单的钱" },
  { n: "OTC 托管 · LGNS", a: "0xb6a7a3be9a17ad241665ab9bddbd9a573d488818", k: "contract", c: "anubis", e: "escrow" },
  { n: "OTC 托管 · gLGNS", a: "0x2b0ab121d60f823fffc4cef75af26055df388e2b", k: "contract", c: "anubis", e: "escrow" },
  { n: "OTC 托管 · LP（AiLGNS/LGNS）", a: "0xfeeaa5f8a104836d15b492399b2ea587a41c4771", k: "contract", c: "anubis", e: "escrow", note: "2026-11-24 部署" },
  { n: "OTC 托管 · LP（多部署的一份，没在用）", a: "0x7bf0cf0e4fcdaef1d3173843a16e4b5d2347784e", k: "contract", c: "anubis", e: "zero", note: "2026-11-24 连点了两次部署，这份不接进网站，里面不该有钱" },
  { n: "OTC 托管 · AWAKE NFT 卡牌", a: "0x8c67912b3ed44f4512c2f22b7b2263f6659396ed", k: "contract", c: "anubis", e: "escrow" },
  { n: "OTC 托管 · LGNS（Polygon）", a: "0x4060f38d3e837843b69014d9f85ecfb3e29fa2db", k: "contract", c: "polygon", e: "escrow" },
  { n: "自动撮合合约", a: "0xdcc5354175d60ffc8364e71e792fcd66366f00fe", k: "contract", c: "anubis", e: "zero", note: "撮合完即退，不该留钱" },
  { n: "批量扫单路由", a: "0x6ec474047a6c12d0cab53855a990c1c8b3996c20", k: "contract", c: "anubis", e: "zero" },
  // —— 域名 ——
  { n: "域名注册 · .ailgns", a: "0xbc408e9d7350967e7247c917a086cb4ece0ed988", k: "contract", c: "anubis", e: "zero", note: "注册费直接转走，不该留钱" },
  { n: "域名注册 · .lgns", a: "0x93af23fe74e5180f54f0996fa6bb6c157775f7f3", k: "contract", c: "anubis", e: "zero" },
  { n: "域名市场 · .ailgns", a: "0xcb3670db84ec9e9dd8c9f341e461c29e4e789a7e", k: "contract", c: "anubis", e: "escrow" },
  { n: "域名市场 · .lgns", a: "0x2894d4fe8788140ee7e48e6dcbaa2e8d987ef64d", k: "contract", c: "anubis", e: "escrow" },
  { n: "域名费中转（回购合约）", a: "0x99f47ca8e7ed873e01a337aefc5b75f5328d2da3", k: "contract", c: "anubis", e: "zero", note: "机器人每轮退回谷歌社交账号钱包" },
  // —— 借贷 ——
  { n: "借贷托管 · LGNS", a: "0x439cb33e9c5d7a26dd1fa503efe6fd3033ac173b", k: "contract", c: "anubis", e: "escrow" },
  { n: "借贷托管 · AiLGNS", a: "0x242ab392571d325d814a48892ac16115a6d285dc", k: "contract", c: "anubis", e: "escrow" },
  { n: "借贷托管 · gLGNS", a: "0x00e674bb1559557966a6c2244c36d12a63218a5f", k: "contract", c: "anubis", e: "escrow" },
  { n: "借贷托管 · AiLGNS 旧版（已停用）", a: "0x8d84d678d195e770caad263d1c37967ec796165c", k: "contract", c: "anubis", e: "escrow" },
  // —— 分账 / 游戏 ——
  { n: "分账合约 · Anubis（旧）", a: "0xeee877c1b6285b82890bdcd027d2715f658ecf23", k: "contract", c: "anubis", e: "zero" },
  { n: "分账合约 · Polygon（旧）", a: "0xcc274e07847a6a86917b6ccd4e67706170d4036f", k: "contract", c: "polygon", e: "zero" },
  { n: "像素墙 LGNS 池 · Anubis", a: "0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c", k: "contract", c: "anubis", e: "hold" },
  { n: "像素墙 LGNS 池 · Polygon", a: "0x2b0ab121d60f823fffc4cef75af26055df388e2b", k: "contract", c: "polygon", e: "hold" },
  // —— aiswap（2026-11-09 部署）——
  { n: "aiswap · WETH9", a: "0xc5da7d212aad698008d2bf6004aca2ee352a6723", k: "contract", c: "anubis", e: "escrow", note: "用户换进来的 Gas 币" },
  { n: "aiswap · Factory", a: "0x431c87b1ec15cb955c60262bd4d2ce798281e501", k: "contract", c: "anubis", e: "zero" },
  { n: "aiswap · Router", a: "0x477abc5b8f2de7bf50e0728a44707ca0c670a982", k: "contract", c: "anubis", e: "zero", note: "路由不该留钱" },
  { n: "aiswap · 第一个池子 AiLGNS/DAI", a: "0xf1d45cfbcd430d5e90cc5fa25e8958cc3c798abe", k: "contract", c: "anubis", e: "escrow", note: "测试后撤空" },
];
// 不是我们部署的，代码里用到的（代币、第三方池子、协议合约、黑洞）：登记只为 build 查漏时不误报
export const THIRD_PARTY = [
  // RM（Rome，第三方项目的币）和它的 RM/USDT 池子：OTC 的 RM 市场读价用（2026-11-25）
  "0x2e045e1380f5f5b6e7550328910a7377c9fce59d", "0x8cbabf4e076baaad295fd32b3249e7f9d812b9c5",
  // 官方合约名单（账本 scan.js 的 OFFICIAL，2026-11-25 从两个官方站取的；只读，用来标名字）
  "0xf7e78f731dcdaa18a9a1cbeac6e73590e1128cc4", "0x39ba6313f3c59cac5611b8cf308d084551e9d60f", "0xbfaae809c1803ec4ae73a506309b3036c48d65a8", "0x8a36a456e95cd55ea8cbd79ccc798fd1f716db68", "0xda24d74aa53c68911648b90a23517f8a92d3e730", "0xb39d8759d59592363395e4c66a3d4e4acc9bc09d", "0x70a7e5e20b4f416e802c2297be7ac229467ef788", "0x616799578b7a9fcff46b6519c2460d07fba8cfd3", "0x3deea5f638ca0dfb03a0873cf4c0b90ba50e1aa2", "0x2e0d9d461a1b567112a9b824d939fb583853daa7", "0x621e693a002f13fc0d87fdcd00de2c8bafceed04", "0x0645460f6f485153775154451fe1322fdbb2233c", "0x6aab661e1a99b20d1dae581ab0e1250e6f753a19", "0x6c5352e15a8327c3f44898fe220100edc2989c58", "0x7088e192b9b7f41a07bb3f79378e13454d8a80d5", "0x6ee8344ae4785af3099b3dc5e603d88babce0ecb", "0xb8bc3c6b90aadd9aff393ecb4297b7fd6876f510", "0x8b52b9e85f7ce788c2c141cc2eb98965c705abb0", "0xdb752f219a79c8d9d6f6674e5ea295c2c5431d1f", "0x81a42a20f754dbecf7aee69685d844a880dea618", "0x1a5007a65610b1b55c0d78626b0b7fe1c590feec", "0x2628aad0b92e319d444b40201a96487fc6f6555d", "0x0527935979d10685b8571fa02a8dedbd6f3024e3", "0x22841307af7e663f8ce784230c8f8e10a46888cf", "0x9fafb6998eac3bc221da7b26d70373533b312914", "0xa4e362201f74a9ea4f227b941026ce6c9397c196", "0xf61c45b0e63623231a874f2a2df03bf9f6abad9f", "0xb975fd9b03ff440d6a43a52a7f072154cb520a4b", "0xf73d1c309ea87a0bf8b6896d49349321242061ab", "0xf0e9ec153f68bfa2fc8c76165db2b80579dcb217", "0x732e959fed889626686f9fbe57233fe32b771963", "0x8da328455407aba25e46b4bc270672e208b4eda1", "0x825d1b92d9cb744c9583999b6f57893e96d9b9c7", "0xa69a60b8d97d43031c00f16742eb6989553796fc", "0x9120720b1bfd3e06fd5295fa2b4182859d178e30", "0x18f46e10cc82fd4dc8fcd7844170f871cc87ce78", "0x2c36beff699ba473d7bb0eb829d1fe723eeed963", "0x915527db1ac1444c454346f6076381a0b75c5a2c", "0x77e6ab1c5557fd456b0656304e0e5c02a6d7dcca", "0xb16325f0565a2d83031735a7ac6495b5bc72e422", "0x99d9bd14dbd760785acfd8f816c0348f0e88fe60", "0x156befcce20fa219caa5bc31b67909337ba41efd", "0xf7cdc210aea57ebdb6cb3e53e1526bea31c0c3a6", "0xd56603bbe579ebf742cebdbca3af2c69f8152233", "0xf55f487df255c41a5d40c14faa917ffda8d7defd", "0xefcba560a18210a2c7103a09ddcd24a5fde5afda", "0xe925d91d226f2c2a8cf357f421582b25738d9e97", "0xe98f3366ac45a799531e5e779079b364fabccc00", "0xe884a336550a4482ca6a17a3f93aa30ed4ed9bad", "0xf14c0e3da42fc36a416e6036dc4c7ca0375b734f", "0x52d7f7745d4ba3de6c3a0b503815878aee7edf14", "0x853aa8e3a3c55d7124c0f8bc2cca826645fb0f15", "0x31fe4354218e387a236c531c5ccee8149474e773", "0x1e5feec473f7f445fc7f5feec0beabb2270b0b4e", "0xebd08fa8768c366fcccd8130aa3c0b35dc50f9a6", "0xf190ab12b73bfe1b626379af96e8f1859ec91f20", "0x4d47845750185bc654da1a6a571e5a13e6506929", "0x11b10c9827c5b7071e96fcaa143b4e6e86b17c69", "0x3f403751975e1eb06d95901f7ff246513444e71f", "0x6170743b440696e17c9c0dbc551e0b8c010694d8", "0xf7a0cacdf0810609ee5618247c4121b799e41664", "0x943c6462d9a5a3ccadc12ef6ad34b9518e6128f6", "0x579a71890ae0e99806f75cd2e006bb07559c3b49", "0xcaf7a121ae9a36606caee1e177797143a2a5c777", "0x5584cdeb1369673c91c6ad7ebea0ce7cb630ce60", "0x030590921e9841e1d2104642ed285c83b5f0ddb5", "0xac9e27714266766ab0a6908c6ccd899e7f90108f", "0xa3007b26b64f0f43b56c8c67a12917faab02fc42", "0x5e6d77f8071642561c999e97c1022108b8d5de57", "0xb4e5b7665186229d8a5b0ba3706c5c119dd1b47b", "0xf7788f5a5cbbafac4120c63c79dcd9f1931c7824", "0x8c6c69d640a392645ebcd021d3bfd8dd177ccefb", "0x4ff8e905ab40ed18355b0b2c0dfae8213d5d8d90", "0x6d59827207b1e9ca32ea9b6247270a0e7023d9a9", "0x229e0aa54ebcfd887a1c06bc649ad1afca87486a", "0x8250f8eeaae5b6e21043fbd8c61c70e1b0906109", "0x71b514b8d08f61e39e24442c2fc83297584c1dd6", "0xbe1eca1b4cb8aef5055feb146e1f9285167fb0e2", "0x2243ae29f73137d678197b61b0621ae942845b8c", "0x7a2e3fa6ea60437f0441b8eb5e60674b80339228", "0x3e412e02b6157fbe80b6c6697f3ce1142e629019", "0x92b53785090f6fe0717ca3cf5db8f8040d3b070b",
  // 官方 LGNS 质押（360 天 / 600 天）、官方 LP 质押管理合约、AiLGNS-LGNS 池子（账本「押在别处的」、LP 市场、签到门槛都读它们；只读，不是我们的）
  "0x88ea98af226cd4402a3873400308a4d78784ece6", "0x04ed22c6d1d020a9b5e032e93d79ab28293ef72f", "0x5ddc8a13eabda89593beb885ab8b2afda26a3587", "0xc5029d6e80d2fdce321b2b51010e9ce3b1edf1a2",
  /* #/gale 秒到跨链（2026-11-20）：第三方 GaleBridge 在 Anubis、Polygon / BSC / 以太坊上的合约（新版、旧版）和各链的 USDC、以太坊的 DAI / USDT——本站没有为它部署任何合约 */
  "0xd1a5c8492ed1773ca0f1a97abad71afb122a750a", "0x6c18c9226c30bd3057b9606ba5b506efd4c2506a", "0xc615f91a31791f1bf4ac7f7fdc60525bf1804186", "0xa2c1ec79872d2c961cbd33ef750659e3b2439647",
  "0x7dd9c7cbc32df500fa3c06fd60cd62c4e97b2eef", "0xdfb6a28bc6dc51fed17c27c880f2c66cdd040a3e", "0xa921267c56b3a57696d6fd7949c9fad0a8e0c177", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  "0x6b175474e89094c44da98b954eedeac495271d0f", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "0xdac17f958d2ee523a2206206994597c13d831ec7",
  /* #/usdt 一键通道（2026-11-19）：Polygon USDT、KyberSwap 聚合器路由、Anubis 官方跨链桥——都是第三方合约，本站没有为它部署任何合约 */
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", "0x6a000f20005980200259b80c5102003040001068" /* ParaSwap Augustus v6.2，聚合器备用 */, "0x8932fe7726c1ee743f662f485c3e5a5d1d595f71",
  "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", "0x4d1d808a081fdac440703b3765fc61f8028c06b8", "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c", "0x58839f46bd0e3f4494e2beb8ca93da9352208615",
  "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01",
  "0x55d398326f99059ff775485246999027b3197955", "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", /* BSC 上的 USDT、DAI（#/usdt 跨链桥 2026-11-20 加 BSC；聚合器路由和官方桥在 BSC 上是同一个地址） */
  "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0", "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", "0x882df4b0fb50a229c3b4124eb18c759911485bfb", "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", "0xaf6f4e641c86a25518509bc840051a8652af598a",
  "0x27cb55ee75e777ff972b74b6e68782d12bd4ec46", "0xc9f9a8a2dbf8188ad6610e0239105cabe67c4993", "0x9e68f61e2615cc1d2c4a2d0026bfc1ebfdf68c1b", "0x41fd86243836b698405554ae311d223dec7e3552", "0x16b309670cfc6e855d1def7ee55e395827e8a869",
  /* 官方资金池统计页 #/funds（站长 2026-11-12 给的官方地址：初始铸造池、护盘资金、缓冲池、护价池 ①②；储备金和底池上面已登记） */
  "0xcc95906da4b92b3a5c4b187553050df0f90eae08", "0x85ff1e15cabca867f244b9c2465227477f251972", "0x0664f1369209677fecb279f5ec3df1e53a22212e", "0x589b441a19fdfd28aee5e57891a842e96d91de31", "0xf1fb9ce9472dec231bced60d6aa729f5e403020b",
  "0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000a11905",
];
