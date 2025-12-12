---
layout: post
title: "SMB 協定入門：用 Python 連接公司 NAS"
subtitle: "從 smbprotocol 到 smbclient 的混合使用策略"
date: 2025-12-12
categories: [SMB/NAS]
tags: [Python, SMB, NAS, smbprotocol, Synology]
---

> **📚 SMB/NAS 檔案系統系列**
> 1. **SMB 協定入門：用 Python 連接公司 NAS** ← 目前閱讀
> 2. [檔案管理 API：FastAPI 實作上傳下載刪除]({% post_url 2025-12-12-smb-nas-part2-api %})
>
> **📖 前置知識**：[Linux 終端機入門]({% post_url 2025-12-13-linux-basics %})

---

## 這篇文章要解決什麼問題？

公司有台 NAS（如 Synology、QNAP、ASUSTOR 等），大家的檔案都放在上面。現在你要寫一個 Web 系統，讓員工可以：

- 瀏覽 NAS 上的檔案
- 直接在網頁預覽 PDF、圖片
- 上傳、下載、刪除檔案
- 不用另外登入，用公司帳號就能操作

**痛點是什麼？**
- NAS 用的是 SMB 協定，不是普通的 HTTP
- 權限繼承複雜（每個人看到的東西不一樣）
- Python 的 SMB 套件各有優缺點，要混用

**新人**：「請問公司檔案放在哪裡？我連不上...」

**IT**：「你要先設定網路磁碟機，IP 是這個、帳號是 AD 帳號...」

**新人**：「可是我是 Mac，設定方式不一樣...」

**老闆**：「每個新人報到都要花 IT 半天設定，有沒有更簡單的方法？」

**後端工程師**：「我們把 NAS 存取整合進系統，登入後直接在網頁上瀏覽檔案，不用設定任何東西。」

**IT**：「這樣 IT 工單可以少八成，我終於可以做其他事了。」

---

## 技術概念

### SMB 是什麼？

SMB（Server Message Block）是微軟發明的網路檔案共享協定。你每次在 Windows 開「網路芳鄰」、連網路磁碟機，用的就是 SMB。

```
Windows 檔案總管
       │
       │ SMB 協定 (Port 445)
       ▼
  NAS 伺服器 (Synology/QNAP)
       │
       └── 共享資料夾
            ├── home（個人資料夾）
            ├── 共用區（公司共用）
            └── 專案檔案
```

### SMB 版本演進

| 版本 | 年份 | 特色 |
|------|------|------|
| SMB 1.0 | 1983 | 古老、有安全漏洞、已棄用 |
| SMB 2.0 | 2006 | 效能大幅提升 |
| SMB 3.0 | 2012 | 加密傳輸、容錯機制 |
| SMB 3.1.1 | 2015 | 目前最新、預先認證完整性 |

**重要**：現代 NAS 預設只開 SMB 2/3，`smbprotocol` 也只支援 SMB 2/3。

### Python SMB 套件比較

| 套件 | 優點 | 缺點 |
|------|------|------|
| `smbprotocol` | 純 Python、效能好、功能完整 | 不支援列出共享（NetShareEnum）|
| `smbclient` (CLI) | 支援所有功能 | 需要系統安裝、shell 呼叫較慢 |
| `pysmb` | 老牌套件 | 只支援 SMB 1、已過時 |

**我們的策略**：混合使用 `smbprotocol` + `smbclient` CLI。

---

## 跟著做：Step by Step

### Step 1：安裝套件

```bash
# Python 套件
uv add smbprotocol
```

> 本系列使用 [uv](https://docs.astral.sh/uv/) 管理 Python 套件。如尚未安裝，請參考 **[uv 入門：極速 Python 套件管理]({% post_url 2025-12-13-uv-basics %})**。

```bash
# 系統套件（用於列出共享）
# Ubuntu/Debian
sudo apt install smbclient

# CentOS/RHEL
sudo yum install samba-client
```

### Step 2：定義錯誤類別

```python
# smb.py

class SMBError(Exception):
    """SMB 操作錯誤基礎類別"""
    pass


class SMBAuthError(SMBError):
    """認證錯誤（帳號密碼錯誤）"""
    pass


class SMBConnectionError(SMBError):
    """連線錯誤（NAS 無法連線）"""
    pass
```

### Step 3：建立 SMB 服務類別

```python
import uuid
from datetime import datetime
from typing import Any

from smbprotocol.connection import Connection
from smbprotocol.session import Session
from smbprotocol.tree import TreeConnect
from smbprotocol.file_info import FileAttributes
from smbprotocol.open import (
    Open,
    CreateDisposition,
    CreateOptions,
    DirectoryAccessMask,
    FilePipePrinterAccessMask,
    FileInformationClass,
    ImpersonationLevel,
    ShareAccess,
)


class SMBService:
    """SMB 服務類別

    提供 NAS 檔案操作功能。使用 context manager 確保連線正確關閉。
    """

    def __init__(self, host: str, username: str, password: str, port: int = 445):
        self.host = host
        self.username = username
        self.password = password
        self.port = port
        self._connection: Connection | None = None
        self._session: Session | None = None

    def _connect(self) -> None:
        """建立 SMB 連線"""
        try:
            # Connection 需要一個唯一的 GUID
            self._connection = Connection(uuid.uuid4(), self.host, self.port)
            self._connection.connect()
        except Exception as e:
            raise SMBConnectionError(f"無法連線至 {self.host}") from e

    def _authenticate(self) -> None:
        """進行 SMB 認證"""
        if self._connection is None:
            raise SMBConnectionError("尚未建立連線")

        try:
            self._session = Session(
                self._connection,
                self.username,
                self.password
            )
            self._session.connect()
        except Exception as e:
            error_msg = str(e).lower()
            # 判斷是否為認證錯誤
            if "logon" in error_msg or "password" in error_msg:
                raise SMBAuthError("帳號或密碼錯誤") from e
            raise SMBError(f"認證失敗：{e}") from e

    def _disconnect(self) -> None:
        """關閉連線"""
        if self._session:
            try:
                self._session.disconnect()
            except Exception:
                pass
            self._session = None

        if self._connection:
            try:
                self._connection.disconnect()
            except Exception:
                pass
            self._connection = None

    # Context Manager 支援
    def __enter__(self):
        self._connect()
        self._authenticate()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._disconnect()
        return False

    def test_auth(self) -> bool:
        """測試認證是否成功"""
        try:
            self._connect()
            self._authenticate()
            return True
        finally:
            self._disconnect()
```

### Step 4：列出共享資料夾（使用 smbclient CLI）

```python
import subprocess

class SMBService:
    # ... 前面的程式碼 ...

    def list_shares(self) -> list[dict[str, str]]:
        """列出 NAS 上所有共享資料夾

        使用 smbclient CLI 因為 smbprotocol 不支援 NetShareEnum RPC。

        Returns:
            [{"name": "home", "type": "disk"}, ...]
        """
        shares = []

        try:
            # smbclient -L 列出共享，-g 機器可讀格式
            result = subprocess.run(
                [
                    "smbclient",
                    "-L", f"//{self.host}",
                    "-U", f"{self.username}%{self.password}",
                    "-g",  # 輸出格式：type|name|comment
                ],
                capture_output=True,
                text=True,
                timeout=10,  # 10 秒超時
            )

            if result.returncode != 0:
                raise SMBError(f"無法列出共享：{result.stderr}")

            # 解析輸出
            # 格式：Disk|sharename|comment
            for line in result.stdout.strip().split("\n"):
                if not line:
                    continue

                parts = line.split("|")
                if len(parts) >= 2:
                    share_type = parts[0].lower()
                    share_name = parts[1]

                    # 只列出磁碟共享，跳過 IPC$、ADMIN$ 等系統共享
                    if share_type == "disk" and not share_name.endswith("$"):
                        shares.append({
                            "name": share_name,
                            "type": "disk"
                        })

        except subprocess.TimeoutExpired:
            raise SMBError("列出共享資料夾逾時")
        except FileNotFoundError:
            raise SMBError("系統未安裝 smbclient")

        return shares
```

### Step 5：瀏覽資料夾

```python
class SMBService:
    # ... 前面的程式碼 ...

    def browse_directory(self, share_name: str, path: str = "") -> list[dict]:
        """瀏覽資料夾內容

        Args:
            share_name: 共享名稱（如 "home"）
            path: 相對路徑（如 "文件/報告"）

        Returns:
            [{"name": "file.txt", "type": "file", "size": 1024, "modified": "..."}, ...]
        """
        if self._session is None:
            raise SMBError("尚未認證")

        items = []
        tree = None

        try:
            # 連接到共享
            tree = TreeConnect(
                self._session,
                rf"\\{self.host}\{share_name}"
            )
            tree.connect()

            # 正規化路徑：/ → \
            dir_path = path.strip("/").replace("/", "\\") if path else ""

            # 開啟目錄
            dir_open = Open(tree, dir_path or "")
            dir_open.create(
                ImpersonationLevel.Impersonation,
                DirectoryAccessMask.FILE_LIST_DIRECTORY | DirectoryAccessMask.FILE_READ_ATTRIBUTES,
                FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
                ShareAccess.FILE_SHARE_READ,
                CreateDisposition.FILE_OPEN,
                CreateOptions.FILE_DIRECTORY_FILE,
            )

            # 查詢目錄內容
            entries = dir_open.query_directory(
                "*",
                FileInformationClass.FILE_ID_BOTH_DIRECTORY_INFORMATION
            )

            for entry in entries:
                # 解析檔名
                name_raw = entry["file_name"].get_value()
                if isinstance(name_raw, bytes):
                    name = name_raw.decode("utf-16-le").rstrip("\x00")
                else:
                    name = str(name_raw)

                # 跳過 . 和 ..
                if name in (".", ".."):
                    continue

                # 判斷是否為資料夾
                attributes = entry["file_attributes"].get_value()
                is_directory = bool(
                    attributes & FileAttributes.FILE_ATTRIBUTE_DIRECTORY
                )

                # 取得檔案大小
                size = entry["end_of_file"].get_value() if not is_directory else None

                # 取得修改時間
                try:
                    last_write = entry["last_write_time"].get_value()
                    if isinstance(last_write, datetime):
                        modified = last_write.isoformat()
                    else:
                        modified = None
                except:
                    modified = None

                items.append({
                    "name": name,
                    "type": "directory" if is_directory else "file",
                    "size": size,
                    "modified": modified,
                })

            dir_open.close()

        except Exception as e:
            error_msg = str(e).lower()
            if "access" in error_msg or "denied" in error_msg:
                raise SMBError("無權限存取此資料夾") from e
            raise SMBError(f"瀏覽資料夾失敗：{e}") from e

        finally:
            if tree:
                try:
                    tree.disconnect()
                except:
                    pass

        return items
```

### Step 6：讀取檔案

```python
class SMBService:
    # ... 前面的程式碼 ...

    def read_file(self, share_name: str, path: str) -> bytes:
        """讀取檔案內容

        Args:
            share_name: 共享名稱
            path: 檔案路徑

        Returns:
            檔案內容（bytes）
        """
        if self._session is None:
            raise SMBError("尚未認證")

        tree = None
        try:
            tree = TreeConnect(
                self._session,
                rf"\\{self.host}\{share_name}"
            )
            tree.connect()

            # 正規化路徑
            file_path = path.strip("/").replace("/", "\\")

            # 開啟檔案
            file_open = Open(tree, file_path)
            file_open.create(
                ImpersonationLevel.Impersonation,
                FilePipePrinterAccessMask.FILE_READ_DATA,
                FileAttributes.FILE_ATTRIBUTE_NORMAL,
                ShareAccess.FILE_SHARE_READ,
                CreateDisposition.FILE_OPEN,
                CreateOptions.FILE_NON_DIRECTORY_FILE,
            )

            # 分段讀取（避免 SMB credit 限制）
            file_size = file_open.end_of_file
            chunk_size = 65536  # 64KB
            chunks = []
            offset = 0

            while offset < file_size:
                read_size = min(chunk_size, file_size - offset)
                chunk = file_open.read(offset, read_size)
                chunks.append(chunk)
                offset += read_size

            file_open.close()
            return b"".join(chunks)

        except Exception as e:
            error_msg = str(e).lower()
            if "access" in error_msg:
                raise SMBError("無權限讀取此檔案") from e
            if "not found" in error_msg:
                raise SMBError("檔案不存在") from e
            raise SMBError(f"讀取檔案失敗：{e}") from e

        finally:
            if tree:
                try:
                    tree.disconnect()
                except:
                    pass
```

### Step 7：使用範例

```python
def create_smb_service(username: str, password: str, host: str = "192.168.11.50"):
    """工廠函數：建立 SMB 服務實例"""
    return SMBService(host=host, username=username, password=password)


# 使用範例
if __name__ == "__main__":
    # 用 context manager 確保連線正確關閉
    with create_smb_service("user", "password") as smb:
        # 列出共享
        shares = smb.list_shares()
        print("可用共享：", shares)

        # 瀏覽資料夾
        items = smb.browse_directory("home", "文件")
        for item in items:
            icon = "📁" if item["type"] == "directory" else "📄"
            print(f"{icon} {item['name']}")

        # 讀取檔案
        content = smb.read_file("home", "文件/readme.txt")
        print(content.decode("utf-8"))
```

---

## 進階技巧與踩坑紀錄

### 1. 為什麼要混用 smbprotocol 和 smbclient？

`smbprotocol` 是純 Python 實作，專注於檔案操作，但它沒有實作 SRVSVC（Server Service）RPC 介面，所以無法呼叫 `NetShareEnum` 來列出共享。

```
列出共享需要的 RPC 呼叫：
IPC$ → SRVSVC → NetShareEnum → 共享清單

smbprotocol 沒有實作這個！
```

解決方案：用 `smbclient -L -g` 命令列出共享，其他操作用 `smbprotocol`。

### 2. 分段讀取避免 SMB Credit 限制

SMB 協定有「信用」機制限制單次請求的資料量：

```python
# ❌ 一次讀取整個檔案（大檔案會失敗）
content = file_open.read(0, file_size)

# ✅ 分段讀取
chunk_size = 65536  # 64KB
while offset < file_size:
    chunk = file_open.read(offset, min(chunk_size, file_size - offset))
    chunks.append(chunk)
    offset += len(chunk)
```

### 3. 路徑正規化

Windows 用 `\`，Unix 用 `/`，API 傳過來的可能有各種格式：

```python
def normalize_path(path: str) -> str:
    """正規化路徑為 Windows 格式"""
    return path.strip("/").replace("/", "\\")

# /home/文件/報告.txt → home\文件\報告.txt
```

### 4. 高階 API：smbclient 模組

`smbprotocol` 套件還提供了高階 API `smbclient`（是 Python 模組，不是 CLI）：

```python
from smbclient import (
    register_session,
    rename as smb_rename,
    remove as smb_remove,
    rmdir as smb_rmdir,
    listdir as smb_listdir,
)

# 註冊 session（會被後續操作使用）
register_session(host, username=username, password=password)

# 重命名
smb_rename(r"\\192.168.11.50\home\old.txt", r"\\192.168.11.50\home\new.txt")

# 刪除檔案
smb_remove(r"\\192.168.11.50\home\file.txt")

# 刪除空資料夾
smb_rmdir(r"\\192.168.11.50\home\empty_folder")

# 列出資料夾
files = smb_listdir(r"\\192.168.11.50\home")
```

### 5. 連線池考量

目前每次操作都建立新連線，高併發時可能有效能問題。未來可以考慮：

```python
# 簡單的連線池示意
class SMBConnectionPool:
    def __init__(self, max_connections: int = 10):
        self._pool = []
        self._max = max_connections

    def get_connection(self, host, username, password):
        # 檢查是否有可用連線
        # 如果沒有且未達上限，建立新連線
        # 如果達上限，等待或報錯
        pass

    def release(self, connection):
        # 歸還連線到池中
        pass
```

---

## 小結

這篇我們完成了：

1. **SMB 協定概念**：版本、用途、Python 套件選擇
2. **混合策略**：smbclient CLI 列出共享 + smbprotocol 檔案操作
3. **基本操作**：連線、認證、瀏覽、讀取
4. **實戰技巧**：分段讀取、路徑正規化、高階 API

**系統架構**：

```
Web 前端
    │
    │ HTTP REST API
    ▼
FastAPI 後端
    │
    ├── list_shares() ──────> smbclient CLI ──> NAS
    │
    └── browse/read/write ──> smbprotocol ───> NAS
```

下一篇，我們要把這些功能包裝成 **RESTful API**，讓前端可以上傳、下載、刪除檔案。

---

## 完整程式碼

完整的 `SMBService` 類別包含：
- 連線管理（connect/disconnect/context manager）
- 列出共享（smbclient CLI）
- 瀏覽資料夾
- 讀取檔案
- 寫入檔案
- 刪除檔案/資料夾
- 重命名
- 建立資料夾
- 搜尋檔案

完整的 SMBService 類別程式碼較長，核心方法已在上方「跟著做」章節中完整呈現。
