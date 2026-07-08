---
layout: post
title: "把一個 2003 年的 IIS 老站,重建成能撐 2 萬件商品的現代電商站"
subtitle: "紅海釣具的官網還跑在 IIS + Classic ASP + FrontPage frameset 上。這篇不是「用新框架重寫」的炫技文,是老實記一次遷移裡真正踩到的坑:免費層差點被停權,以及一次自己改錯又改回去的教訓。"
date: 2026-07-08
categories: [AI]
tags: [fishtool-tw, Astro, Vercel, Cloudflare Workers, 電商, 老站重建, AI 應用]
author: Yaze Lin
---

![FishTool.tw 探索無限可能](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-07-08-fishtool-tw.png)

> **這篇講的站**
> - 線上:<https://fishtool-tw.vercel.app/>
> - 原始碼:<https://github.com/yazelin/fishtool-tw>
> - 舊站對照:<http://fishtool.tw/>(還在跑,IIS + Classic ASP + FrontPage 4.0 frameset)

紅海釣具是中壢的實體釣具店,官網從 2003 年前後就沒大改過。開發者工具打開來看,還是三個 frameset 拼起來的頁面——那個年代的網頁做法。20,563 件商品全躺在裡面,一件沒少。

這篇記的是把它重建成 Astro + Vercel 現代站的過程,重點不是「新框架比較潮」,是兩個真正花時間解決的問題。

## 第一個問題:圖不能直連,但代理放錯地方會被停權

舊站沒有 HTTPS,新站是 HTTPS,直接嵌舊站的圖網址會被瀏覽器擋成 mixed content。解法很直覺:寫一個 image proxy,新站發請求給自己的 API,API 再去抓舊站的圖轉手吐出來。

第一版直接寫在 Vercel 的 SSR function 裡。上線後兩個警報同時跳:Fluid Active CPU 到 75%、Fast Origin Transfer 打滿 100%,免費層快被自動暫停。

根因很簡單:21GB 的商品圖,每一張都要經過一次 Vercel function 執行,吃 CPU;圖片這種東西 cache 命中率天生就低,大部分流量都是真的把位元組從舊站搬過 Vercel 再吐出去,又吃流量。**代理本身沒有錯,錯的是放在按執行次數和流量計費的地方。**

修法是把這支 proxy 整個搬去 Cloudflare Worker,邏輯一樣,計費模型不一樣:Worker 沒有 egress 費用,邊緣就近快取。圖流量從此不再經過 Vercel,兩個警報都下去了。長期打算是乾脆把 21GB 圖搬去 Cloudflare R2,原站隨時可以真的下線。

## 第二個問題:我自己把品牌名編錯了,又改回去

早期有一版,我把首頁的品牌字標從舊站原本的「FishTool.tw」換成自己編的「RED SEA TACKLE」,想說英文化聽起來比較潮。

後來還是改回了「FishTool.tw」。不是因為英文字標不好看,是那根本不是這家店的名字。重建一個老店的網站,長相可以現代化,但招牌不是我能決定要不要換的東西,那是客戶的品牌資產,不是我的畫布。

這條教訓比圖片代理那條更值得記:技術問題有客觀對錯,但品牌這種東西,做得再漂亮,不是本人要的,就是做錯了。

## 商品規模帶來的取捨

20,563 件商品全部用純靜態產生的方式 build,光是把每一頁都 prerender 出來就會拖垮 build 時間。所以站是混合模式:首頁、分類頁、選單這些流量集中、內容變化慢的頁面,build 時就先算好、直接從 CDN 發。但兩萬多個商品詳情頁是按需求即時算的,因為都先算好根本不划算,商品又幾乎不會被同時大量訪問。

這個切分不是先規劃好的架構美學,是先跑出真實的 build 時間、看哪裡拖慢了,才決定哪些頁面該先算好、哪些讓伺服器現算。

---

- 逛逛新站:<https://fishtool-tw.vercel.app/>
- 對照舊站長什麼樣:<http://fishtool.tw/>
