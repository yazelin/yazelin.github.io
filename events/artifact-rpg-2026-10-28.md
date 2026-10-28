---
replay: "1028"
layout: event
title: 多 AI Agent 綜合應用：在 Larch 製作 RPG 遊戲的幕後經驗分享
subtitle: 《仙泉．香布纏．續》十七天，怎麼讓 AI 做頁面給我按、怎麼把活分給好幾個 AI。講義與確認頁起手檔帶回去用。
permalink: /events/artifact-rpg-2026-10-28/
event_batch: artifact-rpg-2026-10-28
event_date: "2026-10-28"
event_datetime: 2026 年 10 月 28 日（週三）20:00
event_duration: 90 分鐘內
event_location: 線上（Google Meet：https://meet.google.com/hex-gsvc-uyt）
event_price: 免費
cover: /images/events/og-artifact-rpg-2026-10-28.jpg
event_access: 已結束。錄影分段、簡報、講義、逐字稿與確認頁起手檔開放取用
event_closed: true
form_closed_heading: 這場不用報名
event_materials_url: https://drive.google.com/drive/folders/1KUPHCMtOUV92odUsKKm339dFngoB9ZBG
form_closed_message: 這場已經結束。錄影（切成 11 段，共約 161 分鐘）、簡報 PDF、講義、逐字稿與確認頁起手檔都放在雲端資料夾，免費，不用留資料。
event_community_url: https://line.me/ti/g2/xshYqZH3DLsqO8XNipmG3abL_KM6DORU7da5Lw?utm_source=invitation&utm_medium=link_copy&utm_campaign=artifact-rpg-2026-10-28
share-description: 10/28 多 AI Agent 綜合應用已結束，錄影、簡報、講義與逐字稿開放取用。在 Larch 做 RPG 時用 Artifact 確認頁跟 AI 溝通，以及 Claude、codex 與其他 AI 怎麼分工。
---

> **這場已經結束。**錄影、簡報、講義、逐字稿與確認頁起手檔都在[雲端資料夾](https://drive.google.com/drive/folders/1KUPHCMtOUV92odUsKKm339dFngoB9ZBG)，免費，不用留資料。
>
> 錄影切成 11 段可以單獨看，共約 161 分鐘：開場與確認頁、舊續的地圖總覽與走路圖、新續的地點表與連結圖、遮擋與去背、建城工法與屋內配置、跟 AI 協作的習慣、最後四天的多 AI 分工、驗收與審稿、AI 生圖要查證、codex-images 產能與撞牆、起手檔與 Larch Pro 試用。
>
> 講義會後補了第十二節「現場補充」：沒有 Artifact 的做法、地圖總覽怎麼改位置、屋內色塊與斜線、版本號、為什麼重建、三台電腦怎麼分、agy 為什麼很快用完、SSH 免密碼、AI 生圖要查證等。

《仙泉．香布纏．續》是一部 RPG，從 10/5 開案到 10/24 收件，程式、產圖、量測與測試都是 AI 做的，我定方向、看圖、試玩。這場分享做的過程中，我跟 AI 之間怎麼交換資訊。

## 這場講了什麼

- **確認頁**：AI 把要我看的圖與選項做成網頁，我直接按「可以」或「要重產」、寫備註，回覆存下來給 AI 讀回去。用 Artifact，也可以只用本機網頁加文字檔。
- **地圖的幾個實例**：連結圖、地圖總覽、事件點與路人路徑、遮擋（人走到樹後、屋後怎麼被蓋住）、建城牆、軍營與門、屋內、角色走路圖。
- **多 AI 分工**：Claude 統籌，codex 改程式與審稿，另一台電腦的 Claude 與 codex，llmshare 做批次雜事，codex-images 產圖與修圖。包括 codex 帳號用到八成換帳號、審台詞的閘門。
- **現場示範**：可以拖人物的遮擋示範頁。
- **帶回去的**：講義，以及一個確認頁起手檔（[線上版](https://yazelin.github.io/confirm-starter/)，也可以存成檔案在本機用）。

## 限制

- 《續》的確認頁是私人 Artifact，現場只示範，不開放操作。
- 起手檔是本機網頁，用瀏覽器開就能用，不需要訂閱；要用 Artifact，需要 Claude 帳號。
- 多 AI 分工用到好幾個付費帳號，講的是我自己的配置與踩過的坑，不要求你照著訂閱。

## 會用到的連結

- [確認頁起手檔（線上版）](https://yazelin.github.io/confirm-starter/)
- [larch-preview](https://github.com/yazelin/larch-preview)・[codex-auth-switcher](https://github.com/yazelin/codex-auth-switcher)・[codex-image-service](https://github.com/yazelin/codex-image-service)
