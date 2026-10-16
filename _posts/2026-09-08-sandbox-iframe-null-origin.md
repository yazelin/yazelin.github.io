---
layout: post
title: "同一份 index.html，放進別人的頁面就開不起來"
subtitle: "9 月 8 日下午拿 Larch 的小遊戲卡試嵌自己的站。那張卡是 sandbox iframe，裡面的 origin 是 null：格莉奇OS 停在開機畫面、聊天視窗整個空的，格莉奇音樂進度照走卻沒聲音。三個 PR 修完，寫這篇時把量測重跑一次，量到的死因跟 PR body 寫的不一樣。"
date: 2026-09-08
categories: [Frontend]
tags: [sandbox iframe, opaque origin, Web Audio, IndexedDB, Service Worker, Larch, 格莉奇OS, 驗收]
author: Yaze Lin
---

![左邊是修好之前的格莉奇OS，在 sandbox iframe 裡停在「系統讀取中…」；右邊是修好之後，同一種 iframe，桌面正常開起來](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-09-08-sandbox-iframe-null-origin.webp)

先講結論：這三個 bug 在我自己的網域上不會出現。要有別人把我的站放進他的頁面裡，它們才長得出來。

觸發條件是站被別人用 **sandbox** iframe 放進頁面，而且沒開 `allow-same-origin`。一般的 iframe 不會這樣，要下了 sandbox 旗標，origin 才會被洗成 null。Larch 那張小遊戲卡就是這種。另外 IndexedDB 那一條在自己的網域上也會中，只要瀏覽器封鎖了網站資料。

## 那張卡把 origin 洗成 null

9 月 8 日下午我在試 Larch 的小遊戲卡，想知道它能不能拿來播 16:9 的 HTML 簡報。簡報本身放進去了，踩到的坑也收進了 skill 檔。下一步想在簡報裡再嵌自己的站，麻煩從這裡開始。

那張卡是 sandbox iframe，沒有開 `allow-same-origin`。少了這個旗標，裡面的文件拿到的是 opaque origin：瀏覽器不認它屬於任何網域，`window.origin` 讀出來就是字串 `null`。

寫這篇時整組重現重跑了一次。Chromium 149.0.7827.55、`sandbox="allow-scripts"` 的 iframe、兩個本機靜態伺服器。探針是頁面自己的 script，跑完把結果寫進 DOM：

```
window.origin                  →  "null"          （同一頁開在最上層：http://127.0.0.1:8816）
window.isSecureContext         →  true
'serviceWorker' in navigator   →  true
navigator.serviceWorker        →  SecurityError: Service worker is disabled because the
                                  context is sandboxed and lacks the 'allow-same-origin' flag.
window.localStorage            →  SecurityError: The document is sandboxed and lacks the
                                  'allow-same-origin' flag.
typeof indexedDB               →  object
indexedDB.open('probe',1)      →  SecurityError: access to the Indexed Database API is
                                  denied in this context.
typeof caches                  →  SecurityError: Cache storage is disabled ...
document.cookie                →  SecurityError: The document is sandboxed ...
```

那裡沒有儲存空間。連 `window.localStorage` 這個屬性本身都讀不到，一讀就丟。

探針要由頁面自己的程式碼跑，這是追查時踩到的坑。同一組檢查改用 Playwright 的 `frame.evaluate` 從外面問，`localStorage.getItem` 會回 ok，`caches` 跟 `indexedDB.open` 照樣丟。原因在被測的那一頁：它已經把 `window.localStorage` 換成記憶體版了，從外面問當然回 ok。拿還沒補墊片的裸頁去問，從外面問一樣會丟。所以探針要問的是「站上的 script 現在拿到什麼」。

## 格莉奇OS：開機從來沒有開始

先修的是 [格莉奇OS]({% post_url 2026-08-05-glitch-os %})。嵌進去以後它停在「系統讀取中…」，進度條一格不動。修的是 PR #31，動三個檔案，13 行進、4 行出。

PR body 當時寫了兩條死因：主程式開機就呼叫 localStorage，整支 classic script 陣亡；Service Worker 在 sandbox 註冊必失敗而且靜默，開機進度條只能等 20 秒逾時。

重跑量測之後，這兩條都不完全對。

整頁的主程式是一支 classic script。裡面第一個碰到禁區的是 Service Worker，位置比安裝按鈕那行 localStorage 早了十九行。而且它沒走到註冊那一步：

```js
if('serviceWorker'in navigator){
  const requestAssetWarm=()=>navigator.serviceWorker.ready.then(...)
  navigator.serviceWorker.addEventListener('message',event=>{
```

`'serviceWorker' in navigator` 在這個環境是 **true**，所以 `if` 進得去。下一行只是定義一個箭頭函式，定義時不求值。真正丟 SecurityError 的是再下一行的 `navigator.serviceWorker.addEventListener`。

所以程式碼走不到 `register()`，那條 20 秒逾時也沒機會跑，因為管開機動畫的程式在同一支 script 更後面，一次都沒執行。畫面上停著的，是 HTML 裡寫死的那張底圖。

安裝按鈕那行讀 localStorage 判斷這台裝過沒有，在這個環境也會丟，只是輪不到它。第二個死掉的是另一支檔案 `js/glitch-call.js`，它自己也讀 localStorage，classic script 各死各的。

修法兩段：storage 一碰就丟的環境，換一個記憶體版的物件頂上去；Service Worker 那段包 try/catch，拿不到就當沒有，開機進度條直接放行。

兩段都要有，少一段，開機畫面四十秒內都收不起來。五個版本、每個量兩次、交錯跑：

| 版本 | 開機畫面收起來 |
|---|---|
| 修之前（5332920） | 30 秒到還停著（2/2） |
| 只補 storage 墊片 | 40 秒到還停著（2/2） |
| 只包 Service Worker | 40 秒到還停著（2/2） |
| PR #31（兩段都在） | 2713、2719 毫秒 |
| PR #32 之後 | 2693、2730 毫秒 |

只補一半的那兩份，卡住的理由剛好對調。只補墊片的那份，console 唯一的錯誤是 `navigator.serviceWorker`；只包 SW 的那份，唯一的錯誤是 localStorage 兩筆。

## 聊天視窗整個是空的

第一個 PR 合進去 24 分鐘後開了第二個。

`sendChat` 的第三行是這樣：

```js
history.push(msg);await dbSet('chat',history);
```

訊息先寫進 IndexedDB，才輪到畫泡泡、打後端。`dbSet` 會走到 `indexedDB.open`，那一行在這裡丟 SecurityError，`sendChat` 就斷在第三行。

上面探針表裡 `typeof indexedDB` 是 object，害處就在這裡：門把在，門是焊死的。任何 `if('indexedDB' in window)` 式的守衛都會一路放行。

這次重跑把後端請求攔在本機、回一句固定的假回覆，量的是畫面。PR #31 跟 PR #32 兩版各跑七次，交錯：

- PR #31 那版，七次都一樣：聊天視窗 0 個泡泡，連內建的招呼語都沒有，console 兩筆 `IDBFactory` 的 SecurityError。
- PR #32 那版，七次都一樣：招呼泡泡出來、零 pageerror。用鍵盤 Enter 送出的三次，「哈囉」跟假回覆都畫出來了。用自動點擊按送出鈕的四次只中一次，那是點擊落點的問題，跟站無關。

修法是 `db()` 開不了就回 `null`，`dbGet`、`dbSet`、`dbDel` 三支同步退到一個記憶體 Map。8 行進、7 行出。

偵測到 opaque origin 的時候，修法沒有把功能停掉，是降級讓它繼續活著。這個做法是 AI 在第一個 PR 之前提的，我回的是「好 更新」。格莉奇OS 的 README 最後留下這句：功能照常運作，只是那個環境裡什麼都不會被記住。

## 格莉奇音樂：進度在走，喇叭沒聲音

同一天晚上輪到格莉奇音樂。按下播放，進度條在走、狀態顯示播放中、歌詞一句一句跟著亮，喇叭卻沒聲音，頻譜是一條平線。單獨開網址，一切正常。

根還是那個 null。這一頁在桌面版會把 `<audio>` 接進 Web Audio：

```js
const src=actx.createMediaElementSource(audioLocal);
src.connect(analyser);analyser.connect(actx.destination);
```

自家的 mp3 走這條線到喇叭（電台跟網路歌走另一個不接頻譜的元素，不受影響）。在 opaque origin 裡，自家的 mp3 對這一頁來說已經算跨網域資源。媒體元素沒標 `crossorigin`，載進來的東西就被判成污染來源，接進 AudioContext 之後輸出整條是零。播放器沒壞，它在播一段全零的音訊。

改法是一個屬性：`crossorigin="anonymous"`。PR #36 動三個檔案，4 行進、2 行出，`index.html` 只動一行。GitHub Pages 對音檔本來就回 `Access-Control-Allow-Origin: *`，所以標上去就成立；換別的主機，要自己確認這個標頭還在。

這次重跑沒用那一頁，另外寫了一份最小重現：一支 `<audio>`、一個 analyser、一個會回 `Access-Control-Allow-Origin: *` 的本機伺服器。變因兩個：有沒有 `crossorigin`、在不在 sandbox iframe 裡。每格量兩次，數字是播放四秒內 analyser 頻譜的最大總能量：

| | `crossorigin="anonymous"` | 沒有這個屬性 |
|---|---|---|
| sandbox iframe 裡 | 23477、24050 | **0、0** |
| 直接開在最上層 | 24296、24050 | 23729、23825 |

四格裡只有一格是 0。右下角那格就是自己測不到的原因：開在最上層時，少了那個屬性照樣有聲音，能量跟左邊在同一個量級。

而那格 0 的旁邊，`audio.currentTime` 照樣走到 3.97 秒、`paused` 是 false、AudioContext 是 running。

9 月 8 日 17 點 30 分，AI 在筆記裡寫的是「內層音訊實測會出聲」，證據是 audio 元素在走、音量 0.8、沒靜音、新開的 AudioContext 是 running。重跑的最小重現裡，其中三項確實成立：元素在走、沒有暫停、AudioContext 是 running，音量那項沒量。可是輸出是零。六小時後 AI 才量到頻譜畫布固定 611 個亮像素（這個數字是 PR #36 記下來的）。

只看元素狀態不叫驗收，要嘛耳朵去聽，要嘛機器去量實際輸出。那句筆記到今天還留在 skill 檔裡沒改。

## 隔天早上，又兩個站

9 月 9 日早上輪到貓貓進行曲的播放器頁，跟おもてなし地獄那支循環播放器。同樣沒標 `crossorigin`，同樣整條靜音。貓貓那個還一併中了第一種：首頁安裝鈕的腳本直接碰 localStorage。

那兩個 commit 裡記了負控制：屬性拿掉，analyser 能量 0；加回去，貓貓 7095、おもてなし 12795。

到這裡是同一個根、四個站。

## 為什麼在自己的網域上測不出來

在自己的網域上，這三段程式碼走的都是快樂路徑。本機開、GitHub Pages 開、裝成 PWA 開，origin 正常、儲存空間在、Web Audio 拿到的是同源音檔。上面那張 2×2 的右下角就是這個樣子。

pwa-check 也接不到。它會斷網、模擬改版、驗離線包（[那一輪一次修了 13 個 repo]({% post_url 2026-08-07-pwa-check-sweep %})），驗的是站在自己環境裡的行為。沒有一項在問「這個站被塞進 opaque origin 之後還活不活」。

## 現在它是一條照著念就好的規則

9 月 9 日凌晨，簡報卡做成了正式的插件，README 裡留下嵌站的條件：

> 嵌站的條件：對方沒設 `X-Frame-Options`（GitHub Pages 沒有，Larch 市集頁有），而且對方站要禁得起「沒有儲存空間」的環境。這張卡是 sandbox iframe，裡面再嵌的站 origin 會是 `null`，`localStorage`、IndexedDB、Service Worker 全部一碰就丟 SecurityError，音訊要標 `crossorigin="anonymous"` 才進得了 Web Audio。

倒過來念就是自己這邊的檢查清單：碰 storage 的地方要包起來、IndexedDB 要有記憶體退路、`<audio>` 要標 `crossorigin`。三件都便宜，三件在正常情況下都沒有任何跡象。

## 想自己驗一次

最小的重現只要兩個檔案：起一個本機靜態伺服器，另一頁寫 `<iframe sandbox="allow-scripts" src="你的站">`，探針寫進站裡，不要從外面問。

三個修法的完整 diff：<https://github.com/yazelin/ai-brain-site/pull/31>、<https://github.com/yazelin/ai-brain-site/pull/32>、<https://github.com/yazelin/glitch-music/pull/36>。

程式碼、墊片、三個 PR 裡的驗證腳本、寫這篇時重跑的這組重現，全部是 AI 寫的，降級的做法也是它提的。我做的是說好、回報格莉奇音樂在 iframe 裡沒聲音而單獨開網址就有，隔天再要另外兩個站也要能嵌。
