---
layout: post
title: "AI 應用實作營:8 個能跑的 starter，先手刻看懂底層，再換框架放大"
subtitle: "把我做過、上線過的 AI 應用拆成 8 個公開 starter-template repo、4 個系列。每個模組都用 Part1 從零手刻誠實 baseline → Part2 換真工具/框架對照的教法，程式碼公開、手冊免費。Hub 在 j303。"
date: 2026-06-09
categories: [AI, 開發工具]
tags: [J303, AI, MCP, Agent, LINE Bot, Telegram, RAG, MQTT, LLM, Gemini, FastMCP, PydanticAI, Starter Template, 教學]
author: Yaze Lin
---

![AI 應用實作營:8 個能跑的 starter，先手刻看懂底層，再換框架放大 封面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-09-ai-workshop-starters.png)

> **快速連結**
> - Hub 總覽：[yazelin.github.io/j303](https://yazelin.github.io/j303/)
> - 8 個模組 repo 都掛在 [github.com/yazelin](https://github.com/yazelin) 底下(下面逐一連)
> - 每個模組都有：教學頁(tutorial.html)+ GitHub 模板 + 免費手冊 + 多數附一個真實案例 repo

---

## 一句話

**我把做過、上線過的 AI 應用，拆成 8 個能直接 clone 來跑的 starter，組成 4 個系列。** 每個模組都同一套教法：**Part 1 從零手刻一個誠實的 baseline，看懂底層在做什麼;Part 2 換上真工具或框架，拿生產力。** 程式碼公開、做法寫成手冊，全部免費。

共同心法一句話：**先從零看懂底層，再用真工具放大。** 手刻過，你才知道框架在替你省什麼;也才知道哪些事 —— 像安全邊界、業務邏輯 —— 框架永遠不會替你扛。

## 為什麼是「兩段對照」

市面上的 AI 教學常常一上來就 `pip install` 某個框架，三行跑出結果。看起來很爽，但你不知道那三行底下發生什麼，出事也不會 debug。

所以每個模組我拆兩段：先逼你手刻 baseline(stdio JSON-RPC、簽章驗證、tool-calling 迴圈、關鍵字檢索…)，親手寫過一遍;再換成框架或真實資料做對照。手刻那段不是浪費 —— 它讓你看懂框架替你省了哪一截，也讓你看清哪些事框架不會幫你扛。

下面 4 個系列、8 個模組。**不是每門都跟工廠有關** —— 其中「企業與工廠」那幾門，才是我顧問在做的事的入門版，其他三個系列是給任何想上手 AI 應用的開發者。

## 系列一 · 基礎：給 AI 加能力

讓 AI 會用工具、學新技能的底層。

**Module 1 — MCP Server**:Part 1 從零手刻 stdio JSON-RPC，看懂 AI 怎麼發現、呼叫工具、拿回結果 → Part 2 換 FastMCP，同樣的工具少寫一大截。
[教學頁](https://yazelin.github.io/mcp-server-starter/tutorial.html) ·
[mcp-server-starter](https://github.com/yazelin/mcp-server-starter) ·
真實案例 [erpnext-mcp](https://github.com/yazelin/erpnext-mcp)(真實 ERP MCP)

**Module 2 — Agent Skills**:Part 1 每次貼一長串 prompt(不一致、要重打)→ Part 2 打包成會自動觸發的 Skill(`SKILL.md` + 腳本)，精確的活交給腳本。
[教學頁](https://yazelin.github.io/agent-skill-starter/tutorial.html) ·
[agent-skill-starter](https://github.com/yazelin/agent-skill-starter) ·
真實案例 [nanobanana-pro](https://github.com/yazelin/nanobanana-pro) skill

## 系列二 · 對話機器人

接聊天平台，做成會自己辦事的 agent。

**Module 1 — LINE Bot AI**:Part 1 手刻簽章驗證、事件解析、Reply API → Part 2 換官方 line-bot-sdk，同一份 bot 邏輯共用。
[教學頁](https://yazelin.github.io/linebot-ai-starter/tutorial.html) ·
[linebot-ai-starter](https://github.com/yazelin/linebot-ai-starter) ·
真實案例 [jaba-ai](https://github.com/yazelin/jaba-ai)(群組點餐 bot)

**Module 2 — Telegram AI Agent**:Part 1 手刻 tool-calling 迴圈(自己組 messages、跑工具、接回結果)→ Part 2 換 PydanticAI，工具一個 decorator 就好。
[教學頁](https://yazelin.github.io/telegram-ai-agent-starter/tutorial.html) ·
[telegram-ai-agent-starter](https://github.com/yazelin/telegram-ai-agent-starter) ·
真實案例 [telegram-gemini-bot](https://github.com/yazelin/telegram-gemini-bot)

## 系列三 · 企業與工廠

把 AI 裝進公司文件與工廠產線 —— 這兩門是我顧問實際在做的事的入門版。

**Module 1 — 企業 AI 助理(RAG)**:把公司十年的文件，變成隨問隨答的內部知識庫。Part 1 關鍵字計次檢索(換句話說就找不到)→ Part 2 換語意檢索(fastembed 向量)，同樣的介面與回答層。做完你會有一個能讀自己 PDF/Word、答得出處、答錯能查的內部問答原型。
[教學頁](https://yazelin.github.io/company-ai-assistant-template/tutorial.html) ·
[company-ai-assistant-template](https://github.com/yazelin/company-ai-assistant-template) ·
真實案例 [ching-tech-os](https://github.com/yazelin/ching-tech-os)(企業 OS)

**Module 2 — 工業 AI Dashboard**:讓產線數字自己跑出來，沒人要再手抄白板。Part 1 模擬資料的玩具看板 + 樣板摘要 → Part 2 接真實 MQTT 設備資料 + LLM 班報，前端與 API 一行都不用改。接的是真實 MQTT 設備資料，不是模擬假數據的玩具看板。
[教學頁](https://yazelin.github.io/industrial-ai-dashboard-starter/tutorial.html) ·
[industrial-ai-dashboard-starter](https://github.com/yazelin/industrial-ai-dashboard-starter)

## 系列四 · 繪圖魔法師

用 LLM 生圖，從一句話 prompt 到做成產品。

**Module 1 — AI 生圖入門**:Part 1 一句話 prompt(每次都不一樣)→ Part 2 結構化 prompt(主體/風格/光線/構圖/負面詞，可控、可重現)，用最小 Gemini client。
[教學頁](https://yazelin.github.io/gemini-image-starter/tutorial.html) ·
[gemini-image-starter](https://github.com/yazelin/gemini-image-starter) ·
真實案例 [catime](https://github.com/yazelin/catime)(每小時生圖)

**Module 2 — AI 貼圖製造機**:把生圖做成產品，1 張 grid → 切圖 → chroma-key 去背 → LINE 規格 → 打包 ZIP 上架。Part 1 天真門檻去背 → Part 2 正確產線。
[教學頁](https://yazelin.github.io/ai-sticker-starter/tutorial.html) ·
[ai-sticker-starter](https://github.com/yazelin/ai-sticker-starter) ·
真實案例 [line-sticker-studio](https://github.com/yazelin/line-sticker-studio)(生產版)

## 怎麼用

每個模組都是一個獨立的 starter-template repo,clone 下來就能跑;教學頁是精簡的「快速了解版」(這是什麼 → 你會做出什麼 → 5 分鐘跑起來 → Part 2 對照 → 下一步)，完整 9 章手冊可以免費下載。

不知道從哪開始，就先到 Hub [yazelin.github.io/j303](https://yazelin.github.io/j303/) 看一頁總覽，挑你最有感的那門進去。基礎兩門(MCP、Skills)是其他模組的底，想打地基的話從那邊起手最順。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
