# AiLGNS 服务站

data.juzhang.org 的源码：资金流向、钱包快查、团队与等级。

- 纯静态页面（index.html / style.css / app.js），Cloudflare Pages 自动部署
- 实时数据：浏览器直接读 Anubis RPC 和 Awake Helix 官方公开接口
- 会员（member.js）：20 美元等值，可付 Anubis LGNS / Anubis AiLGNS / Polygon DAI（按实时价折算），钱包签名验证本人；开通后可用「团队与等级」「结构图」
- 每日买卖历史：由 yaoyederener/monita 的 GitHub Actions 每小时采集到 `data/ailgns_flows.json`

## OTC 担保交易（otc.js + contracts/）

- 合约：`contracts/AilgnsOtcEscrow.sol`（Solidity 0.8.24，优化 200 runs，evm paris），编译产物 `contracts/AilgnsOtcEscrow.json`
- 挂单资金锁在合约；吃单一笔交易内完成交换；挂单人随时撤单；过期后任何人可触发退回给挂单人
- 无管理员、不可升级；成交手续费 1%（吃单方承担），部署时写死；不设单笔上限
- 测试：`contracts/test/test_escrow.py`（py-evm 本地链，36 项）
- 已部署：Anubis 链 `0x4e730be6d46be71223ded5a32dc45799f6d4bc15`（部署页 `#/otc/deploy` 保留备用）
