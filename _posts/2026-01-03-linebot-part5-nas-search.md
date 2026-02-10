---
layout: post
title: "Line Bot 整合（五）：搜尋並發送 NAS 檔案"
subtitle: "讓用戶透過對話搜尋公司檔案，圖片直接顯示"
date: 2026-01-03
categories: [ChingTech OS]
tags: [Line Bot, NAS, FastAPI, MCP, Python, ChingTech OS]
---

![Line Bot 整合（五）：搜尋並發送 NAS 檔案](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-03-linebot-part5-nas-search.png)

## 前言

這是 Line Bot 系列的最後一篇。前面我們完成了 [Webhook 架構]({% post_url 2025-12-30-linebot-part1-webhook %})、[檔案處理]({% post_url 2025-12-31-linebot-part2-file-download %})、[AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %}) 和 [群組專案綁定]({% post_url 2026-01-02-linebot-part4-group-project %})。

這篇要實作一個實用功能：**透過 Line Bot 搜尋並發送 NAS 檔案**。

使用情境：
- 「給我亦達的 layout 圖」
- 「找一下水切爐的規格 PDF」
- 「那個資料夾還有什麼檔案？」

AI 會搜尋 NAS 共享資料夾，圖片直接顯示在對話中，其他檔案則附上下載連結。

---

## 架構概覽

```
用戶：「給我亦達的 layout 圖」
              │
              ▼
┌──────────────────────────────────────────┐
│  AI 助理                                  │
│  ┌─────────────────────────────────────┐ │
│  │ 1. search_nas_files                 │ │
│  │    keywords: "亦達,layout"          │ │
│  │    file_types: "jpg,png,pdf,dwg"    │ │
│  └──────────────┬──────────────────────┘ │
│                 │                         │
│                 ▼ 找到多個檔案            │
│  ┌─────────────────────────────────────┐ │
│  │ 2. 列出供用戶選擇                   │ │
│  │    1. 亦達_layout_v1.png           │ │
│  │    2. 亦達_layout_v2.dwg           │ │
│  │    3. 亦達_規格.pdf                │ │
│  └──────────────┬──────────────────────┘ │
│                 │                         │
│                 ▼ 用戶：「第一個」        │
│  ┌─────────────────────────────────────┐ │
│  │ 3. prepare_file_message             │ │
│  │    - 建立分享連結                   │ │
│  │    - 判斷是否為圖片                 │ │
│  └──────────────┬──────────────────────┘ │
│                 │                         │
│                 ▼                         │
│  ┌─────────────────────────────────────┐ │
│  │ 4. 回覆                             │ │
│  │    - 圖片：ImageMessage 直接顯示    │ │
│  │    - 其他：文字連結                 │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

---

## MCP 工具實作

### 搜尋 NAS 檔案

```python
@mcp.tool()
async def search_nas_files(
    keywords: str,
    file_types: str | None = None,
    limit: int = 100,
) -> str:
    """
    搜尋 NAS 共享檔案

    Args:
        keywords: 搜尋關鍵字，多個關鍵字用逗號分隔（AND 匹配）
        file_types: 檔案類型過濾，如：pdf,xlsx,dwg
        limit: 最大回傳數量
    """
    from pathlib import Path

    # 取得專案掛載點路徑
    projects_path = Path(settings.projects_mount_path)

    if not projects_path.exists():
        return f"錯誤：掛載點 {settings.projects_mount_path} 不存在"

    # 解析關鍵字（大小寫不敏感）
    keyword_list = [k.strip().lower() for k in keywords.split(",") if k.strip()]
    if not keyword_list:
        return "錯誤：請提供至少一個關鍵字"

    # 解析檔案類型
    type_list = []
    if file_types:
        type_list = [t.strip().lower().lstrip(".") for t in file_types.split(",")]

    # 搜尋檔案
    matched_files = []
    for file_path in projects_path.rglob("*"):
        if not file_path.is_file():
            continue

        # 取得相對路徑
        rel_path = file_path.relative_to(projects_path)
        rel_path_lower = str(rel_path).lower()

        # 關鍵字匹配（所有關鍵字都要匹配路徑）
        if not all(kw in rel_path_lower for kw in keyword_list):
            continue

        # 檔案類型匹配
        if type_list:
            suffix = file_path.suffix.lower().lstrip(".")
            if suffix not in type_list:
                continue

        # 取得檔案資訊
        stat = file_path.stat()
        matched_files.append({
            "path": f"/{rel_path}",
            "name": file_path.name,
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime),
        })

        if len(matched_files) >= limit:
            break

    if not matched_files:
        return f"找不到符合「{keywords}」的檔案"

    # 格式化輸出
    result = f"找到 {len(matched_files)} 個檔案：\n\n"
    for i, f in enumerate(matched_files[:20], 1):
        size_str = format_file_size(f["size"])
        result += f"{i}. {f['name']}（{size_str}）\n"
        result += f"   路徑：{f['path']}\n"

    if len(matched_files) > 20:
        result += f"\n...還有 {len(matched_files) - 20} 個檔案"

    return result
```

### 取得檔案資訊

```python
@mcp.tool()
async def get_nas_file_info(file_path: str) -> str:
    """
    取得 NAS 檔案詳細資訊

    Args:
        file_path: 檔案路徑（相對或完整路徑）
    """
    from pathlib import Path

    projects_path = Path(settings.projects_mount_path)

    # 正規化路徑
    if file_path.startswith(settings.projects_mount_path):
        full_path = Path(file_path)
    else:
        rel_path = file_path.lstrip("/")
        full_path = projects_path / rel_path

    # 安全檢查：確保路徑在允許範圍內
    full_path = full_path.resolve()
    if not str(full_path).startswith(str(projects_path.resolve())):
        return "錯誤：不允許存取此路徑"

    if not full_path.exists():
        return f"錯誤：檔案不存在 - {file_path}"

    # 取得檔案資訊
    stat = full_path.stat()
    size_str = format_file_size(stat.st_size)
    modified = datetime.fromtimestamp(stat.st_mtime)

    # 判斷檔案類型
    suffix = full_path.suffix.lower()
    type_map = {
        ".pdf": "PDF 文件",
        ".xlsx": "Excel 試算表",
        ".dwg": "AutoCAD 圖檔",
        ".png": "PNG 圖片",
        ".jpg": "JPEG 圖片",
    }
    file_type = type_map.get(suffix, f"{suffix} 檔案")

    return f"""📄 **{full_path.name}**

類型：{file_type}
大小：{size_str}
修改時間：{modified.strftime('%Y-%m-%d %H:%M:%S')}
完整路徑：{str(full_path)}
"""
```

### 準備檔案訊息

這是最關鍵的工具，會根據檔案類型決定如何回覆：

```python
@mcp.tool()
async def prepare_file_message(file_path: str) -> str:
    """
    準備檔案訊息供 Line Bot 回覆。
    圖片會直接顯示，其他檔案會以連結形式呈現。

    Args:
        file_path: NAS 檔案的完整路徑
    """
    import json
    from pathlib import Path

    # 驗證檔案路徑
    full_path = validate_nas_file_path(file_path)

    # 取得檔案資訊
    file_name = full_path.name
    file_size = full_path.stat().st_size
    file_ext = full_path.suffix.lower().lstrip(".")

    # 格式化檔案大小
    if file_size >= 1024 * 1024:
        size_str = f"{file_size / 1024 / 1024:.1f}MB"
    else:
        size_str = f"{file_size / 1024:.1f}KB"

    # 判斷是否為圖片（Line ImageMessage 支援的格式）
    image_extensions = {"jpg", "jpeg", "png", "gif", "webp"}
    is_image = file_ext in image_extensions

    # Line ImageMessage 限制 10MB
    max_image_size = 10 * 1024 * 1024

    # 產生分享連結
    result = await create_share_link(
        resource_type="nas_file",
        resource_id=file_path,
        expires_in="24h",
    )
    download_url = result.full_url.replace("/s/", "/api/public/") + "/download"

    # 組合檔案訊息標記
    if is_image and file_size <= max_image_size:
        # 小圖片：標記為 image 類型
        file_info = {
            "type": "image",
            "url": download_url,
            "name": file_name,
        }
        hint = f"已準備好圖片 {file_name}，會顯示在回覆中"
    else:
        # 其他檔案或大圖片：標記為 file 類型
        file_info = {
            "type": "file",
            "url": result.full_url,
            "name": file_name,
            "size": size_str,
        }
        hint = f"已準備好檔案 {file_name}，會附上下載連結"

    # 使用特殊標記，讓回覆處理程式識別
    marker = f"__FILE_MESSAGE__{json.dumps(file_info)}__END_FILE__"

    return f"{hint}\n{marker}"
```

---

## 檔案訊息處理

AI 回覆中的檔案標記需要特殊處理：

```python
FILE_MESSAGE_PATTERN = re.compile(
    r"__FILE_MESSAGE__(.+?)__END_FILE__",
    re.DOTALL
)


def extract_file_messages(text: str) -> tuple[str, list[dict]]:
    """
    從文字中提取檔案訊息標記

    Returns:
        (清理後的文字, 檔案訊息列表)
    """
    file_messages = []

    def replace_marker(match):
        try:
            file_info = json.loads(match.group(1))
            file_messages.append(file_info)
        except json.JSONDecodeError:
            pass
        return ""

    clean_text = FILE_MESSAGE_PATTERN.sub(replace_marker, text)
    clean_text = clean_text.strip()

    return clean_text, file_messages
```

---

## 回覆訊息組合

根據檔案類型組合不同的訊息：

```python
async def reply_with_files(
    reply_token: str,
    text: str,
    file_messages: list[dict],
) -> list[str]:
    """
    回覆文字和檔案（混合訊息）

    Args:
        reply_token: Line 回覆 token
        text: 文字內容
        file_messages: 檔案訊息列表
    """
    from linebot.v3.messaging import TextMessage, ImageMessage

    messages = []

    # 先加入文字訊息
    if text:
        messages.append(TextMessage(text=text))

    # 處理檔案訊息
    for file_info in file_messages:
        file_type = file_info.get("type", "file")
        url = file_info.get("url", "")
        name = file_info.get("name", "")
        size = file_info.get("size", "")

        if file_type == "image" and url:
            # 圖片：使用 ImageMessage 直接顯示
            messages.append(ImageMessage(
                original_content_url=url,
                preview_image_url=url,
            ))
        elif file_type == "file" and url:
            # 非圖片檔案：加入連結文字
            link_text = f"📎 {name}"
            if size:
                link_text += f"（{size}）"
            link_text += f"\n{url}\n⏰ 連結 24 小時內有效"

            # 追加到現有文字訊息
            if messages and isinstance(messages[0], TextMessage):
                messages[0] = TextMessage(
                    text=messages[0].text + "\n\n" + link_text
                )
            else:
                messages.append(TextMessage(text=link_text))

    # Line 限制每次最多 5 則訊息
    if len(messages) > 5:
        # 超出的圖片轉為連結
        extra_messages = messages[5:]
        messages = messages[:5]

        extra_links = []
        for msg in extra_messages:
            if isinstance(msg, ImageMessage):
                extra_links.append(msg.original_content_url)

        if extra_links and isinstance(messages[0], TextMessage):
            messages[0] = TextMessage(
                text=messages[0].text + "\n\n其他圖片連結：\n" + "\n".join(extra_links)
            )

    return await reply_messages(reply_token, messages)
```

---

## Line 訊息限制

Line Messaging API 有幾個重要限制：

| 限制 | 說明 |
|------|------|
| 每次最多 5 則訊息 | 可混合文字和圖片 |
| 圖片最大 10MB | 超過需轉為連結 |
| 圖片格式 | jpg, jpeg, png, gif, webp |
| 圖片需 HTTPS | 分享連結需走 HTTPS |

### 處理多張圖片

當搜尋結果有多張圖片時：

```python
# 情境：找到 10 張圖片
# 處理：前 4 張直接顯示，其餘附連結

messages = [
    TextMessage(text="找到 10 張圖片，顯示前 4 張："),
    ImageMessage(...),  # 圖片 1
    ImageMessage(...),  # 圖片 2
    ImageMessage(...),  # 圖片 3
    ImageMessage(...),  # 圖片 4
]
# 第 5-10 張附在文字中以連結形式呈現
```

---

## 使用情境

### 情境一：搜尋並發送單一圖片

```
用戶：給我亦達的 layout 圖

AI：（使用 search_nas_files）
AI：找到 3 個檔案：
    1. 亦達_layout_v1.png（2.5MB）
    2. 亦達_layout_v2.dwg（8.1MB）
    3. 亦達_規格.pdf（512KB）

    要傳送哪一個？

用戶：第一個

AI：（使用 prepare_file_message）
AI：[顯示圖片]
```

### 情境二：發送多張圖片

```
用戶：給我那個資料夾的所有圖

AI：（使用 search_nas_files）
AI：這個資料夾有 8 張圖，我先傳 4 張：
    [圖片 1]
    [圖片 2]
    [圖片 3]
    [圖片 4]

    其他圖片連結：
    https://...
    https://...
    https://...
    https://...
```

### 情境三：發送非圖片檔案

```
用戶：給我水切爐的規格 PDF

AI：（使用 search_nas_files）
AI：（使用 prepare_file_message）
AI：📎 水切爐規格書.pdf（1.2MB）
    https://ctos.example.com/s/abc123
    ⏰ 連結 24 小時內有效
```

---

## 安全考量

### 路徑安全檢查

```python
def validate_nas_file_path(file_path: str) -> Path:
    """
    驗證並正規化 NAS 檔案路徑

    Raises:
        NasFileAccessDenied: 路徑不在允許範圍
        NasFileNotFoundError: 檔案不存在
    """
    projects_path = Path(settings.projects_mount_path)

    # 正規化路徑
    if file_path.startswith(settings.projects_mount_path):
        full_path = Path(file_path)
    else:
        rel_path = file_path.lstrip("/")
        full_path = projects_path / rel_path

    # 解析符號連結並檢查
    full_path = full_path.resolve()
    if not str(full_path).startswith(str(projects_path.resolve())):
        raise NasFileAccessDenied("不允許存取此路徑")

    if not full_path.exists():
        raise NasFileNotFoundError(f"檔案不存在：{file_path}")

    return full_path
```

### 分享連結有效期

所有分享連結預設 24 小時有效，避免長期暴露：

```python
result = await create_share_link(
    resource_type="nas_file",
    resource_id=file_path,
    expires_in="24h",  # 24 小時後失效
)
```

---

## 小結

這篇完成了 NAS 檔案搜尋與發送功能：

- **search_nas_files**：關鍵字搜尋檔案
- **get_nas_file_info**：取得檔案詳細資訊
- **prepare_file_message**：準備檔案訊息
- **圖片直接顯示**：使用 ImageMessage
- **檔案附連結**：24 小時有效的分享連結

至此，Line Bot 整合系列告一段落。接下來會介紹 [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})，深入了解讓 AI 使用工具的標準協議。

---

## 系列總覽

1. [Webhook 架構與訊息接收]({% post_url 2025-12-30-linebot-part1-webhook %})
2. [檔案處理：圖片自動下載到 NAS]({% post_url 2025-12-31-linebot-part2-file-download %})
3. [與 Claude AI 對話整合]({% post_url 2026-01-01-linebot-part3-ai-integration %})
4. [群組管理與專案綁定]({% post_url 2026-01-02-linebot-part4-group-project %})
5. [搜尋並發送 NAS 檔案]({% post_url 2026-01-03-linebot-part5-nas-search %})（本篇）

---

## 參考資源

- [Line Messaging API - Send message](https://developers.line.biz/en/docs/messaging-api/sending-messages/)
- [Line ImageMessage 規格](https://developers.line.biz/en/reference/messaging-api/#image-message)
- [FastMCP 文件](https://github.com/jlowin/fastmcp)
