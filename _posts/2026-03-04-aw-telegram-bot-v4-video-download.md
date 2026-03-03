---
layout: post
title: "aw-telegram-bot v4：影片下載 + 使用者白名單"
subtitle: "yt-dlp + safe-inputs + Skills 架構，還發現 safe-inputs 不受防火牆限制"
date: 2026-03-04
categories: [AI]
tags: [gh-aw, GitHub Actions, Copilot, Telegram, yt-dlp, safe-inputs, security]
author: Yaze Lin
---

## 前情提要

[v1](/2026/03/03/aw-telegram-bot/) 文字聊天，[v2](/2026/03/03/aw-telegram-bot-v2-image-generation/) AI 繪圖，[v3](/2026/03/03/aw-telegram-bot-v3-research-mode/) 研究模式 + 指令路由。

v4 的目標：
1. **使用者傳 `/download https://youtube.com/...` → 收到影片**
2. **加白名單，防止陌生人用 bot 燒我的 Actions 額度**

---

## 架構

```
使用者：「/download https://www.youtube.com/watch?v=xxx」
  │
  ▼
Telegram → CF Worker（白名單檢查）→ GitHub Actions
  │
  ▼
Copilot Agent（判斷：/download 前綴 → 下載模式）
  │
  ├─ 1. download-video(url)            ← safe-inputs: pip install yt-dlp + 下載
  │     回傳 {file_path, title, filesize}
  │
  ├─ 2. 判斷 filesize < 50MB？
  │     ├─ 是 → send-telegram-video(chat_id, video_path, caption)
  │     └─ 否 → send-telegram-message(chat_id, "影片太大...")
  │
  ▼
使用者收到影片
```

v3 有五條路，v4 加到六條：

| 前綴 | 模式 | 工具 |
|------|------|------|
| `/download` | 影片下載 | download-video + send-telegram-video |
| `/research` | 研究 | Tavily + web-search + web-fetch |
| `/draw` | 繪圖 | nanobanana generate_image |
| `/translate` | 翻譯 | 純文字 |
| 無前綴 | 自動判斷 | Agent 根據內容選擇 |

---

## 關鍵發現：safe-inputs 不受 AWF 防火牆限制

這是 v4 最重要的技術發現。

gh-aw 有一個 AWF（Agentic Workflow Firewall），限制 Copilot agent 只能存取 `network.allowed` 裡列的 domain。但 **safe-inputs handler 跑在 runner host 上，不在防火牆裡面**。

這代表：

| 元件 | 網路限制 | 執行環境 |
|------|---------|---------|
| Copilot agent | 只能存取 allowlist 裡的 domain | AWF sandbox |
| MCP server | 只能存取 allowlist 裡的 domain | Docker container（在 sandbox 內） |
| **safe-inputs** | **無限制，可以存取任何網站** | **runner host（sandbox 外）** |

所以 yt-dlp 放在 safe-inputs 裡，**不需要改 network allowlist**。它可以自由存取 YouTube、Twitter、Instagram 等任何網站。

如果改用 MCP server，就得把 youtube.com、googlevideo.com 等一堆 domain 加到 allowlist，而且 YouTube 的 CDN domain 經常變動，根本不實際。

---

## 新增的元件

### 1. Skills 架構

v4 引入了一個新的程式碼組織方式：`.github/skills/`。

```
.github/skills/
  yt-dlp/
    download.py     ← 實際下載邏輯，可獨立執行
```

`download.py` 是一個獨立的 Python script：

```python
# 用法：python download.py <url>
# 輸出：JSON to stdout
#   成功：{"ok": true, "file_path": "...", "title": "...", "filesize": 12345}
#   失敗：{"ok": false, "error": "..."}

yt-dlp args:
  -f "b[height<=360]/b"   # 預合併 360p，不需要 ffmpeg
  -o "%(id)s.%(ext)s"     # 用影片 ID 當檔名，避免特殊字元
  --no-playlist            # 不下載整個播放清單
  --restrict-filenames     # 限制檔名字元
  --print-json             # 輸出 metadata JSON
```

為什麼不直接把 Python 寫在 safe-inputs 的 `py:` 裡？

- **可重用**：skill script 可以被不同的 safe-inputs handler 呼叫
- **可測試**：`python download.py <url>` 就能獨立測試
- **關注點分離**：safe-inputs 的 `py:` 是 thin wrapper，實際邏輯在 skill 裡

### 2. safe-inputs: download-video

Thin wrapper，負責安裝 yt-dlp 然後呼叫 skill script：

```yaml
safe-inputs:
  download-video:
    py: |
      # 1. pip install yt-dlp
      # 2. 找到 skill script: $GITHUB_WORKSPACE/.github/skills/yt-dlp/download.py
      # 3. subprocess.run([python, script, url])
      # 4. 回傳 stdout（JSON）
    timeout: 300  # 5 分鐘，給大檔案多一點時間
```

注意 `download-video` **只負責下載**，不負責傳送。回傳 JSON 包含 `file_path`、`title`、`filesize`，由 Agent 決定下一步。

### 3. safe-inputs: send-telegram-video

跟 `send-telegram-photo` 類似，用 multipart upload 傳影片到 Telegram：

```yaml
safe-inputs:
  send-telegram-video:
    py: |
      # 1. 驗證檔案存在且 < 50MB
      # 2. 根據副檔名設定 Content-Type（mp4/webm/mkv）
      # 3. multipart upload to Telegram sendVideo API
      # 4. 加 supports_streaming: true
    timeout: 120
```

### 4. 職責分離

```
download-video      → 只下載，回傳檔案路徑 + metadata
send-telegram-video → 只傳送，接收檔案路徑
Agent               → 串接兩者，判斷檔案大小決定行為
```

好處：`download-video` 未來可以搭配其他傳送方式（GitHub Release、壓縮後再傳等），不用改下載邏輯。

---

## 使用者白名單

### 為什麼需要

v1-v3 沒有白名單，任何人都可以傳訊息給 bot，每條訊息都會觸發一個 GitHub Actions run。這代表：
- 陌生人可以消耗你的 Actions 分鐘數
- 沒有存取控制

### 做在 CF Worker，不做在 GitHub Actions

| | CF Worker | GitHub Actions |
|--|-----------|---------------|
| 攔截時機 | 訊息進來就擋 | workflow 已啟動才檢查 |
| 成本 | 零 | 每次消耗 ~1-2 分鐘 |
| 速度 | 毫秒級拒絕 | 要等 Actions 排隊 |

### 兩層白名單

```javascript
// worker/src/index.js
const userId = String(msg.from?.id || "");
const chatId = String(msg.chat.id);
const allowedUsers = (env.ALLOWED_USERS || "").split(",").map(s => s.trim()).filter(Boolean);
const allowedChats = (env.ALLOWED_CHATS || "").split(",").map(s => s.trim()).filter(Boolean);

if (!allowedUsers.includes(userId) && !allowedChats.includes(chatId)) {
  return new Response("OK", { status: 200 });  // 靜默忽略
}
```

| 層 | 環境變數 | 用途 |
|----|---------|------|
| ALLOWED_USERS | `"850654509"` | 允許的使用者 ID（跨所有 chat） |
| ALLOWED_CHATS | `""` | 允許的群組 ID（群組內所有人都能用） |

為什麼需要兩層？因為 Telegram 群組的 `chat.id` 是負數（群組 ID），跟使用者的 `from.id` 不同。如果你只用 `chat.id`，使用者在群組裡發的訊息會被擋。兩層的邏輯是 OR：**使用者在 ALLOWED_USERS 裡，或 chat 在 ALLOWED_CHATS 裡**，任一成立就放行。

白名單存在 `wrangler.toml` 的 `[vars]` 裡，改白名單不用改程式碼：

```toml
[vars]
ALLOWED_USERS = "850654509"
ALLOWED_CHATS = ""
```

`.filter(Boolean)` 是一個小細節：`"".split(",")` 會得到 `[""]`，如果不過濾，`"".includes("")` 是 `true`，等於所有人都能過。`.filter(Boolean)` 把空字串移除，避免這個問題。

---

## 踩坑

### 影片預覽黑畫面

第一版 `send-telegram-video` 硬編碼 `Content-Type: video/mp4`。但 YouTube 的 360p pre-merged 格式可能是 webm（VP9 codec），導致 Telegram 無法正確生成預覽縮圖。

修法：根據副檔名動態判斷 Content-Type，並加上 `supports_streaming: true`。

```python
ext = os.path.splitext(filename)[1].lower()
content_type = {
    "webm": "video/webm",
    "mkv": "video/x-matroska",
    "mp4": "video/mp4"
}.get(ext.lstrip("."), "video/mp4")
```

### 不裝 ffmpeg 的代價

ubuntu-latest 沒有預裝 ffmpeg，安裝要 ~30 秒。為了保持簡單，v4 不安裝 ffmpeg，改用 `-f "b[height<=360]/b"` 只下載預合併格式。

代價是：
- 有些影片可能沒有 360p pre-merged 格式，fallback 到最佳 pre-merged（可能是更高畫質）
- 無法做格式轉換（webm → mp4）
- 無法合併分離的 audio/video stream

對 MVP 來說夠用。未來如果需要更好的格式支援，再安裝 ffmpeg。

### pip install 在 safe-inputs 裡

safe-inputs handler 每次執行都是全新的環境，所以每次都要 `pip install yt-dlp`。好在 pip install 只要 ~5 秒。

---

## 影片檔案的生命週期

```
yt-dlp 下載 → /tmp/yt-dlp-output/xxx.mp4
                    │
                    ▼
send-telegram-video 讀取 → 上傳到 Telegram server
                    │
                    ▼
workflow 結束 → runner VM 銷毀 → /tmp 消失
```

影片不會被永久保存在任何地方（除了 Telegram server 上使用者收到的那份）。如果未來需要存檔，可以上傳到 GitHub Release（2GB per asset）。

---

## 心得

### safe-inputs 是隱藏的超能力

之前一直把 safe-inputs 當作「呼叫外部 API 的工具」，但它其實能做任何事：
- 存取任何網站（不受防火牆限制）
- 安裝任何 pip 套件
- 執行任何 Python 程式碼
- 讀寫 runner 的檔案系統

它本質上是一個在 runner host 上跑的、有完整權限的 Python runtime。唯一的限制是 timeout。

### Skills 架構讓 safe-inputs 更乾淨

把實際邏輯放在 `.github/skills/` 裡，safe-inputs 的 `py:` 只當 thin wrapper，好處是：
- YAML 裡的 inline Python 越短越好（難 debug、沒 syntax highlight）
- skill script 可以獨立測試
- 未來如果 gh-aw 原生支援 skills，遷移成本低

### 白名單要提早做

v1-v3 都沒有白名單，等於公開讓任何人用。雖然 bot 不公開、URL 不公開，但一旦被發現就會被濫用。白名單做在 CF Worker 是最理想的位置 — 毫秒級攔截，零成本。

---

## 效能

| 模式 | 實測時間 |
|------|---------|
| 文字回覆 | ~1-1.5 分鐘 |
| 繪圖 | ~2-3 分鐘 |
| 研究 | ~2-3.5 分鐘 |
| 翻譯 | ~1-1.5 分鐘 |
| **影片下載** | **~3-4 分鐘** |

影片下載稍慢，主要是 pip install yt-dlp（~5 秒）+ yt-dlp 下載（~10-30 秒）+ Telegram 上傳（~5-15 秒）。瓶頸還是在 GitHub Actions 的排隊和 agent 啟動。

---

## Repo

- [github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)
- `v1-basic-working` 分支：純文字版本（[v1 文章](/2026/03/03/aw-telegram-bot/)）
- `v2-image-generation` 分支：加上圖片生成（[v2 文章](/2026/03/03/aw-telegram-bot-v2-image-generation/)）
- `v3-research-mode` 分支：研究模式 + 指令路由（[v3 文章](/2026/03/03/aw-telegram-bot-v3-research-mode/)）
- `v4-video-download` 分支：影片下載 + 白名單（本文）

---

*— Yaze Lin, 2026-03-04*
