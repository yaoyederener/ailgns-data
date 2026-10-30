"""AilgnsFeeSplitter 本地测试（py-evm 内存链）。
TestFeeSplitter 是同一份源码，只把 SOURCE / PAYEE1 / PAYEE2 换成测试账户。用法：python test_fee_splitter.py build/artifacts.json"""
import json
import sys

from eth_tester import EthereumTester, PyEVMBackend
from eth_tester.exceptions import TransactionFailed
from web3 import Web3
from web3.exceptions import ContractLogicError

REVERT = (ContractLogicError, TransactionFailed)
E = 10**18
art = json.load(open(sys.argv[1]))["artifacts"]
w3 = Web3(Web3.EthereumTesterProvider(EthereumTester(PyEVMBackend())))
DEPLOYER, SOURCE, P1, P2, KEEPER, OTHER = w3.eth.accounts[:6]
passed = []


def deploy(name, *args):
    c = w3.eth.contract(abi=art[name]["abi"], bytecode=art[name]["bytecode"])
    r = w3.eth.get_transaction_receipt(c.constructor(*args).transact({"from": DEPLOYER}))
    return w3.eth.contract(address=r.contractAddress, abi=art[name]["abi"])


def send(fn, sender):
    return w3.eth.get_transaction_receipt(fn.transact({"from": sender, "gas": 3_000_000}))


def reverts(fn, sender, reason):
    try:
        fn.call({"from": sender, "gas": 3_000_000})
    except REVERT as e:
        assert reason in str(e), f"expected {reason}, got {e}"
        passed.append(f"拒绝：{reason}")
        return
    raise AssertionError(f"expected revert {reason}")


def check(name, cond):
    assert cond, name
    passed.append(name)


# 正式合约：地址和比例写死
real = deploy("AilgnsFeeSplitter", KEEPER)
f = real.functions
check("正式合约 SOURCE = 原收款钱包", f.SOURCE().call() == "0xEdb9C6900A11d2dd37Da6B59f3604C35A39DB1e6")
check("正式合约 PAYEE1 = 0xe878…91c3（30%）", f.PAYEE1().call() == "0xe8782615E32557F257DD88D70b1eb0d7f47B91c3" and f.BPS1().call() == 3000)
check("正式合约 PAYEE2 = 0xD53A…7285（40%）", f.PAYEE2().call() == "0xD53A00Bb90bB606f10d888419a14ecA779F17285" and f.BPS2().call() == 4000)
check("正式合约 PAYEE3 = 原收款钱包（30%）", f.PAYEE3().call() == f.SOURCE().call() and f.BPS3().call() == 3000)
check("正式合约 keeper 是部署时传入的地址", f.keeper().call() == KEEPER)

# 测试合约：同样的逻辑，换成测试账户
sp = deploy("TestFeeSplitter", KEEPER)
tok = deploy("MockToken", 0)
bal = lambda who: tok.functions.balanceOf(who).call()
send(tok.functions.mint(SOURCE, 1000 * E), DEPLOYER)

reverts(sp.functions.split(tok.address, 100 * E), KEEPER, "TRANSFER_FAILED")  # 还没授权
send(tok.functions.approve(sp.address, 2**256 - 1), SOURCE)

r = send(sp.functions.split(tok.address, 100 * E), KEEPER)
check("分 100：PAYEE1 收到 30", bal(P1) == 30 * E)
check("分 100：PAYEE2 收到 40", bal(P2) == 40 * E)
check("分 100：原收款钱包留下 30", bal(SOURCE) == 930 * E)
check("分账合约自己不持有币", bal(sp.address) == 0)
check("累计分账 100", sp.functions.totalSplit(tok.address).call() == 100 * E)
ev = sp.events.Split().process_receipt(r)[0]["args"]
check("Split 事件记录三份金额", (ev["amount"], ev["toPayee1"], ev["toPayee2"], ev["toPayee3"], ev["by"]) == (100 * E, 30 * E, 40 * E, 30 * E, KEEPER))

send(sp.functions.split(tok.address, 7), SOURCE)
check("原收款钱包自己也能触发；7 wei 分成 2 / 2 / 留 3", bal(P1) == 30 * E + 2 and bal(P2) == 40 * E + 2)
check("累计分账 100 + 7 wei", sp.functions.totalSplit(tok.address).call() == 100 * E + 7)

reverts(sp.functions.split(tok.address, E), OTHER, "NOT_ALLOWED")
reverts(sp.functions.split(tok.address, E), DEPLOYER, "NOT_ALLOWED")
reverts(sp.functions.split(tok.address, 0), KEEPER, "ZERO_AMOUNT")
reverts(sp.functions.split(tok.address, 10_000 * E), KEEPER, "TRANSFER_FAILED")  # 余额不够

# 有限授权：用完就分不了
tok2 = deploy("MockToken", 0)
send(tok2.functions.mint(SOURCE, 100 * E), DEPLOYER)
send(tok2.functions.approve(sp.address, 10 * E), SOURCE)
send(sp.functions.split(tok2.address, 10 * E), KEEPER)
check("授权 10 时能分 10", tok2.functions.balanceOf(P2).call() == 4 * E)
reverts(sp.functions.split(tok2.address, 10 * E), KEEPER, "TRANSFER_FAILED")
check("授权只扣转出去的 70%（留下的 30% 不占授权）", tok2.functions.allowance(SOURCE, sp.address).call() == 3 * E)

print(f"全部通过（{len(passed)} 项）：")
for p in passed:
    print(" ✓", p)
