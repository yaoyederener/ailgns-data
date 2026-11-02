// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AiLGNS 收入回购分账合约（Anubis 链）
/// @notice 会员费和 OTC 手续费照旧进入收款钱包 SOURCE。SOURCE 授权本合约后，触发钱包（KEEPER）可以：
///         ① 把 SOURCE 收到的 LGNS 卖进 LGNS OTC 的买单换成 DAI（不走 DEX，DEX 卖出要扣约 50%）；
///         ② 用 DAI 扫 AiLGNS OTC 的卖单买成 AiLGNS；
///         ③ 把买到的 AiLGNS 连同 SOURCE 收到的 AiLGNS 按 40% / 30% / 30% 分给三个固定地址。
///         价格保护写死在合约里：LGNS 只卖给不低于 DEX 现价 50% 的买单；AiLGNS 只买不高于 DEX 现价 +15% 的卖单。
///         没换完的 LGNS / DAI 留在本合约，下次接着换；三个收款地址、比例、价格保护都写死，没有管理员、不能升级。
///         只有 KEEPER 能触发；KEEPER 也只能把钱换成 AiLGNS 分给这三个地址，或者原样退回 SOURCE，转不到别处
///         （唯一例外：每次最多 0.5 DAI 给 KEEPER 补 Gas，Anubis 链的 Gas 用 DAI 付）。
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

interface IPair {
    function getReserves() external view returns (uint112, uint112, uint32);
}

contract AilgnsBuyback {
    address public constant SOURCE = 0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6; // 收款钱包
    address public constant PAYEE1 = 0xD53A00Bb90bB606f10d888419a14ecA779F17285; // 40%
    address public constant PAYEE2 = 0xe8782615E32557F257DD88D70b1eb0d7f47B91c3; // 30%
    address public constant PAYEE3 = 0x5505d382bf5D705c5D3Ec0cBFc17a3DDe394B322; // 30%
    uint256 public constant BPS1 = 4000;
    uint256 public constant BPS2 = 3000;

    address public constant LGNS = 0x4D1D808a081FdAc440703b3765FC61f8028C06B8; // 9 位小数
    address public constant DAI = 0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14;
    address public constant AILGNS = 0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB;
    address public constant LGNS_OTC = 0xB6A7A3bE9a17AD241665ab9BDdbd9a573D488818;
    address public constant AILGNS_OTC = 0x4e730BE6d46bE71223Ded5A32Dc45799f6D4bc15;
    address public constant LGNS_PAIR = 0x32A4586797E3f561F41C0F47CA57eD08D64f3dC0; // token1 = DAI
    address public constant AILGNS_PAIR = 0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0; // token1 = DAI

    uint256 public constant MIN_BID_BPS = 5000; // LGNS 卖出价不低于 DEX 现价 50%
    uint256 public constant MAX_ASK_BPS = 11500; // AiLGNS 买入价不高于 DEX 现价 115%（站长定：损耗不超过 15% 就扫，给 OTC 增加流动性）
    uint256 public constant MAX_GAS_TIP = 5e17; // 每次最多 0.5 DAI 给 KEEPER 补 Gas
    uint256 public constant MAX_ORDERS = 20;

    address public immutable keeper;
    /// @notice 每个币种累计从 SOURCE 取走的收入（LGNS / DAI / AiLGNS）
    mapping(address => uint256) public totalPulled;
    /// @notice 累计卖出的 LGNS、换到的 DAI、花掉的 DAI、买到的 AiLGNS
    uint256 public totalLgnsSold;
    uint256 public totalDaiFromLgns;
    uint256 public totalDaiSpent;
    uint256 public totalAilgnsBought;
    uint256 private _lock = 1;

    event Converted(uint256 lgnsSold, uint256 daiFromLgns, uint256 daiSpent, uint256 ailgnsBought, address indexed by);
    // 和旧分账合约同样的事件：amount = 本次分出去的 AiLGNS 总数，三份都转出去
    event Split(address indexed token, uint256 amount, uint256 toPayee1, uint256 toPayee2, uint256 toPayee3, address indexed by);
    event Refunded(address indexed token, uint256 amount);

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

    /// @param lgnsIn  从 SOURCE 取多少 LGNS（收入）
    /// @param bidIds  LGNS OTC 里要卖给的买单，按出价从高到低
    /// @param daiIn   从 SOURCE 取多少 DAI（收入）
    /// @param askIds  AiLGNS OTC 里要买的卖单，按价格从低到高
    /// @param ailgnsIn 从 SOURCE 取多少 AiLGNS（收入，直接分）
    /// @param minBought 这次至少要买到多少 AiLGNS（防止价格变化）
    /// @param gasTip  给 KEEPER 补多少 DAI 的 Gas（最多 0.5）
    function run(
        uint256 lgnsIn,
        uint256[] calldata bidIds,
        uint256 daiIn,
        uint256[] calldata askIds,
        uint256 ailgnsIn,
        uint256 minBought,
        uint256 gasTip
    ) external onlyKeeper nonReentrant {
        require(bidIds.length + askIds.length <= MAX_ORDERS, "TOO_MANY_ORDERS");
        require(gasTip <= MAX_GAS_TIP, "GAS_TIP");
        _pull(LGNS, lgnsIn);
        _pull(DAI, daiIn);
        _pull(AILGNS, ailgnsIn);

        // ① LGNS → DAI：吃 LGNS OTC 的买单（买单挂的是 DAI，要的是 LGNS），出价不低于 DEX 现价 50%
        uint256 daiBefore = IERC20(DAI).balanceOf(address(this));
        uint256 lgnsSold = _sweep(LGNS_OTC, LGNS_PAIR, LGNS, bidIds, false);
        uint256 daiFromLgns = IERC20(DAI).balanceOf(address(this)) - daiBefore;

        // 给 KEEPER 补 Gas
        if (gasTip > 0) {
            uint256 d = IERC20(DAI).balanceOf(address(this));
            _send(DAI, keeper, gasTip < d ? gasTip : d);
        }

        // ② DAI → AiLGNS：吃 AiLGNS OTC 的卖单（卖单挂的是 AiLGNS，要的是 DAI），要价不高于 DEX 现价 115%
        uint256 ailBefore = IERC20(AILGNS).balanceOf(address(this));
        uint256 daiSpent = _sweep(AILGNS_OTC, AILGNS_PAIR, DAI, askIds, true);
        uint256 bought = IERC20(AILGNS).balanceOf(address(this)) - ailBefore;
        require(bought >= minBought, "BOUGHT_TOO_LITTLE");

        totalLgnsSold += lgnsSold;
        totalDaiFromLgns += daiFromLgns;
        totalDaiSpent += daiSpent;
        totalAilgnsBought += bought;
        if (lgnsSold > 0 || daiSpent > 0) emit Converted(lgnsSold, daiFromLgns, daiSpent, bought, msg.sender);

        // ③ 合约里的 AiLGNS 全部按 40 / 30 / 30 分出去
        uint256 total = IERC20(AILGNS).balanceOf(address(this));
        if (total > 0) {
            uint256 a1 = (total * BPS1) / 10000;
            uint256 a2 = (total * BPS2) / 10000;
            uint256 a3 = total - a1 - a2;
            _send(AILGNS, PAYEE1, a1);
            _send(AILGNS, PAYEE2, a2);
            _send(AILGNS, PAYEE3, a3);
            emit Split(AILGNS, total, a1, a2, a3, msg.sender);
        }
    }

    /// @notice 把合约里没换完的币原样退回 SOURCE（比如长期没有合适的单子）
    function refund(address token) external onlyKeeper nonReentrant {
        require(token == LGNS || token == DAI || token == AILGNS, "BAD_TOKEN");
        uint256 b = IERC20(token).balanceOf(address(this));
        _send(token, SOURCE, b);
        emit Refunded(token, b);
    }

    // 用合约里的 payToken 逐张吃 ids 里的单，返回实际付掉多少 payToken
    // wantSell = true：只吃卖单（对方卖 AiLGNS），要价 ≤ 现价 × 115%；false：只吃买单（对方用 DAI 买 LGNS），出价 ≥ 现价 × 50%
    function _sweep(address otc, address pair, address payToken, uint256[] calldata ids, bool wantSell) private returns (uint256) {
        uint256 start = IERC20(payToken).balanceOf(address(this));
        if (ids.length == 0 || start == 0) return 0;
        (uint256 rDai, uint256 rTok) = _spot(pair);
        _approve(payToken, otc, start);
        uint256 left = start;
        for (uint256 i = 0; i < ids.length && left > 0; i++) {
            IOtc.Order memory o = _order(otc, ids[i]);
            if (o.sellAilgns != wantSell || !o.open || o.expiry <= block.timestamp || o.giveLeft == 0) continue;
            if (wantSell ? o.wantTotal * rTok * 10000 > o.giveTotal * rDai * MAX_ASK_BPS : o.giveTotal * rTok * 10000 < o.wantTotal * rDai * MIN_BID_BPS) continue;
            (uint256 amount, uint256 pay) = _take(o, left);
            if (amount == 0) continue;
            IOtc(otc).fill(ids[i], amount, pay);
            left -= pay;
        }
        _approve(payToken, otc, 0);
        return start - IERC20(payToken).balanceOf(address(this));
    }

    // 吃单：最多用 budget 个「对方要的币」，返回吃多少（amount，对方挂的币）和付多少（pay）
    function _take(IOtc.Order memory o, uint256 budget) private pure returns (uint256 amount, uint256 pay) {
        uint256 full = (o.giveLeft * o.wantTotal + o.giveTotal - 1) / o.giveTotal; // 吃完剩下的全部要付多少
        if (budget >= full) return (o.giveLeft, full);
        amount = (budget * o.giveTotal) / o.wantTotal;
        if (amount == 0) return (0, 0);
        pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        if (pay > budget) { // 向上取整多出 1 的时候，少吃一点
            amount -= 1;
            pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal;
        }
    }

    function _order(address otc, uint256 id) private view returns (IOtc.Order memory) {
        return IOtc(otc).getOrders(id, 1)[0];
    }

    function _spot(address pair) private view returns (uint256 rDai, uint256 rTok) {
        (uint112 r0, uint112 r1, ) = IPair(pair).getReserves();
        (rTok, rDai) = (r0, r1);
        require(rDai > 0 && rTok > 0, "NO_PRICE");
    }

    function _pull(address token, uint256 amount) private {
        if (amount == 0) return;
        uint256 b = IERC20(token).balanceOf(address(this));
        _call(token, abi.encodeWithSelector(IERC20.transferFrom.selector, SOURCE, address(this), amount));
        require(IERC20(token).balanceOf(address(this)) - b == amount, "PULL_MISMATCH");
        totalPulled[token] += amount;
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
