---
layout: post
title: "這個 demo 裡 AI 一行新程式都沒寫,但我覺得它比寫程式的 demo 更值得看"
subtitle: "規格放在知識庫、AI 從知識庫接單、做完報告自己走回知識庫、一條連結分享給客戶。四張截圖走完整個流程,包含中間踩到的一個權限坑。"
date: 2026-07-09
categories: [AI]
tags: [知識庫, Claude Code, CTOS, LINE Bot, CLI, 甲方思維, AI 開發流程]
author: Yaze Lin
---

![知識驅動開發流程架構](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-07-09-kb-driven-dev-flow-cover.jpg)

先講結論:**AI 寫程式已經不稀奇了,稀奇的是程式寫完之後,規格、進度、驗收報告最後都去了哪裡。**

大部分團隊的答案很誠實:規格在某封 email 裡,進度在某次會議的口頭報告裡,驗收條件在某個人的腦袋裡。AI 來了之後這件事沒有變好,反而更糟,因為產出的速度變快了,散掉的速度也變快了。

所以這次 demo 給客戶看的是一條完整的迴圈:**需求進知識庫、AI 從知識庫接單開發、做完報告自動回寫知識庫、最後一條連結把整包分享出去。**知識庫全程是單一事實來源。

這篇是為兩種人寫的。一種是想導入 AI 開發、但擔心「AI 產出一堆東西之後誰來管」的公司;一種是自己已經在用 Claude Code 這類工具、想把散在各處的規格收攏的人。

## 第一步:在 LINE 上開一個知識條目

流程從手機開始。跟公司的 LINE 機器人說一聲,幫我建一個空的知識庫條目,要拿來 demo 用:

![LINE 上請機器人建立知識條目](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/kb-driven-dev-flow-line-create.jpg)

機器人建好 kb-210「QC Station 開發規格」,裡面放了基本架構、API 端點、設定檔指令,最後留一個空的「待開發功能」區塊。這個空區塊就是整個 demo 的掛鉤點:現場客戶口述一條需求,打進去,後面的事就交給 AI。

## 第二步:Claude Code 從知識庫接單

回到電腦,開 Claude Code,只丟一句「看一下 kb210,我們要 demo 從知識庫開始開發的流程」。它自己用 `ctos kb get kb-210` 把規格抓下來讀,對上本機的專案 repo,然後把開發完成報告用 `ctos kb update` 寫回去:

![Claude Code 讀取知識庫並回寫報告的過程](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/kb-driven-dev-flow-claude-session.jpg)

中間有踩到一個坑,我覺得值得留著講。回寫的時候吐了 403,因為手上的 API token 是唯讀的,要重新跑 `ctos login --read-write` 換一顆可寫的 token 才過。這其實是故意的設計:**讀知識庫是日常,寫知識庫是動作,兩種權限分開發。**AI 要改公司的知識,得先拿到明確授權才行。

還有一件事要老實講:這次 demo 裡 AI 沒有真的開發新功能,「開發完成」是排練出來的。但報告內容是真的:它自己翻了專案 repo 最近合併的 PR,拿真實完成項(工業相機整合、雙機參數切換、預覽提速這些)填進去。流程的每一條指令都是真的跑,只有「寫新程式」那段是借現成的成果來演。

## 第三步:一條連結分享給客戶

報告回寫之後,再回到 LINE 跟機器人要一條分享連結:

![LINE 上取得知識條目的分享連結](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/kb-driven-dev-flow-share-link.jpg)

連結 24 小時有效,沒有帳號的人也能直接開。客戶看到的是同一份 kb-210:上面是規格,下面是完成報告和驗收方式。不用另外整理簡報,因為知識庫本身就是交付物。

## 這套架構其實很小

整個流程拆開來只有三個元件:一個放 markdown 的知識庫、一個能讀寫它的 CLI、一個會用 CLI 的 AI agent。封面那張架構圖畫的就是這件事。

我們公司這套叫 CTOS,但這個模式不綁任何特定產品。知識庫可以是一個 git repo 裡的 markdown 資料夾,CLI 可以是一支百來行的 Python 腳本,agent 用 Claude Code 或別家的都行。

kb-210 從知識庫匯出來就真的是一個 `.md` 檔,YAML frontmatter 加內文:

```markdown
---
id: kb-210
title: QC Station 開發規格(Demo 用)
type: note
category: technical
scope: personal
owner: yazelin
tags:
  topics: [qc-station, 開發規格, demo]
created_at: '2026-07-09'
updated_at: '2026-07-09'
---

# QC Station 開發規格

## 專案概述
QC Station 是品質檢驗工作站系統,整合相機拍照、條碼掃描、檢驗流程自動化。

(……規格與 API 端點略……)

## 開發完成報告(2026-07-09)

| 項目 | 說明 | 狀態 |
|------|------|------|
| VISOR 工業相機整合 | 透過 TCP 觸發拍照,影像直接進系統歸檔 | 完成,實機驗證 |
| 即時預覽提速 | kiosk 即時畫面由 2fps 提升至 10fps | 完成 |
| ……(共六項)| | |

### 驗收方式
1. 開啟設定頁 /settings,切換錄影 profile,確認自動重啟後生效
2. 觸發 VISOR 拍照,確認影像正確歸檔
```

上半是人開的規格,下半是 AI 回寫的報告,同一個檔案。這就是「單一事實來源」的具體長相:一個可以進 git、可以 diff、可以搜尋的純文字檔。重點只有一個:**AI 的輸入跟輸出都要經過同一個有版本、可分享的地方,不要讓報告死在對話視窗裡。**

也講一下刻意不做什麼。沒有做自動觸發,沒有 webhook,沒有接 CI,AI 不會自己監聽知識庫然後擅自開工。每一步都是人下指令,人決定什麼時候讀、什麼時候寫、什麼時候分享。先把「人拍板、AI 執行」的迴圈跑順,自動化是之後的事,而且說真的,不一定需要。

## 分工線

照慣例把話講清楚:demo 的流程設計、知識庫該長什麼樣、報告要給客戶看什麼、每一個「要不要做」是我定的;指令操作、報告撰寫、回寫知識庫是 AI(Claude Code)做的,連這篇文章的初稿也是,我負責改到像我說的話。

下一步是把這個流程接上真的客戶需求跑一輪:現場收需求、AI 真的開發、報告真的回寫。到時候再寫一篇後續。
