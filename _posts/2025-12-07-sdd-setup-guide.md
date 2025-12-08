---
layout: post
title: SDD 規格驅動開發入門（一）：環境安裝篇
tags: [教學, Python, FastAPI, AI, Claude Code, SDD]
---

本文介紹如何在 Ubuntu 上建立規格驅動開發（Specification-Driven Development, SDD）的完整開發環境，包含 Claude Code、OpenSpec 與 uv。

---

## 什麼是 SDD？

**規格驅動開發**是一種在寫程式碼之前，先與 AI 達成共識的開發方式。核心流程分為三個步驟：

```
Proposal（提案）→ Apply（實作）→ Archive（歸檔）
```

這套工具組合各司其職：

| 工具 | 角色 |
|------|------|
| **Claude Code** | AI 編碼助手，負責對話與程式碼生成 |
| **OpenSpec** | 規格管理工具，追蹤變更生命週期 |
| **uv** | Python 套件與專案管理器 |

---

## 環境需求

本文使用的環境：

| 項目 | 版本 |
|------|------|
| **作業系統** | Ubuntu 24.04.3 LTS (Noble Numbat) |
| **Kernel** | 6.14.0-36-generic |
| **Node.js** | v22.17.1 |
| **npm** | 10.9.2 |
| **Python** | 3.12.3 |
| **uv** | 0.8.4 |
| **Claude Code** | 2.0.61 |
| **Claude 認證** | Max 訂閱帳號 |
| **OpenSpec** | 0.16.0 |

最低需求：

- Ubuntu 22.04 LTS 或更新版本
- Node.js 20.19.0+（Claude Code、OpenSpec 需要）
- Python 3.11+
- 網路連線（安裝套件、API 認證）

---

## 安裝流程總覽

```
nvm → Node.js → Claude Code → OpenSpec → uv → FastAPI
 │       │          │            │        │       │
 │       │          │            │        │       └─ 需要 uv
 │       │          │            │        └─ 獨立安裝
 │       │          │            └─ 需要 npm
 │       │          └─ 需要 npm，後續可用 Claude 協助安裝
 │       └─ 需要 nvm
 └─ 基礎工具
```

---

## 1. 安裝 nvm 與 Node.js

Claude Code 和 OpenSpec 都需要 Node.js，有兩種安裝方式：

| 方式 | 優點 | npm install -g |
|------|------|----------------|
| **nvm（推薦）** | 可管理多版本、避免權限問題 | 不需要 sudo |
| **apt** | 系統原生套件管理 | 需要 sudo |

### 方法 A：使用 nvm 安裝（本文使用）

```bash
# 安裝 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# 重新載入 shell 設定
source ~/.bashrc

# 安裝 Node.js 22（LTS）
nvm install 22

# 驗證安裝
node -v    # v22.17.1
npm -v     # 10.9.2
```

### 方法 B：使用 apt 安裝

```bash
# 安裝 Node.js（Ubuntu 24.04 預設為 v18）
sudo apt update
sudo apt install nodejs npm

# 驗證安裝
node -v    # v18.19.1（可能不符合 Claude Code 最低需求 v20.19.0+）
npm -v
```

> **注意**：Ubuntu 24.04 apt 預設的 Node.js 版本是 **18.x**，可能不符合 Claude Code 的最低需求（v20.19.0+）。建議使用 nvm 安裝較新版本。使用 apt 安裝時，`npm install -g` 需加上 `sudo`。

---

## 2. 安裝 Claude Code

Claude Code 是 Anthropic 官方的 CLI 工具，透過 npm 全域安裝：

```bash
npm install -g @anthropic-ai/claude-code
```

### 首次啟動與認證

```bash
claude
```

首次執行會引導你完成認證設定。你可以選擇：

1. **Anthropic API Key**：前往 [console.anthropic.com](https://console.anthropic.com/) 申請
2. **Claude Pro/Max 訂閱帳號**：前往 [claude.ai](https://claude.ai/) 訂閱，再使用該帳號登入（本文使用此方式）

### 驗證安裝

```bash
claude --version    # 2.0.61 (Claude Code)
```

認證成功後，輸入 `claude` 即可進入互動模式。詳細指令介紹請參考下一篇文章。

> **什麼是 API Key？** API Key 是一組密鑰，讓你的應用程式可以存取 Claude API。請妥善保管，不要公開分享。

---

## 3. 安裝 OpenSpec

安裝完 Claude Code 後，你可以選擇**手動安裝**或**使用 Claude 協助安裝**。

### 方法 A：手動安裝

```bash
npm install -g @fission-ai/openspec@latest
```

### 方法 B：使用 Claude 協助安裝

```bash
claude "請幫我安裝 openspec，使用 npm install -g @fission-ai/openspec@latest"
```

### 驗證安裝

```bash
openspec --version    # 0.16.0
```

[OpenSpec](https://github.com/Fission-AI/OpenSpec) 是 Fission-AI 開發的規格驅動開發工具，與 Claude Code 原生整合。

---

## 4. 安裝 uv

同樣可以選擇手動安裝或使用 Claude 協助。

### 方法 A：手動安裝

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

### 方法 B：使用 Claude 協助安裝

```bash
claude "請幫我安裝 uv Python 套件管理器"
```

### 驗證安裝

```bash
uv --version    # uv 0.8.4
```

[uv](https://github.com/astral-sh/uv) 是用 Rust 開發的極速 Python 套件與專案管理器，可取代 pip、pip-tools、pipx、poetry、pyenv、virtualenv 等工具。

> **效能比較**：uv 的安裝速度比 pip 快 10-100 倍，特別適合有大量依賴的專案。

---

## 5. 建立 FastAPI 專案

現在來建立一個整合 SDD 工具的 FastAPI 專案，同樣可以選擇手動或使用 Claude 協助。

### 方法 A：手動建立

```bash
# 建立專案目錄
mkdir my-sdd-project && cd my-sdd-project

# 先初始化 OpenSpec，選擇 Claude Code
# 會建立 CLAUDE.md、openspec/ 目錄、.claude/commands/openspec/ 斜線指令
openspec init --tools claude

# 使用 uv 初始化 Python 專案
uv init

# 新增 FastAPI 相關套件
uv add fastapi uvicorn
```

建立 `main.py`：

```python
from fastapi import FastAPI

app = FastAPI(title="My SDD Project")

@app.get("/")
def read_root():
    return {"message": "Hello, SDD!"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

執行開發伺服器（預設 port 8000）：

```bash
uv run uvicorn main:app --reload
```

> **提示**：按 `Ctrl+C` 可停止伺服器。

如需使用不同 port（例如 3000）：

```bash
uv run uvicorn main:app --reload --port 3000
```

### 方法 B：使用 Claude 協助建立

```bash
# 建立專案目錄
mkdir my-sdd-project && cd my-sdd-project

# 先初始化 OpenSpec，選擇 Claude Code
# 會建立 CLAUDE.md、openspec/ 目錄、.claude/commands/openspec/ 斜線指令
openspec init --tools claude

# 啟動 Claude 協助建立專案
claude "請幫我建立一個 FastAPI 專案，使用 uv 管理套件，建立 main.py 包含 / 和 /health 兩個端點"
```

Claude 會協助執行 `uv init`、`uv add fastapi uvicorn`、建立 `main.py`。

完成後執行開發伺服器（預設 port 8000）：

```bash
uv run uvicorn main:app --reload
```

> **提示**：按 `Ctrl+C` 可停止伺服器。如需使用不同 port，加上 `--port 3000`。

也可以請 Claude 建立啟動腳本：

```
> 請幫我建立 start.sh，使用 port 3000 啟動開發伺服器
```

Claude 會建立腳本並設定執行權限，之後只需執行 `./start.sh` 即可。

> **背景執行**：開發時可開新終端機執行伺服器，或請 Claude 在背景執行。詳見下一篇文章的「背景執行伺服器」說明。

### 驗證

開啟瀏覽器訪問 `http://127.0.0.1:8000`（如有指定其他 port 請對應調整），應該看到：

```json
{"message": "Hello, SDD!"}
```

FastAPI 會自動產生 API 文件，訪問 `http://127.0.0.1:8000/docs` 可看到 Swagger UI 互動介面，方便測試各個端點。

---

## 6. 版本控制（Git）

建議使用 Git 進行版本控制，追蹤專案變更：

```bash
cd my-sdd-project

# 初始化 Git 儲存庫
git init

# 新增所有檔案
git add .

# 建立首次提交
git commit -m "Initial commit: FastAPI + OpenSpec setup"
```

> **為什麼要用 Git？** SDD 流程會產生多個規格文件與程式碼變更，Git 可以幫助你追蹤每次變更、回滾錯誤、與團隊協作。

常用 Git 指令：

| 指令 | 說明 |
|------|------|
| `git status` | 查看變更狀態 |
| `git add .` | 加入所有變更 |
| `git commit -m "訊息"` | 提交變更 |
| `git log --oneline` | 查看提交歷史 |
| `git diff` | 查看未提交的變更 |

> **提示**：Claude Code 可以協助執行 Git 指令。例如：「請幫我 commit」，Claude 會自動產生適當的 commit message。

---

## 7. 整合驗證

確認三個工具可以協同運作：

```bash
cd my-sdd-project
claude
```

在 Claude Code 中輸入：

```
> /openspec:proposal
```

如果看到 Claude 開始詢問你想建立什麼提案，表示整合成功！

目前專案只有 `/` 和 `/health` 兩個端點。下一篇文章將示範如何使用 SDD 流程新增 `/version` 端點。

---

## 常見問題排解

### Node.js 版本過低（使用 apt 安裝的情況）

如果之前使用 apt 安裝 Node.js，版本可能不符合需求：

```bash
# 檢查版本
node -v

# 如果低於 20.19.0，建議改用 nvm 安裝
nvm install 22
nvm use 22
```

> 使用本文推薦的 nvm 方式安裝 Node.js 22，不會遇到此問題。

### npm 權限問題（EACCES）

如果使用 apt 安裝 Node.js 遇到權限問題，建議改用 nvm 重新安裝 Node.js，可徹底避免此問題。

### Claude Code 認證失敗

1. 確認網路連線正常
2. 嘗試重新登入：進入 Claude Code 後執行 `/logout`，再重新執行 `claude`

### uv 找不到 Python

```bash
# 使用 uv 安裝 Python
uv python install 3.12

# 確認安裝
uv python list
```

### OpenSpec init 失敗

確認你在專案目錄中執行，且目錄有寫入權限：

```bash
ls -la
# 確認可以寫入
```

---

## 下一步

環境建置完成！請繼續閱讀 **[SDD 規格驅動開發入門（二）：指令介紹篇]({{ site.baseurl }}/sdd-commands-guide/)**，學習 SDD 核心指令，並實際操作為專案新增 `/version` 端點。

---

## 參考連結

- [Claude Code 官方文件](https://docs.anthropic.com/en/docs/claude-code)
- [OpenSpec GitHub](https://github.com/Fission-AI/OpenSpec)
- [uv 官方文件](https://docs.astral.sh/uv/)
- [FastAPI 官方文件](https://fastapi.tiangolo.com/)
