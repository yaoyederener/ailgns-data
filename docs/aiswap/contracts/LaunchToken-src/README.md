# LaunchToken：一键发币用的标准代币

- 源码：本目录 `LaunchToken.sol`（10 行）+ `openzeppelin-5.0.2/`（OpenZeppelin v5.0.2 官方 ERC20 源码，原样，取自 github.com/OpenZeppelin/openzeppelin-contracts 的 v5.0.2 标签）。
- 编译器：solc 0.8.26+commit.8a97fa7a（官方 soljson，sha256 db85e5396f523cc1a53c4c4d742e204f6dcba1a05842623d73be946809e11cd6）。
- 设置：optimizer 开、runs 200、evmVersion paris。源文件路径：`LaunchToken.sol` 和 `@openzeppelin/contracts/...`。
- 结果：创建字节码 2967 字节（`../LaunchToken.bytecode.txt`），运行字节码 1825 字节（`lib/launch-token.js` 的 TOKEN_RUNTIME），没有 immutable。
- 对外函数只有 9 个标准 ERC20 函数。没有增发、没有管理员、没有税、没有黑名单。
- 构造参数：(string 名字, string 代号, uint256 总量 × 10^18)，全部代币一次性发给部署人。
- 名字 / 代号 / 总量都在存储里，所以每个币的运行字节码逐字节相同；登记上榜时接口拿链上代码和 TOKEN_RUNTIME 逐字比对。
