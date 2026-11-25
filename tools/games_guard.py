#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""游戏自动开发的护栏：推 main 之前必须跑，退出码不是 0 就不许推。
检查「这次改动相对 origin/main 动了哪些文件」是不是都在白名单里、接线文件是不是只是小幅追加、新游戏代码里有没有碰钱 / 加地址。
规则见 docs/游戏自动开发/规则.md。用法：python3 tools/games_guard.py [对比的基准，默认 origin/main]
"""
import fnmatch, re, subprocess, sys

BASE = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
FREE = ["gx-*.js", "functions/api/gx-*.js", "lib/gx-*.js", "icons/gx/*", "i18n/en/9*-gx-*.json", "docs/游戏自动开发/*"]
BUILT = ["dist/*", "index.html"]
# 接线文件：最多新增多少行、最多删改多少行
WIRE = {"app.js": (12, 4), "menu.js": (6, 3), "tools/build.py": (6, 3), "index.src.html": (6, 2), "style.css": (500, 0),
        "tools/healthcheck.mjs": (6, 2), "lib/updates.js": (4, 0), "chat.js": (6, 0), "lib/chatbot.js": (6, 0),
        "i18n/ko/02-extra.json": (300, 2), "night.js": (10, 2)}
# 新游戏代码里不许出现的东西（碰钱 / 发交易 / 签名 / 地址 / 系统弹窗）
BAD = [(r"0x[0-9a-fA-F]{40}", "出现了合约或钱包地址"), (r"eth_sendTransaction|eth_sign|personal_sign|signTypedData", "发交易或签名"),
       (r"otcKit\.send|\.approve\(|0x095ea7b3|a22cb465", "授权或调用交易"), (r"privateKey|mnemonic|助记词|私钥", "私钥相关"),
       (r"/api/farm|farm:", "碰了农场"), (r"\b(alert|confirm|prompt)\s*\(", "系统弹窗"), (r"充值|提现|转赠", "出现充值 / 提现 / 转赠字样")]

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True, check=True).stdout

def match(path, pats):
    return any(fnmatch.fnmatch(path, p) for p in pats)

errs = []
names = [l.split("\t") for l in sh("git", "-c", "core.quotepath=off", "diff", "--name-status", BASE + "...HEAD").splitlines() if l.strip()]
if not names:
    print("没有改动"); sys.exit(0)
for row in names:
    st, path = row[0], row[-1]
    if match(path, BUILT):
        continue
    if path == "docs/游戏自动开发/规则.md":
        errs.append("%s：规则文件只有站长那边能改，自动开发不许动" % path); continue
    if match(path, FREE):
        if st.startswith("D"):
            continue
        if path.endswith(".js"):
            txt = sh("git", "show", "HEAD:" + path)
            for pat, why in BAD:
                m = re.search(pat, txt)
                if m:
                    errs.append("%s：%s（%s）" % (path, why, m.group(0)[:30]))
        continue
    if path in WIRE:
        if not st.startswith("M"):
            errs.append("%s：接线文件只能小改，不能新建 / 删除 / 改名" % path); continue
        add = dele = 0
        for l in sh("git", "-c", "core.quotepath=off", "diff", "--numstat", BASE + "...HEAD", "--", path).splitlines():
            a, d = l.split("\t")[:2]; add += int(a) if a.isdigit() else 9999; dele += int(d) if d.isdigit() else 9999
        ma, md = WIRE[path]
        if add > ma or dele > md:
            errs.append("%s：改得太多（新增 %d 行、删改 %d 行；上限 %d / %d）" % (path, add, dele, ma, md))
        continue
    errs.append("%s：不在白名单里，游戏自动开发不许动这个文件" % path)

if errs:
    print("❌ 护栏没过，不许推 main："); [print("  - " + e) for e in errs]; sys.exit(1)
print("✅ 护栏通过：%d 个文件都在白名单里" % len(names))
