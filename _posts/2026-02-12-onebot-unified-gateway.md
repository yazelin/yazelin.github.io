---
layout: post
title: "onebot：一天從零到 v0.2.0 的統一 Bot 閘道"
subtitle: "11 個 Commit 打地基、6 個 Milestone 蓋結構、3 個 Feature 開門營業"
date: 2026-02-12
categories: [AI]
tags: [onebot, ACP, Telegram, LINE, FastAPI, Python, MCP, Skills]
author: Yaze Lin
---

![onebot 統一 Bot 閘道架構](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-12-onebot-gateway.jpg)

## 為什麼要做 onebot

手上的 bot 越來越多：Telegram bot、LINE bot、CTOS 內建的 AI chat。每個都有自己的 transport 層、自己的 session 管理、自己的 AI 呼叫方式。改一個地方要改三份 code。

我想要一個東西：**一個閘道收所有訊息，一個 agent 處理所有對話，底層 AI 隨時可以換**。

所以有了 [onebot](https://github.com/yazelin/onebot)。

---

## 架構

```
使用者 ─┬─ Telegram ──┐
        ├─ LINE ───────┤
        └─ Web Chat ───┘
                       │
                    onebot gateway
                       │
              ┌────────┼────────┐
              │        │        │
           Claude   Gemini   Copilot
           (ACP)    (ACP)    (ACP)
```

核心概念：

- **Transport 層**：Telegram（polling）、LINE（webhook）、CLI、Web API — 只負責收送訊息
- **Gateway 層**：統一的訊息管線，分派給 agent 處理
- **Backend 層**：透過 ACP（Agent Capability Platform）協定對接 Claude / Gemini / Copilot，環境變數一換就切

---

## 一天的開發時間軸

### Phase 1：骨架（C01 → C11）

11 個 commit，每個做一件事：

| Commit | 內容 |
|--------|------|
| C01 | `uv` 專案骨架 |
| C02 | Settings + Workspace |
| C03 | Skill frontmatter parser + registry |
| C04 | ClawHub wrapper + skill CLI |
| C05 | `claude-code-acp` backend wrapper |
| C06 | Workspace safety guard（限制 ACP 的 fs/terminal 權限） |
| C07 | Gateway prompt builder + `onebot chat` CLI |
| C08 | Telegram polling transport |
| C09 | FastAPI app + `onebot web` |
| C10 | Tests + lint + CI/release workflows |
| C11 | LINE webhook + MCP config + docs |

到這裡就是 v0.1.0 — 能聊天、能接 Telegram、能跑 Web API。

### Phase 2：Milestone（M1 → M6）

六個 milestone，每個都是一個 feature branch merge：

| Milestone | 功能 | 重點 |
|-----------|------|------|
| M1 | Agent Profiles | 每個 workspace 可以有多個 agent，用 Markdown frontmatter 定義人格 |
| M2 | Conversation Memory | 對話記憶持久化，context-based |
| M3 | AI Call Logs | JSONL 格式的 AI 呼叫紀錄，方便 debug |
| M4 | Bot Abstraction | 統一 Telegram/LINE 的訊息分派管線 |
| M5 | MCP Tool Catalog | 工具清單 + preflight 檢查，確保 tool 可用再呼叫 |
| M6 | Security Hardening | audit event log + 可選的 secret 加密 |

### Phase 3：上線功能（N1 → N3）

| Feature | 內容 |
|---------|------|
| N1 | Telegram binding — 使用者綁定帳號 |
| N2 | Web admin — 使用者管理 + 白名單 |
| N3 | Release v0.2.0 |

---

## Skills 整合

onebot 相容 OpenClaw/SKILLS 的 `SKILL.md` 規範。意思是：

- 所有在 ClawHub 上架的 skill 都能直接 `onebot skill install <name>` 安裝
- 本地的 skill 也支援（放到 workspace 的 `skills/` 目錄）
- Skill registry 會解析 frontmatter，自動註冊工具

```bash
# 搜尋 skill
onebot skill search "image generation"

# 安裝
onebot skill install nanobanana-pro-fallback

# 列出已安裝
onebot skill list
```

---

## 為什麼用 ACP 而不是直接打 API

ACP 是一個統一的 agent 協定 — Claude、Gemini、Copilot 都支援（透過各自的 CLI）。好處是：

1. **不用管 API key 格式差異** — ACP backend 自己處理
2. **工具呼叫語法統一** — 不用為每個 LLM 寫不同的 tool calling 格式
3. **切換後端只要改環境變數**：`ONEBOT_ACP_BACKEND=gemini`

壞處：多一層抽象，debug 的時候要多看一層 log。這就是 M3（AI Call Logs）存在的原因。

---

## 技術選型

| 層 | 選型 | 理由 |
|----|------|------|
| 語言 | Python 3.11+ | AI 生態系最完整 |
| 套件管理 | uv | 快，而且 `uv run` 可以直接跑 |
| Web | FastAPI + Uvicorn | async 原生，OpenAPI 文件自動生成 |
| CLI | Typer | Click-based，自動補全 |
| Telegram | python-telegram-bot | 成熟，支援 polling |
| 設定 | pydantic-settings | 型別安全 + 環境變數自動讀取 |

---

## 小結

從 `C01: init uv project skeleton` 到 `N3: release 0.2.0`，33 個 commit，一天。

不是因為寫 code 快，是因為之前在 CTOS 上踩過的坑都踩完了 — bot adapter 怎麼抽象、session 怎麼管理、skill 怎麼載入。onebot 只是把這些經驗重新整理成一個乾淨的框架。

下一步：把 CTOS 的 bot 層慢慢遷移到 onebot 上，讓 CTOS 專注做 OS，bot 的事交給 onebot。

---

*— Yaze Lin, 2026-02-12*
*GitHub: [github.com/yazelin/onebot](https://github.com/yazelin/onebot)*
