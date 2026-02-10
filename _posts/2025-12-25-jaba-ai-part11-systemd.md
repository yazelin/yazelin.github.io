---
layout: post
title: "systemd 服務配置"
subtitle: "讓應用程式開機自動啟動、當機自動重啟"
date: 2025-12-25
categories: [Jaba AI]
tags: [Linux, systemd, 部署, DevOps, 服務管理]
series: jaba-ai
---

![systemd 服務配置](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-25-jaba-ai-part11-systemd.png)

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第十一篇（最後一篇）文章。

開發環境可以手動執行 `./start.sh`，但生產環境需要：

- 開機自動啟動
- 當機自動重啟
- 統一的日誌管理
- 標準的服務控制介面

這篇文章分享如何用 systemd 來達成這些目標。

---

## systemd 基礎概念

systemd 是現代 Linux 發行版的標準服務管理器。它的核心概念是「unit」，常見的 unit 類型：

| 類型 | 用途 |
|------|------|
| `.service` | 服務（daemon） |
| `.timer` | 定時任務（取代 cron） |
| `.socket` | Socket 啟動 |
| `.mount` | 掛載點 |

jaba-ai 使用 `.service` 來定義服務。

---

## 服務定義檔

```ini
# scripts/jaba-ai.service

[Unit]
Description=Jaba AI LINE Bot Service
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ct
Group=ct
WorkingDirectory=/home/ct/SDD/jaba-ai
EnvironmentFile=/home/ct/SDD/jaba-ai/.env

# 確保 PATH 包含 uv 和其他工具
Environment="PATH=/home/ct/.local/bin:/home/ct/.nvm/versions/node/v24.11.1/bin:/usr/local/bin:/usr/bin:/bin"

# 啟動前確保資料庫容器運行
ExecStartPre=/usr/bin/docker compose up -d postgres
ExecStartPre=/bin/sleep 3

# 啟動應用程式
ExecStart=/home/ct/.local/bin/uv run python main.py

# 停止時關閉資料庫容器
ExecStopPost=/usr/bin/docker compose down

Restart=on-failure
RestartSec=10

# 日誌設定
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jaba-ai

[Install]
WantedBy=multi-user.target
```

---

## 各區段說明

### [Unit] 區段

```ini
[Unit]
Description=Jaba AI LINE Bot Service
After=network.target docker.service
Requires=docker.service
```

| 設定 | 說明 |
|------|------|
| `Description` | 服務描述，會顯示在 `systemctl status` |
| `After` | 在這些 unit 之後啟動 |
| `Requires` | 依賴的 unit，如果 docker 沒啟動，這個服務也不會啟動 |

### [Service] 區段

```ini
[Service]
Type=simple
User=ct
Group=ct
WorkingDirectory=/home/ct/SDD/jaba-ai
```

| 設定 | 說明 |
|------|------|
| `Type=simple` | 主程序就是服務本身（最常用） |
| `User/Group` | 以哪個使用者身份執行 |
| `WorkingDirectory` | 工作目錄 |

### 環境變數

```ini
EnvironmentFile=/home/ct/SDD/jaba-ai/.env
Environment="PATH=/home/ct/.local/bin:/usr/local/bin:/usr/bin:/bin"
```

- `EnvironmentFile`：從檔案載入環境變數
- `Environment`：直接設定環境變數

**重點**：systemd 執行環境的 PATH 很乾淨，需要手動加入 `~/.local/bin`（uv 安裝位置）。

### 執行指令

```ini
ExecStartPre=/usr/bin/docker compose up -d postgres
ExecStartPre=/bin/sleep 3
ExecStart=/home/ct/.local/bin/uv run python main.py
ExecStopPost=/usr/bin/docker compose down
```

| 設定 | 時機 |
|------|------|
| `ExecStartPre` | 啟動前執行（可多個） |
| `ExecStart` | 主程序 |
| `ExecStopPost` | 停止後執行 |

流程：
1. 先啟動 PostgreSQL 容器
2. 等待 3 秒讓資料庫就緒
3. 啟動 Python 應用程式
4. 停止時順便關閉資料庫容器

### 重啟策略

```ini
Restart=on-failure
RestartSec=10
```

| 設定 | 說明 |
|------|------|
| `Restart=on-failure` | 非正常結束時自動重啟 |
| `RestartSec=10` | 重啟前等待 10 秒 |

其他 `Restart` 選項：
- `no`：不重啟
- `always`：總是重啟（包含正常結束）
- `on-success`：正常結束時重啟
- `on-failure`：失敗時重啟（推薦）

### 日誌設定

```ini
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jaba-ai
```

將 stdout/stderr 導向 systemd journal，可用 `journalctl` 查看。

### [Install] 區段

```ini
[Install]
WantedBy=multi-user.target
```

`multi-user.target` 是一般的多使用者模式，表示開機進入正常模式時會啟動這個服務。

---

## 安裝腳本

```bash
#!/bin/bash
# scripts/install-service.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/jaba-ai.service"

if [ "$EUID" -ne 0 ]; then
    echo "請使用 sudo 執行此腳本"
    echo "用法: sudo $0"
    exit 1
fi

echo "安裝 jaba-ai 服務..."

# 複製 service 檔案
cp "$SERVICE_FILE" /etc/systemd/system/jaba-ai.service

# 重新載入 systemd
systemctl daemon-reload

# 啟用服務（開機自動啟動）
systemctl enable jaba-ai

echo "服務安裝完成！"
echo ""
echo "常用指令："
echo "  sudo systemctl start jaba-ai   # 啟動服務"
echo "  sudo systemctl stop jaba-ai    # 停止服務"
echo "  sudo systemctl restart jaba-ai # 重啟服務"
echo "  sudo systemctl status jaba-ai  # 查看狀態"
echo "  journalctl -u jaba-ai -f       # 查看即時日誌"
```

### 安裝步驟

1. 複製 `.service` 到 `/etc/systemd/system/`
2. `daemon-reload` 讓 systemd 重新讀取設定
3. `enable` 設定開機自動啟動

---

## 移除腳本

```bash
#!/bin/bash
# scripts/uninstall-service.sh

set -e

if [ "$EUID" -ne 0 ]; then
    echo "請使用 sudo 執行此腳本"
    echo "用法: sudo $0"
    exit 1
fi

echo "移除 jaba-ai 服務..."

# 停止服務
systemctl stop jaba-ai 2>/dev/null || true

# 停用開機自動啟動
systemctl disable jaba-ai 2>/dev/null || true

# 刪除 service 檔案
rm -f /etc/systemd/system/jaba-ai.service

# 重新載入 systemd
systemctl daemon-reload

echo "服務已移除！"
```

---

## 常用操作指令

### 服務控制

```bash
# 啟動
sudo systemctl start jaba-ai

# 停止
sudo systemctl stop jaba-ai

# 重啟
sudo systemctl restart jaba-ai

# 重新載入設定（不重啟）
sudo systemctl reload jaba-ai

# 查看狀態
sudo systemctl status jaba-ai
```

### 開機設定

```bash
# 開機自動啟動
sudo systemctl enable jaba-ai

# 取消開機啟動
sudo systemctl disable jaba-ai

# 查看是否開機啟動
systemctl is-enabled jaba-ai
```

### 日誌查看

```bash
# 查看所有日誌
journalctl -u jaba-ai

# 查看最近 100 行
journalctl -u jaba-ai -n 100

# 即時追蹤（類似 tail -f）
journalctl -u jaba-ai -f

# 查看今天的日誌
journalctl -u jaba-ai --since today

# 查看特定時間範圍
journalctl -u jaba-ai --since "2025-12-25 10:00" --until "2025-12-25 12:00"
```

---

## 狀態輸出範例

```bash
$ sudo systemctl status jaba-ai

● jaba-ai.service - Jaba AI LINE Bot Service
     Loaded: loaded (/etc/systemd/system/jaba-ai.service; enabled; preset: enabled)
     Active: active (running) since Wed 2025-12-25 10:30:00 CST; 2h ago
    Process: 1234 ExecStartPre=/usr/bin/docker compose up -d postgres (code=exited, status=0/SUCCESS)
    Process: 1235 ExecStartPre=/bin/sleep 3 (code=exited, status=0/SUCCESS)
   Main PID: 1240 (python)
      Tasks: 4 (limit: 9447)
     Memory: 128.0M
        CPU: 5.432s
     CGroup: /system.slice/jaba-ai.service
             └─1240 /home/ct/.local/bin/python main.py

Dec 25 10:30:00 server systemd[1]: Starting Jaba AI LINE Bot Service...
Dec 25 10:30:03 server jaba-ai[1240]: INFO:     Started server process [1240]
Dec 25 10:30:03 server jaba-ai[1240]: INFO:     Application startup complete.
Dec 25 10:30:03 server jaba-ai[1240]: INFO:     Uvicorn running on http://0.0.0.0:8089
```

---

## 除錯技巧

### 服務無法啟動

```bash
# 查看詳細錯誤
journalctl -u jaba-ai -n 50 --no-pager

# 手動測試指令
sudo -u ct /home/ct/.local/bin/uv run python main.py
```

### 常見問題

| 問題 | 原因 | 解法 |
|------|------|------|
| `uv: command not found` | PATH 沒設對 | 確認 Environment 設定 |
| `Permission denied` | 使用者權限問題 | 確認 User/Group 設定 |
| `Address already in use` | Port 被佔用 | 先停止舊程序 |
| `ModuleNotFoundError` | 虛擬環境問題 | 用 `uv run` 執行 |

### 驗證設定檔

```bash
# 檢查語法
systemd-analyze verify /etc/systemd/system/jaba-ai.service

# 查看解析後的設定
systemctl cat jaba-ai
```

---

## 進階：使用者層級服務

如果不想用 sudo，可以用使用者層級的 systemd：

```bash
# 建立目錄
mkdir -p ~/.config/systemd/user/

# 複製 service 檔案（需修改路徑）
cp jaba-ai.service ~/.config/systemd/user/

# 重新載入
systemctl --user daemon-reload

# 啟用
systemctl --user enable jaba-ai

# 啟動
systemctl --user start jaba-ai

# 允許使用者服務在登出後繼續執行
loginctl enable-linger $USER
```

---

## 與 Docker 的整合

jaba-ai 的架構是：
- PostgreSQL 跑在 Docker 容器
- Python 應用程式跑在主機

這個設計的考量：

| 方案 | 優點 | 缺點 |
|------|------|------|
| 全部容器化 | 環境一致 | 開發除錯麻煩 |
| 混合架構 | 開發方便 | 部署稍複雜 |
| 全部主機 | 最簡單 | 環境污染 |

jaba-ai 選擇混合架構：
- DB 用容器（易於重建、資料隔離）
- App 跑主機（開發時可以 hot reload）

---

## 總結

systemd 服務配置的重點：

| 項目 | 說明 |
|------|------|
| 服務定義 | `.service` 檔案放 `/etc/systemd/system/` |
| 啟動順序 | 用 `After` 和 `Requires` 控制 |
| 環境變數 | `EnvironmentFile` 載入 `.env` |
| PATH 設定 | 手動加入 `~/.local/bin` |
| 重啟策略 | `Restart=on-failure` |
| 日誌管理 | 導向 journal，用 `journalctl` 查看 |

有了 systemd，jaba-ai 就能像正規的系統服務一樣運作：
- 開機自動啟動
- 當機自動重啟
- 統一的日誌管理
- 標準的控制介面

---

## 系列總結

這是 Jaba AI 技術分享系列的最後一篇。整個系列涵蓋了：

1. **專案整合** — 從兩個專案合併成一個
2. **架構設計** — Repository Pattern、Event Queue
3. **安全防護** — Prompt Injection、AI 日誌
4. **LINE Bot 整合** — SDK v3、群組權限
5. **AI 功能** — 自然語言點餐、菜單圖片辨識
6. **部署維運** — 啟動腳本、systemd 服務

希望這個系列對你有幫助！

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
