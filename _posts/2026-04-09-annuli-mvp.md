---
layout: post
title: "Annuli（歲月之環）：給 AI 一個會長年輪的記憶系統"
subtitle: "心材、邊材、年輪、形成層 — 用樹的生長層比喻 AI 的人格演化，MVP 一個檔案 222 行"
date: 2026-04-09
categories: [AI, forest-guild]
tags: [Annuli, AI Memory, Persona, Claude Code, Python, Tree Rings, Reflection Engine, Level-2, Mori]
author: Yaze Lin
---

![Annuli（歲月之環）：給 AI 一個會長年輪的記憶系統](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-09-annuli-mvp.png)

> **🔗 相關連結**
> - 💻 **GitHub**：private repo（這篇講的是設計與年輪概念，code 沒對外公開）
> - 🌳 **世界觀**：[森之召喚師工坊]({% post_url 2026-04-24-forest-summoner-workshop %}) Level 2 = 「讓精靈記得你」
> - 🌱 **Mori 桌面身體**：[yazelin.github.io/mori-desktop](https://yazelin.github.io/mori-desktop/)（Annuli 就是她的記憶後端）

---

## 問題：對話沒有年輪

一般 AI chatbot 的對話是 **flat log** — 一條一條訊息累積，存或不存隨便，反正下一次 session 又是新的開始。對「會跟使用者長期合作」的 AI 來說，這個架構不夠：

- **沒有累積** — 昨天告訴她的寫作風格偏好，今天又得重新講
- **沒有衝突解決** — 三個月前的偏好跟現在不同了，誰來 reconcile？舊紀錄要保留嗎？要怎麼標時間？
- **沒有人格演化** — 從第一天開始就是同一套 prompt，不會因為跟使用者相處而變化

Annuli 的設計目標是 **會長年輪的記憶**：每一段時間結束後，把當期累積的對話「壓縮成一圈」、留下精煉的「記得了什麼」、舊環不消失。

名字來自拉丁文 *annulus* 的複數（「環」之意）；中文「歲月之環」。MVP 是 2026-04-09 提交 commit `4875042`，**222 行 Python 一個檔案**，跑在 Claude Code CLI 之上。

## 樹木解剖學：四個概念對應四個檔案

設計直接照搬樹木的橫切面：

| 樹木構造 | Annuli 對應 | 角色 |
|---|---|---|
| **心材（Heartwood）** | `persona.json` | AI 的核心人格，隨互動緩慢演化 |
| **邊材（Sapwood）** | `memory_state.json` | AI 對使用者的當前認知（profile + relationship） |
| **年輪（Growth rings）** | `chat_history.log` | 對話流水帳，每次 `/sleep` 後內化並清空 |
| **形成層（Cambium）** | `app.py` | 驅動生長的程式——記錄、反思、寫回 |

關鍵在「**心材 vs 邊材**」的拆分：
- **心材**是 AI 自己「是誰」（個性、語氣、價值觀）——這個變動慢
- **邊材**是 AI 對「你」的認知（職業、偏好、相處關係）——這個比較動態

兩者用不同檔案、分開反思、各自演化。

## MVP 結構

```
Annuli/
├── app.py              [222 行] 主程式，含所有邏輯
├── persona.json        AI 人格狀態 (name / core_traits / evolution_stage)
├── memory_state.json   使用者檔案 (user_profile / relationship_status)
├── chat_history.log    (runtime 生成) 對話記錄
└── .gitignore
```

零外部依賴。Python 標準庫 + `claude -p` 子進程呼叫 Claude Code CLI（這樣不用 API key）。

## 流程：醒著 vs 睡眠

```
醒著（chat mode）
        │
        ▼
使用者輸入 ──→ build system_prompt(persona + memory)
                │
                ▼
            call_claude(input) ──→ AI 回覆
                │
                ▼
        append chat_history.log
                │
                ▼
        (繼續對話 or 進入 /sleep)


睡眠（reflect mode）/sleep
        │
        ▼
    讀 chat_history.log
        │
        ▼
    送給 LLM 反思 prompt:
      - persona + memory + 對話內容
      - 嚴格規則：禁止刪舊記憶、改寫須註記時間演進
        │
        ▼
    LLM 回傳新 persona + 新 memory_state
        │
        ▼
    寫回 persona.json + memory_state.json
        │
        ▼
    清空 chat_history.log
    evolution_stage++
```

## 反思 prompt — 整個系統的核心

`sleep_and_reflect()` 是 Annuli 真正在做事的地方。MVP 版本長這樣（`app.py:130-180`）：

```python
def sleep_and_reflect():
    print("\n💤 AI 進入深度睡眠反思模式... 正在壓縮並生長新的年輪...")

    persona = load_json(PERSONA_FILE)
    memory = load_json(MEMORY_FILE)
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            chat_history = f.read()
    except FileNotFoundError:
        chat_history = ""

    if not chat_history.strip():
        print("沒有新記憶需要反思。")
        return

    reflection_prompt = f"""你現在是 AI 的「潛意識處理中心」。
請閱讀這個 AI 原本的狀態以及最近的「對話流水帳」。
你的任務是更新 AI 對使用者的記憶 (memory_state)，
並根據經歷微調 AI 的性格 (persona)。

【原始人格】: {json.dumps(persona, ensure_ascii=False)}
【原始記憶】: {json.dumps(memory, ensure_ascii=False)}

【最近的對話紀錄】:
{chat_history}

【嚴格規則】
1. 解決記憶衝突：如果新對話與舊記憶矛盾，不可刪除舊記憶，
   必須寫出時間演進（例如：「過去喜歡...但現在改為...」）。
2. 人格演化：如果使用者對 AI 很好，AI 的性格應該變得更有溫度；
   如果聊了特定專業，AI 可以將該興趣寫入性格中。
3. 壓縮精煉：保持 JSON 內容精簡，萃取核心重點，丟棄無意義的閒聊細節。
4. 回傳格式：你必須嚴格只回傳一個 JSON 格式，
   包含 "persona" 和 "memory_state" 兩個主要 key...
```

兩個設計選擇要特別講：

**規則 1：禁止刪除舊記憶**。這是 Annuli 跟「平均一切」的記憶系統最大的差別。傳統 vector DB 或者 sliding window 都會「忘掉舊的」；Annuli 不會。三個月前你討厭跑步，現在開始喜歡了，反思的結果是「過去討厭跑步，2026-Q2 開始嘗試並逐漸喜歡」——時間演進寫進去，不是覆蓋。

**規則 2：人格也會變**。一般 chatbot 的 system prompt 是死的；Annuli 的 persona 是可寫的。如果你對她特別有耐心、特別熱情，她的 `core_traits` 真的會慢慢變得更溫暖。

## Chat mode 的 system prompt 組合

醒著的時候，每一輪對話都會重新組 prompt（`app.py:190-210`）：

```python
system_prompt = (
    f"你是 {persona['name']}。\n"
    f"你的核心性格：{persona['core_traits']}\n\n"
    f"【你目前對使用者的認知與記憶狀態】\n"
    f"使用者檔案：{memory['user_profile']}\n"
    f"與使用者的關係：{memory['relationship_status']}\n\n"
    f"請用繁體中文回覆。保持角色一致性，根據你的性格與記憶來回應。"
)

context = "\n".join(session_messages[-20:])  # 保留最近 20 輪
prompt = f"以下是目前的對話：\n{context}\n\n請回覆使用者最新的訊息。"
response = call_claude(prompt, system_prompt)
```

做法很直接：把 persona 和 memory 拼進 system，把最近 20 輪對話拼進 user prompt，送出去。

## 初始 persona

`persona.json` 一開始是空白的：

```json
{
  "name": "Annuli",
  "core_traits": "你是一個剛被喚醒的 AI 觀察者。你的語氣冷靜、簡潔，帶著一點對人類世界的好奇。你不懂人類的情感，但願意傾聽。對於第一位與你對話的人，你感到微微的好奇。",
  "evolution_stage": 1
}
```

每次 `/sleep` 之後，這個 JSON 會被改寫、`evolution_stage` 加一。理論上跑久了 persona 會跟初始狀態差異很大。

## 「歲月之環」這個名字

樹木年輪不只是時間記號——還會反映**當年的環境**。乾旱年的環薄、雨水充沛的年環厚。Annuli 試圖讓 AI 的記憶有類似性質：

- 平淡的對話 → 薄薄的環
- 重要的轉折 → 厚厚的環，留下深印記
- 不會因為「滿了」而抹掉舊環

中文「歲月之環」是日語「年輪（ねんりん）」漢字的取意。記憶累積有時間的厚度、是這個命名想傳達的概念。

## 跟 Mori 宇宙的關係

[2026-02-08]({% post_url 2026-02-09-ai-partner-dev-journal %}) Mori 被命名的時候，她的記憶分散在 OpenClaw workspace、Hermes、各個 Claude Code 對話片段裡。

Annuli 的定位是給她（以及未來其他精靈）的反思引擎，負責累積、壓縮、改寫 persona 與 memory。這個概念後來延伸成：
- `mori-journal`（[未來的文章]({% post_url 2026-04-23-mori-journal-home %})）— Mori 的私人 vault
- `world-tree`（[森之召喚師工坊]({% post_url 2026-04-24-forest-summoner-workshop %})）— 所有精靈共享的世界觀
- mori-desktop — Mori 的桌面身體，會讀寫 Annuli 的記憶

底層的假設都是同一個：**AI 應該有可累積、可反思、有時間厚度的記憶**。Annuli MVP 是把這個假設變成程式碼的第一步。

## MVP 的已知限制

以下幾項在 MVP 階段就清楚會撐不久，後續 Wave 2 / Wave 3 會處理：

- ❌ **單一全域 persona**：所有人共用一個 `persona.json`，不能多使用者
- ❌ **`/sleep` 是 destructive 操作**：LLM 全部重寫 persona，drift 風險很高
- ❌ **沒有 keyword 搜尋**：每次都拼整段 memory 進 prompt，遲早爆 context
- ❌ **沒有意圖分類**：每句話都當「需要 recall 記憶」處理，慢
- ❌ **沒有 multi-user / multi-spirit 設計**

MVP 的價值在「最小可行的概念驗證」——222 行 + 4 個 JSON 檔，足以驗證「LLM-driven persona evolution + persistent memory」這個想法跑得起來。

## 幾個設計觀察

- **AI 記憶不該是 flat log**——至少要有「心材 / 邊材 / 年輪」三層分離。
- **反思 prompt 的規則比演算法重要**——禁止刪舊記憶、必須寫時間演進，這兩條讓記憶變得可信。
- **零依賴 + Claude Code CLI** 跑得起來——不需要 API key、不需要額外付費，靠訂閱即可。
- **樹木解剖學是個易於溝通的設計隱喻**——比抽象的 memory tier 概念具體，命名也容易跟著走。

---

**後續發展**：MVP 跑了一個月後，因為加進學習、發文、FB sync、知識搜尋等功能，`engine.py` 膨脹到 2489 行；一個月後做 [Wave 2 重構]({% post_url 2026-05-13-annuli-wave-2-refactor %})，把它拆成 core / creator 兩個模組。
