---
layout: post
title: "mori-meeting-recorder:一場會議,錄成兩份不同的記錄"
subtitle: "雙軌會議錄音 — 系統軌(會議裡所有人,含客戶)+ 麥克風軌(我方私下討論),停止後 whisper.cpp 雙軌轉錄,匯出一份給客戶的 public 記錄、一份含內部評估的 internal 記錄。Mori 的會議身體部件。"
date: 2026-06-04
categories: [AI, forest-guild]
tags: [mori-meeting-recorder, Mori, Meeting Notes, Whisper, whisper.cpp, Speech-to-Text, Groq, Ollama, Tauri, Rust, Dual-track, Self-hosted, forest-guild]
author: Yaze Lin
---

![mori-meeting-recorder:一場會議,錄成兩份不同的記錄 封面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-04-mori-meeting-recorder.png)

> **快速連結**
> - GitHub:[yazelin/mori-meeting-recorder](https://github.com/yazelin/mori-meeting-recorder)
> - 完整介紹 / 安裝手冊:[Pages 文件站](https://yazelin.github.io/mori-meeting-recorder/)
> - 下載安裝:[Releases](https://github.com/yazelin/mori-meeting-recorder/releases)
> - 姐妹專案:[mori-canvas]({% post_url 2026-06-11-mori-canvas %})(同樣是會議主題,但把逐字稿畫成白板)

---

## 一個會議,為什麼要兩份記錄

線上跟客戶開會時,你其實同時在兩個對話裡:

1. **會議軟體裡大家都聽得到的**(你、客戶、所有與會者)—— 這是會議「真正達成的結果」。
2. **我方這邊私下的討論**(同事在旁邊小聲講「這個報價會虧」「先答應之後再說」)—— 這是決議背後的「評估與理由」。

一般的會議錄音工具只錄第一種。mori-meeting-recorder **同時錄兩軌**:

- **系統軌(meeting_system)**:會議軟體的系統輸出 = 所有人的聲音。
- **麥克風軌(mic_internal)**:你這台機器的本機麥克風 = 我方私下那條。

停止後,whisper.cpp **雙軌平行轉錄**,然後依「可見性」匯出兩份:

- **`meeting.public.md`**:只有系統軌 = 乾淨的、可以直接給客戶的會議記錄(只記結果)。
- **`meeting.internal.md`**:兩軌都有 = 客戶看不到的版本,每個決議底下還附上「我方私下討論的評估依據」。

一場會議,錄一次,得到兩份立場不同的記錄。這個 public / internal 的拆分是這個工具的核心,也是市面上 SaaS 會議工具給不了的 —— 因為你的私下討論你不會想上傳到別人的雲。

## 摘要也是兩份

轉錄完不只給逐字稿,還跑摘要:**Groq `gpt-oss-120b` 為主、連不到就 fallback 本機 Ollama**,產出 `meeting.summary.public.md`(給客戶:主題/需求/決議/我方承諾)與 `meeting.summary.internal.md`(多一段「內部評估與決議依據」)。

摘要有嚴格的「不准編造」規則 —— 待辦只列逐字稿明確說要做的、沒達成決議就寫「無」,絕不腦補。會議記錄最怕的就是 AI 自己加戲。

## 共享的本地 whisper

轉錄走本機 whisper.cpp,但不是每個 app 各跑一份模型。一台機器**一個共享的 whisper-server**(模型只載一次進 VRAM),由 supervisor `mori-whisper-serve` 管:**任何 app 隨需喚醒、閒置 10 分鐘自己關**。consumer 讀 `~/.mori/whisper-server.json` 做服務發現、先驗活,逾時就 fallback 本地 CLI。

這套共享 whisper 是整個 Mori 宇宙共用的 —— [mori-canvas]({% post_url 2026-06-11-mori-canvas %}) 的語音、mori-ear 的 STT 都接同一台,省資源。

## 怎麼裝

桌面 App(Tauri),到 [Releases](https://github.com/yazelin/mori-meeting-recorder/releases) 下載安裝檔。從源碼跑:

```bash
git clone https://github.com/yazelin/mori-meeting-recorder
cd mori-meeting-recorder
npm install
bash scripts/install-whisper-linux.sh   # Windows 是 .ps1
npm run tauri dev
```

完整安裝/操作手冊在 [Pages 文件站](https://yazelin.github.io/mori-meeting-recorder/)。

## 跟其他 Mori 專案的關係

- [mori-canvas]({% post_url 2026-06-11-mori-canvas %}):同樣是會議主題,但把逐字稿**畫成白板**;recorder 是把會議**錄成兩份記錄**。兩個都接共享 whisper。
- [mori-ear](https://github.com/yazelin/mori-ear):宇宙共用的本機 STT,跟 recorder 共用同一台 whisper-server。
- 它是 Mori 桌面身體的一個 body part(會議錄音)。

## 接下來

走 [GitHub issues](https://github.com/yazelin/mori-meeting-recorder/issues) 追。歡迎試用,有 bug 開 issue。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
