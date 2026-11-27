// 🚫 不开放注册、全站不显示的名字（敏感名字库）
// 2026-11-07 站长定：只拦历任国家主席全名。2026-11-08 上级要求扩大范围（领导人 + 委员长 / 常委 / 副主席 + 谐音拼音 + 涉政词 + 台港藏疆 + 历史事件）。
// 2026-11-27 站长定：审查力度降低，「只要不涉及严重的国家领导人姓名昵称就行，其它常委的都是小卡拉米」。
//   现在只拦：历任国家主席 / 总书记本人的姓名、拼音全拼、首字母缩写、常见外号谐音。
//   放开了：总理、委员长、政协、副主席、常委、军委 / 落马官员、台港人物、涉政词。起因：工单 #515「万里长城6666666」含「万里」（前委员长名）被全站隐藏，客户以为域名少到账一个。
// 只在前端和接口层过滤；链上合约不动。已注册的照样在链上，但本站任何页面都不显示、搜不到、不能当主名字展示，也不能批量 / AI 起名。
// 规则：先把名字转小写、去掉连字符和空格再比对（防 xi-jin-ping、xijinping2024 这种绕法）。前端 app.js 的 nameBanned 用同一套名单，改这里要一起改。
const LEADERS = [
  // 历任国家主席 / 总书记 / 核心
  "毛泽东", "刘少奇", "李先念", "杨尚昆", "江泽民", "胡锦涛", "习近平", "华国锋", "胡耀邦", "赵紫阳", "邓小平",
];
const PINYIN = [
  "maozedong", "liushaoqi", "lixiannian", "yangshangkun", "jiangzemin", "hujintao", "xijinping", "huaguofeng", "huyaobang", "zhaoziyang", "dengxiaoping",
  // 首字母缩写（整段匹配，防 xjp2024 这类）
  "xjp", "jzm", "hjt", "mzd", "dxp", "hyb", "zzy", "hgf",
];
const NICK = [
  // 谐音 / 外号 / 变体（习）
  "习大大", "近平", "进平", "晋平", "刁近平", "习禁评", "习特勒", "习包子", "习猪头", "习主席", "习总", "习皇", "习帝", "维尼", "小熊维尼", "总加速师", "加速师", "刁大大", "细颈瓶", "吸精瓶", "西金平", "习近乎",
  // 谐音 / 外号（毛 / 江 / 胡）
  "毛主席", "毛腊肉", "泽东", "择东", "江蛤", "胡总",
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 短拼音（xjp、mzd…）只在整个名字就是它（前后最多带数字）时才算，防止误伤；长的照样子串匹配
const SHORT = PINYIN.filter((x) => x.length <= 8), LONG = PINYIN.filter((x) => x.length > 8);
export const BAN_RE = new RegExp("(" + LEADERS.concat(LONG, NICK).map(esc).join("|") + ")", "i");
const SHORT_RE = new RegExp("^[0-9]*(" + SHORT.map(esc).join("|") + ")[0-9]*$", "i");
const norm = (n) => String(n || "").toLowerCase().replace(/[-_\s.]+/g, "");
export const banned = (n) => { const x = norm(n); return BAN_RE.test(x) || SHORT_RE.test(x); };
