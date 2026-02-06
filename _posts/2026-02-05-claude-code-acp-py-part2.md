---
layout: post
title: "claude-code-acp-py（下）：ACP Proxy 橋接多 AI 後端"
subtitle: "用一層 Proxy 讓 Copilot SDK 連上 Claude、Gemini、Copilot 任何 ACP 後端"
date: 2026-02-05
categories: [Claude Code]
tags: [Claude Code, ACP, Python, Proxy, Gemini, Copilot SDK, AI]
---

## 前言

在[上篇]({% post_url 2026-02-04-claude-code-acp-py-part1 %})中，我們介紹了 `claude-code-acp-py` 專案的核心元件：`ClaudeAcpAgent`（ACP Server）、`ClaudeClient`（Python API）、以及 `AcpClient`（通用 ACP Client）。這三個元件解決了「讓編輯器用 Claude」和「用 Python 連接任意 ACP Agent」兩個需求。

但在實際測試過程中，我們遇到了一個根本性的問題：**Copilot SDK 無法直接連接非 Copilot 的 ACP Server**。

本篇要談的就是第四個元件 -- `AcpProxyServer`，以及它如何突破這道協議的牆。

---

## 問題：Copilot SDK 不是通用 ACP Client

Copilot SDK（`github-copilot-sdk`）底層雖然也使用 JSON-RPC，看起來和 ACP 很像，但它在啟動 CLI 時會自動注入一組 Copilot 專屬的 flags：

```
--headless --server --log-level debug --stdio
```

其他 CLI（Gemini CLI、claude-code-acp）根本不認識這些參數，啟動就直接報錯：

```
Unknown arguments: headless, log-level, logLevel, stdio
```

我們做了完整測試，確認了這件事：

| 目標 CLI | Copilot SDK 連接結果 | 原因 |
|---------|-------|------|
| Copilot CLI | 成功 | 原生支援 |
| claude-code-acp | 失敗（TIMEOUT） | CLI flags 不相容 |
| Gemini CLI | 失敗 | CLI flags 不相容 |

換句話說，**Copilot SDK = 專為 Copilot CLI 設計的專用 SDK**，而我們的 `AcpClient` 才是真正的通用 ACP Client。

但 Copilot SDK 有一個很大的優勢：它背後有龐大的生態系（VS Code、GitHub Copilot 整合等）。如果能讓 Copilot SDK 也連上 Claude 或 Gemini，那影響面就大得多。

---

## 解法：ACP Proxy

我們的思路很直接 -- 加一層 Proxy。

```
┌─────────────┐   Copilot Protocol   ┌─────────────────┐   Standard ACP   ┌─────────────┐
│ Copilot SDK │ ──────────────────── │ copilot-acp-    │ ──────────────── │ Backend CLI │
│             │   (JSON-RPC 2.0)     │ proxy           │  (JSON-RPC 2.0)  │ gemini /    │
│             │   Content-Length     │                 │                   │ claude-code │
└─────────────┘                      └─────────────────┘                   └─────────────┘
```

Proxy 的左側「假裝」自己是 Copilot CLI，接受 `--headless --stdio` 等參數不報錯；右側則透過 `AcpClient` 連接到真正的後端。中間做的事情，就是兩套協議之間的翻譯。

---

## 架構拆解

整個 Proxy 子系統分成四個模組，放在 `src/claude_code_acp/proxy/` 下：

```
proxy/
├── __init__.py            # 匯出 AcpProxyServer, ProxySessionManager
├── cli.py                 # CLI 入口點 (copilot-acp-proxy 指令)
├── protocol.py            # Copilot SDK 協議定義 (資料結構、事件類型)
├── server.py              # JSON-RPC Server 主體
└── session_manager.py     # Session 管理 + 後端連接
```

### 1. CLI 入口 (`cli.py`)

CLI 是第一道關。Copilot SDK 啟動 CLI 時會帶上它專屬的 flags，所以 `copilot-acp-proxy` 必須全部接受但大多忽略：

```python
# Copilot SDK 相容 flags（接受但不使用）
parser.add_argument("--headless", action="store_true")
parser.add_argument("--server", action="store_true")
parser.add_argument("--stdio", action="store_true")
parser.add_argument("--auth-token-env", default="")
parser.add_argument("--no-auto-login", action="store_true")

# Proxy 自己的 flags
parser.add_argument("--backend", default=os.environ.get("ACP_PROXY_BACKEND", "gemini"))
parser.add_argument("--backend-args", nargs="*", default=[])
parser.add_argument("--cwd", default=os.getcwd())
```

因為 Copilot SDK 不提供 `cli_args` 參數（Python SDK 的限制），backend 的選擇透過環境變數 `ACP_PROXY_BACKEND` 傳入。

### 2. JSON-RPC Server (`server.py`)

`AcpProxyServer` 是核心類別，負責：

- 讀寫 LSP 風格的 `Content-Length` 訊息框架
- 路由 JSON-RPC method 到對應的 handler
- 發送 session event notification 回 Copilot SDK

Method 路由表：

```python
handlers = {
    "ping": self._handle_ping,
    "status.get": self._handle_status_get,
    "auth.getStatus": self._handle_auth_get_status,
    "models.list": self._handle_models_list,
    "session.create": self._handle_session_create,
    "session.resume": self._handle_session_resume,
    "session.send": self._handle_session_send,
    "session.destroy": self._handle_session_destroy,
    "session.abort": self._handle_session_abort,
    "session.list": self._handle_session_list,
    "session.delete": self._handle_session_delete,
    "session.getMessages": self._handle_session_get_messages,
    "session.getLastId": self._handle_session_get_last_id,
    # ...
}
```

其中有幾個值得注意的設計決策：

**Protocol Version = 2**：Copilot SDK 0.1.x 版期望協議版本是 2，不是 1。這在 ping response 和 status.get 裡都要回傳。

**auth.getStatus 永遠回傳已認證**：因為真正的認證是在後端（Claude subscription、Gemini auth），Proxy 不做認證。

**models.list 依後端回傳不同模型清單**：

```python
if self.backend == "gemini":
    models = [
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", ...},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", ...},
    ]
elif self.backend in ("claude-code", "claude-code-acp"):
    models = [
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", ...},
        {"id": "claude-opus-4-20250514", "name": "Claude Opus 4", ...},
    ]
```

### 3. 協議定義 (`protocol.py`)

這個模組用 dataclass 定義了 Copilot SDK 協議的所有資料結構，包括：

- **Request/Response 類型**：`PingRequest`、`SessionCreateParams`、`SessionSendParams` 等
- **Event 類型**：透過 `SessionEventType` enum 定義，涵蓋 session lifecycle、assistant 回應、tool 執行等

```python
class SessionEventType(str, Enum):
    SESSION_START = "session.start"
    SESSION_RESUME = "session.resume"
    SESSION_IDLE = "session.idle"
    ASSISTANT_TURN_START = "assistant.turn_start"
    ASSISTANT_MESSAGE = "assistant.message"
    ASSISTANT_MESSAGE_DELTA = "assistant.message_delta"
    ASSISTANT_REASONING_DELTA = "assistant.reasoning_delta"
    TOOL_EXECUTION_START = "tool.execution_start"
    TOOL_EXECUTION_COMPLETE = "tool.execution_complete"
    # ...
```

每個 event 都帶有 `id`（UUID）、`type`、`timestamp`（ISO 8601）、`data` 四個欄位。這是 Copilot SDK 的要求，缺一不可。

### 4. Session 管理 (`session_manager.py`)

`ProxySessionManager` 管理多個 `ProxySession`，每個 session 對應一個後端 `AcpClient` 連線。

關鍵邏輯在 `create_session` 裡：

```python
# 依後端類型決定 CLI 參數
if self.backend_command == "gemini":
    if "--experimental-acp" not in backend_args:
        backend_args.append("--experimental-acp")
    # Gemini: 用 CLI 參數傳 model
    if model:
        backend_args.extend(["--model", model])

elif self.backend_command in ("claude", "claude-code", "claude-code-acp"):
    # Claude: 用 ACP set_session_model 方法傳 model
    pass

elif self.backend_command == "copilot":
    if "--acp" not in backend_args:
        backend_args.append("--acp")
    # Copilot: 也用 CLI 參數
    if model:
        backend_args.extend(["--model", model])
```

建好 `AcpClient` 後，接著設定事件轉發：

```python
@client.on_text
async def on_text(text: str):
    event = create_assistant_message_delta_event(text)
    session.events.append(event)
    if session.event_callback:
        await session.event_callback(event)

@client.on_tool_start
async def on_tool_start(tool_id: str, name: str, input_data: dict):
    event = create_tool_execution_start_event(tool_id, name, input_data)
    if session.event_callback:
        await session.event_callback(event)
```

每個 ACP 事件都被翻譯成 Copilot SDK 格式的 session event，然後透過 callback 送回 `AcpProxyServer`，最終以 JSON-RPC notification 發送給 Copilot SDK。

---

## Model 參數傳遞：一條不直覺的路徑

Model 參數的傳遞是整個 Proxy 設計中最棘手的部分。每個後端的 model 傳遞方式都不同：

| 後端 | 傳遞方式 | 可用值 |
|------|---------|-------|
| claude-code-acp | ACP `set_session_model` 方法 | `opus`、`sonnet` |
| Gemini | CLI `--model` 參數 | `gemini-2.0-flash`、`gemini-2.5-flash` 等 |
| Copilot | CLI `--model` + ACP 方法 | `gpt-4`、`gpt-4o` 等 |

對 Claude 後端，完整路徑是：

```
Copilot SDK (model: "opus")
  -> session.create
ACP Proxy
  -> backend_client.set_model("opus")
AcpClient
  -> 存入 _pending_model（session 還沒建立）
  -> new_session() 時呼叫 set_session_model("opus")
claude-code-acp Agent (use_unstable_protocol=True)
  -> session.model = "opus"
  -> ClaudeAgentOptions(model="opus")
Claude Opus
```

要讓這條路徑通，需要三件事同時到位：

1. **AcpClient 支援 pending model**：`set_model()` 在 session 建立前先暫存，建立後自動套用
2. **Agent 啟用 unstable protocol**：`run_agent(agent, use_unstable_protocol=True)`，否則 `set_session_model` 不會被註冊
3. **Agent 實際使用 model 欄位**：`ClaudeAgentOptions(model=session.model)`，而不是只是存起來

這在 v0.3.6 到 v0.4.0 的版本演進中被修復。

---

## SessionModelState 與 AvailableCommandsUpdate

v0.4.0 另一個重要的功能是 `SessionModelState` 和 `AvailableCommandsUpdate` 的支援。

### SessionModelState

在 `new_session` 回應中，Agent 會回傳可用的 model 清單：

```python
def _build_models_state(self, server_info):
    models_data = server_info.get("models", [])
    available_models = []
    for model in models_data:
        available_models.append(
            ModelInfo(
                model_id=model.get("value", ""),
                name=model.get("displayName", model_id),
            )
        )
    return SessionModelState(
        available_models=available_models,
        current_model_id=current_model_id,
    )
```

這讓 ACP Client（如 Zed 編輯器）可以在 UI 上顯示 model 下拉選單，使用者可以在對話中切換 model。

### AvailableCommandsUpdate

Agent 在建立 session 後會非同步發送可用指令清單：

```python
async def _send_available_commands(self, session_id, server_info):
    commands_data = server_info.get("commands", [])
    # 過濾不適合 ACP 的指令
    unsupported = {"cost", "login", "logout", "release-notes", ...}

    available_commands = []
    for cmd in commands_data:
        if cmd["name"] not in unsupported:
            available_commands.append(
                AvailableCommand(name=name, description=cmd.get("description", ""))
            )

    await self._conn.session_update(
        session_id,
        update_available_commands(available_commands),
    )
```

這讓 ACP Client 可以實作指令選單（例如 Zed 的 `/` 指令），使用者可以透過 UI 觸發 Claude 的內建指令。

---

## MCP Server 格式轉換

不同後端對 MCP Server 的配置格式各不相同。Proxy 的 `_convert_mcp_servers` 方法處理 Copilot 格式到 ACP 格式的轉換：

```python
# Copilot 格式
{"nanobanana": {"type": "local", "command": "uvx", "args": ["nanobanana"], "tools": ["*"]}}

# ACP 格式
[{"name": "nanobanana", "command": "uvx", "args": ["nanobanana"]}]
```

環境變數也需要展開 -- Copilot 使用 `${VAR}` 語法引用環境變數：

```python
if isinstance(v, str) and v.startswith("${") and v.endswith("}"):
    var_name = v[2:-1]
    env[k] = os.environ.get(var_name, "")
```

各 CLI 的 MCP 配置方式對照：

| CLI | 動態 MCP | 格式 | type 欄位 | 額外欄位 |
|-----|---------|------|----------|---------|
| claude-code-acp | 支援 | JSON array | 不需要 | -- |
| Gemini | 不支援（需預配置） | CLI 配置 | -- | -- |
| Copilot | 支援 | JSON object | `"local"` | `"tools": ["*"]` |

---

## 測試策略

整個專案使用 `pytest` 作為測試框架，搭配以下套件：

- `pytest-asyncio`：支援 `async/await` 測試
- `pytest-timeout`：防止測試 hang 住（預設 120 秒）
- `pytest-cov`：測試涵蓋率

### 測試分層

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
markers = [
    "unit: Unit tests (fast, no external dependencies)",
    "integration: Integration tests (require Claude CLI)",
    "slow: Slow tests (MCP loading, etc.)",
]
```

**Unit Tests（快速，無外部依賴）**：

```bash
uv run pytest tests/test_unit_*.py -v
```

測試 `AcpClient` 的初始化、decorator 註冊、內部狀態管理等純邏輯：

```python
def test_client_initialization_custom(self):
    client = AcpClient(
        command="my-agent",
        args=["--verbose"],
        cwd="/tmp",
        env={"KEY": "value"},
    )
    assert client.command == "my-agent"
    assert client.args == ["--verbose"]

def test_on_text_decorator(self):
    client = AcpClient()

    @client.on_text
    async def handler(text: str):
        pass

    assert client.events.on_text is handler
```

**Integration Tests（需要 Claude CLI）**：

```bash
uv run pytest tests/ -m integration -v
```

這些測試需要本機安裝 Claude CLI 並已認證。`conftest.py` 提供了跳過條件：

```python
requires_claude_cli = pytest.mark.skipif(
    not is_claude_cli_available(),
    reason="Claude CLI not available",
)
```

**端到端 Proxy 測試**：

三組獨立的測試腳本分別驗證 Proxy 連接不同後端：

| 測試檔案 | 路徑 | 後端 |
|---------|------|------|
| `test_copilot_sdk_via_proxy.py` | SDK -> Proxy -> Gemini | gemini |
| `test_copilot_sdk_via_proxy_claude.py` | SDK -> Proxy -> Claude | claude-code-acp |
| `test_copilot_sdk_via_proxy_copilot.py` | SDK -> Proxy -> Copilot | copilot |

每個測試都遵循相同的流程：

1. 檢查環境（SDK 安裝、Proxy 可用、後端可用）
2. 建立 Copilot SDK Client，指定 `cli_path` 為 `copilot-acp-proxy`
3. 建立 session（帶 model 參數）
4. 發送 prompt 並等待回應
5. 驗證回應不為空
6. 清理 session

---

## 版本演進

從 git log 可以看到專案的版本演進軌跡：

| 版本 | 里程碑 |
|------|-------|
| v0.1.0 | 基礎 ACP Server + ClaudeClient |
| v0.2.0 | AcpClient（通用 ACP 客戶端） |
| v0.3.x | Gemini、Copilot 後端支援 + MCP 測試 |
| v0.4.0 | ACP Proxy 完成、Model 參數修復、SessionModelState |
| v0.4.1 | 穩定化、AvailableCommandsUpdate、文件完善 |

v0.4.0 是轉折點 -- 從「能連」到「能用」。Model 參數傳遞、event 格式對齊、protocol version 匹配，這些細節都是在 v0.4.0 的密集迭代中解決的。

---

## 使用方式

### 安裝

```bash
pip install claude-code-acp
# 或
uv tool install claude-code-acp
```

### 用 Copilot SDK 連 Gemini

```python
import asyncio
import os
from copilot import CopilotClient

os.environ["ACP_PROXY_BACKEND"] = "gemini"

async def main():
    client = CopilotClient({"cli_path": "copilot-acp-proxy"})
    await client.start()

    session = await client.create_session({"model": "gemini-2.0-flash"})

    def on_event(event):
        event_type = event.type.value if hasattr(event.type, 'value') else str(event.type)
        if event_type == "assistant.message_delta":
            delta = getattr(event.data, 'deltaContent', None)
            if delta:
                print(delta, end="", flush=True)

    session.on(on_event)
    await session.send({"prompt": "Hello from Gemini via Proxy!"})

asyncio.run(main())
```

### 用 Copilot SDK 連 Claude

```bash
ACP_PROXY_BACKEND=claude-code-acp copilot-acp-proxy --headless --stdio
```

```python
session = await client.create_session({"model": "opus"})
```

### 也可以直接用 CLI

```bash
# Gemini 後端
copilot-acp-proxy --headless --stdio --backend gemini

# Claude 後端
copilot-acp-proxy --headless --stdio --backend claude-code-acp

# Copilot 後端（架構驗證用）
copilot-acp-proxy --headless --stdio --backend copilot
```

---

## 小結

`AcpProxyServer` 解決的核心問題是：**讓封閉的 SDK 能夠連接開放的生態系**。

Copilot SDK 只認 Copilot CLI 的協議；ACP Server（Claude、Gemini）只說 ACP 協議。Proxy 站在中間做翻譯，把兩邊串起來。

設計上的幾個取捨值得記錄：

1. **接受但忽略不認識的 flags**，而不是報錯。這是相容性的基本策略。
2. **Model 傳遞走不同路徑**，因為每個後端的能力不同。Claude 支援 ACP 的 `set_session_model`，Gemini 只接受 CLI 參數。Proxy 需要知道後端是誰，才能做對的事。
3. **Event 格式要嚴格**。Copilot SDK 對 event 的欄位有精確要求（需要 `id`、`timestamp`），漏了就解析失敗。
4. **Protocol Version = 2**。這是 Copilot SDK 0.1.x 的硬性要求，文件裡沒寫，測出來的。

最終的元件表：

| 元件 | 角色 | 連接方式 |
|------|------|---------|
| `ClaudeAcpAgent` | ACP Server | 編輯器連過來 |
| `ClaudeClient` | Python API | 直接呼叫 Claude CLI |
| `AcpClient` | 通用 ACP Client | 連到任何 ACP Agent |
| `AcpProxyServer` | Proxy 橋接器 | Copilot SDK 到任何 ACP 後端 |

四個元件加起來，涵蓋了「當 Server 被連」、「當 Client 去連」、以及「翻譯不同協議」三種場景。

---

## 參考資源

- [claude-code-acp-py（上）]({% post_url 2026-02-04-claude-code-acp-py-part1 %})
- [GitHub: claude-code-acp-py](https://github.com/yazelin/claude-code-acp-py)
- [Agent Client Protocol (ACP) 規範](https://agentclientprotocol.com/)
- [Claude Agent SDK (Python)](https://github.com/anthropics/claude-agent-sdk-python)
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk)
- [Zed claude-code-acp (TypeScript)](https://github.com/zed-industries/claude-code-acp)
