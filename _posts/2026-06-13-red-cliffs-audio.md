---
layout: post
title: "給赤壁 3D 加上電影級音訊 —— 讓 AI 代聽海選 CC0 配樂、用同音字替身馴服破音字"
subtitle: "我要 AI 幫一個 3D 戰場配電影級音樂。它接了。但它沒有喇叭——它聽不到自己選的任何一首曲子。"
date: 2026-06-13
categories: [AI, 實驗]
tags: [red-cliffs-3d, Web Audio, TTS, AI 代聽, CC0, 甲方思維]
author: Yaze Lin
---

![赤壁 3D 電影級音訊](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-13-red-cliffs-audio.png)

> **快速連結**
> - 有聲版(建議用電腦、開聲音):<https://yazelin.github.io/red-cliffs-3d/>
> - AI 選曲記錄頁(看 AI 怎麼「聽」音樂):<https://yazelin.github.io/red-cliffs-3d/audition.html>
> - 無聲原版(第一輪凍結保存):<https://yazelin.github.io/red-cliffs-3d/classic.html>
> - GitHub:<https://github.com/yazelin/red-cliffs-3d>

這是一個沒有耳朵的工人，被指派去做一件全靠耳朵的事。我在[上一篇]({% post_url 2026-06-11-red-cliffs-3d %})記了 AI 怎麼用一段中文 prompt、在一次對話裡做出一個 3D 互動的赤壁之戰戰場。第二輪我追加需求：加電影級配樂、紀錄片旁白與音效，做完先讓我本機聽過再公開。它全接了。然後撞上一個繞不開的事實：它沒有喇叭，聽不到自己選的任何一首曲子，也聽不出 TTS 把哪個破音字唸歪了。

這篇不重複講視覺，只聚焦兩件音訊上「天生做不到、卻想辦法繞過去」的事：**怎麼幫一個沒有喇叭的工人選音樂**，以及**怎麼讓只會唸錯破音字的 TTS 把字唸對**。這套配樂是用 AI 代聽來海選 CC0 音檔的，我負責用耳朵終審、在「聽起來怪不怪」這種機器管不到的地方回報。

## 約束先擺出來：零依賴、零 build

第一輪那個赤壁戰場是**單一 `index.html` + Three.js CDN、零 build step**。加音訊的需求很容易把這個乾淨度毀掉——一不小心就引進打包工具、音訊庫、後端。所以第一條規矩是：**只能多 `assets/` 目錄和音檔，不准加套件依賴、不准加 build。**

音訊引擎因此整個寫在同一個 `index.html` 裡，核心是一個單一 `AudioContext` 拆成**三條匯流排**:

```
master ─┬─ music bus(配樂)
        ├─ sfx bus(音效 → DynamicsCompressor → master)
        └─ narration bus(HTMLAudioElement → MediaElementSource)
```

旁白走 `narration` 這條，而且要能在它說話時**單獨把另外兩路壓低**(ducking)。實際的 duck 是這樣寫的(`index.html` 的 `AudioEngine`):

```js
function duck(on){
  if(!ctx)return;const t=ctx.currentTime;
  music.gain.cancelScheduledValues(t);
  music.gain.setValueAtTime(music.gain.value,t);
  music.gain.linearRampToValueAtTime(on?.3:.8,t+.6);   // 配樂壓到 0.3
  sfx.gain.cancelScheduledValues(t);
  sfx.gain.setValueAtTime(sfx.gain.value,t);
  sfx.gain.linearRampToValueAtTime(on?.45:.9,t+.6);     // 音效壓到 0.45
}
```

旁白一開始講，配樂在 0.6 秒內滑到 `0.3`、音效滑到 `0.45`;旁白講完再滑回去。`sfx` 那條還串了一顆 `DynamicsCompressor`(threshold -14、ratio 6)，避免戰鼓 + 箭雨 + 刀劍同時炸出來爆音。瀏覽器 autoplay 政策擋自動播放，所以開場要先點一下(進場兩顆按鈕「自動播映」「自由探索」)，第一次互動那一刻才 `ctx.resume()` 解鎖整套音訊。

這些都還只是「播放」。比較難的是音檔**哪來的**。

## AI 沒有喇叭，怎麼選音樂?

為什麼不照標題和下載量排序、直接選那首叫 war drums 的戰鼓就好?聽起來很合理，直到你真的去搜。在「war drums」這個關鍵字下、按下載量排到最前排的那一首，實際標題是 `Sound library for scratching (100 BPM)`，是一包刮碟音效，跟戰鼓毫無關係。標題會騙人，下載量只證明它熱門、不證明它對。靠標題和排序選曲，第一顆地雷就直接踩進去。所以才需要一條海選管線，它是被這個現實逼出來的。

配樂的決策一開始就拍板了(spec 裡寫得很白):**CC0 真實音檔優先，找不到合格曲的幕才退回 Web Audio 合成。** 只收 CC0(公眾領域)授權，逐檔記錄來源。問題是：候選曲怎麼挑?下載量只拿來把熱門曲排前面，AI 真正拿到的只有音檔、檔名、時長——它**聽不到**，也看不到實際下載數。

解法是一條三段管線：

1. **Freesound API 撈候選**:用 `license:"Creative Commons 0"` + 時長條件篩，每輪最多代聽 8 個新候選(`hunt.py` 的 `cands[:8]`，可重跑累加，實際每幕落在 6–10 個)，下載 preview mp3、`ffprobe` 量長度。
2. **Gemini 2.5-flash「代聽」評分**:把音檔丟給 Gemini 的音訊理解，要它照一張**固定清單**回報——實際樂器、節奏能量、有沒有人聲、有沒有時代違和(槍聲、合成器)、能不能無縫 loop，最後給一個 0–10 的適配分。
3. **`audition.html` 人耳終審**:入圍曲全部列進一個本機試聽頁，每首附 AI 的中文代聽筆記 + 播放鍵，由我用耳朵點播定稿。

代聽筆記的細緻度我蠻意外。它不只說「這是鼓」，而是會抓到工程後果。例如鐵索那幕(第四幕)的一個入圍曲，筆記寫的是「重金屬鎖鏈撞擊聲、嘎嘎聲和刮擦聲……完美符合歷史船上場景所需氛圍且無時代錯誤」;第七幕火攻有一首雖然鼓點對、卻被標註「缺乏所要求的飛奔弦樂和特定的火攻音效，因此不完全契合」。連「某段有清晰的口頭命令、或人聲在尾段才淡出 → 判它不適合無縫循環」這種會咬到 loop 的判斷都做得出來。

這頁是公開的，你可以直接去 [audition.html](https://yazelin.github.io/red-cliffs-3d/audition.html) 看 AI 對每一首的代聽評語。它的前端其實很單純：讀 `audio-work/reports/<slot>.json`、把非 reject 的候選按 shortlist 與適配分排序、串流 Freesound 官方 preview。

### 代聽的兩次翻車記

代聽不是一開始就準。spec 裡記了兩條校準經驗，都是踩出來的：

**一、模型不能用太小的。** 症狀是這樣：有一次報告把一段合成測試音言之鑿鑿說成「木吉他」——那根本不是吉他，是憑空生出來的幻聽。倒推回去，問題出在跑代聽的模型：早期用的是 `flash-lite`，太小，音訊理解扛不住。換掉它、升到 `gemini-2.5-flash` 以上的等級，這種離譜幻聽就消失了。代聽這件事，模型尺寸是地板，不是可選項。

**二、標題與下載量完全不可信。** 開頭那顆 `Sound library for scratching` 地雷，代聽一耳就拆了——筆記寫「現代音效、電子噪音和喜劇人聲的混亂組合，完全缺乏歷史戰鼓元素」，直接打成 fit 0 淘汰。另一首 reject 的 "UK Drill Instrumental" 同理，被標「Trap 節奏和自動調音人聲完全不合時宜」。人選不出來的真假，代聽分得出來。

> 把這顆地雷講完整，免得誤會：被淘汰的那首標題是 `Sound library for scratching`，只是搜「war drums」時被一起撈出來;真正掛 `War Drums` 名的那幾首反而是真戰鼓、全數入圍，其中一首(`War Drums 3.MP3`,BuytheField,CC0)還被採進第一幕。所以重點不是「war drums 被淘汰」，是**搜 war drums 撈到的可能是刮碟包，而代聽分得出真假**。標題會騙人，代聽不會。

定稿的音檔都做了響度統一(-18/-16 LUFS)與淡入淡出後製，逐檔來源列在 `assets/CREDITS.md`，全部標 CC0、附 Freesound 原始連結。

## 旁白的破音字之戰

旁白用 **edge-tts**(微軟的 zh-TW 神經語音)，而且兩個聲音都產：`zh-TW-YunJheNeural`(男)和 `zh-TW-HsiaoChenNeural`(女)，語速放慢到 `-8%` 配紀錄片腔。聽起來很像樣，直到撞上破音字。

破音字翻車最氣人的地方是**毫無規律**:「親率」「率領」的率唸對，但「程普率三萬」的率卻唸成 lǜ(律);「曹操北還」的還唸成 hái(孩)。就算把口語改寫成正字「揹草」，它連「揹」都唸成 bèi。沒辦法靠改寫文稿繞過去，因為改寫本身也會被唸錯。

解法是**「同音字替身」**:餵給 TTS 的文字，把會唸錯的詞換成「目標讀音的同音字」;畫面上的字幕再做**反向映射**，永遠顯示原本的正字。實作就是 `narration/generate.py` 裡的一本字典，直接貼真實內容：

```python
# 破音字 TTS 替身:餵 TTS 用右邊(目標讀音的同音字),字幕顯示左邊原字。
# 同音字替代對唸對的字無害(替身=目標讀音),錯了會被修正。
SUBS = {
    "不戰而降": "不戰而祥",   # xiáng
    "詐降書":   "詐祥書",     # xiáng
    "天衣無縫": "天衣無鳳",   # fèng
    "北還":     "北環",       # huán
    "揹草":     "杯草",       # bēi(TTS 連「揹」都唸 bèi,實測確認)
    "率三萬":   "帥三萬",     # shuài(單用「率」字 TTS 會唸 lǜ,「率領/親率」反而正確)
}
def to_tts(text):
    for k, v in SUBS.items():
        text = text.replace(k, v)
    return text
def to_display(text):
    for k, v in SUBS.items():
        text = text.replace(v, k)
    return text
```

幾個值得拆開看的點：

- **「率三萬 → 帥三萬」**:帥(shuài)是「率」在這裡該唸的音的同音字。注解直接記下了規律——單獨一個「率」字 TTS 會唸 lǜ，但「率領」「親率」這種詞反而唸對，所以替身只針對「率三萬」這個會出錯的組合，不是無差別替換整個「率」字。
- **「降」一次處理兩種寫法**:`不戰而降`、`詐降書` 都換成同音的「祥」(xiáng)，避免被唸成 jiàng。
- **「天衣無縫 → 天衣無鳳」**:縫(fèng)的同音替身用「鳳」。
- 注解強調這招**對本來就唸對的字無害**:因為替身的讀音 = 目標讀音，就算這個詞 TTS 本來會唸對，換成同音字也唸出一樣的音。所以可以「無腦上保險」，不怕誤傷。

`to_tts()` 餵進 edge-tts 產語音，`to_display()` 在組字幕時把替身字換回原字——字幕拿的是 TTS 回傳的 `WordBoundary` 句級時間戳，所以反向映射是逐行做在字幕文字上，語音和畫面各自拿到自己該有的版本。

這些錯是**兩路抓出來的**:一半是我的耳朵，一半是 AI 把產出的音檔丟回 Gemini 逐字聽寫做 QA。有一個還衝突過：「北還」AI 說它聽到 huán、我聽到 hái，最後以人耳為準。這次衝突逼出一條法則：

> **別問 AI「這個字的聲調對不對」，要問「音高是往上還是往下走」。** 判斷字對不對它行，判斷聲調高低它弱;同樣一段音，問聲調它會給你一個自信的錯答案，問音高走向才比較可靠。

這個分界後來變成我對「AI 代聽」的信任邊界：字準它信、調準它存疑。

## 音效：程序合成為主，CC0 只補弱項

這一節只想講一句：**為了選配樂寫的那條代聽管線，不只能選配樂。** 同一套「Freesound 撈 CC0 → 代聽評分 → 人耳定稿」的流程，後來原封不動拿去選音效，音樂、吶喊、鐵索、刀劍全共用。最清楚的例子是刀劍那一包，後面會看到它怎麼用同一條管線從零一步步做出來。

音效的策略跟配樂相反：**程序化合成為主，CC0 只補合成做不好的弱項。** 戰鼓、馬蹄、腳步、箭雨破空、火船爆燃、計策鐘磬、以及風/江水/火場的環境層，全部是 Web Audio 即時合成、零素材。這裡還加了一段用 `OfflineAudioContext` 離線渲染每個 one-shot、算出 RMS 與 peak 掛在 `window.__audio` 上的自我檢查——讓「有沒有靜音、會不會爆音」一眼讀得出來(只是算出數字供查，沒有自動 pass/fail 的斷言)，在人耳聽之前先過一輪粗篩。

合成搞不定、才去抓 CC0 真實錄音的，只有兩類：**將士吶喊**(合成的人群喊殺很假)和**鐵索鏗鏘**。

刀劍的轉折最典型。一開始刀劍也是合成的(金屬 FM + noise)，但實聽時覺得「太雷射」，像科幻片不像冷兵器。處理分兩步：先把 FM 合成的 clash cue 整個移除(commit `3f79386`)，再**用同一條配樂海選管線去抓 CC0 真實刀劍音效包**(`d5ba8ee`)。抓回來的那一包 8 首全數入圍，最後取 4 個變體存成 `sword1`~`sword4`，接戰時隨機輪播：

```js
function sword(v=.5){     // 真實刀劍錄音,4 變體隨機
  playFile('sword'+(1+Math.floor(Math.random()*4)), v*(0.8+Math.random()*.4));
}
```

這就是開頭那句話落地的樣子：刀劍從合成翻車、到拿配樂管線抓回真實錄音、到 4 變體隨機輪播，沒有為它另寫一套海選。音樂、吶喊、鐵索、刀劍，四種素材都靠同一條管線解掉。

## 使用者邊看邊修：AI 的驗證迴圈管不到的地方

第一輪那個赤壁戰場是靠自動化開瀏覽器、讀 console、逐幕截圖抓 bug 做出來的。但音訊有一整類問題是**自我驗證迴圈碰不到的**:console 不會報錯，截圖也看不出來，只有「聽起來怪」。這部分全靠人耳邊看邊回報、再即時修：

- **「有個合成音怪怪的」**:火燒赤壁那幕有怪聲，排查出兩件事。一是**三支艦隊在長江上「踏步」**——艦隊移動被錯配了陸軍腳步聲;修法是把 march 腳步限定只有陸軍單位才有(`119a3fd`)。二就是上面那個太雷射的刀劍 FM 音。
- **字幕被遮**:字幕一開始被時間軸 UI 壓住看不到，改成錨定在時間軸上方(`54b90ef`)。
- **風聲蓋過旁白、幕長塞不下旁白**:旁白音檔有多長，那一幕就延長到塞得下，運鏡再等比放慢(同 `54b90ef`、`950ec14` 對齊 cue 時間軸)。

跟第一輪比就清楚了：第一輪自動化抓得到「夏口城蓋在水上」這種**看得見**的 bug。但「刀劍太雷射」「風聲壓過旁白」這種**只能聽**的問題，驗證迴圈再強也補不上，人耳還是不可替代。這也是為什麼需求裡就講明：**做完先讓我本機聽過再公開。**

## 收尾

順便更正上一篇的一個數字。把 12 份 JSON 報告(九幕 + 吶喊 + 鐵索 + 刀劍)加總：代聽候選共 **96 首**(reject 15、maybe 13、入圍 shortlist 68)，最後**定稿 11 件 CC0**(九幕配樂各一首 + 將士吶喊 + 鐵索)，刀劍那 4 個變體是後補的、不算進這 11 件。上一篇寫的「88 首代聽、60 入圍」不是記錯，是**刀劍包補進來之前**的數字——後來用同一條管線補了刀劍那 8 首(全數入圍)，總數才到 96 / 68，差的剛好是那 8 首。

整輪做完，有聲版上線(建議電腦開、開聲音)，第一輪的無聲版原封凍結成 [classic.html](https://yazelin.github.io/red-cliffs-3d/classic.html)，我特地確認過那個檔裡一行 `AudioEngine` 都沒有，是真正的靜音原版。終幕「天下三分」同時當開場主題曲，首次點擊就奏、進場 crossfade 到第一幕。整套依然是單一 HTML、零 build、零依賴。

回頭看，這輪我想記下的是**用一個 AI 去補另一個 AI 的感官缺口**:沒有喇叭，就讓會聽的模型代聽;TTS 唸錯字，就用同音字騙過去、再把字幕還原。但「聽起來怪不怪」這一關，人耳還是不可替代。

## 參考

- red-cliffs-3d repo:<https://github.com/yazelin/red-cliffs-3d>
- 選曲記錄頁(AI 代聽筆記):<https://yazelin.github.io/red-cliffs-3d/audition.html>
- 上一篇(視覺 / 一段 prompt 做出 3D 戰場):[一段 prompt，讓 AI 做出一個 3D 互動的赤壁之戰]({% post_url 2026-06-11-red-cliffs-3d %})
- [Freesound](https://freesound.org/) ／ [edge-tts](https://github.com/rany2/edge-tts) ／ MDN:[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
