---
layout: post
title: "Line Bot 整合（四）：群組管理與專案綁定"
subtitle: "讓 Line 群組與內部專案系統連動"
date: 2026-01-02
categories: [ChingTech OS]
tags: [Line Bot, FastAPI, 專案管理, Python, ChingTech OS]
---

![Line Bot 整合（四）：群組管理與專案綁定](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-02-linebot-part4-group-project.png)

## 前言

在前幾篇中，我們完成了 [Webhook 架構]({% post_url 2025-12-30-linebot-part1-webhook %})、[檔案處理]({% post_url 2025-12-31-linebot-part2-file-download %}) 和 [AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})。

這篇要實作一個實用的企業功能：**群組與專案綁定**。當 Line 群組綁定到內部專案後，可以：

- 群組訊息自動關聯到專案
- AI 助理知道當前對話的專案上下文
- 透過對話直接操作專案（新增成員、里程碑等）
- 知識庫內容自動歸屬到專案 scope

如果你還沒看過 [群組權限控制]({% post_url 2025-12-23-jaba-ai-part7-group-permission %})，建議先了解群組對話的基本權限設計。

---

## 設計概念

### 群組與專案的關係

```
┌─────────────────┐         ┌─────────────────┐
│   Line 群組     │         │   內部專案      │
│                 │   1:1   │                 │
│ line_groups     │────────▶│ projects        │
│ - project_id    │         │ - id            │
│ - allow_ai      │         │ - name          │
└─────────────────┘         └─────────────────┘
        │
        │ 1:N
        ▼
┌─────────────────┐
│   群組訊息      │
│ line_messages   │
│ - line_group_id │
└─────────────────┘
```

一個 Line 群組可以綁定到一個專案，綁定後：
- 訊息記錄保留 `line_group_id` 關聯
- AI 處理時可查詢專案資訊作為上下文
- 透過 MCP 工具操作專案無需指定 project_id

---

## 資料表設計

### line_groups 欄位

```sql
CREATE TABLE line_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_group_id VARCHAR(64) UNIQUE NOT NULL,  -- Line 群組 ID
    name VARCHAR(256),                          -- 群組名稱
    picture_url TEXT,                           -- 群組頭像
    member_count INTEGER DEFAULT 0,             -- 成員數量

    -- 專案綁定
    project_id UUID REFERENCES projects(id),    -- 綁定的專案

    -- 存取控制
    is_active BOOLEAN DEFAULT true,             -- Bot 是否在群組中
    allow_ai_response BOOLEAN DEFAULT false,    -- 是否允許 AI 回應

    -- 時間戳記
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**關鍵欄位說明：**

| 欄位 | 用途 |
|------|------|
| `project_id` | 綁定專案的 UUID，NULL 表示未綁定 |
| `allow_ai_response` | 控制 AI 是否回應群組訊息 |
| `is_active` | Bot 被踢出群組時設為 false |

---

## 存取控制邏輯

### 何時允許 AI 回應？

```python
async def check_line_access(
    line_user_uuid: UUID,
    line_group_uuid: UUID | None = None,
) -> tuple[bool, str | None]:
    """
    檢查 Line 用戶是否有權限使用 Bot

    規則：
    1. Line 用戶必須綁定 CTOS 帳號
    2. 如果是群組訊息，群組必須設為 allow_ai_response = true
    """
    async with get_connection() as conn:
        # 檢查用戶綁定
        user_row = await conn.fetchrow(
            "SELECT user_id FROM line_users WHERE id = $1",
            line_user_uuid,
        )
        if not user_row or not user_row["user_id"]:
            return False, "user_not_bound"

        # 如果是群組，檢查群組設定
        if line_group_uuid:
            group_row = await conn.fetchrow(
                "SELECT allow_ai_response FROM line_groups WHERE id = $1",
                line_group_uuid,
            )
            if not group_row or not group_row["allow_ai_response"]:
                return False, "group_not_allowed"

        return True, None
```

### 存取控制流程

```
用戶發送訊息
       │
       ▼
┌──────────────────┐
│ 用戶已綁定 CTOS？│
└────────┬─────────┘
         │
    NO ──┼── YES
    │    │
    ▼    ▼
┌──────┐ ┌────────────────────┐
│ 靜默 │ │ 是群組訊息？        │
│ 不回 │ └────────┬───────────┘
└──────┘          │
             NO ──┼── YES
             │    │
             ▼    ▼
      ┌──────┐ ┌─────────────────────┐
      │ 處理 │ │ allow_ai_response？  │
      │ AI   │ └────────┬────────────┘
      └──────┘          │
                   NO ──┼── YES
                   │    │
                   ▼    ▼
            ┌──────┐ ┌──────┐
            │ 靜默 │ │ 處理 │
            │ 不回 │ │ AI   │
            └──────┘ └──────┘
```

> **設計考量**：群組預設不開啟 AI 回應，避免 Bot 在不相關的群組中干擾對話。

---

## API 端點實作

### 群組列表

```python
@router.get("/groups", response_model=LineGroupListResponse)
async def api_list_groups(
    is_active: bool | None = None,
    project_id: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """列出 Line 群組"""
    items, total = await list_groups(
        is_active=is_active,
        project_id=project_id,
        limit=limit,
        offset=offset,
    )
    return LineGroupListResponse(
        items=[LineGroupResponse(**item) for item in items],
        total=total,
    )
```

### 綁定專案

```python
@router.post("/groups/{group_id}/bind-project")
async def api_bind_project(group_id: UUID, request: ProjectBindingRequest):
    """綁定群組到專案"""
    success = await bind_group_to_project(group_id, request.project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"status": "ok", "message": "專案綁定成功"}


async def bind_group_to_project(group_id: UUID, project_id: UUID) -> bool:
    """綁定群組到專案"""
    async with get_connection() as conn:
        result = await conn.execute(
            """
            UPDATE line_groups
            SET project_id = $2, updated_at = NOW()
            WHERE id = $1
            """,
            group_id,
            project_id,
        )
        return result == "UPDATE 1"
```

### 解除綁定

```python
@router.delete("/groups/{group_id}/bind-project")
async def api_unbind_project(group_id: UUID):
    """解除群組與專案的綁定"""
    success = await unbind_group_from_project(group_id)
    if not success:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"status": "ok", "message": "已解除專案綁定"}


async def unbind_group_from_project(group_id: UUID) -> bool:
    """解除群組與專案的綁定"""
    async with get_connection() as conn:
        result = await conn.execute(
            """
            UPDATE line_groups
            SET project_id = NULL, updated_at = NOW()
            WHERE id = $1
            """,
            group_id,
        )
        return result == "UPDATE 1"
```

### 更新群組設定

```python
@router.patch("/groups/{group_id}")
async def api_update_group(
    group_id: UUID,
    update: LineGroupUpdate,
    session: SessionData = Depends(get_current_session),
):
    """更新群組設定"""
    group = await get_group_by_id(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if update.allow_ai_response is not None:
        await update_group_settings(group_id, update.allow_ai_response)

    updated_group = await get_group_by_id(group_id)
    return LineGroupResponse(**updated_group)


async def update_group_settings(group_id: UUID, allow_ai_response: bool) -> bool:
    """更新群組設定"""
    async with get_connection() as conn:
        result = await conn.execute(
            """
            UPDATE line_groups
            SET allow_ai_response = $2, updated_at = NOW()
            WHERE id = $1
            """,
            group_id,
            allow_ai_response,
        )
        return result == "UPDATE 1"
```

---

## AI 上下文整合

當群組綁定專案後，AI 助理在處理訊息時會自動注入專案上下文：

```python
async def get_ai_context(line_group_uuid: UUID | None) -> dict:
    """取得 AI 處理的上下文資訊"""
    context = {}

    if line_group_uuid:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT g.name as group_name, p.id as project_id, p.name as project_name
                FROM line_groups g
                LEFT JOIN projects p ON g.project_id = p.id
                WHERE g.id = $1
                """,
                line_group_uuid,
            )
            if row:
                context["group_name"] = row["group_name"]
                if row["project_id"]:
                    context["project_id"] = str(row["project_id"])
                    context["project_name"] = row["project_name"]

    return context
```

AI 收到的 system prompt 會包含：

```
當前對話資訊：
- 群組名稱：水切爐改善專案群
- 綁定專案：P-2025-001 水切爐改善
- 專案 ID：550e8400-e29b-41d4-a716-446655440000

你可以直接使用 MCP 工具操作此專案，不需要再詢問專案名稱。
```

---

## 刪除群組

刪除群組時會級聯刪除相關訊息：

```python
@router.delete("/groups/{group_id}")
async def api_delete_group(group_id: UUID):
    """刪除群組及其相關資料"""
    result = await delete_group(group_id)
    if not result:
        raise HTTPException(status_code=404, detail="Group not found")
    return {
        "status": "ok",
        "message": f"已刪除群組「{result['group_name']}」及 {result['deleted_messages']} 則訊息",
    }
```

> **注意**：NAS 上的實體檔案不會被刪除，僅刪除資料庫記錄。

---

## 前端管理介面

桌面應用程式提供群組管理功能：

### 群組列表

| 群組名稱 | 成員 | 綁定專案 | AI 回應 | 操作 |
|----------|------|----------|---------|------|
| 水切爐改善群 | 5 | P-2025-001 | ✓ | 設定 |
| 測試群組 | 3 | - | ✗ | 設定 |

### 群組設定對話框

```
┌─────────────────────────────────────┐
│  群組設定                           │
├─────────────────────────────────────┤
│                                     │
│  群組名稱：水切爐改善群             │
│                                     │
│  ┌─ 專案綁定 ─────────────────────┐ │
│  │  [▼ 選擇專案        ]         │ │
│  │     P-2025-001 水切爐改善      │ │
│  │     P-2025-002 新廠規劃        │ │
│  │     ...                        │ │
│  └────────────────────────────────┘ │
│                                     │
│  [✓] 允許 AI 回應                   │
│                                     │
│  ┌────────┐  ┌────────┐            │
│  │  儲存  │  │  取消  │            │
│  └────────┘  └────────┘            │
└─────────────────────────────────────┘
```

---

## 使用情境

### 情境一：建立專案群組

1. 管理員在 Line 建立群組，邀請 Bot 加入
2. Bot 自動記錄群組資訊到 `line_groups`
3. 管理員在 CTOS 介面綁定群組到專案
4. 開啟 `allow_ai_response`

### 情境二：透過群組操作專案

```
用戶：幫我新增一個里程碑「試車」，預計下週五

AI：（檢測到綁定專案 P-2025-001）
AI：（使用 add_project_milestone 工具）
AI：已為專案「水切爐改善」新增里程碑：
    - 名稱：試車
    - 預計日期：2026-01-10
    - 狀態：pending
```

### 情境三：知識庫自動歸屬

```
用戶：把這段內容記到知識庫：「水切爐的標準溫度是 850°C」

AI：（檢測到綁定專案 P-2025-001）
AI：（使用 add_note 工具，scope 自動設為 project）
AI：已新增知識到專案「水切爐改善」的知識庫：
    - 標題：水切爐標準溫度
    - 內容：水切爐的標準溫度是 850°C
    - 範圍：專案知識（P-2025-001）
```

---

## 小結

本篇實作了群組管理與專案綁定：

- **資料設計**：`line_groups.project_id` 關聯專案
- **存取控制**：`allow_ai_response` 控制 AI 回應
- **API 端點**：綁定、解除、更新設定
- **AI 整合**：自動注入專案上下文

下一篇我們將實作 [透過 Line Bot 搜尋並發送 NAS 檔案]({% post_url 2026-01-03-linebot-part5-nas-search %})。

---

## 參考資源

- [Line Bot Webhook 架構]({% post_url 2025-12-30-linebot-part1-webhook %})
- [Line Bot 檔案處理]({% post_url 2025-12-31-linebot-part2-file-download %})
- [Line Bot AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})
- [Jaba AI 群組權限控制]({% post_url 2025-12-23-jaba-ai-part7-group-permission %})
