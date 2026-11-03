// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// 测试用代币：feeBps > 0 时模拟转账收税的代币
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public feeBps;

    constructor(uint256 feeBps_) { feeBps = feeBps_; }

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[to] += amount - fee;
    }
}

interface IEscrow {
    function refundExpired(uint256[] calldata ids) external;
}

/// 测试用恶意代币：转账时尝试重入托管合约
contract ReentrantToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public escrow;

    function setEscrow(address e) external { escrow = e; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _attack();
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _attack();
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function _attack() private {
        if (escrow != address(0)) {
            uint256[] memory ids = new uint256[](1);
            IEscrow(escrow).refundExpired(ids);
        }
    }
}

/// 测试用 Uniswap V2 交易对：只模拟 token0/token1/getReserves
contract MockPair {
    address public token0;
    address public token1;
    uint112 private r0;
    uint112 private r1;

    constructor(address t0, address t1) {
        token0 = t0;
        token1 = t1;
    }

    function setReserves(uint112 a, uint112 b) external {
        r0 = a;
        r1 = b;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (r0, r1, 0);
    }
}
