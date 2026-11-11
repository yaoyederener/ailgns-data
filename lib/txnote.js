// 🔔 客户自己在本站做的每笔链上操作，成功 / 失败都往他的收件箱写一条（站长 2026-11-11：每笔操作即时通知）
// 文字只由链上回执生成（发起人、调用的合约、转了多少币），不采信前端传来的任何文字，别人伪造不了
// 只认「调用本站合约 / 给本站合约授权 / 付款给本站 / 给自己写链上记录」这几类，别的交易不通知
import { ADDRESSES, TOKENS } from "./addresses.js";
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SQUARE = "0x0000000000000000000000000000000000a11905";
const OURS = ADDRESSES.filter((x) => x.c === "anubis");
const TOK = TOKENS.anubis;
// 各合约的操作名（选择器从前端 otc.js / names.js / lend.js / aiswap.js 的 SEL 核对）
const OTC = { "0x9128a740": ["挂单已发布", "存入托管"], "0x6fe4a448": ["成交成功"], "0x40e58ee5": ["撤单成功，币已退回钱包"] };
const NAME = { "0xd868a84f": ["域名注册成功"], "0x26e43e37": ["域名续费成功"], "0x38e74feb": ["主名字设置成功"], "0xeba36dbd": ["域名指向的地址已更新"], "0x23b872dd": ["域名已转出"], "0x095ea7b3": ["域名授权成功（挂单前的准备）"], "0xa22cb465": ["域名授权成功（挂单前的准备）"] };
const NMKT = { "0xca690ea2": ["域名已挂到市场"], "0xd6febde8": ["域名买入成功"], "0x40e58ee5": ["域名挂单已撤回，名字已退回钱包"] };
const LOAN = { "0x992001bd": ["出借单已挂出", "存入托管"], "0x2fedd319": ["借款单已挂出", "存入托管"], "0x4fd9efc4": ["借入成功", "押进托管"], "0xa65e2cfd": ["出借成功"], "0x371fd8e6": ["还款成功"], "0x379607f5": ["抵押品已领取"], "0x40e58ee5": ["借贷挂单已撤回，币已退回钱包"] };
const SWAP = { "0x5c11d795": ["兑换成功"], "0xe8e33700": ["加池子成功", "放进池子"], "0xbaa2abde": ["撤池子成功"] };
const fmt = (v, dec) => { const n = Number(v) / 10 ** dec; return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(Number(n.toFixed(4))); };
const tail = (n) => (n.split("·")[1] || "").replace(/\s*旧版.*$/, "").trim();

// rc = 回执，tx = 交易本体 → { k, title, outLabel } 或 null（不是本站操作）
function classify(rc, tx) {
  const from = String(rc.from || "").toLowerCase(), to = String(rc.to || "").toLowerCase();
  const input = String(tx.input || tx.data || "0x"), sel = input.slice(0, 10).toLowerCase();
  const ent = OURS.find((x) => x.a === to && x.k === "contract"), tok = TOK.find((t) => t[1] === to);
  const pick = (map, head, k) => { const o = map[sel] || ["操作成功"]; return { k, title: head + o[0], outLabel: o[1] || "付出" }; };
  if (ent) {
    if (/^OTC 托管/.test(ent.n)) return pick(OTC, "💱 OTC（" + tail(ent.n) + " 市场）", "otc");
    if (/扫单路由/.test(ent.n)) return { k: "otc", title: "💱 OTC 一键扫单成功", outLabel: "付出" };
    if (/^域名注册/.test(ent.n)) return pick(NAME, "🌐 ", "sys");
    if (/^域名市场/.test(ent.n)) return pick(NMKT, "🌐 ", "sys");
    if (/^借贷托管/.test(ent.n)) return pick(LOAN, "🤝 借贷（" + tail(ent.n) + " 抵押）", "loan");
    if (/^aiswap · Router/.test(ent.n)) return pick(SWAP, "🔁 aiswap 兑换池：", "sys");
    if (/^像素墙/.test(ent.n)) return { k: "sys", title: "🎨 像素墙操作成功", outLabel: "付出" };
    return null;
  }
  if (tok && sel === "0x095ea7b3") { // 授权：只认授权给本站合约的
    const sp = "0x" + input.slice(34, 74).toLowerCase();
    if (!OURS.some((x) => x.a === sp && x.k === "contract")) return null;
    const off = /^0+$/.test(input.slice(74, 138));
    return { k: "sys", title: off ? "✅ 已取消 " + tok[0] + " 授权" : "✅ " + tok[0] + " 授权成功\n以后在本站下单、成交时才会用到你的 " + tok[0] + "。授权本身不动币，只花一点 Gas。", outLabel: "付出" };
  }
  if (tok && sel === "0xa9059cbb") { // 转账：只认付给本站的
    const rcv = "0x" + input.slice(34, 74).toLowerCase();
    if (!OURS.some((x) => x.a === rcv)) return null;
    return { k: "sys", title: "💸 付款成功", outLabel: "付给本站" };
  }
  if (to === SQUARE && input.length > 10) return { k: "msg", title: "📢 广场发言已上链", outLabel: "付出" };
  if (to === from && input.length > 10) return { k: "sys", title: "📝 你的链上记录已写入", outLabel: "付出" };
  return null;
}

export function txNote(rc, tx) {
  const c = classify(rc, tx); if (!c) return null;
  const me = String(rc.from).toLowerCase(), h = String(rc.transactionHash).toLowerCase();
  const more = "明细：https://ailgns.dev/#/scan/tx/" + h;
  if (rc.status === "0x0") return { k: c.k, txt: "❌ 这笔操作没成功\n交易被链上撤销，你的币没有动（只花了一点 Gas）。回页面再点一次就行，还不行请提交工单。\n" + more, link: "#/scan/tx/" + h };
  // 先看钱：这笔交易里，你的钱包出去多少、进来多少
  const out = {}, inn = {};
  for (const l of rc.logs || []) {
    const t = TOK.find((x) => x[1] === String(l.address).toLowerCase());
    if (!t || !l.topics || l.topics.length !== 3 || l.topics[0] !== T_TRANSFER) continue;
    const f = "0x" + l.topics[1].slice(26).toLowerCase(), r = "0x" + l.topics[2].slice(26).toLowerCase(); let v;
    try { v = BigInt(l.data); } catch (e) { continue; }
    if (f === me && r !== me) out[t[0]] = (out[t[0]] || 0n) + v;
    if (r === me && f !== me) inn[t[0]] = (inn[t[0]] || 0n) + v;
  }
  const dec = (s) => TOK.find((x) => x[0] === s)[2], line = (o) => Object.keys(o).map((s) => fmt(o[s], dec(s)) + " " + s).join(" + ");
  const lines = [c.title];
  if (Object.keys(out).length) lines.push(c.outLabel + "：" + line(out));
  if (Object.keys(inn).length) lines.push("收到：" + line(inn));
  lines.push(more);
  return { k: c.k, txt: lines.join("\n"), link: "#/scan/tx/" + h };
}
