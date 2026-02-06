---
layout: post
title: "ChingTech OS：庫存管理功能開發"
subtitle: "從物料主檔到進出貨追蹤，為內部系統打造完整庫存模組"
date: 2026-01-16
categories: [ChingTech OS]
tags: [ChingTech OS, 庫存管理, 廠商管理, ERP, Python, FastAPI]
---

## 前言

在製造業的日常運作中，**庫存管理**是一個繞不開的核心需求。工廠裡的 PLC、馬達、鋼板、螺絲，每一項物料都需要知道：

- 現在還有多少庫存？
- 放在哪個儲位？
- 最近進了多少、出了多少？
- 庫存快不夠了，該跟哪家廠商訂？

過去這些資訊散落在 Excel 表格和人腦記憶中。這篇文章介紹如何在 ChingTech OS 中實作一套**庫存管理模組**，涵蓋物料主檔、進出貨記錄、訂購追蹤、廠商管理，並透過 MCP 工具讓 AI 助手也能查詢和操作庫存。

---

## 整體架構

庫存管理模組由四個核心資料表組成，彼此透過外鍵關聯：

```
┌─────────────────────┐
│   inventory_items   │
│     （物料主檔）      │
└──────────┬──────────┘
           │
     ┌─────┼──────────────────┐
     │     │                  │
     ▼     ▼                  ▼
┌──────────────┐  ┌───────────────┐  ┌──────────────┐
│ inventory_   │  │ inventory_    │  │   vendors    │
│ transactions │  │ orders        │  │  （廠商主檔） │
│ （進出貨記錄） │  │ （訂購記錄）   │  └──────────────┘
└──────────────┘  └───────────────┘
       │                  │
       ▼                  ▼
┌──────────────┐  ┌───────────────┐
│   projects   │  │   projects    │
│ （關聯專案）   │  │ （關聯專案）    │
└──────────────┘  └───────────────┘
```

每張表各司其職：

| 資料表 | 用途 |
|--------|------|
| `inventory_items` | 物料基本資訊、目前庫存、最低庫存 |
| `inventory_transactions` | 每筆進貨/出貨的明細記錄 |
| `inventory_orders` | 訂購單追蹤（待下單→已下單→已交貨） |
| `vendors` | 廠商聯絡資訊、ERP 編號 |

---

## 物料主檔設計

### 資料表

```sql
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(256) NOT NULL,          -- 物料名稱
    model VARCHAR(128),                  -- 型號
    specification TEXT,                  -- 規格
    unit VARCHAR(32),                    -- 單位（個、台、公斤）
    category VARCHAR(64),               -- 類別
    default_vendor VARCHAR(128),        -- 預設廠商
    storage_location VARCHAR(128),      -- 存放庫位
    current_stock NUMERIC DEFAULT 0,    -- 目前庫存（由觸發器自動計算）
    min_stock NUMERIC DEFAULT 0,        -- 最低庫存量
    notes TEXT,
    created_by VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

這裡有幾個設計要點：

**`current_stock` 由觸發器自動維護**：不需要手動更新庫存數量，每當 `inventory_transactions` 有新增或刪除，觸發器會自動重新計算。

**`min_stock` 搭配低庫存警示**：當 `current_stock < min_stock` 時，系統會標記該物料為「庫存不足」。

**`storage_location` 儲位管理**：對應工廠實際的倉庫位置，例如「A 棟 - 3F - 架位 C2」。

### 庫存自動計算觸發器

```sql
CREATE FUNCTION update_inventory_current_stock() RETURNS trigger AS $$
BEGIN
    -- INSERT 或 UPDATE 時，更新新物料的庫存
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE inventory_items
        SET current_stock = (
            SELECT COALESCE(
                SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END),
                0
            )
            FROM inventory_transactions
            WHERE item_id = NEW.item_id
        )
        WHERE id = NEW.item_id;
    END IF;

    -- DELETE 或 UPDATE 且 item_id 變更時，更新舊物料的庫存
    IF (TG_OP = 'DELETE' OR
        (TG_OP = 'UPDATE' AND NEW.item_id <> OLD.item_id)) THEN
        UPDATE inventory_items
        SET current_stock = (
            SELECT COALESCE(
                SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END),
                0
            )
            FROM inventory_transactions
            WHERE item_id = OLD.item_id
        )
        WHERE id = OLD.item_id;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD;
    ELSE RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

這個觸發器的好處是：**不管從哪裡新增交易記錄（API、直接 SQL、MCP 工具），庫存都會自動正確。** 不需要在應用層維護一致性。

### Pydantic Model

```python
class InventoryItemBase(BaseModel):
    """物料基礎欄位"""
    name: str = Field(..., description="物料名稱")
    model: str | None = Field(None, description="型號")
    specification: str | None = Field(None, description="規格")
    unit: str | None = Field(None, description="單位（如：個、台、公斤）")
    category: str | None = Field(None, description="類別")
    default_vendor: str | None = Field(None, description="預設廠商")
    storage_location: str | None = Field(None, description="存放庫位")
    min_stock: Decimal | None = Field(Decimal("0"), description="最低庫存量")
    notes: str | None = Field(None, description="備註")
```

回應模型額外包含計算欄位：

```python
class InventoryItemResponse(InventoryItemBase):
    """物料回應"""
    id: UUID
    current_stock: Decimal = Field(Decimal("0"), description="目前庫存")
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None
    is_low_stock: bool = Field(False, description="是否庫存不足")
```

`is_low_stock` 在服務層透過一個簡單的輔助函數計算：

```python
def calculate_is_low_stock(
    current_stock: Decimal | None,
    min_stock: Decimal | None,
) -> bool:
    """計算是否庫存不足"""
    if current_stock is None or min_stock is None:
        return False
    return current_stock < min_stock
```

---

## 進出貨記錄

### 資料模型

每一筆庫存異動都記錄為一筆交易（transaction），分為 `in`（進貨）和 `out`（出貨）兩種類型：

```python
class TransactionType(str, Enum):
    """交易類型"""
    IN = "in"    # 進貨
    OUT = "out"  # 出貨


class InventoryTransactionBase(BaseModel):
    """進出貨記錄基礎欄位"""
    type: TransactionType = Field(..., description="類型：in / out")
    quantity: Decimal = Field(..., description="數量")
    transaction_date: date = Field(
        default_factory=date.today, description="進出貨日期"
    )
    vendor: str | None = Field(None, description="廠商")
    project_id: UUID | None = Field(None, description="關聯專案")
    notes: str | None = Field(None, description="備註")
```

設計上有兩個重要的關聯欄位：

- **`vendor`**：記錄這批貨是從哪個廠商進的，或出給誰
- **`project_id`**：關聯到專案管理模組，追蹤某個專案用了多少物料

### 服務層實作

建立進出貨記錄時，會進行多項驗證：

```python
async def create_inventory_transaction(
    item_id: UUID,
    data: InventoryTransactionCreate,
    created_by: str | None = None,
) -> InventoryTransactionResponse:
    """建立進出貨記錄"""
    async with get_connection() as conn:
        # 1. 檢查物料是否存在
        item = await conn.fetchrow(
            "SELECT id, current_stock FROM inventory_items WHERE id = $1",
            item_id,
        )
        if not item:
            raise InventoryItemNotFoundError(f"物料 {item_id} 不存在")

        # 2. 驗證專案是否存在（如果有指定）
        if data.project_id:
            project = await conn.fetchrow(
                "SELECT id FROM projects WHERE id = $1",
                data.project_id,
            )
            if not project:
                raise InventoryError(f"專案 {data.project_id} 不存在")

        # 3. 新增記錄（觸發器會自動更新 current_stock）
        row = await conn.fetchrow(
            """
            INSERT INTO inventory_transactions (
                item_id, type, quantity, transaction_date,
                vendor, project_id, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            item_id, data.type.value, data.quantity,
            data.transaction_date or date.today(),
            data.vendor, data.project_id, data.notes, created_by,
        )

        return InventoryTransactionResponse(...)
```

查詢時支援關聯專案名稱的 JOIN：

```python
async def list_inventory_transactions(
    item_id: UUID,
    limit: int = 50,
) -> InventoryTransactionListResponse:
    """列出物料的進出貨記錄"""
    async with get_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT
                t.*, p.name as project_name
            FROM inventory_transactions t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.item_id = $1
            ORDER BY t.transaction_date DESC, t.created_at DESC
            LIMIT $2
            """,
            item_id, limit,
        )
        # ...
```

---

## 訂購記錄

除了進出貨的歷史記錄，系統也支援**訂購單的生命週期追蹤**：

```python
class OrderStatus(str, Enum):
    """訂購狀態"""
    PENDING = "pending"       # 待下單
    ORDERED = "ordered"       # 已下單
    DELIVERED = "delivered"   # 已交貨
    CANCELLED = "cancelled"   # 已取消
```

訂購記錄的欄位比進出貨記錄更豐富，包含預計交貨日和實際交貨日：

```python
class InventoryOrderBase(BaseModel):
    """訂購記錄基礎欄位"""
    order_quantity: Decimal = Field(..., description="訂購數量")
    order_date: date | None = Field(None, description="下單日期")
    expected_delivery_date: date | None = Field(None, description="預計交貨日期")
    vendor: str | None = Field(None, description="訂購廠商")
    project_id: UUID | None = Field(None, description="關聯專案")
    notes: str | None = Field(None, description="備註")
```

回應模型包含完整的關聯資訊：

```python
class InventoryOrderResponse(InventoryOrderBase):
    """訂購記錄回應"""
    id: UUID
    item_id: UUID
    actual_delivery_date: date | None = None
    status: OrderStatus = OrderStatus.PENDING
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None
    # 關聯資訊
    item_name: str | None = None
    project_name: str | None = None
```

### 訂購流程

```
待下單 (pending) ──→ 已下單 (ordered) ──→ 已交貨 (delivered)
                                              │
                                              ▼
                                        建立進貨記錄
                                     （inventory_transaction）
```

當訂購狀態更新為 `delivered` 時，可以同步建立一筆進貨交易記錄，讓庫存自動增加。

---

## 廠商管理

### 資料模型

廠商是庫存管理中的重要關聯實體。廠商主檔包含完整的商務資訊：

```python
class VendorBase(BaseModel):
    """廠商基礎欄位"""
    erp_code: str | None = None      # ERP 系統廠商編號
    name: str                         # 廠商名稱
    short_name: str | None = None     # 簡稱
    contact_person: str | None = None # 聯絡人
    phone: str | None = None          # 電話
    fax: str | None = None            # 傳真
    email: str | None = None          # Email
    address: str | None = None        # 地址
    tax_id: str | None = None         # 統一編號
    payment_terms: str | None = None  # 付款條件
    notes: str | None = None          # 備註
```

### ERP 整合

廠商模型中的 `erp_code` 是連接外部 ERP 系統的關鍵欄位。在實務中，公司往往已經有一套 ERP 系統（例如 ERPNext）在運作，裡面有既有的廠商編號體系。ChingTech OS 的廠商主檔透過 `erp_code` 與 ERP 系統對應，實現：

- **單一來源查詢**：在 ChingTech OS 查詢廠商時，可以同時顯示 ERP 編號
- **跨系統關聯**：發包期程的廠商欄位可以 JOIN 廠商主檔，自動帶出 ERP 編號和聯絡資訊
- **資料同步**：未來可透過 ERP API 自動同步廠商資料

```python
async def get_vendor_by_erp_code(erp_code: str) -> VendorResponse | None:
    """依 ERP 編號取得廠商"""
    async with get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM vendors WHERE erp_code = $1", erp_code,
        )
        if not row:
            return None
        return VendorResponse(**dict(row))
```

### 與專案發包的整合

廠商主檔不只服務庫存模組，也與[專案發包期程]({% post_url 2026-01-09-delivery-schedule %})深度整合。發包記錄可以透過 `vendor_id` 外鍵關聯到廠商主檔：

```sql
SELECT
    d.*,
    v.name as vendor_name,
    v.erp_code as vendor_erp_code,
    i.name as item_name
FROM project_delivery_schedules d
LEFT JOIN vendors v ON d.vendor_id = v.id
LEFT JOIN inventory_items i ON d.item_id = i.id
WHERE d.project_id = $1
```

建立發包記錄時，如果提供了 `vendor_id`，系統會自動查詢廠商名稱填入：

```python
# 處理廠商：若提供 vendor_id 則自動查詢廠商名稱
vendor = data.vendor
vendor_id = data.vendor_id
if vendor_id and not vendor:
    vendor_row = await conn.fetchrow(
        "SELECT name FROM vendors WHERE id = $1", vendor_id
    )
    if vendor_row:
        vendor = vendor_row["name"]
```

### 廠商軟刪除

廠商不使用硬刪除，而是透過 `is_active` 欄位進行軟刪除。停用的廠商不會出現在預設查詢結果中，但歷史記錄仍然可以正確顯示：

```python
async def deactivate_vendor(vendor_id: UUID) -> VendorResponse:
    """停用廠商（軟刪除）"""
    async with get_connection() as conn:
        row = await conn.fetchrow(
            "UPDATE vendors SET is_active = false "
            "WHERE id = $1 RETURNING *",
            vendor_id,
        )
        if not row:
            raise VendorNotFoundError(f"廠商 {vendor_id} 不存在")
        return VendorResponse(**dict(row))
```

---

## API 設計

庫存模組的 API 遵循 RESTful 風格，提供完整的 CRUD 操作：

### 物料主檔 API

| 方法 | 路由 | 說明 |
|------|------|------|
| `GET` | `/api/inventory/items` | 列出物料（支援搜尋、分類、廠商篩選） |
| `GET` | `/api/inventory/items/{id}` | 取得物料詳情 |
| `POST` | `/api/inventory/items` | 建立物料 |
| `PUT` | `/api/inventory/items/{id}` | 更新物料 |
| `DELETE` | `/api/inventory/items/{id}` | 刪除物料 |
| `GET` | `/api/inventory/categories` | 取得所有類別 |
| `GET` | `/api/inventory/low-stock-count` | 取得庫存不足數量 |

### 進出貨記錄 API

| 方法 | 路由 | 說明 |
|------|------|------|
| `GET` | `/api/inventory/items/{id}/transactions` | 列出進出貨記錄 |
| `POST` | `/api/inventory/items/{id}/transactions` | 新增進出貨記錄 |
| `DELETE` | `/api/inventory/transactions/{id}` | 刪除進出貨記錄 |

### 訂購記錄 API

| 方法 | 路由 | 說明 |
|------|------|------|
| `GET` | `/api/inventory/orders` | 列出訂購記錄（支援狀態篩選） |
| `GET` | `/api/inventory/orders/{id}` | 取得訂購詳情 |
| `POST` | `/api/inventory/items/{id}/orders` | 建立訂購記錄 |
| `PUT` | `/api/inventory/orders/{id}` | 更新訂購記錄 |
| `DELETE` | `/api/inventory/orders/{id}` | 刪除訂購記錄 |

### 廠商 API

| 方法 | 路由 | 說明 |
|------|------|------|
| `GET` | `/api/vendors` | 列出廠商（支援搜尋、啟用狀態篩選） |
| `GET` | `/api/vendors/{id}` | 取得廠商詳情 |
| `POST` | `/api/vendors` | 新增廠商 |
| `PUT` | `/api/vendors/{id}` | 更新廠商 |
| `POST` | `/api/vendors/{id}/deactivate` | 停用廠商 |
| `POST` | `/api/vendors/{id}/activate` | 啟用廠商 |

### 模糊搜尋設計

物料查詢支援**正規化搜尋**，讓使用者不需要記住精確的型號格式：

```python
async def list_inventory_items(
    query: str | None = None,
    category: str | None = None,
    vendor: str | None = None,
    low_stock: bool = False,
) -> InventoryItemListResponse:
    # 正規化搜尋：移除連字符和空格後再比較
    # 讓 "kv7500" 可以匹配到 "PLC KV-7500"
    normalized_query = query.replace('-', '').replace(' ', '').lower()
    sql += """ AND (
        REPLACE(REPLACE(LOWER(name), '-', ''), ' ', '') LIKE $1
        OR REPLACE(REPLACE(LOWER(COALESCE(model, '')), '-', ''), ' ', '') LIKE $1
        OR REPLACE(REPLACE(LOWER(COALESCE(specification, '')), '-', ''), ' ', '') LIKE $1
    )"""
```

這個設計讓搜尋更直覺：搜尋 `kv7500` 就能找到型號為 `KV-7500` 的 PLC，搜尋 `東元` 就能找到預設廠商含「東元」的物料。

---

## MCP 工具暴露

庫存模組最強大的地方，在於透過 MCP（Model Context Protocol）工具暴露給 AI 助手。使用者可以用自然語言查詢和操作庫存。

### MCP 輔助函數

為了讓 MCP 工具更好用，服務層提供了模糊查詢的輔助函數：

```python
class ItemLookupResult:
    """物料查詢結果"""
    def __init__(self, item=None, error=None, candidates=None):
        self.item = item
        self.error = error
        self.candidates = candidates

    @property
    def found(self) -> bool:
        return self.item is not None

    @property
    def has_multiple(self) -> bool:
        return self.candidates is not None and len(self.candidates) > 1


async def find_item_by_id_or_name(
    item_id: str | None = None,
    item_name: str | None = None,
    include_stock: bool = False,
) -> ItemLookupResult:
    """依 ID 或名稱查詢物料（模糊匹配）"""
    if not item_id and not item_name:
        return ItemLookupResult(error="請提供物料 ID 或物料名稱")

    async with get_connection() as conn:
        if item_id:
            # 精確 ID 查詢
            row = await conn.fetchrow(
                f"SELECT {columns} FROM inventory_items WHERE id = $1",
                UUID(item_id),
            )
            if not row:
                return ItemLookupResult(error=f"找不到物料 ID: {item_id}")
            return ItemLookupResult(item=dict(row))
        else:
            # 模糊名稱匹配
            rows = await conn.fetch(
                f"""
                SELECT {columns} FROM inventory_items
                WHERE name ILIKE $1
                ORDER BY
                    CASE WHEN name = $2 THEN 0 ELSE 1 END,
                    name
                LIMIT 5
                """,
                f"%{item_name}%", item_name,
            )
            if not rows:
                return ItemLookupResult(error=f"找不到物料「{item_name}」")

            # 精確匹配或只有一個結果
            if len(rows) == 1 or rows[0]["name"].lower() == item_name.lower():
                return ItemLookupResult(item=dict(rows[0]))

            # 多個候選，讓 AI 請使用者選擇
            return ItemLookupResult(
                candidates=[dict(r) for r in rows],
                error="找到多個匹配的物料",
            )
```

### MCP 交易記錄建立

為 MCP 特別設計的進出貨函數，直接回傳更新後的庫存數量：

```python
async def create_inventory_transaction_mcp(
    item_id: UUID,
    transaction_type: str,  # 'in' 或 'out'
    quantity: Decimal,
    transaction_date: date | None = None,
    vendor: str | None = None,
    project_id: UUID | None = None,
    notes: str | None = None,
    created_by: str = "linebot",
) -> Decimal:
    """建立進出貨記錄（MCP 專用，返回更新後的庫存）"""
    async with get_connection() as conn:
        await conn.execute(
            """
            INSERT INTO inventory_transactions (
                item_id, type, quantity, transaction_date,
                vendor, project_id, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            item_id, transaction_type, quantity,
            transaction_date or date.today(),
            vendor, project_id, notes, created_by,
        )
        # 觸發器已自動更新庫存，直接查詢最新值
        new_stock = await conn.fetchval(
            "SELECT current_stock FROM inventory_items WHERE id = $1",
            item_id,
        )
        return new_stock or Decimal("0")
```

### 專案庫存狀態查詢

另一個實用的 MCP 函數是查詢某個專案的物料使用狀況：

```python
async def get_project_inventory_status(project_id: UUID) -> dict:
    """查詢指定專案的物料進出貨狀態"""
    async with get_connection() as conn:
        rows = await conn.fetch(
            """
            WITH project_items AS (
                SELECT DISTINCT item_id
                FROM inventory_transactions
                WHERE project_id = $1
                UNION
                SELECT DISTINCT item_id
                FROM inventory_orders
                WHERE project_id = $1
            )
            SELECT
                i.id AS item_id, i.name AS item_name, i.unit,
                COALESCE(SUM(CASE WHEN t.type = 'in'
                    THEN t.quantity ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN t.type = 'out'
                    THEN t.quantity ELSE 0 END), 0) AS total_out
            FROM project_items pi
            JOIN inventory_items i ON pi.item_id = i.id
            LEFT JOIN inventory_transactions t
                ON pi.item_id = t.item_id AND t.project_id = $1
            GROUP BY i.id, i.name, i.unit
            ORDER BY i.name
            """,
            project_id,
        )
        return {
            "project_name": project["name"],
            "items": [
                {
                    "item_name": row["item_name"],
                    "unit": row["unit"],
                    "total_in": row["total_in"],
                    "total_out": row["total_out"],
                }
                for row in rows
            ],
        }
```

### AI 使用情境

透過 MCP 工具，AI 助手可以理解自然語言的庫存操作：

```
用戶：KV-7500 還有幾台？

AI：（調用 find_item_by_id_or_name，item_name="KV-7500"）
AI：PLC KV-7500 目前庫存 3 台，存放在 A 棟 3F 架位 C2。
    最低庫存設為 2 台，目前庫存充足。

---

用戶：水切爐專案用了多少馬達？

AI：（調用 get_project_inventory_status）
AI：水切爐改善專案物料使用狀況：
    - 東元馬達：進貨 2 台，出貨 1 台
    - 加熱器：進貨 3 台，出貨 3 台

---

用戶：東元的馬達到了 5 台，入庫

AI：（調用 create_inventory_transaction_mcp）
AI：已入庫：東元馬達 5 台
    更新後庫存：8 台
```

### 遷移至 ERPNext

隨著系統規模成長，庫存管理後來遷移到了 ERPNext。在 AI 助手的 prompt 中，庫存相關操作會指引到 ERPNext 的 MCP 工具：

```python
INVENTORY_TOOLS_PROMPT = """【物料/庫存管理】（使用 ERPNext）
物料與庫存管理功能已遷移至 ERPNext 系統，請使用 ERPNext MCP 工具操作：

【查詢庫存】
- mcp__erpnext__get_stock_balance: 查詢即時庫存
- mcp__erpnext__get_stock_ledger: 查詢庫存異動記錄

【廠商管理】
- mcp__erpnext__get_supplier_details: 查詢廠商完整資料
  · keyword: 關鍵字搜尋（支援別名）
"""
```

這個遷移過程也說明了一個重要的架構決策：**先用內部系統快速開發原型、驗證需求，再遷移到成熟的 ERP 系統**。ChingTech OS 的庫存模組在遷移前已經幫團隊釐清了所有欄位需求和操作流程。

---

## 權限控制

庫存和廠商管理都納入了 ChingTech OS 的應用權限體系：

```python
# 預設權限設定
DEFAULT_PERMISSIONS = {
    "inventory-management": True,   # 物料管理
    "vendor-management": True,      # 廠商管理
    # ...其他模組
}

APP_DISPLAY_NAMES = {
    "inventory-management": "物料管理",
    "vendor-management": "廠商管理",
}
```

只有被授權的使用者才能在前端看到物料管理和廠商管理的應用圖示，AI 助手也只會在該使用者有權限時載入對應的工具提示。

---

## 小結

庫存管理模組的核心設計包含：

| 元件 | 技術細節 |
|------|----------|
| 物料主檔 | Pydantic Model + PostgreSQL，支援正規化模糊搜尋 |
| 庫存計算 | 資料庫觸發器自動維護 `current_stock` |
| 進出貨記錄 | 完整的交易記錄，關聯專案與廠商 |
| 訂購追蹤 | 四階段狀態機（pending → ordered → delivered → cancelled） |
| 廠商管理 | ERP 編號對應、軟刪除、與專案發包整合 |
| MCP 工具 | 模糊查詢、候選列表、自然語言操作 |
| 權限控制 | 應用層級權限，控制前端顯示與 AI 工具載入 |

幾個值得注意的設計決策：

1. **觸發器 vs. 應用層計算**：用 PostgreSQL 觸發器維護庫存一致性，避免多個入口導致數據不一致
2. **模糊匹配優先**：不要求使用者記住精確的物料名稱或 UUID，支援多候選選擇
3. **ERP 橋接設計**：`erp_code` 欄位讓內部系統和外部 ERP 可以共存，降低遷移成本
4. **軟刪除策略**：廠商使用 `is_active` 而非物理刪除，保護歷史關聯數據

---

## 參考資源

- [專案管理資料模型]({% post_url 2026-01-08-project-data-model %})
- [專案發包期程管理]({% post_url 2026-01-09-delivery-schedule %})
- [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %})
- [MCP 工具權限控制]({% post_url 2026-01-07-mcp-permission %})
- [PostgreSQL Trigger Functions](https://www.postgresql.org/docs/current/plpgsql-trigger.html)
- [Pydantic V2 Documentation](https://docs.pydantic.dev/latest/)
