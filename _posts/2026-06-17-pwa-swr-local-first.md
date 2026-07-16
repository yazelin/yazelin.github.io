---
layout: post
title: "離線能開只是及格 —— 一份 Service Worker 裡的四種快取策略，跟「本機優先」怎麼做對"
subtitle: "同一套 sw.js，有人嫌「永遠看不到新貓」，有人嫌「每次開都轉半天」——兩種相反的爛體驗，根因都是用錯快取策略。這篇記錄我發包給 AI 的兩個小站(貓咪圖庫 catime、iPAS 模擬考站)怎麼按資料性質把快取分成四種，以及 SWR 為什麼會「自己攔自己」。"
date: 2026-06-17
categories: [AI, 開發工具]
tags: [PWA, Service Worker, 快取策略, vanilla JS, AI, 甲方思維]
author: Yaze Lin
---

![一份 Service Worker 裡的四種快取策略](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-17-pwa-swr-local-first.png)

> **這篇講的兩個 PWA**
> - catime —— 每小時自動生成的貓咪圖庫：<https://yazelin.github.io/catime/>
> - iPAS AI 應用規劃師模擬考站：<https://yazelin.github.io/ipas-ai-quiz/>
> - repo:<https://github.com/yazelin/catime> ／ <https://github.com/yazelin/ipas-ai-quiz>
>
> **PWA 三部曲**　1. [離線/安裝]({% post_url 2026-06-15-pwa-offline-install-pitfalls %}) ·　2. 快取策略(本篇) ·　3. [啟動速度]({% post_url 2026-06-21-pwa-startup-priority %})

我發包的貓圖庫上線後，有人回報「開很快，但永遠看不到新貓」;另一個站卻是反過來，「每次開都轉半天」。同一套 `sw.js`，兩種完全相反的爛體驗，根因卻是同一個：**用錯了快取策略。**

[上一篇]({% post_url 2026-06-15-pwa-offline-install-pitfalls %})講的是離線到底有沒有在運作：service worker 有沒有被註冊、安裝橫幅關不關得掉這類「能不能用」的坑。那些修好之後，離線確實打得開了。但上面那兩個回報說明，**「打得開」只是及格。**

要的是兩件事疊在一起：**畫面要秒出**(直接吃本機快取，不等網路)，而且**內容要保持新鮮**(背景默默把新東西補上)。這就是「本機優先」(local-first)。難就難在不是所有資料都該用同一招快取。貓圖永遠不變，但 HTML 隨時會改版;題庫是一包塞死的小檔，貓圖卻是個 680MB 起跳的遠端圖庫。「永遠看不到新貓」是 HTML/清單被當成不可變資源快取死了，「每次開都轉半天」是該秒給的東西卻在傻等網路。同一個病根，兩種症狀。

這篇把這兩個站的快取策略老實記下來。要先講清楚一件事：**「按資料性質分策略」是個產品判斷，不是技術細節。**哪種資料該秒給、哪種該永遠拿最新，得先想清楚才寫得對。

## 一份 `sw.js`，按資料性質分四種策略

catime 的 `docs/sw.js` 在同一個 service worker 裡，對不同資源走了四種完全不同的快取策略。核心的判斷是哪種資料配哪種策略，策略長這樣(那條改成 SWR 的 commit 是 `cca4335c`,06-24):

```js
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // 1. 貓圖 → cache-first(不可變、放自己的永久 cache)
  if (isCatImage(url)) { event.respondWith(cacheFirst(request, CATS_CACHE)); return; }

  // 2. catlist.json → stale-while-revalidate(先給本機、背景更新)
  if (CATLIST_RE.test(url.pathname) || url.href.includes("catlist.json")) {
    if (url.search) { event.respondWith(fetch(request)); return; }  // 帶 query 直接走 network
    // …先回 cached、背景 fetch 更新 cache
    return;
  }

  // 3. HTML / CSS / JS → network-first(永遠先拿最新)
  if (request.destination === "document" || request.destination === "style" || request.destination === "script") {
    event.respondWith(networkFirst(request));
    return;
  }

  // 4. icons / avatars / 角色 JSON → cache-first
  // …
});
```

為什麼要分這麼細?這裡得先擋一個很合理的反問，這也正是 AI 第一版會給的答案：**「既然目標是離線，那全部 cache-first、一招到底不就好了?」** 全 cache-first 確實離線最猛、永遠秒開，聽起來無懈可擊。但它會直接生出開頭那兩種爛體驗：HTML 一旦進了快取就**永遠推不動新版**，使用者卡在某個舊版本永世不得超生(「每次開都轉半天」那個站，後來查就是退版邏輯被舊殼卡住);catlist 也一樣，第一次抓到的清單被快取死，**永遠看不到新貓**。反過來全 network-first 呢?那就違背了「秒開」，每次都先去問網路，離線時更是直接退化。

所以沒有一招打天下。判斷依據是這四類資料的「變化頻率」和「能不能等」根本不一樣：

| 資源 | 性質 | 策略 | 理由 |
|---|---|---|---|
| 貓圖(Release asset) | 一旦發佈**永不改變** | cache-first，放**獨立**的 `catime-cats-v1` | 拿到就快取一輩子，而且更新 app 時別清掉(看過的貓要留著) |
| `catlist.json` | 會長新貓，但舊的不動 | **stale-while-revalidate** | 先秒給本機快照，背景補新的 |
| HTML / CSS / JS | 改版隨時會變 | network-first | 永遠先拿最新，離線才退回快取 |
| icons / avatars / 角色 JSON | 幾乎不變的小檔 | cache-first | 沒必要每次問網路 |

兩個我覺得寫得很對的細節：

**第一，貓圖用獨立的 cache，而且 activate 時不清它。** `STATIC_CACHE` 會隨版本號汰換(現在是 v8)，但 `CATS_CACHE`(`catime-cats-v1`)在清舊快取時被刻意排除：

```js
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // 清掉舊的 static cache;但 KEEP 貓圖 cache,讓看過的圖撐過版本更新
      Promise.all(keys
        .filter((k) => k !== STATIC_CACHE && k !== CATS_CACHE)
        .map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
```

如果貓圖跟 app 殼共用一個 cache，每次改版清快取就會把使用者離線看過的貓一起清掉——那離線體驗等於每次更新都歸零。

**第二，cache-first 要連 opaque response 一起收。** 貓圖是跨來源的 GitHub Release asset,`fetch` 拿到的是 opaque response(`type === "opaque"`,status 讀不到)。如果只認 `resp.ok`,opaque 永遠存不進去：

```js
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((hit) =>
      hit || fetch(request).then((resp) => {
        if (resp && (resp.ok || resp.type === "opaque")) cache.put(request, resp.clone());
        return resp;
      })
    )
  );
}
```

## SWR 的背景更新，要繞過 SW 自己的快取

第二種策略 stale-while-revalidate 最值得單獨講，因為「永遠看不到新貓」最後就收斂到這裡，而真因比想像中刁鑽。

先說結論：**service worker 把自己發出去的背景更新請求，也當成一般請求攔了下來，回了本機快取給自己。自己攔自己，清單永遠更新不了。** 一開始完全不是往這個方向想的。

當時看到的現象是一組矛盾：程式碼裡明明有發 `fetch` 去抓最新清單，Network 面板也確實看到那個請求，回的還是 200，一切看起來都對，可畫面上的清單就是永遠停在舊的。fetch 有發、網路有回、結果沒進來，問題只可能卡在「請求出去」跟「資料回畫面」之間那一層。而那一層，正是 service worker。倒推到這裡才發現：SWR 的背景更新請求走的是一般路徑，被 SW 的 fetch handler 接住，SW 一看「這是 catlist」就回了本機那份 stale 快取，背景更新自己又拿到舊的，revalidate 形同空轉。

SWR 的精神本是：**先把本機快取那份立刻回給畫面(stale，使用者馬上看到東西)，同時在背景去抓最新的(revalidate)更新快取。** catime 的「最新」區塊就靠這個：你一開站看到的是上次快取的貓清單(瞬間出現)，背景再把這一小時內新生成的貓補進去。問題就出在那個「背景去抓最新」如果走一般請求，會被 SW 攔截後回快取，永遠拿不到真正的最新。

解法是讓「頁面主動查最新」這件事走一條 SW 不碰的路：頁面端發一個**帶 cache-bust query** 的請求(`?_=Date.now()`),SW 看到帶 `search` 的請求就直接放行給 network、不快取。

頁面端(`docs/app.js`):

```js
function checkForNewCats() {
  if (!allCats.length) return;
  const cachedMax = allCats.reduce((m, c) => Math.max(m, c.number || 0), 0);
  fetch(CATLIST_URL + (CATLIST_URL.includes("?") ? "&" : "?") + "_=" + Date.now())
    .then(r => r.ok ? r.json() : null)
    .then(fresh => {
      // 只把編號比本機最大值還新的貓拉到最前面、highlight 進「最新」區塊
      // …
    })
    .catch(() => {});
}
```

SW 端(`docs/sw.js`)對應地短路掉帶 query 的 catlist 請求：

```js
if (CATLIST_RE.test(url.pathname) || url.href.includes("catlist.json")) {
  // 帶 cache-bust(?_=...)的是頁面在問「真正最新」,直接走 network、不快取
  if (url.search) { event.respondWith(fetch(request)); return; }
  // 不帶 query 的才走 SWR:先回 cached,背景 fetch 更新 cache
  event.respondWith(/* …cached || fresh… */);
  return;
}
```

這樣分工很乾淨：**沒帶 query 的請求(例如首次載入清單)走 SWR，享受本機秒出;頁面要主動比對最新時，帶上 cache-bust 走純 network，繞過整個 SW 快取層。** 兩條路互不打架。

## install 時主動全量 precache「App 殼」，而且要容錯

光有 fetch 策略還不夠。network-first 的退路是「離線時退回快取」——但如果那個檔**從來沒被快取過**呢?首次造訪、或某個入口頁從沒滑到過，離線時就直接打不開。

所以 catime 在 `install` 時主動把整套 app 殼 precache 進去(`b9631b45`，把 `STATIC_CACHE` v5→v6)，不再只依賴「上次上線時 network-first 順手快取」：

```js
const CORE = [
  "./", "index.html", "style.css", "app.js", "dom-utils.js",
  "character.html", "character.js", "manifest.json",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon-32.png", "favicon.ico",
  CATLIST_URL,
  "avatars/momo.webp", /* …角色頭像… */
  RAW + "index.json", /* …角色 JSON… */
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))   // 容錯:壞一個不毀整個安裝
      .then(() => self.skipWaiting())
  );
});
```

這裡的關鍵是 **`Promise.allSettled`，不是 `Promise.all`**。得先承認：`cache.addAll(...)`(本質就是 `Promise.all`)才是 MDN 跟幾乎每篇 service worker 教學的標準寫法，一行搞定、語意乾淨，我自己看 AI 第一版用 `addAll` 也不覺得有問題。它的標準性沒錯，錯在用在了不該用的場合。`addAll` 是原子的：**任何一個 URL 失敗，整批 reject、`install` 失敗、service worker 裝不起來。** 當你的 precache 清單**含跨來源資源**(這裡是跨來源的 catlist、角色 JSON)，這些資源只要一個 404 或網路抖動，就把整個離線能力連坐賠掉，為了一張圖犧牲全部。`allSettled` 換成「能存的都存，壞的跳過」，安裝照樣成功。標準寫法不等於這個場合的對寫法。

但 precache 也有它救不了的東西。catime 的貓圖維持 on-demand 的 cache-first,**不**進 precache 清單，commit 訊息寫得很白：貓圖約 2258 張、680MB，不可能全預存。所以 catime 的離線只能看「已經滑過(已快取)的貓」，這是**大型遠端圖庫的先天限制**。對照之下，ipas 的題庫是一包 bundled 的小 JSON，可以整包塞進去離線，這也是下一段 ipas 敢用 `addAll` 原子安裝的底氣。**「該 precache 多少」是看你的資料是小型 bundled 還是大型遠端，沒有一招打天下。**

## 離線失敗的圖，網路回來時自己復原(bonus)

這段補的是一個**相鄰的離線 UX 坑**:不是 SW 快取的事，而是頁面端的事，算這篇的 bonus。會放進來，是因為它跟前面的策略剛好互補。

問題是這樣：離線時載入失敗的 `<img>`,**就算網路回來了也不會自己重試**。壞掉的 img 是死的，瀏覽器不會幫你重新發請求。

catime 的處理(`cca8e5d6`)是：圖載入失敗時，把原本的網址記在佔位元素的 `dataset.retry` 上，然後監聽 `window` 的 `online` 事件，網路一回來就把這些記下來的圖重建、重載：

```js
function handleImgError(img, isLightbox) {
  const placeholder = document.createElement("div");
  placeholder.className = isLightbox ? "lb-img-error" : "img-error";
  placeholder.textContent = "🐱";
  // 記住網址,等網路回來時可以復原這張圖
  if (!isLightbox && img.src) placeholder.dataset.retry = img.src;
  img.replaceWith(placeholder);
}

// 網路回來時,把離線失敗的卡片圖重試一次(壞掉的 <img> 自己不會重發請求)
window.addEventListener("online", () => {
  document.querySelectorAll(".img-error[data-retry]").forEach(ph => {
    const img = document.createElement("img");
    img.src = ph.dataset.retry;
    // …load 成功就換回真圖、再壞就退回佔位…
    ph.replaceWith(img);
  });
});
```

這跟快取策略是互補的：cache-first 決定「有快取就秒給」，這段補的是「沒快取、離線當下抓不到、但網路一回來就無痛補上」。使用者不用手動重新整理，斷線時的破圖會自己變回貓。

## ipas 的極簡版：一招 SWR + 版本號觸發更新

不是每個站都需要 catime 那種四策略分流。ipas 模擬考站的資料單純多了，一包 app 殼加一個塞死的題庫 JSON，全是同源小檔。它的 `sw.js`(從 `510039b` 引入)就用一招 SWR 打通全部：

```js
const CACHE = 'ipas-v38';
const SHELL = ['./', 'index.html', 'build.html', 'app.js', 'core.js', 'manifest.json',
               'favicon.svg', 'questions.json', 'concepts.json', 'exam-dates.json',
               'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL); // 核心檔:原子,任一失敗則安裝失敗(本來就該齊)
    // 帶圖題的圖:best-effort 預載,壞一張不影響其他
    try {
      const q = await (await (await c.match('questions.json')) || await fetch('questions.json')).json();
      const imgs = [...new Set(q.questions.filter((x) => x.image).map((x) => x.image))];
      await Promise.allSettled(imgs.map((u) => fetch(u).then((r) => r.ok && c.put(u, r))));
    } catch {}
    await self.skipWaiting();
  })());
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  // 只接管同源 GET;跨網域(同步 worker)不攔
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = await c.match(r);
    const net = fetch(r).then((res) => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
```

值得注意的幾個對照點：

1. **核心檔用 `addAll`(原子)，帶圖題的圖用 `allSettled`(容錯)。** 這跟 catime 的取捨同一個邏輯，只是顆粒度反過來：ipas 的 SHELL 是「本來就該齊全」的小檔，缺一個就該裝失敗;但帶圖題的圖屬於 best-effort，壞一張不該毀掉整個安裝。**該原子的原子、該容錯的容錯。**
2. **只接管「同源 GET」。** 開頭那行 `new URL(r.url).origin !== location.origin` 直接放行跨域請求——因為 ipas 有一個選用的 Cloudflare Worker 做跨裝置同步，SW 要是手癢去攔那些跨域呼叫，只會把同步搞壞。**service worker 別貪心去攔不屬於你的請求。**
3. **更新靠 bump 版本號。** 改了任何被快取的檔(index / app / questions…)，就把開頭的 `CACHE` 版號 +1(現在已經滾到 `ipas-v38`)。新版號 = 新 cache，舊 cache 在 `activate` 時被清掉，使用者自然拿到新版。這是純靜態站「沒有 build、沒有 hash 檔名」時最樸素可靠的快取失效手段。

ipas 的 SWR 跟 catime 的 catlist SWR 精神一樣(先 `cached`、背景 `net` 更新)，差別只在 catime 還多了一層「頁面主動 cache-bust 查最新」。**站越簡單，策略就該越簡單。**ipas 不需要四種分流，一招 SWR 加一個版本號就夠了。

## 小結：本機優先的策略清單

把這篇收斂成一張「該怎麼選快取策略」的清單：

- [ ] **按資料性質選策略**，別一招到底：不可變資源 → cache-first;會改版的 code → network-first;會長新但舊的不動 → stale-while-revalidate
- [ ] 不可變的大資源(圖庫)放**獨立 cache**、`activate` 清舊版時**別清它**;若是跨來源資源，cache-first 要連 **opaque response**(`type === "opaque"`)一起收
- [ ] **SWR 的背景更新要繞過 SW 自己的快取**——頁面端帶 cache-bust query(`?_=Date.now()`),SW 端對帶 query 的請求直接走 network 不快取，避免自己攔自己
- [ ] `install` 主動 precache app 殼，用 **`Promise.allSettled` 容錯**(該原子齊全的核心檔才用 `addAll`);「該 precache 多少」看資料是小型 bundled 還是大型遠端——遠端圖庫只能 on-demand
- [ ] service worker **只接管同源 GET**，別亂攔跨域(會搞壞同步之類的外部呼叫)
- [ ] 純靜態站沒有 hash 檔名時，**bump cache 版號**就是最樸素可靠的更新觸發
- [ ] (bonus)離線失敗的 `<img>` 記住網址、監聽 `window 'online'` 自動復原(壞 img 不會自己重試)

這篇談的是「離線時內容怎麼又快又新鮮」。但快取救得了**下載**，救不了**JS 執行**:把一包 2MB 的東西全 precache 了、離線也能開，標題畫面還是可能頓。那是另一個層次的問題，也就是**啟動速度**。下一篇(系列第三篇)就講怎麼讓 PWA 不只離線可用，而且**啟動要快**:延後重量級引擎、字型按 unicode-range 拆分。

## 參考

- catime:<https://github.com/yazelin/catime>(`docs/sw.js`、`docs/app.js`)
- iPAS AI 模擬考站：<https://github.com/yazelin/ipas-ai-quiz>(`sw.js`)
- 系列前篇：[Service Worker 寫好了，離線卻還是恐龍頁]({% post_url 2026-06-15-pwa-offline-install-pitfalls %})
- MDN:[The Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) ／ [Caching strategies](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching) ／ [`opaque` responses](https://developer.mozilla.org/en-US/docs/Web/API/Response/type)
