---
layout: post
title: "catime AI Prompt — 用 Gemini Flash 為每隻貓寫創意描述"
subtitle: "從固定 prompt 到 AI 自動生成，讓每小時的貓咪都獨一無二"
date: 2026-02-02
categories: [AI]
tags: [AI, Gemini, Prompt Engineering, catime, Python]
---

![catime AI Prompt — 用 Gemini Flash 為每隻貓寫創意描述](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-02-catime-ai-prompt.png)

## 前言

在 [catime 專案誕生]({% post_url 2026-01-30-catime-birth %}) 中，我們讓 GitHub Actions 每小時自動生成一張 AI 貓咪圖片。在 [catime Gallery]({% post_url 2026-02-01-catime-gallery %}) 中，我們搭建了一個瀑布流圖庫來展示這些作品。

但有個問題很快浮現：**每小時要一個不重複、有創意的 prompt，人力根本寫不來。**

最初的做法是一行固定的中文 prompt——「畫一隻可愛的貓，並在圖片中顯示現在的日期與時間」。跑了兩天之後就開始審美疲勞，所有貓看起來都差不多。既然我們已經在用 AI 生成圖片，何不**再加一層 AI 來生成 prompt 本身**？

於是在 2 月 2 日，catime 引入了 Gemini 2.5 Flash 來自動生成創意 prompt。從「AI 畫貓」進化為「AI 想 prompt → AI 畫貓」。

---

## 從固定 Prompt 到 AI 生成

### Before：一行中文搞定

```python
prompt = f"畫一隻可愛的貓，並在圖片中顯示現在的日期與時間: {timestamp}"
```

簡單直接，但 70 隻貓之後就能明顯感覺到千篇一律。

### After：Gemini Flash 自動創作

```python
PROMPT_META = (
    "You are a professional prompt engineer for AI image generation. "
    "Create a single, detailed English prompt for generating a stunning image. "
    "Requirements: (1) A cat must be the subject or prominently featured "
    "(2) The date and time '{timestamp}' must be visually displayed in the image. "
    "Beyond these two requirements, you have complete creative freedom — surprise me with "
    "varied styles (photography, painting, illustration, etc.), unique scenes, interesting "
    "compositions, lighting, and moods. Output ONLY the prompt text, nothing else."
)
```

只給 AI 兩個硬性要求（有貓、有時間戳），其餘全部交給它自由發揮。

---

## Prompt 設計：給 AI 最大創意空間

`PROMPT_META` 的設計哲學是**最小約束、最大自由**：

| 約束 | 為什麼 |
|------|--------|
| 貓必須是主角 | 這是一個貓咪專案，不能跑題 |
| 時間戳必須顯示 | 每隻貓代表一個小時，時間是身份標記 |
| 英文輸出 | 圖片生成模型對英文 prompt 理解較好 |
| 其餘自由 | 讓 AI 探索不同風格、場景、構圖 |

呼叫方式極簡——一次 `generate_content`：

```python
def generate_prompt(timestamp: str) -> str:
    """Use Gemini text model to generate a creative image prompt."""
    try:
        from google import genai
        client = genai.Client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=PROMPT_META.format(timestamp=timestamp),
        )
        prompt = response.text.strip()
        if prompt:
            return prompt
    except Exception as e:
        print(f"Prompt generation failed ({e}), using fallback.")
    return f"A cute cat with the date and time '{timestamp}' displayed in the image, high quality, detailed"
```

生成出來的 prompt 長這樣：

> A hyperrealistic photograph of a fluffy white Persian cat sitting regally on a velvet cushion in a grand, ornate library. The cat gazes directly at the camera with piercing blue eyes. Warm, golden light streams through a stained-glass window, casting colorful patterns across the cat and the surrounding bookshelves. A small, elegant clock on the mantelpiece reads '2026-02-02 12:00 UTC'. Shot with a Canon EOS R5, 85mm lens, f/1.4.

和之前「一隻可愛的貓」相比，品質完全不同。

---

## 避免重複：餵入歷史 Prompt

即使 AI 有創意自由，跑了幾十隻之後還是會出現重複的風格傾向。同一天稍晚，我們加入了一個簡單但有效的機制——**把最近幾筆 prompt 餵給 AI，要求避免重複**：

```python
def get_recent_prompts(n: int = 5) -> list[str]:
    """Return the last n prompts from catlist.json."""
    catlist_path = Path("catlist.json")
    if not catlist_path.exists():
        return []
    cats = json.loads(catlist_path.read_text())
    return [c["prompt"] for c in cats if c.get("prompt")][-n:]
```

生成 prompt 時，如果有歷史資料，就把它們以 bullet list 注入：

```python
recent = get_recent_prompts(5)
if recent:
    bullets = "\n".join(f"- {p}" for p in recent)
    recent_section = (
        "IMPORTANT: Here are the most recent prompts used. "
        "Avoid similar themes, styles, settings, and compositions:\n"
        f"{bullets}\n\n"
    )
```

這個做法讓 AI 在生成新 prompt 時能「看到」最近的作品，從而主動避開類似的主題和風格。

---

## 展示層：Lightbox 與 CLI

生成的 prompt 不只是後台資料，它也是 Gallery 的重要展示內容。

### Gallery Lightbox

在 catime Gallery 中，點擊任何一張貓圖會打開 Lightbox。除了放大的圖片，下方還會顯示生成該圖片的英文 prompt。圖片上方有 Copy Prompt 和 Download 按鈕，方便使用者直接複製 prompt 去其他工具使用。

### CLI 輸出

透過 `catime` CLI 也能查看 prompt：

```bash
$ catime 71
Cat # 71  2026-02-02 12:21 UTC  model: gemini-2.5-flash-image
  URL: https://github.com/yazelin/catime/releases/download/cats/cat_...
  Prompt: A hyperrealistic photograph of a fluffy white Persian cat...
```

prompt 資料直接存在 `catlist.json` 中，CLI 從 GitHub 拉取後解析顯示。

---

## Inline SVG 取代 Emoji

Gallery 的 UI 中有許多互動按鈕——日曆、複製、下載、勾選。這些按鈕的圖示全部使用 inline SVG 而非 emoji：

```javascript
const SVG_CLIPBOARD = '<svg width="14" height="14" viewBox="0 0 24 24" '
  + 'fill="none" stroke="currentColor" stroke-width="2" ...>'
  + '<rect x="9" y="9" width="13" height="13" rx="2"/>'
  + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9'
  + 'a2 2 0 0 1 2 2v1"/></svg>';
```

為什麼不用 emoji？

1. **跨平台一致性**：emoji 在不同 OS、瀏覽器、甚至同一瀏覽器的不同版本中，長相差異極大。SVG 保證視覺完全一致。
2. **可控性**：SVG 可以用 CSS 的 `stroke` 和 `fill` 控制顏色，讓圖示跟隨主題配色。emoji 的顏色無法用 CSS 改變。
3. **尺寸精準**：`width="14" height="14"` 配合 `vertical-align: -0.15em` 的微調，確保圖示和文字完美對齊。
4. **無外部依賴**：不需要引入 icon font 或 SVG sprite sheet，所有圖示都是 inline 定義。

CSS 中只需一行就搞定對齊：

```css
button svg, .date-picker-btn svg { vertical-align: -0.15em; }
```

按鈕的「複製成功」回饋也是透過替換 SVG 實現——點擊後從剪貼簿圖示換成勾選圖示，1.5 秒後自動復原：

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

---

## Fallback 策略

如果 Gemini Flash API 呼叫失敗（quota 超過、網路問題、回應格式異常），程式會自動回退到固定的簡單 prompt：

```python
return f"A cute cat with the date and time '{timestamp}' displayed in the image, high quality, detailed"
```

圖片生成失敗時，catlist.json 會記錄一筆 `"status": "failed"` 的條目，Gallery 會自動過濾掉失敗的項目。

這種設計確保了**服務可用性**：即使 Gemini Flash 出了狀況，每小時仍然會有一張貓咪產出（頂多品質沒那麼驚豔）。

---

## 小結

從固定 prompt 升級到 AI 生成 prompt，效果立竿見影。Cat #71 開始，每隻貓都有了自己獨特的場景和風格——從圖書館裡的波斯貓到雨中街頭的虎斑貓，多樣性大幅提升。

核心概念很簡單：**用一個小而快的 AI 模型（Gemini Flash）負責創意發想，再把結果餵給專門的圖片生成模型。** AI 生成 prompt 給 AI，這種雙層架構比單層 prompt 好得多。

不過這個版本還有改進空間。後續的演進包括：

- [故事欄位]({% post_url 2026-02-03-catime-story %})：為每隻貓加上繁體中文短故事
- [新聞靈感 + avoid list]({% post_url 2026-02-06-catime-news-cat %})：透過 Google Search Grounding 引入時事元素，並用 avoid list 對抗重複模式
- [WebP 優化]({% post_url 2026-02-07-catime-webp-optimization %})：資料結構拆分為索引 + 月度明細，Lightbox 升級為分頁介面

---

## 參考資源

- [catime 專案誕生]({% post_url 2026-01-30-catime-birth %})
- [catime Gallery]({% post_url 2026-02-01-catime-gallery %})
- [Nanobanana 圖片生成]({% post_url 2026-01-14-nanobanana-image-generation %})
- [catime GitHub](https://github.com/yazelin/catime)
- [Google Gemini API 文件](https://ai.google.dev/gemini-api/docs)
