---
layout: post
title: "Line Bot 整合（三）：與 Claude AI 對話整合"
subtitle: "讓 Line Bot 變成智慧助理，支援 MCP 工具調用"
date: 2026-01-01
categories: [ChingTech OS]
tags: [Line Bot, Claude, AI, MCP, FastAPI, Python, ChingTech OS]
---

## 前言

在前兩篇中，我們建立了 [Webhook 架構]({% post_url 2025-12-30-linebot-part1-webhook %}) 和 [檔案處理]({% post_url 2025-12-31-linebot-part2-file-download %})。這篇我們要整合 **Claude AI**，讓 Line Bot 能夠：

- 智慧回應用戶訊息
- 區分個人對話和群組對話
- 調用 MCP 工具（專案管理、知識庫等）
- 記錄 AI Log 供追蹤除錯

如果你還沒看過 Jaba AI 系列，可以先參考：
- [LINE Bot v3 SDK + FastAPI]({% post_url 2025-12-23-jaba-ai-part6-linebot-v3 %}) - SDK 基礎整合
- [AI 日誌系統]({% post_url 2025-12-22-jaba-ai-part5-ai-logging %}) - AI Log 的設計理念與除錯技巧
- [群組權限控制]({% post_url 2025-12-23-jaba-ai-part7-group-permission %}) - 群組對話的權限設計

本篇會在這些基礎上，加入 **MCP 工具整合** 和 **更完整的 Agent 管理機制**。

---

## 架構概覽

```
用戶發送訊息
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  handle_text_message()                                    │
│  ┌────────────────────┐                                  │
│  │ 1. 觸發判斷        │  should_trigger_ai()             │
│  │    個人/群組@/回覆  │                                  │
│  └─────────┬──────────┘                                  │
│            ▼                                             │
│  ┌────────────────────┐                                  │
│  │ 2. 取得 Agent      │  get_linebot_agent()             │
│  │    model + prompt  │  personal / group                │
│  └─────────┬──────────┘                                  │
│            ▼                                             │
│  ┌────────────────────┐                                  │
│  │ 3. 對話歷史        │  get_conversation_context()      │
│  │    最近 20 則訊息  │  含圖片/檔案路徑                 │
│  └─────────┬──────────┘                                  │
│            ▼                                             │
│  ┌────────────────────┐                                  │
│  │ 4. 呼叫 Claude     │  call_claude()                   │
│  │    + MCP 工具      │  query_project, add_note...      │
│  └─────────┬──────────┘                                  │
│            ▼                                             │
│  ┌────────────────────┐                                  │
│  │ 5. 記錄 AI Log     │  log_linebot_ai_call()           │
│  └─────────┬──────────┘                                  │
│            ▼                                             │
│  ┌────────────────────┐                                  │
│  │ 6. 回覆訊息        │  send_ai_response()              │
│  │    文字 + 圖片     │                                  │
│  └────────────────────┘                                  │
└──────────────────────────────────────────────────────────┘
```

---

## AI 觸發條件

不是所有訊息都需要 AI 處理。我們設計了觸發規則：

| 對話類型 | 觸發條件 |
|---------|---------|
| 個人對話 | 所有訊息都觸發 |
| 群組對話 | 被 @ 提及，或回覆 Bot 訊息 |

```python
def should_trigger_ai(
    message_content: str,
    is_group: bool,
    is_reply_to_bot: bool = False,
) -> bool:
    """判斷是否應該觸發 AI 處理"""
    if not is_group:
        # 個人對話：全部觸發
        return True

    # 群組對話：檢查是否回覆機器人訊息
    if is_reply_to_bot:
        return True

    # 群組對話：檢查是否被 @ 提及
    content_lower = message_content.lower()
    trigger_names = ["擎添ai", "ai助理", "小擎"]  # 可設定多個觸發名稱

    for name in trigger_names:
        if f"@{name}" in content_lower:
            return True

    return False
```

### 判斷是否回覆 Bot 訊息

Line SDK v3 的 `TextMessageContent` 有 `quoted_message_id` 屬性，可以知道用戶回覆了哪則訊息：

```python
async def is_bot_message(line_message_id: str) -> bool:
    """檢查訊息是否為機器人發送的"""
    async with get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT is_from_bot FROM line_messages WHERE message_id = $1",
            line_message_id,
        )
        return row["is_from_bot"] if row else False
```

---

## Agent 設計：個人 vs 群組

我們設計了兩個 Agent，針對不同場景優化：

| Agent | 模型 | 特點 |
|-------|------|------|
| `linebot-personal` | claude-sonnet | 完整 prompt、所有工具 |
| `linebot-group` | claude-haiku | 精簡 prompt、快速回應 |

### Agent 資料結構

```python
# Agent 名稱常數
AGENT_LINEBOT_PERSONAL = "linebot-personal"
AGENT_LINEBOT_GROUP = "linebot-group"

# Agent 設定存在資料庫中
DEFAULT_LINEBOT_AGENTS = [
    {
        "name": AGENT_LINEBOT_PERSONAL,
        "display_name": "Line 個人助理",
        "model": "claude-sonnet",
        "prompt": {
            "name": AGENT_LINEBOT_PERSONAL,
            "content": LINEBOT_PERSONAL_PROMPT,  # 完整版
        },
    },
    {
        "name": AGENT_LINEBOT_GROUP,
        "display_name": "Line 群組助理",
        "model": "claude-haiku",
        "prompt": {
            "name": AGENT_LINEBOT_GROUP,
            "content": LINEBOT_GROUP_PROMPT,  # 精簡版
        },
    },
]
```

### 取得 Agent 設定

```python
async def get_linebot_agent(is_group: bool) -> dict | None:
    """取得 Line Bot Agent 設定"""
    agent_name = AGENT_LINEBOT_GROUP if is_group else AGENT_LINEBOT_PERSONAL
    return await ai_manager.get_agent_by_name(agent_name)
```

---

## 對話歷史管理

為了讓 AI 理解上下文，我們會取得最近的對話歷史：

```python
async def get_conversation_context(
    line_group_id: UUID | None,
    line_user_id: str | None,
    limit: int = 20,
    exclude_message_id: UUID | None = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """取得對話上下文（包含圖片和檔案）

    Returns:
        (context, images, files):
        - context: [{"role": "user/assistant", "content": "..."}]
        - images: 圖片資訊列表
        - files: 檔案資訊列表
    """
    async with get_connection() as conn:
        if line_group_id:
            # 群組對話
            rows = await conn.fetch(
                """
                SELECT m.content, m.is_from_bot, u.display_name,
                       m.message_type, m.message_id,
                       f.nas_path, f.file_name
                FROM line_messages m
                LEFT JOIN line_users u ON m.line_user_id = u.id
                LEFT JOIN line_files f ON f.message_id = m.id
                WHERE m.line_group_id = $1
                  AND m.message_type IN ('text', 'image', 'file')
                ORDER BY m.created_at DESC
                LIMIT $2
                """,
                line_group_id, limit,
            )
        elif line_user_id:
            # 個人對話：考慮對話重置時間
            rows = await conn.fetch(
                """
                SELECT m.content, m.is_from_bot, u.display_name,
                       m.message_type, m.message_id,
                       f.nas_path, f.file_name
                FROM line_messages m
                LEFT JOIN line_users u ON m.line_user_id = u.id
                LEFT JOIN line_files f ON f.message_id = m.id
                WHERE u.line_user_id = $1
                  AND m.line_group_id IS NULL
                  AND (u.conversation_reset_at IS NULL
                       OR m.created_at > u.conversation_reset_at)
                ORDER BY m.created_at DESC
                LIMIT $2
                """,
                line_user_id, limit,
            )

        # 反轉順序（從舊到新）
        rows = list(reversed(rows))

        context = []
        for row in rows:
            role = "assistant" if row["is_from_bot"] else "user"

            if row["message_type"] == "image" and row["nas_path"]:
                # 圖片訊息：轉為暫存路徑
                temp_path = await ensure_temp_image(row["message_id"], row["nas_path"])
                content = f"[上傳圖片: {temp_path}]" if temp_path else "[圖片已過期]"
            else:
                content = row["content"]

            # 群組對話加發送者名稱
            if line_group_id and not row["is_from_bot"] and row["display_name"]:
                content = f"{row['display_name']}: {content}"

            context.append({"role": role, "content": content})

        return context, images, files
```

### 對話重置

用戶可以發送 `/新對話` 來重置對話歷史：

```python
RESET_COMMANDS = ["/新對話", "/reset", "/清除對話", "/忘記"]

def is_reset_command(content: str) -> bool:
    """檢查是否為重置對話指令"""
    return content.strip().lower() in [cmd.lower() for cmd in RESET_COMMANDS]

async def reset_conversation(line_user_id: str) -> bool:
    """重置用戶的對話歷史"""
    async with get_connection() as conn:
        result = await conn.execute(
            """
            UPDATE line_users
            SET conversation_reset_at = NOW()
            WHERE line_user_id = $1
            """,
            line_user_id,
        )
        return result == "UPDATE 1"
```

---

## 建立 System Prompt

System Prompt 需要動態加入對話識別資訊，讓 MCP 工具知道是誰在操作：

```python
async def build_system_prompt(
    line_group_id: UUID | None,
    line_user_id: str | None,
    base_prompt: str,
    builtin_tools: list[str] | None = None,
) -> str:
    """建立系統提示"""
    # 加入工具說明
    if "WebFetch" in (builtin_tools or []):
        base_prompt += """
【網頁讀取】
- 網頁連結（http/https）→ 使用 WebFetch 工具讀取
- Google 文件連結需轉換為 export 格式"""

    # 查詢用戶的 CTOS user_id（用於權限檢查）
    ctos_user_id = None
    if line_user_id:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT user_id FROM line_users WHERE line_user_id = $1",
                line_user_id,
            )
            if row and row["user_id"]:
                ctos_user_id = row["user_id"]

    # 加入對話識別資訊
    if line_group_id:
        async with get_connection() as conn:
            group = await conn.fetchrow(
                """
                SELECT g.name, g.project_id, p.name as project_name
                FROM line_groups g
                LEFT JOIN projects p ON g.project_id = p.id
                WHERE g.id = $1
                """,
                line_group_id,
            )
            if group and group["project_name"]:
                base_prompt += f"\n\n目前群組：{group['name']}"
                base_prompt += f"\n綁定專案：{group['project_name']}"
                base_prompt += f"\n專案 ID：{group['project_id']}"

        base_prompt += f"\n\n【對話識別】\nline_group_id: {line_group_id}"
    elif line_user_id:
        base_prompt += f"\n\n【對話識別】\nline_user_id: {line_user_id}"

    if ctos_user_id:
        base_prompt += f"\nctos_user_id: {ctos_user_id}"
    else:
        base_prompt += "\nctos_user_id: （未關聯）"

    return base_prompt
```

---

## 呼叫 Claude AI

整合 Claude CLI 並傳入 MCP 工具：

```python
async def process_message_with_ai(
    message_uuid: UUID,
    content: str,
    line_group_id: UUID | None,
    line_user_id: str | None,
    reply_token: str | None,
    user_display_name: str | None = None,
) -> str | None:
    """使用 AI 處理訊息"""
    is_group = line_group_id is not None

    # 取得 Agent 設定
    agent = await get_linebot_agent(is_group)
    model = agent["model"].replace("claude-", "")  # claude-sonnet -> sonnet
    base_prompt = agent["system_prompt"]["content"]

    # 建立 System Prompt
    system_prompt = await build_system_prompt(
        line_group_id, line_user_id, base_prompt
    )

    # 取得對話歷史
    history, images, files = await get_conversation_context(
        line_group_id, line_user_id, limit=20
    )

    # 準備用戶訊息
    user_message = content
    if user_display_name:
        user_message = f"{user_display_name}: {content}"

    # MCP 工具列表
    from .mcp_server import get_mcp_tool_names
    mcp_tools = await get_mcp_tool_names(exclude_group_only=not is_group)

    # 合併工具：內建工具 + MCP 工具 + Read（讀取圖片）
    all_tools = ["WebFetch", "WebSearch"] + mcp_tools + ["Read"]

    # 計時
    start_time = time.time()

    # 呼叫 Claude CLI
    response = await call_claude(
        prompt=user_message,
        model=model,
        history=history,
        system_prompt=system_prompt,
        timeout=180,
        tools=all_tools,
    )

    duration_ms = int((time.time() - start_time) * 1000)

    # 記錄 AI Log
    await log_linebot_ai_call(
        message_uuid=message_uuid,
        is_group=is_group,
        input_prompt=user_message,
        system_prompt=system_prompt,
        model=model,
        response=response,
        duration_ms=duration_ms,
    )

    if not response.success:
        logger.error(f"Claude CLI 失敗: {response.error}")
        return None

    return response.message
```

---

## AI Log 記錄

為了追蹤和除錯，我們記錄每次 AI 調用：

```python
async def log_linebot_ai_call(
    message_uuid: UUID,
    is_group: bool,
    input_prompt: str,
    system_prompt: str,
    model: str,
    response,
    duration_ms: int,
) -> None:
    """記錄 Line Bot AI 調用"""
    agent_name = AGENT_LINEBOT_GROUP if is_group else AGENT_LINEBOT_PERSONAL

    # 將 tool_calls 轉換為可序列化格式
    parsed_response = None
    if response.tool_calls:
        parsed_response = {
            "tool_calls": [
                {
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.input,
                    "output": tc.output,
                }
                for tc in response.tool_calls
            ]
        }

    log_data = AiLogCreate(
        context_type="linebot-group" if is_group else "linebot-personal",
        context_id=str(message_uuid),
        input_prompt=input_prompt,
        system_prompt=system_prompt,
        raw_response=response.message if response.success else None,
        parsed_response=parsed_response,
        model=model,
        success=response.success,
        error_message=response.error if not response.success else None,
        duration_ms=duration_ms,
        input_tokens=response.input_tokens,
        output_tokens=response.output_tokens,
    )

    await ai_manager.create_log(log_data)
```

---

## 回應解析與發送

AI 回應可能包含檔案訊息標記，需要解析並發送：

```python
def parse_ai_response(response: str) -> tuple[str, list[dict]]:
    """解析 AI 回應，提取文字和檔案訊息"""
    import re
    import json

    # 匹配 [FILE_MESSAGE:{...}] 標記
    pattern = r'\[FILE_MESSAGE:(\{.*?\})\]'
    files = []

    for match in re.finditer(pattern, response):
        try:
            file_info = json.loads(match.group(1))
            files.append(file_info)
        except json.JSONDecodeError:
            pass

    # 移除標記，保留純文字
    text = re.sub(pattern, '', response).strip()
    text = re.sub(r'\n{3,}', '\n\n', text)  # 清理多餘空行

    return text, files


async def send_ai_response(
    reply_token: str,
    text: str,
    file_messages: list[dict],
) -> list[str]:
    """發送 AI 回應（文字 + 檔案）"""
    from linebot.v3.messaging import TextMessage, ImageMessage

    messages = []

    # 先加入文字訊息
    if text:
        messages.append(TextMessage(text=text))

    # 處理檔案訊息
    for file_info in file_messages:
        file_type = file_info.get("type", "file")
        url = file_info.get("url", "")

        if file_type == "image" and url:
            # 圖片：使用 ImageMessage
            messages.append(ImageMessage(
                original_content_url=url,
                preview_image_url=url,
            ))
        elif url:
            # 其他檔案：加入連結
            link_text = f"📎 {file_info.get('name', '檔案')}\n{url}"
            if messages and isinstance(messages[0], TextMessage):
                messages[0] = TextMessage(text=messages[0].text + "\n\n" + link_text)
            else:
                messages.append(TextMessage(text=link_text))

    # Line 限制每次最多 5 則訊息
    if len(messages) > 5:
        messages = messages[:5]

    return await reply_messages(reply_token, messages)
```

---

## Prompt 設計重點

Line Bot 的 Prompt 有幾個重要原則：

### 1. 禁止 Markdown

Line 不支援 Markdown 渲染，所以要明確告知 AI：

```
格式規則（重要）：
- 禁止使用 Markdown 格式，Line 不支援 Markdown 渲染
- 不要用 **粗體**、*斜體*、# 標題、`程式碼` 等語法
- 使用純文字和 emoji 來排版
- 使用全形標點符號（，。！？：）
- 列表用「・」或數字，不要用「-」或「*」
```

### 2. 對話識別資訊

讓 MCP 工具知道操作者身份：

```
【對話識別】
line_group_id: {uuid}
ctos_user_id: {user_id}
```

### 3. 工具使用流程

提供清楚的工具使用指引：

```
使用工具的流程：
1. 先用 query_project 搜尋專案取得 ID
2. 用 add_project_member 新增成員
3. 用 add_note 新增知識庫筆記
4. 用 prepare_file_message 準備發送 NAS 檔案
```

---

## 小結

本篇實作了 Line Bot 與 Claude AI 的整合：

| 功能 | 說明 |
|------|------|
| AI 觸發判斷 | 個人全觸發、群組 @ 或回覆觸發 |
| Agent 設計 | 個人用 Sonnet、群組用 Haiku |
| 對話歷史 | 取最近 20 則，含圖片/檔案 |
| MCP 工具 | 專案管理、知識庫、NAS 檔案 |
| AI Log | 記錄調用供追蹤除錯 |
| 回應發送 | 解析文字 + 圖片混合回覆 |

下一篇我們將實作 [群組管理與專案綁定]({% post_url 2026-01-02-linebot-part4-group-project %})，讓 Line 群組與專案管理系統連動。

---

## 參考資源

- [Line Bot 整合（一）：Webhook 架構]({% post_url 2025-12-30-linebot-part1-webhook %})
- [Line Bot 整合（二）：檔案處理]({% post_url 2025-12-31-linebot-part2-file-download %})
- [Claude AI 整合系列]({% post_url 2025-12-11-claude-ai-part1-architecture %})
- [MCP 協議文件](https://modelcontextprotocol.io/)
