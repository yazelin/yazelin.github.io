---
layout: post
title: "什麼是 PTY？讓網頁跑出真正的 Terminal"
subtitle: "Web 終端機從零開始（一）"
date: 2025-12-11
author: "yazelin"
categories: [Backend]
tags: [Python, PTY, Terminal, Linux]
---

> **系列文章**
> 1. **什麼是 PTY？讓網頁跑出真正的 Terminal** ← 目前閱讀
> 2. [後端架構：FastAPI + Socket.IO 雙向通訊](/2025-12-11-web-terminal-part2-socketio/)
> 3. [前端整合：xterm.js 打造完整終端體驗](/2025-12-11-web-terminal-part3-xtermjs/)

---

## 這篇文章要解決什麼問題？

你可能用過一些提供「網頁終端機」的服務：

- GitHub Codespaces
- Google Cloud Shell
- AWS CloudShell
- VS Code 的遠端開發

這些服務讓你在瀏覽器裡就能操作一個真正的 Linux 終端機。

**這是怎麼做到的？**

答案是 **PTY（Pseudo-Terminal，偽終端）**。

在 ChingTech OS 中，我們實作了一個完整的 Web 終端機，讓使用者可以：

- 在網頁中執行任何 shell 命令
- 運行互動式程式（vim、htop、top）
- 保持完整的 shell session

**IT**：「新人報到又要幫他裝 PuTTY、設定 VPN，一個人搞半天。」
**老闆**：「每個月都有新人，IT 部門忙不過來吧？」
**後端工程師**：「我們可以做 Web 終端機，打開瀏覽器就能連 Server，不用裝任何軟體。」
**IT**：「這樣新人第一天就能用，我不用到處跑了！」
**後端工程師**：「對，而且要用 PTY 技術，才能跑 vim、htop 這些互動式程式。」

---

## 技術概念

### 從 TTY 到 PTY

**TTY** 的全名是 **Teletype**，源自早期的電傳打字機。這是電腦發明前用來遠端傳輸文字的設備。

當電腦出現後，TTY 變成了「終端設備」的統稱——那個黑底白字的螢幕。

```
早期的實體終端
┌─────────────────────────────┐
│ $ ls -la                    │
│ total 32                    │
│ drwxr-xr-x  4 user user ... │
│ $ _                         │
└─────────────────────────────┘
        │
        │ 實體連接線
        ▼
    ┌───────┐
    │ 主機   │
    └───────┘
```

**PTY** 則是「偽終端」，它用軟體模擬了一個終端設備，讓程式可以「以為」自己在跟真正的終端對話。

```
PTY 的運作原理
┌─────────────────────────────┐
│      你的網頁瀏覽器          │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│   PTY Master（主端）         │ ← 你的程式控制這端
│─────────────────────────────│
│   PTY Slave（從端）          │ ← shell 連接這端
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│        /bin/bash            │
└─────────────────────────────┘
```

### 為什麼不能只用 subprocess？

你可能會想：「用 Python 的 `subprocess` 執行指令不就好了？」

```python
import subprocess

# 這樣不行嗎？
result = subprocess.run(['ls', '-la'], capture_output=True)
print(result.stdout)
```

這樣確實可以執行命令，但有幾個問題：

1. **沒有互動性**：無法運行 `vim`、`htop` 這類需要互動的程式
2. **沒有 ANSI 轉義**：顏色、游標移動等功能都不能用
3. **沒有 session**：每次執行都是獨立的，無法保持工作目錄、環境變數

PTY 解決了這些問題，因為它完整模擬了一個終端環境。

### PTY 的 Master/Slave 模型

PTY 是一對設備：

- **Master**：你的程式（Web 伺服器）透過這端讀寫資料
- **Slave**：shell 程式連接到這端，以為自己在跟真正的終端對話

```
┌──────────────┐      ┌──────────────┐
│  你的程式    │      │    shell     │
│  (Python)    │      │  (/bin/bash) │
└──────┬───────┘      └──────┬───────┘
       │                      │
       │ 讀寫                  │ 讀寫
       ▼                      ▼
┌──────────────┐      ┌──────────────┐
│ PTY Master   │◄────►│ PTY Slave    │
│ /dev/ptmx    │      │ /dev/pts/N   │
└──────────────┘      └──────────────┘
```

當你在 Master 端寫入 `ls\n`，shell 就會收到這個命令並執行。
shell 的輸出會從 Slave 傳回 Master，你的程式就能讀取並傳給瀏覽器。

---

## 跟著做：Step by Step

### 第一步：安裝 ptyprocess

我們使用 `ptyprocess` 這個 Python 套件，它封裝了 PTY 的底層操作：

```bash
uv add ptyprocess
```

> 本系列使用 [uv](https://docs.astral.sh/uv/) 管理 Python 套件。如尚未安裝，請參考 **[SDD 環境安裝篇]({{ site.baseurl }}/sdd-setup-guide/)**。

### 第二步：建立基本的 PTY Session

建立 `pty_demo.py`：

```python
"""PTY 基本範例"""
import os
import ptyprocess

# 建立 PTY 程序
# spawn() 會 fork 一個子程序，並建立 PTY 連接
pty = ptyprocess.PtyProcess.spawn(
    ['/bin/bash'],              # 要執行的程式
    dimensions=(24, 80),        # 終端機大小（行數, 列數）
    env={
        **os.environ,           # 繼承環境變數
        'TERM': 'xterm-256color',  # 設定終端類型
    }
)

print(f"PTY 已建立，PID: {pty.pid}")

# 讀取 shell 的初始輸出（例如 prompt）
try:
    initial_output = pty.read(1024)
    print("初始輸出:", repr(initial_output))
except Exception as e:
    print(f"讀取失敗: {e}")

# 發送一個命令
pty.write(b'echo "Hello from PTY!"\n')

# 讀取輸出
import time
time.sleep(0.1)  # 等待命令執行
output = pty.read(4096)
print("命令輸出:", output.decode('utf-8'))

# 再發送一個命令
pty.write(b'pwd\n')
time.sleep(0.1)
output = pty.read(4096)
print("pwd 輸出:", output.decode('utf-8'))

# 關閉 PTY
pty.terminate()
print("PTY 已關閉")
```

執行結果：

```
PTY 已建立，PID: 12345
初始輸出: b'user@hostname:~$ '
命令輸出: echo "Hello from PTY!"
Hello from PTY!
user@hostname:~$
pwd 輸出: pwd
/home/user
user@hostname:~$
PTY 已關閉
```

### 第三步：封裝成類別

建立 `terminal_session.py`：

```python
"""終端機 Session 類別"""
import os
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Optional

import ptyprocess


@dataclass
class TerminalSession:
    """單一終端機 session"""

    session_id: str
    pty: ptyprocess.PtyProcess
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)

    # 私有屬性
    _read_task: Optional[asyncio.Task] = field(default=None, repr=False)
    _output_callback: Optional[Callable] = field(default=None, repr=False)

    def write(self, data: str) -> None:
        """寫入資料到 PTY（使用者輸入）"""
        self.last_activity = datetime.now()
        self.pty.write(data.encode('utf-8'))

    def resize(self, rows: int, cols: int) -> None:
        """調整終端機視窗大小"""
        self.pty.setwinsize(rows, cols)

    def close(self) -> None:
        """關閉 PTY session"""
        # 取消讀取任務
        if self._read_task and not self._read_task.done():
            self._read_task.cancel()

        # 終止 PTY 程序
        if self.pty.isalive():
            self.pty.terminate(force=True)

    async def start_reading(self, callback: Callable) -> None:
        """開始非同步讀取 PTY 輸出"""
        self._output_callback = callback
        self._read_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        """PTY 輸出讀取迴圈"""
        loop = asyncio.get_event_loop()

        try:
            while self.pty.isalive():
                try:
                    # 使用 executor 避免阻塞 asyncio
                    data = await loop.run_in_executor(
                        None,
                        lambda: self.pty.read(4096)
                    )

                    if data and self._output_callback:
                        # 呼叫回調函式（傳送到 WebSocket）
                        await self._output_callback(self.session_id, data)

                except EOFError:
                    # PTY 已關閉
                    break
                except Exception as e:
                    print(f"讀取錯誤: {e}")
                    break

        except asyncio.CancelledError:
            pass  # 正常取消


def create_session(session_id: str, cols: int = 80, rows: int = 24) -> TerminalSession:
    """建立新的終端機 session"""

    # 取得 shell
    shell = os.environ.get('SHELL', '/bin/bash')

    # 建立 PTY
    pty = ptyprocess.PtyProcess.spawn(
        [shell],
        dimensions=(rows, cols),
        env={
            **os.environ,
            'TERM': 'xterm-256color',
            'COLORTERM': 'truecolor',
        }
    )

    return TerminalSession(
        session_id=session_id,
        pty=pty,
    )
```

### 第四步：非同步讀取測試

建立 `async_demo.py`：

```python
"""非同步 PTY 讀取範例"""
import asyncio
import uuid
from terminal_session import create_session


async def output_handler(session_id: str, data: bytes):
    """處理 PTY 輸出"""
    print(f"[輸出] {data.decode('utf-8', errors='replace')}", end='')


async def main():
    # 建立 session
    session_id = str(uuid.uuid4())
    session = create_session(session_id)

    print(f"Session 建立: {session_id}")

    # 開始讀取輸出
    await session.start_reading(output_handler)

    # 模擬使用者輸入
    await asyncio.sleep(0.5)  # 等待 shell 啟動

    # 發送命令
    session.write('echo "Hello, World!"\n')
    await asyncio.sleep(0.2)

    session.write('ls -la\n')
    await asyncio.sleep(0.5)

    session.write('uname -a\n')
    await asyncio.sleep(0.2)

    # 關閉
    session.close()
    print("\nSession 已關閉")


if __name__ == '__main__':
    asyncio.run(main())
```

---

## 進階技巧與踩坑紀錄

### 技巧一：支援互動式程式

PTY 的一大優勢是能運行互動式程式。試試 `vim`：

```python
session.write('vim test.txt\n')
await asyncio.sleep(0.5)

# 進入插入模式
session.write('i')
session.write('Hello from vim!\n')

# 按 Esc 退出插入模式
session.write('\x1b')  # ESC 字元
await asyncio.sleep(0.1)

# 儲存並退出
session.write(':wq\n')
```

### 技巧二：處理視窗大小變更

當使用者調整瀏覽器視窗時，需要同步更新 PTY 大小：

```python
def resize(self, rows: int, cols: int) -> None:
    """調整終端機視窗大小"""
    self.pty.setwinsize(rows, cols)
    # 可選：發送 SIGWINCH 信號
    # os.kill(self.pty.pid, signal.SIGWINCH)
```

### 技巧三：取得當前工作目錄

```python
def get_cwd(self) -> Optional[str]:
    """取得 PTY 當前工作目錄"""
    try:
        pid = self.pty.pid
        # 在 Linux 上，可以透過 /proc 讀取
        cwd = os.readlink(f'/proc/{pid}/cwd')
        return cwd
    except (OSError, FileNotFoundError):
        return None
```

### 踩坑紀錄

**坑 1：阻塞問題**

```python
# 錯誤：直接讀取會阻塞 asyncio
data = pty.read(4096)  # 這會阻塞！

# 正確：使用 executor
data = await loop.run_in_executor(
    None,
    lambda: pty.read(4096)
)
```

**坑 2：編碼問題**

```python
# 錯誤：假設一定是 UTF-8
data.decode('utf-8')  # 可能報錯

# 正確：使用 errors 參數
data.decode('utf-8', errors='replace')
```

**坑 3：沒有正確關閉 PTY**

```python
# 錯誤：只是停止讀取
self._read_task.cancel()

# 正確：也要終止 PTY 程序
if self.pty.isalive():
    self.pty.terminate(force=True)
```

**坑 4：環境變數遺失**

```python
# 錯誤：從空白環境開始
pty = PtyProcess.spawn(['/bin/bash'])

# 正確：繼承環境變數並設定 TERM
pty = PtyProcess.spawn(
    ['/bin/bash'],
    env={
        **os.environ,
        'TERM': 'xterm-256color',
    }
)
```

---

## 小結

### 重點整理

1. **PTY** 是軟體模擬的終端設備，讓程式可以運行互動式 shell
2. **Master/Slave** 模型：你的程式操作 Master，shell 連接 Slave
3. **ptyprocess** 封裝了 PTY 操作，使用簡單
4. **非同步讀取**：用 `run_in_executor` 避免阻塞

### 下一篇預告

下一篇我們將把 PTY 整合到 **FastAPI + Socket.IO** 後端，實現：

- WebSocket 雙向通訊
- 多終端機 session 管理
- 斷線重連機制

---

## 完整程式碼

### 完整的 TerminalSession 類別

```python
"""terminal_session.py - 完整版"""
import os
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Optional

import ptyprocess


@dataclass
class TerminalSession:
    """單一終端機 session"""

    session_id: str
    pty: ptyprocess.PtyProcess
    user_id: Optional[int] = None
    websocket_sid: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)

    _read_task: Optional[asyncio.Task] = field(default=None, repr=False)
    _output_callback: Optional[Callable] = field(default=None, repr=False)

    def write(self, data: str) -> None:
        """寫入資料到 PTY"""
        self.last_activity = datetime.now()
        self.pty.write(data.encode('utf-8'))

    def resize(self, rows: int, cols: int) -> None:
        """調整視窗大小"""
        self.pty.setwinsize(rows, cols)

    def get_cwd(self) -> Optional[str]:
        """取得當前工作目錄"""
        try:
            return os.readlink(f'/proc/{self.pty.pid}/cwd')
        except (OSError, FileNotFoundError):
            return None

    def close(self) -> None:
        """關閉 session"""
        if self._read_task and not self._read_task.done():
            self._read_task.cancel()
        if self.pty.isalive():
            self.pty.terminate(force=True)

    async def start_reading(self, callback: Callable) -> None:
        """開始讀取輸出"""
        self._output_callback = callback
        self._read_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        """讀取迴圈"""
        loop = asyncio.get_event_loop()
        try:
            while self.pty.isalive():
                try:
                    data = await loop.run_in_executor(
                        None, lambda: self.pty.read(4096)
                    )
                    if data and self._output_callback:
                        await self._output_callback(self.session_id, data)
                except EOFError:
                    break
        except asyncio.CancelledError:
            pass


def create_session(
    session_id: str,
    cols: int = 80,
    rows: int = 24,
    cwd: Optional[str] = None
) -> TerminalSession:
    """建立新 session"""
    shell = os.environ.get('SHELL', '/bin/bash')
    start_dir = cwd or os.path.expanduser('~')

    pty = ptyprocess.PtyProcess.spawn(
        [shell],
        cwd=start_dir,
        dimensions=(rows, cols),
        env={
            **os.environ,
            'TERM': 'xterm-256color',
            'COLORTERM': 'truecolor',
        }
    )

    return TerminalSession(session_id=session_id, pty=pty)
```
