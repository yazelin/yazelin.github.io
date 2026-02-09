---
layout: post
title: "打火解油出任務 - Unity + Kinect 大型活動體感遊戲"
subtitle: "愛之味活動現場：讓民眾用身體玩遊戲，掃 QRCode 下載遊玩照片"
tags: [專案, Unity, Kinect, 互動遊戲]
date: 2015-08-20
categories: [專案, Unity, 互動遊戲]
---

## 專案簡介

這是為**愛之味**開發的大型活動現場體感互動遊戲，總共在 3 個地點舉辦（夜市 × 2、夢時代商場），吸引了大量民眾排隊體驗。

**這個專案包含兩款遊戲：**

| 版本 | 操作方式 | 玩法 |
|------|---------|------|
| **全身版** | 玩家全身跑來跑去 | 接住掉落的物品得分 |
| **半身版** | 玩家用手控制（腳不動） | 噴水滅火，時間內滅完火 |

兩款遊戲都支援：
- 遊戲過程中 Kinect 自動拍照
- 遊戲結束生成 QRCode，掃碼下載遊玩照片

**技術棧：** Unity + Kinect SDK + C# + NGUI

### 遊戲畫面

**全身版（接東西）：**

![全身版 - 左右移動消滅垃圾食物](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/images-kinect-dagfire-fullbody-playing.jpg)
![全身版 - 接分解茶加 5000 分](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/images-kinect-dagfire-fullbody-tea.jpg)

**半身版（噴水滅火）：**

![半身版 - 消滅漢堡得分](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/images-kinect-dagfire-halfbody-playing.jpg)

---

## 🎮 遊戲玩法（全身版）

### 操作方式
- **左右移動**：Kinect 擷取玩家身體位置，映射到螢幕中的角色
- **接物品**：控制角色接住掉落的物品
- **計分機制**：不同物品有不同分數，有些會扣血

### 遊戲流程
1. 玩家站到 Kinect 前方
2. 遊戲開始，物品從天而降
3. 玩家左右移動身體來控制角色接物品
4. 遊戲過程中 Kinect 持續拍照（第 10、35、40 秒各拍一張）
5. 遊戲結束，螢幕顯示得分與 QRCode
6. 玩家用手機掃描 QRCode 下載照片

![全身版 - QRCode 下載](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/images-kinect-dagfire-fullbody-qrcode.jpg)

### 遊戲機制

**物品與計分：**

| 物品類型 | 效果 |
|---------|------|
| **分解茶**（特殊物品） | +5,000 分、回復 1 格血量 |
| **其他 6 種物品** | 各 +1,000 分 |
| **沒接到的物品** | 扣 1 格血量 |

**血量系統：**
- 初始血量：10 格
- 接到分解茶：+1 格（最多 10 格）
- 沒接到物品：-1 格
- 血量歸零：遊戲提前結束

**波次機制：**

遊戲時間 50 秒，物品分波次掉落，越後面越多：

| 時間點 | 物品數量 |
|--------|---------|
| 第 0 秒 | 10 個 |
| 第 10 秒 | 20 個 |
| 第 20 秒 | 30 個 |
| 第 30 秒 | 40 個 |

---

## 💡 技術亮點

### 1. Kinect 身體追蹤

**技術挑戰：**
- Kinect SDK 擷取玩家骨架位置（使用脊椎基座 Joint 作為中心點）
- 將 Kinect 座標空間（約 -1.5m ~ +1.5m）映射到 Unity 遊戲世界座標
- 需要平滑處理避免抖動（使用線性插值 Lerp）
- 只追蹤第一個進入偵測範圍的玩家，避免多人干擾

**座標映射：**
- Kinect 擷取範圍：約 -1.5m ~ +1.5m
- 遊戲螢幕範圍：Unity 世界座標
- 線性映射與平滑處理

---

### 2. 即時拍照功能

**技術實作：**
- 使用 Kinect Color Camera 在遊戲過程中持續拍照
- 將 Kinect 的 ColorFrame 轉換為 Unity 的 Texture2D
- 照片加上時間戳記儲存（格式：`player_yyyyMMddHHmmss.jpg`）

**照片管理：**
- 每場遊戲拍攝多張照片
- 遊戲結束後打包成相簿
- 上傳到伺服器供下載

---

### 3. QRCode 生成與照片下載

**流程設計：**
```
遊戲結束 → 生成唯一 ID → 照片上傳伺服器 → 生成 QRCode URL → 顯示在螢幕上
              ↓
玩家掃描 QRCode → 手機開啟下載頁面 → 下載照片
```

**技術重點：**
- 使用 ZXing 或類似函式庫生成 QRCode
- 每場遊戲生成唯一的下載連結
- QRCode 顯示在遊戲結束畫面，方便玩家掃描

---

### 4. 程式碼架構

**Event-driven 設計：**

使用 `GameEventManager` 統一管理遊戲事件，各模組透過訂閱事件來響應：

```csharp
// 訂閱事件
GameEventManager.OnStart += OnStart;
GameEventManager.OnTimesup += OnTimesup;
GameEventManager.OnResult += OnResult;

// 觸發事件
GameEventManager.EventTrigger(GameData.GameStatus.START);
```

**狀態機設計：**

遊戲流程透過狀態機管理，確保流程清晰：

```
INIT → READY → START → PLAY → TIMESUP → RESULT → OVER → QRCODE → RELOAD
  ↑                                                                  |
  └──────────────────────────────────────────────────────────────────┘
```

**模組分工：**

| 模組 | 職責 |
|------|------|
| `GameController` | 管理遊戲流程與畫面切換 |
| `GameEventManager` | 統一管理事件訂閱與觸發 |
| `ItemsManager` | 管理物品生成與波次 |
| `ScoreManager` | 計分邏輯 |
| `LifeManager` | 血量管理 |
| `TimerManager` | 計時器 |
| `EffectManager` | 特效管理 |

---

## 🎪 活動現場經驗

![現場小朋友開心遊玩](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/images-kinect-dagfire-scene-kids.jpg)

### 3 場活動地點

**夜市 × 2**
- 環境：戶外、人潮多、噪音大
- 挑戰：光線變化、空間限制
- 反應：民眾排隊體驗，很多小朋友玩得很開心

**夢時代商場**
- 環境：室內、空間較大、光線穩定
- 設備：大螢幕、音響系統
- 反應：購物民眾駐足觀看，家長帶小孩排隊玩

### 現場挑戰與解決方案

**挑戰 1：光線影響 Kinect 追蹤**
- 戶外夜市的照明不穩定，直射光源會干擾 Kinect 深度感測
- 解決：調整 Kinect 擺放位置，避開直射光源

**挑戰 2：玩家不熟悉操作**
- 很多民眾第一次玩體感遊戲，不知道要怎麼動
- 解決：加入引導動畫、現場工作人員示範

**挑戰 3：網路不穩定**
- 照片上傳有時會失敗（特別是夜市的網路環境）
- 解決：本地快取 + 失敗重試機制

**挑戰 4：QRCode 掃描問題**
- 有些玩家不知道怎麼掃 QRCode
- 解決：現場工作人員協助、提供操作說明

---

## 📹 影片展示

### 開發測試影片
記錄開發過程中的測試與調整：

<iframe width="560" height="315" src="https://www.youtube.com/embed/qY8CB4AHqeI" frameborder="0" allowfullscreen></iframe>

[開發測試影片](https://www.youtube.com/watch?v=qY8CB4AHqeI)

---

### 夜市現場影片
實際活動現場的玩家體驗：

<iframe width="560" height="315" src="https://www.youtube.com/embed/I7zOh2X_u3I" frameborder="0" allowfullscreen></iframe>

[夜市現場影片](https://www.youtube.com/watch?v=I7zOh2X_u3I)

---

### 夢時代現場影片
商場內的活動場景：

<iframe width="560" height="315" src="https://www.youtube.com/embed/tIt3m1miDUw" frameborder="0" allowfullscreen></iframe>

[夢時代現場影片](https://www.youtube.com/watch?v=tIt3m1miDUw)

---

## 🎯 專案成果

### 技術成果
- ✅ **穩定的 Kinect 追蹤**：即使在光線變化的環境下也能正常運作
- ✅ **流暢的遊戲體驗**：60 FPS 更新率，即時反應玩家動作
- ✅ **完整的照片流程**：從拍攝、上傳、QRCode 生成到下載

### 活動成果
- ✅ **3 場活動成功舉辦**：夜市 × 2、夢時代商場
- ✅ **大量民眾參與**：每場都有很多人排隊體驗
- ✅ **正面反饋**：玩家覺得很新奇、很好玩

### 經驗收穫
- ✅ **現場執行經驗**：從開發到實際活動，處理各種現場狀況
- ✅ **使用者體驗設計**：如何讓不熟悉體感遊戲的民眾也能快速上手
- ✅ **系統穩定性**：在不同環境下確保系統正常運作

---

## 🎨 設計考量

### 使用者體驗

**簡單直覺的操作：**
- 只需要左右移動，沒有複雜的手勢
- 適合所有年齡層，連小朋友都能輕鬆上手

**即時回饋：**
- 接到物品立即顯示得分
- 角色動作即時反應玩家移動
- 視覺與音效雙重回饋

**社交分享：**
- QRCode 下載照片讓玩家可以分享到社群媒體
- 現場大螢幕讓圍觀者也能參與

---

### 技術穩定性

**容錯機制：**
- Kinect 追蹤失敗時的備援方案
- 網路上傳失敗的重試機制
- 本地快取確保資料不遺失

**效能優化：**
- 物品數量控制（避免 lag）
- 記憶體管理（及時銷毀不用的物件）
- 60 FPS 穩定更新

---

## 🏆 專案總結

「打火解油出任務」是一個成功的 B2C 互動專案，從技術開發到現場執行都累積了寶貴經驗：

### 技術層面
- **Kinect 應用**：身體追蹤、即時拍照
- **Unity 遊戲開發**：物理系統、碰撞檢測、UI 設計
- **系統整合**：照片上傳、QRCode 生成、網頁下載

### 專案管理
- **現場執行**：處理各種突發狀況
- **使用者導向**：設計讓一般民眾都能輕鬆上手的體驗
- **跨團隊協作**：與活動主辦方、現場工作人員配合

### 經驗收穫
從這個專案學到：**技術要服務於體驗，再酷的技術如果使用者不會用也沒意義**。因此在開發時就要考慮到：
- 操作夠不夠簡單？
- 反饋夠不夠明確？
- 失敗時怎麼辦？
- 現場環境的變數有哪些？

這些經驗也影響了我後續的專案開發，讓我更注重使用者體驗和系統穩定性。

---

## 📚 相關資源

### 活動資訊

**活動地點：**
- **第一站**：逢甲夜市（台中）
- **第二站**：輔大花園觀光夜市（新莊）
- **第三站**：夢時代商場（高雄）

**官方資訊：**
- [愛之味「苦瓜超人打火解油出任務」活動公告 - Facebook](https://www.facebook.com/agv.tw/posts/904389026281022/)

**影片記錄：**
- [開發測試影片](https://www.youtube.com/watch?v=qY8CB4AHqeI)
- [夜市現場影片](https://www.youtube.com/watch?v=I7zOh2X_u3I)
- [夢時代現場影片](https://www.youtube.com/watch?v=tIt3m1miDUw)

---

**專案資訊**
- **客戶**：愛之味
- **專案名稱**：打火解油出任務（苦瓜超人主題）
- **技術棧**：Unity + Kinect SDK + C#
- **活動地點**：逢甲夜市、輔大花園夜市、夢時代商場
- **活動時間**：2015 年
- **專案類型**：大型活動體感互動遊戲

---

Happy Coding! 🎮
