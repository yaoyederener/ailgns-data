// 🔮 预言家 DeBox 通知（otc-watch 每 5 分钟顺手调一次）：
// ① 揭晓结果：22:00 揭晓窗口结束后，算出结果，推送给关注机器人的人 + 营销群；获奖的人（绑定过钱包的）再单独私信
// ② 每天提醒：北京时间 12 点、20 点各一次，提醒免费参与（只在当天有揭晓时发）
import { sendDebox, sendDeboxFans } from "./debox.js";
import { pushInbox } from "./inbox.js";
import { openRound, prevDay, drawStart, settle, heldNow, bjDay, FIRST_DAY, CLOSEST, SECOND, BURN_FROM, BURN_DAYS } from "./oracle.js";
import { ensureWeek } from "./cred.js";

const URL_OR = "https://ailgns.dev/#/oracle";
const p3 = (m) => (m / 1000).toFixed(3);
const dayCn = (d) => Number(d.slice(5, 7)) + "月" + Number(d.slice(8, 10)) + "日";
const n0 = (v) => String(Math.floor(v));

function resultText(r, pot) {
  const L = ["🔮 AiLGNS 每日预言家 · " + dayCn(r.day) + " 揭晓结果", "", "📈 揭晓价：" + p3(r.px) + " DAI（链上随机一刻，区块 #" + r.block + "）"];
  const jw = r.jackpot.winners, A = (amt, ail) => (ail ? ail.toFixed(4) + " AiLGNS（≈ " + amt + " DAI）" : amt + " DAI"); // 奖金只发 AiLGNS
  L.push(jw.length ? "🔮 神算子：" + jw.map((w) => w.name).join("、") + " 猜中 3 位小数！每人 " + A(r.jackpot.each, r.jackpot.eachAil) + " 🎉" : "🔮 神算子：没人猜中，奖池继续滚！");
  if (r.closest) L.push("👁 天眼通（最接近）：" + r.closest.name + "，预测 " + p3(r.closest.p) + "（差 " + p3(r.closest.diff) + "）→ " + A(r.closest.amt, r.closest.ail));
  if (r.second) L.push("🌿 地灵通（次接近）：" + r.second.name + "，预测 " + p3(r.second.p) + "（差 " + p3(r.second.diff) + "）→ " + A(r.second.amt, r.second.ail));
  if (r.kings && r.kings.length) L.push("💰 贡献王：" + r.kings.map((k) => k.name + " " + A(k.amt, k.ail)).join("、"));
  if (!r.n) L.push("这一期没人参加。");
  else L.push("", "👥 本期 " + r.n + " 人参加，共 " + r.guesses + " 个预测", r.day >= BURN_FROM ? "🔥 获奖人 " + BURN_DAYS + " 天内到 ailgns.dev/#/genesis 销毁 1 枚创世名，机器人核对后奖金以 AiLGNS 自动发到钱包；" + BURN_DAYS + " 天不烧视为放弃" : "💸 奖金以 AiLGNS 从奖池钱包自动发到获奖钱包（几分钟内），链上可查");
  L.push("", "🎯 下一期奖池 ≈ " + n0(pot) + " DAI（以 AiLGNS 发放），免费参与，只需钱包签名 👉 " + URL_OR);
  return L.join("\n");
}
function remindText(day, pot, h) {
  return ["🔮 AiLGNS 每日预言家 · " + dayCn(day) + (h >= 20 ? " 今晚揭晓，马上截止！" : " 今晚揭晓"), "",
    "🎯 奖池 ≈ " + n0(pot) + " DAI（奖金全部以 AiLGNS 发放）", "🔮 神算子（3 位小数全猜中）≈ " + n0(pot * 0.55) + " DAI", "💰 贡献王（OTC 手续费前 3）≈ " + n0(pot * 0.3) + " DAI", "👁 天眼通（最接近）≈ " + n0(pot * CLOSEST) + " DAI", "🌿 地灵通（次接近）≈ " + n0(pot * SECOND) + " DAI", "⚡ 有人完全猜中那天才发奖，没人猜中奖池继续滚大", "",
    "✅ 免费参与，不花钱、不花 Gas，只需钱包签名", "⏰ 晚上 9 点截止，9–10 点随机一刻揭晓", "👉 " + URL_OR].join("\n");
}
async function dmWinner(env, kv, w, text, link) {
  await pushInbox(kv, w.a, "oracle", text, link || "#/oracle").catch(() => {}); // 🔔 站内信
  const users = (await kv.get("dbx:a:" + w.a, "json")) || [];
  for (const u of users) await sendDebox(env, u, text, "private").catch(() => {});
}

export async function oracleNotify(env, kv, gids) {
  const now = Date.now(), out = {}, round = openRound(now), drawing = prevDay(round);
  const blast = async (text) => {
    await sendDeboxFans(env, gids[0], text).catch((e) => { out.fansErr = String(e.message || e).slice(0, 100); });
    for (const g of gids) await sendDebox(env, g, text, "group").catch(() => {});
  };
  // ① 揭晓结果
  if (drawing >= FIRST_DAY && now >= drawStart(drawing) + 3600e3 + 60e3 && !(await kv.get("or:ann:" + drawing))) {
    const r = await settle(kv, drawing, now).catch(() => null);
    if (r) {
      await kv.put("or:ann:" + drawing, "1", { expirationTtl: 30 * 86400 }); // 先记，避免重复发
      const pot = await heldNow().catch(() => 0);
      await blast(resultText(r, pot));
      const burn = r.day >= BURN_FROM;
      const tail = burn
        ? "\n\n🔥 领奖要先销毁 1 枚创世名（" + BURN_DAYS + " 天内）：打开 ailgns.dev/#/genesis → 点「我中奖了 · 销毁 1 枚创世名领奖」→ 连这个钱包 → 选一枚 → 钱包确认。烧自己手里的或去域名市场买一枚都行。烧完机器人核对链上记录，几分钟内把 AiLGNS 发到这个钱包。" + BURN_DAYS + " 天内不销毁视为放弃领奖。注意：每个名字、每个钱包只能中一次奖，想继续玩，用新钱包买一个新的创世 .ailgns 域名就行。"
        : "\n\n奖金以 AiLGNS 发放，几分钟内从奖池钱包自动转到你的钱包 🎉 注意：每个名字、每个钱包只能中一次奖，想继续玩，用新钱包买一个新的创世 .ailgns 域名就行。";
      const lk = burn ? "#/genesis" : "#/oracle";
      const A2 = (amt, ail) => (ail ? ail.toFixed(4) + " AiLGNS（≈ " + amt + " DAI）" : amt + " DAI");
      if (r.closest) await dmWinner(env, kv, r.closest, "👁 恭喜！你在 " + dayCn(r.day) + " 预言家荣获「天眼通」：最接近揭晓价，奖金 " + A2(r.closest.amt, r.closest.ail) + tail, lk);
      if (r.second) await dmWinner(env, kv, r.second, "🌿 恭喜！你在 " + dayCn(r.day) + " 预言家荣获「地灵通」：次接近揭晓价，奖金 " + A2(r.second.amt, r.second.ail) + tail, lk);
      for (const w of r.jackpot.winners) await dmWinner(env, kv, w, "🔮 太神了！你在 " + dayCn(r.day) + " 猜中 3 位小数，荣获「神算子」：奖金 " + A2(r.jackpot.each, r.jackpot.eachAil) + tail, lk);
      for (const k of r.kings || []) await dmWinner(env, kv, k, "💰 恭喜！你是 " + dayCn(r.day) + " 预言家「贡献王」（OTC 手续费前 3），奖金 " + A2(k.amt, k.ail) + tail, lk);
      out.result = r.day;
    }
  }
  // ③ 发奖完成 → 站内信通知全部 OTC 商户（站长 2026-11-08 定：自动发，不要手动）
  //    某天的奖全部转账成功（or:pay 里每笔都有 tx、笔数够）才发，每天只发一次
  try { out.mnotify = await merchantNotify(kv, now); } catch (e) { out.mnotifyErr = String(e.message || e).slice(0, 100); }
  // ② 每天 12 点、20 点提醒（当天有揭晓才发）
  const today = bjDay(now), h = new Date(now + 8 * 3600e3).getUTCHours();
  if ((h === 12 || h === 20) && round === today && now < drawStart(today) && !(await kv.get("or:rem:" + today + ":" + h))) {
    await kv.put("or:rem:" + today + ":" + h, "1", { expirationTtl: 3 * 86400 });
    // 2026-11-06 站长：每日提醒属于营销播报，停掉；只保留揭晓结果
    // await blast(remindText(today, await heldNow().catch(() => 0), h));
    out.remind = today + " " + h;
  }
  return out;
}

const KN = { king: "🏆 贡献王", closest: "👁 天眼通", second: "🌿 地灵通", jackpot: "🔮 神算子" };
async function merchantNotify(kv, now) {
  const pays = (await kv.get("or:pay", "json")) || [], sent = [];
  for (let i = 0; i < 3; i++) {
    const day = bjDay(now - i * 86400e3);
    if (day < "2026-11-08" || (await kv.get("or:mnot:" + day))) continue;
    const r = await kv.get("or:res:" + day, "json"); if (!r) continue;
    const need = (r.kings || []).length + (r.closest ? 1 : 0) + (r.second ? 1 : 0) + ((r.jackpot && r.jackpot.winners) || []).length;
    const l = pays.filter((x) => x.day === day);
    if (!need || l.length < need || l.some((x) => !x.tx && !x.forfeit)) continue; // 放弃的（3 天没烧）也算结清
    await kv.put("or:mnot:" + day, "1", { expirationTtl: 60 * 86400 }); // 先记，避免重复发
    const tot = l.reduce((t, x) => t + Number(x.amt || 0), 0);
    const txt = "🏆 " + dayCn(day) + " 预言家已发奖！\n" + l.map((x) => (KN[x.kind] || x.kind) + " " + x.name + " " + (x.forfeit ? "（3 天内没销毁创世名，放弃，奖金留池）" : (x.ail ? Number(x.ail).toFixed(4) + " AiLGNS" : x.amt + " DAI"))).join("\n") +
      "\n合计约 " + n0(tot) + " DAI，已直接转到获奖人钱包，链上可查。\n贡献王 = 每周本站 OTC 手续费前 3 名（须绑定 .ailgns 域名），周日晚揭晓直接发。下周就是你 💜";
    const w = await ensureWeek(kv), to = Object.keys(w.lv || {}).filter((a) => w.lv[a] >= 2);
    for (const a of to) await pushInbox(kv, a, "oracle", txt, "#/oracle").catch(() => {});
    const log = (await kv.get("ib:adminlog", "json")) || [];
    log.unshift({ t: Date.now(), to, msg: "【自动】" + txt.slice(0, 280), link: "#/oracle" });
    await kv.put("ib:adminlog", JSON.stringify(log.slice(0, 50)));
    sent.push(day + ":" + to.length);
  }
  return sent;
}
