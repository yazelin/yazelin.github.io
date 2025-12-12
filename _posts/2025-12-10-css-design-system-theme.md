---
layout: post
title: "CSS 設計系統：一行程式碼切換全站主題"
subtitle: "無框架前端開發實戰（五）"
date: 2025-12-10
author: "yazelin"
categories: [Frontend]
tags: [CSS, 設計系統, 主題切換, CSS Variables]
---

> **系列文章**
> 1. [為什麼我們選擇不用 React/Vue？談 Vanilla JS 的適用場景](/2025-12-10-vanilla-js-why-no-framework/)
> 2. [視窗系統（上）：讓網頁變成桌面 - 基礎拖曳功能](/2025-12-10-window-system-part1-drag/)
> 3. [視窗系統（中）：縮放、最大化與多視窗管理](/2025-12-10-window-system-part2-resize/)
> 4. [視窗系統（下）：Window Snap 與 Taskbar 整合](/2025-12-10-window-system-part3-snap/)
> 5. **CSS 設計系統：一行程式碼切換全站主題** ← 目前閱讀

---

## 這篇文章要解決什麼問題？

你有沒有遇過這種情況？

- 設計師說：「這個按鈕的藍色要改深一點」
- 你打開程式碼，發現 `#0891b2` 出現在 47 個檔案裡
- 改完發現有 3 個地方漏改，顏色不一致

或者：

- PM 說：「我們要支援暗色模式」
- 你看著滿滿的 `color: #333` 和 `background: #fff`
- 心裡想著要改到什麼時候...

**CSS Custom Properties（CSS 變數）** 可以解決這些問題：

- 顏色集中管理，改一處全站生效
- 主題切換只需要一行 JavaScript
- 建立一致的設計語言

**設計師**：「品牌色要從藍色換成綠色，全站都要改。」
**前端工程師**：「47 個檔案都有寫死顏色，改完要兩週。」
**老闆**：「換個顏色要兩週？」
**前端工程師**：「我們可以建立設計系統，以後顏色都用變數，改一行全站生效。」
**設計師**：「這樣我定義好規範，你們開發就不會色差、間距不一致了？」
**前端工程師**：「對，還能一鍵切換暗色模式。」

---

## 技術概念

### CSS Custom Properties 是什麼？

CSS Custom Properties（又稱 CSS 變數）是原生 CSS 的功能，不需要 SASS/LESS 預處理器。

```css
/* 定義變數 */
:root {
  --color-primary: #0891b2;
}

/* 使用變數 */
.button {
  background: var(--color-primary);
}
```

### 主題切換的原理

CSS 變數可以被覆蓋。我們利用這個特性，在不同的選擇器下定義不同的值：

```css
/* 預設（暗色主題）*/
:root {
  --color-background: #1a1a1a;
  --color-text: #f0f0f0;
}

/* 亮色主題 */
:root[data-theme="light"] {
  --color-background: #ffffff;
  --color-text: #1a1a1a;
}
```

切換主題只需要：

```javascript
// 切換到亮色
document.documentElement.dataset.theme = 'light';

// 切換到暗色
document.documentElement.dataset.theme = 'dark';
```

### 語義化命名 vs 原始值

```css
/* 原始值命名（不推薦）*/
:root {
  --blue-500: #0891b2;
  --gray-900: #1a1a1a;
}

/* 語義化命名（推薦）*/
:root {
  --color-primary: #0891b2;
  --color-background: #1a1a1a;
}
```

語義化命名的好處：

- 不需要記顏色代碼
- 主題切換時只改定義，不改使用處
- 程式碼更易讀

---

## 跟著做：Step by Step

### 第一步：建立基礎色彩系統

建立 `design-system.css`：

```css
/* ==========================================================================
   設計系統 - CSS Custom Properties
   ========================================================================== */

:root {
  /* ====== 品牌色 ====== */
  --color-primary: #0891b2;
  --color-primary-hover: #0ea5c9;
  --color-accent: #ea580c;
  --color-accent-hover: #f97316;

  /* ====== 狀態色 ====== */
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-error: #dc2626;

  /* ====== 背景色 ====== */
  --color-background: #1a1a1a;
  --bg-surface: rgba(255, 255, 255, 0.05);
  --bg-surface-hover: rgba(255, 255, 255, 0.1);

  /* ====== 文字色 ====== */
  --color-text-primary: #f0f0f0;
  --color-text-secondary: #a0a0a0;
  --color-text-muted: #606060;

  /* ====== 邊框色 ====== */
  --border-subtle: rgba(255, 255, 255, 0.05);
  --border-light: rgba(255, 255, 255, 0.1);
  --border-medium: rgba(255, 255, 255, 0.15);

  /* ====== 視窗 ====== */
  --window-bg: #252525;
  --window-titlebar-bg: #1e1e1e;

  /* ====== 間距 ====== */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* ====== 圓角 ====== */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* ====== 陰影 ====== */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.4);

  /* ====== 字體 ====== */
  --font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Ubuntu Mono', 'Consolas', monospace;

  /* ====== 字體大小 ====== */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;

  /* ====== 轉場動畫 ====== */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}
```

### 第二步：定義亮色主題

```css
/* ====== 亮色主題覆蓋 ====== */
:root[data-theme="light"] {
  /* 背景色 */
  --color-background: #f5f5f5;
  --bg-surface: rgba(0, 0, 0, 0.03);
  --bg-surface-hover: rgba(0, 0, 0, 0.06);

  /* 文字色 */
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #505050;
  --color-text-muted: #a0a0a0;

  /* 邊框色 */
  --border-subtle: rgba(0, 0, 0, 0.05);
  --border-light: rgba(0, 0, 0, 0.1);
  --border-medium: rgba(0, 0, 0, 0.15);

  /* 視窗 */
  --window-bg: #ffffff;
  --window-titlebar-bg: #f0f0f0;

  /* 陰影（亮色模式陰影較淡）*/
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.12);
}
```

### 第三步：使用 CSS 變數

```css
/* 使用設計系統的範例 */

body {
  font-family: var(--font-primary);
  background-color: var(--color-background);
  color: var(--color-text-primary);
}

.button {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  transition: background-color var(--transition-fast);
}

.button:hover {
  background-color: var(--color-primary-hover);
}

.card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-md);
}

.text-secondary {
  color: var(--color-text-secondary);
}

.text-error {
  color: var(--color-error);
}
```

### 第四步：主題切換模組

```javascript
/**
 * ThemeManager - 主題管理模組
 */
const ThemeManager = (function() {
  'use strict';

  const STORAGE_KEY = 'app-theme';
  const DEFAULT_THEME = 'dark';

  let currentTheme = DEFAULT_THEME;

  /**
   * 從 localStorage 讀取主題
   */
  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  /**
   * 儲存主題到 localStorage
   */
  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('無法儲存主題設定');
    }
  }

  /**
   * 套用主題
   * @param {string} theme - 'dark' 或 'light'
   */
  function setTheme(theme) {
    const validTheme = theme === 'light' ? 'light' : 'dark';

    // 一行程式碼切換主題！
    document.documentElement.dataset.theme = validTheme;

    currentTheme = validTheme;
    storeTheme(validTheme);
  }

  /**
   * 取得目前主題
   * @returns {string}
   */
  function getTheme() {
    return currentTheme;
  }

  /**
   * 切換主題
   */
  function toggleTheme() {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  /**
   * 初始化
   */
  function init() {
    // 讀取儲存的主題並套用
    const storedTheme = getStoredTheme();
    setTheme(storedTheme);
  }

  return {
    init,
    setTheme,
    getTheme,
    toggleTheme
  };
})();

// 頁面載入時初始化
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
});
```

### 第五步：主題切換按鈕

HTML：

```html
<button id="theme-toggle" class="theme-toggle-btn">
  <span class="theme-icon-dark">🌙</span>
  <span class="theme-icon-light">☀️</span>
</button>
```

CSS：

```css
.theme-toggle-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.theme-toggle-btn:hover {
  background: var(--bg-surface-hover);
}

/* 根據主題顯示對應圖示 */
:root[data-theme="dark"] .theme-icon-light,
:root:not([data-theme="light"]) .theme-icon-light {
  display: none;
}

:root[data-theme="light"] .theme-icon-dark {
  display: none;
}

:root[data-theme="light"] .theme-icon-light {
  display: inline;
}
```

JavaScript：

```javascript
document.getElementById('theme-toggle').addEventListener('click', () => {
  ThemeManager.toggleTheme();
});
```

---

## 進階技巧與踩坑紀錄

### 技巧一：終端機的 ANSI 16 色

如果你的應用有終端機功能，需要支援 ANSI 16 色：

```css
:root {
  /* ANSI 基本 8 色 */
  --terminal-black: #1a1a1a;
  --terminal-red: #ff5f57;
  --terminal-green: #28ca42;
  --terminal-yellow: #f3bf4f;
  --terminal-blue: #5f87ff;
  --terminal-magenta: #ff6ac1;
  --terminal-cyan: #21d4fd;
  --terminal-white: #e0e0e0;

  /* ANSI 亮色 8 色 */
  --terminal-bright-black: #5c5c5c;
  --terminal-bright-red: #ff8785;
  --terminal-bright-green: #6fd876;
  --terminal-bright-yellow: #f7d77f;
  --terminal-bright-blue: #8faeff;
  --terminal-bright-magenta: #ff9ad3;
  --terminal-bright-cyan: #6fe7ff;
  --terminal-bright-white: #ffffff;
}

:root[data-theme="light"] {
  --terminal-black: #1e1e1e;
  --terminal-white: #1e1e1e;
  --terminal-bright-white: #000000;
  /* ... 其他亮色模式的終端機顏色 */
}
```

### 技巧二：Markdown 渲染樣式

為 Markdown 內容建立專屬變數：

```css
:root {
  --md-heading-color: #e2e8f0;
  --md-text-color: #cbd5e1;
  --md-link-color: #60a5fa;
  --md-code-bg: rgba(139, 92, 246, 0.15);
  --md-code-color: #c4b5fd;
  --md-pre-bg: #1e293b;
  --md-blockquote-border: #60a5fa;
  --md-table-border: #334155;
}

:root[data-theme="light"] {
  --md-heading-color: #1e293b;
  --md-text-color: #334155;
  --md-link-color: #2563eb;
  --md-code-bg: rgba(139, 92, 246, 0.1);
  --md-code-color: #7c3aed;
  --md-pre-bg: #f1f5f9;
  --md-blockquote-border: #2563eb;
  --md-table-border: #e2e8f0;
}

/* 使用 */
.markdown-content h1 {
  color: var(--md-heading-color);
}

.markdown-content code {
  background: var(--md-code-bg);
  color: var(--md-code-color);
  padding: 2px 6px;
  border-radius: 4px;
}
```

### 技巧三：避免頁面閃爍

如果在 CSS 載入前 JavaScript 就執行，可能會看到主題閃爍。解決方法：

```html
<head>
  <!-- 在 head 中盡早設定主題 -->
  <script>
    (function() {
      const theme = localStorage.getItem('app-theme') || 'dark';
      document.documentElement.dataset.theme = theme;
    })();
  </script>
  <link rel="stylesheet" href="design-system.css">
</head>
```

### 踩坑紀錄

**坑 1：Select/Option 元素的顏色**

`<option>` 元素在某些瀏覽器不會繼承 CSS 變數：

```css
/* 錯誤：只設定 select */
select {
  background: var(--bg-surface);
  color: var(--color-text-primary);
}

/* 正確：必須也設定 option */
select option {
  background-color: var(--color-background);
  color: var(--color-text-primary);
}
```

**坑 2：陰影中使用 rgba**

CSS 變數不能直接用在 rgba 的參數中：

```css
/* 錯誤 */
:root {
  --shadow-color: 0, 0, 0;
}
.box {
  box-shadow: 0 4px 6px rgba(var(--shadow-color), 0.3);
}

/* 正確：定義完整的顏色值 */
:root {
  --shadow-color: rgba(0, 0, 0, 0.3);
}
.box {
  box-shadow: 0 4px 6px var(--shadow-color);
}
```

**坑 3：fallback 值的使用**

CSS 變數可以設定 fallback 值，但要注意語法：

```css
/* fallback 語法 */
.box {
  background: var(--bg-custom, var(--bg-surface));
  /* 如果 --bg-custom 沒定義，就用 --bg-surface */
}
```

---

## 小結

### 重點整理

1. **CSS Custom Properties** 讓顏色集中管理
2. **語義化命名** 讓程式碼更易讀
3. **主題切換** 只需改變 `data-theme` 屬性
4. **localStorage** 記住使用者偏好

### 設計系統的好處

- 一致性：全站顏色、間距、圓角統一
- 可維護性：改一處全站生效
- 擴展性：新增主題只需加一組覆蓋
- 溝通效率：設計師和工程師有共同語言

### 系列一完結

恭喜你完成了「無框架前端開發實戰」系列！你學會了：

1. ✅ IIFE 模組化模式
2. ✅ 視窗拖曳功能
3. ✅ 視窗縮放功能
4. ✅ Window Snap
5. ✅ CSS 設計系統

下一個系列我們將進入後端領域，學習如何用 **Python + Socket.IO** 實作 Web 終端機。

---

## 完整程式碼

### 完整的設計系統 CSS

```css
/* ==========================================================================
   設計系統 - 完整版
   ========================================================================== */

:root {
  /* ====== 品牌色 ====== */
  --color-primary: #0891b2;
  --color-primary-hover: #0ea5c9;
  --color-accent: #ea580c;
  --color-accent-hover: #f97316;

  /* ====== 狀態色 ====== */
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-error: #dc2626;

  /* ====== 背景色 ====== */
  --color-background: #1a1a1a;
  --bg-surface: rgba(255, 255, 255, 0.05);
  --bg-surface-dark: rgba(0, 0, 0, 0.2);
  --bg-overlay: rgba(0, 0, 0, 0.6);
  --bg-glass: rgba(26, 26, 26, 0.95);

  /* ====== 文字色 ====== */
  --color-text-primary: #f0f0f0;
  --color-text-secondary: #a0a0a0;
  --color-text-muted: #606060;

  /* ====== 邊框色 ====== */
  --border-subtle: rgba(255, 255, 255, 0.05);
  --border-light: rgba(255, 255, 255, 0.1);
  --border-medium: rgba(255, 255, 255, 0.15);

  /* ====== 視窗 ====== */
  --window-bg: #252525;
  --window-titlebar-bg: #1e1e1e;
  --modal-bg: #1e1e1e;

  /* ====== 互動效果 ====== */
  --hover-bg: rgba(255, 255, 255, 0.1);
  --active-bg: rgba(255, 255, 255, 0.15);

  /* ====== 間距 ====== */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* ====== 圓角 ====== */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* ====== 陰影 ====== */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.4);

  /* ====== 字體 ====== */
  --font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Ubuntu Mono', 'Consolas', 'Monaco', monospace;

  /* ====== 字體大小 ====== */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;

  /* ====== 轉場 ====== */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;

  /* ====== 佈局 ====== */
  --header-height: 40px;
  --taskbar-height: 48px;
}

/* ====== 亮色主題 ====== */
:root[data-theme="light"] {
  --color-background: #f5f5f5;
  --bg-surface: rgba(0, 0, 0, 0.03);
  --bg-surface-dark: rgba(0, 0, 0, 0.06);
  --bg-overlay: rgba(0, 0, 0, 0.4);
  --bg-glass: rgba(255, 255, 255, 0.95);

  --color-text-primary: #1a1a1a;
  --color-text-secondary: #505050;
  --color-text-muted: #a0a0a0;

  --border-subtle: rgba(0, 0, 0, 0.05);
  --border-light: rgba(0, 0, 0, 0.1);
  --border-medium: rgba(0, 0, 0, 0.15);

  --window-bg: #ffffff;
  --window-titlebar-bg: #f0f0f0;
  --modal-bg: #ffffff;

  --hover-bg: rgba(0, 0, 0, 0.05);
  --active-bg: rgba(0, 0, 0, 0.08);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.12);
}
```

### 完整的主題管理模組

```javascript
const ThemeManager = (function() {
  'use strict';

  const STORAGE_KEY = 'app-theme';
  const DEFAULT_THEME = 'dark';
  let currentTheme = DEFAULT_THEME;

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('無法儲存主題設定');
    }
  }

  function setTheme(theme) {
    const validTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = validTheme;
    currentTheme = validTheme;
    storeTheme(validTheme);
  }

  function getTheme() {
    return currentTheme;
  }

  function toggleTheme() {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  function init() {
    setTheme(getStoredTheme());
  }

  return { init, setTheme, getTheme, toggleTheme };
})();
```
