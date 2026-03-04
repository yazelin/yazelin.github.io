---
layout: post
title: "aw-telegram-bot v5：App Factory — 用 Telegram 指令讓 AI 自動建網站"
subtitle: "Event-driven workflow chaining + 雙 token 架構 + 全自動 implement → review → merge 循環"
date: 2026-03-04
categories: [AI]
tags: [gh-aw, GitHub Actions, Copilot, Telegram, App Factory, automation]
author: Yaze Lin
---

## 前情提要

[v1](/2026/03/03/aw-telegram-bot/) 文字聊天，[v2](/2026/03/03/aw-telegram-bot-v2-image-generation/) AI 繪圖，[v3](/2026/03/03/aw-telegram-bot-v3-research-mode/) 研究模式，[v4](/2026/03/04/aw-telegram-bot-v4-video-download/) 影片下載。

v5 的目標：**使用者傳 `/app number-guessing-game 一個猜數字遊戲` → AI 全自動建 repo、拆 issue、implement、review、merge、部署到 GitHub Pages。**

---

## 運作流程

```
使用者：「/app number-guessing-game 一個猜數字的網頁遊戲」
  │
  ▼
Telegram → CF Worker → GitHub Actions（父 repo）
  │
  ▼
父 repo Copilot Agent:
  1. create-repo(aw-apps/number-guessing-game)    ← 建 repo
  2. setup-repo(files: AGENTS.md, workflows...)     ← 推初始檔案
  3. create-issues([{title, body}, ...])             ← 建 issues
  4. setup-secrets(COPILOT_PAT, COPILOT_GITHUB_TOKEN) ← 設 secrets
  5. trigger-workflow(implement.yml)                 ← 啟動第一輪
  │
  ▼
子 repo 自動循環:
  implement #1 → review → merge → implement #2 → review → merge → ... → 全部完成
  │
  ▼
GitHub Pages 自動部署 → https://aw-apps.github.io/number-guessing-game/
```

整個過程零人工介入（除非 review 失敗 3 次）。

---

## 架構：事件驅動的工作流鏈

### 為什麼不用 `gh workflow run`

最初的設計是 review.yml 在 merge 後呼叫 `gh workflow run implement.yml` 來觸發下一輪。但這需要 PAT 有 **Actions:write** 權限，而子 repo 的 `COPILOT_PAT`（org Fine-Grained PAT）沒有這個權限。

關鍵觀察：**implement → review 是原生 GitHub event（`pull_request: opened`），不需要額外權限。那反過來也可以。**

### 解法：用 GitHub 原生事件觸發

```yaml
# implement.yml
on:
  workflow_dispatch:           # 手動觸發（第一次）
  pull_request:
    types: [closed]            # PR 合併後觸發下一輪 implement
    branches: [main]
  pull_request_review:
    types: [submitted]         # review 要求修改時觸發 fix-pr
```

```yaml
# review.yml
on:
  pull_request:
    types: [opened, synchronize]  # PR 開啟或更新時觸發 review
    branches: [main]
```

完整循環：

```
implement.yml (workflow_dispatch)
  → 建 PR
  → review.yml (pull_request: opened)
    → approve + merge
    → implement.yml (pull_request: closed + merged)
      → 建下一個 PR
      → review.yml ...
      → ... 直到所有 issue 完成
```

不需要任何 `gh workflow run`，完全靠 GitHub 原生事件驅動。

### Job-level guard

implement.yml 有三種觸發方式，但不是每次都該跑。Job-level `if` 過濾：

```yaml
if: >-
  github.event_name == 'workflow_dispatch' ||
  (github.event_name == 'pull_request' &&
   github.event.pull_request.merged == true &&
   startsWith(github.event.pull_request.head.ref, 'issue-')) ||
  (github.event_name == 'pull_request_review' &&
   github.event.review.state == 'changes_requested' &&
   startsWith(github.event.pull_request.head.ref, 'issue-'))
```

`startsWith(head.ref, 'issue-')` 確保只有 agent 建的分支（`issue-N-impl`）才會觸發，避免人工 PR 干擾。

---

## Shell 預檢：省 Premium Request

Copilot CLI 每次啟動都消耗 premium request。如果啟動後發現「沒事做」，那就浪費了。

解法：**在 shell 裡先判斷該做什麼，只在確定有工作時才啟動 Copilot。**

```yaml
- name: Check state
  run: |
    # CASE A: 有 open PR 且 review 要求修改？ → fix-pr
    PR_JSON=$(gh pr list --state open --json number,headRefName,reviewDecision)
    if [ 有 changes_requested ]; then
      echo "action=fix-pr" >> "$GITHUB_OUTPUT"
      exit 0
    fi

    # CASE B: 有 open issue 帶 copilot-task label？ → implement
    ISSUE_JSON=$(gh issue list --state open --label copilot-task)
    if [ 有 issue ]; then
      echo "action=implement" >> "$GITHUB_OUTPUT"
      exit 0
    fi

    # CASE C: 全部完成 → done（不啟動 Copilot）
    echo "action=done" >> "$GITHUB_OUTPUT"
```

CASE C 跑完只要 ~9 秒，不消耗 premium request。

### Issue 過濾

用 `copilot-task` label 區分 agent 的 issue 和人工 issue。同時排除 `agent-stuck` 和 `needs-human-review` label，避免卡住的 issue 反覆重試。

```bash
gh issue list --state open --label copilot-task --json number,title,labels \
  --jq '[.[] | select(.labels | map(.name) |
    (contains(["agent-stuck"]) or contains(["needs-human-review"])) | not
  )] | sort_by(.number) | .[0]'
```

---

## 雙 Token 架構

子 repo 需要兩個 token：

| Secret | 類型 | 用途 | 權限 |
|--------|------|------|------|
| COPILOT_GITHUB_TOKEN | Personal Copilot token | Copilot CLI 認證 | Copilot Requests |
| COPILOT_PAT | Org Fine-Grained PAT | gh CLI 操作（建 PR、review、merge） | Contents, Issues, PRs, Metadata |

為什麼要分兩個？因為 **Copilot CLI 認證** 和 **GitHub API 操作** 是兩件事。一個 token 無法同時具備 Copilot Requests 權限和細粒度的 repo 權限。

### NOTIFY_TOKEN：跨 repo 通知

子 repo 完成所有 issue 後，需要通知父 repo（發 Telegram 訊息）。但子 repo 的 COPILOT_PAT 只能存取 `aw-apps` org，無法存取 `yazelin/aw-telegram-bot`。

解法：新增 `NOTIFY_TOKEN`，一個只有 `Actions:write` + `Contents:read` 權限的 Fine-Grained PAT，scope 只限 `yazelin/aw-telegram-bot`。

```bash
# 在子 repo 的 workflow 裡
GH_TOKEN="${NOTIFY_TOKEN}" gh workflow run notify.yml --repo yazelin/aw-telegram-bot \
  -f chat_id="${NOTIFY_CHAT_ID}" \
  -f text="✅ aw-apps/number-guessing-game all issues completed!"
```

為什麼需要 `Contents:read`？因為 `gh workflow run` 內部用 GraphQL 查詢 default branch，需要讀取 repo 的基本資訊。

---

## Python Skills

App Factory 有 5 個 Python script，都在 `.github/skills/app-factory/` 裡：

| Script | 功能 | safe-inputs 名稱 |
|--------|------|-----------------|
| `create_repo.py` | `gh repo create` 建 repo | create-repo |
| `setup_repo.py` | clone → 寫檔 → push + 開啟 GitHub Pages | setup-repo |
| `create_issues.py` | 建 issues + 自動建 labels | create-issues |
| `setup_secrets.py` | 設定子 repo 的 secrets | setup-secrets |
| `trigger_workflow.py` | `gh workflow run` 觸發子 repo 的 implement | trigger-workflow |

每個 script 都是：
- **獨立可執行**：`python script.py <args>`
- **JSON 輸入輸出**：方便 Copilot agent 解析
- **錯誤處理**：失敗時回傳 `{"ok": false, "error": "..."}`

### 自動開啟 GitHub Pages

`setup_repo.py` 在 push 完成後自動開啟 Pages：

```python
result = subprocess.run(
    ["gh", "api", f"repos/{repo}/pages", "-X", "POST",
     "-f", "build_type=legacy",
     "-f", "source[branch]=main", "-f", "source[path]=/"],
    capture_output=True, text=True
)
```

---

## Review 安全閥

review.yml 有一個 3 次重試限制：

```yaml
- name: Count previous reviews
  run: |
    COUNT=$(gh api repos/$REPO/pulls/${PR}/reviews --jq 'length')
    echo "review_count=${COUNT}" >> "$GITHUB_OUTPUT"

- name: Bail if too many reviews
  if: steps.count.outputs.review_count >= 3
  run: |
    gh issue edit ${ISSUE} --add-label needs-human-review
    gh pr close ${PR} --comment "Closing: exceeded review limit (3)"
    # 通知 Telegram
```

如果一個 PR 被 review 3 次都沒通過，自動關閉 PR、標記 issue 為 `needs-human-review`、發 Telegram 通知。避免無限循環消耗 premium request。

---

## 實測結果

用 `/app number-guessing-game-v2 一個猜數字的網頁遊戲` 觸發：

| 步驟 | 耗時 | 狀態 |
|------|------|------|
| 父 repo 建 repo + issues + secrets | ~5 分鐘 | ✅ |
| Implement #1（project skeleton） | ~1.5 分鐘 | ✅ |
| Review #1 → merge | ~1.5 分鐘 | ✅ |
| Implement #2（core game logic） | ~1.5 分鐘 | ✅ |
| Review #2 → merge | ~4 分鐘 | ✅ |
| Implement #3 → Review #3 → merge | ~3 分鐘 | ✅ |
| Implement #4 → Review #4 → merge | ~3 分鐘 | ✅ |
| Implement #5 → Review #5 → merge | ~3 分鐘 | ✅ |
| Implement #6 → Review #6 → merge | ~3 分鐘 | ✅ |
| **總計** | **~26 分鐘** | **6/6 issues** |

從一個 Telegram 訊息到一個完整部署的網站，全自動，~26 分鐘。

---

## 踩坑

### 1. Event chain 斷裂

第一版用 `gh workflow run implement.yml` 讓 review 觸發下一輪 implement。結果 `COPILOT_PAT` 沒有 Actions 權限，chain 斷了。

思考過程：「implement → review 是原生 `pull_request` event，不需要權限。那反方向也可以用 `pull_request: closed` 觸發。」

改成事件驅動後，完全不需要 `gh workflow run`，chain 變成純 GitHub 原生事件串接。

### 2. NOTIFY_TOKEN 權限不足

第一版 NOTIFY_TOKEN 只有 `Actions:write`。結果 `gh workflow run` 報錯：

```
unable to determine default branch: GraphQL: Resource not accessible by personal access token
```

原因：`gh workflow run` 內部會用 GraphQL 查 default branch，需要 `Contents:read`。加上後解決。

### 3. Review 沒動作

6 個 PR 中有 1 個（PR #9），review Copilot 跑完但沒有 approve 也沒有 request changes。Chain 卡住了。

這是 Copilot CLI 的偶發行為，不是我們的 bug。手動 merge 後 chain 繼續。未來可以加一個 timeout 機制：如果 review 完但 PR 還是 open，自動觸發重新 review。

### 4. chat_id 搞錯

`PLACEHOLDER_CHAT_ID` 被替換成了錯的值（`5764043230` 而不是 `850654509`），導致 Telegram 通知 `chat not found`。正常流程中 chat_id 從 Telegram webhook 帶入，所以不會有這個問題。

---

## 新增的命令

v5 加了三個 Telegram 指令：

| 指令 | 功能 |
|------|------|
| `/app <name> <description>` | 建新 repo + 自動開發 |
| `/build <owner/repo>` | 對已存在的 repo 執行 implement |
| `/msg <owner/repo> <message>` | 傳訊息到子 repo 的 issue |

---

## 心得

### 事件驅動 > 主動呼叫

最初想用 `gh workflow run` 串接，結果發現權限問題。改用 GitHub 原生事件後，不只解決權限問題，還更簡單、更可靠。每個 workflow 只需要宣告「我關心什麼事件」，不需要知道誰會觸發我。

### Shell 預檢省錢

在啟動 AI 之前用 shell 判斷狀態，避免無意義的 premium request 消耗。CASE C（全部完成）只用 9 秒 shell 時間，不用 Copilot。

### Token 最小權限原則

三個 token 各司其職：
- `COPILOT_GITHUB_TOKEN`：只認證 Copilot
- `COPILOT_PAT`：只操作子 repo
- `NOTIFY_TOKEN`：只觸發父 repo 的通知

沒有一個 token 有超出需要的權限。

### 安全閥很重要

3 次 review 上限 + `agent-stuck` label + Telegram 通知。沒有安全閥的自動化系統遲早會出事（無限循環、燒光 Actions 額度）。

---

## Repo

- [github.com/yazelin/aw-telegram-bot](https://github.com/yazelin/aw-telegram-bot)
- `v1-basic-working` 分支：純文字版本（[v1 文章](/2026/03/03/aw-telegram-bot/)）
- `v2-image-generation` 分支：加上圖片生成（[v2 文章](/2026/03/03/aw-telegram-bot-v2-image-generation/)）
- `v3-research-mode` 分支：研究模式 + 指令路由（[v3 文章](/2026/03/03/aw-telegram-bot-v3-research-mode/)）
- `v4-video-download` 分支：影片下載 + 白名單（[v4 文章](/2026/03/04/aw-telegram-bot-v4-video-download/)）
- `v5-app-factory` 分支：App Factory — 全自動建站（本文）
- 實測產出：[aw-apps/number-guessing-game-v2](https://github.com/aw-apps/number-guessing-game-v2)（[GitHub Pages](https://aw-apps.github.io/number-guessing-game-v2/)）

---

*— Yaze Lin, 2026-03-04*
