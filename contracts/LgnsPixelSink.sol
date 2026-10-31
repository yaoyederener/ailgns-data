// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

/// @title LGNS 像素墙收款合约
/// @notice 像素墙的付款（Anubis 链 LGNS）直接转进这个合约。任何人都可以调用 flush()，把合约里的 LGNS 按写死的比例转出去：
///         80% → 销毁地址 0x…dEaD（永久销毁），20% → 原收款钱包（再由分账合约按 30/40/30 分配）。
///         地址和比例写死在合约里，没有管理员、不能升级、不能修改，合约里的币只能去这两个地方。
contract LgnsPixelSink {
    address public constant TOKEN = 0x4D1D808a081FdAc440703b3765FC61f8028C06B8; // Anubis 链 LGNS
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    address public constant REVENUE = 0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6; // 原收款钱包
    uint256 public constant BURN_BPS = 8000; // 80% 销毁

    /// @notice 累计已经销毁 / 转给原收款钱包的数量
    uint256 public totalBurned;
    uint256 public totalRevenue;

    event Flushed(uint256 amount, uint256 burned, uint256 revenue, address indexed by);

    /// @notice 把合约里现有的 LGNS 全部按 80 / 20 转出去
    function flush() external {
        uint256 amount = IERC20(TOKEN).balanceOf(address(this));
        require(amount > 0, "EMPTY");
        uint256 burned = (amount * BURN_BPS) / 10000;
        uint256 revenue = amount - burned;
        totalBurned += burned;
        totalRevenue += revenue;
        _transfer(BURN, burned);
        _transfer(REVENUE, revenue);
        emit Flushed(amount, burned, revenue, msg.sender);
    }

    function _transfer(address to, uint256 value) private {
        if (value == 0) return;
        (bool ok, bytes memory ret) = TOKEN.call(abi.encodeWithSelector(0xa9059cbb, to, value)); // transfer
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "TRANSFER_FAILED");
    }
}
