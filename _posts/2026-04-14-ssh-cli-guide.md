---
layout: post
title: "SSH 連線參數完整指南：從基礎到進階 Tunnel"
subtitle: "每個參數的用途、執行條件、實戰範例一次搞懂"
date: 2026-04-14
categories: [Linux]
tags: [SSH, Linux, Network, Security, Terminal, Port Forwarding, X11]
---

![SSH 連線參數完整指南：從基礎到進階 Tunnel](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-14-ssh-cli-guide.png)

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — ssh-keygen 參數、多金鑰管理
> - **（二）本篇：SSH 連線參數完整指南**
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - [（四）SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - [（番外一）Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案
> - [（番外二）Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 為什麼寫這篇

SSH 是工程師每天都在用的工具，但大多數人只會 `ssh user@host`，碰到需要轉 port、傳 GUI 畫面、跳板機連線時才發現不知道怎麼下參數。

這篇整理了 SSH 常用到進階的所有連線參數，每個參數都會說明：

- **用途**：這個參數做什麼
- **執行條件**：需要什麼前置設定才能生效
- **實際範例**：可以直接複製使用的指令

> 還沒產生 SSH 金鑰？先看上一篇：[SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %})

---

## 基礎連線參數

### 無參數：基本連線

```bash
ssh username@192.168.1.100
```

- **執行條件**：遠端主機有開 SSH server（預設 port 22）、知道帳號密碼或已設定金鑰

### `-p`：指定埠號

```bash
ssh -p 2222 username@host
```

- **用途**：連線到非預設的 SSH port
- **執行條件**：遠端 SSH server 有監聽該 port
- **常見情境**：公司伺服器為了安全把 SSH port 改掉

### `-i`：指定私鑰檔案

```bash
ssh -i ~/.ssh/my_project_key username@host
```

- **用途**：使用指定的私鑰進行認證，而非預設的 `~/.ssh/id_rsa` 或 `~/.ssh/id_ed25519`
- **執行條件**：
  - 私鑰檔案權限必須是 `600`（`chmod 600 ~/.ssh/my_project_key`）
  - 對應的公鑰已經加到遠端的 `~/.ssh/authorized_keys`

### `-v` / `-vv` / `-vvv`：除錯模式

```bash
# 基本除錯資訊
ssh -v username@host

# 更詳細
ssh -vv username@host

# 最詳細（通常用於排查認證問題）
ssh -vvv username@host
```

- **用途**：印出連線過程的詳細資訊，排查連線失敗原因
- **執行條件**：無，任何情況都能加
- **常見情境**：金鑰認證失敗、不確定用了哪把 key、連線 timeout 原因不明

---

## 遠端執行參數

### 直接執行指令

```bash
# 執行完就斷線
ssh username@host "df -h"

# 多個指令
ssh username@host "cd /var/log && tail -n 50 syslog"
```

- **用途**：不進入互動 shell，直接在遠端執行指令並回傳結果
- **執行條件**：無特殊條件

### `-t`：強制分配 pseudo-terminal

```bash
# 在遠端執行互動式指令
ssh -t username@host "sudo apt update"

# 多層跳板時需要
ssh -t jump_host ssh -t target_host
```

- **用途**：某些互動式指令（如 `sudo`、`top`、`vim`）需要 TTY 才能正常運作
- **執行條件**：無特殊條件
- **常見情境**：直接 `ssh host "sudo ..."` 會報 `sudo: a terminal is required`，加 `-t` 就解決

### `-T`：禁止分配 terminal

```bash
ssh -T git@github.com
```

- **用途**：明確告知不需要 terminal，常用於測試 Git SSH 連線
- **執行條件**：無特殊條件

---

## X11 Forwarding：把遠端 GUI 畫面傳回來

### `-X`：啟用 X11 Forwarding

**情境圖解**：你想在遠端伺服器跑有畫面的程式（如 Firefox、VS Code），但伺服器沒有螢幕。

```
┌──────────────┐          SSH -X           ┌──────────────┐
│   你的筆電    │◄─────────────────────────│   遠端主機    │
│              │    GUI 畫面透過 SSH 傳回    │              │
│  ┌────────┐  │                           │  firefox 執行 │
│  │Firefox │  │                           │  在這台主機上  │
│  │的畫面  │  │                           │  但沒有螢幕   │
│  └────────┘  │                           │              │
│  (顯示在這裡) │                           │              │
└──────────────┘                           └──────────────┘
   需要 X Server                             需要 xauth
```

```bash
ssh -X username@host
# 連上後可以直接開遠端的 GUI 程式
firefox &
gedit myfile.txt &
```

- **用途**：在遠端執行 GUI 程式，畫面顯示在本機
- **執行條件（缺一不可）**：
  1. **本機**必須有 X Server 在執行：
     - Linux：通常已內建（X11 或 Xwayland）
     - macOS：需安裝 [XQuartz](https://www.xquartz.org/)
     - Windows：需安裝 [VcXsrv](https://sourceforge.net/projects/vcxsrv/) 或 [MobaXterm](https://mobaxterm.mobatek.net/)（內建 X Server）
  2. **遠端** `/etc/ssh/sshd_config` 必須設定 `X11Forwarding yes`
  3. **遠端**需要安裝 `xauth` 套件（`sudo apt install xauth`）
  4. **本機** `~/.ssh/config` 或 `/etc/ssh/ssh_config` 沒有設 `ForwardX11 no`

- **驗證方式**：

```bash
# 連線後檢查 DISPLAY 變數有沒有被設定
echo $DISPLAY
# 應該會顯示類似 localhost:10.0

# 測試 X11 是否正常
xeyes  # 會跳出一個眼睛跟著滑鼠轉的小視窗
```

### `-Y`：啟用 Trusted X11 Forwarding

```bash
ssh -Y username@host
```

- **用途**：跟 `-X` 一樣傳 GUI 畫面，但不套用 X11 安全限制（X11 SECURITY extension）
- **執行條件**：跟 `-X` 相同
- **`-X` vs `-Y` 差異**：

| | `-X`（Untrusted） | `-Y`（Trusted） |
|---|---|---|
| 安全性 | 較高，有 X11 SECURITY 限制 | 較低，遠端程式可完整存取本機 X Server |
| 相容性 | 某些程式可能因權限不足無法正常顯示 | 幾乎所有 GUI 程式都能正常運作 |
| 建議使用情境 | 連線到不完全信任的主機 | 連線到自己管理的主機 |

- **常見問題**：用 `-X` 開某些程式出現 `X11 connection rejected because of wrong authentication` 或畫面異常，換 `-Y` 試試

### `-x`：禁用 X11 Forwarding

```bash
ssh -x username@host
```

- **用途**：即使 config 預設開啟 X11 Forwarding，也強制關閉
- **常見情境**：連線速度慢時關掉 X11 可加速連線建立

---

## Port Forwarding（SSH Tunnel）

SSH Tunnel 是 SSH 最強大但最容易搞混的功能。

### `-L`：Local Port Forwarding（本機 → 遠端）

**情境圖解**：公司的資料庫在內網，你從外面連不到。但你可以 SSH 到公司的一台主機，再透過它存取資料庫。

```
┌──────────────┐                           ┌──────────────┐          ┌──────────────┐
│   你的筆電    │        SSH 加密通道        │   公司主機    │          │  內網資料庫   │
│              │ ========================> │              │ -------> │              │
│  psql -h     │                           │  (跳板)      │          │  :5432       │
│  localhost   │                           │              │          │  防火牆擋住   │
│  -p 5432     │                           │              │          │  外部連線     │
└──────┬───────┘                           └──────────────┘          └──────────────┘
       │
       └── 連 localhost:5432
           實際上連到內網資料庫的 :5432
```

```bash
# 語法
ssh -L local_port:target_host:target_port username@ssh_host

# 範例：把遠端的 PostgreSQL 映射到本機
ssh -L 5432:localhost:5432 username@db-server

# 連上後，本機可以直接連
psql -h localhost -p 5432 -U myuser mydb

# 範例：透過跳板機存取內網的 Web 服務
ssh -L 8080:internal-web.corp:80 username@jump-server
# 本機瀏覽器開 http://localhost:8080 就能看到內網頁面
```

- **用途**：把遠端（或遠端能存取到的）服務映射到本機 port
- **執行條件**：
  - 本機的 `local_port` 沒有被其他程式佔用
  - 遠端 SSH server 的 `AllowTcpForwarding` 為 `yes`（預設就是）
  - 如果 `target_host` 不是 `localhost`，遠端主機必須能連到 `target_host`
- **常見情境**：存取被防火牆擋住的資料庫、內網 Web 管理後台

### `-R`：Remote Port Forwarding（遠端 → 本機）

**情境圖解**：你在本機跑了一個 Web Server（:3000），想讓遠端的同事也能存取。方向跟 `-L` 相反。

```
┌──────────────┐                           ┌──────────────┐
│   你的筆電    │        SSH 加密通道        │   遠端主機    │
│              │ ========================> │              │
│  localhost   │                           │  同事在這台   │
│  :3000       │                           │  curl        │
│  (你的開發中  │                           │  localhost   │
│   Web Server)│                           │  :8080       │
└──────────────┘                           └──────┬───────┘
       ▲                                          │
       │                                          │
       └──────────── 流量反向回來 ─────────────────┘
                                            連 localhost:8080
                                            實際上連到你筆電的 :3000
```

```bash
# 語法
ssh -R remote_port:target_host:target_port username@ssh_host

# 範例：讓遠端主機能存取本機的開發中 Web Server
ssh -R 8080:localhost:3000 username@remote-server
# 在遠端主機上 curl http://localhost:8080 就能存取你本機的 :3000

# 範例：讓外網能存取本機服務（窮人版 ngrok）
ssh -R 0.0.0.0:8080:localhost:3000 username@public-server
```

- **用途**：讓遠端主機能透過 SSH Tunnel 存取本機（或本機能到的）服務
- **執行條件**：
  - 遠端 SSH server 的 `AllowTcpForwarding` 為 `yes`
  - 如果要綁定 `0.0.0.0`（讓外部也能連），遠端 `sshd_config` 需設定 `GatewayPorts yes`
- **常見情境**：Demo 本機開發中的服務給遠端同事看、從外網穿回家裡的 NAS

### `-D`：Dynamic Port Forwarding（SOCKS Proxy）

**情境圖解**：`-L` 只能轉一個固定的 host:port，`-D` 是萬用版 — 把遠端主機變成你的 VPN 出口，所有流量都走它。

```
┌──────────────┐                           ┌──────────────┐
│   你的筆電    │        SSH 加密通道        │   遠端主機    │
│  (咖啡廳)    │ ========================> │  (公司/VPS)   │
│              │                           │              │
│  瀏覽器設定   │                           │  幫你去存取   │──→ Google
│  SOCKS5 proxy│                           │  所有網站     │──→ 公司內網
│  localhost   │                           │              │──→ 任何網站
│  :1080       │                           │  對外 IP 變成 │
│              │                           │  這台主機的 IP │
└──────────────┘                           └──────────────┘

沒有 -D：咖啡廳 Wi-Fi → 直接上網（可被監聽）
有   -D：咖啡廳 Wi-Fi → SSH 加密 → 遠端主機 → 上網（安全）
```

**跟 `-L` 的差別**：
- **`-L`**：只轉發**一個固定的** host:port（例如一個資料庫）
- **`-D`**：**萬用的**，任何流量都能轉，所以叫 Dynamic

```bash
ssh -D 1080 username@proxy-server

# 設定瀏覽器的 SOCKS5 proxy 為 localhost:1080
# 所有瀏覽器流量都會透過 proxy-server 出去
```

- **用途**：建立 SOCKS5 proxy，所有流量都透過遠端主機轉發
- **執行條件**：
  - 本機的 `1080` port 沒被佔用
  - 遠端 SSH server 的 `AllowTcpForwarding` 為 `yes`
  - 應用程式要設定使用 SOCKS5 proxy
- **常見情境**：透過公司 VPN 主機存取內網資源、安全地使用公共 Wi-Fi

### Tunnel 常見搭配參數

```bash
# -N：不執行遠端指令（純 tunnel，不開 shell）
# -f：連線後放到背景執行
# 組合技：背景建立 tunnel
ssh -fNL 5432:localhost:5432 username@db-server

# -o ExitOnForwardFailure=yes：如果 port forwarding 失敗就中斷連線
ssh -L 5432:localhost:5432 -o ExitOnForwardFailure=yes username@db-server
```

---

## 背景執行與連線控制

### `-f`：放到背景執行

```bash
ssh -f username@host "long-running-script.sh"
```

- **用途**：SSH 連線成功後，把 SSH process 放到背景
- **執行條件**：必須搭配要執行的指令，或搭配 `-N`（否則前景沒東西跑會卡住）

### `-N`：不執行遠端指令

```bash
ssh -N -L 8080:localhost:80 username@host
```

- **用途**：只建立連線和 tunnel，不開 shell 也不執行指令
- **執行條件**：無，但通常搭配 `-L` / `-R` / `-D` 使用才有意義

### `-o`：指定設定選項

```bash
# 連線 timeout 設定
ssh -o ConnectTimeout=5 username@host

# 關閉主機金鑰檢查（僅限測試環境！）
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null username@host

# Keep alive，防止連線被中斷
ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=3 username@host
```

- **用途**：動態指定 `ssh_config` 中的設定項
- **執行條件**：無，但要注意安全性（例如關閉 `StrictHostKeyChecking` 有中間人攻擊風險）

### `-o ServerAliveInterval` / `ServerAliveCountMax`：防斷線

```bash
ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=3 username@host
```

- **用途**：每 60 秒發一個 keep-alive 封包，連續 3 次沒回應才斷線
- **建議寫進 `~/.ssh/config`**：

```bash
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

---

## 跳板機（Jump Host / Bastion）

### `-J`：ProxyJump（推薦）

**情境圖解**：公司內網的開發機不對外開放，你只能先連到跳板機，再從跳板機連進去。`-J` 讓你一行指令搞定。

```
                          公司防火牆
                              │
┌──────────┐     SSH     ┌────┴─────┐     SSH     ┌──────────┐
│  你的筆電  │ ────────→ │  跳板機   │ ────────→ │  開發機   │
│  (外網)   │            │ (有對外IP)│            │ (內網)   │
└──────────┘            └──────────┘            └──────────┘
                         jump-host               target-host

不用 -J：ssh jump-host → 再手動 ssh target-host（兩步）
用   -J：ssh -J jump-host target-host（一步到位）
```

```bash
# 透過跳板機連到目標主機
ssh -J jump-host target-host

# 多層跳板
ssh -J jump1,jump2,jump3 target-host

# 跳板機用不同 port 和使用者
ssh -J admin@jump-host:2222 username@target-host
```

- **用途**：透過中繼主機連到目標主機，SSH 7.3+ 支援
- **執行條件**：
  - 本機能 SSH 到跳板機
  - 跳板機能 SSH 到目標主機
  - 跳板機的 `AllowTcpForwarding` 為 `yes`
- **寫進 config 更方便**：

```bash
Host target
    HostName 10.0.0.100
    User deploy
    ProxyJump jump-host

Host jump-host
    HostName jump.example.com
    User admin
    Port 2222
```

### 舊方法：`-o ProxyCommand`

```bash
# SSH 7.3 以前的作法
ssh -o ProxyCommand="ssh -W %h:%p jump-host" target-host
```

- **用途**：跟 `-J` 功能相同，但語法較複雜
- **建議**：如果 SSH 版本 >= 7.3，直接用 `-J`

---

## 檔案傳輸相關

### `-W`：標準輸入輸出轉發

```bash
ssh -W target-host:22 jump-host
```

- **用途**：將 stdin/stdout 轉發到指定的 host:port，通常作為 `ProxyCommand` 使用
- **執行條件**：遠端 `AllowTcpForwarding` 為 `yes`

### SCP 與 rsync 搭配 SSH

```bash
# SCP 指定 port
scp -P 2222 file.txt user@host:/path/

# SCP 透過跳板機
scp -o ProxyJump=jump-host file.txt user@target:/path/

# rsync 指定 SSH 參數
rsync -avz -e "ssh -p 2222 -i ~/.ssh/my_key" ./local/ user@host:/remote/
```

---

## 認證相關

### `-A`：Agent Forwarding

**情境圖解**：你 SSH 到跳板機後，想再從跳板機 SSH 到另一台主機。但你的金鑰在筆電上，不想把私鑰複製到跳板機（不安全）。`-A` 讓跳板機「借用」你筆電上的金鑰。

```
┌──────────┐  ssh -A   ┌──────────┐   ssh     ┌──────────┐
│  你的筆電  │ ───────→ │  跳板機   │ ───────→ │  目標主機  │
│          │          │          │          │          │
│  🔑 私鑰  │◄ ─ ─ ─ ─│ 借用你的  │          │  有你的   │
│  在這裡   │  Agent   │ 金鑰認證  │          │  公鑰     │
└──────────┘ Forwarding└──────────┘          └──────────┘
                        不需要放私鑰在這台！
```

```bash
ssh -A username@jump-host
# 在 jump-host 上可以用本機的 SSH key 繼續連其他主機
ssh another-host  # 不需要在 jump-host 上放 key
```

- **用途**：把本機的 SSH Agent 轉發到遠端，讓遠端主機能使用本機的金鑰
- **執行條件**：
  - 本機必須有 `ssh-agent` 在執行（`eval $(ssh-agent)` 或系統自動啟動）
  - 金鑰已加入 agent（`ssh-add ~/.ssh/my_key`）
  - 遠端 `sshd_config` 的 `AllowAgentForwarding` 為 `yes`（預設就是）
- **安全注意**：只在信任的主機上使用！遠端 root 可以利用你的 agent 連到其他主機

### `-o IdentitiesOnly=yes`：只用指定的金鑰

```bash
ssh -i ~/.ssh/specific_key -o IdentitiesOnly=yes username@host
```

- **用途**：防止 SSH 嘗試 agent 中的其他金鑰，只用 `-i` 指定的那把
- **常見情境**：有多把金鑰時，避免因嘗試太多金鑰被伺服器鎖定（`Too many authentication failures`）

---

## 多工管理：ControlMaster

```bash
# ~/.ssh/config
Host *
    ControlMaster auto
    ControlPath ~/.ssh/sockets/%r@%h-%p
    ControlPersist 600
```

```bash
# 需要先建立 sockets 目錄
mkdir -p ~/.ssh/sockets

# 第一次連線會建立 master connection
ssh myserver

# 之後的連線（新分頁開的 ssh、scp、rsync）會共用同一條 TCP 連線
ssh myserver        # 瞬間連上，不需要重新認證
scp file myserver:  # 也是共用連線
```

- **用途**：多個 SSH session 共用一條 TCP 連線，加速後續連線
- **執行條件**：
  - `ControlPath` 指定的目錄必須存在
  - `ControlPersist 600` 表示最後一個 session 結束後，master 連線保留 600 秒

---

## 完整參數速查表

| 參數 | 用途 | 關鍵執行條件 |
|------|------|-------------|
| `-p port` | 指定連線埠號 | 遠端 sshd 監聽該 port |
| `-i key` | 指定私鑰 | 權限 600，公鑰在遠端 authorized_keys |
| `-v/-vv/-vvv` | 除錯模式 | 無 |
| `-t` | 強制分配 TTY | 無 |
| `-T` | 禁止分配 TTY | 無 |
| `-X` | X11 Forwarding | 本機有 X Server、遠端 X11Forwarding yes、有 xauth |
| `-Y` | Trusted X11 Forwarding | 同 `-X`，但不套用安全限制 |
| `-x` | 禁用 X11 | 無 |
| `-L` | Local Port Forwarding | 本機 port 未佔用、遠端 AllowTcpForwarding yes |
| `-R` | Remote Port Forwarding | 遠端 AllowTcpForwarding yes；綁 0.0.0.0 需 GatewayPorts yes |
| `-D` | SOCKS Proxy | 本機 port 未佔用、應用程式設定 SOCKS5 proxy |
| `-N` | 不執行遠端指令 | 通常搭配 tunnel 參數 |
| `-f` | 背景執行 | 需搭配指令或 `-N` |
| `-J` | 跳板機 (ProxyJump) | SSH 7.3+、跳板機能連到目標 |
| `-A` | Agent Forwarding | 本機有 ssh-agent 且已 ssh-add |
| `-W host:port` | stdin/stdout 轉發 | AllowTcpForwarding yes |
| `-o option` | 指定 config 選項 | 無 |

---

## 實用組合技

### 1. 透過跳板機連到內網資料庫

```bash
ssh -fNL 5432:db.internal:5432 -J jump.example.com deploy@app-server
# 本機直接連 localhost:5432 就是內網 DB
```

### 2. 遠端 GUI 程式 + 壓縮加速

```bash
ssh -YC username@host
# -Y: Trusted X11 Forwarding
# -C: 壓縮傳輸（低頻寬時有幫助）
```

### 3. 安全的背景 SOCKS Proxy

```bash
ssh -fND 1080 -o ServerAliveInterval=60 username@proxy-server
# -f: 背景
# -N: 不開 shell
# -D 1080: SOCKS proxy
# ServerAliveInterval: 防斷線
```

### 4. 快速測試連線

```bash
ssh -o ConnectTimeout=3 -o BatchMode=yes username@host echo ok
# 3 秒 timeout、不詢問密碼、成功印 ok
```

### 5. 完整的 `~/.ssh/config` 範例

```bash
# 全域設定
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    ControlMaster auto
    ControlPath ~/.ssh/sockets/%r@%h-%p
    ControlPersist 600
    IdentitiesOnly yes

# 公司跳板機
Host jump
    HostName jump.company.com
    User admin
    Port 2222
    IdentityFile ~/.ssh/company_key

# 內網開發機（自動走跳板機）
Host dev
    HostName 10.0.0.50
    User developer
    ProxyJump jump
    IdentityFile ~/.ssh/company_key
    ForwardAgent yes

# GitHub
Host github.com
    IdentityFile ~/.ssh/github_key
    IdentitiesOnly yes

# 個人 VPS
Host my-vps
    HostName 203.0.113.10
    User ct
    IdentityFile ~/.ssh/personal_key
    LocalForward 8080 localhost:8080
```

---

## 常見問題排查

| 問題 | 可能原因 | 排查方式 |
|------|---------|---------|
| `Permission denied (publickey)` | 金鑰不對或權限錯誤 | `ssh -vvv` 看用了哪把 key；檢查 `chmod 600` |
| `Connection refused` | SSH server 沒開或 port 不對 | `telnet host 22` 或 `nc -zv host 22` |
| `Connection timed out` | 防火牆擋住 | 確認安全群組/防火牆規則 |
| `Too many authentication failures` | agent 有太多 key | 加 `-o IdentitiesOnly=yes` |
| X11 forwarding 沒畫面 | 缺 X Server 或設定沒開 | 檢查 `echo $DISPLAY`、遠端 sshd_config |
| Tunnel port 已被佔用 | 本機 port 衝突 | `lsof -i :port` 或換個 port |
| 連線常斷線 | NAT/防火牆 timeout | 設定 `ServerAliveInterval` |

---

## 總結

SSH 不只是「連到遠端主機」的工具，它是一個完整的加密通道框架。掌握這些參數後，你可以：

- **`-X`/`-Y`**：遠端桌面不用裝 VNC，直接跑 GUI
- **`-L`/`-R`/`-D`**：不用 VPN 也能安全存取內網資源
- **`-J`**：跳板機連線一行搞定
- **`-A`**：多層主機間無痛使用同一把金鑰
- **ControlMaster**：連線速度翻倍

最重要的是，每個參數都有它的**執行條件**。下次碰到 SSH 功能不如預期，先對照這篇的條件清單檢查，通常就能找到問題。

> **上一篇**：[SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — 從產生金鑰到多金鑰管理
> **下一篇**：[SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 你的主機正在被攻擊

---

## 參考資源

- [ssh(1) — OpenBSD Manual Pages](https://man.openbsd.org/ssh.1)
- [ssh_config(5) — OpenBSD Manual Pages](https://man.openbsd.org/ssh_config.5)
- [OpenSSH Cookbook — Port Forwarding](https://en.wikibooks.org/wiki/OpenSSH/Cookbook/Tunnels)
- [XQuartz — macOS X11 Server](https://www.xquartz.org/)
- [VcXsrv — Windows X Server](https://sourceforge.net/projects/vcxsrv/)
