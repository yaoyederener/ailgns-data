// 🔁 aiswap（本站自己的 DEX）常量：合约地址 + 费率 + 链参数。前端 aiswap.js 通过 /api/aiswap 读这里，地址只在这一个文件里填
// 合约 = PancakeSwap V2 原版一行不改（Factory / Pair / Router02 + WETH9），部署步骤见 docs/aiswap/部署清单.md
// 站长 2026-11-11 定：总费 0.25%（LP 0.17% + 平台 0.08%），平台费收款 = 谷歌社交账号钱包；新币一律用 AiLGNS 报价
export const AISWAP = {
  chain: {
    id: 6714, hex: "0x1a3a", name: "Anubis",
    rpcs: ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"],
    native: { name: "gasDAI", symbol: "DAI", decimals: 18 }, // 链上 Gas 币；和下面的 ERC20 DAI 是两样东西
    explorer: "#/scan"
  },
  // 万分比：total = 25 → 0.25%；LP 留 17（0.17%）、平台 8（0.08%）。写死在 PancakePair 里，部署后改不了
  fee: { total: 25, lp: 17, protocol: 8, denom: 10000 },
  feeTo: "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6", // 平台费收款（部署后 factory.setFeeTo 指向它）
  // ↓ 部署完按 docs/aiswap/部署清单.md 第 4 步抄进来（全小写或原样都行）。三个都填了页面才从「部署中」变成真功能
  contracts: { weth: "0xc5da7d212aad698008d2bf6004aca2ee352a6723", factory: "0x431c87b1ec15cb955c60262bd4d2ce798281e501", router: "0x477abc5b8f2de7bf50e0728a44707ca0c670a982" }, /* 2026-11-09 站长钱包部署，hash / feeTo 已核对 */
  // PancakePair 字节码指纹：Router 里写死的这串必须和部署后 factory.INIT_CODE_PAIR_HASH() 一致
  initCodeHash: "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5",
  // 报价币 = AiLGNS：aiswap 只做「新币 / AiLGNS」池子。站长 2026-11-09 定：AiLGNS ↔ DAI 的买卖全部走 OTC，前端不出现 DAI（含 DAI 的池子也不显示）
  quote: "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB",
  dai: "0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14", // 只用来识别并隐藏含 DAI 的池子
  tokens: [
    { sym: "AiLGNS", addr: "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", dec: 18 }
  ],
  // 发射台（第二阶段，站长 2026-11-09 定）：创建费 50 DAI 等值 AiLGNS（按 OTC 预言机价折算，进 feeTo）；首笔流动性 ≥ 500 DAI 等值 AiLGNS 并烧 LP；门槛 = 持有 1 枚创世 .ailgns
  launch: { createFeeDai: 50, minLiquidityDai: 500, burnLp: true, needGenesis: 1 },
  // 毕业线（站长 2026-11-09 定）：四条同时满足 + 站长人工确认后部署该币的 OTC 合约。quoteLiqDai：池子 AiLGNS 一侧 DAI 等值；vol7dDai：7 天成交；holders 不算池子和发币人；ageDays 上线天数
  graduate: { quoteLiqDai: 5000, vol7dDai: 10000, holders: 100, ageDays: 7, manualOk: true },
  slippage: [0.5, 1, 3], // 页面可选滑点（%），默认第 2 个
  deadlineMin: 20 // 钱包确认有效期（分钟），Router 的 deadline 参数
};
export const aiswapReady = () => !!(AISWAP.contracts.factory && AISWAP.contracts.router && AISWAP.contracts.weth);
// 给前端的精简配置（不含服务端才用的字段）
export const aiswapConfig = () => ({ chain: AISWAP.chain, fee: AISWAP.fee, feeTo: AISWAP.feeTo, contracts: AISWAP.contracts, initCodeHash: AISWAP.initCodeHash, dai: AISWAP.dai, quote: AISWAP.quote, tokens: AISWAP.tokens, slippage: AISWAP.slippage, deadlineMin: AISWAP.deadlineMin, ready: aiswapReady() });
