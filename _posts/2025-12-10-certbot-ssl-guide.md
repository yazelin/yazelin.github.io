---
layout: post
title: Certbot SSL 憑證完整教學 - Let's Encrypt 免費 HTTPS
tags: [教學, SSL, HTTPS, Certbot, Let's Encrypt, Nginx, Docker, 資安]
---

[Certbot](https://certbot.eff.org/) 是 Let's Encrypt 官方推薦的 SSL 憑證自動化工具，可以免費取得並自動更新 HTTPS 憑證。本文記錄在 Ubuntu + Docker Nginx 環境下的完整設定流程。

> **實際成果**：[https://ching-tech.ddns.net](https://ching-tech.ddns.net) - 擎添工業官網
>
> **📖 前置知識**：
> - 本文使用 Docker 執行 Nginx，請參考 [Docker 基礎概念與常用指令]({% post_url 2025-12-13-docker-basics %})
> - 如果對 Linux 終端機不熟悉，請參考 [Linux 終端機入門]({% post_url 2025-12-13-linux-basics %})

---

## 目錄

1. [為什麼需要 HTTPS](#為什麼需要-https)
2. [環境說明](#環境說明)
3. [完整部署步驟](#完整部署步驟)
4. [Nginx 配置詳解](#nginx-配置詳解)
5. [Docker Compose 配置](#docker-compose-配置)
6. [自動更新設定](#自動更新設定)
7. [常用指令](#常用指令)
8. [疑難排解](#疑難排解)

---

## 為什麼需要 HTTPS？

| 項目 | HTTP | HTTPS |
|------|------|-------|
| 資料傳輸 | 明文 | 加密 |
| 瀏覽器顯示 | 「不安全」警告 | 鎖頭圖示 |
| SEO 排名 | 較低 | Google 優先 |
| 現代 API | 部分不支援 | 完整支援 |

現在的網站幾乎都需要 HTTPS，而 Let's Encrypt 提供免費的 SSL 憑證。

---

## 環境說明

### 伺服器資訊

| 項目 | 說明 |
|------|------|
| 伺服器 IP | 192.168.11.11 |
| 作業系統 | Ubuntu 24.04 LTS |
| Web Server | Nginx (Docker 容器) |
| 域名 | ching-tech.ddns.net (DDNS) |
| 後端服務 | 8098 (內網) / 8099 (外網) |

### 架構圖

```
                    ┌─────────────────────────────────────────┐
                    │         Ubuntu 主機 (192.168.11.11)      │
                    │                                         │
   外網請求          │  ┌─────────────────────────────────┐   │
   ching-tech.      │  │     Docker Network              │   │
   ddns.net    ────────▶│     (192.168.100.0/24)          │   │
                    │  │                                 │   │
   Port 80/443      │  │  ┌───────────────────────────┐  │   │
                    │  │  │  Nginx Container          │  │   │
                    │  │  │  (192.168.100.252)        │  │   │
                    │  │  │                           │  │   │
                    │  │  │  - SSL 終端               │  │   │
                    │  │  │  - 反向代理               │  │   │
                    │  │  │  - HTTP → HTTPS 重導向    │  │   │
                    │  │  └───────────────────────────┘  │   │
                    │  └─────────────────────────────────┘   │
                    │                   │                     │
                    │                   ▼                     │
                    │  ┌─────────────────────────────────┐   │
                    │  │  後端服務                        │   │
                    │  │  - Port 8098 (內網用)           │   │
                    │  │  - Port 8099 (外網用)           │   │
                    │  └─────────────────────────────────┘   │
                    │                                         │
                    │  ┌─────────────────────────────────┐   │
                    │  │  Certbot (主機上)                │   │
                    │  │  憑證: /etc/letsencrypt/        │   │
                    │  └─────────────────────────────────┘   │
                    └─────────────────────────────────────────┘
```

### 檔案位置

| 檔案 | 路徑 |
|------|------|
| Nginx 配置 | `~/nginx/default.conf` |
| Docker Compose | `~/nginx/docker-compose.yml` |
| SSL 憑證 | `/etc/letsencrypt/live/ching-tech.ddns.net/` |
| 更新 Hook | `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` |

---

## 完整部署步驟

### 步驟 1：安裝 Certbot

```bash
sudo apt update
sudo apt install -y certbot
```

驗證安裝：

```bash
certbot --version
# certbot 2.9.0
```

### 步驟 2：停止 Nginx 容器

取得憑證需要使用 80 port，必須先停止 Nginx：

```bash
cd ~/nginx
docker compose stop
```

### 步驟 3：取得 SSL 憑證

使用 Standalone 模式 + 非互動參數：

```bash
sudo certbot certonly --standalone \
  -d ching-tech.ddns.net \
  --non-interactive \
  --agree-tos \
  --email yazelin@ching-tech.com
```

參數說明：

| 參數 | 說明 |
|------|------|
| `certonly` | 只取得憑證，不自動設定 web server |
| `--standalone` | Certbot 自己啟動臨時 web server 驗證 |
| `-d` | 指定域名 |
| `--non-interactive` | 非互動模式，不會詢問問題 |
| `--agree-tos` | 同意服務條款 |
| `--email` | 聯絡信箱（憑證到期會收到提醒） |

成功後會顯示：

```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/ching-tech.ddns.net/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/ching-tech.ddns.net/privkey.pem
This certificate expires on 2026-03-10.
```

### 步驟 4：建立 Nginx 配置

建立 `~/nginx/default.conf`：

```bash
nano ~/nginx/default.conf
```

貼上以下內容（這是我們實際使用的完整配置）：

```nginx
# 統一配置：支援 jaba.ui 域名 + IP 分流

# 根據來源 IP 設定後端伺服器
geo $backend {
    default          192.168.11.11:8099;  # 外網 → 8099
    192.168.11.0/24  192.168.11.11:8098;  # 區網 → 8098
    192.168.11.1     192.168.11.11:8099;  # 路由器 NAT（外網流量）→ 8099
    192.168.100.0/24 192.168.11.11:8098;  # Docker → 8098
}

# 標記是否為內網 IP
geo $is_internal {
    default          0;  # 外網
    192.168.11.0/24  1;  # 區網
    192.168.11.1     0;  # 路由器 NAT（外網流量）→ 視為外網
    192.168.100.0/24 1;  # Docker
}

# HTTP server：處理 80 port 請求
server {
    listen 80 default_server;
    server_name _;

    # Let's Encrypt 驗證用（憑證更新時需要）
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # LINE Bot jaba API（需要 API Key 驗證）
    location /jaba-api/ {
        if ($http_x_api_key != "this_is_your_api_key") {
            return 403;
        }
        proxy_pass http://192.168.11.11:8098/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    location / {
        # 內網但域名不對 → 403
        if ($is_internal) {
            return 403;
        }
        # 外網 HTTP → 重導向到 HTTPS
        return 301 https://$host$request_uri;
    }
}

# HTTPS server：處理 443 port 請求
server {
    listen 443 ssl default_server;
    server_name ching-tech.ddns.net;

    # SSL 憑證路徑
    ssl_certificate /etc/letsencrypt/live/ching-tech.ddns.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ching-tech.ddns.net/privkey.pem;

    # SSL 安全設定（TLS 1.2 以上）
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # LINE Bot jaba API（需要 API Key 驗證）
    location /jaba-api/ {
        if ($http_x_api_key != "this_is_your_api_key") {
            return 403;
        }
        proxy_pass http://192.168.11.11:8098/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    location / {
        proxy_pass http://192.168.11.11:8099;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# jaba.ui server：處理內網 jaba 系統請求
server {
    listen 80;
    server_name jaba.ui;

    # 允許較大的請求 body（支援菜單圖片上傳）
    client_max_body_size 20m;

    # Socket.IO WebSocket 專用路徑
    location /socket.io/ {
        proxy_pass http://$backend;
        proxy_http_version 1.1;

        # WebSocket 必要 headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 延長 timeout（WebSocket 長連線需要）
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://$backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 延長 timeout（影像辨識需要較長時間）
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

### 步驟 5：建立 Docker Compose 配置

建立 `~/nginx/docker-compose.yml`：

```bash
nano ~/nginx/docker-compose.yml
```

貼上以下內容：

```yaml
services:
  nginx:
    image: nginx:latest
    container_name: nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ~/nginx:/etc/nginx/conf.d:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
    restart: always
    networks:
      bridge_network:
        ipv4_address: 192.168.100.252

networks:
  bridge_network:
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.100.0/24
          gateway: 192.168.100.1
```

配置說明：

| 設定 | 說明 |
|------|------|
| `ports: 80, 443` | 開放 HTTP 和 HTTPS |
| `~/nginx:/etc/nginx/conf.d:ro` | 掛載 Nginx 配置（唯讀） |
| `/etc/letsencrypt:/etc/letsencrypt:ro` | 掛載 SSL 憑證（唯讀） |
| `/var/www/certbot:/var/www/certbot:ro` | 掛載 Let's Encrypt 驗證目錄 |
| `ipv4_address: 192.168.100.252` | 固定容器 IP |

### 步驟 6：建立必要目錄

```bash
sudo mkdir -p /var/www/certbot
```

### 步驟 7：啟動 Nginx 容器

```bash
cd ~/nginx
docker compose up -d
```

確認容器運行：

```bash
docker ps
# 應該看到 nginx 容器正在運行
```

### 步驟 8：設定路由器 Port Forwarding

在路由器管理介面設定：

| 外部 Port | 內部 IP | 內部 Port | 協定 |
|-----------|---------|-----------|------|
| 80 | 192.168.11.11 | 80 | TCP |
| 443 | 192.168.11.11 | 443 | TCP |

### 步驟 9：驗證 HTTPS

```bash
# 測試 HTTPS
curl -s -o /dev/null -w "HTTPS: %{http_code}\n" https://ching-tech.ddns.net
# HTTPS: 200

# 測試 HTTP 重導向
curl -I http://ching-tech.ddns.net 2>&1 | grep Location
# Location: https://ching-tech.ddns.net/
```

---

## Nginx 配置詳解

### geo 指令：根據 IP 分流

```nginx
geo $backend {
    default          192.168.11.11:8099;  # 預設（外網）
    192.168.11.0/24  192.168.11.11:8098;  # 區網 IP
    192.168.100.0/24 192.168.11.11:8098;  # Docker 網段
}
```

用途：內網和外網連到不同的後端服務。

### HTTP → HTTPS 重導向

```nginx
location / {
    return 301 https://$host$request_uri;
}
```

所有 HTTP 請求自動跳轉到 HTTPS。

### SSL 憑證設定

```nginx
ssl_certificate /etc/letsencrypt/live/ching-tech.ddns.net/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/ching-tech.ddns.net/privkey.pem;
```

| 檔案 | 說明 |
|------|------|
| `fullchain.pem` | 完整憑證鏈（網站憑證 + 中繼憑證） |
| `privkey.pem` | 私鑰 |

### SSL 安全設定

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:...;
```

只允許 TLS 1.2 以上，禁用不安全的舊協定。

---

## Docker Compose 配置

### Volume 掛載說明

```yaml
volumes:
  - ~/nginx:/etc/nginx/conf.d:ro           # Nginx 配置
  - /etc/letsencrypt:/etc/letsencrypt:ro   # SSL 憑證
  - /var/www/certbot:/var/www/certbot:ro   # 驗證目錄
```

`:ro` 表示唯讀（read-only），增加安全性。

### 為什麼憑證放在主機而不是容器內？

1. **方便更新**：Certbot 在主機上運行，更新後容器自動讀到新憑證
2. **持久化**：容器重建不會遺失憑證
3. **安全性**：憑證不會被打包進 image

---

## 自動更新設定

Let's Encrypt 憑證有效期 90 天，需要定期更新。

### 系統自動排程

Ubuntu 安裝 Certbot 時自動建立 systemd timer：

```bash
# 查看 timer 狀態
systemctl list-timers | grep certbot
```

執行頻率：每天 00:00 和 12:00（隨機延遲最多 12 小時）

### 建立更新後 Hook

憑證更新後需要重載 Nginx，建立 deploy hook：

```bash
# 建立 hook 目錄
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy

# 建立 hook 腳本
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
# 憑證更新後重載 nginx 容器
docker exec nginx nginx -s reload
EOF

# 設定執行權限
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Hook 會在憑證更新成功後自動執行。

### 測試更新流程

```bash
# 模擬更新（不會真的更新）
sudo certbot renew --dry-run
```

---

## 常用指令

### 查看憑證資訊

```bash
sudo certbot certificates
```

輸出範例：

```
Certificate Name: ching-tech.ddns.net
  Domains: ching-tech.ddns.net
  Expiry Date: 2026-03-10 (VALID: 89 days)
  Certificate Path: /etc/letsencrypt/live/ching-tech.ddns.net/fullchain.pem
  Private Key Path: /etc/letsencrypt/live/ching-tech.ddns.net/privkey.pem
```

### 手動更新憑證

```bash
# 測試更新
sudo certbot renew --dry-run

# 強制更新（即使未到期）
sudo certbot renew --force-renewal
```

### 更新聯絡信箱

```bash
sudo certbot update_account --email new-email@example.com --no-eff-email
```

### 新增域名

```bash
# 需要先停止 nginx
docker compose stop

# 擴展憑證
sudo certbot certonly --standalone --expand \
  -d ching-tech.ddns.net \
  -d www.ching-tech.ddns.net

# 重啟 nginx
docker compose up -d
```

### 刪除憑證

```bash
sudo certbot delete --cert-name ching-tech.ddns.net
```

### 重載 Nginx 配置

```bash
# 不重啟容器，只重載配置
docker exec nginx nginx -s reload

# 或重啟整個容器
docker compose restart
```

---

## 疑難排解

### 問題 1：Port 80 被佔用

```
Problem binding to port 80: Could not bind to IPv4 or IPv6
```

解決：

```bash
# 找出佔用 80 port 的程式
sudo lsof -i :80

# 停止該服務後再執行 certbot
docker compose stop
sudo certbot certonly --standalone -d your-domain.com
docker compose up -d
```

### 問題 2：域名驗證失敗

```
DNS problem: NXDOMAIN looking up A for your-domain.com
```

檢查項目：

1. DNS 設定是否正確（A 記錄指向正確 IP）
2. 防火牆是否開放 80 port
3. 路由器是否設定 port forwarding

### 問題 3：憑證更新失敗

```bash
# 查看更新日誌
sudo cat /var/log/letsencrypt/letsencrypt.log

# 手動測試更新
sudo certbot renew --dry-run
```

### 問題 4：Nginx 無法讀取憑證

```
cannot load certificate "/etc/letsencrypt/...": No such file or directory
```

檢查 Docker Compose volume 掛載：

```bash
# 確認憑證目錄存在
ls -la /etc/letsencrypt/live/

# 確認 docker-compose.yml 有掛載
grep letsencrypt ~/nginx/docker-compose.yml
```

### 問題 5：HTTPS 無法連線

檢查項目：

```bash
# 1. 確認 nginx 容器運行中
docker ps | grep nginx

# 2. 確認 443 port 有監聽
docker exec nginx netstat -tlnp | grep 443

# 3. 測試本機連線
curl -k https://localhost

# 4. 確認路由器 443 port forwarding
```

---

## 快速參考

### 部署 Checklist

- [ ] 安裝 Certbot：`sudo apt install certbot`
- [ ] 停止 Nginx：`docker compose stop`
- [ ] 取得憑證：`sudo certbot certonly --standalone -d domain.com`
- [ ] 建立 Nginx 配置：`~/nginx/default.conf`
- [ ] 建立 Docker Compose：`~/nginx/docker-compose.yml`
- [ ] 建立目錄：`sudo mkdir -p /var/www/certbot`
- [ ] 啟動 Nginx：`docker compose up -d`
- [ ] 設定路由器 port forwarding（80, 443）
- [ ] 建立更新 Hook：`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`
- [ ] 驗證 HTTPS：`curl https://your-domain.com`

### 常用指令速查

| 動作 | 指令 |
|------|------|
| 查看憑證 | `sudo certbot certificates` |
| 測試更新 | `sudo certbot renew --dry-run` |
| 強制更新 | `sudo certbot renew --force-renewal` |
| 重載 Nginx | `docker exec nginx nginx -s reload` |
| 查看日誌 | `docker logs nginx` |

---

## 相關連結

### 內部文章

- [擎添工業官方網站]({{ site.baseurl }}/ching-tech-website/) - 本文 HTTPS 設定的目標網站
- [呷爸 jaba 點餐系統]({{ site.baseurl }}/jaba/) - nginx 配置中 jaba.ui 的後端系統
- [Jaba LINE Bot]({{ site.baseurl }}/jaba-line-bot/) - nginx 配置中 /jaba-api/ 的服務
- [LINE Bot 開發入門]({{ site.baseurl }}/line-bot-guide/) - LINE Bot 開發教學

### 外部資源

- [Let's Encrypt 官網](https://letsencrypt.org/)
- [Certbot 官方文件](https://certbot.eff.org/docs/)
- [SSL Labs 測試工具](https://www.ssllabs.com/ssltest/) - 測試 SSL 設定安全性
- [Mozilla SSL 設定產生器](https://ssl-config.mozilla.org/)
