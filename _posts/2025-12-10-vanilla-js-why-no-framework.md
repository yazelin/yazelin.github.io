---
layout: post
title: "為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景"
subtitle: "無框架前端開發實戰（一）"
date: 2025-12-10
author: "yazelin"
categories: [Frontend]
tags: [JavaScript, IIFE, 前端架構, Vanilla JS]
---

![為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-10-vanilla-js-why-no-framework.png)

> **系列文章**
> 1. **為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景** ← 目前閱讀
> 2. [視窗系統（上）：讓網頁變成桌面 - 基礎拖曳功能]({% post_url 2025-12-10-window-system-part1-drag %})
> 3. [視窗系統（中）：縮放、最大化與多視窗管理]({% post_url 2025-12-10-window-system-part2-resize %})
> 4. [視窗系統（下）：Window Snap 與 Taskbar 整合]({% post_url 2025-12-10-window-system-part3-snap %})
> 5. [CSS 設計系統：一行程式碼切換全站主題]({% post_url 2025-12-10-css-design-system-theme %})

---

## 這篇文章要解決什麼問題？

**老闆**：「React 工程師離職了，專案怎麼辦？」  
**人資**：「市場上 React 人才薪水開很高，而且還要適應我們的專案...」  
**前端工程師**：「其實這個內部系統用原生 JS 就夠了。會 JavaScript 的人都能接手，不用綁定特定框架。」  
**老闆**：「這樣人才選擇更多，風險更低？」  
**前端工程師**：「對，而且少一層框架抽象，除錯更直覺，不用追著框架版本升級跑。」

「公司要開發一個內部系統，該用 React 還是 Vue？」——這個問題我被問過無數次。但很少有人問：**「我們真的需要框架嗎？」**

在開發 ChingTech OS 時，我們選擇了**純 JavaScript（Vanilla JS）**，帶來這些好處：

| 面向 | 使用框架 | 使用 Vanilla JS |
|------|----------|-----------------|
| **學習成本** | 新人需學習框架語法 | 只需懂 JS 基礎 |
| **維護週期** | 框架升級可能破壞程式碼 | 瀏覽器 API 極少破壞性更新 |
| **除錯難度** | 需理解框架內部機制 | 直接看瀏覽器錯誤訊息 |
| **專案壽命** | 框架可能被淘汰 | 原生 JS 永遠可用 |
| **打包複雜度** | 需要 Webpack/Vite 等工具 | 可直接用 `<script>` 引入 |

---

## 技術概念

### 框架解決什麼問題？

框架（React、Vue、Angular）主要解決以下問題：

1. **狀態管理**：資料變動時自動更新畫面
2. **元件化**：程式碼複用與組織
3. **路由**：單頁應用的頁面切換
4. **生態系**：現成的 UI 元件庫

### 什麼時候不需要框架？

當你的專案符合以下條件，可以考慮不用框架：

- **內部系統**：不需要 SEO，不需要複雜的首屏優化
- **使用者固定**：企業內部員工，不是公開網站
- **功能獨立**：各功能模組相對獨立，不需要複雜的狀態共享
- **團隊規模小**：2-5 人開發，溝通成本低
- **長期維護**：預計使用 5 年以上，不想被框架版本綁架

### IIFE 模組模式

**IIFE**（Immediately Invoked Function Expression，立即執行函式表達式）是一種用原生 JS 實現模組化的模式。

**白話解釋**：把程式碼包在一個函式裡，函式執行後回傳你想公開的 API，其他變數都被隱藏起來。

就像一個黑盒子：

```
       ┌─────────────────────────┐
       │      IIFE 模組          │
       │                         │
輸入 ──►│  私有變數（外面看不到）  │──► 公開 API
       │  私有函式（外面看不到）  │
       │                         │
       └─────────────────────────┘
```

---

## 跟著做：Step by Step

### 第一步：建立基礎 HTML 結構

建立 `index.html`：

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IIFE 模組範例</title>
  <style>
    body {
      font-family: sans-serif;
      padding: 20px;
      background: #1a1a1a;
      color: #f0f0f0;
    }
    .counter {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 20px 0;
    }
    button {
      padding: 8px 16px;
      background: #0891b2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #0ea5c9;
    }
    .count {
      font-size: 24px;
      min-width: 60px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>IIFE 模組範例</h1>
  <div id="app"></div>

  <!-- 載入模組 -->
  <script src="counter.js"></script>
  <script src="main.js"></script>
</body>
</html>
```

### 第二步：建立第一個 IIFE 模組

建立 `counter.js`：

```javascript
/**
 * Counter 模組
 * 展示 IIFE 模式的基本結構
 */
const Counter = (function() {
  'use strict';

  // ====== 私有變數（外部無法存取）======
  let count = 0;
  let containerElement = null;
  let countDisplay = null;

  // ====== 私有函式（外部無法存取）======

  /**
   * 更新畫面上的數字顯示
   */
  function updateDisplay() {
    if (countDisplay) {
      countDisplay.textContent = count;
    }
  }

  /**
   * 建立 UI 元素
   * @returns {HTMLElement} 容器元素
   */
  function createUI() {
    const container = document.createElement('div');
    container.className = 'counter';

    // 減少按鈕
    const decreaseBtn = document.createElement('button');
    decreaseBtn.textContent = '-';
    decreaseBtn.addEventListener('click', decrease);

    // 數字顯示
    countDisplay = document.createElement('span');
    countDisplay.className = 'count';
    countDisplay.textContent = count;

    // 增加按鈕
    const increaseBtn = document.createElement('button');
    increaseBtn.textContent = '+';
    increaseBtn.addEventListener('click', increase);

    // 組裝
    container.appendChild(decreaseBtn);
    container.appendChild(countDisplay);
    container.appendChild(increaseBtn);

    return container;
  }

  // ====== 公開函式（透過 return 暴露）======

  /**
   * 初始化模組
   * @param {string|HTMLElement} target - 目標容器
   */
  function init(target) {
    // 支援傳入選擇器字串或 DOM 元素
    containerElement = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!containerElement) {
      console.error('Counter: 找不到目標容器');
      return;
    }

    // 建立並插入 UI
    const ui = createUI();
    containerElement.appendChild(ui);
  }

  /**
   * 增加計數
   */
  function increase() {
    count++;
    updateDisplay();
  }

  /**
   * 減少計數
   */
  function decrease() {
    count--;
    updateDisplay();
  }

  /**
   * 取得目前計數值
   * @returns {number} 目前計數
   */
  function getCount() {
    return count;
  }

  /**
   * 設定計數值
   * @param {number} value - 新的計數值
   */
  function setCount(value) {
    count = value;
    updateDisplay();
  }

  // ====== 公開 API ======
  return {
    init,
    increase,
    decrease,
    getCount,
    setCount
  };
})();
```

### 第三步：使用模組

建立 `main.js`：

```javascript
/**
 * 主程式入口
 */
document.addEventListener('DOMContentLoaded', function() {
  // 初始化 Counter 模組
  Counter.init('#app');

  // 示範：外部可以呼叫公開 API
  console.log('目前計數:', Counter.getCount()); // 0

  // 示範：外部無法存取私有變數
  console.log('嘗試存取私有變數 count:', typeof count); // undefined
});
```

### 第四步：用瀏覽器開啟測試

直接用瀏覽器開啟 `index.html`，你會看到：

1. 一個可以運作的計數器
2. Console 顯示 `目前計數: 0`
3. Console 顯示 `嘗試存取私有變數 count: undefined`（證明私有變數被隱藏）

---

## 進階技巧與踩坑紀錄

### 技巧一：模組間通訊

當模組需要互相溝通時，可以透過公開 API 或事件系統：

```javascript
// 方法一：直接呼叫其他模組的公開 API
const ModuleA = (function() {
  function doSomething() {
    // 呼叫 ModuleB 的公開方法
    ModuleB.handleData({ source: 'ModuleA' });
  }
  return { doSomething };
})();

// 方法二：使用自訂事件（更鬆耦合）
const ModuleB = (function() {
  function init() {
    // 監聽自訂事件
    document.addEventListener('app:dataReady', handleDataReady);
  }

  function handleDataReady(event) {
    console.log('收到資料:', event.detail);
  }

  return { init };
})();

// 發送事件
document.dispatchEvent(new CustomEvent('app:dataReady', {
  detail: { message: 'Hello' }
}));
```

### 技巧二：確保載入順序

模組間有依賴關係時，載入順序很重要：

```html
<!-- 基礎工具模組先載入 -->
<script src="js/utils.js"></script>

<!-- 核心模組 -->
<script src="js/api-client.js"></script>
<script src="js/notification.js"></script>

<!-- 依賴上述模組的應用程式模組 -->
<script src="js/counter.js"></script>

<!-- 最後載入主程式 -->
<script src="js/main.js"></script>
```

### 技巧三：避免全域命名污染

使用命名空間來組織多個模組：

```javascript
// 建立命名空間
window.MyApp = window.MyApp || {};

// 模組掛在命名空間下
MyApp.Counter = (function() {
  // ...
  return { init, increase, decrease };
})();

MyApp.Theme = (function() {
  // ...
  return { toggle, getCurrent };
})();

// 使用時
MyApp.Counter.init('#app');
MyApp.Theme.toggle();
```

### 踩坑紀錄

**坑 1：忘記 `use strict`**

```javascript
// 沒有 use strict，可能意外建立全域變數
const BadModule = (function() {
  function doSomething() {
    data = 'oops'; // 沒有 var/let/const，變成全域變數！
  }
  return { doSomething };
})();

// 正確做法
const GoodModule = (function() {
  'use strict'; // 加上這行，上述錯誤會直接報錯

  function doSomething() {
    let data = 'safe'; // 必須宣告
  }
  return { doSomething };
})();
```

**坑 2：this 指向問題**

```javascript
const Module = (function() {
  'use strict';

  function handleClick() {
    console.log(this); // 在 strict mode 下是 undefined，不是 window！
  }

  // 解決方法：不依賴 this，直接用閉包存取變數
  let state = {};

  function handleClick() {
    console.log(state); // 透過閉包存取，穩定可靠
  }

  return { handleClick };
})();
```

**坑 3：非同步初始化的時機**

```javascript
const AsyncModule = (function() {
  'use strict';

  let isReady = false;

  async function init() {
    const data = await fetch('/api/config').then(r => r.json());
    // 處理資料...
    isReady = true;
  }

  function doSomething() {
    if (!isReady) {
      console.warn('模組尚未初始化完成');
      return;
    }
    // 實際邏輯...
  }

  return { init, doSomething };
})();

// 使用時要注意等待初始化完成
async function main() {
  await AsyncModule.init();
  AsyncModule.doSomething(); // 現在可以安全呼叫
}
```

---

## 小結

### 重點整理

1. **IIFE 模式**讓你用原生 JS 實現模組化，不需要打包工具
2. **私有變數**在函式作用域內，外部無法存取
3. **公開 API** 透過 `return` 物件暴露
4. **載入順序**很重要，被依賴的模組要先載入

### 什麼時候選擇 Vanilla JS？

✅ 適合：內部系統、長期維護專案、小團隊、功能相對獨立的應用

❌ 不適合：複雜狀態管理、需要 SSR/SSG、大量表單驗證、團隊已熟悉特定框架

### 下一篇預告

下一篇我們將實作**視窗系統的拖曳功能**，讓網頁變成可以拖曳視窗的桌面環境。你會學到：

- DOM 事件處理的三部曲（mousedown → mousemove → mouseup）
- 如何計算拖曳偏移量
- 防止視窗拖出畫面的技巧

---

## 完整程式碼

完整的範例程式碼可以在這裡取得：

**counter.js（完整版）**

```javascript
/**
 * Counter 模組 - 完整範例
 * 展示 IIFE 模式的最佳實踐
 */
const Counter = (function() {
  'use strict';

  // 私有變數
  let count = 0;
  let containerElement = null;
  let countDisplay = null;
  let options = {
    min: -Infinity,
    max: Infinity,
    step: 1,
    onChange: null
  };

  // 私有函式
  function updateDisplay() {
    if (countDisplay) {
      countDisplay.textContent = count;
    }
    // 觸發 onChange callback
    if (typeof options.onChange === 'function') {
      options.onChange(count);
    }
  }

  function clamp(value) {
    return Math.max(options.min, Math.min(options.max, value));
  }

  function createUI() {
    const container = document.createElement('div');
    container.className = 'counter';

    const decreaseBtn = document.createElement('button');
    decreaseBtn.textContent = '-';
    decreaseBtn.addEventListener('click', decrease);

    countDisplay = document.createElement('span');
    countDisplay.className = 'count';
    countDisplay.textContent = count;

    const increaseBtn = document.createElement('button');
    increaseBtn.textContent = '+';
    increaseBtn.addEventListener('click', increase);

    container.appendChild(decreaseBtn);
    container.appendChild(countDisplay);
    container.appendChild(increaseBtn);

    return container;
  }

  // 公開函式
  function init(target, userOptions = {}) {
    containerElement = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!containerElement) {
      console.error('Counter: 找不到目標容器');
      return false;
    }

    // 合併選項
    options = { ...options, ...userOptions };

    // 初始值處理
    if (typeof userOptions.initialValue === 'number') {
      count = clamp(userOptions.initialValue);
    }

    const ui = createUI();
    containerElement.appendChild(ui);
    return true;
  }

  function increase() {
    count = clamp(count + options.step);
    updateDisplay();
  }

  function decrease() {
    count = clamp(count - options.step);
    updateDisplay();
  }

  function getCount() {
    return count;
  }

  function setCount(value) {
    count = clamp(value);
    updateDisplay();
  }

  function destroy() {
    if (containerElement) {
      containerElement.innerHTML = '';
    }
    count = 0;
    containerElement = null;
    countDisplay = null;
  }

  // 公開 API
  return {
    init,
    increase,
    decrease,
    getCount,
    setCount,
    destroy
  };
})();
```

**使用範例**

```javascript
document.addEventListener('DOMContentLoaded', function() {
  // 基本使用
  Counter.init('#app');

  // 進階使用：帶選項
  Counter.init('#app', {
    initialValue: 10,
    min: 0,
    max: 100,
    step: 5,
    onChange: function(newValue) {
      console.log('計數變更為:', newValue);
    }
  });
});
```
