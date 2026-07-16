---
layout: post
title: "Web Effects Collector:我把 90 個最驚艷的開源網頁特效彙整成一頁"
subtitle: "純靜態單頁的網頁特效蒐集器 — 90 個特效分 12 類(流體、GLSL Shader、Three.js 3D、捲動敘事、粒子、生成藝術…)，每張卡片附 Demo、原始碼連結與整合說明，還內建一個點開即跑的 Playground。"
date: 2026-06-08
categories: [AI, 開發工具]
tags: [web-effects-collector, Web Effects, WebGL, GLSL, Shader, Three.js, Particles, Vanta, tsParticles, Generative Art, CSS, Static Site, GitHub Pages, 開發工具]
author: Yaze Lin
---

![Web Effects Collector:我把 90 個最驚艷的開源網頁特效彙整成一頁 封面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-08-web-effects-collector.png)

> **快速連結**
> - 線上看：[yazelin.github.io/web-effects-collector](https://yazelin.github.io/web-effects-collector/)(免安裝，點開就用)
> - GitHub:[yazelin/web-effects-collector](https://github.com/yazelin/web-effects-collector)
> - 純靜態，無 build step,clone 下來開 `index.html` 就跑

---

## 一句話

**把全網與 GitHub 上最令人驚艷、開源、可直接拿來用的網頁特效，彙整成一頁。** 每個特效都附 Demo、原始碼連結，以及「怎麼放進自己的網站」的整合說明。

目前收了 **90 個特效，分成 12 類**。整頁是純靜態的單頁 app，沒有後端、沒有 build step，線上開或本機開都一樣。

## 為什麼做這個

寫前端的人都有過這種時刻：看到某個網站的流體背景、捲動敘事、或一段絢爛的 shader，想知道「這是怎麼做的、有沒有開源、能不能直接拿來用」。但這些好東西散落在 GitHub、Codrops、各種個人 demo 站，而且很多連結放久了就死了。

所以我把它們蒐集、分類、逐條驗證，集中成一頁。重點不只是「貼一堆連結」，而是每張卡片都標了**震撼度**、技術標籤，還有一段**怎麼整合進自己專案**的說明 —— 看完知道是 npm 一行、複製貼上、還是要 clone 整個 repo。

清單是用多個 AI agent 並行檢索、再逐條對抗驗證連結真實性後彙整的，資料全存在 `data.js` 裡，要加要改都很單純。

## 12 個分類

收錄的特效照性質分成這 12 類：

- **流體 / 液態模擬(WebGL Fluid)** —— 滑鼠滑過就噴出漩渦那種。
- **Shader / GLSL 視覺** —— 純 fragment shader 的光影與圖樣。
- **Three.js / R3F 沉浸式 3D** —— 瀏覽器裡的 3D 場景。
- **捲動敘事 / Scroll 動畫** —— 隨捲動觸發的 storytelling。
- **粒子系統 Particles**。
- **Codrops 創意 UI 特效** —— 那些經典的轉場與互動 demo。
- **生成藝術 / 創意編程**。
- **純 CSS / Houdini 魔法** —— 不靠 canvas、純樣式做出的效果。
- **一行式 WebGL 背景** —— 接近複製貼上就能用的背景。
- **地球儀 / 地圖 / 資料視覺**。
- **文字 / 字體動畫**。
- **游標 / 互動 / 變形**。

每張卡片可內嵌的就直接在頁面用 `<iframe>` 預覽，不能內嵌的至少附 Demo 與 GitHub 連結。

## 內建一個點開即跑的 Playground

光看別人的 demo 還不夠，所以頁面裡放了一個「立即跑跑看」的 Playground:零依賴的 2D 星座粒子，再加上 **Vanta**(NET / WAVES / BIRDS / GLOBE / FOG / HALO 六種)與 **tsParticles**，點一下就即時切換不同效果。

這幾個函式庫都本機化放進 repo 的 `lib/`(three.js、Vanta、tsParticles，皆 MIT)，所以 Playground **離線也能跑**。

做這個 Playground 時踩到一個 tsParticles v3 的雷：它要先 `loadAll()` 註冊 drawer，而且 `fullScreen` 預設是 true，得明確關掉才會乖乖在指定的 box 裡繪製，不然會蓋滿整個畫面。這條已經修進去了。

## 怎麼跑

純靜態，無 build step。

- 直接用瀏覽器打開 `index.html`;或
- 起一個本機伺服器：`python3 -m http.server 8777`，再開 `http://localhost:8777/`

結構也很單純：

- `index.html` —— 全部 UI 與互動(內嵌 CSS / JS)。
- `data.js` —— 特效目錄資料(`window.EFFECTS_CATALOG`)。
- `lib/` —— 本機化的第三方函式庫，讓 Playground 離線也能跑。

## 一點說明

目錄裡收錄的各特效 / 專案，版權與授權都歸原作者所有，這一頁只是彙整連結與說明。內建的三個函式庫(three.js、Vanta、tsParticles)都是 MIT。

如果你發現有死連結，或有更驚艷的開源特效該收進來，歡迎到 [GitHub](https://github.com/yazelin/web-effects-collector) 開 issue。我自己最常拿它當挑特效的起點 —— 要找背景、要找轉場、要找一個有記憶點的 hero，翻一翻通常就有靈感。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
