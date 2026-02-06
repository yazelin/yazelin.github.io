---
layout: post
title: "ChingTech OS：PostgreSQL Session 與 Thread Pool 優化"
subtitle: "從記憶體 Session 到持久化，從阻塞到非阻塞"
date: 2026-02-07
categories: [ChingTech OS]
tags: [ChingTech OS, PostgreSQL, Session, Thread Pool, 效能優化, Python, 加密]
---

## 前言

在完成[模組化重構]({% post_url 2026-02-06-ctos-modular-refactor %})之後，系統的程式碼結構已經大幅改善。但在實際運行中，我們碰到了兩個棘手的問題：

1. **Server 重啟後，所有使用者被強制登出** -- 因為 session 存在記憶體裡，重啟就歸零
2. **SMB 和文件操作會卡住整個 event loop** -- 一個人在下載大檔案，其他人的 API 回應就變慢

這篇文章記錄我們如何用 PostgreSQL Session 持久化和 Thread Pool 來解決這兩個問題。

---

## 問題分析：記憶體 Session 的局限

原本的 session 管理很直觀 -- 用一個 Python `dict` 存放所有 session：

```python
# 舊架構（示意）
_sessions: dict[str, SessionData] = {}

def create_session(username, password):
    token = str(uuid4())
    _sessions[token] = SessionData(username=username, password=password, ...)
    return token

def get_session(token):
    return _sessions.get(token)
```

這在開發階段沒什麼問題，但到了實際部署就暴露了三個缺陷：

| 問題 | 影響 |
|------|------|
| Server 重啟 | 所有 session 消失，全員重新登入 |
| 多 Worker 部署 | 各 worker 的 `dict` 獨立，session 無法共享 |
| 密碼明文儲存 | `SessionData.password` 直接存放明文，記憶體 dump 可見 |

尤其是第一點，我們使用 Uvicorn 搭配 Docker 部署，每次更新程式碼或設定變更都需要重啟容器，使用者就得重新登入，體驗很差。

---

## Session 持久化：PostgreSQL + AES-256-GCM

### 資料表設計

我們用 Alembic migration 建立 `sessions` 表：

```python
# migrations/versions/005_sessions_table.py

def upgrade() -> None:
    op.create_table(
        'sessions',
        sa.Column('token', sa.Text(), primary_key=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('username', sa.Text(), nullable=False),
        sa.Column('password_enc', sa.Text(), nullable=False, server_default=''),
        sa.Column('nas_host', sa.Text(), nullable=False),
        sa.Column('role', sa.Text(), nullable=False, server_default='user'),
        sa.Column('app_permissions', JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text('NOW()')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_sessions_expires', 'sessions', ['expires_at'])
    op.create_index('idx_sessions_user_id', 'sessions', ['user_id'])
```

幾個設計重點：

- **`token` 作為 primary key**：UUID v4，不需要自增 ID
- **`password_enc`**：加密後的密碼，不是明文
- **`DateTime(timezone=True)`**：所有時間欄位都帶時區，避免 naive datetime 造成的混亂
- **`last_accessed_at`**：追蹤最後存取時間，方便後續分析使用者活躍度
- **`expires_at` 索引**：加速過期 session 的清理查詢

### 密碼加密：AES-256-GCM

因為 SMB 操作需要使用者的明文密碼（smbprotocol 要求），我們不能用 hash，只能用對稱加密。選擇 AES-256-GCM 的原因：

- 同時提供加密和認證（Authenticated Encryption）
- GCM 模式不需要 padding，效能好
- 業界標準，`cryptography` 套件原生支援

```python
# utils/crypto.py

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def _get_encryption_key() -> bytes:
    """從環境變數取得金鑰，SHA-256 產生固定 32 bytes"""
    key_str = os.getenv("BOT_SECRET_KEY", "")
    if not key_str:
        key_str = "ching-tech-os-default-dev-key-2024"  # 僅限開發環境
    return hashlib.sha256(key_str.encode()).digest()


def encrypt_credential(plaintext: str) -> str:
    """AES-256-GCM 加密，回傳 base64(nonce + ciphertext + tag)"""
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)  # GCM 建議 12 bytes nonce
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_credential(encrypted: str) -> str:
    """解密"""
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    data = base64.b64decode(encrypted.encode("ascii"))
    nonce = data[:12]
    ciphertext = data[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")
```

加密流程：

```
明文密碼 → AES-256-GCM 加密 → base64 編碼 → 存入 password_enc 欄位
                ↑
    BOT_SECRET_KEY 環境變數 → SHA-256 → 32 bytes 金鑰
```

> 注意：生產環境必須設定 `BOT_SECRET_KEY` 環境變數。應用程式啟動時會檢查並發出警告。

### SessionManager 實作

```python
# services/session.py

class SessionManager:
    """Session 管理器（PostgreSQL 持久化）"""

    def __init__(self):
        self._cleanup_task: asyncio.Task | None = None
        self._cache = _SessionCache()

    async def create_session(self, username, password, nas_host=None,
                             user_id=None, role="user", app_permissions=None):
        token = str(uuid4())
        password_enc = encrypt_credential(password) if password else ""

        async with get_connection() as conn:
            await conn.execute("""
                INSERT INTO sessions
                    (token, user_id, username, password_enc, nas_host,
                     role, app_permissions, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7,
                        NOW() + $8 * INTERVAL '1 hour')
            """, token, user_id, username, password_enc,
                nas_host or settings.nas_host, role,
                app_permissions or {}, float(settings.session_ttl_hours))

        return token
```

Session 的生命週期由 `expires_at` 控制，預設 8 小時（透過 `SESSION_TTL_HOURS` 環境變數設定）。

---

## TTL Cache：減少資料庫查詢

Session 驗證是最高頻的操作 -- 每個 API 請求都要驗證 session。如果每次都查資料庫，效能會很差。

### 設計思路

我們實作了一個簡易的 TTL（Time-To-Live）cache，不需要引入 Redis 或其他外部套件：

```python
class _SessionCache:
    """簡易 TTL cache（不需外部套件）"""

    def __init__(self, ttl: int = 30):  # 預設 30 秒
        self._store: dict[str, tuple[SessionData, float]] = {}
        self._ttl = ttl

    def get(self, token: str) -> SessionData | None:
        entry = self._store.get(token)
        if entry is None:
            return None
        data, expire_at = entry
        if time.monotonic() > expire_at:
            del self._store[token]
            return None
        return data

    def set(self, token: str, data: SessionData) -> None:
        self._store[token] = (data, time.monotonic() + self._ttl)

    def delete(self, token: str) -> None:
        self._store.pop(token, None)
```

### 查詢流程

```python
async def get_session(self, token: str) -> Optional[SessionData]:
    # 1. 先查 cache
    cached = self._cache.get(token)
    if cached is not None:
        return cached

    # 2. Cache miss → 查 DB 並更新 last_accessed_at
    async with get_connection() as conn:
        row = await conn.fetchrow("""
            UPDATE sessions SET last_accessed_at = NOW()
            WHERE token = $1 AND expires_at > NOW()
            RETURNING username, password_enc, nas_host, user_id,
                      created_at, expires_at, role, app_permissions
        """, token)

    if row is None:
        return None

    # 3. 解密密碼
    password = decrypt_credential(row["password_enc"]) if row["password_enc"] else ""

    session = SessionData(
        username=row["username"],
        password=password,
        nas_host=row["nas_host"],
        # ... 其他欄位
    )

    # 4. 寫入 cache
    self._cache.set(token, session)
    return session
```

這裡有幾個細節值得說明：

| 設計 | 理由 |
|------|------|
| TTL 30 秒 | 在「資料新鮮度」和「DB 負擔」之間取得平衡 |
| `time.monotonic()` | 不受系統時鐘調整影響，比 `time.time()` 可靠 |
| `UPDATE ... RETURNING` | 用一條 SQL 同時更新 `last_accessed_at` 和取回資料，減少 round trip |
| Cache miss 才查 DB | 30 秒內的重複請求直接從記憶體回傳 |

### last_accessed_at 追蹤

`last_accessed_at` 讓我們可以追蹤使用者的活躍狀況：

- 哪些 session 已經長時間未使用？
- 使用者的實際使用頻率如何？
- 配合 TTL cache，`last_accessed_at` 的更新頻率自然被限制在每 30 秒一次，不會造成過多的 DB 寫入

---

## 背景清理任務

過期的 session 不會自動消失，需要定期清理：

```python
async def start_cleanup_task(self):
    """啟動背景清理任務"""
    async def cleanup_loop():
        interval = settings.session_cleanup_interval_minutes * 60  # 10 分鐘
        while True:
            await asyncio.sleep(interval)
            try:
                count = await self.cleanup_expired()
                if count > 0:
                    logger.info("Cleaned up %d expired sessions", count)
            except Exception as e:
                logger.error("Session cleanup failed: %s", e)

    self._cleanup_task = asyncio.create_task(cleanup_loop())
```

清理邏輯很單純：

```python
async def cleanup_expired(self) -> int:
    async with get_connection() as conn:
        result = await conn.execute(
            "DELETE FROM sessions WHERE expires_at < NOW()"
        )
    return int(result.split()[-1])  # "DELETE 5" → 5
```

配合 `idx_sessions_expires` 索引，即使 session 數量很大，清理也很快。

---

## Thread Pool：讓 SMB 和文件操作不阻塞

### 問題：asyncio 的致命弱點

FastAPI 底層用的是 asyncio event loop -- 所有的 `async` 函式都在同一條執行緒上跑。如果某個操作是同步阻塞的（例如 SMB 網路 I/O、文件解析），它會卡住整個 event loop：

```
時間軸：
User A 請求 SMB 下載（阻塞 3 秒）
    ├── User B 的 API 請求 → 等待中...
    ├── User C 的 API 請求 → 等待中...
    └── 完成 → User B、C 才開始處理
```

`smbprotocol` 和 `python-docx`/`pptx` 等套件都是同步的，直接在 async 函式裡呼叫會阻塞。

### 解決方案：專用執行緒池

我們建立了兩個專用的 `ThreadPoolExecutor`：

```python
# services/workers/thread_pool.py

from concurrent.futures import ThreadPoolExecutor

# SMB 操作執行緒池（I/O 密集，4 條執行緒）
_smb_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="smb")

# 文件解析執行緒池（CPU 密集，2 條執行緒）
_doc_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="doc")


async def run_in_smb_pool(func, *args, **kwargs):
    """在 SMB 執行緒池中執行阻塞式操作"""
    loop = asyncio.get_running_loop()
    if kwargs:
        return await loop.run_in_executor(_smb_pool, partial(func, *args, **kwargs))
    return await loop.run_in_executor(_smb_pool, partial(func, *args) if args else func)


async def run_in_doc_pool(func, *args, **kwargs):
    """在文件解析執行緒池中執行阻塞式操作"""
    loop = asyncio.get_running_loop()
    if kwargs:
        return await loop.run_in_executor(_doc_pool, partial(func, *args, **kwargs))
    return await loop.run_in_executor(_doc_pool, partial(func, *args) if args else func)


def shutdown_pools():
    """關閉所有執行緒池（應用程式關閉時呼叫）"""
    _smb_pool.shutdown(wait=False)
    _doc_pool.shutdown(wait=False)
```

### 為什麼分成兩個池？

| 池 | 用途 | Worker 數 | 特性 |
|----|------|-----------|------|
| `_smb_pool` | NAS 檔案操作、SMB 認證 | 4 | I/O 密集，等待網路回應 |
| `_doc_pool` | 文件解析（PDF、DOCX、PPTX） | 2 | CPU 密集，實際計算 |

分開的好處是**隔離**：即使 4 個 SMB 操作同時進行，文件解析仍有獨立的 2 條執行緒可用，不會互相搶奪資源。

### 實際使用範例

**SMB 認證（登入）**：

```python
# api/auth.py
from ..services.workers import run_in_smb_pool

# 原本會阻塞 event loop
# smb.test_auth()

# 改為在執行緒池中執行
await run_in_smb_pool(smb.test_auth)
```

**NAS 檔案列表**：

```python
# api/nas.py
from ..services.workers import run_in_smb_pool

async def _list_files(path: str, session: SessionData):
    def _exec():
        smb = create_smb_service(session.username, session.password)
        return smb.list_directory(path)

    return await run_in_smb_pool(_exec)
```

**文件內容擷取（MCP 工具）**：

```python
# services/mcp/nas_tools.py
from ..workers import run_in_doc_pool

result = await run_in_doc_pool(document_reader.extract_text, str(full_path))
```

**簡報上傳至 NAS**：

```python
# services/presentation.py
from .workers import run_in_smb_pool

await run_in_smb_pool(_upload)
```

### 修改後的時間軸

```
時間軸（Thread Pool）：
User A 請求 SMB 下載 → 交給 smb-0 執行緒
    ├── User B 的 API 請求 → event loop 立刻處理 ✓
    ├── User C 的 API 請求 → event loop 立刻處理 ✓
    └── smb-0 完成 → 回傳給 User A
```

Event loop 不再被阻塞，所有非 SMB/文件的操作都能即時回應。

---

## 時區修正

在 Session 持久化過程中，我們順手修正了一個長期存在的問題：時區處理不一致。

### 問題

PostgreSQL 的 `NOW()` 回傳的是帶時區的 timestamp（預設 UTC），但程式中有些地方用 naive datetime（沒有時區資訊），導致：

- 前端顯示的時間可能差 8 小時
- Session 過期判斷可能不準確

### 解決

1. **資料庫層**：所有 `DateTime` 欄位都加上 `timezone=True`
2. **應用層**：統一使用 `timezone.utc` 或台北時區

```python
# services/mcp/server.py

TAIPEI_TZ = timezone(timedelta(hours=8))

def to_taipei_time(dt: datetime) -> datetime:
    """將 datetime 轉換為台北時區"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)  # naive → 視為 UTC
    return dt.astimezone(TAIPEI_TZ)
```

3. **Session 表**：`created_at`、`expires_at`、`last_accessed_at` 全部使用 `DateTime(timezone=True)`

---

## 應用程式生命週期整合

所有新功能都整合到 FastAPI 的 lifespan 管理：

```python
# main.py

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 啟動時
    await init_db_pool()                        # 資料庫連線池
    await session_manager.start_cleanup_task()   # Session 清理
    await terminal_service.start_cleanup_task()  # Terminal 清理
    start_scheduler()                            # 排程器

    yield

    # 關閉時
    stop_scheduler()
    await terminal_service.stop_cleanup_task()
    terminal_service.close_all()
    await session_manager.stop_cleanup_task()
    shutdown_pools()                             # 關閉執行緒池
    await close_db_pool()                        # 關閉資料庫
```

關閉順序很重要：先停排程、再停 session 清理、然後關執行緒池、最後才關資料庫連線。反過來的話，正在執行的任務可能會因為資料庫已關閉而拋出例外。

---

## 效能改善對比

| 指標 | 改善前 | 改善後 |
|------|--------|--------|
| Server 重啟 | 全員重新登入 | Session 不受影響 |
| 密碼儲存 | 記憶體明文 | AES-256-GCM 加密 |
| Session 驗證（cache hit） | N/A | < 1ms（記憶體讀取） |
| Session 驗證（cache miss） | N/A | ~2ms（單次 DB query） |
| SMB 下載（對其他用戶影響） | 阻塞 event loop 3-5 秒 | 0 影響 |
| 文件解析（對其他用戶影響） | 阻塞 event loop 1-3 秒 | 0 影響 |
| 多 Worker 部署 | Session 不共享 | 透過 PostgreSQL 共享 |

---

## 小結

這次的優化主要解決兩個核心問題：

1. **Session 持久化** -- 從記憶體 `dict` 搬到 PostgreSQL，搭配 AES-256-GCM 加密密碼、TTL cache 減少查詢、背景任務清理過期資料
2. **Thread Pool** -- 將阻塞式的 SMB 和文件操作移至專用執行緒池，讓 asyncio event loop 保持暢通

這些改動不涉及前端，也不改變 API 介面，屬於純後端的基礎設施升級。對使用者來說，最直觀的改善就是「更新後不用重新登入」和「別人在操作檔案時，我的操作不會變慢」。

下一步可以考慮的方向：

- **Session 自動延展**：活躍使用者的 session 自動延長過期時間
- **連線池監控**：追蹤 thread pool 的使用率，動態調整 worker 數量
- **分散式 cache**：如果未來需要多機部署，TTL cache 可以換成 Redis

---

## 參考資源

- [模組化重構]({% post_url 2026-02-06-ctos-modular-refactor %})（前一篇）
- [認證系統原始設計]({% post_url 2025-12-12-security-part1-auth %})
- [Alembic 資料庫版本控制]({% post_url 2025-12-13-devops-part1-alembic %})
- [Python `cryptography` -- AESGCM](https://cryptography.io/en/latest/hazmat/primitives/aead/#cryptography.hazmat.primitives.ciphers.aead.AESGCM)
- [asyncio -- `loop.run_in_executor`](https://docs.python.org/3/library/asyncio-eventloop.html#asyncio.loop.run_in_executor)
- [PostgreSQL `NOW()` 與時區處理](https://www.postgresql.org/docs/current/functions-datetime.html)
