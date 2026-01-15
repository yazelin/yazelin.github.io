---
layout: post
title: "FastMCP 實作：知識庫工具與 Scope 自動判定"
subtitle: "透過對話管理知識庫，智慧判斷內容歸屬"
date: 2026-01-06
categories: [ChingTech OS]
tags: [MCP, FastMCP, 知識庫, Python, ChingTech OS]
---

## 前言

上一篇 [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %}) 介紹了專案相關的 MCP 工具。這篇來實作知識庫工具，讓用戶可以透過對話：

- 搜尋知識庫
- 新增筆記
- 管理附件
- 更新和刪除知識

特別的是，系統會根據對話來源**自動判定知識的 Scope**（範圍），省去用戶手動指定的麻煩。

---

## Scope 概念

知識庫中的每筆知識都有一個 **Scope（範圍）**，決定誰可以看到和編輯：

| Scope | 說明 | 存取權限 |
|-------|------|----------|
| `global` | 全域知識 | 所有人可讀，需 global_write 權限才能編輯 |
| `personal` | 個人知識 | 僅建立者可讀寫 |
| `project` | 專案知識 | 專案成員可讀寫 |

### 自動判定規則

透過 Line Bot 建立知識時，系統會根據對話來源自動設定 Scope：

```
┌─────────────────────────────────────────────────────────────┐
│  對話來源                                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ┌──────────┐   ┌──────────┐   ┌──────────┐
     │ 個人對話  │   │ 群組對話  │   │ 群組對話  │
     │ +已綁定   │   │ +綁定專案 │   │ 未綁定    │
     └────┬─────┘   └────┬─────┘   └────┬─────┘
          │              │              │
          ▼              ▼              ▼
     ┌──────────┐   ┌──────────┐   ┌──────────┐
     │ personal │   │ project  │   │ global   │
     │ 個人知識  │   │ 專案知識  │   │ 全域知識  │
     └──────────┘   └──────────┘   └──────────┘
```

---

## 工具總覽

| 工具 | 功能 |
|------|------|
| `search_knowledge` | 搜尋知識庫 |
| `get_knowledge_item` | 取得完整內容 |
| `add_note` | 新增純文字筆記 |
| `add_note_with_attachments` | 新增筆記含附件 |
| `update_knowledge_item` | 更新知識 |
| `delete_knowledge_item` | 刪除知識 |
| `add_attachments_to_knowledge` | 新增附件 |
| `get_knowledge_attachments` | 查詢附件列表 |
| `update_knowledge_attachment` | 更新附件說明 |

---

## 搜尋知識庫

```python
@mcp.tool()
async def search_knowledge(
    query: str,
    project: str | None = None,
    category: str | None = None,
    limit: int = 5,
) -> str:
    """
    搜尋知識庫

    Args:
        query: 搜尋關鍵字
        project: 專案過濾（專案 ID 或名稱）
        category: 分類過濾（technical, process, tool, note）
        limit: 最大結果數量，預設 5
    """
    from . import knowledge as kb_service

    try:
        result = kb_service.search_knowledge(
            query=query,
            project=project,
            category=category,
        )

        if not result.items:
            return f"找不到包含「{query}」的知識"

        # 格式化結果
        items = result.items[:limit]
        output = [f"搜尋「{query}」找到 {len(result.items)} 筆結果：\n"]

        for item in items:
            tags_str = ", ".join(item.tags.topics) if item.tags.topics else "無標籤"
            output.append(f"📄 [{item.id}] {item.title}")
            output.append(f"   分類：{item.category} | 標籤：{tags_str}")
            if item.snippet:
                snippet = item.snippet[:100] + "..." if len(item.snippet) > 100 else item.snippet
                output.append(f"   摘要：{snippet}")
            output.append("")

        return "\n".join(output)

    except Exception as e:
        return f"搜尋失敗：{str(e)}"
```

### 使用情境

```
用戶：找一下水切爐的資料

AI：（調用 search_knowledge）
AI：搜尋「水切爐」找到 3 筆結果：

    📄 [kb-015] 水切爐標準作業程序
       分類：process | 標籤：水切爐, SOP
       摘要：水切爐的標準操作溫度為 850°C...

    📄 [kb-023] 水切爐故障排除
       分類：technical | 標籤：水切爐, 維修
       摘要：常見故障代碼 E01 表示溫度感測器異常...
```

---

## 取得完整內容

```python
@mcp.tool()
async def get_knowledge_item(kb_id: str) -> str:
    """
    取得知識庫文件的完整內容

    Args:
        kb_id: 知識 ID（如 kb-001、kb-002）
    """
    from . import knowledge as kb_service
    from pathlib import Path

    try:
        item = kb_service.get_knowledge(kb_id)

        # 格式化輸出
        tags_str = ", ".join(item.tags.topics) if item.tags.topics else "無標籤"
        output = [
            f"📄 **[{item.id}] {item.title}**",
            f"分類：{item.category} | 標籤：{tags_str}",
            "",
            "---",
            "",
            item.content or "（無內容）",
        ]

        # 加入附件資訊
        if item.attachments:
            output.append("")
            output.append("---")
            output.append(f"📎 **附件** ({len(item.attachments)} 個)")
            for idx, att in enumerate(item.attachments):
                filename = Path(att.path).name
                desc = f" - {att.description}" if att.description else ""
                output.append(f"  [{idx}] {att.type}: {filename}{desc}")

        return "\n".join(output)

    except Exception as e:
        return f"找不到知識 {kb_id}：{str(e)}"
```

---

## Scope 自動判定實作

這是知識庫工具的核心邏輯：

```python
async def _determine_knowledge_scope(
    line_group_id: str | None,
    line_user_id: str | None,
    ctos_user_id: int | None,
) -> tuple[str, str | None, str | None]:
    """判斷知識庫的 scope 和相關屬性

    Returns:
        tuple[scope, owner_username, project_id]
    """
    scope = "global"
    owner_username: str | None = None
    project_id: str | None = None

    # 1. 取得 CTOS 使用者名稱（如果有綁定）
    if ctos_user_id:
        async with get_connection() as conn:
            user_row = await conn.fetchrow(
                "SELECT username FROM users WHERE id = $1",
                ctos_user_id,
            )
            if user_row:
                owner_username = user_row["username"]

    # 2. 判斷對話來源並設定 scope
    if line_group_id:
        # 群組聊天：檢查群組是否綁定專案
        async with get_connection() as conn:
            group_row = await conn.fetchrow(
                "SELECT project_id FROM line_groups WHERE id = $1",
                UUID(line_group_id),
            )
            if group_row and group_row["project_id"]:
                # 群組已綁定專案 → scope=project
                scope = "project"
                project_id = str(group_row["project_id"])
            else:
                # 群組未綁定專案 → scope=global
                scope = "global"
    else:
        # 個人聊天
        if owner_username:
            # 已綁定 CTOS 帳號 → scope=personal
            scope = "personal"
        else:
            # 未綁定 → scope=global
            scope = "global"

    return scope, owner_username, project_id
```

---

## 新增筆記

### 純文字筆記

```python
@mcp.tool()
async def add_note(
    title: str,
    content: str,
    category: str = "note",
    topics: list[str] | None = None,
    project: str | None = None,
    line_group_id: str | None = None,
    line_user_id: str | None = None,
    ctos_user_id: int | None = None,
) -> str:
    """
    新增筆記到知識庫

    Args:
        title: 筆記標題
        content: 筆記內容（Markdown 格式）
        category: 分類，預設 note
        topics: 主題標籤列表
        project: 關聯的專案名稱
        line_group_id: Line 群組 UUID（自動傳入）
        line_user_id: Line 用戶 ID（自動傳入）
        ctos_user_id: CTOS 用戶 ID（自動傳入）
    """
    from ..models.knowledge import KnowledgeCreate, KnowledgeTags, KnowledgeSource
    from . import knowledge as kb_service

    try:
        await ensure_db_connection()

        # 自動判斷 scope
        scope, owner_username, project_id = await _determine_knowledge_scope(
            line_group_id, line_user_id, ctos_user_id
        )

        # 建立知識
        tags = KnowledgeTags(
            projects=[project] if project else [],
            topics=topics or [],
        )

        source = KnowledgeSource(path="linebot")

        data = KnowledgeCreate(
            title=title,
            content=content,
            type="note",
            category=category,
            scope=scope,
            project_id=project_id,
            tags=tags,
            source=source,
            author=owner_username or "linebot",
        )

        result = kb_service.create_knowledge(
            data, owner=owner_username, project_id=project_id
        )

        scope_text = {"global": "全域", "personal": "個人", "project": "專案"}.get(scope)
        return f"✅ 筆記已新增！\nID：{result.id}\n標題：{result.title}\n範圍：{scope_text}知識"

    except Exception as e:
        return f"新增筆記失敗：{str(e)}"
```

### 含附件筆記

```python
@mcp.tool()
async def add_note_with_attachments(
    title: str,
    content: str,
    attachments: list[str],
    category: str = "note",
    topics: list[str] | None = None,
    project: str | None = None,
    line_group_id: str | None = None,
    line_user_id: str | None = None,
    ctos_user_id: int | None = None,
) -> str:
    """
    新增筆記到知識庫並加入附件

    Args:
        title: 筆記標題
        content: 筆記內容
        attachments: 附件的 NAS 路徑列表（從 get_message_attachments 取得）
        ... 其他參數同 add_note
    """
    # 限制附件數量
    if len(attachments) > 10:
        return "附件數量不能超過 10 個"

    try:
        await ensure_db_connection()

        # 自動判斷 scope
        scope, owner_username, project_id = await _determine_knowledge_scope(
            line_group_id, line_user_id, ctos_user_id
        )

        # 建立知識
        # ... 同 add_note

        result = kb_service.create_knowledge(data, owner=owner_username, project_id=project_id)
        kb_id = result.id

        # 處理附件
        success_count = 0
        for nas_path in attachments:
            try:
                kb_service.copy_linebot_attachment_to_knowledge(kb_id, nas_path)
                success_count += 1
            except Exception as e:
                logger.warning(f"附件複製失敗 {nas_path}: {e}")

        return f"✅ 筆記已新增！\nID：{kb_id}\n標題：{result.title}\n附件：{success_count} 個"

    except Exception as e:
        return f"新增筆記失敗：{str(e)}"
```

---

## 使用情境

### 情境一：個人筆記

```
（個人對話，用戶已綁定 CTOS 帳號）

用戶：把這段記到知識庫：「水切爐的標準溫度是 850°C」

AI：（調用 add_note，scope 自動設為 personal）
AI：✅ 筆記已新增！
    ID：kb-042
    標題：水切爐標準溫度
    範圍：個人知識
```

### 情境二：專案知識

```
（群組對話，群組已綁定專案「水切爐改善」）

用戶：把剛剛那張圖加到知識庫，標題叫「水切爐改善方案」

AI：（調用 get_message_attachments 取得最近的圖片）
AI：（調用 add_note_with_attachments，scope 自動設為 project）
AI：✅ 筆記已新增！
    ID：kb-043
    標題：水切爐改善方案
    範圍：專案知識
    附件：1 個
```

### 情境三：全域知識

```
（群組對話，群組未綁定專案）

用戶：記一下：公司 WiFi 密碼是 ABC123

AI：（調用 add_note，scope 自動設為 global）
AI：✅ 筆記已新增！
    ID：kb-044
    標題：公司 WiFi 密碼
    範圍：全域知識
```

---

## 附件管理

### 查詢附件

```python
@mcp.tool()
async def get_knowledge_attachments(kb_id: str) -> str:
    """取得知識庫的附件列表"""
    item = kb_service.get_knowledge(kb_id)

    if not item.attachments:
        return f"知識 {kb_id} 沒有附件"

    output = [f"📎 **{kb_id} 附件列表** ({len(item.attachments)} 個)\n"]

    for idx, att in enumerate(item.attachments):
        filename = Path(att.path).name
        output.append(f"[{idx}] {att.type}")
        output.append(f"    檔名：{filename}")
        if att.description:
            output.append(f"    說明：{att.description}")
        output.append("")

    return "\n".join(output)
```

### 更新附件說明

```python
@mcp.tool()
async def update_knowledge_attachment(
    kb_id: str,
    attachment_index: int,
    description: str | None = None,
) -> str:
    """更新知識庫附件的說明"""
    attachment = kb_service.update_attachment(
        kb_id=kb_id,
        attachment_idx=attachment_index,
        description=description,
    )

    filename = Path(attachment.path).name
    return f"✅ 已更新 {kb_id} 附件 [{attachment_index}]\n檔名：{filename}\n說明：{description}"
```

---

## 小結

這篇實作了知識庫的 MCP 工具：

- **搜尋與查詢**：search_knowledge、get_knowledge_item
- **新增筆記**：add_note、add_note_with_attachments
- **Scope 自動判定**：根據對話來源智慧設定
- **附件管理**：新增、查詢、更新說明

下一篇 [MCP 工具權限控制設計]({% post_url 2026-01-07-mcp-permission %}) 會介紹如何確保只有專案成員才能操作敏感工具。

---

## 參考資源

- [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})
- [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %})
- [Line Bot 群組專案綁定]({% post_url 2026-01-02-linebot-part4-group-project %})
