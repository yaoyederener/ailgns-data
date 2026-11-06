// 🚫 不开放注册、全站不显示的名字：只拦 1949 年以来历任国家主席的全名（站长 2026-11-07 定：去中心化为主，只带一点点中心化，别拦太宽）
// 只在前端和接口层过滤；链上合约不动。已注册的照样在链上，但本站任何页面都不显示、搜不到、不能当主名字展示
export const BAN_RE = /毛泽东|刘少奇|李先念|杨尚昆|江泽民|胡锦涛|习近平|maozedong|liushaoqi|lixiannian|yangshangkun|jiangzemin|hujintao|xijinping/i;
export const banned = (n) => BAN_RE.test(String(n || ""));
