#!/bin/bash
# AiLGNS 香港中转服务器一键配置（Ubuntu 22.04/24.04）
# 用法（在腾讯云网页终端里，登录后粘贴）：
#   curl -fsSL https://ailgns.dev/hk/setup.sh | sudo bash
# 做的事：装 nginx、开 BBR、加技术团队的 SSH 公钥、配置反向代理：
#   /rpc  -> rpc.anubispace.org（链上节点）
#   /api/ -> ailgns.dev（Cloudflare 后端，GET 短缓存 + 出错给旧数据）
#   /     -> ailgns.dev（静态文件本地缓存）
# 注意：重跑本脚本会重写 nginx 站点配置，跑完要再跑一次 hk/mj-setup.sh（它会把麻将的 /mj/ 加回来）
set -e
export DEBIAN_FRONTEND=noninteractive

PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICQh8aaXQx+tP2SFYU1e722YPDB4dNvxmwgZa85Q5MSN libai-mac"

echo "== 1/5 系统更新 + 安装 nginx certbot"
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx curl >/dev/null

echo "== 2/5 SSH 公钥（技术团队远程维护用）"
for H in /root /home/ubuntu; do
  [ -d "$H" ] || continue
  mkdir -p "$H/.ssh" && chmod 700 "$H/.ssh"
  touch "$H/.ssh/authorized_keys"
  grep -qF "$PUBKEY" "$H/.ssh/authorized_keys" || echo "$PUBKEY" >> "$H/.ssh/authorized_keys"
  chmod 600 "$H/.ssh/authorized_keys"
  chown -R "$(stat -c %U "$H")" "$H/.ssh"
done
mkdir -p /etc/ssh/sshd_config.d
printf 'PermitRootLogin prohibit-password\nPubkeyAuthentication yes\n' > /etc/ssh/sshd_config.d/99-ailgns.conf
(systemctl reload ssh || systemctl reload sshd) 2>/dev/null || true

echo "== 3/5 开 BBR（大陆线路更顺）"
cat > /etc/sysctl.d/99-ailgns.conf <<'S'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.ipv4.tcp_fastopen=3
S
sysctl -p /etc/sysctl.d/99-ailgns.conf >/dev/null || true

echo "== 4/5 nginx 反向代理配置"
mkdir -p /var/cache/nginx/ailgns
cat > /etc/nginx/conf.d/ailgns-cache.conf <<'N'
proxy_cache_path /var/cache/nginx/ailgns levels=1:2 keys_zone=ailgns:64m max_size=3g inactive=7d use_temp_path=off;
map $request_method $ailgns_nocache { default 0; POST 1; }
N
cat > /etc/nginx/sites-available/ailgns <<'N'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    resolver 8.8.8.8 1.1.1.1 valid=300s ipv6=off;
    client_max_body_size 4m;
    gzip on; gzip_types text/plain text/css application/json application/javascript text/javascript image/svg+xml;

    # 测速用：发布页拿它量延迟
    location = /hk/ping.txt {
        add_header Access-Control-Allow-Origin * always;
        add_header Cache-Control no-store always;
        return 200 "ok\n";
    }

    # 链上节点中转：大陆直连香港，香港再去节点
    location /rpc {
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods "POST, GET, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Content-Type" always;
            add_header Access-Control-Max-Age 86400 always;
            return 204;
        }
        add_header Access-Control-Allow-Origin * always;
        proxy_pass https://rpc.anubispace.org/;
        proxy_set_header Host rpc.anubispace.org;
        proxy_ssl_server_name on;
        proxy_ssl_name rpc.anubispace.org;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 20s;
        proxy_hide_header Access-Control-Allow-Origin;
    }

    # 接口：GET 短缓存 + 后端出错时先给旧数据；POST 直通
    location /api/ {
        proxy_pass https://ailgns.dev;
        proxy_set_header Host ailgns.dev;
        proxy_ssl_server_name on;
        proxy_ssl_name ailgns.dev;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-HK-Proxy 1;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_cache ailgns;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_valid 200 5s;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
        proxy_cache_lock on;
        proxy_no_cache $ailgns_nocache;
        proxy_cache_bypass $ailgns_nocache;
        add_header X-HK-Cache $upstream_cache_status always;
    }

    # 首页：香港本地缓存 30 秒（源站写的是 max-age=0，这里不看它）；带参数的（/?v= /?fresh=）不走缓存，新版本马上能拿到
    location = / {
        proxy_pass https://ailgns.dev;
        proxy_set_header Host ailgns.dev;
        proxy_ssl_server_name on;
        proxy_ssl_name ailgns.dev;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_cache ailgns;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_ignore_headers Cache-Control Expires;
        proxy_cache_valid 200 30s;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
        proxy_cache_lock on;
        proxy_no_cache $is_args;
        proxy_cache_bypass $is_args;
        add_header X-HK-Cache $upstream_cache_status always;
    }

    # 网页和静态文件：香港本地缓存（带版本号的 js/css 按源站头缓存一年）
    location / {
        proxy_pass https://ailgns.dev;
        proxy_set_header Host ailgns.dev;
        proxy_ssl_server_name on;
        proxy_ssl_name ailgns.dev;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_cache ailgns;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_valid 200 301 302 2m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
        proxy_cache_lock on;
        add_header X-HK-Cache $upstream_cache_status always;
    }
}
N
ln -sf /etc/nginx/sites-available/ailgns /etc/nginx/sites-enabled/ailgns
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

echo "== 5/5 自检"
IP=$(curl -s --max-time 5 https://api.ipify.org || curl -s --max-time 5 ifconfig.me || echo "?")
echo "本机公网 IP: $IP"
curl -s --max-time 10 -o /dev/null -w "首页 via 本机: HTTP %{http_code}  %{time_total}s\n" http://127.0.0.1/ || true
curl -s --max-time 10 -o /dev/null -w "接口 via 本机: HTTP %{http_code}  %{time_total}s\n" http://127.0.0.1/api/px || true
curl -s --max-time 10 -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' http://127.0.0.1/rpc && echo
echo
echo "✅ 配置完成。把这个 IP 发给技术团队：$IP"
