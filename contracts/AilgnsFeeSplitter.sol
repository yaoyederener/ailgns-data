// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AiLGNS 手续费分账合约
/// @notice OTC 手续费照旧进入收款钱包 SOURCE。SOURCE 授权本合约后，按固定比例把指定币种、指定数量从 SOURCE 分出去：
///         30% → PAYEE1，40% → PAYEE2，30% → PAYEE3（就是 SOURCE 自己，所以这一份留在原地不用转）。
///         三个地址和比例写死在合约里，没有管理员、不能升级、不能修改；钱只会从 SOURCE 直接转到这几个固定地址，
///         合约自己不持有任何币，也不需要充 Gas。
///         只有 KEEPER（付 Gas 的触发钱包）和 SOURCE 本人能触发分账，别人无法动用 SOURCE 的授权。
contract AilgnsFeeSplitter {
    address public constant SOURCE = 0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6; // 原收款钱包
    address public constant PAYEE1 = 0xe8782615E32557F257DD88D70b1eb0d7f47B91c3; // 30%
    address public constant PAYEE2 = 0xD53A00Bb90bB606f10d888419a14ecA779F17285; // 40%
    address public constant PAYEE3 = SOURCE; // 30%，留在原收款钱包
    uint256 public constant BPS1 = 3000;
    uint256 public constant BPS2 = 4000;
    uint256 public constant BPS3 = 3000;

    address public immutable keeper;

    /// @notice 每个币种累计已经分账的总数量（含留在 SOURCE 的 30%）
    mapping(address => uint256) public totalSplit;

    event Split(address indexed token, uint256 amount, uint256 toPayee1, uint256 toPayee2, uint256 toPayee3, address indexed by);

    constructor(address keeper_) {
        require(keeper_ != address(0), "ZERO_ADDRESS");
        keeper = keeper_;
    }

    /// @notice 把 SOURCE 里 amount 数量的 token 按 30/40/30 分账
    function split(address token, uint256 amount) external {
        require(msg.sender == keeper || msg.sender == SOURCE, "NOT_ALLOWED");
        require(amount > 0, "ZERO_AMOUNT");
        uint256 a1 = (amount * BPS1) / 10000;
        uint256 a2 = (amount * BPS2) / 10000;
        uint256 a3 = amount - a1 - a2; // 除不尽的零头算在留下的这份里
        totalSplit[token] += amount;
        _pull(token, PAYEE1, a1);
        _pull(token, PAYEE2, a2);
        emit Split(token, amount, a1, a2, a3, msg.sender);
    }

    function _pull(address token, address to, uint256 value) private {
        if (value == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, SOURCE, to, value)); // transferFrom
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "TRANSFER_FAILED");
    }
}
