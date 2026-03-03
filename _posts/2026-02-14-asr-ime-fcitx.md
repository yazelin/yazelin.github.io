---
layout: post
title: "asr-ime-fcitx：用講的打字，Fcitx5 原生語音輸入法"
subtitle: "C++ addon + Python daemon + FIFO IPC，一行安裝、熱鍵開麥、LLM 自動補標點"
date: 2026-02-14
categories: [ChingTech OS]
tags: [ASR, Fcitx5, IME, Speech-to-Text, Whisper, Python, C++, FIFO, LLM, copilot]
author: Yaze Lin
---

## 為什麼要做這個

Linux 桌面打中文，輸入法選擇不少，但**語音輸入**幾乎是空白。Windows 有內建語音辨識、macOS 有聽寫，Linux 上要嘛裝 Chrome 開 Google Docs、要嘛自己想辦法。

我想要的很簡單：**在任何視窗按一個熱鍵就開始聽寫，說完自動送字到游標位置**。跟切輸入法一樣自然。

所以做了 [asr-ime-fcitx](https://github.com/yazelin/asr-ime-fcitx) — 一個 Fcitx5 原生語音輸入法。

---

## 架構

整個系統分三層，透過 FIFO 管道通訊：

```
┌──────────────────────────────────────────────┐
│  Fcitx5 原生 C++ Addon (asrime.cpp)          │
│  - 攔截熱鍵 (Ctrl+Alt+V / F8 / ...)         │
│  - 送 "toggle" 指令到 cmd FIFO              │
│  - 從 commit FIFO 讀辨識結果                 │
│  - commitString() 送字到當前視窗             │
└────────┬──────────────────────┬───────────────┘
         │ /tmp/fcitx-asr-     │ /tmp/fcitx-asr-
         │ ime-cmd.fifo        │ ime-commit.fifo
         ▼                     ▲
┌──────────────────────────────────────────────┐
│  Python Daemon (daemon_asr.py)               │
│  - 讀 cmd FIFO → 切換錄音開關               │
│  - sounddevice 擷取麥克風音訊                │
│  - VAD 切語句 → STT 辨識                    │
│  - 後處理 (標點/繁體) → 寫 commit FIFO      │
└──────────────────────────────────────────────┘
```

為什麼用 FIFO 不用 D-Bus？因為 FIFO 零依賴、零設定、任何語言都能讀寫。C++ addon 只管熱鍵跟送字，Python daemon 只管錄音跟辨識，互不干涉。

---

## C++ Addon：最小化原則

Fcitx5 addon 用 C++ 寫，但刻意保持極簡 — 整個 `asrime.cpp` 只有 250 行：

```cpp
class ASRNativeEngine final : public fcitx::InputMethodEngineV2 {
    void keyEvent(const fcitx::InputMethodEntry &entry,
                  fcitx::KeyEvent &keyEvent) override {
        if (keyEvent.isRelease()) return;
        activeIC_ = keyEvent.inputContext();

        if (keyEvent.key().normalize().checkKeyList(toggleKeys_)) {
            sendCommand("toggle\n");
            keyEvent.filterAndAccept();
        }
    }
};
```

它做的事：

1. **攔截熱鍵** — 從 `~/.config/asr-ime-fcitx/hotkeys.conf` 讀設定，預設 `Ctrl+Alt+V`、`Ctrl+Alt+R`、`F8`、`Shift+F8`
2. **送指令** — 往 `/tmp/fcitx-asr-ime-cmd.fifo` 寫 `toggle\n`
3. **收結果** — 用 `EventLoop` 監聽 `/tmp/fcitx-asr-ime-commit.fifo`，有資料就 `commitString()`

不做 ASR、不做 GUI、不做設定管理。

---

## Python Daemon：錄音、辨識、後處理

`daemon_asr.py` 是核心，約 800 行，負責：

### 麥克風擷取與 VAD

用 `sounddevice` 即時錄音，自動偵測最適合的麥克風（優先 PulseAudio / PipeWire / USB 麥克風）：

```python
def select_best_input_device(preferred_idx=None):
    def score_name(name):
        n = name.lower()
        score = 0
        if "default" in n: score += 50
        if "pulse" in n:   score += 40
        if "pipewire" in n: score += 35
        if "usb" in n or "headset" in n: score += 15
        if "hw:" in n:     score -= 10
        return score
    ...
```

VAD（Voice Activity Detection）用能量門檻做：靜音超過 0.35 秒就切一句，單句最長 8 秒。不用額外的 VAD 模型，簡單暴力但夠用。

### 雙後端辨識

- **`google`** — Google Web Speech API（免費、需網路、延遲低）
- **`local`** — faster-whisper 本機辨識（離線可用、第一次要下載模型）

```python
if self.backend == "google":
    text = self.recognizer.recognize_google(audio_data, language=self.language)
elif self.backend == "local":
    segments, _ = self.whisper_model.transcribe(audio_array, language=...)
    text = "".join(seg.text for seg in segments)
```

### LLM 後處理補標點

語音辨識出來的中文通常沒標點。daemon 支援三種後處理模式：

| 模式 | 說明 |
|------|------|
| `none` | 不處理，原文直送 |
| `heuristic` | 規則式補常見中文標點 |
| `command` | 呼叫外部 CLI（LLM）補標點斷句 |

`command` 模式預設用 **Copilot + GPT-5 mini**：

```python
DEFAULT_CONFIG = {
    "postprocess_mode": "command",
    "postprocess_provider": "copilot",
    "postprocess_program": "copilot",
    "postprocess_args": '-s --model gpt-5-mini -p "請快速處理以下語音辨識結果：'
                        '轉成繁體中文、補上自然標點與斷句、整理成短段落；'
                        '不要新增內容，不要解釋，只回傳結果：{text}" --allow-all',
    "postprocess_timeout_sec": 12,
}
```

也可以一鍵切換到 Gemini 或 Claude Code：

```python
PROVIDER_PRESETS = {
    "copilot": ("copilot", '-s --model gpt-5-mini -p "..." --allow-all'),
    "gemini":  ("gemini",  "--output-format text -p ..."),
    "claude-code": ("claude", "-p --output-format text ..."),
}
```

講一段話 → 辨識出原文 → LLM 補標點斷句 → 繁體中文送到游標。整個流程自動完成。

---

## GUI 控制面板

用 Tkinter 做了兩個面板：

- **控制面板**（`asr_ime_app.py`）— 啟動/停止/狀態/切換錄音
- **設定面板**（`settings_panel.py`）— 後端選擇、麥克風、熱鍵、後處理模式、LLM provider

設定面板可以勾「儲存後自動套用」，改完設定會自動 `fcitx5-remote -r` + 重啟 daemon，不用手動。

安裝完成後，應用程式選單會出現「ASR IME 控制面板」的啟動器。

---

## 一行安裝

在另一台 Linux 機器上，不用先 clone：

```bash
curl -fsSL https://raw.githubusercontent.com/yazelin/asr-ime-fcitx/main/bootstrap_install.sh | bash
```

這行指令會：

1. Clone repo 到 `~/.local/src/asr-ime-fcitx`
2. `apt install` 編譯工具和 Fcitx5 開發套件
3. 建立 Python venv、安裝相依套件
4. CMake 編譯 C++ addon → 安裝到 `/usr`
5. 建立桌面啟動器
6. 自動啟動 daemon 並切換到 ASR 輸入法

---

## 使用方式

```bash
# 啟動
./start.sh

# 查看狀態
./start.sh --status

# 手動切換錄音（不靠熱鍵）
./start.sh --toggle

# 指定麥克風和語言
./start.sh -- --device 2 --language en-US

# 開啟設定面板
./start.sh --settings

# 停止
./start.sh --stop
```

日常使用就是：切到 ASR 輸入法 → 按 `Ctrl+Alt+V` 開始聽寫 → 說話 → 停頓後自動送字。桌面會跳 `notify-send` 通知，不用盯終端。

---

## 技術細節

幾個值得記錄的設計選擇：

**FIFO 雙管道 IPC** — `cmd.fifo` 從 addon 到 daemon（送指令），`commit.fifo` 從 daemon 到 addon（送文字）。addon 用 `EventLoop` 的 IO event 非同步讀取，不會 block Fcitx 主迴圈。

**自動取樣率適配** — 不同麥克風支援的取樣率不同，daemon 會依序嘗試偏好 → 裝置預設 → 48k → 44.1k → 16k，找到第一個能用的。辨識前再 resample 到 16kHz。

**OpenCC 強制繁體** — 開啟 `force_traditional` 後，辨識結果會過 OpenCC `s2tw` 轉換，避免 Google STT 偶爾回簡體。

**狀態檔** — daemon 把目前狀態寫到 `/tmp/fcitx-asr-ime-state.json`（listening、backend、last_text、last_error 等），`--status` 和 GUI 都從這裡讀。

**Profile 自動注入** — `start.sh` 會自動檢查 Fcitx5 profile，如果 `asrime` 不在輸入法清單裡就自動加進去，省去手動開 `fcitx5-configtool` 的步驟。

---

## Commit 歷程

從 initial commit 到目前，12 個 commit 完成整個系統：

```
Initial ASR IME implementation
Add configurable LLM postprocess and installer UX
Fix install URL to yazelin/asr-ime-fcitx
Improve cross-machine startup and settings diagnostics
Make one-line installer fully automatic
Avoid venv activate script in setup
Fix bootstrap/setup permissions for venv creation
Fix GUI launcher for desktop settings app
Use system python for venv creation
Improve Tk UI layout for HiDPI displays
Improve ASR diagnostics and microphone selection
Avoid selecting sysdefault microphone automatically
```

前兩個 commit 是主體，後面十個都在處理跨機器安裝的各種邊角：venv 權限、HiDPI 縮放、麥克風自動選擇、desktop launcher 啟動失敗的診斷。

---

## 小結

這個專案解決了一個很具體的問題：**Linux 桌面沒有好用的語音輸入法**。

做法是把問題拆成三塊：Fcitx5 addon 管熱鍵跟送字（C++）、daemon 管錄音跟辨識（Python）、FIFO 管兩邊溝通。每一塊都可以獨立替換 — 想換辨識引擎就改 daemon，想換快捷鍵就改 conf 檔，想換 LLM 就在設定面板點一下。

原始碼：[github.com/yazelin/asr-ime-fcitx](https://github.com/yazelin/asr-ime-fcitx)
