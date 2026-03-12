---
layout: post
title: "azure-foundry-demo：用 Copilot SDK 的 BYOK 模式連接 Azure AI Foundry"
subtitle: "一個小測試：驗證 Copilot SDK BYOK 模式能不能跑起來"
date: 2026-03-09
categories: [AI]
tags: [Azure AI Foundry, Copilot SDK, BYOK, Python, Telegram, OpenAI]
author: Yaze Lin
---

## 想做什麼

這是一個小測試專案，目的很單純：**驗證 Copilot SDK 的 BYOK 模式能不能順利連上 Azure AI Foundry**。

GitHub Copilot SDK 除了用 GitHub 內建的模型，還支援 **BYOK（Bring Your Own Key）** 模式——自帶 API Key，連接外部的 LLM 端點。[Azure AI Foundry](https://ai.azure.com) 是微軟的 AI 模型託管平台，可以部署 GPT、Llama、Mistral 等模型，產生一個 OpenAI 相容的 API 端點。

所以寫了三個最簡單的 demo（基本對話、串流回應、自訂工具呼叫）確認 SDK 運作正常，順便接上 Telegram Bot 看看實際使用的感覺。驗證完就可以拿同樣的架構去做更完整的專案（像是 [byok-tg-runner](https://github.com/yazelin/byok-tg-runner)）。

---

## 架構概覽

```
使用者
  │
  ├─ [CLI] python main.py          三個獨立範例依序執行
  │         │
  │         ├─ basic_chat()         基本一問一答
  │         ├─ streaming_chat()     串流逐字輸出
  │         └─ tool_use_chat()      自訂工具呼叫（模擬天氣查詢）
  │
  └─ [Telegram] python telegram_bot.py
                │
                ▼
          Telegram Bot API (polling)
                │
                ▼
┌──────────────────────────┐
│  Copilot SDK (BYOK)      │  CopilotClient + create_session
│  Provider: openai         │  wire_api: responses
│  Model: gpt-5.2           │  PermissionHandler.approve_all
│  Endpoint: Azure Foundry  │
└──────────────────────────┘
```

---

## BYOK 模式怎麼設定

核心是 `provider` 設定。告訴 Copilot SDK：「不要用你預設的模型，改用我提供的 OpenAI 相容端點」。

```python
FOUNDRY_BASE_URL = "https://duotify-ai-foundry.cognitiveservices.azure.com/openai/v1"
MODEL = "gpt-5.2"

def get_provider():
    api_key = os.environ.get("FOUNDRY_API_KEY")
    if not api_key:
        raise RuntimeError("請設定 FOUNDRY_API_KEY 環境變數（或寫入 .env 檔）")
    return {
        "type": "openai",
        "base_url": FOUNDRY_BASE_URL,
        "api_key": api_key,
        "wire_api": "responses",
    }
```

幾個重點：

| 欄位 | 說明 |
|------|------|
| `type` | `"openai"` — 使用 OpenAI 相容的 API 格式 |
| `base_url` | Azure AI Foundry 的端點 URL |
| `api_key` | Azure 產生的 API Key |
| `wire_api` | `"responses"` — 使用 OpenAI Responses API 格式 |

建立 session 時把 `provider` 傳進去，Copilot SDK 就會用你指定的端點而非預設的 GitHub 模型。

---

## 範例 1：基本對話

最簡單的一問一答：

```python
async def basic_chat():
    client = CopilotClient()
    await client.start()

    async with await client.create_session({
        "model": MODEL,
        "provider": get_provider(),
        "on_permission_request": PermissionHandler.approve_all,
    }) as session:
        done = asyncio.Event()

        def on_event(event):
            if event.type.value == "assistant.message":
                print(f"助理：{event.data.content}")
            elif event.type.value == "session.idle":
                done.set()

        session.on(on_event)
        await session.send({"prompt": "用一句話介紹 Azure AI Foundry 是什麼？"})
        await done.wait()

    await client.stop()
```

流程是：`CopilotClient` → `create_session`（帶 provider） → 註冊事件 → `send` prompt → 等 `session.idle`。

`PermissionHandler.approve_all` 自動批准所有權限請求，適合範例和自動化場景。

---

## 範例 2：串流回應

差異只有兩個地方——session 加上 `"streaming": True`，事件改監聽 `assistant.message_delta`：

```python
async with await client.create_session({
    "model": MODEL,
    "provider": get_provider(),
    "streaming": True,
    "on_permission_request": PermissionHandler.approve_all,
}) as session:
    done = asyncio.Event()

    def on_event(event):
        if event.type.value == "assistant.message_delta":
            print(event.data.delta_content or "", end="", flush=True)
        elif event.type.value == "session.idle":
            print()
            done.set()

    session.on(on_event)
    await session.send({"prompt": "列出 Python 3.12 的三個重要新功能。"})
    await done.wait()
```

`assistant.message` 是完整回應一次送回，`assistant.message_delta` 是逐字到達。`flush=True` 確保即時顯示。

---

## 範例 3：自訂工具（Tool Use）

這個範例展示怎麼讓模型呼叫你定義的函式。用 `@define_tool` 裝飾器加上 Pydantic schema：

```python
class GetWeatherParams(BaseModel):
    city: str = Field(description="城市名稱")

@define_tool(description="查詢指定城市的天氣（模擬資料）")
async def get_weather(params: GetWeatherParams) -> str:
    weather_data = {
        "台北": "晴天，28°C",
        "東京": "多雲，22°C",
        "紐約": "雨天，15°C",
    }
    result = weather_data.get(params.city, f"{params.city}：無資料")
    return f"{params.city} 目前天氣：{result}"
```

建立 session 時把工具傳進去：

```python
async with await client.create_session({
    "model": MODEL,
    "provider": get_provider(),
    "tools": [get_weather],
    "on_permission_request": PermissionHandler.approve_all,
}) as session:
    done = asyncio.Event()

    def on_event(event):
        if event.type.value == "assistant.message":
            print(f"助理：{event.data.content}")
        elif event.type.value == "tool.executing":
            print(f"[呼叫工具] {event.data.tool_name}({event.data.input})")
        elif event.type.value == "session.idle":
            done.set()

    session.on(on_event)
    await session.send({"prompt": "台北和東京今天天氣如何？"})
    await done.wait()
```

當模型判斷需要天氣資訊時，會自動呼叫 `get_weather` 工具，拿到結果後整合成自然語言回覆。輸出大概長這樣：

```
[呼叫工具] get_weather({"city": "台北"})
[呼叫工具] get_weather({"city": "東京"})
助理：台北目前是晴天 28°C，東京多雲 22°C。
```

---

## Telegram Bot 整合

`telegram_bot.py` 把同樣的 Copilot SDK + BYOK 架構接上 Telegram Bot API。核心邏輯很短：

```python
async def handle_message(update: Update, context):
    user_text = update.message.text
    if not user_text:
        return

    async with await client.create_session({
        "model": MODEL,
        "provider": get_provider(),
        "on_permission_request": PermissionHandler.approve_all,
    }) as session:
        done = asyncio.Event()
        reply = ""

        def on_event(event):
            nonlocal reply
            if event.type.value == "assistant.message":
                reply = event.data.content
            elif event.type.value == "session.idle":
                done.set()

        session.on(on_event)
        await session.send({"prompt": user_text})
        await done.wait()

    if reply:
        for i in range(0, len(reply), 4096):
            await update.message.reply_text(reply[i:i + 4096])
```

每則訊息建立一個新的 session，等回應完成後送回 Telegram。超過 4096 字元（Telegram 上限）會自動分段。

`CopilotClient` 的生命週期由 `post_init` / `post_shutdown` hook 管理：

```python
app = (
    ApplicationBuilder()
    .token(token)
    .post_init(post_init)       # 啟動 CopilotClient
    .post_shutdown(post_shutdown) # 關閉 CopilotClient
    .build()
)
```

---

## 安裝與執行

```bash
git clone <repo-url>
cd azure-foundry-demo
python -m venv .venv
source .venv/bin/activate
pip install -e .

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入 FOUNDRY_API_KEY 和 TELEGRAM_BOT_TOKEN（選填）
```

相依套件只有三個：

| 套件 | 用途 |
|------|------|
| `github-copilot-sdk` | Copilot SDK，BYOK 模式連接 Azure AI Foundry |
| `python-dotenv` | 從 `.env` 載入環境變數 |
| `python-telegram-bot` | Telegram Bot API 封裝 |

執行 CLI 範例：

```bash
python main.py
```

執行 Telegram Bot：

```bash
python telegram_bot.py
```

---

## 結論

這個 demo 驗證了一件事：Copilot SDK 的 BYOK 模式確實能無痛連接 Azure AI Foundry，基本對話、串流、工具呼叫都正常運作。有了這個基礎，後續就能拿同樣的 provider 設定去做更完整的應用。

---

## Repo

- [azure-foundry-demo](https://github.com/yazelin/azure-foundry-demo)
