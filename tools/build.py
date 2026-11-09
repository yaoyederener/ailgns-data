# -*- coding: utf-8 -*-
"""
🚀 秒开打包（站长 2026-11-09 拍板：客户反馈打开慢，33 个脚本 1.1 MB 每页全下）

  python3 tools/build.py

做什么：
  1. 读 index.src.html（源模板，33 个 <script> 原样列着）
  2. 把脚本分组：core（每页都要的）+ 若干按页面懒加载的小包；每个源文件外面包一层 try/catch，
     一个文件抛错不连累同包其它文件（brand.js 2026-11-08 事故的教训）
  3. 纯 Python 压缩（rjsmin / rcssmin，没装就不压缩只合并），文件名带内容哈希 ?v=h…，
     内容一变网址就变，永远不会撞上旧缓存（不用再手改版本号）
  4. 生成 dist/*.js、dist/style.css 和最终 index.html（只剩一个 <script src="dist/core.js?v=h…">）
     懒加载清单 window.AIL_BUNDLES 写在 core.js 开头（CSP 不许内联脚本）

改了任何 .js / style.css / index.src.html 之后都要重新 build；.git/hooks/pre-commit 会自动跑。
源码还是原来的文件，照常编辑；dist/ 是生成物，别手改。
"""
import hashlib, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# 分组：顺序 = 原 index 里的加载顺序（必须保持；A.start() 在 otc.js 末尾，menu.js 在它后面）
GROUPS = {
    "core":     ["brand.js", "app.js", "livek.js", "wallets.js", "treemap.js", "member.js", "chat.js", "nft.js",
                 "scan.js", "rank.js", "inbox.js", "otc.js", "menu.js"],
    "names":    ["names.js", "names-batch.js", "genesis.js"],
    "kchart":   ["kchart.js"],
    "oracle":   ["oracle.js"],
    "trade":    ["trade.js"],
    "lend":     ["lend.js"],
    "lp":       ["lp.js"],
    "feedback": ["feedback.js"],
    "games":    ["pixel.js", "games.js", "farm.js"],
    "misc":     ["trades.js", "arb.js", "updates.js", "orders.js", "med.js", "partner.js", "ops.js", "square.js"],
}

try:
    import rjsmin, rcssmin
    def minjs(s): return rjsmin.jsmin(s)
    def mincss(s): return rcssmin.cssmin(s)
    MIN = True
except ImportError:
    def minjs(s): return s
    def mincss(s): return s
    MIN = False

def read(p): return io.open(p, encoding="utf-8").read()
def write(p, s):
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)
def h(s): return "h" + hashlib.sha1(s.encode("utf-8")).hexdigest()[:10]

def wrap(f):
    src = read(f)
    # 每个源文件独立 try/catch：顶层抛错只影响它自己，不把同包后面的文件一起拖死
    return "try{\n" + src + "\n}catch(e){console.error('[bundle] " + f + "',e);}"

def syntax_check():
    """服务端 lib/ 和 functions/ 过一遍 JS 语法（esprima，纯 Python）。2026-11-09 事故：一行注释吞掉大括号，
    Cloudflare 编译 Functions 失败、自动重跑旧构建把生产顶回早上的版本。esprima 不认 BigInt 字面量（123n），检查前先把 n 后缀去掉。"""
    try:
        import esprima
    except ImportError:
        print("（没装 esprima，跳过语法检查：pip3 install --user esprima）"); return
    import glob, re
    bad = []
    for f in sorted(glob.glob("lib/*.js") + glob.glob("functions/**/*.js", recursive=True)):
        src = re.sub(r"\b(0[xX][0-9a-fA-F]+|\d+)n\b", r"\1", read(f))  # 十进制 / 十六进制 BigInt 都去掉 n
        try: esprima.parseModule(src)
        except Exception as e: bad.append("%s: %s" % (f, str(e)[:160]))
    if bad: sys.exit("❌ 服务端 JS 语法错误（推上去 Cloudflare 一定构建失败）：\n  " + "\n  ".join(bad))
    # 前端源文件也查（2026-11-10 盘口事故：行尾注释写在代码中间，吞掉后半行，整个包语法错、页面卡死；try/catch 包不住语法错误）
    for f in sorted(glob.glob("*.js")):
        src = re.sub(r"\b(0[xX][0-9a-fA-F]+|\d+)n\b", r"\1", read(f))
        try: esprima.parseScript(src)
        except Exception as e: bad.append("%s: %s" % (f, str(e)[:160]))
    if bad: sys.exit("❌ 前端 JS 语法错误（上线后这一页会卡死）：\n  " + "\n  ".join(bad))
    print("syntax ok: lib/ + functions/ + 前端 *.js")

def main():
    syntax_check()
    src = read("index.src.html")
    listed = re.findall(r'<script src="([^"?]+)[^"]*"></script>', src)
    grouped = [f for g in GROUPS.values() for f in g]
    missing = [f for f in listed if f not in grouped]
    extra = [f for f in grouped if f not in listed]
    if missing or extra:
        sys.exit("分组和 index.src.html 对不上：index 里多了 %s；分组里多了 %s" % (missing, extra))
    if len(set(grouped)) != len(grouped):
        sys.exit("有文件分进了两个组")

    out = {}
    manifest = {}
    for g, files in GROUPS.items():
        if g == "core": continue
        js = minjs("\n;\n".join(wrap(f) for f in files))
        name = "dist/%s.js" % g
        out[name] = js
        manifest[g] = name + "?v=" + h(js)
    core = "window.AIL_BUNDLES=" + json.dumps(manifest, separators=(",", ":")) + ";\n" + \
           minjs("\n;\n".join(wrap(f) for f in GROUPS["core"]))
    out["dist/core.js"] = core
    core_url = "dist/core.js?v=" + h(core)
    css = mincss(read("style.css"))
    out["dist/style.css"] = css
    css_url = "dist/style.css?v=" + h(css)

    # 清掉旧生成物，写新的
    if os.path.isdir("dist"):
        for f in os.listdir("dist"):
            if f.endswith((".js", ".css")) and ("dist/" + f) not in out: os.remove("dist/" + f)
    for p, s in out.items(): write(p, s)

    # index.html：第一个脚本标签换成 core 包，其余脚本标签删掉；样式表换成压缩版
    html = src
    first = True
    def repl(m):
        nonlocal first
        if first:
            first = False
            return '<script src="%s"></script>' % core_url
        return ""
    html = re.sub(r'<script src="[^"]+\.js[^"]*"></script>\n?', lambda m: repl(m) + ("\n" if m.group(0).endswith("\n") and not first else ""), html)
    html = re.sub(r'<script src="dist/core\.js[^"]*"></script>\n*', '<script src="%s"></script>\n' % core_url, html, count=1)
    n = html.count('href="style.css')
    if n != 1: sys.exit("index.src.html 里 style.css 引用数不是 1：%d" % n)
    html = re.sub(r'href="style\.css[^"]*"', 'href="%s"' % css_url, html)
    html = html.replace("<!doctype html>", "<!doctype html>\n<!-- 由 tools/build.py 从 index.src.html 生成，别直接改这个文件 -->", 1)
    write("index.html", html)

    total_src = sum(os.path.getsize(f) for f in grouped)
    print("minify:", "on" if MIN else "OFF (pip install --user rjsmin rcssmin)")
    print("source js %d KB -> core %d KB + lazy %d KB; css %d KB -> %d KB" % (
        total_src // 1024, len(core.encode("utf-8")) // 1024,
        sum(len(v.encode("utf-8")) for k, v in out.items() if k.startswith("dist/") and k.endswith(".js") and k != "dist/core.js") // 1024,
        os.path.getsize("style.css") // 1024, len(css.encode("utf-8")) // 1024))
    for k, v in sorted(out.items()): print("  %-18s %6d KB" % (k, len(v.encode("utf-8")) // 1024))
    print("core:", core_url, "\ncss: ", css_url)

if __name__ == "__main__":
    main()
