---
layout: post
title: "亞洲大學 2020 - KUKA 機器手臂與 Leap Motion 手勢控制"
subtitle: "Unity + Leap Motion + 工業機器手臂整合實作"
tags: [教學, Unity, Robot, LeapMotion, KUKA, EKI, RSI]
date: 2020-11-11
categories: [教學, RobotSim, KUKA, LeapMotion]
---

## 工作坊簡介

這是 2020 年在亞洲大學舉辦的 **KUKA 機器手臂與 Leap Motion** 整合工作坊，教授如何使用手勢控制工業機器手臂，實現人機互動的創新應用。

### 工作坊特色

**核心技術整合：**
- **Unity 3D**：跨平台開發環境
- **Leap Motion**：手勢辨識裝置
- **KUKA 機器手臂**：工業六軸機械臂
- **EKI / RSI**：KUKA 網路通訊介面

**實現效果：** 使用手掌動作即時控制工業機器手臂，讓機械臂跟隨手部運動

---

## 技術架構

### 系統架構圖

```
[手掌動作] → [Leap Motion Controller]
                    ↓ USB
                [PC - Unity]
        - Leap Motion SDK 手勢辨識
        - 座標轉換與運動規劃
        - TCP/IP Client
                    ↓ Ethernet
            [KUKA Robot Controller]
        - EKI / RSI Server
        - KRL 程式控制
                    ↓
        [KUKA KR6 R700-2 機器手臂實機動作]
```

### 硬體配置

**設備清單：**
- **機器手臂**：KUKA KR6 R700-2（六軸工業機器人）
- **手勢感測器**：Leap Motion Controller
- **電腦**：Windows PC（運行 Unity 程式）
- **連接方式**：
  - USB 線：Leap Motion ↔ PC
  - 網路線：PC ↔ 機器手臂控制器

### 軟體技術棧

**開發工具：**
- **Unity**：遊戲引擎 / 跨平台開發環境
  - [Unity 官網](https://store.unity.com/#plans-individual)

- **Leap Motion SDK**：手勢辨識軟體開發套件
  - [Leap Motion Unity SDK](https://developer.leapmotion.com/unity)

**機器手臂程式：**
- **KRL (KUKA Robot Language)**：機器手臂控制語言
  - [KRL 語法說明文件](http://www.wtech.com.tw/public/download/manual/kuka/krc4/KUKA%20KRL-Syntax%208.x.pdf)

- **EKI (Ethernet KRL Interface)**：KUKA 網路通訊介面
  - [EKI 說明文件](http://www.wtech.com.tw/public/download/manual/kuka/krc4/KST-Ethernet-KRL-21-En.pdf)
  - 使用 XML 格式進行資料交換
  - 適合非即時控制應用

- **RSI (Robot Sensor Interface)**：機器人感測器介面
  - 即時控制介面（週期 4ms 或 12ms）
  - 適合流暢的連續運動控制
  - [參考連結](http://forum.wtech.com.tw/viewtopic.php?f=2&t=158)

---

## 工作坊內容

### 一、KUKA 機器手臂基礎

```
工欲善其事，必先利其器
```

**學習內容：**

1. **六軸機器手臂結構**
   - **軸向**：A1 ~ A6（六個旋轉軸）
   - **工作範圍**：每個軸的運動極限
   - **負載能力**：KR6 R700-2（負載 6kg，工作半徑 700mm）

2. **座標系統**
   - **Base 空間**：機器手臂基座坐標系
   - **Tool 空間**：工具端坐標系
   - **World 空間**：世界坐標系
   - 座標轉換與空間定位

3. **操作方式**
   - **XYZ ABC**：笛卡爾座標（位置 + 姿態）
   - **AXIS**：關節角度控制

4. **運動指令**
   - **PTP (Point-to-Point)**：點對點運動
   - **LIN (Linear)**：直線運動
   - **CIRC (Circular)**：圓弧運動

5. **KUKA SmartPAD 教導器**
   - 教導器介面操作
   - 手動教點功能
   - 程式執行與監控

### 二、Leap Motion 手勢辨識

```
科技始終來自於人性
```

**Leap Motion Controller 介紹：**
- **原理**：使用紅外線感測器追蹤手部動作
- **精度**：可辨識手指、手掌位置與姿態
- **應用**：手勢控制、虛擬實境、人機互動

**Leap Motion 特性：**
- 非接觸式操作
- 高精度手部追蹤
- 即時反饋（低延遲）
- 直覺的操作方式

**Unity 整合：**
- Leap Motion SDK for Unity
- Hand Model 手部模型
- Gesture Recognition 手勢辨識
- 座標映射與轉換

### 三、通訊與整合

```
溝通是成功的基礎
```

**通訊方式比較：**

| 特性 | EKI | RSI |
|------|-----|-----|
| **類型** | 非即時通訊 | 即時通訊 |
| **週期** | 無固定週期 | 4ms / 12ms |
| **格式** | XML | XML |
| **適用** | 一般控制 | 連續運動控制 |
| **流暢度** | 較低 | 高 |

**EKI 通訊實作：**
1. **手臂端設定檔**：定義 TCP Server 與 XML 格式
2. **手臂端程式**：KRL 程式接收命令並控制手臂
3. **PC 端程式**：Unity C# 程式發送手部位置資料

**RSI 通訊實作：**
- 更高頻率的資料交換
- 實現更流暢的跟隨動作
- 需要更精確的同步控制

### 四、實作專案：手勢控制機器手臂

**專案流程：**

1. **Leap Motion 手勢擷取**
   - 在 Unity 中整合 Leap Motion SDK
   - 取得手掌位置與姿態
   - 過濾雜訊與異常數據

2. **座標轉換與映射**
   - Leap Motion 座標系 → Unity 座標系
   - Unity 座標系 → 機器手臂座標系
   - 縮放比例調整（手部運動範圍 vs 手臂工作範圍）

3. **網路通訊開發**
   - Unity TCP Client 實作
   - XML 資料格式封裝
   - Socket 連線管理

4. **機器手臂程式開發**
   - KRL 程式架構
   - EKI Server 設定
   - 運動控制邏輯

5. **整合測試與優化**
   - 通訊延遲優化
   - 運動平滑處理
   - 安全限制設定

---

## 工作坊特色

### 1. 跨領域技術整合

整合多個領域的技術：
- **遊戲開發**：Unity 3D 引擎
- **體感互動**：Leap Motion 手勢辨識
- **工業自動化**：KUKA 機器手臂
- **網路通訊**：TCP/IP、XML

### 2. 實際硬體操作

不只是軟體模擬，而是**真實的機器手臂實機操作**：
- 實際感受工業級設備
- 學習安全操作規範
- 理解實機與模擬的差異

### 3. 創新應用展示

展示機器手臂在互動領域的應用可能性：
- 手勢控制
- 體感互動
- 人機協作
- 創意展演

### 4. 完整的開源資源

提供完整的程式碼與教學資源：
- 手臂端 KRL 程式下載
- PC 端 Unity 專案下載
- EKI 設定檔範例
- 影片示範

---

## 學習成果

學員將學會：

1. **KUKA 機器手臂操作**
   - 六軸機器人基本原理
   - 座標系統與運動控制
   - SmartPAD 教導器使用

2. **Leap Motion 開發**
   - Leap Motion SDK 使用
   - 手勢辨識技術
   - Unity 整合開發

3. **網路通訊技術**
   - EKI / RSI 通訊協定
   - TCP/IP Socket 程式設計
   - XML 資料格式處理

4. **系統整合能力**
   - 硬體設備整合
   - 座標轉換與映射
   - 即時控制系統開發

5. **創新思維**
   - 跨領域技術應用
   - 問題分析與解決
   - 創意應用開發

---

## 實作資源

**程式下載：**
- [手臂端設定檔 (EKI XML)](./src/LeapMotion/LeepRobotServer.xml)
- [手臂端程式 (KRL)](./src/LeapMotion/LeapMotionRobot.zip)
- [PC 端程式 (Unity)](./src/LeapMotion/LeapMotionExample.zip)

**參考影片：**
- [Demo 影片 1](https://www.facebook.com/wisetech.dakuo/videos/1212236958861791/)
- [Demo 影片 2](https://www.facebook.com/wisetech.dakuo/videos/1225804447505042/)
- [6 分鐘快速簡介](https://www.youtube.com/embed/3UZCKB1lnW4)

**線上模擬器：**
- [RobotSim WebPlayer](http://www.wtech.com.tw/robotsim/demo)
  - 可線上體驗機器手臂模擬
  - 學習座標系統與運動指令
  - 無需安裝，瀏覽器即可使用

---

## 工作坊資源

**完整教學網站：**
[https://yazelin.github.io/asia2020-RobotLeapMotion/](https://yazelin.github.io/asia2020-RobotLeapMotion/)

**GitHub 開源專案：**
[https://github.com/yazelin/asia2020-RobotLeapMotion](https://github.com/yazelin/asia2020-RobotLeapMotion)

**相關技術討論：**
- [EKI 通訊方式討論](http://forum.wtech.com.tw/viewtopic.php?f=2&t=38)
- [RSI 通訊方式討論](http://forum.wtech.com.tw/viewtopic.php?f=2&t=158)

**相關連結：**
- [RobotSim 技術詳解]({% post_url 2018-03-01-robotsim-unity-robot-simulation %})
- [嘉南藥理大學 RobotSim 課程]({% post_url 2018-04-16-cnu2018-RobotSim %})
- [實踐大學機器手臂課程]({% post_url 2019-03-13-usc2019-RobotSim %})
- [亞洲大學 RobotSim 工作坊]({% post_url 2020-11-11-asia2020-RobotSim %})

---

**工作坊資訊**
- **學校**：亞洲大學
- **主題**：KUKA 機器手臂與 Leap Motion 手勢控制
- **時間**：2020 年 11 月
- **講師**：Yaze Lin
- **特色**：跨領域技術整合、實機操作、創新應用、完整開源資源
