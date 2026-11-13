#!/bin/bash
# 把「掼蛋联机」装到香港机的房间服务上（和麻将是同一个服务，房卡通用）。以后改了掼蛋/麻将的服务器代码，也用这个脚本更新。
# 在 Mac 上运行：bash hk/gd-deploy.sh
# 它做的事：把 4 个文件传上去 → 在服务器上先查语法 → 备份旧文件 → 换上新的 → 重启 → 自检；自检不过就自动换回旧文件。
# 这个服务手里没有任何私钥，只读链上的付款记录。重启时没打完的房间会自动退房卡，所以有人在打牌时默认不重启。
set -e
cd "$(dirname "$0")/.."
H=root@140.235.99.27
for f in hk/mj/server.mjs hk/mj/gdroom.mjs gd.js mj.js; do [ -f "$f" ] || { echo "找不到 $f，请在网站代码目录里运行"; exit 1; }; done
echo "① 正在连香港机（十几秒没动静是正常的，别关窗口）…"
ssh -o ConnectTimeout=20 $H 'rm -rf /tmp/gdnew && mkdir -p /tmp/gdnew'
echo "② 正在传文件…"
scp -q -o ConnectTimeout=20 hk/mj/server.mjs hk/mj/gdroom.mjs gd.js mj.js $H:/tmp/gdnew/
echo "③ 正在服务器上检查、换文件、重启、自检…"
ssh $H FORCE="${FORCE:-0}" 'bash -s' <<'R'
set -e
D=/opt/ailgns-mj; N=/tmp/gdnew
node --check $N/server.mjs && node --check $N/gdroom.mjs || { echo "❌ 新代码语法检查没过，什么都没改"; exit 1; }
ROOMS=$(curl -s http://127.0.0.1:8787/mj/health | sed -n 's/.*"rooms":\([0-9]*\).*/\1/p')
if [ "${ROOMS:-0}" != "0" ] && [ "$FORCE" != "1" ]; then echo "⏸ 现在有 $ROOMS 个房间在用，重启会结束牌局（房卡会退）。什么都没改；等没人了再运行，或者用 FORCE=1 bash hk/gd-deploy.sh"; exit 1; fi
B=/root/ailgns-mj.bak.$(date +%s); mkdir -p $B; cp -a $D/server.mjs $D/mj.js $B/ 2>/dev/null || true; [ -f $D/gdroom.mjs ] && cp -a $D/gdroom.mjs $D/gd.js $B/ || true
cp $N/server.mjs $N/gdroom.mjs $N/gd.js $N/mj.js $D/; chown root:root $D/*.mjs $D/*.js; chmod a+r $D/*.mjs $D/*.js
systemctl restart ailgns-mj; sleep 3
OK1=$(curl -s http://127.0.0.1:8787/mj/health); OK2=$(curl -s -X POST http://127.0.0.1:8787/mj/api -d '{"act":"gdinfo"}')
if echo "$OK1" | grep -q '"ok":true' && echo "$OK2" | grep -q '"ok":true'; then
  echo "✅ 装好了。麻将自检: $OK1"; echo "   掼蛋自检: $OK2"; echo "   旧文件备份在 $B"
else
  echo "❌ 自检没过，换回旧文件。麻将: $OK1  掼蛋: $OK2"; journalctl -u ailgns-mj -n 15 --no-pager | tail -15
  cp -a $B/server.mjs $B/mj.js $D/; rm -f $D/gdroom.mjs; [ -f $B/gdroom.mjs ] && cp -a $B/gdroom.mjs $B/gd.js $D/ || true
  systemctl restart ailgns-mj; sleep 3; echo "已换回旧版，麻将自检: $(curl -s http://127.0.0.1:8787/mj/health)"; exit 1
fi
R
