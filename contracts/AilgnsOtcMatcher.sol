// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AiLGNS OTC 自动撮合合约（Anubis 链）
/// @notice 同一个 OTC 市场里，卖单要价低于买单出价（差价够付两边 1% 手续费）时，触发钱包（KEEPER）可以调用 matchOrders：
///         从收款钱包 SOURCE 临时取 DAI → 吃卖单拿到币 → 把币卖给买单换回 DAI → 循环，直到其中一张单吃完；
///         同一笔交易里本金原样退回 SOURCE，利润（DAI 和吃剩的零头币）全部转进回购分账合约 BUYBACK（攒够 300 美金自动分）。
///         赚不到 minProfit 整笔回滚，SOURCE 的本金一分不少。
///         没有管理员、不能升级；地址写死，钱只能去 SOURCE / BUYBACK（唯一例外：每次最多 0.5 DAI 从利润里给 KEEPER 补 Gas）。
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

    function getOrders(uint256 from, uint256 count) external view returns (Order[] memory);
    function fill(uint256 id, uint256 amount, uint256 maxPay) external;
}

contract AilgnsOtcMatcher {
    address public constant SOURCE = 0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6; // 收款钱包：出本金，收回本金
    address public constant BUYBACK = 0x99f47ca8E7ed873e01a337aEfC5b75f5328d2da3; // 回购分账合约：收利润

    address public constant LGNS = 0x4D1D808a081FdAc440703b3765FC61f8028C06B8;
    address public constant DAI = 0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14;
    address public constant AILGNS = 0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB;
    address public constant LGNS_OTC = 0xB6A7A3bE9a17AD241665ab9BDdbd9a573D488818;
    address public constant AILGNS_OTC = 0x4e730BE6d46bE71223Ded5A32Dc45799f6D4bc15;

    uint256 public constant MAX_ROUNDS = 30; // 一笔交易最多循环 30 轮
    uint256 public constant MAX_GAS_TIP = 5e17; // 每次最多 0.5 DAI 给 KEEPER 补 Gas

    address public immutable keeper;
    uint256 public totalMatches;
    uint256 public totalProfit; // 累计转进 BUYBACK 的 DAI 利润
    uint256 private _lock = 1;

    event Matched(address indexed otc, uint256 indexed sellId, uint256 indexed buyId, uint256 rounds, uint256 tokenVolume, uint256 daiIn, uint256 profit);

    modifier onlyKeeper() {
        require(msg.sender == keeper, "NOT_KEEPER");
        _;
    }

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address keeper_) {
        require(keeper_ != address(0), "ZERO_ADDRESS");
        keeper = keeper_;
    }

    /// @param otc       LGNS_OTC 或 AILGNS_OTC
    /// @param sellId    要吃的卖单（对方卖币要 DAI）
    /// @param buyId     要吃的买单（对方出 DAI 要币）
    /// @param daiIn     从 SOURCE 临时取多少 DAI 周转
    /// @param rounds    最多循环几轮（1–30）
    /// @param minProfit 至少赚多少 DAI，不够整笔回滚
    /// @param gasTip    从利润里给 KEEPER 补多少 DAI 的 Gas（最多 0.5）
    function matchOrders(address otc, uint256 sellId, uint256 buyId, uint256 daiIn, uint256 rounds, uint256 minProfit, uint256 gasTip)
        external
        onlyKeeper
        nonReentrant
    {
        address tok = otc == LGNS_OTC ? LGNS : otc == AILGNS_OTC ? AILGNS : address(0);
        require(tok != address(0), "BAD_OTC");
        require(rounds > 0 && rounds <= MAX_ROUNDS, "BAD_ROUNDS");
        require(gasTip <= MAX_GAS_TIP, "GAS_TIP");
        require(daiIn > 0, "ZERO_AMOUNT");

        uint256 daiStart = _bal(DAI);
        _call(DAI, abi.encodeWithSelector(IERC20.transferFrom.selector, SOURCE, address(this), daiIn));
        require(_bal(DAI) - daiStart == daiIn, "PULL_MISMATCH");

        _approve(DAI, otc, type(uint256).max);
        _approve(tok, otc, type(uint256).max);
        (uint256 n, uint256 volume) = _loop(otc, tok, sellId, buyId, rounds);
        _approve(DAI, otc, 0);
        _approve(tok, otc, 0);

        uint256 profit = _settle(tok, daiStart + daiIn, daiIn, minProfit, gasTip);
        emit Matched(otc, sellId, buyId, n, volume, daiIn, profit);
    }

    // 循环：① 用手里的 DAI 吃卖单拿到币 → ② 把币卖给买单换回 DAI（两边各扣 1% 手续费），直到一张单吃完
    function _loop(address otc, address tok, uint256 sellId, uint256 buyId, uint256 rounds) private returns (uint256 n, uint256 volume) {
        for (; n < rounds; n++) {
            IOtc.Order memory s = _order(otc, sellId);
            IOtc.Order memory b = _order(otc, buyId);
            if (!_live(s, true) || !_live(b, false)) break;
            (uint256 amount, uint256 pay) = _take(s, _bal(DAI));
            if (amount == 0) break;
            IOtc(otc).fill(sellId, amount, pay);
            (amount, pay) = _take(b, _bal(tok));
            if (amount == 0) break;
            IOtc(otc).fill(buyId, amount, pay);
            volume += pay;
        }
    }

    // 结算：本金退回 SOURCE，利润扣掉 Gas 补贴后进 BUYBACK，吃剩的零头币也进 BUYBACK；返回进 BUYBACK 的 DAI 利润
    function _settle(address tok, uint256 floor, uint256 daiIn, uint256 minProfit, uint256 gasTip) private returns (uint256 profit) {
        uint256 end = _bal(DAI);
        require(end > floor && end - floor >= minProfit, "NO_PROFIT");
        profit = end - floor;
        uint256 tip = gasTip < profit ? gasTip : profit;
        profit -= tip;
        _send(DAI, SOURCE, daiIn); // 本金原样退回
        _send(DAI, keeper, tip);
        _send(DAI, BUYBACK, profit); // 利润进分账
        _send(tok, BUYBACK, _bal(tok)); // 吃剩的零头币也进分账
        totalMatches += 1;
        totalProfit += profit;
    }

    function _live(IOtc.Order memory o, bool sell) private view returns (bool) {
        return o.sellAilgns == sell && o.open && o.expiry > block.timestamp && o.giveLeft > 0;
    }

    // 吃单：最多用 budget 个「对方要的币」，返回吃多少（amount，对方挂的币）和付多少（pay）
    function _take(IOtc.Order memory o, uint256 budget) private pure returns (uint256 amount, uint256 pay) {
        uint256 full = (o.giveLeft * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        if (budget >= full) return (o.giveLeft, full);
        amount = (budget * o.giveTotal) / o.wantTotal;
        if (amount == 0) return (0, 0);
        pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        if (pay > budget) {
            amount -= 1;
            pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        }
    }

    function _order(address otc, uint256 id) private view returns (IOtc.Order memory) {
        return IOtc(otc).getOrders(id, 1)[0];
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
