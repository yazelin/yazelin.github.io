---
layout: post
title: "行銷頁健檢器:貼個網址,30 秒看你的活動頁哪裡漏分"
subtitle: "貼上活動頁網址,檢查分享卡(OG)、被 AI / 搜尋找到、轉換 CTA、圖片速度、基本體質、追蹤六大類,給分數 + 白話修法 —— 每一項還附一段可以直接複製給 AI 的修正 prompt。前端 GitHub Pages + Cloudflare Worker,純函式檢查可單元測試。"
date: 2026-06-07
categories: [AI, 開發工具]
tags: [marketing-page-checker, OG, SEO, CTA, Cloudflare Worker, HTMLRewriter, GitHub Pages, 行銷頁, Landing Page, JavaScript, Self-hosted]
author: Yaze Lin
---

![行銷頁健檢器:貼個網址,30 秒看你的活動頁哪裡漏分 封面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-07-marketing-page-checker.png)

> **快速連結**
> - 直接用:[yazelin.github.io/marketing-page-checker](https://yazelin.github.io/marketing-page-checker/)(貼網址就測,免登入)
> - GitHub:[yazelin/marketing-page-checker](https://github.com/yazelin/marketing-page-checker)

---

## 一句話

**貼上你的活動頁 / landing page 網址,30 秒給你一份健檢報告:六大類各自打分,告訴你哪裡漏分,還附上可以直接複製給 AI 的修正 prompt。**

做行銷頁最常見的狀況是:頁面看起來沒問題,但分享到 LINE / FB 沒有預覽圖、搜尋引擎跟 AI 抓不到、CTA 藏在最下面、圖片肥到載很久、追蹤碼根本沒裝。這些都不會「報錯」,但每一個都在默默漏掉轉換。這個小工具就是把這些看不見的扣分項一次照出來。

## 它檢查什麼

貼一個網址,它從六大類去體檢:

- **分享卡(OG)** —— `og:title` / `og:description` / `og:image` 在不在、圖規格對不對。沒有的話,分享出去就是一條沒有預覽圖、標題空白的乾連結。
- **被找到(SEO / AI)** —— title、description、結構化資料這些「讓搜尋引擎跟 AI 看得懂你在賣什麼」的基本盤。
- **轉換 CTA** —— 有沒有明確的行動呼籲、藏得會不會太深。
- **圖片速度** —— 實際去抓圖片的大小(HEAD request),揪出拖慢首屏的肥圖。
- **基本體質** —— 頁面的基礎健康項。
- **追蹤** —— 有沒有裝分析 / 轉換追蹤,不然你連成效都量不到。

每一項不只給「過 / 不過」,還給**白話的修法**。最好玩的是:**每個問題都附一段可以直接複製、貼給 AI 的修正 prompt**。例如它抓到你沒有分享圖,就直接給你一句「幫我加 `og:image` meta,指向一張 1200x630 的分享圖完整網址」—— 你複製貼給 Claude / Codex,它就照著改。健檢完不是丟一堆術語讓你自己想辦法,而是直接把「下一步怎麼修」也準備好。

## 怎麼做的

架構刻意簡單,兩層:

- **前端 `index.html`**(GitHub Pages):輸入網址 → 呼叫 Worker → 把回來的 JSON 畫成分數卡。純靜態,沒有後端伺服器要養。
- **後端 `worker/`**(Cloudflare Worker):抓目標頁的 HTML → 用 `HTMLRewriter` 解析 → 跑六類**純函式**檢查 → 對圖片發 HEAD request 抓大小 → 加權算總分 → 回 JSON。含 CORS、每 IP 限流,還有 **SSRF 護欄**(擋掉指向內網 / loopback 的網址,不讓人拿它當跳板打內部服務)。

把「檢查邏輯」做成純函式(`worker/checks.js`:吃一份 `PageData` 回結果)有個好處 —— 它跟「抓網頁、解析 HTML」的 runtime 完全分開,所以可以在 node 端用 vitest 直接單元測試,不用真的去打一個網站。解析層(`HTMLRewriter`)歸 Worker runtime,檢查層歸純函式,各自獨立。

```bash
cd worker
npm install
npm test            # 純函式檢查的單元測試
npx wrangler deploy # 部署 Worker
```

## 為什麼做這個

我自己在做行銷頁 / 課程 landing 的時候,反覆在檢查同一份清單:OG 補了沒、分享圖規格對不對、CTA 夠不夠明顯、圖片有沒有壓。與其每次手動查,不如做成一個貼網址就跑的工具 —— 順便也給任何在做活動頁的人用。它本身不賣什麼,就是一個照妖鏡:把你頁面上看不見的漏分項,一次攤開來。

歡迎拿你自己的頁面去測測看,有 bug 或想加的檢查項開 issue。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
