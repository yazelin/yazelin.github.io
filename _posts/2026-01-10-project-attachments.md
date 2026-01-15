---
layout: post
title: "專案附件與連結管理"
subtitle: "透過對話整合 NAS 檔案與外部連結"
date: 2026-01-10
categories: [ChingTech OS]
tags: [專案管理, MCP, FastMCP, NAS, Python, ChingTech OS]
---

## 前言

在 [專案管理資料模型]({% post_url 2026-01-08-project-data-model %}) 中，我們設計了 `project_attachments` 和 `project_links` 資料表。這篇來實作對應的 MCP 工具，讓用戶可以透過對話：

- 新增專案相關的 NAS 檔案
- 管理外部連結（設計圖、規格書連結等）
- 查詢和更新附件資訊

這些功能與 [Line Bot 搜尋並發送 NAS 檔案]({% post_url 2026-01-03-linebot-part5-nas-search %}) 整合，讓用戶可以直接將對話中的檔案加入專案。

---

## 資料表回顧

### 專案附件

```sql
CREATE TABLE project_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(256) NOT NULL,
    file_type VARCHAR(64),
    file_size BIGINT,
    storage_path TEXT NOT NULL,    -- NAS 路徑
    description TEXT,
    uploaded_by VARCHAR(64),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_attachments_project ON project_attachments(project_id);
```

### 專案連結

```sql
CREATE TABLE project_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(256) NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_links_project ON project_links(project_id);
```

---

## 連結管理工具

### 新增連結

```python
@mcp.tool()
async def add_project_link(
    project_id: str,
    title: str,
    url: str,
    description: str | None = None,
) -> str:
    """
    新增專案連結

    Args:
        project_id: 專案 UUID
        title: 連結標題（必填）
        url: URL（必填）
        description: 描述
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 驗證專案存在
        project = await conn.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1",
            project_id,
        )
        if not project:
            return f"錯誤：找不到專案 {project_id}"

        # 新增連結
        await conn.execute(
            """
            INSERT INTO project_links (project_id, title, url, description)
            VALUES ($1, $2, $3, $4)
            """,
            project_id,
            title,
            url,
            description,
        )

        return f"✅ 已為專案「{project['name']}」新增連結「{title}」"
```

### 使用情境

```
用戶：水切爐專案加一個連結，設計圖在 Google Drive 上
      https://drive.google.com/xxx

AI：（調用 add_project_link）
AI：✅ 已為專案「水切爐改善」新增連結「設計圖」
```

---

### 查詢連結

```python
@mcp.tool()
async def get_project_links(
    project_id: str,
    limit: int = 20,
) -> str:
    """
    查詢專案連結列表

    Args:
        project_id: 專案 UUID
        limit: 最大數量，預設 20
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 驗證專案存在
        project = await conn.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1",
            project_id,
        )
        if not project:
            return f"錯誤：找不到專案 {project_id}"

        # 查詢連結
        rows = await conn.fetch(
            """
            SELECT id, title, url, description, created_at
            FROM project_links
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            project_id,
            limit,
        )

        if not rows:
            return f"專案「{project['name']}」目前沒有連結"

        result = f"🔗 {project['name']} 的連結（共 {len(rows)} 筆）：\n\n"

        for r in rows:
            result += f"【{r['title']}】\n"
            result += f"  URL：{r['url']}\n"
            if r["description"]:
                result += f"  說明：{r['description']}\n"
            result += f"  ID：{r['id']}\n\n"

        return result.strip()
```

### 使用情境

```
用戶：水切爐專案有哪些連結？

AI：（調用 get_project_links）
AI：🔗 水切爐改善 的連結（共 3 筆）：

    【設計圖】
      URL：https://drive.google.com/xxx
      說明：最新版設計圖 v2.3

    【規格書】
      URL：https://docs.google.com/xxx
      說明：客戶需求規格書

    【報價單】
      URL：nas://projects/water-cutter/quotes
      說明：各廠商報價
```

---

### 更新與刪除連結

```python
@mcp.tool()
async def update_project_link(
    link_id: str,
    project_id: str | None = None,
    title: str | None = None,
    url: str | None = None,
    description: str | None = None,
) -> str:
    """
    更新專案連結

    Args:
        link_id: 連結 UUID
        project_id: 專案 UUID（可選，用於驗證）
        title: 新標題
        url: 新 URL
        description: 新描述
    """
    await ensure_db_connection()

    if not any([title, url, description is not None]):
        return "錯誤：請提供要更新的欄位（title、url 或 description）"

    async with get_connection() as conn:
        # 查詢連結
        sql = "SELECT * FROM project_links WHERE id = $1"
        params = [link_id]

        if project_id:
            sql += " AND project_id = $2"
            params.append(project_id)

        link = await conn.fetchrow(sql, *params)
        if not link:
            return f"錯誤：找不到連結 {link_id}"

        # 建立動態更新語句
        updates = []
        update_params = []
        param_idx = 1

        if title:
            updates.append(f"title = ${param_idx}")
            update_params.append(title)
            param_idx += 1

        if url:
            updates.append(f"url = ${param_idx}")
            update_params.append(url)
            param_idx += 1

        if description is not None:
            updates.append(f"description = ${param_idx}")
            update_params.append(description)
            param_idx += 1

        update_params.append(link_id)

        await conn.execute(
            f"UPDATE project_links SET {', '.join(updates)} WHERE id = ${param_idx}",
            *update_params,
        )

        return f"✅ 已更新連結「{title or link['title']}」"


@mcp.tool()
async def delete_project_link(
    link_id: str,
    project_id: str | None = None,
) -> str:
    """
    刪除專案連結

    Args:
        link_id: 連結 UUID
        project_id: 專案 UUID（可選，用於驗證）
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 查詢連結
        sql = "SELECT * FROM project_links WHERE id = $1"
        params = [link_id]

        if project_id:
            sql += " AND project_id = $2"
            params.append(project_id)

        link = await conn.fetchrow(sql, *params)
        if not link:
            return f"錯誤：找不到連結 {link_id}"

        # 刪除連結
        await conn.execute("DELETE FROM project_links WHERE id = $1", link_id)

        return f"✅ 已刪除連結「{link['title']}」"
```

---

## 附件管理工具

附件管理的特色是**不複製檔案**，而是記錄 NAS 路徑。這樣可以：

- 避免重複儲存浪費空間
- 保持檔案的單一來源
- 檔案更新時自動同步

### NAS 路徑格式

系統支援多種 NAS 路徑格式：

| 格式 | 範例 | 說明 |
|------|------|------|
| `nas://` | `nas://projects/water-cutter/design.pdf` | 完整 NAS 格式 |
| 掛載路徑 | `/mnt/nas/ctos/projects/...` | 完整掛載路徑 |
| Line Bot 路徑 | `users/abc123/file.jpg` | 來自 `get_message_attachments` |
| 專案路徑 | `projects/xxx/file.pdf` | 來自 `search_nas_files` |

### 新增附件

```python
@mcp.tool()
async def add_project_attachment(
    project_id: str,
    nas_path: str,
    description: str | None = None,
) -> str:
    """
    從 NAS 路徑添加附件到專案

    Args:
        project_id: 專案 UUID
        nas_path: NAS 檔案路徑（從 get_message_attachments 或 search_nas_files 取得）
        description: 描述
    """
    import mimetypes
    from pathlib import Path as FilePath
    from ..config import settings

    await ensure_db_connection()

    # 取得 NAS 路徑設定
    ctos_mount = settings.ctos_mount_path  # /mnt/nas/ctos
    linebot_files_path = settings.linebot_local_path
    line_files_nas_path = settings.line_files_nas_path

    async with get_connection() as conn:
        # 驗證專案存在
        project = await conn.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1",
            project_id,
        )
        if not project:
            return f"錯誤：找不到專案 {project_id}"

        # 處理 NAS 路徑 - 支援多種格式
        if nas_path.startswith("nas://"):
            # nas:// 格式
            relative_path = nas_path.replace("nas://", "")
            actual_path = FilePath(ctos_mount) / relative_path
            storage_path = nas_path
        elif nas_path.startswith(ctos_mount):
            # 完整掛載路徑
            actual_path = FilePath(nas_path)
            relative_path = nas_path.replace(f"{ctos_mount}/", "")
            storage_path = f"nas://{relative_path}"
        elif nas_path.startswith("users/") or nas_path.startswith("groups/"):
            # Line Bot 附件相對路徑
            actual_path = FilePath(linebot_files_path) / nas_path
            storage_path = f"nas://{line_files_nas_path}/{nas_path}"
        elif nas_path.startswith("projects/"):
            # NAS 專案檔案相對路徑
            actual_path = FilePath(ctos_mount) / nas_path
            storage_path = f"nas://{nas_path}"
        else:
            # 嘗試自動判斷
            actual_path = FilePath(linebot_files_path) / nas_path
            if actual_path.exists():
                storage_path = f"nas://{line_files_nas_path}/{nas_path}"
            else:
                actual_path = FilePath(ctos_mount) / nas_path
                storage_path = f"nas://{nas_path}"

        # 檢查檔案存在
        if not actual_path.exists():
            return f"錯誤：找不到檔案 {nas_path}"

        # 取得檔案資訊
        filename = actual_path.name
        file_size = actual_path.stat().st_size
        file_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

        # 新增附件記錄
        await conn.execute(
            """
            INSERT INTO project_attachments
            (project_id, filename, file_type, file_size, storage_path, description, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, 'AI')
            """,
            project_id,
            filename,
            file_type,
            file_size,
            storage_path,
            description,
        )

        return f"✅ 已為專案「{project['name']}」新增附件「{filename}」"
```

### 整合 Line Bot 檔案

這個工具可以與 `get_message_attachments` 整合，讓用戶直接將對話中的檔案加入專案：

```
用戶：（傳送圖片）
用戶：把這張圖加到水切爐專案

AI：（調用 get_message_attachments 取得圖片路徑）
AI：（調用 add_project_attachment）
AI：✅ 已為專案「水切爐改善」新增附件「IMG_20260110_143052.jpg」
```

---

### 查詢附件

```python
@mcp.tool()
async def get_project_attachments(
    project_id: str,
    limit: int = 20,
) -> str:
    """
    查詢專案附件列表

    Args:
        project_id: 專案 UUID
        limit: 最大數量，預設 20
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 驗證專案存在
        project = await conn.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1",
            project_id,
        )
        if not project:
            return f"錯誤：找不到專案 {project_id}"

        # 查詢附件
        rows = await conn.fetch(
            """
            SELECT id, filename, file_type, file_size, description, uploaded_at
            FROM project_attachments
            WHERE project_id = $1
            ORDER BY uploaded_at DESC
            LIMIT $2
            """,
            project_id,
            limit,
        )

        if not rows:
            return f"專案「{project['name']}」目前沒有附件"

        result = f"📎 {project['name']} 的附件（共 {len(rows)} 筆）：\n\n"

        for r in rows:
            # 格式化檔案大小
            size = r["file_size"] or 0
            if size < 1024:
                size_str = f"{size} B"
            elif size < 1024 * 1024:
                size_str = f"{size / 1024:.1f} KB"
            else:
                size_str = f"{size / 1024 / 1024:.1f} MB"

            result += f"【{r['filename']}】\n"
            result += f"  類型：{r['file_type'] or '未知'}\n"
            result += f"  大小：{size_str}\n"
            if r["description"]:
                result += f"  說明：{r['description']}\n"
            result += f"  ID：{r['id']}\n\n"

        return result.strip()
```

### 使用情境

```
用戶：水切爐專案有哪些附件？

AI：（調用 get_project_attachments）
AI：📎 水切爐改善 的附件（共 4 筆）：

    【設計圖_v2.3.pdf】
      類型：application/pdf
      大小：2.5 MB
      說明：最新版設計圖

    【報價單_亦達.xlsx】
      類型：application/vnd.openxmlformats...
      大小：156.2 KB
      說明：亦達公司報價

    【現場照片.jpg】
      類型：image/jpeg
      大小：1.2 MB
      說明：改善前現況
```

---

### 更新與刪除附件

```python
@mcp.tool()
async def update_project_attachment(
    attachment_id: str,
    project_id: str | None = None,
    description: str | None = None,
) -> str:
    """
    更新專案附件描述

    Args:
        attachment_id: 附件 UUID
        project_id: 專案 UUID（可選，用於驗證）
        description: 新描述
    """
    await ensure_db_connection()

    if description is None:
        return "錯誤：請提供要更新的描述（description）"

    async with get_connection() as conn:
        # 查詢附件
        sql = "SELECT * FROM project_attachments WHERE id = $1"
        params = [attachment_id]

        if project_id:
            sql += " AND project_id = $2"
            params.append(project_id)

        attachment = await conn.fetchrow(sql, *params)
        if not attachment:
            return f"錯誤：找不到附件 {attachment_id}"

        # 更新描述
        await conn.execute(
            "UPDATE project_attachments SET description = $1 WHERE id = $2",
            description,
            attachment_id,
        )

        return f"✅ 已更新附件「{attachment['filename']}」的描述"


@mcp.tool()
async def delete_project_attachment(
    attachment_id: str,
    project_id: str | None = None,
) -> str:
    """
    刪除專案附件

    Args:
        attachment_id: 附件 UUID
        project_id: 專案 UUID（可選，用於驗證）
    """
    await ensure_db_connection()

    async with get_connection() as conn:
        # 查詢附件
        sql = "SELECT * FROM project_attachments WHERE id = $1"
        params = [attachment_id]

        if project_id:
            sql += " AND project_id = $2"
            params.append(project_id)

        attachment = await conn.fetchrow(sql, *params)
        if not attachment:
            return f"錯誤：找不到附件 {attachment_id}"

        # 刪除附件記錄（不刪除實際檔案，因為是 NAS 引用）
        await conn.execute("DELETE FROM project_attachments WHERE id = $1", attachment_id)

        return f"✅ 已刪除附件「{attachment['filename']}」"
```

---

## 工作流程

### 新增附件流程

```
用戶對話中傳送檔案
       │
       ▼
Line Bot 儲存到 NAS
/mnt/nas/ctos/linebot/files/users/{uuid}/
       │
       ▼
用戶說「加到 XX 專案」
       │
       ▼
┌─────────────────────────────────────┐
│ get_message_attachments()           │
│ 取得最近的附件 NAS 路徑               │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ add_project_attachment()            │
│ 記錄 NAS 路徑到 project_attachments  │
└─────────────────────────────────────┘
       │
       ▼
✅ 附件已關聯到專案
```

### 搜尋 NAS 並加入專案

也可以從 NAS 搜尋現有檔案加入專案：

```
用戶：把 NAS 上的水切爐設計圖加到專案

AI：（調用 search_nas_files）
AI：找到 3 個檔案：
    1. projects/water-cutter/設計圖_v2.3.pdf
    2. projects/water-cutter/設計圖_v2.2.pdf
    3. projects/water-cutter/設計圖_v1.0.pdf

用戶：加第一個

AI：（調用 add_project_attachment）
AI：✅ 已為專案「水切爐改善」新增附件「設計圖_v2.3.pdf」
```

---

## 完整對話範例

```
用戶：建立一個新專案叫「氣密窗安裝」

AI：（調用 create_project）
AI：✅ 已建立專案「氣密窗安裝」

---

用戶：（傳送 PDF 檔案）
用戶：這是客戶的需求規格，加到氣密窗專案

AI：（調用 get_message_attachments）
AI：（調用 add_project_attachment）
AI：✅ 已為專案「氣密窗安裝」新增附件「客戶需求規格.pdf」

---

用戶：加一個連結，施工影片在 YouTube
      https://youtube.com/watch?v=xxx

AI：（調用 add_project_link）
AI：✅ 已為專案「氣密窗安裝」新增連結「施工影片」

---

用戶：氣密窗專案有哪些檔案？

AI：（調用 get_project_attachments）
AI：（調用 get_project_links）
AI：📎 氣密窗安裝 的附件（共 1 筆）：
    【客戶需求規格.pdf】
      類型：application/pdf
      大小：1.8 MB

    🔗 連結（共 1 筆）：
    【施工影片】
      URL：https://youtube.com/watch?v=xxx
```

---

## 小結

專案附件與連結管理功能包含：

| 工具 | 功能 |
|------|------|
| `add_project_link` | 新增連結 |
| `get_project_links` | 查詢連結列表 |
| `update_project_link` | 更新連結 |
| `delete_project_link` | 刪除連結 |
| `add_project_attachment` | 新增附件（NAS 引用） |
| `get_project_attachments` | 查詢附件列表 |
| `update_project_attachment` | 更新附件描述 |
| `delete_project_attachment` | 刪除附件 |

關鍵設計：

- **NAS 引用**：附件不複製檔案，只記錄 NAS 路徑
- **多格式支援**：支援 nas://、掛載路徑、Line Bot 路徑等
- **整合 Line Bot**：可直接將對話附件加入專案

下一篇 [Markdown 知識庫系統設計]({% post_url 2026-01-11-knowledge-base %}) 會介紹如何用 Markdown 檔案建立企業知識庫。

---

## 參考資源

- [專案管理資料模型]({% post_url 2026-01-08-project-data-model %})
- [Line Bot 搜尋並發送 NAS 檔案]({% post_url 2026-01-03-linebot-part5-nas-search %})
- [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %})
