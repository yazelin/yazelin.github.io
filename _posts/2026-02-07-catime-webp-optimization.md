---
layout: post
title: "catime 效能優化：WebP 遷移與資料架構重設計"
subtitle: "從 PNG 到 WebP，從單一 JSON 到月份分割"
date: 2026-02-07
categories: [AI]
tags: [AI, 效能優化, WebP, 前端, catime, JavaScript]
---

## 前言

catime 專案從誕生到現在，每小時自動產生一張 AI 貓咪圖片，累積到第 154 號。隨著圖片數量持續增長，兩個效能問題逐漸浮現：

1. **圖片太大**：PNG 格式平均每張 1.7MB，Gallery 首頁載入 20 張就要吃掉 34MB 流量
2. **資料太肥**：`catlist.json` 把所有欄位（prompt、story、idea、news、avoid_list）塞在一個檔案裡，已經膨脹到 215KB

這篇文章記錄一天之內完成的三項重構：PNG 轉 WebP 批量遷移、資料架構拆分、以及 Lightbox 介面重新設計。作為 catime 系列的第六篇，也是最終篇。

---

## PNG 到 WebP：87% 的壓縮率

### 問題：PNG 太重

catime 使用 nanobanana（底層是 Google Gemini）產生圖片，預設輸出是 PNG 格式。一張 1024x1024 的貓咪圖片，PNG 大約 1.7MB。151 張累積下來就是超過 250MB 的 release assets。

Gallery 採用 lazy loading 和無限捲動，但即使只載入前 20 張，仍然需要下載 34MB 的圖片資料。在行動裝置上體驗很差。

### 解法：生成後即時轉換 + 歷史批次遷移

分成兩步執行：

**第一步：修改生成流程**

在 `scripts/generate_cat.py` 中，圖片生成後立即用 Pillow 轉換為 WebP：

```python
# Convert PNG to WebP for smaller file size
png_path = response.generated_files[0]
webp_path = png_path.rsplit(".", 1)[0] + ".webp"
try:
    from PIL import Image
    img = Image.open(png_path)
    img.save(webp_path, "WEBP", quality=90)
    os.remove(png_path)
    print(f"Converted to WebP: {os.path.getsize(webp_path) / 1024:.0f}KB")
    final_path = webp_path
except Exception as e:
    print(f"WebP conversion failed ({e}), using PNG")
    final_path = png_path
```

`quality=90` 是個折衷值——視覺品質幾乎無損，但檔案大小大幅縮減。如果 Pillow 不可用或轉換失敗，會自動 fallback 回 PNG，確保流程不中斷。

**第二步：批次遷移 151 張歷史圖片**

所有歷史圖片都存在 GitHub Releases 上。批次轉換後重新上傳，並更新 `catlist.json` 裡的 URL：

```
.png → .webp
```

共 302 行變更（151 行刪除 + 151 行新增），所有 URL 從 `.png` 改為 `.webp`。

### 成效

| 指標 | PNG | WebP | 改善 |
|------|-----|------|------|
| 平均單張大小 | ~1.7MB | ~220KB | **-87%** |
| 20 張載入量 | ~34MB | ~4.4MB | **-87%** |
| 全部 151 張 | ~257MB | ~33MB | **-87%** |

quality=90 的 WebP 在視覺上與原始 PNG 幾乎無法區分，但檔案大小只有約 13%。這意味著 Gallery 的首次載入速度提升了將近 8 倍。

---

## 資料架構拆分：從 215KB 到 37KB

### 問題：catlist.json 越來越肥

Gallery 啟動時需要 fetch `catlist.json` 來取得所有貓咪的清單。這個檔案原本包含每隻貓的完整資訊：

```json
{
  "number": 42,
  "timestamp": "2026-02-01 05:12 UTC",
  "url": "https://github.com/.../cat_2026-02-01_0512_UTC.webp",
  "model": "gemini-3-pro-image-preview",
  "status": "success",
  "prompt": "A highly detailed cinematic photograph...(超長英文 prompt)...",
  "story": "一隻好奇的橘貓正在...",
  "idea": "街頭攝影風格...",
  "news_inspiration": ["某國舉辦...", "某市發現..."],
  "avoid_list": ["生物發光森林", "貓凝望月亮"]
}
```

其中 `prompt` 欄位平均超過 500 字元，`news_inspiration` 和 `avoid_list` 也各佔一些空間。154 隻貓的完整資料讓檔案膨脹到 215KB。但 Gallery 首頁其實只需要 `number`、`timestamp`、`url`、`model` 這四個欄位。

### 解法：Lightweight Index + Monthly Detail

將資料拆成兩層：

**Index（catlist.json）**：只保留 Gallery 列表需要的欄位

```json
{
  "number": 42,
  "timestamp": "2026-02-01 05:12 UTC",
  "url": "https://github.com/.../cat_2026-02-01_0512_UTC.webp",
  "model": "gemini-3-pro-image-preview",
  "status": "success"
}
```

**Monthly Detail（cats/YYYY-MM.json）**：按月份存放詳細資訊

```json
{
  "number": 42,
  "prompt": "A highly detailed cinematic photograph...",
  "story": "一隻好奇的橘貓正在...",
  "idea": "街頭攝影風格...",
  "news_inspiration": ["某國舉辦...", "某市發現..."],
  "avoid_list": ["生物發光森林", "貓凝望月亮"]
}
```

### 遷移腳本

一次性遷移用 `scripts/migrate_catlist.py` 完成：

```python
index_fields = {"number", "timestamp", "url", "model", "status", "error"}
detail_fields = {"number", "prompt", "story", "idea", "news_inspiration", "avoid_list"}

index = []
monthly = defaultdict(list)

for cat in cats:
    index_entry = {k: cat[k] for k in index_fields if k in cat}
    index.append(index_entry)

    has_detail = any(cat.get(k) for k in detail_fields if k != "number")
    if has_detail:
        detail_entry = {k: cat[k] for k in detail_fields if k in cat}
        month = cat["timestamp"][:7]  # "YYYY-MM"
        monthly[month].append(detail_entry)
```

邏輯很簡單：遍歷所有貓咪，拆出 index 欄位和 detail 欄位，detail 按 `timestamp` 的前七個字元（`YYYY-MM`）分組存入月份檔案。

### 前端 Lazy Loading

Gallery 啟動時只需載入瘦身後的 `catlist.json`（37KB）。當使用者點開某隻貓的 Lightbox 時，才按需載入該月份的 detail 檔案：

```javascript
const CATS_BASE_URL = "https://raw.githubusercontent.com/yazelin/catime/main/cats/";
const detailCache = {}; // month -> detail array

async function fetchDetail(cat) {
  const month = cat.timestamp.slice(0, 7); // "YYYY-MM"
  if (!detailCache[month]) {
    try {
      const resp = await fetch(CATS_BASE_URL + month + ".json");
      if (resp.ok) {
        detailCache[month] = await resp.json();
      } else {
        detailCache[month] = [];
      }
    } catch {
      detailCache[month] = [];
    }
  }
  return detailCache[month].find(d => d.number === cat.number) || {};
}
```

加上 `detailCache` 快取，同一個月份的 detail 只會 fetch 一次。使用者瀏覽同月份的其他貓咪時，直接從快取讀取。

### 後端同步更新

`generate_cat.py` 也配合修改，每次產生新貓咪時同時寫入兩個檔案：

```python
index_fields = {"number", "timestamp", "url", "model", "status", "error"}
detail_fields = {"number", "prompt", "story", "idea", "news_inspiration", "avoid_list"}

# Write lightweight index entry to catlist.json
index_entry = {k: entry[k] for k in index_fields if k in entry}
cats.append(index_entry)

# Write detail entry to monthly file
month = entry["timestamp"][:7]
month_path = cats_dir / f"{month}.json"
detail_entry = {k: entry[k] for k in detail_fields if k in entry}
monthly.append(detail_entry)
```

### 成效

| 指標 | 拆分前 | 拆分後 | 改善 |
|------|--------|--------|------|
| 首頁載入 (catlist.json) | 215KB | 37KB | **-83%** |
| Lightbox 詳情 | 0KB (已含在首頁) | ~180KB (按月份按需) | 按需載入 |

首頁只需下載 37KB 的 index，而不是 215KB 的完整資料。Detail 只在使用者真正點開 Lightbox 時才會載入，且有快取機制。

---

## Lightbox 重新設計

在資料和圖片優化之外，也趁這次機會重新設計了 Lightbox 的互動介面。

### Overlay 按鈕：覆蓋在圖片上

原本的 Download 和 Copy Prompt 按鈕放在圖片下方，佔用額外的垂直空間。新設計將按鈕以半透明覆蓋方式放在圖片右下角：

```html
<div id="lb-img-wrap">
  <img id="lb-img" src="" alt="Cat">
  <div id="lb-img-actions">
    <button id="lb-download-btn" title="Download image"></button>
    <button id="lb-copy-btn" title="Copy prompt"></button>
  </div>
</div>
```

```css
#lb-img-actions {
  position: absolute;
  bottom: .5rem; right: .5rem;
  display: flex; gap: .35rem;
}
#lb-download-btn, #lb-copy-btn {
  background: rgba(0,0,0,.6);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,.3);
  color: #fff; padding: .3rem .7rem;
  border-radius: 20px;
}
```

按鈕使用 `backdrop-filter: blur(4px)` 產生毛玻璃效果，不遮擋圖片但又清晰可辨。

### Download 按鈕的 CORS 問題

最初的下載實作使用 `fetch` + `Blob` + `URL.createObjectURL`：

```javascript
// 原始寫法 - 有 CORS 問題
const resp = await fetch(currentCatUrl);
const blob = await resp.blob();
const url = URL.createObjectURL(blob);
// ...
```

因為圖片存在 GitHub Releases (`github.com`) 而 Gallery 跑在 `github.io`，跨域請求被 CORS 擋住。

解法很簡單——不用 fetch，直接開啟連結讓瀏覽器處理：

```javascript
lbDownloadBtn.addEventListener("click", () => {
  if (!currentCatUrl) return;
  const a = document.createElement("a");
  a.href = currentCatUrl;
  a.target = "_blank";
  a.click();
});
```

雖然不能直接觸發「儲存檔案」對話框，但使用者在新分頁中可以右鍵儲存。這是在不架設代理伺服器的前提下最務實的方案。

### Tabbed Interface：分頁式資訊面板

隨著 catime 新增了新聞靈感（news_inspiration）和約束清單（avoid_list），Lightbox 底下堆了四個區塊（Story、Idea、News、Constraints），視覺上很擁擠。改用 Tab 分頁：

```javascript
const TAB_DEFS = [
  { key: "story", label: "Story", panel: lbStory },
  { key: "idea", label: "Idea", panel: lbIdea },
  { key: "news", label: "News", panel: lbNews },
  { key: "avoid", label: "Constraints", panel: lbAvoid },
];
```

只有當該 Tab 有資料時才會顯示按鈕——早期的貓咪可能沒有 news 或 avoid_list，那些 Tab 就不會出現：

```javascript
const available = [];
if (detail.story) available.push("story");
if (detail.idea) available.push("idea");
if (detail.news_inspiration && detail.news_inspiration.length) available.push("news");
if (detail.avoid_list && detail.avoid_list.length) available.push("avoid");
```

每個 Tab panel 有自己的漸層背景色——Story 是紫粉色、Idea 是青藍色、News 是藍色、Constraints 是橘色。

### 手機版 Lightbox 優化

在 600px 以下的螢幕上，按鈕從覆蓋式改為置中排列在圖片下方：

```css
@media (max-width: 600px) {
  #lb-img-wrap { border-radius: 0; overflow: visible; box-shadow: none; }
  #lb-img { max-height: 45vh; border-radius: 12px; }
  #lb-img-actions { position: static; justify-content: center; margin-top: .5rem; }
  #lb-details { max-height: none; }
}
```

手機上 `position: absolute` 的 overlay 按鈕很難點到，改成 `position: static` 配合 `justify-content: center`，讓按鈕變成圖片下方的獨立行，更容易操作。同時 `max-height: none` 讓 Tab 面板不受高度限制，可以完整展開。

---

## CLI 更新：支援月份分割

CLI（`catime` 指令）也需要配合新的資料架構。原本 `catime 42` 會從 `catlist.json` 拿到所有資訊，現在 index 裡沒有 prompt 和 story 了。

新增 `enrich_cat` 函式，從月份 detail 檔案補齊資訊：

```python
DETAIL_URL = "https://raw.githubusercontent.com/{repo}/main/cats/{month}.json"
_detail_cache: dict[str, list[dict]] = {}

def fetch_detail(month, *, repo=DEFAULT_REPO, local=False):
    """Fetch monthly detail file, with caching."""
    if month in _detail_cache:
        return _detail_cache[month]
    # ... fetch from GitHub or local file ...
    _detail_cache[month] = details
    return details

def enrich_cat(cat, *, repo=DEFAULT_REPO, local=False):
    """Merge monthly detail into a cat index entry."""
    month = cat["timestamp"][:7]
    details = fetch_detail(month, repo=repo, local=local)
    detail = next((d for d in details if d.get("number") == cat.get("number")), None)
    if detail:
        return {**cat, **detail}
    return cat
```

CLI 也有快取機制。當使用者查詢同一個月份的多隻貓咪時，detail 只會下載一次。

---

## 小結

一天之內完成三項優化：

| 優化項目 | 改善幅度 | 影響範圍 |
|----------|----------|----------|
| PNG → WebP | 檔案大小 -87% | 所有 151+ 張圖片 |
| catlist.json 拆分 | 首頁載入 -83% | Gallery 前端 + CLI |
| Lightbox 重設計 | UX 提升 | Gallery 前端 |

三項合計，Gallery 的首頁載入從約 34MB + 215KB（圖片 + 資料）降到約 4.4MB + 37KB。在 4G 網路下，從需要 10 秒以上縮短到 2 秒以內。

核心思路一致：**只載入當下需要的東西**。

- 圖片用更有效率的格式（WebP）
- 資料拆成 index + detail，detail 按需載入
- 介面用 Tab 收納，只顯示有內容的面板

隨著 catime 持續每小時生產一張貓咪圖片，這些優化確保 Gallery 在圖片數量持續增長的情況下，仍然能保持快速的載入體驗。

---

## 參考資源

- [catime 專案誕生]({% post_url 2026-01-30-catime-birth %})
- [catime Gallery]({% post_url 2026-02-01-catime-gallery %})
- [catime AI Prompt]({% post_url 2026-02-02-catime-ai-prompt %})
- [catime 故事貓]({% post_url 2026-02-03-catime-story %})
- [catime 新聞貓]({% post_url 2026-02-06-catime-news-cat %})
- [WebP - Google Developers](https://developers.google.com/speed/webp)
- [catime GitHub Repository](https://github.com/yazelin/catime)
