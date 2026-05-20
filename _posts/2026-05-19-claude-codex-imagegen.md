---
layout: post
title: "教學：用 Codex CLI 的 $imagegen 在 Claude Code 裡生圖（吃 ChatGPT 訂閱額度）"
subtitle: "從一行 TUI 指令到包成可分享的 Claude Code skill，6 個 step 帶你做完——含批次處理 + 常見踩雷"
date: 2026-05-19
categories: [AI]
tags: [Claude Code, Codex CLI, Image Generation, OpenAI, ChatGPT, Skill, GitHub Pages, Shell Script, Tutorial]
---

![codex-imagegen-skill cover](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-05-19-claude-codex-imagegen.png)

> **🔗 快速連結**
> - 💻 **Skill GitHub**：[yazelin/codex-imagegen-skill](https://github.com/yazelin/codex-imagegen-skill)
> - 🌐 **Skill 介紹頁**：[yazelin.github.io/codex-imagegen-skill](https://yazelin.github.io/codex-imagegen-skill/) ([繁中版](https://yazelin.github.io/codex-imagegen-skill/zh-tw.html))
> - 📦 **一行安裝**：`git clone https://github.com/yazelin/codex-imagegen-skill ~/.claude/skills/codex-imagegen`

---

## 這篇要做什麼

教你怎麼讓 **ChatGPT 訂閱額度**負責幫你生圖，不必另外申請 OpenAI API key。從最簡單的「TUI 打一個命令生一張」，到「shell 自動化生 26 張」、再到「包成 Claude Code skill 讓 Claude 自己觸發」、最後「發成 public repo + GitHub Pages 讓別人也能裝」。

跟著走完一個下午可以結束，沒有需要付額外費用的步驟（前提是你已經有 ChatGPT Plus / Pro 訂閱）。

## 大綱

1. [前置條件](#step-0前置條件)
2. [Step 1：在 TUI 裡試一張](#step-1在-tui-裡試一張)
3. [Step 2：從 shell 一行打](#step-2從-shell-一行打)
4. [Step 3：包成可重複呼叫的腳本](#step-3包成可重複呼叫的腳本)
5. [Step 4：批次處理](#step-4批次處理)
6. [Step 5：包成 Claude Code skill](#step-5包成-claude-code-skill)
7. [(Optional) Step 6：發 repo + GitHub Pages](#step-6發-repo--github-pages)
8. [常見坑](#常見坑)
9. [何時別用這個方法](#何時別用這個方法)
10. [`$imagegen` 版本對照](#imagegen-版本對照)

## 適合誰

- 已經有 ChatGPT 訂閱、想避免再付 OpenAI Images API 的錢
- 個人開發者、寫部落格補配圖、做簡報插圖、prototype mockup
- 想知道 Claude Code skill 機制怎麼運作

## 不適合誰

- production backend 服務終端使用者（LINE bot / web app / SaaS）
- 高頻批次（會撞 ChatGPT 訂閱的 rate limit）
- 對 SLA 有嚴格要求的自動化 pipeline

詳見 [何時別用這個方法](#何時別用這個方法) 段。

---

## Step 0：前置條件

| 項目 | 怎麼確認 |
|---|---|
| Codex CLI 已安裝 | `codex --version` 跑得起來 |
| 版本 ≥ v0.123.0 | 上面那個指令印出來的版號。低於這個用 `npm i -g @openai/codex` 更新 |
| 已登入過 | 跑過 `codex login`，授權過 ChatGPT 帳號 |
| Shell 環境 | Linux / macOS / WSL 任一 |
| Claude Code | 如果你要做 Step 5（包 skill）才需要 |
| Git + gh CLI | 如果你要做 Step 6（發 repo）才需要 |

裝 Codex 的方式：

```bash
# 任選一條
npm i -g @openai/codex
brew install --cask codex
```

---

## Step 1：在 TUI 裡試一張

最快驗證 `$imagegen` 可用的方法是先用 TUI 跑一張：

```
$ codex
> $imagegen 一隻小貓貓
```

幾十秒後 codex 會生一張圖、存到：

```
~/.codex/generated_images/<session-id>/ig_<hash>.png
```

`session-id` 是 codex 給這次對話的 UUID。**這個路徑很重要——後面所有自動化都靠這個位置定位輸出檔。**

你可以打開那個檔案看一下，確認真的有生出來。

---

## Step 2：從 shell 一行打

TUI 沒辦法 script。改用 `codex exec`（非互動模式）：

```bash
codex exec -C "$(pwd)" -s workspace-write --skip-git-repo-check \
  '$imagegen 一隻小貓貓'
```

幾個 flag 的意思：
- `-C "$(pwd)"` — 工作目錄
- `-s workspace-write` — sandbox policy，允許寫入當前目錄
- `--skip-git-repo-check` — 不要求一定要在 git repo 內

跑成功後 stdout 會印出 `session id: <uuid>`，圖一樣落在 `~/.codex/generated_images/<uuid>/ig_*.png`。

**⚠️ 注意**：在 prompt 裡寫「存成 ./foo.png」**不管用**。imagegen 工具有自己的輸出邏輯，不會遵守 prompt 裡的路徑指令。要把圖搬到指定位置，需要外部 shell 處理——這就是 Step 3 要做的事。

---

## Step 3：包成可重複呼叫的腳本

把「呼叫 codex → 抓 session id → 把圖搬到目標路徑」包成一個獨立腳本。

**`codex-imagegen.sh`**：

```bash
#!/usr/bin/env bash
# codex-imagegen — generate one image via Codex CLI's $imagegen,
# then copy it from Codex's session-scoped output dir to a path you choose.
#
# Usage:  codex-imagegen.sh "<prompt>" "<target-path>"
# On success: prints the absolute path of the saved PNG.

set -euo pipefail

PROMPT="${1:?usage: codex-imagegen.sh <prompt> <target-path>}"
TARGET="${2:?usage: codex-imagegen.sh <prompt> <target-path>}"

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

mkdir -p "$(dirname "$TARGET")"

OUT=$(codex exec -C "$(pwd)" -s workspace-write --skip-git-repo-check \
        "\$imagegen $PROMPT" 2>&1)

SID=$(printf '%s\n' "$OUT" | grep -oE 'session id: [a-f0-9-]+' | head -1 | awk '{print $3}')
if [[ -z "$SID" ]]; then
  echo "ERROR: failed to extract session id from codex output" >&2
  echo "--- codex output ---" >&2
  printf '%s\n' "$OUT" >&2
  exit 1
fi

SRC_DIR="$CODEX_HOME/generated_images/$SID"
SRC=$(ls -t "$SRC_DIR"/*.png 2>/dev/null | head -1 || true)
if [[ -z "$SRC" ]]; then
  echo "ERROR: no PNG found in $SRC_DIR" >&2
  exit 1
fi

cp "$SRC" "$TARGET"
realpath "$TARGET"
```

**為什麼搬檔由外部 shell 做、不交給 codex**：codex 自己的 bubblewrap sandbox 在某些環境（巢狀 Linux、Docker container 內）會擋 shell 操作，error 長這樣：

```
bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
```

外部 shell 不在這個 sandbox 裡，`cp` 不會被擋。Linux / macOS / WSL 三個平台這個方案都穩。

**驗證一張**：

```bash
chmod +x codex-imagegen.sh
./codex-imagegen.sh "a tiny shiba inu with a red bow tie, watercolor, no text" ./shiba.png
```

成功的話會印出 `/path/to/shiba.png` 絕對路徑，target 位置就會有那張圖。

---

## Step 4：批次處理

要一次生很多張時，做個 manifest 檔，每行 `<目標檔名>\t<prompt 概念>`：

**`manifest.tsv`**：

```
cat-1	a tiny kitten with soft fur, watercolor, no text
shiba-1	a smiling shiba inu with red bow tie, flat illustration
cover-mvp	a tree cross-section with concentric rings, pastel
...
```

**批次腳本 `run.sh`**：

```bash
#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

MANIFEST="manifest.tsv"
OUT_DIR="images"
SCRIPT="./codex-imagegen.sh"

# 全部圖共用的 style template，串在每個 concept 後面
STYLE='Wide landscape illustration, flat with subtle 3D, soft pastels, no text.'

mkdir -p "$OUT_DIR"

while IFS=$'\t' read -r slug concept; do
  [[ -z "$slug" ]] && continue
  target="$OUT_DIR/${slug}.png"

  # 已生過的跳過（可以中斷後重跑）
  if [[ -s "$target" ]]; then
    echo "SKIP: $slug"
    continue
  fi

  prompt="$concept $STYLE"
  echo "START: $slug"

  if "$SCRIPT" "$prompt" "$target" </dev/null; then
    echo "OK: $slug"
  else
    echo "FAIL: $slug"
  fi
done < "$MANIFEST"
```

跑下去每張大概 50-70 秒。26 張的批次約 22 分鐘。

### ⚠️ 關鍵踩雷：`</dev/null` 不能省

`codex exec` 預設會讀 stdin（會印 `Reading additional input from stdin...`）。如果你寫成這樣：

```bash
while IFS=$'\t' read -r slug concept; do
  "$SCRIPT" "$prompt" "$target"   # ⚠ 沒有 </dev/null
done < "$MANIFEST"
```

codex 子進程會從 while loop 的 file descriptor 讀 stdin，**把剩下的 manifest 全部吃光**，loop 跑一次就結束。把子進程的 stdin 接到 `</dev/null` 是必要的：

```bash
"$SCRIPT" "$prompt" "$target" </dev/null
```

這個雷在使用 `xargs`、`parallel`、`while read` 餵 codex exec 時都會踩到，記下來。

---

## Step 5：包成 Claude Code skill

要讓 Claude Code 在你說「幫我生一張...」時自動觸發這個腳本，就把它包成 Claude Code skill。

**目錄結構**：

```
~/.claude/skills/codex-imagegen/
├── SKILL.md          ← Claude 讀的觸發說明（必要）
├── codex-imagegen.sh ← Step 3 那個腳本
├── README.md         ← 給人類看的安裝說明（可選）
└── LICENSE           ← MIT 之類（可選）
```

**`SKILL.md`** 的關鍵在 frontmatter：

```yaml
---
name: codex-imagegen
description: Generate images via Codex CLI's $imagegen shorthand, using the
  user's ChatGPT subscription quota instead of OpenAI Images API credits.
  Use when the user wants to generate one or more PNG images from text
  prompts, has Codex CLI installed and logged in, and the use case is
  personal/local (not a production backend serving end users).
---

# codex-imagegen

[Skill 內容寫法見下]
```

`description` 那段是 Claude 判斷「現在這個情境要不要觸發這個 skill」的依據。寫得越具體越好——前置條件（裝過 codex、登入過）、適用情境（personal/local）、不適用情境（production backend）都要寫進去。

SKILL.md 後面的 body 部分寫給 Claude 看怎麼用這個 skill：腳本位置、參數、預期輸出、prompt 怎麼寫、踩雷集。Claude 在執行這個 skill 之前會把 SKILL.md 整篇讀進去當 context。

**安裝**：

```bash
git clone https://github.com/yazelin/codex-imagegen-skill ~/.claude/skills/codex-imagegen
chmod +x ~/.claude/skills/codex-imagegen/codex-imagegen.sh
```

下一次啟動 Claude Code 它就會被載入。

**驗證**：

在 Claude Code 裡說：

> 幫我生一張水彩風格的小柴犬戴紅領結，存到 /tmp/test.png

Claude 應該會去呼叫 skill 的腳本、等 60 秒、回報路徑。`/tmp/test.png` 應該有一張圖。

---

## (Optional) Step 6：發 repo + GitHub Pages

要讓別人也能裝你的 skill，把它發成 public repo。

```bash
cd ~/codex-imagegen-skill

git init -b master
git add -A
git commit -m "Initial commit"

gh repo create yazelin/codex-imagegen-skill --public \
  --source=. --remote=origin --push \
  --description "A Claude Code skill that generates images via Codex CLI's \$imagegen"
```

**開 GitHub Pages**：

```bash
gh api -X POST repos/yazelin/codex-imagegen-skill/pages \
  -f source[branch]=master -f source[path]=/
```

預設會用 README.md 當著陸頁。如果想自己刻 landing page，加一個 `index.html` + `_config.yml` 把 README.md 從 Jekyll build 排除：

**`_config.yml`**：

```yaml
plugins: []
exclude:
  - SKILL.md
  - codex-imagegen.sh
  - README.md
```

1-2 分鐘後 Pages 上線在 `https://<user>.github.io/<repo>/`。

可以參考 [codex-imagegen-skill 的成品](https://github.com/yazelin/codex-imagegen-skill)看完整結構（含 EN + 繁中雙語頁）。

---

## 常見坑

| 症狀 | 原因 | 修法 |
|---|---|---|
| `$imagegen` 命令沒被觸發 | Codex 版本太舊 | 確認 `codex --version >= 0.117.0`，建議 v0.123.0+ |
| `bwrap: loopback: Failed RTM_NEWADDR` | codex sandbox 在巢狀 Linux 環境的 known issue | 把 `cp` 放在 codex 外面跑（這個 tutorial 的 Step 3 已經這樣做）|
| 批次 loop 跑一次就停 | `codex exec` 吃了 stdin | 子進程加 `</dev/null` |
| 找不到 session id | codex 沒成功觸發 imagegen | 看 stderr 完整輸出、檢查是否 codex login 過期 |
| 生圖速度慢 | 每張 50-70 秒是 OpenAI 那邊的時間 | 沒辦法，這是 model inference latency |
| Prompt 裡寫「存成 ./foo.png」不管用 | imagegen 工具不遵守 prompt 中的路徑指令 | 用 Step 3 的腳本，從 stdout 抓 session id 自己搬檔 |
| Claude Code 沒抓到 skill | 路徑不對、或忘了重啟 | 確認 `~/.claude/skills/codex-imagegen/SKILL.md` 存在、重啟 Claude Code |

---

## 何時別用這個方法

| 場景 | 為什麼別用 | 替代方案 |
|---|---|---|
| **production backend 服務終端使用者**（LINE bot、web app、SaaS） | 用個人 ChatGPT 訂閱去服務 N 個終端使用者，本質上違反訂閱條款精神 | 用 OpenAI Images API + 真 API key |
| **高頻批次** | ChatGPT 訂閱有 rate limit，撞到後續 calls 會卡 | 用 API key，限額更高 |
| **嚴格 SLA pipeline** | subprocess + stdout 解析 + 檔案複製，任何一步壞都難 retry | 用官方 SDK 直接 call API |
| **不想裝 Codex CLI 的環境** | 這條路線完全綁 Codex CLI | 用 Python `openai` SDK 直接打 Images API |

簡單講：**個人開發者 / 本機自動化 / 偶爾用 → 適合**；**多人服務 / 高頻 / production → 不適合**。

---

## `$imagegen` 版本對照

| 日期 | 事件 |
|------|------|
| 2026-01-05 | Issue [#8758](https://github.com/openai/codex/issues/8758)「Image generation from codex」開出 |
| 2026-03-24 | PR [#15600](https://github.com/openai/codex/pull/15600)「move imagegen skill into system skills」合併 |
| **2026-03-26** | **Codex CLI `v0.117.0`** 釋出，第一個 stable 版本帶 `$imagegen` |
| 2026-04-22 | PR [#18852](https://github.com/openai/codex/pull/18852) 升級到 ImageGen 2 |
| **2026-04-23** | **`v0.123.0`** 釋出，`gpt-image-2` 變預設 |

要跑這個 tutorial 的 step 至少需要 v0.123.0：

```bash
codex --version
npm i -g @openai/codex   # 更新
```

---

## 完整成品

- **Skill repo**：[yazelin/codex-imagegen-skill](https://github.com/yazelin/codex-imagegen-skill)
- **Pages**：[yazelin.github.io/codex-imagegen-skill](https://yazelin.github.io/codex-imagegen-skill/)（[繁中版](https://yazelin.github.io/codex-imagegen-skill/zh-tw.html)）
- **一行安裝**：`git clone https://github.com/yazelin/codex-imagegen-skill ~/.claude/skills/codex-imagegen`

整個 tutorial 走完你會有一個 skill 可以 commit 到自己 GitHub、給 Claude Code 自動觸發、給別人 clone 來用。**前提就是已經有 ChatGPT 訂閱、Codex CLI 裝過、登入過**——這三個條件達成的人，後面所有步驟都不花錢。
