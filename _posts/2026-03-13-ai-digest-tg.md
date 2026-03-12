---
layout: post
title: "AI Digest TG"
subtitle: "個人化 AI 新聞摘要 Telegram Bot"
tags: [專案, Telegram, Cloudflare Workers, GitHub Actions, AI]
---

## 這是什麼？

[AI Digest TG](https://github.com/yazelin/ai-digest-tg) 是一個自動化的 AI 新聞摘要系統，每天定時從多個來源抓取 AI 相關新聞，透過 AI 篩選和摘要後，推送到你的 Telegram。

每位使用者可以自訂：
- **訂閱主題**（最多 5 個）
- **投遞時間**（每 3 小時一個時段）
- **摘要語言**（繁體中文 / English）
- **摘要風格**（綜合 / 快覽 / 深讀）

## 架構

整個系統由三個部分組成，完全 serverless，不需要自己的伺服器：

| 元件 | 技術 | 負責 |
|------|------|------|
| Telegram Bot | Cloudflare Workers + KV | 處理指令、管理用戶設定 |
| 內容 Pipeline | GitHub Actions + Copilot CLI | 抓新聞、AI 摘要、發送 |
| 設定頁面 | GitHub Pages | Web UI，透過 Telegram Login 驗證 |

```
使用者 ⟷ Telegram Bot (CF Workers)
              ↕
         Cloudflare KV（用戶設定）
              ↕
GitHub Actions（定時抓取 → AI 摘要 → 發送 Telegram）
```

## 新聞來源

系統從以下來源抓取文章，然後用 round-robin 平均取樣，確保每個來源都有覆蓋：

**RSS Feeds：** HuggingFace Blog、OpenAI Blog、Simon Willison、TechCrunch AI、MIT Technology Review、The Verge AI、Ars Technica

**APIs：** Hacker News（Top 30）、arXiv（cs.AI、cs.LG、cs.CL）

使用者也可以透過 `/sources add <url>` 加入自己的 RSS 來源（最多 5 個）。

## AI 摘要流程

1. 從所有來源抓取文章（約 1800+ 篇）
2. Round-robin 從每個來源平均取樣，共 50 篇
3. 根據用戶的主題和語言，用 GitHub Copilot CLI（gpt-5-mini）篩選並摘要
4. 依照用戶選擇的風格格式化
5. 透過 Telegram Bot API 發送

同樣主題+語言的用戶共享一次 AI 呼叫，避免重複消耗。

## 三種摘要風格

- **綜合（mixed）**— 3 篇重點文章（含摘要 + 推薦理由）+ 3~5 條快訊
- **快覽（brief）**— 5~10 條一行快訊，只有標題和連結
- **深讀（deep）**— 3~5 篇詳細分析

## 存取控制

採用邀請制，管理員透過 `/admin_invite` 產生邀請碼，使用者用 `/start 邀請碼` 註冊。搭配 rate limiting 防止暴力破解。

## 試用

- Web UI：[yazelin.github.io/ai-digest-tg](https://yazelin.github.io/ai-digest-tg/)
- Bot：[@ai_digest_tg_bot](https://t.me/ai_digest_tg_bot)
- Source：[github.com/yazelin/ai-digest-tg](https://github.com/yazelin/ai-digest-tg)
