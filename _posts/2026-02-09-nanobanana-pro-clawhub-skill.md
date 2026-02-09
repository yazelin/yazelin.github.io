---
layout: post
title: "我的第一個 ClawHub Skill：nanobanana-pro-fallback"
subtitle: "從 fork 到 publish，踩坑全記錄"
date: 2026-02-09
categories: [Agent Skills]
tags: [ClawHub, Agent Skills, Gemini, 圖片生成, Python, OpenClaw]
---

## 前言

最近在玩 [OpenClaw](https://openclaw.ai) 的 Skill 生態系，發現社群已經有人做了用 Gemini 生成圖片的 skill。試用之後覺得不錯，但有個痛點：當指定的 model 掛掉或不可用時，整個 skill 就直接報錯。於是我決定 fork 一份，加上 auto model fallback 機制 — 這就是 [nanobanana-pro-fallback](https://github.com/yazelin/nanobanana-pro) 的誕生故事。

---

## 為什麼要 Fork？

原版 skill 用的是固定 model（`gemini-2.0-flash-exp`），但 Gemini 的實驗性 model 常常會有不穩定的狀況。我希望的行為是：

1. 優先用使用者指定的 model
2. 如果失敗，自動 fallback 到下一個可用的 model
3. 全程不需要使用者手動介入

聽起來很簡單對吧？但實作過程比想像中曲折很多。

---

## 開發三部曲：SDK → stdlib → 又回 SDK

### 第一版：google-genai SDK

最直覺的做法就是用 Google 官方的 `google-genai` SDK：

```python
from google import genai

client = genai.Client(api_key=api_key)
response = client.models.generate_content(
    model=model_name,
    contents=prompt,
    config=genai.types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
    ),
)
```

寫起來很順，本機測試也沒問題。但推上去之後發現 — OpenClaw 的 Skill 執行環境（Copilot sandbox）裝不了 `google-genai`，因為它依賴太多套件了。

### 第二版：純 stdlib

既然裝不了第三方套件，那就用 Python 標準庫硬幹吧！直接用 `urllib.request` 打 REST API：

```python
import urllib.request
import json

url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
payload = json.dumps({
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
}).encode()

req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req)
```

能跑了！但寫起來很痛苦，錯誤處理和 response parsing 要自己搞一大堆。

### 第三版：回歸 SDK 單檔版

後來發現其實 OpenClaw skill 可以在 `SKILL.md` 裡指定依賴安裝指令，只要寫好 `pip install google-genai`，agent 就會幫你裝。所以最後又回到 SDK 版本，但這次精簡成單一檔案，乾淨俐落。

---

## 踩坑集錦

### 坑 1：Agent 不看 SKILL.md

這是最莫名其妙的一個。我在 `SKILL.md` 裡寫了詳細的使用說明，包括怎麼安裝依賴、怎麼呼叫腳本。結果 agent 完全不看，直接用 `python3 generate.py` 跑，參數也亂傳。

**原因**：Agent 在決定怎麼使用 skill 時，主要看的是 skill 的 `description` 欄位（會被注入到 system prompt），而 `SKILL.md` 只有在 agent 主動去讀的時候才會看到。

**解法**：把關鍵的使用方式直接寫在 skill 的 description 裡：

```yaml
description: |
  Generate images using Google Gemini API with auto model fallback.
  
  Usage: python3 generate.py --prompt "..." --output image.png
  
  Optional: --model MODEL_NAME --size 1024x1024
  
  Requires: GEMINI_API_KEY environment variable
  Install: pip install google-genai
```

這樣 agent 在 system prompt 階段就知道怎麼用了，不需要再去翻文件。

### 坑 2：image_size 參數的相容性

`gemini-2.0-flash-exp` 支援 `image_size` 參數來指定輸出圖片的尺寸，但 `gemini-2.5-flash-preview-04-17`（也就是 `gemini-2.5-flash-image`）卻不支援 — 傳了會直接 400 error。

**解法**：根據 model 名稱判斷是否傳 `image_size`：

```python
def _supports_image_size(model_name: str) -> bool:
    """Only certain models support the image_size parameter."""
    unsupported = ["gemini-2.5", "gemini-1.5"]
    return not any(tag in model_name for tag in unsupported)

config = genai.types.GenerateContentConfig(
    response_modalities=["TEXT", "IMAGE"],
)

if image_size and _supports_image_size(model_name):
    config.image_size = image_size
```

不是最優雅的做法，但實用。之後如果 Google 更新了 API，再來調整白名單。

---

## Model Fallback 機制

核心功能 — fallback chain：

```python
FALLBACK_MODELS = [
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.5-flash-preview-04-17",
]

def generate_image(prompt, model=None, **kwargs):
    models_to_try = [model] + FALLBACK_MODELS if model else FALLBACK_MODELS
    # 去重但保持順序
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]
    
    last_error = None
    for m in models_to_try:
        try:
            return _call_gemini(m, prompt, **kwargs)
        except Exception as e:
            print(f"Model {m} failed: {e}, trying next...")
            last_error = e
    
    raise last_error
```

簡單粗暴但有效。使用者指定的 model 優先，失敗就依序嘗試 fallback list 裡的其他 model。

---

## Publish 到 ClawHub

開發完成後，發布流程其實很簡單：

```bash
# 登入
clawhub login

# 發布
clawhub publish
```

但我遇到一個小插曲：原本想用 `nanobanana-pro` 這個 slug，結果已經被佔了（原版作者用的）。只好改名為 `nanobanana-pro-fallback`，反正也更能表達這個 fork 的特色。

---

## 成果

- **GitHub**: [github.com/yazelin/nanobanana-pro](https://github.com/yazelin/nanobanana-pro)
- **ClawHub**: `nanobanana-pro-fallback`
- **功能**: Gemini 圖片生成 + auto model fallback + image_size 相容性處理

---

## 小結

做一個 ClawHub Skill 的過程，其實就是一連串的「以為很簡單 → 踩坑 → 繞路 → 解決」。最大的收穫不是技術本身，而是理解了 AI agent 怎麼「看」skill — 它不會乖乖讀你的文件，你得把資訊送到它眼前。

如果你也在用 OpenClaw，歡迎試試 `nanobanana-pro-fallback`。有問題歡迎開 issue，或是直接 fork 去改 — 開源的精神就是這樣嘛 😄
