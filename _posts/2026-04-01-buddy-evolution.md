---
layout: post
title: "Claude Code 愚人節彩蛋 /buddy — 我幫它做了 RPG 進化系統"
subtitle: "從發現彩蛋到做完 Plugin + Web 平台，然後被官方宣布下架的 24 小時"
date: 2026-04-01
categories: [AI]
tags: [Claude Code, Plugin, TypeScript, Next.js, Supabase, April Fools, Open Source]
---

![Claude Code /buddy — 我的 Zephyrost](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/buddy.jpg)

## 4 月 1 日，Claude Code 突然多了一隻寵物

2026 年 4 月 1 日，Claude Code 更新到 v2.1.89，changelog 裡低調地多了一行愚人節彩蛋指令：

```
/buddy
```

輸入後，終端機會跳出一隻 ASCII 小動物：

```
  ★★★★ EPIC                    BLOB

      (    )
       .----.
      ( ✦ ✦ )
      (      )
       `----'

  Zephyrost

  "A sagely blob that sees code
   errors three steps ahead and
   points them out with patient,
   cutting observations—rarely wrong,
   always amused by your panic."

  DEBUGGING  ██░░░░░░  27
  PATIENCE   ████░░░░  72
  CHAOS      ███░░░░░  49
  WISDOM     █████████ 100
  SNARK      ████░░░░  70
```

每個人拿到的物種、稀有度、名字都不一樣。我抽到的是 **★★★★ EPIC 等級的 BLOB「Zephyrost」**，WISDOM 直接滿 100。有人拿到 Common 的蝸牛，有人拿到 Legendary 的龍。

社群馬上炸了。

---

## 社群反應：「這是愚人節彩蛋還是真的功能？」

GitHub issue [anthropics/claude-code#41684](https://github.com/anthropics/claude-code/issues/41684) 迅速湧入討論：

- 「我的 buddy 會隨時間成長嗎？」
- 「可以讓它進化嗎？」
- 「能不能跟別人的 buddy 比較？」

官方沒有回應。沒有文件、沒有 changelog、沒有任何說明。

社群成員 **[@RaphaelRUzan](https://github.com/RaphaelRUzan)** 率先做了一個 [PoC（概念驗證）](https://github.com/RaphaelRUzan/buddy-evolution)，設計了完整的 RPG 進化系統：XP 引擎、屬性成長、進化階段、精靈疊加。

我看到這個設計，覺得可以把它做成真正能用的 Claude Code Plugin + Web 平台。

---

## 24 小時開發紀錄

### 05:46 — 開始

先寫設計文件和實作計畫，確認要做三個東西：

```
buddy-evolution/
├── packages/core/       # 共用的進化引擎
├── packages/plugin/     # Claude Code Plugin（hooks + /evo 指令）
└── packages/web/        # Next.js 線上平台（排行榜 + 個人檔案）
```

### 08:38 ~ 09:49 — 核心開發（約 1 小時）

```
08:38  scaffold monorepo
09:02  core engine — XP、stats、evolution（從 PoC 移植 + 測試）
09:04  transcript parser（解析 Claude Code 的對話紀錄算 token 數）
09:06  session accumulator（hooks 追蹤指標）
09:07  evolution state persistence
09:09  terminal display renderer
09:11  CLI entry point（/evo slash command）
09:13  hook scripts + plugin manifest
09:15  integration tests — 58 + 32 = 90 tests pass
09:26  web app scaffold
09:36  sync API + leaderboard
09:44  profile page + stat radar chart
09:45  GitHub OAuth login
09:46  buddy comparison page
09:47  achievement system
09:49  final build verification ✓
```

不到 2 小時，核心功能全部完成。

### 10:16 ~ 12:16 — 修 Bug + 優化安裝流程

Claude Code 的 Plugin 系統當時還很新，踩了很多坑：

```
10:44  fix: manifest schema — skills 和 hooks 的格式跟文件寫的不一樣
10:48  fix: inline hooks — 外部 hooks.json 載不到
10:53  fix: 路徑問題 — CLAUDE_PLUGIN_ROOT 有時候拿不到
12:02  fix: 試了 shell alias、settings.json、postinstall，最後用 --plugin-dir
12:16  最終方案：/plugin marketplace install
```

Plugin manifest 的格式文件不完整，hooks 的載入機制也有 bug，光是讓 hooks 正確註冊就試了 5 種方法。

### 15:48 ~ 17:42 — Web 平台上線 + 文件

```
15:48  Vercel 部署（monorepo 需要特殊設定）
16:47  README 完善
16:58  landing page 加安裝教學
17:01  /evo connect 指令（串接平台 token）
17:42  加截圖到 README
```

### 17:52 ~ 19:57 — 最後一波重構

```
17:52  把 hooks 改成純 bash + inline Node — 不需要 build step
18:11  hooks 註冊機制再改一次
19:44  最終方案：在 settings.json 註冊 hooks
19:57  bootstrap 邏輯移到 SessionStart — 每次開 session 自動修復
```

**20:00 — 完成。** 從零到可用，大約 14 小時。

---

## 它做了什麼

### Plugin：追蹤你的使用量，換算成 XP

```bash
# 安裝
/plugin marketplace add yazelin/buddy-evolution
/plugin install buddy-evolution@buddy-evolution

# 匯入你的 /buddy 資料
/buddy-evolution:evo setup

# 查看進化狀態
/buddy-evolution:evo
```

Plugin 透過 Claude Code 的 hooks 系統自動追蹤：

| Hook | 追蹤什麼 |
|------|---------|
| `SessionStart` | Session 開始時間 |
| `PostToolUse` | 工具呼叫次數、檔案編輯、測試執行 |
| `PostToolUseFailure` | 被拒絕的工具呼叫 |
| `PostCompact` | Context reset 次數 |
| `SessionEnd` | 解析 transcript 算 token 數、計算 XP |

所有追蹤都在本地，不會傳任何東西出去（除非你手動 `/evo sync`）。

### XP 系統

| 來源 | XP |
|------|-----|
| 每次 session | 基礎 10 XP |
| 每 1000 input tokens | +5 XP |
| 每 1000 output tokens | +8 XP |
| 每次 tool call | +2 XP |
| 每次檔案編輯 | +3 XP |
| 連續使用天數 | 乘數加成 |

XP 累積到門檻就會進化：

```
Hatchling → Juvenile → Adult → Elder → Ancient → Mythic
```

每個階段 ASCII 精靈的外觀會改變（加上光環、翅膀、冠冕等疊加效果）。

### 屬性系統

```
┌─────────────────────────────────────────┐
│  DEBUGGING   ████░░░░░░░░░░░░░  27      │
│  PATIENCE    █████████░░░░░░░░  72      │
│  CHAOS       ██████░░░░░░░░░░░  49      │
│  WISDOM      █████████████████ 100      │
│  SNARK       █████████░░░░░░░░  70      │
└─────────────────────────────────────────┘
```

每個屬性根據你的使用模式成長：
- 常修 bug → DEBUGGING 上升
- 長時間 session → PATIENCE 上升
- 頻繁切換任務 → CHAOS 上升
- 累積 token 數 → WISDOM 上升
- 被拒絕的 tool call 多 → SNARK 上升

有 diminishing returns，避免單一屬性無限灌。

### Web 平台

用 Next.js + Supabase + Vercel 做了一個線上平台：

- **排行榜** — 全球 buddy 等級排名
- **個人檔案** — 屬性雷達圖、XP 進度條
- **成就系統** — 達成特定里程碑解鎖徽章
- **比較** — 兩隻 buddy 的屬性對比

透過 `/evo sync` 上傳到平台，用 GitHub OAuth 登入。

---

## 技術架構

```
┌──────────────────────────────────────────────────┐
│  Claude Code                                      │
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │  buddy-evolution plugin                   │     │
│  │                                           │     │
│  │  hooks ──→ session accumulator ──→ XP    │     │
│  │            (PostToolUse etc.)     engine  │     │
│  │                                    │      │     │
│  │  /evo ──→ display renderer ←──────┘      │     │
│  │               │                           │     │
│  │               └──→ /evo sync             │     │
│  └───────────────────────┼───────────────────┘     │
│                          │                          │
└──────────────────────────┼──────────────────────────┘
                           │ HTTPS
                           ▼
              ┌────────────────────────┐
              │  Web Platform          │
              │  Next.js + Vercel      │
              │                        │
              │  Supabase (Postgres)   │
              │  GitHub OAuth          │
              │                        │
              │  排行榜 / 個人檔案      │
              │  成就 / 比較            │
              └────────────────────────┘
```

| 層 | 技術 |
|----|------|
| Core engine | TypeScript（XP、stats、evolution） |
| Plugin | Claude Code hooks + skills（bash + inline Node） |
| Platform | Next.js 16 + Tailwind CSS |
| Database | Supabase（Postgres） |
| Auth | GitHub OAuth via Supabase |
| Hosting | Vercel free tier |
| Monorepo | pnpm workspaces + Turborepo |

---

## 踩過的坑：Claude Code Plugin 系統

這是開發過程中最痛的部分。Claude Code 的 Plugin 系統當時（v2.1）還很早期：

### 1. Hooks 註冊方式一直變

```
嘗試 1: hooks.json 外部檔案     → 讀不到
嘗試 2: plugin.json 內嵌 hooks  → 格式不對
嘗試 3: settings.json 註冊      → 可以，但路徑要寫死
嘗試 4: postinstall.sh 自動註冊 → postinstall 根本不會被執行
嘗試 5: SessionStart hook 自我修復 → 最終方案 ✓
```

最後的解法是在 `SessionStart` hook 裡做 bootstrap：每次開新 session 都檢查環境是否正確，不正確就自動修復。這樣即使升級或重裝也不會壞。

### 2. CLAUDE_PLUGIN_ROOT 不可靠

Plugin 的根目錄環境變數有時候拿不到，改用 `SCRIPT_DIR`（bash 的 `dirname` ）相對路徑取代。

### 3. 需要 Node.js 但不想要 build step

最初用 TypeScript 寫 hooks，安裝後要 `pnpm build`。後來改成純 bash + inline Node（`node -e "..."`），安裝完直接能用，不需要 build。

---

## 結局：Anthropic 確認是愚人節彩蛋

4 月 1 日晚間，Anthropic 團隊成員 **@alii** 在 GitHub issue 中回覆：

> *"The TLDR is since this is just a feature for April fools that will be removed in a few days, it's unlikely we'll be developing this further."*

`/buddy` 是愚人節彩蛋，即將被移除。

我在 4/2 加了 sunset notice，並推薦 **[@FrankFMY](https://github.com/FrankFMY)** 做的[獨立版 buddy-evolution](https://github.com/FrankFMY/buddy-evolution) — 不依賴官方 `/buddy` 指令，完全獨立運作。

---

## 回顧

一個愚人節彩蛋，24 小時內：

- 社群設計了完整的 RPG 進化系統
- 我把它做成可安裝的 Plugin + Web 平台
- 90 個測試通過、Vercel 部署上線
- 然後就被宣布下架了

這就是 open source 社群的魅力。一個彩蛋激發了好幾個人的創作，即使最後彩蛋消失了，這些程式碼和設計還是留了下來。

也許某天 Anthropic 會真的把 `/buddy` 做回來。到時候進化系統已經準備好了。

---

## 後記：/buddy 被移除後，社群做了什麼

### 時間線

| 日期 | 事件 |
|------|------|
| 4/1 | `/buddy` 隨 v2.1.89 上線，changelog 標註為 April Fools |
| 4/1 | GitHub issue #41684 湧入討論，社群開始做進化系統 |
| 4/1 | Anthropic 工程師 @alii 確認：愚人節彩蛋，不會做進化功能 |
| ~4/7-9 | `/buddy` 從 Claude Code 中移除，輸入後回傳 `Unknown skill: buddy` |
| 4/9-14 | 多個 bug report 和請願要求恢復（#45525、#45595、#45610） |

### 社群的獨立版本

`/buddy` 被移除後，社群不但沒有散去，反而做出了一整個生態系。以下是主要的獨立實作：

**進化 / 養成系統：**

| 專案 | 作者 | 特色 |
|------|------|------|
| [FrankFMY/buddy-evolution](https://github.com/FrankFMY/buddy-evolution) | FrankFMY | **參考實作**，34 個成就、性格系統、情緒系統、零依賴 |
| [Hegemon78/buddy-evolution](https://github.com/Hegemon78/buddy-evolution) | Hegemon78 | 完整角色系統：10 種情緒、12 種性格、36 種進化形態、15 種道具、291 個測試 |
| [Hegemon78/buddy-evolution-spec](https://github.com/Hegemon78/buddy-evolution-spec) | Hegemon78 | **社群規格書**（9 stars），協調各實作的標準，FrankFMY 為 Core Contributor |
| [yazelin/buddy-evolution](https://github.com/yazelin/buddy-evolution) | 我 | Plugin + Web 平台（排行榜、雷達圖、成就、比較） |
| [RaphaelRUzan/buddy-evolution](https://github.com/RaphaelRUzan/buddy-evolution) | RaphaelRUzan | 最初的 PoC，定義了 XP 引擎和 5 階進化 |

**其他玩法：**

| 專案 | 作者 | 特色 |
|------|------|------|
| [KKenny0/claude-buddy](https://github.com/KKenny0/claude-buddy) | KKenny0 | tmux 側邊欄即時 ASCII 寵物（4 stars） |
| [Tucuxi-Inc/SmartBuddy](https://github.com/Tucuxi-Inc/SmartBuddy) | Kevin-Tucuxi | RNN 神經網路驅動的性格演化 |
| [NBS1997/ClaudeBuddy](https://github.com/NBS1997/ClaudeBuddy) | NBS1997 | 終端機電子雞 + MCP 整合 |

**保存 / 自訂工具：**

社群甚至做了各種「保留你的 buddy」的工具 — 暴力破解 salt 來重抽稀有度、修改 binary 自訂外觀、用 Web Worker 多線程計算理想 buddy ID。一個愚人節彩蛋，催生了十幾個開源專案。

---

## 參考資源

- [buddy-evolution — GitHub Repository](https://github.com/yazelin/buddy-evolution)
- [RaphaelRUzan/buddy-evolution — 原始 PoC 設計](https://github.com/RaphaelRUzan/buddy-evolution)
- [FrankFMY/buddy-evolution — 獨立版參考實作](https://github.com/FrankFMY/buddy-evolution)
- [Hegemon78/buddy-evolution-spec — 社群規格書](https://github.com/Hegemon78/buddy-evolution-spec)
- [GitHub Issue #41684 — /buddy 功能討論](https://github.com/anthropics/claude-code/issues/41684)
- [Anthropic 官方確認為愚人節彩蛋](https://github.com/anthropics/claude-code/issues/41684#issuecomment-4172557121)
- [Claude Code Changelog](https://code.claude.com/docs/en/changelog)
