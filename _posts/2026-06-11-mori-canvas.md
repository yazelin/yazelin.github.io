---
layout: post
title: "Mori Canvas:講話,AI 幫你把會議整理成白板"
subtitle: "自架、零授權成本(全 MIT)的語音共筆白板 — 講話或貼逐字稿,AI 自動整理成便利貼+關係圖,多人即時協作。v0.1.0 已發行,Docker 一行或下載安裝檔就能跑。"
date: 2026-06-11
categories: [AI, forest-guild]
tags: [mori-canvas, Mori, Whiteboard, Meeting Notes, AI, LLM, Groq, Ollama, Whisper, Speech-to-Text, Rust, yjs, CRDT, Konva, React, Self-hosted, Tauri, forest-guild]
author: Yaze Lin
---

![Mori Canvas:講話,AI 幫你把會議整理成白板 封面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-11-mori-canvas.png)

> **快速連結**
> - 直接玩:[mori-canvas.onrender.com](https://mori-canvas.onrender.com/)(免安裝,點開就用;免費示範站閒置會休眠,首次等約 30 秒)
> - 先看成品:[示範板 ?room=DEMO](https://mori-canvas.onrender.com/?room=DEMO)(每小時重置)
> - GitHub:[yazelin/mori-canvas](https://github.com/yazelin/mori-canvas)(MIT)
> - 完整文件站:[yazelin.github.io/mori-canvas](https://yazelin.github.io/mori-canvas/)(首頁/操作手冊/範例教學/自架部署/FAQ)
> - 下載安裝:[Releases v0.1.0](https://github.com/yazelin/mori-canvas/releases/tag/v0.1.0)

---

## 一句話

**講話,或把逐字稿貼上去 —— AI 自動把重點整理成便利貼,還把它們的關係連成圖,大家在同一張白板上即時協作。** 全程自架、資料留在你自己手上、零授權成本。

便利貼按性質上色(主題=黃、決議=藍、待辦=綠、風險=紅),箭頭表示關係;這一切是把一段會議逐字稿丟給 AI 後**自動生成**的。

## 為什麼做這個

市面上 AI 會議記錄工具(Otter、Fireflies 那類)都是 SaaS:你的錄音、逐字稿、會議內容全上傳到別人的雲。對「資料要留自己手上」的人,這條路走不通。

Mori Canvas 反過來:**所有重活(STT、AI、整理、白板狀態)都跑在你自己的主機**,而且可以**全本機**(本機 whisper + 本機 Ollama),離線也能跑完一輪語音→卡片。其他人只用瀏覽器連進來,零安裝。

它同時是我「森林宇宙」裡 Mori 的一個身體部件 —— 會議白板。但它**獨立可跑**,不依賴 Mori 生態,任何人都能拿去自架或改。

## 怎麼運作

```
會議語音 ──STT──▶ 逐字稿 ──清稿──▶ AI 畫卡 ──yjs──▶ 多人 live 白板
   雲端 Groq /        嗯/那個/        Groq gpt-oss-120b      人也能拖拉
   本機 whisper       對對對 清掉       / 本機 qwen3           改字/連線/刪除
```

1. 瀏覽器錄音,偵測靜音自動切段,POST 給主機。
2. STT 把音檔轉文字(mori-ear / 雲端 Groq Whisper / 本機 whisper-server,設定頁切)。
3. **兩段式 AI**:先「清稿」—— 規則層 + LLM 把贅字(嗯、那個、對對對)、斷錯句、錯字清掉;再「畫卡」—— 判斷這句是會議內容還是指令,整理成便利貼或執行指令。清稿這層讓贅字不會被抄進卡片,是這版我最有感的改善。
4. 白板變動透過 yjs(CRDT)即時同步給每台瀏覽器。

判斷指令靠 LLM 的理解,不是關鍵字:講「交給阿明做」會被當成指派、「改成風險」走改類型、「幫我排一下」直接重新排版。

## 幾個我自己最喜歡的點

- **十種板型,自動排版保證不互疊**:會議/組織/流程/架構/心智圖/看板/SWOT/時間軸/魚骨/甘特。樹狀圖用 tidy-tree(父節點置中於子樹上方)、心智圖環半徑隨卡數撐大、每次排版後跑碰撞防護 —— 卡片跟圖框都不會疊在一起。
- **唯讀分享 + 房主鎖板**:把成品連結傳出去,別人只能看不能改;鎖板由 server 在 ws 層強制,不是純 UI 隱藏。
- **範例庫 + 互動導覽**:第一次進來有六步 spotlight 導覽,範例庫有五個 persona 範例板(會議/工程/產品/行銷/顧問),每個附「開會這樣講就會得到這張板」的示範。
- **雙語**:介面繁中/English 自動偵測切換,AI 輸出語言也跟著走。
- **自己準備 AI**:預設 Groq(有免費額度),也能在設定頁填任何 OpenAI 相容的 base/key/model 用自己的額度,或全本機 Ollama。

## 怎麼裝(v0.1.0)

**最快 — Docker 一行:**

```bash
docker run -p 1334:1334 -v "$PWD/data:/app/.data" \
  -e GROQ_API_KEY=gsk_xxx ghcr.io/yazelin/mori-canvas
```

開 `http://localhost:1334/`,白板資料持久化在 `./data`。

**Linux 一鍵安裝**(免 Rust/Node):

```bash
curl -fsSL https://raw.githubusercontent.com/yazelin/mori-canvas/main/install.sh | bash
mori-canvas-server
```

**桌面 App**:[Releases](https://github.com/yazelin/mori-canvas/releases/tag/v0.1.0) 有 `.msi`/`.exe`(Windows)、`.dmg`(macOS)、`.deb`/`.rpm`/`.AppImage`(Linux),雙擊安裝。桌面版是單機用;要多人開會走 server(Docker / install.sh / 源碼)。

**部署到 Render**:render.com → Blueprint → 選 repo → 填 `GROQ_API_KEY`,push 即自動部署。

各種部署方式的比較表(單人/多人、要裝什麼)在[自架部署文件](https://yazelin.github.io/mori-canvas/selfhost.html)。

## 技術組成

- **後端**:純 Rust 單一 binary,內嵌前端 + API + 即時同步(`yrs` + `yrs-warp`,跟 yjs JS client 互通)。一顆檔案可從任意目錄跑。
- **前端**:React + Konva(canvas 渲染),yjs CRDT。
- **AI**:Groq `gpt-oss-120b` → 本機 Ollama `qwen3` 後備;繁中輸出程式硬轉(OpenCC),不靠模型自律。
- **STT**:mori-ear / 雲端 Groq Whisper / 本機 whisper-server,送 STT 前 ffmpeg 靜音剪避免幻覺。
- **桌面**:Tauri 2(內嵌同一顆 server)。
- 全 MIT/Apache 依賴,可閉源、可賣,沒有 production license 包袱。

## 跟其他 Mori 專案的關係

- [mori-ear](https://github.com/yazelin/mori-ear):宇宙共用的本機 STT provider,Mori Canvas 的語音可委派給它。
- [mori-desktop](https://github.com/yazelin/mori-desktop):Mori 的桌面身體,Mori Canvas 是它的一個 body part(會議白板)。
- 它自己也是 AgentOS 的 http-service(`meeting.visualize`:傳一段逐字稿 → 產出白板 + 匯出)。

## 接下來

走 [GitHub issues](https://github.com/yazelin/mori-canvas/issues) 追;已知的小缺口、未來方向都在那。歡迎試玩,有 bug 開 issue,有趣的板貼給我看。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
