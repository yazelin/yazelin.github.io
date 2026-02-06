---
layout: post
title: "claude-code-acp-py（上）：ACP 概念與 Client 實作"
subtitle: "用 Python 實作 Agent Communication Protocol，打造事件驅動的 AI Agent 客戶端"
date: 2026-02-04
categories: [Claude Code]
tags: [Claude Code, ACP, Python, API, Claude, AI]
---

## 前言

當我們在 Claude Code CLI 裡輸入一段指令，背後其實是一連串的事件流：文字串流回來、工具被呼叫、權限被請求、檔案被讀寫。如果想用 Python 程式來控制這整個流程——甚至連接到不同的 AI agent——就需要一個標準化的通訊協議。

這就是 **ACP（Agent Client Protocol）** 的角色。

[claude-code-acp-py](https://github.com/yazelin/claude-code-acp-py) 是我用 Python 實作的 ACP 套件，整合了 Anthropic 官方的 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python) 和 [Agent Client Protocol SDK](https://github.com/anthropics/agent-client-protocol)，提供兩個核心客戶端：

- **ClaudeClient**：直接包裝 Claude CLI，用 decorator 註冊事件處理器
- **AcpClient**：透過 ACP 協議連接任意 agent（Claude、Gemini、自訂 agent）

本篇（上篇）聚焦在 ACP 的核心概念與這兩個 Client 的實作細節。下篇會介紹 ACP Proxy，讓 Copilot SDK 也能橋接到任意 ACP 後端。

---

## 什麼是 ACP？

**ACP（Agent Client Protocol）** 是 Anthropic 提出的開放標準，定義了「客戶端」與「AI agent」之間的通訊方式。它基於 JSON-RPC over stdio，讓任何符合協議的客戶端都能與任何符合協議的 agent 對話。

### 為什麼需要 ACP？

傳統上，每個編輯器（Zed、Neovim、JetBrains）要整合 AI 功能，都得各自實作一套 API 呼叫邏輯。ACP 把這層抽象出來：

```
+-------------------------------------------+
|        Editors / ACP Clients              |
|     (Zed, Neovim, JetBrains, etc.)        |
+------------------+------------------------+
                   | ACP (JSON-RPC over stdio)
                   v
+-------------------------------------------+
|          ACP Agent                         |
|   (Claude, Gemini, custom agent)           |
+-------------------------------------------+
```

只要 agent 實作 ACP 協議，任何 ACP 客戶端都能直接連接，不需要為每個編輯器寫一套整合。

### ACP 的核心能力

| 能力 | 說明 |
|------|------|
| **Session 管理** | 建立、fork、恢復、列出 session |
| **雙向串流** | agent 即時回傳文字、工具呼叫、思考過程 |
| **權限請求** | agent 需要執行敏感操作時，向客戶端請求授權 |
| **檔案操作** | 客戶端負責實際的檔案讀寫（安全隔離） |
| **Terminal 操作** | 客戶端負責 shell 執行（安全隔離） |
| **MCP Server 支援** | 動態載入 MCP 工具伺服器 |
| **Model/Command 列舉** | 執行期探索可用模型與指令 |

注意這個設計哲學：**檔案操作和 shell 執行都發生在客戶端**。Agent 不直接碰你的檔案系統，而是透過 ACP 協議請求客戶端代為操作。這是重要的安全邊界。

---

## 為什麼用 Python 實作？

Zed Industries 已經有 [TypeScript 版本](https://github.com/zed-industries/claude-code-acp)的 ACP server。我們用 Python 重新實作，有幾個原因：

| 考量 | 說明 |
|------|------|
| **生態系整合** | Python 是 AI/ML 的主流語言，方便與其他工具串接 |
| **事件驅動 API** | 提供 decorator-based 的 Python 原生介面 |
| **不需 API Key** | 直接使用 Claude CLI 訂閱，無需管理 API 金鑰 |
| **Multi-Agent** | AcpClient 可連接任何 ACP agent，不限於 Claude |

安裝很簡單：

```bash
pip install claude-code-acp
```

需要 Python 3.10+ 和已認證的 Claude CLI（`claude /login`）。

---

## 套件架構總覽

在深入 Client 程式碼之前，先看整體架構：

```
+--------------------------------------------------------------+
|                    claude-code-acp                            |
|                                                              |
|  +----------------+  +-------------+  +-------------------+  |
|  | ClaudeAcpAgent |  | ClaudeClient|  |    AcpClient      |  |
|  |  (ACP Server)  |  | (Python API)|  |  (ACP Client)     |  |
|  +-------+--------+  +------+------+  +-----+-------------+  |
|          |                  |               |                |
|          v                  v               v                |
|     Claude CLI         Claude CLI     Any ACP Agent          |
|    (Agent SDK)        (Agent SDK)    +------------------+    |
|                                      | claude-code      |    |
|  +-----------------------------+     | gemini           |    |
|  |    AcpProxyServer           |     | custom agent     |    |
|  |  (copilot-acp-proxy)       |     +------------------+    |
|  |  Copilot SDK -> ACP backend |                             |
|  +-----------------------------+                             |
+--------------------------------------------------------------+
```

| 元件 | 角色 | 連接對象 |
|------|------|----------|
| `ClaudeAcpAgent` | ACP Server | 編輯器連接「到」它 |
| `ClaudeClient` | Python API（in-process） | 直接呼叫 Claude CLI |
| `AcpClient` | ACP Client（subprocess） | 任何 ACP agent |
| `AcpProxyServer` | Copilot SDK 代理 | Copilot SDK <-> ACP backend |

本篇聚焦在 `ClaudeClient` 和 `AcpClient` 這兩個客戶端的實作。

---

## ClaudeClient：事件驅動的 Claude 介面

`ClaudeClient` 是最直覺的使用方式。它在 Python process 內部直接呼叫 Claude Agent SDK，用 decorator 註冊事件處理器。

### 基本用法

```python
import asyncio
from claude_code_acp import ClaudeClient

async def main():
    client = ClaudeClient(cwd=".", system_prompt="You are a helpful assistant.")

    @client.on_text
    async def handle_text(text: str):
        print(text, end="", flush=True)

    @client.on_tool_start
    async def handle_tool_start(tool_id: str, name: str, input: dict):
        print(f"\n[Tool] {name}")

    @client.on_tool_end
    async def handle_tool_end(tool_id: str, status: str, output):
        icon = "ok" if status == "completed" else "fail"
        print(f" [{icon}]")

    @client.on_permission
    async def handle_permission(name: str, input: dict) -> bool:
        print(f"Permission requested: {name}")
        return True  # 或者詢問使用者

    @client.on_complete
    async def handle_complete():
        print("\n--- Done ---")

    response = await client.query("Create a hello.py file that prints Hello World")
    print(f"\nFull response: {response}")

asyncio.run(main())
```

幾個重點：

1. **所有 handler 都是 async**——整個互動流程基於 asyncio
2. **`on_text` 接收的是串流 chunk**——不是完整回應，而是一段段文字即時到達
3. **`on_permission` 回傳 bool**——True 授權、False 拒絕
4. **`query()` 回傳完整文字**——即使中間已經透過 `on_text` 串流輸出，最終仍可取得完整結果

### 事件處理器一覽

| Decorator | 參數 | 說明 |
|-----------|------|------|
| `@client.on_text` | `(text: str)` | 串流文字 chunk |
| `@client.on_thinking` | `(text: str)` | 思考/推理區塊 |
| `@client.on_tool_start` | `(tool_id, name, input)` | 工具開始執行 |
| `@client.on_tool_end` | `(tool_id, status, output)` | 工具執行完成 |
| `@client.on_permission` | `(name, input) -> bool` | 權限請求 |
| `@client.on_error` | `(exception)` | 錯誤發生 |
| `@client.on_complete` | `()` | 查詢完成 |

### 內部實作：串流文字去重

Claude Agent SDK 的串流行為有些特殊——同一段文字可能以「累積式」或「增量式」到達。`ClaudeClient` 內部實作了智慧去重邏輯：

```python
# client.py 的 EventHandler 內部
if current_len == 0:
    # 第一個 chunk，直接輸出
    client._text_buffer = text
    if client.events.on_text:
        await client.events.on_text(text)
elif text == client._text_buffer:
    # 完全重複，跳過
    pass
elif text.startswith(client._text_buffer):
    # 累積式更新 - text 擴展了 buffer，只輸出新的部分
    new_part = text[current_len:]
    if new_part:
        client._text_buffer = text
        if client.events.on_text:
            await client.events.on_text(new_part)
else:
    # 新的增量 chunk - 直接附加到 buffer
    client._text_buffer += text
    if client.events.on_text:
        await client.events.on_text(text)
```

這段邏輯確保使用者的 `on_text` handler 永遠只會收到「新的文字」，不會重複。不管底層 SDK 是送整段累積文字還是只送差異部分，行為都一致。

### 權限處理機制

當 Claude 需要執行檔案寫入、shell 命令等敏感操作時，會透過 ACP 發出權限請求。`ClaudeClient` 的 `EventHandler` 內部這樣處理：

```python
async def request_permission(self, **kwargs: Any) -> dict:
    tool_call = kwargs.get("tool_call", {})
    name = tool_call.get("title", "Unknown")
    raw_input = tool_call.get("raw_input", {})

    approved = True
    if client.events.on_permission:
        approved = await client.events.on_permission(name, raw_input)

    if approved:
        return {"outcome": {"outcome": "selected", "option_id": "allow"}}
    return {"outcome": {"outcome": "selected", "option_id": "reject"}}
```

如果沒有註冊 `on_permission` handler，預設全部允許。這在自動化腳本中很方便，但在互動式應用中你會想加上確認邏輯。

### Session 與 Mode 管理

```python
# 初始化時可帶 MCP server 和 system prompt
client = ClaudeClient(cwd=".", mcp_servers=[...], system_prompt="...")

# 手動建立 session（query 會自動建立）
session_id = await client.start_session()

# 設定權限模式
await client.set_mode("acceptEdits")  # 或 "default", "plan", "bypassPermissions"
```

`bypassPermissions` 模式會跳過所有權限確認，適合完全信任的自動化場景：

```python
async def main():
    client = ClaudeClient(cwd=".")
    await client.set_mode("bypassPermissions")

    @client.on_text
    async def on_text(text):
        print(text, end="")

    await client.query("Create a complete Flask app with tests")
```

---

## AcpClient：連接任意 ACP Agent

`AcpClient` 是更通用的版本。它不直接呼叫 Claude SDK，而是透過 ACP 協議（JSON-RPC over stdio）與任何 ACP agent subprocess 溝通。

### 與 ClaudeClient 的差異

| 特性 | `ClaudeClient` | `AcpClient` |
|------|----------------|-------------|
| 使用方式 | 直接呼叫 Claude Agent SDK | 透過 subprocess + stdio |
| 支援 agent | 僅 Claude | 任何 ACP 相容 agent |
| 檔案/Terminal hook | 無 | 有（可攔截操作） |
| 連接方式 | In-process | Subprocess |
| 適用場景 | 簡單 Python 應用 | Multi-agent、測試、彈性整合 |

### 基本用法

```python
import asyncio
from claude_code_acp import AcpClient

async def main():
    client = AcpClient(command="claude-code-acp")

    @client.on_text
    async def handle_text(text: str):
        print(text, end="", flush=True)

    @client.on_tool_start
    async def handle_tool(tool_id: str, name: str, input: dict):
        print(f"\n[Tool] {name}")

    @client.on_permission
    async def handle_permission(name: str, input: dict, options: list) -> str:
        """回傳 option_id: 'allow', 'reject', 或 'allow_always'"""
        print(f"Permission: {name}")
        return "allow"

    @client.on_complete
    async def handle_complete():
        print("\n--- Done ---")

    async with client:
        response = await client.prompt("What files are here?")

asyncio.run(main())
```

注意幾個差異：

1. **使用 `async with` context manager** 管理連線生命週期
2. **`on_permission` 回傳的是字串**（option_id），不是 bool——因為 ACP 協議支援多種選項
3. **方法叫 `prompt()`** 而非 `query()`——語義更貼近 ACP 協議

### 連接不同的 Agent

`AcpClient` 的威力在於可以連接任何 ACP agent：

```python
from claude_code_acp import AcpClient

# Claude（本套件）
claude = AcpClient(command="claude-code-acp")

# Gemini CLI
gemini = AcpClient(command="gemini", args=["--experimental-acp"])

# TypeScript 版本
ts_claude = AcpClient(command="npx", args=["@zed-industries/claude-code-acp"])

# 自訂 ACP agent
custom = AcpClient(command="my-custom-agent")
```

目前驗證可運作的 agent：

| Agent | 指令 | 狀態 |
|-------|------|------|
| claude-code-acp（本套件） | `claude-code-acp` | 可運作 |
| Gemini CLI | `gemini --experimental-acp` | 可運作 |
| TypeScript 版本 | `npx @zed-industries/claude-code-acp` | 相容 |

---

## MCP Server 支援

`AcpClient` 支援動態載入 MCP server，讓 agent 能使用額外的工具：

```python
client = AcpClient(
    command="claude-code-acp",
    cwd="/tmp",
    mcp_servers=[{
        "name": "nanobanana",
        "command": "uvx",
        "args": ["nanobanana"],
        "env": {"GEMINI_API_KEY": "your-key"},
    }],
)
```

內部實作會將 Python dict 轉換為 ACP schema 的 `McpServerStdio` 物件：

```python
# acp_client.py 的 new_session 方法
mcp_servers_acp = []
for srv in self.mcp_servers:
    env_vars = []
    if "env" in srv and srv["env"]:
        for k, v in srv["env"].items():
            env_vars.append(EnvVariable(name=k, value=v))
    mcp_servers_acp.append(
        McpServerStdio(
            name=srv.get("name", "mcp"),
            command=srv.get("command", ""),
            args=srv.get("args", []),
            env=env_vars,
        )
    )
```

值得注意的是，不同 agent 對 MCP 的支援方式不同：

| Agent | 動態 MCP（via ACP） | 預設定 MCP |
|-------|---------------------|------------|
| claude-code-acp | 支援 | 支援 |
| Gemini CLI | 不支援 | 用 `--allowed-mcp-server-names` |

Gemini 需要先透過 CLI 預先配置 MCP server：

```bash
gemini mcp add nanobanana "uvx nanobanana"
gemini mcp list
```

---

## 檔案操作攔截

ACP 協議中，檔案讀寫是由**客戶端**負責的。Agent 發出 `read_text_file` / `write_text_file` 請求，客戶端決定是否執行。`AcpClient` 提供 hook 讓你攔截這些操作：

```python
@client.on_file_read
async def handle_read(path: str) -> str | None:
    """回傳內容以覆蓋，或 None 讓正常讀取進行。"""
    print(f"Reading: {path}")
    return None

@client.on_file_write
async def handle_write(path: str, content: str) -> bool:
    """回傳 True 允許，False 阻擋。"""
    print(f"Writing: {path}")
    return input("Allow? [y/N]: ").lower() == "y"
```

在 `AcpClient` 內部，`ClientHandler` 類別實作了完整的檔案操作邏輯：

```python
async def write_text_file(self, path: str, content: str, **kwargs) -> None:
    # 先詢問 handler 是否要阻擋
    if client.events.on_file_write:
        allowed = await client.events.on_file_write(path, content)
        if not allowed:
            logger.info(f"File write blocked by handler: {path}")
            return

    # 實際寫入檔案
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")

async def read_text_file(self, path: str, **kwargs) -> dict:
    # 先詢問 handler 是否要覆蓋內容
    if client.events.on_file_read:
        override = await client.events.on_file_read(path)
        if override is not None:
            return {"content": override}

    # 實際讀取檔案
    file_path = Path(path)
    if not file_path.exists():
        return {"content": "", "error": f"File not found: {path}"}
    content = file_path.read_text(encoding="utf-8")
    return {"content": content}
```

這個設計讓你能在安全敏感的環境中控制 agent 的檔案存取。例如，你可以阻擋對特定目錄的寫入，或者對讀取內容進行脫敏處理。

---

## Terminal 操作攔截

類似檔案操作，shell 命令的執行也由客戶端控制：

```python
@client.on_terminal_create
async def handle_terminal(command: str, cwd: str) -> bool:
    """回傳 True 允許，False 阻擋。"""
    print(f"Command: {command} in {cwd}")
    return input("Allow? [y/N]: ").lower() == "y"

@client.on_terminal_output
async def handle_output(terminal_id: str, output: str) -> None:
    print(output, end="")
```

`AcpClient` 內部維護了一個 terminal 管理系統，完整追蹤每個 subprocess 的生命週期：

```python
@dataclass
class TerminalProcess:
    """代表一個活躍的 terminal process。"""
    process: asyncio.subprocess.Process
    command: str
    cwd: str
    output_buffer: list[str]
    exit_code: int | None = None
```

支援的 terminal 操作包括：

| 方法 | 說明 |
|------|------|
| `create_terminal` | 建立 subprocess 並執行指令 |
| `terminal_output` | 取得 terminal 輸出（non-blocking） |
| `wait_for_terminal_exit` | 等待 process 結束並取得 exit code |
| `kill_terminal` | 強制終止 process |
| `release_terminal` | 釋放追蹤但不終止 process |

---

## Multi-Agent 比較範例

有了 `AcpClient`，我們可以同時向多個 agent 發送相同的 prompt，比較回應：

```python
import asyncio
from claude_code_acp import AcpClient

async def ask(agent_name, command, args, prompt):
    client = AcpClient(command=command, args=args)

    @client.on_text
    async def on_text(text):
        pass  # 靜默收集

    async with client:
        response = await client.prompt(prompt)
        print(f"{agent_name}: {response[:100]}...")

async def main():
    await asyncio.gather(
        ask("Claude", "claude-code-acp", [], "What is ACP?"),
        ask("Gemini", "gemini", ["--experimental-acp"], "What is ACP?"),
    )

asyncio.run(main())
```

`asyncio.gather` 讓兩個 agent 並行執行，充分利用 async 的優勢。

---

## 小結

本篇介紹了 ACP 協議的核心概念，以及 `claude-code-acp-py` 中兩個客戶端的實作：

- **ACP** 是 AI agent 與客戶端之間的標準通訊協議，基於 JSON-RPC over stdio
- **ClaudeClient** 提供 in-process 的事件驅動介面，適合快速建構 Python 應用
- **AcpClient** 透過 subprocess 連接任何 ACP agent，支援檔案/Terminal 操作攔截
- 檔案操作和 shell 執行都發生在客戶端側，這是 ACP 的重要安全設計
- MCP server 支援讓 agent 能動態載入外部工具

下一篇：**claude-code-acp-py（下）：ACP Proxy 橋接多後端**——我們會介紹 `AcpProxyServer`，看它如何把 Copilot SDK 的 JSON-RPC 協議翻譯成 ACP，讓 Copilot SDK 應用也能使用 Claude、Gemini 或其他 ACP backend。

---

## 參考資源

- [claude-code-acp-py GitHub](https://github.com/yazelin/claude-code-acp-py) - 本文介紹的套件
- [PyPI: claude-code-acp](https://pypi.org/project/claude-code-acp/) - 套件安裝頁面
- [Agent Client Protocol 官網](https://agentclientprotocol.com/) - ACP 協議規格
- [Agent Client Protocol SDK](https://github.com/anthropics/agent-client-protocol) - Anthropic 官方 ACP SDK
- [Claude Agent SDK (Python)](https://github.com/anthropics/claude-agent-sdk-python) - Anthropic 官方 Claude Agent SDK
- [claude-code-acp (TypeScript)](https://github.com/zed-industries/claude-code-acp) - Zed Industries 的 TypeScript 版本
