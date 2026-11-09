# aiswap 要部署的三份源码（原版，一行没改）

2026-11-09 从 Sourcify（开源验证库 sourcify.dev）下载，三份都是「完全匹配」：链上创建字节码和运行字节码都和这份源码按下面参数编译的结果一致。

| 文件 | 来源（已验证的链上合约） | 编译器 | Optimizer | EVM |
|---|---|---|---|---|
| PancakeFactory.sol（内含 PancakeERC20、PancakePair、PancakeFactory） | BSC 主网 PancakeSwap V2 Factory `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` | solc **0.5.16**+commit.9c3226ce | **关**（runs 200） | istanbul |
| PancakeRouter.sol（内含 TransferHelper、SafeMath、PancakeLibrary、PancakeRouter） | BSC 主网 PancakeSwap V2 Router `0x10ED43C718714eb63d5aA57B78B54704E256024E` | solc **0.6.6**+commit.6c089d02 | **开**，runs **999999** | istanbul |
| WETH9.sol | 以太坊主网 WETH `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | solc **0.4.19**+commit.c4cbbb05 | **关**（runs 200） | 默认 |

核对过的关键行（2026-11-09）：
- PancakePair.swap：`balance0.mul(10000).sub(amount0In.mul(25))` → 总费 0.25%
- PancakePair._mintFee：`.mul(8)` / `rootK.mul(17).add(rootKLast.mul(8))` → 平台 0.08%、LP 0.17%
- PancakeLibrary：`amountIn.mul(9975)`；`pairFor` 写死 `00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5`
- BSC 链上 Factory 的 `INIT_CODE_PAIR_HASH()` 读出来 = `0x00fb7f63…69bd5`，和 Router 里写死的一致。**我们部署后也必须读出这个值**。

⚠️ Factory 的 optimizer 必须是「关」：开了优化编译出来的 PancakePair 字节码不同，hash 就对不上，Router 会找错池子地址。

## 字节码文件（`*.bytecode.txt`，内部部署页 #/aiswap/deploy 用）

2026-11-09 从 Sourcify 取的**链上原样创建字节码**（onchainBytecode），只去掉了末尾的构造参数（Factory 32 字节、Router 64 字节、WETH9 没有）。用它部署出来的合约和 BSC 主网 / 以太坊主网的那份**逐字节一致**（连末尾的元数据指纹都一样），所以 Factory 的 `INIT_CODE_PAIR_HASH` 必然等于 `0x00fb7f63…69bd5`。部署页会把构造参数（Factory：feeToSetter = 连接的钱包；Router：factory + WETH 地址）接在后面再发交易。
为什么不用 Remix 编译：2026-11-09 实测 Remix 2.6 + OKX 插件在 Anubis 链上部署会报「…indexOf is not a function」发不出去。

## 已部署（Anubis，2026-11-09，站长钱包 0xedb9…db1e6）

| 合约 | 地址 |
|---|---|
| WETH9 | `0xc5da7d212aad698008d2bf6004aca2ee352a6723` |
| PancakeFactory（feeToSetter / feeTo = 0xedb9…db1e6） | `0x431c87b1ec15cb955c60262bd4d2ce798281e501` |
| PancakeRouter | `0x477abc5b8f2de7bf50e0728a44707ca0c670a982` |
| 第一个池子 AiLGNS / DAI | `0xf1d45cfbcd430d5e90cc5fa25e8958cc3c798abe` |
