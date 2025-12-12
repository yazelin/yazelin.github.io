---
layout: post
title: "Docker 基礎概念與常用指令"
subtitle: "從零開始理解容器化，為 Docker Compose 做準備"
date: 2025-12-13
categories: [DevOps]
tags: [Docker, Docker Compose, 容器化, DevOps]
---

> **📚 延伸閱讀**
> - [Docker Compose 一鍵啟動開發環境]({% post_url 2025-12-13-devops-part2-docker %})
> - [ChingTech OS 技術分享系列：完整目錄]({% post_url 2025-12-13-ching-tech-os-index %})
>
> **📖 前置知識**：如果對 Linux 終端機不熟悉，建議先閱讀 [Linux 終端機入門：開發者必備指令]({% post_url 2025-12-13-linux-basics %})

---

## 這篇文章要解決什麼問題？

**後端工程師**：「奇怪，我更新了 A 專案的套件，結果 B 專案跑不起來了...」
**資深工程師**：「因為它們共用系統環境，套件版本互相衝突了。」
**後端工程師**：「那我要怎麼隔離？每個專案開一台虛擬機？」
**資深工程師**：「不用那麼麻煩，用 Docker。每個專案跑在獨立的容器裡，互不干擾。」
**後端工程師**：「容器？那跟虛擬機有什麼不同？」
**資深工程師**：「容器更輕量，啟動只要幾秒，而且吃的資源少很多。」

這篇文章會讓你理解：
- Docker 解決什麼問題
- Container 和 Image 是什麼
- Docker Compose 怎麼用
- 讀懂 docker-compose.yml 檔案

---

## 技術概念

### Docker 解決什麼問題？

傳統開發環境的痛點：

| 問題 | 情境 |
|------|------|
| 版本不一致 | 「我的 Python 是 3.9，你的是 3.12」 |
| 環境污染 | 「裝了 A 專案的套件，B 專案壞了」 |
| 安裝複雜 | 「PostgreSQL 在 Windows 裝不起來」 |
| 難以重現 | 「在我電腦可以跑啊」 |

Docker 的解法：**把應用程式和它需要的環境打包在一起**。

```
傳統方式：
應用程式 → 依賴作業系統環境 → 每台電腦都要裝一遍

Docker 方式：
應用程式 + 環境 → 打包成 Image → 任何電腦都能跑
```

### Container vs 虛擬機

| 比較 | 虛擬機 (VM) | Container |
|------|-------------|-----------|
| 啟動時間 | 分鐘級 | 秒級 |
| 資源佔用 | GB 級（含完整 OS） | MB 級（共用 OS 核心） |
| 隔離程度 | 完全隔離 | 程序級隔離 |
| 適用場景 | 需要不同 OS | 同 OS 下的應用隔離 |

簡單比喻：
- **虛擬機**：每個應用住一棟獨立的房子（含地基、水電）
- **Container**：每個應用住公寓的一間房（共用大樓基礎設施）

### Image vs Container

這是最重要的概念：

| 概念 | 說明 | 比喻 |
|------|------|------|
| **Image（映像檔）** | 唯讀的模板，包含應用程式和環境 | 蛋糕食譜 |
| **Container（容器）** | Image 的執行實例，可以啟動、停止 | 按食譜做出的蛋糕 |

```
一個 Image 可以建立多個 Container：

postgres:16-alpine (Image)
    ├── ching-tech-os-db (Container 1)
    ├── another-project-db (Container 2)
    └── test-db (Container 3)
```

### Docker Compose 是什麼？

Docker 本身一次只管理一個 Container。但實際專案通常需要多個服務：

```
一個 Web 專案可能需要：
├── PostgreSQL（資料庫）
├── Redis（快取）
├── Nginx（反向代理）
└── code-server（開發環境）
```

**Docker Compose** 讓你用一個檔案（`docker-compose.yml`）定義所有服務，一個指令全部啟動。

### Docker Compose v1 vs v2

| 版本 | 指令 | 狀態 |
|------|------|------|
| v1 | `docker-compose up` | 已棄用 |
| **v2** | `docker compose up` | **現行標準** |

v2 已內建於 Docker，不需另外安裝。注意指令是 `docker compose`（空格），不是 `docker-compose`（連字號）。

```bash
# 檢查版本
docker --version          # Docker version 28.5.0
docker compose version    # Docker Compose version v2.39.4
```

---

## 安裝 Docker

### Ubuntu / Debian

使用官方安裝腳本（最簡單）：

```bash
# 下載並執行官方安裝腳本
curl -fsSL https://get.docker.com | sh

# 將目前使用者加入 docker 群組（免 sudo）
sudo usermod -aG docker $USER

# 重新登入或執行以下指令讓群組生效
newgrp docker

# 驗證安裝
docker --version
docker compose version
```

### 其他系統

| 系統 | 安裝方式 |
|------|----------|
| **macOS** | 下載 [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Windows** | 下載 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（需啟用 WSL2） |
| **CentOS/RHEL** | 同樣可用 `curl -fsSL https://get.docker.com | sh` |

> **注意**：安裝後若遇到權限問題（`permission denied`），確認已執行 `usermod -aG docker $USER` 並重新登入。

---

## 跟著做：理解 docker-compose.yml

以下是我們專案實際使用的 `docker-compose.yml`，逐段解說：

### 完整檔案

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

### 逐段解說

#### 1. services（服務定義）

```yaml
services:
  postgres:      # 服務名稱（自訂）
    ...
  code-server:   # 另一個服務
    ...
```

`services` 下面定義所有要啟動的服務，名稱可以自訂。

#### 2. image（映像檔）

```yaml
image: postgres:16-alpine
```

指定要使用的 Image：
- `postgres`：Image 名稱（來自 Docker Hub）
- `16`：版本號
- `alpine`：輕量版（基於 Alpine Linux，體積小）

常見的 Image 來源：
- [Docker Hub](https://hub.docker.com/)：官方映像檔庫
- 搜尋方式：`docker search postgres`

#### 3. container_name（容器名稱）

```yaml
container_name: ching-tech-os-db
```

指定容器名稱，方便辨識。如果不指定，Docker 會自動產生名稱。

#### 4. environment（環境變數）

```yaml
environment:
  POSTGRES_USER: ${DB_USER:-ching_tech}
  POSTGRES_PASSWORD: ${DB_PASSWORD:-ching_tech_dev}
  POSTGRES_DB: ${DB_NAME:-ching_tech_os}
```

設定容器內的環境變數。`${VAR:-default}` 語法：
- 如果 `DB_USER` 環境變數有設定，使用它的值
- 如果沒有設定，使用預設值 `ching_tech`

環境變數可以寫在 `.env` 檔案：

```bash
# .env
DB_USER=ching_tech
DB_PASSWORD=my_secret_password
DB_NAME=ching_tech_os
```

#### 5. volumes（資料持久化）

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data    # Named Volume
  - ${HOME}/SDD:/home/coder/SDD               # Bind Mount
```

Container 刪除後，裡面的資料會消失。Volume 讓資料保留下來。

| 類型 | 語法 | 說明 |
|------|------|------|
| **Named Volume** | `名稱:容器路徑` | Docker 管理，存在 Docker 資料目錄 |
| **Bind Mount** | `主機路徑:容器路徑` | 直接掛載主機目錄 |

```yaml
# 檔案最下方要宣告 Named Volume
volumes:
  postgres_data:      # 宣告名為 postgres_data 的 Volume
  code_server_data:
```

#### 6. ports（埠號映射）

```yaml
ports:
  - "${DB_PORT:-5432}:5432"
  #   ↑ 主機埠號         ↑ 容器埠號
```

格式：`主機埠號:容器埠號`

- 容器內 PostgreSQL 監聽 5432
- 映射到主機的 5432（或 `.env` 指定的埠號）
- 外部透過 `localhost:5432` 連線

#### 7. restart（重啟策略）

```yaml
restart: unless-stopped
```

| 策略 | 說明 |
|------|------|
| `no` | 不自動重啟（預設） |
| `always` | 總是重啟 |
| `unless-stopped` | 除非手動停止，否則重啟 |
| `on-failure` | 只在錯誤退出時重啟 |

#### 8. healthcheck（健康檢查）

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ching_tech -d ching_tech_os"]
  interval: 10s    # 每 10 秒檢查一次
  timeout: 5s      # 檢查超時時間
  retries: 5       # 連續失敗 5 次才算不健康
```

讓 Docker 知道服務是否正常運作。其他服務可以等待它 healthy 後再啟動。

#### 9. command（覆蓋預設指令）

```yaml
command: ["--auth", "none", "--bind-addr", "0.0.0.0:8080"]
```

覆蓋 Image 的預設啟動指令。這裡讓 code-server 不需要密碼認證。

#### 10. working_dir（工作目錄）

```yaml
working_dir: /home/coder/SDD/ching-tech-os
```

設定容器啟動後的預設工作目錄。

---

## 常用指令速查

### 基本操作

```bash
# 啟動所有服務（背景執行）
docker compose up -d

# 停止所有服務
docker compose down

# 停止並刪除 Volume（資料會遺失！）
docker compose down -v

# 查看運行中的容器
docker compose ps

# 查看日誌（持續追蹤）
docker compose logs -f

# 查看特定服務的日誌
docker compose logs -f postgres
```

### 進入容器

```bash
# 進入容器執行指令
docker compose exec postgres psql -U ching_tech -d ching_tech_os

# 進入容器的 shell
docker compose exec postgres bash
```

### 單獨操作服務

```bash
# 只啟動特定服務
docker compose up -d postgres

# 只停止特定服務
docker compose stop code-server

# 重啟特定服務
docker compose restart postgres
```

### 清理

```bash
# 刪除停止的容器
docker container prune

# 刪除未使用的 Image
docker image prune

# 刪除未使用的 Volume（危險！）
docker volume prune

# 全部清理（危險！）
docker system prune -a
```

---

## 進階技巧

### 1. 查看容器狀態

```bash
# 詳細狀態（含健康檢查）
docker compose ps -a

# 輸出範例：
NAME                 STATUS                   PORTS
ching-tech-os-db     running (healthy)        0.0.0.0:5432->5432/tcp
ching-tech-os-code   running                  0.0.0.0:8443->8080/tcp
```

### 2. 查看 Volume 位置

```bash
# 列出所有 Volume
docker volume ls

# 查看 Volume 詳細資訊
docker volume inspect docker_postgres_data
```

### 3. 備份與還原

```bash
# 備份資料庫
docker compose exec postgres pg_dump -U ching_tech ching_tech_os > backup.sql

# 還原資料庫
docker compose exec -T postgres psql -U ching_tech ching_tech_os < backup.sql
```

### 4. 常見問題排除

**埠號被佔用：**

```bash
# 找出佔用埠號的程式
lsof -i :5432

# 解法：修改 .env 換一個埠號
DB_PORT=5433
```

**容器無法啟動：**

```bash
# 查看錯誤訊息
docker compose logs postgres

# 常見原因：
# - Image 下載失敗（網路問題）
# - Volume 權限問題
# - 埠號衝突
```

**清除重來：**

```bash
# 停止並刪除所有容器和 Volume
docker compose down -v

# 重新啟動
docker compose up -d
```

---

## 小結

這篇文章介紹了：

| 概念 | 重點 |
|------|------|
| Docker 用途 | 解決環境不一致、安裝複雜的問題 |
| Image vs Container | Image 是模板，Container 是實例 |
| Docker Compose v2 | 用 `docker compose`（空格）指令 |
| docker-compose.yml | services、volumes、ports、environment |
| 常用指令 | up、down、ps、logs、exec |

理解這些概念後，就可以閱讀 [Docker Compose 一鍵啟動開發環境]({% post_url 2025-12-13-devops-part2-docker %})，實際操作我們的開發環境了！

---

## 參考資源

- [Docker 官方文件](https://docs.docker.com/)
- [Docker Compose 官方文件](https://docs.docker.com/compose/)
- [Docker Hub](https://hub.docker.com/)（映像檔庫）
- [Play with Docker](https://labs.play-with-docker.com/)（線上練習環境）
