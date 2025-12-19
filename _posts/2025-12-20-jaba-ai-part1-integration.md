---
layout: post
title: "從 jaba + jaba-line-bot 到 jaba-ai：專案整合實戰"
subtitle: "兩個獨立專案如何演變成統一的 AI 驅動後端"
date: 2025-12-20
categories: [Jaba AI]
tags: [專案, Python, FastAPI, 重構, 架構設計, LINE Bot]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第一篇文章。

在這篇文章中，我想分享一個真實的專案整合經驗：如何將兩個獨立運作的系統——**呷爸看板 (jaba)** 和 **呷爸 LINE Bot 代理 (jaba-line-bot)**——整合成一個統一的後端應用程式 **jaba-ai**。

這不是一篇「最佳實踐」的教條文章，而是記錄整合過程中的思考、權衡與踩過的坑。

---

## 背景：兩個獨立的專案

在整合之前，呷爸點餐系統由兩個專案組成：

### jaba（看板系統 + LINE Bot 主程式）

- **功能**：即時訂單看板、超管後台、群組管理、LINE Bot 訊息處理
- **技術**：Python + FastAPI + Socket.IO + JSON 檔案儲存
- **部署**：本機或自有主機
- **LINE Bot**：內建 Webhook 處理（`/jaba/callback`）

```
jaba/
├── main.py              # FastAPI + Socket.IO 應用
├── app/
│   ├── ai.py            # AI 對話處理
│   ├── data.py          # JSON 資料存取
│   └── linebot.py       # LINE Bot 處理邏輯
├── data/
│   ├── stores/          # 店家與菜單資料
│   ├── linebot/         # LINE Bot 相關資料
│   │   ├── whitelist.json
│   │   └── sessions/    # 群組點餐 session
│   └── today/           # 今日資訊
└── templates/           # 前端頁面
```

### jaba-line-bot（LINE Bot 代理）

- **功能**：接收 LINE Webhook，轉發到 jaba API
- **技術**：Python + Flask + LINE Bot SDK v3
- **部署**：Render（免費方案）
- **角色**：輕量代理，提供固定的公開 HTTPS 網址

```
jaba-line-bot/
├── app.py              # Flask 應用
├── requirements.txt    # 依賴清單
└── render.yaml         # Render 部署設定
```

### 為什麼需要兩個專案？

主要原因是 **部署環境限制**：

1. **jaba** 跑在本機或內網主機，沒有固定的公開網址
2. LINE Webhook 需要固定的 HTTPS 網址
3. **jaba-line-bot** 部署在 Render，提供免費的公開網址
4. jaba-line-bot 收到 LINE 訊息後，轉發到 jaba 的 API

```
LINE Platform
    │
    ▼ (HTTPS)
jaba-line-bot (Render)
    │
    ▼ (HTTP)
jaba (本機/內網)
```

這樣的架構讓開發時可以在本機運行 jaba，同時透過 Render 上的代理接收 LINE 訊息。

---

## 整合動機：分散架構的痛點

雖然這個架構能運作，但隨著功能增加，問題開始浮現。

### 痛點一：資料不同步

jaba 使用 JSON 檔案儲存，資料都在本機：

```
jaba/data/stores/store-a/info.json
jaba/data/linebot/whitelist.json
```

如果換一台電腦開發，或是想部署到正式環境，資料就要手動複製。

### 痛點二：代理增加延遲

每個 LINE 訊息都要經過兩次 HTTP 請求：

```
LINE → Render (jaba-line-bot) → 本機 (jaba)
          ~100ms                  ~50ms
```

而且 Render 免費方案有冷啟動問題，閒置後第一次請求可能要等好幾秒。

### 痛點三：兩邊都要維護

雖然 jaba-line-bot 只是代理，但有些邏輯還是需要兩邊同步：

```python
# jaba/app/linebot.py
TRIGGER_KEYWORDS = ["jaba", "呷爸", "點餐"]

# jaba-line-bot/app.py
TRIGGER_KEYWORDS = ["jaba 呷爸", "呷爸", "點餐", "jaba"]  # 順序不同！
```

### 痛點四：缺乏統一的權限管理

- 看板系統只有「超管密碼」
- LINE Bot 用白名單機制
- 無法實現「群組管理員」這樣的中間角色

---

## 整合目標

經過評估，我們設定了以下整合目標：

| 目標 | 說明 |
|------|------|
| 單一應用部署 | 不再需要 Render 代理 |
| 統一資料來源 | JSON → PostgreSQL |
| 三層權限架構 | 超管 → 群組管理員 → 一般成員 |
| 群組申請機制 | 申請 → 審核 → 啟用的完整流程 |
| 真正的即時更新 | Socket.IO 廣播訂單變化 |
| 保留原有 UI | 維持看板和後台的視覺風格 |

---

## 架構決策

### 決策一：繼續使用 FastAPI

jaba 原本就用 FastAPI，整合時沒有必要換成其他框架：

| 考量點 | 選擇 |
|-------|------|
| 非同步支援 | FastAPI 原生支援 |
| Socket.IO 整合 | python-socketio 與 FastAPI 配合良好 |
| 自動文件 | 內建 Swagger UI |
| 型別提示 | 原生支援 Pydantic |

### 決策二：Repository Pattern

原本的 jaba 直接用函數操作 JSON 檔案：

```python
# jaba/app/data.py
def get_store(store_id: str) -> dict | None:
    store_file = DATA_DIR / "stores" / store_id / "info.json"
    if store_file.exists():
        return read_json(store_file)
    return None
```

整合時改用 Repository Pattern 封裝資料庫操作：

```
Router (API 入口)
    ↓
Service (業務邏輯)
    ↓
Repository (資料存取)
    ↓
Model (ORM)
    ↓
Database
```

詳細的 Repository Pattern 實作會在 [下一篇文章]({% post_url 2025-12-21-jaba-ai-part2-repository %}) 中說明。

### 決策三：事件驅動的即時更新

原本的看板用 Socket.IO 廣播，但有時會遇到「收到通知但查不到資料」的問題。

這是因為：
1. 資料寫入資料庫
2. 發送 Socket.IO 通知
3. 前端收到通知，發 API 查詢
4. **但資料庫 commit 還沒完成！**

解決方案是事件隊列，詳見 [事件隊列設計]({% post_url 2025-12-21-jaba-ai-part3-event-queue %})。

---

## 資料庫重新設計

從 JSON 遷移到 PostgreSQL 是這次整合最大的工程。

### 原本的 JSON 結構

```json
// data/stores/store-a/info.json
{
  "id": "store-a",
  "name": "店家A",
  "phone": "",
  "active": true
}

// data/linebot/sessions/Cxxxx.json
{
  "group_id": "Cxxxx",
  "status": "ordering",
  "orders": [
    {"line_user_id": "Uxxxx", "items": [...], "total": 85}
  ]
}
```

問題：
- 沒有正規化，資料重複
- 沒有關聯，需要用 ID 字串去對應
- 沒有交易支援

### 重新設計的 Schema

我們設計了 18 張資料表，以「群組」為核心組織資料：

```
users (使用者)
  └─ group_members (群組成員)
     └─ groups (LINE 群組)
        ├─ group_admins (群組管理員)
        ├─ group_applications (申請記錄)
        ├─ order_sessions (點餐 Session)
        │  ├─ orders (訂單)
        │  │  └─ order_items (訂單品項)
        │  └─ chat_messages (聊天記錄)
        └─ group_today_stores (今日店家)
           └─ stores (店家)
              └─ menus → menu_categories → menu_items
```

### 關鍵設計決策

**1. UUID 作為主鍵**

```python
class User(Base):
    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4
    )
```

**2. JSONB 儲存彈性結構**

```python
class User(Base):
    preferences: Mapped[dict] = mapped_column(JSONB, default={})
    # {"preferred_name": "小澤", "dietary_restrictions": ["不吃辣"]}

class MenuItem(Base):
    variants: Mapped[list] = mapped_column(JSONB, default=[])
    # [{"name": "M", "price": 35}, {"name": "L", "price": 40}]
```

**3. 店家的 Scope 機制**

```python
class Store(Base):
    scope: Mapped[str] = mapped_column(String(20), default="global")
    # "global" = 所有群組可用
    # "group"  = 僅特定群組可用

    group_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
```

---

## API 路由規劃

整合後的 API 分為六個 Router：

```
/api/
├─ /webhook/line      # LINE Webhook（簽章驗證）
├─ /admin             # 超管後台 API（Token 驗證）
├─ /line-admin        # 群組管理員 API（群組代碼驗證）
├─ /board             # 看板 API（公開）
├─ /chat              # 聊天歷史 API
└─ /public            # 公開 API（菜單查詢等）
```

### 路由設計原則

**1. 依角色分組**

```python
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])
line_admin_router = APIRouter(prefix="/api/line-admin", tags=["line-admin"])
public_router = APIRouter(prefix="/api/public", tags=["public"])
```

**2. 依賴注入處理認證**

```python
async def get_current_admin(
    token: str = Header(..., alias="Authorization")
) -> SuperAdmin:
    # 驗證 token，回傳管理員物件
    ...

@router.get("/stores")
async def list_stores(
    admin: SuperAdmin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    # admin 已經驗證過了
    ...
```

---

## 整合過程的挑戰

### 挑戰一：非同步資料庫操作

jaba 原本用同步的 JSON 讀寫，整合後需要全面改為非同步：

```python
# 原本 (同步)
def get_store(store_id: str) -> dict | None:
    store_file = DATA_DIR / "stores" / store_id / "info.json"
    return read_json(store_file) if store_file.exists() else None

# 整合後 (非同步)
async def get_store(store_id: UUID, db: AsyncSession) -> Store | None:
    result = await db.execute(
        select(Store).where(Store.id == store_id)
    )
    return result.scalar_one_or_none()
```

### 挑戰二：維持功能相容

整合過程中必須確保原有功能不受影響：

| 功能 | 驗證方式 |
|------|---------|
| LINE 點餐 | 在測試群組實際點餐 |
| 即時看板 | 開啟看板，確認訂單即時出現 |
| 後台管理 | 新增/修改店家和菜單 |
| AI 對話 | 測試各種對話情境 |

### 挑戰三：移除 Render 代理

整合後 jaba-ai 需要直接接收 LINE Webhook：

1. 部署到有固定 IP 的主機
2. 設定 HTTPS（Let's Encrypt）
3. 更新 LINE Developer Console 的 Webhook URL

---

## 整合成果

經過整合，jaba-ai 實現了：

![呷爸訂餐看板](/assets/images/jaba-ai/01-board-main-dashboard.png)
*整合後的即時訂餐看板，左側顯示 AI 對話紀錄，右側顯示訂單列表*

### 程式碼統計

| 項目 | 行數 |
|------|------|
| Services（業務邏輯） | ~3,760 行 |
| Routers（API 路由） | ~3,173 行 |
| Repositories（資料存取） | ~1,573 行 |
| Models（資料模型） | ~800 行 |
| **總計** | ~11,000 行 |

### 功能對照

| 功能 | jaba | jaba-line-bot | jaba-ai |
|------|:----:|:-------------:|:-------:|
| 即時看板 | ✓ | - | ✓ |
| LINE 點餐 | ✓ | 代理 | ✓ |
| 超管後台 | ✓ | - | ✓ |
| 群組管理員後台 | - | - | ✓ (新) |
| 群組申請審核 | - | - | ✓ (新) |
| AI 對話日誌 | - | - | ✓ (新) |
| 安全防護 | - | - | ✓ (新) |
| PostgreSQL | - | - | ✓ (新) |

### 部署簡化

```bash
# 以前：兩個應用
# 1. 本機跑 jaba
# 2. Render 跑 jaba-line-bot 代理

# 現在：一個應用
./scripts/start.sh
```

---

## 心得與建議

### 什麼時候該整合？

- 兩個系統共享大量資料
- 代理架構增加不必要的延遲
- 維護成本超過整合成本

### 什麼時候不該整合？

- 系統功能獨立，沒有資料共享
- 團隊不同，需要獨立部署週期
- 整合成本超過維持現狀的成本

### 整合的建議做法

1. **先定義清晰的目標** — 不是「整合」本身，而是要解決什麼問題
2. **設計新架構再動手** — 不要邊整合邊設計
3. **漸進式遷移** — 新舊系統並行，逐步切換
4. **保留回退方案** — 萬一新系統有問題，可以快速切回舊系統

---

## 下一篇

在下一篇文章中，我們會深入探討 jaba-ai 的核心架構設計：[Repository Pattern 實作：讓資料層乾淨分離]({% post_url 2025-12-21-jaba-ai-part2-repository %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
