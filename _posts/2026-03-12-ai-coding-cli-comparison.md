---
layout: post
title: "AI Coding CLI 指令對照表：Claude Code vs Gemini CLI vs Codex vs Copilot CLI"
subtitle: "四大 AI 程式開發 CLI 工具的功能、指令、設計哲學完整比較"
date: 2026-03-12
categories: [AI]
tags: [Claude Code, Gemini CLI, Codex CLI, Copilot CLI, CLI, AI Coding, MCP, Comparison]
author: Yaze Lin
---

## 為什麼寫這篇

2025 年下半年開始，各大 AI 廠商陸續推出 terminal-native 的程式開發 CLI 工具。到了 2026 年初，四個主要選手都已經成熟到可以日常使用：

- **Claude Code** — Anthropic 出品，搭配 Claude 模型
- **Gemini CLI** — Google 出品，搭配 Gemini 模型
- **Codex CLI** — OpenAI 出品，搭配 GPT / Codex 模型
- **Copilot CLI** — GitHub（Microsoft）出品，支援多家模型

四個工具的核心概念驚人地相似（互動模式、非互動模式、MCP、自動批准），但指令語法和設計細節各有不同。這篇整理了一張**指令對照表**，方便在不同工具之間切換時快速查找。

所有指令基於以下版本實測：

| 工具 | 版本 |
|------|------|
| Claude Code | 2.1.73 |
| Gemini CLI | 0.32.1 |
| Codex CLI | 0.112.0 |
| Copilot CLI | 1.0.4 |

---

## 基本資訊

| | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|---|---|---|---|---|
| **開發商** | Anthropic | Google | OpenAI | GitHub (Microsoft) |
| **實作語言** | 混合（Shell、Python、TypeScript） | TypeScript | Rust | JavaScript（minified bundle） |
| **原始碼授權** | 專有（Anthropic Commercial ToS） | Apache 2.0 | Apache 2.0 | 專有（不允許修改） |
| **安裝方式（推薦）** | `curl -fsSL https://claude.ai/install.sh \| bash` | `npm i -g @google/gemini-cli` | `npm i -g @openai/codex` | `curl -fsSL https://gh.io/copilot-install \| bash` |
| **其他安裝方式** | Homebrew, npm（已棄用） | Homebrew, npx | Homebrew, GitHub Release 二進位檔 | npm (`@github/copilot`), Homebrew |
| **授權方式** | Anthropic 帳號 / API Key | 個人 Google 帳號（免費 1000 req/day）或 API Key | ChatGPT 訂閱（Plus/Pro/Team/Edu/Enterprise）或 API Key | GitHub Copilot 訂閱 |
| **設定檔目錄** | `~/.claude/` | `~/.gemini/` | `~/.codex/` | `~/.copilot/` |
| **專案指令檔** | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md` | `AGENTS.md` + `.github/copilot-instructions.md` |
| **設定格式** | JSON (`settings.json`) | JSON (`settings.json`) | TOML (`config.toml`) | JSON (`config.json`) |
| **預設模型** | Claude Sonnet / Opus | Gemini | GPT 系列 | 多家可選（Claude、GPT、Gemini） |

Copilot CLI 比較特別 — 它不綁定單一模型廠商，可以在 Claude、GPT、Gemini 之間切換。其他三個工具預設使用自家模型，但 Codex CLI 額外支援本地開源模型（透過 LM Studio 或 Ollama）。

原始碼授權方面，只有 **Gemini CLI 和 Codex CLI 是真正的開源專案**（Apache 2.0），可以自由修改和再散佈。Claude Code 和 Copilot CLI 雖然 GitHub repo 公開可見，但授權條款不允許修改原始碼 — Claude Code 受 Anthropic Commercial ToS 約束，Copilot CLI 的自訂 license 明確禁止建立衍生作品。

授權方面，**Gemini CLI 的免費額度最大方** — 個人 Google 帳號登入就能使用，免費額度為 1,000 requests/day、60 requests/min，使用 Gemini 3 系列模型（Flash 和 Pro 混合，由 CLI 自動決定），不需要額外訂閱或付費。如果用 API Key（未付費）額度較低（250 requests/day、僅限 Flash 模型）。付費方案（Google AI Pro/Ultra、Gemini Code Assist）可以獲得更高額度。Codex CLI 可以用 ChatGPT 訂閱方案（Plus/Pro/Team/Edu/Enterprise）登入，也可以用 API Key。Claude Code 和 Copilot CLI 都需要各自的訂閱。

**啟動速度實測**（Ubuntu，非互動模式 `prompt="hi"`，各跑 3 次取平均）：

| 工具 | 平均回應時間 | 備註 |
|------|------------|------|
| Codex CLI | ~230 ms | Rust 實作，最快 |
| Claude Code | ~4.5 秒 | 穩定 |
| Copilot CLI | ~8.5 秒 | 穩定 |
| Gemini CLI | ~18 秒 | 波動大（12~25 秒），Windows 上更慢 |

如果你經常用非互動模式（`-p`）跑短任務，Codex CLI 的啟動速度優勢非常明顯。Gemini CLI 的延遲在腳本自動化場景中會比較有感。

---

## 常用指令對照

### 啟動與基本操作

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **啟動互動模式** | `claude` | `gemini` | `codex` | `copilot` |
| **帶 prompt 啟動互動** | `claude "prompt"` | `gemini "prompt"` | `codex "prompt"` | `copilot -i "prompt"` |
| **非互動執行** | `claude -p "prompt"` | `gemini -p "prompt"` | `codex exec "prompt"` | `copilot -p "prompt"` |
| **指定模型** | `--model opus` | `-m gemini-2.5-pro` | `-m o3` | `--model gpt-5.2` |
| **查看版本** | `claude -v` | `gemini -v` | `codex -V` | `copilot -v` |
| **查看說明** | `claude -h` | `gemini -h` | `codex -h` | `copilot -h` |

注意 Copilot CLI 的帶 prompt 啟動用的是 `-i`（interactive），而 `-p` 是非互動模式，和其他三個的慣例不同。Codex CLI 的非互動模式是獨立子指令 `exec`，不是 flag。

### 對話管理

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **繼續最近對話** | `--continue` | `--resume latest` | `codex resume --last` | `--continue` |
| **選擇歷史對話恢復** | `--resume` | `--resume` | `codex resume` | `--resume` |
| **指定 session 恢復** | `--resume <id>` | `--resume <index>` | `codex resume <id>` | `--resume=<id>` |
| **列出歷史對話** | `--resume`（互動選擇） | `--list-sessions` | `codex resume`（互動選擇） | `--resume`（互動選擇） |
| **Fork 對話（不覆蓋原本）** | `--fork-session` | — | `codex fork` | — |

Codex CLI 的 `resume` 和 `fork` 是獨立子指令。Claude Code 的 fork 是 flag 搭配 `--resume` 使用。Gemini CLI 用數字 index 而非 UUID 來指定 session。

### 權限與自動批准

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **全自動（批准所有操作）** | `--dangerously-skip-permissions` | `-y` / `--yolo` | `--full-auto` | `--yolo` / `--allow-all` |
| **唯讀 / 計畫模式** | `--permission-mode plan` | `--approval-mode plan` | `-s read-only` | — |
| **自動批准編輯** | `--permission-mode acceptEdits` | `--approval-mode auto_edit` | — | — |
| **允許特定工具** | `--allowedTools "Bash Edit"` | `--policy`（取代已棄用的 `--allowed-tools`） | — | `--allow-tool='shell(git:*)'` |
| **禁止特定工具** | `--disallowedTools "Bash"` | — | — | `--deny-tool='shell(git push)'` |

命名風格差異很大：Claude Code 用 `dangerously-skip-permissions`（強調危險性），Gemini CLI 和 Copilot CLI 用 `yolo`（輕鬆口吻），Codex CLI 用 `full-auto`（中性描述）。

Codex CLI 的 `--full-auto` 實際上是 `-a on-request --sandbox workspace-write` 的快捷組合，自動批准但仍在沙箱內執行。Claude Code 的 `--dangerously-skip-permissions` 和 Copilot CLI 的 `--yolo` 則是純粹跳過所有權限確認，沒有沙箱保護。

Copilot CLI 的 `--allow-tool` 和 `--deny-tool` 支援細粒度的 glob 語法，例如允許所有 git 指令但禁止 push：`--allow-tool='shell(git:*)' --deny-tool='shell(git push)'`。

### 沙箱機制

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **沙箱模式** | — | `-s` / `--sandbox` | `-s read-only` / `workspace-write` / `danger-full-access` | — |
| **內建沙箱技術** | — | Docker / Podman / Seatbelt / gVisor | Landlock (Linux) / Seatbelt (macOS) | — |
| **獨立沙箱指令** | — | — | `codex sandbox linux` / `macos` / `windows` | — |

Codex CLI 在沙箱設計上最完整 — 用 Rust 實作了跨平台的 OS 層級沙箱（Linux Landlock + seccomp、macOS Seatbelt、Windows restricted token），並且 `--full-auto` 預設就在沙箱內運行。

Claude Code 和 Copilot CLI 沒有內建沙箱機制，依賴使用者自行管理執行環境的安全性。

### 工作目錄與檔案存取

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **附加額外目錄** | `--add-dir <dir>` | `--include-directories <dir>` | `--add-dir <dir>` | `--add-dir <dir>` |
| **指定工作目錄** | — | — | `-C <dir>` | — |
| **允許所有路徑** | — | — | — | `--allow-all-paths` |
| **允許特定 URL** | — | — | — | `--allow-url=github.com` |
| **Git worktree 隔離** | `-w` / `--worktree` | — | — | — |

Claude Code 的 worktree 功能可以自動建立 git worktree，在隔離的分支上工作，完成後再決定是否 merge。這在處理大型重構時很有用，其他三個工具沒有對應功能。

---

## MCP 與擴充機制

### MCP Server 管理

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **新增 MCP server** | `claude mcp add <name> <cmd>` | `gemini mcp add <name> <cmd>` | `codex mcp add` | `--additional-mcp-config <json>` |
| **移除 MCP server** | `claude mcp remove <name>` | `gemini mcp remove <name>` | `codex mcp remove` | — |
| **列出 MCP server** | `claude mcp list` | `gemini mcp list` | `codex mcp list` | — |
| **啟用 / 停用** | — | `gemini mcp enable/disable` | — | `--disable-mcp-server <name>` |
| **HTTP transport** | `--transport http` | ✓ | ✓ | ✓ |
| **匯入 Claude Desktop 設定** | `claude mcp add-from-claude-desktop` | — | — | — |
| **作為 MCP Server 運行** | `claude mcp serve` | — | `codex mcp-server` | — |

四個工具都支援 MCP（Model Context Protocol），但管理方式不同：Claude Code、Gemini CLI、Codex CLI 有完整的 `mcp` 子指令，Copilot CLI 則透過 `--additional-mcp-config` flag 或設定檔管理。

Claude Code 和 Codex CLI 可以**自己作為 MCP Server 運行**，讓其他工具呼叫它們的能力。

### Plugin / Extension 系統

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **擴充機制名稱** | Plugin | Extension | — | Plugin |
| **安裝來源** | 本地目錄 | Git repo / 本地 | — | Git repo / marketplace |
| **官方 marketplace** | — | — | — | `copilot-plugins` / `awesome-copilot` |
| **建立新擴充** | — | `gemini extensions new` | — | — |
| **驗證擴充** | — | `gemini extensions validate` | — | — |

Copilot CLI 在 plugin 生態上最成熟，內建兩個官方 marketplace（`github/copilot-plugins` 和 `github/awesome-copilot`），可以一行指令安裝社群開發的 plugin。

Gemini CLI 的 extension 系統有完整的開發工具鏈（`new` 建立模板、`validate` 驗證、`link` 開發模式）。

### Skill 系統

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **Skill 管理** | Slash commands（透過 plugin） | `gemini skills list/enable/disable` | — | Slash commands（透過 plugin） |
| **安裝 skill** | 透過 plugin | `gemini skills install` | — | 透過 plugin |

Gemini CLI 有獨立的 skill 子指令，可以細粒度地啟用或停用個別 skill。Claude Code 和 Copilot CLI 的 skill 則透過 plugin 系統管理。

---

## 自動化與 CI/CD

### 非互動模式

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **非互動指令** | `-p "prompt"` | `-p "prompt"` | `exec "prompt"` | `-p "prompt"` |
| **輸出格式** | `--output-format text\|json\|stream-json` | `-o text\|json\|stream-json` | `codex exec --json` | `--output-format text\|json` |
| **串流 JSON 輸入** | `--input-format stream-json` | — | — | — |
| **靜音模式（只輸出結果）** | — | — | — | `-s` / `--silent` |
| **花費上限** | `--max-budget-usd <amount>` | — | — | — |
| **停用 session 持久化** | `--no-session-persistence` | — | `codex exec --ephemeral` | — |

Claude Code 的 `--max-budget-usd` 在自動化場景很實用 — 可以設定 API 花費上限，超過就自動停止，避免失控任務燒錢。

Codex CLI 的 `exec` 子指令預設就是非互動模式，不需要額外的 `-p` flag。加上 `--ephemeral` 可以不留下任何 session 檔案。

### Code Review

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **內建 code review** | — | — | `codex review` | — |
| **Review 未提交的變更** | — | — | `codex review --uncommitted` | — |
| **Review 特定 commit** | — | — | `codex review --commit <sha>` | — |
| **Review 指定 base branch** | — | — | `codex review --base main` | — |

Codex CLI 的 `review` 是獨立子指令，可以直接對 diff 做 code review，不需要進入互動模式。其他三個工具需要在互動模式中手動要求 AI 做 review。

### 其他自動化功能

| 功能 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **Apply diff** | — | — | `codex apply` | — |
| **分享 session 到 gist** | — | — | — | `--share-gist` |
| **分享 session 到 markdown** | — | — | — | `--share` |
| **Autopilot 連續執行** | — | — | — | `--autopilot` |
| **Autopilot 最大次數** | — | — | — | `--max-autopilot-continues` |

Codex CLI 的 `apply` 可以把 Codex Cloud 任務產生的 diff 套用到本地工作目錄，類似 `git apply` 的流程。

Copilot CLI 的 `--share-gist` 可以把整個 session 分享到 GitHub Gist，方便團隊協作或問題回報。

---

## 各家特色功能

以下是每個工具**獨有或特別突出**的功能，無法在對照表中簡單比較的部分。

### Claude Code

- **Worktree 隔離**：`-w` 自動建立 git worktree，在獨立分支上工作
- **Effort level**：`--effort low|medium|high` 控制回應的深度
- **Chrome 整合**：`--chrome` 連接瀏覽器進行 UI 測試和截圖
- **花費上限**：`--max-budget-usd` 限制 API 費用
- **Fallback model**：`--fallback-model` 主模型過載時自動降級
- **JSON Schema 輸出**：`--json-schema` 強制結構化輸出格式
- **從 PR 恢復**：`--from-pr` 從 GitHub PR 恢復關聯的 session
- **雙向串流**：支援 `--input-format stream-json` + `--output-format stream-json` 的即時雙向通訊

### Gemini CLI

- **F12 Debug Console**：`-d` 開啟類似瀏覽器的 debug console
- **Extension 開發工具鏈**：`extensions new` / `validate` / `link` 完整的開發→測試→發佈流程
- **Skill 獨立管理**：`skills list` / `enable` / `disable` / `install` 細粒度控制
- **Hooks 遷移**：`hooks migrate` 可以從 Claude Code 遷移 hooks 設定
- **Policy Engine**：`--policy` 載入自訂策略檔，取代舊的 `--allowed-tools`
- **ACP（Agent Client Protocol）**：`--experimental-acp` 實驗性的 agent 協作協議

### Codex CLI

- **Rust 實作**：啟動速度快、記憶體佔用低
- **OS 層級沙箱**：Landlock (Linux) / Seatbelt (macOS) / Restricted Token (Windows)
- **內建 Code Review**：`codex review` 獨立子指令，支援 `--uncommitted` / `--base` / `--commit`
- **Apply Diff**：`codex apply` 套用 Codex Cloud 任務產生的變更到本地工作目錄
- **本地模型支援**：`--oss` 搭配 LM Studio 或 Ollama 使用開源模型
- **Cloud 整合**：`codex cloud` 在終端機內瀏覽和管理 Codex Cloud 任務
- **Web Search**：`--search` 啟用即時網頁搜尋
- **Config Profile**：`-p <profile>` 載入 config.toml 中預定義的設定組合

### Copilot CLI

- **多模型切換**：同一工具內可選 Claude Opus/Sonnet、GPT-5.x、Gemini Pro 等多家模型
- **Plugin Marketplace**：內建 `copilot-plugins` 和 `awesome-copilot` 兩個官方 marketplace
- **GitHub MCP 內建**：預設整合 GitHub MCP Server，可存取 repo、PR、issue 等 GitHub 資源
- **Session 分享**：`--share` 輸出 markdown、`--share-gist` 直接建立 GitHub Gist
- **Autopilot 模式**：`--autopilot` 連續執行 + `--max-autopilot-continues` 限制次數
- **細粒度權限控制**：`--allow-tool` / `--deny-tool` 支援 glob 語法，可以精確到單一指令
- **URL 存取控制**：`--allow-url` / `--deny-url` 控制網路存取白名單
- **Streamer Mode**：隱藏模型名稱和用量，適合直播或螢幕分享

---

## 設定檔對照

| 用途 | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|------|------------|------------|-----------|-------------|
| **全域設定目錄** | `~/.claude/` | `~/.gemini/` | `~/.codex/` | `~/.copilot/` |
| **全域設定檔** | `settings.json` | `settings.json` | `config.toml` | `config.json` |
| **專案指令檔** | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md` | `AGENTS.md` + `.github/copilot-instructions.md` |
| **MCP 設定檔** | `.mcp.json` | `settings.json` 中 `mcpServers` | `config.toml` 中 `[mcp_servers]` | `~/.copilot/mcp-config.json` |
| **Hooks** | `settings.json` 中設定 | `settings.json` 中設定 | — | — |
| **認證** | `claude auth login` | 首次啟動自動 OAuth | `codex login` | `copilot login` |

Copilot CLI、Codex CLI 共用 `AGENTS.md`，而 Claude Code 和 Gemini CLI 各用自家的 `CLAUDE.md` 和 `GEMINI.md`。Copilot CLI 額外支援 `.github/copilot-instructions.md`（`copilot init` 自動產生）。如果一個專案同時要支援多個 AI CLI，可能需要同時維護多份指令檔。

---

## 指令速查表

最常用的操作，一張表搞定：

| 我想要... | Claude Code | Gemini CLI | Codex CLI | Copilot CLI |
|-----------|------------|------------|-----------|-------------|
| 開始聊天 | `claude` | `gemini` | `codex` | `copilot` |
| 跑一次就結束 | `claude -p "..."` | `gemini -p "..."` | `codex exec "..."` | `copilot -p "..."` |
| 用特定模型 | `--model opus` | `-m model-name` | `-m o3` | `--model gpt-5.2` |
| 全自動不要問我 | `--dangerously-skip-permissions` | `--yolo` | `--full-auto` | `--yolo` |
| 繼續上次對話 | `--continue` | `--resume latest` | `codex resume --last` | `--continue` |
| 加 MCP server | `claude mcp add n cmd` | `gemini mcp add n cmd` | `codex mcp add` | `--additional-mcp-config` |
| Code review | 互動模式中要求 | 互動模式中要求 | `codex review` | 互動模式中要求 |
| 輸出 JSON | `--output-format json` | `-o json` | `codex exec --json` | `--output-format json` |
| 更新工具 | `claude update` | `npm update -g @google/gemini-cli` | `npm update -g @openai/codex` | `copilot update` |

---

## 小結

四個 AI Coding CLI 工具在核心概念上高度趨同：

- **互動 / 非互動雙模式** — 都支援 terminal 對話和 pipe 腳本兩種用法
- **MCP 標準化** — 都採用 MCP 作為工具擴充協議
- **自動批准模式** — 都有某種形式的「全自動不要問我」開關
- **Session 管理** — 都支援對話的暫停與恢復

設計哲學上的差異也很明顯：

- **Claude Code** 偏向開發者工作流整合（worktree、effort level、Chrome 整合）
- **Gemini CLI** 偏向擴充生態（extension 開發工具鏈、skill 系統、policy engine）
- **Codex CLI** 偏向安全與效能（Rust 實作、OS 層級沙箱、內建 code review）
- **Copilot CLI** 偏向平台整合（多模型切換、GitHub 生態、plugin marketplace）

這些工具還在快速迭代中，本文的指令和功能以撰文時的版本為準。

---

## 參考連結

- [Claude Code](https://github.com/anthropics/claude-code) — [官方文件](https://code.claude.com/docs/en/overview)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) — [官方文件](https://geminicli.com/docs/)
- [Codex CLI](https://github.com/openai/codex) — [官方文件](https://developers.openai.com/codex)
- [Copilot CLI](https://github.com/github/copilot-cli) — [官方文件](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)
