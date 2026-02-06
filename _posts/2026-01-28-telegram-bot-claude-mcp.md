---
layout: post
title: "Telegram Bot 整合 Claude CLI + MCP 圖片生成"
subtitle: "用 Python 打造支援 AI 對話、圖片生成、網頁搜尋的 Telegram Bot"
date: 2026-01-28
categories: [AI]
tags: [Telegram, Bot, Claude, MCP, Python, AI, Copilot SDK]
---

## 前言

之前做了 [Jaba LINE Bot]({% post_url 2025-12-09-jaba-line-bot %})，把 AI 點餐功能串到 LINE 上。用了一陣子之後，發現 LINE Bot 有幾個不太舒服的地方：

- **Webhook 必須有公開 HTTPS endpoint**：要嘛自己架 nginx + Certbot，要嘛用 Render 之類的雲端服務。開發階段還得開 ngrok。
- **訊息回覆有時間限制**：LINE 的 Reply Token 只有 30 秒，AI 處理久一點就會過期，得改用 Push Message（要另外收費）。
- **圖片傳送限制多**：LINE 傳圖片需要公開 URL，不能直接傳本地檔案。

反觀 **Telegram Bot API**：

- **Long Polling 模式**：不需要公開 IP，不需要 HTTPS，直接跑在內網就行。
- **沒有回覆時間限制**：AI 處理多久都沒關係，處理完再回就好。
- **直接傳送本地檔案**：圖片、文件都可以直接從本地上傳。
- **Bot API 完全免費**：不像 LINE 有訊息數量限制。

所以這次決定用 Telegram 來做一個整合 Claude AI 的 Bot，支援對話、圖片生成、網頁搜尋等功能。

---

## 系統架構

```
┌──────────────┐     Long Polling      ┌──────────────────┐
│  Telegram    │ <──────────────────── │   telegram-bot   │
│  使用者       │ ────────────────────> │   (main.py)      │
│  (手機/電腦)  │                       └────────┬─────────┘
└──────────────┘                                 │
                                                 │ Copilot SDK
                                                 ▼
                                        ┌──────────────────┐
                                        │   Claude CLI     │
                                        │ (claude_agent.py)│
                                        └────────┬─────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                              ┌──────────┐ ┌──────────┐ ┌──────────┐
                              │ WebSearch│ │ WebFetch │ │nanobanana│
                              │          │ │          │ │ (MCP)    │
                              └──────────┘ └──────────┘ └──────────┘
                                                              │
                                                              ▼
                                                        Gemini API
                                                       (圖片生成)
```

### 核心元件

| 元件 | 用途 |
|------|------|
| **python-telegram-bot 22.x** | Telegram Bot API 封裝 |
| **GitHub Copilot SDK** | 透過 subprocess 驅動 Claude CLI |
| **Claude CLI** | AI 對話引擎，支援 Tool Use |
| **nanobanana-py** | MCP 圖片生成工具（背後用 Gemini API）|
| **httpx** | 非同步 HTTP 下載圖片 |
| **uv** | Python 套件管理 |

---

## 專案結構

```
telegram-bot/
├── main.py              # Bot 主程式（指令、訊息處理）
├── services/
│   └── claude_agent.py  # Claude CLI 整合（Copilot SDK）
├── scripts/
│   ├── start.sh             # 啟動腳本
│   ├── install-service.sh   # 安裝 systemd 服務
│   └── uninstall-service.sh # 卸載服務
├── .env                 # 環境變數（不納入版控）
├── .mcp.json            # MCP 工具配置（不納入版控）
├── pyproject.toml       # 專案設定
└── README.md
```

---

## Step 1：建立 Telegram Bot

### 1.1 透過 BotFather 建立

1. 在 Telegram 找 [@BotFather](https://t.me/BotFather)
2. 發送 `/newbot`，依照指示建立新 Bot
3. 記下 **Bot Token**（格式：`123456:ABC-DEF...`）
4. 發送 `/setprivacy` → 選擇你的 Bot → `Disable`（讓 Bot 可以收到群組所有訊息）

### 1.2 安裝依賴

```bash
cd telegram-bot

# 安裝 uv（如果還沒有）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安裝依賴
uv sync
```

`pyproject.toml` 中的依賴很簡潔：

```toml
[project]
name = "telegram-bot"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "github-copilot-sdk>=0.1.20",
    "httpx>=0.28.1",
    "python-dotenv>=1.2.1",
    "python-telegram-bot>=22.6",
]
```

### 1.3 設定環境變數

```bash
cp .env.example .env
nano .env
```

```bash
# ============ Telegram 設定 ============
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_USER_IDS=123456789          # 用戶白名單（逗號分隔）
ADMIN_USER_ID=123456789             # 管理員 ID（啟動時收通知）
ALLOWED_GROUP_IDS=-1001234567890    # 群組白名單（逗號分隔）

# ============ AI 設定 ============
AI_ENABLED=true
AI_MODEL=haiku                      # opus / sonnet / haiku
AI_NOTIFY_TOOLS=true                # 顯示 Tool 執行狀態
AI_SYSTEM_PROMPT=你是一個友善的助手。請用繁體中文回答。
AI_ALLOWED_TOOLS=WebSearch,WebFetch,Read,mcp__nanobanana__generate_image

# ============ MCP 工具設定 ============
NANOBANANA_GEMINI_API_KEY=your_gemini_api_key_here
NANOBANANA_MODEL=gemini-3-pro-image-preview
```

---

## Step 2：用戶白名單（預設拒絕）

這個 Bot 是給自己和信任的人用的，所以採用 **白名單機制**——沒有在名單上的人一律拒絕。

```python
def is_user_allowed(user_id: int) -> bool:
    """檢查用戶是否被允許使用 bot"""
    allowed = get_allowed_users()
    # 如果沒有設定白名單，則拒絕所有人
    if not allowed:
        return False
    return user_id in allowed
```

群組也有獨立的白名單：

```python
def is_group_allowed(chat_id: int) -> bool:
    """檢查群組是否被允許使用 bot"""
    allowed = get_allowed_groups()
    if not allowed:
        return False
    return chat_id in allowed
```

統一的權限檢查函式，每個指令和訊息處理都會先呼叫：

```python
def check_permission(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """統一檢查權限（用戶 + 群組）"""
    user = update.effective_user
    chat = update.effective_chat

    if not is_user_allowed(user.id):
        return False

    # 私人對話直接允許
    if chat.type == "private":
        return True

    # 群組對話檢查群組白名單
    return is_group_allowed(chat.id)
```

有個貼心的設計：未授權的用戶也可以用 `/status` 指令查看自己的 User ID，方便管理員加入白名單：

```python
async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    # 未授權用戶：只顯示自己的 ID
    if not is_user_allowed(user.id):
        status_text = (
            f"你的用戶 ID: {user.id}\n\n"
            f"你尚未被授權使用此 Bot。\n"
            f"請將此 ID 提供給管理員以申請存取權限。"
        )
        await update.message.reply_text(status_text, parse_mode="HTML")
        return
    # ... 已授權用戶顯示完整狀態
```

---

## Step 3：在線狀態偵測

Bot 啟動時會記錄時間，並在 `/ping` 指令回報運行時間：

```python
BOT_START_TIME = None

async def post_init(application: Application) -> None:
    """Bot 啟動後的初始化"""
    global BOT_USERNAME, BOT_START_TIME
    bot = await application.bot.get_me()
    BOT_USERNAME = bot.username
    BOT_START_TIME = datetime.now()

    # 通知管理員 Bot 已啟動
    admin_id = get_admin_id()
    if admin_id:
        await application.bot.send_message(
            chat_id=admin_id,
            text=f"Bot 已上線\n@{BOT_USERNAME}\n{BOT_START_TIME.strftime('%Y-%m-%d %H:%M:%S')}",
            parse_mode="HTML",
        )
```

`/ping` 指令回報 uptime：

```python
async def ping_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if BOT_START_TIME:
        uptime = datetime.now() - BOT_START_TIME
        hours, remainder = divmod(int(uptime.total_seconds()), 3600)
        minutes, seconds = divmod(remainder, 60)
        uptime_str = f"{hours}h {minutes}m {seconds}s"
    else:
        uptime_str = "未知"

    await update.message.reply_text(f"Pong! Bot 運行中\n已運行: {uptime_str}")
```

管理員在 Bot 啟動時會自動收到上線通知，不用手動去確認。

---

## Step 4：Claude AI 整合（Copilot SDK）

這是整個 Bot 的核心——透過 **GitHub Copilot SDK** 呼叫 Claude CLI，讓 Bot 具備 AI 對話能力。

### 4.1 為什麼用 Copilot SDK 而不是直接呼叫 Claude API？

最初的版本是直接用 `subprocess` 呼叫 Claude CLI：

```python
# 舊版：直接呼叫 Claude CLI（已棄用）
process = await asyncio.create_subprocess_exec(
    "claude", "-p", prompt, "--model", model,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)
stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120)
```

這個方法的問題：
- **每次對話都要啟動一個新的 Claude CLI 進程**，啟動時間很長
- **無法取得 Tool 執行狀態**，使用者會卡在那等不知道在幹嘛
- **MCP Server 每次重新啟動**，初始化時間浪費

後來找到 **GitHub** 提供的 `github-copilot-sdk`，這是一個 Python SDK，原本設計給 GitHub Copilot 使用。當時我以為 Copilot SDK 和 Claude CLI 兩端都支援 ACP（Agent Client Protocol），可以直接整合。實際上 **Copilot SDK 走的是自己的專有協議**，而 Claude CLI 要用另外的 Claude Agent SDK + ACP 套件才能程式化控制。

不過 Copilot SDK 確實能透過 subprocess 驅動 Claude CLI，只是整合過程比預期困難得多——兩邊協議不完全相容，程式碼變得更複雜。這次的整合經驗，也直接促成了後來的 [claude-code-acp-py]({% post_url 2026-02-04-claude-code-acp-py-part1 %}) 套件開發。

`github-copilot-sdk` 的基本用法：

```python
from copilot import CopilotClient

# 全域 Client，只需啟動一次
_client: CopilotClient | None = None

async def _get_client() -> CopilotClient:
    """取得或初始化全域 CopilotClient"""
    global _client
    async with _client_lock:
        if _client is None:
            _client = CopilotClient({"cwd": PROJECT_DIR})
            await _client.start()
        return _client
```

好處：
- **Client 只需啟動一次**，後續建立 Session 很快
- **可以接收事件**（Tool 開始、Tool 完成、回應完成等）
- **MCP Server 持久化**，不用每次重新啟動

### 4.2 Session 與事件驅動

每次使用者發送訊息，會建立一個新的 Session：

```python
async def call_claude(
    prompt: str,
    model: str = "haiku",
    system_prompt: str | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    on_tool_start: ToolNotifyCallback | None = None,
    on_tool_end: ToolNotifyCallback | None = None,
    allowed_tools: list[str] | None = None,
) -> ClaudeResponse:
    client = await _get_client()

    session_config = {
        "model": cli_model,
        "cli_path": "claude",
        "cli_args": "--experimental-acp",
        "streaming": False,
    }
    if system_prompt:
        session_config["system_message"] = {"content": system_prompt}
    if tools:
        session_config["allowed_tools"] = tools

    session = await client.create_session(session_config)
```

透過事件回調，可以即時追蹤 Tool 的執行狀態：

```python
def on_event(event):
    event_type = event.type.value

    if event_type == "assistant.message":
        # AI 回應了一段文字
        response_content = event.data.content or ""

    elif event_type == "assistant.tool_use":
        # Tool 開始執行
        tool_name = getattr(event.data, "name", "")
        tool_input = getattr(event.data, "input", {})
        # 通知使用者

    elif event_type == "tool.result":
        # Tool 執行完成
        tool_output = getattr(event.data, "content", "")
        # 計算耗時，通知使用者

    elif event_type == "session.idle":
        # 整個對話完成
        done.set()

session.on(on_event)
await session.send({"prompt": prompt})
```

### 4.3 模型對應表

Copilot SDK 使用不同的模型名稱，所以做了一個對應表：

```python
MODEL_MAP = {
    "opus": "claude-sonnet-4.5",
    "sonnet": "claude-sonnet-4",
    "haiku": "claude-haiku-4.5",
}
```

在 `.env` 中設定 `AI_MODEL=haiku`，就會自動對應到 `claude-haiku-4.5`。Haiku 模型回應速度快，適合 Bot 這種需要即時回應的場景。

### 4.4 Tool 執行即時通知

當 AI 使用工具時（搜尋網頁、生成圖片等），Bot 會發一條通知訊息並即時更新狀態：

```python
async def on_tool_start(tool_name: str, tool_input: dict):
    """Tool 開始執行時的回調"""
    status_line = f"tool_name\n   執行中..."
    tool_status_lines.append({"name": tool_name, "status": "running", "line": status_line})

    full_text = "AI 處理中\n\n" + "\n\n".join(t["line"] for t in tool_status_lines)

    if notify_message_id is None:
        msg = await bot.send_message(chat_id=chat_id, text=full_text, parse_mode="HTML")
        notify_message_id = msg.message_id
    else:
        await bot.edit_message_text(
            chat_id=chat_id, message_id=notify_message_id,
            text=full_text, parse_mode="HTML",
        )
```

Tool 完成後更新為「完成」，並顯示執行時間：

```python
async def on_tool_end(tool_name: str, result: dict):
    duration_ms = result.get("duration_ms", 0)
    duration_str = f"{duration_ms}ms" if duration_ms < 1000 else f"{duration_ms/1000:.1f}s"

    for tool in tool_status_lines:
        if tool["name"] == tool_name and tool["status"] == "running":
            tool["status"] = "done"
            tool["line"] = tool["line"].replace("執行中...", f"完成 ({duration_str})")
            break
```

AI 回應完成後，這條通知訊息會自動刪除，使用者只會看到最終的回應結果。

### 4.5 MAX_TURNS 限制

為了避免 AI 無限迴圈呼叫工具，設了一個 `MAX_TURNS` 限制：

```python
MAX_TURNS = 2

# 工具完成後檢查是否超過 turn 限制
if turn_count >= MAX_TURNS and not pending_tools:
    logger.info(f"已達 MAX_TURNS={MAX_TURNS} 且所有工具已完成，中止 session")
    session.abort()
```

---

## Step 5：MCP 圖片生成整合

### 5.1 什麼是 MCP？

MCP（Model Context Protocol）是 Anthropic 提出的標準，讓 AI 可以呼叫外部工具。在這個專案中，我們用 [nanobanana-py](https://pypi.org/project/nanobanana-py/) 這個 MCP Server，讓 Claude 可以生成圖片。

關於 MCP 的詳細介紹，可以參考 [MCP 介紹]({% post_url 2026-01-04-mcp-introduction %})。

關於 nanobanana 的安裝與使用，可以參考 [Nanobanana 圖片生成]({% post_url 2026-01-14-nanobanana-image-generation %})。

### 5.2 設定 MCP 工具

建立 `.mcp.json` 配置：

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "bash",
      "args": [
        "-c",
        "set -a && source /path/to/telegram-bot/.env && set +a && uvx nanobanana-py"
      ]
    }
  }
}
```

這裡有個技巧：用 `set -a && source .env && set +a` 把 `.env` 中的 `NANOBANANA_GEMINI_API_KEY` 環境變數帶進 MCP Server，這樣就不用在兩個地方分別設定 API Key。

### 5.3 在 AI_ALLOWED_TOOLS 中啟用

```bash
AI_ALLOWED_TOOLS=WebSearch,WebFetch,Read,mcp__nanobanana__generate_image,mcp__nanobanana__edit_image,mcp__nanobanana__restore_image,mcp__nanobanana__generate_icon,mcp__nanobanana__generate_pattern,mcp__nanobanana__generate_story,mcp__nanobanana__generate_diagram
```

MCP 工具名稱的格式是 `mcp__<server名稱>__<工具名稱>`。

### 5.4 圖片路徑提取

nanobanana 生成圖片後，會回傳一個 JSON，裡面包含生成的圖片路徑。需要從 Tool 的 output 中提取這些路徑：

```python
def extract_image_paths_from_tool_calls(tool_calls: list) -> list[str]:
    """從 tool_calls 中提取 nanobanana 生成的圖片路徑"""
    nanobanana_tools = {
        "mcp__nanobanana__generate_image",
        "mcp__nanobanana__edit_image",
        "mcp__nanobanana__restore_image",
        "mcp__nanobanana__generate_icon",
        "mcp__nanobanana__generate_pattern",
        "mcp__nanobanana__generate_story",
        "mcp__nanobanana__generate_diagram",
    }

    generated_files = []
    for tc in tool_calls:
        if tc.name not in nanobanana_tools:
            continue

        output_data = json.loads(tc.output)
        # 格式: [{"text": '{"success": true, "generatedFiles": [...]}', "type": "text"}]
        if isinstance(output_data, list):
            for item in output_data:
                if item.get("type") == "text":
                    inner_data = json.loads(item["text"])
                    if inner_data.get("success") and inner_data.get("generatedFiles"):
                        generated_files.extend(inner_data["generatedFiles"])

    # 去重複並過濾存在的檔案
    return [p for p in set(generated_files) if os.path.exists(p)]
```

然後在 `main.py` 中，把這些圖片直接發送給使用者：

```python
# 發送圖片
for img_path in image_paths:
    with open(img_path, "rb") as img_file:
        await update.message.reply_photo(photo=img_file)
```

這就是 Telegram 的優勢——直接從本地路徑讀取檔案上傳，不需要先放到公開 URL。

---

## Step 6：Reply Context（回覆上下文）

使用者可以回覆（Reply）Bot 的訊息或其他訊息，AI 會看到被回覆的內容作為上下文。

### 6.1 文字回覆

回覆一段文字，AI 就能基於那段文字回答：

```python
async def get_reply_context(update: Update, context: ContextTypes.DEFAULT_TYPE) -> str | None:
    reply = update.message.reply_to_message
    if not reply:
        return None

    parts = []

    # 回覆的文字（圖片的 caption 或文字訊息）
    reply_text = reply.text or reply.caption
    if reply_text:
        if len(reply_text) > 500:
            reply_text = reply_text[:500] + "..."
        parts.append(f"[回覆訊息: {reply_text}]")

    return "\n".join(parts) if parts else None
```

### 6.2 圖片回覆

更強大的是圖片回覆——回覆一張圖片並說「把這張圖變成黑白」，AI 就會下載圖片並處理：

```python
# 回覆的圖片
if reply.photo:
    # 取得最大尺寸的圖片
    photo = reply.photo[-1]
    file = await context.bot.get_file(photo.file_id)

    # 下載到暫存目錄
    file_path = os.path.join(REPLY_IMAGE_DIR, f"{photo.file_unique_id}.jpg")
    await file.download_to_drive(file_path)

    parts.append(f"[回覆圖片: {file_path}]")
```

組合後的 prompt 會像這樣：

```
[回覆圖片: /tmp/telegram-bot-cli/reply-images/abc123.jpg]
[回覆訊息: 上次生成的圖片]
把背景改成藍色
```

Claude 看到路徑後，就會用 nanobanana 的 `edit_image` 工具來處理。

---

## Step 7：圖片 URL 自動下載

AI 回應中如果包含圖片 URL（例如搜尋結果中的圖片），Bot 會自動下載並傳送：

```python
def extract_image_urls(text: str) -> list[str]:
    """從文字中提取圖片 URL"""
    pattern = r'https?://[^\s\n\[\]()<>\"\']+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s\n\[\]()<>\"\']*)?'
    urls = re.findall(pattern, text, re.IGNORECASE)
    return list(dict.fromkeys(urls))  # 去重保留順序
```

```python
async def download_image_from_url(url: str) -> str | None:
    """下載圖片 URL 到暫存目錄"""
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None

        content_type = resp.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            return None

        # 用 MD5 hash 作為檔名避免重複
        filename = hashlib.md5(url.encode()).hexdigest()[:12] + ext
        file_path = os.path.join(download_dir, filename)

        with open(file_path, "wb") as f:
            f.write(resp.content)

        return file_path
```

最多下載 5 張圖片，避免佔用太多頻寬：

```python
image_urls = extract_image_urls(response)
if image_urls:
    for url in image_urls[:5]:  # 最多下載 5 張
        local_path = await download_image_from_url(url)
        if local_path:
            image_paths.append(local_path)
```

---

## Step 8：群組使用

### 8.1 回應規則

在群組中，Bot 不會回應每一條訊息（那會很吵），只在以下情況才回應：

1. **被 @提及**：`@YourBot 今天天氣如何`
2. **回覆 Bot 的訊息**：直接 Reply Bot 之前的訊息

```python
def is_mentioned(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    message = update.message

    # 檢查是否為回覆 Bot 的訊息
    if message.reply_to_message and message.reply_to_message.from_user:
        if message.reply_to_message.from_user.id == context.bot.id:
            return True

    # 檢查訊息中是否有 @Bot
    if message.entities:
        for entity in message.entities:
            if entity.type == "mention":
                mention_text = message.text[entity.offset:entity.offset + entity.length]
                if BOT_USERNAME and mention_text.lower() == f"@{BOT_USERNAME.lower()}":
                    return True

    return False
```

### 8.2 移除 @Bot 文字

使用者輸入 `@YourBot 畫一隻貓`，傳給 AI 之前要先把 `@YourBot` 移掉：

```python
if BOT_USERNAME:
    text = text.replace(f"@{BOT_USERNAME}", "").strip()
```

---

## Step 9：部署為 systemd 服務

開發完成後，用 systemd 部署到 Linux 伺服器上，開機自動啟動：

```bash
./scripts/install-service.sh
```

這個腳本會自動：
1. 偵測 `uv` 的路徑
2. 建立 systemd service 檔案
3. 啟用並啟動服務

核心的 service 配置：

```ini
[Unit]
Description=Telegram Bot
After=network.target

[Service]
Type=simple
User=ct
WorkingDirectory=/home/ct/SDD/telegram-bot
ExecStart=/home/ct/.local/bin/uv run python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

常用管理指令：

```bash
# 查看狀態
sudo systemctl status telegram-bot

# 查看即時日誌
journalctl -u telegram-bot -f

# 重啟
sudo systemctl restart telegram-bot
```

---

## 從 Claude CLI 到 Copilot SDK 的演進

最後聊一下從直接呼叫 Claude CLI 到使用 Copilot SDK 的轉換過程，以及遇到的困難。

### 舊版：subprocess 呼叫 Claude CLI

最初的做法是用 `asyncio.create_subprocess_exec` 直接呼叫 `claude` 指令：

```python
# 舊版做法
cmd = ["claude", "-p", prompt, "--model", model, "--output-format", "json"]
process = await asyncio.create_subprocess_exec(
    *cmd,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
    cwd=PROJECT_DIR,
)
stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120)
result = json.loads(stdout.decode())
```

問題：
- 每次呼叫都要啟動新進程，包含載入 MCP Server
- 無法取得中間的 Tool 執行狀態
- 回應時間不穩定，有時候特別慢

### Copilot SDK：能用，但整合比想像中難

`github-copilot-sdk` 是 **GitHub** 開發的 SDK，原本設計是給 Copilot CLI 使用的。它提供了程式化的介面，透過持久的 Client 連線建立多個 Session：

```python
from copilot import CopilotClient

# 全域 Client，只需啟動一次
client = CopilotClient({"cwd": PROJECT_DIR})
await client.start()

# 每次對話建立新 Session
session = await client.create_session({
    "model": "claude-haiku-4.5",
    "cli_path": "claude",
    "cli_args": "--experimental-acp",
    "allowed_tools": ["WebSearch", "mcp__nanobanana__generate_image"],
})

# 事件驅動
session.on(on_event)
await session.send({"prompt": "畫一隻貓"})
```

改善後的效果：
- **啟動時間**：從每次 3-5 秒降到首次 3 秒，之後每次 < 0.5 秒
- **Tool 通知**：可以即時告訴使用者目前在執行什麼工具
- **MCP Server 持久化**：nanobanana 不用每次重新啟動

但整合過程中發現一個根本問題：**Copilot SDK 使用的是 GitHub 自己的專有協議，而非 Anthropic 的 ACP**。這導致 Copilot SDK 驅動 Claude CLI 時，兩邊的協議並不完全相容，程式碼需要大量的 workaround。

這次的痛苦經驗直接推動了後續兩個專案：

1. **[claude-code-acp-py]({% post_url 2026-02-04-claude-code-acp-py-part1 %})** — 用 Python 實作真正的 ACP 協議，包含四個元件：`ClaudeAcpAgent`（ACP Server）、`ClaudeClient`（直接呼叫 Claude CLI）、`AcpClient`（通用 ACP Client）、`AcpProxyServer`（橋接 Copilot SDK 到任何 ACP 後端）
2. **Fork copilot-sdk** — 直接 fork 了 GitHub 的 Copilot SDK repo，加入 ACP 協議支援，讓它能原生連接任何 ACP 相容的 agent

需要注意的是，Bot 關閉時要記得清理 Client：

```python
async def post_shutdown(application: Application) -> None:
    """Bot 關閉時清理 CopilotClient"""
    await shutdown_client()
```

---

## 小結

這個 Telegram Bot 的核心思路很簡單：**用 Telegram 作為使用者介面，Claude CLI 作為 AI 後端，MCP 作為工具擴充框架**。

幾個關鍵設計決策：

| 決策 | 原因 |
|------|------|
| **Telegram 而非 LINE** | Long Polling 不需公開 IP，無回覆時間限制，可直接傳本地檔案 |
| **白名單機制** | 預設拒絕所有人，安全第一 |
| **Copilot SDK 而非直接呼叫 CLI** | 效能好、支援事件回調、MCP 持久化（但協議相容性需要 workaround） |
| **Tool 執行即時通知** | 讓使用者知道 AI 在做什麼，不會以為當掉了 |
| **圖片 URL 自動下載** | AI 搜尋到的圖片直接顯示，不用使用者自己開連結 |

整個專案只有兩個 Python 檔案（`main.py` + `services/claude_agent.py`），加上一些 Shell 腳本，維護起來很輕鬆。

---

## 參考資源

- [python-telegram-bot 文件](https://docs.python-telegram-bot.org/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli)
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk)
- [claude-code-acp-py（上）]({% post_url 2026-02-04-claude-code-acp-py-part1 %})
- [claude-code-acp-py（下）]({% post_url 2026-02-05-claude-code-acp-py-part2 %})
- [nanobanana-py（MCP 圖片生成）](https://pypi.org/project/nanobanana-py/)
- [MCP 介紹]({% post_url 2026-01-04-mcp-introduction %})
- [Nanobanana 圖片生成教學]({% post_url 2026-01-14-nanobanana-image-generation %})
