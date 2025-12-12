---
layout: post
title: "前端整合：xterm.js 打造完整終端體驗"
subtitle: "讓瀏覽器變成真正的終端機"
date: 2025-12-11
categories: [Web Terminal]
tags: [JavaScript, xterm.js, Terminal, 前端, Socket.IO]
---

> **📚 Web 終端機系列**
> 1. [什麼是 PTY？讓網頁跑出真正的 Terminal]({% post_url 2025-12-11-web-terminal-part1-pty %})
> 2. [後端架構：FastAPI + Socket.IO 雙向通訊]({% post_url 2025-12-11-web-terminal-part2-socketio %})
> 3. **前端整合：xterm.js 打造完整終端體驗** ← 目前閱讀

---

## 這篇文章要解決什麼問題？

前兩篇我們完成了後端：PTY 提供真正的 shell，Socket.IO 實現即時通訊。但使用者看不到黑底白字的終端機畫面，也沒辦法輸入指令。

**終端機不只是顯示文字**，它還要處理：

1. **ANSI 轉義序列**：顏色、游標移動、清除畫面
2. **特殊按鍵**：方向鍵、Ctrl+C、Tab 自動補全
3. **視窗大小同步**：拖曳縮放視窗，終端機行列數要跟著變
4. **效能優化**：大量輸出（如 `cat` 大檔案）不能卡住

**老闆**：「我出差只帶 iPad，臨時要看 Server log 怎麼辦？」  
**後端工程師**：「後端 PTY 和 Socket.IO 都做好了，現在要做前端介面。」  
**前端工程師**：「我用 xterm.js，可以在網頁上顯示完整的終端機畫面，顏色、游標都有。」  
**老闆**：「所以平板開瀏覽器就能用？」  
**前端工程師**：「對，任何裝置都行，還能自訂主題配色。」

---

## 技術概念

### xterm.js 是什麼？

xterm.js 是一個在瀏覽器中渲染終端機的函式庫，由 VS Code 團隊維護。它不是模擬終端機，而是一個完整的終端機 emulator：

```
使用者輸入 "ls" + Enter
        │
        ▼
    xterm.js
    ┌─────────────────────────┐
    │ 1. 捕捉鍵盤事件          │
    │ 2. 產生 ANSI 序列        │ ──> Socket.IO ──> PTY
    │ 3. 解析後端回傳的 ANSI   │ <── Socket.IO <── PTY
    │ 4. 渲染到 Canvas/DOM     │
    └─────────────────────────┘
        │
        ▼
    瀏覽器畫面顯示彩色輸出
```

### ANSI 轉義序列速查

終端機用特殊字元序列控制顏色和游標：

| 序列 | 效果 |
|------|------|
| `\x1b[31m` | 紅色文字 |
| `\x1b[32m` | 綠色文字 |
| `\x1b[0m` | 重置樣式 |
| `\x1b[2J` | 清除畫面 |
| `\x1b[H` | 游標移到左上角 |
| `\r\n` | 換行（終端機慣例） |

xterm.js 會自動解析這些序列並正確渲染。

### xterm.js 外掛架構

xterm.js 使用 addon（外掛）擴展功能：

| Addon | 功能 |
|-------|------|
| `xterm-addon-fit` | 自動調整 cols/rows 以填滿容器 |
| `xterm-addon-web-links` | 讓 URL 可點擊 |
| `xterm-addon-search` | 搜尋終端機內容 |
| `xterm-addon-webgl` | WebGL 渲染（效能更好） |

---

## 跟著做：Step by Step

### Step 1：引入 xterm.js

```html
<!-- CDN 引入 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5/css/xterm.css">
<script src="https://cdn.jsdelivr.net/npm/xterm@5/lib/xterm.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8/lib/xterm-addon-fit.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9/lib/xterm-addon-web-links.js"></script>

<!-- Socket.IO Client -->
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
```

### Step 2：建立 Socket.IO 客戶端模組

```javascript
// socket-client.js
const SocketClient = (function() {
    let socket = null;
    let isConnected = false;

    // 連線到後端
    function connect() {
        if (socket && isConnected) return;

        socket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
            reconnection: true,          // 自動重連
            reconnectionAttempts: 5,     // 重連次數
            reconnectionDelay: 1000      // 重連間隔 (ms)
        });

        socket.on('connect', () => {
            isConnected = true;
            console.log('Socket connected:', socket.id);
        });

        socket.on('disconnect', (reason) => {
            isConnected = false;
            console.log('Socket disconnected:', reason);
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error.message);
        });
    }

    // 發送事件
    function emit(event, data) {
        if (!socket || !isConnected) {
            console.error('Not connected');
            return false;
        }
        socket.emit(event, data);
        return true;
    }

    // 發送事件並等待回應
    function emitWithAck(event, data) {
        return new Promise((resolve, reject) => {
            if (!socket || !isConnected) {
                reject(new Error('Not connected'));
                return;
            }
            // Socket.IO v4 支援 callback 作為 acknowledgement
            socket.emit(event, data, (response) => {
                resolve(response);
            });
        });
    }

    // 監聽事件
    function on(event, handler) {
        if (socket) {
            socket.on(event, handler);
        }
    }

    // 移除監聽
    function off(event, handler) {
        if (socket) {
            socket.off(event, handler);
        }
    }

    return { connect, emit, emitWithAck, on, off };
})();
```

### Step 3：建立終端機實例

```javascript
// terminal-instance.js
class TerminalInstance {
    constructor(containerId) {
        this.containerId = containerId;
        this.sessionId = null;
        this.terminal = null;
        this.fitAddon = null;
        this.resizeObserver = null;
        this.connected = false;
    }

    /**
     * 初始化終端機
     */
    init() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            throw new Error(`Container ${this.containerId} not found`);
        }

        // 建立 xterm 實例
        this.terminal = new Terminal({
            cursorBlink: true,           // 游標閃爍
            cursorStyle: 'block',        // 游標樣式：block/underline/bar
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 14,
            lineHeight: 1.2,
            theme: {
                background: '#1e1e2e',   // 背景色
                foreground: '#cdd6f4',   // 前景色
                cursor: '#f5e0dc',       // 游標色
                // ANSI 16 色
                black: '#45475a',
                red: '#f38ba8',
                green: '#a6e3a1',
                yellow: '#f9e2af',
                blue: '#89b4fa',
                magenta: '#f5c2e7',
                cyan: '#94e2d5',
                white: '#bac2de',
                brightBlack: '#585b70',
                brightRed: '#f38ba8',
                brightGreen: '#a6e3a1',
                brightYellow: '#f9e2af',
                brightBlue: '#89b4fa',
                brightMagenta: '#f5c2e7',
                brightCyan: '#94e2d5',
                brightWhite: '#a6adc8'
            }
        });

        // 載入外掛
        this.fitAddon = new FitAddon.FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon.WebLinksAddon());

        // 開啟終端機（渲染到容器）
        this.terminal.open(container);

        // 初始調整大小
        setTimeout(() => this.fit(), 0);

        // 監聽容器大小變化
        this.resizeObserver = new ResizeObserver(() => this.fit());
        this.resizeObserver.observe(container);

        // 監聽使用者輸入
        this.terminal.onData(data => {
            if (this.sessionId && this.connected) {
                SocketClient.emit('terminal:input', {
                    session_id: this.sessionId,
                    data: data
                });
            }
        });

        // 設定 Socket 事件處理
        this.setupSocketHandlers();

        // 建立 PTY session
        this.createSession();
    }

    /**
     * 設定 Socket.IO 事件處理
     */
    setupSocketHandlers() {
        // 接收 PTY 輸出
        SocketClient.on('terminal:output', (data) => {
            if (data.session_id === this.sessionId) {
                this.terminal.write(data.data);
            }
        });

        // 處理錯誤
        SocketClient.on('terminal:error', (data) => {
            if (data.session_id === this.sessionId) {
                // 用紅色顯示錯誤
                this.terminal.write(`\r\n\x1b[31mError: ${data.error}\x1b[0m\r\n`);
            }
        });

        // Session 關閉
        SocketClient.on('terminal:closed', (data) => {
            if (data.session_id === this.sessionId) {
                this.terminal.write('\r\n\x1b[33mSession ended.\x1b[0m\r\n');
                this.connected = false;
            }
        });
    }

    /**
     * 建立 PTY Session
     */
    async createSession() {
        this.terminal.write('Connecting...\r\n');

        try {
            const response = await SocketClient.emitWithAck('terminal:create', {
                cols: this.terminal.cols,
                rows: this.terminal.rows
            });

            if (response.success) {
                this.sessionId = response.session_id;
                this.connected = true;
                console.log('Terminal session created:', this.sessionId);
            } else {
                this.terminal.write(`\x1b[31mFailed: ${response.error}\x1b[0m\r\n`);
            }
        } catch (e) {
            this.terminal.write(`\x1b[31mConnection error: ${e.message}\x1b[0m\r\n`);
        }
    }

    /**
     * 調整終端機大小以填滿容器
     */
    fit() {
        if (!this.fitAddon || !this.terminal) return;

        try {
            this.fitAddon.fit();

            // 通知後端調整 PTY 大小
            if (this.sessionId && this.connected) {
                SocketClient.emit('terminal:resize', {
                    session_id: this.sessionId,
                    cols: this.terminal.cols,
                    rows: this.terminal.rows
                });
            }
        } catch (e) {
            // 初始化時可能會失敗，忽略
        }
    }

    /**
     * 銷毀終端機
     */
    destroy() {
        // 關閉 PTY session
        if (this.sessionId && this.connected) {
            SocketClient.emit('terminal:close', {
                session_id: this.sessionId
            });
        }

        // 清理 ResizeObserver
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // 銷毀 xterm
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
}
```

### Step 4：整合使用

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5/css/xterm.css">
    <style>
        #terminal-container {
            width: 800px;
            height: 500px;
            background: #1e1e2e;
        }
    </style>
</head>
<body>
    <div id="terminal-container"></div>

    <!-- Scripts -->
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm@5/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8/lib/xterm-addon-fit.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9/lib/xterm-addon-web-links.js"></script>
    <script src="socket-client.js"></script>
    <script src="terminal-instance.js"></script>
    <script>
        // 連線並建立終端機
        SocketClient.connect();
        const terminal = new TerminalInstance('terminal-container');
        terminal.init();
    </script>
</body>
</html>
```

---

## 進階技巧與踩坑紀錄

### 1. 從 CSS 變數讀取主題色

讓終端機顏色跟著系統主題切換：

```javascript
/**
 * 從 CSS 變數建立 xterm 主題
 */
function getTerminalTheme() {
    const getCSSVar = (name) =>
        getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();

    return {
        background: getCSSVar('--terminal-bg'),
        foreground: getCSSVar('--terminal-fg'),
        cursor: getCSSVar('--terminal-cursor'),
        black: getCSSVar('--terminal-black'),
        red: getCSSVar('--terminal-red'),
        green: getCSSVar('--terminal-green'),
        // ... 其他顏色
    };
}

// 使用
this.terminal = new Terminal({
    theme: getTerminalTheme()
});

// 主題切換時更新
document.addEventListener('themeChanged', () => {
    this.terminal.options.theme = getTerminalTheme();
});
```

### 2. 斷線重連 UI

給使用者選擇恢復之前的 session 還是建立新的：

```javascript
/**
 * 檢查可恢復的 sessions
 */
async checkAndConnect() {
    this.terminal.write('檢查連線狀態...\r\n');

    try {
        const response = await SocketClient.emitWithAck('terminal:list', {});
        const sessions = response.sessions || [];

        if (sessions.length > 0) {
            this.showReconnectDialog(sessions);
        } else {
            this.createSession();
        }
    } catch (e) {
        this.createSession();
    }
}

/**
 * 顯示重連對話框
 */
showReconnectDialog(sessions) {
    // 建立 overlay
    const overlay = document.createElement('div');
    overlay.className = 'terminal-reconnect-overlay';
    overlay.innerHTML = `
        <div class="terminal-reconnect-dialog">
            <h3>發現未關閉的終端機</h3>
            <ul class="session-list">
                ${sessions.map(s => `
                    <li data-session-id="${s.session_id}">
                        <code>${s.cwd || '~'}</code>
                        <span>${new Date(s.last_activity).toLocaleTimeString()}</span>
                    </li>
                `).join('')}
            </ul>
            <button class="btn-new">建立新的</button>
        </div>
    `;

    // 處理點擊事件
    overlay.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            overlay.remove();
            this.reconnectSession(li.dataset.sessionId);
        });
    });

    overlay.querySelector('.btn-new').addEventListener('click', () => {
        overlay.remove();
        this.createSession();
    });

    this.container.appendChild(overlay);
}

/**
 * 重新連接到現有 session
 */
async reconnectSession(sessionId) {
    this.terminal.write('正在恢復 session...\r\n');

    const response = await SocketClient.emitWithAck('terminal:reconnect', {
        session_id: sessionId
    });

    if (response.success) {
        this.sessionId = response.session_id;
        this.connected = true;
        this.terminal.write('\x1b[32mSession 已恢復！\x1b[0m\r\n');
        this.fit(); // 同步視窗大小
    } else {
        this.terminal.write('\x1b[33mSession 已過期\x1b[0m\r\n');
        this.createSession();
    }
}
```

### 3. 複製貼上支援

xterm.js 預設不支援 Ctrl+C/V 複製貼上（Ctrl+C 在終端機是中斷訊號），需要手動處理：

```javascript
// 選取文字時自動複製
this.terminal.onSelectionChange(() => {
    const selection = this.terminal.getSelection();
    if (selection) {
        navigator.clipboard.writeText(selection);
    }
});

// 右鍵貼上
this.terminal.attachCustomKeyEventHandler((event) => {
    // Ctrl+Shift+C 複製
    if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        const selection = this.terminal.getSelection();
        if (selection) {
            navigator.clipboard.writeText(selection);
        }
        return false; // 阻止預設行為
    }

    // Ctrl+Shift+V 貼上
    if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        navigator.clipboard.readText().then(text => {
            if (text && this.connected) {
                SocketClient.emit('terminal:input', {
                    session_id: this.sessionId,
                    data: text
                });
            }
        });
        return false;
    }

    return true; // 其他按鍵正常處理
});
```

### 4. 效能優化：大量輸出

執行 `cat` 大檔案或 `find /` 時，輸出非常快。用 `requestAnimationFrame` 批次渲染：

```javascript
class TerminalInstance {
    constructor() {
        // ...
        this.outputBuffer = '';
        this.renderScheduled = false;
    }

    setupSocketHandlers() {
        SocketClient.on('terminal:output', (data) => {
            if (data.session_id === this.sessionId) {
                // 累積到 buffer
                this.outputBuffer += data.data;
                this.scheduleRender();
            }
        });
    }

    scheduleRender() {
        if (this.renderScheduled) return;

        this.renderScheduled = true;
        requestAnimationFrame(() => {
            if (this.outputBuffer) {
                this.terminal.write(this.outputBuffer);
                this.outputBuffer = '';
            }
            this.renderScheduled = false;
        });
    }
}
```

### 5. 狀態列顯示

讓使用者知道目前的連線狀態和終端機大小：

```javascript
/**
 * 更新狀態列
 */
updateStatusBar() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const sizeDisplay = document.querySelector('.terminal-size');

    if (statusDot) {
        statusDot.classList.toggle('connected', this.connected);
    }

    if (statusText) {
        statusText.textContent = this.connected ? '已連線' : '已斷線';
    }

    if (sizeDisplay) {
        sizeDisplay.textContent = `${this.terminal.cols}x${this.terminal.rows}`;
    }
}

// 在 createSession 和 resize 後呼叫
```

---

## 小結

這篇我們完成了 Web 終端機的最後一塊：

1. **xterm.js 基礎**：建立終端機、設定主題、載入外掛
2. **Socket.IO 整合**：發送輸入、接收輸出、調整大小
3. **進階功能**：主題切換、斷線重連、複製貼上、效能優化

**完整的資料流**：

```
使用者按下按鍵
    │
    ▼
xterm.js 捕捉 ─── terminal.onData() ───>
    │
    │ Socket.IO: terminal:input
    ▼
FastAPI Socket.IO Server
    │
    │ PTY write
    ▼
ptyprocess (bash)
    │
    │ PTY read (非同步)
    ▼
FastAPI Socket.IO Server
    │
    │ Socket.IO: terminal:output
    ▼
xterm.js ─── terminal.write() ───> 畫面顯示
```

恭喜！你現在擁有一個完整的 Web 終端機系統。

---

## 完整程式碼

### HTML 結構

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <title>Web Terminal</title>

    <!-- xterm.js -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5/css/xterm.css">

    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: system-ui, sans-serif;
            background: #181825;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .terminal-window {
            width: 900px;
            height: 600px;
            background: #1e1e2e;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
        }

        .terminal-header {
            background: #313244;
            padding: 8px 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .terminal-title {
            color: #cdd6f4;
            font-size: 13px;
        }

        .terminal-container {
            flex: 1;
            padding: 4px;
        }

        .terminal-container .xterm {
            height: 100%;
        }

        .terminal-status-bar {
            background: #11111b;
            padding: 4px 12px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #6c7086;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #fab387;
        }

        .status-dot.connected {
            background: #a6e3a1;
        }

        /* 重連對話框 */
        .terminal-reconnect-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }

        .terminal-reconnect-dialog {
            background: #1e1e2e;
            border: 1px solid #45475a;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            color: #cdd6f4;
        }

        .session-list {
            list-style: none;
            margin: 16px 0;
        }

        .session-list li {
            padding: 10px;
            background: #313244;
            border-radius: 4px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .session-list li:hover {
            background: #45475a;
        }

        .btn-new {
            background: #89b4fa;
            color: #1e1e2e;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="terminal-window">
        <div class="terminal-header">
            <span class="terminal-title">Terminal</span>
        </div>
        <div class="terminal-container" id="terminal"></div>
        <div class="terminal-status-bar">
            <div class="status-indicator">
                <span class="status-dot"></span>
                <span class="status-text">連線中...</span>
            </div>
            <span class="terminal-size"></span>
        </div>
    </div>

    <!-- Scripts -->
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm@5/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8/lib/xterm-addon-fit.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9/lib/xterm-addon-web-links.js"></script>

    <script>
    // ===== Socket Client =====
    const SocketClient = (function() {
        let socket = null;
        let isConnected = false;

        function connect() {
            socket = io(window.location.origin, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5
            });

            socket.on('connect', () => {
                isConnected = true;
                console.log('Connected:', socket.id);
            });

            socket.on('disconnect', () => {
                isConnected = false;
                console.log('Disconnected');
            });
        }

        function emit(event, data) {
            if (socket && isConnected) socket.emit(event, data);
        }

        function emitWithAck(event, data) {
            return new Promise((resolve, reject) => {
                if (!socket || !isConnected) return reject(new Error('Not connected'));
                socket.emit(event, data, resolve);
            });
        }

        function on(event, handler) {
            if (socket) socket.on(event, handler);
        }

        return { connect, emit, emitWithAck, on };
    })();

    // ===== Terminal Instance =====
    class TerminalInstance {
        constructor(containerId) {
            this.container = document.getElementById(containerId);
            this.sessionId = null;
            this.terminal = null;
            this.fitAddon = null;
            this.connected = false;
        }

        init() {
            this.terminal = new Terminal({
                cursorBlink: true,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 14,
                theme: {
                    background: '#1e1e2e',
                    foreground: '#cdd6f4',
                    cursor: '#f5e0dc',
                    black: '#45475a', red: '#f38ba8',
                    green: '#a6e3a1', yellow: '#f9e2af',
                    blue: '#89b4fa', magenta: '#f5c2e7',
                    cyan: '#94e2d5', white: '#bac2de'
                }
            });

            this.fitAddon = new FitAddon.FitAddon();
            this.terminal.loadAddon(this.fitAddon);
            this.terminal.loadAddon(new WebLinksAddon.WebLinksAddon());

            this.terminal.open(this.container);
            setTimeout(() => this.fit(), 0);

            new ResizeObserver(() => this.fit()).observe(this.container);

            this.terminal.onData(data => {
                if (this.sessionId && this.connected) {
                    SocketClient.emit('terminal:input', {
                        session_id: this.sessionId,
                        data: data
                    });
                }
            });

            this.terminal.onResize(({ cols, rows }) => {
                document.querySelector('.terminal-size').textContent = `${cols}x${rows}`;
            });

            this.setupSocketHandlers();
            this.createSession();
        }

        setupSocketHandlers() {
            SocketClient.on('terminal:output', (data) => {
                if (data.session_id === this.sessionId) {
                    this.terminal.write(data.data);
                }
            });

            SocketClient.on('terminal:error', (data) => {
                if (data.session_id === this.sessionId) {
                    this.terminal.write(`\r\n\x1b[31mError: ${data.error}\x1b[0m\r\n`);
                }
            });
        }

        async createSession() {
            this.terminal.write('Connecting...\r\n');

            try {
                const response = await SocketClient.emitWithAck('terminal:create', {
                    cols: this.terminal.cols,
                    rows: this.terminal.rows
                });

                if (response.success) {
                    this.sessionId = response.session_id;
                    this.connected = true;
                    this.updateStatus();
                } else {
                    this.terminal.write(`\x1b[31m${response.error}\x1b[0m\r\n`);
                }
            } catch (e) {
                this.terminal.write(`\x1b[31m${e.message}\x1b[0m\r\n`);
            }
        }

        fit() {
            if (this.fitAddon) {
                this.fitAddon.fit();
                if (this.sessionId && this.connected) {
                    SocketClient.emit('terminal:resize', {
                        session_id: this.sessionId,
                        cols: this.terminal.cols,
                        rows: this.terminal.rows
                    });
                }
            }
        }

        updateStatus() {
            const dot = document.querySelector('.status-dot');
            const text = document.querySelector('.status-text');
            if (dot) dot.classList.toggle('connected', this.connected);
            if (text) text.textContent = this.connected ? '已連線' : '已斷線';
        }
    }

    // ===== 啟動 =====
    SocketClient.connect();
    const term = new TerminalInstance('terminal');
    term.init();
    </script>
</body>
</html>
```

這個單一 HTML 檔案包含了完整的 Web 終端機前端實作，可以直接搭配前兩篇的後端程式碼使用。
