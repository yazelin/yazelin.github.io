---
layout: post
title: "專案發包期程管理功能實作"
subtitle: "追蹤廠商、料件、交貨日期的完整解決方案"
date: 2026-01-09
categories: [ChingTech OS]
tags: [專案管理, MCP, FastMCP, Python, ChingTech OS]
---

![專案發包期程管理功能實作](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-09-delivery-schedule.png)

## 前言

在製造業專案中，**發包期程管理**是非常重要的功能。專案經理需要追蹤：

- 哪些料件發包給哪個廠商？
- 預計什麼時候交貨？
- 實際到貨日期是什麼時候？
- 目前狀態如何？

這篇介紹如何在 [專案管理資料模型]({% post_url 2026-01-08-project-data-model %}) 的基礎上，實作發包期程的 MCP 工具，讓用戶可以透過對話管理發包進度。

---

## 資料表設計

```sql
CREATE TABLE project_delivery_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor VARCHAR(128) NOT NULL,          -- 廠商名稱
    item VARCHAR(256) NOT NULL,            -- 料件名稱
    quantity VARCHAR(64),                  -- 數量（含單位）
    order_date DATE,                       -- 發包日期
    expected_delivery_date DATE,           -- 預計交貨日期
    actual_delivery_date DATE,             -- 實際到貨日期
    status VARCHAR(32) DEFAULT 'pending',  -- 狀態
    notes TEXT,                            -- 備註
    created_by VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_delivery_project ON project_delivery_schedules(project_id);
CREATE INDEX idx_delivery_status ON project_delivery_schedules(status);
CREATE INDEX idx_delivery_vendor ON project_delivery_schedules(vendor);
```

### 狀態定義

| 狀態 | 說明 | 使用時機 |
|------|------|----------|
| `pending` | 待發包 | 尚未下單 |
| `ordered` | 已發包 | 已下單，等待交貨 |
| `delivered` | 已到貨 | 貨物已到 |
| `completed` | 已完成 | 驗收完成 |

### Pydantic Model

```python
class DeliveryScheduleBase(BaseModel):
    """發包/交貨期程基礎欄位"""
    vendor: str                                    # 廠商名稱
    item: str                                      # 料件名稱
    quantity: str | None = None                    # 數量（含單位）
    order_date: date | None = None                 # 發包日期
    expected_delivery_date: date | None = None     # 預計交貨日期
    actual_delivery_date: date | None = None       # 實際到貨日期
    status: str = "pending"                        # 狀態
    notes: str | None = None                       # 備註
```

---

## MCP 工具實作

### 新增發包記錄

```python
@mcp.tool()
async def add_delivery_schedule(
    project_id: str,
    vendor: str,
    item: str,
    quantity: str | None = None,
    order_date: str | None = None,
    expected_delivery_date: str | None = None,
    status: str = "pending",
    notes: str | None = None,
) -> str:
    """
    新增專案發包/交貨記錄

    Args:
        project_id: 專案 UUID
        vendor: 廠商名稱（必填）
        item: 料件名稱（必填）
        quantity: 數量（含單位，如「2 台」）
        order_date: 發包日期（格式: YYYY-MM-DD）
        expected_delivery_date: 預計交貨日期（格式: YYYY-MM-DD）
        status: 狀態（pending/ordered/delivered/completed）
        notes: 備註
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 驗證專案存在
        project = await conn.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1",
            project_id,
        )
        if not project:
            return f"錯誤：找不到專案 {project_id}"

        # 解析日期
        parsed_order_date = None
        parsed_expected_date = None

        if order_date:
            try:
                parsed_order_date = date.fromisoformat(order_date)
            except ValueError:
                return "錯誤：發包日期格式錯誤，請使用 YYYY-MM-DD 格式"

        if expected_delivery_date:
            try:
                parsed_expected_date = date.fromisoformat(expected_delivery_date)
            except ValueError:
                return "錯誤：預計交貨日期格式錯誤"

        # 驗證狀態
        valid_statuses = ["pending", "ordered", "delivered", "completed"]
        if status not in valid_statuses:
            return f"錯誤：狀態必須是 {', '.join(valid_statuses)} 其中之一"

        # 新增記錄
        row = await conn.fetchrow(
            """
            INSERT INTO project_delivery_schedules
                (project_id, vendor, item, quantity, order_date,
                 expected_delivery_date, status, notes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AI')
            RETURNING id, vendor, item
            """,
            project_id, vendor, item, quantity,
            parsed_order_date, parsed_expected_date, status, notes,
        )

        return f"✅ 已新增發包記錄：【{vendor}】{item}"
```

### 使用情境

```
用戶：水切爐專案要發包一個加熱器給亦達，預計 1/20 交貨

AI：（調用 add_delivery_schedule）
AI：✅ 已新增發包記錄：【亦達】加熱器
    預計交貨：2026-01-20
    狀態：待發包
```

---

### 更新發包記錄

更新支援兩種匹配方式：直接用 ID，或用廠商 + 料件名稱模糊匹配。

```python
@mcp.tool()
async def update_delivery_schedule(
    project_id: str,
    delivery_id: str | None = None,
    vendor: str | None = None,
    item: str | None = None,
    new_vendor: str | None = None,
    new_item: str | None = None,
    new_quantity: str | None = None,
    new_status: str | None = None,
    order_date: str | None = None,
    actual_delivery_date: str | None = None,
    expected_delivery_date: str | None = None,
    new_notes: str | None = None,
) -> str:
    """
    更新專案發包/交貨記錄

    Args:
        project_id: 專案 UUID
        delivery_id: 發包記錄 UUID（直接指定）
        vendor: 廠商名稱（用於匹配記錄）
        item: 料件名稱（用於匹配記錄）
        new_status: 新狀態
        actual_delivery_date: 實際到貨日期
        ... 其他更新欄位
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 驗證專案存在
        project = await conn.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1", project_id
        )
        if not project:
            return f"錯誤：找不到專案 {project_id}"

        # 找到目標記錄
        if delivery_id:
            # 直接用 ID
            row = await conn.fetchrow(
                "SELECT * FROM project_delivery_schedules WHERE id = $1 AND project_id = $2",
                delivery_id, project_id,
            )
            if not row:
                return f"錯誤：找不到發包記錄 {delivery_id}"
            matches = [row]

        elif vendor and item:
            # 用廠商 + 料件模糊匹配
            matches = await conn.fetch(
                """
                SELECT * FROM project_delivery_schedules
                WHERE project_id = $1 AND vendor ILIKE $2 AND item ILIKE $3
                """,
                project_id, f"%{vendor}%", f"%{item}%",
            )
            if not matches:
                return f"錯誤：找不到匹配的發包記錄（廠商：{vendor}，料件：{item}）"

            if len(matches) > 1:
                # 多筆匹配，列出供選擇
                result = f"找到 {len(matches)} 筆匹配記錄，請更精確指定：\n"
                for m in matches:
                    result += f"- {m['vendor']} - {m['item']}（ID: {m['id']}）\n"
                return result
        else:
            return "錯誤：請提供 delivery_id 或 vendor + item"

        # 執行更新...
        target = matches[0]
        # 建立 UPDATE SQL 動態更新有值的欄位
        # ...

        return f"✅ 已更新發包記錄：【{target['vendor']}】{target['item']}"
```

### 使用情境

```
用戶：亦達的加熱器今天到貨了

AI：（調用 update_delivery_schedule，vendor="亦達"，item="加熱器"）
AI：✅ 已更新發包記錄：【亦達】加熱器
    實際到貨：2026-01-18
    狀態：已到貨
```

---

### 查詢發包記錄

```python
@mcp.tool()
async def get_delivery_schedules(
    project_id: str,
    status: str | None = None,
    vendor: str | None = None,
    limit: int = 20,
) -> str:
    """
    取得專案的發包/交貨記錄

    Args:
        project_id: 專案 UUID
        status: 狀態過濾（pending/ordered/delivered/completed）
        vendor: 廠商過濾
        limit: 最大數量，預設 20
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 驗證專案存在
        project = await conn.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1", project_id
        )
        if not project:
            return f"錯誤：找不到專案 {project_id}"

        # 建立查詢
        sql = "SELECT * FROM project_delivery_schedules WHERE project_id = $1"
        params = [project_id]

        if status:
            sql += " AND status = $2"
            params.append(status)

        if vendor:
            sql += f" AND vendor ILIKE ${len(params) + 1}"
            params.append(f"%{vendor}%")

        sql += " ORDER BY COALESCE(expected_delivery_date, '9999-12-31'), created_at"
        sql += f" LIMIT ${len(params) + 1}"
        params.append(limit)

        rows = await conn.fetch(sql, *params)

        if not rows:
            return f"專案「{project['name']}」目前沒有發包記錄"

        # 格式化輸出
        status_names = {
            "pending": "待發包",
            "ordered": "已發包",
            "delivered": "已到貨",
            "completed": "已完成",
        }

        result = f"📦 {project['name']} 的發包記錄（共 {len(rows)} 筆）：\n\n"

        for r in rows:
            status_display = status_names.get(r["status"], r["status"])
            result += f"【{r['vendor']}】{r['item']}\n"
            if r["quantity"]:
                result += f"  數量：{r['quantity']}\n"
            if r["order_date"]:
                result += f"  發包日：{r['order_date']}\n"
            if r["expected_delivery_date"]:
                result += f"  預計交貨：{r['expected_delivery_date']}\n"
            if r["actual_delivery_date"]:
                result += f"  實際到貨：{r['actual_delivery_date']}\n"
            result += f"  狀態：{status_display}\n\n"

        return result
```

### 使用情境

```
用戶：水切爐專案的發包進度如何？

AI：（調用 get_delivery_schedules）
AI：📦 水切爐改善 的發包記錄（共 3 筆）：

    【亦達】加熱器
      數量：2 台
      預計交貨：2026-01-20
      狀態：待發包

    【金豐】鋼板
      數量：10 片
      發包日：2025-12-15
      預計交貨：2026-01-10
      狀態：已發包

    【東元】馬達
      數量：1 台
      發包日：2025-12-01
      預計交貨：2025-12-20
      實際到貨：2025-12-18
      狀態：已到貨
```

---

## 進階查詢

### 按狀態過濾

```
用戶：有哪些還沒到的？

AI：（調用 get_delivery_schedules，status="ordered"）
AI：📦 水切爐改善 - 已發包待交貨（共 1 筆）：

    【金豐】鋼板
      預計交貨：2026-01-10
      狀態：已發包
```

### 按廠商過濾

```
用戶：亦達的東西都發包了嗎？

AI：（調用 get_delivery_schedules，vendor="亦達"）
AI：📦 水切爐改善 - 亦達相關（共 1 筆）：

    【亦達】加熱器
      數量：2 台
      預計交貨：2026-01-20
      狀態：待發包

    還有 1 筆待發包
```

---

## 工作流程

典型的發包追蹤流程：

```
1. 待發包 (pending)
   ├── 新增發包記錄
   └── 填寫廠商、料件、預計交貨日

2. 已發包 (ordered)
   ├── 更新狀態為 ordered
   └── 填寫發包日期

3. 已到貨 (delivered)
   ├── 更新狀態為 delivered
   └── 填寫實際到貨日期

4. 已完成 (completed)
   └── 驗收完成，更新狀態
```

### 對話範例

```
用戶：金豐的鋼板今天下單了

AI：（調用 update_delivery_schedule）
AI：✅ 已更新發包記錄：【金豐】鋼板
    發包日：2026-01-05
    狀態：已發包

---

用戶：鋼板到了

AI：（調用 update_delivery_schedule）
AI：✅ 已更新發包記錄：【金豐】鋼板
    實際到貨：2026-01-09
    狀態：已到貨
```

---

## 小結

發包期程管理功能包含：

| 工具 | 功能 |
|------|------|
| `add_delivery_schedule` | 新增發包記錄 |
| `update_delivery_schedule` | 更新記錄（支援模糊匹配） |
| `get_delivery_schedules` | 查詢記錄（支援過濾） |

關鍵設計：

- **模糊匹配**：不需記住 UUID，用廠商 + 料件名稱即可更新
- **狀態追蹤**：pending → ordered → delivered → completed
- **日期管理**：發包日、預計交貨、實際到貨

下一篇 [專案附件與連結管理]({% post_url 2026-01-10-project-attachments %}) 會介紹如何管理專案相關的檔案和連結。

---

## 參考資源

- [專案管理資料模型]({% post_url 2026-01-08-project-data-model %})
- [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %})
- [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})
