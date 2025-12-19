---
layout: post
title: "事件隊列設計：解決 Socket.IO 與 DB Commit 順序問題"
subtitle: "用 ContextVar 實現 Request-Scoped 的事件隊列"
date: 2025-12-21
categories: [Jaba AI]
tags: [Python, FastAPI, Socket.IO, 事件驅動, 架構設計]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第三篇文章。

在 [上一篇]({% post_url 2025-12-21-jaba-ai-part2-repository %}) 中我們實作了 Repository Pattern。當資料寫入資料庫後，我們需要通知前端即時更新。這時會遇到一個微妙的問題：**通知發送的時機**。

---

## 問題：通知比資料更快

假設我們有一個建立訂單的 API：

```python
@router.post("/orders")
async def create_order(data: OrderCreate, db: AsyncSession = Depends(get_db)):
    # 1. 建立訂單
    order = Order(...)
    db.add(order)
    await db.flush()

    # 2. 發送 Socket.IO 通知
    await sio.emit("order_update", {"order_id": str(order.id)}, room=group_id)

    # 3. 提交交易
    await db.commit()

    return {"order_id": str(order.id)}
```

看起來沒問題，但實際上有競態條件：

```
時間軸：
─────────────────────────────────────────────────────────►

後端：  flush ──► emit ──────────────────────────► commit
                   │
前端：            收到通知 ──► fetch /orders/{id} ──► ???
                                                      │
                                                   資料還沒 commit！
                                                   查詢可能失敗或回傳舊資料
```

前端收到通知後立刻去查詢，但資料庫還沒 commit，導致：
- 查不到資料（404 錯誤）
- 或者查到舊資料（讀取未提交的資料）

---

## 解決方案：事件隊列

解決思路很簡單：**先 commit，再通知**。

但如果直接調換順序：

```python
await db.commit()
await sio.emit("order_update", {...})
```

問題是：如果在同一個請求中有多個操作，每個操作都需要發送通知，順序會變得很亂。

更好的做法是：**用隊列收集事件，最後一次性發送**。

```
1. 業務邏輯執行 → 產生事件 → 加入隊列（不發送）
2. 所有操作完成 → db.commit()
3. commit 成功 → flush_events()（批次發送所有事件）
```

---

## 實作：Request-Scoped 事件隊列

### 核心設計

使用 Python 的 `ContextVar` 來實現 Request-Scoped 的隊列：

```python
# app/broadcast.py
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Dict, List

@dataclass
class PendingEvent:
    """待發送的事件"""
    event_type: str
    room: str
    data: Dict[str, Any]


# Request-scoped 事件隊列
_event_queue: ContextVar[List[PendingEvent]] = ContextVar('event_queue')


def _get_queue() -> List[PendingEvent]:
    """取得當前請求的事件隊列"""
    try:
        return _event_queue.get()
    except LookupError:
        # 第一次存取時建立新隊列
        queue: List[PendingEvent] = []
        _event_queue.set(queue)
        return queue


def _queue_event(event_type: str, room: str, data: dict) -> None:
    """將事件加入隊列（不立即發送）"""
    queue = _get_queue()
    queue.append(PendingEvent(event_type=event_type, room=room, data=data))
```

### 為什麼用 ContextVar？

`ContextVar` 是 Python 的上下文變數，每個非同步任務（請求）有獨立的值：

```python
# 請求 A 和請求 B 同時進行
# 請求 A 的隊列: [event1, event2]
# 請求 B 的隊列: [event3]
# 互不干擾
```

這比起用全域變數或 Thread Local 更適合非同步應用。

---

## 廣播函數：依賴注入

為了讓 `broadcast.py` 模組不依賴 Socket.IO 實例（避免循環依賴），我們用依賴注入的方式註冊廣播函數：

```python
# app/broadcast.py
from typing import Awaitable, Callable, Optional

BroadcastFunc = Callable[[str, dict], Awaitable[None]]

# 廣播函數存儲（由 main.py 注入）
_broadcast_order_update: Optional[BroadcastFunc] = None
_broadcast_session_status: Optional[BroadcastFunc] = None
# ... 其他類型

# 事件類型到廣播函數的映射
_event_broadcasters: Dict[str, Optional[BroadcastFunc]] = {}


def register_broadcasters(
    order_update: BroadcastFunc,
    session_status: BroadcastFunc,
    # ... 其他類型
) -> None:
    """由 main.py 調用，注入廣播函數"""
    global _event_broadcasters

    _event_broadcasters = {
        "order_update": order_update,
        "session_status": session_status,
        # ...
    }
```

在 `main.py` 中註冊：

```python
# main.py
from app.broadcast import register_broadcasters

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 註冊廣播函數
    register_broadcasters(
        order_update=lambda room, data: sio.emit("order_update", data, room=room),
        session_status=lambda room, data: sio.emit("session_status", data, room=room),
        # ...
    )
    yield
```

---

## 事件發送函數

對外提供的 API 是 `emit_*` 函數，它們只負責加入隊列：

```python
# app/broadcast.py

async def emit_order_update(group_id: str, data: dict) -> None:
    """將訂單更新事件加入隊列"""
    _queue_event("order_update", group_id, data)


async def emit_session_status(group_id: str, data: dict) -> None:
    """將 Session 狀態事件加入隊列（開單/收單）"""
    _queue_event("session_status", group_id, data)


async def emit_payment_update(group_id: str, data: dict) -> None:
    """將付款狀態事件加入隊列"""
    _queue_event("payment_update", group_id, data)


async def emit_store_change(group_id: str, data: dict) -> None:
    """將今日店家變更事件加入隊列"""
    _queue_event("store_change", group_id, data)
```

---

## Flush：批次發送

`flush_events()` 負責發送隊列中的所有事件：

```python
# app/broadcast.py

async def flush_events() -> None:
    """發送所有隊列中的事件（應在 db.commit() 之後呼叫）"""
    queue = _get_queue()
    if not queue:
        return

    for event in queue:
        broadcaster = _event_broadcasters.get(event.event_type)
        if broadcaster:
            try:
                await broadcaster(event.room, event.data)
            except Exception as e:
                logger.error(f"Failed to broadcast {event.event_type}: {e}")

    queue.clear()  # 清空隊列


def clear_events() -> None:
    """清空事件隊列（用於錯誤/rollback 時）"""
    try:
        queue = _event_queue.get()
        queue.clear()
    except LookupError:
        pass
```

---

## 便利函數：commit_and_notify

為了確保正確的順序，提供一個便利函數：

```python
# app/broadcast.py

async def commit_and_notify(db: AsyncSession) -> None:
    """提交資料庫變更並發送所有排隊的事件

    這是推薦的使用方式，確保：
    1. 資料先寫入資料庫
    2. 然後才發送 Socket 通知
    3. 前端收到通知後 fetch 的資料一定是最新的
    """
    await db.commit()
    await flush_events()
```

---

## 使用方式

### 基本用法

```python
from app.broadcast import emit_order_update, commit_and_notify

@router.post("/orders")
async def create_order(data: OrderCreate, db: AsyncSession = Depends(get_db)):
    repo = OrderRepository(db)

    # 建立訂單
    order = await repo.create(Order(...))

    # 加入事件隊列（不會立即發送）
    await emit_order_update(str(group_id), {
        "action": "created",
        "order": order_to_dict(order),
    })

    # commit 並發送所有事件
    await commit_and_notify(db)

    return {"order_id": str(order.id)}
```

### 多個事件

```python
@router.post("/orders/{order_id}/items")
async def add_order_item(
    order_id: UUID,
    data: ItemCreate,
    db: AsyncSession = Depends(get_db),
):
    order_repo = OrderRepository(db)
    item_repo = OrderItemRepository(db)

    # 取得訂單
    order = await order_repo.get_by_id(order_id)

    # 新增品項
    item = await item_repo.create(OrderItem(order_id=order_id, ...))

    # 更新總金額
    order = await order_repo.calculate_total(order)

    # 加入多個事件
    await emit_order_update(str(order.group_id), {
        "action": "item_added",
        "item": item_to_dict(item),
    })
    await emit_order_update(str(order.group_id), {
        "action": "total_updated",
        "order_id": str(order_id),
        "total": float(order.total_amount),
    })

    # 一次 commit 並發送所有事件
    await commit_and_notify(db)

    return {"item_id": str(item.id)}
```

### 錯誤處理

```python
@router.post("/orders")
async def create_order(data: OrderCreate, db: AsyncSession = Depends(get_db)):
    try:
        order = await repo.create(Order(...))
        await emit_order_update(...)

        await commit_and_notify(db)
        return {"order_id": str(order.id)}

    except Exception:
        await db.rollback()
        clear_events()  # 清空未發送的事件
        raise
```

---

## 完整流程圖

```
使用者點餐
    │
    ▼
LINE Webhook 接收訊息
    │
    ▼
LineService.handle_message()
    │
    ├─ UserRepository.get_or_create()    # flush
    ├─ OrderRepository.create()          # flush
    ├─ emit_order_update()               # 加入隊列
    ├─ ChatRepository.create()           # flush
    └─ emit_chat_message()               # 加入隊列
    │
    ▼
commit_and_notify(db)
    │
    ├─ db.commit()                       # 寫入資料庫
    │     │
    │     ▼
    │   PostgreSQL 確認寫入
    │
    └─ flush_events()                    # 發送所有事件
          │
          ├─ sio.emit("order_update", ...)
          └─ sio.emit("chat_message", ...)
                │
                ▼
前端收到通知 → fetch 最新資料 → 一定成功！
```

![即時訂餐看板](/assets/images/jaba-ai/01-board-main-dashboard.png)
*事件隊列確保前端收到通知時，資料已經 commit 完成*

---

## 設計要點

### 1. 隊列是 Request-Scoped

每個請求有獨立的隊列，請求結束後自動釋放。不需要手動管理生命週期。

### 2. 事件類型明確

```python
# 定義清楚的事件類型
"order_update"      # 訂單變動
"session_status"    # 開單/收單
"payment_update"    # 付款狀態
"store_change"      # 今日店家
"chat_message"      # 聊天訊息
```

### 3. Room 隔離

每個群組是一個 Socket.IO Room，只有加入該 Room 的客戶端會收到通知：

```python
# 前端加入 Room
sio.emit("join_board", {"group_id": "xxx"})

# 後端處理
@sio.on("join_board")
async def handle_join(sid, data):
    group_id = data["group_id"]
    await sio.enter_room(sid, group_id)
```

### 4. 失敗不影響主流程

事件發送失敗只記錄錯誤，不影響 API 回應：

```python
try:
    await broadcaster(event.room, event.data)
except Exception as e:
    logger.error(f"Failed to broadcast: {e}")
    # 繼續處理下一個事件
```

---

## 與其他方案的比較

| 方案 | 優點 | 缺點 |
|------|------|------|
| **直接發送** | 簡單 | 有競態條件 |
| **用 Message Queue** | 可靠、可重試 | 複雜度高、需要額外服務 |
| **資料庫觸發器** | 保證順序 | 耦合度高、難維護 |
| **事件隊列** | 簡單、無額外依賴 | 無重試機制 |

對於 jaba-ai 這樣的應用，事件隊列是最適合的方案：
- 即時性要求高（點餐看板）
- 失敗可接受（重整即可）
- 不需要額外基礎設施

---

## 總結

事件隊列解決了 Socket.IO 與資料庫寫入的順序問題：

1. **分離關注點** — 業務邏輯不用管通知時機
2. **保證順序** — 資料先 commit，再發送通知
3. **批次處理** — 一個請求中的多個事件一起發送
4. **錯誤隔離** — 發送失敗不影響主流程

核心程式碼只有約 100 行，但解決了即時應用中常見的競態條件問題。

---

## 下一篇

系列三會探討 AI 安全的主題：[Prompt Injection 防護實作]({% post_url 2025-12-22-jaba-ai-part4-prompt-injection %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
