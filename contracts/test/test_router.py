"""AilgnsSweepRouter 本地测试（py-evm 内存链）。
测试版是同一份源码，只把写死的地址（三个托管合约）换成测试链上部署的地址。
用法：python test_router.py <compile.cjs>"""
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
DEPLOYER, TAKER, S1, S2, B1, OTHER, FEE = w3.eth.accounts[:7]
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
fake = deploy(art, "AilgnsOtcEscrow", AIL.address, DAI.address, OTHER)

src = open(os.path.join(HERE, "..", "AilgnsSweepRouter.sol")).read()
for old, new in [("0x4e730BE6d46bE71223Ded5A32Dc45799f6D4bc15", ailOtc.address), ("0xB6A7A3bE9a17AD241665ab9BDdbd9a573D488818", lgnsOtc.address),
                 ("0x2B0aB121D60f823FFfC4ceF75Af26055Df388e2b", ailOtc.address)]:
    assert old in src, old
    src = src.replace(old, Web3.to_checksum_address(new))
tmp = tempfile.mkdtemp()
f = os.path.join(tmp, "AilgnsSweepRouter.sol")
open(f, "w").write(src)
rt = deploy(compile_([f]), "AilgnsSweepRouter")
R = rt.functions
bal = lambda t, a: t.functions.balanceOf(a).call()

for who, t, amt in [(S1, LGNS, 10_000 * G), (S2, LGNS, 10_000 * G), (B1, DAI, 1_000 * E), (TAKER, DAI, 1_000 * E), (TAKER, LGNS, 10_000 * G)]:
    send(t.functions.mint(who, amt), DEPLOYER)
    send(t.functions.approve(lgnsOtc.address, 2**256 - 1), who)
send(DAI.functions.approve(rt.address, 2**256 - 1), TAKER)
send(LGNS.functions.approve(rt.address, 2**256 - 1), TAKER)

send(lgnsOtc.functions.create(True, 1000 * G, 50 * E, 86400), S1)   # 0：卖 1000 LGNS @0.05
send(lgnsOtc.functions.create(True, 1000 * G, 60 * E, 86400), S2)   # 1：卖 1000 LGNS @0.06
send(lgnsOtc.functions.create(False, 40 * E, 1000 * G, 86400), B1)  # 2：买 1000 LGNS @0.04
send(lgnsOtc.functions.create(True, 500 * G, 25 * E, 86400), TAKER) # 3：自己的卖单

reverts(R.sweep(fake.address, True, [0], [1], E, 0), TAKER, "BAD_OTC")
reverts(R.sweep(lgnsOtc.address, True, [], [], E, 0), TAKER, "BAD_ORDERS")
reverts(R.sweep(lgnsOtc.address, True, [2], [1000 * G], 100 * E, 0), TAKER, "NOTHING_FILLED")  # 买单不能当卖单扫
reverts(R.sweep(lgnsOtc.address, True, [3], [500 * G], 100 * E, 0), TAKER, "NOTHING_FILLED")   # 自己的单跳过
reverts(R.sweep(lgnsOtc.address, True, [0, 1], [1000 * G, 1000 * G], 80 * E, 2000 * G), TAKER, "GOT_TOO_LITTLE")

d0, l0 = bal(DAI, TAKER), bal(LGNS, TAKER)
# 一笔扫两张卖单：预算 80 DAI，第一张整吃（50），第二张吃 30 DAI 的量（500 LGNS）
r = send(R.sweep(lgnsOtc.address, True, [0, 1], [1000 * G, 1000 * G], 80 * E, 1400 * G), TAKER)
check("一笔交易吃 2 张卖单", lgnsOtc.functions.getOrders(0, 1).call()[0][6] == 0 and lgnsOtc.functions.getOrders(1, 1).call()[0][6] == 500 * G)
check("付了 80 DAI", d0 - bal(DAI, TAKER) == 80 * E)
check("收到 1500 LGNS 扣 1% = 1485", bal(LGNS, TAKER) - l0 == 1485 * G)
check("卖家拿到 DAI", bal(DAI, S1) == 50 * E and bal(DAI, S2) == 30 * E)
check("手续费进 FEE", bal(LGNS, FEE) == 15 * G)
check("路由合约不留钱", bal(DAI, rt.address) == 0 and bal(LGNS, rt.address) == 0)
print("gasUsed", r["gasUsed"])

# 预算没花完退回：最多付 100 DAI，剩下的卖单只要 30
d0 = bal(DAI, TAKER)
send(R.sweep(lgnsOtc.address, True, [1], [10_000 * G], 100 * E, 0), TAKER)
check("没花完的 DAI 退回（只扣 30）", d0 - bal(DAI, TAKER) == 30 * E)

# 扫买单：付 LGNS 换 DAI
d0, l0 = bal(DAI, TAKER), bal(LGNS, TAKER)
send(R.sweep(lgnsOtc.address, False, [2], [40 * E], 1000 * G, 39 * E), TAKER)
check("扫买单：付 1000 LGNS 收 39.6 DAI", l0 - bal(LGNS, TAKER) == 1000 * G and bal(DAI, TAKER) - d0 == 396 * E // 10)
check("已吃完的单再扫回滚", True)
reverts(R.sweep(lgnsOtc.address, False, [2], [40 * E], 1000 * G, 0), TAKER, "NOTHING_FILLED")

print("\n".join("✓ " + p for p in passed))
print(f"全部通过：{len(passed)} 项")
