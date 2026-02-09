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

在這篇文章中，我想分享一個真實的專案演進經驗：從最初的 **[呷爸看板 (jaba)]({% post_url 2025-12-08-jaba %})** Web UI 系統，到與 **[呷爸 LINE Bot 代理 (jaba-line-bot)]({% post_url 2025-12-09-jaba-line-bot %})** 分離運作的雙專案架構，最終整合重寫成生產級的 **jaba-ai** 系統。

這不是一篇「最佳實踐」的教條文章，而是記錄整個演進過程中的思考、架構決策與踩過的坑。

---

## 專案演進時間線

在深入架構細節之前，先來看看整個專案的演進歷程：

| 日期 | 里程碑 |
|------|--------|
| 2025-12-02 | **jaba 專案誕生** — 純 Web UI 的 AI 點餐系統 |
| 2025-12-08 | 新增 LINE Bot 白名單 API，準備與 LINE Bot 對接 |
| 2025-12-09 | **jaba-line-bot 專案創建** — 獨立的 Flask 代理應用 |
| 2025-12-09 | jaba 新增群組點餐功能（開單、收單、菜單） |
| 2025-12-15 | LINE Bot 程式碼整合回 jaba 主系統 |
| 2025-12-19 | **jaba-ai 專案創建** — 生產級完全重寫 |

---

## 階段一：jaba 純 Web UI 時期（12/02 - 12/08）

最初的 jaba 是一個純 Web 介面的 AI 點餐系統：

- **功能**：即時訂單看板、超管後台、AI 對話點餐
- **技術**：Python + FastAPI + Socket.IO + JSON 檔案儲存
- **使用方式**：透過網頁介面輸入訂餐訊息

```
jaba/
├── main.py              # FastAPI + Socket.IO 應用
├── app/
│   ├── ai.py            # AI 對話處理（Claude CLI / Gemini CLI）
│   └── data.py          # JSON 資料存取
├── data/
│   ├── stores/          # 店家與菜單資料
│   └── today/           # 今日資訊
├── static/              # 前端靜態檔案
└── templates/           # HTML 模板
```

這個階段的點餐流程是：使用者開啟網頁 → 輸入訂餐訊息 → AI 處理 → 看板即時更新。

---

## 階段二：雙專案分離架構（12/09 - 12/15）

為了讓使用者可以透過 LINE 點餐，我們建立了 **jaba-line-bot** 作為獨立的代理服務。

### jaba（本地伺服器）

新增 LINE Bot 相關的 API 端點：

```
jaba/
├── main.py
├── app/
│   ├── ai.py            # AI 對話處理
│   ├── data.py          # JSON 資料存取
│   └── linebot.py       # LINE Bot API 端點（新增）
├── data/
│   ├── stores/
│   ├── linebot/         # LINE Bot 相關資料（新增）
│   │   ├── whitelist.json
│   │   └── sessions/    # 群組點餐 session
│   └── today/
└── templates/
```

新增的 API 端點：
- `POST /api/chat` — AI 對話
- `GET /api/linebot/check/{id}` — 白名單檢查
- `POST /api/linebot/register` — 白名單註冊
- `GET /api/linebot/session/{group_id}` — 群組點餐狀態

### jaba-line-bot（Render 雲端）

獨立的 Flask 應用，負責接收 LINE Webhook：

```
jaba-line-bot/
├── app.py              # Flask 應用（~200 行）
├── requirements.txt    # 依賴清單
├── render.yaml         # Render 部署設定
├── nginx-config-for-server.conf  # nginx 設定參考
└── docs/
    ├── architecture.md      # 系統架構圖
    ├── jaba-integration.md  # 整合說明
    └── deployment.md        # 部署指南
```

### 為什麼需要兩個專案？

主要原因是 **部署環境限制**：

1. **jaba** 跑在本地伺服器（192.168.11.9），沒有固定的公開網址
2. LINE Webhook 需要固定的 HTTPS 網址
3. **jaba-line-bot** 部署在 Render，提供免費的公開 HTTPS
4. 透過 **nginx** 作為 API Gateway，驗證 API Key 並轉發請求
5. 使用 **DDNS**（ching-tech.ddns.net）將外網流量導入本地

### 完整架構圖

```
┌─────────────────┐     HTTPS      ┌─────────────────┐
│   LINE 使用者   │ ────────────> │  LINE Platform  │
│  (手機/電腦)    │ <──────────── │   (Webhook)     │
└─────────────────┘                └────────┬────────┘
                                            │
                                            │ POST /callback
                                            ▼
                                   ┌─────────────────┐
                                   │     Render      │
                                   │  jaba-line-bot  │
                                   │   (Flask App)   │
                                   └────────┬────────┘
                                            │
                                            │ HTTPS + API Key
                                            ▼
                                   ┌─────────────────┐
                                   │ ching-tech.ddns │
                                   │     (DDNS)      │
                                   └────────┬────────┘
                                            │
                                            │ Port 80
                                            ▼
┌───────────────────────────────────────────────────────────┐
│                   本地伺服器 192.168.11.9                  │
│  ┌─────────────────┐              ┌─────────────────┐     │
│  │      nginx      │  proxy_pass  │      jaba       │     │
│  │  (API Gateway)  │ ──────────> │   (FastAPI)     │     │
│  │  /jaba-api/*    │              │   Port 8098     │     │
│  │  API Key 驗證   │              │                 │     │
│  └─────────────────┘              └─────────────────┘     │
└───────────────────────────────────────────────────────────┘
```

### nginx API Gateway 設定

```nginx
location /jaba-api/ {
    # API Key 驗證
    if ($http_x_api_key != "your_secret_api_key") {
        return 403;
    }

    # 轉發到 jaba
    proxy_pass http://192.168.11.9:8098/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;

    # 延長 timeout（AI 回應需要時間）
    proxy_read_timeout 30s;
}
```

### 訊息流程

```
1. 使用者在 LINE 發送「我要雞腿便當」
2. LINE Platform 發送 Webhook 到 Render
3. jaba-line-bot 驗證 LINE 簽章
4. 檢查白名單 → GET /jaba-api/api/linebot/check/{id}
5. 轉發訊息 → POST /jaba-api/api/chat
6. nginx 驗證 API Key，轉發到 jaba
7. jaba AI 處理，回傳回應
8. 回應一路傳回 LINE 使用者
```

## 階段三：LINE Bot 整合到 jaba（12/15）

2025-12-15，我們將 LINE Bot 程式碼整合回 jaba 主系統：

```
feat: 整合 LINE Bot 到 jaba 主系統

- 新增 app/linebot.py 模組處理 LINE Webhook 事件
- 新增 /jaba/callback 端點接收 LINE 訊息
- 支援群組點餐指令：開單、菜單、收單、目前訂單
- LINE Bot 狀態改為檢查本地服務（整合模式）
```

這時候 jaba 可以直接處理 LINE Webhook，不再需要 jaba-line-bot 代理。但本質上還是同一套 JSON 儲存架構。

---

## 分散架構的痛點

在雙專案時期，雖然架構能運作，但隨著功能增加，問題開始浮現。

### 痛點一：資料不同步

jaba 使用 JSON 檔案儲存，資料都在本機：

```
jaba/data/stores/store-a/info.json
jaba/data/linebot/whitelist.json
```

如果換一台電腦開發，或是想部署到正式環境，資料就要手動複製。

### 痛點二：代理增加延遲

在雙專案時期，每個 LINE 訊息都要經過多次 HTTP 請求：

```
LINE → Render → DDNS → nginx → jaba
         ↑        ↑       ↑
       ~200ms   ~50ms   ~10ms
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
- LINE Bot 用白名單機制（JSON 檔案）
- 無法實現「群組管理員」這樣的中間角色

### 痛點五：JSON 儲存的限制

- 沒有正規化，資料重複
- 沒有關聯查詢
- 沒有交易支援
- 並發寫入可能造成資料遺失

---

## 階段四：jaba-ai 生產級重寫（12/19）

經過評估，我們決定不只是「整合」，而是「完全重寫」成生產級系統。這就是 **jaba-ai** 專案的誕生。

> 本專案整合重寫自 [jaba](https://github.com/yazelin/jaba)（看板系統）和 [jaba-line-bot](https://github.com/yazelin/jaba-line-bot)（LINE Bot），統一為單一後端架構。
> — jaba-ai README

### 重寫目標

| 目標 | 說明 |
|------|------|
| 單一應用部署 | 不再需要 Render 代理、nginx Gateway |
| 統一資料來源 | JSON → **PostgreSQL** |
| 完全非同步 | asyncio + asyncpg 高並發支援 |
| Repository Pattern | 資料層與業務邏輯分離 |
| 三層權限架構 | 超管 → 群組管理員 → 一般成員 |
| 群組申請機制 | 申請 → 審核 → 啟用的完整流程 |
| 安全防護 | Prompt Injection 防護 + 安全日誌 |
| 資料庫遷移 | Alembic 版本控制 |

---

## jaba-ai 架構決策

### 決策一：繼續使用 FastAPI

jaba 原本就用 FastAPI，重寫時沒有必要換成其他框架：

| 考量點 | 選擇 |
|-------|------|
| 非同步支援 | FastAPI 原生支援 async/await |
| Socket.IO 整合 | python-socketio 與 FastAPI 配合良好 |
| 自動文件 | 內建 Swagger UI |
| 型別提示 | 原生支援 Pydantic |

### 決策二：PostgreSQL + SQLAlchemy 2.0 Async

從 JSON 檔案升級到關聯式資料庫：

| 項目 | jaba (JSON) | jaba-ai (PostgreSQL) |
|------|-------------|----------------------|
| 儲存 | 檔案系統 | PostgreSQL 16 |
| ORM | 無 | SQLAlchemy 2.0 Async |
| 遷移 | 無 | Alembic |
| 連線池 | 無 | asyncpg |

### 決策三：Repository Pattern

原本的 jaba 直接用函數操作 JSON 檔案：

```python
# jaba/app/data.py
def get_store(store_id: str) -> dict | None:
    store_file = DATA_DIR / "stores" / store_id / "info.json"
    if store_file.exists():
        return read_json(store_file)
    return None
```

jaba-ai 改用 Repository Pattern 封裝資料庫操作：

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

### 決策四：事件驅動的即時更新

原本的看板用 Socket.IO 廣播，但有時會遇到「收到通知但查不到資料」的問題。

這是因為：
1. 資料寫入資料庫
2. 發送 Socket.IO 通知
3. 前端收到通知，發 API 查詢
4. **但資料庫 commit 還沒完成！**

解決方案是事件隊列，詳見 [事件隊列設計]({% post_url 2025-12-21-jaba-ai-part3-event-queue %})。

---

## 資料庫重新設計

從 JSON 遷移到 PostgreSQL 是這次重寫最大的工程。

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

jaba-ai 設計了 **18 個 SQLAlchemy Models**，以「群組」為核心組織資料：

```
app/models/
├── user.py           # 使用者
├── group.py          # 群組、申請、成員、管理員
├── store.py          # 店家
├── menu.py           # 菜單、分類、品項
├── order.py          # 訂單、Session、品項
├── chat.py           # 對話記錄
└── system.py         # 超管、AI 提示詞、安全日誌
```

資料表關聯：

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

## 重寫過程的挑戰

### 挑戰一：非同步資料庫操作

jaba 原本用同步的 JSON 讀寫，jaba-ai 需要全面改為非同步：

```python
# 原本 (同步 JSON)
def get_store(store_id: str) -> dict | None:
    store_file = DATA_DIR / "stores" / store_id / "info.json"
    return read_json(store_file) if store_file.exists() else None

# jaba-ai (非同步 PostgreSQL)
async def get_store(store_id: UUID, db: AsyncSession) -> Store | None:
    result = await db.execute(
        select(Store).where(Store.id == store_id)
    )
    return result.scalar_one_or_none()
```

### 挑戰二：維持功能相容

重寫過程中必須確保原有功能不受影響：

| 功能 | 驗證方式 |
|------|---------|
| LINE 點餐 | 在測試群組實際點餐 |
| 即時看板 | 開啟看板，確認訂單即時出現 |
| 後台管理 | 新增/修改店家和菜單 |
| AI 對話 | 測試各種對話情境 |

### 挑戰三：直接接收 LINE Webhook

jaba-ai 不再需要 Render 代理，直接接收 LINE Webhook：

1. 部署到有固定 IP 的主機
2. 設定 HTTPS（Let's Encrypt）
3. 更新 LINE Developer Console 的 Webhook URL
4. 確保 LINE 簽章驗證正確實作

### 挑戰四：安全性強化

新增 Prompt Injection 防護：

```python
# 自動過濾使用者輸入中的惡意內容
def sanitize_user_input(text: str) -> str:
    # 過濾可能的 prompt injection 攻擊
    ...
```

記錄可疑行為到安全日誌，供後續監控分析。

---

## 重寫成果

經過重寫，jaba-ai 實現了生產級的系統架構：

![呷爸訂餐看板](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/assets-images-jaba-ai-01-board-main-dashboard.png)
*jaba-ai 的即時訂餐看板，左側顯示 AI 對話紀錄，右側顯示訂單列表*

### 技術棧對比

| 項目 | jaba | jaba-ai |
|------|------|---------|
| Web Framework | FastAPI | FastAPI |
| Database | JSON 檔案 | **PostgreSQL 16** |
| ORM | 無 | **SQLAlchemy 2.0 Async** |
| Migration | 無 | **Alembic** |
| Real-time | Socket.IO | Socket.IO |
| LINE SDK | line-bot-sdk v3 | line-bot-sdk v3 |
| AI | Claude CLI | Claude CLI |
| Task Scheduler | 無 | **APScheduler** |
| Package Manager | uv | uv |

### 功能對照

| 功能 | jaba | jaba-line-bot | jaba-ai |
|------|:----:|:-------------:|:-------:|
| 即時看板 | ✓ | - | ✓ |
| LINE 點餐 | ✓ | 代理 | ✓ |
| 超管後台 | ✓ | - | ✓ |
| 群組管理員後台 | - | - | ✓ (新) |
| 群組申請審核 | - | - | ✓ (新) |
| 代點功能 | - | - | ✓ (新) |
| 歷史訂單查詢 | - | - | ✓ (新) |
| AI Token 追蹤 | - | - | ✓ (新) |
| Prompt Injection 防護 | - | - | ✓ (新) |
| 安全日誌 | - | - | ✓ (新) |
| PostgreSQL | - | - | ✓ (新) |
| 資料庫遷移 | - | - | ✓ (新) |

### 專案結構對比

**jaba（~數千行）**：
```
jaba/
├── main.py
├── app/
│   ├── ai.py
│   ├── data.py
│   └── linebot.py
├── data/              ← JSON 檔案
└── templates/
```

**jaba-ai（~11,000 行）**：
```
jaba-ai/
├── app/
│   ├── models/        ← 18 個 SQLAlchemy Models
│   ├── repositories/  ← Repository Pattern
│   ├── routers/       ← 6 個 API Router
│   ├── services/      ← 業務邏輯（line_service ~2,400 行）
│   └── database.py
├── migrations/        ← Alembic 遷移
├── static/            ← 前端頁面
├── scripts/           ← 部署腳本
└── docker-compose.yml ← PostgreSQL 容器
```

### 部署簡化

```bash
# 以前：多個元件
# 1. 本機跑 jaba (Port 8098)
# 2. nginx 做 API Gateway
# 3. Render 跑 jaba-line-bot 代理
# 4. DDNS 設定

# 現在：一個命令啟動
./scripts/start.sh
# 啟動 PostgreSQL + 執行遷移 + 啟動應用程式
```

---

## 心得與建議

### 什麼時候該重寫？

- 現有架構無法支撐新功能需求
- 技術債累積到難以維護
- 需要生產級的可靠性（如資料庫交易、遷移）
- 有明確的時間和資源投入

### 什麼時候不該重寫？

- 現有系統還能滿足需求
- 團隊不熟悉新技術棧
- 沒有足夠的測試覆蓋確保功能相容
- 時間緊迫，無法承擔重寫風險

### 重寫的建議做法

1. **先定義清晰的目標** — 不是「重寫」本身，而是要解決什麼問題
2. **設計新架構再動手** — 不要邊重寫邊設計
3. **保留原有系統** — jaba 和 jaba-line-bot 專案仍保留在 GitHub，萬一需要可以切回
4. **漸進式驗證** — 每完成一個模組就測試，不要等全部完成才測試

### 版本定位

| 版本 | 定位 | 適用場景 |
|------|------|----------|
| **jaba** | 原型/MVP | 快速驗證想法 |
| **jaba-line-bot** | 輕量代理 | 解決部署限制 |
| **jaba-ai** | 生產級系統 | 正式上線運營 |

---

## 下一篇

在下一篇文章中，我們會深入探討 jaba-ai 的核心架構設計：[Repository Pattern 實作：讓資料層乾淨分離]({% post_url 2025-12-21-jaba-ai-part2-repository %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
