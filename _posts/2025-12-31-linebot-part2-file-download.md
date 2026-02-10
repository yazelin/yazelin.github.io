---
layout: post
title: "Line Bot 整合（二）：檔案處理與 NAS 自動儲存"
subtitle: "讓 Line Bot 收到的圖片、影片自動歸檔到 NAS"
date: 2025-12-31
categories: [ChingTech OS]
tags: [Line Bot, FastAPI, NAS, 檔案處理, Python, ChingTech OS]
---

![Line Bot 整合（二）：檔案處理與 NAS 自動儲存](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-31-linebot-part2-file-download.png)

## 前言

在 [上一篇]({% post_url 2025-12-30-linebot-part1-webhook %}) 中，我們建立了 Line Bot 的 Webhook 架構與訊息儲存機制。這篇我們要實作**檔案處理**功能：

- 從 Line API 下載圖片、影片、音訊、檔案
- 自動儲存到 NAS 並建立目錄結構
- 資料庫記錄檔案資訊

---

## 檔案處理流程

```
Line 用戶發送圖片
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  process_media_message()                              │
│  ┌────────────────┐                                  │
│  │ 1. 下載檔案    │  download_line_content()         │
│  │    Line API    │  GET /v2/bot/message/{id}/content│
│  └───────┬────────┘                                  │
│          ▼                                           │
│  ┌────────────────┐                                  │
│  │ 2. 決定路徑    │  generate_nas_path()             │
│  │    群組/用戶   │  groups/{id}/images/2025-12-31/  │
│  └───────┬────────┘                                  │
│          ▼                                           │
│  ┌────────────────┐                                  │
│  │ 3. 儲存到 NAS  │  save_to_nas()                   │
│  │    掛載路徑    │  /mnt/nas/linebot/...            │
│  └───────┬────────┘                                  │
│          ▼                                           │
│  ┌────────────────┐                                  │
│  │ 4. 資料庫記錄  │  save_file_record()              │
│  │    line_files  │  nas_path, file_type, file_size  │
│  └────────────────┘                                  │
└──────────────────────────────────────────────────────┘
```

---

## 從 Line API 下載檔案

Line 提供 Content API 讓我們下載用戶發送的媒體檔案：

```python
import httpx

async def download_line_content(message_id: str) -> bytes | None:
    """從 Line API 下載檔案內容

    Args:
        message_id: Line 訊息 ID

    Returns:
        檔案內容 bytes，失敗時回傳 None
    """
    url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
    headers = {"Authorization": f"Bearer {settings.line_channel_access_token}"}

    try:
        # 使用較長的 timeout（影片可能較大）
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                return response.content
            else:
                logger.error(f"Line API 回應錯誤 {response.status_code}")
                return None
    except Exception as e:
        logger.error(f"下載 Line 內容失敗: {e}")
        return None
```

> **注意**：Content API 的 URL 是 `api-data.line.me`，不是一般的 `api.line.me`。

---

## NAS 路徑結構設計

為了方便管理，我們設計了分層的目錄結構：

```
/mnt/nas/linebot/
├── groups/                          # 群組檔案
│   └── {line_group_id}/
│       ├── images/
│       │   └── 2025-12-31/
│       │       └── {message_id}.jpg
│       ├── videos/
│       ├── audios/
│       └── files/
└── users/                           # 個人對話檔案
    └── {line_user_id}/
        ├── images/
        ├── videos/
        └── ...
```

### 路徑生成邏輯

```python
from datetime import datetime

# 檔案類型對應的副檔名
FILE_TYPE_EXTENSIONS = {
    "image": ".jpg",
    "video": ".mp4",
    "audio": ".m4a",
    "file": "",  # 檔案類型會保留原始副檔名
}

# MIME 類型對應的副檔名
MIME_TO_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "audio/m4a": ".m4a",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
}

def generate_nas_path(
    file_type: str,
    message_id: str,
    line_group_id: str | None = None,
    line_user_id: str | None = None,
    file_name: str | None = None,
    content: bytes | None = None,
) -> str:
    """生成 NAS 儲存路徑"""
    # 決定目錄前綴（群組或個人）
    if line_group_id:
        prefix = f"groups/{line_group_id}"
    elif line_user_id:
        prefix = f"users/{line_user_id}"
    else:
        prefix = "unknown"

    # 決定副檔名
    if file_name and "." in file_name:
        # 保留原始副檔名
        ext = "." + file_name.rsplit(".", 1)[-1].lower()
    elif content:
        # 從內容猜測 MIME 類型
        mime_type = guess_mime_type(content)
        ext = MIME_TO_EXTENSION.get(mime_type, FILE_TYPE_EXTENSIONS.get(file_type, ""))
    else:
        ext = FILE_TYPE_EXTENSIONS.get(file_type, "")

    # 日期目錄
    date_str = datetime.now().strftime("%Y-%m-%d")

    # 子目錄（images, videos, audios, files）
    subdir = f"{file_type}s"

    # 檔案名稱
    if file_name and file_type == "file":
        # 保留原始檔名（加上 message_id 前綴避免重複）
        safe_name = file_name.replace("/", "_").replace("\\", "_")
        filename = f"{message_id}_{safe_name}"
    else:
        filename = f"{message_id}{ext}"

    return f"{prefix}/{subdir}/{date_str}/{filename}"
```

---

## 從檔案內容猜測 MIME 類型

Line 不一定會告訴我們檔案的 MIME 類型，但我們可以從檔案的 **magic bytes** 判斷：

```python
def guess_mime_type(content: bytes) -> str:
    """從檔案內容猜測 MIME 類型"""
    # JPEG: FF D8 FF
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"

    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"

    # GIF: GIF87a 或 GIF89a
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"

    # WebP: RIFF....WEBP
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"

    # MP4/M4A: ....ftyp
    if content[4:8] == b"ftyp":
        ftyp = content[8:12]
        # M4A 是音訊格式
        if ftyp == b"M4A ":
            return "audio/m4a"
        # 其他（mp42, isom 等）都是影片格式
        return "video/mp4"

    return "application/octet-stream"
```

> **MP4 vs M4A**：兩者都是 MPEG-4 容器格式，但 `.mp4` 用於影片，`.m4a` 用於純音訊。透過 ftyp 標記可以區分。

---

## 儲存到 NAS

我們使用 **CIFS 掛載** 的方式存取 NAS，這樣可以像操作本地檔案一樣操作 NAS：

```python
from pathlib import Path

async def save_to_nas(relative_path: str, content: bytes) -> bool:
    """儲存檔案到 NAS（透過掛載路徑）

    Args:
        relative_path: 相對路徑（不含掛載根目錄）
        content: 檔案內容

    Returns:
        是否成功
    """
    try:
        # 組合完整路徑
        # 假設 NAS 掛載在 /mnt/nas/linebot
        base_path = Path(settings.linebot_nas_mount_path)
        full_path = base_path / relative_path

        # 確保目錄存在
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # 寫入檔案
        full_path.write_bytes(content)

        logger.info(f"檔案已儲存: {full_path}")
        return True

    except Exception as e:
        logger.error(f"儲存到 NAS 失敗 {relative_path}: {e}")
        return False
```

### NAS 掛載設定

在 Linux 上使用 CIFS 掛載 NAS：

```bash
# 安裝 cifs-utils
sudo apt install cifs-utils

# 建立掛載點
sudo mkdir -p /mnt/nas/linebot

# 建立 credentials 檔案（避免密碼明文）
sudo tee /etc/nas-credentials << EOF
username=your_nas_user
password=your_nas_password
EOF
sudo chmod 600 /etc/nas-credentials

# 掛載 NAS
sudo mount -t cifs //192.168.1.100/share/linebot /mnt/nas/linebot \
    -o credentials=/etc/nas-credentials,uid=1000,gid=1000

# 設定開機自動掛載（加入 /etc/fstab）
//192.168.1.100/share/linebot /mnt/nas/linebot cifs credentials=/etc/nas-credentials,uid=1000,gid=1000 0 0
```

---

## 儲存檔案記錄到資料庫

```python
async def save_file_record(
    message_uuid: UUID,
    file_type: str,
    file_name: str | None = None,
    file_size: int | None = None,
    mime_type: str | None = None,
    nas_path: str | None = None,
    duration: int | None = None,
) -> UUID:
    """儲存檔案記錄，回傳檔案 UUID"""
    async with get_connection() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO line_files (
                message_id, file_type, file_name,
                file_size, mime_type, nas_path, duration
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            """,
            message_uuid,
            file_type,
            file_name,
            file_size,
            mime_type,
            nas_path,
            duration,
        )

        # 更新訊息的 file_id
        await conn.execute(
            "UPDATE line_messages SET file_id = $1 WHERE id = $2",
            row["id"],
            message_uuid,
        )

        return row["id"]
```

---

## 整合：處理媒體訊息

將上述步驟整合到 `process_media_message()`：

```python
async def process_media_message(
    message_id: str,
    message_uuid: UUID,
    message_type: str,
    line_group_id: str | None,
    line_user_id: str | None,
    file_name: str | None = None,
    file_size: int | None = None,
    duration: int | None = None,
) -> None:
    """處理媒體訊息（圖片、影片、音訊、檔案）"""
    try:
        # 根據副檔名自動重新分類檔案類型
        actual_file_type = message_type
        if message_type == "file" and file_name and "." in file_name:
            ext = file_name.rsplit(".", 1)[-1].lower()
            # 影片格式
            if ext in ("mp4", "mov", "avi", "mkv", "webm", "m4v"):
                actual_file_type = "video"
            # 音訊格式
            elif ext in ("mp3", "m4a", "wav", "ogg", "flac", "aac"):
                actual_file_type = "audio"
            # 圖片格式
            elif ext in ("jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"):
                actual_file_type = "image"

        # 1. 下載檔案
        content = await download_line_content(message_id)
        if not content:
            logger.error(f"無法下載 Line 檔案: {message_id}")
            return

        # 2. 決定儲存路徑
        nas_path = generate_nas_path(
            file_type=actual_file_type,
            message_id=message_id,
            line_group_id=line_group_id,
            line_user_id=line_user_id,
            file_name=file_name,
            content=content,
        )

        # 3. 儲存到 NAS
        success = await save_to_nas(nas_path, content)
        if not success:
            logger.error(f"儲存檔案到 NAS 失敗: {nas_path}")
            return

        # 4. 儲存檔案記錄到資料庫
        await save_file_record(
            message_uuid=message_uuid,
            file_type=actual_file_type,
            file_name=file_name,
            file_size=file_size or len(content),
            mime_type=guess_mime_type(content) if content else None,
            nas_path=nas_path,
            duration=duration,
        )

        logger.info(f"媒體訊息處理完成: {message_id} -> {nas_path}")

    except Exception as e:
        logger.error(f"處理媒體訊息失敗 {message_id}: {e}")
```

---

## 在 Webhook 中呼叫

回到 `process_message_event()`，在儲存訊息後處理媒體檔案：

```python
async def process_message_event(event: MessageEvent) -> None:
    """處理訊息事件"""
    message = event.message
    # ... 省略之前的程式碼 ...

    # 儲存訊息
    message_uuid = await save_message(...)

    # 處理媒體檔案（圖片、影片、音訊、檔案）
    if message_type in ("image", "video", "audio", "file"):
        await process_media_message(
            message_id=message.id,
            message_uuid=message_uuid,
            message_type=message_type,
            line_group_id=line_group_id,
            line_user_id=line_user_id,
            file_name=file_name,
            file_size=file_size,
            duration=duration,
        )
```

---

## 從 NAS 讀取檔案

當需要讀取檔案時（例如 API 下載）：

```python
async def read_file_from_nas(nas_path: str) -> bytes | None:
    """從 NAS 讀取檔案

    Args:
        nas_path: 相對於 linebot 根目錄的路徑

    Returns:
        檔案內容 bytes，失敗回傳 None
    """
    try:
        base_path = Path(settings.linebot_nas_mount_path)
        full_path = base_path / nas_path

        if not full_path.exists():
            logger.warning(f"檔案不存在: {full_path}")
            return None

        return full_path.read_bytes()

    except Exception as e:
        logger.error(f"讀取 NAS 檔案失敗 {nas_path}: {e}")
        return None
```

---

## 檔案下載 API

提供 API 讓前端或其他服務下載檔案：

```python
from fastapi import Response
from urllib.parse import quote

@router.get("/files/{file_id}/download")
async def api_download_file(file_id: UUID):
    """下載檔案"""
    # 取得檔案資訊
    file_info = await get_file_by_id(file_id)
    if not file_info:
        raise HTTPException(status_code=404, detail="File not found")

    nas_path = file_info.get("nas_path")
    if not nas_path:
        raise HTTPException(status_code=404, detail="File not stored on NAS")

    # 從 NAS 讀取檔案
    content = await read_file_from_nas(nas_path)
    if content is None:
        raise HTTPException(status_code=404, detail="File not found on NAS")

    # 決定 Content-Type
    file_type = file_info.get("file_type", "file")
    mime_type = file_info.get("mime_type") or {
        "image": "image/jpeg",
        "video": "video/mp4",
        "audio": "audio/m4a",
        "file": "application/octet-stream",
    }.get(file_type, "application/octet-stream")

    # 處理檔名中的非 ASCII 字元（RFC 5987）
    file_name = file_info.get("file_name") or nas_path.split("/")[-1]
    safe_filename = quote(file_name, safe="")

    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{safe_filename}",
        },
    )
```

---

## 小結

本篇實作了完整的檔案處理流程：

| 步驟 | 功能 |
|------|------|
| 下載檔案 | 從 Line Content API 取得媒體內容 |
| 決定路徑 | 按群組/用戶、檔案類型、日期分層 |
| 猜測類型 | 從 magic bytes 判斷 MIME 類型 |
| 儲存 NAS | 透過 CIFS 掛載寫入 |
| 資料庫記錄 | 儲存 nas_path 和檔案資訊 |
| 下載 API | 提供檔案讀取端點 |

下一篇我們將實作 [Line Bot 與 Claude AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})，讓 Bot 可以智慧回應用戶訊息。

---

## 參考資源

- [Line Bot 整合（一）：Webhook 架構]({% post_url 2025-12-30-linebot-part1-webhook %})
- [Python 存取 NAS 檔案系統]({% post_url 2025-12-12-smb-nas-part1-protocol %})
- [Line Get Content API](https://developers.line.biz/en/reference/messaging-api/#get-content)
- [List of file signatures (Magic bytes)](https://en.wikipedia.org/wiki/List_of_file_signatures)
