---
layout: post
title: "telegram-claude-bot：Claude Code 版的極簡 Telegram AI 機器人"
subtitle: "和 Gemini 版並肩的 vibe coding 起手式 — 你的第一個 AI 夥伴在口袋裡"
date: 2026-04-23
categories: [AI, forest-guild]
tags: [Claude, Telegram, FastAPI, Python, CLI, Vibe Coding, Level-0]
author: Yaze Lin
---

![telegram-claude-bot：Claude Code 版的極簡 Telegram AI 機器人](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-23-telegram-claude-bot.png)

## 故事

上個月[寫過 Gemini 版的 telegram-gemini-bot]({% post_url 2026-03-08-telegram-gemini-bot %}) — 一個檔案、88 行、教朋友 vibe coding 的起手式。那篇是為了有 Google AI Pro 的朋友寫的；但最近被問最多的是另一個問題：

> 「我訂 Claude Pro / Max，也想做一個屬於我的 AI 機器人，能用嗎？」

答案當然可以。兩個 CLI 都是 OAuth 登入、認證流程差不多，所以 Gemini 版的做法直接換 CLI 就能跑。

於是花了 20 分鐘把 Gemini 版 fork 成 Claude 版，架構 1:1 對齊、**只換一個 subprocess 指令**，命名改成 [telegram-claude-bot](https://github.com/yazelin/telegram-claude-bot)。整份程式碼核心還是一個 `main.py`，86 行。

這是給「有 Claude 訂閱，想親手做一個 AI 助理」的人寫的第一份作業。不管你有沒有寫過 Python、不管你會不會部署，只要你的終端機能執行 `claude -p "hi"` 並得到回應，10 分鐘內就能讓一個 Telegram bot 活起來。

---

## 架構

```
使用者 (Telegram)
  │
  ▼
python-telegram-bot (Polling 模式)
  │  收到文字訊息
  ▼
asyncio.create_subprocess_exec("claude", "-p", prompt)
  │  讀取 stdout
  ▼
reply_text() 回傳給使用者
```

三個元件：

| 元件 | 角色 |
|------|------|
| **FastAPI** | Web Server，用 `lifespan` 在背景啟動 Telegram Bot |
| **python-telegram-bot** | Polling 模式監聽訊息，不需要 Webhook |
| **Claude Code CLI** | 系統已認證的 `claude` 指令，直接 subprocess 呼叫 |

和 Gemini 版架構一模一樣。唯一差別：subprocess 從 `gemini` 換成 `claude`。

不需要 Webhook 代表不需要公開 IP、不需要 HTTPS 憑證、不需要 Cloudflare Worker 轉發。Polling 模式讓 bot 主動去拉訊息，開發和部署都簡單很多。

---

## 核心程式碼

整個 `main.py` 只有三個部分。

### 1. 呼叫 Claude CLI

```python
async def call_claude_cli(prompt: str) -> str:
    try:
        process = await asyncio.create_subprocess_exec(
            "claude", "-p", prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            return stdout.decode().strip()
        else:
            error_msg = stderr.decode().strip()
            logger.error(f"Claude CLI 錯誤: {error_msg}")
            return f"Error: {error_msg}"
    except Exception as e:
        logger.error(f"執行 Claude CLI 時發生異常: {e}")
        return "抱歉，系統執行指令時發生錯誤。"
```

重點和 Gemini 版一樣：用 `asyncio.create_subprocess_exec` 而不是 `subprocess.run`。這樣 Claude CLI 在等回應的時候，整個 FastAPI server 不會被阻塞，其他訊息還是可以繼續處理。

### 2. Telegram 訊息處理

```python
async def handle_telegram_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    user_text = update.message.text
    reply_text = await call_claude_cli(user_text)

    if reply_text:
        await update.message.reply_text(reply_text)
    else:
        await update.message.reply_text("Claude 沒有回傳任何內容。")
```

收到訊息 → 丟給 Claude CLI → 拿到結果 → 回傳。沒有 prompt engineering、沒有 system prompt、沒有 conversation history。就是一問一答。

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

和 Gemini 版一樣，這個專案**完全不碰 Anthropic API key**。

傳統做法：在程式碼裡用 `anthropic` SDK，設定 `ANTHROPIC_API_KEY` 環境變數，管理 API 金鑰的輪替和安全。

這個專案的做法：假設你的機器上已經裝好 Claude Code CLI 並完成認證（登入 Claude Pro / Max 訂閱，或設定 API key），程式碼只負責呼叫 `claude -p "你的問題"`，認證完全由 CLI 處理。

`.env` 裡只需要一個變數：

```bash
TELEGRAM_BOT_TOKEN=你的_TELEGRAM_BOT_TOKEN
```

沒有 `ANTHROPIC_API_KEY`。這個做法特別適合有 Claude Pro / Max 訂閱的人 — 你已經付過月費，CLI 直接用訂閱額度，一行程式碼都不用碰 API 計費。

---

## 設定與啟動

### 前置條件

1. Python 3.11+
2. [uv](https://github.com/astral-sh/uv)（套件管理）
3. Claude Code CLI 已安裝且已認證 — 手動執行 `claude -p "test"` 要能正確回傳
4. Telegram Bot Token — 向 [@BotFather](https://t.me/botfather) 申請

### 啟動

```bash
# 1. Clone
git clone https://github.com/yazelin/telegram-claude-bot.git
cd telegram-claude-bot

# 2. 建立 .env
cp .env.example .env
# 編輯 .env 填入 TELEGRAM_BOT_TOKEN

# 3. 啟動
chmod +x run.sh
./run.sh
```

`run.sh` 會自動檢查三件事：`.env` 存在、Token 不是預設值、`claude` 指令可用。通過後執行 `uv run python main.py`。

也可以直接手動啟動：

```bash
uv run python main.py
```

服務啟動後，`http://localhost:8000/` 會回傳 `{"status": "online", "mode": "cli_polling"}`，Telegram Bot 就可以開始對話了。

---

## 和 Gemini 版的差異比較

| 項目 | Gemini 版 | Claude 版 |
|------|-----------|-----------|
| CLI | `gemini -p "prompt"` | `claude -p "prompt"` |
| 認證方式 | OAuth 登入（`gemini auth login`） | OAuth 登入（`claude` 首次啟動） |
| 訂閱對象 | Google AI Pro | Claude Pro / Max |
| 程式碼規模 | 88 行 | 86 行 |
| 額外依賴 | 保留 `google-generativeai`（備用） | 無（純 CLI 呼叫） |

兩個版本本質上是同一份程式，換個 subprocess 指令而已。
選哪個看你手上已經有哪個訂閱、或者哪個 CLI 在你工作流裡用得順。

---

## 小結

| 項目 | 內容 |
|------|------|
| 檔案數 | 1 個（`main.py`，86 行） |
| API Key 管理 | 無（靠 CLI 認證） |
| 部署方式 | 任何有 Python + Claude Code CLI 的機器 |
| 訊息模式 | Polling（不需要公開 IP） |
| AI 呼叫方式 | `subprocess: claude -p "prompt"` |

這個專案的價值和 Gemini 版一樣：**作為 vibe coding 的起手式**。如果 AI CLI 工具已經處理好認證和 API 呼叫，應用層的程式碼可以極度簡化。不需要 SDK、不需要 API key、不需要管理 token — 一個 subprocess 呼叫就夠了。

從建立 Bot Token、寫 `.env`、到第一次在 Telegram 收到 Claude 回覆，整個過程不到 10 分鐘。先有成就感，再來談架構 — 這才是 vibe coding 該有的節奏。

---

## 注意事項

這個專案是**教學用的極簡起手式**，刻意省略了所有防護機制。正式使用前請注意：

- **無身份驗證**：任何人找到你的 bot 都能跟它對話，等於免費用你的 Claude 訂閱額度
- **無聊天白名單**：沒有限制哪些 chat ID 可以使用
- **無訊息長度限制**：使用者可以送超長文字，消耗大量 token
- **無頻率限制**：沒有 rate limiting，有心人可以大量灌訊息
- **無對話隔離**：Claude CLI 每次呼叫都是獨立的，沒有 conversation history，但也沒有防止 prompt injection
- **Bot Token 外洩風險**：`.env` 裡的 token 如果不小心 commit 到公開 repo，bot 會被接管

如果要認真用，至少加上：

1. **`ALLOWED_CHAT_ID` 白名單** — 只允許特定使用者/群組
2. **Rate limiting** — 限制每人每分鐘訊息數
3. **`.gitignore` 確認** — 確保 `.env` 不會被 commit

---

## 後續練習方向

跑起來之後，以下是我自己走過、覺得值得繼續深入的路線：

1. **加對話記憶** — 原本每次 `claude -p` 都是獨立 session。如果想讓 bot 記得你上一句說什麼，可以改用 `claude --continue` 或自己實作簡單的訊息歷史。這是一道小練習題，但會讓你瞬間理解「stateless vs stateful AI」差在哪。

2. **把 bot 人格化** — 幫你的 bot 取個名字、寫一份 system prompt（例如：「你是一個住在森林裡的 AI 精靈，名字叫 ○○，講話帶一點神秘感。」），然後在 `call_claude_cli` 時把 system prompt 和 user 訊息串起來。你的 AI 從「助理」變「角色」只需要這一步。

3. **接到 Claude Skills 或 Hooks** — 如果你用的是 Claude Code CLI，可以設定 skills（特定技能）或 hooks（自動行為）。Bot 收到訊息時，Claude 會自動用你定義的 skill/hook 處理。這是從「聊天機器人」升級到「有專業能力的夥伴」的分水嶺。

4. **延伸到其他通訊平台** — 同樣的 subprocess 呼叫模式，可以套用到 LINE Bot、Discord Bot、Matrix、Slack 上。你只需要換一個訊息接收層，核心邏輯（call_claude_cli）完全不動。

這些練習我自己寫成了另一套專案（[Annuli](https://github.com/yazelin/Annuli)、[AgentPulse](https://github.com/yazelin/AgentPulse) 等），如果有興趣可以再看後續文章。

---

## Repo

- [github.com/yazelin/telegram-claude-bot](https://github.com/yazelin/telegram-claude-bot)（本文）
- [github.com/yazelin/telegram-gemini-bot](https://github.com/yazelin/telegram-gemini-bot)（前作，Gemini 版）

---

> 這份是「森之冒險者公會」Level 0 起手式之一。
> 給願意把 AI 當夥伴一步步養大、而不是當販賣機用的人。
