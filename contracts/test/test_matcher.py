"""AilgnsOtcMatcher 本地测试（py-evm 内存链）。
测试版是同一份源码，只把写死的地址（收款钱包、回购分账合约、代币、OTC）换成测试链上部署的地址。
用法：python test_matcher.py <compile.cjs>"""
import json
import os
import subprocess
import sys
import tempfile

from eth_tester import EthereumTester, PyEVMBackend
from eth_tester.exceptions import TransactionFailed
from web3 import Web3
from web3.exceptions import ContractLogicError

HERE = os.path.dirname(os.path.abspath(__file__))
COMPILE = sys.argv[1]
REVERT = (ContractLogicError, TransactionFailed)
E, G = 10**18, 10**9
w3 = Web3(Web3.EthereumTesterProvider(EthereumTester(PyEVMBackend())))
DEPLOYER, SOURCE, BUYBACK, KEEPER, SELLER, BUYER, OTHER, FEE = w3.eth.accounts[:8]
passed = []


def compile_(files):
    d = tempfile.mkdtemp()
    subprocess.run(["node", COMPILE, *files], cwd=d, check=True, capture_output=True)
    return json.load(open(os.path.join(d, "artifacts.json")))["artifacts"]


def deploy(art, name, *args):
    c = w3.eth.contract(abi=art[name]["abi"], bytecode=art[name]["bytecode"])
    r = w3.eth.get_transaction_receipt(c.constructor(*args).transact({"from": DEPLOYER}))
    return w3.eth.contract(address=r.contractAddress, abi=art[name]["abi"])


def send(fn, sender):
    r = w3.eth.get_transaction_receipt(fn.transact({"from": sender, "gas": 8_000_000}))
    assert r["status"] == 1, "transaction failed"
    return r


def reverts(fn, sender, reason):
    try:
        fn.call({"from": sender, "gas": 8_000_000})
    except REVERT as e:
        assert reason in str(e), f"expected {reason}, got {e}"
        passed.append(f"拒绝：{reason}")
        return
    raise AssertionError(f"expected revert {reason}")


def check(name, cond):
    assert cond, name
    passed.append(name)


art = compile_([os.path.join(HERE, "TestTokens.sol"), os.path.join(HERE, "..", "AilgnsOtcEscrow.sol")])
LGNS, DAI, AIL = (deploy(art, "MockToken", 0) for _ in range(3))
lgnsOtc = deploy(art, "AilgnsOtcEscrow", LGNS.address, DAI.address, FEE)
ailOtc = deploy(art, "AilgnsOtcEscrow", AIL.address, DAI.address, FEE)

src = open(os.path.join(HERE, "..", "AilgnsOtcMatcher.sol")).read()
for old, new in [("0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6", SOURCE), ("0x99f47ca8E7ed873e01a337aEfC5b75f5328d2da3", BUYBACK),
                 ("0x4D1D808a081FdAc440703b3765FC61f8028C06B8", LGNS.address), ("0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14", DAI.address),
                 ("0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", AIL.address), ("0xB6A7A3bE9a17AD241665ab9BDdbd9a573D488818", lgnsOtc.address),
                 ("0x4e730BE6d46bE71223Ded5A32Dc45799f6D4bc15", ailOtc.address)]:
    assert old in src, old
    src = src.replace(old, Web3.to_checksum_address(new))
tmp = tempfile.mkdtemp()
f = os.path.join(tmp, "AilgnsOtcMatcher.sol")
open(f, "w").write(src)
mx = deploy(compile_([f]), "AilgnsOtcMatcher", KEEPER)
M = mx.functions

send(DAI.functions.mint(SOURCE, 100 * E), DEPLOYER)
send(DAI.functions.approve(mx.address, 2**256 - 1), SOURCE)
for who, t, amt in [(SELLER, LGNS, 10_000 * G), (BUYER, DAI, 1_000 * E)]:
    send(t.functions.mint(who, amt), DEPLOYER)
    send(t.functions.approve(lgnsOtc.address, 2**256 - 1), who)
bal = lambda t, a: t.functions.balanceOf(a).call()

# 卖单 1000 LGNS 要 50 DAI（0.05）；买单 120 DAI 买 2000 LGNS（0.06）—— 价差 20%
send(lgnsOtc.functions.create(True, 1000 * G, 50 * E, 86400), SELLER)  # id 0
send(lgnsOtc.functions.create(False, 120 * E, 2000 * G, 86400), BUYER)  # id 1

reverts(M.matchOrders(lgnsOtc.address, 0, 1, 10 * E, 30, 0, 0), OTHER, "NOT_KEEPER")
reverts(M.matchOrders(OTHER, 0, 1, 10 * E, 30, 0, 0), KEEPER, "BAD_OTC")
reverts(M.matchOrders(lgnsOtc.address, 0, 1, 10 * E, 31, 0, 0), KEEPER, "BAD_ROUNDS")
reverts(M.matchOrders(lgnsOtc.address, 0, 1, 10 * E, 30, 0, 6 * 10**17), KEEPER, "GAS_TIP")
reverts(M.matchOrders(lgnsOtc.address, 1, 0, 10 * E, 30, 0, 0), KEEPER, "NO_PROFIT")  # 买卖单放反：一轮都不成交
reverts(M.matchOrders(lgnsOtc.address, 0, 1, 10 * E, 30, 100 * E, 0), KEEPER, "NO_PROFIT")  # 利润不够 minProfit

# 只用 10 DAI 周转，循环吃完 50 DAI 的卖单
k0 = bal(DAI, KEEPER)
r = send(M.matchOrders(lgnsOtc.address, 0, 1, 10 * E, 30, E, 2 * 10**17), KEEPER)
s, b = lgnsOtc.functions.getOrders(0, 2).call()
check("卖单被循环吃完（10 DAI 周转吃下 50 DAI 的单）", s[6] == 0 and not s[2])
check("买单只成交了一部分，剩下的继续挂着", b[2] and 0 < b[6] < 120 * E)
check("本金 10 DAI 原样退回收款钱包", bal(DAI, SOURCE) == 100 * E)
profit = bal(DAI, BUYBACK)
print("利润进分账：", profit / E, "DAI；零头 LGNS：", bal(LGNS, BUYBACK) / G, "；手续费 LGNS", bal(LGNS, FEE) / G, "DAI", bal(DAI, FEE) / E, "；Gas 补贴", (bal(DAI, KEEPER) - k0) / E, "；gasUsed", r["gasUsed"])
check("利润进回购分账合约（约 8.8 DAI）", 8 * E < profit < 10 * E)
check("Gas 补贴 0.2 DAI 给 KEEPER", bal(DAI, KEEPER) - k0 == 2 * 10**17)
check("卖家拿到 50 DAI", bal(DAI, SELLER) == 50 * E)
check("撮合合约里不留钱", bal(DAI, mx.address) == 0 and bal(LGNS, mx.address) == 0)
check("两边手续费照收（进 FEE）", bal(LGNS, FEE) > 0 and bal(DAI, FEE) > 0)
check("计数和累计利润", M.totalMatches().call() == 1 and M.totalProfit().call() == profit)

# 价差不到 2%：卖 0.06、买 0.061，两次 1% 手续费吃掉价差 → 回滚，收款钱包不动
send(lgnsOtc.functions.create(True, 1000 * G, 60 * E, 86400), SELLER)  # id 2
send(DAI.functions.mint(BUYER, 100 * E), DEPLOYER)
send(lgnsOtc.functions.create(False, 61 * E, 1000 * G, 86400), BUYER)  # id 3
reverts(M.matchOrders(lgnsOtc.address, 2, 3, 10 * E, 30, 0, 0), KEEPER, "NO_PROFIT")
check("回滚后收款钱包本金不变", bal(DAI, SOURCE) == 100 * E)

print("\n".join("✓ " + p for p in passed))
print(f"全部通过：{len(passed)} 项")
