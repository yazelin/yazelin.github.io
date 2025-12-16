---
layout: post
title: "CTCUI SMD 全自動智慧檢測系統：WiseTechVision 在 QC 自動化的應用"
subtitle: "整合視覺定位、多面 AOI 檢測與 All-in-One 自動化流程"
date: 2023-06-07
categories: [Computer Vision, KUKA, Automation]
tags: [WiseTechVision, KUKA, AOI, 品質檢測, 自動化, SMD]
---

## 前言

在電子製造業，SMD（Surface Mount Device）元件的品質檢測是生產流程中的關鍵環節。傳統檢測方式依賴人工目視或單點設備檢測，不僅效率低落，也容易因人為因素產生誤判。

本文介紹我們開發的 **CTCUI SMD 全自動智慧檢測系統**，採用雙機器人協同作業，整合了雷刻、壓測、電測、AOI、包裝等完整流程，並在關鍵環節應用 **WiseTechVision** 視覺技術，實現：
- **LDRobot + Eye-in-Hand**：Tube 輸送帶入料視覺定位與自動補正
- **UDRobot + Eye-in-Hand**：4 面 10 種以上 AOI 光學缺陷檢測
- Socket 更換後視覺重新定位（快速換線）

### 專案時程

- **開發時間**：2022 年 11 月 - 2023 年 6 月
- **系統整合**：卓智機器人 Wise Tech Robot
- **首次測試**：2023 年 6 月
- **持續優化**：2023 - 2024 年

---

## 系統展示影片

<a href="http://www.wtech.com.tw/forum/kuka/SMD/%E5%8D%93%E6%99%BA%E6%A9%9F%E5%99%A8%E4%BA%BASMD%20all%20in%20one%20system.mp4">
  <img src="http://www.wtech.com.tw/forum/kuka/SMD/SMD.png" alt="SMD 全自動化系統" style="max-width: 100%; height: auto;">
</a>

*▲ 點擊播放：SMD 雷刻、壓測、電測、AOI、包裝 All in One System*

**更多展示影片：**
- [2023.12.14 系統測試影片](http://www.wtech.com.tw/forum/kuka/SMD/%E5%8D%93%E6%99%BA%E6%A9%9F%E5%99%A8%E4%BA%BASMD%20all%20in%20one%20system_20231214.mp4)

---

## 系統架構

### 完整流程

**雙機器人協同作業：**

```
┌─────────────────────────────────────────────────────────────┐
│ LDRobot（上料機器人 + Eye-in-Hand）                         │
│ Tube輸送帶入料 → Eye-in-Hand定位 → 雷刻 → 壓測 → 放電測站   │
│              ↓                                               │
│       手臂帶相機移動                                         │
│       WiseTech Vision                                        │
│       入料定位、自動對位補正                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    電測站（2台電測系統）
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ UDRobot（檢測機器人）                                        │
│ 電測上方拍頂部 → 抓取 → AOI站翻轉檢測 → 包裝               │
│      ↓                      ↓                                │
│ WiseTech Vision        3面AOI檢測                            │
│ 頂部檢測              （側1、底、側2）                       │
└─────────────────────────────────────────────────────────────┘
```

### 硬體組成

| 元件 | 規格/數量 |
|------|----------|
| **機器手臂** | KUKA KR4 R600 × 2（LDRobot、UDRobot） |
| **控制器** | KR C4 Controller × 2 |
| **視覺系統** | 3 台 IDS 工業相機 + WiseTechVision |
| | - LDCamera：Eye-in-Hand（固定在 LDRobot 手臂上）入料定位 |
| | - UDCamera：Eye-in-Hand（固定在 UDRobot 手臂上）電測站頂部 AOI |
| | - StationCamera：固定式，AOI 站 3 面檢測（側1、底、側2） |
| **光源系統** | 1 台調光器 + 多組光源模組 |
| **雷刻系統** | 雷射雕刻機（含 Marking Mate） |
| **電性測試** | 耐壓測試系統 × 1、電性測試系統 × 2 |
| **檢測模組** | AOI 系統（含光源模組） |
| **其他模組** | Socket 模組、扣壓模組、包裝機 |

### 軟體架構

```
┌─────────────────────────┐
│  CTCUI                  │  ← 中控系統
│  (主控制介面)           │
└──────────┬──────────────┘
           │
           ├─→ ┌─────────────────────┐
           │   │  AOIUI              │  ← AOI 檢測系統
           │   │  (WiseTechVision)   │
           │   └─────────────────────┘
           │
           ├─→ ┌─────────────────────┐
           │   │  Robot Control      │  ← KUKA 機器手臂控制
           │   └─────────────────────┘
           │
           ├─→ ┌─────────────────────┐
           │   │  ATE Systems        │  ← 電測/壓測系統
           │   └─────────────────────┘
           │
           └─→ ┌─────────────────────┐
               │  Laser/Packer       │  ← 雷刻/包裝系統
               └─────────────────────┘
```

---

## WiseTechVision 在 QC 自動化的三大應用

### 1. Tube 入料視覺定位與尺寸檢測（Eye-in-Hand）

**挑戰：**
- SMD 元件從 Tube 倒出到輸送帶，位置與角度不固定
- 需要精確定位並同時檢測尺寸，篩選不良品
- 需要在入料階段就過濾掉尺寸 NG 與角度錯誤的元件

**WiseTechVision 解決方案：**

```
┌─────────────────────────────────────────────┐
│   Tube 供料管倒出 SMD                       │
│                                             │
│   [SMD] [SMD] [SMD] ...  →  輸送帶         │
└──────────────────────┬──────────────────────┘
                       ↓
                   輸送帶運行
                       ↓
              ┌─────────────────┐
              │ 感測器偵測在席  │
              │   (Present)     │
              └────────┬────────┘
                       ↓
              ┌─────────────────┐
              │   靠齊裝置      │
              │   (Aligner)     │
              │ 將SMD推至定位   │
              └────────┬────────┘
                       ↓
              確認對齊完成 (IsAligned)
                       ↓
              ┌─────────────────┐
              │   LDRobot       │
              │ 帶著 IDS 相機   │
              │ (Eye-in-Hand)   │
              │ 移動至SMD上方   │
              └────────┬────────┘
                       ↓
              相機拍照辨識
                       ↓
          ┌─────────────────────┐
          │ WiseTechVision      │
          │ - 輪廓檢測          │
          │ - 位置計算          │
          │ - 角度偵測          │
          └──────────┬──────────┘
                     ↓
          座標補正 (ΔX, ΔY, Δθ)
                     ↓
          機器手臂精確夾取
```

**技術要點：**
- **Eye-in-Hand 配置**：相機固定在 LDRobot 手臂上
- 即時影像擷取與處理
- 輪廓辨識與中心點計算
- 旋轉角度偵測與補正
- **尺寸量測**：同時測量 SMD 長度（Length）與寬度（Width）
- **NG 判定**：尺寸超出公差或角度異常自動判 NG
- 手眼座標轉換至機器手臂坐標系

**實作流程（含 QC 檢測）：**
1. Tube 倒出 SMD 元件到輸送帶
2. 輸送帶運行，感測器偵測元件在席
3. 靠齊裝置（Aligner）動作，將 SMD 推至定位
4. 確認對齊完成
5. LDRobot 帶著相機移動到 SMD 上方
6. IDS 相機拍照，WiseTechVision 處理：
   - 辨識位置與角度
   - **量測尺寸（Length、Width）**
   - **判定是否 NG**
7. **OK**：計算補正量，機器手臂夾取後送往雷刻
8. **NG**：標記 NG 類型（SizeNG 或 WrongAngle），機器手臂夾取後放入 **入料 NG 盤**
9. 入料計數 +1

---

### 2. Socket 更換視覺定位

**挑戰：**
- 產品更換時需更換 Socket（電測/壓測座）
- Socket 更換後位置會有微小偏差
- 傳統方式需人工示教，耗時且精度不穩定

**WiseTechVision 解決方案：**

```
產品切換
   ↓
更換 Socket
   ↓
WiseTechVision 自動掃描
   ↓
辨識 Socket 特徵點
   ↓
計算新座標
   ↓
自動更新機器手臂路徑
```

**技術優勢：**
- **自動化**：無需人工示教，換線時間大幅縮短
- **高精度**：視覺定位誤差小於人工示教
- **可重現**：每次更換 Socket 都能精確定位
- **彈性化**：支援不同產品快速切換

**實作步驟：**
1. 操作人員更換對應產品的 Socket
2. 執行視覺掃描程序
3. WiseTechVision 辨識 Socket 特徵點（定位孔、邊緣等）
4. 計算 Socket 中心座標與角度
5. 系統自動更新測試路徑座標
6. 完成，可開始生產

---

### 3. 4 面 AOI 光學缺陷檢測

**檢測站點：**

| 檢測站 | 機器人 | 檢測面 | 檢測項目 |
|-------|--------|-------|---------|
| **電測站 Top** | UDRobot | 頂部 | 破損、刮傷、印字檢測 |
| | | | *備註：2 台電測系統，每個 SMD 經過其中 1 台* |
| **AOI 站 Side1** | UDRobot | 側面 1 | Pin 腳共平面、破損、刮傷 |
| **AOI 站 Bottom** | UDRobot | 底部 | 歪斜、破損、刮傷、印字 |
| **AOI 站 Side2** | UDRobot | 側面 2 | Pin 腳共平面、破損、刮傷 |

**工作流程：**
1. **LDRobot**：負責入料定位、雷刻、壓測，最後將 SMD 放入電測站
2. **UDRobot**：在電測站拍攝頂部 AOI，抓取後送到 AOI 站翻轉檢測 3 面（側1、底、側2），最後放入包裝機

**10 種以上缺陷檢測：**

1. **刮傷檢測（Scratch）**
   - 檢測表面刮痕
   - 區分正常加工痕跡與異常刮傷

   <img src="http://www.wtech.com.tw/forum/kuka/SMD/SMD_scratch_20240720a.png" alt="刮傷檢測" style="max-width: 500px;">

2. **破損檢測（Broken）**
   - Pin 腳斷裂檢測
   - 本體破損檢測

   <img src="http://www.wtech.com.tw/forum/kuka/SMD/SMD_broken_20240720a.png" alt="破損檢測" style="max-width: 500px;">

3. **共平面度檢測（Coplanarity）**
   - Pin 腳共平面偏差檢測
   - 確保焊接品質

   <img src="http://www.wtech.com.tw/forum/kuka/SMD/SMD_coplane_20240720b.png" alt="共平面檢測" style="max-width: 500px;">

4. **歪斜檢測（Skew）**
   - 元件角度偏移檢測
   - 印字歪斜檢測

   <img src="http://www.wtech.com.tw/forum/kuka/SMD/SMD_skew_20240720d.png" alt="歪斜檢測" style="max-width: 500px;">

5. **印字檢測（Marking）**
   - 雷刻印字清晰度
   - 印字位置偏移
   - 印字內容正確性

6. **尺寸檢測（Dimension）**
   - 長寬高尺寸檢測
   - 公差範圍判定

7. **Pin 腳檢測（Pin Inspection）**
   - Pin 腳數量
   - Pin 腳間距
   - Pin 腳變形

8. **表面污染檢測**
   - 表面異物
   - 污漬檢測

9. **顏色異常檢測**
   - 氧化變色
   - 材料異常

10. **其他缺陷**
    - 毛邊、翹曲等

**Pin 腳檢測影像：**

<table>
<tr>
<td><img src="http://www.wtech.com.tw/forum/kuka/SMD/Side1-2023-05-15-15-42-52.jpg" alt="Side 1 Pin腳檢測" style="max-width: 400px;"></td>
<td><img src="http://www.wtech.com.tw/forum/kuka/SMD/Side2-2023-05-15-15-36-55.jpg" alt="Side 2 Pin腳檢測" style="max-width: 400px;"></td>
</tr>
<tr>
<td align="center"><em>Side 1 Pin 腳檢測</em></td>
<td align="center"><em>Side 2 Pin 腳檢測</em></td>
</tr>
</table>

---

## 核心技術：AOIUI 系統

### 系統架構

**AOIServer 核心：**
```csharp
// 3 台 IDS 工業相機統一管理
// SmartCamera 類別封裝 IDS 工業相機（SmartCameraIDS）
public SmartCamera? LDCamera;      // LD Robot Eye-in-Hand 入料定位相機
public SmartCamera? UDCamera;      // UD Robot Eye-in-Hand 電測站頂部 AOI 相機
public SmartCamera? StationCamera; // AOI 站固定式 3 面檢測相機

// 檢測事件
- VTCheckPoint    // LDRobot 視覺定位檢測點（入料）
- FTCheckPoint    // LDRobot 治具定位檢測點
- PositionSize    // LDRobot 位置與尺寸檢測
- Top1/Top2       // UDRobot 電測站頂部 AOI（2 台電測）
- Side1/Side2     // UDRobot AOI 站側面共平面、破損、刮傷
- Bottom          // UDRobot AOI 站底部歪斜、破損、刮傷
```

**IDS 工業相機特性：**
- IDS peak SDK 整合
- 可程式化 Gain、ExposureTime、FrameRate 控制
- 高速影像擷取（支援即時檢測）
- 色彩校正模式（ColorCorrectionMode）
- 多相機同步管理

**WiseTechVision 模組：**
- 輪廓檢測（Contour Detection）
- 特徵匹配（Feature Matching）
- 多通道影像處理（Channels）
- Pattern 模板比對

### 檢測流程

```
元件進入檢測站
     ↓
觸發檢測事件
     ↓
IDS 工業相機拍照
     ↓
WiseTechVision 影像處理
     ↓
缺陷辨識與判定
     ↓
回傳檢測結果 (OK/NG + 缺陷類型)
     ↓
機器手臂依結果分流
(OK → 下一站, NG → NG 盤)
```

---

## NG 分類與品質追溯系統

### NG 盤分類

系統設置兩種 NG 盤，依 NG 發生階段分別收集：

| NG 盤 | 用途 | NG 類型 |
|------|------|---------|
| **入料 NG 盤** | 入料階段檢出的不良品 | - SizeNG（尺寸超出公差）<br>- WrongAngle（角度錯誤/反向） |
| **電測/AOI NG 盤** | 後段檢測出的不良品 | - VT/FT NG（壓測/電測失敗）<br>- 頂部 AOI NG<br>- 側面 AOI NG<br>- 底部 AOI NG<br>- Empty/Timeout |

### 完整 NG 類型標記

系統對每個 NG 元件進行詳細分類標記（共 20+ 種 NG 類型）：

**入料檢測 NG：**
- `SizeNG`：尺寸超出公差
- `WrongAngle`：角度錯誤（入料反向）

**壓測/電測 NG：**
- `VTNG`：耐壓測試失敗
- `FT1NG` / `FT2NG`：電性測試失敗
- `Empty`：元件不在位置（碰到負極限）
- `Timeout`：設備逾時或錯誤

**頂部 AOI NG：**
- `TopNoLaser`：未檢測到雷刻字
- `TopScratched`：頂部刮傷
- `TopWordShift`：印字偏移

**側面 AOI NG（Side 1 & Side 2）：**
- `Side1LostPin` / `Side2LostPin`：缺 Pin
- `Side1Coplanarity` / `Side2Coplanarity`：共平面度不良
- `Side1Scratched` / `Side2Scratched`：側面刮傷

**底部 AOI NG：**
- `BottomLength`：Pin 腳長度異常
- `BottomAngle`：Pin 腳角度偏移
- `BottomLostPin`：底部缺 Pin
- `BottomScratched`：底部刮傷

### 品質追溯資訊

每個 SMD 元件從入料到包裝，系統完整記錄：

```csharp
public class SMD
{
    public string GUID;                    // 唯一識別碼
    public DateTime StartTime;             // 入料時間
    public SMDLocationType Location;       // 當前位置
    public SMDProcessingStageType Stage;   // 處理階段
    public SMDNGType NGType;              // NG 類型
    public Dictionary<string, string> Data; // 檢測數據
    // - Length, Width (尺寸)
    // - 各站 AOI 檢測結果
    // - 壓測/電測數據
}
```

**追溯能力：**
- 完整記錄每個元件的檢測歷程
- NG 元件可追溯至具體 NG 原因與檢測數據
- 支援生產統計與品質分析
- NG 盤清理時可統計各類 NG 數量

---

## 系統特色

### 1. 雙機器人協同作業

**工作分工明確：**

**LDRobot（上料機器人 + Eye-in-Hand 視覺）：**
- Tube 輸送帶入料 + Eye-in-Hand 視覺定位
- 雷射雕刻（Marking）
- 耐壓測試
- 將 SMD 放入電測座

**UDRobot（檢測機器人）：**
- 電測站頂部 AOI 檢測
- AOI 站翻轉檢測（側1、底、側2）
- Tape Reel 自動包裝

**協同作業優勢：**
- 平行作業，提升產能
- 分工專業化，提高精度
- 降低單一機器人負載
- 縮短作業週期時間

---

### 2. All-in-One 整合

**完整流程自動化：**
- Tube 輸送帶自動入料（Eye-in-Hand 視覺定位）
- 雷射雕刻（Marking）
- 耐壓測試
- 電性測試（2 套系統）
- 4 面 AOI 檢測（Eye-in-Hand + 固定式相機）
- Tape Reel 自動包裝

**優勢：**
- 單一系統完成所有檢測
- 減少人工搬運與等待
- 降低汙染與損壞風險
- 提升整體效率

---

### 3. 視覺自動對位補正

**傳統方式 vs. 視覺對位：**

| 項目 | 傳統治具定位 | WiseTechVision 視覺對位 |
|------|------------|----------------------|
| **換線時間** | 需重新示教，耗時 2-4 小時 | 自動掃描，10-15 分鐘 |
| **精度** | 受人工操作影響 | 高精度，可重現 |
| **彈性** | 需製作專用治具 | 軟體參數調整即可 |
| **Socket 更換** | 人工重新示教 | 視覺自動定位 |
| **維護成本** | 治具磨損需更換 | 無耗材 |

**關鍵技術：**
- AOI 自動對位（入料、Socket 定位）
- 即時座標補正
- 多點校正提升精度

---

### 4. 高穩定性與可靠性

**2024 年 4 月 3 日 花蓮地震驗證：**

> 台灣花蓮近海發生規模 7.2 地震，高雄震度 3-4 級，是自 921 大地震之後最大的地震規模。本系統在地震後當日測試均可正常運作，無任何受損。
>
> 系統使用 **AOI 自動校正** 執行機器手臂各個位置的運動控制位置補償，因此不需要任何額外校正處理，顯見系統耐震能力高且非常穩定、可靠！

**穩定性設計：**
- 視覺自動補正，無需震後重新校正
- 即時位置補償
- 異常檢測與處理機制
- Timeout 流程保護

---

## 技術實作細節

### 1. 入料定位與尺寸檢測流程（Eye-in-Hand）

```csharp
// 入料定位與尺寸檢測事件處理
ReqPositionSize?.Invoke(this, requestEventArgs);

// 流程：
1. Tube 倒出 SMD 元件到輸送帶
2. 輸送帶運行（ConveyorRun）
3. 感測器偵測到元件在席（Present）
4. 靠齊裝置動作（Aligner），將 SMD 推至定位
5. 確認對齊完成（IsAligned）
6. LDRobot 帶著 IDS 相機移動到 SMD 上方
7. 觸發視覺檢測（Eye-in-Hand 相機拍照）
8. WiseTechVision 處理影像：
   - Position()：輪廓檢測，計算位置與角度
   - 量測尺寸：PositionLength、PositionWidth
   - 尺寸公差判定：超出範圍拋出 SizeNGException
   - 角度判定：異常角度拋出 WrongAngleException

9. 【OK 流程】
   - 計算補正量 (ΔX, ΔY, Δθ)
   - 回傳：OKOffset(PositionSize, frame, Length, Width)
   - 機器手臂微調位置後精確夾取
   - 送往雷刻站

10. 【NG 流程】
    - 標記 NG 類型（SizeNG 或 WrongAngle）
    - 回傳：NGOffset(PositionSize, frame, NGType, Length, Width)
    - 機器手臂夾取
    - 放入入料 NG 盤（SizeVTNGTray）

11. 入料計數 +1，記錄檢測數據
```

### 2. AOI 檢測流程

```csharp
// UDRobot 多面 AOI 檢測事件
ReqTop1?.Invoke(this, requestEventArgs);   // 電測站 1 頂部
ReqTop2?.Invoke(this, requestEventArgs);   // 電測站 2 頂部
ReqSide1?.Invoke(this, requestEventArgs);  // AOI 站側面 1
ReqSide2?.Invoke(this, requestEventArgs);  // AOI 站側面 2
ReqBottom?.Invoke(this, requestEventArgs); // AOI 站底部

// 檢測流程：
1. 【電測站頂部檢測 - Eye-in-Hand】
   - SMD 在電測座上
   - UDRobot 帶著 IDS 相機移動到 SMD 上方（Eye-in-Hand）
   - UDCamera 拍照
   - WiseTechVision 檢測頂部破損、刮傷、印字
   - UDRobot 抓取 SMD

2. 【AOI 站翻轉檢測 - 固定式相機】
   - UDRobot 將 SMD 送到 AOI 站
   - 固定式 StationCamera 檢測 3 面：
     a. 側面 1：Pin 腳共平面、破損、刮傷
     b. 底部：歪斜、破損、刮傷、印字
     c. 側面 2：Pin 腳共平面、破損、刮傷

3. 【每次檢測步驟】
   - 調整光源（LightController）
   - IDS 工業相機擷取影像（Eye-in-Hand 或固定式）
   - WiseTechVision 影像處理（輪廓檢測、特徵匹配、缺陷辨識）
   - 判定 OK/NG + 缺陷類型
   - 回傳結果並記錄 Log
```

### 3. Socket 定位流程

```csharp
// 產品切換時
1. 操作人員更換 Socket
2. 執行 Socket 掃描程序
3. WiseTechVision 辨識 Socket 特徵
   - 定位孔
   - 邊緣輪廓
   - 關鍵特徵點
4. 計算新座標 Offset
5. 更新產品配置 (Product.UserOffsetParameter.LDFT1/LDFT2)
6. 儲存至 SystemData
7. 機器人自動套用新的 Offset
8. 完成，可開始生產
```

---

## 系統效益

### 品質提升

| 檢測項目 | 人工檢測 | CTCUI 自動檢測 |
|---------|---------|---------------|
| **檢出率** | 85-90%（受疲勞影響） | 95%+（穩定） |
| **誤判率** | 5-10% | < 2% |
| **檢測速度** | 3-5 秒/件 | 1-2 秒/件 |
| **一致性** | 因人而異 | 標準化 |
| **可追溯性** | 困難 | 完整記錄 |

### 效率提升

- **換線時間**：從 2-4 小時縮短至 10-15 分鐘（視覺自動定位）
- **檢測速度**：提升 50%+
- **人力需求**：從 3-4 人降至 1 人（監控）
- **24 小時運作**：無人化夜間生產

### 成本效益

- **初期投資**：視覺系統 + 機器手臂 + 檢測設備
- **長期效益**：
  - 減少人力成本
  - 降低不良品流出
  - 提升客戶滿意度
  - 減少治具製作與維護成本

---

## 技術挑戰與解決方案

### 挑戰 1：多面檢測的光源控制

**問題：**
- 不同檢測面需要不同光源配置
- 反光、陰影影響辨識精度

**解決方案：**
- 可程式調光器（LightController）
- 每個檢測站獨立光源配置
- 軟體控制光源強度與角度
- 多角度打光減少陰影

---

### 挑戰 2：即時性要求

**問題：**
- 生產線節拍要求快速檢測
- 影像處理耗時影響效率

**解決方案：**
- 設定適當 ROI（Region of Interest）
- 優化影像處理演算法
- Timeout 機制確保流程不卡死

---

### 挑戰 3：不同產品快速切換

**問題：**
- 不同 SMD 產品尺寸、形狀、檢測標準不同
- 傳統方式換線耗時

**解決方案：**
- Recipe 管理系統
- 產品參數資料庫（ProductManager）
- 視覺自動定位（無需人工示教）
- 一鍵切換產品配置

```csharp
// 產品切換
ReqProduct?.Invoke(this, requestEventArgs);

// 系統自動：
1. 載入產品 Recipe
2. 更新檢測參數
3. Socket 視覺定位
4. 調整光源配置
5. 完成，可生產
```

---

## 技術資源

### CTCUI 系統

- [台灣機器人資訊平台 - SMD 全自動智慧檢測系統](http://forum.wtech.com.tw/viewtopic.php?t=219)
- [卓智機器人官網](http://www.wtech.com.tw/)

### WiseTechVision 相關專案

- [散亂螺絲自動整列]({% post_url 2020-07-20-wisetech-vision-screw-sorting %}) - 動態追蹤應用
- [機器手臂同步追蹤工件](http://forum.wtech.com.tw/viewtopic.php?t=182) - ConveyTech 應用

### 技術文件

- [Emgu CV 官方文件](http://www.emgu.com/wiki/index.php/Main_Page)
- [KUKA 官方教學](https://www.kuka.com/)

---

## 結語

CTCUI SMD 全自動智慧檢測系統展示了 **WiseTechVision** 在品質檢測自動化領域的強大應用能力。

### 核心價值

1. **雙機器人協同作業**
   - LDRobot 專注上料與前段加工
   - UDRobot 專注檢測與包裝
   - 平行作業提升產能與效率

2. **Eye-in-Hand 視覺定位技術**
   - Tube 輸送帶入料自動定位（LDRobot + Eye-in-Hand）
   - 電測站頂部 AOI 檢測（UDRobot + Eye-in-Hand）
   - Socket 更換視覺重新定位
   - 大幅縮短換線時間，提升彈性

3. **全方位 QC 檢測與追溯**
   - 入料階段：尺寸檢測 + 角度判定（LDRobot）
   - 4 面 AOI：20+ 種缺陷檢測（UDRobot）
   - 完整 NG 分類標記與品質追溯
   - 高檢出率、低誤判率

4. **All-in-One 整合**
   - 從入料到包裝完整自動化
   - 單一系統完成所有檢測
   - 2 種 NG 盤分類收集不良品
   - 提升整體效率與品質

### 技術突破

- **雙機器人協同**：創新的工作分工設計，提升系統產能與可靠性
- **Eye-in-Hand 視覺配置**：雙機器人均採用手眼配置，靈活適應不同工站
- **IDS 工業相機應用**：整合 IDS peak SDK，實現高速、高精度影像檢測
- **視覺自動對位**：取代傳統治具與人工示教，大幅提升彈性
- **系統整合能力**：成功整合雙機器人、多套測試設備與 3 台視覺相機

### 應用展望

這套系統的技術可延伸應用至：
- 其他電子元件檢測
- 精密零件品質檢測
- 多工序自動化整合
- 智慧製造與工業 4.0

---

**專案資訊**

- **系統開發**：Yaze Lin
- **系統整合**：卓智機器人 Wise Tech Robot
- **開發時程**：2022.11 - 2023.06
- **專案連結**：[GitHub - CTCUI](https://github.com/yazelin/CTCUI)（Private）
