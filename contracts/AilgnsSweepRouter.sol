// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AiLGNS OTC 批量扫单合约（Anubis 链）
/// @notice 托管合约一笔交易只能吃一张单，扫 N 张单钱包要确认 N 次。本合约在一笔交易里帮吃单人按顺序吃掉多张单：
///         从吃单人钱包取最多 maxPay 个要付的币 → 一张张调用托管合约 fill（手续费照旧 1%，托管合约直接转给分账地址）→
///         吃到的币全部转给吃单人，没花完的原样退回。同一笔交易里完成，合约里不留钱。
///         只能对下面写死的三个 Anubis 托管合约用；没有管理员、不能升级。
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IOtc {
    struct Order {
        address maker;
        bool sellAilgns;
        bool open;
        uint64 expiry;
        uint256 giveTotal;
        uint256 wantTotal;
        uint256 giveLeft;
    }

    function AILGNS() external view returns (address);
    function DAI() external view returns (address);
    function getOrders(uint256 from, uint256 count) external view returns (Order[] memory);
    function fill(uint256 id, uint256 amount, uint256 maxPay) external;
}

contract AilgnsSweepRouter {
    address public constant AILGNS_OTC = 0x4e730BE6d46bE71223Ded5A32Dc45799f6D4bc15;
    address public constant LGNS_OTC = 0xB6A7A3bE9a17AD241665ab9BDdbd9a573D488818;
    address public constant GLGNS_OTC = 0x2B0aB121D60f823FFfC4ceF75Af26055Df388e2b;
    uint256 public constant MAX_ORDERS = 40;

    uint256 private _lock = 1;

    event Swept(address indexed otc, address indexed taker, bool buy, uint256 orders, uint256 paid, uint256 got);

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param otc     三个托管合约之一
    /// @param buy     true = 扫卖单（付 DAI 买币）；false = 扫买单（付币换 DAI）
    /// @param ids     要吃的单，按价格从优到差
    /// @param amounts 每张单最多吃多少（对方挂的币）；被别人先吃掉一部分的，按剩下的吃
    /// @param maxPay  最多付多少（buy 时是 DAI，否则是币）
    /// @param minGet  至少要收到多少（扣完 1% 手续费后），不够整笔回滚
    function sweep(address otc, bool buy, uint256[] calldata ids, uint256[] calldata amounts, uint256 maxPay, uint256 minGet)
        external
        nonReentrant
        returns (uint256 paid, uint256 got)
    {
        require(otc == AILGNS_OTC || otc == LGNS_OTC || otc == GLGNS_OTC, "BAD_OTC");
        require(ids.length > 0 && ids.length == amounts.length && ids.length <= MAX_ORDERS, "BAD_ORDERS");
        require(maxPay > 0, "ZERO_AMOUNT");
        address[2] memory t = buy ? [IOtc(otc).DAI(), IOtc(otc).AILGNS()] : [IOtc(otc).AILGNS(), IOtc(otc).DAI()]; // [要付的币, 要收的币]
        uint256[2] memory b0 = [_bal(t[0]), _bal(t[1])];
        _call(t[0], abi.encodeWithSelector(IERC20.transferFrom.selector, msg.sender, address(this), maxPay));
        uint256 budget = _bal(t[0]) - b0[0]; // 按实际到账算（防转账扣税的币）

        _approve(t[0], otc, budget);
        uint256 n = _fillAll(otc, buy, ids, amounts, budget);
        _approve(t[0], otc, 0);
        require(n > 0, "NOTHING_FILLED");
        (paid, got) = _settle(t, b0, budget, minGet);
        emit Swept(otc, msg.sender, buy, n, paid, got);
    }

    // 收到的币全部给吃单人，没花完的原样退回
    function _settle(address[2] memory t, uint256[2] memory b0, uint256 budget, uint256 minGet) private returns (uint256 paid, uint256 got) {
        uint256 left = _bal(t[0]) - b0[0];
        paid = budget - left;
        got = _bal(t[1]) - b0[1];
        require(got >= minGet, "GOT_TOO_LITTLE");
        _send(t[0], msg.sender, left);
        _send(t[1], msg.sender, got);
    }

    function _fillAll(address otc, bool buy, uint256[] calldata ids, uint256[] calldata amounts, uint256 budget) private returns (uint256 n) {
        for (uint256 i = 0; i < ids.length && budget > 0; i++) {
            IOtc.Order memory o = IOtc(otc).getOrders(ids[i], 1)[0];
            // 扫卖单只吃卖单（对方卖币要 DAI），扫买单只吃买单；已成交 / 撤单 / 过期的跳过
            if (o.sellAilgns != buy || !o.open || o.expiry <= block.timestamp || o.giveLeft == 0 || o.maker == msg.sender) continue;
            uint256 want = amounts[i] < o.giveLeft ? amounts[i] : o.giveLeft;
            (uint256 amount, uint256 pay) = _take(o, want, budget);
            if (amount == 0) continue;
            IOtc(otc).fill(ids[i], amount, pay);
            budget -= pay;
            n++;
        }
    }

    // 最多吃 want 个对方的币、最多付 budget：返回吃多少（amount）和付多少（pay，向上取整，和托管合约一样）
    function _take(IOtc.Order memory o, uint256 want, uint256 budget) private pure returns (uint256 amount, uint256 pay) {
        amount = want;
        pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        if (pay <= budget) return (amount, pay);
        amount = (budget * o.giveTotal) / o.wantTotal;
        if (amount == 0) return (0, 0);
        pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        if (pay > budget) {
            amount -= 1;
            pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        }
    }

    function _bal(address token) private view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function _send(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        _call(token, abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    }

    function _approve(address token, address spender, uint256 amount) private {
        _call(token, abi.encodeWithSelector(IERC20.approve.selector, spender, amount));
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "TOKEN_CALL_FAILED");
    }
}
