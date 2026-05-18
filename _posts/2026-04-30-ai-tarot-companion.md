---
layout: post
title: "AI 塔羅心靈陪伴站：把信義公益的提案做出來"
subtitle: "GitHub Pages + Cloudflare Worker + D1 + Groq + Edge Speech，給社區阿嬤用的真．完整 stack"
date: 2026-04-30
categories: [AI]
tags: [Cloudflare Workers, Cloudflare D1, Groq, Whisper, Llama, OpenRouter, Gemini, OpenCC, Service Worker, Web Speech API, GitHub Pages, Prompt Engineering, Elderly UX]
---

![AI 塔羅心靈陪伴站：把信義公益的提案做出來](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-30-ai-tarot-companion.png)

> **🔗 快速連結**
> - 🌐 **Live**：[yazelin.github.io/ai-tarot-companion](https://yazelin.github.io/ai-tarot-companion/)
> - 💻 **GitHub**：[yazelin/ai-tarot-companion](https://github.com/yazelin/ai-tarot-companion)
> - 💡 **靈感原案**：[信義公益實踐家 2026 — AI 塔羅心靈陪伴站](https://www.sinyicharity.org.tw/gather-ideas/vote/2026/13834)
> - ☕ **Buy me a coffee**：[buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)

---

## 為什麼做這個

朋友把這個 idea 投到[信義公益實踐家 2026](https://www.sinyicharity.org.tw/gather-ideas/vote/2026/13834)，丟給我看，問我覺得怎麼樣。一句話描述：

> 透過 AI 智慧科技結合塔羅牌互動，設計一套簡單、有趣且具有陪伴感的互動系統，讓長者可以透過平板或語音與 AI 進行輕鬆的心靈對話。

我自己阿嬤 86 歲。我陪她吃飯時最常聽到的就是「沒人跟我說話」、「電視都看膩了」。所以朋友傳來這個提案我看完當下就想：**這不會很難做啊，我應該寫得出來，乾脆先把雛形做出來給朋友看。**

於是花了一個下午把它做出來，結果不知不覺就累積了一整套架構：前端 + Workers 後端 + D1 資料庫 + 三家 LLM fallback + 中文簡轉繁 + Service Worker + 共享心願牆。這篇文章記錄整個踩坑過程。

## 一句話：在做什麼

```
社區據點平板  ──┐
                ▼
        ┌───────────────────┐
        │  靜態前端          │   GitHub Pages
        │  大字體、語音優先  │
        └─────────┬─────────┘
                  │
           ┌──────┴──────┐
           ▼             ▼
   ┌──────────┐   ┌──────────┐
   │ /chat    │   │ /wishes  │   Cloudflare Worker
   └────┬─────┘   └────┬─────┘
        │              │
        ▼              ▼
   ┌──────────┐   ┌──────────┐
   │ Groq →   │   │ D1       │
   │ OR →     │   │ SQLite   │
   │ Gemini   │   │          │
   └──────────┘   └──────────┘
```

阿嬤打開平板 → 點抽塔羅牌 → AI 用溫暖的口吻講解 → 同時把牌義轉成今天的小任務（散步 10 分鐘、打電話給朋友）→ 寫一句祝福貼上社區牆，看看別的據點阿嬤寫了什麼。

## 給長者的 UX 不是把字放大就好

第一版我以為：字大、按鈕大、配色暖一點就 OK。實機跟人測試之後才發現，**長者的可用性問題比想像中具體**：

| 問題 | 解法 |
|------|------|
| 不會打字 | 全站可語音輸入 + 按鈕優先 |
| 多層級導覽會迷路 | 主畫面只有 4 個入口，每個入口都有大 emoji + 副標 |
| 看不到「返回」要去哪 | 把返回鈕釘在 topbar 永遠看得到 |
| 聽不清 AI 在說什麼 | 朗讀速率調慢 10%，再加「再聽一次」按鈕 |
| 對話太長 / 太正式 | system prompt 強制每次回應 ≤ 50 字、像鄰居姪女 |
| 不確定 AI 有沒有在運作 | topbar 角落放綠/黃/紅小燈 |

這些都是寫程式之前不會想到、跟阿嬤一起測才會跳出來的細節。

## 我用了哪些免費 tier

完整堆疊**真的全免費**，我給社區算過用量上限：

| 服務 | 用途 | 免費額度 | 社區實際用量 |
|------|------|---------|------------|
| GitHub Pages | 前端 | 無限 | 無限 |
| Cloudflare Workers | API gateway | 100K req/天 | <500/天 |
| Cloudflare D1 | 心願牆 | 5GB / 5M reads | <50KB |
| Groq | LLM + Whisper | 14,400 + 7,200 req/天 | <1,000/天 |
| OpenRouter | LLM fallback | 50/天/模型 | 0（除非 Groq 掛） |
| Google AI Studio | LLM fallback | 1,500/天 | 0（同上） |

整個社區據點 30 個阿嬤每天用一輪都用不到 5%。

## 三家 LLM fallback chain

只用一家 LLM 就會遇到：「Groq 突然 5xx」、「免費 quota 撞牆」、「某個模型對中文特別爛」。Worker 串成 fallback chain：

```js
// worker/worker.js
const providers = [
  { name: 'groq',       fn: callGroq },        // Llama 3.3 70B，最快
  { name: 'openrouter', fn: callOpenRouter },  // Qwen 2.5 72B，中文最強
  { name: 'gemini',     fn: callGemini }       // Gemini 2.5 Flash，額度大
];

for (const p of providers) {
  try {
    const reply = await p.fn(messages, env);
    if (reply) return json({ reply: toTraditional(reply), provider: p.name });
  } catch (e) {
    console.warn(`${p.name} failed:`, e.message);
  }
}
```

實際運作中 99% 都是 Groq 就回了（Llama 3.3 70B + Groq 的硬體加速 = 一秒內回應），除非 Groq 真的掛或當天 quota 用爆。

## 為什麼還需要 OpenCC 簡轉繁？

**因為 LLM 三不五時會吐簡體**。即使 system prompt 寫了「一律用繁體中文」、Llama 也會時不時飄出「计算机」「时间」這種字。Whisper 更明顯，台腔國語經常被辨識成簡體輸出。

修法：Worker 收到 LLM / Whisper 回應後，統一過 `opencc-js` 的 `s2twp` 轉換（含台灣慣用詞）：

```js
import * as OpenCC from 'opencc-js/cn2t';

let _s2tw = null;
function toTraditional(s) {
  if (!s) return s;
  if (!_s2tw) _s2tw = OpenCC.Converter({ from: 'cn', to: 'twp' });
  return _s2tw(s);
}
```

`twp` 比 `tw` 多了「臺灣慣用詞」轉換 — 例如「土豆」會自動變成「馬鈴薯」。對長者讀起來自然太多。

## Whisper 中文辨識真的強

我做了一個對照測試：合成「你好我是阿嬤今天想抽一張塔羅牌看看」這句話送進 Worker：

```
合成輸入：你好我是阿嬤今天想抽一張塔羅牌看看
Whisper 辨識：你好我是阿嬤今天想抽一張塔羅牌看看
```

**一字不差**。瀏覽器內建的 `webkitSpeechRecognition`（背後是 Google STT）對標準國語也很準，但對台腔、慢速、含糊發音的容忍度差太多。

阿嬤跟我說話那種「我膝蓋啊⋯⋯哎呀⋯⋯就是會痛啦」的節奏，Whisper 處理得很好；webkit STT 經常會斷在錯誤的地方。

## TTS 那邊踩過的坑

一開始天真地想「Edge TTS 雲哲（zh-TW-YunJheNeural）很好聽，做後端代理就好」。

寫 Cloudflare Worker 用 WebSocket 直連 MS Edge TTS 端點 → **Microsoft 回 403**。

挖了文件才知道：MS 從 2024 開始要求 `Sec-MS-GEC` token（SHA256 obfuscation）+ `Sec-MS-GEC-Version` header。我都做了 → **還是 403**。再挖：CF Worker 的 IP 段被 MS 列入限制名單。這是已知問題。

最後選擇實用主義：

1. **預設用瀏覽器內建 `speechSynthesis`**（免費、零後端、跨平台）
2. 在 voice.js 裡 pickVoice 的偏好順序排成 **YunJhe → HsiaoYu → HsiaoChen → 任何 zh-TW**
3. Edge 瀏覽器使用者**自動拿到雲哲**（系統內建神經語音）
4. 其他瀏覽器拿系統內建中文女聲（macOS 美佳、Android Google TTS、iPad Mei-Jia）

未來如果社區想統一所有平台都用雲哲，再花 5 分鐘接 Azure Speech Services（免費 50 萬字/月，需要 API key）。

## 心願牆為什麼不存 GitHub Issues？

我一開始有想過。優點是免費、永遠在、可以直接在 GitHub 上看 / 刪除 / 留言。

但**致命缺點**：每則祝福都會被 Google 索引。長者寫「希望兒子戒酒」這種話，搜尋引擎找得到。

最後選 **Cloudflare D1**：

```sql
CREATE TABLE wishes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '匿名',
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
```

- 私密（只有 Worker 能存取，Google 搜不到）
- 跟 Worker 同生態，零延遲
- SQL 可以做「列出最新 50 則」「按月份分組」「軟刪除」
- 免費 5GB / 5M reads / 100K writes
- 在 wrangler dashboard 上可以直接看內容、編輯、刪除

對社區據點來說，「整個社區的祝福都看得到」是核心體驗。一個人寫的祝福 → 同個 D1 → 全社區看到 → 有種真的被陪伴的感覺。

## Service Worker 解決了什麼

開發中最煩的事是：每次改一行 CSS 就要 cache-bust 一次。剛開始我手動寫 `?v=1` `?v=2` `?v=3`，user 看了反問我：

> 「我真實上也不想要你加 ?v=」

對，這種事不該是用戶看到的。寫了一個 30 行的 Service Worker：

```js
// sw.js — network-first
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.includes('/api/')) return;  // API 不快取
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))   // 離線時才用快取
  );
});
```

效果：每次有網路就拿最新版，斷網也能用舊版。**永遠不需要 `?v=`，使用者也不需要知道什麼是 cache**。

## AI 取名「亞澤」

system prompt 我給 AI 設了個名字：

```
你是社區據點的 AI 陪伴員，名字叫「亞澤」。陪伴對象是 65-90 歲的台灣長者。
若有人問你叫什麼名字，告訴他：「我是亞澤」。

【說話風格】
- 一律用繁體中文，避免英文、艱深詞彙、流行語
- 每次回應 1-2 句、總共不超過 50 字
- 像鄰居姪女的口氣，不要太正式
- 多問開放式問題，引導對方多說一點

【遇到嚴重情況】
- 若用戶提到嚴重憂鬱、想不開、身體劇烈不適
  → 溫柔但堅定地建議聯絡家人或撥安心專線 1925
```

UI 上每個對話泡泡都標註「亞澤」/「您」，讓阿嬤一眼知道這是誰說的。實際對話：

> 阿嬤：請問你叫什麼名字？
> **亞澤：我是亞澤 😊**

> 阿嬤：最近我膝蓋有點痛，走路爬樓梯都不方便，心情也悶悶的
> **亞澤：這樣很不舒服呢！您有去看醫生或做過檢查嗎？ 🤔**

> 阿嬤：還沒有 我想說再忍幾天看看
> **亞澤：您再等等看不行的，趁早去看醫生吧！他可以幫您查出原因，給您適當的治療喔。**

system prompt 設定的「身體不適 → 引導就醫」規則，AI 真的有遵守。

## 我學到什麼

1. **免費 tier 真的夠**：社區公益專案，三家 LLM 加 D1 一個月 0 元，只有開發時間是成本
2. **Cloudflare Workers + D1 是被低估的組合**：對小型應用，這套比 AWS Lambda 簡單 10 倍
3. **長者 UX 是 prompt 工程的延伸**：訂 system prompt 比改 UI 重要
4. **OpenCC 是台灣 AI 開發必備**：所有用過 LLM 的人應該都知道這痛苦
5. **Service Worker 的 network-first 模式被嚴重低估**：30 行解決一輩子的快取問題
6. **MS Edge TTS 從 CF Worker 已經連不上**：不要重複我的錯誤，要嘛走 Azure 要嘛自架小 server

## 之後想做什麼

- [ ] **家屬端**：阿嬤抽到負面牌或 mention「不舒服」時，用 LINE Notify 通知子女
- [ ] **語音辨識升級**：把 STT 預設切到 Groq Whisper（內建辨識率還是差）
- [ ] **Azure Speech 雲哲**：等 Azure 帳號註冊好就上
- [ ] **跨世代陪伴模式**：青年志工版本的介面
- [ ] **每週彙整**：每週一寄一封 email 給據點負責人，告訴他們這週有哪些祝福、阿嬤心情如何

## 結語

這個專案最讓我意外的不是技術——**而是寫出來才發現它被需要**。

阿嬤的孤獨、壓力、想找人講話的需求，比我以為的更日常。一個 80 歲的長者，每天能跟人講話的時間可能只有跟便當阿姨那 30 秒。如果一個 AI 陪伴員能讓她多笑兩次、多說一些心裡話、知道有人在聽，那這專案就有意義。

如果您也有家裡長輩在使用平板，歡迎直接打開 [yazelin.github.io/ai-tarot-companion](https://yazelin.github.io/ai-tarot-companion/) 給他試試看。Source code 全部開源在 [GitHub](https://github.com/yazelin/ai-tarot-companion)，社區據點要 fork 拿去用完全沒問題（MIT 授權）。

也歡迎去[信義公益實踐家原案頁面](https://www.sinyicharity.org.tw/gather-ideas/vote/2026/13834)投票支持我朋友，這個 idea 值得被看見。

---

🤖 整個專案 100% 用 Claude Code 寫成。從 spec → repo → Worker → D1 → 部署 → 社交圖卡 → 這篇 blog，全程 conversation-driven。Claude Code is the way.
