---
layout: post
title: "ChingTech OS：SkillHub 雙來源整合 — 從 Feature Flag 到並行搜尋"
subtitle: "在內部 SkillHub 與公開 ClawHub 之間，如何安全且漸進地整合雙來源搜尋"
date: 2026-02-10
categories: [ChingTech OS]
tags: [ChingTech OS, SkillHub, ClawHub, FastAPI, asyncio, Python]
---

## 前言

ChingTech OS 的 SkillHub 一開始只對接內部的技能庫 — 公司內部自行維護的 Skill 清單。但隨著 OpenClaw 生態系成長，公開的 ClawHub 上出現了大量社群貢獻的 Skill。使用者開始反映：「為什麼我在 ClawHub 上看到的 Skill，在 CTOS 搜不到？」

需求很明確：讓 SkillHub 同時搜尋內部來源和 ClawHub，並且在前端讓使用者區分結果來源。但這牽涉到 API 設計、錯誤處理、前端整合等多個面向。這篇文章記錄我們如何分兩個階段完成這件事。

---

## 問題分析

原本的架構很單純 — `skillhub_client.py` 只對接一個後端：

```python
# 舊架構（示意）
class SkillHubClient:
    def __init__(self, base_url: str):
        self.base_url = base_url  # 只有一個來源

    async def search(self, query: str) -> list[SkillInfo]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.base_url}/search", params={"q": query})
            return [SkillInfo(**item) for item in resp.json()]
```

直接加第二個來源會遇到幾個問題：

| 問題 | 影響 |
|------|------|
| ClawHub API 格式不同 | 欄位名稱、分頁方式不一致 |
| 網路延遲不可控 | ClawHub 偶爾回應慢，拖累整體搜尋 |
| 結果重複 | 同一個 Skill 可能同時存在於兩個來源 |
| 上線風險 | 一次全開，出問題影響所有使用者 |

---

## 解決方案

### Phase 1：Feature Flag 切換（either/or）

第一階段我們用 `HubSource` Literal 讓使用者選擇來源，而非同時查詢：

```python
# api/skills.py

from typing import Literal

HubSource = Literal["skillhub", "clawhub"]

@router.get("/hub/sources")
async def list_sources():
    """回傳目前可用的來源清單"""
    return {"sources": ["skillhub", "clawhub"]}

@router.get("/hub/search")
async def search_skills(
    q: str,
    source: HubSource = "skillhub",
):
    client = _get_clients(source)
    return await _search_one(client, q)
```

`Literal` 型別讓 FastAPI 自動驗證參數 — 傳入 `source=foobar` 會直接回 422，不需要手動檢查。

### Phase 2：雙來源並行搜尋

確認單來源穩定後，我們加入 `source=all` 的並行模式：

```python
# api/skills.py

HubSource = Literal["skillhub", "clawhub", "all"]

def _get_clients(source: HubSource) -> list[SkillHubClient]:
    """根據 source 參數回傳對應的 client 列表"""
    clients = {
        "skillhub": [skillhub_client],
        "clawhub": [clawhub_client],
        "all": [skillhub_client, clawhub_client],
    }
    return clients[source]

async def _search_one(client: SkillHubClient, query: str) -> list[dict]:
    """單一來源搜尋，失敗時回傳空列表（graceful degradation）"""
    try:
        results = await client.search(query)
        return [{"source": client.source_name, **r.dict()} for r in results]
    except Exception as e:
        logger.warning("Search failed for %s: %s", client.source_name, e)
        return []

@router.get("/hub/search")
async def search_skills(q: str, source: HubSource = "all"):
    clients = _get_clients(source)
    # 並行搜尋所有來源
    tasks = [_search_one(c, q) for c in clients]
    results_list = await asyncio.gather(*tasks)
    # 合併並去重
    merged = _merge_and_dedupe(itertools.chain.from_iterable(results_list))
    return {"results": merged, "sources_queried": [c.source_name for c in clients]}
```

關鍵在 `asyncio.gather` — 兩個 HTTP 請求同時發出，總延遲取決於最慢的那個，而不是兩者相加。

### 共用邏輯抽取：hub_meta.py

兩個來源的 Skill 都需要寫入和讀取 metadata（安裝狀態、評分、備註）。我們把這些邏輯抽到 `hub_meta.py`：

```python
# services/hub_meta.py

async def write_meta(skill_id: str, source: str, meta: dict) -> None:
    """寫入 Skill metadata，以 (skill_id, source) 為唯一鍵"""
    async with get_connection() as conn:
        await conn.execute("""
            INSERT INTO skill_meta (skill_id, source, meta, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (skill_id, source)
            DO UPDATE SET meta = $3, updated_at = NOW()
        """, skill_id, source, json.dumps(meta))

async def read_meta(skill_id: str, source: str) -> dict | None:
    """讀取 Skill metadata"""
    async with get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT meta FROM skill_meta WHERE skill_id = $1 AND source = $2",
            skill_id, source,
        )
    return json.loads(row["meta"]) if row else None
```

`ON CONFLICT ... DO UPDATE` 確保重複寫入不會報錯，而是更新既有資料。

---

## 程式碼片段：前端整合

前端用一個 source filter 和 badge 來區分結果來源：

```javascript
// 搜尋時帶上 source 參數
async function searchSkills(query, source = 'all') {
  const resp = await fetch(`/api/hub/search?q=${encodeURIComponent(query)}&source=${source}`);
  const data = await resp.json();
  renderResults(data.results);
}

function renderBadge(source) {
  const colors = { skillhub: '#4CAF50', clawhub: '#2196F3' };
  return `<span class="badge" style="background:${colors[source]}">${source}</span>`;
}
```

---

## Graceful Degradation

`_search_one` 的 try/except 是刻意設計：當 ClawHub API 暫時不可用時，使用者仍然能搜到內部 SkillHub 的結果，而不是整個搜尋功能壞掉。

Gemini Code Assist 在 review 時抓到一個問題：原本 `_search_one` 的 except 太寬泛，把 `KeyboardInterrupt` 和 `SystemExit` 也吃掉了。修正為只捕捉 `Exception`，而非 bare `except`。

另一個被指出的問題是 `_merge_and_dedupe` 的去重邏輯沒有處理大小寫不一致的 `skill_id`，導致同一個 Skill 可能出現兩次。

---

## 學到什麼

1. **漸進式上線比一次到位安全** — Phase 1 的 Feature Flag 讓我們在真實流量下驗證 ClawHub client 的穩定性，再開放並行搜尋
2. **`asyncio.gather` 是並行 I/O 的利器** — 但要注意單一失敗不應拖垮整體，搭配 `return_exceptions=True` 或獨立 try/except
3. **`Literal` 型別做參數驗證** — 比手寫 `if source not in [...]` 更簡潔，且自動生成 OpenAPI 文件
4. **共用邏輯趁早抽取** — `hub_meta.py` 在兩個來源都需要 metadata 時就該建立，避免日後重複程式碼
5. **AI Review 能抓到人眼漏掉的細節** — bare except 和去重大小寫問題，都是 Gemini Code Assist 先發現的

---

## 參考資源

- [模組化重構]({% post_url 2026-02-06-ctos-modular-refactor %})（架構基礎）
- [Session 與 Thread Pool 優化]({% post_url 2026-02-07-ctos-session-threadpool %})（前一篇）
- [Python `asyncio.gather`](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather)
- [FastAPI Query Parameters and String Validations](https://fastapi.tiangolo.com/tutorial/query-params-str-validations/)
