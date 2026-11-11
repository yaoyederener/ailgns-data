#!/bin/bash
# 香港机上装「麻将联机房间服务」：Node 常驻（不装第三方包），普通用户身份跑，nginx 把 https://ailgnsotc.cc/mj/ 转给它
# 用法（在 Mac 的 ailgns-data 目录运行）：
#   ssh root@140.235.99.27 mkdir -p /opt/ailgns-mj/vendor && scp hk/mj/server.mjs mj.js lib/evmsig.js root@140.235.99.27:/opt/ailgns-mj/ && scp lib/vendor/secp256k1.js root@140.235.99.27:/opt/ailgns-mj/vendor/ && scp hk/mj-setup.sh root@140.235.99.27:/root/ && ssh root@140.235.99.27 bash /root/mj-setup.sh
# 以后只更新代码：重复上面的 scp，然后 ssh root@140.235.99.27 systemctl restart ailgns-mj（没打完的房间会自动退房卡）
set -e
command -v node >/dev/null || { apt-get update -qq; apt-get install -y -qq nodejs >/dev/null; }
id ailgnsmj >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ailgnsmj
mkdir -p /opt/ailgns-mj/vendor /var/lib/ailgns-mj
echo '{"type":"module"}' > /opt/ailgns-mj/package.json  # 让 Node 把 evmsig.js 这些 .js 当成 ES 模块
chown -R root:root /opt/ailgns-mj; chmod -R a+rX /opt/ailgns-mj
chown -R ailgnsmj:ailgnsmj /var/lib/ailgns-mj; chmod 700 /var/lib/ailgns-mj

cat > /etc/systemd/system/ailgns-mj.service <<"U"
[Unit]
Description=AiLGNS mahjong room server
After=network-online.target
[Service]
User=ailgnsmj
Group=ailgnsmj
WorkingDirectory=/opt/ailgns-mj
ExecStart=/usr/bin/node --max-old-space-size=220 /opt/ailgns-mj/server.mjs
Restart=always
RestartSec=3
Environment=TZ=Asia/Shanghai
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/ailgns-mj
InaccessiblePaths=/etc/ailgns
MemoryMax=320M
[Install]
WantedBy=multi-user.target
U

# nginx：/mj/ 转给本机 8787；每个 IP 每秒最多 20 个请求
cat > /etc/nginx/conf.d/ailgns-mj.conf <<"N"
limit_req_zone $binary_remote_addr zone=mj:10m rate=20r/s;
N
F=/etc/nginx/sites-available/ailgns
if ! grep -q "location /mj/" $F; then
  cp $F /root/ailgns.nginx.bak.$(date +%s)
  python3 - "$F" <<"P"
import sys
p = sys.argv[1]; s = open(p).read()
blk = """    location /mj/ {
        limit_req zone=mj burst=60 nodelay;
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 60s;
        client_max_body_size 8k;
    }
"""
k = "    location /rpc {"
assert s.count(k) == 1
open(p, "w").write(s.replace(k, blk + k))
P
fi
nginx -t
systemctl daemon-reload
systemctl enable -q ailgns-mj
systemctl restart ailgns-mj
systemctl reload nginx
sleep 2
echo "服务状态: $(systemctl is-active ailgns-mj)   本机自检: $(curl -s http://127.0.0.1:8787/mj/health)"
