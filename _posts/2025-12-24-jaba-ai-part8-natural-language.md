---
layout: post
title: "自然語言點餐：從使用者輸入到訂單建立"
subtitle: "如何讓 AI 理解「我也要」、「+1」、「幫小明點」"
date: 2025-12-24
categories: [Jaba AI]
tags: [Python, AI, Claude, 自然語言處理, LINE Bot]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第八篇文章。

jaba-ai 的核心功能是讓使用者用自然語言點餐。這篇文章分享如何設計 AI 對話流程，讓它能理解各種點餐表達方式。

---

## 點餐場景分析

使用者在群組點餐時，可能會用各種方式表達：

| 表達方式 | 範例 | 意圖 |
|---------|------|------|
| 直接點餐 | 「我要雞腿便當」 | 為自己點一份 |
| 多品項 | 「雞腿便當和排骨便當各一」 | 點多個品項 |
| 指定數量 | 「三個雞腿便當」 | 點多份同品項 |
| 加備註 | 「雞腿便當不要辣」 | 點餐加註記 |
| 跟單 | 「+1」「我也要」 | 複製前一人的訂單 |
| 代點 | 「幫小明點雞腿便當」 | 為他人點餐 |
| 修改 | 「把排骨換成雞腿」 | 修改已點品項 |
| 取消 | 「我不要了」 | 取消訂單 |

---

## AI 對話設計

### 系統提示詞

```
你是呷爸點餐助手，負責協助群組成員點餐。

【你的能力】
1. 理解使用者的點餐意圖
2. 從菜單中找到對應的品項
3. 處理備註、數量等細節
4. 執行點餐動作

【回應格式】
必須回傳 JSON：
{
  "message": "回覆使用者的訊息",
  "actions": [
    {"type": "group_create_order", "data": {...}}
  ]
}

【動作類型】
- group_create_order: 建立/新增訂單
- group_update_order: 修改訂單
- group_remove_item: 移除品項
- group_cancel_order: 取消訂單
```

### Context 結構

每次呼叫 AI 時，傳入完整的上下文：

```python
context = {
    "mode": "group_ordering",
    "user_name": "小明",
    "today_stores": [
        {"id": "store-uuid", "name": "好吃便當"}
    ],
    "menus": {
        "store-uuid": {
            "name": "好吃便當",
            "categories": [
                {
                    "name": "主餐",
                    "items": [
                        {"id": "item-1", "name": "雞腿便當", "price": 85},
                        {"id": "item-2", "name": "排骨便當", "price": 80},
                    ]
                }
            ]
        }
    },
    "session_orders": [
        {
            "display_name": "小華",
            "items": [
                {"name": "雞腿便當", "quantity": 1, "price": 85}
            ],
            "total": 85
        }
    ],
    "user_preferences": {
        "preferred_name": "小明",
        "dietary_restrictions": ["不吃辣"]
    }
}
```

![訂單管理介面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/assets-images-jaba-ai-10-admin-order-management.png)
*管理後台的訂單管理介面，顯示群組訂單和呷爸助手對話框*

---

## 對話處理流程

```python
async def _handle_ai_chat(
    self,
    user: User,
    group: Group,
    active_session: Optional[OrderSession],
    text: str,
    reply_token: str,
) -> None:
    """處理 AI 對話"""

    # 1. 記錄使用者訊息
    chat_msg = ChatMessage(
        group_id=group.id,
        user_id=user.id,
        session_id=active_session.id if active_session else None,
        role="user",
        content=text,
    )
    await self.chat_repo.create(chat_msg)

    # 2. 取得系統提示詞
    system_prompt = await self._get_group_system_prompt()

    # 3. 建構上下文
    today_stores = await self.today_store_repo.get_today_stores(group.id)
    menus_context = await self._build_menus_context(today_stores)
    session_orders = await self._build_session_orders(active_session)

    # 4. 取得對話歷史
    history = await self.chat_repo.get_group_messages(
        group.id,
        limit=settings.chat_history_limit,
        session_id=active_session.id if active_session else None,
    )

    # 5. 輸入過濾
    sanitized_text, trigger_reasons = sanitize_user_input(text)
    if trigger_reasons:
        await self._log_security_event(...)
        return  # 可疑內容，不處理

    # 6. 呼叫 AI
    ai_response = await self.ai_service.chat(
        message=sanitized_text,
        system_prompt=system_prompt,
        context={
            "mode": "group_ordering" if active_session else "group_idle",
            "user_name": user.display_name or "使用者",
            "today_stores": [...],
            "menus": menus_context,
            "session_orders": session_orders,
            "user_preferences": user.preferences,
        },
        history=[...],
    )

    # 7. 處理 AI 動作
    actions = ai_response.get("actions", [])
    if actions and active_session:
        action_results = await self._execute_group_actions(
            user, group, active_session, today_stores, actions
        )

    # 8. 回覆使用者
    response_text = ai_response.get("message", "")
    await self.reply_message(reply_token, response_text)
```

---

## 動作執行

### 建立訂單

```python
async def _action_create_order(
    self,
    user: User,
    session: OrderSession,
    today_stores: list,
    data: dict,
) -> dict:
    """建立訂單"""
    items = data.get("items", [])
    if not items:
        return {"success": False, "error": "沒有品項"}

    # 取得或建立使用者訂單
    order = await self.order_repo.get_by_session_and_user(session.id, user.id)

    if not order:
        store_id = today_stores[0].store_id if today_stores else None
        if not store_id:
            return {"success": False, "error": "今日尚未設定店家"}

        order = Order(
            session_id=session.id,
            user_id=user.id,
            store_id=store_id,
        )
        order = await self.order_repo.create(order)

    # 新增品項
    for item_data in items:
        item_name = item_data.get("name", "")
        quantity = item_data.get("quantity", 1)
        note = item_data.get("note", "")

        # 從菜單找價格
        price = await self._find_item_price(today_stores, item_name)

        if price == 0:
            return {"success": False, "error": f"菜單中找不到「{item_name}」"}

        order_item = OrderItem(
            order_id=order.id,
            name=item_name,
            quantity=quantity,
            unit_price=Decimal(str(price)),
            subtotal=Decimal(str(price * quantity)),
            note=note,
        )
        await self.order_item_repo.create(order_item)

    # 重新計算總金額
    await self.order_repo.calculate_total(order)

    return {"success": True, "order_id": str(order.id)}
```

### 移除品項

```python
async def _action_remove_item(
    self,
    user: User,
    session: OrderSession,
    data: dict,
) -> dict:
    """移除品項"""
    item_name = data.get("item_name", "")
    quantity = data.get("quantity", 1)

    order = await self.order_repo.get_by_session_and_user(session.id, user.id)
    if not order:
        return {"success": False, "error": "你目前沒有訂單"}

    # 找到品項
    for item in order.items:
        if item.name == item_name or item_name in item.name:
            if quantity >= item.quantity:
                # 全部移除
                await self.order_item_repo.delete(item)
            else:
                # 減少數量
                item.quantity -= quantity
                item.subtotal = item.unit_price * item.quantity
                await self.order_item_repo.update(item)

            await self.order_repo.calculate_total(order)
            return {"success": True}

    return {"success": False, "error": f"找不到品項「{item_name}」"}
```

### 取消訂單

```python
async def _action_cancel_order(
    self,
    user: User,
    session: OrderSession,
) -> dict:
    """取消訂單"""
    order = await self.order_repo.get_by_session_and_user(session.id, user.id)
    if not order:
        return {"success": False, "error": "你目前沒有訂單"}

    # 刪除所有品項
    for item in order.items:
        await self.order_item_repo.delete(item)

    # 刪除訂單
    await self.order_repo.delete(order)

    return {"success": True}
```

---

## 跟單功能

跟單是最常用的功能之一。AI 需要：

1. 理解「+1」、「我也要」等表達
2. 找到前一個人的訂單
3. 複製品項給當前使用者

### AI 處理方式

在 system prompt 中說明：

```
【跟單處理】
當使用者說「+1」、「我也要」、「同上」時：
1. 查看 session_orders 中最後一筆訂單
2. 複製該訂單的品項給當前使用者
3. 如果使用者有額外指定，如「+1 不要辣」，需要加上備註
```

### Context 中的訂單資訊

```python
"session_orders": [
    {
        "display_name": "小華",
        "items": [
            {"name": "雞腿便當", "quantity": 1, "price": 85}
        ],
        "total": 85
    },
    {
        "display_name": "小明",
        "items": [
            {"name": "排骨便當", "quantity": 1, "price": 80}
        ],
        "total": 80
    }
]
```

AI 可以看到所有人的訂單，知道「最後一個人點了什麼」。

---

## 代點功能

代點需要處理「目標對象」的識別：

| 表達 | 目標 |
|------|------|
| 「幫小明點」 | 名字 |
| 「幫老闆點」 | 稱呼 |
| 「幫樓上的點」 | 描述 |

### AI 處理方式

在 system prompt 中說明：

```
【代點處理】
當使用者說「幫 XXX 點」時：
1. 建立訂單時，在備註中標記「代點: XXX」
2. 或者如果系統支援，可以指定 target_user_name
```

### 動作格式

```json
{
  "type": "group_create_order",
  "data": {
    "items": [
      {"name": "雞腿便當", "quantity": 1, "note": "代點: 小明"}
    ]
  }
}
```

---

## 對話歷史的重要性

對話歷史讓 AI 能理解上下文：

```
小華: 我要雞腿便當
AI: 好的，已為小華點了雞腿便當 $85

小明: 我也要
AI: 好的，已為小明點了雞腿便當 $85（跟小華一樣）

小明: 再加一個排骨
AI: 好的，已新增排骨便當 $80，小明目前共 $165
```

### 歷史格式

```python
history = [
    {"role": "user", "name": "小華", "content": "我要雞腿便當"},
    {"role": "assistant", "name": "呷爸", "content": "好的，已為小華點了雞腿便當 $85"},
    {"role": "user", "name": "小明", "content": "我也要"},
]
```

---

## 價格查找

從菜單中找到品項價格：

```python
async def _find_item_price(
    self,
    today_stores: list,
    item_name: str,
    category: Optional[str] = None,
) -> float:
    """從菜單找品項價格"""
    for ts in today_stores:
        store = ts.store
        if not store:
            continue

        result = await self.session.execute(
            select(Menu)
            .where(Menu.store_id == store.id)
            .options(
                selectinload(Menu.categories).selectinload(MenuCategory.items)
            )
        )
        menu = result.scalar_one_or_none()

        if not menu:
            continue

        for cat in menu.categories:
            # 如果有指定類別，先匹配類別
            if category and cat.name != category:
                continue

            for item in cat.items:
                # 精確匹配或模糊匹配
                if item.name == item_name or item_name in item.name:
                    return float(item.price)

    return 0  # 找不到
```

---

## 訂單摘要

每次訂單變動後，產生摘要：

```python
async def _get_session_summary_by_id(self, session_id: UUID) -> str:
    """產生點餐摘要"""
    session = await self.session_repo.get_with_orders(session_id)
    if not session or not session.orders:
        return "📋 本次點餐沒有任何訂單"

    lines = ["📋 點餐摘要", ""]
    grand_total = Decimal(0)
    item_counts = {}

    for order in session.orders:
        user_name = order.user.display_name if order.user else "未知"
        user_total = int(order.total_amount)

        lines.append(f"👤 {user_name}（${user_total}）")

        for item in order.items:
            item_text = f"  • {item.name}"
            if item.note:
                item_text += f"（{item.note}）"
            if item.quantity > 1:
                item_text += f" x{item.quantity}"
            item_text += f" ${int(item.subtotal)}"
            lines.append(item_text)

            # 統計
            item_counts[item.name] = item_counts.get(item.name, 0) + item.quantity

        lines.append("")
        grand_total += order.total_amount

    # 品項統計
    lines.append("📦 品項統計")
    for name, count in sorted(item_counts.items(), key=lambda x: -x[1]):
        lines.append(f"  • {name} x{count}")

    lines.append("")
    lines.append(f"💰 總金額：${int(grand_total)}")
    lines.append(f"👥 共 {len(session.orders)} 人點餐")

    return "\n".join(lines)
```

輸出範例：

```
📋 點餐摘要

👤 小華（$85）
  • 雞腿便當 $85

👤 小明（$165）
  • 雞腿便當 $85
  • 排骨便當 $80

📦 品項統計
  • 雞腿便當 x2
  • 排骨便當 x1

💰 總金額：$250
👥 共 2 人點餐
```

---

## 邊界情況處理

### 品項不在菜單中

```python
price = await self._find_item_price(today_stores, item_name)
if price == 0:
    return {"success": False, "error": f"菜單中找不到「{item_name}」"}
```

AI 回覆：「抱歉，菜單中找不到「炒飯」，請確認品項名稱。」

### 重複點餐

```python
# 檢查是否已有相同品項
for existing in order.items:
    if existing.name == item_name:
        # 累加數量而非新增
        existing.quantity += quantity
        existing.subtotal = existing.unit_price * existing.quantity
        return {"success": True}
```

### 沒有進行中的點餐

在 `_should_respond_in_group()` 中檢查：

```python
if not is_ordering:
    # 非點餐中只回應特定關鍵字
    return text in ["開單", "菜單", "jaba", "呷爸"]
```

---

## 總結

自然語言點餐的實作要點：

| 項目 | 說明 |
|------|------|
| 完整上下文 | 傳入店家、菜單、現有訂單、使用者偏好 |
| 對話歷史 | 讓 AI 理解「我也要」的指代 |
| 動作格式 | 定義清晰的 action type 和 data 結構 |
| 價格查找 | 從菜單中匹配品項取得價格 |
| 訂單摘要 | 每次變動後顯示完整摘要 |
| 錯誤處理 | 品項不存在、訂單不存在等情況 |

---

## 下一篇

下一篇文章會介紹菜單圖片辨識：[菜單圖片 AI 辨識：上傳照片自動建立菜單]({% post_url 2025-12-24-jaba-ai-part9-menu-ocr %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
