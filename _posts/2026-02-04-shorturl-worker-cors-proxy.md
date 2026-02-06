---
layout: post
title: "Cloudflare Worker 實戰：CORS Proxy + GitHub Release 代理"
subtitle: "一個 Worker 身兼數職 -- 短網址、圖片代理、圖床上傳刪除，全部搞定"
date: 2026-02-04
categories: [Serverless]
tags: [Cloudflare Workers, CORS, Proxy, GitHub, Serverless]
---

## 前言

在前一篇文章中，我們介紹了如何用 Cloudflare Workers 架設一個短網址服務。但隨著專案的演進，這個 Worker 不只做短網址了 -- 它逐漸長成一個「瑞士刀」級別的邊緣代理服務。

起因很簡單：在開發 [GitHub Release 圖床]({% post_url 2026-02-04-image-bed-github-release %})時，前端直接呼叫 GitHub API 會被瀏覽器的 CORS 政策擋下來。GitHub 的上傳端點 `uploads.github.com` 不回傳 `Access-Control-Allow-Origin` header，瀏覽器就直接拒絕了。

解法？在中間加一層代理。而我們手上已經有一個部署好的 Cloudflare Worker，何不直接擴充它？

本文將介紹這個 Worker 目前的完整功能。其中 CORS 圖片代理在 2025 年 12 月就已加入（為 PromptFill 服務），而這次為了圖床又新增了兩個代理端點：

1. **CORS 圖片代理**（2025-12 加入）-- 解決前端跨域載入圖片的問題
2. **GitHub Release Upload Proxy**（本次新增）-- 讓前端能直接上傳檔案到 GitHub Release
3. **GitHub Release Asset Delete Proxy**（本次新增）-- 讓前端能刪除 GitHub Release 上的檔案

---

## Cloudflare Workers 快速回顧

如果你還不熟悉 Cloudflare Workers，簡單來說它是一個 Serverless 邊緣運算平台：

- **全球部署**：程式碼運行在 Cloudflare 遍佈全球 300+ 個節點
- **零冷啟動**：不像傳統 Lambda 要等容器啟動，Workers 幾乎即時回應
- **免費額度**：每天 100,000 次請求、1 GB KV 儲存
- **開發簡單**：用原生 JavaScript 寫 `fetch` handler 就好

免費方案的額度整理：

| 項目 | 免費額度 |
|------|----------|
| 請求數 | 每天 100,000 次 |
| KV 儲存 | 1 GB |
| KV 讀取 | 每天 100,000 次 |
| KV 寫入 | 每天 1,000 次 |

對個人專案來說完全夠用。

---

## 專案架構總覽

目前這個 Worker 提供六個端點，涵蓋了短網址、代理、圖床三大功能：

```
┌──────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (shorturl)                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  短網址功能                                                   │
│  ├── POST /api/short-url       建立短網址（存 JSON 到 KV）    │
│  ├── GET  /api/template/:code  取得模板資料                   │
│  └── GET  /s/:code             302 重定向到 PromptFill        │
│                                                              │
│  代理功能                                                     │
│  ├── GET  /api/proxy?url=...   CORS 圖片代理                 │
│  ├── POST /api/upload-release  GitHub Release 上傳代理        │
│  └── DELETE /api/delete-asset  GitHub Release 刪除代理        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  安全機制：Origin 白名單 + Rate Limiting + Repo 白名單        │
└──────────────────────────────────────────────────────────────┘
```

專案結構非常精簡：

```
shorturl-worker/
├── src/
│   └── index.js          # Worker 主程式（全部邏輯都在這）
├── wrangler.toml          # Cloudflare 設定
├── package.json
└── .github/
    └── workflows/
        └── deploy.yml     # GitHub Actions 自動部署
```

---

## 短網址功能（原有功能簡述）

這部分在前一篇文章已有詳細說明，這裡簡要回顧。Worker 透過 Cloudflare KV 儲存模板 JSON 資料，並提供短碼重定向：

```javascript
// POST /api/short-url - 存儲模板資料，回傳短碼
const storedData = {
  template: body.template,
  banks: body.banks || {},
  defaults: body.defaults || {},
  createdAt: new Date().toISOString(),
};

// 存入 KV（保存 1 年）
await env.URLS.put(code, JSON.stringify(storedData), {
  expirationTtl: 365 * 24 * 60 * 60
});

// GET /s/:code - 重定向到 PromptFill
const redirectUrl = `${PROMPTFILL_URL}?id=${code}`;
return Response.redirect(redirectUrl, 302);
```

短碼使用 `crypto.getRandomValues()` 生成 6 位英數字，共 62^6 = 568 億種組合，碰撞機率極低。

---

## 新增功能一：CORS 圖片代理

### 為什麼需要圖片代理？

前端應用在使用 `<canvas>` 或 `fetch()` 載入外部圖片時，經常遇到 CORS 問題。例如你想在 canvas 上繪製一張來自其他網站的圖片，瀏覽器會因為缺少 `Access-Control-Allow-Origin` header 而拒絕。

典型的錯誤訊息：

```
Access to image at 'https://example.com/image.jpg' from origin
'https://yazelin.github.io' has been blocked by CORS policy.
```

### 解法：Worker 中繼代理

讓 Worker 扮演「中間人」角色：前端不直接請求外部圖片，而是透過 Worker 去拿，Worker 再加上 CORS header 回傳給前端。

```javascript
/**
 * CORS 圖片代理 - 繞過跨域限制
 */
async function handleProxy(request, url, origin) {
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // 驗證是否為有效的 URL
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  // 只允許 http/https 協議
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return new Response('Only HTTP/HTTPS URLs are allowed', { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'PromptFill-Proxy/1.0',
      },
    });

    if (!response.ok) {
      return new Response(`Upstream error: ${response.status}`, {
        status: response.status
      });
    }

    const contentType = response.headers.get('Content-Type')
      || 'application/octet-stream';

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': origin,
        'Cache-Control': 'public, max-age=86400', // 快取 1 天
      },
    });
  } catch (err) {
    return new Response('Failed to fetch resource', { status: 502 });
  }
}
```

### 前端使用方式

```javascript
// 原始 URL 會被 CORS 擋住
const imageUrl = 'https://example.com/photo.jpg';

// 改用代理
const proxyUrl = `https://shorturl.yazelinj303.workers.dev/api/proxy?url=${encodeURIComponent(imageUrl)}`;
const response = await fetch(proxyUrl);
const blob = await response.blob();
```

### 安全設計

這個代理不是無限制開放的，有三層保護：

1. **Origin 白名單** -- 只有 `yazelin.github.io` 能呼叫
2. **協議限制** -- 只允許 `http://` 和 `https://`，防止 `file://` 或 `data:` 等協議被濫用
3. **快取策略** -- 回應帶有 `Cache-Control: public, max-age=86400`，相同圖片在 24 小時內不會重複抓取

---

## 新增功能二：GitHub Release Upload Proxy

### 問題背景

在 [GitHub Release 圖床]({% post_url 2026-02-04-image-bed-github-release %})專案中，我們需要從前端直接上傳圖片到 GitHub Release。但 GitHub 的上傳端點 `uploads.github.com` 不支援跨域請求，前端直接 `fetch()` 上傳會失敗。

### 解法：Worker 轉發上傳

Worker 接收前端的上傳請求，以原始的 binary body 轉發到 GitHub API：

```javascript
/**
 * GitHub Release 上傳代理 - 繞過 CORS 限制（圖床用）
 */
async function handleUploadRelease(request, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return jsonResponse({
      error: 'Too many requests. Please try again later.'
    }, 429, origin);
  }

  try {
    // 從 URL 參數取得 metadata
    const url = new URL(request.url);
    const repo = url.searchParams.get('repo');
    const releaseId = url.searchParams.get('releaseId');
    const filename = url.searchParams.get('filename');
    const token = url.searchParams.get('token');

    // 驗證必要參數
    if (!repo || !releaseId || !filename || !token) {
      return jsonResponse({
        error: 'Missing required parameters: repo, releaseId, filename, token'
      }, 400, origin);
    }

    // 安全檢查：只允許特定 repo
    if (!ALLOWED_IMAGE_REPOS.includes(repo)) {
      return jsonResponse({
        error: 'Forbidden: Repository not allowed'
      }, 403, origin);
    }

    // 取得檔案內容（binary）
    const fileData = await request.arrayBuffer();
    const contentType = request.headers.get('Content-Type')
      || 'application/octet-stream';

    // 轉發到 GitHub Upload API
    const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`;

    const githubRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': contentType,
        'Content-Length': fileData.byteLength.toString(),
      },
      body: fileData,
    });

    const responseData = await githubRes.json();

    return new Response(JSON.stringify(responseData), {
      status: githubRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    });
  } catch (err) {
    return jsonResponse({
      error: 'Upload failed: ' + err.message
    }, 500, origin);
  }
}
```

### 前端呼叫方式

```javascript
const workerUrl = 'https://shorturl.yazelinj303.workers.dev';
const params = new URLSearchParams({
  repo: 'yazelin/image-bed',
  releaseId: '12345',
  filename: 'photo.jpg',
  token: githubToken,
});

const response = await fetch(`${workerUrl}/api/upload-release?${params}`, {
  method: 'POST',
  headers: { 'Content-Type': file.type },
  body: file,  // File 或 Blob 物件
});

const result = await response.json();
// result.browser_download_url => 圖片的公開下載連結
```

### 關鍵設計

- **二進位透傳**：使用 `request.arrayBuffer()` 完整讀取檔案內容，再轉發到 GitHub，不做任何轉換
- **Repo 白名單**：用 `ALLOWED_IMAGE_REPOS` 陣列限制只有指定的 repository 可以上傳，防止被濫用

```javascript
const ALLOWED_IMAGE_REPOS = [
  'yazelin/image-bed',
];
```

---

## 新增功能三：GitHub Release Asset Delete Proxy

### 為什麼需要刪除代理？

圖床管理不只需要上傳，也需要刪除。GitHub 的 Delete Release Asset API 同樣不支援 CORS 跨域請求，因此也需要透過 Worker 代理。

### 實作

```javascript
/**
 * GitHub Release Asset 刪除代理 - 繞過 CORS 限制（圖床用）
 */
async function handleDeleteAsset(request, url, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return jsonResponse({
      error: 'Too many requests. Please try again later.'
    }, 429, origin);
  }

  try {
    const repo = url.searchParams.get('repo');
    const assetId = url.searchParams.get('assetId');
    const token = url.searchParams.get('token');

    if (!repo || !assetId || !token) {
      return jsonResponse({
        error: 'Missing required parameters: repo, assetId, token'
      }, 400, origin);
    }

    // 安全檢查：只允許特定 repo
    if (!ALLOWED_IMAGE_REPOS.includes(repo)) {
      return jsonResponse({
        error: 'Forbidden: Repository not allowed'
      }, 403, origin);
    }

    // 轉發刪除請求到 GitHub
    const deleteUrl = `https://api.github.com/repos/${repo}/releases/assets/${assetId}`;

    const githubRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ImageBed-Worker/1.0',
      },
    });

    // GitHub 回傳 204 表示成功刪除
    if (githubRes.status === 204) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
        },
      });
    }

    // 其他狀態直接轉發
    const responseData = await githubRes.json().catch(() => ({}));
    return new Response(JSON.stringify(responseData), {
      status: githubRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    });
  } catch (err) {
    return jsonResponse({
      error: 'Delete failed: ' + err.message
    }, 500, origin);
  }
}
```

### 前端呼叫方式

```javascript
const params = new URLSearchParams({
  repo: 'yazelin/image-bed',
  assetId: '67890',
  token: githubToken,
});

const response = await fetch(
  `${workerUrl}/api/delete-asset?${params}`,
  { method: 'DELETE' }
);

const result = await response.json();
// result.success === true 表示刪除成功
```

注意 GitHub API 的 Delete Asset 成功時回傳 HTTP 204（No Content），Worker 會將它轉換為 200 + JSON `{ success: true }`，讓前端更容易處理。

---

## 安全機制總整理

一個面向公網的代理服務，安全性是第一要務。這個 Worker 實作了多層防護：

### 1. Origin 白名單

```javascript
const ALLOWED_ORIGINS = [
  'https://yazelin.github.io',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}
```

所有 API 端點在處理前都會先檢查 `Origin` header，只有白名單內的網域可以通過。

### 2. CORS 預檢處理

```javascript
function handleCORS(origin) {
  const allowedOrigin = isAllowedOrigin(origin)
    ? origin : ALLOWED_ORIGINS[0];
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  });
}
```

瀏覽器對跨域的 `POST`、`DELETE` 請求會先發送 `OPTIONS` 預檢請求。Worker 統一回應允許的方法與 header，並設定 24 小時快取，減少重複預檢。

### 3. Rate Limiting

```javascript
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;
const rateLimitMap = new Map();
```

使用記憶體 Map 追蹤每個 IP 的請求次數，每分鐘最多 10 次。搭配概率性清理機制（1% 機率觸發過期記錄清除），避免記憶體無限增長。

### 4. Repo 白名單

```javascript
const ALLOWED_IMAGE_REPOS = [
  'yazelin/image-bed',
];
```

GitHub 相關的代理端點額外檢查目標 repository 是否在允許清單中，防止 Worker 被用來操作其他人的 repository。

---

## 搭配 Image Bed 的整合場景

這個 Worker 是 [GitHub Release 圖床]({% post_url 2026-02-04-image-bed-github-release %})的核心基礎設施。完整的資料流如下：

```
使用者選擇圖片
    │
    ▼
前端 (image-bed)
    │
    ├─ 上傳 ──▶ Worker /api/upload-release ──▶ GitHub uploads.github.com
    │              加上 CORS headers                 存到 Release Assets
    │
    ├─ 刪除 ──▶ Worker /api/delete-asset  ──▶ GitHub api.github.com
    │              加上 CORS headers                 刪除 Release Asset
    │
    └─ 顯示 ──▶ Worker /api/proxy?url=... ──▶ GitHub 原始圖片 URL
                   加上 CORS headers                 回傳圖片內容
```

三個代理端點各司其職：

- **上傳代理**：解決 `uploads.github.com` 不支援 CORS 的問題
- **刪除代理**：解決 `api.github.com` 的 DELETE 操作跨域限制
- **圖片代理**：讓前端的 `<canvas>` 能正常載入 GitHub Release 的圖片做後續處理

這套組合讓一個純前端的 GitHub Pages 網站，也能擁有完整的圖片上傳、管理、顯示功能，不需要自己架設後端伺服器。

---

## Wrangler 部署流程

### 專案設定 -- wrangler.toml

```toml
name = "shorturl"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[kv_namespaces]]
binding = "URLS"
id = "你的KV_ID"
```

- `name`：Worker 名稱，也是 `.workers.dev` 的子網域名稱
- `main`：入口檔案
- `kv_namespaces`：繫結 KV 儲存空間，程式中透過 `env.URLS` 存取

### 手動部署

```bash
# 安裝相依套件
npm install

# 登入 Cloudflare
npx wrangler login

# 部署到正式環境
npx wrangler deploy
```

### GitHub Actions 自動部署

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
    name: Deploy
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

設定步驟：

1. 前往 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) 建立 Token（使用「Edit Cloudflare Workers」範本）
2. 在 GitHub Repo 的 Settings > Secrets and variables > Actions 新增 `CLOUDFLARE_API_TOKEN`
3. 之後每次 push 到 `main` 分支就會自動部署

### 本機開發

```bash
npx wrangler dev
```

Wrangler 會在本機啟動一個模擬環境，支援 KV 的本地模擬，方便開發測試。

---

## 小結

回顧這個 Worker 的演化歷程：

| 階段 | 功能 | 解決的問題 |
|------|------|-----------|
| v1（2025-12） | 短網址 + KV 儲存 | PromptFill 模板分享 |
| v2（2025-12） | + CORS 圖片代理 | 前端載入外部圖片的跨域問題 |
| v3（2026-02） | + Release 上傳代理 | 圖床上傳繞過 CORS |
| v3（2026-02） | + Release 刪除代理 | 圖床刪除繞過 CORS |

這個案例展示了 Cloudflare Workers 的一個很實用的模式：**邊緣代理（Edge Proxy）**。當你的前端被 CORS 政策擋住時，不需要架設一台完整的後端伺服器，只要在 Worker 中加幾十行 `fetch()` 轉發邏輯就能解決。

整個 `src/index.js` 目前約 470 行，包含六個端點、完整的安全機制、Rate Limiting 和錯誤處理。部署完全免費，維護成本接近零。

如果你也有類似的需求 -- 前端需要存取不支援 CORS 的第三方 API -- Cloudflare Workers 是一個非常值得考慮的方案。

---

## 參考資源

- [GitHub Release 圖床]({% post_url 2026-02-04-image-bed-github-release %}) -- 搭配本文 Worker 使用的前端圖床專案
- [用 Cloudflare Workers 免費架設短網址服務]({% post_url 2025-12-29-cloudflare-workers-shorturl %}) -- 本 Worker 的初始版本介紹
- [Cloudflare Workers 官方文件](https://developers.cloudflare.com/workers/)
- [Cloudflare KV 文件](https://developers.cloudflare.com/kv/)
- [Wrangler CLI 文件](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub REST API -- Release Assets](https://docs.github.com/en/rest/releases/assets)
- [MDN -- CORS (Cross-Origin Resource Sharing)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
