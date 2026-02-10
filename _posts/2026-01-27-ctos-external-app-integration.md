---
layout: post
title: "ChingTech OS 外部應用整合：postMessage + iframe"
subtitle: "讓第三方應用無縫嵌入企業平台"
date: 2026-01-27
categories: [ChingTech OS]
tags: [ChingTech OS, postMessage, iframe, 整合, JavaScript, Frontend]
---

![ChingTech OS 外部應用整合：postMessage + iframe](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-27-ctos-external-app-integration.png)

## 前言

ChingTech OS 是一套以瀏覽器為基礎的企業作業系統，桌面上有檔案總管、終端機、AI 助手等內建應用。但實務上，團隊還會開發獨立的 Web 工具——例如 **MD2PPT**（Markdown 轉簡報）和 **MD2DOC**（Markdown 轉文件）。這些工具各自部署在不同的 domain，卻需要在 CTOS 的視窗系統裡「像原生應用一樣」被開啟和操作。

問題來了：**跨 origin 的兩個網頁，要怎麼安全地互相通訊？**

答案是 `window.postMessage` + `<iframe>`。這是瀏覽器原生提供的跨來源通訊機制，不需要任何後端介入，純前端就能完成雙向溝通。

本篇會從架構設計開始，拆解 CTOS 如何作為 Host、MD2PPT/MD2DOC 如何作為 Guest，實現檔案傳遞、就緒通知等功能。

---

## 整體架構

整合的核心概念可以用一句話描述：

> **CTOS 在視窗中嵌入 iframe，透過 postMessage 傳送檔案內容給外部應用。**

角色分工如下：

| 角色 | 系統 | 職責 |
|------|------|------|
| **Host（宿主）** | ChingTech OS | 建立 iframe 視窗、傳送檔案內容、監聽 ready 訊號 |
| **Guest（客端）** | MD2PPT / MD2DOC | 偵測是否在 iframe 中、發送 ready 訊號、接收檔案內容 |

通訊流程：

```
CTOS (Host)                              MD2PPT/MD2DOC (Guest)
    |                                           |
    |  1. 建立 iframe，載入外部 URL              |
    |  ---------------------------------------->|
    |                                           |
    |           2. iframe 載入完成               |
    |           發送 { type: 'ready' }           |
    |  <----------------------------------------|
    |                                           |
    |  3. 收到 ready，傳送檔案內容               |
    |  { type: 'load-file', filename, content } |
    |  ---------------------------------------->|
    |                                           |
    |           4. 接收並載入檔案                 |
    |                                           |
```

---

## Host 端：ExternalAppModule

CTOS 使用一個 IIFE 模組 `ExternalAppModule` 來統一管理所有外部應用。這個模組負責三件事：建立 iframe 視窗、追蹤應用狀態、處理 postMessage 通訊。

### 應用配置

外部應用透過全域設定檔註冊：

```javascript
// config.js
window.EXTERNAL_APP_CONFIG = {
  md2ppt: {
    appId: 'md2ppt',
    title: 'md2ppt',
    icon: 'file-powerpoint',
    url: 'https://md-2-ppt-evolution.vercel.app/',
    maximized: true
  },
  md2doc: {
    appId: 'md2doc',
    title: 'md2doc',
    icon: 'file-word',
    url: 'https://md-2-doc-evolution.vercel.app/',
    maximized: true
  }
};
```

每個應用都有唯一的 `appId`，對應到一組 URL 和視窗參數。新增外部應用只要在這裡加一筆設定即可。

### 建立 iframe 視窗

當使用者點擊桌面圖示或開啟 `.md2ppt` 檔案時，`ExternalAppModule.open()` 會透過 CTOS 的 `WindowModule` 建立一個視窗，內容是一個 `<iframe>`：

```javascript
function open(config) {
  const { appId, title, icon, url, width = 1000, height = 700, maximized = false } = config;

  // 如果已開啟，聚焦到該視窗
  if (openWindows[appId] && WindowModule.getWindowByAppId(appId)) {
    WindowModule.focusWindow(openWindows[appId]);
    return;
  }

  const windowId = WindowModule.createWindow({
    title,
    appId,
    icon,
    width,
    height,
    content: `
      <div class="external-app-container">
        <div class="external-app-loading">
          <span class="icon">${getIcon('mdi-loading')}</span>
          <span>載入中...</span>
        </div>
        <iframe
          class="external-app-iframe"
          src="${url}"
          allow="clipboard-read; clipboard-write; fullscreen; autoplay"
          sandbox="allow-scripts allow-same-origin allow-popups
                   allow-popups-to-escape-sandbox allow-forms
                   allow-modals allow-downloads"
        ></iframe>
      </div>
    `,
    onClose: () => handleClose(appId),
    onInit: (windowEl, wId) => handleInit(windowEl, wId, appId, url, maximized)
  });

  openWindows[appId] = windowId;
  appUrls[appId] = url;
}
```

值得注意的是 iframe 的兩個屬性：

- **`allow`**：授權 iframe 使用剪貼簿、全螢幕等 Permission Policy 功能
- **`sandbox`**：啟用沙箱模式，但開放必要的權限（`allow-scripts`、`allow-same-origin` 等）

### 傳送檔案內容

當使用者從 CTOS 檔案總管開啟 `.md2ppt` 檔案時，系統會先讀取檔案內容，再透過 `openWithContent()` 傳送給 iframe：

```javascript
function openWithContent(config, fileInfo) {
  const { appId } = config;

  // 儲存待傳送的檔案內容
  pendingContent[appId] = fileInfo;

  // 如果視窗已開啟，直接傳送
  if (openWindows[appId] && WindowModule.getWindowByAppId(appId)) {
    WindowModule.focusWindow(openWindows[appId]);
    sendContentToIframe(appId);
    return;
  }

  // 否則開啟視窗，等 ready 後再傳
  open(config);
}
```

實際的 postMessage 發送邏輯：

```javascript
function sendContentToIframe(appId) {
  const iframe = iframeRefs[appId];
  const fileInfo = pendingContent[appId];
  const targetOrigin = appUrls[appId] ? getOrigin(appUrls[appId]) : '*';

  if (!iframe || !fileInfo) return;

  try {
    iframe.contentWindow.postMessage({
      type: 'load-file',
      filename: fileInfo.filename,
      content: fileInfo.content
    }, targetOrigin);
    delete pendingContent[appId];
  } catch (err) {
    console.error(`[ExternalAppModule] 傳送檔案內容失敗:`, err);
  }
}
```

這裡有一個重要的安全設計：`targetOrigin` 是從應用設定的 URL 解析出來的，而不是用 `'*'`。這確保訊息只會送到預期的 origin。

### 監聽 Guest 的 ready 訊號

Host 端全域監聽 `message` 事件，當收到 Guest 發出的 `ready` 訊號時，就把暫存的檔案內容送出：

```javascript
function handleMessage(event) {
  const { data } = event;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'ready' && data.appId) {
    console.log(`[ExternalAppModule] 收到 ${data.appId} ready 訊號`);
    sendContentToIframe(data.appId);
  }
}

window.addEventListener('message', handleMessage);
```

---

## Guest 端：useCTOSMessage Hook

MD2PPT 和 MD2DOC 都是 React 應用，它們各自實作了一個 `useCTOSMessage` Hook 來處理與 CTOS 的通訊。

```typescript
// hooks/useCTOSMessage.ts

interface CTOSMessage {
  type: 'load-file';
  filename: string;
  content: string;
}

interface UseCTOSMessageOptions {
  appId: string;
  onLoadFile: (filename: string, content: string) => void;
}

export const useCTOSMessage = (options: UseCTOSMessageOptions) => {
  const { appId, onLoadFile } = options;
  const hasReceivedFile = useRef(false);

  useEffect(() => {
    const isInIframe = window.parent !== window;

    const handleMessage = (event: MessageEvent) => {
      const { data } = event;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'load-file' && data.content) {
        hasReceivedFile.current = true;
        onLoadFile(data.filename, data.content);
      }
    };

    window.addEventListener('message', handleMessage);

    // 如果在 iframe 中，發送 ready 訊號
    if (isInIframe) {
      setTimeout(() => {
        window.parent.postMessage({ type: 'ready', appId }, '*');
      }, 100);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [appId, onLoadFile]);

  return { hasReceivedFile: hasReceivedFile.current };
};
```

幾個設計重點：

1. **自動偵測 iframe 環境**：透過 `window.parent !== window` 判斷自己是否被嵌入。如果是獨立開啟的（直接訪問 URL），就不發送 ready 訊號，Hook 仍然可以正常運作
2. **延遲發送 ready**：使用 `setTimeout(..., 100)` 確保 Host 端已經準備好接收訊息
3. **清理函式**：在 `useEffect` 的 cleanup 中移除事件監聽器，避免記憶體洩漏

使用方式非常簡潔：

```typescript
// 在 MD2PPT 的 App 元件中
useCTOSMessage({
  appId: 'md2ppt',
  onLoadFile: (filename, content) => {
    // 載入收到的 Markdown 內容
    loadPresentation(filename, content);
  }
});
```

---

## 檔案開啟的完整流程

從使用者在 CTOS 檔案總管雙擊一個 `.md2ppt` 檔案開始，到 MD2PPT 載入該檔案，完整流程如下：

```
使用者雙擊 demo.md2ppt
        |
        v
FileOpener.openExtended()
  - 偵測副檔名為 'md2ppt'
  - 呼叫 openExternalApp()
        |
        v
openExternalApp()
  - 從 NAS 讀取檔案內容（帶 JWT Token）
  - 取得 EXTERNAL_APP_CONFIG.md2ppt 設定
  - 呼叫 ExternalAppModule.openWithContent()
        |
        v
ExternalAppModule.openWithContent()
  - 暫存 { filename, content } 到 pendingContent
  - 建立 iframe 視窗，載入 md2ppt URL
        |
        v
MD2PPT 在 iframe 中載入完成
  - useCTOSMessage 偵測到在 iframe 中
  - 發送 { type: 'ready', appId: 'md2ppt' }
        |
        v
ExternalAppModule.handleMessage()
  - 收到 ready 訊號
  - 呼叫 sendContentToIframe('md2ppt')
  - postMessage({ type: 'load-file', filename, content })
        |
        v
MD2PPT 收到檔案內容
  - onLoadFile callback 觸發
  - 載入 Markdown 並渲染簡報
```

CTOS 的 `FileOpener` 模組負責根據副檔名決定開啟方式。對於 `.md2ppt` 和 `.md2doc` 檔案，它會先用帶認證的 `fetch` 讀取檔案內容，再交給 `ExternalAppModule` 處理：

```javascript
async function openExternalApp(filePath, filename, appType) {
  const config = getExternalAppConfig(appType);
  if (!config) return false;

  try {
    const token = getToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch(filePath, { headers });
    const content = await response.text();

    ExternalAppModule.openWithContent(config, { filename, content });
    return true;
  } catch (error) {
    NotificationModule?.show?.(`開啟檔案失敗: ${error.message}`, 'error');
    return false;
  }
}
```

---

## 安全考量

跨 origin 通訊最需要注意的就是安全性。這套整合做了幾層防護：

### 1. targetOrigin 限定

Host 傳送訊息時，`targetOrigin` 是從設定檔中的 URL 解析出來的：

```javascript
function getOrigin(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return '*';
  }
}

// 使用時
const targetOrigin = appUrls[appId] ? getOrigin(appUrls[appId]) : '*';
iframe.contentWindow.postMessage(data, targetOrigin);
```

這表示即使有惡意頁面被嵌入，也無法攔截到 Host 傳送的訊息，因為 `postMessage` 的第二個參數會讓瀏覽器比對接收端的 origin，不匹配就不會送達。

### 2. iframe sandbox 屬性

```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-popups
           allow-popups-to-escape-sandbox allow-forms
           allow-modals allow-downloads"
></iframe>
```

`sandbox` 屬性預設會禁止 iframe 中的所有「危險」行為，然後只開放必要的權限：

| 權限 | 用途 |
|------|------|
| `allow-scripts` | 允許執行 JavaScript（核心功能） |
| `allow-same-origin` | 允許保留原始 origin（postMessage 需要） |
| `allow-popups` | 允許開啟新視窗（下載、分享連結） |
| `allow-forms` | 允許表單提交 |
| `allow-modals` | 允許 `alert()`、`confirm()` 等對話框 |
| `allow-downloads` | 允許下載檔案（匯出簡報/文件） |

### 3. 訊息格式驗證

無論 Host 或 Guest，收到訊息後都會先驗證格式：

```javascript
// Host 端
if (!data || typeof data !== 'object') return;
if (data.type === 'ready' && data.appId) { ... }

// Guest 端
if (!data || typeof data !== 'object') return;
if (data.type === 'load-file' && data.content) { ... }
```

只處理預期的訊息類型，忽略所有其他來源的訊息（例如瀏覽器擴充功能、第三方 SDK 等可能發出的 postMessage）。

### 4. 超時容錯機制

如果外部應用沒有實作 ready 訊號（或訊號遺失），Host 端會在 3 秒後嘗試直接傳送：

```javascript
setTimeout(() => {
  if (pendingContent[appId]) {
    sendContentToIframe(appId);
  }
}, 3000);
```

這是一個務實的容錯設計——不會因為一個訊號遺失就讓整個流程卡住。

---

## postMessage API 原理補充

`window.postMessage()` 是 HTML5 定義的跨來源通訊 API，讓不同 origin 的 window 之間可以安全地傳遞訊息。

### 基本用法

```javascript
// 發送端
targetWindow.postMessage(message, targetOrigin);

// 接收端
window.addEventListener('message', (event) => {
  console.log(event.origin);  // 發送端的 origin
  console.log(event.data);    // 訊息內容
  console.log(event.source);  // 發送端的 window 參考
});
```

### 關鍵參數

- **`message`**：可以是任何可序列化的值（物件、字串、數字等），瀏覽器會使用 Structured Clone Algorithm 來複製
- **`targetOrigin`**：指定接收端必須匹配的 origin。用 `'*'` 表示不限制，但在傳送敏感資料時應該避免
- **`event.origin`**：接收端可以用這個來驗證發送端的身份

### 與其他方案的比較

| 方案 | 跨 Origin | 雙向通訊 | 需要後端 | 適用場景 |
|------|-----------|----------|----------|----------|
| postMessage | 是 | 是 | 否 | iframe 嵌入、彈出視窗 |
| BroadcastChannel | 僅同 origin | 是 | 否 | 同一網站的多分頁同步 |
| SharedWorker | 僅同 origin | 是 | 否 | 同一網站的背景運算 |
| WebSocket | 是 | 是 | 是 | 即時雙向通訊、聊天室 |
| Server-Sent Events | 是 | 單向 | 是 | 伺服器推播通知 |

在 CTOS 的場景中，MD2PPT 的 `PresentationSyncService` 使用 `BroadcastChannel` 來同步同一簡報的多個分頁（例如簡報模式和編輯模式），而 CTOS 與 MD2PPT 之間則使用 `postMessage` 來跨 origin 通訊。兩者各司其職。

---

## 設計上的取捨

### 為什麼用 iframe 而不是 micro-frontend 框架？

CTOS 是 Vanilla JS 專案，MD2PPT/MD2DOC 是 React 專案。引入 Module Federation 或 Single-SPA 這類 micro-frontend 框架會帶來過高的複雜度。iframe 的好處是：

- **完全隔離**：CSS、JavaScript、DOM 互不干擾
- **獨立部署**：外部應用可以獨立更新，不需要重新部署 CTOS
- **零耦合**：只靠 postMessage 通訊，雙方可以各自演進

代價是 iframe 本身的效能開銷（額外的 browsing context），以及跨 origin 的限制（無法直接存取 DOM）。但對於「在桌面系統中嵌入獨立應用」這個場景，iframe 是最自然的選擇。

### 為什麼 Guest 的 ready 訊號用 `'*'` 作為 targetOrigin？

```javascript
window.parent.postMessage({ type: 'ready', appId }, '*');
```

Guest 發送 ready 訊號時沒有指定 targetOrigin，而是用了 `'*'`。這是因為：

1. ready 訊號不包含敏感資料，只是一個通知
2. Guest 不一定知道 Host 的確切 origin（CTOS 可能部署在不同環境）
3. Host 端收到 ready 後，會用限定的 targetOrigin 來發送檔案，安全性仍然有保障

如果需要更嚴格的安全性，可以在 Guest 端透過環境變數設定預期的 Host origin。

---

## 小結

CTOS 的外部應用整合方案，核心就是三個東西：

1. **`ExternalAppModule`**（Host 端 IIFE 模組）：管理 iframe 視窗的生命週期、暫存待傳送內容、監聽 ready 訊號
2. **`useCTOSMessage`**（Guest 端 React Hook）：偵測 iframe 環境、發送 ready 訊號、接收檔案內容
3. **postMessage 通訊協議**：`ready` 和 `load-file` 兩種訊息類型，加上 origin 驗證

這套設計的優點在於簡單、標準、零依賴——不需要任何額外的 library 或後端服務，純粹利用瀏覽器原生能力完成跨應用通訊。新增一個外部應用，只需要在 CTOS 加一筆設定，然後在外部應用中加入 `useCTOSMessage` Hook 即可。

---

## 參考資源

- [MD2PPT/MD2DOC shareToken]({% post_url 2026-01-26-md2ppt-doc-sharetoken %})
- [MDN - Window.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [MDN - iframe sandbox attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
- [HTML Living Standard - Cross-document messaging](https://html.spec.whatwg.org/multipage/web-messaging.html#web-messaging)
