---
layout: post
title: "6 個 Commits 修了半個系統"
subtitle: "CTOS 2/11 — SkillHub 生態系、簡報重構、資源洩漏、文件統一"
date: 2026-02-11
categories: [ChingTech OS]
tags: [CTOS, SkillHub, ClawHub, aiohttp, Claude, 重構]
author: Yaze Lin
---

## 今天的 CTOS

六個 commit，四個方向。看起來不多，但每個都踩到不同層的問題。

---

## 1. SkillHub 安裝終於不會爆了

SkillHub 從 GitHub 下載 skill 的流程一直有問題：GitHub 回 302 redirect，舊的 code 不跟重導向，直接拿到一個 HTML 頁面當 ZIP 解壓 — 當然炸了。

修了三件事：
- **302 重導向**：正確跟隨 redirect 拿到真正的 ZIP
- **巢狀目錄 flatten**：GitHub 的 ZIP 裡面會多包一層目錄（`repo-main/`），解壓後要把它攤平
- **SKILL.md frontmatter**：如果 skill 沒附 frontmatter，自動生成一份

順便修了 AI Chat 的 JSONB 重複 `json.loads()` 導致 500 錯誤，還有 UI 的透明度問題 — 桌面背景圖片拿掉了，各元件補齊 CSS 變數。

---

## 2. ClawHub REST API 取代 CLI

之前 CTOS 呼叫 ClawHub 是用 `subprocess` 跑 CLI。能用，但慢、不好處理錯誤、也不好拿 metadata。

現在換成 `ClawHubClient` 類別，直接打 REST API：
- **deny-by-default 權限模型**：skill 預設什麼都不能做，要明確授權
- **加密 skill 環境管理**：API key 之類的敏感資料加密存放
- **script runner 自動工具註冊**：skill 裡的 script 自動變成可呼叫的工具
- **前端搜尋**：搜尋結果多顯示 metadata（版本、作者、標籤）

---

## 3. 簡報生成不再套娃

舊的 `presentation_tools.py` 是個怪物：自己內嵌 prompt，然後巢狀呼叫 Claude 來生內容，再自己做格式轉換。一層套一層，debug 的時候根本不知道問題在哪。

重構後職責分離：
- `presentation_tools.py` 只負責**格式修正與儲存**，不再呼叫 AI
- AI 生成的部分交給上層處理
- 順便加了 `_cleanup_claude_client()` 清理殭屍行程
- Telegram Bot timeout 設成 `None`，長時間生成不再超時斷線

---

## 4. MD2PPT/MD2DOC 規範大補帖

SKILL.md 的格式規範從 80 行擴充到 **210 行**。之前太精簡，AI 生出來的簡報品質不穩定。

補了什麼：
- Layout 範例（標題頁、內容頁、圖表頁、結尾頁）
- 圖表語法（Mermaid、表格、程式碼區塊）
- 完整範例從 4 頁擴充至 7 頁
- 品質強制要求（字數下限、排版規則）
- 電競紫配色方案（亞澤的偏好色）

---

## 5. aiohttp Session 洩漏

這個是潛伏型 bug。

Line Bot 的 `AsyncApiClient` 每次呼叫都建一個新的 aiohttp session，用完不關。跑久了 session 越來越多，connection pool 耗盡，整台機器變慢。

修法：
- `AsyncApiClient` 改成**共用單例**，整個 app 生命週期只建一次
- `claude_agent` 改用 `ClaudeClient.close()` 正確關閉
- 順便移除查詢已不存在的 `projects` 表（歷史遺留）
- 升級 `claude-code-acp` 至 0.4.4

---

## 6. 開發文件統一

CTOS 現在有兩個 AI coding agent 在用：Claude Code 和 GitHub Copilot。兩邊各有自己的指令檔（`CLAUDE.md` 和 `.github/copilot-instructions.md`），內容常常不同步。

解法很簡單：
- `CLAUDE.md` 作為 single source of truth，補上技術架構摘要、目錄結構、Python 依賴列表
- `.github/copilot-instructions.md` 改成 **symlink** 指向 `CLAUDE.md`

一份文件，兩個 agent 都讀同一份。

---

## 小結

| Commit | 重點 |
|--------|------|
| `5c7928d` | SkillHub 安裝修復 + UI 透明度 |
| `ce4d34c` | ClawHub REST API 整合 |
| `f605eb0` | 簡報生成重構 |
| `52b1b9c` | MD2PPT/MD2DOC 規範 210 行 |
| `2bfafa7` | aiohttp session 洩漏修復 |
| `2609899` | CLAUDE.md 統一開發文件 |

六個 commit，涵蓋了從前端 CSS 到後端 session 管理、從 AI prompt 工程到 skill 生態系。今天的 CTOS 比昨天更健康一點。

---

*— Yaze Lin, 2026-02-11*
