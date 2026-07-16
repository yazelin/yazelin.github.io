---
layout: post
title: "ChingTech Case Hub:把我們做過的工具，整理成一個能打開來試的入口"
subtitle: "擎添工業的案例展示資料庫 — AGV / RGV 動線模擬、產線與製程模擬器、HMI 手冊、IO 點位對照工具、CTOS Lite，全部收進一頁。每個案例都保留可操作的 GitHub Pages demo、repo 與應用場景，客戶能快速理解，工程社群也能直接追到實作入口。"
date: 2026-06-10
categories: [擎添工業]
tags: [ChingTech, Case Hub, 工業自動化, AGV, RGV, HMI, PLC, SCADA, IO Mapping, 產線模擬, 製程模擬, CTOS, GitHub Pages, Tauri]
author: Yaze Lin
---

![ChingTech Case Hub:把我們做過的工具，整理成一個能打開來試的入口 封面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-10-chingtech-case-hub.png)

> **快速連結**
> - 整合頁：[ching-tech.github.io/chingtech-case-hub](https://ching-tech.github.io/chingtech-case-hub/)
> - GitHub:[ching-tech/chingtech-case-hub](https://github.com/ching-tech/chingtech-case-hub)
> - 組織：[github.com/ching-tech](https://github.com/ching-tech)

---

## 一句話

**我在擎添工業做過的系統、模擬器和日常工具，散在好幾個 repo 裡。Case Hub 把它們收進同一頁 —— 每個案例都有可操作的 demo、repo 連結、應用場景與標籤，一個入口就找得到。**

做工業自動化，很多東西做完就躺在某個案場、某個 repo 裡，別人(甚至我自己)要找回來都得翻半天。這個整合頁就是要解掉這件事：把能公開的成果，整理成可以打開、可以試、可以延伸的入口。

## 為什麼做這個

平常跟客戶談，常需要快速說明「我們做過類似的東西長這樣」;對工程社群，則希望留下可參考的實作。但散落各處的 repo 不好直接給人看 —— 有的是手冊、有的是 demo、有的只是原始碼。

Case Hub 的做法是：**每個案例統一保留 Pages 入口、repo、應用場景與標籤**，前端用一個 `projects` 陣列驅動，搜尋、分類篩選、深淺色切換、Pages 狀態表都是同一份資料產生的。要加新案例，就往陣列補一筆，不必動版型。

它本身也只是一個靜態頁(`index.html` + 一點 vanilla JS，圖示用 lucide)，放在 GitHub Pages 上，維護成本低。

## 目前收錄了哪些

整合頁現在收了七個案例，大致分成幾類：

**搬運與動線模擬**

- **AGV Simulation** —— 以 AGV 動線、站點與搬運節拍為核心的線上展示，用來說明廠內自動搬運的規劃與模擬流程。
- **RGV Simulation** —— 軌道式(RGV)搬運情境的模擬，說明站點配置、任務節奏與搬送流程。

**產線與製程模擬**

- **Production Line Visualization Simulator** —— 產線視覺化模擬器，整理一條玻璃強化線的 UPH、瓶頸設備、站點利用率、手臂取放與烤箱負載;頁內提供主版本與雙臂版本兩個可玩的模擬。
- **Process Simulate** —— 製程 AGV 動態模擬器，用來觀察製程線在不同參數下的產能、瓶頸、各站 UPH 與 AGV 稼動狀況，有內嵌與全頁兩種 demo。

**現場介面與工具**

- **ChingTech Meter HMI** —— 一套量測檢測系統的操作手冊，涵蓋 PLC 通訊、藍牙量測裝置、檢測流程與資料紀錄。
- **IO Mapping Tool** —— 工業設備與主系統 PLC / SCADA 之間的 IO 點位對照管理工具，支援設備清單、收發 IO 表、主系統反向視角、Excel 匯出，還有桌面版的 PLC 即時監控(Tauri)。

**AI 工具**

- **CTOS Lite** —— CTOS 的輕量展示與工具入口，公開頁保留 LINE AI 員工、知識庫、記憶、Drive 同步與管理後台的手冊展示;產品本身的程式碼不公開。

每張卡片上，點 demo 就能直接打開可操作的展示，點 repo 就跳到原始碼;能對外分享的，Pages 入口都列在底下的狀態表裡，方便確認哪些已經可以直接給人看。

## 一點想法

這幾個案例橫跨了搬運(AGV / RGV)、產線與製程模擬、HMI、設備通訊到 AI 工具 —— 大致就是擎添這些年實際在做的事。把它們收成一頁，對外是「我們做過這些」，對內其實也是一份會持續長大的清單：新的技術繼續放進實作，能分享的就持續分享出來。

如果你也在做工業自動化，或單純好奇這些模擬器跑起來長什麼樣，歡迎點開來玩。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
