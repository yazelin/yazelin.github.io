---
layout: post
title: "知識庫公開分享功能實作"
subtitle: "安全地將內部資源分享給外部使用者"
date: 2026-01-12
categories: [ChingTech OS]
tags: [分享, Token, FastAPI, 安全性, Python, ChingTech OS]
---

![知識庫公開分享功能實作](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-12-knowledge-sharing.png)

## 前言

在 [Markdown 知識庫系統設計]({% post_url 2026-01-11-knowledge-base %}) 中，我們建立了企業內部的知識庫。但有時需要將知識分享給外部使用者（客戶、合作夥伴），這篇來實作**公開分享連結**功能：

- 產生短網址分享知識、專案、檔案
- Token 驗證確保安全
- 可設定有效期限
- 存取次數追蹤

---

## 系統架構

```
用戶（內部）                              用戶（外部）
     │                                       │
     │ 建立分享連結                           │ 存取連結
     ▼                                       ▼
┌─────────────────┐                   ┌─────────────────┐
│  POST /api/share │                   │ GET /api/public/ │
│  （需要登入）     │                   │ {token}          │
└────────┬────────┘                   │ （無需登入）      │
         │                            └────────┬────────┘
         ▼                                     ▼
┌─────────────────────────────────────────────────────────┐
│                   public_share_links                     │
│  token | resource_type | resource_id | expires_at | ...  │
└─────────────────────────────────────────────────────────┘
```

---

## 資料表設計

```sql
CREATE TABLE public_share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(16) NOT NULL UNIQUE,       -- 短 token
    resource_type VARCHAR(32) NOT NULL,      -- knowledge, project, nas_file, project_attachment
    resource_id TEXT NOT NULL,               -- 資源識別碼
    created_by VARCHAR(64) NOT NULL,         -- 建立者
    expires_at TIMESTAMP WITH TIME ZONE,     -- 過期時間（NULL 表示永久）
    access_count INTEGER DEFAULT 0,          -- 存取次數
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_share_links_token ON public_share_links(token);
CREATE INDEX idx_share_links_created_by ON public_share_links(created_by);
```

### 支援的資源類型

| 類型 | 說明 | resource_id 格式 |
|------|------|------------------|
| `knowledge` | 知識庫文件 | kb-001 |
| `project` | 專案資訊 | UUID |
| `nas_file` | NAS 檔案 | 檔案路徑 |
| `project_attachment` | 專案附件 | 附件 UUID |

---

## Pydantic 模型

### 建立連結請求

```python
class ShareLinkCreate(BaseModel):
    """建立分享連結請求"""

    resource_type: Literal["knowledge", "project", "nas_file", "project_attachment"]
    resource_id: str
    expires_in: str | None = "24h"  # 1h, 24h, 7d, null（永久）
```

### 連結回應

```python
class ShareLinkResponse(BaseModel):
    """分享連結回應"""

    token: str
    url: str                    # /s/{token}
    full_url: str               # https://xxx.com/s/{token}
    resource_type: str
    resource_id: str
    resource_title: str
    expires_at: datetime | None
    access_count: int = 0
    created_at: datetime
    created_by: str | None = None
    is_expired: bool = False
```

### 公開資源回應

```python
class PublicResourceResponse(BaseModel):
    """公開資源回應"""

    type: Literal["knowledge", "project", "nas_file", "project_attachment"]
    data: dict[str, Any]        # 資源內容
    shared_by: str
    shared_at: datetime
    expires_at: datetime | None
```

---

## Token 產生

使用加密安全的隨機產生器產生 6 字元 Token：

```python
import secrets
import string

def generate_token(length: int = 6) -> str:
    """產生隨機 token

    使用加密安全的隨機產生器
    """
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
```

### 為什麼選 6 字元？

| 長度 | 組合數 | 碰撞機率（10萬筆） |
|------|--------|-------------------|
| 4 | 1,400 萬 | 0.7% |
| 6 | 568 億 | < 0.0001% |
| 8 | 218 兆 | 極低 |

6 字元在安全性和易用性之間取得平衡。

---

## 有效期設定

```python
def parse_expires_in(expires_in: str | None) -> datetime | None:
    """解析有效期設定

    Args:
        expires_in: 1h, 24h, 7d, null（永久）

    Returns:
        過期時間（UTC），None 表示永久
    """
    if expires_in is None or expires_in == "null":
        return None

    now = datetime.now(timezone.utc)

    if expires_in == "1h":
        return now + timedelta(hours=1)
    elif expires_in == "24h":
        return now + timedelta(hours=24)
    elif expires_in == "7d":
        return now + timedelta(days=7)
    else:
        # 預設 24 小時
        return now + timedelta(hours=24)
```

### 有效期選項

| 選項 | 適用場景 |
|------|----------|
| `1h` | 一次性分享、敏感資料 |
| `24h` | 日常分享（預設） |
| `7d` | 長期協作 |
| `null` | 永久連結（謹慎使用） |

---

## 建立分享連結

### 服務層

```python
async def create_share_link(
    data: ShareLinkCreate,
    created_by: str,
) -> ShareLinkResponse:
    """建立分享連結"""
    # 驗證資源存在
    resource_title = await get_resource_title(data.resource_type, data.resource_id)

    async with get_connection() as conn:
        # 嘗試產生唯一 token（最多 10 次）
        for _ in range(10):
            token = generate_token()
            # 檢查是否已存在
            existing = await conn.fetchval(
                "SELECT 1 FROM public_share_links WHERE token = $1",
                token,
            )
            if not existing:
                break
        else:
            raise ShareError("無法產生唯一的 token")

        # 計算過期時間
        expires_at = parse_expires_in(data.expires_in)

        # 儲存到資料庫
        now = datetime.now(timezone.utc)
        row = await conn.fetchrow(
            """
            INSERT INTO public_share_links
            (token, resource_type, resource_id, created_by, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            """,
            token, data.resource_type, data.resource_id,
            created_by, expires_at, now,
        )

        return ShareLinkResponse(
            token=row["token"],
            url=f"/s/{row['token']}",
            full_url=get_full_url(row["token"]),
            resource_type=row["resource_type"],
            resource_id=row["resource_id"],
            resource_title=resource_title,
            expires_at=row["expires_at"],
            access_count=row["access_count"],
            created_at=row["created_at"],
        )
```

### API 端點

```python
@router.post(
    "",
    response_model=ShareLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="建立分享連結",
)
async def create_link(
    data: ShareLinkCreate,
    session: SessionData = Depends(get_current_session),
) -> ShareLinkResponse:
    """建立公開分享連結

    只有資源擁有者或有編輯權限的人可以建立連結。
    """
    # 權限檢查
    if data.resource_type == "knowledge":
        knowledge = get_knowledge(data.resource_id)
        preferences = await get_user_preferences(session.user_id)
        if not check_knowledge_permission(
            session.username, preferences, knowledge.owner, knowledge.scope, "write"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="您沒有分享此知識的權限",
            )

    elif data.resource_type == "nas_file":
        # 驗證 NAS 檔案存在且在允許範圍內
        validate_nas_file_path(data.resource_id)

    return await create_share_link(data, session.username)
```

---

## 存取公開資源

### 公開 API（無需登入）

```python
# 無需登入的公開 API
public_router = APIRouter(prefix="/api/public", tags=["public"])


@public_router.get(
    "/{token}",
    response_model=PublicResourceResponse,
    summary="取得公開資源",
)
async def get_resource(token: str) -> PublicResourceResponse:
    """取得公開分享的資源內容

    無需登入即可存取。
    """
    try:
        return await get_public_resource(token)
    except ShareLinkNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="連結不存在或已被撤銷",
        )
    except ShareLinkExpiredError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="此連結已過期",
        )
```

### 取得公開資源服務

```python
async def get_public_resource(token: str) -> PublicResourceResponse:
    """取得公開資源"""
    async with get_connection() as conn:
        # 查詢連結
        row = await conn.fetchrow(
            """
            SELECT token, resource_type, resource_id, created_by, expires_at, created_at
            FROM public_share_links
            WHERE token = $1
            """,
            token,
        )

        if not row:
            raise ShareLinkNotFoundError("連結不存在或已被撤銷")

        # 檢查是否過期
        now = datetime.now(timezone.utc)
        if row["expires_at"] and row["expires_at"] < now:
            raise ShareLinkExpiredError("此連結已過期")

        # 更新存取次數
        await conn.execute(
            "UPDATE public_share_links SET access_count = access_count + 1 WHERE token = $1",
            token,
        )

        # 取得資源內容
        resource_type = row["resource_type"]
        resource_id = row["resource_id"]

        if resource_type == "knowledge":
            knowledge = get_knowledge(resource_id)
            data = {
                "id": knowledge.id,
                "title": knowledge.title,
                "content": knowledge.content,
                "attachments": [...],
                "created_at": knowledge.created_at.isoformat(),
                "updated_at": knowledge.updated_at.isoformat(),
            }

        elif resource_type == "project":
            project = await get_project(UUID(resource_id))
            # 只顯示安全的資訊
            data = {
                "id": str(project.id),
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "milestones": [...],
                "members": [{"name": m.name, "role": m.role} for m in project.members],
            }

        elif resource_type == "nas_file":
            full_path = validate_nas_file_path(resource_id)
            data = {
                "file_name": full_path.name,
                "file_size_str": format_size(full_path.stat().st_size),
                "download_url": f"/api/public/{token}/download",
            }

        return PublicResourceResponse(
            type=resource_type,
            data=data,
            shared_by=row["created_by"],
            shared_at=row["created_at"],
            expires_at=row["expires_at"],
        )
```

---

## 附件與檔案下載

### 知識庫附件

```python
@public_router.get(
    "/{token}/attachments/{path:path}",
    summary="取得公開資源的附件",
)
async def get_public_attachment(token: str, path: str) -> Response:
    """取得公開資源的附件

    僅限知識庫附件，無需登入。
    """
    # 驗證 token 有效
    link_info = await get_link_info(token)

    # 只支援知識庫附件
    if link_info["resource_type"] != "knowledge":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="此資源類型不支援附件",
        )

    kb_id = link_info["resource_id"]
    filename = path.split("/")[-1]

    # 驗證附件路徑是否屬於該知識庫
    if not filename.startswith(f"{kb_id}-"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="無權存取此附件",
        )

    # 讀取並回傳檔案...
```

### 檔案下載

```python
@public_router.get(
    "/{token}/download",
    summary="下載檔案",
)
async def download_shared_file(token: str) -> Response:
    """透過分享連結下載檔案

    支援 nas_file 和 project_attachment 類型。
    """
    link_info = await get_link_info(token)
    resource_type = link_info["resource_type"]

    if resource_type == "nas_file":
        file_path = link_info["resource_id"]
        full_path = validate_nas_file_path(file_path)
        content = full_path.read_bytes()
        filename = full_path.name

    elif resource_type == "project_attachment":
        attachment_id = link_info["resource_id"]
        content, filename = await get_attachment_content(attachment_id)

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="此連結不是檔案下載連結",
        )

    # 處理檔名編碼（支援中文）
    encoded_filename = quote(filename)

    # 圖片用 inline，其他用 attachment
    is_image = mime_type and mime_type.startswith("image/")
    disposition = "inline" if is_image else "attachment"

    return Response(
        content=content,
        media_type=mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{encoded_filename}",
        },
    )
```

---

## 連結管理

### 列出我的連結

```python
@router.get(
    "",
    response_model=ShareLinkListResponse,
    summary="列出分享連結",
)
async def list_links(
    view: str = "mine",
    session: SessionData = Depends(get_current_session),
) -> ShareLinkListResponse:
    """列出分享連結

    Args:
        view: "mine" 只顯示自己的，"all" 顯示全部（僅管理員）
    """
    user_is_admin = is_admin(session.username)

    if view == "all" and user_is_admin:
        result = await list_all_links()
    else:
        result = await list_my_links(session.username)

    result.is_admin = user_is_admin
    return result
```

### 撤銷連結

```python
@router.delete(
    "/{token}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="撤銷分享連結",
)
async def delete_link(
    token: str,
    session: SessionData = Depends(get_current_session),
) -> None:
    """撤銷分享連結

    連結建立者或管理員可以撤銷。
    """
    await revoke_link(token, session.username, is_admin(session.username))
```

### 自動清理過期連結

```python
async def cleanup_expired_links() -> int:
    """清理過期的分享連結

    刪除所有 expires_at < 當前時間 的連結。
    永久連結（expires_at 為 NULL）不會被刪除。

    Returns:
        刪除的連結數量
    """
    async with get_connection() as conn:
        now = datetime.now(timezone.utc)
        result = await conn.execute(
            """
            DELETE FROM public_share_links
            WHERE expires_at IS NOT NULL AND expires_at < $1
            """,
            now,
        )
        # result 格式為 "DELETE N"
        deleted_count = int(result.split()[-1]) if result else 0
        return deleted_count
```

---

## 安全性考量

### 路徑穿越防護

```python
def validate_nas_file_path(file_path: str) -> Path:
    """驗證 NAS 檔案路徑"""
    projects_path = Path(settings.projects_mount_path)

    # 正規化路徑
    full_path = (projects_path / file_path).resolve()

    # 安全檢查：確保路徑在允許範圍內
    if not str(full_path).startswith(str(projects_path.resolve())):
        raise NasFileAccessDenied(f"不允許存取此路徑：{file_path}")

    if not full_path.exists():
        raise NasFileNotFoundError(f"檔案不存在：{file_path}")

    return full_path
```

### 附件存取驗證

```python
# 驗證附件路徑是否屬於該知識庫
if not path.startswith(f"attachments/{kb_id}/"):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="無權存取此附件",
    )
```

### 權限控制

- 建立連結需要登入且有編輯權限
- 存取連結無需登入（方便外部使用者）
- 撤銷連結只有建立者或管理員可以

---

## 使用流程

```
內部使用者                              外部使用者
    │                                      │
    │ 1. 找到要分享的知識/專案               │
    │ 2. 點擊「分享」按鈕                    │
    │ 3. 選擇有效期                         │
    │                                      │
    ▼                                      │
┌─────────────────────────┐               │
│ 產生分享連結              │               │
│ https://xxx.com/s/Ab3Xyz │               │
└─────────────────────────┘               │
    │                                      │
    │ 4. 複製連結發送給外部使用者            │
    ├──────────────────────────────────────►
    │                                      │
    │                                      │ 5. 點擊連結
    │                                      │
    │                              ┌───────▼───────┐
    │                              │ 檢查 Token    │
    │                              │ 檢查有效期    │
    │                              │ 記錄存取次數  │
    │                              └───────┬───────┘
    │                                      │
    │                                      │ 6. 顯示內容
    │                                      ▼
    │                              ┌───────────────┐
    │                              │ 公開檢視頁面  │
    │                              └───────────────┘
```

---

## 小結

公開分享連結功能的關鍵設計：

| 特性 | 實作方式 |
|------|----------|
| **短網址** | 6 字元隨機 Token |
| **有效期** | 1h / 24h / 7d / 永久 |
| **存取追蹤** | access_count 計數 |
| **安全性** | 路徑驗證、權限檢查 |
| **管理** | 列出、撤銷、自動清理 |

API 端點：

| 端點 | 功能 | 登入需求 |
|------|------|----------|
| `POST /api/share` | 建立連結 | 需要 |
| `GET /api/share` | 列出我的連結 | 需要 |
| `DELETE /api/share/{token}` | 撤銷連結 | 需要 |
| `GET /api/public/{token}` | 存取公開資源 | 不需要 |
| `GET /api/public/{token}/download` | 下載檔案 | 不需要 |

下一篇 [手機版 App 佈局優化實戰]({% post_url 2026-01-13-mobile-layout %}) 會介紹如何優化 PWA 在手機上的使用體驗。

---

## 參考資源

- [Markdown 知識庫系統設計]({% post_url 2026-01-11-knowledge-base %})
- [專案附件與連結管理]({% post_url 2026-01-10-project-attachments %})
- [FastAPI 官方文件](https://fastapi.tiangolo.com/)
