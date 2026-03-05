---
layout: post
title: "telegram-copilot-bot：不用 gh-aw 的輕量版 Telegram AI 機器人"
subtitle: "移除 gh-aw 依賴，用 npm install 直接裝 Copilot CLI，功能完全相同"
date: 2026-03-05
categories: [AI]
tags: [GitHub Actions, Copilot, Telegram, Cloudflare Workers, App Factory, Gemini]
author: Yaze Lin
---

![telegram-copilot-bot](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-03-05-telegram-copilot-bot-no-ghaw.png)

## 想做什麼

[aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot) 用 [gh-aw](https://github.com/github/gh-aw)（GitHub Agentic Workflows）框架驅動，功能很完整，但 gh-aw 目前仍是 **Limited Preview**，需要申請才能使用。

這個專案的目標：**做一個功能完全相同、但不依賴 gh-aw 的版本**。

任何有 GitHub Copilot 訂閱的人都能直接用。

---

## 架構對照

兩個版本的架構幾乎一樣，差異只在 AI 引擎的安裝方式和工具層：

```
使用者 (Telegram)
  │
  ▼
Cloudflare Worker（驗證 + 白名單 + 轉發）
  │  workflow_dispatch
  ▼
GitHub Actions
  │
  ├── 原版：gh-aw compile → .lock.yml → Copilot + Safe-Inputs + MCP
  │
  └── 輕量版：npm install -g @github/copilot → copilot --autopilot --yolo + Python 腳本 + MCP
```

---

## 差異對照表

| 項目 | aw-telegram-bot（原版） | telegram-copilot-bot（輕量版） |
|------|------------------------|-------------------------------|
| AI 引擎安裝 | `gh-aw`（GitHub Agentic Workflows 框架） | `npm install -g @github/copilot`（直接安裝） |
| Prompt 格式 | `telegram-bot.md` → `gh aw compile` 編譯成 `.lock.yml` | `prompt.md` 直接使用，不需編譯 |
| 工具腳本 | Safe-Inputs（gh-aw 原生沙箱機制） | Python 腳本（`.github/scripts/`） |
| 圖片生成 | Nanobanana MCP Server | 直接呼叫 Gemini REST API |
| 網路搜尋 | Tavily MCP Server | Tavily MCP Server（相同） |
| 影片下載 | yt-dlp | yt-dlp（相同） |
| App Factory | 事件驅動開發鏈 | 事件驅動開發鏈（相同） |
| 子 Repo 結構 | implement.yml + review.yml + skills | 相同 |

---

## 怎麼做的

### 1. 用 npm 裝 Copilot CLI

原版用 `gh-aw` 編譯 Markdown 成 GitHub Actions workflow，背後還是跑 Copilot CLI。

輕量版跳過框架，直接裝：

```yaml
- name: Install Copilot CLI
  run: npm install -g @github/copilot

- name: Run agent
  run: |
    copilot --autopilot --yolo \
      --max-autopilot-continues 30 \
      -p "$(cat prompt.md)

      User message from chat_id ${{ inputs.chat_id }}:
      ${{ inputs.text }}"
```

`--autopilot` 不需要人確認，`--yolo` 允許執行所有工具，`--max-autopilot-continues 30` 讓它跑最多 30 個回合。

### 2. Python 腳本取代 Safe-Inputs

原版的 Safe-Inputs 跑在 gh-aw 沙箱裡，有檔案存取和網路防火牆的保護。

輕量版直接用 Python 腳本，放在 `.github/scripts/`：

```
.github/scripts/
├── send_telegram_message.py    # 傳文字
├── send_telegram_photo.py      # 傳圖片
├── send_telegram_video.py      # 傳影片
├── download_video.py           # yt-dlp 下載
├── generate_image.py           # Gemini 圖片生成
├── create_repo.py              # 建 GitHub Repo
├── fork_repo.py                # Fork Repo
├── setup_repo.py               # 推送初始檔案
├── create_issues.py            # 建 Issue
├── setup_secrets.py            # 設定 Secret
├── trigger_workflow.py         # 觸發 Workflow
├── post_comment.py             # Issue/PR 留言
└── manage_labels.py            # 標籤管理
```

共 13 個腳本，跟原版的 12 個 Safe-Inputs 功能一一對應，多了一個 `generate_image.py`。

### 3. Gemini 直接 API 取代 Nanobanana MCP

原版用 Nanobanana MCP Server 做圖片生成。在輕量版測試時發現 **MCP 工具在 Copilot CLI 的 `--autopilot` 模式下不穩定** — 工具載入了但呼叫時回報「Tool does not exist」。

解法：寫一個 `generate_image.py`，直接呼叫 Gemini REST API：

```python
models = [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
]
```

三個模型輪流 fallback。用 `responseModalities: ["TEXT", "IMAGE"]` 拿回圖片的 base64 資料，存成 PNG。

> **踩坑**：Gemini 的 model ID 不是你想的那樣。`gemini-3.0-pro-preview` → 404，正確的是 `gemini-3-pro-image-preview`（要加 `-image-preview` 後綴）。`gemini-2.5-flash` → 400（不支援圖片輸出），正確的是 `gemini-2.5-flash-image`。

### 4. App Factory 範本

App Factory 建立的子 Repo 需要 `implement.yml` 和 `review.yml` 才能跑自動開發鏈。

在 `.github/templates/` 放好範本，Prompt 指示 Copilot 在建 Repo 時讀取範本並推送：

```
.github/templates/
├── workflows/
│   ├── implement.yml     # 自動實作 Issue
│   └── review.yml        # 自動審查 PR + Playwright 測試
└── skills/
    ├── issue-workflow-SKILL.md
    ├── code-standards-SKILL.md
    ├── testing-SKILL.md
    └── deploy-pages-SKILL.md
```

子 Repo 的事件驅動鏈跟原版完全一樣：

```
Issue → implement.yml → PR → review.yml → merge → 下一個 Issue → 循環
```

---

## 踩坑紀錄

### 坑 1：MCP 在 autopilot 模式下不穩定

Copilot CLI 的 `--autopilot` 模式下，MCP Server 的工具有時載入失敗，回報 `Tool 'generate_image' does not exist`。

試過調整 MCP config 格式（加 `type: local`、移除 `type: local`、加 `tools: ["*"]`），都不穩定。

**解法**：圖片生成改用直接 REST API 呼叫，不依賴 MCP。Tavily MCP 則正常運作。

### 坑 2：Gemini model ID 不是 semver

Google 的 Gemini 圖片生成模型 ID 不遵循語義化版本號：

| 你以為的 ID | 實際的 ID |
|------------|----------|
| `gemini-3.0-pro-preview` | `gemini-3-pro-image-preview` |
| `gemini-3.1-flash-preview` | `gemini-3.1-flash-image-preview` |
| `gemini-2.5-flash` | `gemini-2.5-flash-image` |

必須加上 `-image` 或 `-image-preview` 後綴才支援圖片輸出。

### 坑 3：node_modules 沒 gitignore

Worker 的 `node_modules/` 沒被 `.gitignore` 排除，一次 `git add -A` 就把 113MB 的 `workerd` 二進制檔 commit 進去了，push 被 GitHub 擋下。

**解法**：`git reset --soft` 回到上一個乾淨的 commit，加上 `.gitignore`，重新 commit。

### 坑 4：GitHub Pages 沒自動啟用

`setup_repo.py` 推送檔案後立即呼叫 Pages API，有時因為 Repo 剛建好還沒完全準備好而失敗。

**解法**：加上 retry（3 次、間隔 5 秒），並在 Prompt 裡加一個額外的驗證步驟。

---

## 功能驗證

全部功能都經過實際測試：

| 功能 | 狀態 |
|------|------|
| 一般聊天 | ✅ |
| `/draw` 圖片生成 | ✅ |
| `/research` 網路研究 | ✅ |
| `/translate` 翻譯 | ✅ |
| `/download` 影片下載 | ✅ |
| `/app` 從零建立 | ✅ |
| `/app fork:` Fork 客製化 | ✅ |
| `/build` 觸發建置 | ✅ |
| `/issue` 建立 Issue | ✅ |
| `/msg` 訊息轉發 | ✅ |
| App Factory 事件驅動鏈 | ✅（implement → review → merge → 下一個 Issue） |

---

## 結論

gh-aw 是好框架 — Safe-Inputs 的沙箱保護、結構化的 Prompt 管理、和 MCP 整合都很成熟。但如果你沒有 gh-aw 的存取權限，或是想要更簡單的部署方式，這個輕量版是功能等價的替代方案。

核心差異就一個：**原版靠框架，輕量版靠腳本**。

---

## Repo

- **輕量版**：[github.com/yazelin/telegram-copilot-bot](https://github.com/yazelin/telegram-copilot-bot)
- **原版**：[github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)
- **原版系列文章**：[aw-telegram-bot 系列目錄]({% post_url 2026-03-04-aw-telegram-bot-series-index %})
