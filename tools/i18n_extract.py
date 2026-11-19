#!/usr/bin/env python3
"""🇬🇧 把全站写在代码里的中文一段一段抠出来（给英文版翻译用）。站长 2026-11-19：英文翻完再上线。

页面上的字都是代码里的字符串拼出来的：'<p>共 ' + n + ' 张</p>'。这里把每个字符串按 HTML 标签、换行切开，
得到页面上会原样出现的「一段」（'共 '、' 张'），lang.js 在英文版里见到这一段就换成译文——整句的直接整句换，
带变量的就一段一段换。输出 i18n/_frags.json：{文件: [一段, …]}（按代码里的先后顺序，全站去重）。
"""
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CJK = re.compile(r"[\u4e00-\u9fff]")
# 只有站长自己看的内部页面不翻
SKIP = {"lang.js", "lang-hant.js", "sw.js", "ops.js", "orders.js", "arb.js"}
CLIENT = [f for f in sorted(glob.glob("*.js")) if f not in SKIP]
# 服务器那头只取「会原样显示在客户页面上」的：内部文档、给群 / 站长的通知、给 AI 的提示词、敏感词表都不要
NO_LIB = {"chatbot.js", "alert.js", "opsdoc.js", "todo.js", "sitemap.js", "rules-auto.js", "ornotify.js", "triage.js", "ban.js", "adminstats.js", "reviewers.js"}
NO_API = {"chat.js", "debox-hook.js", "otc-watch.js", "ops-watch.js", "daily-stats.js", "name-ideas.js", "name-ai.js", "loan-watch.js", "chat-log.js", "notify-owner.js", "err.js"}
SERVER = [f for f in sorted(glob.glob("lib/*.js")) if os.path.basename(f) not in NO_LIB] + \
         [f for f in sorted(glob.glob("functions/api/*.js")) if os.path.basename(f) not in NO_API]
VAR = re.compile(r"[^\s，。、：:；;（）()「」《》<>\"'=/|·,!！?？]+\.ailgns|0x[0-9a-fA-F]{4,}(?:[….]+[0-9a-fA-F]+)?|\d[\d,]*(?:\.\d+)?", re.I)


def norm(t):
    """和 lang.js 里查词典前的处理一样：数字 / 地址 / 名字换成 {0}{1}…"""
    n = [0]
    def f(m):
        n[0] += 1
        return "{%d}" % (n[0] - 1)
    return VAR.sub(f, t)
ATTR = re.compile(r'(?:title|placeholder|aria-label|alt|data-l|data-tip|value)=\\?["\']([^"\'<>]*[\u4e00-\u9fff][^"\'<>]*)')


def literals(src):
    """粗略的 JS 词法：跳过注释，取出字符串（单引号、双引号、反引号；反引号里按 ${} 切开）"""
    out, i, n = [], 0, len(src)
    prev_sig = ""
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i); i = n if j < 0 else j; continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2); i = n if j < 0 else j + 2; continue
        if c == "/" and prev_sig in "(,=:[!&|?{};\n" :  # 正则
            j = i + 1; incls = False
            while j < n and (src[j] != "/" or incls) and src[j] != "\n":
                if src[j] == "\\": j += 1
                elif src[j] == "[": incls = True
                elif src[j] == "]": incls = False
                j += 1
            i = j + 1; prev_sig = "/"; continue
        if c in "'\"":
            j = i + 1; buf = []
            while j < n and src[j] != c and src[j] != "\n":
                if src[j] == "\\" and j + 1 < n: buf.append(src[j:j + 2]); j += 2
                else: buf.append(src[j]); j += 1
            out.append("".join(buf)); i = j + 1; prev_sig = c; continue
        if c == "`":
            j = i + 1; buf = []; depth = 0
            while j < n and (src[j] != "`" or depth):
                if src[j] == "\\" and j + 1 < n: buf.append(src[j:j + 2]); j += 2; continue
                if src[j] == "$" and j + 1 < n and src[j + 1] == "{" and not depth:
                    out.append("".join(buf)); buf = []; depth = 1; j += 2; continue
                if depth:
                    if src[j] == "{": depth += 1
                    elif src[j] == "}": depth -= 1
                    j += 1; continue
                buf.append(src[j]); j += 1
            out.append("".join(buf)); i = j + 1; prev_sig = "`"; continue
        if not c.isspace(): prev_sig = c
        elif c == "\n" and prev_sig not in ")]}'\"`" and not prev_sig.isalnum(): prev_sig = "\n"
        i += 1
    return out


def unesc(s):
    s = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)
    s = s.replace("\\n", "\n").replace("\\t", " ").replace("\\'", "'").replace('\\"', '"').replace("\\/", "/").replace("\\\\", "\\")
    return s


def pieces(lit):
    res = [m.group(1) for m in ATTR.finditer(lit)]
    t = re.sub(r"<[^<>]*>", "\n", lit)
    # 被拼接切断的半个标签：'">文字' 前半截、'文字<a href="' 后半截
    k = t.find(">")
    if k >= 0 and "<" not in t[:k] and not CJK.search(t[:k]): t = t[k + 1:]
    k = t.rfind("<")
    if k >= 0 and ">" not in t[k:] : t = t[:k]
    for p in t.split("\n"):
        res.append(p)
    out = []
    for p in res:
        p = html.unescape(p).replace("\u00a0", " ").strip()
        if p and CJK.search(p): out.append(p)
    return out


def main():
    seen, by = set(), {}
    done = set()   # 已经整句翻过的（i18n/en/*.json）
    for fp in glob.glob("i18n/en/*.json"):
        done |= set(json.load(open(fp, encoding="utf-8")))
    files = CLIENT + SERVER + ["index.src.html", "app.html"]
    for f in files:
        if not os.path.exists(f): continue
        src = open(f, encoding="utf-8", errors="ignore").read()
        if f == "chat.js":  # 客服问答里的 k: [...] 是用来对上客户问题的关键词，不显示，不用翻
            src = re.sub(r"\bk:\s*\[[^\]]*\]", "k: []", src)
        if f.endswith(".html"):
            body = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->", "", src)
            lits = [body]
        else:
            lits = [unesc(x) for x in literals(src)]
        got = []
        for lit in lits:
            if not CJK.search(lit): continue
            for p in pieces(lit):
                if p not in seen:
                    seen.add(p)
                    if p not in done and norm(p) not in done: got.append(p)
        if got: by[f] = got
    os.makedirs("i18n", exist_ok=True)
    json.dump(by, open("i18n/_frags.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    tot = sum(len(v) for v in by.values()); ch = sum(len(p) for v in by.values() for p in v)
    print("共 %d 段、%d 字" % (tot, ch))
    for f, v in sorted(by.items(), key=lambda x: -sum(len(p) for p in x[1])):
        print("  %-28s %5d 段 %6d 字" % (f, len(v), sum(len(p) for p in v)))


if __name__ == "__main__":
    main()
