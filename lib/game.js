// 销毁乐园 · 排位赛：每局付 PRICE 个 LGNS 进收款合约（80% 销毁、20% 作为运营费用），这一局的分数上全站排行榜
// 只消耗、不赢币：排行榜只是名次，没有奖金、奖品或任何返还（免费练习模式不上榜）
// 付款：钱包把 LGNS 转到收款合约，转账数据末尾附上「GA（4741）+ 游戏名的 sha256」；后台核对链上转账后发一张门票，这局结束凭门票交分数
import { CHAINS, rpc } from "./pixel.js";

export const PRICE = 10; // 每局 10 LGNS
export const GAMES = ["g2048", "snake", "tetris", "flappy", "mines", "brick", "merge", "pet"];
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_AGE = 86400; // 门票 1 天内有效
const TOP = 30;

export async function sha256hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// 核对付款，发门票
export async function ticket(kv, tx, game, chain = "anubis") {
  const C = Object.hasOwn(CHAINS, chain) ? CHAINS[chain] : null;
  if (!C) throw new Error("不支持这条链");
  if (!GAMES.includes(game)) throw new Error("没有这个游戏");
  tx = String(tx || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new Error("交易哈希不对");
  const old = await kv.get("gtk:" + tx, "json");
  if (old) return { ok: true, used: !!old.used, game: old.game };
  const [txo, rc] = await Promise.all([rpc("eth_getTransactionByHash", [tx], chain), rpc("eth_getTransactionReceipt", [tx], chain)]);
  if (!txo || !rc) throw new Error("链上还查不到这笔交易，稍等几秒再试");
  if (rc.status !== "0x1") throw new Error("这笔转账在链上失败了");
  const input = String(txo.input || "").toLowerCase();
  if (String(txo.to || "").toLowerCase() !== C.lgns || input.slice(0, 10) !== "0xa9059cbb" || input.slice(138) !== "4741" + (await sha256hex(game))) throw new Error("这笔交易不是这个游戏的门票");
  const from = String(txo.from).toLowerCase();
  let paid = 0n;
  for (const l of rc.logs) if (l.address.toLowerCase() === C.lgns && l.topics[0] === TRANSFER && "0x" + l.topics[1].slice(26) === from && "0x" + l.topics[2].slice(26) === C.payTo) paid += BigInt(l.data);
  if (paid < BigInt(PRICE) * 10n ** 9n) throw new Error("付款不够：每局 " + PRICE + " LGNS");
  const blk = await rpc("eth_getBlockByNumber", [rc.blockNumber, false], chain), ts = parseInt(blk.timestamp, 16);
  if (Date.now() / 1000 - ts > MAX_AGE) throw new Error("这张门票超过 1 天了，不能再用");
  const amount = Number(paid / 10n ** 9n), burn = C.payTo === "0x000000000000000000000000000000000000dead" ? amount : amount * 0.8;
  await kv.put("gtk:" + tx, JSON.stringify({ from, game, chain, ts, amount, used: false }));
  const s = (await kv.get("g:stats", "json")) || { spent: 0, burned: 0, plays: 0, by: {} };
  s.spent += amount; s.burned += burn; s.plays += 1; s.by[from] = (s.by[from] || 0) + amount;
  await kv.put("g:stats", JSON.stringify(s));
  return { ok: true, used: false, game };
}

// 凭门票交这一局的分数（一张门票只能交一次），刷新这个游戏的排行榜（每个地址只留最好成绩）
export async function score(kv, tx, sc) {
  tx = String(tx || "").toLowerCase();
  const t = await kv.get("gtk:" + tx, "json");
  if (!t) throw new Error("没有这张门票");
  if (t.used) throw new Error("这张门票已经交过分数了");
  sc = Math.floor(Number(sc));
  if (!(sc >= 0 && sc < 1e7)) throw new Error("分数不对");
  t.used = true; t.score = sc;
  await kv.put("gtk:" + tx, JSON.stringify(t));
  const b = (await kv.get("gb:" + t.game, "json")) || [];
  const i = b.findIndex((x) => x.a === t.from);
  if (i < 0) b.push({ a: t.from, s: sc, t: Date.now() });
  else if (sc > b[i].s) b[i] = { a: t.from, s: sc, t: Date.now() };
  b.sort((x, y) => y.s - x.s);
  await kv.put("gb:" + t.game, JSON.stringify(b.slice(0, TOP)));
  return { ok: true, rank: b.findIndex((x) => x.a === t.from) + 1 };
}

export async function board(kv, game) {
  const s = (await kv.get("g:stats", "json")) || { spent: 0, burned: 0, plays: 0, by: {} };
  const top = Object.entries(s.by).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([a, v]) => ({ a, v }));
  return { price: PRICE, stats: { spent: s.spent, burned: s.burned, plays: s.plays }, top, board: GAMES.includes(game) ? (await kv.get("gb:" + game, "json")) || [] : [],
    pay: Object.fromEntries(Object.entries(CHAINS).map(([k, c]) => [k, { token: c.lgns, payTo: c.payTo }])) };
}
