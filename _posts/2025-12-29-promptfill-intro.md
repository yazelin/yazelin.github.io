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

> 把 Prompt 寫成範本，用 {% raw %}`{{變數}}`{% endraw %} 標記可變的部分，然後用下拉選單填空。

舉個例子，原本的 Prompt 可能是：

```
A beautiful sunset over the ocean, oil painting style,
warm colors, detailed brushstrokes, 4K resolution
```

用 PromptFill 寫成範本：

{% raw %}
```
A beautiful {{scene}} over the {{location}}, {{style}} style,
{{color_tone}} colors, {{detail_level}}, {{resolution}} resolution
```
{% endraw %}

然後你可以：
- {% raw %}`{{scene}}`{% endraw %} 選擇：sunset / sunrise / storm / rainbow
- {% raw %}`{{location}}`{% endraw %} 選擇：ocean / mountain / city / forest
- {% raw %}`{{style}}`{% endraw %} 選擇：oil painting / watercolor / digital art / anime

每個變數都有一組選項（詞庫），點一下就能切換，不用手動打字。

---

## 核心功能

### 1. 範本系統

支援建立多個範本，每個範本獨立運作：

- **編輯模式**：直接編輯文字，用 {% raw %}`{{變數名}}`{% endraw %} 標記變數
- **預覽模式**：變數會變成可點擊的下拉選單
- **副本功能**：一鍵複製範本，方便做 A/B 測試

### 2. 詞庫管理

每個變數對應一個詞庫（Bank）：

- **分類管理**：用顏色區分不同類型（人物、場景、風格...）
- **批次匯入**：一次貼上多行文字，自動拆分成選項
- **雙向同步**：在預覽時新增的選項會自動存回詞庫

### 3. 匯出分享

這是我加入的小功能，解決「範本怎麼分享給別人」的問題：

**方案一：短網址分享（線上）**

點擊分享按鈕，範本會上傳到 Cloudflare Workers 後端，產生短網址：

```
https://shorturl.yazelinj303.workers.dev/s/abc123
```

對方點擊連結就會自動跳轉到 PromptFill 並載入範本。

**方案二：SVG 圖檔分享（離線）**

下載一個精美的 SVG 分享圖，裡面嵌入了：
- 範本預覽圖（相片紙效果）
- 範本名稱與標籤
- 壓縮後的範本資料
- 自動跳轉腳本

SVG 分享圖特色：
- **1024x1024** 高解析度
- **雙版型**：依圖片比例自動切換橫式/直式
- **相片紙效果**：圓角、柔和陰影
- **標籤顯示**：最多 5 個分類標籤

用瀏覽器開啟這個 SVG，會自動跳轉到 PromptFill 並匯入範本。完全離線，不需要伺服器。

**範例 SVG 預覽：**

<div style="display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0;">
  <a href="/assets/images/promptfill/木質層疊藝術.svg" download style="text-decoration: none;">
    <img src="/assets/images/promptfill/木質層疊藝術.svg" alt="木質層疊藝術" style="width: 280px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
  </a>
  <a href="/assets/images/promptfill/窗邊書桌微縮場景.svg" download style="text-decoration: none;">
    <img src="/assets/images/promptfill/窗邊書桌微縮場景.svg" alt="窗邊書桌微縮場景" style="width: 280px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
  </a>
</div>

點擊圖片下載 SVG，用瀏覽器開啟就能體驗自動匯入功能。

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
│  │   • 範本資料  • 詞庫資料  • 使用者設定          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
              │                           │
              │ 短網址分享                 │ SVG 分享
              ▼                           ▼
┌─────────────────────┐       ┌─────────────────────┐
│  Cloudflare Workers │       │    SVG 檔案         │
│  + KV Storage       │       │  （嵌入範本資料）    │
└─────────────────────┘       └─────────────────────┘
```

---

## 我做了什麼修改

這個專案原本是 [TanShilongMario](https://github.com/TanShilongMario/PromptFill) 開發的，後來 [Will 保哥](https://github.com/doggy8088) fork 過去維護。我再從保哥那邊 fork，加了幾個功能：

### 1. 短網址分享服務

原本分享是把整個範本壓縮後放在 URL 參數裡，URL 會變得超長。我做了一個 Cloudflare Workers 後端，把範本存到 KV，只回傳短碼。

詳細技術請看：[用 Cloudflare Workers 免費架設短網址服務](/2025/12/29/cloudflare-workers-shorturl/)

### 2. SVG 圖檔分享

有時候不想依賴線上服務，我做了一個離線分享方案。生成一個精美的 SVG 分享圖：

- **相片紙效果**：預覽圖有圓角、陰影，像真的照片
- **雙版型**：依圖片比例自動選擇橫式或直式版型
- **標籤區塊**：顯示範本分類標籤（最多 5 個）
- **內嵌資料**：範本資料用 LZString 壓縮後嵌入 `<desc>` 標籤
- **自動跳轉**：用瀏覽器開啟 SVG 會執行腳本，跳轉到 PromptFill 並匯入

這個 SVG 可以直接傳給朋友、放在雲端硬碟，或是貼在論壇分享。對方用瀏覽器開啟就會自動載入範本。

### 3. GitHub Pages 自動部署

加了 GitHub Actions workflow，push 到 main 就會自動 build 並部署到 GitHub Pages。

---

## 使用情境

### AI 繪圖（主要用途）

Midjourney、Stable Diffusion、DALL-E 的 Prompt 通常有固定結構：

{% raw %}
```
{{主題}}, {{風格}}, {{光線}}, {{鏡頭}}, {{畫質}}
```
{% endraw %}

例如人物概念圖：

{% raw %}
```
{{角色類型}} character, {{服裝風格}}, {{動作姿勢}},
{{背景場景}}, {{藝術風格}}, {{渲染品質}}
```
{% endraw %}

建好範本後，每次只要點選不同組合，就能快速產出變化。想換成「賽博龐克風格的女戰士」？點幾下就好。

### AI 音樂生成

Suno、Udio 這類 AI 音樂工具也需要結構化 Prompt：

{% raw %}
```
{{曲風}}, {{情緒}}, {{節奏}}, {{樂器}}, {{人聲類型}}
```
{% endraw %}

### 批次測試

當你想測試不同風格組合的效果時，PromptFill 特別好用。建一個範本，快速切換不同變數組合，比手動改文字快很多。

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

- **範本化**：把常用的 Prompt 結構固定下來
- **選項化**：用詞庫管理可選的內容
- **視覺化**：點擊選擇，所見即所得

如果你常常在用 AI 工具，又覺得 Prompt 管理很麻煩，推薦試試看。

---

## 相關連結

- [PromptFill 線上版](https://yazelin.github.io/PromptFill/)
- [GitHub Repo（我的 fork）](https://github.com/yazelin/PromptFill)
- [短網址後端介紹](/2025/12/29/cloudflare-workers-shorturl/)
- [原作者 Repo](https://github.com/TanShilongMario/PromptFill)
