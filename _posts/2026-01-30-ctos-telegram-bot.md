---
layout: post
title: "ChingTech OS：Telegram Bot 完整實作"
subtitle: "從零到完成的多平台聊天機器人"
date: 2026-01-30
categories: [ChingTech OS]
tags: [ChingTech OS, Telegram, Bot, Python, AI, 多平台]
---

![ChingTech OS：Telegram Bot 完整實作](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-30-ctos-telegram-bot.png)


## 前言

在前一篇文章中，我們完成了 [多平台 Bot Adapter 重構]({% post_url 2026-01-29-ctos-bot-adapter %})，將原本耦合 Line Bot 的程式碼抽象成平台無關的 `BotAdapter` Protocol。現在架構已經準備好了，是時候來實際加入第二個平台——Telegram。

Telegram Bot API 是業界最開放、最好用的聊天機器人 API 之一。不需要審核流程、不需要付費方案，註冊後立刻就能拿到 Token 開始開發。搭配我們已經建好的多平台架構，整個實作過程相當順暢。

本篇將記錄從零開始，分 5 個階段完整實作 Telegram Bot 的過程，包含訊息儲存、AI 對話、用戶綁定、群組支援、檔案處理、進度通知，以及最後從 Webhook 切換到 Polling 模式的決策。

---

## Telegram Bot API 基礎

在動手寫 code 之前，先理解 Telegram Bot API 的幾個核心概念。

### 建立 Bot

所有 Telegram Bot 都透過 **@BotFather** 建立：

1. 在 Telegram 搜尋 `@BotFather`
2. 發送 `/newbot` 指令
3. 設定 Bot 的顯示名稱和 username
4. 取得 Bot Token（格式：`123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`）

### 關鍵設定

```
/setprivacy → Disable
```

這一步很重要——預設情況下 Bot 在群組中只能收到 `/` 開頭的指令訊息。將 privacy mode 設為 `Disable` 後，Bot 才能接收群組中的所有訊息（包括 @mention 和回覆）。

### 訊息接收方式

Telegram 提供兩種方式接收訊息：

| 方式 | 說明 | 適用場景 |
|------|------|----------|
| **Webhook** | Telegram 主動推送到你的 HTTPS 端點 | 有固定公網 IP、已部署 SSL 的伺服器 |
| **Polling** | 你主動從 Telegram API 拉取訊息 | 開發環境、IP 會變動的伺服器 |

我們最終選擇了 **Polling 模式**，原因會在後面的章節說明。

### Python 套件

我們使用 `python-telegram-bot` 套件，它是 Telegram Bot API 的高品質 Python wrapper：

```bash
pip install python-telegram-bot
```

---

## Phase 1：基礎架構

第一步是建立 Telegram Bot 的骨架程式碼，讓系統能接收和回應 Telegram 訊息。

### 程式碼結構

```
backend/src/ching_tech_os/
├── api/
│   └── telegram_router.py          # Webhook API 端點
├── services/
│   └── bot_telegram/
│       ├── __init__.py
│       ├── adapter.py              # TelegramBotAdapter
│       ├── handler.py              # 事件處理核心
│       ├── media.py                # 媒體檔案處理
│       └── polling.py              # Polling 迴圈
```

### TelegramBotAdapter

Adapter 是整個 Telegram Bot 的「嘴巴」——負責所有對外發送的操作。它同時實作了三個 Protocol：

```python
class TelegramBotAdapter:
    """同時實作 BotAdapter / EditableMessageAdapter / ProgressNotifier"""

    platform_type: str = "telegram"

    def __init__(self, token: str):
        self.bot = Bot(token=token)
        self._bot_username: str | None = None

    async def ensure_bot_info(self) -> None:
        """取得並快取 Bot 資訊（username 等）"""
        if self._bot_username is None:
            me = await self.bot.get_me()
            self._bot_username = me.username
```

核心方法包括：

- `send_text()` — 發送文字訊息
- `send_image()` — 發送圖片
- `send_file()` — 發送檔案（先下載再上傳，避免內網 URL 問題）
- `edit_message()` / `delete_message()` — 編輯和刪除訊息（Line Bot 做不到的）
- `send_progress()` / `update_progress()` / `finish_progress()` — 進度通知

特別值得一提的是 `send_file()` 的設計。Telegram Bot API 的 `sendDocument` 可以直接傳 URL 讓 Telegram 伺服器去下載，但我們的檔案放在內網 NAS 上，Telegram 伺服器無法存取。所以改成**先用 httpx 下載到記憶體，再以二進位方式上傳**：

```python
async def send_file(self, target, file_url, file_name, **kwargs):
    # 先下載檔案到記憶體
    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        resp = await client.get(file_url)
        resp.raise_for_status()

    buf = BytesIO(resp.content)
    buf.name = file_name

    msg = await self.bot.send_document(
        chat_id=target,
        document=InputFile(buf, filename=file_name),
    )
    return SentMessage(message_id=str(msg.message_id), platform_type="telegram")
```

### Webhook 端點

初始版本使用 Webhook 模式。在 FastAPI 中註冊端點，接收 Telegram 推送的 Update：

```python
@router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    # 驗證 secret token
    if settings.telegram_webhook_secret:
        secret_header = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if secret_header != settings.telegram_webhook_secret:
            raise HTTPException(status_code=403, detail="Invalid secret token")

    adapter = _get_adapter()
    body = await request.json()
    update = Update.de_json(body, adapter.bot)

    # 背景處理，不阻塞回應
    background_tasks.add_task(handle_update, update, adapter)
    return {"status": "ok"}
```

關鍵設計：使用 `BackgroundTasks` 將訊息處理放到背景，確保 Webhook 端點能在 Telegram 要求的超時時間內回應 `200 OK`。

---

## Phase 2：重命名殘留欄位（Phase 0）

在開始 Phase 3 的功能實作前，我們先做了一個重要的清理工作：把資料庫中殘留的 `line_*` 欄位名稱重命名為平台無關的名稱。

這是在 Bot Adapter 重構時遺漏的部分。例如：
- `line_user_id` → `platform_user_id`
- `line_group_id` → `platform_group_id`

統一命名後，Telegram 的資料才能自然地用 `platform_type = 'telegram'` 區分，不會跟 Line 的資料搞混。

---

## Phase 3：功能實作（核心）

Phase 3 是最大的階段，包含了 7 個子任務。

### Phase 3.1：訊息儲存基礎設施

所有 Telegram 訊息都儲存到共用的 `bot_messages` 資料表，透過 `platform_type` 欄位區分平台：

```python
PLATFORM_TYPE = "telegram"

async def _save_message(conn, message_id, bot_user_id, bot_group_id,
                        message_type, content, is_from_bot) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO bot_messages (
            message_id, bot_user_id, bot_group_id,
            message_type, content, is_from_bot, platform_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        """,
        message_id, bot_user_id, bot_group_id,
        message_type, content, is_from_bot, PLATFORM_TYPE,
    )
    return row["id"]
```

Telegram 的 `message_id` 會加上 `tg_` 前綴（例如 `tg_12345`），避免跟 Line 的訊息 ID 衝突。

用戶和群組也是共用 `bot_users` 和 `bot_groups` 資料表：

```python
async def _ensure_bot_user(user, conn) -> str:
    """確保 Telegram 用戶存在於 bot_users，回傳 UUID"""
    platform_user_id = str(user.id)
    display_name = user.full_name

    row = await conn.fetchrow(
        "SELECT id, display_name FROM bot_users "
        "WHERE platform_type = $1 AND platform_user_id = $2",
        PLATFORM_TYPE, platform_user_id,
    )

    if row:
        # display_name 有變化就更新
        if display_name and display_name != row["display_name"]:
            await conn.execute(
                "UPDATE bot_users SET display_name = $1, updated_at = NOW() WHERE id = $2",
                display_name, row["id"],
            )
        return row["id"]

    # 新建用戶
    row = await conn.fetchrow(
        "INSERT INTO bot_users (platform_type, platform_user_id, display_name) "
        "VALUES ($1, $2, $3) RETURNING id",
        PLATFORM_TYPE, platform_user_id, display_name,
    )
    return row["id"]
```

### Phase 3.2 + 3.3：對話歷史與 AI Log 記錄

Telegram Bot 與 Line Bot **共用同一個 AI 處理管線**。這是 Bot Adapter 重構最大的好處——不需要為每個平台重寫 AI 呼叫邏輯：

```python
# 共用 AI 模組
from ..linebot_ai import (
    build_system_prompt,
    get_conversation_context,
    log_linebot_ai_call,
)
```

AI 呼叫流程：

1. `get_conversation_context()` — 取得最近 20 則對話歷史
2. `build_system_prompt()` — 組裝系統提示（包含平台資訊、群組記憶等）
3. `call_claude()` — 呼叫 Claude API
4. `log_linebot_ai_call()` — 記錄 AI Log

其中 `context_type` 會標記為 `telegram-group` 或 `telegram-personal`，方便在前端管理介面篩選。

### Phase 3.4：用戶綁定與存取控制

Telegram 帳號綁定流程與 Line Bot 相同，使用 6 位數驗證碼：

1. 用戶登入 CTOS 系統
2. 進入 Bot 管理頁面
3. 點擊「綁定帳號」產生驗證碼
4. 在 Telegram 私訊 Bot 發送驗證碼

```python
# 檢查是否為綁定驗證碼（6 位數字）
if bot_user_id and await is_binding_code_format(text.strip()):
    success, msg = await verify_binding_code(bot_user_id, text.strip())
    await adapter.send_text(chat_id, msg)
    return
```

存取控制規則：

| 狀態 | 私訊 | 群組 |
|------|------|------|
| 未綁定用戶 | 回覆綁定提示（含 Telegram ID） | 靜默忽略 |
| 已綁定用戶 | 正常使用 AI | 需群組開啟 `allow_ai_response` |
| 群組未授權 | N/A | 靜默忽略 |

有一個值得注意的細節：未綁定用戶的提示訊息中會顯示他的 Telegram ID，方便管理員設定 Admin Chat ID：

```python
await adapter.send_text(
    chat_id,
    "請先在 CTOS 系統綁定您的 Telegram 帳號才能使用此服務。\n\n"
    f"📋 您的 Telegram ID：{chat_id}\n"
    "（設定 Admin Chat ID 時可使用此 ID）",
)
```

### Phase 3.5：群組支援

群組訊息的觸發條件與 Line Bot 類似：

```python
def _should_respond_in_group(message, bot_username):
    """判斷群組訊息是否應該觸發 AI 回覆"""
    # 條件 1：回覆 Bot 的訊息
    if message.reply_to_message and message.reply_to_message.from_user:
        if message.reply_to_message.from_user.is_bot:
            return True

    # 條件 2：@Bot mention
    if message.entities and bot_username:
        for entity in message.entities:
            if entity.type == "mention":
                mention_text = message.text[entity.offset:entity.offset + entity.length]
                if mention_text.lower() == f"@{bot_username.lower()}":
                    return True

    return False
```

群組中只有 `@Bot` 沒有其他文字時，不會回覆空白，而是讓 AI 根據對話歷史主動回應：

```python
if is_group:
    text = _strip_bot_mention(message.text, adapter.bot_username)
    if not text:
        text = "（用戶呼叫了你，請根據最近的對話歷史回應）"
```

### Phase 3.6：圖片/檔案接收

Telegram 收到的圖片和檔案會自動下載到 NAS 儲存：

```
NAS/{ctos_mount_path}/linebot/files/
├── telegram/
│   ├── groups/{chat_id}/
│   │   ├── images/{date}/{filename}
│   │   └── files/{date}/{filename}
│   └── users/{chat_id}/
│       ├── images/{date}/{filename}
│       └── files/{date}/{filename}
```

下載流程（以圖片為例）：

```python
async def download_telegram_photo(bot, message, message_uuid, chat_id, is_group):
    photo = message.photo[-1]  # 取得最高解析度

    # 透過 Telegram API 下載
    file = await bot.get_file(photo.file_id)
    content = bytes(await file.download_as_bytearray())

    # 生成 NAS 路徑
    nas_path = _generate_telegram_nas_path(
        file_type="image", message_id=message.message_id,
        chat_id=chat_id, is_group=is_group, ext=".jpg",
    )

    # 儲存到 NAS
    success = await save_to_nas(nas_path, content)
    if not success:
        return None

    # 記錄到 bot_files 資料表
    await save_file_record(
        message_uuid=message_uuid,
        file_type="image", file_size=photo.file_size,
        mime_type="image/jpeg", nas_path=nas_path,
    )
    return nas_path
```

圖片下載後會複製一份到暫存目錄 `/tmp/bot-images/`，讓 AI 能直接讀取圖片內容並進行描述或分析。

### Phase 3.7：指令與回覆上下文

**指令系統**（Phase 3.7.1）：

| 指令 | 說明 | 可用範圍 |
|------|------|----------|
| `/start` | 歡迎訊息和綁定步驟 | 私訊 |
| `/help` | 使用說明 | 私訊 |
| `/reset` | 重置對話記錄 | 私訊 |
| `/新對話` | 重置對話記錄（中文別名） | 私訊 |

**回覆上下文**（Phase 3.7.2）——當用戶回覆一則舊訊息時，系統會自動取得被回覆的內容，包含文字、圖片和檔案：

```python
async def _get_reply_context(message, bot=None):
    reply = message.reply_to_message
    if not reply:
        return ""

    # 先查 DB
    reply_msg_id = f"tg_{reply.message_id}"
    async with get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT m.content, m.message_type, f.nas_path, f.file_name "
            "FROM bot_messages m LEFT JOIN bot_files f ON f.message_id = m.id "
            "WHERE m.message_id = $1", reply_msg_id,
        )

    if not row:
        # DB 沒有記錄，直接從 Telegram message 物件取得
        return await _extract_reply_from_message(reply, bot)

    # 圖片：下載到暫存目錄讓 AI 讀取
    if row["message_type"] == "image" and row["nas_path"]:
        temp_path = await ensure_temp_image(reply_msg_id, row["nas_path"])
        if temp_path:
            return f"[回覆圖片: {temp_path}]\n"

    # 文字
    if row["content"]:
        return f"[回覆訊息: {row['content']}]\n"
```

這裡有一個實務上的坑：Bot 回覆的 `message_id` 格式（`tg_reply_12345`）和 DB 儲存的 key 格式（`tg_12345`）不一致，所以 DB 常會查不到。解決方案是**當 DB 查不到時，直接從 Telegram 的 `reply_to_message` 物件取得內容**。

---

## Phase 4：前端管理介面

前端的 Bot 管理頁面新增了多平台篩選功能：

- 群組列表可以按 `platform_type` 篩選 Line / Telegram
- 用戶列表同樣支援平台篩選
- AI Logs 可以按 `context_type` 篩選 `telegram-group` / `telegram-personal`
- API 路徑統一使用 `?platform_type=telegram` 查詢參數

---

## Phase 5：AI 處理進度通知

這是 Telegram 相比 Line 的一大優勢——**可以編輯已發送的訊息**。利用這個特性，我們實作了 AI 處理的即時進度通知。

### 運作方式

1. AI 開始呼叫工具時，發送一則「AI 處理中」的訊息
2. 每個工具執行完成後，**原地更新**這則訊息的內容
3. 全部處理完成後，**刪除**這則進度通知

用戶會看到類似這樣的即時更新：

```
🤖 AI 處理中

🔧 search_knowledge
   └ keyword='會議記錄'
   ✅ 完成 (320ms)

🔧 get_project_info
   └ project_id='PRJ-001'
   ⏳ 執行中...
```

### 節流機制

Telegram Bot API 有速率限制（同一個 chat 每秒約 1 則訊息）。如果 AI 連續呼叫多個工具，每次都更新訊息會觸發 `429 Too Many Requests`。

解決方案是加入**節流機制**——至少間隔 1 秒才更新一次：

```python
THROTTLE_INTERVAL = 1.0  # 至少間隔 1 秒

async def _send_or_update_progress():
    nonlocal progress_message_id, last_update_ts
    now = time.time()
    full_text = "🤖 AI 處理中\n\n" + "\n\n".join(t["line"] for t in tool_status_lines)

    if progress_message_id is None:
        sent = await adapter.send_progress(chat_id, full_text)
        progress_message_id = sent.message_id
        last_update_ts = now
    elif now - last_update_ts >= THROTTLE_INTERVAL:
        await adapter.update_progress(chat_id, progress_message_id, full_text)
        last_update_ts = now
```

對應的 Adapter 實作非常簡潔，因為直接利用了 `EditableMessageAdapter` Protocol 的方法：

```python
# ProgressNotifier 實作
async def send_progress(self, target, text):
    return await self.send_text(target, text)

async def update_progress(self, target, message_id, text):
    await self.edit_message(target, message_id, text)

async def finish_progress(self, target, message_id):
    try:
        await self.delete_message(target, message_id)
    except Exception:
        pass  # 訊息可能已過期
```

---

## 從 Webhook 到 Polling 模式

初始版本使用 Webhook 模式，但很快遇到了問題。

### Webhook 的痛點

1. **需要 Public URL**：伺服器必須有公網可存取的 HTTPS 端點
2. **IP 變動問題**：我們的伺服器 IP 不固定，每次重新部署可能需要重新設定 DNS
3. **SSL 憑證**：Webhook URL 必須是 HTTPS，需要額外維護 SSL 憑證
4. **Nginx 設定**：需要設定反向代理把 Telegram 的請求導到 FastAPI

### 改用 Polling 模式

Polling 模式的核心是 `getUpdates` API——主動向 Telegram 伺服器拉取最新訊息：

```python
async def run_telegram_polling():
    adapter = TelegramBotAdapter(token=settings.telegram_bot_token)
    await adapter.ensure_bot_info()

    # 建立專用 Bot 實例，read_timeout 必須大於 POLL_TIMEOUT
    bot = Bot(
        token=settings.telegram_bot_token,
        request=HTTPXRequest(read_timeout=POLL_TIMEOUT + 10),
    )

    # 刪除現有 webhook（polling 與 webhook 不能同時使用）
    await bot.delete_webhook()

    offset = None
    retry_delay = 1

    try:
        while True:
            try:
                updates = await bot.get_updates(
                    offset=offset,
                    timeout=POLL_TIMEOUT,  # Long polling: 30 秒
                    allowed_updates=["message"],
                )
                retry_delay = 1  # 成功就重置

                for update in updates:
                    offset = update.update_id + 1
                    asyncio.create_task(_safe_handle_update(update, adapter))

            except asyncio.CancelledError:
                raise
            except Exception:
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)  # 指數退避

    except asyncio.CancelledError:
        logger.info("Telegram polling 已停止")
```

幾個重要的設計決策：

**Long Polling**：`timeout=30` 表示如果沒有新訊息，Telegram 會等 30 秒才回應空結果。這避免了頻繁請求，同時保持即時性。

**read_timeout 設定**：HTTP client 的 `read_timeout` 必須大於 `POLL_TIMEOUT`，否則會在 Telegram 還沒回應前就超時。我們設為 `POLL_TIMEOUT + 10`（40 秒）。

**指數退避重試**：遇到錯誤時從 1 秒開始，每次加倍，最多到 60 秒。

**非同步處理**：每則訊息用 `asyncio.create_task()` 放到背景處理，不阻塞 polling 迴圈。

**Lifecycle 整合**：Polling 在 FastAPI lifespan 啟動時以 `asyncio.Task` 執行，應用程式關閉時透過 `task.cancel()` 優雅停止。

---

## 租戶級 Telegram 設定

CTOS 是多租戶系統，每個租戶可以有自己的 Telegram Bot。設定管理透過 `bot_settings` 資料表實現：

```python
# 各平台的憑證欄位
PLATFORM_KEYS = {
    "line": ["channel_secret", "channel_access_token"],
    "telegram": ["bot_token", "webhook_secret", "admin_chat_id"],
}

# 需要加密儲存的欄位
ENCRYPTED_KEYS = {"channel_secret", "channel_access_token", "bot_token", "webhook_secret"}
```

設定讀取優先順序：

1. **資料庫** — 租戶自訂的設定（加密儲存）
2. **環境變數** — Fallback 到全域設定

```python
async def get_bot_credentials(platform: str) -> dict[str, str]:
    async with get_connection() as conn:
        rows = await conn.fetch(
            "SELECT key, value FROM bot_settings WHERE platform = $1", platform,
        )
        db_values = {row["key"]: row["value"] for row in rows}

    result = {}
    for key in PLATFORM_KEYS[platform]:
        db_val = db_values.get(key, "")
        if db_val:
            # 資料庫有值，解密
            if key in ENCRYPTED_KEYS and is_encrypted(db_val):
                result[key] = decrypt_credential(db_val)
            else:
                result[key] = db_val
        else:
            # Fallback 到環境變數
            result[key] = _get_env_fallback(platform, key)

    return result
```

敏感欄位（`bot_token`、`webhook_secret`）使用 AES 加密儲存。前端管理介面只顯示遮罩後的值（例如 `1234...5678`），不會暴露完整 Token。

Admin Chat ID 只在租戶設定了自訂 Bot Token 時才可用——因為共用 Bot 的情況下，管理員通知應該由系統級設定控制。

---

## 與 Line Bot 的差異對照

整個實作完成後，兩個平台的功能差異如下：

| 項目 | Line Bot | Telegram Bot |
|------|----------|-------------|
| 訊息接收 | Webhook | Polling（getUpdates） |
| 群組觸發 | @Bot mention / 回覆 Bot | @Bot mention / 回覆 Bot |
| 進度通知 | 新訊息（無法更新） | `edit_message_text` 原地更新 |
| 群組 Mention 回覆 | 支援（TextMessageV2） | 不支援（Telegram 無此機制） |
| 指令 | `/新對話`、`/reset` | `/start`、`/help`、`/reset`、`/新對話` |
| 多租戶 | 支援獨立 Bot / 共用 Bot | 目前使用預設租戶 |
| 資料庫 | `bot_*`（`platform_type='line'`） | `bot_*`（`platform_type='telegram'`） |

兩者共用的部分：
- AI 處理管線（`linebot_ai.py`）
- MCP 工具集（專案管理、知識庫、NAS 搜尋等）
- 用戶綁定機制
- 檔案儲存到 NAS
- AI Log 記錄

---

## 小結

從 Bot Adapter 重構到 Telegram Bot 完整實作，整個過程大約花了兩天時間。得益於抽象層的設計，大部分邏輯（AI 呼叫、工具整合、用戶管理）都能直接復用，真正需要為 Telegram 新寫的只有：

1. **Adapter**（~190 行）— 包裝 `python-telegram-bot` 的 API
2. **Handler**（~960 行）— 訊息分流和事件處理
3. **Media**（~170 行）— 媒體檔案下載和 NAS 儲存
4. **Polling**（~120 行）— Long polling 迴圈

加上測試和設定管理，總共約 1,500 行新程式碼就完成了一個功能完整的 Telegram Bot，包括 AI 對話、圖片處理、檔案管理、群組支援、進度通知、用戶綁定等功能。

這再次證明了一件事：**好的抽象設計能讓新平台的接入成本大幅降低**。如果未來要加入 Discord、Slack 或 WhatsApp，只需要實作對應的 Adapter 和 Handler，核心的 AI 處理管線完全不用動。

---

## 參考資源

- [多平台 Bot Adapter 重構]({% post_url 2026-01-29-ctos-bot-adapter %})
- [Telegram Bot API 官方文件](https://core.telegram.org/bots/api)
- [python-telegram-bot 官方文件](https://docs.python-telegram-bot.org/)
- [Line Bot Webhook 實作]({% post_url 2025-12-30-linebot-part1-webhook %})
- [Line Bot AI 整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})
