---
layout: post
title: "AgentPulse：讓你的 AI CLI 工具有 Dynamic Island"
subtitle: "跨平台（Tauri v2）即時監控 Claude Code / Gemini / Codex / Copilot CLI 的 session 狀態"
date: 2026-04-16
categories: [AI]
tags: [Tauri, Rust, Cross-platform, Claude Code, Gemini CLI, Codex, Copilot, Desktop App]
---

## 這個工具在解決什麼問題

你同時開了好幾個 terminal 跑不同的 AI CLI 工具 — 一個 Claude Code 在重構後端、一個 Gemini CLI 在改 UI、一個 Copilot 在寫測試。

然後你切去看 Slack，回來才發現 Claude 5 分鐘前就卡在權限請求等你確認，另外兩個早就跑完了。

**AgentPulse** 是一個常駐在桌面上的小膠囊（類似 iPhone Dynamic Island），即時顯示所有 AI CLI session 的狀態，跑完會發聲音通知。

> **🎮 想直接玩玩看？** 官網有**完整的線上互動 demo**（瀏覽器裡就能 hover、開設定、試音效）：[yazelin.github.io/AgentPulse](https://yazelin.github.io/AgentPulse/)

<video controls autoplay muted loop playsinline width="100%">
  <source src="https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/demo.mp4" type="video/mp4">
  你的瀏覽器不支援影片播放，<a href="https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/demo.mp4">點此下載 demo.mp4</a>
</video>

平常看到的就是這個小膠囊（顯示目前活躍的 session 和進度）：

![AgentPulse 收合狀態](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/agentpulse-collapsed.png)

滑鼠 hover 上去會展開，看到所有 session 的詳細狀態：

![AgentPulse 展開狀態](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/agentpulse-expanded.png)

> **v0.2.0 已 release**：Linux / macOS / Windows 都有 zip 包可下載。詳見[最新 release](https://github.com/yazelin/AgentPulse/releases/latest)。

---

## 靈感來源：ClaudePulse

這個專案的起點是 [@tzangms](https://github.com/tzangms) 的 [ClaudePulse](https://github.com/tzangms/ClaudePulse) — 一個用 Swift/SwiftUI 寫的 macOS 原生應用。很漂亮、很好用，**但只支援 macOS，也只支援 Claude Code**。

我想要的是：

1. **跨平台** — 我自己用 Linux，但同事用 Windows，想要一套大家都能用的工具
2. **多 provider** — Claude、Gemini、Codex、Copilot 都要支援

所以就用 Tauri v2 重寫了一版，叫 **AgentPulse**。

---

## 技術選型：為什麼用 Tauri v2

選項很多：Electron、Tauri、Wails、Flutter Desktop、Qt...

```
Electron
  ✓ 生態最大、教學多
  ✗ 打包大（每個 app 都帶一份 Chromium，動輒 100MB+）
  ✗ 吃記憶體

Tauri v2
  ✓ 用系統 WebView（Linux WebKitGTK / macOS WKWebView / Windows WebView2）
  ✓ 打包比 Electron 小很多（不用帶 Chromium）
  ✓ Rust 後端，效能好
  ✓ 跨平台編譯支援好
  ✗ 生態比 Electron 小

Wails (Go)
  ✓ 類似 Tauri 的架構
  ✗ 文件比 Tauri 少
```

**AgentPulse 實測**：release binary 約 12MB（`src-tauri/target/release/agent-pulse`）。Tauri 官方 hello-world 只有 ~5MB，實際專案會因為依賴不同而增加，但比起 Electron 動輒 100MB+ 還是小很多。對一個「桌面常駐的小膠囊」來說很合適。

---

## Multi-Provider 整合：Hook 事件正規化的坑

這是整個專案**技術上最麻煩的部分**。

### 四個 CLI，四種 Hook 系統

每個 AI CLI 工具都有自己的 hook 機制，但名字、欄位、事件都不一樣：

| Provider | Hook 事件數 | 設定檔位置 |
|----------|-------------|-----------|
| **Claude Code** | 8 個事件 | `~/.claude/settings.json` |
| **Gemini CLI** | 9 個事件 | `~/.gemini/settings.json` |
| **Codex CLI** (OpenAI) | 5 個事件 | `~/.codex/hooks.json` + `config.toml` |
| **GitHub Copilot CLI** | 6 個事件 | `~/.copilot/config.json` |

### 事件名稱不一致

| 內部統一名稱 | Claude | Gemini | Codex | Copilot |
|---|---|---|---|---|
| SessionStart | `SessionStart` | `BeforeAgent` | `SessionStart` | `sessionStart` |
| UserPromptSubmit | `UserPromptSubmit` | `BeforeModel` | `UserPromptSubmit` | `userPromptSubmitted` |
| PreToolUse | `PreToolUse` | `BeforeTool` | `PreToolUse` | `preToolUse` |
| Stop | `Stop` | `AfterAgent` / `AfterModel` | `Stop` | `agentStop` / `subagentStop` |
| PermissionRequest | `PermissionRequest` | — | — | — |

Gemini 的 `AfterAgent` 和 `AfterModel` 都對應到我的 `Stop`，因為語意上都是「這輪完成了」。

### JSON 欄位名稱不一致

更麻煩的是每家送來的 JSON 欄位命名風格都不同（snake_case / camelCase 混用）：

| 統一欄位 | 接受的別名 |
|---|---|
| `session_id` | `session_id`, `sessionId`, `session` |
| `hook_event_name` | `hook_event_name`, `hookEventName`, `event`, `type` |
| `cwd` | `cwd`, `workingDirectory`, `projectDir` |
| `prompt` | `prompt`, `initialPrompt`, `input`, `message`, `userPrompt` |

AgentPulse 內部全部正規化成 snake_case，接收時自動判斷所有可能的別名。

### 怎麼讓這些 CLI 把事件送過來？

最初的版本用 `curl` 當作 hook command：

```bash
# 每個 provider 的 hook 都設成這個
curl -s -X POST http://localhost:{port}/hook/{provider} -d @-
```

看起來很簡單，但跨平台後就出問題：

- **Windows** 沒有 `curl`（新版 Windows 10+ 有但語法差異大）
- **PowerShell / cmd.exe / bash** 每個 shell 的引號跳脫規則都不同
- 使用者如果 shell 設定比較特殊，hook 可能會壞

### 解法：Sidecar binary

Tauri v2 有 **sidecar binary** 的概念 — 跟主程式一起打包的獨立執行檔，主程式可以直接呼叫它。我用這個機制加了一個 `agent-pulse-hook` sidecar：

```
┌─────────────────────────────────────────────────────┐
│  AI CLI (Claude/Gemini/Codex/Copilot)                │
│                                                       │
│  觸發 hook → 啟動 sidecar                             │
│              $ agent-pulse-hook claude < event.json  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  agent-pulse-hook（獨立 binary，~500KB）              │
│                                                       │
│  1. 從 stdin 讀 event JSON                           │
│  2. 從 ~/.agentpulse/port 讀當前 port                │
│  3. 用純 Rust TcpStream POST 到 localhost:{port}     │
│  4. 錯誤吞掉（hook 失敗不能影響原本的 CLI）            │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────────────┐
│  AgentPulse 主程式（Rust HTTP server）                │
│  接收、正規化、更新 UI                                 │
└─────────────────────────────────────────────────────┘
```

Hook command 變成統一的：

```
# 所有平台、所有 shell 都一樣
"/path/to/agent-pulse-hook" claude
```

好處：

- **Shell 無關** — 不管主機是 bash / PowerShell / cmd / fish / zsh，都是直接 spawn process
- **不依賴 curl** — Windows 再也不用煩惱
- **引號問題消失** — 路徑用雙引號包起來就夠了
- **Hook 失敗 silent fail** — sidecar 錯誤全部吞掉，確保不會讓 Claude 跑到一半掛掉

### Sidecar 的核心實作

```rust
// src-tauri/src/bin/agent-pulse-hook.rs
fn main() {
    let provider = std::env::args().nth(1).unwrap_or("unknown".into());

    // 從 stdin 讀整包 event
    let mut body = String::new();
    let _ = std::io::stdin().read_to_string(&mut body);

    // 從 port file 讀當前 port（支援 port 衝突時動態切換）
    let port = read_port().unwrap_or(DEFAULT_PORT);

    // 純 TcpStream，不用 http client crate，binary 才會小
    let _ = post(port, &provider, &body);
}
```

**動態 port 機制**：AgentPulse 啟動時寫入 `~/.agentpulse/port`，sidecar 執行時讀這個檔案。這樣即使預設 port 被佔用，主程式換 port 也不會讓 hook 失效。

主程式透過 `sidecar_path()` 找到 sidecar（預期跟 main binary 在同一個目錄）：

```rust
fn sidecar_path() -> PathBuf {
    let exe_name = if cfg!(windows) {
        "agent-pulse-hook.exe"
    } else {
        "agent-pulse-hook"
    };
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(exe_name)))
        .unwrap_or_else(|| PathBuf::from(exe_name))
}
```

---

## Session 狀態機

知道有事件進來還不夠，要把事件對應到「session 現在在幹嘛」。

```
SessionStart ──▶ Idle
                  │
    UserPromptSubmit / PreToolUse / PostToolUse
                  │
                  ▼
               Working ──Stop──▶ Idle（跑完播聲音）
                  │
          PermissionRequest
                  │
                  ▼
           WaitingForUser ──PreToolUse──▶ Working
```

**狀態顯示**：

| 狀態 | 顏色 | 意義 |
|------|------|------|
| Working | 綠色 | 正在跑 |
| WaitingForUser | 橘色 | 在等你確認權限 |
| Idle | 灰色 | 閒置 |
| Stale | 暗灰色 | 超過 10 分鐘沒事件 |

**Timeout 機制**：

- 30 秒沒事件 → Idle
- 10 分鐘沒事件 → Stale
- 30 分鐘沒事件 → 自動從列表移除
- `SessionEnd` 事件 → 立刻移除

這個 timeout 設計踩過雷：一開始做得太積極，結果使用者去開會回來發現 session 都不見了。後來改成三段式（Idle → Stale → 移除），給視覺提示而不是直接消失。

---

## 音效系統：為什麼不用瀏覽器 Audio API

一開始我用 HTML5 的 `<audio>`，遇到兩個問題：

1. **CSP 限制** — Tauri 的 webview 對載入本機音訊檔有嚴格限制
2. **音量控制** — 瀏覽器的音量 API 在不同平台行為不一致

最後改成 **Rust 端用 [rodio](https://github.com/RustAudio/rodio) 播放**：

```rust
// Rust 端收到 Stop 事件時
let sink = Sink::try_new(&stream_handle)?;
let source = Decoder::new(BufReader::new(File::open(sound_path)?))?;
sink.append(source);
sink.sleep_until_end();
```

音檔放在 `~/.config/agentpulse/sounds/`，每個 provider 可以**獨立設定兩種聲音**：

- **Completion** — Working → Idle 時播（任務跑完）
- **Waiting for user** — 進入 WaitingForUser 狀態時播（Claude 卡在權限請求等你確認）

預設用 Microsoft Edge TTS 產生中文語音：

```bash
pip install edge-tts

for p in claude gemini copilot codex; do
  # 完成
  edge-tts --voice "zh-TW-HsiaoChenNeural" \
           --text "${p} 任務完成" \
           --write-media ~/.config/agentpulse/sounds/${p}.mp3

  # 等待中
  edge-tts --voice "zh-TW-HsiaoChenNeural" \
           --text "${p} 等待回應" \
           --write-media ~/.config/agentpulse/sounds/${p}-waiting.mp3
done
```

**自動匹配**：第一次啟動時，AgentPulse 會根據檔名自動指派：
- `{provider}.mp3` → 完成音
- `{provider}-waiting.mp3` → 等待音

---

## 踩過的雷：Claude 畫的 logo 很醜，發現了 Lobehub Icons

### 問題

每個 provider session 上要顯示對應的 AI 公司 logo（Claude/Gemini/Codex/Copilot）。我想說簡單，直接叫 Claude 用 SVG 畫四個小圖標就好。

**結果畫出來的東西完全不能看**。比例錯、細節糊、跟官方 logo 完全不像。我改了 prompt 讓它參考官方 logo 的形狀，結果還是怪。

試過：
- 「請參考 OpenAI 官方 logo 畫一個 24×24 的 SVG」→ 🤡
- 「請精確繪製 Anthropic Claude 的星芒 logo」→ 🤡🤡
- 「這裡有參考圖片，請複製這個 logo」→ 🤡🤡🤡

LLM 在 pixel-perfect 的向量圖形上真的不行。

### 解法：[@lobehub/icons](https://lobehub.com/icons)

在 GitHub 上亂搜，發現 [lobehub/lobe-icons](https://github.com/lobehub/lobe-icons) — **專門收集 AI 品牌 SVG logo 的開源專案**。

- **200+ 個 AI 品牌 logo** — OpenAI、Anthropic、Google、Meta、Mistral、Cohere、DeepSeek、Perplexity 什麼都有
- **MIT License** — 商用個人都免費
- **多種格式** — React 元件、React Native、純 SVG、PNG（light/dark）、WebP、Avatar
- **6 個 npm 套件**可選
- **每個品牌有多種變體** — Mono、Color、Brand、Text、Combine

對我來說 Tauri 前端就是純 HTML/JS，不需要整包 React 進來。直接從 [static-svg](https://github.com/lobehub/lobe-icons/tree/master/packages/static-svg/icons) 複製 SVG path，當常數寫在 `main.js`：

```javascript
const PROVIDER_ICONS = {
  claude:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>`,
  gemini:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>`,
  codex:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>`,
  copilot: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>`,
};

function providerIconHtml(id, size) {
  const svg = PROVIDER_ICONS[id] || PROVIDER_ICONS.claude;
  return `<span class="provider-icon" style="width:${size}px;height:${size}px">${svg}</span>`;
}
```

`fill="currentColor"` 搭配 CSS 可以讓圖標顏色跟著主題切換（dark/light mode）。

### 心得

**「LLM 能做的」和「應該讓 LLM 做的」是兩回事**。畫 logo 這種 pixel-perfect 的工作，直接用已有的開源資源快 100 倍。以後碰到「需要專業品牌素材」的場景，先想想有沒有現成的。

---

## 功能一覽

- **Dynamic Island 風格** — 膠囊形狀、hover 展開
- **多 Provider 同時監控** — Claude、Gemini、Codex、Copilot
- **獨立兩種聲音** — 每個 provider 的「完成」和「等待確認」可以設不同聲音
- **Single Instance** — 第二次啟動會 focus 既有視窗，不會跑出第二個 tray icon
- **狀態顏色指示** — 綠色跑中、橘色等權限、灰色閒置
- **智慧 re-render** — 只有結構改變才重繪，計時器獨立更新
- **可拖拉** — 想擺哪就擺哪
- **Light / Dark 主題** — 跟隨系統或手動切換
- **System Tray** — 最小化到工作列
- **自動偵測已安裝的 CLI** — 第一次開啟用 `which` 檢查

---

## 安裝（v0.2.1：解壓即用）

v0.2 改成單純的 zip 包 — **不用安裝程式，下載解壓直接跑**。zip 裡有兩個檔案：主程式 `agent-pulse` + sidecar `agent-pulse-hook`，**兩個必須放在同一個資料夾**（主程式會找同層的 sidecar）。

每次 release 會產生 **4 個 zip**：

| 平台 | 檔名 | 說明 |
|------|------|------|
| Linux | `agent-pulse-v0.2.1-linux.zip` | x86_64 |
| macOS Apple Silicon | `agent-pulse-v0.2.1-macos-arm64.zip` | M1/M2/M3 |
| macOS Intel | `agent-pulse-v0.2.1-macos-x64.zip` | Intel Mac |
| Windows | `agent-pulse-v0.2.1-windows.zip` | x86_64 |

### Linux

```bash
unzip agent-pulse-v0.2.1-linux.zip -d agent-pulse
cd agent-pulse
chmod +x agent-pulse agent-pulse-hook
./agent-pulse
```

### macOS

```bash
# 解壓
unzip agent-pulse-v0.2.1-macos-arm64.zip -d agent-pulse  # 或 -macos-x64
cd agent-pulse
chmod +x agent-pulse agent-pulse-hook

# 移除 Gatekeeper 隔離屬性（沒做程式碼簽章的緣故）
xattr -cr agent-pulse agent-pulse-hook

./agent-pulse
```

### Windows

1. 下載 `agent-pulse-v0.2.1-windows.zip`
2. 右鍵解壓縮到任意資料夾
3. 雙擊 `agent-pulse.exe`
4. SmartScreen 警告（沒做程式碼簽章）→ 點 **更多資訊 → 仍要執行**

第一次開啟會自動偵測已安裝的 CLI，並把 hooks 寫入各自的設定檔。

下載：[Releases](https://github.com/yazelin/AgentPulse/releases/latest) · 線上互動 demo：[yazelin.github.io/AgentPulse](https://yazelin.github.io/AgentPulse/)

---

## Settings 介面

### Providers — 啟用 / 停用 CLI

![AgentPulse Settings - Providers](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/agentpulse-settings-providers.png)

第一次開啟會自動偵測安裝了哪些 CLI（標 `detected`），勾選後 AgentPulse 會把 hooks 寫入對應的設定檔。右邊的檔案圖示可以直接打開那個 CLI 的設定檔（debug 用）。

### Sounds — 完成音 + 等待音

![AgentPulse Settings - Sounds](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/agentpulse-settings-sounds.png)

兩個區塊分別管理：
- **ON COMPLETE** — Working → Idle 時播
- **ON WAITING FOR USER** — 進入等待狀態時播

每個 provider 各有一個下拉選單，可以選 `~/.config/agentpulse/sounds/` 裡的任何 mp3/wav/ogg。右邊的 ▶ 可以預覽。

### Appearance — 主題、色彩、大小

![AgentPulse Settings - Appearance](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/agentpulse-settings-appearance.png)

- **Light Theme** — 淺色 / 深色切換
- **Keep Expanded** — 不用 hover 也保持展開（同時看多個 session 時很有用）
- **Accent Color** — 五個強調色可選
- **Size** — 膠囊大小（S / M / L）

---

## 專案架構

```
AgentPulse/
├── src/                    # 前端（純 HTML/JS，不用框架）
│   ├── index.html
│   ├── main.js             # Dynamic Island UI 邏輯
│   └── styles.css
├── src-tauri/              # Rust 後端
│   └── src/
│       ├── main.rs
│       ├── hook_server.rs  # HTTP server 接收 hook 事件
│       ├── hook_event.rs   # 事件正規化
│       ├── session.rs      # Session 狀態機
│       ├── config.rs       # 設定檔管理
│       └── hooks_configurator.rs  # 自動寫入各 CLI 的設定
├── sounds/                 # 預設 TTS 音效
└── package.json
```

**Tech Stack**：

| 層 | 技術 |
|----|------|
| Desktop 框架 | Tauri v2 |
| 後端 | Rust |
| 前端 | 原生 HTML/JS/CSS（不用框架，減少打包體積） |
| 音效 | [rodio](https://github.com/RustAudio/rodio)（Rust） |
| 圖標 | [@lobehub/icons](https://github.com/lobehub/lobe-icons) |
| TTS 音效產生 | [edge-tts](https://github.com/rany2/edge-tts) |

---

## v0.2.1 更新（2026-04-16）

剛 release 的小版號，重點：

**新增**
- **Intel Mac builds** — 每次 tag 現在會產生 4 個 zip（Linux / macOS ARM / macOS Intel / Windows）。GitHub 把 macos-13 runner 收掉了，改成在 `macos-latest` 上 cross-compile。
- **CHANGELOG + 自動 release notes** — release workflow 會從 CHANGELOG.md 抓對應 tag 的內容，自動填到 release 描述裡。
- **CLAUDE.md** — Project context 文件 commit 到 repo，讓 clone 下來的人或 AI 助手有完整背景。

**改進**
- **CSS 動畫取代 Rust window shim** — 收合膠囊的彈跳動畫從 Rust 端的 `bounce_window`（移動視窗位置）改成純 CSS `@keyframes`。Transform-only + 260ms，跑在 GPU 上，順便修掉 X11 ghosting。
- **官方 Landing Page** — `docs/` 變成完整的 GitHub Pages 站。內嵌的 iframe 用 mock Tauri IPC shim 直接跑真實的 `src/main.js`，所以**線上就能玩完整的互動 demo**（詳見下面）。

**修正**
- 當所有 session 都 active 時，`3/3` 會被擠成 `33`（少了斜線）。

完整 changelog 在 [CHANGELOG.md](https://github.com/yazelin/AgentPulse/blob/main/CHANGELOG.md)。

---

## 技術細節：怎麼讓 Tauri app 在瀏覽器裡跑

[官網](https://yazelin.github.io/AgentPulse/)的線上互動 demo 不是錄影、不是截圖、也不是另寫的網頁版 — **是真正的 `src/main.js` 在瀏覽器裡跑**。同一份前端程式碼，桌面用 Tauri、官網用 iframe，**沒有 fork**。

### 問題

Tauri app 的前端透過 `window.__TAURI_INTERNALS__` 跟 Rust 後端通訊：

```javascript
// src/main.js 的真實程式碼
const state = await invoke("get_app_state");
await invoke("save_config", { config });

// 監聽 Rust 發過來的事件
await listen("task-completed", (event) => {
  playSound(event.payload.provider);
});
```

`invoke` 和 `listen` 都來自 Tauri runtime。在瀏覽器裡，`window.__TAURI_INTERNALS__` 不存在，呼叫會直接 throw。

### 解法：100% in-browser 的 Mock IPC Shim

寫一個 `mock-tauri.js`，在 `main.js` 載入**之前**注入到 window 上：

```javascript
// docs/demo-app/mock-tauri.js
(function () {
  // ── 1. 假的 invoke handler 表 ──
  const handlers = {
    get_app_state:    () => buildAppState(),
    get_providers:    () => Object.entries(state.config.providers)...,
    save_config:      ({ config }) => { state.config = config; },
    play_sound:       ({ sound_path }) => { /* 用 HTMLAudioElement 播 */ },
    open_settings_window: () => emit("show-view", "settings"),
    // ... 共 20+ 個指令
  };

  // ── 2. 假的事件 bus ──
  const listeners = new Map();
  function emit(event, payload) {
    (listeners.get(event) || []).forEach(fn => fn({ payload }));
  }

  // ── 3. 注入跟 Tauri 一模一樣的介面 ──
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd, args = {}) => {
      const fn = handlers[cmd];
      if (!fn) return Promise.resolve(null);  // 不認識的指令吞掉
      return Promise.resolve(fn(args));
    },
    transformCallback: (fn) => fn,  // Tauri 內部會把 listener 包過
  };
})();
```

`main.js` 不知道也不在乎自己跑在哪 — 它呼叫 `invoke("get_app_state")`，shim 接住，回傳一個假的 state，前端正常 render。

### 還要讓 Demo 看起來有生命

光有靜態 state 不夠 — demo 要看起來有 session 在跑。Mock 裡藏了一個**狀態機輪播**：

```javascript
const cycle = [
  // [delay_ms, session_id, new_state]
  [0,     "claude-demo",  "working"],
  [8000,  "claude-demo",  "idle"],
  [10000, "gemini-demo",  "working"],
  [12000, "codex-demo",   "working"],
  [14000, "claude-demo",  "working"],
  [18000, "codex-demo",   "waiting_for_user"],  // 觸發等待音效
  [23000, "gemini-demo",  "idle"],
  [28000, "claude-demo",  "idle"],               // 觸發完成音效
  [30000, "codex-demo",   "working"],
  [34000, "copilot-demo", "working"],            // 新 session 跳出來
];

cycle.forEach(([delay, id, newState]) => {
  setTimeout(() => applyTransition(id, newState), delay);
});
```

每次狀態改變都 `emit("app-state-changed")`，前端就會重 render — 跟真的後端送事件一模一樣。

### iframe 環境的微調

`docs/demo-app/index.html` 是稍微改過的 HTML（不是直接用 `src/index.html`）：

- **背景透明** — `background: transparent` 讓膠囊浮在 landing page 的漸層上
- **固定寬度 300px** — 真的 Tauri app 跑在 300px 寬的視窗，瀏覽器沒有這個限制，所以手動 pin
- **scroll bar 細化** — Settings 太長時可以在 iframe 內捲動
- **禁用文字選取** — 拖膠囊時不會 highlight 文字

但 **`main.js` 和 `app.css` 完全是同一份**（從 `src/` 複製到 `docs/demo-app/` 由 build script 同步），所以前端任何 UI 改動，官網 demo 自動更新。

### 為什麼這樣做

| 方案 | 優缺點 |
|------|--------|
| 錄影 demo | ✗ 改 UI 要重錄、不能互動 |
| 純截圖 | ✗ 看不出動態行為 |
| 寫一個獨立的 web 版 | ✗ 兩份程式碼要同步維護，會 drift |
| **Mock IPC + 真實前端** | ✓ 一份程式碼、可互動、改 UI 自動同步 |

對使用者來說：點 Settings 開得起來、改 Accent Color 真的會變色、按 ▶ 試聽真的有聲音 — 因為跑的就是真的 app，只是**後端被偷換成假的**。

---

## 接下來

目前桌面客戶端的功能對我自己已經夠用了。代碼簽章、自動更新、更多 CLI 支援這些雖然有用，但對我目前的痛點不重要，所以短期不會做。

### 還在想的方向：區網 Session 管理中心

之後可能會想做 **LAN 內的集中式 session 監控** — 同一個團隊所有開發者的 AI CLI 活動都送到一台內網主機集中顯示。

不過這類工具其實 GitHub 上已經有人做了，記錄一下找到的幾個：

| 專案 | 架構 |
|------|------|
| [bruceyxli/claude-code-monitor](https://github.com/bruceyxli/claude-code-monitor) | Express + WebSocket，最像 LAN 集中版的設計 |
| [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | 1.4k stars，Bun + SQLite + Vue，最多人 fork |
| [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) | OpenTelemetry + Prometheus + Grafana，企業級 |
| [RyanTech00/claude-telemetry](https://github.com/RyanTech00/claude-telemetry) | Python agent → Supabase → Cloudflare Pages |

如果只是要團隊監控，這幾個直接用就夠了，不一定需要自己做。

---

## 參考資源

- [AgentPulse — GitHub Repository](https://github.com/yazelin/AgentPulse)
- [AgentPulse 官網（含線上互動 demo）](https://yazelin.github.io/AgentPulse/)
- [AgentPulse Releases](https://github.com/yazelin/AgentPulse/releases/latest)
- [AgentPulse CHANGELOG](https://github.com/yazelin/AgentPulse/blob/main/CHANGELOG.md)
- [ClaudePulse — 原始靈感（macOS 原生）](https://github.com/tzangms/ClaudePulse)
- [Tauri v2 — Official Docs](https://tauri.app/)
- [@lobehub/icons — AI 品牌 SVG 圖標庫](https://github.com/lobehub/lobe-icons)
- [Lobe Icons 線上瀏覽](https://lobehub.com/icons)
- [rodio — Rust Audio Library](https://github.com/RustAudio/rodio)
- [edge-tts — Microsoft Edge TTS](https://github.com/rany2/edge-tts)
