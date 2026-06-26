---
layout: post
title: "整包都 precache 了,標題畫面還是頓 —— 快取救得了下載,救不了 CPU"
subtitle: "上一篇把 Roll Formosa 這個風滾球遊戲做成離線也能玩、整包 2.97MB 都被 service worker precache 進去。照理說「秒開」了——但點進去,標題畫面還是頓。整包明明都在快取裡了,為什麼還會卡?"
date: 2026-06-21
categories: [AI, 開發工具]
tags: [PWA, Performance, Code Splitting, Web Font, vanilla JS, AI, 甲方思維]
author: Yaze Lin
---

![PWA 啟動優先:延後 3D 引擎 + 字型 unicode-range 拆分](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-21-pwa-startup-priority.png)

> **這篇講的專案**
> - Roll Formosa(搖滾・福爾摩沙)台灣風滾球遊戲:<https://yazelin.github.io/roll-formosa/>
> - repo:<https://github.com/yazelin/roll-formosa>
> - 側欄旁證 iPAS 模擬考站:<https://github.com/yazelin/ipas-ai-quiz>
>
> **PWA 三部曲**　1. [離線/安裝]({% post_url 2026-06-15-pwa-offline-install-pitfalls %}) ·　2. [快取策略]({% post_url 2026-06-17-pwa-swr-local-first %}) ·　3. 啟動速度(本篇)

這是 PWA 系列第三篇。前兩篇談的是「能不能離線、能不能裝」([第一篇]({% post_url 2026-06-15-pwa-offline-install-pitfalls %}))和「離線怎麼秒開、內容怎麼保持新鮮」([第二篇,快取策略]({% post_url 2026-06-17-pwa-swr-local-first %}))。這兩件做到了,Roll Formosa 已經整包 2.97MB 都被 service worker 在安裝時 precache 進去——離線開、重複開都吃快取,不再走網路。

照理說該秒開了。但我點進去,標題畫面還是頓。

要讓首屏快,得分兩件事各自做：延後最重的 JS(3D 引擎延到背景再載)、延後最大的字型(只先載首屏用得到的那一小部分)。同時「開始」鈕在引擎還沒好之前先給個 loading 態,別讓人點空。一句話:**載入順序是一種「優先級」,不是「全部一起來」**。

## 真因:快取救得了下載,救不了 CPU

結論先講:慢的從來不是下載,是 CPU。但既然整包都 precache 了還在頓,第一個直覺反應仍是「會不會某個檔沒命中、還在偷偷走網路?」

所以第一件事是打開 Network 面板看。結果很乾脆:標題畫面要的東西**全部標 from ServiceWorker、0 bytes over wire**——一個位元組都沒走網路。下載這條線被直接排除掉了。

下載不是兇手,剩下的就只剩 CPU。延後引擎那條 commit 訊息(`361ee97`)寫得很直白:

> The slowness wasn't download (the SW does precache the 2.97MB bundle) — it was parse + the ~900ms eager world build that ran at module load, before START. Caching can't help CPU work, so the title still felt sluggish.

翻成白話:慢的是兩件 CPU 的事——一是瀏覽器要把整包 three.js **parse**(解析、編譯成可執行的程式碼),二是那段**約 900ms 的世界建構**,在 module 一載入(還沒按「開始」)就跑掉了。

這是一個很容易被「我都 precache 了啊」騙過去的盲點:service worker 的快取解決的是「位元組從哪來」,它完全不碰「位元組到了之後 CPU 要花多久」。**快取救得了下載、救不了 JS parse 跟世界建構。**

## 修法一:把 3D 引擎延後成 lazy chunk

既然那 ~900ms 是「世界建構」,那不是在玩家按下「開始」時才建世界就好嗎?何必搞背景預取那麼麻煩?

問題是,這樣只是把卡頓從標題畫面搬到開場。玩家一按「開始」,反而要當場等那 ~900ms,體感更差。而且就算把世界建構延到 START,three.js 的 **parse** 還是會在 module 一載入時就發生,標題畫面該頓還是頓。所以要做的不是「延後建世界」,而是讓首屏完全不碰這支 module,再趁玩家讀標題的空檔,用 idle + 首次 pointer 在背景把整支引擎(parse + 建構一起)偷跑掉。注意這不是單純的 lazy import 等玩家點了才開始載。

原本所有東西都擠在 `src/main.js`——它 import three.js,並在 module 頂層就把整個 3D 世界建好。也就是說,瀏覽器一碰到這支 entry,就得先下載 + parse three、再跑完 900ms 的建構,**才輪得到第一個畫面出現**。

拆分是這樣(commit `361ee97`):把 `main.js` 從 907 行砍到 54 行,原本的引擎本體原封不動搬進新的 `src/engine.js`(907 行)。拆分前的 `main.js` 是 907 行,拆完 `main.js` 剩 54 行、約 2.4KB,而 `engine.js` 一樣是 907 行(整支原封搬走,正好對上 commit 訊息「the former main.js verbatim」):

```
拆分前 src/main.js   907 行
拆分後 src/main.js    54 行  (~2.4KB)
       src/engine.js 907 行  (原 main.js 原封搬入)
```

關鍵是新 `main.js` 變成一個**完全不 import three** 的小 bootstrap。它的職責只剩「決定什麼時候去載引擎」。實際的 `src/main.js`:

```js
let _engineP = null;
function loadEngine() {
  if (_engineP) return _engineP;
  _engineP = import('./engine.js')
    .then((m) => { setLoading(false); return m; }) // engine live → Screens wires START
    .catch((e) => {
      _engineP = null; // allow a retry (e.g. offline + not yet precached)
      setLoading(false);
      console.error('[roll-formosa] engine chunk failed to load', e);
    });
  return _engineP;
}

// 開始 is gated until the engine is ready (we always load it, so show the
// loading state from the first paint — honest, and usually over in a blink).
setLoading(true);

// Prefetch the engine once the browser has painted the title and gone idle;
// any first pointer interaction also kicks it (covers a tap before idle fires).
function schedule() {
  if ('requestIdleCallback' in window) requestIdleCallback(loadEngine, { timeout: 1500 });
  else requestAnimationFrame(() => requestAnimationFrame(loadEngine));
}
if (document.readyState === 'complete') schedule();
else addEventListener('load', schedule, { once: true });
addEventListener('pointerdown', loadEngine, { once: true, capture: true });
```

幾個設計點,都是為了「首屏先出、引擎背景偷跑」:

1. **靜態標題畫面的視覺不靠這個 bundle**。它來自 HTML 本身 + index.html 裡一段 pre-paint 的 inline script(依城市設好天際線/標題)。所以 three 還沒載,標題畫面已經能畫、能互動。
2. **首屏 paint 之後才動態 `import('./engine.js')`**。觸發點有三個:`requestIdleCallback`(瀏覽器閒下來)、退化環境用雙 `requestAnimationFrame`、以及第一次 `pointerdown`(萬一玩家在 idle 觸發前就點了)。趁玩家還在讀標題,three 已經在背景下載、parse、建世界。
3. **「開始」鈕在引擎就緒前是 loading 態**,不是死鈕。實際文案是雙語的:

```js
function setLoading(on) {
  if (!startBtn) return;
  startBtn.disabled = on;
  startBtn.classList.toggle('is-loading', on);
  startBtn.textContent = on ? '場景準備中… / PREPARING' : startLabel;
}
```

import 一支 module 就等於執行它的頂層程式碼——引擎的 boot 寫在 `engine.js` 的頂層,所以「import 它」本身就是「啟動它」;這裡做的只是把啟動時機挑得比較晚。

驗收跑的是 `npx vitest run`(811 passed)+ headless boot `?city=tainan`、引擎延後載入後 0 console error。順手還清掉一個小東西:原本 index.html 裡 preload 了 **8 張 donack 吉祥物的 webp**,但其中只有 `idle-0` 在第一個畫面上,Chrome 因此標了「preloaded but not used」的警告。這些 preload 被拿掉,把首屏的頻寬讓給真正第一屏要的東西(只剩兩支標題字型 preload):

```html
<!-- Preload ONLY first-screen-critical resources: the two title fonts, so
     "ROLL FORMOSA" + the Chinese subtitle render in the right face on first
     paint (no FOUT). The donack mascot frames are NOT on the first screen —
     they used to be preloaded here and Chrome flagged them "preloaded but not
     used"; they load on demand / from the SW precache when commentary fires. -->
```

## 修法二:中文字型用 unicode-range 拆兩份

第二件「最重的東西」是字型。中文字一多,字型檔就肥。Noto Sans TC 全字檔(已經 subset 過、只留 repo 出現過的字)還是有 590KB。但**第一個畫面其實只用得到標題/選單/結算那幾十個字**——讓首屏去等一個 590KB、它大部分還用不到的檔案,是浪費。

拆法(commit `e239cad`)跟引擎是同一個心法:

- `notosanstc-ui.woff2`(132KB,234 個 CJK 字)= 只放標題/選單/結算的字。**preload**,所以首屏的中文一進站就到位。
- `notosanstc.woff2`(590KB)= 遊戲裡每一個字。宣告在第二個 `@font-face`、**不帶 unicode-range**,瀏覽器只有在要渲染「UI 子集以外的字」時(也就是進了遊戲)才去抓它,不再是跟首屏搶頻寬的高優先 preload。

我驗了實際檔案大小,跟 commit 講的數字吻合:`notosanstc-ui.woff2` 131968 bytes(≈129KB,commit 寫 132KB)、`notosanstc.woff2` 601576 bytes(≈588KB,commit 寫 590KB)。

拆成兩份,總量不是反而更大?關鍵不在總量,在**首屏關鍵路徑上放了多少**。原本首屏要等整個 590KB 才有正確字面,現在首屏只 preload 那份 132KB 的 UI 子集,等於少等了約 458KB;590KB 全字檔被降級成「進遊戲才抓」,不再跟首屏搶頻寬。兩份加起來跟原本一份的總量幾乎沒變,差別只是把「現在非等不可」的部分縮到最小。

兩個 `@font-face` 共用**同一個 family 名稱**(`'Noto Sans TC'`),靠 `unicode-range` 分工——對所有既有的 `font-family` stack 完全透明,沒有改任何 element 的 CSS。index.html 裡實際長這樣:

```css
@font-face {
  font-family: 'Noto Sans TC';
  src: url('/assets/fonts/notosanstc-ui.woff2') format('woff2');
  font-weight: 100 900; font-style: normal; font-display: swap;
  unicode-range: /*RF_UI_RANGE_START*/U+0020-007E,U+00A7,...,U+1F5FC/*RF_UI_RANGE_END*/;
}
@font-face {
  font-family: 'Noto Sans TC';
  src: url('/assets/fonts/notosanstc.woff2') format('woff2');
  font-weight: 100 900; font-style: normal; font-display: swap;
}
```

(上面那串 `unicode-range` 我截短了——實際是兩百多個碼點壓成的 range list,涵蓋 UI 子集那 234 個字。)

那串碼點不是手寫的,是腳本算出來再注回 HTML 的。`scripts/gen-fonts.sh` 自架字型管線是這樣:

1. 從 Google Fonts 的 GitHub 抓原始 TTF(`NotoSansTC[wght].ttf`、`Bungee`)。
2. 用一段 Python 列舉「repo 裡出現過的所有字」當 **full** 字集(掃 `src/**/*.js` + 各 HTML);另外算一個更小的 **UI** 字集——只取 index.html、`packs/manifest.js`、以及各 pack `locale.js` 裡 `title.*` / `win.*` 的字。
3. 把 UI 字集的碼點 collapse 成緊湊的 CSS `unicode-range`,用 marker 注回 index.html:

```python
new = re.sub(r'/\*RF_UI_RANGE_START\*/.*?/\*RF_UI_RANGE_END\*/',
             f'/*RF_UI_RANGE_START*/{rng}/*RF_UI_RANGE_END*/', html, count=1, flags=re.S)
assert new != html, 'RF_UI_RANGE markers not found in index.html'
```

4. 用 `pyftsubset` 各 subset 成同源 woff2:full、UI、Bungee 三個檔。

為什麼要自架、不直接用 Google Fonts CDN?**用 CDN 是反射動作,但對 PWA 正好錯——CDN 字型跨域,service worker 不能快取跨域請求。** 註解寫得很清楚:CDN 的全字檔是多 MB 而且跨域,等於離線就壞、首屏還要連外網。subset 成同源的 ~0.6MB,才能被 SW precache、才真的離線。

## 多入口 PWA:每個入口都要各自顧

**這節跟「首屏快」無關,是改字型那批同時順手抓到的離線正確性坑。**踩的也是同一個跨域快取的雷,跟系列第一篇那個坑算同一條教訓的另一面。Roll Formosa 有兩個 HTML 入口:遊戲頁 `index.html` 和物件圖鑑頁 `preview.html`(Vite 的第二 entry)。

上面的字型自架,**一開始只改了 index.html**。`preview.html` 因為是另一個入口,還在從 Google Fonts CDN 拉字——一份 100KB 的 stylesheet + 約 **1.7MB 的跨域 woff2 chunk**,service worker 一個都快取不到,每次開都重抓、離線直接壞。

補救在 commit `8863f3d`,訊息直接點名:

> The font self-hosting fix only touched index.html — preview.html (the 物件圖鑑 gallery, a separate Vite entry) still pulled Bungee + Noto Sans TC from the Google Fonts CDN: a 100KB stylesheet + ~1.7MB of cross-origin gstatic woff2 chunks the service worker can't cache → re-downloaded every visit and broken offline.

修法是把 preview.html 也指向同一份自架 `/assets/fonts/*.woff2`(這裡用全字 Noto、不做 UI 拆分,免得多一套 unicode-range 要同步),**並且讓 preview.html 自己也註冊一次 service worker**——這樣玩家直接從圖鑑頁進站(不經過標題頁)也會裝上離線快取。

教訓:**多入口的 PWA,字型、SW 註冊、favicon 這些「入口級」的事,每一個 HTML 都要各自顧**,改了主頁不等於改了全部。

## 帶 query 的導覽,離線 fallback 要 ignoreSearch

同樣地,**這也不是首屏快的事,是同一批改動裡跟「多入口 + 離線」纏在一起、順手修掉的離線正確性坑**(commit `116eeb4`)。

service worker 對 HTML 導覽走 network-first:有網路就抓最新、離線就回退到快取。但物件圖鑑的連結帶 query——`preview.html?city=tainan`。離線時 `caches.match(req)` 用的是完整 URL(含 `?city=tainan`)去比對,而快取裡存的是沒帶 query 的 `preview.html`,於是 **miss**,一路掉到最後的 `index.html` fallback。結果點圖鑑卻開進了遊戲。

修法是在離線 fallback 比對時加 `{ ignoreSearch: true }`,讓帶 query 的導覽命中它沒帶 query 的快取頁:

```js
} catch {
  // Offline. ignoreSearch so a query'd nav (preview.html?city=tainan,
  // /?city=X) matches its cached query-less page — otherwise the gallery
  // link fell through to the index.html fallback and opened the game.
  return (await caches.match(req, { ignoreSearch: true }))
    || (await caches.match('index.html'))
    || Response.error();
}
```

## 那「整包都 precache」是怎麼做到的

前面一直說「2.97MB 整包都被 precache」,機制值得補一句。Vite build 出來的檔名帶 hash,沒辦法在 `sw.js` 裡寫死。所以 `scripts/gen-precache.mjs`(30 行)在 build 之後跑:walk 整個 `dist/`、列出所有可快取檔案,把清單注回 `sw.js` 裡原本空的 `const PRECACHE = []`:

```js
const files = walk(dist)
  .map((p) => relative(dist, p).split('\\').join('/'))
  .filter((f) => !SKIP.test(f) && f !== 'sw.js' && !SHELL.has(f));

let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/const PRECACHE = \[\];/, `const PRECACHE = ${JSON.stringify(files)};`);
```

service worker 安裝時就把整包(所有 hashed JS/CSS + 每座城市的天際線/吉祥物/音訊 webp)用 `Promise.allSettled` 全量抓進快取——壞一張也不會讓安裝失敗。所以「第一次造訪就把整個遊戲存好、之後完全離線可玩」。

這正好回到開頭:整包都在快取裡了,download 不是問題,問題是 CPU——所以才需要前面兩個延後。

## 側欄:同一個「延後重東西」的心法,也用在圖

不是只有 JS 和字型重。圖也重。同一批 PWA 裡的 iPAS 模擬考站,把 35 張帶圖題的圖從 PNG 轉成 **WebP lossless**,整批從 3.2MB 壓到 1.7MB,文字不失真,questions.json 路徑同步(commit `98662bf`)。SW 安裝時還順手從 questions.json 撈出所有圖 best-effort 預載,離線一開始就完整含圖——不用「練過一次才存圖」。

雖然手法不同(一個是延後載入、一個是把體積壓小再全載),底層判斷是一致的:**先看清楚「第一個畫面真正需要什麼」,把不需要的延後或縮小,別讓首屏陪著一起等。**

## 小結

把這篇收斂成幾條,開新 PWA 想「首屏要快」時會先過一遍:

- **快取不省 CPU**。precache 解決下載,解決不了 JS parse 和初始化(這裡是 ~900ms 世界建構)。最重的 bundle 要延後到首屏 paint 之後(idle / 首次 pointer)再動態 import,鈕在就緒前給 loading 態、別當死鈕。
- **字型按「首屏用不用得到」拆**。同 family + `unicode-range`,首屏子集小檔 preload、全字檔無 range lazy,對既有 CSS 透明。重點不是總量變小,是首屏關鍵路徑上要等的位元組變小。
- **字型要自架**(subset 成同源 woff2)才能被 SW 快取、才真離線——跨域 CDN 字型 SW 一個都快取不到。
- **subset 用腳本算、別手刻** unicode-range;碼點用 marker 注回 HTML,加新字重跑就好。

這三篇從「能不能離線/安裝」、到「離線怎麼秒開」、到「啟動怎麼快」,大致把這幾個小專案在 PWA 上踩過的坑記完了。共同心法其實只有一句:**先想清楚第一個畫面真正需要什麼,其餘的延後。**

## 參考

- Roll Formosa repo:<https://github.com/yazelin/roll-formosa>
- iPAS AI 模擬考站:<https://github.com/yazelin/ipas-ai-quiz>
- MDN:[Dynamic `import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) ／ [`@font-face` `unicode-range`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/unicode-range) ／ [`requestIdleCallback`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback) ／ [`CacheStorage.match` `ignoreSearch`](https://developer.mozilla.org/en-US/docs/Web/API/Cache/match)
- fonttools / `pyftsubset`:<https://fonttools.readthedocs.io/en/latest/subset/>
