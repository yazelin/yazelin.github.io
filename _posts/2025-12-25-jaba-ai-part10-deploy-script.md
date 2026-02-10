---
layout: post
title: "一鍵啟動腳本設計"
subtitle: "讓開發者和維運人員都能輕鬆啟動服務"
date: 2025-12-25
categories: [Jaba AI]
tags: [Bash, Docker, 部署, DevOps, 開發環境]
series: jaba-ai
---

![一鍵啟動腳本設計](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-25-jaba-ai-part10-deploy-script.png)

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第十篇文章。

一個好的啟動腳本可以大幅降低開發和維運的門檻。這篇文章分享 jaba-ai 的啟動腳本設計，如何做到「一鍵啟動」整個開發環境。

---

## 設計目標

1. **一鍵啟動** — 執行一個指令就能啟動所有服務
2. **彈性操作** — 支援各種常見場景（只啟動 DB、只跑遷移等）
3. **友善輸出** — 彩色提示，清楚知道執行狀態
4. **安全處理** — 自動處理 port 衝突等問題

---

## 腳本架構

```
scripts/
├── start.sh              # 主啟動腳本
├── jaba-ai.service       # systemd 服務定義
├── install-service.sh    # 安裝服務腳本
└── uninstall-service.sh  # 移除服務腳本
```

---

## 完整腳本

```bash
#!/bin/bash
# Jaba AI 開發測試啟動腳本

set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 專案根目錄
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# 輸出函數
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
```

### 設計重點

| 項目 | 做法 | 目的 |
|------|------|------|
| `set -e` | 遇到錯誤立即停止 | 避免錯誤被忽略 |
| 彩色輸出 | ANSI 色碼 | 快速辨識狀態 |
| 自動定位 | `SCRIPT_DIR` 計算 | 從任何位置執行都正確 |

---

## 使用說明

### 顯示 help

```bash
show_help() {
    echo "使用方式: $0 [選項]"
    echo ""
    echo "選項:"
    echo "  --db-only      僅啟動資料庫"
    echo "  --app-only     僅啟動應用程式 (假設資料庫已運行)"
    echo "  --migrate      僅執行資料庫遷移"
    echo "  --stop         停止所有服務"
    echo "  --restart      重啟所有服務"
    echo "  --logs         查看資料庫日誌"
    echo "  --help         顯示此說明"
    echo ""
    echo "預設: 啟動資料庫 + 遷移 + 應用程式"
}
```

設計多種模式是因為開發時常見的需求：

| 場景 | 指令 |
|------|------|
| 首次啟動 | `./start.sh` |
| DB 已在跑，只重啟 App | `./start.sh --app-only` |
| 改了 migration，只跑遷移 | `./start.sh --migrate` |
| 下班收工 | `./start.sh --stop` |
| 除錯看 DB log | `./start.sh --logs` |

---

## 相依檢查

```bash
check_dependencies() {
    info "檢查相依工具..."

    if ! command -v docker &> /dev/null; then
        error "未安裝 docker"
    fi

    if ! command -v uv &> /dev/null; then
        error "未安裝 uv (Python 套件管理器)"
    fi

    success "相依工具檢查通過"
}
```

jaba-ai 使用：
- **Docker** — 運行 PostgreSQL
- **uv** — Python 套件管理（比 pip 快很多）

在啟動前先確認這些工具存在，給出明確的錯誤訊息。

---

## 環境變數載入

```bash
load_env() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        info "載入 .env 環境變數..."
        set -a
        source "$PROJECT_DIR/.env"
        set +a
        success "環境變數已載入"
    else
        warn ".env 檔案不存在，使用預設值"
    fi
}
```

### set -a 是什麼？

- `set -a`：開啟自動 export 模式
- `source .env`：執行 .env 檔案
- `set +a`：關閉自動 export 模式

這樣 .env 中定義的變數會自動成為環境變數，不需要每行加 `export`。

---

## 資料庫操作

### 啟動 PostgreSQL

```bash
start_db() {
    info "啟動 PostgreSQL..."
    docker compose up -d postgres
    success "PostgreSQL 容器已啟動"
}
```

### 等待就緒

資料庫啟動需要時間，不能立刻連線：

```bash
wait_for_db() {
    info "等待資料庫就緒..."

    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker compose exec -T postgres pg_isready -U "${DB_USER:-jaba}" -d "${DB_NAME:-jaba}" &> /dev/null; then
            success "資料庫已就緒"
            return 0
        fi

        echo -n "."
        sleep 1
        ((attempt++))
    done

    echo ""
    error "資料庫啟動逾時"
}
```

使用 `pg_isready` 來確認 PostgreSQL 真的可以接受連線，而不是只檢查容器狀態。

### 執行遷移

```bash
run_migrations() {
    info "執行資料庫遷移..."
    uv run alembic upgrade head
    success "資料庫遷移完成"
}
```

---

## Port 衝突處理

開發時常遇到「Port 已被佔用」的問題：

```bash
check_and_kill_port() {
    local port="${APP_PORT:-8089}"
    local pid=$(lsof -t -i ":$port" 2>/dev/null | head -1)

    if [ -n "$pid" ]; then
        warn "Port $port 已被佔用 (PID: $pid)"
        info "正在停止舊程序..."
        kill $pid 2>/dev/null || true
        sleep 1

        # 確認是否已停止
        if lsof -i ":$port" &>/dev/null; then
            warn "程序未停止，強制終止..."
            kill -9 $pid 2>/dev/null || true
            sleep 1
        fi

        success "舊程序已停止"
    fi
}
```

### 處理流程

1. 用 `lsof` 找出佔用 port 的 PID
2. 先嘗試正常 `kill`
3. 如果還沒死，用 `kill -9` 強制終止
4. 確保舊程序完全停止

---

## 啟動應用程式

```bash
start_app() {
    check_and_kill_port

    info "啟動應用程式..."
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Jaba AI 啟動於 http://localhost:${APP_PORT:-8089}${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    uv run python main.py
}
```

啟動前先檢查 port，然後用醒目的框框顯示啟動資訊。

---

## 主程式流程

```bash
main() {
    case "${1:-}" in
        --help|-h)
            show_help
            exit 0
            ;;
        --db-only)
            check_dependencies
            load_env
            start_db
            wait_for_db
            info "資料庫已啟動，連線資訊:"
            echo "  Host: localhost:${DB_PORT:-5432}"
            echo "  Database: ${DB_NAME:-jaba}"
            echo "  User: ${DB_USER:-jaba}"
            ;;
        --app-only)
            check_dependencies
            load_env
            start_app
            ;;
        --migrate)
            check_dependencies
            load_env
            run_migrations
            ;;
        --stop)
            stop_services
            ;;
        --restart)
            stop_services
            sleep 2
            check_dependencies
            load_env
            start_db
            wait_for_db
            run_migrations
            start_app
            ;;
        --logs)
            show_logs
            ;;
        "")
            # 預設：完整啟動
            check_dependencies
            load_env
            start_db
            wait_for_db
            run_migrations
            start_app
            ;;
        *)
            error "未知選項: $1 (使用 --help 查看說明)"
            ;;
    esac
}

main "$@"
```

### 預設行為

不帶參數執行時，會依序：

```
1. 檢查相依工具 (docker, uv)
2. 載入 .env 環境變數
3. 啟動 PostgreSQL 容器
4. 等待資料庫就緒
5. 執行資料庫遷移
6. 啟動 FastAPI 應用程式
```

### 資料安全說明

**重複執行 `./start.sh` 不會覆蓋資料庫資料**：

- `docker compose up -d` 只是啟動容器，不會重建
- PostgreSQL 資料存放在 named volume（`jaba_ai_postgres_data`），容器重啟不影響
- `alembic upgrade head` 只執行尚未執行的遷移，不會刪除現有資料

只有執行 `docker compose down -v`（加 `-v` 參數）才會刪除 volume 和資料。

---

## docker-compose.yml

搭配的 Docker Compose 設定：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: jaba-ai-postgres
    environment:
      POSTGRES_DB: ${DB_NAME:-jaba_ai}
      POSTGRES_USER: ${DB_USER:-jaba_ai}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-jaba_ai_secret}
    volumes:
      - jaba_ai_postgres_data:/var/lib/postgresql/data
    ports:
      - "${DB_PORT:-5433}:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-jaba_ai} -d ${DB_NAME:-jaba_ai}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  jaba_ai_postgres_data:
```

### 設計重點

| 項目 | 做法 |
|------|------|
| 輕量映像 | `postgres:16-alpine` |
| 環境變數 | 支援 .env 覆蓋預設值 |
| 資料持久化 | 使用 named volume |
| 健康檢查 | 自動重試直到就緒 |
| 自動重啟 | `unless-stopped` |

---

## 實際執行效果

```bash
$ ./scripts/start.sh

[INFO] 檢查相依工具...
[OK] 相依工具檢查通過
[INFO] 載入 .env 環境變數...
[OK] 環境變數已載入
[INFO] 啟動 PostgreSQL...
[OK] PostgreSQL 容器已啟動
[INFO] 等待資料庫就緒...
..
[OK] 資料庫已就緒
[INFO] 執行資料庫遷移...
[OK] 資料庫遷移完成
[INFO] 啟動應用程式...
========================================
  Jaba AI 啟動於 http://localhost:8089
========================================

INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8089
```

---

## 總結

一鍵啟動腳本的設計原則：

| 原則 | 做法 |
|------|------|
| 簡單易用 | 無參數就是預設完整流程 |
| 彈性足夠 | 支援常見的分拆操作 |
| 友善回饋 | 彩色輸出、進度提示 |
| 容錯處理 | 自動解決 port 衝突 |
| 明確錯誤 | 缺少相依時給出提示 |

這個腳本讓新加入的開發者可以在幾分鐘內啟動整個開發環境。

---

## 下一篇

下一篇文章會介紹如何用 systemd 將服務部署為系統服務：[systemd 服務配置]({% post_url 2025-12-25-jaba-ai-part11-systemd %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
