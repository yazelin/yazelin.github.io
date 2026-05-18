---
layout: post
title: "SSH 實戰應用場景：咖啡廳連內網、翻牆、遠端 Demo"
subtitle: "四個真實場景的完整操作步驟，從網路架構到指令一次搞懂"
date: 2026-04-15
categories: [Linux]
tags: [SSH, Linux, Network, Tunnel, SOCKS Proxy, Port Forwarding]
---

![SSH 實戰應用場景：咖啡廳連內網、翻牆、遠端 Demo](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-15-ssh-scenarios.png)

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — ssh-keygen 參數、多金鑰管理
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — X11、Tunnel、跳板機
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - **（四）本篇：SSH 實戰應用場景**
> - [（番外一）Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案
> - [（番外二）Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 為什麼寫這篇

前面三篇學了金鑰、參數、資安，但碰到實際場景時，新手工程師最常問的是：

「我知道有 `-L`、`-D`、`-J`，但我現在的情況到底要怎麼組合？Router 要怎麼設定？公司防火牆怎麼搞？」

這篇用**四個真實場景**，從網路架構圖、Router 設定、到最後能直接複製的指令，完整走一遍。

---

## 場景一：咖啡廳連回公司內網

### 故事

你是後端工程師，週末在咖啡廳趕進度。你需要：
- SSH 連到公司內網的開發機寫 code
- 用瀏覽器存取內網的 GitLab（`gitlab.internal:80`）
- 連到內網的測試資料庫（`db.internal:5432`）

但公司內網主機沒有對外 IP，從咖啡廳直接連不到。

### 網路架構

```
                              公司防火牆 / Router
                                     │
┌──────────┐      網際網路      ┌────┴─────────┐      公司內網
│ 你的筆電  │ ──────────────→  │   跳板機       │
│ (咖啡廳)  │                  │ jump.company  │
│           │                  │ .com          │
│           │                  │ 對外 port 2222│
└──────────┘                  └──────┬────────┘
                                     │ 內網 10.0.0.0/8
                          ┌──────────┼──────────┐
                          │          │          │
                     ┌────┴───┐ ┌───┴────┐ ┌──┴───────┐
                     │ 開發機  │ │ GitLab │ │ 測試 DB  │
                     │10.0.0.50│ │10.0.0.60│ │10.0.0.70│
                     │ :22    │ │ :80    │ │ :5432   │
                     └────────┘ └────────┘ └──────────┘
```

### 公司 Router / 防火牆設定

```
需要開放的 port（只有一個！）：

外部 port 2222  →  轉發到跳板機 10.0.0.10:2222
                   （只有這一個入口對外）

不需要開放：
  - 開發機的 SSH port        ← 內網才能連
  - GitLab 的 80 port        ← 內網才能連
  - 資料庫的 5432 port       ← 內網才能連
```

> **重點**：Router 只需要開放跳板機的 SSH port，其他所有內網服務都透過 SSH Tunnel 存取，不需要額外開 port。

### 步驟一：SSH 連到開發機

```bash
# 一行指令，透過跳板機連到內網開發機
ssh -J admin@jump.company.com:2222 deploy@10.0.0.50
```

### 步驟二：同時建立 Tunnel 存取 GitLab 和資料庫

```bash
# 完整組合技
ssh -J admin@jump.company.com:2222 \
    -L 8080:10.0.0.60:80 \
    -L 5432:10.0.0.70:5432 \
    deploy@10.0.0.50
```

連上後：
- `localhost:8080` → 公司 GitLab
- `localhost:5432` → 測試資料庫
- 同時你已經在開發機的 shell 裡了

### 步驟三：寫進 config 不用每次打

```bash
# ~/.ssh/config

Host jump
    HostName jump.company.com
    User admin
    Port 2222
    IdentityFile ~/.ssh/company_key

Host dev
    HostName 10.0.0.50
    User deploy
    ProxyJump jump
    IdentityFile ~/.ssh/company_key
    LocalForward 8080 10.0.0.60:80
    LocalForward 5432 10.0.0.70:5432
```

```bash
# 之後只要打
ssh dev
# 自動走跳板機、自動建立所有 tunnel
```

### 安全注意事項

```
咖啡廳 Wi-Fi 的風險：
  ✗ 有人在同一個 Wi-Fi 監聽你的流量
  ✓ SSH 連線是加密的，監聽者只看到亂碼
  ✓ 透過 tunnel 存取的 GitLab、DB 流量也在 SSH 加密通道內

但要注意：
  ✗ 瀏覽器直接上網的流量（不走 tunnel 的）還是不安全
  → 如果需要保護所有流量，用 -D 建立 SOCKS proxy（見場景二）
```

---

## 場景二：人在中國，用 SSH 翻牆

### 故事

你被派到中國出差兩週，需要存取 Google、GitHub、ChatGPT。公司在台灣有一台主機（或你有自己的海外 VPS），你打算用 SSH Tunnel 當作 VPN。

### 網路架構

```
┌──────────────┐                         ┌──────────────┐
│  你的筆電     │       SSH 加密通道       │  台灣的主機   │
│  (中國飯店)   │ =====================> │  (公司/VPS)   │
│              │                         │              │
│  瀏覽器設定   │                         │  幫你存取     │
│  SOCKS5      │                         │  所有網站     │
│  proxy       │                         │              │
│  localhost   │                         │  ┌─→ Google  │
│  :1080       │                         │  ├─→ GitHub  │
│              │                         │  ├─→ ChatGPT │
│              │                         │  └─→ 任何網站 │
└──────────────┘                         └──────────────┘
  GFW 只看到一條                           對外網站看到的
  普通的 SSH 連線                           IP 是台灣的
  （加密，看不到內容）
```

### 操作步驟

**步驟一：建立 SOCKS proxy**

```bash
ssh -D 1080 -fN \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    -p 443 \
    username@your-taiwan-server
```

參數解釋：
- `-D 1080`：在本機建立 SOCKS5 proxy
- `-fN`：放到背景，不開 shell
- `ServerAliveInterval`：每 60 秒發 keep-alive，防止連線被切
- `-p 443`：用 443 port（下面會解釋為什麼）

**步驟二：設定瀏覽器**

Firefox（推薦，可以單獨設定 proxy）：
```
設定 → 網路設定 → 手動設定 Proxy
  SOCKS Host: localhost
  Port: 1080
  選擇 SOCKS v5
  ☑ 透過 SOCKS 代理 DNS（重要！防止 DNS 洩漏）
```

Chrome（會套用到整個系統）：
```bash
# macOS / Linux
google-chrome --proxy-server="socks5://localhost:1080"

# 或者用 SwitchyOmega 擴充套件，更靈活
```

**步驟三：驗證是否成功**

```bash
# 用 curl 透過 proxy 測試
curl --socks5-hostname localhost:1080 https://www.google.com
# 有回應 = 成功

# 確認你的出口 IP
curl --socks5-hostname localhost:1080 https://ifconfig.me
# 應該顯示台灣主機的 IP
```

### 為什麼用 port 443？

```
GFW 的封鎖策略：
  - Port 22（SSH 預設）→ 可能被特徵偵測或直接封鎖
  - Port 443（HTTPS 預設）→ 全世界的網站都在用，不太可能封

台灣主機的 sshd_config：
  Port 443      # 把 SSH 偽裝成 HTTPS 流量
  Port 22       # 保留原本的 port（平時用）
```

```bash
# 台灣主機的防火牆
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
```

### 連線不穩定時的備案

```bash
# 方案一：搭配 ControlMaster 保持連線
# ~/.ssh/config
Host tunnel-tw
    HostName your-taiwan-server
    Port 443
    User username
    DynamicForward 1080
    ServerAliveInterval 30
    ServerAliveCountMax 5
    ControlMaster auto
    ControlPath ~/.ssh/sockets/%r@%h-%p
    ControlPersist 600

# 連線
ssh -fN tunnel-tw

# 方案二：用 autossh 自動重連
sudo apt install autossh
autossh -M 0 -D 1080 -fN \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -p 443 username@your-taiwan-server
# autossh 會在連線斷掉時自動重新建立
```

### 注意事項

```
⚠️ 法律風險：
  - 在中國使用未經批准的 VPN/代理存取被封鎖的網站可能違反當地法規
  - 本文僅供技術學習參考
  - 出差時建議使用公司提供的合規 VPN 方案

⚠️ 技術限制：
  - GFW 的封鎖技術持續升級，SSH tunnel 不保證 100% 可用
  - 長時間大流量的 SSH 連線可能被偵測
  - DNS 洩漏：務必勾選「透過 SOCKS 代理 DNS」
```

---

## 場景三：在家連公司，不想裝 VPN Client

### 故事

你在家工作，需要存取公司的 GitLab、Jira、和測試資料庫。公司有 VPN，但 VPN client 很肥、常當機、而且連上後所有流量都走 VPN（看 YouTube 也變慢）。

你只想透過 SSH Tunnel 存取需要的服務就好。

### 網路架構

```
┌──────────────┐                    ┌──────────────┐       公司內網
│  你家的電腦   │    SSH Tunnel      │   跳板機      │
│              │ =================> │              │
│ localhost    │                    │              │
│  :8080 ─────────────────────────────→ GitLab  :80  (10.0.0.60)
│  :8090 ─────────────────────────────→ Jira    :80  (10.0.0.61)
│  :5432 ─────────────────────────────→ DB      :5432(10.0.0.70)
│              │                    │              │
│ YouTube 正常 │                    │              │
│ (不走 tunnel)│                    │              │
└──────────────┘                    └──────────────┘
```

### SSH Tunnel vs VPN 比較

| | VPN | SSH Tunnel |
|---|---|---|
| 流量範圍 | 所有流量都走 VPN | 只有指定的 port 走 tunnel |
| 看 YouTube | 變慢（繞公司出去） | 正常（直連） |
| 需要安裝 | VPN client | 不用，內建 SSH |
| 設定彈性 | 公司 IT 決定 | 自己決定要轉哪些 port |
| 安全性 | 整體較高 | 只保護指定服務 |

### 操作步驟

```bash
# 一次建立多條 tunnel
ssh -fN \
    -L 8080:10.0.0.60:80 \
    -L 8090:10.0.0.61:80 \
    -L 5432:10.0.0.70:5432 \
    -J admin@jump.company.com:2222 \
    deploy@10.0.0.50

# 現在可以：
# 瀏覽器開 http://localhost:8080  → 公司 GitLab
# 瀏覽器開 http://localhost:8090  → 公司 Jira
# psql -h localhost -p 5432       → 公司測試 DB
# YouTube、Netflix 完全不受影響
```

### 寫進 config + 一鍵啟動腳本

```bash
# ~/.ssh/config
Host work-tunnel
    HostName 10.0.0.50
    User deploy
    ProxyJump admin@jump.company.com:2222
    IdentityFile ~/.ssh/company_key
    LocalForward 8080 10.0.0.60:80
    LocalForward 8090 10.0.0.61:80
    LocalForward 5432 10.0.0.70:5432
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

```bash
# ~/bin/work-connect.sh
#!/bin/bash

# 檢查 tunnel 是否已經建立
if ssh -O check work-tunnel 2>/dev/null; then
    echo "Tunnel 已經在跑了"
else
    echo "建立 tunnel..."
    ssh -fN work-tunnel
    echo "完成！"
    echo "  GitLab: http://localhost:8080"
    echo "  Jira:   http://localhost:8090"
    echo "  DB:     localhost:5432"
fi
```

```bash
chmod +x ~/bin/work-connect.sh

# 每天早上開工時
./work-connect.sh
```

---

## 場景四：臨時 Demo 本機開發中的網站給客戶

### 故事

你在本機 `localhost:3000` 跑了一個開發中的網站，客戶想看 Demo。但你的筆電沒有對外 IP（在 NAT 後面），客戶也不在同一個網路。

你有一台有對外 IP 的 VPS。

### 網路架構

```
┌──────────────┐                    ┌──────────────┐
│  你的筆電     │     SSH -R         │   你的 VPS    │
│  (沒有對外 IP)│ =================>│  (有對外 IP)   │
│              │                    │  203.0.113.10 │
│  localhost   │                    │              │
│  :3000       │◄────── tunnel ─────│  :8080       │
│  (開發中網站) │                    │  (對外開放)   │
└──────────────┘                    └──────┬───────┘
                                          │
                                   ┌──────┴───────┐
                                   │   客戶的瀏覽器 │
                                   │              │
                                   │  瀏覽器打開    │
                                   │  http://203.  │
                                   │  0.113.10:8080│
                                   └──────────────┘
```

跟 `-L` 的方向相反：這次是**遠端的人要存取你的本機**。

### VPS 前置設定

```bash
# VPS 的 /etc/ssh/sshd_config 加上：
GatewayPorts yes
# 這樣 -R 才能綁定 0.0.0.0（讓外部連進來）

sudo systemctl restart sshd

# VPS 防火牆開放 8080
sudo ufw allow 8080/tcp
```

### 操作步驟

```bash
# 在你的筆電上執行
ssh -R 0.0.0.0:8080:localhost:3000 username@203.0.113.10

# 現在把這個網址給客戶：
# http://203.0.113.10:8080
# 客戶看到的就是你筆電上 localhost:3000 的內容
```

### 加上安全防護

Demo 完記得關掉，不然你的開發中網站就一直對外開放。也可以加上簡單的存取限制：

```bash
# 方法一：限制只有客戶的 IP 能連
# 在 VPS 上
sudo ufw allow from 客戶的IP to any port 8080 proto tcp
sudo ufw deny 8080/tcp  # 其他人擋掉

# 方法二：不用 0.0.0.0，只允許 VPS 本機存取
ssh -R 8080:localhost:3000 username@203.0.113.10
# 再搭配 nginx 反向代理 + Basic Auth

# 方法三：用完就關
# Ctrl+C 斷開 SSH 連線，tunnel 自動消失
```

### 跟 ngrok 的比較

| | SSH -R | ngrok |
|---|---|---|
| 需要 | 一台有對外 IP 的 VPS | 不需要，用 ngrok 的伺服器 |
| 費用 | VPS 的費用（可能已經有了） | 免費版有限制，付費版月費 |
| 網址 | IP 或自己的 domain | ngrok 提供隨機 subdomain |
| 速度 | 看 VPS 位置 | 看 ngrok 伺服器位置 |
| 設定 | 需要設定 sshd_config | 下載一個執行檔就好 |

---

## 四個場景速查表

| 場景 | 指令 | 關鍵參數 | Router 需開放 |
|------|------|---------|-------------|
| 咖啡廳連內網 | `ssh -J jump dev` | `-J` + `-L` | 跳板機 SSH port |
| 翻牆 | `ssh -D 1080 -p 443 server` | `-D` | 443（偽裝 HTTPS） |
| 在家替代 VPN | `ssh -fN -L ... jump` | `-L`（多條） | 跳板機 SSH port |
| Demo 給客戶 | `ssh -R 0.0.0.0:8080:localhost:3000 vps` | `-R` | 8080 + SSH port |

---

## 總結

SSH Tunnel 的本質很簡單：**所有流量都藏在 SSH 加密通道裡**。

不管是連內網、翻牆、還是對外 Demo，Router 和防火牆只需要開放 SSH 的 port，其他所有服務都在 tunnel 裡面，外面看不到也碰不到。

掌握 `-L`（本機到遠端）、`-R`（遠端到本機）、`-D`（全部流量）這三種 tunnel，再搭配 `-J`（跳板機）和 `-fN`（背景執行），幾乎所有網路存取的場景都能搞定。

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — 從產生金鑰到多金鑰管理
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — 每個參數的用途和執行條件
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - **（四）本篇：SSH 實戰應用場景**
> - [（番外一）Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案
> - [（番外二）Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 參考資源

- [ssh(1) — OpenBSD Manual Pages](https://man.openbsd.org/ssh.1)
- [ssh_config(5) — OpenBSD Manual Pages](https://man.openbsd.org/ssh_config.5)
- [OpenSSH Cookbook — Tunnels](https://en.wikibooks.org/wiki/OpenSSH/Cookbook/Tunnels)
- [autossh — GitHub](https://github.com/Autossh/autossh)
