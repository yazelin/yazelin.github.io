---
layout: post
title: "後端架構：FastAPI + Socket.IO 雙向通訊"
subtitle: "讓前後端像聊天一樣即時互動"
date: 2025-12-11
categories: [Web Terminal]
tags: [FastAPI, Socket.IO, WebSocket, Python, 即時通訊]
---

> **📚 Web 終端機系列**
> 1. [什麼是 PTY？讓網頁跑出真正的 Terminal]({% post_url 2025-12-11-web-terminal-part1-pty %})
> 2. **後端架構：FastAPI + Socket.IO 雙向通訊** ← 目前閱讀
> 3. [前端整合：xterm.js 打造完整終端體驗]({% post_url 2025-12-11-web-terminal-part3-xtermjs %})
>
> **📖 前置知識**：[Linux 終端機入門]({% post_url 2025-12-13-linux-basics %})

---

## 這篇文章要解決什麼問題？

上一篇我們用 PTY 建立了可以執行 vim、htop 的真正 Shell session，但現在面臨一個問題：

**傳統的 HTTP 是「你問我答」的模式**。客戶端發送請求，伺服器回應，連線就結束了。這對終端機來說完全不行，因為：

1. **PTY 會持續產生輸出**：執行 `ping google.com`，每秒都有新資料
2. **使用者隨時會輸入**：打字、按方向鍵、Ctrl+C
3. **低延遲要求**：輸入到看到回應要像本地終端一樣快

**使用者**：「這個 Web 終端機打字有點延遲，不像本機那麼順。」
**後端工程師**：「因為現在是 HTTP 輪詢，每次都要等請求回來。」
**前端工程師**：「可以改用 WebSocket 嗎？」
**後端工程師**：「我用 Socket.IO，雙向即時通訊，打字馬上就能看到回應。」
**使用者**：「這樣就跟本機一樣順了！」

---

## 技術概念

### HTTP vs WebSocket：信件 vs 電話

```
HTTP（傳統）:
┌────────┐  請求   ┌────────┐
│ Client │ ──────> │ Server │
│        │ <────── │        │
└────────┘  回應   └────────┘
    ↓ 連線斷開

WebSocket（雙向）:
┌────────┐ ═══════ ┌────────┐
│ Client │ <═════> │ Server │
│        │ 持續連線 │        │
└────────┘ ═══════ └────────┘
    ↓ 雙方隨時可發送訊息
```

**白話解釋**：HTTP 像寄信，一問一答；WebSocket 像打電話，雙方隨時都能說話。

### 為什麼選 Socket.IO 而不是原生 WebSocket？

| 特性 | 原生 WebSocket | Socket.IO |
|------|---------------|-----------|
| 自動重連 | 需自己實作 | 內建 |
| 事件命名 | 只有 message | 可自訂事件名 |
| 多房間 | 需自己實作 | 內建 room 機制 |
| Fallback | 無 | 自動降級 polling |
| Ack 機制 | 無 | 內建回應確認 |

**簡單說**：Socket.IO = WebSocket + 一堆你遲早會自己寫的功能。

### ASGI：讓 FastAPI 支援 WebSocket

FastAPI 基於 ASGI（Asynchronous Server Gateway Interface），原生就支援非同步和 WebSocket。我們用 `socketio.ASGIApp` 把 Socket.IO 和 FastAPI 整合在一起：

```
瀏覽器 ─────> Uvicorn (ASGI Server)
                    │
              socketio.ASGIApp
                    │
        ┌───────────┴───────────┐
        ↓                       ↓
    Socket.IO               FastAPI
   (WebSocket 事件)        (REST API)
```

---

## 跟著做：Step by Step

### Step 1：安裝套件

```bash
uv add python-socketio fastapi uvicorn
```

> 本系列使用 [uv](https://docs.astral.sh/uv/) 管理 Python 套件。如尚未安裝，請參考 **[uv 入門：極速 Python 套件管理]({% post_url 2025-12-13-uv-basics %})**。

### Step 2：建立 Socket.IO Server

```python
# main.py
import socketio
from contextlib import asynccontextmanager
from fastapi import FastAPI

# 1. 建立 Socket.IO 非同步伺服器
sio = socketio.AsyncServer(
    async_mode='asgi',           # 使用 ASGI 模式
    cors_allowed_origins='*'     # 開發環境允許所有來源
)

# 2. 應用程式生命週期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    """啟動和關閉時的處理"""
    print("Server starting...")
    yield
    print("Server shutting down...")

# 3. 建立 FastAPI 應用
app = FastAPI(
    title="Terminal Server",
    lifespan=lifespan
)

# 4. 整合 Socket.IO 和 FastAPI
#    這是關鍵！讓兩者共用同一個 ASGI app
socket_app = socketio.ASGIApp(sio, app)

# 5. 基本連線事件
@sio.event
async def connect(sid, environ):
    """客戶端連線時觸發"""
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    """客戶端斷線時觸發"""
    print(f"Client disconnected: {sid}")
```

### Step 3：設計終端機事件協定

我們需要定義前後端之間的「對話規則」：

| 事件名稱 | 方向 | 用途 | 資料格式 |
|---------|------|------|---------|
| `terminal:create` | 前端→後端 | 建立 session | `{cols, rows, user_id}` |
| `terminal:input` | 前端→後端 | 傳送輸入 | `{session_id, data}` |
| `terminal:resize` | 前端→後端 | 調整大小 | `{session_id, cols, rows}` |
| `terminal:close` | 前端→後端 | 關閉 session | `{session_id}` |
| `terminal:output` | 後端→前端 | PTY 輸出 | `{session_id, data}` |
| `terminal:error` | 後端→前端 | 錯誤通知 | `{session_id, error}` |

### Step 4：實作終端機事件處理

```python
# api/terminal.py
import socketio
from services.terminal import terminal_service

def register_events(sio: socketio.AsyncServer) -> None:
    """註冊終端機相關的 Socket.IO 事件"""

    # === 輸出回呼函數 ===
    # PTY 產生輸出時，透過這個函數發送到前端
    async def output_callback(session_id: str, data: bytes) -> None:
        session = terminal_service.get_session(session_id)
        if session and session.websocket_sid:
            try:
                await sio.emit(
                    'terminal:output',
                    {
                        'session_id': session_id,
                        # bytes 轉 string，處理無法解碼的字元
                        'data': data.decode('utf-8', errors='replace')
                    },
                    to=session.websocket_sid  # 只發給特定客戶端
                )
            except Exception as e:
                print(f"Error sending output: {e}")

    # 設定輸出回呼
    terminal_service.set_output_callback(output_callback)

    # === 建立終端機 ===
    @sio.on('terminal:create')
    async def handle_create(sid: str, data: dict) -> dict:
        """建立新的終端機 session"""
        try:
            session = await terminal_service.create_session(
                websocket_sid=sid,
                user_id=data.get('user_id'),
                cols=data.get('cols', 80),
                rows=data.get('rows', 24)
            )

            # 回傳成功結果（前端用 emitWithAck 接收）
            return {
                'success': True,
                'session_id': session.session_id
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    # === 接收輸入 ===
    @sio.on('terminal:input')
    async def handle_input(sid: str, data: dict) -> None:
        """接收客戶端鍵盤輸入"""
        session_id = data.get('session_id')
        input_data = data.get('data', '')

        if not session_id or not input_data:
            return

        session = terminal_service.get_session(session_id)
        # 驗證：確保是同一個連線
        if session and session.websocket_sid == sid:
            try:
                session.write(input_data)
            except Exception as e:
                await sio.emit(
                    'terminal:error',
                    {'session_id': session_id, 'error': str(e)},
                    to=sid
                )

    # === 調整視窗大小 ===
    @sio.on('terminal:resize')
    async def handle_resize(sid: str, data: dict) -> None:
        """調整終端機視窗大小"""
        session_id = data.get('session_id')
        cols = data.get('cols', 80)
        rows = data.get('rows', 24)

        session = terminal_service.get_session(session_id)
        if session and session.websocket_sid == sid:
            session.resize(rows, cols)

    # === 關閉終端機 ===
    @sio.on('terminal:close')
    async def handle_close(sid: str, data: dict) -> dict:
        """關閉終端機 session"""
        session_id = data.get('session_id')

        if not session_id:
            return {'success': False, 'error': 'Missing session_id'}

        session = terminal_service.get_session(session_id)
        if session and session.websocket_sid == sid:
            success = terminal_service.close_session(session_id)
            return {'success': success}

        return {'success': False, 'error': 'Unauthorized'}
```

### Step 5：在 main.py 註冊事件

```python
# main.py（新增）

# 在 socket_app = socketio.ASGIApp(...) 之後加入：

# 註冊終端機事件
from api import terminal
terminal.register_events(sio)
```

### Step 6：啟動伺服器

```bash
# 注意：要用 socket_app，不是 app
uvicorn main:socket_app --host 0.0.0.0 --port 8089 --reload
```

---

## 進階技巧與踩坑紀錄

### 1. 多 Session 管理架構

一個使用者可能開多個終端機視窗，每個視窗都是獨立的 session：

```python
# services/terminal.py

class TerminalService:
    def __init__(self):
        # session_id -> TerminalSession
        self._sessions: dict[str, TerminalSession] = {}
        # websocket_sid -> [session_ids]
        self._websocket_sessions: dict[str, list[str]] = {}

    async def create_session(self, websocket_sid: str, ...) -> TerminalSession:
        session = TerminalSession(...)

        # 記錄對應關係
        self._sessions[session.session_id] = session

        if websocket_sid not in self._websocket_sessions:
            self._websocket_sessions[websocket_sid] = []
        self._websocket_sessions[websocket_sid].append(session.session_id)

        return session
```

### 2. 斷線重連機制

網路不穩時，使用者不應該失去整個 shell session：

```python
# 斷線時不立即關閉 PTY，而是「分離」
@sio.on('disconnect')
async def handle_disconnect(sid: str) -> None:
    """WebSocket 斷線時保留 sessions 供重連"""
    detached = terminal_service.detach_websocket(sid)
    if detached:
        print(f"Sessions detached for reconnection: {detached}")

# 重連事件
@sio.on('terminal:reconnect')
async def handle_reconnect(sid: str, data: dict) -> dict:
    """重新連接到現有 session"""
    session_id = data.get('session_id')

    success = terminal_service.reattach_websocket(session_id, sid)
    if success:
        session = terminal_service.get_session(session_id)
        return {
            'success': True,
            'session_id': session_id,
            'created_at': session.created_at.isoformat()
        }

    return {'success': False, 'error': 'Session expired'}

# 列出可重連的 sessions
@sio.on('terminal:list')
async def handle_list(sid: str, data: dict) -> dict:
    """列出使用者可重連的 sessions"""
    user_id = data.get('user_id')
    sessions = terminal_service.get_detached_sessions(user_id)

    return {
        'sessions': [
            {
                'session_id': s.session_id,
                'created_at': s.created_at.isoformat(),
                'last_activity': s.last_activity.isoformat(),
                'cwd': s.get_cwd()  # 顯示當前目錄
            }
            for s in sessions
        ]
    }
```

### 3. Session 超時清理

```python
# services/terminal.py

class TerminalService:
    SESSION_TIMEOUT = 300  # 5 分鐘無活動

    async def start_cleanup_task(self):
        """啟動定期清理任務"""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """定期清理過期 sessions"""
        while True:
            await asyncio.sleep(60)  # 每分鐘檢查一次

            now = datetime.now()
            expired = [
                sid for sid, session in self._sessions.items()
                if (now - session.last_activity).seconds > self.SESSION_TIMEOUT
                and not session.websocket_sid  # 只清理已分離的
            ]

            for session_id in expired:
                self.close_session(session_id)
                print(f"Cleaned up expired session: {session_id}")
```

### 4. 常見錯誤處理

```python
# 事件處理的統一錯誤包裝
def safe_handler(func):
    """裝飾器：統一錯誤處理"""
    async def wrapper(sid: str, data: dict) -> dict:
        try:
            return await func(sid, data)
        except Exception as e:
            print(f"Error in {func.__name__}: {e}")
            return {'success': False, 'error': str(e)}
    return wrapper

@sio.on('terminal:create')
@safe_handler
async def handle_create(sid: str, data: dict) -> dict:
    # 主邏輯
    ...
```

### 5. 生產環境 CORS 設定

開發環境可以用 `cors_allowed_origins='*'`，但生產環境要限制：

```python
# 開發環境
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*'
)

# 生產環境
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=[
        'https://your-domain.com',
        'https://admin.your-domain.com'
    ]
)
```

---

## 小結

這篇我們完成了：

1. **理解雙向通訊**：HTTP 是一問一答，WebSocket 是隨時互動
2. **整合 FastAPI + Socket.IO**：用 `ASGIApp` 讓兩者共存
3. **設計事件協定**：terminal:create、input、output、resize、close
4. **實作進階功能**：多 session、斷線重連、超時清理

**系統架構現在是這樣**：

```
瀏覽器 (xterm.js)
    │
    │ WebSocket (Socket.IO)
    ↓
FastAPI + Socket.IO Server
    │
    │ terminal:create/input/output
    ↓
Terminal Service
    │
    │ ptyprocess
    ↓
  PTY (bash)
```

下一篇，我們要完成最後一塊拼圖：**用 xterm.js 在瀏覽器渲染終端機畫面**。

---

## 完整程式碼

### main.py

```python
"""FastAPI + Socket.IO 整合範例"""

import socketio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# === 1. 建立 Socket.IO Server ===
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*'
)


# === 2. 生命週期管理 ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式啟動和關閉時的處理"""
    # 啟動時初始化
    from services.terminal import terminal_service
    await terminal_service.start_cleanup_task()
    print("Terminal cleanup task started")

    yield

    # 關閉時清理
    await terminal_service.stop_cleanup_task()
    terminal_service.close_all()
    print("All terminal sessions closed")


# === 3. 建立 FastAPI App ===
app = FastAPI(
    title="Web Terminal API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 設定（REST API 用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === 4. 整合 ASGI App ===
socket_app = socketio.ASGIApp(sio, app)


# === 5. Socket.IO 基本事件 ===
@sio.event
async def connect(sid, environ):
    """客戶端連線"""
    print(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    """客戶端斷線"""
    print(f"Client disconnected: {sid}")


# === 6. 註冊終端機事件 ===
from api import terminal
terminal.register_events(sio)


# === 7. REST API 路由（可選）===
@app.get("/api/health")
async def health():
    """健康檢查"""
    return {"status": "healthy"}
```

### api/terminal.py

```python
"""終端機 Socket.IO 事件處理"""

import socketio
from services.terminal import terminal_service


def register_events(sio: socketio.AsyncServer) -> None:
    """註冊終端機相關的 Socket.IO 事件"""

    # === PTY 輸出回呼 ===
    async def output_callback(session_id: str, data: bytes) -> None:
        """將 PTY 輸出發送到前端"""
        session = terminal_service.get_session(session_id)
        if session and session.websocket_sid:
            try:
                await sio.emit(
                    'terminal:output',
                    {
                        'session_id': session_id,
                        'data': data.decode('utf-8', errors='replace')
                    },
                    to=session.websocket_sid
                )
            except Exception as e:
                print(f"Error sending terminal output: {e}")

    terminal_service.set_output_callback(output_callback)

    # === 建立終端機 ===
    @sio.on('terminal:create')
    async def handle_create(sid: str, data: dict) -> dict:
        try:
            session = await terminal_service.create_session(
                websocket_sid=sid,
                user_id=data.get('user_id'),
                cols=data.get('cols', 80),
                rows=data.get('rows', 24)
            )
            return {'success': True, 'session_id': session.session_id}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # === 接收輸入 ===
    @sio.on('terminal:input')
    async def handle_input(sid: str, data: dict) -> None:
        session_id = data.get('session_id')
        input_data = data.get('data', '')

        if not session_id or not input_data:
            return

        session = terminal_service.get_session(session_id)
        if session and session.websocket_sid == sid:
            try:
                session.write(input_data)
            except Exception as e:
                await sio.emit(
                    'terminal:error',
                    {'session_id': session_id, 'error': str(e)},
                    to=sid
                )

    # === 調整大小 ===
    @sio.on('terminal:resize')
    async def handle_resize(sid: str, data: dict) -> None:
        session_id = data.get('session_id')
        session = terminal_service.get_session(session_id)
        if session and session.websocket_sid == sid:
            session.resize(
                data.get('rows', 24),
                data.get('cols', 80)
            )

    # === 關閉終端機 ===
    @sio.on('terminal:close')
    async def handle_close(sid: str, data: dict) -> dict:
        session_id = data.get('session_id')
        if not session_id:
            return {'success': False, 'error': 'Missing session_id'}

        session = terminal_service.get_session(session_id)
        if session and session.websocket_sid == sid:
            return {'success': terminal_service.close_session(session_id)}
        return {'success': False, 'error': 'Unauthorized'}

    # === 列出可重連 sessions ===
    @sio.on('terminal:list')
    async def handle_list(sid: str, data: dict) -> dict:
        user_id = data.get('user_id')
        sessions = terminal_service.get_detached_sessions(user_id)
        return {
            'sessions': [
                {
                    'session_id': s.session_id,
                    'created_at': s.created_at.isoformat(),
                    'cwd': s.get_cwd()
                }
                for s in sessions
            ]
        }

    # === 重新連接 ===
    @sio.on('terminal:reconnect')
    async def handle_reconnect(sid: str, data: dict) -> dict:
        session_id = data.get('session_id')
        if terminal_service.reattach_websocket(session_id, sid):
            return {'success': True, 'session_id': session_id}
        return {'success': False, 'error': 'Session not found'}

    # === WebSocket 斷線處理 ===
    @sio.on('disconnect')
    async def handle_disconnect(sid: str) -> None:
        detached = terminal_service.detach_websocket(sid)
        if detached:
            print(f"Detached sessions: {detached}")
```

### 前端連線範例（預覽）

```javascript
// 下一篇會詳細說明
const socket = io('http://localhost:8089', {
    transports: ['websocket']
});

// 建立終端機
const response = await socket.emitWithAck('terminal:create', {
    cols: 80,
    rows: 24,
    user_id: 'user123'
});

// 監聽輸出
socket.on('terminal:output', (data) => {
    console.log('Output:', data.data);
});

// 發送輸入
socket.emit('terminal:input', {
    session_id: response.session_id,
    data: 'ls -la\r'
});
```
