---
layout: post
title: "Service Worker 寫好了，離線卻還是恐龍頁 —— 三個 PWA 的離線與安裝踩雷"
subtitle: "幾個小專案要做成可安裝、能離線的 PWA。最離譜的坑：service worker 從頭到尾沒被啟動過，sw.js 裡卻已經來回調了三輪快取策略。這篇把這些坑、真因、和一行字的修法老實記下來。"
date: 2026-06-15
categories: [AI, 開發工具]
tags: [PWA, Service Worker, Offline, vanilla JS, GitHub Pages, AI, 甲方思維]
author: Yaze Lin
---

![PWA 離線與安裝踩雷](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-15-pwa-offline-install-pitfalls.png)

> **這篇講的三個 PWA**
> - catime —— 每小時自動生成的貓咪圖庫：<https://yazelin.github.io/catime/>
> - iPAS AI 應用規劃師模擬考站：<https://yazelin.github.io/ipas-ai-quiz/>
> - Roll Formosa(搖滾・福爾摩沙):<https://yazelin.github.io/roll-formosa/>
>
> **PWA 三部曲**　1. 離線/安裝(本篇) ·　2. [快取策略]({% post_url 2026-06-17-pwa-swr-local-first %}) ·　3. [啟動速度]({% post_url 2026-06-21-pwa-startup-priority %})

最離譜的一個坑長這樣。`sw.js` 裡認真調了三輪快取策略，cache-first、network-first、版本號來回換，離線就是修不好。後來才發現，這個 service worker 從專案開站到那一刻，**一行 `register()` 都沒有，從沒被啟動過**。那幾輪調的一切，從第一輪起就沒生效。想修的是離線，實際在做的卻是對著一個沒在跑的檔案精雕細琢三輪。

退一步說背景。最近做的幾個小專案都想要同一件事：**開網頁就能玩、按一下裝成手機 App、沒網路也能用**。也就是 PWA(Progressive Web App)。共同點是純前端 vanilla JS、沒框架、沒 build，靜態托管在 GitHub Pages / Cloudflare Pages。照理說 PWA 三件套(`manifest` + service worker + HTTPS)很標準，網路上教學一大把。但這幾個專案每一個都在「離線」和「安裝」上踩了坑。坑不在「不會寫」，而在「以為已經寫對了」。

這篇按踩到的順序記下來。

## 坑一：Service Worker 寫得再好，沒註冊就是沒在跑

先把結論放前面：catime 的 service worker 根本沒在跑，所有「離線」的功夫都打在空氣上。抓到這個結論的轉折點，是一個說不通的矛盾。

catime 的離線一直是壞的——沒網路時開，看到的是瀏覽器的恐龍頁，貓圖也從來沒被快取。一開始的修法都往很「資深」的方向走：大概是舊的 service worker 卡住了吧?清快取、改版本號、在 `sw.js` 裡來回調 `cache-first` / `network-first`……調了好幾輪，離線還是壞。

矛盾就卡在這裡：**如果 SW 真的沒問題，改快取策略怎麼一點動靜都沒有?但每次改版本號，頁面又好像真的有一點反應——那它到底在不在跑?**這兩件事不可能同時成立。查一行，矛盾就解開：

```bash
git log -S serviceWorker
```

**全空。**

整個專案從來沒有任何一行 `navigator.serviceWorker.register()`。`sw.js` 這個檔案一直存在，但它**從沒被啟動過**。所以那幾輪在 `sw.js` 裡精心調的 cache-first、network-first、precache、版本號——**全部從未生效**。

那矛盾的另一半，「改版本號好像有反應」，破在這裡：那個反應根本不是 service worker，是**瀏覽器自己的 HTTP 快取**在動。改檔名/版本號讓瀏覽器重抓資源，看起來像快取策略生效，實際上 SW 連跑都沒跑。兩個快取層一直被混為一談，才會出現「SW 沒在跑、卻好像有反應」這種看似不可能的現象。

那條修正 commit 的訊息把真因寫得很白：

> `git log -S serviceWorker` 全空 —— catime 從來沒有任何一行 `navigator.serviceWorker.register()`,sw.js 一直存在卻從沒被啟動。所以這整輪在 sw.js 做的 cache-first / network-first / precache / 版本號全部從未生效。

修法是一行(嚴格說三行)，加在每個入口 HTML:

```js
// Register the service worker (this was never wired up — without it the SW
// never ran, so no offline / no image caching). Enables the whole PWA.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
```

**教訓：`sw.js` 存在 ≠ service worker 在跑。**

> 驗證的副坑：在我這次的 chrome-devtools 自動化測試裡，SW 的 `register()` 一直沒能成功註冊(回傳的 promise 被拒，看起來像 document/context 狀態問題)，所以離線行為**沒辦法在自動化環境裡驗**，得真機/真瀏覽器測。這也是為什麼這個坑活那麼久——自動化測試一直「看起來」沒問題。(這是我這台環境的觀察，不是所有自動化瀏覽器的通則。)

## 坑一點五：多個 HTML 入口，每一頁都要各自註冊

註冊那行補上之後，還漏了一半。如果站上有**多個 HTML 入口**——catime 有首頁 + 角色頁、Roll Formosa 有遊戲頁 + 物件圖鑑頁——那**每一個入口頁都要各自註冊一次**，因為使用者可能直接從任何一頁進站，而 SW 是頁面載入時才掛上去的。

後來 Roll Formosa 的物件圖鑑頁離線打不開，就是同一個病根的另一種長相：當時只補了主頁的字型和 SW 註冊，漏了第二個入口。同一個道理犯兩次，所以把它獨立記下來——「補了註冊」和「每個入口都補了註冊」是兩件事。

## 坑二：安裝橫幅關不掉，因為 `[hidden]` 被 CSS 蓋過了

iPAS 考站我要了一條「安裝成 App」的橫幅。邏輯上它該在三種情況消失：使用者按了 ✕、已經安裝過、或本來就是用 standalone 模式開的。

寫法很直覺——HTML 給 `hidden` 屬性、JS 在該關的時候設 `el.hidden = true`。結果橫幅**怎樣都關不掉**。

可是 `el.hidden = true` 明明設下去了，打開 DevTools 一看，元素上的 `hidden` 屬性也確實在，按理說它就該消失，怎麼還關不掉?

問題是 `hidden` 屬性「在不在」和它「有沒有效」是兩回事，真因在 CSS:

```css
/* 改之前:無條件 display:flex,蓋過了 hidden 屬性 */
#installbar { display: flex; ... }
```

HTML 的 `hidden` 屬性其實只是一個預設 `display:none` 的樣式，而**任何明確的 `display` 宣告都會贏過它**。一旦寫了 `#installbar { display:flex }`，就等於宣告「這個元素永遠是 flex」，`hidden` 完全失效。

修法是讓 `hidden` 重新有效：

```css
/* 改之後:只有「沒被 hidden」時才 flex */
#installbar:not([hidden]) { display: flex; ... }
```

```html
<div id="installbar" hidden> ... </div>
```

差一個 `:not([hidden])`，但這個坑很容易在「用 CSS 控制顯示」的專案裡反覆出現。**只要同時用 `[hidden]` 屬性和 CSS `display` 控制同一個元素，就會撞。**

## 坑三：`beforeinstallprompt` 的完整生命週期

Android / 桌面 Chrome 有 `beforeinstallprompt` 事件，可以做「自家的安裝按鈕」，不用叫使用者去翻瀏覽器選單。

天真的寫法很直覺：接到事件，當場 `e.prompt()` 把安裝對話框叫出來。但這條路三處會死：其一，**`prompt()` 只能在使用者手勢裡呼叫**，在事件 callback 裡直接叫屬於非手勢觸發，會被瀏覽器擋掉;其二，**事件只能用一次**，當場用掉，之後使用者真的想裝時手上已經沒有事件可用;其三，**沒有持久化**，使用者按過 ✕ 或裝過了，事件下次再觸發橫幅又冒出來煩人。所以要做對，得把事件留存、綁到自家按鈕、再加持久化，處理完整生命週期。iPAS 最後的做法是這樣：

```js
let deferredInstall = null;
const installBarOff   = () => localStorage.getItem('ipas_installbar_off') === '1';
const dismissInstallBar = () => {
  localStorage.setItem('ipas_installbar_off', '1');      // 關閉狀態「持久化」
  const b = document.getElementById('installbar');
  if (b) b.hidden = true;
  deferredInstall = null;
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();          // 阻止瀏覽器自己的迷你橫幅
  deferredInstall = e;         // 留存事件,等使用者按按鈕才用
  // ...(若沒被關過就顯示自家橫幅)
});
window.addEventListener('appinstalled', dismissInstallBar);
```

按下安裝鈕時才真正觸發系統對話框：

```js
deferredInstall.prompt();
const c = await deferredInstall.userChoice.catch(() => ({}));
if (c && c.outcome === 'accepted') { /* 標記已安裝 */ dismissInstallBar(); }
deferredInstall = null;        // prompt 只能用一次
```

幾個容易漏的點：

1. **`preventDefault()` 後要把事件存起來**,`prompt()` 只能在使用者手勢裡呼叫、而且一個事件只能用一次。
2. **關閉狀態要持久化**。用 `localStorage('ipas_installbar_off')` 記住「使用者按過 ✕ 或已安裝」，否則 `beforeinstallprompt` 下次再觸發，橫幅又冒出來煩人。
3. **這個旗標是「裝置端狀態」，不該進雲端同步**。iPAS 有跨裝置同步(後面另一篇會講)，但「這台裝置裝過了沒」是每台各自的事——把它跟使用者的學習進度混在一起同步是錯的。這是一個「裝置端旗標 vs 帳號資料」該分開的好例子，當時也特別在註解裡標明。
4. **iOS 沒有 `beforeinstallprompt`**。Safari 要走「分享 → 加入主畫面」，所以偵測到 iOS 時要把按鈕換成文字教學，而不是讓它變成一顆按了沒反應的死鈕。

## 坑四到六：manifest / icon / favicon 的零碎坑

這些不會讓你 debug 三天，但會讓 console 髒、或讓「加到主畫面」的圖示怪怪的。

**manifest 在 GitHub Pages 子路徑下，`start_url` / `scope` 用相對路徑**。我的站常掛在 `username.github.io/repo/` 這種子路徑下，寫死 `/` 會指到網域根而不是專案根：

```json
{
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "icons": [
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`purpose: "maskable"` 別漏——沒有它，Android 把圖示塞進它的圓角/水滴遮罩時會亂裁。

**favicon 的 404**:瀏覽器會自動去要 `/favicon.ico`，沒有就一個 404 髒在 console。補一張就好——開規格時我會直接要求 `favicon.svg` + `favicon.ico` 雙保險，讓它涵蓋只認 `.ico` 的舊瀏覽器。Roll Formosa 那個 favicon 一開始只是一個 data-URI 的純色圓圈占位，後來才換成真正的吉祥物(台灣黑熊月牙)圖示，跟 PWA 圖示、安裝後的 App 圖示統一。

**`mobile-web-app-capable`**:Chrome 已經把 `apple-mobile-web-app-capable` 標為 deprecated，但 iOS 還在用。兩個並存最省事：

```html
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
```

## 小結：離線/安裝的自查清單

這篇談的是「離線/安裝能不能正常運作」。但讓 PWA 真正好用，還有兩件事：**離線時要秒開、而且內容要保持新鮮**(快取策略)，以及**啟動要快**(快取救得了下載、救不了 JS 執行)。這兩個各自是個大坑，留到接下來兩篇講。

而「能不能正常運作」這一關，把上面這幾個坑收斂成一張清單，現在開新 PWA 前會先過一遍：

- [ ] **每個** HTML 入口都有 `navigator.serviceWorker.register()`(`sw.js` 存在不算數)
- [ ] 安裝 UI 的隱藏沒被 CSS `display` 蓋過 `[hidden]`
- [ ] `beforeinstallprompt` 有 `preventDefault` + 留存 + 點鈕才 `prompt()`;關閉狀態持久化;已安裝就別再顯示;iOS 給文字教學
- [ ] 「裝過了沒」這種裝置端旗標，別跟雲端同步資料混在一起
- [ ] manifest `start_url`/`scope` 用 `./`、icon 有 `maskable`
- [ ] 補 favicon 消 404、`mobile-web-app-capable` 兩版並存

## 參考

- catime:<https://github.com/yazelin/catime>
- iPAS AI 模擬考站：<https://github.com/yazelin/ipas-ai-quiz>
- Roll Formosa:<https://github.com/yazelin/roll-formosa>
- MDN:[Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) ／ [`beforeinstallprompt`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
