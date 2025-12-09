---
layout: post
title: Render 免費部署教學 - 以 LINE Bot 為例
tags: [教學, 部署, Render, Python, Flask, LINE Bot, PaaS]
---

[Render](https://render.com) 是一個現代化的雲端平台，提供免費方案讓你快速部署 Web 應用。本文以實際部署 [Jaba LINE Bot]({{ site.baseurl }}/jaba-line-bot/) 為例，分享完整的部署流程。

---

## 為什麼選擇 Render？

在開發 [LINE Bot]({{ site.baseurl }}/line-bot-guide/) 時，我需要一個能提供**公開 HTTPS URL** 的平台，因為 LINE Webhook 只接受 HTTPS。

比較了幾個選項後，選擇 Render：

| 平台 | 免費方案 | HTTPS | GitHub 整合 | 冷啟動 |
|------|----------|-------|-------------|--------|
| **Render** | ✅ | ✅ 自動 | ✅ | 15 分鐘後休眠 |
| Heroku | ❌ 已取消 | ✅ | ✅ | - |
| Railway | ✅ 有限額 | ✅ | ✅ | 無 |
| Fly.io | ✅ 有限額 | ✅ | 需設定 | 無 |

Render 的優勢：
- **完全免費**：免費方案足夠個人專案使用
- **自動 HTTPS**：不需要自己處理 SSL 憑證
- **GitHub 自動部署**：推送 commit 就自動更新
- **簡單設定**：幾乎零配置

---

## 免費方案限制

免費的代價是有一些限制：

| 限制項目 | 說明 |
|----------|------|
| **冷啟動** | 15 分鐘無流量後服務休眠，喚醒需 30-60 秒 |
| **運行時間** | 每月 750 小時（足夠 24/7 運行一個服務） |
| **頻寬** | 100 GB/月 |
| **記憶體** | 512 MB |

**冷啟動對 LINE Bot 的影響**：
- 第一則訊息可能因等待服務啟動而 timeout
- 使用者需要再發一次訊息
- 之後的訊息就正常了

---

## 實戰：部署 Jaba LINE Bot

以下用 [jaba-line-bot]({{ site.baseurl }}/jaba-line-bot/) 專案示範完整流程。

### 專案結構

```
jaba-line-bot/
├── app.py              # Flask 主程式
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

說明：
- `flask`：Web 框架，處理 LINE Webhook
- `line-bot-sdk`：LINE 官方 Python SDK
- `gunicorn`：Production WSGI 伺服器
- `requests`：HTTP 客戶端，呼叫後端 API

### render.yaml

```yaml
services:
  - type: web
    name: jaba-line-bot
    runtime: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
    envVars:
      - key: LINE_CHANNEL_SECRET
        sync: false
      - key: LINE_CHANNEL_ACCESS_TOKEN
        sync: false
      - key: PYTHON_VERSION
        value: 3.12.0
```

`sync: false` 表示這些變數需要在 Render Dashboard 手動設定，不會同步到 Git（保護機密資訊）。

---

## 部署步驟

### 1. 推送到 GitHub

```bash
cd jaba-line-bot
git init
git add .
git commit -m "Initial commit"

# 在 GitHub 建立新 repo，然後：
git remote add origin https://github.com/你的帳號/jaba-line-bot.git
git push -u origin main
```

### 2. 連接 Render

1. 前往 [Render Dashboard](https://dashboard.render.com)
2. 使用 **GitHub** 登入
3. 授權 Render 存取你的 repositories

### 3. 建立 Web Service

**方法 A：使用 Blueprint（推薦）**

專案有 `render.yaml`，可以自動建立：

1. 點擊 **New** → **Blueprint**
2. 選擇你的 repository
3. Render 讀取 `render.yaml` 並顯示將建立的服務
4. 點擊 **Apply**

**方法 B：手動建立**

1. 點擊 **New** → **Web Service**
2. 選擇 **Build and deploy from a Git repository**
3. 選擇你的 repository
4. 填寫設定：

| 設定項目 | 值 |
|----------|-----|
| Name | `jaba-line-bot` |
| Region | Singapore（離台灣最近） |
| Branch | `main` |
| Runtime | Python |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app` |
| Plan | **Free** |

5. 點擊 **Create Web Service**

### 4. 設定環境變數

部署前**必須**設定環境變數，否則程式會啟動失敗：

1. 進入 Web Service 頁面
2. 點擊左側 **Environment**
3. 點擊 **Add Environment Variable**
4. 加入以下變數：

| 變數 | 說明 | 來源 |
|------|------|------|
| `LINE_CHANNEL_SECRET` | LINE Channel Secret | [LINE Developers Console](https://developers.line.biz/console/) |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Access Token | LINE Developers Console |
| `JABA_API_URL` | jaba API 網址 | 你的後端伺服器 |
| `JABA_API_KEY` | API 驗證金鑰 | 自行設定 |
| `REGISTER_SECRET` | 使用者啟用密碼 | 自行設定 |

5. 點擊 **Save Changes**（會觸發重新部署）

### 5. 確認部署成功

1. 等待部署完成（約 2-5 分鐘）
2. 查看 **Logs** 確認沒有錯誤
3. 訪問服務 URL：
   ```
   https://jaba-line-bot.onrender.com
   ```
   應該看到：`Jaba LINE Bot is running! (jaba 模式)`

### 6. 設定 LINE Webhook

1. 到 [LINE Developers Console](https://developers.line.biz/console/)
2. 進入 Channel → **Messaging API**
3. 設定 **Webhook URL**：
   ```
   https://jaba-line-bot.onrender.com/callback
   ```
4. 開啟 **Use webhook**
5. 點擊 **Verify** 測試

看到 **Success** 就完成了！

---

## 更新部署

推送到 GitHub 會自動部署：

```bash
git add .
git commit -m "Update feature"
git push origin main
# Render 自動開始部署
```

手動觸發部署：
- Dashboard → Web Service → **Manual Deploy** → **Deploy latest commit**

---

## 查看 Logs

排查問題時，Logs 很有用：

1. Dashboard → Web Service
2. 點擊左側 **Logs**

常見錯誤：

| 錯誤 | 原因 | 解決 |
|------|------|------|
| `LINE_CHANNEL_SECRET 未設定` | 環境變數沒設定 | 到 Environment 設定 |
| `ModuleNotFoundError` | requirements.txt 缺套件 | 加入缺少的套件 |
| `gunicorn: not found` | 沒裝 gunicorn | 加入 requirements.txt |

---

## 解決冷啟動

免費方案的冷啟動無法完全避免，但可以緩解：

### 方法 1：定期 Ping

使用免費 cron 服務每 10 分鐘 ping 一次：

1. 前往 [cron-job.org](https://cron-job.org)
2. 建立免費帳號
3. 新增 cron job：
   - URL：`https://jaba-line-bot.onrender.com`
   - 執行頻率：每 10 分鐘

### 方法 2：升級付費方案

$7/月的 Starter 方案沒有冷啟動，適合正式服務。

---

## 小結

用 Render 部署 LINE Bot 的流程：

1. 準備 `requirements.txt` 和 `render.yaml`
2. 推送到 GitHub
3. 在 Render 建立 Web Service
4. 設定環境變數（LINE 憑證等）
5. 到 LINE Console 設定 Webhook URL

整個過程約 10-15 分鐘，之後每次 push 都會自動部署。

---

## 相關連結

- [Jaba LINE Bot 專案]({{ site.baseurl }}/jaba-line-bot/)
- [LINE Bot 開發入門]({{ site.baseurl }}/line-bot-guide/)
- [Render 官方文件](https://render.com/docs)
- [Render 免費方案說明](https://render.com/docs/free)
