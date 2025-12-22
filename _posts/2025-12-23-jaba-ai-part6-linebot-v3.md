---
layout: post
title: "LINE Bot v3 SDK + FastAPI 非同步整合"
subtitle: "整合兩個專案的 LINE Bot 處理邏輯到統一架構"
date: 2025-12-23
categories: [Jaba AI]
tags: [Python, LINE Bot, FastAPI, SDK v3, 非同步]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第六篇文章。

在 [專案整合與重寫]({% post_url 2025-12-20-jaba-ai-part1-integration %}) 中，我們將原本分散的 [jaba]({% post_url 2025-12-08-jaba %}) 和 [jaba-line-bot]({% post_url 2025-12-09-jaba-line-bot %}) 重寫為統一的 jaba-ai 應用。這篇文章分享 LINE Bot SDK v3 與 FastAPI 整合的實作細節。

---

## LINE Bot SDK v3 的特點

LINE Bot SDK v3 有幾個與舊版不同的設計：

### 套件結構

```python
from linebot.v3.webhook import WebhookParser
from linebot.v3.messaging import MessagingApi, Configuration, ApiClient
from linebot.v3.messaging import TextMessage, ReplyMessageRequest
```

特點：
- 命名空間包含版本號 `linebot.v3`
- API 客戶端需要明確的 Configuration
- 訊息類別名稱簡潔（`TextMessage` 而非 `TextSendMessage`）

### API 初始化流程

```python
# v3 需要三步驟初始化
configuration = Configuration(access_token=access_token)
api_client = ApiClient(configuration)
messaging_api = MessagingApi(api_client)

# 使用 Request 物件包裝參數
messaging_api.reply_message(
    ReplyMessageRequest(
        reply_token=reply_token,
        messages=[TextMessage(text="Hello")]
    )
)
```

初始化步驟：
1. 建立 `Configuration` 物件（設定 access token）
2. 建立 `ApiClient` 物件
3. 建立 `MessagingApi` 物件
4. 使用 Request 物件包裝 API 參數

---

## Webhook 設定

### FastAPI 路由

```python
# app/routers/line_webhook.py
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from linebot.v3.webhook import WebhookParser
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import (
    MessageEvent,
    TextMessageContent,
    JoinEvent,
    LeaveEvent,
    PostbackEvent,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services import LineService

router = APIRouter(prefix="/api/webhook", tags=["webhook"])

# Webhook Parser
parser = WebhookParser(settings.line_channel_secret)


@router.post("/line")
async def line_callback(
    request: Request,
    x_line_signature: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """LINE Webhook 回調"""
    # 讀取請求 body
    body = await request.body()
    body_str = body.decode("utf-8")

    # 驗證簽章並解析事件
    try:
        events = parser.parse(body_str, x_line_signature)
    except InvalidSignatureError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 處理事件
    service = LineService(db)

    for event in events:
        try:
            if isinstance(event, MessageEvent):
                if isinstance(event.message, TextMessageContent):
                    await handle_text_message(service, event)
            elif isinstance(event, JoinEvent):
                await handle_join_event(service, event)
            elif isinstance(event, LeaveEvent):
                await handle_leave_event(service, event)
            elif isinstance(event, PostbackEvent):
                await handle_postback_event(service, event)
        except Exception as e:
            logger.error(f"Error handling event: {e}")

    return {"status": "ok"}
```

### 事件處理函數

```python
async def handle_text_message(service: LineService, event: MessageEvent):
    """處理文字訊息"""
    text = event.message.text
    user_id = event.source.user_id

    # 判斷來源類型
    source_type = event.source.type
    group_id = None

    if source_type == "group":
        group_id = event.source.group_id
    elif source_type == "room":
        group_id = event.source.room_id

    # 處理訊息
    await service.handle_message(
        user_id=user_id,
        group_id=group_id,
        text=text,
        reply_token=event.reply_token,
    )


async def handle_join_event(service: LineService, event: JoinEvent):
    """處理加入群組事件"""
    source_type = event.source.type

    if source_type == "group":
        group_id = event.source.group_id
    elif source_type == "room":
        group_id = event.source.room_id
    else:
        return

    await service.handle_join(
        group_id=group_id,
        reply_token=event.reply_token,
    )
```

---

## LINE Service 設計

### 初始化

```python
# app/services/line_service.py
from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessagingApi,
    ReplyMessageRequest,
    PushMessageRequest,
    TextMessage,
    QuickReply,
    QuickReplyItem,
    PostbackAction,
)

class LineService:
    """LINE 服務"""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.channel_secret = settings.line_channel_secret
        self.channel_access_token = settings.line_channel_access_token

        # 設定 API 客戶端
        configuration = Configuration(access_token=self.channel_access_token)
        self.api_client = ApiClient(configuration)
        self.messaging_api = MessagingApi(self.api_client)

        # 初始化 Repositories
        self.user_repo = UserRepository(session)
        self.group_repo = GroupRepository(session)
        # ...
```

### 回覆訊息

```python
async def reply_message(self, reply_token: str, message: str) -> None:
    """回覆訊息"""
    try:
        self.messaging_api.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[TextMessage(text=message)],
            )
        )
    except Exception as e:
        logger.error(f"Reply message error: {e}")
```

### 推送訊息

```python
async def push_message(self, to: str, message: str) -> None:
    """推送訊息（不需要 reply_token）"""
    try:
        self.messaging_api.push_message(
            PushMessageRequest(
                to=to,
                messages=[TextMessage(text=message)],
            )
        )
    except Exception as e:
        logger.error(f"Push message error: {e}")
```

### Quick Reply 按鈕

```python
async def _reply_with_quick_reply(
    self, reply_token: str, message: str, items: list
) -> None:
    """回覆帶有 Quick Reply 按鈕的訊息"""
    try:
        self.messaging_api.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[
                    TextMessage(
                        text=message,
                        quick_reply=QuickReply(items=items),
                    )
                ],
            )
        )
    except Exception as e:
        logger.error(f"Quick reply error: {e}")


# 使用範例
async def show_menu_options(self, reply_token: str):
    """顯示菜單選項"""
    items = [
        QuickReplyItem(
            action=PostbackAction(label="今日菜單", data="action=menu")
        ),
        QuickReplyItem(
            action=PostbackAction(label="開始點餐", data="action=start")
        ),
        QuickReplyItem(
            action=PostbackAction(label="查看訂單", data="action=orders")
        ),
    ]

    await self._reply_with_quick_reply(
        reply_token,
        "請選擇操作：",
        items
    )
```

---

## 取得使用者資料

### 個人使用者

```python
async def get_user_profile(self, user_id: str) -> Optional[dict]:
    """取得使用者資料"""
    try:
        profile = self.messaging_api.get_profile(user_id)
        return {
            "user_id": profile.user_id,
            "display_name": profile.display_name,
            "picture_url": profile.picture_url,
        }
    except Exception as e:
        logger.error(f"Get user profile error: {e}")
        return None
```

### 群組成員

```python
async def get_group_member_profile(
    self, group_id: str, user_id: str
) -> Optional[dict]:
    """取得群組成員資料"""
    try:
        profile = self.messaging_api.get_group_member_profile(group_id, user_id)
        return {
            "user_id": profile.user_id,
            "display_name": profile.display_name,
            "picture_url": profile.picture_url,
        }
    except Exception as e:
        logger.error(f"Get group member profile error: {e}")
        return None
```

### 群組資訊

```python
async def get_group_name(self, group_id: str) -> str:
    """取得群組名稱"""
    try:
        summary = self.messaging_api.get_group_summary(group_id)
        return summary.group_name
    except Exception as e:
        logger.error(f"Get group name error: {e}")
        return ""
```

---

## 訊息處理流程

### 主入口

```python
async def handle_message(
    self,
    user_id: str,
    group_id: Optional[str],
    text: str,
    reply_token: str,
) -> None:
    """處理訊息 - 主入口"""
    # 1. 取得或建立使用者
    user = await self.user_repo.get_or_create(user_id)

    # 2. 檢查封鎖狀態
    if user.is_banned:
        return  # 靜默忽略

    # 3. 嘗試取得顯示名稱
    if not user.display_name:
        if group_id:
            profile = await self.get_group_member_profile(group_id, user_id)
        else:
            profile = await self.get_user_profile(user_id)
        if profile:
            user.display_name = profile["display_name"]
            await self.user_repo.update(user)

    # 4. 區分個人/群組訊息
    if group_id:
        await self._handle_group_message(user, group_id, text, reply_token)
    else:
        await self._handle_personal_message(user, text, reply_token)
```

### 群組訊息處理

```python
async def _handle_group_message(
    self,
    user: User,
    line_group_id: str,
    text: str,
    reply_token: str,
) -> None:
    """處理群組訊息"""
    # 1. 取得或建立群組
    group = await self.group_repo.get_or_create(line_group_id)

    # 2. 更新群組名稱
    if not group.name:
        group_name = await self.get_group_name(line_group_id)
        if group_name:
            group.name = group_name
            await self.group_repo.update(group)

    # 3. 檢查群組狀態
    if group.status == "suspended":
        return  # 被凍結的群組不回應

    if group.status != "active":
        # 未啟用的群組，引導申請
        await self._handle_pending_group_chat(user, group, text, reply_token)
        return

    # 4. 記錄成員
    await self.member_repo.add_member(group.id, user.id)

    # 5. 檢查點餐狀態
    active_session = await self.session_repo.get_active_session(group.id)
    is_ordering = active_session is not None

    # 6. 處理快捷指令
    quick_response = await self._handle_quick_command(
        user, group, text.strip(), active_session
    )
    if quick_response:
        await self.reply_message(reply_token, quick_response)
        return

    # 7. 根據狀態決定是否回應
    should_reply = self._should_respond_in_group(text, is_ordering)
    if not should_reply:
        return

    # 8. 呼叫 AI 處理
    await self._handle_ai_chat(user, group, active_session, text, reply_token)
```

### 回應策略

```python
def _should_respond_in_group(
    self, text: str, is_ordering: bool
) -> tuple[bool, str]:
    """判斷群組中是否應該回應

    Returns:
        (should_respond, cleaned_message)
    """
    text_lower = text.lower()

    if is_ordering:
        # 點餐中：所有訊息都回應
        return True, text

    # 非點餐中：只回應特定指令
    if text in ["開單", "菜單"]:
        return True, text

    # 呼叫幫助（@呷爸、呷爸）
    trigger_keywords = ["jaba", "呷爸", "點餐"]
    for keyword in trigger_keywords:
        if text_lower in [keyword.lower(), f"@{keyword.lower()}"]:
            return True, "help"

    return False, text
```

回傳 tuple 的好處是可以同時決定是否回應，並清理訊息（例如將 `@呷爸` 轉換成 `help` 指令）。

---

## 簽章驗證

SDK v3 的 `WebhookParser` 會自動驗證簽章：

```python
try:
    events = parser.parse(body_str, x_line_signature)
except InvalidSignatureError:
    raise HTTPException(status_code=400, detail="Invalid signature")
```

如果需要手動驗證：

```python
import hashlib
import hmac
import base64

def verify_signature(self, body: str, signature: str) -> bool:
    """手動驗證 LINE 簽章"""
    hash = hmac.new(
        self.channel_secret.encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_signature = base64.b64encode(hash).decode("utf-8")
    return hmac.compare_digest(signature, expected_signature)
```

---

## 注意事項

### 1. Reply Token 有效期

Reply Token 只能使用一次，且有時效限制（約 1 分鐘）：

```python
# 錯誤：同一個 token 用兩次
await self.reply_message(reply_token, "訊息 1")
await self.reply_message(reply_token, "訊息 2")  # 會失敗

# 正確：合併成一次回覆
await self.reply_message(reply_token, "訊息 1\n\n訊息 2")
```

### 2. 非同步注意

SDK v3 的 API 呼叫是同步的，但我們在 FastAPI 的 async 函數中使用。目前的做法是直接呼叫（會阻塞一小段時間）：

```python
async def reply_message(self, reply_token: str, message: str):
    # 這裡的 reply_message 是同步呼叫
    self.messaging_api.reply_message(...)
```

如果需要真正的非同步，可以用 `asyncio.to_thread`：

```python
import asyncio

async def reply_message(self, reply_token: str, message: str):
    await asyncio.to_thread(
        self.messaging_api.reply_message,
        ReplyMessageRequest(...)
    )
```

### 3. 錯誤處理

LINE API 可能因為各種原因失敗，需要妥善處理：

```python
async def reply_message(self, reply_token: str, message: str) -> None:
    try:
        self.messaging_api.reply_message(...)
    except Exception as e:
        logger.error(f"Reply message error: {e}")
        # 不要 raise，避免影響整體流程
```

---

## 總結

LINE Bot SDK v3 與 FastAPI 整合的重點：

| 項目 | 說明 |
|------|------|
| 命名空間 | 使用 `linebot.v3.*` |
| API 初始化 | Configuration → ApiClient → MessagingApi |
| 訊息類別 | `TextMessage`、`ReplyMessageRequest` 等 |
| Webhook 處理 | `WebhookParser` 解析事件 |
| 非同步整合 | 在 async 函數中呼叫同步 SDK API |

SDK v3 的好處：
- 清晰的 API 結構
- 良好的型別提示
- 與 FastAPI 架構整合良好

---

## 下一篇

下一篇文章會說明群組權限系統的設計：[LINE 群組權限設計：從申請到審核的完整流程]({% post_url 2025-12-23-jaba-ai-part7-group-permission %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
