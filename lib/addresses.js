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
  { n: "极速预言家资金池", a: "0x8610bf581b1c10cb7d372f93b8cdcde382a7c1d1", k: "wallet", c: "anubis", e: "hold", note: "客户的票款和奖金，是负债" },
  { n: "代注册机器人钱包", a: "0x21425f852a1e0fb798fb9ebeb288def27bc0f2d1", k: "wallet", c: "anubis", e: "gas", min: 0.05, note: "只放 Gas；代注册 + 大奖代烧（客户在域名合约上授权后，只把委托清单里的名字转进黑洞）" },
  { n: "做市 / 套利钱包（未启用）", a: "0x06cc2a46d7ad17496c2de9c61362808e06b44437", k: "wallet", c: "anubis", e: "hold" },
  { n: "✅ 官方做市钱包（站长测试）", a: "0x98dc516992437ad3c750bc7fd9916624599c324c", k: "wallet", c: "anubis", e: "hold", note: "挂官方认证做市商标志" },
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
  "0x83fd06f0846d9d90b3016bf670efe2e0b11cde14", "0x256edb652db43e721ec6a12b6b51b6967d3bb8cb", "0x4d1d808a081fdac440703b3765fc61f8028c06b8", "0xf140a92c156e76f5a1d3d6f96284b250330f8f4c", "0x58839f46bd0e3f4494e2beb8ca93da9352208615",
  "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01",
  "0x0a1cce65d995c6c5100e6f5ba3c388ef34cecaf0", "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0", "0x882df4b0fb50a229c3b4124eb18c759911485bfb", "0x8c4ea5dac01e2e8fb67f50201aa2e10a6949c58d", "0xaf6f4e641c86a25518509bc840051a8652af598a",
  "0x27cb55ee75e777ff972b74b6e68782d12bd4ec46", "0xc9f9a8a2dbf8188ad6610e0239105cabe67c4993", "0x9e68f61e2615cc1d2c4a2d0026bfc1ebfdf68c1b", "0x41fd86243836b698405554ae311d223dec7e3552", "0x16b309670cfc6e855d1def7ee55e395827e8a869",
  /* 官方资金池统计页 #/funds（站长 2026-11-12 给的官方地址：初始铸造池、护盘资金、缓冲池、护价池 ①②；储备金和底池上面已登记） */
  "0xcc95906da4b92b3a5c4b187553050df0f90eae08", "0x85ff1e15cabca867f244b9c2465227477f251972", "0x0664f1369209677fecb279f5ec3df1e53a22212e", "0x589b441a19fdfd28aee5e57891a842e96d91de31", "0xf1fb9ce9472dec231bced60d6aa729f5e403020b",
  "0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000a11905",
];
