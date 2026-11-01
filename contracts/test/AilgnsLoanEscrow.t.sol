// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// AilgnsLoanEscrow 测试（forge）。运行方式见 VERIFY.md「点对点借款合约」一节
import "forge-std/Test.sol";
import "../AilgnsLoanEscrow.sol";

/// 测试用代币：feeBps > 0 时模拟转账收税
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public feeBps;
    constructor(uint256 f) { feeBps = f; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external virtual returns (bool) { _move(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "ALLOWANCE");
        allowance[f][msg.sender] -= a;
        _move(f, to, a);
        return true;
    }
    function _move(address f, address to, uint256 a) internal {
        require(balanceOf[f] >= a, "BALANCE");
        balanceOf[f] -= a;
        balanceOf[to] += a - (a * feeBps) / 10_000;
    }
}

/// 收到币时尝试重入
contract ReentrantToken is MockToken {
    AilgnsLoanEscrow public esc;
    constructor() MockToken(0) {}
    function setEscrow(AilgnsLoanEscrow e) external { esc = e; }
    function transfer(address to, uint256 a) external override returns (bool) {
        if (address(esc) != address(0)) { uint256[] memory ids = new uint256[](1); esc.refundExpired(ids); }
        _move(msg.sender, to, a);
        return true;
    }
}

contract AilgnsLoanEscrowTest is Test {
    uint256 constant E = 1e18;
    MockToken ail;
    MockToken dai;
    AilgnsLoanEscrow esc;
    address BORROWER = address(0xB0);
    address LENDER = address(0x1E);
    address OTHER = address(0x07);
    address FEE = address(0xFEE);

    function setUp() public {
        ail = new MockToken(0);
        dai = new MockToken(0);
        esc = new AilgnsLoanEscrow(address(ail), address(dai), FEE);
        address[3] memory who = [BORROWER, LENDER, OTHER];
        for (uint256 i = 0; i < 3; i++) {
            ail.mint(who[i], 10 * E);
            dai.mint(who[i], 100_000 * E);
            vm.startPrank(who[i]);
            ail.approve(address(esc), type(uint256).max);
            dai.approve(address(esc), type(uint256).max);
            vm.stopPrank();
        }
    }

    // 标准单：押 1 AiLGNS，借 500，还 520，30 天，挂 7 天
    function _req() internal returns (uint256) {
        vm.prank(BORROWER);
        return esc.request(1 * E, 500 * E, 520 * E, 30 days, 7 days);
    }
    function _fund(uint256 id) internal {
        vm.prank(LENDER);
        esc.fund(id, 505 * E);
    }

    // ---------- 构造 / 常量 ----------
    function test_constructor_and_constants() public {
        vm.expectRevert(bytes("ZERO_ADDRESS")); new AilgnsLoanEscrow(address(0), address(dai), FEE);
        vm.expectRevert(bytes("SAME_TOKEN")); new AilgnsLoanEscrow(address(dai), address(dai), FEE);
        assertEq(esc.FEE_BPS(), 100); assertEq(esc.feeOf(500 * E), 5 * E);
    }

    // ---------- 挂单 ----------
    function test_request_locks_collateral() public {
        uint256 id = _req();
        assertEq(id, 0); assertEq(ail.balanceOf(address(esc)), 1 * E); assertEq(ail.balanceOf(BORROWER), 9 * E);
        AilgnsLoanEscrow.Loan memory l = esc.getLoan(0);
        assertEq(l.borrower, BORROWER); assertEq(l.lender, address(0)); assertEq(l.status, 0);
        assertEq(l.expiry, block.timestamp + 7 days); assertEq(l.term, 30 days); assertEq(l.due, 0);
        assertEq(l.collateral, 1 * E); assertEq(l.principal, 500 * E); assertEq(l.repayAmount, 520 * E);
        assertFalse(l.isOffer);
    }

    // ---------- 出借人挂单 / 借款人接单 ----------
    function _offer() internal returns (uint256) {
        vm.prank(LENDER);
        return esc.offer(1 * E, 500 * E, 520 * E, 30 days, 7 days);
    }

    function test_offer_escrows_principal_plus_fee() public {
        uint256 l0 = dai.balanceOf(LENDER);
        uint256 id = _offer();
        assertEq(l0 - dai.balanceOf(LENDER), 505 * E); assertEq(dai.balanceOf(address(esc)), 505 * E);
        AilgnsLoanEscrow.Loan memory l = esc.getLoan(id);
        assertTrue(l.isOffer); assertEq(l.lender, LENDER); assertEq(l.borrower, address(0)); assertEq(l.status, 0); assertEq(l.collateral, 1 * E);
    }

    function test_offer_rejects_bad_params() public {
        vm.startPrank(LENDER);
        vm.expectRevert(bytes("REPAY_LT_PRINCIPAL")); esc.offer(1 * E, 500 * E, 499 * E, 30 days, 7 days);
        vm.expectRevert(bytes("BAD_TERM")); esc.offer(1 * E, 500 * E, 520 * E, 1 hours, 7 days);
        vm.expectRevert(bytes("ZERO_AMOUNT")); esc.offer(0, 500 * E, 520 * E, 30 days, 7 days);
        vm.stopPrank();
    }

    function test_take_locks_collateral_pays_borrower_and_fee() public {
        uint256 id = _offer();
        uint256 b0 = dai.balanceOf(BORROWER);
        vm.prank(BORROWER); esc.take(id);
        assertEq(dai.balanceOf(BORROWER) - b0, 500 * E, "borrower gets principal from escrow");
        assertEq(dai.balanceOf(FEE), 5 * E); assertEq(dai.balanceOf(address(esc)), 0, "no DAI left in escrow");
        assertEq(ail.balanceOf(address(esc)), 1 * E, "collateral locked");
        AilgnsLoanEscrow.Loan memory l = esc.getLoan(id);
        assertEq(l.status, 1); assertEq(l.borrower, BORROWER); assertEq(l.due, block.timestamp + 30 days);
    }

    function test_take_rejects_bad_cases() public {
        uint256 id = _offer();
        vm.prank(LENDER); vm.expectRevert(bytes("OWN_LOAN")); esc.take(id);
        uint256 rid = _req();
        vm.prank(LENDER); vm.expectRevert(bytes("NOT_OFFER")); esc.take(rid);
        vm.prank(BORROWER); vm.expectRevert(bytes("NOT_REQUEST")); esc.fund(id, 505 * E);
        vm.warp(block.timestamp + 7 days);
        vm.prank(BORROWER); vm.expectRevert(bytes("EXPIRED")); esc.take(id);
    }

    function test_take_atomic_when_borrower_has_no_collateral() public {
        uint256 id = _offer();
        address poor = address(0xD5);
        vm.startPrank(poor); ail.approve(address(esc), type(uint256).max);
        vm.expectRevert(bytes("TOKEN_TRANSFER_FAILED")); esc.take(id);
        vm.stopPrank();
        assertEq(esc.getLoan(id).status, 0); assertEq(dai.balanceOf(address(esc)), 505 * E);
    }

    function test_taken_offer_repay_and_default_work() public {
        uint256 id = _offer();
        vm.prank(BORROWER); esc.take(id);
        uint256 l0 = dai.balanceOf(LENDER);
        vm.prank(BORROWER); esc.repay(id);
        assertEq(dai.balanceOf(LENDER) - l0, 520 * E); assertEq(ail.balanceOf(BORROWER), 10 * E);
        uint256 id2 = _offer();
        vm.prank(BORROWER); esc.take(id2);
        vm.warp(block.timestamp + 30 days);
        vm.prank(OTHER); esc.claim(id2);
        assertEq(ail.balanceOf(LENDER), 11 * E); assertEq(esc.getLoan(id2).status, 3);
    }

    function test_offer_cancel_and_expire_refund_dai_to_lender() public {
        uint256 id = _offer();
        vm.prank(BORROWER); vm.expectRevert(bytes("NOT_MAKER")); esc.cancel(id);
        uint256 l1 = dai.balanceOf(LENDER);
        vm.prank(LENDER); esc.cancel(id);
        assertEq(dai.balanceOf(LENDER) - l1, 505 * E); assertEq(esc.getLoan(id).status, 4);
        uint256 id2 = _offer();
        uint256 l2 = dai.balanceOf(LENDER);
        vm.warp(block.timestamp + 7 days);
        uint256[] memory ids = new uint256[](1); ids[0] = id2;
        vm.prank(OTHER); esc.refundExpired(ids);
        assertEq(dai.balanceOf(LENDER) - l2, 505 * E); assertEq(dai.balanceOf(address(esc)), 0);
    }

    function test_request_rejects_bad_params() public {
        vm.startPrank(BORROWER);
        vm.expectRevert(bytes("ZERO_AMOUNT")); esc.request(0, 500 * E, 520 * E, 30 days, 7 days);
        vm.expectRevert(bytes("ZERO_AMOUNT")); esc.request(1 * E, 0, 0, 30 days, 7 days);
        vm.expectRevert(bytes("REPAY_LT_PRINCIPAL")); esc.request(1 * E, 500 * E, 499 * E, 30 days, 7 days);
        vm.expectRevert(bytes("BAD_TERM")); esc.request(1 * E, 500 * E, 520 * E, 23 hours, 7 days);
        vm.expectRevert(bytes("BAD_TERM")); esc.request(1 * E, 500 * E, 520 * E, 91 days, 7 days);
        vm.expectRevert(bytes("BAD_DURATION")); esc.request(1 * E, 500 * E, 520 * E, 30 days, 9 minutes);
        vm.expectRevert(bytes("BAD_DURATION")); esc.request(1 * E, 500 * E, 520 * E, 30 days, 31 days);
        esc.request(1 * E, 50_000 * E, 50_000 * E, 1 days, 10 minutes); // 边界值都允许：大额本金、0 利息、最短期限
        vm.stopPrank();
    }

    // ---------- 接单 ----------
    function test_fund_pays_borrower_and_fee_starts_clock() public {
        uint256 id = _req();
        uint256 b0 = dai.balanceOf(BORROWER); uint256 l0 = dai.balanceOf(LENDER);
        _fund(id);
        assertEq(dai.balanceOf(BORROWER) - b0, 500 * E, "borrower gets full principal");
        assertEq(l0 - dai.balanceOf(LENDER), 505 * E, "lender pays principal + 1%");
        assertEq(dai.balanceOf(FEE), 5 * E);
        assertEq(ail.balanceOf(address(esc)), 1 * E, "collateral stays locked");
        AilgnsLoanEscrow.Loan memory l = esc.getLoan(id);
        assertEq(l.status, 1); assertEq(l.lender, LENDER); assertEq(l.due, block.timestamp + 30 days);
    }

    function test_fund_rejects_bad_cases() public {
        uint256 id = _req();
        vm.prank(LENDER); vm.expectRevert(bytes("PRICE_CHANGED")); esc.fund(id, 504 * E);
        vm.prank(BORROWER); vm.expectRevert(bytes("OWN_LOAN")); esc.fund(id, 505 * E);
        vm.prank(LENDER); vm.expectRevert(bytes("NO_LOAN")); esc.fund(9, 505 * E);
        _fund(id);
        vm.prank(OTHER); vm.expectRevert(bytes("NOT_OPEN")); esc.fund(id, 505 * E); // 已被接走
    }

    function test_fund_after_listing_expiry_rejected() public {
        uint256 id = _req();
        vm.warp(block.timestamp + 7 days);
        vm.prank(LENDER); vm.expectRevert(bytes("EXPIRED")); esc.fund(id, 505 * E);
    }

    function test_fund_atomic_when_lender_cannot_pay() public {
        uint256 id = _req();
        address poor = address(0xD4);
        vm.startPrank(poor); dai.approve(address(esc), type(uint256).max);
        vm.expectRevert(bytes("TOKEN_TRANSFER_FAILED")); esc.fund(id, 505 * E);
        vm.stopPrank();
        assertEq(esc.getLoan(id).status, 0); assertEq(esc.getLoan(id).lender, address(0));
    }

    // ---------- 还款 ----------
    function test_repay_returns_collateral_and_pays_lender() public {
        uint256 id = _req(); _fund(id);
        vm.warp(block.timestamp + 10 days);
        uint256 l0 = dai.balanceOf(LENDER);
        vm.prank(BORROWER); esc.repay(id);
        assertEq(dai.balanceOf(LENDER) - l0, 520 * E, "lender gets repay amount");
        assertEq(ail.balanceOf(BORROWER), 10 * E, "collateral back");
        assertEq(ail.balanceOf(address(esc)), 0);
        assertEq(esc.getLoan(id).status, 2);
        vm.prank(BORROWER); vm.expectRevert(bytes("NOT_ACTIVE")); esc.repay(id);
    }

    function test_anyone_can_repay_collateral_goes_to_borrower() public {
        uint256 id = _req(); _fund(id);
        vm.prank(OTHER); esc.repay(id);
        assertEq(ail.balanceOf(BORROWER), 10 * E); assertEq(ail.balanceOf(OTHER), 10 * E);
    }

    function test_repay_still_allowed_after_due_until_claimed() public {
        uint256 id = _req(); _fund(id);
        vm.warp(block.timestamp + 31 days);
        vm.prank(BORROWER); esc.repay(id); // 出借人还没领抵押品，照样能还
        assertEq(esc.getLoan(id).status, 2); assertEq(ail.balanceOf(BORROWER), 10 * E);
        vm.prank(LENDER); vm.expectRevert(bytes("NOT_ACTIVE")); esc.claim(id);
    }

    function test_repay_rejects_open_loan() public {
        uint256 id = _req();
        vm.prank(BORROWER); vm.expectRevert(bytes("NOT_ACTIVE")); esc.repay(id);
    }

    // ---------- 违约 ----------
    function test_claim_only_after_due_collateral_to_lender() public {
        uint256 id = _req(); _fund(id);
        vm.warp(block.timestamp + 30 days - 1);
        vm.prank(LENDER); vm.expectRevert(bytes("NOT_DUE")); esc.claim(id);
        vm.warp(block.timestamp + 1);
        vm.prank(OTHER); esc.claim(id); // 任何人都能触发，但币只给出借人
        assertEq(ail.balanceOf(LENDER), 11 * E); assertEq(esc.getLoan(id).status, 3);
        vm.prank(BORROWER); vm.expectRevert(bytes("NOT_ACTIVE")); esc.repay(id);
        vm.prank(LENDER); vm.expectRevert(bytes("NOT_ACTIVE")); esc.claim(id);
    }

    // ---------- 撤单 / 挂单过期 ----------
    function test_cancel_only_borrower_only_open() public {
        uint256 id = _req();
        vm.prank(LENDER); vm.expectRevert(bytes("NOT_MAKER")); esc.cancel(id);
        vm.prank(BORROWER); esc.cancel(id);
        assertEq(ail.balanceOf(BORROWER), 10 * E); assertEq(esc.getLoan(id).status, 4);
        vm.prank(BORROWER); vm.expectRevert(bytes("NOT_OPEN")); esc.cancel(id);
        vm.prank(LENDER); vm.expectRevert(bytes("NOT_OPEN")); esc.fund(id, 505 * E);
        uint256 id2 = _req(); _fund(id2);
        vm.prank(BORROWER); vm.expectRevert(bytes("NOT_OPEN")); esc.cancel(id2); // 已被接单不能撤
    }

    function test_refundExpired_only_open_and_expired() public {
        uint256 a = _req();
        uint256 b = _req(); _fund(b);
        uint256[] memory ids = new uint256[](3); ids[0] = a; ids[1] = b; ids[2] = 77;
        esc.refundExpired(ids);
        assertEq(esc.getLoan(a).status, 0, "not expired yet");
        vm.warp(block.timestamp + 7 days);
        vm.prank(OTHER); esc.refundExpired(ids);
        assertEq(esc.getLoan(a).status, 4); assertEq(ail.balanceOf(BORROWER), 9 * E, "a refunded; b still locked");
        assertEq(esc.getLoan(b).status, 1, "active loan untouched");
        esc.refundExpired(ids); // 再来一次没有影响
    }

    // ---------- 账实一致 / 重入 / 查询 ----------
    function test_taxed_collateral_rejected() public {
        MockToken taxed = new MockToken(100);
        AilgnsLoanEscrow e2 = new AilgnsLoanEscrow(address(taxed), address(dai), FEE);
        taxed.mint(BORROWER, 10 * E);
        vm.startPrank(BORROWER); taxed.approve(address(e2), type(uint256).max);
        vm.expectRevert(bytes("TRANSFER_MISMATCH")); e2.request(1 * E, 500 * E, 520 * E, 30 days, 7 days);
        vm.stopPrank();
    }

    function test_reentrancy_blocked() public {
        ReentrantToken r = new ReentrantToken();
        AilgnsLoanEscrow e2 = new AilgnsLoanEscrow(address(r), address(dai), FEE);
        r.mint(BORROWER, 10 * E);
        vm.startPrank(BORROWER); r.approve(address(e2), type(uint256).max);
        uint256 id = e2.request(1 * E, 500 * E, 520 * E, 30 days, 7 days);
        vm.stopPrank();
        r.setEscrow(e2);
        vm.prank(BORROWER); vm.expectRevert(bytes("TOKEN_TRANSFER_FAILED")); e2.cancel(id); // 退抵押币时代币试图重入，被 REENTRANT 挡住
    }

    function test_getLoans_range() public {
        _req(); _req(); _req();
        assertEq(esc.loansCount(), 3);
        assertEq(esc.getLoans(1, 10).length, 2);
        assertEq(esc.getLoans(5, 2).length, 0);
    }

    function test_escrow_holds_only_active_collateral() public {
        uint256 a = _req(); _fund(a);
        uint256 b = _req(); _fund(b);
        vm.prank(BORROWER); esc.repay(a);
        assertEq(ail.balanceOf(address(esc)), 1 * E);
        assertEq(dai.balanceOf(address(esc)), 0, "escrow never holds DAI");
        assertEq(dai.balanceOf(FEE), 10 * E);
    }
}
