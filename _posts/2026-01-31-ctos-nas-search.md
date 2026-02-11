---
layout: post
title: "ChingTech OS：NAS 電路圖掛載與三階段非同步搜尋"
subtitle: "解決 SMB/CIFS 掛載的阻塞問題"
date: 2026-01-31
categories: [ChingTech OS]
tags: [ChingTech OS, NAS, SMB, CIFS, 非同步, Python, 搜尋]
---

![ChingTech OS：NAS 電路圖掛載與三階段非同步搜尋](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-31-ctos-nas-search.png)

## 前言

ChingTech OS 原本只掛載了 `/mnt/nas/projects`（專案資料），AI 助理可以幫用戶搜尋專案相關檔案。但公司的電路圖放在另一個 NAS 共享資料夾，員工常常需要查「某台機器的線路圖在哪」。

需求很簡單：**把電路圖也掛載上來，讓 AI 助理能一起搜尋**。

聽起來只是加一行 `mount` 的事。但實際做下去才發現，CIFS 掛載點在網路不穩時會讓整個搜尋操作卡住（blocking），連帶拖慢所有 Bot 回應。這篇文章記錄我們如何用三階段非同步搜尋策略解決這個問題。

---

## 新增電路圖掛載點

### 掛載架構

原本的 NAS 掛載只有一個來源：

```
/mnt/nas/
├── ctos/        ← CTOS 系統檔案（知識庫、Line Bot 檔案等）
└── projects/    ← 公司專案資料
```

現在要加上電路圖：

```
/mnt/nas/
├── ctos/        ← CTOS 系統檔案
├── projects/    ← 公司專案資料
└── circuits/    ← 電路圖資料（新增）
```

### 設定新掛載點

在 `config.py` 中新增設定：

```python
# config.py
class Settings:
    # NAS 掛載路徑
    nas_mount_path: str = _get_env("NAS_MOUNT_PATH", "/mnt/nas")
    ctos_mount_path: str = _get_env("CTOS_MOUNT_PATH", "/mnt/nas/ctos")
    projects_mount_path: str = _get_env("PROJECTS_MOUNT_PATH", "/mnt/nas/projects")
    circuits_mount_path: str = _get_env("CIRCUITS_MOUNT_PATH", "/mnt/nas/circuits")
```

### PathManager 支援多來源

`PathManager` 是統一路徑管理器，負責將各種格式的路徑（`shared://`、`ctos://`、`/mnt/nas/...`）轉換為實際檔案路徑。新增 circuits 子來源後，它可以處理：

```python
# path_manager.py
class PathManager:
    def __init__(self):
        # shared zone 子來源對應（多掛載點）
        self._shared_mounts = {
            "projects": settings.projects_mount_path,   # /mnt/nas/projects
            "circuits": settings.circuits_mount_path,    # /mnt/nas/circuits
        }
```

路徑解析範例：

| 輸入路徑 | 解析結果 |
|---------|---------|
| `shared://projects/亦達光學/layout.pdf` | `/mnt/nas/projects/亦達光學/layout.pdf` |
| `shared://circuits/線路圖A/xxx.dwg` | `/mnt/nas/circuits/線路圖A/xxx.dwg` |
| `shared://亦達光學/layout.pdf` | `/mnt/nas/projects/亦達光學/layout.pdf`（向後相容） |

```python
def _resolve_shared_path(self, relative_path: str) -> str:
    """解析 shared zone 子來源路徑"""
    first_segment = relative_path.split("/", 1)[0]
    if first_segment in self._shared_mounts:
        mount_path = self._shared_mounts[first_segment]
        rest = relative_path[len(first_segment):].lstrip("/")
        return f"{mount_path}/{rest}" if rest else mount_path
    # 向後相容：fallback 到 projects
    return f"{self._shared_mounts['projects']}/{relative_path}"
```

到這裡為止都很順利。問題出在搜尋。

---

## CIFS 掛載的阻塞問題

### 問題現象

加入 circuits 掛載點後，搜尋有時候會卡很久。觀察 log 發現：

1. NAS 偶爾短暫斷線（Wi-Fi 不穩、NAS 背景任務佔用資源）
2. CIFS 掛載點在 NAS 不可達時，`os.listdir()` 和 `os.walk()` 會**卡住數十秒**
3. 因為是同步操作，event loop 整個被阻塞
4. 其他 Bot 請求全部排隊等待

```
# 典型的死亡時間線
14:30:01  用戶 A 問「找亦達的線路圖」
14:30:01  search_nas_files 開始，呼叫 os.walk("/mnt/nas/circuits/...")
14:30:01  NAS 剛好在做備份，circuits 掛載回應超慢
14:30:15  ... 14 秒過去，event loop 完全卡住 ...
14:30:15  用戶 B 的訊息堆積在 queue 裡
14:30:30  circuits 目錄終於回應（或 timeout）
14:30:31  用戶 A 的搜尋才開始回傳結果
14:30:32  用戶 B 的訊息才開始處理（延遲 30 秒）
```

### 根本原因

CIFS（Common Internet File System）掛載的目錄操作是**同步阻塞**的。在 Python 中：

```python
# 這些操作在 CIFS 掛載點上都可能阻塞
os.listdir("/mnt/nas/circuits/")      # 卡住
os.walk("/mnt/nas/circuits/")         # 卡住
pathlib.Path("/mnt/nas/circuits/").iterdir()  # 卡住
```

即使你用 `asyncio`，只要底層是同步 I/O，event loop 一樣會被卡。

---

## 三階段非同步搜尋策略

解法是把搜尋操作**移出 event loop**，改用 `asyncio.create_subprocess_exec` 呼叫系統的 `find` 指令。同時設計分層策略，在速度和完整性之間取得平衡。

### 整體架構

```
用戶：「找亦達的線路圖」
        │
        ▼
┌────────────────────────────────────────────┐
│ search_nas_files(keywords="亦達,線路圖")    │
│                                             │
│  搜尋來源：                                 │
│  ├── /mnt/nas/projects/   (projects)        │
│  └── /mnt/nas/circuits/   (circuits)        │
│                                             │
│  階段 1：淺層 2 層目錄匹配                  │
│  ├── find ... -maxdepth 2 -type d           │
│  └── 找到匹配目錄後，在其中搜尋檔案         │
│                                             │
│  階段 2：擴展到 3 層（階段 1 沒結果時）     │
│  ├── find ... -maxdepth 3 -type d           │
│  └── 同上                                   │
│                                             │
│  階段 3：全檔名掃描（前兩階段都沒結果時）   │
│  └── find ... -type f -ipath "*關鍵字*"     │
│                                             │
│  回傳：shared://circuits/亦達/線路圖.dwg    │
└────────────────────────────────────────────┘
```

### 核心：非同步 find

關鍵在於用 `asyncio.create_subprocess_exec` 取代 `os.walk`：

```python
async def _run_find(args: list[str], timeout: int = 30) -> str:
    """非同步執行 find 指令"""
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode("utf-8", errors="replace").strip()
    except (asyncio.TimeoutError, OSError):
        if proc:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        return ""
```

重點：

- `create_subprocess_exec` 不會阻塞 event loop，find 在子 process 中執行
- `asyncio.wait_for` 設定 timeout，即使 CIFS 卡住也不會拖垮整個系統
- timeout 後直接 `proc.kill()`，不等它慢慢回來

### 第一階段：快速搜尋

先用淺層目錄匹配，快速縮小搜尋範圍：

```python
async def _find_matching_dirs(max_depth: int) -> list[str]:
    """在淺層找出名稱匹配任一關鍵字的目錄"""
    tasks = []
    for source in source_paths:
        for kw in keyword_list:
            args = [
                "find", source,
                "-maxdepth", str(max_depth),
                "-type", "d",
                "-iname", f"*{kw}*",
            ]
            tasks.append(_run_find(args, timeout=30))

    results = await asyncio.gather(*tasks)
    dirs = set()
    for output in results:
        for line in output.split("\n"):
            if line:
                dirs.add(line)
    return sorted(dirs)
```

邏輯：

1. 對每個搜尋來源（projects、circuits）和每個關鍵字，**平行**執行 `find`
2. `asyncio.gather` 讓多個 find 同時跑，不用一個等一個
3. `-maxdepth 2` 只看前兩層，速度快
4. 找到匹配的目錄後，再用 `_search_in_dirs` 深入搜尋檔案

### 第二階段：擴展搜尋深度

如果第一階段沒找到，擴展到 3 層：

```python
# 階段 1：淺層 2 層
matched_dirs = await _find_matching_dirs(max_depth=2)
matched_files = await _search_in_dirs(matched_dirs)

# 階段 2：擴展到 3 層
if not matched_files:
    matched_dirs = await _find_matching_dirs(max_depth=3)
    matched_files = await _search_in_dirs(matched_dirs)
```

### 第三階段：Fallback 全檔名掃描

如果關鍵字只出現在檔名中（不在目錄名），前兩個階段會找不到。這時直接掃描所有來源目錄的檔案：

```python
# 階段 3：全掃檔名
if not matched_files:
    matched_files = await _search_in_dirs(source_paths)
```

`_search_in_dirs` 使用 `-ipath` 做全路徑匹配：

```python
async def _search_in_dirs(dirs: list[str]) -> list[dict]:
    """在指定目錄中搜尋符合條件的檔案"""
    args = ["find"] + dirs + ["-type", "f"]
    # 所有關鍵字都要匹配路徑（AND 條件）
    for kw in keyword_list:
        args.extend(["-ipath", f"*{kw}*"])
    # 檔案類型過濾
    if type_list:
        args.append("(")
        for i, t in enumerate(type_list):
            if i > 0:
                args.append("-o")
            args.extend(["-iname", f"*.{t}"])
        args.append(")")

    output = await _run_find(args, timeout=120)
    # ... 解析結果 ...
```

### 為什麼分三個階段？

| 階段 | 策略 | 速度 | 適用場景 |
|------|------|------|---------|
| 1 | 淺層 2 層目錄 | 最快（< 1 秒） | 目錄名稱包含關鍵字 |
| 2 | 淺層 3 層目錄 | 快（1-3 秒） | 子目錄較深 |
| 3 | 全檔名掃描 | 較慢（5-30 秒） | 關鍵字只在檔名中 |

大多數搜尋在第一階段就能命中，因為公司檔案通常按客戶名稱或專案名稱建立資料夾。只有少數情況需要走到第三階段。

---

## Web Image 自動下載

搜尋之外，另一個常見需求是：AI 回應中包含網路圖片 URL，要自動下載並傳送給用戶。

### 使用場景

```
用戶：「幫我查一下 ESP32 的接線圖」
AI：（透過 WebSearch 找到參考圖片 URL）
AI：（呼叫 download_web_image 下載圖片）
AI：「這是 ESP32 的接線參考圖」
     [圖片直接顯示在對話中]
```

### download_web_image MCP 工具

```python
@mcp.tool()
async def download_web_image(
    url: str,
    ctos_user_id: int | None = None,
) -> str:
    """下載網路圖片並準備為回覆訊息"""
    local_path = await download_image_from_url(url)
    if not local_path:
        return f"無法下載圖片：{url}"

    file_info = {
        "type": "image",
        "url": local_path,
        "original_url": url,
        "name": file_name,
    }
    marker = f"[FILE_MESSAGE:{json.dumps(file_info, ensure_ascii=False)}]"
    return f"已下載圖片 {file_name}\n{marker}"
```

下載邏輯在 `bot/media.py`：

```python
async def download_image_from_url(url: str) -> str | None:
    """下載圖片 URL 到暫存目錄"""
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None

        content_type = resp.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            return None

        # 用 URL 的 MD5 作為檔名，避免重複下載
        filename = hashlib.md5(url.encode()).hexdigest()[:12] + ext
        file_path = os.path.join(DOWNLOADED_IMAGE_DIR, filename)

        with open(file_path, "wb") as f:
            f.write(resp.content)

        return file_path
```

---

## 平台差異處理

同一個 `[FILE_MESSAGE:...]` 標記，在 Line 和 Telegram 上的處理方式不同。

### Line：直接用 HTTPS URL

Line 的 ImageMessage 可以直接接受 HTTPS URL，Bot 只要回傳 URL，Line 伺服器會自己去抓圖片：

```python
# Line 發送圖片
async def send_nas_file(...):
    if is_image and file_size <= max_image_size:
        # 產生公開下載連結
        download_url = result.full_url.replace("/s/", "/api/public/") + "/download"
        # Line 直接用 URL，不需要先下載
        message_id, error = await push_image(target_id, download_url)
```

### Telegram：先下載再上傳

Telegram 的 Bot API 在發送圖片時，如果 URL 指向**內網**（如 `https://ching-tech.ddns.net/ctos/api/public/...`），Telegram 伺服器可能抓不到。所以要先下載到記憶體，再用二進位方式上傳：

```python
# Telegram 發送檔案
class TelegramBotAdapter:
    async def send_file(self, target, file_url, file_name, **kwargs):
        """先下載檔案到記憶體，再以二進位方式上傳給 Telegram"""
        async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
            resp = await client.get(file_url)
            resp.raise_for_status()

        buf = BytesIO(resp.content)
        buf.name = file_name

        msg = await self.bot.send_document(
            chat_id=target,
            document=InputFile(buf, filename=file_name),
        )
```

### 平台差異對照表

| 特性 | Line | Telegram |
|-----|------|----------|
| 圖片發送 | 傳 HTTPS URL | 先下載再上傳二進位 |
| URL 限制 | 必須 HTTPS，可用外部 URL | 外部 URL 不穩定，建議先下載 |
| 檔案發送 | 文字訊息附連結 | 下載後以 document 上傳 |
| 發送失敗處理 | Fallback 到文字連結 | Fallback 到文字連結 |

---

## 小結

這次改動看起來只是「多掛一個 NAS 目錄」，但帶出了 CIFS 掛載在非同步環境中的根本問題。最終的解法包含三個層次：

1. **架構層**：PathManager 支援多個 shared zone 子來源（projects、circuits），路徑格式統一
2. **效能層**：三階段非同步搜尋，用 `asyncio.create_subprocess_exec` 避免 event loop 阻塞
3. **體驗層**：download_web_image 工具讓 AI 能自動下載並傳送網路圖片，搭配平台差異處理確保 Line 和 Telegram 都能正確顯示

核心思路是**分層遞進**：先用最快的方式嘗試，不行再逐步擴大搜尋範圍。這種策略在大多數情況下都能在 1 秒內回傳結果，只有極少數邊界情況才需要走到第三階段的全掃描。

面對效能問題，不要急著用最重的武器。先分析瓶頸在哪，再設計分層策略，往往比「直接開最大深度全掃」的暴力法更有效。

---

## 參考資源

- [Python asyncio subprocess 文件](https://docs.python.org/3/library/asyncio-subprocess.html)
- [CIFS/SMB 掛載選項](https://www.kernel.org/doc/html/latest/admin-guide/cifs/usage.html)
- [smbprotocol 套件](https://github.com/jborean93/smbprotocol)
- [Linux find 指令參考](https://man7.org/linux/man-pages/man1/find.1.html)
