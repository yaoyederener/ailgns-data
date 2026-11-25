// 🤖 AI 资讯（#/ainews，站长 2026-11-25：「做一个滚动的 AI 资讯板块，放更多栏目里，不放 OTC 首页」）
//   · 每小时抓一次公开的资讯订阅源（RSS），只留「标题 + 来源 + 时间 + 原文链接」，不搬正文（版权）
//   · 带政治、荐币、喊单字眼的一律不进
//   · 英文标题让 DeepSeek 翻成一句中文（有密钥才翻；翻过的记住，不重复花钱）；没翻成就显示原文
//   · 秒开：先给存着的，超过 1 小时在后台重抓（[[feedback-speed-cache-first]]）。没有 X（推特）：它的接口要付费、抓取违反它的规则、大陆也打不开
const KEY = "ainews:v1", FRESH = 3600e3, KEEP_DAYS = 4, PER = 8, MAX = 40;
// 站长 2026-11-25：「不想采集中国的媒体，也不想播放中国的信息，除非中国拿出真正的大模型产品」
//   → 来源只留国外的；标题讲中国的不进，除非标题里点了名的大模型产品（CN_MODEL）
const SRC = [
  { s: "OpenAI", u: "https://openai.com/news/rss.xml", all: 1, en: 1 },
  { s: "Google", u: "https://blog.google/technology/ai/rss/", all: 1, en: 1 },
  { s: "Google DeepMind", u: "https://deepmind.google/blog/rss.xml", all: 1, en: 1 },
  { s: "TechCrunch", u: "https://techcrunch.com/category/artificial-intelligence/feed/", all: 1, en: 1 },
  { s: "The Verge", u: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", all: 1, en: 1 },
  { s: "Ars Technica", u: "https://arstechnica.com/ai/feed/", all: 1, en: 1 },
  { s: "WIRED", u: "https://www.wired.com/feed/tag/ai/latest/rss", all: 1, en: 1 },
  { s: "MIT Technology Review", u: "https://www.technologyreview.com/topic/artificial-intelligence/feed", all: 1, en: 1 },
  { s: "The Decoder", u: "https://the-decoder.com/feed/", all: 1, en: 1 },
];
const CN = /\bChina\b|\bChinese\b|Beijing|Shanghai|Shenzhen|Hong Kong|Huawei|Alibaba|Baidu|Tencent|ByteDance|TikTok|Xiaomi|SMIC|中国|国产|北京|华为|阿里|百度|腾讯|字节/i;
const CN_MODEL = /DeepSeek|Qwen|Kimi|Doubao|Ernie|Hunyuan|GLM-|MiniMax|Kling|Seedance|Seedream/i;
const IS_AI = /(^|[^A-Za-z])(AI|AGI|LLM|GPT|GPU)([^A-Za-z]|$)|人工智能|大模型|模型|智能体|机器人|OpenAI|ChatGPT|Claude|Anthropic|Gemini|DeepSeek|Copilot|Sora|通义|文心|豆包|Kimi|混元|机器学习|神经网络|自动驾驶|算力|英伟达|NVIDIA|具身|AIGC/i;
const BAD = /习近平|总书记|政治|台独|港独|藏独|疆独|法轮|六四|天安门|抗议|示威|战争|军事|导弹|制裁|选举|大选|特朗普|川普|拜登|普京|白宫|以色列|巴勒斯坦|乌克兰|色情|裸|赌|博彩|百倍|千倍|暴富|喊单|空投|炒币|带单|Trump|Biden|White House|election|\bwar\b|porn|casino|gambl/i;

const ent = (s) => s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const clean = (s) => ent(ent(String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const tag = (x, names) => { for (const n of names) { const m = x.match(new RegExp("<" + n + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + n + ">", "i")); if (m) return m[1]; } return ""; };

export function parseFeed(xml, src) {
  const out = [], re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi; let m;
  while ((m = re.exec(xml)) && out.length < 400) {
    const x = m[0], t = clean(tag(x, ["title"]));
    let u = clean(tag(x, ["link"]));
    if (!u) { const a = x.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || x.match(/<link[^>]*href=["']([^"']+)["']/i); u = a ? ent(a[1]) : ""; }
    const ts = Date.parse(clean(tag(x, ["pubDate", "published", "updated", "dc:date"]))) || 0;
    if (!t || t.length < 6 || t.length > 160 || !/^https:\/\//.test(u) || !ts) continue;
    if (!src.all && !IS_AI.test(t)) continue;
    if (BAD.test(t)) continue;
    if (CN.test(t) && !CN_MODEL.test(t)) continue;
    out.push({ t, u, s: src.s, ts, en: src.en ? 1 : 0 });
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, PER);
}

async function grab(src) {
  try {
    const r = await fetch(src.u, { headers: { "user-agent": "Mozilla/5.0 (compatible; newsreader)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: 600 } });
    if (!r.ok) return [];
    return parseFeed(await r.text(), src);
  } catch (e) { return []; }
}

// 英文标题 → 一句中文。一次问完，回来按编号对上；对不上的就留原文
async function translate(env, titles) {
  if (!env.DEEPSEEK_API_KEY || !titles.length) return {};
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { authorization: "Bearer " + env.DEEPSEEK_API_KEY, "content-type": "application/json" }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ model: env.DEEPSEEK_MODEL || "deepseek-flash", max_tokens: 3000, temperature: 0.2, stream: false, thinking: { type: "disabled" },
        messages: [{ role: "system", content: "你是科技新闻编辑。把下面每条英文新闻标题翻成一句通顺的简体中文标题：忠实原意，不添加原文没有的信息，不加评论，公司和产品名保留英文。按原编号每行输出一条，格式「编号. 中文标题」，不要输出别的。" },
          { role: "user", content: titles.map((t, i) => (i + 1) + ". " + t).join("\n") }] }) });
    if (!r.ok) return {};
    const j = await r.json(), txt = String((((j.choices || [])[0] || {}).message || {}).content || ""), out = {};
    txt.split("\n").forEach((line) => { const m = line.match(/^\s*(\d+)[.、．)]\s*(.+)$/); if (m) { const i = +m[1] - 1, z = m[2].trim(); if (titles[i] && z.length >= 4 && z.length <= 120 && !BAD.test(z) && !(CN.test(z) && !CN_MODEL.test(z))) out[titles[i]] = z; } });
    return out;
  } catch (e) { return {}; }
}

async function build(env, old) {
  const got = (await Promise.all(SRC.map(grab))).flat();
  const seen = {}, now = Date.now();
  let list = got.filter((x) => { const k = x.t.toLowerCase(); if (seen[k] || seen[x.u]) return false; seen[k] = seen[x.u] = 1; return x.ts > now - KEEP_DAYS * 864e5 && x.ts < now + 3600e3; })
    .sort((a, b) => b.ts - a.ts).slice(0, MAX);
  if (!list.length) return null;
  const tr = (old && old.tr) || {}, need = list.filter((x) => x.en && !tr[x.t]).map((x) => x.t);
  const add = await translate(env, need.slice(0, MAX));
  const keep = {};
  list = list.map((x) => { const o = { t: x.t, u: x.u, s: x.s, ts: x.ts }; if (x.en) { const z = add[x.t] || tr[x.t]; if (z) { keep[x.t] = z; o.o = x.t; o.t = z; } } return o; });
  return { at: now, list, tr: keep, ok: SRC.length };
}

const pub = (d) => Response.json({ at: d.at, list: d.list }, { headers: { "cache-control": "public, max-age=300" } });

export async function onRequestGet(ctx) {
  const kv = ctx.env && ctx.env.TEAM_KV, ck = new Request("https://ailgns.dev/__ainews");
  let old = null;
  try { old = kv && (await kv.get(KEY, "json")); } catch (e) {}
  const refresh = async () => { const d = await build(ctx.env, old); if (d && kv) await kv.put(KEY, JSON.stringify(d)).catch(() => {}); return d; };
  if (old && old.list && old.list.length) {
    if (Date.now() - old.at > FRESH) { // 同一时刻只让一个请求去重抓
      const lk = new Request("https://ailgns.dev/__ainews-lock");
      if (!(await caches.default.match(lk))) { ctx.waitUntil(caches.default.put(lk, new Response("1", { headers: { "cache-control": "public, max-age=300" } }))); ctx.waitUntil(refresh().catch(() => {})); }
    }
    return pub(old);
  }
  if (!kv) { // 预览站没有存储：用边缘缓存顶 10 分钟
    const hit = await caches.default.match(ck); if (hit) return hit;
  }
  const d = await refresh().catch(() => null);
  if (!d) return Response.json({ at: 0, list: [] }, { headers: { "cache-control": "no-store" } });
  const res = Response.json({ at: d.at, list: d.list }, { headers: { "cache-control": "public, max-age=600" } });
  if (!kv) ctx.waitUntil(caches.default.put(ck, res.clone()));
  return res;
}
