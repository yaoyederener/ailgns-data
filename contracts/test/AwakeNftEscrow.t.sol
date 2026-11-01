// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// AwakeNftEscrow 测试（forge）。运行：见 VERIFY.md「卡牌托管合约」一节
import "forge-std/Test.sol";
import "../AwakeNftEscrow.sol";

/// 测试用 DAI：feeBps > 0 时模拟转账收税
contract MockDai {
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
    function _move(address f, address to, uint256 a) private {
        require(balanceOf[f] >= a, "BALANCE");
        balanceOf[f] -= a;
        balanceOf[to] += a - (a * feeBps) / 10_000;
    }
}

/// 测试用 NFT：模拟官方合约的 transferEnabled 总开关和「装配锁定」
contract MockNft {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => bool) public locked;
    bool public transferEnabled = true;
    function mint(address to, uint256 id) external { ownerOf[id] = to; }
    function setTransferEnabled(bool b) external { transferEnabled = b; }
    function lock(uint256 id, bool b) external { locked[id] = b; }
    function approve(address to, uint256 id) external { require(ownerOf[id] == msg.sender); getApproved[id] = to; }
    function setApprovalForAll(address op, bool b) external { isApprovedForAll[msg.sender][op] = b; }
    function transferFrom(address f, address to, uint256 id) external {
        require(transferEnabled, "NFT: transfers closed");
        require(!locked[id], "NFT: mounted, transfer locked");
        require(ownerOf[id] == f, "ERC721: not owner");
        require(msg.sender == f || getApproved[id] == msg.sender || isApprovedForAll[f][msg.sender], "ERC721: not approved");
        ownerOf[id] = to;
        getApproved[id] = address(0);
    }
}

/// 收到 DAI 时尝试重入托管合约
contract ReentrantDai is MockDai {
    AwakeNftEscrow public esc;
    constructor() MockDai(0) {}
    function setEscrow(AwakeNftEscrow e) external { esc = e; }
    function transfer(address to, uint256 a) external override returns (bool) {
        if (address(esc) != address(0)) { uint256[] memory ids = new uint256[](1); esc.refundExpired(ids); }
        _move2(msg.sender, to, a);
        return true;
    }
    function _move2(address f, address to, uint256 a) private { balanceOf[f] -= a; balanceOf[to] += a; }
}

contract AwakeNftEscrowTest is Test {
    uint256 constant E = 1e18;
    MockDai dai;
    MockNft nft;
    AwakeNftEscrow esc;
    address A = address(0xA1);
    address B = address(0xB2);
    address C = address(0xC3);
    address FEE = address(0xFEE);

    function setUp() public {
        dai = new MockDai(0);
        nft = new MockNft();
        esc = new AwakeNftEscrow(address(nft), address(dai), FEE);
        for (uint256 i = 1; i <= 3; i++) nft.mint(A, i);
        nft.mint(C, 9);
        address[3] memory who = [A, B, C];
        for (uint256 i = 0; i < 3; i++) {
            dai.mint(who[i], 100_000 * E);
            vm.startPrank(who[i]);
            dai.approve(address(esc), type(uint256).max);
            nft.setApprovalForAll(address(esc), true);
            vm.stopPrank();
        }
    }

    function _list(address who, uint256 id, uint256 price) internal returns (uint256) {
        vm.prank(who);
        return esc.list(id, price, 1 days);
    }

    // ---------- 构造 ----------
    function test_constructor_rejects_bad_args() public {
        vm.expectRevert(bytes("ZERO_ADDRESS"));
        new AwakeNftEscrow(address(0), address(dai), FEE);
        vm.expectRevert(bytes("SAME_TOKEN"));
        new AwakeNftEscrow(address(dai), address(dai), FEE);
        assertEq(esc.FEE_BPS(), 300);
        assertEq(esc.feeOf(1000 * E), 30 * E);
    }

    // ---------- 卖单 ----------
    function test_list_moves_card_into_escrow() public {
        uint256 id = _list(A, 1, 1000 * E);
        assertEq(id, 0);
        assertEq(nft.ownerOf(1), address(esc));
        AwakeNftEscrow.Order memory o = esc.getOrder(0);
        assertEq(o.maker, A); assertTrue(o.sell); assertTrue(o.open); assertEq(o.tokenId, 1); assertEq(o.price, 1000 * E);
        assertEq(o.expiry, block.timestamp + 1 days);
    }

    function test_list_rejects_not_owner_zero_price_bad_duration() public {
        vm.prank(B); vm.expectRevert(bytes("NOT_OWNER")); esc.list(1, 1000 * E, 1 days);
        vm.prank(A); vm.expectRevert(bytes("ZERO_PRICE")); esc.list(1, 0, 1 days);
        vm.prank(A); vm.expectRevert(bytes("BAD_DURATION")); esc.list(1, 1, 9 minutes);
        vm.prank(A); vm.expectRevert(bytes("BAD_DURATION")); esc.list(1, 1, 31 days);
    }

    function test_list_fails_when_card_locked_or_transfers_closed() public {
        nft.lock(1, true);
        vm.prank(A); vm.expectRevert(bytes("NFT: mounted, transfer locked")); esc.list(1, 1000 * E, 1 days);
        nft.lock(1, false);
        nft.setTransferEnabled(false);
        vm.prank(A); vm.expectRevert(bytes("NFT: transfers closed")); esc.list(1, 1000 * E, 1 days);
    }

    function test_buy_pays_seller_full_price_and_fee_on_top() public {
        uint256 id = _list(A, 1, 1000 * E);
        uint256 a0 = dai.balanceOf(A); uint256 b0 = dai.balanceOf(B);
        vm.prank(B); esc.buy(id, 1030 * E);
        assertEq(nft.ownerOf(1), B);
        assertEq(dai.balanceOf(A) - a0, 1000 * E, "seller gets full price");
        assertEq(b0 - dai.balanceOf(B), 1030 * E, "buyer pays price + 3%");
        assertEq(dai.balanceOf(FEE), 30 * E, "fee to recipient");
        assertFalse(esc.getOrder(id).open);
    }

    function test_buy_rejects_bad_cases() public {
        uint256 id = _list(A, 1, 1000 * E);
        vm.prank(B); vm.expectRevert(bytes("PRICE_CHANGED")); esc.buy(id, 1029 * E);
        vm.prank(A); vm.expectRevert(bytes("OWN_ORDER")); esc.buy(id, 1030 * E);
        vm.prank(B); vm.expectRevert(bytes("NO_ORDER")); esc.buy(5, 1030 * E);
        vm.prank(B); esc.buy(id, 1030 * E);
        vm.prank(C); vm.expectRevert(bytes("CLOSED")); esc.buy(id, 1030 * E);
    }

    function test_buy_fails_atomically_when_buyer_cannot_pay() public {
        uint256 id = _list(A, 1, 1000 * E);
        address poor = address(0xD4);
        vm.startPrank(poor); dai.approve(address(esc), type(uint256).max);
        vm.expectRevert(bytes("TOKEN_TRANSFER_FAILED")); esc.buy(id, 1030 * E); // DAI 转账失败，整笔回滚
        vm.stopPrank();
        assertEq(nft.ownerOf(1), address(esc)); assertTrue(esc.getOrder(id).open);
    }

    function test_buy_fails_atomically_when_transfers_closed() public {
        uint256 id = _list(A, 1, 1000 * E);
        nft.setTransferEnabled(false);
        uint256 b0 = dai.balanceOf(B);
        vm.prank(B); vm.expectRevert(bytes("NFT: transfers closed")); esc.buy(id, 1030 * E);
        assertEq(dai.balanceOf(B), b0); assertTrue(esc.getOrder(id).open);
    }

    function test_expired_sell_cannot_be_bought_and_anyone_can_refund() public {
        uint256 id = _list(A, 1, 1000 * E);
        vm.warp(block.timestamp + 1 days);
        vm.prank(B); vm.expectRevert(bytes("EXPIRED")); esc.buy(id, 1030 * E);
        uint256[] memory ids = new uint256[](2); ids[0] = id; ids[1] = 42;
        vm.prank(C); esc.refundExpired(ids);
        assertEq(nft.ownerOf(1), A, "card back to seller"); assertFalse(esc.getOrder(id).open);
        vm.prank(C); esc.refundExpired(ids); // 再退一次没有影响
    }

    function test_refund_does_nothing_before_expiry() public {
        uint256 id = _list(A, 1, 1000 * E);
        uint256[] memory ids = new uint256[](1); ids[0] = id;
        esc.refundExpired(ids);
        assertTrue(esc.getOrder(id).open); assertEq(nft.ownerOf(1), address(esc));
    }

    function test_cancel_sell_only_maker() public {
        uint256 id = _list(A, 1, 1000 * E);
        vm.prank(B); vm.expectRevert(bytes("NOT_MAKER")); esc.cancel(id);
        vm.prank(A); esc.cancel(id);
        assertEq(nft.ownerOf(1), A);
        vm.prank(A); vm.expectRevert(bytes("CLOSED")); esc.cancel(id);
        vm.prank(B); vm.expectRevert(bytes("CLOSED")); esc.buy(id, 1030 * E);
    }

    // ---------- 求购单 ----------
    function test_bid_escrows_price_plus_fee() public {
        uint256 b0 = dai.balanceOf(B);
        vm.prank(B); uint256 id = esc.bid(500 * E, 1 days);
        assertEq(b0 - dai.balanceOf(B), 515 * E);
        assertEq(dai.balanceOf(address(esc)), 515 * E);
        AwakeNftEscrow.Order memory o = esc.getOrder(id);
        assertEq(o.maker, B); assertFalse(o.sell); assertEq(o.tokenId, 0); assertEq(o.price, 500 * E);
    }

    function test_sellTo_any_card_fills_bid() public {
        vm.prank(B); uint256 id = esc.bid(500 * E, 1 days);
        uint256 c0 = dai.balanceOf(C);
        vm.prank(C); esc.sellTo(id, 9, 500 * E);
        assertEq(nft.ownerOf(9), B, "card to bidder");
        assertEq(dai.balanceOf(C) - c0, 500 * E, "seller gets full price");
        assertEq(dai.balanceOf(FEE), 15 * E);
        assertEq(dai.balanceOf(address(esc)), 0, "nothing left in escrow");
        assertEq(esc.getOrder(id).tokenId, 9); assertFalse(esc.getOrder(id).open);
    }

    function test_sellTo_rejects_bad_cases() public {
        vm.prank(B); uint256 id = esc.bid(500 * E, 1 days);
        vm.prank(C); vm.expectRevert(bytes("PRICE_CHANGED")); esc.sellTo(id, 9, 501 * E);
        vm.prank(A); vm.expectRevert(bytes("NOT_OWNER")); esc.sellTo(id, 9, 500 * E); // 不是自己的卡
        vm.prank(B); vm.expectRevert(bytes("OWN_ORDER")); esc.sellTo(id, 9, 500 * E);
        uint256 sid = _list(A, 1, 1000 * E);
        vm.prank(C); vm.expectRevert(bytes("NOT_BID")); esc.sellTo(sid, 9, 1);
        vm.prank(C); vm.expectRevert(bytes("NOT_SELL_ORDER")); esc.buy(id, 1e30);
        nft.lock(9, true);
        vm.prank(C); vm.expectRevert(bytes("NFT: mounted, transfer locked")); esc.sellTo(id, 9, 500 * E);
    }

    function test_bid_cancel_and_expire_refund_price_plus_fee() public {
        vm.prank(B); uint256 id = esc.bid(500 * E, 1 days);
        uint256 b1 = dai.balanceOf(B);
        vm.prank(B); esc.cancel(id);
        assertEq(dai.balanceOf(B) - b1, 515 * E);
        vm.prank(B); uint256 id2 = esc.bid(500 * E, 1 days);
        uint256 b2 = dai.balanceOf(B);
        vm.warp(block.timestamp + 2 days);
        vm.prank(C); vm.expectRevert(bytes("EXPIRED")); esc.sellTo(id2, 9, 500 * E);
        uint256[] memory ids = new uint256[](1); ids[0] = id2;
        vm.prank(C); esc.refundExpired(ids);
        assertEq(dai.balanceOf(B) - b2, 515 * E); assertEq(dai.balanceOf(address(esc)), 0);
    }

    // ---------- 账实一致 / 重入 ----------
    function test_taxed_dai_rejected() public {
        MockDai taxed = new MockDai(100);
        AwakeNftEscrow e2 = new AwakeNftEscrow(address(nft), address(taxed), FEE);
        taxed.mint(B, 10_000 * E);
        vm.startPrank(B); taxed.approve(address(e2), type(uint256).max);
        vm.expectRevert(bytes("TRANSFER_MISMATCH")); e2.bid(500 * E, 1 days);
        vm.stopPrank();
    }

    function test_reentrancy_blocked() public {
        ReentrantDai r = new ReentrantDai();
        AwakeNftEscrow e2 = new AwakeNftEscrow(address(nft), address(r), FEE);
        r.mint(B, 10_000 * E);
        vm.startPrank(B); r.approve(address(e2), type(uint256).max);
        uint256 id = e2.bid(500 * E, 1 days);
        vm.stopPrank();
        r.setEscrow(e2);
        vm.prank(B); vm.expectRevert(bytes("TOKEN_TRANSFER_FAILED")); e2.cancel(id); // 退款时 DAI 合约试图重入，被 REENTRANT 挡住，整笔失败
    }

    function test_getOrders_range() public {
        _list(A, 1, 1 * E); _list(A, 2, 2 * E); _list(A, 3, 3 * E);
        assertEq(esc.ordersCount(), 3);
        AwakeNftEscrow.Order[] memory l = esc.getOrders(1, 10);
        assertEq(l.length, 2); assertEq(l[0].tokenId, 2); assertEq(l[1].tokenId, 3);
        assertEq(esc.getOrders(5, 2).length, 0);
    }

    function test_escrow_never_keeps_dai_after_fills() public {
        uint256 s = _list(A, 1, 1000 * E);
        vm.prank(B); uint256 b = esc.bid(700 * E, 1 days);
        vm.prank(C); esc.buy(s, 1030 * E);
        vm.prank(C); esc.sellTo(b, 9, 700 * E);
        assertEq(dai.balanceOf(address(esc)), 0);
        assertEq(dai.balanceOf(FEE), 30 * E + 21 * E);
    }
}
