"""AilgnsNames 本地测试（py-evm 内存链）。用法：python test_names.py build/artifacts.json"""
import json
import sys

from eth_tester import EthereumTester, PyEVMBackend
from web3 import Web3
from eth_tester.exceptions import TransactionFailed
from web3.exceptions import ContractLogicError
REVERT = (ContractLogicError, TransactionFailed)

E = 10**18
MAX = 2**256 - 1
YEAR = 365 * 86400
art = json.load(open(sys.argv[1]))["artifacts"]
tester = EthereumTester(PyEVMBackend())
w3 = Web3(Web3.EthereumTesterProvider(tester))
A, B, C, PAY, RES, DEPLOYER = w3.eth.accounts[:6]
passed = []


def deploy(name, *args):
    c = w3.eth.contract(abi=art[name]["abi"], bytecode=art[name]["bytecode"])
    tx = c.constructor(*args).transact({"from": DEPLOYER})
    return w3.eth.contract(address=w3.eth.get_transaction_receipt(tx).contractAddress, abi=art[name]["abi"])


def send(fn, sender):
    return w3.eth.get_transaction_receipt(fn.transact({"from": sender, "gas": 3_000_000}))


def reverts(fn, sender, reason):
    try:
        fn.call({"from": sender, "gas": 3_000_000})
    except REVERT as e:
        assert reason in str(e), f"expected {reason}, got {e}"
    else:
        raise AssertionError(f"expected revert {reason}")


def check(name, cond):
    assert cond, name
    passed.append(name)


def warp(sec):
    tester.time_travel(w3.eth.get_block("latest").timestamp + sec)
    tester.mine_blocks()


dai = deploy("MockToken", 0)
lgns = deploy("MockToken", 0)
ail = deploy("MockToken", 0)
lp = deploy("MockPair", lgns.address, dai.address)  # LGNS 9 位小数：1 LGNS = 10 DAI
send(lp.functions.setReserves(1000 * 10**9, 10_000 * E), DEPLOYER)
ap = deploy("MockPair", dai.address, ail.address)  # 反过来排：1 AiLGNS = 800 DAI
send(ap.functions.setReserves(80_000 * E, 100 * E), DEPLOYER)
n = deploy("AilgnsNames", [dai.address, lgns.address, lp.address, ail.address, ap.address], PAY, RES, ["admin", "official", "ailgns"])
f = n.functions
for who in (A, B, C):
    send(dai.functions.mint(who, 10_000 * E), DEPLOYER)
    send(dai.functions.approve(n.address, 2**256 - 1), who)
idof = lambda s: f.idOf(s).call()

check("reserved owned by RES", f.ownerOf(idof("admin")).call() == RES and f.resolve("admin").call() == RES)
check("reserved not available", not f.available("admin").call())
reverts(f.register("admin", A, 1, dai.address, MAX), A, "TAKEN")
check("validity", f.valid("abc").call() and f.valid("a-1b").call() and not f.valid("ab").call()
      and not f.valid("Abc").call() and not f.valid("-ab").call() and not f.valid("ab-").call() and not f.valid("a.bc").call())
reverts(f.register("ABC", A, 1, dai.address, MAX), A, "BAD_NAME")
check("chinese", f.valid("张三丰").call() and f.valid("ab张").call() and f.valid("张三").call() and not f.valid("张").call() and not f.valid("ＡＢＣ").call()
      and not f.valid("张 三").call() and f.length("中文名字").call() == 4 and not f.valid("。。。").call())
check("chinese price", f.price("张三", 1).call() == 50 * E and f.price("张三丰", 2).call() == 10 * E and f.price("我的好名字", 1).call() == 5 * E and f.price("ab张", 1).call() == 5 * E)
send(f.register("张三丰", B, 1, dai.address, MAX), B)
check("chinese register", f.resolve("张三丰").call() == B)
check("prices", f.price("abc", 1).call() == 640 * E and f.price("abcd", 2).call() == 320 * E and f.price("abcde", 3).call() == 15 * E)

send(f.register("alice", A, 2, dai.address, MAX), A)
check("pay to PAYEE", dai.functions.balanceOf(PAY).call() == 15 * E)
id_ = idof("alice")
check("owner+resolve", f.ownerOf(id_).call() == A and f.resolve("alice").call() == A and f.balanceOf(A).call() == 1)
reverts(f.register("alice", B, 1, dai.address, MAX), B, "TAKEN")
reverts(f.register("bob12", A, 101, dai.address, MAX), A, "BAD_YEARS")

reverts(f.setPrimary(id_), B, "NOT_YOURS")
send(f.setPrimary(id_), A)
check("reverse", f.nameOf(A).call() == "alice")
reverts(f.setAddr(id_, C), B, "NOT_OWNER")
send(f.setAddr(id_, C), A)
check("setAddr", f.resolve("alice").call() == C and f.nameOf(A).call() == "")

send(f.transferFrom(A, B, id_), A)
check("transfer moves addr", f.ownerOf(id_).call() == B and f.resolve("alice").call() == B and f.balanceOf(A).call() == 0)
reverts(f.transferFrom(B, C, id_), A, "NOT_ALLOWED")

send(f.renew("alice", 1, dai.address, MAX), C)  # 任何人都能续费
exp = f.expires(id_).call()
warp(3 * YEAR + 1)
check("expired: resolve 0", f.resolve("alice").call() == "0x" + "0" * 40 and not f.available("alice").call())
reverts(f.ownerOf(id_), A, "EXPIRED_OR_NONE")
reverts(f.register("alice", C, 1, dai.address, MAX), C, "TAKEN")
send(f.renew("alice", 1, dai.address, MAX), B)  # 宽限期内可以续
check("grace renew", f.ownerOf(id_).call() == B and f.expires(id_).call() == exp + YEAR)
warp(YEAR + 91 * 86400)
check("after grace available", f.available("alice").call())
reverts(f.renew("alice", 1, dai.address, MAX), B, "NOT_RENEWABLE")
send(f.register("alice", C, 1, dai.address, MAX), C)
check("re-register", f.ownerOf(id_).call() == C and f.balanceOf(B).call() == 1 and f.balanceOf(C).call() == 1)  # B 还有 张三丰
reverts(f.renew("alice", 101, dai.address, MAX), C, "BAD_YEARS")
check("tokenURI", "alice.ailgns" in f.tokenURI(id_).call())
check("supports 721", f.supportsInterface("0x80ac58cd").call())

# 用 LGNS、AiLGNS 付款
send(lgns.functions.mint(A, 1000 * 10**9), DEPLOYER)
send(lgns.functions.approve(n.address, MAX), A)
send(ail.functions.mint(A, 10 * E), DEPLOYER)
send(ail.functions.approve(n.address, MAX), A)
check("quote", f.quote(5 * E, lgns.address).call() == 5 * 10**8 and f.quote(800 * E, ail.address).call() == E and f.quote(5 * E, dai.address).call() == 5 * E)
reverts(f.register("paylgns", A, 1, lgns.address, 4 * 10**8), A, "PRICE_CHANGED")
reverts(f.register("paylgns", A, 1, A, MAX), A, "BAD_TOKEN")
send(f.register("paylgns", A, 1, lgns.address, 5 * 10**8), A)
check("paid LGNS to PAYEE", lgns.functions.balanceOf(PAY).call() == 5 * 10**8 and f.ownerOf(f.idOf("paylgns").call()).call() == A)
send(f.register("abc", A, 1, ail.address, E), A)  # 640 DAI = 0.8 AiLGNS
check("paid AiLGNS to PAYEE", ail.functions.balanceOf(PAY).call() == 8 * 10**17)
send(f.renew("abc", 1, lgns.address, MAX), A)
check("renew with LGNS", lgns.functions.balanceOf(PAY).call() == 5 * 10**8 + 64 * 10**9)
print(f"{len(passed)} checks passed")
