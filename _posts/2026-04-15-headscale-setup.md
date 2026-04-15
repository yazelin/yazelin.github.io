---
layout: post
title: "Headscale 自架指南：免費、無限裝置的 Tailscale 替代方案"
subtitle: "Oracle Cloud 免費部署、DERP Relay、Cloudflare Tunnel、多網段 ACL 管理"
date: 2026-04-15
categories: [Linux]
tags: [Headscale, Tailscale, WireGuard, VPN, Oracle Cloud, DERP, ACL, Network]
---

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — ssh-keygen 參數、多金鑰管理
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — X11、Tunnel、跳板機
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - [（四）SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - [（番外一）Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案
> - **（番外二）本篇：Headscale 自架指南**

---

## 為什麼寫這篇

[上一篇]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %})介紹了 Tailscale，用起來很方便，但有幾個限制：

- 免費版使用者上限 **6 人**，tagged resources 上限 **50 個**
- 協調伺服器在 Tailscale 公司手上，你的裝置清單和連線資訊都經過他們
- 某些公司不允許把內網拓撲資訊交給第三方

**Headscale** 是 Tailscale 協調伺服器的開源替代。自己架一台，裝置數和使用者數都**沒有限制**，資料完全在你手上。

---

## Tailscale 官方 vs Headscale 自架

```
Tailscale 官方架構：
  你的裝置 ──→ Tailscale 協調伺服器（他們管的）

Headscale 自架架構：
  你的裝置 ──→ 你自己的 Headscale 伺服器（你管的）
```

| | Tailscale 官方免費版 | Headscale 自架 |
|---|---|---|
| 裝置數 | 無限（tagged resources 上限 50） | **無限** |
| 使用者數 | 6 人 | **無限** |
| 費用 | 免費 | 免費（只付 VM 費用） |
| ACL 權限控制 | 有 | 有 |
| MagicDNS | 有 | 有 |
| Subnet Router | 有 | 有 |
| Exit Node | 有 | 有 |
| Funnel（對外公開） | 有 | **沒有**（Tailscale 專屬服務） |
| DERP Relay | 用 Tailscale 的 | 可自架或用 Tailscale 的 |
| 維護 | 他們維護 | **你自己維護** |
| 穩定性 | 商業級 SLA | 看你的 VM |

**怎麼選**：
- 個人或小團隊（<6 人）→ 官方免費版，省事
- 裝置或人數超過免費額度 → Headscale 自架
- 公司想控制資料不外流 → Headscale 自架

---

## 推薦：裝在 Oracle Cloud Free Tier

Headscale 非常輕量（<100MB RAM），Oracle Cloud 的永久免費方案綽綽有餘：

```
Oracle Cloud Always Free（永久免費，不是試用）：
  - ARM VM: 4 OCPU + 24GB RAM（可拆成最多 4 台）
  - x86 VM: 2 台 1/8 OCPU 1GB（可 burst）
  - 200GB 儲存空間
  - 10TB/月 流量

Headscale 只需要最小的 VM 就能跑
```

其他免費選項：

| 平台 | 免費方案 | 規格 | 適合度 |
|------|---------|------|--------|
| **Oracle Cloud** | Always Free（永久） | ARM 4核 24GB | **最推薦** |
| Google Cloud | Free Tier | e2-micro 0.25 vCPU 1GB | 夠用但小 |
| Azure | Free Tier 12 個月 | B1s 1核 1GB | 有期限 |
| Fly.io | Free Tier | 共享 CPU 256MB | 勉強能跑 |
| Raspberry Pi | 買一次 | 看型號 | 要有固定 IP 或 DDNS |

---

## 安裝步驟

### 1. 安裝 Headscale

```bash
# 在 Oracle Cloud VM 上（以 ARM 為例）

# 下載 Headscale
wget https://github.com/juanfont/headscale/releases/latest/download/headscale_0.28.0_linux_arm64
chmod +x headscale_0.28.0_linux_arm64
sudo mv headscale_0.28.0_linux_arm64 /usr/local/bin/headscale

# 建立設定目錄
sudo mkdir -p /etc/headscale
sudo mkdir -p /var/lib/headscale

# 下載預設設定檔
sudo wget -O /etc/headscale/config.yaml \
  https://raw.githubusercontent.com/juanfont/headscale/main/config-example.yaml
```

### 2. 設定 config.yaml

```yaml
# /etc/headscale/config.yaml 重點設定

# 你的 Headscale 對外網址
server_url: https://headscale.yourdomain.com:443

# 監聽位址
listen_addr: 0.0.0.0:443

# 資料庫（預設 SQLite，小規模夠用）
database:
  type: sqlite
  sqlite:
    path: /var/lib/headscale/db.sqlite

# DERP 設定（後面會詳細說明）
derp:
  server:
    enabled: false
  urls:
    - https://controlplane.tailscale.com/derpmap/default
```

### 3. 建立 systemd 服務

```bash
sudo tee /etc/systemd/system/headscale.service << 'EOF'
[Unit]
Description=headscale controller
After=syslog.target network-online.target

[Service]
Type=simple
User=headscale
Group=headscale
ExecStart=/usr/local/bin/headscale serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 建立專用使用者
sudo useradd -r -s /bin/false headscale
sudo chown -R headscale:headscale /var/lib/headscale /etc/headscale

# 啟動
sudo systemctl enable headscale
sudo systemctl start headscale

# 建立使用者（Headscale 的「帳號」概念）
sudo headscale users create myuser
```

### 4. 客戶端連線

```bash
# 在你的內網主機 / 筆電上（已安裝 Tailscale 客戶端）

# 指向你自己的 Headscale 伺服器
sudo tailscale up --login-server=https://headscale.yourdomain.com

# 會產生一個註冊網址，複製它

# 在 Headscale 伺服器上批准這台裝置
sudo headscale nodes register --user myuser --key mkey:xxxx...
```

```bash
# 驗證連線
tailscale status
# 100.64.0.1  my-laptop     myuser  linux  -
# 100.64.0.2  dev-server    myuser  linux  -

# 互 ping
tailscale ping dev-server
# pong from dev-server (100.64.0.2) via 203.0.113.10:41641 in 15ms
```

---

## 搭配 Cloudflare Tunnel（連 Oracle 的 port 都不用開）

這是可選的進階設定。如果你不想在 Oracle Cloud 防火牆上開任何 port：

```
不用 CF Tunnel：
  客戶端 ──→ Oracle VM:443（要開 port）──→ Headscale

用 CF Tunnel：
  客戶端 ──→ Cloudflare ──→ Oracle VM（不開 port）──→ Headscale
                ▲                        │
                │     cloudflared        │
                └──── (主動連出去) ───────┘
```

```bash
# 在 Oracle VM 上安裝 cloudflared
sudo wget -O /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
sudo chmod +x /usr/local/bin/cloudflared

# 登入 Cloudflare
cloudflared tunnel login

# 建立 tunnel
cloudflared tunnel create headscale-tunnel

# 設定 ~/.cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: headscale.yourdomain.com
    service: https://localhost:443
    originRequest:
      noTLSVerify: true
  - service: http_status:404

# 設定 DNS
cloudflared tunnel route dns headscale-tunnel headscale.yourdomain.com

# 啟動
cloudflared tunnel run headscale-tunnel
```

這樣 Oracle Cloud 的防火牆可以完全關閉，所有流量都走 Cloudflare 進來。

> **不用 CF Tunnel 也完全可以**，直接在 Oracle Cloud 開放 Headscale 的 port 就好。CF Tunnel 只是「連 port 都不想開」時的額外選項。

---

## DERP Relay：P2P 連不上時的備案

### 什麼是 DERP

Tailscale 客戶端之間優先走 P2P 直連（WireGuard），但有時候兩邊的 NAT 太嚴格，打洞失敗。這時候就需要 DERP relay 中繼轉發：

```
P2P 直連成功時（大部分情況）：
  你的筆電 ◄══ WireGuard 直連 ══► 內網主機
  不經過任何 relay，速度最快

P2P 失敗時（兩邊都是嚴格 NAT）：
  你的筆電 ──→ DERP Relay ──→ 內網主機
               （中繼轉發加密封包）
```

**Headscale 本身不包含 DERP relay**，但預設會自動使用 Tailscale 官方的 DERP 節點，所以**裝完就能通，不用額外設定**。

### 三種 DERP 方案

| 方案 | 設定 | 適合 |
|------|------|------|
| **用 Tailscale 官方的** | 不用設定，預設就是 | 大多數情況（推薦） |
| 官方 + 自架混用 | 加一台自己的，官方當備援 | 想要更低延遲 |
| 純自架 | 關掉官方的，只用自己的 | 完全不想流量經過 Tailscale |

### 方案一：用官方 DERP（預設，不用動）

Headscale 裝好後，Tailscale 客戶端會**自動使用官方的 DERP relay**。全球有多個節點：

```
官方 DERP 節點（部分）：
  - 東京 (tok)
  - 新加坡 (sin)
  - 舊金山 (sfo)
  - 紐約 (nyc)
  - 法蘭克福 (fra)
  ...
```

Headscale 的 config.yaml 預設就有：

```yaml
derp:
  urls:
    - https://controlplane.tailscale.com/derpmap/default
    #  ↑ 這行 = 使用官方 DERP，預設就有
```

**安全疑慮**：DERP relay 只轉發「已經被 WireGuard 加密的封包」，它看不到你的流量內容。所以用官方的不會有隱私問題。

### 方案二：自架 DERP + 官方備援（推薦進階用戶）

如果你在亞洲，自架一台 DERP 可以降低延遲。DERP server 內建在 Tailscale 工具裡：

```bash
# 在你的 Oracle Cloud VM 上（跟 Headscale 同一台就行）

# 方法一：用 Go 安裝
go install tailscale.com/cmd/derper@latest

# 方法二：用 Docker
docker run -d --name derper \
  -p 8443:443 \
  -p 3478:3478/udp \
  -e DERP_DOMAIN=derp.yourdomain.com \
  -e DERP_CERT_MODE=letsencrypt \
  -e DERP_VERIFY_CLIENTS=true \
  ghcr.io/yangchuansheng/ip_derper
```

然後在 Headscale 設定中加上你的 DERP：

```yaml
# /etc/headscale/config.yaml
derp:
  server:
    enabled: false

  # 保留官方的當備援
  urls:
    - https://controlplane.tailscale.com/derpmap/default

  # 加上你自己的 DERP 設定檔
  paths:
    - /etc/headscale/derp.yaml
```

```yaml
# /etc/headscale/derp.yaml
regions:
  900:   # 自訂 region ID（避開官方的 1-99）
    regionid: 900
    regioncode: "oracle-tw"
    regionname: "Oracle Cloud Taiwan"
    nodes:
      - name: "derp-oracle"
        regionid: 900
        hostname: "derp.yourdomain.com"
        stunport: 3478
        derpport: 443
```

```bash
# 重啟 Headscale 生效
sudo systemctl restart headscale

# 在客戶端確認 DERP 節點
tailscale netcheck
# 會列出所有可用的 DERP 節點，包括你自架的
```

### 方案三：純自架（不用官方 DERP）

```yaml
# /etc/headscale/config.yaml
derp:
  urls: []    # 清空 = 完全不用官方的
  paths:
    - /etc/headscale/derp.yaml   # 只用自己的
```

> **注意**：純自架的話，你的 DERP 掛了就沒有備援。建議至少保留官方的當備案。

### 驗證 DERP 和連線狀態

```bash
# 檢查目前的連線方式（直連 or relay）
tailscale status
# 100.64.0.2  dev-server  myuser  linux  active; direct 192.168.1.50:41641
#                                                 ^^^^^^ 直連 = 最快
# 100.64.0.3  nas         myuser  linux  active; relay "tok"
#                                                 ^^^^^ 走 DERP = P2P 失敗了

# 詳細網路檢查
tailscale netcheck
# Report:
#   UDP: true
#   IPv4: yes, 203.0.113.10
#   Nearest DERP: Tokyo
#   DERP latency:
#     - tok: 15ms    ← 官方東京節點
#     - oracle-tw: 5ms  ← 你自架的（更近）

# 測試到特定裝置的路徑
tailscale ping dev-server
# pong from dev-server via 192.168.1.50:41641 in 2ms  ← 直連
# 或
# pong from dev-server via DERP(oracle-tw) in 10ms    ← 走你的 DERP
```

---

## 完整自架架構圖

```
┌─────────────────────────────────────────────────────┐
│                Oracle Cloud VM（免費）                │
│                                                     │
│  ┌─────────────┐   ┌──────────────┐                │
│  │  Headscale   │   │  DERP Relay  │  （可選）       │
│  │  (協調伺服器) │   │  (中繼轉發)   │               │
│  │  :443        │   │  :8443       │               │
│  └──────┬───────┘   └──────┬───────┘               │
│         │                  │                        │
│         │  ┌───────────────┘                        │
│         │  │  cloudflared（可選，不開 port 用）       │
└─────────┼──┼────────────────────────────────────────┘
          │  │
          │  │  所有連線都是「裝置主動連出去」
          │  │  Oracle Cloud 防火牆不用開 port（如果用 CF Tunnel）
          │  │
    ┌─────┴──┴─────┐
    │              │
┌───┴──┐     ┌────┴───┐      ┌──────────┐
│ 你的  │     │ 內網   │      │   DB     │
│ 筆電  │◄═══►│ 中繼機 │─────→│ (不裝    │
│      │ P2P │(Subnet │ 內網  │ Tailscale│
│      │     │ Router)│      │ 不連外網) │
└──────┘     └────────┘      └──────────┘
```

---

## 多網段管理：一台 Headscale 搞定

不同團隊、專案、環境要隔離網段，**不需要架多台 Headscale**。一台 Headscale 用 **user** 來隔離，再用 **ACL** 控制誰能跨網段存取。

### 情境一：公司多團隊隔離

你的公司有前端、後端、維運三個團隊。每個團隊有自己的開發機和測試環境，平時不需要互通，但維運要能連所有機器。

```
一台 Headscale
  │
  ├─ user: frontend
  │    ├─ fe-dev-1     (100.64.0.1)
  │    ├─ fe-dev-2     (100.64.0.2)
  │    └─ fe-staging   (100.64.0.3)
  │
  ├─ user: backend
  │    ├─ be-dev-1     (100.64.0.10)
  │    ├─ be-dev-2     (100.64.0.11)
  │    └─ be-staging   (100.64.0.12)
  │
  ├─ user: infra
  │    ├─ db-server    (100.64.0.20)
  │    ├─ redis        (100.64.0.21)
  │    └─ monitoring   (100.64.0.22)
  │
  └─ user: ops（維運）
       ├─ ops-laptop-1 (100.64.0.30)
       └─ ops-laptop-2 (100.64.0.31)
```

```bash
# 建立各團隊的 user
sudo headscale users create frontend
sudo headscale users create backend
sudo headscale users create infra
sudo headscale users create ops
```

**ACL 設定**：

```json
{
  "groups": {
    "group:frontend": ["frontend"],
    "group:backend": ["backend"],
    "group:infra": ["infra"],
    "group:ops": ["ops"]
  },
  "acls": [
    // 各團隊內部互通
    {"action": "accept", "src": ["group:frontend"], "dst": ["group:frontend:*"]},
    {"action": "accept", "src": ["group:backend"],  "dst": ["group:backend:*"]},

    // 前端、後端都能連 infra（DB、Redis）
    {"action": "accept", "src": ["group:frontend"], "dst": ["group:infra:*"]},
    {"action": "accept", "src": ["group:backend"],  "dst": ["group:infra:*"]},

    // 維運可以連所有機器
    {"action": "accept", "src": ["group:ops"], "dst": ["*:*"]},

    // 前端和後端之間不能互連（不寫規則 = 預設拒絕）
  ]
}
```

```
效果：
  前端工程師 → 只能連前端機器 + DB/Redis     ✓
  前端工程師 → 連後端的機器                   ✗ 被 ACL 擋
  後端工程師 → 只能連後端機器 + DB/Redis     ✓
  維運       → 所有機器都能連                ✓
```

### 情境二：多個客戶的專案環境隔離

你是接案公司或 MSP，同時管理多個客戶的主機。每個客戶的環境必須完全隔離，不能互相存取。

```
一台 Headscale
  │
  ├─ user: client-a（客戶 A：電商網站）
  │    ├─ client-a-web     (100.64.0.1)
  │    ├─ client-a-api     (100.64.0.2)
  │    └─ client-a-db      (100.64.0.3)
  │
  ├─ user: client-b（客戶 B：企業內部系統）
  │    ├─ client-b-app     (100.64.0.10)
  │    └─ client-b-db      (100.64.0.11)
  │
  └─ user: admin（你的管理帳號）
       └─ your-laptop      (100.64.0.100)
```

```json
{
  "acls": [
    // 客戶 A 的機器只能互連
    {"action": "accept", "src": ["client-a"], "dst": ["client-a:*"]},

    // 客戶 B 的機器只能互連
    {"action": "accept", "src": ["client-b"], "dst": ["client-b:*"]},

    // 你可以連所有客戶的機器（管理用）
    {"action": "accept", "src": ["admin"], "dst": ["*:*"]},

    // 客戶 A 和客戶 B 之間完全隔離
  ]
}
```

```
效果：
  客戶 A 的 web → 客戶 A 的 db    ✓ 正常存取
  客戶 A 的 web → 客戶 B 的 app   ✗ 完全看不到
  你的筆電     → 任何客戶的機器    ✓ 管理用
```

### 情境三：正式環境 vs 測試環境

同一個專案有 production 和 staging 兩套環境，需要嚴格隔離，避免測試環境的操作不小心影響正式環境。

```
一台 Headscale
  │
  ├─ user: production
  │    ├─ prod-web-1    (100.64.0.1)
  │    ├─ prod-web-2    (100.64.0.2)
  │    ├─ prod-api      (100.64.0.3)
  │    └─ prod-db       (100.64.0.4)
  │
  ├─ user: staging
  │    ├─ stg-web       (100.64.0.10)
  │    ├─ stg-api       (100.64.0.11)
  │    └─ stg-db        (100.64.0.12)
  │
  ├─ user: dev（開發者）
  │    ├─ dev-laptop-1  (100.64.0.20)
  │    └─ dev-laptop-2  (100.64.0.21)
  │
  └─ user: sre（維運）
       └─ sre-laptop    (100.64.0.30)
```

```json
{
  "acls": [
    // production 內部互通
    {"action": "accept", "src": ["production"], "dst": ["production:*"]},

    // staging 內部互通
    {"action": "accept", "src": ["staging"], "dst": ["staging:*"]},

    // 開發者只能連 staging，不能碰 production
    {"action": "accept", "src": ["dev"], "dst": ["staging:*"]},

    // SRE 可以連 staging 和 production
    {"action": "accept", "src": ["sre"], "dst": ["production:*", "staging:*"]},

    // production 和 staging 之間不能互連
  ]
}
```

```
效果：
  開發者 → staging 的機器      ✓
  開發者 → production 的機器   ✗ ACL 擋住，防止手滑
  SRE   → 所有環境            ✓
  prod-api → stg-db           ✗ 環境之間完全隔離
```

### 情境四：個人多地點設備互連

你在家裡、公司、VPS 各有設備，想要全部互通，但家裡的 NAS 不想讓公司的機器連到。

```
一台 Headscale
  │
  ├─ user: home
  │    ├─ nas          (100.64.0.1)    ← 家裡 NAS
  │    ├─ pi           (100.64.0.2)    ← Raspberry Pi
  │    └─ home-pc      (100.64.0.3)
  │
  ├─ user: work
  │    ├─ work-laptop  (100.64.0.10)
  │    └─ work-dev     (100.64.0.11)   ← 公司開發機
  │
  └─ user: cloud
       └─ vps          (100.64.0.20)   ← Oracle Cloud VPS
```

```json
{
  "acls": [
    // 家裡設備互通
    {"action": "accept", "src": ["home"], "dst": ["home:*"]},

    // 工作設備互通
    {"action": "accept", "src": ["work"], "dst": ["work:*"]},

    // VPS 所有設備都能連（當跳板或 Exit Node）
    {"action": "accept", "src": ["home", "work"], "dst": ["cloud:*"]},

    // 工作筆電可以連家裡 NAS（你自己在家工作用）
    // 但公司開發機不能連家裡
    {"action": "accept",
     "src": ["work-laptop"],
     "dst": ["home:*"]},

    // 家裡 NAS 不能主動連工作設備
  ]
}
```

### 管理指令

```bash
# 查看所有 user
sudo headscale users list

# 查看某個 user 下的裝置
sudo headscale nodes list --user frontend

# 把裝置移到另一個 user（換團隊時）
sudo headscale nodes move --identifier 5 --user backend

# 移除裝置
sudo headscale nodes delete --identifier 5

# 查看目前生效的 ACL
sudo headscale policy get
```

---

## 總結

Headscale 讓你用**零成本**（Oracle Cloud 免費）建立一個**無限裝置、無限使用者**的私有 VPN 網路。

**自架 checklist**：

1. Oracle Cloud 開一台免費 ARM VM
2. 安裝 Headscale + 設定 config.yaml
3. 各裝置安裝 Tailscale 客戶端，指向你的 Headscale
4. 用 user 分組 + ACL 控制權限
5. （可選）自架 DERP relay 降低延遲
6. （可選）搭配 CF Tunnel 連 port 都不用開

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — 從產生金鑰到多金鑰管理
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — 每個參數的用途和執行條件
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - [（四）SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - [（番外一）Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案

---

## 參考資源

- [Headscale — GitHub Repository](https://github.com/juanfont/headscale)
- [Headscale — Official Documentation](https://headscale.net/)
- [Headscale — Config Example](https://github.com/juanfont/headscale/blob/main/config-example.yaml)
- [Headscale — Features](https://headscale.net/stable/ref/features/)
- [Headscale — DERP Configuration](https://headscale.net/stable/ref/derp/)
- [Tailscale — DERP Servers](https://tailscale.com/kb/1232/derp-servers)
- [Tailscale DERP Map（即時節點清單）](https://controlplane.tailscale.com/derpmap/default)
- [Oracle Cloud — Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Cloudflare Tunnel — Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
