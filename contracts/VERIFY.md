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
| LGNS · Polygon 链 | 待部署 | LGNS `0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01`，DAI `0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063`，手续费收款同上 |

2026-10-31 核对：Anubis 链 LGNS OTC 合约的链上运行代码，和 AiLGNS OTC 合约逐字节相同，唯一差别是 5 处写死的挂单币地址（AiLGNS → LGNS）；`DAI()`、`feeRecipient()`、`FEE_BPS()`（100 = 1%）读出来都和上表一致。
