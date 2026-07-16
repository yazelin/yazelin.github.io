---
layout: post
title: "從一張赤壁,到一台戰場引擎 —— 換一份資料就換一場戰役"
subtitle: "用一段 prompt 做完赤壁 3D 戰場後,把裡面的地形、單位、分鏡、特效抽出來,變成一台引擎:一場戰役 = 一份 JSON 資料,引擎只負責演出,AI 編資料、機器把關、人驗收。目前 6 場,從官渡的陸戰到水淹七軍的水攻,還跨出三國,到楚漢垓下、秦晉淝水。"
date: 2026-06-24
categories: [AI, 實驗]
tags: [battlefield-editor, 3D, WebGL, 歷史戰場, 資料驅動, AI, 甲方思維, 三國]
author: Yaze Lin
---

![AI 戰場編輯器:赤壁、官渡、楚漢、秦晉](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-24-battlefield-editor.png)

> **這篇講的專案**
> - 線上戰役列表:<https://yazelin.github.io/battlefield-editor/> — 點任一場進去看 3D 演出
> - 原始碼:<https://github.com/yazelin/battlefield-editor>

之前用一段中文需求做了一個單一 HTML 的[赤壁之戰 3D 戰場]({% post_url 2026-06-11-red-cliffs-3d %}),後來又[加上配樂與旁白]({% post_url 2026-06-13-red-cliffs-audio %})。做完赤壁,下一步我沒有打算再手刻一個官渡。比較划算的做法是:把赤壁裡那些東西——地形、軍隊、分鏡、運鏡、火攻特效——抽出來變成一台引擎,然後**換一份資料就換一場戰役,引擎一行不改**。

這就是 battlefield-editor。

## 一場戰役 = 一份資料 package

核心契約只有一句:**一場戰役是一份 JSON package,引擎只負責「載入 + 演出」。** 一份 package 把一場戰役拆成幾層資料——陣營、地形、建築、單位、分鏡(每一幕誰在哪、往哪移動、發生什麼事)、音訊。引擎讀這份資料,把 3D 場景、運鏡、字幕、音效全演出來。

所以「再加一場官渡」不是改程式,是寫一份新的 `packages/guandu/battlefield.json`。線上的戰役列表也是讀 `packages/` 自動產生的:

```
play.html?pkg=packages/guandu/battlefield.json   # 換這個參數就換一場戰役
```

特效也走同一個邏輯。像水攻,package 只宣告「第幾幕、淹哪一塊」,真正的水面動畫由引擎的 `flood` 處理:水位上升或退去、船隻隨水浮、可以用一個橢圓 region 只淹該區而其他水面不漲,再配一個決堤口讓水鋒從缺口推進、漫過城牆。package 不碰這些細節,只說「何時、對誰」。

## AI 編資料,機器把關,人只判機器判不了的

package 是資料,資料正適合發包給 AI 編。但「AI 編的資料能不能演出」要有人/有東西把關,不然交出來一堆壞引用、空鏡頭。

所以這套的分工是:**AI 編資料,機器跑四道 gate,我只判機器判不了的那幾件。** 四道 gate 都是零依賴的小腳本:

- `validate-data` —— schema 合法、跨檔引用都對得上、鏡頭/音訊 cue 參數齊全。
- `residue-scan` —— 沒有從赤壁範本複製來的殘留、placeholder 都換掉了。
- `render-check` —— headless 載入、逐幕截圖、0 console error。
- `audio-check` —— 旁白音長不超過幕長、音訊素材都解析得到。

SKILL 的金律是「任一關紅,AI 自己 loop 修,不交人」。等四關都綠,才輪到我看——而我要判的,是機器判不出來的三件事:**位置合不合理、鏡頭有沒有框到重點、好不好看好不好聽,還有史實對不對。** 客觀的交給機器,主觀的留給人。

這套 SOP 經得起一個極端測試:垓下和淝水這兩場,是**零 context 的 agent 照著 SKILL、從 scaffold 自己編出來的**——我只在最後驗收。過程中它還踩到一個 `residue-scan` 的誤判(把跨戰役共用的地名當成赤壁殘留),自己修掉。

## 目前 6 場:陸戰、水攻、三國以外

| 戰役 | 類型 | 幕 | 看點 |
|---|---|---|---|
| 赤壁之戰 | 水戰 | 9 | 火攻、鐵索連環(含旁白/配樂/音效) |
| 官渡之戰(200) | 陸戰 | 8 | 含渡口的對峙與奇襲 |
| 垓下之戰 | 包圍/追擊 | 8 | 四面楚歌・霸王別姬・烏江自刎 |
| 淝水之戰(383) | 追擊 | 8 | 風聲鶴唳、草木皆兵 |
| 水淹七軍(219) | 水攻 | 7 | 樓船乘洪、龐德射額決戰、徐晃解圍 |
| 水淹下邳(198) | 水攻 | 6 | 曹操引沂泗灌城、呂布白門樓殞命 |

兩件我自己蠻在意的:一是它**跨出了三國**——垓下是楚漢相爭、淝水是東晉對前秦,同一台引擎都演得了;二是**水攻**從赤壁的水戰,延伸到水淹七軍、水淹下邳那種「決堤灌城」,水鋒推進、城被慢慢淹掉的演出,是同一個 `flood` 機制做出來的。下邳那場的地形我還特地對著《三國志11》的大地圖擺——泗水西來是主河、沂水北支在城西南匯流,城在東岸,不是孤島。

## 加一場新戰役

流程很固定:`tools/new-package.mjs` scaffold 出一個最小綠燈骨架(連旁白範本都備好)→ 把它交給 AI 照 SKILL 編內容 → 跑四道 gate、紅了它自己修 → 綠了我驗收。引擎完全不用動。

## 收尾

[之前那篇講 AI 整晚自己加城市]({% post_url 2026-06-19-ai-overnight-loop %})時提過,battlefield-editor 跟 Roll Formosa 的 autopilot 是同一個哲學的兩種粒度:都是「AI 做事、機器 gate 把關、人只驗收」。差別是 Roll Formosa 包成了整晚無人值守的 driver,battlefield-editor 還是一場一場、在一次 session 內過 gate 交人。

但對我來說,這台引擎最值得記的不是它演得多炫,而是**「一場戰役 = 一份資料」這個拆法**:一旦戰役變成資料、驗收變成機器能跑的 gate,「再加一場」就從「再寫一個程式」降級成「再編一份 JSON」——而編 JSON 這件事,正好可以交給 AI。

## 參考

- battlefield-editor:<https://github.com/yazelin/battlefield-editor>
- 線上戰役列表:<https://yazelin.github.io/battlefield-editor/>
- 這台引擎的起點:[一段 prompt,讓 AI 做出 3D 互動的赤壁之戰]({% post_url 2026-06-11-red-cliffs-3d %})
