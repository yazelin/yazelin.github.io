---
layout: post
title: "每天去 Larch 抄一次數字的 repo，和一把在公開 repo 裡放了快兩天的金鑰"
subtitle: "larch-showcase 排在每天早上十點，用 GitHub Actions 打 Larch 的 API，把我 19 部作品的瀏覽、遊玩、愛心、留言抄回來。這篇記它怎麼接上 Larch、抄回來的資料長什麼樣，還有當天沒被抓到的洞：巡檢對壞掉的連結照樣回報正常，API 金鑰被寫死在公開的程式裡。"
date: 2026-10-16
categories: [AI]
tags: [Larch, larch-showcase, GitHub Actions, GitHub Pages, API, 自動化, 金鑰外洩, 驗收]
author: Yaze Lin
---

![Larch 作品頁：上面一排總數，下面是作品封面牆](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-10-16-larch-showcase-stats.webp)

我在 Larch 上架了 19 部作品。想知道哪一部有人在玩、哪一部多了留言，原本要一部一部點進去看。10 月 14 日中午我開了一個 repo 叫 larch-showcase，讓 GitHub Actions 每天替我去抄一次。

成果現在在這裡：<https://yazelin.github.io/larch/>。

## 需求只有一段話

我丟給 AI 的需求是這樣（原文照貼，只拿掉金鑰）：

> 我的github 開一個repo 每天固定時間 瀏覽幾個Larch 作品連結 用actions 寫 然後我想要看到這些作品的總瀏覽和留言和愛心等等資訊 我會提供larch 的apikey 之後可以在github actions 中使用 先將架構寫出來 用github pages 上可以看到我這些作品的資訊 等於是我的作品的專屬展示頁面

後面接著貼了 Larch 的 API 金鑰，和 Larch 官方給 AI 用的 larch-story-studio skill 全文。程式是 Antigravity CLI 寫的（模型選 Gemini 3.8 Flash），11:31 送出需求，11:38 第一個 commit 推上 GitHub。到 12:34 為止一共八個資料同步以外的 commit，全部是 AI 寫、AI 推的，我負責看頁面、挑毛病。

## 怎麼接上 Larch：兩支 API

larch-story-studio skill 裡列了一串 Larch 給 agent 用的端點，其中一支是 `GET /api/agent/published`。帶著金鑰打它，就會拿到我自己已上架的每一部作品：

- 瀏覽（views）、遊玩（plays）、愛心（likes）、留言（comments）
- 還沒回的留言數（unanswered）、彈幕數（danmaku）
- 每一章的名稱與卡片數、版本號、AI 使用揭露、封面網址

第一版只有這支。我接著丟了市集的網址過去，說「你查一下遊戲作品列表就知道」，AI 就找到市集頁背後的 `GET /api/marketplace`。這支不用金鑰，回傳整個市集的公開清單，今天是 94 部。

腳本把整個市集照瀏覽數排一次，算出我每一部排第幾。所以作品頁上寫的「市集瀏覽第 N 名」是我們自己用瀏覽數排的，不是 Larch 給的名次。

## 每天十點那一輪在做什麼

`.github/workflows/update-stats.yml` 設 `cron: '0 2 * * *'`，排在台灣時間早上十點（GitHub 的排程常常晚跑，10 月 15 日那輪拖到下午兩點多）。它跑 `scripts/fetch_stats.py`，只用 Python 內建的 `urllib`，不用裝任何套件：

1. 帶金鑰打 `/api/agent/published`，拿我的作品。
2. 打 `/api/marketplace`，排名次。
3. 把每部作品的遊玩頁和市集頁各請求一次，記下狀態碼和花了幾毫秒。這一步就是需求裡的「瀏覽幾個作品連結」。
4. 跟前一天的快照比，算出今天多了幾個瀏覽、幾個愛心、幾則留言。快照存在 `data/history.json`，留最近 90 天。
5. 全部寫進 `data/works.json`，commit 回 repo，再部署 GitHub Pages。

金鑰放在 GitHub Secrets 的 `LARCH_API_KEY`，workflow 用環境變數傳給腳本。這個設計本身沒問題，問題出在別的地方，後面講。

## 當天被我點出來的幾件事

**沒有自訂網址的作品，連結全部打不開。** 我點《仙泉·香布纏．無雙》，打不開。AI 用 curl 查，頁面標題是「找不到遊戲」，講清楚 Larch 的規則：有設自訂短網址（customSlug）的作品是 `/play/market/yaze/<短網址>`，沒設的只能用 `/play/market/<作品 id>`，不能帶作者名。19 部裡有 10 部沒設短網址，都是同一個錯。

**標籤太多，佔掉版面。** 我請 AI 讀過每一部作品的 repo，替它們補上對應的市集標籤。AI 說有一支只改上架資訊、不發新版本、不通知追蹤者的 `PATCH /api/agent/projects/:id/publish`，我要它照這個不打擾的方式改。補完之後展示頁上方的標籤按鈕排了好幾行（AI 自己數是四到五行），我問是不是破壞版面了，AI 改成一排主要分類加一個「更多標籤」的抽屜。

我也問了 AI 加的「原創音樂」標籤是什麼意思，這幾部的配樂不是也用了 AI 嗎。AI 的解釋是想表達「為這部作品專門做的」，但讀者很容易讀成真人作曲，後來改成「專屬配樂」。

**有幾部作品的簡介是預設字或太短。** 《晚霞是舌尖最後的刺痛》的簡介還是預設的「新的 Larch 視覺小說專案」。AI 用同一個不打擾的通道補了五部作品的市集簡介，專案內部的簡介也透過 Larch 的 MCP 一起改了。

## 洞一：巡檢對壞掉的連結也回報正常

寫這篇的時候，我請 Claude Code 回頭驗了一件事。把剛才那條打不開的網址丟給 curl：

```text
$ curl -s -o /dev/null -w '%{http_code}' https://larch.ink/play/market/yaze/74fc7b5a-…
200
$ curl -s https://larch.ink/play/market/yaze/74fc7b5a-… | grep -o '<title>[^<]*'
<title>找不到遊戲 — Larch
```

Larch 對找不到的遊戲也回 200，只是頁面標題寫「找不到遊戲」。巡檢那一步只看狀態碼。Claude Code 翻了那段時間的 `data/works.json`：10 部作品的連結都是壞的，每一輪巡檢照樣把所有請求記成 200。14 日那天 AI 自己用 curl 看到了「找不到遊戲」，修完回報的還是「19 部的遊玩頁全部 HTTP 200 OK」。那天真正抓到問題的是我去點了一下。

這個洞現在還沒補。要補的話，巡檢要讀頁面標題，不能只看狀態碼。

## 洞二：金鑰被寫死在公開的程式裡

10 月 16 日早上，我請 Claude Code 把這個展示頁改成跟 blog 同一套樣子。它讀 repo 的時候發現 `scripts/sync_internal_descriptions.py` 裡有這一行（金鑰我遮掉了）：

```python
API_KEY = os.environ.get("LARCH_API_KEY", "").strip() or "larch_81b4…"
```

環境變數沒設，就用後面那串寫死的完整金鑰。這支腳本是 14 日 12:34 補簡介那一輪加進來的，larch-showcase 是公開 repo，所以那把金鑰在 GitHub 上放了快兩天。它能改我的專案和上架資訊，不只是讀數字。

源頭是我自己把金鑰貼進需求裡。AI 拿到之後，workflow 那邊照規矩讀 GitHub Secrets，另一支一次性的批次腳本卻把它寫成了預設值。

處理順序是這樣：

1. 我到 Larch 刪掉舊金鑰、產一把新的。
2. 新金鑰只放進 GitHub Secrets，沒有寫進任何檔案。
3. 程式改成沒有環境變數就直接停下來，不再有寫死的預設值。
4. 推上修正時自動跑了一次 workflow，Claude Code 又手動觸發一次，新金鑰 09:26 同步成功。
5. 拿舊金鑰打一次唯讀的 `/api/agent/published`，回 401，確定已經失效。

舊金鑰還留在 git 歷史裡，但已經不能用了，所以沒有去改寫歷史。

## 順手又踩了一個：兩輪同步撞在一起

上面第 4 步那兩輪 workflow 幾乎同時跑。後面那一輪 commit 資料時跟前一輪撞到，`git pull --rebase` 衝突，workflow 裡的重試迴圈把失敗吞掉，接著把還帶著衝突標記（`<<<<<<<`）的 `works.json` 部署上 GitHub Pages。整個步驟顯示成功，/larch/ 卻讀不到資料，上面那排總數直接消失。

是 Claude Code 準備這篇封面圖、截不到總數才發現的。修法是兩件事：撞到時以這一輪剛抓的資料為準（`-X theirs`），三次都推不上去就讓步驟失敗，不要再往下部署。又是一個「沒報錯不代表做對了」。

## 展示頁搬進 blog

AI 第一天做的展示頁是一個獨立的數據看板，風格跟 blog 完全不同。今天把公開的那一頁搬進 blog，變成 [/larch/](https://yazelin.github.io/larch/)：

- 版面用 blog 同一套頁首、角色聯動和頁尾。
- 打開頁面時讀 larch-showcase 的 `data/works.json`，兩邊在同一個網域，所以直接讀得到。
- 公開頁只放總數和每部作品的數字。「今天多了幾個」、「還沒回的留言」、「巡檢狀態」這些是給我自己看的，留在原本的看板 `larch-showcase/dashboard.html`。
- 舊網址 `yazelin.github.io/larch-showcase/` 會自動轉到 /larch/。
- 寫到 Larch 作品的文章，側欄會放那部作品的封面，點了直接進 Larch 開始玩。

想看我在 Larch 上做了什麼，從 [/larch/](https://yazelin.github.io/larch/) 開始。程式在 <https://github.com/yazelin/larch-showcase>。
