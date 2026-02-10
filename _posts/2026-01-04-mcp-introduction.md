---
layout: post
title: "MCP 協議入門：讓 AI 使用你的工具"
subtitle: "Model Context Protocol 標準化 AI 與外部系統的互動"
date: 2026-01-04
categories: [ChingTech OS]
tags: [MCP, Claude, AI, FastMCP, Python, ChingTech OS]
---

![MCP 協議入門：讓 AI 使用你的工具](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-04-mcp-introduction.png)

## 前言

在 [Line Bot AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %}) 中，我們讓 AI 助理能夠調用 MCP 工具來操作專案、知識庫等功能。這篇來深入介紹 **MCP（Model Context Protocol）**——一個讓 AI 使用外部工具的標準協議。

如果你還沒看過 [Claude AI 整合系列]({% post_url 2025-12-11-claude-ai-part1-architecture %})，建議先了解 Claude API 的基本整合方式。本篇會在那個基礎上，加入工具調用的能力。

---

## 什麼是 MCP？

**MCP（Model Context Protocol）** 是 Anthropic 提出的開放標準，用於讓 AI 模型與外部系統互動。

### 傳統做法的問題

```
用戶：「幫我查專案 P-2025-001 的進度」

AI：抱歉，我無法存取您的專案系統。請您自行查詢後告訴我。
```

AI 模型本身無法存取外部資料庫、檔案系統或 API。傳統做法是自己實作 function calling，但每個專案都要重新開發。

### MCP 解決方案

```
用戶：「幫我查專案 P-2025-001 的進度」

AI：（調用 query_project 工具）
AI：專案「水切爐改善」目前進度：
    - 狀態：進行中
    - 完成里程碑：設計審查、採購下單
    - 待完成：安裝測試、驗收
```

MCP 提供標準化的工具定義和調用機制，讓你只需定義一次工具，就能在多個 AI 客戶端中使用。

---

## MCP 架構

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Client                                                  │
│  - Claude Code CLI                                           │
│  - Line Bot AI                                               │
│  - 其他 MCP 客戶端                                           │
└──────────────────────────┬──────────────────────────────────┘
                           │ stdio / HTTP
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  MCP Server                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Tools（工具）                                           ││
│  │  - query_project    - add_project_member                ││
│  │  - search_knowledge - add_note                          ││
│  │  - search_nas_files - create_share_link                 ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Resources（資源）                                       ││
│  │  - 檔案、資料庫、API 連線                               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 核心概念

| 概念 | 說明 |
|------|------|
| **Server** | 提供工具的服務端，可用 Python、TypeScript 等實作 |
| **Client** | 調用工具的客戶端，如 Claude Code CLI |
| **Tool** | 具體的功能，有名稱、描述、參數定義 |
| **Resource** | 工具可存取的資源（檔案、資料庫等） |

### 通訊方式

MCP 支援兩種通訊模式：

1. **stdio**：透過標準輸入輸出，適合本地 CLI 工具
2. **HTTP/SSE**：透過網路連線，適合遠端服務

---

## FastMCP 簡介

**FastMCP** 是 Python 的 MCP Server 實作框架，特點是：

- 使用 decorator 定義工具
- 從 type hints 自動產生參數 schema
- 從 docstring 自動產生工具描述
- 支援 async/await

### 安裝

```bash
pip install mcp
# 或使用 uv
uv add mcp
```

### 最小範例

```python
from mcp.server.fastmcp import FastMCP

# 建立 Server 實例
mcp = FastMCP("my-server")

@mcp.tool()
def hello(name: str) -> str:
    """
    打招呼

    Args:
        name: 要打招呼的對象
    """
    return f"Hello, {name}!"

# 執行（stdio 模式）
if __name__ == "__main__":
    mcp.run()
```

執行後，這個工具就可以被 Claude Code CLI 或其他 MCP 客戶端調用。

---

## 工具定義詳解

### 基本結構

```python
@mcp.tool()
async def my_tool(
    required_param: str,           # 必填參數
    optional_param: int = 10,      # 選填參數（有預設值）
) -> str:
    """
    工具的簡短描述（第一行會成為工具說明）

    Args:
        required_param: 必填參數的說明
        optional_param: 選填參數的說明，預設 10
    """
    # 工具邏輯
    return "結果"
```

### 參數類型支援

FastMCP 會根據 type hints 自動產生 JSON Schema：

| Python 類型 | JSON Schema |
|-------------|-------------|
| `str` | `{"type": "string"}` |
| `int` | `{"type": "integer"}` |
| `float` | `{"type": "number"}` |
| `bool` | `{"type": "boolean"}` |
| `list[str]` | `{"type": "array", "items": {"type": "string"}}` |
| `str \| None` | `{"type": "string"}` + nullable |

### 實際範例：查詢專案

```python
@mcp.tool()
async def query_project(
    project_id: str | None = None,
    keyword: str | None = None,
) -> str:
    """
    查詢專案資訊

    Args:
        project_id: 專案 UUID（精確查詢）
        keyword: 關鍵字（模糊搜尋專案名稱）
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        if project_id:
            # UUID 查詢
            row = await conn.fetchrow(
                "SELECT * FROM projects WHERE id = $1",
                UUID(project_id),
            )
            if not row:
                return f"找不到專案：{project_id}"
            return format_project(row)

        elif keyword:
            # 關鍵字搜尋
            rows = await conn.fetch(
                """
                SELECT * FROM projects
                WHERE name ILIKE $1
                ORDER BY updated_at DESC
                LIMIT 10
                """,
                f"%{keyword}%",
            )
            if not rows:
                return f"找不到包含「{keyword}」的專案"
            return "\n\n".join(format_project(row) for row in rows)

        else:
            return "請提供 project_id 或 keyword"
```

---

## 與 Claude Code CLI 整合

### 設定 .mcp.json

在專案根目錄建立 `.mcp.json`：

```json
{
  "mcpServers": {
    "ching-tech-os": {
      "command": "uv",
      "args": ["run", "python", "-m", "ching_tech_os.mcp_cli"],
      "cwd": "/home/ct/SDD/ching-tech-os/backend"
    }
  }
}
```

### 使用方式

啟動 Claude Code CLI 後，可以直接使用工具：

```bash
claude "查詢最近的專案"
# AI 會自動調用 query_project 工具

claude "建立一個新專案叫做「測試專案」"
# AI 會自動調用 create_project 工具

claude "幫我搜尋知識庫中關於水切爐的資料"
# AI 會自動調用 search_knowledge 工具
```

---

## 在程式中直接調用

除了透過 MCP 協議，也可以在程式中直接調用工具：

### 取得工具列表

```python
from ching_tech_os.services.mcp_server import get_mcp_tools

# 取得工具定義（符合 Claude API 格式）
tools = await get_mcp_tools()

# 結果範例
[
    {
        "name": "query_project",
        "description": "查詢專案資訊",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "keyword": {"type": "string"},
            },
        },
    },
    # ...
]
```

### 執行工具

```python
from ching_tech_os.services.mcp_server import execute_tool

# 執行工具
result = await execute_tool("query_project", {"keyword": "水切爐"})
print(result)
# 輸出：專案資訊...

# 建立專案
result = await execute_tool("create_project", {
    "name": "新專案",
    "description": "專案描述",
    "start_date": "2026-01-01",
})
```

### 整合到 Claude API

```python
import anthropic
from ching_tech_os.services.mcp_server import get_mcp_tools, execute_tool

client = anthropic.AsyncAnthropic()

# 取得工具定義
tools = await get_mcp_tools()

# 呼叫 Claude API
response = await client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    tools=tools,
    messages=[{"role": "user", "content": "查詢水切爐專案"}],
)

# 處理工具調用
for block in response.content:
    if block.type == "tool_use":
        # 執行工具
        result = await execute_tool(block.name, block.input)
        # 將結果回傳給 Claude 繼續對話
        # ...
```

---

## 專案結構

```
backend/src/ching_tech_os/
├── mcp_cli.py              # CLI 入口點
└── services/
    └── mcp_server.py       # MCP Server 實作
                            # - FastMCP 實例
                            # - 工具定義
                            # - get_mcp_tools()
                            # - execute_tool()
```

### mcp_cli.py

```python
#!/usr/bin/env python
"""MCP Server CLI 入口點"""

from ching_tech_os.services.mcp_server import mcp

if __name__ == "__main__":
    mcp.run()
```

簡單的入口點，讓 Claude Code CLI 可以透過 stdio 與 MCP Server 通訊。

---

## 小結

MCP 讓 AI 工具調用變得標準化：

- **一次定義，多處使用**：工具定義一次，Claude Code CLI 和 Line Bot 都能用
- **自動產生 Schema**：從 type hints 和 docstring 自動產生
- **靈活整合**：可透過 stdio 或直接調用

下一篇 [FastMCP 實作：專案管理工具開發]({% post_url 2026-01-05-fastmcp-project-tools %}) 會詳細介紹如何實作專案管理相關的 MCP 工具。

---

## 參考資源

- [MCP 官方文件](https://modelcontextprotocol.io/)
- [FastMCP GitHub](https://github.com/jlowin/fastmcp)
- [Anthropic Tool Use 文件](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Claude AI 整合系列]({% post_url 2025-12-11-claude-ai-part1-architecture %})
- [Line Bot AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})
