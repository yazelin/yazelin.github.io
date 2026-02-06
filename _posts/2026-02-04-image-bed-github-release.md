---
layout: post
title: "用 GitHub Release 打造免費圖床"
subtitle: "GitHub Release + Cloudflare Worker + 單頁前端，零成本搭建穩定的個人圖床"
date: 2026-02-04
categories: [DevOps]
tags: [GitHub, Cloudflare Workers, 圖床, CORS, DevOps]
---

## 前言

寫部落格最麻煩的事之一，就是圖片要放哪裡。

常見的免費圖床服務（imgur、sm.ms）不是有容量限制，就是哪天可能突然掛掉。自己架 S3 或類似服務又要花錢。把圖片直接丟進 Git repo？一張 2MB 的圖片推個十張，repo 就肥到不行，clone 時間越來越長。

後來我想到一個方法：**把圖片存在 GitHub Release 的 Assets 裡**。

Release Assets 有幾個關鍵優勢：

- **不佔 repo 空間** -- 圖片存在 Release 附件中，不會進入 Git 歷史
- **完全免費** -- 沒有額外費用，單檔最大 2GB
- **有 CDN** -- GitHub 有全球節點，下載速度還不錯
- **穩定** -- GitHub 不太會倒，比小型圖床服務可靠得多

這篇文章會完整說明我如何用 GitHub Release + Cloudflare Worker + 一個單頁前端，打造出一個功能完整的個人圖床系統。

---

## 架構設計

整套系統由三個部分組成：

```
┌──────────────────────────────────────────────────────────────┐
│                       瀏覽器                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  GitHub Pages (yazelin.github.io/image-bed)            │  │
│  │  - 上傳 / 瀏覽介面                                      │  │
│  │  - Token 存在 localStorage（不經過伺服器）               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │                                    │
         │ 上傳/刪除圖片                       │ 讀取 index.json
         ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│  Cloudflare Worker  │              │  GitHub Repo        │
│  (CORS 代理)        │              │  - index.json       │
│                     │              │    (圖片索引)        │
│  - 上傳代理          │              └─────────────────────┘
│  - 刪除代理          │
└─────────────────────┘
         │
         │ 轉發到 GitHub API
         ▼
┌──────────────────────────────────────────────────────────────┐
│  GitHub Release Assets                                        │
│  - 圖片的實際儲存位置                                          │
│  - 網址: github.com/{user}/{repo}/releases/download/images/… │
└──────────────────────────────────────────────────────────────┘
```

**三個角色各自的工作：**

| 元件 | 負責什麼 |
|------|----------|
| **GitHub Pages 前端** | 提供上傳/瀏覽 UI，管理 Token，呼叫 API |
| **Cloudflare Worker** | 代理上傳與刪除請求（繞過 CORS 限制） |
| **GitHub Release** | 實際存放圖片檔案，提供公開下載連結 |

整個 repo 裡只有三個檔案：

```
image-bed/
├── index.html      # 前端介面（單一檔案，約 1500 行）
├── index.json      # 圖片索引（自動維護，幾 KB 而已）
└── README.md
```

圖片本身存在 Release Assets 裡，完全不佔 repo 空間。

---

## 為什麼需要 Cloudflare Worker？

你可能會問：前端直接呼叫 GitHub API 上傳不就好了嗎？

問題出在 CORS。GitHub 的 Release 上傳端點 `uploads.github.com` **不允許瀏覽器直接呼叫**。瀏覽器發出跨域請求時，GitHub 不會回傳 `Access-Control-Allow-Origin` 標頭，請求直接被瀏覽器擋掉。

讀取 Release 資訊（`api.github.com`）沒有 CORS 問題，但上傳和刪除 Asset 都必須走 `uploads.github.com`，所以需要一個中間代理。

Cloudflare Worker 做的事情很單純：

1. 接收瀏覽器送來的圖片（或刪除請求）
2. 轉發給 GitHub Release API
3. 把結果回傳給瀏覽器，並加上 CORS 標頭

Worker 本身不儲存任何資料，也不保留你的 Token。

---

## Worker 代理的核心實作

Worker 提供兩個 API 端點：上傳和刪除。

### 上傳代理

前端把圖片 POST 到 Worker，Worker 轉發到 `uploads.github.com`：

```javascript
async function handleUploadRelease(request, origin) {
  const url = new URL(request.url);
  const repo = url.searchParams.get('repo');
  const releaseId = url.searchParams.get('releaseId');
  const filename = url.searchParams.get('filename');
  const token = url.searchParams.get('token');

  // 安全檢查：只允許特定 repo
  if (!ALLOWED_IMAGE_REPOS.includes(repo)) {
    return jsonResponse({ error: 'Forbidden' }, 403, origin);
  }

  // 取得檔案內容，轉發到 GitHub
  const fileData = await request.arrayBuffer();
  const contentType = request.headers.get('Content-Type');
  const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`;

  const githubRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': contentType,
    },
    body: fileData,
  });

  const responseData = await githubRes.json();
  return new Response(JSON.stringify(responseData), {
    status: githubRes.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,  // 關鍵：加上 CORS 標頭
    },
  });
}
```

### 刪除代理

刪除的邏輯類似，轉發 DELETE 請求到 `api.github.com`：

```javascript
async function handleDeleteAsset(request, url, origin) {
  const repo = url.searchParams.get('repo');
  const assetId = url.searchParams.get('assetId');
  const token = url.searchParams.get('token');

  if (!ALLOWED_IMAGE_REPOS.includes(repo)) {
    return jsonResponse({ error: 'Forbidden' }, 403, origin);
  }

  const deleteUrl = `https://api.github.com/repos/${repo}/releases/assets/${assetId}`;
  const githubRes = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ImageBed-Worker/1.0',
    },
  });

  // GitHub 刪除成功回傳 204
  if (githubRes.status === 204) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    });
  }

  // 其他狀態原封回傳
  const responseData = await githubRes.json().catch(() => ({}));
  return new Response(JSON.stringify(responseData), {
    status: githubRes.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    },
  });
}
```

### 安全機制

Worker 有三層安全防護：

1. **來源限制** -- 只接受來自 `yazelin.github.io` 的請求
2. **Repo 白名單** -- 只允許上傳到指定的 repo
3. **Rate Limiting** -- 每個 IP 每分鐘最多 10 次請求

```javascript
const ALLOWED_IMAGE_REPOS = ['yazelin/image-bed'];
const ALLOWED_ORIGINS = ['https://yazelin.github.io'];
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;
```

---

## 上傳流程

前端的上傳流程分成四步：

### 1. 確保 Release 存在

第一次上傳時，需要先在 repo 建立一個 Release（tag 名稱為 `images`）。之後所有圖片都上傳到這同一個 Release：

```javascript
async function ensureRelease() {
  // 先檢查 Release 是否已存在
  const res = await fetch(
    `https://api.github.com/repos/${settings.repo}/releases/tags/${CONFIG.RELEASE_TAG}`,
    { headers: { 'Authorization': `token ${settings.token}` } }
  );
  if (res.ok) return (await res.json()).id;

  // 不存在就建立
  const create = await fetch(
    `https://api.github.com/repos/${settings.repo}/releases`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: 'images',
        name: 'Image Storage',
        body: 'Auto-created for image storage',
      }),
    }
  );
  return (await create.json()).id;
}
```

### 2. 透過 Worker 上傳圖片

取得 Release ID 之後，把圖片 POST 到 Worker 代理：

```javascript
const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const assetName = `${id}_${file.name}`;  // 例如: m1abc_photo.jpg

const uploadUrl = `${CONFIG.UPLOAD_PROXY}?repo=${encodeURIComponent(settings.repo)}&releaseId=${releaseId}&filename=${encodeURIComponent(assetName)}&token=${encodeURIComponent(settings.token)}`;

const res = await fetch(uploadUrl, {
  method: 'POST',
  headers: { 'Content-Type': file.type },
  body: file,
});
```

檔名前面加上隨機 ID（`m1abc_`），是為了避免同名檔案衝突。

### 3. 更新 index.json

上傳成功後，將圖片的 metadata 加入索引，再透過 GitHub Contents API 把 `index.json` 寫回 repo：

```javascript
images.push({
  id,
  filename: file.name,
  folder: cleanFolder,
  size: file.size,
  uploadedAt: new Date().toISOString(),
});
await saveIndex();
```

### 4. 取得圖片網址

上傳完成後，圖片的公開網址格式為：

```
https://github.com/{owner}/{repo}/releases/download/images/{id}_{filename}
```

例如：

```
https://github.com/yazelin/image-bed/releases/download/images/m1abc_photo.jpg
```

這個網址任何人都能直接存取，可以用在部落格、Markdown 文件、或任何需要圖片的地方。

---

## index.json 管理機制

`index.json` 是整套系統的「目錄」，記錄了所有圖片的 metadata：

```json
{
  "images": [
    {
      "id": "m1abc",
      "filename": "photo.jpg",
      "folder": "Blog/Tech",
      "size": 123456,
      "uploadedAt": "2026-02-04T10:30:00Z"
    }
  ]
}
```

為什麼不直接列舉 Release Assets？因為 GitHub Release API 每次回傳的 Asset 列表沒有資料夾概念，也沒有我們自訂的分類資訊。用 `index.json` 可以加上 `folder` 欄位做樹狀分類。

### 雙層快取策略

讀取 `index.json` 有一個微妙的問題：GitHub Pages 部署後有快取延遲，可能幾分鐘後才會更新。所以前端採用雙層讀取策略：

```javascript
async function loadImages() {
  // 第一層：先從 localStorage 讀取，讓畫面立即有內容
  const cached = localStorage.getItem('image-bed-images');
  if (cached) {
    images = JSON.parse(cached) || [];
    render();
  }

  // 第二層：從 GitHub raw 讀取最新版（繞過 Pages 快取）
  const rawUrl = `https://raw.githubusercontent.com/${settings.repo}/main/index.json?t=${Date.now()}`;
  const res = await fetch(rawUrl);
  if (res.ok) {
    images = (await res.json()).images || [];
    saveImagesToCache();  // 更新 localStorage
    render();             // 重新渲染
  }
}
```

上傳或刪除後，也會立即更新 localStorage，確保使用者看到的是最新狀態，不用等 GitHub Pages 重新部署。

### 寫入 index.json

寫入時透過 GitHub Contents API，需要帶上檔案的 SHA 才能更新（避免覆蓋衝突）：

```javascript
async function saveIndex() {
  const jsonContent = JSON.stringify({ images }, null, 2);
  const content = btoa(unescape(encodeURIComponent(jsonContent)));

  // 先取得現有檔案的 SHA
  let sha = null;
  const res = await fetch(
    `https://api.github.com/repos/${settings.repo}/contents/index.json`,
    { headers: { 'Authorization': `token ${settings.token}` } }
  );
  if (res.ok) sha = (await res.json()).sha;

  // 寫入（PUT = 建立或更新）
  await fetch(
    `https://api.github.com/repos/${settings.repo}/contents/index.json`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Update image index',
        content,
        ...(sha && { sha }),
      }),
    }
  );
}
```

這個 API 呼叫是直接打到 `api.github.com`，**不需要經過 Worker 代理**，因為 Contents API 有支援 CORS。

---

## 刪除流程

刪除比上傳多了一個步驟：要先從 Release 找到對應的 Asset ID。

```javascript
async function deleteImage(id) {
  // 1. 取得 Release 資訊和所有 Assets
  const release = await fetch(
    `https://api.github.com/repos/${settings.repo}/releases/tags/images`,
    { headers: { 'Authorization': `token ${settings.token}` } }
  ).then(r => r.json());

  // 2. 找到對應的 Asset
  const assetName = `${img.id}_${img.filename}`;
  let asset = release.assets.find(a => a.name === assetName);
  // 容錯：如果精確匹配失敗，嘗試以 id 開頭匹配（處理檔名編碼差異）
  if (!asset) {
    asset = release.assets.find(a => a.name.startsWith(img.id + '_'));
  }

  // 3. 透過 Worker 代理刪除 Asset
  const deleteUrl = `${CONFIG.DELETE_PROXY}?repo=${encodeURIComponent(settings.repo)}&assetId=${asset.id}&token=${encodeURIComponent(settings.token)}`;
  await fetch(deleteUrl, { method: 'DELETE' });

  // 4. 更新 index.json
  images = images.filter(i => i.id !== id);
  await saveIndex();
}
```

前端在刪除過程中會先把卡片變半透明、禁止點擊，給使用者即時回饋。如果刪除失敗則恢復原狀。

---

## 前端 UI 設計

前端是一個單一 HTML 檔案，設計風格參考了 Unsplash、Pexels 這類商業圖庫：

**瀏覽模式的功能：**

- 樹狀資料夾結構，支援展開/折疊
- 圖片以網格排列，hover 時顯示操作按鈕
- 一鍵複製圖片連結或 Markdown 語法
- 響應式設計，手機也能用

**上傳模式的功能：**

- 拖放上傳（Drag & Drop）
- 可選擇目標資料夾，或建立新資料夾
- 上傳完成後立即顯示複製按鈕

前端用到的技術很簡單，純 HTML + CSS + JavaScript，沒有任何框架。CSS 用了 Grid 佈局做圖片牆、Inter 字型讓介面看起來更乾淨。

幾個值得一提的設計細節：

**拖放上傳區域：**

```javascript
const zone = document.getElementById('uploadZone');
zone.addEventListener('click', () => input.click());
['dragenter', 'dragover'].forEach(event => {
  zone.addEventListener(event, () => zone.classList.add('dragover'));
});
['dragleave', 'drop'].forEach(event => {
  zone.addEventListener(event, () => zone.classList.remove('dragover'));
});
zone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
```

**樹狀資料夾的建構：**

```javascript
function buildTree() {
  const tree = { files: [], subdirs: {} };
  images.forEach(img => {
    const folder = (img.folder || '').replace(/^\/+|\/+$/g, '').trim();
    if (!folder) {
      tree.files.push(img);
    } else {
      let current = tree;
      folder.split('/').filter(Boolean).forEach(part => {
        if (!current.subdirs[part]) {
          current.subdirs[part] = { files: [], subdirs: {} };
        }
        current = current.subdirs[part];
      });
      current.files.push(img);
    }
  });
  return tree;
}
```

`folder` 欄位支援多層路徑，例如 `Blog/Tech/2026`，前端會自動建構成巢狀樹。

**Token 安全：**

GitHub Personal Access Token 只存在使用者自己的瀏覽器 localStorage 裡，不會上傳到任何伺服器。Worker 代理收到 Token 後也只是原封不動轉發給 GitHub，不做任何儲存。

---

## 如何自己架設

如果你想用這套系統，照著以下步驟做：

### 1. 建立 GitHub Repo

建一個新的 repo（例如 `image-bed`），啟用 GitHub Pages（Settings > Pages > Source 選 `main` branch）。

### 2. 取得 GitHub Token

前往 [GitHub Token 設定頁面](https://github.com/settings/tokens/new?scopes=repo&description=image-bed)，建立一個有 `repo` 權限的 Token。

### 3. 部署 Cloudflare Worker

到 [Cloudflare Dashboard](https://dash.cloudflare.com/) 建立一個 Worker，把代理程式碼貼進去。記得修改允許的 Repo 和 Origin：

```javascript
const ALLOWED_IMAGE_REPOS = ['你的用戶名/image-bed'];
const ALLOWED_ORIGINS = ['https://你的用戶名.github.io'];
```

### 4. 修改前端設定

編輯 `index.html`，把 Worker URL 改成你自己的：

```javascript
const CONFIG = {
  RELEASE_TAG: 'images',
  INDEX_FILE: 'index.json',
  UPLOAD_PROXY: 'https://你的worker.workers.dev/api/upload-release',
  DELETE_PROXY: 'https://你的worker.workers.dev/api/delete-asset',
};
```

### 5. 開始使用

把 `index.html` 和空的 `index.json`（內容為 `{"images":[]}`) 推上 repo，開啟 GitHub Pages 網址，設定 Token 和 Repository，就能開始上傳了。

---

## 使用限制

| 項目 | 限制 | 說明 |
|------|------|------|
| 單檔大小 | 2 GB | GitHub Release Asset 的上限 |
| 總容量 | 無硬性限制 | Release Assets 不計入 repo 空間 |
| 上傳頻率 | 10 次/分鐘 | Worker Rate Limit（可自行調整）|
| GitHub API | 5,000 次/小時 | 帶 Token 的 GitHub API 限制 |
| Worker 請求 | 100,000 次/天 | Cloudflare 免費方案 |

---

## 開發歷程

回顧整個開發過程，大致經歷了這些階段：

1. **初版** -- 基本的上傳和瀏覽功能，直接從 GitHub API 操作
2. **UI 重設計** -- 參考商業圖庫風格，用 CSS Grid 做圖片牆
3. **改用 Worker 代理** -- 解決 CORS 問題，上傳和刪除都透過代理
4. **index.json 優化** -- 從 Release 搬到 repo，配合 `raw.githubusercontent.com` 繞過 Pages 快取
5. **刪除功能修復** -- 處理 Asset 名稱匹配、防止重複點擊、即時 UI 回饋
6. **folder 路徑修正** -- 處理首尾斜線、空白字元等邊界情況

其中最花時間的是 CORS 問題。一開始以為瀏覽器可以直接呼叫 GitHub API 做所有事，結果 `uploads.github.com` 不回 CORS 標頭，折騰了一陣才決定用 Worker 代理。後來連刪除也遇到同樣問題，索性統一走代理。

---

## 小結

這套圖床系統的核心想法很簡單：**利用 GitHub Release 存圖片，用 Cloudflare Worker 解決 CORS 問題，用 index.json 管理索引**。三者加在一起，就是一個完全免費、足夠穩定的個人圖床。

優點：

- **零成本** -- GitHub 和 Cloudflare 免費額度綽綽有餘
- **穩定** -- 倚靠 GitHub 和 Cloudflare 的基礎設施
- **輕量** -- repo 裡只有 HTML + JSON 兩個檔案
- **可控** -- 資料在自己的 GitHub 帳號，隨時可以匯出

缺點：

- **需要 GitHub Token** -- 上傳/刪除需要 Token，純瀏覽不用
- **不適合高頻使用** -- 受 GitHub API 和 Worker 的 Rate Limit 限制
- **依賴第三方** -- 雖然 GitHub 很穩，但畢竟不是自己的伺服器

對於個人部落格、技術文件、Side Project 的圖片管理來說，這是一個務實且夠用的方案。

---

## 參考資源

- [GitHub Release Assets 文件](https://docs.github.com/en/rest/releases/assets)
- [GitHub Contents API 文件](https://docs.github.com/en/rest/repos/contents)
- [Cloudflare Workers 文件](https://developers.cloudflare.com/workers/)
- [用 Cloudflare Workers 免費架設短網址服務]({% post_url 2025-12-29-cloudflare-workers-shorturl %}) -- Worker 代理的詳細架設教學
