// 上线后体检（.github/workflows/after-deploy.yml 调用）：无头浏览器按手机宽度把主要页面走一遍，
// 抓三样：程序报错（代码写错才会有的那种）、核心页面白屏、本站脚本/样式加载失败。
// 网络慢、接口 5xx、钱包没装这些不算程序错，只记成提醒，不会触发退回。
// 用法：BASE=https://ailgns.dev WANT_CORE=h1234abcd node tools/healthcheck.mjs   退出码 0=通过 1=不通过
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "").replace(/\/$/, "");
const TAG = process.env.TAG || BASE.replace(/^https?:\/\//, "");
const ROUTES = ["", "otc", "otc/lgns", "names", "oracle", "lend", "member", "rank", "farm", "scan", "inbox", "fast", "mj", "gd", "br",
  "trade", "feedback", "app", "updates", "genesis", "bonus", "aiswap", "lp", "square", "play", "weekly"];
const CORE_ROUTES = ["", "otc", "names", "oracle"]; // 这几页白屏直接算不通过
// 代码写错才会出现的报错
const PROGRAM = /TypeError|ReferenceError|SyntaxError|RangeError|is not defined|is not a function|is not iterable|Cannot read|Cannot set|undefined is not|null is not|Unexpected token|Invalid or unexpected/i;
// 网络、钱包、浏览器环境造成的，不算程序错
const NOISE = /Failed to fetch|Load failed|NetworkError|network error|ERR_|aborted|AbortError|timeout|timed out|ResizeObserver|No EVM wallet|is not valid JSON|JSON Parse|Unexpected end of (JSON|input|script)|Unexpected token '?<|ServiceWorker|service worker|play\(\) (failed|request)|NotAllowedError|user gesture/i;

const errs = [], warns = [], blank = [], badLoad = [];
let route = "(打开首页)";
const note = (m) => { m = String(m || "").slice(0, 300); if (!m) return; (PROGRAM.test(m) && !NOISE.test(m) ? errs : warns).push("#/" + route + " " + m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "zh-CN" });
const page = await ctx.newPage();
page.on("pageerror", (e) => note((e && (e.stack || e.message)) || e));
page.on("console", (m) => { if (m.type() === "error" && /Uncaught/.test(m.text())) note(m.text()); });
page.on("response", (r) => { const u = r.url(); if (u.startsWith(BASE) && /\.(js|css)(\?|$)/.test(u) && r.status() >= 400) badLoad.push(r.status() + " " + u.slice(BASE.length)); });
page.on("requestfailed", (r) => { const u = r.url(); if (u.startsWith(BASE) && /\/dist\/.*\.(js|css)(\?|$)/.test(u)) badLoad.push("失败 " + u.slice(BASE.length)); });

let core = "", opened = true;
try {
  const res = await page.goto(BASE + "/?hc=" + Date.now() + "#/", { waitUntil: "domcontentloaded", timeout: 45000 });
  if (!res || res.status() >= 400) { opened = false; errs.push("首页打不开：HTTP " + (res ? res.status() : "无响应")); }
} catch (e) { opened = false; errs.push("首页打不开：" + String(e.message || e).slice(0, 120)); }

if (opened) {
  await page.waitForTimeout(5000);
  core = await page.evaluate(() => { const s = document.querySelector('script[src*="core.js"]'); return s ? (s.src.split("v=")[1] || "") : ""; }).catch(() => "");
  for (const r of ROUTES) {
    route = r;
    try {
      await page.evaluate((h) => { location.hash = "#/" + h; }, r);
      await page.waitForTimeout(r === "" ? 1500 : 3500);
      const len = await page.evaluate(() => { const m = document.querySelector("main") || document.body; return (m.innerText || "").replace(/\s+/g, "").length; });
      if (len < 20) blank.push("#/" + r + "（只有 " + len + " 个字）");
    } catch (e) { warns.push("#/" + r + " 走不动：" + String(e.message || e).slice(0, 120)); }
  }
  route = "(收尾)";
  await page.waitForTimeout(2000);
}
await browser.close();

const uniq = (a) => [...new Set(a)];
const E = uniq(errs), W = uniq(warns), L = uniq(badLoad), B = uniq(blank);
const coreBlank = B.filter((b) => CORE_ROUTES.some((c) => b.startsWith("#/" + c + "（")));
const wrongVer = process.env.WANT_CORE && core && core !== process.env.WANT_CORE ? ["页面用的版本是 " + core + "，不是刚上线的 " + process.env.WANT_CORE] : [];
const fail = E.length > 0 || L.length > 0 || coreBlank.length > 0;
const lines = [
  (fail ? "❌ 不通过" : "✅ 通过") + " · " + TAG + " · 版本 " + (core || "?") + " · 走了 " + ROUTES.length + " 页",
  E.length ? "程序报错 " + E.length + " 条：\n- " + E.slice(0, 12).join("\n- ") : "程序报错：0",
  L.length ? "脚本/样式加载失败：\n- " + L.slice(0, 8).join("\n- ") : "脚本/样式加载失败：0",
  B.length ? "白屏的页面：" + B.join("、") : "白屏的页面：0",
  wrongVer.length ? "提醒：" + wrongVer[0] : "",
  W.length ? "提醒（不算程序错，" + W.length + " 条）：\n- " + W.slice(0, 8).join("\n- ") : "",
].filter(Boolean);
const text = lines.join("\n");
console.log(text);
// GitHub 的批注：不登录也能从公开接口读到
const enc = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
console.log("::" + (fail ? "error" : "notice") + " title=体检 " + TAG + "::" + enc(text.slice(0, 3500)));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### 体检 " + TAG + "\n\n```\n" + text + "\n```\n");
if (process.env.HC_OUT) fs.writeFileSync(process.env.HC_OUT, JSON.stringify({ fail, core, text: text.slice(0, 900) }));
process.exit(fail ? 1 : 0);
