// 🤖 让 AI 出名字（批量注册用）：POST { desc, n } → { names: [...] }。只出便宜档（中文 3 字及以上 / 英文数字 5 位及以上 = 5 DAI/年），涉政的过滤掉
// 调用方式和工单分诊一样：有 ANTHROPIC_API_KEY 用 Claude，没有退回 Workers AI
import { banned } from "../../lib/ban.js";
const chars = (s) => Array.from(s).length, cn = (s) => /[一-鿿]/.test(s);
const valid = (s) => /^[a-z0-9一-鿿-]+$/.test(s) && chars(s) >= (cn(s) ? 2 : 3) && chars(s) <= 32 && s[0] !== "-" && s[s.length - 1] !== "-";
const cheap = (s) => cn(s) ? chars(s) >= 3 : chars(s) >= 5;
export async function onRequestPost(ctx) {
  const env = ctx.env;
  if (!env.AI && !env.ANTHROPIC_API_KEY) return Response.json({ error: "ai not bound" }, { status: 501 });
  let b = {}; try { b = await ctx.request.json(); } catch (e) {}
  const desc = String(b.desc || "").trim().slice(0, 80), n = Math.min(Math.max(Number(b.n) || 20, 5), 40);
  if (desc.length < 1) return Response.json({ error: "先说说想要什么样的名字" }, { status: 400 });
  const sys = "你是 .ailgns 域名起名助手。根据客户描述给出 " + n + " 个候选名字，只输出一个 JSON 数组，不要任何解释。规则：中文名字至少 3 个汉字（不要 2 个字，2 个字价格贵），英文/数字名字至少 5 位且只能用小写字母、数字、连字符；不要空格、不要点、不要后缀；好记、吉利、口语化，适合中国用户；不要涉政、不要人名、不要脏话；每个不一样。";
  let raw = "";
  if (env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-haiku-5-5", max_tokens: 600, system: sys, messages: [{ role: "user", content: "客户描述：" + desc }] }) });
      if (r.ok) { const j = await r.json(); raw = (j.content || []).map((c) => c.text || "").join(""); }
    } catch (e) { raw = ""; }
  }
  if (!raw && env.AI) {
    try { const r = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "system", content: sys }, { role: "user", content: "客户描述：" + desc }], max_tokens: 600 }); raw = String((r && r.response) || ""); } catch (e) { raw = ""; }
  }
  let arr = [];
  try { const m = raw.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : []; } catch (e) { arr = []; }
  const names = [...new Set(arr.map((x) => String(x || "").trim().toLowerCase().replace(/\.(ailgns|lgns)$/, "")))].filter((s) => valid(s) && cheap(s) && !banned(s)).slice(0, n);
  return Response.json({ names }, { headers: { "cache-control": "no-store" } });
}
