# AiLGNS 数据站

data.juzhang.org 的源码：资金流向、钱包快查、团队与等级。

- 纯静态页面（index.html / style.css / app.js），Cloudflare Pages 自动部署
- 实时数据：浏览器直接读 Anubis RPC 和 Awake Helix 官方公开接口
- 每日买卖历史：由 yaoyederener/monita 的 GitHub Actions 每小时采集到 `data/ailgns_flows.json`
