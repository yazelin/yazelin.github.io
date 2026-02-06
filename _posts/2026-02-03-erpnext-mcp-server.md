---
layout: post
title: "erpnext-mcp — 讓 AI 操作你的 ERP 系統"
subtitle: "用 MCP 協議串接 ERPNext REST API，實現 AI 驅動的企業資源管理"
date: 2026-02-03
categories: [Claude Code]
tags: [Claude Code, MCP, ERPNext, Python, ERP, PyPI]
---

## 前言

[ERPNext](https://erpnext.com/) 是一套開源的企業資源規劃系統，涵蓋銷售、採購、庫存、會計等模組。功能強大，但操作介面對一般使用者來說仍有學習門檻——查一筆庫存要點好幾層選單，開一張報價單要填一堆欄位。

如果能用自然語言跟 AI 說「幫我查某某料號的庫存」或「建一張報價單給某客戶」，讓 AI 直接操作 ERPNext，那不是方便很多嗎？

**erpnext-mcp** 就是為此而生的 MCP Server。它把 ERPNext 的 REST API 包裝成標準的 MCP 工具，讓 Claude Code、Claude Desktop 等 MCP 客戶端能直接與 ERPNext 互動。

---

## 專案架構

整個專案的結構非常精簡，三個檔案各司其職：

```
src/erpnext_mcp/
├── server.py   # MCP 工具定義（FastMCP）
├── client.py   # ERPNext REST API 客戶端（httpx async）
└── types.py    # Pydantic 資料模型
```

### API 連接方式

ERPNext 提供 token-based 的 REST API 認證。`client.py` 用 `httpx.AsyncClient` 建立非同步 HTTP 連線，以 API Key + Secret 進行驗證：

```python
class ERPNextClient:
    def __init__(self, url: str, api_key: str, api_secret: str):
        self.base_url = url.rstrip("/")
        self.headers = {
            "Authorization": f"token {api_key}:{api_secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=self.headers,
                timeout=30.0,
            )
        return self._client
```

所有 API 呼叫都走 async，配合 FastMCP 的 async tool 定義，整體是非阻塞的架構。

---

## MCP 工具一覽

`server.py` 透過 FastMCP 的 `@mcp.tool()` decorator 定義了 19 個工具，可分為五大類：

### CRUD 基本操作

| 工具 | 說明 |
|------|------|
| `list_documents` | 列表查詢，支援篩選、排序、分頁 |
| `get_document` | 取得單一文件 |
| `create_document` | 建立新文件 |
| `update_document` | 更新現有文件 |
| `delete_document` | 刪除文件 |

這五個工具幾乎能操作 ERPNext 中所有的 DocType（文件類型），因為 ERPNext 的 REST API 本身就是以 DocType 為核心的通用設計。

### 工作流程

| 工具 | 說明 |
|------|------|
| `submit_document` | 提交可提交的文件（如銷售發票） |
| `cancel_document` | 取消已提交的文件 |

ERPNext 中許多文件有「草稿 -> 已提交 -> 已取消」的生命週期，這兩個工具處理的就是狀態轉換。

### 報表與統計

| 工具 | 說明 |
|------|------|
| `run_report` | 執行 ERPNext 內建報表 |
| `get_count` | 取得文件數量 |
| `get_list_with_summary` | 列表查詢 + 總數統計 |

### Schema 與輔助

| 工具 | 說明 |
|------|------|
| `list_doctypes` | 列出所有可用的 DocType |
| `get_doctype_meta` | 取得 DocType 的欄位定義 |
| `search_link` | 連結欄位自動完成搜尋 |
| `run_method` | 呼叫任何白名單 server-side 方法 |

`get_doctype_meta` 特別有用——AI 可以先查詢某個 DocType 有哪些欄位，再決定如何建立或更新文件。

### 庫存與交易

| 工具 | 說明 |
|------|------|
| `get_stock_balance` | 即時庫存查詢（from Bin） |
| `get_stock_ledger` | 庫存異動紀錄 |
| `get_item_price` | 料號價格查詢 |
| `make_mapped_doc` | 文件轉換（如報價單 -> 銷售訂單） |
| `get_party_balance` | 客戶 / 供應商應收應付餘額 |

`make_mapped_doc` 對應的是 ERPNext 中常見的文件轉換流程，例如：

```
報價單 → 銷售訂單 → 出貨單 → 銷售發票
採購訂單 → 採購收貨 → 採購發票
```

---

## 安裝與設定

### 從 PyPI 安裝

```bash
pip install erpnext-mcp
```

### 從原始碼安裝

```bash
git clone https://github.com/ching-tech/erpnext-mcp
cd erpnext-mcp
uv sync
```

### 環境變數

需要設定三個環境變數：

```bash
ERPNEXT_URL=https://your-erpnext-instance.com
ERPNEXT_API_KEY=your_api_key
ERPNEXT_API_SECRET=your_api_secret
```

API Key 和 Secret 可以在 ERPNext 的「使用者設定 > API 存取」中產生。

### 在 Claude Desktop 中設定

在 `claude_desktop_config.json` 加入：

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "uv",
      "args": ["--directory", "/path/to/erpnext-mcp", "run", "erpnext-mcp"],
      "env": {
        "ERPNEXT_URL": "https://your-erpnext-instance.com",
        "ERPNEXT_API_KEY": "your_api_key",
        "ERPNEXT_API_SECRET": "your_api_secret"
      }
    }
  }
}
```

如果是透過 PyPI 安裝，也可以直接用 `uvx`：

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "uvx",
      "args": ["erpnext-mcp"],
      "env": {
        "ERPNEXT_URL": "https://your-erpnext-instance.com",
        "ERPNEXT_API_KEY": "your_api_key",
        "ERPNEXT_API_SECRET": "your_api_secret"
      }
    }
  }
}
```

---

## 使用情境範例

以下是幾個實際的使用情境，展示 AI + ERP 的互動方式。

### 情境一：查詢庫存

```
使用者：某某料號目前庫存多少？

AI：（調用 get_stock_balance，item_code="ITEM-001"）
AI：料號 ITEM-001 的庫存狀況：
    - 成品倉：實際數量 150，預留 20，可用 130
    - 原料倉：實際數量 0
```

### 情境二：建立報價單

```
使用者：幫我建一張報價單給客戶 ABC 公司，品項是 ITEM-001 數量 100

AI：（調用 get_doctype_meta 了解 Quotation 欄位結構）
AI：（調用 get_item_price 查詢 ITEM-001 價格）
AI：（調用 create_document 建立 Quotation）
AI：已建立報價單 QTN-2026-00123，
    客戶：ABC 公司，品項：ITEM-001 x 100，
    單價 50.00，總計 5,000.00
```

### 情境三：訂單轉出貨

```
使用者：SO-2026-00456 可以出貨了，幫我轉成出貨單

AI：（調用 get_document 確認訂單狀態）
AI：（調用 make_mapped_doc 將 Sales Order 轉為 Delivery Note）
AI：已從銷售訂單 SO-2026-00456 建立出貨單 DN-2026-00789，
    包含 3 個品項，請確認後提交。
```

### 情境四：月結報表

```
使用者：這個月的銷售狀況如何？

AI：（調用 run_report 執行 Sales Analytics 報表）
AI：（調用 get_count 統計訂單數量）
AI：2026 年 1 月銷售摘要：
    - 銷售訂單：45 筆
    - 總營收：NT$ 2,350,000
    - 前三大客戶：...
```

---

## 技術選型

| 項目 | 選擇 | 理由 |
|------|------|------|
| MCP 框架 | FastMCP >= 2.0 | decorator 風格，自動產生 schema |
| HTTP 客戶端 | httpx | 原生 async 支援 |
| 資料驗證 | Pydantic >= 2.0 | 型別安全的資料模型 |
| 套件管理 | uv + hatchling | 現代 Python 打包工具 |
| Python 版本 | >= 3.11 | 支援 `X | Y` union 語法 |

---

## 小結

erpnext-mcp 的核心想法很簡單：把 ERPNext 的 REST API 用 MCP 標準包一層，讓 AI 能直接操作 ERP。

實際效果是，原本要在 ERPNext 介面上點來點去的操作，現在可以用一句話完成。對於熟悉 ERPNext 資料模型的使用者來說，這大幅提升了操作效率；對於不熟悉的使用者，AI 可以先透過 `list_doctypes` 和 `get_doctype_meta` 了解系統結構，再進行操作。

這個專案也展示了 MCP 協議的一個重要應用方向：**讓 AI 成為企業系統的操作介面**。不只是 ERPNext，任何有 REST API 的企業系統都可以用同樣的模式接入 MCP，讓 AI 來操作。

---

## 參考資源

- [erpnext-mcp GitHub](https://github.com/ching-tech/erpnext-mcp)
- [ERPNext 官方網站](https://erpnext.com/)
- [ERPNext REST API 文件](https://frappeframework.com/docs/user/en/api/rest)
- [FastMCP GitHub](https://github.com/jlowin/fastmcp)
- [MCP 官方文件](https://modelcontextprotocol.io/)
- [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})
