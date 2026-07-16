---
layout: post
title: "mori-sprite-studio:給角色一個可見的身體"
subtitle: "從一張角色 ref 圖，自動生 8 個 state 的 1024×1024 sprite 動畫包 — Mori 的「身體工廠」，也適合任何想給角色可見形態的人"
date: 2026-05-23
categories: [AI, forest-guild]
tags: [mori-sprite-studio, Mori, Sprite Animation, AI Image Generation, Character Pack, Vercel, Vite, React, TypeScript, codex-image-service, OpenAI gpt-image, Vercel KV, FastAPI Pairing, forest-guild]
author: Yaze Lin
---

![mori-sprite-studio cover](https://mori-sprite-studio.vercel.app/og-image.png)

> **🔗 快速連結**
> - 🌐 **直接玩**:[mori-sprite-studio.vercel.app](https://mori-sprite-studio.vercel.app)(預設免設定可用)
> - 💻 **GitHub**:[yazelin/mori-sprite-studio](https://github.com/yazelin/mori-sprite-studio)
> - 📚 **完整介紹頁**:[yazelin.github.io/mori-sprite-studio](https://yazelin.github.io/mori-sprite-studio/)([繁中](https://yazelin.github.io/mori-sprite-studio/index.zh-TW.html))
> - 🤝 **姐妹專案**:[codex-image-service]({% post_url 2026-05-20-codex-image-service %})(可串接，用自己 ChatGPT 訂閱額度跑)
> - 🌳 **Mori 桌面身體**:[mori-desktop](https://github.com/yazelin/mori-desktop)(這個 studio 做的就是給 mori-desktop 吃的角色包)

---

## 這個工具做什麼

給它**一張角色 ref 圖**，它生出**完整 8 個 state 的 sprite 動畫包**:

| 必要 6 個 | 可選 2 個 |
|---|---|
| idle(站著)/ sleeping(睡)/ recording(在聽)/ thinking(思考)/ done(完成歡呼)/ error(出包慌張) | walking(走路)/ dragging(被滑鼠拎起來)|

每個 state 都是 1024×1024 的 4×4 sprite sheet(16 frame row-major)。打包成 `.moripack.zip` 餵給 [mori-desktop](https://github.com/yazelin/mori-desktop) 的浮動視窗播放，**Mori 就有可見的身體**。

當然也可以單獨匯出 APNG / GIF / WebM，做 LINE 動態貼圖、Discord、OBS overlay 都行。

## 為什麼做

[Mori](https://github.com/yazelin/mori-desktop) 是我自己的 Jarvis-style AI 夥伴，住在桌面上。她需要可見的身體 — 不同情境下要有不同表情(在聽我說話 vs 思考中 vs 報錯時驚慌)，不是一張靜態 PNG 能搞定的。

一開始先求有 — bundled 的 sprite 是用 nanobanana 從一張 ref 圖直出的 256×256 PNG,**靜態**。後來把 sprite pipeline 升上 4×4(`steps(4)` + `background-size: 400% 400%`、`character-pack.md` v1.0 spec、1024×1024 sheet 規劃)— 架構先到位，內容還是塞靜態複製。

這個 studio 就是把最後一塊補上：**一張 ref 圖丟進去，30 分鐘出整套真正會動的 4×4 sheet**(視 AI provider + 多少 reroll)。不用會畫畫，有美感修正 / 對齊 / 手動 cell 排序的工具，但不是必須。

## 怎麼用

### 最快路徑(60 秒看完整範例)

1. 開 [mori-sprite-studio.vercel.app](https://mori-sprite-studio.vercel.app)
2. 點「✦ 載入 Mori 預設範本」(會跳確認對話框，接受)
3. 看 sidebar 8 個 state 全部就位、桌面預覽看完整角色 — 我用這個工具做出的 Mori 就在裡面

### 完整流程

1. **上傳角色 ref** — 任何 PNG / JPG，任何背景都行
2. **生 6 個靜態** — 一次 AI call 出 3×2 grid，自動切成 6 個 state pose
3. **每 state 生動畫**(必要 6 個)— pre-tile + 多 anchor identity ref，鎖住角色位置只加微擾(眨眼 / 呼吸 / 小手勢)
4. **可選 walking + dragging** — 走獨立 W/Dr pipeline(不 pre-tile，因為步行循環需要每格 pose 都不同)
5. **手動細調** — 反向順序、換位模式、跨 state normalize、scale / offset sliders、單格重生
6. **匯出 .moripack.zip** — 拖進 mori-desktop characters 資料夾，重啟，角色就動起來了

## 三個技術重點

### 1. C template vs W/Dr template:idle 系列 vs 循環運動系列要分開

最直覺的做法是「一個 template 處理所有 state 的動畫」。試了一輪發現**這不可行**:

- **Idle / sleeping / done / error 等情緒類**:整體 pose 不變，只在 16 cell 內加 1-3 px 的微擾(眨眼 / 呼吸 / 表情漸進)。對 AI 來說最穩定的做法是：**先把 static 複製 16 份鋪成 4×4 placeholder grid，當 reference 餵給 AI**。AI 看到 16 張一模一樣的圖，只需要在每格 paint 細微變化。位置 / 大小 / outfit 全鎖。
- **Walking / dragging 循環運動**:每格 pose 都要明顯不同(腿前後交替、手 counter-swing、body bob)。如果還塞 16 張 placeholder,AI 會被「16 張一樣」綁住，只敢做微擾 — 結果是「站著抖動」，不是走路。

所以這 2 個 state 走**獨立 W / Dr template + 不 pre-tile**，只給 character ref + 其他 state 的 staticBase 當 identity anchor。AI 從零設計 16 frame 的 gait / swing cycle,template 內含明確的「cell 1 = 左腳前、cell 7 = 右腳前」結構引導。

### 2. AI image model 對連續 motion 有 fundamental 限制

Gemini / DALL-E / gpt-image 這類 image generation model 訓練資料是**單張靜態圖**，不是時間序列。當我們塞 4×4 grid 給它，它把整張 1024×1024 當「一張 16 mini-pictures 的拼接」看，不知道 cell 順序代表時間軸。

寫「Frame 1 左腳前、Frame 7 右腳前」這種 step-by-step,**AI 不會精準照做**。它畫得出單張的「左腳前」「右腳前」，但 4×4 grid 內的 16 frame 是否 form a coherent gait cycle — 這超出它的訓練分布。

實作上的妥協：
- **identity 鎖比 pose progression 重要** — 寧可 16 cell 都「同一個 Mori 略有不同 pose」，不要「16 cell 看起來像 4 個不同角色」
- **手動 cell 排序工具補上 AI 的弱點** — 反向 16 cells 一鍵、換位模式 click 兩 cell 對換，讓 user 在 AI 給的素材上手動排成正確 gait

### 3. 跟 codex-image-service 的串接

預設 provider 是 **Author Fallback**(我自掏腰包跑的 server,per-IP 50 次/day,Vercel KV 持久化計數)。新 user 不用任何設定可以直接玩。

但長期用 Author Fallback 我會破產 😅。所以有 **Codex-Image provider** — 串接[上篇文](({% post_url 2026-05-20-codex-image-service %})) 介紹的 [codex-image-service](https://github.com/yazelin/codex-image-service)，讓 user 用自己的 ChatGPT Plus / Pro 訂閱額度跑生圖。

| 路徑 | 何時用 |
|---|---|
| Author Fallback(預設)| 嚐鮮 / 偶爾用 / 不想設定 |
| 自架 Codex-Image-Service | 有 ChatGPT Plus + 想無限用 |
| 兩個都自架 | 全離線、全掌控 |

整合 codex-image-service 過程中順手送了兩個 PR 回 upstream(都已 merged):
- **PR #3**:拿掉 4-image cap(反正 OpenAI 真實 API 接受 ~16 張，client cap 沒意義)
- **PR #4**:prompt 字數 cap 從 8000 → 32000(我的 W template 加 chroma suffix 累積 ~10000 chars,8000 卡住)

Self-hosters 也 nginx 那邊加 CORS header 反射 origin，所以從 web app 跨 origin 呼叫沒問題。

## 跟 forest-guild 宇宙的位置

這是 [Mori](https://github.com/yazelin/mori-desktop) 宇宙的第 N 個側翼：

```
召喚師 ──┐
         │  (生產者)
         ▼
mori-sprite-studio  ──→  Mori 的可見身體
         │
         ▼
mori-desktop  ──→  Mori 的桌面實體(Rust + Tauri 2)
         │
         ▼
（耳 Whisper · 腦 LLM · 你是同伴）
```

跟其他姐妹專案的關係：
- [mori-desktop](https://github.com/yazelin/mori-desktop):**消費端** — 吃我這邊匯出的 `.moripack.zip`
- [codex-image-service]({% post_url 2026-05-20-codex-image-service %}):**底層 AI 服務** — 可選 provider，用 ChatGPT 訂閱跑 gpt-image-2
- [codex-imagegen-skill]({% post_url 2026-05-19-claude-codex-imagegen %}):同樣是 Codex `$imagegen` 系列，但是 CLI / Claude Code 工作流
- [world-tree](https://github.com/yazelin/world-tree):**Mori 的源頭** — 世界樹，Mori 來自的地方(lore 層)

## 接下來

- 用更適合 sprite animation 的 model(Stable Diffusion + AnimateDiff / specialized sprite 模型?)— 解 idle 之外的 motion 品質瓶頸
- 給 mori-desktop 寫 Import UI(目前 user 要手動 unzip `.moripack` 到 `~/.mori/characters/`，自動化一下)
- 開放 community 上傳角色包到「公共 gallery」(可能，看流量)

歡迎試玩，有 bug 開 issue，有趣的角色包貼給我看 🌿

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
> 自掏腰包跑 Author Fallback 的 quota 真的會撐爆，每杯咖啡都會直接灌進去。
