---
layout: post
title: "telegram-gemini-bot：一個檔案的 Telegram AI 機器人"
subtitle: "教朋友 vibe coding 的極簡 AI 助理起手式"
date: 2026-03-08
categories: [AI]
tags: [Gemini, Telegram, FastAPI, Python, CLI, Vibe Coding]
author: Yaze Lin
---

## 故事

3/7 星期六教朋友用 AI vibe coding，想找一個最簡單的起手式：**從零開始，用 AI 輔助寫出自己的 AI 助理**。

之前做的 Telegram bot 都跑在 GitHub Actions 上，有 Cloudflare Worker、有 KV、有 callback 機制 — 架構完整但對新手來說太重了。朋友想要的是「我也能做一個 AI 聊天機器人」的那種成就感，不是理解分散式架構。

剛好朋友有訂閱 Google AI Pro 帳號，Gemini CLI 認證後就能直接用，不用另外付 API 費用 — 不用白不用。而且 Google AI Pro [綁信用卡還會送每月 $10 美金的 GCP 額度](https://the-walking-fish.com/p/google-ai-pro-10-usd-gcp-credit/)，未來想用 API 加一些小功能也有免費額度可以用。所以我需要一個**極簡版**：一個 Python 檔案、不管 API key、直接呼叫已認證的 Gemini CLI。能在 10 分鐘內跑起來，讓人先感受到「我做到了」，再慢慢加功能。

結果就是 [telegram-gemini-bot](https://github.com/yazelin/telegram-gemini-bot) — 整個專案的核心就是一個 `main.py`，88 行。而且這份程式碼**完全是由 Gemini 自己寫出來的** — 我只負責描述需求，Gemini CLI 產出了整個 `main.py`。用 AI 寫一個呼叫 AI 的 bot，這大概是 vibe coding 最純粹的體現。

---

## 架構

```
使用者 (Telegram)
  │
  ▼
python-telegram-bot (Polling 模式)
  │  收到文字訊息
  ▼
asyncio.create_subprocess_exec("gemini", "-p", prompt)
  │  讀取 stdout
  ▼
reply_text() 回傳給使用者
```

三個元件：

| 元件 | 角色 |
|------|------|
| **FastAPI** | Web Server，用 `lifespan` 在背景啟動 Telegram Bot |
| **python-telegram-bot** | Polling 模式監聽訊息，不需要 Webhook |
| **Gemini CLI** | 系統已認證的 `gemini` 指令，直接 subprocess 呼叫 |

不需要 Webhook 代表不需要公開 IP、不需要 HTTPS 憑證、不需要 Cloudflare Worker 轉發。Polling 模式讓 bot 主動去拉訊息，開發和部署都簡單很多。

---

## 核心程式碼

整個 `main.py` 只有三個部分。

### 1. 呼叫 Gemini CLI

```python
async def call_gemini_cli(prompt: str) -> str:
    try:
        process = await asyncio.create_subprocess_exec(
            "gemini", "-p", prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            return stdout.decode().strip()
        else:
            error_msg = stderr.decode().strip()
            logger.error(f"Gemini CLI 錯誤: {error_msg}")
            return f"Error: {error_msg}"
    except Exception as e:
        logger.error(f"執行 Gemini CLI 時發生異常: {e}")
        return "抱歉，系統執行指令時發生錯誤。"
```

重點：用 `asyncio.create_subprocess_exec` 而不是 `subprocess.run`。這樣 Gemini CLI 在等 API 回應的時候，整個 FastAPI server 不會被阻塞，其他訊息還是可以繼續處理。

### 2. Telegram 訊息處理

```python
async def handle_telegram_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    user_text = update.message.text
    reply_text = await call_gemini_cli(user_text)

    if reply_text:
        await update.message.reply_text(reply_text)
    else:
        await update.message.reply_text("Gemini 沒有回傳任何內容。")
```

收到訊息 → 丟給 Gemini CLI → 拿到結果 → 回傳。沒有 prompt engineering、沒有 system prompt、沒有 conversation history。就是一問一答。

### 3. FastAPI 啟動 Bot

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    bot_task = asyncio.create_task(run_bot_polling())
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/")
async def status():
    return {"status": "online", "mode": "cli_polling"}
```

用 FastAPI 的 `lifespan` 事件在啟動時把 Telegram Polling 丟到背景跑。順便提供一個 `/` endpoint 可以檢查服務狀態。

---

## BYOK：不管 API Key

這個專案最特別的地方是 **完全不碰 Gemini API key**。

傳統做法：在程式碼裡用 `google-generativeai` SDK，設定 `GEMINI_API_KEY` 環境變數，管理 API 金鑰的輪替和安全。

這個專案的做法：假設你的機器上已經裝好 `gemini` CLI 並完成認證（`gemini auth login`），程式碼只負責呼叫 `gemini -p "你的問題"`，認證完全由 CLI 處理。

`.env` 裡只需要一個變數：

```bash
TELEGRAM_BOT_TOKEN=你的_TELEGRAM_BOT_TOKEN
```

沒有 `GEMINI_API_KEY`。`pyproject.toml` 裡有預留 `google-generativeai` 依賴，目前 `main.py` 沒用到，但未來如果要用前面提到的每月 $10 GCP 額度來加功能（例如圖片生成、多模態對話），可以直接 import 使用，不用再改依賴。

---

## 設定與啟動

### 前置條件

1. Python 3.11+
2. [uv](https://github.com/astral-sh/uv)（套件管理）
3. Gemini CLI 已安裝且已認證 — 手動執行 `gemini -p "test"` 要能正確回傳
4. Telegram Bot Token — 向 [@BotFather](https://t.me/botfather) 申請

### 啟動

```bash
# 1. 建立 .env
echo 'TELEGRAM_BOT_TOKEN=你的token' > .env

# 2. 啟動
chmod +x run.sh
./run.sh
```

`run.sh` 會自動檢查三件事：`.env` 存在、Token 不是預設值、`gemini` 指令可用。通過後執行 `uv run python main.py`。

也可以直接手動啟動：

```bash
uv run python main.py
```

服務啟動後，`http://localhost:8000/` 會回傳 `{"status": "online", "mode": "cli_polling"}`，Telegram Bot 就可以開始對話了。

---

## 小結

| 項目 | 內容 |
|------|------|
| 檔案數 | 1 個（`main.py`，88 行） |
| API Key 管理 | 無（靠 CLI 認證） |
| 部署方式 | 任何有 Python + Gemini CLI 的機器 |
| 訊息模式 | Polling（不需要公開 IP） |
| AI 呼叫方式 | `subprocess: gemini -p "prompt"` |

這個專案的價值不在功能多強，而是**作為 vibe coding 的起手式**：如果 AI CLI 工具已經處理好認證和 API 呼叫，應用層的程式碼可以極度簡化。不需要 SDK、不需要 API key、不需要管理 token — 一個 subprocess 呼叫就夠了。

教朋友的時候，從建立 Bot Token、寫 `.env`、到第一次在 Telegram 收到 AI 回覆，整個過程不到 10 分鐘。先有成就感，再來談架構 — 這才是 vibe coding 該有的節奏。

---

## 注意事項

這個專案是**教學用的極簡起手式**，刻意省略了所有防護機制。正式使用前請注意：

- **無身份驗證**：任何人找到你的 bot 都能跟它對話，等於免費用你的 Gemini 額度
- **無聊天白名單**：沒有限制哪些 chat ID 可以使用
- **無訊息長度限制**：使用者可以送超長文字，消耗大量 token
- **無頻率限制**：沒有 rate limiting，有心人可以大量灌訊息
- **無對話隔離**：Gemini CLI 每次呼叫都是獨立的，沒有 conversation history，但也沒有防止 prompt injection
- **Bot Token 外洩風險**：`.env` 裡的 token 如果不小心 commit 到公開 repo，bot 會被接管

如果要認真用，至少加上：

1. **`ALLOWED_CHAT_ID` 白名單** — 只允許特定使用者/群組
2. **Rate limiting** — 限制每人每分鐘訊息數
3. **`.gitignore` 確認** — 確保 `.env` 不會被 commit

可以參考 [telegram-copilot-bot]({% post_url 2026-03-05-telegram-copilot-bot-no-ghaw %}) 或 [aw-telegram-bot 系列]({% post_url 2026-03-04-aw-telegram-bot-series-index %})，裡面有完整的防護實作。

---

## 後續練習方向

跑起來之後想繼續深入？推薦兩個開源專案：

- **[Superpowers](https://github.com/obra/superpowers)** — 為 AI CLI（Claude Code、Gemini CLI 等）加上 skill 系統，讓你的 AI 助理學會特定領域的工作流程。例如寫程式前先跑 TDD、debug 時自動走固定 SOP。裝好之後 Gemini CLI 就不只是聊天，而是能按照你定義的流程做事。（推薦閱讀：[高見龍 — AI Superpowers Skills 介紹](https://kaochenlong.com/ai-superpowers-skills)）

- **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** — AI agent 的開放規範標準，定義了 agent 之間如何溝通、如何描述能力、如何組合。如果你想讓多個 AI agent 協作（例如一個負責寫程式、一個負責 review），這個規範值得了解。（推薦閱讀：[高見龍 — OpenSpec 介紹](https://kaochenlong.com/openspec)）

從極簡 bot 出發，加上 skills 變成專業助理，再透過 agent 規範串接多個 AI — 這就是一條從 vibe coding 到 AI 工程化的學習路徑。

---

## Repo

- [github.com/yazelin/telegram-gemini-bot](https://github.com/yazelin/telegram-gemini-bot)
