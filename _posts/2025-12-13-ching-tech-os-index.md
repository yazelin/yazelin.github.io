---
layout: post
title: "ChingTech OS 技術分享系列：完整目錄"
subtitle: "從前端到後端、從安全到部署的內部系統開發實戰"
date: 2025-12-13
categories: [Index]
tags: [ChingTech OS, 目錄, 系列文章]
---

## 關於這個系列

這是一系列關於 **ChingTech OS** 內部系統開發的技術分享文章。我們從零開始打造一個企業內部作業系統，涵蓋：

<video width="100%" controls style="margin: 20px 0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <source src="https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/images-ching-tech-ching-tech-os-demo.mp4" type="video/mp4">
  您的瀏覽器不支援 HTML5 影片播放。
</video>

*▲ ChingTech OS 系統展示影片（4 分 41 秒）*

---

**系統特色：**

- 🖥️ 無框架前端開發（Vanilla JS + IIFE 模組化）
- 🔌 即時通訊與終端機整合
- 🤖 AI 助手整合（Claude）
- 📁 NAS 檔案系統存取
- 🔐 安全認證機制
- 🚀 開發環境與部署

總計 **6 個系列、17 篇文章**，適合想了解完整系統開發流程的工程師參考。

---

## 基礎知識

在閱讀系列文章之前，建議先了解以下基礎概念：

| 主題 | 文章 | 說明 |
|------|------|------|
| Linux | [Linux 終端機入門：開發者必備指令]({% post_url 2025-12-13-linux-basics %}) | 終端機操作、SSH、rsync |
| SSH | [SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) | 金鑰產生、參數說明、多金鑰管理 |
| SSH | [SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) | X11 Forwarding、Tunnel、跳板機 |
| SSH | [SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) | 攻擊手法、fail2ban、防火牆、2FA |
| SSH | [SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) | 咖啡廳連內網、翻牆、遠端 Demo |
| SSH | [Tailscale — SSH Tunnel 的現代替代方案]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) | WireGuard VPN、不用開 port |
| SSH | [Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) | 無限裝置、DERP、多網段 ACL |
| Docker | [Docker 基礎概念與常用指令]({% post_url 2025-12-13-docker-basics %}) | 容器化基礎、docker-compose 入門 |
| SDD 開發流程 | [SDD 規格驅動開發入門（一）：環境安裝篇]({% post_url 2025-12-07-sdd-setup-guide %}) | Claude Code、OpenSpec、uv 環境建置 |

---

## 閱讀建議

**新手路線**：
1. 先閱讀「基礎知識」區塊的文章
2. 從系列一開始，了解前端架構
3. 依序閱讀各系列

**特定需求**：
- 想做 Web Terminal → 直接看系列二
- 想整合 AI → 直接看系列三
- 想存取 NAS → 直接看系列四
- 想快速建立開發環境 → 直接看系列六

---

## 系列一：無框架前端開發實戰

> 不用 React/Vue，用 Vanilla JS 打造完整的桌面風格 Web 應用

| # | 文章 | 重點 |
|---|------|------|
| 1 | [為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景]({% post_url 2025-12-10-vanilla-js-why-no-framework %}) | IIFE 模組化、框架取捨 |
| 2 | [視窗系統（上）：讓網頁變成桌面 - 基礎拖曳功能]({% post_url 2025-12-10-window-system-part1-drag %}) | 拖曳事件、座標計算 |
| 3 | [視窗系統（中）：縮放、最大化與多視窗管理]({% post_url 2025-12-10-window-system-part2-resize %}) | 八方向縮放、Z-index 管理 |
| 4 | [視窗系統（下）：Window Snap 與 Taskbar 整合]({% post_url 2025-12-10-window-system-part3-snap %}) | 邊緣吸附、工作列同步 |
| 5 | [CSS 設計系統：一行程式碼切換全站主題]({% post_url 2025-12-10-css-design-system-theme %}) | CSS Variables、主題切換 |

---

## 系列二：Web 終端機從零開始

> 在網頁上跑出真正的 Terminal，支援 vim、htop 等互動程式

| # | 文章 | 重點 |
|---|------|------|
| 1 | [什麼是 PTY？讓網頁跑出真正的 Terminal]({% post_url 2025-12-11-web-terminal-part1-pty %}) | PTY 原理、ptyprocess |
| 2 | [後端架構：FastAPI + Socket.IO 雙向通訊]({% post_url 2025-12-11-web-terminal-part2-socketio %}) | WebSocket、即時通訊 |
| 3 | [前端整合：xterm.js 打造完整終端體驗]({% post_url 2025-12-11-web-terminal-part3-xtermjs %}) | xterm.js、ANSI 色彩 |

---

## 系列三：在 Web 應用中整合 Claude AI

> 讓內部系統擁有 AI 助手，從架構到 Prompt 設計

| # | 文章 | 重點 |
|---|------|------|
| 1 | [架構選擇：Claude CLI 整合與對話設計]({% post_url 2025-12-11-claude-ai-part1-architecture %}) | CLI vs API、對話管理 |
| 2 | [Token 管理：估算、警告與自動壓縮]({% post_url 2025-12-11-claude-ai-part2-token %}) | Token 計算、對話壓縮 |
| 3 | [System Prompt 設計：打造專屬 AI 助手人格]({% post_url 2025-12-11-claude-ai-part3-prompt %}) | Prompt 工程、角色設定 |

---

## 系列四：Python 存取 NAS 檔案系統

> 用 Python 連接公司 NAS，實作完整的檔案管理 API

| # | 文章 | 重點 |
|---|------|------|
| 1 | [SMB 協定入門：用 Python 連接公司 NAS]({% post_url 2025-12-12-smb-nas-part1-protocol %}) | SMB 協定、smbprotocol |
| 2 | [檔案管理 API：FastAPI 實作上傳下載刪除]({% post_url 2025-12-12-smb-nas-part2-api %}) | RESTful API、串流下載 |

---

## 系列五：Web 應用安全機制實作

> 不用另建帳號系統，用 NAS 帳號實現認證與追蹤

| # | 文章 | 重點 |
|---|------|------|
| 1 | [認證系統：用 NAS 帳號實現 SSO 效果]({% post_url 2025-12-12-security-part1-auth %}) | Session 管理、SMB 認證 |
| 2 | [登入追蹤：裝置指紋與地理位置記錄]({% post_url 2025-12-12-security-part2-tracking %}) | 裝置指紋、GeoIP |

---

## 系列六：開發環境與資料庫管理

> 新人加入專案，五分鐘就能開始開發

| # | 文章 | 重點 |
|---|------|------|
| 1 | [Alembic 資料庫版本控制：讓 Schema 變更可追蹤]({% post_url 2025-12-13-devops-part1-alembic %}) | Migration、版本控制 |
| 2 | [Docker Compose 一鍵啟動開發環境]({% post_url 2025-12-13-devops-part2-docker %}) | 容器化、環境統一 |

---

## 技術棧總覽

| 層級 | 技術 |
|------|------|
| **前端** | Vanilla JS、IIFE 模組、xterm.js、CSS Variables |
| **後端** | Python、FastAPI、Socket.IO、Uvicorn |
| **資料庫** | PostgreSQL、Alembic、asyncpg |
| **檔案系統** | SMB/CIFS、smbprotocol、smbclient |
| **AI** | Claude CLI、Prompt Engineering |
| **DevOps** | Docker Compose、code-server |
| **安全** | Session Token、裝置指紋、GeoIP |

---

## 專案結構

```
ching-tech-os/
├── frontend/           # 前端程式碼
│   ├── js/            # JavaScript 模組
│   ├── css/           # 樣式表
│   └── index.html     # 主頁面
├── backend/           # 後端程式碼
│   ├── src/           # Python 原始碼
│   ├── migrations/    # Alembic migrations
│   └── alembic.ini    # Alembic 設定
├── docker/            # Docker 設定
│   ├── docker-compose.yml
│   └── .env.example
└── data/              # 資料檔案
    └── prompts/       # AI Prompt 模板
```

---

## 參考資源

### 官方文件

- [FastAPI](https://fastapi.tiangolo.com/)
- [Socket.IO](https://socket.io/)
- [xterm.js](https://xtermjs.org/)
- [Alembic](https://alembic.sqlalchemy.org/)
- [Docker Compose](https://docs.docker.com/compose/)
- [Claude API](https://docs.anthropic.com/)

### 相關工具

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic 官方 CLI
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) - 規格驅動開發工具
- [uv](https://docs.astral.sh/uv/) - Python 套件管理器

---

Happy Coding! 🚀
