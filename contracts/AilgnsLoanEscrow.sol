// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

/// @title AiLGNS 点对点抵押借款合约
/// @notice 借款人把抵押币存进合约挂单：借多少 DAI、到期还多少、借多少天，全由借款人自己填。
///         出借人接单时，同一笔交易里：本金 DAI 直接到借款人钱包，手续费（本金的 1%）到手续费地址，抵押币继续锁在合约里，开始计时。
///         到期前还上约定金额：DAI 给出借人，抵押币退回借款人。到期没还：任何人都可以触发把抵押币划给出借人。
///         合约不看价格、不清算、不算利率；没有管理员、不能升级、没有暂停开关，任何人（包括部署者）都动不了别人的抵押币。
contract AilgnsLoanEscrow {
    address public immutable COLLATERAL; // 抵押币
    address public immutable DAI;
    /// 手续费收款地址（部署时写死，之后不能改）
    address public immutable feeRecipient;

    /// 手续费：借款本金的 1%，出借人接单时另付
    uint256 public constant FEE_BPS = 100;
    /// 单笔借款本金上限（DAI，18 位）：运行一段时间再决定放不放开
    uint256 public constant MAX_PRINCIPAL = 2000e18;
    uint256 public constant MIN_LIST = 10 minutes;
    uint256 public constant MAX_LIST = 30 days;
    uint256 public constant MIN_TERM = 1 days;
    uint256 public constant MAX_TERM = 90 days;

    // 状态：0 挂单中（等人接单）；1 借款中；2 已还清；3 已违约（抵押币归出借人）；4 已撤单 / 挂单到期退回
    uint8 public constant OPEN = 0;
    uint8 public constant ACTIVE = 1;
    uint8 public constant REPAID = 2;
    uint8 public constant DEFAULTED = 3;
    uint8 public constant CANCELLED = 4;

    struct Loan {
        address borrower;
        address lender; // 接单前为 0
        uint8 status;
        uint64 expiry; // 挂单有效期：到期没人接单就退回抵押币
        uint64 term; // 借多少秒
        uint64 due; // 接单后的还款截止时间（接单前为 0）
        uint256 collateral; // 抵押币数量
        uint256 principal; // 借款本金（DAI）
        uint256 repayAmount; // 到期应还（DAI，含利息，借款人自己填）
    }

    Loan[] private _loans;
    uint256 private _lock = 1;

    event Requested(uint256 indexed id, address indexed borrower, uint256 collateral, uint256 principal, uint256 repayAmount, uint64 term, uint64 expiry);
    event Funded(uint256 indexed id, address indexed lender, uint256 principal, uint256 fee, uint64 due);
    event Repaid(uint256 indexed id, address indexed payer, uint256 amount);
    event Defaulted(uint256 indexed id, address indexed lender, uint256 collateral);
    event Closed(uint256 indexed id, address indexed borrower, bool expired);

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address collateral, address dai, address feeRecipient_) {
        require(collateral != address(0) && dai != address(0) && feeRecipient_ != address(0), "ZERO_ADDRESS");
        require(collateral != dai, "SAME_TOKEN");
        COLLATERAL = collateral;
        DAI = dai;
        feeRecipient = feeRecipient_;
    }

    /// @notice 本金对应的手续费（出借人另付）
    function feeOf(uint256 principal) public pure returns (uint256) {
        return (principal * FEE_BPS) / 10_000;
    }

    // ---------------- 借款人挂单 ----------------

    /// @param collateral 抵押多少币
    /// @param principal 借多少 DAI
    /// @param repayAmount 到期还多少 DAI（不能少于本金）
    /// @param term 借多少秒（1 天到 90 天）
    /// @param listDuration 挂单多少秒没人接就退回（10 分钟到 30 天）
    function request(uint256 collateral, uint256 principal, uint256 repayAmount, uint64 term, uint64 listDuration) external nonReentrant returns (uint256 id) {
        require(collateral > 0 && principal > 0, "ZERO_AMOUNT");
        require(principal <= MAX_PRINCIPAL, "OVER_MAX");
        require(repayAmount >= principal, "REPAY_LT_PRINCIPAL");
        require(term >= MIN_TERM && term <= MAX_TERM, "BAD_TERM");
        require(listDuration >= MIN_LIST && listDuration <= MAX_LIST, "BAD_DURATION");
        _pullExact(COLLATERAL, msg.sender, address(this), collateral);
        id = _loans.length;
        uint64 expiry = uint64(block.timestamp) + listDuration;
        _loans.push(Loan(msg.sender, address(0), OPEN, expiry, term, 0, collateral, principal, repayAmount));
        emit Requested(id, msg.sender, collateral, principal, repayAmount, term, expiry);
    }

    // ---------------- 出借人接单 ----------------

    /// @notice 接单：付本金给借款人、手续费给收款地址，开始计时
    /// @param maxPay 最多愿意付多少（本金 + 手续费），防止和页面看到的不一致
    function fund(uint256 id, uint256 maxPay) external nonReentrant {
        Loan storage l = _get(id);
        require(l.status == OPEN, "NOT_OPEN");
        require(block.timestamp < l.expiry, "EXPIRED");
        require(l.borrower != msg.sender, "OWN_LOAN");
        uint256 fee = feeOf(l.principal);
        require(l.principal + fee <= maxPay, "PRICE_CHANGED");
        l.status = ACTIVE;
        l.lender = msg.sender;
        l.due = uint64(block.timestamp) + l.term;
        _pullExact(DAI, msg.sender, l.borrower, l.principal);
        if (fee > 0) _pullExact(DAI, msg.sender, feeRecipient, fee);
        emit Funded(id, msg.sender, l.principal, fee, l.due);
    }

    // ---------------- 还款 / 违约 ----------------

    /// @notice 还款：任何人都可以替借款人还（钱给出借人），抵押币只会退给借款人本人。到期后、出借人还没领走抵押币之前照样可以还。
    function repay(uint256 id) external nonReentrant {
        Loan storage l = _get(id);
        require(l.status == ACTIVE, "NOT_ACTIVE");
        l.status = REPAID;
        _pullExact(DAI, msg.sender, l.lender, l.repayAmount);
        _push(COLLATERAL, l.borrower, l.collateral);
        emit Repaid(id, msg.sender, l.repayAmount);
    }

    /// @notice 到期没还：任何人都可以触发，抵押币只会划给出借人
    function claim(uint256 id) external nonReentrant {
        Loan storage l = _get(id);
        require(l.status == ACTIVE, "NOT_ACTIVE");
        require(block.timestamp >= l.due, "NOT_DUE");
        l.status = DEFAULTED;
        _push(COLLATERAL, l.lender, l.collateral);
        emit Defaulted(id, l.lender, l.collateral);
    }

    // ---------------- 撤单 / 挂单到期退回 ----------------

    /// @notice 还没人接单时，借款人随时撤单，抵押币退回
    function cancel(uint256 id) external nonReentrant {
        Loan storage l = _get(id);
        require(l.borrower == msg.sender, "NOT_BORROWER");
        require(l.status == OPEN, "NOT_OPEN");
        _close(id, false);
    }

    /// @notice 挂单到期还没人接的，任何人都可以触发退回，抵押币只会退给借款人本人
    function refundExpired(uint256[] calldata ids) external nonReentrant {
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (id < _loans.length && _loans[id].status == OPEN && block.timestamp >= _loans[id].expiry) _close(id, true);
        }
    }

    function _close(uint256 id, bool expired) private {
        Loan storage l = _loans[id];
        l.status = CANCELLED;
        _push(COLLATERAL, l.borrower, l.collateral);
        emit Closed(id, l.borrower, expired);
    }

    // ---------------- 查询 ----------------

    function loansCount() external view returns (uint256) {
        return _loans.length;
    }

    function getLoan(uint256 id) external view returns (Loan memory) {
        return _loans[id];
    }

    /// @notice 按编号区间读取，前端用来展示
    function getLoans(uint256 from, uint256 count) external view returns (Loan[] memory result) {
        uint256 end = from + count;
        if (end > _loans.length) end = _loans.length;
        if (from >= end) return new Loan[](0);
        result = new Loan[](end - from);
        for (uint256 i = from; i < end; i++) result[i - from] = _loans[i];
    }

    // ---------------- 转账工具 ----------------

    function _get(uint256 id) private view returns (Loan storage l) {
        require(id < _loans.length, "NO_LOAN");
        l = _loans[id];
    }

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
