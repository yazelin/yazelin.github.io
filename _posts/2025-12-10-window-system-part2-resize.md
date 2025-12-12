---
layout: post
title: "視窗系統（中）：縮放、最大化與多視窗管理"
subtitle: "無框架前端開發實戰（三）"
date: 2025-12-10
author: "yazelin"
categories: [Frontend]
tags: [JavaScript, DOM, 視窗系統, 縮放]
---

> **系列文章**
> 1. [為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景](/2025-12-10-vanilla-js-why-no-framework/)
> 2. [視窗系統（上）：讓網頁變成桌面 - 基礎拖曳功能](/2025-12-10-window-system-part1-drag/)
> 3. **視窗系統（中）：縮放、最大化與多視窗管理** ← 目前閱讀
> 4. [視窗系統（下）：Window Snap 與 Taskbar 整合](/2025-12-10-window-system-part3-snap/)
> 5. [CSS 設計系統：一行程式碼切換全站主題](/2025-12-10-css-design-system-theme/)

---

## 這篇文章要解決什麼問題？

上一篇我們實作了視窗的拖曳功能。但真正的桌面系統還需要：

- **調整視窗大小**：拖曳邊緣或角落來縮放
- **最大化/還原**：讓視窗填滿整個桌面
- **最小化**：隱藏視窗但保留在工作列

這些功能讓使用者能根據需求調整工作空間，**提升多工處理的效率**。

**業務**：「視窗可以拖了，但大小固定不太方便，報表欄位太多看不完。」
**前端工程師**：「我加上縮放功能，你可以把視窗拉大，還能最大化填滿整個畫面。」
**老闆**：「那如果開太多視窗，桌面很亂怎麼辦？」
**前端工程師**：「有最小化功能，暫時不用的收到工作列，要用再點開。」

---

## 技術概念

### 八方向縮放

視窗的縮放可以從八個方向進行：

```
     nw ──── n ──── ne
      │            │
      w            e
      │            │
     sw ──── s ──── se
```

每個方向影響的屬性不同：

| 方向 | 影響的屬性 |
|------|-----------|
| n（上） | top, height |
| s（下） | height |
| w（左） | left, width |
| e（右） | width |
| nw（左上） | top, left, width, height |
| ne（右上） | top, width, height |
| sw（左下） | left, width, height |
| se（右下） | width, height |

### 縮放的計算邏輯

以從右邊（e）縮放為例：

```
拖曳前：
┌─────────────┐
│    視窗     │ ← 滑鼠在這裡按下
│             │   startX = 滑鼠位置
│             │   startWidth = 視窗寬度
└─────────────┘

拖曳中：
┌─────────────────┐
│      視窗       │ ← 滑鼠移動到這裡
│                 │   deltaX = 移動距離
│                 │   newWidth = startWidth + deltaX
└─────────────────┘
```

從左邊（w）縮放比較複雜，需要同時調整 left 和 width：

```
拖曳前：
         ┌─────────────┐
         │    視窗     │
滑鼠在 → │             │
這裡按下  │             │
         └─────────────┘

拖曳中：
    ┌─────────────────┐
    │      視窗       │ ← 寬度增加
 ←  │                 │ ← left 減少
    │                 │
    └─────────────────┘
```

---

## 跟著做：Step by Step

### 第一步：加入縮放把手 HTML

修改視窗建立的程式碼，加入八個縮放把手：

```javascript
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

  <!-- 八個縮放把手 -->
  <div class="window-resize window-resize-n" data-direction="n"></div>
  <div class="window-resize window-resize-s" data-direction="s"></div>
  <div class="window-resize window-resize-w" data-direction="w"></div>
  <div class="window-resize window-resize-e" data-direction="e"></div>
  <div class="window-resize window-resize-nw" data-direction="nw"></div>
  <div class="window-resize window-resize-ne" data-direction="ne"></div>
  <div class="window-resize window-resize-sw" data-direction="sw"></div>
  <div class="window-resize window-resize-se" data-direction="se"></div>
`;
```

### 第二步：縮放把手的 CSS

```css
/* 縮放把手基礎樣式 */
.window-resize {
  position: absolute;
  z-index: 10;
}

/* 上下邊緣（水平方向縮放游標）*/
.window-resize-n {
  top: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.window-resize-s {
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

/* 左右邊緣（垂直方向縮放游標）*/
.window-resize-w {
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.window-resize-e {
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

/* 四個角落（斜向縮放游標）*/
.window-resize-nw {
  top: 0;
  left: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

.window-resize-ne {
  top: 0;
  right: 0;
  width: 12px;
  height: 12px;
  cursor: nesw-resize;
}

.window-resize-sw {
  bottom: 0;
  left: 0;
  width: 12px;
  height: 12px;
  cursor: nesw-resize;
}

.window-resize-se {
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

/* 最大化時隱藏縮放把手 */
.window.maximized .window-resize {
  display: none;
}
```

### 第三步：縮放狀態管理

在 WindowManager 中加入縮放狀態：

```javascript
// 縮放狀態
let resizeState = {
  isResizing: false,     // 是否正在縮放
  windowId: null,        // 正在縮放的視窗 ID
  direction: null,       // 縮放方向
  startX: 0,             // 滑鼠起始 X
  startY: 0,             // 滑鼠起始 Y
  startWidth: 0,         // 視窗起始寬度
  startHeight: 0,        // 視窗起始高度
  startLeft: 0,          // 視窗起始 left
  startTop: 0            // 視窗起始 top
};

// 最小尺寸限制
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;
```

### 第四步：開始縮放

```javascript
/**
 * 開始縮放
 * @param {string} windowId - 視窗 ID
 * @param {MouseEvent} e - 滑鼠事件
 * @param {string} direction - 縮放方向
 */
function startResize(windowId, e, direction) {
  const windowInfo = windows[windowId];
  if (!windowInfo) return;

  const windowEl = windowInfo.element;

  // 記錄縮放起始狀態
  resizeState = {
    isResizing: true,
    windowId: windowId,
    direction: direction,
    startX: e.clientX,
    startY: e.clientY,
    startWidth: windowEl.offsetWidth,
    startHeight: windowEl.offsetHeight,
    startLeft: windowEl.offsetLeft,
    startTop: windowEl.offsetTop
  };

  // 加上縮放中的 CSS class
  windowEl.classList.add('resizing');

  // 防止文字選取
  document.body.style.userSelect = 'none';

  // 聚焦視窗
  focusWindow(windowId);
}
```

### 第五步：處理縮放移動

```javascript
/**
 * 處理縮放移動
 * @param {MouseEvent} e - 滑鼠事件
 */
function handleResizeMove(e) {
  if (!resizeState.isResizing) return;

  const windowInfo = windows[resizeState.windowId];
  if (!windowInfo) return;

  const windowEl = windowInfo.element;

  // 計算滑鼠移動距離
  const deltaX = e.clientX - resizeState.startX;
  const deltaY = e.clientY - resizeState.startY;
  const dir = resizeState.direction;

  // 根據方向調整尺寸

  // 右邊緣（e）：增加寬度
  if (dir.includes('e')) {
    const newWidth = Math.max(MIN_WIDTH, resizeState.startWidth + deltaX);
    windowEl.style.width = `${newWidth}px`;
  }

  // 左邊緣（w）：調整 left 和寬度
  if (dir.includes('w')) {
    const newWidth = Math.max(MIN_WIDTH, resizeState.startWidth - deltaX);
    // 只有在寬度大於最小值時才調整 left
    if (newWidth > MIN_WIDTH) {
      windowEl.style.width = `${newWidth}px`;
      windowEl.style.left = `${resizeState.startLeft + deltaX}px`;
    }
  }

  // 下邊緣（s）：增加高度
  if (dir.includes('s')) {
    const newHeight = Math.max(MIN_HEIGHT, resizeState.startHeight + deltaY);
    windowEl.style.height = `${newHeight}px`;
  }

  // 上邊緣（n）：調整 top 和高度
  if (dir.includes('n')) {
    const newHeight = Math.max(MIN_HEIGHT, resizeState.startHeight - deltaY);
    if (newHeight > MIN_HEIGHT) {
      windowEl.style.height = `${newHeight}px`;
      windowEl.style.top = `${resizeState.startTop + deltaY}px`;
    }
  }
}
```

### 第六步：綁定縮放事件

在 `bindWindowEvents` 函式中加入：

```javascript
// 縮放把手事件
windowEl.querySelectorAll('.window-resize').forEach(handle => {
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation(); // 防止觸發視窗的 mousedown
    startResize(windowId, e, handle.dataset.direction);
  });
});
```

修改 `handleMouseMove` 以支援縮放：

```javascript
function handleMouseMove(e) {
  // 優先處理縮放
  if (resizeState.isResizing) {
    handleResizeMove(e);
    return;
  }

  // 處理拖曳
  if (dragState.isDragging) {
    handleDragMove(e);
  }
}
```

修改 `handleMouseUp` 以結束縮放：

```javascript
function handleMouseUp() {
  // 結束縮放
  if (resizeState.isResizing) {
    const windowInfo = windows[resizeState.windowId];
    if (windowInfo) {
      windowInfo.element.classList.remove('resizing');
    }
    resizeState.isResizing = false;
    resizeState.windowId = null;
  }

  // 結束拖曳
  if (dragState.isDragging) {
    // ... 原本的拖曳結束邏輯
  }

  document.body.style.userSelect = '';
}
```

### 第七步：最大化功能

```javascript
/**
 * 最大化視窗
 * @param {string} windowId - 視窗 ID
 */
function maximizeWindow(windowId) {
  const windowInfo = windows[windowId];
  if (!windowInfo || windowInfo.maximized) return;

  const windowEl = windowInfo.element;

  // 儲存目前的位置和尺寸，以便還原
  windowInfo.restoreState = {
    left: windowEl.style.left,
    top: windowEl.style.top,
    width: windowEl.style.width,
    height: windowEl.style.height
  };

  // 最大化到填滿桌面
  windowEl.style.left = '0';
  windowEl.style.top = '0';
  windowEl.style.width = '100%';
  windowEl.style.height = '100%';

  windowInfo.maximized = true;
  windowEl.classList.add('maximized');
}

/**
 * 還原視窗
 * @param {string} windowId - 視窗 ID
 */
function unmaximizeWindow(windowId) {
  const windowInfo = windows[windowId];
  if (!windowInfo || !windowInfo.maximized) return;

  const windowEl = windowInfo.element;

  // 還原到之前的位置和尺寸
  if (windowInfo.restoreState) {
    windowEl.style.left = windowInfo.restoreState.left;
    windowEl.style.top = windowInfo.restoreState.top;
    windowEl.style.width = windowInfo.restoreState.width;
    windowEl.style.height = windowInfo.restoreState.height;
  }

  windowInfo.maximized = false;
  windowInfo.restoreState = null;
  windowEl.classList.remove('maximized');
}

/**
 * 切換最大化狀態
 * @param {string} windowId - 視窗 ID
 */
function toggleMaximize(windowId) {
  const windowInfo = windows[windowId];
  if (!windowInfo) return;

  if (windowInfo.maximized) {
    unmaximizeWindow(windowId);
  } else {
    maximizeWindow(windowId);
  }
}
```

### 第八步：綁定最大化按鈕

```javascript
// 在 bindWindowEvents 中加入
const maximizeBtn = windowEl.querySelector('.window-btn-maximize');
maximizeBtn.addEventListener('click', () => {
  toggleMaximize(windowId);
});

// 雙擊標題列也可以最大化
titlebar.addEventListener('dblclick', (e) => {
  if (e.target.closest('.window-btn')) return;
  toggleMaximize(windowId);
});
```

### 第九步：最小化功能

```javascript
/**
 * 最小化視窗
 * @param {string} windowId - 視窗 ID
 */
function minimizeWindow(windowId) {
  const windowInfo = windows[windowId];
  if (!windowInfo) return;

  windowInfo.minimized = true;
  windowInfo.element.classList.add('minimized');
}

/**
 * 還原最小化的視窗
 * @param {string} windowId - 視窗 ID
 */
function restoreWindow(windowId) {
  const windowInfo = windows[windowId];
  if (!windowInfo) return;

  windowInfo.minimized = false;
  windowInfo.element.classList.remove('minimized');
  focusWindow(windowId);
}
```

CSS：

```css
.window.minimized {
  display: none;
}
```

---

## 進階技巧與踩坑紀錄

### 技巧一：從左/上縮放的計算

從左邊縮放時，視窗的右邊界應該保持不動：

```javascript
// 錯誤：只調整寬度
windowEl.style.width = `${startWidth - deltaX}px`;
// 結果：視窗會從右邊縮放，左邊界不動

// 正確：同時調整 left
windowEl.style.width = `${startWidth - deltaX}px`;
windowEl.style.left = `${startLeft + deltaX}px`;
// 結果：右邊界保持不動，左邊界移動
```

### 技巧二：防止縮放到負值

```javascript
// 錯誤：直接設定計算結果
windowEl.style.width = `${startWidth + deltaX}px`;
// 問題：deltaX 是負數時可能變成負寬度

// 正確：使用 Math.max 限制最小值
const newWidth = Math.max(MIN_WIDTH, startWidth + deltaX);
windowEl.style.width = `${newWidth}px`;
```

### 技巧三：最大化時拖曳標題列的處理

當視窗最大化時，使用者拖曳標題列應該先還原再拖曳：

```javascript
function startDrag(windowId, e) {
  const windowInfo = windows[windowId];
  if (!windowInfo) return;

  // 如果最大化中，先還原
  if (windowInfo.maximized) {
    // 計算還原後視窗應該在哪裡
    const oldWidth = windowInfo.restoreState
      ? parseInt(windowInfo.restoreState.width)
      : 800;

    unmaximizeWindow(windowId);

    // 讓視窗跟隨滑鼠位置
    const windowEl = windowInfo.element;
    const desktopRect = document.querySelector('.desktop').getBoundingClientRect();
    const newX = Math.max(0, e.clientX - oldWidth / 2);
    const newY = e.clientY - desktopRect.top - 20;

    windowEl.style.left = `${newX}px`;
    windowEl.style.top = `${Math.max(0, newY)}px`;
  }

  // ... 繼續正常的拖曳邏輯
}
```

### 踩坑紀錄

**坑 1：縮放把手被內容遮住**

```css
/* 錯誤：沒有設定 z-index */
.window-resize {
  position: absolute;
}
/* 問題：視窗內容可能蓋住縮放把手 */

/* 正確：設定較高的 z-index */
.window-resize {
  position: absolute;
  z-index: 10;
}
```

**坑 2：縮放事件冒泡到視窗**

```javascript
// 錯誤：沒有阻止事件冒泡
handle.addEventListener('mousedown', (e) => {
  startResize(windowId, e, direction);
});
// 問題：會同時觸發視窗的聚焦事件

// 正確：阻止事件冒泡
handle.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  startResize(windowId, e, direction);
});
```

**坑 3：最大化後尺寸單位問題**

```javascript
// 最大化時設定百分比
windowEl.style.width = '100%';
windowEl.style.height = '100%';

// 還原時要存取原本儲存的 px 值
// 如果不小心存了百分比值，還原會出問題

// 解決：確保 restoreState 存的是字串形式的值
windowInfo.restoreState = {
  left: windowEl.style.left,    // "100px"
  top: windowEl.style.top,      // "50px"
  width: windowEl.style.width,  // "400px"
  height: windowEl.style.height // "300px"
};
```

---

## 小結

### 重點整理

1. **八方向縮放**：根據方向決定要調整哪些屬性
2. **左/上縮放**：需要同時調整位置和尺寸
3. **最小尺寸限制**：用 `Math.max` 確保不會縮到太小
4. **最大化狀態**：儲存還原狀態、隱藏縮放把手

### 下一篇預告

下一篇我們將實作 **Window Snap**（視窗吸附）功能：

- 拖曳到螢幕邊緣自動吸附
- 半螢幕、四分之一螢幕佈局
- Taskbar 整合

---

## 完整程式碼

### resize 相關的完整 CSS

```css
/* 縮放把手 */
.window-resize {
  position: absolute;
  z-index: 10;
}

.window-resize-n {
  top: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.window-resize-s {
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.window-resize-w {
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.window-resize-e {
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.window-resize-nw {
  top: 0;
  left: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

.window-resize-ne {
  top: 0;
  right: 0;
  width: 12px;
  height: 12px;
  cursor: nesw-resize;
}

.window-resize-sw {
  bottom: 0;
  left: 0;
  width: 12px;
  height: 12px;
  cursor: nesw-resize;
}

.window-resize-se {
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

/* 最大化狀態 */
.window.maximized {
  left: 0 !important;
  top: 0 !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0;
}

.window.maximized .window-resize {
  display: none;
}

/* 最小化狀態 */
.window.minimized {
  display: none;
}

/* 縮放中 */
.window.resizing {
  transition: none;
}
```
