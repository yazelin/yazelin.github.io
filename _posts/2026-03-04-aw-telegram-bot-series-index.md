---
layout: post
title: "aw-telegram-bot 系列目錄：從聊天機器人到 AI App Factory"
subtitle: "用 GitHub Agentic Workflows + Copilot 做了什麼、踩了什麼坑、學到什麼"
date: 2026-03-04 23:59
categories: [Index]
tags: [gh-aw, GitHub Actions, Copilot, Telegram, App Factory, 目錄, 系列文章]
author: Yaze Lin
---

![aw-telegram-bot 架構圖](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-03-04-aw-telegram-bot-series-index.png)

## 關於這個系列

這是一系列關於 **aw-telegram-bot** 的開發紀錄。用 [gh-aw](https://github.com/github/gh-aw)（GitHub Agentic Workflows）做了一個 Telegram 聊天機器人，從最基本的「收訊息 → AI 回覆」一路演化成能自動建 repo、寫程式、code review、部署網站的 **App Factory**。

每一篇都記錄了設計決策、踩坑過程和最終解法。

---

**系統特色：**

- 文字聊天 — Copilot（GPT-5.3-codex）驅動的 AI 對話
- AI 繪圖 — Gemini 圖片生成，直接回傳到 Telegram
- 網路研究 — Tavily 搜尋 + 內容擷取，附來源連結
- 影片下載 — yt-dlp 支援 YouTube、X 等平台
- App Factory — 一句話建網站：自動建 repo → 拆 issue → 實作 → review → 部署
- Fork + 客製化 — 找到類似開源專案直接 Fork 再客製

總計 **6 個版本、6 篇文章**。

---

## 架構總覽

```
使用者 (Telegram)
  │
  ▼
Cloudflare Worker（驗證 + 白名單 + 轉發）
  │  workflow_dispatch
  ▼
GitHub Actions（gh-aw + Copilot + MCP Servers）
  │
  ├── v1 聊天          → safe-inputs: send-telegram-message
  ├── v2 AI 繪圖       → Nanobanana MCP + Gemini API
  ├── v3 網路研究      → Tavily MCP + web-search
  ├── v4 影片下載      → yt-dlp + send-telegram-video
  └── v5-v6 App Factory
        │
        ▼
      aw-apps 組織（子 Repo）
        ├── create-repo / fork-repo
        ├── setup-repo（AGENTS.md、workflows、skills）
        ├── create-issues（結構化 Issue）
        └── implement → review → merge → 下一個 Issue
              │
              ▼
           GitHub Pages 部署
```

---

## 閱讀建議

**完整學習**：從 v1 開始，了解 gh-aw 的安全模型和設計哲學，再往後看功能逐步疊加。

**特定需求**：

- 想了解 gh-aw 基本架構 → 直接看 v1
- 想整合 MCP Server → 看 v2（Nanobanana）或 v3（Tavily）
- 想了解 safe-inputs 進階用法 → 看 v4
- 想做 AI 自動化開發流水線 → 看 v5 + v6

---

## v1 — 基本聊天機器人

> Telegram → Cloudflare Worker → GitHub Actions + Copilot → 回覆

| # | 文章 | 重點 |
|---|------|------|
| 1 | [用 GitHub Agentic Workflows 做 Telegram 聊天機器人]({% post_url 2026-03-03-aw-telegram-bot-v1-basic-chatbot %}) | 架構設計、6 個坑的踩法與解法 |

**這篇會談到：**
- `workflow_dispatch` vs `repository_dispatch` 的取捨
- gh-aw 的安全模型：expression allowlist、network firewall、secret isolation
- 為什麼 agent 不能碰 secret？safe-inputs 的設計哲學
- Python handler vs JavaScript handler 的穩定性差異
- Cloudflare Worker 作為 webhook relay 的設計

---

## v2 — AI 繪圖

> 使用者傳「畫一隻穿太空衣的貓」→ 收到 AI 生成的圖片

| # | 文章 | 重點 |
|---|------|------|
| 1 | [加上 AI 繪圖功能，踩了 Docker container 的坑]({% post_url 2026-03-03-aw-telegram-bot-v2-image-generation %}) | MCP Server 整合、Docker 環境問題 |

**這篇會談到：**
- Nanobanana MCP Server 在 gh-aw Docker 環境中的設定
- Gemini API 的圖片生成與模型選擇
- `send-telegram-photo` safe-input 的實作
- 圖片檔案從 Docker container 取出的方法

---

## v3 — 研究模式

> 使用者傳「/research 主題」→ 收到研究報告，附來源連結

| # | 文章 | 重點 |
|---|------|------|
| 1 | [研究模式 + 指令路由，踩了 concurrency 的坑]({% post_url 2026-03-03-aw-telegram-bot-v3-research-mode %}) | Tavily MCP、指令路由、concurrency 設計 |

**這篇會談到：**
- Tavily MCP Server 的 web-search 和 web-fetch 工具
- 指令路由設計：`/draw`、`/research`、無前綴自動判斷
- GitHub Actions concurrency group 導致訊息被取消的問題
- 如何讓多個功能共存在同一個 workflow

---

## v4 — 影片下載

> 使用者傳 `/download https://youtube.com/...` → 收到影片

| # | 文章 | 重點 |
|---|------|------|
| 1 | [影片下載 + 使用者白名單]({% post_url 2026-03-04-aw-telegram-bot-v4-video-download %}) | yt-dlp、safe-inputs 不受防火牆限制、Skills 架構 |

**這篇會談到：**
- yt-dlp 在 GitHub Actions 中的使用
- 發現 safe-inputs 的 Python handler 不受 gh-aw 防火牆限制（跑在沙盒外）
- Cloudflare Worker 加入使用者白名單（`ALLOWED_USERS`）
- Skills 架構：把 prompt 拆成多個 markdown 檔案管理

---

## v5 — App Factory

> 使用者傳 `/app 一個猜數字遊戲` → AI 全自動建 repo、實作、部署

| # | 文章 | 重點 |
|---|------|------|
| 1 | [App Factory — 用 Telegram 指令讓 AI 自動建網站]({% post_url 2026-03-04-aw-telegram-bot-v5-app-factory %}) | Event-driven chaining、雙 token 架構、12 個 safe-inputs |

**這篇會談到：**
- Event-driven workflow chaining：Issue → implement → PR → review → merge → 下一個 Issue
- 雙 token 架構：`FACTORY_PAT`（管 repo）+ `COPILOT_PAT`（管子 repo 操作）
- 12 個 safe-input 工具的設計與實作
- 子 repo 的 secret 自動傳遞機制
- Copilot CLI `--autopilot --yolo` 的使用

---

## v6 — 智慧規劃

> 用一半的 Premium Request 達到更好的結果，加上 Fork 和瀏覽器測試

| # | 文章 | 重點 |
|---|------|------|
| 1 | [智慧規劃 — 省一半 Premium Request，多了 Fork 和瀏覽器測試]({% post_url 2026-03-04-aw-telegram-bot-v6-smart-planning %}) | 結構化 Issue、Fork、Playwright、Review Fallback |

**這篇會談到：**
- Diverge → Define done → Converge 的規劃方法論
- 結構化 Issue 格式（Objective / Context / Approach / Files / Acceptance Criteria / Validation）
- Fork + Auto Fork Judgment（≥60% 功能匹配自動 Fork）
- Playwright 瀏覽器煙霧測試
- Review Fallback 防止鏈條卡住
- `master` vs `main` 預設分支的相容性處理

---

## 指令一覽

| 指令 | 版本 | 說明 |
|------|------|------|
| *（無前綴）* | v1+ | 聊天、翻譯、自動判斷模式 |
| `/draw <描述>` | v2+ | AI 圖片生成（Gemini） |
| `/research <主題>` | v3+ | 網路研究報告（Tavily） |
| `/download <網址>` | v4+ | 下載 YouTube、X 等平台影片 |
| `/app <描述>` | v5+ | 從零建立網頁應用 |
| `/app fork:<owner/repo> <描述>` | v6+ | Fork 現有專案並客製化 |
| `/build <owner/repo>` | v5+ | 觸發實作流程 |
| `/issue <owner/repo> <描述>` | v6+ | 在已有 Repo 追加 Issue |
| `/msg <owner/repo>#<N> <文字>` | v5+ | 在 Issue/PR 留言 |

---

## 技術棧總覽

| 層級 | 技術 |
|------|------|
| **Webhook Relay** | Cloudflare Worker（JavaScript） |
| **AI 引擎** | gh-aw + Copilot CLI（GPT-5.3-codex） |
| **圖片生成** | Nanobanana MCP + Google Gemini |
| **網路搜尋** | Tavily MCP |
| **影片下載** | yt-dlp（Python） |
| **Safe-Inputs** | 12 個 Python 動作（Telegram、GitHub、yt-dlp） |
| **子 Repo CI/CD** | GitHub Actions + Copilot CLI + Playwright |
| **部署** | GitHub Pages |

---

## 版本演進

| 版本 | 日期 | 新增功能 | Premium Request / 次 |
|------|------|----------|---------------------|
| v1 | 03-03 | 文字聊天 | 1 |
| v2 | 03-03 | AI 繪圖 | 1 |
| v3 | 03-03 | 網路研究、指令路由 | 1 |
| v4 | 03-04 | 影片下載、使用者白名單 | 1 |
| v5 | 03-04 | App Factory（全自動建站） | 1 + 10-16（子 Repo） |
| v6 | 03-04 | 智慧規劃、Fork、Playwright | 1 + 4-10（子 Repo） |

---

## Repo

- [github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)

---

Happy Coding!
