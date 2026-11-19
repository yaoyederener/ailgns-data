#!/usr/bin/env python3
"""🈶 生成繁体字转换表 lang-hant.js（站长 2026-11-19：网站加繁体版）。

网站文字全是写在各个 js 里的简体中文。繁体版不改任何页面代码：lang.js 在浏览器里把页面上出现的字逐个换成繁体。
这个脚本生成它要用的表：
  s / d  一个字对一个字的默认换法（约 2600 对）
  p      一个字有两种繁体写法时，看词定字的例外（「头发→頭髮」「这里→這裡」「余额→餘額」），从全站文字 + 常用词里自动找出来

换字用 macOS 自带的 ICU（swift tools/hant_icu.swift），所以只能在 Mac 上重新生成；生成物 lang-hant.js 进仓库，build.py 只负责打包。
改了很多文案、或发现繁体版有错字时重新跑：python3 tools/hant.py（错字加到下面 FIX 里）
"""
import glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CJK = re.compile(r"[一-鿿]+")

# ICU 换得不对 / 港台更习惯的写法：人工定
FIX = {
    "松开": "鬆開", "轻松": "輕鬆", "放松": "放鬆", "宽松": "寬鬆", "松手": "鬆手", "松动": "鬆動",
    "咸鱼": "鹹魚", "咸": "鹹", "回复": "回覆", "答复": "答覆", "了解": "了解", "瞭解": "了解",
    "只": "只", "一只": "一隻", "几只": "幾隻", "台": "台", "周": "周", "谷歌": "谷歌",
    # 「里」「余」单独出现时 ICU 不换，但网站上十有八九是「钱包里」「余额」的意思：默认换，下面几个真该留着的词单独列
    "里": "裡", "余": "餘",
    "公里": "公里", "英里": "英里", "千里": "千里", "万里": "萬里", "里程": "里程", "海里": "海里", "邻里": "鄰里", "故里": "故里",
}
# 全站文字里未必出现、但客服回答 / 客户留言里常见的词：让「看词定字」认得它们
WORDS = """准备 标准 准时 准确 批准 不准 制造 制度 控制 限制 制作 复杂 重复 恢复 复制 里面 这里 那里 哪里 心里 家里 手里 公里 里程 干净 干燥 干部 能干 干活 饼干
发现 头发 理发 发展 发送 发布 面包 面条 方面 页面 后面 以后 之后 然后 最后 后来 皇后 后台 只要 只是 只有 只能 系统 关系 联系 余额 其余 多余 剩余 业余
表示 手表 表格 钟表 分钟 历史 经历 日历 云端 获得 收获 尽量 尽管 尽快 签名 签到 标签 抽签 冲突 冲击 征收 特征 周末 周围 每周 周期 游戏 旅游
于是 对于 关于 由于 等于 至于 属于 愿意 志愿 占用 占比 注册 注意 备注 借出 借入 当前 当时 几个 价格 根据 数据 为了 什么 怎么 这么 那么 采用 别人
布局 参与 尝试 担心 范围 丰富 伙伴 困难 累计 千万 确认 适合 技术 体验 团队 方向 佣金 折扣 种子 汇率 汇总 词汇 划算 计划 划转 才能 刚才 出现 症状
托管 托底 挂单 买单 卖单 撤单 奖池 销毁 质押 赎回 抵押 清算 利息 手续费 滑点 跨链 钱包 私钥 助记词 授权 合约 区块 域名 续费 到期 转账 账本 账号 账户
松鼠 向上 方向 斗地主 战斗 干杯 饥饿 姜 借贷 卷起 试卷 夸奖 蜡烛 腊月 厘米 窗帘 发霉 蒙古 弥补 开辟 苹果 凭证 扑克 仆人 朴素 启动 牵手 秋天 歌曲 权限
洒水 宿舍 舍得 胜利 潮湿 艺术 涂抹 椭圆 袜子 网络 卫生 稳定 任务 牺牲 习惯 戏剧 虾 吓人 显示 县 响应 协议 威胁 兴趣 必须 胡须 悬赏 选择 旋转 压力
盐 太阳 养成 样子 钥匙 药 叶子 医生 回忆 应该 拥有 踊跃 忧虑 优惠 邮件 抵御 呼吁 郁闷 荣誉 深渊 花园 远 跃迁 运行 酝酿 复杂 赃物 肮脏 确凿 枣 炉灶
战争 折叠 证明 致谢 肿 群众 白昼 蜡烛 建筑 村庄 化妆 安装 强壮 状态 浑浊 总共 钻石""".split()


def icu(lines):
    p = subprocess.run(["swift", os.path.join("tools", "hant_icu.swift")], input="\n".join(lines) + "\n", capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit("swift 跑不起来（只能在 Mac 上生成）：" + p.stderr[:300])
    out = p.stdout.split("\n")[:len(lines)]
    if len(out) != len(lines):
        sys.exit("ICU 输出行数对不上")
    return out


def corpus():
    runs = set(WORDS) | set(FIX)
    files = [f for f in glob.glob("*.js") + glob.glob("lib/*.js") + glob.glob("functions/api/*.js") + ["index.src.html", "app.html"] if os.path.exists(f) and not f.startswith("lang-")]
    for f in files:
        runs |= set(CJK.findall(open(f, encoding="utf-8", errors="ignore").read()))
    return sorted(runs)


def main():
    # ① 一个字对一个字：GB2312 里的 6763 个字
    chars = []
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.append(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    runs = corpus()
    extra = sorted({c for r in runs for c in r} - set(chars))
    chars += extra
    one = icu(chars)
    cmap = {a: b for a, b in zip(chars, one) if a != b and len(b) == 1}
    for k, v in FIX.items():
        if len(k) == 1:
            if k == v: cmap.pop(k, None)
            else: cmap[k] = v
    conv = lambda s: "".join(cmap.get(c, c) for c in s)
    MANUAL = {k for k in FIX if len(k) == 1}

    # ② 看词定字：整句交给 ICU（它认得词），和逐字换的结果比，不一样的地方取最短的那个词记下来
    full = icu(runs)
    want = {}                      # 候选词 → [(整句里的位置信息)]
    todo = []
    for r, t in zip(runs, full):
        if len(t) != len(r): continue
        c = conv(r)
        for i in range(len(r)):
            if t[i] != c[i] and r[i] not in MANUAL:   # 人工定了默认换法的字（里、余…）不听 ICU 的，只认 FIX 里列的词
                todo.append((r, t, i))
    def windows(r, i):
        for a, b in ((i, i + 2), (i - 1, i + 1), (i - 1, i + 2), (i, i + 3), (i - 2, i + 1), (i - 2, i + 2), (i - 1, i + 3)):
            if a >= 0 and b <= len(r) and b - a >= 2:
                yield a, b
    cand = sorted({r[a:b] for r, t, i in todo for a, b in windows(r, i)})
    got = dict(zip(cand, icu(cand))) if cand else {}
    phr, lost = {}, 0
    for r, t, i in todo:
        for a, b in windows(r, i):
            w = r[a:b]
            if got.get(w) == t[a:b]:
                phr[w] = t[a:b]
                break
        else:
            lost += 1
    for k, v in FIX.items():
        if len(k) > 1: phr[k] = v
    # 逐字换已经对的词不用记
    phr = {k: v for k, v in phr.items() if conv(k) != v}
    ks = sorted(cmap)
    data = {"t": "hant", "s": "".join(ks), "d": "".join(cmap[k] for k in ks), "p": dict(sorted(phr.items()))}
    with open("lang-hant.js", "w", encoding="utf-8") as f:
        f.write("// 由 tools/hant.py 生成，别直接改（错字加到 tools/hant.py 的 FIX 里再重新生成）\nwindow.AIL_LANG_DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("逐字 %d 对，看词定字 %d 个词，没找到合适词的 %d 处；全站文字 %d 段" % (len(cmap), len(phr), lost, len(runs)))


if __name__ == "__main__":
    main()
