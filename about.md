---
layout: page
title: About
permalink: /about/
---

## 👋 Hi, I'm Yaze

最近用 AI 開發軟體，像 ChingTech OS 和 jaba-ai 都是這樣做出來的。主要做工業自動化的系統整合——機器人控制、視覺檢測、AGV 車隊管理，讓這些系統在產線上順利協作。也教過幾年大學的機器人課程，做過互動遊戲和展覽。大學時做的是無人飛行船自動導航系統。

工業現場常有預算或空間的限制，像是用軟體取代昂貴的感測器，久了就習慣找不同的解法。

---

## 🎯 做過的專案

### 🖥️ ChingTech OS - 桌面風格的 Web 應用 (2025)

公司同事每天要在 NAS、終端機、AI 工具之間切換很麻煩，市面上也沒有合適的整合方案。想試試用 AI SDD 開發，在只使用 JS 不使用前端框架的條件下，能不能做出視窗管理系統（拖曳、縮放、Snap、多視窗）這種複雜的桌面應用。就做了 **ChingTech OS**，把這些工具整合進來。

**主要功能：**
- **視窗管理**：拖曳、縮放、Snap、多視窗切換
- **系統整合**：SMB 檔案系統、SSH 終端、Claude API、裝置指紋追蹤
- **即時通訊**：WebSocket 實現終端機即時輸出與 AI 對話

[查看完整介紹與展示影片]({% post_url 2025-12-13-ching-tech-os-index %})

---

### 🍱 jaba 呷爸 - 讓 AI 幫忙訂便當 (2025)

團隊訂便當流程很繁瑣（統計餐點、確認金額、追蹤付款）。想試試用 AI SDD 開發 LINE Bot 能做到什麼程度，所以我就用 AI 對話取代傳統的表單填寫，做了 **呷爸 jaba**。

**核心特色：**
- **AI 對話訂餐**：用自然語言說「我要雞腿便當」就能完成訂餐
- **群組點餐 Session**：說「開單」開始、「收單」結束
- **AI 菜單辨識**：上傳菜單圖片，AI 自動辨識品項、價格、特價優惠
- **即時同步**：Socket.IO 即時廣播訂單狀態
- **個人偏好記憶**：1對1 聊天記住稱呼和飲食偏好，群組點餐時自動套用

**專案演進：**
從最初的 JSON 檔案儲存原型，經過 LINE Bot 分離架構的過渡期，最終重寫為 PostgreSQL + Repository Pattern 的生產級系統。

[原型介紹]({% post_url 2025-12-08-jaba %}) | [jaba-ai 技術系列（11 篇）]({% post_url 2025-12-19-jaba-ai-index %}) | [GitHub](https://github.com/yazelin/jaba-ai)

---

### 🔬 AnalyzerUI - 氣體檢測資料採集軟體 (2025)

擎添工業的氣體檢測儀器設定及資料採集記錄軟體。C# 開發，採用 USB License Key 授權。

[產品頁面]({% post_url 2025-01-08-AnalyzerUI %})

---

### 🚗 讓機器人自己走：企業級 AGV 車隊管理 (2025)

接到一個 AGV 車隊管理專案，需要整合我們的 AGV 系統、KUKA 的 AGV 系統、Web 管理介面、OPUI 介面。想利用 ROS2 生態系的資源，就用 ROS2 架構來做，整合成一套完整的模組化系統。

#### RosAGV - 核心控制系統 (2025)

**企業級 AGV 車隊管理系統**，採用雙環境容器化架構：

**核心技術：**
- **ROS 2 Jazzy + Zenoh RMW**：解決跨網段通訊痛點
- **雙環境架構**：車載系統（host 網路）+ 管理系統（bridge 網路）
- **17 個專用工作空間**：模組化設計，功能清楚分離
- **Docker 容器化**：一鍵部署，環境一致性保證

**系統特色：**
- **多車型支援**：Cargo Mover、Loader、Unloader 三種 AGV
- **外部系統整合**：KUKA Fleet 機器人、Keyence PLC
- **工業相機 OCR**：物料辨識與門禁控制，與車載 KUKA 協作手臂協同
- **TAFL WCS 系統**：視覺化工作流程編排
- **Rack 管理**：貨架追蹤、旋轉、對位
- **Web 管理介面**：AGVCUI（管理員）+ OPUI（操作員）
- **統一工具系統**：只需 `r` 一個字母管理所有功能

[詳細技術介紹]({% post_url 2025-12-05-rosagv-fleet-management-system %})

---

#### WebAGV - 即時監控看板 (2025)

**AGV 車隊即時監控看板系統**，獨立於 RosAGV 的資訊展示平台：

**技術架構：**
- **前端**：Vue 3 + Vite + Vuetify 3 + Leaflet 地圖引擎
- **後端**：Node.js + Express + Socket.IO + MQTT + rclnodejs
- **即時通訊**：Socket.IO + MQTT + ROS 2 三重整合

**系統特色：**
- **Leaflet 地圖**：即時顯示 AGV 位置、航向、電池狀態
- **多重通訊**：同時支援 Socket.IO、MQTT、ROS 2 三種協定
- **資訊看板**：任務監控、訊號監控、日誌檢視
- **自定義座標**：40px 網格系統，旋轉 Marker 顯示航向
- **前後端分離**：可獨立部署或整合部署

[詳細技術介紹]({% post_url 2025-04-24-webagv-monitoring-dashboard %})

---

### 👁️ 讓機器看得懂東西 (2023)

客戶想要做多合一的入料、壓測、電測、AOI、包裝機台，問了幾家廠商都做不出來或報價很高。因為我們有 WiseTechVision 的經驗，對 AOI 和手臂整合都很熟，就接了這個案子。

治具的設計也是我們自己加進去的——因為有影像處理的經驗，所以設計成視覺補正快速換線的架構，換線時間從傳統的 2-4 小時縮短到 10-15 分鐘。

**系統架構：**
- **2 台 KUKA 機器人**：LDRobot（上料）+ UDRobot（檢測）
- **3 台 IDS 工業相機**：Eye-in-Hand 配置，自動定位與尺寸檢測
- **4 面 AOI 檢測**：20+ 種 NG 分類，完整品質追溯

**最有成就感的部分：**
- **視覺自動對位**：取代傳統治具，不需精密定位機構
- **抗震驗證**：2024 年花蓮 7.2 級地震後，系統用 AOI 自動校正就能正常運作

[詳細介紹]({% post_url 2023-06-07-ctcui-smd-aoi-system %})

---

### 🤖 自己動手擴充功能 (2020)

客戶的產線上有多個散亂工件需要同時追蹤和抓取，但 KUKA 的 ConveyTech 套件只能追蹤單一工件。要追蹤多個就需要 Queue、List、Stack 這些資料結構來管理，但 KRL（KUKA Robot Language）只有基本陣列。所以我就在 KRL 加入 Queue、Stack、List 功能。

視覺辨識的部分開發了 **WiseTechVision** C# 套件，整合視覺與機器人控制。支援工業相機，也支援消費級 Webcam（用軟體演算法補償，省下不少成本）：
- [積木堆疊](http://forum.wtech.com.tw/viewtopic.php?t=210)
- [魔術方塊堆疊](http://forum.wtech.com.tw/viewtopic.php?t=209)
- [散亂螺絲整列]({% post_url 2020-07-20-wisetech-vision-screw-sorting %})
- [工件追蹤](http://forum.wtech.com.tw/viewtopic.php?t=182)

---

### 💰 不用感測器能做力覺感知嗎？(2017-2020)

KUKA 機器手臂要做力覺感知，標準做法是外掛六軸力覺感測器，一顆 30-80 萬。

當時在想：KUKA 手臂每個關節都有扭力感測器，能不能直接用這些數據來判斷受力方向？例如某幾個軸的扭力變化就能知道是 Z 方向受力，不用真的去算完整的六軸力矩轉換。

所以我就直接用 KRL 監測軸扭力值，20ms 更新率，不用外掛任何感測器。

後來在 4 個專案中驗證都很穩：
- [記憶卡插件]({% post_url 2017-08-09-kuka-force-sensing-memory-card %})：反向插入偵測 100%
- [PCB 來料深度]({% post_url 2020-06-05-kuka-force-sensing-pcb-depth %})：精度 ±0.5mm
- [Tray 盤堆疊]({% post_url 2020-06-18-kuka-force-sensing-tray-stack %})：取代視覺系統
- [散亂螺絲整列]({% post_url 2020-07-20-wisetech-vision-screw-sorting %})：防撞機制

每台機器人省下 30-80 萬，而且當日安裝測試就能投產，沒有額外的感測器維護成本。

[技術總覽]({% post_url 2017-08-09-kuka-force-sensing-without-sensor %})

---

### 🎮 遊戲引擎能做工業應用嗎？(2018)

當時在研究 FK 和 IK，想用 Unity 來做 Robot 模組試試看。因為公司也有在做 KUKA Robot，所以我就參考 KUKA Robot 的架構和 KRL 語言，在 Unity 內設計出 RobotSim 的語言與解釋器，讓使用者可以在 Unity 中模擬手臂運動。

做出來的 **RobotSim** 因為是基於 Unity，天生就跨平台——Windows、macOS、Web、Android、iOS 都能跑，連手機瀏覽器都可以。支援六軸、SCARA、Delta Robot（平行機器人），也能做雙機協同控制。模擬完還能直接匯出 KUKA KRL 程式到實機。

後來發現瀏覽器版本超適合教學——學生不用準備昂貴的實體機器人，在瀏覽器上就能學運動學、FK/IK。就這樣在亞洲大學、實踐大學、嘉南藥理大學的課程中用了好幾年。

[技術詳解]({% post_url 2018-03-01-robotsim-unity-robot-simulation %}) | [線上試玩](http://www.wtech.com.tw/robotsim/demo) | [YouTube Demo](https://www.youtube.com/playlist?list=PLYLTPJkULAAZZuNW2s2tX-KWQOus7sAAo)

---

## 🎮 做過一些有趣的互動遊戲

**[五花果的後花園]({% post_url 2017-01-14-8boo-land-5flowergod %})**（Unity，2017）
- **場景**：高雄「8咘的搞怪樂園」，必應創造/五月天演唱會幕後團隊打造
- **展期**：45 天，橫跨農曆春節
- **玩法**：小朋友著色紙 → 掃描 → 畫作變成 3D 模型在巨型 LED 牆中活起來

類似 teamLab 的互動藝術，技術挑戰是 10 台掃描器並行處理和 45 天長期展期的穩定性。

**[打火解油出任務]({% post_url 2015-08-20-kinect-game-dagfire %})**（Unity + Kinect，2015）
- **場景**：大型活動現場（夜市 × 2、夢時代商場，總共 3 場）
- **玩法**：用 Kinect 擷取玩家動作，操作螢幕中的角色接掉落物品（加分/扣血）
- 遊戲結束產生 QRCode，玩家掃碼就能下載遊玩過程中 Kinect 拍的照片
- 現場很多民眾排隊來玩，體感互動很受歡迎

[YouTube 示範](https://www.youtube.com/watch?v=tIt3m1miDUw)

**雷射槍射擊遊戲**（LabVIEW + Flash/Unity，2014）
- **概念**：用真實紅外線雷射槍玩電腦遊戲
- **技術**：LabVIEW 擷取雷射光點 → 轉換成滑鼠座標 → 操作任何射擊遊戲
- **體驗**：拿著真槍對著螢幕射擊，比用滑鼠有趣多了
- [YouTube 示範](https://www.youtube.com/watch?v=vbZadarVQj4)

---

## 🚁 學生時期：從這裡開始的故事

### 無人飛行船自動導航系統 (2011)

因為學長已經做了地上的自動導航，所以我們做天上飛的。6 人團隊，開發了完整的自動導航控制系統（學士畢業論文）。

**核心突破：**
- **自主飛行**：根據預設 GPS 座標自動導航
- **突破遙控範圍**：GPRS 無線通訊，飛行範圍不受限制
- **即時監控**：Google Maps + Flash 即時顯示飛行狀態

這是第一次做完整的系統整合——嵌入式、通訊、地面站、視覺化全部串起來。後來走上系統整合這條路，可能就是從這裡開始的。

[學士畢業論文詳細技術記錄]({% post_url 2011-06-01-airship-auto-navigation-thesis %}) | [YouTube 影片](https://www.youtube.com/watch?v=YBk6aVB-wwk)

---

## 🎓 教過一些有趣的課

除了工業現場，我也在大學教過一些跨界整合的課程。比較好玩的有：

**實踐大學**（2015-2019）
- [機器手臂程式設計](https://yazelin.github.io/usc2019-RobotSim/)：Unity 開發機器手臂模擬器
- [人機互動技術](https://yazelin.github.io/usc2016hci/)：Unity AR + 雲端相簿（18 週 105 個作業）
- [聯網感測實作](https://yazelin.github.io/usc2017nsp/)：Arduino + MQTT + MySQL 做 IoT 快樂農場
- [創意互動導覽](https://yazelin.github.io/usc2015/)：Vuforia AR 行動導覽 APP

**嘉南藥理大學**（2016-2018）
- [RobotSim 機器人模擬](https://yazelin.github.io/cnu2018-RobotSim/)：從模擬到實機
- [互動科技課程](https://yazelin.github.io/cnu2016/)：Kinect + Unity 體感互動

**亞洲大學**（2020）
- [KUKA 工業機器手臂 3D 模擬](https://yazelin.github.io/asia2020-RobotSim/)：兩個單元快速上手
- [Leap Motion 手勢控制](https://yazelin.github.io/asia2020-RobotLeapMotion/)：用手掌控制工業機器人

**教學成果：** 8 個課程專案、8 個開源教學網站，所有教材都在 [GitHub](https://github.com/yazelin?tab=repositories)

---

## 💡 做著做著就會了

我習慣挑不太會的技術來做專案——想研究 FK/IK 就用 Unity 做機器人模擬（結果工作和教學都用上了）、想試 AI SDD 就拿 jaba 和 ChingTech OS 來試、想整合自家與 KUKA AGV 並利用 ROS2 生態系就拿車隊管理專案來試。也試過一些非典型做法：不用感測器做力覺感知（省下 30-80 萬）、KRL 沒資料結構就自己實作。

---

## 🛠️ 順便會的東西

為了解決這些問題，順便學會了一堆技術：

**工業自動化**
- KUKA Robot：KRL、ConveyTech、WorkVisual、力覺感知
- ROS2：導航、避障、多機協同
- 工業視覺：IDS Camera、OpenCV、Emgu CV
- 工業通訊：Modbus、RS232/485、PLC 整合
- 嵌入式系統：Microchip（無人飛行船自動導航）

**影像處理**
- 傳統 CV：OpenCV / Emgu CV（輪廓、特徵匹配、座標轉換）
- 深度學習：YOLO（目標檢測、實例分割）
- 應用案例：AOI 檢測、魚苗計數

**Web 開發**
- 前端：Vanilla JS、Vue.js
- 後端：FastAPI、C# .NET、Node.js、PHP (FuelPHP)
- 資料庫：PostgreSQL、MySQL
- 系統：Docker、WebSocket

**AI 相關**
- Claude API 整合與應用
- SDD (Openspec) 實驗與開發工具
- AI 輔助開發流程

**其他雜七雜八**
- Unity 3D + C#（遊戲開發、機器人模擬）
- Android（Kotlin APP 開發）
- LabVIEW（影像處理、硬體整合）
- SMB/NAS 整合、SSH 終端
- Flash ActionScript（時代的眼淚）

---

## 📝 寫了一些文章

寫了一些文章當作記錄，也是怕自己忘記，順便分享一下踩過的坑。目前有 **75+ 篇**：

| 系列 | 主題 | 數量 |
|------|------|------|
| **ChingTech OS** | Web 桌面系統、Terminal、AI 整合、安全、SMB/NAS | 26 篇 |
| **Jaba AI** | LINE Bot 點餐系統、AI 整合、Repository Pattern | 11 篇 |
| **基礎工具** | Git、Docker、Linux、uv、DevOps | 6 篇 |
| **ROS2 與機器人** | RosAGV、WebAGV、KUKA、RobotSim | 6 篇 |
| **教學系列** | 大學課程教材（實踐、嘉南、亞洲） | 11 篇 |
| **KUKA 力覺感知** | 記憶卡插件、PCB 深度、Tray 盤堆疊 | 4 篇 |
| **影像處理** | OpenCV、YOLO、CTCUI 視覺檢測 | 3 篇 |
| **其他專案** | 飛行船、互動遊戲 | 5 篇 |

[ChingTech OS 系列]({% post_url 2025-12-13-ching-tech-os-index %}) | [Jaba AI 系列]({% post_url 2025-12-19-jaba-ai-index %}) | [所有文章]({{ site.baseurl }}/)

---

## 🏢 我在...

### 擎添工業（Ching-Tech）｜2024/10 至今
工業 4.0 智慧工廠解決方案、AGV/AMR 系統、機械手臂整合

<img src="{{ site.baseurl }}/images/ching-tech/CTLogo.svg" alt="Ching-Tech" width="24" height="24"> [擎添工業新官網](https://ching-tech.ddns.net) | [舊官網](https://www.ching-tech.com)

---

### 卓智機器人（Wisetech）｜~ 2024/8
產線自動化系統整合（機器人、視覺、中控）、RobotSim、機器人教學

<img src="{{ site.baseurl }}/images/Wisetech-Icon-32.png" alt="Wisetech" width="24" height="24"> [卓智機器人官網](http://www.wtech.com.tw/) | [台灣機器人資訊平台](http://forum.wtech.com.tw/)

---

## 💬 想聊聊嗎？

如果你：
- 也喜歡學新技術、享受成長的感覺
- 對這些專案有興趣，想知道更多細節
- 也在做類似的跨界整合，想交流經驗
- 遇到工業自動化的技術問題，想討論解法
- 有有趣的專案想合作

歡迎來信：📧 [yaze.lin.j303@gmail.com](mailto:yaze.lin.j303@gmail.com)

---

## 🌐 其他地方找我

- [GitHub](https://github.com/yazelin) - 40+ 個專案（工業應用、AGV、視覺檢測、教學專案）
- [YouTube](https://www.youtube.com/@yazelin) - 專案展示影片（RobotSim、互動遊戲、無人飛行船）
- [台灣機器人資訊平台](http://forum.wtech.com.tw/) - 卓智時期的專案與技術文章

---

Happy Coding! 🚀
