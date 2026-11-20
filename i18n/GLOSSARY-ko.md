# Korean glossary & rules for the AiLGNS OTC site (zh → ko)

The site is a crypto OTC trading site for the token **AiLGNS** on the Anubis chain, written for ordinary people
(plain words, no jargon). Translate into short, plain, natural UI Korean, the way a Korean exchange or wallet app is written.

## Input and output
Each input line is `number<TAB>Chinese source<TAB>English translation already in use`.
The Chinese is the source of truth; the English is a reference that shows how the piece was understood.
Write one output line per input line: `number<TAB>Korean`. Same numbers, same order, nothing else (no header, no notes, no blank lines).
An empty Korean translation (`number<TAB>` with nothing after the tab) is allowed when Korean needs nothing there.
`\n` inside a line stands for a line break: keep it as `\n`.

## What you are translating
Each line is one *piece* of UI text exactly as it appears in the code. Many are whole sentences. Many others are
**pieces of a sentence cut where a number / name / amount is inserted by the program**, e.g. `共 ` + 5 + ` 张，剩 ` + 3 + ` 张`
arrives as the three pieces `共`, `张，剩`, `张`. Translate each piece so the assembled Korean still reads acceptably:
`총`, `건, 남은`, `건` → “총 5건, 남은 3건”. Neighbouring lines come from the same place in the code and give you context.
Korean word order differs from Chinese; when a piece is a fragment, prefer wording that still reads acceptably in the original order
(noun phrases, short clauses). Do NOT add leading or trailing spaces: the program inserts spaces between pieces itself, and it joins a
number directly to a following counter (개, 장, 건, 명, 번, 회, 분, 초, 일, 주, 년, 배, 위, 시간, 개월, 단계, 라운드, 블록, 회차), so write counters bare.

## Hard rules
- Output must contain **no Chinese characters (no Hanja)** and no full-width punctuation (，。：；（）「」！？、 → , . : ; ( ) “ ” ! ? ,).
- Keep exactly as they are: numbers, %, emoji and symbols (✅ ⚠️ → ↗ ▾ · ① ②), placeholders like `{0}` `{1}`, HTML tags like `<b>` `</b>` `<small>`,
  token and product names (AiLGNS, LGNS, gLGNS, DAI, USDT, POL, BNB, Anubis, Polygon, BSC, DEX, OTC, NFT, DeBox, AWAKE HELIX, aiswap, KyberSwap, ParaSwap, .ailgns), URLs.
  Every `{n}` placeholder and every HTML tag in the source must appear in the Korean, and no new ones.
- Never translate or alter a name ending in `.ailgns`.
- Chinese quotes 「…」 around a button name become “…”.
- Keep it short: buttons and labels 1–3 words (noun or verb stem style: 연결, 확인, 취소, 주문 등록). No marketing fluff.
- Sentences: polite formal style used by Korean finance apps (~합니다 / ~됩니다 / ~하세요). Be consistent.
- A piece that is only punctuation plus a word (e.g. `，剩`) keeps its punctuation in ASCII (`, 남은`).
- Measure words after a number: 张 → 건 (orders) or 장 (cards / tickets), 个 → 개, 枚 → 개, 笔 → 건, 次 → 회, 天 → 일, 小时 → 시간,
  分钟 → 분, 秒 → 초, 人 → 명, 期 → 회차, 步 → 단계, 块 → 칸 (farm plots) or 블록 (chain blocks), 倍 → 배, 名 → 위 (rank) or 명 (people).
- Particles that Korean does not need as a separate piece (的, 了, 地) → empty translation.
- “团队 / 技术人员 / 站长” → “운영팀”. Never mention a single person.
- Do not add explanations or notes.

## Glossary
挂单 주문 등록 · 我的挂单 내 주문 · 吃单 주문 체결 · 买单 매수 주문 · 卖单 매도 주문 · 撤单 주문 취소 · 成交 체결 · 盘口 호가창 ·
扫单 일괄 체결 · 单价 단가 · 总额 총액 · 指导价 기준가 · 到手 수령액 · 到账 입금 / 도착 · 你付出 지불 · 你到账 수령 ·
手续费 수수료 · 滑点 슬리피지 · 托管合约 에스크로 컨트랙트 · 担保交易 에스크로 거래 · 做市 마켓 메이킹 · 做市商 마켓 메이커 ·
做市机器人 마켓 메이커 봇 · 闪兑 스왑 · 跨链桥 브리지 · 过桥 브리지 전송 · 换币 환전 · 充进来 입금 · 提出去 출금 ·
钱包 지갑 · 连接钱包 지갑 연결 · 授权 승인 · 签名 서명 · 链上 온체인 · 区块 블록 · 区块哈希 블록 해시 · 合约 컨트랙트 ·
域名 도메인 · 注册 등록 · 续费 연장 · 到期 만료 · 主名字 대표 이름 · 创世域名 제네시스 도메인 · 批量注册 일괄 등록 ·
代注册 대리 등록 · 销毁 소각 · 销毁乐园 소각 파크 ·
预言家 오라클 · 极速预言家 패스트 오라클 · 预测 예측 · 猜中 적중 · 开奖 추첨 · 期 회차 · 奖池 상금 풀 · 中奖 당첨 · 奖金 상금 ·
走势图 추세 차트 · 遗漏 미출현 · 票 티켓 · 下注 베팅 ·
会员 멤버십 · 荣耀榜 명예의 전당 · 周榜 주간 랭킹 · 借贷 대출 · 借 빌리기 · 贷出 빌려주기 · 抵押 담보 · 质押 스테이킹 ·
清算 청산 · 利息 이자 · 账本 장부 · 链上留言 온체인 메시지 · 链上广场 온체인 광장 · 时间胶囊 타임캡슐 ·
收件箱 받은편지함 · 工单 문의 · 问题反馈 피드백 · 客服 고객센터 · 更新日志 업데이트 내역 ·
开心农场 해피 팜 · 金币 골드 · 地块 밭 · 种子 씨앗 · 收获 수확 · 偷 훔치기 · 偷菜 서리 · 掼蛋 관단 · 麻将 마작 · 大逃杀 배틀로얄 ·
房卡 룸 카드 · 房间 방 · 单机 싱글 플레이 · 联机 온라인 · 试运行 베타 · 试玩 체험 · 小白 초보자 · 分红 일일 보상 ·
夜间模式 야간 모드 · 团队 운영팀 · 余额 잔액 · 剩余 남음 · 有效期 유효기간 · 查询 조회 · 复制 복사 · 刷新 새로고침 · 加载中 불러오는 중 ·
全部 전체 · 确认 확인 · 取消 취소 · 知道了 확인 · 上一步 이전 · 下一步 다음 · 提交 제출 · 成功 성공 · 失败 실패 · 没成功 실패
