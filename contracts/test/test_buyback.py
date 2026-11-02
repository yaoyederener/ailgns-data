"""AilgnsBuyback 本地测试（py-evm 内存链）。
测试版是同一份源码，只把写死的地址（收款钱包、三个收款人、代币、OTC、池子）换成测试链上部署的地址。
用法：python test_buyback.py <compile.cjs>   （compile.cjs 用 solc 0.8.24 把 .sol 编译成 artifacts.json）"""
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
DEPLOYER, SOURCE, P1, P2, P3, KEEPER, MAKER, OTHER = w3.eth.accounts[:8]
passed = []

PAIR_SRC = """// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract MockPair {
    uint112 r0; uint112 r1;
    function set(uint112 a, uint112 b) external { r0 = a; r1 = b; }
    function getReserves() external view returns (uint112, uint112, uint32) { return (r0, r1, 0); }
}
"""


def compile_(files):
    d = tempfile.mkdtemp()
    subprocess.run(["node", COMPILE, *files], cwd=d, check=True, capture_output=True)
    return json.load(open(os.path.join(d, "artifacts.json")))["artifacts"]


def deploy(art, name, *args):
    c = w3.eth.contract(abi=art[name]["abi"], bytecode=art[name]["bytecode"])
    r = w3.eth.get_transaction_receipt(c.constructor(*args).transact({"from": DEPLOYER}))
    return w3.eth.contract(address=r.contractAddress, abi=art[name]["abi"])


def send(fn, sender):
    r = w3.eth.get_transaction_receipt(fn.transact({"from": sender, "gas": 6_000_000}))
    assert r["status"] == 1, "transaction failed"
    return r


def reverts(fn, sender, reason):
    try:
        fn.call({"from": sender, "gas": 6_000_000})
    except REVERT as e:
        assert reason in str(e), f"expected {reason}, got {e}"
        passed.append(f"拒绝：{reason}")
        return
    raise AssertionError(f"expected revert {reason}")


def check(name, cond):
    assert cond, name
    passed.append(name)


tmp = tempfile.mkdtemp()
pair_file = os.path.join(tmp, "MockPair.sol")
open(pair_file, "w").write(PAIR_SRC)
art = compile_([os.path.join(HERE, "TestTokens.sol"), os.path.join(HERE, "..", "AilgnsOtcEscrow.sol"), pair_file])
LGNS, DAI, AIL = (deploy(art, "MockToken", 0) for _ in range(3))
lgnsPair, ailPair = deploy(art, "MockPair"), deploy(art, "MockPair")
send(lgnsPair.functions.set(1_000_000 * G, 82_500 * E), DEPLOYER)  # LGNS 现价 0.0825
send(ailPair.functions.set(100 * E, 82_300 * E), DEPLOYER)  # AiLGNS 现价 823
lgnsOtc = deploy(art, "AilgnsOtcEscrow", LGNS.address, DAI.address, SOURCE)
ailOtc = deploy(art, "AilgnsOtcEscrow", AIL.address, DAI.address, SOURCE)

# 测试版回购合约：把写死的地址换成上面部署的
src = open(os.path.join(HERE, "..", "AilgnsBuyback.sol")).read()
for old, new in [("0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6", SOURCE), ("0xD53A00Bb90bB606f10d888419a14ecA779F17285", P1),
                 ("0xe8782615E32557F257DD88D70b1eb0d7f47B91c3", P2), ("0x5505d382bf5D705c5D3Ec0cBFc17a3DDe394B322", P3),
                 ("0x4D1D808a081FdAc440703b3765FC61f8028C06B8", LGNS.address), ("0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14", DAI.address),
                 ("0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", AIL.address), ("0xB6A7A3bE9a17AD241665ab9BDdbd9a573D488818", lgnsOtc.address),
                 ("0x4e730BE6d46bE71223Ded5A32Dc45799f6D4bc15", ailOtc.address), ("0x32A4586797E3f561F41C0F47CA57eD08D64f3dC0", lgnsPair.address),
                 ("0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", ailPair.address)]:
    assert old in src, old
    src = src.replace(old, Web3.to_checksum_address(new))
bb_file = os.path.join(tmp, "AilgnsBuyback.sol")
open(bb_file, "w").write(src)
bb = deploy(compile_([bb_file]), "AilgnsBuyback", KEEPER)

# 收款钱包的收入，授权回购合约
for t, amt in [(LGNS, 10_000 * G), (DAI, 100 * E), (AIL, E // 10)]:
    send(t.functions.mint(SOURCE, amt), DEPLOYER)
    send(t.functions.approve(bb.address, 2**256 - 1), SOURCE)

# 挂单：买单（MAKER 用 DAI 买 LGNS），卖单（MAKER 卖 AiLGNS 换 DAI）
send(DAI.functions.mint(MAKER, 10_000 * E), DEPLOYER)
send(AIL.functions.mint(MAKER, 10 * E), DEPLOYER)
send(DAI.functions.approve(lgnsOtc.address, 2**256 - 1), MAKER)
send(AIL.functions.approve(ailOtc.address, 2**256 - 1), MAKER)
DAY = 86400
send(lgnsOtc.functions.create(False, 570 * E, 10_000 * G, DAY), MAKER)  # #0 出价 0.057 ✓
send(lgnsOtc.functions.create(False, 30 * E, 1_000 * G, DAY), MAKER)  # #1 出价 0.03，低于现价 50%（0.04125）✗
send(ailOtc.functions.create(True, E // 2, 410 * E, DAY), MAKER)  # #0 要价 820 ✓
send(ailOtc.functions.create(True, E, 1000 * E, DAY), MAKER)  # #1 要价 1000，高于现价 115%（946.45）✗
send(ailOtc.functions.create(True, E // 5, 166 * E, DAY), MAKER)  # #2 要价 830 ✓

# 权限和参数
reverts(bb.functions.run(0, [], 0, [], 0, 0, 0), OTHER, "NOT_KEEPER")
reverts(bb.functions.run(0, [], 0, [], 0, 0, E), KEEPER, "GAS_TIP")
reverts(bb.functions.run(0, list(range(11)), 0, list(range(10)), 0, 0, 0), KEEPER, "TOO_MANY_ORDERS")
reverts(bb.functions.run(5_000 * G, [1, 0], 100 * E, [1, 0, 2], E // 10, 10 * E, 3 * E // 10), KEEPER, "BOUGHT_TOO_LITTLE")
reverts(bb.functions.refund(OTHER), KEEPER, "BAD_TOKEN")

# 正常跑一次：卖 5000 LGNS、用 100 DAI，加上 0.1 AiLGNS 收入一起分
src0 = {t: t.functions.balanceOf(SOURCE).call() for t in (LGNS, DAI, AIL)}
send(bb.functions.run(5_000 * G, [1, 0], 100 * E, [1, 0, 2], E // 10, 0, 3 * E // 10), KEEPER)
check("从收款钱包取走 5000 LGNS", LGNS.functions.balanceOf(SOURCE).call() == src0[LGNS] - 5_000 * G)
check("出价太低的 LGNS 买单没吃", lgnsOtc.functions.getOrders(1, 1).call()[0][6] == 30 * E)
# 买单 #0 吃了 5000/10000：拿到 285 DAI，扣 1% 后 282.15 进合约；手续费 2.85 DAI 进收款钱包
check("LGNS 换到 DAI（扣 1%）", bb.functions.totalDaiFromLgns().call() == 28215 * E // 100)
check("LGNS 买单的手续费回到收款钱包", DAI.functions.balanceOf(SOURCE).call() == src0[DAI] - 100 * E + 285 * E // 100)
check("给 KEEPER 补了 0.3 DAI Gas", DAI.functions.balanceOf(KEEPER).call() == 3 * E // 10)
check("要价太高的 AiLGNS 卖单没吃", ailOtc.functions.getOrders(1, 1).call()[0][6] == E)
spent = bb.functions.totalDaiSpent().call()
left_dai = DAI.functions.balanceOf(bb.address).call()
check("DAI 几乎全部花掉（382.15 - 0.3 Gas）", spent + left_dai == 38185 * E // 100 and left_dai < 10**6)
check("卖单 #0 吃了一部分，#2 没轮到", ailOtc.functions.getOrders(2, 1).call()[0][6] == E // 5)
bought = bb.functions.totalAilgnsBought().call()
total = bought + E // 10
a1, a2 = total * 4000 // 10000, total * 3000 // 10000
check("40% 给 PAYEE1", AIL.functions.balanceOf(P1).call() == a1)
check("30% 给 PAYEE2", AIL.functions.balanceOf(P2).call() == a2)
check("30% 给 PAYEE3", AIL.functions.balanceOf(P3).call() == total - a1 - a2)
check("合约里不留 AiLGNS", AIL.functions.balanceOf(bb.address).call() == 0)
check("均价不超过 820（扣 1% 前）", spent * E // (bought * 100 // 99) <= 820 * E + E)
check("记账：取走的 LGNS / DAI / AiLGNS", [bb.functions.totalPulled(t.address).call() for t in (LGNS, DAI, AIL)] == [5_000 * G, 100 * E, E // 10])

# 现价跌到 0.05：0.057 的买单仍然 ≥ 50%；但 AiLGNS 现价跌到 700 后，830 的卖单就不买了
send(ailPair.functions.set(100 * E, 70_000 * E), DEPLOYER)
d0 = DAI.functions.balanceOf(bb.address).call()
send(DAI.functions.mint(SOURCE, 50 * E), DEPLOYER)
send(bb.functions.run(0, [], 50 * E, [2], 0, 0, 0), KEEPER)
check("现价下跌后，高于现价 115% 的卖单不买，DAI 留在合约", DAI.functions.balanceOf(bb.address).call() == d0 + 50 * E and AIL.functions.balanceOf(bb.address).call() == 0)

# 退回：没换完的 DAI 原样退回收款钱包
s0 = DAI.functions.balanceOf(SOURCE).call()
send(bb.functions.refund(DAI.address), KEEPER)
check("refund 把 DAI 退回收款钱包", DAI.functions.balanceOf(bb.address).call() == 0 and DAI.functions.balanceOf(SOURCE).call() == s0 + d0 + 50 * E)

# 过期的单子跳过，不会让整笔交易失败
w3.provider.ethereum_tester.time_travel(w3.eth.get_block("latest")["timestamp"] + 2 * DAY)
w3.provider.ethereum_tester.mine_blocks(1)
l0 = LGNS.functions.balanceOf(bb.address).call()
send(bb.functions.run(1_000 * G, [0], 0, [], 0, 0, 0), KEEPER)
check("过期的买单跳过，LGNS 留在合约", LGNS.functions.balanceOf(bb.address).call() == l0 + 1_000 * G)

print(f"{len(passed)} 项全部通过")
for p in passed:
    print(" ✓", p)
