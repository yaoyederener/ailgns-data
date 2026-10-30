# 链上观测站（AiLGNS 数据）

data.juzhang.org 的源码：资金流向、钱包快查、团队与等级。

- 纯静态页面（index.html / style.css / app.js），Cloudflare Pages 自动部署
- 实时数据：浏览器直接读 Anubis RPC 和 Awake Helix 官方公开接口
- 会员（member.js）：Anubis 链 LGNS 付款（100 DAI，LGNS 按实时价 50% 折算），钱包签名验证本人，开通后可画团队结构图
- 每日买卖历史：由 yaoyederener/monita 的 GitHub Actions 每小时采集到 `data/ailgns_flows.json`

## OTC 担保交易（otc.js + contracts/）

- 合约：`contracts/AilgnsOtcEscrow.sol`（Solidity 0.8.24，优化 200 runs，evm paris），编译产物 `contracts/AilgnsOtcEscrow.json`
- 挂单资金锁在合约；吃单一笔交易内完成交换；挂单人随时撤单；过期后任何人可触发退回给挂单人
- 无管理员、不可升级；成交手续费 1%（吃单方承担），单笔上限 5000 DAI，均在部署时写死
- 测试：`contracts/test/test_escrow.py`（py-evm 本地链，35 项）
- 部署：打开 `#/otc/deploy` 用钱包部署，再把合约地址填进 `otc.js` 的 `OTC`
