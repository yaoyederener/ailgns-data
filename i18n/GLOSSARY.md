# English glossary & rules for the AiLGNS OTC site (zh → en)

The site is a crypto OTC trading site for the token **AiLGNS** on the Anubis chain, written for ordinary people
(plain words, no jargon). Translate into short, plain, friendly UI English.

## What you are translating
Each input line is one *piece* of UI text exactly as it appears in the code. Many are whole sentences. Many others are
**pieces of a sentence cut where a number / name / amount is inserted by the program**, e.g. `共 ` + 5 + ` 张，剩 ` + 3 + ` 张`
arrives as the three pieces `共`, `张，剩`, `张`. Translate each piece so the assembled English still reads acceptably:
`Total`, `orders, `→ `orders, left`, `orders`. The program puts a space between an English piece and a neighbouring number or word,
so do NOT add leading/trailing spaces. Neighbouring lines in the input come from the same place in the code and give you context.

## Hard rules
- Output must contain **no Chinese characters** and no full-width punctuation (，。：；（）「」！？、 → , . : ; ( ) “ ” ! ? ,).
- Keep exactly as they are: numbers, %, emoji and symbols (✅ ⚠️ → ↗ ▾ · ① ②), token and product names
  (AiLGNS, LGNS, gLGNS, DAI, USDT, POL, Anubis, Polygon, DEX, OTC, NFT, DeBox, AWAKE HELIX, aiswap, KyberSwap, .ailgns), URLs.
- Never translate or alter a name ending in `.ailgns` (e.g. `发财.ailgns` would be an error to change — but such names will not normally appear).
- Chinese quotes 「…」 around a button name become “…”.
- Keep it short: buttons and labels 1–3 words. No marketing fluff. Sentence case (not Title Case).
- A piece that is only punctuation plus a word (e.g. `，剩`) keeps its punctuation in ASCII (`, left`).
- If a piece is a measure word after a number (张 / 个 / 枚 / 笔 / 次 / 天 / 小时 / 分钟 / 秒 / 人 / 块 / 期 / 条 / 步), translate as the
  matching plural noun or unit: 张→orders (cards in card games), 个→(usually the noun it counts, or leave as empty string if nothing fits),
  枚→(token unit; usually empty string or "tokens"), 笔→trades/transfers, 次→times, 天→days, 小时→hours, 分钟→min, 秒→s, 人→people, 期→rounds, 步→steps.
  An empty translation is allowed when English needs nothing there.
- “团队 / 技术人员 / 站长” → “the team”. Never mention a single person.
- Do not add explanations or notes. One output line per input line.

## Glossary
挂单 post an order · 我的挂单 my orders · 吃单 take / fill an order · 买单 buy order · 卖单 sell order · 撤单 cancel (an order) ·
成交 filled / trade · 盘口 order book · 扫单 sweep orders · 单价 price · 总额 total · 指导价 guide price · 到手 you receive ·
手续费 fee · 滑点 slippage · 托管合约 escrow contract · 担保交易 escrow trading · 做市 market making · 做市商 market maker ·
做市机器人 market-maker bot · 闪兑 swap · 跨链桥 bridge · 过桥 bridge (verb) · 充进来 deposit · 提出去 withdraw ·
钱包 wallet · 连接钱包 connect wallet · 授权 approve / approval · 签名 sign · 链上 on-chain · 区块 block · 合约 contract ·
域名 name (a `.ailgns` name) · 注册 register · 续费 renew · 到期 expire · 主名字 primary name · 创世域名 Genesis name ·
批量注册 batch register · 代注册 register for someone · 销毁 burn · 销毁乐园 Burn Park ·
预言家 Oracle · 极速预言家 Fast Oracle · 预测 prediction / predict · 猜中 guess right · 开奖 draw · 期 round · 奖池 prize pool · 中奖 win ·
会员 VIP / membership · 荣耀榜 leaderboard · 周榜 weekly board · 借贷 lending · 借 borrow · 贷出 lend · 抵押 collateral · 质押 stake ·
清算 liquidation · 利息 interest · 账本 ledger · 链上留言 on-chain message · 链上广场 On-chain Square · 时间胶囊 time capsule ·
收件箱 inbox · 工单 ticket · 问题反馈 feedback · 客服 support · 更新日志 what's new ·
开心农场 Happy Farm · 金币 coins · 地块 plot · 种子 seeds · 收获 harvest · 偷 steal · 掼蛋 Guandan · 麻将 Mahjong · 大逃杀 Battle Royale ·
房卡 room card · 房间 room · 单机 solo · 联机 online · 试运行 beta · 试玩 trial · 小白 beginner · 分红 daily reward ·
夜间模式 night mode · 团队 team · 余额 balance · 剩余 left · 有效期 valid for · 查询 search · 复制 copy · 刷新 refresh · 加载中 loading
