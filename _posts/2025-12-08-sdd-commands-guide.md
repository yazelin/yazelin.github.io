---
layout: post
title: SDD 規格驅動開發入門（二）：指令介紹篇
tags: [教學, Python, FastAPI, AI, Claude Code, SDD]
---

延續上一篇的環境安裝，本文介紹 SDD 工作流程中實際會用到的指令。

重點提示：**SDD 的核心操作都在 Claude Code 中完成**，只需記住三個斜線指令：`/openspec:proposal` → `/openspec:apply` → `/openspec:archive`，其餘指令（如 uv、測試等）都可以請 Claude 代為執行。

---

## 三個工具的角色

| 工具 | 角色 | 主要用途 |
|------|------|---------|
| **Claude Code** | AI 助手 | 對話、程式碼生成、任務規劃 |
| **OpenSpec** | 規格管理 | 追蹤提案、審查、歸檔變更 |
| **uv** | 專案管理 | Python 套件、虛擬環境、執行 |

---

## 快速指令對照表

| 用途 | Claude Code | OpenSpec | uv |
|------|-------------|----------|-----|
| 初始化 | - | `openspec init` | `uv init` |
| 查看幫助 | `/help` | `openspec --help` | `uv --help` |
| 建立提案 | `/openspec:proposal` | - | - |
| 實作 | `/openspec:apply` | - | - |
| 歸檔 | `/openspec:archive` | - | - |
| 新增套件 | - | - | `uv add` |
| 執行程式 | - | - | `uv run` |

> OpenSpec init 會自動建立 `CLAUDE.md`，因此 Claude Code 的 `/init` 在 SDD 流程中較少使用。

---

## Claude Code 指令

> 安裝與認證請參考上一篇文章。以下假設你已完成設定並可正常執行 `claude`。

### 基本操作

| 指令 | 說明 |
|------|------|
| `claude` | 啟動互動模式 |
| `claude "提示詞"` | 單次執行，不進入互動模式 |
| `claude --help` | 查看所有可用選項 |
| `claude --version` | 查看版本號 |
| `Ctrl+C` | 取消當前輸入或生成 |
| `Ctrl+D` | 退出 Claude Code |
| `/exit` | 退出 Claude Code |

### 啟動範例

```bash
# 互動模式
claude

# 單次執行
claude "請解釋這段程式碼的功能"

# 指定工作目錄
claude --cwd /path/to/project

# 非互動模式（適合腳本）
claude -p "生成一個 hello world 函數"
```

### 常用斜線指令

在互動模式中使用（共 42 個內建指令，以下列出常用的）：

| 指令 | 說明 | 使用情境 |
|------|------|----------|
| `/help` | 查看所有斜線指令 | 不確定功能時 |
| `/clear` | 清除對話歷史 | 開始新任務時 |
| `/compact` | 壓縮上下文 | 對話太長、接近限制時 |
| `/init` | 初始化 CLAUDE.md | OpenSpec 已建立，較少使用 |
| `/memory` | 編輯 CLAUDE.md | 更新專案記憶 |
| `/cost` | 顯示 token 使用統計 | API 用戶查看成本 |
| `/usage` | 顯示訂閱計劃用量 | Pro/Max 用戶查看額度 |
| `/context` | 視覺化上下文用量 | 查看剩餘空間 |
| `/status` | 開啟設定介面 | 確認版本、模型、帳號 |
| `/model` | 切換模型 | 需要不同能力時 |
| `/resume` | 恢復先前對話 | 繼續之前的工作 |
| `/tasks` | 管理背景任務 | 查看或停止背景執行的程式 |
| `/doctor` | 檢查安裝狀態 | 診斷問題 |
| `/logout` | 登出帳號 | 切換帳號或重新認證 |

### 進階功能

#### 模式切換

Claude Code 有三種操作模式，使用 `Shift+Tab` 切換：

| 模式 | 說明 |
|------|------|
| **Normal** | 一般模式，執行操作前會詢問確認 |
| **Plan** | 規劃模式，只分析不執行 |
| **Accept Edits** | 自動接受編輯，不逐一確認 |

> **搭配 OpenSpec 使用時**：規劃工作由 `/openspec:proposal` 處理，因此 Plan Mode 較少使用。

#### 背景執行伺服器

開發時常需要同時執行伺服器和進行對話。有兩種方式：

**方式 A：開新終端機**

```bash
# 終端機 1：執行伺服器
cd my-sdd-project
uv run uvicorn main:app --reload  # 或使用 ./start.sh（建立方式見上一篇）

# 終端機 2：啟動 Claude Code
cd my-sdd-project
claude
```

**方式 B：請 Claude 背景執行**

```
> 請在背景啟動開發伺服器
```

Claude 會在背景執行 `uv run uvicorn main:app --reload`，你可以繼續對話。

**管理背景任務**

| 指令 | 說明 |
|------|------|
| `/tasks` | 查看所有背景任務 |
| `/tasks` → 選擇任務 → `k` | 停止指定的背景任務 |

使用 `/tasks` 後會顯示任務清單，選擇要管理的任務後：
- 按 `k` 停止任務
- 按 `Enter` 查看輸出

> **提示**：背景任務的輸出會持續累積。如果需要查看伺服器日誌，可以用 `/tasks` 選擇該任務查看。

#### 自訂指令（進階）

> 此為進階功能，SDD 工作流程中非必要。OpenSpec 已提供核心斜線指令。

`openspec init` 已建立 `.claude/commands/` 目錄，可在其中新增自訂指令。

例如建立 `.claude/commands/review.md`：

```markdown
請審查當前的程式碼變更，重點檢查：
1. 邏輯正確性
2. 錯誤處理
3. 效能問題
```

使用方式：

```
/review
```

#### CLAUDE.md 專案設定

`openspec init` 會自動建立基本的 `CLAUDE.md`，通常只需加入個人偏好設定：

```markdown
# 語言偏好

- 使用繁體中文回覆
- 程式碼註解使用繁體中文
```

可使用 `/memory` 指令快速編輯此檔案。

---

## OpenSpec 指令

> 安裝請參考上一篇文章。

### CLI 指令

實際使用中，CLI 只需要在專案初始化時執行一次：

```bash
openspec init --tools claude
```

其他操作都在 Claude Code 中透過斜線指令完成。

> 其他 CLI 指令如 `openspec list`、`openspec view`、`openspec show`、`openspec validate` 等可用 `openspec --help` 查看，但日常較少使用。

### Claude Code 整合指令

在 Claude Code 中使用 OpenSpec 斜線指令（SDD 三步驟）：

| 步驟 | 指令 | 說明 |
|:----:|------|------|
| 1 | `/openspec:proposal` | 建立變更提案，定義目標與範圍 |
| 2 | `/openspec:apply` | 根據提案開始實作程式碼 |
| 3 | `/openspec:archive` | 實作完成後歸檔變更 |

### 專案結構說明

執行 `openspec init --tools claude` 後產生的目錄：

```
./
├── CLAUDE.md                           # Claude Code 專案設定
├── AGENTS.md                           # AI 工具整合指引（根目錄）
├── openspec/
│   ├── project.md                      # 專案約定與標準
│   └── AGENTS.md                       # OpenSpec 工作流程說明
└── .claude/commands/openspec/          # Claude Code 斜線指令
    ├── proposal.md
    ├── apply.md
    └── archive.md
```

使用 `/openspec:proposal` 建立提案後，會在 `openspec/changes/` 下產生：

```
openspec/changes/<change-id>/
├── proposal.md                         # 提案：目標與範圍
├── tasks.md                            # 任務：實作清單
├── design.md                           # 設計：技術決策（選用）
└── specs/<capability>/spec.md          # 規格變更（Delta 格式）
```

執行 `/openspec:archive` 歸檔後：
- 變更移至 `openspec/changes/archive/<change-id>/`
- spec deltas 整合到 `openspec/specs/` 主規格目錄

### Delta 格式

OpenSpec 使用 Delta 格式標示規格變更，在 `spec.md` 中使用：

```markdown
## ADDED Requirements

### Requirement: 版本資訊端點
系統 SHALL 提供 /version 端點回傳應用程式版本

#### Scenario: 查詢版本
- **WHEN** 請求 GET /version
- **THEN** 回傳包含版本號的 JSON 回應

## MODIFIED Requirements

### Requirement: API 端點
系統 SHALL 支援分頁查詢資料列表

#### Scenario: 分頁查詢
- **WHEN** 請求 /api/v1/items?page=1
- **THEN** 回傳第一頁資料

## REMOVED Requirements

### Requirement: 舊版端點
**Reason**: 已棄用，無人使用
**Migration**: 改用 /api/v1/ 端點
```

> **格式重點**：
> - 使用 `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`
> - 需求標題用 `### Requirement:`
> - 情境標題用 `#### Scenario:`（必須是 4 個 #）
> - 情境內容用 `- **WHEN**`、`- **THEN**` 格式

---

## uv 指令

> 安裝請參考上一篇文章。
>
> **SDD 工作流程提示**：實際開發中，可讓 Claude 執行這些指令，或請 Claude 建立 `start.sh`、`test.sh` 等腳本方便日後使用。執行中的伺服器可按 `Ctrl+C` 停止。

### 專案管理

| 指令 | 說明 | 範例 |
|------|------|------|
| `uv init` | 初始化新專案 | `uv init` |
| `uv add` | 新增套件 | `uv add fastapi` |
| `uv add --dev` | 新增開發套件 | `uv add --dev pytest` |
| `uv remove` | 移除套件 | `uv remove requests` |
| `uv sync` | 同步依賴（根據 lock 檔） | `uv sync` |
| `uv lock` | 更新 lock 檔 | `uv lock` |

### 使用範例

```bash
# 新增套件
uv add fastapi uvicorn sqlalchemy

# 新增開發用套件
uv add --dev pytest pytest-asyncio ruff

# 從 requirements.txt 匯入（如有舊專案）
uv add -r requirements.txt

# 同步依賴
uv sync
```

### 執行指令

| 指令 | 說明 | 範例 |
|------|------|------|
| `uv run` | 在虛擬環境中執行 | `uv run python main.py` |
| `uv run` | 執行套件指令 | `uv run uvicorn main:app` |
| `uv run` | 執行腳本 | `uv run pytest` |

### 使用範例

```bash
# 執行 Python 檔案
uv run python main.py

# 啟動 FastAPI 開發伺服器（預設 port 8000）
uv run uvicorn main:app --reload

# 執行測試
uv run pytest tests/ -v

# 執行 linter
uv run ruff check .
```

### 虛擬環境（進階）

> **說明**：`uv run` 會自動管理虛擬環境，通常不需要手動操作此區段的指令。

| 指令 | 說明 |
|------|------|
| `uv venv` | 建立虛擬環境（預設 .venv） |
| `uv venv --python 3.12` | 指定 Python 版本 |
| `uv venv myenv` | 指定環境名稱 |

### Python 版本管理（進階）

> **說明**：如果系統已有 Python 3.11+，通常不需要手動管理版本。

| 指令 | 說明 |
|------|------|
| `uv python install` | 安裝 Python |
| `uv python install 3.12` | 安裝指定版本 |
| `uv python list` | 列出可用版本 |
| `uv python pin 3.12` | 固定專案 Python 版本 |

### 使用範例（進階）

```bash
# 安裝 Python 3.12
uv python install 3.12

# 列出已安裝的 Python
uv python list

# 固定專案使用的版本
uv python pin 3.12
```

---

## SDD 工作流程實戰

延續上一篇建立的 `my-sdd-project` 專案，使用 SDD 流程新增 `/version` 端點：

```bash
cd my-sdd-project
claude
```

### Step 1: Proposal（建立提案）

```
> /openspec:proposal

> 我想新增一個 /version API 端點，回傳應用程式版本資訊
```

Claude 會建立提案文件並詢問細節，確認後進入下一步。

### Step 2: Apply（實作）

```
> /openspec:apply
```

Claude 會根據提案實作程式碼、執行測試、更新 `tasks.md` 進度。測試結果會直接顯示在對話中，如有失敗會自動嘗試修正。

### Step 3: Archive（歸檔）

測試通過後：

```
> /openspec:archive
```

完成！整個流程都在 Claude Code 中進行，無需手動輸入其他指令。

完成後可訪問 `http://127.0.0.1:8000/docs` 在 Swagger UI 中測試新的 `/version` 端點。

> **版本控制提示**：建議在每次 `/openspec:archive` 後提交變更：「請幫我 commit」，Claude 會自動產生適當的 commit message。Git 的初始化與基本指令請參考上一篇文章。

### 當流程不順利時

SDD 流程中可能遇到需要調整的情況：

**Proposal 需要修改**

在 `/openspec:apply` 之前，如果提案內容需要調整：

```
> 請修改提案，把 /version 端點改為回傳更詳細的系統資訊
```

Claude 會更新 `proposal.md` 和相關的 spec delta 文件。確認後再執行 `/openspec:apply`。

**Apply 過程中測試失敗**

Claude 在 apply 階段會自動執行測試驗證。如果測試失敗，直接回報錯誤讓 Claude 修正：

```
> 測試失敗了，錯誤訊息如下：
> AssertionError: expected 200 but got 404
```

Claude 會根據錯誤訊息修正程式碼，直到測試通過。

**Archive 後發現問題**

如果在 `/openspec:archive` 後才發現問題，有兩種處理方式：

1. **小問題（Bug fix）**：直接請 Claude 修正，不需要開新提案
   ```
   > /version 端點回傳的格式有誤，請修正
   ```

2. **需要較大調整**：開新的 proposal 來處理
   ```
   > /openspec:proposal
   > 我想修改 /version 端點，加入更多系統資訊
   ```

> **提示**：SDD 的優勢在於提案階段就釐清需求。如果經常需要 archive 後再修正，建議在 proposal 階段多花時間確認細節。

---

## 指令速查表

### SDD 核心流程（每日常用）

| 指令 | 用途 |
|------|------|
| `claude` | 啟動 AI 助手 |
| `/openspec:proposal` | 建立新提案 |
| `/openspec:apply` | 根據提案實作 |
| `/openspec:archive` | 實作完成後歸檔 |
| `/clear` | 清除對話開始新任務 |
| `git commit` | 提交變更（可請 Claude 協助） |

### 專案初始化（一次性）

| 指令 | 用途 |
|------|------|
| `openspec init --tools claude` | 初始化 OpenSpec |
| `uv init` | 初始化 Python 專案 |
| `git init` | 初始化 Git 版本控制 |

### Claude Code 輔助指令

| 指令 | 用途 |
|------|------|
| `/usage` | 查看訂閱用量 |
| `/compact` | 壓縮上下文（對話太長時） |
| `/resume` | 恢復先前對話 |
| `/tasks` | 管理背景任務（查看、停止） |
| `/doctor` | 檢查安裝狀態 |

---

## 參考連結

- [Claude Code 官方文件](https://docs.anthropic.com/en/docs/claude-code)
- [OpenSpec GitHub](https://github.com/Fission-AI/OpenSpec)
- [uv 官方文件](https://docs.astral.sh/uv/)
- [FastAPI 官方文件](https://fastapi.tiangolo.com/)
