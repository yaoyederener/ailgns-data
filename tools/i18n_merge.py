#!/usr/bin/env python3
"""把分批翻好的英文（i18n/_out/bNN.tsv：编号<TAB>英文）和原文（i18n/_in/all.json）对上，合成 i18n/en-frags.json {原文: 英文}。
对不上号、译文里还有中文的会列出来；缺的不写进去（英文版里那一段就保持中文）。"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CJK = re.compile(r"[一-鿿]")
FW = str.maketrans({"，": ", ", "。": ". ", "：": ": ", "；": "; ", "（": " (", "）": ") ", "、": ", ", "！": "! ", "？": "? ", "「": "“", "」": "”"})
src = json.load(open("i18n/_in/all.json", encoding="utf-8"))
got, bad = {}, []
for fp in sorted(glob.glob("i18n/_out/b*.tsv")):
    for ln in open(fp, encoding="utf-8").read().split("\n"):
        if not ln.strip() or ln.startswith("#"): continue
        a, _, b = ln.partition("\t")
        if not a.strip().isdigit(): bad.append((fp, ln[:60])); continue
        i = int(a)
        if i >= len(src): bad.append((fp, ln[:60])); continue
        b = b.replace("\t", " ").translate(FW)
        b = re.sub(r" {2,}", " ", b).strip()
        # 译文里留着中文只允许一种情况：举例用的名字（发财.ailgns / 发财），原文里就有
        left = re.findall(r"[\u4e00-\u9fff]+", re.sub(r"\S+\.ailgns", "", b))
        if any(len(x) > 4 or x not in src[i] for x in left): bad.append((fp, ln[:60])); continue
        got[i] = b
# 不翻的：人名 / 域名主人的名字、客服用来对问题的错别字关键词
KEEP = {"加拿大局长", "四哥", "觉醒人生", "一二三", "惯蛋", "贯蛋", "发财"}
# 翻译时给了空译文、但单独出现时不能丢的小段
FORCE = {"链上": "on-chain", "局": "rounds", "层": "levels"}
out = {}
for i, zh in enumerate(src):
    if zh in KEEP: continue
    if zh in FORCE: out[zh] = FORCE[zh]
    elif i in got: out[zh] = got[i]
# 只有一个汉字的小段（量词、介词：张 / 笔 / 共 / 约…）全站到处出现，但翻译时只看到了其中一处的上下文，
# 译出来常常是那一处的整句意思（「倍」→ x the DAI in the trading pool）。这类统一用下面这张中性的表；表里没有的字不翻（保持原样）
ONE = {"笔": "", "个": "", "枚": "", "张": "", "名": "", "位": "", "条": "", "家": "", "只": "", "头": "", "的": "", "了": "",
       "次": "times", "天": "days", "时": "h", "分": "min", "秒": "s", "人": "people", "年": "years", "月": "month", "日": "day", "周": "week",
       "期": "round", "倍": "x", "项": "items", "件": "items", "行": "rows", "层": "levels", "级": "Lv", "局": "rounds", "票": "tickets",
       "格": "cells", "台": "devices", "字": "characters", "楼": "floor", "帖": "posts", "单": "orders", "币": "coins", "链": "chain",
       "池": "pool", "奖": "prize", "豆": "beans", "房": "room", "牌": "cards", "万": "×10k", "亿": "×100M",
       "共": "total", "约": "about", "第": "No.", "近": "last", "剩": "left", "到": "to", "或": "or", "和": "and", "与": "and", "在": "at",
       "从": "from", "往": "to", "给": "to", "由": "by", "被": "by", "按": "by", "比": "vs", "含": "incl.", "扣": "less", "合": "worth",
       "折": "worth", "占": "share", "估": "est.", "省": "save", "多": "more", "差": "off by", "前": "top", "上": "up", "我": "me",
       "你": "you", "谁": "who", "无": "none", "空": "none", "有": "has", "要": "need", "用": "use", "付": "pay", "花": "spend",
       "买": "buy", "卖": "sell", "借": "borrow", "还": "repay", "收": "collect", "发": "paid", "送": "free", "转": "transfer",
       "押": "bet", "猜": "guess", "选": "choose", "找": "look for", "吃": "fill", "去": "go to", "每": "every", "这": "this",
       "开": "Open", "高": "High", "低": "Low", "量": "Vol", "大": "Big", "小": "Small", "王": "Joker", "配": "Wild", "碰": "Pung",
       "杠": "Kong", "胡": "Win", "庄": "Dealer", "缺": "Missing", "过": "Pass", "筒": "Dots", "萬": "Characters", "番": "Fan",
       "进": "Enter", "割": "Cut", "线": "line", "骗": "scam", "升": "up"}
# 更新日志这类「开头一个表情 + 空格 + 正文」的句子，页面会把表情拆出去单独放：正文也单独记一条
for zh, en_ in list(out.items()):
    m = re.match(r"^(\S+)\s+", zh)
    if m and len(zh) > 30 and not re.search(r"[\u4e00-\u9fffA-Za-z0-9]", m.group(1)) and en_.startswith(m.group(1)):
        out.setdefault(zh[m.end():], en_[len(m.group(1)):].strip())
n1 = nd = 0
for zh in list(out):
    cs = CJK.findall(zh)
    if len(cs) != 1 or re.search(r"[A-Za-z0-9]", zh): continue
    c = cs[0]
    if c not in ONE: del out[zh]; nd += 1; continue
    v = zh.replace(c, " " + ONE[c] + " ").translate(FW)
    out[zh] = re.sub(r" {2,}", " ", v).strip(); n1 += 1
print("单字小段：%d 个改用中性译法，%d 个不翻" % (n1, nd))
json.dump(out, open("i18n/en-frags.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
miss = [i for i in range(len(src)) if i not in got]
print("原文 %d 段，译好 %d 段，缺 %d 段，有问题的行 %d" % (len(src), len(out), len(miss), len(bad)))
if miss: print("缺的编号（前 30）：", miss[:30])
for fp, ln in bad[:15]: print("  问题行", fp, ln)
