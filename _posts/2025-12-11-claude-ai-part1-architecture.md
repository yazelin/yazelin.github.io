---
layout: post
title: "架構選擇：Claude CLI 整合與對話設計"
subtitle: "用最簡單的方式把 AI 加進你的系統"
date: 2025-12-11
categories: [Claude AI]
tags: [AI, Claude, Python, asyncio, 對話系統]
---

![架構選擇：Claude CLI 整合與對話設計](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part1-architecture.png)

> **📚 Claude AI 整合系列**
> 1. **架構選擇：Claude CLI 整合與對話設計** ← 目前閱讀
> 2. [Token 管理：估算、警告與自動壓縮]({% post_url 2025-12-11-claude-ai-part2-token %})
> 3. [System Prompt 設計：打造專屬 AI 助手人格]({% post_url 2025-12-11-claude-ai-part3-prompt %})

---

## 這篇文章要解決什麼問題？

**資深員工**：「這個月第十個新人問我同樣的問題了，我自己的工作都做不完...」  
**新人**：「不好意思，文件我看了但還是不太懂，可以請教一下嗎？」  
**老闆**：「資深員工時間很寶貴，有沒有辦法讓新人自己找到答案？」  
**後端工程師**：「我們可以整合 AI 助手，讓它 7x24 回答常見問題。訓練資料就用現有文件，資深員工只需要處理 AI 答不出來的問題。」  
**老闆**：「這樣資深員工可以專注高價值工作，人力成本不增加但產能提升？」  
**後端工程師**：「沒錯，而且 AI 的回答還可以累積成知識庫。」

現在很多公司想在內部系統加入 AI 助手，但面臨幾個問題：

1. **API 整合複雜**：需要處理認證、速率限制、錯誤重試
2. **對話歷史管理**：AI 需要記得之前說過什麼
3. **成本控制**：長對話會消耗大量 token
4. **客製化需求**：想讓 AI 有公司專屬的「人設」

---

## 技術概念

### Claude CLI vs Claude API

整合 Claude 有兩條路：

| 方案 | 優點 | 缺點 |
|------|------|------|
| **Claude API** | 完整控制、Streaming 支援 | 需要自己實作 HTTP 呼叫、處理認證 |
| **Claude CLI** | 安裝即用、認證已處理好 | 較少彈性、需要 shell 環境 |

我們選擇 **Claude CLI**，原因：
- 內部系統，不需要極致效能
- CLI 已經處理好認證和重試
- 簡單就是美，維護成本低

### 對話歷史管理策略

Claude CLI 有內建的 `--session-id` 參數，但我們選擇**不用**，自己管理歷史：

```
方案一：使用 CLI Session（不採用）
┌─────────────────────────────────────┐
│ claude --session-id abc123 -p "..."│
│                                     │
│ CLI 內部維護歷史 ← 我們無法控制      │
└─────────────────────────────────────┘

方案二：自己管理歷史（採用）
┌─────────────────────────────────────┐
│ 1. 從 DB 讀取對話歷史                │
│ 2. 組合成完整 prompt                 │
│ 3. claude -p "完整prompt" --model   │
│ 4. 把回應存回 DB                     │
└─────────────────────────────────────┘
```

自己管理的好處：
- **可持久化**：對話存在資料庫，重啟不會遺失
- **可壓縮**：對話太長時可以主動摘要
- **跨裝置**：使用者換電腦也能繼續對話
- **可審計**：知道 AI 講了什麼

### Prompt 組合格式

我們把對話歷史組合成這樣的格式傳給 Claude：

```
對話歷史：

user: 你好，我想查詢上個月的營業額
assistant: 好的，請問您想查詢哪個部門的營業額？
user: 業務部

user: 還有研發部的也給我
```

注意：最後一則是新訊息，前面是歷史。

---

## 跟著做：Step by Step

### Step 1：安裝 Claude Code

> 完整的環境安裝流程（包含 nvm、Node.js、OpenSpec、uv）請參考 **[SDD 規格驅動開發入門（一）：環境安裝篇]({% post_url 2025-12-07-sdd-setup-guide %})**

```bash
# 安裝 Claude Code（需要 Node.js 18+）
npm install -g @anthropic-ai/claude-code

# 首次啟動（會自動提示登入，開啟瀏覽器認證）
claude

# 或在交互式會話中使用 /login 命令登入
> /login

# 測試非交互模式
claude -p "你好，請自我介紹"
```

### Step 2：建立回應資料結構

```python
# claude_agent.py
from dataclasses import dataclass
from typing import Optional

@dataclass
class ClaudeResponse:
    """Claude CLI 回應結構"""
    success: bool          # 是否成功
    message: str           # AI 回應內容
    error: Optional[str] = None  # 錯誤訊息（如果失敗）
```

### Step 3：組合對話歷史

```python
def compose_prompt_with_history(
    history: list[dict],
    new_message: str,
    max_messages: int = 40
) -> str:
    """組合對話歷史和新訊息成完整 prompt

    Args:
        history: 對話歷史 [{"role": "user/assistant", "content": "..."}]
        new_message: 新的使用者訊息
        max_messages: 最多保留的歷史訊息數量（避免太長）

    Returns:
        組合後的完整 prompt
    """
    # 只保留最近的訊息（避免超出 context window）
    recent_history = history[-max_messages:] if len(history) > max_messages else history

    parts = []

    # 加入歷史（如果有的話）
    if recent_history:
        parts.append("對話歷史：")
        parts.append("")  # 空行

        for msg in recent_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            # 跳過摘要訊息（它會在 system prompt 中處理）
            if msg.get("is_summary"):
                continue

            parts.append(f"{role}: {content}")

        parts.append("")  # 空行

    # 加入新訊息
    parts.append(f"user: {new_message}")

    return "\n".join(parts)
```

### Step 4：非同步呼叫 Claude CLI

```python
import asyncio

# 模型名稱對應
MODEL_MAP = {
    "claude-opus": "opus",
    "claude-sonnet": "sonnet",
    "claude-haiku": "haiku",
}

# 預設超時時間
DEFAULT_TIMEOUT = 120  # 秒

async def call_claude(
    prompt: str,
    model: str = "sonnet",
    history: list[dict] | None = None,
    system_prompt: str | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> ClaudeResponse:
    """非同步呼叫 Claude CLI

    Args:
        prompt: 使用者訊息
        model: 模型名稱（opus, sonnet, haiku）
        history: 對話歷史
        system_prompt: System prompt 內容
        timeout: 超時秒數

    Returns:
        ClaudeResponse
    """
    # 1. 轉換模型名稱
    cli_model = MODEL_MAP.get(model, model)

    # 2. 組合完整 prompt（包含歷史）
    if history:
        full_prompt = compose_prompt_with_history(history, prompt)
    else:
        full_prompt = prompt

    # 3. 建立 Claude CLI 命令
    cmd = ["claude", "-p", full_prompt, "--model", cli_model]

    # 4. 加入 system prompt（如果有）
    if system_prompt:
        cmd.extend(["--system-prompt", system_prompt])

    try:
        # 5. 建立非同步子程序
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # 6. 等待完成（含超時）
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout,
        )

        stdout = stdout_bytes.decode("utf-8").strip()
        stderr = stderr_bytes.decode("utf-8").strip()

        # 7. 檢查執行結果
        if proc.returncode != 0:
            error_msg = stderr or f"Claude CLI 執行失敗 (code: {proc.returncode})"
            return ClaudeResponse(success=False, message="", error=error_msg)

        return ClaudeResponse(success=True, message=stdout)

    except asyncio.TimeoutError:
        return ClaudeResponse(
            success=False,
            message="",
            error=f"請求超時（{timeout} 秒）"
        )

    except FileNotFoundError:
        return ClaudeResponse(
            success=False,
            message="",
            error="找不到 Claude CLI，請確認已安裝"
        )

    except Exception as e:
        return ClaudeResponse(
            success=False,
            message="",
            error=f"呼叫 Claude CLI 時發生錯誤: {str(e)}"
        )
```

### Step 5：整合 FastAPI + Socket.IO

```python
# api/ai.py
import socketio
from services.claude_agent import call_claude
from services.ai_chat import get_chat_messages, save_message

def register_events(sio: socketio.AsyncServer) -> None:
    """註冊 AI 相關的 Socket.IO 事件"""

    @sio.on('ai_chat_event')
    async def handle_chat(sid: str, data: dict):
        """處理 AI 對話事件"""
        chat_id = data.get('chatId')
        message = data.get('message')
        model = data.get('model', 'claude-sonnet')

        if not chat_id or not message:
            await sio.emit('ai_error', {
                'chatId': chat_id,
                'error': '缺少必要參數'
            }, to=sid)
            return

        try:
            # 1. 通知前端：AI 正在思考
            await sio.emit('ai_typing', {
                'chatId': chat_id,
                'typing': True
            }, to=sid)

            # 2. 取得對話歷史
            history = await get_chat_messages(chat_id)

            # 3. 取得 System Prompt（根據對話設定）
            system_prompt = get_chat_system_prompt(chat_id)

            # 4. 呼叫 Claude
            response = await call_claude(
                prompt=message,
                model=model,
                history=history,
                system_prompt=system_prompt
            )

            # 5. 關閉 typing 狀態
            await sio.emit('ai_typing', {
                'chatId': chat_id,
                'typing': False
            }, to=sid)

            if response.success:
                # 6. 儲存使用者訊息和 AI 回應
                await save_message(chat_id, 'user', message)
                await save_message(chat_id, 'assistant', response.message)

                # 7. 回傳 AI 回應
                await sio.emit('ai_response', {
                    'chatId': chat_id,
                    'message': {
                        'role': 'assistant',
                        'content': response.message,
                        'timestamp': int(time.time())
                    }
                }, to=sid)
            else:
                # 錯誤處理
                await sio.emit('ai_error', {
                    'chatId': chat_id,
                    'error': response.error
                }, to=sid)

        except Exception as e:
            await sio.emit('ai_typing', {'chatId': chat_id, 'typing': False}, to=sid)
            await sio.emit('ai_error', {'chatId': chat_id, 'error': str(e)}, to=sid)
```

### Step 6：前端整合

```javascript
// ai-assistant.js
const AIAssistant = (function() {
    let currentChatId = null;

    // 發送訊息
    async function sendMessage(message, model = 'claude-sonnet') {
        if (!currentChatId) {
            currentChatId = crypto.randomUUID();
        }

        // 顯示使用者訊息
        appendMessage('user', message);

        // 透過 Socket.IO 發送
        SocketClient.emit('ai_chat_event', {
            chatId: currentChatId,
            message: message,
            model: model
        });
    }

    // 初始化事件監聽
    function init() {
        // AI 正在輸入
        SocketClient.on('ai_typing', (data) => {
            if (data.chatId === currentChatId) {
                showTypingIndicator(data.typing);
            }
        });

        // AI 回應
        SocketClient.on('ai_response', (data) => {
            if (data.chatId === currentChatId) {
                appendMessage('assistant', data.message.content);
            }
        });

        // 錯誤處理
        SocketClient.on('ai_error', (data) => {
            if (data.chatId === currentChatId) {
                showError(data.error);
            }
        });
    }

    return { init, sendMessage };
})();
```

---

## 進階技巧與踩坑紀錄

### 1. 為什麼用 asyncio.create_subprocess_exec？

Python 有很多執行外部命令的方式：

```python
# 方式一：os.system（同步、阻塞）
os.system('claude -p "..."')  # ❌ 會阻塞整個事件迴圈

# 方式二：subprocess.run（同步、阻塞）
subprocess.run(['claude', '-p', '...'])  # ❌ 同樣會阻塞

# 方式三：asyncio.create_subprocess_exec（非同步）
proc = await asyncio.create_subprocess_exec(...)  # ✅ 不阻塞
```

在 FastAPI 這種非同步框架中，**必須**用非同步方式呼叫外部命令，否則會阻塞其他請求。

### 2. 超時處理

Claude 有時候會思考比較久（尤其是複雜問題），一定要設超時：

```python
try:
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(),
        timeout=120  # 2 分鐘超時
    )
except asyncio.TimeoutError:
    # 重要：要終止程序！
    proc.kill()
    return ClaudeResponse(success=False, error="請求超時")
```

### 3. 錯誤訊息要友善

使用者不需要看到技術細節：

```python
# ❌ 不好的錯誤訊息
"asyncio.exceptions.TimeoutError: <Timeout>"

# ✅ 好的錯誤訊息
"AI 回應超時，請稍後重試或縮短您的問題"
```

### 4. 對話歷史截斷

Claude 有 context window 限制，對話太長會失敗：

```python
def compose_prompt_with_history(history, new_message, max_messages=40):
    # 只保留最近 40 則訊息
    recent_history = history[-max_messages:]
    # ...
```

但這樣會丟失早期對話的重要資訊，下一篇會介紹更好的方法：**Token 管理與對話壓縮**。

### 5. 並發請求處理

多個使用者同時發問不會互相影響，因為：
- 每次呼叫都是獨立的 `asyncio.create_subprocess_exec`
- 每個對話有獨立的 `chatId`
- Socket.IO 事件會帶 `chatId` 識別

---

## 小結

這篇我們完成了：

1. **選擇 Claude CLI**：簡單、認證已處理、適合內部系統
2. **自己管理對話歷史**：存 DB、可壓縮、跨裝置
3. **非同步呼叫**：不阻塞 FastAPI 事件迴圈
4. **Socket.IO 整合**：即時回應、typing 狀態

**完整的資料流**：

```
使用者輸入
    │
    ▼
Frontend (Socket.IO) ─── ai_chat_event ───>
    │
    │
    ▼
Backend (FastAPI)
    │
    ├── 1. 發送 ai_typing
    ├── 2. 讀取對話歷史
    ├── 3. 組合 prompt
    ├── 4. 呼叫 Claude CLI
    ├── 5. 儲存訊息到 DB
    └── 6. 發送 ai_response
    │
    ▼
Frontend ─── 顯示 AI 回應
```

下一篇，我們要處理對話太長的問題：**Token 估算、警告、以及自動壓縮機制**。

---

## 完整程式碼

### claude_agent.py

```python
"""Claude CLI Agent 服務

使用 asyncio.subprocess 非同步呼叫 Claude CLI。
自己管理對話歷史，不依賴 CLI session。
"""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# 超時設定
DEFAULT_TIMEOUT = 120

# 模型對應表
MODEL_MAP = {
    "claude-opus": "opus",
    "claude-sonnet": "sonnet",
    "claude-haiku": "haiku",
}


@dataclass
class ClaudeResponse:
    """Claude CLI 回應"""
    success: bool
    message: str
    error: Optional[str] = None


def compose_prompt_with_history(
    history: list[dict],
    new_message: str,
    max_messages: int = 40
) -> str:
    """組合對話歷史和新訊息成完整 prompt"""
    recent_history = history[-max_messages:] if len(history) > max_messages else history

    parts = []

    if recent_history:
        parts.append("對話歷史：")
        parts.append("")
        for msg in recent_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if msg.get("is_summary"):
                continue
            parts.append(f"{role}: {content}")
        parts.append("")

    parts.append(f"user: {new_message}")

    return "\n".join(parts)


async def call_claude(
    prompt: str,
    model: str = "sonnet",
    history: list[dict] | None = None,
    system_prompt: str | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> ClaudeResponse:
    """非同步呼叫 Claude CLI"""

    cli_model = MODEL_MAP.get(model, model)

    if history:
        full_prompt = compose_prompt_with_history(history, prompt)
    else:
        full_prompt = prompt

    cmd = ["claude", "-p", full_prompt, "--model", cli_model]

    if system_prompt:
        cmd.extend(["--system-prompt", system_prompt])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout,
        )

        stdout = stdout_bytes.decode("utf-8").strip()
        stderr = stderr_bytes.decode("utf-8").strip()

        if proc.returncode != 0:
            return ClaudeResponse(
                success=False,
                message="",
                error=stderr or f"執行失敗 (code: {proc.returncode})",
            )

        return ClaudeResponse(success=True, message=stdout)

    except asyncio.TimeoutError:
        return ClaudeResponse(
            success=False,
            message="",
            error=f"請求超時（{timeout} 秒）",
        )

    except FileNotFoundError:
        return ClaudeResponse(
            success=False,
            message="",
            error="找不到 Claude CLI",
        )

    except Exception as e:
        return ClaudeResponse(
            success=False,
            message="",
            error=f"錯誤: {str(e)}",
        )
```

### api/ai.py (Socket.IO 事件)

```python
"""AI Socket.IO 事件處理"""

import time
import socketio
from services.claude_agent import call_claude
from services.ai_chat import get_chat, get_chat_messages, save_message


def register_events(sio: socketio.AsyncServer) -> None:
    """註冊 AI 相關事件"""

    @sio.on('ai_chat_event')
    async def handle_chat(sid: str, data: dict):
        """處理 AI 對話"""
        chat_id = data.get('chatId')
        message = data.get('message')
        model = data.get('model', 'claude-sonnet')

        if not chat_id or not message:
            await sio.emit('ai_error', {
                'chatId': chat_id,
                'error': '缺少必要參數'
            }, to=sid)
            return

        try:
            # 通知：AI 正在思考
            await sio.emit('ai_typing', {
                'chatId': chat_id,
                'typing': True
            }, to=sid)

            # 取得對話資料
            chat = await get_chat(chat_id)
            history = await get_chat_messages(chat_id)
            system_prompt = chat.get('system_prompt') if chat else None

            # 呼叫 Claude
            response = await call_claude(
                prompt=message,
                model=model,
                history=history,
                system_prompt=system_prompt
            )

            # 關閉 typing
            await sio.emit('ai_typing', {
                'chatId': chat_id,
                'typing': False
            }, to=sid)

            if response.success:
                # 儲存訊息
                await save_message(chat_id, 'user', message)
                await save_message(chat_id, 'assistant', response.message)

                # 回傳回應
                await sio.emit('ai_response', {
                    'chatId': chat_id,
                    'message': {
                        'role': 'assistant',
                        'content': response.message,
                        'timestamp': int(time.time())
                    }
                }, to=sid)
            else:
                await sio.emit('ai_error', {
                    'chatId': chat_id,
                    'error': response.error
                }, to=sid)

        except Exception as e:
            await sio.emit('ai_typing', {
                'chatId': chat_id,
                'typing': False
            }, to=sid)
            await sio.emit('ai_error', {
                'chatId': chat_id,
                'error': str(e)
            }, to=sid)
```
