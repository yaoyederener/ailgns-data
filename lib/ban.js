// 🚫 不开放注册、全站不显示的名字（政治人物 / 党政机关相关）：站长 2026-11-07 定，不沾任何政治风险
// 只在前端和接口层过滤；链上合约不动。已注册的照样在链上，但本站任何页面都不显示、搜不到、不能当主名字展示
export const BAN_RE = /习近平|习大大|习主席|习总|近平|习远平|彭丽媛|李强|李克强|胡锦涛|江泽民|温家宝|朱镕基|邓小平|毛泽东|毛主席|周恩来|赵紫阳|胡耀邦|华国锋|刘少奇|王沪宁|赵乐际|蔡奇|丁薛祥|李希|韩正|栗战书|汪洋|王岐山|李鹏|乔石|李瑞环|贾庆林|吴邦国|曾庆红|张德江|俞正声|刘云山|张高丽|xijinping|xidada|xizhuxi|jinping|maozedong|dengxiaoping|jiangzemin|hujintao|wenjiabao|likeqiang|liqiang|zhurongji|zhouenlai|中南海|共产党|国家主席|总书记|党中央|政治局|中央军委|国务院|人大常委|政协|zhongnanhai|gongchandang/i;
export const banned = (n) => BAN_RE.test(String(n || ""));
