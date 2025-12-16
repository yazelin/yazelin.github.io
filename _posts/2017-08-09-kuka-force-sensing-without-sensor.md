---
layout: post
title: "KUKA 機器手臂力覺感知技術：不外掛 Sensor 的扭力檢測應用"
subtitle: "自主開發 KRL 力覺感知程式，實現低成本、高可靠性的力道檢測"
date: 2017-08-09
categories: [KUKA, Automation]
tags: [KUKA, 力覺感知, Force Sensing, KRL, 自動化]
---

## 前言

在工業自動化領域，**力覺感知（Force Sensing）** 是實現精密組裝與安全防護的關鍵技術。傳統方案需要在機器手臂上外掛昂貴的六軸力覺感測器（Force/Torque Sensor），成本高達數十萬元，且需要額外的校正與維護。

本文介紹我們自主開發的 **KUKA 機器手臂力覺感知技術**，不需外掛 sensor，僅透過**手臂自身的關節扭力感測**，配合自行撰寫的 KRL 程式擴充，即可實現力道檢測、防撞保護與異常處理功能。

---

## 技術突破

### 不外掛 Sensor 的力覺感知

KUKA 機器手臂的每個關節都配備有**扭力感測器（Torque Sensor）**，用於監控馬達電流與關節負載。透過分析這些扭力數據，可以判斷手臂在運動過程中是否遇到異常阻力。

**核心技術：**
- ✅ **零硬體成本**：利用 KUKA 自身的關節扭力感測
- ✅ **高可靠性**：無外掛元件，不易損壞
- ✅ **易於整合**：純軟體實作，不影響機械結構
- ✅ **彈性應用**：可依不同場景調整靈敏度

**關鍵優勢：**
- **費用不到 Force Sensor 價格的一半**
- **當日安裝、設定、測試，當日即可投產**
- **Sensing Update Rate < 20ms**
- **XYZABC 軸向力覺感知**

---

## 與傳統方案比較

| 項目 | 外掛六軸力覺感測器 | KUKA 扭力感測方案 |
|------|------------------|------------------|
| **硬體成本** | NT$ 300,000 - 800,000 | NT$ 0（軟體開發） |
| **安裝時間** | 需拆裝手臂，2-4 小時 | 當日安裝、設定、測試 |
| **維護成本** | 感測器易損壞，維修費高 | 無額外維護 |
| **投產速度** | 需校正與調試 | **當日即可投產** |
| **系統複雜度** | 需額外控制器與訊號線 | 純軟體實作 |

---

## 應用案例

這項技術已成功應用於 **4 個專案**，涵蓋插件組裝、深度感測、堆疊作業、防撞保護等場景：

### 1. 記憶卡插件力道感測（2017）

<a href="http://www.wtech.com.tw/forum/kuka/pcb_assembling/PluginDemo_20170809.m4v">
  <img src="http://www.wtech.com.tw/forum/kuka/pcb_assembling/assembly_g.png" alt="記憶卡插件" style="max-width: 500px;">
</a>

**應用：** 2017 自動化展，記憶卡插件反向錯放偵測
**技術：** 插入阻力異常偵測，即時停止並分揀 NG 件
**機器手臂：** KUKA KR6 R900

[詳細介紹]({% post_url 2017-08-09-kuka-force-sensing-memory-card %}) | [論壇專案](http://forum.wtech.com.tw/viewtopic.php?t=172)

---

### 2. PCB 來料深度感測（2020）

<a href="http://www.wtech.com.tw/forum/kuka/pcb_load_unload/TCI_PCB.m4v">
  <img src="http://www.wtech.com.tw/forum/kuka/pcb_load_unload/PCB%20load_unload.png" alt="PCB深度感測" style="max-width: 500px;">
</a>

**應用：** PCB 板材深度判定與精確吸取
**技術：** 接觸力偵測（±6N），自動適應料盤深度變化
**機器手臂：** KUKA KR 3 R540

[詳細介紹]({% post_url 2020-06-05-kuka-force-sensing-pcb-depth %}) | [論壇專案](http://forum.wtech.com.tw/viewtopic.php?t=171)

---

### 3. Tray 盤取放堆疊（2020）

<a href="http://www.wtech.com.tw/forum/force/tray_stack/Force_sensing_3498.m4v">
  <img src="http://www.wtech.com.tw/forum/force/tray_stack/Force_sensing_wisetech.png" alt="Tray盤堆疊" style="max-width: 500px;">
</a>

**應用：** 來料深度感測 + 堆疊高度判斷
**技術：** 雙向深度感測，取代視覺系統
**機器手臂：** KUKA KR 6 R700

[詳細介紹]({% post_url 2020-06-18-kuka-force-sensing-tray-stack %}) | [論壇專案](http://forum.wtech.com.tw/viewtopic.php?t=176)

---

### 4. 散亂螺絲整列防撞保護（2020）

<a href="http://www.wtech.com.tw/forum/kuka/conveyor_tracking/高雄自動化控制展20200717.m4v">
  <img src="http://www.wtech.com.tw/forum/kuka/conveyor_tracking/高雄自動化控制展20200717.png" alt="螺絲整列" style="max-width: 500px;">
</a>

**應用：** 2020 高雄自動化展，夾取異常不停機
**技術：** 力覺防撞保護 + WiseTechVision 視覺整合
**機器手臂：** KUKA KR6 R900-2

[詳細介紹]({% post_url 2020-07-20-wisetech-vision-screw-sorting %}) | [論壇專案](http://forum.wtech.com.tw/viewtopic.php?t=183)

---

## 應用場景總覽

| 應用類型 | 偵測目標 | 力道特性 | 典型應用 | 參考文章 |
|---------|---------|---------|---------|---------|
| **插件組裝** | 插入阻力異常 | 中力道（10-20N） | 記憶卡、CPU、連接器 | [連結]({% post_url 2017-08-09-kuka-force-sensing-memory-card %}) |
| **深度感測** | 接觸力（表面偵測） | 低力道（3-6N） | PCB、板材、料盤 | [連結]({% post_url 2020-06-05-kuka-force-sensing-pcb-depth %}) |
| **堆疊作業** | 雙向深度感測 | 低力道（5-9N） | Tray盤、料盤管理 | [連結]({% post_url 2020-06-18-kuka-force-sensing-tray-stack %}) |
| **防撞保護** | 碰撞偵測 | 中力道（12-15N） | 夾取、移動、定位 | [連結]({% post_url 2020-07-20-wisetech-vision-screw-sorting %}) |

---

## 延伸應用

力覺感知技術可應用於多種工業場景：

### 1. 精密組裝
- 電子元件插件（CPU、記憶卡、連接器）
- 機械零件壓入（軸承、油封、插銷）
- 卡扣組裝（塑膠件、外殼）

### 2. 防撞保護
- 夾取散亂工件（防止夾爪撞擊）
- 狹小空間作業（防止手臂碰撞）
- 人機協作（安全防護）

### 3. 深度感測
- 板材取放（PCB、玻璃、金屬板）
- 料盤深度檢測
- 堆疊高度偵測

### 4. 品質檢測
- 插入力道檢測（判定組裝品質）
- 異常件篩選（尺寸過大/過小）
- 組裝完整性驗證（插到底判定）

---

## 系統效益

### 成本優勢

| 項目 | 外掛力覺感測器 | KUKA 扭力感測 | 節省 |
|------|--------------|-------------|------|
| **硬體成本** | NT$ 300,000 - 800,000 | NT$ 0 | **100%** |
| **安裝費用** | NT$ 20,000 - 50,000 | NT$ 0 | **100%** |
| **年維護費** | NT$ 30,000 - 80,000 | NT$ 0 | **100%** |

### 實際效益

**4 個專案驗證成果：**
- ✅ **記憶卡插件**：反向錯放偵測 100%，防止元件損壞
- ✅ **PCB 深度感測**：精度 ±0.5mm，無損壞 PCB
- ✅ **Tray 盤堆疊**：無需視覺系統，節省成本 50%+
- ✅ **螺絲整列**：異常不停機，產線穩定率 95%+

---

## 技術資源

### 力覺感知系列文章

1. **力覺感知技術總覽**（本文）- 核心技術與應用總覽
2. [記憶卡插件力道感測]({% post_url 2017-08-09-kuka-force-sensing-memory-card %}) - 2017 自動化展
3. [PCB 來料深度感測]({% post_url 2020-06-05-kuka-force-sensing-pcb-depth %}) - PCB 板材吸取
4. [Tray 盤取放堆疊]({% post_url 2020-06-18-kuka-force-sensing-tray-stack %}) - 料盤堆疊應用
5. [散亂螺絲整列]({% post_url 2020-07-20-wisetech-vision-screw-sorting %}) - 力覺 + 視覺整合

### 論壇專案連結

- [機器手臂記憶插件力道感測與處理](http://forum.wtech.com.tw/viewtopic.php?t=172)
- [機器手臂力覺感知 PCB 來料深度](http://forum.wtech.com.tw/viewtopic.php?t=171)
- [Tray 盤取放堆疊力覺感知應用](http://forum.wtech.com.tw/viewtopic.php?t=176)
- [機器手臂同步追蹤動態工件力覺應用](http://forum.wtech.com.tw/viewtopic.php?t=183)

### 技術支援

- [台灣機器人資訊平台](http://forum.wtech.com.tw/) - 更多專案與技術討論
- [卓智機器人官網](http://www.wtech.com.tw/) - 系統諮詢與技術支援

---

## 結語

**KUKA 機器手臂力覺感知技術**展示了透過**軟體創新突破硬體限制**的技術價值。

### 核心價值

1. **低成本方案**
   - 不外掛昂貴的六軸力覺感測器
   - 節省 30-80 萬硬體成本
   - 無額外維護費用

2. **軟體技術突破**
   - 自主開發 KRL 力覺感知函式庫
   - 提供簡易 API，易於整合
   - 可快速複製至其他專案

3. **實用性驗證**
   - **4 個專案實戰驗證**
   - 涵蓋插件、深度感測、堆疊、防撞等場景
   - 多個展覽與產線應用

4. **彈性應用**
   - 適用於精密組裝、防撞保護、品質檢測
   - 可依不同應用調整靈敏度與閾值
   - 純軟體實作，無硬體限制

### 技術突破

這項技術的關鍵在於**充分利用 KUKA 機器手臂的既有功能**，透過軟體演算法實現原本需要昂貴硬體才能達成的功能。這種「軟體補償硬體」的思維，在工業自動化領域具有重要的實踐價值。

---

**專案資訊**

- **技術開發**：Yaze Lin
- **系統整合**：卓智機器人 Wise Tech Robot
- **專案數量**：4 個應用案例
- **專案年份**：2017 - 2020 年
