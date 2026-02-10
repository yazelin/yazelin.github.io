---
layout: post
title: "MD2PPT / MD2DOC 分享功能：shareToken 實作"
subtitle: "讓 Markdown 簡報和文件一鍵分享"
date: 2026-01-26
categories: [ChingTech OS]
tags: [ChingTech OS, MD2PPT, MD2DOC, 分享, JavaScript, Vercel]
---

![MD2PPT / MD2DOC 分享功能：shareToken 實作](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-26-md2ppt-doc-sharetoken.png)

## 前言

[MD2PPT-Evolution](https://github.com/eric861129/MD2PPT-Evolution) 是一套將 Markdown 轉換為簡報（PPTX）的開源工具，[MD2DOC-Evolution](https://github.com/eric861129/MD2DOC-Evolution) 則是將 Markdown 轉換為文件（DOCX）的姊妹專案。兩者都是基於 React + Vite 的前端應用，支援即時預覽、主題切換和多種匯出格式。

在 ChingTech OS（CTOS）中，我們已經有了[知識庫公開分享功能]({% post_url 2026-01-12-knowledge-sharing %})，可以透過 Token 將知識、專案、檔案分享給外部使用者。但問題來了：如果使用者想把 CTOS 裡的 Markdown 內容直接以「簡報」或「文件」的形式分享出去，該怎麼做？

這篇文章記錄我如何為 MD2PPT 和 MD2DOC 貢獻 `shareToken` 分享功能，讓 CTOS 的分享連結能無縫對接這兩套工具。

---

## 需求分析

### 使用情境

```
CTOS 使用者                                     外部使用者
    |                                               |
    | 1. 在 CTOS 編輯 Markdown 簡報                  |
    | 2. 點擊「分享」產生連結                          |
    |                                               |
    |    https://md2ppt.vercel.app                   |
    |      ?shareToken=Ab3Xyz                        |
    |                                               |
    |--------- 將連結傳送給對方 ---------------------->|
    |                                               |
    |                                    3. 開啟連結  |
    |                                    4. 輸入密碼  |
    |                                    5. 載入簡報  |
    |                                    6. 預覽/匯出 |
```

### 要解決的問題

1. **跨系統整合**：CTOS 的分享 Token 需要在 MD2PPT / MD2DOC 中被解析
2. **密碼保護**：分享內容需要 4 位數密碼驗證
3. **安全性**：Token 過期、錯誤次數限制、連結鎖定
4. **使用者體驗**：密碼對話框、載入狀態、錯誤提示

---

## 架構設計

整個分享流程分為三層：

```
┌──────────────────────────────────────────────────────────────┐
│                    MD2PPT / MD2DOC（前端）                     │
│                                                              │
│  URL 參數解析  -->  密碼對話框  -->  API 呼叫  -->  載入內容    │
│  useShareToken      ShareTokenDialog    fetch      setContent │
└──────────────────────────────┬───────────────────────────────┘
                               |
                               | GET /api/public/{token}?password=xxxx
                               v
┌──────────────────────────────────────────────────────────────┐
│                      CTOS API（後端）                          │
│                                                              │
│  Token 查詢  -->  密碼驗證  -->  過期檢查  -->  回傳內容       │
└──────────────────────────────────────────────────────────────┘
```

前端只需負責「URL 參數解析」和「密碼 UI」，後端的分享邏輯已經在 CTOS 中實作完成。

---

## useShareToken Hook

核心邏輯封裝在一個自訂 React Hook 中，MD2PPT 和 MD2DOC 共用相同的設計模式。

### URL 參數檢測

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const shareToken = params.get('shareToken');

  if (shareToken) {
    setState(prev => ({
      ...prev,
      token: shareToken,
      showPasswordDialog: true
    }));

    // 清除 URL 中的 shareToken 參數，避免重複處理
    const url = new URL(window.location.href);
    url.searchParams.delete('shareToken');
    window.history.replaceState({}, '', url.toString());
  }
}, []);
```

這段邏輯在元件掛載時執行一次：從 URL 取得 `shareToken` 參數、儲存 Token 並彈出密碼對話框、用 `history.replaceState` 清除 URL 參數避免重新整理時重複觸發。

### 密碼驗證與內容載入

```typescript
const submitPassword = useCallback(async () => {
  if (!state.token || !password) return;

  setState(prev => ({ ...prev, isLoading: true, error: null }));

  try {
    const response = await fetch(
      `${CTOS_API_BASE}/api/public/${state.token}?password=${encodeURIComponent(password)}`,
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    );

    if (response.ok) {
      const data = await response.json();
      const contentData = data.data || data;
      if (contentData.content) {
        onLoadContent(contentData.content, contentData.filename);
      }
      // 成功：關閉對話框並重置狀態
      setState(prev => ({
        ...prev, isLoading: false, showPasswordDialog: false, token: null
      }));
    } else {
      // 錯誤處理
      let errorMessage = '密碼錯誤';
      if (response.status === 404) errorMessage = '連結不存在或已過期';
      else if (response.status === 423) errorMessage = '因錯誤次數過多，連結已鎖定';
      else if (response.status === 410) errorMessage = '連結已過期';

      setAttempts(prev => prev + 1);
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
    }
  } catch (error) {
    setState(prev => ({ ...prev, isLoading: false, error: '網路錯誤，請稍後再試' }));
  }
}, [state.token, password, onLoadContent]);
```

API 回應的錯誤狀態碼對應：

| HTTP 狀態碼 | 意義 | 使用者看到的訊息 |
|------------|------|----------------|
| 200 | 驗證成功 | （直接載入內容） |
| 404 | Token 不存在 | 連結不存在或已過期 |
| 410 | Token 已過期 | 連結已過期 |
| 423 | 錯誤次數過多 | 因錯誤次數過多，連結已鎖定 |
| 401/403 | 密碼錯誤 | 密碼錯誤 |

---

## ShareTokenDialog 元件

密碼輸入對話框的幾個設計重點：

- **4 位數字限制**：用 `inputMode="numeric"` 叫出數字鍵盤，搭配正規表達式 `/\D/g` 過濾非數字字元
- **Enter 鍵送出**：不必用滑鼠點按鈕
- **嘗試次數提示**：讓使用者知道剩餘嘗試次數，5 次後鎖定
- **載入動畫**：送出後顯示 spinner，避免重複點擊

```tsx
<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
  maxLength={4}
  value={password}
  onChange={(e) => onPasswordChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
  onKeyDown={handleKeyDown}
  placeholder="請輸入 4 位數密碼"
  autoFocus
  disabled={isLoading}
/>

{error && (
  <div>
    <p>{error}</p>
    {attempts > 0 && attempts < 5 && (
      <p>已嘗試 {attempts} 次（5 次後將鎖定）</p>
    )}
  </div>
)}
```

---

## 整合進 Editor

在 `useEditorState` Hook 中，將 `useShareToken` 與編輯器狀態連接：

```typescript
const handleShareTokenLoadContent = useCallback((fileContent: string, filename?: string) => {
  setContent(fileContent);
  localStorage.removeItem('draft_content');
}, []);

const shareTokenState = useShareToken({
  onLoadContent: handleShareTokenLoadContent
});
```

當分享內容載入成功時，會替換編輯器的 Markdown 內容，並清除 `localStorage` 中的草稿。

---

## iframe 嵌入支援

除了 shareToken 之外，MD2PPT 和 MD2DOC 也支援透過 `postMessage` 在 iframe 中載入內容：

```typescript
// hooks/useCTOSMessage.ts
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    const { data } = event;
    if (data.type === 'load-file' && data.content) {
      onLoadFile(data.filename, data.content);
    }
  };

  window.addEventListener('message', handleMessage);

  // 在 iframe 中時發送 ready 訊號
  if (window.parent !== window) {
    setTimeout(() => {
      window.parent.postMessage({ type: 'ready', appId }, '*');
    }, 100);
  }

  return () => window.removeEventListener('message', handleMessage);
}, [appId, onLoadFile]);
```

兩種整合方式的比較：

| 方式 | 適用場景 | 需要密碼 | 需要 iframe |
|------|----------|---------|-------------|
| `shareToken` | 外部分享連結 | 是 | 否 |
| `postMessage` | CTOS 內部 iframe 嵌入 | 否 | 是 |

---

## 安全考量

| 面向 | 做法 |
|------|------|
| **Token 安全** | 加密安全隨機產生，6 字元 568 億種組合，可設定有效期 |
| **密碼保護** | 4 位數字，連續 5 次錯誤後鎖定（HTTP 423） |
| **前端防護** | Token 從 URL 讀取後立即清除，使用 `replaceState` 不留歷史記錄 |
| **API 回應** | 不在錯誤回應中洩漏資源資訊，只顯示使用者友好訊息 |

---

## 檔案結構

以 MD2PPT 為例，shareToken 功能涉及的檔案：

```
MD2PPT-Evolution/
├── hooks/
│   ├── useShareToken.ts       # shareToken 核心邏輯
│   ├── useCTOSMessage.ts      # iframe postMessage 整合
│   ├── useEditorState.ts      # 編輯器狀態（整合 shareToken）
│   └── useMarkdownEditor.ts   # 編輯器主 Hook
├── components/
│   ├── common/
│   │   └── ShareTokenDialog.tsx  # 密碼輸入對話框
│   └── MarkdownEditor.tsx        # 主元件（渲染 Dialog）
└── vite.overrides.ts             # Vercel 部署配置
```

MD2DOC 的結構完全一致，只是 `appId` 從 `md2ppt` 改為 `md2doc`。

---

## 小結

為 MD2PPT 和 MD2DOC 貢獻 shareToken 功能的關鍵設計：

| 面向 | 做法 |
|------|------|
| **架構** | 自訂 Hook（`useShareToken`）封裝全部邏輯，與 UI 解耦 |
| **整合** | 透過回呼函式（`onLoadContent`）對接編輯器狀態 |
| **安全** | Token 過期、密碼保護、錯誤次數鎖定、URL 清除 |
| **部署** | Vite 環境變數判斷 Vercel / GitHub Pages |
| **雙通道** | shareToken（外部分享）+ postMessage（iframe 嵌入）並存 |

這個功能讓 CTOS 的使用者可以將 Markdown 內容以「簡報」或「文件」的形式安全地分享給任何人，收到連結的人只需輸入 4 位數密碼，就能在瀏覽器中預覽、編輯、甚至匯出成 PPTX 或 DOCX。

---

## 參考資源

- [知識庫公開分享功能實作]({% post_url 2026-01-12-knowledge-sharing %})
- [MD2PPT-Evolution GitHub](https://github.com/eric861129/MD2PPT-Evolution)
- [MD2DOC-Evolution GitHub](https://github.com/eric861129/MD2DOC-Evolution)
- [React Hooks 官方文件](https://react.dev/reference/react)
- [Vercel 部署文件](https://vercel.com/docs)
