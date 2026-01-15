---
layout: post
title: "MCP 工具權限控制設計"
subtitle: "確保只有專案成員才能操作敏感資料"
date: 2026-01-07
categories: [ChingTech OS]
tags: [MCP, FastMCP, 權限控制, Python, ChingTech OS]
---

## 前言

在前兩篇 [專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %}) 和 [知識庫工具]({% post_url 2026-01-06-fastmcp-knowledge-tools %}) 中，我們實作了各種 MCP 工具。但有些操作不應該讓所有人都能執行，例如：

- 更新專案資訊
- 修改里程碑狀態
- 新增會議記錄

這篇來介紹如何在 MCP 工具中實作**權限控制**，確保只有專案成員才能操作敏感資料。

---

## 權限控制需求

### 哪些工具需要權限控制？

| 工具 | 需要權限 | 原因 |
|------|----------|------|
| `query_project` | ❌ | 查詢是公開的 |
| `create_project` | ❌ | 任何人都可以建立專案 |
| `update_project` | ✅ | 只有成員才能修改 |
| `add_project_member` | ❌ | 新增成員是開放的 |
| `update_project_member` | ✅ | 只有成員才能修改 |
| `add_project_milestone` | ❌ | 任何人都可以新增 |
| `update_milestone` | ✅ | 只有成員才能修改 |
| `add_project_meeting` | ✅ | 會議記錄較敏感 |
| `update_project_meeting` | ✅ | 只有成員才能修改 |

### 權限判斷基準

```
用戶要操作專案
       │
       ▼
┌──────────────────┐
│ 用戶是否綁定      │
│ CTOS 帳號？      │
└────────┬─────────┘
         │
    NO ──┼── YES
    │    │
    ▼    ▼
┌──────┐ ┌────────────────────┐
│ 拒絕 │ │ 用戶是否為          │
│ 操作 │ │ 專案成員？          │
└──────┘ └────────┬───────────┘
                  │
             NO ──┼── YES
             │    │
             ▼    ▼
      ┌──────┐ ┌──────┐
      │ 拒絕 │ │ 允許 │
      │ 操作 │ │ 操作 │
      └──────┘ └──────┘
```

---

## 實作架構

### 用戶關聯鏈

```
Line 用戶                    CTOS 用戶                專案成員
┌─────────────┐             ┌─────────────┐          ┌─────────────┐
│ line_users  │             │ users       │          │ project_    │
│             │   user_id   │             │  user_id │ members     │
│ id          │────────────▶│ id          │◀─────────│             │
│ line_user_id│             │ username    │          │ project_id  │
│ user_id ────┼─────────────│             │          │ name        │
└─────────────┘             └─────────────┘          │ user_id ────┼──┐
                                                     └─────────────┘  │
                                                                      │
                                                     ┌────────────────┘
                                                     │
                                                     ▼
                                               用戶是專案成員
```

### 核心檢查函數

```python
async def check_project_member_permission(project_id: str, user_id: int) -> bool:
    """
    檢查用戶是否為專案成員

    Args:
        project_id: 專案 UUID 字串
        user_id: CTOS 用戶 ID

    Returns:
        True 表示用戶是專案成員，可以操作
    """
    from uuid import UUID as UUID_type

    await ensure_db_connection()
    async with get_connection() as conn:
        exists = await conn.fetchval(
            """
            SELECT 1 FROM project_members
            WHERE project_id = $1 AND user_id = $2
            """,
            UUID_type(project_id),
            user_id,
        )
        return exists is not None
```

---

## 工具實作範例

### update_project

```python
@mcp.tool()
async def update_project(
    project_id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    ctos_user_id: int | None = None,  # 權限檢查用
) -> str:
    """
    更新專案資訊

    Args:
        project_id: 專案 UUID
        name: 專案名稱
        description: 專案描述
        status: 狀態（active, completed, on_hold, cancelled）
        start_date: 開始日期
        end_date: 結束日期
        ctos_user_id: CTOS 用戶 ID（用於權限檢查）
    """
    await ensure_db_connection()

    # 權限檢查 1：需要有 CTOS 帳號
    if ctos_user_id is None:
        return "❌ 您的 Line 帳號尚未關聯 CTOS 用戶，無法進行此操作。請聯繫管理員進行帳號關聯。"

    # 權限檢查 2：需要是專案成員
    if not await check_project_member_permission(project_id, ctos_user_id):
        return "❌ 您不是此專案的成員，無法進行此操作。"

    # 通過權限檢查，執行更新
    try:
        data = ProjectUpdate(
            name=name,
            description=description,
            status=status,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        result = await svc_update_project(UUID(project_id), data)
        return f"✅ 已更新專案「{result.name}」"

    except ProjectNotFoundError:
        return f"找不到專案 ID: {project_id}"
```

### update_milestone（跨表查詢）

里程碑的權限檢查需要先查詢它屬於哪個專案：

```python
@mcp.tool()
async def update_milestone(
    milestone_id: str,
    project_id: str | None = None,
    name: str | None = None,
    status: str | None = None,
    planned_date: str | None = None,
    ctos_user_id: int | None = None,
) -> str:
    """更新里程碑"""
    await ensure_db_connection()

    # 權限檢查前置
    if ctos_user_id is None:
        return "❌ 您的 Line 帳號尚未關聯 CTOS 用戶..."

    try:
        # 先查詢里程碑所屬專案
        async with get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT project_id FROM project_milestones WHERE id = $1",
                UUID(milestone_id),
            )
            if not row:
                return f"找不到里程碑 ID: {milestone_id}"
            actual_project_id = row["project_id"]

        # 權限檢查：需要是該專案成員
        if not await check_project_member_permission(str(actual_project_id), ctos_user_id):
            return "❌ 您不是此專案的成員，無法進行此操作。"

        # 如果有提供 project_id，驗證是否匹配
        if project_id and UUID(project_id) != actual_project_id:
            return f"里程碑不屬於專案 {project_id}"

        # 執行更新...
```

### add_project_meeting

新增會議記錄也需要權限：

```python
@mcp.tool()
async def add_project_meeting(
    project_id: str,
    title: str,
    meeting_date: str | None = None,
    location: str | None = None,
    attendees: str | None = None,
    content: str | None = None,
    ctos_user_id: int | None = None,
) -> str:
    """新增專案會議記錄"""
    await ensure_db_connection()

    # 權限檢查
    if ctos_user_id is None:
        return "❌ 您的 Line 帳號尚未關聯 CTOS 用戶..."

    if not await check_project_member_permission(project_id, ctos_user_id):
        return "❌ 您不是此專案的成員，無法進行此操作。"

    # 通過檢查，新增會議...
```

---

## 自動綁定機制

當用戶透過對話新增自己為專案成員時，可以自動完成綁定：

```python
@mcp.tool()
async def add_project_member(
    project_id: str,
    name: str,
    role: str | None = None,
    is_internal: bool = True,
    ctos_user_id: int | None = None,
) -> str:
    """新增專案成員"""

    # 準備 user_id：內部人員且有 ctos_user_id 時自動綁定
    user_id = ctos_user_id if is_internal and ctos_user_id else None

    # 檢查是否已有同名成員
    async with get_connection() as conn:
        existing = await conn.fetchrow(
            """
            SELECT id, user_id FROM project_members
            WHERE project_id = $1 AND name = $2
            """,
            UUID(project_id),
            name,
        )

    if existing:
        if existing["user_id"]:
            return f"ℹ️ 專案中已有成員「{name}」（已綁定帳號）"
        elif user_id:
            # 未綁定但有 ctos_user_id → 自動綁定
            async with get_connection() as conn:
                await conn.execute(
                    "UPDATE project_members SET user_id = $1 WHERE id = $2",
                    user_id,
                    existing["id"],
                )
            return f"✅ 已將「{name}」綁定到您的帳號"

    # 新增成員...
```

---

## 錯誤訊息設計

### 未綁定帳號

```
❌ 您的 Line 帳號尚未關聯 CTOS 用戶，無法進行專案更新操作。
   請聯繫管理員進行帳號關聯。
```

### 非專案成員

```
❌ 您不是此專案的成員，無法進行此操作。
```

### 使用情境

```
用戶：把水切爐專案的狀態改成已完成

AI：（檢查用戶是否為專案成員）
AI：❌ 您不是此專案的成員，無法進行此操作。

---

用戶：我想加入水切爐專案

AI：（調用 add_project_member，自動綁定）
AI：✅ 已將「張三」綁定到您的帳號

用戶：現在把狀態改成已完成

AI：（再次檢查，現在是成員了）
AI：✅ 已更新專案「水切爐改善」：狀態: completed
```

---

## ctos_user_id 的傳遞

Line Bot AI 在調用工具時會自動傳入 `ctos_user_id`：

```python
async def call_claude_with_tools(
    messages: list,
    tools: list,
    line_user_uuid: UUID,
    ctos_user_id: int | None,  # 從 line_users.user_id 取得
):
    # 呼叫 Claude API
    response = await client.messages.create(...)

    # 處理工具調用
    for block in response.content:
        if block.type == "tool_use":
            # 注入 ctos_user_id 到工具參數
            arguments = block.input
            if "ctos_user_id" in get_tool_schema(block.name):
                arguments["ctos_user_id"] = ctos_user_id

            result = await execute_tool(block.name, arguments)
```

---

## 小結

MCP 工具權限控制的關鍵設計：

1. **用戶關聯鏈**：Line 用戶 → CTOS 帳號 → 專案成員
2. **檢查函數**：`check_project_member_permission()`
3. **兩階段檢查**：先檢查帳號綁定，再檢查專案成員
4. **自動綁定**：新增成員時可自動綁定帳號
5. **友善錯誤訊息**：明確告知用戶如何解決

下一篇 [專案管理資料模型設計]({% post_url 2026-01-08-project-data-model %}) 會介紹專案管理系統的完整資料表設計。

---

## 參考資源

- [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %})
- [FastMCP 知識庫工具]({% post_url 2026-01-06-fastmcp-knowledge-tools %})
- [Line Bot 群組專案綁定]({% post_url 2026-01-02-linebot-part4-group-project %})
