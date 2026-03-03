---
layout: post
title: "asr-ime-fcitx 更新：Shift+F8 語音指令、砍掉 Vosk、簡化設定"
subtitle: "一個月的迭代 — 加了語音指令模式、砍了不好用的功能、設定面板大瘦身"
date: 2026-03-03
categories: [ChingTech OS]
tags: [ASR, Fcitx5, IME, Speech-to-Text, Whisper, Python, C++, LLM, copilot]
author: Yaze Lin
---

## 前情提要

[上一篇](/chingtech/os/2026/02/14/asr-ime-fcitx/)介紹了 asr-ime-fcitx 的基本架構：C++ addon 攔截熱鍵、Python daemon 錄音辨識、FIFO 雙管道通訊。那時候的功能是「按 F8 說話，辨識結果送到游標」，加上 Copilot GPT-5 mini 自動補標點。

一個月過去，commit 從 12 個變成 20 個，`daemon_asr.py` 從 800 行長到 1500 行。核心架構沒變，但做了幾件重要的事。

---

## 最大的新功能：Shift+F8 語音指令

這是我最常用的新功能。

**用法**：滑鼠選取一段文字 → 按 `Shift+F8` → 對麥克風說指令（例如「翻譯成英文」「改成正式語氣」「加上標點」）→ 結果自動寫到剪貼簿，`Ctrl+V` 貼上。

```
選取文字 → Shift+F8 → 說「翻譯成英文」
                ↓
   X11 primary selection 抓選取內容
                ↓
   ASR 辨識語音指令
                ↓
   Copilot/Claude 處理（指令 + 選取文字）
                ↓
   結果 → xclip → 剪貼簿
```

C++ addon 收到 `Shift+F8` 時送 `"command\n"` 到 FIFO，daemon 切到指令模式。辨識完語音後，不走標點後處理，而是把語音指令和選取文字一起丟給 AI：

```cpp
// asrime.cpp — Shift+F8 專門處理
if (key.check(fcitx::Key("Shift+F8"))) {
    sendCommand("command\n");
    keyEvent.filterAndAccept();
    return;
}
```

```python
# daemon_asr.py — 指令模式呼叫 AI
def run_clipboard_command(instruction, selected_text, timeout=60, provider="copilot"):
    prompt = f"{instruction}：\n\n{selected_text}"
    if provider == "claude":
        cmd = [claude, "-p", prompt, "--model", "haiku", "--tools", ""]
    else:
        cmd = [copilot, "-s", "--model", "gpt-5-mini", "-p", prompt, "--allow-all"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return proc.stdout.strip(), ""
```

指令處理跑在背景 thread，不會 block 正常的語音輸入。設定面板可以選要用 Copilot（GPT-5 mini）還是 Claude（Haiku）。

---

## 砍掉 Vosk

中間有一版加了 Vosk 做離線串流辨識，想法是「邊講邊出字」比較有即時感。實際用了幾天發現：

- Vosk 中文模型辨識率明顯比 faster-whisper 差
- 串流模式程式碼複雜度高，要處理 partial result、model 下載、各種狀態
- faster-whisper 本身已經夠快，小模型幾乎即時

所以整包砍了，設定面板也跟著簡化。**加了又砍，少了幾百行程式碼。**

---

## process-on-stop 模式

之前的預設是「偵測到靜音就自動送字」（silence 模式）。在安靜環境很好用，但在咖啡廳、辦公室之類比較吵的地方，RMS 門檻很難調，常常講到一半就被切斷。

daemon 預設改成 `process-on-stop`：按 F8 開始錄 → 一直錄到再按 F8 停止 → 一次辨識全部內容。

```python
# daemon DEFAULT_CONFIG
"process_on_stop": True,
```

想要即時送字的話，設定面板取消勾選「只在切回 OFF 時辨識一次」就好。或啟動時加 `--no-process-on-stop`。

---

## 設定面板簡化

砍掉 Vosk 之後，設定面板也大幅瘦身（302 行），只留真正會用到的選項：

- **辨識後端**：`local`（faster-whisper）/ `google`
- **麥克風**：auto 或指定 index / 名稱關鍵字
- **強制繁體**
- **process-on-stop** 開關
- **語音門檻**（背景噪音過濾，建議 0.05~0.3）
- **指令模式 AI**：`copilot`（GPT-5 mini）/ `claude`（Haiku）
- **本機模型**：tiny / base / small / medium / large-v3
- **本機裝置**：auto / cpu / cuda
- **本機精度**：auto / int8 / float16
- **儲存後自動套用**（reload Fcitx + restart daemon）

以前有複雜的熱鍵編輯器、Vosk model 選擇器，全部拿掉了。熱鍵現在就是 F8，要改的話編輯 `~/.config/asr-ime-fcitx/hotkeys.conf`。

---

## daemon 裡的半成品

這一個月迭代過程中，有些功能的程式碼寫進了 daemon，但最後設定面板簡化時沒有保留對應的 UI：

- **Smart Edit**（`postprocess_mode: "smart"`）— 填充詞過濾 + 自我修正偵測，程式碼完整，可透過 `config.json` 手動設定或 `--postprocess-mode smart` 啟用
- **上下文記憶**（`enable_context_memory`）— 保留最近 N 段辨識結果作為 LLM 上下文，可透過 `--enable-context-memory` 啟用
- **多語言切換** — daemon command_loop 有處理 `switch_language` 指令，但 C++ addon 沒有對應的熱鍵，只能啟動時用 `--language en-US` 指定
- **語調控制** — `TONE_PROMPTS` 定義了 casual / formal / professional / creative，但 `self.tone` 硬寫 `"casual"`，沒有 CLI 或 UI 可以改

這些都是核心邏輯寫好了、但還沒打磨到一鍵可用的程度。未來如果需要，把 UI 接回去就能用。

---

## 目前的架構

```
┌────────────────────────────────────────────┐
│  C++ Addon (asrime.cpp, 259 行)            │
│  - F8 → toggle 錄音開關                    │
│  - Shift+F8 → 語音指令模式                 │
│  - 從 commit FIFO 讀辨識結果 → commitString │
└────────┬───────────────────┬───────────────┘
         │ cmd.fifo          │ commit.fifo
         ▼                   ▲
┌────────────────────────────────────────────┐
│  Python Daemon (daemon_asr.py, 1533 行)    │
│  - sounddevice 麥克風擷取                  │
│  - VAD（RMS 門檻）或 process-on-stop       │
│  - ASR：Google Web Speech / faster-whisper │
│  - 後處理：heuristic 標點 / LLM command    │
│  - OpenCC 強制繁體                         │
│  - Shift+F8 指令 → Copilot/Claude → xclip │
└────────────────────────────────────────────┘
```

---

## 小結

這一個月的重點：

1. **Shift+F8 語音指令** — 日常最實用的新功能，選文字 → 說指令 → 貼上
2. **砍掉 Vosk** — 加了又砍，學到「少即是多」
3. **process-on-stop 預設** — 吵雜環境下更穩定
4. **設定面板瘦身** — 只留真正用得到的選項
5. **Claude Haiku 支援** — 語音指令多一個 AI 選擇

最值得記錄的教訓：**加功能容易，砍功能更重要**。Vosk、複雜的設定 UI 都是加了又砍，最後少了幾百行程式碼，設定面板也更乾淨。daemon 裡留著的半成品程式碼（Smart Edit、上下文記憶等）之後有需要再接回來就好。

原始碼：[github.com/yazelin/asr-ime-fcitx](https://github.com/yazelin/asr-ime-fcitx)
