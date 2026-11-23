// 🚀 一键发币规则（站长 2026-11-23 定，目标客户 = 有社群的团队长）：
//   ① 钱包里持有 1 枚创世 .ailgns 域名  ② 发币费 1 整枚 AiLGNS（进收款钱包）  ③ 新币用 AiLGNS 做交易对
//   ④ 首笔流动性必须大于 1 枚 AiLGNS，放进去的流动性凭证直接进黑洞（销毁，谁也撤不走）
// 没有新合约：代币 = lib/launch-token.js 那份标准代币，客户自己钱包部署；池子 = 现成的 aiswap。
// 这个文件只放「纯计算」：名字 / 总量合不合规、登记时链上事实够不够。读链在 functions/api/launch.js。
import { AISWAP } from "./aiswap.js";
import { banned } from "./ban.js";

export const LAUNCH = AISWAP.launch;
export const E18 = 10n ** 18n;
export const DEAD = "0x000000000000000000000000000000000000dead";
// 不能用的代号：和本站、官方、主流币撞名的，一律不收（防冒充）
const RESERVED = ["ailgns", "lgns", "glgns", "slgns", "dai", "usdt", "usdc", "usd", "a", "eth", "weth", "btc", "wbtc", "bnb", "sol", "okb", "anubis", "aiswap", "otc", "cake", "lp"];
const low = (s) => String(s || "").toLowerCase();

// 名字 1–24 个字、代号 2–10 个字（字母 / 数字 / 汉字），不能冒充、不能涉政。返回 "" = 合规，否则是给客户看的原因
export function checkMeta(name, sym) {
  name = String(name || "").trim(); sym = String(sym || "").trim();
  if (!name) return "请填币的名字";
  if (Array.from(name).length > 24) return "名字最多 24 个字";
  if (!/^[A-Za-z0-9一-鿿 ._-]+$/.test(name)) return "名字只能用汉字、字母、数字、空格和 . _ -";
  if (!sym) return "请填币的代号";
  if (!/^[A-Za-z0-9一-鿿]{2,10}$/.test(sym)) return "代号要 2–10 个字，只能用字母、数字、汉字";
  if (RESERVED.indexOf(low(sym)) >= 0 || /lgns/i.test(sym) || /lgns/i.test(name)) return "这个名字或代号和已有的币太像，不能用（防冒充）";
  if (banned(name) || banned(sym)) return "这个名字或代号不能用，请换一个";
  return "";
}
// 总量：整数，1 万到 1,000 万亿（部署时 × 10^18）
export function checkSupply(s) {
  s = String(s || "").replace(/[,，\s]/g, "");
  if (!/^\d+$/.test(s)) return "总量请填整数";
  const n = BigInt(s);
  if (n < 10000n) return "总量最少 1 万";
  if (n > 10n ** 15n) return "总量最多 1,000 万亿";
  return "";
}
const big = (v) => { try { return BigInt(v || 0); } catch (e) { return 0n; } };

// 登记核对：f = 从链上读回来的事实（见 functions/api/launch.js gather）。全部通过才上榜。
// 顺序 = 客户做的顺序，哪一步没做完就提示哪一步
export function verify(f) {
  const no = (why) => ({ ok: false, why });
  const creator = low(f.creator), feeAil = big(LAUNCH.feeAil) * E18, minLiq = big(LAUNCH.minLiqAil) * E18;
  if (!f.wantCode) return no("发币还没开放，请等公告");
  if (!f.deployOk || !creator || low(f.deployTo) !== low(f.token)) return no("没找到这个币的部署交易，请确认是在本页发的币");
  if (!f.code || low(f.code) !== low(f.wantCode)) return no("这个币不是本站的标准代币（合约被改过），不能上榜");
  if (Number(f.decimals) !== 18 || big(f.supply) <= 0n) return no("这个币的总量读不出来，稍后再试");
  const m = checkMeta(f.name, f.sym); if (m) return no(m);
  if (f.symTaken) return no("代号「" + f.sym + "」已经有人用了，请换一个代号重新发");
  if (!f.pair || /^0x0{40}$/.test(low(f.pair))) return no("还没有建池子：请先做「加流动性」那一步");
  if (big(f.quoteRes) <= minLiq) return no("池子里的 AiLGNS 不够：首笔流动性必须大于 " + LAUNCH.minLiqAil + " 枚 AiLGNS");
  if (big(f.lpCreator) > 0n) return no("流动性凭证还在你钱包里，没有销毁。请把它转进黑洞地址后再登记");
  if (big(f.lpTotal) <= 0n || big(f.lpDead) * 100n < big(f.lpTotal) * 99n) return no("流动性没有全部销毁，不能上榜");
  if (!f.feeOk || big(f.feePaid) < feeAil) return no("没有查到发币费：要从发币的钱包转 " + LAUNCH.feeAil + " 枚 AiLGNS 到收款钱包");
  if (f.feeUsed) return no("这笔发币费已经用过了，一笔只能登记一个币");
  if (f.gen !== null && f.gen !== undefined && Number(f.gen) < LAUNCH.needGenesis) return no("发币的钱包里要持有至少 " + LAUNCH.needGenesis + " 枚创世 .ailgns 域名");
  if (f.gen === null || f.gen === undefined) return no("暂时查不到创世域名持有情况，请过几分钟再点一次登记（不会多收费）");
  return { ok: true };
}
// 上榜记录：发币人当时自己留了多少（%）= 钱包里的 ÷ 总量
export function keepPct(bal, supply) { const s = big(supply); if (s <= 0n) return 0; return Number(big(bal) * 10000n / s) / 100; }
