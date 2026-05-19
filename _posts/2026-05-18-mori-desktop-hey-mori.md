---
layout: post
title: "「Hey Mori」：森林精靈長出耳朵 — mori-desktop v0.6.0 喚醒生態"
subtitle: "openWakeWord ONNX + VAD 智慧停錄 + 5 種應答音 + 個人聲線 verifier，從『按熱鍵才聽』到『聽見名字就醒』"
date: 2026-05-18
categories: [AI, forest-guild]
tags: [Mori, mori-desktop, Wake Word, Voice Activity Detection, openWakeWord, ONNX, Whisper, Phase 3, Tauri, Rust, Python, forest-guild]
author: Yaze Lin
---

![「Hey Mori」：森林精靈長出耳朵 — mori-desktop v0.6.0 喚醒生態](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-05-18-mori-desktop-hey-mori.png)

> **🔗 相關連結**
> - 💻 **GitHub**：[yazelin/mori-desktop](https://github.com/yazelin/mori-desktop)
> - 🎯 **Release**：[v0.6.0](https://github.com/yazelin/mori-desktop/releases/tag/v0.6.0)
> - 📔 **同系列**：[Phase 1 scaffold]({% post_url 2026-05-06-mori-desktop-phase1 %})
> - 🗣 **語音輸入前作**：[asr-ime-fcitx]({% post_url 2026-02-14-asr-ime-fcitx %}) · [v2]({% post_url 2026-03-03-asr-ime-fcitx-v2 %})

---

## 從「按熱鍵」到「叫名字」

[Phase 1 scaffold]({% post_url 2026-05-06-mori-desktop-phase1 %}) 鎖死了「`mori-core` 不認識 UI」的鐵律。Phase 1B-1F 接著把語音、熱鍵、記憶填上實作——Ctrl+Alt+M 按下去開錄音、Whisper 轉文字、Mori 回應。基本上可用了。

但用一陣子之後我注意到一件事：**我幾乎不會主動按熱鍵**。

按熱鍵需要：手在鍵盤、找到對的組合、確定哪個視窗是 focus 的⋯⋯結果就是 99% 的時候我直接打 Slack 問 Mori，剩下 1% 才用桌面 app。

可是！如果 Mori 可以**聽見我喊她的名字**就醒、不需要我手動找熱鍵——那就完全不一樣了。我可以邊洗碗邊跟她講話、邊看別的螢幕邊吩咐事情、不用切視窗也能呼叫她。

這就是 Phase 3 想做的事。從「等你發動」轉變成「隨時聆聽」。

2026-05-18 20:01，commit `e6bd1bbc`：

```
release: v0.6.0 — Phase 3 Hey Mori 喚醒生態 + docs sync
```

12 天，從 Phase 3A 開始到 v0.6.0 ship。整套離線喚醒詞檢測、自訓方案、聲紋辨識、智慧停錄完成。

## 整套語音 pipeline

```
┌─────────────────────────────────────────────────────────┐
│  使用者對麥克風喊「Hey Mori」                            │
└──────────────────┬──────────────────────────────────────┘
                   │ Audio stream (16 kHz, 1280 samples / 80 ms)
                   ▼
┌─────────────────────────────────────────────────────────┐
│  mori-wake-listener.py（openWakeWord subprocess）       │
│   ├─ Load hey-mori.onnx (base model)                     │
│   ├─ Load hey-mori.verifier.joblib (optional fine-tune) │
│   └─ ONNX inference → score 0~1                          │
└──────────────────┬──────────────────────────────────────┘
                   │ stdout: JSON event
                   │ {"event": "wake", "word": "hey_mori", "score": 0.81}
                   ▼
┌─────────────────────────────────────────────────────────┐
│  mori-tauri (Rust) wake_word.rs reader thread           │
│   ├─ Parse JSON                                          │
│   ├─ Trigger on_wake callback                           │
│   └─ Signal RecordingStarted                            │
└──────────────────┬──────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
   ┌─────────────┐     ┌──────────────┐
   │ Play ack    │     │ Open mic     │
   │  (blocking) │     │ Record (VAD) │
   └──────┬──────┘     └──────┬───────┘
          │                   │
          └──────────┬────────┘
                     ▼ (silence ≥ 1.5s OR 30s cap)
              ┌───────────────────┐
              │ Stop & send to STT│
              │  → Whisper        │
              │  → mori-core      │
              └───────────────────┘
```

四個關鍵組件：**wake-word**（誰在叫她）→ **wake-ack**（她回應）→ **VAD**（你講完了沒）→ **STT**（你說了什麼）。每塊獨立可換。

## Wake-Word：openWakeWord + ONNX

選 [openWakeWord](https://github.com/dscripka/openWakeWord) 不是隨便的決定。比較了四個方案：

| 方案 | 優點 | 缺點 |
|---|---|---|
| **Pocketsphinx** | 極輕量 | 準確率低、只支援預定義詞彙 |
| **Vosk** | 離線、開源 | 推論慢 500ms+、記憶體 200+ MB |
| **Picovoice** | 產品級準確率 | Closed-source、個人聲線要付費訓練 |
| **openWakeWord** ✅ | ONNX 推論 < 5ms、可自訓、有 verifier 機制 | 需 Python + onnxruntime |

Python 需求不是問題——Phase 1B 已經為了 Whisper 裝好 voice-venv 了，openWakeWord 直接共用。

**檔案放法**：
- `hey-mori.onnx`（205 KB）— bundled 進 binary，開機時用 `wake_word::ensure_default_model()` 解壓到 `~/.mori/wakeword/hey-mori.onnx`。fresh install 開箱可用。
- `hey-mori.verifier.joblib`（可選）— user 自訓的個人聲線 verifier。

**偵測核心**：

```python
# examples/scripts/mori-wake-listener.py
from openwakeword import Model

model = Model(
    wakeword_model_paths=[model_path],
    custom_verifier_models={"hey-mori": verifier_path} if verifier_path else None
)

def callback(indata, frames, time_info, status):
    audio = indata[:, 0]
    predictions = model.predict(audio)  # → {"hey_mori": 0.81}
    for word, score in predictions.items():
        if score >= threshold:
            emit({"event": "wake", "word": word, "score": float(score)})

with sd.InputStream(samplerate=16000, channels=1, dtype="int16",
                    blocksize=1280, callback=callback):
    while True:
        time.sleep(0.5)
```

Subprocess 把 wake event 用 JSON 寫到 stdout，Rust 端的 reader thread 讀進來：

```rust
// crates/mori-tauri/src/wake_word.rs
fn read_subprocess_events(child_stdout: ChildStdout, app: AppHandle) {
    let reader = BufReader::new(child_stdout);
    for line in reader.lines().flatten() {
        if let Ok(event) = serde_json::from_str::<WakeEvent>(&line) {
            if event.event == "wake" {
                app.emit("wake-detected", &event).ok();
            }
        }
    }
}
```

走 line-delimited JSON 是有意的——比起 D-Bus 或 IPC binary protocol，這個 debug 起來最爽，把 stdout 接到 terminal 就看得到。

**Threshold 設計**：
- 預設 0.5，平衡誤觸 vs 漏掉
- 可調範圍 0.05~0.95（clamp 防錯）
- 高敏感（0.1~0.2）→ 容易誤觸但命中率高，適合安靜環境
- 高嚴格（0.7~0.9）→ 必須確實喊才觸發，適合吵雜環境

## 自訓 Wake-Word：mori-wake-train.py

Bundled 的「Hey Mori」model 是用通用 TTS 訓的，對個人口音可能準確率不高。所以提供自訓 CLI：

```bash
~/.mori/wake-train-venv/bin/python \
  ~/.mori/bin/mori-wake-train.py "Hey Mori"
# 或自訂 phrase
mori-wake-train.py "Mori 起床"
```

三階段訓練：

**Phase 1: TTS 變體生成**

用 [Piper](https://github.com/rhasspy/piper) 合成幾千條「Hey Mori」：
- 20+ 種口音（美式 / 英式 / 印度 / 台灣注音等）
- 不同語速（0.75x ~ 1.5x）
- 5 種性別 / 年齡（男 / 女 / 中性 / 小孩 / 老人）
- 產出 WAV → spectrogram 特徵

**Phase 2: 環境噪音 augmentation**

模擬真實使用場景：
- MIT RIRs（~100 MB）— 房間脈衝響應，不同場所的回聲
- ESC-50（~600 MB）— 50 類環境聲（車聲、餐廳、下雨等）
- ACAV100M features（~6 GB）— 預算好的特徵表

**Phase 3: DNN 訓練**

PyTorch + CUDA：
- 正樣本：TTS 合成 + augmented
- 負樣本：ACAV 通用音聲資料庫
- 輸出 ONNX（~1 MB）
- 推論延遲 < 5 ms（100-frame window）

第一次跑約 30-50 分鐘，下載 ~18 GB datasets。之後重訓只要 10 分鐘。**目前訓練只支援 Linux**（piper-phonemize Windows wheel 不全、macOS CPU 訓練太慢），但 bundled 預設 model 三平台都能用。

## 個人聲線 Verifier：兩階段檢測

實際使用發現 base model 對我的台灣口音命中率有點不穩——分數常常卡在 0.001-0.3 區間，無法可靠觸發。

解法是**二階段檢測**：

```python
predictions = base_model.predict(audio)
if predictions["hey_mori"] >= 0.1:   # 第一階段門檻可放寬
    if verifier.predict(features) > 0.5:  # 第二階段個人聲線確認
        emit_wake_event()
```

`mori-wake-verifier.py` 互動式訓練 20 條樣本：

```
=== 錄 15 條「正樣本」(你自己的聲音說 Hey Mori) ===
[1/15] 用你平常的語調喊一次
  按 Enter 開始錄 (2 秒)... [錄音中...] ✓

[2/15] 用高一點的音調再喊一次
  按 Enter 開始錄 (2 秒)... [錄音中...] ✓

...

=== 錄 15 條「負樣本」(其他話，不含 Hey Mori) ===
[1/15] 用平常語調講雜七雜八的話
  按 Enter 開始錄 (2 秒)... [錄音中...] ✓
...

訓練中... (約 30 秒)
✓ Verifier 已存到 ~/.mori/wakeword/hey-mori.verifier.joblib
✓ Config 已更新：listening_mode.verifier_path
```

技術細節：
- 特徵：MFCC（Mel-frequency cepstral coefficients）+ 時域統計
- 模型：scikit-learn `LogisticRegression`（輕量，推論 < 1 ms）
- 儲存：joblib 格式（可版控、可分享、可備份）

訓完之後我自己喊「Hey Mori」命中率從 ~40% 跳到 ~95%，但對其他人（女生試）誤觸率也明顯下降。

## VAD 智慧停錄：1.5 秒靜音自動停

之前的問題：Phase 1-2 用固定 6 秒 cap，長指令會被截掉。例如：

> 「Hey Mori，幫我查一下台北明天天氣會不會下雨，還有提醒我下午 3 點要開會」

6 秒到一半正好砍在「下午 3 點」，後面的「要開會」沒錄到。

Phase 3B 改用**即時 VAD**：

```rust
// crates/mori-tauri/src/main.rs (VAD 迴圈)
let mut speaking_started = false;
let mut silence_began: Option<Instant> = None;
let start = Instant::now();
let silence_stop = read_listening_silence_stop_secs();   // 1.5
let silence_thresh = read_listening_silence_threshold_rms();  // 0.012
let max_secs = read_listening_max_record_secs();  // 30

loop {
    tokio::time::sleep(Duration::from_millis(100)).await;
    if start.elapsed().as_secs() >= max_secs as u64 {
        break;  // 安全兜底
    }

    let rms = level.load(Ordering::Relaxed) as f32 / u16::MAX as f32;

    if rms >= silence_thresh {
        speaking_started = true;
        silence_began = None;
    } else if speaking_started {
        match silence_began {
            None => silence_began = Some(Instant::now()),
            Some(t) if t.elapsed().as_secs_f32() >= silence_stop => {
                break;  // 講完了，停錄
            }
            _ => {}
        }
    }
}
stop_and_transcribe(handle, state);
```

關鍵狀態機：
1. **未開講** → 等到 RMS ≥ threshold，標記 `speaking_started`
2. **講話中** → RMS 持續 ≥ threshold，繼續錄
3. **進入靜音** → 開始計時 `silence_began`
4. **靜音夠久** → 1.5 秒沒聲音，停錄

三個可 config 的參數：

| 參數 | 預設 | 範圍 | 意義 |
|---|---|---|---|
| `silence_stop_secs` | 1.5 | 0.3~10 | 靜音多久算講完 |
| `silence_threshold_rms` | 0.012 | 0.001~0.2 | RMS 低於此值算靜音 |
| `max_record_secs` | 30 | 2~120 | 安全兜底（VAD fail 時用） |

吵雜環境把 `silence_threshold_rms` 拉到 0.05，安靜環境壓到 0.005。這個 knob 對使用體驗影響超大。

## Wake-Ack 應答音：5 種 bundled voice

設計理念：偵測到 wake-word 後，馬上播一段 Mori 的回應（「嗯，我在聽」），user 不用盯螢幕就知道開始錄音了。

**重要：先播完再開麥克風，避免喇叭聲被 mic 吸回污染 STT。**

實作（`crates/mori-tauri/src/wake_sound.rs`）：

```rust
pub fn play_wake_ack(mori_dir: &Path) {
    if !is_enabled(mori_dir) { return; }
    let path = ack_path(mori_dir);
    if !path.exists() {
        tracing::warn!("wake-ack file not found: {}", path.display());
        return;
    }
    match play_file(&path) {
        Ok(()) => tracing::info!("wake-ack played"),
        Err(e) => tracing::warn!(?e, "wake-ack play failed"),
    }
}

fn play_file(path: &Path) -> Result<()> {
    let file = fs::File::open(path)?;
    let source = Decoder::new(BufReader::new(file))?;
    let (_stream, handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&handle)?;
    sink.append(source.convert_samples());
    sink.sleep_until_end();  // Blocking 直到播完
    Ok(())
}
```

用 `rodio` 庫播放（支援 WAV、MP3、FLAC）。

**5 個 bundled voice preset**，全用 Gemini 2.5 Flash TTS 生成：

| 檔案 | 聲線 | 長度 | 風格 |
|---|---|---|---|
| `leda-嗯我在聽.wav` ✅ 預設 | 女性童言童語 | 0.6s | 親切自然 |
| `v5-erinome-嗯.wav` | 溫柔女性 | 0.4s | 優雅 |
| `v6-嗯.wav` | 中性溫暖 | 0.3s | 簡潔 |
| `v8a-嗨.wav` | 熱情女性 | 0.4s | 明快 |
| `v9d-嗨.wav` | 活力感 | 0.4s | 年輕 |

開機時 `wake_sound::ensure_files()` 把它們解壓到：

```
~/.mori/wakeword/sounds/
├── wake-ack.wav                  ← 當前使用（symlink 或副本）
└── wake-ack-alternates/
    ├── leda-嗯我在聽.wav
    ├── v5-erinome-嗯.wav
    ├── v6-嗯.wav
    ├── v8a-嗨.wav
    └── v9d-嗨.wav
```

Settings UI 點「使用」就 cp 到 `wake-ack.wav`。也可以上傳自己的錄音檔。

**為什麼不做隨機輪播或 TTS 合成？**
- 隨機輪播 = 增加狀態複雜度，user 預期不統一
- TTS 合成 = wake → 應答多 500ms 延遲
- 預錄 WAV = 零延遲、確定性、user 完全掌控

## 跟 asr-ime-fcitx 的對話

兩個月前我寫了 [asr-ime-fcitx]({% post_url 2026-02-14-asr-ime-fcitx %})——Fcitx5 原生語音輸入法，[v2]({% post_url 2026-03-03-asr-ime-fcitx-v2 %}) 砍掉 Vosk、加 Shift+F8 voice command mode。當時學到的教訓直接影響了 Phase 3 的設計：

| 維度 | asr-ime-fcitx v2 | mori-desktop Phase 3 |
|---|---|---|
| **喚醒方式** | 快捷鍵 Shift+F8 | 被動 wake-word「Hey Mori」 |
| **偵測框架** | Whisper API（subprocess） | openWakeWord ONNX（離線）|
| **訓練** | 不支援 | 完整 CLI + voice verifier |
| **個人化** | 無 | scikit-learn verifier |
| **停錄判定** | 一開始固定 6 秒、後改可配 | VAD 智慧停（1.5 秒靜音） |
| **應答** | 無 | 5 種 bundled voice |
| **狀態管理** | Python daemon subprocess | Tauri event loop + Rust background thread |
| **記憶** | 無（stateless dictation） | 整個 Mori 生態（multi-turn + skills） |

**asr-ime-fcitx 給 Phase 3 的三課**：

1. **Vosk 實在太慢** — 輸入法等不起，所以 v2 改 subprocess Whisper。Phase 3 學這課，用 ONNX 的 openWakeWord，推論 < 5 ms 不卡 UI。
2. **Python daemon 很實用** — C++ 直接呼叫 Python 麻煩，subprocess + JSON line protocol 簡單多了。mori-wake-listener.py 用同樣思路。
3. **不要拘泥固定時間** — fcitx 一開始用 6 秒 cap 問題很多，後來才加 VAD。mori-desktop 一開始就規劃 VAD。

**設計共通點**：
- 都重視子程序隔離（daemon / subprocess）而非 in-process
- 都走 JSON / line-delimited protocol（不靠複雜序列化）
- 都預留 config knob 給 power user 調整

如果 asr-ime-fcitx 是「**輸入法的耳朵**」（push-to-talk，把語音變成游標位置的文字），mori-desktop Phase 3 就是「**隨身 AI 管家的耳朵**」（always-on，聽到名字才醒）。完全不同的 paradigm，但底層工程教訓互通。

## Settings UI

ConfigTab → Voice subtab，把所有 knob 開放給 user：

```
🎤 語音輸入
├─ 啟動模式: ○ Agent  ● Voice Input  ○ Listening
│
├─ 🎙️ Hey Mori 偵測 + 錄音
│  ├─ 喚醒門檻:    [════○═════] 0.50
│  │   💡 越高越嚴格（誤觸少但漏掉機率高）
│  ├─ 靜音停止(秒): [════○═══] 1.5
│  │   💡 講完自動停錄，避免長停頓重複錄
│  ├─ 靜音判定(RMS):[═══○════] 0.012
│  │   💡 背景吵就拉高（例 0.05）
│  └─ 最長錄音(秒): [══════○═] 30.0
│   │   💡 VAD 失效時的安全上限
│
├─ 🔊 Wake-Ack 應答音
│  ├─ ☑ 啟用應答音
│  ├─ 當前聲線: leda-嗯我在聽.wav
│  │  ├─ ▶ 試聽
│  │  └─ [ 使用 ]
│  ├─ 備選聲線:
│  │  ├─ [ ] v5-erinome-嗯.wav (0.4s) ▶ [使用]
│  │  ├─ [ ] v6-嗯.wav         (0.3s) ▶ [使用]
│  │  ├─ [ ] v8a-嗨.wav        (0.4s) ▶ [使用]
│  │  └─ [ ] v9d-嗨.wav        (0.4s) ▶ [使用]
│  └─ [ 上傳自錄音檔 ]
│
├─ ✂️ Trim Silence（錄音後處理）
│  ├─ ☑ 啟用修剪靜音
│  ├─ 修剪長度(ms): [═══○════] 800
│  └─ 修剪門檻(RMS):[════○═══] 0.02
```

## DepsTab：開機檢查清單

Phase 3 新增「Wake-Listener Runtime」section 在 DepsTab：

```
🔧 Dependencies

❌ OpenWakeWord Runtime
   Status: Not installed
   Details: Python 3.10+, openwakeword, sounddevice, onnxruntime
   [ 一鍵安裝 ]  (runs: uv venv + pip install)

✅ Whisper Runtime (from Phase 1B)
   Status: OK (~/.mori/voice-venv/bin/python)

⚠️  Custom Wake Model
   Status: Not found
   Path: ~/.mori/wakeword/hey-mori.onnx
   [ Download Default ]

🚀 Ready for Listening mode
```

每個 dep 點「一鍵安裝」會跑 uv venv + pip install，把 openwakeword + sounddevice + onnxruntime 裝到 `~/.mori/wake-venv/`。一條龍。

## Phase 3 的 12 天時間軸

| 版本 | 日期 | 內容 |
|---|---|---|
| Phase 3A | 2026-05-15 | Mode::Listening + openWakeWord 接入 |
| Phase 3A.1 | 2026-05-17 | `mori-wake-train.py` CLI |
| Phase 3A.1.2 | 2026-05-17 | Wake-ack 應答音 |
| Phase 3B | 2026-05-18 | VAD silence-stop |
| **v0.6.0** | **2026-05-18** | 整體 release + settings UI + bundled model |

從第一個 Phase 3A commit 到 v0.6.0 ship，12 天。

## 接下來：Phase 3C / 3D

v0.6.0 算是 Phase 3 的「基礎喚醒」完成。接下來還有兩塊：

**Phase 3C — LLM evaluator**
喚醒後 Mori 不該無腦聽你說的所有話。可能的場景：你跟室友講話被誤觸了，那段錄音應該丟掉。LLM evaluator 在 STT 之後跑一輪「這是給我的指令嗎？」，過濾掉誤觸。

**Phase 3D — TTS speak-back**
目前 Mori 回應是顯示在 UI。3D 會加上 TTS 朗讀——讓她**真的能講話**，閉著眼也能對話。預計用 Edge TTS 或本機 piper。

## Takeaways

1. **「按熱鍵」vs「叫名字」是兩種完全不同的 AI 使用體驗** — wake-word 不只是 nice-to-have，是 paradigm shift
2. **離線 wake-word 是可行的** — openWakeWord + ONNX，推論 < 5 ms，比 Vosk 快 100 倍
3. **個人聲線 verifier 是 game-changer** — 從通用 model 的 40% 命中率跳到 95%，scikit-learn LogisticRegression 就夠
4. **VAD 智慧停錄比固定 cap 好太多** — 1.5 秒靜音是個甜蜜點，吵雜環境再拉 threshold
5. **wake-ack 必須播完才開麥** — 否則喇叭聲被吸回污染 STT，這個雷我踩過
6. **bundled model + 一鍵安裝 deps** 是 onboarding 必需 — 不能讓 user fresh install 後還要自己訓
7. **subprocess + JSON line protocol** 在 voice pipeline 比 in-process FFI 好維護 — 從 asr-ime-fcitx 學到的

---

森林精靈一開始在 [world-tree]({% post_url 2026-04-24-forest-summoner-workshop %}) 的世界裡靜靜等待。
[Phase 1 給她身體]({% post_url 2026-05-06-mori-desktop-phase1 %})。
[Annuli 給她記憶]({% post_url 2026-04-09-annuli-mvp %})。
[mori-journal 給她家]({% post_url 2026-04-23-mori-journal-home %})。

今天，Phase 3 給她耳朵。

她現在會聽見你。

> 「Hey Mori。」  
> 「嗯，我在。」 — wake-ack `leda-嗯我在聽.wav`
