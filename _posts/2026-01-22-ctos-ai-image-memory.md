---
layout: post
title: "ChingTech OS：AI 圖片生成與記憶功能"
subtitle: "Hugging Face FLUX 備援 + 自訂記憶管理"
date: 2026-01-22
categories: [ChingTech OS]
tags: [ChingTech OS, AI, 圖片生成, Hugging Face, FLUX, 記憶功能, Line Bot]
---

## 前言

ChingTech OS 的 Line Bot 從最初的文字對話，逐步加入了圖片生成、檔案處理、知識庫查詢等功能。但隨著功能變多，幾個問題也浮現了：

1. **圖片生成服務不穩定** -- nanobanana（Gemini）偶爾會 timeout 或 503，導致用戶等了半天卻什麼都拿不到
2. **Bot 沒有長期記憶** -- 每次對話都從零開始，用戶要重複說明偏好或規則
3. **群組回覆不夠自然** -- 用戶無法透過回覆一則舊訊息來提供上下文

這篇文章記錄了一天之內加入的幾項功能：Hugging Face FLUX 備援圖片生成、記憶系統、reply context 支援，以及 Marp 簡報生成。每個功能都不大，但組合起來讓 Bot 的體驗好了不少。

---

## AI 圖片生成：多層備援架構

### 問題：單一服務的脆弱性

原本的圖片生成完全依賴 nanobanana MCP Server（背後是 Google Gemini）。Gemini 在尖峰時段經常回應 503（伺服器過載），而且有免費額度限制（每分鐘 2 張、每天 100 張）。一旦出問題，用戶只會看到一條錯誤訊息。

### 解法：兩層 Fallback 機制

最終設計了一個兩層架構，程式碼位於 `image_fallback.py`：

```
用戶要求生成圖片
       |
       v
+------------------------------+
|  nanobanana MCP              |
|  (Gemini Pro -> Flash 自動切)|  <- 第一層：MCP 內部已有 fallback
+----------+-------------------+
           | 失敗（timeout / 503 / 額度用盡）
           v
+------------------------------+
|  Hugging Face FLUX.1-schnell |  <- 第二層：完全獨立的服務
|  (30 秒超時)                 |
+------------------------------+
```

nanobanana MCP 本身已經有 Gemini Pro 到 Flash 的自動切換。本模組只負責在 nanobanana **整個** 失敗時（timeout 或錯誤），觸發 Hugging Face FLUX 作為最後備用。

### 核心程式碼

`image_fallback.py` 的 Hugging Face 呼叫：

```python
async def generate_image_with_huggingface(prompt: str) -> tuple[str | None, str | None]:
    """使用 Hugging Face FLUX.1-schnell 生成圖片"""
    token = get_hf_token()
    if not token:
        return None, "未設定 HUGGINGFACE_API_TOKEN"

    from huggingface_hub import InferenceClient

    client = InferenceClient(token=token, timeout=HUGGINGFACE_TIMEOUT)

    image = client.text_to_image(
        prompt,
        model="black-forest-labs/FLUX.1-schnell",
        guidance_scale=0.0,
        num_inference_steps=4,
    )

    # 儲存到 NAS 的 ai-images 目錄
    filename = f"flux_{uuid.uuid4().hex[:8]}.png"
    image_path = _nas_ai_images_dir / filename
    image.save(image_path)

    return f"ai-images/{filename}", None
```

幾個設計重點：

- **FLUX.1-schnell** 是 Black Forest Labs 的快速模型，4 步就能出圖，速度夠快
- **`guidance_scale=0.0`** 是 schnell 的特性，不需要 guidance 就能生成品質不錯的圖
- 超時設為 30 秒，避免讓用戶等太久
- 產出的圖片存到 NAS 的 `ai-images/` 目錄，與 nanobanana 的圖片共用同一個存取路徑

### 在 Line Bot 中的整合

`linebot_ai.py` 處理完 Claude 回應後，會檢查 nanobanana 是否出錯：

```python
# 檢查 nanobanana 是否有錯誤
nanobanana_error = extract_nanobanana_error(response.tool_calls)
nanobanana_timeout = check_nanobanana_timeout(response.tool_calls)

if nanobanana_error or nanobanana_timeout:
    # 提取原始 prompt，嘗試 fallback
    original_prompt = extract_nanobanana_prompt(response.tool_calls)

    if original_prompt:
        fallback_path, service_used, fallback_error = await generate_image_with_fallback(
            original_prompt, error_reason
        )

        if fallback_path:
            notification = get_fallback_notification(service_used)
            # 加入「使用備用服務」通知
```

用戶端看到的效果是：即使 Gemini 掛了，還是能在幾秒內收到圖片，只是底部會多一行小字「（使用備用服務）」。

---

## 記憶功能：讓 Bot 記住規則

### 為什麼需要記憶？

想像一個場景：公司的客服群組裡，Bot 每次回答都要被提醒「回答要用敬語」「不要提到競品」「報價要含稅」。每次都手動說明很煩。

記憶功能讓管理者可以設定「永久生效」的規則，Bot 在每次回應時都會自動遵循。

### 資料模型：群組記憶 vs 個人記憶

系統設計了兩張表：

| 表名 | 用途 | 場景 |
|------|------|------|
| `bot_group_memories` | 群組記憶 | 群組內所有人共用的規則 |
| `bot_user_memories` | 個人記憶 | 個人偏好（語言、格式等） |

每筆記憶有 `title`、`content`、`is_active`（是否啟用）和時間戳。群組記憶額外有 `created_by` 欄位記錄誰建立的。

### 記憶注入 System Prompt

記憶的核心機制很簡單：在建立 System Prompt 時，把所有啟用的記憶塞進去。

```python
# linebot_ai.py - build_system_prompt()
memories = []
if line_group_id:
    memories = await get_active_group_memories(line_group_id)
elif line_user_uuid:
    memories = await get_active_user_memories(line_user_uuid)

if memories:
    memory_lines = [f"{i+1}. {m['content']}" for i, m in enumerate(memories)]
    memory_block = """

【自訂記憶】
以下是此對話的自訂記憶，請在回應時遵循這些規則：
""" + "\n".join(memory_lines) + """

請自然地遵循上述規則，不需要特別提及或確認。"""
    base_prompt += memory_block
```

最後一句「不需要特別提及或確認」很重要。如果不加這句，Bot 可能會在每次回應開頭說「好的，我會遵循以下規則...」，那就很不自然。

### MCP 工具：add_memory / get_memories / update_memory / delete_memory

除了在 Web UI 管理，用戶也可以在 Line 對話中直接操作記憶。透過 MCP 工具，AI 可以：

```
用戶：請記住我喜歡繁體中文回覆
Bot ：已新增個人記憶：我喜歡繁體中文回覆

用戶：列出我的記憶
Bot ：個人記憶列表
      1. 我喜歡繁體中文回覆
         ID: abc-123
         建立時間: 2026-01-22 14:30
```

`memory_tools.py` 的 `add_memory` 工具會自動判斷是群組還是個人記憶，並產生標題：

```python
@mcp.tool()
async def add_memory(
    content: str,
    title: str | None = None,
    line_group_id: str | None = None,
    line_user_id: str | None = None,
) -> str:
    # 自動產生標題（取 content 前 20 字）
    if not title:
        title = content[:20] + ("..." if len(content) > 20 else "")

    if line_group_id:
        # 群組記憶
        ...
    elif line_user_id:
        # 個人記憶
        ...
```

---

## 記憶管理 App：Web UI

光靠對話指令管理記憶還不夠直覺。我們在 ChingTech OS 的桌面環境中加入了一個記憶管理 App。

### 介面設計

採用 sidebar + main panel 的經典佈局：

- **左側邊欄**：群組 / 用戶列表，可切換 Tab
- **右側主區域**：選定群組或用戶後，顯示記憶列表
- **新增 / 編輯 / 刪除**：直接在 UI 上操作
- **啟用 / 停用**：一鍵切換記憶的生效狀態

```javascript
// memory-manager.js
function getWindowContent() {
    return `
      <div class="memory-manager">
        <div class="mm-tabs">
          <button class="mm-tab active" data-tab="group">群組記憶</button>
          <button class="mm-tab" data-tab="personal">個人記憶</button>
        </div>
        <div class="mm-content">
          <div class="mm-sidebar">...</div>
          <div class="mm-main">...</div>
        </div>
      </div>
    `;
}
```

### Mobile Responsive

由於許多管理者會用手機操作，sidebar 在手機版會收起來，改成全螢幕的列表到詳情切換模式。返回鍵（`mm-mobile-back-btn`）讓手機操作也很流暢。

---

## Reply Context：回覆舊訊息

### 情境

在群組對話中，用戶可能會回覆一則舊訊息來追問。例如：

> Bot 回覆了一張圖片
> 用戶長按該訊息然後回覆：「這張圖可以改成藍色嗎？」

如果 Bot 不知道用戶回覆的是哪則訊息，就無法理解「這張圖」指的是什麼。

### 實作

`linebot_ai.py` 的 `handle_text_message()` 會接收 Line SDK 傳來的 `quoted_message_id`，然後依序嘗試查詢：

```python
if quoted_message_id:
    # 1. 嘗試查詢圖片
    image_info = await get_image_info_by_line_message_id(quoted_message_id)
    if image_info:
        quoted_image_path = await ensure_temp_image(
            quoted_message_id, image_info["nas_path"]
        )

    # 2. 嘗試查詢檔案
    elif file_info := await get_file_info_by_line_message_id(quoted_message_id):
        quoted_file_path = await ensure_temp_file(...)

    # 3. 嘗試查詢文字訊息
    elif msg_info := await get_message_content_by_line_message_id(quoted_message_id):
        quoted_text_content = {
            "content": msg_info["content"],
            "display_name": msg_info.get("display_name", ""),
            "is_from_bot": msg_info.get("is_from_bot", False),
        }
```

然後在組合用戶訊息時，把被回覆的內容加到前面：

```python
if quoted_image_path:
    user_message = f"[回覆圖片: {quoted_image_path}]\n{user_message}"
```

這樣 Claude 就能「看到」用戶回覆的圖片，並且理解上下文。

### 群組對話的觸發邏輯

群組中的觸發規則由 `trigger.py` 的 `should_trigger_ai()` 定義：

```python
def should_trigger_ai(message_content, is_group, is_reply_to_bot=False):
    if not is_group:
        return True        # 個人對話：全部觸發

    if is_reply_to_bot:
        return True        # 回覆 Bot 訊息：觸發

    # 檢查是否被 @ 提及
    for name in settings.line_bot_trigger_names:
        if f"@{name.lower()}" in content_lower:
            return True

    return False
```

回覆 Bot 的訊息也會觸發 AI，這讓對話更自然 -- 不需要每次都打 `@bot`。

---

## Marp 簡報生成

### 在 Line Bot 中生成簡報

用戶只要說「幫我做一份 AI 簡報」，Bot 就會透過 `generate_presentation` MCP 工具生成一份 Marp 簡報。整個流程：

1. Claude 使用 `generate_outline()` 產生簡報大綱（JSON 格式）
2. 根據大綱中的 `image_keyword`，從 Pexels / Hugging Face / nanobanana 取得配圖
3. 組合成 Marp Markdown
4. 呼叫 `marp-cli` 轉換為 HTML 或 PDF
5. 儲存到 NAS，回傳分享連結

### 三種圖片來源

簡報配圖支援三種來源：

```python
async def fetch_image(keyword: str, source: str = "pexels") -> Optional[bytes]:
    if source == "huggingface":
        return await generate_huggingface_image(keyword)
    elif source == "nanobanana":
        return await generate_nanobanana_image(keyword)
    else:
        return await fetch_pexels_image(keyword)
```

| 來源 | 速度 | 品質 | 成本 |
|------|------|------|------|
| **Pexels** | 快（下載現成照片） | 高（專業攝影） | 免費 |
| **Hugging Face FLUX** | 中（AI 生成） | 中等 | 免費（有限額） |
| **nanobanana (Gemini)** | 慢（AI 生成 + MCP） | 高 | 付費 |

預設使用 Pexels，速度最快也最穩定。

### MD2PPT：可編輯的線上簡報

除了 Marp HTML/PDF，還有一個 `generate_md2ppt` 工具，產生的是可在線上編輯的簡報格式。流程是：

1. Claude 根據 MD2PPT 的格式規範（支援 grid、two-column、chart 等 layout）產生 Markdown
2. 自動修正常見格式問題（`fix_md2ppt_format()`）
3. 建立帶密碼保護的分享連結
4. 用戶收到連結後可以在瀏覽器直接編輯、匯出 PPT

---

## 小結

這篇記錄的功能分散在好幾個檔案中，但背後的思路一致：**讓 Bot 更可靠、更聰明、更容易互動**。

| 功能 | 解決的問題 | 關鍵檔案 |
|------|-----------|---------|
| FLUX 備援 | 圖片生成服務不穩定 | `image_fallback.py` |
| 記憶系統 | Bot 沒有長期記憶 | `memory.py`, `memory_tools.py` |
| 記憶管理 App | 記憶不好管理 | `memory-manager.js`, `memory-manager.css` |
| Reply Context | 回覆舊訊息沒上下文 | `linebot_ai.py` |
| Marp 簡報 | 在 Line 中快速做簡報 | `presentation.py`, `presentation_tools.py` |

這些功能各自獨立、各自完成一件事，但組合起來就是一個更完整的助理體驗。用戶不需要知道背後有多少層 fallback、prompt 裡塞了什麼記憶 -- 他們只需要感受到「Bot 變聰明了」。

---

## 參考資源

- [Hugging Face FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) -- Black Forest Labs 的快速圖片生成模型
- [Marp](https://marp.app/) -- Markdown 簡報工具
- [Pexels API](https://www.pexels.com/api/) -- 免費圖庫 API
- [Line Messaging API - Reply Message](https://developers.line.biz/en/docs/messaging-api/sending-messages/#reply-messages) -- Line Bot 回覆機制
