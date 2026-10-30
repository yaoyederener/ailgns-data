"""AilgnsOtcEscrow 本地测试（py-evm 内存链）。用法：python test_escrow.py build/artifacts.json"""
import json
import sys

from eth_tester import EthereumTester, PyEVMBackend
from web3 import Web3
from eth_tester.exceptions import TransactionFailed
from web3.exceptions import ContractLogicError
REVERT = (ContractLogicError, TransactionFailed)

E = 10**18
art = json.load(open(sys.argv[1]))["artifacts"]
tester = EthereumTester(PyEVMBackend())
w3 = Web3(Web3.EthereumTesterProvider(tester))
A, B, C, FEE, DEPLOYER = w3.eth.accounts[:5]
passed = []


def deploy(name, *args, sender=DEPLOYER):
    c = w3.eth.contract(abi=art[name]["abi"], bytecode=art[name]["bytecode"])
    tx = c.constructor(*args).transact({"from": sender})
    return w3.eth.contract(address=w3.eth.get_transaction_receipt(tx).contractAddress, abi=art[name]["abi"])


def send(fn, sender):
    return w3.eth.get_transaction_receipt(fn.transact({"from": sender, "gas": 3_000_000}))


def reverts(fn, sender, reason):
    """先模拟调用拿到失败原因，再真的发交易，确认链上也失败、状态没变"""
    try:
        fn.call({"from": sender, "gas": 3_000_000})
    except REVERT as e:
        assert reason in str(e), f"expected {reason}, got {e}"
    else:
        raise AssertionError(f"expected revert {reason}")
    try:
        r = w3.eth.get_transaction_receipt(fn.transact({"from": sender, "gas": 3_000_000}))
        assert r.status == 0, f"tx succeeded but expected revert {reason}"
    except REVERT:
        pass


def check(name, cond):
    assert cond, name
    passed.append(name)


def setup(ailgns_name="MockToken", ailgns_args=(0,)):
    ail = deploy(ailgns_name, *ailgns_args)
    dai = deploy("MockToken", 0)
    esc = deploy("AilgnsOtcEscrow", ail.address, dai.address, FEE)
    for who in (A, B, C):
        send(ail.functions.mint(who, 100 * E), DEPLOYER)
        send(dai.functions.mint(who, 100_000 * E), DEPLOYER)
        send(ail.functions.approve(esc.address, 2**256 - 1), who)
        send(dai.functions.approve(esc.address, 2**256 - 1), who)
    return ail, dai, esc


def bal(t, who):
    return t.functions.balanceOf(who).call()


def held(esc):
    """合约里应有的余额 = 所有未成交挂单的剩余数量之和"""
    n = esc.functions.ordersCount().call()
    s = {True: 0, False: 0}
    for o in esc.functions.getOrders(0, n).call():
        s[o[1]] += o[6]
    return s


# ---------- 买单：A 存 DAI 换 AILGNS，分两次被吃完 ----------
ail, dai, esc = setup()
a_dai, a_ail, b_dai, b_ail = bal(dai, A), bal(ail, A), bal(dai, B), bal(ail, B)
send(esc.functions.create(False, 1000 * E, 125 * E // 100, 3600), A)  # 1000 DAI 换 1.25 AILGNS，价格 800
check("买单：DAI 锁进合约", bal(dai, esc.address) == 1000 * E and bal(dai, A) == a_dai - 1000 * E)
o = esc.functions.getOrder(0).call()
check("买单：订单字段正确", o[0] == A and o[1] is False and o[2] is True and o[6] == 1000 * E)

send(esc.functions.fill(0, 400 * E, 1 * E), B)  # B 拿 400 DAI，付 0.5 AILGNS
check("部分成交：A 收到 0.5 AILGNS", bal(ail, A) == a_ail + E // 2)
check("部分成交：B 收到 396 DAI（扣 1%）", bal(dai, B) == b_dai + 396 * E)
check("部分成交：手续费 4 DAI 到收款地址", bal(dai, FEE) == 4 * E)
check("部分成交：订单剩 600 DAI 仍有效", esc.functions.getOrder(0).call()[6] == 600 * E and esc.functions.getOrder(0).call()[2])

send(esc.functions.fill(0, 600 * E, 1 * E), B)
check("吃完：订单关闭", esc.functions.getOrder(0).call()[2] is False)
check("吃完：A 共收到 1.25 AILGNS", bal(ail, A) == a_ail + 125 * E // 100)
check("吃完：B 共付 1.25 AILGNS", bal(ail, B) == b_ail - 125 * E // 100)
check("吃完：合约里不留 DAI", bal(dai, esc.address) == 0)
reverts(esc.functions.fill(0, 1, 10**30), C, "CLOSED")
passed.append("已成交的单不能再吃")

# ---------- 卖单：A 存 AILGNS 换 DAI ----------
a_dai = bal(dai, A)
send(esc.functions.create(True, 2 * E, 1600 * E, 3600), A)  # 2 AILGNS 换 1600 DAI
reverts(esc.functions.fill(1, 2 * E, 1599 * E), B, "PRICE_CHANGED")
passed.append("付款上限低于应付金额时拒绝成交")
b_ail = bal(ail, B)
send(esc.functions.fill(1, 2 * E, 1600 * E), B)
check("卖单成交：A 收到 1600 DAI", bal(dai, A) == a_dai + 1600 * E)
check("卖单成交：B 收到 1.98 AILGNS", bal(ail, B) == b_ail + 198 * E // 100)
check("卖单成交：手续费 0.02 AILGNS", bal(ail, FEE) == 2 * E // 100)

# ---------- 撤单 ----------
a_dai = bal(dai, A)
send(esc.functions.create(False, 500 * E, 1 * E, 3600), A)
reverts(esc.functions.cancel(2), B, "NOT_MAKER")
passed.append("别人不能撤我的单")
send(esc.functions.cancel(2), A)
check("撤单：DAI 全额退回", bal(dai, A) == a_dai)
reverts(esc.functions.cancel(2), A, "CLOSED")
passed.append("不能重复撤单")

# ---------- 过期自动退回 ----------
a_ail = bal(ail, A)
send(esc.functions.create(True, 3 * E, 2400 * E, 600), A)
send(esc.functions.fill(3, 1 * E, 800 * E), B)  # 先成交一部分
tester.time_travel(w3.eth.get_block("latest").timestamp + 601)
reverts(esc.functions.fill(3, 1 * E, 800 * E), B, "EXPIRED")
passed.append("过期后不能再吃单")
send(esc.functions.refundExpired([3, 0, 99]), C)  # 第三方触发，混入已关闭和不存在的编号
check("过期退回：剩下 2 AILGNS 退回 A", bal(ail, A) == a_ail - 3 * E + 2 * E)
check("过期退回：订单关闭", esc.functions.getOrder(3).call()[2] is False)
send(esc.functions.refundExpired([3]), C)
check("重复触发退回不会多退", bal(ail, A) == a_ail - E)

send(esc.functions.create(False, 100 * E, 1 * E, 3600), A)
send(esc.functions.refundExpired([4]), C)
check("没到期的单不会被退回", esc.functions.getOrder(4).call()[2] is True)

# ---------- 参数限制 ----------
reverts(esc.functions.create(False, 1 * E, 1 * E, 599), A, "BAD_DURATION")
reverts(esc.functions.create(False, 1 * E, 1 * E, 30 * 86400 + 1), A, "BAD_DURATION")
passed.append("过期时间必须在 10 分钟到 30 天之间")
reverts(esc.functions.create(False, 0, 1 * E, 3600), A, "ZERO_AMOUNT")
reverts(esc.functions.fill(4, 101 * E, 10 * E), B, "BAD_AMOUNT")
passed.append("数量为 0 或超过剩余数量被拒绝")

# ---------- 吃单方余额或授权不足 ----------
send(dai.functions.approve(esc.address, 0), C)
send(esc.functions.create(True, 1 * E, 800 * E, 3600), A)
before = esc.functions.getOrder(5).call()
reverts(esc.functions.fill(5, 1 * E, 800 * E), C, "TOKEN_TRANSFER_FAILED")
check("付款失败时整笔回滚，订单不变", esc.functions.getOrder(5).call() == before)

# ---------- 极小数量的四舍五入 ----------
send(esc.functions.fill(4, 1, 10**18), B)
check("最小单位成交：至少付 1 wei，不会白拿", esc.functions.getOrder(4).call()[6] == 100 * E - 1)

# ---------- 账实一致 ----------
h = held(esc)
check("账实一致：合约 AILGNS 余额 = 未成交卖单剩余之和", bal(ail, esc.address) == h[True])
check("账实一致：合约 DAI 余额 = 未成交买单剩余之和", bal(dai, esc.address) == h[False])

# ---------- 转账收税的代币直接拒绝 ----------
ail2, dai2, esc2 = setup("MockToken", (100,))
reverts(esc2.functions.create(True, 1 * E, 800 * E, 3600), A, "TRANSFER_MISMATCH")
passed.append("转账收税的代币无法挂单（防止账实不符）")

# ---------- 重入攻击 ----------
ail3 = deploy("ReentrantToken")
dai3 = deploy("MockToken", 0)
esc3 = deploy("AilgnsOtcEscrow", ail3.address, dai3.address, FEE)
send(ail3.functions.mint(A, 10 * E), DEPLOYER)
send(ail3.functions.approve(esc3.address, 2**256 - 1), A)
send(ail3.functions.setEscrow(esc3.address), DEPLOYER)
reverts(esc3.functions.create(True, 1 * E, 800 * E, 3600), A, "TOKEN_TRANSFER_FAILED")
passed.append("重入攻击被拦截")

# ---------- 部署参数 ----------
try:
    deploy("AilgnsOtcEscrow", ail.address, ail.address, FEE)
    raise AssertionError("deploy with same token should fail")
except REVERT as e:
    assert "SAME_TOKEN" in str(e), e
passed.append("部署参数错误时拒绝部署")
check("合约常量：手续费 1%", esc.functions.FEE_BPS().call() == 100)
check("合约常量：收款地址写死", esc.functions.feeRecipient().call() == FEE)

# ---------- 没有单笔上限 ----------
send(esc.functions.create(False, 50_000 * E, 50 * E, 3600), A)
big = esc.functions.ordersCount().call() - 1
check("没有单笔上限：5 万 DAI 大单可以挂", esc.functions.getOrder(big).call()[6] == 50_000 * E)
send(esc.functions.fill(big, 50_000 * E, 50 * E), B)
check("没有单笔上限：大单可以一次吃完", esc.functions.getOrder(big).call()[2] is False)

print(f"全部通过：{len(passed)} 项")
for p in passed:
    print("  ✓", p)
