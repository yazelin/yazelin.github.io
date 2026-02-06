---
layout: post
title: "ChingTech OS 多租戶架構：從設計到實作"
subtitle: "打造支援多組織的 SaaS 平台"
date: 2026-01-20
categories: [ChingTech OS]
tags: [ChingTech OS, 多租戶, SaaS, 架構設計, Python, FastAPI]
---

## 前言

當一套系統需要同時服務多個組織時，「多租戶架構」（Multi-Tenant Architecture）是繞不過的課題。

ChingTech OS 原本是為單一公司設計的內部平台——整合 NAS 檔案管理、Line Bot、AI 助手、專案管理等功能。但隨著需求演進，我們開始思考：如果要讓不同客戶（組織）共用同一套平台，架構該怎麼改？

2026 年 1 月 20 日到 23 日，我們密集地完成了多租戶架構的設計與實作。這篇文章記錄整個過程——從架構抉擇、資料隔離策略、權限系統改造，到 Line Bot 的多租戶整合。即使這個架構後來因為複雜度考量而被簡化回單一租戶，設計過程中的思考仍然值得留存。

---

## 什麼是多租戶架構

多租戶（Multi-Tenant）是 SaaS 平台的核心架構模式。簡單來說，就是**一套程式碼、一個資料庫，同時服務多個獨立的組織（租戶）**。

每個租戶擁有：
- 獨立的使用者帳號與權限
- 隔離的業務資料（專案、知識庫、聊天記錄等）
- 各自的 Line Bot / Telegram Bot 設定
- 獨立的 NAS 儲存空間
- 可自訂的功能開關與配額

與之相對的替代方案是「多實例部署」（Multi-Instance），也就是為每個客戶各跑一套獨立的系統。多租戶的優勢在於維運成本低——只需要維護一套程式碼和一個資料庫，但代價是架構複雜度大幅提升。

### 常見的多租戶隔離策略

| 策略 | 說明 | 隔離程度 | 複雜度 |
|------|------|----------|--------|
| **獨立資料庫** | 每個租戶一個獨立的 database | 最高 | 高 |
| **獨立 Schema** | 同一 DB 中，每個租戶一個 schema | 高 | 中高 |
| **共享表 + tenant_id** | 所有租戶共用表格，用欄位區分 | 中 | 中 |
| **Row-Level Security** | 資料庫層級的行級存取控制 | 中高 | 中高 |

我們選擇了**共享表 + tenant_id** 的策略。原因很實際：ChingTech OS 已經有完整的資料庫結構，這個方案的改動量最小，且對於中小型 SaaS 場景來說隔離程度已經足夠。

---

## 資料模型設計

### 租戶表（tenants）

這是整個多租戶架構的基石：

```sql
CREATE TABLE tenants (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,    -- 登入識別碼
    name VARCHAR(200) NOT NULL,          -- 組織名稱
    status VARCHAR(20) DEFAULT 'active', -- active / suspended / trial
    plan VARCHAR(50) DEFAULT 'trial',    -- trial / basic / pro / enterprise
    settings JSONB DEFAULT '{}',         -- 功能設定（JSON）
    storage_quota_mb BIGINT DEFAULT 5120,
    storage_used_mb BIGINT DEFAULT 0,
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

幾個設計決策值得說明：

1. **主鍵用 UUID 而非自增 ID**：避免在匯出/匯入、跨環境同步時發生 ID 衝突。
2. **`code` 欄位**：給人類使用的識別碼（例如 `chingtech`），登入時填入。與 UUID 分離，讓使用者體驗更友善。
3. **`settings` 用 JSONB**：租戶設定變化頻繁、欄位不固定，JSONB 提供了靈活性。
4. **`plan` 與 `storage_quota_mb`**：預留了商業化所需的方案與配額欄位。

### 租戶管理員表（tenant_admins）

```sql
CREATE TABLE tenant_admins (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'admin',  -- admin / owner
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

這張表將「管理員身份」從使用者表中抽離出來。一個使用者可以是多個租戶的管理員，一個租戶也可以有多個管理員——這是典型的多對多關係。

### 業務表加上 tenant_id

既有的業務表全部加上 `tenant_id` 外鍵：

```sql
-- 每張業務表都加上這個欄位
ALTER TABLE users ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE ai_agents ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE ai_chats ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE ai_prompts ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bot_groups ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bot_users ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bot_messages ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bot_files ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bot_binding_codes ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE public_share_links ADD COLUMN tenant_id UUID REFERENCES tenants(id);
```

同時需要重建索引，確保查詢效率：

```sql
-- 複合索引：先 tenant_id 再業務欄位
CREATE INDEX idx_users_tenant_username ON users(tenant_id, username);
CREATE INDEX idx_ai_agents_tenant_id ON ai_agents(tenant_id);
CREATE UNIQUE INDEX idx_ai_agents_name ON ai_agents(name, tenant_id);
CREATE INDEX idx_bot_groups_tenant_platform_unique
    ON bot_groups(tenant_id, platform_type, platform_group_id);
```

對於分區表（`ai_logs`、`messages`、`login_records`），`tenant_id` 同樣要加入，但由於 PostgreSQL 分區表的限制，處理上需要更加小心——這也成了後來 migration 004 要補修的遺留問題。

---

## Pydantic 資料模型

後端使用 FastAPI + Pydantic，租戶相關的資料模型設計如下：

```python
class TenantSettings(BaseModel):
    """租戶設定"""
    # 功能開關
    enable_linebot: bool = True
    enable_ai_assistant: bool = True
    enable_knowledge_base: bool = True
    enable_project_management: bool = True
    enable_inventory: bool = True
    enable_vendor_management: bool = True

    # 配額
    max_users: int | None = None
    max_projects: int | None = None
    max_ai_calls_per_day: int | None = None

    # Line Bot 設定（每個租戶可以綁定自己的 Bot）
    line_channel_id: str | None = None
    line_channel_secret: str | None = None
    line_channel_access_token: str | None = None

    # NAS 認證設定
    enable_nas_auth: bool = False
    nas_auth_host: str | None = None
    nas_auth_port: int | None = None
    nas_auth_share: str | None = None

    # 自訂欄位
    custom: dict = Field(default_factory=dict)
```

`TenantSettings` 儲存在 `tenants.settings` JSONB 欄位中。這個設計讓每個租戶可以：
- 開關特定功能模組（例如關閉物料管理）
- 設定 API 呼叫配額
- 綁定自己的 Line Bot 憑證
- 指定專屬的 NAS 主機

---

## 三層角色權限系統

多租戶帶來的最大變化之一是權限系統。原本只有 `admin` 和 `user` 兩種角色，現在需要三層：

```
platform_admin  →  平台管理員（管理所有租戶）
tenant_admin    →  租戶管理員（管理自己的租戶）
user            →  一般使用者
```

### 權限對照表

| 操作 | platform_admin | tenant_admin | user |
|------|:-:|:-:|:-:|
| 建立/停用租戶 | O | X | X |
| 管理所有租戶的使用者 | O | X | X |
| 管理自己租戶的使用者 | O | O | X |
| 設定 Line Bot 憑證 | O | O | X |
| 匯出/匯入租戶資料 | O | O | X |
| 使用平台功能 | O | O | O |

### Session 改造

認證模型也跟著擴充：

```python
class LoginRequest(BaseModel):
    username: str
    password: str
    tenant_code: str | None = None  # 多租戶登入識別

class SessionData(BaseModel):
    username: str
    password: str          # SMB 操作需要
    nas_host: str
    user_id: int | None = None
    created_at: datetime
    expires_at: datetime
    tenant_id: UUID | None = None   # 租戶 UUID
    role: str = "user"              # 三層角色
    app_permissions: dict[str, bool] = {}  # 功能權限快取
```

登入流程的變化：
1. 使用者輸入 `tenant_code` + `username` + `password`
2. 系統先查詢 `tenants` 表確認租戶存在且為 active 狀態
3. 在該租戶範圍內查詢使用者
4. 驗證密碼後，將 `tenant_id` 和 `role` 寫入 Session
5. 後續所有 API 請求都帶著 `tenant_id` 進行資料過濾

### 從 ADMIN_USERNAME 到 DB Role

在多租戶之前，系統用環境變數 `ADMIN_USERNAME` 判斷誰是管理員——簡單粗暴。多租戶化後，這個設計顯然不夠用。我們做了一個重要的重構（PR #13）：

- 移除 `ADMIN_USERNAME` 環境變數
- 改用資料庫 `users.role` 欄位
- `permissions.py` 中的 `is_admin()` 改為根據 role 判斷
- 種子資料預設建立 `admin/admin` 帳號

這個改動其實獨立於多租戶——即使不做多租戶，把管理員判斷從環境變數搬到資料庫也是正確的方向。

---

## Admin UI 設計

平台管理員需要一個管理介面來操作租戶。我們設計了兩層管理 API：

### 平台管理員 API（`/api/admin/tenants`）

```python
router = APIRouter(prefix="/api/admin/tenants", tags=["admin-tenants"])

@router.post("/", response_model=TenantInfo)
async def create_tenant(data: TenantCreate, ...):
    """建立新租戶"""

@router.get("/", response_model=TenantListResponse)
async def list_all_tenants(...):
    """列出所有租戶"""

@router.get("/{tenant_id}/usage", response_model=TenantUsage)
async def get_usage(tenant_id: UUID, ...):
    """查看租戶使用量"""

@router.post("/{tenant_id}/admins", response_model=TenantAdminCreateResponse)
async def add_admin(tenant_id: UUID, data: TenantAdminCreate, ...):
    """新增租戶管理員（可同時建立新帳號）"""

@router.put("/{tenant_id}/line-bot", response_model=LineBotSettingsResponse)
async def update_line_settings(tenant_id: UUID, data: LineBotSettingsUpdate, ...):
    """設定租戶的 Line Bot 憑證"""
```

### 租戶自助服務 API（`/api/tenant`）

```python
router = APIRouter(prefix="/api/tenant", tags=["tenant"])

@router.get("/info", response_model=TenantInfo)
async def get_tenant_info(...):
    """查看自己的租戶資訊"""

@router.put("/settings", response_model=TenantInfo)
async def update_settings(data: TenantSettings, ...):
    """更新租戶設定"""

@router.post("/export")
async def export_data(request: TenantExportRequest, ...):
    """匯出租戶資料（ZIP）"""

@router.post("/import")
async def import_data(...):
    """匯入租戶資料"""
```

這種「平台管理 vs. 租戶自助」的分層設計，讓不同角色各自看到適合的管理功能。

---

## 租戶級 Line Bot 設定

ChingTech OS 的一大特色是深度整合 Line Bot。在多租戶架構下，每個租戶需要綁定自己的 Line Bot：

### 憑證儲存

```python
class TenantSettings(BaseModel):
    line_channel_id: str | None = None
    line_channel_secret: str | None = None      # 加密儲存
    line_channel_access_token: str | None = None  # 加密儲存
```

敏感憑證使用 `encrypt_credential()` / `decrypt_credential()` 進行加密，存放在 `tenants.settings` JSONB 中。API 回應時只暴露 `channel_id`，secret 和 token 絕不外洩。

### Webhook 路由

最棘手的問題是：Line 的 Webhook 怎麼區分是哪個租戶的？

```
Line Platform → POST /api/bot/line/webhook
```

Line 送來的 Webhook 請求不包含租戶資訊。我們的解法是：

1. 從 HTTP Header 中取得 `X-Line-Signature`
2. 用每個租戶的 `channel_secret` 逐一驗證簽章
3. 驗證成功的就是對應的租戶

這個「逐一比對」的做法在租戶數量少的時候可行，但如果租戶增長到數百個，就需要改用其他策略（例如用不同的 Webhook URL 路徑區分）。

### 群組歸屬

同一個 Line 群組可能需要在不同租戶間轉移。我們為平台管理員提供了群組租戶管理 API：

```python
@router.put("/line-groups/{group_id}/tenant")
async def update_group_tenant(
    group_id: str,
    request: LineGroupTenantUpdateRequest, ...
):
    """將 Line 群組轉移到另一個租戶"""
```

---

## NAS 連線管理（Per Tenant）

ChingTech OS 的檔案管理依賴 SMB/NAS。多租戶後，每個租戶可以指定自己的 NAS 主機：

```python
class TenantSettings(BaseModel):
    enable_nas_auth: bool = False
    nas_auth_host: str | None = None    # 租戶專屬 NAS
    nas_auth_port: int | None = None
    nas_auth_share: str | None = None
```

NAS 連線管理器（`NASConnectionManager`）負責：

```python
class NASConnectionManager:
    def create_connection(
        self, host, username, password,
        user_id=None, timeout_minutes=None
    ) -> str:
        """建立連線，回傳 Token"""

    def get_connection(self, token: str) -> NASConnection:
        """用 Token 取得連線"""

    async def cleanup_expired(self):
        """自動清理過期連線"""
```

### 檔案目錄隔離

NAS 上的目錄結構也要按租戶隔離：

```
/mnt/nas/ctos/
├── system/              # 系統共用檔案
│   ├── templates/
│   └── defaults/
└── tenants/
    ├── {tenant-uuid-1}/
    │   ├── knowledge/   # 知識庫
    │   ├── linebot/     # Bot 相關檔案
    │   ├── attachments/ # 專案附件
    │   └── ai-generated/
    └── {tenant-uuid-2}/
        ├── knowledge/
        └── ...
```

我們甚至寫了一個遷移腳本 `migrate_files_to_tenant.py`，將既有檔案從舊結構搬到新的租戶目錄：

```python
DIRECTORIES_TO_MIGRATE = [
    "knowledge", "linebot", "attachments",
    "projects", "ai-generated",
]

def run_migration(tenant_id, dry_run=True, create_symlinks=False):
    """執行檔案遷移，支援預覽模式和符號連結向後相容"""
```

---

## 資料庫 Migration 策略

多租戶的 migration 是整個過程中最需要謹慎的部分。我們採用 Alembic 管理 migration，整個流程分為幾個階段：

### 階段一：整併 baseline（PR #13）

在加入多租戶之前，先做一次大掃除——將累積的 60 個 migration 檔案整併為單一 baseline `001_initial_schema.py`：

```python
def upgrade() -> None:
    connection = op.get_bind()
    # 1. 執行完整 schema SQL
    with open('clean_schema.sql') as f:
        connection.execute(text(f.read()))
    # 2. 建立分區
    connection.execute(text("SELECT create_ai_logs_partition()"))
    # 3. 載入種子資料
    with open('seed_data.sql') as f:
        connection.execute(text(f.read()))
```

種子資料包含預設租戶：

```sql
INSERT INTO tenants (id, code, name, status, plan, storage_quota_mb)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'default', '預設租戶', 'active', 'enterprise', 102400
);
```

### 階段二：多租戶 schema 變更（002）

加入 `tenant_id` 欄位、外鍵約束、複合索引。

### 階段三：移除多租戶（003）

後來決定回到單一租戶時，migration 003 負責反向操作。這是一個**破壞性 migration**，步驟極為講究：

```python
def upgrade() -> None:
    # Phase 1: 刪除非 chingtech 租戶的資料
    for table in tables_with_tenant_id:
        DELETE FROM {table} WHERE tenant_id != :chingtech_id

    # Phase 2: 新增 bot_settings 表（替代 tenant settings 中的 bot 設定）

    # Phase 3: 更新 role 欄位
    UPDATE users SET role = 'admin' WHERE role = 'platform_admin'
    UPDATE users SET role = 'admin' WHERE role = 'tenant_admin'

    # Phase 4: 移除外鍵約束
    # Phase 5: 移除 tenant_id 索引
    # Phase 6: 移除 tenant_id 欄位
    # Phase 7: 重建索引（不含 tenant_id）
    # Phase 8: 刪除 tenant_admins 表
    # Phase 9: 刪除 tenants 表

def downgrade() -> None:
    raise NotImplementedError("破壞性 migration，無法 downgrade")
```

注意 `downgrade()` 直接拋出例外。這是有意為之——這種大規模結構變更不可能透過程式碼完美回滾，需要依賴資料庫備份。

### 階段四：補修遺漏（004）

分區表（`ai_logs`、`messages`、`login_records`）的 `tenant_id` 在 003 中被遺漏了，004 透過動態查詢 `information_schema` 來清理：

```python
result = connection.execute(sa.text("""
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'tenant_id' AND table_schema = 'public'
"""))
for table in [row[0] for row in result]:
    ALTER TABLE {table} DROP COLUMN IF EXISTS tenant_id
```

這種「查出所有還有 tenant_id 的表然後統一處理」的策略，比逐一列舉更不容易遺漏。

---

## 租戶資料匯出與匯入

為了讓租戶能備份和遷移資料，我們實作了完整的匯出/匯入服務：

```python
class TenantExportService:
    EXPORT_TABLES = [
        "users", "vendors", "inventory_items",
        "ai_agents", "ai_prompts",
        "bot_groups", "bot_users", "bot_messages",
        "projects", "project_members", ...
    ]

    async def export_to_zip(self, request) -> tuple[bytes, dict]:
        """匯出為 ZIP：JSON 資料 + NAS 檔案"""
```

匯出內容包含：
- 各表的 JSON 資料（按外鍵依賴順序匯出）
- NAS 上的檔案（知識庫文件、附件等）
- 匯出摘要（表名、筆數、檔案大小）

匯入時需要處理 **ID re-mapping**——因為不同環境的自增 ID 會不同，匯入腳本需要記錄舊 ID 與新 ID 的對應，並更新所有外鍵引用。

---

## 開發時程回顧

從 git log 可以看到，整個多租戶架構在四天內密集完成：

| 日期 | 主要進展 |
|------|---------|
| **01/20** | 基礎架構——租戶模型、tenant_id 欄位、UUID 類型處理 |
| **01/21** | Line Bot 多租戶整合、NAS 連線管理、權限系統、管理介面 |
| **01/22** | NAS 檔案預覽修復、AI logs 修復、App 權限控制、NAS 隔離 Phase 1 |
| **01/23** | Code Review 修復、資料遷移腳本、前端管理界面、ADMIN_USERNAME 移除 |

這四天的 commit 數量超過 30 個，涵蓋了後端模型、服務層、API 路由、前端管理頁面、測試、migration、部署腳本等。

---

## 小結

多租戶架構是 SaaS 平台的「成年禮」。這次的實作讓我們深刻體會到幾件事：

**架構面的收穫**：
- `tenant_id` 看似只是加一個欄位，但它會像漣漪一樣擴散到系統的每個角落——每一條 SQL 查詢、每一個 API 端點、每一個服務函數都要加上 tenant 過濾。
- 權限系統的複雜度不是線性增長而是指數級的。從兩種角色變三種，排列組合的情境多了好幾倍。
- 外部服務整合（Line Bot Webhook）在多租戶下會遇到「誰的請求」這個根本問題，解法往往不夠優雅。

**工程面的教訓**：
- Migration 要一次做對。分區表的遺漏讓我們多寫了一個 004 補丁。
- 破壞性 migration 不要寫 `downgrade()`，誠實地拋出 `NotImplementedError` 比寫一個不完整的回滾更安全。
- 資料匯出/匯入的 ID re-mapping 比想像中複雜，尤其是 UUID 主鍵加上多層外鍵引用。

最終，我們評估了多租戶帶來的維護成本與當前的實際需求，決定先回到單一租戶模式。但這段設計過程並非白費——資料庫 role 欄位、bot_settings 表、NAS 連線管理器等改進都被保留了下來。而且，如果未來真的需要 SaaS 化，這次的經驗讓我們知道哪些地方會痛、需要提前規劃。

> 有時候，最好的架構決策是知道什麼時候該退回來。

---

## 參考資源

- [Multi-tenant SaaS patterns - Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Alembic Migration Tutorial](https://alembic.sqlalchemy.org/en/latest/tutorial.html)
- [FastAPI Dependency Injection](https://fastapi.tiangolo.com/tutorial/dependencies/)
