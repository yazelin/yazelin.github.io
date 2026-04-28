---
layout: post
title: "LINE 貼圖製造機：一張角色圖變一整套可上架的 LINE 貼圖"
subtitle: "Vertex AI + Cloudflare Worker + LINE Login，把『畫不出來但想要自己貼圖』這件事變成 60 秒一鍵流程"
date: 2026-04-28
categories: [AI]
tags: [Gemini, Cloudflare Workers, LINE Login, OAuth, PKCE, Cloudflare KV, Prompt Engineering, Chroma Key, Canvas, IndexedDB, JavaScript, Vertex AI, LINE Creators Market]
---

> **🔗 快速連結**
> - 🌐 **Live demo**：[yazelin.github.io/line-sticker-studio](https://yazelin.github.io/line-sticker-studio/)
> - 💻 **GitHub Repo**：[yazelin/line-sticker-studio](https://github.com/yazelin/line-sticker-studio)
> - 🎰 **姊妹工具**：[yazelin.github.io/emoji-slot-machine](https://yazelin.github.io/emoji-slot-machine/)（同一套架構，不同產品）
> - ☕ **Buy me a coffee**：[buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)（Gemini quota 就靠這個續命 🙏）

---

## 這個 app 在做什麼

**一句話**：上傳 1 張角色圖 → AI 產出 8 張同角色不同表情的 LINE 貼圖 → 下載 ZIP → 拖到 LINE Creators Market 上架。

```
角色.jpg ──┐
           ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │  Worker       │──▶│  Gemini 3.1   │──▶│  3×3 grid     │
   │  (LINE auth + │   │  Flash Image  │   │  (chroma-key  │
   │   API key)    │   │               │   │   green bg)   │
   └───────────────┘   └───────────────┘   └───────┬───────┘
                                                   │
                                     ┌─────────────┘
                                     ▼
                            ┌─────────────────────┐
                            │ 前端 split → 9 張   │
                            │ chroma-key 去背     │
                            │ fitWithPadding 10px │
                            │ JSZip → 8 張+main+tab│
                            └─────────┬───────────┘
                                      ▼
                              line-stickers.zip
                                      │
                                      ▼
                         拖到 LINE Creators Market
                              → 1-7 天後上架
```

跟[姊妹工具表情拉霸機](https://yazelin.github.io/emoji-slot-machine/)是同一套基底（靜態前端 + Cloudflare Worker proxy + Gemini 3.1 Flash Image），但目標完全不同：拉霸機是**拿來貼 FB 玩**的、3×3 + WebM；貼圖製造機是**拿來上架賺錢**的，必須符合 LINE 嚴格的尺寸 / 透明 / 排版規格。

很多需求只有「真的去研究上架流程」才會冒出來，這篇就是把這些坑全部寫下來。

---

## 為什麼要做這個

LINE 貼圖一直是台灣的小確幸經濟。LINE Creators Market 開放給所有人上架，每張靜態貼圖最低售 **NT$30**，創作者拿 **50%**。

但要自己上架要過幾關：

1. **要會畫**：8 張同角色、不同姿勢、不同表情
2. **規格要對**：370×320 的透明 PNG、邊緣留 10px padding、main 240×240、tab 96×74
3. **要打包正確**：ZIP 內檔名要 `01.png`～`08.png` + `main.png` + `tab.png`
4. **要符合審核規定**：別人的肖像、品牌、藝人、卡通角色都會被退件

第 1 條是最難的 — 「我有靈感但沒繪畫底子」是 90% 一般人卡關的點。

AI 圖像生成（特別是 Gemini 3.1 Flash Image，**reference-driven** 的能力比 Midjourney 強很多）剛好解掉這條。剩下 2、3、4 全部用工具自動化，**60 秒從一張自拍變一整套可上架的 ZIP**。

---

## LINE Creators Market 規格（坑很多）

研究上架流程踩到的坑：

### 尺寸不能搞錯

| 檔案 | 尺寸 | 用途 |
|---|---|---|
| `01.png` ~ `08.png` | 370 × 320 | 主貼圖（聊天裡顯示這個） |
| `main.png` | 240 × 240 | 商店頁 thumbnail |
| `tab.png` | 96 × 74 | 聊天室貼圖選單的 tab icon |

最容易錯的是 `tab.png`：**不是正方形**。96 × 74 是橫向長方形，因為要放在 LINE 聊天室底下的 tab bar 裡。

### 必須留 10px padding

每張貼圖**四邊都要留 10px 透明邊**。LINE 要這個邊是因為他們會在貼圖外圍加一層白色光暈當「按下去」的視覺反饋。沒留邊 → 光暈會吃掉內容 → 可能被退件。

我的解法是去背完之後跑一個 `fitWithPadding`：

```js
// 1. 找出 alpha > 32 的 bbox
// 2. 把整個 character scale-fit 進 (W-20, H-20)
// 3. 置中放在透明 W×H canvas 上
function fitWithPadding(srcCanvas, targetW, targetH, padding = 10) {
  const data = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  let minX = srcCanvas.width, minY = srcCanvas.height, maxX = 0, maxY = 0;
  for (let y = 0; y < srcCanvas.height; y++) {
    for (let x = 0; x < srcCanvas.width; x++) {
      if (data.data[(y * srcCanvas.width + x) * 4 + 3] > 32) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  // ... scale & center into (targetW - 2*padding, targetH - 2*padding)
}
```

### 套組張數只能是 8 / 16 / 24 / 32 / 40

不能 7、不能 10。我做最小組合 **8 張**（USD 0.04 一次 API 解決）。Gemini 給我 3×3 = 9 張，所以 UI 上是「9 選 8」— 用戶看完後丟掉最不喜歡的一張。

### 8 個進行中的官方特輯活動

LINE 不定期辦特輯（例如「無字浮誇」「水水」「眼淚製造機」「大臉攻擊」），參加會獲得首頁推薦曝光。每個特輯有它**自己的 prompt 規則**：

- **無字浮誇**：整組純表情/肢體、不能有任何字
- **水水**：果凍亮亮、大眼睛、淚水反光感
- **大臉攻擊**：臉佔畫面 80%+，不畫身體
- **眼淚製造機**：每格都要有眼淚（但是這個是「表情貼」不是「貼圖」，工具有警告）

工具裡內建 6 個特輯（4 個進行中 + 2 個已過期保留紀錄），選一個會自動套對應的 prompt override，產出來的 8 張都會符合那個特輯規則。

---

## 為什麼用 chroma key 不用 ML 去背

最初版本用了 [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)，背後是 ISNet。理論上很準。

實際撞到一個 bug：**白 T-shirt 的人像、白色背景**。

ISNet 把白色 T-shirt 也當成背景吃掉了。整個人變成「飄浮的頭」。試了幾種預處理都沒救，因為這是模型 inherent 的 confusion。

換一個思路：**直接告訴 AI 用純綠 #00FF00 當背景**。然後前端做最簡單的 chroma key。

```js
function chromaKeyGreen(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // greenness：綠色強度減去紅藍平均
    const greenness = (g - (r + b) / 2) / 255;
    if (greenness > 0.25) {
      d[i + 3] = 0; // alpha = 0
    } else if (greenness > 0.05) {
      // despill：邊緣半透明的綠色，把綠分量降到 R + B 的平均
      d[i + 1] = Math.min(g, (r + b) / 2);
    }
  }
  ctx.putImageData(img, 0, 0);
}
```

這個方法的好處：

- **零誤判**：白衣服只要不是綠的就絕對不會被吃掉
- **零 ML 依賴**：不用載 4 MB 的 ONNX 模型
- **快**：純 RGBA 迴圈，1024×1024 在桌機 < 50ms

代價是：**整個流程的成敗綁在「Gemini 真的會用純綠當背景」**。所以 prompt 裡把這條寫得超嚴格：

```
- Background is plain solid PURE NEON GREEN (#00FF00) — this is a chroma-key
  plate that will be programmatically removed by the downstream tool. Use the
  brightest, most saturated, most uniform green possible. NO gradients,
  NO shading, NO scenery, NO patterns.
- CRITICAL: the character itself must contain NO GREEN elements anywhere.
  NO green clothes, NO green hair, NO green eyes, NO green accessories.
  If the original reference has any green, substitute it with red, orange,
  blue, purple, or yellow. Even slight greenish tints on white clothes or
  skin should be avoided. This is essential — green pixels on the character
  will be chroma-keyed out and become holes.
```

實測：100 次生成只遇過 1-2 次「角色穿綠衣服被打洞」。可以接受。

### 還有一個邊緣的 despill + 1-pass erosion

只做 chroma key 會留下「綠邊」— 那些邊緣 anti-aliasing 半透明的像素帶有綠色 tint。所以加了：

1. **Despill**：把 G 分量壓到 (R+B)/2，去除綠色 tint
2. **1-pass erosion**：alpha < 200 的邊緣像素再砍一圈，把模糊綠帶完全切掉

去背完的角色邊緣是乾淨的。

---

## 中間有一個白色 padding bar 讓 chroma key 失效的 bug

`splitGrid` 把 3×3 圖切成 9 張。為了讓每一張都是正方形（LINE 貼圖比例），我用 `contain` 模式：把長方形塞進方形 canvas，**多出的空間用白色填充**。

然後再 chroma key → 白色不是綠色 → 留下白色 bar 在最終貼圖上。

```js
// 修正前
ctx.fillStyle = "#FFFFFF"; // 害人
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.drawImage(srcImg, 0, 0, w, h);

// 修正後
ctx.fillStyle = "#00FF00"; // 跟 chroma key target 同色
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.drawImage(srcImg, 0, 0, w, h);
```

一行修正，影響整個流程。

---

## Prompt 工程：跟拉霸機的傳承 + 新坑

### 沿用拉霸機的：3×3 ASCII diagram + 字母 anchor

[拉霸機那篇](https://yazelin.github.io/ai/2026/04/21/emoji-slot-machine.html)寫過：用 ASCII diagram 標 A-I 9 個位置 + 在每格 prompt 前面寫 `[A] top-left cell:`，把「位置 ↔ 該畫什麼」鎖死。同時 OUTPUT RULES 顯式寫 `Do NOT render any letter labels (A..I)` 防止字母被烤進圖。

這套照搬，貼圖製造機一樣有效。

### 新坑 1：CHARACTER IDENTITY 跟 STYLE 衝突

第一版我寫得很保守：

```
Maintain character consistency: same color palette, same body proportions,
same clothing colour as the reference.
```

結果用戶選了「90s anime + neon pastel + halftone」，產出來的還是**原圖的照片風**。Gemini 的優先級是「保持身份」 > 「套用風格」。

改成：

```
STYLE (DOMINANT — overrides the source image's medium):
{style description}

This style applies to ALL 9 tiles. If the user provided a photo and the
style says "anime / 3D / pixel / watercolor", TRANSFORM the photo into
that medium — do NOT keep it photo-realistic.

CHARACTER IDENTITY (persists across all 9 tiles, but is RE-RENDERED in
the chosen style):
The character must be recognizably the same person/creature across all 9
tiles — same hair colour & shape, same clothing colour, same general face
features. But identity does NOT mean keeping the source medium. If the
source is a photo and the style is anime, the 9 tiles are 9 anime
portraits of "this person turned anime".
```

關鍵字：**RE-RENDERED in the chosen style**。明白告訴模型「身份」 != 「材質」。

### 新坑 2：withText=false 時角色姿勢全亂跑

**最詭異的一個 bug**。用戶設定「短語：不想上班」、勾「無字模式」（不要把字印上去），結果產出來是**笑得很開心**的角色。

原因：當 `withText=false` 時，我的 prompt 只剩 `ACTION/POSE: expressive sticker pose appropriate for the phrase` —「the phrase」這個指代沒有先行詞，因為我把 phrase 完全拿掉了。Gemini 看到的就是「畫一個適當的姿勢」，當然亂畫。

修法：**phrase 不印在貼圖上、但仍然當 emotion cue 餵給模型**。

```js
// withText=false 時：
return `  [${letter}] ${NAMES[i]} cell:
    EMOTION CUE (do NOT render as text on the sticker — use ONLY as pose /
    facial-expression guidance): "${phrase}"
    ACTION/POSE: render a pose + facial expression that clearly conveys
    the feeling of "${phrase}". ${action}
    ABSOLUTELY NO TEXT, LETTERS, NUMBERS, OR EMOJI on this cell.`;
```

「不要印字、但用這句話決定臉部表情和姿勢」。

### 新坑 3：phrase + action 配對

承上一條，雖然把 phrase 當 cue 灌進去了，但**短語 → 動作**的對應還是模糊。「不想上班」可以是「皺眉」、「翻白眼」、「躲在棉被裡」、「攤在桌上」… 模型自己選會散漫。

升級版：**讓 AI 主題產生器同時產 phrase + 對應 English pose 描述**。

```
你是 LINE 貼圖文案 + 動作發想助手。根據使用者描述的主題，產出 8 組
「短語 + 對應動作描述」配對。

每組包含：
- "phrase": 2-8 字短語 (語氣口語、聊天感、情緒鮮明、避免廣告或商標)
- "action": 5-15 字英文動作 + 表情描述 (用英文，因為 Gemini image
  對英文 pose description 理解最準)

請只回 JSON 陣列：
[{"phrase":"短語1","action":"english action description"}, ... × 8]
```

例如「上班崩潰」這個主題，AI 會回：

```json
[
  {"phrase":"我崩潰了", "action":"slumped at desk, head in hands, weary look"},
  {"phrase":"想離職",   "action":"holding a fake resignation letter, exhausted half-smile"},
  ...
]
```

每個 phrase 都有對應 pose。無字模式時「不印字、但用 action 畫姿勢」就精準了。

---

## 一個真實 bug：「一個函式被呼叫兩次」差點害我去開 Google 的 issue

完整經過值得單獨拿出來講，因為這是**用 AI 寫 code 的時候最容易踩的反向陷阱**。

某次測試我設好 8 個自訂短語，按生成。回來看：UI 顯示這 8 張貼圖的「short phrase」標註是我設的那 8 句，但**圖上印的字完全是另一組**。

我把這個現象貼給 Claude（這個專案 95% 的 code 是 Claude 寫的）：「Gemini 沒按 prompt 印字，你看看怎麼修。」

Claude 第一反應就是去**改 prompt**：把 `EXACT TEXT TO PRINT` 那條規則加更多強制語、加更多 caps、再多寫一條 OUTPUT RULE 強調 text fidelity。

我攔下來。因為這個專案的姊妹工具 [emoji-slot-machine](https://yazelin.github.io/ai/2026/04/21/emoji-slot-machine.html) 用同一個 Gemini 3.1 Flash Image，當時 phrase fidelity 是 **9/9 perfect**，為什麼搬到貼圖工具就掉到 0/9？同一顆模型不會突然失智。

我跟 Claude 說：「之前 emoji-slot 就是這樣，你寫錯還以為是 Gemini 問題。」

Claude 才回去看 worker 程式：

```js
// /generate endpoint
const prompt = buildPrompt({
  nine: pickNinePhrases({ slots, phrases }),  // ← call #1
  styleHint, withText,
});

// ... fetch Gemini ...

return json({
  data: imagePart.data,
  phrases: pickNinePhrases({ slots, phrases }),  // ← call #2 (DIFFERENT)
});
```

抓到了：`pickNinePhrases` 內部用 `Math.random() + shuffle()` 從 50 句 pool 裡抽 9 句。**這個函式被呼叫了兩次**：一次餵給 prompt 給 Gemini，一次寫到 response 給前端標註用。兩次的隨機結果**不同**。

所以實際發生的事：Gemini 完美照 prompt 把 call #1 的 9 句印出來，但 response metadata 寫的是 call #2 的 9 句。前端對照「metadata 寫 X、圖印 Y」 → 100% mismatch → 看起來是 Gemini text fidelity 爛掉。

**Gemini 一個字都沒錯。錯的是 worker 把同一個非確定性函式呼叫兩次。**

修正：

```js
const nine = pickNinePhrases({ slots, phrases });  // 只算一次

const prompt = buildPrompt({ nine, styleHint, withText });
// ... fetch Gemini ...
return json({ data: imagePart.data, phrases: nine });  // 用同一份
```

修完 retest：**9/9 perfect text fidelity**。

### 為什麼這個 pattern 會反覆發生

這是我**第二次**被同一個 pattern 燒到（emoji-slot-machine 開發時也踩過）。共通結構是：

- worker 裡有個函式內部含 `Math.random()` / `shuffle()` / `Date.now()` 之類的非確定性操作
- 這個函式的結果**同時要進兩個地方**：餵給 AI 的 prompt + 回給用戶看的 metadata
- AI 寫 code 的人（包括我以前自己手寫的時候）會很自然地分兩次呼叫，因為 prompt 組合和 response 組裝在不同段、看起來不相干

然後現象是：「AI 模型看起來不聽話」。看起來是 model 的問題，實際是 code 的問題。

### 給 Claude 的指令模板（我現在會這樣講）

幾次之後我學乖了，現在跟 Claude 講話會**先擋下「改 prompt」這個衝動**：

> 「我看到 AI 輸出跟我給的指令對不上。**先不要改 prompt**。先做兩件事：
> 1. 把 worker 真正送出的 payload log 出來、把回給前端的 metadata log 出來
> 2. 逐字比對。一致才能 blame model；不一致就是我們的 code 把兩件事混了。
>
> 如果 (2) 裡面有任何一個函式被呼叫兩次而它含 random，那就是嫌犯。」

這個 prompt 我已經存進 [Claude 的 memory](https://docs.claude.com/en/docs/claude-code/memory) 裡，之後不用每次都打。Claude 看到「AI 看起來沒照指令」的描述時會自動先驗 code 路徑、不會直奔 prompt engineering。

### 給其他 AI 寫 code 的人的提醒

- AI 寫 code 很愛「整潔分段」 — prompt 組合一段、response 組裝一段，乍看清楚實則踩雷
- 任何**非確定性的選擇**（隨機抽樣、時間戳、UUID）都應該**只算一次**、把結果當參數傳遞給每個下游
- 如果你看到「AI 模型不聽話」的現象，但同個 model 在別的地方表現正常 → **9 成是你自己 code bug，不是模型**

---

## LINE Login PKCE：純前端、不需要 channel secret

跟拉霸機最大的架構差異是這裡。拉霸機免登入、靠 IP rate limit；貼圖製造機因為 AI 生成更貴（USD 0.04 vs ~USD 0.005），需要強身分驗證才能限額。

LINE Login 有 OAuth 2.0 + **PKCE (RFC 7636)** 模式，可以**完全前端跑**、不需要 channel secret：

1. 前端產一個 `code_verifier`（隨機字串）+ `code_challenge`（SHA-256 後 base64-url）
2. 把 challenge 帶去 LINE 授權頁
3. 用戶授權後跳回 callback URL，帶 `?code=...`
4. 前端用 `code` + `code_verifier`（剛剛存的）跟 LINE 換 access_token
5. 把 access_token 存 localStorage

```js
async function genChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
```

核心安全點：**worker 永遠不信任前端說它是誰**。每次 request 過來：

```js
async function getLineUser(accessToken) {
  const verifyRes = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`
  );
  const verify = await verifyRes.json();
  // 驗 channel ID 是不是我的 channel
  if (verify.client_id !== EXPECTED_LINE_CHANNEL_ID) return null;
  // 拿 profile
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return await profileRes.json();
}
```

兩次 LINE API call 換到一個可信的 `userId`。配額就 key on 這個 userId。

### 為什麼要驗 `client_id`

如果不驗，**任何人都可以用自己的 LINE Login channel 簽 token 來打我的 worker**，等於免費送大家 AI 額度。驗了 `client_id === EXPECTED_LINE_CHANNEL_ID` 之後，token 必須是經由「我這個 LINE Login app」拿到的才有效。

---

## Cloudflare KV：3 行配額系統

每天每用戶 3 次。設計超簡單：

```js
function todayUTC() {
  return new Date().toISOString().slice(0, 10);  // "2026-04-28"
}
const k = `quota:${userId}:${todayUTC()}`;

// 讀
const used = parseInt(await env.QUOTA.get(k) || "0", 10);

// 寫（成功才扣）
await env.QUOTA.put(k, String(used + 1), { expirationTtl: 60 * 60 * 36 });
```

`expirationTtl: 36h` 讓 key 自己過期清掉，不需要 cron。

**唯一的細節**：`bumpQuota` 一定要在「Gemini 確認回傳成功」之後才 call。如果 Vertex 524 timeout 但我先扣了，用戶今天就被白吃一次配額 → 客訴炸鍋。

```js
// 1. fetch Vertex
const upstream = await fetch(apiUrl, ...);
if (!upstream.ok) {
  return json({ error: "upstream", status: upstream.status }, 502);
  // ↑ 直接 return，不扣配額
}
const data = await upstream.json();
const imagePart = data.candidates[0].content.parts.find(p => p.inlineData);
if (!imagePart) {
  return json({ error: "no image" }, 502);
  // ↑ 也不扣
}

// 確認有圖了，才扣配額
const usedAfter = await bumpQuota(env, user.userId);
return json({ data: imagePart.inlineData.data, quota: { used: usedAfter, limit: 3 } });
```

---

## BroadcastChannel 跨 tab 同步配額（不用 polling）

用戶開兩個 tab 同時用，A tab 用了 1 次，B tab 看到的剩餘次數沒更新 → 看起來還能用 → 按下去結果 worker 拒絕 → 體驗爛。

最直覺的 fix 是 polling：每 30 秒打一次 `/me` 同步 quota。但這吃 worker request 額度而且爛。

**BroadcastChannel** 是 native API、零依賴：

```js
const authChannel = new BroadcastChannel("line-sticker-auth");

// A tab 拿到新 quota 之後 broadcast
function broadcastQuota(quota) {
  authChannel.postMessage({ type: "quota", quota });
}

// B tab 監聽
authChannel.onmessage = (ev) => {
  if (ev.data.type === "quota") {
    auth.quota = ev.data.quota;
    refreshAuthUi();
  }
};
```

A tab 一生成完，B tab 立刻看到「剩 2/3」。零 worker request、零 polling。

---

## IndexedDB 歷史 + 收藏：因為配額只有 3，舊的不能丟

每天只有 3 次 AI quota。如果第 1 張我滿意、第 2 張我不滿意、第 3 張產到一半我手滑刷新瀏覽器 → **第 1 張就消失了**。

所以加了「3×3 grid 歷史」：每次成功生成就把整張 raw grid（PNG blob）和 metadata 存進 IndexedDB。

- 上限 30 筆未收藏（FIFO 自動清舊）
- 收藏的（⭐）不算入 30 筆額度、永遠保留
- 每筆可重命名、載入回主畫面、單獨下載原圖
- **BYOG**（用戶自己上傳的 3×3 圖）也會進歷史

```js
// idb minimal wrapper
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("line-sticker-history", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore("generations", { keyPath: "id", autoIncrement: true });
      store.createIndex("ts", "timestamp");
      store.createIndex("starred", "starred");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
```

存 PNG blob 直接 put 進 store，不用 base64。一張 3×3 grid 大約 200-500 KB，30 筆頂多 15 MB，瀏覽器 IndexedDB 隨便都能裝。

---

## 副作用：BYOG（Bring Your Own Grid）

整個工具的價值有 70% 在「split + chroma-key + fitWithPadding + ZIP」這條後處理 pipeline，AI 只是來源。

所以另一條路徑：**用戶自己用任何工具產 3×3 圖**（gemini.google.com / ChatGPT / Midjourney），上傳到「🅱 替代路徑」，跳過 AI 那一步直接走後處理。

- **免登入**（沒打到 worker）
- **免額度**（沒打到 Gemini）
- **不限次**

對作者好處：**配額爆了也有出路**，不用客訴。對用戶好處：**完全的 zero-cost 路徑**，跟工具的 AI quality 解耦。

---

## 你可以拿這個架構做什麼

LINE 是台灣特有的市場，但「上傳一張參考圖 → AI 批次產出某種規格的素材 → 打包下載」這個 pattern 通用：

- **Telegram 貼圖**：512×512，最少 1 張、無上限。改 prompt + ZIP filename 就完了
- **Discord emoji**：128×128，無張數要求，PNG/GIF/APNG。再加一個 GIF export 就行
- **印章貼紙設計師**：3×3 變 4×4 = 16 張不同角度的同 logo，給網拍賣家打包
- **9 張塔羅 × 30 個朋友 = 一年的占卜素材**：AI 出題 + Gemini 圖 + 自動排版

核心 pattern 是 **「reference image + 結構化變體 prompt + 後處理 pipeline」**。LINE 貼圖只是其中一個應用。

---

## 結語

跟[拉霸機那篇](https://yazelin.github.io/ai/2026/04/21/emoji-slot-machine.html)的結語呼應：

1. **prompt engineering 的血淚**：每一條規則背後都是一個「產出看起來很怪」的 issue
2. **純前端能做到的事比想像中多**：split、chroma-key、padding-fit、ZIP、IndexedDB 全在瀏覽器；後端只是 API key + 配額守門員
3. **限制是 feature**：LINE 嚴格的尺寸/張數規範，反過來變成「對的格式自動化打包」的明確 spec — 比起「自由創作」這種無頭蒼蠅，有 spec 反而好做

最大的差異是：拉霸機是**送朋友的 trick**，貼圖製造機是**幫朋友賺錢的工具**。同一套 Gemini + Cloudflare Worker，產出兩種質感截然不同的東西。

Repo 在這裡：<https://github.com/yazelin/line-sticker-studio>

實際做出貼圖上架賺到第一筆 NT$15（30 元 × 50%）的時候記得來分享，這才是這個工具存在的意義 ☕。

覺得有用 → Star repo / [Buy me a coffee ☕](https://buymeacoffee.com/yazelin) / [推薦給朋友](https://yazelin.github.io/line-sticker-studio/) 🙏
