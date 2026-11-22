// 📮 工单分诊（站长 2026-11-05 定）：AI 先审一遍，无效的忽略，有效的按轻重缓急分级，同一问题多人反复问的升级
// 级别：0 资金/合约安全（钱没到、被多扣、合约异常、疑似诈骗、私钥泄露）→ 立刻通知、每分钟提醒
//       1 交易故障（挂单/撤单/成交/借贷/注册 做不了、页面报错挡住操作）或 多人反复问同一问题 → 立刻通知、5 分钟提醒
//       2 一般功能/显示问题 → 30 分钟提醒
//       3 咨询 / 建议 / 夸奖 → 机器人先用知识库初步答复，每天汇总一次
// 无效（ok=false）：空话、测试、广告、辱骂、纯表情、和本站无关 → 不提醒、后台归到「无效」栏，可一键恢复
import { KNOWLEDGE } from "./chatbot.js";
const LV = { 0: "🚨 资金安全", 1: "🔴 交易故障", 2: "🟠 功能问题", 3: "🟢 咨询建议" };
export const LV_NAME = LV;
const PROMPT = `你是 AiLGNS 服务站的工单分诊员。根据客户提交的工单文字（可能还有截图数量）输出一个 JSON，不要任何其它文字：
{"ok":true或false,"lv":0到3,"cat":"资金安全|交易故障|功能问题|咨询|建议|其他","topic":"不超过 8 个字的问题主题","why":"一句话说明分级理由","reply":"仅当 lv 为 3 时，给客户的初步答复（3 句以内，依据下面的知识库，不确定就说会由人工跟进）；其它情况为空字符串"}
规则：
- ok=false：空话、测试（如“测试”“111”）、广告、辱骂、纯表情、和本站/AiLGNS 完全无关。只有截图没有文字的算 ok=true、lv=2。
- lv=0：钱没到账、被多扣、重复扣款、退款、合约异常、怀疑被骗、私钥/助记词泄露、账户被盗。宁可高估。
- lv=1：挂单/撤单/成交/借贷/还款/域名注册/付款 做不了或卡住、页面报错挡住操作、显示的余额或订单和链上明显不一致。
- lv=2：一般功能异常、显示错误、体验问题、手机适配、找不到入口。
- lv=3：怎么用、规则咨询、建议、夸奖、合作意向。
- cat 和 lv 对应：0→资金安全，1→交易故障，2→功能问题，3→咨询/建议/其他。
知识库（用于 reply）：\n`;
/* 🔧 2026-11-22 修：11-17 起大部分工单都「AI 分诊失败」。原因：客户在大陆 / 香港时 Claude 用不了（服务商不支持这两地，和客服同一个情况），后备的 Workers AI 也没答成。
   改成和客服一样：大陆 / 香港的客户（cc = CN / HK）直接问 DeepSeek，其它地区照旧 Claude；Claude 没答成也再问一次 DeepSeek。没配 DeepSeek 密钥时这段不生效。
   err 记下每一家为什么没答成（只进工单后台，方便以后查）。 */
async function askDeepseek(env, sys, user) {
  const r = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { authorization: "Bearer " + env.DEEPSEEK_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ model: env.DEEPSEEK_MODEL || "deepseek-flash", max_tokens: 400, temperature: 0, stream: false, thinking: { type: "disabled" }, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }) });
  if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json(), c = (j.choices || [])[0] || {};
  return String((c.message && c.message.content) || "");
}
export async function triage(env, txt, nImgs, cc) {
  const user = "工单文字：" + (txt || "（无）") + "\n截图数量：" + (nImgs || 0);
  let raw = ""; const err = [];
  const cnhk = cc === "CN" || cc === "HK", ds = !!env.DEEPSEEK_API_KEY;
  if (cnhk && ds) { try { raw = await askDeepseek(env, PROMPT + KNOWLEDGE.slice(0, 6000), user); if (!raw) err.push("deepseek 空"); } catch (e) { raw = ""; err.push("deepseek " + String((e && e.message) || e).slice(0, 30)); } }
  if (!raw && env.ANTHROPIC_API_KEY && !cnhk) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-haiku-5-5", max_tokens: 400, system: PROMPT + KNOWLEDGE.slice(0, 6000), messages: [{ role: "user", content: user }] }) });
      if (r.ok) { const j = await r.json(); raw = (j.content || []).map((c) => c.text || "").join(""); } else err.push("claude " + r.status);
    } catch (e) { raw = ""; err.push("claude 出错"); }
    if (!raw && ds) { try { raw = await askDeepseek(env, PROMPT + KNOWLEDGE.slice(0, 6000), user); if (!raw) err.push("deepseek 空"); } catch (e) { raw = ""; err.push("deepseek " + String((e && e.message) || e).slice(0, 30)); } }
  }
  if (!raw && env.AI) {
    try { const r = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "system", content: PROMPT + KNOWLEDGE.slice(0, 4000) }, { role: "user", content: user }], max_tokens: 400 }); raw = String((r && r.response) || ""); if (!raw) err.push("workers-ai 空"); } catch (e) { raw = ""; err.push("workers-ai 出错"); }
  }
  let o = null;
  try { const m = raw.match(/\{[\s\S]*\}/); o = m ? JSON.parse(m[0]) : null; } catch (e) { o = null; }
  if (!o) return { ok: true, lv: 2, cat: "功能问题", topic: "未分类", why: "AI 分诊失败，按一般问题处理", reply: "", ai: false, err: (err.join("；") || (raw ? "回答不是 JSON" : "没有可用的 AI")).slice(0, 80) };
  const lv = Math.min(3, Math.max(0, Number(o.lv) || 0));
  // 关键词兜底：涉及钱的一律不低于 0 级判断
  const money = /没到账|未到账|扣了|多扣|重复扣|退款|被骗|诈骗|盗|私钥|助记词|丢了|不见了|少了/.test(txt || "");
  return { ok: o.ok !== false || money, lv: money ? 0 : lv, cat: String(o.cat || "").slice(0, 8), topic: String(o.topic || "").slice(0, 12), why: String(o.why || "").slice(0, 80), reply: lv === 3 ? String(o.reply || "").slice(0, 400) : "", ai: true };
}
