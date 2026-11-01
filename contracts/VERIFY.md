# AiLGNS OTC 托管合约：开源与核对

- 合约地址（Anubis 链，链 ID 6714）：`0x4e730be6d46be71223ded5a32dc45799f6d4bc15`
- 源码：[`AilgnsOtcEscrow.sol`](AilgnsOtcEscrow.sol)（MIT 许可）
- 测试：[`test/test_escrow.py`](test/test_escrow.py)，36 项全部通过

## 编译参数（和部署时完全一致）

| 项目 | 值 |
|---|---|
| 编译器 | solc `v0.8.24+commit.e11b9ed9` |
| 优化 | 开启，200 runs |
| EVM 版本 | paris |
| 标准输入 | [`AilgnsOtcEscrow.standard-input.json`](AilgnsOtcEscrow.standard-input.json) |
| 构造参数 | AiLGNS `0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB`，DAI `0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14`，手续费收款 `0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6` |

## 自己核对链上代码就是这份源码

1. 用上面的编译器和标准输入编译，得到 `AilgnsOtcEscrow` 的创建字节码
2. 在区块浏览器读取合约的创建字节码（creation bytecode）
3. 链上的创建字节码 = 编译结果 + 三个构造参数（各补齐到 32 字节）

2026-10-30 核对结果：链上创建字节码与编译结果逐字节一致，包括末尾的元数据哈希
`1220 70fb2643b39a57640b09ef445d4ee3966030c41d3a57c6fb592d1efe55a31848`。

Anubis 区块浏览器（Blockscout）的源码验证服务目前无法使用（验证接口超时），已用同样的参数提交过；服务恢复后会再次提交，届时在浏览器上也能直接看到源码。

## LGNS OTC（同一份源码，构造参数不同）

| 市场 | 合约地址 | 构造参数 |
|---|---|---|
| LGNS · Anubis 链（部署区块 17936478） | `0xb6a7a3be9a17ad241665ab9bddbd9a573d488818` | LGNS `0x4D1D808a081FdAc440703b3765FC61f8028C06B8`，DAI `0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14`，手续费收款 `0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6` |
| LGNS · Polygon 链（部署区块 96510526） | `0x4060f38d3e837843b69014d9f85ecfb3e29fa2db` | LGNS `0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01`，DAI `0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063`，手续费收款同上 |
| gLGNS · Anubis 链（部署区块 18004618） | `0x2b0ab121d60f823fffc4cef75af26055df388e2b` | gLGNS `0xf140a92c156e76f5a1d3d6f96284b250330f8f4c`，DAI `0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14`，手续费收款同上 |

2026-11-01 核对：Anubis 链 gLGNS OTC 合约的链上运行代码和 AiLGNS OTC 合约逐字节相同，唯一差别是写死的挂单币地址（AiLGNS → gLGNS）；`AILGNS()`、`DAI()`、`feeRecipient()`、`FEE_BPS()`（100 = 1%）读出来都和上表一致。（这个地址和 Polygon 链上的像素墙收款合约相同，是因为同一个部署钱包在两条链上用了相同的 nonce，两条链上是两份不同的合约。）

2026-10-31 核对：Anubis 链 LGNS OTC 合约的链上运行代码，和 AiLGNS OTC 合约逐字节相同，唯一差别是 5 处写死的挂单币地址（AiLGNS → LGNS）；`DAI()`、`feeRecipient()`、`FEE_BPS()`（100 = 1%）读出来都和上表一致。Polygon 链 LGNS OTC 合约同样核对过：和 AiLGNS OTC 合约逐字节相同，差别只有写死的挂单币地址（→ Polygon LGNS）和 DAI 地址（→ Polygon DAI）。

## 像素墙收款合约 LgnsPixelSink

- 合约地址（Anubis 链，部署区块 17937871）：`0xf1fb8f098979dc29a3020070ac93ef24f1b2ca4c`
- 源码：[`LgnsPixelSink.sol`](LgnsPixelSink.sol)，标准输入 [`LgnsPixelSink.standard-input.json`](LgnsPixelSink.standard-input.json)（solc v0.8.24，优化 200 runs，EVM paris），无构造参数
- 收到的 LGNS 任何人都可以调用 `flush()` 分出去：80% → 销毁地址 `0x000000000000000000000000000000000000dEaD`，20% → 原收款钱包 `0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6`（再由分账合约按 30/40/30 分）

2026-10-31 核对：链上运行代码和用上面的标准输入编译出来的结果逐字节一致；`TOKEN()`、`BURN()`、`REVENUE()`、`BURN_BPS()`（8000 = 80%）读出来都和源码一致。部署前在 Anubis 链的本地分叉上用真实 LGNS 测试过：转入 100 LGNS 后 flush，销毁地址 +80、原收款钱包 +20、合约清零。

### Polygon 链版 LgnsPixelSinkPolygon

- 源码：[`LgnsPixelSinkPolygon.sol`](LgnsPixelSinkPolygon.sol)，标准输入 [`LgnsPixelSinkPolygon.standard-input.json`](LgnsPixelSinkPolygon.standard-input.json)（同样的编译设置），无构造参数
- 和 Anubis 版只差写死的 `TOKEN`（→ Polygon LGNS `0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01`）；销毁地址、原收款钱包、80% 比例都一样
- 2026-10-31 在 Polygon 链的本地分叉上用真实 LGNS 测试过：转入 100 LGNS 后 flush，销毁地址 +80、原收款钱包 +20、合约清零
- 合约地址（Polygon 链，部署区块 96512223）：`0x2b0ab121d60f823fffc4cef75af26055df388e2b`
- 2026-10-31 核对：链上运行代码和用上面的标准输入编译出来的结果逐字节一致；`TOKEN()`、`BURN()`、`REVENUE()`、`BURN_BPS()`（8000 = 80%）读出来都和源码一致
- 部署前（区块 96512223 之前），Polygon 链的像素墙付款直接转进销毁地址（100% 销毁）

## AWAKE NFT 卡牌托管合约 AwakeNftEscrow

- 源码：[`AwakeNftEscrow.sol`](AwakeNftEscrow.sol)（MIT 许可）；测试：[`test/AwakeNftEscrow.t.sol`](test/AwakeNftEscrow.t.sol)（forge，19 项全部通过）
- 编译参数和 AiLGNS OTC 一样：solc `v0.8.24+commit.e11b9ed9`，优化开启 200 runs，EVM 版本 paris；标准输入 [`AwakeNftEscrow.standard-input.json`](AwakeNftEscrow.standard-input.json)，部署用的字节码在 [`AwakeNftEscrow.json`](AwakeNftEscrow.json)
- 构造参数：卡牌合约 `0x58839f46bd0E3F4494E2BEB8ca93Da9352208615`（Awake Governance NFT），DAI `0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14`，手续费收款 `0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6`
- 规则（都写死在合约里）：整张成交；手续费 `FEE_BPS = 300`（成交价的 3%），由买家在成交价之外另付，卖家拿完整标价；求购单预存「价格 + 手续费」的 DAI；没有管理员、不能升级
- 合约地址（Anubis 链，部署区块 18008025）：`0x8c67912b3ed44f4512c2f22b7b2263f6659396ed`

2026-11-01 核对：链上运行代码和上述参数编译出的运行代码逐字节相同，唯一差别是三个 immutable 参数（卡牌合约、DAI、手续费收款地址）被填成上表的值；`NFT()`、`DAI()`、`feeRecipient()`、`FEE_BPS()`（300 = 3%）读出来都和上表一致。

运行测试：把 `AwakeNftEscrow.sol` 放进 forge 项目的 `src/`、把 `test/AwakeNftEscrow.t.sol` 放进 `test/`（import 路径改成 `../src/AwakeNftEscrow.sol`），`foundry.toml` 里 `solc_version = "0.8.24"`、`optimizer_runs = 200`、`evm_version = "paris"`，然后 `forge test`。

## 点对点借款合约 AilgnsLoanEscrow

- 源码：[`AilgnsLoanEscrow.sol`](AilgnsLoanEscrow.sol)（MIT 许可）；测试：[`test/AilgnsLoanEscrow.t.sol`](test/AilgnsLoanEscrow.t.sol)（forge，18 项全部通过）
- 编译参数和 AiLGNS OTC 一样：solc `v0.8.24+commit.e11b9ed9`，优化开启 200 runs，EVM 版本 paris；标准输入 [`AilgnsLoanEscrow.standard-input.json`](AilgnsLoanEscrow.standard-input.json)，部署用的字节码在 [`AilgnsLoanEscrow.json`](AilgnsLoanEscrow.json)
- 构造参数（AiLGNS 抵押市场）：抵押币 AiLGNS `0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB`，DAI `0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14`，手续费收款 `0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6`
- 规则（都写死在合约里）：借款人押币挂单，借多少 DAI、到期还多少、借几天（1–90 天）自己填，单笔本金 ≤ 2,000 DAI；出借人接单时付本金给借款人、另付本金 1% 手续费；到期前任何人都可替借款人还款（钱给出借人、抵押币退借款人）；到期没还任何人都可触发把抵押币划给出借人；不看价格、不清算；没有管理员、不能升级
- 合约地址：待部署（部署后在这里补上地址和部署区块，并核对链上代码）
