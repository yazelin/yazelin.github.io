---
layout: post
title: "ChingTech OS：模組化重構"
subtitle: "mcp_server.py 拆 7 模組、linebot.py 拆 13 模組"
date: 2026-02-06
categories: [ChingTech OS]
tags: [ChingTech OS, 重構, 模組化, Python, 架構設計, 錯誤處理]
---

![ChingTech OS：模組化重構](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-06-ctos-modular-refactor.png)

## 前言

上一篇[移除多租戶架構]({% post_url 2026-02-05-ctos-remove-multi-tenant %})把系統從多租戶簡化為單租戶後，接下來要處理另一個技術債：**巨型檔案**。

ChingTech OS 的後端有兩個「巨獸」——`mcp_server.py` 和 `linebot.py`。它們各自承擔了太多職責：MCP Server 把所有工具定義塞在一個檔案裡，Line Bot 則把 webhook 處理、訊息發送、檔案下載、群組管理等全部混在一起。隨著功能持續增加，這兩個檔案已經膨脹到難以維護的程度。

這篇記錄如何系統性地將它們拆分為**領域模組**，以及在拆分過程中建立統一的 `ServiceError` 錯誤層級結構。

---

## 為什麼要拆

在動手之前，先釐清問題：

| 問題 | 影響 |
|------|------|
| 單一檔案超過 1000 行 | 滾動找函式像在翻電話簿 |
| 多個開發者同時修改同一檔案 | Git merge conflict 頻繁 |
| 所有領域邏輯耦合在一起 | 改 A 功能容易誤觸 B 功能 |
| 測試時必須載入整個模組 | 單元測試啟動慢、覆蓋率難以精準衡量 |
| 新成員 onboarding 困難 | 「這個檔案在做什麼？」——「什麼都做。」 |

核心原則很簡單：**一個模組只做一件事，一件事只在一個模組做。**

---

## mcp_server.py → 7 個領域模組

原本所有 MCP 工具（FastMCP 的 `@mcp.tool()` 裝飾器函式）都寫在同一個 `mcp_server.py` 裡。拆分後的結構：

```
services/mcp/
├── __init__.py            # 匯入所有子模組，觸發 @mcp.tool() 註冊
├── server.py              # FastMCP 實例、共用輔助函數、權限檢查
├── knowledge_tools.py     # 知識庫：搜尋、新增、更新、附件管理
├── message_tools.py       # 訊息：聊天摘要、附件查詢
├── nas_tools.py           # NAS 檔案：搜尋、讀取、傳送
├── share_tools.py         # 分享連結：建立、知識庫附件分享
├── memory_tools.py        # 記憶管理：新增、查詢、更新、刪除
├── media_tools.py         # 媒體處理：網頁圖片下載、PDF 轉圖
└── presentation_tools.py  # 簡報/文件：MD 轉 PPT、MD 轉 DOC、列印
```

### 拆分策略

**第一步：抽出核心**。`server.py` 保留 FastMCP 實例和所有子模組共用的輔助函數：

```python
# services/mcp/server.py
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "ching-tech-os",
    instructions="擎添工業 OS 的 AI 工具，可查詢專案、會議、成員等資訊。",
)

async def ensure_db_connection():
    """確保資料庫連線池已初始化（懶初始化）"""
    ...

async def check_mcp_tool_permission(tool_name, ctos_user_id):
    """統一的權限檢查"""
    ...
```

**第二步：按領域拆分工具**。每個子模組從 `server.py` 匯入 `mcp` 實例和共用函數，然後用 `@mcp.tool()` 註冊自己的工具：

```python
# services/mcp/knowledge_tools.py
from .server import mcp, logger, ensure_db_connection, check_mcp_tool_permission

@mcp.tool()
async def search_knowledge(query: str, ...):
    """搜尋知識庫"""
    ...

@mcp.tool()
async def add_note(title: str, content: str, ...):
    """新增知識庫筆記"""
    ...
```

**第三步：透過 `__init__.py` 串接**。`__init__.py` 匯入所有子模組，觸發裝飾器註冊，對外部呼叫者保持透明：

```python
# services/mcp/__init__.py

# 匯入共用元件
from .server import mcp, get_mcp_tools, execute_tool, run_cli, ...

# 匯入所有工具子模組以觸發 @mcp.tool() 註冊
from . import knowledge_tools   # noqa: F401
from . import message_tools     # noqa: F401
from . import nas_tools         # noqa: F401
from . import share_tools       # noqa: F401
from . import memory_tools      # noqa: F401
from . import media_tools       # noqa: F401
from . import presentation_tools  # noqa: F401
```

這樣做的好處是：外部使用者仍然用 `from services.mcp import mcp, execute_tool` 即可，完全不需要知道內部拆分了幾個檔案。

---

## linebot.py → 13 個領域模組

Line Bot 的拆分更為細緻，因為它涉及的領域更多。原本一個 `linebot.py` 包含了從 webhook 驗證到 NAS 檔案下載的所有邏輯。拆分後：

```
services/bot_line/
├── __init__.py       # 統一匯出所有 public API
├── adapter.py        # LineBotAdapter（實作 BotAdapter Protocol）
├── client.py         # Line API 客戶端（Configuration、AsyncMessagingApi）
├── webhook.py        # Webhook 簽章驗證
├── user_manager.py   # 用戶管理（Profile 查詢、好友狀態）
├── group_manager.py  # 群組管理（加入/離開事件、群組 Profile）
├── message_store.py  # 訊息儲存（存取資料庫）
├── messaging.py      # 訊息發送（reply、push、mention）
├── file_handler.py   # 檔案處理（下載、NAS 存取、暫存管理）
├── trigger.py        # AI 觸發判斷與對話管理
├── binding.py        # 用戶綁定與存取控制
├── admin.py          # 管理查詢功能
├── memory.py         # 記憶管理
└── constants.py      # 常數定義（MIME 對應、檔案類型）
```

### 各模組職責

| 模組 | 職責 | 匯出函數數量 |
|------|------|:------:|
| `constants` | MIME 對應表、檔案類型常數 | 4 |
| `client` | Line SDK 客戶端初始化 | 3 |
| `webhook` | 簽章驗證 | 2 |
| `user_manager` | 用戶 Profile、好友狀態管理 | 5 |
| `group_manager` | 群組生命週期管理 | 5 |
| `message_store` | 訊息 CRUD | 5 |
| `messaging` | 訊息發送（reply/push） | 6 |
| `file_handler` | 檔案下載、NAS 路徑、暫存 | 16 |
| `trigger` | AI 觸發條件判斷 | 4 |
| `binding` | 綁定碼生成/驗證、存取控制 | 6 |
| `admin` | 管理後台查詢 | 10 |
| `memory` | 群組/用戶記憶 CRUD | 9 |
| `adapter` | BotAdapter Protocol 實作 | 1 (class) |

### `__init__.py` 的角色

`bot_line/__init__.py` 有 252 行，全部是 import 和 `__all__` 定義。它的作用是讓外部呼叫者不需要知道內部結構：

```python
# 外部呼叫者只需要這樣 import
from services.bot_line import verify_signature, reply_text, save_message

# 不需要知道它們分別在 webhook.py、messaging.py、message_store.py
```

這是一個取捨：`__init__.py` 比較長，但外部 API 保持穩定。如果未來要搬動某個函式到另一個子模組，只需要改 `__init__.py` 的 import 來源，呼叫端完全不受影響。

---

## 統一 ServiceError 層次結構

拆分模組的同時，也建立了統一的錯誤處理機制。原本各服務各自定義 exception 或直接 raise `ValueError`，現在統一為：

```python
# services/errors.py

class ServiceError(Exception):
    """服務層基底錯誤"""
    def __init__(self, message: str, code: str = "INTERNAL_ERROR", status_code: int = 500):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)

class NotFoundError(ServiceError):
    """資源不存在"""
    def __init__(self, resource: str, identifier: str | None = None):
        detail = f"{resource} 不存在"
        if identifier:
            detail = f"{resource} 不存在: {identifier}"
        super().__init__(detail, "NOT_FOUND", 404)

class PermissionDeniedError(ServiceError):
    def __init__(self, message: str = "權限不足"):
        super().__init__(message, "PERMISSION_DENIED", 403)

class ValidationError(ServiceError):
    def __init__(self, message: str):
        super().__init__(message, "VALIDATION_ERROR", 422)

class ExternalServiceError(ServiceError):
    def __init__(self, service: str, message: str):
        super().__init__(f"{service}: {message}", "EXTERNAL_ERROR", 502)

class ConflictError(ServiceError):
    def __init__(self, message: str):
        super().__init__(message, "CONFLICT", 409)
```

每個子類別對應一個 HTTP 狀態碼和機器可讀的錯誤代碼，服務層只需要 `raise NotFoundError("知識庫", kb_id)` 即可。

---

## Global Exception Handler

有了統一的 `ServiceError`，就能在 FastAPI 層設定全域 exception handler，一次處理所有服務層錯誤：

```python
# main.py
from .services.errors import ServiceError

@app.exception_handler(ServiceError)
async def service_error_handler(request: Request, exc: ServiceError) -> JSONResponse:
    _error_logger.warning(
        "ServiceError %s %s: [%s] %s",
        request.method,
        request.url.path,
        exc.code,
        exc.message,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "message": exc.message},
    )
```

這樣的好處是：

1. **服務層不需要處理 HTTP 回應格式**——只管 raise，FastAPI 會自動轉換
2. **統一的錯誤 JSON 格式**——前端只需要解析 `{"error": "NOT_FOUND", "message": "..."}`
3. **集中的錯誤日誌**——每次 ServiceError 都會被記錄，方便追蹤

服務層程式碼變得很乾淨：

```python
# services/knowledge.py
from .errors import NotFoundError

async def get_knowledge_item(item_id: str):
    row = await conn.fetchrow("SELECT ...", item_id)
    if not row:
        raise NotFoundError("知識庫項目", item_id)  # 自動回傳 404
    ...
```

不再需要在每個 API endpoint 裡寫 `try/except` 或手動建構 `JSONResponse(status_code=404, ...)`。

---

## 拆分前後對比

### 檔案結構

```
# 拆分前
services/
├── mcp_server.py    # 1000+ 行，所有 MCP 工具
├── linebot.py       # 1500+ 行，所有 Line Bot 邏輯
└── ...

# 拆分後
services/
├── mcp/                  # 7 個領域模組
│   ├── __init__.py
│   ├── server.py
│   ├── knowledge_tools.py
│   ├── message_tools.py
│   ├── nas_tools.py
│   ├── share_tools.py
│   ├── memory_tools.py
│   ├── media_tools.py
│   └── presentation_tools.py
├── bot_line/             # 13 個領域模組
│   ├── __init__.py
│   ├── adapter.py
│   ├── client.py
│   ├── webhook.py
│   ├── user_manager.py
│   ├── group_manager.py
│   ├── message_store.py
│   ├── messaging.py
│   ├── file_handler.py
│   ├── trigger.py
│   ├── binding.py
│   ├── admin.py
│   ├── memory.py
│   └── constants.py
├── bot/                  # 平台無關的 Bot 核心
│   ├── __init__.py
│   ├── adapter.py        # BotAdapter Protocol
│   ├── message.py
│   ├── ai.py
│   ├── agents.py
│   └── media.py
├── errors.py             # 統一錯誤層級
└── ...
```

### 開發體驗

| 面向 | 拆分前 | 拆分後 |
|------|--------|--------|
| 找函式 | 在 1000 行裡搜尋 | 直接打開對應模組 |
| 修改影響範圍 | 整個檔案 | 單一模組 |
| Code Review | 差異很長，難以聚焦 | 差異集中在特定領域 |
| 單元測試 | mock 整個大模組 | 只 mock 該模組的依賴 |
| 新增功能 | 往巨型檔案繼續堆 | 新建或擴充對應模組 |

---

## 拆分原則總結

回顧整個重構過程，幾個實用的原則：

1. **先抽核心，再拆領域**。把共用的基礎設施（FastMCP 實例、DB 連線、權限檢查）抽到 `server.py`，其他模組都依賴它，避免循環匯入。

2. **用 `__init__.py` 維持外部 API 穩定**。內部怎麼拆是實作細節，外部呼叫者不應該感知到變化。

3. **一個模組一個領域**。知識庫的工具就放 `knowledge_tools.py`，不要跟 NAS 檔案混在一起。判斷標準是：如果兩個函式永遠不會同時被修改，它們就不該在同一個檔案。

4. **統一錯誤處理先行**。在拆分之前先建好 `ServiceError` 層級，這樣拆分過程中可以順便把各種 `raise ValueError` 替換掉，一舉兩得。

5. **裝飾器註冊模式**。FastMCP 的 `@mcp.tool()` 是 side-effect import——匯入模組時就會註冊工具。`__init__.py` 裡的 `from . import knowledge_tools  # noqa: F401` 就是利用這個特性，noqa 告訴 linter 這不是「未使用的匯入」。

---

## 小結

模組化重構不是什麼高深的技術，但它需要紀律。最大的挑戰不是「怎麼拆」，而是「什麼時候停」。拆太細會增加模組間的跳轉成本，拆太粗又回到老問題。

這次的經驗法則是：**一個模組的行數在 100-300 行之間最舒服**。超過 500 行就該考慮再拆，低於 50 行可以考慮合併。

拆完之後，加新功能的體驗明顯改善了。要加一個新的 MCP 工具？新建一個 `xxx_tools.py`，在 `__init__.py` 加一行 import，完事。要改 Line Bot 的訊息發送邏輯？打開 `messaging.py`，其他模組完全不用碰。

---

## 參考資源

- [移除多租戶架構]({% post_url 2026-02-05-ctos-remove-multi-tenant %})
- [MCP 工具概論]({% post_url 2026-01-04-mcp-introduction %})
- [FastMCP 專案工具]({% post_url 2026-01-05-fastmcp-project-tools %})
- [FastMCP 知識庫工具]({% post_url 2026-01-06-fastmcp-knowledge-tools %})
- [Line Bot 系列：Webhook 與事件處理]({% post_url 2025-12-30-linebot-part1-webhook %})
