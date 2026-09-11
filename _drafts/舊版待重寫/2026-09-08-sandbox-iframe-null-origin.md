---
layout: post
title: "我的站被別人嵌進去就壞，壞法有三種，根只有一個"
subtitle: "9 月 8 日我把一份簡報塞進 Larch 的小遊戲卡，那是一張 sandbox iframe。裡面再嵌的站 origin 會變成 null：格莉奇OS 停在開機畫面、聊天送不出去，格莉奇音樂進度照走卻沒聲音。一個下午修三個 PR，三個 bug 在我自己的網域上永遠不會現形。"
date: 2026-09-08
categories: [Frontend]
tags: [sandbox iframe, opaque origin, Web Audio, IndexedDB, Service Worker, Larch, 格莉奇OS, PWA]
author: Yaze Lin
---

![左邊是修好之前的格莉奇OS，在 sandbox iframe 裡停在「系統讀取中…」；右邊是修好之後，同一種 iframe，桌面正常開起來](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-09-08-sandbox-iframe-null-origin.webp)

先講結論：這三個 bug，我在自己的網域上怎麼測都測不到。要有別人把我的站嵌進他的頁面裡，它們才會現形。

封面那兩張是同一支 `index.html`，我把它放進同一種 `sandbox="allow-scripts"` 的 iframe，差別只有幾行程式碼。左邊停在「系統讀取中…」，我讓它跑到 65 秒還是那樣；右邊 2.7 秒開完機。

## 那天下午我本來在做別的事

9 月 8 日下午我在做一件跟這三個站都無關的事：把一份 16:9 的 HTML 簡報塞進 Larch 的小遊戲卡，看它能不能拿來當簡報播。那張卡是 srcdoc 加 sandbox 的 iframe，簡報本身進去得很順，16 點 35 分我把心得記進 skill 檔，本來想收工。

麻煩出在下一步：我想在簡報裡再嵌我自己的站。

sandbox iframe 少了 `allow-same-origin` 的時候，裡面那份文件拿到的是一個 opaque origin。在瀏覽器眼裡它不屬於任何網域，`window.origin` 讀出來就是字串 `null`。

我拿 Chrome 151.0.7922.169 在同款 sandbox iframe 裡量了一遍，這是探針回報的原話：

```
window.origin                → "null"
'serviceWorker' in navigator → false
window.localStorage          → SecurityError: The document is sandboxed and lacks
                               the 'allow-same-origin' flag.
indexedDB                    → object
indexedDB.open('probe-db',1) → SecurityError: access to the Indexed Database API
                               is denied in this context.
caches                       → undefined
```

翻成一句話：那裡沒有儲存空間。localStorage 連讀都不能讀，IndexedDB 的門把還在、門是焊死的，Service Worker 跟 CacheStorage 整個不見。

這就是我那個下午修的三個 bug 的同一個根。它們的差別只在各自踩到哪一格。如果你手上也有站，而且那個站有機會被別人用 iframe 嵌進去（部落格外掛、簡報卡、教學平台的內嵌框、別人整理的工具清單頁都算），下面這三個坑現在大概就在你的站裡。

## 17 點 03 分：停在開機畫面，真兇是一顆安裝按鈕

我先修 [格莉奇OS]({% post_url 2026-08-05-glitch-os %})，因為它壞得最難看：嵌進去以後停在「系統讀取中…」，進度條一格都不動。

真因短得有點好笑。整頁的主程式是一支 classic script，中間有一段管 PWA 安裝按鈕的 IIFE，最後一行呼叫 `showButton()`：

```js
function showButton(){button.hidden=standalone()||localStorage.getItem(KEY)==='yes';}
```

它只是想問 localStorage 裡有沒有記過「這台裝過了」。這個 `localStorage` 一讀就丟 SecurityError，沒有人接，整支 classic script 從這裡陣亡。開機動畫的程式碼在那一行下面兩百五十行，一次都沒跑到。所以我看到的那個畫面根本不是開機開到一半失敗。開機從頭到尾沒有開始，畫面停在 HTML 裡寫死的那張底圖上。

修法是在腳本開頭放一段墊片：`localStorage` 跟 `sessionStorage` 一碰就丟的環境裡，換一個記憶體版的物件頂上去。PR #31 連 README 一起 13 行進、4 行出，動三個檔案。

真因是不是這一段，我自己量過。今天為了寫這篇，我回頭做了一組重現：兩個本機伺服器、同款 sandbox iframe、一個只補墊片其他什麼都不動的中間版本、開機耗時對照。那組腳本是 AI 寫的，驗收標準是我定的，要能量出 2701 對 2700 才算數。量出來的結果：只補墊片、其他什麼都不動，開機 2.7 秒完成，跟完整修好的版本一模一樣，2701 毫秒對 2700 毫秒。沒補墊片的那份，我盯到 65 秒還停在原地。

順便講一個誠實的補充。PR #31 還改了另一半：Service Worker 讀不到就立刻讓開機進度條放行，不要空等 20 秒逾時。這一半在 Chrome 151 上我量不出差別，因為 `'serviceWorker' in navigator` 在 sandbox 裡直接是 false，那道閘門本來就是開的。它擋的是另一種瀏覽器：屬性在、一碰才丟。

## 17 點 27 分：站開起來了，話送不出去

第一個 PR 合完 24 分鐘後我開了第二個。

站開得起來了，可是我在那張卡裡打字送出，畫面完全沒反應，連自己那則綠泡泡都沒出現。

`sendChat` 的第三行是這樣：

```js
history.push(msg);await dbSet('chat',history);
```

訊息先寫進 IndexedDB，才輪到渲染泡泡、才輪到打後端。`dbSet` 會走到 `indexedDB.open`，那一行在 opaque origin 裡同步丟 SecurityError，`sendChat` 在第三行就斷掉。上面探針那一格「屬性在、open 才丟」害人的地方就在這裡：任何 `if('indexedDB' in window)` 式的守衛都會一路放行。

修法是讓 `db()` 開不了的時候回 `null`，`dbGet`、`dbSet`、`dbDel` 三支同步退到一個記憶體 Map。

退了之後哪些還在、哪些沒了，是我一項一項點過的，因為 README 那條限制就是照這個寫的：聊天、記憶摘要、桌布選擇、設定分頁全部照常運作，功能一項都沒少；但那個環境裡什麼都不會被記住，卡片關掉就整組回到出廠狀態。PR #32 是 8 行進、7 行出。

我想過乾脆偵測到 opaque origin 就跳一頁警告，最後沒讓它這樣做。在別人的頁面裡，降級活著比擋下來有用，這是我的判斷。

## 23 點 36 分：進度在走，喇叭沒聲音

同一天晚上輪到格莉奇音樂。

我按下播放，進度條在走、狀態顯示播放中、歌詞一句一句跟著亮，喇叭無聲，頻譜一條平線。我單獨開網址，一切正常。

真因還是那個 null。這一頁在桌面版會把 `<audio>` 接進 Web Audio：

```js
const src=actx.createMediaElementSource(audioLocal);
src.connect(analyser);analyser.connect(actx.destination);
```

聲音全部經過這條線才到喇叭。而在 opaque origin 裡，自家的 mp3 對這一頁來說已經算跨網域資源；媒體元素沒有標 `crossorigin`，載進來的東西就被判成污染來源，接進 AudioContext 之後輸出整條是零。播放器沒壞，它老老實實在播一段全零的音訊。

改法是一個屬性：

```html
<audio id="music-audio" preload="metadata" playsinline crossorigin="anonymous"></audio>
```

這個屬性是 AI 補上去的，跟前面那段墊片、那個記憶體 Map 一樣，我出判斷，它動手。GitHub Pages 對音檔本來就回 `Access-Control-Allow-Origin: *`，所以標上去就成立，換別的主機要自己確認這個標頭還在。PR #36 連 README 一起 4 行進、2 行出，`index.html` 只動一行。三個 PR 裡的驗證腳本也都是 AI 寫的，這一支記下來的數字是：修之前頻譜畫布固定 611 個亮像素，修之後五千多，而且逐幀在變。

這裡還有一個反直覺的地方，我差點被它騙過去。這一頁在行動裝置上一律不接頻譜 graph，那是更早為了「Android 關螢幕會斷音」加的；所以同一張卡我拿手機開反而有聲音。「手機上是好的」在這件事裡只會讓 bug 更難被回報。

## 隔天早上 9 點 39 分我又中了一次

而且一次兩個站：貓貓進行曲的播放器頁，跟おもてなし地獄那支循環播放器，同樣沒標 `crossorigin`，同樣整條靜音。貓貓那個還一併中了第一種，首頁的安裝鈕腳本照樣直接碰 localStorage。那一輪我順手補了負控制，把屬性拿掉再量一次，analyser 能量是 0，加回去是 12795。

到這裡已經是同一個根、五個站、我踩了五次。

## 為什麼我在自己的網域上永遠測不到

因為在我自己家裡，這三段程式碼走的全是快樂路徑。本機開、GitHub Pages 開、裝成 PWA 開，origin 都正常，儲存空間都在，Web Audio 拿到的都是同源音檔。三個 bug 一個都不會出現。

我那支 pwa-check 也接不到。它會斷網、會模擬改版、會驗離線包（[那一輪掃了 13 個 repo]({% post_url 2026-08-07-pwa-check-sweep %})），可是它驗的是站在自己環境裡的行為。沒有任何一項在問「這個站被塞進一個 opaque origin 之後還活不活」。

## 現在它是一句照著檢查就好的話

9 月 9 日我把簡報那張卡做成了正式的插件。三支 README 各要留下哪一句限制，是我一句一句挑的，插件這邊留下的是這段，寫的是「要嵌別人的站，對方得先滿足什麼」：

> 嵌站的條件：對方沒設 `X-Frame-Options`（GitHub Pages 沒有，Larch 市集頁有），而且對方站要禁得起「沒有儲存空間」的環境。這張卡是 sandbox iframe，裡面再嵌的站 origin 會是 `null`，`localStorage`、IndexedDB、Service Worker 全部一碰就丟 SecurityError，音訊要標 `crossorigin="anonymous"` 才進得了 Web Audio。

倒過來念，它就是自己的站的檢查清單：碰 storage 的地方要包起來、IndexedDB 要有記憶體退路、`<audio>` 要標 `crossorigin`。三件都便宜，三件在正常情況下都沒有任何跡象。

## 想自己驗一次

最小的重現只要一個檔案：起一個本機靜態伺服器，寫一頁 `<iframe sandbox="allow-scripts" src="你的站">`，開來看 console。上面那張探針表，就是我這樣量出來的。

三個修法的完整 diff 在這裡：<https://github.com/yazelin/ai-brain-site/pull/31>、<https://github.com/yazelin/ai-brain-site/pull/32>、<https://github.com/yazelin/glitch-music/pull/36>。
