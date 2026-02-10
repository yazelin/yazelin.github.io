---
layout: post
title: "手機版 App 佈局優化實戰"
subtitle: "將桌面 OS 風格的 Web App 適配到手機螢幕"
date: 2026-01-13
categories: [ChingTech OS]
tags: [響應式設計, CSS, PWA, 手機優化, ChingTech OS]
---

![手機版 App 佈局優化實戰](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-13-mobile-layout.png)

## 前言

在前面的系列中，我們完成了 [知識庫公開分享]({% post_url 2026-01-12-knowledge-sharing %}) 等功能。這篇是 ChingTech OS 系列的最後一篇，來分享如何將這個桌面 OS 風格的 Web App 適配到手機螢幕：

- 底部 Tab Bar 取代側邊欄
- 堆疊式導航取代視窗
- 卡片列表取代表格
- 可收合篩選器

這些技巧可以應用到任何需要同時支援桌面和手機的 Web App。

---

## 設計原則

### 桌面 vs 手機的差異

| 特性 | 桌面版 | 手機版 |
|------|--------|--------|
| 導航 | 側邊欄 | 底部 Tab Bar |
| 內容呈現 | 多視窗並排 | 單一全螢幕 |
| 列表 | 表格 | 卡片 |
| 互動 | 滑鼠懸停 | 觸控點擊 |
| 篩選器 | 常駐工具列 | 可收合面板 |

### 關鍵尺寸

```css
:root {
  --breakpoint-mobile: 768px;
}

/* 觸控友善的最小尺寸（Apple HIG 建議） */
.touch-target {
  min-width: 44px;
  min-height: 44px;
}
```

---

## 底部 Tab Bar

### 取代側邊欄導航

```css
/* 預設隱藏 */
.mobile-tab-bar {
  display: none;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--bg-surface-dark);
  border-top: 1px solid var(--border-subtle);
  z-index: 100;
}

.mobile-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 12px;
  min-width: 64px;
  min-height: 44px;  /* 觸控友善 */
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
  background: transparent;
  border: none;
}

.mobile-tab-item.active {
  color: var(--color-primary);
}

.mobile-tab-item .icon {
  font-size: 20px;
}

.mobile-tab-item .mobile-tab-label {
  font-size: 10px;
  white-space: nowrap;
}

/* 手機版顯示 */
@media (max-width: 768px) {
  .mobile-tab-bar {
    display: flex;
    justify-content: space-around;
    align-items: center;
  }
}
```

### HTML 結構

```html
<nav class="mobile-tab-bar">
  <button class="mobile-tab-item active" data-tab="projects">
    <span class="icon">📋</span>
    <span class="mobile-tab-label">專案</span>
  </button>
  <button class="mobile-tab-item" data-tab="knowledge">
    <span class="icon">📚</span>
    <span class="mobile-tab-label">知識庫</span>
  </button>
  <button class="mobile-tab-item" data-tab="files">
    <span class="icon">📁</span>
    <span class="mobile-tab-label">檔案</span>
  </button>
  <button class="mobile-tab-item" data-tab="settings">
    <span class="icon">⚙️</span>
    <span class="mobile-tab-label">設定</span>
  </button>
</nav>
```

---

## 堆疊式導航

### 列表 → 詳情的過渡動畫

手機上常見的「列表頁」→「詳情頁」導航模式：

```css
.mobile-stack-container {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.mobile-stack-page {
  position: absolute;
  inset: 0;
  background: var(--color-background);
  overflow-y: auto;
  transition: transform 0.25s ease-out, opacity 0.25s ease-out;
}

/* 列表頁（預設顯示） */
.mobile-stack-page.list-page {
  transform: translateX(0);
  opacity: 1;
}

/* 詳情頁（預設隱藏在右側） */
.mobile-stack-page.detail-page {
  transform: translateX(100%);
  opacity: 1;
}

/* 顯示詳情頁時 */
.mobile-stack-container.showing-detail .list-page {
  transform: translateX(-30%);
  opacity: 0.5;
  pointer-events: none;
}

.mobile-stack-container.showing-detail .detail-page {
  transform: translateX(0);
}
```

### 返回按鈕

```css
.mobile-back-header {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-surface-dark);
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  border-radius: var(--radius-md);
}

.mobile-back-btn:hover {
  background: var(--hover-bg);
}

.mobile-back-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 768px) {
  .mobile-back-header {
    display: flex;
  }
}
```

### JavaScript 控制

```javascript
class MobileStack {
  constructor(container) {
    this.container = container;
    this.listPage = container.querySelector('.list-page');
    this.detailPage = container.querySelector('.detail-page');
    this.backBtn = container.querySelector('.mobile-back-btn');

    this.bindEvents();
  }

  bindEvents() {
    // 返回按鈕
    this.backBtn?.addEventListener('click', () => this.showList());

    // 列表項目點擊
    this.listPage?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-id]');
      if (item) {
        this.showDetail(item.dataset.id);
      }
    });
  }

  showDetail(id) {
    this.container.classList.add('showing-detail');
    // 載入詳情內容...
  }

  showList() {
    this.container.classList.remove('showing-detail');
  }
}
```

---

## 卡片式列表

### 取代表格

表格在手機上難以閱讀，改用卡片式佈局：

```css
.mobile-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.mobile-card {
  padding: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast),
              background-color var(--transition-fast);
}

.mobile-card:hover {
  border-color: var(--border-light);
  background: var(--bg-surface-dark);
}

.mobile-card:active {
  background: var(--bg-surface-darker);
}

.mobile-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.mobile-card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.mobile-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.mobile-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mobile-card-label {
  color: var(--text-secondary);
}

.mobile-card-value {
  color: var(--text-primary);
}
```

### HTML 範例

```html
<div class="mobile-card-list">
  <div class="mobile-card" data-id="proj-001">
    <div class="mobile-card-header">
      <span class="mobile-card-title">水切爐改善</span>
      <span class="status-badge status-active">進行中</span>
    </div>
    <div class="mobile-card-meta">
      <div class="mobile-card-row">
        <span class="mobile-card-label">開始日期</span>
        <span class="mobile-card-value">2025-12-01</span>
      </div>
      <div class="mobile-card-row">
        <span class="mobile-card-label">負責人</span>
        <span class="mobile-card-value">張三</span>
      </div>
    </div>
  </div>

  <div class="mobile-card" data-id="proj-002">
    <!-- ... -->
  </div>
</div>
```

---

## 可收合篩選器

### 節省螢幕空間

桌面上的篩選工具列在手機上太佔空間，改用可收合面板：

```css
.mobile-filter-toggle {
  display: none;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-surface-dark);
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  min-height: 44px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.mobile-filter-panel {
  display: none;
  padding: 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-filter-panel.expanded {
  display: block;
}

.mobile-filter-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.mobile-filter-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.mobile-filter-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 768px) {
  .mobile-filter-toggle {
    display: flex;
  }
}
```

### JavaScript 控制

```javascript
const filterBtn = document.querySelector('.mobile-filter-btn');
const filterPanel = document.querySelector('.mobile-filter-panel');

filterBtn?.addEventListener('click', () => {
  filterPanel.classList.toggle('expanded');
  filterBtn.querySelector('.icon').textContent =
    filterPanel.classList.contains('expanded') ? '▲' : '▼';
});
```

---

## 響應式工具類別

### 顯示/隱藏控制

```css
@media (max-width: 768px) {
  /* 隱藏元素 */
  .hide-on-mobile { display: none !important; }

  /* 顯示元素 */
  .show-on-mobile { display: block !important; }
  .flex-on-mobile { display: flex !important; }

  /* 觸控友善的按鈕尺寸 */
  .btn {
    min-height: 44px;
    padding: var(--spacing-sm) var(--spacing-md);
  }

  /* 列表項目最小高度 */
  .mobile-list-item {
    min-height: 48px;
  }
}
```

### 使用範例

```html
<!-- 桌面顯示表格，手機顯示卡片 -->
<table class="data-table hide-on-mobile">
  <!-- 表格內容 -->
</table>

<div class="mobile-card-list show-on-mobile">
  <!-- 卡片列表 -->
</div>
```

---

## 觸控優化

### 點擊區域

Apple Human Interface Guidelines 建議最小點擊區域為 44x44pt：

```css
/* 確保可點擊元素足夠大 */
.clickable {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 列表項目 */
.list-item {
  min-height: 48px;
  padding: 12px 16px;
}

/* 按鈕間距 */
.btn-group {
  gap: 8px;  /* 避免誤觸 */
}
```

### 取消懸停效果

手機上沒有懸停狀態，改用 :active：

```css
@media (hover: none) {
  .btn:hover {
    /* 取消懸停效果 */
    background: inherit;
  }

  .btn:active {
    /* 改用按下效果 */
    background: var(--active-bg);
    transform: scale(0.98);
  }
}
```

---

## PWA 優化

### Viewport 設定

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

### Safe Area 處理

處理 iPhone 的 Home Indicator 和瀏海：

```css
/* 底部 Tab Bar 避開 Home Indicator */
.mobile-tab-bar {
  padding-bottom: env(safe-area-inset-bottom);
}

/* 頂部 Header 避開瀏海 */
.header-bar {
  padding-top: env(safe-area-inset-top);
}
```

### 防止縮放

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

---

## 實際應用：專案管理頁面

### 桌面版

```
┌─────────────────────────────────────────────────┐
│ Header                                          │
├──────────┬──────────────────────────────────────┤
│          │ 篩選工具列                            │
│  側邊欄   ├──────────────────────────────────────┤
│          │         專案表格                      │
│          │  名稱 | 狀態 | 開始日 | 負責人         │
│          │  ...  | ...  | ...   | ...           │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

### 手機版

```
┌─────────────────────┐
│ 專案管理        [篩選]│
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ 水切爐改善       │ │
│ │ 進行中          │ │
│ │ 2025-12-01      │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ 氣密窗安裝       │ │
│ │ 規劃中          │ │
│ │ 2026-01-15      │ │
│ └─────────────────┘ │
├─────────────────────┤
│ 專案 | 知識庫 | 設定  │
└─────────────────────┘
```

---

## 小結

手機版佈局優化的關鍵技巧：

| 問題 | 解決方案 |
|------|----------|
| 側邊欄佔空間 | 底部 Tab Bar |
| 多視窗難操作 | 堆疊式導航 |
| 表格難閱讀 | 卡片式列表 |
| 工具列佔空間 | 可收合篩選器 |
| 點擊區域太小 | 最小 44x44px |
| 懸停無效果 | 改用 :active |

CSS 工具類別：

| 類別 | 用途 |
|------|------|
| `.hide-on-mobile` | 手機上隱藏 |
| `.show-on-mobile` | 手機上顯示 |
| `.mobile-tab-bar` | 底部導航 |
| `.mobile-stack-*` | 堆疊導航 |
| `.mobile-card-*` | 卡片列表 |
| `.mobile-filter-*` | 可收合篩選器 |

---

## 系列回顧

這個系列從 2025/12/30 到 2026/01/13，共 15 篇文章：

**Line Bot 系列**
1. [Webhook 架構與訊息接收]({% post_url 2025-12-30-linebot-part1-webhook %})
2. [檔案處理與 NAS 自動儲存]({% post_url 2025-12-31-linebot-part2-file-download %})
3. [與 Claude AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})
4. [群組管理與專案綁定]({% post_url 2026-01-02-linebot-part4-group-project %})
5. [搜尋並發送 NAS 檔案]({% post_url 2026-01-03-linebot-part5-nas-search %})

**MCP 工具系列**
6. [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})
7. [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %})
8. [FastMCP 知識庫工具]({% post_url 2026-01-06-fastmcp-knowledge-tools %})
9. [MCP 工具權限控制]({% post_url 2026-01-07-mcp-permission %})

**專案與知識庫系列**
10. [專案管理資料模型]({% post_url 2026-01-08-project-data-model %})
11. [發包期程管理]({% post_url 2026-01-09-delivery-schedule %})
12. [專案附件與連結管理]({% post_url 2026-01-10-project-attachments %})
13. [Markdown 知識庫系統]({% post_url 2026-01-11-knowledge-base %})
14. [知識庫公開分享]({% post_url 2026-01-12-knowledge-sharing %})
15. 手機版 App 佈局優化（本篇）

---

## 參考資源

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design - Responsive Layout](https://material.io/design/layout/responsive-layout-grid.html)
- [CSS env() 函數](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
