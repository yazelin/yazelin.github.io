---
layout: post
title: "內部專案管理系統：資料模型設計"
subtitle: "完整的專案、成員、里程碑、會議資料表規劃"
date: 2026-01-08
categories: [ChingTech OS]
tags: [專案管理, PostgreSQL, 資料庫設計, Python, ChingTech OS]
---

## 前言

在前面的 MCP 工具系列中，我們使用了專案管理的各種功能。這篇來完整介紹專案管理系統的**資料模型設計**，包括：

- 專案基本資訊
- 成員管理（內部/外部）
- 里程碑追蹤
- 會議記錄
- 附件與連結
- 發包期程

這些資料表是 [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %}) 和 [MCP 工具權限控制]({% post_url 2026-01-07-mcp-permission %}) 的基礎。

---

## 整體架構

```
                    ┌─────────────────┐
                    │    projects     │
                    │    （專案）      │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ project_      │  │ project_      │  │ project_      │
│ members       │  │ milestones    │  │ meetings      │
│ （成員）       │  │ （里程碑）     │  │ （會議）       │
└───────────────┘  └───────────────┘  └───────────────┘
        │
        ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ project_      │  │ project_      │  │ delivery_     │
│ attachments   │  │ links         │  │ schedules     │
│ （附件）       │  │ （連結）       │  │ （發包期程）   │
└───────────────┘  └───────────────┘  └───────────────┘
```

---

## 專案主表

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(256) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    created_by VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_name ON projects(name);
```

### 狀態定義

| 狀態 | 說明 |
|------|------|
| `active` | 進行中 |
| `completed` | 已完成 |
| `on_hold` | 暫停 |
| `cancelled` | 已取消 |

### Pydantic Model

```python
class ProjectBase(BaseModel):
    """專案基礎欄位"""
    name: str
    description: str | None = None
    status: str = "active"
    start_date: date | None = None
    end_date: date | None = None


class ProjectResponse(ProjectBase):
    """專案回應"""
    id: UUID
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None
```

---

## 專案成員

```sql
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    role VARCHAR(128),
    company VARCHAR(128),
    email VARCHAR(256),
    phone VARCHAR(64),
    notes TEXT,
    is_internal BOOLEAN DEFAULT true,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);
```

### 欄位說明

| 欄位 | 說明 |
|------|------|
| `is_internal` | true=內部員工，false=外部聯絡人（客戶/廠商） |
| `user_id` | 關聯的 CTOS 用戶帳號（用於權限控制） |
| `company` | 公司名稱（外部聯絡人使用） |

### 內部 vs 外部人員

```python
class ProjectMemberBase(BaseModel):
    """專案成員基礎欄位"""
    name: str
    role: str | None = None
    company: str | None = None      # 外部聯絡人的公司
    email: str | None = None
    phone: str | None = None
    notes: str | None = None
    is_internal: bool = True        # 內部/外部區分
    user_id: int | None = None      # 綁定 CTOS 帳號
```

### 使用範例

```python
# 內部人員
internal_member = ProjectMemberCreate(
    name="張三",
    role="專案經理",
    is_internal=True,
    user_id=1,  # 綁定 CTOS 帳號
)

# 外部聯絡人（客戶）
external_contact = ProjectMemberCreate(
    name="李四",
    role="業務窗口",
    company="ABC 公司",
    email="lee@abc.com",
    phone="02-1234-5678",
    is_internal=False,
)
```

---

## 專案里程碑

```sql
CREATE TABLE project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(256) NOT NULL,
    milestone_type VARCHAR(32) DEFAULT 'custom',
    planned_date DATE,
    actual_date DATE,
    status VARCHAR(32) DEFAULT 'pending',
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_milestones_project ON project_milestones(project_id);
CREATE INDEX idx_project_milestones_status ON project_milestones(status);
```

### 里程碑類型

| 類型 | 說明 | 適用場景 |
|------|------|----------|
| `design` | 設計 | 設計審查、圖面完成 |
| `manufacture` | 製造 | 加工完成、組裝完成 |
| `delivery` | 交貨 | 出貨、到貨 |
| `field_test` | 現場測試 | 安裝測試、試車 |
| `acceptance` | 驗收 | 客戶驗收 |
| `custom` | 自訂 | 其他自訂里程碑 |

### 狀態定義

| 狀態 | Emoji | 說明 |
|------|-------|------|
| `pending` | ⏳ | 待處理 |
| `in_progress` | 🔄 | 進行中 |
| `completed` | ✅ | 已完成 |
| `delayed` | ⚠️ | 延遲 |

### Pydantic Model

```python
class ProjectMilestoneBase(BaseModel):
    """里程碑基礎欄位"""
    name: str
    milestone_type: str = "custom"
    planned_date: date | None = None
    actual_date: date | None = None
    status: str = "pending"
    notes: str | None = None
    sort_order: int = 0
```

---

## 會議記錄

```sql
CREATE TABLE project_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(256) NOT NULL,
    meeting_date TIMESTAMP NOT NULL,
    location VARCHAR(256),
    attendees TEXT[],
    content TEXT,
    created_by VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_meetings_project ON project_meetings(project_id);
CREATE INDEX idx_project_meetings_date ON project_meetings(meeting_date);
```

### 欄位說明

| 欄位 | 類型 | 說明 |
|------|------|------|
| `attendees` | TEXT[] | PostgreSQL 陣列，儲存參與者名單 |
| `content` | TEXT | 會議內容（支援 Markdown） |
| `location` | VARCHAR | 地點（實體/線上會議連結） |

### Pydantic Model

```python
class ProjectMeetingBase(BaseModel):
    """會議記錄基礎欄位"""
    title: str
    meeting_date: datetime
    location: str | None = None
    attendees: list[str] = Field(default_factory=list)
    content: str | None = None
```

---

## 專案附件

```sql
CREATE TABLE project_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(256) NOT NULL,
    file_type VARCHAR(64),
    file_size BIGINT,
    storage_path TEXT NOT NULL,
    description TEXT,
    uploaded_by VARCHAR(64),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_attachments_project ON project_attachments(project_id);
```

### 儲存設計

附件檔案儲存在 NAS，資料庫只記錄路徑：

```
NAS/projects/
├── {project_id}/
│   └── attachments/
│       ├── {uuid}_設計圖.pdf
│       ├── {uuid}_規格書.xlsx
│       └── ...
```

### Pydantic Model

```python
class ProjectAttachmentBase(BaseModel):
    """專案附件基礎欄位"""
    filename: str
    file_type: str | None = None
    file_size: int | None = None
    storage_path: str
    description: str | None = None
```

---

## 專案連結

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

### 連結類型判斷

```python
class ProjectLinkResponse(ProjectLinkBase):
    """專案連結回應"""
    id: UUID
    project_id: UUID
    created_at: datetime

    @property
    def link_type(self) -> str:
        """自動判斷連結類型"""
        if self.url.startswith("/") or self.url.startswith("nas://"):
            return "nas"     # NAS 路徑
        return "external"    # 外部連結
```

---

## 專案詳情回應

查詢專案詳情時，會包含所有關聯資料：

```python
class ProjectDetailResponse(ProjectResponse):
    """專案詳情回應（包含關聯資料）"""
    members: list[ProjectMemberResponse] = Field(default_factory=list)
    meetings: list[ProjectMeetingListItem] = Field(default_factory=list)
    attachments: list[ProjectAttachmentResponse] = Field(default_factory=list)
    links: list[ProjectLinkResponse] = Field(default_factory=list)
    milestones: list[ProjectMilestoneResponse] = Field(default_factory=list)
    deliveries: list[DeliveryScheduleResponse] = Field(default_factory=list)
```

### API 回應範例

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "水切爐改善",
  "status": "active",
  "start_date": "2025-12-01",
  "members": [
    {"name": "張三", "role": "專案經理", "is_internal": true},
    {"name": "李四", "role": "業務窗口", "company": "ABC公司", "is_internal": false}
  ],
  "milestones": [
    {"name": "設計審查", "status": "completed", "planned_date": "2025-12-15"},
    {"name": "試車", "status": "pending", "planned_date": "2026-01-15"}
  ],
  "meetings": [
    {"title": "專案啟動會議", "meeting_date": "2025-12-01T10:00:00"}
  ]
}
```

---

## 專案列表項目

列表查詢時使用精簡版：

```python
class ProjectListItem(BaseModel):
    """專案列表項目"""
    id: UUID
    name: str
    status: str
    start_date: date | None = None
    end_date: date | None = None
    updated_at: datetime
    member_count: int = 0       # 成員數量
    meeting_count: int = 0      # 會議數量
    attachment_count: int = 0   # 附件數量
```

---

## 小結

專案管理系統的資料模型包含：

| 資料表 | 用途 |
|--------|------|
| `projects` | 專案主表 |
| `project_members` | 成員（內部/外部） |
| `project_milestones` | 里程碑追蹤 |
| `project_meetings` | 會議記錄 |
| `project_attachments` | 附件管理 |
| `project_links` | 相關連結 |
| `delivery_schedules` | 發包期程 |

下一篇 [發包期程管理功能實作]({% post_url 2026-01-09-delivery-schedule %}) 會詳細介紹發包期程的資料表和 MCP 工具。

---

## 參考資源

- [FastMCP 專案管理工具]({% post_url 2026-01-05-fastmcp-project-tools %})
- [MCP 工具權限控制]({% post_url 2026-01-07-mcp-permission %})
- [Line Bot 群組專案綁定]({% post_url 2026-01-02-linebot-part4-group-project %})
