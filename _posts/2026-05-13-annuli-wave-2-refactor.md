---
layout: post
title: "Annuli Wave 2：把 2489 行 engine.py 拆成 core / creator 兩個身體"
subtitle: "17 步機械式重構、不改一行邏輯、靈魂與創作分開呼吸 — 從『AI 每次脫皮重生』到『AI 只 append 一頁日記』"
date: 2026-05-13
categories: [AI, forest-guild]
tags: [Annuli, Refactor, Architecture, Python, Module Design, Modular Monolith, Memory, Reflection, Flask, forest-guild]
author: Yaze Lin
---

![Annuli Wave 2：把 2489 行 engine.py 拆成 core / creator 兩個身體](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-05-13-annuli-wave-2-refactor.png)

> **🔗 相關連結**
> - 💻 **GitHub**：[yazelin/annuli](https://github.com/yazelin/annuli)
> - 📦 **PR**：[#... wave-2 refactor (squash merge 0e6cec1)](https://github.com/yazelin/annuli/commit/0e6cec1)
> - 📔 **前篇**：[Annuli 誕生（MVP）]({% post_url 2026-04-09-annuli-mvp %})

---

## 一個月後：MVP 撐不住了

[2026-04-09 我寫了 Annuli MVP]({% post_url 2026-04-09-annuli-mvp %})——222 行 `app.py`，樹輪隱喻、`/sleep` 反思、單一全域 persona。當時就知道有些地方撐不了多久：單一使用者、沒有意圖分類、沒有 keyword 搜尋、`/sleep` 是 destructive 操作。

接下來一個月我一直加功能：
- 4 輪深度研究（`/learn`）
- KOL 風格分析（`/study`）
- 自主選題與內容草稿（`/explore`、`/post`）
- 圖片生成（nano-banana API）
- Facebook 發佈與互動同步
- APScheduler 排程
- 知識庫管理
- Flask admin web UI

到 2026-05 中，`engine.py` 從 222 行膨脹到 **2489 行**。`admin.py` 也跟著漲到 1468 行。`adapters/cli.py` 391 行。

打開檔案找一個 function 都要捲三次。改一個 bug 怕踩到別的 feature。**這已經不是 monolithic 的問題，是 monolithic mud ball 的問題。**

2026-05-13 我決定做 Wave 2 重構。

## 問題：兩種完全不同的工作纏在一起

仔細看 engine.py，其實是**兩個責任不同的系統**被硬塞在同一個檔案：

| **記憶 / 反思**（核心） | **內容生產 / 社群**（副業） |
|---|---|
| persona / memory / rings | drafts、貼文排程、FB sync |
| `/sleep` 反思 | `/learn` `/study` `/post` 命令 |
| chat_history 儲存 | 圖像生成 API |
| 對話 intent 分類 | explore pool 管理 |
| - | knowledge 庫 |

**為什麼這是問題：**

1. **Release cycle 完全不同**
   - 記憶設計是「年穩」——一旦定了我希望它穩定數個月
   - FB API 是「季變」——Meta 改規格時我得馬上跟
   - 但現在它們綁在同一個 daemon，FB 改 API 我得整個 daemon 重啟，連對話記憶都斷
2. **User 需求被綁架**
   - 有人想要 Annuli 只當記憶系統、不要 FB 發文功能
   - 但目前架構沒辦法選擇性安裝
3. **2489 行單檔無法維護** — IDE 都跑得慢

## 設計目標

Wave 2 的目標是 **modular monolith**：
- 拆成兩個邏輯模組 `annuli.core` 跟 `annuli.creator`
- 兩個各自一個 Flask server（port 5000 / 5001）
- 依賴方向：`creator → core`（creator 讀 core 的記憶，但 core 不需要 creator）
- **不改一行業務邏輯**——這是純粹的「搬位置」
- 舊程式碼透過 `engine.py` shim re-export，**任何 import engine 的 callsite 不破**

「不改邏輯」這條很重要——這次重構唯一的成功標準是「拆完整體還能跑」，不要混進新功能。

## 17 步機械式搬遷

整個重構是 **17 個獨立 commit**，每一步只做一件事。

| Step | 目標模組 | 來源 | 內容 |
|---|---|---|---|
| 1 | `core/config.py` | engine.py:18-85 | 路徑常數 + config 加載 |
| 2 | `core/utils.py` | engine.py 散落各處 | 純工具（JSON I/O、keyword 抽取） |
| 3 | `core/llm_backend.py` | engine.py LLM 呼叫 | `call_ai` / `call_fast_ai`（spinner + multi-backend） |
| 4 | `core/memory.py` | engine.py UserContext + I/O | persona / memory / recall |
| 5 | `core/chat.py` | engine.py 對話 pipeline | intent 分類、smart recall、build_system_prompt、process_message |
| 6 | `core/rings.py` | engine.py 反思層 | archive_ring、do_reflect、get_rings_list、reset |
| 7 | `creator/learn.py` | engine.py 4 輪研究 + 影片字幕 | _extract_urls / _extract_video_transcripts / _chunk_text / do_learn |
| 8 | `creator/{explore,study}.py` | engine.py KOL 研究 | do_explore、do_study、refine_writing_style |
| 9 | `creator/{post,images}.py` | engine.py post + 圖 | generate_post、list_drafts、generate_draft_images |
| 10 | `creator/{facebook,sync_engagement}.py` | engine.py FB | publish_to_fb、fetch_fb_comments、sync_post_engagement |
| 11 | `creator/knowledge.py` | engine.py 知識管理 | load_explore_pool、search_knowledge、list_knowledge |
| 12 | `creator/scheduler.py` | admin.py:14-238 APScheduler | 5 個 cron task |
| 13 | `{core,creator}/server.py` | admin.py 35 個 Flask routes | 11 + 22 routes |
| 14 | `core/adapters/cli.py` | adapters/cli.py | 10 個 core 命令 |
| 15 | `main.py` 重寫 | dispatcher | chat / admin / creator-admin 子命令 |
| 16 | `engine.py` 變 shim | 71 行 re-export | 40 個 symbol re-export |
| 17 | 刪舊檔 | 收尾 | admin.py / adapters/cli.py / 殘留 |

每一步：
1. **搬位置不改邏輯** — 函式內容 1:1 複製
2. **每個新檔案開頭寫來源** — 標註 pre-Wave-2 行號、依賴、Wave 2 vs Wave 3 變動
3. **每步驗證 engine.X re-export 仍然有效** — 舊 callsite 不破

## 新架構

```
src/annuli/
├── __init__.py                    (v0.2.0)
├── core/                          ← 記憶 + 反思（主體）
│   ├── config.py                  路徑/常數
│   ├── utils.py                   純工具
│   ├── llm_backend.py             LLM 呼叫 + spinner
│   ├── memory.py                  @dataclass UserContext / I/O
│   ├── chat.py                    intent 分類 / smart recall / 對話主迴
│   ├── rings.py                   年輪歸檔 / do_reflect / 重置
│   ├── events.py                  [Wave 3 stub]
│   ├── digest.py                  [Wave 3 stub]
│   ├── curator.py                 [Wave 3 stub]
│   ├── scheduler.py               core 排程
│   ├── server.py                  11 個 Flask routes（persona / users / rings / config）
│   ├── adapters/cli.py            CLI 入口（10 個命令）
│   └── bootstrap.py               初始化
│
├── creator/                       ← 內容生產（副業）
│   ├── learn.py                   4 輪研究 + yt-dlp + Whisper 字幕
│   ├── explore.py                 自主選題 + editorial direction
│   ├── study.py                   KOL 分析 + 風格蒸餾
│   ├── post.py                    draft 生成 / CRUD
│   ├── images.py                  nano-banana API + 圖片 CRUD
│   ├── facebook.py                FB Graph v22.0 + publish / comment
│   ├── sync_engagement.py         FB 按讚 / 留言同步
│   ├── knowledge.py               explore_pool I/O + 關鍵詞搜尋
│   ├── scheduler.py               5 個 cron（探索 / 學習 / 研究 / 發文 / 同步）
│   └── server.py                  22 個 Flask routes（drafts / knowledge / schedule）
│
└── engine.py                      ← 71 行 shim，re-export 40 個 symbol

main.py                            ← dispatcher
admin.py                           ← [廢棄]
adapters/cli.py                    ← [廢棄]
```

兩個 server 跑在不同 port：
- `python main.py admin --port 5000` → core server (記憶 / persona / rings)
- `python main.py creator-admin --port 5001` → creator server (drafts / FB / 知識庫)

**依賴方向**：
```
creator → core    (creator 讀 core 的記憶，做為內容素材)
core ⊥ creator    (core 不知道 creator 存在)
```

理論上以後可以把 creator/ 完全拆出去變獨立 repo `annuli-creator`，core 不用動。

## 同一段程式碼，拆前拆後

舉個例子。`recall_relevant_memories` 這個函式 Wave 2 前後一字未改：

**拆前**（`engine.py:125-146`）：

```python
def recall_relevant_memories(user_ctx, query):
    """依關鍵詞從 events / imprints / shared_experiences 抽相關記憶"""
    keywords = _extract_keywords(query)
    memories = []
    for key in keywords:
        try:
            with open(user_ctx.memory_file, 'r', encoding='utf-8') as f:
                mem = json.load(f)
                if key in mem.get('events', []):
                    memories.append(mem['events'][key])
        except (FileNotFoundError, json.JSONDecodeError):
            pass
    return memories[:5]
```

**拆後**（`src/annuli/core/memory.py:75-96`）：

```python
def recall_relevant_memories(user_ctx, query):
    """依關鍵詞從 events / imprints / shared_experiences 抽相關記憶"""
    keywords = _extract_keywords(query)
    memories = []
    for key in keywords:
        try:
            with open(user_ctx.memory_file, 'r', encoding='utf-8') as f:
                mem = json.load(f)
                if key in mem.get('events', []):
                    memories.append(mem['events'][key])
        except (FileNotFoundError, json.JSONDecodeError):
            pass
    return memories[:5]
```

完全一樣。

「Wave 2 機械式重構，不改邏輯」就是這個意思。

## 每個新檔案開頭都標註來源

這是讓 Wave 2 變得「人類可審 + 之後可改」的關鍵。例如 `src/annuli/creator/learn.py` 的檔頭：

```python
"""annuli.creator.learn — 深度研究（4 輪）+ 影片字幕擷取

來源 engine.py（pre-Wave-2 行號）:
- _extract_urls (78-80)
- _is_video_url (83-92)
- _extract_video_transcripts (95-123)
- _chunk_text (126-145)
- _condense_transcript (148-185)
- do_learn (265-507)  ← 主函式

依賴：annuli.core.config / utils / llm_backend / memory
      + annuli.creator.knowledge (Step 11 後)

Wave 2 stopgap：do_learn 需要的 list_knowledge / search_knowledge
還在 engine.py（Step 11 才搬到 creator/knowledge），這裡用 lazy import 從 engine 拿。

Wave 2 機械式搬位置，不改邏輯。
"""
```

每個檔案開頭都這樣：
- **來源** — pre-Wave-2 哪幾行
- **依賴** — 靠了哪些其他模組
- **Wave 2 vs Wave 3** — 哪些是 stopgap、哪些是最終形態

兩個月後我自己回來看這個 repo，這些檔頭比任何 commit message 都有用。

## engine.py 變 71 行 shim

最後一個關鍵 commit：**engine.py 不刪掉，改成 re-export shim**。

```python
# engine.py (Wave 2 後，71 行)
"""engine.py — Wave 2 shim

This file used to contain everything. Now it only re-exports symbols
from src/annuli/{core,creator}/ so existing call sites don't break.

All new code should import from src/annuli/ directly:
    from annuli.core.memory import resolve_user
    from annuli.creator.learn import do_learn
"""

from annuli.core.config import (
    USERS_DIR, MEMORIES_DIR, RINGS_DIR, ...
)
from annuli.core.memory import (
    UserContext, load_persona, save_persona, resolve_user,
    append_log, recall_relevant_memories, ...
)
from annuli.core.chat import (
    classify_intent, smart_recall, build_system_prompt, process_message,
)
from annuli.core.rings import (
    archive_ring, do_reflect, get_rings_list, ...
)
from annuli.creator.learn import do_learn
from annuli.creator.post import generate_post
from annuli.creator.facebook import publish_to_fb
# ... 40 個 symbol 總共

__all__ = [
    "UserContext", "load_persona", ...
]
```

舊程式碼 `from engine import do_learn` **完全不用改**。

但新程式碼鼓勵直接 import 子模組：

```python
# ❌ 舊（透過 shim，會 work 但不推薦）
from engine import do_learn

# ✅ 新（明確路徑）
from annuli.creator.learn import do_learn
```

Shim 是 deprecation 而非 hard break。給自己一年時間慢慢把所有 callsite 改完。

## 哲學轉變

Wave 2 不只是檔案搬位置，**也是思維轉變**。

**Pre-Wave-2 思維**：
> 「Annuli 是一個黑盒子，做所有事情。記憶、學習、發文、爬蟲、發 FB 都在 engine.py 裡。」

→ 結果是 monolithic mud ball，責任不清，加 feature 越加越痛。

**Post-Wave-2 思維**：
> 「Annuli core 是反思引擎；creator 是創作工坊。vault 是 spirit 的家。三者互相獨立但可以協作。」

→ 結果是 modular monolith，每塊責任清楚，可以單獨升級、單獨部署、單獨開源。

更深一層的轉變在反思層：

| | MVP | Wave 2 | Wave 3 計畫 |
|---|---|---|---|
| `/sleep` 行為 | LLM 全部重寫 persona | 同（保留舊行為） | 改為 append-only ring |
| persona 歸誰 | LLM 自己改 | 同 | 由召喚師審查後寫入 |
| 衝突解決 | 必須寫時間演進 | 同 | 同 |

**MVP 的問題**：每次 `/sleep` 都是「AI 整個脫皮重生」——LLM 把 persona 改寫一遍。長時間下來 persona 會 drift，跟最初的人格越來越不同。

**Wave 3 的方向**：`/sleep` 改成「AI 寫一頁日記、由召喚師決定要不要更新 persona」。AI 只 append ring，不改寫 soul。這個轉變要 Wave 3 才會落地，但 Wave 2 的模組化讓它變得可能——`core/rings.py` 跟 `core/memory.py` 拆開之後，要改反思行為只動 `rings.py`，不影響其他層。

## 跟 Mori 宇宙的關連

Wave 2 重構不是孤立的工程——它對齊一系列正在進行的設計：

- **world-tree** 定義了 `spirit-template/` 檔案結構 → Annuli core 的路徑設計向它看齊
- **mori-desktop** [Phase 1 也在同期]({% post_url 2026-05-06-mori-desktop-phase1 %}) v0.0 → v0.2 → v0.x，這邊也跟著 v0.1 → v0.2 bump
- **mori-journal**（private repo）= Mori 的 SOUL 真正存在的地方 → Annuli 之後會讀寫她的 vault

Annuli 不是第三方工具。**Annuli 是 Mori 大腦的後半部**——身體（mori-desktop）負責感知與動作，Annuli 負責反思與記憶。

Wave 2 是把這個分工做出來的第一步。

## Takeaways

1. **2000+ 行單檔等於設計失敗** — 不管當初理由多正當，這個信號很硬
2. **拆檔不改邏輯**比「拆檔順便重寫」安全十倍 — Wave 2 的成功標準就是「拆完整體還能跑」
3. **17 個獨立 commit** 比 1 個大 commit 好十倍 — 每步可 revert、可 review、可暫停
4. **shim re-export 是 deprecation 的正確姿勢** — 不破舊程式碼，但鼓勵新程式碼用新路徑
5. **檔頭標註來源（pre-refactor 行號）**對未來的自己最有用 — 比 commit message 持久
6. **modular monolith** 是個人專案最好的起點 — 比 microservice 簡單，比 monolith 可維護

---

接下來幾週，Annuli 會跟 [mori-desktop Phase 3]({% post_url 2026-05-18-mori-desktop-hey-mori %}) 整合，讓 Mori 桌面身體真正會用反思引擎。Wave 3 的 ring-based reflection 也會慢慢落地。

但今天，我把 monolithic mud ball 變成了 modular monolith。

森林精靈的記憶器官，終於有清楚的解剖學了。

> 「年年新輪，舊輪不消失——但每一輪終究要長在自己的器官裡。」
