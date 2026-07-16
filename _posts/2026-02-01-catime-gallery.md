---
layout: post
title: "catime Gallery — 打造 kawaii 風格的貓咪展覽館"
subtitle: "從零開始用純前端技術，把 AI 生成的貓咪圖片變成一個粉紅色的瀑布流畫廊"
date: 2026-02-01
categories: [AI]
tags: [AI, GitHub Pages, Frontend, JavaScript, catime]
---

![catime Gallery — 打造 kawaii 風格的貓咪展覽館](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-01-catime-gallery.png)

## 前言

[catime](https://github.com/yazelin/catime) 是一個每小時自動生成 AI 貓咪圖片的專案，靠 GitHub Actions cron 排程 + Gemini 圖片生成，每天會多出大約 20 隻新貓咪。專案跑了幾天之後，catlist.json 裡面就累積了好幾十筆紀錄，光靠 CLI 一隻隻看實在不夠過癮。

於是我決定幫這些貓咪蓋一座展覽館 — 一個部署在 GitHub Pages 上的靜態網頁，用瀑布流的方式把所有貓咪排排站好，還要加上篩選、日期選擇器、lightbox 預覽這些功能。既然是貓咪畫廊，當然要走 **kawaii** 路線：粉紅色系、圓角、漸層，越可愛越好。

這篇文章會記錄整個 Gallery 的設計與實作過程，包含 kawaii 主題配色、CSS masonry 瀑布流、IntersectionObserver 無限捲動、手刻日期選擇器，以及 `catime view` CLI 指令的整合。

---

## 整體架構

Gallery 的檔案結構非常簡潔，全部放在專案的 `docs/` 目錄下：

```
docs/
├── index.html          # 主頁面
├── style.css           # 所有樣式
├── app.js              # 所有邏輯
├── favicon.ico         # 多尺寸 favicon
├── favicon-32.png      # 32x32 favicon
├── icon-192.png        # 192x192 icon（PWA / topbar logo）
└── apple-touch-icon.png  # iOS 書籤圖示
```

沒有框架、沒有打包工具、沒有 node_modules — 就是三個檔案搞定一切。圖片存在 GitHub Release assets 上，所以整個 Gallery 是純靜態的，部署到 GitHub Pages 零成本。

```
┌────────────────────────────────────────────────────┐
│           GitHub Pages (docs/)                     │
│   index.html + style.css + app.js                  │
└──────────────────┬─────────────────────────────────┘
                   │  fetch
                   ▼
┌────────────────────────────────────────────────────┐
│   GitHub Raw Content                               │
│   catlist.json  →  所有貓咪的完整資料              │
│   Release Assets  →  貓咪圖片                      │
└────────────────────────────────────────────────────┘
```

資料來源很單純：一個 `catlist.json` 包含所有貓咪的編號、時間戳、模型、圖片 URL、prompt 等資訊。後來隨著貓咪數量增加，這個檔案在 [WebP 優化]({% post_url 2026-02-07-catime-webp-optimization %})時被拆分為輕量索引 + 月度明細的兩層結構。

---

## kawaii 主題設計

### 配色系統

整個 Gallery 的視覺靈感來自日系 kawaii 風格。首先定義了一組 CSS 變數作為配色基礎：

```css
:root {
  --pink: #ff6b9d;
  --pink-light: #ffa5c8;
  --pink-pale: #fff0f5;
  --orange: #ffb347;
  --red: #ff6b6b;
  --blue: #74b9ff;
  --green: #a8e6cf;
  --purple: #c9b1ff;
  --bg: #fff5f9;
  --surface: #ffffff;
  --text: #5a4a5a;
  --text-muted: #b8a0b8;
  --shadow: rgba(255, 107, 157, .15);
}
```

`--pink` 是主色，`--purple` 和 `--blue` 作為輔助色。背景色 `--bg: #fff5f9` 是帶一點粉紅的白色，而文字色 `--text: #5a4a5a` 是偏紫的深灰，不會像純黑那麼硬。整個頁面看起來溫柔很多。

### 糖果色卡片輪轉

為了讓畫廊不會太單調，卡片背景色會輪流切換五種粉嫩色：

```css
.card:nth-child(5n+1) { background: var(--card-1); border-color: rgba(255,107,157,.2); }
.card:nth-child(5n+2) { background: var(--card-2); border-color: rgba(116,185,255,.2); }
.card:nth-child(5n+3) { background: var(--card-3); border-color: rgba(168,230,207,.25); }
.card:nth-child(5n+4) { background: var(--card-4); border-color: rgba(201,177,255,.25); }
.card:nth-child(5n+5) { background: var(--card-5); border-color: rgba(255,179,71,.2); }
```

分別是粉紅、天藍、薄荷綠、淡紫、暖橘。Model 標籤也用同樣的輪轉邏輯，搭配漸層背景：

```css
.card:nth-child(5n+1) .model { background: linear-gradient(135deg, var(--pink), var(--red)); }
.card:nth-child(5n+2) .model { background: linear-gradient(135deg, var(--blue), var(--purple)); }
```

### 漸層文字

頁面標題和月份分隔線使用了 CSS 漸層文字效果：

```css
#topbar h1 {
  background: linear-gradient(135deg, #9b7ec8, var(--pink), #ffb347);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

紫色到粉紅到橘色的三色漸層，視覺上很有辨識度。月份分隔線前面還會自動加上櫻花 emoji：

```css
.month-sep::before { content: "🌸 "; -webkit-text-fill-color: initial; }
```

### 字體選擇

字體用的是 Google Fonts 的 **Nunito**：

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
body { font-family: 'Nunito', system-ui, sans-serif; }
```

Nunito 是圓體字型，字母的邊角都是圓潤的，非常適合 kawaii 風格。選用了 400/600/700/800 四個字重，讓標題和內文有層次感。

### 背景裝飾

背景不是單純的純色，而是疊了三層半透明的放射漸層：

```css
body {
  background: var(--bg);
  background-image:
    radial-gradient(circle at 10% 20%, rgba(255,107,157,.06) 0%, transparent 50%),
    radial-gradient(circle at 90% 80%, rgba(116,185,255,.06) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(201,177,255,.05) 0%, transparent 50%);
}
```

左上角一抹粉紅、右下角一抹天藍、正中央一抹淡紫。不仔細看可能看不出來，但就是這種若有似無的光暈讓整個頁面多了一點「呼吸感」。

---

## CSS Masonry 瀑布流

Gallery 的核心版面是 CSS multi-column 實現的瀑布流：

```css
.masonry {
  margin-top: 60px;
  margin-right: 130px;
  padding: 1.2rem;
  column-count: 3;
  column-gap: 1.2rem;
}
```

用 `column-count: 3` 把內容分成三欄，每張卡片設定 `break-inside: avoid` 避免被截斷。這比用 JavaScript 計算位置或 CSS Grid 的 `masonry` 草案簡單得多，而且瀏覽器支援度很好。

卡片的 hover 效果帶了一個微微上浮 + 放大的動畫：

```css
.card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 8px 25px var(--shadow);
}
```

位移只有 4px、縮放只有 1%，配合粉紅色的陰影，感覺輕盈不笨重。

---

## 無限捲動

Gallery 不是一次載入所有圖片，而是每次載入 20 張，滾到底部自動載入更多。實作方式是 `IntersectionObserver`：

```javascript
const PAGE_SIZE = 20;
const observer = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) loadMore();
}, { rootMargin: "400px" });
observer.observe(endMsg);
```

`endMsg` 是頁面最底部的一個 div，當它進入可視區域（提前 400px）就觸發 `loadMore()`。`loadMore()` 會從 `filtered` 陣列中取出下一批 20 筆資料，用 `DocumentFragment` 批次插入 DOM：

```javascript
function loadMore() {
  if (loading || loaded >= filtered.length) return;
  loading = true;
  const slice = filtered.slice(loaded, loaded + PAGE_SIZE);
  const frag = document.createDocumentFragment();
  slice.forEach(cat => {
    // 插入月份分隔線（如果跨月）
    // 建立卡片 DOM
    frag.appendChild(card);
  });
  gallery.appendChild(frag);
  loaded += slice.length;
  loading = false;
}
```

用 `DocumentFragment` 而不是逐個 `appendChild` 是為了減少 reflow 次數。卡片裡的圖片也加了 `loading="lazy"` 做原生 lazy loading，雙管齊下確保捲動順暢。

全部載完之後，底部會顯示一行 "No more cats!" 加上貓咪 emoji。

---

## 自訂 kawaii 日期選擇器

原生的 `<input type="date">` 長得太樸素了，跟 kawaii 主題完全不搭。所以我手刻了一個日期選擇器。

### 結構

```html
<div class="date-picker" id="date-picker">
  <button class="date-picker-btn" id="date-picker-btn">
    <svg>...</svg> All Dates
  </button>
  <div class="date-dropdown hidden" id="date-dropdown">
    <div class="dd-header">
      <button class="dd-nav" id="dd-prev">&lsaquo;</button>
      <span id="dd-month-label"></span>
      <button class="dd-nav" id="dd-next">&rsaquo;</button>
    </div>
    <div class="dd-weekdays">
      <span>Su</span><span>Mo</span>...<span>Sa</span>
    </div>
    <div class="dd-days" id="dd-days"></div>
    <button class="dd-clear" id="dd-clear">Clear</button>
  </div>
</div>
```

### 日曆渲染

每次打開下拉或切換月份時，`renderCalendar()` 會重新計算當月天數、第一天是星期幾，然後動態生成按鈕：

```javascript
function renderCalendar() {
  const first = new Date(calYear, calMonth, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  let html = "";
  for (let i = 0; i < startDay; i++)
    html += '<button class="other-month" disabled></button>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = calYear + "-" + String(calMonth+1).padStart(2,"0")
             + "-" + String(d).padStart(2,"0");
    const cls = [];
    if (ds === todayStr) cls.push("today");
    if (ds === selectedDate) cls.push("selected");
    if (catDates.has(ds)) cls.push("has-cat");
    html += '<button data-date="' + ds + '" class="' + cls.join(" ") + '">'
          + d + '</button>';
  }
  ddDays.innerHTML = html;
}
```

### 有貓的日子

最有趣的設計細節是 `has-cat` class。載入 catlist.json 之後，會把所有有貓的日期收集到一個 Set：

```javascript
let catDates = new Set();
allCats.forEach(c => catDates.add(c.timestamp.split(" ")[0]));
```

在日曆上，有貓的日子會在數字下方顯示一個小粉紅圓點：

```css
.dd-days button.has-cat::after {
  content: "";
  display: block;
  width: 4px; height: 4px;
  background: var(--pink);
  border-radius: 50%;
  margin: -2px auto 0;
}
```

選中的日期用粉紫漸層高亮：

```css
.dd-days button.selected {
  background: linear-gradient(135deg, var(--pink), var(--purple));
  color: #fff;
}
```

### 月份切換導航按鈕

左右箭頭是圓形按鈕，hover 時從粉色底變成粉紅底白字：

```css
.dd-nav {
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: var(--pink-pale); color: var(--pink);
  font-size: 1.1rem; font-weight: 800; cursor: pointer;
}
.dd-nav:hover { background: var(--pink-light); color: #fff; }
```

初始化時，日曆會自動跳到最新一隻貓所在的月份，而不是系統當前月份。這樣打開日期選擇器就能直接看到有資料的月份。

---

## 手機版適配

響應式設計用了兩個斷點：

### 平板 (max-width: 1024px)

```css
@media (max-width: 1024px) {
  .masonry { column-count: 2; margin-right: 0; }
  #timeline { transform: translateX(100%); }
  #timeline.open { transform: translateX(0); }
  #timeline-toggle { display: block; }
}
```

瀑布流從三欄縮成兩欄，右側的 timeline 側邊欄預設收起，改用右下角的浮動按鈕（圓形、粉紫漸層、帶陰影）來展開。

### 手機 (max-width: 600px)

```css
@media (max-width: 600px) {
  .masonry { column-count: 1; padding: .8rem; margin-top: 100px; }
  #topbar h1 { font-size: 1.1rem; }
  .filters { flex: 1 1 100%; order: 1; justify-content: flex-start; }
  .date-dropdown { width: calc(100vw - 1.2rem); max-width: 280px; }
}
```

一欄式佈局，filters 換行到第二行。日期選擇器的下拉寬度改用 `calc(100vw - 1.2rem)` 避免超出螢幕。

Lightbox 在手機上也做了調整：

```css
@media (max-width: 600px) {
  #lb-img { max-height: 45vh; border-radius: 12px; }
  #lb-img-actions { position: static; justify-content: center; margin-top: .5rem; }
  #lb-details { max-height: none; }
}
```

圖片最高佔 45% 視窗高度，操作按鈕從圖片右下角浮動改為圖片下方置中排列，詳細資訊區域不限高度可以自由捲動。

---

## Lightbox 與詳細資訊

點擊卡片會打開全螢幕的 lightbox，背景加了 `backdrop-filter: blur(8px)` 做毛玻璃效果。

### Prompt 顯示

Lightbox 打開時，從 `catlist.json` 中找到對應貓咪的 prompt 資料，顯示在圖片下方。同時提供 Copy Prompt 和 Download 兩個操作按鈕，用 inline SVG icon，複製成功後會短暫顯示打勾圖示：

```javascript
lbCopyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(lbPromptText.textContent).then(() => {
    lbCopyBtn.innerHTML = SVG_CHECK + " Copied!";
    setTimeout(() => {
      lbCopyBtn.innerHTML = SVG_CLIPBOARD + " Copy Prompt";
    }, 1500);
  });
});
```

後來隨著 [故事欄位]({% post_url 2026-02-03-catime-story %})和 [新聞靈感]({% post_url 2026-02-06-catime-news-cat %})等功能陸續加入，Lightbox 在 [WebP 優化]({% post_url 2026-02-07-catime-webp-optimization %})時被重新設計為分頁介面（Story / Idea / News / Constraints），改為非同步載入月度明細檔案。

---

## Favicon 設計

既然是 kawaii 風格的貓咪畫廊，favicon 當然也要是可愛的貓咪。準備了四個尺寸：

| 檔案 | 尺寸 | 用途 |
|------|------|------|
| `favicon.ico` | 多尺寸 | 瀏覽器標籤頁 |
| `favicon-32.png` | 32x32 | 書籤列 |
| `icon-192.png` | 192x192 | PWA icon / topbar logo |
| `apple-touch-icon.png` | 180x180 | iOS 書籤 |

HTML 中這樣宣告：

```html
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
```

192x192 的 icon 也被用在 topbar 的 logo 位置，用 CSS 裁成圓形：

```css
.logo-icon {
  width: 34px; height: 34px; border-radius: 50%;
}
```

---

## catime view CLI 整合

Gallery 不只能透過 GitHub Pages 線上看，還能用 `catime view` 指令在本機瀏覽。這個指令會在本地啟動一個 HTTP server，然後自動打開瀏覽器：

```python
def cmd_view(args):
    """Serve the cat gallery locally in a browser."""
    import http.server, functools, threading, webbrowser

    docs_dir = Path(__file__).resolve().parent / "docs"
    if not docs_dir.exists():
        docs_dir = Path(__file__).resolve().parent.parent.parent / "docs"

    port = args.port
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler,
        directory=str(docs_dir)
    )
    server = http.server.HTTPServer(("127.0.0.1", port), handler)
    print(f"Serving cat gallery at http://127.0.0.1:{port}")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    server.serve_forever()
```

使用方式：

```bash
uvx catime view              # 預設 port 8000
uvx catime view --port 3000  # 自訂 port
```

`docs/` 目錄會被打包進 Python package 裡（透過 `pyproject.toml` 的 `[tool.hatch.build]` 設定），所以用 `uvx` 安裝後就能直接用，不需要 clone 整個 repo。

這個設計讓使用者有兩種選擇：

- **線上版**：[https://yazelin.github.io/catime](https://yazelin.github.io/catime)，永遠是最新資料
- **本機版**：`catime view`，適合離線瀏覽或開發測試

---

## 開發時程

從 git log 可以看到，整個 Gallery 大約是在半天內完成的：

```
2026-02-02 Add GitHub Pages cat gallery with kawaii theme and catime view command
2026-02-02 Fix infinite scroll, custom kawaii date picker, and calendar parsing
2026-02-02 Fix mobile date picker dropdown overflowing left edge
2026-02-02 Add kawaii cat favicon in multiple sizes
2026-02-02 Add AI-generated prompts via Gemini 2.5 Flash and display in lightbox
2026-02-02 Fix lightbox prompt layout and add prompt to issue comments
2026-02-02 Replace emojis with inline SVG icons and bump to 0.4.3
```

第一版先把 HTML/CSS/JS 一口氣寫完，接著修了無限捲動和日期選擇器的 bug，然後補上手機版適配、favicon、SVG icon 替換，最後加入 lightbox 的 prompt 顯示。典型的 **先做出來，再修好看** 的開發節奏。

---

## 小結

回顧一下這個 Gallery 的幾個設計決策：

- **純前端三件套**：HTML + CSS + vanilla JS，沒有框架依賴，整個 `docs/` 目錄不到 35KB（不含圖片）
- **kawaii 配色系統**：用 CSS 變數定義一組粉嫩色系，透過 `nth-child` 輪轉讓畫面有變化但不凌亂
- **CSS column 瀑布流**：比 JS 方案簡單太多，瀏覽器原生支援效能好
- **IntersectionObserver 無限捲動**：比 scroll event 省效能，rootMargin 提前觸發讓載入幾乎無感
- **手刻日期選擇器**：雖然費工，但可以完全控制外觀，has-cat 小圓點是很棒的 UX 細節
- **CLI 整合**：`catime view` 讓 Gallery 不只是網頁，也是 CLI 工具的一部分

如果你也有一堆 AI 生成的圖片需要一個好看的展示頁面，不妨參考這個做法 — 不需要任何後端，GitHub Pages 就能搞定。

---

## 參考資源

- [catime GitHub](https://github.com/yazelin/catime) -- 專案原始碼
- [catime Gallery 線上版](https://yazelin.github.io/catime) -- 直接瀏覽
- [catime PyPI](https://pypi.org/project/catime/) -- `uvx catime` 安裝
- [CSS Multi-column Layout - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_multicol_layout)
- [IntersectionObserver API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver)
- [Nunito - Google Fonts](https://fonts.google.com/specimen/Nunito)
- [Nanobanana 圖片生成]({% post_url 2026-01-14-nanobanana-image-generation %}) -- 用來生成貓咪圖片的 AI 工具
