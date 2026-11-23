// 群播报里的「催领奖」一段（站长 2026-11-23：催中奖的人及时领奖，所有奖都算）
// 只列还要中奖人自己动手的：等销毁（wait）、等上传（say）；等审核、等机器人转账的不催。
// 输入是 /api/oracle 和 /api/weekly 公开返回的 pays（页面上本来就公示的名字和状态），这里不读别的东西。
const bare = (n) => String(n || "").replace(/\.(ailgns|lgns)$/, "");
const bjMD = (t) => { const d = new Date(t + 8 * 3600e3); return (d.getUTCMonth() + 1) + "-" + d.getUTCDate() + " " + d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
const SHOW = 6; // 一种奖最多点 6 个名字，多的写「等 N 人」
function line(title, link, pays, now) {
  const todo = (Array.isArray(pays) ? pays : []).filter((x) => x && (x.st === "wait" || x.st === "say") && x.name);
  const names = [...new Set(todo.map((x) => bare(x.name)))];
  if (!names.length) return "";
  const dues = todo.map((x) => Number(x.due) || 0).filter((t) => t > now).sort((a, b) => a - b);
  return "· " + title + "：" + names.slice(0, SHOW).join("、") + (names.length > SHOW ? " 等 " + names.length + " 人" : "") +
    (dues.length ? "（" + bjMD(dues[0]) + " 截止）" : "") + " 👉 " + link;
}
export function claimLines(orPays, wkPays, now = Date.now()) {
  const ls = [
    line("每日预言家", "https://ailgns.dev/#/oracle", orPays, now),
    line("OTC 手续费周榜", "https://ailgns.dev/#/weekly", wkPays, now),
  ].filter(Boolean);
  return ls.length ? ["🎁 中奖还没领的朋友请尽快领奖，过期算放弃："].concat(ls) : [];
}
