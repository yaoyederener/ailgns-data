// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

/// @title AiLGNS OTC 托管合约
/// @notice 挂单方把币存进合约挂单；吃单方在同一笔交易里付款并拿走挂单的币，要么全部成功，要么全部失败。
///         挂单方随时可以撤单；到期没成交的，任何人都可以触发把币退回给挂单方。
///         合约没有管理员、不能升级、没有暂停开关，任何人（包括部署者）都动不了别人挂单里的币。
contract AilgnsOtcEscrow {
    address public immutable AILGNS;
    address public immutable DAI;
    /// 成交手续费收款地址（部署时写死，之后不能改）
    address public immutable feeRecipient;
    /// 单笔挂单上限，按 DAI 计（部署时写死）
    uint256 public immutable maxDaiPerOrder;

    /// 成交手续费 1%，从吃单方拿到的币里扣
    uint256 public constant FEE_BPS = 100;
    uint256 public constant MIN_DURATION = 10 minutes;
    uint256 public constant MAX_DURATION = 30 days;

    struct Order {
        address maker;
        bool sellAilgns; // true：存 AILGNS 换 DAI；false：存 DAI 换 AILGNS
        bool open;
        uint64 expiry;
        uint256 giveTotal; // 挂单时存入的总数量，用来计算价格
        uint256 wantTotal; // 想换回的总数量
        uint256 giveLeft; // 合约里还剩多少没成交
    }

    Order[] private _orders;
    uint256 private _lock = 1;

    event Created(uint256 indexed id, address indexed maker, bool sellAilgns, uint256 give, uint256 want, uint64 expiry);
    event Filled(uint256 indexed id, address indexed taker, uint256 amount, uint256 paid, uint256 fee, uint256 giveLeft);
    event Closed(uint256 indexed id, address indexed maker, uint256 refunded, bool expired);

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address ailgns, address dai, address feeRecipient_, uint256 maxDaiPerOrder_) {
        require(ailgns != address(0) && dai != address(0) && feeRecipient_ != address(0), "ZERO_ADDRESS");
        require(ailgns != dai, "SAME_TOKEN");
        require(maxDaiPerOrder_ > 0, "ZERO_CAP");
        AILGNS = ailgns;
        DAI = dai;
        feeRecipient = feeRecipient_;
        maxDaiPerOrder = maxDaiPerOrder_;
    }

    // ---------------- 挂单 ----------------

    /// @param sellAilgns true：存 give 个 AILGNS，换 want 个 DAI；false：存 give 个 DAI，换 want 个 AILGNS
    /// @param duration 多少秒后过期（10 分钟到 30 天）
    function create(bool sellAilgns, uint256 give, uint256 want, uint64 duration) external nonReentrant returns (uint256 id) {
        require(give > 0 && want > 0, "ZERO_AMOUNT");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "BAD_DURATION");
        require((sellAilgns ? want : give) <= maxDaiPerOrder, "OVER_CAP");

        address token = sellAilgns ? AILGNS : DAI;
        _pullExact(token, msg.sender, address(this), give);

        id = _orders.length;
        uint64 expiry = uint64(block.timestamp) + duration;
        _orders.push(Order(msg.sender, sellAilgns, true, expiry, give, want, give));
        emit Created(id, msg.sender, sellAilgns, give, want, expiry);
    }

    // ---------------- 吃单 ----------------

    /// @notice 从挂单里拿走 amount 个币，按挂单价格付款给挂单方。付款和拿币在同一笔交易里完成。
    /// @param amount 想拿走的挂单币数量（可以只吃一部分）
    /// @param maxPay 最多愿意付多少，防止价格计算和预期不一致
    function fill(uint256 id, uint256 amount, uint256 maxPay) external nonReentrant {
        require(id < _orders.length, "NO_ORDER");
        Order storage o = _orders[id];
        require(o.open, "CLOSED");
        require(block.timestamp < o.expiry, "EXPIRED");
        require(amount > 0 && amount <= o.giveLeft, "BAD_AMOUNT");

        uint256 pay = (amount * o.wantTotal + o.giveTotal - 1) / o.giveTotal; // 向上取整，挂单方不吃亏
        require(pay <= maxPay, "PRICE_CHANGED");

        o.giveLeft -= amount;
        if (o.giveLeft == 0) o.open = false;

        (address giveToken, address wantToken) = o.sellAilgns ? (AILGNS, DAI) : (DAI, AILGNS);
        _pullExact(wantToken, msg.sender, o.maker, pay);

        uint256 fee = (amount * FEE_BPS) / 10_000;
        _push(giveToken, msg.sender, amount - fee);
        if (fee > 0) _push(giveToken, feeRecipient, fee);

        emit Filled(id, msg.sender, amount, pay, fee, o.giveLeft);
        if (!o.open) emit Closed(id, o.maker, 0, false);
    }

    // ---------------- 撤单 / 过期退回 ----------------

    /// @notice 挂单方随时撤单，剩余的币原路退回
    function cancel(uint256 id) external nonReentrant {
        require(id < _orders.length, "NO_ORDER");
        require(_orders[id].maker == msg.sender, "NOT_MAKER");
        _close(id, false);
    }

    /// @notice 过期没成交的挂单，任何人都可以触发退回，币只会退给挂单方本人
    function refundExpired(uint256[] calldata ids) external nonReentrant {
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (id < _orders.length && _orders[id].open && block.timestamp >= _orders[id].expiry) _close(id, true);
        }
    }

    function _close(uint256 id, bool expired) private {
        Order storage o = _orders[id];
        require(o.open, "CLOSED");
        uint256 left = o.giveLeft;
        o.open = false;
        o.giveLeft = 0;
        if (left > 0) _push(o.sellAilgns ? AILGNS : DAI, o.maker, left);
        emit Closed(id, o.maker, left, expired);
    }

    // ---------------- 查询 ----------------

    function ordersCount() external view returns (uint256) {
        return _orders.length;
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        return _orders[id];
    }

    /// @notice 按编号区间读取挂单，前端用来展示订单簿
    function getOrders(uint256 from, uint256 count) external view returns (Order[] memory list) {
        uint256 end = from + count;
        if (end > _orders.length) end = _orders.length;
        if (from >= end) return new Order[](0);
        list = new Order[](end - from);
        for (uint256 i = from; i < end; i++) list[i - from] = _orders[i];
    }

    // ---------------- 转账工具 ----------------

    /// 拉取并核对到账数量，转账收税或异常的代币会直接失败，保证账实一致
    function _pullExact(address token, address from, address to, uint256 amount) private {
        uint256 before = IERC20(token).balanceOf(to);
        _call(token, abi.encodeWithSelector(0x23b872dd, from, to, amount)); // transferFrom
        require(IERC20(token).balanceOf(to) - before == amount, "TRANSFER_MISMATCH");
    }

    function _push(address token, address to, uint256 amount) private {
        _call(token, abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "TOKEN_TRANSFER_FAILED");
    }
}
