// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

/// @title .lgns 域名（照 ENS 的 .eth 规则，简化版）
/// @notice 任何人付 DAI 就能注册 xxx.lgns，按年收费、到期续费，价格按名字长度（和 ENS 一样）：
///         3 个字符 640 DAI / 年，4 个字符 160 DAI / 年，5 个及以上 5 DAI / 年。名字可以用小写字母、数字、连字符、常用汉字，3–32 个字符（中文一个字算 1 个字符）。
///         每个名字是一个 NFT（ERC721），可以转让、买卖；主人可以把名字指向任意地址，也可以把它设成自己地址的「主名字」。
///         到期后有 90 天宽限期，只有原主人能续费；宽限期过了任何人都能重新注册。
///         收费地址、价格、规则写死在合约里，没有管理员、不能升级、不能修改，任何人（包括平台）都收不走别人的名字。
///         官方保留名（admin、official 等）在部署时直接注册给官方收款钱包，防止有人冒充。
contract LgnsNames {
    IERC20 public immutable DAI;
    address public immutable PAYEE; // 注册费、续费全部直接打进回购分账合约 0x99f4…2da3
    address public immutable RESERVE; // 官方保留名的主人（收款钱包；分账合约不能管理 NFT，所以保留名不给它）

    uint256 public constant PRICE_3 = 640e18;
    uint256 public constant PRICE_4 = 160e18;
    uint256 public constant PRICE_5 = 5e18;
    uint256 public constant YEAR = 365 days;
    uint256 public constant GRACE = 90 days;
    uint256 public constant MAX_YEARS = 10;

    string public constant name = "LGNS Names";
    string public constant symbol = "LGNSNAME";

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approved;
    mapping(address => mapping(address => bool)) private _operators;

    mapping(uint256 => string) public labelOf; // 名字（不带 .lgns）
    mapping(uint256 => uint256) public expires; // 到期时间
    mapping(uint256 => address) private _addr; // 名字指向的地址
    mapping(address => uint256) private _primary; // 地址的主名字（反向解析）

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event NameRegistered(uint256 indexed id, string label, address indexed owner, uint256 cost, uint256 expires);
    event NameRenewed(uint256 indexed id, string label, uint256 cost, uint256 expires);
    event AddrChanged(uint256 indexed id, address addr);
    event PrimaryChanged(address indexed addr, uint256 indexed id);

    uint256 private _lock = 1;
    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address dai, address payee, address reserve, string[] memory reserved) {
        require(dai != address(0) && payee != address(0) && reserve != address(0), "ZERO_ADDRESS");
        DAI = IERC20(dai);
        PAYEE = payee;
        RESERVE = reserve;
        for (uint256 i = 0; i < reserved.length; i++) {
            require(valid(reserved[i]), "BAD_NAME");
            uint256 id = idOf(reserved[i]);
            require(_owners[id] == address(0), "DUPLICATE");
            labelOf[id] = reserved[i];
            expires[id] = block.timestamp + 100 * YEAR;
            _mint(reserve, id);
            _addr[id] = reserve;
            emit NameRegistered(id, reserved[i], reserve, 0, expires[id]);
        }
    }

    // ---------- 查询 ----------

    function idOf(string memory label) public pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    /// @notice 名字有几个字符（中文一个字算 1 个）；不合规返回 0。
    ///         允许：小写字母 a-z、数字 0-9、连字符 -（不能在开头结尾）、常用汉字（Unicode 4E00–9FFF）
    function length(string memory label) public pure returns (uint256 n) {
        bytes memory b = bytes(label);
        if (b.length == 0 || b.length > 96 || b[0] == "-" || b[b.length - 1] == "-") return 0;
        uint256 i = 0;
        while (i < b.length) {
            uint8 c = uint8(b[i]);
            if ((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x2d) {
                i += 1;
            } else if (c >= 0xe4 && c <= 0xe9 && i + 2 < b.length) {
                uint8 c2 = uint8(b[i + 1]);
                uint8 c3 = uint8(b[i + 2]);
                if (c2 < 0x80 || c2 > 0xbf || c3 < 0x80 || c3 > 0xbf || (c == 0xe4 && c2 < 0xb8)) return 0;
                i += 3;
            } else {
                return 0;
            }
            n += 1;
        }
    }

    /// @notice 名字是否合规：3–32 个字符（和 ENS 一样最少 3 个），只能是 a-z、0-9、-、常用汉字
    function valid(string memory label) public pure returns (bool) {
        uint256 n = length(label);
        return n >= 3 && n <= 32;
    }

    /// @notice 一年的价格（DAI，18 位小数）
    function yearPrice(string memory label) public pure returns (uint256) {
        uint256 n = length(label);
        return n == 3 ? PRICE_3 : n == 4 ? PRICE_4 : PRICE_5;
    }

    function price(string memory label, uint256 years_) public pure returns (uint256) {
        return yearPrice(label) * years_;
    }

    /// @notice 能不能注册：合规，并且从没注册过或者过了宽限期
    function available(string memory label) public view returns (bool) {
        return valid(label) && expires[idOf(label)] + GRACE < block.timestamp;
    }

    /// @notice xxx.lgns 指向哪个地址（过期了返回 0）
    function resolve(string memory label) external view returns (address) {
        uint256 id = idOf(label);
        return expires[id] > block.timestamp ? _addr[id] : address(0);
    }

    function addrOf(uint256 id) external view returns (address) {
        return expires[id] > block.timestamp ? _addr[id] : address(0);
    }

    /// @notice 地址的主名字（反向解析）：名字没过期、而且还指向这个地址才算，否则返回空
    function nameOf(address a) external view returns (string memory) {
        uint256 id = _primary[a];
        if (id == 0 || expires[id] <= block.timestamp || _addr[id] != a) return "";
        return labelOf[id];
    }

    // ---------- 注册、续费 ----------

    /// @notice 注册 label.lgns 给 owner，付 years_ 年的费用（先在 DAI 合约里授权本合约）
    function register(string calldata label, address owner, uint256 years_) external nonReentrant {
        require(owner != address(0), "ZERO_ADDRESS");
        require(years_ >= 1 && years_ <= MAX_YEARS, "BAD_YEARS");
        require(valid(label), "BAD_NAME");
        uint256 id = idOf(label);
        require(expires[id] + GRACE < block.timestamp, "TAKEN");
        uint256 cost = price(label, years_);
        _pay(cost);
        address prev = _owners[id];
        labelOf[id] = label;
        expires[id] = block.timestamp + years_ * YEAR;
        if (prev == address(0)) _mint(owner, id);
        else _move(prev, owner, id); // 过了宽限期的旧名字：从旧主人那里收回给新主人
        _addr[id] = owner;
        emit NameRegistered(id, label, owner, cost, expires[id]);
        emit AddrChanged(id, owner);
    }

    /// @notice 续费：任何人都可以帮任何名字续费；过了宽限期就不能续，只能重新注册
    function renew(string calldata label, uint256 years_) external nonReentrant {
        require(years_ >= 1 && years_ <= MAX_YEARS, "BAD_YEARS");
        uint256 id = idOf(label);
        require(_owners[id] != address(0) && expires[id] + GRACE >= block.timestamp, "NOT_RENEWABLE");
        require(expires[id] + years_ * YEAR <= block.timestamp + (MAX_YEARS + 1) * YEAR, "TOO_LONG");
        uint256 cost = price(label, years_);
        _pay(cost);
        expires[id] += years_ * YEAR;
        emit NameRenewed(id, label, cost, expires[id]);
    }

    // ---------- 主人设置 ----------

    /// @notice 把名字指向某个地址（只有主人能改）
    function setAddr(uint256 id, address a) external {
        require(ownerOf(id) == msg.sender, "NOT_OWNER");
        _addr[id] = a;
        emit AddrChanged(id, a);
    }

    /// @notice 把名字设成「我的主名字」：名字必须指向我自己（任何人都只能设自己的）；id 填 0 表示取消
    function setPrimary(uint256 id) external {
        if (id != 0) require(expires[id] > block.timestamp && _addr[id] == msg.sender, "NOT_YOURS");
        _primary[msg.sender] = id;
        emit PrimaryChanged(msg.sender, id);
    }

    // ---------- ERC721 ----------

    function supportsInterface(bytes4 i) external pure returns (bool) {
        return i == 0x01ffc9a7 || i == 0x80ac58cd || i == 0x5b5e139f; // ERC165、ERC721、ERC721Metadata
    }

    function balanceOf(address a) external view returns (uint256) {
        require(a != address(0), "ZERO_ADDRESS");
        return _balances[a];
    }

    /// @notice 过期了就不再属于任何人（宽限期里只能续费、不能转让）
    function ownerOf(uint256 id) public view returns (address) {
        address o = _owners[id];
        require(o != address(0) && expires[id] > block.timestamp, "EXPIRED_OR_NONE");
        return o;
    }

    function tokenURI(uint256 id) external view returns (string memory) {
        require(_owners[id] != address(0), "NONE");
        return string.concat('data:application/json;utf8,{"name":"', labelOf[id], '.lgns","description":"LGNS name service: ', labelOf[id], '.lgns"}');
    }

    function approve(address to, uint256 id) external {
        address o = ownerOf(id);
        require(msg.sender == o || _operators[o][msg.sender], "NOT_ALLOWED");
        _approved[id] = to;
        emit Approval(o, to, id);
    }

    function getApproved(uint256 id) external view returns (address) {
        ownerOf(id);
        return _approved[id];
    }

    function setApprovalForAll(address operator, bool ok) external {
        _operators[msg.sender][operator] = ok;
        emit ApprovalForAll(msg.sender, operator, ok);
    }

    function isApprovedForAll(address o, address operator) external view returns (bool) {
        return _operators[o][operator];
    }

    function transferFrom(address from, address to, uint256 id) public {
        address o = ownerOf(id);
        require(o == from, "WRONG_FROM");
        require(to != address(0), "ZERO_ADDRESS");
        require(msg.sender == o || _approved[id] == msg.sender || _operators[o][msg.sender], "NOT_ALLOWED");
        _move(from, to, id);
        _addr[id] = to; // 转让后名字自动指向新主人（买家拿到就能用）
        emit AddrChanged(id, to);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        safeTransferFrom(from, to, id, "");
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        if (to.code.length > 0) {
            require(IERC721Receiver(to).onERC721Received(msg.sender, from, id, data) == IERC721Receiver.onERC721Received.selector, "UNSAFE_RECEIVER");
        }
    }

    // ---------- 内部 ----------

    function _pay(uint256 cost) private {
        require(DAI.transferFrom(msg.sender, PAYEE, cost), "PAY_FAILED");
    }

    function _mint(address to, uint256 id) private {
        _owners[id] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, id);
    }

    function _move(address from, address to, uint256 id) private {
        delete _approved[id];
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[id] = to;
        emit Transfer(from, to, id);
    }
}
