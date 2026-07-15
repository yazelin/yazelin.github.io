---
layout: post
title: "用 AI 兩天做出 790 題的 iPAS 模擬考站(這不是遊戲)"
subtitle: "兩天、55 個 commit、790 題——一個只為自己考試做的刷題站,順手長成一層誰都能接的開放題庫。"
date: 2026-06-23
categories: [AI, 開發工具]
tags: [iPAS, PWA, 純前端, Cloudflare Workers, AI, 甲方思維]
author: Yaze Lin
---

![用 AI 兩天做出 790 題的 iPAS 模擬考站](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-23-ipas-ai-quiz.png)

> **快速連結**
> - 線上模擬考站:<https://yazelin.github.io/ipas-ai-quiz/>
> - 用 AI 做你自己的前端:<https://yazelin.github.io/ipas-ai-quiz/build.html>
> - 原始碼:<https://github.com/yazelin/ipas-ai-quiz>

先說清楚:**這不是遊戲。** 這個部落格寫過的多半是 3D 戰場、語音施法、台灣風滾球那類「玩的」專案,這次不一樣。成品是一個拿來**讀書、考照**的 web app,後來還順手變成了一個任何人都能接的開放資料層。

起點其實很土:我要考 iPAS「AI 應用規劃師(初級・中級)」,想找個能隨手刷題的站,結果不是要註冊、要收費,就是題庫零散。於是自己動手做一個:**免帳號、能離線、能刷 iPAS 歷屆題的網頁。**

兩天後它長成了這樣:790 題、純前端、可裝成 App、會每天推播提醒我念書。git log 攤開來看,所有 commit 都落在 **2026-06-22 跟 06-23 兩天**(共 55 個 commit)。下面就順著「先把自己的需求做完、再把它打開」這條線記錄。

## 題庫怎麼來:790 題全是從 PDF 抽出來的

整個站最值錢、也最不性感的部分,是把官方 PDF 變成乾淨的 JSON 題庫。790 題**全部**來自官方 PDF,其中學習指引那 179 題(約四分之一)還要額外清掉 PDF 抽取的雜訊。`questions.json` 的組成抽樣核對後是:

| 來源 | 題數 | 標記方式 |
|---|---|---|
| 歷屆公告試題 | **611** | `source` 缺省 |
| 官方學習指引範例題 | **179** | `source: "學習指引"`、id 以 `lg-` 開頭 |
| **合計** | **790** | 其中 35 題是帶圖題 |

(這三個數字是直接從 JSON 算出來、不是抄 README:總數 790、學習指引 179、歷屆 611,179 題全部 `lg-` 開頭,35 題有 `image`;挑了幾筆對回原始 PDF 確認沒灌水。)

兩個來源是**分流**的:練習頁有個「來源」下拉,可以只練歷屆、或只練官方範例。歷屆題的詳解是站上自寫的,學習指引題的解析則直接是官方附的,這條界線在 README 跟題卡上都標明了,避免把「自寫詮釋」混充成官方解析。

抽 PDF 這件事,沒有去硬寫一個正則 parser 把版面解開,而是分成兩步。

看到「PDF 轉 JSON」,第一反應通常是「那就寫個 parser 吧」。輸入有結構、輸出有結構,中間放一段解析邏輯,這幾乎是工程直覺。但這個直覺在這個案子裡會踩空。12 份歷屆卷加 5 份學習指引,各卷的版面、欄位、答案標記方式都不一樣,一個 parser 要嘛寫成一堆 if-else 分支,要嘛每換一份新卷就裂一次。而這批 PDF 一年才更新兩次,花一週養出來的 parser,一年只跑兩次,還每次都要回去修,這筆帳怎麼算都收不回來。

所以第一步只用一行把 PDF 轉成純文字。`tools/extract.sh` 的核心就是 `pdftotext -layout`,它在註解裡把這個取捨寫得很白:

```bash
# ponytail: 不寫脆弱的 regex parser 去硬解版面(全形答案字、換行題幹、各卷版面不同)。
# 結構化交給 LLM 讀這份文字輸出 JSON,比正則穩,且這批 PDF 一年才更新兩次,值不得養 parser。
```

把「版面解析」這件本來要寫死成 parser 的事,換成讓 LLM 讀純文字輸出 JSON。版面變了不必改 code,改一次 prompt 就好。這就是「該寫 parser」和「不該寫」的分界。

**第二步:結構化,順便清 PDF 的髒。** 髒活在這一步。`pdftotext` 抽出來的文字有兩種典型的雜訊,git 上各有一個專門的修正 commit。

其中一種,是一段查錯的好例子。**症狀**先冒出來:抽出來的題目有些字句裡夾著看不懂的方框亂碼,像題幹中間插了個豆腐塊。第一眼會以為是 `pdftotext` 抽壞了、或編碼選錯了。但**倒推**回去看那些方框實際的碼位,落在 U+F07D 這一帶:那是 Unicode 的私有使用區(Private Use Area),PDF 製作端拿來塞自訂符號的地方,本身就沒有標準字形,抽成純文字當然變亂碼。真因不在抽取工具,在原始 PDF 用了私有區字元。**修法**因此很乾脆:在清洗階段把 PUA 區的字元當成截斷點處理掉,而不是去跟編碼搏鬥。

另一種雜訊是 **running header 黏連**:`pdftotext -layout` 會把「第 N 章」「附件」「參考書目」這類頁首頁尾,黏進題幹或接在答案後面。

兩件事都收在學習指引那 179 題的抽取腳本 `tools/extract-guide.mjs` 的 `clean()` 函式裡:先在「第 N 章 / 附件 / 參考書目 / PUA 字元」處截斷,再做「盤古之白」(中英文之間補空白、中文之間的多餘空白收掉):

```js
const clean = s => {
  if (!s) return s;
  // 先在 running header / 附件 / PUA 框框字處截斷
  const m = s.search(/第[一二三四五六七八九十百]+章|附件|參考書目|參考文獻|[-]/);
  if (m >= 0) s = s.slice(0, m);
  return s
    .replace(/([一-鿿])\s+([一-鿿])/g, '$1$2')   // 中文間多餘空白
    .replace(/([一-鿿])([A-Za-z0-9])/g, '$1 $2')          // 中英之間補空白
    .replace(/([A-Za-z0-9])([一-鿿])/g, '$1 $2')
    .replace(/\s{2,}/g, ' ').trim();
};
```

這種「資料清洗」重複、瑣碎、要耐心對著一堆 edge case,但要盯的只有一件事:最後的題目讀起來通不通順。

## 雲端同步:一組同步碼,免帳號

我的下一個需求是「換手機也要能接著刷」。但我不想做帳號系統:登入註冊對一個刷題站是過度設計。

做法是一個**選用的** Cloudflare Worker + KV:你在設定裡輸入一組「同步碼」(格式像 `apple-banana-123`),進度就以這個碼為 key 存進 KV;換裝置輸入同一組碼就拉回來。沒有 email、沒有密碼。

```js
// worker/src/index.js — 同步端點
const sm = url.pathname.match(/^\/sync\/([^/]+)$/);
// GET  /sync/:code → 讀回進度 JSON
// PUT  /sync/:code → 上傳(限 256KB、先 JSON.parse 驗合法才寫)
```

拿一組詞當 key、沒有密碼,**那同步碼撞了、或被別人猜到,進度不就被蓋掉了?** 界線在三個地方。一是碼空間夠大,三個詞拼起來的組合數遠超過會被隨機撞上的量級,這不是帳密等級的安全,但對「我自己換手機接著刷」這個用途夠了。二是寫入這條路有護欄:`PUT` 先擋掉超過 256KB 的 body、再 `JSON.parse` 驗過是合法資料才寫進 KV,亂打一通寫不進去。三是最關鍵的:這裡存的根本不是敏感資料,就是哪些題做過、對錯、打卡天數。最壞情況是某人猜中我的碼、看到我這台機器的刷題進度——這在我的威脅模型裡是可以接受的代價,換來的是完全不必碰帳號系統。

前端的寫入策略是「checkpoint 立即寫 + 停頓補寫」:交卷、練習完成、切走或關頁、打開設定頁這些 checkpoint 直接 flush;持續作答時只靠一層 30 秒 debounce 當保底,不會每答一題就戳一次 KV。程式碼註解寫得很白:

```js
// 寫入策略:checkpoint(交卷/練習完成/切走關頁)立即 flush;持續作答只在停頓 30s 後補寫一次。
pushTimer = setTimeout(pushSync, 30000); // debounce 30s 只當長 session 的保底,真正的寫在 checkpoint
```

KV 免費方案一天寫入 1,000 次,這樣一個人一天頂多寫幾十次,免費額度綽綽有餘。而且 `SYNC_URL` 留空時,整個同步/推播會自動停用,站台依然能純本機跑。這點我覺得很重要:**雲端是加分項,不是依賴項。**

## Web Push:每天提醒我念書

光有題庫不會讓人念書,於是我要了「每天提醒」。

這部分是 Worker 的另一半:`scheduled()` handler + 每小時整點的 cron。它在 `wrangler.toml` 裡把 cron 設成每小時整點:

```toml
[triggers]
crons = ["0 * * * *"]   # 每小時整點跑
```

每次觸發,Worker 會掃所有訂閱,挑出「現在這個小時 = 使用者設定的提醒時間」的人,再用他存的進度判斷**今天到底練了沒**,只有沒練的才推:

```js
async scheduled(event, env, ctx) {
  const nowHourUtc = new Date().getUTCHours();
  // ...掃 push: 前綴的訂閱
  const practicedToday = prog && prog.daily
    && prog.daily.date === localToday && prog.daily.count > 0;
  if (practicedToday) continue;   // 今天練過了就不吵
  await sendPush(env, rec.subscription, {
    title: 'iPAS 模考 · 今天還沒練',
    body: '花 5 分鐘刷幾題,保持手感、別讓連續打卡斷掉!',
    url: '/',
  });
}
```

兩個細節我蠻喜歡:一是**時區**:訂閱時存的是使用者的 `offsetMin`,Worker 把 UTC 平移回他的當地日期再判斷「今天」,不會台灣半夜被叫醒。二是**只在該吵的時候吵**:已經練過今天就不發。推播本身走 VAPID + `webpush-webcrypto`,Cloudflare 免費額度就夠。

## 念得下去:給讀書加一點遊戲化動力

「這不是遊戲」不代表它無聊。讀書最難的是**持續**,所以站上加了一些把讀書變得有動力的機制。重點是「遊戲化讀書」,不是把考試變成遊戲。

第一個是**錯題本**,用的是 Leitner 間隔重複。它最關鍵的設計,是「掌握」不是答對一次就算:同一題要**連續答對 2 次**才會被判定掌握、自動移出複習池。為什麼要連對兩次?因為答對一次很可能是猜中、或剛好還記得上一輪的答案。要求隔一段時間再答對第二次,才能把「短期記得」和「真的會」區分開。這在 `core.js` 裡寫成 `MASTER_BOX = 3`(box 從 1 起、連對兩次升到 3 才出池),而且有單元測試 `core.test.mjs` 守著這段計分邏輯,免得日後改壞了還在偷偷放水。

其餘三個機制就快帶過:出題優先序是「答錯的 → 沒做過的 → 還沒掌握的」,讓間隔重複真的生效而不是隨機亂抽;每日 AI 觀念卡會**優先挑你最弱的章節**餵(按答錯數加權算分);再加上打卡天數、考前倒數、掌握度、成就徽章、近 14 天趨勢這類常見的儀表板元素。

這裡也藏了一個我在 [PWA 那篇]({% post_url 2026-06-15-pwa-offline-install-pitfalls %})提過的設計界線:「這台裝置裝過 App 沒」這種**裝置端旗標**,跟「我的學習進度」這種**該跨裝置同步的資料**,是分開的,不混在同一個同步 store 裡。

## 反向開放:題庫開 CORS,你可以用 AI 做你自己的前端

前面所有功夫,清 PDF、抽 790 題、分流標記、自寫詳解,本來都只是為了自己刷題。但做到這裡冒出一個念頭,把它整個翻面了:既然題庫都整理乾淨了,何不開放讓任何人(或任何人的 AI)也能接?

而題庫、觀念卡、考試日期、圖片放在 GitHub Pages 上,平台本來就回 `Access-Control-Allow-Origin: *`,不必多做什麼,任何網域的前端都能直接 `fetch`,免後端、免金鑰(唯一要自己寫 CORS 的地方,是那個選用的 Worker):

| 資源 | 網址 |
|---|---|
| 題庫 | `https://yazelin.github.io/ipas-ai-quiz/questions.json` |
| 每日觀念卡 | `https://yazelin.github.io/ipas-ai-quiz/concepts.json` |
| 考試日期 | `https://yazelin.github.io/ipas-ai-quiz/exam-dates.json` |

更進一步,有一頁 `build.html`,叫「**用 AI 做你自己的前端**」:上面有資料表、有完整欄位 schema,還附一段現成的 prompt,一鍵複製丟給 ChatGPT / Claude / Gemini,就能生出一個抓這份題庫的刷題前端。那段 prompt 開頭就特別交代:

> 題庫是公開的 JSON,請直接用 fetch 抓,**不要自己編題目或答案**。

這是個小但關鍵的防呆:不約束的話 AI 很可能自己幻想題目。`build.html` 連「進度互通」都想到了:本站可以匯出 `ipas-progress.json`,因為**題目 id 是穩定的**,別人做的前端也能匯入還原作答進度。

那不怕被白嫖嗎?**辛苦兩天整理的題庫全部開放,被人抓去做一個競品怎麼辦?** 其實這擔心搞反了方向。第一,題源本來就是官方公開試題,整理它、不擁有它,把它鎖起來既沒道理也擋不住別人自己去抓官方 PDF。第二,開放反而是這個工具最強的護城河——當別人做的前端都直接 `fetch` 這份 `questions.json`,它就成了這批題庫的事實標準資料層,源頭更新、所有下游跟著更新,這比藏起來有用得多。第三,品質是用設計守住的,不是用封閉守住的:`build.html` 那段現成 prompt 開頭就鎖死「不要自己編題目或答案」,把別人的 AI 最容易亂來的地方先堵上。

一個本來只為自己考試做的工具,順手把資料層開放出去,讓任何人(或任何人的 AI)都能在它上面長自己的東西。

## 收尾:純前端 + 一個 Worker 能走多遠

回頭看,這站的技術棧簡單到有點好笑:**vanilla JS、無框架、無 build,靜態托管在 GitHub Pages,加一個選用的 Cloudflare Worker。** 沒有資料庫(KV 就是全部)、沒有帳號系統(同步碼就是全部)、沒有後端服務(cron + push 就是全部)。

但它該有的都有:790 題官方題庫、離線、可安裝、跨裝置同步、每日推播、間隔重複、開放 API。兩天做完。

這兩天裡要盯的,是那幾條界線有沒有守住:裝置旗標 vs 同步資料、自寫解析 vs 官方解析、別讓別人的 AI 自編題目、題庫讀起來通不通順。

而這條「自己用 → 開放給別人用」的線,還有一個收尾正好把它閉環:`.github/workflows/watch-resources.yml` 是個每天跑的 GitHub Action,監看官方學習資源頁,一出新試題或學習指引就**自動開一個 issue 通知**,再決定何時更新題庫。一個對全網開放的資料層,最怕源頭更新了、資料卻爛在那裡,所以連「日後誰來盯著上游」都先鋪好了。

## 參考

- iPAS AI 模擬考站:<https://github.com/yazelin/ipas-ai-quiz>
- 用 AI 做你自己的前端:<https://yazelin.github.io/ipas-ai-quiz/build.html>
- iPAS 官方學習資源頁:<https://ipd.nat.gov.tw/ipas/certification/AIAP/learning-resources>
- Cloudflare:[Workers KV](https://developers.cloudflare.com/kv/) ／ [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- MDN:[Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
