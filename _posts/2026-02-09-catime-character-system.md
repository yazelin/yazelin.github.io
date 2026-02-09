---
layout: post
title: "Catime 角色系統：給 AI 貓取名字的學問"
subtitle: "麻糬、墨墨、船長、鈴鈴 — 從隨機生成到有靈魂的角色"
date: 2026-02-09
categories: [AI]
tags: [Catime, AI, Gemini, 角色設計, GitHub Actions]
---

## 前言

[Catime](https://github.com/yazelin/catime) 是我做的一個小專案：用 GitHub Actions 每小時自動觸發一次，透過 Gemini 生成一張貓咪圖片，然後發布出來。聽起來很療癒對吧？但跑了一陣子之後，我發現一個問題 — **每張都是陌生貓**。

沒有名字、沒有個性、沒有連結感。就像每次路上遇到不同的流浪貓，你會覺得可愛，但不會記住。

我想要的是那種「啊，今天是麻糬在吃東西！」的感覺。於是，角色系統就這樣誕生了。

---

## 四個角色的誕生

我設計了四隻固定角色，每隻都有獨特的視覺特徵和性格設定：

### 🍡 麻糬（まるもち）

- **外觀**：白底橘斑，圓圓的臉，短毛，看起來軟綿綿
- **性格**：吃貨，溫暖系，總是在吃東西或打瞌睡
- **風格**：暖色調，居家場景居多

麻糬是那種讓人看了就放鬆的存在。名字來自日文的「丸餅（まるもち）」，圓滾滾的麻糬，跟這隻貓的形象完美契合。

### 🖤 墨墨（すみ）

- **外觀**：全黑，金色或綠色眼睛，毛髮光滑
- **性格**：神秘，夜行性，文青風，常出現在書堆或窗邊
- **風格**：暗色調，月光、燭光場景

「墨（すみ）」就是墨水的意思。全黑的貓本身就自帶神秘感，配上文青場景簡直絕了。

### ⚓ 船長（キャプテン）

- **外觀**：虎斑，體格壯碩，常戴帽子或圍巾等配件
- **性格**：冒險家，活力充沛，動感十足
- **風格**：戶外場景，動態構圖

船長是四隻裡面最有「動作感」的角色。名字就是日文的「Captain（キャプテン）」，帶領大家去冒險。

### 🌸 鈴鈴（りんりん）

- **外觀**：三花貓（白底帶橘色和黑色斑塊），優雅姿態
- **性格**：優雅，喜歡花草，和風氣質
- **風格**：花草系，柔和色彩，日式庭園

「鈴（りん）」是鈴鐺的意思，疊字「鈴鈴」聽起來就很可愛。三花貓在日本文化中被視為幸運的象徵，配上和風場景特別合適。

---

## 命名哲學

你可能注意到了，每個角色都有日文名和中文暱稱。這不是隨便取的：

| 角色 | 中文 | 日文 | 含義 |
|------|------|------|------|
| 麻糬 | まるもち | 丸餅 | 圓滾滾的麻糬 |
| 墨墨 | すみ | 墨 | 墨水，象徵黑色與文藝 |
| 船長 | キャプテン | Captain | 冒險家的領袖 |
| 鈴鈴 | りんりん | 鈴鈴 | 鈴鐺聲，清脆可愛 |

因為 Catime 的目標觀眾橫跨中文和日文使用者，雙語命名讓角色在兩種文化中都有共鳴。而且 Gemini 對日文 prompt 的理解很好，給角色設定日文名稱有助於生成更符合角色風格的圖片。

---

## 技術實作

### 角色定義：JSON 檔案

每個角色的定義存在 `characters/` 目錄下：

```json
// characters/mochi.json
{
  "id": "mochi",
  "name_zh": "麻糬",
  "name_ja": "まるもち",
  "appearance": {
    "breed": "white with orange patches",
    "face": "round, chubby cheeks",
    "eyes": "warm amber",
    "body": "plump, short fur"
  },
  "personality": ["foodie", "warm", "sleepy", "gentle"],
  "typical_scenes": ["eating", "napping", "kitchen", "cozy room"],
  "color_palette": ["warm orange", "cream", "soft yellow"],
  "visual_style": "warm, cozy, homey atmosphere"
}
```

用 JSON 而不是寫死在程式碼裡，是因為未來可能會讓社群貢獻新角色 — 只要加一個 JSON 檔就好，不需要改程式。

### 機率系統

不是每張圖都要用固定角色。我設計了一個三層機率系統：

```python
import random

def select_generation_mode():
    """決定這次要生成什麼類型的圖"""
    roll = random.random()
    
    if roll < 0.50:
        # 50% — 原創貓咪（完全隨機）
        return {"mode": "original"}
    elif roll < 0.85:
        # 35% — 固定角色
        character = select_character()
        return {"mode": "character", "character": character}
    else:
        # 15% — 季節限定版
        character = select_character()
        season = get_current_season()
        return {"mode": "seasonal", "character": character, "season": season}
```

這個比例是反覆調整後的結果：

- **50% 原創**：保持新鮮感，不會讓人覺得每天都在看同一隻貓
- **35% 固定角色**：足夠的出場率讓觀眾產生連結感
- **15% 季節版**：偶爾的驚喜，像是聖誕節的船長或賞櫻的鈴鈴

### 24 小時冷卻機制

為了避免同一隻角色連續出現（「怎麼又是麻糬！」），我加了冷卻機制：

```python
import json
from datetime import datetime, timedelta

COOLDOWN_FILE = "data/character_cooldown.json"
COOLDOWN_HOURS = 24

def select_character():
    """選角色，有冷卻機制"""
    cooldowns = load_cooldowns()
    now = datetime.utcnow()
    
    available = []
    for char_id in ALL_CHARACTERS:
        last_used = cooldowns.get(char_id)
        if last_used is None or (now - datetime.fromisoformat(last_used)) > timedelta(hours=COOLDOWN_HOURS):
            available.append(char_id)
    
    if not available:
        # 全部都在冷卻中（不太可能，但防禦性處理）
        available = ALL_CHARACTERS
    
    chosen = random.choice(available)
    
    # 更新冷卻時間
    cooldowns[chosen] = now.isoformat()
    save_cooldowns(cooldowns)
    
    return chosen
```

四個角色、24 小時冷卻、每小時一張圖 — 數學上來說，同一隻角色最快也要隔好幾張圖才會再出現。

### Workflow 整合

GitHub Actions workflow 在生成圖片時，會讀取角色資料並注入到 Gemini 的 prompt 裡：

```yaml
# .github/workflows/generate.yml
- name: Generate cat image
  run: python generate.py
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

在 `generate.py` 裡：

```python
def build_prompt(mode_info):
    if mode_info["mode"] == "original":
        return "Generate a cute, artistic cat illustration. Be creative with the breed, pose, and setting."
    
    char = load_character(mode_info["character"])
    base_prompt = f"""Generate an illustration of a cat character:
Name: {char['name_zh']} ({char['name_ja']})
Appearance: {json.dumps(char['appearance'])}
Personality: {', '.join(char['personality'])}
Typical scene: {random.choice(char['typical_scenes'])}
Visual style: {char['visual_style']}
Color palette: {', '.join(char['color_palette'])}

Keep the character recognizable but vary the specific pose and details."""
    
    if mode_info["mode"] == "seasonal":
        season = mode_info["season"]
        base_prompt += f"\n\nSeasonal theme: {season}. Incorporate seasonal elements naturally."
    
    return base_prompt
```

關鍵是最後那句「Keep the character recognizable but vary the specific pose and details」— 既要讓角色可辨識，又不能每次都一模一樣。

---

## PR #13：角色系統合併

整個角色系統的實作在 [PR #13](https://github.com/yazelin/catime/pull/13) 中完成並 merge。包含：

- 4 個角色定義 JSON
- 機率選擇系統
- 冷卻機制
- Prompt 建構邏輯
- 更新後的 workflow

---

## 小結

回頭看，這個角色系統的技術含量其實不高 — 就是 JSON 定義 + 機率選擇 + 冷卻機制。但它解決的問題是「情感連結」，這不是純技術能衡量的東西。

當你看到一張圖然後想說「啊，今天是墨墨在看月亮」的時候，那種感覺跟看一張隨機貓圖是完全不同的。這就是為什麼我覺得，AI 生成內容最缺的不是技術，而是「角色」— 一個讓人願意持續關注的理由。

下一步想做的是讓角色之間有互動（例如麻糬和鈴鈴一起賞花），不過那又是另一個故事了 🐱
