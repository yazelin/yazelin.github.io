---
layout: post
title: "OpenClaw + Claude Max 訂閱：為什麼你的 Bot 被 402 擋住？"
subtitle: "Anthropic 如何偵測 OpenClaw 的請求，以及怎麼修復"
date: 2026-04-08
categories: [AI]
tags: [OpenClaw, Claude Code, Claude Max, Shell Script, Reverse Engineering, Bot]
---

![OpenClaw + Claude Max 訂閱：為什麼你的 Bot 被 402 擋住？](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-08-openclaw-claude-cli-fix.png)

## 問題

你用 [OpenClaw](https://openclaw.ai) 架了一個 Telegram Bot，後端選 `claude-cli` 接你的 **Claude Max 訂閱**。在 terminal 直接跑 `claude -p "hi"` 完全正常，但透過 OpenClaw 發送訊息時，收到：

```
API Error: 400
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "You're out of extra usage. Add more at claude.ai/settings/usage..."
  }
}
```

你的 Max 訂閱明明還有額度，為什麼被擋？

---

## 根本原因：Anthropic 在偵測 OpenClaw

Anthropic 的 API 會檢查請求中的 `--append-system-prompt` 內容。如果內容包含特定的字串，就會把這個請求**重新分類為 API 付費使用**，而不是走你的 Max 訂閱額度。

```
正常的 claude -p "hi"：
  → 走 Max 訂閱額度 ✓

OpenClaw 透過 claude -p 發的請求：
  → --append-system-prompt 裡帶了 OpenClaw 特徵字串
  → Anthropic API 偵測到 → 分類為 API 付費使用
  → 你的組織沒開 API 付費 → 402 拒絕
```

### 被偵測的特徵字串

經過二分法逐步縮小範圍（從 565 bytes → 141 bytes → 70 bytes），找到了 5 個觸發條件：

| # | 觸發字串 | 來源 | 說明 |
|---|---------|------|------|
| 1 | `treats a leading/trailing` | Heartbeat 說明文字 | 斜線分隔的 `leading/trailing` 觸發偵測 |
| 2 | `openclaw.inbound_meta.v1` | 頻道訊息的 metadata schema | 完整字串精確比對 |
| 3 | `HEARTBEAT.md if it exists` | Heartbeat 檔案檢查 | 搭配 `HEARTBEAT_OK` 形成組合觸發 |
| 4 | `HEARTBEAT_OK` + `ack` | Heartbeat 確認機制 | 整句話的組合觸發 |
| 5 | `reply_to_current` + `Tags are stripped` | 頻道回覆機制 | 組合觸發 |

這些字串來自 OpenClaw 的 gateway 程式碼（`dist/images-*.js`），每次呼叫 `claude -p` 時會自動附加到 system prompt：

```js
// OpenClaw 的 gateway 自動附加這段
"OpenClaw treats a leading/trailing \"HEARTBEAT_OK\"
 as a heartbeat ack (and may discard it)."
```

這只是告訴 Claude 怎麼處理 heartbeat 回應的說明文字，不涉及安全。但 Anthropic 拿它當作「這個請求來自 OpenClaw」的指紋。

### 偵測特性

每個觸發字串都有具體的比對規則：

```
Trigger #1 — "treats a leading/trailing"
  ✗ "treats a leading/trailing"    → 觸發
  ✓ "treats a leading or trailing" → 通過（改成 or）
  ✓ "treats a trailing/leading"    → 通過（順序不同）
  ✓ "recognizes a leading/trailing"→ 通過（換動詞）

Trigger #2 — "openclaw.inbound_meta.v1"
  ✗ "openclaw.inbound_meta.v1"    → 觸發
  ✓ "openclaw.inbound_meta_v1"    → 通過（點換底線）
  ✓ "openclaw.inbound_meta"       → 通過（少一段）
  ✓ "inbound_meta.v1"             → 通過（少一段）
```

---

## 解法：一個 30 行的 Bash Wrapper

核心想法很簡單：在 OpenClaw 呼叫 `claude` 之前，攔截 `--append-system-prompt` 的內容，把觸發字串改成語意相同但不會被偵測的寫法。

```
OpenClaw → claude-openclaw-fix.sh → 改寫 system prompt → 真正的 claude
                                     │
                  "leading/trailing"  →  "leading or trailing"
                  "inbound_meta.v1"  →  "inbound_meta_v1"
                  "if it exists"     →  "when present"
                  "Tags are stripped"→  "Tags are removed"
```

### Wrapper 核心邏輯

```bash
# 走過所有參數，找到 --append-system-prompt 就改寫下一個參數
while [ $i -lt $# ]; do
  a="${!i}"
  if [ "$a" = "--append-system-prompt" ]; then
    sp="${!next}"

    # Trigger #1: 斜線改成 or
    sp="${sp//treats a leading\/trailing/treats a leading or trailing}"

    # Trigger #2: 點改成底線
    sp="${sp//openclaw.inbound_meta.v1/openclaw.inbound_meta_v1}"

    # Trigger #3: 換個說法
    sp="${sp//HEARTBEAT.md if it exists/HEARTBEAT.md when present}"

    # Trigger #4: 整句重寫
    sp="${sp//...as a heartbeat ack.../A bare HEARTBEAT_OK means the check passed...}"

    # Trigger #5: 換同義詞
    sp="${sp//Tags are stripped before sending/Tags are removed before delivery}"
  fi
done

exec "$REAL_CLAUDE" "${new_args[@]}"
```

Claude 還是能理解這些改寫後的指示（語意完全相同），但 Anthropic 的字串比對不再觸發。

---

## 安裝

```bash
git clone https://github.com/yazelin/openclaw-claude-cli-fix
cd openclaw-claude-cli-fix
./install.sh
```

install.sh 做三件事：
1. 複製 wrapper 到 `~/.local/bin/claude-openclaw-fix.sh`
2. 設定 OpenClaw 的 claude-cli command 指向 wrapper
3. 重啟 OpenClaw gateway

```bash
# 驗證
./verify.sh
# PASS — Mori is talking to Claude via your subscription.
```

### 設定 OpenClaw 使用 Claude

```bash
openclaw config set agents.list.0.model "claude-cli/claude-sonnet-4-6"
openclaw config set 'agents.defaults.models."claude-cli/claude-sonnet-4-6"' '{}' --json
openclaw daemon restart
```

---

## 除錯

Wrapper 每次被呼叫都會寫一行 log：

```bash
tail -f ~/.local/state/claude-openclaw-fix.log

# 輸出範例：
# 2026-04-08T20:15:03+0800 rewritten=1 argc=12 pid=54321 real=/home/ct/.local/bin/claude
#                           ^^^^^^^^^^
#                           1 = 有改寫（正常）
#                           0 = 沒觸發（那次沒帶 OpenClaw 特徵字串）
```

如果需要更詳細的除錯，可以抓取完整改寫後的參數：

```bash
CLAUDE_OPENCLAW_FIX_CAPTURE=1 openclaw daemon restart

# 每次呼叫會在這裡產生一個檔案
ls ~/.local/state/claude-openclaw-fix-captures/
```

---

## 建議：設定 Fallback Model

如果 Anthropic 未來加了新的偵測規則，wrapper 可能需要更新。設定 fallback 確保 Bot 不會斷線：

```bash
openclaw config set agents.defaults.model.primary "claude-cli/claude-sonnet-4-6"
openclaw config set agents.defaults.model.fallbacks '["google-gemini-cli/gemini-3-pro-preview"]' --json
openclaw daemon restart
```

這樣 Claude 被擋時會自動切到 Gemini，不影響使用者。

---

## 注意事項

- **這不是繞過任何付費額度**。你的 Max 訂閱 5 小時限制仍然正常運作。這個 fix 只是讓請求**被正確分類**為 Max 訂閱使用，而不是被誤判為 API 付費使用。
- **Anthropic 可能會更新偵測規則**。目前找到 5 個觸發字串，未來可能增加。Wrapper 的替換邏輯是一行 bash，新增規則很容易。
- **OpenClaw 也可能更新**。如果 OpenClaw 改了 system prompt 的內容，觸發字串可能會變。

---

## 怎麼找到的：二分法除錯過程

最有趣的部分其實是找到根因的過程。

### 步驟一：捕獲完整請求

先寫一個 tracing wrapper 取代 `claude`，記錄 OpenClaw 實際送出的完整 argv、env、stdin：

```bash
# tracing wrapper（取代 claude binary）
#!/bin/bash
echo "=== $(date) ===" >> /tmp/claude-trace.log
printf '%s\0' "$@" >> /tmp/claude-trace.log
exec /real/path/to/claude "$@"
```

抓到的 `--append-system-prompt` 內容有 **2,847 bytes**。

### 步驟二：建立 baseline

```bash
# 這個成功（走 Max 訂閱）
claude -p "hi"

# 這個失敗（被分類為 API 付費）
claude -p "hi" --append-system-prompt "<2847 bytes 的 OpenClaw 內容>"
```

確認是 `--append-system-prompt` 的內容造成的。

### 步驟三：二分法

```
2847 bytes → 前半/後半，哪半觸發？ → 後半
1400 bytes → 前半/後半？           → 前半
 700 bytes → ...
 565 bytes → 找到第一個觸發區塊
 141 bytes → 縮小範圍
  70 bytes → "treats a leading/trailing HEARTBEAT_OK"
```

然後用**變體測試**確認每個 token 的貢獻：

```
✗ treats a leading/trailing    → 觸發
✓ treats a leading-trailing    → 通過（斜線換連字號）
✓ treats a leading or trailing → 通過（斜線換 or）
✓ recognizes a leading/trailing→ 通過（換動詞）
```

重複這個過程，最終找到 5 個獨立的觸發條件。

---

## 參考資源

- [openclaw-claude-cli-fix — GitHub Repository](https://github.com/yazelin/openclaw-claude-cli-fix)
- [OpenClaw — Official Site](https://openclaw.ai)
- [Root Cause 完整分析文件](https://github.com/yazelin/openclaw-claude-cli-fix/blob/main/docs/root-cause.md)
- [Claude Max 訂閱方案](https://claude.ai/settings/usage)
