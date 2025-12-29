---
layout: post
title: "用 Cloudflare Workers 免費架設短網址服務"
subtitle: "260 行程式碼 + 免費額度，打造專屬的 URL 縮短服務"
tags: [Cloudflare, Workers, Serverless, JavaScript, 免費工具]
date: 2025-12-29
categories: [Serverless, 教學]
---

## 為什麼要自己架短網址服務？

用過 bit.ly、reurl 這類公用短網址服務嗎？它們很方便，但有幾個問題：

- **有廣告或需要付費**：免費版功能受限，或是會被插入廣告
- **隱私疑慮**：你的連結資料都在別人的伺服器上
- **自訂受限**：無法控制網域、無法存儲自訂資料
- **只能存 URL**：如果想存一些額外資料（JSON、設定檔），就沒辦法了

最近我在做 [PromptFill](/2025/12/29/promptfill-intro/)（一個 Prompt 範本工具），需要讓使用者分享範本。範本內容可能很長（包含範本結構、詞庫、預設值），放在 URL 參數裡會超長又醜。於是我用 Cloudflare Workers 做了一個專屬的「短網址 + 小資料庫」服務：

- **完全免費**：每天 10 萬次請求、1GB 儲存空間
- **存 JSON 資料**：不只是 URL，可以存任意 JSON
- **自己掌控**：資料在自己的 Cloudflare 帳號
- **260 行程式碼**：簡單好維護

---

## 架構概覽

```
┌─────────────────┐    POST /api/short-url    ┌─────────────────┐
│   前端應用       │ ──────────────────────▶  │  Cloudflare      │
│   (PromptFill)  │                           │  Workers         │
│                 │ ◀──────────────────────── │                  │
└─────────────────┘    { shortUrl, code }     │    ┌─────────┐   │
                                              │    │   KV    │   │
┌─────────────────┐    GET /s/:code           │    │ Storage │   │
│   使用者點擊     │ ──────────────────────▶  │    └─────────┘   │
│   短網址         │                           │                  │
│                 │ ◀──────────────────────── └─────────────────┘
└─────────────────┘    302 Redirect
```

**技術棧：**
- **Cloudflare Workers**：Serverless 執行環境
- **Cloudflare KV**：Key-Value 儲存（資料保存 1 年）
- **GitHub Actions**：自動部署

---

## 免費額度有多少？

Cloudflare Workers 免費方案非常大方：

| 項目 | 免費額度 |
|------|----------|
| 請求數 | 每天 100,000 次 |
| KV 儲存 | 1 GB |
| KV 讀取 | 每天 100,000 次 |
| KV 寫入 | 每天 1,000 次 |

對於個人專案或小型應用來說，這個額度綽綽有餘。

---

## 快速開始

### 1. 註冊 Cloudflare（免費）

前往 [Cloudflare 註冊頁面](https://dash.cloudflare.com/sign-up) 建立帳號。

### 2. 建立專案

```bash
mkdir shorturl-worker && cd shorturl-worker
npm init -y
npm install -D wrangler
```

### 3. 設定 wrangler.toml

```toml
name = "shorturl"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[kv_namespaces]]
binding = "URLS"
id = "你的KV_ID"  # 下一步會取得
```

### 4. 建立 KV 儲存空間

```bash
npx wrangler login        # 開啟瀏覽器授權
npx wrangler kv:namespace create "URLS"
```

執行後會得到：
```
{ binding = "URLS", id = "abc123xxxxxxxxx" }
```

把 `id` 填入 `wrangler.toml`。

### 5. 撰寫 Worker 程式碼

建立 `src/index.js`：

```javascript
// 允許的來源（CORS 白名單）
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
];

// 重定向目標
const REDIRECT_URL = 'https://your-app.com/';

// Rate Limiting 設定
const RATE_LIMIT = 10;          // 每個 IP 最多請求次數
const RATE_WINDOW_MS = 60000;   // 時間窗口：60 秒
const rateLimitMap = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS 預檢請求
    if (request.method === 'OPTIONS') {
      return handleCORS(origin);
    }

    // POST /api/short-url - 建立短網址
    if (request.method === 'POST' && url.pathname === '/api/short-url') {
      return handleCreateShortUrl(request, env, url, origin);
    }

    // GET /api/data/:code - 取得資料
    if (request.method === 'GET' && url.pathname.startsWith('/api/data/')) {
      return handleGetData(request, env, url, origin);
    }

    // GET /s/:code - 重定向
    if (url.pathname.startsWith('/s/')) {
      return handleRedirect(request, env, url);
    }

    return new Response('Not Found', { status: 404 });
  }
};
```

（完整程式碼請參考 [GitHub Repo](https://github.com/YaZeLinJ303/shorturl-worker)）

### 6. 本機測試

```bash
npx wrangler dev
```

### 7. 部署

```bash
npx wrangler deploy
```

部署成功後會得到 Worker URL，例如：
```
https://shorturl.your-subdomain.workers.dev
```

---

## 核心功能解析

### 生成短碼

使用加密安全的隨機生成：

```javascript
function generateCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);  // 加密安全的隨機數
  for (let i = 0; i < length; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}
```

6 位英數字可產生 62^6 = 568 億種組合，足夠使用。

### Rate Limiting

使用記憶體 Map 實作簡易的請求限制：

```javascript
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  // 新 IP 或已過期，重置計數
  if (!record || now - record.start > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }

  // 超過限制
  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}
```

每個 IP 每分鐘最多 10 次請求，防止濫用。

### CORS 處理

限制只有白名單網域可以呼叫 API：

```javascript
function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}
```

---

## 設定 GitHub Actions 自動部署

建立 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

設定 GitHub Secret：
1. 前往 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 使用「Edit Cloudflare Workers」範本建立 Token
3. 在 GitHub Repo → Settings → Secrets → 新增 `CLOUDFLARE_API_TOKEN`

之後只要 push 到 main 分支就會自動部署。

---

## API 使用範例

### 建立短網址

```javascript
const response = await fetch('https://shorturl.workers.dev/api/short-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    template: {
      name: '我的範本',
      content: '這是範本內容...'
    },
    banks: {},
    defaults: {}
  })
});

const { shortUrl, code } = await response.json();
// shortUrl: "https://shorturl.workers.dev/s/abc123"
// code: "abc123"
```

### 取得資料

```javascript
const response = await fetch('https://shorturl.workers.dev/api/data/abc123');
const data = await response.json();
```

### 短網址重定向

瀏覽器訪問 `https://shorturl.workers.dev/s/abc123` 會自動跳轉到你設定的目標 URL。

### CORS 圖片代理

這是後來加入的功能。前端在載入外部圖片時常常會遇到 CORS 跨域問題，透過這個代理 endpoint 可以繞過限制：

```javascript
// 原始圖片 URL 會被 CORS 擋住
const originalUrl = 'https://example.com/image.jpg';

// 透過代理取得圖片
const proxyUrl = `https://shorturl.workers.dev/api/proxy?url=${encodeURIComponent(originalUrl)}`;
const response = await fetch(proxyUrl);
const blob = await response.blob();
```

安全機制：
- **Origin 白名單**：只有 `yazelin.github.io` 可以呼叫
- **協議限制**：只允許 `http://` 和 `https://`
- **快取**：回應會快取 1 天，減少重複請求

---

## 進階擴充建議

這個基礎版本可以再擴充：

- **自訂網域**：在 Cloudflare 設定 Custom Domain
- **點擊統計**：在 KV 中記錄存取次數
- **過期設定**：讓使用者自訂連結有效期
- **密碼保護**：存取前需要輸入密碼
- **QR Code**：自動生成 QR Code

---

## 總結

Cloudflare Workers 非常適合做這類輕量級服務：

- **免費額度足夠**：每天 10 萬次請求
- **全球 CDN**：Edge 部署，延遲低
- **零維運**：不用管伺服器
- **開發體驗好**：wrangler CLI 很順手

260 行程式碼就能搞定一個功能完整的短網址服務，推薦給需要類似功能的開發者參考。

---

## 實際應用：PromptFill 範本分享

這個服務目前用在 [PromptFill](/2025/12/29/promptfill-intro/) 的範本分享功能。當使用者點擊「分享」時：

1. 前端把範本資料（名稱、內容、詞庫、預設值）打包成 JSON
2. POST 到 `/api/short-url`，存入 KV
3. 取得短網址，例如 `https://shorturl.yazelinj303.workers.dev/s/abc123`
4. 對方點擊連結，自動跳轉到 PromptFill 並載入範本

這個模式可以套用到任何需要「分享複雜資料」的場景：

- 表單設定分享
- 遊戲存檔分享
- 設定檔分享
- 任何 JSON 資料的短連結

---

## 相關資源

- [PromptFill 介紹](/2025/12/29/promptfill-intro/)
- [Cloudflare Workers 官方文件](https://developers.cloudflare.com/workers/)
- [Cloudflare KV 文件](https://developers.cloudflare.com/kv/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
