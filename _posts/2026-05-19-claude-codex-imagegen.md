---
layout: post
title: "把 Codex 的 \\$imagegen 包成 Claude Code skill：用訂閱額度生圖、順便補完 26 篇 blog 缺圖"
subtitle: "從 \\$imagegen 一隻小貓貓開始，到批次處理、踩過 bwrap sandbox + codex exec 吃 stdin 兩個坑，最後變成可分享的 skill repo + GitHub Pages"
date: 2026-05-19
categories: [AI]
tags: [Claude Code, Codex CLI, Image Generation, OpenAI, ChatGPT, Skill, GitHub Pages, Shell Script, Vibe Coding]
---

![codex-imagegen-skill cover](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-05-19-claude-codex-imagegen.png)

> **🔗 快速連結**
> - 💻 **Skill GitHub**：[yazelin/codex-imagegen-skill](https://github.com/yazelin/codex-imagegen-skill)
> - 🌐 **Skill 介紹頁**：[yazelin.github.io/codex-imagegen-skill](https://yazelin.github.io/codex-imagegen-skill/)
> - 📦 **一行安裝**：`git clone https://github.com/yazelin/codex-imagegen-skill ~/.claude/skills/codex-imagegen`

---

## 起源：我已經有 ChatGPT 訂閱了，為什麼還要付 API 錢？

事情是這樣開始的。我在 Codex CLI 裡很自然地打了一行：

```
> $imagegen 一隻小貓貓
```

它就真的生了一張小貓給我。可愛。然後我就想——

**「等等，我每個月已經在付 ChatGPT 訂閱了，這張圖是吃訂閱額度生出來的對吧？那如果我能把這個流程從 TUI 拉到 CLI、再從 CLI 包進 Claude Code 的 skill，是不是就等於免費生圖？」**

別誤會，「免費」是相對的——我已經為訂閱付錢了，這只是讓那筆錢多撈一點價值。但比起再去申請 OpenAI API key、每張圖 $0.04–0.19 額外計費，差別實在。

這篇就是把這個想法走完的紀錄。

## 第一個問題：`$imagegen` 在非互動模式下能用嗎

互動式 TUI 裡用 `$imagegen` 是顯而易見的，但能不能 `codex exec` 一條命令打進去？

```bash
codex exec -C "$(pwd)" -s workspace-write --skip-git-repo-check \
  '$imagegen 一隻小貓貓，存成 ./images/cat.png'
```

跑下去確實會觸發 image generation，**但有兩個跟我預期不一樣的地方**：

1. **「存成 ./images/cat.png」的指令沒有被遵守**。圖片實際被存到 codex 預設位置 `~/.codex/generated_images/<session-id>/ig_*.png`，因為 imagegen 工具本身有自己的輸出邏輯。
2. **codex 嘗試用 shell `cp` 把檔案搬到指定位置時，被它自己的 bubblewrap sandbox 擋住**：

   ```
   bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
   ```

   在巢狀 Linux 環境（我這台跑 Docker 之類的）很容易踩到。

所以結論是：`$imagegen` 在 `codex exec` 下**會被觸發**，但**「在 prompt 裡指定存檔路徑」這招對它無效**——你拿到的是 codex 預設位置的檔案，要不要搬要自己決定。

## 設計：skill 自己負責搬檔，不交給 codex

既然 codex 的 bwrap sandbox 在我這台會擋 shell 操作，那索性繞過去：**讓 codex 只負責生圖，搬檔由外部 shell 做**。

```bash
#!/usr/bin/env bash
set -euo pipefail
PROMPT="${1:?usage: ... <prompt> <target>}"
TARGET="${2:?usage: ... <prompt> <target>}"

OUT=$(codex exec -C "$(pwd)" -s workspace-write --skip-git-repo-check \
        "\$imagegen $PROMPT" 2>&1)

SID=$(printf '%s\n' "$OUT" | grep -oE 'session id: [a-f0-9-]+' | awk '{print $3}')
SRC=$(ls -t "$HOME/.codex/generated_images/$SID"/*.png | head -1)
cp "$SRC" "$TARGET"
realpath "$TARGET"
```

關鍵：

- 從 codex 的 stdout 撈 `session id: <uuid>` 就能找到圖的位置
- `cp` 是在外部 shell 跑，不關 codex sandbox 的事
- 最後印出絕對路徑，讓呼叫者方便接後續流程

打一張柴犬戴紅領結驗證：

```
$ ./codex-imagegen.sh "a tiny shiba inu with a red bow tie, watercolor, no text" ./shiba.png
/home/ct/shiba.png
```

成功。

## 真正的應用場景：補完 blog 26 篇缺圖

工具做出來了，總得有個實際應用。剛好我注意到 [yazelin.github.io](https://yazelin.github.io) 的**近期文章幾乎都沒配 cover image**——掃描下來總共 **167 篇文章，26 篇缺圖**，全部集中在 2026 Q1-Q2。

batch 起來。

### Phase 1：摸風格

我之前的 cover image 有滿一致的視覺風格——pastel 漸層背景、扁平 + 輕 3D、圓角科技 icon、低飽和配色。先下載幾張舊圖讓 Claude 看，萃取出一段可重用的 style template：

```
Wide landscape blog cover illustration, approximately 2:1 aspect ratio.
Style: flat illustration with subtle 3D depth, soft gradients within objects,
gentle drop shadows. Color palette: soft pastels — periwinkle blue, sage green,
coral pink, warm cream, muted lavender, mint. Background: very light pastel
gradient. No text, no letters, no watermark, no human figures, no logos.
Clean, minimal, calm.
```

然後挑一篇最新的「AI 塔羅心靈陪伴站」試打第一張看看風格對不對。

![試打的第一張](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-30-ai-tarot-companion.png)

OK 啦，雖然玻璃感比舊圖重一點，但整體屬於同一個視覺語言。風格定了，可以批次。

### Phase 2：寫 manifest

每篇要有自己的概念描述（plus 共用 style）。寫成 TSV：

```
2026-04-30-ai-tarot-companion	Composition: a friendly rounded chat speech bubble ...
2026-04-28-line-sticker-studio	Composition: a single cute illustrated character ...
2026-04-24-forest-summoner-workshop	Composition: a stylized magical forest scene ...
...
```

26 行，每行 `<slug>\t<concept>`。批次腳本讀這個檔，串上 style template 後丟給 `codex-imagegen.sh`。

### Phase 3：踩到 codex exec 吃 stdin 的雷

第一次跑批次，只跑了**第一張**就停了。檢查 log：

```
[0] START: 2026-04-30-ai-tarot-companion
[0] OK (58 s, 1377484 bytes): 2026-04-30-ai-tarot-companion
=== DONE: ok=1 fail=0 ===
```

——什麼，剩下 25 行去哪了？

挖了一下原因：`codex exec` 會讀 stdin（它的訊息 `Reading additional input from stdin...`），而我用的是

```bash
while IFS=$'\t' read -r slug concept; do
  "$SCRIPT" "$prompt" "$target"
done < "$MANIFEST"
```

這種寫法。在這結構裡，子進程 codex 會直接從 while loop 的 file descriptor 讀 stdin，**把剩下 25 行 manifest 都吞光**，loop 自然就結束了。

修法一行：

```bash
"$SCRIPT" "$prompt" "$target" </dev/null
```

把子進程的 stdin 接到 `/dev/null`，codex 想吃也沒得吃。

### Phase 4：26/26 成功

重跑：

```
[1] START: 2026-04-28-line-sticker-studio
[1] OK (65 s, 1766423 bytes): 2026-04-28-line-sticker-studio
[2] START: 2026-04-24-forest-summoner-workshop
[2] OK (54 s, 1600929 bytes): 2026-04-24-forest-summoner-workshop
...
[25] OK (49 s, 1364236 bytes): 2026-02-04-shorturl-worker-cors-proxy
=== DONE: ok=26 fail=0 ===
```

平均 50 秒一張，總共大概 22 分鐘跑完 26 張。風格在所有題材上都站得住——從 SSH 教學、Telegram bot、AI 論文解析、訪談紀錄到奇幻工坊，全部有一致的視覺語言。

### Phase 5：上傳 + 改 frontmatter + push

剩下都是雜活：

```bash
# 1. 上傳到 GitHub release (我 blog 的 cover image CDN)
gh release upload blog-images images/*.png -R yazelin/yazelin.github.io --clobber

# 2. 在每篇 post 的 frontmatter 後插入 cover 行
python3 insert_covers.py   # 26 篇全自動

# 3. commit + push
git add _posts/*.md
git commit -m "post: 補上 2026 Q1-Q2 文章的 cover image (26 篇)"
git push origin master
```

幾分鐘後 GitHub Pages 重建完成，26 篇文章的 cover 全部上線。

## 順便：把這個流程包成可分享的 Claude Code skill

工具自己用很順了，但我發現 `~/.claude/skills/` 那個位置就是 Claude Code 的 skill 機制。把這個流程包成 skill，未來任何 Claude Code session 都能直接呼叫：

```
~/.claude/skills/codex-imagegen/
├── SKILL.md          ← Claude 讀的觸發 + 用法
├── codex-imagegen.sh ← 實際的 wrapper
├── README.md         ← 給人類看的 install 指南
├── index.html        ← GitHub Pages landing
├── examples/         ← 示意圖
└── LICENSE           ← MIT
```

關鍵是 `SKILL.md`——它的 frontmatter `name` 和 `description` 決定 Claude 何時會主動觸發這個 skill：

```yaml
---
name: codex-imagegen
description: Generate images via Codex CLI's $imagegen shorthand, using the
  user's ChatGPT subscription quota instead of OpenAI Images API credits.
  Use when the user wants to generate one or more PNG images from text
  prompts, has Codex CLI installed and logged in, and the use case is
  personal/local (not a production backend serving end users).
---
```

寫得越具體，Claude 越能判斷該不該用這個 skill。

把整個資料夾推到 GitHub，順手做了一個 GitHub Pages 著陸頁讓人類看起來不要那麼乾。

Repo：[yazelin/codex-imagegen-skill](https://github.com/yazelin/codex-imagegen-skill)
Pages：[yazelin.github.io/codex-imagegen-skill](https://yazelin.github.io/codex-imagegen-skill/)

安裝方式一行：

```bash
git clone https://github.com/yazelin/codex-imagegen-skill ~/.claude/skills/codex-imagegen
```

下一次 Claude Code 啟動，這個 skill 就在了。

## `$imagegen` 是什麼時候進到 Codex CLI 的？

順手挖一下時間線：

| 日期 | 事件 |
|------|------|
| 2026-01-05 | Issue [#8758](https://github.com/openai/codex/issues/8758)「Image generation from codex」被開出來 |
| 2026-03-24 | PR [#15600](https://github.com/openai/codex/pull/15600)「move imagegen skill into system skills」合併，正式變成 built-in skill |
| **2026-03-26** | **Codex CLI `v0.117.0`** 釋出，第一個 stable 版本包含 `$imagegen` |
| 2026-04-22 | PR [#18852](https://github.com/openai/codex/pull/18852) 升級到 ImageGen 2（`gpt-image-2`） |
| **2026-04-23** | **`v0.123.0`** 釋出，`gpt-image-2` 變預設 |

所以從 v0.117.0 起這個功能就在，到 v0.123.0 換了底層模型。要跑這個 skill 至少需要 v0.123.0，越新越好：

```bash
codex --version
npm i -g @openai/codex   # 更新
```

## 不用 skill 也想直接用 codex 生圖怎麼辦

最少設定的版本——你只要有 Codex CLI 登入過：

**互動式**（TUI 裡）：

```
codex
> $imagegen a tiny shiba inu wearing a red bow tie, watercolor, no text
```

**非互動式**（一行從 shell）：

```bash
codex exec -C "$(pwd)" -s workspace-write --skip-git-repo-check \
  '$imagegen a tiny shiba inu wearing a red bow tie, watercolor, no text'
```

圖落在 `~/.codex/generated_images/<session-id>/ig_*.png`，自己 `cp` 出來。skill 存在的意義就是把這幾步自動化加上錯誤處理，順便給 Claude 一個可觸發的 entry point。

## 這個 skill 對誰有用 / 對誰不適合

**適合**：

- 個人開發者、寫部落格、做簡報插圖、prototype mockup
- 已經有 ChatGPT 訂閱、不想再為 image API 付一筆
- 偶發、低頻、不需要 production 穩定性

**不適合**：

- production backend 服務終端使用者（LINE bot、web app 之類）
- 高頻批次（用一用會撞訂閱配額）
- 自動化 pipeline 需要嚴格 SLA

我前面有寫過 [ctos-lite]({% post_url 2026-03-31-ctos-lite %}) 這個 LINE bot AI 助理，那種架構**不適合**走這條路——他服務的是終端使用者，每次 image 需求都用我個人訂閱去打 codex，本質上是違反訂閱條款精神的。production 還是該乖乖用 OpenAI Images API + 真正的 API key。

但 yazelin.github.io 補 cover image 這種**一次性、個人用、可重跑**的場景，這個 skill 就是甜蜜點。

## Takeaways

1. **Codex CLI 的 `$imagegen` 在 `codex exec` 模式下完全可用**——OpenAI 沒把它鎖在 TUI 裡，是個有意打開的 API surface。
2. **不要讓 codex 在它自己 sandbox 裡搬檔**——讓 host shell 做這件事，Linux/macOS/WSL 都比較穩。
3. **批次 codex 子進程要把 stdin 導到 /dev/null**——不然 codex 會吞掉你的 manifest。
4. **Claude Code skill 機制很適合包個人開發工具**——`~/.claude/skills/<name>/SKILL.md` 就是 entry point，未來所有 Claude session 都能用。
5. **個人訂閱額度 ≠ 生產 API**——技術上做得到、條款上不該做的事，要分清楚。

整個流程從「咦這能不能 script」到「可分享的 repo + Pages + blog 補完 26 張圖」，大概一個下午。`vibe coding` 真不錯。

---

如果你也用 Claude Code + Codex CLI，這個 skill 歡迎拿去玩：[github.com/yazelin/codex-imagegen-skill](https://github.com/yazelin/codex-imagegen-skill)。覺得有用的話幫我點個星 ⭐，或在 issue 區告訴我你拿來幹嘛了。
