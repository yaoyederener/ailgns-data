#!/bin/bash
# 香港机上装「撮合机器人常驻循环」：每 3 秒检查 LGNS / AiLGNS 市场的交叉单，有就调用撮合合约（合约只认触发钱包 0x89dd）
# 用法（在 Mac 上运行，会提示你粘贴触发钱包私钥，私钥只进服务器的 /etc/ailgns/keeper.env）：
#   ssh -t root@140.235.99.27 'bash -s' < hk/matcher-setup.sh
set -e
umask 077
mkdir -p /opt/ailgns /etc/ailgns
apt-get install -y -qq git python3-venv >/dev/null 2>&1 || true
cd /opt/ailgns
[ -d monita ] || git clone -q https://github.com/yaoyederener/monita.git
(cd monita && git pull -q)
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -q "eth-account==0.13.4"

cat > /opt/ailgns/matcher-loop.sh <<"EOF"
#!/bin/bash
cd /opt/ailgns/monita
set -a; [ -f /etc/ailgns/keeper.env ] && . /etc/ailgns/keeper.env; set +a
while true; do
  /opt/ailgns/venv/bin/python -u otc_matcher.py 2>&1 | grep -v "没有能撮合的单" | while IFS= read -r l; do echo "$(date '+%m-%d %H:%M:%S') $l"; done >> /var/log/ailgns-matcher.log
  sleep 3
done
EOF
chmod 755 /opt/ailgns/matcher-loop.sh

cat > /etc/systemd/system/ailgns-matcher.service <<"EOF"
[Unit]
Description=AiLGNS OTC matcher loop
After=network-online.target
[Service]
ExecStart=/opt/ailgns/matcher-loop.sh
Restart=always
RestartSec=5
Environment=TZ=Asia/Shanghai
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/logrotate.d/ailgns-matcher <<"EOF"
/var/log/ailgns-matcher.log { daily rotate 7 compress missingok notifempty copytruncate }
EOF

cat > /etc/cron.daily/ailgns-monita-pull <<"EOF"
#!/bin/sh
cd /opt/ailgns/monita && git pull -q && systemctl restart ailgns-matcher
EOF
chmod 755 /etc/cron.daily/ailgns-monita-pull

# 私钥：只有这一步需要你动手，粘贴后回车，屏幕不回显
if [ ! -s /etc/ailgns/keeper.env ]; then
  if [ -t 0 ]; then
    read -rs -p "粘贴 1Password「AiLGNS · 触发钱包私钥」后回车: " k; echo
    printf 'OTC_KEEPER_KEY=%s\n' "$k" > /etc/ailgns/keeper.env
  else
    echo "（没有终端，跳过私钥；之后用 ssh -t 再跑一次本脚本）"
  fi
fi
chmod 600 /etc/ailgns/keeper.env 2>/dev/null || true

systemctl daemon-reload
systemctl enable -q ailgns-matcher
systemctl restart ailgns-matcher
sleep 6
echo "服务状态: $(systemctl is-active ailgns-matcher)   私钥文件: $(wc -c < /etc/ailgns/keeper.env) 字节"
echo "最近日志:"; tail -5 /var/log/ailgns-matcher.log 2>/dev/null || echo "（还没有可撮合的单，日志为空是正常的）"
