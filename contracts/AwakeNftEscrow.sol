// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title AWAKE NFT 卡牌托管交易合约
/// @notice 卖家把卡存进合约标价（DAI）；买家付款时，同一笔交易里卡给买家、DAI 给卖家，要么全部成功，要么全部失败。
///         买家也可以存 DAI 挂「求购任意一张」，任何持有人送一张卡进来就成交。
///         手续费为成交价的 3%，由买家在成交价之外另付，全部用 DAI 结算；卖家拿到完整标价。
///         挂单方随时可以撤单；到期没成交的，任何人都可以触发退回（卡或 DAI 只会退给挂单方本人）。
///         合约没有管理员、不能升级、没有暂停开关，任何人（包括部署者）都动不了别人挂单里的卡和 DAI。
contract AwakeNftEscrow {
    address public immutable NFT;
    address public immutable DAI;
    /// 手续费收款地址（部署时写死，之后不能改）
    address public immutable feeRecipient;

    /// 手续费 3%：买家按成交价另付，卖家拿到完整成交价
    uint256 public constant FEE_BPS = 300;
    uint256 public constant MIN_DURATION = 10 minutes;
    uint256 public constant MAX_DURATION = 30 days;

    struct Order {
        address maker;
        bool sell; // true：卖家存卡换 DAI；false：买家存 DAI 求购任意一张卡
        bool open;
        uint64 expiry;
        uint256 tokenId; // 卖单：存进来的卡；求购单：成交前为 0，成交后记成交的卡
        uint256 price; // 成交价（DAI），不含手续费
    }

    Order[] private _orders;
    uint256 private _lock = 1;

    event Created(uint256 indexed id, address indexed maker, bool sell, uint256 tokenId, uint256 price, uint64 expiry);
    event Filled(uint256 indexed id, address indexed taker, uint256 tokenId, uint256 price, uint256 fee);
    event Closed(uint256 indexed id, address indexed maker, bool expired);

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address nft, address dai, address feeRecipient_) {
        require(nft != address(0) && dai != address(0) && feeRecipient_ != address(0), "ZERO_ADDRESS");
        require(nft != dai, "SAME_TOKEN");
        NFT = nft;
        DAI = dai;
        feeRecipient = feeRecipient_;
    }

    /// @notice 成交价对应的手续费（买家另付）
    function feeOf(uint256 price) public pure returns (uint256) {
        return (price * FEE_BPS) / 10_000;
    }

    // ---------------- 挂单 ----------------

    /// @notice 卖家挂单：把 tokenId 这张卡存进合约，标价 price 个 DAI
    /// @param duration 多少秒后过期（10 分钟到 30 天）
    function list(uint256 tokenId, uint256 price, uint64 duration) external nonReentrant returns (uint256 id) {
        require(price > 0, "ZERO_PRICE");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "BAD_DURATION");
        _pullNft(msg.sender, tokenId);
        id = _orders.length;
        uint64 expiry = uint64(block.timestamp) + duration;
        _orders.push(Order(msg.sender, true, true, expiry, tokenId, price));
        emit Created(id, msg.sender, true, tokenId, price, expiry);
    }

    /// @notice 求购任意一张：存入 price + 手续费 的 DAI，任何持有人送一张卡进来即成交
    function bid(uint256 price, uint64 duration) external nonReentrant returns (uint256 id) {
        require(price > 0, "ZERO_PRICE");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "BAD_DURATION");
        _pullExact(msg.sender, address(this), price + feeOf(price));
        id = _orders.length;
        uint64 expiry = uint64(block.timestamp) + duration;
        _orders.push(Order(msg.sender, false, true, expiry, 0, price));
        emit Created(id, msg.sender, false, 0, price, expiry);
    }

    // ---------------- 成交 ----------------

    /// @notice 买下卖单 id 的卡：付 price + 手续费 的 DAI，卡直接到自己钱包
    /// @param maxPay 最多愿意付多少（含手续费），防止和页面看到的价格不一致
    function buy(uint256 id, uint256 maxPay) external nonReentrant {
        Order storage o = _open(id);
        require(o.sell, "NOT_SELL_ORDER");
        require(o.maker != msg.sender, "OWN_ORDER");
        uint256 fee = feeOf(o.price);
        require(o.price + fee <= maxPay, "PRICE_CHANGED");
        o.open = false;
        _pullExact(msg.sender, o.maker, o.price);
        if (fee > 0) _pullExact(msg.sender, feeRecipient, fee);
        IERC721(NFT).transferFrom(address(this), msg.sender, o.tokenId);
        emit Filled(id, msg.sender, o.tokenId, o.price, fee);
        emit Closed(id, o.maker, false);
    }

    /// @notice 卖一张卡给求购单 id：卡给求购方，合约里的 DAI 按成交价付给自己、手续费付给收款地址
    /// @param minGet 至少要拿到多少 DAI，防止和页面看到的价格不一致
    function sellTo(uint256 id, uint256 tokenId, uint256 minGet) external nonReentrant {
        Order storage o = _open(id);
        require(!o.sell, "NOT_BID");
        require(o.maker != msg.sender, "OWN_ORDER");
        require(o.price >= minGet, "PRICE_CHANGED");
        o.open = false;
        o.tokenId = tokenId;
        _pullNft(msg.sender, tokenId);
        IERC721(NFT).transferFrom(address(this), o.maker, tokenId);
        uint256 fee = feeOf(o.price);
        _push(msg.sender, o.price);
        if (fee > 0) _push(feeRecipient, fee);
        emit Filled(id, msg.sender, tokenId, o.price, fee);
        emit Closed(id, o.maker, false);
    }

    // ---------------- 撤单 / 过期退回 ----------------

    /// @notice 挂单方随时撤单：卖单退卡，求购单退 DAI（含预存的手续费）
    function cancel(uint256 id) external nonReentrant {
        require(id < _orders.length, "NO_ORDER");
        require(_orders[id].maker == msg.sender, "NOT_MAKER");
        _close(id, false);
    }

    /// @notice 过期没成交的挂单，任何人都可以触发退回，只会退给挂单方本人
    function refundExpired(uint256[] calldata ids) external nonReentrant {
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (id < _orders.length && _orders[id].open && block.timestamp >= _orders[id].expiry) _close(id, true);
        }
    }

    function _close(uint256 id, bool expired) private {
        Order storage o = _orders[id];
        require(o.open, "CLOSED");
        o.open = false;
        if (o.sell) IERC721(NFT).transferFrom(address(this), o.maker, o.tokenId);
        else _push(o.maker, o.price + feeOf(o.price));
        emit Closed(id, o.maker, expired);
    }

    // ---------------- 查询 ----------------

    function ordersCount() external view returns (uint256) {
        return _orders.length;
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        return _orders[id];
    }

    /// @notice 按编号区间读取挂单，前端用来展示订单簿
    function getOrders(uint256 from, uint256 count) external view returns (Order[] memory result) {
        uint256 end = from + count;
        if (end > _orders.length) end = _orders.length;
        if (from >= end) return new Order[](0);
        result = new Order[](end - from);
        for (uint256 i = from; i < end; i++) result[i - from] = _orders[i];
    }

    // ---------------- 转账工具 ----------------

    function _open(uint256 id) private view returns (Order storage o) {
        require(id < _orders.length, "NO_ORDER");
        o = _orders[id];
        require(o.open, "CLOSED");
        require(block.timestamp < o.expiry, "EXPIRED");
    }

    /// 把卡拉进合约并核对确实到了（卡被锁定、没授权或 NFT 合约关闭转账时直接失败）
    function _pullNft(address from, uint256 tokenId) private {
        require(IERC721(NFT).ownerOf(tokenId) == from, "NOT_OWNER");
        IERC721(NFT).transferFrom(from, address(this), tokenId);
        require(IERC721(NFT).ownerOf(tokenId) == address(this), "NFT_NOT_RECEIVED");
    }

    /// 拉取 DAI 并核对到账数量，保证账实一致
    function _pullExact(address from, address to, uint256 amount) private {
        uint256 before = IERC20(DAI).balanceOf(to);
        _call(abi.encodeWithSelector(0x23b872dd, from, to, amount)); // transferFrom
        require(IERC20(DAI).balanceOf(to) - before == amount, "TRANSFER_MISMATCH");
    }

    function _push(address to, uint256 amount) private {
        _call(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
    }

    function _call(bytes memory data) private {
        (bool ok, bytes memory ret) = DAI.call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "TOKEN_TRANSFER_FAILED");
    }
}
