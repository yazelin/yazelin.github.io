---
layout: post
title: "ChingTech OS：移除多租戶架構"
subtitle: "從複雜回歸簡單的架構決策"
date: 2026-02-05
categories: [ChingTech OS]
tags: [ChingTech OS, 架構設計, 重構, 多租戶, Python]
---

![ChingTech OS：移除多租戶架構](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-05-ctos-remove-multi-tenant.png)

## 前言

在 [多租戶架構設計]({% post_url 2026-01-20-ctos-multi-tenant %}) 中，我們花了相當大的力氣把 ChingTech OS 從單租戶改造成多租戶架構。當時的想法是：「未來也許會提供 SaaS 服務，讓多家公司共用同一套系統」。

那篇文章記錄了完整的改造過程——10 個 Phase、93 個 tasks，從資料庫結構、認證流程、服務層、Line Bot、MCP 工具、檔案系統到前端 UI，幾乎每一個模組都被動過。所有表格加上 `tenant_id`、所有查詢加上租戶過濾、所有路徑加上租戶隔離。

然後呢？上線後，系統裡只有一個租戶：**chingtech**。

三週過去了，沒有第二個租戶，也沒有任何即將出現的跡象。但多租戶帶來的複雜度卻每天都在消耗開發效率：每個新功能都要考慮 `tenant_id`、每次 debug 都要確認租戶上下文、39 個測試因為租戶依賴而被標記為 skip。

是時候承認了：**這是一個過度工程（over-engineering）的決策。**

---

## 為什麼要移除

做這個決定並不容易。畢竟是花了大量時間實作的功能，移除它等於承認當初的判斷有誤。但回頭看，幾個事實擺在眼前：

### 1. 實際只有一個租戶

系統從設計之初就是為擎添工業內部使用。「未來可能提供 SaaS」只是一個假想的需求，不是來自真實的商業計畫。

### 2. 複雜度的代價超乎預期

多租戶不是加一個欄位那麼簡單。它滲透到系統的每一個角落：

- **資料庫**：12 張表加上 `tenant_id`，外加索引、約束、migration
- **認證**：SessionData 要攜帶 `tenant_id`，登入流程要解析 `tenant_code`
- **服務層**：每個 CRUD 函數多一個 `tenant_id` 參數
- **MCP 工具**：所有工具加上 `ctos_tenant_id` 參數
- **路徑管理**：檔案路徑從 `/knowledge/` 變成 `/tenants/{tenant_id}/knowledge/`
- **前端**：多了 `tenant-context.js`、`tenant-admin.js`、`tenant-admin.css`
- **角色系統**：從 admin/user 變成 platform_admin/tenant_admin/user

每改一個功能，都要在腦中多想一層「這個操作在多租戶下是否正確」。

### 3. 測試覆蓋率嚴重下降

這是最直接的痛點。引入多租戶後，原本的測試大量因為缺少租戶上下文而失敗，最後有 **39 個測試被標記為 skip**。一個讓測試變少的架構決策，一定不是好的決策。

### 4. YAGNI 原則

**You Aren't Gonna Need It.** 不要為「也許有一天」的需求增加複雜度。如果真的需要多租戶，到時候再加回來就好——況且我們已經做過一次，有完整的經驗了。

---

## 移除範圍

這次的移除工作同樣是一個大規模的重構，涵蓋 92 個 tasks（原本加入時是 93 個，幾乎是對稱的逆操作）。

### 總覽

| 層級 | 移除項目 |
|------|----------|
| **資料庫** | 2 張表（tenants, tenant_admins）、12 張表的 tenant_id 欄位、所有相關索引和約束 |
| **Backend 模組** | `models/tenant.py`、`services/tenant.py`、`services/tenant_data.py`、`api/tenant.py`、`api/admin/tenants.py` |
| **Backend 服務** | 所有服務函數移除 tenant_id 參數 |
| **前端** | `tenant-context.js`、`tenant-admin.js`、`tenant-admin.css`、登入頁的 tenant_code 欄位 |
| **設定** | `MULTI_TENANT_MODE`、`DEFAULT_TENANT_ID` 等環境變數 |
| **角色** | `platform_admin`、`tenant_admin` 合併回 `admin` |
| **Migration** | 新增 003、004 兩個 migration 檔案 |
| **測試** | 刪除 4 個租戶測試檔、新增單租戶驗證測試、恢復 39 個被跳過的測試 |

---

## 關鍵實作細節

### DB Migration：有序的九步拆除

移除多租戶不能隨意刪欄位——要考慮外鍵依賴、索引、分區表等。最終的 `003_remove_multi_tenancy.py` migration 分為九個 Phase：

```python
# Phase 1: 刪除非 chingtech 租戶的資料
tables_with_tenant_id = [
    'bot_files', 'bot_messages', 'bot_binding_codes',
    'bot_groups', 'bot_users', 'ai_chats', 'ai_prompts',
    'ai_agents', 'public_share_links', 'users',
]
for table in tables_with_tenant_id:
    connection.execute(sa.text(f"""
        DELETE FROM {table} WHERE tenant_id != :tid
    """), {'tid': CHINGTECH_TENANT_ID})

# Phase 2: 新增 bot_settings 表（取代租戶級設定）
# Phase 3: 更新角色（platform_admin/tenant_admin → admin）
# Phase 4: 移除外鍵約束
# Phase 5: 移除 tenant_id 索引
# Phase 6: 移除 tenant_id 欄位
# Phase 7: 重建索引（不含 tenant_id）
# Phase 8: 刪除 tenant_admins 表
# Phase 9: 刪除 tenants 表
```

注意這是**破壞性 migration**，downgrade 直接 raise `NotImplementedError`：

```python
def downgrade() -> None:
    raise NotImplementedError(
        "這是破壞性 migration，無法 downgrade。請從備份還原。"
    )
```

後來還補了一個 `004_remove_tenant_id_partitioned_tables.py`，處理 003 遺漏的分區表（`ai_logs`、`login_records`、`messages`）。這個 migration 更聰明，直接用 `information_schema` 動態查找還有 `tenant_id` 的表，一網打盡：

```python
result = connection.execute(sa.text("""
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'tenant_id'
      AND table_schema = 'public'
    ORDER BY table_name
"""))
tables = [row[0] for row in result]
```

### 認證簡化

`SessionData` 從原本的：

```python
class SessionData(BaseModel):
    username: str
    password: str
    nas_host: str
    user_id: int | None = None
    tenant_id: str          # 移除
    created_at: datetime
    expires_at: datetime
    role: str = "user"      # 原本有 platform_admin/tenant_admin/user
    app_permissions: dict[str, bool] = {}
```

變成：

```python
class SessionData(BaseModel):
    username: str
    password: str
    nas_host: str
    user_id: int | None = None
    created_at: datetime
    expires_at: datetime
    role: str = "user"      # 只剩 admin/user
    app_permissions: dict[str, bool] = {}
```

`LoginRequest` 也不再需要 `tenant_code` 欄位。整個登入流程回到最直觀的「帳號 + 密碼」。

### 新增 Bot Settings 機制

移除多租戶後，Bot 的憑證不再綁定租戶。但原本硬編碼在環境變數的做法也不夠靈活（改一次要重啟服務）。所以新增了 `bot_settings` 表和對應的 API：

```
GET    /api/admin/bot-settings/{platform}       # 取得設定狀態
PUT    /api/admin/bot-settings/{platform}       # 更新憑證
DELETE /api/admin/bot-settings/{platform}       # 清除憑證
POST   /api/admin/bot-settings/{platform}/test  # 測試連線
```

設計上採用**資料庫優先、環境變數 fallback** 的策略：

```python
async def get_bot_credentials(platform: str) -> dict[str, str]:
    # 先從資料庫讀取
    async with get_connection() as conn:
        rows = await conn.fetch(
            "SELECT key, value FROM bot_settings WHERE platform = $1",
            platform,
        )
        db_values = {row["key"]: row["value"] for row in rows}

    for key in keys:
        db_val = db_values.get(key, "")
        if db_val:
            # 資料庫有值，解密後回傳
            result[key] = decrypt_credential(db_val)
        else:
            # fallback 到環境變數
            result[key] = _get_env_fallback(platform, key)
    return result
```

敏感欄位（token、secret）使用加密儲存，API 回應以遮罩方式顯示（`Abc1...xyz9`）。管理員可以在 Web UI 直接設定和測試 Bot 連線，不需要 SSH 進伺服器改 `.env` 再重啟。

### 恢復測試

這是整個移除過程中最令人滿意的部分。移除多租戶後：

- **39 個被跳過的測試全部恢復**
- 新增 `test_single_tenant.py`，專門驗證移除後的正確性
- 最終 **249 個測試全數通過**

`test_single_tenant.py` 的測試項目包括：

```python
class TestSimplifiedAuth:
    def test_login_request_no_tenant_code(self): ...
    def test_session_data_no_tenant_id(self): ...

class TestSimplifiedRoles:
    def test_only_admin_and_user_roles(self): ...

class TestBotSettings:
    def test_bot_settings_module_exists(self): ...

class TestSimplifiedPaths:
    def test_knowledge_path_no_tenant(self): ...
    def test_linebot_path_no_tenant(self): ...

class TestUserServiceNoTenantId:
    async def test_upsert_user_no_tenant_id_param(self): ...
    async def test_get_user_no_tenant_filter(self): ...

class TestMcpToolsNoTenantId:
    def test_mcp_tools_signature(self): ...
```

這些測試不只是驗證「功能正確」，更是驗證「確實沒有殘留」——用 `inspect.signature` 檢查函數簽名，確保沒有遺漏的 `tenant_id` 參數。

### 版本升級

完成所有清理後，版本從 0.2.x 升到 **0.3.0**。這是一個 breaking change，所以升 minor version 是合理的。

```toml
# pyproject.toml
[project]
name = "ching-tech-os"
version = "0.3.0"
```

---

## 移除前後對比

| 面向 | 移除前（多租戶） | 移除後（單租戶） |
|------|-----------------|-----------------|
| **資料表** | 14+ 張表有 `tenant_id` | 0 張表有 `tenant_id` |
| **角色** | platform_admin / tenant_admin / user | admin / user |
| **登入** | 需要 tenant_code | 帳號 + 密碼 |
| **Session** | 攜帶 tenant_id | 不需要 |
| **API 參數** | 服務函數都有 tenant_id | 不需要 |
| **MCP 工具** | 每個工具有 ctos_tenant_id | 不需要 |
| **路徑** | `/tenants/{id}/knowledge/` | `/knowledge/` |
| **前端模組** | 多 3 個 tenant 相關檔案 | 移除 |
| **設定** | MULTI_TENANT_MODE 等 | 移除 |
| **被跳過的測試** | 39 個 | 0 個 |
| **通過的測試** | ~210 個 | 249 個 |
| **Bot 設定** | 綁定租戶 | 獨立 bot_settings 表 |

---

## 小結

加功能容易，移除功能更需要勇氣。

當初實作多租戶時，每完成一個 Phase 都有成就感——「系統越來越完整了」。但現在回頭看，那是一種虛假的進步。系統確實變得更「完整」，但同時也變得更複雜、更難維護、更難測試。而這些複雜度帶來的價值是零，因為沒有第二個租戶。

這次的移除過程讓我深刻體會到幾件事：

**1. YAGNI 不只是口號。** 「以後可能會用到」是軟體工程中最危險的一句話。如果需求不是來自真實的使用者，就不應該為它投入工程資源。

**2. 移除比新增更難。** 加功能的時候，只要新程式碼能跑就好。移除功能的時候，要確保系統的每一個角落都清理乾淨——資料庫、後端、前端、測試、設定、文件，一個都不能漏。

**3. 測試是架構品質的指標。** 當你發現大量測試需要 skip 才能通過，那不是測試的問題，是架構的問題。移除多租戶後，39 個測試瞬間復活，這說明原本的架構對測試是不友善的。

**4. 簡單的系統更容易演進。** 移除多租戶後，開發新功能的速度明顯加快。不需要在腦中維持一個「租戶上下文」，不需要每個查詢都加 `WHERE tenant_id = ?`，不需要每個 API 都做租戶驗證。

如果有一天真的需要多租戶呢？那就到時候再加。我們已經做過一次，有完整的 OpenSpec 文件、有詳細的 task list、有實作經驗。第二次做一定比第一次更快、更好。但在那一天到來之前，保持簡單就是最好的架構。

---

## 參考資源

- [多租戶架構設計]({% post_url 2026-01-20-ctos-multi-tenant %})
- [Martin Fowler - YAGNI](https://martinfowler.com/bliki/Yagni.html)
- [Alembic Migration 官方文件](https://alembic.sqlalchemy.org/en/latest/tutorial.html)
