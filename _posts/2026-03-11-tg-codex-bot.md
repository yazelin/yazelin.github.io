---
layout: post
title: "tg-codex-bot：用 GitHub Codespace + Codex CLI 當 Telegram Bot 的運算後端"
subtitle: "Codespace 取代 Actions，正規但要錢的另一條路"
date: 2026-03-11
categories: [AI]
tags: [GitHub Codespace, Codex CLI, Cloudflare Workers, Telegram, OpenAI, App Factory]
author: Yaze Lin
---

## 故事

上一篇 [byok-tg-runner]({% post_url 2026-03-10-byok-tg-runner %}) 把 GitHub Actions 當成 Telegram Bot 的免費運算環境，技術上跑起來了，但文章最後也直說了：**這踩在 GitHub Actions 的 ToS 邊界上，有違規風險**。雙 Runner 交錯、5.5 小時長跑、cloudflared tunnel 對外提供 API 服務 — 這些都不是 Actions 設計的用途。

所以這次想試另一條路：**用 GitHub Codespace 當運算環境**。

Codespace 本質上就是一台雲端 VM（Ubuntu + devcontainer），是 GitHub 正規提供的開發環境，付費使用，沒有 ToS 問題。它有內建的 port forwarding，不需要 cloudflared 就能把服務暴露到公網。而且支援按需啟動 — 用完閒置 30 分鐘會自動關機。

AI 引擎的部分，這次換成 OpenAI 的 **Codex CLI**，而不是之前用的 Copilot SDK 或 Copilot CLI。Codex CLI 有 `full-auto` 模式，可以讓 AI 自動批准所有工具呼叫，適合自動化場景。結合 Codespace 的完整開發環境（git、gh CLI、Node.js 都有），看看這條路行不行。

結果就是 [tg-codex-bot](https://github.com/yazelin/tg-codex-bot)。

---

## 架構 — 雙路徑設計

這個 Bot 最核心的設計是**雙路徑**：簡單的事情不需要啟動 Codespace，直接在 Cloudflare Worker 裡用 OpenAI API 回覆；複雜的任務才升級到 Codespace 跑 Codex CLI。

```
Telegram 使用者
     │
     ▼
┌──────────────────────────────────────────┐
│  Cloudflare Worker (TypeScript)           │
│                                           │
│  FAST PATH (Worker 直接處理):             │
│  ├─ /reset         → 清除 KV 記憶         │
│  ├─ /status        → 查 Codespace 狀態    │
│  ├─ /build <repo>  → 觸發子 repo workflow  │
│  ├─ /msg repo#N    → 對 Issue 留言 + 觸發  │
│  └─ 一般聊天       → OpenAI API 直接回     │
│     └─ 如果回 <<<ROUTE_TO_CODEX>>>        │
│        → 升級到 Codex Path                │
│                                           │
│  CODEX PATH (啟動 Codespace):             │
│  ├─ /app [fork:repo] desc  → 建立專案     │
│  ├─ /issue repo desc       → 結構化 Issue  │
│  ├─ /research topic        → 研究 + 彙整   │
│  └─ 升級過來的複雜對話                     │
└──────────────────────────────────────────┘
         │                         │
         ▼                         ▼
   OpenAI API                GitHub Codespace
   (簡單聊天)                ┌──────────────────┐
                             │ Task Server :8080 │
                             │ Codex CLI          │
                             │  -q -a full-auto   │
                             │ gh CLI / git       │
                             └──────────────────┘
```

### Fast Path

一般聊天訊息走 **Fast Path**：Worker 直接呼叫 OpenAI Responses API（model: `gpt-5.3-codex`），不需要啟動 Codespace，回應速度快。

Worker 的 system prompt 裡有一段關鍵指令：如果使用者的需求涉及建 repo、寫程式碼、跑 shell 指令等複雜任務，AI 會回傳一個特殊標記 `<<<ROUTE_TO_CODEX>>>`。Worker 收到這個標記後，自動把任務升級到 Codex Path。

### Codex Path

複雜任務走 **Codex Path**：Worker 透過 GitHub API 確保 Codespace 已啟動（如果關了就開），等 Task Server 健康檢查通過後，把任務送過去。Task Server 收到後呼叫 Codex CLI 執行，結果回傳給 Worker，Worker 再傳回 Telegram。

這個「自動判斷要不要升級」的機制很實用 — 使用者不需要記哪些指令要加前綴，一般打字聊天就好，系統自己決定要不要動用 Codespace。

---

## 為什麼用 Codespace

和 [byok-tg-runner]({% post_url 2026-03-10-byok-tg-runner %}) 用 Actions 相比：

| | GitHub Actions | GitHub Codespace |
|---|---|---|
| **正規性** | ToS 禁止當 server 用 | 正規開發環境，按時計費 |
| **成本** | 公開 repo 免費（但有違規風險） | ~$0.36/hr（2-core） |
| **啟動** | Workflow dispatch ~15 秒 | 冷啟動（create）好幾分鐘，熱啟動 ~10 秒 |
| **Port 暴露** | 需要 cloudflared tunnel | 內建 port forwarding |
| **閒置處理** | 跑完 workflow 就結束 | 閒置 30 分鐘自動關機 |
| **環境** | 每次都是乾淨的 runner | 持久化的 devcontainer |

Codespace 的優勢是**正規**和**方便** — 不用擔心帳號被 ban，也不用搞 cloudflared tunnel。代價就是**要錢**。每小時約 $0.36（2-core Linux），如果一天用 2 小時，一個月大概 $22。這不是免費的方案，但也不算貴。

---

## Codex CLI full-auto 模式

Task Server（`server/index.js`）呼叫 Codex CLI 的方式：

```javascript
const args = ["-q", "-a", "full-auto", "-m", CODEX_MODEL, prompt];
execFile("codex", args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }, callback);
```

`-q` 是 quiet mode，`-a full-auto` 是自動批准所有工具呼叫。這代表 **Codex CLI 可以自由執行任何 shell 指令、讀寫任何檔案、呼叫任何 API** — 不需要人類確認。

這在自動化場景很好用：Bot 收到 `/app 做一個猜數字遊戲`，Codex CLI 會自動建 repo、寫程式碼、commit、push、建 PR，全程不需要人介入。

但也代表：**如果 prompt 被注入惡意指令，Codex 會照做**。在 Codespace 這個沙箱裡跑還算安全（最多弄壞那個 Codespace），但如果裡面有 GitHub PAT 或 API key，理論上可以造成更大的影響。

---

## App Factory + 子 Repo Workflow

跟 [byok-tg-runner]({% post_url 2026-03-10-byok-tg-runner %}) 類似的 `/app` → `/build` 自動開發鏈，但這次 implement 和 review 由 Codex CLI 執行：

```
/app 做一個猜數字遊戲
  │
  ▼  Codex CLI 評估 + 建立 repo
  ├─ create repo (aw-apps 組織下)
  ├─ push scaffold (README、AGENTS.md、原始碼)
  ├─ 注入 implement.yml + review.yml workflow
  └─ create 結構化 Issues

/build aw-apps/guess-number
  │
  ▼  觸發子 repo 的 implement.yml
  Issue → Codex CLI clone + 讀 Issue + 開 branch + 實作 + push + 建 PR
    → 自動觸發 review
    → Codex CLI 檢查 acceptance criteria
    → APPROVE → merge → 下一個 Issue → 循環
    → REQUEST_CHANGES → 修復循環
```

Worker 收到子 repo workflow 的 `/implement` callback 時，同樣啟動 Codespace、送任務給 Task Server。Task Server 會 clone 子 repo 到暫存目錄，讓 Codex CLI 在裡面工作，完成後清掉暫存目錄。

---

## 與其他專案的比較

| 專案 | 運算環境 | AI 引擎 | 成本 |
|------|---------|---------|------|
| [telegram-copilot-bot]({% post_url 2026-03-05-telegram-copilot-bot-no-ghaw %}) | GitHub Actions | Copilot CLI | 免費（公開 repo） |
| [byok-tg-runner]({% post_url 2026-03-10-byok-tg-runner %}) | GitHub Actions | Copilot SDK + Azure AI Foundry | 免費（但有違規風險） |
| **tg-codex-bot** | GitHub Codespace | Codex CLI + OpenAI API | ~$0.36/hr |

三個專案都用 **Cloudflare Worker 當 gateway**（接 Telegram webhook、白名單、聊天記錄 KV），差別在後端的運算環境和 AI 引擎。

tg-codex-bot 的特色是**雙路徑設計** — 簡單聊天不用啟動 Codespace，只有複雜任務才會動用。這讓日常使用的成本降低不少，不像 byok-tg-runner 那樣 runner 一直在跑。

---

## 注意事項

- **Codespace 啟動快但停止慢**：啟動只要 10-15 秒，但停止（ShuttingDown 狀態）可能需要 3-5 分鐘。最麻煩的是 **停止中的 Codespace 無法啟動** — 你只能等它完全停下來才能重新開。這代表如果使用者剛好在 Codespace 自動關機的那段時間傳訊息，會卡住。這個問題在實際使用中很惱人，最後發現可能還是用 GitHub Actions 的方式比較穩定，至少不會有這種「夾在中間」的狀態。

- **full-auto 模式 = AI 可以執行任何命令**：Codex CLI 在 full-auto 模式下不需要人類批准，如果 prompt 被注入惡意指令，它會照做。Codespace 提供了一定程度的隔離，但裡面的 secrets（`GH_PAT`、`OPENAI_API_KEY`）還是有風險。

- **成本不是零**：不像 Actions 公開 repo 免費（雖然那是違規的），Codespace 是按時計費的。如果忘記關或是設定的閒置超時太長，可能會產生意外費用。

- **Port forwarding 需要認證**：Codespace 的 port forwarding URL 格式是 `https://{name}-{port}.app.github.dev`，預設需要 GitHub 認證。Task Server 用 API key 驗證，但要確保 port visibility 設定正確。

---

## 小結

tg-codex-bot 是這系列實驗的第三種路線：

- **Actions 路線**（telegram-copilot-bot、byok-tg-runner）：免費但有違規風險
- **Codespace 路線**（tg-codex-bot）：正規但要錢
- 兩者的 gateway 層（Cloudflare Worker）幾乎一樣，差別在後端的運算環境

理論上 Codespace 按需啟動的模式很美好 — 用的時候開，不用就關，省錢。但實際跑起來才發現 **ShuttingDown 狀態是個大坑**：Codespace 停止中的時候既不能用也不能重啟，只能乾等。這讓「用完就關、要用再開」的模式體驗很差。

如果真的要用 Codespace 跑，比較務實的做法是**不要主動停止，改成設定 GitHub 的閒置超時為 5 分鐘**（GitHub Codespace 設定頁面可以調）。這樣執行完任務後 Codespace 會保持 running 5 分鐘，如果這段時間有新任務進來就不用重啟。但代價是每次至少多付 5 分鐘的費用，而且還是沒辦法完全避免 ShuttingDown 的問題。

最後的結論是：如果要穩定，可能還是回到 GitHub Actions 的方式比較實際（至少 workflow 啟動是確定性的），或者乾脆租一台 VPS 長跑。Codespace 適合開發，但不太適合當 on-demand 的運算後端。

Codex CLI 的 full-auto 模式在自動化場景確實好用，App Factory 的整條鏈從建 repo 到 merge PR 都能全自動完成。只是要記得：**自動 = 沒有人類在迴圈裡**，安全性要自己顧好。

---

## Repo

- [github.com/yazelin/tg-codex-bot](https://github.com/yazelin/tg-codex-bot)
