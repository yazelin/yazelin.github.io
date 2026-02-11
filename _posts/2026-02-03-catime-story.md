---
layout: post
title: "catime 故事貓：為每張 AI 貓咪圖加上微故事"
subtitle: "讓圖片不只是圖片，還有自己的故事"
date: 2026-02-03
categories: [AI]
tags: [AI, Gemini, catime, 故事生成, Python]
---

![catime 故事貓：為每張 AI 貓咪圖加上微故事](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-03-catime-story.png)

## 前言

catime 系列走到第四篇，專案已經能每小時自動產生一張 AI 貓咪圖、上傳 GitHub Release、在 Gallery 頁面瀏覽。

但我一直覺得缺了什麼。

那些圖片很美，有在太空漫步的貓、在蒸氣龐克工廠操作機械的貓、在日式庭園凝視錦鯉的貓。可是它們就只是——圖片。你看完了，滑過去，然後忘了。

我想讓每張圖有自己的靈魂。不是長篇小說，只要兩三句話，一個微故事，讓觀者知道這隻貓從哪裡來、正在做什麼、心裡在想什麼。

---

## story 欄位的誕生

在原本的流程裡，Gemini 只負責產出一段英文 image prompt，交給圖片生成模型繪製。prompt 是給機器讀的，對人類來說只是一長串技術性的描述詞。

改造的想法很直接：既然 AI 已經在構思場景了，何不請它同時寫一段繁體中文的短故事？

於是 Gemini Flash 的輸出格式從純文字 prompt，變成了 JSON：

```json
{
  "prompt": "English image prompt here",
  "story": "繁體中文短故事，2-3句"
}
```

`prompt` 是給圖片生成模型讀的英文指令，而 `story` 則是給人讀的中文故事。兩者從同一次 AI 呼叫中誕生，卻面向完全不同的讀者。

---

## 故事的產生方式

做法很簡單：把原本只產出英文 prompt 的 Gemini Flash 呼叫，改成同時產出 prompt + story。核心函式改名為 `generate_prompt_and_story()`，要求 AI 一次完成兩件事：

```python
PROMPT_META = (
    "You are a creative storyteller AND prompt engineer for AI image generation.\n\n"
    "Requirements:\n"
    "(1) A cat must be the subject or prominently featured\n"
    "(2) The image content MUST match the story\n"
    "(3) Use varied styles and unique scenes\n"
    "(6) If previous stories are provided, your new story should "
    "SUBTLY CONTINUE or EXTEND the narrative\n\n"
    "{recent_section}"
    'Output a JSON: {{"prompt": "English image prompt", "story": "繁體中文短故事，2-3句"}}'
)
```

關鍵設計是**第 (6) 條規則**：如果有前幾隻貓的故事作為上下文，新故事應該「微妙地延續」上一段敘事。這讓連續的貓咪之間有了故事線。

同時，`get_recent_context()` 也升級了——除了餵入最近的 prompt（避免視覺重複），也把最近的 story 一起送進去：

```python
def get_recent_context(n: int = 10) -> dict:
    """Return the last n prompts and stories from catlist.json."""
    cats = json.loads(catlist_path.read_text())
    valid_cats = [c for c in cats if c.get("prompt")][-n:]
    return {
        'prompts': [c["prompt"] for c in valid_cats],
        'stories': [c.get("story", "") for c in valid_cats if c.get("story")]
    }
```

故事不只是附加品——因為 prompt 和 story 是同一次呼叫產出的，AI 會讓圖片內容與故事情節互相呼應。

---

## 故事在 UI 中的呈現

在 Gallery 的 lightbox 中，點開任何一張貓咪圖，現在除了看到英文 prompt，還能看到繁體中文故事。Story 區塊有自己的視覺設計——一道紫粉色的漸層背景，文字置中顯示，營造出一種翻開故事書的感覺：

```css
#lb-story {
  background: linear-gradient(135deg,
    rgba(201, 177, 255, .4),
    rgba(255, 107, 157, .3));
}
#lb-story-text {
  color: #fff;
  font-size: .85rem;
  line-height: 1.5;
  text-align: center;
}
```

JavaScript 端則會判斷是否有 story 資料，只有存在時才顯示：

```javascript
if (cat.story) {
  lbStoryText.textContent = cat.story;
  lbStory.classList.remove("hidden");
}
```

這確保了沒有故事的早期貓咪圖（Cat #1-#90）不會出現空白的故事區塊。

---

## 連續敘事的驚喜

一個意外的收穫是，因為 AI 每次產生 prompt 時會參考近期的紀錄（避免重複），故事之間有時會自然地產生連貫性。翻看 Gallery 中的貓咪們，你會讀到這樣的敘事：

> 貓咪的星艦沿著隱秘的光道，緩緩駛入了星雲深處的核心......

> 貓咪的星艦輕輕降落在生物發光的水晶花園中。好奇的牠走出星艦，被一朵閃爍著柔和光芒的半透明水晶花所吸引......

> 貓咪在欣賞完發光的水晶花後，被園中深處一處柔和的微光所吸引。牠發現了一汪寧靜的液態光池......

每隻貓都在延續前一隻貓的旅程。不是設計好的，而是 AI 在有限的上下文中自己「接」出來的。Gallery 從一座圖片展覽，變成了一部章回體的奇幻小說。

---

## 資料結構的分層

故事資料和 prompt 一起儲存在 `catlist.json` 中。Gallery 前端在使用者點開 lightbox 時顯示 story 和 prompt。後來隨著欄位增加（idea、news_inspiration、avoid_list），資料在 [WebP 優化]({% post_url 2026-02-07-catime-webp-optimization %})時被拆分為輕量索引 + 月度明細的兩層結構。

---

## 小結

`story` 是一個很小的功能——只是在 AI 產生 prompt 的同時，多要求它寫兩三句中文故事。但這個小改動改變了整個專案的氣質。

catime 不再只是「每小時一張 AI 貓咪圖」的技術展示，而是一本持續書寫的貓咪故事集。每隻貓有名字（好吧，暫時沒有），有場景，有情節，有前因後果。你可以從第 91 號貓開始，跟著牠穿越彩色玻璃大教堂、漫步日式庭園、探索外星植物園、駕駛星際飛梭......

技術上只加了一個 JSON 欄位。感受上，那些像素組成的貓咪，忽然活了過來。

---

## 參考資源

- [catime 專案誕生]({% post_url 2026-01-30-catime-birth %})
- [catime Gallery]({% post_url 2026-02-01-catime-gallery %})
- [catime AI Prompt]({% post_url 2026-02-02-catime-ai-prompt %})
- [Nanobanana：AI 圖片生成 MCP Server]({% post_url 2026-01-14-nanobanana-image-generation %})
