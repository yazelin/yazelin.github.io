---
layout: post
title: "PromptFill - 用填空的方式寫 AI Prompt"
subtitle: "結構化提示詞產生工具，讓複雜的 Prompt 變得像填表格一樣簡單"
tags: [AI, Prompt, React, 工具推薦, 開源]
date: 2025-12-29
categories: [AI, 工具]
---

## 寫 AI Prompt 的痛點

用 ChatGPT、Midjourney、Stable Diffusion 這些 AI 工具時，常常會遇到：

- **Prompt 太長記不住**：一個好用的繪圖 Prompt 可能有幾百字，每次都要翻筆記
- **修改很麻煩**：想換個風格、換個角色，要在一大串文字裡找到對的位置改
- **難以複用**：同一個 Prompt 結構想套用不同內容，只能手動複製貼上改

[PromptFill](https://yazelin.github.io/PromptFill/) 就是為了解決這些問題而生的工具。

---

## PromptFill 是什麼？

PromptFill 是一個**結構化提示詞產生工具**，核心概念很簡單：

> 把 Prompt 寫成模板，用 `{{變數}}` 標記可變的部分，然後用下拉選單填空。

舉個例子，原本的 Prompt 可能是：

```
A beautiful sunset over the ocean, oil painting style,
warm colors, detailed brushstrokes, 4K resolution
```

用 PromptFill 寫成模板：

```
A beautiful {{scene}} over the {{location}}, {{style}} style,
{{color_tone}} colors, {{detail_level}}, {{resolution}} resolution
```

然後你可以：
- `{{scene}}` 選擇：sunset / sunrise / storm / rainbow
- `{{location}}` 選擇：ocean / mountain / city / forest
- `{{style}}` 選擇：oil painting / watercolor / digital art / anime

每個變數都有一組選項（詞庫），點一下就能切換，不用手動打字。

---

## 核心功能

### 1. 模板系統

支援建立多個模板，每個模板獨立運作：

- **編輯模式**：直接編輯文字，用 `{{變數名}}` 標記變數
- **預覽模式**：變數會變成可點擊的下拉選單
- **副本功能**：一鍵複製模板，方便做 A/B 測試

### 2. 詞庫管理

每個變數對應一個詞庫（Bank）：

- **分類管理**：用顏色區分不同類型（人物、場景、風格...）
- **批次匯入**：一次貼上多行文字，自動拆分成選項
- **雙向同步**：在預覽時新增的選項會自動存回詞庫

### 3. 匯出分享

這是我加入的小功能，解決「模板怎麼分享給別人」的問題：

**方案一：短網址分享（線上）**

點擊分享按鈕，模板會上傳到 Cloudflare Workers 後端，產生短網址：

```
https://shorturl.yazelinj303.workers.dev/s/abc123
```

對方點擊連結就會自動跳轉到 PromptFill 並載入模板。

**方案二：SVG 圖檔分享（離線）**

下載一個 SVG 檔案，裡面嵌入了：
- 模板預覽圖
- 壓縮後的模板資料
- 自動跳轉腳本

用瀏覽器開啟這個 SVG，會自動跳轉到 PromptFill 並匯入模板。完全離線，不需要伺服器。

### 4. 其他功能

- **儲存長圖**：把填好的 Prompt 匯出成精美圖片，方便分享到社群
- **本地儲存**：資料存在瀏覽器 LocalStorage 或本機資料夾，不用註冊登入
- **多語系**：支援繁體中文、英文

---

## 技術架構

```
┌─────────────────────────────────────────────────────────┐
│                     PromptFill                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   React     │  │  Tailwind   │  │    Vite     │     │
│  │   18.x      │  │    CSS      │  │    5.x      │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              LocalStorage                        │   │
│  │   • 模板資料  • 詞庫資料  • 使用者設定          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
              │                           │
              │ 短網址分享                 │ SVG 分享
              ▼                           ▼
┌─────────────────────┐       ┌─────────────────────┐
│  Cloudflare Workers │       │    SVG 檔案         │
│  + KV Storage       │       │  （嵌入模板資料）    │
└─────────────────────┘       └─────────────────────┘
```

---

## 我做了什麼修改

這個專案原本是 [TanShilongMario](https://github.com/TanShilongMario/PromptFill) 開發的，後來 [Will 保哥](https://github.com/doggy8088) fork 過去維護。我再從保哥那邊 fork，加了幾個功能：

### 1. 短網址分享服務

原本分享是把整個模板壓縮後放在 URL 參數裡，URL 會變得超長。我做了一個 Cloudflare Workers 後端，把模板存到 KV，只回傳短碼。

詳細技術請看：[用 Cloudflare Workers 免費架設短網址服務](/2025/12/29/cloudflare-workers-shorturl/)

### 2. SVG 圖檔分享

有時候不想依賴線上服務，我做了一個離線分享方案：

```javascript
// 生成 SVG，把模板資料嵌入 <desc> 標籤
const svg = `
<svg ...>
  <!-- 預覽圖 -->
  <image href="${previewImage}" />

  <!-- 模板名稱 -->
  <text>${templateName}</text>

  <!-- 隱藏的模板資料（LZString 壓縮） -->
  <desc id="promptfill-data">${compressedData}</desc>

  <!-- 自動跳轉腳本 -->
  <script>
    // 讀取資料，跳轉到 PromptFill
    window.location.href = 'https://yazelin.github.io/PromptFill/#svg=' + data;
  </script>
</svg>
`;
```

用瀏覽器開啟 SVG 檔案時，腳本會自動執行並跳轉。

### 3. GitHub Pages 自動部署

加了 GitHub Actions workflow，push 到 main 就會自動 build 並部署到 GitHub Pages。

---

## 使用情境

### AI 繪圖（主要用途）

Midjourney、Stable Diffusion、DALL-E 的 Prompt 通常有固定結構：

```
{{主題}}, {{風格}}, {{光線}}, {{鏡頭}}, {{畫質}}
```

例如人物概念圖：

```
{{角色類型}} character, {{服裝風格}}, {{動作姿勢}},
{{背景場景}}, {{藝術風格}}, {{渲染品質}}
```

建好模板後，每次只要點選不同組合，就能快速產出變化。想換成「賽博龐克風格的女戰士」？點幾下就好。

### AI 音樂生成

Suno、Udio 這類 AI 音樂工具也需要結構化 Prompt：

```
{{曲風}}, {{情緒}}, {{節奏}}, {{樂器}}, {{人聲類型}}
```

### 批次測試

當你想測試不同風格組合的效果時，PromptFill 特別好用。建一個模板，快速切換不同變數組合，比手動改文字快很多。

---

## 快速開始

### 線上使用

直接訪問：[https://yazelin.github.io/PromptFill/](https://yazelin.github.io/PromptFill/)

### 本機運行

```bash
git clone https://github.com/yazelin/PromptFill.git
cd PromptFill
npm install
npm run dev
```

> **注意**：本機運行時，短網址分享功能無法使用（後端有 Origin 白名單限制）。如需此功能，請自行部署短網址服務並修改 `src/App.jsx` 中的 `SHORTURL_API` 設定。離線 SVG 分享功能不受影響。

---

## 總結

PromptFill 把「寫 Prompt」變成「填表格」：

- **模板化**：把常用的 Prompt 結構固定下來
- **選項化**：用詞庫管理可選的內容
- **視覺化**：點擊選擇，所見即所得

如果你常常在用 AI 工具，又覺得 Prompt 管理很麻煩，推薦試試看。

---

## 相關連結

- [PromptFill 線上版](https://yazelin.github.io/PromptFill/)
- [GitHub Repo（我的 fork）](https://github.com/yazelin/PromptFill)
- [短網址後端介紹](/2025/12/29/cloudflare-workers-shorturl/)
- [原作者 Repo](https://github.com/TanShilongMario/PromptFill)
