---
layout: post
title: "gemini-web：用 Playwright 自動化 Gemini 圖片生成 + 去浮水印"
subtitle: "CLI 工具 + HTTP API，還能當 Google GenAI SDK 的 drop-in replacement"
date: 2026-03-31
categories: [AI]
tags: [AI, Python, Gemini, Playwright, 圖片生成, PyPI]
---

## 前言

Google Gemini 的圖片生成能力越來越強，但官方 API 對內容有不少限制——人物、版權角色、敏感主題常常被擋。網頁版的限制相對寬鬆，但每次都要手動開瀏覽器、打字、下載圖片，很不方便。

**gemini-web** 就是為了解決這個問題：用 Playwright 自動化 Gemini 網頁介面，包裝成 CLI 工具和 HTTP API，還能當 Google GenAI SDK 的 drop-in replacement。換句話說，你現有的程式碼只要改一個 `base_url`，就能從官方 API 無縫切換到自架的 gemini-web。

```bash
# 安裝
uv tool install gemini-web && gemini-web install

# 登入（只需一次）
gemini-web login

# 生成圖片
gemini-web generate "一隻穿太空裝的貓" -o space-cat.png --no-watermark
```

---

## 實際案例：catime 的無痛切換

[catime]({% post_url 2026-01-30-catime-birth %}) 是我的每小時自動貓咪圖片生成專案，原本用 Google Gemini API 搭配 nanobanana-py 生成圖片。2026-03-30 切換到 gemini-web，**整個過程零程式碼修改**——只加了一個環境變數。

做法是「透明代理模式」：

```python
_GEMINI_WEB_BASE_URL = os.getenv("GEMINI_WEB_BASE_URL")

def _create_genai_client():
    """如果設了 GEMINI_WEB_BASE_URL，SDK 自動導向自架服務"""
    if _GEMINI_WEB_BASE_URL:
        return genai.Client(
            api_key="unused",
            http_options={
                "api_version": "v1beta",
                "base_url": _GEMINI_WEB_BASE_URL,
                "timeout": 120_000,  # 網頁自動化比 API 慢
            },
        )
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
```

同時 patch nanobanana-py 的 API endpoint：

```python
def _patch_nanobanana():
    """讓 nanobanana-py 也走 gemini-web"""
    if _GEMINI_WEB_BASE_URL:
        import nanobanana_py.image_generator as ig
        ig.API_BASE_URL = f"{_GEMINI_WEB_BASE_URL}/v1beta/models"
```

GitHub Actions 那邊只要加一個 secret `GEMINI_WEB_BASE_URL`，就完成切換。不設這個變數就走原本的 Google API——完全向後相容。

唯一要注意的是 timeout：gemini-web 背後是網頁自動化，一次圖片生成大約 10-30 秒，比 API 慢不少，所以 timeout 設了 120 秒。

---

## 架構

```
使用者 (CLI / HTTP / GenAI SDK)
    ↓
FastAPI + 請求佇列 (最多 10 個排隊)
    ↓
Worker Pool (N 個 Playwright 瀏覽器實例)
    ↓
Gemini 網頁 DOM 自動化
    ↓
圖片下載 + Reverse Alpha Blending 去浮水印
    ↓
回傳 (base64 / 檔案)
```

三種使用方式：

| 方式 | 適合場景 | 範例 |
|------|---------|------|
| CLI | 單次生成、快速測試 | `gemini-web generate "prompt" -o out.png` |
| HTTP API | 多人共用、整合其他服務 | `POST /api/generate` |
| GenAI SDK 相容 | 現有程式碼無痛切換 | 改 `base_url` 就好 |

---

## 瀏覽器自動化：踩過的坑

### Stealth 反偵測

Gemini 會偵測自動化瀏覽器。gemini-web 在啟動時注入一段 JavaScript 來隱藏自動化痕跡：

```javascript
Object.defineProperty(navigator, 'webdriver', { get: () => false });
Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW','zh','en-US','en'] });
```

同時偽造 user-agent、WebGL vendor/renderer，並用 Chromium flag 關閉 blink 的自動化特徵。

### Headless 模式下的剪貼簿問題

Headless 瀏覽器沒有系統剪貼簿，直接 `page.keyboard.type()` 在 Gemini 的 contenteditable 輸入框上常常出問題。解法是模擬一個 paste 事件：

```javascript
const dt = new DataTransfer();
dt.setData('text/plain', text);
const pasteEvent = new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true
});
el.dispatchEvent(pasteEvent);
```

如果 paste 事件也失敗，才 fallback 到直接設定 `innerText`。

### 圖片下載的 Fallback

生成完圖片後，要把它下載下來也不簡單。gemini-web 用兩段式 fallback：

1. **下載按鈕**：點擊「下載原始大小」按鈕，攔截 Playwright 的 download 事件取得檔案
2. **img src**：如果下載按鈕不存在或失敗，直接從 `<img>` 元素的 src 抓圖

### Session 持久化

登入狀態存在 `~/.gemini-web/profiles/` 目錄下。第一次用 `gemini-web login` 打開有頭瀏覽器手動登入 Google，之後就能用 headless 模式自動操作。Session 過期時需要重新 login。

每 5 分鐘會做一次 heartbeat 健康檢查，偵測 session 是否還活著。

---

## Reverse Alpha Blending 去浮水印

Gemini 生成的圖片右下角會有半透明的 logo 浮水印。gemini-web 用反向 Alpha Blending 來還原被覆蓋的像素。

### 原理

浮水印的疊加公式是：

```
顯示像素 = 原始像素 × (1 - α) + 浮水印像素 × α
```

Gemini 的浮水印是白色 logo（像素值 255），所以反推：

```
原始像素 = (顯示像素 - α × 255) / (1 - α)
```

### 實作

```python
LOGO_VALUE = 255.0
ALPHA_THRESHOLD = 0.002   # alpha 太低就跳過
MAX_ALPHA = 0.99           # 避免除以零

for row in range(logo_size):
    for col in range(logo_size):
        alpha = alpha_map[row, col]
        if alpha < ALPHA_THRESHOLD:
            continue
        alpha = min(alpha, MAX_ALPHA)
        one_minus = 1.0 - alpha
        original = (watermarked - alpha * LOGO_VALUE) / one_minus
        result[row, col] = np.clip(np.round(original), 0, 255)
```

### Alpha Map

關鍵是要有正確的 alpha map——也就是浮水印 logo 每個像素的透明度。gemini-web 預先提取了兩種尺寸的 alpha map，存為 PNG 檔：

| 圖片尺寸 | Logo 尺寸 | 邊距 | Alpha Map |
|----------|----------|------|-----------|
| 寬高都 > 1024 | 96 × 96 | 64px | `bg_96.png` |
| 其他 | 48 × 48 | 32px | `bg_48.png` |

浮水印固定在右下角，所以定位很簡單：

```python
x = width - margin - logo_size
y = height - margin - logo_size
```

### 限制

這個方法只能移除**可見的 logo 浮水印**。Gemini 同時會嵌入 SynthID（不可見的數位浮水印），這個無法移除，也不影響視覺效果。

---

## GenAI SDK 相容模式

這是 gemini-web 最實用的功能之一。它提供一個與 Google GenAI API 格式相同的端點：

```
POST /v1beta/models/{model}:generateContent
```

現有用 `google-genai` SDK 的程式碼，只要改 `base_url` 就能切換：

```python
from google import genai

# 原本用 Google API
client = genai.Client(api_key="YOUR_KEY")

# 改用自架的 gemini-web
client = genai.Client(
    api_key="any-string",
    http_options={
        "api_version": "v1beta",
        "base_url": "http://localhost:8070",
    },
)

# 以下程式碼完全不用改
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="畫一隻太空貓",
    config={"response_mime_type": "image/png"},
)
```

相容模式支援：

- **文字生成**：解析 `contents[].parts[].text` 格式
- **圖片生成**：透過 `response_mime_type: image/*` 或 `response_modalities` 偵測
- **Google Search**：偵測到 `google_search` tool 時，自動注入帶日期的 system prompt
- **JSON 清理**：自動移除 Gemini 回應中的 markdown code block 標記
- **API Key 驗證**：可選，透過 `API_KEYS` 環境變數設定允許的 key

---

## HTTP API

除了 GenAI 相容端點外，gemini-web 也提供原生 API：

```bash
# 啟動服務
gemini-web serve --host 0.0.0.0 --port 8070
```

| 端點 | 方法 | 用途 |
|------|------|------|
| `/api/generate` | POST | 圖片生成（自動去浮水印） |
| `/api/chat` | POST | 文字對話 |
| `/api/health` | GET | 服務健康檢查 |
| `/api/new-chat` | POST | 重置對話（除錯用） |

Health 端點會回傳 Worker 狀態，方便監控：

```json
{
  "status": "ok",
  "workers": [
    {"id": 0, "alive": true, "logged_in": true, "busy": false}
  ],
  "workers_available": 1,
  "queue_waiting": 0
}
```

---

## Worker Pool 與排隊機制

gemini-web 支援多 Worker 並行處理。每個 Worker 是一個獨立的 Playwright 瀏覽器實例，有自己的 session 目錄。

```
WORKER_COUNT=3 gemini-web serve
```

請求進來後進入佇列，用 `asyncio.wait(FIRST_COMPLETED)` 取得第一個閒置的 Worker。超過佇列上限（預設 10）會回傳 429 Too Many Requests。

| 環境變數 | 預設值 | 說明 |
|---------|-------|------|
| `WORKER_COUNT` | 1 | 瀏覽器實例數 |
| `QUEUE_MAX_SIZE` | 10 | 最大排隊數 |
| `DEFAULT_TIMEOUT` | 240 | 請求超時（秒） |
| `HEARTBEAT_INTERVAL` | 300 | 健康檢查間隔（秒） |
| `HEADLESS` | false | 是否無頭模式 |

---

## AI Agent 整合

`gemini-web install` 會自動偵測你用的 AI Agent，安裝對應的 slash command：

| Agent | 安裝位置 | 格式 |
|-------|---------|------|
| Claude Code | `~/.claude/commands/gemini-web/` | `.md` |
| Gemini CLI | `~/.gemini/commands/gemini-web/` | `.toml` |

安裝後可以直接在 Agent 中使用：

```
/gemini-web 幫我畫一張台灣夜市的水彩畫
```

---

## 部署

### 本機使用

```bash
uv tool install gemini-web
gemini-web install    # 安裝瀏覽器 + Agent commands
gemini-web login      # 手動登入 Google
```

### 常駐服務

```bash
# 用 systemd 部署
bash scripts/install-service.sh

# 或直接啟動
HEADLESS=true gemini-web serve --port 8070
```

---

## 小結

gemini-web 解決了一個很具體的問題：**想用 Gemini 的圖片生成能力，但不想受 API 的內容限制，也不想每次手動操作網頁。**

核心技術點：

- **Playwright 自動化**：Stealth 反偵測、剪貼簿模擬、download 事件攔截
- **Reverse Alpha Blending**：數學公式還原浮水印下的像素
- **GenAI SDK 相容**：現有程式碼改一行 `base_url` 就能切換
- **Worker Pool**：支援多實例並行，佇列管理

catime 從 API 切換到 gemini-web 的經驗也證明了這個設計的實用性——零程式碼修改，加一個環境變數就搞定。

---

## 參考資源

- [gemini-web PyPI](https://pypi.org/project/gemini-web/)
- [gemini-web GitHub](https://github.com/yazelin/gemini-web)
- [catime — 每小時自動貓咪圖片生成器]({% post_url 2026-01-30-catime-birth %})
- [nanobanana-py — Python MCP 圖片生成]({% post_url 2026-01-28-nanobanana-py-python-port %})
- [Playwright 官方文件](https://playwright.dev/python/)
- [Google GenAI SDK](https://github.com/googleapis/python-genai)
