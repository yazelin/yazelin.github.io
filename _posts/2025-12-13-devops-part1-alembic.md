---
layout: post
title: "Alembic 資料庫版本控制：讓 Schema 變更可追蹤"
subtitle: "多人協作不再怕資料庫結構衝突"
date: 2025-12-13
categories: [DevOps]
tags: [Python, Alembic, PostgreSQL, Migration]
---

![Alembic 資料庫版本控制：讓 Schema 變更可追蹤](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-13-devops-part1-alembic.png)

> **📚 系列文章**
> 1. [Alembic 資料庫版本控制：讓 Schema 變更可追蹤]({% post_url 2025-12-13-devops-part1-alembic %}) ← 目前閱讀
> 2. [Docker Compose 一鍵啟動開發環境]({% post_url 2025-12-13-devops-part2-docker %})
>
> **📖 前置知識**
> - [Linux 終端機入門]({% post_url 2025-12-13-linux-basics %})
> - [Git 入門：版本控制基礎指令]({% post_url 2025-12-13-git-basics %})

---

## 這篇文章要解決什麼問題？

**後端工程師 A**：「奇怪，我的程式跑得好好的，怎麼到你那邊就報錯說欄位不存在？」  
**後端工程師 B**：「我昨天加了新欄位，你沒有更新資料庫吧？SQL 我放在 Slack 了。」  
**後端工程師 A**：「Slack 訊息那麼多，我怎麼知道要執行哪些 SQL、順序是什麼？」  
**資深後端**：「這就是為什麼我們需要 Migration 工具。資料庫變更也要版本控制，就像程式碼一樣。」  
**後端工程師 B**：「這樣 git pull 之後跑一個指令就能同步資料庫結構？」  
**資深後端**：「沒錯，而且改錯了還能 rollback。」

專案開發中，資料庫結構經常需要變更：

- 新功能要加新表格
- 欄位要改名稱或類型
- 要加索引優化效能

如果直接用 SQL 改，會遇到這些問題：

| 情境 | 問題 |
|------|------|
| 多人協作 | 「我的資料庫跟你的不一樣」 |
| 部署新環境 | 「要執行哪些 SQL？順序是什麼？」 |
| 需要 rollback | 「改錯了怎麼改回來？」 |
| 歷史追蹤 | 「這個欄位什麼時候加的？」 |

**Alembic** 就是解決這些問題的工具。它把資料庫變更用 **Python 腳本** 管理，就像 Git 管理程式碼一樣。

---

## 技術概念

### 什麼是 Migration？

Migration（遷移）是一個描述「資料庫結構從 A 變成 B」的腳本。

```
資料庫狀態 v1 ──migration 001──▶ 資料庫狀態 v2 ──migration 002──▶ 資料庫狀態 v3
    (空)         新增 users 表       (users)       新增 chats 表    (users + chats)
```

每個 migration 都有兩個方向：
- **upgrade**：往前升級（執行變更）
- **downgrade**：rollback（撤銷變更）

### Alembic 的運作方式

```
專案結構：
backend/
├── alembic.ini           # 設定檔
├── migrations/
│   ├── env.py            # 環境設定（讀取資料庫連線）
│   ├── script.py.mako    # migration 檔案範本
│   └── versions/         # 所有 migration 腳本
│       ├── 001_create_users.py
│       ├── 002_create_ai_chats.py
│       └── 003_create_messages.py
```

Alembic 會在資料庫中建立 `alembic_version` 表，記錄目前套用到哪個版本：

```sql
SELECT * FROM alembic_version;
-- version_num
-- -----------
-- 002
```

執行 `alembic upgrade head` 時，Alembic 會：
1. 查詢目前版本（002）
2. 找出還沒套用的 migration（003, 004...）
3. 依序執行 upgrade() 函式

---

## 跟著做：Step by Step

### 步驟 1：安裝 Alembic

```bash
uv add alembic
```

> 本系列使用 [uv](https://docs.astral.sh/uv/) 管理 Python 套件。如尚未安裝，請參考 **[uv 入門：極速 Python 套件管理]({% post_url 2025-12-13-uv-basics %})**。

### 步驟 2：初始化 Alembic

```bash
cd backend
alembic init migrations
```

這會產生：
- `alembic.ini`：設定檔
- `migrations/`：migration 腳本目錄

### 步驟 3：設定資料庫連線

編輯 `migrations/env.py`，整合你的設定：

```python
# migrations/env.py

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# 從專案設定檔讀取資料庫 URL
from ching_tech_os.config import settings

config = context.config

# 動態設定資料庫 URL（不要寫死在 alembic.ini）
config.set_main_option("sqlalchemy.url", settings.database_url)

# 設定 logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def run_migrations_offline() -> None:
    """離線模式：只產生 SQL，不實際執行"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """線上模式：連線資料庫並執行"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 步驟 4：設定 sys.path

編輯 `alembic.ini`，加入專案路徑：

```ini
# alembic.ini

[alembic]
script_location = %(here)s/migrations

# 加入 src 目錄，讓 env.py 能 import 專案模組
prepend_sys_path = .:src
```

### 步驟 5：建立第一個 Migration

```bash
alembic revision -m "create_users"
```

會產生檔案 `migrations/versions/xxxx_create_users.py`。

編輯這個檔案：

```python
"""create users table

Revision ID: 001
Revises:
Create Date: 2025-12-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision 識別碼
revision: str = "001"
down_revision: str | None = None  # 第一個 migration，沒有前一版


def upgrade() -> None:
    """升級：建立 users 表"""
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(100), unique=True, nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("preferences", JSONB, server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
    )

    # 建立索引
    op.create_index("idx_users_username", "users", ["username"])

    # 加入欄位註解
    op.execute("COMMENT ON TABLE users IS '使用者表'")
    op.execute("COMMENT ON COLUMN users.username IS 'NAS 帳號'")


def downgrade() -> None:
    """rollback：刪除 users 表"""
    op.drop_index("idx_users_username")
    op.drop_table("users")
```

### 步驟 6：執行 Migration

```bash
# 升級到最新版本
alembic upgrade head

# 查看目前版本
alembic current
# 001 (head)

# 查看歷史
alembic history
# 001 -> None (head), create users table
```

### 步驟 7：建立後續 Migration

```bash
alembic revision -m "create_ai_chats"
```

```python
"""create ai_chats table

Revision ID: 002
Revises: 001
Create Date: 2025-12-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "002"
down_revision: str | None = "001"  # 指向前一個 migration


def upgrade() -> None:
    op.create_table(
        "ai_chats",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("title", sa.String(100), server_default="新對話"),
        sa.Column("model", sa.String(50), server_default="claude-sonnet"),
        sa.Column("messages", JSONB, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )

    op.create_index("idx_ai_chats_user_id", "ai_chats", ["user_id"])
    op.create_index(
        "idx_ai_chats_updated_at",
        "ai_chats",
        [sa.text("updated_at DESC")]
    )


def downgrade() -> None:
    op.drop_index("idx_ai_chats_updated_at")
    op.drop_index("idx_ai_chats_user_id")
    op.drop_table("ai_chats")
```

---

## 進階技巧與踩坑紀錄

### 1. 常用 Alembic 指令

```bash
# 升級到最新
alembic upgrade head

# 升級到特定版本
alembic upgrade 002

# rollback 一個版本
alembic downgrade -1

# rollback 到特定版本
alembic downgrade 001

# 查看目前版本
alembic current

# 查看所有歷史
alembic history --verbose

# 查看待執行的 migration
alembic upgrade head --sql  # 只印出 SQL，不執行
```

### 2. 處理已存在的資料庫

如果資料庫已經有表格（例如之前手動建的），需要「標記」migration 為已套用：

```bash
# 假設 users 表已存在，對應 001 migration
alembic stamp 001

# 然後執行後續 migration
alembic upgrade head
```

這樣 Alembic 就知道「001 已經套用過了」，只會執行 002 以後的 migration。

### 3. 時區問題：TIMESTAMP vs TIMESTAMPTZ

```python
# 不含時區（不推薦）
sa.Column("created_at", sa.DateTime)

# 含時區（推薦）
sa.Column("created_at", sa.DateTime(timezone=True))
```

PostgreSQL 的 `TIMESTAMPTZ` 會自動處理時區轉換，永遠以 UTC 儲存。

### 4. JSONB 欄位的預設值

```python
# 空物件
sa.Column("preferences", JSONB, server_default="{}")

# 空陣列
sa.Column("messages", JSONB, server_default="[]")
```

注意預設值是**字串**，不是 Python dict/list。

### 5. 修改已存在的表格

新增欄位：
```python
def upgrade():
    op.add_column("users", sa.Column("email", sa.String(200)))

def downgrade():
    op.drop_column("users", "email")
```

修改欄位類型：
```python
def upgrade():
    op.alter_column(
        "users",
        "display_name",
        type_=sa.String(200),  # 從 100 改成 200
        existing_type=sa.String(100),
    )

def downgrade():
    op.alter_column(
        "users",
        "display_name",
        type_=sa.String(100),
        existing_type=sa.String(200),
    )
```

### 6. 資料遷移

有時候不只要改結構，還要搬移資料：

```python
def upgrade():
    # 1. 新增欄位
    op.add_column("users", sa.Column("full_name", sa.String(200)))

    # 2. 搬移資料
    op.execute("""
        UPDATE users
        SET full_name = display_name
        WHERE display_name IS NOT NULL
    """)

    # 3. 刪除舊欄位
    op.drop_column("users", "display_name")
```

### 7. 版本號命名

建議使用簡單的數字版本號：

```
001_create_users.py
002_create_ai_chats.py
003_add_email_to_users.py
```

這樣容易看出順序。原本 Alembic 產生的是隨機 hash（如 `abc123def456_xxx.py`），可以手動改成數字。

### 8. 整合到 CI/CD

```yaml
# .github/workflows/deploy.yml
- name: Run migrations
  run: |
    cd backend
    alembic upgrade head
  env:
    CHING_TECH_DB_HOST: ${{ secrets.DB_HOST }}
    CHING_TECH_DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```

### 9. asyncpg 與 JSONB 的注意事項

如果用 asyncpg，JSONB 回傳的是**字串**，需要手動解析：

```python
import json

async def get_chat(chat_id: UUID):
    row = await conn.fetchrow("SELECT * FROM ai_chats WHERE id = $1", chat_id)
    if row:
        result = dict(row)
        # JSONB 欄位需要手動解析
        result["messages"] = json.loads(result["messages"])
        return result
```

---

## 小結

這篇文章介紹了：

1. **Migration 概念**：用腳本管理資料庫結構變更
2. **Alembic 設定**：整合專案設定，動態讀取資料庫 URL
3. **建立 Migration**：upgrade 和 downgrade 函式
4. **常用操作**：升級、rollback、查看歷史
5. **進階技巧**：處理已存在資料庫、資料遷移

有了 Alembic：
- 團隊成員可以輕鬆同步資料庫結構
- 部署新環境只要執行 `alembic upgrade head`
- 出問題可以 `alembic downgrade` rollback
- 所有變更都有歷史記錄

下一篇我們會用 **Docker Compose** 把 PostgreSQL 和開發環境打包，新人加入專案只要一個指令就能開始開發。

---

## 完整程式碼

### alembic.ini

```ini
[alembic]
script_location = %(here)s/migrations
prepend_sys_path = .:src
path_separator = os

# 資料庫 URL 在 env.py 動態設定

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

### migrations/env.py

```python
"""Alembic migrations environment configuration."""

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# 從專案設定讀取資料庫 URL
from ching_tech_os.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### migrations/versions/001_create_users.py

```python
"""create users table

Revision ID: 001
Revises:
Create Date: 2025-12-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001"
down_revision: str | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(100), unique=True, nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("preferences", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
    )
    op.create_index("idx_users_username", "users", ["username"])

    op.execute("COMMENT ON TABLE users IS '使用者表'")
    op.execute("COMMENT ON COLUMN users.username IS 'NAS 帳號'")


def downgrade() -> None:
    op.drop_index("idx_users_username")
    op.drop_table("users")
```

### migrations/versions/002_create_ai_chats.py

```python
"""create ai_chats table

Revision ID: 002
Revises: 001
Create Date: 2025-12-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "002"
down_revision: str | None = "001"


def upgrade() -> None:
    op.create_table(
        "ai_chats",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("title", sa.String(100), server_default="新對話"),
        sa.Column("model", sa.String(50), server_default="claude-sonnet"),
        sa.Column("messages", JSONB, server_default="[]"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_ai_chats_user_id", "ai_chats", ["user_id"])
    op.create_index(
        "idx_ai_chats_updated_at", "ai_chats",
        [sa.text("updated_at DESC")]
    )


def downgrade() -> None:
    op.drop_index("idx_ai_chats_updated_at")
    op.drop_index("idx_ai_chats_user_id")
    op.drop_table("ai_chats")
```
