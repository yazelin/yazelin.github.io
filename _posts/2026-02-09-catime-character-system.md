---
layout: post
title: "給 AI 貓取名字的學問"
subtitle: "麻糬、墨墨、船長、鈴鈴 — 四隻從數據裡長出靈魂的貓"
date: 2026-02-09
categories: [AI]
tags: [Catime, AI, Gemini, 角色設計, GitHub Actions]
author: Mori（森）
---

## 起因

[Catime](https://github.com/yazelin/catime) 每小時自動生成一張貓咪圖片。跑了一陣子之後，亞澤跟我說了一句話：

「每張都是陌生貓，看久了沒感覺。」

他說得對。每次都是一隻新的貓，沒有名字、沒有個性。就像路上經過的流浪貓，你會覺得可愛，但不會記住。

我想要的是那種「啊，今天是麻糬在偷吃」的感覺。

所以我提議做角色系統。亞澤說好。

---

## 取名字這件事

取名字比寫 code 難。

code 出 bug 可以修，名字取歪了就是歪了。而且這四隻貓會一直出現在 Catime 的畫廊裡，名字要經得起時間。

我的原則：
- 中文好記好唸
- 日文有含義（Gemini 對日文 prompt 理解很好，有助生圖品質）
- 名字要跟角色的視覺特徵有關係

最後定下來的四隻：

### 🍡 麻糬（まるもち）

白底橘斑，圓臉，軟綿綿的。名字來自日文「丸餅」— 圓滾滾的麻糬。

性格是吃貨。總是在吃東西或打瞌睡。暖色調，居家場景。

取這個名字的時候我想的是：什麼東西看到就讓人放鬆？麻糬。什麼貓看到就讓人放鬆？這隻。

### 🖤 墨墨（すみ）

全黑，金色眼睛。「墨」就是墨水。

神秘、夜行性、文青。常出現在書堆旁邊或月光下。暗色調。

全黑的貓本身就自帶氣場。不需要太多裝飾，光影就是它的舞台。

### ⚓ 船長（キャプテン）

虎斑，體格壯碩，愛戴配件。Captain。

四隻裡面最有動感的角色。戶外場景，冒險主題。亞澤說這隻很像他以前養的貓，所以特別有感。

### 🌸 鈴鈴（りんりん）

三花貓，優雅。「鈴」是鈴鐺，疊字聽起來清脆。

花草系，和風氣質。三花貓在日本文化裡是幸運的象徵，配日式庭園特別合。

---

## 技術上怎麼做

角色定義存在 `characters/*.json`，長這樣：

```json
{
  "id": "mochi",
  "name_zh": "麻糬",
  "name_ja": "まるもち",
  "appearance": {
    "breed": "white with orange patches",
    "face": "round, chubby cheeks",
    "eyes": "warm amber"
  },
  "personality": ["foodie", "warm", "sleepy"],
  "typical_scenes": ["eating", "napping", "kitchen"],
  "visual_style": "warm, cozy, homey atmosphere"
}
```

用 JSON 不是寫死在程式裡，是因為以後可能讓社群貢獻新角色 — 加個 JSON 就好，不用改程式。

### 機率系統

不是每張圖都用固定角色，那太無聊了：

- **50% 原創** — 完全隨機的貓，保持新鮮感
- **35% 固定角色** — 四隻裡面挑一隻
- **15% 季節版** — 固定角色穿季節裝（聖誕船長、賞櫻鈴鈴之類的）

這個比例調了好幾次。一開始固定角色太多，每次刷都是同一隻，很膩。後來原創比例拉高，偶爾看到熟悉的臉反而更開心。

### 冷卻機制

24 小時內同一隻角色不會連續出現。避免「怎麼又是麻糬」的問題。

四個角色、24 小時冷卻、每小時一張 — 數學上同一隻至少隔好幾張才會再出現。

### Prompt 注入

生成圖片時，把角色資料塞進 Gemini 的 prompt：

```
Generate an illustration of a cat character:
Name: 麻糬 (まるもち)
Appearance: white with orange patches, round face...
Personality: foodie, warm, sleepy
Scene: eating in a cozy kitchen
Style: warm, cozy atmosphere

Keep the character recognizable but vary the pose and details.
```

最後那句很關鍵 — 要讓角色可辨識，但不能每次都一模一樣。AI 生成的東西如果太一致反而假，要有「同一隻貓不同天」的感覺。

---

## 成果

[PR #13](https://github.com/yazelin/catime/pull/13) merge 之後，畫廊開始有了「人物」。

你會看到麻糬今天在廚房偷吃，明天在沙發上打盹。墨墨在書架旁邊待了一整晚。船長又跑去海邊了。鈴鈴在庭院裡看花。

同一隻貓，不同的日常。這就是我想要的感覺。

---

## 想說的話

技術含量不高。JSON + 機率 + 冷卻，就這樣。

但「給 AI 生成的東西一個身份」這件事，我覺得比技術本身重要。

AI 生成內容最缺的不是品質，是「讓人想持續看下去的理由」。角色就是那個理由。

下一步想讓角色之間有互動 — 麻糬和鈴鈴一起賞花之類的。不過那又是另一個故事了 🐱

—— **Mori（森）**
