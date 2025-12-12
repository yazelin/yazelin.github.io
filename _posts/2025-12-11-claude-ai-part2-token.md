---
layout: post
title: "Token 管理：估算、警告與自動壓縮"
subtitle: "讓 AI 對話永遠不會「失憶」"
date: 2025-12-11
categories: [Claude AI]
tags: [AI, Claude, Token, 對話壓縮, JavaScript]
---

> **📚 Claude AI 整合系列**
> 1. [架構選擇：Claude CLI 整合與對話設計]({% post_url 2025-12-11-claude-ai-part1-architecture %})
> 2. **Token 管理：估算、警告與自動壓縮** ← 目前閱讀
> 3. [System Prompt 設計：打造專屬 AI 助手人格]({% post_url 2025-12-11-claude-ai-part3-prompt %})

---

## 這篇文章要解決什麼問題？

上一篇我們完成了 Claude 整合，但隨著對話越來越長，會遇到這些問題：

1. **Context Window 限制**：Claude 有 ~200k tokens 的限制，超過就會失敗
2. **回應品質下降**：對話太長，AI 可能忽略早期的重要資訊
3. **成本增加**：每次呼叫都帶完整歷史，token 消耗直線上升
4. **使用者困惑**：不知道何時該「重新開始」

**財務**：「這個月 AI 服務費用比上個月多了三倍，怎麼回事？」  
**老闆**：「不是說 AI 可以省成本嗎？怎麼越用越貴？」  
**後端工程師**：「因為有些同事對話太長，每次都帶完整歷史，token 消耗很快。」  
**老闆**：「有辦法控制嗎？」  
**後端工程師**：「可以加入 token 管理機制。在前端顯示即時用量、快滿時自動警告、太長時壓縮舊對話。這樣帳單就可預測，不會月底驚嚇。」  
**財務**：「那可以設定每月上限嗎？」  
**後端工程師**：「當然可以，超過就提醒使用者開新對話。」

---

## 技術概念

### 什麼是 Token？

Token 是 AI 模型處理文字的基本單位。它不是「字數」，而是模型切割文字的方式：

```
"Hello World" → ["Hello", " World"] → 2 tokens

"你好世界" → ["你", "好", "世", "界"] → 4 tokens（中文通常 1 字 ≈ 1-2 tokens）

"API_KEY=abc123" → ["API", "_", "KEY", "=", "abc", "123"] → 6 tokens
```

**簡化估算公式**：
- 英文：約 4 字元 = 1 token
- 中文：約 1.5 字元 = 1 token
- 混合內容：約 2 字元 = 1 token（我們採用這個）

### 為什麼要在前端估算？

```
方案一：每次都問後端
┌─────────────────────────────────────┐
│ 使用者輸入 → API 呼叫 → 顯示 token  │
│            ↑ 延遲！               │
└─────────────────────────────────────┘

方案二：前端即時估算（採用）
┌─────────────────────────────────────┐
│ 使用者輸入 → 立即顯示估算值        │
│            ↑ 即時！               │
└─────────────────────────────────────┘
```

前端估算不精確但夠用，重要的是給使用者即時反饋。

### 壓縮策略

當對話太長時，不是直接刪掉舊訊息（會丟失重要上下文），而是：

```
壓縮前：
[msg1, msg2, msg3, ... msg40, msg41, ... msg50]
  │←───── 壓縮這些 ─────→│ │←─ 保留這些 ─→│

壓縮後：
[{摘要}, msg41, msg42, ... msg50]
   │
   └── AI 產生的結構化摘要，包含：
       - 任務目標
       - 目前進度
       - 重要決策
       - 待辦事項
```

---

## 跟著做：Step by Step

### Step 1：Token 估算函數

```javascript
// 常數設定
const TOKEN_LIMIT = 200000;       // Claude 的 context window
const WARNING_THRESHOLD = 0.75;   // 75% 時開始警告

/**
 * 估算文字的 token 數量
 * 簡化公式：約 2 字元 = 1 token
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 2);
}

/**
 * 計算整個對話的 token 總數
 * @param {Array} messages - [{role, content}, ...]
 * @returns {number}
 */
function getChatTokens(messages) {
    if (!messages || !Array.isArray(messages)) return 0;

    return messages.reduce((sum, msg) => {
        return sum + estimateTokens(msg.content || '');
    }, 0);
}
```

### Step 2：Token 顯示 UI

```html
<!-- 工具列中的 Token 顯示 -->
<div class="ai-token-info">
    <span class="ai-token-count">0</span>
    <span class="ai-token-separator">/</span>
    <span class="ai-token-limit">200,000</span>
</div>

<!-- 警告條（預設隱藏）-->
<div class="ai-token-warning" style="display: none;">
    <span class="ai-warning-text"></span>
    <button class="ai-compress-btn btn btn-warning">壓縮對話</button>
</div>
```

```css
/* Token 顯示樣式 */
.ai-token-info {
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 2px;
}

.ai-token-count {
    font-variant-numeric: tabular-nums; /* 讓數字等寬 */
}

.ai-token-count.warning {
    color: var(--color-warning);
    font-weight: 600;
}

/* 警告條樣式 */
.ai-token-warning {
    background: var(--color-warning-bg);
    border-bottom: 1px solid var(--color-warning);
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.ai-warning-text {
    color: var(--color-warning-text);
    font-size: 13px;
}

.ai-compress-btn {
    padding: 4px 12px;
    font-size: 12px;
}
```

### Step 3：更新 Token 顯示

```javascript
/**
 * 更新 Token 顯示和警告狀態
 * @param {Array} messages - 當前對話的訊息列表
 */
function updateTokenDisplay(messages) {
    const tokens = getChatTokens(messages);
    const percentage = tokens / TOKEN_LIMIT;

    // 1. 更新數字顯示
    const tokenCount = document.querySelector('.ai-token-count');
    if (tokenCount) {
        tokenCount.textContent = tokens.toLocaleString();

        // 超過閾值變成警告色
        if (percentage > WARNING_THRESHOLD) {
            tokenCount.classList.add('warning');
        } else {
            tokenCount.classList.remove('warning');
        }
    }

    // 2. 更新警告條
    const warningBar = document.querySelector('.ai-token-warning');
    const warningText = document.querySelector('.ai-warning-text');

    if (warningBar && warningText) {
        if (percentage > WARNING_THRESHOLD) {
            const pct = Math.round(percentage * 100);
            warningText.textContent = `對話過長 (${pct}%)，建議壓縮以維持 AI 回應品質`;
            warningBar.style.display = 'flex';
        } else {
            warningBar.style.display = 'none';
        }
    }
}

// 在渲染訊息後呼叫
function renderMessages() {
    // ... 渲染訊息的程式碼 ...

    // 更新 token 顯示
    updateTokenDisplay(currentChat.messages);
}
```

### Step 4：前端壓縮按鈕

```javascript
// 壓縮狀態
let isCompressing = false;

// 綁定壓縮按鈕事件
const compressBtn = document.querySelector('.ai-compress-btn');
if (compressBtn) {
    compressBtn.addEventListener('click', () => {
        if (isCompressing) return;

        // 透過 Socket.IO 發送壓縮請求
        if (currentChatId && SocketClient.isConnected()) {
            SocketClient.compressChat(currentChatId);
        }
    });
}

// Socket.IO 事件：壓縮開始
SocketClient.on('compress_started', (data) => {
    if (data.chatId === currentChatId) {
        isCompressing = true;
        compressBtn.textContent = '壓縮中...';
        compressBtn.disabled = true;
    }
});

// Socket.IO 事件：壓縮完成
SocketClient.on('compress_complete', (data) => {
    if (data.chatId === currentChatId) {
        isCompressing = false;
        compressBtn.textContent = '壓縮對話';
        compressBtn.disabled = false;

        // 更新本地訊息列表
        currentChat.messages = data.messages;
        renderMessages();

        console.log(`壓縮完成，減少了 ${data.compressed_count} 則訊息`);
    }
});

// Socket.IO 事件：壓縮失敗
SocketClient.on('compress_error', (data) => {
    if (data.chatId === currentChatId) {
        isCompressing = false;
        compressBtn.textContent = '壓縮對話';
        compressBtn.disabled = false;

        alert(`壓縮失敗：${data.error}`);
    }
});
```

### Step 5：後端壓縮服務

```python
# claude_agent.py

async def call_claude_for_summary(
    messages_to_compress: list[dict],
    timeout: int = 120,
) -> ClaudeResponse:
    """呼叫 Claude 壓縮對話歷史"""

    # 1. 讀取 summarizer prompt
    summarizer_prompt = get_prompt_content("summarizer")
    if not summarizer_prompt:
        return ClaudeResponse(
            success=False,
            message="",
            error="找不到 summarizer.md prompt 檔案"
        )

    # 2. 組合需要壓縮的對話
    conversation_parts = []
    for msg in messages_to_compress:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        conversation_parts.append(f"{role}: {content}")

    conversation_text = "\n".join(conversation_parts)

    # 3. 建立完整 prompt
    full_prompt = f"""請將以下對話歷史壓縮成摘要：

---
{conversation_text}
---

請依照指定格式輸出摘要。"""

    # 4. 使用較快的模型（haiku）執行壓縮
    return await call_claude(
        prompt=full_prompt,
        model="haiku",  # 快速且便宜
        system_prompt=summarizer_prompt,
        timeout=timeout,
    )
```

### Step 6：Socket.IO 壓縮事件處理

```python
# api/ai.py

KEEP_RECENT_MESSAGES = 10  # 保留最近 10 則訊息

@sio.on('compress_chat')
async def handle_compress(sid: str, data: dict):
    """處理對話壓縮請求"""
    chat_id = data.get('chatId')

    if not chat_id:
        await sio.emit('compress_error', {
            'chatId': chat_id,
            'error': '缺少 chatId'
        }, to=sid)
        return

    try:
        # 1. 通知開始壓縮
        await sio.emit('compress_started', {'chatId': chat_id}, to=sid)

        # 2. 取得對話訊息
        messages = await get_chat_messages(chat_id)

        if len(messages) <= KEEP_RECENT_MESSAGES:
            await sio.emit('compress_error', {
                'chatId': chat_id,
                'error': '訊息太少，不需要壓縮'
            }, to=sid)
            return

        # 3. 分割訊息
        messages_to_compress = messages[:-KEEP_RECENT_MESSAGES]
        messages_to_keep = messages[-KEEP_RECENT_MESSAGES:]

        # 4. 呼叫 Claude 產生摘要
        response = await call_claude_for_summary(messages_to_compress)

        if not response.success:
            await sio.emit('compress_error', {
                'chatId': chat_id,
                'error': response.error
            }, to=sid)
            return

        # 5. 建立摘要訊息
        summary_message = {
            'role': 'system',
            'content': f"[對話摘要]\n{response.message}",
            'timestamp': int(time.time()),
            'is_summary': True
        }

        # 6. 組合新的訊息列表
        new_messages = [summary_message] + messages_to_keep

        # 7. 更新資料庫
        await update_chat_messages(chat_id, new_messages)

        # 8. 回傳結果
        await sio.emit('compress_complete', {
            'chatId': chat_id,
            'messages': new_messages,
            'compressed_count': len(messages_to_compress)
        }, to=sid)

    except Exception as e:
        await sio.emit('compress_error', {
            'chatId': chat_id,
            'error': str(e)
        }, to=sid)
```

### Step 7：Summarizer Prompt

```markdown
<!-- data/prompts/summarizer.md -->
# 對話摘要助手

你是對話摘要助手。請將以下對話歷史壓縮成結構化摘要，
讓 AI 在後續對話中能快速理解上下文。

## 輸出格式

請用以下格式輸出：

### 任務概覽 (Task Overview)
- 使用者的主要目標是什麼？
- 這個對話在解決什麼問題？

### 當前狀態 (Current State)
- 目前進展到哪裡？
- 有什麼已完成的部分？

### 重要發現 (Important Discoveries)
- 過程中發現的關鍵資訊
- 做出的重要決策及原因

### 下一步 (Next Steps)
- 待辦事項
- 使用者提到但尚未處理的需求

### 需保留的上下文 (Context to Preserve)
- 重要的名稱、數字、設定值
- 專有名詞或特定術語
- 任何不能遺忘的細節

## 注意事項
- 保持簡潔，但不要遺漏重要細節
- 使用繁體中文
- 摘要應該讓 AI 讀完後能無縫接續對話
- 不要加入你自己的判斷或建議，只整理對話內容
```

---

## 進階技巧與踩坑紀錄

### 1. 摘要訊息的特殊處理

壓縮後的摘要訊息要特別標記，在組合 prompt 時當作 system context 處理：

```python
def compose_prompt_with_history(history, new_message, max_messages=40):
    parts = []
    summary = None

    # 找出摘要訊息
    for msg in history:
        if msg.get("is_summary"):
            summary = msg
            break

    # 如果有摘要，放在最前面
    if summary:
        parts.append("## 之前對話的摘要")
        parts.append(summary.get("content", ""))
        parts.append("")

    # 加入非摘要的歷史訊息
    recent_history = [m for m in history if not m.get("is_summary")]
    recent_history = recent_history[-max_messages:]

    if recent_history:
        parts.append("## 最近的對話")
        for msg in recent_history:
            parts.append(f"{msg['role']}: {msg['content']}")

    parts.append("")
    parts.append(f"user: {new_message}")

    return "\n".join(parts)
```

### 2. 顯示摘要訊息

在 UI 中，摘要訊息應該跟一般訊息有區別：

```javascript
function renderMessages() {
    container.innerHTML = messages.map(msg => {
        // 摘要訊息特殊樣式
        if (msg.is_summary) {
            return `
                <div class="ai-message ai-message-summary">
                    <div class="ai-message-content">
                        <div class="ai-message-role">對話摘要</div>
                        <div class="ai-message-text">${renderMarkdown(msg.content)}</div>
                    </div>
                </div>
            `;
        }

        // 一般訊息
        return `
            <div class="ai-message ai-message-${msg.role}">
                ...
            </div>
        `;
    }).join('');
}
```

```css
.ai-message-summary {
    background: var(--bg-surface);
    border-left: 3px solid var(--color-info);
    margin: 16px 0;
    padding: 12px;
    border-radius: 4px;
}

.ai-message-summary .ai-message-role {
    color: var(--color-info);
    font-weight: 600;
}
```

### 3. 更精確的 Token 估算

如果需要更精確的估算，可以使用 tokenizer 庫：

```javascript
// 使用 GPT Tokenizer（適用於大部分 LLM）
// npm install gpt-tokenizer

import { encode } from 'gpt-tokenizer';

function estimateTokensPrecise(text) {
    return encode(text).length;
}
```

但對於內部系統，簡單的字元估算通常就夠用了。

### 4. 自動壓縮

可以在每次 AI 回應後自動檢查是否需要壓縮：

```python
# 在 AI 回應後檢查
async def check_auto_compress(chat_id: str, sid: str):
    messages = await get_chat_messages(chat_id)
    tokens = sum(len(m.get('content', '')) // 2 for m in messages)

    # 超過 80% 自動壓縮
    if tokens > TOKEN_LIMIT * 0.8:
        await handle_compress(sid, {'chatId': chat_id})
```

但要注意告知使用者正在壓縮，避免困惑。

### 5. 壓縮失敗的處理

```javascript
// 壓縮失敗時的 fallback
SocketClient.on('compress_error', (data) => {
    // 提供手動選項
    const shouldTruncate = confirm(
        `壓縮失敗：${data.error}\n\n` +
        `是否要直接刪除較舊的訊息？（會遺失部分對話紀錄）`
    );

    if (shouldTruncate) {
        SocketClient.emit('truncate_chat', {
            chatId: data.chatId,
            keepRecent: 20
        });
    }
});
```

---

## 小結

這篇我們完成了：

1. **Token 估算**：簡單公式即時顯示
2. **警告機制**：超過 75% 提醒使用者
3. **壓縮按鈕**：一鍵壓縮對話歷史
4. **Summarizer Agent**：用 AI 產生結構化摘要

**完整的壓縮流程**：

```
使用者點擊「壓縮對話」
    │
    ▼
Frontend ─── compress_chat ───> Backend
    │
    │                              │
    │◄── compress_started ────────│
    │                              │
    │                              ├── 分割訊息
    │                              ├── 呼叫 Claude (haiku)
    │                              ├── 產生摘要
    │                              └── 更新 DB
    │                              │
    │◄── compress_complete ───────│
    │
    ▼
更新本地訊息列表 + 重新渲染
```

下一篇，我們來設計讓 AI 有個性的關鍵：**System Prompt 設計**。

---

## 完整程式碼

### 前端 Token 管理

```javascript
/**
 * Token 管理模組
 */
const TokenManager = (function() {
    const TOKEN_LIMIT = 200000;
    const WARNING_THRESHOLD = 0.75;

    /**
     * 估算 token 數量
     */
    function estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 2);
    }

    /**
     * 計算對話總 token
     */
    function getChatTokens(messages) {
        if (!messages || !Array.isArray(messages)) return 0;
        return messages.reduce((sum, msg) =>
            sum + estimateTokens(msg.content || ''), 0);
    }

    /**
     * 更新顯示
     */
    function updateDisplay(messages) {
        const tokens = getChatTokens(messages);
        const percentage = tokens / TOKEN_LIMIT;

        // 更新數字
        const countEl = document.querySelector('.ai-token-count');
        if (countEl) {
            countEl.textContent = tokens.toLocaleString();
            countEl.classList.toggle('warning', percentage > WARNING_THRESHOLD);
        }

        // 更新警告條
        const warningBar = document.querySelector('.ai-token-warning');
        const warningText = document.querySelector('.ai-warning-text');
        if (warningBar && warningText) {
            if (percentage > WARNING_THRESHOLD) {
                const pct = Math.round(percentage * 100);
                warningText.textContent = `對話過長 (${pct}%)，建議壓縮`;
                warningBar.style.display = 'flex';
            } else {
                warningBar.style.display = 'none';
            }
        }
    }

    /**
     * 檢查是否需要警告
     */
    function shouldWarn(messages) {
        const tokens = getChatTokens(messages);
        return tokens / TOKEN_LIMIT > WARNING_THRESHOLD;
    }

    return {
        estimateTokens,
        getChatTokens,
        updateDisplay,
        shouldWarn,
        TOKEN_LIMIT,
        WARNING_THRESHOLD
    };
})();
```

### 後端壓縮服務

```python
"""對話壓縮服務"""

import time
from .claude_agent import call_claude, get_prompt_content, ClaudeResponse


KEEP_RECENT_MESSAGES = 10


async def compress_chat_messages(messages: list[dict]) -> ClaudeResponse:
    """壓縮對話訊息

    Args:
        messages: 完整的訊息列表

    Returns:
        ClaudeResponse: 包含壓縮結果
    """
    if len(messages) <= KEEP_RECENT_MESSAGES:
        return ClaudeResponse(
            success=False,
            message="",
            error="訊息太少，不需要壓縮"
        )

    # 分割訊息
    messages_to_compress = messages[:-KEEP_RECENT_MESSAGES]
    messages_to_keep = messages[-KEEP_RECENT_MESSAGES:]

    # 讀取 summarizer prompt
    summarizer_prompt = get_prompt_content("summarizer")
    if not summarizer_prompt:
        return ClaudeResponse(
            success=False,
            message="",
            error="找不到 summarizer prompt"
        )

    # 組合對話文字
    conversation_parts = []
    for msg in messages_to_compress:
        if msg.get("is_summary"):
            continue
        role = msg.get("role", "user")
        content = msg.get("content", "")
        conversation_parts.append(f"{role}: {content}")

    conversation_text = "\n".join(conversation_parts)

    # 呼叫 Claude
    prompt = f"""請將以下對話歷史壓縮成摘要：

---
{conversation_text}
---

請依照指定格式輸出摘要。"""

    response = await call_claude(
        prompt=prompt,
        model="haiku",
        system_prompt=summarizer_prompt,
        timeout=120
    )

    if not response.success:
        return response

    # 建立摘要訊息
    summary_message = {
        "role": "system",
        "content": f"[對話摘要]\n{response.message}",
        "timestamp": int(time.time()),
        "is_summary": True
    }

    # 組合新訊息列表
    new_messages = [summary_message] + messages_to_keep

    return ClaudeResponse(
        success=True,
        message=str(len(messages_to_compress)),  # 壓縮了幾則
        error=None
    ), new_messages
```
