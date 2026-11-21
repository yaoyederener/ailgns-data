#!/bin/bash
# 自建节点对外转发（ailgns-rpc-1）。站长 2026-11-21 点头：装 nginx + 证书、开 80/443。可以重复跑。
#   节点 geth 仍然只听本机；对外只有 nginx，而且防火墙只放 Cloudflare 的 IP（域名在 Cloudflare 上开橙色云朵）。
#   用法：把本目录的 rpc.js 和这个脚本传到服务器 /root/rpc-setup/ ，然后 bash rpc-setup.sh rpc.ailgns.dev
set -euo pipefail
HOST="${1:-rpc.ailgns.dev}"
export DEBIAN_FRONTEND=noninteractive
echo "== 1/6 装 nginx + njs + certbot"
apt-get update -qq
apt-get install -y -qq nginx libnginx-mod-http-js certbot python3-certbot-nginx curl openssl >/dev/null

echo "== 2/6 门卫脚本"
install -d -m 755 /etc/nginx/njs
install -m 644 "$(dirname "$0")/rpc.js" /etc/nginx/njs/rpc.js

echo "== 3/6 Cloudflare 的 IP 段（真实访客 IP + 防火墙白名单）"
CF4=$(curl -fsS https://www.cloudflare.com/ips-v4); CF6=$(curl -fsS https://www.cloudflare.com/ips-v6)
[ "$(echo "$CF4" | grep -cE '^[0-9.]+/[0-9]+$')" -ge 10 ] || { echo "Cloudflare IP 段没取到"; exit 1; }
{ for c in $CF4 $CF6; do echo "set_real_ip_from $c;"; done; echo "real_ip_header CF-Connecting-IP;"; } > /etc/nginx/conf.d/cf-realip.conf

echo "== 4/6 证书（先用自签的顶着；域名解析好之后再跑 certbot 换成正式的）"
install -d -m 700 /etc/nginx/selfsigned
[ -f /etc/nginx/selfsigned/rpc.crt ] || openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=$HOST" -keyout /etc/nginx/selfsigned/rpc.key -out /etc/nginx/selfsigned/rpc.crt 2>/dev/null

echo "== 5/6 nginx 配置"
cat > /etc/nginx/conf.d/anubis-rpc.conf <<CONF
js_import rpc from /etc/nginx/njs/rpc.js;
js_fetch_max_response_buffer_size 32m;
limit_req_zone \$binary_remote_addr zone=rpc_ip:20m rate=100r/s;
limit_conn_zone \$server_name zone=rpc_all:1m;
server {
    listen 80; listen [::]:80;
    listen 443 ssl; listen [::]:443 ssl;
    server_name $HOST;
    ssl_certificate /etc/nginx/selfsigned/rpc.crt;
    ssl_certificate_key /etc/nginx/selfsigned/rpc.key;
    server_tokens off;
    client_max_body_size 512k;
    client_body_buffer_size 512k;
    access_log /var/log/nginx/rpc.access.log;
    error_log /var/log/nginx/rpc.error.log warn;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location = / {
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
        add_header Access-Control-Max-Age "86400" always;
        add_header Cache-Control "no-store" always;
        # 节点落后（最新块超过 90 秒没更新）或没在跑：/run/anubis-rpc-ok 会被体检脚本删掉，这里直接回 503，调用方自动换别的节点
        if (!-f /run/anubis-rpc-ok) { return 503; }
        limit_req zone=rpc_ip burst=200 nodelay;
        limit_conn rpc_all 200;
        js_content rpc.handle;
    }
    location / { return 404; }
}
# 别的域名 / 直接拿 IP 来敲门的：不理
server {
    listen 80 default_server; listen [::]:80 default_server;
    listen 443 ssl default_server; listen [::]:443 ssl default_server;
    server_name _;
    ssl_certificate /etc/nginx/selfsigned/rpc.crt;
    ssl_certificate_key /etc/nginx/selfsigned/rpc.key;
    server_tokens off;
    return 444;
}
CONF
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable -q nginx
systemctl reload nginx || systemctl restart nginx

echo "== 6/6 体检：每 20 秒看一次节点的最新块，新鲜才对外"
cat > /usr/local/bin/anubis-rpc-check <<'CHK'
#!/bin/bash
ts=$(curl -s -m 5 -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}' http://127.0.0.1:8545 | grep -oE '"timestamp":"0x[0-9a-f]+"' | grep -oE '0x[0-9a-f]+' | head -1)
now=$(date +%s)
if [ -n "$ts" ] && [ $(( now - ts )) -lt 90 ]; then touch /run/anubis-rpc-ok; else rm -f /run/anubis-rpc-ok; fi
CHK
chmod 755 /usr/local/bin/anubis-rpc-check
cat > /etc/systemd/system/anubis-rpc-check.service <<'UNIT'
[Unit]
Description=Anubis RPC freshness check (controls /run/anubis-rpc-ok)
[Service]
Type=oneshot
ExecStart=/usr/local/bin/anubis-rpc-check
UNIT
cat > /etc/systemd/system/anubis-rpc-check.timer <<'UNIT'
[Unit]
Description=Run Anubis RPC freshness check every 20s
[Timer]
OnBootSec=10s
OnUnitActiveSec=20s
AccuracySec=1s
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable -q --now anubis-rpc-check.timer
/usr/local/bin/anubis-rpc-check

echo "== 防火墙：80/443 只放 Cloudflare"
for c in $CF4 $CF6; do ufw allow proto tcp from "$c" to any port 80,443 comment 'cloudflare' >/dev/null; done
ufw status | grep -c cloudflare
echo "完成。域名解析（橙色云朵）好了之后：certbot --nginx -d $HOST"
