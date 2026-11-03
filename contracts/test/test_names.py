"""AilgnsNames 本地测试（py-evm 内存链）。用法：python test_names.py build/artifacts.json"""
import json
import sys

from eth_tester import EthereumTester, PyEVMBackend
from web3 import Web3
from eth_tester.exceptions import TransactionFailed
from web3.exceptions import ContractLogicError
REVERT = (ContractLogicError, TransactionFailed)

E = 10**18
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
n = deploy("AilgnsNames", dai.address, PAY, RES, ["admin", "official", "ailgns"])
f = n.functions
for who in (A, B, C):
    send(dai.functions.mint(who, 10_000 * E), DEPLOYER)
    send(dai.functions.approve(n.address, 2**256 - 1), who)
idof = lambda s: f.idOf(s).call()

check("reserved owned by RES", f.ownerOf(idof("admin")).call() == RES and f.resolve("admin").call() == RES)
check("reserved not available", not f.available("admin").call())
reverts(f.register("admin", A, 1), A, "TAKEN")
check("validity", f.valid("abc").call() and f.valid("a-1b").call() and not f.valid("ab").call()
      and not f.valid("Abc").call() and not f.valid("-ab").call() and not f.valid("ab-").call() and not f.valid("a.bc").call())
reverts(f.register("ABC", A, 1), A, "BAD_NAME")
check("prices", f.price("abc", 1).call() == 640 * E and f.price("abcd", 2).call() == 320 * E and f.price("abcde", 3).call() == 15 * E)

send(f.register("alice", A, 2), A)
check("pay to PAYEE", dai.functions.balanceOf(PAY).call() == 10 * E)
id_ = idof("alice")
check("owner+resolve", f.ownerOf(id_).call() == A and f.resolve("alice").call() == A and f.balanceOf(A).call() == 1)
reverts(f.register("alice", B, 1), B, "TAKEN")
reverts(f.register("bob12", A, 11), A, "BAD_YEARS")

reverts(f.setPrimary(id_), B, "NOT_YOURS")
send(f.setPrimary(id_), A)
check("reverse", f.nameOf(A).call() == "alice")
reverts(f.setAddr(id_, C), B, "NOT_OWNER")
send(f.setAddr(id_, C), A)
check("setAddr", f.resolve("alice").call() == C and f.nameOf(A).call() == "")

send(f.transferFrom(A, B, id_), A)
check("transfer moves addr", f.ownerOf(id_).call() == B and f.resolve("alice").call() == B and f.balanceOf(A).call() == 0)
reverts(f.transferFrom(B, C, id_), A, "NOT_ALLOWED")

send(f.renew("alice", 1), C)  # 任何人都能续费
exp = f.expires(id_).call()
warp(3 * YEAR + 1)
check("expired: resolve 0", f.resolve("alice").call() == "0x" + "0" * 40 and not f.available("alice").call())
reverts(f.ownerOf(id_), A, "EXPIRED_OR_NONE")
reverts(f.register("alice", C, 1), C, "TAKEN")
send(f.renew("alice", 1), B)  # 宽限期内可以续
check("grace renew", f.ownerOf(id_).call() == B and f.expires(id_).call() == exp + YEAR)
warp(YEAR + 91 * 86400)
check("after grace available", f.available("alice").call())
reverts(f.renew("alice", 1), B, "NOT_RENEWABLE")
send(f.register("alice", C, 1), C)
check("re-register", f.ownerOf(id_).call() == C and f.balanceOf(B).call() == 0 and f.balanceOf(C).call() == 1)
reverts(f.renew("alice", 11), C, "BAD_YEARS")
check("tokenURI", "alice.ailgns" in f.tokenURI(id_).call())
check("supports 721", f.supportsInterface("0x80ac58cd").call())

print(f"{len(passed)} checks passed")
