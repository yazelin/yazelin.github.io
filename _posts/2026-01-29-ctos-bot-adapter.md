---
layout: post
title: "ChingTech OS：多平台 Bot Adapter 重構"
subtitle: "從 Line Bot 專用到支援任意聊天平台"
date: 2026-01-29
categories: [ChingTech OS]
tags: [ChingTech OS, 重構, 設計模式, Adapter Pattern, Python, Line Bot, Telegram]
---

![ChingTech OS：多平台 Bot Adapter 重構](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-29-ctos-bot-adapter.png)

## 前言

ChingTech OS 最初只支援 Line Bot 作為聊天介面。所有程式碼——從 Webhook 處理、AI 回覆、訊息儲存到檔案管理——都直接寫死在 `linebot.py` 這個單一模組裡。當時只有一個平台，這樣做沒問題。

但當我們決定加入 Telegram 支援時，問題立刻浮現：核心 AI 處理邏輯、用戶管理、群組管理都和 Line SDK 深度耦合。如果直接複製一份改成 Telegram 版本，未來每修一個 bug 都要改兩個地方。

這篇文章記錄我們如何用 8 個階段（Phase），把整個 Bot 模組從 Line-only 重構為多平台架構。重點不在最終設計有多精妙，而是展示如何在一個已上線的系統中，有系統地進行大規模重構而不中斷服務。

---

## 重構前的狀態

重構前，所有 Bot 相關的程式碼集中在兩個地方：

```
backend/src/ching_tech_os/
├── services/
│   ├── linebot.py          # 1500+ 行的巨型模組
│   └── linebot_ai.py       # AI 處理（與 Line SDK 深度耦合）
├── api/
│   └── linebot_router.py   # API 路由（/api/linebot/*）
└── models/
    └── linebot.py           # Pydantic 模型
```

資料庫表也全部以 `line_` 前綴命名：

```sql
line_groups    -- 群組
line_users     -- 用戶
line_messages  -- 訊息
line_files     -- 檔案
```

這意味著如果要加入 Telegram，你得在 `linebot.py` 裡面到處加 `if platform == "telegram"` 的分支判斷，或者複製一份 `telegrambot.py`。兩種做法都不好維護。

---

## 設計方向：Adapter Pattern

我們選擇使用 **Adapter Pattern** 來解決這個問題。核心思路是：

1. **定義一個平台無關的 Protocol**（抽象介面），規範所有平台必須提供的能力
2. **每個平台各自實作自己的 Adapter**，封裝平台特有的 SDK 呼叫
3. **核心邏輯只依賴 Protocol**，不直接引用任何平台 SDK

用圖來看就是：

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Line SDK   │     │   BotAdapter     │     │   核心 AI 處理   │
│  (linebot)  │◄────│   Protocol       │────►│   (bot/ai.py)   │
└─────────────┘     │                  │     └─────────────────┘
                    │  - send_text()   │
┌─────────────┐     │  - send_image()  │     ┌─────────────────┐
│ Telegram SDK│     │  - send_file()   │     │   訊息模型       │
│ (python-    │◄────│  - send_messages │────►│ (bot/message.py) │
│  telegram-  │     │                  │     └─────────────────┘
│  bot)       │     └──────────────────┘
└─────────────┘
```

Python 的 `Protocol` 是 structural subtyping（鴨子型別的靜態版本），不需要繼承，只要方法簽名符合就算實作了 Protocol。這讓各平台 Adapter 可以保持輕量，不用處理複雜的繼承鏈。

---

## 抽象 Bot Adapter 介面

以下是 `BotAdapter` Protocol 的完整定義，位於 `services/bot/adapter.py`：

```python
from typing import Any, Protocol, runtime_checkable
from dataclasses import dataclass


@dataclass
class SentMessage:
    """已發送訊息的結果"""
    message_id: str
    platform_type: str


@runtime_checkable
class BotAdapter(Protocol):
    """所有平台必須實作的標準化介面"""

    platform_type: str

    async def send_text(
        self,
        target: str,
        text: str,
        *,
        reply_to: str | None = None,
        mention_user_id: str | None = None,
    ) -> SentMessage: ...

    async def send_image(
        self,
        target: str,
        image_url: str,
        *,
        reply_to: str | None = None,
        preview_url: str | None = None,
    ) -> SentMessage: ...

    async def send_file(
        self,
        target: str,
        file_url: str,
        file_name: str,
        *,
        reply_to: str | None = None,
        file_size: str | None = None,
    ) -> SentMessage: ...

    async def send_messages(
        self,
        target: str,
        messages: list[Any],
        *,
        reply_to: str | None = None,
    ) -> list[SentMessage]: ...
```

幾個設計決策：

- **`@runtime_checkable`**：讓我們可以在測試中用 `isinstance(adapter, BotAdapter)` 驗證 Protocol 相容性
- **`target` 統一參數名**：不叫 `chat_id`（Telegram）也不叫 `to`（Line），而用語意明確的 `target`
- **keyword-only 的可選參數**：`reply_to`、`mention_user_id` 等用 `*` 分隔，避免呼叫時參數順序搞混
- **回傳 `SentMessage`**：統一的發送結果，包含 `message_id` 和 `platform_type`

### 可選的擴展 Protocol

不是每個平台都有相同能力。例如 Telegram 支援編輯已發送的訊息，Line 不支援。我們用獨立的 Protocol 來表達這類可選能力：

```python
@runtime_checkable
class EditableMessageAdapter(Protocol):
    """可選：支援訊息編輯/刪除的平台（如 Telegram）"""

    async def edit_message(
        self, target: str, message_id: str, new_text: str
    ) -> None: ...

    async def delete_message(
        self, target: str, message_id: str
    ) -> None: ...


@runtime_checkable
class ProgressNotifier(Protocol):
    """可選：支援即時進度更新的平台"""

    async def send_progress(self, target: str, text: str) -> SentMessage: ...
    async def update_progress(self, target: str, message_id: str, text: str) -> None: ...
    async def finish_progress(self, target: str, message_id: str) -> None: ...
```

`ProgressNotifier` 用於 AI 處理期間的狀態通知。Telegram 可以做到「送出進度訊息 -> 即時更新文字 -> 完成後刪除」，Line 做不到。核心邏輯可以這樣判斷：

```python
if isinstance(adapter, ProgressNotifier):
    progress = await adapter.send_progress(target, "AI 處理中...")
    # ... AI 處理 ...
    await adapter.finish_progress(target, progress.message_id)
```

---

## 統一的訊息模型

除了 Adapter，我們還定義了平台無關的訊息模型，位於 `services/bot/message.py`：

```python
class PlatformType(str, Enum):
    LINE = "line"
    TELEGRAM = "telegram"

class ConversationType(str, Enum):
    PRIVATE = "private"
    GROUP = "group"

@dataclass
class BotMessage:
    """入站訊息的正規化格式"""
    platform_type: PlatformType
    sender_id: str
    target_id: str
    text: str | None = None
    media_url: str | None = None
    conversation_type: ConversationType = ConversationType.PRIVATE
    reply_to_message_id: str | None = None
    platform_data: dict = field(default_factory=dict)

@dataclass
class BotContext:
    """對話情境（AI 處理所需的所有資訊）"""
    platform_type: PlatformType
    conversation_type: ConversationType
    user_uuid: UUID | None = None
    group_uuid: UUID | None = None
    platform_user_id: str | None = None
    platform_group_id: str | None = None
    user_display_name: str | None = None
    ctos_user_id: int | None = None
    message_uuid: UUID | None = None
    platform_data: dict = field(default_factory=dict)
```

`platform_data` 是一個逃生口——平台特有的資料（如 Line 的 `reply_token`）放在這裡，核心邏輯不需要知道它的結構，各平台自己取用。

---

## 8 個重構階段

這次重構分為 8 個 Phase，每個 Phase 都可以獨立部署和驗證。以下是完整路徑。

### Phase 1：建立抽象層骨架

建立 `services/bot/` 目錄，定義 Protocol 和訊息模型：

```
services/bot/
├── __init__.py      # 模組說明
├── adapter.py       # BotAdapter Protocol
├── message.py       # BotMessage, BotContext, BotResponse
├── ai.py            # 平台無關的 AI 處理（從 linebot_ai.py 抽離）
├── agents.py        # Agent 工具 Prompt 管理
└── media.py         # 媒體處理（暫存管理、URL 提取）
```

`bot/ai.py` 抽取了不依賴任何平台 SDK 的邏輯，像是 AI 回應解析、nanobanana 圖片生成工具的輸出處理：

```python
def parse_ai_response(response: str) -> tuple[str, list[dict]]:
    """解析 AI 回應，提取文字和檔案訊息"""
    pattern = r'\[FILE_MESSAGE:(\{.*?\})\]'
    files = []
    for match in re.finditer(pattern, response):
        file_info = json.loads(match.group(1))
        files.append(file_info)
    text = re.sub(pattern, '', response).strip()
    return text, files
```

### Phase 2：SQL 表重新命名

資料庫表從 `line_*` 改為 `bot_*`，並加入 `platform_type` 欄位：

```sql
-- 重新命名表
ALTER TABLE line_groups RENAME TO bot_groups;
ALTER TABLE line_users RENAME TO bot_users;
ALTER TABLE line_messages RENAME TO bot_messages;
ALTER TABLE line_files RENAME TO bot_files;

-- 重新命名外鍵欄位
ALTER TABLE bot_messages RENAME COLUMN line_user_id TO bot_user_id;
ALTER TABLE bot_messages RENAME COLUMN line_group_id TO bot_group_id;

-- 重新命名關聯表
ALTER TABLE line_group_memories RENAME TO bot_group_memories;
ALTER TABLE line_user_memories RENAME TO bot_user_memories;

-- 加入 platform_type 欄位
ALTER TABLE bot_groups ADD COLUMN platform_type VARCHAR(20) NOT NULL DEFAULT 'line';
ALTER TABLE bot_users ADD COLUMN platform_type VARCHAR(20) NOT NULL DEFAULT 'line';
ALTER TABLE bot_messages ADD COLUMN platform_type VARCHAR(20) NOT NULL DEFAULT 'line';
ALTER TABLE bot_files ADD COLUMN platform_type VARCHAR(20) NOT NULL DEFAULT 'line';

-- 重建 unique index（加入 platform_type）
DROP INDEX idx_line_groups_group_id;
CREATE UNIQUE INDEX idx_bot_groups_tenant_platform_unique
    ON bot_groups (tenant_id, platform_type, platform_group_id);
```

關鍵決策：

- **DEFAULT 'line'**：所有現有資料自動標記為 Line 平台，零停機遷移
- **`platform_group_id`**：原本叫 `line_group_id`（Line 的 `C` 開頭 ID），現在改為平台無關的通用欄位名
- **複合 unique index**：`(tenant_id, platform_type, platform_group_id)` 確保同一平台不會有重複記錄

### Phase 3：拆分 linebot.py 為子模組

原本 1500+ 行的 `linebot.py` 拆成多個專責模組：

```
services/bot_line/
├── __init__.py        # 統一匯出（向後相容）
├── adapter.py         # LineBotAdapter
├── client.py          # Line API 客戶端
├── webhook.py         # Webhook 簽章驗證
├── user_manager.py    # 用戶管理
├── group_manager.py   # 群組管理
├── message_store.py   # 訊息儲存
├── messaging.py       # 訊息發送
├── file_handler.py    # 檔案處理
├── trigger.py         # AI 觸發判斷
├── binding.py         # 帳號綁定與存取控制
├── admin.py           # 管理查詢
├── memory.py          # 記憶管理
└── constants.py       # 常數定義
```

`__init__.py` 重新匯出所有公開函式，確保其他模組的 `from ..services.bot_line import xxx` 繼續正常運作。這是拆分大型模組時最重要的向後相容策略。

### Phase 4：實作 LineBotAdapter

`LineBotAdapter` 實作 `BotAdapter` Protocol，透過委託（delegation）呼叫既有的 `messaging.py` 函式：

```python
class LineBotAdapter:
    platform_type: str = "line"

    async def send_text(self, target, text, *, reply_to=None, mention_user_id=None):
        from .messaging import push_text, create_text_message_with_mention, push_messages

        if mention_user_id:
            msg = create_text_message_with_mention(text, mention_user_id)
            sent_ids, error = await push_messages(target, [msg])
            msg_id = sent_ids[0] if sent_ids else ""
        else:
            msg_id, error = await push_text(target, text)

        if error:
            return SentMessage(message_id="", platform_type="line")
        return SentMessage(message_id=msg_id or "", platform_type="line")
```

注意 Line 有些平台專屬方法不在 `BotAdapter` 介面中：

```python
    async def reply_text(self, reply_token: str, text: str) -> SentMessage:
        """使用 reply token 回覆文字（Line 專屬，非 BotAdapter 介面）"""
        ...

    async def reply_messages(self, reply_token: str, messages: list) -> list[SentMessage]:
        """使用 reply token 回覆多則訊息（Line 專屬，非 BotAdapter 介面）"""
        ...
```

Line 的 reply token 機制是 Line 獨有的（收到 Webhook 後 30 秒內必須用 token 回覆，免費），其他平台沒有這個概念。將它放在 Adapter 的額外方法中，不污染公共介面。

### Phase 5：實作 TelegramBotAdapter

Telegram 的 Adapter 同時實作三個 Protocol：

```python
class TelegramBotAdapter:
    """同時實作 BotAdapter / EditableMessageAdapter / ProgressNotifier"""

    platform_type: str = "telegram"

    def __init__(self, token: str):
        self.bot = Bot(token=token)

    # === BotAdapter ===
    async def send_text(self, target, text, *, reply_to=None, mention_user_id=None):
        kwargs = {"chat_id": target, "text": text}
        if reply_to:
            kwargs["reply_to_message_id"] = int(reply_to)
        msg = await self.bot.send_message(**kwargs)
        return SentMessage(message_id=str(msg.message_id), platform_type="telegram")

    async def send_file(self, target, file_url, file_name, *, reply_to=None, file_size=None):
        """先下載檔案到記憶體，再上傳給 Telegram"""
        async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
            resp = await client.get(file_url)
        buf = BytesIO(resp.content)
        buf.name = file_name
        msg = await self.bot.send_document(
            chat_id=target, document=InputFile(buf, filename=file_name)
        )
        return SentMessage(message_id=str(msg.message_id), platform_type="telegram")

    # === EditableMessageAdapter ===
    async def edit_message(self, target, message_id, new_text):
        await self.bot.edit_message_text(
            chat_id=target, message_id=int(message_id), text=new_text
        )

    # === ProgressNotifier ===
    async def send_progress(self, target, text):
        return await self.send_text(target, text)

    async def update_progress(self, target, message_id, text):
        await self.edit_message(target, message_id, text)

    async def finish_progress(self, target, message_id):
        try:
            await self.delete_message(target, message_id)
        except Exception:
            pass  # 可能已過期
```

`send_file` 的實作值得注意：Telegram 的 Bot API 伺服器無法存取內網 URL，所以 Adapter 要先下載到記憶體，再以二進位方式上傳。這種平台差異正是 Adapter 層要處理的事。

### Phase 6：API 路由遷移

路由從 `/api/linebot/*` 遷移為 `/api/bot/*` 的階層結構：

```python
# main.py
app.include_router(linebot_router.router, prefix="/api/bot")          # 通用
app.include_router(linebot_router.line_router, prefix="/api/bot/line") # Line Webhook
app.include_router(telegram_router.router, prefix="/api/bot/telegram") # Telegram Webhook
```

最終的路由結構：

```
/api/bot/
├── groups/          # 通用群組管理（支援 platform_type 查詢參數）
├── users/           # 通用用戶管理
├── messages/        # 通用訊息管理
├── files/           # 通用檔案管理
├── binding/         # 帳號綁定（支援 platform_type 參數）
├── memories/        # 記憶管理
├── line/
│   └── webhook      # Line Webhook 端點
└── telegram/
    └── webhook      # Telegram Webhook 端點
```

所有列表 API 都加入了 `platform_type` 查詢參數：

```python
@router.get("/groups")
async def api_list_groups(
    platform_type: str | None = Query(None, description="平台類型過濾（line, telegram）"),
    ...
):
    items, total = await list_groups(platform_type=platform_type, ...)
```

### Phase 7：Bot 設定管理 API

新增 `/api/admin/bot-settings/{platform}` 端點，統一管理各平台的 Bot 憑證：

```python
router = APIRouter(prefix="/api/admin/bot-settings", tags=["Bot Settings"])

@router.get("/{platform}")        # 取得設定狀態（遮罩顯示）
@router.put("/{platform}")        # 更新憑證
@router.delete("/{platform}")     # 清除憑證
@router.post("/{platform}/test")  # 測試連線
```

每個平台的憑證欄位不同（Line 需要 `channel_secret` + `channel_access_token`，Telegram 需要 `bot_token` + `webhook_secret`），用通用的 request model 處理：

```python
class UpdateBotSettingsRequest(BaseModel):
    """通用，允許任意欄位組合"""
    channel_secret: str | None = None
    channel_access_token: str | None = None
    bot_token: str | None = None
    webhook_secret: str | None = None
    admin_chat_id: str | None = None
```

測試連線功能會根據平台呼叫不同的 API：

```python
async def _test_line_connection(credentials):
    resp = await client.get("https://api.line.me/v2/bot/info", ...)

async def _test_telegram_connection(credentials):
    resp = await client.get(f"https://api.telegram.org/bot{token}/getMe", ...)
```

### Phase 8：測試與驗證

使用 Protocol 的好處之一是可以寫出明確的相容性測試：

```python
from ching_tech_os.services.bot.adapter import BotAdapter
from ching_tech_os.services.bot_line.adapter import LineBotAdapter

class TestLineBotAdapterProtocol:
    def test_is_bot_adapter(self):
        """LineBotAdapter 應該符合 BotAdapter Protocol"""
        adapter = LineBotAdapter()
        assert isinstance(adapter, BotAdapter)

    def test_platform_type(self):
        adapter = LineBotAdapter()
        assert adapter.platform_type == "line"
```

`isinstance(adapter, BotAdapter)` 利用 `@runtime_checkable` 在執行時驗證結構相容性。如果 `LineBotAdapter` 漏了某個方法，這個測試就會失敗。

---

## 重構後的模組結構

完成 8 個 Phase 後，整體結構如下：

```
services/
├── bot/                       # 平台無關的核心層
│   ├── adapter.py             #   BotAdapter Protocol 定義
│   ├── message.py             #   BotMessage, BotContext, BotResponse
│   ├── ai.py                  #   AI 回應解析
│   ├── agents.py              #   Agent 工具 Prompt 管理
│   └── media.py               #   媒體處理
│
├── bot_line/                  # Line 平台實作
│   ├── adapter.py             #   LineBotAdapter
│   ├── client.py              #   Line API 客戶端
│   ├── webhook.py             #   Webhook 驗證
│   ├── messaging.py           #   訊息發送
│   ├── user_manager.py        #   用戶管理
│   ├── group_manager.py       #   群組管理
│   ├── message_store.py       #   訊息儲存
│   ├── file_handler.py        #   檔案處理
│   ├── trigger.py             #   AI 觸發判斷
│   ├── binding.py             #   帳號綁定
│   ├── admin.py               #   管理查詢
│   └── memory.py              #   記憶管理
│
└── bot_telegram/              # Telegram 平台實作
    ├── adapter.py             #   TelegramBotAdapter
    ├── handler.py             #   事件處理
    ├── media.py               #   媒體下載
    └── polling.py             #   Polling 模式（開發用）
```

資料庫也從平台專屬變成多平台共用：

```sql
bot_groups    (platform_type, platform_group_id, ...)
bot_users     (platform_type, platform_user_id, ...)
bot_messages  (platform_type, bot_user_id, bot_group_id, ...)
bot_files     (platform_type, message_id, ...)
```

---

## 尚未完成的部分

這次重構並非一步到位。有些地方為了控制風險，選擇暫時保留舊的命名：

1. **`linebot_ai.py` 尚未完全抽離**：核心 AI 處理流程仍在這個檔案中，Line 和 Telegram 都引用它。理想狀態是拆成 `bot/ai_handler.py`，但涉及太多細節，留到下一次
2. **`linebot_agents.py` 命名**：Agent 設定管理仍使用舊名，功能上已經是平台無關的了
3. **`linebot_router.py` 檔名**：Router 檔名還是 `linebot_router.py`，但路由前綴已改為 `/api/bot`
4. **部分 SQL 查詢的舊命名**：一些查詢函式內部的變數名仍用 `line_group_id`，語意上已不完全正確

這些都是可以在後續迭代中逐步清理的。重構的原則是「每一步都可以部署、每一步都不會破壞現有功能」，完美的命名可以慢慢來。

---

## 小結

這次重構的核心收穫：

**1. Protocol 比 ABC 更適合 Python 的 Adapter Pattern**

Python 的 `Protocol`（PEP 544）採用 structural subtyping，不需要繼承，只要方法簽名匹配就算實作。這讓各平台 Adapter 可以獨立開發，不被繼承鏈束縛。加上 `@runtime_checkable`，可以在測試中用 `isinstance` 驗證相容性。

**2. 可選能力用獨立 Protocol 表達**

不是每個平台都有相同能力。用獨立的 `EditableMessageAdapter`、`ProgressNotifier` Protocol 表達可選能力，核心邏輯用 `isinstance` 判斷是否支援，比用 `hasattr` 或 flag 更安全。

**3. 分 Phase 部署是大規模重構的保命技巧**

8 個 Phase 中，任何一個出問題都可以獨立 rollback。SQL migration 用 `DEFAULT 'line'` 確保零停機。`__init__.py` 重新匯出確保引用不斷。這比一次大爆炸式的重構安全得多。

**4. 新增平台的成本降到最低**

現在要加入一個新平台（例如 Discord），只需要：
- 建立 `services/bot_discord/adapter.py`，實作 `BotAdapter` Protocol
- 建立 `services/bot_discord/handler.py`，處理平台事件
- 加一個 `api/discord_router.py`
- 資料庫不用改（`platform_type = 'discord'` 就好）

核心 AI 處理、群組管理、帳號綁定等邏輯完全不用動。

---

## 參考資源

- [PEP 544 -- Protocols: Structural subtyping](https://peps.python.org/pep-0544/) -- Python Protocol 的正式規格
- [python-telegram-bot](https://github.com/python-telegram-bot/python-telegram-bot) -- Telegram Bot API 的 Python SDK
- [LINE Messaging API SDK for Python](https://github.com/line/line-bot-sdk-python) -- Line Bot SDK
- [Refactoring: Improving the Design of Existing Code](https://martinfowler.com/books/refactoring.html) -- Martin Fowler 的經典重構指南
