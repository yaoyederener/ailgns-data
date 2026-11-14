# -*- coding: utf-8 -*-
"""
🌙 夜间模式样式生成器（站长 2026-11-14：客户反馈晚上看太亮）

做法：不逐页重写样式（style.css 4000 多行、写死的颜色近 3000 处，手改必漏）。
这里把 style.css 里每一条带颜色的声明读出来，把颜色「明暗对调」——亮的变暗、暗的变亮，色相不变——
再原样套上 html.night 前缀输出成 dist/night.css。只有客户打开夜间模式时才加载这个文件，白天模式一个字节都不变。

  from night import gen_night
  css = gen_night(open("style.css").read())

规则：
  · 明暗对调在 OKLab 里做（按人眼感觉的亮度算，蓝紫色不会变得发闷），白 → 深靛灰，黑字 → 浅灰白。
  · 半透明的深色（遮罩、阴影、淡淡的压暗）不动：夜里它们本来就该是暗的。
  · @keyframes / @font-face 不碰；@media / @supports 原样包回去。
  · 选择器前面加 html.night；:root / html 开头的直接并到 html.night 上。
"""
import math, re

LO, SPAN = 0.215, 0.74          # 白(1) → 0.215；黑(0) → 0.955
CURVE = 1.7                     # 中间调往亮处推：灰字、绿涨红跌、紫按钮在深底上才看得清（1 = 直线对调）
SKIP_AT = ("@keyframes", "@-webkit-keyframes", "@font-face", "@page", "@property", "@import", "@charset", "@namespace")
WRAP_AT = ("@media", "@supports", "@layer", "@container")


# ---------- 颜色换算 ----------
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb_to_oklab(r, g, b):
    r, g, b = _lin(r), _lin(g), _lin(b)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def oklab_to_rgb(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    lin = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    return tuple(_gam(x) if x > 0 else x for x in lin)   # 负数（超出屏幕色域）原样留着，给调用的人判断


def flip(r, g, b, a=1.0):
    """一个颜色（0~1 的 r g b + 透明度）→ 夜间模式里的颜色。返回 None 表示不用改。"""
    L, A, B = rgb_to_oklab(r, g, b)
    if a < 1 and L < 0.42:
        return None                       # 半透明的深色：遮罩 / 阴影 / 压暗，夜里照旧
    C = math.hypot(A, B)
    L2 = LO + SPAN * (1 - min(1.0, max(0.0, L)) ** CURVE)
    if C < 0.015 and L2 < 0.45:           # 纯白纯灰翻过来是死黑灰：带一点点靛紫，和网站的紫色调一致
        A, B = 0.018 * math.cos(math.radians(285)), 0.018 * math.sin(math.radians(285))
    elif L2 < 0.34:
        A, B = A * 0.8, B * 0.8           # 很暗的底色别太艳
    for _ in range(80):                   # 超出屏幕能显示的范围就把鲜艳度往回收
        rr, gg, bb = oklab_to_rgb(L2, A, B)
        if -0.002 <= min(rr, gg, bb) and max(rr, gg, bb) <= 1.002:
            break
        A, B = A * 0.94, B * 0.94
    rr, gg, bb = [min(1.0, max(0.0, x)) for x in oklab_to_rgb(L2, A, B)]
    return rr, gg, bb, a


def fmt(c):
    r, g, b, a = c
    R, G, B = [int(round(x * 255)) for x in (r, g, b)]
    if a >= 0.999:
        return "#%02x%02x%02x" % (R, G, B)
    return "rgba(%d,%d,%d,%s)" % (R, G, B, ("%.3f" % a).rstrip("0").rstrip("."))


def _num(tok, scale=255.0):
    tok = tok.strip()
    return float(tok[:-1]) / 100.0 if tok.endswith("%") else float(tok) / scale


def _hsl(h, s, l):
    def f(n):
        k = (n + h / 30.0) % 12
        return l - s * min(l, 1 - l) * max(-1, min(k - 3, 9 - k, 1))
    return f(0), f(8), f(4)


HEX = r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])"
FUNC = r"(?:rgba?|hsla?)\([^()]*\)"
TOKEN = re.compile("(%s|%s)" % (HEX, FUNC))


def parse_color(tok):
    t = tok.strip()
    if t.startswith("#"):
        h = t[1:]
        if len(h) in (3, 4):
            h = "".join(ch * 2 for ch in h)
        a = int(h[6:8], 16) / 255.0 if len(h) == 8 else 1.0
        return int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0, a
    name, body = t[:t.index("(")].lower(), t[t.index("(") + 1:-1]
    if "var(" in body or "calc(" in body:
        return None
    alpha = 1.0
    if "/" in body:
        body, al = body.split("/", 1)
        alpha = _num(al, 1.0)
    parts = [p for p in re.split(r"[,\s]+", body.strip()) if p]
    if len(parts) == 4:
        alpha = _num(parts[3], 1.0)
        parts = parts[:3]
    if len(parts) != 3:
        return None
    try:
        if name.startswith("rgb"):
            return _num(parts[0]), _num(parts[1]), _num(parts[2]), alpha
        hh = float(re.sub(r"deg$", "", parts[0]))
        r, g, b = _hsl(hh % 360, _num(parts[1], 100.0), _num(parts[2], 100.0))
        return r, g, b, alpha
    except ValueError:
        return None


def flip_value(val):
    """一条声明的值 → (新值, 改了几处颜色)。引号里的字不动。"""
    n = [0]

    def one(m):
        c = parse_color(m.group(0))
        if not c:
            return m.group(0)
        f = flip(*c)
        if not f:
            return m.group(0)
        n[0] += 1
        return fmt(f)

    out, i = [], 0
    for m in re.finditer(r'"[^"]*"|\'[^\']*\'', val):      # 跳过引号里的内容（content: "…" 之类）
        out.append(TOKEN.sub(one, val[i:m.start()]))
        out.append(m.group(0))
        i = m.end()
    out.append(TOKEN.sub(one, val[i:]))
    return "".join(out), n[0]


# ---------- 读样式表 ----------
def _split(s, sep):
    """按 sep 切开，括号、方括号、引号里面的不切。"""
    out, depth, q, cur = [], 0, "", []
    for ch in s:
        if q:
            cur.append(ch)
            if ch == q:
                q = ""
            continue
        if ch in "\"'":
            q = ch
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == sep and depth == 0:
            out.append("".join(cur))
            cur = []
            continue
        cur.append(ch)
    out.append("".join(cur))
    return out


def _blocks(s):
    """顶层一块一块读：(前面那段, 大括号里的内容)。没有大括号的 @ 语句直接跳过。"""
    i, n = 0, len(s)
    while i < n:
        j, q = i, ""
        while j < n:
            ch = s[j]
            if q:
                if ch == q:
                    q = ""
            elif ch in "\"'":
                q = ch
            elif ch in "{;":
                break
            j += 1
        if j >= n:
            return
        if s[j] == ";":
            i = j + 1
            continue
        depth, k, q = 1, j + 1, ""
        while k < n and depth:
            ch = s[k]
            if q:
                if ch == q:
                    q = ""
            elif ch in "\"'":
                q = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            k += 1
        yield s[i:j].strip(), s[j + 1:k - 1]
        i = k


def _sel(sel):
    """前面加 :where(html.night)。:where() 不加权重，所以夜间规则和白天规则之间谁压谁，跟原来一模一样；
    夜间文件排在 style.css 后面，同权重时夜间的赢。（第一版用 html.night 直接加前缀，权重被抬高，
    本来被别的规则盖掉的颜色反而冒出来：☰ 三条线看不见、倒计时数字变成色块。）"""
    sel = sel.strip()
    if not sel:
        return ""
    if sel.startswith(":root"):
        return ":where(html.night)" + sel
    if re.match(r"html(?![\w-])", sel):
        return "html:where(.night)" + sel[4:]
    return ":where(html.night) " + sel


# 和颜色有关的属性：这些声明不管有没有写死的颜色都要原样抄进夜间文件（保持先后顺序），
# 不然「后面一条规则用 var() / none / transparent 盖掉前面的颜色」这种关系在夜间文件里就断了。
FAMILY = ("color", "background", "-webkit-background-clip", "border", "outline", "fill", "stroke", "box-shadow", "-webkit-box-shadow",
          "text-shadow", "caret-color", "-webkit-text-fill-color", "-webkit-text-stroke", "text-decoration", "column-rule", "accent-color",
          "scrollbar-color", "filter", "-webkit-filter", "backdrop-filter", "-webkit-backdrop-filter", "-webkit-tap-highlight-color")
NOT_COLOR = re.compile(r"radius|collapse|spacing|^stroke-(width|dash|line|miter)|^fill-rule|^outline-offset|^color-scheme|^color-adjust|^text-decoration-(thickness|skip)")


def _keep(prop, val):
    """没改颜色的声明要不要也抄一份。"""
    if prop.startswith("--"):
        return "var(--" in val            # 变量给变量起别名（--dn: var(--down)）要跟着走
    return prop.startswith(FAMILY) and not NOT_COLOR.search(prop)


def _rules(css, stats):
    out = []
    for pre, body in _blocks(css):
        low = pre.lower()
        if low.startswith(SKIP_AT):
            continue
        if low.startswith(WRAP_AT):
            inner = _rules(body, stats)
            if inner:
                out.append("%s{%s}" % (pre, "".join(inner)))
            continue
        if low.startswith("@") or "{" in body:
            stats["skipped"] += 1
            continue
        if ".night" in pre:
            continue                      # style.css 里本来就是写给夜间模式的规则：颜色已经是夜里的，不能再对调一遍
        decls, any_fam = [], False
        for d in _split(body, ";"):
            if ":" not in d:
                continue
            prop, val = d.split(":", 1)
            prop = prop.strip().lower() if not prop.strip().startswith("--") else prop.strip()
            new, k = flip_value(val)
            if k:
                decls.append("%s:%s" % (prop, new.strip()))
                stats["colors"] += k
                any_fam = True
            elif _keep(prop, val):
                decls.append("%s:%s" % (prop, val.strip()))
                any_fam = True
        if decls and any_fam:
            sels = [x for x in (_sel(x) for x in _split(pre, ",")) if x]
            out.append("%s{%s}" % (",".join(sels), ";".join(decls)))
            stats["rules"] += 1
    return out


def gen_night(css):
    stats = {"rules": 0, "colors": 0, "skipped": 0}
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    head = ("/* 🌙 夜间模式：tools/night.py 从 style.css 自动生成，别手改 */\n"
            "html.night{color-scheme:dark}\n")
    # 注意：必须排在 style.css 后面加载（night.js 把它插在 <head> 末尾），同权重时靠先后顺序赢
    body = "\n".join(_rules(css, stats))
    # 手工补的几条（放最后，压过上面自动生成的）：
    tail = ("\n/* 手工补 */\n"
            "html.night{--bg:#121219}\n"                       # 页面底比卡片再暗一点：卡片是浮在上面的
            "html.night,html.night body{background:#121219}\n")
    return head + body + tail, stats


if __name__ == "__main__":
    import io, sys
    src = io.open(sys.argv[1] if len(sys.argv) > 1 else "style.css", encoding="utf-8").read()
    out, st = gen_night(src)
    print("night.css: %d 条规则、%d 处颜色、跳过 %d 块，%d KB" % (st["rules"], st["colors"], st["skipped"], len(out.encode("utf-8")) // 1024))
    for name, c in [("页面底 #f3f4ff", "#f3f4ff"), ("卡片 #ffffff", "#ffffff"), ("正文 #191839", "#191839"), ("次要字 #848298", "#848298"), ("线 #e7e4ef", "#e7e4ef"),
                    ("主紫 #7027d9", "#7027d9"), ("深紫字 #5920ad", "#5920ad"), ("浅紫底 #f3ebff", "#f3ebff"), ("涨 #16a34a", "#16a34a"), ("跌 #ef4444", "#ef4444"),
                    ("按钮蓝 #009cff", "#009cff"), ("按钮紫 #4936ff", "#4936ff"), ("黄底 #fffbeb", "#fffbeb"), ("琥珀字 #b45309", "#b45309"), ("黑 #000", "#000"), ("遮罩 rgba(0,0,0,.5)", "rgba(0,0,0,.5)"), ("白半透 rgba(255,255,255,.8)", "rgba(255,255,255,.8)")]:
        print("  %-26s → %s" % (name, flip_value(c)[0]))
