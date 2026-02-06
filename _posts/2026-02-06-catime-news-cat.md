---
layout: post
title: "catime 新聞貓：用 Google Search Grounding 讓貓咪反映時事"
subtitle: "每小時一隻與新聞相關的 AI 貓咪"
date: 2026-02-06
categories: [AI]
tags: [AI, Gemini, Google Search, catime, Grounding, Python]
---

## 前言

catime 系列走到這裡，貓咪們已經擁有了自己的故事、自己的風格、自己的 Gallery。但始終少了一件事——**和這個世界的連結**。

AI 生成的場景再有創意，本質上仍是封閉的想像力循環。同樣的模型、同樣的 prompt 結構，跑久了難免疲態盡現。有沒有辦法讓每一隻貓咪都帶著當下這個瞬間的印記？

答案是 **Google Search Grounding**。

這是 catime 系列中我最興奮的一次改動——從第 154 隻貓開始，每隻貓咪的靈感都來自真實世界正在發生的事。三葉蟲化石的重大發現、冬季奧運的開幕典禮、南非海底的新物種——這些新聞穿越 AI 的管線，最終化為一隻在古生物實驗室清理化石的橘貓。

---

## Google Search Grounding 是什麼

Gemini API 提供一個稱為 **Google Search Grounding** 的功能：在呼叫 `generate_content` 時，可以將 `GoogleSearch` 作為 tool 傳入，讓模型在回答之前先即時搜尋 Google，取得最新的資訊。

```python
from google.genai import types

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=NEWS_PROMPT,
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    ),
)
```

這和一般的 Gemini 呼叫只差一個參數，卻帶來本質上的差異：

| 一般 Gemini 呼叫 | 加上 Google Search Grounding |
|---|---|
| 依賴訓練資料（有截止日期） | 即時存取 Google 搜尋結果 |
| 回答基於已知知識 | 回答基於當下最新資訊 |
| 適合創意生成、分析 | 適合時事查詢、事實查核 |

對 catime 來說，這代表每小時的貓咪都能接觸到**正在發生的世界**。

---

## 新聞如何流入貓咪：三階段生成管線

原本的 catime 是兩階段管線（idea -> render），加入新聞後進化為三階段：

### Stage 0：新聞搜尋

```python
NEWS_PROMPT = (
    "Search for today's interesting world news and current events.\n\n"
    "Pick 3-5 news items that are:\n"
    "- Fun, heartwarming, quirky, cultural, scientific, sports, "
    "weather, travel, tourism, or lifestyle related\n"
    "- From DIFFERENT regions of the world\n"
    "- AVOID: war, terrorism, political controversy, violent crime, "
    "natural disasters with casualties\n\n"
    "For each item, write a 1-sentence summary in 繁體中文. "
    "MUST include the city/country where it happened.\n\n"
    "Output a JSON object with exactly this format:\n"
    '{"news": ["繁體中文摘要 1", "繁體中文摘要 2", ...]}'
)
```

`fetch_news_inspiration()` 函式透過 Google Search Grounding 呼叫 Gemini，取得 3-5 則當日新聞摘要。注意幾個設計選擇：

- **只選正面新聞**：有趣的、溫暖的、科學的、文化的。明確排除戰爭、暴力、政治爭議
- **多元地理分布**：要求來自不同國家／地區
- **繁體中文輸出**：摘要直接以繁體中文撰寫
- **包含地點**：每則新聞必須標註發生城市或國家

### Stage 1：創意構思

新聞摘要被注入 `IDEA_PROMPT`，成為靈感來源之一：

```python
news_section = (
    "Here are some current world events for inspiration. "
    "You MAY creatively incorporate one into the cat scene, "
    "or ignore them entirely. "
    "Aim for roughly half news-inspired, half pure imagination.\n"
    f"{bullets}\n\n"
)
```

關鍵設計：新聞是**靈感**而非**指令**。AI 可以自由選擇是否採用某則新聞，也可以完全忽略。目標是大約一半的貓咪受新聞啟發、一半來自純粹想像，保持多樣性。

### Stage 2：Prompt 渲染

將 Stage 1 產出的 idea 和 story 轉換為具體的圖片生成 prompt，加入攝影或藝術風格的技術細節。

整條管線的資料流：

```
Google Search -> [3-5 則新聞] -> 創意構思 -> {idea, story} -> Prompt 渲染 -> {prompt}
                                    ^
                                    |
                              avoid_list（避免重複）
```

---

## Avoid List：對抗重複的記憶機制

即使有了新聞靈感，如果不處理重複問題，貓咪還是會陷入千篇一律。catime 的解法是 **avoid list**——每 5 隻貓更新一次的「禁用清單」。

```python
def maybe_update_creative_notes(cat_number: int) -> dict:
    if cat_number % 5 != 0:
        return notes  # 不是第 5 隻的倍數，跳過

    # 收集最近 10 隻貓的 prompt、story、idea
    # 讓 Gemini 分析重複模式
    # 輸出: {"avoid_list": ["繁體中文短語 1", ...]}
```

運作原理：

1. 每產生第 5、10、15... 隻貓時觸發
2. 讀取最近 10 隻貓的 prompt、story、idea
3. 讓 Gemini 分析哪些主題、風格、用詞被過度使用
4. 產出 8-15 個應避免的短語
5. 下一批貓咪的 `IDEA_PROMPT` 會包含這份清單

實際的 avoid list 長這樣：

```json
{
  "avoid_list": [
    "profound curious wonder",
    "intelligent wide eyes",
    "delicate paw tentatively",
    "glowing crystalline conduits",
    "bathed in ethereal light",
    "seamlessly integrated into",
    "magnificent cat",
    "exquisite detail"
  ],
  "updated_at": "2026-02-06 13:58 UTC"
}
```

這些都是 Gemini 在自由創作時容易反覆使用的詞彙。把它們列入黑名單後，下一輪的產出就會被迫探索新的表達方式。

---

## 攝影 vs 插畫：風格多樣性的刻意平衡

看過 catime 早期作品的人會注意到，AI 有非常強的傾向產生「奇幻數位藝術」風格——發光的水晶、生物發光森林、宇宙場景。所有東西都很「美」，但千篇一律。

解法是在 `IDEA_PROMPT` 中明確要求兩大類風格**交替使用**：

```
(5) Pick ONE visual style. IMPORTANT: alternate EQUALLY
    between these two broad categories:
    - PHOTOGRAPHY: street photography, macro photo,
      DSLR portrait with bokeh, 35mm film, Polaroid,
      drone aerial shot, infrared photography...
    - ILLUSTRATION/ART: watercolor, pixel art, oil painting,
      vintage poster, manga, ukiyo-e, Art Deco,
      pencil sketch, gouache, stained glass, claymation...
```

同時，`RENDER_PROMPT` 中對攝影風格做了額外的約束：

```
(5) CRITICAL - match the prompt style to the medium:
    - If PHOTOGRAPHY: use camera terms (e.g. '35mm lens,
      f/1.8, natural light, shallow depth of field, grain,
      candid shot'). Do NOT use words like 'breathtaking',
      'intricate', 'ethereal', 'brushstrokes', or 'palette'.
```

攝影風格的貓咪看起來像是攝影師在街頭、實驗室、咖啡廳拍到的真實貓咪；插畫風格的則可以是浮世繪、剪紙藝術、像素畫。兩者交替出現，讓 Gallery 瀏覽起來充滿節奏感。

---

## 新聞靈感在 Gallery 的呈現

前端的 Lightbox 也做了相應更新。點擊任一貓咪圖片，除了原有的 Story、Idea 分頁，現在多了 **News** 分頁：

```javascript
const TAB_DEFS = [
  { key: "story", label: "Story", panel: lbStory },
  { key: "idea",  label: "Idea",  panel: lbIdea },
  { key: "news",  label: "News",  panel: lbNews },
  { key: "avoid", label: "Constraints", panel: lbAvoid },
];
```

News 分頁顯示啟發這隻貓咪的新聞摘要列表，每則新聞以 tag 形式呈現，背景帶有藍色漸層：

```css
#lb-news {
  background: linear-gradient(135deg,
    rgba(71, 150, 255, .3), rgba(100, 180, 255, .2));
}
.news-tag {
  display: inline-block;
  padding: .15rem .5rem;
  border-radius: 20px;
  font-size: .68rem;
}
```

前端透過月份檔案（如 `cats/2026-02.json`）按需載入詳細資料，包括 `news_inspiration` 陣列，不影響主頁面的載入速度。

---

## 從英文到繁體中文

這次改動的另一個重點是**輸出語言的轉換**。

早期的 catime，idea 和 story 都是英文。但仔細想想，catime 的目標觀眾主要是中文使用者，Gallery 的訪客多數來自台灣。用英文寫故事，總隔了一層。

新的 prompt 結構明確要求繁體中文輸出：

```
Output a JSON object with exactly this format:
{"idea": "繁體中文場景描述，1-2句，包含藝術風格",
 "story": "繁體中文短故事，2-3句"}

Both idea and story should be in Traditional Chinese.
```

新聞摘要同樣以繁體中文呈現。不過實際運行中，idea 欄位經常以英文呈現——AI 傾向用英文描述視覺場景和藝術風格，story 欄位則穩定以繁體中文輸出。最終的 image prompt（Stage 2 輸出）同樣是英文，因為圖片生成模型對英文 prompt 的理解較好。

同時也移除了原本 200 字的故事長度限制，讓每隻貓的故事可以自然地展開，不再受到人為的字數壓縮。

---

## 第一隻新聞貓：#154

讓我們看看第一隻新聞貓是怎麼誕生的。

**新聞靈感**（2026-02-06 的世界新聞）：
- 美國聖安東尼奧的研究團隊在 5 億年前的三葉蟲化石中發現甲殼素
- 2026 年米蘭-科爾蒂納冬季奧運正式開幕
- 「Reasons to Stay」平台上一位陌生人讀到一封信後重拾希望
- 南非開普敦大學科學家發現全新種類的寄生海螺

**AI 的選擇**：從三葉蟲化石發現這則新聞出發。

**生成的 idea**：
> A ginger tabby cat, with intense focus, meticulously dusts a small, ancient trilobite fossil with a fine-bristled brush under a magnifying lamp on a cluttered workbench filled with scientific tools and research notes in a university paleontology lab, depicted in a sharp macro photograph.

**生成的 story**：
> 一隻橘色虎斑貓，專注地用細毛刷清理工作檯上一塊古老的化石。放大鏡下，牠的小爪輕巧地撥動，彷彿在探索數億年前的地球秘密。這間大學古生物實驗室裡，科學研究與貓咪的好奇心意外地交織。

新聞中的「5 億年前三葉蟲化石」變成了一隻橘貓在古生物實驗室裡清理化石的場景。風格選擇了 macro photograph（微距攝影），帶有 f/2.8 淺景深和暖色調實驗室燈光。

這就是新聞貓的魔力——**真實世界的事件，經過 AI 的創意轉譯，變成了一個有溫度的貓咪故事**。

---

## 小結

Google Search Grounding 為 catime 帶來的不只是技術上的升級，而是一種根本性的轉變：從「AI 自言自語」變成「AI 回應世界」。

每隻新聞貓都是一個時間膠囊。多年後回頭看 Gallery，你不只能看到 AI 繪圖技術的演進，還能看到那一天世界上正在發生什麼。2026 年 2 月 6 日，有人發現了 5 億年前的甲殼素，有人在米蘭為冬奧歡呼——而一隻橘貓，正在實驗室裡小心翼翼地清理一塊三葉蟲化石。

---

## 參考資源

- [catime 專案誕生]({% post_url 2026-01-30-catime-birth %})
- [catime Gallery]({% post_url 2026-02-01-catime-gallery %})
- [catime AI Prompt]({% post_url 2026-02-02-catime-ai-prompt %})
- [catime 故事貓]({% post_url 2026-02-03-catime-story %})
