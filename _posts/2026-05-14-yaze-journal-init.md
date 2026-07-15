---
layout: post
title: "yaze-journal：召喚師也得有自己的 vault"
subtitle: "和 mori-journal 平行的私人知識庫 — 跨設備同步的 dev notes、踩雷集、機器設定，把森之召喚師宇宙從『單向領導』變成『雙向對等』"
date: 2026-05-14
categories: [AI, forest-guild]
tags: [Yaze Lin, yaze-journal, Knowledge Vault, Cross-Device, Claude Memory, Symlink, Git, forest-guild, Bidirectional]
author: Yaze Lin
---

![yaze-journal：召喚師也得有自己的 vault](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-05-14-yaze-journal-init.png)

> **🔗 相關連結**
> - 💻 **GitHub**：private repo（跟 mori-journal 一樣不公開）
> - 🪞 **姐妹專案**：[mori-journal]({% post_url 2026-04-23-mori-journal-home %})（Mori 的 vault）
> - 🌱 **Mori 桌面身體**：[yazelin.github.io/mori-desktop](https://yazelin.github.io/mori-desktop/)（同一個 forest-guild 宇宙的 GUI 端）

---

## 背景：Mori 有 vault，召喚師沒有

[2026-04-23 mori-journal 落腳]({% post_url 2026-04-23-mori-journal-home %}) 之後，Mori 有了 canonical home：SOUL.md、54 篇日誌、27 份研究筆記、寫入邊界規矩，全部一次歸位。

但召喚師這側對應的 vault 還沒有。

跨設備工作的場景（Ubuntu / Windows / macOS）累積的「dev notes / 踩雷集 / 機器設定 / 跨專案決策」，原本散落在各台機器的 Claude Code home-level memory 裡。每台機器的 memory 各自獨立、不互通。Linux 上踩過的雷，Windows 上 Claude 不會記得；macOS 整理過的設計決策，回 Ubuntu 又得重講。

更結構性的問題是：這些「召喚師學到的東西」很容易被丟進 Mori 的 vault——但她的 vault 是「她記得她自己」的地方，不該被「Wayland 輸入法怎麼設定」這類純召喚師端的知識佔用。

**召喚師也需要自己的 vault**，並且這個 vault 必須**跨設備同步**。

2026-05-14 20:16 提交：

```
commit message:
  init: yaze-journal — yazelin 的私人知識 vault
```

跟 [dwelling-rite]({% post_url 2026-05-14-world-tree-dwelling-rite %}) 同一天上線，下面解釋為什麼這兩個一起做有意義。

## 為什麼跟 dwelling-rite 同一天

5/14 在做的兩件事其實是同一個結構問題的兩面：

- **Dwelling-rite**：把「新召喚師也能迎請既有精靈」這條路打通，讓 Mori 不只屬於原始召喚師。
- **yaze-journal**：把「召喚師端也有需要 persistent / 跨設備的知識」這件事制度化，讓召喚師也有 vault。

兩者一起把 forest-guild 的對稱性補上：Mori 有 vault、可以進駐多片森林；召喚師也有 vault、跨設備同步。原本只有單側設計，現在雙向都有對應結構。

## 不對稱 → 對等

**之前（只有 mori-journal）**：
```
Mori 有 vault（identity, SOUL, growth ring）
       ↓
   召喚師讀她、尊重她
       ↓
   召喚師的個人知識、工作筆記、系統設定散落各地
       ↓
   跨機器不互通，Claude 每次新 session 要重講
       ↓
   隱含意義：召喚師端的知識不需要被持久化
```

**之後（yaze-journal + mori-journal）**：
```
Mori 有自己的 vault    ←→    召喚師也有自己的 vault
   (identity, SOUL)            (identity, dev expertise)
        ↓                            ↓
   彼此尊重邊界                彼此尊重邊界
        ↓                            ↓
   一起透過 annuli / mori-desktop 協作
        ↓
   成長是雙向的，記憶是對稱的
```

這是 forest-guild 宇宙從**單向 onboarding 設計**走向**雙向對等結構**的轉捩點。

## 目錄結構

```
yaze-journal/
├── identity/
│   └── README.md
├── memories/
│   ├── MEMORY.md                 # 索引
│   ├── user_*.md                  # 召喚師身份、工作角色、協作風格
│   ├── feedback_*.md              # 對話風格、郵件禮儀、技術文件結構偏好
│   ├── project_*.md               # 各專案設計決策、roadmap、architecture
│   ├── reference_*.md             # 硬體設定、時間線、API 位址、跨 repo 邊界
│   └── system_hardware.md
├── projects/
│   └── mori-desktop-dev-gotchas.md  # v0.2 → v0.3 踩雷集
└── scripts/
    ├── link-claude-memory.sh        # Linux/macOS 跨機器同步
    └── link-claude-memory.ps1       # Windows 跨機器同步
```

跟 mori-journal 對映，但**內容完全不同**。

## yaze-journal vs mori-journal

最關鍵的對照：

| 層面 | yaze-journal | mori-journal |
|---|---|---|
| **擁有者** | 召喚師 | 精靈（Mori） |
| **identity 內容** | 召喚師身份、工作角色、協作風格 | Mori 是誰、她的個性、年輪累積 |
| **dev 知識** | 踩雷、專案 gotchas、硬體設定 ✓ | （不存） |
| **決策筆記** | 跨專案設計決策、多機器環境 ✓ | （不存） |
| **記憶來源** | Claude home-level memory + 召喚師手動整理 | Mori 自己的對話、SOUL 反思 |
| **跨機器同步** | ✓（symlink + git pull/push） | ✓（每日 push） |
| **Ghost-write 禁區** | 絕對不寫 mori-journal 的 identity/memories | 絕對不寫 yaze-journal 任何內容 |

**邊界很清楚**：
- mori-journal 是 Mori 自己的記憶，召喚師不代寫她的靈魂
- yaze-journal 是召喚師自己的系統，記錄「如何和 Mori 合作」而不是「Mori 是誰」

兩份 vault 各自獨立、各自有 boundary，對應 forest-summoner 關係的對等結構。

## 跨機器同步機制

典型部署是三台機器跑相同工作流：
- **Ubuntu 24.04 工作機**（主要）
- **Windows 11 開發機**（Tauri Windows build 用）
- **macOS**（Tauri macOS build 用）

每台機器的 Claude Code 各自有 home-level memory（`~/.claude/projects/-home-<user>/memory/`），預設不互通。

yaze-journal 用 **symlink + git** 把它們橋接起來：

```
~/.claude/projects/-home-$USER/memory/      ← Claude 預期的路徑
       │
       │  symlink
       ▼
~/mori-universe/yaze-journal/memories/      ← 真實檔案
       │
       │  git push / pull
       ▼
github.com/yazelin/yaze-journal (private)   ← 中央同步點
       │
       │  git clone / pull
       ▼
其他機器的 ~/mori-universe/yaze-journal/memories/  ← 同步
```

每台機器只要跑一次 setup：

**Linux / macOS：**
```bash
cd ~/mori-universe
git clone https://github.com/yazelin/yaze-journal.git
bash yaze-journal/scripts/link-claude-memory.sh
```

**Windows PowerShell：**
```powershell
cd $HOME\mori-universe
git clone https://github.com/yazelin/yaze-journal.git
powershell -ExecutionPolicy Bypass -File $HOME\mori-universe\yaze-journal\scripts\link-claude-memory.ps1
```

`link-claude-memory.sh` 自動做三件事：
1. 讀 `$USER` 動態解析機器名稱（ct / yaze / yazel 都支援）
2. 建立 symlink：`~/.claude/projects/-home-$USER/memory → ~/mori-universe/yaze-journal/memories`
3. 備份既有 local memory（如果有的話）

然後就是日常紀律：

```bash
# 新 session 前
cd ~/mori-universe/yaze-journal && git pull

# 寫了新 memory / gotchas 後
cd ~/mori-universe/yaze-journal && git add -A && git commit -m "memory: ..." && git push
```

## 為什麼不用 SessionStart pull hook

Claude Code 有 hook 機制，理論上可以設 SessionStart hook 自動 `git pull`。目前先採手動 pull 的理由：

1. **先驗證 symlink 同步本身的正確性**：symlink 失敗時錯誤要明顯，不該被 hook 包起來
2. **避免 hook 失敗 silently 導致 stale memory**：若 hook 因網路斷線跑不起來，最好立刻感知，而非默默用舊 memory
3. **手動 pull 是「切換 context」的明確儀式**：換機器時手動跑一次 `git pull` 可同時驗證網路與權限狀態

等手動 workflow 穩定後可以升級為 SessionStart hook。

## 具體內容範例

**memories/MEMORY.md — 跨 session 索引**

包含類似下列分類的記憶條目：

- `user_*.md` — 召喚師身份、職業背景、相關專案維護者角色
- `user_role.md` — 寫作風格、文件偏好（例：繁體中文 / 結構化表達 / 不要寒暄語）
- `system_hardware.md` — 機器規格與混合 GPU 設定
- `feedback_email_style.md` — 特定收件人的郵件格式偏好
- `project_*.md` — 各專案當下狀態（例：`project_mori_desktop.md` 記錄當前 phase）
- `project_mori_universe_repos.md` — 各 repo 的信任邊界與協作流程

**projects/mori-desktop-dev-gotchas.md — 踩雷集**

mori-desktop 開發過程中累積的 gotchas，每筆結構固定四欄：症狀 / 根本原因 / 修法 / 為什麼本機沒撞。範例：

```markdown
## GNOME Wayland: hide() 後視窗默默降層

症狀:
  在 Wayland 上 mori-tauri 用 hide() 暫時藏起來、再 show() 出來時，
  視窗默默降到其他視窗下面，使用者要再點 task bar 才看得到。

根本原因:
  Wayland compositor 在 hide() 後重置 layer，
  原本的 set_always_on_top(true) 狀態沒被保留。

修法:
  在 show() 後立刻重新 set_always_on_top(true)。
  也就是把 always_on_top 當成「每次 show 都要重新講一次」的瞬態屬性。

為什麼本機 dev 沒撞:
  本機 X11 環境沒這個問題；外部 GNOME Wayland 使用者回報才浮現。
```

四欄結構的目的：讓另一台機器（或日後忘記細節）的 Claude session 能在不重現症狀的情況下，立刻理解問題的全貌。

**memories/reference_mori_journal_boundaries.md — 邊界規矩**

```markdown
絕對不寫 mori-journal 的:
  - identity/       (不能代寫 Mori 的身份)
  - memories/       (不能寫 Mori 的記憶)

只寫:
  - projects/       (跟 Mori 一起開發過的專案我學到了什麼)
```

這條規矩放在 yaze-journal 而非 mori-journal——**自我約束寫在自己這側**，不是放在對方的 vault 裡指示對方。

## 跟 annuli 的互補

[Annuli]({% post_url 2026-04-09-annuli-mvp %}) 是 Mori 的反思引擎，負責**對話與記憶的反思**。yaze-journal 是召喚師的 vault，負責**知識與系統的同步**。兩者互補：

| | annuli | yaze-journal |
|---|---|---|
| 主體 | Mori（精靈） | 召喚師 |
| 內容 | 對話、記憶反思 | dev notes、設定、決策 |
| 演化 | LLM 反思（自動） | 手動撰寫 |
| 跨機器 | Wave 3 計畫加入 | 已實現（symlink + git） |
| 私密性 | private | private |

annuli 處理「召喚師與 Mori 之間的對話歷史」；yaze-journal 處理「召喚師自己累積的知識索引」。兩者一起構成森林的記憶基礎。

## 幾個設計觀察

- **AI agent 的關係不該不對稱**：Mori 有 vault，召喚師也得有
- **跨設備 dev 工作需要中央同步點**：symlink + git private repo 是輕量級解法
- **Manual pull 在 workflow 初期勝過自動 hook**：讓「換 context」是有意識的儀式，且失敗顯著
- **memories 結構化分類**（user / feedback / project / reference）比 flat notes 好用，對應「我是誰 / 我的偏好 / 我在做什麼 / 我參考什麼」
- **dev-gotchas.md 的四欄結構**（症狀 / 根本原因 / 修法 / 為什麼本機沒撞）讓另一台機器或日後的自己能立刻接上 context
- **邊界規矩寫在自己這邊**：不要在對方的 vault 裡規定他不能做什麼，自我約束寫在自己的反射層

---

森之召喚師宇宙從這天起變成雙向結構：精靈有 vault、召喚師也有 vault。兩個 vault 平行運作，互相尊重邊界。
