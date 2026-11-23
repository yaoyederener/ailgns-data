// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title aiswap 发币平台的标准代币
/// @notice OpenZeppelin v5.0.2 的 ERC20 原样，只加一个构造函数：部署时把全部代币一次性发给部署人。
///         固定总量、不能增发、没有管理员、没有交易税、没有黑名单，部署后任何人都改不了。
contract LaunchToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply_) ERC20(name_, symbol_) {
        _mint(msg.sender, supply_);
    }
}
