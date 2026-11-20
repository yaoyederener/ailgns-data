#!/usr/bin/env python3
"""把分批翻好的韩文合成词典（和 tools/i18n_merge.py 是一对，那个管英文）。
  i18n/_ko_out/bNN.tsv（编号<TAB>韩文）+ i18n/_ko_in/all.json（原文）→ i18n/ko-frags.json {原文: 韩文}（代码里的每一小段）
  i18n/_ko_out/xNN.tsv（编号<TAB>韩文）+ i18n/_ko_in/exact.json（原句）→ i18n/ko/01-all.json {原句: 韩文}（整句词典）
对不上号、译文里还有汉字、{数字} / 标签对不上的会列出来；有问题的那一条不写进去（韩文版里那一段退回英文或保持原样）。"""
import glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CJK = re.compile(r"[一-鿿]")
FW = str.maketrans({"，": ", ", "。": ". ", "：": ": ", "；": "; ", "（": " (", "）": ") ", "、": ", ", "！": "! ", "？": "? ", "「": "“", "」": "”"})
TAG = re.compile(r"</?[a-zA-Z][^>]*>")
PH = re.compile(r"\{\d+\}")

def load(pat, src, keep_edges):
    got, bad = {}, []
    for fp in sorted(glob.glob(pat)):
        for ln in open(fp, encoding="utf-8").read().split("\n"):
            if not ln.strip() or ln.startswith("#"): continue
            a, _, b = ln.partition("\t")
            if not a.strip().isdigit(): bad.append((fp, "编号不对", ln[:50])); continue
            i = int(a)
            if i >= len(src): bad.append((fp, "编号超出", ln[:50])); continue
            b = b.replace("\t", " ").replace("\\n", "\n").translate(FW)
            b = re.sub(r" {2,}", " ", b)
            if not keep_edges: b = b.strip()
            zh = src[i]
            left = re.findall(r"[一-鿿]+", re.sub(r"\S+\.ailgns", "", b).replace("简体", "").replace("繁體", ""))
            if any(len(x) > 4 or x not in zh for x in left): bad.append((fp, "还有汉字", ln[:50])); continue
            if sorted(PH.findall(b)) != sorted(PH.findall(zh)) and set(PH.findall(b)) - set(PH.findall(zh)): bad.append((fp, "多了{数字}", ln[:50])); continue
            if sorted(t.lower() for t in TAG.findall(b)) != sorted(t.lower() for t in TAG.findall(zh)): bad.append((fp, "标签对不上", ln[:50])); continue
            got[i] = b
    return got, bad

# —— 小段 ——
src = json.load(open("i18n/_ko_in/all.json", encoding="utf-8"))
got, bad = load("i18n/_ko_out/b[0-9][0-9].tsv", src, False)
KEEP = {"加拿大局长", "四哥", "觉醒人生", "一二三", "惯蛋", "贯蛋", "发财"}  # 人名 / 客服对问题用的错别字关键词：不翻
FORCE = {"链上": "온체인", "局": "판", "层": "층", "还剩": "남은"}
out = {}
for i, zh in enumerate(src):
    if zh in KEEP: continue
    if zh in FORCE: out[zh] = FORCE[zh]
    elif i in got: out[zh] = got[i]
# 只有一个汉字的小段（量词、介词）全站到处出现，翻译时只看到其中一处的上下文：统一用这张中性的表；表里没有的字不翻（保持原样）
ONE = {"笔": "건", "个": "개", "枚": "개", "张": "장", "名": "명", "位": "명", "条": "개", "家": "곳", "只": "마리", "头": "마리", "的": "", "了": "",
       "次": "회", "天": "일", "时": "시간", "分": "분", "秒": "초", "人": "명", "年": "년", "月": "월", "日": "일", "周": "주",
       "期": "회차", "倍": "배", "项": "개", "件": "건", "行": "줄", "层": "층", "级": "레벨", "局": "판", "票": "장",
       "格": "칸", "台": "대", "字": "자", "楼": "층", "帖": "개", "单": "주문", "币": "코인", "链": "체인",
       "池": "풀", "奖": "상금", "豆": "콩", "房": "방", "牌": "패", "万": "만", "亿": "억",
       "共": "총", "约": "약", "第": "제", "近": "최근", "剩": "남은", "到": "~", "或": "또는", "和": "및", "与": "및", "在": "",
       "从": "", "往": "", "给": "", "由": "", "被": "", "按": "", "比": "대비", "含": "포함", "扣": "차감", "合": "환산",
       "折": "환산", "占": "비중", "估": "예상", "省": "절약", "多": "더", "差": "차이", "前": "상위", "上": "위", "我": "나",
       "你": "회원님", "谁": "누구", "无": "없음", "空": "없음", "有": "있음", "要": "필요", "用": "사용", "付": "지불", "花": "지출",
       "买": "매수", "卖": "매도", "借": "빌리기", "还": "상환", "收": "수령", "发": "지급", "送": "증정", "转": "전송",
       "押": "베팅", "猜": "예측", "选": "선택", "找": "찾기", "吃": "체결", "去": "이동", "每": "매", "这": "이",
       "开": "시가", "高": "고가", "低": "저가", "量": "거래량", "大": "대", "小": "소", "王": "조커", "配": "와일드", "碰": "펑",
       "杠": "깡", "胡": "화료", "庄": "선", "缺": "부족", "过": "패스", "筒": "통", "萬": "만", "番": "번",
       "进": "입장", "割": "수확", "线": "선", "骗": "사기", "升": "상승"}
for zh, v in list(out.items()):  # 更新日志这类「开头一个表情 + 空格 + 正文」：页面会把表情拆出去单独放，正文也单独记一条
    m = re.match(r"^(\S+)\s+", zh)
    if m and len(zh) > 30 and not re.search(r"[一-鿿A-Za-z0-9]", m.group(1)) and v.startswith(m.group(1)):
        out.setdefault(zh[m.end():], v[len(m.group(1)):].strip())
n1 = nd = 0
for zh in list(out):
    cs = CJK.findall(zh)
    if len(cs) != 1 or re.search(r"[A-Za-z0-9]", zh): continue
    c = cs[0]
    if c not in ONE: del out[zh]; nd += 1; continue
    v = zh.replace(c, " " + ONE[c] + " ").translate(FW)
    out[zh] = re.sub(r" {2,}", " ", v).strip(); n1 += 1
json.dump(out, open("i18n/ko-frags.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
miss = [i for i in range(len(src)) if i not in got]
print("小段：原文 %d 段，写进词典 %d 段，缺 %d 段，有问题的行 %d；单字 %d 个用中性译法、%d 个不翻" % (len(src), len(out), len(miss), len(bad), n1, nd))
if miss: print("  缺的编号（前 30）：", miss[:30])
for fp, why, ln in bad[:20]: print("  问题行", os.path.basename(fp), why, ln)

# —— 整句 ——
ex = json.load(open("i18n/_ko_in/exact.json", encoding="utf-8"))
got2, bad2 = load("i18n/_ko_out/x[0-9][0-9].tsv", ex, True)
os.makedirs("i18n/ko", exist_ok=True)
d = {ex[i]: v for i, v in sorted(got2.items())}
json.dump(d, open("i18n/ko/01-all.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("整句：原句 %d，写进词典 %d，缺 %d，有问题的行 %d" % (len(ex), len(d), len(ex) - len(got2), len(bad2)))
for fp, why, ln in bad2[:20]: print("  问题行", os.path.basename(fp), why, ln)
