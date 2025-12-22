---
layout: post
title: "Repository Pattern 實作：讓資料層乾淨分離"
subtitle: "用 Generic Repository 和依賴注入打造可維護的後端架構"
date: 2025-12-21
categories: [Jaba AI]
tags: [Python, FastAPI, SQLAlchemy, Repository Pattern, 架構設計]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第二篇文章。

在 [上一篇文章]({% post_url 2025-12-20-jaba-ai-part1-integration %}) 中，我們提到採用了 Repository Pattern 來分離資料存取和業務邏輯。這篇文章會深入說明具體的實作方式。

---

## 為什麼需要 Repository Pattern？

先看一個常見的寫法：

```python
# 直接在 API 路由中寫 SQL 查詢
@router.get("/users/{user_id}")
async def get_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404)

    # 取得統計資料
    order_count = await db.execute(
        select(func.count(Order.id)).where(Order.user_id == user_id)
    )

    # 取得群組
    groups = await db.execute(
        select(Group)
        .join(GroupMember)
        .where(GroupMember.user_id == user_id)
    )

    return {"user": user, "orders": order_count.scalar(), "groups": list(groups.scalars())}
```

這樣的問題：

1. **SQL 散落各處** — 同樣的查詢可能在多個地方重複
2. **難以測試** — 測試需要真實的資料庫連線
3. **業務邏輯混雜** — API 層不應該知道 SQL 細節
4. **修改風險** — 改一個查詢可能影響多個地方

---

## 分層架構

Repository Pattern 把應用程式分成清晰的層次：

```
┌─────────────────────────────────────┐
│           Router (API 入口)          │
│   處理 HTTP 請求，驗證參數，回傳響應    │
├─────────────────────────────────────┤
│           Service (業務邏輯)          │
│   實作業務規則，協調多個 Repository    │
├─────────────────────────────────────┤
│         Repository (資料存取)         │
│   封裝所有 SQL 查詢，提供領域方法       │
├─────────────────────────────────────┤
│            Model (ORM 定義)          │
│   定義資料表結構和關聯                 │
├─────────────────────────────────────┤
│           Database (資料庫)           │
└─────────────────────────────────────┘
```

每一層只依賴下一層，不會跨層呼叫。

---

## 基礎 Repository 實作

### BaseRepository：Generic CRUD

首先定義一個基礎類別，提供通用的 CRUD 操作：

```python
# app/repositories/base.py
from typing import Generic, List, Optional, Type, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Base

# 定義泛型類型變數，限定為 ORM Model
ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """基礎 Repository 類別"""

    def __init__(self, model: Type[ModelType], session: AsyncSession):
        self.model = model
        self.session = session

    async def get_by_id(self, id: UUID) -> Optional[ModelType]:
        """根據 ID 取得單一記錄"""
        result = await self.session.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def get_all(self, limit: int = 100, offset: int = 0) -> List[ModelType]:
        """取得所有記錄（分頁）"""
        result = await self.session.execute(
            select(self.model).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def create(self, obj: ModelType) -> ModelType:
        """建立記錄"""
        self.session.add(obj)
        await self.session.flush()    # 寫入但不 commit
        await self.session.refresh(obj)  # 重新載入（取得 DB 生成的值）
        return obj

    async def update(self, obj: ModelType) -> ModelType:
        """更新記錄"""
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete(self, obj: ModelType) -> None:
        """刪除記錄"""
        await self.session.delete(obj)
        await self.session.flush()
```

### 為什麼用 `flush()` 而非 `commit()`？

```python
# flush: 寫入資料庫，但保持交易開啟
await self.session.flush()

# commit: 寫入資料庫並提交交易
await self.session.commit()
```

Repository 只負責單一實體的操作，不應該決定何時提交交易。交易的邊界應該由上層（Router 或 Service）控制：

```python
# Router 層控制交易
@router.post("/orders")
async def create_order(data: OrderCreate, db: AsyncSession = Depends(get_db)):
    try:
        order_repo = OrderRepository(db)
        item_repo = OrderItemRepository(db)

        # 建立訂單（flush，未 commit）
        order = await order_repo.create(Order(...))

        # 建立訂單項目（flush，未 commit）
        for item in data.items:
            await item_repo.create(OrderItem(order_id=order.id, ...))

        # 全部成功才 commit
        await db.commit()
        return order

    except Exception:
        await db.rollback()
        raise
```

---

## 領域特定 Repository

繼承 `BaseRepository` 後，為每個 Model 建立專屬的 Repository：

### UserRepository

```python
# app/repositories/user_repo.py
from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """使用者 Repository"""

    def __init__(self, session: AsyncSession):
        super().__init__(User, session)

    async def get_by_line_user_id(self, line_user_id: str) -> Optional[User]:
        """根據 LINE User ID 取得使用者"""
        result = await self.session.execute(
            select(User).where(User.line_user_id == line_user_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create(
        self, line_user_id: str, display_name: Optional[str] = None
    ) -> User:
        """取得或建立使用者"""
        user = await self.get_by_line_user_id(line_user_id)
        if user is None:
            user = User(line_user_id=line_user_id, display_name=display_name)
            user = await self.create(user)
        elif display_name and user.display_name != display_name:
            # LINE 名稱可能變更，同步更新
            user.display_name = display_name
            user = await self.update(user)
        return user

    async def ban_user(self, user_id: UUID) -> Optional[User]:
        """封鎖使用者"""
        user = await self.get_by_id(user_id)
        if not user:
            return None

        user.is_banned = True
        user.banned_at = datetime.utcnow()
        await self.session.flush()
        return user
```

### OrderRepository

```python
# app/repositories/order_repo.py
class OrderRepository(BaseRepository[Order]):
    """訂單 Repository"""

    def __init__(self, session: AsyncSession):
        super().__init__(Order, session)

    async def get_by_session_and_user(
        self, session_id: UUID, user_id: UUID
    ) -> Optional[Order]:
        """取得使用者在 Session 中的訂單"""
        result = await self.session.execute(
            select(Order)
            .where(Order.session_id == session_id, Order.user_id == user_id)
            .options(selectinload(Order.items))  # 預載入品項
        )
        return result.scalar_one_or_none()

    async def get_session_orders(self, session_id: UUID) -> List[Order]:
        """取得 Session 的所有訂單"""
        result = await self.session.execute(
            select(Order)
            .where(Order.session_id == session_id)
            .options(
                selectinload(Order.items),
                selectinload(Order.user),
            )
        )
        return list(result.scalars().all())

    async def calculate_total(self, order: Order) -> Order:
        """計算訂單總金額"""
        # 直接從 DB 計算，避免 ORM 快取問題
        result = await self.session.execute(
            select(func.coalesce(func.sum(OrderItem.subtotal), 0))
            .where(OrderItem.order_id == order.id)
        )
        order.total_amount = result.scalar()
        return await self.update(order)
```

### GroupRepository：複雜查詢範例

```python
# app/repositories/group_repo.py
class GroupRepository(BaseRepository[Group]):
    """群組 Repository"""

    def __init__(self, session: AsyncSession):
        super().__init__(Group, session)

    async def get_all_paginated(
        self,
        limit: int = 20,
        offset: int = 0,
        search: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Tuple[List[Group], int]:
        """分頁取得群組列表（含搜尋與篩選）"""
        query = select(Group)

        # 動態組合搜尋條件
        if search:
            search_pattern = f"%{search}%"
            query = query.where(
                or_(
                    Group.name.ilike(search_pattern),
                    Group.group_code.ilike(search_pattern),
                    Group.line_group_id.ilike(search_pattern),
                )
            )

        # 狀態篩選
        if status and status != "all":
            query = query.where(Group.status == status)

        # 計算總數（用於分頁）
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_query)).scalar() or 0

        # 取得分頁資料
        query = query.order_by(Group.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(query)
        groups = list(result.scalars().all())

        return groups, total

    async def get_group_with_stats(self, group_id: UUID) -> Optional[dict]:
        """取得群組詳情含統計資訊"""
        group = await self.get_by_id(group_id)
        if not group:
            return None

        # 成員數
        member_count = (await self.session.execute(
            select(func.count(GroupMember.id))
            .where(GroupMember.group_id == group_id)
        )).scalar() or 0

        # 管理員數
        admin_count = (await self.session.execute(
            select(func.count(GroupAdmin.id))
            .where(GroupAdmin.group_id == group_id)
        )).scalar() or 0

        return {
            "group": group,
            "member_count": member_count,
            "admin_count": admin_count,
        }
```

---

## 在 Router 中使用

Repository 透過依賴注入在 Router 中使用：

```python
# app/routers/admin.py
from app.repositories.user_repo import UserRepository
from app.repositories.group_repo import GroupRepository


@router.get("/users")
async def list_users(
    limit: int = 20,
    offset: int = 0,
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """列出使用者（分頁）"""
    repo = UserRepository(db)
    users, total = await repo.get_all_paginated(
        limit=limit, offset=offset, search=search, status=status
    )
    return {
        "items": [user_to_dict(u) for u in users],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """取得使用者詳情"""
    repo = UserRepository(db)
    data = await repo.get_user_with_stats(user_id)
    if not data:
        raise HTTPException(404, "使用者不存在")

    return {
        "user": user_to_dict(data["user"]),
        "group_count": data["group_count"],
        "order_count": data["order_count"],
    }


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """封鎖使用者"""
    repo = UserRepository(db)
    user = await repo.ban_user(user_id)
    if not user:
        raise HTTPException(404, "使用者不存在")

    await db.commit()
    return {"message": "使用者已封鎖"}
```

---

## 多個 Repository 協作

當業務邏輯涉及多個 Repository 時，可以在 Router 或 Service 層協調：

```python
@router.post("/groups/{group_id}/members")
async def add_group_member(
    group_id: UUID,
    line_user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """新增群組成員"""
    # 使用多個 Repository
    group_repo = GroupRepository(db)
    user_repo = UserRepository(db)
    member_repo = GroupMemberRepository(db)

    # 檢查群組存在
    group = await group_repo.get_by_id(group_id)
    if not group:
        raise HTTPException(404, "群組不存在")

    # 取得或建立使用者
    user = await user_repo.get_or_create(line_user_id)

    # 新增成員
    member, is_new = await member_repo.add_member(group_id, user.id)

    # 統一 commit
    await db.commit()

    return {
        "member_id": str(member.id),
        "is_new": is_new,
    }
```

---

## Repository 設計原則

### 1. 一個 Model 對應一個 Repository

```
User       → UserRepository
Order      → OrderRepository
OrderItem  → OrderItemRepository
Group      → GroupRepository
```

### 2. 方法命名要有意義

```python
# 好：描述業務意圖
async def get_active_session(self, group_id: UUID) -> Optional[OrderSession]
async def get_today_stores(self, group_id: UUID) -> List[GroupTodayStore]
async def get_pending_applications(self) -> List[GroupApplication]

# 不好：太通用
async def find(self, **kwargs)
async def query(self, filters: dict)
```

### 3. 回傳值類型明確

```python
# 單一結果：回傳 Optional[Model]
async def get_by_id(self, id: UUID) -> Optional[User]

# 多筆結果：回傳 List[Model]
async def get_session_orders(self, session_id: UUID) -> List[Order]

# 分頁結果：回傳 Tuple[List[Model], int]
async def get_all_paginated(...) -> Tuple[List[Group], int]

# 複合資料：回傳 dict
async def get_user_with_stats(self, user_id: UUID) -> Optional[dict]
```

### 4. 預載入關聯避免 N+1

```python
# 不好：會產生 N+1 查詢
orders = await repo.get_session_orders(session_id)
for order in orders:
    print(order.user.display_name)  # 每次都會查詢 user
    for item in order.items:        # 每次都會查詢 items
        print(item.name)

# 好：使用 selectinload 預載入
async def get_session_orders(self, session_id: UUID) -> List[Order]:
    result = await self.session.execute(
        select(Order)
        .where(Order.session_id == session_id)
        .options(
            selectinload(Order.items),  # 預載入 items
            selectinload(Order.user),   # 預載入 user
        )
    )
    return list(result.scalars().all())
```

---

## jaba-ai 的 Repository 結構

```
app/repositories/
├── base.py           # 基礎類別（BaseRepository）
├── user_repo.py      # UserRepository
├── group_repo.py     # GroupRepository, GroupMemberRepository,
│                     # GroupAdminRepository, GroupApplicationRepository
├── store_repo.py     # StoreRepository, MenuRepository,
│                     # MenuCategoryRepository, MenuItemRepository
├── order_repo.py     # OrderRepository, OrderItemRepository,
│                     # OrderSessionRepository, GroupTodayStoreRepository
├── chat_repo.py      # ChatRepository
└── system_repo.py    # SuperAdminRepository, AiPromptRepository,
                      # SecurityLogRepository, AiLogRepository
```

總計 **18 個 Repository**（不含 BaseRepository），對應 18 個 Models（資料表）。

---

## 優點總結

| 優點 | 說明 |
|------|------|
| **關注點分離** | Router 不需知道 SQL 細節 |
| **程式碼複用** | 同樣的查詢不用重複寫 |
| **容易測試** | 可以 Mock Repository 進行單元測試 |
| **維護方便** | 修改查詢只需改一個地方 |
| **型別安全** | Generic 提供完整的型別提示 |

---

## 下一篇

Repository 只解決了資料存取的問題。當我們需要在資料庫寫入後發送 Socket.IO 通知時，會遇到另一個問題：**通知發送的時機**。

下一篇文章 [事件隊列設計：解決 Socket.IO 與 DB Commit 順序問題]({% post_url 2025-12-21-jaba-ai-part3-event-queue %}) 會說明如何用事件隊列解決這個問題。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
