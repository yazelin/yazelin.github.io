---
layout: post
title: "Docker Compose 一鍵啟動開發環境"
subtitle: "新人加入專案，五分鐘就能開始開發"
date: 2025-12-13
categories: [DevOps]
tags: [Docker, Docker Compose, PostgreSQL, DevOps]
---

> **📚 系列文章**
> 1. [Alembic 資料庫版本控制：讓 Schema 變更可追蹤]({% post_url 2025-12-13-devops-part1-alembic %})
> 2. [Docker Compose 一鍵啟動開發環境]({% post_url 2025-12-13-devops-part2-docker %}) ← 目前閱讀
>
> **📖 前置知識**
> - [Linux 終端機入門]({% post_url 2025-12-13-linux-basics %})
> - [Docker 基礎概念]({% post_url 2025-12-13-docker-basics %})
> - [Git 入門：版本控制基礎指令]({% post_url 2025-12-13-git-basics %})

---

## 這篇文章要解決什麼問題？

**新人**：「我照文件裝 PostgreSQL，但版本不對跑不起來...」

**資深工程師**：「你裝 16，我們用 14。而且環境變數也要設，我再傳給你。」

**新人**：「弄了一整天，環境還是跑不起來，好挫折...」

**老闆**：「新人加入要花多久才能開始開發？這樣效率太差了。」

**資深工程師**：「我們用 Docker Compose，把環境打包好。新人只要裝 Docker，一個指令就能啟動所有服務。」

**新人**：「真的假的？那我剛剛白忙了...」

**資深工程師**：「以後五分鐘內就能開始寫 code。」

新人加入專案，最常遇到的問題：

| 問題 | 痛點 |
|------|------|
| 環境安裝 | 「Python 版本不對」「PostgreSQL 裝不起來」 |
| 設定繁瑣 | 「資料庫帳密要設什麼？」「環境變數有哪些？」 |
| 版本不一致 | 「你的 PostgreSQL 是 14，我的是 16」 |
| 清理困難 | 「不用這個專案了，怎麼移除資料庫？」 |

Docker Compose 解決這些問題：
- **一個指令**啟動所有需要的服務
- **版本固定**，每個人環境都一樣
- **隔離乾淨**，不用時刪掉容器就好

---

## 技術概念

### Docker vs Docker Compose

| 工具 | 用途 |
|------|------|
| Docker | 執行單一容器 |
| Docker Compose | 定義和管理**多個容器** |

我們的專案需要：
- PostgreSQL 資料庫
- code-server（網頁版 VS Code）

用 Docker Compose 可以用**一個檔案**定義這些服務，**一個指令**全部啟動。

### docker-compose.yml 基本結構

```yaml
services:              # 定義各個服務
  postgres:            # 服務名稱
    image: postgres:16-alpine
    container_name: my-db
    environment:       # 環境變數
      POSTGRES_PASSWORD: secret
    volumes:           # 掛載目錄
      - db_data:/var/lib/postgresql/data
    ports:             # 埠號映射
      - "5432:5432"

volumes:               # 持久化資料
  db_data:
```

### 為什麼要用 Alpine 版本？

```yaml
image: postgres:16-alpine   # ✓ 推薦
image: postgres:16          # 也可以
```

Alpine 版本的優點：
- 映像檔體積小（~70MB vs ~400MB）
- 下載快、啟動快
- 對開發環境來說功能完全夠用

---

## 跟著做：Step by Step

### 步驟 1：建立目錄結構

```
docker/
├── docker-compose.yml     # 服務定義
├── .env.example           # 環境變數範例
└── .env                   # 實際環境變數（不進 git）
```

> **注意**：資料表由 Alembic migration 管理，不需要 init.sql。詳見 **[Alembic 資料庫版本控制]({% post_url 2025-12-13-devops-part1-alembic %})**。

### 步驟 2：撰寫 docker-compose.yml

```yaml
# docker/docker-compose.yml

services:
  postgres:
    image: postgres:16-alpine
    container_name: ching-tech-os-db
    environment:
      POSTGRES_USER: ${DB_USER:-ching_tech}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-ching_tech_dev}
      POSTGRES_DB: ${DB_NAME:-ching_tech_os}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "${DB_PORT:-5432}:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-ching_tech} -d ${DB_NAME:-ching_tech_os}"]
      interval: 10s
      timeout: 5s
      retries: 5

  code-server:
    image: codercom/code-server:latest
    container_name: ching-tech-os-code
    command: ["--auth", "none", "--bind-addr", "0.0.0.0:8080"]
    volumes:
      - ${HOME}/SDD:/home/coder/SDD
      - code_server_data:/home/coder/.local
    ports:
      - "${CODE_PORT:-8443}:8080"
    restart: unless-stopped
    working_dir: /home/coder/SDD/ching-tech-os

volumes:
  postgres_data:
  code_server_data:
```

### 步驟 3：解說每個設定

**PostgreSQL 服務：**

```yaml
postgres:
  image: postgres:16-alpine              # 使用 PostgreSQL 16 Alpine 版
  container_name: ching-tech-os-db       # 固定容器名稱，方便辨識
  environment:
    POSTGRES_USER: ${DB_USER:-ching_tech}      # 使用者，預設 ching_tech
    POSTGRES_PASSWORD: ${DB_PASSWORD:-...}     # 密碼，從 .env 讀取
    POSTGRES_DB: ${DB_NAME:-ching_tech_os}     # 資料庫名稱
  volumes:
    - postgres_data:/var/lib/postgresql/data   # 資料持久化
  ports:
    - "${DB_PORT:-5432}:5432"            # 對外埠號，預設 5432
  restart: unless-stopped                 # 異常時自動重啟
  healthcheck:                            # 健康檢查
    test: ["CMD-SHELL", "pg_isready ..."]
    interval: 10s
    timeout: 5s
    retries: 5
```

**code-server 服務：**

```yaml
code-server:
  image: codercom/code-server:latest     # 網頁版 VS Code
  container_name: ching-tech-os-code
  command: ["--auth", "none", ...]       # 不需要認證（開發環境）
  volumes:
    - ${HOME}/SDD:/home/coder/SDD        # 掛載專案目錄
    - code_server_data:/home/coder/.local # 擴充功能資料
  ports:
    - "${CODE_PORT:-8443}:8080"          # 對外 8443 → 內部 8080
  working_dir: /home/coder/SDD/ching-tech-os  # 預設開啟目錄
```

### 步驟 4：建立環境變數檔

```bash
# docker/.env.example

# PostgreSQL 設定
DB_USER=ching_tech
DB_PASSWORD=your_secure_password_here
DB_NAME=ching_tech_os
DB_PORT=5432

# code-server 設定
CODE_PORT=8443
```

複製並修改：

```bash
cd docker
cp .env.example .env
# 編輯 .env，設定自己的密碼
```

### 步驟 5：啟動服務

```bash
cd docker

# 啟動所有服務（背景執行）
docker compose up -d

# 查看狀態
docker compose ps

# 查看日誌
docker compose logs -f
```

輸出範例：

```
NAME                 STATUS    PORTS
ching-tech-os-db     running   0.0.0.0:5432->5432/tcp
ching-tech-os-code   running   0.0.0.0:8443->8080/tcp
```

### 步驟 6：驗證服務

**PostgreSQL：**

```bash
# 連線到資料庫
docker compose exec postgres psql -U ching_tech -d ching_tech_os

# 在 psql 中
\dt          # 列出所有表格
\q           # 離開
```

**code-server：**

打開瀏覽器，訪問 `http://localhost:8443`，應該看到 VS Code 介面。

---

## 進階技巧與踩坑紀錄

### 1. Volume 持久化

Docker 容器刪除後，裡面的資料會消失。使用 Volume 可以把資料保留下來：

```yaml
volumes:
  postgres_data:    # 資料庫資料
  code_server_data: # VS Code 擴充功能
```

這些 Volume 會保存在 Docker 的資料目錄中，即使容器刪除也不會遺失。

### 2. 只啟動特定服務

```bash
# 只啟動 PostgreSQL
docker compose up -d postgres

# 只停止 code-server
docker compose stop code-server
```

### 3. 資料庫備份與還原

```bash
# 備份
docker compose exec postgres pg_dump -U ching_tech ching_tech_os > backup.sql

# 還原
docker compose exec -T postgres psql -U ching_tech ching_tech_os < backup.sql
```

### 4. 完全清除資料

```bash
# 停止並移除容器（保留 Volume）
docker compose down

# 停止並移除容器和 Volume（資料會遺失！）
docker compose down -v
```

### 5. 健康檢查的重要性

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ching_tech"]
  interval: 10s
  timeout: 5s
  retries: 5
```

有了健康檢查，其他服務可以等待 PostgreSQL 就緒後再啟動：

```yaml
backend:
  depends_on:
    postgres:
      condition: service_healthy  # 等待 postgres 健康
```

### 6. 環境變數預設值

```yaml
${DB_USER:-ching_tech}
```

這個語法的意思是：
- 如果 `DB_USER` 環境變數有設定，就用它的值
- 如果沒有設定，就用預設值 `ching_tech`

### 7. 本地開發 vs 生產環境

| 項目 | 開發環境 | 生產環境 |
|------|----------|----------|
| 密碼 | 可以簡單 | 必須複雜 |
| 埠號 | 對外開放 | 只給內部 |
| code-server | 有 | 不需要 |
| restart | unless-stopped | always |

生產環境可以用另一個設定檔：

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 8. 常見問題排除

**埠號被佔用：**

```bash
# 找出佔用埠號的程式
lsof -i :5432

# 修改 .env 換一個埠號
DB_PORT=5433
```

**容器無法啟動：**

```bash
# 查看錯誤訊息
docker compose logs postgres

# 常見原因：
# - init.sql 語法錯誤
# - Volume 權限問題（需要 down -v 重建）
```

**連不上資料庫：**

```bash
# 確認容器正在運行
docker compose ps

# 測試連線
docker compose exec postgres pg_isready

# 檢查網路
docker compose exec postgres ping localhost
```

---

## 小結

這篇文章介紹了：

1. **Docker Compose 基本概念**：用一個檔案定義多個服務
2. **PostgreSQL 容器化**：資料持久化、健康檢查
3. **code-server 整合**：網頁版 VS Code 方便開發
4. **環境變數管理**：`.env` 檔案隔離敏感資訊
5. **常用指令**：啟動、停止、備份、清理

有了這套設定，新人加入專案只需要：

```bash
cd docker
cp .env.example .env
docker compose up -d
```

五分鐘後就能開始開發！

---

## 完整程式碼

### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: ching-tech-os-db
    environment:
      POSTGRES_USER: ${DB_USER:-ching_tech}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-ching_tech_dev}
      POSTGRES_DB: ${DB_NAME:-ching_tech_os}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "${DB_PORT:-5432}:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-ching_tech} -d ${DB_NAME:-ching_tech_os}"]
      interval: 10s
      timeout: 5s
      retries: 5

  code-server:
    image: codercom/code-server:latest
    container_name: ching-tech-os-code
    command: ["--auth", "none", "--bind-addr", "0.0.0.0:8080"]
    volumes:
      - ${HOME}/SDD:/home/coder/SDD
      - code_server_data:/home/coder/.local
    ports:
      - "${CODE_PORT:-8443}:8080"
    restart: unless-stopped
    working_dir: /home/coder/SDD/ching-tech-os

volumes:
  postgres_data:
  code_server_data:
```

### .env.example

```bash
# PostgreSQL 設定
DB_USER=ching_tech
DB_PASSWORD=your_secure_password_here
DB_NAME=ching_tech_os
DB_PORT=5432

# code-server 設定
CODE_PORT=8443
```

### init.sql（選用）

```sql
-- Ching Tech OS Database Initialization
--
-- 注意：資料表由 Alembic migration 管理，請勿在此建立表格
-- 此檔案僅用於啟用 PostgreSQL 擴充功能（如有需要）
--
-- 使用方式：
-- 1. 取消 docker-compose.yml 中 init.sql 的註解
-- 2. 在下方加入需要的擴充功能
--
-- 範例：
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### 常用指令速查

```bash
# 啟動
docker compose up -d

# 停止
docker compose down

# 查看狀態
docker compose ps

# 查看日誌
docker compose logs -f

# 連線資料庫
docker compose exec postgres psql -U ching_tech -d ching_tech_os

# 備份資料庫
docker compose exec postgres pg_dump -U ching_tech ching_tech_os > backup.sql

# 還原資料庫
docker compose exec -T postgres psql -U ching_tech ching_tech_os < backup.sql

# 完全清除（包含資料）
docker compose down -v
```

---

## 系列總結

到這裡，我們完成了 **ChingTech OS 技術分享系列** 的全部 17 篇文章：

| 系列 | 主題 |
|------|------|
| 系列一 | 無框架前端開發：IIFE 模組、視窗系統、CSS 設計系統 |
| 系列二 | Web 終端機：PTY、Socket.IO、xterm.js |
| 系列三 | Claude AI 整合：CLI 架構、Token 管理、Prompt 設計 |
| 系列四 | NAS 檔案存取：SMB 協定、FastAPI 檔案 API |
| 系列五 | 安全機制：認證系統、登入追蹤 |
| 系列六 | DevOps：Alembic Migration、Docker Compose |

希望這些文章能幫助你理解內部系統開發的各個面向，從前端到後端、從安全到部署，都有完整的實作參考。

Happy Coding!
