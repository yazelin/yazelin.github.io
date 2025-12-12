---
layout: post
title: "視窗系統（下）：Window Snap 與 Taskbar 整合"
subtitle: "無框架前端開發實戰（四）"
date: 2025-12-10
author: "yazelin"
categories: [Frontend]
tags: [JavaScript, UX, 視窗系統, Window Snap]
---

> **系列文章**
> 1. [為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景]({% post_url 2025-12-10-vanilla-js-why-no-framework %})
> 2. [視窗系統（上）：讓網頁變成桌面 - 基礎拖曳功能]({% post_url 2025-12-10-window-system-part1-drag %})
> 3. [視窗系統（中）：縮放、最大化與多視窗管理]({% post_url 2025-12-10-window-system-part2-resize %})
> 4. **視窗系統（下）：Window Snap 與 Taskbar 整合** ← 目前閱讀
> 5. [CSS 設計系統：一行程式碼切換全站主題]({% post_url 2025-12-10-css-design-system-theme %})

---

## 這篇文章要解決什麼問題？

Windows 10/11 有一個很實用的功能：**把視窗拖到螢幕邊緣會自動吸附**。

- 拖到左邊 → 佔左半邊
- 拖到右邊 → 佔右半邊
- 拖到角落 → 佔四分之一
- 拖到上方 → 最大化

這個功能叫做 **Window Snap**，大幅提升了多視窗工作的效率。

另外，我們也需要一個 **Taskbar（工作列）**，讓使用者可以：

- 看到目前開啟了哪些視窗
- 快速切換視窗
- 還原最小化的視窗

**業務**：「Windows 有個功能很方便，視窗拖到邊邊會自動貼齊半邊。」
**前端工程師**：「Window Snap 對吧？我可以做，拖到左邊佔左半、拖到右邊佔右半。」
**倉管**：「那我開太多視窗，怎麼知道開了哪些？」
**前端工程師**：「下面會有工作列，顯示所有開啟的視窗，點一下就能切換。」

---

## 技術概念

### Window Snap 的區域劃分

我們把螢幕邊緣劃分成以下區域：

```
┌─────────┬─────────────────────────────┬─────────┐
│ top-left│           top               │top-right│
│  (1/4)  │        (最大化)             │  (1/4)  │
├─────────┤                             ├─────────┤
│         │                             │         │
│  left   │        (正常區域)           │  right  │
│  (1/2)  │                             │  (1/2)  │
│         │                             │         │
├─────────┤                             ├─────────┤
│ bottom- │                             │ bottom- │
│  left   │                             │  right  │
│  (1/4)  │                             │  (1/4)  │
└─────────┴─────────────────────────────┴─────────┘
```

### 偵測觸發區域

當滑鼠拖曳視窗到邊緣時：

```javascript
const EDGE_THRESHOLD = 20;    // 邊緣觸發範圍（像素）
const CORNER_SIZE = 50;       // 角落區域大小（像素）

// 判斷滑鼠是否在邊緣
const nearLeft = mouseX <= EDGE_THRESHOLD;
const nearRight = mouseX >= screenWidth - EDGE_THRESHOLD;
const nearTop = mouseY <= EDGE_THRESHOLD;
```

### Snap 預覽

當使用者拖曳到 snap 區域時，顯示一個半透明的預覽，讓使用者知道放開後視窗會變成什麼樣子。

---

## 跟著做：Step by Step

### 第一步：Snap 狀態管理

```javascript
// Snap 狀態
let snapState = {
  zone: null,            // 目前的 snap 區域
  previewElement: null   // 預覽元素
};

// 偵測閾值
const SNAP_EDGE_THRESHOLD = 20;  // 離邊緣多近觸發
const SNAP_CORNER_SIZE = 50;     // 角落區域大小
```

### 第二步：偵測 Snap 區域

```javascript
/**
 * 偵測滑鼠在哪個 snap 區域
 * @param {number} x - 滑鼠 X 座標
 * @param {number} y - 滑鼠 Y 座標
 * @returns {string|null} 區域名稱
 */
function detectSnapZone(x, y) {
  const desktop = document.querySelector('.desktop');
  if (!desktop) return null;

  const rect = desktop.getBoundingClientRect();

  // 計算滑鼠相對於桌面的位置
  const relativeX = x - rect.left;
  const relativeY = y - rect.top;

  // 判斷是否在邊緣
  const nearLeft = relativeX <= SNAP_EDGE_THRESHOLD;
  const nearRight = relativeX >= rect.width - SNAP_EDGE_THRESHOLD;
  const nearTop = relativeY <= SNAP_EDGE_THRESHOLD;
  const nearBottom = relativeY >= rect.height - SNAP_EDGE_THRESHOLD;

  // 判斷是否在角落
  const inLeftCorner = relativeX <= SNAP_CORNER_SIZE;
  const inRightCorner = relativeX >= rect.width - SNAP_CORNER_SIZE;
  const inTopCorner = relativeY <= SNAP_CORNER_SIZE;
  const inBottomCorner = relativeY >= rect.height - SNAP_CORNER_SIZE;

  // 角落優先判斷
  if (nearLeft && nearTop) return 'top-left';
  if (nearRight && nearTop) return 'top-right';
  if (nearLeft && nearBottom) return 'bottom-left';
  if (nearRight && nearBottom) return 'bottom-right';

  // 邊緣判斷
  if (nearTop && !inLeftCorner && !inRightCorner) return 'top';
  if (nearLeft) return 'left';
  if (nearRight) return 'right';

  return null;
}
```

### 第三步：計算 Snap 尺寸

```javascript
/**
 * 取得 snap 區域的尺寸
 * @param {string} zone - 區域名稱
 * @returns {Object} { left, top, width, height }
 */
function getSnapDimensions(zone) {
  const desktop = document.querySelector('.desktop');
  if (!desktop) return null;

  const rect = desktop.getBoundingClientRect();
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  switch (zone) {
    case 'left':
      return { left: 0, top: 0, width: halfWidth, height: rect.height };

    case 'right':
      return { left: halfWidth, top: 0, width: halfWidth, height: rect.height };

    case 'top':  // 最大化
      return { left: 0, top: 0, width: rect.width, height: rect.height };

    case 'top-left':
      return { left: 0, top: 0, width: halfWidth, height: halfHeight };

    case 'top-right':
      return { left: halfWidth, top: 0, width: halfWidth, height: halfHeight };

    case 'bottom-left':
      return { left: 0, top: halfHeight, width: halfWidth, height: halfHeight };

    case 'bottom-right':
      return { left: halfWidth, top: halfHeight, width: halfWidth, height: halfHeight };

    default:
      return null;
  }
}
```

### 第四步：顯示預覽

```javascript
/**
 * 顯示 snap 預覽
 * @param {string} zone - 區域名稱
 */
function showSnapPreview(zone) {
  // 如果已經顯示相同區域的預覽，不重複建立
  if (snapState.zone === zone && snapState.previewElement) return;

  // 隱藏舊的預覽
  hideSnapPreview();

  const dimensions = getSnapDimensions(zone);
  if (!dimensions) return;

  const desktop = document.querySelector('.desktop');
  if (!desktop) return;

  // 建立預覽元素
  const preview = document.createElement('div');
  preview.className = 'window-snap-preview';
  preview.style.left = `${dimensions.left}px`;
  preview.style.top = `${dimensions.top}px`;
  preview.style.width = `${dimensions.width}px`;
  preview.style.height = `${dimensions.height}px`;

  desktop.appendChild(preview);
  snapState.previewElement = preview;
  snapState.zone = zone;

  // 觸發動畫
  requestAnimationFrame(() => {
    preview.classList.add('visible');
  });
}

/**
 * 隱藏 snap 預覽
 */
function hideSnapPreview() {
  if (snapState.previewElement) {
    snapState.previewElement.remove();
    snapState.previewElement = null;
  }
  snapState.zone = null;
}
```

### 第五步：預覽的 CSS

```css
/* Snap 預覽 */
.window-snap-preview {
  position: absolute;
  background-color: rgba(8, 145, 178, 0.2);
  border: 2px solid rgba(8, 145, 178, 0.5);
  border-radius: 8px;
  pointer-events: none;
  z-index: 50;
  opacity: 0;
  transform: scale(0.98);
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.window-snap-preview.visible {
  opacity: 1;
  transform: scale(1);
}
```

### 第六步：在拖曳時偵測

修改 `handleMouseMove`：

```javascript
function handleMouseMove(e) {
  // ... 原有的拖曳邏輯 ...

  if (dragState.isDragging) {
    const windowEl = windows[dragState.windowId].element;

    // 更新視窗位置
    // ... 原有的位置更新邏輯 ...

    // 偵測 snap 區域並顯示預覽
    const snapZone = detectSnapZone(e.clientX, e.clientY);
    if (snapZone) {
      showSnapPreview(snapZone);
    } else {
      hideSnapPreview();
    }
  }
}
```

### 第七步：放開時套用 Snap

```javascript
/**
 * 套用 snap
 * @param {string} windowId - 視窗 ID
 * @param {string} zone - 區域名稱
 */
function applySnap(windowId, zone) {
  const windowInfo = windows[windowId];
  if (!windowInfo) return;

  const windowEl = windowInfo.element;
  const dimensions = getSnapDimensions(zone);
  if (!dimensions) return;

  // 儲存原始狀態以便還原
  if (!windowInfo.snapped) {
    windowInfo.snapRestoreState = {
      left: windowEl.style.left,
      top: windowEl.style.top,
      width: windowEl.style.width,
      height: windowEl.style.height
    };
  }

  // 套用 snap 尺寸
  windowEl.style.left = `${dimensions.left}px`;
  windowEl.style.top = `${dimensions.top}px`;
  windowEl.style.width = `${dimensions.width}px`;
  windowEl.style.height = `${dimensions.height}px`;

  windowInfo.snapped = zone;
  windowEl.classList.add('snapped');

  // 如果是頂部，也設定最大化狀態
  if (zone === 'top') {
    windowInfo.maximized = true;
    windowEl.classList.add('maximized');
  }
}

/**
 * 取消 snap
 * @param {string} windowId - 視窗 ID
 * @param {MouseEvent} e - 滑鼠事件
 */
function unsnapWindow(windowId, e) {
  const windowInfo = windows[windowId];
  if (!windowInfo || !windowInfo.snapped) return;

  const windowEl = windowInfo.element;
  const restoreState = windowInfo.snapRestoreState;

  if (restoreState) {
    // 計算還原後的位置（讓視窗跟隨滑鼠）
    const oldWidth = parseInt(restoreState.width) || 400;
    const desktopRect = document.querySelector('.desktop').getBoundingClientRect();
    const newX = Math.max(0, e.clientX - oldWidth / 2);
    const newY = e.clientY - desktopRect.top - 20;

    windowEl.style.left = `${newX}px`;
    windowEl.style.top = `${Math.max(0, newY)}px`;
    windowEl.style.width = restoreState.width;
    windowEl.style.height = restoreState.height;
  }

  windowInfo.snapped = null;
  windowInfo.snapRestoreState = null;
  windowInfo.maximized = false;
  windowEl.classList.remove('snapped', 'maximized');
}
```

修改 `handleMouseUp`：

```javascript
function handleMouseUp() {
  if (dragState.isDragging) {
    const windowId = dragState.windowId;
    const windowInfo = windows[windowId];

    // 如果在 snap 區域，套用 snap
    if (snapState.zone && windowInfo) {
      applySnap(windowId, snapState.zone);
    }

    // 隱藏預覽
    hideSnapPreview();

    // ... 原有的結束拖曳邏輯 ...
  }
}
```

### 第八步：Taskbar 實作

HTML 結構：

```html
<div class="taskbar">
  <div class="taskbar-windows">
    <!-- 動態插入視窗按鈕 -->
  </div>
</div>
```

CSS：

```css
/* Taskbar */
.taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  padding: 0 8px;
  z-index: 1000;
}

.taskbar-windows {
  display: flex;
  gap: 4px;
}

.taskbar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
  max-width: 200px;
}

.taskbar-item:hover {
  background: rgba(255, 255, 255, 0.15);
}

.taskbar-item.active {
  background: rgba(8, 145, 178, 0.3);
  border-bottom: 2px solid #0891b2;
}

.taskbar-item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 第九步：Taskbar 模組

```javascript
/**
 * TaskbarModule - 工作列模組
 */
const TaskbarModule = (function() {
  'use strict';

  let container = null;

  /**
   * 初始化
   */
  function init() {
    container = document.querySelector('.taskbar-windows');
    if (!container) return;

    // 監聽視窗狀態變化
    WindowManager.onStateChange(handleWindowStateChange);
  }

  /**
   * 處理視窗狀態變化
   * @param {string} eventType - 'open' 或 'close'
   * @param {string} appId - 應用 ID
   */
  function handleWindowStateChange(eventType, appId) {
    updateTaskbar();
  }

  /**
   * 更新工作列
   */
  function updateTaskbar() {
    if (!container) return;

    container.innerHTML = '';
    const windows = WindowManager.getWindows();

    Object.keys(windows).forEach(windowId => {
      const windowInfo = windows[windowId];
      const item = createTaskbarItem(windowId, windowInfo);
      container.appendChild(item);
    });
  }

  /**
   * 建立工作列項目
   * @param {string} windowId - 視窗 ID
   * @param {Object} windowInfo - 視窗資訊
   * @returns {HTMLElement}
   */
  function createTaskbarItem(windowId, windowInfo) {
    const item = document.createElement('button');
    item.className = 'taskbar-item';
    item.dataset.windowId = windowId;

    // 標記聚焦的視窗
    if (windowInfo.element.classList.contains('focused')) {
      item.classList.add('active');
    }

    item.innerHTML = `
      <span class="taskbar-item-title">${windowInfo.title}</span>
    `;

    // 點擊切換視窗
    item.addEventListener('click', () => {
      if (windowInfo.minimized) {
        WindowManager.restoreWindow(windowId);
      } else if (windowInfo.element.classList.contains('focused')) {
        WindowManager.minimizeWindow(windowId);
      } else {
        WindowManager.focusWindow(windowId);
      }
      updateTaskbar();
    });

    return item;
  }

  return {
    init,
    updateTaskbar
  };
})();
```

在 WindowManager 中加入狀態變化通知：

```javascript
// 狀態變化回調
let stateChangeCallbacks = [];

/**
 * 註冊狀態變化回調
 * @param {Function} callback
 */
function onStateChange(callback) {
  if (typeof callback === 'function') {
    stateChangeCallbacks.push(callback);
  }
}

/**
 * 通知狀態變化
 * @param {string} eventType
 * @param {string} appId
 */
function notifyStateChange(eventType, appId) {
  stateChangeCallbacks.forEach(callback => {
    try {
      callback(eventType, appId);
    } catch (e) {
      console.error('State change callback error:', e);
    }
  });
}
```

---

## 進階技巧與踩坑紀錄

### 技巧一：Snap 後拖曳的處理

當視窗已經 snap 時，使用者拖曳標題列應該先取消 snap：

```javascript
function startDrag(windowId, e) {
  const windowInfo = windows[windowId];

  // 如果已經 snap，先取消
  if (windowInfo.snapped) {
    unsnapWindow(windowId, e);
  }

  // 繼續正常拖曳...
}
```

### 技巧二：預覽的動畫效果

使用 CSS transition 讓預覽出現更平滑：

```css
.window-snap-preview {
  opacity: 0;
  transform: scale(0.98);
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.window-snap-preview.visible {
  opacity: 1;
  transform: scale(1);
}
```

要在加入 DOM 後才加上 visible class：

```javascript
desktop.appendChild(preview);
// 使用 requestAnimationFrame 確保 DOM 更新後再加 class
requestAnimationFrame(() => {
  preview.classList.add('visible');
});
```

### 技巧三：Taskbar 與視窗狀態同步

使用觀察者模式讓 Taskbar 監聽視窗變化：

```javascript
// WindowManager 中
function closeWindow(windowId) {
  // ... 關閉邏輯 ...
  notifyStateChange('close', appId);
}

// TaskbarModule 中
WindowManager.onStateChange((eventType, appId) => {
  updateTaskbar();
});
```

### 踩坑紀錄

**坑 1：預覽元素沒有被移除**

```javascript
// 錯誤：只隱藏不移除
snapState.previewElement.style.display = 'none';
// 問題：DOM 中會累積大量預覽元素

// 正確：直接移除
snapState.previewElement.remove();
snapState.previewElement = null;
```

**坑 2：Snap 尺寸使用像素導致響應式問題**

```javascript
// 錯誤：使用固定像素
windowEl.style.width = '960px';
// 問題：不同螢幕尺寸會有問題

// 正確：使用計算值
const rect = desktop.getBoundingClientRect();
windowEl.style.width = `${rect.width / 2}px`;
```

**坑 3：Taskbar 項目點擊事件的邏輯**

```javascript
// 點擊 Taskbar 項目的三種情況：
// 1. 視窗已最小化 → 還原並聚焦
// 2. 視窗已聚焦 → 最小化
// 3. 視窗未聚焦 → 聚焦

item.addEventListener('click', () => {
  if (windowInfo.minimized) {
    WindowManager.restoreWindow(windowId);
  } else if (windowInfo.element.classList.contains('focused')) {
    WindowManager.minimizeWindow(windowId);
  } else {
    WindowManager.focusWindow(windowId);
  }
});
```

---

## 小結

### 重點整理

1. **Window Snap**：偵測滑鼠是否在邊緣，顯示預覽，放開時套用
2. **預覽動畫**：使用 CSS transition 和 requestAnimationFrame
3. **狀態儲存**：snap 前儲存原始尺寸，方便還原
4. **Taskbar 整合**：使用觀察者模式同步視窗狀態

### 系列總結

經過這四篇文章，我們完成了一個功能完整的視窗系統：

- ✅ 視窗建立與關閉
- ✅ 拖曳移動
- ✅ 八方向縮放
- ✅ 最大化/最小化/還原
- ✅ Window Snap
- ✅ Taskbar 整合

### 下一篇預告

下一篇我們將探討 **CSS 設計系統**，學習如何用 CSS Custom Properties 建立一套可主題切換的設計系統。

---

## 完整程式碼

### Snap 相關完整程式碼

```javascript
// Snap 狀態
let snapState = {
  zone: null,
  previewElement: null
};

const SNAP_EDGE_THRESHOLD = 20;
const SNAP_CORNER_SIZE = 50;

function detectSnapZone(x, y) {
  const desktop = document.querySelector('.desktop');
  if (!desktop) return null;

  const rect = desktop.getBoundingClientRect();
  const relativeX = x - rect.left;
  const relativeY = y - rect.top;

  const nearLeft = relativeX <= SNAP_EDGE_THRESHOLD;
  const nearRight = relativeX >= rect.width - SNAP_EDGE_THRESHOLD;
  const nearTop = relativeY <= SNAP_EDGE_THRESHOLD;
  const nearBottom = relativeY >= rect.height - SNAP_EDGE_THRESHOLD;

  if (nearLeft && nearTop) return 'top-left';
  if (nearRight && nearTop) return 'top-right';
  if (nearLeft && nearBottom) return 'bottom-left';
  if (nearRight && nearBottom) return 'bottom-right';
  if (nearTop) return 'top';
  if (nearLeft) return 'left';
  if (nearRight) return 'right';

  return null;
}

function getSnapDimensions(zone) {
  const desktop = document.querySelector('.desktop');
  if (!desktop) return null;

  const rect = desktop.getBoundingClientRect();
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  const dimensions = {
    'left': { left: 0, top: 0, width: halfWidth, height: rect.height },
    'right': { left: halfWidth, top: 0, width: halfWidth, height: rect.height },
    'top': { left: 0, top: 0, width: rect.width, height: rect.height },
    'top-left': { left: 0, top: 0, width: halfWidth, height: halfHeight },
    'top-right': { left: halfWidth, top: 0, width: halfWidth, height: halfHeight },
    'bottom-left': { left: 0, top: halfHeight, width: halfWidth, height: halfHeight },
    'bottom-right': { left: halfWidth, top: halfHeight, width: halfWidth, height: halfHeight }
  };

  return dimensions[zone] || null;
}

function showSnapPreview(zone) {
  if (snapState.zone === zone && snapState.previewElement) return;
  hideSnapPreview();

  const dimensions = getSnapDimensions(zone);
  if (!dimensions) return;

  const desktop = document.querySelector('.desktop');
  const preview = document.createElement('div');
  preview.className = 'window-snap-preview';
  preview.style.cssText = `
    left: ${dimensions.left}px;
    top: ${dimensions.top}px;
    width: ${dimensions.width}px;
    height: ${dimensions.height}px;
  `;

  desktop.appendChild(preview);
  snapState.previewElement = preview;
  snapState.zone = zone;

  requestAnimationFrame(() => preview.classList.add('visible'));
}

function hideSnapPreview() {
  if (snapState.previewElement) {
    snapState.previewElement.remove();
    snapState.previewElement = null;
  }
  snapState.zone = null;
}

function applySnap(windowId, zone) {
  const windowInfo = windows[windowId];
  if (!windowInfo) return;

  const windowEl = windowInfo.element;
  const dimensions = getSnapDimensions(zone);
  if (!dimensions) return;

  if (!windowInfo.snapped) {
    windowInfo.snapRestoreState = {
      left: windowEl.style.left,
      top: windowEl.style.top,
      width: windowEl.style.width,
      height: windowEl.style.height
    };
  }

  windowEl.style.left = `${dimensions.left}px`;
  windowEl.style.top = `${dimensions.top}px`;
  windowEl.style.width = `${dimensions.width}px`;
  windowEl.style.height = `${dimensions.height}px`;

  windowInfo.snapped = zone;
  windowEl.classList.add('snapped');

  if (zone === 'top') {
    windowInfo.maximized = true;
    windowEl.classList.add('maximized');
  }
}
```
