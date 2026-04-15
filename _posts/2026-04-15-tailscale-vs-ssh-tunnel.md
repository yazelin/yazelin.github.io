---
layout: post
title: "Tailscale 入門：SSH Tunnel 的現代替代方案"
subtitle: "不用開 port、不用設 Router，WireGuard VPN 一鍵搞定內網穿透"
date: 2026-04-15
categories: [Linux]
tags: [Tailscale, WireGuard, VPN, SSH, Network, Security]
---

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — ssh-keygen 參數、多金鑰管理
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — X11、Tunnel、跳板機
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - [（四）SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - **（番外一）本篇：Tailscale — SSH Tunnel 的現代替代方案**
> - [（番外二）Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 為什麼寫這篇

前面四篇 SSH 系列教了你怎麼用 SSH Tunnel 連內網、架跳板機、設防火牆。能用，但每次都要：

- Router 開 port
- 設定跳板機
- 記一堆 `-L`、`-D`、`-J` 參數
- 擔心 port 22 被攻擊

**Tailscale 把這些全部自動化了。** 裝好、登入、連線，三步結束。不用碰 Router、不用開 port、不用設防火牆。

但它不是萬能的，有些場景 SSH Tunnel 反而更適合。這篇會說清楚兩者的差異，讓你根據場景選擇。

---

## Tailscale 的原理

### 傳統 SSH：外面連進來

```
你的筆電（外網）
     │
     │  要穿過 Router → Router 要開 port
     │                     │
     ▼                     ▼
  Router ──── port 22 ──→ 內網主機
  (NAT)
  
問題：
  1. Router 要開 port（管理員不一定願意）
  2. Port 開了就會被全網掃描攻擊
  3. NAT 後面的主機不好從外面直連
```

### Tailscale：裡面連出去

```
┌──────────┐                    ┌────────────────────┐
│  內網主機  │── 主動連出去 ──→  │  Tailscale 協調伺服器 │
│  (裝了     │  (outbound)      │  (只做協調，不轉資料) │
│  Tailscale)│                  │                    │
└──────────┘                   └────────┬───────────┘
                                        │ 交換雙方資訊
┌──────────┐                            │
│  你的筆電  │── 主動連出去 ──→ ─────────┘
│  (裝了     │  (outbound)
│  Tailscale)│
└──────────┘
      │
      │  協調完成後，兩台機器直接 P2P 連線
      │  （WireGuard 加密，不經過 Tailscale）
      ▼
┌──────────┐         WireGuard P2P          ┌──────────┐
│  你的筆電  │◄════════════════════════════►│  內網主機  │
│           │    加密直連，Router 不用開 port  │          │
└──────────┘                                └──────────┘
```

**關鍵差異**：

| | SSH | Tailscale |
|---|---|---|
| 連線方向 | 外面連進來（inbound） | 裡面連出去（outbound） |
| Router 設定 | 要開 port | **不用動** |
| NAT 穿越 | 需要跳板機 | 自動打洞（NAT hole punching） |
| 被攻擊風險 | port 對外暴露 | 外面完全看不到 |

### 如果 P2P 直連失敗呢？

兩邊都是嚴格 NAT（例如兩邊都是 4G 行動網路），打洞失敗時，Tailscale 會用 **DERP relay** 中繼：

```
你的筆電 ──→ DERP relay（Tailscale 全球節點）──→ 內網主機
              加密的，DERP 看不到內容
              速度稍慢，但至少能通
```

Tailscale 在全球有多個 DERP 節點（包括東京、新加坡），會自動選最近的。

---

## 安裝與基本使用

### 安裝

```bash
# Ubuntu / Debian
curl -fsSL https://tailscale.com/install.sh | sh

# macOS
brew install tailscale

# Windows
# 從 https://tailscale.com/download 下載安裝檔
```

### 啟動與登入

```bash
# 啟動並登入（會開瀏覽器讓你用 Google/GitHub/Microsoft 帳號登入）
sudo tailscale up

# 查看狀態
tailscale status
# 100.64.0.1  my-laptop    yourname@  linux   -
# 100.64.0.2  dev-server   yourname@  linux   -

# 現在可以直接連了！
ssh deploy@100.64.0.2
# 或用 Tailscale 的 MagicDNS
ssh deploy@dev-server
```

就這樣。不用設 Router、不用開 port、不用設跳板機。

### Tailscale IP 是什麼？

```
每台裝了 Tailscale 的機器會拿到一個 100.x.x.x 的 IP
這是 CGNAT 範圍（100.64.0.0/10），只在 Tailscale 網路內有效

你的筆電:     100.64.0.1
開發機:       100.64.0.2
家裡 NAS:     100.64.0.3

這些 IP 不會出現在公網上，外面的人看不到也連不到
```

---

## 場景對比：SSH Tunnel vs Tailscale

### 場景一：咖啡廳連回公司開發機

**SSH 的做法**（需要跳板機 + Router 開 port）：

```bash
ssh -J admin@jump.company.com:2222 deploy@10.0.0.50
```

**Tailscale 的做法**（不用動 Router）：

```bash
# 公司開發機和你的筆電都裝好 Tailscale 就行了
ssh deploy@dev-server
```

### 場景二：存取內網 GitLab 和資料庫

**SSH 的做法**：

```bash
ssh -L 8080:gitlab.internal:80 -L 5432:db.internal:5432 \
    -J jump deploy@dev-server
```

**Tailscale 的做法**（Subnet Router）：

```bash
# 在一台內網機器上開啟 subnet router
sudo tailscale up --advertise-routes=10.0.0.0/24

# 在 Tailscale 管理後台批准這個 route

# 之後你的筆電可以直接存取整個內網網段
curl http://10.0.0.60        # GitLab
psql -h 10.0.0.70 -p 5432   # DB
# 不用開任何 tunnel！
```

### 場景三：Demo 給客戶看本機網站

**SSH 的做法**（需要 VPS + GatewayPorts）：

```bash
ssh -R 0.0.0.0:8080:localhost:3000 user@public-vps
```

**Tailscale 的做法**（Funnel）：

```bash
# 把本機的 :3000 公開到網路上
tailscale funnel 3000

# Tailscale 會給你一個公開網址：
# https://my-laptop.tail1234.ts.net/
# 直接把這個網址給客戶
```

### 場景四：翻牆

**SSH 的做法**：

```bash
ssh -D 1080 -p 443 user@taiwan-server
# 瀏覽器設 SOCKS5 proxy
```

**Tailscale 的做法**（Exit Node）：

```bash
# 在台灣的主機上
sudo tailscale up --advertise-exit-node

# 在你的筆電上
sudo tailscale up --exit-node=taiwan-server
# 所有流量都走台灣主機出去，不用設 proxy
```

---

## 重要：DB 等敏感服務的正確架構

**DB 不應該裝 Tailscale，也不應該連外網。**

這跟 SSH 的原則一樣 — DB 放在最內層，不直接暴露。

```
✗ 錯誤：每台機器都裝 Tailscale

你的筆電 ◄══ Tailscale ══► DB 主機
                            （DB 主動連外網？不行！）

✓ 正確：只有中繼主機裝 Tailscale

你的筆電 ◄══ Tailscale ══► 中繼主機 ──── 內網 ────► DB 主機
                           （有裝 Tailscale          （不裝 Tailscale
                            當 Subnet Router）         不連外網
                                                       完全隔離）
```

### Subnet Router 架構

```bash
# 中繼主機（10.0.0.10）上設定 subnet router
sudo tailscale up --advertise-routes=10.0.0.0/24

# 在 Tailscale 管理後台：
# 1. 批准 subnet route
# 2. 設定 ACL，限制誰能存取哪些 IP:port
```

**Tailscale ACL 設定範例**：

```json
{
  "acls": [
    {
      // 工程師可以 SSH 到開發機
      "action": "accept",
      "src": ["group:engineers"],
      "dst": ["10.0.0.50:22"]
    },
    {
      // 只有 DBA 可以連 DB
      "action": "accept",
      "src": ["group:dba"],
      "dst": ["10.0.0.70:5432"]
    },
    {
      // 所有人可以存取 GitLab
      "action": "accept",
      "src": ["group:engineers"],
      "dst": ["10.0.0.60:80,443"]
    }
  ]
}
```

這比 SSH 的 `AllowUsers` + 防火牆規則更精細 — 可以控制到**誰能連哪台機器的哪個 port**。

---

## SSH Tunnel vs Tailscale：怎麼選

| 考量 | 選 SSH Tunnel | 選 Tailscale |
|------|-------------|-------------|
| 速度 | 臨時用一下，不想裝東西 | 長期使用，需要穩定連線 |
| 環境 | 伺服器不能裝額外軟體 | 可以裝 Tailscale |
| 控制 | 要完全掌控每一條連線 | 希望自動化管理 |
| 人數 | 只有你一個人用 | 團隊多人需要存取 |
| 費用 | 免費（用現有主機） | 個人免費（最多 6 人），企業要付費 |
| 信任 | 不想依賴第三方服務 | 信任 Tailscale（或自架 Headscale） |
| 網路 | 有跳板機、Router 可以設定 | 不想碰 Router |

### 實際建議

```
個人 / Side Project：
  → Tailscale 免費版就夠了，省時間

公司環境（可以裝軟體）：
  → Tailscale Business，ACL 控制權限

公司環境（不能裝軟體）：
  → SSH Tunnel，用現有的 SSH server

臨時需求（Debug、Demo）：
  → SSH Tunnel，不用安裝直接用

不想依賴第三方：
  → 自架 Headscale（Tailscale 的開源替代）
  → 或純 WireGuard（但要自己管金鑰交換）
```

---

## 不想依賴 Tailscale 公司？自架 Headscale

Tailscale 官方免費版有限制（最多 6 個使用者、50 個 tagged resources），而且協調伺服器在他們手上。如果你想要**無限使用者、資料完全自己掌控**，可以自架 Headscale。

> **詳細教學**：[Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — Oracle Cloud 免費部署、DERP Relay、多網段 ACL 管理

---

## 總結

| | SSH Tunnel | Tailscale |
|---|---|---|
| 一句話 | 手動挖隧道 | 自動建 VPN 網路 |
| 連線方向 | 外 → 內（要開 port） | 內 → 外（不用開 port） |
| 設定 | 每條 tunnel 要自己設 | 裝好就自動連 |
| 安全性 | 靠 fail2ban、防火牆 | 靠身份驗證 + ACL |
| 適合 | 臨時用、不能裝軟體 | 長期用、團隊協作 |

兩者不是互斥的。很多團隊的做法是：

- **Tailscale** 做主要的內網連線方案
- **SSH Tunnel** 當作 Tailscale 壞掉時的備案，或在不能裝 Tailscale 的環境使用

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — 從產生金鑰到多金鑰管理
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — 每個參數的用途和執行條件
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - [（四）SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - [（番外二）Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 參考資源

- [Tailscale — How Tailscale Works](https://tailscale.com/blog/how-tailscale-works)
- [Tailscale — Pricing](https://tailscale.com/pricing)
- [Tailscale — DERP Servers](https://tailscale.com/kb/1232/derp-servers)
- [Tailscale — Subnet Routers](https://tailscale.com/kb/1019/subnets)
- [Tailscale — Exit Nodes](https://tailscale.com/kb/1103/exit-nodes)
- [Tailscale — Funnel](https://tailscale.com/kb/1223/funnel)
- [WireGuard — Official Site](https://www.wireguard.com/)
