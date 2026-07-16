---
layout: post
title: "一段 prompt，讓 AI 做出一個 3D 互動的赤壁之戰"
subtitle: "我給 Claude Code(Fable 5,effort medium)一段中文需求，它在一次對話裡交付了一個單一 HTML 檔的赤壁之戰 3D 戰場 —— 九幕時間軸、電影運鏡、火攻特效，還自己用瀏覽器逐幕檢查、抓修六個 bug。第二輪再加上配樂、旁白與音效：AI 沒有喇叭，所以它讓另一個 AI 代聽海選 CC0 配樂、用同音字替身馴服 TTS 破音字。忠實記錄整個過程。"
date: 2026-06-11
categories: [AI, 實驗]
tags: [red-cliffs-3d, 赤壁之戰, 三國, Three.js, WebGL, 3D, Claude Code, Fable 5, AI 生成, GitHub Pages, Single HTML, 程序化地形, GPU 粒子, Web Audio, edge-tts, TTS, CC0, Freesound, Gemini]
author: Yaze Lin
---

![火燒赤壁](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-11-red-cliffs-3d.png)

> **快速連結**
> - 線上玩(建議用電腦、開聲音):[yazelin.github.io/red-cliffs-3d](https://yazelin.github.io/red-cliffs-3d/)
> - 無聲原版(第一輪凍結保存):[classic.html](https://yazelin.github.io/red-cliffs-3d/classic.html)
> - AI 選曲記錄(怎麼海選配樂的):[audition.html](https://yazelin.github.io/red-cliffs-3d/audition.html)
> - GitHub(含原始 prompt + 實驗記錄):[yazelin/red-cliffs-3d](https://github.com/yazelin/red-cliffs-3d)
>
> **2026-06-12 更新**:加上聲音了 —— 配樂、旁白、音效。下面有摘要，完整一篇見 [給赤壁 3D 加上電影級音訊]({% post_url 2026-06-13-red-cliffs-audio %})。

---

## 一句話

我給 Claude Code 上的 **Fable 5** 一段中文需求，它在**一次對話**裡做出一個可以互動的赤壁之戰 3D 戰場：程序化生成的長江戰場、九幕時間軸、電影運鏡、火攻特效，全部裝進**單一 HTML 檔**，還自己部署上了 GitHub Pages。

這篇不是要講赤壁，是要忠實記錄 **AI 怎麼做出這個東西的**。

## 它長什麼樣

一個歷史節目感的 3D 戰場：從「大軍南下」演到「天下三分」，九幕時間軸。可以像紀錄片一樣自動播映(電影運鏡 + 上下黑邊)，也可以隨時拖滑鼠接管鏡頭、自己飛到戰場上看。

- 地形是程序化生成的：赤壁紅崖、烏林、夏口、漢水、華容道沼澤、江陵襄陽
- 三方上色：曹操藍、孫權紅、劉備綠;軍旗直接畫「曹／孫／劉」大字，遠看就認得出
- 計策卡：連環、苦肉、借東風、火攻，用全螢幕書法卡呈現，還分「史」(正史)跟「演義」
- 火攻那幕：火船衝陣、連環船延燒、東南風粒子、火光映江、箭雨火矢、鏡頭震動

## 我只打了一段需求

原始 prompt 一字未改：

> 以電視特別節目的3D運鏡方式和特效來介紹赤壁之戰，把地形和地名、船艦等標示出來;曹操為藍色，孫權為紅色，劉備為綠色，以時間軸來顯示戰爭過程中各軍勢的陣型、移動方向、將領姓名、重大事件、各軍戰力、要有計策發動效果、槍炮和天氣、軍隊、船艦狀態的特效，看起來要像遊戲讓玩家可互動或歷史節目自動播放，應可自由移動照相機角度。各軍軍旗需可清楚識別。使用單一html檔完成，並部署到我的github repo pages 上。

中途人工輸入只有兩段：這段原始需求，加上後來追加的「補 SEO/OG 圖、把過程寫進 README、產一篇 FB 文」。美術方向、史料取捨、運鏡腳本，全部是模型自己決定的。

## 最有意思的是它怎麼除錯

這不是「一次寫對」的故事 —— 它寫完約 1900 行的單一 HTML 之後，**自己起了一個本機 server，用 Chrome DevTools 開頁面、讀 console、逐幕截圖檢查**，然後抓到並修掉六個 bug，全程沒有我介入 debug:

1. 地形程式碼殘留一行未閉合括號 —— 語法錯誤，頁面直接掛
2. `buildChains()` 寫了卻忘了呼叫 —— 鐵索連環沒有鎖鏈
3. 夏口城座標落在漢水河道裡 —— 城蓋在水上
4. 火攻狀態寫在幕首就 set —— 害「火燒赤壁」一開幕全軍就著火，後來拆成時間軸事件
5. CSS2DRenderer 只看標籤自己 visible、不看父層 —— 「黃蓋先鋒」標籤在登場前就飄在戰場上
6. 開場直書標題在小視窗會爆版

這六個都是真的發生過、又被它自己在驗證迴圈裡逮到修掉的。對我來說，「會自己開瀏覽器檢查、自己抓自己的 bug」比「一次寫出 1900 行」更值得記。

還有個細節我蠻喜歡：我需求裡寫了「槍炮」，它知道西元 208 年沒有火炮，**自己改用弓弩、火矢、火船爆燃**來做遠程跟爆炸特效，還在頁面跟 README 裡註明了這個取捨。史料那邊也自己把《三國志》的「史」跟《三國演義》的「演義」(借東風、苦肉計、義釋曹操)分開標。

## 技術上

- [Three.js](https://threejs.org/) r160,CDN importmap,**零 build step**
- 全部在一個 `index.html`:地形、單位、粒子、運鏡、UI、時間軸引擎
- 地形：value-noise FBM 高度場 + 河道雕刻 + 頂點上色
- 火焰/濃煙：GPU 粒子(生命週期在 vertex shader 裡用 seed + time 算，CPU 零更新)
- 軍旗：Canvas 畫書法字當貼圖 + 頂點波動;地名/部隊/事件用 CSS2DRenderer

## 心得(忠實版)

一段中文需求 → 一個可玩的 3D 互動歷史節目，過程大約一次對話。不是零修正 —— 那六個 bug 都真的發生過，只是都被模型自己抓自己修。

對我來說這比「AI 會寫 code」更有感的點是：它會**自己驗證**。寫完不是丟給我說「好了」，而是自己開瀏覽器、自己逐幕看、自己發現「欸這個城蓋在水上了」再回去修。原始 prompt、完整實驗記錄、原始碼都在 [repo](https://github.com/yazelin/red-cliffs-3d) 裡。

---

## 第二輪更新：加上聲音了

(2026-06-12)隔天我追加了一段需求：加上電影級配樂、各幕音效、旁白解說，做完先讓我本機看過再決定要不要公開。現在的版本九幕各有配樂與旁白(男聲女聲可切換)、同步字幕、開場主題曲，以及戰鼓、馬蹄、箭雨、刀劍、鐵索、火船爆燃等程序化合成的環境音;原本的無聲版凍結成 [classic.html](https://yazelin.github.io/red-cliffs-3d/classic.html) 保存。

這一輪比較有意思的，是 AI 得處理三件它「天生做不到」的事：沒有喇叭怎麼選配樂(它自己寫了一條海選管線，用另一個 AI 代聽 CC0 候選曲)、TTS 的破音字之戰、還有「有一個合成音聽起來怪怪的」這種只有人耳抓得到的問題。

這段我獨立寫成一篇細講：[給赤壁 3D 加上電影級音訊 —— 讓 AI 代聽海選 CC0 配樂、用同音字替身馴服破音字]({% post_url 2026-06-13-red-cliffs-audio %})。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
