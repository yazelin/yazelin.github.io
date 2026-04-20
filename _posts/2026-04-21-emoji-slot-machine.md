---
layout: post
title: "表情拉霸機：一張自拍變一支 FB 可自動播放、點擊即停的拉霸影片"
subtitle: "靜態前端 + Cloudflare Worker + Gemini 3.1 Flash Image，踩過的 prompt 工程雷全記下來"
date: 2026-04-21
categories: [AI]
tags: [Gemini, Cloudflare Workers, Prompt Engineering, PWA, Facebook, JavaScript, Canvas, MediaRecorder, Vertex AI]
---

> **🔗 快速連結**
> - 🌐 **Live demo**：[yazelin.github.io/emoji-slot-machine](https://yazelin.github.io/emoji-slot-machine/)
> - 💻 **GitHub Repo**：[yazelin/emoji-slot-machine](https://github.com/yazelin/emoji-slot-machine)
> - ☕ **Buy me a coffee**：[buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)（AI 功能的 Gemini quota 就靠這個續命 🙏）

---

## 這個 app 在做什麼

**一句話**：上傳 1 張自拍 → AI 產出 9 種誇張表情的 3×3 圖 → 前端合成一支 WebM 拉霸影片 → 貼到 FB。

```
自拍.jpg ──┐
           ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │  Worker       │──▶│  Gemini 3.1   │──▶│  3×3 grid     │
   │  (加 API key) │   │  Flash Image  │   │  一整張圖      │
   └───────────────┘   └───────────────┘   └───────┬───────┘
                                                   │
                                     ┌─────────────┘
                                     ▼
                            ┌─────────────────────┐
                            │ 前端 canvas 拆成 9  │
                            │ MediaRecorder 錄成  │
                            │ 一支 WebM           │
                            └─────────┬───────────┘
                                      ▼
                               slot-machine.webm
                                      │
                                      ▼
                         貼到 FB → 自動播 → 點擊即停
```

## FB 上面這招為什麼行得通

Facebook 的動態牆會**自動播放短影片**，而且使用者**點一下就會暫停在當下那一影格**。

這是這個 app 整個 gimmick 的命脈：

- 我產出的 WebM 是「9 格洗過牌的表情 × N 圈循環」
- 每一圈洗牌結果都不同
- 所以 FB 播到哪、觀眾點到哪 → 停在**隨機**的某一格表情
- 這是一張**活的**心情占卜，**零 JavaScript** 在觀眾這邊

換句話說，我用一支 30 秒的 WebM 仿造了一個互動 widget，而 FB 原生就能放。

---

## 架構：為什麼要一個 Cloudflare Worker

**懶人版**：只是為了藏 Vertex AI 的 API Key。

完整版：

```
┌───────────────────────────┐        ┌───────────────────────────┐
│  Static frontend (Pages)  │  POST  │   Cloudflare Worker       │
│  index.html / app.js      │───────▶│   worker/src/index.js     │
│                           │  JSON  │   (holds VERTEX_API_KEY)  │
│  - 拆 3×3 圖 (canvas)     │◀───────│                           │
│  - 合成拉霸影片           │        │   fetch → Vertex AI       │
│  (MediaRecorder → WebM)   │        │   gemini-3.1-flash-image  │
└───────────────────────────┘        └───────────────────────────┘
```

有人會問：為什麼不直接在瀏覽器打 Vertex API？

- **API Key 會洩漏**。一旦 key 在前端，任何人打開 DevTools 都能抄走。
- **CORS**。Vertex AI 的 endpoint 預設**不給瀏覽器直接打**（沒開 CORS header），所以就算你想要，瀏覽器也會 block。
- **Rate limit 護欄**。自己擁有 Worker 才能加 IP-based throttling、記 log、看用量。

### Worker 其實有三個端點

| 端點 | 用途 |
|---|---|
| `POST /` | 帶圖 + slot 設定，回傳 3×3 PNG base64 |
| `POST /prompt` | 只組 prompt 不呼叫 Gemini。給「複製到 Gemini」用 |
| `GET /pool` | 回傳表情池 manifest（45 條），讓前端畫自訂 UI |

第二個端點是這個 app 最**省錢**的設計：使用者撞到 rate limit 時，就按「複製到 Gemini」→ prompt 直接貼到 `gemini.google.com` 自己跑，完全不吃我的 quota。

---

## Prompt 工程踩雷日記（最有料的部分）

這個專案折騰最久的**不是前端**，是**怎麼讓 Gemini 乖乖畫 9 格對得上**。

### 第一版：只列 9 條敘述 → 全糊

最早的 prompt 就是樸素地列出：

```
1. ECSTATIC LAUGHTER — head tilted back, eyes squeezed shut...
2. BAWLING CRY — eyes tightly shut with tears streaming...
3. FURIOUS ANGER — brows pulled down, nostrils flared...
...
```

結果：Gemini 產出來的 9 格**順序亂對**，常常第 1 格畫成了第 5 格的表情，或者某兩格長得一模一樣。配對正確率大概 **1-2/9**。

### 第二版：補上 ASCII 3×3 diagram + 位置名 → 救活

加了這段作為錨點：

```
+------+------+------+
|  A   |  B   |  C   |   ← top row
+------+------+------+
|  D   |  E   |  F   |   ← middle row
+------+------+------+
|  G   |  H   |  I   |   ← bottom row
+------+------+------+

  [A] top-left cell → ecstatic laughter
  [B] top-centre cell → bawling cry
  [C] top-right cell → furious anger
  ...
```

配對正確率從 **1-2/9 → 6-9/9**。這是整個專案最有感的一次調整。

### 第三版：字母標籤被烤進圖裡 → 必須「寫在 prompt 但禁止畫出來」

用了字母 `A..I` 當位置 anchor 以後，Gemini **開始在每格左上角真的畫上 `A`、`B`、`C`**。變成一張考卷。

刪掉字母 → 位置又開始歪。留下字母 → 圖上有字。

最後在 `OUTPUT RULES` 裡**顯式寫死**：

```
- Do NOT render any text, letters, numbers, labels, captions, subtitles,
  callouts, watermarks, emoji, arrows, or the letter labels (A..I)
  anywhere on the image.
- The layout above is instruction for you, not text to paint.
```

這兩條強度拉滿以後，才同時擁有「位置對 + 圖上沒字」。

### 第四版：卡通 in → 照片 out → 需要「風格鎖定」條款

有一次丟一張動漫風自拍進去，拿回來的 3×3 是**照片風的人臉**。Gemini 自作主張把卡通「升級」成照片了。

解法：

```
CRITICAL — match the reference's ART STYLE exactly. Whatever the reference is, keep it:
• If reference is a photograph → output photo-realistic portraits.
• If reference is anime / manga → output anime illustrations in the same line-art and shading.
• If reference is a cartoon / chibi → stay cartoon, same linework and palette.
• If reference is 3D-rendered / CGI → stay 3D-rendered.
• If reference is a painting / sketch / watercolor → match that medium.
• If reference is a statue / deity / sculpture → keep sculptural look.

Do NOT "upgrade" the reference into photography.
```

這段加了以後，卡通 in → 卡通 out，雕像 in → 雕像 out。

### 第五版：每次抽 9（從 45）→ 每次都新鮮

第一版 prompt 是**寫死的 9 種**表情。結果使用者拉兩次，會覺得「每次都差不多」。

改成：

- **36 種表情** + **9 種天氣/環境反應** = 45 條池子
- 每次請求**洗牌抽 9**
- 天氣有 50% 機率被「蓋在表情上」當成 overlay
- 組合數 ≈ C(45,9) × 9! ≈ **3.3×10¹²**

於是同一張自拍拉 10 次，得到 10 種完全不同的表情組合，包含「放聲大笑 + 淋雨」、「暴怒 + 被雷打到」這類戲劇化混搭。

### 第六版：天氣格的臉變成另一個人 → 需要身份一致性條款

加了天氣以後新 bug：**「被雷打到」那格的主角變成路人**。因為頭髮豎起來、表情變了，模型就覺得不用維持同一個人。

補上：

```
Identity stays constant across every cell: same face/features, colours,
hairstyle, clothing, and background treatment as the reference. Weather
states (lightning, rain, snow, wind, heat, cold, electrocution, sun-dazzle,
goosebumps) MAY temporarily change hair (wet, windblown, standing on end)
and skin/surface (wet, flushed, frosted, cracked) — that is expected.
The SUBJECT must still be clearly the same character.
```

關鍵是**明白告訴模型**：頭髮可以濕、可以豎、皮膚可以起雞皮疙瘩 — **但主角不能換人**。

完整 prompt 在 [`worker/src/index.js`](https://github.com/yazelin/emoji-slot-machine/blob/main/worker/src/index.js) 裡。

---

## 前端：拆圖 + 錄影都在瀏覽器做

AI 產出是**一整張 3×3 圖**，前端要做兩件事：

### 1. 拆成 9 格

純 `<canvas>`，沒什麼玄機：

```js
const tileW = Math.floor(img.naturalWidth / 3);
const tileH = Math.floor(img.naturalHeight / 3);

for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    ctx.clearRect(0, 0, tileW, tileH);
    ctx.drawImage(
      img,
      c * tileW, r * tileH, tileW, tileH,  // source
      0, 0, tileW, tileH                    // dest
    );
    const dataUrl = canvas.toDataURL("image/png");
    // 存起來當下一步的 frame
  }
}
```

### 2. 合成拉霸影片（MediaRecorder）

關鍵是 `canvas.captureStream(0)` + `track.requestFrame()`：

```js
const stream = canvas.captureStream(0);       // 0 = 手動推 frame
const track = stream.getVideoTracks()[0];
const recorder = new MediaRecorder(stream, {
  mimeType: "video/webm;codecs=vp9",
  videoBitsPerSecond: 5_000_000,
});

recorder.start();

for (const tile of frames) {
  drawTile(ctx, tile, size);
  track.requestFrame();                        // 告訴 recorder：新 frame 來了
  await sleep(1000 / fps);
}

recorder.stop();
const blob = new Blob(chunks, { type: "video/webm" });
```

**沒有任何 ffmpeg / wasm 影片庫**。瀏覽器原生 API 就能做完。

### Frame 順序要小心

每一圈 9 格都洗牌，但如果第 N 圈的最後一格和第 N+1 圈的第一格**長一樣**，FB 播起來就會有一個「定格卡頓」。

```js
let prev = null;
for (let i = 0; i < repeats; i++) {
  const shuffled = shuffle([...tiles]);
  if (prev !== null && shuffled[0] === prev && shuffled.length > 1) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  frames.push(...shuffled);
  prev = shuffled[shuffled.length - 1];
}
```

這段 3 行救掉「圈與圈之間卡頓」的視覺 bug。

---

## PWA + Web Share API

加了 `manifest.json` + `sw.js`，變成**可安裝**的 app：

- 手機 Safari / Chrome → 加到主畫面，有獨立 app icon
- 觀眾不用記網址，跟別的 app 一樣在 drawer 裡
- Service Worker 快取 shell，離線也能打開（AI 功能當然還是要連線）

分享用 `navigator.share()`，能偵測環境自動選支援的分法：

```js
const file = new File([blob], "slot-machine.webm", { type: blob.type });

if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({
    files: [file],
    title: "表情拉霸機",
    text: "點一下影片看你今天的心情 😏",
  });
  return;
}
// 不支援 → 退回下載
alert("請先下載影片再手動上傳到 FB");
```

iOS 上直接跳系統的分享選單，一鍵丟到 FB / Line / Messages。

---

## 自訂 9 格：為什麼要做這個

預設是「9 格全隨機」，對 80% 的用戶夠了。但有人會想要：

- 「第 5 格（正中間）我要是**愛心眼**，其他隨便」
- 「全部都要 **嚎啕大哭**，但天氣各不同」（做梗）
- 「第 1 格我要是『看到帥哥兩眼發亮』」（自訂描述）

所以有了一個 settings dialog：

```
┌─────────────────────────────────────────┐
│        第 1 格                           │
│  [表情：放聲大笑         ▼]             │
│  [天氣：淋雨             ▼]             │
├─────────────────────────────────────────┤
│        第 2 格                           │
│  [表情：🎲 隨機          ▼]             │
│  [天氣：🎲 隨機          ▼]             │
...
```

- **表情**：36 種 preset + 「自訂描述」（自己打一句話）+ 「隨機」
- **天氣**：9 種 preset + 「強制沒有天氣」+ 「隨機」

設定存在 `localStorage`，下次打開還在。

### 對應到 Worker 的 slot model

```js
// 9 格陣列，每一格是：
null                          // 全隨機
{ exprId: 3 }                 // 用 preset id
{ exprCustom: "看到..." }     // 自己打
{ exprId: 3, weatherId: 40 } // 表情 + 天氣
{ weatherNone: true }         // 強制關天氣
```

Worker 的 `buildPrompt()` 會把填好的和空的混著用，空的就從剩下的 pool 隨機抽。

---

## 省錢小撇步（給其他人抄作業）

AI 功能是**我付錢**呼叫 Gemini。rate limit 撞到 → 大家就一起炸。

三個解法，依序推薦：

### 1. 按「複製到 Gemini」（最省）

```
Settings → 自訂 9 格 → 複製到 Gemini
→ 貼到 gemini.google.com 自己跑
→ 拿到 3×3 圖回來丟進 ① 直接上傳
```

完全不走我的 Worker，免費、免排隊。

### 2. 自己 deploy 一份 Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put VERTEX_API_KEY
npx wrangler deploy
```

然後在你的瀏覽器：

```js
localStorage.setItem("slot-api-url", "https://YOUR.workers.dev");
```

你就有自己的一份，用自己的 quota、自己的錢。

### 3. 用其他工具產圖（ChatGPT / Flow / Midjourney）

App 的 step ① 可以直接收任何 3×3 圖。只要那張圖**三等分切**起來每格是獨立的表情就行。

---

## 你可以拿這個專案做什麼

拉霸影片 trick 不是只能拿來做表情包：

- **9 張塔羅牌**：同一個問題、9 種答案
- **9 句幸運話**：「今天會遇到前任 / 會中午餐 / 老闆加班…」
- **9 種星座運勢**：生日當禮物很剛好
- **9 種穿搭推薦**：同一個人、9 套造型
- **9 種餐點**：午餐選擇困難症的救星

核心是 **FB 自動播 + 點擊即停** = **一支影片 = 一個互動 widget**。

---

## 結語

這個專案對我來說是三件事的交集：

1. **prompt engineering 的血淚**：每一條規則背後都有一次「產出看起來很怪」的實際經驗
2. **純前端能做到的事比想像中多**：拆圖 / 錄影 / 分享全在瀏覽器，後端只是個 API Key 保險箱
3. **FB 這種老平台的新玩法**：限制反而是 trick 的溫床

Repo 在這裡：<https://github.com/yazelin/emoji-slot-machine>

覺得好玩的話 → Star repo / [Buy me a coffee ☕](https://buymeacoffee.com/yazelin)。實測每 50 個 coffee 大概等於 API 費用打平一個月，讓這支 demo 繼續活著 🙏
