---
layout: post
title: "Copilot 多模型 Code Review — 讓 AI 互相挑錯"
subtitle: "用多個模型分工互補，提升 PR Review 覆蓋率"
date: 2026-02-10
categories: [AI 工具]
tags: [GitHub Copilot, Claude, GPT, Gemini, Code Review, AI, 多模型]
---

## 前言

自己 review 自己的 PR，就像自己改自己的作文 — 寫的時候覺得完美，別人一看就發現問題。PR #49 就是血淋淋的例子：一個簡單的 race condition 藏在 session cleanup 邏輯裡，我反覆看了三遍都沒發現，最後是同事在 production 遇到問題才抓到。

這讓我開始思考：能不能用 AI 來做 code review？而且不是一個模型，是多個模型互相挑錯。

---

## 問題分析

單一模型做 code review 有幾個明顯的限制：

| 問題 | 現象 |
|------|------|
| 知識偏差 | 每個模型的訓練資料不同，擅長的領域也不同 |
| 盲點固定 | 同一個模型反覆 review，漏掉的東西每次都一樣 |
| 深度不足 | 單次 review 很難同時兼顧架構、安全、效能、最佳實踐 |
| 上下文窗口 | 大型 PR 超過單一模型的有效處理範圍 |

我們試過 Gemini Code Assist 做單模型 review — 品質尚可，但需要 5-6 輪來回才能把問題收斂。每一輪都要人工判斷哪些建議有價值、哪些是噪音。

---

## 解決方案：多模型分工

核心想法是**讓不同模型負責不同面向**，就像一個 code review 團隊：

### 架構設計

```
gpt-5-mini（Conductor，指揮官）
    ├── Claude Opus — 架構與安全審查
    ├── Gemini — 最佳實踐與程式碼風格
    └── Codex — 效能與邊界條件
```

gpt-5-mini 作為 conductor（指揮官），負責：

1. **規劃**：分析 PR diff，決定需要哪些面向的 review
2. **分派**：將不同的 review 任務分配給對應的 subagent
3. **彙整**：收集各模型的回饋，去除重複和低價值建議
4. **驗證**：確認建議的正確性，過濾掉明顯的誤報

### 為什麼用 gpt-5-mini 當 conductor？

Conductor 的工作是「理解任務 → 分配 → 彙整」，不需要深度推理能力。用小模型可以降低成本、加快回應。真正吃算力的深度分析交給大模型。

---

## 程式碼片段：實際 Review 流程

以 PR #112（SkillHub 雙來源整合）為例，conductor 會產生類似這樣的分派指令：

```
Subagent 1 (Claude Opus):
  - 審查 skills.py 的 asyncio.gather 錯誤處理
  - 檢查 hub_meta.py 的 SQL injection 風險
  - 評估 _get_clients 的擴展性設計

Subagent 2 (Gemini):
  - 檢查 Literal type 使用是否符合 FastAPI 慣例
  - 驗證 docstring 完整性
  - 評估函式命名一致性

Subagent 3 (Codex):
  - 分析 asyncio.gather 的效能瓶頸
  - 檢查 _search_one 的 timeout 處理
  - 驗證 _merge_and_dedupe 的時間複雜度
```

### PR #112 的實際結果

三個模型總共產出 14 條建議，conductor 彙整後保留 8 條：

- **Claude Opus** 發現 `_search_one` 沒有設定 HTTP timeout，如果 ClawHub 無回應會永遠等待
- **Gemini** 指出 `HubSource` 的 `Literal` 值應該和 `GET /hub/sources` 的回傳值保持一致，建議抽成常數
- **Codex** 發現 `_merge_and_dedupe` 用了 `O(n²)` 的巢狀迴圈比對，建議改用 `dict` 做 `O(n)` 去重

被過濾掉的 6 條大多是風格建議（變數命名偏好）或重複的觀察。

---

## 成本分析

這套流程完全在 GitHub Copilot 的配額內運行，**消耗 0 Premium requests**：

| 模型 | 角色 | Token 用量 | 成本 |
|------|------|-----------|------|
| gpt-5-mini | Conductor | ~10k | 包含在配額內 |
| Claude Opus | 架構/安全 | ~89k | 包含在配額內 |
| Codex | 效能/邊界 | ~74k | 包含在配額內 |
| Gemini | 最佳實踐 | ~43k | 包含在配額內 |

總計約 216k tokens，單次 review 大約 2-3 分鐘完成。相比之下，人工 review 同等深度至少需要 30 分鐘。

### 與 Gemini Code Assist 單模型比較

| 項目 | 多模型 | Gemini Code Assist |
|------|--------|-------------------|
| 覆蓋面 | 架構 + 安全 + 效能 + 慣例 | 主要是慣例和常見問題 |
| 來回次數 | 1 次（conductor 彙整） | 5-6 輪 |
| 誤報率 | 較低（conductor 過濾） | 較高（需人工篩選） |
| 深度 | 各面向都有專家級分析 | 單一面向較深，其他淺 |

---

## 什麼時候該用、什麼時候不該用

### 適合多模型 Review 的場景

- **大型 PR**（超過 300 行 diff）— 人眼容易疲勞，AI 不會
- **涉及安全敏感的變更** — 認證、加密、權限邏輯
- **跨模組重構** — 需要同時理解多個檔案的關聯
- **新人的第一個 PR** — 作為額外的安全網

### 不適合的場景

- **純文件變更**（文件更新、設定調整）— 殺雞用牛刀
- **單行修復** — 直接人眼看比等 AI 快
- **高度領域特定的邏輯** — AI 缺乏業務上下文，容易誤判

---

## 學到什麼

1. **多模型互補大於單模型深挖** — 每個模型都有盲點，三個模型的盲點交集遠小於單一模型
2. **小 conductor + 大 subagent 的架構** — 讓小模型做規劃和彙整，大模型做深度分析，成本效益最佳
3. **AI Review 不取代人工 Review** — 它是額外的安全網，不是替代品。最終的 merge 決策還是人來做
4. **Token 用量要監控** — 216k tokens 看起來不多，但如果每個 PR 都跑，一天 20 個 PR 就是 4M+ tokens
5. **Conductor 的品質決定整體品質** — 如果分派不對，三個大模型再厲害也是做白工

---

## 參考資源

- [GitHub Copilot — Models](https://docs.github.com/en/copilot/using-github-copilot/ai-models/changing-the-ai-model-for-copilot-chat)
- [SkillHub 雙來源整合]({% post_url 2026-02-10-ctos-skillhub-dual-source %})（被 review 的 PR）
- [Session 與 Thread Pool 優化]({% post_url 2026-02-07-ctos-session-threadpool %})（前一篇技術文）
