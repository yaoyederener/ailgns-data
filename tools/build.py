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
    "core":     ["net.js", "brand.js", "app.js", "livek.js", "wallets.js", "treemap.js", "member.js", "chat.js", "nft.js",
                 "scan.js", "rank.js", "inbox.js", "otc.js", "menu.js"],
    "names":    ["names.js", "names-batch.js", "genesis.js"],
    "kchart":   ["kchart.js"],
    "oracle":   ["oracle.js"],
    "trade":    ["trade.js"],
    "lend":     ["lend.js"],
    "lp":       ["lp.js"],
    "aiswap":   ["aiswap.js"],
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

def registry_check():
    """📍 地址查漏（站长 2026-11-09）：源码里出现的每个 0x 地址都要在 lib/addresses.js 登记（我们部署的进 ADDRESSES，第三方进 THIRD_PARTY），
    没登记的打印警告，防止部署了新合约 / 新钱包却没人盯余额。客户示例地址所在的文件（会员赠送名单、审核员名单、第三方库）不查。"""
    import glob, re
    reg = set(a.lower() for a in re.findall(r'"(0x[0-9a-fA-F]{40})"', read("lib/addresses.js")))
    skip = ("dist/", "lib/vendor/", "lib/addresses.js", "lib/reviewers.js", "member.js")
    miss = {}
    for f in sorted(glob.glob("*.js") + glob.glob("lib/**/*.js", recursive=True) + glob.glob("functions/**/*.js", recursive=True)):
        if f.startswith(skip) or f in skip: continue
        for a in re.findall(r'"(0x[0-9a-fA-F]{40})"', read(f)):
            if a.lower() not in reg: miss.setdefault(a.lower(), set()).add(f)
    if miss:
        print("⚠️ 未登记地址（请加进 lib/addresses.js：我们部署的进 ADDRESSES，第三方进 THIRD_PARTY）：")
        for a, fs in sorted(miss.items()): print("   %s  ← %s" % (a, ", ".join(sorted(fs))))
    else:
        print("addresses ok: 源码里所有地址都已登记")

def gen_rules():
    """🤖 客服规则数字自动生成（站长 2026-11-09：机器人答不准，要按代码实时更新）：
    从源码里按白名单抠出公开的规则数字，写成大白话存 lib/rules-auto.js，lib/chatbot.js 把它放进知识库并要求「冲突时以此为准」。
    只抠白名单里的数字，不碰地址 / 口令 / 防刷阈值；最后再把任何 0x 地址过滤一遍。抠不到的项打印警告、跳过，不中断。"""
    import re
    out, warn = [], []
    def grab(src, pat, label, fn=lambda m: m.group(1)):
        m = re.search(pat, src)
        if not m: warn.append(label); return None
        return fn(m)
    def pct(x): return ("%g" % (float(x) * 100)) + "%"
    def num(x): return format(float(x), ",").rstrip("0").rstrip(".")
    o = read("lib/oracle.js")
    tiers = re.findall(r'\{ n: (\d+), label: "([^"]+)" \}', o[o.find("export function tierOf"):o.find("export function tierOf") + 600])
    maxg = grab(o, r"MAX_GUESS = (\d+)", "MAX_GUESS")
    if tiers and maxg:
        tl = "、".join("%s%s %s 次" % ("英文 " if re.match(r"\d 位", lb) else "", lb, n) for lb, n in sorted({lb: n for n, lb in tiers}.items(), key=lambda x: int(x[1])))
        out.append("- 预言家每轮（每天）次数按主名字档位：%s；一个钱包每轮最多 %s 次；一个钱包每轮只认一个主名字，手里有多个名字不叠加、换主名字也不多出次数。客户问「每个域名能不能各猜一次 / 多个域名是不是多几次」答：不能，按钱包算。" % (tl, maxg))
    otcmin, gen = grab(o, r"OTC_MIN = (\d+)", "OTC_MIN"), grab(o, r"GENESIS = (\d+)", "GENESIS")
    if otcmin and gen: out.append("- 预言家参与资格（满足其一）：① 主名字是创世 .ailgns 域名（全站前 %s 个付费注册的）；② OTC 累计成交满 %s DAI。免费，不花钱。" % (num(gen), num(otcmin)))
    cuth, drawh = grab(o, r"CUT_H = (\d+)", "CUT_H"), grab(o, r"DRAW_H = (\d+)", "DRAW_H")
    if cuth and drawh: out.append("- 预言家时间（北京时间）：早上 %s 点封卷；晚上 %s:00–%s:00 之间随机一刻的链上价格就是揭晓价。" % (cuth, drawh, int(drawh) + 1))
    share, clo, sec, king = grab(o, r"SHARE = ([\d.]+)", "SHARE"), grab(o, r"CLOSEST = ([\d.]+)", "CLOSEST"), grab(o, r"SECOND = ([\d.]+)", "SECOND"), grab(o, r"KING = ([\d.]+)", "KING")
    if share: out.append("- 奖池来源：每天域名收入的 %s 进奖池买成 AiLGNS；奖金全部以 AiLGNS 发放。" % pct(share))
    if clo and sec and king:
        out.append("- 有人完全猜中那天四个奖一起发：神算子（完全猜中，平分）%s、贡献王 %s、天眼通（最接近）%s、地灵通（第二接近）%s。没人猜中的日子大奖留在奖池滚到下一期。" % (pct(1 - float(clo) - float(sec) - float(king)), pct(king), pct(clo), pct(sec)))
    kin, kcap, ktop, kbd = grab(o, r"KING_IN = ([\d.]+)", "KING_IN"), grab(o, r"KING_CAP = (\d+)", "KING_CAP"), grab(o, r"KING_TOP = (\d+)", "KING_TOP"), grab(o, r"KING_BADGE_DAYS = (\d+)", "KING_BADGE_DAYS")
    if kin and kcap and ktop and kbd: out.append("- 贡献王（周榜）：每周一到周日本站 OTC 吃单付手续费最多的前 %s 名，周日揭晓时结算直接发；总额 = 本周新进奖池的钱的 %s，按三人手续费占比分，每人最多拿回自己手续费的 %s 倍；认证商家以上才进榜；进榜名字挂「本周贡献王」标志 %s 天。" % (ktop, pct(kin), kcap, kbd))
    bd, jpr, npx = grab(o, r"BURN_DAYS = (\d+)", "BURN_DAYS"), grab(o, r"JP_RATE = ([\d.]+)", "JP_RATE"), grab(o, r"NAME_PRICE = (\d+)", "NAME_PRICE")
    if bd and jpr and npx: out.append("- 领奖要先销毁域名：中奖后 %s 天内不销毁视为放弃。天眼通 / 地灵通 / 贡献王烧 1 枚创世 .ailgns 名；神算子大奖要烧价值 ≥ 奖金 %s 的 .ailgns 名字（每个按 %s DAI 折算，任何名字都算）。烧 = 转进黑洞地址，拿不回来。" % (bd, pct(jpr), npx))
    n = read("names.js")
    prices = re.findall(r"<b>(英文 \d 位\+?|中文 \d 字\+?)</b><span>(\d+) DAI</span>", n)
    if prices: out.append("- 域名价格（每年）：%s。可以用 DAI / AiLGNS / LGNS 付。" % "、".join("%s %s DAI" % (k, v) for k, v in prices))
    else: warn.append("域名价格表")
    durs = re.findall(r'\[(\d+) \* 86400, "(\d+ 天)"\]|\[86400, "(1 天)"\]', n[n.find("var DURS"):n.find("var DURS") + 200]) if "var DURS" in n else []
    if durs: out.append("- 域名市场挂单有效期可选：%s，默认 30 天，30 天是合约上限，到期自动退回要重新挂。" % " / ".join((d[1] or d[2]) for d in durs))
    lp = read("lib/lp.js")
    fee, lt, mp = grab(lp, r"FEE: ([\d.]+)", "LP.FEE"), re.findall(r"\[(\d+), ([\d.]+)\]", lp[lp.find("TIERS:"):lp.find("TIERS:") + 120]), grab(lp, r"MIN_PAY: ([\d.]+)", "LP.MIN_PAY")
    if fee and lt: out.append("- 做市返佣（试运行）：OTC 吃单手续费是成交额的 %s；挂单做市的人按日均挂单资金分档拿回吃单手续费：%s；不足 %s DAI 的攒到下次发。" % (pct(fee), "、".join("满 %s DAI 返 %s" % (num(a), pct(b)) for a, b in sorted(lt, key=lambda x: int(x[0]))), mp or "1"))
    c = read("lib/cred.js")
    cm, slots = grab(c, r"CERT_MIN = (\d+)", "CERT_MIN"), re.findall(r"\[(\d), (\d+)\]", c[c.find("SLOTS = "):c.find("SLOTS = ") + 80])
    names = re.findall(r'\["([^"]+)", \d+, \d+\]', c[c.find("CRED = "):c.find("CRED = ") + 400])
    if cm and slots and len(names) >= 7: out.append("- 商家牌子（每周一按上周 OTC 成交额重排）：上周成交满 %s DAI 才是「认证商家」；名额从高到低：%s；其余满额的是认证商家。" % (num(cm), "、".join("%s %s 个" % (names[int(lv)], k) for lv, k in slots)))
    h = read("lib/honor.js")
    ht, vm = re.findall(r'\[(\d+), "([^"]+)"\]', h[h.find("TIERS = "):h.find("TIERS = ") + 200]), grab(h, r"VIP_MIN = (\d+)", "VIP_MIN")
    if ht and vm:
        lo = 1; seg = []
        for k, lb in ht: seg.append("%s 第 %s 名" % (lb, k if int(k) == lo else "%d–%s" % (lo, k))); lo = int(k) + 1
        out.append("- 荣耀榜段位（按 OTC 累计成交额排名，单笔满 %s DAI 才计入）：%s；前 50 名全站显示段位徽章。" % (vm, "、".join(seg)))
    text = "\n".join(l for l in out if not re.search(r"0x[0-9a-fA-F]{40}", l))
    body = "// ⚙️ 自动生成，别手改：tools/build.py gen_rules() 每次 build 从源码白名单抠出的公开规则数字（客服知识库用，冲突时以此为准）\nexport const RULES_AUTO = " + json.dumps("【规则数字（每次上线从代码自动生成，和其它段落冲突时以这里为准）】\n" + text, ensure_ascii=False) + ";\n"
    if read("lib/rules-auto.js") != body if os.path.exists("lib/rules-auto.js") else True: write("lib/rules-auto.js", body)
    print("rules-auto: %d 条%s" % (len(out), ("；⚠️ 抠不到：" + "、".join(warn)) if warn else ""))

def main():
    syntax_check()
    registry_check()
    gen_rules()
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
