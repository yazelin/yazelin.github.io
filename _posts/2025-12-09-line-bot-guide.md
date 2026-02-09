---
layout: post
title: LINE Bot 開發入門 - 以呷爸點餐系統為例
categories: [LINE Bot]
tags: [教學, LINE Bot, Python, Flask, Messaging API, Webhook]
---

![LINE Bot 開發入門 - 以呷爸點餐系統為例](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-09-line-bot-guide.png)

LINE 是台灣最普及的通訊軟體，透過 LINE Messaging API 可以建立自己的聊天機器人。本文以 [Jaba LINE Bot]({% post_url 2025-12-09-jaba-line-bot %}) 為實例，帶你從零開始建立 LINE Bot。

---

## LINE Bot 運作原理

```
使用者發訊息 → LINE Platform → Webhook POST → 你的伺服器 → 回覆 API → LINE Platform → 使用者收到回覆
```

關鍵概念：
- **Webhook**：LINE 收到訊息後，會 POST 到你指定的 URL
- **Channel Secret**：用來驗證請求確實來自 LINE
- **Channel Access Token**：用來呼叫 LINE API 回覆訊息

---

## 步驟 1：建立 LINE Channel

### 登入 LINE Developers Console

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 使用 LINE 帳號登入
3. 首次使用需建立開發者帳號

### 建立 Provider

Provider 是用來管理多個 Channel 的容器：

1. 點擊 **Create a new provider**
2. 輸入名稱（例如：`呷爸系統`）
3. 點擊 **Create**

### 建立 Messaging API Channel

1. 在 Provider 頁面，點擊 **Create a new channel**
2. 選擇 **Messaging API**
3. 填寫資訊：

| 欄位 | 範例（jaba） |
|------|------|
| Channel name | 呷爸點餐 |
| Channel description | AI 午餐訂便當助手 |
| Category | Food & Beverage |
| Subcategory | Restaurant |

4. 同意條款後建立

---

## 步驟 2：取得憑證

### Channel Secret

1. 進入 Channel → **Basic settings**
2. 找到 **Channel secret**
3. 點擊複製

### Channel Access Token

1. 切換到 **Messaging API** 頁籤
2. 滾動到最下方 **Channel access token**
3. 點擊 **Issue** 發行 Token
4. 複製 Token（約 170 字元，確保完整複製）

---

## 步驟 3：建立 Bot 程式

使用 Python 和官方 SDK `line-bot-sdk` v3。

### 專案結構（jaba-line-bot）

```
jaba-line-bot/
├── app.py              # 主程式
├── requirements.txt    # Python 依賴
├── render.yaml         # Render 部署設定
└── .env.example        # 環境變數範本
```

### requirements.txt

```
flask>=3.0.0
line-bot-sdk>=3.0.0
gunicorn>=21.0.0
requests>=2.31.0
```

### 基本程式碼框架

```python
import os
from flask import Flask, request, abort
from linebot.v3 import WebhookHandler
from linebot.v3.messaging import (
    Configuration,
    ApiClient,
    MessagingApi,
    ReplyMessageRequest,
    TextMessage,
)
from linebot.v3.webhooks import MessageEvent, TextMessageContent
from linebot.v3.exceptions import InvalidSignatureError

app = Flask(__name__)

# 從環境變數讀取憑證
channel_secret = os.environ.get("LINE_CHANNEL_SECRET")
channel_access_token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")

configuration = Configuration(access_token=channel_access_token)
handler = WebhookHandler(channel_secret)


@app.route("/callback", methods=["POST"])
def callback():
    """LINE Webhook endpoint"""
    signature = request.headers.get("X-Line-Signature", "")
    body = request.get_data(as_text=True)

    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)

    return "OK"


@handler.add(MessageEvent, message=TextMessageContent)
def handle_message(event):
    """處理文字訊息"""
    user_message = event.message.text

    # 在這裡處理訊息邏輯
    reply_text = f"你說：{user_message}"

    with ApiClient(configuration) as api_client:
        messaging_api = MessagingApi(api_client)
        messaging_api.reply_message(
            ReplyMessageRequest(
                reply_token=event.reply_token,
                messages=[TextMessage(text=reply_text)]
            )
        )


@app.route("/", methods=["GET"])
def index():
    """首頁 - 顯示服務狀態"""
    return "LINE Bot is running!"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
```

---

## 步驟 4：部署到 Render

LINE Webhook 需要 **公開的 HTTPS URL**，推薦使用 [Render]({% post_url 2025-12-09-render-deploy-guide %})（免費）。

詳細步驟請參考 [Render 部署教學]({% post_url 2025-12-09-render-deploy-guide %})。

簡要流程：
1. 推送程式碼到 GitHub
2. 在 Render 建立 Web Service
3. 設定環境變數
4. 部署完成後取得 URL（如 `https://jaba-line-bot.onrender.com`）

---

## 步驟 5：設定 Webhook

1. 回到 LINE Developers Console
2. 進入 Channel → **Messaging API**
3. 設定 **Webhook URL**：
   ```
   https://jaba-line-bot.onrender.com/callback
   ```
4. 開啟 **Use webhook**
5. 點擊 **Verify** 測試

看到 **Success** 表示設定成功！

---

## 步驟 6：關閉自動回覆

LINE 官方帳號預設會自動回覆，需要關閉：

1. 在 Messaging API 頁籤找到 **LINE Official Account features**
2. 點擊 **Auto-reply messages** 旁的 **Edit**
3. 進入 LINE Official Account Manager
4. 設定：
   - 回應模式：**聊天**
   - 自動回應訊息：**停用**
   - Webhook：**啟用**

---

## 進階功能

### 判斷訊息來源

jaba-line-bot 需要區分 1對1 聊天和群組：

```python
@handler.add(MessageEvent, message=TextMessageContent)
def handle_message(event):
    source_type = event.source.type

    if source_type == "user":
        # 1對1 聊天 - 用於設定個人偏好
        user_id = event.source.user_id
    elif source_type == "group":
        # 群組 - 用於群組點餐
        group_id = event.source.group_id
        user_id = event.source.user_id
```

### 取得使用者名稱

1對1 和群組使用不同的 API：

```python
def get_user_display_name(event):
    """取得發訊者名稱"""
    user_id = event.source.user_id

    with ApiClient(configuration) as api_client:
        messaging_api = MessagingApi(api_client)

        if event.source.type == "group":
            # 群組中要用不同 API
            profile = messaging_api.get_group_member_profile(
                event.source.group_id, user_id
            )
        else:
            profile = messaging_api.get_profile(user_id)

        return profile.display_name
```

### 處理離開/封鎖事件

jaba-line-bot 在使用者封鎖或被踢出群組時，自動清除白名單：

```python
from linebot.v3.webhooks import LeaveEvent, UnfollowEvent

@handler.add(LeaveEvent)
def handle_leave(event):
    """Bot 被踢出群組"""
    if event.source.type == "group":
        group_id = event.source.group_id
        # 從白名單移除
        unregister_from_whitelist(group_id)

@handler.add(UnfollowEvent)
def handle_unfollow(event):
    """使用者封鎖 Bot"""
    user_id = event.source.user_id
    # 從白名單移除
    unregister_from_whitelist(user_id)
```

### 群組 Session 機制

jaba-line-bot 的群組點餐使用 Session 機制控制回應：

```python
def should_respond(event, user_text):
    # 1對1 聊天：永遠回應
    if event.source.type == "user":
        return True, user_text

    # 群組：使用 Session 機制
    group_id = event.source.group_id
    text_stripped = user_text.strip()

    # 檢查群組是否在點餐中
    is_ordering = check_group_session(group_id)

    if is_ordering:
        # 點餐中：所有訊息都轉發（AI 過濾非訂餐訊息）
        return True, user_text
    else:
        # 非點餐中：只回應特定指令
        if text_stripped in ["開單", "菜單"]:
            return True, user_text
        # 還會檢查：啟用密碼、@呷爸/@jaba 等（簡化省略）
        return False, user_text
```

---

## line-bot-sdk v3 注意事項

目前官方 SDK 是 v3 版本，與舊版差異較大：

### 匯入方式

```python
# v3 寫法
from linebot.v3 import WebhookHandler
from linebot.v3.messaging import Configuration, ApiClient, MessagingApi
from linebot.v3.webhooks import MessageEvent, TextMessageContent

# 舊版寫法（已不建議）
from linebot import LineBotApi, WebhookHandler
```

### 呼叫 API

```python
# v3 需要用 Context Manager
with ApiClient(configuration) as api_client:
    messaging_api = MessagingApi(api_client)
    messaging_api.reply_message(...)

# 舊版直接呼叫
line_bot_api.reply_message(...)
```

---

## 常見問題

### Webhook 驗證失敗

檢查：
1. 部署是否成功（訪問 URL 確認）
2. URL 結尾是 `/callback`
3. Channel Secret 是否正確

### Bot 不回覆訊息

檢查：
1. 自動回覆是否已關閉
2. Webhook 是否已啟用
3. 查看 Render Logs 找錯誤訊息

### 群組中 Bot 不回應

jaba-line-bot 的設計：
- 非點餐時只回應「開單」「菜單」
- 點餐中才回應所有訊息

### 第一則訊息很慢

Render 免費方案的冷啟動問題：
- 使用 cron 服務定期 ping
- 或升級付費方案

---

## 環境變數

jaba-line-bot 需要的環境變數：

| 變數 | 必要 | 說明 |
|------|------|------|
| `LINE_CHANNEL_SECRET` | ✅ | LINE Channel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Channel Access Token |
| `JABA_API_URL` | ❌ | jaba 後端 API 網址 |
| `JABA_API_KEY` | ❌ | API 驗證金鑰 |
| `REGISTER_SECRET` | ❌ | 使用者啟用密碼 |

---

## 相關連結

- [Jaba LINE Bot 專案]({% post_url 2025-12-09-jaba-line-bot %})
- [Render 部署教學]({% post_url 2025-12-09-render-deploy-guide %})
- [jaba 核心系統]({% post_url 2025-12-08-jaba %})
- [LINE Developers Console](https://developers.line.biz/console/)
- [LINE Messaging API 文件](https://developers.line.biz/en/docs/messaging-api/)
- [line-bot-sdk-python GitHub](https://github.com/line/line-bot-sdk-python)
