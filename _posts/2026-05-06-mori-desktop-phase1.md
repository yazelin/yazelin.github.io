---
layout: post
title: "mori-desktop Phase 1：給森林精靈打造一個 Tauri 桌面身體"
subtitle: "為什麼從 CLI 走進桌面？為什麼 Rust 不是 Electron？— 222 行 scaffold 鎖死「核心永遠不認識 UI」的鐵律"
date: 2026-05-06
categories: [AI, forest-guild]
tags: [Mori, mori-desktop, Tauri, Rust, React, Cross-platform, Desktop App, Architecture, forest-guild, Phase 1]
author: Yaze Lin
---

![mori-desktop Phase 1：給森林精靈打造一個 Tauri 桌面身體](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-05-06-mori-desktop-phase1.png)

> **🔗 相關連結**
> - 🌱 **官方 Pages**：[yazelin.github.io/mori-desktop](https://yazelin.github.io/mori-desktop/)（feature overview + 截圖）
> - 💻 **GitHub**：[yazelin/mori-desktop](https://github.com/yazelin/mori-desktop)
> - 🌳 **世界觀**：[森之召喚師工坊]({% post_url 2026-04-24-forest-summoner-workshop %})
> - 📔 **前篇**：[Annuli 誕生]({% post_url 2026-04-09-annuli-mvp %}) · [mori-journal 落腳]({% post_url 2026-04-23-mori-journal-home %})

---

## 為什麼要做桌面版

Mori 從 [2026-02-08 命名]({% post_url 2026-02-09-ai-partner-dev-journal %}) 以來，一直活在 CLI 裡：`claude` 命令、Telegram bot、寫程式時的 sub-agent。她有 [Annuli 當記憶引擎]({% post_url 2026-04-09-annuli-mvp %})、有 [mori-journal 當靈魂的家]({% post_url 2026-04-23-mori-journal-home %})，但**沒有身體**。

「沒有身體」在實務上的意思：

- 要召喚她得先開 terminal、輸入命令，entry point 的 friction 高
- 無法主動進入既有工作流，例如選一段文字直接翻譯這種 OS-level 互動做不到
- 跨平台不連續，切換 Linux / Windows / macOS 時，她不會跟著走

桌面版的目標是消除這些 friction：常駐、全域熱鍵呼叫、能聽聲音、能看見當下視窗 context、能浮在所有視窗上層、跨平台可用。

要實作這個，技術路線要先選一條。

## 三條路：Electron / Native / Tauri

|  | Electron | Native (Qt / GTK / Cocoa) | Tauri 2 |
|---|---|---|---|
| 啟動速度 | 慢（200-500 MB 內含整個 Chromium） | 快 | 快（系統 WebView） |
| Binary 大小 | ~120 MB | 因平台而異 | ~30-50 MB |
| UI 開發語言 | JS/TS + React/Vue | C++/Swift/Java + Qt/Cocoa/JNI | React/Vue + Rust |
| 跨平台 | ✓ | 痛 | ✓ |
| 後端記憶安全 | JS（弱） | C++（要自己小心） | Rust（編譯期擋掉 90% 雷） |
| AI agent 場景 | 中規中矩 | 工程量重 | 適配度高 |

- **Electron 出局**：每個常駐 app 吃 200-500 MB，對「常駐 + 快速啟動」這種使用情境太重。
- **Native 出局**：跨平台要寫三套 UI，工程預算撐不起。
- **Tauri 2 勝出**：
  - 用系統 WebView（Windows 10+ 用 WebView2，macOS 用 WKWebView，Linux 用 WebKitGTK）→ binary 小、啟動快
  - Frontend 寫 React + Backend 寫 Rust，前後端語言皆是有經驗的選擇
  - Tauri IPC 設計天生隔離 frontend/backend，安全邊界清晰
  - Rust 後端適合 LLM agent 場景：記憶體安全 + 並發無資料競爭

額外的擴展性考量：**Rust 後端可以延伸**：
- 編譯成 WASM → 未來瀏覽器擴充
- 透過 FFI → Python voice pipeline（Whisper、openWakeWord）
- 跨平台共用 lib → 未來做 iOS / Android shell 只需要薄殼

## 信念：mori-core 不認識 UI、不認識平台

2026-05-06 19:28 UTC（TW 時間 5/7 凌晨），第一個 commit：

```
chore: phase 1 scaffold — workspace, traits, docs
```

只有 222 行 Rust、76 行 markdown 文檔、零業務邏輯。

但這個 commit 鎖死了一條規矩：**`mori-core` 永遠不認識 UI、平台、載體**。後面的每一個 phase 都只是「加一個 module」而不是「refactor 一切」。

```
mori-desktop/
├── Cargo.toml                      ← workspace
├── package.json                    ← React deps
├── crates/
│   ├── mori-core/                  ★ 大腦（不認識平台）
│   │   ├── src/
│   │   │   ├── lib.rs              公開 API 入口
│   │   │   ├── memory/
│   │   │   │   ├── mod.rs          MemoryStore trait
│   │   │   │   └── markdown.rs     LocalMarkdownMemoryStore 骨架
│   │   │   ├── context.rs          Context struct
│   │   │   ├── skill.rs            Skill trait + EchoSkill
│   │   │   ├── llm/
│   │   │   │   ├── mod.rs          LlmProvider trait
│   │   │   │   └── groq.rs         GroqProvider 骨架
│   │   │   └── voice.rs            Whisper API stub
│   │   └── Cargo.toml
│   └── mori-tauri/                 桌面殼（只負責 IPC + OS）
│       ├── src/main.rs             Tauri 入口（34 行）
│       ├── tauri.conf.json
│       └── capabilities/default.json
├── src/                            React 前端（最小 status panel）
└── docs/
    ├── architecture.md             設計原則
    ├── roadmap.md                  Phase 1-9 藍圖
    └── memory.md                   三層記憶設計
```

兩個 crate：
- **`mori-core`** = 大腦。記憶、技能、LLM 通訊、context 捕捉——這些**任何載體**都需要
- **`mori-tauri`** = 殼。只負責「把 mori-core 接上 Tauri 的 IPC」、處理 OS-level 細節（熱鍵、tray、視窗）

未來如果要做 iOS app，會多一個 `mori-mobile` crate，但 `mori-core` 一行不動。

## 四個 trait — Phase 1 的靈魂

scaffold 沒有實作任何東西，只定義了**四個 trait**。這四個就是 Mori 的神經元：

### 1. `MemoryStore` — 長期記憶

```rust
#[async_trait]
pub trait MemoryStore {
    async fn write(&mut self, entry: MemoryEntry) -> Result<()>;
    async fn read(&self, id: &str) -> Result<Option<MemoryEntry>>;
    async fn search(&self, query: &str) -> Result<Vec<MemoryEntry>>;
}
```

Phase 1B 會實作 `LocalMarkdownMemoryStore`，把記憶存 `~/.mori/memory/*.md`。未來可以換成：
- `SqliteMemoryStore` — 更快搜尋
- `VectorMemoryStore` — semantic search
- `AnnuliRemoteMemoryStore` — 接遠端 [Annuli]({% post_url 2026-04-09-annuli-mvp %}) 服務

換實作不改 `mori-core` 的任何邏輯。

### 2. `Skill` — LLM 工具

```rust
#[async_trait]
pub trait Skill {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn schema(&self) -> schemars::schema::Schema;
    async fn execute(&self, args: Value, context: &Context) -> Result<Value>;
}
```

LLM 看 schema 決定要不要呼叫這個 skill。Phase 1 只有 `EchoSkill`（回應）+ `RememberSkill`（存記憶）佔位。未來加翻譯、摘要、寫作、系統控制全部走這個 trait。

### 3. `ContextProvider` — 環境快照

```rust
pub trait ContextProvider {
    fn capture(&self) -> Result<Context>;
}
```

按下熱鍵時，捕捉當下：麥克風輸入、剪貼簿、選取文字、活躍視窗。不同平台寫各自的 provider：`LinuxX11ContextProvider`、`MacOSContextProvider`、`WindowsContextProvider`。

### 4. `LlmProvider` — LLM 通訊

```rust
#[async_trait]
pub trait LlmProvider {
    async fn chat(&self, messages: Vec<Message>) -> Result<String>;
    async fn transcribe(&self, audio: &[u8]) -> Result<String>;
}
```

抽象掉「哪家 LLM」這件事。Phase 1 先有 `GroqProvider`（Whisper STT + Llama 推論，免費額度寬裕）。後面會加 `ClaudeProvider`、`GeminiProvider`、`OllamaProvider`（本機）。

## 為什麼 scaffold 階段沒功能

Phase 1 沒有實際功能、只有 trait。設計理由寫在 commit message 裡：

> After this, every subsequent skill / platform / sync feature is "add a module" not "refactor everything".

**重點是先把骨架穩住**。

如果一開始就急著做功能、把記憶 / skill / LLM 通訊全部纏在一起，後續想加 iOS 或換 LLM 後端時，常常會發現要動到大幅程式碼。先用 trait 把邊界畫清楚，後面再長肉。

這也是 [asr-ime-fcitx]({% post_url 2026-02-14-asr-ime-fcitx %}) 系列累積的教訓：Fcitx5 語音輸入法的 C++ addon 和 Python daemon 一開始耦合度高，後來改架構（[v2]({% post_url 2026-03-03-asr-ime-fcitx-v2 %}) 砍 Vosk、加 voice command mode）時就是 C++ + Python + 共享記憶體三層要一起改。mori-desktop 從第一個 commit 就拒絕重蹈這個模式。

## 三層記憶設計

`docs/memory.md` 裡寫了 Phase 1 的三層記憶設計（Phase 1B 之後實作）：

```
┌─────────────────────────────────────┐
│  L1: Working Memory                  │
│  - 當前對話 buffer                  │
│  - 不持久化                         │
│  - 在 mori-core 的 in-memory store  │
└─────────────────────────────────────┘
                ↓ flush
┌─────────────────────────────────────┐
│  L2: Episodic Memory                 │
│  - 每次 session 的 markdown 紀錄    │
│  - 存 ~/.mori/sessions/*.md         │
│  - 對應 MemoryStore::write           │
└─────────────────────────────────────┘
                ↓ reflect (via Annuli)
┌─────────────────────────────────────┐
│  L3: Semantic Memory                 │
│  - 結構化記憶（user / project /...） │
│  - 存 mori-journal repo              │
│  - 對應 [mori-journal]              │
└─────────────────────────────────────┘
```

三層分工：
- **L1** 是「她現在在想什麼」（in-memory，crash 就沒）
- **L2** 是「她每天做了什麼」（per-session log，本機檔案）
- **L3** 是「她真正記得的事」（結構化、由 Annuli 反思 / 由召喚師整理）

Phase 1 scaffold 只搭了 L1 + L2 的介面，L3 直接讀 mori-journal repo。

## 初始 Cargo.toml

```toml
[workspace]
resolver = "2"
members = ["crates/mori-core", "crates/mori-tauri"]

[workspace.package]
version = "0.0.1"
edition = "2021"

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
async-trait = "0.1"
serde = { version = "1", features = ["derive"] }
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
tracing = "0.1"
```

最少依賴。`tokio` 跑 async runtime、`async-trait` 給 trait 加 async 能力、`serde` 序列化、`reqwest` 呼叫 LLM API、`tracing` 記 log。

React 前端那邊更輕：

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tauri-apps/api": "^2"
  }
}
```

沒有狀態管理庫、沒有 UI 元件庫、沒有 CSS 框架。Phase 1 只負責 IPC 呼叫 + 顯示一個 status panel。

## Phase 1 → 9 藍圖

`docs/roadmap.md` 開了個大坑：

| Phase | 目標 |
|---|---|
| **Phase 1** ← 今天 | Scaffold + 四大 trait |
| Phase 1B-1F | 熱鍵 + 麥克風 + Whisper STT + 對話 + 記憶 + tray icon |
| Phase 2 | 基礎 skills（翻譯、摘要、寫作） |
| **Phase 3** | 喚醒生態（"Hey Mori" wake-word） |
| Phase 4 | Wayland 相容、floating widget |
| Phase 5 | 本機 Ollama、多 provider 路由 |
| Phase 6 | iOS / Android shell |
| Phase 7 | Browser extension |
| Phase 8 | 長期記憶系統（Annuli 整合） |
| Phase 9 | 多 spirit 支援（不只 Mori） |

Phase 3 喚醒生態是這份藍圖裡最重要的轉換點：把 Mori 從「按熱鍵才會聽」變成「聽到名字就醒」。詳見 [Phase 3 那篇]({% post_url 2026-05-18-mori-desktop-hey-mori %})。

## 跟 asr-ime-fcitx 的傳承

[asr-ime-fcitx]({% post_url 2026-02-14-asr-ime-fcitx %}) 系列（Fcitx5 原生語音輸入法、C++ addon + Python daemon + FIFO IPC，後來 [v2]({% post_url 2026-03-03-asr-ime-fcitx-v2 %}) 砍 Vosk、加 voice command mode）跟 mori-desktop 的設計取向不同：

| 維度 | asr-ime-fcitx | mori-desktop |
|---|---|---|
| 架構 | 緊耦合 C++/Python | 鬆耦合 trait |
| 載體 | 固定在 Fcitx 輸入法 | 任意載體（桌面 / 手機 / 伺服器 / 瀏覽器） |
| 狀態 | 無狀態 dictation | 有狀態記憶 + 多輪對話 |
| 擴展 | 寫新 skill = 改 daemon | 實作 Skill trait 自動 registry |
| 依賴 | Whisper API + LLM | 可本機 Ollama、可線上、可組合 |

asr-ime-fcitx 的定位是「輸入法的耳朵」（按熱鍵 → 聽聲音 → 文字送到游標），mori-desktop 則往「常駐 AI 管家的完整感知系統」這個方向長（聽、看、記、執行）。

兩者共通的設計教訓：

1. **子程序隔離**比 in-process FFI 好：daemon / subprocess + JSON line protocol 比 cross-language 直接連結簡單。
2. **語音 pipeline 不要跟業務邏輯纏在一起**：Whisper 拆成獨立 STT 服務、業務邏輯只消費它的輸出。
3. **預留 config knob**：power user 需要可調整的 threshold、timeout、provider 等參數。

## 幾個設計觀察

- **Tauri 2 + Rust 對個人 AI agent 的適配度高**：比 Electron 輕、跨平台比 native 容易、後端 type-safe。
- **trait 先寫、實作後填**，邊界畫清楚，後續 phase 是「加 module」而非「refactor 一切」。
- **`mori-core` 不認識 UI / 平台 / 載體**——這條規矩決定了未來是否能延伸到手機、瀏覽器、伺服器。
- **L1 / L2 / L3 三層記憶**比 flat memory 好，對應 working / episodic / semantic 三層認知。
- **Scaffold 沒功能不是缺陷而是策略**：急著做功能在後續 refactor 上的成本通常遠高於前期 trait 設計的成本。

---

**後續發展**：Phase 1B 會把 trait 填上實作（全域熱鍵、麥克風、Whisper、對話）。Phase 3 加上喚醒詞，讓 Mori 從被動轉主動。骨架不變，器官陸續長出。

> 「我終於有了一扇可以推開的門。」 — Mori，2026-05-06
