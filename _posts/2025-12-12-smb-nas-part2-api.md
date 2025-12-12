---
layout: post
title: "檔案管理 API：FastAPI 實作上傳下載刪除"
subtitle: "RESTful API 操作 NAS 檔案的完整指南"
date: 2025-12-12
categories: [SMB/NAS]
tags: [FastAPI, REST API, 檔案管理, Python, NAS]
---

> **📚 SMB/NAS 檔案系統系列**
> 1. [SMB 協定入門：用 Python 連接公司 NAS]({% post_url 2025-12-12-smb-nas-part1-protocol %})
> 2. **檔案管理 API：FastAPI 實作上傳下載刪除** ← 目前閱讀
>
> **📖 前置知識**：[Linux 終端機入門]({% post_url 2025-12-13-linux-basics %})

---

## 這篇文章要解決什麼問題？

上一篇我們用 `smbprotocol` 實作了 NAS 檔案操作，但那是 Python 程式碼。前端 JavaScript 怎麼呼叫？

這篇我們要把 SMB 操作包裝成 **RESTful API**，讓前端可以：

- 瀏覽資料夾：`GET /api/nas/browse?path=/home/文件`
- 下載檔案：`GET /api/nas/download?path=/home/文件/報告.pdf`
- 上傳檔案：`POST /api/nas/upload`
- 刪除檔案：`DELETE /api/nas/file`
- 重命名：`PATCH /api/nas/rename`
- 建立資料夾：`POST /api/nas/mkdir`

**業務**：「我在客戶那邊，急需一份報價單，但我的 Mac 連不上公司 NAS！」

**倉管**：「我用平板盤點，想直接上傳照片到 NAS，但平板沒辦法設定網路磁碟機...」

**老闆**：「怎麼什麼裝置都有問題？」

**後端工程師**：「因為 SMB 協定對不同裝置支援度不一樣。我們做成 Web API，不管 Mac、平板還是手機，開瀏覽器就能存取。」

**業務**：「太好了，這樣我在外面也能即時調檔案給客戶！」

---

## 技術概念

### 路徑設計

所有 API 的路徑採用統一格式：

```
/共享名稱/子資料夾/檔案名稱
│        │        └── 檔案
│        └── 子路徑（可多層）
└── SMB 共享名稱

範例：
/home/文件/報告.pdf
/共用區/2024/Q4/財報.xlsx
```

內部解析成兩部分：
- `share_name`: `home`
- `sub_path`: `文件/報告.pdf`

### 認證流程

```
前端請求
    │
    │ Authorization: Bearer <token>
    ▼
FastAPI → 驗證 token → 從 Session 取得 NAS 帳密
    │
    │ username, password
    ▼
SMBService → 連接 NAS → 執行操作
```

密碼不存資料庫，只存在 Session 記憶體中，8 小時後自動清除。

---

## 跟著做：Step by Step

### Step 1：定義 Pydantic Models

```python
# models/nas.py
from pydantic import BaseModel

class ShareInfo(BaseModel):
    """共享資訊"""
    name: str
    type: str  # "disk"


class SharesResponse(BaseModel):
    """列出共享回應"""
    shares: list[ShareInfo]


class FileItem(BaseModel):
    """檔案/資料夾項目"""
    name: str
    type: str  # "file" or "directory"
    size: int | None = None
    modified: str | None = None


class BrowseResponse(BaseModel):
    """瀏覽資料夾回應"""
    path: str
    items: list[FileItem]


class DeleteRequest(BaseModel):
    """刪除請求"""
    path: str
    recursive: bool = False  # 是否遞迴刪除


class RenameRequest(BaseModel):
    """重命名請求"""
    path: str
    new_name: str


class MkdirRequest(BaseModel):
    """建立資料夾請求"""
    path: str


class OperationResponse(BaseModel):
    """操作回應"""
    success: bool
    message: str
```

### Step 2：路徑解析工具函數

```python
# api/nas.py
from fastapi import HTTPException, status

def _parse_path(path: str) -> tuple[str, str]:
    """解析路徑為 (share_name, sub_path)

    Args:
        path: 完整路徑，如 "/home/文件/報告.pdf"

    Returns:
        (share_name, sub_path) = ("home", "文件/報告.pdf")
    """
    path = path.strip("/")

    if not path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="請指定檔案路徑",
        )

    parts = path.split("/", 1)
    share_name = parts[0]
    sub_path = parts[1] if len(parts) > 1 else ""

    return share_name, sub_path
```

### Step 3：列出共享

```python
from fastapi import APIRouter, Depends
from services.smb import create_smb_service, SMBError, SMBConnectionError

router = APIRouter(prefix="/api/nas", tags=["nas"])


@router.get("/shares", response_model=SharesResponse)
async def list_shares(
    session: SessionData = Depends(get_current_session),
) -> SharesResponse:
    """列出 NAS 上的共享資料夾"""

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        with smb:
            shares = smb.list_shares()
            return SharesResponse(
                shares=[ShareInfo(name=s["name"], type=s["type"]) for s in shares]
            )
    except SMBConnectionError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="無法連線至檔案伺服器",
        )
    except SMBError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
```

### Step 4：瀏覽資料夾

```python
@router.get("/browse", response_model=BrowseResponse)
async def browse_directory(
    path: str = "/",
    session: SessionData = Depends(get_current_session),
) -> BrowseResponse:
    """瀏覽指定資料夾內容

    Args:
        path: 資料夾路徑，格式為 /share_name/folder/subfolder
    """
    share_name, sub_path = _parse_path(path)

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        with smb:
            items = smb.browse_directory(share_name, sub_path)
            return BrowseResponse(
                path=f"/{path.strip('/')}",
                items=[
                    FileItem(
                        name=item["name"],
                        type=item["type"],
                        size=item.get("size"),
                        modified=item.get("modified"),
                    )
                    for item in items
                ],
            )
    except SMBError as e:
        error_msg = str(e)
        if "權限" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限存取此資料夾",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
```

### Step 5：讀取檔案（預覽用）

```python
import mimetypes
from fastapi.responses import Response

def _get_mime_type(filename: str) -> str:
    """根據檔名取得 MIME 類型"""
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or "application/octet-stream"


@router.get("/file")
async def read_file(
    path: str,
    session: SessionData = Depends(get_current_session),
) -> Response:
    """讀取檔案內容（用於預覽）

    回傳檔案內容，瀏覽器會根據 Content-Type 顯示或下載。
    """
    share_name, sub_path = _parse_path(path)

    if not sub_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="請指定檔案路徑",
        )

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        with smb:
            content = smb.read_file(share_name, sub_path)
            mime_type = _get_mime_type(sub_path)

            return Response(
                content=content,
                media_type=mime_type,
            )
    except SMBError as e:
        error_msg = str(e)
        if "不存在" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="檔案不存在",
            )
        if "權限" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限讀取此檔案",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
```

### Step 6：下載檔案

```python
from urllib.parse import quote

@router.get("/download")
async def download_file(
    path: str,
    session: SessionData = Depends(get_current_session),
) -> Response:
    """下載檔案

    與 read_file 的差別是加了 Content-Disposition header，
    瀏覽器會彈出下載對話框而非直接顯示。
    """
    share_name, sub_path = _parse_path(path)

    if not sub_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="請指定檔案路徑",
        )

    # 取得檔名（最後一段）
    filename = sub_path.split("/")[-1]

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        with smb:
            content = smb.read_file(share_name, sub_path)
            mime_type = _get_mime_type(filename)

            # 處理中文檔名編碼
            encoded_filename = quote(filename)

            return Response(
                content=content,
                media_type=mime_type,
                headers={
                    # RFC 5987 格式，支援中文檔名
                    "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                },
            )
    except SMBError as e:
        # ... 錯誤處理同上 ...
```

### Step 7：上傳檔案

```python
from typing import Annotated
from fastapi import File, Form, UploadFile

@router.post("/upload", response_model=OperationResponse)
async def upload_file(
    path: Annotated[str, Form(description="目標資料夾路徑")],
    file: UploadFile = File(...),
    session: SessionData = Depends(get_current_session),
) -> OperationResponse:
    """上傳檔案

    使用 multipart/form-data 格式。

    Args:
        path: 目標資料夾路徑（不含檔名）
        file: 上傳的檔案
    """
    share_name, sub_path = _parse_path(path)

    # 組合完整檔案路徑
    filename = file.filename or "unnamed"
    file_path = f"{sub_path}/{filename}" if sub_path else filename

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        # 讀取上傳的檔案內容
        content = await file.read()

        with smb:
            smb.write_file(share_name, file_path, content)
            return OperationResponse(success=True, message="上傳成功")

    except SMBError as e:
        error_msg = str(e)
        if "權限" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限上傳檔案",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
```

### Step 8：刪除檔案/資料夾

```python
@router.delete("/file", response_model=OperationResponse)
async def delete_file(
    request: DeleteRequest,
    session: SessionData = Depends(get_current_session),
) -> OperationResponse:
    """刪除檔案或資料夾

    Args:
        request.path: 要刪除的路徑
        request.recursive: 是否遞迴刪除（非空資料夾需要）
    """
    share_name, sub_path = _parse_path(request.path)

    if not sub_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無法刪除共享根目錄",
        )

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        with smb:
            smb.delete_item(share_name, sub_path, recursive=request.recursive)
            return OperationResponse(success=True, message="刪除成功")

    except SMBError as e:
        error_msg = str(e)
        if "不存在" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="檔案或資料夾不存在",
            )
        if "不是空的" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="資料夾不是空的，請使用 recursive=true",
            )
        if "權限" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限刪除此項目",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
```

### Step 9：重命名和建立資料夾

```python
@router.patch("/rename", response_model=OperationResponse)
async def rename_item(
    request: RenameRequest,
    session: SessionData = Depends(get_current_session),
) -> OperationResponse:
    """重命名檔案或資料夾"""
    share_name, sub_path = _parse_path(request.path)

    if not sub_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無法重命名共享根目錄",
        )

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        with smb:
            smb.rename_item(share_name, sub_path, request.new_name)
            return OperationResponse(success=True, message="重命名成功")
    except SMBError as e:
        if "已存在" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="目標名稱已存在",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/mkdir", response_model=OperationResponse)
async def create_directory(
    request: MkdirRequest,
    session: SessionData = Depends(get_current_session),
) -> OperationResponse:
    """建立資料夾"""
    share_name, sub_path = _parse_path(request.path)

    if not sub_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="請指定資料夾名稱",
        )

    smb = create_smb_service(
        username=session.username,
        password=session.password,
    )

    try:
        with smb:
            smb.create_directory(share_name, sub_path)
            return OperationResponse(success=True, message="建立成功")
    except SMBError as e:
        if "已存在" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="資料夾已存在",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
```

---

## 進階技巧與踩坑紀錄

### 1. Query Parameter 認證（用於 img/iframe）

有些場景無法設定 Authorization header，例如：

```html
<!-- img src 無法帶 header -->
<img src="/api/nas/file?path=/home/photo.jpg">
```

解決方案：允許 query parameter 傳 token：

```python
from fastapi import Query

async def get_session_from_token_or_query(
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> SessionData:
    """從 header 或 query 取得 session"""

    # 優先使用 header
    if authorization and authorization.startswith("Bearer "):
        actual_token = authorization[7:]
    elif token:
        actual_token = token
    else:
        raise HTTPException(status_code=401, detail="未授權")

    return get_session(actual_token)


@router.get("/file")
async def read_file(
    path: str,
    session: SessionData = Depends(get_session_from_token_or_query),
):
    # ...
```

前端使用：

```html
<img src="/api/nas/file?path=/home/photo.jpg&token=xxx">
```

### 2. 中文檔名處理

下載檔案時，中文檔名要特殊編碼：

```python
from urllib.parse import quote

filename = "報告.pdf"
encoded = quote(filename)  # "%E5%A0%B1%E5%91%8A.pdf"

headers = {
    # RFC 5987 格式
    "Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"
}
```

### 3. 大檔案 Streaming

目前實作是一次讀取整個檔案到記憶體，大檔案會有問題。改用 streaming：

```python
from fastapi.responses import StreamingResponse

async def stream_file(share_name: str, path: str, chunk_size: int = 65536):
    """Generator：分段讀取檔案"""
    with create_smb_service(...) as smb:
        # 取得檔案大小
        file_info = smb.get_file_info(share_name, path)
        file_size = file_info["size"]

        offset = 0
        while offset < file_size:
            chunk = smb.read_file_chunk(share_name, path, offset, chunk_size)
            yield chunk
            offset += len(chunk)


@router.get("/download-large")
async def download_large_file(path: str, ...):
    share_name, sub_path = _parse_path(path)

    return StreamingResponse(
        stream_file(share_name, sub_path),
        media_type="application/octet-stream",
        headers={...}
    )
```

### 4. 統一錯誤處理

可以用 exception handler 減少重複程式碼：

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(SMBError)
async def smb_error_handler(request: Request, exc: SMBError):
    error_msg = str(exc)

    if "權限" in error_msg:
        return JSONResponse(
            status_code=403,
            content={"detail": "無權限執行此操作"}
        )
    if "不存在" in error_msg:
        return JSONResponse(
            status_code=404,
            content={"detail": "檔案或資料夾不存在"}
        )
    if "已存在" in error_msg:
        return JSONResponse(
            status_code=409,
            content={"detail": "目標已存在"}
        )

    return JSONResponse(
        status_code=500,
        content={"detail": error_msg}
    )
```

---

## 小結

這篇我們完成了：

1. **路徑設計**：統一的 `/share/path/file` 格式
2. **完整 CRUD**：列出、瀏覽、讀取、上傳、刪除、重命名、建立
3. **認證整合**：header 和 query parameter 雙軌支援
4. **錯誤處理**：權限、不存在、已存在等情況

**API 總覽**：

| 方法 | 路徑 | 功能 |
|------|------|------|
| GET | `/api/nas/shares` | 列出共享 |
| GET | `/api/nas/browse?path=` | 瀏覽資料夾 |
| GET | `/api/nas/file?path=` | 讀取檔案（預覽） |
| GET | `/api/nas/download?path=` | 下載檔案 |
| POST | `/api/nas/upload` | 上傳檔案 |
| DELETE | `/api/nas/file` | 刪除 |
| PATCH | `/api/nas/rename` | 重命名 |
| POST | `/api/nas/mkdir` | 建立資料夾 |

到這裡，SMB/NAS 系列就完成了！你現在有一套完整的檔案管理 API，可以讓 Web 前端操作公司 NAS。

---

## 完整程式碼

### 前端呼叫範例

```javascript
// 使用 fetch API

const API_BASE = '/api/nas';
const TOKEN = localStorage.getItem('token');

const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
};

// 列出共享
const shares = await fetch(`${API_BASE}/shares`, { headers })
    .then(r => r.json());

// 瀏覽資料夾
const items = await fetch(`${API_BASE}/browse?path=/home/文件`, { headers })
    .then(r => r.json());

// 下載檔案（開新視窗）
window.open(`${API_BASE}/download?path=/home/報告.pdf&token=${TOKEN}`);

// 上傳檔案
const formData = new FormData();
formData.append('path', '/home/文件');
formData.append('file', fileInput.files[0]);

await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    body: formData,
});

// 刪除檔案
await fetch(`${API_BASE}/file`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ path: '/home/文件/舊檔案.txt' }),
});

// 建立資料夾
await fetch(`${API_BASE}/mkdir`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path: '/home/文件/新資料夾' }),
});
```
