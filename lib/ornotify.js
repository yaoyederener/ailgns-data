// 🔮 预言家 DeBox 通知（otc-watch 每 5 分钟顺手调一次）：
// ① 开奖结果：22:00 开奖窗口结束后，算出结果，推送给关注机器人的人 + 营销群；中奖的人（绑定过钱包的）再单独私信
// ② 每天提醒：北京时间 12 点、20 点各一次，提醒免费参与（只在当天有开奖时发）
import { sendDebox, sendDeboxFans } from "./debox.js";
import { openRound, prevDay, drawStart, settle, heldNow, bjDay, FIRST_DAY, CLOSEST, SECOND } from "./oracle.js";

const URL_OR = "https://ailgns.dev/#/oracle";
const p3 = (m) => (m / 1000).toFixed(3);
const dayCn = (d) => Number(d.slice(5, 7)) + "月" + Number(d.slice(8, 10)) + "日";
const n0 = (v) => String(Math.floor(v));

function resultText(r, pot) {
  const L = ["🔮 AiLGNS 每日预言家 · " + dayCn(r.day) + " 开奖结果", "", "📈 开奖价：" + p3(r.px) + " DAI（链上随机一刻，区块 #" + r.block + "）"];
  const jw = r.jackpot.winners;
  L.push(jw.length ? "🔮 神算子大奖：" + jw.map((w) => w.name).join("、") + " 猜中 3 位小数！每人 " + r.jackpot.each + " DAI 🎉" : "🔮 神算子大奖：没人猜中，奖池继续滚！");
  if (r.closest) L.push("🥇 最接近奖：" + r.closest.name + "，预测 " + p3(r.closest.p) + "（差 " + p3(r.closest.diff) + "）→ " + r.closest.amt + " DAI");
  if (r.second) L.push("🥈 次接近奖：" + r.second.name + "，预测 " + p3(r.second.p) + "（差 " + p3(r.second.diff) + "）→ " + r.second.amt + " DAI");
  if (!r.n) L.push("这一期没人参加。");
  else L.push("", "👥 本期 " + r.n + " 人参加，共 " + r.guesses + " 个预测", "💸 奖金几分钟内自动发到中奖钱包，链上可查");
  L.push("", "🎯 下一期奖池 " + n0(pot) + " DAI，免费参与，只需钱包签名 👉 " + URL_OR);
  return L.join("\n");
}
function remindText(day, pot, h) {
  return ["🔮 AiLGNS 每日预言家 · " + dayCn(day) + (h >= 20 ? " 今晚开奖，马上截止！" : " 今晚开奖"), "",
    "🎯 奖池 " + n0(pot) + " DAI", "🔮 神算子大奖（3 位小数全猜中）" + n0(pot * (1 - CLOSEST - SECOND)) + " DAI", "🥇 最接近奖 " + n0(pot * CLOSEST) + " DAI", "🥈 次接近奖 " + n0(pot * SECOND) + " DAI", "",
    "✅ 免费参与，不花钱、不花 Gas，只需钱包签名", "⏰ 晚上 9 点截止，9–10 点随机一刻开奖", "👉 " + URL_OR].join("\n");
}
async function dmWinner(env, kv, w, text) {
  const users = (await kv.get("dbx:a:" + w.a, "json")) || [];
  for (const u of users) await sendDebox(env, u, text, "private").catch(() => {});
}

export async function oracleNotify(env, kv, gids) {
  const now = Date.now(), out = {}, round = openRound(now), drawing = prevDay(round);
  const blast = async (text) => {
    await sendDeboxFans(env, gids[0], text).catch((e) => { out.fansErr = String(e.message || e).slice(0, 100); });
    for (const g of gids) await sendDebox(env, g, text, "group").catch(() => {});
  };
  // ① 开奖结果
  if (drawing >= FIRST_DAY && now >= drawStart(drawing) + 3600e3 + 60e3 && !(await kv.get("or:ann:" + drawing))) {
    const r = await settle(kv, drawing, now).catch(() => null);
    if (r) {
      await kv.put("or:ann:" + drawing, "1", { expirationTtl: 30 * 86400 }); // 先记，避免重复发
      const pot = await heldNow().catch(() => 0);
      await blast(resultText(r, pot));
      const tail = "\n\n奖金几分钟内自动发到你的钱包 🎉 注意：中奖后这个名字暂停 7 期，第 8 期自动恢复。";
      if (r.closest) await dmWinner(env, kv, r.closest, "🥇 恭喜！你在 " + dayCn(r.day) + " 预言家拿到最接近奖：" + r.closest.amt + " DAI" + tail);
      if (r.second) await dmWinner(env, kv, r.second, "🥈 恭喜！你在 " + dayCn(r.day) + " 预言家拿到次接近奖：" + r.second.amt + " DAI\n\n奖金几分钟内自动发到你的钱包 🎉");
      for (const w of r.jackpot.winners) await dmWinner(env, kv, w, "🔮 太神了！你在 " + dayCn(r.day) + " 猜中 3 位小数，拿下神算子大奖：" + r.jackpot.each + " DAI" + tail);
      out.result = r.day;
    }
  }
  // ② 每天 12 点、20 点提醒（当天有开奖才发）
  const today = bjDay(now), h = new Date(now + 8 * 3600e3).getUTCHours();
  if ((h === 12 || h === 20) && round === today && now < drawStart(today) && !(await kv.get("or:rem:" + today + ":" + h))) {
    await kv.put("or:rem:" + today + ":" + h, "1", { expirationTtl: 3 * 86400 });
    await blast(remindText(today, await heldNow().catch(() => 0), h));
    out.remind = today + " " + h;
  }
  return out;
}
