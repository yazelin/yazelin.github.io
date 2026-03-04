---
layout: post
title: "aw-telegram-bot v2：加上 AI 繪圖功能，踩了 Docker container 的坑"
subtitle: "nanobanana-py MCP server + Gemini API → 使用者傳文字就能收到 AI 生成的圖片"
date: 2026-03-03
categories: [AI]
tags: [gh-aw, GitHub Actions, Copilot, Telegram, MCP, nanobanana, Gemini, Docker]
author: Yaze Lin
---

![aw-telegram-bot v2](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-03-03-aw-telegram-bot-v2-image-generation.png)

## 前情提要

[v1](/2026/03/03/aw-telegram-bot-v1-basic-chatbot/) 做了一個基本的 Telegram 聊天機器人：使用者傳文字 → Copilot 回文字。

v2 的目標：**使用者傳「畫一隻穿太空衣的貓」→ 收到一張 AI 生成的圖片**。

---

## 架構

```
使用者：「畫一隻穿太空衣的貓」
  │
  ▼
Telegram → CF Worker → GitHub Actions (workflow_dispatch)
  │
  ▼
Copilot Agent（判斷：這是圖片請求）
  │  呼叫 MCP tool: generate_image(prompt)
  ▼
nanobanana-py MCP Server（Docker container 內）
  │  呼叫 Gemini API 生成圖片
  │  儲存到 /tmp/nanobanana-output/image.jpg
  ▼
Copilot Agent（拿到檔案路徑）
  │  呼叫 safe-inputs: send-telegram-photo
  ▼
Python handler（讀檔 + multipart POST）
  │  上傳到 Telegram sendPhoto API
  ▼
使用者收到太空貓圖片
```

v1 只有一條路（文字 → 文字），v2 多了一條分支：

- **文字請求** → `send-telegram-message`（跟 v1 一樣）
- **圖片請求** → `generate_image` → `send-telegram-photo`（新增）

Agent 自己判斷走哪條路。

---

## 新增的元件

### 1. nanobanana-py MCP Server

[nanobanana-py](https://github.com/yazelin/nanobanana-py) 是一個 Python MCP server，封裝了 Google Gemini 的圖片生成 API。跑在 GitHub Actions runner 上的 Docker container 裡。

在 gh-aw 的 frontmatter 裡這樣設定：

```yaml
mcp-servers:
  nanobanana:
    container: ghcr.io/astral-sh/uv:python3.12-alpine
    args: [-v, /tmp:/tmp:rw]
    entrypointArgs: [uvx, nanobanana-py]
    env:
      NANOBANANA_GEMINI_API_KEY: "${{ secrets.GEMINI_API_KEY }}"
      NANOBANANA_OUTPUT_DIR: "/tmp/nanobanana-output"
      NANOBANANA_MODEL: "gemini-3-pro-image-preview"
      NANOBANANA_FALLBACK_MODELS: "gemini-3.1-flash-image-preview,gemini-2.5-flash-image"
      NANOBANANA_TIMEOUT: "120"
      NANOBANANA_DEBUG: "1"
    allowed: [generate_image]
```

這段設定看起來簡單，但背後踩了一個大坑（後面會講）。

### 2. send-telegram-photo safe-inputs tool

Telegram 的 `sendPhoto` API 需要 multipart/form-data 上傳二進位圖檔，不能用 JSON。所以寫了一個 Python handler：

```python
# 讀取 MCP server 生成的圖片
with open(photo_path, "rb") as f:
    photo_data = f.read()

# multipart/form-data 組裝
boundary = "----NanoBanana"
body = b""
body += f"--{boundary}\r\n...chat_id...\r\n".encode()
body += f"--{boundary}\r\n...photo binary...\r\n".encode()
body += photo_data
body += f"\r\n--{boundary}--\r\n".encode()

# POST 到 Telegram
req = urllib.request.Request(url, data=body, headers={...})
resp = urllib.request.urlopen(req)
```

跟 v1 的 `send-telegram-message` 一樣，bot token 只在 handler 的 `env:` 裡，agent 看不到。

### 3. Prompt 更新

告訴 agent 它現在可以畫圖了：

```markdown
## Instructions
1. Read the user's message above.
2. Decide if the request involves generating an image:
   - If yes: call `generate_image` with a detailed English prompt,
     then use `send-telegram-photo` to send the resulting file
   - If no: use `send-telegram-message` to send a text reply
3. Always send exactly one response — either a photo or a text message.
```

---

## 踩坑：Docker container 裡沒有 uvx

這是 v2 唯一但最花時間的坑。

### 症狀

第一次測試圖片生成，agent 確實回了一張圖片。但看起來不像 Gemini 生成的，像是 Copilot 自己用別的方式畫的。查 log：

```
[ERROR] [backend] [nanobanana] Failed to launch MCP backend server:
  error=failed to connect: calling "initialize": EOF
```

MCP server 根本沒啟動成功。Copilot agent 發現 `generate_image` tool 不能用，就自己想辦法畫了一張圖（聰明但不是我要的）。

### 原因

gh-aw 把 MCP server 包在 Docker container 裡跑。用 `command: uvx` 時，compiler 自動映射到 `python:alpine` 作為 base image：

```
docker run --entrypoint uvx python:alpine uvx nanobanana-py
```

問題：**`python:alpine` 沒有 `uvx`**。Container 啟動後找不到 entrypoint，直接退出，gateway 收到 EOF。

### 嘗試過的方法

| 嘗試 | 結果 |
|------|------|
| 在 `mcp-servers` 下加 `container:` 欄位 | 編譯錯誤：`container` 和 `command` 互斥 |
| `sandbox/mcp/container:` 指定自訂 image | 改的是 gateway container，不是 backend；且 tag 被串接壞掉 |
| `command: python3` + pip install | 不觸發 container 映射，gateway 不知道怎麼跑 |
| `command: env` + `sh -c "pip install && exec nanobanana-py"` | 編譯通過但沒有 container，gateway 可能無法執行 |

### 解法：container 模式

gh-aw 的 `mcp-servers` 有兩種互斥模式：

- **Command 模式**：`command:` + `args:` → compiler 自動選 container image
- **Container 模式**：`container:` + `entrypointArgs:` → 你指定 image

改用 container 模式，直接指定有 `uvx` 的 Docker image：

```yaml
mcp-servers:
  nanobanana:
    container: ghcr.io/astral-sh/uv:python3.12-alpine  # 有 uvx！
    args: [-v, /tmp:/tmp:rw]          # 掛載 /tmp 讓 safe-inputs 能讀到圖片
    entrypointArgs: [uvx, nanobanana-py]  # CMD，不是 entrypoint
```

三個關鍵：

1. **`ghcr.io/astral-sh/uv:python3.12-alpine`** — 官方 uv Docker image，已預裝 `uvx`
2. **`args: [-v, /tmp:/tmp:rw]`** — Docker volume mount，container 內生成的圖片會出現在 host 的 `/tmp`，safe-inputs handler 才讀得到
3. **`entrypointArgs`** — 作為 Docker CMD，不會觸發 `--entrypoint` 覆蓋

compile 後的 MCP config：

```json
{
  "nanobanana": {
    "type": "stdio",
    "container": "ghcr.io/astral-sh/uv:python3.12-alpine",
    "entrypointArgs": ["uvx", "nanobanana-py"],
    "args": ["-v", "/tmp:/tmp:rw"],
    "tools": ["generate_image"]
  }
}
```

Gateway 實際執行的 Docker 命令：

```
docker run --rm -i \
  -e NANOBANANA_GEMINI_API_KEY=... \
  -e NANOBANANA_OUTPUT_DIR=/tmp/nanobanana-output \
  -v /tmp:/tmp:rw \
  ghcr.io/astral-sh/uv:python3.12-alpine \
  uvx nanobanana-py
```

一次成功。

---

## 模型設定

nanobanana-py 支援這些環境變數：

| 環境變數 | 用途 | 我的設定 |
|---------|------|---------|
| `NANOBANANA_MODEL` | 主要模型 | `gemini-3-pro-image-preview` |
| `NANOBANANA_FALLBACK_MODELS` | 備援模型鏈 | `gemini-3.1-flash-image-preview,gemini-2.5-flash-image` |
| `NANOBANANA_TIMEOUT` | API 超時 | `120` 秒 |
| `NANOBANANA_DEBUG` | Debug log | `1`（開啟） |

模型降級順序：Pro → 3.1 Flash → 2.5 Flash。

實測 `gemini-3-pro-image-preview` 經常回 503（high demand），自動降級到 `gemini-2.5-flash-image`。Log 裡可以看到：

```json
{
  "usedFallback": true,
  "primaryModel": "gemini-3-pro-image-preview",
  "modelUsed": "gemini-2.5-flash-image",
  "message": "使用備用模型... 原因: API 503: high demand"
}
```

Fallback 機制是 nanobanana-py 內建的，不需要自己處理。

---

## gh-aw 的 MCP server 文件整理

因為踩坑過程中翻了很多文件，整理一下 gh-aw 的 MCP server 設定方式：

### Command 模式（讓 compiler 選 container）

```yaml
mcp-servers:
  my-tool:
    command: uvx           # compiler 映射到 python:alpine
    args: [my-package]
    env: { ... }
```

適合 base image 裡就有你要的 runtime 的情況。`uvx` 映射到 `python:alpine`，但 `python:alpine` 沒有 `uvx`，所以這個映射本身就是錯的。

### Container 模式（自己選 image）

```yaml
mcp-servers:
  my-tool:
    container: my-image:tag    # 你指定 image
    args: [-v, /host:/container:rw]  # Docker options
    entrypointArgs: [cmd, arg1]      # CMD (after image)
    env: { ... }
```

適合需要特定 runtime 或自訂 image 的情況。`container` 和 `command` 互斥。

### `args` 的雙重身份

- **Command 模式**：`args` = 命令參數（e.g., `[nanobanana-py]`）
- **Container 模式**：`args` = Docker options（e.g., `[-v, /tmp:/tmp:rw]`）

這個語義變化文件裡沒寫清楚，要看 compile 後的 lock.yml 才能確認。

---

## 心得

### MCP server 的 Docker 隔離

gh-aw 的安全模型很一致：agent 跑在沙盒裡，MCP server 也跑在各自的 Docker container 裡。這代表 MCP server 的檔案系統跟 host 是隔離的。如果 MCP server 生成檔案需要被其他元件讀取，**一定要掛載共享 volume**。

### command 模式 ≠ container 模式

文件寫得像是 `command: uvx` 就能用，但實際上 compiler 會自動選一個 base image，而這個 image 可能沒有你要的工具。當你需要精確控制 runtime 環境時，用 container 模式。

### Copilot 的容錯能力

MCP server 啟動失敗時，Copilot 不會報錯停止 — 它會自己想辦法完成任務。這在 debug 時很容易誤判：「圖片有收到啊，應該沒問題」。實際上 MCP server 根本沒跑起來，圖是 Copilot 自己用別的方式生的。**一定要看 log 確認 `modelUsed` 欄位。**

### 整體延遲

圖片生成大約 2-2.5 分鐘（包含 GitHub Actions 排隊 + Docker 啟動 + uvx 安裝 + Gemini API 生成 + 上傳 Telegram）。比純文字回覆多 30 秒左右，主要多在 Docker 啟動和 Gemini 生圖。

---

## Repo

- [github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)
- `v1-basic-working` 分支：純文字版本（[v1 文章](/2026/03/03/aw-telegram-bot-v1-basic-chatbot/)）
- `v2-image-generation` 分支：加上圖片生成的版本

---

*— Yaze Lin, 2026-03-03*
