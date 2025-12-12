---
layout: post
title: "視窗系統（上）：讓網頁變成桌面 - 基礎拖曳功能"
subtitle: "無框架前端開發實戰（二）"
date: 2025-12-10
author: "yazelin"
categories: [Frontend]
tags: [JavaScript, DOM, 視窗系統, 拖曳]
---

> **系列文章**
> 1. [為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景]({% post_url 2025-12-10-vanilla-js-why-no-framework %})
> 2. **視窗系統（上）：讓網頁變成桌面 - 基礎拖曳功能** ← 目前閱讀
> 3. [視窗系統（中）：縮放、最大化與多視窗管理]({% post_url 2025-12-10-window-system-part2-resize %})
> 4. [視窗系統（下）：Window Snap 與 Taskbar 整合]({% post_url 2025-12-10-window-system-part3-snap %})
> 5. [CSS 設計系統：一行程式碼切換全站主題]({% post_url 2025-12-10-css-design-system-theme %})

---

## 這篇文章要解決什麼問題？

**業務**：「我要對照訂單和庫存，每次都要切來切去兩個頁面，好麻煩！」

**老闆**：「這樣作業效率很差，有沒有辦法像 Windows 一樣並排顯示？」

**前端工程師**：「可以做成多視窗介面，訂單和庫存同時開著，還能自由拖曳排列。」

**業務**：「這樣我一眼就能對照，不用一直切換了！」

傳統網頁是「一頁一功能」的設計，使用者在不同功能間切換時需要不斷跳轉頁面。我們在 ChingTech OS 中實現的「Web 桌面系統」，讓使用者可以：

- 同時開啟檔案管理器、終端機、AI 助手
- 自由拖曳視窗到想要的位置
- 調整視窗大小、最小化、最大化
- 像使用真正的桌面系統一樣工作

---

## 技術概念

### 拖曳的本質是什麼？

拖曳看起來很神奇，但本質上只是三個步驟：

```
1. 按下滑鼠（mousedown）→ 記錄起始位置
2. 移動滑鼠（mousemove）→ 計算位移，更新元素位置
3. 放開滑鼠（mouseup）    → 結束拖曳狀態
```

用生活比喻：就像你拿起一本書（按下）、移動它（移動）、然後放下（放開）。

### 視窗的 DOM 結構

一個視窗由幾個部分組成：

```
┌─────────────────────────────────────┐
│  標題列（Titlebar）- 可拖曳區域      │
│  [圖示] [標題]           [_][□][X]  │
├─────────────────────────────────────┤
│                                     │
│                                     │
│        內容區（Content）             │
│                                     │
│                                     │
└─────────────────────────────────────┘
```

### 座標系統

理解座標系統是實現拖曳的關鍵：

```
瀏覽器視窗
┌────────────────────────────────────────┐
│ (0,0)                                  │
│    ↓                                   │
│    ┌──────────────┐                    │
│    │    視窗      │                    │
│    │              │                    │
│    │   ● 滑鼠位置 │                    │
│    │     (clientX, clientY)            │
│    └──────────────┘                    │
│         ↑                              │
│    (left, top) 視窗左上角位置          │
└────────────────────────────────────────┘
```

- `e.clientX`, `e.clientY`：滑鼠相對於瀏覽器視窗的位置
- `element.offsetLeft`, `element.offsetTop`：元素相對於父元素的位置
- `element.getBoundingClientRect()`：取得元素的完整位置資訊

---

## 跟著做：Step by Step

### 第一步：建立 HTML 結構

建立 `index.html`：

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>視窗拖曳範例</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- 桌面區域 -->
  <div class="desktop">
    <!-- 視窗將動態建立在這裡 -->
  </div>

  <!-- 建立視窗的按鈕 -->
  <button id="create-window-btn">建立新視窗</button>

  <script src="window.js"></script>
  <script src="main.js"></script>
</body>
</html>
```

### 第二步：建立基礎 CSS

建立 `style.css`：

```css
/* 重置與基礎樣式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1a1a2e;
  min-height: 100vh;
  overflow: hidden;
}

/* 桌面區域 */
.desktop {
  position: relative;
  width: 100vw;
  height: 100vh;
}

/* 視窗容器 */
.window {
  position: absolute;
  background: #252535;
  border: 1px solid #3a3a4a;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  min-width: 300px;
  min-height: 200px;
}

/* 聚焦狀態 */
.window.focused {
  border-color: #0891b2;
  box-shadow: 0 0 0 1px #0891b2, 0 10px 40px rgba(0, 0, 0, 0.5);
}

/* 拖曳中狀態 */
.window.dragging {
  opacity: 0.9;
  cursor: grabbing;
}

/* 標題列 */
.window-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  background: #1e1e2e;
  border-bottom: 1px solid #3a3a4a;
  cursor: grab;
  user-select: none;
}

.window.dragging .window-titlebar {
  cursor: grabbing;
}

.window-title {
  font-size: 14px;
  font-weight: 500;
  color: #e0e0e0;
}

/* 視窗按鈕 */
.window-buttons {
  display: flex;
  gap: 8px;
}

.window-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.window-btn-close { background: #ff5f57; }
.window-btn-minimize { background: #ffbd2e; }
.window-btn-maximize { background: #28ca42; }

/* 內容區 */
.window-content {
  padding: 16px;
  color: #b0b0b0;
  height: calc(100% - 40px);
  overflow: auto;
}

/* 建立按鈕 */
#create-window-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 12px 24px;
  background: #0891b2;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  z-index: 1000;
}

#create-window-btn:hover {
  background: #0ea5c9;
}
```

### 第三步：實作視窗模組

建立 `window.js`：

```javascript
/**
 * WindowManager - 視窗管理模組
 * 處理視窗的建立、拖曳、聚焦
 */
const WindowManager = (function() {
  'use strict';

  // ====== 私有變數 ======

  // 儲存所有視窗資訊
  let windows = {};

  // 視窗 ID 計數器
  let windowIdCounter = 0;

  // 視窗堆疊順序（用於 z-index 管理）
  let windowOrder = [];

  // 基礎 z-index
  const BASE_Z_INDEX = 100;

  // 拖曳狀態
  let dragState = {
    isDragging: false,    // 是否正在拖曳
    windowId: null,       // 正在拖曳的視窗 ID
    offsetX: 0,           // 滑鼠相對於視窗左上角的 X 偏移
    offsetY: 0            // 滑鼠相對於視窗左上角的 Y 偏移
  };

  // ====== 私有函式 ======

  /**
   * 產生唯一的視窗 ID
   */
  function generateWindowId() {
    return `window-${++windowIdCounter}`;
  }

  /**
   * 更新所有視窗的 z-index
   * windowOrder 陣列的順序決定堆疊順序
   */
  function updateZIndices() {
    windowOrder.forEach((windowId, index) => {
      const windowInfo = windows[windowId];
      if (windowInfo) {
        windowInfo.element.style.zIndex = BASE_Z_INDEX + index;
      }
    });
  }

  /**
   * 開始拖曳
   * @param {string} windowId - 視窗 ID
   * @param {MouseEvent} e - 滑鼠事件
   */
  function startDrag(windowId, e) {
    const windowInfo = windows[windowId];
    if (!windowInfo) return;

    const windowEl = windowInfo.element;
    const rect = windowEl.getBoundingClientRect();

    // 記錄拖曳狀態
    dragState = {
      isDragging: true,
      windowId: windowId,
      // 計算滑鼠相對於視窗左上角的偏移
      // 這樣拖曳時視窗不會跳到滑鼠位置
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };

    // 加上拖曳中的 CSS class
    windowEl.classList.add('dragging');

    // 防止拖曳時選取文字
    document.body.style.userSelect = 'none';
  }

  /**
   * 處理滑鼠移動（拖曳中）
   * @param {MouseEvent} e - 滑鼠事件
   */
  function handleMouseMove(e) {
    // 如果沒有在拖曳，直接返回
    if (!dragState.isDragging) return;

    const windowInfo = windows[dragState.windowId];
    if (!windowInfo) return;

    const windowEl = windowInfo.element;
    const desktop = document.querySelector('.desktop');
    const desktopRect = desktop.getBoundingClientRect();

    // 計算新位置
    // 新位置 = 滑鼠位置 - 偏移量
    let newX = e.clientX - dragState.offsetX;
    let newY = e.clientY - dragState.offsetY;

    // 限制視窗不要拖出桌面範圍
    const windowWidth = windowEl.offsetWidth;
    const windowHeight = windowEl.offsetHeight;

    // 左邊界
    newX = Math.max(0, newX);
    // 右邊界
    newX = Math.min(newX, desktopRect.width - windowWidth);
    // 上邊界
    newY = Math.max(0, newY);
    // 下邊界
    newY = Math.min(newY, desktopRect.height - windowHeight);

    // 更新視窗位置
    windowEl.style.left = `${newX}px`;
    windowEl.style.top = `${newY}px`;
  }

  /**
   * 結束拖曳
   */
  function handleMouseUp() {
    if (!dragState.isDragging) return;

    const windowInfo = windows[dragState.windowId];
    if (windowInfo) {
      windowInfo.element.classList.remove('dragging');
    }

    // 重置拖曳狀態
    dragState.isDragging = false;
    dragState.windowId = null;

    // 恢復文字選取
    document.body.style.userSelect = '';
  }

  /**
   * 綁定視窗事件
   * @param {string} windowId - 視窗 ID
   */
  function bindWindowEvents(windowId) {
    const windowInfo = windows[windowId];
    if (!windowInfo) return;

    const windowEl = windowInfo.element;
    const titlebar = windowEl.querySelector('.window-titlebar');
    const closeBtn = windowEl.querySelector('.window-btn-close');

    // 點擊視窗任何地方都聚焦
    windowEl.addEventListener('mousedown', () => {
      focusWindow(windowId);
    });

    // 在標題列上按下滑鼠開始拖曳
    titlebar.addEventListener('mousedown', (e) => {
      // 如果點擊的是按鈕，不要開始拖曳
      if (e.target.closest('.window-btn')) return;
      startDrag(windowId, e);
    });

    // 關閉按鈕
    closeBtn.addEventListener('click', () => {
      closeWindow(windowId);
    });
  }

  // ====== 公開函式 ======

  /**
   * 建立新視窗
   * @param {Object} options - 視窗選項
   * @returns {string} 視窗 ID
   */
  function createWindow(options = {}) {
    const {
      title = '新視窗',
      width = 400,
      height = 300,
      content = '視窗內容'
    } = options;

    const windowId = generateWindowId();
    const desktop = document.querySelector('.desktop');
    if (!desktop) return null;

    // 計算初始位置（置中，加上一點隨機偏移避免重疊）
    const desktopRect = desktop.getBoundingClientRect();
    const randomOffset = windowIdCounter * 30;
    const x = Math.max(20, (desktopRect.width - width) / 2 + randomOffset);
    const y = Math.max(20, (desktopRect.height - height) / 2 + randomOffset);

    // 建立視窗 DOM
    const windowEl = document.createElement('div');
    windowEl.className = 'window';
    windowEl.id = windowId;
    windowEl.style.width = `${width}px`;
    windowEl.style.height = `${height}px`;
    windowEl.style.left = `${x}px`;
    windowEl.style.top = `${y}px`;

    windowEl.innerHTML = `
      <div class="window-titlebar">
        <span class="window-title">${title}</span>
        <div class="window-buttons">
          <button class="window-btn window-btn-minimize"></button>
          <button class="window-btn window-btn-maximize"></button>
          <button class="window-btn window-btn-close"></button>
        </div>
      </div>
      <div class="window-content">${content}</div>
    `;

    // 加入 DOM
    desktop.appendChild(windowEl);

    // 儲存視窗資訊
    windows[windowId] = {
      element: windowEl,
      title: title
    };

    // 更新堆疊順序
    windowOrder.push(windowId);
    updateZIndices();

    // 綁定事件
    bindWindowEvents(windowId);

    // 聚焦新視窗
    focusWindow(windowId);

    return windowId;
  }

  /**
   * 聚焦視窗（帶到最前面）
   * @param {string} windowId - 視窗 ID
   */
  function focusWindow(windowId) {
    if (!windows[windowId]) return;

    // 從堆疊順序中移除
    const index = windowOrder.indexOf(windowId);
    if (index > -1) {
      windowOrder.splice(index, 1);
    }

    // 加到最上面
    windowOrder.push(windowId);
    updateZIndices();

    // 更新 focused 狀態
    Object.keys(windows).forEach(id => {
      windows[id].element.classList.toggle('focused', id === windowId);
    });
  }

  /**
   * 關閉視窗
   * @param {string} windowId - 視窗 ID
   */
  function closeWindow(windowId) {
    const windowInfo = windows[windowId];
    if (!windowInfo) return;

    // 從 DOM 移除
    windowInfo.element.remove();

    // 從狀態中移除
    delete windows[windowId];
    const index = windowOrder.indexOf(windowId);
    if (index > -1) {
      windowOrder.splice(index, 1);
    }
  }

  /**
   * 初始化
   */
  function init() {
    // 在 document 層級監聽滑鼠事件
    // 這樣即使滑鼠移出視窗，拖曳也能繼續
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // 公開 API
  return {
    init,
    createWindow,
    focusWindow,
    closeWindow
  };
})();
```

### 第四步：主程式

建立 `main.js`：

```javascript
/**
 * 主程式入口
 */
document.addEventListener('DOMContentLoaded', function() {
  // 初始化視窗管理器
  WindowManager.init();

  // 綁定建立視窗按鈕
  const createBtn = document.getElementById('create-window-btn');
  createBtn.addEventListener('click', function() {
    WindowManager.createWindow({
      title: '新視窗 #' + Date.now(),
      width: 400,
      height: 300,
      content: '<p>這是一個可拖曳的視窗！</p><p>試試拖曳標題列來移動它。</p>'
    });
  });

  // 建立一個初始視窗
  WindowManager.createWindow({
    title: '歡迎',
    width: 450,
    height: 250,
    content: `
      <h3>視窗拖曳範例</h3>
      <p>你可以：</p>
      <ul>
        <li>拖曳標題列移動視窗</li>
        <li>點擊視窗使其聚焦（移到最前面）</li>
        <li>點擊紅色按鈕關閉視窗</li>
        <li>點擊右下角按鈕建立新視窗</li>
      </ul>
    `
  });
});
```

### 第五步：測試

用瀏覽器開啟 `index.html`，你應該能看到：

1. 一個視窗出現在畫面中央
2. 拖曳標題列可以移動視窗
3. 視窗不會被拖出畫面外
4. 點擊「建立新視窗」可以建立更多視窗
5. 點擊視窗會讓它跑到最前面
6. 點擊紅色按鈕可以關閉視窗

---

## 進階技巧與踩坑紀錄

### 技巧一：為什麼要在 document 層級監聽 mousemove？

```javascript
// 錯誤做法：在視窗上監聽
windowEl.addEventListener('mousemove', handleMouseMove);
// 問題：滑鼠移出視窗範圍，拖曳就中斷了

// 正確做法：在 document 層級監聯
document.addEventListener('mousemove', handleMouseMove);
// 優點：即使滑鼠移出視窗，拖曳仍然繼續
```

### 技巧二：使用 requestAnimationFrame 優化效能

當拖曳頻繁更新位置時，可以用 `requestAnimationFrame` 減少重繪次數：

```javascript
let rafId = null;

function handleMouseMove(e) {
  if (!dragState.isDragging) return;

  // 取消上一個待處理的更新
  if (rafId) {
    cancelAnimationFrame(rafId);
  }

  // 排程在下一個畫面更新
  rafId = requestAnimationFrame(() => {
    updateWindowPosition(e.clientX, e.clientY);
    rafId = null;
  });
}
```

### 技巧三：防止文字選取

拖曳時如果不小心選取到文字會很煩：

```javascript
// 開始拖曳時禁用選取
document.body.style.userSelect = 'none';

// 結束拖曳時恢復
document.body.style.userSelect = '';
```

### 踩坑紀錄

**坑 1：偏移量計算錯誤**

```javascript
// 錯誤：直接用滑鼠位置設定視窗位置
windowEl.style.left = `${e.clientX}px`;
windowEl.style.top = `${e.clientY}px`;
// 結果：視窗會跳到滑鼠位置，非常突兀

// 正確：計算滑鼠相對於視窗的偏移
const rect = windowEl.getBoundingClientRect();
dragState.offsetX = e.clientX - rect.left;
dragState.offsetY = e.clientY - rect.top;

// 移動時減掉偏移
windowEl.style.left = `${e.clientX - dragState.offsetX}px`;
```

**坑 2：z-index 管理混亂**

```javascript
// 錯誤：每次都設定一個很大的 z-index
windowEl.style.zIndex = 99999;
// 問題：數字會無限增長，而且難以管理

// 正確：維護一個順序陣列，根據順序設定 z-index
windowOrder.push(windowId);
windowOrder.forEach((id, index) => {
  windows[id].element.style.zIndex = 100 + index;
});
```

**坑 3：忘記處理按鈕點擊**

```javascript
titlebar.addEventListener('mousedown', (e) => {
  // 錯誤：沒有排除按鈕
  startDrag(windowId, e);
});

// 正確：檢查點擊目標
titlebar.addEventListener('mousedown', (e) => {
  if (e.target.closest('.window-btn')) return; // 排除按鈕
  startDrag(windowId, e);
});
```

---

## 小結

### 重點整理

1. **拖曳三部曲**：mousedown 記錄起點 → mousemove 更新位置 → mouseup 結束
2. **偏移量計算**：記錄滑鼠相對於元素的偏移，避免視窗跳動
3. **在 document 監聽**：確保滑鼠移出元素後拖曳仍能繼續
4. **z-index 管理**：用陣列維護堆疊順序，聚焦時移到陣列末端

### 下一篇預告

下一篇我們將實作**視窗的縮放功能**，包括：

- 八個方向的縮放把手
- 縮放時的最小尺寸限制
- 最大化/還原功能
- 多視窗的 z-index 管理優化

---

## 完整程式碼

本文的完整程式碼可以直接使用：

**檔案結構**

```
window-drag-demo/
├── index.html
├── style.css
├── window.js
└── main.js
```

所有程式碼都在上面的「跟著做」章節中，複製貼上即可運行。

**進階版本**

更完整的實作（包含縮放、最大化、Window Snap）會在本系列後續文章中介紹：
- 視窗縮放與多視窗管理（系列 1-3）
- Window Snap 與 Taskbar 整合（系列 1-4）
