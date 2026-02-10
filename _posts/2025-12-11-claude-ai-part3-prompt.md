---
layout: post
title: "System Prompt 設計：打造專屬 AI 助手人格"
subtitle: "讓 AI 成為公司文化的一部分"
date: 2025-12-11
categories: [Claude AI]
tags: [AI, Claude, Prompt Engineering, System Prompt]
---

![System Prompt 設計：打造專屬 AI 助手人格](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part3-prompt.png)

> **📚 Claude AI 整合系列**
> 1. [架構選擇：Claude CLI 整合與對話設計]({% post_url 2025-12-11-claude-ai-part1-architecture %})
> 2. [Token 管理：估算、警告與自動壓縮]({% post_url 2025-12-11-claude-ai-part2-token %})
> 3. **System Prompt 設計：打造專屬 AI 助手人格** ← 目前閱讀
>
> **📖 延伸閱讀**：[Git 入門：版本控制基礎指令]({% post_url 2025-12-13-git-basics %})

---

![System Prompt 設計：打造專屬 AI 助手人格](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part3-prompt.png)

## 這篇文章要解決什麼問題？

你有沒有覺得，直接用 Claude/ChatGPT 的回答有點「通用」？比如：

- 回答太冗長，公司習慣簡潔風格
- 用語不符合公司慣例（繁體/簡體、專有名詞）
- 沒有考慮公司特定的知識背景
- 對某些問題應該拒絕回答（商業機密相關）

**System Prompt 就是 AI 的「人設」**，決定了它的：
- 個性和語氣
- 專長領域
- 回答風格
- 行為限制

**業務**：「客戶問 AI 助手我們跟競爭對手的差別，它竟然說對手也不錯？」  
**老闆**：「這怎麼行！而且回答風格也太冗長，我們公司習慣簡潔有力。」  
**後端工程師**：「這是因為 AI 預設是中立的。我們需要設定 System Prompt，就像 AI 的員工守則。」  
**老闆**：「可以規定它不能說什麼嗎？」  
**後端工程師**：「當然，可以設定：回答要簡潔、用公司專有名詞、不評論競爭對手、遇到敏感問題要導向業務。」  
**業務**：「這樣就不怕 AI 亂講話了！」

---

![System Prompt 設計：打造專屬 AI 助手人格](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part3-prompt.png)

## 技術概念

### System Prompt vs User Prompt

```
┌──────────────────────────────────────────────────┐
│                    Claude                         │
│  ┌────────────────────────────────────────────┐  │
│  │ System Prompt（設定人格）                    │  │
│  │ "你是 ChingTech AI 助手，擎添工業的..."     │  │
│  └────────────────────────────────────────────┘  │
│                      ↓                            │
│  ┌────────────────────────────────────────────┐  │
│  │ User Prompt（使用者訊息）                    │  │
│  │ "幫我寫一份報告"                            │  │
│  └────────────────────────────────────────────┘  │
│                      ↓                            │
│  ┌────────────────────────────────────────────┐  │
│  │ 回應                                         │  │
│  │ (根據 System Prompt 設定的風格回答)          │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

System Prompt 是「常駐設定」，每次對話都會帶入；User Prompt 是「單次訊息」。

### Prompt 設計的四大要素

好的 System Prompt 包含：

| 要素 | 說明 | 範例 |
|------|------|------|
| **角色定義** | AI 是誰？為誰服務？ | "你是 ChingTech AI 程式碼助手" |
| **個性特徵** | 說話風格、態度 | "專業友善、回答簡潔" |
| **能力範圍** | 能做什麼、擅長什麼 | "撰寫程式碼、除錯、架構設計" |
| **行為限制** | 不能做什麼、注意事項 | "不提供可能有害的內容" |

---

![System Prompt 設計：打造專屬 AI 助手人格](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part3-prompt.png)

## 跟著做：Step by Step

### Step 1：建立 Prompt 檔案結構

```
data/
└── prompts/
    ├── default.md       # 預設通用助手
    ├── code-assistant.md    # 程式碼助手
    ├── pm-assistant.md      # 專案管理助手
    └── summarizer.md        # 對話壓縮（內部使用）
```

### Step 2：設計預設助手 Prompt

```markdown
<!-- data/prompts/default.md -->
# 預設助手

你是 ChingTech AI 助手，擎添工業的智慧工作中樞助理。

## 你的個性
- 專業且友善
- 回答簡潔明瞭
- 樂於協助解決各種問題

## 對話語氣
- 使用繁體中文
- 保持專業但不失親切
- 適時使用條列式整理重點

## 能力範圍
- 回答一般問題
- 協助文件撰寫
- 提供建議和想法
- 解釋概念和流程

## 注意事項
- 如果不確定答案，請誠實說明
- 避免提供可能有害或不當的內容
- 保持客觀中立的立場
```

### Step 3：設計程式碼助手 Prompt

```markdown
<!-- data/prompts/code-assistant.md -->
# 程式碼助手

你是 ChingTech AI 程式碼助手，專門協助軟體開發相關任務。

## 你的個性
- 技術導向，注重實作細節
- 提供可執行的程式碼範例
- 解釋程式碼邏輯和最佳實踐

## 對話語氣
- 使用繁體中文解釋
- 程式碼註解可使用英文
- 技術術語保持一致性

## 能力範圍
- 撰寫和審查程式碼
- 除錯和問題排解
- 解釋演算法和資料結構
- 推薦開發工具和框架
- 協助設計系統架構

## 程式碼風格
- 提供完整可執行的範例
- 加入適當的錯誤處理
- 遵循該語言的慣例和最佳實踐
- 必要時加入註解說明

## 注意事項
- 優先考慮程式碼的可讀性和維護性
- 提醒潛在的安全風險
- 建議適當的測試策略
```

### Step 4：設計專案管理助手 Prompt

```markdown
<!-- data/prompts/pm-assistant.md -->
# 專案管理助手

你是 ChingTech AI 專案管理助手，專門協助專案規劃和管理任務。

## 你的個性
- 組織能力強，注重結構化
- 善於拆解複雜任務
- 關注時程和風險管理

## 對話語氣
- 使用繁體中文
- 條理分明，善用列表
- 提供具體可行的建議

## 能力範圍
- 協助制定專案計畫
- 拆解任務和估算工時
- 識別風險和依賴關係
- 追蹤進度和里程碑
- 協助撰寫需求文件
- 提供敏捷/Scrum 實踐建議

## 輸出格式偏好
- 使用表格整理資訊
- 提供清晰的任務清單
- 標示優先順序和負責人
- 包含時間軸和里程碑

## 注意事項
- 提醒潛在的風險和阻礙
- 建議適當的溝通策略
- 關注資源配置和瓶頸
- 鼓勵定期回顧和調整
```

### Step 5：後端動態載入 Prompt

```python
# claude_agent.py
from pathlib import Path

# Prompts 目錄路徑
PROMPTS_DIR = Path("data/prompts")


def get_prompt_content(prompt_name: str) -> str | None:
    """讀取 prompt 檔案內容

    Args:
        prompt_name: prompt 名稱（不含 .md）

    Returns:
        prompt 內容，找不到則回傳 None
    """
    prompt_file = PROMPTS_DIR / f"{prompt_name}.md"

    if not prompt_file.exists():
        return None

    return prompt_file.read_text(encoding="utf-8")


def list_available_prompts() -> list[dict]:
    """列出所有可用的 prompts

    Returns:
        [{"name": "default", "display_name": "預設助手", "description": "..."}]
    """
    prompts = []

    for file in PROMPTS_DIR.glob("*.md"):
        # 跳過內部使用的 prompts
        if file.stem == "summarizer":
            continue

        content = file.read_text(encoding="utf-8")

        # 從第一行取得顯示名稱
        first_line = content.split("\n")[0]
        display_name = first_line.replace("#", "").strip()

        # 取得描述（第一個段落）
        lines = content.split("\n")
        description = ""
        for line in lines[1:]:
            if line.strip() and not line.startswith("#"):
                description = line.strip()
                break

        prompts.append({
            "name": file.stem,
            "display_name": display_name,
            "description": description
        })

    return prompts
```

### Step 6：API 路由

```python
# api/ai_router.py
from fastapi import APIRouter
from services.claude_agent import list_available_prompts

router = APIRouter(prefix="/api/ai", tags=["AI"])


@router.get("/prompts")
async def get_prompts():
    """取得所有可用的 prompt 列表"""
    return list_available_prompts()
```

### Step 7：前端選擇器

```javascript
// ai-assistant.js

let availablePrompts = [];

/**
 * 載入可用的 prompts
 */
async function loadPrompts() {
    try {
        availablePrompts = await APIClient.getPrompts();
    } catch (e) {
        console.error('Failed to load prompts:', e);
        availablePrompts = [
            { name: 'default', display_name: '預設助手', description: '' }
        ];
    }
}

/**
 * 建立 prompt 選擇器 UI
 */
function buildPromptSelector() {
    return `
        <div class="ai-prompt-selector">
            <label>助手：</label>
            <select class="ai-prompt-select input">
                ${availablePrompts.map(p =>
                    `<option value="${p.name}">${p.display_name}</option>`
                ).join('')}
            </select>
        </div>
    `;
}

/**
 * 綁定 prompt 選擇事件
 */
function bindPromptSelector() {
    const select = document.querySelector('.ai-prompt-select');
    if (select) {
        select.addEventListener('change', async (e) => {
            const chat = getChatById(currentChatId);
            if (chat) {
                chat.prompt_name = e.target.value;
                // 更新到伺服器
                await APIClient.updateChat(chat.id, {
                    prompt_name: e.target.value
                });
            }
        });
    }
}
```

### Step 8：整合到 Claude CLI 呼叫

```python
# claude_agent.py

async def call_claude(
    prompt: str,
    model: str = "sonnet",
    history: list[dict] | None = None,
    system_prompt: str | None = None,  # 可以傳入內容或名稱
    timeout: int = 120,
) -> ClaudeResponse:
    """非同步呼叫 Claude CLI"""

    # 如果傳入的是 prompt 名稱，讀取檔案內容
    if system_prompt and not system_prompt.startswith("#"):
        loaded_prompt = get_prompt_content(system_prompt)
        if loaded_prompt:
            system_prompt = loaded_prompt

    # 建立命令
    cmd = ["claude", "-p", full_prompt, "--model", model]

    if system_prompt:
        cmd.extend(["--system-prompt", system_prompt])

    # ... 其餘程式碼 ...
```

---

![System Prompt 設計：打造專屬 AI 助手人格](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part3-prompt.png)

## 進階技巧與踩坑紀錄

### 1. Prompt 結構化模板

建議所有 Prompt 遵循統一結構：

```markdown
# [角色名稱]

[一句話描述]

## 你的個性
- 特點 1
- 特點 2

## 對話語氣
- 風格指引

## 能力範圍
- 能做什麼

## [領域特定區塊]
- 根據角色需要

## 注意事項
- 限制和提醒
```

### 2. Few-shot Learning：提供範例

讓 AI 看範例學習期望的輸出格式：

```markdown
## 輸出範例

使用者：我想寫一個 Python 函數來計算費波那契數列
助手：好的，這是一個基本的費波那契函數：

\`\`\`python
def fibonacci(n):
    """計算第 n 個費波那契數"""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
\`\`\`

**說明：**
- 使用遞迴方式實作
- 時間複雜度 O(2^n)
- 建議 n > 30 改用迭代或記憶化
```

### 3. 負面指令：明確說「不要」

```markdown
## 注意事項

### 不要做的事
- 不要編造不確定的資訊
- 不要提供可能有害的程式碼（如惡意腳本）
- 不要洩露公司內部系統細節
- 不要給出法律、醫療、財務建議

### 遇到這些情況
- 如果被要求提供敏感資訊，禮貌地說明無法協助
- 如果問題超出能力範圍，建議尋求專業人員協助
```

### 4. 動態 Prompt 組合

可以根據上下文動態加入額外指令：

```python
async def get_dynamic_system_prompt(chat_id: str, base_prompt_name: str) -> str:
    """根據對話上下文動態組合 prompt"""

    # 讀取基礎 prompt
    base_prompt = get_prompt_content(base_prompt_name)

    # 如果有對話摘要，加入上下文
    chat = await get_chat(chat_id)
    if chat and chat.get("summary"):
        base_prompt += f"\n\n## 對話背景\n{chat['summary']}"

    # 如果是特定時段，加入額外提醒
    now = datetime.now()
    if now.hour >= 22 or now.hour < 6:
        base_prompt += "\n\n（提醒：現在是深夜/凌晨，建議使用者注意休息）"

    return base_prompt
```

### 5. Prompt 版本管理

用 Git 管理 Prompt 檔案，追蹤改動：

```bash
data/prompts/
├── default.md
├── code-assistant.md
└── CHANGELOG.md  # 記錄改動

# CHANGELOG.md 內容：
# ## 2024-01-15
# - code-assistant.md: 新增安全風險提醒
#
# ## 2024-01-10
# - default.md: 調整語氣更友善
```

### 6. A/B Testing

可以準備多個版本測試效果：

```python
# 隨機選擇 prompt 版本（用於 A/B 測試）
import random

def get_prompt_for_ab_test(base_name: str) -> str:
    versions = [
        f"{base_name}",
        f"{base_name}_v2",  # 測試版本
    ]

    selected = random.choice(versions)
    return get_prompt_content(selected) or get_prompt_content(base_name)
```

---

![System Prompt 設計：打造專屬 AI 助手人格](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part3-prompt.png)

## 小結

這篇我們完成了：

1. **Prompt 結構設計**：角色、個性、能力、限制
2. **多角色切換**：不同助手有不同專長
3. **動態載入**：後端讀取 .md 檔案
4. **前端整合**：選擇器讓使用者切換

**System Prompt 設計的黃金法則**：

```
1. 明確角色：「你是誰」比「你要做什麼」更重要
2. 正負並行：既說「要做什麼」也說「不要做什麼」
3. 提供範例：Few-shot 比長篇說明更有效
4. 持續迭代：根據實際回答效果調整
```

到這裡，Claude AI 整合系列就完成了！你現在有了：
- 對話歷史管理
- Token 估算和壓縮
- 可客製化的 AI 人格

---

![System Prompt 設計：打造專屬 AI 助手人格](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-11-claude-ai-part3-prompt.png)

## 完整程式碼

### Prompt 載入模組

```python
"""Prompt 管理模組"""

from pathlib import Path

PROMPTS_DIR = Path("data/prompts")


def get_prompt_content(prompt_name: str) -> str | None:
    """讀取 prompt 檔案內容"""
    prompt_file = PROMPTS_DIR / f"{prompt_name}.md"

    if not prompt_file.exists():
        return None

    return prompt_file.read_text(encoding="utf-8")


def list_available_prompts() -> list[dict]:
    """列出所有可用的 prompts"""
    prompts = []

    for file in PROMPTS_DIR.glob("*.md"):
        # 跳過內部使用的
        if file.stem == "summarizer":
            continue

        content = file.read_text(encoding="utf-8")

        # 解析標題和描述
        lines = content.split("\n")
        display_name = lines[0].replace("#", "").strip() if lines else file.stem

        description = ""
        for line in lines[1:]:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                description = stripped
                break

        prompts.append({
            "name": file.stem,
            "display_name": display_name,
            "description": description
        })

    return prompts


def validate_prompt(content: str) -> bool:
    """驗證 prompt 格式是否正確"""
    required_sections = ["你的個性", "能力範圍", "注意事項"]

    for section in required_sections:
        if section not in content:
            return False

    return True
```

### Prompt 範本：通用助手

```markdown
# 通用助手

你是 [公司名稱] AI 助手，[公司描述] 的智慧工作助理。

## 你的個性
- 專業且友善
- 回答簡潔明瞭
- 樂於協助解決各種問題

## 對話語氣
- 使用繁體中文
- 保持專業但不失親切
- 適時使用條列式整理重點

## 能力範圍
- 回答一般問題
- 協助文件撰寫
- 提供建議和想法
- 解釋概念和流程

## 注意事項
- 如果不確定答案，請誠實說明
- 避免提供可能有害或不當的內容
- 保持客觀中立的立場
- 不提供法律、醫療、財務建議
```

### Prompt 範本：專業領域助手

```markdown
# [領域] 助手

你是 [公司名稱] AI [領域]助手，專門協助 [領域] 相關任務。

## 你的個性
- [領域特有的個性特點]
- [領域特有的工作風格]

## 對話語氣
- 使用繁體中文
- [領域特有的溝通方式]

## 能力範圍
- [能力 1]
- [能力 2]
- [能力 3]

## [領域特定區塊名稱]
- [領域特定的指引]

## 輸出格式偏好（可選）
- [格式偏好 1]
- [格式偏好 2]

## 注意事項
- [限制 1]
- [限制 2]
- 如果問題超出能力範圍，建議尋求專業人員協助
```
