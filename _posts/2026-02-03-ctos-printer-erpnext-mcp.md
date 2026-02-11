---
layout: post
title: "ChingTech OS：整合 Printer MCP 與 ERPNext MCP"
subtitle: "讓 AI 助理能列印文件和查詢 ERP 系統"
date: 2026-02-03
categories: [ChingTech OS]
tags: [ChingTech OS, MCP, 列印, ERPNext, ERP, AI, Python]
---

![ChingTech OS：整合 Printer MCP 與 ERPNext MCP](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-03-ctos-printer-erpnext-mcp.png)

## 前言

ChingTech OS（CTOS）過去的 MCP 工具都是自建的——專案管理、知識庫、檔案搜尋、簡報生成，全部定義在同一個 FastMCP Server 裡。但隨著需求擴展，有些能力不適合自己從頭寫：印表機控制需要跟系統 CUPS 互動，ERP 操作需要串接 ERPNext 的 REST API。

這時候 MCP 協議的優勢就顯現了：**每個 MCP Server 各自獨立，AI Agent 可以同時使用多個 Server 的工具**。我們不需要把所有邏輯塞進同一個 Server，而是讓 printer-mcp 專心做列印、erpnext-mcp 專心做 ERP 操作，CTOS 只負責整合和橋接。

這篇記錄的就是這次整合的完整過程：如何把兩個獨立的 MCP Server 接進 CTOS 平台，讓使用者透過 Line 或 Telegram 對 AI 說「幫我印這份報告」或「查一下某料號的庫存」，AI 就能直接完成。

---

## 整體架構

整合後的 MCP 工具分佈在三個 Server：

```
使用者（Line / Telegram）
       │
       ▼
  AI Agent（Claude）
       │
       ├── ching-tech-os MCP Server（自建）
       │     ├── 知識庫工具
       │     ├── 檔案管理工具
       │     ├── 簡報/文件生成工具
       │     ├── 記憶管理工具
       │     └── prepare_print_file（列印前置處理）
       │
       ├── printer-mcp Server（獨立）
       │     ├── print_file
       │     ├── list_printers
       │     ├── printer_status
       │     ├── cancel_job
       │     └── print_test_page
       │
       └── erpnext-mcp Server（獨立）
             ├── list_documents / get_document
             ├── create_document / update_document
             ├── get_stock_balance / get_stock_ledger
             ├── run_method / search_link
             └── ...（共 19 個工具）
```

每個 Server 獨立運行，AI Agent 透過工具名稱前綴區分來源：`mcp__ching-tech-os__`、`mcp__printer__`、`mcp__erpnext__`。

---

## Printer MCP 整合

### prepare_print_file：列印前置處理工具

printer-mcp 只接受**絕對路徑**的檔案，但 CTOS 內部使用虛擬路徑（如 `ctos://knowledge/attachments/report.pdf`、`shared://projects/...`）。因此需要一個橋接工具做路徑轉換。

`prepare_print_file` 定義在 CTOS 的 `presentation_tools.py`，負責三件事：

1. **虛擬路徑轉換**：把 `ctos://` 或 `shared://` 路徑轉成實際的檔案系統路徑
2. **Office 文件轉 PDF**：`.docx`、`.xlsx`、`.pptx` 等格式自動透過 LibreOffice 轉換
3. **安全檢查**：只允許存取 `/mnt/nas/` 和 `/tmp/ctos/` 下的檔案

```python
# 需透過 LibreOffice 轉 PDF 的格式
OFFICE_EXTENSIONS = {
    ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt",
    ".odt", ".ods", ".odp",
}

# printer-mcp 可直接列印的格式
PRINTABLE_EXTENSIONS = {
    ".pdf", ".txt", ".log", ".csv",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp",
}

# 允許存取的路徑前綴
ALLOWED_PRINT_PATHS = ("/mnt/nas/", "/tmp/ctos/")
```

工具的核心邏輯很直覺——先解析路徑，再根據副檔名決定是直接回傳還是先轉 PDF：

```python
@mcp.tool()
async def prepare_print_file(
    file_path: str,
    ctos_user_id: int | None = None,
) -> str:
    """將虛擬路徑轉換為可列印的絕對路徑，Office 文件會自動轉為 PDF"""
    # 路徑轉換：虛擬路徑 → 絕對路徑
    if "://" in file_path:
        actual_path = Path(path_manager.to_filesystem(file_path))
    else:
        actual_path = Path(file_path)

    # 安全檢查
    if not any(str(actual_path).startswith(prefix) for prefix in ALLOWED_PRINT_PATHS):
        return "不允許存取此路徑的檔案。"

    ext = actual_path.suffix.lower()

    if ext in PRINTABLE_EXTENSIONS:
        # 直接可印，回傳絕對路徑
        return f"請使用 printer-mcp 的 print_file 工具列印：\n絕對路徑：{actual_path}"

    if ext in OFFICE_EXTENSIONS:
        # Office 文件，先轉 PDF
        proc = await asyncio.create_subprocess_exec(
            "libreoffice", "--headless", "--convert-to", "pdf",
            "--outdir", "/tmp/ctos/print", str(actual_path),
        )
        await proc.communicate()
        pdf_path = f"/tmp/ctos/print/{actual_path.stem}.pdf"
        return f"已轉換為 PDF：\n絕對路徑：{pdf_path}"
```

### 列印流程：兩步驟協作

列印是一個**跨 Server 的兩步驟流程**：

```
步驟 1（ching-tech-os）         步驟 2（printer-mcp）
prepare_print_file          →   print_file
  輸入：ctos://report.pdf       輸入：/mnt/nas/.../report.pdf
  輸出：/mnt/nas/.../report.pdf  輸出：列印完成
```

AI Agent 會自動理解這個流程，因為在 Prompt 中我們明確描述了兩步驟的關係。

### 預設灰階列印與 color_mode 參數

在 Prompt 設計上，有一個重要的省成本考量：

```python
PRINTER_TOOLS_PROMPT = """【列印功能】
...
步驟 2 - 實際列印（printer-mcp 工具）：
- mcp__printer__print_file: 將檔案送至印表機列印
  · color_mode: 色彩模式（可選，gray/color，預設 gray。
    除非用戶要求彩色列印，否則一律用 gray）
..."""
```

透過在 Prompt 中寫明「除非用戶要求彩色，否則一律灰階」，AI 就會自動在呼叫 `print_file` 時帶上 `color_mode="gray"`。這比在 printer-mcp 端硬編碼預設值更有彈性——使用者只要說「彩色印」，AI 就會切換成 `color_mode="color"`。

### Telegram 平台的 send_nas_file 支援

在整合 printer-mcp 的同時，也擴展了 `send_nas_file` 工具支援 Telegram 平台。原本只支援 Line，現在加入 `telegram_chat_id` 參數：

```python
@mcp.tool()
async def send_nas_file(
    file_path: str,
    line_user_id: str | None = None,
    line_group_id: str | None = None,
    telegram_chat_id: str | None = None,   # 新增
    ctos_user_id: int | None = None,
) -> str:
    """直接發送 NAS 檔案給用戶"""
    if not line_user_id and not line_group_id and not telegram_chat_id:
        return "錯誤：請從【對話識別】區塊取得 ID"
    ...
```

這讓 Telegram 用戶也能直接在對話中收到 NAS 檔案，不再需要透過分享連結。

---

## ERPNext MCP 整合

### 為什麼要整合 ERPNext？

CTOS 原本有自建的專案管理（23 個工具）、廠商管理（3 個工具）、物料管理（10 個工具），合計 36 個 MCP 工具。這些功能雖然可用，但有幾個問題：

1. 功能受限——缺少採購單、銷售單、會計等進階功能
2. 維護成本高——每次新增欄位都要改 Model、API、前端
3. 資料孤島——無法與其他 ERP 模組連動

ERPNext 已部署在內部（`http://ct.erp`），具備完整的 ERP 功能。透過 [erpnext-mcp]({% post_url 2026-02-03-erpnext-mcp-server %}) 提供的 19 個通用工具，可以完全覆蓋原有需求，並額外獲得採購、銷售、會計等能力。

### 設定工具清單

在 Telegram handler 中，直接把 erpnext-mcp 的工具名稱加入 AI Agent 的工具清單：

```python
# 加入 ERPNext MCP 工具（廠商/客戶/庫存/專案管理）
erpnext_tools = [
    "mcp__erpnext__list_documents",
    "mcp__erpnext__get_document",
    "mcp__erpnext__create_document",
    "mcp__erpnext__update_document",
    "mcp__erpnext__delete_document",
    "mcp__erpnext__submit_document",
    "mcp__erpnext__cancel_document",
    "mcp__erpnext__run_report",
    "mcp__erpnext__get_stock_balance",
    "mcp__erpnext__get_stock_ledger",
    "mcp__erpnext__get_count",
    "mcp__erpnext__get_list_with_summary",
    "mcp__erpnext__run_method",
    # ... 共 19 個工具
]

# 所有工具合併
all_tools = (
    builtin_tools + mcp_tools + nanobanana_tools
    + printer_tools + erpnext_tools + ["Read"]
)
```

printer-mcp 的工具也是同樣方式加入：

```python
printer_tools = [
    "mcp__printer__print_file",
    "mcp__printer__list_printers",
    "mcp__printer__printer_status",
    "mcp__printer__cancel_job",
    "mcp__printer__print_test_page",
]
```

### AI Agent Prompt 更新

光是註冊工具不夠，還需要告訴 AI **什麼時候該用這些工具、怎麼用**。這是透過 Prompt 區塊來實現的。

在 `bot/agents.py` 中，按功能模組定義了詳細的 Prompt 區塊：

```python
# 專案管理（遷移至 ERPNext）
PROJECT_TOOLS_PROMPT = """【專案管理】（使用 ERPNext）
專案管理功能已遷移至 ERPNext 系統，請使用 ERPNext MCP 工具操作：

【查詢專案】
- mcp__erpnext__list_documents: 查詢專案列表
  · doctype: "Project"
  · filters: 可依狀態過濾，如 '{"status": "Open"}'

【任務管理】
- mcp__erpnext__list_documents: 查詢專案任務
  · doctype: "Task"
  · filters: '{"project": "專案名稱"}'

【操作範例】
1. 查詢進行中的專案：
   mcp__erpnext__list_documents(doctype="Project", filters='{"status":"Open"}')
2. 更新任務狀態：
   mcp__erpnext__update_document(doctype="Task", name="TASK-00001",
     data='{"status":"Completed"}')
"""
```

物料管理的 Prompt 也一樣改用 ERPNext 工具：

```python
INVENTORY_TOOLS_PROMPT = """【物料/庫存管理】（使用 ERPNext）

【廠商/客戶管理】
使用通用查詢工具：
- mcp__erpnext__list_documents: 查詢廠商/客戶列表
  · doctype: "Supplier" 或 "Customer"
  · filters: 可依名稱、群組等條件過濾
- mcp__erpnext__get_document: 查詢廠商/客戶完整資料

【查詢庫存】
- mcp__erpnext__get_stock_balance: 查詢即時庫存
- mcp__erpnext__get_stock_ledger: 查詢庫存異動記錄
"""
```

### 動態 Prompt 生成

不是每個使用者都需要看到所有工具說明。`generate_tools_prompt` 函數根據使用者的 App 權限，動態組合 Prompt：

```python
APP_PROMPT_MAPPING: dict[str, str] = {
    "project-management": PROJECT_TOOLS_PROMPT,
    "inventory-management": INVENTORY_TOOLS_PROMPT,
    "knowledge-base": KNOWLEDGE_TOOLS_PROMPT,
    "file-manager": FILE_TOOLS_PROMPT,
    "ai-assistant": AI_IMAGE_TOOLS_PROMPT + "\n\n" + AI_DOCUMENT_TOOLS_PROMPT,
    "printer": PRINTER_TOOLS_PROMPT,
}

def generate_tools_prompt(app_permissions: dict[str, bool]) -> str:
    sections = [BASE_TOOLS_PROMPT]  # 基礎工具永遠包含
    for app_id, prompt_section in APP_PROMPT_MAPPING.items():
        if app_permissions.get(app_id, False):
            sections.append(prompt_section)
    return "\n\n".join(sections)
```

這樣一來，沒有「列印」權限的使用者就不會在 Prompt 中看到列印相關的說明，減少 AI 混淆和 token 消耗。

---

## Legacy Code Cleanup

整合 ERPNext 之後，CTOS 中原有的 36 個專案/廠商/物料 MCP 工具就不再需要了。清理的策略是：

### 移除已棄用的工具

原本在 `permissions.py` 中有一個 `DEPRECATED_TOOLS` dict，用來將舊工具導向 ERPNext。清理完成後，這些工具的程式碼已完全移除，只留下空結構供未來使用：

```python
# 原有的專案/廠商/物料管理工具已完全移除（遷移至 ERPNext）
DEPRECATED_TOOLS: dict[str, str] = {}

# ERPNext 工具對應指引（已整合至 AI Agent Prompt）
ERPNEXT_GUIDANCE: dict[str, str] = {}
```

### 分享連結工具的更新

`create_share_link` 工具也做了相應調整，移除了 `project` 和 `project_attachment` 資源類型：

```python
@mcp.tool()
async def create_share_link(resource_type: str, resource_id: str, ...) -> str:
    # 驗證資源類型（專案相關類型已移除）
    valid_types = ("knowledge", "nas_file")
    if resource_type not in valid_types:
        if resource_type in ("project", "project_attachment"):
            return "錯誤：專案分享功能已遷移至 ERPNext"
        return f"錯誤：資源類型必須是 {', '.join(valid_types)}"
```

---

## Migration 整併

在多次迭代後，CTOS 的資料庫 migration 已經累積了多個版本。趁這次大整理，將 migration 整併為兩個基礎檔案：

| 檔案 | 用途 |
|------|------|
| `001_initial_schema.py` | 完整的資料庫結構（從 `clean_schema.sql` 載入） |
| `seed_data.sql` | 預設資料（租戶、AI Prompts、Agent 設定） |

`001_initial_schema.py` 的做法是直接執行 `pg_dump` 匯出的 SQL，確保新環境能一次性建好所有表格：

```python
def upgrade() -> None:
    connection = op.get_bind()
    raw_conn = connection.connection.dbapi_connection
    cur = raw_conn.cursor()

    # 1. 執行 schema SQL（建立表格結構）
    schema_path = os.path.join(base_path, 'clean_schema.sql')
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
    cur.execute(schema_sql)

    # 2. 建立分區表
    cur.execute("SELECT create_ai_logs_partition()")
    cur.execute("SELECT create_next_month_partitions()")
```

`seed_data.sql` 則包含 AI Prompt 的預設內容，已經內建了 ERPNext 的操作指引，新環境部署完就能直接使用。

---

## 權限系統的調整

### 新增 printer App 權限

在 `permissions.py` 中，新增了 `printer` 作為獨立的 App 權限：

```python
DEFAULT_APP_PERMISSIONS: dict[str, bool] = {
    "file-manager": True,
    "project-management": True,
    "inventory-management": True,
    "knowledge-base": True,
    "ai-assistant": True,
    "md2ppt": True,
    "md2doc": True,
    "printer": True,       # 列印功能，預設開放
    # ...
}

TOOL_APP_MAPPING: dict[str, str | None] = {
    # 列印前置處理工具
    "prepare_print_file": "printer",
    # ...
}
```

`prepare_print_file` 在執行時會檢查使用者是否有 `printer` 權限：

```python
@mcp.tool()
async def prepare_print_file(file_path: str, ctos_user_id: int | None = None) -> str:
    if ctos_user_id:
        allowed, error_msg = await check_mcp_tool_permission(
            "prepare_print_file", ctos_user_id
        )
        if not allowed:
            return f"❌ {error_msg}"
    ...
```

---

## 小結

這次整合的核心思路是：**讓每個 MCP Server 做它最擅長的事**。

- **printer-mcp** 專注於印表機控制，CTOS 只負責路徑轉換和安全檢查
- **erpnext-mcp** 專注於 ERPNext API 操作，CTOS 只負責 Prompt 引導和權限控制
- **CTOS 自身** 保留知識庫、檔案管理、簡報生成等核心功能

整合後的效果：

| 改變 | 之前 | 之後 |
|------|------|------|
| 專案/物料/廠商管理 | 自建 36 個 MCP 工具 | 使用 ERPNext MCP 19 個通用工具 |
| 列印功能 | 無 | prepare_print_file + printer-mcp |
| ERP 功能 | 基礎 CRUD | 完整 ERP（採購/銷售/會計/庫存） |
| Migration | 累積多個版本 | 整併為 001 schema + seed data |
| 程式碼量 | ~2000 行工具程式碼 | 移除，改用 Prompt 引導 |

MCP 協議的多 Server 架構，讓整合外部工具變得非常自然。不需要修改任何 Server 的程式碼，只要在 AI Agent 端註冊工具名稱、寫好 Prompt 就好。這也是我認為 MCP 最有價值的地方——**標準化的工具介面，讓不同系統能無縫協作**。

---

## 參考資源

- [printer-mcp Server]({% post_url 2026-02-02-printer-mcp-server %})
- [erpnext-mcp Server]({% post_url 2026-02-03-erpnext-mcp-server %})
- [MCP 協議介紹]({% post_url 2026-01-04-mcp-introduction %})
- [MCP 工具權限控制]({% post_url 2026-01-07-mcp-permission %})
