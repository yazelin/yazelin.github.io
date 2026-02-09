---
layout: post
title: "RobotSim：Unity 3D 機器手臂模擬系統"
subtitle: "跨平台機器人模擬軟體 - 從運動學到工業應用"
date: 2018-03-01
categories: [KUKA, RobotSim]
tags: [RobotSim, Unity, 機器手臂模擬, KUKA, 運動學]
---

![RobotSim：Unity 3D 機器手臂模擬系統](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2018-03-01-robotsim-unity-robot-simulation.png)

## 前言

**RobotSim** 是我基於 Unity 3D 開發的機器手臂模擬系統（Robot Simulation），主要用於機器手臂自動化專案導入前的產線規劃模擬。

### 開發動機

在工業自動化專案中，傳統方式是先購買昂貴的機器手臂設備，然後在實際場地進行測試與調整。這種方式風險高、成本高，且調整空間有限。

RobotSim 提供了一個**低成本、高彈性的 3D 模擬環境**，讓自動化專案在實際導入前就能進行：
- 工站整體空間配置分析
- 手臂運動路徑驗證（Forward Kinematics & Inverse Kinematics）
- 夾爪設計模擬測試
- 多機器人協同作業模擬
- 整體工站效率評估

這種「先模擬、再實作」的方式，能大幅提高專案執行成功率。

---

## 系統架構

### 核心技術

RobotSim 採用 **Unity 3D** 作為開發平台，利用 Unity 的跨平台特性與 3D 渲染能力，實現高效能的機器人運動模擬。

**主要模組：**

1. **運動學模組 (Kinematic Module)**
   - **SixxRobotKinematic**：六軸機器人運動學（KUKA、ABB、YASKAWA 等）
   - **ScaraRobotKinematic**：SCARA 機器人運動學
   - **PARobotKinematic**：平行機器人運動學（Delta Robot）
   - 支援 Forward Kinematics (FK) 與 Inverse Kinematics (IK)

2. **機器人配置系統 (Robot Config)**
   - 連桿長度參數 (L[10])
   - 軸極限值 (AxisLimits[6])
   - 軸速度與加速度 (AnglePerSec[6], AccAxis[6])
   - TCP 速度與加速度 (VelCp, AccCp)
   - 工作範圍 (Range)
   - Home 位置設定

3. **機器人指令系統 (Robot Commands)**
   - **RobotCommandMotion**：運動指令（PTP、LIN、CIRC）
   - **RobotCommandSpline**：曲線運動指令
   - **RobotCommandGripper**：夾爪控制指令
   - **RobotCommandFlow**：流程控制指令（IF、FOR、WHILE）
   - **RobotCommandCondition**：條件判斷指令
   - **RobotCommandOperator**：運算子指令
   - **RobotCommandSystem**：系統指令
   - **RobotCommandValue**：數值運算指令

4. **Unity 行為腳本 (Behaviour Scripts)**
   - **RobotBehaviour**：機器人運動控制
   - **ProgramBehaviour**：程式執行與流程控制
   - **ControllerBehaviour**：控制器邏輯
   - **RobotLinkBehaviour**：連桿運動
   - **RobotRotLinkBehaviour**：旋轉關節運動
   - **RobotSimSystemBehaviour**：系統核心循環

5. **雙機器人協同模組 (Dual Robot AOI)**
   - **DuoRobotPoint**：雙機器人點位
   - **RobotCommandDuoMotion**：雙機器人同步運動
   - **RobotCommandDuoSpeed**：雙機器人速度控制
   - **RobotCommandDuoTool**：雙機器人工具控制

### 系統設計特點

**單例模式 (Singleton Pattern)：**
- RobotSimSystem 採用單例模式設計
- 確保系統核心只有一個實例
- 多執行緒安全 (Thread-Safe with lock)

**即時更新機制：**
```csharp
// RobotSimSystem.Update() - 每幀更新
- Forward Kinematics 更新所有機器人姿態
- 更新工具 (Tool) 位置
- 更新旋轉關節 (RotLink) 角度
- 更新連桿 (Link) 位置
```

**軸限制檢查：**
- 每次運動前檢查軸角度是否在極限範圍內
- 超出範圍時拒絕運動，保護模擬準確性
- 模擬真實機器人的軸限制行為

---

## 核心功能

### 多品牌機器手臂支援

✅ **KUKA** - KR 系列工業機器人（如 KR3 R540, KR6 R900）
✅ **ABB** - IRB 系列工業機器人
✅ **YASKAWA** - Motoman 系列工業機器人

### 多種運動學類型

✅ **六軸機器人 (Six-Axis Robot)**：最常見的工業機器人類型
✅ **SCARA 機器人**：平面四軸機器人，適用於組裝與取放作業
✅ **平行機器人 (Parallel Robot)**：Delta Robot，適用於高速取放作業

### 跨平台支援

**開發環境：**
- Windows
- macOS

**執行環境（可匯出至）：**
- Windows 桌面應用
- macOS 桌面應用
- Web 瀏覽器（WebGL）
- Android 行動裝置
- iOS 行動裝置

### 程式設計方式

**1. 拖拉式程式設計 (Drag-and-Drop Programming)**
- 視覺化程式介面
- 適合初學者與教學使用
- 快速驗證動作流程
- 支援流程控制（IF、FOR、WHILE）

**2. C# 程式語言 (C# Programming)**
- 完整程式控制能力
- 適合進階應用開發
- 可整合複雜邏輯與演算法
- 直接操作 Unity API

### 運動控制功能

**基本運動指令：**
- **PTP (Point-to-Point)**：點對點運動
- **LIN (Linear)**：直線運動
- **CIRC (Circular)**：圓弧運動
- **Spline**：曲線運動（多點平滑軌跡）

**進階功能：**
- **多機器人同步運動**：可模擬多台機器人協同作業
- **速度與加速度控制**：精確模擬運動時間與軌跡
- **工具坐標系 (Tool Frame)**：支援工具偏移與旋轉
- **基座坐標系 (Base Frame)**：支援基座偏移

### 夾爪與工具控制

- 支援多種夾爪模型
- 夾爪開關控制
- 工具姿態調整
- Tool Flange 連結

---

## 教學應用

RobotSim 已應用於多所大學的機器人課程教學：

### 嘉南藥理大學（2018）

**課程：** 互動科技 - Unity - RobotSim
**內容：** Unity 3D 機器手臂模擬基礎、RobotSim 操作與程式設計
[課程網站](https://yazelin.github.io/cnu2018-RobotSim/) | [GitHub](https://github.com/yazelin/cnu2018-RobotSim)

---

### 實踐大學（2019）

**課程：** 機器手臂程式設計
**內容：** KUKA 機器手臂模擬、路徑規劃、程式設計實作
[課程網站](https://yazelin.github.io/usc2019-RobotSim/) | [GitHub](https://github.com/yazelin/usc2019-RobotSim)

---

### 亞洲大學（2020）

**課程：** 創意設計學院人工智慧工作坊 - KUKA 工業機器手臂 3D 動畫模擬與操作
**內容：** KUKA 機器手臂 3D 模擬、動畫製作、實際操作整合
[課程網站](https://yazelin.github.io/asia2020-RobotSim/) | [GitHub](https://github.com/yazelin/asia2020-RobotSim)

**延伸專案：** Leap Motion 與機器手臂整合
**內容：** 非接觸式手勢控制機器手臂、即時動作追蹤
[專案介紹](http://forum.wtech.com.tw/viewtopic.php?t=232) | [課程網站](https://yazelin.github.io/asia2020-RobotLeapMotion/) | [GitHub](https://github.com/yazelin/asia2020-RobotLeapMotion)

---

## 工業應用展示

RobotSim 也被應用於多個工業自動化專案的模擬規劃：

### 我參與的展示專案

**1. RobotSim 模擬機器手臂團隊同步動作**（2024年7月）
- 多部機器手臂同步動作 3D 模擬
- 協同作業路徑規劃驗證
- 工站整體效率評估
- **模擬技術開發時間：2018年3月**
- [專案介紹](http://forum.wtech.com.tw/viewtopic.php?t=228)

**2. YouTube RobotSim Demo 影片**（2024年2月）
- 完整的 RobotSim 應用展示影片集
- 涵蓋各種工業場景模擬
- [YouTube 播放列表](https://www.youtube.com/playlist?list=PLYLTPJkULAAZZuNW2s2tX-KWQOus7sAAo)
- [論壇專案頁](http://forum.wtech.com.tw/viewtopic.php?t=221)

### 同事使用 RobotSim 的工業應用

RobotSim 被廣泛應用於各種工業場景的模擬驗證：

- [機器手臂開箱自動化](http://forum.wtech.com.tw/viewtopic.php?t=240)（2025年11月）
- [機器手臂拋光研磨](http://forum.wtech.com.tw/viewtopic.php?t=239)（2025年10月）
- [大型貨車水泥包智慧堆棧系統](http://forum.wtech.com.tw/viewtopic.php?t=231)（2025年1月）
- [機器手臂水泥包貨車堆疊 3D模擬](http://forum.wtech.com.tw/viewtopic.php?t=227)（2024年3月）
- [機器手臂水泥包棧板堆棧3D模擬](http://forum.wtech.com.tw/viewtopic.php?t=226)（2024年3月）
- [機器手臂主機板拆卸3D模擬](http://forum.wtech.com.tw/viewtopic.php?t=225)（2024年3月）
- [機器手臂射出成型機脫模取件3D模擬](http://forum.wtech.com.tw/viewtopic.php?t=224)（2024年3月）
- [機器手臂金屬彎板3D模擬](http://forum.wtech.com.tw/viewtopic.php?t=223)（2024年3月）
- [機器手臂車廠輪胎取放3D模擬](http://forum.wtech.com.tw/viewtopic.php?t=222)（2024年3月）

---

## 技術特點

### 運動學精度

**Forward Kinematics (FK)：**
- 根據關節角度計算末端執行器位置
- 即時更新 3D 模型姿態
- 支援多種機器人構型

**Inverse Kinematics (IK)：**
- 根據目標位置計算關節角度
- 多解選擇機制
- 軸限制檢查

### 低成本解決方案

**傳統方案：**
- 需購買實體機器手臂（數十萬至數百萬元）
- 需要實際場地進行測試
- 調整錯誤成本高

**RobotSim 方案：**
- 軟體模擬，無需購買實體設備
- 電腦即可進行模擬測試
- 快速試錯、調整成本低

### 跨平台優勢

- **開發一次，可匯出至多個平台**
- **Web 版本**：方便展示與分享（無需安裝）
- **行動版本**：支援現場展示與客戶簡報
- **桌面版本**：高效能模擬與開發

### 教學友善

- 視覺化介面，降低學習門檻
- 完整的教學課程與教材
- 開源教學網站，方便學習與參考
- 3 所大學實際應用於課程

### 雙機器人協同

- **同步運動控制**：兩台機器人協同作業
- **路徑協調**：避免碰撞與干涉
- **工作區域劃分**：優化作業效率
- **應用場景**：大型工件處理、複雜組裝作業

---

## 技術資源

### 開源教學專案

- [嘉南藥理大學 - cnu2018-RobotSim](https://yazelin.github.io/cnu2018-RobotSim/)
- [實踐大學 - usc2019-RobotSim](https://yazelin.github.io/usc2019-RobotSim/)
- [亞洲大學 - asia2020-RobotSim](https://yazelin.github.io/asia2020-RobotSim/)
- [亞洲大學 - Leap Motion 與機器手臂](https://yazelin.github.io/asia2020-RobotLeapMotion/)

### 論壇專案

- [RobotSim 論壇專區](http://forum.wtech.com.tw/viewforum.php?f=20) - 所有 RobotSim 相關專案
- [RobotSim 功能介紹](http://forum.wtech.com.tw/viewtopic.php?t=220)
- [YouTube Demo 影片集](https://www.youtube.com/playlist?list=PLYLTPJkULAAZZuNW2s2tX-KWQOus7sAAo)

### 相關連結

- [GitHub 教學專案](https://github.com/yazelin?tab=repositories) - 開源教學專案
- [台灣機器人資訊平台](http://forum.wtech.com.tw/) - 更多機器人專案與技術討論
- [卓智機器人官網](http://www.wtech.com.tw/) - RobotSim 開發與技術支援單位

---

## 結語

**RobotSim** 提供了一個從運動學模擬到工業應用的完整機器手臂模擬解決方案。

### 核心價值

1. **精確的運動學模擬**
   - Forward Kinematics (FK) 與 Inverse Kinematics (IK)
   - 多種機器人構型支援（六軸、SCARA、Delta）
   - 軸限制與速度加速度模擬
   - 真實反映機器人運動特性

2. **完整的程式設計能力**
   - 拖拉式視覺化程式設計
   - C# 程式語言支援
   - 流程控制與條件判斷
   - 複雜邏輯整合

3. **降低學習門檻與成本**
   - 視覺化 3D 模擬環境
   - 完整的教學課程與教材
   - 3 所大學實際應用於課程
   - 開源教學專案可參考

4. **工業應用價值**
   - 產線規劃前的模擬驗證
   - 降低專案導入風險
   - 節省實體設備測試成本
   - 多機器人協同作業模擬

5. **跨平台彈性**
   - 開發環境：Windows、macOS
   - 執行環境：桌面、Web、行動裝置
   - 方便展示與分享

6. **多品牌支援**
   - KUKA、ABB、YASKAWA
   - 適用於不同品牌機器人的模擬需求
   - 統一的模擬介面

### 技術成就

RobotSim 從 2018 年 3 月開始開發多機器人同步動作功能，至今已經在教學與工業領域累積了豐富的應用案例。透過 Unity 3D 的跨平台能力與 C# 的程式設計彈性，RobotSim 成為了機器手臂自動化專案的重要模擬工具。

系統採用模組化設計，運動學、指令系統、行為腳本各司其職，易於擴充與維護。單例模式確保系統穩定性，即時更新機制保證模擬流暢度。從教學應用到工業驗證，RobotSim 持續為機器手臂自動化提供可靠的模擬基礎。

---

**專案資訊**

- **開發**：Yaze Lin
- **開發單位**：卓智機器人 Wise Tech Robot
- **開發時間**：2018 年起
- **技術棧**：Unity 3D, C#
- **應用領域**：教學、工業模擬、專案規劃、運動學研究
