// 🤖 让 AI 出名字（批量注册用）：POST { desc, n } → { names: [...], ai, by }。只出便宜档（中文 3 字及以上 / 英文数字 5 位及以上 = 5 DAI/年），涉政的过滤掉
// 谁来想（站长 2026-11-21：「AI 选域名做得不够机智，要不要接 Claude 或 DeepSeek」）：
//   以前只有 Claude → 不行就退到 Workers AI 的小模型 → 再不行用固定吉利词库。可是大陆 / 香港的访客 Claude 不给用（服务商的地区规则，我们不绕），
//   他们其实一直在用小模型或词库，所以显得呆。现在：大陆 / 香港 → DeepSeek（在这两地合规可用，客服早就在用）；其它地区 → Claude，失败了再问 DeepSeek；
//   两个都没答上来才退到 Workers AI，最后才是词库。返回里的 by 写明这次是谁想的（claude / deepseek / llama / 词库），方便查。
//   带后台口令时可以用 engine 指定一个来试（只给站长测试用，客户的请求不认）。
import { banned } from "../../lib/ban.js";
const chars = (s) => Array.from(s).length, cn = (s) => /[一-鿿]/.test(s);
const valid = (s) => /^[a-z0-9一-鿿-]+$/.test(s) && chars(s) >= (cn(s) ? 2 : 3) && chars(s) <= 32 && s[0] !== "-" && s[s.length - 1] !== "-";
const cheap = (s) => cn(s) ? chars(s) >= 3 : chars(s) >= 5;
const keyOk = (env, k) => !!k && ((env.FEEDBACK_KEY && k === env.FEEDBACK_KEY) || (env.BACKUP_KEY && k === env.BACKUP_KEY));
// 客户没写要求时，每次换一个方向，免得点十次出来都是「好运来、发财树」
const THEMES = ["搞钱发财", "好运锦鲤", "霸气江湖", "可爱软萌", "幽默俏皮话", "网络流行语", "吃货美食", "动物萌宠", "数字谐音梗（如 168、520、888、1314）", "成语新编", "打工人日常", "诗意古风", "游戏电竞", "星座和运势", "英文或拼音加数字"];
export function sysOf(n, free) {
  const pick = () => THEMES[Math.floor(Math.random() * THEMES.length)];
  return "你是 .ailgns 域名起名高手，起的名字要让人一看就想注册。给出 " + n + " 个候选名字，只输出一个 JSON 数组，不要任何解释。" +
    "硬规则：中文名字至少 3 个汉字（不要 2 个字，2 个字价格贵）；英文 / 拼音 / 数字名字至少 5 位，只能用小写字母、数字、连字符；可以中文加数字混搭（如 稳稳发财888）；不要空格、不要点、不要后缀；不要涉政、不要真人姓名、不要脏话、不要生僻字；每个都不一样。" +
    "要机灵：短、顺口、有记忆点，3 到 6 个汉字最好，最多 8 个；风格要混搭，别千篇一律——吉利话、俏皮话、谐音梗、数字梗、成语新编、流行语、英文或拼音加数字都可以穿插；" +
    "不要一串名字都用「店、铺、屋、馆、站、坊、家、园」这类字结尾，也不要都是「好运、发财、吉祥」开头；别用太常见、肯定早被人注册的词（如 发财、好运来、恭喜发财），要有一点新意。" +
    (free ? "客户没提要求，这一批请围绕这三个方向自由发挥：" + pick() + "、" + pick() + "、" + pick() + "。" : "客户有描述时要紧扣他的行业、喜好、用途来起，别答非所问；描述很模糊就自由发挥，不要追问。") +
    "输出的第一个字符必须是 [，最后一个字符必须是 ]。";
}
async function askClaude(env, sys, user) {
  if (!env.ANTHROPIC_API_KEY) return "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-haiku-5-5", max_tokens: 700, system: sys, messages: [{ role: "user", content: user }] }) });
    if (!r.ok) return "";
    const j = await r.json(); return (j.content || []).map((c) => c.text || "").join("");
  } catch (e) { return ""; }
}
async function askDeepseek(env, sys, user) {
  if (!env.DEEPSEEK_API_KEY) return "";
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { authorization: "Bearer " + env.DEEPSEEK_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ model: env.DEEPSEEK_MODEL || "deepseek-flash", max_tokens: 700, temperature: 1.2, stream: false, thinking: { type: "disabled" }, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }) });
    if (!r.ok) return "";
    const j = await r.json(), c = (j.choices || [])[0] || {}; return String((c.message && c.message.content) || "");
  } catch (e) { return ""; }
}
async function askLlama(env, sys, user) {
  if (!env.AI) return "";
  try { const r = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "system", content: sys }, { role: "user", content: user }], max_tokens: 600 }); return String((r && r.response) || ""); } catch (e) { return ""; }
}
const ASK = { claude: askClaude, deepseek: askDeepseek, llama: askLlama };
// 纯计算：按地区排出先问谁。大陆 / 香港不问 Claude（它在这两地不提供服务）
export function orderOf(cc, hasDs) { return cc === "CN" || cc === "HK" ? (hasDs ? ["deepseek", "llama"] : ["llama"]) : ["claude", "deepseek", "llama"]; }
export async function onRequestPost(ctx) {
  const env = ctx.env;
  if (!env.AI && !env.ANTHROPIC_API_KEY && !env.DEEPSEEK_API_KEY) return Response.json({ error: "ai not bound" }, { status: 501 });
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  const desc = String(b.desc || "").trim().slice(0, 80), n = Math.min(Math.max(Number(b.n) || 20, 5), 40);
  if (desc.length < 1) return Response.json({ error: "先说说想要什么样的名字" }, { status: 400 });
  const free = /^随机生成/.test(desc) || /^(随机|随便|都行|不知道)$/.test(desc); // 页面上不填描述时发来的就是「随机生成：…」
  const sys = sysOf(n, free), user = free ? "请直接出一批。" : "客户描述：" + desc;
  const cc = String((ctx.request.cf && ctx.request.cf.country) || "").toUpperCase();
  const order = ASK[b.engine] && keyOk(env, b.key) ? [b.engine] : orderOf(cc, !!env.DEEPSEEK_API_KEY);
  let raw = "", by = "";
  for (const k of order) { raw = await ASK[k](env, sys, user); if (raw) { by = k; break; } }
  let arr = [];
  try { const m = raw.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : []; } catch (e) { arr = []; }
  // JSON 没解析出来（模型多说了话 / 截断）：按引号、逗号、顿号、换行拆
  if (!arr.length && raw) arr = raw.split(/[\s,，、"'“”\[\]{}:：]+/).filter((x) => x && !/^(json|names?)$/i.test(x));
  const names0 = [...new Set(arr.map((x) => String(x || "").trim().toLowerCase().replace(/\.(ailgns|lgns)$/, "")))].filter((s) => valid(s) && cheap(s) && !banned(s)).slice(0, n);
  // AI 还是没给够：本地吉利词库兜底，保证客户永远能拿到一批
  const names = names0.length >= Math.min(5, n) ? names0 : [...new Set(names0.concat(lucky(n * 2)))].slice(0, n);
  return Response.json({ names, ai: names0.length, by: names0.length >= Math.min(5, n) ? by : "词库" }, { headers: { "cache-control": "no-store" } });
}

const L1 = ["发财", "好运", "招财", "富贵", "吉祥", "鸿运", "财源", "福星", "旺旺", "金玉", "财运", "顺风", "大吉", "喜事", "平安", "如意", "兴旺", "红红", "福气", "牛气"];
const L2 = ["到家", "满堂", "滚滚", "亨通", "高照", "临门", "连连", "发发", "不断", "来了", "当头", "常在", "顺水", "大利", "多多", "满满", "冲天", "火火", "无边", "哄哄"];
function lucky(n) {
  const out = new Set(), tries = n * 20;
  for (let i = 0; i < tries && out.size < n; i++) {
    const s = L1[Math.floor(Math.random() * L1.length)] + L2[Math.floor(Math.random() * L2.length)];
    if (valid(s) && cheap(s) && !banned(s)) out.add(s);
  }
  return [...out];
}
