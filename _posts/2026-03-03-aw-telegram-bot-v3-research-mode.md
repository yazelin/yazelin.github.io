---
layout: post
title: "aw-telegram-bot v3：研究模式 + 指令路由，踩了 concurrency 的坑"
subtitle: "Tavily MCP + web-search → 使用者傳問題就能收到研究報告，還解決了訊息被取消的問題"
date: 2026-03-03
categories: [AI]
tags: [gh-aw, GitHub Actions, Copilot, Telegram, MCP, Tavily, concurrency]
author: Yaze Lin
---

## 前情提要

[v1](/2026/03/03/aw-telegram-bot/) 做了基本的文字聊天機器人，[v2](/2026/03/03/aw-telegram-bot-v2-image-generation/) 加上了 AI 繪圖。

v3 的目標：**使用者傳「/research 台灣半導體產業最新發展」→ 收到一份研究報告，附來源連結**。

順便加上指令路由：`/draw`、`/translate`、無前綴自動判斷。

---

## 架構

```
使用者：「/research 2026半導體產業研究報告?」
  │
  ▼
Telegram → CF Worker → GitHub Actions (workflow_dispatch)
  │
  ▼
Copilot Agent（判斷：/research 前綴 → 研究模式）
  │
  ├─ 1. Tavily MCP: search(query)       ← 結構化搜尋結果
  ├─ 2. web-search(query)               ← 補充搜尋角度
  ├─ 3. web-fetch(url) × 2-3            ← 深入讀取重要來源
  │
  ▼
Agent 綜合所有結果，整理成報告
  │  呼叫 send-telegram-message(chat_id, text)
  ▼
使用者收到研究報告（含來源連結）
```

v2 有兩條路（文字 / 圖片），v3 有四條：

| 前綴 | 模式 | 工具 |
|------|------|------|
| `/research` | 研究 | Tavily + web-search + web-fetch |
| `/draw` | 繪圖 | nanobanana generate_image |
| `/translate` | 翻譯 | 純文字（agent 自行翻譯） |
| 無前綴 | 自動判斷 | Agent 根據內容選擇 |

---

## 新增的元件

### 1. Tavily MCP Server（Remote HTTP）

跟 v2 的 nanobanana 不同，Tavily 不需要 Docker container。它提供 remote HTTP endpoint，gh-aw 直接連：

```yaml
mcp-servers:
  tavily:
    url: "https://mcp.tavily.com/mcp/?tavilyApiKey=${{ secrets.TAVILY_API_KEY }}"
    allowed: ["*"]
```

這是 gh-aw 的第三種 MCP server 模式：

| 模式 | 設定 | 適用情境 |
|------|------|---------|
| Command 模式 | `command:` + `args:` | compiler 自動選 Docker image |
| Container 模式 | `container:` + `entrypointArgs:` | 自己指定 Docker image |
| **Remote HTTP 模式** | `url:` + `headers:`（可選） | 外部 SaaS MCP endpoint |

Remote HTTP 最簡單 — 不需要 Docker，不需要 volume mount，不需要擔心 runtime 環境。

### 2. web-search 內建工具

gh-aw 有內建的 `web-search` 工具，加一行就能用：

```yaml
tools:
  web-fetch:
  web-search:    # 新增
```

搭配 Tavily 形成三層搜尋：
- **Tavily**：AI 優化的結構化搜尋結果（快，直接回 JSON）
- **web-search**：補充搜尋角度
- **web-fetch**：深入讀取特定網頁全文

### 3. 指令路由 Prompt

告訴 agent 看前綴來決定走哪條路：

```markdown
## Instructions

1. Check the message for a command prefix:
   - `/research <topic>` → Research mode
   - `/draw <description>` → Image generation mode
   - `/translate <text>` → Translation mode
   - No prefix → Auto-judge: pick the best mode based on content
2. Execute the appropriate workflow below.
3. Always send exactly one response.
```

Agent 自己判斷路由。不需要寫路由邏輯，prompt 就夠了。

---

## 踩坑：gh-aw 的 concurrency 預設

這是 v3 最意外的坑。不是新增功能本身出問題，而是發現一直存在但沒注意到的平台行為。

### 症狀

連續發了幾條訊息測試，只有第一條和最後一條有回覆。中間的訊息在 GitHub Actions 上顯示灰色驚嘆號（cancelled）。

### 原因

`gh aw compile` 自動在 lock.yml 裡加了：

```yaml
concurrency:
  group: "gh-aw-${{ github.workflow }}"
```

這代表**整個 workflow 同時只能跑 1 個 run**。GitHub Actions 的 concurrency group 有硬性限制：

> 每個 group 最多 1 running + 1 pending。第 3 個 run 進來會取消 pending 的那個。

所以連發 3 條訊息：訊息 1 在跑，訊息 2 排隊，訊息 3 進來把訊息 2 踢掉。

v1/v2 沒發現這個問題，因為測試時都是一次只發一條。

### 嘗試過的方法

| 嘗試 | 結果 |
|------|------|
| 在 frontmatter 加 `concurrency:` per-chat_id group | 有效，但同一使用者連發 3 條仍會丟第 2 條 |
| 移除 frontmatter 的 `concurrency:` | gh-aw compiler 自動補回 `gh-aw-${{ github.workflow }}`，更慘 |

### 解法：per-run_id concurrency group

```yaml
concurrency:
  group: "gh-aw-${{ github.workflow }}-${{ github.run_id }}"
  cancel-in-progress: false
```

因為 `github.run_id` 每次 run 都不同，所以每個 run 都有自己獨立的 concurrency group。等於完全繞過了 1+1 的限制。

實際上能同時跑多少個 run？取決於 GitHub 帳號的 concurrent jobs 上限：

| Plan | 同時 jobs 數 | 換算 runs（每 run 2 jobs） |
|------|-------------|--------------------------|
| Free | 20 | 10 |
| Pro | 40 | 20 |

測試結果：連發 6 條訊息，6 個 run 同時 in_progress，全部 success，零 cancelled。

---

## 其他調整

### timeout 從 5 分鐘改成 15 分鐘

研究模式需要呼叫多個搜尋工具 + 讀取多個網頁 + 整理報告，5 分鐘可能不夠。改成 15 分鐘（gh-aw 最大支援 360 分鐘）。

實測研究模式約 2-3 分鐘完成，比預期快。主要歸功於 Tavily 直接回傳結構化結果，不需要 agent 自己爬網頁。

### 預設繁體中文

在 prompt 的 guidelines 加了：

```markdown
- Always respond in Traditional Chinese (繁體中文) unless the user writes in another language
```

---

## gh-aw 的 MCP server 模式整理（更新版）

v2 的文章整理了 Command 和 Container 兩種模式，v3 加入了第三種：

### Remote HTTP 模式

```yaml
mcp-servers:
  my-tool:
    url: "https://api.example.com/mcp"     # remote endpoint
    headers:                                 # 可選，認證用
      Authorization: "Bearer ${{ secrets.TOKEN }}"
    allowed: ["*"]
```

不需要 Docker container，gh-aw 直接透過 HTTP 連線到外部 MCP server。適合用 SaaS 服務（Tavily、DeepWiki 等）。

需要把 domain 加到 network allowlist：

```yaml
network:
  allowed:
    - defaults
    - mcp.tavily.com    # remote MCP endpoint
```

### 三種模式比較

| | Command | Container | Remote HTTP |
|-|---------|-----------|-------------|
| 設定 | `command:` + `args:` | `container:` + `entrypointArgs:` | `url:` + `headers:` |
| 執行環境 | compiler 自選 Docker | 你指定 Docker image | 外部 HTTP endpoint |
| 需要 Docker | 是 | 是 | 否 |
| 需要 volume mount | 視情況 | 視情況 | 否 |
| 適用 | 簡單工具 | 自訂 runtime | SaaS 服務 |

---

## 心得

### remote HTTP MCP 比 Docker 簡單很多

v2 的 nanobanana 踩了 Docker image、volume mount、entrypoint 一堆坑。v3 的 Tavily 三行搞定。如果你的 MCP server 有提供 remote HTTP endpoint，優先用它。

### concurrency 是隱藏地雷

gh-aw compiler 自動加的 `concurrency: group: "gh-aw-${{ github.workflow }}"` 在單人測試時完全看不出問題。一旦開始連續發訊息或多人使用，訊息就會無聲無息地被取消。用 `run_id` 做 group 可以完全繞過。

### 不同 workflow 之間檔案無法互通

每個 workflow run 有自己的 runner（VM），檔案系統完全隔離。v2 的繪圖之所以能用，是因為 MCP server 和 safe-inputs handler 在同一個 run 裡，共享 `/tmp`。如果未來拆成多 workflow（orchestrator/worker），就需要其他方式傳遞檔案。

### Prompt 就是路由

不需要寫任何路由邏輯。只要在 prompt 裡清楚描述每個前綴對應的行為，agent 自己就會正確路由。這是 agentic workflow 最有趣的地方 — 程式邏輯都在自然語言裡。

---

## 效能

| 模式 | 實測時間 |
|------|---------|
| 文字回覆 | ~1-1.5 分鐘 |
| 繪圖 | ~2-3 分鐘 |
| 研究 | ~2-3.5 分鐘 |
| 翻譯 | ~1-1.5 分鐘 |

研究模式跟繪圖差不多快，因為 Tavily 回應速度很快（~2-5 秒），瓶頸還是在 GitHub Actions 排隊和 agent 啟動。

---

## Repo

- [github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)
- `v1-basic-working` 分支：純文字版本（[v1 文章](/2026/03/03/aw-telegram-bot/)）
- `v2-image-generation` 分支：加上圖片生成（[v2 文章](/2026/03/03/aw-telegram-bot-v2-image-generation/)）
- `v3-research-mode` 分支：研究模式 + 指令路由（本文）

---

*— Yaze Lin, 2026-03-03*
