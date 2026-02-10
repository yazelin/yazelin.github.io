---
layout: post
title: "認證系統：用 NAS 帳號實現 SSO 效果"
subtitle: "不用另外管理帳號密碼，登入一次就能存取檔案"
date: 2025-12-12
categories: [Security]
tags: [安全, 認證, Session, FastAPI, Python]
---

![認證系統：用 NAS 帳號實現 SSO 效果](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-12-security-part1-auth.png)

> **📚 系列文章**
> 1. [認證系統：用 NAS 帳號實現 SSO 效果]({% post_url 2025-12-12-security-part1-auth %}) ← 目前閱讀
> 2. [登入追蹤：裝置指紋與地理位置記錄]({% post_url 2025-12-12-security-part2-tracking %})

---

## 這篇文章要解決什麼問題？

**使用者**：「又要記一組新密碼？我已經有公司信箱、NAS、ERP 三組密碼了...」  
**IT**：「大家密碼都設太簡單，還到處貼便利貼，資安風險很高。」  
**老闆**：「有沒有辦法讓員工少記密碼，又能確保安全？」  
**後端工程師**：「我們直接用 NAS 帳號驗證，員工用熟悉的帳密登入，我們不另外存密碼，安全責任回歸 NAS。」  
**IT**：「這樣離職員工停用 NAS 帳號，這個系統也自動不能用了，管理很方便！」

開發內部系統時，最頭痛的問題之一就是**帳號管理**：

- 要不要自己建一套帳號密碼系統？
- 使用者又要記一組新密碼？
- 密碼忘記了誰來重設？
- 密碼怎麼安全地儲存？

如果公司已經有 NAS（網路儲存設備），裡面本來就有一套帳號系統。能不能**借用 NAS 的帳號來登入我們的系統**？這樣使用者用熟悉的帳密就能登入，還能直接存取 NAS 上的檔案。這就是本篇要實作的「**用 NAS 帳號實現 SSO 效果**」。

---

## 技術概念

### 什麼是 SSO？

SSO（Single Sign-On，單一登入）是指**使用者只需要登入一次，就能存取多個系統**。

```
                    登入一次
使用者 ──────────────────────▶ 公司 NAS
                              ╱  │  ╲
                             ╱   │   ╲
                            ▼    ▼    ▼
                        系統A  系統B  系統C
```

真正的 SSO 需要 LDAP、OAuth 等協定，設定較複雜。我們的做法是**簡化版 SSO**：

- 使用者輸入 NAS 帳密
- 我們拿這組帳密去 NAS 驗證
- 驗證成功就發 Session Token

### Session Token 機制

登入成功後，我們不可能每次 API 請求都要求使用者輸入帳密。所以需要一個「通行證」來證明「這個人已經登入過了」。

```
登入流程：
使用者 ──帳號密碼──▶ 後端 ──SMB認證──▶ NAS
                     │
                     ▼ 驗證成功
               產生 Session Token
                     │
                     ▼
使用者 ◀──Token──────┘
        存入 localStorage

後續請求：
使用者 ──帶 Token──▶ 後端 ──查詢 Token──▶ Session Store
                     │
                     ▼ Token 有效
               回傳資料或執行操作
```

### 我們的 Session 設計

| 項目 | 選擇 | 原因 |
|------|------|------|
| Token 格式 | UUID v4 | 足夠隨機，不可預測 |
| 儲存位置 | 後端記憶體 | 簡單、快速、重啟即失效 |
| 有效時間 | 8 小時 | 一個工作天 |
| 密碼暫存 | 是 | 需要密碼才能存取 NAS 檔案 |

---

## 跟著做：Step by Step

### 步驟 1：定義 Session 資料結構

首先定義 Session 需要儲存哪些資料：

```python
# models/auth.py
from dataclasses import dataclass
from datetime import datetime

@dataclass
class SessionData:
    """Session 資料結構"""
    username: str           # 使用者帳號
    password: str           # SMB 密碼（後續檔案操作需要）
    nas_host: str           # NAS 主機位址
    user_id: int | None     # 資料庫使用者 ID
    created_at: datetime    # 建立時間
    expires_at: datetime    # 過期時間
```

為什麼要存密碼？因為後續使用者要瀏覽 NAS 檔案時，每次 SMB 連線都需要帳密。

### 步驟 2：實作 Session Manager

接下來建立管理 Session 的類別：

```python
# services/session.py
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Optional


class SessionManager:
    """Session 管理器

    以記憶體儲存 session 資料，server 重啟後 session 失效。
    """

    def __init__(self):
        self._sessions: dict[str, SessionData] = {}
        self._cleanup_task: asyncio.Task | None = None

    def create_session(
        self,
        username: str,
        password: str,
        nas_host: str | None = None,
        user_id: int | None = None
    ) -> str:
        """建立新 session，回傳 token"""
        token = str(uuid.uuid4())  # 產生隨機 token
        now = datetime.now()

        # 預設 8 小時過期
        expires_at = now + timedelta(hours=8)

        self._sessions[token] = SessionData(
            username=username,
            password=password,
            nas_host=nas_host or "192.168.11.50",
            user_id=user_id,
            created_at=now,
            expires_at=expires_at,
        )

        return token

    def get_session(self, token: str) -> Optional[SessionData]:
        """取得 session，若過期則回傳 None"""
        session = self._sessions.get(token)
        if session is None:
            return None

        # 檢查是否過期
        if datetime.now() > session.expires_at:
            self.delete_session(token)
            return None

        return session

    def delete_session(self, token: str) -> bool:
        """刪除 session（登出用）"""
        if token in self._sessions:
            del self._sessions[token]
            return True
        return False


# 建立全域實例
session_manager = SessionManager()
```

### 步驟 3：實作登入 API

登入 API 的流程：
1. 收到帳密
2. 用 SMB 向 NAS 驗證
3. 驗證成功則建立 Session
4. 回傳 Token 給前端

```python
# api/auth.py
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from ..services.session import session_manager
from ..services.smb import create_smb_service, SMBAuthError, SMBConnectionError

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """登入請求"""
    username: str
    password: str


class LoginResponse(BaseModel):
    """登入回應"""
    success: bool
    token: str | None = None
    username: str | None = None
    error: str | None = None


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, req: Request) -> LoginResponse:
    """登入並建立 session

    使用 NAS SMB 認證驗證使用者身份。
    """
    # 建立 SMB 服務來測試認證
    smb = create_smb_service(request.username, request.password)

    try:
        # 嘗試連線 NAS，驗證帳密
        smb.test_auth()
    except SMBAuthError:
        # 帳密錯誤
        return LoginResponse(success=False, error="帳號或密碼錯誤")
    except SMBConnectionError:
        # NAS 連不上
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="無法連線至檔案伺服器",
        )

    # 認證成功，建立 session
    token = session_manager.create_session(
        username=request.username,
        password=request.password
    )

    return LoginResponse(
        success=True,
        token=token,
        username=request.username,
    )
```

### 步驟 4：實作登出 API

登出就是刪除 Session：

```python
# api/auth.py（續）
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)


def get_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    """從 Authorization header 取得 token"""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未授權，請重新登入",
        )
    return credentials.credentials


class LogoutResponse(BaseModel):
    success: bool


@router.post("/logout", response_model=LogoutResponse)
async def logout(token: str = Depends(get_token)) -> LogoutResponse:
    """登出並清除 session"""
    session_manager.delete_session(token)
    return LogoutResponse(success=True)
```

### 步驟 5：保護需要認證的 API

建立一個依賴注入函式，用來驗證 Token：

```python
# api/auth.py（續）

async def get_current_session(token: str = Depends(get_token)) -> SessionData:
    """驗證 token 並取得目前 session

    用於保護需要登入才能存取的 API。
    """
    session = session_manager.get_session(token)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未授權，請重新登入",
        )

    return session
```

使用方式：

```python
# api/nas.py
from .auth import get_current_session

@router.get("/files")
async def list_files(
    path: str,
    session: SessionData = Depends(get_current_session)
):
    """列出檔案（需要登入）"""
    # session.username 和 session.password 可用於 SMB 連線
    smb = create_smb_service(session.username, session.password)
    return smb.list_directory(path)
```

### 步驟 6：前端登入實作

```javascript
// login.js
const LoginModule = (function() {

    async function login(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            // 儲存 token 到 localStorage
            localStorage.setItem('session_token', data.token);
            localStorage.setItem('username', data.username);
            return { success: true };
        } else {
            return { success: false, error: data.error };
        }
    }

    async function logout() {
        const token = localStorage.getItem('session_token');
        if (token) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        // 清除本地儲存
        localStorage.removeItem('session_token');
        localStorage.removeItem('username');
    }

    function getToken() {
        return localStorage.getItem('session_token');
    }

    function isLoggedIn() {
        return !!getToken();
    }

    return { login, logout, getToken, isLoggedIn };
})();
```

### 步驟 7：API 請求自動帶 Token

```javascript
// api-client.js
const ApiClient = (function() {

    async function request(url, options = {}) {
        const token = LoginModule.getToken();

        // 自動加入 Authorization header
        const headers = {
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        // 若收到 401，跳轉登入頁
        if (response.status === 401) {
            LoginModule.logout();
            window.location.href = '/login.html';
            throw new Error('Session expired');
        }

        return response.json();
    }

    return {
        get: (url) => request(url),
        post: (url, data) => request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
    };
})();
```

---

## 進階技巧與踩坑紀錄

### 1. 為什麼用記憶體而不用 Redis？

| 方案 | 優點 | 缺點 |
|------|------|------|
| 記憶體 | 簡單、快速、無額外依賴 | 重啟失效、無法水平擴展 |
| Redis | 持久化、可跨服務共享 | 需額外維護、複雜度增加 |

對於**單機部署的內部系統**，記憶體儲存完全夠用。重啟後使用者重新登入即可。

### 2. Session 定期清理

過期的 Session 會累積在記憶體中，需要定期清理：

```python
class SessionManager:
    # ... 前面的程式碼 ...

    def cleanup_expired(self) -> int:
        """清理過期的 session"""
        now = datetime.now()
        expired_tokens = [
            token
            for token, session in self._sessions.items()
            if now > session.expires_at
        ]

        for token in expired_tokens:
            del self._sessions[token]

        return len(expired_tokens)

    async def start_cleanup_task(self):
        """啟動背景清理任務（每 30 分鐘執行一次）"""
        async def cleanup_loop():
            while True:
                await asyncio.sleep(30 * 60)  # 30 分鐘
                count = self.cleanup_expired()
                if count > 0:
                    print(f"Cleaned up {count} expired sessions")

        self._cleanup_task = asyncio.create_task(cleanup_loop())
```

在應用程式啟動時啟動清理任務：

```python
# main.py
@app.on_event("startup")
async def startup():
    await session_manager.start_cleanup_task()
```

### 3. 密碼安全考量

Session 中儲存明文密碼是必要的（SMB 需要），但要注意：

- **只存記憶體**：不寫入資料庫或日誌
- **重啟即失效**：Server 重啟，密碼隨之消失
- **過期即清除**：Session 過期，密碼也被清除
- **HTTPS 傳輸**：前後端通訊必須加密

### 4. Token 放 Header 還是 Query？

正常情況下，Token 應該放在 `Authorization` header。但有些情況無法設定 header，例如：

- `<img src="/api/file/xxx">`
- `<a href="/api/download/xxx">`

這時可以允許 Query Parameter：

```python
def get_session_from_token_or_query(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    token: str | None = None,  # Query parameter
) -> SessionData:
    """從 header 或 query parameter 取得 session"""
    # 優先使用 header
    actual_token = None
    if credentials is not None:
        actual_token = credentials.credentials
    elif token is not None:
        actual_token = token

    if actual_token is None:
        raise HTTPException(status_code=401, detail="未授權")

    session = session_manager.get_session(actual_token)
    if session is None:
        raise HTTPException(status_code=401, detail="Session 已過期")

    return session
```

使用方式：

```html
<!-- 圖片預覽 -->
<img src="/api/file/preview?path=/photos/test.jpg&token=xxx-xxx-xxx">
```

### 5. 取得客戶端真實 IP

如果前面有 Nginx 反向代理，`request.client.host` 會是 Nginx 的 IP。需要從 header 取得真實 IP：

```python
def get_client_ip(req: Request) -> str:
    """取得客戶端真實 IP"""
    # 檢查 X-Forwarded-For（經過代理）
    forwarded = req.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()

    # 檢查 X-Real-IP
    real_ip = req.headers.get("x-real-ip")
    if real_ip:
        return real_ip

    # 直接連線
    return req.client.host if req.client else "127.0.0.1"
```

記得在 Nginx 設定：

```nginx
location /api {
    proxy_pass http://backend:8000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 小結

這篇文章實作了：

1. **NAS SMB 認證**：借用既有帳號系統，無需自己管理密碼
2. **Session Token 機制**：登入後發放 Token，後續請求帶 Token
3. **Session Manager**：記憶體儲存、自動過期、定期清理
4. **API 認證保護**：透過依賴注入保護需要登入的 API
5. **前端整合**：localStorage 儲存、自動帶 Token

下一篇我們會加入**登入追蹤功能**，記錄每次登入的裝置、地點等資訊，偵測異常登入行為。

---

## 完整程式碼

### Session Manager

```python
"""Session 管理服務"""

import asyncio
import uuid
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional


@dataclass
class SessionData:
    """Session 資料結構"""
    username: str
    password: str
    nas_host: str
    user_id: int | None
    created_at: datetime
    expires_at: datetime


class SessionManager:
    """Session 管理器"""

    def __init__(self, ttl_hours: int = 8):
        self._sessions: dict[str, SessionData] = {}
        self._cleanup_task: asyncio.Task | None = None
        self._ttl_hours = ttl_hours

    def create_session(
        self,
        username: str,
        password: str,
        nas_host: str = "192.168.11.50",
        user_id: int | None = None
    ) -> str:
        """建立新 session，回傳 token"""
        token = str(uuid.uuid4())
        now = datetime.now()
        expires_at = now + timedelta(hours=self._ttl_hours)

        self._sessions[token] = SessionData(
            username=username,
            password=password,
            nas_host=nas_host,
            user_id=user_id,
            created_at=now,
            expires_at=expires_at,
        )

        return token

    def get_session(self, token: str) -> Optional[SessionData]:
        """取得 session，若過期則回傳 None"""
        session = self._sessions.get(token)
        if session is None:
            return None

        if datetime.now() > session.expires_at:
            self.delete_session(token)
            return None

        return session

    def delete_session(self, token: str) -> bool:
        """刪除 session"""
        if token in self._sessions:
            del self._sessions[token]
            return True
        return False

    def cleanup_expired(self) -> int:
        """清理過期 session"""
        now = datetime.now()
        expired = [t for t, s in self._sessions.items() if now > s.expires_at]
        for token in expired:
            del self._sessions[token]
        return len(expired)

    async def start_cleanup_task(self, interval_minutes: int = 30):
        """啟動背景清理任務"""
        async def cleanup_loop():
            while True:
                await asyncio.sleep(interval_minutes * 60)
                count = self.cleanup_expired()
                if count > 0:
                    print(f"Cleaned up {count} expired sessions")

        self._cleanup_task = asyncio.create_task(cleanup_loop())

    @property
    def active_count(self) -> int:
        """目前活躍 session 數量"""
        return len(self._sessions)


# 全域實例
session_manager = SessionManager()
```

### 認證 API

```python
"""認證 API"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from ..services.session import session_manager, SessionData
from ..services.smb import create_smb_service, SMBAuthError, SMBConnectionError

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    token: str | None = None
    username: str | None = None
    error: str | None = None


class LogoutResponse(BaseModel):
    success: bool


def get_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    """取得 token"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="未授權，請重新登入")
    return credentials.credentials


async def get_current_session(token: str = Depends(get_token)) -> SessionData:
    """取得目前 session（用於保護 API）"""
    session = session_manager.get_session(token)
    if session is None:
        raise HTTPException(status_code=401, detail="未授權，請重新登入")
    return session


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest) -> LoginResponse:
    """登入"""
    smb = create_smb_service(request.username, request.password)

    try:
        smb.test_auth()
    except SMBAuthError:
        return LoginResponse(success=False, error="帳號或密碼錯誤")
    except SMBConnectionError:
        raise HTTPException(status_code=503, detail="無法連線至檔案伺服器")

    token = session_manager.create_session(request.username, request.password)
    return LoginResponse(success=True, token=token, username=request.username)


@router.post("/logout", response_model=LogoutResponse)
async def logout(token: str = Depends(get_token)) -> LogoutResponse:
    """登出"""
    session_manager.delete_session(token)
    return LogoutResponse(success=True)
```

### 前端登入模組

```javascript
/**
 * 登入模組
 */
const LoginModule = (function() {
    const TOKEN_KEY = 'session_token';
    const USERNAME_KEY = 'username';

    async function login(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(USERNAME_KEY, data.username);
            return { success: true };
        }
        return { success: false, error: data.error };
    }

    async function logout() {
        const token = getToken();
        if (token) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (e) {
                // 忽略登出 API 錯誤
            }
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USERNAME_KEY);
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUsername() {
        return localStorage.getItem(USERNAME_KEY);
    }

    function isLoggedIn() {
        return !!getToken();
    }

    return { login, logout, getToken, getUsername, isLoggedIn };
})();
```
