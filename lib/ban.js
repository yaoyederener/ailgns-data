// 🚫 不开放注册、全站不显示的名字（敏感名字库）
// 2026-11-07 站长定：只拦历任国家主席全名。2026-11-08 上级要求扩大范围：领导人（历任主席 / 总理 / 总书记 / 委员长 / 现任常委 / 副主席）、
// 常见谐音与外号、拼音全拼与首字母缩写、涉政敏感词、涉台港藏疆、历史事件代号。只在前端和接口层过滤；链上合约不动。
// 已注册的照样在链上，但本站任何页面都不显示、搜不到、不能当主名字展示，也不能批量 / AI 起名。
// 规则：先把名字转小写、去掉连字符和空格再比对（防 xi-jin-ping、xijinping2024 这种绕法）。
const LEADERS = [
  // 历任国家主席 / 总书记 / 核心
  "毛泽东", "刘少奇", "李先念", "杨尚昆", "江泽民", "胡锦涛", "习近平", "华国锋", "胡耀邦", "赵紫阳", "邓小平",
  // 历任总理
  "周恩来", "李鹏", "朱镕基", "温家宝", "李克强", "李强",
  // 人大委员长 / 政协主席 / 副主席（近几届）
  "栗战书", "赵乐际", "吴邦国", "张德江", "乔石", "万里", "彭真", "汪洋", "王沪宁", "俞正声", "贾庆林", "李瑞环",
  "王岐山", "韩正", "李源潮", "曾庆红", "胡春华",
  // 现任政治局常委
  "蔡奇", "丁薛祥", "李希",
  // 军委 / 其他常被拿来做文章的
  "张又侠", "何卫东", "周永康", "薄熙来", "令计划", "徐才厚", "郭伯雄", "林彪", "江青", "王洪文", "张春桥", "姚文元",
  // 台港相关
  "蔡英文", "赖清德", "李登辉", "陈水扁", "马英九", "韩国瑜", "柯文哲", "黎智英", "黄之锋", "李柱铭", "达赖", "热比娅",
];
const PINYIN = [
  "maozedong", "liushaoqi", "lixiannian", "yangshangkun", "jiangzemin", "hujintao", "xijinping", "huaguofeng", "huyaobang", "zhaoziyang", "dengxiaoping",
  "zhouenlai", "lipeng", "zhurongji", "wenjiabao", "likeqiang", "liqiang", "lizhanshu", "zhaoleji", "wubangguo", "zhangdejiang", "wanghuning", "yuzhengsheng",
  "wangqishan", "hanzheng", "caiqi", "dingxuexiang", "lixi", "zhouyongkang", "boxilai", "lingjihua", "linbiao", "jiangqing",
  "caiyingwen", "laiqingde", "lidenghui", "chenshuibian", "mayingjiu", "dalai", "dalailama",
  // 首字母缩写（整段匹配，防 xjp2024 这类）
  "xjp", "jzm", "hjt", "mzd", "dxp", "lkq", "wjb", "zrj", "zel", "hyb", "zzy", "hgf",
];
const NICK = [
  // 谐音 / 外号 / 变体（习）
  "习大大", "近平", "进平", "晋平", "刁近平", "习禁评", "习特勒", "习包子", "习猪头", "习主席", "习总", "习皇", "习帝", "维尼", "小熊维尼", "总加速师", "加速师", "刁大大", "细颈瓶", "吸精瓶", "西金平", "习近乎",
  // 谐音 / 外号（毛 / 邓 / 江 / 胡 / 温 / 李）
  "毛主席", "毛腊肉", "泽东", "择东", "江蛤", "胡总", "温总", 
  // 涉政敏感词
  "共产党", "中共", "国务院", "政协", "党中央", "总书记", "国家主席", "政治局", "军委", "解放军", "武警", "公安", "国安", "纪委", "中纪委", "中南海", "天安门", "人民大会堂", "新华门",
  "六四", "8964", "liusi", "tiananmen", "天安门事件", "坦克人", "法轮功", "法轮", "大法", "李洪志", "falun", "falungong",
  "台独", "港独", "藏独", "疆独", "台湾独立", "香港独立", "西藏独立", "新疆独立", "一国两制", "光复香港", "时代革命", "反送中", "独立建国", "反共", "灭共", 
  "zhonggong", "gongchandang", "taidu", "gangdu", "zangdu", "jiangdu", "fangong",
  "支那", "zhina", "shina",
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 短拼音（lixi、lipeng、xjp…）只在整个名字就是它（前后最多带数字）时才算，防止 helix-io、lipengfei 这种误伤；长的照样子串匹配
const SHORT = PINYIN.filter((x) => x.length <= 8), LONG = PINYIN.filter((x) => x.length > 8);
export const BAN_RE = new RegExp("(" + LEADERS.concat(LONG, NICK).map(esc).join("|") + ")", "i");
const SHORT_RE = new RegExp("^[0-9]*(" + SHORT.map(esc).join("|") + ")[0-9]*$", "i");
const norm = (n) => String(n || "").toLowerCase().replace(/[-_\s.]+/g, "");
export const banned = (n) => { const x = norm(n); return BAN_RE.test(x) || SHORT_RE.test(x); };
