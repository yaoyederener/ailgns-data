// 🏅 信誉等级（站长 2026-11-08 定：商家体系，越往上越像老字号；只看本站 OTC 链上真实累计成交，刷不出来）
// [名字, 累计成交 DAI, 笔数]；第 1 级「常客」满足其一即可，其余两项都要满足
export const CRED = [["新客", 0, 0], ["常客", 1000, 5], ["认证商家", 10000, 20], ["金牌商家", 100000, 50], ["钻石商家", 500000, 100], ["王牌商家", 1000000, 200], ["镇店巨鲸", 10000000, 500]];
export const CRED_ICON = ["", "", "✔ ", "🥇 ", "💎 ", "👑 ", "🐋 "];
export const KING_MIN_LV = 2; // 认证商家以上才能进贡献榜分钱
export function credLevel(vol, n) { let lv = 0; for (let i = 1; i < CRED.length; i++) { const [, v, c] = CRED[i]; if (i === 1 ? (vol >= v || n >= c) : (vol >= v && n >= c)) lv = i; } return lv; }
export async function credOf(kv, a) { const r = (await kv.get("otct:" + String(a).toLowerCase(), "json")) || {}; const vol = Number(r.vol || 0), n = Number(r.n || 0); return { vol: Math.round(vol), n, lv: credLevel(vol, n) }; }
