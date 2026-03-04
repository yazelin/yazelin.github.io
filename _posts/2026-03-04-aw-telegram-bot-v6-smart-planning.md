---
layout: post
title: "aw-telegram-bot v6：智慧規劃 — 省一半 Premium Request，多了 Fork 和瀏覽器測試"
subtitle: "結構化 Issue、Auto Fork Judgment、Playwright 煙霧測試、/issue 指令"
date: 2026-03-04
categories: [AI]
tags: [gh-aw, GitHub Actions, Copilot, Telegram, App Factory, automation, Playwright]
author: Yaze Lin
---

![aw-telegram-bot v6](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-03-04-aw-telegram-bot-v6-smart-planning.png)

## 前情提要

[v1](/2026/03/03/aw-telegram-bot-v1-basic-chatbot/) 文字聊天，[v2](/2026/03/03/aw-telegram-bot-v2-image-generation/) AI 繪圖，[v3](/2026/03/03/aw-telegram-bot-v3-research-mode/) 研究模式，[v4](/2026/03/04/aw-telegram-bot-v4-video-download/) 影片下載，[v5](/2026/03/04/aw-telegram-bot-v5-app-factory/) App Factory。

v5 實現了「一句話建網站」，但有幾個痛點讓我馬上想改。

---

## v5 的問題

| 問題 | 影響 |
|------|------|
| 建太多小 Issue（5-8 個） | 每個 Issue = 2 個 Premium Request（實作 + 審查），很多只改不到 10 行 |
| 沒有 Fork 支援 | 只能從零建，無法利用現有開源專案 |
| Issue 格式太隨意 | Copilot CLI 不知道怎麼驗證「完成」 |
| 審查只看程式碼 | 沒跑瀏覽器，發現不了 runtime 錯誤 |
| 審查可能不做動作 | Review agent 結束時沒執行 approve/request-changes，整條鏈卡住 |

用猜數字遊戲為例：v5 建了 6 個 Issue，其中 4 個改了不到 10 行。花 12 個 Premium Request，其中 8 個幾乎是浪費。

---

## v6 改了什麼

### 1. 智慧規劃：Diverge → Define done → Converge

重寫 Phase 2-4 的 Prompt：

```
Phase 2: Deep Research（發散）
  → web-search 搜 2-3 個類似專案
  → web-fetch 讀 README 和架構
  → 分析功能耦合度
  → 判斷：從零建 or Fork？

Phase 3: Define "done"
  → 寫全 App 的驗收標準
  → 每條必須可驗證

Phase 4: Plan backwards（收斂）
  → 列出所有功能
  → 分析依賴：耦合的合併，獨立的分開
  → 目標 2-5 個 Issue
```

同樣的猜數字遊戲，現在 3 個 Issue × 2 = 6 個 Premium Request。**省 50%。**

### 2. 結構化 Issue 格式

每個 Issue 都遵循統一結構：

```markdown
## Objective
[用使用者看得懂的語言]

## Context
[跟其他 Issue 的關係]

## Approach
1. [逐步實作指引，每步一次 commit]

## Files
- Create: `index.html`, `style.css`
- Modify: `README.md`

## Acceptance Criteria
- [ ] [可勾選的驗收項目]

## Validation
- [具體驗證步驟]
```

Copilot CLI 實作時照 Approach 做，審查時對照 Acceptance Criteria 逐條檢查。不再猜。

### 3. Fork + 客製化

新增兩種 Fork 方式：

**手動 Fork**：`/app fork:owner/repo <客製化描述>`

**Auto Fork Judgment**：Phase 2 搜尋時如果找到 ≥60% 功能匹配的開源專案，自動 Fork。

Fork 流程：
1. Fork 到 `aw-apps` 組織
2. 啟用 Issues（GitHub Fork 預設關閉）
3. 注入 AGENTS.md、工作流程、技能文件
4. 建立客製化 Issue → 自動實作

### 4. Playwright 瀏覽器測試

Review workflow 新增煙霧測試：

```
1. python3 -m http.server 8000 &
2. Playwright 開啟 http://localhost:8000
3. 等 3 秒，收集 console 錯誤
4. 有 console 錯誤 → REQUEST CHANGES
5. kill server
```

以前只看程式碼。現在實際開瀏覽器跑一次。

### 5. Review Fallback

Review agent 偶爾會結束時沒做任何動作。加了 fallback step：

```yaml
- name: Fallback if review took no action
  run: |
    # PR 仍 OPEN 且沒有 review action → 自動合併
```

不再卡住。

### 6. `/issue` 指令

已部署的 App 想修 Bug 或加功能：

```
/issue aw-apps/my-app 電腦版按鈕重疊了
  → 建立結構化 Issue
  → /build 觸發實作
  → 自動審查 + 合併
```

---

## 測試紀錄

### 測試 1: Fork + 客製化

```
/app fork:niccolozy/trigonometric-functions 加上中文介面和深色主題
  → Fork 到 aw-apps/trigonometric-functions-control-panel ✅
  → 啟用 Issues ✅
  → 3 個 Issue 建立 ✅
  → /build → 3/3 完成 ✅
```

踩到一個坑：GitHub Fork 預設關閉 Issues。修正 `fork_repo.py`，Fork 後自動呼叫 `gh api repos/{repo} -X PATCH -f has_issues=true`。

### 測試 2: Auto Fork Judgment

```
/app 2048 遊戲，深色風格
  → Phase 2 搜到 gabrielecirulli/2048
  → 判斷 ≥60% 功能匹配 → 自動 Fork ✅
  → Fork 到 aw-apps/2048-dark-web
  → 3/3 Issue 完成 ✅
```

驗證方式：safe-inputs log 顯示 9:26:30 AM 呼叫了 `fork-repo`，AGENTS.md 引用 `gabrielecirulli/2048` 作為 fork base。

踩到兩個坑：

**坑 1：`git push origin main` 失敗**

`gabrielecirulli/2048` 的預設分支是 `master` 不是 `main`。`setup_repo.py` 硬編碼了 `main`。

修正：`git rev-parse --abbrev-ref HEAD` 偵測預設分支。

**坑 2：Review workflow 不觸發**

`review.yml` 的 trigger 有 `branches: [main]`，但 PR 的 target 是 `master`。

修正：移除 `branches: [main]`，靠 `if: startsWith(github.head_ref, 'issue-')` 過濾。

### 測試 3: `/issue` 指令

2048 深色版部署後，電腦版寬螢幕的 New Game 和 Dark Mode 按鈕重疊了。正好測試 `/issue`：

```
/issue aw-apps/2048-dark-web 電腦版寬螢幕按鈕重疊
  → Issue #7 建立 ✅
  → /build → 實作 → 審查 → 合併 ✅
```

---

## 修正清單

| Bug | 原因 | 修正 |
|-----|------|------|
| Fork 後無法建 Issue | GitHub Fork 預設關閉 Issues | `fork_repo.py` 加 `has_issues=true` |
| Fork repo push 失敗 | `setup_repo.py` 硬編碼 `main` | `git rev-parse --abbrev-ref HEAD` |
| Review 不觸發 | `branches: [main]`，但 Fork 用 `master` | 移除 branch filter |
| Review 不做動作 | Copilot CLI 偶爾沒跑 gh command | 加 fallback step |

---

## 成本分析

| 指標 | v5 | v6 |
|------|----|----|
| Issue 數量 | 5-8 | 2-5 |
| Premium Request / App | 10-16 | 4-10 |
| 節省 | — | ~50% |
| Fork 支援 | ❌ | ✅ |
| 瀏覽器測試 | ❌ | ✅ |
| 審查卡住復原 | ❌ | ✅ |
| 追加 Issue | ❌ | ✅ |

---

## 心得

### Fork 比想像中複雜

預設分支不一定是 `main`、Issues 預設關閉、Pages 設定要指定分支。每個假設都可能出錯。不要硬編碼。

### 結構化 Issue 大幅提升成功率

給 Copilot CLI 明確的 Approach 步驟和 Validation 方法，它就不會迷路。比起「Implement the feature」這種空泛指令，差非常多。

### Fallback 機制是必要的

AI agent 不保證 100% 照你說的做。與其期望完美，不如設計 fallback。Review 不做動作？自動合併。Issue 卡住？加 label + Telegram 通知。

### 省 Premium Request = 省錢 + 省時間

3 個 Issue 從開始到全部完成大約 30 分鐘，比 6 個 Issue 的 60+ 分鐘快很多。而且每個 Issue 的內容更充實，Copilot CLI 一次做更多有意義的工作。

---

## 修改的檔案

| 檔案 | 變更 |
|------|------|
| `telegram-bot.md` | Phase 2-4 重寫、Guidelines 更新 |
| `implement.yml` 範本 | 結構化實作 prompt、pre-push 檢查 |
| `review.yml` 範本 | 嚴格審查 prompt、Playwright 測試、fallback |
| `fork_repo.py` | `has_issues=true` |
| `setup_repo.py` | 偵測預設分支 |
| `README.md` | 完整重寫（含環境變數架構） |

---

## Repo

- [github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)
- `v6` 分支

---

*— Yaze Lin, 2026-03-04*
