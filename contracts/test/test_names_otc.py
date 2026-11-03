"""域名 OTC：AwakeNftEscrow 托管 AilgnsNames 域名 NFT 的本地测试。用法：python test_names_otc.py build/artifacts.json"""
import json
import sys

from eth_tester import EthereumTester, PyEVMBackend
from web3 import Web3

E = 10**18
MAX = 2**256 - 1
art = json.load(open(sys.argv[1]))["artifacts"]
tester = EthereumTester(PyEVMBackend())
w3 = Web3(Web3.EthereumTesterProvider(tester))
A, B, C, PAY, RES, FEE, DEPLOYER = w3.eth.accounts[:7]
passed = []


def deploy(name, *args):
    c = w3.eth.contract(abi=art[name]["abi"], bytecode=art[name]["bytecode"])
    tx = c.constructor(*args).transact({"from": DEPLOYER})
    return w3.eth.contract(address=w3.eth.get_transaction_receipt(tx).contractAddress, abi=art[name]["abi"])


def send(fn, sender):
    r = w3.eth.get_transaction_receipt(fn.transact({"from": sender, "gas": 3_000_000}))
    assert r.status == 1
    return r


def check(name, cond):
    assert cond, name
    passed.append(name)


dai = deploy("MockToken", 0)
lgns = deploy("MockToken", 0)
ail = deploy("MockToken", 0)
lp = deploy("MockPair", lgns.address, dai.address)  # LGNS 9 位小数：1 LGNS = 10 DAI
send(lp.functions.setReserves(1000 * 10**9, 10_000 * E), DEPLOYER)
ap = deploy("MockPair", dai.address, ail.address)  # 反过来排：1 AiLGNS = 800 DAI
send(ap.functions.setReserves(80_000 * E, 100 * E), DEPLOYER)
n = deploy("AilgnsNames", [dai.address, lgns.address, lp.address, ail.address, ap.address], PAY, RES, ["admin"])
esc = deploy("AwakeNftEscrow", n.address, dai.address, FEE)
bal = lambda a: dai.functions.balanceOf(a).call()
for who in (A, B, C):
    send(dai.functions.mint(who, 10_000 * E), DEPLOYER)
    send(dai.functions.approve(n.address, 2**256 - 1), who)
    send(dai.functions.approve(esc.address, 2**256 - 1), who)
send(n.functions.register("alice", A, 1, dai.address, MAX), A)
send(n.functions.register("bobby", C, 1, dai.address, MAX), C)
ida, idb = n.functions.idOf("alice").call(), n.functions.idOf("bobby").call()

# 卖单：A 挂 alice 100 DAI，B 买
send(n.functions.approve(esc.address, ida), A)
send(esc.functions.list(ida, 100 * E, 86400), A)
check("listed in escrow", n.functions.ownerOf(ida).call() == esc.address)
a0, f0 = bal(A), bal(FEE)
send(esc.functions.buy(0, 103 * E), B)
check("buy: name to B, points to B", n.functions.ownerOf(ida).call() == B and n.functions.resolve("alice").call() == B)
check("buy: seller got price, fee 3%", bal(A) - a0 == 100 * E and bal(FEE) - f0 == 3 * E)

# 求购单：A 出 50 DAI 求购，C 卖 bobby
send(esc.functions.bid(50 * E, 86400), A)
send(n.functions.approve(esc.address, idb), C)
c0 = bal(C)
send(esc.functions.sellTo(1, idb, 50 * E), C)
check("sellTo: name to A", n.functions.ownerOf(idb).call() == A and bal(C) - c0 == 50 * E)

# 撤单退回
send(n.functions.setApprovalForAll(esc.address, True), B)
send(esc.functions.list(ida, 10 * E, 86400), B)
send(esc.functions.cancel(2), B)
check("cancel returns name", n.functions.ownerOf(ida).call() == B)
print(f"{len(passed)} checks passed")
