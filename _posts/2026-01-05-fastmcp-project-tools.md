---
layout: post
title: "FastMCP 實作：專案管理工具開發"
subtitle: "用 AI 對話管理專案、成員與里程碑"
date: 2026-01-05
categories: [ChingTech OS]
tags: [MCP, FastMCP, 專案管理, Python, ChingTech OS]
---

![FastMCP 實作：專案管理工具開發](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-05-fastmcp-project-tools.png)

## 前言

上一篇 [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %}) 介紹了 MCP 的基本概念和 FastMCP 框架。這篇來實作專案管理相關的 MCP 工具，讓用戶可以透過對話：

- 查詢專案資訊
- 建立新專案
- 新增專案成員
- 管理里程碑
- 查看會議記錄

這些工具會被 [Line Bot AI]({% post_url 2026-01-01-linebot-part3-ai-integration %}) 和 Claude Code CLI 共同使用。

---

## 工具總覽

| 工具 | 功能 | 參數 |
|------|------|------|
| `query_project` | 查詢專案 | project_id 或 keyword |
| `create_project` | 建立專案 | name, description, dates |
| `add_project_member` | 新增成員 | project_id, name, role... |
| `add_project_milestone` | 新增里程碑 | project_id, name, type, date |
| `get_project_milestones` | 查詢里程碑 | project_id, status |
| `get_project_meetings` | 查詢會議 | project_id, limit |
| `get_project_members` | 查詢成員 | project_id, is_internal |

---

## 查詢專案

### 工具定義

```python
@mcp.tool()
async def query_project(
    project_id: str | None = None,
    keyword: str | None = None,
) -> str:
    """
    查詢專案資訊

    Args:
        project_id: 專案 UUID，查詢特定專案
        keyword: 搜尋關鍵字，搜尋專案名稱和描述
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        if project_id:
            # 精確查詢
            row = await conn.fetchrow(
                "SELECT * FROM projects WHERE id = $1",
                UUID(project_id),
            )
            if not row:
                return f"找不到專案 ID: {project_id}"

            # 取得里程碑統計
            milestone_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress
                FROM project_milestones
                WHERE project_id = $1
                """,
                UUID(project_id),
            )

            # 取得成員數
            member_count = await conn.fetchval(
                "SELECT COUNT(*) FROM project_members WHERE project_id = $1",
                UUID(project_id),
            )

            return f"""專案：{row['name']}
狀態：{row['status']}
描述：{row['description'] or '無描述'}
成員數：{member_count}
里程碑：共 {milestone_stats['total']} 個，完成 {milestone_stats['completed']}，進行中 {milestone_stats['in_progress']}
建立時間：{row['created_at'].strftime('%Y-%m-%d')}"""

        elif keyword:
            # 關鍵字搜尋
            rows = await conn.fetch(
                """
                SELECT id, name, status, description
                FROM projects
                WHERE name ILIKE $1 OR description ILIKE $1
                ORDER BY updated_at DESC
                LIMIT 5
                """,
                f"%{keyword}%",
            )
            if not rows:
                return f"找不到包含「{keyword}」的專案"

            # 格式化搜尋結果
            result = f"找到 {len(rows)} 個專案：\n\n"
            for row in rows:
                result += f"• {row['name']}（{row['status']}）\n"
                result += f"  ID: {row['id']}\n"
            return result

        else:
            return "請提供 project_id 或 keyword"
```

### 使用情境

```
用戶：查一下水切爐專案

AI：（調用 query_project，keyword="水切爐"）
AI：找到 1 個專案：

    • 水切爐改善（in_progress）
      ID: 550e8400-e29b-41d4-a716-446655440000
```

---

## 建立專案

### 工具定義

```python
@mcp.tool()
async def create_project(
    name: str,
    description: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    """
    建立新專案

    Args:
        name: 專案名稱（必填）
        description: 專案描述
        start_date: 開始日期（格式：YYYY-MM-DD）
        end_date: 結束日期（格式：YYYY-MM-DD）
    """
    from datetime import date as date_type
    from ..models.project import ProjectCreate
    from .project import create_project as svc_create_project

    await ensure_db_connection()

    try:
        # 解析日期
        parsed_start = None
        parsed_end = None
        if start_date:
            parsed_start = date_type.fromisoformat(start_date)
        if end_date:
            parsed_end = date_type.fromisoformat(end_date)

        # 建立專案
        data = ProjectCreate(
            name=name,
            description=description,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        result = await svc_create_project(data, created_by="linebot")

        return f"✅ 已建立專案「{result.name}」\n專案 ID：{result.id}"

    except Exception as e:
        return f"建立專案失敗：{str(e)}"
```

### 使用情境

```
用戶：幫我建立一個「新廠規劃」專案，預計明年一月開始

AI：（調用 create_project）
AI：✅ 已建立專案「新廠規劃」
    專案 ID：a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

---

## 新增專案成員

### 工具定義

```python
@mcp.tool()
async def add_project_member(
    project_id: str,
    name: str,
    role: str | None = None,
    company: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    notes: str | None = None,
    is_internal: bool = True,
    ctos_user_id: int | None = None,
) -> str:
    """
    新增專案成員

    Args:
        project_id: 專案 UUID
        name: 成員姓名（必填）
        role: 角色/職稱
        company: 公司名稱（外部聯絡人適用）
        email: 電子郵件
        phone: 電話
        notes: 備註
        is_internal: 是否為內部人員，預設 True
        ctos_user_id: CTOS 用戶 ID（自動綁定帳號）
    """
    await ensure_db_connection()

    try:
        # 準備 user_id
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
                # 自動綁定
                async with get_connection() as conn:
                    await conn.execute(
                        "UPDATE project_members SET user_id = $1 WHERE id = $2",
                        user_id,
                        existing["id"],
                    )
                return f"✅ 已將「{name}」綁定到您的帳號"
            else:
                return f"ℹ️ 專案中已有成員「{name}」"

        # 新增成員
        data = ProjectMemberCreate(
            name=name,
            role=role,
            company=company,
            email=email,
            phone=phone,
            notes=notes,
            is_internal=is_internal,
            user_id=user_id,
        )
        result = await svc_create_member(UUID(project_id), data)

        member_type = "內部人員" if is_internal else "外部聯絡人"
        return f"✅ 已新增{member_type}「{result.name}」到專案"

    except ProjectNotFoundError:
        return f"找不到專案 ID: {project_id}"
```

### 設計考量

1. **防止重複新增**：檢查同名成員是否存在
2. **自動綁定**：傳入 `ctos_user_id` 時自動綁定系統帳號
3. **內/外部區分**：`is_internal` 區分內部人員和外部聯絡人（客戶、廠商）

### 使用情境

```
用戶：新增張三和李四到水切爐專案，張三是專案經理，李四是機械工程師

AI：（調用 add_project_member 兩次）
AI：✅ 已新增內部人員「張三」（專案經理）
    ✅ 已新增內部人員「李四」（機械工程師）
```

---

## 新增里程碑

### 工具定義

```python
@mcp.tool()
async def add_project_milestone(
    project_id: str,
    name: str,
    milestone_type: str = "custom",
    planned_date: str | None = None,
    actual_date: str | None = None,
    status: str = "pending",
    notes: str | None = None,
) -> str:
    """
    新增專案里程碑

    Args:
        project_id: 專案 UUID
        name: 里程碑名稱（必填）
        milestone_type: 類型，可選：design, manufacture, delivery,
                        field_test, acceptance, custom
        planned_date: 預計日期（YYYY-MM-DD）
        actual_date: 實際日期（YYYY-MM-DD）
        status: 狀態：pending, in_progress, completed, delayed
        notes: 備註
    """
    await ensure_db_connection()

    try:
        # 解析日期
        parsed_planned = date_type.fromisoformat(planned_date) if planned_date else None
        parsed_actual = date_type.fromisoformat(actual_date) if actual_date else None

        data = ProjectMilestoneCreate(
            name=name,
            milestone_type=milestone_type,
            planned_date=parsed_planned,
            actual_date=parsed_actual,
            status=status,
            notes=notes,
        )
        result = await svc_create_milestone(UUID(project_id), data)

        status_emoji = {
            "pending": "⏳",
            "in_progress": "🔄",
            "completed": "✅",
            "delayed": "⚠️",
        }.get(result.status, "❓")

        date_str = f"，預計 {result.planned_date}" if result.planned_date else ""
        return f"✅ 已新增里程碑：{status_emoji} {result.name}{date_str}"

    except ProjectNotFoundError:
        return f"找不到專案 ID: {project_id}"
    except ValueError as e:
        return f"日期格式錯誤，請使用 YYYY-MM-DD 格式"
```

### 里程碑類型

| 類型 | 說明 |
|------|------|
| design | 設計階段 |
| manufacture | 製造階段 |
| delivery | 交貨 |
| field_test | 現場測試 |
| acceptance | 驗收 |
| custom | 自訂 |

### 使用情境

```
用戶：新增一個里程碑「試車」，預計下週五

AI：（調用 add_project_milestone）
AI：✅ 已新增里程碑：⏳ 試車，預計 2026-01-10
```

---

## 查詢里程碑

```python
@mcp.tool()
async def get_project_milestones(
    project_id: str,
    status: str | None = None,
    limit: int = 10,
) -> str:
    """
    取得專案里程碑列表

    Args:
        project_id: 專案 UUID
        status: 狀態過濾：pending, in_progress, completed, delayed
        limit: 最大數量，預設 10
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        query = """
            SELECT id, name, milestone_type, planned_date, actual_date, status
            FROM project_milestones
            WHERE project_id = $1
        """
        params = [UUID(project_id)]

        if status:
            query += " AND status = $2"
            params.append(status)

        query += " ORDER BY sort_order, planned_date LIMIT $" + str(len(params) + 1)
        params.append(limit)

        rows = await conn.fetch(query, *params)

        if not rows:
            return "此專案目前沒有里程碑"

        # 取得專案名稱
        project = await conn.fetchrow(
            "SELECT name FROM projects WHERE id = $1", UUID(project_id)
        )

        # 格式化輸出
        result = f"【{project['name']}】里程碑：\n\n"
        for row in rows:
            status_emoji = {"pending": "⏳", "in_progress": "🔄",
                          "completed": "✅", "delayed": "⚠️"}.get(row["status"], "❓")
            planned = row["planned_date"].strftime("%m/%d") if row["planned_date"] else "未排程"
            result += f"{status_emoji} {row['name']} | 預計 {planned}\n"

        return result
```

### 使用情境

```
用戶：水切爐專案的里程碑有哪些？

AI：（調用 get_project_milestones）
AI：【水切爐改善】里程碑：

    ✅ 設計審查 | 預計 12/15
    ✅ 採購下單 | 預計 12/20
    🔄 設備安裝 | 預計 01/10
    ⏳ 試車 | 預計 01/15
    ⏳ 驗收 | 預計 01/20
```

---

## 查詢成員

```python
@mcp.tool()
async def get_project_members(
    project_id: str,
    is_internal: bool | None = None,
) -> str:
    """
    取得專案成員與聯絡人

    Args:
        project_id: 專案 UUID
        is_internal: 篩選內部或外部人員
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        query = """
            SELECT id, name, role, company, email, phone, is_internal
            FROM project_members
            WHERE project_id = $1
        """
        params = [UUID(project_id)]

        if is_internal is not None:
            query += " AND is_internal = $2"
            params.append(is_internal)

        query += " ORDER BY is_internal DESC, name"
        rows = await conn.fetch(query, *params)

        if not rows:
            return "此專案目前沒有成員"

        # 分組格式化
        internal = [r for r in rows if r["is_internal"]]
        external = [r for r in rows if not r["is_internal"]]

        result = f"【{project_name}】成員/聯絡人：\n\n"

        if internal:
            result += "內部人員：\n"
            for row in internal:
                result += f"  👤 {row['name']} - {row['role'] or '未指定角色'}\n"

        if external:
            result += "\n外部聯絡人：\n"
            for row in external:
                info = f"  👤 {row['name']}"
                if row["company"]:
                    info += f" ({row['company']})"
                result += info + "\n"

        return result
```

---

## 資料庫連線管理

MCP 工具可能被多次獨立調用，需要確保資料庫連線：

```python
async def ensure_db_connection():
    """確保資料庫連線池已初始化"""
    from ..database import get_pool, init_db_pool

    pool = await get_pool()
    if pool is None:
        await init_db_pool()
```

每個工具函數開頭都要調用 `ensure_db_connection()`，避免連線池未初始化的問題。

---

## 小結

這篇實作了專案管理的 MCP 工具：

- **query_project**：查詢專案（UUID 或關鍵字）
- **create_project**：建立新專案
- **add_project_member**：新增成員（含自動綁定）
- **add_project_milestone**：新增里程碑
- **get_project_milestones**：查詢里程碑列表
- **get_project_members**：查詢成員列表

下一篇 [FastMCP 實作：知識庫工具]({% post_url 2026-01-06-fastmcp-knowledge-tools %}) 會介紹知識庫相關的 MCP 工具和 Scope 自動判定機制。

---

## 參考資源

- [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})
- [Line Bot AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})
- [FastMCP GitHub](https://github.com/jlowin/fastmcp)
