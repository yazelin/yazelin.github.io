---
layout: post
title: "Line Bot 整合（一）：Webhook 架構與訊息接收"
subtitle: "用 FastAPI 打造企業級 Line Bot 後端"
date: 2025-12-30
categories: [ChingTech OS]
tags: [Line Bot, FastAPI, Webhook, Python, ChingTech OS]
---

## 前言

在 [LINE Bot 開發入門]({% post_url 2025-12-09-line-bot-guide %}) 中，我們介紹了 LINE Bot 的基本概念與 Webhook 運作原理；[Jaba AI 系列]({% post_url 2025-12-23-jaba-ai-part6-linebot-v3 %}) 則分享了 LINE Bot SDK v3 與 FastAPI 的非同步整合。

這次我們要更進一步，在 [ChingTech OS]({% post_url 2025-12-13-ching-tech-os-index %}) 中實作**企業級 Line Bot 後端**，特點包括：

- **完整資料庫設計**：用戶、群組、訊息、檔案的持久化儲存
- **用戶綁定機制**：Line 用戶與內部系統帳號的關聯
- **群組專案綁定**：Line 群組與專案管理系統的整合
- **存取控制**：細緻的權限管理

這個系列將涵蓋：
1. **Webhook 架構與訊息接收**（本篇）
2. 檔案處理：圖片自動下載到 NAS
3. Line Bot 與 Claude AI 對話整合
4. 群組管理與專案綁定
5. 透過 Line Bot 搜尋並發送 NAS 檔案

---

## 架構概覽

```
Line Platform
     │
     ▼ Webhook (HTTPS POST)
┌─────────────────────────────────────────────────────────┐
│  FastAPI                                                 │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ linebot_router  │───▶│ linebot.py (Service)        │ │
│  │ - 簽章驗證      │    │ - 訊息儲存                  │ │
│  │ - 事件分派      │    │ - 用戶/群組管理             │ │
│  └─────────────────┘    │ - 檔案處理                  │ │
│                         └─────────────────────────────┘ │
│                                    │                     │
│                                    ▼                     │
│                         ┌─────────────────────────────┐ │
│                         │ PostgreSQL                  │ │
│                         │ line_users, line_groups,    │ │
│                         │ line_messages, line_files   │ │
│                         └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 資料表設計

Line Bot 需要四張核心資料表：

### line_users（用戶）

```sql
CREATE TABLE line_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_user_id VARCHAR(64) UNIQUE NOT NULL,  -- Line 用戶 ID
    display_name VARCHAR(256),
    picture_url TEXT,
    status_message TEXT,
    user_id INTEGER REFERENCES users(id),       -- 綁定的系統用戶
    is_friend BOOLEAN DEFAULT false,            -- 是否為 Bot 好友
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### line_groups（群組）

```sql
CREATE TABLE line_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_group_id VARCHAR(64) UNIQUE NOT NULL,  -- Line 群組 ID
    name VARCHAR(256),
    picture_url TEXT,
    member_count INTEGER DEFAULT 0,
    project_id UUID REFERENCES projects(id),    -- 綁定的專案
    is_active BOOLEAN DEFAULT true,             -- Bot 是否在群組中
    allow_ai_response BOOLEAN DEFAULT false,    -- 是否允許 AI 回應
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### line_messages（訊息）

```sql
CREATE TABLE line_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(64) UNIQUE NOT NULL,     -- Line 訊息 ID
    line_user_id UUID REFERENCES line_users(id),
    line_group_id UUID REFERENCES line_groups(id),
    message_type VARCHAR(32) NOT NULL,          -- text, image, video, audio, file
    content TEXT,
    reply_token VARCHAR(64),
    is_from_bot BOOLEAN DEFAULT false,
    ai_processed BOOLEAN DEFAULT false,
    file_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### line_files（檔案）

```sql
CREATE TABLE line_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES line_messages(id) ON DELETE CASCADE,
    file_type VARCHAR(32) NOT NULL,             -- image, video, audio, file
    file_name VARCHAR(256),
    file_size BIGINT,
    mime_type VARCHAR(128),
    nas_path TEXT,                              -- NAS 儲存路徑
    duration INTEGER,                           -- 音訊/影片長度（毫秒）
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Webhook 端點實作

### 簽章驗證

Line 平台會在每個請求的 Header 中附上 `X-Line-Signature`，我們必須驗證這個簽章以確保請求來自 Line：

```python
import hashlib
import hmac
import base64

def verify_signature(body: bytes, signature: str) -> bool:
    """驗證 Line Webhook 簽章"""
    hash_value = hmac.new(
        settings.line_channel_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()
    expected_signature = base64.b64encode(hash_value).decode("utf-8")

    # 使用 compare_digest 防止時序攻擊
    return hmac.compare_digest(signature, expected_signature)
```

### Webhook 路由

```python
from fastapi import APIRouter, Request, HTTPException, Header, BackgroundTasks

router = APIRouter(prefix="/api/linebot", tags=["Line Bot"])

@router.post("/webhook")
async def webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_line_signature: str = Header(...),
):
    """Line Webhook 端點"""
    body = await request.body()

    # 驗證簽章
    if not verify_signature(body, x_line_signature):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 解析事件
    parser = WebhookParser(settings.line_channel_secret)
    events = parser.parse(body.decode("utf-8"), x_line_signature)

    # 背景處理每個事件（快速回應 Line 平台）
    for event in events:
        background_tasks.add_task(process_event, event)

    return {"status": "ok"}
```

> **重要**：Line 平台要求 Webhook 在 **1 秒內** 回應，否則會重試。使用 `BackgroundTasks` 可以先回應再處理。

---

## 事件處理

Line Bot 會收到多種事件類型，我們需要分別處理：

```python
from linebot.v3.webhooks import (
    MessageEvent,
    JoinEvent,
    LeaveEvent,
    FollowEvent,
    UnfollowEvent,
)

async def process_event(event) -> None:
    """處理單個 Line 事件"""
    if isinstance(event, MessageEvent):
        await process_message_event(event)
    elif isinstance(event, JoinEvent):
        await process_join_event(event)
    elif isinstance(event, LeaveEvent):
        await process_leave_event(event)
    elif isinstance(event, FollowEvent):
        await process_follow_event(event)
    elif isinstance(event, UnfollowEvent):
        await process_unfollow_event(event)
```

### 訊息事件

```python
from linebot.v3.webhooks import (
    TextMessageContent,
    ImageMessageContent,
    VideoMessageContent,
    AudioMessageContent,
    FileMessageContent,
)

async def process_message_event(event: MessageEvent) -> None:
    """處理訊息事件"""
    message = event.message
    source = event.source

    # 取得用戶和群組 ID
    line_user_id = source.user_id if hasattr(source, "user_id") else None
    line_group_id = source.group_id if hasattr(source, "group_id") else None

    # 判斷訊息類型
    if isinstance(message, TextMessageContent):
        message_type = "text"
        content = message.text
    elif isinstance(message, ImageMessageContent):
        message_type = "image"
        content = None
    elif isinstance(message, FileMessageContent):
        message_type = "file"
        content = message.file_name
    # ... 其他類型

    # 取得或建立用戶
    user_uuid = await get_or_create_user(line_user_id)

    # 儲存訊息
    message_uuid = await save_message(
        message_id=message.id,
        line_user_id=line_user_id,
        line_group_id=line_group_id,
        message_type=message_type,
        content=content,
        reply_token=event.reply_token,
    )
```

---

## 用戶管理

### 取得或建立用戶

```python
async def get_or_create_user(
    line_user_id: str,
    profile: dict | None = None,
) -> UUID:
    """取得或建立 Line 用戶，回傳內部 UUID"""
    async with get_connection() as conn:
        # 查詢現有用戶
        row = await conn.fetchrow(
            "SELECT id FROM line_users WHERE line_user_id = $1",
            line_user_id,
        )
        if row:
            # 更新用戶資訊
            if profile:
                await conn.execute(
                    """
                    UPDATE line_users
                    SET display_name = COALESCE($2, display_name),
                        picture_url = COALESCE($3, picture_url),
                        updated_at = NOW()
                    WHERE line_user_id = $1
                    """,
                    line_user_id,
                    profile.get("displayName"),
                    profile.get("pictureUrl"),
                )
            return row["id"]

        # 建立新用戶
        row = await conn.fetchrow(
            """
            INSERT INTO line_users (line_user_id, display_name, picture_url)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            line_user_id,
            profile.get("displayName") if profile else None,
            profile.get("pictureUrl") if profile else None,
        )
        return row["id"]
```

### 取得用戶 Profile

Line SDK v3 提供兩種取得用戶資料的 API：

```python
async def get_user_profile(line_user_id: str) -> dict | None:
    """取得用戶 profile（需要好友關係）"""
    api = await get_messaging_api()
    profile = await api.get_profile(line_user_id)
    return {
        "displayName": profile.display_name,
        "pictureUrl": profile.picture_url,
        "statusMessage": profile.status_message,
    }

async def get_group_member_profile(
    line_group_id: str,
    line_user_id: str
) -> dict | None:
    """取得群組成員 profile（不需要好友關係）"""
    api = await get_messaging_api()
    profile = await api.get_group_member_profile(line_group_id, line_user_id)
    return {
        "displayName": profile.display_name,
        "pictureUrl": profile.picture_url,
    }
```

> **注意**：`get_profile()` 只能取得與 Bot 有好友關係的用戶。群組訊息應使用 `get_group_member_profile()`。

---

## 群組管理

### 加入/離開群組

```python
async def handle_join_event(line_group_id: str) -> None:
    """處理加入群組事件"""
    profile = await get_group_profile(line_group_id)
    group_uuid = await get_or_create_group(line_group_id, profile)

    # 確保群組狀態為活躍
    async with get_connection() as conn:
        await conn.execute(
            """
            UPDATE line_groups
            SET is_active = true, left_at = NULL, updated_at = NOW()
            WHERE id = $1
            """,
            group_uuid,
        )

async def handle_leave_event(line_group_id: str) -> None:
    """處理離開群組事件"""
    async with get_connection() as conn:
        await conn.execute(
            """
            UPDATE line_groups
            SET is_active = false, left_at = NOW(), updated_at = NOW()
            WHERE line_group_id = $1
            """,
            line_group_id,
        )
```

### 取得群組資訊

```python
async def get_group_profile(line_group_id: str) -> dict | None:
    """從 Line API 取得群組資訊"""
    api = await get_messaging_api()
    summary = await api.get_group_summary(line_group_id)
    member_count = await api.get_group_member_count(line_group_id)
    return {
        "groupName": summary.group_name,
        "pictureUrl": summary.picture_url,
        "memberCount": member_count.count,
    }
```

---

## 訊息儲存

```python
async def save_message(
    message_id: str,
    line_user_id: str,
    line_group_id: str | None,
    message_type: str,
    content: str | None,
    reply_token: str | None = None,
) -> UUID:
    """儲存訊息到資料庫"""
    # 取得用戶資料（根據來源選擇 API）
    if line_group_id:
        profile = await get_group_member_profile(line_group_id, line_user_id)
    else:
        profile = await get_user_profile(line_user_id)

    user_uuid = await get_or_create_user(line_user_id, profile)

    # 取得群組 UUID
    group_uuid = None
    if line_group_id:
        group_profile = await get_group_profile(line_group_id)
        group_uuid = await get_or_create_group(line_group_id, group_profile)

    # 儲存訊息
    async with get_connection() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO line_messages (
                message_id, line_user_id, line_group_id,
                message_type, content, reply_token
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            message_id, user_uuid, group_uuid,
            message_type, content, reply_token,
        )
        return row["id"]
```

---

## 回覆訊息

```python
from linebot.v3.messaging import (
    AsyncApiClient,
    AsyncMessagingApi,
    Configuration,
    ReplyMessageRequest,
    TextMessage,
)

async def reply_text(reply_token: str, text: str) -> str | None:
    """回覆文字訊息"""
    config = Configuration(access_token=settings.line_channel_access_token)
    api_client = AsyncApiClient(config)
    api = AsyncMessagingApi(api_client)

    response = await api.reply_message(
        ReplyMessageRequest(
            reply_token=reply_token,
            messages=[TextMessage(text=text)],
        )
    )

    # 回傳 Line 訊息 ID
    if response and response.sent_messages:
        return response.sent_messages[0].id
    return None
```

> **注意**：`reply_token` 只能使用一次，且有時效限制（約 30 秒）。

---

## Line Developers Console 設定

1. 前往 [Line Developers Console](https://developers.line.biz/)
2. 建立 **Messaging API Channel**
3. 設定 **Webhook URL**：`https://your-domain/api/linebot/webhook`
4. 啟用 **Use webhook**
5. 取得 **Channel Secret** 和 **Channel Access Token**

### 環境變數

```bash
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
```

---

## 小結

本篇建立了 Line Bot 的基礎架構：

- **Webhook 端點**：接收 Line 平台的事件
- **簽章驗證**：確保請求來源安全
- **事件處理**：分派不同類型的事件
- **資料儲存**：用戶、群組、訊息的持久化

下一篇我們將實作 [檔案處理]({% post_url 2025-12-31-linebot-part2-file-download %})，讓 Line Bot 收到的圖片、影片自動下載到 NAS。

---

## 參考資源

- [LINE Bot 開發入門]({% post_url 2025-12-09-line-bot-guide %})
- [LINE Bot v3 SDK + FastAPI]({% post_url 2025-12-23-jaba-ai-part6-linebot-v3 %})
- [Line Messaging API](https://developers.line.biz/en/docs/messaging-api/)
- [Line Bot SDK Python v3](https://github.com/line/line-bot-sdk-python)
