---
layout: post
title: "aw-telegram-bot：用 GitHub Agentic Workflows 做 Telegram 聊天機器人"
subtitle: "Telegram → Cloudflare Worker → GitHub Actions + Copilot → 回覆，踩了 6 個坑才走通"
date: 2026-03-03
categories: [AI]
tags: [gh-aw, GitHub Actions, Copilot, Telegram, Cloudflare Workers, MCP, safe-inputs]
author: Yaze Lin
---

## 想做什麼

用 [gh-aw](https://github.com/github/gh-aw)（GitHub Agentic Workflows）做一個 Telegram 聊天機器人。

gh-aw 讓你用 Markdown 寫 AI workflow，編譯成 GitHub Actions YAML，跑在 GitHub 的 runner 上。AI engine 用的是 Copilot（GPT-5.3-codex）。

聽起來很簡單：收訊息 → 叫 AI 回 → 送回去。實際上踩了 6 個坑。

---

## 架構

```
使用者
  │
  ▼
Telegram Bot API
  │  webhook POST
  ▼
Cloudflare Worker（驗證 + 轉發）
  │  workflow_dispatch
  ▼
GitHub Actions（gh-aw）
  │  Copilot 生成回覆
  │  呼叫 safe-inputs tool
  ▼
Telegram Bot API（sendMessage）
  │
  ▼
使用者收到回覆
```

三個元件：

| 元件 | 技術 | 職責 |
|------|------|------|
| Webhook relay | Cloudflare Worker（JS） | 收 Telegram webhook、驗證 secret、觸發 GitHub workflow |
| AI 引擎 | gh-aw + Copilot | 讀使用者訊息、生成回覆 |
| 發送工具 | safe-inputs（Python） | 拿 bot token 呼叫 Telegram API |

---

## 踩坑紀錄

### 坑 1：expression allowlist

gh-aw 有安全白名單，只允許特定的 GitHub Actions expression。一開始用 `repository_dispatch`，想在 prompt 裡用 `${{ github.event.client_payload.text }}`：

```
✗ client_payload expressions not in allowed list
```

**解法**：改成用 `bash: true` 工具 + `cat $GITHUB_EVENT_PATH` 讀 event payload。後來又遇到坑 3，最終改成 `workflow_dispatch`。

### 坑 2：COPILOT_GITHUB_TOKEN

Workflow 需要一個有 Copilot 訂閱的 GitHub 帳號的 PAT。一開始沒設定，validation step 直接報錯。

**解法**：用另一個有 Copilot 的帳號建 PAT，設成 repo secret `COPILOT_GITHUB_TOKEN`。

### 坑 3：$GITHUB_EVENT_PATH 在沙盒裡不存在

gh-aw 的 agent 跑在 Docker container 裡。`$GITHUB_EVENT_PATH` 指向 host 的檔案，container 裡根本沒有。Agent 一直找不到 event.json，跑了 5 分鐘超時。

**解法**：從 `repository_dispatch` 切換到 `workflow_dispatch`。`workflow_dispatch` 的 inputs 會被 gh-aw 直接插入到 prompt template 裡（`${{ github.event.inputs.text }}`），不需要 agent 自己去讀檔案。

同時要改 Cloudflare Worker 的 GitHub API 呼叫，從 `POST /repos/{owner}/{repo}/dispatches` 改成 `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`。

### 坑 4：防火牆擋 api.telegram.org

gh-aw 預設只允許 `api.githubcopilot.com`。Agent 嘗試呼叫 Telegram API 時被 firewall 直接擋掉。

**解法**：在 frontmatter 加上：

```yaml
network:
  allowed:
    - defaults
    - api.telegram.org
```

### 坑 5：TELEGRAM_BOT_TOKEN 進不了沙盒

這是最折騰的一個坑。Agent 成功生成了回覆，也嘗試呼叫 Telegram API，但 `$TELEGRAM_BOT_TOKEN` 在沙盒裡是空的，導致 API URL 變成 `https://api.telegram.org/bot/sendMessage`，404。

嘗試過的方法：

| 嘗試 | 結果 |
|------|------|
| top-level `env:` 帶 secret | strict mode 擋住：「secrets detected in 'env' section」 |
| `engine.env:` 帶 secret | 同樣被擋：「secrets detected in 'engine.env' section」 |
| `bash` tool 加 `env:` config | bash tool 不接受 object，只接受 boolean/null/array |

gh-aw 的設計哲學是：**agent 不應該直接碰 secret**。Secret 只能透過工具間接存取。

**最終解法**：使用 `safe-inputs` — gh-aw 的 MCP 工具機制。

### 坑 6：JavaScript handler 的 fetch 不 work

用 `safe-inputs` 的 `script:` (JavaScript) 寫 handler，framework 顯示「completed successfully」但 stdout/stderr 都是空的。Telegram API 根本沒被呼叫。

推測是 gh-aw 的 JavaScript handler 子進程環境有問題（可能 `fetch` 或 `process.env` 沒正確傳遞到子進程）。

**解法**：改用 `py:` (Python) handler，用 `urllib.request` 發 HTTP request。一次就通。

---

## 最終的 workflow

```yaml
---
engine:
  id: copilot
  model: gpt-5.3-codex

on:
  workflow_dispatch:
    inputs:
      chat_id: { required: true }
      text: { required: true }
      username: { required: false }

network:
  allowed: [defaults, api.telegram.org]

safe-inputs:
  send-telegram-message:
    description: "Send a text message to a Telegram chat"
    inputs:
      chat_id: { type: string, required: true }
      text: { type: string, required: true }
    py: |
      import os, json, urllib.request
      token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
      payload = json.dumps({
        "chat_id": inputs.get("chat_id"),
        "text": inputs.get("text")
      }).encode()
      req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"}
      )
      resp = urllib.request.urlopen(req)
      data = json.loads(resp.read())
      print(json.dumps({"ok": True, "message_id": data["result"]["message_id"]}))
    env:
      TELEGRAM_BOT_TOKEN: "${{ secrets.TELEGRAM_BOT_TOKEN }}"
---

# Telegram Chatbot

You are a helpful, friendly AI assistant.

## Message
- **Chat ID**: ${{ github.event.inputs.chat_id }}
- **Message**: ${{ github.event.inputs.text }}

## Instructions
1. Read the user's message.
2. Generate a helpful, concise response.
3. Use the `send-telegram-message` tool to send your response.
```

關鍵設計：
- **Agent 看不到 bot token** — 只能透過 `send-telegram-message` tool 發訊息
- **Python handler 跑在沙盒外** — 有 secret 存取權，但與 agent 隔離
- **`workflow_dispatch` inputs** — 直接被 gh-aw template engine 插入 prompt，不需要 agent 自己讀檔

---

## Cloudflare Worker 的角色

Telegram webhook 不能直接觸發 GitHub Actions，所以需要一個中間層。Worker 做三件事：

1. **驗證** — 檢查 `X-Telegram-Bot-Api-Secret-Token` header
2. **轉發** — 把 chat_id、text、username 包成 `workflow_dispatch` inputs，POST 到 GitHub API
3. **立即回覆** — 回 200 給 Telegram（不等 workflow 跑完）

```javascript
// 核心邏輯
ctx.waitUntil(dispatchToGitHub(update, env));
return new Response("OK", { status: 200 });
```

Fire-and-forget。Worker 不等結果，Telegram 不會超時。

---

## 心得

### gh-aw 的安全模型很嚴格

Expression allowlist、network firewall、secret isolation — 每一層都會擋你。這不是 bug，是 feature。但文件不夠完整，很多限制要自己撞才知道。

### safe-inputs 是正確做法

一開始想直接把 token 塞進環境變數讓 agent 用，這在 gh-aw 裡是反模式。正確做法是把所有需要 secret 的操作封裝成 safe-inputs tool，agent 只負責決定「要發什麼」，不需要知道「怎麼發」。

### Python handler > JavaScript handler

至少在目前版本的 gh-aw，Python 的 `py:` handler 比 JavaScript 的 `script:` handler 穩定。JS handler 的子進程似乎有環境傳遞問題。

### 延遲

從使用者發訊息到收到回覆，大約 1.5-2 分鐘。瓶頸在 GitHub Actions 排隊 + agent 啟動。不適合需要即時回覆的場景，但作為個人實驗剛好。

---

## Repo

- [github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)
- `v1-basic-working` 分支：這篇文章描述的最基本版本

---

*— Yaze Lin, 2026-03-03*
