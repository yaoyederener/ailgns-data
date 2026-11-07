#!/usr/bin/env node
// 🗺️ 客服知识「网站地图」生成器：从网站自己的代码里抽出每个页面是干嘛的、在哪、有哪些步骤、菜单里有什么，
// 写成 lib/sitemap.js 喂给客服机器人。每次上线前跑一次（开发提交前手动跑），网站改了客服就同步。
//   node tools/gen-sitemap.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
function literal(src, startMark, endMark) {
  const i = src.indexOf(startMark); if (i < 0) throw new Error("找不到 " + startMark);
  const j = src.indexOf(endMark, i); if (j < 0) throw new Error("找不到结尾 " + endMark);
  const close = Math.max(endMark.lastIndexOf("}"), endMark.lastIndexOf("]")); const body = src.slice(i + startMark.length, j + close + 1); // 截到结尾标记里的 } 或 ] 为止
  return new Function("return (" + body + ")")(); // 只有字符串和数组，没有代码
}
const app = read("app.js"), menu = read("menu.js");
const GUIDES = literal(app, "var GUIDES = ", "\n  };");
const TITLES = literal(app, "var PAGE_TITLES = ", "};\n");
const GROUPS = literal(menu, "var GROUPS = ", "\n  ];");
const strip = (s) => String(s).replace(/<[^>]+>/g, "").trim();
const stepName = (s) => { const t = String(s[1] || ""); return strip(s[0]) + (t.startsWith("#/") ? "（跳到 " + t + "）" : ""); };
const TOP = { otc: "OTC", names: "域名", oracle: "预言家", lend: "借贷", member: "会员", rank: "荣耀榜" };
let out = "【网站地图（从网站代码自动生成，每次上线同步）】\n";
out += "顶部 6 个栏目：" + Object.keys(TOP).map((k) => TOP[k] + "（#/" + k + "）").join("、") + "。左上角 ☰「更多」菜单里是其余功能。\n";
out += "每个页面最上面都有一张引导卡，写着这页是干嘛的和编号步骤，客户点步骤名就跳到对应位置：\n";
for (const [k, g] of Object.entries(GUIDES)) {
  out += "- " + strip(g[1]) + "（网址 ailgns.dev/#/" + k + (TOP[k] ? "，顶部「" + TOP[k] + "」" : "") + "）：" + strip(g[2]) + "。步骤：" + (g[3] || []).map(stepName).join(" → ") + "\n";
}
out += "☰ 更多菜单（分组 → 功能 → 网址）：\n";
for (const [name, , items] of GROUPS) {
  out += "- " + name + "：" + items.map((x) => strip(x[1]) + (x[0].startsWith("#/") ? "（" + "ailgns.dev/" + x[0] + "）" : x[0] === "#group" ? "（弹出群二维码）" : "")).join("；") + "\n";
}
out += "其他页面标题：" + Object.entries(TITLES).filter(([k]) => !GUIDES[k]).map(([k, v]) => strip(v) + "（#/" + k + "）").join("、") + "\n";
// App 安装向导：wallets.js 里每种手机 / 浏览器一条（name + note）
const wal = read("wallets.js"), guides = [];
for (const m of wal.matchAll(/name: "([^"]+)", dev: "([^"]+)", note: "([^"]*)"/g)) guides.push("  · " + m[1] + "：" + strip(m[3].replace(/<br>/g, " ")));
out += "【App 安装（网址 ailgns.dev/#/app，页面会自动认出手机和浏览器并一步步带着点）】不是应用商店的 App，是把网站加到桌面：不下载安装包、不要权限、自动更新。各手机的按钮名：\n" + guides.join("\n") + "\n  · 电脑 Chrome / Edge：地址栏右边有「安装」图标，点一下。\n";
out += "回答「在哪 / 怎么进」类问题时：先给栏目或菜单路径，再给网址，再给步骤名；网站地图里有的功能一律不能说「不知道」。";
const file = "// 自动生成，别手改：node tools/gen-sitemap.js（开发提交前跑）\nexport const SITEMAP = " + JSON.stringify(out) + ";\n";
fs.writeFileSync(path.join(root, "lib/sitemap.js"), file);
console.log("lib/sitemap.js 已生成：" + out.length + " 字，" + Object.keys(GUIDES).length + " 个引导页，" + GROUPS.reduce((n, g) => n + g[2].length, 0) + " 个菜单项");
