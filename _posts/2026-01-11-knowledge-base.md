---
layout: post
title: "Markdown 知識庫系統設計"
subtitle: "用 YAML Front Matter 與 Git 打造企業級知識管理"
date: 2026-01-11
categories: [ChingTech OS]
tags: [知識庫, Markdown, YAML, Git, Python, ChingTech OS]
---

![Markdown 知識庫系統設計](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-11-knowledge-base.png)

## 前言

在 [FastMCP 知識庫工具與 Scope 自動判定]({% post_url 2026-01-06-fastmcp-knowledge-tools %}) 中，我們實作了知識庫的 MCP 工具。這篇來深入介紹知識庫系統的**核心設計**：

- Markdown + YAML Front Matter 格式
- 檔案式儲存與索引機制
- ripgrep 全文搜尋整合
- Git 版本歷史追蹤

這套設計讓知識庫具備**可讀性**（純文字）、**可移植性**（不依賴特定資料庫）、**可追溯性**（Git 歷史）的特點。

---

## 系統架構

```
knowledge/
├── entries/                    # 知識文件目錄
│   ├── kb-001-knowledge-base-guide.md
│   ├── kb-002-project-architecture.md
│   └── ...
├── assets/                     # 附件目錄
│   ├── images/
│   │   ├── kb-001-diagram.png
│   │   └── ...
│   └── documents/
│       └── ...
└── index.json                  # 索引檔案
```

### 設計理念

| 特性 | 說明 |
|------|------|
| **純文字** | Markdown 格式，任何編輯器都能開啟 |
| **自描述** | YAML Front Matter 包含完整元資料 |
| **快速搜尋** | ripgrep 全文搜尋，毫秒級回應 |
| **版本追蹤** | Git 管理，保留所有修改歷史 |
| **彈性擴充** | JSON 索引支援快速過濾查詢 |

---

## 知識文件格式

每個知識文件由兩部分組成：

### 1. YAML Front Matter（元資料）

```yaml
---
id: kb-001
title: 知識庫使用說明
type: reference
category: technical
scope: global
owner: null
project_id: null
tags:
  projects:
    - ching-tech-os
    - common
  roles:
    - all
  topics:
    - knowledge-base
    - documentation
  level: beginner
source:
  project: ching-tech-os
  path: null
  commit: null
related: []
attachments:
  - type: image
    path: ../assets/images/kb-001-diagram.png
    size: 725.9KB
    description: 架構圖
author: system
created_at: 2024-12-11
updated_at: 2025-12-24
---
```

### 2. Markdown 內容

```markdown
# 知識庫使用說明

## 概述

知識庫是 ChingTech OS 的企業級知識管理系統...

## 功能特點

- **多專案管理**：支援多個專案
- **標籤系統**：多維度標籤組織
- **全文搜尋**：ripgrep 高效搜尋
```

---

## 元資料欄位說明

### 基本欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | string | 唯一識別碼（如 kb-001） |
| `title` | string | 知識標題 |
| `type` | string | 類型 |
| `category` | string | 分類 |
| `author` | string | 作者 |
| `created_at` | date | 建立日期 |
| `updated_at` | date | 更新日期 |

### 類型與分類

```python
# 類型（type）
types = ["context", "knowledge", "operations", "reference"]

# 分類（category）
categories = ["technical", "business", "management"]
```

| 類型 | 用途 |
|------|------|
| `context` | 背景脈絡、專案概述 |
| `knowledge` | 技術知識、操作指南 |
| `operations` | 作業程序、SOP |
| `reference` | 參考資料、規格文件 |

### Scope 範圍

```python
# 範圍（scope）
scopes = ["global", "personal", "project"]
```

| Scope | 說明 | 存取權限 |
|-------|------|----------|
| `global` | 全域知識 | 所有人可讀 |
| `personal` | 個人知識 | 僅擁有者可讀寫 |
| `project` | 專案知識 | 專案成員可讀寫 |

詳細的 Scope 自動判定邏輯請參考 [FastMCP 知識庫工具]({% post_url 2026-01-06-fastmcp-knowledge-tools %})。

---

## 標籤系統

```yaml
tags:
  projects:        # 關聯專案
    - ching-tech-os
    - ros-agv
  roles:           # 適用角色
    - engineer
    - pm
  topics:          # 主題標籤
    - api
    - database
  level: intermediate  # 難度等級
```

### 多維度過濾

標籤系統支援多維度過濾：

```python
# 搜尋技術類型、工程師適用的知識
results = search_knowledge(
    category="technical",
    role="engineer",
    level="intermediate",
)
```

---

## Pydantic 模型

### 知識元資料

```python
class KnowledgeMetadata(BaseModel):
    """知識元資料（對應 YAML Front Matter）"""

    id: str
    title: str
    type: str = "knowledge"
    category: str = "technical"
    scope: str = "global"
    owner: str | None = None       # 擁有者（personal 用）
    project_id: str | None = None  # 專案 ID（project 用）
    tags: KnowledgeTags = Field(default_factory=KnowledgeTags)
    source: KnowledgeSource = Field(default_factory=KnowledgeSource)
    related: list[str] = Field(default_factory=list)
    attachments: list[KnowledgeAttachment] = Field(default_factory=list)
    author: str = "system"
    created_at: date
    updated_at: date
```

### 標籤結構

```python
class KnowledgeTags(BaseModel):
    """知識標籤"""

    projects: list[str] = Field(default_factory=list)
    roles: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    level: str | None = None
```

### 附件結構

```python
class KnowledgeAttachment(BaseModel):
    """知識附件"""

    type: str          # image, video, document, etc.
    path: str          # 相對路徑或 NAS 路徑
    size: str | None = None
    description: str | None = None
```

---

## 索引機制

### index.json 結構

```python
class KnowledgeIndex(BaseModel):
    """知識庫索引"""

    version: int = 1
    last_updated: str | None = None
    next_id: int = 1
    entries: list[IndexEntry] = Field(default_factory=list)
    tags: TagsResponse = Field(default_factory=...)
```

### 索引項目

```python
class IndexEntry(BaseModel):
    """索引中的知識項目"""

    id: str
    title: str
    filename: str
    type: str
    category: str
    scope: str = "global"
    owner: str | None = None
    project_id: str | None = None
    tags: KnowledgeTags
    author: str
    created_at: str
    updated_at: str
```

### 索引用途

| 用途 | 說明 |
|------|------|
| **快速過濾** | 不需讀取檔案就能按標籤過濾 |
| **ID 分配** | `next_id` 確保 ID 唯一 |
| **標籤統計** | 維護所有可用的標籤清單 |

---

## 核心服務實作

### Front Matter 解析

```python
def _parse_front_matter(content: str) -> tuple[dict[str, Any], str]:
    """解析 YAML Front Matter

    Returns:
        (metadata_dict, markdown_content)
    """
    if not content.startswith("---"):
        return {}, content

    # 找到第二個 ---
    end_match = re.search(r"\n---\s*\n", content[3:])
    if not end_match:
        return {}, content

    yaml_content = content[3 : end_match.start() + 3]
    markdown_content = content[end_match.end() + 3 :].strip()

    try:
        metadata = yaml.safe_load(yaml_content)
        return metadata or {}, markdown_content
    except yaml.YAMLError:
        return {}, content
```

### Front Matter 產生

```python
def _generate_front_matter(metadata: dict[str, Any]) -> str:
    """產生 YAML Front Matter"""
    yaml_content = yaml.dump(
        metadata,
        default_flow_style=False,
        allow_unicode=True,
        sort_keys=False,
    )
    return f"---\n{yaml_content}---\n\n"
```

---

## 搜尋實作

### ripgrep 全文搜尋

```python
def search_knowledge(
    query: str | None = None,
    project: str | None = None,
    category: str | None = None,
    scope: str | None = None,
    current_username: str | None = None,
) -> KnowledgeListResponse:
    """搜尋知識"""
    index = _load_index()
    results: list[KnowledgeListItem] = []

    # 用 ripgrep 搜尋內容
    matching_files: set[str] | None = None
    snippets: dict[str, str] = {}

    if query:
        try:
            # 搜尋檔名
            result = subprocess.run(
                [
                    "rg",
                    "-i",           # 不分大小寫
                    "-l",           # 只輸出檔名
                    "--type", "md",
                    query,
                    str(ENTRIES_PATH),
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )

            matching_files = set()
            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    if line:
                        matching_files.add(Path(line).name)

            # 取得匹配片段（用於顯示摘要）
            result_context = subprocess.run(
                [
                    "rg",
                    "-i",
                    "-C", "1",      # 前後各 1 行
                    "--type", "md",
                    query,
                    str(ENTRIES_PATH),
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )

            # 解析片段...

        except subprocess.TimeoutExpired:
            pass  # 搜尋逾時，回退到全部列出

    # 遍歷索引，套用過濾條件
    for entry in index.entries:
        # 檔案內容過濾
        if matching_files is not None and entry.filename not in matching_files:
            continue

        # Scope 過濾
        if entry.scope == "personal" and entry.owner != current_username:
            continue

        # 其他過濾條件...

        results.append(...)

    return KnowledgeListResponse(items=results, total=len(results), query=query)
```

### 搜尋流程

```
用戶輸入關鍵字
       │
       ▼
┌─────────────────────────────────────┐
│ ripgrep 全文搜尋                     │
│ rg -i -l --type md "關鍵字" entries/ │
└─────────────────────────────────────┘
       │
       ▼
取得匹配的檔案清單
       │
       ▼
┌─────────────────────────────────────┐
│ 載入 index.json                      │
│ 套用過濾條件（scope、category 等）    │
└─────────────────────────────────────┘
       │
       ▼
回傳結果列表
```

---

## 建立知識

```python
def create_knowledge(
    data: KnowledgeCreate,
    owner: str | None = None,
    project_id: str | None = None,
) -> KnowledgeResponse:
    """建立新知識"""
    index = _load_index()

    # 分配 ID
    kb_id = f"kb-{index.next_id:03d}"
    index.next_id += 1

    # 產生 slug（URL 友善名稱）
    slug = data.slug or _slugify(data.title)
    if not slug:
        slug = f"knowledge-{index.next_id}"

    # 確保 slug 唯一
    existing_slugs = {e.filename.split("-", 2)[-1].replace(".md", "") for e in index.entries}
    while slug in existing_slugs:
        slug = f"{slug}-{counter}"
        counter += 1

    # 檔名：kb-001-my-knowledge.md
    filename = f"{kb_id}-{slug}.md"
    file_path = ENTRIES_PATH / filename

    # 準備元資料
    today = date.today()
    metadata = {
        "id": kb_id,
        "title": data.title,
        "type": data.type,
        "category": data.category,
        "scope": data.scope,
        "owner": owner if data.scope == "personal" else None,
        "project_id": project_id if data.scope == "project" else None,
        "tags": {...},
        "author": data.author,
        "created_at": today.isoformat(),
        "updated_at": today.isoformat(),
    }

    # 產生檔案內容
    front_matter = _generate_front_matter(metadata)
    file_content = front_matter + data.content

    # 寫入檔案
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(file_content)

    # 更新索引
    index.entries.append(IndexEntry(...))
    _save_index(index)

    return get_knowledge(kb_id)
```

---

## Git 版本管理

### 版本歷史查詢

```python
def get_history(kb_id: str) -> HistoryResponse:
    """取得知識的版本歷史"""
    file_path = _find_knowledge_file(kb_id)
    if not file_path:
        raise KnowledgeNotFoundError(f"知識 {kb_id} 不存在")

    try:
        result = subprocess.run(
            [
                "git", "log",
                "--format=%H|%an|%ai|%s",  # hash|author|date|message
                "--",
                str(file_path),
            ],
            capture_output=True,
            text=True,
            cwd=KNOWLEDGE_BASE_PATH,
        )

        entries = []
        for line in result.stdout.strip().split("\n"):
            if line:
                parts = line.split("|", 3)
                entries.append(HistoryEntry(
                    commit=parts[0],
                    author=parts[1],
                    date=parts[2],
                    message=parts[3] if len(parts) > 3 else "",
                ))

        return HistoryResponse(id=kb_id, entries=entries)

    except Exception as e:
        raise KnowledgeError(f"取得歷史失敗：{e}") from e
```

### 查看特定版本

```python
def get_version(kb_id: str, commit: str) -> VersionResponse:
    """取得知識的特定版本內容"""
    file_path = _find_knowledge_file(kb_id)

    result = subprocess.run(
        ["git", "show", f"{commit}:{file_path.name}"],
        capture_output=True,
        text=True,
        cwd=ENTRIES_PATH,
    )

    return VersionResponse(
        id=kb_id,
        commit=commit,
        content=result.stdout,
    )
```

---

## 使用範例

### 透過 MCP 工具建立知識

```
用戶：記一下水切爐的標準溫度是 850°C

AI：（調用 add_note）
AI：✅ 筆記已新增！
    ID：kb-042
    標題：水切爐標準溫度
    範圍：個人知識
```

### 搜尋知識

```
用戶：找水切爐相關的知識

AI：（調用 search_knowledge）
AI：搜尋「水切爐」找到 3 筆結果：

    📄 [kb-042] 水切爐標準溫度
       分類：note | 標籤：水切爐
       摘要：水切爐的標準操作溫度為 850°C...

    📄 [kb-015] 水切爐 SOP
       分類：operations | 標籤：水切爐, SOP
       摘要：標準作業程序...
```

---

## 小結

Markdown 知識庫系統的關鍵設計：

| 特性 | 實作方式 |
|------|----------|
| **格式** | YAML Front Matter + Markdown |
| **儲存** | 檔案系統，每個知識一個 .md 檔 |
| **索引** | index.json 支援快速過濾 |
| **搜尋** | ripgrep 全文搜尋 |
| **版本** | Git 追蹤修改歷史 |
| **權限** | Scope 機制（global/personal/project） |

下一篇 [知識庫公開分享功能實作]({% post_url 2026-01-12-knowledge-sharing %}) 會介紹如何將知識分享給外部使用者。

---

## 參考資源

- [FastMCP 知識庫工具]({% post_url 2026-01-06-fastmcp-knowledge-tools %})
- [MCP 工具權限控制]({% post_url 2026-01-07-mcp-permission %})
- [YAML Front Matter 規格](https://jekyllrb.com/docs/front-matter/)
- [ripgrep 官方文件](https://github.com/BurntSushi/ripgrep)
