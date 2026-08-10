---
layout: post
title: "我手列了一份自己的 PWA 清單，漏掉四個站"
subtitle: "前面三篇 PWA 文寫的是規則。這篇是承認規則靠記性執行不了：我寫了一支檢查器，再寫一支掃全機的腳本，然後一次修了 13 個 repo 的同一個 bug。那個 bug 會安靜地把別的站的離線包清空。"
date: 2026-08-07
categories: [Frontend]
tags: [PWA, service worker, 離線優先, GitHub Pages, Playwright, 檢查器, 自動化]
author: Yaze Lin
---

> **這篇講的東西**
> - 檢查器與守則（MIT）：<https://github.com/yazelin/pwa-skill>
> - 前三篇：[離線與安裝的坑]({% post_url 2026-06-15-pwa-offline-install-pitfalls %})、[SWR 與本地優先]({% post_url 2026-06-17-pwa-swr-local-first %})、[啟動優先序]({% post_url 2026-06-21-pwa-startup-priority %})

要判斷「我所有的站是不是都合規」，我先做了最自然的事：憑印象列一份清單。

漏了四個。

這件事本身不算慘，慘的是我列的時候完全沒有「可能會漏」的感覺。所以現在守則裡第一條寫的是：要判斷全部合規就跑 sweep，不要自己列清單。

## 為什麼 PWA 的 bug 特別難發現

這一類 bug 有個共同特徵：壞掉的時候功能看起來完全正常。圖照顯示、頁照開、fetch 照回 200。只有真的斷網、真的用媒體元素播、真的用手機裝，才會現形。

最貴的一個例子：Service Worker 在 `activate` 清舊快取的時候，如果沒有限定自己的前綴，會把同一個 origin 底下所有站的快取一起刪掉。`CacheStorage` 是 per-origin 的，SW 的 scope 只管 fetch，管不到快取。而我所有的專案都掛在 `yazelin.github.io` 底下，共用同一份。

所以每次某個站改版部署，它就順手把隔壁十幾個站的離線包整包清空，而且毫無徵兆：使用者下次打開那個站、剛好又沒網路，就是一片空白。

正確寫法只有一行差別：

```js
keys.filter(k => k.startsWith('myapp-') && !KEEP.includes(k)).map(k => caches.delete(k))
```

前綴還要跨專案唯一，`cs-` 這種兩個字母的很容易撞。

8 月 6 到 7 號我一次修了 13 個 repo 的這個問題：ai-font-styles、catime、comic-studio、emoji-slot-machine、gewu-jianghu-web、ipas-ai-quiz、line-chat-maker、neko-tensei、roll-formosa、taigi-caption、token-unlimited、token-unlimited-comic、mori-sprite-studio。全部是我自己的站，全部犯同一個錯。

## 第二個：只有首頁掛了 manifest

每一個可能被單獨開啟或分享的頁都是入口。章節頁、詳情頁、攻略頁、`home.html`，每一頁都要各自掛 manifest、icon links，各自註冊 SW。

只掛首頁的話，從分享連結進來的人完全看不到安裝選項。他不會回報這件事，因為他根本不知道這個站可以裝。

這條的修法不是「記得要掛」，是把這道轉換寫進建置或同步腳本，讓它自己發生。

## 那支檢查器實際在做什麼

```bash
NODE_PATH=$(npm root -g) node ~/pwa-skill/tools/pwa-check.mjs <站台目錄>
node ~/pwa-skill/tools/pwa-check.mjs <站台目錄> --static-only   # 不需要 playwright
bash ~/pwa-skill/tools/sweep.sh                                # 掃全機，印成一張表
```

`pwa-check` 會起一個仿 GitHub Pages headers 的本機 server（`Vary: Accept-Encoding` 加 Range 加 ETag），用 Playwright 裝好 SW、模擬一次改版、然後斷網，接著驗：入口頁都掛得起來、manifest 跟 icon 沒說謊、不會刪掉同 origin 別站的快取、離線包是實查過的完整、媒體真的能解碼。

這裡有個關鍵：普通的 `python3 -m http.server` 對這幾類 bug 零鑑別力。它不回 `Vary`，於是問題永遠不出現。本機測起來一切正常、上線就壞，多半是這個原因。

`sweep.sh` 則是掃整台機器上所有的 PWA 印成一張表。清單靠掃描不靠人列，因為人列的那次漏了四個。

## 檢查器自己也會說謊

8 月 7 日修了四個會誤判整站的坑，順便把規則分級（有些是真的錯，有些只是值得看一眼）。

其中一個很值得記下來：判斷某個站是否忽略 `Vary`，原本是靜態猜測，改成執行期實測。我另外記了一筆「負控制沒有重現」在文件裡，意思是我沒能造出一個應該被抓到卻沒被抓到的案例。偵測類的功能只看抓到什麼，一定會高估自己，要配負控制才知道它有沒有在亂報。

還加了一條檢查：改了被快取的檔案卻沒有 bump 版號。版號應該用內容 hash 由腳本產生，手動 bump 的遲早會忘記，我就忘過。

## 順便講快取分層

不要把所有東西綁同一個版本名。分成 SHELL（HTML、JS、資料，每次部署 bump）跟 ASSET（圖、音，只有同名檔換內容才 bump）。

實測數字：單層的時候每次部署後使用者要重抓 28.86MB，分層後 0.84MB。改成分層的那一版要一次性接手舊快取的資產，不然修好的那一次反而讓既有使用者再付一次全量。

## 這份守則的性質

裡面每一條都是上線之後被使用者踩到才寫下來的，沒有一條是我事先想到的。所以它配一支檢查器，不配一份「請記得」的清單。

規則、要不要相信檢查器的判斷、負控制沒重現要不要寫進文件，是我定的；檢查器跟 sweep 腳本是 AI 寫的。

如果你也有一堆站掛在同一個 `github.io` 底下，先去看一眼自己的 `activate` 有沒有加前綴。那個 bug 現在可能正在發生，而且不會有人跟你說。
