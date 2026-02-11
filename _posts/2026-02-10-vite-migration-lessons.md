---
layout: post
title: "Vite 遷移踩坑記 — IIFE 不是 ES Module"
subtitle: "從 30+ IIFE 腳本到 Vite：策略、陷阱與修復"
date: 2026-02-10
categories: [前端開發]
tags: [Vite, JavaScript, IIFE, ES Module, 前端, 踩坑記]
---

![配圖](/images/2026-02-10-vite-migration.png)


## 前言

ChingTech OS 的前端是一個典型的「有機成長」專案 — 沒有框架、沒有 bundler，30 多個 IIFE（Immediately Invoked Function Expression）腳本用 `<script>` 標籤按順序載入。每個檔案把自己的功能掛在 `window` 上，下一個檔案再從 `window` 取用。

這套做法在小規模時沒問題，但當檔案超過 30 個，載入順序管理變成噩夢。於是我們決定引入 Vite，把這些腳本逐步遷移到 ES Module。結果踩了一個大坑。

---

## 問題分析

### 遷移策略：entry-compat.js

遷移的核心想法是建立一個入口檔案 `entry-compat.js`，用 side-effect import 保留原本的載入順序：

```javascript
// entry-compat.js — 用 import 取代 <script> 標籤
import './src/utils/helpers.js';
import './src/ui/sidebar.js';
import './src/ui/modal.js';
import './src/features/skillhub.js';
import './src/features/nas-browser.js';
// ... 30+ imports
```

開發階段用 `vite dev` 一切正常 — Vite dev server 會攔截這些 import，做 HMR（Hot Module Replacement）。

### 問題爆發：Production 沒有 Vite Dev Server

部署到 production 時，`index.html` 裡寫的是：

```html
<script type="module" src="/src/main.js"></script>
```

但 production 環境沒有 Vite dev server！瀏覽器直接向後端請求 `/src/main.js`，拿到的是原始碼而不是 bundled 後的產物。

更致命的是：**IIFE 腳本不是 ES Module**。這些腳本的寫法是：

```javascript
// src/features/skillhub.js（IIFE 風格）
(function() {
    const SkillHub = {
        init() { /* ... */ },
        search(query) { /* ... */ },
    };
    // 掛到 window 上讓其他檔案使用
    window.SkillHub = SkillHub;
})();
```

當 Vite dev server 處理這些檔案時，它會做一些轉換讓 IIFE 的 `window` 賦值正常運作。但瀏覽器原生的 ES Module 載入不會做這些事 — `type="module"` 的腳本在嚴格模式下執行，且每個 module 有自己的 scope，IIFE 裡的全域變數行為可能和預期不同。

### 雪上加霜：dist/ 目錄不存在

因為 CI/CD 流程裡沒有加上 `npm run build`，`dist/` 目錄根本不存在。也就是說：

- `dist/bundle.js` — 不存在
- `dist/bundle.css` — 不存在
- 所有前端資源都是 raw source code

使用者看到的是一片空白或各種 `import` 語法錯誤。

---

## 解決方案

### 緊急修復：還原 script 標籤

第一步是止血 — 把 `index.html` 改回傳統的 `<script>` 標籤載入方式：

```html
<!-- 還原為傳統載入，Vite entry 保留但註解掉 -->
<!-- <script type="module" src="/src/main.js"></script> -->

<script src="/static/js/utils/helpers.js"></script>
<script src="/static/js/ui/sidebar.js"></script>
<script src="/static/js/ui/modal.js"></script>
<!-- ... -->
```

Vite 的 `entry-compat.js` 保留在 codebase 中但不啟用，等到完整的 build pipeline 建立後再切換。

### Yaze 的後續修復：loadScript 路徑正規化

還原 script 標籤後，還有一個問題：部分腳本是動態載入的，路徑處理不一致導致重複載入或 404：

```javascript
// utils/loadScript.js — 修正版

function loadScript(src) {
    // 路徑正規化：移除開頭的 / 或 ./ ，統一格式
    const normalized = src.replace(/^\.?\//, '');
    
    // 檢查是否已載入（避免重複）
    if (document.querySelector(`script[src*="${normalized}"]`)) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `/${normalized}`;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// 掛到 window 上供全域使用
window.loadScript = loadScript;
```

關鍵是 `normalized` 那一行 — 不管傳入 `/static/js/foo.js`、`./static/js/foo.js` 還是 `static/js/foo.js`，都會被正規化成統一格式，避免 `querySelector` 比對失敗導致重複載入。

---

## 學到什麼

### 1. 半成品遷移比不遷移更危險

遷移到一半的狀態最糟糕：開發環境正常（有 Vite dev server），production 壞掉（沒有 build 產物）。這種「在我的機器上是好的」陷阱特別難除錯。

### 2. IIFE 和 ES Module 是兩個世界

| 特性 | IIFE | ES Module |
|------|------|-----------|
| Scope | 函式 scope，靠 `window` 共享 | Module scope，靠 `export/import` 共享 |
| 嚴格模式 | 可選 | 強制 |
| 載入順序 | `<script>` 順序保證 | `import` 靜態分析，非同步載入 |
| 全域變數 | 自由存取 `window` | 需要明確 `window.xxx = ...` |

不能假設 IIFE 腳本加個 `import` 就變成 ES Module 了。

### 3. 正確的遷移路徑

要嘛全做，要嘛不做：

- **全做**：設定完整的 Vite build pipeline → CI/CD 加上 `npm run build` → `index.html` 引用 `dist/` 產物 → 逐步把 IIFE 改寫為 ES Module
- **不做**：維持 `<script>` 標籤載入，把精力放在其他更有價值的事上

我們最終選擇了「暫時不做」— 先還原穩定狀態，等前端需求明確後再規劃完整遷移。

### 4. 動態載入需要路徑正規化

`loadScript` 的路徑不一致問題很容易被忽略，因為大部分情況下瀏覽器會自動補正。但在做重複載入檢查時，路徑格式必須統一，否則同一個檔案可能被載入兩次。

---

## 參考資源

- [Vite — Backend Integration](https://vite.dev/guide/backend-integration)
- [MDN — JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [IIFE — MDN](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
