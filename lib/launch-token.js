// 🚀 发币平台的标准代币（docs/aiswap/contracts/LaunchToken.sol）：OpenZeppelin v5.0.2 ERC20 原样 + 一个构造函数（全部代币一次性发给部署人）。
// 固定总量、不能增发、没有管理员、没有税。名字 / 代号 / 总量都存在链上的存储里，所以每个币的「运行字节码」完全一样：
// 登记时接口拿链上的代码和这里逐字比对，不一样的（改过的合约）不收。
// 这两项在官方编译器编出字节码后填；空着 = 发币还没开放（页面显示「准备中」，接口不收登记）。
export const TOKEN_RUNTIME = "";
export const TOKEN_BUILD = { solc: "", optimizer: 200, evm: "paris", oz: "5.0.2" };
