---
layout: post
title: "byok-tg-runner：用 GitHub Actions 當 AI Bot 的免費運算環境（實驗紀錄）"
subtitle: "Copilot SDK BYOK + Cloudflare Worker + GitHub Actions 雙 Runner HA，技術上可行但有違規風險"
date: 2026-03-10
categories: [AI]
tags: [GitHub Actions, Copilot SDK, BYOK, Azure AI Foundry, Cloudflare Workers, Telegram, FastAPI, App Factory]
author: Yaze Lin
---

## 故事

在 [azure-foundry-demo]({% post_url 2026-03-09-azure-foundry-demo %}) 驗證了 Copilot SDK 的 BYOK 模式確實能連上 Azure AI Foundry 之後，下一個問題自然就是：**能不能拿這套 SDK 做一個完整的 Telegram AI Bot？**

之前的 [telegram-copilot-bot]({% post_url 2026-03-05-telegram-copilot-bot-no-ghaw %}) 也是跑在 GitHub Actions 上，用 Copilot CLI 處理 AI 邏輯。這次想試不同的路線——**改用 Copilot SDK（Python in-process）取代 CLI**，搭配 Azure AI Foundry 的 BYOK 模式，看看能不能在效能和控制粒度上更進一步。

結果就是 [byok-tg-runner](https://github.com/yazelin/byok-tg-runner) 和 [byok-tg-main](https://github.com/yazelin/byok-tg-main) 這兩個 repo。先講結論：**技術上完全可行，但使用方式踩在 GitHub Actions 的 ToS 邊界上，有風險**。這篇是實驗紀錄，不是教學，不建議照搬到正式環境。

---

## 架構

```
Telegram 使用者
     │
     ▼
Telegram Bot API (webhook)
     │
     ▼
┌──────────────────────┐
│  Cloudflare Worker    │  Gateway + 白名單 + 聊天記錄 (KV)
│  健康檢查 → 挑活著的  │  Callback endpoint 接收 Bot 回覆
│  Runner               │
└──────────┬───────────┘
     ┌─────┴─────┐
     ▼           ▼
 Runner A    Runner B       GitHub Actions (各跑 5.5 小時)
 (交錯運行，互相監控)       互相觸發，自動接力
     └─────┬─────┘
           ▼
┌──────────────────────┐
│  FastAPI Server       │  uvicorn, port 8000
│  + Copilot SDK BYOK   │  Azure AI Foundry (gpt-5.2)
│  + cloudflared tunnel │  免費暴露到公網
└──────────────────────┘
```

流程：使用者傳 Telegram 訊息 → Cloudflare Worker 收到 webhook → 健康檢查找活著的 Runner → 轉發到 Runner 上的 FastAPI server → Copilot SDK 呼叫 Azure AI Foundry → 回覆寫入 KV → Worker 回傳給使用者。

---

## 公開 / 私有 Repo 分離

這個專案拆成兩個 repo：

| | byok-tg-runner（公開） | byok-tg-main（私有） |
|---|---|---|
| 內容 | 基礎設施、server 程式碼、Worker、workflow | System prompt、自訂工具、skills、MCP 設定 |
| 敏感資料 | 無 | 對話紀錄（存成 GitHub Issues） |
| 角色 | 執行引擎 | 設定與秘密 |

為什麼這樣拆？**讓 infrastructure 可以公開分享，同時保護 prompts 和工具的實作細節**。Runner 啟動時會從私有 repo clone 設定檔：

```
byok-tg-main/prompts/system.md  →  prompt.md
byok-tg-main/tools/*            →  server/
byok-tg-main/skills/            →  server/skills/
byok-tg-main/mcp-config.json    →  ~/.copilot/mcp-config.json
```

改了 prompt 或工具，只要重啟 Runner 就會生效，不用重新部署。

---

## 雙 Runner HA 機制

GitHub Actions 單個 workflow 最長跑 6 小時。為了讓 Bot 盡量持續在線，用了兩個 Runner 交錯運行：

```
Time  0h       2.5h      5h       5.5h     7.5h     8h      10.5h
      ├─────────┤─────────┤────────┤────────┤────────┤────────┤
  A:  ██████████████████████████   ██████████████████████████
  B:            ██████████████████████████
                ▲         ▲                          ▲
                │         └── B 在 5h 觸發 A         └── A 在 7.5h 觸發 B
                └── A 在 2.5h 觸發 B
```

每個 Runner 跑 5.5 小時（66 輪 x 5 分鐘間隔），每 5 分鐘做三件事：

1. **檢查本地 server** — 如果 FastAPI crash 了，自動重啟 uvicorn
2. **檢查對方狀態** — 用 `gh run list` 看另一個 Runner 是否在跑
3. **2.5 小時後若對方不在，自動觸發** — `gh workflow run` 啟動對方

Cloudflare Worker 那邊也有健康檢查：收到訊息時，先對兩個 Runner 的 tunnel URL 打 `/health`，挑第一個回應的。如果都沒回應，回覆使用者「目前沒有 Runner 在線」。

`cloudflared` 的 quick tunnel 是這套架構的關鍵 — 免費、不用設定 DNS、每次啟動會拿到一個隨機的 `trycloudflare.com` URL。Runner 啟動後把 URL 回報給 Worker，Worker 就知道要往哪裡轉發。

---

## App Factory 自動化流程

除了一般聊天，這個 Bot 最有趣的功能是 `/app` — 從一句話描述到一個完整的 GitHub 專案：

```
/app 做一個猜數字遊戲
  │
  ▼  AI 評估可行性、選技術棧
  │
  ├─ create_repo     建立 GitHub Repo（aw-apps 組織下）
  ├─ setup_repo      推送 scaffold（README、AGENTS.md、原始碼、GitHub Pages）
  ├─ 注入 workflow   implement.yml + review.yml 從 templates/ 複製進去
  ├─ create_issues   2-5 個結構化 Issue，標上 copilot-task label
  └─ setup_secrets   設定子 repo 的 secrets（RUNNER_API_KEY、RUNNER_URL 等）
```

然後用 `/build aw-apps/<repo>` 啟動自動開發鏈：

```
Issue (copilot-task) → implement.yml 觸發 Runner
  → AI clone repo、讀 Issue、開 branch、實作、push、建 PR
  → 自動觸發 review
  → AI 檢查驗收條件、跑 Playwright 測試
  → APPROVE → merge → dispatch 下一個 Issue → 循環
  → REQUEST_CHANGES → 進入修復循環
```

整個過程不用人介入。當然，AI 實作的品質取決於 Issue 寫得夠不夠清楚，有時候會需要用 `/msg` 補充說明。

---

## GitHub Actions 使用風險

這段很重要，所以獨立出來講。

**GitHub Actions 的 [Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions) 明確禁止將 Actions 當作長時運行的伺服器使用。** 這個專案做的事情：

- 每個 workflow 跑 5.5 小時，逼近 6 小時上限
- 在 Actions 裡啟動 FastAPI server + cloudflared tunnel，對外提供 API 服務
- 雙 Runner 交錯運行，本質上是在用 Actions 當 7x24 的伺服器
- 每月的 Actions 免費額度（2000 分鐘）根本不夠這樣用，實際上是靠公開 repo 的無限額度

**這有被 GitHub ban 帳號或 repo 的風險。** 雖然目前跑起來沒問題，但：

- GitHub 可能隨時調整偵測策略
- 長時間佔用 runner 資源對其他使用者不公平
- 這不是 Actions 設計的用途

**這是實驗性質的技術驗證，不是正式的部署方案。** 如果你覺得這個架構有用，正式環境應該跑在自己的伺服器上：

- 自己的 VPS（最便宜的 $5/月就夠了）
- 公司內部的 Linux 主機或 NAS
- 任何你有控制權的運算環境（Fly.io、Railway 等）

不要因為「免費」就用 Actions 當伺服器跑。

---

## 與其他專案的關係

這幾個專案是一連串實驗的不同階段：

| 專案 | 角色 |
|------|------|
| [azure-foundry-demo]({% post_url 2026-03-09-azure-foundry-demo %}) | 前置實驗：驗證 Copilot SDK BYOK 能連 Azure AI Foundry |
| [telegram-copilot-bot]({% post_url 2026-03-05-telegram-copilot-bot-no-ghaw %}) | 同樣跑在 Actions，用 Copilot CLI 處理 AI 邏輯 |
| **byok-tg-runner + byok-tg-main** | 這篇：用 SDK 取代 CLI，加上 BYOK + 雙 Runner HA |

byok-tg-runner 相比 telegram-copilot-bot 的主要差異：

- **AI 引擎**：從 Copilot CLI（`copilot --yolo`）換成 Copilot SDK（Python in-process），回應速度更快、控制粒度更細
- **BYOK**：自帶 Azure AI Foundry 的 API Key，不受 GitHub 內建模型的限制
- **HA**：雙 Runner 交錯 + Worker 健康檢查，telegram-copilot-bot 是單 Runner
- **Gateway**：Cloudflare Worker 加了雙 Runner failover 和 callback 機制

未來如果要認真用，最可能的路線是把 FastAPI server 搬到 VPS 或 Fly.io，其他部分（Worker gateway、App Factory、子 repo workflow）可以原封不動沿用。

---

## 小結

作為技術探索，這個實驗驗證了幾件事：

1. **Copilot SDK BYOK + Azure AI Foundry** 可以穩定運行在 FastAPI server 裡，工具呼叫、串流回應都正常
2. **cloudflared quick tunnel** 可以免費把 Actions 裡的 localhost 暴露到公網
3. **雙 Runner 交錯 + Worker 健康檢查** 可以做到接近持續在線的 HA
4. **公開/私有 repo 分離** 是管理 prompt 和工具的好模式
5. **App Factory 自動化開發鏈** 從建 repo 到 merge PR 可以全自動

但最重要的結論是：**GitHub Actions 不應該被這樣用**。這套架構的運算部分應該跑在正規的環境上，Actions 用回它該做的事 — CI/CD。

---

## Repo

- **公開 repo**：[github.com/yazelin/byok-tg-runner](https://github.com/yazelin/byok-tg-runner)
- **私有 repo**：[github.com/yazelin/byok-tg-main](https://github.com/yazelin/byok-tg-main)
